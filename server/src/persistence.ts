// persistence.ts — the ONE ctx.storage key "table" holding the durable summary blob; the summary
// write on phase transitions; the D2.1 reload-reconciliation coercion on wake.
// [Source: architecture.md#D2, #D2.1, #Integration-Points — one storage key]
//
// SCOPE (Story 1.6): the durable-summary write/load against the single "table" key, plus the D2.1
// reconcile seam. The DURABLE SUMMARY is the subset { code, phase, hostId, startingLives,
// players[{id,name,lives,isAlive,seatIndex}], phaseToken } — the in-flight `round` is MEMORY-ONLY and
// never persisted (it is null at create anyway). [Source: architecture.md D2 lines 346–355; spike AC2.]
import type { Phase, Player, TableState } from "@trash/shared";

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
};

/** Project a TableState down to its durable summary (drops `round` and `isConnected`). */
export function toSummary(state: TableState): DurableSummary {
  return {
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
}

/** Write the durable summary to the single "table" key. Called after a state transition. */
export async function persistSummary(storage: DurableObjectStorage, state: TableState): Promise<void> {
  await storage.put<DurableSummary>(TABLE_KEY, toSummary(state));
}

/** Read the durable summary, or undefined if this DO has never been claimed (no "table" key yet). */
export async function loadSummary(storage: DurableObjectStorage): Promise<DurableSummary | undefined> {
  return storage.get<DurableSummary>(TABLE_KEY);
}

// Live-round phases: a persisted phase in this set with a memory `round` of null means the DO woke
// after losing the in-flight round (eviction/crash) — D2.1 says coerce to the safe between-rounds
// surface before the first projection. [Source: architecture.md D2.1 lines 359–362.]
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
 * persisted summary; if the persisted phase is a live-round phase but the round is gone (always, since
 * round is never persisted), coerce phase → "roundResult" and bump phaseToken BEFORE the first
 * projection. The Host can then dealAgain. The reconstructed TableState always has `round: null`.
 *
 * Returns `{ state, coerced }` so the single source of the coercion DECISION is here (the caller never
 * re-derives "did the phase change?"): `onStart` re-persists the durable summary IFF `coerced === true`.
 *
 * NOTE: coercion CANNOT fire at create time — a freshly created Table is in "lobby" (not a live-round
 * phase) so no coercion happens (`coerced: false`); this seam fires on the 2.2/2.3 mid-round-restart
 * path and is exercised there. [Source: spike AC2/D2.1; architecture.md D2.1 359–363.]
 */
export function reconcileSummaryToState(summary: DurableSummary): ReconcileResult {
  const coerced = LIVE_ROUND_PHASES.has(summary.phase);
  const players: Player[] = summary.players.map((p) => ({ ...p, isConnected: false }));
  return {
    coerced,
    state: {
      code: summary.code,
      phase: coerced ? "roundResult" : summary.phase,
      hostId: summary.hostId,
      startingLives: summary.startingLives,
      players,
      round: null, // round is memory-only — never restored from the summary.
      phaseToken: coerced ? summary.phaseToken + 1 : summary.phaseToken,
    },
  };
}
