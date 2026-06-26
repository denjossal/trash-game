// persistence.ts — the ONE ctx.storage key "table" holding the durable summary blob; the summary
// write on phase transitions; the D2.1 reload-reconciliation coercion on wake.
// [Source: architecture.md#D2, #D2.1, #Integration-Points — one storage key]
//
// SCOPE (Story 1.6): the durable-summary write/load against the single "table" key, plus the D2.1
// reconcile seam. The DURABLE SUMMARY is the subset { code, phase, hostId, startingLives,
// players[{id,name,lives,isAlive,seatIndex}], phaseToken } — the in-flight `round` is MEMORY-ONLY and
// never persisted (it is null at create anyway). [Source: architecture.md D2 lines 346–355; spike AC2.]
import type { Phase, Player, Round, TableState } from "@trash/shared";

/** The single ctx.storage key (D2). One blob, never per-field keys. */
export const TABLE_KEY = "table";

/**
 * The persisted subset of TableState. EXCLUDES `round` (memory-only, lost on restart by design).
 * `players` is the durable Player subset — note `isConnected` is OMITTED: connection liveness is an
 * ephemeral socket fact, not durable, so a reloaded summary makes no claim about who is connected.
 * (project-state derives `isConnected` defensively; a hydrated TableState seeds it false until a live
 * connection re-asserts it — out of scope this story since createRoom always runs warm.)
 * [Source: architecture.md D2 lines 350–355 — durable summary field boundary.]
 */
export type DurablePlayer = Pick<Player, "id" | "name" | "lives" | "isAlive" | "seatIndex">;
export type DurableSummary = {
  code: string;
  phase: Phase;
  hostId: string;
  startingLives: number;
  players: DurablePlayer[];
  phaseToken: number;
  // BETWEEN-ROUND RESULT (Story 3.4) — durable so a DO reload at roundResult/gameOver still shows the
  // loser/winner + the post-deduction pips AND can still re-deal the correct Loser. Omit-when-absent (only
  // set while resolved). `nextStartingPlayerId` MUST be persisted too: a roundResult wake (or a coerced
  // live-round wake) loses the in-memory carrier otherwise, and the next dealAgain would seat the wrong
  // starter (FR-12 violation) or fall back to a possibly-eliminated hostId (dealRound asserts → plain
  // Error → unhandled). Persisting it keeps the durable summary self-sufficient for the re-deal.
  loserIds?: string[];
  winnerIds?: string[];
  nextStartingPlayerId?: string;
  // IN-FLIGHT ROUND (round-loss fix, 2026-06-26): the live `round` is now persisted so an active round
  // SURVIVES a Durable Object hibernation/eviction mid-pass. Previously memory-only — a DO that evicted
  // between turns woke with `round` gone and coerced `turns`→`roundResult`, silently killing the round
  // (the deployed-only "B can't swap" bug: wrangler dev rarely hibernates, the edge does). This stays
  // SERVER-ONLY: ctx.storage never crosses the wire, and the projection chokepoint (project-state.ts) is
  // unchanged, so SM-6 holds — a persisted hand is no more exposed than the in-memory one. Omit-when-
  // absent (only set while a round is live). [Source: architecture.md D2/D2.1 — reverses "round memory-only".]
  round?: Round;
};

/** Project a TableState down to its durable summary (drops `round` and `isConnected`). */
export function toSummary(state: TableState): DurableSummary {
  const summary: DurableSummary = {
    code: state.code,
    phase: state.phase,
    hostId: state.hostId,
    startingLives: state.startingLives,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      lives: p.lives,
      isAlive: p.isAlive,
      seatIndex: p.seatIndex,
    })),
    phaseToken: state.phaseToken,
  };
  // The between-round result (Story 3.4) — carried durably ONLY when set (omit-when-absent, mirroring
  // the projection). nextStartingPlayerId is persisted alongside so a roundResult wake can still re-deal
  // the correct Loser (it is value-free seating data, never a card).
  if (state.loserIds) summary.loserIds = state.loserIds;
  if (state.winnerIds) summary.winnerIds = state.winnerIds;
  if (state.nextStartingPlayerId) summary.nextStartingPlayerId = state.nextStartingPlayerId;
  // Persist the in-flight round when present (round-loss fix) so a mid-pass eviction can restore it
  // instead of coercing the round away. Null in lobby / between rounds — omit-when-absent.
  if (state.round) summary.round = state.round;
  return summary;
}

