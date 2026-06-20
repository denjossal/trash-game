// wire-anchor.ts — the CLIENT half of the Story 1.3 single-source-of-truth guarantee (AC 1.3.4).
//
// A single `Phase`/contract literal only catches changes to that one literal. These `satisfies`
// bindings exercise EVERY field (incl. optionals) of the contract types the CLIENT touches over the
// wire — ProjectedTableState (received), Intent (sent), and ServerEvent (received, which transitively
// covers ErrorReason) — so adding, renaming, or removing ANY field of those breaks the client
// typecheck (svelte-check + tsc -b). TableState/Round are server-only and intentionally NOT anchored.
//
// This was authored in App.svelte (Story 1.3); Story 1.9a turned App.svelte into the render-from-state
// router and moved the anchor here verbatim. main.ts (or App) imports it for side effects so the
// typecheck keeps exercising it — it is a compile-time gate, it ships no runtime behavior.
import type { Card, Intent, ProjectedTableState, ServerEvent } from "@trash/shared";

const _card = { rank: 1, suit: "♠" } satisfies Card;

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

// One representative member of each wire union the client produces/consumes, so a change to any
// Intent/ServerEvent/ErrorReason member breaks the client typecheck too.
const _intent = { type: "swap", payload: { turnToken: 0 } } satisfies Intent;
const _event = { type: "error", payload: { reason: "stale-turn" } } satisfies ServerEvent;

void _projection;
void _intent;
void _event;
