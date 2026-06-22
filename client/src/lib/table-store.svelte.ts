// table-store.svelte.ts — the read-only client `tableState` store + the receive-loop message handler
// (Story 1.10, AC-1.10.4).
//
// Architecture: main.ts "holds last tableState (read-only store)" and the client "holds tableState
// read-only; renders surface = f(state)". This module IS that store. It is a Svelte 5 `$state` rune
// holder (hence `.svelte.ts`) so App.svelte re-renders reactively when it changes.
//
// OWNERSHIP INVARIANT: the ONLY writer is `handleSocketMessage` (the receive loop wires it onto the
// kept-open socket in main.ts). Consumers import `readTableState()` (a getter) — they cannot reassign
// the projection. This keeps the "no client-held screen state" rule intact: the surface is a pure
// function of this server-fed state, never a locally-set screen.
//
// The socket helpers (createRoomWithRetry / joinRoomAndListen, socket.ts) resolve with a live socket
// and DETACH their own one-shot listeners, so this handler is the persistent `message` listener that
// takes over liveness from that point. Parsing mirrors socket.ts: tolerant `try/catch`, ignore noise.
import type { ProjectedTableState } from "@trash/shared";
import type { PartySocket } from "partysocket";
import {
  buildDealAgainIntent,
  buildDrawIntent,
  buildHostSetLivesIntent,
  buildKeepIntent,
  buildSwapIntent,
  createRoomWithRetry,
  joinRoomAndListen,
  sendIntent,
} from "../socket";

// The single reactive cell. `null` = cold open (no tableState yet) → routeFromState returns "home".
let tableState = $state<ProjectedTableState | null>(null);

// The live, kept-open socket for the current Table (null until a create/join succeeds). NOT reactive —
// only the Host's send path (hostSetLives) reads it; the surface reacts to `tableState` alone.
let liveSocket: PartySocket | null = null;

/** Read the latest projection (or null before the first tableState). Read-only to consumers. */
export function readTableState(): ProjectedTableState | null {
  return tableState;
}

/**
 * The receive-loop handler: parse one raw socket message and, if it is a `tableState` envelope, write
 * its projection into the store. Everything else (an `error` envelope, non-JSON noise, unknown types)
 * is ignored here — errors are surfaced by the create/join flow (socket.ts rejects with a typed
 * reason), and we must NOT clobber the last good tableState with them. [Source: shared ServerEvent;
 * socket.ts onMessage parse pattern.]
 */
export function handleSocketMessage(raw: string): void {
  let event: { type?: string; payload?: unknown };
  try {
    event = JSON.parse(raw) as { type?: string; payload?: unknown };
  } catch {
    return; // non-JSON noise — ignore (the connection flows own their own error handling).
  }
  if (event.type === "tableState") {
    tableState = event.payload as ProjectedTableState;
  }
  // `error` / unknown types: intentionally ignored — do not overwrite the last good projection.
  //
  // SILENT STALE HANDLING (Story 2.2, AC-2.2.3): the two-scope guard rejects a stale/double-tapped/
  // replayed intent with `stale-turn` / `stale-phase`. The client MUST discard these SILENTLY — NO
  // toast, NO user-facing error — and keep rendering the last good snapshot; the accepted intent that
  // won the race pushes a fresh `tableState` that arrives here next. Because this kept-open store drops
  // ALL `error` envelopes (the live surface has no error UI — lobby errors like bad-code/room-full are
  // surfaced by the create/join FLOW in socket.ts, which rejects before the store adopts the socket), a
  // benign double-tap already shows nothing. Do NOT add a toast/error surface for these two reasons in
  // a later story. [Source: architecture.md D4 401–403; socket.ts createRoom/join error rejection.]
}

/** Take over a live, kept-open socket after a successful create/join: seed the store with the first
 *  projection (otherwise consumed-and-lost inside the socket helper) and attach the persistent receive
 *  loop so every later fan-out (a new joiner, a Lives change) updates the surface. */
function adoptSocket(socket: PartySocket, first: ProjectedTableState): void {
  liveSocket = socket;
  tableState = first; // render the Lobby immediately, before the next server push.
  socket.addEventListener("message", (ev: MessageEvent) => handleSocketMessage(ev.data as string));
}

