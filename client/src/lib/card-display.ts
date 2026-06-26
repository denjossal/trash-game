// card-display.ts — the rank→glyph map + screen-reader speech for a Card (Story 2.5, UX-DR8; Spanish
// added Story 7.3, FR-19).
//
// THE SOLE HOME OF THE rank→glyph MAP. The architecture rule is explicit and grep-checkable:
// "int→letter map (1→A … 13→K) lives ONLY in src/client" [architecture.md:551], and the directory
// tree names this exact file [architecture.md:723; types.ts:16]. Do NOT duplicate the letters into any
// .svelte component — import `rankToLetter` from here. A reviewer (or a future grep) must find the
// letters in exactly one place.
//
// LANGUAGE-AWARE (Story 7.3): the glyph + speech now take a `language` ("en" | "es"), so a Spanish
// device shows As/Jota/Reina/Rey faces and HEARS them. This module stays PURE (no store import, no
// runes) — the SOLE map — so it remains unit-testable without mounting Svelte; the components pass the
// reactive `getLanguage()` (i18n.svelte) at the call site. `language` defaults to "en" so existing
// English call sites read unchanged.
//
// Ace is LOW (1→"A"/"As"), King is HIGH (13→"K"/"R") — matching the integer rank ordering used at
// Showdown (lowest rank loses, Epic 3). The map is DISPLAY-ONLY: rank COMPARISON is server-side and
// uses the integer, never the glyph (architecture.md:550). Suit stays decorative, distinguished by
// SHAPE not COLOR (UX-DR8, NFR-10) and is the same glyph in every language — there is NO suit→color map.
import type { Card } from "@trash/shared";
import type { Language } from "./i18n.svelte";

/**
 * Face-rank GLYPHS per language, keyed by integer rank. Pip ranks (2..10) fall through to the numeral.
 *
 * SPANISH (FR-19): A→"As" shortened to "A" on the face? No — the face glyph stays a SHORT token: en uses
 * single letters A/J/Q/K; es uses A (As) / J (Jota) / Q (Reina) / R (Rey). NOTE the deliberate choices:
 *  - the QUEEN glyph stays "Q" in Spanish (NOT "R"): Reina and Rey both start with "R", so a Spanish "R"
 *    glyph would be ambiguous between Queen and King. Q dodges the collision; only the KING glyph
 *    changes from the English face (K→R). [AC-7.3.1]
 *  - Ace/Jack glyphs are unchanged (A/J serve both languages).
 */
const FACE_GLYPH: Record<Language, Readonly<Record<number, string>>> = {
  en: { 1: "A", 11: "J", 12: "Q", 13: "K" },
  es: { 1: "A", 11: "J", 12: "Q", 13: "R" }, // only the King glyph changes (K→R); Queen stays Q.
};

/** Face-rank WORDS per language for the SR announce. Pip ranks fall through to the number. */
const FACE_WORD: Record<Language, Readonly<Record<number, string>>> = {
  en: { 1: "Ace", 11: "Jack", 12: "Queen", 13: "King" },
  es: { 1: "As", 11: "Jota", 12: "Reina", 13: "Rey" },
};

/** Suit glyph → spoken name, per language (orientation only; suit is decorative, never compared). */
const SUIT_SPEECH: Record<Language, Readonly<Record<Card["suit"], string>>> = {
  en: { "♠": "spades", "♥": "hearts", "♦": "diamonds", "♣": "clubs" },
  es: { "♠": "picas", "♥": "corazones", "♦": "diamantes", "♣": "tréboles" },
};

/** Spanish connector for "<rank> of <suit>" (en: "of"; es: "de"). */
const OF: Record<Language, string> = { en: "of", es: "de" };

/**
 * The rank's display GLYPH: en 1→"A" (Ace lowest), 2..10 → "2".."10", 11→"J", 12→"Q", 13→"K"; es swaps
 * only the King glyph to "R" (Rey), Queen stays "Q" (Reina/Rey R-collision). This is the ONLY place the
 * map may live. `rank` is the integer 1..13 (types.ts). [AC-7.3.1; FR-19.]
 */
export function rankToLetter(rank: number, language: Language = "en"): string {
  return FACE_GLYPH[language][rank] ?? String(rank);
}

/**
 * A screen-reader-friendly WORD for the rank (face cards read as words — a lone "K"/"R" is ambiguous
 * aloud; pip ranks read as the number). en: Ace/Jack/Queen/King; es: As/Jota/Reina/Rey. Value-only —
 * never a derived hint (good/bad card), per the SM-6 no-behavioral-tell rule.
 *
 * INTENTIONAL es mismatch (AC-7.3.2): the Queen GLYPH is "Q" but the SPOKEN word is "Reina" — the glyph
 * dodges the R-collision while the speech is fully Spanish. This is by design; do not "correct" it.
 */
export function rankSpeech(rank: number, language: Language = "en"): string {
  return FACE_WORD[language][rank] ?? String(rank);
}

/**
 * The full spoken description of a Card for the SR announce — rank word + suit name, in `language`.
 * Suit is spoken for orientation only (decorative; never compared). en: "King of spades"; es: "Rey de
 * picas". [FR-19, NFR-10.]
 */
export function cardSpeech(card: Card, language: Language = "en"): string {
  return `${rankSpeech(card.rank, language)} ${OF[language]} ${SUIT_SPEECH[language][card.suit]}`;
}
