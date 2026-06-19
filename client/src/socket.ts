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
