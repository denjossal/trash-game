// Game tunables — the small bit of non-type config that lives in the shared contract.
// [Source: architecture.md#Complete-Project-Directory-Structure — shared/src/config.ts]
// Values per architecture D5/D7 and PRD FR-4/FR-13. Consumed by server (and client where noted).

/** One 52-card deck covers tables up to this size; 11–20 use two merged decks (D5/FR-13). */
export const SINGLE_DECK_MAX_PLAYERS = 10;

/** Heads-up (2) is the minimum playable table; 20 is the MVP ceiling. */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 20;

/** Default starting Lives when the Host has not set them (FR-4). Host may set 1–5. */
export const DEFAULT_LIVES = 3;
export const MIN_LIVES = 1;
export const MAX_LIVES = 5;

/** Room Code: 4 letters from an ambiguity-safe alphabet (exclude O,0,I,1,L) (D7/AR-11). */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";
export const ROOM_CODE_LEN = 4;

/** Idle GC TTL — the DO self-deletes after this long with no active connections (D7). */
export const IDLE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

/**
 * Debounce window for re-arming the idle GC alarm. The DO re-arms the IDLE_TTL_MS alarm on activity, but
 * only if more than this long has elapsed since the last arm — so a burst of intents does not rewrite the
 * alarm on every message (per-intent setAlarm write amplification). Over-arming is harmless (the TTL only
 * needs to be safe-by-margin); this just caps the write rate. [Source: architecture.md#D7.]
 */
export const ALARM_REARM_DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes
