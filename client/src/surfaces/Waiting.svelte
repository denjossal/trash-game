<script lang="ts">
  // Waiting.svelte — the calmest surface (Story 2.4, FR-6, UX-DR6, NFR-9). Routed during a live round
  // when it is NOT your turn (route-from-state.ts: phase "turns"/"dealing"/"allActed", currentTurnId !==
  // you). Shows ONLY the active Player's name in a STATIC frame (no pulse, no motion) plus YOUR OWN
  // Lives — never any Card value, nothing to scroll (UX-DR6 / NFR-9).
  //
  // No card is rendered here: the projection omits non-owner hands, and even the caller's own `you.hand`
  // is deliberately NOT shown on Waiting (the card belongs to the active surfaces / peek, Story 2.5).
  // The frame is the INERT border (--border-inert), explicitly NOT the active neon stroke, and there is
  // no pulse keyframe — the contrast with Your Turn's pulsing frame is the whole point.
  import type { ProjectedTableState } from "@trash/shared";
  import LivesPips from "../components/LivesPips.svelte";

  const { state }: { state: ProjectedTableState } = $props();

  // The active Player's name (whose turn it is). Falls back to a warm neutral if not yet resolvable.
  const activeName = $derived(state.players.find((p) => p.id === state.currentTurnId)?.name ?? "");
  // The caller's OWN seat — for their Lives pips (find self via you.playerId).
  const self = $derived(state.players.find((p) => p.id === state.you.playerId));
</script>

<main class="surface">
  <h1 class="active">{activeName ? `${activeName}’s turn.` : "Hang tight."}</h1>

  {#if self}
    <div class="lives" aria-label="Your lives">
      <LivesPips lives={self.lives} startingLives={state.startingLives} />
    </div>
  {/if}
</main>

<style>
  /* The calmest surface: centered, INERT frame (NOT the active neon stroke), no motion. */
  .surface {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100dvh;
    padding: var(--space-container-padding);
    box-sizing: border-box;
    gap: var(--space-stack-md);
    text-align: center;
    border: var(--border-inert); /* static, inert — deliberately NOT --stroke-active, NO pulse. */
  }
  .active {
    margin: 0;
    font-family: var(--font-family-display);
    font-size: var(--type-headline-lg-size);
    font-weight: var(--type-headline-lg-weight);
    line-height: var(--type-headline-lg-line);
    color: var(--color-on-surface);
  }
  .lives {
    display: flex;
    justify-content: center;
  }
</style>
