// YourTurn.svelte.test.ts — the two-button hero (Story 2.4, AC-2.4.1/.3/.4/.5/.7). Runs in "client-dom".
//
// Behavior pinned:
//   - SWAP + KEEP render from copy.ts and are the FIRST two focus stops (reading order, AC-2.4.7)
//   - tapping SWAP calls sendSwap(turnToken); KEEP calls sendKeep(turnToken) — via the table-store seams
//   - a rapid double-tap fires the send ONCE (Button debounce, AC-2.4.5)
//   - the SR turn-announce live region carries the YOUR_TURN copy (AC-2.4.7)
//   - the value-free squirm signal shows only when justReceivedSwap is set, with NO card value (AC-2.4.3)
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectedTableState } from "@trash/shared";
import { JUST_SWAPPED, KEEP, SWAP, YOUR_TURN } from "../lib/copy";
import { DEBOUNCE_MS } from "../lib/interaction";

const sendSwap = vi.fn();
const sendKeep = vi.fn();
vi.mock("../lib/table-store.svelte", () => ({
  sendSwap: (...a: unknown[]) => sendSwap(...a),
  sendKeep: (...a: unknown[]) => sendKeep(...a),
}));

import YourTurn from "./YourTurn.svelte";

function player(id: string, name: string, lives = 3, seatIndex = 0) {
  return { id, name, lives, isAlive: true, isConnected: true, seatIndex };
}

function state(over: Partial<ProjectedTableState> = {}): ProjectedTableState {
  return {
    code: "WXYZ",
    phase: "turns",
    hostId: "me",
    startingLives: 3,
    you: { playerId: "me", isHost: true, isAlive: true, isConnected: true, isLastPlayer: false, hand: { rank: 5, suit: "♠" } },
    players: [player("me", "Mar", 3, 0), player("p2", "Beto", 3, 1)],
    currentTurnId: "me",
    turnToken: 0,
    phaseToken: 1,
    revealed: false,
    ...over,
  };
}

afterEach(cleanup);
beforeEach(() => {
  sendSwap.mockReset();
  sendKeep.mockReset();
});

describe("YourTurn surface", () => {
  it("renders SWAP and KEEP from copy.ts", () => {
    render(YourTurn, { props: { state: state() } });
    expect(screen.getByRole("button", { name: SWAP })).toBeTruthy();
    expect(screen.getByRole("button", { name: KEEP })).toBeTruthy();
  });

  it("SWAP and KEEP are the FIRST two focus stops (reading order; peek follows)", () => {
    render(YourTurn, { props: { state: state() } });
    const buttons = screen.getAllByRole("button");
    // DOM order = focus order for natural tab order. SWAP first, KEEP second, peek (if focusable) after.
    expect(buttons[0].getAttribute("aria-label")).toBe(SWAP);
    expect(buttons[1].getAttribute("aria-label")).toBe(KEEP);
  });

  it("tapping SWAP sends a swap with the current turn token", async () => {
    render(YourTurn, { props: { state: state({ turnToken: 0 }) } });
    await fireEvent.click(screen.getByRole("button", { name: SWAP }));
    expect(sendSwap).toHaveBeenCalledWith(0);
    expect(sendKeep).not.toHaveBeenCalled();
  });

  it("tapping KEEP sends a keep with the current turn token", async () => {
    render(YourTurn, { props: { state: state({ turnToken: 4 }) } });
    await fireEvent.click(screen.getByRole("button", { name: KEEP }));
    expect(sendKeep).toHaveBeenCalledWith(4);
    expect(sendSwap).not.toHaveBeenCalled();
  });

  it("a rapid double-tap on SWAP fires the send exactly ONCE (debounce, AC-2.4.5)", async () => {
    vi.useFakeTimers();
    try {
      render(YourTurn, { props: { state: state() } });
      const swapBtn = screen.getByRole("button", { name: SWAP });
      swapBtn.click();
      swapBtn.click(); // second tap within the debounce window — swallowed
      expect(sendSwap).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(DEBOUNCE_MS + 1); // window elapses
      swapBtn.click();
      expect(sendSwap).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("announces the turn to the screen reader via an assertive live region carrying YOUR_TURN", () => {
    render(YourTurn, { props: { state: state() } });
    const prompt = screen.getByText(YOUR_TURN);
    expect(prompt.getAttribute("role")).toBe("status");
    expect(prompt.getAttribute("aria-live")).toBe("assertive");
  });

  it("shows the value-free squirm signal ONLY when justReceivedSwap is set (no card value)", () => {
    const { unmount } = render(YourTurn, { props: { state: state({ justReceivedSwap: undefined }) } });
    expect(screen.queryByText(JUST_SWAPPED)).toBeNull(); // no flag → no squirm beat
    unmount();

    render(YourTurn, { props: { state: state({ justReceivedSwap: true }) } });
    const squirm = screen.getByText(JUST_SWAPPED);
    expect(squirm).toBeTruthy();
    // The squirm copy carries NO rank/suit — it is purely social (SM-6 / AR-7).
    expect(squirm.textContent).not.toMatch(/[0-9]|[♠♥♦♣]|king|ace|queen|jack/i);
  });

  it("does not render any other player's card value (SM-6 — Your Turn shows only the two buttons + peek)", () => {
    render(YourTurn, { props: { state: state() } });
    // Beto's seat / card never appears on the active player's surface.
    expect(screen.queryByText("Beto")).toBeNull();
  });
});
