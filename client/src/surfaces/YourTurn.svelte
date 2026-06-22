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
  // The peek CONTROL is a real, labeled focus stop AFTER SWAP/KEEP. Press-and-hold reveals the owner's
  // OWN card (Story 2.5, UX-DR7/UX-DR8): pointerdown reveals, release/leave/cancel/blur re-hides
  // immediately (never persistent, no timer). `revealed` is LOCAL UI-only $state — peeking is NEVER sent
  // to the server (architecture.md:556 "only UI-only state (peeking) is local and never sent"); there is
  // no peek intent. The card face (and the SOLE rank->letter map) live in Card.svelte / card-display.ts.
  //
  // Auto-hide (AC-2.5.2): also re-hide on the control's blur, on document visibilitychange (app
  // backgrounded), and on pagehide (navigation/suspend) — a phone set down never exposes a hand. The
  // document/window listeners are registered in a $effect that returns its teardown (no leaked listeners
  // across surface transitions). blur is jsdom-testable; visibilitychange/pagehide are verified by
  // manual/Playwright (non-deterministic in jsdom — AC-2.5.2 / Amelia review).
  //
  // SR announce-once (AC-2.5.4): a screen-reader user cannot "hold", so activating the peek sets an
  // assertive live region to the spoken rank ONCE, then clears it on release — the rank is never a
  // persistent readable node, and reaches only the owner's device (built from state.you.hand, never sent).
  //
  // The value-free squirm signal (AC-2.4.3): when the projection carries `justReceivedSwap` (the receiver
  // of a swap becomes the next active player — applySwap advances currentTurnId to the same neighbor, so
  // the receiver lands HERE), a brief value-free badge shows "someone swapped with you" — carrying NO
  // card data (SM-6). [Trace: applySwap → currentTurnId = neighbor; projector sets justReceivedSwap for
  // that device → route yourTurn with the flag set.]
  import type { ProjectedTableState } from "@trash/shared";
  import Button from "../components/Button.svelte";
  import Card from "../components/Card.svelte";
  import { cardSpeech } from "../lib/card-display";
  import { JUST_SWAPPED, KEEP, PEEK_HINT, SWAP, YOUR_TURN } from "../lib/copy";
  import { sendKeep, sendSwap } from "../lib/table-store.svelte";

  // Renamed from `state` to `proj` to avoid the identifier colliding with the `$state` rune used below
  // (Svelte parses `$state` as a store auto-subscription on a variable literally named `state`).
  const { state: proj }: { state: ProjectedTableState } = $props();

  // The turn token the active Player's intent must carry (from the live projection; 0 on a fresh round).
  const turnToken = $derived(proj.turnToken ?? 0);
  const justSwapped = $derived(proj.justReceivedSwap === true);

  // Local UI-only peek state — NEVER sent to the server. `revealed` is the SOLE source of truth.
  let revealed = $state(false);
  // The SR announce text DERIVES from `revealed` (+ the own card), so it can never drift out of sync
  // with the reveal state: revealed → the spoken rank, hidden → "" (the rank is announced once and is
  // never a persistent readable node, AC-2.5.4). No hand-synced second state to keep in lockstep.
  const announcement = $derived(revealed && proj.you.hand ? cardSpeech(proj.you.hand) : "");

  function reveal(): void {
    if (!proj.you.hand) return; // nothing to peek (early/odd projection)
    revealed = true;
  }
  function hide(): void {
    revealed = false;
  }

  // Auto-hide on app-background / navigation (AC-2.5.2). Listeners removed on unmount (no leak).
  $effect(() => {
    function onVisibility(): void {
      if (document.hidden) hide();
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", hide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", hide);
    };
  });

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

  <!-- The owner's own secret Card: a face-down neon back at rest, the Display-XL face only while held.
       Guarded on you.hand so an early/odd projection can't throw. NOT in the thumb zone (the two-button
       hero stays primary — NFR-9). -->
  {#if proj.you.hand}
    <div class="card-slot">
      <Card card={proj.you.hand} {revealed} />
    </div>
  {/if}

  <!-- SR announce-once region (AC-2.5.4): assertive so the rank is heard on activation; cleared on
       release so it is never a persistent readable node. Owner's device only (built from you.hand). -->
  <p class="sr-only" data-testid="peek-announce" role="status" aria-live="assertive">{announcement}</p>

  <!-- The two-button hero in the thumb zone. SWAP + KEEP are the FIRST two focus stops (reading order);
       the peek control follows. -->
  <div class="actions">
    <Button onclick={swap} ariaLabel={SWAP}>{SWAP}</Button>
    <Button onclick={keep} ariaLabel={KEEP}>{KEEP}</Button>
    <!-- Peek control: press-and-hold to reveal the own card; release/leave/cancel/blur re-hides it
         immediately (AC-2.5.1/.2). A real focusable <button> AFTER SWAP/KEEP (the hero stays the first
         two focus stops, AC-2.4.7). Keyboard/SR users activate it (the live region announces once). -->
    <button
      class="peek"
      type="button"
      aria-label={PEEK_HINT}
      aria-pressed={revealed}
      onpointerdown={reveal}
      onpointerup={hide}
      onpointercancel={hide}
      onpointerleave={hide}
      onblur={hide}
      onkeydown={(e) => {
        if (e.key === "Enter" || e.key === " ") reveal();
      }}
      onkeyup={(e) => {
        if (e.key === "Enter" || e.key === " ") hide();
      }}>{PEEK_HINT}</button>
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

  /* The own-card slot — sits above the actions, subordinate to the two-button hero (NFR-9). */
  .card-slot {
    width: 100%;
    max-width: 14rem;
    /* touch-action:none so a press-and-hold drag doesn't scroll/select while peeking. */
    touch-action: none;
  }

  /* Peek control — a real, labeled press-and-hold focus stop (operable, Story 2.5). */
  .peek {
    min-height: 48px;
    border: var(--border-inert);
    border-radius: var(--radius-full);
    background: var(--color-surface-container-high);
    color: var(--color-on-surface);
    font-family: var(--font-family-body);
    font-size: var(--type-body-md-size);
    cursor: pointer;
    /* No text selection / no scroll-pan while pressing-and-holding to peek. */
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
  .peek:focus-visible {
    outline: var(--stroke-active);
    outline-offset: 2px;
  }
  .peek[aria-pressed="true"] {
    border: var(--stroke-active);
  }

  /* Screen-reader-only: present in the a11y tree, visually hidden (the standard clip pattern). */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
