// handlers.ts — one exported handle<Intent> fn per intent. The ONLY sites that assign table state
// (host.table = ...) or write ctx.storage, always AFTER validation/claim.
// [Source: architecture.md#Canonical-round-trip, #Architectural-Boundaries — state-mutation boundary]
//
// SCOPE (Story 1.6 → 1.7): handleCreateRoom + handleJoinRoom + markDisconnected (the presence flip
// onClose calls). setLives (1.8) and the gameplay handlers (deal/swap/reveal/host-controls, Epics 2–4)
// are NOT implemented here yet — dispatch.ts routes them to an explicit "not in this story" rejection,
// never a silent accept.
import type { Intent, Player, TableState } from "@trash/shared";
import { DEFAULT_LIVES, IntentError, MAX_PLAYERS } from "@trash/shared";
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
  /**
   * Every live connection, each carrying its stamped per-socket state (the owning playerId). Used by the
   * fan-out re-projection (dispatch/onClose → push-state.ts fanOut) so a roster change reaches every
   * device with its OWN projection. HANDLERS DO NOT CALL THIS — it is transport, and handlers are the
   * state-mutation boundary (no send / no connection access). It lives on TableHost only because the DO
   * genuinely provides it (partyserver Server.getConnections) and dispatch/onClose orchestrate through
   * the same host handle. Named `connections()` (not `getConnections`) to avoid colliding with — and
   * having to re-satisfy the variance of — partyserver's generic `Server.getConnections<TState>()`.
   * [Source: architecture.md round-trip line 523; partyserver Server.getConnections.]
   */
  connections(): Iterable<{ send(message: string): void; state: { playerId: string } | null }>;
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

/**
 * handleJoinRoom — append a Player to a `lobby` Table (the sole state-assignment site for join) and
 * return the joiner's playerId so the caller can stamp the connection + fan out the new roster.
 *
 * REJECTIONS (lightweight phase-checking + DO serialization, Decision #1 — NOT the Epic 2 two-scope
 * guard, which would no-op in `lobby`):
 *   - bad-code: the addressed DO was never claimed (`host.table === null` AND no persisted "table"
 *     summary) — a typo'd / expired / GC'd code addresses a FRESH empty DO. Reject WITHOUT appending or
 *     persisting, so a bad code never silently creates a junk room. (Read in reverse of the 1.6 claim:
 *     create throws when claimed; join throws when UNclaimed.) [Source: 1-1-spike-findings AC1.]
 *   - phase-illegal: the Table exists but `phase !== "lobby"` — no joining a game past the first Deal;
 *     late join is allowed in `lobby` ONLY. [Source: architecture.md D4 line 399.]
 *   - room-full: the roster is already at MAX_PLAYERS (the seat cap).
 *
 * APPEND ATOMICITY (the AC-1.7.5 concurrency point — same discipline as handleCreateRoom's claim): the
 * cap-check → append must be atomic within the DO's single-threaded turn so two concurrent joins cannot
 * BOTH observe `length < MAX_PLAYERS` and both append (→ a 21st seat / duplicate seatIndex). The DO input
 * gate serializes whole onMessage turns; the ONLY await here is persistSummary (after the in-memory
 * append, which is the commit point) — every check (shape, table-null, phase, re-seat, cap) and the push
 * are synchronous. There is NO yield between the cap-decision and the in-memory append, so a second join
 * queued behind this turn sees the appended roster. [Source: 1-1-spike-findings follow-up; handleCreateRoom
 * CLAIM ATOMICITY note.]
 *
 * sessionToken: the frozen joinRoom payload carries an optional `sessionToken`. In MVP there is NO
 * reconnection FLOW, so a join with a token still mints a FRESH identity + seat (it does NOT resume a
 * prior seat). Resolving token→existing-player is the deferred §11.3 / AR-12 reconnection seam. The
 * token is never surfaced in any projection (SM-6). [Source: architecture.md D4 line 400, Deferred.]
 *
 * RE-SEAT GUARD (`alreadySeatedPlayerId`): the connection's current stamp (the caller reads it from
 * connection.state; undefined for a fresh, unidentified socket). A socket that ALREADY owns a seated
 * player — a second joinRoom, or createRoom-then-joinRoom on the same socket — must NOT double-seat: a
 * second append would mint a new playerId, push a duplicate Player, and the caller's re-stamp would
 * orphan the first seat's presence (onClose only flips the LAST stamped id, so the earlier seat is
 * stuck isConnected:true forever) AND let one device consume multiple MAX_PLAYERS slots. Reject as
 * phase-illegal — symmetric with handleCreateRoom's re-claim guard (`host.table !== null`). One socket
 * resuming an existing seat on reconnect is the deferred §11.3 FLOW, NOT a re-join. [Source: code review
 * 2026-06-19; handleCreateRoom CLAIM CHECK.]
 */
