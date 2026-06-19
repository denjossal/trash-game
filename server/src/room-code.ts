// room-code.ts — crypto room-code generation + claim-on-create (the DO namespace IS the
// registry; idFromName(code), regenerate-on-collision).
// [Source: architecture.md#D7, #AR-11; Story 1.1 spike confirmed claim-on-create]
//
// SCOPE (Story 1.2): seam file only. Implemented in Story 1.6 (with the 1.6 atomic-claim
// follow-up from the Story 1.1 review). Uses crypto.getRandomValues() + ROOM_CODE_ALPHABET.
export {};
