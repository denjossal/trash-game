// socket.ts — PartySocket wrapper for the client half of the §11.3 identity seam (Story 1.5).
// Responsibilities THIS story ships:
//   1. Construct PartySocket with auto-reconnect DISABLED (issuance seam only — see below).
//   2. Persist the server-issued session token to localStorage; load it back.
//   3. Build a joinRoom intent that echoes the stored token (joinRoom.payload.sessionToken).
//
// NOT this story (Stories 1.6/1.7/1.9a/1.10): the live send/receive loop, the read-only tableState
// store in main.ts, the surface router in App.svelte. This module is created but intentionally NOT
// mounted into App.svelte yet. No outbound `socket.send(...)` here — GATE 1 (eslint.config.js) bans
// `.send`/`.broadcast` repo-wide except server/src/push-state.ts, and the outbound intent loop belongs
// to the later connection-flow stories regardless. [Source: architecture.md#Complete-Project-Directory-Structure
// — client/src/socket.ts; AR-12; §11.3; shared/src/types.ts joinRoom Intent.]
import { PartySocket } from "partysocket";
import type { Intent } from "@trash/shared";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LEN } from "@trash/shared";

/** Single localStorage key for the persisted session token (do not scatter the string). */
export const SESSION_TOKEN_KEY = "trash.sessionToken";

/** Guarded so it never throws under SSR / test / PWA-precache contexts where localStorage is absent. */
function hasLocalStorage(): boolean {
  return typeof localStorage !== "undefined";
}

// The `typeof` guard covers the ABSENT case (SSR / test / precache). It does NOT cover the
// PRESENT-but-throws cases: getItem/setItem raise SecurityError when storage access is denied
// (Safari private-browsing, blocked third-party storage, sandboxed iframe) and setItem raises
// QuotaExceededError when the quota is full — `localStorage` is defined in all of those. The
// session token is a best-effort reconnect convenience, never required for correctness, so on any
// access failure we degrade to "no stored token" rather than letting the throw break the join flow.

/** Read the persisted session token, or null if none stored / storage unavailable / access denied. */
export function loadSessionToken(): string | null {
  if (!hasLocalStorage()) return null;
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Persist the server-issued session token for echo on a subsequent joinRoom (AC-1.5.2). No-op on access failure. */
export function persistSessionToken(token: string): void {
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(SESSION_TOKEN_KEY, token);
  } catch {
    // Storage denied or quota exceeded — the token is a best-effort convenience; drop it silently.
  }
}

/**
 * Build a `joinRoom` intent, echoing the stored session token when one exists (AC-1.5.2).
 * Omit-when-absent (architecture serialization rule): on a fresh first join with no stored token,
 * the `sessionToken` key is left OFF the payload — never set to `undefined`.
 * [Source: shared/src/types.ts joinRoom Intent; architecture.md "omit a key when ABSENT".]
 */
export function buildJoinRoomIntent(code: string, name: string): Extract<Intent, { type: "joinRoom" }> {
  const sessionToken = loadSessionToken();
  return {
    type: "joinRoom",
    payload: sessionToken ? { code, name, sessionToken } : { code, name },
  };
}

// --- Story 1.6: createRoom candidate-code + intent ---
//
// The Room Code is server-AUTHORITATIVE via claim-on-create, but a DO cannot name itself — the name
// comes from the URL the client connects to. So the CLIENT picks a CANDIDATE code, connects to
// /parties/table/<candidate>, and the addressed DO either self-claims or rejects (already-claimed); on
// a reject the client regenerates + reconnects (see createRoomWithRetry). The candidate generator draws
// from the SAME frozen ROOM_CODE_ALPHABET/ROOM_CODE_LEN the server uses — one source of truth, so client
// and server can never diverge on the alphabet. [Source: architecture.md D7; 1-1-spike-findings AC1.]

const ALPHABET_LEN = ROOM_CODE_ALPHABET.length;
const MAX_UNBIASED_BYTE = Math.floor(256 / ALPHABET_LEN) * ALPHABET_LEN; // rejection-sampling threshold

/** Generate a candidate Room Code (4 unbiased letters from the ambiguity-safe alphabet). Mirrors the
 *  server's room-code.ts generator; uses the browser WebCrypto `crypto.getRandomValues` global. */
export function generateCandidateCode(): string {
  let code = "";
  while (code.length < ROOM_CODE_LEN) {
    const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LEN));
    for (const byte of bytes) {
      if (byte >= MAX_UNBIASED_BYTE) continue; // reject biased byte; redraw.
      code += ROOM_CODE_ALPHABET[byte % ALPHABET_LEN];
      if (code.length === ROOM_CODE_LEN) break;
    }
  }
  return code;
}

/** Build a `createRoom` intent. Payload is `{name}` only — the contract is frozen (no token/code field;
 *  the server issues the host identity, and the candidate code rides the connection URL, not the payload). */
export function buildCreateRoomIntent(name: string): Extract<Intent, { type: "createRoom" }> {
  return { type: "createRoom", payload: { name } };
}

