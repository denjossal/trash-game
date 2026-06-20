<script lang="ts">
  // SCOPE (Story 1.9a): foundation STUB. Routed between rounds (phase "roundResult") for a player
  // still alive. The real Round Result — Lives pips update, Host sees Re-deal / others "waiting to
  // re-deal", loser starts next round — is Epic 3 (3.4).
  import type { ProjectedTableState } from "@trash/shared";
  const { state }: { state: ProjectedTableState } = $props();
  // svelte-ignore state_referenced_locally
  void state;
</script>

<main class="surface">
  <h1>Round over.</h1>
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