export async function handleJoinRoom(
  host: TableHost,
  intent: Extract<Intent, { type: "joinRoom" }>,
  alreadySeatedPlayerId?: string,
): Promise<string> {
  // --- PAYLOAD SHAPE GUARD (lightweight, Decision #1 — no validation lib; mirrors handleCreateRoom) ---
  // A missing payload or a non-string code/name would throw a raw TypeError below (NOT an IntentError →
  // dispatch rethrows → client gets no `error` and hangs). Reject the malformed shape cleanly. Name
  // CONTENT rules (empty/whitespace/length) are the lobby UI's job (1.9a/1.10) — see deferred-work #54.
  if (typeof intent.payload?.code !== "string" || typeof intent.payload?.name !== "string") {
    throw new IntentError("phase-illegal");
  }

  // --- bad-code CHECK ---
  // onStart hydrates `host.table` from any persisted summary BEFORE the first onMessage (partyserver
  // #ensureInitialized runs onStart inside blockConcurrencyWhile — confirmed in the 1.6 review). So a
  // null `host.table` here means the DO has neither an in-memory table NOR (since onStart already ran) a
  // hydratable "table" key — it was never claimed or was GC'd ⇒ the code is bad/expired. We do NOT re-read
  // storage: a non-null summary with a null cache would be an onStart-ordering violation, and we would not
  // hydrate-and-join from it here anyway (that duplicates persistence's reconcile and risks a partial
  // state) — both outcomes are `bad-code`, so the read is dead work. No append, no persist. [Source: 1-6
  // Review Findings + onStart-before-onMessage note; code review 2026-06-19 — collapsed the dead branch.]
  if (host.table === null) {
    throw new IntentError("bad-code"); // unclaimed / expired DO — no such room.
  }

  // --- phase-illegal (late-join) CHECK: join is allowed in `lobby` ONLY ---
  if (host.table.phase !== "lobby") {
    throw new IntentError("phase-illegal"); // a game past the first Deal — no joining in progress.
  }

  // --- RE-SEAT GUARD: this socket must not already own a seat (symmetric with createRoom re-claim) ---
  // A second join (or createRoom-then-join) on the same socket would double-seat + orphan presence.
  // No yield between this read and the append below, so the guard is atomic with the cap-check/append.
  if (alreadySeatedPlayerId !== undefined && host.table.players.some((p) => p.id === alreadySeatedPlayerId)) {
    throw new IntentError("phase-illegal"); // this connection already holds a seat — no re-join.
  }

  // --- room-full CHECK (seat cap) ---
  if (host.table.players.length >= MAX_PLAYERS) {
    throw new IntentError("room-full");
  }

  // --- APPEND the joining Player (sole state-assignment site for join; atomic with the cap-check) ---
  // Fresh server-issued identity (playerId keys all state; never socket id). seatIndex = current length
  // — append-only, immutable-for-life, never re-indexed (architecture lines 316–320). lives seeds from
  // the Table's startingLives (the Host may have set it, Story 1.8; defaults to DEFAULT_LIVES at create).
  const { playerId } = issueIdentity();
  const joiner: Player = {
    id: playerId,
    name: intent.payload.name,
    lives: host.table.startingLives,
    isAlive: true,
    isConnected: true,
    seatIndex: host.table.players.length,
  };
  // Append in memory FIRST (the commit point — no yield since the cap-check above), then persist. A
  // second concurrent join, serialized behind this turn, now sees the appended roster length.
  host.table.players.push(joiner);
  await persistSummary(host.storage, host.table);

  return playerId;
}

/**
 * markDisconnected — flip a Player's `isConnected` to false on socket close (presence only). Returns
 * true if the roster changed (a matching connected player was found), false otherwise, so the caller
 * (onClose) only fans out a real change.
 *
 * PRESENCE IS EPHEMERAL — NOT PERSISTED. `isConnected` is deliberately omitted from the durable summary
 * (persistence.ts DurablePlayer): a reloaded summary makes no claim about who is connected. So this is an
 * IN-MEMORY mutation only — NO persistSummary (it carries no durable field). The player RECORD is RETAINED
 * with `isAlive` unchanged: a disconnected-but-alive player still owes a Turn; the Host conducts around
 * them (no auto-timeout in MVP). [Source: persistence.ts DurablePlayer; architecture lines 321–328.]
 *
 * Kept in handlers.ts (not in table-server.ts) so `host.table = …` / table mutation stays in the single
 * state-mutation module even though presence is not driven by an Intent. [Source: handlers.ts header
 * state-mutation boundary.]
 */
export function markDisconnected(host: TableHost, playerId: string): boolean {
  if (host.table === null) return false;
  const player = host.table.players.find((p) => p.id === playerId);
  if (player === undefined || !player.isConnected) return false; // unknown socket or already-offline.
  player.isConnected = false;
  return true;
}
