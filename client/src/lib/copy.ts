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

/** Draw-from-deck label (Epic 2, Story 2.6, FR-7, UX-DR5) — the Last Player's subordinate Secondary
 *  third choice, shown ONLY on that one seat. Sentence case (not the shouty SWAP/KEEP primaries) to read
 *  as visually subordinate to the two-button hero. */
export const DRAW = "Draw from deck";

/** Squirm signal (Epic 2, Story 2.4) — the value-free beat shown to a Player who just received a
 *  swapped Card. Warm + playful, never mean; carries NO card value (the squirm is the social moment). */
export const JUST_SWAPPED = "Someone swapped with you!";

/** Showdown loser copy (Epic 3, Story 3.3) — the highest-stakes voice moment; teases, never punishes. */
export const loser = (name: string): string => `Ooof — lowest card. That's a life, ${name}.`;

/** All-tied case (Epic 3, Story 3.3). */
export const TIE = "Tie for lowest — everybody drops a life!";

/** Round-over heading on the between-rounds RoundResult recovery surface (Epic 3, Story 3.4). */
export const ROUND_OVER = "Round over.";

/** Host Re-deal action on the revealed beat (Epic 3, Story 3.4) — one tap starts the next Round; the
 *  Loser of this round starts it (UX-DR10 / EXPERIENCE.md the previous-Loser-starts-next framing). */
export const RE_DEAL = "Deal the next round";

/** Non-Host waiting line on the revealed beat (Epic 3, Story 3.4) — others wait for the Host's Re-deal. */
export const WAITING_TO_REDEAL = "Waiting on the host to deal again…";

/** Conductor-bar Showdown primary (Story 4.1, FR-9/UX-DR14) — the Host's reveal action, shown only at the
 *  `allActed` phase. Warm + plainspoken (the loud beat is the payoff; the button just invites it). */
export const SHOWDOWN = "Show the cards";

/** Host controls affordance label + sheet heading (Story 4.1, UX-DR13/UX-DR14) — the ⚙ accessible name and
 *  the one-level overlay's heading. The three controls it holds (Lives, remove, reassign) are Story 4.2. */
export const HOST_CONTROLS = "Host controls";

// --- Host Controls sheet — the three FR-14 controls (Story 4.2, UX-DR13/UX-DR14). Short, glanceable,
//     warm; section labels read as plain headings, not jargon. Eyes-Up: no stats/log/dashboard wording. ---

/** Lives stepper section label inside the ⚙ sheet (Story 4.2, FR-14). */
export const LIVES = "Lives";

/** Roster section label inside the ⚙ sheet (Story 4.2, FR-14) — the remove-a-Player list. */
export const PLAYERS = "Players";

/** Remove-a-Player affordance label (Story 4.2, FR-14) — error-tinted, paired with a confirm step (never
 *  color alone; the label + the confirm prompt carry the meaning for SR / color-blind Players). */
export const REMOVE = "Remove";

/** The confirm prompt shown after tapping Remove (Story 4.2) — names the Player so it's unmistakable. */
export const confirmRemove = (name: string): string => `Remove ${name}?`;

/** Reassign-host section label inside the ⚙ sheet (Story 4.2, FR-14) — "hand off the conductor role". */
export const REASSIGN_HOST = "Make someone else host";

/** Per-row reassign action label (Story 4.2, FR-14) — pass the Host role to this Player. */
export const MAKE_HOST = "Make host";

/** Eliminated (Epic 3, Story 3.5) — also the surface shown today (Eliminated.svelte stub). */
export const ELIMINATED = "You're out — stick around and heckle.";

/** Winner (Epic 3, Story 3.6). `name` is the winning Player's name (co-winners on a shared win are joined
 *  into the one name slot — single-source voice, no separate plural string). */
export const winner = (name: string): string => `${name} wins it. One more?`;

/** Host's "one more?" action label on the Winner / Eliminated end-of-game surfaces (Story 3.6). The warm
 *  celebration sentence already carries the "One more?" question; this is the short button verb. */
export const ONE_MORE = "One more";

/** Non-Host waiting line on the Winner surface (Story 3.6) — the new-game analog of WAITING_TO_REDEAL. The
 *  re-deal wording ("deal again") is wrong for a NEW game on the same Table, so this is its own line. */
export const WAITING_TO_NEW_GAME = "Waiting on the host to start one more…";

/** Bad / expired Room Code (Story 1.10 Home). */
export const BAD_CODE = "No table with that code — check the letters?";

/** Table is full or the game already started (Story 1.10 Home) — the code is right, the table just
 *  can't take a join now. Warm + retryable (try another table); never leaks the raw server reason. */
export const TABLE_BUSY = "That table's full or already playing — try another?";
