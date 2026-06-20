<script lang="ts">
  // SCOPE (Story 1.9a): foundation STUB. Routed when phase === "lobby" (joined, pre-Deal).
  // The real Lobby — large letter-spaced Room Code, live roster with Lives pips, Host Lives stepper +
  // conductor bar (Deal disabled < 2 Players) — is Story 1.10 (UX-DR4/UX-DR15).
  import type { ProjectedTableState } from "@trash/shared";
  const { state }: { state: ProjectedTableState } = $props();
</script>

<main class="surface">
  <h1 class="code">{state.code}</h1>
  <p>Lobby — {state.players.length} in.</p>
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
  .code {
    font-family: var(--font-family-display);
    font-size: var(--type-display-lg-size);
    font-weight: var(--type-display-lg-weight);
    line-height: var(--type-display-lg-line);
    letter-spacing: 0.08em;
    margin: 0 0 var(--space-stack-sm);
    color: var(--color-on-surface);
  }
  p {
    font-size: var(--type-body-lg-size);
    font-weight: var(--type-body-lg-weight);
    color: var(--color-on-surface-variant);
    margin: 0;
  }
</style>
