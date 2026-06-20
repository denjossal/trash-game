<script lang="ts">
  // SCOPE (Story 1.9a): foundation STUB. Routed when you are out of Lives (spectator) or the game is
  // over and you are not the winner. The real Eliminated — "You're out — stick around and heckle",
  // still seeing Waiting/Showdown — is a play-confirmed bet in Epic 3 (3.5, Decision #6).
  import type { ProjectedTableState } from "@trash/shared";
  const { state }: { state: ProjectedTableState } = $props();
  // svelte-ignore state_referenced_locally
  void state;
</script>

<main class="surface">
  <h1>You’re out.</h1>
  <p>Stick around and heckle.</p>
</main>

<style>
  .surface {
    display: flex;
    flex-direction: column;
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
    margin: 0 0 var(--space-base);
    color: var(--color-on-surface);
  }
  p {
    font-size: var(--type-body-lg-size);
    font-weight: var(--type-body-lg-weight);
    color: var(--color-on-surface-variant);
    margin: 0;
  }
</style>
