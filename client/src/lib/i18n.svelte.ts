// i18n.svelte.ts — the keyed copy dictionary + the per-device language store + the `t(key, params)`
// accessor (Story 7.1, FR-15/FR-16). The backbone every later Epic-7 story rides on.
//
// WHY THIS EXISTS: copy.ts was 33 flat exports of hardcoded English. To let each DEVICE render in its
// own language (English or Spanish, abuela + grandson at the same table — UJ-4/SM-3), copy becomes a
// keyed dictionary with one table per language, read through ONE reactive accessor. Adding a language is
// then "more dictionary entries", not a surface rewrite.
//
// REACTIVE (Svelte 5 runes): `language` is a module-level `$state`. `t(...)` READS it on every call, so a
// component that calls `t('SWAP')` in its markup re-renders when the language changes — the same reactive-
// getter idiom as table-store.svelte.ts's readTableState(). Switching language re-renders the whole app.
//
// PER-DEVICE / ZERO-CONTRACT (§11.3, FR-15): the choice lives in this device's localStorage ONLY. It is
// NEVER sent to the server, changes nothing on any other device, and touches no `@trash/shared` type,
// projection, or persistence. First-run default is English (no device-locale auto-detect in v2).
//
// $0 / no new dep (G2): a tiny hand-rolled dictionary + accessor — no i18n runtime library.
//
// Client-only module (architecture.md#Client-boundary — client/src/lib for client-only logic).

export type Language = "en" | "es";

/** The languages offered, in toggle order (Story 7.2 renders these). */
export const LANGUAGES: readonly Language[] = ["en", "es"];

/** localStorage key for the per-device language preference (do not scatter the string). */
export const LANGUAGE_KEY = "trash.language";

/**
 * The copy dictionary CONTRACT: the full set of keys, each either a plain string or a parameterized
 * builder. Every language table must satisfy this exact shape, so a missing key in any language is a
 * COMPILE error (the dictionary can never silently fall back to a stale string). The param objects are
 * named so call sites read self-documenting: t("loser", { name }).
 */
export type Copy = {
  // App-frame.
  APP_NAME: string;
  CONNECTING: string;
  // Language toggle (Story 7.2, UX-DR19). LANGUAGE_LABEL is the control's accessible name; the per-
  // language NAMEs label each option. Each language's own name reads the SAME in every table (an
  // endonym — "Español" is "Español" whether the UI is currently English or Spanish), so a Player can
  // always recognise their language; only LANGUAGE_LABEL localizes.
  LANGUAGE_LABEL: string;
  LANG_NAME_EN: string;
  LANG_NAME_ES: string;
  // Home (Story 1.10, UX-DR3).
  START_TABLE: string;
  JOIN_TABLE: string;
  BAD_CODE: string;
  TABLE_BUSY: string;
  // Lobby (Story 1.10).
  DEAL: string;
  roomCode: (p: { code: string }) => string;
  waitingForHost: (p: { host: string }) => string;
  // Turns (Epic 2).
  YOUR_TURN: string;
  SWAP: string;
  KEEP: string;
  PEEK_HINT: string;
  DRAW: string;
  JUST_SWAPPED: string;
  // Waiting surface (Story 2.4) — the active-player turn line + the not-yet-resolvable fallback, and the
  // own-lives aria-label. These were inline literals pre-7.1; keyed now so they localize too (FR-16).
  activeTurn: (p: { name: string }) => string;
  HANG_TIGHT: string;
  YOUR_LIVES: string;
  // Showdown / RoundResult (Epic 3).
  loser: (p: { name: string }) => string;
  TIE: string;
  ROUND_OVER: string;
  RE_DEAL: string;
  WAITING_TO_REDEAL: string;
  // RoundResult between-rounds lost-a-life line (Story 3.4) — inline literals pre-7.1, keyed now. The
  // names are joined separately; this is the trailing clause, plural-aware.
  lostALife: (p: { plural: boolean }) => string;
  // Conductor / Host controls (Epic 4).
  SHOWDOWN: string;
  HOST_CONTROLS: string;
  LIVES: string;
  PLAYERS: string;
  REMOVE: string;
  confirmRemove: (p: { name: string }) => string;
  REASSIGN_HOST: string;
  MAKE_HOST: string;
  // Host Controls sheet aria-labels (Story 4.2) — SR-only strings that were inline literals pre-7.1.
  CLOSE_HOST_CONTROLS: string;
  LIVES_STEPPER: string;
  DECREASE_LIVES: string;
  INCREASE_LIVES: string;
  STARTING_LIVES: string;
  removePlayer: (p: { name: string }) => string;
  CANCEL_REMOVE: string;
  makePlayerHost: (p: { name: string }) => string;
  // End-of-game (Epic 3).
  ELIMINATED: string;
  winner: (p: { name: string }) => string;
  WINNER_FALLBACK: string;
  ONE_MORE: string;
  WAITING_TO_NEW_GAME: string;
};

/** Keys whose value is a plain string (no params). */
export type PlainKey = {
  [K in keyof Copy]: Copy[K] extends string ? K : never;
}[keyof Copy];

/** Keys whose value is a parameterized builder, with their param object type. */
export type ParamKey = Exclude<keyof Copy, PlainKey>;

