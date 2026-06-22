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
import {
  allAlivePlayersActed,
  applyDraw,
  applyKeep,
  applySwap,
  dealRound,
  isLastPlayer,
  resolveShowdown,
} from "./rules/engine.js";
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
 * This handler SET THE PRECEDENT every later phase-scoped handler (revealAll 3.2, dealAgain 3.4,
 * host-controls 4.x) copies — the accepted-path chokepoint Story 2.2 documented. The shared
 * `requirePhaseConductor` helper now OWNS that order so the three callers cannot drift; `checkPhaseToken`
 * runs BEFORE the phase gate (so a benign double-tap surfaces as `stale-phase`, not `phase-illegal`):
 *   shape → table-null → not-host → checkPhaseToken → phase → [≥2-alive → assertDealable] → mutate → bumpPhaseToken → persist
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
  // --- ACCEPTED-PATH PRE-CHECK (AC-2.3.1): shape → table-null → not-host → checkPhaseToken → phase
  // (=== "lobby"). The double-tap ordering (token before phase gate) lives in the shared helper: two
  // `deal`s both carry token 0; the first is accepted (bumps to 1, moves to `turns`); the SECOND still
  // carries 0 and mismatches → `stale-phase`, BEFORE any mutation. The FIRST deal is lobby-only (the
  // roundResult→dealAgain re-deal is a DIFFERENT intent, Story 3.4). ---
  requirePhaseConductor(host, intent, callerPlayerId, "lobby");
  const table = host.table!; // requirePhaseConductor proved it non-null.

  // --- ≥2 active Players: Deal is disabled until ≥2 (UX-DR4); the server enforces it independently of
  // the client's disabled button. Count isAlive seats (pre-Deal every seat is alive). ---
  const aliveCount = table.players.filter((p) => p.isAlive).length;
  if (aliveCount < MIN_PLAYERS) {
    throw new IntentError("phase-illegal");
  }

  // --- deck-input field validation 2.1 deferred (assertDealable — #8/#9): the composition must be a
  // finite positive-integer deck count that covers the table. ---
  assertDealable(aliveCount, DEAL_COMPOSITION);

  // --- MUTATE: first-Round Starting Player = Host (AC-2.3.3); build the in-flight round (deal one card
  // per alive seat, deterministic-seeded by the crypto rng); advance straight to "turns". The cryptoRng
  // seam lives outside rules/ (rng.ts) — the handler injects entropy into the pure dealRound. ---
  const startingPlayerId = table.hostId;
  table.round = dealRound(table.players, DEAL_COMPOSITION, cryptoRng(), startingPlayerId);
  table.phase = "turns";

  // --- BUMP (accepted path): advance the phase token so the next stale `deal` copy mismatches. Kept
  // adjacent to the checkPhaseToken above so guard+advance reads as one unit. ---
  bumpPhaseToken(table);

  // --- PERSIST: the durable summary now carries phase:"turns" + the bumped token; `round` is dropped
  // by toSummary (memory-only, AC-2.2.5). The fan-out (per-device projection) is dispatch's job. ---
  await persistSummary(host.storage, table);
}

