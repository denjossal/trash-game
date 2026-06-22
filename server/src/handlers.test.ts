// handlers.test.ts — pure unit tests for the turn-scoped gameplay handlers (Story 2.4: handleSwap /
// handleKeep). Runs in the node `rules`-adjacent project (`*.test.ts` suffix, EXCLUDES `*.do.test.ts`).
// The handlers need only a narrow TableHost (table + storage + connections); swap/keep do NOT persist
// or fan out (those are dispatch's job), so a trivial stub suffices — no DO plumbing. The end-to-end
// wire path (real sockets, fan-out, projection) is covered by table-server-swap.do.test.ts.
//
// What this pins (AC-2.4.3/.4/.6):
//   - handleSwap exchanges the active player's & right-neighbor's hands, advances the turn, bumps the
//     turn token, sets the squirm transient; handleKeep leaves hands untouched, advances + bumps.
//   - rejections: bad shape / table-null / round-null-after-coerce / wrong-phase → phase-illegal;
//     non-active caller → not-your-turn; stale turnToken → stale-turn (the TURN-scoped reason).
//   - King-no-read: a swap onto a King (rank 13) is NOT refused (FR-8 — no value branch).
import { expect, test } from "vitest";
import type { Card, Intent, Player, TableState } from "@trash/shared";
import { IntentError } from "@trash/shared";
import { handleDraw, handleKeep, handleSwap, type TableHost } from "./handlers.js";

// A TableHost stub: handlers only read `table` (and would call `storage`/`connections` if they
// persisted/sent — swap/keep do neither). The stub throws if those are touched, proving no persist.
function hostWith(table: TableState | null): TableHost {
  return {
    table,
    name: table?.code ?? "WXYZ",
    storage: new Proxy(
      {},
      {
        get() {
          throw new Error("swap/keep must NOT touch storage (memory-only round mutation, AC-2.2.5)");
        },
      },
    ) as unknown as DurableObjectStorage,
    connections() {
      throw new Error("handlers must NOT access connections (transport is dispatch's job)");
    },
  };
}

function player(id: string, seatIndex: number, isAlive = true): Player {
  return { id, name: `name-${id}`, lives: 3, isAlive, isConnected: true, seatIndex };
}

/**
 * A TableHost stub that ALLOWS persist (records each persisted summary's phase/phaseToken). handleDraw —
 * and a LAST-seat swap/keep that completes the pass — change `phase` (turns→allActed) + `phaseToken`,
 * which ARE durable, so they MUST persist (unlike a mid-pass swap/keep). This stub captures those writes.
 */
function hostWithStorage(table: TableState | null): TableHost & { persisted: { phase: string; phaseToken: number }[] } {
  const persisted: { phase: string; phaseToken: number }[] = [];
  return {
    table,
    name: table?.code ?? "WXYZ",
    // persistence.persistSummary calls storage.put("table", summary). Capture the put; ignore the args
    // (we record the live table's phase/phaseToken at persist time, which is what the summary carries).
    storage: {
      put: () => {
        if (table) persisted.push({ phase: table.phase, phaseToken: table.phaseToken });
        return Promise.resolve();
      },
    } as unknown as DurableObjectStorage,
    connections() {
      throw new Error("handlers must NOT access connections (transport is dispatch's job)");
    },
    persisted,
  };
}

/** A table mid-round (`turns` phase) with a live round; A is the current-turn player. */
function turnsTable(hands: Record<string, Card>, currentTurnId = "A", turnToken = 0): TableState {
  return {
    code: "WXYZ",
    phase: "turns",
    hostId: "A",
    startingLives: 3,
    players: [player("A", 0), player("B", 1), player("C", 2)],
    round: {
      startingPlayerId: "A",
      currentTurnId,
      turnToken,
      hands,
      deck: [],
      acted: [],
      revealed: false,
    },
    phaseToken: 1,
  };
}

