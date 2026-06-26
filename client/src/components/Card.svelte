<script lang="ts">
  // Card.svelte — the secret-Card display (Story 2.5, UX-DR7/UX-DR8). Display-ONLY: renders EITHER the
  // hidden face-down back OR the revealed face, driven by the `revealed` prop. It owns NO interaction
  // (the press-and-hold lifecycle + the `revealed` state live in the owner surface, YourTurn.svelte) and
  // NO socket — it is a pure function of its props, so it is REUSABLE for Showdown (Epic 3, UX-DR9) where
  // all players' cards flip face-up together, driven by a different `revealed` source.
  //
  // PRIVACY (AC-2.5.3): the revealed face is in an {#if revealed} block, so the rank/suit nodes do NOT
  // exist in the DOM / accessibility tree while hidden — a screen reader (or a neighbour's AT) cannot
  // read a card the owner hasn't chosen to peek. The hidden resting state is a neon-outlined face-down
  // back carrying no value.
  //
  // DISPLAY (AC-2.5.1, UX-DR8): the face is a BIG rank (Display-XL, via the SOLE letter map in
  // card-display.ts) + a SINGLE large suit pip — not a corner index, not photoreal. Suit is decorative,
  // distinguished by SHAPE (the glyph) not COLOR (NFR-10 color-independence) — there is no suit→color map.
  import type { Card } from "@trash/shared";
  import { rankToLetter } from "../lib/card-display";
  import { getLanguage } from "../lib/i18n.svelte";

  const { card, revealed }: { card: Card; revealed: boolean } = $props();

  // Reads the active device language (Story 7.3) so the face glyph is Spanish (As/Jota/Reina/Rey) when
  // chosen — re-renders on a language switch. The rank→glyph map itself stays in card-display.ts.
  const letter = $derived(rankToLetter(card.rank, getLanguage()));
</script>

{#if revealed}
  <!-- Revealed face: big rank + single suit pip. aria-hidden on the decorative glyphs — the SR path
       announces the rank via the live region in YourTurn (AC-2.5.4), so the visual face is presentational
       and need not be double-read by the screen reader. -->
  <div class="card face" aria-hidden="true">
    <span class="rank">{letter}</span>
    <span class="suit">{card.suit}</span>
  </div>
{:else}
  <!-- Hidden resting state: a neon-outlined face-down back. Carries NO rank/suit node (the {#if} above
       is not rendered), so the value is absent from the accessibility tree. -->
  <div class="card back" aria-label="Card, face-down"></div>
{/if}

<style>
  .card {
    width: 100%;
    max-width: 14rem;
    aspect-ratio: 3 / 4;
    margin: 0 auto;
    border-radius: var(--radius-md); /* chunky card geometry (>= 24px) */
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  /* The revealed face: tonal surface + neon outline; big rank, single suit pip. */
  .card.face {
    background: var(--color-surface-container-high);
    border: var(--stroke-active); /* 4px neon mint */
    gap: var(--space-stack-sm);
    color: var(--color-on-surface); /* >= 4.5:1 on the dark surface */
  }
  .rank {
    font-family: var(--font-family-display);
    font-size: var(--type-display-xl-size); /* 96px Display-XL */
    font-weight: var(--type-display-xl-weight);
    line-height: var(--type-display-xl-line);
    letter-spacing: var(--type-display-xl-tracking);
  }
  /* Single large suit pip — the suit's meaning is its SHAPE, not a colour. */
  .suit {
    font-size: var(--type-display-lg-size); /* 64px — large but subordinate to the rank */
    line-height: 1;
  }

  /* The face-down back: the neon-outlined resting state, no value. */
  .card.back {
    background: var(--color-surface-container);
    border: var(--stroke-active);
    /* A faint diagonal sheen so the back reads as a card, not an empty box (decorative only). */
    background-image: repeating-linear-gradient(
      45deg,
      transparent 0,
      transparent 10px,
      color-mix(in srgb, var(--stroke-active-color) 8%, transparent) 10px,
      color-mix(in srgb, var(--stroke-active-color) 8%, transparent) 20px
    );
  }
</style>
