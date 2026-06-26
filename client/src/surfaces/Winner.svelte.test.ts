// Winner.svelte.test.ts — the end-of-game celebration surface (Story 3.6, AC-3.6.1/.5/.6/.8). Runs in
// "client-dom". Routed at gameOver for the winner (route-from-state.ts:48 — winnerIds includes you).
//
// Pins:
//   - the warm "{name} wins it. One more?" copy renders with the winner's name (AC1).
//   - a shared win (multiple winnerIds) names ALL co-winners joined into the one name slot (AC1).
//   - the Host sees a "one more?" action; a tap posts newGame with the projection's phaseToken (AC2/AC8).
//   - a NON-Host sees a calm role=status waiting line and NO one-more button — never a dead button (AC5).
//   - SM-1 (AC6): the surface holds ONLY the celebration + the one action — no stats/streak/leaderboard.
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectedTableState } from "@trash/shared";
import { t } from "../lib/i18n.svelte";

// Story 7.1: copy moved to the keyed i18n dictionary; alias the English strings so assertions read unchanged.
const ONE_MORE = t("ONE_MORE");
const WAITING_TO_NEW_GAME = t("WAITING_TO_NEW_GAME");
const winner = (name: string) => t("winner", { name });
import Winner from "./Winner.svelte";

// The one-more block calls the store's sendNewGame seam. Mock the store module so the test asserts the
// surface posts the intent (the store→socket wiring is exercised by the table-store seam / DO test).
const sendNewGame = vi.fn();
vi.mock("../lib/table-store.svelte", () => ({ sendNewGame: (token: number) => sendNewGame(token) }));

afterEach(() => {
  cleanup();
  sendNewGame.mockClear();
});

function player(id: string, name: string, lives = 0, seatIndex = 0, isAlive = false) {
  return { id, name, lives, isAlive, isConnected: true, seatIndex };
}

// A terminal gameOver projection where THIS device (me) is the sole winner and the Host.
function state(over: Partial<ProjectedTableState> = {}): ProjectedTableState {
  return {
    code: "WIN3",
    phase: "gameOver",
    hostId: "me",
    startingLives: 3,
    you: { playerId: "me", isHost: true, isAlive: true, isConnected: true, isLastPlayer: false },
    players: [
      player("me", "Mar", 2, 0, true), // the survivor / winner
      player("p2", "Beto", 0, 1, false), // eliminated
    ],
    phaseToken: 7,
    revealed: true,
    winnerIds: ["me"],
    ...over,
  };
}

describe("Winner end-of-game surface", () => {
  it("renders the warm '{name} wins it. One more?' copy with the winner's name", () => {
    render(Winner, { props: { state: state() } });
    expect(screen.getByText(winner("Mar"))).toBeTruthy();
    // No punishing / retention-software vocabulary.
    const { container } = render(Winner, { props: { state: state() } });
    expect(container.textContent).not.toMatch(/streak|leaderboard|score|stats/i);
  });

  it("a shared win names ALL co-winners joined into the one name slot", () => {
    // 0-alive shared win (all tied to zero): both ids are in winnerIds. Names join into the single slot.
    render(Winner, {
      props: {
        state: state({
          you: { playerId: "me", isHost: true, isAlive: false, isConnected: true, isLastPlayer: false },
          players: [player("me", "Mar"), player("p2", "Beto")],
          winnerIds: ["me", "p2"],
        }),
      },
    });
    expect(screen.getByText(winner("Mar and Beto"))).toBeTruthy();
  });

  it("the Host sees the one-more action; a tap posts newGame with the phaseToken", async () => {
    render(Winner, { props: { state: state() } });
    const button = screen.getByText(ONE_MORE);
    expect(button).toBeTruthy();
    // The Host never sees the non-Host waiting line.
    expect(screen.queryByText(WAITING_TO_NEW_GAME)).toBeNull();
    await fireEvent.click(button);
    expect(sendNewGame).toHaveBeenCalledTimes(1);
    expect(sendNewGame).toHaveBeenCalledWith(7); // state.phaseToken
  });

  it("a NON-Host winner sees the calm waiting line and NO one-more button", () => {
    // A co-winner who is not the Host: they celebrate + see a calm waiting line, never a dead button.
    const { container } = render(Winner, {
      props: {
        state: state({
          hostId: "host",
          you: { playerId: "me", isHost: false, isAlive: true, isConnected: true, isLastPlayer: false },
          players: [player("me", "Mar", 2, 0, true), player("host", "Hank", 1, 1, true)],
          winnerIds: ["me"],
        }),
      },
    });
    const waiting = container.querySelector('[role="status"]');
    expect(waiting).toBeTruthy();
    expect(waiting!.getAttribute("aria-live")).toBe("polite");
    expect(waiting!.textContent).toMatch(/waiting on the host/i);
    expect(screen.queryByText(ONE_MORE)).toBeNull();
    expect(container.querySelectorAll("button").length).toBe(0);
  });
});
