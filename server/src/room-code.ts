// room-code.ts — crypto room-code generation (the candidate generator). Claim-on-create (the DO
// namespace IS the registry; idFromName(code), regenerate-on-collision) is wired in table-server.ts,
// NOT here: generation is a PURE crypto draw; the claim is a DO-stateful ctx.storage read+write that
// only the DO can perform. [Source: architecture.md#D7, #AR-11; Story 1.1 spike confirmed claim-on-create]
//
// SCOPE (Story 1.6): implements generateRoomCode() — a uniform 4-letter draw from the ambiguity-safe
// ROOM_CODE_ALPHABET via crypto.getRandomValues(). The CLIENT calls a sibling of this to pick a
// candidate code and connect to /parties/table/<candidate>; the addressed DO self-claims or reports
// already-claimed (table-server.ts), and the client regenerates + reconnects on a conflict.
//
// This file is in server/src/, NOT server/src/rules/**, so the GATE 2 purity ESLint denylist (which
// bans `crypto`) does NOT apply — crypto.getRandomValues() is legitimate and expected here. No npm
// dependency (crypto is the native Workers/Node-≥22/browser WebCrypto global). [Source: eslint.config.js
// GATE 2 glob = server/src/rules/**; architecture.md line 699.]
import { ROOM_CODE_ALPHABET, ROOM_CODE_LEN } from "@trash/shared";

// Rejection-sampling threshold for an UNBIASED draw. A byte is 0..255 (256 values); the alphabet has
// `ROOM_CODE_ALPHABET.length` (22) letters. 256 % 22 = 14 ≠ 0, so a naive `byte % 22` over-weights the
// first 14 letters (modulo bias). We accept only bytes in [0, MAX_UNBIASED_BYTE) where MAX_UNBIASED_BYTE
// is the largest multiple of the alphabet length that fits in a byte; bytes at or above it are rejected
// and redrawn. This yields a uniform distribution over the 22 letters. [Source: Story 1.6 Task 1.]
const ALPHABET_LEN = ROOM_CODE_ALPHABET.length;
const MAX_UNBIASED_BYTE = Math.floor(256 / ALPHABET_LEN) * ALPHABET_LEN; // 242 for a 22-letter alphabet

/**
 * Generate one Room Code: ROOM_CODE_LEN (4) uppercase letters drawn uniformly from the ambiguity-safe
 * ROOM_CODE_ALPHABET ("ABCDEFGHJKMNPQRSTUVWXYZ" — excludes O,0,I,1,L). Uses crypto.getRandomValues()
 * with rejection sampling so the draw is unbiased (NOT Math.random, NOT a biased modulo). Pure: it
 * touches no storage, no socket, no `this` — its only effect is the CSPRNG draw. [Source: architecture.md
 * D7 lines 437–440; AR-11; Story 1.6 AC-1.6.1.]
 */
export function generateRoomCode(): string {
  let code = "";
  while (code.length < ROOM_CODE_LEN) {
    // Draw a small batch of bytes at a time to amortize the syscall; reject biased bytes.
    const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LEN));
    for (const byte of bytes) {
      if (byte >= MAX_UNBIASED_BYTE) continue; // reject — would bias the modulo; redraw.
      code += ROOM_CODE_ALPHABET[byte % ALPHABET_LEN];
      if (code.length === ROOM_CODE_LEN) break;
    }
  }
  return code;
}