// The Intent union groups swap/keep/drawFromDeck in ONE member, so Extract by a single literal is
// `never` — extract the grouped member (the same pattern the handlers use).
type TurnIntent = Extract<Intent, { type: "swap" | "keep" | "drawFromDeck" }>;
function swapIntent(turnToken: number): TurnIntent {
  return { type: "swap", payload: { turnToken } };
}
function keepIntent(turnToken: number): TurnIntent {
  return { type: "keep", payload: { turnToken } };
}
function drawIntent(turnToken: number): TurnIntent {
  return { type: "drawFromDeck", payload: { turnToken } };
}

/** A table where it is the LAST Player C's turn (A & B already acted); a deck is supplied for draws.
 *  start = A, so C is the Last Player (from C the next alive seat is A = start). */
function lastSeatTable(deck: Card[], turnToken = 0): TableState {
  const t = turnsTable(
    { A: { rank: 2, suit: "♠" }, B: { rank: 7, suit: "♥" }, C: { rank: 10, suit: "♦" } },
    "C",
    turnToken,
  );
  t.round!.acted = ["A", "B"]; // the first two seats have acted; C closes the pass.
  t.round!.deck = deck;
  return t;
}

// ---- happy paths ----------------------------------------------------------

test("handleSwap: exchanges the active player's & right-neighbor's hands, advances turn, bumps turn token", async () => {
  const table = turnsTable({
    A: { rank: 2, suit: "♠" },
    B: { rank: 7, suit: "♥" },
    C: { rank: 10, suit: "♦" },
  });
  const host = hostWith(table);
  await handleSwap(host, swapIntent(0), "A");
  expect(table.round!.hands.A).toEqual({ rank: 7, suit: "♥" });
  expect(table.round!.hands.B).toEqual({ rank: 2, suit: "♠" });
  expect(table.round!.acted).toEqual(["A"]);
  expect(table.round!.currentTurnId).toBe("B");
  expect(table.round!.turnToken).toBe(1); // bumped by exactly 1
  expect(table.round!.lastSwapReceiverId).toBe("B"); // squirm transient set for the receiver
  expect(table.phase).toBe("turns"); // MID-pass (A is not the last seat) → phase stays turns (2.6 regression contract)
});

test("handleKeep: leaves hands untouched, advances turn, bumps turn token (no squirm transient)", async () => {
  const table = turnsTable({
    A: { rank: 2, suit: "♠" },
    B: { rank: 7, suit: "♥" },
    C: { rank: 10, suit: "♦" },
  });
  const host = hostWith(table);
  await handleKeep(host, keepIntent(0), "A");
  expect(table.round!.hands.A).toEqual({ rank: 2, suit: "♠" }); // unchanged
  expect(table.round!.acted).toEqual(["A"]);
  expect(table.round!.currentTurnId).toBe("B");
  expect(table.round!.turnToken).toBe(1);
  expect(table.round!.lastSwapReceiverId).toBeUndefined();
});

test("handleSwap: King-no-read — swapping onto a King (rank 13) is NOT refused (FR-8/AC-2.4.6)", async () => {
  const table = turnsTable({ A: { rank: 5, suit: "♠" }, B: { rank: 13, suit: "♥" }, C: { rank: 1, suit: "♦" } });
  const host = hostWith(table);
  await expect(handleSwap(host, swapIntent(0), "A")).resolves.toBeUndefined();
  expect(table.round!.hands.A).toEqual({ rank: 13, suit: "♥" }); // A receives the King — no refusal
});

// ---- rejections -----------------------------------------------------------

test("handleSwap: a non-active caller is rejected with not-your-turn (server-authoritative)", async () => {
  const table = turnsTable({ A: { rank: 2, suit: "♠" }, B: { rank: 7, suit: "♥" }, C: { rank: 10, suit: "♦" } });
  const host = hostWith(table);
  await expect(handleSwap(host, swapIntent(0), "B")).rejects.toMatchObject({ reason: "not-your-turn" });
  expect(table.round!.acted).toEqual([]); // no mutation on rejection
});

test("handleSwap: a stale turn token is rejected with stale-turn (the TURN-scoped reason, not stale-phase)", async () => {
  const table = turnsTable(
    { A: { rank: 2, suit: "♠" }, B: { rank: 7, suit: "♥" }, C: { rank: 10, suit: "♦" } },
    "A",
    3, // server turnToken is 3
  );
  const host = hostWith(table);
  await expect(handleSwap(host, swapIntent(2), "A")).rejects.toMatchObject({ reason: "stale-turn" });
  expect(table.round!.turnToken).toBe(3); // unchanged
});

