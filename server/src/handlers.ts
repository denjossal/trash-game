// handlers.ts — one exported handle<Intent> fn per intent. The ONLY sites that assign table state
// (host.table = ...) or write ctx.storage, always AFTER validation/claim.
// [Source: architecture.md#Canonical-round-trip, #Architectural-Boundaries — state-mutation boundary]
//
// SCOPE (Story 1.6 → 1.7 → 1.8): handleCreateRoom + handleJoinRoom + markDisconnected (the presence flip
// onClose calls) + handleHostSetLives (the Host setting starting Lives in lobby). The gameplay handlers
// (deal/swap/reveal/the remaining host-controls, Epics 2–4) are NOT implemented here yet — dispatch.ts
// routes them to an explicit "not in this story" rejection, never a silent accept.
import type { Intent, Player, Round, TableState } from "@trash/shared";
import { DEFAULT_LIVES, IntentError, MAX_LIVES, MAX_PLAYERS, MIN_LIVES, MIN_PLAYERS } from "@trash/shared";
import { issueIdentity } from "./identity.js";
import { loadSummary, persistSummary } from "./persistence.js";
import { applyKeep, applySwap, dealRound } from "./rules/engine.js";
import { assertDealable, bumpPhaseToken, bumpTurnToken, checkPhaseToken, checkTurnToken } from "./rules/validate.js";
import { cryptoRng } from "./rng.js";

/** Single-deck composition for the Epic 2 case (≤20 players all fit one 52-card deck). The
 *  playerCount→deck-count mapping (two merged decks at 11–20) is Story 5.1 — supplied, not assumed
 *  (Decision #8). */
const DEAL_COMPOSITION = { decks: 1 } as const;

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
 * handleHostSetLives — the Host sets the starting Lives for the Table in `lobby` (FR-4). Mutates the
 * config: clamps `lives` to MIN_LIVES..MAX_LIVES, assigns `startingLives`, syncs EVERY Player's `lives`
 * to the same value (pre-Deal every Player is equal — no spent/remaining distinction yet), and persists
 * the durable summary. Returns void — the caller is already seated/stamped; set-lives binds no identity.
 *
 * `callerPlayerId` is the connection's current stamp (dispatch reads `connection.state?.playerId`, the
 * SAME stamp the join re-seat guard uses). An unstamped socket (never created/joined) → `undefined` →
 * `!== hostId` → `not-host`, the correct refusal for a socket that has no business setting config.
 *
 * VALIDATION ORDER (lightweight phase-checking + DO serialization, Decision #1 — NOT the Epic 2 two-scope
 * guard, which would no-op in `lobby`): shape → table-null → phase → host → clamp. Each precedes the sole
 * state assignment.
 *   - SHAPE (AC-1.8.4): a missing payload / non-finite `lives` would throw a raw TypeError on the clamp
 *     read below — NOT an IntentError, so dispatch would rethrow and the client would get no `error` and
 *     hang. Reject the malformed shape cleanly as `phase-illegal` (the closest honest frozen reason — the
 *     SAME documented precedent as handleCreateRoom/handleJoinRoom; out-of-RANGE numeric `lives` is NOT a
 *     shape error — it CLAMPS, AC-1.8.1). [Source: handlers.ts:72/166 payload-shape-guard precedent.]
 *   - table-null: a set-lives to an unclaimed DO cannot happen via the shipped client (you must
 *     create/join first, which warms `host.table`); onStart hydrates before the first onMessage, so null
 *     ⇒ never claimed. Guard defensively as `phase-illegal` (no room to configure).
 *   - phase-illegal (AC-1.8.3): `phase !== "lobby"` ⇒ refuse. Setting *starting* Lives is a pre-Deal/lobby
 *     action; the mid-session Lives change (clamp-vs-top-up, M1) is Story 4.2 / FR-14, NOT this story.
 *   - not-host (AC-1.8.2): `callerPlayerId !== hostId` ⇒ refuse. FIRST use of the frozen `not-host`
 *     ErrorReason. The server enforces host-authority independently of the client (NFR-2): a crafted wire
 *     message from a non-Host device is refused here even though Story 1.10 also hides the stepper.
 *
 * phaseToken is CARRIED in the payload but NOT guarded in lobby (it is 0 and never advances pre-Deal —
 * Decision #1), and set-lives does NOT bump it (setting config is not a phase transition — only
 * deal/reveal/re-deal/newGame bump phaseToken). [Source: architecture.md D4 lines 389–403; types.ts.]
 *
 * PERSIST (unlike the memory-only presence flip): `startingLives` AND `players[].lives` are BOTH durable
 * fields, so a reload must see the Host's chosen value — this handler MUST persistSummary. Idempotent:
 * re-setting the same value re-persists + re-fans-out harmlessly (no early-return; a re-fan-out is cheap
 * and keeps every device authoritative). No concurrency cap (it mutates existing fields, appends nothing);
 * the only `await` is the persist, after the in-memory mutation — read→decide→write stays a tight single
 * DO turn. [Source: persistence.ts DurablePlayer/DurableSummary; architecture single-threaded DO turn.]
 */