/**
 * handleReveal — the Host triggers the simultaneous Showdown reveal (Story 3.2, FR-9). The SECOND
 * PHASE-scope consumer (handleDeal was the first). Accepts the Host's `revealAll` ONLY at `allActed`
 * (the one phase where every Card is final but still hidden — the reveal-finality property NFR-5), flips
 * `round.revealed = true`, advances `allActed → showdown`, bumps the phase token, and persists. The
 * accepted-path order CLONES handleDeal exactly, differing only in the phase gate and the mutation:
 *   shape → table-null → not-host → checkPhaseToken → phase(=="allActed") → mutate → bumpPhaseToken → persist
 *
 * REVEAL-FINALITY (NFR-5, AC-3.2.2): the `allActed`-only gate guarantees no Card flips while any Card is
 * still mutable. By the time `phase === "allActed"` the one pass is complete — `maybeCompletePass` has
 * already cleared `currentTurnId` and every `isAlive` seat is in `round.acted`, and `requireActiveTurn`
 * rejects any further swap/keep/draw (`phase !== "turns"` → `phase-illegal`). So a reveal at `allActed`
 * sees only final cards. A `revealAll` in any other phase → `phase-illegal`; a double-tapped/stale one →
 * `stale-phase` (the token bumped on the accepted reveal). Both are rejected BEFORE the mutation.
 *
 * RESOLVE-AT-REVEAL (Story 3.4 — resolution wired in): after flipping `revealed = true`, this handler
 * now ALSO runs the pure `resolveShowdown` (Story 3.1) synchronously in the SAME transition and applies
 * its result: each Loser's Life deducted, `isAlive=false` for any at 0, `loserIds` (always) and — on the
 * terminal outcome — `winnerIds` stashed on TableState, and the phase advanced to `roundResult` (≥2 alive)
 * or `gameOver` (≤1 alive). The `round` is KEPT (not nulled) so `revealed` stays true and every hand + the
 * loser highlight render on the beat. CONSEQUENCE: the wire never RESTS at the `showdown` phase literal —
 * it is now a transient internal value (set then immediately overwritten by the resolution in this same
 * handler); the flip beat is shown on a `roundResult`/`gameOver` projection that still carries `revealed`.
 * On `continue` the resolved `nextStartingPlayerId` (the Loser of this round) is stashed so `dealAgain`
 * (Story 3.4) can seat the next Round's Starting Player. Once `revealed` is true, `projectStateFor`'s
 * `revealed` branch (project-state.ts) includes every seat's hand in each per-device payload — the first
 * moment a non-owner receives another Player's Card value (SM-6 EXTENDED, not weakened — Decision #3).
 *
 * `callerPlayerId` is the connection's stamp (dispatch passes `connection.state?.playerId`) — an
 * unstamped socket → undefined → `!== hostId` → `not-host`. [Source: epics.md#Story 3.2 695–713;
 * architecture.md#Phase allActed→showdown 583; handleDeal accepted-path precedent; validate.ts:48–51.]
 */
export async function handleReveal(
  host: TableHost,
  // The Intent union groups deal/revealAll/dealAgain/newGame in ONE member (shared {phaseToken} payload),
  // so Extract by a single literal would be `never`. dispatch's `case "revealAll"` guarantees the variant
  // here (same as handleDeal's grouped-member note).
  intent: Extract<Intent, { type: "deal" | "revealAll" | "dealAgain" | "newGame" }>,
  callerPlayerId: string | undefined,
): Promise<void> {
  // --- ACCEPTED-PATH PRE-CHECK (AC-3.2.1/.2/.3): shape → table-null → not-host → checkPhaseToken → phase
  // (=== "allActed"). revealAll is accepted ONLY at `allActed` — the one phase where every Card is final
  // but still hidden (reveal-finality NFR-5). The double-tap ordering (token before phase gate) lives in
  // the shared helper. ---
  requirePhaseConductor(host, intent, callerPlayerId, "allActed");
  const table = host.table!; // requirePhaseConductor proved it non-null.

  // --- round-null (defensive): at `allActed` a live round always exists (the pass just completed; a
  // D2.1-coerced wake lands in roundResult, never allActed). Guard before deref so an impossible
  // null round rejects as phase-illegal rather than throwing a raw TypeError below. ---
  if (table.round === null) {
    throw new IntentError("phase-illegal");
  }

  // --- MUTATE (flip): reveal the hands. `showdown` is set transiently then immediately resolved through
  // below (the wire never rests here). Once `revealed` is true, projectStateFor exposes every hand
  // (Decision #3 — SM-6 extended). ---
  table.round.revealed = true;
  table.phase = "showdown";

  // --- RESOLVE-AT-REVEAL (Story 3.4): run the PURE resolveShowdown on the now-revealed hands and apply
  // its result. The previous Starting Player (the scan origin for the step-6 tiebreak) is THIS round's
  // startingPlayerId. resolveShowdown returns a NEW players array (lives deducted, eliminations marked) +
  // the loser set + a discriminated win-check outcome; it never mutates its inputs and self-asserts its
  // preconditions (3.1 Action-4 hardening). The handler owns applying the result, persisting, projecting. ---
  const result = resolveShowdown(table.players, table.round.hands, table.round.startingPlayerId);
  table.players = result.players; // the NEW array (lives deducted + isAlive marked).
  table.loserIds = result.loserIds; // always set at resolution.
  if (result.outcome.kind === "winner") {
    // ≤1 alive after the deduction → terminal. Land gameOver, name the winner(s). No next starter (the
    // tiebreak never runs on a terminal game — AC-3.1.2). Winner surface is Story 3.6; this only sets it.
    table.phase = "gameOver";
    table.winnerIds = result.outcome.winnerIds;
    table.nextStartingPlayerId = undefined; // no re-deal from a terminal game.
  } else {
    // ≥2 alive → continue. Land roundResult and stash the resolved Loser as the next Round's Starting
    // Player so dealAgain (Story 3.4) seats it (persisted, so a reload re-deals it). winnerIds stays unset.
    table.phase = "roundResult";
    table.winnerIds = undefined;
    table.nextStartingPlayerId = result.outcome.nextStartingPlayerId;
  }
  // KEEP table.round (do NOT null it): `revealed` must stay true so the beat shows every hand + the
  // loser highlight. The round is cleared only at the next dealAgain/newGame.

  // --- BUMP (accepted path): advance the phase token so the next stale revealAll copy mismatches. Kept
  // adjacent to the checkPhaseToken above so guard+advance reads as one unit (deferred-work #117). ---
  bumpPhaseToken(table);

  // --- PERSIST: the durable summary now carries phase:"roundResult"/"gameOver" + loserIds/winnerIds +
  // nextStartingPlayerId + the bumped token; `round` (incl. `revealed`) is dropped by toSummary
  // (memory-only). A reload coerces a lost round to roundResult and keeps the persisted result so the
  // Host can still re-deal the correct Loser. The per-device fan-out is dispatch's job. ---
  await persistSummary(host.storage, table);
}

