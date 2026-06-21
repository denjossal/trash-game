// persistence.test.ts — pure unit tests for the durable-summary projection + the D2.1 reload-
// reconciliation transform (Story 2.2). Node `rules` project (no Workers runtime); the DO-level
// re-persist behavior is exercised in table-server-reload.do.test.ts.
//
// What these tests pin:
//   - toSummary drops the entire `round` object AND `isConnected` (AC-2.2.5 durable field boundary).
//   - reconcileSummaryToState coerces a live-round phase → roundResult, bumps phaseToken+1, nulls
//     round, seeds isConnected:false, and reports `coerced: true`; a non-live phase is left untouched
//     and reports `coerced: false` (AC-2.2.6 — the signal onStart uses to re-persist exactly once).
// [Source: architecture.md#D2 346–358, #D2.1 359–363; story Tasks 3, 4, 6.]
import { expect, test } from "vitest";
import type { Phase, TableState } from "@trash/shared";
import { type DurableSummary, reconcileSummaryToState, toSummary } from "./persistence.js";

function summary(over: Partial<DurableSummary> = {}): DurableSummary {
  return {
    code: "WXYZ",
    phase: "lobby",
    hostId: "p1",
    startingLives: 3,
    players: [{ id: "p1", name: "Mar", lives: 3, isAlive: true, seatIndex: 0 }],
    phaseToken: 4,
    ...over,
  };
}

function liveState(): TableState {
  return {
    code: "WXYZ",
    phase: "turns",
    hostId: "p1",
    startingLives: 3,
    players: [{ id: "p1", name: "Mar", lives: 3, isAlive: true, isConnected: true, seatIndex: 0 }],
    round: {
      startingPlayerId: "p1",
      currentTurnId: "p1",
      turnToken: 9,
      hands: { p1: { rank: 5, suit: "♠" } },
      deck: [{ rank: 1, suit: "♥" }],
      acted: ["p1"],
      revealed: false,
    },
    phaseToken: 4,
  };
}

// ---- toSummary: the AC-2.2.5 durable field boundary ------------------------

test("toSummary: persisted blob EXCLUDES the entire round object (memory-only)", () => {
  const blob = toSummary(liveState()) as Record<string, unknown>;
  expect(blob.round).toBeUndefined();
  // None of round's fields leak onto the top level either.
  for (const k of ["hands", "deck", "turnToken", "currentTurnId", "acted", "revealed", "startingPlayerId"]) {
    expect(blob[k]).toBeUndefined();
  }
  // No card data anywhere in the serialized summary (belt-and-suspenders for SM-6 at the storage seam).
  expect(JSON.stringify(blob)).not.toContain("rank");
});

test("toSummary: persisted players OMIT isConnected (ephemeral presence is not durable)", () => {
  const blob = toSummary(liveState());
  for (const p of blob.players) {
    expect((p as Record<string, unknown>).isConnected).toBeUndefined();
  }
  // The durable player fields are exactly id/name/lives/isAlive/seatIndex.
  expect(Object.keys(blob.players[0]).sort()).toEqual(["id", "isAlive", "lives", "name", "seatIndex"]);
});

test("toSummary: carries the durable summary fields verbatim", () => {
  const blob = toSummary(liveState());
  expect(blob.code).toBe("WXYZ");
  expect(blob.hostId).toBe("p1");
  expect(blob.startingLives).toBe(3);
  expect(blob.phaseToken).toBe(4);
});

// ---- reconcileSummaryToState: D2.1 coercion (AC-2.2.6) ---------------------

const LIVE_ROUND_PHASES: Phase[] = ["dealing", "turns", "allActed", "showdown"];
const SAFE_PHASES: Phase[] = ["lobby", "roundResult", "gameOver"];

for (const phase of LIVE_ROUND_PHASES) {
  test(`reconcile: live-round phase "${phase}" coerces → roundResult, bumps phaseToken+1, reports coerced`, () => {
    const { state, coerced } = reconcileSummaryToState(summary({ phase, phaseToken: 5 }));
    expect(coerced).toBe(true);
    expect(state.phase).toBe("roundResult");
    expect(state.phaseToken).toBe(6); // bumped before the first projection
    expect(state.round).toBeNull(); // round is never restored
    expect(state.players[0].isConnected).toBe(false); // presence re-asserted by a live socket later
  });
}

for (const phase of SAFE_PHASES) {
  test(`reconcile: safe phase "${phase}" is left untouched (no coercion, no bump)`, () => {
    const { state, coerced } = reconcileSummaryToState(summary({ phase, phaseToken: 5 }));
    expect(coerced).toBe(false);
    expect(state.phase).toBe(phase);
    expect(state.phaseToken).toBe(5); // unchanged
    expect(state.round).toBeNull();
  });
}

test("reconcile: hydrated durable fields survive (code/hostId/startingLives/players)", () => {
  const { state } = reconcileSummaryToState(summary({ phase: "lobby", startingLives: 5 }));
  expect(state.code).toBe("WXYZ");
  expect(state.hostId).toBe("p1");
  expect(state.startingLives).toBe(5);
  expect(state.players).toHaveLength(1);
  expect(state.players[0].id).toBe("p1");
});
