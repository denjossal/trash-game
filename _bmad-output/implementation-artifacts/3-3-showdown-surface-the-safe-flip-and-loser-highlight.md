---
baseline_commit: 5412f0e
---

# Story 3.3: Showdown surface — the safe flip & loser highlight

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the whole table,
I want every Card to flip together and the loser to be unmistakable,
so that the reveal lands as a shared "OHHH" even across twenty cards — the loud beat.

## Acceptance Criteria

1. **AC-3.3.1 — coordinated safe flip ≤400ms, Reduce-Motion skips it.** When the `showdown` surface renders with `revealed === true`, every Card animates face-up via a SINGLE coordinated flip lasting ≤400ms — no strobe, nothing flashing >3×/second, no full-viewport flash. Under `prefers-reduced-motion: reduce` the flip is SKIPPED (cards appear face-up instantly), matching the established Button.svelte/YourTurn.svelte reduce-motion pattern. The flip is a presentation concern only — it is driven by the snapshot's `revealed` flag (set by Story 3.2's `revealAll`), never by a server animation message. *(FR-9, NFR-6, UX-DR9; architecture.md#Showdown-flip-safety 64, 373–376.)*

2. **AC-3.3.2 — loser highlight by stroke + scale + position, never color alone; receded ≥70% opacity.** When `state.loserIds` is present and non-empty, each Card belonging to a loser seat is framed in the ERROR ramp (`--color-error` stroke / `--color-error-container` fill) with a thick stroke + gentle scale-up, unmistakable across up to 20 Cards; the highlight is stroke + scale + position (NOT color alone — NFR-10 color-independence). Non-losing Cards recede to NO LOWER than 70% opacity (faces stay ≥4.5:1 legible). Under Reduce-Motion the scale-up is dropped (highlight by stroke + position only). When `loserIds` is ABSENT/empty (the bare `showdown` state produced by Story 3.2 today, before Story 3.4 wires `resolveShowdown`), NO Card is highlighted and NO Card is receded — the surface simply shows all hands face-up. *(FR-10, UX-DR9, NFR-10; DESIGN.md 172–173, 177.)*

3. **AC-3.3.3 — loser copy is warm tease, never punishing; all-tied has its own line.** When the local device's own `playerId` is in `state.loserIds` (and it is NOT the all-tied case), the surface shows the warm loser copy `loser(name)` from `copy.ts` ("Ooof — lowest card. That's a life, {name}."), NEVER "YOU LOST". When EVERY alive seat is a loser (the all-tied case — `loserIds` covers all alive players), the surface shows `TIE` from `copy.ts` ("Tie for lowest — everybody drops a life!") instead. The copy strings are the EXISTING `copy.ts` exports (Story 1.9b) — do NOT change them (user-confirmed: keep "Ooof — lowest card. That's a life, {name}."). *(UX-DR16, decision #5 — voice peaks here.)*

4. **AC-3.3.4 — minimal-but-real, FX-ready structure.** The reveal beat is minimal-but-real (not sterile) and structured so the deferred v1.1 produced FX can drop onto the loser's phone later without rework — e.g. the loser-highlight is a discrete, addressable element/class on the loser Card(s), not entangled with the flip animation, so an FX layer can target it. NO produced FX (sound, particles, haptics) ship in this story. *(PRD §6.2; UX-DR9 "designed so v1.1 produced FX can drop in without rework".)*

5. **AC-3.3.5 — reuses Card.svelte; no new privacy surface; SM-6 unaffected.** The surface renders each seat's Card via the EXISTING `Card.svelte` component (Story 2.5, built REUSABLE for Showdown). The Showdown projection already carries every seat's `hand` once `revealed === true` (Story 3.2 made this reachable via `projectStateFor`) — this story consumes that data, it does NOT change `projectStateFor`, the wire contract, or `shared/src/types.ts`. No new pre-reveal card exposure is introduced (SM-6 holds: hands are present in the payload ONLY because `revealed` is already true). *(NFR-1; Decision #3; Card.svelte Story 2.5 reuse note.)*

6. **AC-3.3.6 — scope: client surface only; no server, no resolution, no loserIds producer.** This story builds ONLY the client `Showdown.svelte` surface (flip + highlight + copy) and any loser-highlight styling on `Card.svelte`. It does NOT call/wire `resolveShowdown`, does NOT set `loserIds`/`winnerIds` in the projection (that producer is Story 3.4), does NOT deduct Lives or mark eliminations, does NOT build the Round-Result/Re-deal surface (Story 3.4) or the Eliminated/Winner surfaces (3.5/3.6), and makes NO server (`handlers.ts`/`dispatch.ts`/`project-state.ts`), `shared/`, or `rules/` change. The highlight is built as a CONSUMER keyed on `state.loserIds`, ready for 3.4's producer (mirrors how `projectStateFor`'s `revealed` branch was pre-built in Story 1.4). *(epics.md#Story 3.3/3.4 boundary; user-confirmed scope.)*

7. **AC-3.3.7 — component tests + gates; joint-tuning is a separate timeboxed gate.** New `client/src/surfaces/Showdown.svelte.test.ts` (and, if loser styling is added to `Card.svelte`, an extension of `Card.svelte.test.ts`) drives, in the `client-dom` vitest project: (a) all seats' faces render face-up when `revealed === true`; (b) with `loserIds` injected, the loser Card(s) carry the loser-highlight marker and non-losers carry the receded marker; with `loserIds` absent, NO highlight/recede marker appears; (c) the loser device shows `loser(name)`; the all-tied fixture shows `TIE`; neither ever shows "YOU LOST"; (d) the flip is gated/skipped under reduce-motion — NOTE jsdom does NOT evaluate CSS `@media`, so a pure-CSS flip skip is not directly assertable: assert the flip class/element is present (the media query neutralizes it at runtime, as Button.svelte is structured), OR if a JS `matchMedia` guard is used, mock `window.matchMedia({ matches: true })` and assert the instant-face-up render — match the approach the codebase already uses. client `npm test` + server tests + lint (GATE-1 egress / GATE-2 purity) + typecheck + build all green. The PRE-MORTEM-A joint-tuning of the squirm beat (Epic 2) + this reveal beat is a SEPARATE timeboxed design-review gate with an explicit freeze criterion ("the pair lands; ship") — NOT part of this implementation AC and NOT a build clause here. *(Pre-mortem A; Amelia review — timebox; existing client-dom test infra.)*

## Tasks / Subtasks

- [x] **Task 1 — Build the real `Showdown.svelte` surface** (AC: 1, 2, 3, 4, 5, 6)
  - [x] Replaced the stub `Showdown.svelte` body. Receives `state` via `$props()` (routing untouched). Renders every `state.players` seat as a face-up `Card.svelte` (`card={p.hand}` `revealed={true}`) inside a `<ul class="cards">`.
  - [x] Defensive hand guard: `{#if p.hand}` renders the face-up card, else a face-down `Card` (the 3.2-deferred project-state.ts:61 undefined-hand edge) — never throws (test: "renders defensively when a seat has no hand").
  - [x] Loser highlight (AC2): `loserIds = state.loserIds ?? []`; per-seat `isLoser`/`receded` markers; `.seat.loser` error-ramp 4px stroke (`--color-error`) + `--color-error-container` fill + `scale(1.06)`; `.seat.receded { opacity: 0.7 }`; bare showdown (`loserIds` empty) applies NEITHER — confirmed by the "BARE showdown" test.
  - [x] Loser copy (AC3): `allTied` = every alive seat in `loserIds` (and ≥1 loser) → `TIE`; else `youLost` (own id in loserIds, not all-tied) → `loser(ownName)`; else nothing. Imported `loser`/`TIE` from `../lib/copy` — strings unchanged.
  - [x] FX-ready (AC4): discrete `data-flip`/`data-loser`/`data-receded` markers decoupled from the flip animation.
- [x] **Task 2 — Safe coordinated flip ≤400ms + Reduce-Motion skip** (AC: 1)
  - [x] `flip-in` keyframes (360ms ≤400ms, opacity + rotateY) on `.card-frame`, runs once on mount so all cards flip together. No strobe / nothing >3×/second / no full-viewport flash.
  - [x] `@media (prefers-reduced-motion: reduce)`: `animation: none` (instant face-up), `.seat.loser .card-frame { transform: none }` (no scale — stroke+position only), `.seat { transition: none }`. Mirrors Button.svelte:122–130 / YourTurn:184.
  - [x] Flip placement decision: kept `Card.svelte` DISPLAY-ONLY; the flip + loser/receded styling live on the Showdown surface wrapper (`.card-frame`/`.seat`). Card.svelte and its test are UNTOUCHED — so the opt-in-props branch and the Card-test extension were correctly N/A.
- [x] **Task 3 — Component tests** (AC: 7) — RED FIRST ✅ (6 of 8 failed against the stub before impl; the 2 negative-marker assertions passed pre-impl because nothing rendered — the genuine RED was the face/marker/copy rendering)
  - [x] New `client/src/surfaces/Showdown.svelte.test.ts` (client-dom): faces render for every seat; `data-loser`/`data-receded` markers present iff `loserIds` set (and absent on bare showdown); loser device shows `loser(name)`, non-loser shows none, all-tied shows `TIE`, "YOU LOST" never appears; `data-flip` hook on every card (the @media skip applies at runtime — jsdom caveat noted); defensive no-hand render.
  - [x] N/A — `Card.svelte` gained no props (display-only kept), so no `Card.svelte.test.ts` change.
- [x] **Task 4 — Gates green** (AC: 7)
  - [x] `npm test --workspace=client` 90 passed (82 baseline + 8 new); `npm test --workspace=server` 170 passed (unaffected); `npm run lint` (GATE-1 egress + GATE-2 purity) clean; `npm run typecheck` 0 errors; `npm run build` OK. Only `client/src/surfaces/Showdown.svelte` + its new test changed — NO shared/server/rules change.

## Dev Notes

### What this story IS and is NOT

- **IS:** the real client `Showdown.svelte` surface — every seat's Card flips face-up together (safe ≤400ms, reduce-motion-skipped), loser Card(s) highlighted in the error ramp (stroke + scale + position), non-losers receded to ≥70% opacity, and the warm loser/all-tied copy on the appropriate device. Built as a CONSUMER of `state.loserIds` (+ the already-present revealed hands), ready for Story 3.4's producer. Plus component tests.
- **IS NOT:** any server change (`handlers.ts`/`dispatch.ts`/`project-state.ts`), any `resolveShowdown` call or `loserIds`/`winnerIds` PRODUCER (Story 3.4), any Lives deduction / elimination, the Round-Result / Re-deal surface (Story 3.4), the Eliminated (3.5) or Winner (3.6) surfaces, any `shared/src/types.ts` change, or any produced FX. The PRE-MORTEM-A joint squirm+reveal tuning is a separate timeboxed design gate, not code here.

### The loserIds dependency — why this is a consumer, not a producer (KEY DECISION, user-confirmed)

`ProjectedTableState.loserIds?: string[]` (types.ts:140) is OPTIONAL and is currently UNSET — `projectStateFor` never assigns it (the `_beats` literal in project-state.ts:103–106 is a type-only SSoT scaffold, not a producer). The PRODUCER is Story 3.4 (`resolveShowdown` → projection sets `loserIds`/`winnerIds`). Story 3.2 lands the round in `showdown` with `revealed === true` and every `players[].hand` present, but `loserIds` undefined.

So this story builds the Showdown surface as a CONSUMER keyed on `state.loserIds`:
- At today's bare `showdown` (3.2 output, `loserIds` undefined): all hands flip face-up, NOTHING highlighted, NOTHING receded — a correct, non-broken reveal.
- Once Story 3.4 populates `loserIds`: the same surface lights up the loser(s) and recedes the rest — no rework.

This is the SAME producer/consumer split the project used for the privacy chokepoint: `projectStateFor`'s `revealed` branch was pre-built in Story 1.4 and only became reachable in 3.2. [Source: epics.md decision #3; project-state.ts:19–22 "Epic 3 EXTENDS this branch".] Confirmed with the user: do not pull the `loserIds` producer into 3.3.

### REUSE — do not reinvent

Read these in full before writing:
- **`client/src/components/Card.svelte`** — display-only card (Story 2.5), `{card, revealed}` props, EXPLICITLY built reusable for Showdown ("REUSABLE for Showdown (Epic 3, UX-DR9) where all players' cards flip face-up together, driven by a different `revealed` source"). Render every seat through it with `revealed={true}`. Keep it display-only; own the flip in the Showdown surface (a wrapper) OR add OPT-IN `loser`/`receded` props with safe defaults — never break the YourTurn caller.
- **`client/src/lib/copy.ts`** — `loser(name)` and `TIE` ALREADY EXIST (Story 1.9b, annotated "Epic 3, Story 3.3"). Import them; do NOT add/edit strings. The loser copy is intentionally "Ooof — lowest card. That's a life, {name}." (user-confirmed over the epics' shorter illustrative quote).
- **`client/src/route-from-state.ts`** — ALREADY routes `phase === "showdown" || state.revealed` to the `showdown` surface for EVERY device including eliminated spectators (lines 51–53). Do NOT touch routing. The surface just renders.
- **`client/src/App.svelte`** — renders `<Showdown state={state!} />` (line 41). The `state` prop plumbing exists; do not change it.
- **Reduce-motion pattern** — `client/src/components/Button.svelte` lines 122–130 and `client/src/surfaces/YourTurn.svelte` line 184 show the canonical `@media (prefers-reduced-motion: reduce)` block (drop transition/transform). Mirror it for the flip and the loser scale.
- **Design tokens** (`client/src/tokens.css`): `--color-error` (#ffb4ab, loser stroke), `--color-error-container` (#93000a, loser fill), `--color-on-error-container`; `--stroke-active-width` (4px) / `--stroke-active` for the thick-stroke idiom (recolor to error for the loser); `--color-on-surface` for legible faces. NO Tailwind — DESIGN.md tokens only (architecture.md:206).

### Design spec (DESIGN.md — the flip & highlight contract)

- **Loser highlight (line 172):** lowest card(s) framed in the ERROR ramp (`error` stroke / `error-container` fill) with thick stroke + gentle scale-up — unmistakable among 20 revealed cards; stroke + scale + position, NEVER color alone; computed by the app, never left to human scanning.
- **Receded non-losing cards (line 173):** dim to NO LOWER than 70% opacity — enough to recede, never so faint the rank drops below 4.5:1. Faces stay legible.
- **Motion & flash safety (lines 175–177):** the DEFAULT (not just reduce-motion) flip is safe — a single coordinated card-flip ≤400ms, then the loser highlight settles. No strobe, no flashing, nothing >3×/second, no full-viewport flash (audience includes kids and older adults in a dim room). Under Reduce Motion: skip the flip (instant face-up), skip the loser scale (stroke + position only).
- **Voice (DESIGN.md 113–115):** when someone loses, the moment TEASES, never punishes. The showdown is "the loudest the product ever gets" — the one beat allowed to shout — but still safe.

### Accessibility (NFR-10)

- Color-independence: loser is conveyed by stroke + scale + position, never color alone. Suit stays a SHAPE (Card.svelte already does this). Faces ≥4.5:1 even when receded (opacity floor 0.70).
- Card.svelte's revealed face is `aria-hidden` on the decorative glyphs (Story 2.5). For Showdown the loser copy is the screen-reader-meaningful announcement — render it as readable text (a live region is reasonable but not required by the AC). Keep focus order in reading order; primary content in the readable flow.
- Reduce-motion variants are required (AC1/AC2).

### Previous story intelligence (Stories 3.1 / 3.2 — just completed, on main)

- **3.2 (done, merged PR #18):** wired `handleReveal` + `case "revealAll"`; `round.revealed = true` is now REACHABLE so `projectStateFor` exposes every seat's hand at `showdown` — exactly the data THIS surface renders. SM-6 EXTENDED (not weakened). The 3.2 code review DEFERRED one item to Story 3.4: `project-state.ts:61` can assign `entry.hand = undefined` for a hand-less (eliminated) seat once 3.4 leaves eliminated seats in `players[]` while revealed — so render this surface DEFENSIVELY against a missing `hand` (skip/face-down rather than throw).
- **3.1 (done):** pure `resolveShowdown` in `engine.ts` (canonical D6 order, discriminated union, NEW players array). NOT called here — Story 3.4's `dealAgain` consumes it to set `loserIds`/lives. Do NOT import it.
- **Pattern:** the codebase splits PRODUCER (server/engine) from CONSUMER (projection/client surface) across stories; 3.3 is the consumer of `loserIds`, 3.4 the producer. Build ready, don't reach across the boundary.
- TDD discipline (RED-first) has been productive across 3.1/3.2 — write Task 3 tests RED before Task 1/2 pass where practical (the flip/highlight markers can be asserted before the surface renders them).

### Git intelligence (recent commits)

- `5412f0e` Merge PR #18 — Story 3.2 (reveal trigger; `showdown`/`revealed` reachable; all hands projectable). The baseline for this branch (`story/3-3-showdown-surface-the-safe-flip-and-loser-highlight` off `5412f0e`).
- `e632561` Merge PR #17 — Story 3.1 (pure resolveShowdown + Action-4 hardening).
- Client-surface precedent: Stories 1.9a/1.10/2.4/2.5/2.6 built surfaces as pure-of-state Svelte components rendered by `route-from-state` + `App.svelte`, each with a `*.svelte.test.ts` in the `client-dom` vitest project. `Showdown.svelte` + its test continue this pattern.

### Testing standards

- **client-dom vitest project** (`*.svelte.test.ts`): `@testing-library/svelte` (`render`, `screen`, `fireEvent`), `vitest` (`describe`/`it`/`expect`, `afterEach(cleanup)`). Mirror `YourTurn.svelte.test.ts` (a `state(over: Partial<ProjectedTableState>)` fixture factory + a `player(id,name,lives,seatIndex)` helper) and `Card.svelte.test.ts` (face render assertions, color-independence).
- Build the loser-highlight / receded markers as stable, queryable hooks (a class via `data-testid`, or an `aria`/role + accessible text) so the test can assert them without snapshotting styles.
- Reduce-motion: the codebase verifies reduce-motion via the CSS `@media` block (no behavioral JS branch in Button). Assert the flip is CSS-gated (e.g. the flip class/animation is present but neutralized by the media query) — or, if a JS `matchMedia` guard is used, mock `window.matchMedia` and assert the no-flip render. Keep it consistent with the existing approach.
- Client baseline ≈ 82 tests; your additions are net-new (Showdown surface + any Card extension).

### Project Structure Notes

- Touched source: `client/src/surfaces/Showdown.svelte` (UPDATE — replace stub with real surface). POSSIBLY `client/src/components/Card.svelte` (UPDATE — opt-in loser/receded props, only if styling lives on the Card). Touched tests: `client/src/surfaces/Showdown.svelte.test.ts` (NEW); POSSIBLY `client/src/components/Card.svelte.test.ts` (UPDATE). NO server, NO `shared/`, NO `rules/`, NO routing (`route-from-state.ts`/`App.svelte`), NO `copy.ts` change.
- Aligns with architecture: client surfaces are pure-of-state Svelte components; the reveal flip is presentation only (no server animation message); tokens-only styling (no Tailwind). No structural variance.

### References

- [Source: epics.md#Story 3.3 (lines 715–741)] — the five ACs: safe flip ≤400ms + reduce-motion; loser highlight (error ramp, stroke+scale+position, receded ≥70%); warm loser/all-tied copy; FX-ready minimal-but-real; joint-tuning as a TIMEBOXED gate (not a build clause).
- [Source: epics.md#Story 3.4 (lines 743–765)] — the boundary: 3.4 owns `loserIds`/lives/elimination + Round-Result/Re-deal (the PRODUCER of the data this surface consumes).
- [Source: DESIGN.md (lines 172–177)] — loser highlight (error ramp, stroke+scale+position), receded ≥70% opacity, motion & flash safety (≤400ms, no strobe/full-viewport flash, reduce-motion skips flip + scale).
- [Source: DESIGN.md 113–115] — voice: the loss teases, never punishes; showdown is the one loud-but-safe beat.
- [Source: architecture.md#Phase 29–35, #Showdown-flip-safety 64, 369–378] — phase machine (`...→showdown→roundResult...`), reveal is a presentation flip of `round.revealed`, NO continuous/animation server messages.
- [Source: shared/src/types.ts:114–141] — `ProjectedTableState`: `players[].hand?` (present only when revealed), `revealed`, `loserIds?`, `winnerIds?` (the optional, currently-unset loser data this surface consumes).
- [Source: client/src/components/Card.svelte] — the reusable display-only card (Story 2.5) to render each seat; built for Showdown reuse.
- [Source: client/src/lib/copy.ts:69–73] — `loser(name)` + `TIE` (Story 1.9b, pre-authored for 3.3); keep verbatim.
- [Source: client/src/route-from-state.ts:51–53] — `showdown` already routed for every device incl. eliminated spectators (no routing change here).
- [Source: client/src/components/Button.svelte:122–130; client/src/surfaces/YourTurn.svelte:184] — the canonical `prefers-reduced-motion` block to mirror.
- [Source: client/src/surfaces/YourTurn.svelte.test.ts; client/src/components/Card.svelte.test.ts] — the client-dom test harness + fixture-factory pattern to mirror.
- [Source: client/src/tokens.css:60–64, 156–160] — `--color-error`/`--color-error-container` (loser ramp) + the 4px active-stroke idiom.

## Dev Agent Record

### Agent Model Used

Opus 4.8 (1M context) — claude-opus-4-8[1m]

### Debug Log References

- RED confirmed: `npm test --workspace=client -- --project client-dom Showdown` → 6 failed / 2 passed before implementation (the stub `<h1>Showdown.</h1>` rendered no faces/markers/copy; the 2 negative-marker assertions passed vacuously because nothing rendered). The genuine RED was the face render + loser/receded markers + loser copy.
- GREEN: same command → 8 passed after replacing the stub. No iteration needed.
- Full gates: client 90 passed (82 + 8); server 170 passed (unaffected); lint (GATE-1 egress + GATE-2 purity) clean; typecheck 0 errors; build OK (PWA shell regenerated).

### Completion Notes List

- **`Showdown.svelte` (real surface, replaces the 1.9a stub)** — renders every `state.players` seat as a face-up `Card.svelte` inside a `<ul>`; hands are present only because `revealed === true` (Story 3.2 made `round.revealed` reachable; SM-6 EXTENDED, not weakened — no projection/types change here).
- **Safe flip (AC-3.3.1):** a single coordinated `flip-in` CSS animation (360ms ≤400ms, opacity + rotateY, runs once on mount) — no strobe, nothing >3×/second, no full-viewport flash. Under `@media (prefers-reduced-motion: reduce)` the flip, the loser scale-up, and the recede transition are all dropped (instant face-up; loser by stroke + position only) — the SAME pure-CSS pattern as Button.svelte / YourTurn.svelte (no JS matchMedia branch). jsdom does not evaluate `@media`, so the test asserts the `data-flip` hook is present (the skip applies at runtime), per the story's noted caveat.
- **Loser highlight (AC-3.3.2) — CONSUMER of `state.loserIds`:** `loserIds = state.loserIds ?? []`. Loser seats get the error ramp (4px `--color-error` stroke + `--color-error-container` fill + `scale(1.06)`); non-losers recede to `opacity: 0.7` (≥70% floor — faces stay ≥4.5:1). When `loserIds` is empty (today's bare `showdown` from 3.2, before 3.4's producer) NOTHING is highlighted/receded — all cards render plain face-up. Lights up automatically once Story 3.4 sets `loserIds` (mirrors the 1.4 pre-built `revealed` branch).
- **Loser copy (AC-3.3.3):** `allTied` (every alive seat in `loserIds`, ≥1 loser) → `TIE`; else `youLost` (own id in loserIds, not all-tied) → `loser(ownName)`; else no line. Strings imported verbatim from `copy.ts` (Story 1.9b) — never "YOU LOST" (test-asserted).
- **FX-ready (AC-3.3.4):** discrete `data-flip`/`data-loser`/`data-receded` markers + the `.loser`/`.receded` classes are decoupled from the flip animation, so a v1.1 produced-FX layer can target the loser card without rework.
- **Reuse / scope (AC-3.3.5/.6):** `Card.svelte` kept DISPLAY-ONLY and UNTOUCHED (the flip/highlight live on the Showdown wrapper); routing (`route-from-state.ts`/`App.svelte`), `copy.ts`, `shared/`, server, and `rules/` all unchanged. Only `Showdown.svelte` + its new test changed.
- **Defensive render:** a hand-less seat (the 3.2-deferred project-state.ts:61 edge, reachable once 3.4 leaves eliminated seats in `players[]` while revealed) renders face-down instead of throwing.
- **Pre-mortem-A joint squirm+reveal tuning:** out of scope here (a separate timeboxed design gate), per the story's AC-3.3.7 note.

### File List

- `client/src/surfaces/Showdown.svelte` (modified) — replaced the 1.9a stub with the real Showdown surface (coordinated safe flip, loser highlight keyed on `state.loserIds`, warm loser/all-tied copy, reduce-motion variants, defensive no-hand render).
- `client/src/surfaces/Showdown.svelte.test.ts` (new) — client-dom component tests: faces render; loser/receded markers iff `loserIds`; loser copy + all-tied + never "YOU LOST"; `data-flip` hook; defensive no-hand render.

## Change Log

- 2026-06-22 — Story 3.3 implemented (review): real `Showdown.svelte` surface — coordinated safe flip ≤400ms (360ms `flip-in`, reduce-motion-skipped), loser highlight built as a CONSUMER keyed on `state.loserIds` (error ramp stroke+scale+position; non-losers receded to 70% opacity; bare showdown highlights nothing until 3.4's producer), warm loser/all-tied copy from `copy.ts` (never "YOU LOST"), defensive no-hand render. `Card.svelte` kept display-only/untouched. + new `Showdown.svelte.test.ts` (8 tests). Client 90 / server 170 (unaffected) / lint (GATE-1/2) / typecheck / build green. CLIENT-ONLY — no shared/server/rules/types change. RED-first confirmed (6 fail → pass).
