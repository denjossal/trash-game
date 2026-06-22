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
    if (revealed && round) entry.hand = round.hands[p.id];
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
  // currentTurnId/turnToken exist only while a round does — omit (optional) otherwise. Their
  // presence depends on round existence (a PHASE fact), never on a hidden card value, so this does
  // not breach the constant-shape invariant. loserIds/winnerIds are Epic 3 beats — no code sets them
  // yet, so they are omitted entirely this story.
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

// Server half of the single-source-of-truth guarantee (Story 1.3 AC4), preserved for the contract
// fields the real body above does NOT yet construct. The body now structurally consumes most of
// ProjectedTableState/Player/Round/Card — including `justReceivedSwap` (Story 2.4, set above from
// round.lastSwapReceiverId), so that field is no longer scaffolded here. `loserIds`/`winnerIds` remain
// Epic 3 beats this story leaves unset, so without this binding a rename of either would NOT break the
// server typecheck. This `satisfies` literal exercises exactly those two. Type-only — never executed,
// never serialized. Remove once a real producer (Epic 3 handlers) structurally sets these two fields.
const _beats = {
  loserIds: [""],
  winnerIds: [""],
} satisfies Pick<ProjectedTableState, "loserIds" | "winnerIds">;
void _beats;

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
