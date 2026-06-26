<script lang="ts">
  // Waiting.svelte — the calmest surface (Story 2.4, FR-6, UX-DR6, NFR-9). Routed during a live round
  // when it is NOT your turn (route-from-state.ts: phase "turns"/"dealing"/"allActed", currentTurnId !==
  // you). Shows the active Player's name in a STATIC frame (no pulse, no motion), YOUR OWN Lives, and —
  // since Story 6.1 — a press-and-hold peek of YOUR OWN card. Never any other Player's card, nothing to
  // scroll (UX-DR6 / NFR-9).
  //
  // OFF-TURN PEEK (Story 6.1, FR-20, UX-DR20): the calm surface gains the SAME press-and-hold peek the
  // active Player has on Your Turn (Story 2.5) — so a waiting Player can study their own card as the swap
  // chain crawls toward them. The card is HELD-only (never an always-on display): hidden by default, shown
  // only while the control is held, re-hidden on release/leave/cancel/blur/background. This reverses the
  // 2.4/2.5 decision that Waiting deliberately showed no card — v2 makes the OWN card peekable here too.
  //
  // PRIVACY: the projection omits non-owner hands; the caller's OWN `you.hand` is ALREADY delivered on
  // every push REGARDLESS of whose turn it is (project-state.ts sets you.hand from round.hands[you]
  // unconditionally — the turn only gates ACTIONS). So this is a pure CLIENT display of on-device data:
  // no server/projection/contract change, the standing SM-6 test is untouched. The peek is LOCAL UI-only
  // state, never sent (there is no peek intent — architecture.md:556). The on-turn peek (YourTurn) and this
  // off-turn peek share the SAME <Peek> component (one lifecycle) and are mutually exclusive by surface
  // (route-from-state.ts:63-64) — never doubled.
  import type { ProjectedTableState } from "@trash/shared";
  import LivesPips from "../components/LivesPips.svelte";
  import Peek from "../components/Peek.svelte";
  import { t } from "../lib/i18n.svelte";

  const { state: proj }: { state: ProjectedTableState } = $props();

  // The active Player's name (whose turn it is). Falls back to a warm neutral if not yet resolvable.
  const activeName = $derived(proj.players.find((p) => p.id === proj.currentTurnId)?.name ?? "");
  // The caller's OWN seat — for their Lives pips (find self via you.playerId).
  const self = $derived(proj.players.find((p) => p.id === proj.you.playerId));
  // Value-free squirm signal (AC-2.4.3): a mid-pass swap advances the turn to the receiver, so they
  // normally see this beat on Your Turn. But the FINAL swap of the pass completes it (phase → allActed,
  // currentTurnId cleared), routing the receiver HERE instead — so Waiting must render it too, or the
  // last-swap receiver silently loses the "someone swapped with you" moment. Carries NO card data (SM-6).
  const justSwapped = $derived(proj.justReceivedSwap === true);
</script>

<main class="surface">
  <h1 class="active">{activeName ? t("activeTurn", { name: activeName }) : t("HANG_TIGHT")}</h1>

  {#if justSwapped}
    <p class="squirm" role="status" aria-live="polite">{t("JUST_SWAPPED")}</p>
  {/if}

  {#if self}
    <div class="lives" aria-label={t("YOUR_LIVES")}>
      <LivesPips lives={self.lives} startingLives={proj.startingLives} />
    </div>
  {/if}

  <!-- Off-turn peek (Story 6.1): the owner's own secret Card via the shared <Peek> control — a
       face-down neon back at rest, the Display-XL face only while held. Guarded on you.hand so an
       early/odd projection can't throw (and so an eliminated/hand-less seat shows no peek). Subordinate
       to the calm name + Lives (NFR-9). -->
  {#if proj.you.hand}
    <Peek card={proj.you.hand} />
  {/if}
</main>

<style>
  /* The calmest surface: centered, INERT frame (NOT the active neon stroke), no motion. */
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
    border: var(--border-inert); /* static, inert — deliberately NOT --stroke-active, NO pulse. */
  }
  .active {
    margin: 0;
    font-family: var(--font-family-display);
    font-size: var(--type-headline-lg-size);
    font-weight: var(--type-headline-lg-weight);
    line-height: var(--type-headline-lg-line);
    color: var(--color-on-surface);
  }
  .squirm {
    margin: 0;
    font-size: var(--type-body-lg-size);
    font-weight: var(--type-body-lg-weight);
    color: var(--color-on-surface);
  }
  .lives {
    display: flex;
    justify-content: center;
  }
</style>
