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

// ---- Story 3.4: loserIds/winnerIds carried durably in the summary ----------

test("3.4 toSummary: carries loserIds/winnerIds when set (between-round result fields)", () => {
  const state = liveState();
  state.phase = "roundResult";
  state.loserIds = ["p1"];
  state.winnerIds = ["p2"];
  const blob = toSummary(state);
  expect(blob.loserIds).toEqual(["p1"]);
  expect(blob.winnerIds).toEqual(["p2"]);
});

test("3.4 toSummary: OMITS loserIds/winnerIds when unset (omit-when-absent)", () => {
  const blob = toSummary(liveState()) as Record<string, unknown>;
  expect("loserIds" in blob).toBe(false);
  expect("winnerIds" in blob).toBe(false);
});

test("3.4 reconcile: persisted loserIds/winnerIds at roundResult/gameOver survive the wake", () => {
  // A roundResult wake (safe phase — no coercion) keeps the persisted result fields so the surface
  // still shows the pips/loser after a DO reload.
  const { state, coerced } = reconcileSummaryToState(
    summary({ phase: "roundResult", loserIds: ["p1"], winnerIds: ["p2"] }),
  );
  expect(coerced).toBe(false);
  expect(state.loserIds).toEqual(["p1"]);
  expect(state.winnerIds).toEqual(["p2"]);
});

test("3.4 reconcile: a wake with no persisted result fields leaves them unset", () => {
  const { state } = reconcileSummaryToState(summary({ phase: "roundResult" }));
  expect(state.loserIds).toBeUndefined();
  expect(state.winnerIds).toBeUndefined();
});

// ---- Story 3.4 (review fix): nextStartingPlayerId carried durably so a roundResult reload re-deals
// the correct Loser instead of soft-locking / falling back to hostId. ----

test("3.4 toSummary: carries nextStartingPlayerId when set (the re-deal starter)", () => {
  const state = liveState();
  state.phase = "roundResult";
  state.loserIds = ["p1"];
  state.nextStartingPlayerId = "p1";
  const blob = toSummary(state);
  expect(blob.nextStartingPlayerId).toBe("p1");
});

test("3.4 toSummary: OMITS nextStartingPlayerId when unset (omit-when-absent)", () => {
  const blob = toSummary(liveState()) as Record<string, unknown>;
  expect("nextStartingPlayerId" in blob).toBe(false);
});

test("3.4 reconcile: persisted nextStartingPlayerId survives the wake (re-deal seats the Loser)", () => {
  // A roundResult reload restores the resolved Loser so handleDealAgain seats it (FR-12) rather than
  // soft-locking or falling back to hostId.
  const { state } = reconcileSummaryToState(
    summary({ phase: "roundResult", loserIds: ["p1"], nextStartingPlayerId: "p1" }),
  );
  expect(state.nextStartingPlayerId).toBe("p1");
});
