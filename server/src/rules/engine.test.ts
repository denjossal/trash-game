import { expect, test } from "vitest";
import type { Card } from "@trash/shared";
import { buildDeck, shuffle } from "./engine.js";

// A tiny deterministic PRNG (LCG) so a fixed seed yields a fixed permutation.
// Returns a float in [0, 1) — matching shuffle's documented rng contract.
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    // glibc LCG constants; mask to 31 bits, normalize to [0, 1).
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return s / 0x80000000;
  };
}

const SUITS = ["♠", "♥", "♦", "♣"] as const;

function rankCounts(deck: Card[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const c of deck) m.set(c.rank, (m.get(c.rank) ?? 0) + 1);
  return m;
}

// ---- buildDeck (AC-2.1.1) -------------------------------------------------

test("buildDeck: { decks: 1 } returns a standard 52-card deck", () => {
  const deck = buildDeck({ decks: 1 });
  expect(deck.length).toBe(52);
});

test("buildDeck: { decks: 1 } has exactly 4 of every rank 1..13", () => {
  const counts = rankCounts(buildDeck({ decks: 1 }));
  for (let r = 1; r <= 13; r++) expect(counts.get(r)).toBe(4);
  expect(counts.size).toBe(13);
});

test("buildDeck: { decks: 1 } includes all four suits", () => {
  const suits = new Set(buildDeck({ decks: 1 }).map((c) => c.suit));
  for (const s of SUITS) expect(suits.has(s)).toBe(true);
});

test("buildDeck: { decks: 2 } returns 104 cards with 8 of every rank (parameterized — guards hardcoded-52 regression)", () => {
  const deck = buildDeck({ decks: 2 });
  expect(deck.length).toBe(104);
  const counts = rankCounts(deck);
  for (let r = 1; r <= 13; r++) expect(counts.get(r)).toBe(8);
});

test("buildDeck: is pure — successive calls return equal (but distinct) decks", () => {
  const a = buildDeck({ decks: 1 });
  const b = buildDeck({ decks: 1 });
  expect(a).toEqual(b);
  expect(a).not.toBe(b); // new array each call, no shared mutable state
});

// ---- shuffle (AC-2.1.2) ---------------------------------------------------

test("shuffle: deterministic — same seed yields the same order every run", () => {
  const deck = buildDeck({ decks: 1 });
  const first = shuffle(deck, seededRng(42));
  const second = shuffle(deck, seededRng(42));
  expect(first).toEqual(second);
});

test("shuffle: different seeds generally yield different orders", () => {
  const deck = buildDeck({ decks: 1 });
  const a = shuffle(deck, seededRng(1));
  const b = shuffle(deck, seededRng(999));
  expect(a).not.toEqual(b);
});

test("shuffle: is a permutation — same multiset of cards, same length", () => {
  const deck = buildDeck({ decks: 1 });
  const out = shuffle(deck, seededRng(7));
  expect(out.length).toBe(deck.length);
  const norm = (d: Card[]) =>
    d.map((c) => `${c.rank}${c.suit}`).sort();
  expect(norm(out)).toEqual(norm(deck));
});

test("shuffle: does not mutate its input (returns a new array)", () => {
  const deck = buildDeck({ decks: 1 });
  const snapshot = deck.map((c) => ({ ...c }));
  const out = shuffle(deck, seededRng(123));
  expect(deck).toEqual(snapshot); // original untouched
  expect(out).not.toBe(deck);
});

test("shuffle: exact expected order for a known small deck + fixed seed (locks Fisher–Yates impl)", () => {
  // A 5-card deck; the exact permutation is whatever the seeded LCG drives.
  // This pins the algorithm: a regression that changes the swap math fails here.
  const small: Card[] = [
    { rank: 1, suit: "♠" },
    { rank: 2, suit: "♠" },
    { rank: 3, suit: "♠" },
    { rank: 4, suit: "♠" },
    { rank: 5, suit: "♠" },
  ];
  const out = shuffle(small, seededRng(12345)).map((c) => c.rank);
  // Snapshot of the deterministic result (computed from the LCG + standard Fisher–Yates).
  expect(out).toEqual([5, 1, 3, 2, 4]);
});
