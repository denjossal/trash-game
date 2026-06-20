<script lang="ts">
  // SCOPE (Story 1.9a): foundation STUB. Routed at the simultaneous reveal (phase "showdown" /
  // revealed). The real Showdown — all cards flip together (≤400ms, reduce-motion safe), loser(s)
  // highlighted with the error ramp — is Epic 3 (3.2/3.3). Eliminated spectators see this too.
  import type { ProjectedTableState } from "@trash/shared";
  const { state }: { state: ProjectedTableState } = $props();
  // svelte-ignore state_referenced_locally
  void state;
</script>

<main class="surface">
  <h1>Showdown.</h1>
</main>

<style>
  .surface {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100dvh;
    padding: var(--space-container-padding);
    text-align: center;
  }
  h1 {
    font-family: var(--font-family-display);
    font-size: var(--type-headline-lg-size);
    font-weight: var(--type-headline-lg-weight);
    line-height: var(--type-headline-lg-line);
    margin: 0;
    color: var(--color-on-surface);
  }
</style>
