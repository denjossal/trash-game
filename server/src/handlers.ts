// handlers.ts — one exported handle<Intent> fn per intent. The ONLY sites that assign table state
// (host.table = ...) or write ctx.storage, always AFTER validation/claim.
// [Source: architecture.md#Canonical-round-trip, #Architectural-Boundaries — state-mutation boundary]
//
// SCOPE (Story 1.6): handleCreateRoom only. joinRoom/setLives (1.7/1.8) and the gameplay handlers
// (deal/swap/reveal/host-controls, Epics 2–4) are NOT implemented here yet — dispatch.ts routes them
// to an explicit "not in this story" rejection, never a silent accept.
import type { Intent, TableState } from "@trash/shared";
import { DEFAULT_LIVES, IntentError } from "@trash/shared";
import { issueIdentity } from "./identity.js";
import { loadSummary, persistSummary } from "./persistence.js";

/**
 * What a handler needs from the DO. Kept as a narrow interface so handlers.ts does not import
 * partyserver and stays unit-reasonable: the authoritative in-memory state field, the DO name
 * (= the Room Code, from ctx.id.name), and the storage handle for the durable summary.
 */
export interface TableHost {
  /** The authoritative in-memory TableState (cache; null until claimed). Handlers are the ONLY writers. */
  table: TableState | null;
  /** The DO name = the Room Code (partyserver populates this from ctx.id.name / the URL). */
  readonly name: string;
  /** The DO storage for the single durable "table" key (D2). */
  readonly storage: DurableObjectStorage;
}

/** A connection identifies its owning player via per-connection state (set in onConnect/onMessage). */
export type ConnectionState = { playerId: string };

/**
 * handleCreateRoom — claim-on-create + first-Table build. Returns the playerId of the created host so
 * the caller can stamp the connection's state and project to it.
 *
 * CLAIM ATOMICITY (the Story 1.1 spike's explicit 1.6 follow-up): the claim read→decide→write must be
 * atomic within the DO's single-threaded turn so two simultaneous createRooms for the same code cannot
 * both observe "unclaimed". The Durable Object input gate serializes whole onMessage turns; this handler
 * makes the decision the FIRST thing it does and does NOT yield to another inbound message between the
 * "is it claimed?" check and the claim-write. The in-memory `host.table` fast-path catches the
 * already-warm case without even touching storage; the persisted summary catches the cold case (DO was
 * evicted but the "table" key survives). Either present ⇒ already claimed ⇒ throw so the client
 * regenerates + reconnects with a fresh candidate. [Source: 1-1-spike-findings AC1 + follow-up line 109;
 * architecture.md D7 lines 441–447.]
 *
 * Already-claimed is signalled as `phase-illegal` (the closest honest frozen ErrorReason — "this DO is
 * not in a state where it can be freshly created"); the client treats any createRoom error as
 * "regenerate + retry", and a real collision (~1-in-200k) is never surfaced to the human. We do NOT add
 * a new ErrorReason (the contract is frozen). [Source: shared/src/types.ts ErrorReason; story Dev Notes.]
 */
export async function handleCreateRoom(
  host: TableHost,
  intent: Extract<Intent, { type: "createRoom" }>,
): Promise<string> {
  // --- PAYLOAD SHAPE GUARD (lightweight, Decision #1 — no validation lib) ---
  // `onMessage` only narrows on `intent.type`; the payload is otherwise untrusted. A missing payload or
  // a non-string `name` would otherwise throw a raw TypeError on `intent.payload.name` below — which is
  // NOT an IntentError, so dispatch would rethrow it and the client would get NO `error` event (the
  // framework swallows+logs the throw) and hang. Reject it cleanly as `phase-illegal` so the client's
  // retry loop observes a normal `error`. Name CONTENT rules (empty/whitespace/length) are the lobby
  // UI's job (Stories 1.9a/1.10) — see deferred-work; here we only ensure the shape is well-formed.
  if (typeof intent.payload?.name !== "string") {
    throw new IntentError("phase-illegal");
  }

  // --- CLAIM CHECK (atomic: no yield between this read and the write below) ---
  if (host.table !== null) {
    throw new IntentError("phase-illegal"); // already an active Table in memory.
  }
  const existing = await loadSummary(host.storage);
  if (existing !== undefined) {
    throw new IntentError("phase-illegal"); // already claimed on disk (DO woke from an old claim).
  }

  // --- CLAIM + BUILD the first Table ---
  // The creator's server-issued identity. playerId is the PUBLIC state key → hostId AND players[0].id.
  // The sessionToken is the PRIVATE reconnect proof; it is NOT delivered this story (its only consumer
  // is the joinRoom echo / reconnection FLOW, both Story 1.7+ / deferred) and MUST NOT enter any
  // projection. [Source: identity.ts; 1-5 story; architecture.md Deferred reconnection.]
  const { playerId } = issueIdentity();
  const state: TableState = {
    code: host.name, // the DO name = the Room Code (the client picked this candidate; we claim it).
    phase: "lobby",
    hostId: playerId,
    startingLives: DEFAULT_LIVES,
    players: [
      {
        id: playerId,
        name: intent.payload.name,
        lives: DEFAULT_LIVES,
        isAlive: true,
        isConnected: true,
        seatIndex: 0,
      },
    ],
    round: null, // no deal yet — round is memory-only and stays null in lobby.
    phaseToken: 0,
  };

  // Assign the authoritative state (the ONLY write site) then persist the durable summary. The persist
  // is the claim-write: from here a second createRoom sees `host.table !== null` (warm) or the "table"
  // key (cold) and is rejected.
  host.table = state;
  await persistSummary(host.storage, state);

  return playerId;
}
