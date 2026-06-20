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

// --- Story 1.8: hostSetLives send builder (the WIRE only — the stepper UI is Story 1.10) ---
//
// This story ships the SERVER authority + the client SEND for the Host setting starting Lives; the Lives
// stepper (1–5, default 3), the Lives pips, and offering/hiding the control by Host status are Story 1.10
// (UX-DR4). So here we export only the intent BUILDER (+ the thin `sendIntent` helper below) — the Host
// Lobby surface (1.10) owns mounting the stepper onto the live, kept-open socket and calling these.
//
// phaseToken: the frozen payload is `hostSetLives{phaseToken, lives}`. In `lobby` the phaseToken is 0 and
// the server accepts-but-does-not-guard it (Decision #1), so the caller passes the value from the current
// tableState (0 in lobby). `lives` is the Host's chosen 1–5; the server CLAMPS out-of-range defensively.

/** Build a `hostSetLives` intent (frozen payload `{phaseToken, lives}`). The Host Lobby stepper (1.10)
 *  supplies the chosen `lives` (1–5) and the current `phaseToken` (0 in lobby). [Source: shared/src/types.ts.] */
export function buildHostSetLivesIntent(lives: number, phaseToken: number): Extract<Intent, { type: "hostSetLives" }> {
  return { type: "hostSetLives", payload: { phaseToken, lives } };
}

/**
 * Send a built intent on an already-open, kept-alive socket (the lobby keeps its socket open after
 * create/join). Thin builder-level helper so the Host Lobby surface (Story 1.10) can post a hostSetLives
 * without re-opening a socket or re-implementing the JSON.stringify envelope. Sends on the LIVE socket;
 * does NOT open a new one or auto-retry (reconnect stays disabled, AR-12 / §11.3).
 *
 * NOTE (Story 1.8 scope): `createRoomWithRetry`/`joinRoomAndListen` resolve with the live socket and
 * DETACH their own listeners, so the lobby surface — not this module — owns the socket lifecycle +
 * liveness from that point. This helper is the minimal send seam for that surface; mounting it (and the
 * receive loop) is Story 1.9a/1.10. [Source: Story 1.8 Task 4 — builder-only acceptable; deferred-work #29.]
 */
export function sendIntent(socket: PartySocket, intent: Intent): void {
  socket.send(JSON.stringify(intent));
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
 *
 * FAIL-LOUD on missing config (Story 1.7 — deferred-work #48): an empty/unset VITE_WS_URL would NOT
 * throw at PartySocket construction (the empty-host guard lives only in partysocket's reconnect path),
 * so `getPartyInfo` builds `wss:///parties/...` with an empty authority and the single `maxRetries:0`
 * connect fails SILENTLY — a misconfigured build gets a dead socket with no diagnostic. The live
 * connection flows (createRoom / joinRoom) own fail-loud config behavior, so we throw a clear error here
 * instead of tolerating `host: ""`. (1.5 sanctioned the empty fallback only while socket.ts was an
 * unmounted issuance-only seam; now it constructs real connections.) [Source: deferred-work.md #48.]
 */
export function createSocket(room: string): PartySocket {
  const host = import.meta.env.VITE_WS_URL;
  if (typeof host !== "string" || host.length === 0) {
    throw new Error(
      "VITE_WS_URL is not set — cannot open a Table socket. Set it in the client build environment " +
        "(e.g. .env / Pages env) to the server origin (wss://… or the wrangler-dev host).",
    );
  }
  return new PartySocket({
    host,
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

// --- Story 1.7: joinRoom send + listen ---

/** A failed join carries the server's typed reason so the UI can prompt a fix. `bad-code` = the code is
 *  wrong/expired (correct it and retry); `room-full` = the Table is at the seat cap; `phase-illegal` =
 *  the game is already in progress (no late join). Transport failures use the synthetic reasons below. */
export type JoinFailure = { reason: string };

/**
 * Join a Table by Room Code (AC-1.7.1/1.7.2/1.7.3). Connects to /parties/table/<code>, sends a
 * `joinRoom` intent (echoing the stored session token when present — accepted-but-not-resumed in MVP),
 * and resolves with the connected socket once a `tableState` arrives (the live lobby is on that socket).
 *
 * UNLIKE createRoom, a join error is NOT transparently retried: a `bad-code`/`room-full`/`phase-illegal`
 * is a real, user-actionable condition (a typo'd/expired code, a full or in-progress Table), so we reject
 * with the typed `reason` for the caller to surface ("check the code and try again"). The surface that
 * shows that message + a retry input is Stories 1.9a/1.10; this helper ships the wiring and is NOT mounted
 * into App.svelte yet. [Source: epics.md#Story-1.7 AC-1.7.2; shared ErrorReason; architecture D4.]
 *
 * FAILURE HANDLING mirrors createRoomWithRetry: one `fail` path tears down the socket (clear timer,
 * remove all four listeners, close) so a server-down / silent / dropped socket can't hang the Promise or
 * leak listeners; a `settled` guard makes a late close/error after success a no-op. A missing VITE_WS_URL
 * throws synchronously from createSocket (fail-loud — deferred-work #48), surfaced as a rejected Promise.
 */
export function joinRoomAndListen(
  code: string,
  name: string,
  timeoutMs = CREATE_ROOM_ATTEMPT_TIMEOUT_MS,
): Promise<{ socket: PartySocket }> {
  return new Promise((resolve, reject) => {
    let socket: PartySocket;
    try {
      socket = createSocket(code); // throws (fail-loud) if VITE_WS_URL is unset.
    } catch (err) {
      reject(err as Error);
      return;
    }
    let settled = false;

    const cleanup = (): void => {
      clearTimeout(timer);
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("close", onTransportFail);
      socket.removeEventListener("error", onTransportFail);
    };

    const fail = (failure: JoinFailure): void => {
      if (settled) return;
      settled = true;
      cleanup();
      socket.close();
      reject(Object.assign(new Error(`joinRoom failed: ${failure.reason}`), failure));
    };
    const onTransportFail = (): void => fail({ reason: "connection-failed" });

    const timer = setTimeout(() => fail({ reason: "timeout" }), timeoutMs);

    const onOpen = (): void => {
      socket.send(JSON.stringify(buildJoinRoomIntent(code, name)));
    };
    const onMessage = (ev: MessageEvent): void => {
      let event: { type?: string; payload?: { reason?: string } };
      try {
        event = JSON.parse(ev.data as string) as { type?: string; payload?: { reason?: string } };
      } catch {
        return; // ignore non-JSON noise; the timeout still guards a never-completing reply.
      }
      if (event.type === "tableState") {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({ socket }); // joined — the live lobby is on this (kept-open) socket.
      } else if (event.type === "error") {
        // A typed, user-actionable failure (bad-code / room-full / phase-illegal). Surface it — do NOT
        // auto-retry (a join error is a real condition the human resolves, not a transparent collision).
        fail({ reason: event.payload?.reason ?? "error" });
      }
      // Any other event type is ignored; the timeout guards against a reply that never completes.
    };

    socket.addEventListener("open", onOpen);
    socket.addEventListener("message", onMessage);
    socket.addEventListener("close", onTransportFail);
    socket.addEventListener("error", onTransportFail);
  });
}
