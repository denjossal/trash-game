---
baseline_commit: d591bff
---

# Story 2.2: Two-scope monotonic guard (built whole)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the builder,
I want one monotonic-guard primitive covering both turn-scoped and phase-scoped intents,
so that turn races, double-taps, replays, ordering, and reveal-finality are all one family of check — built once, not split across epics.

## Acceptance Criteria

> Source ACs verbatim from [epics.md#Story 2.2] (lines 513–543). The "**Then**" clauses are the binding contract; the AC IDs are this story's addressing scheme.

**AC-2.2.1 — One primitive, both scopes (Decision #1, AR-6)**
Given the guard primitive,
When it is authored,
Then a **turn token** (`round.turnToken`) guards turn-scoped intents (`swap`/`keep`/`drawFromDeck`) and a **phase token** (`phaseToken`) guards Host-conducted transitions (`deal`/`revealAll`/`dealAgain`/`newGame`/host-controls and lobby `joinRoom` gating) — **both built now as ONE mechanism** (one module, two thin entry points sharing the same compare-and-reject shape), not split across epics and not two unrelated checks.

**AC-2.2.2 — Stale/mismatch is rejected, state untouched, no clock read**
Given an intent carrying a token,
When the token does NOT match the server's expected value (stale / double-tap / replay / race),
Then the server rejects it with a typed `error` (`stale-turn` for a turn-scoped mismatch, `stale-phase` for a phase-scoped mismatch), does **NOT mutate state**, and **client timestamps are never consulted** (the decision is integer-equality only).

**AC-2.2.3 — Client handles stale silently (no toast, re-render latest)**
Given a client receiving `stale-turn`/`stale-phase`,
When it handles the error,
Then it **discards silently with NO toast** and re-renders the next `tableState` snapshot — a benign double-tap never surfaces a user-facing error.

**AC-2.2.4 — Accepted path increments the token monotonically**
Given the accepted path,
When a valid turn-scoped or phase-scoped intent is applied,
Then the **corresponding token increments monotonically** (the turn token for a turn-scoped intent, the phase token for a phase-scoped transition) so the next stale copy of that intent mismatches and is rejected by AC-2.2.2.

**AC-2.2.5 — The guard is the single WRITE chokepoint; durable summary persists on every accepted transition**
Given the guard is the single chokepoint every phase transition flows through (the WRITE counterpart to Story 1.4's READ chokepoint `projectStateFor`),
When any guarded phase transition is accepted,
Then the durable summary (`code, phase, hostId, startingLives, players[{id,name,lives,isAlive,seatIndex}], phaseToken`) is persisted to the single `ctx.storage` key `"table"`, while the in-flight `round` stays in **memory only**. *(Winston review — closes the persistence-implementation gap; AR-8.)*

**AC-2.2.6 — D2.1 reload coercion is IMPLEMENTED and durable across repeated restarts**
Given a Durable Object waking from hibernation/restart (D2.1 reload coercion),
When the persisted `phase` implies a live round (`dealing`/`turns`/`allActed`/`showdown`) but `round === null`,
Then the server coerces `phase` to a safe between-rounds / needs-redeal surface (`roundResult`) and **bumps `phaseToken` BEFORE the first projection**, AND **re-persists the coerced summary** so the bumped token survives a second eviction (monotonicity holds across repeated restarts) — verified by a mid-round force-reload test. *(Winston review; AR-8 / D2.1; closes deferred-work #61.)*

## Tasks / Subtasks

- [x] **Task 1 — Author `server/src/rules/validate.ts`: the guard primitive (PURE)** (AC: 2.2.1, 2.2.2)
  - [x] Create `server/src/rules/validate.ts` — the FIRST file in `rules/` besides `engine.ts`. It is PURE (GATE 2 applies): no `Date`/`Math.random`/`crypto`/`fetch`/`storage`/`ws`/`caches`/`console`/`this`/dynamic-`import()`; imports ONLY `@trash/shared` or same-tree `./`.
  - [x] Export `checkTurnToken(round: Round, intentToken: number): void` — throws `new IntentError("stale-turn")` if `round.turnToken !== intentToken`; returns void on match. Pure integer-equality compare; reads NO clock.
  - [x] Export `checkPhaseToken(state: TableState, intentToken: number): void` — throws `new IntentError("stale-phase")` if `state.phaseToken !== intentToken`; returns void on match.
  - [x] These are the ONE mechanism (AC-2.2.1): two thin entry points over the SAME compare-and-reject shape (consider a shared private `requireToken(actual, expected, reason)` helper). `IntentError` is pure and already importable from `@trash/shared` (it is the only runtime export there — verified safe for `rules/**`, used in `engine.ts`'s sibling).
  - [x] Do NOT mutate state in these functions — they only compare and throw. The mutation+increment lives at the call site (Task 2), keeping the guard pure and reusable.
  - [x] **Scope (user-confirmed): guard primitive ONLY.** Do NOT add field-range validation (rank 1..13, lives MIN/MAX, code alphabet, token bounds) in this story — those attach to the stories that introduce each intent's handler (2.3 deal, 2.4 swap, 4.x host-controls). See Dev Notes "validate.ts scope".

- [x] **Task 2 — Define the accepted-path increment helpers (token monotonicity)** (AC: 2.2.4)
  - [x] Provide a single, reusable way to advance each token on the accepted path so every future handler increments identically (no per-handler `+1` scattered around). Recommended: `bumpPhaseToken(state)` mutates `state.phaseToken += 1`; `bumpTurnToken(round)` mutates `round.turnToken += 1`. Decide whether these live in `validate.ts` (pure, mutating a passed-in object is allowed under GATE 2 — no `this`/IO) or co-located with the guard checks. Keep them next to the checks so "guard + advance" is one import.
  - [x] These are NOT called by any handler in THIS story (no deal/swap handler exists yet — those are 2.3–2.6). They ship with unit tests proving the increment and are consumed when the handlers land. This is the "built whole, consumed later" pattern (same as `reconcileSummaryToState` shipped in 1.6 and consumed here).

- [x] **Task 3 — Wire the D2.1 reload-coercion re-persist (close deferred-work #61)** (AC: 2.2.6)
  - [x] `reconcileSummaryToState(summary)` already coerces a live-round phase → `roundResult` and bumps `phaseToken + 1` [persistence.ts:75-87], and `onStart` already calls it [table-server.ts:59-64]. The GAP (deferred-work #61): the bumped token is held in memory only — it is **never re-persisted**, so a second eviction reloads the OLD token and coerces again. Monotonicity across repeated restarts is broken.
  - [x] Fix: when `onStart` reconciles a summary whose phase REQUIRED coercion, **re-persist the coerced state** before the first projection, so the durable `"table"` key holds the bumped token. Two clean options — pick one and document why:
    - (a) Have `onStart` detect coercion (compare `summary.phase` vs the reconciled `phase`, or have `reconcileSummaryToState` return a `{ state, coerced }` pair) and call `persistSummary(this.storage, this.table)` only when `coerced === true`.
    - (b) Always `persistSummary` after hydration. Simpler, but writes on every cold wake even when nothing changed (a lobby reload re-persists an identical summary — harmless but extra I/O on every wake).
    - **Recommendation:** (a) — re-persist ONLY on actual coercion, so a benign lobby wake stays read-only. Prefer returning `{ state, coerced }` from `reconcileSummaryToState` over re-deriving the comparison in `onStart` (single source of the coercion decision).
  - [x] `onStart` runs inside partyserver's `blockConcurrencyWhile` (`#ensureInitialized`) — confirmed in the 1.6 review — so the re-persist completes BEFORE the first `onMessage`/projection. The "bump BEFORE first projection" ordering (AC-2.2.6) is satisfied by doing the persist in `onStart`.
  - [x] Keep `reconcileSummaryToState` PURE (it is in `persistence.ts`, NOT `rules/`, so it CAN touch types but must stay a pure transform — it already is; do not add storage I/O inside it). The I/O (`persistSummary`) belongs in `onStart` (the DO), not in the pure reconcile.

- [x] **Task 4 — Confirm the persistence-on-transition seam (AC-2.2.5) is the documented chokepoint** (AC: 2.2.5)
  - [x] `persistSummary(storage, state)` already writes the durable summary to the single `"table"` key on accepted lobby transitions (create/join/set-lives) [persistence.ts:51-53; handlers.ts:114,216,294]. This story does NOT add a new phase transition (no deal handler yet), so there is no NEW persist call to write here — the seam already exists and is correct.
  - [x] The deliverable for AC-2.2.5 is the **documented invariant + a test** that pins it: "every accepted guarded transition persists the durable summary; `round` is never persisted." Add/extend a test asserting `toSummary` excludes the entire `round` object (already partially covered — confirm `hands`/`deck`/`turnToken`/`currentTurnId`/`acted`/`revealed` are all absent from the persisted blob). The actual deal→persist wiring is Story 2.3; here we lock the contract the guard chokepoint will obey.
  - [x] Document in `validate.ts` (or a short comment in `persistence.ts`) that the guard is the WRITE counterpart to `projectStateFor`'s READ chokepoint: accepted phase transitions flow guard → mutate → bump → `persistSummary`; this is the canonical order future handlers (2.3+) follow.

- [x] **Task 5 — Client: silent stale handling (no toast, re-render latest)** (AC: 2.2.3)
  - [x] In the client's socket message handler (`client/src/lib/table-store.svelte.ts` — the `{type:"error"}` branch), ensure `stale-turn` and `stale-phase` are **swallowed silently**: NO toast, NO user-facing error surface; the store simply keeps rendering the latest `tableState` snapshot it already holds (the server pushes a fresh snapshot on the accepted intent that won the race).
  - [x] FIRST read the current error-handling branch to see how errors are surfaced today (Story 1.10 wired the live store). If there is no toast/error surface yet, the requirement is satisfied by NOT adding one for these two reasons — but add an explicit `stale-turn`/`stale-phase` → no-op case (or a documented default) and a comment so a later story does not accidentally start toasting them. Distinguish from `bad-code`/`room-full`/`not-host` which ARE surfaced (lobby errors the user must see).
  - [x] Add a client unit test (Vitest, client project) asserting an incoming `{type:"error",payload:{reason:"stale-turn"}}` (and `stale-phase`) produces NO error-state mutation / no toast signal, while the held snapshot is unchanged. Mirror the house client-test style.

- [x] **Task 6 — Tests: the guard primitive, both scopes, and the reload coercion** (AC: all)
  - [x] `server/src/rules/validate.test.ts` (node `rules` project — pure unit tests, NO Workers runtime). House style: `import { expect, test } from "vitest"`; descriptive names ("checkTurnToken: ...").
    - [x] `checkTurnToken`: match → returns (no throw); mismatch (stale int, off-by-one, replayed lower value) → throws `IntentError` with `reason === "stale-turn"`; does not read any clock (assert by construction — pure function, no Date import; GATE 2 enforces it).
    - [x] `checkPhaseToken`: match → returns; mismatch → throws `IntentError` `reason === "stale-phase"`.
    - [x] BOTH scopes in one file proves "one mechanism" (AC-2.2.1). If you used a shared `requireToken` helper, test it once and the two wrappers' reason-routing.
    - [x] `bumpTurnToken`/`bumpPhaseToken`: increment by exactly 1; monotonic across repeated calls; a value bumped past a stale copy now mismatches `checkTurnToken`/`checkPhaseToken` (close the AC-2.2.4 → AC-2.2.2 loop in a single test: bump, then a stale token throws).
    - [x] **Privacy/purity:** validate.ts touches NO hand/card data and never reads a non-owner's card (it only compares integers) — assert by construction; GATE 2 lint is the enforcer.
  - [x] `server/src/persistence.test.ts` (node project — extend the existing file if present, else create): D2.1 coercion + re-persist.
    - [x] `reconcileSummaryToState`: a `dealing`/`turns`/`allActed`/`showdown` summary → reconciled phase `roundResult`, `phaseToken === summary.phaseToken + 1`, `round === null`, `players[].isConnected === false`. A `lobby`/`roundResult`/`gameOver` summary → phase unchanged, token unchanged (NO coercion).
    - [x] If you return `{ state, coerced }`: assert `coerced === true` for live-round phases, `false` otherwise.
    - [x] `toSummary`: the persisted blob EXCLUDES the entire `round` object and `isConnected` (lock AC-2.2.5's field boundary).
  - [x] DO-level reload test (`server/src/table-server.do.test.ts` or a new `*.do.test.ts` — Workers `do` project): seed `ctx.storage["table"]` with a live-round summary (e.g. `phase:"turns"`, `phaseToken: 5`), construct/start the DO, assert that AFTER `onStart` the **persisted** `"table"` key now holds `phase:"roundResult"` and `phaseToken: 6` (the RE-PERSIST — the deferred-work #61 fix), and that the first projection sees `phase:"roundResult"`. Then simulate a SECOND restart from the now-persisted summary and assert the token does NOT bump again (it is already `roundResult`, not a live-round phase) — proving monotonicity across repeated restarts.
  - [x] **GATE 2 red/green discipline** (per the recurring per-story note): briefly confirm `validate.ts` survives the purity gate — plant a `Date.now()` / `crypto` token in `validate.ts`, see lint go RED, remove it → GREEN. Record the result in Completion Notes (the gate logic is pre-proven in 1.2/2.1; this is the per-story confirmation it still bites for the new file).

- [x] **Task 7 — Verify gates** (AC: all)
  - [x] `npm test` → server (rules + do projects) and client all green; no regressions to the 44 server / 42 client baseline (the count grows with the new tests).
  - [x] `npm run lint` → green (`validate.ts` passes GATE 2; no banned tokens; imports only `@trash/shared`/`./`).
  - [x] `npm run typecheck` → 0 errors.

## Dev Notes

### What this story IS / IS NOT
- **IS:** the monotonic-guard PRIMITIVE — `server/src/rules/validate.ts` exporting pure `checkTurnToken`/`checkPhaseToken` (compare + throw typed `stale-turn`/`stale-phase`) and the accepted-path token-increment helpers, with unit tests exercising BOTH scopes. PLUS wiring the D2.1 reload-coercion **re-persist** (closing deferred-work #61) so `phaseToken` monotonicity survives repeated restarts. PLUS the client's **silent** stale-error handling. PLUS locking the AC-2.2.5 persist-on-transition / `round`-is-memory-only contract with a test.
- **IS NOT:** the deal handler (Story 2.3), the swap/keep/draw handlers (2.4/2.6), `revealAll` (3.2), or any host-control handler (4.x). It does NOT wire the tokens into a live intent flow (no such handler exists yet) — it ships the primitive + helpers that those handlers will CONSUME. It is NOT `validate.ts`'s field-range validation (rank/lives/code/token bounds) — see "validate.ts scope" below. No new `Round` is constructed; no `deal`; no card data touched.
- **The pattern:** "built whole, consumed later" — exactly how `reconcileSummaryToState` was shipped in Story 1.6 (built, dormant) and is now activated here. The guard is built ONCE as one mechanism (Decision #1, Winston's "don't split the mechanism") and consumed by 2.3–4.x as they land. This is why the AC says "when it is AUTHORED" — the deliverable is the primitive's existence + correctness, not a live deal race.

### validate.ts scope (user-confirmed decision)
- **This story builds the GUARD PRIMITIVE ONLY** — token compare/reject + typed errors + accepted-path increments + D2.1 re-persist.
- **Field-range validation is NOT in scope here.** The Epic-1 retro folds a broader `validate.ts` obligation into Epic 2: range/integer/token/alphabet checks for *every* numeric/string Intent field (`rank` 1..13, `hostSetLives.lives` MIN/MAX, bounded `code`/tokens) [epic-1-retro line 53; deferred-work #14]. Per user decision (create-story 2-2), that field validation **attaches to the story that introduces each intent's handler** — `deal` (2.3), `swap`/`keep`/`drawFromDeck` (2.4/2.6), host-controls (4.x) — NOT front-loaded here for intents that have no handler/caller yet. `validate.ts` STARTS as the guard module in this story and GROWS field checks as handlers land.
- **Carry-forward for the dev:** when you create `validate.ts`, leave a header comment naming the future field-validation obligation (so a later reader knows this file is the home for it) but do NOT implement it now. Cite deferred-work #14 / retro line 53.
- Also note the 2.1-deferred pure-engine input gaps (`buildDeck`/`shuffle` non-finite/out-of-range inputs, deferred-work #7–9) are the SAME `validate.ts` class but are reached only via the deal path — they land with Story 2.3's deal handler (the first caller of `buildDeck`/`shuffle`), not here.

### The two-scope guard — architecture contract (D4 / AR-6)
- **Turn token** (`round.turnToken: number`): incremented on each accepted turn-scoped intent (`swap`/`keep`/`drawFromDeck`). The intent carries the token it believes current; a mismatch → `stale-turn`. Covers turn-race + replay + double-tap + ordering on one axis. [architecture.md:391-393]
- **Phase token** (`phaseToken: number`): incremented on each accepted Host transition (`deal`/`revealAll`/`dealAgain`/`newGame`/host-controls). A mismatch → `stale-phase`. The `revealAll` guard ALSO requires `phase === "allActed"` (so no card is ever both mutable and visible) — but that EXTRA guard is Story 3.2's concern; 2.2 ships only the token compare. [architecture.md:394-396]
- **Two tokens kept deliberately** — turn-scoped vs phase-scoped concurrency are different axes (a swap racing a swap vs. a double-tapped Deal); one token would conflate them. Cost is two integers. [architecture.md:397-400]
- **`joinRoom` is gated to `lobby` phase only** (it cannot race a Deal) — that gate already exists [handlers.ts:184]; in-progress tables use reconnect, which bumps no token. The phase-token "lobby joinRoom gating" phrase in AC-2.2.1 refers to this EXISTING lobby phase-check (Decision #1's lightweight validation), NOT a new token check on join. Do not add a token to `joinRoom`.
- **Stale handling is silent** (D4): a mismatch returns a typed `error` the client resolves by re-rendering the latest snapshot — a benign double-tap never shows a user-facing error. **Client timestamps are NEVER read** (the decision is integer equality). [architecture.md:401-403]

### Current code state (verified — read these before writing)
- **`server/src/rules/validate.ts` does NOT exist yet** — you are creating it. `rules/` currently holds only `engine.ts` + `engine.test.ts` (Story 2.1). [server/src/rules/]
- **`IntentError`** [shared/src/types.ts:186-194]: `class IntentError extends Error { readonly reason: ErrorReason }`. It is PURE (only sets a reason + message — no Date/Math.random/crypto/IO) and is documented safe to import from `rules/**` — `engine.ts`'s tests already rely on `@trash/shared` being the sole allowed import. `stale-turn` and `stale-phase` are already in the `ErrorReason` union [types.ts:171-178]. The contract is FROZEN — do NOT add a new ErrorReason.
- **`Round` type** [shared/src/types.ts:66-74]: carries `turnToken: number`. `TableState` [types.ts:82-90] carries `phaseToken: number`. Both already exist; you read them in the guard.
- **`reconcileSummaryToState`** [server/src/persistence.ts:75-87]: ALREADY coerces live-round phase → `roundResult` and returns `phaseToken: summary.phaseToken + 1`. It is a PURE transform (no I/O). The `LIVE_ROUND_PHASES` set [persistence.ts:63] = `{dealing, turns, allActed, showdown}` is the coercion trigger. **The gap you fix (Task 3): the bump is never re-persisted.** [deferred-work #61.]
- **`onStart`** [server/src/table-server.ts:59-64]: ALREADY calls `reconcileSummaryToState` on wake. Runs inside `blockConcurrencyWhile` (before first `onMessage`) — confirmed 1.6 review. You ADD the conditional re-persist here.
- **`persistSummary`/`toSummary`/`TABLE_KEY`** [persistence.ts:33-58]: the single `"table"`-key write; `toSummary` drops `round` + `isConnected`. This is the AC-2.2.5 seam — already correct; you lock it with a test, you do NOT add a new transition.
- **`dispatch`** [server/src/dispatch.ts]: the SINGLE try/catch that turns an `IntentError` into a targeted `error` event [dispatch.ts:81-87]. Gameplay intents currently route to `throw new IntentError("phase-illegal")` [dispatch.ts:78-79]. **You do NOT wire the guard into dispatch in this story** (no deal/swap handler exists to guard) — but read this so you understand WHERE the guard call sites will live: a future handler calls `checkPhaseToken(state, intent.payload.phaseToken)` / `checkTurnToken(round, intent.payload.turnToken)` FIRST, then mutates + bumps + `persistSummary` + fanOut. The single try/catch already converts the thrown stale error into the targeted client `error` — no dispatch change needed.
- **Client store** [client/src/lib/table-store.svelte.ts] — read the `{type:"error"}` branch (~lines 51-64 per deferred-work #103-104) to see today's error handling before adding the silent stale case (Task 5).

### Why the guard lives in rules/ (purity boundary)
- `validate.ts` is named in the architecture as a sibling of `engine.ts` inside the PURE `rules/` tree [architecture.md engine.ts responsibility note; retro line 53 "server/src/rules/validate.ts"]. The guard is pure logic (integer compare + throw a pure error) — it belongs in the purity-gated tree so it is node-unit-testable and provably free of clock/RNG/IO. GATE 2 [eslint.config.js:101-122] enforces: no banned tokens, imports only `@trash/shared`/`./`.
- The co-located-test exemption [eslint.config.js, "GATE 2 test-file exemption"] already allows `vitest` imports in `rules/**/*.test.ts` while keeping the purity SYNTAX bans in force — so `validate.test.ts` works exactly like `engine.test.ts` (Story 2.1's narrow exemption covers it).
- **Consequence:** the guard CANNOT read a clock or generate the token from time/random — it compares the integer the intent carries against the integer in state. This is the whole point: deterministic, replay-proof, testable.

### Testing standards (match the house style)
- **Vitest projects** [server/vitest.config.ts:18-42]: `name:"rules"` (env `node`, `src/**/*.test.ts`, EXCLUDES `*.do.test.ts`) for pure tests — that is `validate.test.ts` and the `reconcileSummaryToState`/`toSummary` unit tests. `name:"do"` (pool-workers, `*.do.test.ts`) for the DO-level reload test. Name test files EXACTLY `*.test.ts` (node) or `*.do.test.ts` (Workers) — any other suffix runs in NO project (silent zero coverage). [vitest.config naming-convention note.]
- **Style reference** [server/src/rules/engine.test.ts; server/src/identity.test.ts]: `import { expect, test } from "vitest"`; descriptive names; explicit regression-guard tests; batch loops where a property is asserted over many values.
- **Throw-assertion pattern:** `expect(() => checkTurnToken(round, 99)).toThrow(IntentError)` and assert `err.reason === "stale-turn"` (catch + inspect, or `toThrowError` with a matcher). Mirror how `engine`/`identity` tests assert thrown errors if a precedent exists.
- **DO reload test:** seed `ctx.storage` via the Workers test harness (see `server/src/table-server.do.test.ts` + `scaffold.do.test.ts` for how the DO is constructed and storage seeded in the pool). Assert against the PERSISTED key after `onStart`, not just the in-memory cache — the re-persist is the whole point of the fix.

### Previous story intelligence (Story 2.1 — done)
- 2.1 established `rules/engine.ts` as the first pure module + the narrow GATE 2 test-file import exemption (`vitest` allowed in `rules/**/*.test.ts`, syntax bans intact). `validate.test.ts` inherits that exemption — no eslint change needed this story.
- 2.1's review SATISFIED all ACs; its 4 deferred findings (deferred-work #7-9) are pure-engine input gaps owned by `validate.ts`'s FIELD validation — reached only via the deal path → Story 2.3, NOT this story. Do not be tempted to "finish validate.ts" by adding them now (user-confirmed scope).
- 2.1 confirmed `crypto.getRandomValues` is available in the node `rules` vitest project — not relevant to 2.2 (the guard reads no RNG) but confirms the node project is healthy for pure tests.

### Git intelligence
- Recent commits are per-story + code-review merges (1.9b → 1.10 → 1.11 → 2.1), each landing one tightly-scoped slice with full gate verification. Pattern to match: one focused change, tests + lint + typecheck green, no scope creep. The 2.1 commit added `rules/engine.ts` + tests + a narrow eslint block — 2.2 should be similarly contained (`rules/validate.ts` + tests, a small `onStart` re-persist, a small client error-branch change).
- No dependency/library changes in recent history — and none here (no zod/valibot; the contract is type-only + the pure `IntentError`). Do NOT add a validation library.

### Project Structure Notes
- **New:** `server/src/rules/validate.ts` (PURE), `server/src/rules/validate.test.ts` (node project).
- **Modified:** `server/src/table-server.ts` (`onStart` re-persist on coercion); possibly `server/src/persistence.ts` (if `reconcileSummaryToState` returns `{state, coerced}` per the recommended option 3a); `client/src/lib/table-store.svelte.ts` (silent stale handling) + a client test.
- **New (likely):** a `*.do.test.ts` reload test (or extend `table-server.do.test.ts`); extend/`server/src/persistence.test.ts` for the reconcile/toSummary unit tests.
- **No changes** to `shared/src/types.ts` (the contract is frozen and already names `turnToken`/`phaseToken`/`stale-turn`/`stale-phase`), `wrangler.jsonc`, DO class wiring, or `eslint.config.js` (the 2.1 test exemption already covers `validate.test.ts`).
- **No new phase transition** is wired (no deal handler) — so no new `persistSummary` CALL is added on a transition path; AC-2.2.5 is locked by test + documentation, activated by 2.3.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.2 — Two-scope monotonic guard (built whole) (lines 513–543)] — the source ACs.
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2 binding decisions — #1 (two-scope guard built WHOLE here, both scopes); AR-6 (two-scope monotonic guard)]
- [Source: _bmad-output/planning-artifacts/architecture.md#D4 Two-Scope Monotonic Guard (389–403); #D2 durable summary (346–358); #D2.1 reload-reconciliation (359–363); #D3 protocol/ServerEvent/ErrorReason (365–403); phase machine (574–590)]
- [Source: server/src/rules/engine.ts + engine.test.ts (Story 2.1 — the rules/ precedent); eslint.config.js:101-122 (GATE 2) + the GATE 2 test-file exemption block]
- [Source: server/src/persistence.ts:51-87 (persistSummary/toSummary/TABLE_KEY/reconcileSummaryToState/LIVE_ROUND_PHASES); server/src/table-server.ts:59-64 (onStart)]
- [Source: shared/src/types.ts:66-90 (Round.turnToken / TableState.phaseToken), 171-194 (ErrorReason incl. stale-turn/stale-phase, IntentError)]
- [Source: server/src/dispatch.ts:41-88 (single try/catch IntentError→error; gameplay intents currently rejected); server/src/push-state.ts (pushError); client/src/lib/table-store.svelte.ts (error branch)]
- [Source: _bmad-output/implementation-artifacts/deferred-work.md #61 (D2.1 re-persist gap, owned here), #14 (field validation owed to validate.ts — NOT this story), #7-9 (pure-engine input gaps → 2.3 deal path)]
- [Source: _bmad-output/implementation-artifacts/epic-1-retro-2026-06-20.md lines 53-54, 56, 83, 108 (validate.ts + two-scope-guard baked into Epic 2 ACs; D2.1 re-persist from 1-6 → 2.2/2.3)]

## Dev Agent Record

### Agent Model Used

Amelia (Senior Software Engineer persona) on Claude Opus 4.8 (1M context).

### Debug Log References

- `npx vitest run src/rules/validate.test.ts` → 10 passed (guard primitive: both scopes, bump helpers, accepted→stale loop).
- `npx vitest run src/persistence.test.ts` → 11 passed (toSummary field boundary; reconcile coercion `{state, coerced}` over all live-round + safe phases).
- `npx vitest run src/table-server-reload.do.test.ts` → 3 passed (Workers runtime: D2.1 re-persist, monotonic across repeated restarts, read-only lobby wake).
- `npm test` (root) → server 68 passed (12 files), client 45 passed (5 files) — baseline was 44/42; +24 server, +3 client, no regressions.
- `npm run lint` → green; `npm run typecheck` → 0 errors.
- **GATE 2 red/green proof:** planted `Date.now()` in `validate.ts` → `eslint` RED (`rules/** is PURE — no Date.now` / `no Date`); removed → GREEN. No planted tokens remain.

### Completion Notes List

- **Guard primitive built WHOLE, one mechanism (AC-2.2.1/.2/.4):** `server/src/rules/validate.ts` exports `checkTurnToken`/`checkPhaseToken` — two thin wrappers over ONE private `requireToken(actual, expected, reason)` compare-and-reject — plus `bumpTurnToken`/`bumpPhaseToken` accepted-path increments. Decision is **integer equality only** (no clock read — enforced by GATE 2 purity). Lives in the purity-gated `rules/` tree (pure logic, node-testable).
- **Scope held (user-confirmed):** guard primitive ONLY. NO field-range validation (rank/lives/code/token bounds) — that grows `validate.ts` as each intent's handler lands (2.3/2.4/4.x). A header comment in `validate.ts` names that future obligation (deferred-work #14 / retro line 53). NOT consumed by any handler this story (no deal/swap exists) — "built whole, consumed later," same pattern as `reconcileSummaryToState` shipped dormant in 1.6.
- **D2.1 re-persist (AC-2.2.6 — closes deferred-work #61):** `reconcileSummaryToState` now returns `{ state, coerced }` (single source of the coercion decision). `onStart` re-persists the bumped summary IFF `coerced === true`, so the bumped `phaseToken` is durable and survives a SECOND eviction. A benign lobby/between-rounds wake reports `coerced: false` and stays read-only (no write amplification). The persist runs inside `blockConcurrencyWhile` (before the first projection) — the "bump before first projection" ordering holds. Chose option (a) per the story recommendation.
- **AC-2.2.5 locked by test + docs:** no NEW phase transition wired (no deal handler this story), so no new `persistSummary` call. `persistence.test.ts` pins the durable field boundary: `toSummary` excludes the entire `round` object + `isConnected`, and carries no card data (SM-6 at the storage seam). `validate.ts`/`onStart` document the canonical accepted order future handlers follow: guard → mutate → bump → `persistSummary`.
- **Silent stale handling (AC-2.2.3):** the kept-open client store already drops ALL `error` envelopes (last-good projection preserved; lobby errors surfaced by the create/join FLOW, not the store). Made it explicit with a comment naming `stale-turn`/`stale-phase` and added tests asserting the held snapshot is untouched (same object reference) on a stale error and re-renders normally on the next snapshot. No toast surface exists or was added.
- **No contract change:** `shared/src/types.ts` untouched — `turnToken`/`phaseToken`/`stale-turn`/`stale-phase` were already named. No new ErrorReason. No new dependency (no zod/valibot). The 2.1 GATE 2 test-file exemption already covers `validate.test.ts` — no eslint change.

### File List

- `server/src/rules/validate.ts` (NEW) — pure two-scope guard primitive: `checkTurnToken`/`checkPhaseToken` (+ private `requireToken`) + `bumpTurnToken`/`bumpPhaseToken`.
- `server/src/rules/validate.test.ts` (NEW) — node-env unit tests for both scopes, bump monotonicity, and the accepted→stale-rejected loop.
- `server/src/persistence.ts` (MODIFIED) — `reconcileSummaryToState` now returns `ReconcileResult { state, coerced }` (the re-persist signal); added the `ReconcileResult` type + doc.
- `server/src/persistence.test.ts` (NEW) — node-env unit tests: `toSummary` durable field boundary; reconcile coercion over all live-round + safe phases.
- `server/src/table-server.ts` (MODIFIED) — `onStart` re-persists the coerced summary when `coerced === true` (deferred-work #61 fix); imports `persistSummary`.
- `server/src/table-server-reload.do.test.ts` (NEW) — Workers-runtime reload test: re-persist after coercion, monotonicity across repeated restarts, read-only lobby wake.
- `client/src/lib/table-store.svelte.ts` (MODIFIED) — explicit silent-stale comment (no toast for `stale-turn`/`stale-phase`); behavior unchanged.
- `client/src/lib/table-store.svelte.test.ts` (MODIFIED) — added silent-stale-handling cases (held snapshot untouched; re-renders on next snapshot).

### Review Findings

> Code review 2026-06-20 — 3 adversarial layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor). All 6 ACs verified SATISFIED by the Acceptance Auditor. No AC violation found. 1 patch, 4 deferred, 5 dismissed as noise/by-design.

- [x] [Review][Patch] `requireToken` parameter names are inverted vs. codebase semantics [server/src/rules/validate.ts:28] — FIXED 2026-06-20: renamed `actual`/`expected` → `serverToken`/`intentToken`. Typecheck + lint + 10/10 validate tests green. — called as `requireToken(round.turnToken, intentToken, ...)`, so `actual` = the SERVER's token and `expected` = the CLIENT's intent token. But the rest of the design frames the server value as the *expected* value the intent must match. Pure rename for clarity (e.g. `expected`/`provided` or `serverToken`/`intentToken`); zero behavior change. Latent trap for the next author who adds a `<`/`>` comparison and trusts the labels.

- [x] [Review][Defer] `checkTurnToken` would dereference `null` round after a coerced reload [server/src/rules/validate.ts:39 → Story 2.4 swap/keep/draw] — deferred, future-caller guidance (no call site this story)
- [x] [Review][Defer] `persistSummary` throw in `onStart` re-coerces/re-bumps on the next wake [server/src/table-server.ts:74 → hardening] — deferred, safe failure mode, no AC violation
- [x] [Review][Defer] `bumpTurnToken`/`bumpPhaseToken` exported as bare mutators with no guard-coupling [server/src/rules/validate.ts:59-65 → Story 2.3+] — deferred, future-caller misuse surface
- [x] [Review][Defer] AC-2.2.6 "second eviction" verified via re-seed proxy, not a chained double-wake of the same DO [server/src/table-server-reload.do.test.ts:76 → test hardening] — deferred, test-completeness nit

### Change Log

- 2026-06-20 — Implemented the two-scope monotonic-guard primitive (`server/src/rules/validate.ts`: pure `checkTurnToken`/`checkPhaseToken` + `bumpTurnToken`/`bumpPhaseToken`); closed the D2.1 reload-coercion re-persist gap (deferred-work #61) by returning `{state, coerced}` from `reconcileSummaryToState` and re-persisting on coercion in `onStart`; made the client's silent `stale-turn`/`stale-phase` handling explicit. Locked the AC-2.2.5 durable field boundary by test. Guard primitive ONLY — field validation deferred to gameplay-handler stories (user-confirmed). +24 server / +3 client tests; lint + typecheck green; GATE 2 red/green re-proven for the new file. Status → review.
