// Router unit tests (Story 1.9a, AC-1.9a.4/.5/.7) — pure function, node env.
// One representative case per branch of the Routing table in the story Dev Notes.
import { describe, expect, it } from "vitest";
import type { Phase, ProjectedTableState } from "@trash/shared";
import { routeFromState } from "./route-from-state";

/**
 * Build a ProjectedTableState fixture. Defaults are a benign mid-game baseline; each test overrides
 * only the fields its branch switches on. `you.playerId` is "me"; `currentTurnId` defaults to someone
 * else ("other") so the default is the Waiting branch unless a test makes it your turn.
 */
type StateOverrides = Partial<Omit<ProjectedTableState, "you">> & {
  you?: Partial<ProjectedTableState["you"]>;
};

function makeState(overrides: StateOverrides = {}): ProjectedTableState {
  const base: ProjectedTableState = {
    code: "WXYZ",
    phase: "turns" as Phase,
    hostId: "host",
    startingLives: 3,
    you: {
      playerId: "me",
      isHost: false,
      isAlive: true,
      isConnected: true,
      isLastPlayer: false,
    },
    players: [
      { id: "me", name: "Me", lives: 3, isAlive: true, isConnected: true, seatIndex: 0 },
      { id: "other", name: "Other", lives: 3, isAlive: true, isConnected: true, seatIndex: 1 },
    ],
    currentTurnId: "other",
    turnToken: 1,
    phaseToken: 1,
    revealed: false,
  };
  return {
    ...base,
    ...overrides,
    // Merge `you` shallowly so a test can override one sub-field without respecifying all.
    you: { ...base.you, ...(overrides.you ?? {}) },
  };
}

describe("routeFromState", () => {
  it("null (no tableState yet) -> home/connecting (AC-1.9a.5)", () => {
    expect(routeFromState(null)).toBe("home");
  });

  it("phase=lobby -> lobby (joined, pre-Deal)", () => {
    expect(routeFromState(makeState({ phase: "lobby" }))).toBe("lobby");
  });

  it("phase=gameOver and you are in winnerIds -> winner", () => {
    expect(routeFromState(makeState({ phase: "gameOver", winnerIds: ["me"] }))).toBe("winner");
  });

  it("phase=gameOver and you are NOT the winner -> eliminated", () => {
    expect(routeFromState(makeState({ phase: "gameOver", winnerIds: ["other"] }))).toBe("eliminated");
  });

  it("turns + currentTurnId === you -> yourTurn", () => {
    expect(routeFromState(makeState({ phase: "turns", currentTurnId: "me" }))).toBe("yourTurn");
  });

  it("turns + currentTurnId !== you -> waiting", () => {
    expect(routeFromState(makeState({ phase: "turns", currentTurnId: "other" }))).toBe("waiting");
  });

  it("dealing -> waiting (transient, nobody acts yet)", () => {
    expect(routeFromState(makeState({ phase: "dealing", currentTurnId: undefined }))).toBe("waiting");
  });

  it("allActed (real Phase: pass complete, awaiting reveal) -> waiting", () => {
    expect(routeFromState(makeState({ phase: "allActed", currentTurnId: undefined }))).toBe("waiting");
  });

  it("showdown -> showdown", () => {
    expect(routeFromState(makeState({ phase: "showdown", revealed: true }))).toBe("showdown");
  });

  it("roundResult while alive -> roundResult", () => {
    expect(routeFromState(makeState({ phase: "roundResult", you: { isAlive: true } }))).toBe("roundResult");
  });

  it("roundResult while eliminated -> eliminated (spectator)", () => {
    expect(routeFromState(makeState({ phase: "roundResult", you: { isAlive: false } }))).toBe("eliminated");
  });

  it("eliminated player during a live turn phase -> eliminated (spectator, not waiting)", () => {
    expect(routeFromState(makeState({ phase: "turns", currentTurnId: "other", you: { isAlive: false } }))).toBe(
      "eliminated",
    );
  });

  it("eliminated player STILL watches the showdown flip (showdown wins over eliminated)", () => {
    // EXPERIENCE.md: an eliminated player "keeps seeing Waiting/Showdown". The reveal is the
    // table's big beat — a knocked-out spectator watches it. (Flagged for Epic 3 confirmation.)
    expect(routeFromState(makeState({ phase: "showdown", revealed: true, you: { isAlive: false } }))).toBe(
      "showdown",
    );
  });

  it("is a pure function: same input -> same output, input not mutated", () => {
    const s = makeState({ phase: "turns", currentTurnId: "me" });
    const snapshot = JSON.stringify(s);
    expect(routeFromState(s)).toBe(routeFromState(s));
    expect(JSON.stringify(s)).toBe(snapshot); // no mutation
  });
});
