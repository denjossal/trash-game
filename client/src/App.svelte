<script lang="ts">
  // SCOPE (Story 1.2): stub. App.svelte becomes the render-from-state surface router
  // (ProjectedTableState -> exactly one surface) in Story 1.9a. No tokens/surfaces yet.
  import type { SharedContractVersion } from "@trash/shared";

  const contract: SharedContractVersion = "0.0.0-stub";
</script>

<main>
  <h1>Trash</h1>
  <p>Scaffold ready (contract {contract}).</p>
</main>