test("handleSwap: a bad payload shape is rejected with phase-illegal (no raw TypeError / hang)", async () => {
  const table = turnsTable({ A: { rank: 2, suit: "♠" }, B: { rank: 7, suit: "♥" }, C: { rank: 10, suit: "♦" } });
  const host = hostWith(table);
  // Non-finite / absent turnToken — would TypeError in checkTurnToken without the shape guard.
  await expect(handleSwap(host, { type: "swap", payload: {} } as unknown as TurnIntent, "A")).rejects.toMatchObject({
    reason: "phase-illegal",
  });
});

test("handleSwap: a null round (post-D2.1-coercion) is rejected with phase-illegal BEFORE checkTurnToken (#123)", async () => {
  // Simulate a coerced reload: phase claims a live round but round===null. The guard MUST reject here,
  // not deref round.turnToken (which would throw a non-IntentError and hang the client).
  const table: TableState = {
    code: "WXYZ",
    phase: "turns", // a live-round phase...
    hostId: "A",
    startingLives: 3,
    players: [player("A", 0), player("B", 1)],
    round: null, // ...but no round (D2.1 coercion leaves this null while bumping phaseToken)
    phaseToken: 2,
  };
  const host = hostWith(table);
  await expect(handleSwap(host, swapIntent(0), "A")).rejects.toMatchObject({ reason: "phase-illegal" });
});

test("handleSwap: wrong phase (lobby) is rejected with phase-illegal", async () => {
  const table = turnsTable({ A: { rank: 2, suit: "♠" }, B: { rank: 7, suit: "♥" }, C: { rank: 10, suit: "♦" } });
  table.phase = "lobby"; // not a turn phase
  const host = hostWith(table);
  await expect(handleSwap(host, swapIntent(0), "A")).rejects.toMatchObject({ reason: "phase-illegal" });
});

test("handleSwap: a null table is rejected with phase-illegal (defensive)", async () => {
  const host = hostWith(null);
  await expect(handleSwap(host, swapIntent(0), "A")).rejects.toBeInstanceOf(IntentError);
});

// ---- handleDraw (Story 2.6) -----------------------------------------------
// The Last Player's third choice. Reuses requireActiveTurn (turn-token guard, #123 null-round guard,
// not-your-turn) PLUS a last-player server-authority check. The ONLY turn handler that PERSISTS — it
// changes phase (turns→allActed) + phaseToken, which are durable.

test("handleDraw: the Last Player draws — hand replaced from deck, deck shrinks, turn token bumped", async () => {
  const host = hostWithStorage(lastSeatTable([{ rank: 9, suit: "♦" }, { rank: 11, suit: "♣" }]));
  const table = host.table!;
  await handleDraw(host, drawIntent(0), "C");
  expect(table.round!.hands.C).toEqual({ rank: 9, suit: "♦" }); // drew the top card (old 10♦ discarded)
  expect(table.round!.deck).toEqual([{ rank: 11, suit: "♣" }]); // top removed
  expect(table.round!.acted).toEqual(["A", "B", "C"]); // C closes the pass
  expect(table.round!.turnToken).toBe(1); // bumped
});

test("handleDraw: the final action transitions the round to allActed, bumps phaseToken, and PERSISTS (AC-2.6.3)", async () => {
  const host = hostWithStorage(lastSeatTable([{ rank: 9, suit: "♦" }]));
  const table = host.table!;
  const phaseTokenBefore = table.phaseToken;
  await handleDraw(host, drawIntent(0), "C");
  expect(table.phase).toBe("allActed"); // the one pass is complete
  expect(table.phaseToken).toBe(phaseTokenBefore + 1); // phase changed → phase token bumped
  // The active seat is CLEARED so no device routes to a phantom yourTurn (router-leak fix).
  expect(table.round!.currentTurnId).toBe("");
  // PERSISTED with the new phase + token (the durable summary changed — unlike a mid-pass swap/keep).
  expect(host.persisted).toEqual([{ phase: "allActed", phaseToken: phaseTokenBefore + 1 }]);
});

