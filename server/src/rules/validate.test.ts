// validate.test.ts — the two-scope monotonic guard primitive (Story 2.2). Node `rules` project
// (pure unit tests; no Workers runtime). The GATE 2 test-file exemption (eslint.config.js) allows the
// `vitest` import here while keeping the purity SYNTAX bans in force.
//
// What these tests pin (AC-2.2.1/.2/.4):
//   - checkTurnToken / checkPhaseToken are ONE mechanism: match → returns; mismatch → throws a typed
//     IntentError ("stale-turn" / "stale-phase") and reads NO clock (pure integer compare).
//   - bumpTurnToken / bumpPhaseToken increment by exactly 1, monotonically, and close the
//     accepted-path → next-stale-copy-rejected loop (AC-2.2.4 → AC-2.2.2).
// [Source: epics.md#Story 2.2 AC-2.2.1/.2/.4; architecture.md D4 391–403; story Tasks 1, 2, 6.]
import { expect, test } from "vitest";
import { IntentError } from "@trash/shared";
import type { Round, TableState } from "@trash/shared";
import { bumpPhaseToken, bumpTurnToken, checkPhaseToken, checkTurnToken } from "./validate.js";

// Minimal synthetic fixtures — the guard reads ONLY the integer token, never cards/hands (privacy by
// construction: it cannot leak a non-owner's card because it never touches hand data).
function round(turnToken: number): Round {
  return {
    startingPlayerId: "p1",
    currentTurnId: "p1",
    turnToken,
    hands: {},
    deck: [],
    acted: [],
    revealed: false,
  };
}

function tableState(phaseToken: number): TableState {
  return {
    code: "WXYZ",
    phase: "turns",
    hostId: "p1",
    startingLives: 3,
    players: [],
    round: null,
    phaseToken,
  };
}

/** Catch a thrown IntentError and return its reason (fails the test if nothing/!IntentError thrown). */
function reasonOf(fn: () => void): string {
  try {
    fn();
  } catch (err) {
    if (err instanceof IntentError) return err.reason;
    throw err;
  }
  throw new Error("expected the guard to throw, but it returned");
}

// ---- checkTurnToken (AC-2.2.1, AC-2.2.2) ----------------------------------

test("checkTurnToken: a matching token returns without throwing", () => {
  expect(() => checkTurnToken(round(7), 7)).not.toThrow();
});

test("checkTurnToken: a stale (lower / replayed) token throws IntentError stale-turn", () => {
  expect(reasonOf(() => checkTurnToken(round(7), 6))).toBe("stale-turn");
  expect(reasonOf(() => checkTurnToken(round(7), 0))).toBe("stale-turn");
});

test("checkTurnToken: an off-by-one / future token also mismatches → stale-turn (equality only)", () => {
  expect(reasonOf(() => checkTurnToken(round(7), 8))).toBe("stale-turn");
});

// ---- checkPhaseToken (AC-2.2.1, AC-2.2.2) ---------------------------------

test("checkPhaseToken: a matching token returns without throwing", () => {
  expect(() => checkPhaseToken(tableState(3), 3)).not.toThrow();
});

test("checkPhaseToken: a mismatched token throws IntentError stale-phase", () => {
  expect(reasonOf(() => checkPhaseToken(tableState(3), 2))).toBe("stale-phase");
  expect(reasonOf(() => checkPhaseToken(tableState(3), 4))).toBe("stale-phase");
});

// ---- One mechanism: the two scopes route to distinct reasons (AC-2.2.1) ---

test("the two checks are the SAME compare-and-reject shape, differing ONLY in scope/reason", () => {
  // Same expected/actual relationship, two scopes — proves a single primitive with two thin wrappers.
  expect(reasonOf(() => checkTurnToken(round(1), 2))).toBe("stale-turn");
  expect(reasonOf(() => checkPhaseToken(tableState(1), 2))).toBe("stale-phase");
});

// ---- bump helpers (AC-2.2.4) ----------------------------------------------

test("bumpTurnToken: increments round.turnToken by exactly 1 (in place)", () => {
  const r = round(5);
  bumpTurnToken(r);
  expect(r.turnToken).toBe(6);
});

test("bumpPhaseToken: increments state.phaseToken by exactly 1 (in place)", () => {
  const s = tableState(5);
  bumpPhaseToken(s);
  expect(s.phaseToken).toBe(6);
});

test("bump is monotonic across repeated calls", () => {
  const s = tableState(0);
  for (let i = 1; i <= 4; i++) {
    bumpPhaseToken(s);
    expect(s.phaseToken).toBe(i);
  }
});

test("AC-2.2.4 → AC-2.2.2: after a bump, the now-stale prior token is rejected", () => {
  // The accepted path bumped the turn token; a replayed intent still carrying the OLD value mismatches.
  const r = round(7);
  const staleCopy = r.turnToken; // a client double-tap carries the pre-bump value.
  bumpTurnToken(r);
  expect(reasonOf(() => checkTurnToken(r, staleCopy))).toBe("stale-turn");

  const s = tableState(7);
  const stalePhase = s.phaseToken;
  bumpPhaseToken(s);
  expect(reasonOf(() => checkPhaseToken(s, stalePhase))).toBe("stale-phase");
});
