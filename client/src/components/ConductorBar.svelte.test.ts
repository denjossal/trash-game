// ConductorBar.svelte.test.ts — the shared Host conductor bar (Story 4.1, AC-4.1.1/.2/.3/.4/.5/.7/.8).
// Runs in "client-dom".
//
// Pins:
//   - Host-only: the bar renders nothing for a non-Host (AC-4.1.2).
//   - phase → single primary mapping (AC-4.1.1): lobby→Deal (disabled <2 players), allActed→Showdown,
//     roundResult→Re-deal. Exactly ONE primary at a time.
//   - each primary posts the right table-store seam with state.phaseToken (AC-4.1.3/.4/.5). The store is
//     mocked so the test asserts the bar's send wiring (the store→socket path is the seam's own concern).
//   - the ⚙ controls affordance is a real labelled button (AC-4.1.6/.8).
//   - Eyes-Up (AC-4.1.7): the bar holds ONLY the primary + ⚙ — no timer/log/dashboard text.
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectedTableState } from "@trash/shared";
import { t } from "../lib/i18n.svelte";
import ConductorBar from "./ConductorBar.svelte";

// Story 7.1: copy moved to the keyed i18n dictionary; alias the English strings so assertions read unchanged.
const DEAL = t("DEAL");
const HOST_CONTROLS = t("HOST_CONTROLS");
const RE_DEAL = t("RE_DEAL");
const SHOWDOWN = t("SHOWDOWN");

// The bar's primaries call the store phase-send seams. Mock the store module so the test asserts the bar
// posts the right intent with the projection's phaseToken (the store→socket wiring is the seam test's job).
const sendDeal = vi.fn();
const sendRevealAll = vi.fn();
const sendDealAgain = vi.fn();
vi.mock("../lib/table-store.svelte", () => ({
  sendDeal: (t: number) => sendDeal(t),
  sendRevealAll: (t: number) => sendRevealAll(t),
  sendDealAgain: (t: number) => sendDealAgain(t),
}));

afterEach(() => {
  cleanup();
  sendDeal.mockClear();
  sendRevealAll.mockClear();
  sendDealAgain.mockClear();
});

function player(id: string, name: string, seatIndex: number) {
  return { id, name, lives: 3, isAlive: true, isConnected: true, seatIndex };
}

// A minimal projection; `over` tweaks phase / host status / player count / phaseToken per case.
function state(over: Partial<ProjectedTableState> = {}): ProjectedTableState {
  return {
    code: "CND1",
    phase: "lobby",
    hostId: "me",
    startingLives: 3,
    you: { playerId: "me", isHost: true, isAlive: true, isConnected: true, isLastPlayer: false },
    players: [player("me", "Mar", 0), player("p2", "Beto", 1)],
    phaseToken: 7,
    revealed: false,
    ...over,
  };
}

describe("ConductorBar", () => {
  it("renders NOTHING for a non-Host (AC-4.1.2)", () => {
    const { container } = render(ConductorBar, {
      props: { state: state({ you: { playerId: "p2", isHost: false, isAlive: true, isConnected: true, isLastPlayer: false } }) },
    });
    // No bar, no ⚙, no primary — the non-Host never sees the conductor.
    expect(container.querySelector("[data-testid='conductor-bar']")).toBeNull();
    expect(screen.queryByText(DEAL)).toBeNull();
    expect(screen.queryByRole("button", { name: HOST_CONTROLS })).toBeNull();
  });

  it("at lobby shows the Deal primary, disabled until ≥2 Players (AC-4.1.1/.3)", () => {
    // 1 player → disabled.
    const one = render(ConductorBar, { props: { state: state({ players: [player("me", "Mar", 0)] }) } });
    const dealBtn = one.getByText(DEAL).closest("button");
    expect(dealBtn).not.toBeNull();
    expect(dealBtn?.disabled).toBe(true);
    cleanup();
    // 2 players → enabled.
    const two = render(ConductorBar, { props: { state: state() } });
    expect(two.getByText(DEAL).closest("button")?.disabled).toBe(false);
  });

  it("tapping Deal posts sendDeal with the phaseToken (AC-4.1.3)", async () => {
    render(ConductorBar, { props: { state: state({ phaseToken: 7 }) } });
    await fireEvent.click(screen.getByText(DEAL));
    expect(sendDeal).toHaveBeenCalledWith(7);
    expect(sendRevealAll).not.toHaveBeenCalled();
    expect(sendDealAgain).not.toHaveBeenCalled();
  });

  it("at allActed shows the Showdown primary and posts sendRevealAll (AC-4.1.4)", async () => {
    render(ConductorBar, { props: { state: state({ phase: "allActed", phaseToken: 11 }) } });
    expect(screen.queryByText(DEAL)).toBeNull();
    await fireEvent.click(screen.getByText(SHOWDOWN));
    expect(sendRevealAll).toHaveBeenCalledWith(11);
    expect(sendDeal).not.toHaveBeenCalled();
  });

  it("the Showdown primary is NOT offered outside allActed (AC-4.1.4)", () => {
    render(ConductorBar, { props: { state: state({ phase: "turns" }) } });
    expect(screen.queryByText(SHOWDOWN)).toBeNull();
  });

  it("at roundResult shows the Re-deal primary and posts sendDealAgain (AC-4.1.5)", async () => {
    render(ConductorBar, { props: { state: state({ phase: "roundResult", phaseToken: 13 }) } });
    await fireEvent.click(screen.getByText(RE_DEAL));
    expect(sendDealAgain).toHaveBeenCalledWith(13);
  });

  it("an ELIMINATED Host still conducts — Re-deal shows when the Host is out (AR-5)", async () => {
    // A Host knocked out mid-game routes to the Eliminated surface, but REMAINS the Host and must keep
    // conducting (architecture.md:335-338). The bar keys on isHost/phase, NOT isAlive, so an eliminated
    // Host at roundResult still gets the Re-deal primary (App.svelte mounts the bar on `eliminated` too).
    render(ConductorBar, {
      props: {
        state: state({
          phase: "roundResult",
          phaseToken: 21,
          you: { playerId: "me", isHost: true, isAlive: false, isConnected: true, isLastPlayer: false },
        }),
      },
    });
    await fireEvent.click(screen.getByText(RE_DEAL));
    expect(sendDealAgain).toHaveBeenCalledWith(21);
  });

  it("exposes the ⚙ Host controls affordance as a labelled ≥48dp button (AC-4.1.6/.8)", () => {
    render(ConductorBar, { props: { state: state() } });
    const gear = screen.getByRole("button", { name: HOST_CONTROLS });
    expect(gear).not.toBeNull();
  });

  it("holds ONLY the primary + ⚙ — no timer/log/dashboard content (Eyes-Up, AC-4.1.7)", () => {
    const { container } = render(ConductorBar, { props: { state: state() } });
    const bar = container.querySelector("[data-testid='conductor-bar']");
    expect(bar).not.toBeNull();
    // Exactly two interactive controls in the bar: the phase primary + the ⚙.
    expect(bar?.querySelectorAll("button").length).toBe(2);
    // No attention-sink vocabulary leaks into the bar.
    expect(bar?.textContent ?? "").not.toMatch(/timer|log|dashboard|activity|score|streak/i);
  });
});