/**
 * handleDealAgain — the between-rounds re-deal (Story 3.4, FR-12). The Host taps Re-deal at `roundResult`;
 * the server deals a fresh Round to the SURVIVING Players (eliminated excluded), seats the Loser of the
 * round just resolved as the new Starting Player, clears the prior round's result, advances `roundResult →
 * turns`, and persists. CLONES the handleDeal accepted-path chokepoint exactly, differing only in the phase
 * gate and the Starting Player derivation:
 *   shape → table-null → not-host → checkPhaseToken → phase(=="roundResult") → mutate → bumpPhaseToken → persist
 *
 * THE ≥2-ALIVE GUARANTEE (AC-3.4.6, edge E1): the phase gate `=== "roundResult"` IS the ≥2-alive guard —
 * the win-check inside resolveShowdown (Story 3.1) sent every ≤1-alive outcome to `gameOver`, NEVER to
 * `roundResult`. So a `dealAgain` at `gameOver` (or any non-roundResult phase) is rejected `phase-illegal`,
 * and a Round can never start with <2 Players. NO new ErrorReason (the union is frozen).
 *
 * LOSER STARTS (AC-3.4.5, FR-12): the new Starting Player = `nextStartingPlayerId`, the resolved Loser the
 * resolution stashed on TableState (the Story-3.1 step-6 tiebreak result; if that Loser was eliminated, the
 * next surviving seat to their right — computed at resolution). It is PERSISTED in the durable summary, so a
 * roundResult reload (eviction/crash) still re-deals the correct Loser instead of mis-seating. There is no
 * hostId fallback: a missing starter at roundResult is a resolution/persist invariant breach and throws
 * loudly. dealRound deals `isAlive` seats only and self-asserts an alive/seated starter (3.1 Action-4
 * hardening), so a stale/eliminated id throws a plain Error (a server bug, not a client-rejectable intent).
 *
 * `callerPlayerId` is the connection's stamp (dispatch passes `connection.state?.playerId`) — an unstamped
 * socket → undefined → `!== hostId` → `not-host`. [Source: epics.md#Story 3.4; architecture.md#Phase
 * roundResult→dealAgain→turns 588; handleDeal accepted-path precedent; engine.dealRound/resolveShowdown.]
 */
