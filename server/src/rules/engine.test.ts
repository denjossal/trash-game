import { expect, test } from "vitest";
import type { Card, Player, Round } from "@trash/shared";
import { applyKeep, applySwap, buildDeck, dealRound, nextAliveSeat, shuffle } from "./engine.js";

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

// ---- nextAliveSeat (Story 2.3, AC-2.3.3) ----------------------------------
// The single rotation primitive: walk RIGHT (increasing seatIndex, wrapping), skipping non-alive
// seats. Reused by turn order (2.4), "Player to your right" (2.4 swap), and the D6 tiebreak (3.1).

function seat(id: string, seatIndex: number, isAlive = true): Player {
  return { id, name: `name-${id}`, lives: isAlive ? 3 : 0, isAlive, isConnected: true, seatIndex };
}

test("nextAliveSeat: returns the next seat to the right (increasing seatIndex)", () => {
  const players = [seat("A", 0), seat("B", 1), seat("C", 2)];
  expect(nextAliveSeat(players, 0)).toBe("B");
  expect(nextAliveSeat(players, 1)).toBe("C");
});

test("nextAliveSeat: wraps from the last seat back to the first", () => {
  const players = [seat("A", 0), seat("B", 1), seat("C", 2)];
  expect(nextAliveSeat(players, 2)).toBe("A");
});

test("nextAliveSeat: skips non-alive seats (eliminated players are not in turn order)", () => {
  // B is eliminated — from A, the next alive seat to the right is C (skip B).
  const players = [seat("A", 0), seat("B", 1, false), seat("C", 2)];
  expect(nextAliveSeat(players, 0)).toBe("C");
  // From C, wrap past A? A is alive — so C → A.
  expect(nextAliveSeat(players, 2)).toBe("A");
});

test("nextAliveSeat: a single alive seat returns itself (wraps all the way around)", () => {
  const players = [seat("A", 0), seat("B", 1, false), seat("C", 2, false)];
  expect(nextAliveSeat(players, 0)).toBe("A");
});

test("nextAliveSeat: respects seatIndex order, not array order", () => {
  // Array is out of seat order; the walk follows seatIndex, not the array position.
  const players = [seat("C", 2), seat("A", 0), seat("B", 1)];
  expect(nextAliveSeat(players, 0)).toBe("B"); // seat 0 → seat 1 (B)
  expect(nextAliveSeat(players, 2)).toBe("A"); // seat 2 → wrap → seat 0 (A)
});

// ---- dealRound (Story 2.3, AC-2.3.1, AC-2.3.3) ----------------------------

test("dealRound: deals exactly one card per alive player, leaves the rest in the deck", () => {
  const players = [seat("A", 0), seat("B", 1), seat("C", 2)];
  const round = dealRound(players, { decks: 1 }, seededRng(42), "A");
  expect(Object.keys(round.hands).sort()).toEqual(["A", "B", "C"]);
  // 3 cards dealt out of 52 → 49 remain in the deck; no card lost or duplicated.
  expect(round.deck.length).toBe(52 - 3);
});

test("dealRound: sets the fresh-round invariants (acted empty, not revealed, turnToken 0, currentTurn = starting)", () => {
  const players = [seat("A", 0), seat("B", 1)];
  const round = dealRound(players, { decks: 1 }, seededRng(7), "A");
  expect(round.acted).toEqual([]);
  expect(round.revealed).toBe(false);
  expect(round.turnToken).toBe(0);
  expect(round.startingPlayerId).toBe("A");
  expect(round.currentTurnId).toBe("A");
});

test("dealRound: deals ONLY to alive players (eliminated seats get no card)", () => {
  const players = [seat("A", 0), seat("B", 1, false), seat("C", 2)];
  const round = dealRound(players, { decks: 1 }, seededRng(7), "A");
  expect(Object.keys(round.hands).sort()).toEqual(["A", "C"]);
  expect(round.hands.B).toBeUndefined();
  // 2 alive dealt → 50 remain.
  expect(round.deck.length).toBe(50);
});

test("dealRound: every dealt card is a valid card, and dealt + deck = the full shuffled deck (no loss/dupe)", () => {
  const players = [seat("A", 0), seat("B", 1), seat("C", 2)];
  const round = dealRound(players, { decks: 1 }, seededRng(99), "A");
  const all = [...Object.values(round.hands), ...round.deck];
  expect(all.length).toBe(52);
  const norm = (d: Card[]) => d.map((c) => `${c.rank}${c.suit}`).sort();
  expect(norm(all)).toEqual(norm(buildDeck({ decks: 1 })));
});

test("dealRound: is deterministic for a fixed seed (the injected-rng contract)", () => {
  const players = [seat("A", 0), seat("B", 1), seat("C", 2)];
  const first = dealRound(players, { decks: 1 }, seededRng(12345), "A");
  const second = dealRound(players, { decks: 1 }, seededRng(12345), "A");
  expect(first.hands).toEqual(second.hands);
  expect(first.deck).toEqual(second.deck);
});

// ---- applyKeep / applySwap (Story 2.4, AC-2.4.3, AC-2.4.4) -----------------
// Both are PURE mutators on the passed-in round: append the caller to `acted` and advance
// `currentTurnId` to the right-hand neighbor (nextAliveSeat). Keep leaves hands untouched; Swap
// EXCHANGES the caller's hand with the neighbor's — UNCONDITIONALLY (no King/rank branch — FR-8).

