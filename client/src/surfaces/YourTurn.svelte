<script lang="ts">
  // SCOPE (Story 1.9a): foundation STUB. Routed during a live round when it is YOUR turn.
  // The real Your Turn — the two-button SWAP/KEEP hero, press-and-hold peek, neon active frame,
  // Last-Player draw option, debounced taps — is Stories 1.9b/2.4/2.5/2.6.
  import type { ProjectedTableState } from "@trash/shared";
  // Typed so callers must pass the projected state (1.9b/Epic 2 read it). The stub renders no data yet;
  // the top-level read below is intentional (no reactivity needed for a static stub).
  const { state }: { state: ProjectedTableState } = $props();
  // svelte-ignore state_referenced_locally
  void state;
</script>

<main class="surface">
  <h1>Your turn.</h1>
</main>

<style>
  .surface {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100dvh;
    padding: var(--space-container-padding);
    text-align: center;
    border: var(--stroke-active);
    box-sizing: border-box;
  }
  h1 {
    font-family: var(--font-family-display);
    font-size: var(--type-headline-lg-size);
    font-weight: var(--type-headline-lg-weight);
    line-height: var(--type-headline-lg-line);
    margin: 0;
    color: var(--color-secondary-container);
  }
</style>
