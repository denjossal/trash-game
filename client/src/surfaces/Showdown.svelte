<script lang="ts">
  // Showdown.svelte — the loud beat (Story 3.3, FR-9/FR-10, UX-DR9, NFR-6/NFR-10). Routed at the
  // simultaneous reveal (route-from-state: phase "showdown" || revealed) for EVERY device, including an
  // eliminated spectator. Renders every seat's Card FACE-UP — the hands are in the projection only
  // because `revealed === true` (Story 3.2 made `round.revealed` reachable; SM-6 EXTENDED, not weakened).
  //
  // SAFE FLIP (AC-3.3.1, UX-DR9/NFR-6): all cards flip face-up TOGETHER via a single coordinated ≤400ms
  // CSS animation — no strobe, nothing >3×/second, no full-viewport flash. Under prefers-reduced-motion
  // the flip + the loser scale are dropped (cards appear face-up instantly; loser by stroke + position
  // only) — the SAME pure-CSS @media pattern as Button.svelte / YourTurn.svelte (no JS matchMedia branch).
  //
  // LOSER HIGHLIGHT (AC-3.3.2) — a CONSUMER of `state.loserIds`. The PRODUCER is Story 3.4 (resolveShowdown
  // → projection sets loserIds); `loserIds` is currently UNSET, so at today's bare `showdown` (3.2's output)
  // NOTHING is highlighted/receded — all cards render plain face-up. Once 3.4 populates loserIds the SAME
  // surface lights up the loser(s) in the error ramp (stroke + scale + position, never color alone — NFR-10)
  // and recedes non-losers to 70% opacity. (Mirrors how projectStateFor's `revealed` branch was pre-built
  // in Story 1.4 and only became reachable later.) [Source: epics.md#Story 3.3/3.4; DESIGN.md 172-177.]
  //
  // SCOPE (AC-3.3.6): client surface ONLY. NO resolveShowdown call, NO loserIds/winnerIds producer, NO
  // Lives/elimination, NO RoundResult/Re-deal (3.4) or Eliminated/Winner (3.5/3.6), NO produced FX, NO
  // types.ts/projection/server change.
  // RE-DEAL AFFORDANCE (Story 3.4 / 4.1): because resolve-at-reveal KEEPS the round, a resolved
  // `roundResult` projection still has revealed===true and routes HERE (route-from-state.ts:53). When the
  // phase is `roundResult` (≥2 alive, re-dealable) the HOST'S Re-deal primary now lives in the shared
  // conductor bar (Story 4.1, ConductorBar.svelte, mounted as an overlay by App.svelte) — the inline Host
  // Re-deal block that lived here was removed. The NON-HOST "waiting to re-deal" line STAYS on this surface:
  // the bar is Host-only, so non-Hosts would otherwise have no cue. ABSENT at `gameOver` — that projection
  // routes to winner/eliminated (route-from-state.ts:48 wins over :53), never here (the terminal beat is
  // Stories 3.6/3.5). [Source: epics.md#Story 3.4/4.1; UX-DR10/UX-DR14.]
  import type { ProjectedTableState } from "@trash/shared";
  import Card from "../components/Card.svelte";
  import { loser, TIE, WAITING_TO_REDEAL } from "../lib/copy";

  const { state }: { state: ProjectedTableState } = $props();

  // The non-Host "waiting to re-deal" line is shown ONLY at `roundResult` (the ≥2-alive branch). At a bare
  // `showdown` (no resolution yet — pre-3.4 dormant path) or `gameOver` (terminal, routed elsewhere) it is
  // absent. The Host's Re-deal action is the conductor bar's (Story 4.1), not on this surface.
  const canReDeal = $derived(state.phase === "roundResult");
  const isHost = $derived(state.you.isHost);

  // The loser set — a value-free snapshot field (absent until Story 3.4's producer). Empty today. A Set
  // so the per-seat membership test (each-block) and the derivations below are O(1), not repeated scans.
  const loserIds: Set<string> = $derived(new Set(state.loserIds ?? []));
  const hasLosers = $derived(loserIds.size > 0);

  // All-tied: every loser seat shown on this surface IS the whole field of shown players (and there IS at
  // least one loser). We compare against the SAME players[] the per-seat highlight keys off — not a
  // separately-filtered `alive` set — so the TIE-vs-individual copy can never disagree with which cards
  // are lit. [Source: epics.md#Story 3.3 AC; DESIGN.md "everybody drops a life".]
  const allTied = $derived(hasLosers && state.players.length > 0 && state.players.every((p) => loserIds.has(p.id)));

  // This device's own seat (may be absent for a spectator whose playerId maps to no seat). The warm copy
  // is gated on the seat actually existing so it never renders with an empty name.
  const ownSeat = $derived(state.players.find((p) => p.id === state.you.playerId));

  // This device's own seat lost (and it is NOT the all-tied case → the individual warm tease). Requires the
  // seat to be present in players[] so `loser(name)` always has a real name.
  const youLost = $derived(hasLosers && !allTied && ownSeat !== undefined && loserIds.has(ownSeat.id));
</script>

