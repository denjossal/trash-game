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
  }
  .numeral {
    margin-left: 4px;
    font-family: var(--font-family-display);
    font-size: var(--type-label-bold-size);
    font-weight: var(--type-label-bold-weight);
    color: var(--color-on-surface-variant);
  }
</style>
