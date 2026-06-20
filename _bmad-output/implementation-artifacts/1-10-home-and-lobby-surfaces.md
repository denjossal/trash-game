---
baseline_commit: d40cf92b29b2b2bdc8cd31bc063318115b2f8be3
---

# Story 1.10: Home & Lobby surfaces

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Host or joining Player,
I want warm, sparse Home and Lobby screens,
so that I can start or join a table and watch the room fill, all within the activation window.

## Acceptance Criteria

**AC-1.10.1 — Home surface (built on the Story 1.9 foundation).** *(UX-DR3; EXPERIENCE.md State Patterns "Cold open"/"Bad/expired code".)*
**Given** the Home surface
**When** it renders
**Then** it shows two big buttons — **"Start a table"** / **"Join a table"** (the `Button` primitive, primary variant); choosing Join reveals a **4 letter-slot Room Code field** (auto-uppercase, auto-advance between slots, paste-friendly) **plus a display-name entry**; a bad/expired code shows a **warm inline error** under the field (the `BAD_CODE` copy), the field stays and is ready to retry, and the rest of the table is unaffected.

**AC-1.10.2 — Lobby surface.** *(UX-DR4, UX-DR15; EXPERIENCE.md State Patterns "Empty lobby"/"Lobby filling"; DESIGN.md Room Code Display / Lives Indicator / Roster list / Conductor bar.)*
**Given** the Lobby surface
**When** it renders
**Then** the **Room Code displays large and letter-spaced (Display-LG, the single most prominent element)**; the **roster updates live** with **Lives pips** (filled = remaining, `--color-secondary-container` neon-mint; hollow = spent, `--color-outline`; a **numeral paired** for ≥4 Lives); the **Host sees a Lives stepper** (1–5, default 3) and a **conductor bar with Deal disabled until ≥2 Players**; a **non-Host does not see the Lives control or the conductor bar**.

