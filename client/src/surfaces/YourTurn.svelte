<script lang="ts">
  // YourTurn.svelte — the two-button hero (Story 2.4, FR-6, UX-DR5, NFR-9/NFR-10). Routed during a
  // live round when it is YOUR turn (route-from-state.ts: phase "turns" + currentTurnId === you).
  //
  // The surface: a neon active frame (gentle ~1.2s pulse; static under Reduce Motion), SWAP and KEEP as
  // massive (>=72px) pill primaries in the thumb zone, a peek control, and — for the Last Player ONLY
  // (Story 2.6) — a subordinate Secondary "Draw from deck" button. Nothing else competes (NFR-9 — no
  // roster, no feed, no chat). All copy from copy.ts.
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
  // The peek CONTROL (shared <Peek> component) is a real, labeled focus stop AFTER SWAP/KEEP.
  // Press-and-hold reveals the owner's OWN card (Story 2.5, UX-DR7/UX-DR8): pointerdown reveals,
  // release/leave/cancel/blur re-hides immediately (never persistent, no timer). The peek state is
  // LOCAL UI-only and NEVER sent (architecture.md:556); the lifecycle, the SR announce-once region
  // (AC-2.5.4), and the auto-hide on blur/visibilitychange/pagehide all live in Peek.svelte — the SAME
  // control the off-turn Waiting surface uses (Story 6.1), so the two peeks cannot diverge.
  //
  // The value-free squirm signal (AC-2.4.3): when the projection carries `justReceivedSwap` (the receiver
  // of a swap becomes the next active player — applySwap advances currentTurnId to the same neighbor, so
  // the receiver lands HERE), a brief value-free badge shows "someone swapped with you" — carrying NO
  // card data (SM-6). [Trace: applySwap → currentTurnId = neighbor; projector sets justReceivedSwap for
  // that device → route yourTurn with the flag set.]
  import type { ProjectedTableState } from "@trash/shared";
  import Button from "../components/Button.svelte";
  import Peek from "../components/Peek.svelte";
  import { t } from "../lib/i18n.svelte";
  import { sendDraw, sendKeep, sendSwap } from "../lib/table-store.svelte";

  // Renamed from `state` to `proj` to avoid the identifier colliding with the `$state` rune (Svelte
  // parses `$state` as a store auto-subscription on a variable literally named `state`).
  const { state: proj }: { state: ProjectedTableState } = $props();

  // The turn token the active Player's intent must carry (from the live projection; 0 on a fresh round).
  const turnToken = $derived(proj.turnToken ?? 0);
  const justSwapped = $derived(proj.justReceivedSwap === true);

  function swap(): void {
    sendSwap(turnToken);
  }
  function keep(): void {
    sendKeep(turnToken);
  }
  // The Last Player's third choice (Story 2.6, FR-7): draw a random Card from the Deck instead of
  // swapping. Same fire-and-forget seam as swap/keep (server validates last-player authority + turn
  // token, replaces the card, and enters allActed). Shown ONLY when the server says you.isLastPlayer.
  function draw(): void {
    sendDraw(turnToken);
  }
</script>

<main class="surface">
  <!-- SR turn-announce (NFR-10): assertive so the screen reader announces the turn on transition. -->
  <p class="prompt" role="status" aria-live="assertive">{t("YOUR_TURN")}</p>

  {#if justSwapped}
    <!-- Value-free squirm beat (AR-7): no card data — just the social "you got dumped on" signal. -->
    <p class="squirm" role="status" aria-live="polite">{t("JUST_SWAPPED")}</p>
  {/if}

  <!-- The two-button hero in the thumb zone. SWAP + KEEP are the FIRST two focus stops (reading order);
       the peek control follows below. -->
  <div class="actions">
    <Button onclick={swap} ariaLabel={t("SWAP")}>{t("SWAP")}</Button>
    <Button onclick={keep} ariaLabel={t("KEEP")}>{t("KEEP")}</Button>
    <!-- Last-Player ONLY (Story 2.6, FR-7, UX-DR5): a visually-subordinate Secondary "Draw from deck"
         button AFTER SWAP/KEEP (the two-button hero stays the first two focus stops, AC-2.4.7). Keyed on
         the value-free server field you.isLastPlayer — NEVER a card rank (SM-6 (c) — no behavioral tell).
         Reuses Button variant="secondary" (the built-in subordinate treatment: tonal surface, inert
         border, ≥48px, one-shot click debounce — the draw is a tap, not a hold like peek). -->
    {#if proj.you.isLastPlayer}
      <Button onclick={draw} variant="secondary" ariaLabel={t("DRAW")}>{t("DRAW")}</Button>
    {/if}
  </div>

  <!-- The owner's own secret Card + press-and-hold peek control (shared <Peek>, Story 2.5). AFTER the
       hero so SWAP/KEEP stay the first two focus stops (AC-2.4.7). Guarded on you.hand so an early/odd
       projection can't throw. NOT in the thumb zone (the two-button hero stays primary — NFR-9). -->
  {#if proj.you.hand}
    <Peek card={proj.you.hand} />
  {/if}
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
</style>
