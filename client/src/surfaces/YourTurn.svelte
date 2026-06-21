<script lang="ts">
  // YourTurn.svelte — the two-button hero (Story 2.4, FR-6, UX-DR5, NFR-9/NFR-10). Routed during a
  // live round when it is YOUR turn (route-from-state.ts: phase "turns" + currentTurnId === you).
  //
  // The surface: a neon active frame (gentle ~1.2s pulse; static under Reduce Motion), SWAP and KEEP as
  // massive (>=72px) pill primaries in the thumb zone, and a peek control. Nothing else competes (NFR-9
  // — no roster, no feed, no chat). All copy from copy.ts.
  //
  // Accessibility (NFR-10, AC-2.4.7): SWAP and KEEP are the FIRST two focus stops (placed first in DOM /
  // reading order; the peek control follows). Each is a real <button> (Button.svelte) with role+state.
  // An aria-live region announces "Your turn" to the screen reader when the surface mounts on transition.
  //
  // Send path: tapping SWAP/KEEP calls the table-store send seams (sendSwap/sendKeep) — NEVER socket.send
  // (GATE-1). Debounce is built into Button.svelte (one tap = one committed action, AC-2.4.5). The turn
  // token rides from the projection (state.turnToken); a stale/double-tapped intent is rejected with
  // `stale-turn` and swallowed silently by the store (AC-2.2.3) — no error UI here.
  //
  // The peek CONTROL is a real, labeled focus stop here, but the press-and-hold REVEAL interaction (and
  // the card-display rank->letter map) is Story 2.5 (UX-DR7/UX-DR8) — so this renders a disabled-looking
  // peek affordance with the PEEK_HINT label and wires no reveal yet. [Scope cut documented in the story.]
  //
  // The value-free squirm signal (AC-2.4.3): when the projection carries `justReceivedSwap` (the receiver
  // of a swap becomes the next active player — applySwap advances currentTurnId to the same neighbor, so
  // the receiver lands HERE), a brief value-free badge shows "someone swapped with you" — carrying NO
  // card data (SM-6). [Trace: applySwap → currentTurnId = neighbor; projector sets justReceivedSwap for
  // that device → route yourTurn with the flag set.]
  import type { ProjectedTableState } from "@trash/shared";
  import Button from "../components/Button.svelte";
  import { JUST_SWAPPED, KEEP, PEEK_HINT, SWAP, YOUR_TURN } from "../lib/copy";
  import { sendKeep, sendSwap } from "../lib/table-store.svelte";

  const { state }: { state: ProjectedTableState } = $props();

  // The turn token the active Player's intent must carry (from the live projection; 0 on a fresh round).
  const turnToken = $derived(state.turnToken ?? 0);
  const justSwapped = $derived(state.justReceivedSwap === true);

  function swap(): void {
    sendSwap(turnToken);
  }
  function keep(): void {
    sendKeep(turnToken);
  }
</script>

<main class="surface">
  <!-- SR turn-announce (NFR-10): assertive so the screen reader announces the turn on transition. -->
  <p class="prompt" role="status" aria-live="assertive">{YOUR_TURN}</p>

  {#if justSwapped}
    <!-- Value-free squirm beat (AR-7): no card data — just the social "you got dumped on" signal. -->
    <p class="squirm" role="status" aria-live="polite">{JUST_SWAPPED}</p>
  {/if}

  <!-- The two-button hero in the thumb zone. SWAP + KEEP are the FIRST two focus stops (reading order);
       the peek control follows. -->
  <div class="actions">
    <Button onclick={swap} ariaLabel={SWAP}>{SWAP}</Button>
    <Button onclick={keep} ariaLabel={KEEP}>{KEEP}</Button>
    <!-- Peek control PLACEHOLDER: a real, focusable stop AFTER SWAP/KEEP (so the hero stays the first
         two focus stops, AC-2.4.7). The press-and-hold reveal + card face is Story 2.5 — marked
         aria-disabled (announced, not yet operable) and wired to no reveal here. -->
    <button class="peek" type="button" aria-label={PEEK_HINT} aria-disabled="true">{PEEK_HINT}</button>
  </div>
</main>

<style>
  /* The neon active frame around the viewport with a gentle ~1.2s pulse (UX-DR5). The pulse is the
     SANCTIONED active-turn motion (NFR-9's "no idle animation" governs BETWEEN-turn feeds). */
  .surface {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100dvh;
    padding: var(--space-container-padding);
    box-sizing: border-box;
    gap: var(--space-stack-md);
    text-align: center;
    border: var(--stroke-active); /* 4px neon mint */
    animation: turn-pulse 1.2s ease-in-out infinite;
  }

  @keyframes turn-pulse {
    0%,
    100% {
      border-color: var(--stroke-active-color);
      opacity: 1;
    }
    50% {
      border-color: color-mix(in srgb, var(--stroke-active-color) 55%, transparent);
      opacity: 0.92;
    }
  }

  /* Reduce Motion: static neon frame, no pulse (UX-DR5, NFR-10). */
  @media (prefers-reduced-motion: reduce) {
    .surface {
      animation: none;
      border-color: var(--stroke-active-color);
    }
  }

  .prompt {
    margin: 0;
    font-family: var(--font-family-display);
    font-size: var(--type-headline-lg-mobile-size);
    font-weight: var(--type-headline-lg-mobile-weight);
    line-height: var(--type-headline-lg-mobile-line);
    color: var(--color-secondary-container);
  }

  .squirm {
    margin: 0;
    font-size: var(--type-body-lg-size);
    font-weight: var(--type-body-lg-weight);
    color: var(--color-on-surface);
  }

  /* The hero actions: anchored to the lower (thumb-zone) half; SWAP/KEEP are the massive pill primaries. */
  .actions {
    margin-top: auto;
    width: 100%;
    max-width: 28rem;
    display: flex;
    flex-direction: column;
    gap: var(--space-stack-sm);
  }
  .actions :global(.btn) {
    width: 100%;
  }

  /* Peek placeholder — a real, labeled focus stop; the reveal interaction is Story 2.5. */
  .peek {
    min-height: 48px;
    border: var(--border-inert);
    border-radius: var(--radius-full);
    background: var(--color-surface-container-high);
    color: var(--color-on-surface-variant);
    font-family: var(--font-family-body);
    font-size: var(--type-body-md-size);
    cursor: default;
    opacity: 0.7;
  }
  .peek:focus-visible {
    outline: var(--stroke-active);
    outline-offset: 2px;
  }
</style>
