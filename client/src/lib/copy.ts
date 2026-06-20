// copy.ts — the shared microcopy / voice primitives (Story 1.9b, UX-DR16).
//
// The EXPERIENCE.md "Voice and Tone" microcopy table as the single source of truth so every surface
// (1.10 Home/Lobby, Epic 2 turns, Epic 3 showdown/loser copy) inherits the warm voice instead of
// re-inventing strings. "Voice" here = microcopy/tone, NOT audio/speech.
//
// Voice: warm, playful, plainspoken, inclusive — never "high-stakes", never "underground", never mean.
// The "Do" column ships; the "Don't" column is banned (see Button-less surfaces / tests).
// Names use the Player's entered display name; short, complete sentences; one idea per line; no jargon.
// [Source: EXPERIENCE.md "Voice and Tone" lines 39-58; DESIGN.md Brand & Style line 115;
//  epics.md#Story-1.9b line 432 + decision #5 (cross-epic voice thread, peaks at Epic 3 loser copy).]
//
// Client-only module (architecture.md#Client-boundary — client/src/lib for client-only logic).

/**
 * The PWA manifest description — the corrected WARM copy (the generated "high-stakes underground"
 * line is REJECTED). The manifest itself lives in vite.config.ts (build-time config can't import an
 * app module cleanly), so this constant is the canonical home and the config mirrors this one literal.
 * [Source: imports/manifest.json line 4; EXPERIENCE.md line 41.]
 */
export const MANIFEST_DESCRIPTION =
  "A party card game for friends and family at the same table — your phone is the dealer.";

// --- App-frame strings (not in the voice table; the brand name + the cold-open/connecting state) ---

/** The app / brand name. */
export const APP_NAME = "Trash";

/** Cold open — no tableState received yet (EXPERIENCE.md State Patterns "loading = no tableState"). */
export const CONNECTING = "Connecting…";

// --- Voice table (EXPERIENCE.md lines 43-56) — the "Do" column, verbatim. ---
// Each export is annotated with the story that first renders it, so the not-yet-consumed ones do
// not read as dead code. Only Home (APP_NAME/CONNECTING) and Eliminated (ELIMINATED) render today.

/** Home actions (Story 1.10, UX-DR3). */
export const START_TABLE = "Start a table";
export const JOIN_TABLE = "Join a table";

/** Lobby conductor-bar primary action (Story 1.10 shell; the deal INTENT is Epic 2). */
export const DEAL = "Deal";

/** Room code line (Story 1.10). `code` is the 4-letter Room Code. */
export const roomCode = (code: string): string => `Your table code: ${code} — read it out.`;

/** Waiting for the Host to deal (Story 1.10 Lobby / Epic 2 Waiting). `host` is the Host's name. */
export const waitingForHost = (host: string): string =>
  `Hang tight — ${host} deals when everyone's in.`;

/** Your turn prompt (Epic 2, Story 2.4). */
export const YOUR_TURN = "Your turn. Swap it or keep it?";

/** Swap / Keep button labels (Epic 2, Story 2.4) — the two-button hero. */
export const SWAP = "SWAP";
export const KEEP = "KEEP";

/** Peek hint (Epic 2, Story 2.5) — press-and-hold to peek your own card. */
export const PEEK_HINT = "Press and hold to peek.";

/** Showdown loser copy (Epic 3, Story 3.3) — the highest-stakes voice moment; teases, never punishes. */
export const loser = (name: string): string => `Ooof — lowest card. That's a life, ${name}.`;

/** All-tied case (Epic 3, Story 3.3). */
export const TIE = "Tie for lowest — everybody drops a life!";

/** Eliminated (Epic 3, Story 3.5) — also the surface shown today (Eliminated.svelte stub). */
export const ELIMINATED = "You're out — stick around and heckle.";

/** Winner (Epic 3, Story 3.6). `name` is the winning Player's name. */
export const winner = (name: string): string => `${name} wins it. One more?`;

/** Bad / expired Room Code (Story 1.10 Home). */
export const BAD_CODE = "No table with that code — check the letters?";

/** Table is full or the game already started (Story 1.10 Home) — the code is right, the table just
 *  can't take a join now. Warm + retryable (try another table); never leaks the raw server reason. */
export const TABLE_BUSY = "That table's full or already playing — try another?";
