// PURE rule engine. Imports ONLY @trash/shared; no transport/storage/crypto/Date/Math.random.
// Enforced by the GATE 2 ESLint purity denylist on server/src/rules/**.
// [Source: architecture.md#D5, lines 405–418, 686–691; eslint.config.js GATE 2]
import type { Card } from "@trash/shared";

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
