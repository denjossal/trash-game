---
baseline_commit: ff44517c7361e0cbfa40594c709bf02b66788128
---

# Story 4.1: Conductor bar & Host Controls overlay (off the turn path)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Host,
I want a dedicated place for conductor actions that never appears on a Player's turn screen,
so that mid-session controls never compete with Swap/Keep — and so the Host can actually drive the game (Deal / Showdown / Re-deal) by tapping, not just by a test harness.

## Context & Why This Story Matters

This is the FIRST story of Epic 4 ("Conduct the night") and it closes a real gap discovered during the Epic 3 playtest prep: **the browser client cannot currently drive a game by clicking.** The Lobby's Deal button is wired to a no-op (`onclick={() => {}}` — `Lobby.svelte:76`), there is NO client send for `revealAll` at all, and the Epic-3 Re-deal is an inline one-off on Showdown. The e2e harness only gets to a dealt state via an auxiliary raw-WebSocket "aux-host" trick precisely because "the conductor 'Deal' button is Story 4.1 (NOT built in Epic 2)" (`client/e2e/helpers/table.ts:3-12`).

Story 4.1 builds the **shared `ConductorBar`** — the Host-only, bottom-anchored bar that holds the single phase-appropriate primary (Deal / Showdown / Re-deal) plus a ⚙ controls affordance — mounted as an OVERLAY on the non-turn surfaces (never a routed Surface, never on Your Turn). It also adds the two missing client send seams (`deal`, `revealAll`) and the empty ⚙ controls sheet shell that Story 4.2 will fill.

**Server is unchanged.** `handleDeal` and `handleReveal` already exist and are dispatched (`dispatch.ts:90` `case "deal"` → `handleDeal`; `dispatch.ts:135` `case "revealAll"` → `handleReveal`). The wire contract already names `deal`/`revealAll` in the grouped phaseToken Intent member. This is a **CLIENT-ONLY** story: two new builders + two new send seams + one new shared component + one overlay shell + refactor of two existing inline blocks.

## Acceptance Criteria

1. **AC-4.1.1 — Host-only conductor bar on the non-turn surfaces.** **Given** a Host on a non-turn surface (Lobby, Waiting, Round Result / the revealed Showdown beat) **When** the surface renders **Then** a Host-only conductor bar is anchored at the bottom (thumb zone) holding the single phase-appropriate primary — `lobby`→**Deal** (disabled until ≥2 Players), `allActed`→**Showdown**, `roundResult`→**Re-deal** — plus a ≥48dp ⚙ controls affordance. *(UX-DR14; epics.md:821-823.)*

2. **AC-4.1.2 — Absent for non-Hosts and absent on Your Turn.** **Given** a non-Host on any surface, OR ANY user (Host included) on the Your Turn surface **When** it renders **Then** the conductor bar is absent entirely — it is never reachable from Your Turn, and a non-Host never sees it. *(UX-DR14, NFR-9; epics.md:825-827.)*

3. **AC-4.1.3 — The Deal action works end-to-end by tapping.** **Given** the Host on the Lobby with ≥2 Players **When** the Host taps **Deal** **Then** the client sends the `deal` intent (Host-only, carrying the current `state.phaseToken`) via the GATE-1-exempt store seam, the server deals the round, and every device re-renders to the dealt round (Your Turn / Waiting). The Deal button is disabled (not merely no-op) until ≥2 Players. *(FR-14, AR-6; closes the `Lobby.svelte:76` no-op.)*

4. **AC-4.1.4 — The Showdown action works end-to-end by tapping.** **Given** the Host on the Waiting surface while `phase === "allActed"` (every alive Player from the Deal snapshot has acted) **When** the Host taps **Showdown** **Then** the client sends a NEW `revealAll` intent (Host-only, carrying `state.phaseToken`) via a NEW store seam, the server accepts (it is only accepted at `allActed`), and the reveal beat fires for every device. **Given** any phase other than `allActed`, the Showdown primary is NOT offered. *(FR-9/FR-14, AR-6; epics.md:578/586 — `revealAll` accepted only at `allActed`.)*

