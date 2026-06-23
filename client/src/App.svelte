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
  import ConductorBar from "./components/ConductorBar.svelte";

  // The live read-only store (module-level $state in table-store.svelte.ts). Reading it inside a
  // $derived makes the routed surface re-evaluate whenever a new tableState lands on the socket.
  const state = $derived(readTableState());
  const surface = $derived(routeFromState(state));

  // The Host conductor bar (Story 4.1, UX-DR14) mounts as an OVERLAY on top of the routed surface — it is
  // NOT a routed Surface (route-from-state.ts keeps HostControls deliberately absent). It is shown only on
  // the NON-TURN surfaces and NEVER on Your Turn / Home (AC-4.1.2). The bar itself is Host-only and shows a
  // phase-appropriate primary only at lobby/allActed/roundResult, so this gate just excludes the surfaces it
  // must never appear on.
  //
  // `eliminated` IS included (AR-5): an eliminated Host REMAINS the Host and keeps conducting Deal/Reveal/
  // Re-deal — a Host knocked out mid-game (e.g. at roundResult with ≥2 others alive) routes to the Eliminated
  // spectator surface but still needs to drive the next Re-deal, or the table is stranded
  // (architecture.md:335-338). The bar is Host-only, so an eliminated NON-Host spectator still sees nothing.
  // At `gameOver` the bar shows no primary (gameOver isn't in the phase→primary map) and the Eliminated
  // surface carries its own inline "one more?" (Story 3.6) — so there is never a double action.
  // `winner` is excluded: the winner is alive and the Winner surface owns the gameOver "one more?".
  const showConductorBar = $derived(
    state !== null &&
      (surface === "lobby" ||
        surface === "waiting" ||
        surface === "showdown" ||
        surface === "roundResult" ||
        surface === "eliminated"),
  );
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

{#if showConductorBar}
  <!-- Host conductor bar overlay — layered above the routed surface, never on Your Turn / Home. The bar is
       Host-only and self-hides when no phase primary applies (Story 4.1). -->
  <ConductorBar state={state!} />
{/if}
