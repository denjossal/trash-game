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
import { handleKeep, handleSwap, type TableHost } from "./handlers.js";

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
  expect(table.phase).toBe("turns"); // phase unchanged (no allActed here — that's 2.6)
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