/** Build a minimal round with known hands for the turn-action tests. */
function roundWith(currentTurnId: string, hands: Record<string, Card>): Round {
  return {
    startingPlayerId: currentTurnId,
    currentTurnId,
    turnToken: 0,
    hands,
    deck: [],
    acted: [],
    revealed: false,
  };
}

test("applyKeep: leaves all hands untouched, records the caller in acted, advances the turn right", () => {
  const players = [seat("A", 0), seat("B", 1), seat("C", 2)];
  const round = roundWith("A", {
    A: { rank: 2, suit: "♠" },
    B: { rank: 7, suit: "♥" },
    C: { rank: 10, suit: "♦" },
  });
  applyKeep(round, "A", players);
  expect(round.hands.A).toEqual({ rank: 2, suit: "♠" }); // unchanged
  expect(round.hands.B).toEqual({ rank: 7, suit: "♥" });
  expect(round.acted).toEqual(["A"]);
  expect(round.currentTurnId).toBe("B"); // turn passes right
});

test("applySwap: exchanges the caller's and right-hand neighbor's cards (each ends with the other's former card)", () => {
  const players = [seat("A", 0), seat("B", 1), seat("C", 2)];
  const round = roundWith("A", {
    A: { rank: 2, suit: "♠" },
    B: { rank: 7, suit: "♥" },
    C: { rank: 10, suit: "♦" },
  });
  applySwap(round, "A", players);
  expect(round.hands.A).toEqual({ rank: 7, suit: "♥" }); // A now holds B's former card
  expect(round.hands.B).toEqual({ rank: 2, suit: "♠" }); // B now holds A's former card
  expect(round.hands.C).toEqual({ rank: 10, suit: "♦" }); // untouched
});

test("applySwap: everyone still holds exactly one card after the exchange", () => {
  const players = [seat("A", 0), seat("B", 1), seat("C", 2)];
  const round = roundWith("A", {
    A: { rank: 2, suit: "♠" },
    B: { rank: 7, suit: "♥" },
    C: { rank: 10, suit: "♦" },
  });
  applySwap(round, "A", players);
  expect(Object.keys(round.hands).sort()).toEqual(["A", "B", "C"]);
  for (const id of ["A", "B", "C"]) expect(round.hands[id]).toBeDefined();
});

test("applySwap: records the caller in acted and advances the turn to the right-hand neighbor (same seat as the swap target)", () => {
  const players = [seat("A", 0), seat("B", 1), seat("C", 2)];
  const round = roundWith("A", {
    A: { rank: 2, suit: "♠" },
    B: { rank: 7, suit: "♥" },
    C: { rank: 10, suit: "♦" },
  });
  applySwap(round, "A", players);
  expect(round.acted).toEqual(["A"]);
  expect(round.currentTurnId).toBe("B"); // swap target == next actor (Player to the right)
});

test("applySwap: King-no-read — swap STILL happens when the neighbor holds a King (rank 13); no refusal, no King branch (FR-8/AC-2.4.6)", () => {
  const players = [seat("A", 0), seat("B", 1)];
  const round = roundWith("A", {
    A: { rank: 5, suit: "♠" },
    B: { rank: 13, suit: "♥" }, // the King — un-dumpable is a SOCIAL rule, never enforced in code
  });
  applySwap(round, "A", players);
  // The exchange is unconditional: A receives the King, B receives A's 5. No value-dependent branch.
  expect(round.hands.A).toEqual({ rank: 13, suit: "♥" });
  expect(round.hands.B).toEqual({ rank: 5, suit: "♠" });
});

test("applySwap: outcome is value-independent — same acted/turn/exchange shape for King, Ace, or mid rank (King-no-read regression)", () => {
  // The swap decision must not depend on the neighbor's card value (SM-6 inference channel (b)/(c)).
  for (const neighborRank of [1, 7, 13]) {
    const players = [seat("A", 0), seat("B", 1)];
    const round = roundWith("A", {
      A: { rank: 5, suit: "♠" },
      B: { rank: neighborRank, suit: "♥" },
    });
    applySwap(round, "A", players);
    expect(round.acted).toEqual(["A"]);
    expect(round.currentTurnId).toBe("B");
    expect(round.hands.A).toEqual({ rank: neighborRank, suit: "♥" });
    expect(round.hands.B).toEqual({ rank: 5, suit: "♠" });
  }
});

test("applySwap: skips an eliminated seat to find the right-hand neighbor (reuses nextAliveSeat)", () => {
  // B is eliminated (no card); the swap target / next actor from A is C.
  const players = [seat("A", 0), seat("B", 1, false), seat("C", 2)];
  const round = roundWith("A", {
    A: { rank: 2, suit: "♠" },
    C: { rank: 10, suit: "♦" },
  });
  applySwap(round, "A", players);
  expect(round.hands.A).toEqual({ rank: 10, suit: "♦" });
  expect(round.hands.C).toEqual({ rank: 2, suit: "♠" });
  expect(round.currentTurnId).toBe("C");
});
