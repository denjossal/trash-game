// Lobby.svelte.test.ts — the Lobby surface (Story 1.10, AC-1.10.2/.3/.4; Story 4.2 stepper removal). Runs
// in "client-dom".
//
// Behavior pinned:
//   - Room Code rendered letter-by-letter (the most prominent element)
//   - live roster: one row per player, each with Lives pips (filled = lives, hollow = spent)
//   - numeral paired with pips for >= 4 Lives; not for < 4
//   - NO Lives stepper on Lobby anymore (Story 4.2 moved it into the ⚙ Host Controls sheet); neither Host
//     nor non-Host sees a stepper or a Deal button on the Lobby surface itself.
// [Source: story Tasks 3/4; DESIGN.md Room Code / Lives; epics.md#Story-1.10/4.2.]
import { cleanup, render, screen, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectedTableState } from "@trash/shared";

import Lobby from "./Lobby.svelte";

function player(id: string, name: string, lives = 3, seatIndex = 0) {
  return { id, name, lives, isAlive: true, isConnected: true, seatIndex };
}

function state(over: Partial<ProjectedTableState> = {}): ProjectedTableState {
  return {
    code: "WXYZ",
    phase: "lobby",
    hostId: "p1",
    startingLives: 3,
    you: { playerId: "p1", isHost: true, isAlive: true, isConnected: true, isLastPlayer: false },
    players: [player("p1", "Mar", 3, 0)],
    phaseToken: 0,
    revealed: false,
    ...over,
  };
}

afterEach(cleanup);

describe("Lobby surface", () => {
  it("renders the Room Code letter by letter (the most prominent element)", () => {
    render(Lobby, { props: { state: state({ code: "WXYZ" }) } });
    const code = screen.getByLabelText(/room code/i);
    for (const ch of ["W", "X", "Y", "Z"]) {
      expect(within(code).getByText(ch)).toBeTruthy();
    }
  });

  it("renders one roster row per player", () => {
    render(Lobby, {
      props: { state: state({ players: [player("p1", "Mar", 3, 0), player("p2", "Beto", 3, 1)] }) },
    });
    expect(screen.getByText("Mar")).toBeTruthy();
    expect(screen.getByText("Beto")).toBeTruthy();
  });

  it("shows filled + hollow pips and NO numeral for < 4 Lives", () => {
    render(Lobby, {
      props: { state: state({ startingLives: 3, players: [player("p1", "Mar", 2, 0)] }) },
    });
    const row = screen.getByText("Mar").closest("li")!;
    expect(within(row).getAllByTestId("pip-filled")).toHaveLength(2);
    expect(within(row).getAllByTestId("pip-hollow")).toHaveLength(1); // 3 - 2
    expect(within(row).queryByTestId("lives-numeral")).toBeNull();
  });

  it("pairs a numeral with pips for >= 4 Lives", () => {
    render(Lobby, {
      props: { state: state({ startingLives: 5, players: [player("p1", "Mar", 4, 0)] }) },
    });
    const row = screen.getByText("Mar").closest("li")!;
    expect(within(row).getByTestId("lives-numeral").textContent).toContain("4");
  });

  it("the Lobby no longer renders a Lives stepper for the HOST (moved to the ⚙ Host Controls sheet, Story 4.2)", () => {
    render(Lobby, { props: { state: state() } });
    // The stepper (and its decrease/increase controls) is gone from Lobby — it lives in HostControls now.
    expect(screen.queryByLabelText(/lives stepper/i)).toBeNull();
    expect(screen.queryByLabelText(/increase lives/i)).toBeNull();
    expect(screen.queryByLabelText(/decrease lives/i)).toBeNull();
  });

  it("a NON-HOST sees neither a Lives stepper nor a Deal action on Lobby", () => {
    render(Lobby, {
      props: {
        state: state({
          you: { playerId: "p2", isHost: false, isAlive: true, isConnected: true, isLastPlayer: false },
          players: [player("p1", "Mar", 3, 0), player("p2", "Beto", 3, 1)],
        }),
      },
    });
    expect(screen.queryByLabelText(/lives stepper/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /deal/i })).toBeNull();
  });

  it("the Lobby surface itself renders no Deal button (the bar overlay owns the single Deal, Story 4.1)", () => {
    render(Lobby, { props: { state: state() } });
    expect(screen.queryByRole("button", { name: /deal/i })).toBeNull();
  });

  it("the non-Host waiting hint falls back to 'the host' when the host isn't in the roster", () => {
    render(Lobby, {
      props: {
        state: state({
          hostId: "ghost", // not present in players → no name to resolve
          you: { playerId: "p2", isHost: false, isAlive: true, isConnected: true, isLastPlayer: false },
          players: [player("p2", "Beto", 3, 0)],
        }),
      },
    });
    // No double-space / nameless sentence — the generic "the host" fills the slot.
    expect(screen.getByText(/the host deals when everyone's in/i)).toBeTruthy();
  });
});
