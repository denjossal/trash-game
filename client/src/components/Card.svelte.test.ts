// Card.svelte.test.ts — the card-face / face-down-back display component (Story 2.5, AC-2.5.1/.3/.5).
// Runs in "client-dom".
//
// Pins:
//   - hidden (revealed=false): the face-down back renders; the rank letter + suit glyph are NOT in the
//     accessibility tree (the {#if revealed} conditional means the face node does not exist — AC-2.5.3).
//   - revealed (revealed=true): the big rank (via card-display's rankToLetter) + the single suit pip
//     glyph render (AC-2.5.1, UX-DR8).
//   - suit is rendered as the SHAPE (the glyph), not encoded only by color (AC-2.5.5).
import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import type { Card as CardType } from "@trash/shared";
import Card from "./Card.svelte";
import { rankToLetter } from "../lib/card-display";

afterEach(cleanup);

const KING: CardType = { rank: 13, suit: "♠" };
const FIVE: CardType = { rank: 5, suit: "♥" };

describe("Card surface (display-only)", () => {
  it("HIDDEN: the rank letter is NOT in the accessibility tree (face-down back is the resting state)", () => {
    render(Card, { props: { card: KING, revealed: false } });
    // {#if revealed} → the face node literally does not exist when hidden; the rank cannot leak.
    expect(screen.queryByText(rankToLetter(KING.rank))).toBeNull(); // "K" absent
    expect(screen.queryByText(KING.suit)).toBeNull(); // ♠ absent
  });

  it("HIDDEN: renders a labelled face-down back (so the resting state is perceivable)", () => {
    render(Card, { props: { card: KING, revealed: false } });
    // The back is an aria-labelled region announcing it is face-down (not the rank).
    expect(screen.getByLabelText(/face.?down|hidden/i)).toBeTruthy();
  });

  it("REVEALED: shows the big rank via the letter map + the single suit pip glyph", () => {
    render(Card, { props: { card: KING, revealed: true } });
    expect(screen.getByText("K")).toBeTruthy(); // 13 → K
    expect(screen.getByText("♠")).toBeTruthy(); // suit as a SHAPE/glyph (not a color)
  });

  it("REVEALED: pip rank renders its numeral", () => {
    render(Card, { props: { card: FIVE, revealed: true } });
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("♥")).toBeTruthy();
  });
});
