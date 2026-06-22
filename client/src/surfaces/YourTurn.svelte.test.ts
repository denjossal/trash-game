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
import { DRAW, JUST_SWAPPED, KEEP, PEEK_HINT, SWAP, YOUR_TURN } from "../lib/copy";
import { DEBOUNCE_MS } from "../lib/interaction";
import { cardSpeech } from "../lib/card-display";

const sendSwap = vi.fn();
const sendKeep = vi.fn();
const sendDraw = vi.fn();
vi.mock("../lib/table-store.svelte", () => ({
  sendSwap: (...a: unknown[]) => sendSwap(...a),
  sendKeep: (...a: unknown[]) => sendKeep(...a),
  sendDraw: (...a: unknown[]) => sendDraw(...a),
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
  sendDraw.mockReset();
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

describe("YourTurn — peek your own card (Story 2.5, AC-2.5.1/.2/.3/.4/.5)", () => {
  function peekControl(): HTMLElement {
    return screen.getByRole("button", { name: PEEK_HINT });
  }

  it("the peek control is a real <button> AFTER SWAP/KEEP (the 2.4 focus-order contract holds)", () => {
    render(YourTurn, { props: { state: state() } });
    const buttons = screen.getAllByRole("button");
    expect(buttons[0].getAttribute("aria-label")).toBe(SWAP);
    expect(buttons[1].getAttribute("aria-label")).toBe(KEEP);
    // The peek control is present and is NOT one of the first two focus stops.
    expect(buttons.some((b) => b.getAttribute("aria-label") === PEEK_HINT)).toBe(true);
    expect(buttons[0].getAttribute("aria-label")).not.toBe(PEEK_HINT);
    expect(buttons[1].getAttribute("aria-label")).not.toBe(PEEK_HINT);
  });

  it("DEFAULT (no press): the own-card rank is NOT in the accessibility tree (AC-2.5.3)", () => {
    render(YourTurn, { props: { state: state({ you: { ...state().you, hand: { rank: 13, suit: "♠" } } }) } });
    // Face-down resting state — the rank node does not exist until a peek.
    expect(screen.queryByText("K")).toBeNull();
    expect(screen.queryByText("♠")).toBeNull();
  });

  it("PRESS-AND-HOLD reveals the own card; RELEASE re-hides it immediately (AC-2.5.1)", async () => {
    render(YourTurn, { props: { state: state({ you: { ...state().you, hand: { rank: 13, suit: "♠" } } }) } });
    const peek = peekControl();

    await fireEvent.pointerDown(peek);
    expect(screen.getByText("K")).toBeTruthy(); // 13 → K (via the letter map)
    expect(screen.getByText("♠")).toBeTruthy();

    await fireEvent.pointerUp(peek);
    expect(screen.queryByText("K")).toBeNull(); // released → re-hidden immediately, never persistent
  });

  it("pointercancel / pointerleave also re-hide (a drag off the control never leaves it revealed)", async () => {
    render(YourTurn, { props: { state: state({ you: { ...state().you, hand: { rank: 5, suit: "♥" } } }) } });
    const peek = peekControl();

    await fireEvent.pointerDown(peek);
    expect(screen.getByText("5")).toBeTruthy();
    await fireEvent.pointerLeave(peek);
    expect(screen.queryByText("5")).toBeNull();

    await fireEvent.pointerDown(peek);
    expect(screen.getByText("5")).toBeTruthy();
    await fireEvent.pointerCancel(peek);
    expect(screen.queryByText("5")).toBeNull();
  });

  it("BLUR re-hides the peeked card (a phone set down never exposes a hand — AC-2.5.2)", async () => {
    render(YourTurn, { props: { state: state({ you: { ...state().you, hand: { rank: 5, suit: "♥" } } }) } });
    const peek = peekControl();
    await fireEvent.pointerDown(peek);
    expect(screen.getByText("5")).toBeTruthy();
    await fireEvent.blur(peek);
    expect(screen.queryByText("5")).toBeNull();
  });

  it("SR announce-once: activating the peek announces the rank ONCE, then the live region is cleared (AC-2.5.4)", async () => {
    const hand = { rank: 13, suit: "♠" } as const;
    render(YourTurn, { props: { state: state({ you: { ...state().you, hand } }) } });
    const peek = peekControl();

    // The SR live region exists and is empty until activation (no persistent readable rank).
    const region = document.querySelector('[data-testid="peek-announce"]') as HTMLElement;
    expect(region).toBeTruthy();
    expect(region.textContent).toBe("");

    await fireEvent.pointerDown(peek);
    expect(region.textContent).toBe(cardSpeech(hand)); // "King of spades" — announced once, owner-only

    await fireEvent.pointerUp(peek);
    expect(region.textContent).toBe(""); // discarded — never a persistent readable node
  });

  it("peeking sends NOTHING to the server (peeking is LOCAL UI-only state — architecture rule)", async () => {
    render(YourTurn, { props: { state: state({ you: { ...state().you, hand: { rank: 9, suit: "♦" } } }) } });
    const peek = peekControl();
    await fireEvent.pointerDown(peek);
    await fireEvent.pointerUp(peek);
    expect(sendSwap).not.toHaveBeenCalled();
    expect(sendKeep).not.toHaveBeenCalled();
  });

  it("guards a missing own hand (early/odd projection) without throwing", () => {
    const base = state();
    expect(() =>
      render(YourTurn, {
        props: { state: { ...base, you: { ...base.you, hand: undefined } } },
      }),
    ).not.toThrow();
  });
});

describe("YourTurn — Last Player draw-from-deck (Story 2.6, AC-2.6.1)", () => {
  it("does NOT render the Draw button when you.isLastPlayer is false (every other seat sees only Swap/Keep)", () => {
    render(YourTurn, { props: { state: state({ you: { ...state().you, isLastPlayer: false } }) } });
    expect(screen.queryByRole("button", { name: DRAW })).toBeNull();
  });

  it("renders the Draw button ONLY when you.isLastPlayer is true", () => {
    render(YourTurn, { props: { state: state({ you: { ...state().you, isLastPlayer: true } }) } });
    expect(screen.getByRole("button", { name: DRAW })).toBeTruthy();
  });

  it("the Draw button comes AFTER SWAP/KEEP (the standing focus-order contract holds — buttons[0]/[1])", () => {
    render(YourTurn, { props: { state: state({ you: { ...state().you, isLastPlayer: true } }) } });
    const buttons = screen.getAllByRole("button");
    expect(buttons[0].getAttribute("aria-label")).toBe(SWAP);
    expect(buttons[1].getAttribute("aria-label")).toBe(KEEP);
    // Draw is present but is NOT one of the first two focus stops.
    expect(buttons[0].getAttribute("aria-label")).not.toBe(DRAW);
    expect(buttons[1].getAttribute("aria-label")).not.toBe(DRAW);
    expect(buttons.some((b) => b.getAttribute("aria-label") === DRAW)).toBe(true);
  });

  it("tapping Draw sends a drawFromDeck with the current turn token (and nothing else)", async () => {
    render(YourTurn, { props: { state: state({ turnToken: 4, you: { ...state().you, isLastPlayer: true } }) } });
    await fireEvent.click(screen.getByRole("button", { name: DRAW }));
    expect(sendDraw).toHaveBeenCalledWith(4);
    expect(sendSwap).not.toHaveBeenCalled();
    expect(sendKeep).not.toHaveBeenCalled();
  });
});