export async function handleHostSetLives(
  host: TableHost,
  intent: Extract<Intent, { type: "hostSetLives" }>,
  callerPlayerId: string | undefined,
): Promise<void> {
  // --- PAYLOAD SHAPE GUARD (AC-1.8.4): a non-finite/absent `lives` is a clean error, not a hang. ---
  if (typeof intent.payload?.lives !== "number" || !Number.isFinite(intent.payload.lives)) {
    throw new IntentError("phase-illegal");
  }

  // --- table-null (defensive): an unclaimed DO has no room to configure. ---
  if (host.table === null) {
    throw new IntentError("phase-illegal");
  }

  // --- phase-illegal (AC-1.8.3): setting STARTING Lives is lobby-only; mid-session is Story 4.2. ---
  if (host.table.phase !== "lobby") {
    throw new IntentError("phase-illegal");
  }

  // --- not-host (AC-1.8.2): only the Host may set Lives (server-authoritative, NFR-2). ---
  if (callerPlayerId !== host.table.hostId) {
    throw new IntentError("not-host");
  }

  // --- CLAMP (AC-1.8.1): constrain to 1..5; out-of-range clamps (never errors). Math.trunc so a
  // fractional value floors toward an integer (defensive — the client stepper only sends integers). ---
  const next = Math.max(MIN_LIVES, Math.min(MAX_LIVES, Math.trunc(intent.payload.lives)));

  // --- MUTATE + PERSIST (sole state-assignment site): set startingLives AND sync every Player's lives.
  // Pre-Deal the invariant is `every players[i].lives === startingLives` (seeded equal at create/join);
  // keep them equal so the lobby roster's Lives pips (Story 1.10) match the stepper. The only await is the
  // persist, after the in-memory mutation — startingLives + players[].lives are durable (MUST persist). ---
  host.table.startingLives = next;
  for (const p of host.table.players) p.lives = next;
  await persistSummary(host.storage, host.table);
}

