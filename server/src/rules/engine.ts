// PURE rule engine. Imports ONLY @trash/shared; no transport/storage/crypto/Date/Math.random.
// Enforced by the GATE 2 ESLint purity denylist on server/src/rules/**.
// [Source: architecture.md#D5, lines 405–418, 686–691; eslint.config.js GATE 2]
import { SINGLE_DECK_MAX_PLAYERS, type Card, type Player, type Round } from "@trash/shared";

/**
 * The outcome of {@link resolveShowdown} (Story 3.1). PURE data — the caller (Story 3.4 handler) owns
 * applying `players` to state, persisting, and projecting `loserIds`/`winnerIds`. The win-check verdict
 * is a discriminated union so a terminal game (`winner`) carries NO next-starter (the tiebreak NEVER runs
 * when the game ended — AC-3.1.2) and a continuing game carries exactly the next Starting Player.
 */
export type ShowdownResult = {
  loserIds: string[]; // all players holding the lowest VALUE (incl. all-tied) — FR-10.
  players: Player[]; // NEW array: lives deducted for losers, isAlive=false for any at 0. Inputs untouched.
  outcome:
    | { kind: "winner"; winnerIds: string[] } // 1 alive → sole winner; 0 alive → shared win (all co-winners). GAME OVER.
    | { kind: "continue"; nextStartingPlayerId: string }; // ≥2 alive → re-deal; the step-6 tiebreak result.
};

/** The four card suits. Decorative only — `suit` is NEVER compared (rank is the value). */
const SUITS: ReadonlyArray<Card["suit"]> = ["♠", "♥", "♦", "♣"];

/** Ranks 1..13 (Ace=1 lowest, King=13 highest). */
const RANKS: ReadonlyArray<number> = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

/**
 * Deck composition supplied to {@link buildDeck} — never assumed inside deal logic (Decision #8).
 * `decks` is the count of standard 52-card decks to merge: 1 for the Epic 2 single-deck case,
 * 2 for the 11–20-player merged-deck case (Epic 5 / Story 5.1 chooses the count — not this story).
 * Engine-internal: this is not sent over the wire, so it stays out of @trash/shared.
 */
export type DeckComposition = { decks: number };

/**
 * A source of randomness for {@link shuffle}, returning a float in [0, 1).
 * Injected so the shuffle stays pure and deterministically testable. The production
 * caller (outside rules/, see server/src/rng.ts) builds this from crypto.getRandomValues();
 * tests pass a fixed-seed PRNG. [AC-2.1.2 / AC-2.1.3]
 */
export type Rng = () => number;

/**
 * Auto-scale the Deck to the Table size (Story 5.1, FR-13 / AR-9). PURE: a Player count maps to the
 * {@link DeckComposition} {@link dealRound}/{@link buildDeck} consume — ONE 52-card deck for ≤
 * {@link SINGLE_DECK_MAX_PLAYERS} (10) Players, TWO merged decks (104 cards) for 11–20. This is the
 * whole of FR-13's logic: the count is engine-internal (Decision #8 — never sent over the wire), and
 * the Loser computation at scale is already proven across 2..20 (Decision #7 — {@link resolveShowdown}
 * is NOT reopened here). Two decks introduce duplicate VALUES (and more frequent ties), which are
 * ACCEPTED by design (FR-10/FR-13). Keys on the shared `SINGLE_DECK_MAX_PLAYERS` constant — no hardcoded
 * literal. The caller passes the ALIVE seat count; `joinRoom` bounds the Table at MAX_PLAYERS (20), so a
 * count above the single-deck threshold is always 11–20. [Source: epics.md FR-13/AR-9; config.ts:6.]
 */
export function compositionFor(playerCount: number): DeckComposition {
  return { decks: playerCount <= SINGLE_DECK_MAX_PLAYERS ? 1 : 2 };
}

/**
 * Build a deck from the SUPPLIED composition (AC-2.1.1). Pure: same composition in → equal
 * deck out, no randomness, no ambient state. Returns `composition.decks × 52` cards — one of
 * every {rank, suit} per merged deck.
 */