5. **AC-4.1.5 — Re-deal continues to work, now via the shared bar.** **Given** the Host on the revealed `roundResult` beat (the Showdown surface with `phase === "roundResult"`) **When** the Host taps **Re-deal** **Then** the client sends `dealAgain` (existing `sendDealAgain` seam, unchanged behavior). The Showdown surface's previously-inline Host Re-deal block is REPLACED by the shared `ConductorBar`; the non-Host `WAITING_TO_REDEAL` line and the `gameOver`-absence (router sends gameOver to winner/eliminated, never here) are preserved unchanged. *(FR-12, UX-DR10/UX-DR14; refactor of `Showdown.svelte:101-113`.)*

6. **AC-4.1.6 — The ⚙ opens a one-level modal sheet shell.** **Given** the ⚙ affordance on the conductor bar **When** the Host opens it **Then** a one-level modal sheet opens on `surface-container-high` over the surface beneath, never stacking two deep, and closes back to that same surface. Focus moves into the sheet on open and returns to the ⚙ trigger on close. The sheet BODY is a shell/placeholder this story — the three FR-14 controls (Lives stepper, remove Player, reassign Host) are Story 4.2. *(UX-DR13; epics.md:829-831.)*

7. **AC-4.1.7 — Eyes-Up gate: the overlay holds ONLY the phase action + (future) the three controls.** **Given** the conductor bar and the ⚙ sheet **When** they are built **Then** they contain ONLY the phase-appropriate primary + the ⚙ affordance (bar) and ONLY the placeholder for the three FR-14 controls (sheet) — NO turn timer, NO activity/event log, NO player-status dashboard, NO ambient/idle content, nothing to scroll. *(Mary review — must not become an attention sink; gated by the Eyes-Up standing gate, Story G1 / NFR-9; epics.md:833-835.)*

8. **AC-4.1.8 — Accessibility floor.** **Given** every conductor-bar and overlay control **Then** each is a real `<button>` ≥48dp with an SR-accessible name (role + state), focus order follows reading order, contrast meets WCAG AA on the dark surface (use `--color-on-surface` / `outline` for inert borders, NOT `outline-variant` which fails 3:1), no state by color alone, and the press-scale / any motion is dropped under `prefers-reduced-motion` (the same pure-CSS `@media` pattern as `Button.svelte` — no JS `matchMedia`). *(NFR-10; epics.md:47; DESIGN.md:151/181/212; EXPERIENCE.md:108-114.)*

9. **AC-4.1.9 — Client-only, gates green, no contract/server change.** **Given** the full change **Then** NO `shared/src/types.ts`, NO server, NO `route-from-state.ts` Surface-union change (HostControls stays a NON-routed overlay); GATE-1 (no `socket.send` from a surface — all sends via the `table-store` seams) and GATE-2 (rules purity, untouched) hold; lint + typecheck (`tsc` 0 / `svelte-check` 0) + build all green; new + existing tests pass. *(architecture.md client boundary; GATE-1/GATE-2.)*

## Tasks / Subtasks

- [x] **Task 1 — Add the two missing client send seams (AC: 4.1.3, 4.1.4)**
  - [x] In `client/src/socket.ts`, add `buildDealIntent(phaseToken: number): PhaseIntent` returning `{ type: "deal", payload: { phaseToken } }` — mirror `buildDealAgainIntent` (`socket.ts:158`) EXACTLY, including the Extract-by-grouped-member caveat (a literal `Extract<Intent, {type:"deal"}>` resolves to `never`; reuse the existing `PhaseIntent` alias at `socket.ts:153`). Annotate the JSDoc with `Story 4.1` + source.
  - [x] In `client/src/socket.ts`, add `buildRevealAllIntent(phaseToken: number): PhaseIntent` returning `{ type: "revealAll", payload: { phaseToken } }` — same pattern.
  - [x] In `client/src/lib/table-store.svelte.ts`, add `sendDeal(phaseToken)` and `sendRevealAll(phaseToken)` — mirror `sendDealAgain` (`table-store.svelte.ts:148-150`): `if (liveSocket === null) return; sendIntent(liveSocket, buildXIntent(phaseToken));`. Import the new builders. Keep the same "GATE-1-exempt sendIntent / silent stale-phase swallow / fire-and-forget" JSDoc voice.