/**
 * handleDeal — the FIRST gameplay handler (Story 2.3, FR-5). The Host taps Deal in `lobby`; the server
 * reconstitutes + reshuffles the deck, deals one secret Card to every active (isAlive) Player, sets the
 * Starting Player (= Host on the first Round), advances `lobby → turns`, and persists the durable
 * summary. A double-tapped/stale `deal` is rejected by the phase token before any mutation.
 *
 * This handler SETS THE PRECEDENT every later gameplay handler (swap/keep/draw 2.4/2.6, revealAll 3.2,
 * host-controls 4.x) copies — the accepted-path chokepoint Story 2.2 documented. `checkPhaseToken` runs
 * BEFORE the phase gate (not after the host check as the 2.2 sketch read) so a benign double-tap surfaces
 * as `stale-phase`, not `phase-illegal` — see the rationale at the `checkPhaseToken` call below:
 *   shape → table-null → not-host → checkPhaseToken → phase → ≥2-alive → assertDealable → mutate → bumpPhaseToken → persist
 * The guard (`checkPhaseToken`) and the advance (`bumpPhaseToken`) come from the 2.2 primitive
 * (rules/validate.ts); they are kept visibly adjacent so the pairing reads as one unit (deferred-work
 * #117 — the bumps are bare mutators with no enforced coupling; honor the order by convention here).
 *
 * The `"dealing"` phase is TRANSIENT — architecture: `lobby → dealing → turns` "in the same transition"
 * [architecture.md:577/584]. We land DIRECTLY in `"turns"`; no `"dealing"` snapshot is ever pushed.
 *
 * `round` is MEMORY-ONLY: `persistSummary` (toSummary) drops it (AC-2.2.5), so the durable "table" key
 * carries only `phase:"turns"` + the bumped phaseToken — the in-flight hands/deck never touch storage.
 * The per-device fan-out (own-card-only projection, SM-6) is dispatch's job, AFTER this handler returns.
 *
 * `callerPlayerId` is the connection's current stamp (dispatch reads `connection.state?.playerId`, the
 * SAME stamp set-lives uses) — an unstamped socket → undefined → `!== hostId` → `not-host`.
 * [Source: epics.md#Story 2.3 545–567; architecture.md D1/D4/D5; 2-2 Dev Notes accepted-path order.]
 */
export async function handleDeal(
  host: TableHost,
  // The Intent union groups deal/revealAll/dealAgain/newGame in ONE member (shared {phaseToken}
  // payload), so Extract by a single literal would be `never`. Extract the grouped member; dispatch's
  // `case "deal"` already guarantees this is the `deal` variant at the call site.
  intent: Extract<Intent, { type: "deal" | "revealAll" | "dealAgain" | "newGame" }>,
  callerPlayerId: string | undefined,
): Promise<void> {
  // --- SHAPE GUARD (lightweight, Decision #1 — mirrors handleHostSetLives): a missing / non-finite
  // phaseToken would throw a raw TypeError in checkPhaseToken (NOT an IntentError → dispatch rethrows →
  // client hangs). Reject the malformed shape cleanly as phase-illegal. ---
  if (typeof intent.payload?.phaseToken !== "number" || !Number.isFinite(intent.payload.phaseToken)) {
    throw new IntentError("phase-illegal");
  }

  // --- table-null (defensive): an unclaimed DO has no room to deal. ---
  if (host.table === null) {
    throw new IntentError("phase-illegal");
  }

  // --- not-host: only the Host conducts the Deal (server-authoritative, NFR-2 — same as set-lives). ---
  if (callerPlayerId !== host.table.hostId) {
    throw new IntentError("not-host");
  }

  // --- GUARD the phase token FIRST among the contentious checks (AC-2.3.1: "a double-tapped deal is
  // rejected by the phase token"). The race the token exists to win: two `deal`s both carry token 0;
  // the first is accepted (bumps to 1, moves to `turns`); the SECOND still carries 0 and mismatches the
  // now-bumped token → `stale-phase`, BEFORE any mutation. The token check precedes the phase-legality
  // gate so a benign double-tap surfaces as `stale-phase` (silently swallowed by the client, Story 2.2)
  // rather than `phase-illegal`. A deal carrying the CORRECT current token but on a non-lobby phase
  // still falls through to the phase gate below (correctly `phase-illegal`). [Story 2.2 checkPhaseToken.]
  checkPhaseToken(host.table, intent.payload.phaseToken);

  // --- phase: the FIRST deal is lobby-only (the roundResult→dealAgain re-deal is a DIFFERENT intent,
  // Story 3.4). Reject any non-lobby phase. ---
  if (host.table.phase !== "lobby") {
    throw new IntentError("phase-illegal");
  }

  // --- ≥2 active Players: Deal is disabled until ≥2 (UX-DR4); the server enforces it independently of
  // the client's disabled button. Count isAlive seats (pre-Deal every seat is alive). ---
  const aliveCount = host.table.players.filter((p) => p.isAlive).length;
  if (aliveCount < MIN_PLAYERS) {
    throw new IntentError("phase-illegal");
  }

  // --- deck-input field validation 2.1 deferred (assertDealable — #8/#9): the composition must be a
  // finite positive-integer deck count that covers the table. ---
  assertDealable(aliveCount, DEAL_COMPOSITION);

  // --- MUTATE: first-Round Starting Player = Host (AC-2.3.3); build the in-flight round (deal one card
  // per alive seat, deterministic-seeded by the crypto rng); advance straight to "turns". The cryptoRng
  // seam lives outside rules/ (rng.ts) — the handler injects entropy into the pure dealRound. ---
  const startingPlayerId = host.table.hostId;
  host.table.round = dealRound(host.table.players, DEAL_COMPOSITION, cryptoRng(), startingPlayerId);
  host.table.phase = "turns";

  // --- BUMP (accepted path): advance the phase token so the next stale `deal` copy mismatches. Kept
  // adjacent to the checkPhaseToken above so guard+advance reads as one unit. ---
  bumpPhaseToken(host.table);

  // --- PERSIST: the durable summary now carries phase:"turns" + the bumped token; `round` is dropped
  // by toSummary (memory-only, AC-2.2.5). The fan-out (per-device projection) is dispatch's job. ---
  await persistSummary(host.storage, host.table);
}