export async function handleDealAgain(
  host: TableHost,
  // Same grouped-member Extract as handleDeal/handleReveal (deal/revealAll/dealAgain/newGame share the
  // {phaseToken} payload). dispatch's `case "dealAgain"` guarantees the variant here.
  intent: Extract<Intent, { type: "deal" | "revealAll" | "dealAgain" | "newGame" }>,
  callerPlayerId: string | undefined,
): Promise<void> {
  // --- ACCEPTED-PATH PRE-CHECK (AC-3.4.6/.7): shape → table-null → not-host → checkPhaseToken → phase
  // (=== "roundResult"). The `roundResult` gate IS the ≥2-alive guard (edge E1): the win-check sent every
  // ≤1-alive outcome to gameOver, so a dealAgain at gameOver (or any other phase) → `phase-illegal`. The
  // double-tap ordering (token before phase gate) lives in the shared helper. ---
  requirePhaseConductor(host, intent, callerPlayerId, "roundResult");
  const table = host.table!; // requirePhaseConductor proved it non-null.

  // --- MUTATE: the new Starting Player = the resolved Loser stashed at reveal (Loser starts — FR-12),
  // persisted in the durable summary so a roundResult reload re-deals the correct Loser (not hostId). Deal
  // a fresh Round to the surviving Players (dealRound deals isAlive seats only — eliminated excluded, FR-11;
  // it self-asserts an alive/seated starter, so a stale id throws rather than mis-seats). Clear the prior
  // round's result, advance to `turns`. nextStartingPlayerId is ALWAYS set on a real roundResult continue
  // outcome (handleReveal sets it) and survives a reload (persisted) — so no hostId fallback is needed;
  // letting dealRound's assert fire on an impossible-undefined keeps a resolution bug LOUD instead of
  // masking it behind a wrong-but-valid starter. ---
  if (table.nextStartingPlayerId === undefined) {
    // Defense-in-depth: a roundResult with no stashed/persisted starter is a server-side invariant
    // breach (resolution always sets it; persistence always carries it). Surface it loudly rather than
    // silently seating the host. Plain Error → dispatch's catch logs + closes (a server bug, not a
    // client-rejectable intent — same class as the dealRound asserts).
    throw new Error("handleDealAgain: roundResult has no nextStartingPlayerId (resolution/persist invariant breach)");
  }
  const startingPlayerId = table.nextStartingPlayerId;
  table.round = dealRound(table.players, DEAL_COMPOSITION, cryptoRng(), startingPlayerId);
  table.phase = "turns";
  table.loserIds = undefined; // clear the between-round result (a new round has no result yet).
  table.winnerIds = undefined;
  table.nextStartingPlayerId = undefined; // consumed.

  // --- BUMP (accepted path): advance the phase token so the next stale dealAgain copy mismatches. Kept
  // adjacent to the checkPhaseToken above so guard+advance reads as one unit (deferred-work #117). ---
  bumpPhaseToken(table);

  // --- PERSIST: the durable summary now carries phase:"turns" + the bumped token + the cleared result;
  // `round` is dropped by toSummary (memory-only). The per-device fan-out is dispatch's job. ---
  await persistSummary(host.storage, table);
}

