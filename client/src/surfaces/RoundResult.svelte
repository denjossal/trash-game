<script lang="ts">
  // RoundResult.svelte — the between-rounds surface for a roundResult projection that did NOT keep the
  // round (so `revealed === false` and route-from-state.ts:59 lands HERE rather than on Showdown). The
  // normal loud beat (flip + loser highlight) lives on Showdown while `revealed === true`; this surface is
  // the RECOVERY path — a D2.1-coerced wake (eviction/crash mid-round → round lost → phase coerced to
  // roundResult, round=null) or any future cleared-round roundResult. It carries the Re-deal affordance so
  // the game is NEVER soft-locked between rounds after a reload: without it, a coerced roundResult would
  // route here and find no way forward (the Re-deal button used to live ONLY on Showdown). [Story 3.4,
  // FR-12; route-from-state.ts:53/:59; persistence.ts D2.1 coercion.]
  //
  // It has NO live round (round=null on the coerced path), so it renders no hands — only the durable
  // result the projection still carries: the post-deduction Lives pips and the loser names (from
  // state.loserIds + state.players, both restored by reconcileSummaryToState). The Re-deal block mirrors
  // Showdown's inline Host-only conductor (the shared conductor-bar COMPONENT is Story 4.1).
  import type { ProjectedTableState } from "@trash/shared";
  import Button from "../components/Button.svelte";
  import LivesPips from "../components/LivesPips.svelte";
  import { RE_DEAL, WAITING_TO_REDEAL, ROUND_OVER } from "../lib/copy";
  import { sendDealAgain } from "../lib/table-store.svelte";

  const { state }: { state: ProjectedTableState } = $props();

  // Re-deal is offered ONLY at `roundResult` (the ≥2-alive branch — gameOver routes to winner/eliminated,
  // never here). The Host sees the primary action; others see the waiting line. Same gate as Showdown.
  const canReDeal = $derived(state.phase === "roundResult");
  const isHost = $derived(state.you.isHost);

  // The loser set (value-free, restored from the durable summary). Used to name the loser(s) for the beat.
  const loserIds: Set<string> = $derived(new Set(state.loserIds ?? []));
  const losers = $derived(state.players.filter((p) => loserIds.has(p.id)));
</script>

<main class="surface">
  <h1>{ROUND_OVER}</h1>

  {#if losers.length > 0}
    <p class="losers" role="status" aria-live="polite">
      {losers.map((p) => p.name).join(", ")}
      {losers.length > 1 ? "each lost a life." : "lost a life."}
    </p>
  {/if}

  <!-- The post-deduction Lives for each seat (the durable result the projection still carries). -->
  <ul class="roster">
    {#each state.players as p (p.id)}
      <li class="seat" class:loser={loserIds.has(p.id)}>
        <span class="name">{p.name}</span>
        <LivesPips lives={p.lives} startingLives={state.startingLives} />
      </li>
    {/each}
  </ul>

  {#if canReDeal}
    <!-- Re-deal beat: Host-only primary action (one tap → next Round, Loser starts); others wait. The
         same inline Host-only block as Showdown (the shared conductor-bar component is Story 4.1). -->
    {#if isHost}
      <div class="redeal" data-testid="redeal-host">
        <Button onclick={() => sendDealAgain(state.phaseToken)}>{RE_DEAL}</Button>
      </div>
    {:else}
      <p class="redeal-waiting" data-testid="redeal-waiting" role="status" aria-live="polite">
        {WAITING_TO_REDEAL}
      </p>
    {/if}
  {/if}
</main>

<style>
  .surface {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100dvh;
    padding: var(--space-container-padding);
    text-align: center;
    gap: var(--space-stack-sm);
  }
  h1 {
    font-family: var(--font-family-display);
    font-size: var(--type-headline-lg-size);
    font-weight: var(--type-headline-lg-weight);
    line-height: var(--type-headline-lg-line);
    margin: 0;
    color: var(--color-on-surface);
  }
  .losers {
    margin: 0;
    font-size: var(--type-body-lg-size);
    font-weight: var(--type-body-lg-weight);
    color: var(--color-on-surface-variant);
  }
  .roster {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-base);
    align-items: center;
  }
  .seat {
    display: flex;
    align-items: center;
    gap: var(--space-base);
  }
  .seat .name {
    font-size: var(--type-body-md-size);
    color: var(--color-on-surface);
  }
  /* The loser's name reads in the error ramp (shape/colour cue pairs with the hollow pip — never colour
     alone, NFR-10: the spent pip's ring shape is the primary cue). */
  .seat.loser .name {
    color: var(--color-error);
    font-weight: var(--type-body-lg-weight);
  }
  .redeal {
    margin-top: var(--space-stack-sm);
  }
  .redeal-waiting {
    margin: var(--space-stack-sm) 0 0;
    font-size: var(--type-body-lg-size);
    font-weight: var(--type-body-lg-weight);
    color: var(--color-on-surface-variant);
  }
</style>