export function buildDeck(composition: DeckComposition): Card[] {
  const deck: Card[] = [];
  for (let d = 0; d < composition.decks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ rank, suit });
      }
    }
  }
  return deck;
}

/**
 * Pure Fisher–Yates shuffle with the RNG injected (AC-2.1.2). Deterministic for a fixed-seed
 * `rng`. Does NOT mutate the input — returns a new array. The RNG is the only entropy source;
 * the engine never touches crypto/Math.random itself (purity boundary).
 */
export function shuffle(deck: Card[], rng: Rng): Card[] {
  const out = deck.slice();
  for (let i = out.length - 1; i > 0; i--) {
    // Uniform index j in [0, i]; rng() in [0, 1) → floor(rng()*(i+1)) in [0, i].
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/**
 * The SINGLE seat-rotation primitive (Story 2.3, AC-2.3.3) [architecture.md:316–318, 688]. From
 * `fromSeatIndex`, walk RIGHT (increasing `seatIndex`, wrapping) and return the playerId of the next
 * seat that is `isAlive`. Reused by turn order (2.4), "Player to your right" (2.4 swap), and the D6
 * starting-player tiebreak (3.1) — built once, generic over the roster.
 *
 * MVP turn-order skips on `isAlive` ONLY, never `isConnected`: a disconnected-but-alive Player still
 * owes a Turn; the Host conducts around them socially (no auto-skip in MVP) [architecture.md:325–328].
 * Seats are ordered by `seatIndex` (immutable-for-life, never re-indexed [architecture.md:319]); the
 * `players` array order is NOT assumed (we sort by seatIndex). A single alive seat returns itself
 * (the walk wraps all the way around). PURE: no clock/RNG/IO.
 */
export function nextAliveSeat(players: Player[], fromSeatIndex: number): string {
  // Order by seatIndex so the walk follows seating, not array position.
  const bySeat = players.slice().sort((a, b) => a.seatIndex - b.seatIndex);
  const startPos = bySeat.findIndex((p) => p.seatIndex === fromSeatIndex);
  // Action-4 (assert-in-primitive, Story 3.1): an unknown `fromSeatIndex` must ASSERT, not silently
  // walk from bySeat[0] and return an arbitrary "wrong-but-plausible" seat (the deferred-work #45 gap).
  // Every real caller (2.4 rightHandNeighbor, 2.6 isLastPlayer, 3.1 tiebreak) passes a seated index, so
  // this only bites a genuine bug. Plain Error — purity boundary; IntentError lives in validate.ts.
  if (startPos === -1) {
    throw new Error(`nextAliveSeat: unknown fromSeatIndex ${fromSeatIndex} (no matching seat)`);
  }
  const n = bySeat.length;
  // Step forward (wrapping) from the seat AFTER `fromSeatIndex`, return the first alive one. Includes
  // the start seat last, so a lone alive seat returns itself.
  for (let step = 1; step <= n; step++) {
    const candidate = bySeat[(startPos + step) % n];
    if (candidate.isAlive) return candidate.id;
  }
  // No alive seat at all — return the start seat's id as a defensive fallback (the deal/turn callers
  // guarantee ≥2 alive, and the win-check (Epic 3) handles the ≤1-alive terminal cases before reuse).
  return bySeat[startPos]?.id ?? "";
}

/**
 * Build a fresh in-flight {@link Round} (Story 2.3, AC-2.3.1/.3). PURE: reconstitutes + reshuffles the
 * deck from the SUPPLIED composition (Decision #8 — never assumed), deals EXACTLY ONE card to each
 * `isAlive` Player (in deck order), and leaves the remaining deck in `round.deck` for the Last-Player
 * draw (Story 2.6). The `rng` is INJECTED — the crypto seam lives outside rules/ (server/src/rng.ts);
 * tests pass a fixed-seed PRNG, so the deal is deterministically testable.
 *
 * Deals to `isAlive` Players ONLY (eliminated seats get no card — FR-11; in this story all are alive,
 * but coding the filter now means the same function serves `dealAgain` (3.4) with eliminations). The
 * dealt set therefore matches the `nextAliveSeat` walk (same `isAlive` predicate). Constructs the
 * fresh-round invariants: `turnToken: 0`, `acted: []`, `revealed: false`, `currentTurnId` = the
 * supplied `startingPlayerId`. The caller (handlers.handleDeal) sets `startingPlayerId = hostId` on
 * the first round (AC-2.3.3). [Source: architecture.md D1 304–315, D5 405–418; epics.md#Story 2.3.]
 */
export function dealRound(
  players: Player[],
  composition: DeckComposition,
  rng: Rng,
  startingPlayerId: string,
): Round {
  const deck = shuffle(buildDeck(composition), rng);
  // Action-4 (assert-in-primitive, Story 3.1) — the two preconditions that come due at 3.4's dealAgain
  // (the first caller that can pass a possibly-eliminated previous host). The primitive guards itself so
  // a buggy caller can never silently corrupt state; the 2.3 caller (assertDealable + alive lobby host)
  // already honors both, so this is a no-op there. Plain Error — purity boundary (IntentError ∈ validate.ts).
  const alive = players.filter((p) => p.isAlive);
  // (a) Deck coverage: a Record<string,Card> would silently take `undefined` (deferred-work #46) without this.
  if (deck.length < alive.length) {
    throw new Error(`dealRound: deck (${deck.length}) cannot cover ${alive.length} alive players`);
  }
  // (b) Valid alive starter: currentTurnId would otherwise point at a dead/cardless seat (deferred-work #47).
  if (!alive.some((p) => p.id === startingPlayerId)) {
    throw new Error(`dealRound: startingPlayerId ${startingPlayerId} is not an alive, seated player`);
  }
  const hands: Record<string, Card> = {};
  let next = 0;
  for (const p of players) {
    if (!p.isAlive) continue; // eliminated seats receive no card.
    hands[p.id] = deck[next];
    next += 1;
  }
  return {
    startingPlayerId,
    currentTurnId: startingPlayerId,
    turnToken: 0,
    hands,
    deck: deck.slice(next), // the cards not dealt — carried for the Last-Player draw (2.6).
    acted: [],
    revealed: false,
  };
}

/**
 * The seat to the caller's RIGHT — both the swap target AND the next turn-actor are this same seat
 * ("Player to your right"). Looks the caller's seatIndex up from the LIVE roster (never trusted from
 * the wire) and delegates to {@link nextAliveSeat} (Story 2.3 — the SINGLE rotation primitive, reused
 * here, not reimplemented). The caller is always the current-turn player (the handler's `not-your-turn`
 * check guarantees a real, alive, seated caller), so the unknown-`fromSeatIndex` edge (deferred-work #7)
 * is unreachable from this path. PURE.
 */
function rightHandNeighbor(callerPlayerId: string, players: Player[]): string {
  const callerSeat = players.find((p) => p.id === callerPlayerId)?.seatIndex ?? -1;
  return nextAliveSeat(players, callerSeat);
}

/**
 * KEEP (Story 2.4, AC-2.4.4): the active Player retains their Card. PURE mutator on `round` — appends
 * the caller to `round.acted` and advances `round.currentTurnId` to the right-hand neighbor (the Turn
 * passes right). Does NOT touch `hands`.
 *
 * The `turns → allActed` transition is NOT computed here — `allActed` is owned by Story 2.6 (the
 * Last-Player turn, which also adds `drawFromDeck`); 2.4 advances the turn for non-final seats and the
 * contract names `allActed` as 2.6-emits / 3.2-consumes. So Keep ALWAYS advances `currentTurnId` to the
 * next alive seat; do NOT add last-seat / allActed handling here. [types.ts Phase; epics.md#Story 2.6.]
 */
export function applyKeep(round: Round, callerPlayerId: string, players: Player[]): void {
  delete round.lastSwapReceiverId; // a new turn action clears the prior swap's squirm transient.
  round.acted.push(callerPlayerId);
  round.currentTurnId = rightHandNeighbor(callerPlayerId, players);
}

/**
 * DRAW from the Deck (Story 2.6, AC-2.6.2): the Last Player replaces their Card with a random Card from
 * the remaining Deck instead of swapping. PURE mutator on `round`: take the TOP card of `round.deck`
 * (the deck was already Fisher–Yates-shuffled by {@link dealRound} seeded by cryptoRng — so the top IS a
 * uniformly-random card; the entropy was injected at the Deal, NOT here), make it the caller's new hand,
 * and REMOVE it from the deck. The caller's OLD card is DISCARDED — dropped, NOT re-inserted (AC-2.6.2:
 * "removed from the Deck for the rest of the Round; returns at the next Deal" when dealRound rebuilds the
 * full deck). Then record the caller in `acted` and advance `currentTurnId` right (the Last Player keeps
 * their newly-drawn card — the draw does not pass a card to anyone; the turn simply advances to the
 * right-hand neighbor, which for the Last Player is the Starting Player, completing the one pass).
 *
 * NO rng / NO crypto here (the shuffle already happened — purity boundary, GATE 2). NO rank/suit read:
 * the work is CONSTANT regardless of either card's value (deferred-work #54 (b) — timing-indistinguishable
 * by card value; no value-dependent branch). The deck always has ≥1 card by construction (AC-2.6.4 — deck
 * size ≥ player count: 52 ≥ 20 single-deck, 104 for 11–20), so no empty-deck path exists; no guard here.
 */
export function applyDraw(round: Round, callerPlayerId: string, players: Player[]): void {
  delete round.lastSwapReceiverId; // a new turn action clears the prior swap's squirm transient.
  // Top-of-deck draw: the shuffle is the randomness. shift() removes + returns the top card in place,
  // matching this function's in-place mutation contract (like applySwap/applyKeep). The deck cover is
  // guaranteed (AC-2.6.4), so `drawn` is always defined; the non-null assertion documents that invariant.
  const drawn = round.deck.shift()!;
  round.hands[callerPlayerId] = drawn; // the old card is discarded (dropped, not pushed back).
  round.acted.push(callerPlayerId);
  round.currentTurnId = rightHandNeighbor(callerPlayerId, players);
}

/**
 * The `turns → allActed` transition predicate (Story 2.6, AC-2.6.3). TRUE when every `isAlive` Player has
 * taken their Turn this one-pass (is in `round.acted`). Uses `isAlive` — the Deal-snapshot alive set, the
 * SAME predicate {@link nextAliveSeat}/{@link dealRound} use — NEVER `isConnected` (a disconnected-but-alive
 * Player still owes a Turn; the Host conducts around them, no auto-skip in MVP). Eliminated seats are not
 * required to act (forward-compat for `dealAgain` 3.4 with eliminations). PURE: turn facts only, no card
 * read. The handler uses this to decide when to enter the real `allActed` phase (architecture.md:574–590).
 */
export function allAlivePlayersActed(round: Round, players: Player[]): boolean {
  const acted = new Set(round.acted);
  return players.every((p) => !p.isAlive || acted.has(p.id));
}

/**
 * Is `playerId` the single Last Player (Story 2.6, AC-2.6.1/.5)? TRUE for the one active alive seat whose
 * right-hand neighbor (via {@link nextAliveSeat}) is the Round's `startingPlayerId` — i.e. the last seat
 * before the one-pass wraps back to the start. Heads-up (2 Players): the non-starter is the Last Player.
 * Skips eliminated seats (the last ALIVE seat before the starter). Exactly one alive seat is true.
 *
 * PURE + VALUE-FREE: reads `startingPlayerId` + `seatIndex` only, NEVER a card (SM-6). Shared by the
 * server-authority check (handlers.handleDraw — only the Last Player may draw) and the projection
 * (project-state — `you.isLastPlayer`), so the two cannot drift. An unknown/unseated `playerId` (no seat)
 * yields the same neighbor walk as any seat and returns false unless it coincidentally maps — callers pass
 * a real seated id (the projector iterates `state.players`; the handler passes the verified current-turn
 * player). [Source: nextAliveSeat; epics.md#Story 2.6 heads-up AC-2.6.5.]
 */
export function isLastPlayer(round: Round, players: Player[], playerId: string): boolean {
  const seat = players.find((p) => p.id === playerId);
  if (seat === undefined || !seat.isAlive) return false; // not a seated alive player → never the last.
  return nextAliveSeat(players, seat.seatIndex) === round.startingPlayerId;
}

/**
 * SWAP (Story 2.4, AC-2.4.3): the active Player EXCHANGES Cards with the Player to their right (each
 * then holds the other's former Card; everyone still holds exactly one). PURE mutator on `round`:
 * exchange `hands[caller]` ↔ `hands[neighbor]`, append the caller to `acted`, advance `currentTurnId`
 * to that same neighbor (the Turn passes right to the swap target).
 *
 * SM-6 / FR-8 (AC-2.4.6) — THE EXCHANGE IS UNCONDITIONAL. There is NO read of any Card's `rank`/`suit`
 * to decide whether the swap is allowed, and NO King-specific branch: the swap is a plain value
 * exchange of two Card objects, never a value comparison. The King being un-dumpable is a SOCIAL
 * convention the app enforces NOWHERE. This also keeps the handler timing-indistinguishable by card
 * value (deferred-work #54 (b)): the work is constant regardless of the cards' ranks.
 */
export function applySwap(round: Round, callerPlayerId: string, players: Player[]): void {
  const neighbor = rightHandNeighbor(callerPlayerId, players);
  // Unconditional exchange — no rank/suit read, no King branch (FR-8 / SM-6).
  const callerCard = round.hands[callerPlayerId];
  round.hands[callerPlayerId] = round.hands[neighbor];
  round.hands[neighbor] = callerCard;
  round.acted.push(callerPlayerId);
  round.currentTurnId = neighbor;
  // The squirm transient (AR-7, value-free): the neighbor just got dumped on. Memory-only; the
  // projector turns this into the per-device `you.justReceivedSwap` flag (no card data). The next
  // accepted turn action supersedes any prior value: applySwap OVERWRITES it here with the new
  // receiver, applyKeep deletes it — so it never carries a stale receiver across turns.
  round.lastSwapReceiverId = neighbor;
}

/**
 * The canonical Showdown resolution (Story 3.1) — the single pure function that computes a Round's
 * outcome for ANY table size, so loser-finding / ties / deduction / elimination / win-check / tiebreak
 * are tested once across 2..20 and Epic 5 never reopens it (Decision #7). Follows the D6 order exactly
 * [architecture.md#D6 421–435]:
 *   1. Reveal — the CALLER'S precondition (`round.revealed` already true via 3.2's revealAll); not flipped here.
 *   2. Loser(s) = ALL players at the lowest `hands[id].rank`. Suit is NEVER read (rank IS the value — see SUITS).
 *      Duplicate ranks (possible on the Epic-5 two-deck path) are exact value-ties — all such players lose (FR-10).
 *   3. Deduct exactly one Life from each Loser (every tied Loser).
 *   4. Mark `isAlive=false` for any player now at 0 Lives (FR-11).
 *   5. Win-check: exactly 1 alive → that player wins; 0 alive (all tied to zero in one Showdown) → shared
 *      win naming EVERY co-winner (FR-12 — never drop co-winners, cf. the Winner stub deferred-work #135);
 *      ≥2 alive → continue.
 *   6. ONLY when continuing: the next Starting Player = the tied Loser seated EARLIEST scanning right (via
 *      {@link nextAliveSeat}) from the previous Starting Player's seat (the previous starter is eligible if
 *      themselves a tied Loser); if that Loser was eliminated this Showdown, the next SURVIVING seat to their
 *      right. The tiebreak NEVER runs on a terminal verdict (step 5 ended the game).
 *
 * PURE: returns a NEW `players` array (input `players`/`hands` are never mutated — the caller owns state
 * mutation, persistence, and projection). No clock/RNG/IO; under the GATE-2 purity boundary. The tiebreak
 * is pure `nextAliveSeat` math (architecture.md#D5 502 — turn-order/tiebreak live in the engine).
 *
 * @param players  the alive-snapshot roster (eliminated seats may be present; they hold no hand and never lose).
 * @param hands    revealed hands, one Card per alive player (the round's `hands` at `revealed === true`).
 * @param previousStartingPlayerId  the Round just resolved's `startingPlayerId` — the step-6 scan origin.
 */
export function resolveShowdown(
  players: Player[],
  hands: Record<string, Card>,
  previousStartingPlayerId: string,
): ShowdownResult {
  // Action-4 (assert-in-primitive, Story 3.1) — resolveShowdown guards its own preconditions so the
  // 3.4 dealAgain caller (which passes a possibly-eliminated previous host) can never silently corrupt
  // state. Plain Error — purity boundary; IntentError lives in validate.ts. (a) The previous starter
  // MUST be a seated player: otherwise seatOf→undefined → startPos=-1 → the step-6 scan reads bySeat[-1]
  // (undefined) and throws a bare TypeError instead of a named one (mirrors the nextAliveSeat guard).
  if (!players.some((p) => p.id === previousStartingPlayerId)) {
    throw new Error(
      `resolveShowdown: previousStartingPlayerId ${previousStartingPlayerId} is not a seated player`,
    );
  }

  // Step 2 — Loser(s): the lowest rank among players who hold a revealed hand (alive seats). Suit ignored.
  const contenders = players.filter((p) => hands[p.id] !== undefined);
  // (b) At least one revealed hand: an empty `hands` → Math.min(...[])=Infinity → an empty loserSet and a
  // meaningless no-op resolution. A Showdown with no revealed hand is a caller bug, not a valid outcome.
  if (contenders.length === 0) {
    throw new Error("resolveShowdown: no revealed hands (hands has no entry for any seated player)");
  }
  const lowest = Math.min(...contenders.map((p) => hands[p.id].rank));
  const loserSet = new Set(contenders.filter((p) => hands[p.id].rank === lowest).map((p) => p.id));
  const loserIds = [...loserSet];

  // Steps 3 + 4 — deduct one Life per Loser and mark eliminations, into a NEW array (no input mutation).
  const next: Player[] = players.map((p) => {
    if (!loserSet.has(p.id)) return { ...p };
    const lives = p.lives - 1;
    return { ...p, lives, isAlive: lives > 0 };
  });

  // Step 5 — win-check on the post-deduction roster.
  const aliveAfter = next.filter((p) => p.isAlive);
  if (aliveAfter.length <= 1) {
    // 1 alive → sole winner; 0 alive (all tied to zero) → shared win naming all who just dropped to zero.
    const winnerIds =
      aliveAfter.length === 1
        ? [aliveAfter[0].id]
        : next.filter((p) => loserSet.has(p.id) && p.lives === 0).map((p) => p.id);
    return { loserIds, players: next, outcome: { kind: "winner", winnerIds } };
  }

  // Step 6 — ≥2 alive → continue. Next Starting Player = the tied Loser earliest scanning right from the
  // previous starter's seat; if eliminated this Showdown, the next surviving seat to that Loser's right.
  const seatOf = (id: string): number | undefined => players.find((p) => p.id === id)?.seatIndex;
  const prevSeat = seatOf(previousStartingPlayerId);
  // Order seats so we can scan right (wrapping) starting AT the previous starter's seat (inclusive — the
  // previous starter is eligible if a tied Loser). bySeat mirrors nextAliveSeat's seating order.
  const bySeat = players.slice().sort((a, b) => a.seatIndex - b.seatIndex);
  const startPos = bySeat.findIndex((p) => p.seatIndex === prevSeat);
  const m = bySeat.length;
  let nextStartingPlayerId = aliveAfter[0].id; // defensive default (≥2 alive guarantees a real assignment below).
  for (let step = 0; step < m; step++) {
    const candidate = bySeat[(startPos + step) % m];
    if (!loserSet.has(candidate.id)) continue; // we want the earliest tied LOSER from the previous starter.
    const post = next.find((p) => p.id === candidate.id)!;
    if (post.isAlive) {
      nextStartingPlayerId = candidate.id; // surviving tied loser → they start.
    } else {
      // Eliminated tied loser → the next SURVIVING seat to their right (skips any further eliminated losers).
      nextStartingPlayerId = nextAliveSeat(next, candidate.seatIndex);
    }
    break;
  }
  return { loserIds, players: next, outcome: { kind: "continue", nextStartingPlayerId } };
}
