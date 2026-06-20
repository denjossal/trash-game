<script lang="ts">
  // SCOPE (Story 1.9a): foundation STUB. Routed during a live round when it is NOT your turn
  // (incl. dealing / allActed — awaiting the next actor or the Host's reveal). The calmest surface.
  // The real Waiting — only the active Player's name + your own Lives, no card, no motion — is 1.10/Epic 2.
  import type { ProjectedTableState } from "@trash/shared";
  const { state }: { state: ProjectedTableState } = $props();

  const activeName = $derived(state.players.find((p) => p.id === state.currentTurnId)?.name ?? "");
</script>

<main class="surface">
  <h1>{activeName ? `${activeName}’s turn.` : "Hang tight."}</h1>
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
