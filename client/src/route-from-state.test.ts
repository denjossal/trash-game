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

  it("routing IGNORES justReceivedSwap — it is driven solely by currentTurnId (Story 2.4)", () => {
    // The swap receiver lands on Your Turn because applySwap advances currentTurnId to that neighbor —
    // NOT because of the flag. The router never reads justReceivedSwap (it is the squirm-render input on
    // YourTurn.svelte, not a routing input). Pin BOTH halves so a future refactor can't quietly couple
    // routing to the flag: the flag does not promote a non-current player to yourTurn...
    expect(routeFromState(makeState({ phase: "turns", currentTurnId: "other", justReceivedSwap: true }))).toBe(
      "waiting",
    );
    // ...and the current player routes to yourTurn with or without it (here: with).
    expect(routeFromState(makeState({ phase: "turns", currentTurnId: "me", justReceivedSwap: true }))).toBe(
      "yourTurn",
    );
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

  it("PRODUCED roundResult (resolve-at-reveal keeps the round -> revealed:true) -> showdown, NOT roundResult", () => {
    // Story 3.4 resolve-at-reveal KEEPS the round, so a produced roundResult projection carries
    // revealed===true and the revealed branch (line 53) wins over the roundResult branch (line 59). The
    // loud beat (flip + loser highlight + Re-deal) lives on the Showdown surface. This is the NORMAL
    // between-rounds projection — it never reaches the roundResult branch.
    expect(routeFromState(makeState({ phase: "roundResult", revealed: true, you: { isAlive: true } }))).toBe(
      "showdown",
    );
  });

  it("COERCED-WAKE roundResult (round lost -> revealed:false) -> roundResult (the recovery surface)", () => {
    // The ONLY way a roundResult projection reaches the roundResult branch: a D2.1-coerced wake (eviction
    // mid-round → round=null → revealed:false → phase coerced to roundResult). RoundResult.svelte is the
    // recovery surface and carries the Re-deal affordance so the game is not soft-locked after a reload.
    expect(routeFromState(makeState({ phase: "roundResult", revealed: false, you: { isAlive: true } }))).toBe(
      "roundResult",
    );
  });

  it("roundResult while eliminated -> eliminated (spectator)", () => {
    // revealed:false so the showdown branch doesn't pre-empt — an eliminated player at a coerced-wake
    // roundResult is a sideline spectator.
    expect(routeFromState(makeState({ phase: "roundResult", revealed: false, you: { isAlive: false } }))).toBe(
      "eliminated",
    );
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
