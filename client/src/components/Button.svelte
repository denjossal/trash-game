<script lang="ts">
  // Button.svelte — the shared interaction-safe button primitive (Story 1.9b, UX-DR18 / NFR-10).
  //
  // This is "the first genuinely reused widget", so it pulls client/src/components/ into existence
  // (architecture.md#Complete-Project-Directory-Structure: "let the first genuinely reused widget
  // pull it into existence"). 1.10 / Epic 2 reuse it for Start / Join / Deal / Swap / Keep / Re-deal.
  //
  // Guarantees:
  //  - Debounce (no accidental double-fire): a second activation within DEBOUNCE_MS is swallowed —
  //    one tap = one committed action. This is NOT a confirm dialog (Swap/Keep need no confirm —
  //    speed matters). [EXPERIENCE.md lines 66, 98.]
  //  - Tap target >= 48dp every variant; the primary "hero" variant is >= 72px tall. [DESIGN.md 164;
  //    EXPERIENCE.md 108.]
  //  - Primary look: solid neon-mint (--color-secondary-container #36ffc4), black text, pill radius,
  //    NO hover, active press scales to 95%. [DESIGN.md 157, 164.]
  //  - Reduce-motion safe: the press-scale is dropped under prefers-reduced-motion (the click still
  //    fires + still debounces). [EXPERIENCE.md 112.]
  //  - Real <button>: keyboard (Enter/Space) + focus-visible + AT semantics for free. [EXPERIENCE.md 114.]
  //  - Thumb-zone: the button is layout-agnostic; surfaces anchor primary actions in the lower half of
  //    the viewport (thumb zone). Real bottom-anchored layouts (conductor bar) are 1.10/Epic 4.
  //    [EXPERIENCE.md 115; DESIGN.md 185.]
  import type { Snippet } from "svelte";
  import { DEBOUNCE_MS } from "../lib/interaction";

  type Variant = "primary" | "secondary";

  const {
    onclick,
    children,
    variant = "primary",
    disabled = false,
    type = "button",
    ariaLabel,
  }: {
    onclick: () => void;
    children: Snippet;
    variant?: Variant;
    disabled?: boolean;
    type?: "button" | "submit";
    ariaLabel?: string;
  } = $props();

  // Debounce guard: while `locked`, taps are swallowed. The lock clears after DEBOUNCE_MS.
  // (Date/setTimeout are fine here — the rules-purity ESLint ban is server/src/rules/** only.)
  let locked = false;

  function handleClick(): void {
    if (disabled || locked) return;
    locked = true;
    setTimeout(() => {
      locked = false;
    }, DEBOUNCE_MS);
    onclick();
  }
</script>

<button
  {type}
  class="btn {variant}"
  {disabled}
  aria-label={ariaLabel}
  onclick={handleClick}
>
  {@render children()}
</button>

<style>
  .btn {
    /* Tap target: every variant clears >= 48dp in both dimensions. */
    min-height: 48px;
    min-width: 48px;
    border: none;
    border-radius: var(--radius-full); /* pill — the most important touch targets */
    font-family: var(--font-family-display);
    font-weight: var(--type-label-bold-weight); /* >= 500, per the design's "nothing thin" rule */
    cursor: pointer;
    /* Press feedback only (no hover sink). Kept tiny + safe; removed under reduce-motion below. */
    transition: transform 80ms ease-out;
    -webkit-tap-highlight-color: transparent;
  }

  /* Primary "hero": massive neon-mint pill with black text — the lower-thumb-zone CTA. */
  .btn.primary {
    min-height: 72px; /* DESIGN.md: primary buttons min 72px */
    padding: 0 var(--space-stack-md);
    background: var(--color-secondary-container); /* neon mint #36ffc4 */
    color: #000;
    font-size: var(--type-body-lg-size);
  }

  /* Secondary / smaller utility: still >= 48dp; tonal surface with the inert border. */
  .btn.secondary {
    padding: 0 var(--space-stack-sm);
    background: var(--color-surface-container-high);
    color: var(--color-on-surface);
    border: var(--border-inert);
    font-size: var(--type-body-md-size);
  }

  /* No hover state (DESIGN.md "No subtle hover states"). Active press scales to 95%. */
  .btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  /* Visible keyboard focus — never remove the indicator without a replacement. */
  .btn:focus-visible {
    outline: var(--stroke-active);
    outline-offset: 2px;
  }

  .btn:disabled {
    cursor: default;
    opacity: 0.5;
  }
  .btn.primary:disabled {
    /* Disabled primary reads as inert, not a live CTA. */
    background: var(--color-surface-container-high);
    color: var(--color-on-surface-variant);
    border: var(--border-inert);
  }

  /* Reduce-motion: drop the press-scale + transition. Click + debounce still work. */
  @media (prefers-reduced-motion: reduce) {
    .btn {
      transition: none;
    }
    .btn:active:not(:disabled) {
      transform: none;
    }
  }
</style>
