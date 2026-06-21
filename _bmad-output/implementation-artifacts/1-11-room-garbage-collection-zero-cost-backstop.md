---
baseline_commit: f43c69899a3aeb9b6d0f817bc7ea50f062d3a93e
---

# Story 1.11: Room garbage collection (zero-cost backstop)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the builder,
I want abandoned Tables to clean themselves up,
so that orphaned rooms can never turn the $0 running cost into a real cost.

## Acceptance Criteria

**AC-1.11.1 — Debounced idle alarm armed on activity.** *(AR-11, NFR-3; architecture.md D7.)*
**Given** an active Table DO
**When** activity occurs (a connection opens, or any state-mutating intent is accepted)
**Then** the DO arms a `ctx.storage` alarm for `now + IDLE_TTL_MS` (the existing `IDLE_TTL_MS = 3h` from `@trash/shared`), **debounced** so it only re-arms when more than `ALARM_REARM_DEBOUNCE_MS` (a few minutes) have elapsed since the last arm — no per-intent `setAlarm` write amplification.

**AC-1.11.2 — Hibernation enabled and the native accept verified.** *(AR-11, NFR-3/SM-7; Story 1.1 spike correction, 2026-06-19; architecture.md D7 + Cross-Cutting #6.)*
**Given** the GC connection probe and the idle-billing benefit both require partyserver Hibernation (so sockets are accepted via the native `ctx.acceptWebSocket()` and are therefore visible to `ctx.getWebSockets()`)
**When** Story 1.11 is built
**Then** `TableServer` declares `static options = { hibernate: true }` **and** an integration check against `wrangler dev` confirms that an open socket appears in `ctx.getWebSockets()` (i.e. hibernation actually wires `ctx.acceptWebSocket()`).
**And** if that confirmation fails, the probe falls back to counting partyserver's own registry `[...this.getConnections()].length` — the spike-validated correct-regardless-of-accept-mode path — and that fallback is documented in code. *(The primary build target is the hibernation path; the fallback is the documented safety net, not the default.)*

**AC-1.11.3 — Self-delete only with no active connections.** *(AR-11; FR via NFR-3; architecture.md D7.)*
**Given** the GC alarm fires
**When** the connection probe runs
**Then** the DO self-deletes — `await this.ctx.storage.deleteAll()`, which clears the durable `"table"` key and **releases the Room Code** for re-claim — **ONLY** when there are no active connections (`ctx.getWebSockets().length === 0` under Hibernation; else `[...this.getConnections()].length === 0`); a room with connected players is **preserved** and the alarm is **re-armed** to `now + IDLE_TTL_MS` so the 3h idle TTL remains the backstop for sockets that never cleanly close.

**AC-1.11.4 — A single live connection reads as non-zero (the exact spike bug).** *(Story 1.1 spike correction; architecture.md D7 lines 453–472.)*
**Given** a single live (open) WebSocket connection — the case the Story 1.1 spike caught reading 0 under standard-mode sockets
**When** the connection probe runs
**Then** the probe reports a **NON-zero** count, so a room full of active players is never deleted. Because `ctx.getWebSockets()` returns only hibernation-accepted sockets, this is the assertion that proves Hibernation is correctly enabled (it would fail under the old standard-accept default — the regression this story exists to prevent).

**AC-1.11.5 — Testable without 3h wall-clock; alarm fast-forward in the pool.** *(Amelia review; AR-14.)*
**Given** the alarm timing must be testable without waiting 3h
**When** the GC tests run
**Then** they assert behavior via `runDurableObjectAlarm(stub)` (the `cloudflare:test` helper that fires the scheduled alarm immediately) in the `*.do.test.ts` pool-workers project — NOT wall-clock duration — covering: (a) alarm armed after activity, (b) alarm re-armed (not deleted) while a connection is open, (c) self-delete + code-release when no connection is open, (d) debounce (a second activity within the window does not re-write the alarm). The `IDLE_TTL_MS`/`ALARM_REARM_DEBOUNCE_MS` values are imported config, not hard-coded literals in the test.

**AC-1.11.6 — No central reaper; GC is solely the Table's own alarm.** *(Per the spike-validated behavior from Story 1.1.)*
**Given** no central reaper exists
**When** any Table is GC'd
**Then** it is solely via that Table's own DO `onAlarm` (per-DO `ctx.storage` alarm) — no cron, no sweeper Worker, no external registry scan.

**AC-1.11.7 — Gates stay green.** *(Epic 0 G2 $0 gate; AR-13.)*
**Given** the implementation
**When** the gates run
**Then** `npm run typecheck` is 0/0; `npm run lint` is clean (GATE-1 `.send`/`.broadcast` ban + GATE-2 `rules/**` purity both untouched — the alarm/probe code lives in `table-server.ts`, NOT `rules/**`, so it may use `crypto`/`Date`/`this.`); `npm test` passes (server suite stays green — currently 27/27 — plus the new GC `*.do.test.ts`); no new runtime dependency is added (G2: only the free-tier Cloudflare Workers + DO (SQLite) + Hibernation path).

## Tasks / Subtasks

- [x] **Task 1 — Add the debounce constant (AC: #1)**
  - [x] Added `ALARM_REARM_DEBOUNCE_MS = 5 * 60 * 1000` to `shared/src/config.ts` next to `IDLE_TTL_MS` (`SCREAMING_SNAKE`; re-exported via the `@trash/shared` barrel — `index.ts` already does `export * from "./config.js"`).
  - [x] Inline doc explains the debounce avoids per-intent `setAlarm` write amplification (D7).

- [x] **Task 2 — Enable Hibernation on TableServer (AC: #2)**
  - [x] Added `static options = { hibernate: true };` to `TableServer` (partyserver field — `index.d.ts:209-210`; type `{ hibernate?: boolean }` matches). Switches accept to native `ctx.acceptWebSocket()` → accurate `getWebSockets()` probe + idle GB-s benefit.
  - [x] Flipped the class header HIBERNATION comment from "deliberately NOT enabled … 1.11's job" to "ENABLED via static options" with the spike-correction rationale + the `getConnections()` fallback note retained.
  - [x] Connection lifecycle verified intact under hibernation accept: `table-server.do.test.ts` create/join round-trip still green (one TEST-ONLY timing fix — see Debug Log; no production-handler change).

- [x] **Task 3 — `onAlarm` GC handler with the connection probe (AC: #2, #3, #4, #6)**
  - [x] Overrode `onAlarm()` (partyserver's native `alarm()` → `#ensureInitialized()` → `onAlarm()`, `index.js:915-920`). Probe `this.ctx.getWebSockets().length`: `0` → `await this.ctx.storage.deleteAll()` + null `this.table` + reset `#lastAlarmArmedAt`; else re-arm `setAlarm(now + IDLE_TTL_MS)`.
  - [x] `getConnections()` fallback documented inline (one-line swap) for the AC-1.11.2 verification-fails path.

- [x] **Task 4 — Arm/re-arm on activity with debounce (AC: #1)**
  - [x] `#lastAlarmArmedAt: number | null` instance field + private `armIdleAlarm()`: no-ops within `ALARM_REARM_DEBOUNCE_MS` of the last arm, else `void setAlarm(now + IDLE_TTL_MS).catch(()=>{})` (fire-and-forget; arming never blocks the connection/message path).
  - [x] Called from `onConnect` (socket opened = activity) and after `dispatch(...)` in `onMessage`. Note: dispatch swallows IntentErrors, so the post-dispatch arm runs even for a rejected intent — acceptable (an open socket is genuine activity; the debounce caps writes). Documented inline.
  - [x] `#lastAlarmArmedAt` is cache-only (null after wake) — safe: next activity re-arms; over-arming is harmless (D7 ASSUMPTION).

- [x] **Task 5 — Tests: GC alarm in the pool-workers project (AC: #3, #4, #5, #6)**
  - [x] New `server/src/table-server-gc.do.test.ts` (`*.do.test.ts` → pool "do" project). Added `runDurableObjectAlarm` to the `cloudflare:test` declaration in `server/src/env.test.d.ts`.
  - [x] **Test A (self-delete, .3/.6):** seed a claimed lobby Table, arm, fire with NO socket → `runDurableObjectAlarm` returns `true` and the `"table"` key is `undefined` (code released).
  - [x] **Test B (preserve + re-arm + non-zero probe, .3/.4):** real `SELF.fetch` WS upgrade + `createRoom`; inside `runInDurableObject` assert `getWebSockets().length > 0` (the exact spike regression — proves hibernation wires the probe); fire alarm → summary preserved + alarm re-armed.
  - [x] **Test C+ (armed-on-activity .1/.5 + debounce .5):** a fresh connection arms the alarm to ~`now + IDLE_TTL_MS` (asserted against the config constant, within a 60s window — no wall-clock literal); a second activity within the debounce window does not move `getAlarm()`.
  - [x] RED→GREEN honored: all 4 failed first for the right reasons (probe read 0; alarm null), green after implementation.

- [x] **Task 6 — Integration check: hibernation actually accepts via the native API (AC: #2)**
  - [x] Added `server/test/integration/gc-hibernation-probe.mjs` (standalone, non-`*.test.ts` name — avoids the silent-zero-coverage trap; uses Node's global `WebSocket`, no new dep) + `test:integration:gc` script. It drives a real WS upgrade → `createRoom` → second join over `wrangler dev`, asserting the hibernation-accept path upgrades and carries traffic (the "acceptWebSocket() is wired" precondition). The `getWebSockets()`-non-zero assertion + the 3h-TTL self-delete are covered deterministically in the pool (Test B / Test A via `runDurableObjectAlarm`) — documented in the script so neither layer over-claims.
  - [x] Empirical note: the in-runtime probe is confirmed non-zero with a live socket by pool Test B (hibernation confirmed). The `getConnections()` fallback was NOT needed.

- [x] **Task 7 — Gate sweep (AC: #7)**
  - [x] `npm run typecheck` 0/0; `npm run lint` clean (GATE-1 `.send`/`.broadcast` + GATE-2 `rules/**` purity untouched — GC lives in `table-server.ts`); `npm test` server **31/31** (27 + 4 new GC) + client **42/42**; `npm run build` emits the warm PWA manifest (11 precache entries). No new runtime dependency (only a package.json *script* added). Ended in `review`.

### Review Findings

_Code review 2026-06-20 (Blind Hunter + Edge Case Hunter + Acceptance Auditor). 3 decision-needed resolved → 5 patch, 2 deferred, 5 dismissed as noise._

_Decision resolutions: (A) switch probe to `[...this.connections()].length` → patch. (B) defer clean-close early-GC as a known limitation. (C) accept the AC-1.11.2 split-responsibility verification as-is → dismissed._

- [x] [Review][Patch] Switch probe to OPEN-filtered `[...this.connections()].length` and fix the equivalence comment [server/src/table-server.ts onAlarm] — raw `ctx.getWebSockets().length` counts CLOSING sockets, but partyserver's `getConnections()` filters `READY_STATE_OPEN` (`node_modules/partyserver/dist/index.js:146,187`). If the alarm fires after a client begins closing but before teardown, the raw probe reads ≥1, preserves a now-empty room, and waits another full `IDLE_TTL_MS`. The in-code comment claiming the two probes are "correct regardless of accept mode" is inaccurate (they differ on closing sockets). Fix (Decision A): use `[...this.connections()].length` (the documented AC-1.11.2 fallback, OPEN-filtered → robust) and correct the comment.
- [x] [Review][Patch] Fire-and-forget `setAlarm` advances `#lastAlarmArmedAt` before the write succeeds [server/src/table-server.ts armIdleAlarm] — the stamp is set synchronously then `void setAlarm(...).catch(()=>{})`. On a transient (swallowed) `setAlarm` rejection, no alarm is scheduled yet the room reads as "armed," so the debounce early-returns every subsequent activity for up to `ALARM_REARM_DEBOUNCE_MS` (5 min) — the room can sit with NO GC alarm. The comment says "next activity re-arms," but the debounce actively prevents it. Fix: advance the stamp only after the write resolves (`.then`), or reset it in `.catch`.
- [x] [Review][Patch] LIVE-room test reads `getWebSockets()` once with no poll [server/src/table-server-gc.do.test.ts ~L86] — a single synchronous `getWebSockets().length` read, while the sibling 1.7 test in the same diff was reworked to a bounded poll precisely because hibernation staggers WS delivery. Same flake risk. Fix: wrap the read in the same bounded poll.
- [x] [Review][Patch] `firstEvent` never detaches its `message` listener [server/src/table-server-gc.do.test.ts ~L48] — `addEventListener("message", ...)` with no `{ once: true }` / `removeEventListener`, so each call leaks a permanent listener; in the debounce test the leaked listener fires again on later sends. Fix: use `{ once: true }` (and remove the error listener too).
- [x] [Review][Patch] Debounce test proves the mechanism only indirectly [server/src/table-server-gc.do.test.ts re-arm-is-debounced] — it asserts `secondAlarm === firstAlarm` but never asserts the positive case (an arm *after* the window moves the alarm) nor `setAlarm` call count, so it would pass even if arming were broken to never re-arm. Fix: add the positive-case assertion to bracket the debounce.
- [x] [Review][Defer] `onClose` never shortens the alarm — a cleanly-emptied room holds its Room Code for up to ~3h [server/src/table-server.ts onClose] — deferred (Decision B), known limitation. The last clean departure does nothing to the alarm, so the code is reclaimed only when the idle TTL fires. The 3h backstop still bounds it and code-reclaim pressure is low for a party game; revisit if prompt code-reuse becomes a requirement (add early-GC / alarm-shorten on the last onClose).
- [x] [Review][Defer] Ghost/never-closing socket defeats the 3h backstop [server/src/table-server.ts onAlarm preserve branch] — deferred, platform-semantics. Each alarm re-arms `now + IDLE_TTL_MS`, so a hibernated socket whose TCP never cleanly closes (the architecture-D7 backstop case) keeps resetting the TTL from `now`; the room is only reclaimed when the runtime evicts the ghost from `getWebSockets()`. Inherent to CF socket-eviction behavior, not introduced incorrectly by this change; track as a known limitation of the "3h backstop" semantics.

## Dev Notes

### What this story is (and is NOT)

- **IS:** the zero-cost backstop — a per-DO `ctx.storage` alarm that self-deletes an idle, empty Table (releasing its Room Code), plus **enabling partyserver Hibernation** so the connection probe is accurate AND idle rooms stop accruing GB-s. This closes the last open launch-gate dependency (NFR-3 / SM-7 / Epic 0 Story G2). It is the server-side counterpart the Story 1.1 spike was run to de-risk.
- **IS NOT:** any reconnection flow (AR-12 stays deferred — `maxRetries:0` client-side untouched), any change to the phase machine / game logic (Epics 2–4), any central reaper/cron, or any client UI. No card data is ever in the probe path (SM-6 unaffected — the probe counts sockets, never reads state).

### The single most important fact (the spike correction — do not re-derive)

`ctx.getWebSockets()` returns **ONLY** sockets accepted via the Hibernation API (`ctx.acceptWebSocket()`). A socket accepted in **standard mode** (partyserver's default *unless* `static options.hibernate` is true) is a live connection that is **invisible** to `ctx.getWebSockets()` — it reads **0 for a room full of active players**. The Story 1.1 spike deployed a real Worker+DO, opened a live socket, and observed `ctx.getWebSockets().length === 0` (`1-1-spike-findings.md` lines 63–76; spike code `spike/src/table-server.ts:202-234`). An uncorrected probe would therefore **delete a live room** — the exact inverse of the GC intent, a data-loss bug. **This story's chosen fix (per build decision): enable Hibernation so the probe is accurate** (and verify it — AC-1.11.2). The `getConnections()` count is the documented fallback only if that verification fails.

### Reuse — do NOT reinvent (anti-wheel-reinvention)

Everything below already exists and MUST be reused, not re-built:

| Need | Use | Location |
|---|---|---|
| Idle TTL constant (3h) | `IDLE_TTL_MS` | `shared/src/config.ts:22` (already exported from `@trash/shared`) |
| The DO class + storage handle | `TableServer` / `get storage()` → `this.ctx.storage` | `server/src/table-server.ts:30,35-37` |
| Typed connection iteration | `this.getConnections<ConnectionState>()` (wrapped as `connections()`) | `server/src/table-server.ts:117-119` |
| Load the durable summary | `loadSummary(storage)` → `DurableSummary \| undefined` | `server/src/persistence.ts:56-58` |
| The single storage key | `TABLE_KEY = "table"` | `server/src/persistence.ts:12` |
| Durable summary shape (for seeding tests) | `DurableSummary` `{code,phase,hostId,startingLives,players[{id,name,lives,isAlive,seatIndex}],phaseToken}` | `server/src/persistence.ts:23-30` |
| Seed DO state in tests | `runInDurableObject(stub, (i,state)=>state.storage.put("table",…))` | `table-server.do.test.ts:237-251`; `env.test.d.ts` |
| Drive a real socket in tests | `SELF.fetch(url,{Upgrade:"websocket"})` + `ws.accept()` | `table-server.do.test.ts:20-49` |
| Fire the alarm in tests | `runDurableObjectAlarm(stub)` → `Promise<boolean>` | `cloudflare:test` (add to `env.test.d.ts`) |
| Partyserver alarm override point | `onAlarm()` (partyserver's `alarm()` calls it after init) | `node_modules/partyserver/dist/index.d.ts:373-374`, `index.js:915-920` |
| Hibernation toggle | `static options = { hibernate: true }` | `node_modules/partyserver/dist/index.d.ts:209-210` |

### Files being modified — current state & what to preserve

- **`server/src/table-server.ts`** — the DO class. Currently: `onStart` (hydrate from summary via `reconcileSummaryToState`), `onConnect` (empty — first projection is intent-driven), `onMessage` (parse→dispatch), `onClose` (presence flip + fan-out), `connections()` wrapper, `get storage()`. **Add:** `static options = { hibernate: true }`, `onAlarm()`, the `armIdleAlarm()` private + `#lastAlarmArmedAt` field, and the `armIdleAlarm()` calls in `onConnect`/after-dispatch. **Preserve:** every existing handler contract (the createRoom/join round-trip test must stay green); the "instance fields are cache-only" invariant — `#lastAlarmArmedAt` is a cache field and may be `null` after wake (safe). Flip the lines 13–16 HIBERNATION comment from "deliberately NOT enabled … 1.11's job" to "enabled in 1.11" while keeping the spike rationale.
- **`shared/src/config.ts`** — currently exports `IDLE_TTL_MS = 3*60*60*1000` (line 22) and the other tunables (`ROOM_CODE_*`, `MIN/MAX_LIVES`, etc.). **Add** `ALARM_REARM_DEBOUNCE_MS`. Keep the existing exports and the package barrel export untouched.
- **`server/src/env.test.d.ts`** — currently declares the `cloudflare:test` module with `env`, `SELF`, `runInDurableObject`. **Add** `export function runDurableObjectAlarm(stub: DurableObjectStub): Promise<boolean>;` so the new test typechecks.

### Critical correctness / privacy / cost constraints

- **GATE-2 (`rules/**` purity) — the GC code must NOT live in `rules/`.** The alarm/probe legitimately uses `Date.now()`, `this.ctx`, `crypto`-free but `this.`-based access — all banned in `server/src/rules/**` by the ESLint purity gate (Story 1.2 AC). It belongs in `table-server.ts` (the DO/IO layer), which is exempt. Putting it in `rules/` would fail lint. *(Source: 1-10 GATE-1/GATE-2 scope note; eslint.config.js.)*
- **GATE-1 (`.send`/`.broadcast` ban) is untouched** — GC adds no egress; the only `.send` exemptions stay `server/src/push-state.ts`, `client/src/socket.ts`, `server/src/**/*.do.test.ts`. The probe/alarm never call `.send`.
- **SM-6 privacy is not at risk** — the probe counts sockets (`getWebSockets().length`), never reads `TableState.round.hands`. If a debug probe endpoint is added for the Task-6 integration check, it returns counts only (model on the spike's `gc-probe`), never any card value — and it must not become a production egress path.
- **Self-delete must release the code, not just clear cache.** `deleteAll()` on `ctx.storage` clears the persisted `"table"` key — that is what makes the next `createRoom` addressing the same `idFromName(code)` find an unclaimed DO (claim-on-create: `handlers.ts:76-84` checks `loadSummary` for an existing claim). Also null `this.table` so the in-memory cache doesn't outlive the storage. *(Architecture D7; handlers claim-on-create.)*
- **Over-arming is safe; under-arming is the only risk.** The 3h TTL is "safe-by-margin under Hibernation (over-long costs nothing; only too-short is risky)" — D7 ASSUMPTION (PRD OQ-6). So the debounce no-op (skipping a re-arm) is fine, and a `null` `lastArmedAt` after wake that triggers an immediate re-arm is also fine.

### Hibernation: what changes and what to verify

- `static options = { hibernate: true }` makes partyserver accept sockets via the native `ctx.acceptWebSocket()` instead of standard `accept()`. The architecture and spike both flag: **verify** that this actually wires `acceptWebSocket()` for *this* partyserver version (AC-1.11.2) — the test is "an open socket appears in `ctx.getWebSockets()`." This can only be exercised against `wrangler dev` (the pool can't drive a real upgrade+hibernation roundtrip — vitest.config.ts/AR-14), hence Task 6.
- Billing payoff: GB-s only stop accruing for **hibernated** connections (CF DO websockets, web-verified 2026-06-19) — this is half of why NFR-3/SM-7 holds. The GC sweep is the other half (orphaned rooms whose sockets never cleanly close → the 3h TTL backstop).
- The existing handlers (`onMessage`/`onClose`) operate on partyserver's `Connection` abstraction, which partyserver maps onto hibernation-accepted sockets — so their contracts don't change. Confirm by re-running `table-server.do.test.ts` after flipping the option.

### Test harness conventions (from 1.6/1.7/1.10)

- **Two vitest projects:** `*.test.ts` → node ("rules"); `*.do.test.ts` → `@cloudflare/vitest-pool-workers` ("do"). Any other suffix runs in **no** project (silent zero coverage — documented trap). GC tests are `table-server-gc.do.test.ts`.
- **`runDurableObjectAlarm(stub)`** fires the scheduled alarm immediately and returns `true` if one ran — this is how you test the 3h alarm without wall-clock. It only works for DOs in the `main` worker (TableServer qualifies).
- **`runInDurableObject(stub, (instance, state) => …)`** gives storage access for seeding/asserting (`state.storage.put/get/getAlarm`). Seeding pattern is exactly Story 1.7's late-join test (`table-server.do.test.ts:237-251`).
- **Real socket** pattern: `SELF.fetch(http://example.com/parties/table/<code>, {headers:{Upgrade:"websocket"}})` → `res.webSocket` → `ws.accept()` → listen for `message`. Address lowercase `table` namespace (partyserver kebab-cases the binding name; `index.ts:13-22`).
- RED→GREEN, full gate sweep, counts in the Dev Agent Record, end in `review` — match every prior Epic-1 story.

### Project Structure Notes

- GC logic stays in `server/src/table-server.ts` (the watch-list says peel into `connections.ts` only if WS-lifecycle code grows; `onAlarm` + `armIdleAlarm` is modest — keep it here, re-evaluate later). The architecture's directory map names `table-server.ts` as the alarm-arm/re-arm home.
- New test file: `server/src/table-server-gc.do.test.ts`. New integration script: `server/test/integration/gc-hibernation-probe.mjs` (sibling of `multi-device-join.mjs`, run via `npm run test:integration --workspace=server` against a live `wrangler dev`).
- `ALARM_REARM_DEBOUNCE_MS` belongs in `shared/src/config.ts` (one home for tunables) even though only the server reads it — mirrors `IDLE_TTL_MS`.

### Previous-story intelligence (Story 1.10 — immediate predecessor) & spike (Story 1.1)

- 1.10 was a **client** story (Home/Lobby surfaces + live data pipe); it did not touch the server DO. Server suite baseline to keep green: **27/27**. The build sweep discipline (RED-first, full gate sweep, counts recorded, end in `review`) is the pattern to match. *(1-10 Dev Agent Record.)*
- The **Story 1.1 spike** is the direct source of this story's risk: GO recorded, with **one required correction carried into 1.11** — "the GC probe must use partyserver Hibernation (so `ctx.getWebSockets()` is accurate) or switch to `getConnections()`." The spike's follow-up note: *"[Story 1.11] GC correction … re-confirm idle GB-s billing. Blocks the $0 gate (SM-7) if wrong."* This story discharges that follow-up. *(1-1-spike-findings.md AC3 verdict + follow-ups; the spike's `alarm()` prototype is `spike/src/table-server.ts:225-234`.)*
- Spike `alarm()` shape to mirror (adapted to `onAlarm` + the 3h config + `deleteAll`):
  ```ts
  // spike/src/table-server.ts:225-234 (prototype — uses ctx.getWebSockets())
  async alarm() {
    const sockets = this.ctx.getWebSockets().length;
    if (sockets === 0) { /* real: await this.ctx.storage.deleteAll(); */ }
    else { await this.ctx.storage.setAlarm(Date.now() + IDLE_TTL_MS); }
  }
  ```

### Git intelligence (recent work patterns)

- `f43c698` Story 1.10 (Home/Lobby + live pipe) — client-only; server untouched.
- `d40cf92` Story 1.9b (PWA shell, Button, voice) — client.
- Epic-1 server stories (1.6 `82c13b3`+, 1.7, 1.8) established: claim-on-create in `handlers.ts`, `persistence.ts` summary round-trip, the `*.do.test.ts` pool-workers patterns, and the deliberate "hibernation is 1.11's job" deferral baked into `table-server.ts` comments. This story is the planned completion of that seam.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.11 (lines 458-488)] — the six AC clauses (debounced alarm, hibernation precondition, self-delete-only-empty, single-live-connection non-zero, testable-without-3h, no-central-reaper).
- [Source: _bmad-output/planning-artifacts/architecture.md#D7 (lines 437-477)] — Room Code + GC/TTL: 3h idle, debounced re-arm, self-delete only with no active connections, the `getWebSockets()` vs `getConnections()` spike correction, hibernation requirement, GB-s/idle-billing, the 3h-TTL-safe-by-margin assumption.
- [Source: _bmad-output/planning-artifacts/architecture.md#Cross-Cutting-Concerns #6 (lines 131-135)] — zero-cost depends on Hibernation + GC; GB-s only stop for hibernated connections.
- [Source: _bmad-output/planning-artifacts/architecture.md#D2 (lines 346-363)] — durable summary shape + the single `"table"` key (for test seeding) + D2.1 reload coercion (unchanged here, but `onStart` already handles it).
- [Source: _bmad-output/planning-artifacts/architecture.md#AR-14 / vitest projects] — two projects; connection-lifecycle/hibernation exercised against `wrangler dev`, not the pool.
- [Source: _bmad-output/implementation-artifacts/1-1-spike-findings.md (lines 63-111)] — the empirical `getWebSockets()===0` finding, the zero-connection `wouldSelfDelete:true` confirmation, the GO-with-correction verdict, the Story-1.11 follow-up that blocks SM-7.
- [Source: server/src/table-server.ts] — class (line 30), `get storage()` (35-37), `onStart` hydrate (45-50), `onConnect` empty (62-66), `onMessage` (75-87), `onClose` (101-108), `connections()` (117-119), the HIBERNATION-deferred comment (13-16) to flip.
- [Source: server/src/persistence.ts] — `TABLE_KEY="table"` (12), `DurableSummary` (23-30), `loadSummary` (56-58), `persistSummary` (51-53).
- [Source: server/src/handlers.ts:76-84] — claim-on-create (why `deleteAll` releasing the key matters for re-claim).
- [Source: server/src/index.ts:13-22] — Worker fetch entry, `routePartykitRequest`, lowercase `table` namespace addressing.
- [Source: server/vitest.config.ts] — two projects + the `*.test.ts`/`*.do.test.ts` naming trap; pool can't drive real WS/hibernation.
- [Source: server/src/env.test.d.ts] — `cloudflare:test` declaration to extend with `runDurableObjectAlarm`.
- [Source: server/src/table-server.do.test.ts:20-49,237-251] — `SELF.fetch`+`ws.accept()` real-socket helper; `runInDurableObject` state-seeding pattern.
- [Source: shared/src/config.ts:22] — `IDLE_TTL_MS = 3*60*60*1000`; add `ALARM_REARM_DEBOUNCE_MS` here.
- [Source: node_modules/partyserver/dist/index.d.ts:209-210,373-374 + index.js:915-920] — `static options.hibernate`, `onAlarm()` override point (partyserver `alarm()` → `#ensureInitialized()` → `onAlarm()`).
- [Source: node_modules/@cloudflare/vitest-pool-workers — cloudflare:test exports] — `runDurableObjectAlarm`, `runInDurableObject`, `SELF`, `env` all exported.
- [Source: spike/src/table-server.ts:202-234] — the spike's `gc-probe` HTTP handler + prototype `alarm()` to mirror.

## Dev Agent Record

### Agent Model Used

Opus 4.8 (1M context) — `us.anthropic.claude-opus-4-8[1m]`

### Debug Log References

- **RED confirmed (all 4 GC tests):** before implementation, `table-server-gc.do.test.ts` failed exactly as predicted — the live-connection probe read `0` (no hibernation: `expected 0 to be greater than 0`), and "alarm armed on activity" / debounce read `null` (no `armIdleAlarm`). This is the precise Story-1.1 spike defect (standard-accept sockets invisible to `getWebSockets()`), so the RED proves both the test and the bug it guards against.
- **Hibernation surfaced ONE pre-existing test-timing assumption (NOT a correctness regression):** `table-server.do.test.ts > AC-1.7.5 concurrently-fired joins` began reading 3 seats instead of 6 after enabling hibernation. Root cause: the test drained "one event per guest" as a proxy for "all joins committed," but under hibernation accept the WS upgrade/delivery pipeline is staggered, so a guest's first received event can be an interleaved fan-out from an *earlier* join rather than its own — the storage read raced ahead of the later joins. The joins themselves are all correct (verified: polling the authoritative roster reaches the full 1+N). **Fix was TEST-ONLY** — replaced the one-event-per-guest drain with a bounded poll of the DO's persisted roster until it reaches `1+N`, then assert the unchanged invariants (contiguous 0..N, no dupes, no overflow). Stable across 3 reruns. No production handler changed.
- **`armIdleAlarm` is fire-and-forget** (`void setAlarm(...).catch(()=>{})`): arming the GC backstop must never block or reject the connection/message path. A failed arm just means the next activity re-arms; the 3h TTL is a backstop, not a hard deadline (D7: over-arming is harmless, only under-arming is risky).
- **Probe choice empirically validated in-runtime:** pool Test B asserts `ctx.getWebSockets().length > 0` with a live hibernation-accepted socket — confirming hibernation wires `acceptWebSocket()`, so the `getConnections()` fallback (AC-1.11.2) was not needed.

### Completion Notes List

- **GC self-delete (AC-1.11.3/.6):** `TableServer.onAlarm()` probes `ctx.getWebSockets().length`; `0` → `ctx.storage.deleteAll()` (clears the single `"table"` key, releasing the Room Code for claim-on-create re-use) + nulls the `this.table` cache; non-zero → re-arms the idle alarm. Solely the DO's own alarm — no central reaper.
- **Hibernation enabled (AC-1.11.2):** `static options = { hibernate: true }` — sockets accept via native `ctx.acceptWebSocket()`, making `getWebSockets()` an accurate probe AND stopping idle GB-s (NFR-3/SM-7). The class header comment was flipped from "deliberately NOT enabled" to record the enablement + retain the spike rationale and the `getConnections()` fallback.
- **The spike regression is guarded (AC-1.11.4):** pool Test B asserts the probe reads non-zero with one live socket — the exact case the Story-1.1 spike caught reading 0 under standard accept. It fails unless hibernation is on, so it's a standing guard against a future regression of the accept mode.
- **Debounced arm on activity (AC-1.11.1):** `armIdleAlarm()` (called from `onConnect` + post-`dispatch`) re-arms `IDLE_TTL_MS` only outside the `ALARM_REARM_DEBOUNCE_MS` (5 min) window — no per-intent write amplification. Both constants live in `shared/src/config.ts`.
- **Tested without 3h wall-clock (AC-1.11.5):** all timing is exercised via `runDurableObjectAlarm(stub)` (fires the scheduled alarm immediately) + `state.storage.getAlarm()` reads, using the imported config constants, never literals.
- **Scope honored:** no reconnection flow (AR-12 deferred; client `maxRetries:0` untouched), no phase-machine/game changes, no client UI, no central reaper, no new runtime dependency (only a `test:integration:gc` script). SM-6 unaffected — the probe counts sockets, never reads card state.
- **Gates (AC-1.11.7):** typecheck 0/0; lint clean (GATE-1/GATE-2 untouched); server 31/31 (27 + 4 GC) + client 42/42; build emits the warm PWA manifest (11 precache entries).

### File List

**New:**
- `server/src/table-server-gc.do.test.ts` (GC alarm + probe + debounce tests, pool-workers project)
- `server/test/integration/gc-hibernation-probe.mjs` (`wrangler dev` hibernation-accept check, AC-1.11.2)

**Modified:**
- `shared/src/config.ts` (added `ALARM_REARM_DEBOUNCE_MS`)
- `server/src/table-server.ts` (enabled Hibernation `static options`; added `onAlarm` GC handler + connection probe + self-delete; `#lastAlarmArmedAt` + debounced `armIdleAlarm` armed on connect/post-dispatch; flipped HIBERNATION header comment)
- `server/src/env.test.d.ts` (declared `runDurableObjectAlarm` on the `cloudflare:test` module)
- `server/src/table-server.do.test.ts` (TEST-ONLY: AC-1.7.5 concurrency test now polls the authoritative roster instead of draining one-event-per-guest — hibernation staggers WS delivery; invariants unchanged)
- `server/package.json` (added `test:integration:gc` script — no dependency change)
- `_bmad-output/implementation-artifacts/1-11-room-garbage-collection-zero-cost-backstop.md` (frontmatter `baseline_commit`; Status; tasks; Dev Agent Record)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (1-11 → in-progress → review)

## Change Log

| Date | Change |
|---|---|
| 2026-06-20 | Story 1.11 implemented: (1) enabled WebSocket Hibernation (`static options = { hibernate: true }`) so the GC probe `ctx.getWebSockets()` is accurate and idle GB-s stop accruing (NFR-3/SM-7). (2) `onAlarm` GC handler — probe active connections; self-delete via `deleteAll()` (releasing the Room Code) only when none, else re-arm; solely the DO's own alarm, no central reaper. (3) Debounced `armIdleAlarm` (`IDLE_TTL_MS` 3h, `ALARM_REARM_DEBOUNCE_MS` 5min) armed on connect + post-dispatch. (4) Pool tests via `runDurableObjectAlarm` (self-delete, preserve-live-room + non-zero probe = the spike regression guard, armed-on-activity, debounce) + a `wrangler dev` hibernation-accept integration check. Fixed a TEST-ONLY timing assumption in the 1.7 concurrency test (hibernation staggers WS delivery → poll the authoritative roster). Gates: typecheck 0/0, lint clean, server 31/31 + client 42/42, build emits warm PWA manifest. Status → review. |
| 2026-06-20 | Code review (3-layer adversarial): no AC violations. Resolved 3 decision-needed (A: probe → OPEN-filtered `[...this.connections()].length`; B: clean-close early-GC deferred as a known limitation; C: AC-1.11.2 split-responsibility verification accepted). Applied 5 patches — (1) probe swapped to `connections()` so a CLOSING socket is no longer miscounted as active (raw `getWebSockets()` does not filter readyState) + corrected the equivalence comment; (2) `armIdleAlarm` now advances `#lastAlarmArmedAt` only after `setAlarm` resolves, so a transient swallowed failure no longer disarms GC for a debounce window; (3) the live-room probe read is now a bounded poll (asserts both `getWebSockets()` and `connections()` non-zero); (4) `firstEvent` listeners use `{ once: true }` (no leak across kept-open sockets); (5) debounce test bracketed with positive arming assertions. Gates re-run green: typecheck 0/0, lint clean, server 31/31. Status → done. |
