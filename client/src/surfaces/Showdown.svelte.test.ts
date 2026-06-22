// Showdown.svelte.test.ts — the Showdown surface (Story 3.3, AC-3.3.1/.2/.3/.5/.7). Runs in "client-dom".
//
// Pins:
//   - every seat's card renders FACE-UP (rank letter + suit glyph) when revealed===true (AC1/AC5).
//   - loser highlight is a CONSUMER of state.loserIds (AC2): with loserIds set, the loser card(s) carry
//     the loser marker and non-losers carry the receded marker; with loserIds ABSENT/empty (today's bare
//     showdown produced by 3.2), NO card carries either marker — all cards render plain face-up.
//   - loser copy (AC3): the loser device shows the warm copy from copy.ts; the all-tied case shows TIE;
//     "YOU LOST" never appears.
//   - the coordinated flip is a discrete CSS hook (AC1) present on every card so the @media reduce-motion
//     skip applies at runtime (jsdom does not evaluate @media — we assert the hook exists, mirroring how
//     Button.svelte's reduce-motion is structured).
import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectedTableState } from "@trash/shared";
import { loser, TIE } from "../lib/copy";
import { rankToLetter } from "../lib/card-display";
import Showdown from "./Showdown.svelte";

afterEach(cleanup);

function player(id: string, name: string, lives = 3, seatIndex = 0, isAlive = true) {
  return { id, name, lives, isAlive, isConnected: true, seatIndex };
}

// A revealed showdown projection — every players[] seat carries its hand (3.2 made this reachable).
function state(over: Partial<ProjectedTableState> = {}): ProjectedTableState {
  return {
    code: "RVL3",
    phase: "showdown",
    hostId: "me",
    startingLives: 3,
    you: { playerId: "me", isHost: true, isAlive: true, isConnected: true, isLastPlayer: false, hand: { rank: 6, suit: "♠" } },
    players: [
      { ...player("me", "Mar", 3, 0), hand: { rank: 6, suit: "♠" } },
      { ...player("p2", "Beto", 3, 1), hand: { rank: 9, suit: "♥" } },
      { ...player("p3", "Cleo", 3, 2), hand: { rank: 12, suit: "♦" } },
    ],
    phaseToken: 3,
    revealed: true,
    ...over,
  };
}

