<script lang="ts">
  // SCOPE (Story 1.3): still a scaffold surface — App.svelte becomes the render-from-state
  // surface router (ProjectedTableState -> exactly one surface) in Story 1.9a. No tokens/surfaces yet.
  //
  // Client half of the single-source-of-truth guarantee (Story 1.3 AC4): a single `Phase` literal
  // only catches changes to that one literal. These `satisfies` bindings exercise EVERY field
  // (incl. optionals) of the contract types the CLIENT touches over the wire — ProjectedTableState
  // (received), Intent (sent), and ServerEvent (received, which transitively covers ErrorReason) —
  // so adding, renaming, or removing ANY field of those breaks the client typecheck (svelte-check).
  // TableState/Round are server-only and intentionally NOT anchored here. Type-only scaffold values —
  // replaced by real render-from-state in 1.9a.
  import type { Card, Intent, ProjectedTableState, ServerEvent } from "@trash/shared";

  const _card = { rank: 1, suit: "♠" } satisfies Card;

  const projection = {
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
  void _intent;
  void _event;
</script>

<main>
  <h1>Trash</h1>
  <p>Scaffold ready (phase {projection.phase}).</p>
</main>
