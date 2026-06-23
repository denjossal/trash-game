<script lang="ts">
  // HostControls.svelte — the one-level Host Controls modal sheet (Story 4.1 shell + Story 4.2 controls,
  // UX-DR13 / NFR-9 / NFR-10).
  //
  // NOT a routed surface — an OVERLAY the conductor bar (ConductorBar.svelte) opens on top of the non-turn
  // surface beneath (Lobby / Waiting / Round Result), never reachable from Your Turn. routeFromState does
  // NOT return it. It is a SINGLE level — one sheet, never stacked two deep (the bar owns a single `open`
  // boolean) — rendered on `surface-container-high`, closing back to the surface beneath.
  //
  // SCOPE: holds the three FR-14 Host controls (Story 4.2) — the Lives stepper (1–5; the server applies M1
  // "set ongoing, never revive"), the roster with an error-tinted remove-with-confirm per Player, and the
  // "make someone else host" reassign picker. Eyes-Up (G1/NFR-9): ONLY these three controls + the heading +
  // close — NO turn timer, NO activity/event log, NO player-status dashboard, NO ambient/idle content.
  //
  // All sends go through the GATE-1-exempt table-store seams (never socket.send from a surface); the server
  // echo re-projects (the displayed Lives, the roster, the host badge follow the next tableState). Stale /
  // refused copies are swallowed silently (Story 2.2) — NO optimistic local state, NO error toast.
  import type { ProjectedTableState } from "@trash/shared";
  import { MAX_LIVES, MIN_LIVES } from "@trash/shared";
  import LivesPips from "../components/LivesPips.svelte";
  import {
    HOST_CONTROLS,
    LIVES,
    MAKE_HOST,
    PLAYERS,
    REASSIGN_HOST,
    REMOVE,
    confirmRemove,
  } from "../lib/copy";
  import { sendHostRemovePlayer, sendHostReassign, sendHostSetLives } from "../lib/table-store.svelte";

  // Alias the prop to `tableState` internally: a binding named `state` collides with the `$state` rune
  // token (Svelte parses `$state` as auto-subscription to a `state` store). The external prop stays `state`
  // (the bar passes `state={tableState}`).
  const { state: tableState, onclose }: { state: ProjectedTableState; onclose: () => void } = $props();

  // Roster sorted by seat (stable order). The Host's own row shows no remove affordance (self-remove is
  // forbidden — reassign first); every other Player can be removed or made host.
  const players = $derived([...tableState.players].sort((a, b) => a.seatIndex - b.seatIndex));
  const others = $derived(players.filter((p) => p.id !== tableState.hostId));

  // The id pending a remove confirm (a two-step affordance: Remove → Confirm). UI-only local state — the
  // overlay's transient interaction, not a server-held screen (the no-client-screen rule is about the
  // ROUTED surface deriving from server state). Reset whenever the sheet's roster identity could shift.
  let pendingRemoveId = $state<string | null>(null);

  function setLives(next: number): void {
    const clamped = Math.max(MIN_LIVES, Math.min(MAX_LIVES, next));
    if (clamped === tableState.startingLives) return; // value follows the server echo; no-op if unchanged.
    sendHostSetLives(clamped, tableState.phaseToken);
  }

  function askRemove(id: string): void {
    pendingRemoveId = id;
  }
  function confirmRemoveNow(id: string): void {
    pendingRemoveId = null;
    sendHostRemovePlayer(id, tableState.phaseToken);
  }
  function cancelRemove(): void {
    pendingRemoveId = null;
  }
  function makeHost(id: string): void {
    sendHostReassign(id, tableState.phaseToken);
  }

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

    <!-- 1) Lives stepper (1..5). Moved here from the Lobby in Story 4.2 — the ⚙ sheet is the sole home. The
            server applies M1 ("set ongoing, never revive"): a raise tops up alive Players, a lower clamps
            them, an eliminated seat is never revived. -->
    <section class="control" aria-labelledby="hc-lives">
      <h3 id="hc-lives">{LIVES}</h3>
      <div class="stepper" aria-label="Lives stepper">
        <button
          class="step"
          aria-label="Decrease lives"
          disabled={tableState.startingLives <= MIN_LIVES}
          onclick={() => setLives(tableState.startingLives - 1)}>−</button>
        <span class="lives-value" aria-label="Starting lives">{tableState.startingLives}</span>
        <button
          class="step"
          aria-label="Increase lives"
          disabled={tableState.startingLives >= MAX_LIVES}
          onclick={() => setLives(tableState.startingLives + 1)}>+</button>
      </div>
    </section>

    <!-- 2) Roster with an error-tinted remove-with-confirm per Player (never the Host's own row). The remove
            affordance is a two-step: Remove → Confirm {name}? — guarding against an accidental tap. The error
            tint is paired with the "Remove"/"Remove {name}?" label so it never relies on color alone. -->
    <section class="control" aria-labelledby="hc-players">
      <h3 id="hc-players">{PLAYERS}</h3>
      <ul class="roster">
        {#each players as p (p.id)}
          <li class="row" class:disconnected={!p.isConnected}>
            <span class="name">{p.name}</span>
            <LivesPips lives={p.lives} startingLives={tableState.startingLives} />
            {#if p.id !== tableState.hostId}
              {#if pendingRemoveId === p.id}
                <span class="confirm">
                  <button class="danger confirm-yes" type="button" onclick={() => confirmRemoveNow(p.id)}
                    >{confirmRemove(p.name)}</button>
                  <button class="cancel" type="button" aria-label="Cancel remove" onclick={cancelRemove}>✕</button>
                </span>
              {:else}
                <button
                  class="danger"
                  type="button"
                  aria-label={`Remove ${p.name}`}
                  onclick={() => askRemove(p.id)}>{REMOVE}</button>
              {/if}
            {/if}
          </li>
        {/each}
      </ul>
    </section>

    <!-- 3) Reassign host — "make someone else host". Lists every OTHER Player (an eliminated Player is a
            legal target — an eliminated Host keeps conducting). One tap hands off the conductor role. -->
    {#if others.length > 0}
      <section class="control" aria-labelledby="hc-reassign">
        <h3 id="hc-reassign">{REASSIGN_HOST}</h3>
        <ul class="roster">
          {#each others as p (p.id)}
            <li class="row">
              <span class="name">{p.name}</span>
              <button
                class="make-host"
                type="button"
                aria-label={`Make ${p.name} host`}
                onclick={() => makeHost(p.id)}>{MAKE_HOST}</button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
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
    /* Cap to the viewport and scroll INSIDE the sheet: a full roster (header + stepper + remove rows +
       make-host rows) is taller than a phone screen, and the scrim is position:fixed — without this the
       sheet grows PAST the top of the screen and the ✕/Lives controls become unreachable (no page scroll).
       dvh tracks the mobile browser chrome better than vh. [Playtest 2026-06-23 — top controls cut off.] */
    max-height: 90dvh;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--space-stack-md) var(--space-container-padding);
    background: var(--color-surface-container-high);
    border-top-left-radius: var(--radius-md);
    border-top-right-radius: var(--radius-md);
  }
  /* Narrow phones (≤24rem ≈ 384px): the fixed 32px side padding starves inner width so the ≥48dp
     stepper (− value +) and the roster rows' fixed-size controls jam/clip. Halve the side padding to
     recover ~32px of usable width. [Playtest 2026-06-23 — phone stepper misrender.] */
  @media (max-width: 24rem) {
    .sheet {
      padding-left: var(--space-stack-sm);
      padding-right: var(--space-stack-sm);
    }
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
    /* Keep the title + ✕ pinned while the sheet body scrolls, so Close is always reachable on a tall
       roster. Negative margins + padding let the sticky bar span the sheet's full width over its padding. */
    position: sticky;
    top: 0;
    z-index: 1;
    margin: calc(-1 * var(--space-stack-md)) calc(-1 * var(--space-container-padding)) 0;
    padding: var(--space-stack-md) var(--space-container-padding) var(--space-stack-sm);
    background: var(--color-surface-container-high);
  }
  @media (max-width: 24rem) {
    .head {
      margin-left: calc(-1 * var(--space-stack-sm));
      margin-right: calc(-1 * var(--space-stack-sm));
      padding-left: var(--space-stack-sm);
      padding-right: var(--space-stack-sm);
    }
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

  /* --- The three FR-14 controls (Story 4.2). Each is a labelled section; the sheet stays short (no scroll
         of ambient content — Eyes-Up). --- */
  .control {
    margin-top: var(--space-stack-md);
  }
  h3 {
    font-family: var(--font-family-display);
    font-size: var(--type-body-lg-size);
    font-weight: var(--type-body-lg-weight);
    margin: 0 0 var(--space-stack-sm);
    color: var(--color-on-surface-variant);
  }

  /* Lives stepper — same shape as the (now-removed) Lobby stepper, moved here in Story 4.2. */
  .stepper {
    display: flex;
    align-items: center;
    gap: var(--space-stack-sm);
    padding: 0 var(--space-stack-sm);
    background: var(--color-surface-container-highest);
    border-radius: var(--radius-full);
    width: fit-content;
  }
  .step {
    width: 48px;
    height: 48px; /* >= 48dp */
    border: none;
    border-radius: var(--radius-full);
    background: var(--color-surface-container-high);
    color: var(--color-on-surface);
    font-family: var(--font-family-display);
    font-size: var(--type-headline-lg-mobile-size);
    cursor: pointer;
  }
  .step:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .step:focus-visible {
    outline: var(--stroke-active);
    outline-offset: 2px;
  }
  .lives-value {
    min-width: 1.5rem;
    text-align: center;
    font-family: var(--font-family-display);
    font-size: var(--type-headline-lg-mobile-size);
    font-weight: var(--type-headline-lg-mobile-weight);
    color: var(--color-secondary-container);
  }

  /* Roster rows (shared by the remove + reassign lists). */
  .roster {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-stack-sm);
  }
  .row {
    display: flex;
    align-items: center;
    flex-wrap: wrap; /* On narrow phones the remove/make-host control drops to a 2nd line instead of clipping. */
    gap: var(--space-stack-sm);
    min-height: 56px;
    padding: var(--space-stack-sm) var(--space-gutter);
    background: var(--color-surface-container);
    border-radius: var(--radius-md);
  }
  .name {
    flex: 1;
    font-size: var(--type-body-lg-size);
    color: var(--color-on-surface);
  }
  /* A disconnected-but-present Player reads dimmed (AR-15 state pattern) — the Host conducts around them. */
  .row.disconnected .name {
    opacity: 0.55;
  }

  /* Error-tinted remove affordance (DESIGN.md:186). Never color alone — the label ("Remove" / "Remove
     {name}?") carries the meaning; the error ramp + a border reinforce it. ≥48dp. */
  .danger {
    min-height: 48px;
    padding: 0 var(--space-gutter);
    border: 1px solid var(--color-error);
    border-radius: var(--radius-md);
    background: var(--color-error-container);
    color: var(--color-on-error-container);
    font-size: var(--type-body-lg-size);
    cursor: pointer;
  }
  .danger:focus-visible {
    outline: var(--stroke-active);
    outline-offset: 2px;
  }
  .confirm {
    display: flex;
    align-items: center;
    gap: var(--space-stack-sm);
  }
  .cancel {
    min-width: 48px;
    min-height: 48px;
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-on-surface);
    cursor: pointer;
  }
  .cancel:focus-visible {
    outline: var(--stroke-active);
    outline-offset: 2px;
  }

  /* Reassign — a calm secondary action (not destructive). ≥48dp. */
  .make-host {
    min-height: 48px;
    padding: 0 var(--space-gutter);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-md);
    background: var(--color-surface-container-highest);
    color: var(--color-on-surface);
    font-size: var(--type-body-lg-size);
    cursor: pointer;
  }
  .make-host:focus-visible {
    outline: var(--stroke-active);
    outline-offset: 2px;
  }
</style>
