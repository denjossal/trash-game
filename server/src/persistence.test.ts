// persistence.test.ts — pure unit tests for the durable-summary projection + the D2.1 reload-
// reconciliation transform (Story 2.2). Node `rules` project (no Workers runtime); the DO-level
// re-persist behavior is exercised in table-server-reload.do.test.ts.
//
// What these tests pin:
//   - toSummary now PERSISTS the in-flight `round` (round-loss fix, 2026-06-26) and still drops
//     `isConnected` (ephemeral). The round nests under `round` (server-only storage; SM-6 unchanged).
//   - reconcileSummaryToState RESTORES the persisted round on a live-round wake (coerced: false), and
//     ONLY coerces → roundResult (bump phaseToken+1, round:null, coerced:true) when a live-round phase
//     woke WITHOUT its round (legacy summary / crash before the round was persisted). A non-live phase is
//     left untouched (coerced: false) — AC-2.2.6, the signal onStart uses to re-persist exactly once.
// [Source: architecture.md#D2 346–358, #D2.1 359–363 (round now persisted); story Tasks 3, 4, 6.]
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

test("toSummary: PERSISTS the in-flight round (round-loss fix) so a mid-round eviction can restore it", () => {
  // ROUND-LOSS FIX (2026-06-26): the round is now part of the durable summary so an active round survives
  // a DO hibernation/eviction mid-pass (previously memory-only → coerced away on wake → the deployed
  // "B can't swap" bug). ctx.storage never crosses the wire, so SM-6 still holds (the projection
  // chokepoint is unchanged) — a persisted hand is no more exposed than the in-memory one.
  const blob = toSummary(liveState()) as Record<string, unknown>;
  expect(blob.round).toBeDefined();
  const round = blob.round as Record<string, unknown>;
  expect(round.currentTurnId).toBe("p1");
  expect(round.turnToken).toBe(9);
  expect(round.acted).toEqual(["p1"]);
  // Round fields nest under `round` — they do NOT leak onto the top level.
  for (const k of ["hands", "deck", "turnToken", "currentTurnId", "acted", "revealed", "startingPlayerId"]) {
    expect(blob[k]).toBeUndefined();
  }
});

test("toSummary: OMITS round when there is none (lobby / between rounds — omit-when-absent)", () => {
  const state = liveState();
  state.phase = "lobby";
  state.round = null;
  const blob = toSummary(state) as Record<string, unknown>;
  expect("round" in blob).toBe(false);
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

// A persisted live round to attach when testing the RESTORE path.
function persistedRound(): DurableSummary["round"] {
  return {
    startingPlayerId: "p1",
    currentTurnId: "p1",
    turnToken: 9,
    hands: { p1: { rank: 5, suit: "♠" } },
    deck: [{ rank: 1, suit: "♥" }],
    acted: ["p1"],
    revealed: false,
  };
}

for (const phase of LIVE_ROUND_PHASES) {
  test(`reconcile: live-round phase "${phase}" WITH a persisted round RESTORES it (no coercion)`, () => {
    // ROUND-LOSS FIX: the normal mid-round wake now finds the persisted round and continues the game —
    // it does NOT coerce to roundResult or bump the phaseToken.
    const { state, coerced } = reconcileSummaryToState(summary({ phase, phaseToken: 5, round: persistedRound() }));
    expect(coerced).toBe(false);
    expect(state.phase).toBe(phase); // unchanged — the round survived
    expect(state.phaseToken).toBe(5); // not bumped
    expect(state.round).not.toBeNull();
    expect(state.round!.currentTurnId).toBe("p1");
    expect(state.round!.turnToken).toBe(9);
    expect(state.players[0].isConnected).toBe(false); // presence re-asserted by a live socket later
  });

  test(`reconcile: live-round phase "${phase}" WITHOUT a round coerces → roundResult (legacy/crash fallback)`, () => {
    // The fallback still fires for a legacy summary (written before the fix) or a crash before the round
    // was persisted: the round is genuinely gone, so coerce to the safe between-rounds surface.
    const { state, coerced } = reconcileSummaryToState(summary({ phase, phaseToken: 5 }));
    expect(coerced).toBe(true);
    expect(state.phase).toBe("roundResult");
    expect(state.phaseToken).toBe(6); // bumped before the first projection
    expect(state.round).toBeNull();
    expect(state.players[0].isConnected).toBe(false);
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