/**
 * handleNewGame — "one more?" (Story 3.6, FR-12, UX-DR12). The Host taps the Winner surface's (or, as a
 * non-winning Host, the Eliminated surface's) one-more action at `gameOver`; the server starts a NEW game on
 * the SAME Table: it re-applies `startingLives` to every Player, brings every seat back alive, returns the
 * phase to `lobby` (re-opening join for late arrivals), clears the terminal result, drops the revealed
 * round, and persists. CLONES the handleDeal/handleDealAgain accepted-path chokepoint exactly, differing
 * only in the phase gate and the roster reset:
 *   shape → table-null → not-host → checkPhaseToken → phase(=="gameOver") → reset roster → clear result →
 *   phase=lobby + round=null → bumpPhaseToken → persist
 *
 * DISTINCT FROM dealAgain (Winston phase-machine reconciliation): `dealAgain` is the between-rounds re-deal
 * within an ONGOING game (`roundResult → turns`, survivors only); `newGame` is a fresh game on the same
 * Table (`gameOver → lobby`, EVERY seat alive at full lives). The two are mutually exclusive on the phase
 * gate — `dealAgain` is accepted ONLY at `roundResult`, `newGame` ONLY at `gameOver` — so neither can fire
 * in the other's phase. NO new ErrorReason (the union is frozen).
 *
 * SAME ROSTER, NO RE-JOIN (AC-3.6.3): the seats keep their `id`/`name`/`seatIndex`/`isConnected` — existing
 * Players are not dropped and do not re-join; they simply receive a fresh `lobby` projection. Returning to
 * `lobby` re-opens join (handleJoinRoom admits ONLY at `lobby`), so late arrivals can seat up to the next
 * first Deal. `startingLives` is the Host's current setting (Story 1.8 / hostSetLives), re-applied here the
 * same way handleHostSetLives syncs every player's lives.
 *
 * `callerPlayerId` is the connection's stamp (dispatch passes `connection.state?.playerId`) — an unstamped
 * socket → undefined → `!== hostId` → `not-host`. [Source: epics.md#Story 3.6; architecture.md#Phase
 * gameOver→newGame→lobby 589; handleDealAgain precedent.]
 */