describe("Showdown surface", () => {
  it("renders EVERY seat's card face-up (rank + suit) when revealed", () => {
    render(Showdown, { props: { state: state() } });
    // 6 / 9 / Q faces, each seat's suit glyph — all hands are visible at the reveal (SM-6 extended).
    expect(screen.getByText(rankToLetter(6))).toBeTruthy(); // "6"
    expect(screen.getByText(rankToLetter(9))).toBeTruthy(); // "9"
    expect(screen.getByText(rankToLetter(12))).toBeTruthy(); // "Q"
    expect(screen.getByText("♠")).toBeTruthy();
    expect(screen.getByText("♥")).toBeTruthy();
    expect(screen.getByText("♦")).toBeTruthy();
  });

  it("gives every card the flip hook (FX-ready addressable marker, one per seat)", () => {
    const { container } = render(Showdown, { props: { state: state() } });
    const flips = container.querySelectorAll("[data-flip]");
    expect(flips.length).toBe(3); // one per seat
  });

  it("the motion is on .card-frame (flip) and .seat.loser (scale) — the elements the @media skip targets", () => {
    // The reduce-motion skip (AC-3.3.1/.2) is pure CSS keyed off `.card-frame` (animation) and `.seat`
    // (transform/transition) — jsdom can't evaluate @media, so we instead pin the DOM CONTRACT that skip
    // depends on: the flip-animated element is .card-frame, and the loser scale is on .seat (NOT
    // .card-frame, whose transform the flip-in `both` fill would otherwise override). The old test asserted
    // [data-flip] count, which has no causal link to the skip and stayed green if the @media block vanished.
    const { container } = render(Showdown, { props: { state: state({ loserIds: ["me"] }) } });
    // Every seat wraps its card in a .card-frame (the flip target).
    expect(container.querySelectorAll(".seat .card-frame").length).toBe(3);
    // The loser scale lives on .seat.loser, not on its .card-frame (so flip-in does not mask it).
    const loserSeat = container.querySelector(".seat.loser");
    expect(loserSeat).not.toBeNull();
    expect(loserSeat?.tagName.toLowerCase()).toBe("li"); // the .seat <li>, the element that carries scale
  });

  it("BARE showdown (no loserIds): NO card is highlighted or receded — plain face-up", () => {
    const { container } = render(Showdown, { props: { state: state() } }); // loserIds absent
    expect(container.querySelector('[data-loser="true"]')).toBeNull();
    expect(container.querySelector('[data-receded="true"]')).toBeNull();
  });

  it("with loserIds: the loser card is marked loser; non-losers are marked receded", () => {
    const { container } = render(Showdown, { props: { state: state({ loserIds: ["me"] }) } });
    const losers = container.querySelectorAll('[data-loser="true"]');
    const receded = container.querySelectorAll('[data-receded="true"]');
    expect(losers.length).toBe(1); // only "me"
    expect(receded.length).toBe(2); // p2 + p3 recede
  });

  it("the loser device shows the warm loser copy, never 'YOU LOST'", () => {
    render(Showdown, { props: { state: state({ loserIds: ["me"] }) } });
    expect(screen.getByText(loser("Mar"))).toBeTruthy();
    expect(screen.queryByText(/YOU LOST/i)).toBeNull();
  });

  it("a NON-loser device shows no loser copy", () => {
    render(Showdown, { props: { state: state({ loserIds: ["p2"] }) } });
    // "me" (Mar) is not the loser here — no loser line addressed to this device.
    expect(screen.queryByText(loser("Mar"))).toBeNull();
    expect(screen.queryByText(TIE)).toBeNull();
  });

  it("all-tied (every shown seat in loserIds) shows the TIE copy, not an individual loser line", () => {
    render(Showdown, { props: { state: state({ loserIds: ["me", "p2", "p3"] }) } });
    expect(screen.getByText(TIE)).toBeTruthy();
    expect(screen.queryByText(loser("Mar"))).toBeNull(); // the all-tied line replaces the individual one
    expect(screen.queryByText(/YOU LOST/i)).toBeNull();
  });

  it("all-tied is NOT triggered when a shown seat is missing from loserIds (copy follows the lit cards)", () => {
    // allTied compares against the SAME players[] the highlight keys off, so it can never disagree with
    // which cards are lit: here p3 is not a loser, so it is the individual-loser case, not TIE.
    const { container } = render(Showdown, { props: { state: state({ loserIds: ["me", "p2"] }) } });
    expect(screen.queryByText(TIE)).toBeNull();
    expect(screen.getByText(loser("Mar"))).toBeTruthy(); // "me" lost individually
    expect(container.querySelectorAll('[data-loser="true"]').length).toBe(2); // me + p2 lit
  });

  it("a spectator whose seat is absent from players[] never renders a malformed empty-name loser line", () => {
    // A spectator's you.playerId can map to no seat in players[]. Even if a (stale) loserIds names it, the
    // warm copy is gated on the seat existing, so loser('') — "…That's a life, ." — can never render.
    render(Showdown, { props: { state: state({ you: { playerId: "ghost", isHost: false, isAlive: false, isConnected: true, isLastPlayer: false }, loserIds: ["ghost"] }) } });
    expect(screen.queryByText(/That's a life, \./)).toBeNull(); // no dangling empty name
    expect(screen.queryByText(loser(""))).toBeNull();
  });

  it("renders the hand-less seat FACE-DOWN — no fabricated face leaks (does not throw)", () => {
    const s = state();
    // Simulate the 3.2-deferred project-state.ts:61 edge: a seat without a hand entry.
    delete (s.players[2] as { hand?: unknown }).hand;
    const { container } = render(Showdown, { props: { state: s } });
    // The two seats WITH hands still render their faces.
    expect(screen.getByText(rankToLetter(6))).toBeTruthy();
    expect(screen.getByText(rankToLetter(9))).toBeTruthy();
    // The hand-less seat (was Q) renders the face-DOWN back, NOT a fabricated face. The {:else} placeholder
    // uses rank 1 (→ "A"); if it ever rendered face-up the phantom "A" would leak. Pin both invariants so a
    // regression flipping revealed={false}→{true} can't pass silently.
    expect(screen.queryByText(rankToLetter(12))).toBeNull(); // Cleo's real Q is gone (no hand)
    expect(screen.queryByText(rankToLetter(1))).toBeNull(); // and no phantom "A" from the placeholder
    expect(container.querySelector('[aria-label="Card, face-down"]')).not.toBeNull();
  });
});
