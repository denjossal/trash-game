// card-display.test.ts — the rank→letter map + SR-speech (Story 2.5, AC-2.5.5/.1/.4). Runs in
// "client-node" (pure, no DOM — the *.test.ts suffix keeps it out of the jsdom client-dom project).
//
// Pins:
//   - rankToLetter: the int→letter map 1→A (Ace lowest), 2..10 → "2".."10", 11→J, 12→Q, 13→K
//     (this module is the SOLE home of the letter map — architecture.md:551).
//   - rankSpeech: a screen-reader-clear word for the rank (Ace/Jack/Queen/King; else the number),
//     value-only (no hints), for the announce-once SR path (AC-2.5.4).
import { expect, test } from "vitest";
import { cardSpeech, rankSpeech, rankToLetter } from "./card-display";

test("rankToLetter: Ace is low (1→A), face cards 11→J / 12→Q / 13→K", () => {
  expect(rankToLetter(1)).toBe("A");
  expect(rankToLetter(11)).toBe("J");
  expect(rankToLetter(12)).toBe("Q");
  expect(rankToLetter(13)).toBe("K");
});

test("rankToLetter: pip ranks 2..10 are their own numerals", () => {
  for (let r = 2; r <= 10; r++) {
    expect(rankToLetter(r)).toBe(String(r));
  }
});

test("rankToLetter: every rank 1..13 maps to a non-empty single label (full alphabet)", () => {
  const labels = new Set<string>();
  for (let r = 1; r <= 13; r++) {
    const letter = rankToLetter(r);
    expect(letter).toBeTruthy();
    labels.add(letter);
  }
  // 13 distinct ranks → 13 distinct labels (A,2..10,J,Q,K).
  expect(labels.size).toBe(13);
});

test("rankSpeech: face ranks read as words for screen-reader clarity (a lone 'K' is ambiguous aloud)", () => {
  expect(rankSpeech(1)).toBe("Ace");
  expect(rankSpeech(11)).toBe("Jack");
  expect(rankSpeech(12)).toBe("Queen");
  expect(rankSpeech(13)).toBe("King");
});

test("rankSpeech: pip ranks 2..10 are spoken as the number", () => {
  for (let r = 2; r <= 10; r++) {
    expect(rankSpeech(r)).toBe(String(r));
  }
});

test("cardSpeech: rank word + suit name for the SR announce (suit is orientation-only)", () => {
  expect(cardSpeech({ rank: 13, suit: "♠" })).toBe("King of spades");
  expect(cardSpeech({ rank: 1, suit: "♥" })).toBe("Ace of hearts");
  expect(cardSpeech({ rank: 7, suit: "♦" })).toBe("7 of diamonds");
});
