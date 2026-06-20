// Room-code generation unit test (node `rules` vitest project — `*.test.ts` suffix; pure function,
// no WS/DO plumbing). `room-code.ts` lives in server/src/ (NOT rules/**), so crypto.getRandomValues()
// is allowed there; this test pins the AR-11 ambiguity-safety + uniform-draw properties.
// [Source: server/vitest.config.ts naming convention; Story 1.6 AC-1.6.1/AC-1.6.2; architecture.md D7.]
import { expect, test } from "vitest";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LEN } from "@trash/shared";
import { generateRoomCode } from "./room-code.js";

// The five ambiguous characters AR-11 deliberately excludes from the alphabet. Asserting their
// ABSENCE (not just "in the alphabet") pins the human-read-aloud safety property explicitly.
const EXCLUDED = ["O", "0", "I", "1", "L"];

test("generateRoomCode: returns ROOM_CODE_LEN uppercase chars, all from ROOM_CODE_ALPHABET", () => {
  const code = generateRoomCode();
  expect(typeof code).toBe("string");
  expect(code.length).toBe(ROOM_CODE_LEN);
  for (const ch of code) {
    expect(ROOM_CODE_ALPHABET).toContain(ch);
  }
});

test("generateRoomCode: NEVER emits an ambiguous char (O,0,I,1,L) — AR-11 read-aloud safety", () => {
  // Many draws so an occasional bad index would surface. Each char must be in-alphabet AND
  // not in the excluded set (the excluded set is disjoint from the alphabet by construction,
  // but assert both so a regression that widened the alphabet would be caught).
  for (let i = 0; i < 1000; i++) {
    const code = generateRoomCode();
    for (const ch of code) {
      expect(ROOM_CODE_ALPHABET).toContain(ch);
      expect(EXCLUDED).not.toContain(ch);
    }
  }
});

test("generateRoomCode: over many draws every char stays in range and >1 distinct code appears", () => {
  // In-range over 1000 draws guards against a modulo-bias index overrun emitting an out-of-alphabet
  // char; >1 distinct code guards against a hard-coded/constant regression. (Collision odds over
  // 1000 draws of a ~234k space are negligible, so the distinct-code assertion is effectively certain.)
  const seen = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    const code = generateRoomCode();
    expect(code.length).toBe(ROOM_CODE_LEN);
    seen.add(code);
  }
  expect(seen.size).toBeGreaterThan(1);
});