/**
 * Shared accepted-path PRE-CHECK for the turn-scoped gameplay handlers (Story 2.4 swap/keep; reused by
 * 2.6 drawFromDeck). Runs the EXACT order handleDeal set as the precedent, adapted to the TURN scope,
 * and returns the validated `round` so the caller can mutate it:
 *   shape → table-null → round-null/phase → not-your-turn → checkTurnToken
 *
 * ORDERING IS LOAD-BEARING (deferred-work #123): the `round !== null && phase === "turns"` gate MUST
 * precede `checkTurnToken`, because `checkTurnToken(round, …)` reads `round.turnToken` and the D2.1
 * reload coercion leaves `round: null` (while bumping phaseToken). A turn-scoped intent arriving after a
 * coerced reload is rejected here as `phase-illegal` BEFORE the token deref — never a raw TypeError that
 * would escape as a non-IntentError and hang the client. [Source: deferred-work.md #123; handleDeal order.]
 *
 * `not-your-turn` reads ONLY `round.currentTurnId` (a turn fact) — never a card value (SM-6 / FR-8). The
 * caller identity is the connection's stamp (dispatch passes `connection.state?.playerId`); an unstamped
 * or non-active socket → `not-your-turn` (server-authoritative, NFR-2 — refused even though the client
 * only shows the buttons on the active device).
 */
function requireActiveTurn(
  host: TableHost,
  intent: Extract<Intent, { type: "swap" | "keep" | "drawFromDeck" }>,
  callerPlayerId: string | undefined,
): Round {
  // --- SHAPE GUARD (lightweight, Decision #1 — mirrors handleDeal): a missing / non-finite turnToken
  // would throw a raw TypeError in checkTurnToken (NOT an IntentError → dispatch rethrows → client
  // hangs). Reject the malformed shape cleanly as phase-illegal. ---
  if (typeof intent.payload?.turnToken !== "number" || !Number.isFinite(intent.payload.turnToken)) {
    throw new IntentError("phase-illegal");
  }

  // --- table-null (defensive): an unclaimed DO has no live round. ---
  if (host.table === null) {
    throw new IntentError("phase-illegal");
  }

  // --- round-null / phase gate (deferred-work #123): a turn-scoped intent is legal ONLY mid-round
  // (`phase === "turns"` with a live `round`). This MUST run BEFORE checkTurnToken (which derefs
  // round.turnToken) — a post-D2.1-coercion intent (round===null) rejects here, not via a TypeError. ---
  if (host.table.round === null || host.table.phase !== "turns") {
    throw new IntentError("phase-illegal");
  }

  // --- not-your-turn: only the current-turn Player may act (server-authoritative, NFR-2). Reads ONLY
  // currentTurnId — never a card value (SM-6 / FR-8). FIRST use of the frozen `not-your-turn` reason. ---
  if (callerPlayerId !== host.table.round.currentTurnId) {
    throw new IntentError("not-your-turn");
  }

  // --- GUARD the turn token (Story 2.2): a double-tapped/stale swap/keep throws `stale-turn` here,
  // BEFORE any mutation. Kept adjacent to the bumpTurnToken in the caller (deferred-work #117 — honor
  // the guard → mutate → bump order by convention). ---
  checkTurnToken(host.table.round, intent.payload.turnToken);

  return host.table.round;
}

