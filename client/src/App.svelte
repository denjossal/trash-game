<script lang="ts">
  // App.svelte — the render-from-state surface ROUTER (Story 1.9a, UX-DR2).
  //
  // It renders EXACTLY ONE surface as a pure function of the current ProjectedTableState (or none yet)
  // via routeFromState — no persistent navigation, no router library, no client-held "current screen"
  // that can drift from state. On any reconnect/resume the device re-derives its surface from state
  // alone (architecture.md "enshrined experience invariant").
  //
  // SCOPE: the router renders EXACTLY ONE surface as a pure function of the live tableState store.
  // Story 1.9a built this skeleton with a local null placeholder; Story 1.10 drops in the real live
  // store (table-store.svelte.ts, fed by socket.ts's receive loop) WITHOUT touching the routing below —
  // exactly the seam the 1.9a router was built for. `state` now reads the read-only store reactively.
  import { routeFromState } from "./route-from-state";
  import { readTableState } from "./lib/table-store.svelte";
  import "./wire-anchor"; // side-effect import — keeps the Story 1.3 client wire-contract typecheck gate live.

  import Home from "./surfaces/Home.svelte";
  import Lobby from "./surfaces/Lobby.svelte";
  import YourTurn from "./surfaces/YourTurn.svelte";
  import Waiting from "./surfaces/Waiting.svelte";
  import Showdown from "./surfaces/Showdown.svelte";
  import RoundResult from "./surfaces/RoundResult.svelte";
  import Eliminated from "./surfaces/Eliminated.svelte";
  import Winner from "./surfaces/Winner.svelte";

  // The live read-only store (module-level $state in table-store.svelte.ts). Reading it inside a
  // $derived makes the routed surface re-evaluate whenever a new tableState lands on the socket.
  const state = $derived(readTableState());
  const surface = $derived(routeFromState(state));
</script>

{#if surface === "home"}
  <Home />
{:else if surface === "lobby"}
  <Lobby state={state!} />
{:else if surface === "yourTurn"}
  <YourTurn state={state!} />
{:else if surface === "waiting"}
  <Waiting state={state!} />
{:else if surface === "showdown"}
  <Showdown state={state!} />
{:else if surface === "roundResult"}
  <RoundResult state={state!} />
{:else if surface === "eliminated"}
  <Eliminated state={state!} />
{:else if surface === "winner"}
  <Winner state={state!} />
{:else}
  <!-- Defensive fallback: routeFromState is exhaustively typed over Surface, so this is
       unreachable today. It exists so a future Surface added to the union but missed here
       (the router + this chain are two hand-synced lists) fails to a safe neutral frame
       instead of rendering nothing. -->
  <Home />
{/if}
