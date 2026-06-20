// route-from-state.ts — the render-from-state router (Story 1.9a, UX-DR2; AC-1.9a.4/.5).
//
// A PURE function: same ProjectedTableState in => same Surface out. No DOM, no globals, no
// import.meta, no Date.now — input -> output only, so it is unit-testable without mounting Svelte
// (AC-1.9a.7) and so every device re-derives its surface from state alone on any reconnect/resume
// (architecture.md "enshrined experience invariant"). App.svelte renders exactly the surface this
// returns; there is NO persistent navigation, no route history, no client-held "current screen".
import type { ProjectedTableState } from "@trash/shared";

/**
 * The routed surfaces. HostControls is deliberately ABSENT: it is an OVERLAY invoked on top of
 * Lobby/Waiting/RoundResult (never from YourTurn) — a stacking concern owned by 1.10/Epic 4, not a
 * surface this router selects. [Source: EXPERIENCE.md IA; story Dev Notes "Routing table".]
 */
export type Surface =
  | "home"
  | "lobby"
  | "yourTurn"
  | "waiting"
  | "showdown"
  | "roundResult"
  | "eliminated"
  | "winner";

/**
 * Select the single surface for the current state. Branch order matters — first match wins; the
 * table is the story Dev Notes "Routing table".
 *
 * Precedence decisions worth the reviewer's eye (flagged for Epic 3 / Story 1.10 confirmation,
 * Decision #6 play-confirmed):
 *   - `gameOver` and `showdown` are evaluated BEFORE the generic "not alive => eliminated" rule, so
 *     a knocked-out player still sees the winner screen and still WATCHES the showdown flip
 *     (EXPERIENCE.md: an eliminated player "keeps seeing Waiting/Showdown").
 *   - Otherwise an eliminated player is a spectator: `!isAlive` overrides the turns/waiting/roundResult
 *     surfaces.
 */
export function routeFromState(state: ProjectedTableState | null): Surface {
  // No tableState received yet => Home/connecting. "Loading" IS "no state yet" (AC-1.9a.5).
  if (state === null) return "home";

  const { phase, you } = state;

  // Joined, pre-Deal.
  if (phase === "lobby") return "lobby";

  // Terminal: a winner exists. The winner sees Winner; everyone else sees the spectator/end surface.
  if (phase === "gameOver") {
    return state.winnerIds?.includes(you.playerId) ? "winner" : "eliminated";
  }

  // The loud beat: the simultaneous reveal. Shown to EVERY connected device — including an
  // eliminated spectator — so this wins over the generic elimination rule below.
  if (phase === "showdown" || state.revealed) return "showdown";

  // From here down, a knocked-out player is a sideline spectator on the calm surfaces.
  if (!you.isAlive) return "eliminated";

  // Between rounds: lives updated, awaiting the Host's re-deal.
  if (phase === "roundResult") return "roundResult";

  // Live round (dealing / turns / allActed): your turn vs. waiting. `allActed` is the real phase
  // after the one pass completes (cards final-but-hidden, awaiting reveal) — nobody's turn => waiting.
  if (you.playerId === state.currentTurnId) return "yourTurn";
  return "waiting";
}
