<script lang="ts">
  // Lobby.svelte — the Lobby surface (Story 1.10, UX-DR4/UX-DR15). Routed when phase === "lobby".
  //
  // Shows the Room Code large + letter-spaced (the most prominent element), the live roster with Lives
  // pips, and — for the Host only — a Lives stepper (1..5, default 3) + a bottom conductor bar holding
  // Deal (disabled until >= 2 Players). A non-Host sees neither control. All copy comes from copy.ts.
  //
  // The state is the live server projection (App passes the read-only store). The Host's Lives change
  // goes out via the session module's sendHostSetLives (NEVER socket.send from a surface — GATE-1).
  // The Deal intent itself is Epic 2; this story ships the bar + the disabled-until->=2 affordance.
  import type { ProjectedTableState } from "@trash/shared";
  import { MAX_LIVES, MIN_LIVES, MIN_PLAYERS } from "@trash/shared";
  import Button from "../components/Button.svelte";
  import LivesPips from "../components/LivesPips.svelte";
  import { DEAL, roomCode, waitingForHost } from "../lib/copy";
  import { sendHostSetLives } from "../lib/table-store.svelte";

  const { state }: { state: ProjectedTableState } = $props();

  const letters = $derived(state.code.split(""));
  const players = $derived([...state.players].sort((a, b) => a.seatIndex - b.seatIndex));
  const isHost = $derived(state.you.isHost);
  const canDeal = $derived(players.length >= MIN_PLAYERS);
  // Fall back to "the host" if the host isn't in the roster yet (or has an empty name) so the waiting
  // hint never renders a double-space / nameless sentence.
  const hostName = $derived(players.find((p) => p.id === state.hostId)?.name || "the host");

  function setLives(next: number): void {
    const clamped = Math.max(MIN_LIVES, Math.min(MAX_LIVES, next));
    if (clamped === state.startingLives) return; // value follows the server echo; no-op if unchanged.
    sendHostSetLives(clamped, state.phaseToken);
  }
</script>

<main class="surface">
  <header class="code-block">
    <div class="code" aria-label={`Room code ${state.code}`}>
      {#each letters as letter, i (i)}
        <span class="code-slot">{letter}</span>
      {/each}
    </div>
    <p class="code-caption">{roomCode(state.code)}</p>
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
    <p class="hint">{waitingForHost(hostName)}</p>
  {/if}

  {#if isHost}
    <!-- Host conductor bar: bottom-anchored thumb-zone bar holding the Lives stepper + the Deal action. -->
    <div class="conductor">
      <div class="stepper" aria-label="Lives stepper">
        <button
          class="step"
          aria-label="Decrease lives"
          disabled={state.startingLives <= MIN_LIVES}
          onclick={() => setLives(state.startingLives - 1)}>−</button>
        <span class="lives-value" aria-label="Starting lives">{state.startingLives}</span>
        <button
          class="step"
          aria-label="Increase lives"
          disabled={state.startingLives >= MAX_LIVES}
          onclick={() => setLives(state.startingLives + 1)}>+</button>
      </div>
      <!-- Deal: the phase-appropriate primary action. Disabled until >= 2 Players. The deal INTENT
           (round start) is Epic 2 — this ships the affordance + the disabled gate only. -->
      <Button onclick={() => {}} disabled={!canDeal}>{DEAL}</Button>
    </div>
  {/if}
</main>

<style>
  .surface {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 100dvh;
    padding: var(--space-container-padding);
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
  .conductor {
    margin-top: auto; /* anchor to the bottom edge (thumb zone). */
    width: 100%;
    max-width: 28rem;
    display: flex;
    align-items: center;
    gap: var(--space-stack-sm);
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: var(--space-stack-sm);
    padding: 0 var(--space-stack-sm);
    background: var(--color-surface-container-high);
    border-radius: var(--radius-full);
  }
  .step {
    width: 48px;
    height: 48px; /* >= 48dp */
    border: none;
    border-radius: var(--radius-full);
    background: var(--color-surface-container-highest);
    color: var(--color-on-surface);
    font-family: var(--font-family-display);
    font-size: var(--type-headline-lg-mobile-size);
    cursor: pointer;
  }
  .step:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .step:focus-visible {
    outline: var(--stroke-active);
    outline-offset: 2px;
  }
  .lives-value {
    min-width: 1.5rem;
    text-align: center;
    font-family: var(--font-family-display);
    font-size: var(--type-headline-lg-mobile-size);
    font-weight: var(--type-headline-lg-mobile-weight);
    color: var(--color-secondary-container);
  }
  .conductor :global(.btn) {
    flex: 1; /* Deal fills the rest of the bar. */
  }
</style>