/**
 * Construct the per-Table PartySocket with auto-reconnect DISABLED (AC-1.5.3).
 *
 * partysocket (1.2.0) reconnects automatically by default; `maxRetries: 0` means a dropped socket is
 * NOT retried. (We do NOT use `startClosed` — that would suppress the INITIAL connection too; we want
 * the first connect, just no auto-reconnect after a blip.) RECONNECT DISABLED — the reconnection FLOW
 * (session resumption, retry UX) is an explicit MVP non-goal (AR-12 / §11.3); only the issuance seam
 * ships now. [Source: node_modules/partysocket Options.maxRetries; architecture.md socket.ts description.]
 *
 * Host/URL comes from `import.meta.env.VITE_WS_URL` (never hard-coded). `room` is the Room Code.
 */
export function createSocket(room: string): PartySocket {
  return new PartySocket({
    host: import.meta.env.VITE_WS_URL ?? "",
    room,
    maxRetries: 0, // RECONNECT DISABLED (AR-12 / §11.3) — see doc comment above.
  });
}

/** How long one attempt waits for a server reply before treating the connection as dead and retrying. */
const CREATE_ROOM_ATTEMPT_TIMEOUT_MS = 10_000;

/**
 * Create a Table with transparent claim-conflict retry (AC-1.6.2). Picks a candidate code, connects,
 * sends `createRoom{name}`, and resolves with the connected socket + the granted Room Code once a
 * `tableState` arrives. On a claim conflict the server replies with an `error` (a real ~1-in-200k
 * collision); we close, regenerate a fresh candidate, and retry — the human never sees a failure.
 *
 * FAILURE HANDLING: every way an attempt can fail — a server `error`, the socket closing before any
 * reply, a transport `error` event, or no reply at all within the timeout — funnels through one
 * `failAttempt` path that tears down the socket and either retries with a fresh candidate or rejects
 * once attempts are exhausted. Without this, a socket that never opens (server down / bad VITE_WS_URL —
 * and with `maxRetries: 0` there is no auto-reconnect), closes mid-flight (DO eviction), or stays silent
 * would leave the returned Promise pending forever and leak the listeners. The retry counter advances on
 * ANY failure mode, not just `error` replies, so exhaustion is always reachable. [Review: socket hang +
 * listener leak; blind+edge hunter.]
 *
 * On the returned `tableState` the caller renders the lobby (the surface router is Stories 1.9a/1.10 —
 * this helper is NOT mounted into App.svelte yet; it ships the wiring). Reconnect stays disabled
 * (`maxRetries: 0`); the session token is issued + delivered with the reconnect FLOW (Story 1.7+),
 * not here. [Source: architecture.md D7 claim-on-create; 1-1-spike-findings AC1; ServerEvent union.]
 */
export function createRoomWithRetry(
  name: string,
  maxAttempts = 5,
): Promise<{ socket: PartySocket; code: string }> {
  return new Promise((resolve, reject) => {
    const attempt = (remaining: number): void => {
      const code = generateCandidateCode();
      const socket = createSocket(code);
      let settled = false; // guard so a late close/error after success/handoff is a no-op.

      const cleanup = (): void => {
        clearTimeout(timer);
        socket.removeEventListener("message", onMessage);
        socket.removeEventListener("open", onOpen);
        socket.removeEventListener("close", onFailure);
        socket.removeEventListener("error", onFailure);
      };

      // Any non-success terminal: close this socket, then retry with a fresh candidate or reject.
      // `reasonForLog` distinguishes the failure mode if the retries are ultimately exhausted.
      const failAttempt = (reasonForLog: string): void => {
        if (settled) return;
        settled = true;
        cleanup();
        socket.close();
        if (remaining > 1) {
          attempt(remaining - 1); // transparent retry — claim conflict, dropped, or silent server.
        } else {
          reject(new Error(`createRoom: exhausted attempts (last: ${reasonForLog})`));
        }
      };
      const onFailure = (): void => failAttempt("socket closed/errored before a tableState");

      const timer = setTimeout(() => failAttempt("no server reply within timeout"), CREATE_ROOM_ATTEMPT_TIMEOUT_MS);

      const onOpen = (): void => {
        socket.send(JSON.stringify(buildCreateRoomIntent(name)));
      };
      const onMessage = (ev: MessageEvent): void => {
        let event: { type?: string };
        try {
          event = JSON.parse(ev.data as string) as { type?: string };
        } catch {
          return; // ignore non-JSON noise; the timeout still guards against a never-completing reply.
        }
        if (event.type === "tableState") {
          if (settled) return;
          settled = true;
          cleanup();
          resolve({ socket, code }); // claimed — the lobby is live on this socket (kept open).
        } else if (event.type === "error") {
          // Any createRoom `error` is treated as "pick a fresh candidate and retry": a claim conflict
          // has no dedicated ErrorReason (the contract is frozen — see handlers.ts), so the server reuses
          // `phase-illegal`, and createRoom carries no other rejectable input. Retrying is correct for a
          // collision; for any non-collision `error` the attempts cap bounds the loop and the reject
          // surfaces it rather than hanging. [Review: retry-reason handling; blind+edge hunter.]
          failAttempt("server error event");
        }
        // Any other event type is ignored; the timeout guards against a reply that never completes.
      };

      socket.addEventListener("open", onOpen);
      socket.addEventListener("message", onMessage);
      socket.addEventListener("close", onFailure);
      socket.addEventListener("error", onFailure);
    };
    attempt(maxAttempts);
  });
}
