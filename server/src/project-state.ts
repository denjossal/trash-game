// projectStateFor(state, playerId) — the SOLE producer of a client-bound tableState payload.
// [Source: architecture.md#D3, #Architectural-Boundaries — the privacy chokepoint (pure projector)]
//
// SCOPE (Story 1.3): typed seam only. The signature consumes the @trash/shared wire contract
// (TableState in, ProjectedTableState out) so a contract change breaks this package's typecheck —
// this is the server half of the single-source-of-truth guarantee (Story 1.3 AC4). The pure
// projection body and the SM-6 negative-assertion privacy test are authored in Story 1.4.
// Others' hands are omitted until round.revealed.
import type { Card, Player, ProjectedTableState, Round, TableState } from "@trash/shared";

export function projectStateFor(state: TableState, playerId: string): ProjectedTableState {
  // Story 1.4 implements the pure projection. Until then this seam is unreachable at runtime;
  // the parameters are referenced here so the typed signature stays honest (and lint-clean).
  throw new Error(
    `projectStateFor is not implemented until Story 1.4 (table ${state.code}, player ${playerId})`,
  );
}

// Server half of the single-source-of-truth guarantee (Story 1.3 AC4). A bare `: ProjectedTableState`
// return annotation is NOT enough — a function that only throws never constructs the type, so it
// imposes no structural obligation. This `satisfies` binding exercises EVERY field of the contract —
// including the OPTIONAL ones and every nested type (Player, Round, Card) — so that adding, renaming,
// or removing ANY field of TableState/ProjectedTableState/Player/Round/Card breaks the server
// typecheck. (A `satisfies` literal that omits optional fields cannot catch their rename, so the
// optionals are populated on purpose.) Type-only — never executed, never serialized. Remove once
// real producers (projectStateFor body, handlers) structurally consume the full contract in Story 1.4+.
const _card = { rank: 1, suit: "♠" } satisfies Card;
const _round = {
  startingPlayerId: "",
  currentTurnId: "",
  turnToken: 0,
  hands: { "": _card },
  deck: [_card],
  acted: [""],
  revealed: false,
} satisfies Round;
const _player = {
  id: "",
  name: "",
  lives: 0,
  isAlive: false,
  isConnected: false,
  seatIndex: 0,
} satisfies Player;
const _state = {
  code: "",
  phase: "lobby",
  hostId: "",
  startingLives: 0,
  players: [_player],
  round: _round,
  phaseToken: 0,
} satisfies TableState;
const _projection = {
  code: "",
  phase: "lobby",
  hostId: "",
  startingLives: 0,
  you: {
    playerId: "",
    isHost: false,
    isAlive: false,
    isConnected: false,
    isLastPlayer: false,
    hand: _card,
  },
  players: [{ id: "", name: "", lives: 0, isAlive: false, isConnected: false, seatIndex: 0, hand: _card }],
  currentTurnId: "",
  turnToken: 0,
  phaseToken: 0,
  revealed: false,
  loserIds: [""],
  winnerIds: [""],
  justReceivedSwap: false,
} satisfies ProjectedTableState;

// Reference them so noUnusedLocals is satisfied without exporting test scaffolding.
void _state;
void _projection;
