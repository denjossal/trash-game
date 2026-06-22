---
baseline_commit: 14e3adb
---

# Story 2.5: Peek your own Card

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an active Player,
I want to press and hold to peek my secret Card and have it hide the instant I let go,
so that I can decide my move without ever exposing my hand to the neighbor leaning over.

## Acceptance Criteria

> Source ACs verbatim from [epics.md#Story 2.5] (lines 605–631). The "**Then**" clauses are the binding contract; the AC IDs are this story's addressing scheme.

**AC-2.5.1 — Press-and-hold reveals own Card (rank + single suit pip, Display-XL); release re-hides immediately; never persistent (FR-6, UX-DR7, UX-DR8)**
Given the Your Turn surface,
When the Player presses and holds the peek control,
Then their own Card shows as a **big rank + single suit pip (Display-XL)**, and on **release it re-hides immediately**; it is **never shown persistently**.

**AC-2.5.2 — Peeked Card auto-hides on lost focus / app-background (FR-6 / UX-DR7)**
Given a peeked Card and a distraction,
When the control **loses focus** or the app is **backgrounded**,
Then the Card **auto-hides** (a phone set down never exposes a hand). *(Verified via manual/Playwright — `blur`/`visibilitychange`/`pagehide` are not deterministic in jsdom; Amelia review.)*

**AC-2.5.3 — Hidden default state is a face-down neon-outlined back; rank NOT in the a11y tree while hidden (UX-DR7, UX-DR8)**
Given the hidden (default) state,
When the surface renders,
Then the Card is a **face-down neon-outlined back**, and the **rank is NOT present in the accessibility tree while hidden**. *(Asserted as a node/component a11y-tree test — Amelia review.)*

**AC-2.5.4 — SR peek path announces the rank ONCE to the owner's device only, then discards it (UX-DR7, NFR-10)**
Given the SR peek path,
When the **"Peek your card"** element is activated,
Then it **announces the rank ONCE** to the **owner's device only** and **discards it** (never a persistent readable node, never sent to any other device).

**AC-2.5.5 — rank→letter map lives ONLY in client/src/lib/card-display.ts; suit decorative, distinguished by shape not color (UX-DR8)**
Given the rank→letter display,
When a Card renders,
Then the **int→letter map (1→A … 13→K, Ace lowest)** lives **ONLY in `client/src/lib/card-display.ts`**; suit is **decorative, distinguished by shape not color**.

## Tasks / Subtasks

- [x] **Task 1 — `client/src/lib/card-display.ts`: the rank→letter map + display formatting (pure, client-only)** (AC: 2.5.5, 2.5.1, 2.5.4)
  - [x] CREATED `client/src/lib/card-display.ts` (did not exist). Pure, client-only — imports only the `Card` type; no DOM/socket/Date/Math.random/storage.
  - [x] `rankToLetter(rank)` — 1→"A", 2..10→numerals, 11→"J", 12→"Q", 13→"K". The SOLE home of the letter map; grep confirmed NO letters in server/shared/rules.
  - [x] `rankSpeech(rank)` — face ranks as WORDS (Ace/Jack/Queen/King; chosen over a lone ambiguous letter for SR clarity), else the number; value-only (no derived hints). PLUS `cardSpeech(card)` ("King of spades") — DECISION: the SR announce reads the WORD + suit name (suit spoken for orientation only). Pinned in card-display.test.ts.
  - [x] Suit is decorative by SHAPE not COLOR — no `suitToColor` map; the suit glyph is rendered directly. (Suit never compared — architecture.md:550.)
  - [x] PURE / client-only confirmed: `import type { Card } from "@trash/shared"` only; lint clean.

- [x] **Task 2 — `client/src/components/Card.svelte`: the card-face / face-down-back display component** (AC: 2.5.1, 2.5.3, 2.5.5)
  - [x] CREATED `client/src/components/Card.svelte` — presentational, props `{ card: Card; revealed: boolean }`; only ever fed the owner's own `you.hand` at the call site (SM-6 by construction).
  - [x] Hidden state: `{#if revealed}{:else}` — the revealed face node DOES NOT EXIST in the DOM when hidden (the unambiguous a11y-tree-absent guarantee). The back is an `aria-label="Card, face-down"` neon-outlined element with NO rank/suit node. Asserted by `queryByText("K")`/`queryByText("♠")` → null.
  - [x] Revealed state: big rank via `rankToLetter(card.rank)` at `--type-display-xl-*` (96px/900) + a single large suit pip (`--type-display-lg-size`). Tonal surface + `--stroke-active` neon outline. Single pip, not a corner index. The face glyphs are `aria-hidden="true"` (the SR channel is the YourTurn announce — avoids a double-read).
  - [x] Color-independence: suit is the glyph (shape); no red/black encoding. Rank uses `--color-on-surface` (≥4.5:1 on the dark surface).
  - [x] Display-only — no press/socket/`$state`; a pure function of its props. The press lifecycle lives in YourTurn (Task 3). Reuse-bound for Epic 3 showdown (different `revealed` source).

- [x] **Task 3 — `client/src/surfaces/YourTurn.svelte`: replace the peek PLACEHOLDER with the real press-and-hold peek + auto-hide lifecycle** (AC: 2.5.1, 2.5.2, 2.5.3, 2.5.4)
  - [x] REPLACED the 2.4 `aria-disabled` placeholder with an operable peek control + the `Card.svelte` display. SWAP/KEEP remain the FIRST two focus stops — the standing focus-order test still passes (peek is after them).
  - [x] `let revealed = $state(false)` — LOCAL UI-only; never sent. No `sendPeek` intent added. **NOTE:** the `state` prop was renamed `proj` (`const { state: proj } = $props()`) because the `$state` rune collides with a variable literally named `state` in Svelte 5 (parsed as a store auto-subscription → "state is not a store" runtime error). Documented inline.
  - [x] Press-and-hold via Pointer Events: `onpointerdown`→reveal, `onpointerup`/`onpointercancel`/`onpointerleave`→hide (unified mouse+touch, no double-fire). Keyboard (sighted): `onkeydown` Enter/Space→reveal, `onkeyup`→hide. `touch-action:none` + `user-select:none` so a hold doesn't scroll/select. (`setPointerCapture` not needed — `pointerleave` already covers a drag-off.)
  - [x] Release re-hides immediately — `revealed=false` on pointerup/cancel/leave/blur; NO timer, NO pin-toggle (strictly held-open; mirrors UX-DR18 no-timers).
  - [x] Auto-hide (AC-2.5.2): `onblur` on the control; `document` `visibilitychange` (when `document.hidden`) + `window` `pagehide` registered in a `$effect` that RETURNS its teardown (listeners removed on unmount — no leak). `blur` is jsdom-tested (passes reliably); `visibilitychange`/`pagehide` are wired but verified by manual (non-deterministic in jsdom — see Task 6 + Completion Notes).
  - [x] Renders `Card.svelte` fed `card={proj.you.hand}` + `revealed`, guarded `{#if proj.you.hand}` (optional `hand?`) so an early/odd projection can't throw (test added). The card sits above the actions block, subordinate to the two-button hero (NFR-9).
  - [x] Reused `PEEK_HINT` as the control's `aria-label`. No new copy string needed — the SR announce text is built from `cardSpeech(...)` (card-display.ts), not a copy.ts string.

- [x] **Task 4 — The SR-accessible "Peek your card" path: announce the rank ONCE to the owner's device, then discard (AC-2.5.4, NFR-10)** (AC: 2.5.4)
  - [x] Activating the peek (pointerdown / Enter / Space) sets an `aria-live="assertive"` region (`data-testid="peek-announce"`, `.sr-only` visually-hidden) to `cardSpeech(hand)` ("King of spades") ONCE; on release/blur/background it is CLEARED to `""` — never a persistent readable node. Built from `proj.you.hand` (owner's own card), never sent anywhere.
  - [x] Implementation: a `$state` string `announcement`, set in `reveal()`, cleared in `hide()` — the SAME lifecycle as `revealed`. The rank text never sits in the DOM after release (satisfies both "discards it" AC-2.5.4 and the a11y-tree-absent AC-2.5.3). Pinned by the YourTurn announce-once test (empty → cardSpeech → empty).
  - [x] The two channels share one `reveal()`/`hide()` pair, so the visual face and the SR announce are always consistent (no double-announce, no stale value). DECISION wiring: pointerdown/keydown → `reveal()` (sets both `revealed` + `announcement`); pointerup/cancel/leave/blur/keyup/visibilitychange/pagehide → `hide()` (clears both). The peek announce region is SEPARATE from the existing YOUR_TURN turn-announce region (not clobbered); assertive ensures the rank is heard.
  - [x] No new wire message, no `sendPeek`, no server round-trip — grep-confirmed no `.send(`/`sendPeek` in the peek path; the announce is local. SM-6 unchanged (the peeked card is the owner's own, already on-device).

- [x] **Task 5 — Tests: card-display map, Card.svelte hidden/revealed + a11y-tree-absent, YourTurn peek reveal/re-hide + SR announce-once** (AC: all)
  - [x] **`client/src/lib/card-display.test.ts`** (NEW, client-node, 6 tests): full 1..13 letter map (Ace=A, 11→J, 12→Q, 13→K, 2..10 numerals, 13 distinct labels); `rankSpeech` face words + numbers; `cardSpeech` ("King of spades").
  - [x] **`client/src/components/Card.svelte.test.ts`** (NEW, client-dom, 4 tests): HIDDEN → `queryByText("K")`/`queryByText("♠")` null (a11y-tree-absent) + a labelled face-down back; REVEALED → `getByText("K")` + suit glyph; pip rank numeral + suit glyph.
  - [x] **`client/src/surfaces/YourTurn.svelte.test.ts`** (MODIFY, +8 tests; the 8 standing 2.4 tests untouched and green): peek is a `<button>` AFTER SWAP/KEEP (focus-order contract holds); default hidden (rank absent from a11y tree); pointerDown reveals → pointerUp re-hides (K and 5 fixtures); pointercancel/pointerleave/blur re-hide; SR announce-once (empty → cardSpeech → empty); peeking sends NOTHING (sendSwap/sendKeep uncalled); missing-hand guard doesn't throw.
  - [x] **AC-2.5.2 path taken:** `blur` IS jsdom-tested (reliable) and passes; `visibilitychange`/`pagehide` are wired in a `$effect` but NOT unit-tested (non-deterministic in jsdom per the AC) — verified manually (Task 6 checklist). Documented in Completion Notes.
  - [x] **GATE checks:** `npm run lint` green (GATE 1 — no `socket.send`/peek-intent in the peek path, grep-confirmed; GATE 2 untouched — no server change); `npm run typecheck` 0 errors (svelte-check 194 files, 0 problems); `npm test` → **server 112 (unchanged) / client 76 (was 58 → +18)**, no regressions; `npm run build --workspace=client` succeeds.

- [x] **Task 6 — Manual / Playwright verification of the non-deterministic auto-hide (AC-2.5.2)** (AC: 2.5.2)
  - [x] No Playwright harness was scaffolded (out of scope — confirmed none exists). The wiring is shipped + the `blur` reset is jsdom-tested. The MANUAL verification checklist for the non-deterministic paths is recorded in Completion Notes (background / tab-switch → hides; focus-loss → hides; navigate-away → hides). These become the first e2e cases if Playwright is added in a future story.

## Dev Notes

### What this story IS / IS NOT
- **IS:** a **client-only** story. The "peek your own Card" interaction: (1) the pure `card-display.ts` rank→letter map (the file's first existence — it's named in the architecture but never authored); (2) a `Card.svelte` display component (face-down neon back ↔ revealed Display-XL face); (3) the real press-and-hold peek + auto-hide lifecycle in `YourTurn.svelte` (replacing the 2.4 PLACEHOLDER); (4) the SR-accessible announce-once path. Peeking is LOCAL UI-only state, never sent to the server.
- **IS NOT:** any SERVER change (no engine/handler/validate/projection/dispatch edit — `you.hand` is ALREADY projected to the owner's device [project-state.ts; types.ts:125]); any WIRE-CONTRACT change (NO `sendPeek` intent — there is none and must not be one; peeking never round-trips); the Last-Player `drawFromDeck` + `allActed` transition (Story 2.6); Showdown reveal/flip (Epic 3 — UX-DR9, where the card-display `Card.svelte` will be REUSED face-up for ALL players); a full Playwright/e2e harness (out of scope — AC-2.5.2's background/pagehide path is manual-confirmed).

### The privacy line — why this story does NOT touch SM-6's chokepoint
- SM-6 (the standing negative-assertion privacy invariant) is about **NON-owner cards never reaching the client**. Peek reveals the owner's OWN card (`you.hand`), which is ALREADY legitimately projected to the owner's device by `projectStateFor` (the 2.3/2.4 work). So this story adds NO server projection change and does NOT re-open SM-6 — `projectStateFor` still emits ONLY `you.hand` (own) and omits all `players[].hand` while `revealed===false`. The peek is a pure CLIENT-SIDE display of data the device already holds. [architecture.md:556 "only UI-only state (peeking) is local and never sent"; project-state own-hand-only invariant.]
- **The one privacy obligation this story OWNS:** the rank must not LEAK into the accessibility tree while hidden (AC-2.5.3) — a screen reader (or the neighbor's AT) must not read a card the owner hasn't chosen to peek. That is the `{#if revealed}` conditional-render guarantee (the rank node literally does not exist when hidden), asserted as an a11y-tree-absent test.

### card-display.ts — the SOLE home of the letter map (architecture-enforced)
- The architecture rule is explicit and grep-checkable: **"int→letter map (`1→A … 13→K`) lives ONLY in `src/client`"** [architecture.md:551], and the directory tree names `client/src/lib/card-display.ts # rank→letter map (1→A…13→K) — CLIENT-ONLY` [architecture.md:723]. `types.ts:16` repeats this. The file does NOT exist yet — this story CREATES it. Do NOT scatter the map into `Card.svelte` or anywhere else; import `rankToLetter` from this one module. A reviewer (or a future grep) must find the letters in exactly one place.
- **Ace is LOW (1→"A"), King is HIGH (13→"K")** [UX-DR8; epics.md:631]. This matches the rank ordering `rank` 1..13 used at Showdown (lowest rank loses — Epic 3). The map is display-only; the COMPARISON of ranks is server-side at Showdown (Story 3.1) and uses the integer, never the letter [architecture.md:550 "rank as a string" is a violation].
- **Suit is decorative, distinguished by SHAPE not COLOR** [UX-DR8; NFR-10 color-independence]. `Card.suit` is already the glyph (`"♠"|"♥"|"♦"|"♣"` [types.ts:19–22]) — render it directly as a large pip. NO red/black hue encoding as the sole differentiator. NO `suitToColor`.

### Card.svelte — display-only, REUSE-bound for Epic 3
- Build it as a pure presentational component (`{ card: Card; revealed: boolean }`) with NO interaction logic — the press lifecycle + `revealed` state live in the OWNER surface (`YourTurn.svelte`). This keeps the component reusable for **Showdown (Epic 3, UX-DR9)** where ALL players' cards flip face-up together — the same `Card.svelte` will render face-up there, just driven by a different `revealed` source (the showdown `revealed===true`). Design the prop surface so Epic 3 reuses it without surgery (don't bake "your turn" assumptions in).
- **Hidden state = face-down neon-outlined back; the rank node MUST NOT exist in the DOM/a11y-tree while hidden.** Use `{#if revealed}` to conditionally render the face (the node is absent when hidden — the unambiguous a11y-tree-absent guarantee). Do NOT mount-and-hide-with-CSS (fragile for the a11y-tree test). [AC-2.5.3.]
- **Display-XL for the rank:** `--type-display-xl-size:96px / -weight:900 / -line:100px / -tracking:-0.04em` [tokens.css:93–96]. Single large suit pip (not a 4-corner index, not photoreal — UX-DR8). The face uses a tonal surface + neon outline (`--stroke-active` = 4px neon mint [tokens.css:158–160]); the back is the same card shape with the neon outline and no glyphs. Radius from the `--radius-*` set [tokens.css:147–152]. No card-back-specific token exists — compose from the existing surface/stroke/radius tokens.

### YourTurn.svelte — replace the 2.4 peek PLACEHOLDER; preserve the standing contract
- 2.4 shipped `<button class="peek" aria-disabled="true">{PEEK_HINT}</button>` as a deliberate placeholder AFTER SWAP/KEEP [YourTurn.svelte:60–63], with the scope cut documented in 2.4's notes. This story makes it OPERABLE. **Do NOT change the focus-order contract:** SWAP + KEEP MUST remain `buttons[0]`/`buttons[1]` (a standing 2.4 test pins this [YourTurn.svelte.test.ts:57–63]); the peek control stays after them. Remove `aria-disabled="true"` (it becomes operable).
- **`revealed` is `$state` and LOCAL — never sent.** "Client holds the last `tableState` read-only; only UI-only state (peeking) is local and never sent" [architecture.md:556]. There is no peek intent in the `Intent` union [types.ts] and must not be one. The peek reads `state.you.hand` (already on-device).
- **Press-and-hold via Pointer Events** (unify mouse+touch, avoid double-fire): `onpointerdown`→reveal, `onpointerup`/`onpointercancel`/`onpointerleave`→hide. Consider `setPointerCapture` so a drag off the button still releases. The Button.svelte DEBOUNCE pattern is for one-shot CLICK actions (Swap/Keep) — peek is a HOLD, so it does NOT reuse Button.svelte's click-debounce; it's a bespoke press-and-hold on a plain `<button>`. (Button.svelte is still reused for SWAP/KEEP, unchanged.)
- **Auto-hide listeners (`visibilitychange`/`pagehide` on document/window; `blur` on the control):** register in a `$effect` and RETURN the teardown so they're removed on unmount (no leaked listeners across surface transitions — the discipline deferred-work #104 flagged for the Button unmount-timer applies equally to listeners here). `blur` is reliably testable in jsdom; `visibilitychange`/`pagehide` are NOT (AC-2.5.2 / Amelia review) → manual/Playwright.
- **`you.hand` is OPTIONAL** [types.ts:125 `hand?: Card`] — guard `{#if state.you.hand}` before rendering Card.svelte so an early/odd projection can't throw. On the active player's `turns` projection it's present.

### The SR announce-once path (AC-2.5.4) — the a11y mirror of press-and-hold
- A screen-reader / keyboard user cannot "hold". So the peek control, on ACTIVATION (click/Enter/Space), announces the rank ONCE via an `aria-live="assertive"` region, then CLEARS the region (the rank is NOT a persistent readable node). Owner's device only — built from `you.hand` already on-device, NEVER sent anywhere.
- Use a `$state` string `announcement` set on activate and cleared on release/blur/visibilitychange (same lifecycle as `revealed`). Prefer the spoken WORD for face cards (`rankSpeech`: "King" not a lone "K") for SR clarity. Don't leave the rank text in the DOM after the announce (would violate both AC-2.5.4 "discards it" and risk AC-2.5.3 a11y-tree-absent).
- Note the existing 2.4 prompt is already a `role="status" aria-live="assertive"` region [YourTurn.svelte:48] carrying YOUR_TURN — the peek announce is a SEPARATE live region (don't clobber the turn announce). Two assertive regions is acceptable; consider `aria-live="polite"` for the peek announce if the turn announce should not be interrupted — decide and document (the AC says "announces the rank ONCE", assertive ensures it's heard; polite is gentler — pick one and pin it).

### Current code state (verified — read these before writing)
- **`client/src/surfaces/YourTurn.svelte`** [1–149]: the 2.4 two-button hero. The peek PLACEHOLDER is at [:60–63] (`<button class="peek" aria-disabled="true">`); the `.peek` CSS at [:133–148]. SWAP/KEEP are `Button.svelte` primaries [:58–59]; `justReceivedSwap` squirm beat [:50–53]; the surface frame + pulse [:67–102]. REPLACE the placeholder + add the Card display + the peek lifecycle. Imports `JUST_SWAPPED, KEEP, PEEK_HINT, SWAP, YOUR_TURN` from copy [:29].
- **`client/src/lib/card-display.ts`** — **DOES NOT EXIST.** CREATE it (Task 1). Named in [architecture.md:723; types.ts:16] as the CLIENT-ONLY letter-map home.
- **`client/src/components/Button.svelte`** [1–131]: REUSED unchanged for SWAP/KEEP. Its debounce is for one-shot clicks, NOT for press-and-hold — do not force the peek through it. `--type-display-xl-*` tokens are NOT used by Button; the new Card.svelte uses them.
- **`client/src/components/`** — holds `Button.svelte`, `LivesPips.svelte`. ADD `Card.svelte` here (Task 2) — same pattern (a reused presentational widget).
- **`shared/src/types.ts`**: `Card = { rank: number; suit: "♠"|"♥"|"♦"|"♣" }` [:19–22]; `Round.hands: Record<string, Card>` (SERVER-ONLY) [:70]; `ProjectedTableState.you.hand?: Card` (own card only) [:119–126, esp. :125]. NO change — the contract already carries the owner's own card. The map-lives-in-client comment is at [:16].
- **`client/src/lib/interaction.ts`** [1–24]: exports `DEBOUNCE_MS` (350) + `MAX_NAME_LEN` (20) ONLY — no press/visibility helpers. You MAY add a press-hold or visibility helper here IF reused, but a one-surface lifecycle can live inline in YourTurn.svelte; prefer inline unless a second consumer is clear.
- **`client/src/lib/copy.ts`** [1–82]: `PEEK_HINT` ("Press and hold to peek.") [:57–58] already exists — reuse as the control's label/hint. Add a `peekAnnounce(rank)`/SR string ONLY if the SR path needs distinct copy (warm-voice annotation per the module header).
- **`client/src/lib/table-store.svelte.ts`**: `sendSwap`/`sendKeep` seams (2.4). NO new send seam — peek does not send. `handleSocketMessage` swallows errors silently (unchanged).
- **`client/src/route-from-state.ts`** + **`App.svelte`**: route/render YourTurn already (2.4). NO change.
- **`client/src/tokens.css`**: `--type-display-xl-size:96px`/`-weight:900`/`-line:100px`/`-tracking:-0.04em` [:93–96] for the revealed rank; `--stroke-active` (4px neon mint) [:158–160] for the card outline/back; `--border-inert` [:162–164]; `--radius-*` [:147–152]; `--color-on-surface`/`--color-secondary-container` (#36ffc4) for legibility/neon. No card-back-specific token — compose from these.

### Testing standards (match the house style)
- **Client Vitest projects** [client/vitest.config.ts]: `client-node` (env `node`, `src/**/*.test.ts` EXCLUDING `*.svelte.test.ts`) for pure modules → `card-display.test.ts` goes HERE (no `.svelte` suffix). `client-dom` (env `jsdom`, `*.svelte.test.ts`, plugins `svelte()`+`svelteTesting()`) for component/surface tests → `Card.svelte.test.ts` + the YourTurn additions go HERE. **Name a pure-fn test `*.test.ts` (NOT `.svelte.test.ts`) or it runs in jsdom unnecessarily; name a component test `*.svelte.test.ts` or it runs in node and `render` fails.**
- **Client test style** [YourTurn.svelte.test.ts; Lobby.svelte.test.ts; Button.svelte.test.ts]: `@testing-library/svelte` `render`/`screen`/`fireEvent`; `getByRole("button", {name})` / `getByText` for presence; **`queryByText`/`queryByRole` → `toBeNull()` for ABSENCE (the a11y-tree-absent pattern this story leans on)** [YourTurn.svelte.test.ts:104,117]; `vi.mock("../lib/table-store.svelte", …)` to assert no send during peek; `fireEvent.pointerDown`/`pointerUp` for the press-and-hold (jsdom supports synthetic pointer events); `fireEvent.blur` for the lost-focus reset.
- **Pure-fn style** [engine.test.ts/validate.test.ts server precedent applies to client-node too]: `import { expect, test } from "vitest"`; loop the 13 ranks for the map property.
- **a11y-tree-absent assertion (AC-2.5.3) — the key new test pattern:** render hidden → `expect(screen.queryByText("K")).toBeNull()` (the rank node is absent because `{#if revealed}` doesn't render it). This is stronger than checking `aria-hidden` because the node truly isn't in the tree. Pair with a revealed-state `getByText("K")` to prove the toggle.
- **Non-deterministic ACs (AC-2.5.2):** `blur` is jsdom-reliable (test it); `visibilitychange`/`pagehide` are NOT (AC says so) → manual/Playwright. Do NOT write a flaky `visibilitychange` jsdom test that passes locally and fails in CI — if it's flaky, assert listener registration + leave behavior to manual, and SAY SO in Completion Notes.

### Previous story intelligence (Stories 2.1–2.4 — 2.4 in review, rest done)
- **2.4** shipped the YourTurn two-button hero with the peek PLACEHOLDER this story replaces, the real Waiting surface, the `sendSwap`/`sendKeep` seams, and the `justReceivedSwap` squirm beat. 2.4's notes EXPLICITLY deferred "the peek reveal interaction + card-display.ts rank→letter map" to THIS story (2.5), and noted the Reluctant-Player play-confirmed property (AC-2.4.5) completes only once 2.5's clean re-hide lands ("the two are tuned together"). So 2.5 closes the peek→Swap/Keep unaided loop. The 2.4 surface tests (focus order, debounce, squirm) are STANDING — do not break them.
- **2.4** established: SWAP/KEEP first focus stops (pinned test), `you.hand` carried in the test fixture but NOT yet rendered, peeking deferred. The client send-seam discipline (surfaces call table-store seams, never `socket.send`) — peek adds NO seam (it's local).
- **1.9a/1.9b/1.10** built the design tokens (incl. `--type-display-xl-*`), `Button.svelte` (debounce/≥72px/reduce-motion), `interaction.ts`, `copy.ts`, the render-from-state router, and the components/ dir. 2.5 adds `Card.svelte` + `card-display.ts` into those established homes.
- **Client lineage:** no Svelte 5 runes gotcha noted beyond the standard `$state`/`$derived`/`$props`/`$effect`. Use `$effect` (with teardown) for the document/window listeners; `$state` for `revealed` + `announcement`.

### Git intelligence
- Recent commits (2.1→2.2→2.3→2.4) are each one tightly-scoped slice, full gate verification, no scope creep. 2.4 was the larger full-stack slice; **2.5 is SMALLER and CLIENT-ONLY** — `card-display.ts` (new), `Card.svelte` (new), `YourTurn.svelte` (peek placeholder → real), tests. No server file, no shared file, no wire change, no new dependency. Keep it contained; resist adding a Playwright framework (manual-confirm AC-2.5.2).

### Project Structure Notes
- **New (client):** `client/src/lib/card-display.ts` (pure rank→letter map + SR-speech helper, client-only); `client/src/components/Card.svelte` (face-down back ↔ Display-XL face, display-only, REUSE-bound for Epic 3 showdown).
- **Modified (client):** `client/src/surfaces/YourTurn.svelte` (peek PLACEHOLDER → real press-and-hold + auto-hide lifecycle + SR announce-once + Card.svelte render); `client/src/lib/copy.ts` (ONLY if an SR-announce string is added).
- **New (tests):** `client/src/lib/card-display.test.ts` (client-node); `client/src/components/Card.svelte.test.ts` (client-dom).
- **Modified (tests):** `client/src/surfaces/YourTurn.svelte.test.ts` (+peek reveal/re-hide/a11y-tree-absent/SR-announce/no-send tests; standing 2.4 tests untouched).
- **No change:** ALL of `server/**` and `shared/**` (no server/projection/contract change — `you.hand` already projected); `client/src/components/Button.svelte` + `LivesPips.svelte` (reused as-is); `client/src/lib/table-store.svelte.ts` (no peek seam); `client/src/route-from-state.ts` + `App.svelte` (already route/render YourTurn); `eslint.config.js`/`wrangler.jsonc`/vitest configs.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.5 — Peek your own Card (lines 605–631)] — the 5 source ACs verbatim (press-and-hold reveal + immediate re-hide; auto-hide on lost-focus/background; face-down back + rank-not-in-a11y-tree-while-hidden; SR announce-once owner-only; letter-map lives only in card-display.ts + suit by shape).
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2 (490–494) — FR-6; UX-DR5/6/7/8 (lines 77–80); NFR-9 (eyes-up minimal surface), NFR-10 (a11y floor: keyboard, role+state, SR announce, color-independence)]
- [Source: _bmad-output/planning-artifacts/epics.md UX-DR7 (line 79 — press-and-hold reveal, release re-hides, auto-hide on lost-focus/background, rank never persistent / never in a11y-tree when hidden, SR announce-once owner-only), UX-DR8 (line 80 — big rank + single suit pip, Ace=A lowest / King=K highest, suit decorative by shape not color, face-down neon-outlined back, letter map ONLY in client/src/lib/card-display.ts), UX-DR18 (no timers/auto-advance)]
- [Source: _bmad-output/planning-artifacts/architecture.md:551 ("int→letter map (1→A … 13→K) lives ONLY in src/client"), :550 (rank is integer 1–13, suit never compared), :556 ("Client holds the last tableState read-only; only UI-only state (peeking) is local and never sent"), :723 (directory tree — client/src/lib/card-display.ts # rank→letter map — CLIENT-ONLY), :493–494 (build sequence — "peek (local)" is client step 6)]
- [Source: shared/src/types.ts:16 (the card-display.ts client-only comment), :19–22 (Card type — rank:number 1..13, suit glyph never compared), :70 (Round.hands SERVER-ONLY), :119–126 (ProjectedTableState.you, :125 hand?: Card own-card-only)]
- [Source: client/src/surfaces/YourTurn.svelte:60–63 (the 2.4 peek PLACEHOLDER to replace), :133–148 (.peek CSS), :48 (the existing YOUR_TURN assertive live region — don't clobber), :29 (copy imports incl. PEEK_HINT)]
- [Source: client/src/lib/copy.ts:57–58 (PEEK_HINT — reuse); client/src/lib/card-display.ts (TO CREATE); client/src/components/Card.svelte (TO CREATE); client/src/components/Button.svelte (reused for SWAP/KEEP, NOT for press-and-hold); client/src/lib/interaction.ts:1–24 (DEBOUNCE_MS/MAX_NAME_LEN only)]
- [Source: client/src/tokens.css:93–96 (--type-display-xl-* for the revealed rank), :158–160 (--stroke-active neon mint for the card outline/back), :147–152 (--radius-*), :162–164 (--border-inert)]
- [Source: client/vitest.config.ts (client-node for card-display.test.ts; client-dom for *.svelte.test.ts); client/src/surfaces/YourTurn.svelte.test.ts:15–20 (table-store mock), :57–63 (the STANDING focus-order test — must keep passing), :104,117 (the queryByText→null absence pattern this story reuses for the a11y-tree-absent assertion), :34 (you.hand fixture rank 5)]
- [Source: _bmad-output/implementation-artifacts/2-4-take-a-turn-swap-or-keep-the-two-button-hero.md (the peek deferral to 2.5; the Reluctant-Player loop closing here; the SWAP/KEEP focus-order standing contract; the client send-seam discipline — peek adds none); deferred-work.md #104 (clear timers/listeners on unmount — applies to the document/window auto-hide listeners here)]

## Dev Agent Record

### Agent Model Used

Amelia (Senior Software Engineer persona) on Claude Opus 4.8 (1M context).

### Debug Log References

- `npx vitest run --project client-node src/lib/card-display.test.ts` → 6 passed (letter map 1..13, rankSpeech, cardSpeech).
- `npx vitest run --project client-dom src/components/Card.svelte.test.ts` → 4 passed (hidden a11y-tree-absent + face-down back; revealed rank+pip; pip numeral).
- `npx vitest run --project client-dom src/surfaces/YourTurn.svelte.test.ts` → 16 passed (8 standing 2.4 + 8 new peek).
- **RED→GREEN issue (recorded):** initial YourTurn run failed ALL 16 with `state is not a store with a subscribe method`. Cause: the `$state` rune collides with a variable literally named `state` (the `$props()` binding) in Svelte 5 — the compiler parses `$state` as a store auto-subscription on `state`. FIX: renamed the prop binding to `proj` (`const { state: proj } = $props()`). Re-ran → 16 passed.
- `npm run test --workspace=client` → 76 passed (9 files); was 58 → **+18** (card-display 6, Card 4, YourTurn +8).
- `npm test` (root) → server **112 passed (15 files, UNCHANGED — confirms client-only, no server regression)**, client **76 passed (9 files)**.
- `npm run lint` → green. `npm run typecheck` → 0 errors (svelte-check 194 files, 0 problems). `npm run build --workspace=client` → built OK.
- GATE greps: letter map (`"K"`/`"J"`/`"Q"`/`rankToLetter`) absent from `server/src`+`shared/src` (architecture.md:551 holds); no `.send(`/`sendPeek` in the peek path (only a 2.4 doc COMMENT mentions `socket.send`).

### Completion Notes List

- **Client-only slice, no server/contract change.** `you.hand` was ALREADY projected to the owner's device (2.3/2.4) — this story only adds the CLIENT display + the local peek interaction. No `server/**` or `shared/**` file changed; the wire contract is untouched; no new dependency.
- **`card-display.ts` — the SOLE letter-map home (AC-2.5.5):** created the file the architecture named but never authored. `rankToLetter` (1→A Ace-low … 13→K), `rankSpeech` (face WORDS for SR clarity), `cardSpeech` ("King of spades"). Grep-confirmed the letters live ONLY here (architecture.md:551). Suit is rendered as the glyph (shape), never color-encoded (NFR-10 color-independence); no `suitToColor` map.
- **`Card.svelte` — display-only, a11y-tree-absent by construction (AC-2.5.3):** the revealed face is in `{#if revealed}`, so the rank/suit nodes DO NOT EXIST in the DOM/a11y tree while hidden — the unambiguous absence guarantee (asserted by `queryByText→null`). Hidden state is a neon-outlined `aria-label="Card, face-down"` back. Revealed face: Display-XL rank (96px) + single large suit pip, `aria-hidden` (the SR channel is the YourTurn announce — no double-read). Built reuse-bound for Epic 3 showdown (a different `revealed` source flips it face-up).
- **Press-and-hold + auto-hide (AC-2.5.1/.2):** `revealed` is LOCAL `$state`, never sent (no `sendPeek` — architecture.md:556). Pointer Events (down→reveal; up/cancel/leave→hide) unify mouse+touch; keyboard Enter/Space hold→reveal, keyup→hide. Release re-hides IMMEDIATELY — no timer, no pin (UX-DR18). Auto-hide on `blur` + `document` `visibilitychange` (when hidden) + `window` `pagehide`, registered in a `$effect` that RETURNS its teardown (no leaked listeners across surface transitions — deferred-work #104 discipline). `touch-action:none`/`user-select:none` so a hold doesn't scroll/select.
- **SR announce-once (AC-2.5.4):** a `$state` `announcement` string set to `cardSpeech(hand)` on reveal and cleared to `""` on hide — announced once via an `aria-live="assertive"` `.sr-only` region (`data-testid="peek-announce"`), never a persistent readable node, owner-device-only (built from `proj.you.hand`, never sent). Separate from the existing YOUR_TURN turn-announce region (not clobbered).
- **Svelte 5 gotcha fixed:** renamed the `state` prop binding to `proj` to avoid the `$state`-rune / `state`-variable collision (it threw `state is not a store with a subscribe method` at runtime). All `state.*` reads in YourTurn became `proj.*`. No behavioral change.
- **AC-2.5.2 test strategy (as the AC dictates):** `blur` is jsdom-reliable → unit-tested. `visibilitychange`/`pagehide` are non-deterministic in jsdom → wired but verified MANUALLY, not unit-tested (no flaky CI test planted). **Manual verification checklist (to run on a real device / the dev server):** (1) on Your Turn, press-and-hold peek → card face shows; release → hides immediately. (2) Peek, then background the app (home button) or switch tabs → card hides (visibilitychange). (3) Peek, then tab/focus away from the control → card hides (blur). (4) Peek, then navigate away / reload → card hides (pagehide). (5) With a screen reader, activate the peek → the rank is announced once ("King of spades"), and nothing persists. (6) With Reduce Motion on, the surface frame is static (unchanged from 2.4) and peek still works.
- **Scope held:** no server/shared/contract change; no new ErrorReason; no peek intent; no new dependency; no Playwright scaffold. The standing SM-6 server test, the 2.4 surface tests (focus order, debounce, squirm), and all prior gates stay green. The 2.4 Reluctant-Player loop (peek → Swap/Keep, clean re-hide) is now fully reachable for play-confirmation.

### File List

- `client/src/lib/card-display.ts` (NEW) — pure rank→letter map (`rankToLetter`, the SOLE home), `rankSpeech`, `cardSpeech`; client-only.
- `client/src/lib/card-display.test.ts` (NEW) — 6 client-node tests.
- `client/src/components/Card.svelte` (NEW) — display-only card (face-down neon back ↔ Display-XL face via `{#if revealed}`; a11y-tree-absent when hidden; reuse-bound for Epic 3).
- `client/src/components/Card.svelte.test.ts` (NEW) — 4 client-dom tests.
- `client/src/surfaces/YourTurn.svelte` (MODIFIED) — peek PLACEHOLDER → real press-and-hold peek + auto-hide ($effect listeners w/ teardown) + SR announce-once; renders `Card.svelte`; `state` prop renamed `proj` to dodge the `$state`-rune collision.
- `client/src/surfaces/YourTurn.svelte.test.ts` (MODIFIED) — +8 peek tests (the 8 standing 2.4 tests preserved).

### Change Log

- 2026-06-22 — Implemented Story 2.5 (Peek your own Card), CLIENT-ONLY: new pure `card-display.ts` (SOLE rank→letter map 1→A…13→K + SR speech), new display-only `Card.svelte` (face-down neon back ↔ Display-XL face; rank absent from the a11y tree while hidden via `{#if revealed}`; reuse-bound for Epic 3 showdown), and `YourTurn.svelte` peek PLACEHOLDER → real press-and-hold reveal with immediate re-hide + auto-hide on blur/visibilitychange/pagehide (`$effect` with teardown) + an owner-only SR announce-once live region. `revealed` is local UI-only `$state`, never sent (no peek intent/no server/no contract change). Renamed the `state` prop to `proj` to avoid the Svelte-5 `$state`-rune collision. +18 client tests (76 total); server 112 unchanged; lint + typecheck + build green. Status → review.
