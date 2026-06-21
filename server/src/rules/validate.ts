// validate.ts — the two-scope monotonic guard primitive (Story 2.2). The WRITE chokepoint counterpart
// to Story 1.4's READ chokepoint (projectStateFor): every guarded intent flows guard → mutate → bump →
// persist. Built WHOLE here as ONE mechanism (Decision #1 / AR-6) and CONSUMED by later gameplay
// handlers (deal 2.3, swap/keep/draw 2.4/2.6, revealAll 3.2, host-controls 4.x) — none of which exist
// yet. This file ships the primitive + its accepted-path increments, unit-tested against both scopes.
// [Source: architecture.md#D4 391–403; epics.md#Story 2.2 513–543.]
//
// PURE (GATE 2 applies — eslint.config.js server/src/rules/**): no Date/Math.random/crypto/fetch/
// storage/ws/caches/console/this/dynamic-import(); imports ONLY @trash/shared or same-tree ./. The
// guard's decision is INTEGER EQUALITY ONLY — client timestamps are NEVER consulted (AC-2.2.2). The
// functions touch no card/hand data, so a non-owner's card is unreachable here by construction (SM-6).
//
// VALIDATE.TS SCOPE (Story 2.2, user-confirmed): this file is the home for the broader Epic 2 input
// validation obligation — range/integer/token/alphabet checks for every numeric/string Intent field
// (`rank` 1..13, `hostSetLives.lives` MIN/MAX, bounded `code`/tokens). That FIELD validation is NOT
// implemented here; it attaches to the story that introduces each intent's handler (deal 2.3, swap 2.4,
// host-controls 4.x), growing this file as those handlers land. Story 2.2 ships the GUARD PRIMITIVE
// ONLY. [Source: deferred-work.md #14; epic-1-retro-2026-06-20.md line 53; story Dev Notes.]
import { IntentError } from "@trash/shared";
import type { Round, TableState } from "@trash/shared";

/**
 * The one mechanism: compare the token an intent carries against the server's expected value; on a
 * mismatch (stale / double-tap / replay / race) throw the typed reason WITHOUT mutating anything. The
 * two public checks below are thin wrappers that differ ONLY in which token they read and which reason
 * they raise — this is the single compare-and-reject shape Decision #1 mandates be built once.
 */
function requireToken(serverToken: number, intentToken: number, reason: "stale-turn" | "stale-phase"): void {
  if (serverToken !== intentToken) {
    throw new IntentError(reason);
  }
}

/**
 * Turn-scoped guard (AC-2.2.1/.2): guards `swap`/`keep`/`drawFromDeck`. The intent carries the
 * `turnToken` it believes current; a mismatch against `round.turnToken` → `stale-turn`. Covers
 * turn-race + replay + double-tap + ordering on the turn axis. Reads only the integer — no clock.
 */
export function checkTurnToken(round: Round, intentToken: number): void {
  requireToken(round.turnToken, intentToken, "stale-turn");
}

/**
 * Phase-scoped guard (AC-2.2.1/.2): guards Host-conducted transitions (`deal`/`revealAll`/`dealAgain`/
 * `newGame`/host-controls). A mismatch against `state.phaseToken` → `stale-phase`. (The extra
 * `revealAll` guard requiring `phase === "allActed"` is Story 3.2's concern; this primitive ships only
 * the token compare.) `joinRoom` lobby gating is a phase-check in handlers — it carries NO token here.
 */
export function checkPhaseToken(state: TableState, intentToken: number): void {
  requireToken(state.phaseToken, intentToken, "stale-phase");
}

/**
 * Accepted-path increments (AC-2.2.4). After a valid intent is applied, the corresponding token is
 * bumped monotonically so the next stale copy of that intent mismatches (closing the loop with the
 * checks above). One reusable advance per scope so every future handler increments identically —
 * never a scattered `+1`. Pure mutation of the passed-in object (no this/IO — GATE 2 safe).
 */
export function bumpTurnToken(round: Round): void {
  round.turnToken += 1;
}

export function bumpPhaseToken(state: TableState): void {
  state.phaseToken += 1;
}
