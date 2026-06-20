---
baseline_commit: 38e2e7a
---

# Story 1.9b: PWA shell, voice primitives & interaction safety

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As any Player,
I want the app installable, warm in its words, and safe to tap,
so that the installability, voice, and interaction-safety primitives every surface inherits are in place.

## Acceptance Criteria

**AC-1.9b.1 — `vite-plugin-pwa` provides a real installable app-shell: full warm manifest + the two produced icons; portrait-only, dark-only; offline gameplay explicitly out of scope.**
Given the PWA shell,
When the app is built and installed (Add to Home Screen),
Then the `vite-plugin-pwa` `manifest` in `client/vite.config.ts` is upgraded from the 1.9a placeholder to the full installable manifest: `name: "Trash"`, `short_name: "Trash"`, `description` = the warm corrected copy (AC-1.9b.2), `start_url: "/"`, `display: "standalone"`, `orientation: "portrait"`, `background_color: "#1a0b2e"`, `theme_color: "#1a0b2e"` (the DESIGN.md surface `#1a0b2e` — NOT the 1.9a placeholder `#1a1320`), and an `icons` array referencing the two produced icons (a 192×192 and a 512×512 PNG with `purpose` including `"any"`; add a `"maskable"`-purpose entry so the icon survives Android's mask). The two icon PNGs are committed under `client/public/icons/`, and `index.html` gets the matching `<link rel="icon">` + `<link rel="apple-touch-icon">` tags. **Offline gameplay stays explicitly out of scope** — the shell precaches the app assets (the existing `workbox.globPatterns` already adds the fonts) but the game requires the live WebSocket; do NOT add an offline gameplay fallback / runtime caching of game data. The shell remains dark-only + portrait-only (no light-mode media query, no landscape layout). *(UX-DR17; epics.md#Story-1.9b lines 430–432; architecture.md#Complete-Project-Directory-Structure — `public/manifest.json` "(cleaned, warm copy)", `public/icons/` "the two produced app icons", PWA-scope footnote "Offline gameplay is explicitly out of scope".)*

**AC-1.9b.2 — The manifest description is the corrected WARM voice; the generated "high-stakes underground" copy is rejected.**
Given the manifest `description` string,
When it is authored,
Then it uses the warm, plainspoken, inclusive voice and the generated "a high-stakes underground card gathering" copy is NOT used. Use the already-corrected source copy verbatim: **"A party card game for friends and family at the same table — your phone is the dealer."** (from `ux-designs/…/imports/manifest.json`). The words "high-stakes" and "underground" must appear nowhere in the manifest, the page `<title>`/meta, or any shipped string. *(UX-DR16; epics.md#Story-1.9b line 432; EXPERIENCE.md "Voice and Tone" line 41 — "The generated manifest description … is rejected; corrected at finalize."; DESIGN.md Brand & Style line 115; imports/manifest.json line 4.)*

**AC-1.9b.3 — Shared microcopy/voice primitives: a single client copy module holds the approved strings from the EXPERIENCE.md voice table, used wherever copy already renders.**
Given the shared microcopy primitives,
When UI strings render,
Then a single client-only copy module (`client/src/lib/copy.ts`) exports the approved phrasings from the EXPERIENCE.md microcopy table verbatim (see Dev Notes "Voice table — copy.ts source of truth"), as named constants and/or small template functions for the parameterized lines (e.g. `winner(name)` → `` `${name} wins it. One more?` ``, `loser(name)`, `badCode()`, `waitingForHost(host)`). The strings are warm/playful/plainspoken/inclusive and contain NONE of the forbidden framings ("high-stakes", "underground", "You lost", "You failed", "Game over. You have been eliminated", "Error 404", jargon like "Awaiting host action" / "Make your selection"). The two 1.9a stub surfaces that already render real copy — `Home.svelte` ("Trash"/"Connecting…") and `Eliminated.svelte` ("You're out."/"Stick around and heckle.") — are refactored to pull their visible strings from `copy.ts` (proving the module is the source of truth, not dead code). Other surface stubs are NOT fleshed out here (their real copy lands when 1.10/Epic 2/Epic 3 build the surfaces) — but their eventual strings already live in `copy.ts` for those stories to consume. *(UX-DR16; epics.md#Story-1.9b lines 430–432 + decision #5 cross-epic voice thread; EXPERIENCE.md microcopy table lines 43–58; architecture.md#Client-boundary — client-only `client/src/lib`.)*

**AC-1.9b.4 — A shared interaction-safe Button primitive exists: debounced (no double-fire), ≥48dp tap target, primary press-scales to 95%, reduce-motion-safe.**
Given the interaction-safety primitive,
When any primary action is tapped,
Then a single reusable `Button` component (`client/src/components/Button.svelte` — the first genuinely reused widget, which pulls `client/src/components/` into existence per architecture) provides: (a) **debounce** — a rapid double-tap fires the click handler exactly ONCE (the second tap within a short window is swallowed; this is the "no accidental double-fire" guarantee, not a confirm dialog — Swap/Keep require no confirm); (b) a **minimum tap target ≥ 48dp** in BOTH dimensions for every variant (the primary "hero" variant uses `min-height: 72px` per DESIGN.md; a smaller utility/icon variant must still clear 48×48dp); (c) a **`primary` variant** styled per DESIGN.md — solid neon-mint (`--color-secondary-container` `#36ffc4`) background, black (`#000`) text, pill radius (`--radius-full`), NO hover state, active **press scales to 95%** (`transform: scale(0.95)`); (d) **reduce-motion safety** — under `@media (prefers-reduced-motion: reduce)` the press-scale is skipped (the button still works and still debounces; only the transform is dropped) and no transition strobes. The button forwards a click/press handler, accepts a `disabled` state (disabled = no fire, visibly inert using `--border-inert`/lowered emphasis), and is keyboard-activatable (real `<button>`, Enter/Space, focus-visible ring). *(UX-DR18, NFR-10; epics.md#Story-1.9b lines 434–436; EXPERIENCE.md interaction lines 98 ("buttons debounce"), 108 ("≥48dp"), 112 ("Reduce Motion … skip the press scale"), 115 ("primary actions sit in the lower half … thumb zone"), line 66 ("One tap = one committed action. Press scales to 95%"); DESIGN.md Buttons line 164 ("min 72px … scale … to 95%"), lines 157/212.)*

**AC-1.9b.5 — Thumb-zone placement is available to surfaces: the Button (or a thin layout helper) supports anchoring primary actions in the lower half of the viewport.**
Given the one-handed-reach requirement,
When a surface places its primary action,
Then the primitive set makes lower-half / bottom-anchored placement the easy default — either the `Button` exposes a documented pattern/helper for bottom-of-viewport (thumb-zone) placement, or a tiny layout token/utility does. This story does NOT build real surface layouts (that is 1.10), so the requirement is satisfied by: the primitive supporting it, AND a documented note + (optionally) a demonstration in the refactored stub. Do NOT move primary actions to the top of any surface. *(UX-DR18; EXPERIENCE.md line 115 "primary actions sit in the lower half of the viewport (thumb zone), not the top"; DESIGN.md line 185 conductor bar "anchored at the bottom edge (thumb zone)".)*

**AC-1.9b.6 — The Button primitive's interaction-safety behavior is tested (debounce + reduce-motion), in a real DOM test environment added for this story.**
Given the Button has its first piece of genuine client logic (debounce) worth mounting,
When the Button tests run,
Then a component test asserts: (a) two clicks fired within the debounce window invoke the handler exactly ONCE, and a click after the window fires again; (b) a `disabled` Button does NOT fire; (c) the rendered control is a real, focusable `<button>` (the keyboard/AT path). Because this requires mounting a component, ADD a DOM-capable vitest project (jsdom or `@vitest/browser`) to the client — `client/vitest.config.ts` already foreshadows this ("Add a jsdom/@testing-library project later if a surface grows logic worth mounting"). Keep the existing node-env router test project intact and green; add the DOM project as a SECOND project (e.g. via `test.projects`) so `npm test --workspace=client` runs both. Use the lightest viable harness (jsdom + Svelte's `mount`, or `vitest-browser-svelte`); do not pull in a heavy framework. *(UX-DR18, NFR-10; architecture.md#Testing — "Vitest (node env) for pure functions" + the explicit "add jsdom later" note in `client/vitest.config.ts`; house TDD discipline 1.4–1.9a: write the failing test first.)*

**AC-1.9b.7 — All standing gates stay green; no 1.9a regression; `npm run build`/`typecheck`/`lint`/`test` all pass.**
Given this is client-only foundation work,
When the full repo gates run,
Then: `npm run lint` is clean (GATE-1 `.send`/`.broadcast` ban + GATE-2 `rules/**` purity untouched — no `.send`/`.broadcast` added anywhere outside `server/src/push-state.ts`); `npm run typecheck` is 0 errors / 0 warnings (svelte-check sees the new `Button.svelte` + `copy.ts`); `npm test` passes server (27/27, incl. the SM-6 standing privacy projection test — unaffected by client work) AND client (the 1.9a router tests 14/14 STILL green + the new Button DOM tests); `npm run build` (typecheck → `vite build`) succeeds and emits the icons + the upgraded manifest into `client/dist/` (the generated `manifest.webmanifest` carries the warm description + the two icons; the precache still includes the woff2 fonts). The render-from-state router (`route-from-state.ts`, `App.svelte`) is NOT modified by this story. *(architecture.md#Enforcement-summary mechanical gates; epics.md G1/G2 standing gates; Story 1.9a Dev Notes "Standing gates this story must not break".)*

## Tasks / Subtasks

> **Scope guard (read first):** This story ships THREE foundation primitives only — (1) the **PWA shell** (real warm manifest + the two icons + `index.html` link tags), (2) the **shared microcopy module** `copy.ts` (the EXPERIENCE.md voice table as code), and (3) the reusable interaction-safe **`Button` primitive** + its DOM test. It does NOT build the real Home/Lobby content or wire create/join (that is **Story 1.10**, UX-DR3/4), does NOT touch the render-from-state router (`route-from-state.ts`/`App.svelte` are 1.9a, frozen here), does NOT wire `socket.ts` into a live receive loop (Story 1.10), and does NOT build Swap/Keep/Deal/peek behaviors (Epic 2). "Voice" here means **microcopy/tone** (UX-DR16), NOT audio/speech. Refactor ONLY the two stubs that already render real copy (`Home`, `Eliminated`) to consume `copy.ts`; leave the other stubs as-is.

> **TDD order (house style, proven 1.4–1.9a): write the failing Button DOM test first, watch it RED, then GREEN.** The debounce is the first genuine client logic worth mounting — it is exactly the "surface grows logic worth mounting" case the 1.9a `vitest.config.ts` comment anticipated. Author the test, prove it RED (no Button / debounce missing → handler fires twice), then implement to GREEN.

- [x] **Task 1 — Produce + commit the two app icons under `client/public/icons/` (AC: 1)**
  - [x] The two source PNGs in `ux-designs/ux-trash-game-2026-06-19/imports/` are 1024×1024 (`a_minimalist_favicon…png` = favicon source; `an_apple_touch_icon…png` = apple-touch / larger source). Produce the two manifest-declared sizes from them: a **192×192** (`icon-192.png`) and a **512×512** (`icon-512.png`) PNG, committed to `client/public/icons/`. Keep them lossless-ish PNG; they ride the precache (small). *(If you cannot resize images in this environment, copy the 1024×1024 sources into `client/public/icons/` and declare their real `sizes` honestly in the manifest rather than lying about dimensions — flag this in Completion Notes so 1.10 can down-res. Do NOT declare `192x192` on a 1024×1024 file.)*
  - [x] Optionally also emit a `maskable` variant (can be the same 512 file with `purpose: "maskable"`) so Android's adaptive-icon mask doesn't clip the art.
  - [x] These are bundled locally under `public/` (no CDN) — preserves the $0/privacy posture (G2), same as the 1.9a fonts.

- [x] **Task 2 — Upgrade the `vite-plugin-pwa` manifest to the full warm installable shell (AC: 1, 2)**
  - [x] Edit the `manifest` object in `client/src/../vite.config.ts` (`client/vite.config.ts`). Replace the 1.9a placeholder with: `name`/`short_name` "Trash", `description` = the warm copy (Task 3 / AC-1.9b.2), `start_url: "/"`, `display: "standalone"`, `orientation: "portrait"`, `background_color: "#1a0b2e"`, `theme_color: "#1a0b2e"` (FIX the placeholder's `#1a1320` → `#1a0b2e`, the real DESIGN.md surface), and an `icons` array pointing at `/icons/icon-192.png` (192×192, `purpose: "any"`) and `/icons/icon-512.png` (512×512, `purpose: "any maskable"`).
  - [x] Update the leading comment in `vite.config.ts` from "manifest copy + icons land in Story 1.9b/1.10" → a 1.9b note that the real manifest + icons now ship here. Keep `registerType: "autoUpdate"` and the existing `workbox.globPatterns` woff2 entry (do NOT remove the font precache).
  - [x] Do NOT add runtime caching of game data / an offline gameplay fallback — offline gameplay is explicitly out of scope (the game needs the live WS). Precaching the static shell is all that's intended.
  - [x] Add the icon `<link>` tags to `client/index.html` (`<link rel="icon" href="/icons/icon-192.png">`, `<link rel="apple-touch-icon" href="/icons/icon-512.png">`). Leave the existing `viewport-fit=cover` meta + `<title>Trash</title>` as-is (no "high-stakes"/"underground" anywhere).

- [x] **Task 3 — Author the shared microcopy module `client/src/lib/copy.ts` (AC: 2, 3)** *(creates `client/src/lib/`, which architecture already designates for client-only modules)*
  - [x] Create `client/src/lib/copy.ts` exporting the EXPERIENCE.md voice-table strings VERBATIM (see Dev Notes "Voice table — copy.ts source of truth" for the exact strings + suggested names). Static strings as `const`; parameterized lines as small pure functions (`winner(name)`, `loser(name)`, `waitingForHost(host)`, `roomCode(code)`, `badCode()`). `kebab-case.ts` module, `camelCase` exports, `SCREAMING_SNAKE` only for true constants — per architecture naming.
  - [x] The manifest `description` string can ALSO be sourced/echoed here (a `MANIFEST_DESCRIPTION` const) so the one warm sentence has a single home, but the manifest itself lives in `vite.config.ts` (build-time config can't import an app module cleanly — it's fine to duplicate the one literal and add a comment cross-referencing `copy.ts`; do NOT over-engineer a shared import across the config boundary).
  - [x] Verify NO forbidden framing appears: grep the module (and the manifest) for `high-stakes`, `underground`, `You lost`, `You failed`, `Error 404`, `Awaiting`, `Make your selection` — all must be absent.

- [x] **Task 4 — Refactor the two copy-bearing 1.9a stubs to consume `copy.ts` (AC: 3)**
  - [x] `client/src/surfaces/Home.svelte`: replace the literal `"Trash"` / `"Connecting…"` with the `copy.ts` exports (e.g. `APP_NAME`, `CONNECTING`). Keep the styling + structure identical; this is a source-of-truth refactor, not a redesign.
  - [x] `client/src/surfaces/Eliminated.svelte`: replace `"You're out."` / `"Stick around and heckle."` with the `copy.ts` `ELIMINATED_*` exports (the voice table's "You're out — stick around and heckle." — note the table phrasing is one sentence; keep the two-line visual split if you like, but the strings come from `copy.ts`).
  - [x] Do NOT touch the other surface stubs (Lobby/YourTurn/Waiting/Showdown/RoundResult/Winner/HostControls) — their real copy + the `winner()`/etc. helpers are consumed by 1.10/Epic 2/Epic 3. (You MAY leave a one-line comment in `copy.ts` noting which story consumes each unused-yet export, so they don't read as dead code.)

- [x] **Task 5 — Build the interaction-safe `Button` primitive (AC: 4, 5)** *(creates `client/src/components/` — the first genuinely reused widget, exactly as architecture says: "let the first genuinely reused widget pull it into existence")*
  - [x] Create `client/src/components/Button.svelte` as a real `<button>` (NOT a `<div>` — keyboard + AT for free; AC-1.9b.6c). Props (Svelte 5 runes): `onclick` handler, `variant` (`"primary"` default | a smaller `"icon"`/`"secondary"` variant), `disabled?: boolean`, and a default `<slot>`/children for the label. Forward `aria-*`/`type` as needed.
  - [x] **Debounce (AC-1.9b.4a):** wrap the handler so a second activation within a short window (suggest ~300–400ms; pick one, name it as a `const`) is swallowed — fire exactly once per burst. Implement WITHOUT `Date.now()` inside any shared/rules path (this is client code so `Date.now()`/`performance.now()` are allowed here — the rules-purity ESLint ban is `server/src/rules/**` only). A simple "ignore until a `setTimeout`/flag clears" guard is fine. Disabled ⇒ never fires.
  - [x] **Tap target (AC-1.9b.4b):** primary variant `min-height: 72px` (DESIGN.md) and full width or generous padding; EVERY variant clears `min-height`/`min-width` ≥ 48px (use a token-based floor). Use `--radius-full` for the pill primary.
  - [x] **Primary styling (AC-1.9b.4c):** background `var(--color-secondary-container)` (`#36ffc4`), color `#000`, `--type-label-bold` or a button-appropriate weight (≥500), NO `:hover` state, `:active { transform: scale(0.95); }`.
  - [x] **Reduce-motion (AC-1.9b.4d):** `@media (prefers-reduced-motion: reduce) { /* drop the scale transform + any transition */ }`. The click/debounce still works; only motion is removed. (Mirror the 1.9a `reduce-motion` intent — DESIGN.md "skip the press scale".)
  - [x] **Focus-visible:** a visible focus ring (the neon `--stroke-active` or a clear outline) so keyboard users see focus; do not `outline: none` without a replacement.
  - [x] **Thumb-zone (AC-1.9b.5):** document (component comment) the intended bottom-of-viewport placement and expose it cleanly (e.g. the Button is layout-agnostic and the surface anchors it low; OR add a tiny `BottomBar`/`thumb-zone` wrapper if it reads cleaner). Don't build full surface layouts — just make low placement the easy path and note it.
  - [x] Add a `SCOPE` comment naming this as the 1.9b shared primitive that 1.10/Epic 2 reuse for Start/Join/Deal/Swap/Keep/Re-deal.

- [x] **Task 6 — DOM test the Button (AC: 6)** *(test-first: RED then GREEN)*
  - [x] Add a DOM-capable vitest project to the client. In `client/vitest.config.ts`, convert to `test.projects: [ <existing node project for *.ts router tests>, <new DOM project> ]`. The DOM project: `environment: "jsdom"` (add `jsdom` as a client devDependency) OR `@vitest/browser` if you prefer real-browser semantics — pick the lighter one; include `src/**/*.svelte.test.ts` (or a distinct glob) so component tests don't run under the node project. Keep the existing node project's `include: ["src/**/*.test.ts"]` working for `route-from-state.test.ts` (adjust globs so the two projects don't double-run or collide).
  - [x] Write `client/src/components/Button.svelte.test.ts` (mount via Svelte 5 `mount` + a jsdom container, or `vitest-browser-svelte`). Assert: (a) two synchronous clicks → handler called ONCE; after advancing past the debounce window (use vitest fake timers) → a third click calls it again; (b) `disabled` button → handler NOT called; (c) the rendered node is a `<button>` and is focusable. Prove RED first (before the debounce exists / before the component exists), then GREEN.
  - [x] Add the necessary client devDependencies (`jsdom` and/or `@testing-library/svelte` / `vitest-browser-svelte`). Use pinned versions; keep the footprint minimal. (vitest `4.1.9` is already hoisted via the workspace per 1.9a.)

- [x] **Task 7 — Verify the whole foundation end-to-end (AC: 1–7)**
  - [x] `npm run typecheck` green (0/0): svelte-check sees `Button.svelte` + `copy.ts`; the refactored `Home`/`Eliminated` still typecheck.
  - [x] `npm test` (root): server 27/27 (incl. SM-6 projection gate, unaffected) AND client — the 1.9a router tests 14/14 STILL green under the node project + the new Button DOM tests green under the jsdom project.
  - [x] `npm run lint` clean — confirm NO `.send`/`.broadcast` added (GATE-1) and `server/src/rules/**` untouched (GATE-2). Button debounce uses client-side timing, not a rules-path token.
  - [x] `npm run build` succeeds: inspect `client/dist/` — the generated `manifest.webmanifest` carries the warm `description` (grep it for "friends and family"; grep-FAIL it for "high-stakes"/"underground"), references `/icons/icon-192.png` + `/icons/icon-512.png`, and the precache (`sw.js` / workbox manifest) still lists the two woff2 fonts (no font regression from 1.9a).
  - [x] Manual smoke (optional, `npm run dev`): a `<Button>` renders as a 72px neon-mint pill, a double-tap fires once, the press scales to 95% (and does NOT scale under an OS "reduce motion" setting), and Home/Eliminated render the `copy.ts` strings.

### Review Findings (Code Review 2026-06-19)

- [x] [Review][Defer] `Eliminated.svelte` couples the surface to the `" — "` em-dash separator in `ELIMINATED` [client/src/surfaces/Eliminated.svelte:46] — deferred to Story 3.5 (which builds the real Eliminated content and owns this layout). `const [lead, tail] = ELIMINATED.split(" — ")` then `<h1>{lead}.</h1><p>{tail}</p>`. The split is fragile: if the source string is ever reworded with a hyphen/en-dash instead of the em-dash `—`, `tail` becomes `undefined` (the `<p>` renders empty and the sentence collapses into the `<h1>`); if it ever gains a second `" — "` the trailing clause is dropped; and the synthesized `.` after `{lead}` assumes the lead clause never carries its own terminal punctuation. Spec AC-1.9b.3 *explicitly permits* the two-line visual split ("keep the two-line visual split if you like, but the strings come from copy.ts"), so this is working-as-specified but brittle. **Reason for deferral:** within spec and correct today; Story 3.5 rebuilds the Eliminated surface with full layout context, so harden (or restructure copy.ts to carry the split) there rather than patching a stub. (Sources: blind+edge.)
- [x] [Review][Defer] Button `locked` is a plain `let`, not `$state` [client/src/components/Button.svelte:45] — deferred, latent-only. Correct today (read synchronously inside `handleClick`, never in the template), but it silently won't drive UI if a future dev writes `disabled={locked}` for a pending affordance. Belongs to 1.10 when a debounce-pending visual is actually wanted.
- [x] [Review][Defer] Button debounce `setTimeout` is never cleared on unmount [client/src/components/Button.svelte:50] — deferred, latent-only. Harmless now (the callback just flips a plain `let` on a dead closure, no "set state after unmount"); becomes a real defect only if `locked` is promoted to `$state`. Fix alongside the `$state` change (capture the id + `clearTimeout` in `onDestroy`).

## Dev Notes

### What "voice primitives" means here (read first to avoid a wrong turn)

"Voice" in this story is **microcopy / brand tone** (UX-DR16) — the words on screen — NOT audio, speech synthesis, or voice recognition. The deliverable is a **shared strings module** that makes the EXPERIENCE.md voice table the single source of truth so every later surface (1.10 Home/Lobby, Epic 2 turns, Epic 3 showdown/loser copy) inherits the warm voice instead of re-inventing strings. Decision #5 (epics.md line 154) names voice a *cross-epic thread* that "peaks at Epic 3 (loser copy)"; 1.9b is its **first surface application** and establishes the primitive. Do not build any Web Audio / SpeechSynthesis code. [Source: epics.md#Story-1.9b line 432, decision #5 line 154; EXPERIENCE.md "Voice and Tone" lines 39–58.]

### Voice table — `copy.ts` source of truth (transcribe these VERBATIM — AC-1.9b.2/.3)

The EXPERIENCE.md microcopy table (lines 43–56). Author the **"Do"** column as the only shipped strings; the **"Don't"** column lists banned phrasings to assert-absent.

| Context | DO (ship this) | DON'T (never ship) |
|---|---|---|
| Home actions | `Start a table` · `Join a table` | "Create Lobby" · "Enter Game Code" |
| Room code | `Your table code: WXYZ — read it out.` | "Share code to invite players" |
| Waiting for host | `Hang tight — {Host} deals when everyone's in.` | "Awaiting host action" |
| Your turn | `Your turn. Swap it or keep it?` | "Make your selection" |
| Swap / Keep buttons | `SWAP` · `KEEP` | "Exchange card" · "Hold" |
| King at the table | (nothing — the app stays out of it) | any on-screen King "block" message |
| Peek hint | `Press and hold to peek.` | "Tap to reveal your secret card" |
| Showdown loser | `Ooof — lowest card. That's a life, {name}.` | "You lost." · "You failed." |
| Tie | `Tie for lowest — everybody drops a life!` | "Multiple losers detected" |
| Eliminated | `You're out — stick around and heckle.` | "Game over. You have been eliminated." |
| Winner | `{name} wins it. One more?` | "Victory! Final standings:" |
| Bad code | `No table with that code — check the letters?` | "Error 404: Room not found" |

- Names use the Player's entered display name. Keep sentences short and complete; one idea per line; no jargon. [Source: EXPERIENCE.md line 58.]
- **Manifest description** (separate from the table, AC-1.9b.2): `A party card game for friends and family at the same table — your phone is the dealer.` [Source: imports/manifest.json line 4 — already the corrected warm copy; the REJECTED string is "a high-stakes underground card gathering", EXPERIENCE.md line 41.]
- For 1.9b, ONLY `Home` ("Trash" app name + "Connecting…") and `Eliminated` ("You're out — stick around and heckle.") render today, so only those consume `copy.ts` now. Author the rest (`waitingForHost`, `yourTurn`, `swap`/`keep`, `peekHint`, `loser(name)`, `tie`, `winner(name)`, `badCode`, `roomCode(code)`) so 1.10/Epic 2/Epic 3 import them — annotate each with the consuming story so they don't read as dead code. [Source: client/src/surfaces/Home.svelte, Eliminated.svelte — the only stubs with literal copy today.]

> Note: `Home` currently shows the literal **"Trash"** (the app/brand name) and **"Connecting…"** — neither is in the voice table; treat "Trash" as `APP_NAME` and "Connecting…" as a `CONNECTING` const (it's the cold-open/connecting state, EXPERIENCE.md State Patterns). `Eliminated`'s two stub lines collapse to the table's single "You're out — stick around and heckle." string.

### PWA shell — exact deltas from the 1.9a placeholder (AC-1.9b.1/.2)

Current `client/vite.config.ts` `manifest` (1.9a placeholder) is missing `description`, `start_url`, `icons`, and uses the WRONG colors (`#1a1320`). Target shape:

```ts
manifest: {
  name: "Trash",
  short_name: "Trash",
  description: "A party card game for friends and family at the same table — your phone is the dealer.",
  start_url: "/",
  display: "standalone",
  orientation: "portrait",
  background_color: "#1a0b2e",   // DESIGN.md surface — was the placeholder #1a1320
  theme_color: "#1a0b2e",
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
  ],
},
```

- Keep `registerType: "autoUpdate"` and the existing `workbox.globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"]` (the woff2 entry is the 1.9a font-precache — do NOT drop it; the new PNG icons are also covered by it).
- `index.html` link tags: `<link rel="icon" href="/icons/icon-192.png" />` and `<link rel="apple-touch-icon" href="/icons/icon-512.png" />` in `<head>`. (apple-touch-icon should be ≥180×180; 512 is fine.)
- **Offline scope:** precache the static shell only — the existing config already does this. The PWA-scope footnote is explicit: "Offline *gameplay* is explicitly out of scope — the game requires the live WebSocket." Do NOT add `runtimeCaching` for game/WS data. [Source: architecture.md#Complete-Project-Directory-Structure PWA-scope footnote; epics.md#Story-1.9b line 432; UX-DR17 epics.md lines 89/118.]
- Icon source: the two `imports/*.png` are 1024×1024 (verified). Down-res to 192 + 512 (Task 1). [Source: client/vite.config.ts current; imports/manifest.json icon list.]

### Button primitive — the exact spec (AC-1.9b.4/.5)

- **Real `<button>`** element (not a styled `<div>`) — gives keyboard activation, focus, and AT semantics for free (AC-1.9b.6c; EXPERIENCE.md line 114 "Swap/Keep are the first two focus stops"). One tap = one committed action (EXPERIENCE.md line 66).
- **Debounce** (EXPERIENCE.md line 98 "No accidental double-fire — buttons debounce."): swallow a second activation within ~300–400ms; name the window a `const DEBOUNCE_MS`. This is the FIRST genuine client logic → it is why this story finally adds a DOM test (1.9a's `vitest.config.ts` predicted "add a jsdom project later if a surface grows logic worth mounting"). `Date.now()`/`setTimeout` are fine in client code — the purity ban is `server/src/rules/**` only.
- **NOT a confirm dialog:** Swap/Keep "require no confirm — speed matters" (EXPERIENCE.md line 66). Debounce ≠ confirmation. No "Are you sure?".
- **Tap target ≥48dp** every variant; **primary `min-height: 72px`** (DESIGN.md line 164). [EXPERIENCE.md line 108; DESIGN.md line 212 "≥48dp targets".]
- **Primary look** (DESIGN.md line 164): solid neon-mint `--color-secondary-container` (`#36ffc4`) bg, black text, **pill** (`--radius-full`), **no hover**, `:active` **scale to 95%**. [DESIGN.md Buttons line 164; Shapes line 157 "Primary buttons should be fully pill-shaped".]
- **Reduce-motion:** `@media (prefers-reduced-motion: reduce)` drops the scale transform (EXPERIENCE.md line 112 "skip the press scale"); the click still fires.
- **Thumb-zone** (EXPERIENCE.md line 115; DESIGN.md line 185): primary actions live in the lower half / bottom edge. The Button is layout-agnostic; document the low-placement intent and make it the easy default. Real bottom-anchored surface layouts (conductor bar etc.) are 1.10/Epic 4.
- **No banned interaction patterns** (G1 eyes-up): no timers/auto-advance on the button, no idle animation, no hover sink. [EXPERIENCE.md lines 100–102; architecture.md G1.]

### Where this fits the directory structure (architecture-compliant)

- **New dirs this story births:** `client/src/lib/` (client-only modules — `copy.ts`; architecture designates `client/src/lib` for client-only logic like `card-display.ts`/`reduce-motion.ts`) and `client/src/components/` (the Button is "the first genuinely reused widget" that architecture says should "pull it into existence" — do NOT pre-create more than the Button). [Source: architecture.md#Complete-Project-Directory-Structure — `client/src/lib/`, the `# NOTE: no components/ dir pre-created` line, and the Watch-list "do NOT pre-create `client/src/components/`" — now justified by a real reused widget.]
- **New files:** `client/public/icons/icon-192.png`, `client/public/icons/icon-512.png`, `client/src/lib/copy.ts`, `client/src/components/Button.svelte`, `client/src/components/Button.svelte.test.ts`.
- **Modified files:** `client/vite.config.ts` (manifest), `client/index.html` (icon links), `client/src/surfaces/Home.svelte` + `client/src/surfaces/Eliminated.svelte` (consume `copy.ts`), `client/vitest.config.ts` (add DOM project), `client/package.json` (add `jsdom`/test-harness devDep).
- **NOT touched:** `route-from-state.ts`, `route-from-state.test.ts`, `App.svelte`, `wire-anchor.ts`, `main.ts`, `tokens.css`, `fonts.css`, `socket.ts`, any `server/**` or `shared/**`.
- **Naming:** `kebab-case.ts` modules (`copy.ts`), `PascalCase.svelte` components (`Button.svelte`), `camelCase` functions, `PascalCase` types, `SCREAMING_SNAKE` constants (`DEBOUNCE_MS`). [Source: architecture.md#Naming.]

### Architecture & project-structure compliance

- **Client tech (pinned, do not bump):** Svelte `5.56.3` (runes — `$props`/`$state`/`$derived`), Vite `8.0.16`, `vite-plugin-pwa 1.3.0`, `partysocket 1.2.0`, `svelte-check 4.4.1`, vitest `4.1.9` (hoisted). The only NEW dep is the DOM test harness (`jsdom` and/or `@testing-library/svelte` / `vitest-browser-svelte`) — a client devDependency, pinned. No runtime deps added. [Source: client/package.json; architecture.md#Web-Verified-Facts.]
- **Client boundary:** `client` imports ONLY `@trash/shared` (+ its own modules). `copy.ts` and `Button.svelte` are client-only; they never import server/shared internals. [Source: architecture.md#Client-boundary.]
- **Render-from-state untouched:** the Button is a leaf primitive; it does not hold or mutate `tableState`. Surfaces stay pure functions of state. [Source: architecture.md#Enshrined-experience-invariant.]

### Standing gates this story must not break

- **GATE-1 (`.send`/`.broadcast` ban, `eslint.config.js`):** client-only work; do NOT introduce `.send`/`.broadcast` anywhere outside `server/src/push-state.ts`. `npm run lint` must stay clean. [Source: eslint.config.js GATE-1; Story 1.9a Dev Notes.]
- **GATE-2 (`server/src/rules/**` purity):** untouched by client work — but note the Button's `Date.now()`/`setTimeout` debounce is fine BECAUSE it is client code; that token would fail lint ONLY inside `rules/**`. [Source: eslint.config.js GATE-2.]
- **SM-6 privacy projection test:** server-side, unaffected (no new `ProjectedTableState` field). Confirm `npm test` server side stays 27/27. [Source: Story 1.9a Dev Notes; architecture.md#Enforcement-summary.]
- **G1 (eyes-up / no attention sink):** the Button adds no timers, no auto-advance, no idle/ambient animation, no hover sink, no scroll. The only motion is the press-scale (reduce-motion-safe). [Source: epics.md G1; EXPERIENCE.md lines 100–102.]
- **G2 ($0 / no paid dependency):** icons bundled locally under `public/` (no CDN), same posture as the 1.9a self-hosted fonts. The jsdom harness is a free devDependency. [Source: epics.md G2; Story 1.9a AC-1.9a.2.]

### Testing standards

- The 1.9a node-env vitest project (pure `routeFromState`) STAYS and stays green. This story ADDS a DOM project for the Button — the first component with logic worth mounting (exactly what `client/vitest.config.ts` anticipated). Use `test.projects` so both run under `npm test --workspace=client`. [Source: client/vitest.config.ts comment lines 5–7; architecture.md#Testing.]
- TDD: write the failing Button test FIRST (no Button / no debounce → handler fires twice), prove RED, then GREEN — the discipline every prior story (1.4–1.9a) followed.
- Test the **behavior that matters**: debounce-fires-once, disabled-no-fire, is-a-`<button>`. Do NOT snapshot-test styling; the visual tokens are covered by 1.9a + manual smoke. Use vitest **fake timers** to advance past the debounce window deterministically (no real `await sleep`).
- Test-file naming: `*.test.ts` (server/1.9a convention). For the DOM project, a distinct glob (e.g. `*.svelte.test.ts`) keeps it from running under the node project. [Source: client/vitest.config.ts line 9; server/vitest.config.ts.]

### Previous story intelligence (1.9a — same client tree, just merged)

- **1.9a left exact hooks for this story:** `vite.config.ts` comment says "the real manifest copy + icons are Story 1.9b"; `vitest.config.ts` says "Add a jsdom/@testing-library project later if a surface grows logic worth mounting" — this story cashes both in. The 1.9a surface stubs carry `SCOPE` comments naming `1.9b` for the button/voice/interaction-safety work (e.g. `YourTurn.svelte` "the two-button SWAP/KEEP hero … debounced taps — is Stories 1.9b/2.4/2.5/2.6"). [Source: Story 1.9a File List + SCOPE comments.]
- **Tokens already exist** for everything the Button needs: `--color-secondary-container` (#36ffc4), `--radius-full` (pill), `--stroke-active` (focus ring candidate), `--border-inert` (disabled), `--type-label-bold`. Reuse them; author NO new color/spacing values. [Source: client/src/tokens.css.]
- **House TDD discipline + one-PR-per-story:** branch `story/1-9b-…`, PR titled `Story 1.9b: …`; baseline commit for this story is `38e2e7a` (the 1.9a merge). [Source: git log; Story 1.9a Dev Notes.]
- **Surfaces are render-from-state; copy lives where it renders today.** Only `Home`/`Eliminated` have real literals now — refactor exactly those, no more. [Source: client/src/surfaces/*.svelte.]
- **Fail-loud / no-CDN posture (1.7/1.9a):** keep it — icons local, no Google-Fonts-style third-party request. [Source: Story 1.9a AC-1.9a.2.]

### Git intelligence

- Recent commits are one-PR-per-story (`Story 1.9a: …`, `Story 1.8: …`), each ending with a code-review pass. The 1.9a PR (#6) merged the entire client foundation this story extends. The working tree is clean at `38e2e7a`. No server/shared churn expected here. [Source: git log --oneline.]

### Project Structure Notes

- **New:** `client/public/icons/icon-192.png`, `client/public/icons/icon-512.png`, `client/src/lib/copy.ts`, `client/src/components/Button.svelte`, `client/src/components/Button.svelte.test.ts`.
- **Modified:** `client/vite.config.ts`, `client/index.html`, `client/src/surfaces/Home.svelte`, `client/src/surfaces/Eliminated.svelte`, `client/vitest.config.ts`, `client/package.json`, `_bmad-output/implementation-artifacts/sprint-status.yaml` (1-9b → ready-for-dev, done by this workflow; dev moves it to in-progress/review).
- **No server/shared changes. No new runtime dependencies** (only a jsdom/test-harness devDependency). The `client/src/lib/` and `client/src/components/` dirs are created here intentionally (architecture sanctioned both, components/ specifically waiting for "the first genuinely reused widget" = this Button).

### References

- [Source: epics.md#Story-1.9b (lines 422–436)] — the two ACs: PWA shell + warm voice (UX-DR16/17), interaction safety (UX-DR18, NFR-10).
- [Source: epics.md decision #5 (line 154), UX-DR16/17/18 anchors (lines 88–89, 116, 118)] — voice is a cross-epic thread first applied here; PWA shell + primitives are Epic-1 deliverables.
- [Source: EXPERIENCE.md "Voice and Tone" (lines 39–58)] — the full microcopy/voice table + the rejected manifest copy.
- [Source: EXPERIENCE.md interaction & a11y (lines 66, 96–115)] — debounce (98), ≥48dp (108), reduce-motion skip-press-scale (112), thumb-zone (115), press-scales-95% (66), peek auto-hide (99, not in 1.9b scope but the voice line is).
- [Source: DESIGN.md Brand & Style (line 115), Buttons (line 164), Shapes (line 157), Conductor bar (line 185), Do/Don't (lines 208–212)] — voice posture, 72px/95%/pill/no-hover, ≥48dp, thumb-zone, reject "high-stakes/underground".
- [Source: architecture.md#Complete-Project-Directory-Structure] — `public/manifest.json` "(cleaned, warm copy)", `public/icons/`, `client/src/lib/`, the "no components/ dir pre-created — let the first genuinely reused widget pull it into existence" note, the PWA-scope footnote (offline gameplay out of scope).
- [Source: architecture.md#Testing, #Client-boundary, #Naming, #Enforcement-summary] — node-vs-DOM test projects, client-only `lib`, naming, mechanical gates.
- [Source: client/vite.config.ts] — the 1.9a placeholder manifest to upgrade (missing description/start_url/icons; wrong `#1a1320`).
- [Source: client/vitest.config.ts (lines 5–7)] — the explicit "add a jsdom/@testing-library project later" hook this story cashes in.
- [Source: client/src/surfaces/Home.svelte, Eliminated.svelte] — the only two stubs with literal copy to refactor onto `copy.ts`.
- [Source: client/src/tokens.css] — `--color-secondary-container`, `--radius-full`, `--stroke-active`, `--border-inert`, `--type-label-bold` (all the Button needs; author no new values).
- [Source: imports/manifest.json (line 4)] — the corrected warm description to ship verbatim.
- [Source: eslint.config.js] — GATE-1/GATE-2; why client `Date.now()` debounce is fine (rules-path ban only).

## Dev Agent Record

### Agent Model Used

Opus 4.8 (1M context) — `us.anthropic.claude-opus-4-8[1m]`

### Debug Log References

- **Icons (Task 1):** the two `imports/*.png` sources are 1024×1024; resized with macOS `sips -z` to honest `icon-192.png` (192×192, 49 KB) + `icon-512.png` (512×512, 407 KB) under `client/public/icons/`. No false `sizes` declared.
- **Button DOM test RED proof (Task 6):** first `vitest run --project client-dom` failed with `Failed to resolve import "./Button.svelte"` (component absent) — RED confirmed before implementing.
- **Svelte-5 jsdom mount fix:** the first GREEN attempt threw `lifecycle_function_unavailable: mount(...) is not available on the server` — the bare `svelte()` plugin resolved Svelte's server build under jsdom. Fixed by adding `svelteTesting()` from `@testing-library/svelte/vite` to the `client-dom` project (it wires the browser-condition resolution + auto-cleanup). All 4 Button tests GREEN after.
- **Typecheck fixes (Task 7):** (1) `children` prop is a Svelte `Snippet`, so the test's `() => "Deal"` was rejected by svelte-check — switched to a `createRawSnippet` `label()` helper. (2) `tsc -b` (plain TS, ambient `*.svelte` module = default export only) couldn't see a `<script module>` named `DEBOUNCE_MS` export — relocated the constant to plain TS `client/src/lib/interaction.ts`, imported by both `Button.svelte` and the test. Typecheck then 0/0.

### Completion Notes List

- **PWA shell (AC-1.9b.1/.2):** `client/vite.config.ts` manifest upgraded from the 1.9a placeholder to the full installable shell — `description` = the warm corrected copy, `start_url`, `display: standalone`, `orientation: portrait`, `icons` (192 `any` + 512 `any maskable`), and the color fix `#1a1320` → DESIGN.md surface `#1a0b2e`. `index.html` got `<link rel="icon">` + `<link rel="apple-touch-icon">`. Built `dist/manifest.webmanifest` verified: carries "friends and family" warm copy, references both `/icons/icon-*.png`, and grep-FAILS for "high-stakes"/"underground". Offline gameplay stays out of scope — only the static shell is precached (no runtimeCaching added); the existing woff2 precache is preserved (precache 7 → 11 entries: + index.html, css, js, 2 icons).
- **Voice primitives (AC-1.9b.2/.3):** `client/src/lib/copy.ts` is the single source of truth for microcopy/tone — the EXPERIENCE.md voice-table "Do" strings verbatim (statics as `const`, parameterized lines as pure fns `roomCode`/`waitingForHost`/`loser`/`winner`), each annotated with its consuming story so the not-yet-rendered ones don't read as dead code. `MANIFEST_DESCRIPTION` is the canonical home of the warm sentence (the config mirrors the one literal, cross-referenced in a comment). No forbidden framing in any shipped string (verified by grep; the only "high-stakes"/"underground" hits are explanatory comments). `Home.svelte` and `Eliminated.svelte` refactored to consume `copy.ts` (`APP_NAME`/`CONNECTING`; `ELIMINATED` split on its em-dash to keep the stub's heading/subline while the single voice-table sentence stays the source).
- **Interaction-safe Button (AC-1.9b.4/.5/.6):** `client/src/components/Button.svelte` — the first genuinely reused widget, which pulls `client/src/components/` into existence per architecture. Real `<button>` (keyboard + focus-visible + AT for free); **debounce** swallows a second activation within `DEBOUNCE_MS` (350 ms, in `client/src/lib/interaction.ts`) — fire-once, NOT a confirm dialog; **≥48dp** every variant + **72px** primary; **primary** = neon-mint pill, black text, no hover, `:active` scale-95%; **reduce-motion** drops the press-scale under `prefers-reduced-motion` (click still fires); **disabled** never fires and reads inert. Thumb-zone: documented as a layout-agnostic primitive surfaces anchor low (real bottom-anchored layouts are 1.10/Epic 4).
- **Test harness (AC-1.9b.6):** added a second vitest project `client-dom` (jsdom + `svelte()` + `svelteTesting()`) alongside the existing node `client-node` project; globs split so `*.test.ts` (pure) and `*.svelte.test.ts` (component) don't collide. `@testing-library/svelte@5.3.1` + `jsdom@29.1.1` added as pinned client devDeps (no runtime deps). Button tested for: debounce-fires-once, fires-again-after-window (vitest fake timers), disabled-no-fire, is-a-focusable-`<button>`.
- **Scope honored:** did NOT touch `route-from-state.ts`/`App.svelte`/`wire-anchor.ts`/`main.ts`/`tokens.css`/`fonts.css`/`socket.ts`, did NOT wire a live receive loop, did NOT flesh out the other 7 surface stubs, did NOT build any audio/speech ("voice" = microcopy). No server/shared changes.
- **All gates green (AC-1.9b.7):** `npm run typecheck` 0/0; `npm test` server 27/27 (incl. SM-6 standing privacy projection) + client 18/18 (1.9a router 14/14 still green + 4 new Button DOM tests); `npm run lint` clean (GATE-1 `.send`/`.broadcast` + GATE-2 `rules/**` purity untouched); `npm run build` succeeds, emits the warm manifest + both icons + precaches the fonts.

### File List

**New:**
- `client/public/icons/icon-192.png`
- `client/public/icons/icon-512.png`
- `client/src/lib/copy.ts`
- `client/src/lib/interaction.ts`
- `client/src/components/Button.svelte`
- `client/src/components/Button.svelte.test.ts`

**Modified:**
- `client/vite.config.ts` (placeholder manifest → full warm installable manifest + icons; color fix `#1a1320`→`#1a0b2e`)
- `client/index.html` (icon + apple-touch-icon link tags)
- `client/src/surfaces/Home.svelte` (consume `copy.ts` — `APP_NAME`/`CONNECTING`)
- `client/src/surfaces/Eliminated.svelte` (consume `copy.ts` — `ELIMINATED`)
- `client/vitest.config.ts` (single node project → two projects: `client-node` + jsdom `client-dom`)
- `client/package.json` (add pinned devDeps `@testing-library/svelte 5.3.1`, `jsdom 29.1.1`)
- `package-lock.json` (lockfile for the two new devDeps)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (1-9b → in-progress → review)

## Change Log

| Date | Change |
|---|---|
| 2026-06-19 | Story 1.9b implemented: (1) real installable PWA shell — full warm manifest + the two produced icons (192/512), color fix `#1a1320`→`#1a0b2e`, `index.html` icon links, offline gameplay out of scope; (2) shared microcopy/voice module `copy.ts` (EXPERIENCE.md voice table as the single source of truth) + `Home`/`Eliminated` refactored onto it; (3) interaction-safe `Button` primitive (debounce / ≥48dp / 72px primary / press-scale-95% / reduce-motion-safe / real `<button>`) — the first reused widget, pulling `client/src/components/` into existence; (4) added a jsdom `client-dom` vitest project + Button DOM tests. All gates green (typecheck 0/0, server 27/27 + client 18/18, lint clean, build emits warm manifest + icons + font precache). Status → review. |
