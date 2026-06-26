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

// --- Story 7.3: Spanish card ranks (faces + screen-reader speech), FR-19 ---

test("(7.3) rankToLetter es: A=As→'A', J=Jota→'J', K=Rey→'R'; ONLY the King glyph changes from English", () => {
  expect(rankToLetter(1, "es")).toBe("A"); // As
  expect(rankToLetter(11, "es")).toBe("J"); // Jota
  expect(rankToLetter(13, "es")).toBe("R"); // Rey — the one glyph that differs from English (K)
});

test("(7.3) rankToLetter es: the QUEEN glyph stays 'Q' (NOT 'R') to dodge the Reina/Rey R-collision", () => {
  expect(rankToLetter(12, "es")).toBe("Q"); // Reina — glyph deliberately Q, not R (AC-7.3.1)
  // and the Queen ('Q') and King ('R') glyphs are distinct in Spanish — no ambiguity.
  expect(rankToLetter(12, "es")).not.toBe(rankToLetter(13, "es"));
});

test("(7.3) rankToLetter es: pip ranks 2..10 render their numerals unchanged", () => {
  for (let r = 2; r <= 10; r++) expect(rankToLetter(r, "es")).toBe(String(r));
});

test("(7.3) rankSpeech es: face cards speak As / Jota / Reina / Rey (number cards in es speak the number)", () => {
  expect(rankSpeech(1, "es")).toBe("As");
  expect(rankSpeech(11, "es")).toBe("Jota");
  expect(rankSpeech(12, "es")).toBe("Reina");
  expect(rankSpeech(13, "es")).toBe("Rey");
  expect(rankSpeech(7, "es")).toBe("7");
});

test("(7.3) the INTENTIONAL es mismatch: the Queen GLYPH is 'Q' but the SPOKEN word is 'Reina'", () => {
  // Documented by design (AC-7.3.2): the glyph dodges the R-collision; the speech is fully Spanish.
  expect(rankToLetter(12, "es")).toBe("Q");
  expect(rankSpeech(12, "es")).toBe("Reina");
});

test("(7.3) cardSpeech es: rank word + 'de' + Spanish suit name (suit decorative, same glyph)", () => {
  expect(cardSpeech({ rank: 13, suit: "♠" }, "es")).toBe("Rey de picas");
  expect(cardSpeech({ rank: 1, suit: "♥" }, "es")).toBe("As de corazones");
  expect(cardSpeech({ rank: 12, suit: "♦" }, "es")).toBe("Reina de diamantes");
});

test("(7.3) English is unchanged when language is omitted (Spanish is purely additive)", () => {
  // The default-param "en" path keeps every English call site (and the MVP behaviour) identical.
  expect(rankToLetter(13)).toBe("K");
  expect(rankSpeech(12)).toBe("Queen");
  expect(cardSpeech({ rank: 13, suit: "♠" })).toBe("King of spades");
});
