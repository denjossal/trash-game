<script lang="ts">
  // Lobby.svelte — the Lobby surface (Story 1.10, UX-DR4/UX-DR15). Routed when phase === "lobby".
  //
  // Shows the Room Code large + letter-spaced (the most prominent element) and the live roster with Lives
  // pips. A non-Host sees a "waiting for the host" hint. All copy comes from copy.ts.
  //
  // The Deal action lives in the shared conductor bar (Story 4.1, ConductorBar.svelte), mounted as an
  // overlay by App.svelte — NOT inline here. The Lives stepper ALSO moved off Lobby in Story 4.2 into the
  // ⚙ Host Controls sheet (the sole home for the three FR-14 controls — Lives / remove / reassign), per
  // DESIGN.md:186. So Lobby is now Host-control-free: just the code + roster + the non-Host waiting hint.
  import type { ProjectedTableState } from "@trash/shared";
  import LivesPips from "../components/LivesPips.svelte";
  import { t } from "../lib/i18n.svelte";

  const { state }: { state: ProjectedTableState } = $props();

  const letters = $derived(state.code.split(""));
  const players = $derived([...state.players].sort((a, b) => a.seatIndex - b.seatIndex));
  const isHost = $derived(state.you.isHost);
  // Fall back to "the host" if the host isn't in the roster yet (or has an empty name) so the waiting
  // hint never renders a double-space / nameless sentence.
  const hostName = $derived(players.find((p) => p.id === state.hostId)?.name || "the host");
</script>

<main class="surface">
  <header class="code-block">
    <div class="code" aria-label={`Room code ${state.code}`}>
      {#each letters as letter, i (i)}
        <span class="code-slot">{letter}</span>
      {/each}
    </div>
    <p class="code-caption">{t("roomCode", { code: state.code })}</p>
  </header>

  <ul class="roster">
    {#each players as p (p.id)}
      <li class="row">
        <span class="name">{p.name}</span>
        <LivesPips lives={p.lives} startingLives={state.startingLives} />
      </li>
    {/each}
  </ul>

  {#if !isHost}
    <p class="hint">{t("waitingForHost", { host: hostName })}</p>
  {/if}
</main>

<style>
  .surface {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 100dvh;
    padding: var(--space-container-padding);
    /* Leave room at the bottom for the fixed conductor-bar overlay (Story 4.1) so it never covers content. */
    padding-bottom: calc(var(--space-container-padding) + 88px);
    box-sizing: border-box;
    gap: var(--space-stack-md);
  }
  .code-block {
    text-align: center;
    margin-top: var(--space-stack-md);
  }
  .code {
    display: flex;
    gap: var(--space-stack-sm);
    justify-content: center;
  }
  /* The single most prominent element — Display-LG, letter-spaced, each letter in its own slot. */
  .code-slot {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 3rem;
    padding: 0.25rem 0.5rem;
    font-family: var(--font-family-display);
    font-size: var(--type-display-lg-size);
    font-weight: var(--type-display-lg-weight);
    line-height: var(--type-display-lg-line);
    color: var(--color-on-surface);
    background: var(--color-surface-container-high);
    border-radius: var(--radius-md);
  }
  .code-caption {
    margin: var(--space-stack-sm) 0 0;
    font-size: var(--type-body-lg-size);
    font-weight: var(--type-body-lg-weight);
    color: var(--color-on-surface-variant);
  }
  .roster {
    list-style: none;
    margin: 0;
    padding: 0;
    width: 100%;
    max-width: 28rem;
    display: flex;
    flex-direction: column;
    gap: var(--space-stack-sm);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 80px;
    padding: 0 var(--space-gutter);
    background: var(--color-surface-container);
    border-radius: var(--radius-md);
  }
  .name {
    font-size: var(--type-body-lg-size);
    font-weight: var(--type-body-lg-weight);
    color: var(--color-on-surface);
  }
  .hint {
    color: var(--color-on-surface-variant);
    font-size: var(--type-body-lg-size);
    text-align: center;
    margin: 0;
  }
</style>
