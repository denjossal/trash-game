// Lobby.svelte.test.ts — the Lobby surface (Story 1.10, AC-1.10.2/.3/.4). Runs in "client-dom".
//
// Behavior pinned:
//   - Room Code rendered letter-by-letter (the most prominent element)
//   - live roster: one row per player, each with Lives pips (filled = lives, hollow = spent)
//   - numeral paired with pips for >= 4 Lives; not for < 4
//   - HOST sees the Lives stepper (1..5) + the conductor bar; a NON-HOST sees neither
//   - Deal is disabled at 1 player, enabled at >= 2 (MIN_PLAYERS)
//   - changing the stepper sends hostSetLives via the session module (never socket.send here)
// [Source: story Tasks 3/4; DESIGN.md Room Code / Lives / Conductor bar; epics.md#Story-1.10 AC2.]
import { cleanup, fireEvent, render, screen, within } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectedTableState } from "@trash/shared";

const sendHostSetLives = vi.fn();
vi.mock("../lib/table-store.svelte", () => ({
  sendHostSetLives: (...a: unknown[]) => sendHostSetLives(...a),
}));

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
beforeEach(() => sendHostSetLives.mockReset());

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

  it("a NON-HOST sees neither the Lives stepper nor a Deal action", () => {
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

  it("a HOST sees the Lives stepper (the Deal action lives in the conductor bar, Story 4.1)", () => {
    render(Lobby, { props: { state: state() } });
    expect(screen.getByLabelText(/lives stepper/i)).toBeTruthy();
  });

  it("the Lobby surface itself no longer renders a Deal button (moved to ConductorBar in Story 4.1)", () => {
    // The dead inline Deal placeholder (no-op onclick) was removed; the bar overlay owns the single Deal,
    // and its disabled-until-≥2 behavior is pinned in ConductorBar.svelte.test.ts.
    render(Lobby, { props: { state: state() } });
    expect(screen.queryByRole("button", { name: /deal/i })).toBeNull();
  });

  it("the Host stepper sends hostSetLives with the current phaseToken", async () => {
    render(Lobby, { props: { state: state({ startingLives: 3, phaseToken: 0 }) } });
    await fireEvent.click(screen.getByLabelText(/increase lives/i));
    expect(sendHostSetLives).toHaveBeenCalledWith(4, 0);
  });

  it("the stepper clamps to 1..5 (no decrease below 1, no increase above 5)", async () => {
    const { unmount } = render(Lobby, { props: { state: state({ startingLives: 1 }) } });
    expect((screen.getByLabelText(/decrease lives/i) as HTMLButtonElement).disabled).toBe(true);
    unmount();
    render(Lobby, { props: { state: state({ startingLives: 5 }) } });
    expect((screen.getByLabelText(/increase lives/i) as HTMLButtonElement).disabled).toBe(true);
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
