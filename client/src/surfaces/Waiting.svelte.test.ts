// Waiting.svelte.test.ts — the calmest surface (Story 2.4, AC-2.4.2, UX-DR6). Runs in "client-dom".
//
// Behavior pinned:
//   - renders the ACTIVE Player's name (whose turn it is)
//   - renders the CALLER's OWN Lives via LivesPips (filled + hollow pips)
//   - the frame is INERT (not the active neon stroke) and has no pulse animation
//   - (Story 6.1) off-turn peek: press-and-hold reveals the caller's OWN card; release re-hides;
//     the rank is absent from the a11y tree while hidden; the peek always shows the CURRENT card;
//     SR announce-once; peeking sends NOTHING.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import type { Card, ProjectedTableState } from "@trash/shared";
import { t } from "../lib/i18n.svelte";

// Story 7.1: copy moved to the keyed i18n dictionary; alias the English strings so assertions read unchanged.
const JUST_SWAPPED = t("JUST_SWAPPED");
const PEEK_HINT = t("PEEK_HINT");

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

const KING: Card = { rank: 13, suit: "♠" };
const FIVE: Card = { rank: 5, suit: "♥" };

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

  it("falls back to a warm neutral when the active player is not yet resolvable", () => {
    render(Waiting, { props: { state: state({ currentTurnId: "ghost" }) } });
    expect(screen.getByText(/hang tight\./i)).toBeTruthy();
  });

  // The FINAL swap of a pass completes it (phase → allActed, currentTurnId cleared), so the swap
  // receiver routes HERE instead of Your Turn. Without rendering the beat on Waiting, the last-swap
  // receiver silently loses the "someone swapped with you" moment (Story 2.6 regression of AC-2.4.3).
  it("renders the squirm beat when the projection carries justReceivedSwap (the final-swap receiver)", () => {
    render(Waiting, { props: { state: state({ phase: "allActed", currentTurnId: "", justReceivedSwap: true }) } });
    expect(screen.getByText(JUST_SWAPPED)).toBeTruthy();
  });

  it("does NOT render the squirm beat when justReceivedSwap is absent (the normal waiting case)", () => {
    render(Waiting, { props: { state: state() } });
    expect(screen.queryByText(JUST_SWAPPED)).toBeNull();
  });

  // --- Story 6.1: off-turn peek on the Waiting surface (FR-20) ---

  it("AC-6.1.4: hidden by default — the own card's rank is NOT in the a11y tree while waiting", () => {
    render(Waiting, { props: { state: state({ you: { ...state().you, hand: KING } }) } });
    // The face-down back is present; the revealed rank/suit nodes do NOT exist ({#if revealed}).
    expect(screen.queryByText("K")).toBeNull();
    expect(screen.queryByText("♠")).toBeNull();
  });

  it("AC-6.1.1: press-and-hold reveals the own card; release re-hides immediately", async () => {
    render(Waiting, { props: { state: state({ you: { ...state().you, hand: KING } }) } });
    const peek = screen.getByRole("button", { name: /peek/i });
    await fireEvent.pointerDown(peek);
    expect(screen.getByText("K")).toBeTruthy();
    expect(screen.getByText("♠")).toBeTruthy();
    await fireEvent.pointerUp(peek);
    expect(screen.queryByText("K")).toBeNull();
  });

  it("AC-6.1.2: re-hides on pointercancel, pointerleave, and blur", async () => {
    render(Waiting, { props: { state: state({ you: { ...state().you, hand: FIVE } }) } });
    const peek = screen.getByRole("button", { name: /peek/i });
    for (const end of ["pointerCancel", "pointerLeave", "blur"] as const) {
      await fireEvent.pointerDown(peek);
      expect(screen.getByText("5")).toBeTruthy();
      await (fireEvent as unknown as Record<string, (el: Element) => Promise<boolean>>)[end](peek);
      expect(screen.queryByText("5")).toBeNull();
    }
  });

  it("AC-6.1.3: peek always shows the CURRENT card (follows a received swap)", async () => {
    const { rerender } = render(Waiting, { props: { state: state({ you: { ...state().you, hand: FIVE } }) } });
    const peek = screen.getByRole("button", { name: /peek/i });
    await fireEvent.pointerDown(peek);
    expect(screen.getByText("5")).toBeTruthy();
    await fireEvent.pointerUp(peek);
    // A swap moved a new card (the King) into the caller's hand — the projection re-pushes you.hand.
    await rerender({ state: state({ you: { ...state().you, hand: KING } }) });
    await fireEvent.pointerDown(peek);
    expect(screen.getByText("K")).toBeTruthy();
    expect(screen.queryByText("5")).toBeNull();
  });

  it("AC-6.1.5: SR announce-once — region is empty, set to the spoken card on reveal, cleared on release", async () => {
    render(Waiting, { props: { state: state({ you: { ...state().you, hand: KING } }) } });
    const region = screen.getByTestId("peek-announce");
    expect(region.textContent).toBe("");
    const peek = screen.getByRole("button", { name: /peek/i });
    await fireEvent.pointerDown(peek);
    expect(region.textContent).toMatch(/king/i);
    await fireEvent.pointerUp(peek);
    expect(region.textContent).toBe("");
  });

  it("AC-6.1.6: peeking sends NOTHING — the peek is the ONLY interactive control (no swap/keep/draw seam exists)", async () => {
    // The previous version of this test mocked ../lib/table-store.svelte and asserted the send seams
    // weren't called — but Waiting never imports that module, so the assertion was vacuous (it could
    // never fail). The REAL guarantee that peeking can't send is structural: Waiting exposes NO
    // Swap/Keep/Draw affordance at all — the only button is the press-and-hold peek, whose handlers
    // (reveal/hide) touch only local UI state. Pin that here.
    render(Waiting, { props: { state: state({ you: { ...state().you, hand: KING } }) } });

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute("aria-label")).toBe(PEEK_HINT);

    // Exercising the peek lifecycle changes only the local reveal state (verified by AC-6.1.1); there
    // is no other control through which a send could be triggered.
    const peek = buttons[0];
    await fireEvent.pointerDown(peek);
    await fireEvent.pointerUp(peek);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("AC-6.1.4: no peek control / card when the caller has no hand (early/odd projection) — does not throw", () => {
    render(Waiting, { props: { state: state() } }); // no you.hand
    expect(screen.queryByRole("button", { name: /peek/i })).toBeNull();
    // The calm surface still renders: active name + own Lives.
    expect(screen.getByText(/Mar’s turn\./)).toBeTruthy();
    expect(screen.getByLabelText(/your lives/i)).toBeTruthy();
  });
});