/**
 * handleSwap — the active Player EXCHANGES their Card with the Player to their right (Story 2.4, FR-6).
 * The SECOND gameplay handler and the FIRST consumer of the TURN scope (handleDeal was the first PHASE
 * consumer). Runs the shared turn-scoped pre-check (requireActiveTurn), then:
 *   mutate (applySwap — unconditional exchange + advance turn right + set the value-free squirm
 *   transient) → bumpTurnToken → [NO persist] → [dispatch] fanOut
 *
 * NO PERSIST (unlike handleDeal): a swap changes ONLY memory-only `round` fields (`hands`, `acted`,
 * `currentTurnId`, `turnToken`, `lastSwapReceiverId`); the durable summary (code/phase/hostId/
 * startingLives/players[]/phaseToken) is UNCHANGED (phase stays `turns`), so persisting would write an
 * identical blob. Swap is a memory-only mutation — same no-persist precedent as markDisconnected and
 * consistent with AC-2.2.5 (round is never persisted). [Source: architecture round-trip step 4
 * "persistSummaryIfPhaseChanged"; persistence.ts toSummary drops round.]
 *
 * SM-6 / FR-8 (AC-2.4.6): applySwap does CONSTANT work regardless of the cards' ranks (a plain field
 * exchange) — no value-dependent branch, so the response is timing-indistinguishable by card value
 * (deferred-work #54 (b)). The handler never serializes a hand: the per-device own-card-only projection
 * is dispatch's fanOut → pushState → projectStateFor (the SOLE chokepoint), AFTER this returns.
 */
export async function handleSwap(
  host: TableHost,
  intent: Extract<Intent, { type: "swap" | "keep" | "drawFromDeck" }>,
  callerPlayerId: string | undefined,
): Promise<void> {
  const round = requireActiveTurn(host, intent, callerPlayerId);
  // host.table is non-null here (requireActiveTurn threw otherwise); `callerPlayerId` is the verified
  // current-turn player. applySwap exchanges the two hands, advances the turn right, and sets the
  // value-free squirm transient (round.lastSwapReceiverId) the projector turns into justReceivedSwap.
  applySwap(round, callerPlayerId as string, host.table!.players);
  bumpTurnToken(round); // accepted-path advance — next stale turn-scoped copy mismatches.
  // No persistSummary: only memory-only round fields changed (phase unchanged). See JSDoc.
}

/**
 * handleKeep — the active Player RETAINS their Card and passes the Turn right (Story 2.4, FR-6). Same
 * accepted-path shape as handleSwap, but applyKeep leaves `hands` untouched (and clears any prior swap
 * squirm transient). NO PERSIST (memory-only round change; phase stays `turns`). [See handleSwap JSDoc.]
 */
export async function handleKeep(
  host: TableHost,
  intent: Extract<Intent, { type: "swap" | "keep" | "drawFromDeck" }>,
  callerPlayerId: string | undefined,
): Promise<void> {
  const round = requireActiveTurn(host, intent, callerPlayerId);
  applyKeep(round, callerPlayerId as string, host.table!.players);
  bumpTurnToken(round);
  // No persistSummary: only memory-only round fields changed (phase unchanged). See handleSwap JSDoc.
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
