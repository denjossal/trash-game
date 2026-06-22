// RoundResult.svelte.test.ts — the between-rounds RECOVERY surface (Story 3.4). Runs in "client-dom".
//
// RoundResult is reached ONLY by a roundResult projection that did NOT keep the round (revealed:false) —
// the D2.1-coerced wake (eviction mid-round → round=null → phase coerced to roundResult). The normal loud
// beat lives on Showdown while revealed===true. This surface MUST carry the Re-deal affordance so the game
// is never soft-locked between rounds after a reload (the review finding this surface fixes): the Host sees
// the Re-deal action; non-Hosts see the waiting line; both name the loser(s) + show the post-deduction pips
// from the durable result the projection still carries.
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectedTableState } from "@trash/shared";
import { RE_DEAL, WAITING_TO_REDEAL } from "../lib/copy";
import RoundResult from "./RoundResult.svelte";

const sendDealAgain = vi.fn();
vi.mock("../lib/table-store.svelte", () => ({ sendDealAgain: (token: number) => sendDealAgain(token) }));

afterEach(() => {
  cleanup();
  sendDealAgain.mockClear();
});

// A coerced-wake roundResult projection: round lost → revealed:false, NO hands, but the durable result
// (loserIds + post-deduction lives + nextStartingPlayerId on the server) is restored.
function state(over: Partial<ProjectedTableState> = {}): ProjectedTableState {
  return {
    code: "RR34",
    phase: "roundResult",
    hostId: "me",
    startingLives: 3,
    you: { playerId: "me", isHost: true, isAlive: true, isConnected: true, isLastPlayer: false },
    players: [
      { id: "me", name: "Mar", lives: 3, isAlive: true, isConnected: true, seatIndex: 0 },
      { id: "p2", name: "Beto", lives: 2, isAlive: true, isConnected: true, seatIndex: 1 },
    ],
    phaseToken: 4,
    revealed: false,
    loserIds: ["p2"],
    ...over,
  };
}

describe("RoundResult recovery surface", () => {
  it("the Host sees the Re-deal action; a tap posts dealAgain with the phaseToken", async () => {
    render(RoundResult, { props: { state: state() } });
    const button = screen.getByText(RE_DEAL);
    expect(button).toBeTruthy();
    expect(screen.queryByText(WAITING_TO_REDEAL)).toBeNull();
    await fireEvent.click(button);
    expect(sendDealAgain).toHaveBeenCalledTimes(1);
    expect(sendDealAgain).toHaveBeenCalledWith(4); // state.phaseToken
  });

  it("a NON-Host sees the waiting line, not the Re-deal action", () => {
    render(RoundResult, {
      props: {
        state: state({
          you: { playerId: "p2", isHost: false, isAlive: true, isConnected: true, isLastPlayer: false },
        }),
      },
    });
    expect(screen.getByText(WAITING_TO_REDEAL)).toBeTruthy();
    expect(screen.queryByText(RE_DEAL)).toBeNull();
  });

  it("names the loser and shows post-deduction Lives pips (no hands — round was lost)", () => {
    const { container } = render(RoundResult, { props: { state: state() } });
    // The loser is named (appears in the loser line AND the roster — at least one match).
    expect(screen.getAllByText(/Beto/).length).toBeGreaterThan(0);
    // Beto (loser) has 2 of 3 lives → 1 spent (hollow) pip; Mar has 3 filled, 0 hollow.
    expect(container.querySelectorAll(".pip.hollow").length).toBe(1);
    // No face-up cards on this surface (the round is gone).
    expect(container.querySelector('[aria-label^="Card,"]')).toBeNull();
  });
});