// --- English (the baseline; renders identically to the pre-7.1 copy.ts, verbatim from EXPERIENCE.md's
//     "Voice and Tone" "Do" column). Spanish (es) is added in Stories 7.3/7.4 — its table is a stub here
//     that mirrors English so the app stays fully functional in es until the authored voice lands. ---
const en: Copy = {
  APP_NAME: "Trash",
  CONNECTING: "Connecting…",
  LANGUAGE_LABEL: "Language",
  LANG_NAME_EN: "English",
  LANG_NAME_ES: "Español",
  START_TABLE: "Start a table",
  JOIN_TABLE: "Join a table",
  BAD_CODE: "No table with that code — check the letters?",
  TABLE_BUSY: "That table's full or already playing — try another?",
  DEAL: "Deal",
  roomCode: ({ code }) => `Your table code: ${code} — read it out.`,
  waitingForHost: ({ host }) => `Hang tight — ${host} deals when everyone's in.`,
  YOUR_TURN: "Your turn. Swap it or keep it?",
  SWAP: "SWAP",
  KEEP: "KEEP",
  PEEK_HINT: "Press and hold to peek.",
  DRAW: "Draw from deck",
  JUST_SWAPPED: "Someone swapped with you!",
  activeTurn: ({ name }) => `${name}’s turn.`,
  HANG_TIGHT: "Hang tight.",
  YOUR_LIVES: "Your lives",
  loser: ({ name }) => `Ooof — lowest card. That's a life, ${name}.`,
  TIE: "Tie for lowest — everybody drops a life!",
  ROUND_OVER: "Round over.",
  RE_DEAL: "Deal the next round",
  WAITING_TO_REDEAL: "Waiting on the host to deal again…",
  lostALife: ({ plural }) => (plural ? "each lost a life." : "lost a life."),
  SHOWDOWN: "Show the cards",
  HOST_CONTROLS: "Host controls",
  LIVES: "Lives",
  PLAYERS: "Players",
  REMOVE: "Remove",
  confirmRemove: ({ name }) => `Remove ${name}?`,
  REASSIGN_HOST: "Make someone else host",
  MAKE_HOST: "Make host",
  CLOSE_HOST_CONTROLS: "Close host controls",
  LIVES_STEPPER: "Lives stepper",
  DECREASE_LIVES: "Decrease lives",
  INCREASE_LIVES: "Increase lives",
  STARTING_LIVES: "Starting lives",
  removePlayer: ({ name }) => `Remove ${name}`,
  CANCEL_REMOVE: "Cancel remove",
  makePlayerHost: ({ name }) => `Make ${name} host`,
  ELIMINATED: "You're out — stick around and heckle.",
  winner: ({ name }) => `${name} wins it. One more?`,
  WINNER_FALLBACK: "Winner!",
  ONE_MORE: "One more",
  WAITING_TO_NEW_GAME: "Waiting on the host to start one more…",
};

// Spanish placeholder (Story 7.1 ships the BACKBONE; the authored warm es voice + Spanish card faces are
// Stories 7.3/7.4). Mirroring English keeps `es` fully renderable today — the dictionary CONTRACT (Copy)
// guarantees every key exists, so selecting es never produces a missing string. Replaced key-by-key in 7.4.
const es: Copy = { ...en };

const DICTIONARIES: Record<Language, Copy> = { en, es };

/** Guarded so it never throws under SSR / test / PWA-precache contexts where localStorage is absent
 *  (mirrors socket.ts's hasLocalStorage). */
function hasLocalStorage(): boolean {
  return typeof localStorage !== "undefined";
}

/** Read the stored language, defaulting to English (first-run default; no locale auto-detect in v2). */
function loadLanguage(): Language {
  if (!hasLocalStorage()) return "en";
  try {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    return stored === "es" || stored === "en" ? stored : "en";
  } catch {
    return "en"; // access denied (private browsing / sandboxed) → degrade to the default.
  }
}

// The per-device language preference — a Svelte 5 `$state` rune so reads inside components are reactive.
// Seeded from localStorage at module init (English when absent/unavailable).
let language = $state<Language>(loadLanguage());

/** The current device language (reactive getter — read it in markup to re-render on change). */
export function getLanguage(): Language {
  return language;
}

/**
 * Set the device language: update the reactive store (re-renders every surface) AND persist to
 * localStorage (survives reload / re-join — Story 7.2 AC). No-op persist on storage access failure; the
 * in-memory choice still applies for the session. Sends NOTHING to the server (per-device only).
 */
export function setLanguage(next: Language): void {
  language = next;
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(LANGUAGE_KEY, next);
  } catch {
    // Storage denied / quota — the preference is a best-effort convenience; keep the in-memory choice.
  }
}

// The accessor `t`. Two overloads keep it type-safe AND ergonomic: a plain key takes no params; a
// parameterized key requires its exact param object (so `t("loser")` or `t("SWAP", {name})` are compile
// errors). Reads `language` LIVE on every call → reactive.
export function t(key: PlainKey): string;
export function t<K extends ParamKey>(key: K, params: Parameters<Copy[K]>[0]): string;
// The implementation signature is internal (callers see only the overloads above). `params` is typed
// loosely here so it is compatible with BOTH overloads (no-params plain keys + the various param shapes).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function t(key: keyof Copy, params?: any): string {
  const entry = DICTIONARIES[language][key];
  return typeof entry === "function" ? entry(params) : entry;
}
