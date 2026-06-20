<script lang="ts">
  // SCOPE (Story 1.9a): foundation STUB. Routed at game over for the winner. The real Winner —
  // "{name} wins it. One more?" celebration routing the Host to a new game on the same Table — is
  // Epic 3 (3.6).
  import type { ProjectedTableState } from "@trash/shared";
  const { state }: { state: ProjectedTableState } = $props();

  const winnerName = $derived(
    state.players.find((p) => state.winnerIds?.includes(p.id))?.name ?? "",
  );
</script>

<main class="surface">
  <h1>{winnerName ? `${winnerName} wins it.` : "Winner!"}</h1>
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
    font-size: var(--type-display-lg-size);
    font-weight: var(--type-display-lg-weight);
    line-height: var(--type-display-lg-line);
    letter-spacing: var(--type-display-lg-tracking);
    margin: 0;
    color: var(--color-secondary-container);
  }
</style>
