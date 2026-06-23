import { expect, test } from "vitest";
import type { Card, Player, Round } from "@trash/shared";
import { SINGLE_DECK_MAX_PLAYERS } from "@trash/shared";
import {
  allAlivePlayersActed,
  applyDraw,
  applyKeep,
  applySwap,
  buildDeck,
  compositionFor,
  dealRound,
  isLastPlayer,
  nextAliveSeat,
  resolveShowdown,
  shuffle,
} from "./engine.js";

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

// ---- compositionFor (AC-5.1.1 — auto deck scaling, FR-13) ------------------

test("compositionFor: ≤10 players → 1 deck", () => {
  for (const n of [2, 5, 9, 10]) {
    expect(compositionFor(n)).toEqual({ decks: 1 });
  }
});

test("compositionFor: 11–20 players → 2 merged decks", () => {
  for (const n of [11, 15, 20]) {
    expect(compositionFor(n)).toEqual({ decks: 2 });
  }
});

test("compositionFor: the seam is at SINGLE_DECK_MAX_PLAYERS exactly (10 → 1 deck, 11 → 2 decks)", () => {
  expect(compositionFor(SINGLE_DECK_MAX_PLAYERS)).toEqual({ decks: 1 });
  expect(compositionFor(SINGLE_DECK_MAX_PLAYERS + 1)).toEqual({ decks: 2 });
});

