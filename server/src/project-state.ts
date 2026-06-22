// projectStateFor(state, playerId) — the SOLE producer of a client-bound tableState payload.
// [Source: architecture.md#D3, #Architectural-Boundaries — the privacy chokepoint (pure projector)]
//
// SM-6 (the one hard integrity rule): a player's secret Card is physically impossible to send to
// anyone else's device before Showdown. This is enforced HERE — `projectStateFor` is the single
// chokepoint (AR-4) — and pinned by the standing negative-assertion test in project-state.test.ts.
//
// PURE TRANSFORM: (TableState, playerId) -> ProjectedTableState. No clock/RNG/crypto/fetch/storage/
// ws/this/console; no .send/.broadcast (the repo-wide egress ban applies to this file — only
// push-state.ts is exempt). The function neither sends nor mutates; pushState wraps the returned
// payload in a { type: "tableState", payload } envelope (Story 1.6). [Source: architecture.md
// lines 104–108, 512–557; eslint.config.js GATE 1.]
import type { Card, ProjectedTableState, Round, TableState } from "@trash/shared";
import { isLastPlayer } from "./rules/engine.js";

export function projectStateFor(state: TableState, playerId: string): ProjectedTableState {
  const round = state.round;
  // The single privacy switch (Decision #3): while `revealed` is false every hand is hidden;
  // when true (reachable only in Epic 3 / Showdown) the SAME function exposes every seat's hand.
  // Epic 3 EXTENDS this branch — it does not weaken a too-narrow rule. AC1 pins the false case;
  // AC2 pins that the true case lives in this same function.
  const revealed = round?.revealed ?? false;

  // `you` — the caller's own seat. Its `hand` is the ONLY pre-reveal exposure of a hidden card,
  // and only the CALLER's own. Never duplicated into players[] (avoids a you↔players[] double
  // source of truth and keeps the constant-shape invariant clean). [Source: deferred-work.md —
  // 1.3 review privacy clarification.]
  const self = state.players.find((p) => p.id === playerId);
  const you: ProjectedTableState["you"] = {
    playerId,
    isHost: state.hostId === playerId,
    isAlive: self?.isAlive ?? false,
    isConnected: self?.isConnected ?? false,
    // The REAL last-player derivation (Story 2.6, AC-2.6.1/.5): TRUE only for the single active alive
    // seat whose right-hand neighbor is the round's startingPlayerId. VALUE-FREE — the shared
    // `isLastPlayer` engine helper reads startingPlayerId + seatIndex only, NEVER a card (SM-6); the
    // SAME helper gates the server-side draw authority (handlers.handleDraw) so the two cannot drift.
    // FALSE when there is no round (lobby / between rounds) — only the Last Player's device shows the
    // "Draw from deck" button. [Source: rules/engine.isLastPlayer; epics.md#Story 2.6.]
    isLastPlayer: round ? isLastPlayer(round, state.players, playerId) : false,
  };
  // Own card: present only when a round exists. Omit the key when absent — never assign undefined,
  // so it is genuinely absent on the wire. [Source: architecture.md lines 547–548.]
  if (round) {
    const ownCard = round.hands[playerId];
    if (ownCard) you.hand = ownCard;
  }

  // players[] — every seat, original order. `hand` is OMITTED for ALL seats (including self) while
  // hidden, and included for EVERY seat once revealed. The key-set is therefore identical across
  // seats for a given `revealed` value — no value-dependent shape/length branch (the AC4 invariant).
  const players: ProjectedTableState["players"] = state.players.map((p) => {
    const entry: ProjectedTableState["players"][number] = {
      id: p.id,
      name: p.name,
      lives: p.lives,
      isAlive: p.isAlive,
      isConnected: p.isConnected,
      seatIndex: p.seatIndex,
    };
    // OMIT the key for a hand-less seat (AC-3.4.8): after the Story-3.4 resolution an eliminated seat
    // stays in players[] while revealed===true, but dealRound never dealt it a card — so round.hands has
    // no entry. Assigning `round.hands[p.id]` directly would set `hand = undefined` (a constant-shape
    // breach pre-serialization). Read-then-guard so the key is genuinely absent for such a seat.
    if (revealed && round) {
      const h = round.hands[p.id];
      if (h) entry.hand = h;
    }
    return entry;
  });

  const projection: ProjectedTableState = {
    code: state.code,
    phase: state.phase,
    hostId: state.hostId,
    startingLives: state.startingLives,
    you,
    players,
    phaseToken: state.phaseToken,
    // `revealed` is a meaningful boolean — ALWAYS present, never omitted. [Source: types.ts.]
    revealed,
  };
  // loserIds/winnerIds — the between-round result (Story 3.4), set on TableState by the resolution
  // inside handleReveal and live at roundResult/gameOver. Value-free (server-computed eliminations /
  // win-check), so projecting them does not breach SM-6. Omit-when-absent: emit the key ONLY when the
  // producer set it (a pre-reveal / bare-showdown / fresh state has neither). [Source: types.ts; AC-3.4.2.]
  if (state.loserIds) projection.loserIds = state.loserIds;
  if (state.winnerIds) projection.winnerIds = state.winnerIds;

  // currentTurnId/turnToken exist only while a round does — omit (optional) otherwise. Their
  // presence depends on round existence (a PHASE fact), never on a hidden card value, so this does
  // not breach the constant-shape invariant.
  if (round) {
    projection.currentTurnId = round.currentTurnId;
    projection.turnToken = round.turnToken;
    // justReceivedSwap (Story 2.4, AR-7): the VALUE-FREE squirm signal — TRUE only on the device of the
    // player who just received a swapped Card (round.lastSwapReceiverId, a memory-only transient set by
    // applySwap). It carries NO card data: the receiver still sees only its own hand (above), so this
    // re-passes SM-6. Omit-when-absent — set the key ONLY when true; a non-receiver / post-keep / fresh
    // deal projection has no `justReceivedSwap` key at all. [Source: architecture.md line 374; types.ts.]
    if (round.lastSwapReceiverId === playerId) {
      projection.justReceivedSwap = true;
    }
  }

  return projection;
}

