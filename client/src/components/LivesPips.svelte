<script lang="ts">
  // LivesPips.svelte — the Lives indicator (Story 1.10, UX-DR15; DESIGN.md Lives Indicator).
  //
  // A reusable pip row: `lives` filled pips (neon-mint --color-secondary-container) + (startingLives -
  // lives) hollow pips (ringed in --color-outline — NOT outline-variant, which fails the 3:1 UI min).
  // Distinguished by SHAPE (filled disc vs. ring), not color alone, so it reads for color-blind/low-vision
  // players. For >= 4 Lives a NUMERAL is paired with the pips (never a bare number; never a faint dot).
  //
  // First used in the Lobby roster; DESIGN.md also lists Lives on Waiting/Showdown/RoundResult, so this is
  // a shared widget Epic 3 reuses. [Source: DESIGN.md lines 179-182.]
  //
  // PIP SETTLE ANIMATION (Story 3.4, UX-DR15 "brief animation on Life loss"): a brief scale/opacity
  // keyframe plays as each `.pip.hollow` ENTERS the DOM. The markup is two SEPARATE keyed {#each} blocks
  // (filled / hollow), so a life loss removes the last filled <span> and adds a hollow <span> — there is no
  // persistent element to morph disc→ring. KNOWN LIMITATION: because this is a pure CSS entry animation on
  // a mount (the component holds NO prior-`lives` state and does NOT detect a transition — by story
  // decision), it ALSO plays whenever the component is freshly mounted with already-spent pips (entering
  // Lobby/Waiting/Showdown, a reload at roundResult), not only on the moment a life is lost. It is a
  // mount-time settle, NOT a strict loss-only cue; a true loss transition would need transition detection,
  // deferred. Pure CSS, skipped under prefers-reduced-motion (the ring appears instantly). The DURABLE cue
  // is SHAPE (disc vs ring), never colour alone (NFR-10) — that survives with no motion at all. Kept a pure
  // props component (`{lives, startingLives}`) so the Lobby/Waiting reuse is untouched.
  const { lives, startingLives }: { lives: number; startingLives: number } = $props();

  // Clamp defensively; spent = the difference. Filled = remaining; hollow = spent. The numeral + the
  // aria-label both read `filled` (the clamped value), so a stale/bad projection never shows a numeral
  // that contradicts the pip count.
  const filled = $derived(Math.max(0, Math.min(lives, startingLives)));
  const hollow = $derived(Math.max(0, startingLives - filled));
  const showNumeral = $derived(startingLives >= 4); // pair a numeral once the pip row gets long.
</script>

<span class="pips" aria-label={`${filled} of ${startingLives} lives`}>
  {#each Array(filled) as _, i (`f${i}`)}
    <span class="pip filled" data-testid="pip-filled" aria-hidden="true"></span>
  {/each}
  {#each Array(hollow) as _, i (`h${i}`)}
    <span class="pip hollow" data-testid="pip-hollow" aria-hidden="true"></span>
  {/each}
  {#if showNumeral}
    <span class="numeral" data-testid="lives-numeral" aria-hidden="true">{filled}</span>
  {/if}
</span>

<style>
  .pips {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .pip {
    width: 14px;
    height: 14px;
    border-radius: var(--radius-full);
    box-sizing: border-box;
  }
  /* Remaining = filled neon-mint disc. */
  .pip.filled {
    background: var(--color-secondary-container);
  }
  /* Spent = hollow ring (shape difference, not color), outlined in --color-outline (>= 3:1). */
  .pip.hollow {
    background: transparent;
    border: 2px solid var(--color-outline);
    /* TICK-DOWN (Story 3.4): the newly-spent pip settles in with a brief scale/opacity keyframe when a
       life is lost (the hollow span enters as filled drops by one). Pure CSS — `both` so the from-state
       never flashes; dropped under reduce-motion below. The cue is the ring SHAPE, not this motion. */
    animation: pip-tick 220ms ease-out both;
  }
  @keyframes pip-tick {
    from {
      opacity: 0.4;
      transform: scale(0.6);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  .numeral {
    margin-left: 4px;
    font-family: var(--font-family-display);
    font-size: var(--type-label-bold-size);
    font-weight: var(--type-label-bold-weight);
    color: var(--color-on-surface-variant);
  }

  /* REDUCE MOTION (NFR-6/UX-DR15): skip the tick-down settle — the spent ring appears instantly. Same
     pure-CSS @media pattern as Button.svelte / Showdown.svelte (no JS matchMedia). The shape change (disc
     → ring) still reads with no motion, so the Life-loss cue survives. */
  @media (prefers-reduced-motion: reduce) {
    .pip.hollow {
      animation: none;
    }
  }
</style>