test("handleDraw: a NON-last seat drawing is refused (server-authoritative — only the Last Player may draw)", async () => {
  // It is A's turn (A is NOT the last player — C is). A crafted drawFromDeck from A must be refused.
  const table = turnsTable({ A: { rank: 2, suit: "♠" }, B: { rank: 7, suit: "♥" }, C: { rank: 10, suit: "♦" } });
  table.round!.deck = [{ rank: 9, suit: "♦" }];
  const host = hostWithStorage(table);
  await expect(handleDraw(host, drawIntent(0), "A")).rejects.toMatchObject({ reason: "not-your-turn" });
  expect(table.round!.acted).toEqual([]); // no mutation
  expect(host.persisted).toEqual([]); // no persist on rejection
});

test("handleDraw: a stale turn token is rejected with stale-turn (reuses the turn guard)", async () => {
  const host = hostWithStorage(lastSeatTable([{ rank: 9, suit: "♦" }], 3));
  await expect(handleDraw(host, drawIntent(2), "C")).rejects.toMatchObject({ reason: "stale-turn" });
  expect(host.table!.round!.turnToken).toBe(3); // unchanged
});

test("handleDraw: a null round (post-D2.1-coercion) is rejected with phase-illegal BEFORE the token deref (#123)", async () => {
  const table: TableState = {
    code: "WXYZ",
    phase: "turns",
    hostId: "A",
    startingLives: 3,
    players: [player("A", 0), player("B", 1)],
    round: null,
    phaseToken: 2,
  };
  const host = hostWithStorage(table);
  await expect(handleDraw(host, drawIntent(0), "A")).rejects.toMatchObject({ reason: "phase-illegal" });
});

// ---- the turns → allActed transition fires for the LAST seat's Swap/Keep too (AC-2.6.3) ----

test("handleSwap by the LAST seat completes the pass → allActed + phaseToken bump + persist", async () => {
  // C is the last player; A & B have acted. C swaps with its right-hand neighbor (A) and closes the pass.
  const host = hostWithStorage(lastSeatTable([]));
  const table = host.table!;
  const phaseTokenBefore = table.phaseToken;
  await handleSwap(host, swapIntent(0), "C");
  expect(table.round!.acted).toEqual(["A", "B", "C"]);
  expect(table.phase).toBe("allActed");
  expect(table.phaseToken).toBe(phaseTokenBefore + 1);
  expect(table.round!.currentTurnId).toBe(""); // active seat cleared (router-leak fix)
  expect(host.persisted).toEqual([{ phase: "allActed", phaseToken: phaseTokenBefore + 1 }]);
});

test("handleKeep by the LAST seat completes the pass → allActed + phaseToken bump + persist", async () => {
  const host = hostWithStorage(lastSeatTable([]));
  const table = host.table!;
  const phaseTokenBefore = table.phaseToken;
  await handleKeep(host, keepIntent(0), "C");
  expect(table.phase).toBe("allActed");
  expect(table.phaseToken).toBe(phaseTokenBefore + 1);
  expect(table.round!.currentTurnId).toBe("");
  expect(host.persisted).toEqual([{ phase: "allActed", phaseToken: phaseTokenBefore + 1 }]);
});

test("handleSwap MID-pass (not the last seat) stays turns + does NOT persist (the 2.4 regression contract)", async () => {
  // A is the first to act (B, C still owe a turn) → the pass is NOT complete; behavior is the 2.4 path.
  const host = hostWithStorage(
    turnsTable({ A: { rank: 2, suit: "♠" }, B: { rank: 7, suit: "♥" }, C: { rank: 10, suit: "♦" } }),
  );
  const table = host.table!;
  await handleSwap(host, swapIntent(0), "A");
  expect(table.phase).toBe("turns"); // unchanged mid-pass
  expect(table.round!.currentTurnId).toBe("B"); // turn advances normally (NOT cleared)
  expect(host.persisted).toEqual([]); // NO persist mid-pass (memory-only round change)
});