// Story 3.4 removed the `loserIds`/`winnerIds` SSoT scaffold: the body now STRUCTURALLY sets both
// (projection.loserIds = state.loserIds / projection.winnerIds = state.winnerIds above), so a rename of
// either ProjectedTableState field breaks the server typecheck directly — the real producer replaced
// the type-only binding.

// SSoT for the `Round` fields the body does NOT read. The projection now consumes `round.revealed`,
// `round.hands`, `round.currentTurnId`, `round.turnToken` AND `round.startingPlayerId` structurally
// (Story 2.6 — the isLastPlayer derivation passes `round` into the engine helper, which reads
// `startingPlayerId`), so that field no longer needs scaffolding — a rename would break the helper's
// typecheck. The body still does NOT read `acted` or `deck` directly (the handlers do), so without this
// binding a rename of either would PASS the server typecheck in production code (the test fixture's full
// `Round` literal masks the hole, but the SSoT guarantee must hold on the production half independent of
// any test). This exercises exactly those two. Type-only — never executed, never serialized.
// Remove once a real producer (Epic 3 handlers) structurally consumes these fields.
const _round = {
  acted: [""],
  deck: [{ rank: 1, suit: "♠" }],
} satisfies Pick<Round, "acted" | "deck">;
void _round;

// Card is consumed structurally by the projection (round.hands reads + you.hand/players[].hand
// assignments are typed `Card`), so renaming a Card field breaks the body's typecheck directly.
// This import-reference keeps the dependency explicit for the SSoT chain. Type-only.
const _card = { rank: 1, suit: "♠" } satisfies Card;
void _card;
