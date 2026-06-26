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
  // state.loserIds + state.players, both restored by reconcileSummaryToState).
  //
  // RE-DEAL (Story 3.4 / 4.1): the HOST'S Re-deal primary now lives in the shared conductor bar
  // (ConductorBar.svelte, mounted as an overlay by App.svelte on the roundResult surface) — the inline
  // Host Re-deal block that lived here was removed so there is exactly ONE Re-deal button (mirroring the
  // Showdown change). The NON-HOST "waiting to re-deal" line STAYS on this surface: the bar is Host-only,
  // so non-Hosts would otherwise have no cue.
  import type { ProjectedTableState } from "@trash/shared";
  import LivesPips from "../components/LivesPips.svelte";
  import { t } from "../lib/i18n.svelte";

  const { state }: { state: ProjectedTableState } = $props();

  // The non-Host "waiting to re-deal" line is shown ONLY at `roundResult` (the ≥2-alive branch — gameOver
  // routes to winner/eliminated, never here). The Host's Re-deal action is the conductor bar's (Story 4.1).
  const canReDeal = $derived(state.phase === "roundResult");
  const isHost = $derived(state.you.isHost);

  // The loser set (value-free, restored from the durable summary). Used to name the loser(s) for the beat.
  const loserIds: Set<string> = $derived(new Set(state.loserIds ?? []));
  const losers = $derived(state.players.filter((p) => loserIds.has(p.id)));
</script>

<main class="surface">
  <h1>{t("ROUND_OVER")}</h1>

  {#if losers.length > 0}
    <p class="losers" role="status" aria-live="polite">
      {losers.map((p) => p.name).join(", ")}
      {t("lostALife", { plural: losers.length > 1 })}
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

  {#if canReDeal && !isHost}
    <!-- Re-deal beat (Story 3.4 / 4.1): the HOST'S Re-deal action is the conductor bar's (overlay, Story
         4.1). Non-Hosts get the waiting line here so they still have a cue. -->
    <p class="redeal-waiting" data-testid="redeal-waiting" role="status" aria-live="polite">
      {t("WAITING_TO_REDEAL")}
    </p>
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
  .redeal-waiting {
    margin: var(--space-stack-sm) 0 0;
    font-size: var(--type-body-lg-size);
    font-weight: var(--type-body-lg-weight);
    color: var(--color-on-surface-variant);
  }
</style>
