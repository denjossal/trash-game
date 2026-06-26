<script lang="ts">
  // Winner.svelte — the end-of-game celebration (Story 3.6, FR-12, UX-DR12, UX-DR16). Routed at gameOver
  // for the winner (route-from-state.ts:48 — `winnerIds` includes this device's playerId; a non-winner,
  // incl. a non-winning Host, routes to Eliminated instead). It shows the warm "{name} wins it. One more?"
  // line and offers the Host a single "one more?" tap that starts a NEW game on the same Table.
  //
  // CO-WINNERS (AC-3.6.1): a shared win (0 alive, all tied to zero) puts multiple ids in winnerIds. We name
  // ALL of them, joined into the SINGLE `name` slot of the shared `winner(name)` copy — one source string,
  // no separate plural line (UX-DR16 single-source voice).
  //
  // HOST-ONLY "ONE MORE" (AC-3.6.2/.4/.5): only the Host conducts the transition. The Host sees the action
  // Button (→ sendNewGame, the GATE-1-exempt store seam — NEVER socket.send from a surface); a non-Host
  // winner (a co-winner who is not the Host) sees a calm role=status aria-live=polite waiting line instead,
  // never a dead/disabled button. (A non-winning Host reaches the same one-more action on the Eliminated
  // surface — AR-5, eliminated/non-winning Host keeps conducting.) Gated on phase==="gameOver" so a stray
  // render outside the terminal phase shows no action.
  //
  // SM-1 (AC-3.6.6): exactly ONE tap to a fresh lobby — NO stats / streak / score-history / countdown /
  // leaderboard. The surface holds only the celebration + the one action (or the non-Host waiting line).
  import type { ProjectedTableState } from "@trash/shared";
  import Button from "../components/Button.svelte";
  import { t } from "../lib/i18n.svelte";
  import { sendNewGame } from "../lib/table-store.svelte";

  const { state }: { state: ProjectedTableState } = $props();

  // The winner name(s), in seat order. A shared win names every co-winner; a sole win is a single name.
  const winnerNames = $derived(
    state.players.filter((p) => state.winnerIds?.includes(p.id)).map((p) => p.name),
  );

  // Join the names into the one `name` slot, with language-grammatical connectors (en "Ana and Ben" /
  // es "Ana y Ben") — the join lives in the i18n dictionary (Story 7.4), not here. Falls back to a bare
  // localized "Winner!" only defensively (a real gameOver always has at least one winner in winnerIds).
  const joinedName = $derived(winnerNames.length === 0 ? "" : t("joinNames", { names: winnerNames }));

  const isHost = $derived(state.you.isHost);
  // The one-more action is offered ONLY at the terminal phase (defensive — this surface only routes there).
  const canStartNewGame = $derived(state.phase === "gameOver");
</script>

<main class="surface">
  <h1>{joinedName ? t("winner", { name: joinedName }) : t("WINNER_FALLBACK")}</h1>

  {#if canStartNewGame}
    <!-- One-more beat: Host-only primary action (one tap → a fresh game on the same Table); a non-Host
         winner waits. Inline Host-only block mirroring the Showdown/RoundResult Re-deal pattern (the shared
         conductor-bar component is Story 4.1). -->
    {#if isHost}
      <div class="one-more" data-testid="newgame-host">
        <Button onclick={() => sendNewGame(state.phaseToken)}>{t("ONE_MORE")}</Button>
      </div>
    {:else}
      <p class="one-more-waiting" data-testid="newgame-waiting" role="status" aria-live="polite">
        {t("WAITING_TO_NEW_GAME")}
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
    box-sizing: border-box;
    gap: var(--space-stack-md);
    text-align: center;
  }
  h1 {
    font-family: var(--font-family-display);
    font-size: var(--type-display-lg-size);
    font-weight: var(--type-display-lg-weight);
    line-height: var(--type-display-lg-line);
    letter-spacing: var(--type-display-lg-tracking);
    margin: 0;
    color: var(--color-secondary-container);
  }
  .one-more {
    margin-top: var(--space-stack-sm);
  }
  .one-more-waiting {
    margin: var(--space-stack-sm) 0 0;
    font-size: var(--type-body-lg-size);
    font-weight: var(--type-body-lg-weight);
    color: var(--color-on-surface-variant);
  }
</style>
