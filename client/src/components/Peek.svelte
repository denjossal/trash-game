<script lang="ts">
  // Peek.svelte — the press-and-hold "peek your own card" control (Story 2.5 on-turn, Story 6.1
  // off-turn). Extracted from YourTurn.svelte / Waiting.svelte so the on-turn and off-turn peeks
  // share ONE lifecycle and cannot silently diverge (code review 6.1).
  //
  // Owns the full peek lifecycle: the face-down Card at rest, the Display-XL face only while HELD,
  // the SR announce-once region, the press-and-hold <button>, and the auto-hide on
  // release/leave/cancel/blur/background. `revealed` is LOCAL UI-only $state — NEVER sent to the
  // server (architecture.md:556 "only UI-only state (peeking) is local and never sent"); there is no
  // peek intent. The card value reaches only the owner's device (the caller passes their OWN
  // you.hand). The int→letter / speech map stays in card-display.ts (the SOLE home).
  //
  // Privacy (AC-2.5.3): the revealed face is in an {#if revealed} block inside Card.svelte, so the
  // rank/suit nodes do NOT exist in the DOM / a11y tree while hidden. The announce text DERIVES from
  // `revealed` (+ the card) so it can never drift out of sync — revealed → the spoken rank, hidden →
  // "" (announced once, never a persistent readable node, AC-2.5.4 / AC-6.1.5). Reads `card` LIVE so
  // the peek always shows the CURRENT card (AC-6.1.3).
  //
  // Auto-hide (AC-2.5.2 / AC-6.1.2): re-hide on the control's blur, on document visibilitychange (app
  // backgrounded), and on pagehide (navigation/suspend) — a phone set down never exposes a hand. The
  // document/window listeners are registered in a $effect that returns its teardown (no leaked
  // listeners across surface transitions). blur is jsdom-testable; visibilitychange/pagehide are
  // verified by manual/Playwright (non-deterministic in jsdom).
  import type { Card as CardType } from "@trash/shared";
  import { cardSpeech } from "../lib/card-display";
  import { t } from "../lib/i18n.svelte";
  import Card from "./Card.svelte";

  const { card }: { card: CardType } = $props();

  // Local UI-only peek state — NEVER sent to the server. `revealed` is the SOLE source of truth.
  let revealed = $state(false);
  const announcement = $derived(revealed ? cardSpeech(card) : "");

  function reveal(): void {
    revealed = true;
  }
  function hide(): void {
    revealed = false;
  }

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
</script>

<div class="card-slot">
  <Card {card} {revealed} />
</div>

<!-- SR announce-once region (AC-2.5.4 / AC-6.1.5): assertive so the rank is heard on activation;
     cleared on release so it is never a persistent readable node. Owner's device only. -->
<p class="sr-only" data-testid="peek-announce" role="status" aria-live="assertive">{announcement}</p>

<!-- Peek control: press-and-hold to reveal the own card; release/leave/cancel/blur re-hides it
     immediately (AC-2.5.1/.2, AC-6.1.1/.2). A real focusable <button>; keyboard/SR users activate it
     (the live region announces once). NO timer, NO pin (UX-DR18). preventDefault on Space stops the
     page-scroll / synthetic-click the browser fires for a held Space on a native button. -->
<button
  class="peek"
  type="button"
  aria-label={t("PEEK_HINT")}
  aria-pressed={revealed}
  onpointerdown={reveal}
  onpointerup={hide}
  onpointercancel={hide}
  onpointerleave={hide}
  onblur={hide}
  onkeydown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      reveal();
    }
  }}
  onkeyup={(e) => {
    if (e.key === "Enter" || e.key === " ") hide();
  }}>{t("PEEK_HINT")}</button>

<style>
  /* The own-card slot — subordinate to the host surface's primary content (NFR-9). touch-action:none
     so a press-and-hold drag doesn't scroll/select while peeking. */
  .card-slot {
    width: 100%;
    max-width: 14rem;
    touch-action: none;
  }

  /* Peek control — a real, labeled press-and-hold focus stop. */
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

  /* Screen-reader-only: present in the a11y tree, visually hidden (modern clip-path idiom). */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
</style>
