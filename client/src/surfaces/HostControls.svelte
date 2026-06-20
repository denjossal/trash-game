<script lang="ts">
  // SCOPE (Story 1.9a): foundation STUB. NOT a routed surface — an OVERLAY the Host opens on top of
  // Lobby / Waiting / Round Result (never reachable from Your Turn). routeFromState does NOT return it;
  // the overlay toggle + its content (Deal/Showdown/Re-deal, Lives stepper, remove player, reassign
  // Host) are Stories 1.10 / Epic 4 (4.1/4.2). Defined here only so the surfaces set is complete.
  import type { ProjectedTableState } from "@trash/shared";
  const { state }: { state: ProjectedTableState } = $props();
  // svelte-ignore state_referenced_locally
  void state;
</script>

<section class="overlay">
  <h2>Host controls</h2>
</section>

<style>
  .overlay {
    padding: var(--space-stack-md);
    background: var(--color-surface-container-high);
    border-radius: var(--radius-md);
  }
  h2 {
    font-family: var(--font-family-display);
    font-size: var(--type-headline-lg-mobile-size);
    font-weight: var(--type-headline-lg-mobile-weight);
    line-height: var(--type-headline-lg-mobile-line);
    margin: 0;
    color: var(--color-on-surface);
  }
</style>
