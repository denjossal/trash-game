// table-store.svelte.test.ts — the read-only client tableState store + the message-handler that feeds
// it (Story 1.10, AC-1.10.4). The store uses Svelte 5 `$state` (a `.svelte.ts` rune module), so its
// test runs in the "client-dom" vitest project (the svelte() plugin compiles `.svelte.ts`).
//
// Architecture says main.ts "holds last tableState (read-only store)". This module is that store: a
// $state-backed holder whose ONLY writer is the receive loop's message handler. Consumers (App.svelte)
// read it; they cannot mutate it. The handler parses a server envelope and writes the projection.
//
// What these tests pin:
//   - a `tableState` envelope updates the store to the latest projection
//   - a later `tableState` overwrites the earlier one (live roster / Lives updates flow through)
//   - an `error` envelope does NOT clobber the last good tableState (errors are surfaced elsewhere)
//   - non-JSON / unknown noise is ignored (mirrors socket.ts's tolerant parse)
// [Source: architecture.md line 716; client/src/socket.ts parse pattern; story Task 1.]
import { beforeEach, describe, expect, it } from "vitest";
import type { ProjectedTableState } from "@trash/shared";
import { handleSocketMessage, readTableState, resetTableStateForTest } from "./table-store.svelte";

function projection(over: Partial<ProjectedTableState> = {}): ProjectedTableState {
  return {
    code: "WXYZ",
    phase: "lobby",
    hostId: "p1",
    startingLives: 3,
    you: { playerId: "p1", isHost: true, isAlive: true, isConnected: true, isLastPlayer: false },
    players: [{ id: "p1", name: "Mar", lives: 3, isAlive: true, isConnected: true, seatIndex: 0 }],
    phaseToken: 0,
    revealed: false,
    ...over,
  };
}

// A `tableState` server envelope as it arrives over the wire (a JSON string).
const wire = (payload: unknown, type = "tableState"): string => JSON.stringify({ type, payload });

beforeEach(() => {
  resetTableStateForTest();
});

describe("table-store — the read-only tableState holder + receive-loop handler", () => {
  it("starts empty (null) — the cold-open state before any tableState arrives", () => {
    expect(readTableState()).toBeNull();
  });

  it("updates the store to the latest projection on a tableState envelope", () => {
    handleSocketMessage(wire(projection({ code: "ABCD" })));
    expect(readTableState()?.code).toBe("ABCD");
  });

  it("a later tableState overwrites the earlier one (live updates flow through)", () => {
    handleSocketMessage(wire(projection({ players: [
      { id: "p1", name: "Mar", lives: 3, isAlive: true, isConnected: true, seatIndex: 0 },
    ] })));
    handleSocketMessage(wire(projection({ players: [
      { id: "p1", name: "Mar", lives: 3, isAlive: true, isConnected: true, seatIndex: 0 },
      { id: "p2", name: "Beto", lives: 3, isAlive: true, isConnected: true, seatIndex: 1 },
    ] })));
    expect(readTableState()?.players).toHaveLength(2);
  });

  it("does NOT clobber the last good tableState when an error envelope arrives", () => {
    handleSocketMessage(wire(projection({ code: "ABCD" })));
    handleSocketMessage(wire({ reason: "bad-code" }, "error"));
    expect(readTableState()?.code).toBe("ABCD"); // error is surfaced by the join flow, not the store
  });

  // Story 2.2 AC-2.2.3: a `stale-turn` / `stale-phase` error (benign double-tap / replay / race) is
  // discarded SILENTLY — the held snapshot is untouched and no error state is set (there is no error UI
  // on the live surface; the accepted intent pushes a fresh tableState that arrives next).
  it.each(["stale-turn", "stale-phase"])(
    "silently ignores a %s error — last good tableState is preserved (no toast, no clobber)",
    (reason) => {
      handleSocketMessage(wire(projection({ code: "ABCD", phaseToken: 3 })));
      const before = readTableState();
      handleSocketMessage(wire({ reason }, "error"));
      const after = readTableState();
      expect(after).toBe(before); // exact same object reference — the handler did not touch the cell.
      expect(after?.code).toBe("ABCD");
      expect(after?.phaseToken).toBe(3);
    },
  );

  it("after a silent stale error, the next tableState snapshot re-renders normally", () => {
    handleSocketMessage(wire(projection({ code: "ABCD", phaseToken: 3 })));
    handleSocketMessage(wire({ reason: "stale-turn" }, "error")); // dropped silently
    handleSocketMessage(wire(projection({ code: "ABCD", phaseToken: 4 }))); // the winner's snapshot
    expect(readTableState()?.phaseToken).toBe(4);
  });

  it("ignores non-JSON noise without throwing or clobbering", () => {
    handleSocketMessage(wire(projection({ code: "ABCD" })));
    expect(() => handleSocketMessage("not json {{{")).not.toThrow();
    expect(readTableState()?.code).toBe("ABCD");
  });

  it("ignores an unknown event type", () => {
    handleSocketMessage(wire(projection({ code: "ABCD" })));
    handleSocketMessage(wire({ anything: true }, "somethingElse"));
    expect(readTableState()?.code).toBe("ABCD");
  });
});
