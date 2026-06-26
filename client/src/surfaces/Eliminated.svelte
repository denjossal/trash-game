<script lang="ts">
  // Eliminated.svelte — the spectator surface (Story 3.5, FR-11, UX-DR11/UX-DR16). Routed when this
  // device is out of Lives: at a live phase (`!you.isAlive` overrides turns/waiting/roundResult —
  // route-from-state.ts:56) or at gameOver as a non-winner (:48). It is a SIDELINE SPECTATOR surface,
  // NEVER a dead-end: warm tease copy, no actions. The eliminated Player is NOT dropped from the room —
  // they keep receiving every projection and STILL watch the loud beat (the showdown||revealed branch,
  // route-from-state.ts:53, is evaluated before :56). The "no actions / skipped in turn order" steady
  // state is enforced upstream (nextAliveSeat skips !isAlive seats → they never become currentTurnId →
  // never route to yourTurn → no buttons); this surface simply never renders an action.
  //
  // The visible copy is the shared voice line (copy.ts, the single source of truth — UX-DR16). The line
  // is one warm sentence ("You're out — stick around and heckle."); we keep a lead/subline visual split
  // by splitting that single source string on its em-dash, so the string stays the source of truth.
  //
  // SR ANNOUNCE (AC-3.5.2, review-accessibility.md:93-94): the warm copy lives in a `role="status"`
  // aria-live region so a screen-reader user hears the SAME warm copy verbatim — never a punishing
  // string. `polite` (not `assertive`): elimination is a calm sideline transition, not an urgent turn
  // prompt (contrast YourTurn's assertive turn-announce). The region is the visible copy block (the
  // lead+subline wrapper), NOT the `<main>` itself — putting `role="status"` on `<main>` would clobber
  // its implicit `main` landmark. This matches every sibling surface (YourTurn/Showdown/Waiting/
  // RoundResult all keep a bare `<main class="surface">` and announce from a child), and still keeps
  // ONE source: the announced text IS the visible warm copy, no hidden duplicate that could drift.
  // ONE-MORE (Story 3.6, AC-3.6.4, AR-5): the router sends only the WINNER to the Winner surface at
  // gameOver; every non-winner — INCLUDING a non-winning/eliminated Host — routes here. Because the Host
  // conductor role is independent of isAlive/winning (architecture.md:335-336, "an eliminated Host keeps
  // conducting"), a Host at gameOver gets the SAME "one more?" action the Winner surface offers, so the
  // night can flow into another game even if the Host lost. Gated on `you.isHost && phase === "gameOver"`:
  // a non-Host eliminated player, and the Host at a LIVE phase (mid-game elimination — no new game to start
  // yet), see the calm spectator surface UNCHANGED (no action). sendNewGame is the GATE-1-exempt store seam
  // (NEVER socket.send from a surface) — the only egress here, behind the Host+gameOver gate.
  import type { ProjectedTableState } from "@trash/shared";
  import Button from "../components/Button.svelte";
  import { t } from "../lib/i18n.svelte";
  import { sendNewGame } from "../lib/table-store.svelte";

  const { state }: { state: ProjectedTableState } = $props();

  // Split the single source line into the lead/subline visual halves. `tail` falls back to "" so a
  // future copy edit that drops/changes the " — " separator degrades to a lead-only line rather than
  // rendering the literal "undefined" — the dictionary string (i18n.svelte) stays the source of truth.
  // `$derived` so a language switch re-splits the localized line. (UX-DR16.)
  const parts = $derived(t("ELIMINATED").split(" — "));
  const lead = $derived(parts[0]);
  const tail = $derived(parts[1] ?? "");

  // A non-winning Host at the terminal phase conducts "one more"; otherwise this stays a pure spectator
  // surface (no action). Both conditions matter: phase gates out mid-game elimination, isHost gates out
  // a regular eliminated spectator.
  const canStartNewGame = $derived(state.you.isHost && state.phase === "gameOver");
</script>

<!-- `<main>` stays a bare landmark (matching every sibling surface). The warm-copy block is the live
     region: SR users hear the visible copy verbatim (one source, matching tone). polite — a calm
     sideline transition, never the punishing "Don't" voice. -->
<main class="surface">
  <div role="status" aria-live="polite">
    <h1>{lead}.</h1>
    <p>{tail}</p>
  </div>

  {#if canStartNewGame}
    <!-- A non-winning Host keeps conducting (AR-5): one tap starts a fresh game on the same Table. Inline
         Host-only block mirroring the Winner/Showdown one-more pattern (the shared conductor-bar component
         is Story 4.1). Absent for a non-Host spectator and at any live phase. -->
    <div class="one-more" data-testid="newgame-host">
      <Button onclick={() => sendNewGame(state.phaseToken)}>{t("ONE_MORE")}</Button>
    </div>
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
  }
  h1 {
    font-family: var(--font-family-display);
    font-size: var(--type-headline-lg-size);
    font-weight: var(--type-headline-lg-weight);
    line-height: var(--type-headline-lg-line);
    margin: 0 0 var(--space-base);
    color: var(--color-on-surface);
  }
  p {
    font-size: var(--type-body-lg-size);
    font-weight: var(--type-body-lg-weight);
    color: var(--color-on-surface-variant);
    margin: 0;
  }
  .one-more {
    margin-top: var(--space-stack-md);
  }
</style>
