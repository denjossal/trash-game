<script lang="ts">
  // SCOPE (Story 1.9a): foundation STUB. Routed when no tableState exists yet (cold open / pre-join).
  // The real Home — "Start a table" / "Join a table" + Room Code field — is Story 1.10 (UX-DR3),
  // which also wires socket.ts create/join into this surface.
</script>

<main class="surface">
  <h1>Trash</h1>
  <p>Connecting…</p>
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
    font-size: var(--type-display-lg-size);
    font-weight: var(--type-display-lg-weight);
    line-height: var(--type-display-lg-line);
    letter-spacing: var(--type-display-lg-tracking);
    margin: 0 0 var(--space-stack-sm);
    color: var(--color-primary);
  }
  p {
    font-size: var(--type-body-lg-size);
    font-weight: var(--type-body-lg-weight);
    color: var(--color-on-surface-variant);
    margin: 0;
  }
</style>