export async function handleNewGame(
  host: TableHost,
  // Same grouped-member Extract as handleDeal/handleReveal/handleDealAgain (deal/revealAll/dealAgain/newGame
  // share the {phaseToken} payload). dispatch's `case "newGame"` guarantees the variant here.
  intent: Extract<Intent, { type: "deal" | "revealAll" | "dealAgain" | "newGame" }>,
  callerPlayerId: string | undefined,
): Promise<void> {
  // --- ACCEPTED-PATH PRE-CHECK (AC-3.6.2): shape → table-null → not-host → checkPhaseToken → phase
  // (=== "gameOver"). The `gameOver` gate makes newGame the terminal-only mirror of dealAgain's
  // roundResult-only gate: a newGame at any non-terminal phase → `phase-illegal`. The double-tap ordering
  // (token before phase gate) lives in the shared helper. ---
  requirePhaseConductor(host, intent, callerPlayerId, "gameOver");
  const table = host.table!; // requirePhaseConductor proved it non-null.

  // --- MUTATE: start a fresh game on the SAME roster. Re-apply the Host's startingLives to every seat and
  // bring everyone back alive (mirrors handleHostSetLives's lives-sync). id/name/seatIndex/isConnected are
  // preserved — the Players are not dropped and never re-join (AC-3.6.3). ---
  for (const p of table.players) {
    p.lives = table.startingLives;
    p.isAlive = true;
  }
  // Return to lobby (re-opens join — handleJoinRoom admits ONLY at lobby), and clear the terminal result +
  // the revealed round exactly as handleDealAgain clears a between-round result. The round is cleared only
  // at the next dealAgain/newGame (handleReveal kept it for the gameOver beat); now is that moment.
  table.phase = "lobby";
  table.loserIds = undefined;
  table.winnerIds = undefined;
  table.nextStartingPlayerId = undefined;
  table.round = null;

  // --- BUMP (accepted path): advance the phase token so the next stale newGame copy mismatches. Kept
  // adjacent to the checkPhaseToken above so guard+advance reads as one unit (deferred-work #117). ---
  bumpPhaseToken(table);

  // --- PERSIST: the durable summary now carries phase:"lobby" + every player reset to startingLives/alive +
  // the cleared result + the bumped token; `round` is dropped by toSummary (already null). The per-device
  // fan-out is dispatch's job. ---
  await persistSummary(host.storage, table);
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
 * Shared accepted-path PRE-CHECK for the PHASE-scoped host-conducted handlers (Story 2.3 deal; reused by
 * 3.2 revealAll and 3.4 dealAgain). Runs the EXACT order handleDeal set as the precedent — the phase-scope
 * analog of {@link requireActiveTurn} — and returns nothing (the caller reads `host.table` directly, now
 * proven non-null by this guard):
 *   shape → table-null → not-host → checkPhaseToken → phase(=== expectedPhase)
 *
 * ORDERING IS LOAD-BEARING: `checkPhaseToken` runs BEFORE the phase gate so a benign double-tap surfaces
 * as `stale-phase` (silently swallowed by the client, Story 2.2) rather than `phase-illegal` — and the
 * shape guard runs FIRST so a missing/non-finite phaseToken rejects cleanly as `phase-illegal` instead of
 * throwing a raw TypeError inside checkPhaseToken (which would escape as a non-IntentError and hang the
 * client). Centralizing the order here keeps the three callers (deal/revealAll/dealAgain) from drifting.
 *
 * `callerPlayerId` is the connection's stamp (dispatch passes `connection.state?.playerId`) — an unstamped
 * socket → undefined → `!== hostId` → `not-host`. [Source: handleDeal accepted-path order; NFR-2/NFR-5.]
 */
function requirePhaseConductor(
  host: TableHost,
  // The Intent union groups deal/revealAll/dealAgain/newGame in ONE member (shared {phaseToken} payload),
  // so Extract by a single literal would be `never`; the caller's dispatch `case` guarantees the variant.
  intent: Extract<Intent, { type: "deal" | "revealAll" | "dealAgain" | "newGame" }>,
  callerPlayerId: string | undefined,
  expectedPhase: TableState["phase"],
): void {
  // --- SHAPE GUARD (lightweight, Decision #1): a missing / non-finite phaseToken would throw a raw
  // TypeError in checkPhaseToken (NOT an IntentError → dispatch rethrows → client hangs). Reject the
  // malformed shape cleanly as phase-illegal. ---
  if (typeof intent.payload?.phaseToken !== "number" || !Number.isFinite(intent.payload.phaseToken)) {
    throw new IntentError("phase-illegal");
  }

  // --- table-null (defensive): an unclaimed DO has no round to conduct. ---
  if (host.table === null) {
    throw new IntentError("phase-illegal");
  }

  // --- not-host (NFR-2): only the Host conducts a phase transition (server-authoritative). A crafted
  // copy from a guest is refused even at the expected phase. ---
  if (callerPlayerId !== host.table.hostId) {
    throw new IntentError("not-host");
  }

  // --- GUARD the phase token FIRST among the contentious checks (double-tap): a second copy carries the
  // same now-stale token → `stale-phase`, BEFORE any mutation. The token check precedes the phase gate so
  // a benign double-tap surfaces as `stale-phase` (silently swallowed) rather than `phase-illegal`. ---
  checkPhaseToken(host.table, intent.payload.phaseToken);

  // --- phase gate: the intent is accepted ONLY at its expected phase. Any other phase → `phase-illegal`. ---
  if (host.table.phase !== expectedPhase) {
    throw new IntentError("phase-illegal");
  }
}

/**
 * Shared TURN-COMPLETION step for the three turn handlers (Story 2.6, AC-2.6.3). Called AFTER the action
 * applies + the turn token bumps. If the one pass is now complete (every `isAlive` Player has acted), enter
 * the REAL `allActed` phase: set `phase = "allActed"`, CLEAR the active seat, and bump the phase token.
 * Returns `true` when it made that transition, so the caller knows the durable summary changed and MUST
 * persist (a mid-pass action changes only memory-only `round`, so it returns false and the caller skips
 * persist — the exact 2.4 swap/keep behavior).
 *
 * Why CLEAR `currentTurnId`: every turn action advances `currentTurnId` to the right-hand neighbor — for
 * the LAST seat that is the Starting Player. If we left it pointing there while `phase === "allActed"`,
 * the Starting Player's device would route to a phantom `yourTurn` (route-from-state checks `currentTurnId`
 * for any live-round phase incl. `allActed`). Clearing it routes EVERY device to Waiting until the Host
 * triggers the reveal (Epic 3 / Story 3.2). The empty string is projected as an absent/blank turn id.
 *
 * `allActed` is a REAL Phase the server ENTERS here on the final accepted turn intent (NOT a derived
 * predicate) — Story 3.2's `revealAll` only READS it (guards `phase === "allActed"`), never sets it.
 * The phase-token bump pairs the change with the monotonic guard (deferred-work #117 — kept adjacent).
 * [Source: types.ts Phase 37–38; architecture.md 574–590; epics.md#Story 2.6 AC-2.6.3.]
 */
function maybeCompletePass(state: TableState, round: Round): boolean {
  if (!allAlivePlayersActed(round, state.players)) return false;
  state.phase = "allActed";
  round.currentTurnId = ""; // no active seat once the pass is complete (router-leak fix).
  bumpPhaseToken(state);
  return true;
}

/**
 * The shared accepted-turn TAIL for all three turn handlers: run {@link maybeCompletePass}, and — ONLY if
 * it made the `turns → allActed` transition — persist the (now-changed) durable summary. Folding the
 * persist INTO this step (rather than leaving a `if (maybeCompletePass(...)) await persistSummary(...)`
 * couplet at each call site) keeps the "transition happened ⇒ must persist" coupling in one place, so a
 * new turn handler cannot wire up the completion check while forgetting the durable write (deferred-work
 * #117 — the bare-mutator-coupling class). Mid-pass it makes no transition and skips persist (the 2.4
 * memory-only path: only `round` changed, phase stays `turns`).
 */
async function completePassAndPersistIfDone(host: TableHost, round: Round): Promise<void> {
  if (maybeCompletePass(host.table!, round)) {
    await persistSummary(host.storage, host.table!);
  }
}

/**
 * handleSwap — the active Player EXCHANGES their Card with the Player to their right (Story 2.4, FR-6).
 * The SECOND gameplay handler and the FIRST consumer of the TURN scope (handleDeal was the first PHASE
 * consumer). Runs the shared turn-scoped pre-check (requireActiveTurn), then:
 *   mutate (applySwap — unconditional exchange + advance turn right + set the value-free squirm
 *   transient) → bumpTurnToken → [NO persist] → [dispatch] fanOut
 *
 * PERSIST IS CONDITIONAL (Story 2.6): a MID-pass swap changes ONLY memory-only `round` fields (`hands`,
 * `acted`, `currentTurnId`, `turnToken`, `lastSwapReceiverId`); the durable summary (code/phase/hostId/
 * startingLives/players[]/phaseToken) is UNCHANGED (phase stays `turns`), so it does NOT persist — the
 * 2.4 memory-only precedent (same as markDisconnected; consistent with AC-2.2.5). BUT when the LAST seat
 * swaps, the one pass completes → `maybeCompletePass` enters `allActed` + bumps the phase token (both
 * DURABLE), so the handler MUST persist. The conditional is centralized in `maybeCompletePass`'s return.
 * [Source: architecture round-trip step 4 "persistSummaryIfPhaseChanged"; persistence.ts toSummary drops round.]
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
  // If this was the LAST seat's action, the one pass is complete → enter `allActed` (Story 2.6) and
  // persist (the durable phase + phaseToken changed). MID-pass: NO persist (the 2.4 memory-only path:
  // only `round` changed, phase stays `turns`). [See completePassAndPersistIfDone / maybeCompletePass.]
  await completePassAndPersistIfDone(host, round);
}

/**
 * handleKeep — the active Player RETAINS their Card and passes the Turn right (Story 2.4, FR-6). Same
 * accepted-path shape as handleSwap, but applyKeep leaves `hands` untouched (and clears any prior swap
 * squirm transient). PERSIST is conditional (Story 2.6): mid-pass → no persist; LAST-seat keep completes
 * the pass → `allActed` + persist (via maybeCompletePass). [See handleSwap JSDoc.]
 */
export async function handleKeep(
  host: TableHost,
  intent: Extract<Intent, { type: "swap" | "keep" | "drawFromDeck" }>,
  callerPlayerId: string | undefined,
): Promise<void> {
  const round = requireActiveTurn(host, intent, callerPlayerId);
  applyKeep(round, callerPlayerId as string, host.table!.players);
  bumpTurnToken(round);
  // Last-seat action completes the pass → allActed + persist; mid-pass → no persist. See handleSwap JSDoc.
  await completePassAndPersistIfDone(host, round);
}

/**
 * handleDraw — the Last Player's THIRD choice: draw a random Card from the Deck instead of swapping
 * (Story 2.6, FR-7). The third turn-scoped handler. Runs the shared turn pre-check (requireActiveTurn —
 * shape → table-null → round-null/phase → not-your-turn → checkTurnToken), then a LAST-PLAYER authority
 * check (only the Last Player may draw — server-authoritative, NFR-2), then:
 *   applyDraw (top-of-deck → caller's hand; discard the old card; advance turn right) → bumpTurnToken →
 *   maybeCompletePass (always true here — the Last Player is by definition the final seat → `allActed` +
 *   clear active seat + bumpPhaseToken) → persistSummary.
 *
 * THE ONE TURN HANDLER THAT PERSISTS: a draw is the final action of the one pass (only the Last Player
 * may draw — the authority check below guarantees it), so it ALWAYS completes the pass → `phase`
 * (turns→allActed) and `phaseToken` change. Both are DURABLE summary fields (persistence.ts toSummary
 * keeps phase + phaseToken; `round` is still dropped — memory-only). So handleDraw MUST persist (matching
 * handleDeal's persist precedent), where a mid-pass swap/keep does NOT. The completion is therefore
 * UNCONDITIONAL here (asserted, not guarded behind an `if` that can never be false) — the "did it
 * transition" branch is the swap/keep concern, not the draw's.
 *
 * LAST-PLAYER CHECK: reuses the SHARED `isLastPlayer` derivation (rules/engine — value-free: turn-order
 * only, never a card) so the server-authority gate and the projector's `you.isLastPlayer` cannot drift. A
 * crafted `drawFromDeck` from a non-last seat (even on their real turn) is refused `not-your-turn` (the
 * closest honest frozen reason — it is not their turn to DRAW; the contract is frozen, no new ErrorReason).
 *
 * SM-6 (b): applyDraw does CONSTANT work regardless of the drawn/discarded card's rank (no value branch) —
 * timing-indistinguishable by card value (deferred-work #54 (b)). The own-card-only projection is dispatch's
 * fanOut job, AFTER this returns. [Source: epics.md#Story 2.6; engine.applyDraw/isLastPlayer; handleDeal persist.]
 */
export async function handleDraw(
  host: TableHost,
  intent: Extract<Intent, { type: "swap" | "keep" | "drawFromDeck" }>,
  callerPlayerId: string | undefined,
): Promise<void> {
  const round = requireActiveTurn(host, intent, callerPlayerId);
  // --- LAST-PLAYER AUTHORITY (server-authoritative, NFR-2): only the Last Player may draw. The shared
  // isLastPlayer derivation (value-free) keeps this gate in lockstep with the projector's you.isLastPlayer
  // (the client only shows the Draw button on the last seat; the server refuses a crafted draw elsewhere). ---
  if (!isLastPlayer(round, host.table!.players, callerPlayerId as string)) {
    throw new IntentError("not-your-turn"); // not their turn to DRAW (frozen reason; no new ErrorReason).
  }
  // --- MUTATE: replace the caller's hand with the top deck card (the shuffle is the randomness — applyDraw
  // takes no rng), discard the old card, advance the turn right (to the Starting Player). ---
  applyDraw(round, callerPlayerId as string, host.table!.players);
  bumpTurnToken(round); // accepted-path advance.
  // --- COMPLETE THE PASS: the Last Player's draw is BY DEFINITION the final action → allActed + clear
  // seat + bump phase token. This is unconditional (only the last seat reaches here — the authority check
  // above), so we assert the transition rather than hide it behind an `if` that can never be false; persist
  // because the durable phase + phaseToken changed (the ONE persisting turn handler). ---
  const completed = maybeCompletePass(host.table!, round);
  /* c8 ignore next */
  if (!completed) throw new Error("invariant: a Last-Player draw must complete the pass");
  await persistSummary(host.storage, host.table!);
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
