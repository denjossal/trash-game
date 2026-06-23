// RoundResult.svelte.test.ts — the between-rounds RECOVERY surface (Story 3.4). Runs in "client-dom".
//
// RoundResult is reached ONLY by a roundResult projection that did NOT keep the round (revealed:false) —
// the D2.1-coerced wake (eviction mid-round → round=null → phase coerced to roundResult). The normal loud
// beat lives on Showdown while revealed===true. The game must never soft-lock between rounds after a
// reload: Story 4.1 moved the Host's Re-deal ACTION into the shared conductor bar (overlay), which mounts
// on this surface too — so this surface no longer renders RE_DEAL itself. Only the non-Host "waiting to
// re-deal" line stays here; both name the loser(s) + show the post-deduction pips from the durable result.
import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectedTableState } from "@trash/shared";
import { RE_DEAL, WAITING_TO_REDEAL } from "../lib/copy";
import RoundResult from "./RoundResult.svelte";

// Story 4.1 moved the Host's Re-deal action OFF this surface into the shared conductor bar (overlay). The
// RoundResult surface no longer imports any store seam — it only renders the non-Host "waiting" line.

afterEach(cleanup);

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
  it("does NOT render the Host Re-deal action (it is the conductor bar's now, Story 4.1)", () => {
    render(RoundResult, { props: { state: state() } });
    // The Host Re-deal button is no longer on this surface; the bar overlay carries it.
    expect(screen.queryByText(RE_DEAL)).toBeNull();
    // The Host (isHost: true via the default state) sees no waiting line either — the bar carries their action.
    expect(screen.queryByText(WAITING_TO_REDEAL)).toBeNull();
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
