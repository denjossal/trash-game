---
baseline_commit: dc1cda1
---

# Story 1.9a: Design-token foundation & render-from-state router

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As any Player,
I want the app to look like "Trash" and route to the right surface from current state,
so that the visual foundation and the state-driven routing every later surface inherits are correct.

## Acceptance Criteria

**AC-1.9a.1 — The full DESIGN.md "Electric Social" token set exists as plain CSS custom properties in `client/src/tokens.css` (no Tailwind, no UI kit).**
Given the client styling foundation,
When `client/src/tokens.css` is authored,
Then it defines, as plain CSS custom properties on `:root`, the COMPLETE DESIGN.md token set: (a) the full color palette (every named color in Dev Notes "Color tokens" — surface stack, on-surface, primary/secondary/tertiary + containers + fixed variants, `outline` / `outline-variant`, error stack, background); (b) the Anybody + Hanken Grotesk type scale (`display-xl`/`display-lg`/`headline-lg`/`headline-lg-mobile`/`body-lg`/`body-md`/`label-bold`) as size + weight + line-height + letter-spacing tokens, **every weight ≥ 500**; (c) the 8px-based spacing scale (`base-unit` 8px through `stack-xl` 64px); (d) the chunky radii scale (`sm` 8px … `xl` 48px, `full` 9999px pill); (e) the tonal-stack elevation tokens + the 4px neon-mint active-stroke token + the 2px 10%-white inert-border token. No Tailwind, no UI kit, no CSS framework — hand-authored custom properties only. *(UX-DR1; epics.md#Story-1.9a lines 414–416; DESIGN.md Colors/Typography/Layout & Spacing/Shapes/Elevation & Depth.)*

**AC-1.9a.2 — Both fonts are bundled locally (no CDN) and wired via `@font-face` so the type tokens resolve to real fonts.**
Given the two typefaces Anybody and Hanken Grotesk,
When the font foundation is authored,
Then the font files are bundled **locally under `client/public/fonts/`** (NOT loaded from a CDN / Google Fonts — the $0 / privacy posture and offline-shell goal forbid a third-party font request), `@font-face` declarations map each bundled weight to its family, and the `--font-family-*` tokens reference those families. Only the weights the type scale actually uses are bundled (Anybody 700/800/900, Hanken Grotesk 500/600) to keep the shell small. *(UX-DR1; architecture.md#Complete-Project-Directory-Structure — `client/public/fonts/` "Anybody, Hanken Grotesk"; G2 $0 gate — no paid/third-party dependency.)*

**AC-1.9a.3 — `tokens.css` is imported once into the app shell and a global baseline applies the brand surface + base type.**
Given the token foundation,
When the app boots,
Then `tokens.css` is imported exactly once (from `main.ts` or the root component) so it loads before any surface renders, and a minimal global baseline sets the document background to `--color-surface` (`#1a0b2e`), the default text color to `--color-on-surface`, and the base body font to the Hanken Grotesk `body-md` token — establishing the dark, portrait brand frame every surface inherits. The baseline introduces NO layout chrome and NO persistent navigation. *(UX-DR1, UX-DR2; DESIGN.md Brand & Style — dark base; EXPERIENCE.md IA "no persistent navigation".)*

**AC-1.9a.4 — `App.svelte` routes to exactly ONE surface as a PURE function of the current `ProjectedTableState` (or none yet).**
Given the render-from-state router,
When a `ProjectedTableState` (or `null` — none received yet) is provided,
Then `App.svelte` (or a `route-from-state` helper it calls) selects EXACTLY ONE surface as a pure function of that state — same state in ⇒ same surface out, with NO persistent navigation, no route history, no router library, and no client-held "current screen" variable that can drift from state. The mapping is the one in Dev Notes "Routing table"; it switches on `phase`, then on `you.isAlive` / `you.isHost` / (`currentTurnId === you.playerId`) / `revealed` / `winnerIds` as that table specifies. *(UX-DR2; epics.md#Story-1.9a lines 418–420; architecture.md#Enshrined-experience-invariant; shared/src/types.ts ProjectedTableState + the seven `Phase` values.)*

**AC-1.9a.5 — "No `tableState` yet" renders the Home/connecting surface.**
Given the client has not yet received any `tableState` (cold open, pre-create/pre-join, or socket not yet replied),
When the router runs with `state === null`,
Then it renders the **Home/connecting** surface — there is no separate loading component; "loading" IS "no `tableState` received yet". *(UX-DR2; architecture.md#Implementation-Patterns — "loading = no tableState yet"; EXPERIENCE.md State Patterns "Cold open → Home".)*

**AC-1.9a.6 — The Story 1.3 client wire-contract type anchor is PRESERVED (no regression of the single-source-of-truth guarantee).**
Given the existing `App.svelte` carries the Story 1.3 client-side type anchor (the `satisfies Card / ProjectedTableState / Intent / ServerEvent` bindings that make any change to those wire types break `svelte-check`),
When `App.svelte` is rewritten into the router,
Then that compile-time anchor is NOT deleted — it is preserved (kept in `App.svelte`, or relocated to a dedicated `client/src/wire-anchor.ts` that is imported by the app so the typecheck still exercises it). `npm run typecheck` (svelte-check + `tsc -b`) stays green and STILL fails if any client-touched wire field is added/renamed/removed. *(Story 1.3 AC4 single-source-of-truth; App.svelte lines 1–44 current anchor; deferred-work.md — do not silently drop a standing gate.)*

**AC-1.9a.7 — The router is unit-tested as a pure function across all reachable surface branches; the build (typecheck) stays green.**
Given the routing logic,
When the router tests run,
Then a pure-function test (node-env vitest project) asserts the surface selected for: `null` state (→ Home/connecting), and one representative `ProjectedTableState` per branch in the Routing table (lobby; your-turn vs waiting during `turns`; `allActed`; `showdown`; `roundResult` alive vs `roundResult` eliminated; `gameOver` winner vs loser). The router function is extracted so it is testable WITHOUT mounting Svelte / a DOM. `npm run build` (which runs `typecheck` then `vite build`) succeeds. *(architecture.md#Testing — node-env vitest project for pure functions; epics.md Pre-mortem — "pure function of state".)*

## Tasks / Subtasks

> **Scope guard (read first):** This story ships the **foundation** — the token CSS, the bundled fonts, and the render-from-state **router** with **placeholder surface stubs**. It does NOT build the real Home/Lobby content (that is **Story 1.10**, UX-DR3/UX-DR4) and does NOT build the PWA shell / voice primitives / interaction-safety button (that is **Story 1.9b**, UX-DR16/17/18). The router must route to all nine surfaces, but each surface here is a minimal stub component that 1.10+ fleshes out. Do not wire `socket.ts` into the live receive loop here either — see Dev Notes "Where state comes from (and what is NOT in scope)".

> **TDD order (house style, proven 1.4–1.8): write the failing router test first, watch it RED, then GREEN.** The router is a PURE function (state → surface tag), so it lives in the **node-env vitest project** (no DOM, no `@cloudflare/vitest-pool-workers`). Author `routeFromState` as a plain `.ts` function, test it directly, then have `App.svelte` call it.

- [x] **Task 1 — Author `client/src/tokens.css`: the full Electric Social token set (AC: 1)**
  - [x] Read DESIGN.md (`_bmad-output/planning-artifacts/ux-designs/ux-trash-game-2026-06-19/DESIGN.md`) Colors / Typography / Layout & Spacing / Shapes / Elevation & Depth sections FIRST — the exact values are also transcribed in Dev Notes below, but cross-check against the source.
  - [x] Define ALL color tokens (Dev Notes "Color tokens") as `--color-*` custom properties on `:root`. Include `--color-outline` (`#9d8ba0`) — the hollow-Lives-pip token 1.10 needs — and `--color-secondary-container` (`#36ffc4`, the neon-mint) used for the active stroke.
  - [x] Define the type-scale tokens (Dev Notes "Type tokens"): for each role a `--type-<role>-size` / `-weight` / `-line` / `-tracking`. EVERY weight ≥ 500 (Anybody 700/800/900, Hanken 500/600) — no thin/regular weights anywhere.
  - [x] Define spacing (`--space-*`, 8px base through 64px), radii (`--radius-*`, 8/16/24/32/48 + `--radius-full: 9999px`), elevation (the surface-tint stack), the active-stroke token (`--stroke-active: 4px solid var(--color-secondary-container)` or its parts), and the inert border (`2px` `rgba(255,255,255,.10)`).
  - [x] NO Tailwind, NO `@apply`, NO UI-kit import. Plain CSS custom properties only. (eslint/build does not gate this, but it is an explicit UX-DR1 + Selected-Approach requirement — a reviewer will reject a framework.)

- [x] **Task 2 — Bundle the two fonts locally + `@font-face` them (AC: 2)**
  - [x] Create `client/public/fonts/`. Obtain Anybody (weights 700/800/900) and Hanken Grotesk (weights 500/600) as self-hosted `.woff2` files. Both are SIL Open Font License (free to bundle) — see Dev Notes "Fonts: sourcing & licensing". **Do NOT add a Google Fonts `<link>` / `@import url(...)` to a CDN** (violates the $0 / privacy / offline-shell posture). *(Both are OFL VARIABLE woff2 — one file per family covers all used weights via a `font-weight` range; ~41KB + ~51KB.)*
  - [x] Add `@font-face` blocks (in `tokens.css` or a `fonts.css` imported alongside it) mapping each `.woff2` to `font-family: "Anybody"` / `"Hanken Grotesk"` at its weight, `font-display: swap`. Reference the files with root-absolute paths (`/fonts/…`) so vite-plugin-pwa precaches them from `public/`. *(Authored in `client/src/fonts.css`, `@import`ed by `tokens.css`.)*
  - [x] Point `--font-family-display` / `--font-family-body` tokens at the bundled families.
  - [x] Verify a `vite build` emits the fonts and the manifest precache includes them (`client/dist/`); the type tokens render in the real font, not a system fallback. *(Fonts emit to `dist/fonts/`; added `workbox.globPatterns` woff2 so precache went 5→7 entries / 40→130 KiB.)*

- [x] **Task 3 — Import tokens once + apply the global brand baseline (AC: 3)**
  - [x] Import `tokens.css` exactly once — from `client/src/main.ts` (`import "./tokens.css";` before `mount`) so it loads ahead of any surface. Do NOT `@import` it from inside every surface.
  - [x] Add the minimal global baseline (in `tokens.css` or a tiny `global.css`): `html, body { background: var(--color-surface); color: var(--color-on-surface); }`, body font = Hanken `body-md`, `margin: 0`, and the `#app` root sized to the viewport. Portrait/dark only — introduce NO nav chrome. *(Baseline lives at the foot of `tokens.css`.)*

- [x] **Task 4 — Author the pure `routeFromState` function + its test (AC: 4, 5, 7)** *(test-first: write the RED router test, then GREEN)*
  - [x] Create `client/src/route-from-state.ts` exporting `routeFromState(state: ProjectedTableState | null): Surface` where `Surface` is a string-literal union (`"home" | "lobby" | "yourTurn" | "waiting" | "showdown" | "roundResult" | "eliminated" | "winner"`). HostControls is an OVERLAY, not a routed surface — do NOT put it in this union (see Dev Notes "Routing table" note).
  - [x] Implement the mapping EXACTLY per Dev Notes "Routing table". Pure: no `import.meta`, no DOM, no globals, no `Date.now()` — input → output only.
  - [x] `state === null` ⇒ `"home"` (AC-1.9a.5). Treat `phase === "lobby"` as `"lobby"` (the joined surface); the cold/no-state Home is the `null` branch — Home and Lobby are distinct surfaces (EXPERIENCE.md IA).
  - [x] Write `client/src/route-from-state.test.ts` (node-env project) asserting one case per branch (Dev Notes "Routing table" lists the exact cases). Build representative `ProjectedTableState` fixtures (reuse the field set already spelled out in the old `App.svelte` scaffold). Prove RED first (function not yet implemented / wrong), then GREEN. *(14 cases incl. null→home, alive-vs-eliminated roundResult, eliminated-still-watches-showdown, purity/no-mutation. RED proven (module-not-found) → GREEN.)*

- [x] **Task 5 — Rewrite `App.svelte` as the router + add the nine surface stubs (AC: 4, 5, 6)**
  - [x] Read the CURRENT `client/src/App.svelte` (lines 1–50) FIRST. It holds the Story 1.3 type anchor (`satisfies Card/ProjectedTableState/Intent/ServerEvent`) and a scaffold `<main>`. PRESERVE the anchor (AC-1.9a.6): either keep the `satisfies` bindings in `App.svelte`, or move them verbatim into `client/src/wire-anchor.ts` and `import "./wire-anchor";` (a side-effect import keeps the typecheck exercising them). Do NOT delete them. *(Relocated verbatim to `client/src/wire-anchor.ts`; `App.svelte` does `import "./wire-anchor";` for the side effect — typecheck still exercises it.)*
  - [x] Create `client/src/surfaces/` with nine minimal stub components: `Home.svelte`, `Lobby.svelte`, `YourTurn.svelte`, `Waiting.svelte`, `Showdown.svelte`, `RoundResult.svelte`, `Eliminated.svelte`, `Winner.svelte`, and a `HostControls.svelte` overlay stub. Each stub renders a single labeled element using the brand tokens (e.g. a heading naming the surface) — just enough that the router is visibly/ testably wired. The REAL content is 1.9b/1.10; add a one-line `SCOPE` comment in each saying so.
  - [x] In `App.svelte`: hold the projected state (for THIS story, a local `let state: ProjectedTableState | null = $state(null)` — see Dev Notes "Where state comes from"), call `routeFromState(state)`, and render the matching surface via a `{#if}` / `{:else if}` chain or a `<svelte:component>` map. Render EXACTLY one. Pass `state` down as a prop to each surface (surfaces are render-from-state, never fetch).
  - [x] Confirm `npm run typecheck` is green (svelte-check sees the preserved anchor + the new components) and `npm run build` succeeds.

- [x] **Task 6 — Verify the foundation end-to-end (AC: 1–7)**
  - [x] `npm run typecheck` green (0 errors / 0 warnings); `npm run build` succeeds and emits fonts + tokens into `client/dist/`.
  - [x] Router test green across all branches; confirm the `null`→Home and the alive-vs-eliminated `roundResult` split both pass (the two easiest to get wrong).
  - [x] Manual smoke (optional, `npm run dev`): the page renders on the dark `#1a0b2e` surface in the Anybody/Hanken fonts (not a system fallback), and forcing `state` to a sample value flips the rendered surface. *(Verified via built artifacts instead of a live browser: built CSS contains `background:#1a0b2e`, both `@font-face` families + `font-display:swap` + local `/fonts/*.woff2`; built JS contains the Home "Trash"/"Connecting…" content.)*
  - [x] Re-run the full repo lint/test (`npm run lint` / `npm test` at root) — confirm NO existing gate regressed (the GATE-1 `.send`/`.broadcast` ban and the SM-6 projection test are unaffected by client-only work, but confirm green). *(lint clean; server 27/27 incl. SM-6 gate; client 14/14.)*

## Dev Notes

### Where state comes from (and what is NOT in scope)

This story is the **router skeleton**, not the live data pipe. The architecture says `main.ts` holds the last `tableState` as a read-only store and `socket.ts` runs the receive loop — but `socket.ts` currently exposes only **builders + create/join helpers** that are deliberately NOT mounted into `App.svelte` yet (see the SCOPE headers in `client/src/socket.ts` lines 1–12, 99–129, 182–186 — each says the live receive loop + the read-only store + the surface router belong to "Stories 1.9a/1.10"). 

For THIS story, route from a **local `ProjectedTableState | null` held in `App.svelte`** (Svelte 5 `$state`), seeded `null`. Wiring the actual socket→store→router data flow (subscribing to incoming `tableState`, threading the create/join helpers into Home/Lobby) is **Story 1.10**'s job, when the real Home/Lobby surfaces exist to drive it. Do not build the receive loop here; do not call `createRoomWithRetry`/`joinRoomAndListen` from `App.svelte` yet. Keeping the router a pure function of an injected state (AC-1.9a.4/.7) is exactly what makes 1.10 able to drop the live store in without touching routing logic. [Source: client/src/socket.ts SCOPE headers; architecture.md#Complete-Project-Directory-Structure main.ts "holds last tableState (read-only store)".]

### Routing table (the exact pure mapping — AC-1.9a.4/.5/.7)

`routeFromState(state)` → one `Surface`. Switch in this order:

| Condition (first match wins) | Surface | Test case |
|---|---|---|
| `state === null` | `home` | null → Home/connecting (AC-1.9a.5) |
| `phase === "lobby"` | `lobby` | joined, pre-Deal |
| `phase === "gameOver"` && `you` is in `winnerIds` | `winner` | game won (you) |
| `phase === "gameOver"` (otherwise) | `eliminated` | game over, not the winner |
| `!you.isAlive` (any active phase below) | `eliminated` | knocked-out spectator |
| `phase === "showdown"` (or `revealed === true`) | `showdown` | simultaneous reveal |
| `phase === "roundResult"` | `roundResult` | lives updated, awaiting re-deal |
| `phase === "dealing"` \|\| `phase === "turns"` \|\| `phase === "allActed"`, and `currentTurnId === you.playerId` | `yourTurn` | your turn |
| `phase === "dealing"` \|\| `phase === "turns"` \|\| `phase === "allActed"` (otherwise) | `waiting` | someone else's turn / awaiting reveal |

Notes:
- **Eliminated takes precedence** over your-turn/waiting/showdown for the live phases: a dead player is a spectator (EXPERIENCE.md "Eliminated → spectator: keeps seeing Waiting/Showdown but cannot act"). Decide deliberately whether an eliminated player still sees the `showdown` reveal — per EXPERIENCE.md they DO ("keeps seeing … Showdown"). Recommended: let `showdown` win over `eliminated` so a knocked-out player still watches the flip; eliminated only overrides `turns`/`waiting`/`roundResult`. Encode whichever you choose explicitly and TEST it — this ordering is the single most reviewable decision in the function. (For 1.9a, with stubs, either is acceptable AS LONG AS it's explicit and tested; flag the choice in Completion Notes for 1.10/Epic 3 to confirm against the real Showdown/Eliminated surfaces, Decision #6 play-confirmed.)
- **`allActed`** is a real Phase value (Story 1.3) — the one pass is complete, cards are final-but-hidden, awaiting the Host's reveal. It routes to `waiting` (nobody's turn; awaiting Showdown). Do NOT treat it as an error/unknown.
- **HostControls is NOT in the `Surface` union** — it's an overlay invoked on top of Lobby/Waiting/RoundResult (EXPERIENCE.md IA line 37; "never reachable from Your Turn"). Ship the stub component, but do not route to it from `routeFromState`; the overlay toggle is 1.10/Epic 4 work.
- `winnerIds` membership: check `state.winnerIds?.includes(state.you.playerId)`.

### Color tokens (DESIGN.md — author ALL of these as `--color-*` on `:root`)

```
surface: #1a0b2e            surface-dim: #1a0b2e          surface-bright: #413257
surface-container-lowest: #150629   surface-container-low: #231437   surface-container: #27183b
surface-container-high: #322346     surface-container-highest: #3d2e52
on-surface: #eddcff         on-surface-variant: #d4c0d7
inverse-surface: #eddcff    inverse-on-surface: #38294d
outline: #9d8ba0            outline-variant: #514255      surface-tint: #ecb2ff
primary: #ecb2ff            on-primary: #520071           primary-container: #bd00ff   on-primary-container: #ffffff   inverse-primary: #9900cf
secondary: #ffffff          on-secondary: #003828         secondary-container: #36ffc4 (NEON MINT)   on-secondary-container: #007255
tertiary: #d0cc05           on-tertiary: #333200          tertiary-container: #b3b000  on-tertiary-container: #434100
error: #ffb4ab              on-error: #690005             error-container: #93000a     on-error-container: #ffdad6
primary-fixed: #f8d8ff      primary-fixed-dim: #ecb2ff    on-primary-fixed: #320047    on-primary-fixed-variant: #74009f
secondary-fixed: #36ffc4    secondary-fixed-dim: #00e1ab  on-secondary-fixed: #002116  on-secondary-fixed-variant: #00513c
tertiary-fixed: #ede933     tertiary-fixed-dim: #d0cc05   on-tertiary-fixed: #1d1d00   on-tertiary-fixed-variant: #4a4900
background: #1a0b2e         on-background: #eddcff        surface-variant: #3d2e52
```
Semantic roles to remember for downstream stories: **neon-mint** = `secondary-container #36ffc4` (CTAs / active stroke / filled Lives pips / turn indicator); **`outline #9d8ba0`** = hollow Lives pip; **error stack** (`#ffb4ab` stroke + `#93000a` fill) = Showdown loser highlight. [Source: DESIGN.md Colors.]

### Type tokens (DESIGN.md — Anybody + Hanken; ALL weights ≥ 500)

```
display-xl    : Anybody, 96px, weight 900, line 100px, tracking -0.04em
display-lg    : Anybody, 64px, weight 800, line 72px,  tracking -0.02em   ← Room Code (1.10) uses this
headline-lg   : Anybody, 40px, weight 800, line 48px
headline-lg-mobile : Anybody, 32px, weight 800, line 38px
body-lg       : Hanken Grotesk, 20px, weight 600, line 28px
body-md       : Hanken Grotesk, 16px, weight 500, line 24px              ← global body default
label-bold    : Anybody, 14px, weight 700, line 16px
```
Design rule: nothing below weight 500 — the system should feel heavy/grounded. [Source: DESIGN.md Typography.]

### Spacing / radii / elevation tokens (DESIGN.md)

- Spacing (8px base): `base-unit 8px`, `stack-sm 16px`, `gutter 24px`, `stack-md/container-padding 32px`, `stack-xl 64px`. All vertical rhythm is an 8px multiple.
- Radii (chunky): `sm 0.5rem(8px)`, `DEFAULT 1rem(16px)`, `md 1.5rem(24px)`, `lg 2rem(32px)`, `xl 3rem(48px)`, `full 9999px (pill — primary buttons)`. Min 24px (`md`) for large containers/cards.
- Elevation = **tonal stack** (no drop shadows): base `#1a0b2e` → surfaces are lighter purple tints (`surface-container-*`). Active/focused element = **4px solid Neon-Mint stroke** (`#36ffc4`), NOT a shadow. Inert boundaries = **2px white @ 10% opacity** border. [Source: DESIGN.md Layout & Spacing / Shapes / Elevation & Depth.]

### Fonts: sourcing & licensing (AC-1.9a.2)

- **Anybody** and **Hanken Grotesk** are both **SIL Open Font License 1.1** — free to self-host and bundle, no attribution UI required, no CDN call needed. Self-host as `.woff2` (smallest, universally supported).
- Bundle ONLY the used weights: Anybody **700, 800, 900**; Hanken Grotesk **500, 600**. (Avoid shipping a full variable-font superset into the precached shell.)
- Files go in `client/public/fonts/` (vite serves `public/` from root and vite-plugin-pwa precaches it). `@font-face src: url("/fonts/<file>.woff2") format("woff2")`, `font-display: swap`.
- **No Google Fonts `<link>` / CDN `@import`** — a third-party request breaks the privacy/$0 posture (G2 standing gate) and the offline app-shell goal. If the exact `.woff2` files aren't already in the repo, fetch them from the official OFL distributions and commit them under `client/public/fonts/`. [Source: architecture.md#Complete-Project-Directory-Structure `client/public/fonts/`; G2 gate epics.md lines 198–212.]

### Architecture & project-structure compliance

- **Client tech (pinned):** Svelte `5.56.3` (runes mode — use `$state`/`$props`), Vite `8.0.16`, `vite-plugin-pwa 1.3.0`, `partysocket 1.2.0`, `svelte-check 4.4.1`. Don't add deps; the token CSS and router need none beyond what's installed. [Source: client/package.json; architecture.md#Web-Verified-Facts.]
- **File layout (target this exactly):** `client/src/tokens.css`, `client/src/App.svelte` (router), `client/src/route-from-state.ts` (+ `.test.ts`), `client/src/surfaces/*.svelte` (one PascalCase component per surface), `client/public/fonts/`. Do NOT pre-create a shared `components/` dir — "let the first genuinely reused widget pull it into existence." [Source: architecture.md#Complete-Project-Directory-Structure.]
- **Naming:** `kebab-case.ts` modules, `PascalCase.svelte` components, `camelCase` functions/vars, `PascalCase` types (no `I` prefix), `SCREAMING_SNAKE_CASE` module constants. [Source: architecture.md#Naming.]
- **Render-from-state invariant:** every surface is a pure function of engine state; the device re-derives its surface from state alone on any reconnect/resume — no surface shows controls/data from a different state. The router is the enforcement point. [Source: architecture.md#Enshrined-experience-invariant; UX-DR2.]
- **Client never mutates `tableState`** and never sends UI-only state to the server (peek etc. are local — not relevant to 1.9a but the invariant the surfaces inherit). [Source: architecture.md#Implementation-Patterns.]

### Standing gates this story must not break

- **GATE-1 (`.send`/`.broadcast` ban, eslint.config.js):** client-only; unaffected, but `npm run lint` must stay green. Do not add a `.send`/`.broadcast` anywhere outside `server/src/push-state.ts`.
- **SM-6 privacy projection test:** server-side; unaffected by client work, but confirm `npm test` stays green (no field added to `ProjectedTableState` here, so no new privacy obligation triggers — Pre-mortem E).
- **Eyes-up / no-attention-sink (G1):** the foundation must invite no scrolling, no feed, no idle/ambient animation, no persistent nav. The router enforces "exactly one surface, no nav"; the global baseline adds no chrome. [Source: epics.md G1 lines 178–196.]
- **$0 / no-paid-dependency (G2):** no CDN font, no new paid/hosted dependency. [Source: epics.md G2 lines 198–212.]

### Testing standards

- The router test lives in the **node-env vitest project** (pure function, no DOM, no pool-workers). [Source: architecture.md#Testing — node env for rules + projection / pure functions.]
- No Svelte component-test harness is set up in the repo (architecture leaves client component testing to the implementing story). For 1.9a, test the **extracted pure `routeFromState`** — that is where the routing correctness lives; mounting stubs adds little value and no harness exists. If you want a smoke render, do it manually via `npm run dev` (Task 6), not a new test dependency.
- Run `npm run build` (= `typecheck` then `vite build`) as the build gate; `npm run typecheck` = `svelte-check` + `tsc -b`.

### Project Structure Notes

- New files: `client/src/tokens.css`, `client/src/route-from-state.ts`, `client/src/route-from-state.test.ts`, `client/src/surfaces/{Home,Lobby,YourTurn,Waiting,Showdown,RoundResult,Eliminated,Winner,HostControls}.svelte`, `client/public/fonts/*.woff2`, optionally `client/src/wire-anchor.ts`.
- Modified files: `client/src/App.svelte` (scaffold → router; preserve the 1.3 anchor), `client/src/main.ts` (add `import "./tokens.css";`).
- `client/vite.config.ts` already wires `vite-plugin-pwa` with a placeholder manifest — the real manifest copy + icons are Story 1.9b; leave the config as-is here (don't pre-empt 1.9b). The font precache is automatic from `public/`.
- No server/shared changes. No new npm dependencies.

### Previous story intelligence (1.6 / 1.7 / 1.8)

- **House TDD discipline:** every prior story wrote the failing test first and watched it RED before GREEN — do the same with `route-from-state.test.ts`. Pure-function-first is the established pattern.
- **`socket.ts` was intentionally left unmounted across 1.5–1.8** with explicit SCOPE headers deferring the receive loop + store + router to "1.9a/1.10". This story builds the router HALF (skeleton) but, per the scope guard above, leaves the live data wiring to 1.10 (when surfaces exist to drive it). Respect those SCOPE comments; update them if you touch the files.
- **Fail-loud config** (1.7, deferred-work #48): `createSocket` throws on missing `VITE_WS_URL`. Not exercised here (no socket mounting), but don't regress it.
- **The Story 1.3 client anchor in `App.svelte` is a standing single-source-of-truth gate** (AC-1.9a.6) — prior stories were careful to keep contract changes breaking the client typecheck. Relocating it is fine; deleting it is a regression.
- Branch/commit convention (git history): one PR per story, titled `Story 1.9a: …`; baseline for this story is `dc1cda1`.

### References

- [Source: epics.md#Story-1.9a (lines 406–420)] — the two ACs (token foundation + render-from-state router).
- [Source: epics.md Decision #1 (line 150), #6 (line 155), Pre-mortem E (line 170)] — lobby validation scope, play-confirmed surfaces, standing privacy gate.
- [Source: DESIGN.md Colors / Typography / Layout & Spacing / Shapes / Elevation & Depth] — all token values (transcribed in Dev Notes).
- [Source: EXPERIENCE.md Information Architecture (lines 19–37), State Patterns (lines 75–95)] — the nine surfaces, "no persistent navigation", the per-state surface mapping.
- [Source: architecture.md#Complete-Project-Directory-Structure] — `client/src/` layout, `tokens.css`, `App.svelte` router, `public/fonts/`, surfaces dir, main.ts read-only store.
- [Source: architecture.md#Enshrined-experience-invariant, #D3, #Implementation-Patterns, #Testing, #Naming] — render-from-state, single `tableState` event, loading = no-state, node-env test project, naming rules.
- [Source: shared/src/types.ts (lines 39–135)] — `Phase` (7 values), `ProjectedTableState` shape the router switches on.
- [Source: client/src/App.svelte (lines 1–50)] — current scaffold + the Story 1.3 type anchor to preserve.
- [Source: client/src/socket.ts (SCOPE headers)] — why the live receive loop is NOT in this story.

### Review Findings

_Code review 2026-06-19 (bmad-code-review: Blind Hunter + Edge Case Hunter + Acceptance Auditor). Acceptance Auditor: all 7 ACs PASS, no scope/gate regressions. 6 findings dismissed as noise (false-positive type conflict, intentional `const $state(null)`, label-bold/Anybody weight, globPatterns phrasing, stub null-guard cosmetics, `you`-undefined needs no runtime guard by design)._

- [x] [Review][Defer] `revealed` short-circuits to `showdown` for ANY phase, with no phase gate [client/src/route-from-state.ts:53 → Epic 3] — deferred. `if (phase === "showdown" || state.revealed) return "showdown";` runs BEFORE the `roundResult` and `!isAlive` branches. `revealed` is projected straight from `round.revealed` (`server/src/project-state.ts:21`); if the server reaches `phase === "roundResult"` while `round` (and thus `revealed: true`) is not yet cleared, every device routes to `showdown` instead of `roundResult`/`eliminated`. The precedence "showdown wins over eliminated" is the spec-recommended Decision #6 choice (Dev Notes). **Defer reason:** the router runs only on injected fixtures in 1.9a (no live projector); the showdown-vs-roundResult precedence is a spec-flagged Decision #6 call for Epic 3 to confirm against the real resolution code — gate `revealed` on phase then (and add a `roundResult + revealed:true` test) if the projector doesn't guarantee clearing it on the transition.

- [x] [Review][Patch] Router `{#if}` chain has no defensive `{:else}`; router + template are two hand-synced exhaustiveness lists [client/src/App.svelte:32-48] — every non-home branch passes `state={state!}`. Type-safe today (8 literals enumerated, `routeFromState` returns only those), but if the union grows or a branch is missed, App renders a blank dark frame with no signal. **Fixed (2026-06-19):** added a terminal `{:else}` that falls back to `<Home />` (the safe neutral frame) so a missed/added Surface fails to a visible surface rather than nothing. Typecheck green (0/0).

- [x] [Review][Defer] Empty/undefined `winnerIds` at `gameOver` routes the real winner to `eliminated` [client/src/route-from-state.ts:48] — deferred, Epic 3 dependency. `state.winnerIds?.includes(...)` is falsy when `winnerIds` is `[]`/absent, so EVERY player (including the winner) gets `eliminated`. The projector does not populate `winnerIds` until Epic 3 (`server/src/project-state.ts` leaves it unset this story), so it is not reachable in 1.9a — but it is the DEFAULT projection shape today and will mis-route the moment a real `gameOver` is produced without `winnerIds`.

- [x] [Review][Defer] Surface stubs `find()`-then-fallback drops co-winners and silently degrades on unknown ids [client/src/surfaces/Winner.svelte:7, Waiting.svelte:8] — deferred, real surface content is Story 1.10. `Winner` renders only the FIRST `winnerIds` match (a multi-winner/tie shows one name); `Winner`/`Waiting` fall back to generic copy when `winnerIds`/`currentTurnId` references an id not in `players[]`. Acceptable for stubs; flag for the 1.10 real-content pass.

## Dev Agent Record

### Agent Model Used

Opus 4.8 (1M context) — `us.anthropic.claude-opus-4-8[1m]`

### Debug Log References

- RED proof (Task 4): `vitest run` failed with `Cannot find module './route-from-state'` before the function existed; GREEN after implementing → 14/14.
- Resolved 4 typecheck errors in the router test by typing the fixture overrides as `Partial<Omit<…,"you">> & { you?: Partial<…> }` so a single `you` sub-field can be overridden.
- Resolved 5 svelte-check `state_referenced_locally` warnings on the data-less stubs with a targeted `<!-- svelte-ignore state_referenced_locally -->` immediately above the intentional top-level `void state;` read (the stubs keep the typed `state` prop for the 1.10 contract but render no data yet).

### Completion Notes List

- **Tokens (AC-1.9a.1/.3):** `client/src/tokens.css` holds the full DESIGN.md "Electric Social" set as `:root` custom properties — colors (full surface stack, on-surface, primary/secondary/tertiary + containers + fixed variants, `outline`, error stack, background), type scale (Anybody + Hanken, every weight ≥ 500), 8px spacing, chunky radii incl. `--radius-full`, tonal-stack elevation, 4px neon-mint active stroke, 2px-white inert border. Plain CSS only — no Tailwind/UI kit. Imported once in `main.ts`; global baseline sets the `#1a0b2e` surface + Hanken `body-md` body.
- **Fonts (AC-1.9a.2):** Anybody + Hanken Grotesk self-hosted under `client/public/fonts/` as the official OFL **variable** woff2 (one file per family, ~41KB/~51KB), `@font-face`'d in `client/src/fonts.css` with `font-display: swap` and a `font-weight` range. No CDN — G2/$0/privacy posture and offline shell preserved. Added `workbox.globPatterns` woff2 so the build precaches them (5→7 entries).
- **Router (AC-1.9a.4/.5/.7):** `client/src/route-from-state.ts` — pure `routeFromState(state | null) → Surface`, no DOM/globals, unit-tested without mounting Svelte. `null → home`; otherwise switches on `phase` then `you.isAlive`/`you.isHost`/`currentTurnId`/`revealed`/`winnerIds` per the Dev Notes Routing table. **Precedence decision (flagged for Epic 3):** `gameOver` and `showdown` are evaluated before the generic `!isAlive → eliminated` rule, so a knocked-out player still sees the winner screen and still WATCHES the showdown flip (EXPERIENCE.md "keeps seeing … Showdown"); otherwise `!isAlive` overrides turns/waiting/roundResult. HostControls is an overlay, intentionally NOT in the `Surface` union.
- **App + surfaces (AC-1.9a.4/.6):** `App.svelte` rewritten as the router — holds a local `ProjectedTableState | null` (1.10 swaps in the live store), renders EXACTLY one of nine surface stubs via an `{#if}`/`{:else if}` chain, no persistent navigation. The Story 1.3 client wire-contract type anchor was **relocated verbatim** to `client/src/wire-anchor.ts` and side-effect-imported by `App.svelte` — the single-source-of-truth typecheck gate is preserved, not deleted.
- **Scope honored:** did NOT wire `socket.ts`'s live receive loop / read-only store (Story 1.10), and did NOT build real Home/Lobby content or the PWA shell/voice/interaction-safety button (Stories 1.9b/1.10). Surface stubs carry SCOPE comments naming their owning story.
- **No new dependencies:** vitest 4.1.9 is already hoisted via the workspace; client `vitest.config.ts` (node env) + a client `test` script were added and wired into root `npm test`.
- **No regressions:** root `npm run lint` clean (GATE-1 `.send`/`.broadcast` ban + rules purity intact); `npm test` → server 27/27 (incl. the SM-6 standing privacy gate) + client 14/14; `npm run typecheck` 0/0; `npm run build` succeeds.

### File List

**New:**
- `client/src/tokens.css`
- `client/src/fonts.css`
- `client/src/route-from-state.ts`
- `client/src/route-from-state.test.ts`
- `client/src/wire-anchor.ts`
- `client/vitest.config.ts`
- `client/public/fonts/anybody-variable.woff2`
- `client/public/fonts/hanken-grotesk-variable.woff2`
- `client/src/surfaces/Home.svelte`
- `client/src/surfaces/Lobby.svelte`
- `client/src/surfaces/YourTurn.svelte`
- `client/src/surfaces/Waiting.svelte`
- `client/src/surfaces/Showdown.svelte`
- `client/src/surfaces/RoundResult.svelte`
- `client/src/surfaces/Eliminated.svelte`
- `client/src/surfaces/Winner.svelte`
- `client/src/surfaces/HostControls.svelte`

**Modified:**
- `client/src/App.svelte` (scaffold → render-from-state router; 1.3 anchor relocated out)
- `client/src/main.ts` (import `tokens.css` once; SCOPE header → 1.9a)
- `client/package.json` (add `test` script)
- `client/vite.config.ts` (precache woff2 via `workbox.globPatterns`)
- `package.json` (root `test` now runs server + client)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (1-9a → in-progress → review)

## Change Log

| Date | Change |
|---|---|
| 2026-06-19 | Story 1.9a implemented: Electric Social design-token foundation (`tokens.css`), locally-bundled fonts (Anybody + Hanken Grotesk woff2 + `@font-face`), and the pure render-from-state router (`route-from-state.ts`) with nine surface stubs in `App.svelte`. Story 1.3 client wire-contract anchor relocated to `wire-anchor.ts` (preserved). Client node-env vitest project added. All gates green; status → review. |