test("compositionFor: is pure — same input → same output", () => {
  expect(compositionFor(11)).toEqual(compositionFor(11));
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

// ---- applyDraw (Story 2.6, AC-2.6.2, AC-2.6.4) ----------------------------
// The Last Player's third action: replace the caller's hand with the TOP card of the (already crypto-
// shuffled) deck, REMOVE that card from the deck for the rest of the round (the discarded old card is
// dropped, not re-inserted), record the caller in `acted`, advance the turn right. PURE + value-free
// (no rank read) — the randomness is the prior shuffle, never an rng inside applyDraw.

/** A round with a known deck for the draw tests (roundWith defaults deck:[]). */
function roundWithDeck(currentTurnId: string, hands: Record<string, Card>, deck: Card[]): Round {
  return { ...roundWith(currentTurnId, hands), deck };
}

test("applyDraw: replaces the caller's hand with the top deck card and removes it from the deck", () => {
  const players = [seat("A", 0), seat("B", 1)];
  // Heads-up: A is starting/last-acting; B is the Last Player. Test the draw on B (the last seat).
  const round = roundWithDeck(
    "B",
    { A: { rank: 4, suit: "♠" }, B: { rank: 2, suit: "♥" } },
    [
      { rank: 9, suit: "♦" },
      { rank: 11, suit: "♣" },
    ],
  );
  applyDraw(round, "B", players);
  expect(round.hands.B).toEqual({ rank: 9, suit: "♦" }); // got the top card
  expect(round.deck).toEqual([{ rank: 11, suit: "♣" }]); // top removed; rest preserved in order
});

test("applyDraw: the discarded (old) card is GONE — not re-inserted into the deck", () => {
  const players = [seat("A", 0), seat("B", 1)];
  const round = roundWithDeck("B", { A: { rank: 4, suit: "♠" }, B: { rank: 2, suit: "♥" } }, [
    { rank: 9, suit: "♦" },
  ]);
  applyDraw(round, "B", players);
  // The old card (2♥) must not appear anywhere in the remaining deck.
  expect(round.deck.some((c) => c.rank === 2 && c.suit === "♥")).toBe(false);
  expect(round.deck.length).toBe(0); // one card drawn out of one — deck now empty (mid-round shrink)
});

test("applyDraw: records the caller in acted and advances the turn right (to the starting player)", () => {
  const players = [seat("A", 0), seat("B", 1)];
  const round = roundWithDeck("B", { A: { rank: 4, suit: "♠" }, B: { rank: 2, suit: "♥" } }, [
    { rank: 9, suit: "♦" },
  ]);
  applyDraw(round, "B", players);
  expect(round.acted).toEqual(["B"]);
  expect(round.currentTurnId).toBe("A"); // right-hand neighbor of the last seat is the starting player
});

test("applyDraw: clears any prior swap squirm transient (a new turn action supersedes it)", () => {
  const players = [seat("A", 0), seat("B", 1)];
  const round = roundWithDeck("B", { A: { rank: 4, suit: "♠" }, B: { rank: 2, suit: "♥" } }, [
    { rank: 9, suit: "♦" },
  ]);
  round.lastSwapReceiverId = "B"; // a stale transient from a prior swap
  applyDraw(round, "B", players);
  expect(round.lastSwapReceiverId).toBeUndefined();
});

test("applyDraw: outcome is value-independent — same acted/turn/deck shape for any drawn or held rank (SM-6 (b))", () => {
  // The draw must not depend on either card's value (no timing/behavioral tell on the hidden card).
  for (const drawnRank of [1, 7, 13]) {
    for (const heldRank of [1, 7, 13]) {
      const players = [seat("A", 0), seat("B", 1)];
      const round = roundWithDeck(
        "B",
        { A: { rank: 4, suit: "♠" }, B: { rank: heldRank, suit: "♥" } },
        [{ rank: drawnRank, suit: "♦" }],
      );
      applyDraw(round, "B", players);
      expect(round.acted).toEqual(["B"]);
      expect(round.currentTurnId).toBe("A");
      expect(round.hands.B).toEqual({ rank: drawnRank, suit: "♦" });
      expect(round.deck.length).toBe(0);
    }
  }
});

// ---- allAlivePlayersActed (Story 2.6, AC-2.6.3) ---------------------------
// The pure predicate for the turns → allActed transition: true when every isAlive player is in
// round.acted. Uses isAlive (the Deal-snapshot alive set), never isConnected.

test("allAlivePlayersActed: false mid-pass (not everyone has acted yet)", () => {
  const players = [seat("A", 0), seat("B", 1), seat("C", 2)];
  const round = roundWith("B", { A: { rank: 1, suit: "♠" }, B: { rank: 2, suit: "♥" }, C: { rank: 3, suit: "♦" } });
  round.acted = ["A"]; // only A acted
  expect(allAlivePlayersActed(round, players)).toBe(false);
});

test("allAlivePlayersActed: true when every alive player is in acted", () => {
  const players = [seat("A", 0), seat("B", 1), seat("C", 2)];
  const round = roundWith("A", { A: { rank: 1, suit: "♠" }, B: { rank: 2, suit: "♥" }, C: { rank: 3, suit: "♦" } });
  round.acted = ["A", "B", "C"];
  expect(allAlivePlayersActed(round, players)).toBe(true);
});

test("allAlivePlayersActed: ignores eliminated seats (they are not required to act — forward-compat 3.4)", () => {
  // B is eliminated (no card, not alive). The pass is complete when A and C have acted.
  const players = [seat("A", 0), seat("B", 1, false), seat("C", 2)];
  const round = roundWith("A", { A: { rank: 1, suit: "♠" }, C: { rank: 3, suit: "♦" } });
  round.acted = ["A", "C"];
  expect(allAlivePlayersActed(round, players)).toBe(true);
});

test("allAlivePlayersActed: uses isAlive not isConnected — a disconnected-but-alive seat still owes a turn", () => {
  const players = [seat("A", 0), seat("B", 1), seat("C", 2)];
  players[1].isConnected = false; // B is offline but still alive
  const round = roundWith("A", { A: { rank: 1, suit: "♠" }, B: { rank: 2, suit: "♥" }, C: { rank: 3, suit: "♦" } });
  round.acted = ["A", "C"]; // B (alive but offline) has NOT acted
  expect(allAlivePlayersActed(round, players)).toBe(false);
});

// ---- isLastPlayer (Story 2.6, AC-2.6.1, AC-2.6.5) -------------------------
// The single active alive seat whose right-hand neighbor (nextAliveSeat) is the starting player.
// Value-free (reads startingPlayerId + seatIndex only, never a card). Exactly one seat is true.

test("isLastPlayer: true for the seat whose right-hand neighbor is the starting player", () => {
  // Start = A, order A→B→C→(A). The Last Player is C (from C, the next alive seat is A = start).
  const players = [seat("A", 0), seat("B", 1), seat("C", 2)];
  const round = roundWith("A", { A: { rank: 1, suit: "♠" }, B: { rank: 2, suit: "♥" }, C: { rank: 3, suit: "♦" } });
  expect(isLastPlayer(round, players, "C")).toBe(true);
  expect(isLastPlayer(round, players, "A")).toBe(false);
  expect(isLastPlayer(round, players, "B")).toBe(false);
});

test("isLastPlayer: heads-up (2 players) — the non-starter is the Last Player", () => {
  // Start = A; B is the Last Player (from B the next alive seat is A = start).
  const players = [seat("A", 0), seat("B", 1)];
  const round = roundWith("A", { A: { rank: 1, suit: "♠" }, B: { rank: 2, suit: "♥" } });
  expect(isLastPlayer(round, players, "B")).toBe(true);
  expect(isLastPlayer(round, players, "A")).toBe(false);
});

test("isLastPlayer: skips eliminated seats — the last ALIVE seat before the starter is the Last Player", () => {
  // Start = A; C eliminated. Order over alive {A,B,D}: A→B→D→(A). Last Player is D.
  const players = [seat("A", 0), seat("B", 1), seat("C", 2, false), seat("D", 3)];
  const round = roundWith("A", { A: { rank: 1, suit: "♠" }, B: { rank: 2, suit: "♥" }, D: { rank: 4, suit: "♣" } });
  expect(isLastPlayer(round, players, "D")).toBe(true);
  expect(isLastPlayer(round, players, "C")).toBe(false); // eliminated seat is never the last player
  expect(isLastPlayer(round, players, "B")).toBe(false);
});

test("isLastPlayer: exactly one alive seat is the Last Player", () => {
  const players = [seat("A", 0), seat("B", 1), seat("C", 2), seat("D", 3)];
  const round = roundWith("B", {
    A: { rank: 1, suit: "♠" },
    B: { rank: 2, suit: "♥" },
    C: { rank: 3, suit: "♦" },
    D: { rank: 4, suit: "♣" },
  });
  const flags = players.map((p) => isLastPlayer(round, players, p.id));
  expect(flags.filter(Boolean).length).toBe(1);
  // Start = B → order B→C→D→A→(B). Last Player is A (from A the next alive is B = start).
  expect(isLastPlayer(round, players, "A")).toBe(true);
});

// ---- resolveShowdown (Story 3.1, AC-3.1.1..3.1.6) -------------------------
// The pure canonical Showdown resolution (architecture.md#D6 421–435): lowest-rank loser(s)
// (suit ignored; ties all lose), -1 life/loser, isAlive=false at 0, win-check, then ONLY when
// ≥2 alive remain, the step-6 next-starting-player tiebreak via nextAliveSeat. PURE: returns a
// NEW players array, never mutates inputs.

/** Seat with explicit lives (the resolution math needs precise life counts, not the 3/0 default). */
function seatL(id: string, seatIndex: number, lives: number, isAlive = lives > 0): Player {
  return { id, name: `name-${id}`, lives, isAlive, isConnected: true, seatIndex };
}

/** Build a hands record from {id: rank} (suit is irrelevant to resolution — pinned by the suit-ignored test). */
function handsOf(byRank: Record<string, number>): Record<string, Card> {
  const h: Record<string, Card> = {};
  for (const [id, rank] of Object.entries(byRank)) h[id] = { rank, suit: "♠" };
  return h;
}

test("resolveShowdown: PURE — does not mutate the input players (lives/isAlive unchanged on the argument)", () => {
  const players = [seatL("A", 0, 3), seatL("B", 1, 3), seatL("C", 2, 3)];
  const snapshot = players.map((p) => ({ ...p }));
  resolveShowdown(players, handsOf({ A: 1, B: 5, C: 9 }), "A");
  expect(players).toEqual(snapshot); // inputs untouched — caller owns mutation/persistence.
});

test("resolveShowdown: single lowest loser — deducts one life from that player only, others untouched", () => {
  const players = [seatL("A", 0, 3), seatL("B", 1, 3), seatL("C", 2, 3)];
  const r = resolveShowdown(players, handsOf({ A: 1, B: 5, C: 9 }), "A");
  expect(r.loserIds).toEqual(["A"]);
  const byId = Object.fromEntries(r.players.map((p) => [p.id, p]));
  expect(byId.A.lives).toBe(2);
  expect(byId.B.lives).toBe(3);
  expect(byId.C.lives).toBe(3);
  expect(r.outcome).toEqual({ kind: "continue", nextStartingPlayerId: "A" }); // ≥2 alive → A (the lone loser) starts.
});

test("resolveShowdown: suit is IGNORED — lowest is by rank only", () => {
  // Same lowest rank (1) for A regardless of suit; suit must never break the tie or change the loser.
  const players = [seatL("A", 0, 3), seatL("B", 1, 3)];
  const r = resolveShowdown(
    players,
    { A: { rank: 1, suit: "♣" }, B: { rank: 1, suit: "♠" } },
    "A",
  );
  // Equal ranks → BOTH lose (exact value-tie), suit does not arbitrate.
  expect(r.loserIds.sort()).toEqual(["A", "B"]);
});

test("resolveShowdown: two-way tie — every tied lowest player loses a life", () => {
  const players = [seatL("A", 0, 3), seatL("B", 1, 3), seatL("C", 2, 3)];
  const r = resolveShowdown(players, handsOf({ A: 2, B: 2, C: 7 }), "A");
  expect(r.loserIds.sort()).toEqual(["A", "B"]);
  const byId = Object.fromEntries(r.players.map((p) => [p.id, p]));
  expect(byId.A.lives).toBe(2);
  expect(byId.B.lives).toBe(2);
  expect(byId.C.lives).toBe(3);
});

test("resolveShowdown: all-tied — every player same rank, all lose a life, all continue (≥2 alive)", () => {
  const players = [seatL("A", 0, 3), seatL("B", 1, 3), seatL("C", 2, 3)];
  const r = resolveShowdown(players, handsOf({ A: 6, B: 6, C: 6 }), "A");
  expect(r.loserIds.sort()).toEqual(["A", "B", "C"]);
  for (const p of r.players) expect(p.lives).toBe(2);
  expect(r.outcome.kind).toBe("continue");
});

test("resolveShowdown: single-survivor win — the last player with lives wins (game over), no tiebreak", () => {
  // A and B at 1 life tie for lowest → both drop to 0 → eliminated; C survives → C wins.
  const players = [seatL("A", 0, 1), seatL("B", 1, 1), seatL("C", 2, 3)];
  const r = resolveShowdown(players, handsOf({ A: 2, B: 2, C: 9 }), "A");
  expect(r.loserIds.sort()).toEqual(["A", "B"]);
  const byId = Object.fromEntries(r.players.map((p) => [p.id, p]));
  expect(byId.A.isAlive).toBe(false);
  expect(byId.B.isAlive).toBe(false);
  expect(byId.C.isAlive).toBe(true);
  expect(r.outcome).toEqual({ kind: "winner", winnerIds: ["C"] });
});

test("resolveShowdown: zero-survivors shared win — all tied to zero in one showdown → all co-winners (game over)", () => {
  // Everyone at 1 life, all tied lowest → all drop to 0 → 0 alive → shared win names ALL.
  const players = [seatL("A", 0, 1), seatL("B", 1, 1), seatL("C", 2, 1)];
  const r = resolveShowdown(players, handsOf({ A: 4, B: 4, C: 4 }), "A");
  expect(r.loserIds.sort()).toEqual(["A", "B", "C"]);
  expect(r.outcome.kind).toBe("winner");
  if (r.outcome.kind === "winner") expect(r.outcome.winnerIds.sort()).toEqual(["A", "B", "C"]); // co-winners, none dropped.
});

test("resolveShowdown: tiebreak — multi-loser, next starter is the tied loser earliest from the previous starter's seat", () => {
  // Prev starter = A (seat 0). B (seat 1) and D (seat 3) tie for lowest, both survive. Scanning right
  // from A: seat 1 (B) is the first tied loser → B starts the next round.
  const players = [seatL("A", 0, 3), seatL("B", 1, 3), seatL("C", 2, 3), seatL("D", 3, 3)];
  const r = resolveShowdown(players, handsOf({ A: 9, B: 2, C: 7, D: 2 }), "A");
  expect(r.loserIds.sort()).toEqual(["B", "D"]);
  expect(r.outcome).toEqual({ kind: "continue", nextStartingPlayerId: "B" });
});

test("resolveShowdown: tiebreak — previous starter is eligible if they are themselves a tied loser", () => {
  // Prev starter = B (seat 1), and B is a tied loser. Scan right from B's seat INCLUDING B → B starts.
  const players = [seatL("A", 0, 3), seatL("B", 1, 3), seatL("C", 2, 3), seatL("D", 3, 3)];
  const r = resolveShowdown(players, handsOf({ A: 9, B: 2, C: 7, D: 2 }), "B");
  expect(r.loserIds.sort()).toEqual(["B", "D"]);
  expect(r.outcome).toEqual({ kind: "continue", nextStartingPlayerId: "B" });
});

test("resolveShowdown: tiebreak-with-eliminated-loser — the tied loser was eliminated, next surviving seat to their right starts (AC-3.1.6)", () => {
  // A,B,C survivors (3 lives); D at seat 3 has 1 life. Lowest rank shared by B(seat1, 3 lives) and
  // D(seat3, 1 life) → both lose; D drops to 0 → eliminated. Prev starter = C (seat 2). Scan right
  // from C: seat 3 (D) is a tied loser BUT eliminated → skip to the next surviving seat to D's right
  // = seat 0 (A). But A is not a tied loser... the rule: earliest TIED loser seated from prev starter;
  // if that loser is eliminated, the next SURVIVING seat to THEIR right. So from C: first tied loser
  // scanning right is D (seat 3); D eliminated → next surviving seat right of D = A (seat 0).
  const players = [seatL("A", 0, 3), seatL("B", 1, 3), seatL("C", 2, 3), seatL("D", 3, 1)];
  const r = resolveShowdown(players, handsOf({ A: 9, B: 2, C: 7, D: 2 }), "C");
  expect(r.loserIds.sort()).toEqual(["B", "D"]);
  const byId = Object.fromEntries(r.players.map((p) => [p.id, p]));
  expect(byId.D.isAlive).toBe(false);
  expect(r.outcome).toEqual({ kind: "continue", nextStartingPlayerId: "A" });
});

test("resolveShowdown: E3 — MULTIPLE tied losers ALL eliminated while ≥2 survive; scan skips ALL of them to the next surviving seat", () => {
  // Seats: A(0,3) B(1,1) C(2,1) D(3,3) E(4,3). Lowest rank shared by B,C (both 1 life) → both lose,
  // both eliminated. Survivors after: A,D,E (≥2 alive → continue). Prev starter = A (seat 0). Scan
  // right from A: first tied loser is B (seat 1); B eliminated → next surviving seat right of B that
  // skips the OTHER eliminated tied loser C (seat 2) → D (seat 3).
  const players = [seatL("A", 0, 3), seatL("B", 1, 1), seatL("C", 2, 1), seatL("D", 3, 3), seatL("E", 4, 3)];
  const r = resolveShowdown(players, handsOf({ A: 9, B: 3, C: 3, D: 7, E: 8 }), "A");
  expect(r.loserIds.sort()).toEqual(["B", "C"]);
  const byId = Object.fromEntries(r.players.map((p) => [p.id, p]));
  expect(byId.B.isAlive).toBe(false);
  expect(byId.C.isAlive).toBe(false);
  expect(r.outcome).toEqual({ kind: "continue", nextStartingPlayerId: "D" });
});

test("resolveShowdown: PARAMETERIZED 2..20 — single lowest loser resolves correctly at every table size", () => {
  for (let n = 2; n <= 20; n++) {
    const players = Array.from({ length: n }, (_, i) => seatL(`P${i}`, i, 3));
    // P0 gets the unique lowest rank (1); everyone else gets rank 13 (Kings) so P0 is the sole loser.
    const byRank: Record<string, number> = { P0: 1 };
    for (let i = 1; i < n; i++) byRank[`P${i}`] = 13;
    const r = resolveShowdown(players, handsOf(byRank), "P0");
    expect(r.loserIds).toEqual(["P0"]);
    const p0 = r.players.find((p) => p.id === "P0")!;
    expect(p0.lives).toBe(2);
    // ≥2 alive at every n≥2 here (only P0 loses one of 3 lives) → continue, P0 starts.
    expect(r.outcome).toEqual({ kind: "continue", nextStartingPlayerId: "P0" });
  }
});

test("resolveShowdown: PARAMETERIZED 2..20 — all-tied deducts one life from EVERY player at every table size", () => {
  for (let n = 2; n <= 20; n++) {
    const players = Array.from({ length: n }, (_, i) => seatL(`P${i}`, i, 3));
    const byRank: Record<string, number> = {};
    for (let i = 0; i < n; i++) byRank[`P${i}`] = 6; // everyone the same rank → all lose.
    const r = resolveShowdown(players, handsOf(byRank), "P0");
    expect(r.loserIds.sort()).toEqual(players.map((p) => p.id).sort());
    for (const p of r.players) expect(p.lives).toBe(2);
    expect(r.outcome.kind).toBe("continue"); // all still at 2 lives → ≥2 alive.
  }
});

test("resolveShowdown: PARAMETERIZED 2..20 — all-tied-to-zero is a shared win naming every player at every table size", () => {
  for (let n = 2; n <= 20; n++) {
    const players = Array.from({ length: n }, (_, i) => seatL(`P${i}`, i, 1)); // everyone at 1 life
    const byRank: Record<string, number> = {};
    for (let i = 0; i < n; i++) byRank[`P${i}`] = 5; // all tied → all drop to 0 → 0 alive → shared win.
    const r = resolveShowdown(players, handsOf(byRank), "P0");
    expect(r.outcome.kind).toBe("winner");
    if (r.outcome.kind === "winner") {
      expect(r.outcome.winnerIds.sort()).toEqual(players.map((p) => p.id).sort());
    }
  }
});

test("resolveShowdown: PARAMETERIZED 2..20 — two-way tie deducts a life from BOTH tied lowest at every table size", () => {
  for (let n = 2; n <= 20; n++) {
    const players = Array.from({ length: n }, (_, i) => seatL(`P${i}`, i, 3));
    // P0 and P1 tie for the unique lowest rank (1); everyone else (n≥3) holds a King so only P0,P1 lose.
    const byRank: Record<string, number> = { P0: 1, P1: 1 };
    for (let i = 2; i < n; i++) byRank[`P${i}`] = 13;
    const r = resolveShowdown(players, handsOf(byRank), "P0");
    expect(r.loserIds.sort()).toEqual(["P0", "P1"]);
    const byId = Object.fromEntries(r.players.map((p) => [p.id, p]));
    expect(byId.P0.lives).toBe(2);
    expect(byId.P1.lives).toBe(2);
    for (let i = 2; i < n; i++) expect(byId[`P${i}`].lives).toBe(3); // non-losers untouched.
    // ≥2 alive everywhere (all losers were at 3 lives) → continue; earliest tied loser from P0 = P0.
    expect(r.outcome).toEqual({ kind: "continue", nextStartingPlayerId: "P0" });
  }
});

test("resolveShowdown: PARAMETERIZED 2..20 — single-survivor win (all-but-one tied to zero) at every table size", () => {
  for (let n = 2; n <= 20; n++) {
    // P0..P(n-2) at 1 life tie for lowest → all drop to 0 → eliminated; P(n-1) at 3 lives survives → wins.
    const players = Array.from({ length: n }, (_, i) => seatL(`P${i}`, i, i === n - 1 ? 3 : 1));
    const byRank: Record<string, number> = {};
    for (let i = 0; i < n - 1; i++) byRank[`P${i}`] = 2; // the tied lowest → all lose.
    byRank[`P${n - 1}`] = 13; // the lone survivor holds the highest, never a loser.
    const r = resolveShowdown(players, handsOf(byRank), "P0");
    expect(r.outcome).toEqual({ kind: "winner", winnerIds: [`P${n - 1}`] }); // sole winner, no tiebreak.
  }
});

test("resolveShowdown: PARAMETERIZED 2..20 — tiebreak-with-eliminated-loser: scan skips the dead loser to the next surviving seat (AC-3.1.6)", () => {
  // The eliminated-loser skip needs a tied loser to be eliminated WHILE ≥2 survive → smallest n is 3.
  for (let n = 3; n <= 20; n++) {
    // Seat 0 (P0) is a tied loser at 1 life → eliminated; seat 1 (P1) is a tied loser at 3 lives → survives.
    // Everyone else (seats 2..) holds a King and is untouched. Prev starter = P0 (seat 0). Scan right from
    // seat 0: P0 is the earliest tied loser BUT eliminated → next surviving seat to its right = P1 (seat 1).
    const players = Array.from({ length: n }, (_, i) => seatL(`P${i}`, i, i === 0 ? 1 : 3));
    const byRank: Record<string, number> = { P0: 2, P1: 2 };
    for (let i = 2; i < n; i++) byRank[`P${i}`] = 13;
    const r = resolveShowdown(players, handsOf(byRank), "P0");
    expect(r.loserIds.sort()).toEqual(["P0", "P1"]);
    const byId = Object.fromEntries(r.players.map((p) => [p.id, p]));
    expect(byId.P0.isAlive).toBe(false); // the eliminated tied loser.
    expect(r.outcome).toEqual({ kind: "continue", nextStartingPlayerId: "P1" });
  }
});

test("resolveShowdown: PARAMETERIZED 4..20 — E3 multiple tied losers ALL eliminated, scan skips ALL to the next survivor (AC-3.1.6)", () => {
  // Two ADJACENT tied losers (seats 0,1) both at 1 life → both eliminated while ≥2 survive (seats 2..).
  // Needs ≥2 survivors AFTER removing 2 losers → smallest n is 4. Prev starter = P0 (seat 0): scan right
  // hits P0 (dead loser) → next surviving seat skips P1 (the OTHER dead loser) → P2 (seat 2).
  for (let n = 4; n <= 20; n++) {
    const players = Array.from({ length: n }, (_, i) => seatL(`P${i}`, i, i < 2 ? 1 : 3));
    const byRank: Record<string, number> = { P0: 2, P1: 2 };
    for (let i = 2; i < n; i++) byRank[`P${i}`] = 13;
    const r = resolveShowdown(players, handsOf(byRank), "P0");
    expect(r.loserIds.sort()).toEqual(["P0", "P1"]);
    const byId = Object.fromEntries(r.players.map((p) => [p.id, p]));
    expect(byId.P0.isAlive).toBe(false);
    expect(byId.P1.isAlive).toBe(false);
    expect(r.outcome).toEqual({ kind: "continue", nextStartingPlayerId: "P2" });
  }
});

// ---- resolveShowdown precondition asserts (Story 3.1, code-review 2026-06-22) ----
// assert-in-primitive extended to resolveShowdown so the 3.4 dealAgain caller (possibly-eliminated
// previous host / malformed hands) gets a named Error, not a bare TypeError / silent no-op resolution.

test("resolveShowdown: ASSERTS a seated previousStartingPlayerId — throws when the previous starter is not in players", () => {
  const players = [seatL("A", 0, 3), seatL("B", 1, 3), seatL("C", 2, 3)];
  // "Z" is not seated (the eliminated-and-removed previous host hazard) → named throw, not a TypeError.
  expect(() => resolveShowdown(players, handsOf({ A: 2, B: 7, C: 9 }), "Z")).toThrow(/not a seated player/);
  // A real seated previous starter still resolves (no regression).
  expect(() => resolveShowdown(players, handsOf({ A: 2, B: 7, C: 9 }), "A")).not.toThrow();
});

test("resolveShowdown: ASSERTS at least one revealed hand — throws on empty hands (no Math.min(Infinity) no-op)", () => {
  const players = [seatL("A", 0, 3), seatL("B", 1, 3)];
  expect(() => resolveShowdown(players, {}, "A")).toThrow(/no revealed hands/);
});

// ---- Action-4 primitive hardening (Story 3.1, AC-3.1.7) -------------------
// The forward-deferred precondition gaps come due at 3.4's dealAgain. Resolved decision:
// assert-in-primitive (epic-2-retro-2026-06-22.md:74; deferred-work.md:45-47). The primitives
// assert their own preconditions so a downstream caller can never silently corrupt state.

test("dealRound: ASSERTS deck coverage — throws when deck.length < aliveCount (closes engine.ts:115 silent-undefined)", () => {
  // 3 alive players but a composition that cannot cover them is rejected by the caller (assertDealable);
  // the primitive itself now also guards. Force the breach: a single deck (52) cannot cover 53 alive.
  const players = Array.from({ length: 53 }, (_, i) => seatL(`P${i}`, i, 3));
  expect(() => dealRound(players, { decks: 1 }, seededRng(1), "P0")).toThrow();
});

test("dealRound: ASSERTS a valid alive starter — throws when startingPlayerId is not an alive seated player (closes engine.ts:118-120)", () => {
  const players = [seatL("A", 0, 3), seatL("B", 1, 0, false), seatL("C", 2, 3)];
  // Eliminated previous host (the 3.4 dealAgain hazard): B is not alive → cannot be the starter.
  expect(() => dealRound(players, { decks: 1 }, seededRng(1), "B")).toThrow();
  // Unknown id (not seated at all) → also rejected.
  expect(() => dealRound(players, { decks: 1 }, seededRng(1), "Z")).toThrow();
  // A real alive seated starter still works (no regression to the 2.3 path).
  expect(() => dealRound(players, { decks: 1 }, seededRng(1), "A")).not.toThrow();
});

test("nextAliveSeat: ASSERTS a known fromSeatIndex — throws on an unknown seat (closes engine.ts:77,87 silent-guess)", () => {
  const players = [seat("A", 0), seat("B", 1), seat("C", 2)];
  // Seat 99 does not exist — must assert rather than silently walking from index 0.
  expect(() => nextAliveSeat(players, 99)).toThrow();
});

test("nextAliveSeat: hardening preserves the lone-alive-seat-returns-itself contract (regression guard)", () => {
  // A is the only alive seat at a KNOWN index → still returns itself; the assert is for UNKNOWN seats only.
  const players = [seat("A", 0), seat("B", 1, false), seat("C", 2, false)];
  expect(nextAliveSeat(players, 0)).toBe("A");
});
