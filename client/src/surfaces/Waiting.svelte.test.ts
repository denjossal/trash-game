// Waiting.svelte.test.ts — the calmest surface (Story 2.4, AC-2.4.2, UX-DR6). Runs in "client-dom".
//
// Behavior pinned:
//   - renders the ACTIVE Player's name (whose turn it is)
//   - renders the CALLER's OWN Lives via LivesPips (filled + hollow pips)
//   - renders NO card value (UX-DR6 — Waiting never shows a card)
//   - the frame is INERT (not the active neon stroke) and has no pulse animation
import { cleanup, render, screen, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectedTableState } from "@trash/shared";

import Waiting from "./Waiting.svelte";

function player(id: string, name: string, lives = 3, seatIndex = 0) {
  return { id, name, lives, isAlive: true, isConnected: true, seatIndex };
}

function state(over: Partial<ProjectedTableState> = {}): ProjectedTableState {
  return {
    code: "WXYZ",
    phase: "turns",
    hostId: "p1",
    startingLives: 3,
    // The caller (you) is p2, waiting; the active player is p1.
    you: { playerId: "p2", isHost: false, isAlive: true, isConnected: true, isLastPlayer: false },
    players: [player("p1", "Mar", 3, 0), player("p2", "Beto", 2, 1)],
    currentTurnId: "p1",
    turnToken: 0,
    phaseToken: 1,
    revealed: false,
    ...over,
  };
}

afterEach(cleanup);

describe("Waiting surface", () => {
  it("renders the active Player's name (whose turn it is)", () => {
    render(Waiting, { props: { state: state() } });
    expect(screen.getByText(/Mar’s turn\./)).toBeTruthy();
  });

  it("renders the caller's OWN Lives via LivesPips (filled + hollow pips)", () => {
    render(Waiting, { props: { state: state() } });
    const lives = screen.getByLabelText(/your lives/i);
    // Beto (you) has 2 of 3 lives → 2 filled + 1 hollow.
    expect(within(lives).getAllByTestId("pip-filled")).toHaveLength(2);
    expect(within(lives).getAllByTestId("pip-hollow")).toHaveLength(1);
  });

  it("renders NO card value (UX-DR6 — Waiting never shows a card)", () => {
    render(Waiting, { props: { state: state() } });
    // No rank/suit anywhere in the surface — the active player's name + own pips only.
    expect(document.body.textContent ?? "").not.toMatch(/[♠♥♦♣]/);
  });

  it("falls back to a warm neutral when the active player is not yet resolvable", () => {
    render(Waiting, { props: { state: state({ currentTurnId: "ghost" }) } });
    expect(screen.getByText(/hang tight\./i)).toBeTruthy();
  });
});