/** Write the durable summary to the single "table" key. Called after a state transition. */
export async function persistSummary(storage: DurableObjectStorage, state: TableState): Promise<void> {
  await storage.put<DurableSummary>(TABLE_KEY, toSummary(state));
}

/** Read the durable summary, or undefined if this DO has never been claimed (no "table" key yet). */
export async function loadSummary(storage: DurableObjectStorage): Promise<DurableSummary | undefined> {
  return storage.get<DurableSummary>(TABLE_KEY);
}

// Live-round phases: a persisted phase in this set whose `round` is ALSO missing means the DO woke after
// losing the in-flight round (a legacy summary, or a crash before the round was persisted) — coerce to
// the safe between-rounds surface before the first projection. With the round-loss fix the round is now
// persisted, so a normal mid-round wake restores it and does NOT coerce. [Source: architecture.md D2.1.]
const LIVE_ROUND_PHASES: ReadonlySet<Phase> = new Set<Phase>(["dealing", "turns", "allActed", "showdown"]);

/**
 * The result of a D2.1 reconcile: the rebuilt in-memory state plus whether a coercion actually fired.
 * `coerced` is the signal `onStart` uses to RE-PERSIST exactly once — so the bumped phaseToken lands in
 * the durable "table" key and survives a SECOND eviction (monotonicity across repeated restarts;
 * Story 2.2 AC-2.2.6). A benign lobby/between-rounds wake reports `coerced: false` and stays read-only.
 * [Source: deferred-work.md #61 — the re-persist gap closed in 2.2.]
 */
export type ReconcileResult = { state: TableState; coerced: boolean };

/**
 * D2.1 reload-reconciliation (REQUIRED seam). On DO wake, rebuild the in-memory TableState from the
 * persisted summary. The in-flight round is now persisted (round-loss fix), so a normal mid-round wake
 * RESTORES it and the game continues. ONLY when a live-round phase woke with the round genuinely missing
 * (legacy summary / crash before the round was persisted) do we coerce phase → "roundResult" and bump
 * phaseToken BEFORE the first projection, so the Host can dealAgain.
 *
 * Returns `{ state, coerced }` so the single source of the coercion DECISION is here (the caller never
 * re-derives "did the phase change?"): `onStart` re-persists the durable summary IFF `coerced === true`.
 *
 * NOTE: coercion CANNOT fire at create time — a freshly created Table is in "lobby" (not a live-round
 * phase) so no coercion happens (`coerced: false`); this seam fires on the 2.2/2.3 mid-round-restart
 * path and is exercised there. [Source: spike AC2/D2.1; architecture.md D2.1 359–363.]
 */
export function reconcileSummaryToState(summary: DurableSummary): ReconcileResult {
  // Coerce ONLY when a live-round phase woke WITHOUT its round (the round-loss fix persists the round, so
  // the normal mid-round wake now restores it and does NOT coerce). The fallback still fires for a legacy
  // summary written before this fix, or a crash between the phase-transition persist and a round persist
  // (e.g. mid-deal) — there the round really is gone, so coerce to the safe between-rounds surface.
  const liveRound = LIVE_ROUND_PHASES.has(summary.phase);
  const coerced = liveRound && summary.round === undefined;
  const players: Player[] = summary.players.map((p) => ({ ...p, isConnected: false }));
  const state: TableState = {
    code: summary.code,
    phase: coerced ? "roundResult" : summary.phase,
    hostId: summary.hostId,
    startingLives: summary.startingLives,
    players,
    // Restore the persisted in-flight round (round-loss fix). Absent → null (lobby/between-rounds, or a
    // coerced wake where the round was genuinely lost).
    round: summary.round ?? null,
    phaseToken: coerced ? summary.phaseToken + 1 : summary.phaseToken,
  };
  // Restore the between-round result (Story 3.4) when it was persisted (a roundResult/gameOver wake) so
  // the surface still shows the pips + loser/winner AND the Host can still re-deal the correct Loser after
  // a reload. nextStartingPlayerId is restored alongside so handleDealAgain seats the resolved Loser
  // (FR-12) on the recovery path rather than falling back to hostId.
  if (summary.loserIds) state.loserIds = summary.loserIds;
  if (summary.winnerIds) state.winnerIds = summary.winnerIds;
  if (summary.nextStartingPlayerId) state.nextStartingPlayerId = summary.nextStartingPlayerId;
  return { coerced, state };
}
