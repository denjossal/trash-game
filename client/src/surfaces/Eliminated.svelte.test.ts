// Eliminated.svelte.test.ts — the spectator surface (Story 3.5). Runs in "client-dom".
//
// Eliminated is reached when a Player is out of Lives: at a live phase (route-from-state.ts:56,
// `!you.isAlive` overrides turns/waiting/roundResult) or at gameOver as a non-winner (:48). The
// eliminated Player is a SIDELINE SPECTATOR — warm copy, NO actions (a spectator never routes to
// yourTurn, so there are no Swap/Keep/Re-deal buttons), and a non-punishing SR announcement that
// matches the warm copy verbatim (review-accessibility.md:93-94). It is NEVER a dead-end.
import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectedTableState } from "@trash/shared";
import { ELIMINATED } from "../lib/copy";
import Eliminated from "./Eliminated.svelte";

afterEach(cleanup);

// An eliminated projection: this device's seat is out (isAlive:false), the field plays on. The warm
// copy is state-independent, so the exact phase/winner does not change what Eliminated renders — but a
// realistic gameOver-non-winner shape is used so the test mirrors a real route into the surface.
function state(over: Partial<ProjectedTableState> = {}): ProjectedTableState {
  return {
    code: "EL35",
    phase: "gameOver",
    hostId: "p2",
    startingLives: 3,
    you: { playerId: "me", isHost: false, isAlive: false, isConnected: true, isLastPlayer: false },
    players: [
      { id: "me", name: "Mar", lives: 0, isAlive: false, isConnected: true, seatIndex: 0 },
      { id: "p2", name: "Beto", lives: 2, isAlive: true, isConnected: true, seatIndex: 1 },
    ],
    phaseToken: 6,
    revealed: false,
    winnerIds: ["p2"],
    ...over,
  };
}

describe("Eliminated spectator surface", () => {
  it("renders the warm 'stick around and heckle' copy (never a punishing 'Game over' line)", () => {
    const { container } = render(Eliminated, { props: { state: state() } });
    // The full warm voice line is present (it is split across lead/subline visually, so assert both halves).
    const [lead, tail] = ELIMINATED.split(" — ");
    expect(screen.getByText(new RegExp(lead))).toBeTruthy(); // "You're out"
    expect(screen.getByText(new RegExp(tail.replace(/\.$/, "")))).toBeTruthy(); // "stick around and heckle"
    // The banned "Don't" tone never appears.
    expect(container.textContent).not.toMatch(/game over/i);
    expect(container.textContent).not.toMatch(/you have been eliminated/i);
  });

  it("exposes a non-punishing aria-live (polite) status region carrying the warm copy", () => {
    const { container } = render(Eliminated, { props: { state: state() } });
    const live = container.querySelector('[aria-live]');
    expect(live).toBeTruthy();
    // Calm sideline transition → polite, NOT the assertive used for an urgent turn prompt.
    expect(live!.getAttribute("aria-live")).toBe("polite");
    expect(live!.getAttribute("role")).toBe("status");
    // The announced text IS the warm copy (matching tone for SR users) — not a separate punishing string.
    expect(live!.textContent).toMatch(/stick around and heckle/i);
    // The live region is a CHILD, never the <main> itself: role="status" on <main> would clobber its
    // implicit `main` landmark. Keep <main> a bare landmark, matching every sibling surface.
    const main = container.querySelector("main");
    expect(main).toBeTruthy();
    expect(main!.getAttribute("role")).toBeNull();
    expect(main!.getAttribute("aria-live")).toBeNull();
  });

  it("offers NO actions — a spectator has no Swap/Keep/Re-deal buttons", () => {
    const { container } = render(Eliminated, { props: { state: state() } });
    expect(container.querySelectorAll("button").length).toBe(0);
  });

  it("renders the same warm surface for a live-phase spectator (not only at gameOver)", () => {
    // route-from-state.ts:56 routes an eliminated player to `eliminated` during live phases too.
    const { container } = render(Eliminated, {
      props: { state: state({ phase: "turns", winnerIds: undefined, currentTurnId: "p2" }) },
    });
    expect(screen.getByText(/stick around and heckle/i)).toBeTruthy();
    expect(container.querySelectorAll("button").length).toBe(0);
  });
});
