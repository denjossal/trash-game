// PURE rule engine. Imports ONLY @trash/shared; no transport/storage/crypto/Date/Math.random.
// Enforced by the GATE 2 ESLint purity denylist on server/src/rules/**.
// [Source: architecture.md#D5, lines 405–418, 686–691; eslint.config.js GATE 2]
import type { Card, Player, Round } from "@trash/shared";

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
