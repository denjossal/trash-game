<script lang="ts">
  // HostControls.svelte — the one-level Host Controls modal sheet (Story 4.1, UX-DR13 / NFR-9 / NFR-10).
  //
  // NOT a routed surface — an OVERLAY the conductor bar (ConductorBar.svelte) opens on top of the non-turn
  // surface beneath (Lobby / Waiting / Round Result), never reachable from Your Turn. routeFromState does
  // NOT return it. It is a SINGLE level — one sheet, never stacked two deep (the bar owns a single `open`
  // boolean) — rendered on `surface-container-high`, closing back to the surface beneath.
  //
  // SCOPE (Story 4.1): the SHELL only — open/close, focus management, Escape, the heading. The three FR-14
  // controls it will hold (the Lives stepper, remove a Player, reassign Host) are Story 4.2 (which also
  // settles the open product decision M1: hostSetLives clamp-vs-top-up). Eyes-Up (G1/NFR-9): this overlay
  // holds ONLY the (future) phase-appropriate controls — NO turn timer, NO activity/event log, NO
  // player-status dashboard, NO ambient/idle content.
  import type { ProjectedTableState } from "@trash/shared";
  import { HOST_CONTROLS } from "../lib/copy";

  // Alias the prop to `tableState` internally: a binding named `state` collides with the `$state` rune
  // token (Svelte parses `$state` as auto-subscription to a `state` store). The external prop stays `state`
  // (the bar passes `state={tableState}`). The roster/Lives these controls act on arrive in Story 4.2 — the
  // prop is in the contract now; `seatCount` is a trivial read so the prop isn't flagged unused before 4.2.
  const { state: tableState, onclose }: { state: ProjectedTableState; onclose: () => void } = $props();
  const seatCount = $derived(tableState.players.length);

  let sheetEl = $state<HTMLDivElement | null>(null);

  // Move focus into the sheet on mount (AC-4.1.6); focus returns to the ⚙ trigger in the bar's closeControls.
  $effect(() => {
    sheetEl?.focus();
  });

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.stopPropagation();
      onclose();
      return;
    }
    // Focus trap (AC-4.1.6): an aria-modal dialog must keep keyboard focus inside the sheet — without this,
    // Tab escapes to the conductor bar (Deal/⚙) behind the scrim, defeating the modal. Wrap focus across the
    // sheet's tabbable elements (the sheet itself has tabindex=-1 and is only a programmatic focus target, so
    // it's excluded from the cycle). The shell holds just the close button today; the future 4.2 controls
    // join the same cycle automatically since the list is queried live on each Tab.
    if (e.key === "Tab" && sheetEl) {
      const tabbable = sheetEl.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (tabbable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = tabbable[0];
      const last = tabbable[tabbable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === sheetEl)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
</script>

<!-- A one-level modal sheet. The scrim sits behind; clicking it OR the close button closes back to the
     surface beneath. role="dialog" + aria-modal + the labelled heading give SR users role + state. -->
<div class="scrim" role="presentation" onclick={onclose}>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="sheet"
    role="dialog"
    aria-modal="true"
    aria-label={HOST_CONTROLS}
    tabindex="-1"
    bind:this={sheetEl}
    onkeydown={onKeydown}
    onclick={(e) => e.stopPropagation()}
  >
    <header class="head">
      <h2>{HOST_CONTROLS}</h2>
      <button class="icon-button close" type="button" aria-label="Close host controls" onclick={onclose}>✕</button>
    </header>
    <!-- The three FR-14 controls (Lives stepper, remove Player, reassign Host) land in Story 4.2. This is
         the shell that holds them. (seatCount is a benign read so the `state` prop isn't unused pre-4.2.) -->
    <p class="placeholder">{seatCount} at the table. More controls coming soon.</p>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 20; /* above the conductor bar */
    display: flex;
    align-items: flex-end; /* sheet rises from the bottom (thumb zone) */
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
  }
  .sheet {
    width: 100%;
    max-width: 28rem;
    box-sizing: border-box;
    padding: var(--space-stack-md) var(--space-container-padding);
    background: var(--color-surface-container-high);
    border-top-left-radius: var(--radius-md);
    border-top-right-radius: var(--radius-md);
  }
  .sheet:focus-visible {
    outline: var(--stroke-active);
    outline-offset: -4px;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-stack-sm);
  }
  h2 {
    font-family: var(--font-family-display);
    font-size: var(--type-headline-lg-mobile-size);
    font-weight: var(--type-headline-lg-mobile-weight);
    line-height: var(--type-headline-lg-mobile-line);
    margin: 0;
    color: var(--color-on-surface);
  }
  /* The ✕ close is the shared `.icon-button` (≥48dp circle, tokens.css); only the glyph size is local. */
  .close {
    font-size: 1.25rem;
  }
  .placeholder {
    margin: var(--space-stack-md) 0 0;
    color: var(--color-on-surface-variant);
    font-size: var(--type-body-lg-size);
  }
</style>
