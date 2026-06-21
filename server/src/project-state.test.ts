// STANDING SM-6 CI GATE (Pre-mortem E). Every later epic that adds a ProjectedTableState field MUST
// re-pass this test for that field: the new field carries no card value or pre-Showdown-inferable
// information while revealed===false.
//
// This is the negative-assertion privacy test — the SM-6 acceptance criterion (the one hard
// integrity rule). It runs in the node `rules` vitest project (`*.test.ts` suffix); projectStateFor
// is a PURE function so there is no WS/DO plumbing here. It asserts ONLY the `revealed === false`
// behavior — the `revealed === true` projection is Story 3.2's acceptance, not this story's.
// [Source: story 1.4 AC3/AC4; server/vitest.config.ts naming convention.]
import { expect, test } from "vitest";
import type { Card, Player, Round, TableState } from "@trash/shared";
import { projectStateFor } from "./project-state.js";

// ---------------------------------------------------------------------------
// Fixture builders — distinct, recognizable card values so a leak is unambiguous.
// ---------------------------------------------------------------------------

function player(id: string, seatIndex: number): Player {
  return { id, name: `name-${id}`, lives: 3, isAlive: true, isConnected: true, seatIndex };
}

// Three seats holding DISTINCT ranks. `hands` is the only thing that varies between the two
// constant-shape fixtures, so card values are isolated from every other field.
function tableWithHands(hands: Record<string, Card>): TableState {
  const players: Player[] = [player("A", 0), player("B", 1), player("C", 2)];
  const round: Round = {
    startingPlayerId: "A",
    currentTurnId: "A",
    turnToken: 0,
    hands,
    deck: [],
    acted: [],
    revealed: false, // pre-Showdown — the only behavior this test asserts.
  };
  return {
    code: "WXYZ",
    phase: "turns",
    hostId: "A",
    startingLives: 3,
    players,
    round,
    phaseToken: 0,
  };
}

// Recursively collect every primitive value that appears anywhere in a serialized projection.
// Used to prove a non-owner's card value is ABSENT (a deep walk catches a leak no matter which
// field — known or future — it hides in).
function collectValues(node: unknown, sink: Set<unknown>): void {
  if (node === null || typeof node !== "object") {
    sink.add(node);
    return;
  }
  for (const v of Object.values(node)) collectValues(v, sink);
}

// ---------------------------------------------------------------------------
// AC3 — value-absence: no OTHER player's card value appears anywhere in the projection.
// ---------------------------------------------------------------------------

test("SM-6: pre-reveal projection omits every non-owner card value (AC3)", () => {
  // Card ranks are chosen DISJOINT from every other integer the fixture emits (lives 3, startingLives
  // 3, seatIndex 0/1/2, turnToken 0, phaseToken 0) so a leaked rank cannot be masked by — nor produce
  // a false positive against — a coincidentally-equal benign value in the flat value Set. Ranks 6/9/12
  // satisfy this; each card also carries a DISTINCT suit so a non-owner suit cannot be masked by the
  // owner's suit. [Review 2026-06-19: original 3/7/11 fixture collided rank 3 with lives/startingLives.]
  const handA: Card = { rank: 6, suit: "♠" };
  const handB: Card = { rank: 9, suit: "♥" };
  const handC: Card = { rank: 12, suit: "♦" };
  const state = tableWithHands({ A: handA, B: handB, C: handC });

  // Round-trip through JSON so the assertion sees exactly the wire bytes.
  const projection = JSON.parse(JSON.stringify(projectStateFor(state, "A")));

  const values = new Set<unknown>();
  collectValues(projection, values);

  // Owner's OWN card IS present (in you.hand) — privacy must not over-redact the owner. Rank 6 is
  // disjoint from every benign integer, so this membership proves you.hand specifically (not lives).
  expect(projection.you.hand).toEqual(handA);
  expect(values.has(handA.rank)).toBe(true);

  // No OTHER player's rank OR suit appears ANYWHERE in the payload. Suits are the only collision-free
  // discriminator, so asserting both rank and suit absence is what makes the leak check sound.
  expect(values.has(handB.rank)).toBe(false);
  expect(values.has(handB.suit)).toBe(false);
  expect(values.has(handC.rank)).toBe(false);
  expect(values.has(handC.suit)).toBe(false);

  // players[] entries for NON-owner seats carry no `hand` key at all; the owner's seat ALSO carries
  // no hand (self's card lives only in you.hand — no you↔players[] double source of truth).
  for (const entry of projection.players) {
    expect("hand" in entry).toBe(false);
  }
});

// ---------------------------------------------------------------------------
// AC4 — constant message shape: the pre-Showdown projection has identical structure / field-set /
// players[] length regardless of any hidden card value (no value-dependent shape branch).
// ---------------------------------------------------------------------------

test("SM-6: pre-reveal projection has constant shape across differing hidden values (AC4)", () => {
  const first = tableWithHands({
    A: { rank: 3, suit: "♠" },
    B: { rank: 7, suit: "♥" },
    C: { rank: 11, suit: "♦" },
  });
  // Identical in EVERY respect except every hidden card value differs.
  const second = tableWithHands({
    A: { rank: 1, suit: "♣" },
    B: { rank: 13, suit: "♦" },
    C: { rank: 5, suit: "♠" },
  });

  const projFirst = JSON.parse(JSON.stringify(projectStateFor(first, "A")));
  const projSecond = JSON.parse(JSON.stringify(projectStateFor(second, "A")));

  // Strip the one field that legitimately varies with the OWNER's own card.
  delete projFirst.you.hand;
  delete projSecond.you.hand;

  // Byte-for-byte structural identity: same field-set, same nesting, same players[] length.
  // A value-dependent branch that changed shape or size would fail here.
  expect(projFirst).toEqual(projSecond);
  expect(projFirst.players.length).toBe(projSecond.players.length);
});

// ---------------------------------------------------------------------------
// Story 2.3 — a freshly DEALT round projects ONLY the caller's own Card; the dealt state carries
// `phase:"turns"` + currentTurnId. Complements the standing SM-6 negative assertion: it proves the
// OWNER's card IS present after a real deal, while every non-owner's hand is omitted.
// ---------------------------------------------------------------------------

test("2.3: a dealt round projects the caller's own hand and omits every other seat's (turns phase)", () => {
  const handA: Card = { rank: 6, suit: "♠" };
  const handB: Card = { rank: 9, suit: "♥" };
  const handC: Card = { rank: 12, suit: "♦" };
  const state = tableWithHands({ A: handA, B: handB, C: handC }); // revealed:false, phase:"turns".

  // Project for B — B should see its OWN card, nobody else's.
  const projection = JSON.parse(JSON.stringify(projectStateFor(state, "B")));

  expect(projection.phase).toBe("turns");
  expect(projection.currentTurnId).toBe("A"); // fixture's startingPlayerId / currentTurnId
  expect(projection.you.hand).toEqual(handB); // owner's own card present

  const values = new Set<unknown>();
  collectValues(projection, values);
  // A's and C's ranks/suits appear NOWHERE in B's projection.
  expect(values.has(handA.rank)).toBe(false);
  expect(values.has(handC.rank)).toBe(false);
  // No seat in players[] carries a hand while hidden (self's card lives only in you.hand).
  for (const entry of projection.players) expect("hand" in entry).toBe(false);
});