- [x] **Task 2 — Build the shared `ConductorBar` component (AC: 4.1.1, 4.1.2, 4.1.7, 4.1.8)**
  - [x] Create `client/src/components/ConductorBar.svelte` (reused widget → lives in `components/` alongside `Button`/`Card`/`LivesPips`). Props: `{ state: ProjectedTableState }`.
  - [x] Render NOTHING unless `state.you.isHost` (AC-4.1.2). Map `state.phase` → the single primary using `Button` (existing primary variant, ≥72px hero) + the `⚙` affordance (≥48dp real `<button>` with `ariaLabel={HOST_CONTROLS}`):
        `lobby` → Deal (`disabled` until `players.length >= MIN_PLAYERS`), onclick `sendDeal(state.phaseToken)`;
        `allActed` → Showdown, onclick `sendRevealAll(state.phaseToken)`;
        `roundResult` → Re-deal, onclick `sendDealAgain(state.phaseToken)`.
        For any other phase the bar shows ONLY the ⚙ (or nothing if the surface doesn't host the bar — see Task 4).
  - [x] Bottom-anchored (thumb zone), same `--color-secondary-container` primary look the bar already uses on Lobby. Eyes-Up: bar holds ONLY {one primary, ⚙} — nothing else (AC-4.1.7).
- [x] **Task 3 — Build the ⚙ Host Controls sheet shell (AC: 4.1.6, 4.1.7, 4.1.8)**
  - [x] Flesh `client/src/surfaces/HostControls.svelte` (today a 1.9a stub, `HostControls.svelte:1-14`) into a one-level modal sheet on `--color-surface-container-high`. Local UI-only `$state` boolean `open` OWNED by the bar/overlay (NOT server state — UI-only local state is allowed; the no-client-screen-state rule is about the ROUTED surface, see `table-store` ownership note).
  - [x] Open from the bar's ⚙; close via a close affordance + Escape; never stack two deep (a single boolean, one sheet). On open, move focus into the sheet; on close, return focus to the ⚙ trigger.
  - [x] Body = a heading (`HOST_CONTROLS`) + an explicit "controls land in Story 4.2" placeholder comment. NO Lives stepper / remove / reassign here (those are 4.2). NO timer/log/dashboard/ambient (AC-4.1.7).
- [x] **Task 4 — Mount the bar as an overlay (NOT a routed Surface) (AC: 4.1.1, 4.1.2, 4.1.9)**
  - [x] In `App.svelte`, render `<ConductorBar state={state!} />` as an OVERLAY layer alongside the routed surface, shown ONLY when the routed surface is one of the non-turn host surfaces — `lobby`, `waiting`, `showdown`/`roundResult`. NOT on `home`, `yourTurn`, `eliminated`, `winner`. Do NOT add HostControls to the `Surface` union or `routeFromState` (it stays deliberately absent — `route-from-state.ts:11-13`).
  - [x] Decide the mount cleanly: the bar reads `isHost`/`phase` itself and self-hides, so the App-level gate only needs to exclude `yourTurn` (and `home`) where the bar must never appear. Keep `route-from-state.ts` and its Surface union UNCHANGED.
- [x] **Task 5 — Refactor the two existing inline conductor blocks to the shared bar (AC: 4.1.3, 4.1.5)**
  - [x] **Resolve the Deal affordance ONE way (no double bar):** the shared `ConductorBar` becomes the SOLE owner of the Deal primary. In `Lobby.svelte`, KEEP the Lives stepper (it is a lobby affordance, not a conductor edge — 4.2 moves Lives into the ⚙ sheet, NOT this story) but REMOVE the dead `<Button onclick={() => {}}>{DEAL}</Button>` (`Lobby.svelte:76`) and its surrounding Deal markup so Deal is rendered only by the App-mounted bar. Because the bar is bottom-anchored and Lobby's stepper is also in a bottom `.conductor` div, lay the bar so it does NOT visually collide with the stepper (e.g. the stepper sits in Lobby's body and the bar's Deal is the bottom-most element). The end state: exactly ONE Deal button on screen, driven by `sendDeal`.
  - [x] `Showdown.svelte`: REMOVE the inline Host-only Re-deal block (`Showdown.svelte:101-113`) in favor of the shared bar's `roundResult`→Re-deal. PRESERVE the non-Host `WAITING_TO_REDEAL` line and the `canReDeal = phase === "roundResult"` gate (the bar is Host-only, so the non-Host waiting line must remain on the surface, NOT in the bar). Keep `gameOver` absence intact (router never routes gameOver here). End state: exactly ONE Re-deal button (the bar's) for the Host; the non-Host still sees the waiting line on the surface.
  - [x] **Decision note (record in Dev Agent Record):** Lives stepper stays inline on Lobby for THIS story; do not pull it into the ⚙ sheet (that is 4.2's `hostSetLives` control + the M1 clamp-vs-top-up decision).
- [x] **Task 6 — Copy (AC: 4.1.1, 4.1.6, 4.1.8)**
  - [x] In `client/src/lib/copy.ts`, add `SHOWDOWN` (a warm, plainspoken primary label for the reveal action — there is NO existing Showdown button string; author one in the voice table style, annotated `Story 4.1`) and `HOST_CONTROLS = "Host controls"` (the ⚙ accessible name + sheet heading). Reuse existing `DEAL` (`copy.ts:41`), `RE_DEAL` (`copy.ts:80`), `WAITING_TO_REDEAL` (`copy.ts:83`) verbatim.
- [x] **Task 7 — Tests (RED-first) (AC: all)**
  - [x] New `client/src/components/ConductorBar.svelte.test.ts` (client-dom): per-phase primary mapping (lobby→Deal disabled<2 / allActed→Showdown / roundResult→Re-deal); Host-only (no bar for non-Host); each primary's onclick calls the right store seam with `state.phaseToken` (mock the seams); ⚙ present ≥48dp with accessible name; bar absent / not mounted for `yourTurn`.
  - [x] New `client/src/surfaces/HostControls.svelte.test.ts`: opens on ⚙, closes back, never two-deep, focus into sheet + back to trigger, shell body only (NO Lives/remove/reassign, NO timer/log/dashboard).
  - [x] EXTEND `Showdown.svelte.test.ts`: the inline Re-deal block is gone; the non-Host `WAITING_TO_REDEAL` line still renders at `roundResult`; `gameOver` still routes away (unchanged). Confirm `sendDealAgain` is now reached via the bar in the host case (or assert the surface no longer renders its own Re-deal Button).
  - [x] EXTEND/adjust `Lobby.svelte` tests if present for the Deal affordance change (one Deal, disabled<2, calls `sendDeal`).
  - [x] Confirm RED-first: the new ConductorBar/HostControls tests fail against absent component/stub before implementation.
- [x] **Task 8 — Gates (AC: 4.1.9)**
  - [x] Run `npm run lint` (GATE-1 egress ban must stay green — surfaces/components call store seams, never `socket.send`), `npm run typecheck` (`tsc -b` + `svelte-check` 0), `npm run build`. Run `npm run test --workspace=client`. Confirm server tests untouched/green (no server file changed).
  - [x] (Recommended) After dev-story, re-run the e2e harness — with a real Deal/Showdown button, a future harness no longer NEEDS the aux-host trick for Deal; note this in deferred-work.

## Dev Notes

### This is a CLIENT-ONLY story — the server side is already done
- `handleDeal` and `handleReveal` exist and are dispatched: `dispatch.ts:90` `case "deal"` → `handleDeal(host, intent, …)`; `dispatch.ts:135` `case "revealAll"` → `handleReveal(host, intent, …)`. Both are Host-only, phaseToken-guarded, and `revealAll` is accepted ONLY at `phase === "allActed"`. **Do NOT touch the server.**
- The wire contract already names both intents in the grouped phaseToken member: `socket.ts:153` `type PhaseIntent = Extract<Intent, { type: "deal" | "revealAll" | "dealAgain" | "newGame" }>`. **No `types.ts` change.**

### The exact gap this story closes
- `Lobby.svelte:76` — `<Button onclick={() => {}} disabled={!canDeal}>{DEAL}</Button>` — the Deal button fires NOTHING. Its comment says "the deal INTENT (round start) is Epic 2" but Epic 2 built only the server handler; **no client send for `deal` was ever added.**
- There is NO client send for `revealAll` anywhere (grep confirms only `sendDealAgain`/`sendNewGame` exist in `table-store.svelte.ts`). The harness works around this with an aux raw-WS Host (`client/e2e/helpers/table.ts:3-12`).
- Net-new this story: `buildDealIntent` + `buildRevealAllIntent` (socket.ts), `sendDeal` + `sendRevealAll` (table-store), the shared `ConductorBar`, the ⚙ sheet shell.

### The router constraint — HostControls is an OVERLAY, not a Surface (do not regress)
- `route-from-state.ts:11-13` and `:15-23`: the `Surface` union deliberately OMITS HostControls — "it is an OVERLAY invoked on top of Lobby/Waiting/RoundResult (never from YourTurn)." `App.svelte:32-54` renders exactly one routed surface. **The conductor bar mounts as an overlay layer in `App.svelte`, NOT via `routeFromState`.** Do not add a Surface; do not change the pure `state → Surface` function.

### Per-phase primary mapping (the bar's whole logic)
| `state.phase` | Surface the Host is on | Conductor primary | Send seam |
|---|---|---|---|
| `lobby` | Lobby | **Deal** (disabled until ≥2 Players) | `sendDeal` (NEW) |
| `turns` | Your Turn (active) / Waiting | none (turn-scoped; bar absent on Your Turn) | — |
| `allActed` | Waiting | **Showdown** | `sendRevealAll` (NEW) |
| `showdown` | Showdown | transient; resolves server-side to roundResult/gameOver | — |
| `roundResult` | Showdown (revealed beat, `route-from-state.ts:53`) | **Re-deal** | `sendDealAgain` (exists) |
| `gameOver` | Winner / Eliminated | "one more?" already on those surfaces (Story 3.6) — NOT this bar | `sendNewGame` (exists) |
- The Showdown primary at `allActed` appears on the **Waiting** surface — that is where a Host sits when nobody's turn is active and the reveal is pending. Waiting has no Host action today (`Waiting.svelte`), so the bar adds it.
- `allActed` is a REAL phase value, not a derived predicate — gate the Showdown primary on `state.phase === "allActed"` (architecture.md:332-333/578). The client must NOT recompute turn/elim/win logic; it reads `state.phase` / `state.you.isHost` / `state.phaseToken` only.

### GATE-1 (egress ban) — the non-negotiable client rule
- Surfaces/components NEVER call `socket.send`. All sends go through the `table-store.svelte.ts` seams (`sendDeal`, `sendRevealAll`, `sendDealAgain`), which call the single allowed `sendIntent` wrapper (`socket.ts`). The existing seams are commented "GATE-1-exempt sendIntent (NEVER socket.send from a surface)" (`table-store.svelte.ts:102/113/142`). ESLint `no-restricted-properties` enforces this path-scoped (architecture.md:545/642). The ConductorBar calls store seams only.

### Silent stale handling (do not add error UI)
- A stale/double-tapped phase intent is rejected by the server with `stale-phase` and the client `handleSocketMessage` DROPS error envelopes silently (`table-store.svelte.ts:59-68`, AC-2.2.3). `Button.svelte` also debounces (one tap = one action). **Do NOT add a toast/error surface for a double-tapped Deal/Showdown/Re-deal.**

### Reuse — don't reinvent
- `Button.svelte` (`components/Button.svelte`): primary/secondary variants, debounce, ≥48dp (primary ≥72px), reduce-motion-safe press-scale, real `<button>` with `ariaLabel`. Use it for the primary; use a real `<button>` for the ⚙.
- `MIN_PLAYERS` / `MIN_LIVES` / `MAX_LIVES` from `@trash/shared` (already imported in `Lobby.svelte:12`).
- Design tokens for the sheet: `--color-surface-container-high` (#322346) per UX-DR13 (DESIGN.md:14/186). Inert borders use `outline` (#9d8ba0 — passes 3:1), NOT `outline-variant` (#514255 — fails) per DESIGN.md:151/181.

### Files to TOUCH
- **NEW:** `client/src/components/ConductorBar.svelte`, `client/src/components/ConductorBar.svelte.test.ts`, `client/src/surfaces/HostControls.svelte.test.ts`.
- **UPDATE:** `client/src/socket.ts` (+2 builders), `client/src/lib/table-store.svelte.ts` (+2 send seams), `client/src/surfaces/HostControls.svelte` (stub → sheet shell), `client/src/App.svelte` (mount overlay), `client/src/surfaces/Lobby.svelte` (Deal affordance via bar; Lives stepper STAYS), `client/src/surfaces/Showdown.svelte` (remove inline Re-deal block, keep non-Host waiting line), `client/src/lib/copy.ts` (+`SHOWDOWN`, +`HOST_CONTROLS`), and the relevant existing tests.
- **DO NOT TOUCH:** `shared/src/types.ts`, anything under `server/`, `route-from-state.ts`'s Surface union / function body.

### Scope OUT (explicitly NOT this story)
- The three FR-14 controls — Lives stepper inside the sheet, remove Player, reassign Host — are **Story 4.2** (the sheet is an empty shell here).
- The open product decision **M1 (`hostSetLives` clamp-vs-top-up)** is due at the **Story 4.2** create-story, NOT here.
- AR-15 (disconnected-but-alive active Player) is an accepted MVP non-goal owned by **Story 4.2**.
- No produced FX, no animations beyond the existing reduce-motion-safe press-scale and a simple sheet open/close.

### Previous-story intelligence (Epic 3 patterns that apply)
- The "shared conductor-bar COMPONENT is Story 4.1" was foreshadowed twice: `Showdown.svelte:27-29` ("This is an INLINE Host-only block mirroring the Lobby conductor's `{#if isHost}`; the shared conductor-bar COMPONENT is Story 4.1") and the Story 3.4 notes. This story collects those inline blocks.
- Story 3.6 established the 4th `requirePhaseConductor` caller (server) and the dual-surface Host action pattern — Host actions are placed by PLACEMENT, not by re-routing. The bar follows the same "gate on `isHost && phase`, don't touch the router" discipline.
- RED-first has held across 3.1–3.6. Keep it: write the ConductorBar/HostControls tests against the absent component/stub and confirm they fail before implementing.
- `@cloudflare/vitest-pool-workers` cold-run flakiness is a known non-blocking pattern — but this is a CLIENT-only story (jsdom), so it should not appear; if a server `.do.test.ts` flakes on a full-suite run, re-run before treating as a regression (no server file is touched here).

### Project Structure Notes
- `components/` is the home for reused widgets (Button/Card/LivesPips already there) — `ConductorBar` belongs there, not `surfaces/`. `HostControls.svelte` is already (correctly) under `surfaces/` as the overlay; keep it there.
- UI-only local `$state` (the sheet `open` boolean) is permitted — the "no client-held screen" rule (`table-store.svelte.ts:7-11`) is about the ROUTED surface deriving from server state, not about transient overlay open/close.

### References
- [Source: epics.md#Story-4.1 lines 813-835 — AC text, UX-DR13/14, Eyes-Up/NFR-9 clause]
- [Source: epics.md lines 46-47 — NFR-9 (eyes-up), NFR-10 (≥48dp, AA, focus order, color-independence, reduce-motion)]
- [Source: architecture.md lines 574-590 — Phase literals + the deal/revealAll/dealAgain/newGame transition map; 332-333/578 allActed is a real phase; 122-124/598 the grouped phaseToken Intent]
- [Source: architecture.md lines 725-731 + route-from-state.ts:11-23 — HostControls is a NON-routed overlay]
- [Source: architecture.md lines 545/642 — GATE-1 no-restricted-properties egress ban; 553/686/744 GATE-2 rules purity]
- [Source: DESIGN.md lines 14/151/181/184-186/207-212 — surface-container-high token, contrast caveats, Host Conductor Bar & Controls, Don'ts]
- [Source: EXPERIENCE.md lines 37/100/108-115/149-151/166 — bar in thumb zone, no timers/auto-advance, a11y floor, Flow 4 overlay, the Round-Result/Showdown-may-merge open item]
- [Source: client/src/surfaces/Lobby.svelte:58-78 (existing inline bar + dead Deal), Showdown.svelte:101-113 (inline Re-deal), table-store.svelte.ts:148-165 (send-seam pattern), socket.ts:148-172 (builder pattern), components/Button.svelte (primary widget), client/e2e/helpers/table.ts:3-12 (why the harness needs the aux-host trick)]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (1M context) — `us.anthropic.claude-opus-4-8[1m]`

### Debug Log References

- RED-first confirmed: `ConductorBar.svelte.test.ts` failed to resolve `./ConductorBar.svelte` before the component existed; `HostControls.svelte.test.ts` failed against the 1.9a stub (no dialog/close/Escape). Both GREEN (13/13) after implementation.
- One implementation snag fixed: a Svelte 5 rune collision — a prop literally named `state` is parsed as `$`-store auto-subscription when the component ALSO uses the `$state` rune (error `store_invalid_shape`). Resolved by aliasing the prop internally (`const { state: tableState } = $props()`) in both `ConductorBar.svelte` and `HostControls.svelte`; the external prop name stays `state` (App passes `state={state!}`). Element refs kept as `$state(...)` to avoid the `non_reactive_update` warning.
- Showdown test cleanup: removed the now-unused `vi.mock`/`sendDealAgain` and the `fireEvent`/`vi` imports after the Host Re-deal action moved to the bar (svelte-check flagged the unused imports; fixed → 0 errors / 0 warnings).

### Completion Notes List

- **CLIENT-ONLY, no contract/server change (AC-4.1.9).** Server `handleDeal`/`handleReveal` + dispatch already existed; `deal`/`revealAll` were already named in the grouped `{phaseToken}` Intent member. No `shared/src/types.ts`, no `server/**`, no `route-from-state.ts` Surface-union change.
- **Closed the real gap:** added `buildDealIntent`/`buildRevealAllIntent` (`socket.ts`) + `sendDeal`/`sendRevealAll` (`table-store.svelte.ts`) — the game is now click-drivable end-to-end (Lobby's dead no-op Deal and the absent `revealAll` send are both resolved).
- **Shared `ConductorBar.svelte`** (Host-only, bottom-anchored, fixed overlay): phase→single primary — `lobby`→Deal (disabled <2 Players)→`sendDeal`; `allActed`→Showdown→`sendRevealAll`; `roundResult`→Re-deal→`sendDealAgain`; + a ≥48dp ⚙ controls button. Reads `phase`/`isHost`/`phaseToken` only (no recomputation). Mounted as an OVERLAY in `App.svelte`, gated to non-turn surfaces (lobby/waiting/showdown/roundResult), NEVER on yourTurn/home; HostControls stays a NON-routed overlay (router untouched).
- **`HostControls.svelte`** stub → one-level modal sheet shell on `surface-container-high`: opens from ⚙, closes via ✕ / scrim / Escape, focus moves into the sheet on open and returns to the ⚙ trigger on close, never stacks two deep (single `controlsOpen` boolean owned by the bar). Body is a placeholder — the three FR-14 controls are Story 4.2.
- **Refactor:** Lobby dropped its dead inline Deal (Lives stepper STAYS inline — Decision: Lives moves into the ⚙ sheet in 4.2, not here); Showdown dropped its inline Host Re-deal block but KEPT the non-Host `WAITING_TO_REDEAL` line (the bar is Host-only) and the `gameOver`-absence. Added bottom padding to Lobby's surface so the fixed bar never covers content.
- **Eyes-Up (G1/NFR-9):** the bar holds exactly {one primary, ⚙}; the sheet holds only the heading + placeholder — no timer/log/dashboard/ambient (pinned by tests).
- **Copy:** `SHOWDOWN = "Show the cards"` (new warm reveal-primary label — no Showdown button string existed) + `HOST_CONTROLS = "Host controls"` (⚙ accessible name + sheet heading). `DEAL`/`RE_DEAL`/`WAITING_TO_REDEAL` reused verbatim.
- **Gates ALL GREEN:** client tests 118→131 (+13: 8 ConductorBar + 5 HostControls; Showdown/Lobby refactors net within existing files); server 192 unchanged; lint (GATE-1 egress + GATE-2 purity) clean; typecheck `svelte-check` 0 / `tsc` 0; build (PWA) OK.
- **Follow-up for the next author:** with a real Deal/Showdown button, a future e2e harness no longer NEEDS the aux-host trick to reach a dealt state. And the owed Epic-3 live playtest (AC-3.3.7 / AC-3.5.7 + the Epic-2 carry checks) is now click-runnable — run it after this merges.

### File List

- `client/src/components/ConductorBar.svelte` (NEW)
- `client/src/components/ConductorBar.svelte.test.ts` (NEW)
- `client/src/surfaces/HostControls.svelte.test.ts` (NEW)
- `client/src/socket.ts` (+`buildDealIntent`, +`buildRevealAllIntent`)
- `client/src/lib/table-store.svelte.ts` (+`sendDeal`, +`sendRevealAll`)
- `client/src/surfaces/HostControls.svelte` (stub → one-level modal sheet shell)
- `client/src/App.svelte` (mount ConductorBar as overlay)
- `client/src/surfaces/Lobby.svelte` (remove dead inline Deal; keep Lives stepper; bottom padding for the bar)
- `client/src/surfaces/Showdown.svelte` (remove inline Host Re-deal block; keep non-Host waiting line)
- `client/src/lib/copy.ts` (+`SHOWDOWN`, +`HOST_CONTROLS`)
- `client/src/surfaces/Lobby.svelte.test.ts` (Deal moved to bar — assertions updated)
- `client/src/surfaces/Showdown.svelte.test.ts` (Host Re-deal moved to bar — assertions updated)

## Change Log

- 2026-06-22 — Story 4.1 implemented: shared Host conductor bar (Deal / Showdown / Re-deal primaries) + ⚙ Host Controls sheet shell, mounted as an overlay; added the missing `deal`/`revealAll` client send seams; refactored Lobby + Showdown inline conductor blocks to the shared bar. Client-only; gates green (client 131 / server 192). Status → review.
- 2026-06-22 — Playtest fix (AR-5): an eliminated Host knocked out mid-game routes to the Eliminated spectator surface but REMAINS the Host and must keep conducting (architecture.md:335-338). The conductor bar was initially excluded from `eliminated`, stranding a 4-player game when the Host lost at `roundResult` ("You're out" with no Re-deal). Fix: `App.svelte` now mounts the bar on `eliminated` too — the bar is Host-only so an eliminated NON-Host spectator still sees nothing, and at `gameOver` the bar shows no primary while the Eliminated surface's inline "one more?" (Story 3.6) handles that case (no double action). New ConductorBar test pins it (eliminated Host at roundResult still gets Re-deal). Client tests 131→132; gates green.