/**
 * Start a new Table as Host (Home "Start a table"). Picks a candidate code, claims a DO, and on success
 * adopts the live socket — the arriving `lobby`-phase tableState routes App.svelte to the Lobby.
 * Rejects (after the retry budget) if the server is unreachable; the caller surfaces that. [Story 1.10.]
 */
export async function startTable(name: string): Promise<void> {
  const { socket, state } = await createRoomWithRetry(name);
  adoptSocket(socket, state);
}

/**
 * Join an existing Table by Room Code (Home "Join a table"). On success adopts the live socket. On a
 * typed failure (bad-code / room-full / phase-illegal / transport) the underlying promise rejects with
 * a `{reason}` — the caller catches it and shows the warm inline error; the store is left untouched.
 */
export async function joinTable(code: string, name: string): Promise<void> {
  const { socket, state } = await joinRoomAndListen(code, name);
  adoptSocket(socket, state);
}

/**
 * The Host changes starting Lives (Lobby stepper). Sends `hostSetLives{phaseToken, lives}` on the live
 * socket via the GATE-1-exempt `sendIntent` (NEVER socket.send from a surface). The server clamps 1–5
 * and fans out a fresh tableState, so the displayed value follows the echo — this is fire-and-forget.
 * No-op if there is no live socket (defensive; the stepper only renders once a Lobby is live). [1.8/1.10.]
 */
export function sendHostSetLives(lives: number, phaseToken: number): void {
  if (liveSocket === null) return;
  sendIntent(liveSocket, buildHostSetLivesIntent(lives, phaseToken));
}

/**
 * The active Player SWAPS — exchange Cards with the Player to their right (Story 2.4, FR-6). Sends
 * `swap{turnToken}` on the live socket via the GATE-1-exempt `sendIntent` (NEVER socket.send from a
 * surface). The server validates the turn token + current-turn ownership, applies the exchange, and
 * fans out a fresh tableState every device re-renders from; a stale/double-tap is rejected with
 * `stale-turn` and swallowed silently (handleSocketMessage drops error envelopes — AC-2.2.3). The
 * Your Turn surface passes the current round's `turnToken` from the projection. No-op without a socket.
 */
export function sendSwap(turnToken: number): void {
  if (liveSocket === null) return;
  sendIntent(liveSocket, buildSwapIntent(turnToken));
}

/** The active Player KEEPS — retain the Card and pass the Turn right (Story 2.4, FR-6). Same send seam
 *  as sendSwap; fire-and-forget (the server's fan-out drives the re-render). No-op without a socket. */
export function sendKeep(turnToken: number): void {
  if (liveSocket === null) return;
  sendIntent(liveSocket, buildKeepIntent(turnToken));
}

/** The Last Player DRAWS from the Deck instead of swapping (Story 2.6, FR-7). Same fire-and-forget seam
 *  as sendSwap/sendKeep; the server validates last-player authority + the turn token, replaces the card,
 *  enters `allActed`, and fans out a fresh tableState. A stale/non-last draw is rejected and swallowed
 *  silently (handleSocketMessage drops error envelopes — AC-2.2.3). No-op without a socket. */
export function sendDraw(turnToken: number): void {
  if (liveSocket === null) return;
  sendIntent(liveSocket, buildDrawIntent(turnToken));
}

/**
 * The Host RE-DEALS between rounds (Story 3.4, FR-12) — the FIRST client phase-conducting send. Sends
 * `dealAgain{phaseToken}` on the live socket via the GATE-1-exempt `sendIntent` (NEVER socket.send from a
 * surface). The server validates Host authority + the phase token + the roundResult gate, deals the
 * survivors with the Loser starting, and fans out a fresh `turns` tableState every device re-renders from;
 * a stale/double-tap is rejected with `stale-phase` and swallowed silently (handleSocketMessage drops error
 * envelopes — AC-2.2.3). The revealed-beat Re-deal block passes the current `state.phaseToken`. Fire-and-
 * forget; no-op without a live socket (defensive — the Re-deal only renders once a Table is live). */
export function sendDealAgain(phaseToken: number): void {
  if (liveSocket === null) return;
  sendIntent(liveSocket, buildDealAgainIntent(phaseToken));
}

/** TEST-ONLY: reset the store + socket between cases. Not used by production code. */
export function resetTableStateForTest(): void {
  tableState = null;
  liveSocket = null;
}
