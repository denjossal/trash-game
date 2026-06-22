// card-display.ts — the rank→letter map + screen-reader speech for a Card (Story 2.5, UX-DR8).
//
// THE SOLE HOME OF THE int→letter MAP. The architecture rule is explicit and grep-checkable:
// "int→letter map (1→A … 13→K) lives ONLY in src/client" [architecture.md:551], and the directory
// tree names this exact file [architecture.md:723; types.ts:16]. Do NOT duplicate the letters into any
// .svelte component — import `rankToLetter` from here. A reviewer (or a future grep) must find the
// letters in exactly one place.
//
// Ace is LOW (1→"A"), King is HIGH (13→"K") — matching the integer rank ordering used at Showdown
// (lowest rank loses, Epic 3). The map is DISPLAY-ONLY: the COMPARISON of ranks is server-side and
// uses the integer, never the letter (architecture.md:550 "rank as a string" is a violation).
//
// SUIT is decorative, distinguished by SHAPE not COLOR (UX-DR8, NFR-10 color-independence). The
// `Card.suit` field is already the glyph (♠/♥/♦/♣ — types.ts:19-22); surfaces render it directly as a
// large pip. There is deliberately NO suit→color map here.
//
// PURE / client-only (architecture.md#Client-boundary): no DOM, no socket, no Date/Math.random/storage;
// imports ONLY the `Card` type from @trash/shared.
import type { Card } from "@trash/shared";

/** Face-rank words, keyed by integer rank. Pip ranks (2..10) fall through to their numeral. */
const FACE_LETTER: Readonly<Record<number, string>> = { 1: "A", 11: "J", 12: "Q", 13: "K" };
const FACE_WORD: Readonly<Record<number, string>> = { 1: "Ace", 11: "Jack", 12: "Queen", 13: "King" };

/**
 * The int→letter display glyph for a rank: 1→"A" (Ace lowest), 2..10 → "2".."10", 11→"J", 12→"Q",
 * 13→"K". This is the ONLY place the letter map may live. `rank` is the integer 1..13 (types.ts:19-22).
 */
export function rankToLetter(rank: number): string {
  return FACE_LETTER[rank] ?? String(rank);
}

/**
 * A screen-reader-friendly WORD for the rank, for the announce-once peek path (AC-2.5.4). Face cards
 * read as words ("King") rather than a lone ambiguous letter ("K"); pip ranks read as the number.
 * Value-only — never a derived hint (good/bad card), per the SM-6 no-behavioral-tell rule.
 */
export function rankSpeech(rank: number): string {
  return FACE_WORD[rank] ?? String(rank);
}

/**
 * The full spoken description of a Card for the SR announce — rank word + suit name. Suit is spoken
 * for orientation only (it is decorative; never compared). Example: "King of spades".
 */
export function cardSpeech(card: Card): string {
  return `${rankSpeech(card.rank)} of ${SUIT_SPEECH[card.suit]}`;
}

/** Suit glyph → spoken name (orientation only; suit is decorative, never compared). */
const SUIT_SPEECH: Readonly<Record<Card["suit"], string>> = {
  "♠": "spades",
  "♥": "hearts",
  "♦": "diamonds",
  "♣": "clubs",
};
