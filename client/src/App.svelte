<script lang="ts">
  // App.svelte — the render-from-state surface ROUTER (Story 1.9a, UX-DR2).
  //
  // It renders EXACTLY ONE surface as a pure function of the current ProjectedTableState (or none yet)
  // via routeFromState — no persistent navigation, no router library, no client-held "current screen"
  // that can drift from state. On any reconnect/resume the device re-derives its surface from state
  // alone (architecture.md "enshrined experience invariant").
  //
  // SCOPE (Story 1.9a): the router SKELETON + surface stubs. The live data pipe — socket.ts's receive
  // loop feeding a read-only tableState store — is Story 1.10, when the real Home/Lobby surfaces exist
  // to drive create/join. So `state` is a local null here; routing is a pure function of whatever
  // state is injected, which is exactly what lets 1.10 drop the live store in without touching routing.
  import type { ProjectedTableState } from "@trash/shared";
  import { routeFromState } from "./route-from-state";
  import "./wire-anchor"; // side-effect import — keeps the Story 1.3 client wire-contract typecheck gate live.

  import Home from "./surfaces/Home.svelte";
  import Lobby from "./surfaces/Lobby.svelte";
  import YourTurn from "./surfaces/YourTurn.svelte";
  import Waiting from "./surfaces/Waiting.svelte";
  import Showdown from "./surfaces/Showdown.svelte";
  import RoundResult from "./surfaces/RoundResult.svelte";
  import Eliminated from "./surfaces/Eliminated.svelte";
  import Winner from "./surfaces/Winner.svelte";

  // Story 1.10 replaces this with the read-only store fed by socket.ts; the router below is unchanged.
  const state: ProjectedTableState | null = $state(null);

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