<main class="surface">
  <h1>Showdown.</h1>

  <ul class="cards" aria-label="Every player's card">
    {#each state.players as p (p.id)}
      {@const isLoser = loserIds.has(p.id)}
      <!-- `data-flip` / `data-loser` / `data-receded` are FX-ready, addressable markers decoupled from the
           CSS (AC-3.3.4) — a v1.1 produced-FX layer can target the loser/flipping card without rework. The
           reduce-motion skip itself is pure CSS keyed off `.card-frame` / `.seat`, not these attributes. -->
      <li
        class="seat"
        class:loser={isLoser}
        class:receded={hasLosers && !isLoser}
        data-flip="true"
        data-loser={isLoser ? "true" : undefined}
        data-receded={hasLosers && !isLoser ? "true" : undefined}
      >
        <div class="card-frame">
          {#if p.hand}
            <!-- Reuse the display-only Card.svelte (Story 2.5, built reusable for Showdown). -->
            <Card card={p.hand} revealed={true} />
          {:else}
            <!-- Defensive: a seat may lack a hand only via the 3.2-deferred project-state.ts:61 edge
                 (eliminated seat in players[] while revealed — Story 3.4). Render face-down, never throw. -->
            <Card card={{ rank: 1, suit: "♠" }} revealed={false} />
          {/if}
        </div>
        <span class="name">{p.name}</span>
      </li>
    {/each}
  </ul>

  {#if allTied}
    <p class="loser-copy tie" role="status" aria-live="polite">{TIE}</p>
  {:else if youLost && ownSeat}
    <p class="loser-copy" role="status" aria-live="polite">{loser(ownSeat.name)}</p>
  {/if}

  {#if canReDeal && !isHost}
    <!-- Re-deal beat (Story 3.4 / 4.1): the HOST'S Re-deal action is the conductor bar's (overlay, Story
         4.1). Non-Hosts get the waiting line here so they still have a cue. Absent at gameOver. -->
    <p class="redeal-waiting" data-testid="redeal-waiting" role="status" aria-live="polite">
      {WAITING_TO_REDEAL}
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
    box-sizing: border-box;
    gap: var(--space-stack-md);
    text-align: center;
  }
  h1 {
    font-family: var(--font-family-display);
    font-size: var(--type-headline-lg-size);
    font-weight: var(--type-headline-lg-weight);
    line-height: var(--type-headline-lg-line);
    margin: 0;
    color: var(--color-on-surface);
  }

  /* Every seat's card, laid out together; they flip in unison (one coordinated beat). */
  .cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: center;
    gap: var(--space-stack-sm);
    width: 100%;
  }
  .seat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-stack-sm);
    /* Each seat carries the card width cap from Card.svelte; keep them compact across up to 20 seats. */
    flex: 0 1 8rem;
    max-width: 10rem;
    /* The settle/recede transition (opacity + transform) — neutralised under reduce-motion below. */
    transition:
      opacity 200ms ease,
      transform 200ms ease;
  }

  /* SAFE COORDINATED FLIP (AC-3.3.1): a single ≤400ms reveal — no strobe, no full-viewport flash. The
     animation runs once on mount (the surface only mounts when revealed is true), so all cards flip
     together. Kept to opacity + a gentle Y-rotation so nothing flashes >3×/second. */
  .card-frame {
    width: 100%;
    animation: flip-in 360ms ease-out both;
    transform-origin: center;
  }
  @keyframes flip-in {
    from {
      opacity: 0;
      transform: rotateY(90deg);
    }
    to {
      opacity: 1;
      transform: rotateY(0deg);
    }
  }

  .name {
    font-family: var(--font-family-display);
    font-size: var(--type-body-lg-size);
    font-weight: var(--type-body-lg-weight);
    color: var(--color-on-surface);
  }

  /* LOSER HIGHLIGHT (AC-3.3.2): error ramp, thick stroke + gentle scale-up + position — never colour
     alone. The stroke wraps the card frame so it reads even if colour is imperceptible. box-sizing keeps
     the 4px border inside the frame so a loser card stays the same footprint as its neighbours. */
  .seat.loser .card-frame {
    box-sizing: border-box;
    border: var(--stroke-active-width) solid var(--color-error);
    border-radius: var(--radius-md);
    background: var(--color-error-container);
  }
  /* The scale-up lives on .seat, NOT .card-frame: the flip-in animation owns .card-frame's transform with
     fill `both`, so a scale set there would be overridden by the retained rotateY(0deg). .seat carries the
     transform transition above and is untouched by the animation, so the scale reads. Dropped under reduce-motion. */
  .seat.loser {
    transform: scale(1.06); /* gentle scale-up — dropped under reduce-motion */
  }
  /* RECEDED non-losers (AC-3.3.2): dim to 70% opacity — never lower, so faces stay >= 4.5:1 legible. */
  .seat.receded {
    opacity: 0.7;
  }

  .loser-copy {
    margin: 0;
    font-size: var(--type-body-lg-size);
    font-weight: var(--type-body-lg-weight);
    color: var(--color-on-surface);
  }
  .loser-copy.tie {
    color: var(--color-error);
  }

  /* Re-deal beat (Story 3.4 / 4.1): the non-Host waiting line below the cards (the Host's Re-deal action is
     the conductor bar's). */
  .redeal-waiting {
    margin: var(--space-stack-sm) 0 0;
    font-size: var(--type-body-lg-size);
    font-weight: var(--type-body-lg-weight);
    color: var(--color-on-surface-variant);
  }

  /* REDUCE MOTION (AC-3.3.1/.2): skip the flip (instant face-up) and the loser scale-up (highlight by
     stroke + position only) and the recede transition. Same pure-CSS pattern as Button/YourTurn. */
  @media (prefers-reduced-motion: reduce) {
    .card-frame {
      animation: none;
    }
    .seat {
      transition: none;
    }
    .seat.loser {
      transform: none;
    }
  }
</style>
