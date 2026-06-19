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
    // MVP scope: no turn engine yet. The field MUST exist now per the contract, value-free.
    // The real last-player derivation lands in Story 2.6. Do NOT invent turn-order logic here.
    isLastPlayer: false,
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
  // not breach the constant-shape invariant. loserIds/winnerIds/justReceivedSwap are Epic 3 / 2.4
  // beats — no code sets them yet, so they are omitted entirely this story.
  if (round) {
    projection.currentTurnId = round.currentTurnId;
    projection.turnToken = round.turnToken;
  }

  return projection;
}

// Server half of the single-source-of-truth guarantee (Story 1.3 AC4), preserved for the contract
// fields the real body above does NOT yet construct. The body now structurally consumes most of
// ProjectedTableState/Player/Round/Card, so the standalone _state/_projection scaffolding was
// removed in 1.4 — but `loserIds`/`winnerIds`/`justReceivedSwap` are Epic 3 / 2.4 beats this story
// leaves unset, so without this binding a rename of any of them would NOT break the server
// typecheck. This `satisfies` literal exercises exactly those three (plus the nested Card it carries
// is already covered by `round.hands` reads above). Type-only — never executed, never serialized.
// Remove once a real producer (Epic 2/3 handlers) structurally sets these three fields.
const _beats = {
  loserIds: [""],
  winnerIds: [""],
  justReceivedSwap: false,
} satisfies Pick<ProjectedTableState, "loserIds" | "winnerIds" | "justReceivedSwap">;
void _beats;

// SSoT for the `Round` fields the body does NOT read. The projection consumes `round.revealed`,
// `round.hands`, `round.currentTurnId`, `round.turnToken` structurally — but NOT `startingPlayerId`,
// `acted`, or `deck`. Without this binding a rename of any of those three would PASS the server
// typecheck in production code (the test fixture's full `Round` literal masks the hole, but the SSoT
// guarantee must hold on the production half independent of any test). This exercises exactly those
// three so a contract rename breaks the typecheck here. Type-only — never executed, never serialized.
// Remove once a real producer (Epic 2/3 handlers) structurally consumes these fields.
// [Review 2026-06-19: restores rename-detection lost when the 1.3 _round scaffolding was trimmed.]
const _round = {
  startingPlayerId: "",
  acted: [""],
  deck: [{ rank: 1, suit: "♠" }],
} satisfies Pick<Round, "startingPlayerId" | "acted" | "deck">;
void _round;

// Card is consumed structurally by the projection (round.hands reads + you.hand/players[].hand
// assignments are typed `Card`), so renaming a Card field breaks the body's typecheck directly.
// This import-reference keeps the dependency explicit for the SSoT chain. Type-only.
const _card = { rank: 1, suit: "♠" } satisfies Card;
void _card;
