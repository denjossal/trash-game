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
  import type { ProjectedTableState } from "@trash/shared";
  import { ELIMINATED } from "../lib/copy";
  // A pure props surface — a spectator emits no intents, so there is no store/socket import and no
  // action button. The warm line is the same for any eliminated Player, so `state` is unused here.
  const { state }: { state: ProjectedTableState } = $props();
  // svelte-ignore state_referenced_locally
  void state;

  // Split the single source line into the lead/subline visual halves. `tail` falls back to "" so a
  // future copy edit that drops/changes the " — " separator degrades to a lead-only line rather than
  // rendering the literal "undefined" — the string in copy.ts stays the source of truth (UX-DR16).
  const [lead, tail = ""] = ELIMINATED.split(" — ");
</script>

<!-- `<main>` stays a bare landmark (matching every sibling surface). The warm-copy block is the live
     region: SR users hear the visible copy verbatim (one source, matching tone). polite — a calm
     sideline transition, never the punishing "Don't" voice. -->
<main class="surface">
  <div role="status" aria-live="polite">
    <h1>{lead}.</h1>
    <p>{tail}</p>
  </div>
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
</style>