**AC-1.10.3 — Voice fidelity (first surface application of the cross-epic voice thread).** *(UX-DR16, decision #5.)*
**Given** all Home/Lobby copy
**When** strings render
**Then** they match the EXPERIENCE.md voice table **verbatim**, sourced from `client/src/lib/copy.ts` (warm, playful, inclusive; **never** high-stakes/underground/mean); **no string literal for a voice-table line is hard-coded in a surface** — every visible game string comes from `copy.ts`.

**AC-1.10.4 — Live data pipe (the wiring this story owns).** *(architecture.md `main.ts` "holds last tableState (read-only store)"; Client boundary "renders surface = f(state)"; socket.ts Stories 1.5–1.8 deferred the receive loop to 1.10.)*
**Given** a successful create or join
**When** the server pushes `tableState` events on the kept-open socket
**Then** a **read-only client store** (owned by `main.ts`) is updated from each `tableState` payload and `App.svelte` re-renders the routed surface as a pure function of that state — so the cold Home → Lobby transition, live roster updates, and the Host's Lives changes all flow from server state, never from client-held screen state.

**AC-1.10.5 — Gates stay green.**
**Given** the implementation
**When** the gates run
**Then** `npm run typecheck` is 0/0; `npm run lint` is clean (GATE-1 `.send`/`.broadcast` ban + GATE-2 `rules/**` purity both untouched — no new `.send(` outside `server/src/push-state.ts`); `npm test` passes (existing server + client suites stay green, plus the new tests below); `npm run build` still emits the warm PWA manifest + icons.

## Tasks / Subtasks

- [x] **Task 1 — Read-only tableState store + live receive loop (AC: #4)**
  - [x] Created `client/src/lib/table-store.svelte.ts` — a module-level Svelte 5 `$state<ProjectedTableState|null>` holder. Architecture says the store lives at the client entry; a `.svelte.ts` rune module imported by `main.ts`/`App.svelte` is the idiomatic Svelte-5 form and keeps `main.ts` thin (documented). Consumers get `readTableState()` (a getter) — read-only; the ONLY writer is `handleSocketMessage`.
  - [x] Live receive loop: `adoptSocket(socket, first)` seeds the store with the first projection and attaches a persistent `message` listener that parses `{type:"tableState"}` envelopes into the store; `error`/non-JSON/unknown are ignored (won't clobber). No auto-reconnect added (socket.ts `maxRetries:0` untouched). Made `createRoomWithRetry`/`joinRoomAndListen` ADDITIVELY return their first `state` (otherwise consumed-and-lost) so the Lobby renders immediately.
  - [x] `App.svelte` `state` now `$derived(readTableState())` — the routing chain + `route-from-state.ts` are byte-for-byte unchanged (one-line data-source swap, exactly the 1.9a seam).
  - [x] RED→GREEN: `table-store.svelte.test.ts` (client-dom; the store is a rune module) — latest-wins, error-doesn't-clobber, noise-ignored, unknown-type-ignored. 6/6 green; RED first confirmed (module-absent).

- [x] **Task 2 — Home surface: Start / Join + Room Code field + name entry (AC: #1, #3, #4)**
  - [x] Fleshed out `Home.svelte`. Two primary `Button`s (`START_TABLE`/`JOIN_TABLE` from copy.ts); a disclosure (`choose`→`start`/`join`) that is local UI state, NOT navigation (router still owns the surface). Title up top, actions anchored low (thumb-zone via `justify-content: space-between`).
  - [x] **Start:** name entry → `startTable(name)` (session fn in table-store.svelte, which calls `createRoomWithRetry`). Arriving `lobby` tableState routes to Lobby automatically. (Session-token persistence stays in the reconnect-flow seam; not blocked on here.)
  - [x] **Join:** 4-slot Room Code field — auto-uppercase, auto-advance, paste-friendly (multi-char paste spreads across slots), restricted to `ROOM_CODE_ALPHABET` (imported from `@trash/shared`), backspace-steps-back — plus a name entry. Submit → `joinTable(code, name)`.
  - [x] **Bad/expired code:** `joinTable` rejects (typed reason); caught and rendered as the warm `BAD_CODE` inline `role="alert"` under the field — ALL reasons map to the one warm message (raw reason never leaked); field persists, ready to retry.
  - [x] Reuses `Button` (debounce/≥48dp/72px). Inputs: 3px `--color-outline` border, neon caret, ≥48dp, neon focus stroke — DESIGN.md Inputs via tokens.
  - [x] RED→GREEN: `Home.svelte.test.ts` (5/5) — Start/Join render from copy, Join reveals 4 slots + name, uppercase+alphabet restriction, bad-code error+persistence, no rejected framing. RED first confirmed (stub had no buttons).

- [x] **Task 3 — Lobby surface: Room Code display + live roster + Lives pips (AC: #2, #3, #4)**
  - [x] Rewrote `Lobby.svelte`. Room Code in Display-LG, each letter in its own slot on `--color-surface-container-high` (the most prominent element); paired with the `roomCode(code)` caption from copy.ts.
  - [x] Live roster from `state.players` (sorted by `seatIndex`); rows ≥80px, 24px padding, 16px gaps (DESIGN.md List Items).
  - [x] Extracted `client/src/components/LivesPips.svelte` (reusable — DESIGN.md lists Lives on Waiting/Showdown/RoundResult too; forward-useful for Epic 3): `lives` filled mint discs + `(startingLives − lives)` hollow rings in `--color-outline` (NOT outline-variant); shape-distinguished; numeral paired for ≥4. Its own behavior is covered via the Lobby tests (pip counts + numeral threshold).
  - [x] Non-Host sees `waitingForHost(hostName)` (host name resolved from `state.players` via `state.hostId`).

- [x] **Task 4 — Host-only Lives stepper + conductor bar (AC: #2, #4, #5)**
  - [x] Host gate: stepper + conductor bar render only when `state.you.isHost`; a non-Host sees neither (test-verified).
  - [x] Lives stepper: −/value/+ control, range `MIN_LIVES`..`MAX_LIVES` (imported from `@trash/shared`); the displayed value follows `state.startingLives` (server echo, not optimistic); −/+ disabled at the 1/5 bounds. On change → `sendHostSetLives(clamped, state.phaseToken)` (session fn → `sendIntent` in socket.ts; GATE-1 safe — never socket.send from the surface). Server clamps defensively.
  - [x] Conductor bar: bottom-anchored (`margin-top:auto`, thumb-zone) holding the Deal primary `Button`, disabled until `players.length >= MIN_PLAYERS` (≥2). Deal's `onclick` is a no-op placeholder — the `deal` round-start intent is Epic 2 and the ⚙ controls overlay is Epic 4; this ships only the bar + the disabled-until-≥2 affordance.
  - [x] RED→GREEN: `Lobby.svelte.test.ts` (9/9) — code letters, roster rows, pip filled/hollow counts, numeral ≥4 vs none <4, non-Host hides both controls, Host shows both, Deal disabled@1/enabled@2, stepper sends `hostSetLives(4,0)`, stepper clamps 1..5.

- [x] **Task 5 — Tests (AC: #1, #2, #3, #4, #5)**
  - [x] All component tests in `client-dom` as `*.svelte.test.ts` (the store too — it's a `.svelte.ts` rune module). `@testing-library/svelte` `render`; session module (`table-store.svelte`) mocked via `vi.mock` so surfaces drive without a real socket.
  - [x] Home (5), Lobby (9), store (6) — see per-task entries. Coverage: Start/Join, code-field reveal + uppercase/alphabet, bad-code error+persistence, roster, pip filled/hollow + numeral threshold, host-gating, Deal disable@1/enable@2, stepper send + clamp, store latest-wins/error-no-clobber/noise-ignored.
  - [x] Voice fidelity: Home asserts no "high-stakes"/"underground" in rendered output and sources all strings from `copy.ts` (imports); Lobby/copy strings come from `copy.ts` exclusively.
  - [x] RED→GREEN honored for each (module/behavior absent first).

- [x] **Task 6 — Gate sweep (AC: #5)** — `npm run typecheck` 0/0; `npm run lint` clean (GATE-1 `.send`/`.broadcast` + GATE-2 `rules/**` purity untouched — surfaces send only via `sendIntent` in the exempt `socket.ts`); `npm test` server 27/27 + client 38/38 (was 18 → +20: store 6, Home 5, Lobby 9); `npm run build` succeeds, manifest carries warm "friends and family" copy (0 high-stakes/underground), both icons emitted, precache 11 entries. (Fixed one svelte-check error mid-sweep: `inputmode="latin"` → `"text"`.)

## Dev Notes

### What this story is (and is NOT)

- **IS:** the first two *real* product surfaces (Home, Lobby) + the **live data pipe** that makes every surface reactive (the read-only `tableState` store in `main.ts` + the receive loop on the kept-open socket). All the server authority + client *wiring helpers* already exist (Stories 1.5–1.8); this story mounts them into UI.
- **IS NOT:** the `deal` round-start logic (Epic 2), the Host Controls **overlay** contents (Epic 4 — this story ships only the conductor-bar shell + the disabled-until-≥2 Deal button), audio/speech ("voice" here = microcopy), reconnection flow (AR-12 — reconnect stays disabled), or any of the other 6 surface stubs.

### Reuse — do NOT reinvent (anti-wheel-reinvention)

Everything below already exists and MUST be reused, not re-built:

| Need | Use | Location |
|---|---|---|
| Create a table (with claim-retry) | `createRoomWithRetry(name)` | `client/src/socket.ts:188` |
| Join a table (typed failures) | `joinRoomAndListen(code, name)` → rejects with `{reason}` | `client/src/socket.ts:281` |
| Set Lives on the live socket | `sendIntent(socket, buildHostSetLivesIntent(lives, phaseToken))` | `client/src/socket.ts:112,127` |
| Persist session token | `persistSessionToken(token)` | `client/src/socket.ts:43` |
| Buttons (debounce/≥48dp/72px/press-scale/reduce-motion) | `Button.svelte` (`variant="primary"|"secondary"`, `disabled`, `onclick`, `children`, `ariaLabel`) | `client/src/components/Button.svelte` |
| All microcopy | `START_TABLE`, `JOIN_TABLE`, `roomCode(code)`, `waitingForHost(host)`, `BAD_CODE` | `client/src/lib/copy.ts` |
| Design tokens | CSS custom properties (colors/type/space/radii/strokes) | `client/src/tokens.css` |
| Config constants | `MIN_PLAYERS`(2), `MIN_LIVES`(1), `MAX_LIVES`(5), `DEFAULT_LIVES`(3), `ROOM_CODE_ALPHABET`, `ROOM_CODE_LEN` | `@trash/shared` (`shared/src/config.ts`) |
| Router (DO NOT TOUCH) | `routeFromState(state)` → `Surface`; App.svelte renders f(state) | `client/src/route-from-state.ts`, `App.svelte` |

### Files being modified — current state & what to preserve

- **`client/src/main.ts`** (currently mounts App + imports tokens.css; comment explicitly says the store + receive loop are *this* story). ADD the read-only store + receive loop; keep `mount(App, …)` and the `import "./tokens.css"` ordering. [main.ts:1-13.]
- **`client/src/App.svelte`** — line 27 `const state = $state(null)` is the placeholder the comment (line 26) says 1.10 replaces with the live store. **Swap only that** — the `{#if surface === …}` chain and `routeFromState` import stay byte-for-byte. The router was deliberately built so this is a one-line data-source swap. [App.svelte:26-29.]
- **`client/src/surfaces/Home.svelte`** — currently a connecting stub consuming `APP_NAME`/`CONNECTING`. The cold-open "Connecting…" is reached only when `state === null` (routeFromState returns `home`). Decide: Home shows Start/Join when not yet connecting, and the connecting/cold message remains valid copy. (Home is the surface for `state === null` — there is no separate "connecting" surface. Render Start/Join as the cold-open content; `CONNECTING` may remain as a transient state if you model an in-flight create/join.)
- **`client/src/surfaces/Lobby.svelte`** — currently `code` + count stub; flesh out fully.
- **`client/src/lib/copy.ts`** — already has every string this story needs (`START_TABLE`/`JOIN_TABLE`/`roomCode`/`waitingForHost`/`BAD_CODE`). Do NOT add new voice strings; if a needed string is genuinely missing, add it to `copy.ts` (single source of truth), never inline in a surface.

### Critical correctness / privacy constraints

- **GATE-1 (`.send`/`.broadcast` ban) — CONFIRMED SCOPE:** ESLint bans `.send`/`.broadcast` repo-wide; the ONLY `.send` exemptions are `server/src/push-state.ts`, `client/src/socket.ts`, and `server/src/**/*.do.test.ts` (verified in `eslint.config.js`). A **`.svelte` surface is NOT exempt** — calling `socket.send(...)` from `Home.svelte`/`Lobby.svelte` **fails lint**. Therefore ALL outbound MUST go through `sendIntent(socket, intent)` (which lives in the exempt `client/src/socket.ts`); never call `socket.send(...)` from a surface, and never re-implement the JSON.stringify envelope. The Task-1 receive loop's `socket.addEventListener("message", …)` is fine (that's `.addEventListener`, not `.send`). [Source: eslint.config.js lines 1-28 (GATE-1 + the socket.ts relaxation); socket.ts:127.]
- **No client-held screen state:** the surface is `f(state)` only. Do NOT introduce a local "current screen" variable that the router would compete with (the whole point of route-from-state). Local UI state that is NOT navigation is fine (e.g. "Join panel expanded", the in-progress code-field input, an in-flight create/join spinner) — but the *which surface* decision stays with `routeFromState`.
- **Lives display is server-authoritative:** the stepper reflects `state.startingLives` (echoed from the server after `hostSetLives`), not an optimistic local number. The server clamps 1–5; trust the echo.
- **Privacy (SM-6):** Home/Lobby render no card values (none exist pre-Deal), so the standing SM-6 projection gate is not at risk here — but keep the habit: render only what the projection gives.

### Svelte 5 / test harness conventions (from 1.9a/1.9b)

- **Runes:** `$props()`, `$state()`, `$derived()` (see `Button.svelte`, `App.svelte`, `Lobby.svelte` stub for the house style). `$props()` destructure with types, e.g. `const { state }: { state: ProjectedTableState } = $props();`.
- **Two vitest projects:** `client-node` (jsdom-free, pure `*.test.ts`) and `client-dom` (jsdom + `svelte()` + `svelteTesting()`, `*.svelte.test.ts`). Component tests MUST be `*.svelte.test.ts` or they land in the wrong project. [1.9b harness note; `client/vitest.config.ts`.]
- **Passing `Button` children in a test:** `Button`'s `children` is a Svelte `Snippet` — a bare `() => "Deal"` is rejected by svelte-check; use `createRawSnippet` (1.9b typecheck learning).
- **jsdom mount:** the `svelteTesting()` plugin is what makes `mount` work under jsdom (without it: `lifecycle_function_unavailable`). It's already wired in `client-dom`.
- **Importable constants live in plain `.ts`:** `tsc -b` can't see a `<script module>` named export through the ambient `*.svelte` declaration (only the default export). If a surface needs a constant shared with a test, put it in a `client/src/lib/*.ts` (as `DEBOUNCE_MS` was relocated to `interaction.ts`).

### Previous-story intelligence (Story 1.9b — immediate predecessor)

- 1.9b built `Button`, `copy.ts`, `interaction.ts`, the PWA manifest, and the `client-dom` test project — all the primitives this story composes. It explicitly **did not** touch `route-from-state.ts`/`App.svelte`/`main.ts`/`socket.ts` and **did not** wire a live receive loop — those are 1.10's job. [1-9b File List "Scope honored".]
- 1.9b's gate baseline to maintain/extend: typecheck 0/0; server 27/27; client 18/18 (14 router + 4 Button); lint clean; build emits warm manifest + 2 icons + font precache. Your new tests add to the client count.
- Copy was authored once in `copy.ts` with each string annotated by its consuming story; the Home/Lobby strings (`START_TABLE`/`JOIN_TABLE`/`roomCode`/`waitingForHost`/`BAD_CODE`) are already there waiting for this surface — consuming them retires those "not yet rendered" annotations.

### Git intelligence (recent work patterns)

- `d40cf92` Story 1.9b (PWA shell, voice, Button) — the primitives this story uses.
- `2f07693` Story 1.9a (tokens + router) — `tokens.css`, `route-from-state.ts`, `App.svelte` skeleton.
- `82c13b3` Story 1.8 (host sets Lives) — server authority + `buildHostSetLivesIntent`/`sendIntent` client seam.
- Pattern: each story keeps tests RED-first, runs the full gate sweep, records counts in the Dev Agent Record, and ends in `review`. Match it.

### Project Structure Notes

- New file(s) expected: a Lives-pips snippet/sub-component (either inline in `Lobby.svelte` or a small `client/src/components/LivesPips.svelte` if reused — DESIGN.md lists Lives Indicator on Waiting/Showdown/RoundResult too, so a shared component is defensible and forward-useful for Epic 3; the "first reused widget pulls components/ into existence" rule already created `components/`). Decide based on reuse; if extracting, add a `*.svelte.test.ts`.
- The read-only store: architecture says it lives in `main.ts`. A tiny `client/src/lib/table-store.ts` holding the `$state` + a typed read accessor, imported by both `main.ts` (writer) and `App.svelte` (reader), is acceptable and keeps `main.ts` thin — but the *ownership* (only the receive loop writes) is the invariant, wherever the code sits. Document the choice.
- Inputs (code field, name): follow DESIGN.md Inputs (3px border, 20px padding, oversized caret) via tokens; ensure ≥48dp targets.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.10 (lines 438-456)] — the three ACs (Home, Lobby, voice).
- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.8 (lines 390-404)] — Host-only Lives control; `not-host` refusal; control not offered to non-Hosts.
- [Source: ux-designs/.../EXPERIENCE.md] — IA surface table (line 23+), Voice table (lines 43-56), State Patterns Cold open/Empty lobby/Lobby filling/Bad code (lines 79-92), a11y thumb-zone (line 115), Component Patterns Room code field / Lives indicator / Roster / Conductor bar (lines 71-73).
- [Source: ux-designs/.../DESIGN.md] — Room Code Display (line 188), Lives Indicator (lines 179-182, the `--color-outline` vs `outline-variant` contrast rule), Host Conductor Bar & Controls (lines 184-186), Buttons (lines 163-165), Inputs (line 197), List Items (line 201), Roster (line 69).
- [Source: _bmad-output/planning-artifacts/architecture.md (lines 716, 721, 749-750)] — `main.ts` read-only store; App router; Client boundary "renders surface = f(state)".
- [Source: client/src/socket.ts] — `createRoomWithRetry` (188), `joinRoomAndListen` (281), `buildHostSetLivesIntent` (112), `sendIntent` (127), `persistSessionToken` (43); the NOTE (lines 122-125) that helpers detach their listeners so the surface owns liveness from there.
- [Source: client/src/route-from-state.ts + App.svelte] — DO NOT modify routing; swap only the `state` source (App.svelte:26-27).
- [Source: shared/src/types.ts] — `ProjectedTableState` (`you.isHost`, `players[]`, `startingLives`, `phaseToken`, `code`), `Intent.hostSetLives`.
- [Source: shared/src/config.ts] — `MIN_PLAYERS`, `MIN_LIVES`, `MAX_LIVES`, `DEFAULT_LIVES`, `ROOM_CODE_ALPHABET`, `ROOM_CODE_LEN`.
- [Source: client/src/lib/copy.ts] — all required strings already present.

### Review Findings

_Adversarial code review 2026-06-19 (Blind Hunter + Edge Case Hunter + Acceptance Auditor). Auditor independently re-ran all gates and confirmed AC-1.10.1–.5 satisfied, `route-from-state.ts` byte-for-byte unchanged, GATE-1 clean — the story is fundamentally sound. Findings below are hardening/UX/product calls._

**Decision needed:** _(all resolved 2026-06-19)_

- [x] [Review][Decision→Patch] No `name` max-length bound — RESOLVED: cap at 20 chars (`maxlength={20}` on the name input). See Patch below. [edge#4]
- [x] [Review][Decision→Patch] All join failures collapse to "check the letters" — RESOLVED: add a distinct warm copy.ts string for room-full / already-started, mapped from the typed reason (raw reason still never leaked). See Patch below. [edge#8]
- [x] [Review][Decision→Defer] Lives stepper has no optimistic feedback; rapid taps unreliable — RESOLVED: defer, keep echo-only. Reason: server-authoritative display is the spec intent; rapid-tap is an edge case best revisited alongside the reconnect/feedback polish. See Deferred below. [blind#6 + edge#9]

**Patch:** _(all applied + gate-verified 2026-06-19 — typecheck 0/0, lint clean, server 27/27 + client 42/42, build OK)_

- [x] [Review][Patch] Paste into a code slot does not reset the input's raw value and silently over-/under-fills [client/src/surfaces/Home.svelte:40-56] — FIXED: paste branch now sets `el.value = next[i]` to re-sync the pasted slot, tracks `used` chars and focuses the last actually-filled slot. New test: paste spreads "WXYZ" across all four slots.
- [x] [Review][Patch] LivesPips numeral renders raw `lives` while pips clamp to `startingLives` [client/src/components/LivesPips.svelte] — FIXED: numeral + aria-label now read the clamped `filled`, so they can never contradict the pip count.
- [x] [Review][Patch] Empty `hostName` yields a double-space, nameless waiting hint [client/src/surfaces/Lobby.svelte:24] — FIXED: `hostName` falls back to "the host" (`|| "the host"`). New test pins the fallback sentence.
- [x] [Review][Patch] "Deal" button label is an inline literal, not from copy.ts [client/src/surfaces/Lobby.svelte] — FIXED: added `DEAL` to copy.ts; Lobby renders `{DEAL}`.
- [x] [Review][Patch] Cap display-name at 20 chars [client/src/surfaces/Home.svelte] — FIXED (Decision #2): `MAX_NAME_LEN = 20` in `lib/interaction.ts`, `maxlength={MAX_NAME_LEN}` on the name input. New test asserts the cap.
- [x] [Review][Patch] Distinct warm copy for room-full / already-started joins [client/src/surfaces/Home.svelte + client/src/lib/copy.ts] — FIXED (Decision #3): added `TABLE_BUSY` to copy.ts; `doJoin` maps `room-full`/`phase-illegal` → `TABLE_BUSY`, else → `BAD_CODE` (raw reason never leaked; `error` is now a message string). New test asserts TABLE_BUSY on room-full.

**Deferred (pre-existing / latent — out of this story's active scope):**

- [x] [Review][Defer] `adoptSocket` listener leak / double-adopt double-subscribe [client/src/lib/table-store.svelte.ts:60-64] — deferred: only triggers on re-adopt, impossible this story (reconnect/AR-12 disabled, single create/join per session); surfaces with the reconnect flow.
- [x] [Review][Defer] Malformed `tableState` payload would crash the live router [client/src/lib/table-store.svelte.ts:51-53] — deferred: store deliberately chose tolerant parsing; a partial-but-valid-JSON `tableState` payload bypasses the null guard and `routeFromState` throws on `state.phase`. Requires a hostile/buggy server frame; server is the trusted authority.
- [x] [Review][Defer] Dropped frame in the create/join → adopt listener handoff gap [client/src/lib/table-store.svelte.ts:60-64] — deferred: a projection arriving between the helper detaching its one-shot listener and `adoptSocket` re-attaching is lost; needs a sequence/replay design.
- [x] [Review][Defer] No Enter-to-submit on the code/name form [client/src/surfaces/Home.svelte:98] — deferred: UX enhancement, no AC; filling all slots + name and pressing Enter does nothing.

## Dev Agent Record

### Agent Model Used

Opus 4.8 (1M context) — `us.anthropic.claude-opus-4-8[1m]`

### Debug Log References

- **Store test project (Task 1):** the store uses Svelte 5 `$state`, which is only available in `.svelte`/`.svelte.ts` modules. So the store is `table-store.svelte.ts` and its test is `table-store.svelte.test.ts` (runs in `client-dom`, where the svelte plugin compiles `.svelte.ts`). RED confirmed: first run failed `Cannot find module './table-store.svelte'`.
- **First-projection seeding:** `createRoomWithRetry`/`joinRoomAndListen` consumed-and-discarded the first `tableState` (kept only `code`). The creator can sit alone, so a blank Lobby until the next push was a real gap. Fixed ADDITIVELY — both now return `state: ProjectedTableState` alongside the socket (the parse already had the payload; just surfaced it). No behavior/listener change; existing socket tests stayed green (server 27/27 includes the round-trip).
- **svelte-check fix (Task 6):** `inputmode="latin"` on the code slots is not a valid `inputmode` value → 1 svelte-check error. Changed to `inputmode="text"` (uppercase letter entry; `autocapitalize="characters"` carries the casing hint). Typecheck then 0/0.
- **GATE-1 verification:** confirmed in `eslint.config.js` that `.svelte` surfaces are NOT `.send`-exempt — surfaces route every outbound through `sendHostSetLives` → `sendIntent` (in the exempt `client/src/socket.ts`). `npm run lint` exit 0.

### Completion Notes List

- **Live data pipe (AC-1.10.4):** `client/src/lib/table-store.svelte.ts` is the read-only `tableState` store — a module-level Svelte 5 `$state<ProjectedTableState|null>` whose ONLY writer is `handleSocketMessage` (the receive loop). `App.svelte` now reads it via `$derived(readTableState())`; the routing chain + `route-from-state.ts` are byte-for-byte unchanged (the one-line data-source swap the 1.9a router was designed for). The session seams `startTable`/`joinTable`/`sendHostSetLives` live in the same module; `adoptSocket` seeds the store with the first projection and attaches the persistent `message` listener. No auto-reconnect added (socket.ts `maxRetries:0` untouched).
- **Home (AC-1.10.1/.3):** real cold-open surface — `START_TABLE`/`JOIN_TABLE` primaries (copy.ts), a disclosure to Start (name) / Join (4-slot code + name). Code field: auto-uppercase, auto-advance, paste-spread, `ROOM_CODE_ALPHABET`-restricted (imported from shared), backspace-steps-back. Bad/expired code → warm `BAD_CODE` `role="alert"` under the field; ALL reasons map to the one warm message (raw reason never leaked); field persists. Local disclosure state is NOT navigation — the router still owns the surface.
- **Lobby (AC-1.10.2/.3):** Room Code in Display-LG, per-letter slots on `surface-container-high` (the most prominent element) + `roomCode()` caption; live roster sorted by seat with `LivesPips`; non-Host sees `waitingForHost(host)`. Host-only: a 1..5 Lives stepper (value follows the server echo `state.startingLives`, sends `sendHostSetLives(clamped, phaseToken)`, −/+ disabled at bounds) + a bottom conductor bar with Deal disabled until ≥2 (`MIN_PLAYERS`). Deal's onclick is a placeholder — the `deal` intent is Epic 2, the ⚙ controls overlay Epic 4.
- **LivesPips (new shared widget):** `client/src/components/LivesPips.svelte` — filled mint discs (remaining) + hollow `--color-outline` rings (spent), shape-distinguished, numeral paired for ≥4. DESIGN.md lists Lives on Waiting/Showdown/RoundResult too, so it's forward-useful for Epic 3.
- **Scope honored:** did NOT implement the `deal` round-start intent (Epic 2), the Host Controls overlay (Epic 4), audio/speech, reconnection, or the other surface stubs. No new runtime deps. socket.ts change is additive (return shape only).
- **Gates (AC-1.10.5):** typecheck 0/0; lint clean (GATE-1/GATE-2 untouched); server 27/27 + client 38/38 (1.9a/1.9b 18 still green + 20 new); build emits warm manifest + both icons + 11-entry precache.

### File List

**New:**
- `client/src/lib/table-store.svelte.ts`
- `client/src/lib/table-store.svelte.test.ts`
- `client/src/surfaces/Home.svelte.test.ts`
- `client/src/surfaces/Lobby.svelte.test.ts`
- `client/src/components/LivesPips.svelte`

**Modified:**
- `client/src/surfaces/Home.svelte` (stub → real Start/Join + Room Code field + name entry + warm bad-code error)
- `client/src/surfaces/Lobby.svelte` (stub → Room Code display + live roster + Lives pips + Host stepper/conductor bar)
- `client/src/App.svelte` (placeholder `$state(null)` → `$derived(readTableState())`; routing chain unchanged)
- `client/src/main.ts` (scope comment updated — store now lives in `lib/table-store.svelte.ts`)
- `client/src/socket.ts` (additive: `createRoomWithRetry`/`joinRoomAndListen` now also return the first `state` projection)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (1-10 → in-progress → review)

## Change Log

| Date | Change |
|---|---|
| 2026-06-19 | Story 1.10 implemented: (1) live data pipe — read-only `tableState` store (`lib/table-store.svelte.ts`, Svelte 5 `$state`, sole writer = receive loop) + session seams (startTable/joinTable/sendHostSetLives); App reads the store via `$derived` with routing untouched; socket helpers additively return the first projection so the Lobby renders immediately. (2) Home surface — Start/Join, 4-slot paste-friendly auto-advancing Room Code field, name entry, warm `BAD_CODE` inline error. (3) Lobby surface — Display-LG letter-slot Room Code, live seat-sorted roster, Host-only 1–5 Lives stepper (server-echo value) + bottom conductor bar with Deal disabled until ≥2. (4) shared `LivesPips` component (filled/hollow, shape-distinguished, numeral ≥4). All copy from `copy.ts`. Gates: typecheck 0/0, lint clean, server 27/27 + client 38/38, build emits warm manifest + icons. Status → review. |
