<script lang="ts">
  // ConductorBar.svelte — the shared Host conductor bar (Story 4.1, UX-DR14 / NFR-9 / AR-6).
  //
  // The Host-only, bottom-anchored (thumb-zone) bar that holds the SINGLE phase-appropriate primary action
  // plus a ⚙ controls affordance. It is mounted as an OVERLAY by App.svelte on the non-turn surfaces
  // (Lobby / Waiting / the revealed Showdown beat) — it is NOT a routed Surface (route-from-state.ts keeps
  // HostControls deliberately absent) and is NEVER reachable from Your Turn (AC-4.1.2 — App.svelte excludes
  // yourTurn/home from the mount).
  //
  // PHASE → PRIMARY (AC-4.1.1), one at a time:
  //   lobby        → Deal      (disabled until ≥2 Players)  → sendDeal
  //   allActed     → Showdown                                → sendRevealAll  (server accepts only at allActed)
  //   roundResult  → Re-deal                                 → sendDealAgain
  // Any other phase → no primary (just the ⚙). The bar reads state.phase/you.isHost/phaseToken only; it does
  // NOT recompute turn/elimination/win logic (those are server-derived). All sends go through the GATE-1-exempt
  // table-store seams (NEVER socket.send from a surface/component).
  //
  // EYES-UP (AC-4.1.7): the bar holds ONLY {one primary, ⚙} — no timer/log/dashboard/ambient. The ⚙ opens a
  // one-level modal sheet (HostControls.svelte) whose BODY is a shell this story; the three FR-14 controls
  // (Lives, remove, reassign) are Story 4.2.
  import type { ProjectedTableState } from "@trash/shared";
  import { MIN_PLAYERS } from "@trash/shared";
  import Button from "./Button.svelte";
  import HostControls from "../surfaces/HostControls.svelte";
  import { t } from "../lib/i18n.svelte";
  import { sendDeal, sendDealAgain, sendRevealAll } from "../lib/table-store.svelte";

  // Alias the prop to `tableState` internally: a binding literally named `state` collides with the `$state`
  // rune token used below for the sheet-open toggle (Svelte parses `$state` as auto-subscription to a `state`
  // store). The external prop name stays `state` (App.svelte passes `state={state!}`).
  const { state: tableState }: { state: ProjectedTableState } = $props();

  const isHost = $derived(tableState.you.isHost);
  const canDeal = $derived(tableState.players.length >= MIN_PLAYERS);

  // UI-only local state: whether the ⚙ sheet is open. NOT server/screen state — a transient overlay toggle
  // (the no-client-held-screen rule is about the ROUTED surface deriving from server state). One boolean →
  // the sheet is one level, never stacked two deep (AC-4.1.6).
  let controlsOpen = $state(false);
  // The ⚙ trigger element — focus returns here when the sheet closes (AC-4.1.6 focus management).
  let gearEl = $state<HTMLButtonElement | null>(null);

  function openControls(): void {
    controlsOpen = true;
  }
  function closeControls(): void {
    controlsOpen = false;
    gearEl?.focus(); // return focus to the trigger on close.
  }
</script>

{#if isHost}
  <div class="conductor" data-testid="conductor-bar">
    {#if tableState.phase === "lobby"}
      <Button onclick={() => sendDeal(tableState.phaseToken)} disabled={!canDeal}>{t("DEAL")}</Button>
    {:else if tableState.phase === "allActed"}
      <Button onclick={() => sendRevealAll(tableState.phaseToken)}>{t("SHOWDOWN")}</Button>
    {:else if tableState.phase === "roundResult"}
      <Button onclick={() => sendDealAgain(tableState.phaseToken)}>{t("RE_DEAL")}</Button>
    {/if}

    <!-- The ⚙ controls affordance — a real ≥48dp labelled button; opens the one-level sheet. -->
    <button
      class="icon-button gear"
      type="button"
      aria-label={t("HOST_CONTROLS")}
      aria-haspopup="dialog"
      aria-expanded={controlsOpen}
      bind:this={gearEl}
      onclick={openControls}>⚙</button>
  </div>

  {#if controlsOpen}
    <!-- One-level modal sheet, rendered OUTSIDE the bar element (so the bar holds exactly {primary, ⚙}). -->
    <HostControls state={tableState} onclose={closeControls} />
  {/if}
{/if}

<style>
  /* Bottom-anchored (thumb zone), spanning the surface width with a comfortable max. The host primary
     fills the row; the ⚙ sits to its right. */
  .conductor {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: var(--space-stack-sm);
    width: 100%;
    max-width: 28rem;
    margin: 0 auto;
    padding: var(--space-stack-sm) var(--space-container-padding);
    box-sizing: border-box;
  }
  /* The primary fills the rest of the bar (mirrors the Lobby conductor's flex:1 Deal). */
  .conductor :global(.btn) {
    flex: 1;
  }
  /* The ⚙ gear is the shared `.icon-button` (≥48dp circle, tokens.css); only the glyph size is local. */
  .gear {
    font-size: 1.5rem;
  }
</style>
