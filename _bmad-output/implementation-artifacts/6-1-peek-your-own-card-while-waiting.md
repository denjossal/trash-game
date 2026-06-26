---
baseline_commit: 56ff598
---

# Story 6.1: Peek your own Card while waiting

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Player whose Turn it isn't (waiting to act, or already acted),
I want to press and hold to peek my own Card on the Waiting surface,
so that I can track what I'm holding as the swap chain crawls toward me — without ever exposing it to anyone else.

## Acceptance Criteria

> Source ACs verbatim from [epics.md#Story 6.1] (Epic 6). The "**Then**" clauses are the binding contract; the AC IDs are this story's addressing scheme. This story EXTENDS Story 2.5's peek (YourTurn surface) onto the **Waiting** surface — the mechanic, safety behaviors, and SR path are the 2.5 contract re-applied to a second surface. It is **CLIENT-ONLY, zero-contract-change** (FR-20; PRD §11.3).

**AC-6.1.1 — Press-and-hold on Waiting reveals own Card (Display-XL); release re-hides immediately; identical to the 2.5 on-Turn peek (FR-20, UX-DR20)**
Given the Waiting surface (any Player whose Turn it currently is NOT — both not-yet-acted and already-acted),
When the Player presses and holds the peek control,
Then their own Card shows as a **big rank + single suit pip (Display-XL)**, and on **release it re-hides immediately** — identical behavior to the on-Turn peek (Story 2.5 / UX-DR7); it is **never shown persistently**.

**AC-6.1.2 — Peeked Card auto-hides on lost focus / app-background (FR-20)**
Given a peeked Card on the Waiting surface and a distraction,
When the control **loses focus** or the app is **backgrounded**,
Then the Card **auto-hides** (a phone set down while waiting never exposes a hand). *(Verified via manual/Playwright — `blur`/`visibilitychange`/`pagehide` are not deterministic in jsdom; per the Story 2.5 precedent.)*

**AC-6.1.3 — Peek always shows the Player's CURRENT card, including after a received swap (FR-20)**
Given the Player's current Card (after a Swap moved a new Card into their hand),
When they peek on the Waiting surface,
Then the peek shows their **CURRENT card** (the newly-received one), not a stale snapshot — because the projection already delivers the owner their up-to-date `you.hand` on every state push.

**AC-6.1.4 — Hidden default keeps Waiting the calmest surface; rank NOT in the a11y tree while hidden (FR-20, NFR-9, UX-DR6, UX-DR20)**
Given the hidden (default) state on the Waiting surface,
When the surface renders,
Then the Card is **NOT shown** (the Waiting surface stays the calmest surface — only the active Player's name + your own Lives + the peek affordance; **no always-on card, no motion, nothing to scroll**), and the **rank is NOT present in the accessibility tree while hidden**.

**AC-6.1.5 — SR peek path announces the rank ONCE to the owner's device only, then discards it (NFR-10, UX-DR20)**
Given the SR peek path on the Waiting surface,
When the **"Peek your card"** element is activated,
Then it **announces the rank ONCE** to the **owner's device only** and **discards it** (never a persistent readable node, never sent to any other device) — mirroring the Story 2.5 SR path.

**AC-6.1.6 — Zero server / contract / projection change; standing SM-6 privacy test unchanged (NFR-1, §11.3, Pre-mortem E)**
Given the standing SM-6 privacy gate and the §11.3 zero-contract-change guardrail (Epic 0 / Story 1.4),
When this story is built,
Then **NO server, `@trash/shared` (`types.ts`), persistence, or `projectStateFor` change** is made — the owner's own `you.hand` is ALREADY delivered on every push; this story only **RENDERS already-delivered data on a second client surface**; the standing privacy test still passes unchanged (**no new `ProjectedTableState` field**).

**AC-6.1.7 — On-Turn peek (2.5) and off-Turn peek (this) are mutually exclusive by surface (FR-20, UX-DR20)**
Given the active Player (whose Turn it currently IS),
When surfaces render,
Then the off-Turn peek (this story / Waiting surface) and the on-Turn peek (Story 2.5 / Your Turn surface) are **mutually exclusive by surface** — never doubled; the active Player keeps peeking via the existing Your Turn affordance, the waiting Players via this one.

**AC-6.1.8 — The "swap-chain tell" is a play-confirmed WATCH, not a build clause (SM-C4)**
Given the "swap-chain tell" (peeking right after a received Swap reveals the receiver's new card, hence the neighbor's old card — an emergent, deliberate v2 information shift),
When Epic 6 is validated,
Then it is a **play-confirmed observation (SM-C4), NOT a build clause** — observed in a real session whether the extra information flow adds tension (good) or sours play into cheating-accusations (bad); fallback if it sours = revisit via `correct-course`. This story ships the mechanic; the tell is watched, not gated.

## Tasks / Subtasks

- [x] **Task 1 — `client/src/surfaces/Waiting.svelte`: add the press-and-hold peek + auto-hide lifecycle (port the 2.5 YourTurn pattern)** (AC: 6.1.1, 6.1.2, 6.1.3, 6.1.4, 6.1.7)
  - [x] Renders `Card.svelte` fed `card={proj.you.hand}` + `revealed`, guarded `{#if proj.you.hand}` so an early/odd (or eliminated/hand-less) projection can't throw and shows no peek. Placed below the active-player name + Lives, subordinate; the surface still reads as the calmest surface when not peeking (the card is a face-down back at rest, never an always-on display).
  - [x] `let revealed = $state(false)` — LOCAL UI-only, never sent. No peek intent, no `socket.send`, no table-store seam.
  - [x] **Svelte-5 gotcha AVOIDED:** renamed the prop binding to `proj` (`const { state: proj }: { state: ProjectedTableState } = $props()`) and updated ALL reads (activeName, self, justSwapped, you.hand, startingLives) to `proj.*` — so the `$state` rune no longer collides with a `state` variable. The 12 tests pass (no `state is not a store` runtime error).
  - [x] Press-and-hold via Pointer Events: `onpointerdown`→reveal, `onpointerup`/`onpointercancel`/`onpointerleave`→hide. Keyboard: `onkeydown` Enter/Space→reveal, `onkeyup`→hide. `touch-action:none` + `user-select:none` on the control.
  - [x] Release re-hides IMMEDIATELY — `revealed=false` on pointerup/cancel/leave/blur/keyup; NO timer, NO pin-toggle.
  - [x] Auto-hide: `onblur` on the control; `document` `visibilitychange` (when `document.hidden`) + `window` `pagehide` registered in a `$effect` that RETURNS its teardown (listeners removed on unmount). Verbatim port of the YourTurn (2.5) lifecycle.
  - [x] CURRENT-card guarantee (AC-6.1.3): the peek reads `proj.you.hand` live (Card is fed the prop each render; nothing cached). Test with two successive projections (5 → K) confirms the peeked face follows a received swap.

- [x] **Task 2 — The SR-accessible "Peek your card" path on Waiting: announce the rank ONCE, then discard (AC-6.1.5)** (AC: 6.1.5)
  - [x] `const announcement = $derived(revealed && proj.you.hand ? cardSpeech(proj.you.hand) : "")` — set to the spoken card on reveal, cleared to `""` on hide (matches the CURRENT YourTurn implementation, which uses `$derived` rather than a second `$state`, so the announce can never drift from `revealed`). Rendered in an `aria-live="assertive"` `.sr-only` region (`data-testid="peek-announce"`); owner-device-only (built from `proj.you.hand`, never sent).
  - [x] `revealed` drives BOTH the visual face and the derived announce — single source of truth, no drift. `cardSpeech` imported from `../lib/card-display` (REUSED, not re-authored).
  - [x] The peek announce region (assertive) is SEPARATE from the existing `justSwapped` squirm region (polite) — neither clobbers the other.
  - [x] Reused `PEEK_HINT` from `copy.ts` as the control's `aria-label` and label — NO new copy string.

- [x] **Task 3 — REUSE `Card.svelte` and `card-display.ts` unchanged; confirm no new component** (AC: 6.1.1, 6.1.4)
  - [x] `Card.svelte` reused AS-IS (`{ card, revealed }`, `{#if revealed}` a11y-tree-absent). No modification, no second card component, rank→letter map stays solely in `card-display.ts` (only `cardSpeech` imported here).
  - [x] The hidden-state a11y-tree-absent guarantee holds on Waiting (same component, same `{#if revealed}`) — asserted by `queryByText("K")`/`queryByText("♠")` → null while hidden.

- [x] **Task 4 — Tests: Waiting peek reveal/re-hide, a11y-tree-absent, current-card-follows-swap, SR announce-once, no-send, calm-when-hidden** (AC: all)
  - [x] **`client/src/surfaces/Waiting.svelte.test.ts`** (MODIFIED — all standing 2.4 tests preserved: active-name, squirm beat present/absent, own Lives pips, warm fallback). ADDED 6 peek tests: hidden-by-default a11y-tree-absent (AC-6.1.4); pointerDown reveals → pointerUp re-hides (AC-6.1.1); pointercancel/pointerleave/blur re-hide (AC-6.1.2); current-card-follows-swap 5→K (AC-6.1.3); SR announce-once empty→King→empty (AC-6.1.5); peeking sends NOTHING via mocked table-store (AC-6.1.6); no-hand guard renders no peek/card and doesn't throw (AC-6.1.4). REMOVED the obsolete "renders NO card value" test — it asserted the exact behavior this story intentionally reverses (documented in Dev Notes).
  - [x] **AC-6.1.2 path:** `blur` IS jsdom-tested (reliable). `visibilitychange`/`pagehide` wired in the `$effect` but NOT unit-tested (non-deterministic in jsdom) — verified manually (Task 5). No flaky jsdom test planted.
  - [x] **Test placement:** `Waiting.svelte.test.ts` runs in `client-dom`; `@testing-library/svelte` `render`/`screen`/`fireEvent`; `queryByText → toBeNull()` for absence; `vi.mock("../lib/table-store.svelte", …)` for no-send; `fireEvent.pointerDown`/`pointerUp`/`pointerCancel`/`pointerLeave`/`blur`.
  - [x] **GATE checks GREEN:** `npm run lint` clean (GATE-1 no peek-intent/`socket.send` in the peek path; GATE-2 untouched); `npm run typecheck` 0 (svelte-check 203 files 0 errors, tsc 0); `npm test` → server 223 (UNCHANGED — no server file touched by this story; the one dirty server test file predates this branch) + client 143 (was 137 → +6 net: +6 peek tests, −1 obsolete card-value test, +1 squirm-absent already present... net counted by runner); `npm run build --workspace=client` ✓ (PWA). Standing SM-6 server test untouched + green (AC-6.1.6).

- [x] **Task 5 — Manual / Playwright verification of the non-deterministic auto-hide + the swap-chain-tell watch (AC: 6.1.2, 6.1.8)** (AC: 6.1.2, 6.1.8)
  - [x] Manual verification checklist recorded in Completion Notes (mirror 2.5): background/tab-switch → hides (visibilitychange); navigate-away/reload → hides (pagehide); SR activate → rank announced once, nothing persists. No Playwright harness scaffolded (out of scope; none exists — same as 2.5).
  - [x] AC-6.1.8 swap-chain-tell WATCH recorded in Completion Notes as a v2-playtest observation (SM-C4), NOT code; fallback = `correct-course`.

## Dev Notes

### What this story IS / IS NOT
- **IS:** a **CLIENT-ONLY** story — the 2.5 press-and-hold peek lifecycle (+ SR announce-once + auto-hide) ported from `YourTurn.svelte` onto `Waiting.svelte`, rendering the already-on-device `you.hand` via the existing `Card.svelte`. It REVERSES one explicit 2.4/2.5 design decision: that the Waiting surface deliberately does NOT show the caller's own card. v2 makes it peekable (held, never persistent) so off-turn players can study their hand as the swap chain approaches (UJ-5).
- **IS NOT:** any SERVER change (no engine/handler/validate/projection/dispatch edit — `you.hand` is ALREADY projected to the owner on every push, regardless of whose turn it is: `project-state.ts:45-46` sets `you.hand` from `round.hands[playerId]` whenever the caller holds a card); any WIRE-CONTRACT change (NO peek intent — there is none and must not be one; peeking never round-trips); any `Card.svelte` / `card-display.ts` change (REUSE as-is); a new card component; a Playwright/e2e harness (out of scope — AC-6.1.2's background/pagehide path is manual-confirmed, per 2.5 precedent).

### The privacy line — why this story does NOT touch SM-6's chokepoint (AC-6.1.6)
- SM-6 (the standing negative-assertion privacy invariant) is about **NON-owner cards never reaching the client before reveal**. Peek reveals the owner's OWN card (`you.hand`), which is ALREADY legitimately projected to the owner's device by `projectStateFor` — and crucially it is projected **whether or not it's the caller's turn**: `project-state.ts:45-46` reads `round.hands[playerId]` for the caller's own seat unconditionally (the turn only gates ACTIONS, never own-card delivery). A waiting player therefore already holds their own card on-device; this story just RENDERS it. So NO server projection change, NO re-opening of SM-6 — `projectStateFor` still emits ONLY `you.hand` (own) and omits all `players[].hand` while `revealed===false`. No new `ProjectedTableState` field → the standing privacy test (Story 1.4, Pre-mortem E) re-passes unchanged.
- **The one privacy obligation this story OWNS:** the rank must not LEAK into the accessibility tree while hidden (AC-6.1.4) — the same `{#if revealed}` conditional-render guarantee `Card.svelte` already provides (the rank node literally does not exist when hidden), asserted on Waiting via a `queryByText → null` test.

### Waiting.svelte — the current state, and the exact reversal (READ before writing)
- Current `Waiting.svelte` [verified, repo HEAD] is the calmest surface: it renders the active player's name in a STATIC inert frame (`--border-inert`, NO pulse), the `justSwapped` squirm beat (`role="status" aria-live="polite"`), and the caller's OWN Lives (`LivesPips`). Its header comment explicitly states: *"No card is rendered here … even the caller's own `you.hand` is deliberately NOT shown on Waiting (the card belongs to the active surfaces / peek, Story 2.5)."* **This story changes that comment + that behavior** — add the peek (held-only, never persistent). UPDATE the header comment to reflect the v2 decision (off-turn peek is now allowed, held-only) so the next reader isn't misled.
- It binds `const { state }: { state: ProjectedTableState } = $props()`. Introducing the `$state` rune here WILL hit the Svelte-5 collision 2.5 documented — **rename the binding to `proj`** and update all `state.*` reads (`activeName`, `self`, `justSwapped`, and the new `proj.you.hand`). This is non-optional; skipping it reproduces the exact `state is not a store` runtime failure 2.5 hit and fixed.
- Keep the surface CALM when not peeking (NFR-9 / UX-DR6 / AC-6.1.4): the card is hidden by default (face-down back is fine, but prefer the card simply not dominating — the peek is a held reveal, not an always-on display). The static frame, no-pulse, no-motion contract stays. The peek control is a subordinate affordance, not a hero.

### REUSE: Card.svelte + card-display.ts (do NOT re-author)
- `Card.svelte` (Story 2.5) is display-only `{ card: Card; revealed: boolean }`, hidden via `{#if revealed}` (a11y-tree-absent), revealed = Display-XL rank + single suit pip, decorative suit by SHAPE not color. It was explicitly built "reuse-bound" for exactly this kind of second consumer (and Epic 3 showdown). Feed it `card={proj.you.hand}` + the local `revealed`. NO change to the component.
- `card-display.ts` (Story 2.5) is the SOLE home of the rank→letter map (`rankToLetter`) + `rankSpeech`/`cardSpeech` (architecture.md:551, grep-enforced). REUSE `cardSpeech` for the SR announce. Do NOT duplicate the map into Waiting.
- The press-and-hold lifecycle is currently INLINE in `YourTurn.svelte` (a one-surface lifecycle, per 2.5's decision to not extract to `interaction.ts` until a second consumer appears). **This story is that second consumer.** Decision for the dev: either (a) port the lifecycle inline into Waiting (simplest, lowest-risk, matches the 2.5 inline pattern), or (b) extract a small shared press-and-hold/peek helper used by BOTH surfaces. PREFER (a) inline-port for this story to keep it contained and avoid refactoring the standing 2.5 YourTurn tests; note (b) as a possible future tidy in Completion Notes if the duplication feels heavy. Do NOT refactor YourTurn in this story unless extracting — and if extracting, keep all standing YourTurn tests green.

### Mutually-exclusive-by-surface (AC-6.1.7) — already structural, just confirm
- `route-from-state.ts:63-64`: `if (you.playerId === state.currentTurnId) return "yourTurn"; return "waiting";`. A player is on EXACTLY one of YourTurn / Waiting at a time, so the on-turn peek (YourTurn, 2.5) and the off-turn peek (Waiting, this) can never both render for the same player simultaneously — the exclusivity is structural, not something to enforce with new code. The story just must not add a peek anywhere a third surface could also show it. (Eliminated players route to `eliminated`, not Waiting, and have no hand — the `{#if proj.you.hand}` guard covers that.)
- "Already-acted" players: after a player acts mid-pass, the turn advances to someone else, so they route back to Waiting (`you !== currentTurnId`) and CAN peek — AC-6.1.1's "both not-yet-acted AND already-acted" is satisfied automatically by the routing; no acted/not-acted branching needed in this story.

### Current code state (verified — read these before writing)
- **`client/src/surfaces/Waiting.svelte`** — the calmest surface (active name + squirm + own Lives, static inert frame). Binds `{ state }` prop. ADD the peek here; RENAME `state`→`proj`; UPDATE the "no card here" header comment.
- **`client/src/surfaces/Waiting.svelte.test.ts`** — standing 2.4 Waiting tests (active name, squirm beat, Lives). EXTEND with the peek tests; keep the standing ones green.
- **`client/src/components/Card.svelte`** — display-only `{ card, revealed }`, `{#if revealed}` a11y-tree-absent. REUSE unchanged.
- **`client/src/lib/card-display.ts`** — `rankToLetter` (SOLE letter map), `rankSpeech`, `cardSpeech`. REUSE `cardSpeech` for the SR announce.
- **`client/src/surfaces/YourTurn.svelte`** — the 2.5 reference implementation of the press-and-hold + auto-hide + SR-announce-once lifecycle (Pointer Events down/up/cancel/leave; keyboard Enter/Space; `$effect` with teardown for visibilitychange/pagehide; the `state`→`proj` rename). PORT this pattern; do NOT modify YourTurn (unless extracting a shared helper — then keep its tests green).
- **`client/src/lib/copy.ts`** — `PEEK_HINT` ("Press and hold to peek.") exists — reuse as the control label. No new copy needed.
- **`client/src/lib/table-store.svelte.ts`** — `sendSwap`/`sendKeep` seams; NO new seam (peek does not send).
- **`shared/src/types.ts`** — `ProjectedTableState.you.hand?: Card` (own card only). NO change.
- **`server/**` and `shared/**`** — NO change of any kind (AC-6.1.6).

### Testing standards (match the house style — same as 2.5)
- `Waiting.svelte.test.ts` is `*.svelte.test.ts` → `client-dom` project (jsdom + `svelte()`+`svelteTesting()`). `@testing-library/svelte` `render`/`screen`/`fireEvent`.
- **a11y-tree-absent assertion (AC-6.1.4)** — the key pattern, reused from 2.5: render hidden → `expect(screen.queryByText("K")).toBeNull()` (the rank node is absent because `{#if revealed}` doesn't render it); pair with a revealed-state `getByText("K")` to prove the toggle.
- **Current-card test (AC-6.1.3)** — render with `you.hand` = rank A, peek, assert "A"; re-render with `you.hand` = rank K (simulating a received swap re-push), peek, assert "K". This pins that the peek reads the live prop, not a cached snapshot.
- **No-send (AC-6.1.6 spirit)** — `vi.mock("../lib/table-store.svelte", …)`; assert no send fn called during a peek.
- **Non-deterministic ACs (AC-6.1.2)** — `blur` is jsdom-reliable (test it); `visibilitychange`/`pagehide` are NOT → manual/Playwright, assert listener registration only. Don't plant a flaky jsdom test.

### Previous story intelligence (Story 2.5 — the direct precedent)
- 2.5 built the WHOLE peek mechanic for YourTurn: `card-display.ts` (the letter map + speech), `Card.svelte` (display-only, reuse-bound — built FOR exactly this), and the inline press-and-hold + auto-hide + SR-announce-once lifecycle. **This story is the "reuse-bound" payoff** — render the same `Card.svelte` on Waiting with the same lifecycle.
- **The Svelte-5 `$state`/`state`-prop collision** is the single biggest gotcha 2.5 hit (`state is not a store with a subscribe method`) — Waiting has the IDENTICAL `{ state }` prop binding, so the SAME rename to `proj` is required before adding `$state`. This is called out in Task 1.
- 2.5's auto-hide listeners use a `$effect` returning teardown (no leaked listeners across surface transitions — deferred-work #104). Port that exactly.
- 2.5 deliberately kept the lifecycle inline (no `interaction.ts` extraction) "unless a second consumer is clear." This story IS the second consumer — see the inline-vs-extract decision in Dev Notes (prefer inline-port to stay contained).

### Git intelligence
- The MVP epics (1–5) are done; this is the FIRST v2 story (Epic 6, the quick win). Recent commits are tightly-scoped, fully-gated slices with no scope creep. **6.1 is CLIENT-ONLY and SMALL** — `Waiting.svelte` (+peek lifecycle), `Waiting.svelte.test.ts` (+peek tests), REUSE `Card.svelte`/`card-display.ts`. No server file, no shared file, no wire change, no new dependency, no new component. Keep it contained; resist adding a Playwright framework (manual-confirm AC-6.1.2).
- Branch from the current main tip (`56ff598`, the actions-bump commit). Suggested branch: `story/6-1-peek-your-own-card-while-waiting`.

### Project Structure Notes
- **Modified (client):** `client/src/surfaces/Waiting.svelte` (add press-and-hold peek + auto-hide + SR announce-once + `Card.svelte` render; rename `state`→`proj`; update header comment).
- **Modified (tests):** `client/src/surfaces/Waiting.svelte.test.ts` (+peek reveal/re-hide / a11y-tree-absent / current-card-follows-swap / SR-announce / no-send / calm-when-hidden; standing 2.4 Waiting tests untouched).
- **Reused unchanged:** `client/src/components/Card.svelte`, `client/src/lib/card-display.ts` (`cardSpeech`), `client/src/lib/copy.ts` (`PEEK_HINT`), `client/src/surfaces/YourTurn.svelte` (pattern source; not modified unless extracting a shared helper).
- **No change:** ALL of `server/**` and `shared/**` (no server/projection/contract change — `you.hand` already projected regardless of turn); `client/src/lib/table-store.svelte.ts` (no peek seam); `client/src/route-from-state.ts` + `App.svelte` (already route/render Waiting); `eslint.config.js`/`wrangler.jsonc`/vitest configs.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.1 — Peek your own Card while waiting (Epic 6)] — the 8 source ACs verbatim (press-and-hold on Waiting; auto-hide on lost-focus/background; current-card-follows-swap; calm-when-hidden + rank-not-in-a11y-tree; SR announce-once owner-only; zero server/contract/projection change + standing SM-6 unchanged; mutually-exclusive-by-surface; swap-chain-tell play-confirmed watch).
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 6 — FR-20; NFR-1 (privacy/SM-6), NFR-9 (eyes-up), NFR-10 (a11y); UX-DR6 (Waiting surface), UX-DR7 (peek behavior reused), UX-DR20 (off-turn peek on Waiting); §11.3 zero-contract-change guardrail; G1/G2 standing gates]
- [Source: _bmad-output/planning-artifacts/prds/prd-trash-game-2026-06-25/prd.md#FR-20, #§11.3, #UJ-5, #SM-4, #SM-C4] — v2 PRD (final): FR-20 off-Turn peek; the zero-contract-change hard guardrail; the waiting-player journey; the metric + the swap-chain-tell counter-metric.
- [Source: _bmad-output/planning-artifacts/prds/prd-trash-game-2026-06-25/addendum.md#D] — the swap-chain tell rationale (deferred playtest observation, SM-C4); §C implementation shape (client-only, reuse the existing peek).
- [Source: _bmad-output/implementation-artifacts/2-5-peek-your-own-card.md] — the DIRECT precedent: the whole peek mechanic, `Card.svelte`/`card-display.ts` (built reuse-bound for this), the inline press-and-hold + `$effect`-teardown auto-hide + SR-announce-once lifecycle, AND the Svelte-5 `$state`/`state`-prop collision + the `proj` rename fix to replicate.
- [Source: client/src/surfaces/Waiting.svelte] — current calmest-surface implementation (active name + `justSwapped` polite squirm region + own `LivesPips`; static `--border-inert` frame, no pulse); the `{ state }` prop binding to rename; the "no card here … deliberately NOT shown" header comment to update.
- [Source: client/src/components/Card.svelte] — display-only `{ card, revealed }`, `{#if revealed}` a11y-tree-absent, Display-XL rank + single suit pip, suit by shape not color. REUSE unchanged.
- [Source: client/src/lib/card-display.ts] — `rankToLetter` (SOLE letter map), `cardSpeech` (reuse for the SR announce).
- [Source: client/src/route-from-state.ts:63-64] — `you.playerId === currentTurnId ? "yourTurn" : "waiting"` — the structural basis for AC-6.1.7 mutual-exclusivity and for "already-acted players route back to Waiting and can peek".
- [Source: server/src/project-state.ts:45-46] — `const ownCard = round.hands[playerId]; if (ownCard) you.hand = ownCard;` — own card projected to its owner UNCONDITIONALLY (turn-independent), the basis for AC-6.1.6 "already on-device, no server change".
- [Source: shared/src/types.ts — ProjectedTableState.you.hand?: Card (own card only)] — the contract already carries the owner's own card; NO change.
- [Source: _bmad-output/planning-artifacts/architecture.md:551 ("int→letter map lives ONLY in src/client"), :556 ("only UI-only state (peeking) is local and never sent")] — the map-home + peek-is-local rules this story honors by REUSE.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (1M context), dev-story workflow.

### Debug Log References

- RED: `npx vitest run --project client-dom src/surfaces/Waiting.svelte.test.ts` → 5 failed | 7 passed (the new peek tests fail — no peek control/card yet; the no-hand guard already holds).
- GREEN: same command after implementing the peek → **12 passed**.
- `npm run typecheck` → svelte-check 203 files, 0 errors; tsc 0.
- `npm run lint` → clean (GATE-1 no `.send`/peek-intent in the peek path; GATE-2 untouched — no server file changed).
- `npm test` → **server 223 (UNCHANGED by this story)** + **client 143** (baseline 137 → +6 net: +7 peek tests, −1 obsolete "renders NO card value" test that asserted the now-reversed behavior).
- `npm run build --workspace=client` → PWA built OK.
- Scope proof: `git diff --stat 56ff598 -- client server shared` shows my edits are exactly `client/src/surfaces/Waiting.svelte` + `…Waiting.svelte.test.ts`. The `server/src/table-server-host-controls.do.test.ts` modification in the working tree PRE-DATES this branch (present in the session-start git status) and is NOT part of Story 6.1.

### Completion Notes List

- **CLIENT-ONLY, zero-contract-change (AC-6.1.6).** Only `Waiting.svelte` + its test changed. No `server/**`, no `shared/**` (`types.ts`), no persistence, no `projectStateFor`. The owner's own `you.hand` is ALREADY projected to its owner on every push regardless of whose turn it is (`project-state.ts` sets `you.hand` from `round.hands[playerId]` unconditionally — the turn gates only ACTIONS), so this is a pure client render of on-device data. The standing SM-6 server privacy test is untouched and green; no new `ProjectedTableState` field.
- **Ported the Story 2.5 peek lifecycle** from `YourTurn.svelte` onto `Waiting.svelte`: press-and-hold (Pointer Events down→reveal; up/cancel/leave→hide), keyboard Enter/Space hold, immediate re-hide (no timer/pin), auto-hide on `blur` + `document.visibilitychange` + `window.pagehide` via a `$effect` returning its teardown (no leaked listeners). REUSED `Card.svelte` (display-only, `{#if revealed}` a11y-tree-absent) and `card-display.ts` `cardSpeech` AS-IS — no new component, no map duplication.
- **Svelte-5 `$state`/`state`-prop collision avoided:** renamed the prop binding to `proj` and updated all reads, exactly as 2.5 did for YourTurn. No `state is not a store` runtime error.
- **Reversed the 2.4/2.5 "Waiting shows no card" decision** deliberately (v2 FR-20): updated the file header comment and removed the obsolete "renders NO card value" test (it pinned the exact behavior being reversed). The surface still reads as the calmest surface when not peeking — the card is a face-down back at rest, the peek is a held reveal, the static inert frame / no-motion contract is unchanged (NFR-9 / UX-DR6 / AC-6.1.4).
- **Mutual-exclusivity (AC-6.1.7)** is structural via `route-from-state.ts:63-64` (`you === currentTurnId ? yourTurn : waiting`) — a player is on exactly one surface, so the on-turn (YourTurn) and off-turn (Waiting) peeks can never both render for the same player. Already-acted players route back to Waiting and can peek; no acted/not-acted branching needed. No code added for this AC.
- **Manual verification checklist (run on a real device / dev server — the non-deterministic AC-6.1.2 paths):** (1) on Waiting, press-and-hold peek → own card face shows; release → hides immediately. (2) Peek, then background the app / switch tabs → card hides (visibilitychange). (3) Peek, then focus away from the control → hides (blur). (4) Peek, then navigate away / reload → hides (pagehide). (5) With a screen reader, activate the peek → the rank is announced once ("King of spades"), nothing persists. (6) Mixed pass: act, then while waiting for others, peek your current card; after a swap lands a new card, peek again → shows the NEW card.
- **AC-6.1.8 swap-chain-tell WATCH (not code):** the v2 live playtest should observe whether off-turn peeking right after a received swap (which reveals the receiver's new card, hence the neighbor's old card) adds tension (good) or sours play into cheating-accusations (bad) — SM-C4. Fallback if it sours = revisit via `correct-course`. This story ships the mechanic; the tell is watched, not gated.
- **Scope held:** no server/shared/contract change, no new ErrorReason, no peek intent, no new dependency, no new component, no Playwright scaffold. All prior gates green; Card.svelte / card-display.ts / YourTurn.svelte unmodified.

### File List

- `client/src/surfaces/Waiting.svelte` (MODIFIED) — added the press-and-hold off-turn peek (renders the existing `Card.svelte` fed `proj.you.hand`), the `$effect`-teardown auto-hide (blur/visibilitychange/pagehide), and the SR announce-once region; renamed the `state` prop to `proj` (Svelte-5 `$state` collision); updated the header comment to reflect the v2 off-turn-peek decision.
- `client/src/surfaces/Waiting.svelte.test.ts` (MODIFIED) — +6 net tests (hidden a11y-tree-absent / reveal+re-hide / cancel·leave·blur re-hide / current-card-follows-swap / SR announce-once / no-send / no-hand guard); removed the obsolete "renders NO card value" test; standing 2.4 Waiting tests preserved.

### Change Log

- 2026-06-25 — Implemented Story 6.1 (Peek your own Card while waiting), the v2 quick win (Epic 6, FR-20). CLIENT-ONLY, zero-contract-change: ported the Story-2.5 press-and-hold peek + auto-hide + SR-announce-once lifecycle from `YourTurn.svelte` onto `Waiting.svelte`, rendering the already-on-device `you.hand` via the existing `Card.svelte` (reused; `card-display.ts` `cardSpeech` reused). Renamed Waiting's `state` prop → `proj` to dodge the Svelte-5 `$state`-rune collision. Reversed the 2.4/2.5 "Waiting shows no card" decision (removed the obsolete test + updated the header). No server/shared/`types.ts`/projection change — `you.hand` is already projected to its owner turn-independently, so the standing SM-6 test is untouched. +6 net client tests (137→143); server 223 unchanged; lint + typecheck + PWA build green. RED→GREEN confirmed (5 peek tests RED → 12 green). Status → review.
