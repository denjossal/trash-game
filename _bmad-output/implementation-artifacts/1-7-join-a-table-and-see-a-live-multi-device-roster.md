---
baseline_commit: 2df8b90
---

# Story 1.7: Join a Table and see a live, multi-device roster

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Player,
I want to enter the Room Code and immediately see myself and everyone else appear,
so that the whole table gets in and ready within the activation window.

## Acceptance Criteria

**AC-1.7.1 — `joinRoom{code,name,sessionToken?}` in `lobby` adds the Player; EVERY connected device's roster updates live.**
Given a valid (claimed, `lobby`-phase) Room Code and a display name,
When a Player sends `joinRoom{code,name,sessionToken?}`,
Then they are appended to `players[]` (next `seatIndex`, `isAlive: true`, `isConnected: true`, `lives: state.startingLives`), the durable summary is persisted, and a fresh `tableState` is **re-projected to EVERY connection** (`for (const c of this.getConnections()) pushState(c, host.table, c-playerId)`) so the new Player AND all existing devices see the updated roster — the joining device included (it learns its own `you.playerId`). *(FR-2, FR-3; epics.md#Story-1.7 lines 370–372; architecture.md round-trip line 523.)*

**AC-1.7.2 — Invalid / expired Room Code → `error{reason:"bad-code"}`; no partial/ghost join.**
Given an invalid or expired Room Code (the addressed DO has never been claimed — `host.table === null` AND no persisted `"table"` summary — or was GC'd, which also leaves empty storage),
When a Player attempts to join,
Then the server returns `error{reason:"bad-code"}` to THAT connection only, NO Player is appended (no partial/ghost roster entry), NO summary is written, and no other connection is notified. The Player can retry with a corrected code. *(epics.md#Story-1.7 lines 374–376; shared/src/types.ts ErrorReason "bad-code".)*

**AC-1.7.3 — Late join allowed in `lobby` ONLY; a game past the first Deal refuses the join; a leaver stops taking Turns (no reconnection in MVP).**
Given a Table whose `phase` is NOT `lobby` (a game already past the first Deal),
When a Player attempts to join with the code,
Then the join is refused with a typed `error` (`phase-illegal`) — no joining a game in progress; late join is allowed in `lobby` only. A Player who leaves mid-game stops taking Turns (their `isConnected` flips false on socket close); there is NO reconnection in MVP (the resumption FLOW is deferred — only identity issuance ships). *(epics.md#Story-1.7 lines 378–380; FR-3; architecture.md D4 line 399 "joinRoom is gated to lobby phase only".)*

**AC-1.7.4 — Activation gate (SM-4): ~6 devices joining within ~30s — every device's roster reflects every join/leave live, no stale lobby anywhere.**
Given ~6 devices joining the same Table within ~30 seconds (the activation gate),
When each device joins or leaves,
Then every device's roster reflects every change live, with no stale lobby on any device — verified by an **integration test against `wrangler dev`** with multiple concurrent connections (the pool-workers `do` project CANNOT drive real concurrent WS upgrades — documented in vitest.config.ts). This is the single biggest pre-mortem finding: the activation gate is a multi-device-concurrency PROPERTY, not a single-device unit test. *(Pre-mortem B — SM-4; epics.md#Story-1.7 lines 382–384, lines 164.)*

**AC-1.7.5 — Concurrent joins near the seat cap are correct via DO single-threaded serialization + lightweight validation (NOT the Epic 2 two-scope guard).**
Given two (or more) devices joining the same Table at the same instant near the seat cap (`MAX_PLAYERS = 20`),
When the concurrent joins are processed,
Then correctness is guaranteed by the Durable Object's single-threaded serialization of `onMessage` turns + the join handler's lightweight state-shape validation (NOT the formal two-scope guard, which would no-op in `lobby` phase) — an **explicit concurrent-join test** asserts no seat-cap overflow and no duplicate `seatIndex`, and the lobby's reliance on DO serialization + lightweight validation is documented so Epic 2's guard never reroutes lobby actions. A join that would exceed `MAX_PLAYERS` is refused with `error{reason:"room-full"}`. *(Winston review; Decision #1; epics.md#Story-1.7 lines 386–388.)*

## Tasks / Subtasks

> **TDD order (house style proven in 1.4/1.5/1.6): write the failing test, watch it RED against the current `phase-illegal` stub route, then GREEN it.** The join round-trip + fan-out is exercised by **`table-server.do.test.ts`** (extend the existing file — the `do` / pool-workers project can drive `SELF.fetch(..., {Upgrade:"websocket"})` against a real DO). The multi-device concurrent-join activation gate (AC-1.7.4) is an **integration test against `wrangler dev`** under `server/test/integration/` (the pool CANNOT drive real concurrent WS). The single-DO-turn concurrent-join correctness (AC-1.7.5) can be asserted in the `do` project by firing N joins on N sockets and checking final-roster invariants.

- [x] **Task 1 — Implement `handleJoinRoom` in `handlers.ts` (AC: 1, 2, 3, 5)** *(test-first: extended `table-server.do.test.ts` with the join assertion, proved it RED against the `default → phase-illegal` route — join returned `error` not a 2-player `tableState` — then GREEN)*
  - [x] Read `server/src/handlers.ts` first. Added `handleJoinRoom(host, intent): Promise<string>` + `markDisconnected` helper. Updated the SCOPE header (1.6 → 1.7).
  - [x] **PAYLOAD SHAPE GUARD** — rejects missing payload / non-string `code`/`name` with `IntentError("phase-illegal")` (mirrors `handleCreateRoom`).
  - [x] **bad-code (AC-1.7.2):** `host.table === null` AND `loadSummary === undefined` ⇒ `IntentError("bad-code")`. The `table===null`-but-summary-exists branch also throws `bad-code` (unreachable in practice — onStart-before-onMessage hydrates; documented). No append before the check.
  - [x] **phase-illegal / late-join (AC-1.7.3):** `host.table.phase !== "lobby"` ⇒ `IntentError("phase-illegal")`.
  - [x] **room-full (AC-1.7.5):** `players.length >= MAX_PLAYERS` ⇒ `IntentError("room-full")`. `MAX_PLAYERS` imported by name from `@trash/shared`.
  - [x] **APPEND (sole state-assignment site):** `issueIdentity()` → push `Player {id, name, lives: startingLives, isAlive:true, isConnected:true, seatIndex: players.length}`, then `persistSummary`. seatIndex = current length (append-only, immutable).
  - [x] **APPEND ATOMICITY:** in-memory cap-check + push are synchronous (the commit point); the only awaits are `loadSummary` (before the decision) and `persistSummary` (after the push). No yield between cap-decision and append — commented. Proven by the concurrent-join test (no duplicate seatIndex / no overflow).
  - [x] **sessionToken:** accepted but NOT resumed (fresh identity + seat); documented as the deferred §11.3 reconnection seam. No new ServerEvent; token never enters a projection (SM-6 test).

- [x] **Task 2 — Route `joinRoom` in `dispatch.ts` + fan out to EVERY connection (AC: 1, 2, 3, 5)**
  - [x] Added `case "joinRoom":` before `default`. On success: `setState({playerId})` then `fanOut(host.connections(), host.table!)`. Updated the SCOPE header (joinRoom live; gameplay intents still `default`-rejected).
  - [x] **Per-connection playerId for fan-out:** `fanOut` (in push-state.ts) reads each connection's stamped `playerId` from `connection.state`; a not-yet-identified socket (`state===null`) projects with an empty playerId → projectStateFor's spectator fallback (no `you.hand`, isAlive/isConnected false). Documented.
  - [x] **`TableHost` connection access:** added `connections()` to `TableHost` (named distinctly from partyserver's generic `getConnections<TState>()` to avoid the override-variance trap). The fan-out LOOP lives in `push-state.ts` (`fanOut`) — the sole `.send` module; dispatch orchestrates, handlers stay transport-free.
  - [x] Single try/catch unchanged: `bad-code`/`room-full`/`phase-illegal` become a targeted `error` to the joining connection only.

- [x] **Task 3 — Late-connection re-projection (`onConnect`) + presence on leave (`onClose`) in `table-server.ts` (AC: 1, 3)**
  - [x] **`onConnect`:** kept empty + documented — no projection on bare connect (a fresh socket has no playerId until its create/join stamps it; the join handler's fan-out includes the new socket). Bare-connect re-projection of an identified socket = the deferred reconnection FLOW.
  - [x] **`onClose` (presence):** added `onClose(connection)` → reads stamped playerId → `markDisconnected(this, playerId)` (in-memory `isConnected:false`, NO persist — presence is ephemeral, excluded from the durable summary) → `fanOut` to every remaining device. Record retained, `isAlive` unchanged. Transport-only; routes egress through push-state.ts. Proven by the leave-presence DO test.
  - [x] **State-mutation boundary:** the presence flip lives in `handlers.markDisconnected` (the single state-mutation module), called from onClose — `host.table` mutation stays in one place even though presence has no Intent. `connections()` typed wrapper added on the class.

- [x] **Task 4 — Client: wire `joinRoom` send into `socket.ts` (AC: 1, 2, 3)**
  - [x] Added `joinRoomAndListen(code, name)`: `createSocket(code)` → on open send `buildJoinRoomIntent` → resolve on first `tableState`; surfaces the typed `error` reason (bad-code/room-full/phase-illegal) to the caller — does NOT auto-retry (a join error is user-actionable, unlike createRoom's transparent claim retry). Reuses the createRoomWithRetry teardown/timeout/`settled`-guard pattern (no listener leak / no hang).
  - [x] **Fail-loud `VITE_WS_URL` (deferred-work #48):** `createSocket` now throws a clear error when `VITE_WS_URL` is unset/empty instead of constructing a dead `host:""` socket — owned by the live-connection flows (create + join).
  - [x] Reconnect stays DISABLED (`maxRetries:0`); 1.5/1.6 helpers preserved; NOT mounted into `App.svelte`.
  - [x] **No client test this story** — verified by `svelte-check`/`tsc -b` (99 files, 0 errors) + `vite build` + structural review. Join round-trip covered server-side by the DO test.

- [x] **Task 5 — Extend `table-server.do.test.ts`: join round-trip + bad-code + late-join + room-full + concurrent invariants + presence + SM-6 (AC: 1, 2, 3, 5)**
  - [x] **AC-1.7.1 join + fan-out:** create on socket A (stays open), join on socket B → B sees roster 2 / seat 1 / its own `you` (not host) / lives === startingLives; A ALSO receives a fresh projection (roster 2, its own `you.isHost`). The fan-out to EVERY connection, each with its own projection.
  - [x] **AC-1.7.2 bad-code:** join a never-created code → `error{reason:"bad-code"}`, no roster.
  - [x] **AC-1.7.3 late-join:** seeded a `phase:"turns"` summary via `runInDurableObject` (D2.1 coerces to `roundResult` on wake — still `!== "lobby"`); join → `error{reason:"phase-illegal"}`.
  - [x] **AC-1.7.5 room-full + concurrency:** filled to MAX_PLAYERS → next join `error{reason:"room-full"}`; N concurrently-fired joins → DO's durable roster has contiguous seats 0..N, no duplicate seatIndex, no overflow (asserted against the persisted summary, the authoritative source).
  - [x] **Presence (AC-1.7.3):** added a leave test — a guest closes → host sees `isConnected:false`, `isAlive:true`, seat retained.
  - [x] **SM-6:** join payloads (incl. one with an echoed sessionToken) contain no `sessionToken` and not the echoed value.
  - [x] **Routing:** the `do` test's `SELF.fetch("/parties/table/<CODE>")` exercises correct-cased routing; the wrong-cased refusal is in the integration test (deferred-work #24). Added `runInDurableObject` to `env.test.d.ts`.

- [x] **Task 6 — Activation-gate integration test against `wrangler dev` (AC: 4)** *(SM-4 — RUN AND PASSED end-to-end)*
  - [x] Authored `server/test/integration/multi-device-join.mjs` — a standalone Node script (global `WebSocket`, NO new dependency) driving 6 REAL concurrent sockets against a live `wrangler dev`. Asserts: all 6 devices converge to a full roster with contiguous seats (no stale lobby); exactly one device's own projection is `isHost`; a leave propagates `isConnected:false` to every remaining device (seat retained); and the kebab-case routing (wrong-cased `/parties/Table/<code>` refused).
  - [x] **Runner decision:** standalone `.mjs` (NOT `*.test.ts`/`*.do.test.ts` — avoids the silent-zero-coverage trap, deferred-work #31), wired as `npm run test:integration --workspace=server` with a documented two-step manual procedure (`wrangler dev` must be live; `TRASH_WS_URL` overridable). Exits non-zero on any failure and logs its coverage. **Verified: ran against `wrangler dev` on :8787 — all 16 assertions passed.**
  - [x] kebab-case routing assertion (deferred-work #24) included and passing against real `wrangler dev` routing.

- [x] **Task 7 — Green the full gate suite (AC: all)**
  - [x] `npm run typecheck` — shared+server clean; client `svelte-check`/`tsc -b` 99 files / 0 errors. Added `runInDurableObject` to `env.test.d.ts` so the late-join test typechecks.
  - [x] `npm run lint` — 0 errors. GATE 1 intact: the fan-out calls `pushState`/`fanOut` (push-state.ts), no new `.send`/`.broadcast` outside it; client `joinRoomAndListen` rides socket.ts's existing exemption; the `.mjs` harness is outside the `**/*.ts` gate scope. No gate weakened.
  - [x] `npm test` — 20 tests / 6 files (13 prior + 7 new join/presence DO assertions). Integration test runs via its own script.
  - [x] `npm run build` — client build green (28.7 kB); `socket.ts` typechecked via `tsc -b`.

### Review Findings (code review 2026-06-19)

> Adversarial review: Blind Hunter + Edge Case Hunter + Acceptance Auditor. 1 decision-needed, 1 patch, 5 deferred, 7 dismissed as noise/false-positive. Verified independently against source (onStart hydration, identity issuance, project-state spectator fallback).

- [x] [Review][Decision→Patched 2026-06-19] `handleJoinRoom` lacks a re-seat guard — a second `joinRoom` (or `createRoom`-then-`joinRoom`) on the SAME socket double-seats and orphans presence — **FIXED:** added an `alreadySeatedPlayerId` param to `handleJoinRoom` (dispatch passes `connection.state?.playerId`); rejects `phase-illegal` if the socket already holds a seat, symmetric with `handleCreateRoom`'s re-claim guard. New DO test covers both re-join shapes + asserts no phantom seat. typecheck/lint clean, 21/21 tests pass. `handleCreateRoom` rejects re-claim (`host.table !== null → phase-illegal`, handlers.ts:77) but `handleJoinRoom` has no symmetric "this connection already owns a seat" guard. A second join on one socket mints a fresh `issueIdentity()` seat, appends a second `Player`, and `connection.setState({playerId})` (dispatch.ts:52) overwrites the stamp — so on `onClose` only the LAST playerId flips `isConnected:false`; the earlier seat is stuck connected forever (no socket carries its id). One device can also consume multiple seats toward `MAX_PLAYERS`. The shipped `joinRoomAndListen` stops sending after the first `tableState` so it can't trigger this, but the server is authoritative and the wire path is live. [server/src/handlers.ts:292; server/src/dispatch.ts:47]
- [x] [Review][Patch→Applied 2026-06-19] Collapse the redundant `bad-code` inner branch in `handleJoinRoom` — **FIXED:** the `host.table === null` block now throws `bad-code` directly (no `loadSummary` re-read, no dead inner branch); since onStart hydrates before the first onMessage, `table===null` already means "no hydratable summary", and both former arms threw the same error. Also tightened the APPEND ATOMICITY comment (persistSummary is now the sole await). typecheck/lint clean, 21/21 tests pass. [server/src/handlers.ts]
- [x] [Review][Defer] Resolved join socket is returned with NO transport listeners attached — deferred, the consuming surface (1.9a/1.10) is not mounted yet. `joinRoomAndListen` removes the close/error listeners in `cleanup()` before resolving; with `maxRetries:0` a post-join drop is silent. Re-attach a liveness handler when the lobby UI mounts the socket. [client/src/socket.ts:75]
- [x] [Review][Defer] `handleJoinRoom` pushes to the in-memory roster BEFORE `await persistSummary` — deferred, pre-existing pattern (mirrors handleCreateRoom:113); on a persist reject the fan-out never runs (dispatch rethrows first) so no device sees a ghost, but the in-memory cache stays polluted for the next join's `seatIndex = length`. [server/src/handlers.ts:347]
- [x] [Review][Defer] Name content (empty/whitespace/duplicate/oversized) accepted verbatim on the live wire — deferred, documented as the lobby-UI's job (deferred-work #54, Stories 1.9a/1.10). [server/src/handlers.ts:300]
- [x] [Review][Defer] `seatIndex = players.length` collides once any path removes a player — deferred, not reachable in 1.7 (no removal; `markDisconnected` retains the seat). Epic 4 `hostRemovePlayer` will splice the array; switch to a monotonic seat counter then. [server/src/handlers.ts:343]
- [x] [Review][Defer] AC-1.7.4 activation gate is verified ONLY by a manually-run, out-of-CI `.mjs` script — deferred, compliant-as-specified (the pool-workers project cannot drive real concurrent WS, spec line 37), but its green status rests on dev attestation, not a re-runnable gate. Consider a CI smoke job that boots `wrangler dev`. [server/test/integration/multi-device-join.mjs]

## Dev Notes

### What this story is (and is NOT)
- **IS:** the JOIN half of the activation gate — `handleJoinRoom` (append a Player to a `lobby` Table, the sole new state-assignment site), the `joinRoom` dispatch route, and the load-bearing NEW pattern: **fan-out re-projection to EVERY connection** on a roster change (`for (const c of getConnections()) pushState(c, table, c-playerId)` — each recipient gets its OWN `you`). Plus presence on leave (`onClose` → `isConnected:false` → fan-out), `bad-code`/`room-full`/`phase-illegal` handling, the client `joinRoom` send, and the two concurrency proofs: the `do`-project single-turn invariants (AC-1.7.5) and the `wrangler dev` multi-device activation gate (AC-1.7.4 — SM-4, the single biggest pre-mortem finding). [Source: epics.md#Story-1.7 lines 362–388.]
- **IS NOT:** dealing/turns/showdown/host-controls — `deal`/`hostSetLives`/gameplay intents stay routed to the `default` rejection (1.8 / Epics 2–4). Do NOT stub gameplay or the phase machine. `hostSetLives` is Story 1.8 (next). [Source: epics.md#Story-1.8 lines 390–404.]
- **IS NOT:** the two-scope token guard. Lobby join validation is lightweight state-shape checking + DO single-threaded serialization ONLY (Decision #1). joinRoom carries no `phaseToken`/`turnToken` (its payload is `{code,name,sessionToken?}`). `validate.ts` is Epic 2. Document the lobby's reliance on DO serialization so Epic 2's guard never reroutes lobby actions. [Source: architecture.md D4 lines 389–400; epics.md#Story-1.7 line 388.]
- **IS NOT:** reconnection / session resumption. The `sessionToken?` in the frozen `joinRoom` payload is ACCEPTED but NOT resumed — a join always creates a fresh identity + seat in MVP. Resolving token→existing-player is the deferred §11.3 / AR-12 reconnection FLOW. `socket.ts` keeps `maxRetries: 0`. [Source: architecture.md D4 line 400, Deferred reconnection; 1-5 story.]
- **IS NOT:** room GC / hibernation / the idle alarm. Hibernation stays OFF; the `getWebSockets()`-vs-`getConnections()` GC probe + 3h alarm are Story 1.11. Do NOT add `static options = { hibernate: true }` or an alarm. Note `getConnections()` here is the partyserver registry iteration (works in standard mode), used for fan-out — NOT the GC probe. [Source: 1-1-spike-findings AC3; epics.md#Story-1.11; architecture.md line 469.]
- **IS NOT:** the Lobby UI / roster rendering with Lives pips / Host Lives stepper / Deal button — that is Stories 1.9a/1.10 (UX-DR4, UX-DR15). 1.7 ships the WIRE (state + fan-out + client send), not the surface. Do NOT mount socket.ts into App.svelte. [Source: epics.md#Story-1.10 lines 438–452.]

### The fan-out pattern — the architectural heart of this story (read the round-trip first)
The 1.6 createRoom case pushed to ONE connection (the creator). 1.7 introduces the canonical multi-recipient pattern from architecture.md's round-trip (line 523):
```
for (const c of this.getConnections()) pushState(c, host.table, <c's playerId>)
```
- Each recipient gets a SEPARATE projection because `projectStateFor(state, playerId)` computes a per-player `you` (`isHost`, own `hand`, etc.). You MUST NOT project once and broadcast the same payload — that would (a) give every device the wrong `you`, and (b) at Showdown leak hands (SM-6). [Source: architecture.md lines 532–538 — the ✅/❌ example.]
- The loop lives in the post-handler orchestration site (dispatch's `joinRoom` case, or table-server), NOT in handlers.ts (handlers are the state-mutation boundary and must not touch transport). [Source: handlers.ts header; architecture state-mutation boundary.]
- `.broadcast` is BANNED (GATE 1) — the architecture deliberately forbids it even though partyserver offers it, because broadcast sends ONE payload to all (it cannot do per-recipient projection). The fan-out is a loop calling `pushState` per connection. [Source: 1.6 table-server Dev Notes; architecture line 125; eslint.config.js GATE 1.]
- **Per-connection playerId:** dispatch stamps `connection.setState({ playerId })` on createRoom (1.6) and now on joinRoom. The fan-out reads each connection's `playerId` from its state. A connection that connected but has not yet sent its joinRoom has no `playerId` — project it with the spectator fallback (no `you.hand`, `isAlive/isConnected` false), which `projectStateFor` already handles via `self?.… ?? false`. [Source: project-state.ts `state.players.find`; dispatch.ts `setState`.]

### bad-code semantics: a join to a never-claimed DO addresses an EMPTY DO (not a 404)
A `joinRoom{code}` connects to `/parties/table/<code>` → `idFromName(code)` → a DO that may have NEVER been created. partyserver instantiates the DO regardless (the URL addresses it), so `onConnect`/`onMessage` run on a FRESH, unclaimed DO whose `table === null` and whose storage has no `"table"` key. THAT is "bad code" / "expired" (a GC'd room also leaves empty storage). So `handleJoinRoom`'s bad-code test is exactly: `host.table === null && (await loadSummary(host.storage)) === undefined` ⇒ `IntentError("bad-code")`. This is the SAME mechanism the spike validated for claim-on-create, read in the opposite direction (1.6 throws when claimed; 1.7 throws when UNclaimed). Do NOT append a player or write a summary in this path — an empty DO must stay empty (else a typo'd code would silently CREATE a junk room). [Source: 1-1-spike-findings AC1; 1.6 handleCreateRoom; architecture D7.]

### Concurrent join correctness (AC-1.7.5) — same atomicity discipline as 1.6's claim
DO turns are single-threaded but an `await` yields the turn. The cap-check (`players.length >= MAX_PLAYERS`) → decide → append → persist must have NO interleaving `await` that lets a second join run between the cap-decision and the append (else two joins both see `length < MAX` and both append → overflow / a 21st seat). The DO input gate serializes whole `onMessage` turns; the only awaits in the handler are `loadSummary`/`persistSummary`. Structure: do the in-memory cap-check + append on `host.table` synchronously, THEN `await persistSummary`. The append-to-memory is the commit point; persist follows without yielding the decision. Comment it (mirrors handleCreateRoom's documented atomicity). The `do`-project concurrent test fires N joins and asserts no duplicate seatIndex / no overflow. [Source: 1-1-spike-findings follow-up; 1.6 handleCreateRoom CLAIM ATOMICITY note.]

### Presence on leave (`onClose`) — ephemeral, NOT persisted; retain the seat
`isConnected` is socket presence only and is DELIBERATELY omitted from the durable summary (persistence.ts `DurablePlayer` excludes it — a reloaded summary makes no claim about who is connected; project-state seeds it false until a live connection re-asserts). So an `onClose` presence flip mutates `host.table` in MEMORY only — do NOT `persistSummary` for a presence-only change (it carries no durable field). The player record is RETAINED with `isAlive` unchanged: a disconnected-but-alive player still owes a Turn; the Host conducts around them (no auto-timeout in MVP). After the flip, fan out so every remaining device sees the offline marker live. [Source: persistence.ts DurablePlayer comment; architecture lines 321–328.]

### partyserver 0.5.8 API surface (the 1.7-relevant pieces; verified in 1.6 against installed typings)
- `this.getConnections()` — iterable of `Connection`; the fan-out loop's source. `Connection` IS a `WebSocket & { id, state, setState() }`. Each connection's per-socket state is where `playerId` is stamped (`connection.setState({ playerId })`) and read (`connection.state`). [node_modules/partyserver/dist/index.d.ts.]
- `onClose(connection, code, reason, wasClean)` — override for the leave path; declare only the params you use (a subclass may declare fewer than the base, as 1.6's `onConnect` does). [index.d.ts onClose.]
- `onConnect(connection, ctx)` — a socket connected; thin in 1.7 (the joinRoom intent drives the first projection; bare-connect re-projection of an identified socket is the deferred reconnect FLOW). [index.d.ts.]
- Standard accept mode (Hibernation OFF) — `getConnections()` iterates the partyserver registry and is accurate for fan-out in standard mode (this is DISTINCT from the GC `getWebSockets()` probe, which reads 0 in standard mode — Story 1.11's problem, not this story's). [Source: 1-1-spike-findings AC3; architecture line 469.]

### Inbound intent parsing (already wired in 1.6)
`onMessage` already parses the `{type,payload}` envelope to `Intent` and delegates to `dispatch` (1.6). 1.7 adds NO new parsing — it adds the `joinRoom` route inside `dispatch` and the fan-out after the handler. Malformed/non-envelope messages are still dropped silently (lightweight lobby handling — Decision #1; no validation lib). [Source: table-server.ts onMessage (1.6); architecture D4.]

### `onStart`-before-`onMessage` (confirmed safe in 1.6 review)
partyserver's `#ensureInitialized` runs `onStart` inside `blockConcurrencyWhile` BEFORE the first `onMessage`. So by the time `handleJoinRoom` runs, `onStart` has already hydrated `host.table` from any persisted summary — a warm/claimed Table's `host.table` is non-null. The `host.table === null && loadSummary() === undefined` bad-code check is therefore the correct cold-DO test (an unclaimed DO has neither). [Source: 1-6 story Review Findings — onStart-before-onMessage race confirmed SAFE.]

## Architecture Compliance

- **Location (on-disk workspace form is authoritative):** edits to `server/src/{handlers,dispatch,table-server}.ts`; test extension `server/src/table-server.do.test.ts`; NEW `server/test/integration/**` (activation gate); client `client/src/socket.ts`. NO new `server/src/` modules unless the WATCH `connections.ts` peel is genuinely triggered (it likely is not — see Project Structure Notes). Do NOT create `server/src/rules/**` (Epic 2). [Source: architecture.md#Complete-Project-Directory-Structure lines 656–732; 1-2..1-6 on-disk convention.]
- **State-mutation boundary:** `handlers.ts` (`handleJoinRoom` + any presence helper) is the ONLY site that assigns `host.table` / writes via persistence, AFTER validation. `dispatch.ts` routes + holds the single try/catch + orchestrates the fan-out. `onMessage`/`onConnect`/`onClose` neither mutate table state directly nor send (onClose calls a handler for the flip + push-state for fan-out). [Source: architecture.md D3 lines 514–539; handlers.ts header.]
- **Egress chokepoint (SM-6 / AR-4):** `projectStateFor` is the SOLE producer; `pushState` (push-state.ts) the SOLE sender; the fan-out is a `for … pushState(c, …)` loop — NEVER `.broadcast`. Every `tableState` (join, presence, late-connect) routes through push-state.ts. [Source: architecture.md lines 104–110, 240–241, 523, 532–538; eslint.config.js GATE 1.]
- **Single storage key (D2):** durable summary in `ctx.storage["table"]` ONLY; persist on the JOIN (a roster/durable-field change); do NOT persist on the presence-only `onClose` flip (`isConnected` is not durable). `round` stays null in lobby. [Source: architecture.md D2 lines 346–355; persistence.ts DurablePlayer.]
- **Identity (§11.3 / AR-12):** the joiner's server-issued `playerId` keys their state (never socket id); `seatIndex` = append order, immutable-for-life. Session token stays client-private; the token echo is accepted-but-not-resumed (reconnection deferred). [Source: architecture.md §11.3, lines 316–320; identity.ts; 1-5/1-6 stories.]
- **Lobby validation (Decision #1):** lightweight shape-checking + DO single-threaded serialization, NOT the Epic 2 two-scope guard (which no-ops in lobby). joinRoom gated to `lobby` ONLY. [Source: architecture.md D4 lines 389–400; epics.md#Story-1.7 line 388.]
- **Three player states never conflated:** `isAlive` (game logic; unchanged on disconnect), `isConnected` (socket presence; flips on onClose), removed (host-removed — FR-14, Epic 4). A leaver flips `isConnected` only; `isAlive` is untouched. [Source: architecture.md lines 321–328.]
- **Import-by-name:** `import { MAX_PLAYERS, IntentError } from "@trash/shared"`; `import type { Intent, TableState, Player } from "@trash/shared"`. Never a relative path into `shared/`. [Source: 1-3..1-6 dev notes; config.ts MAX_PLAYERS.]
- **Routing:** clients route to `/parties/table/<code>` (lowercase `table` — partyserver kebab-cases binding "Table"); the integration test asserts the correct-cased path routes and the wrong-cased path 404s (deferred-work #24). [Source: server/src/index.ts routing NOTE; deferred-work #24.]

## Library / Framework Requirements

- **No new dependencies, server or client.** `MAX_PLAYERS`/`MIN_PLAYERS` are in `@trash/shared/config.ts`. `issueIdentity()` (1.5) mints the joiner identity. The integration test (Task 6) MAY need a node WebSocket client to drive `wrangler dev` — prefer the platform `ws` ONLY if a runner script genuinely needs it AND it goes in `server` devDependencies with a documented rationale; the lighter path (manual multi-tab procedure documented in the file header, or reusing partysocket already in client devDeps) avoids a new dep entirely. Do NOT add `uuid`/`nanoid`/`zod`/`valibot`. [Source: shared/src/config.ts; server/package.json; types.ts header lines 5–7.]
- Toolchain (pinned, already installed — do not bump): typescript 5.9.3, eslint 9.39.1, typescript-eslint 8.46.4, vitest 4.1.9, @cloudflare/vitest-pool-workers 0.16.18, @cloudflare/workers-types 4.20260619.1, wrangler 4.103.0, partyserver 0.5.8, partysocket 1.2.0, svelte 5.56.3, svelte-check 4.4.1, vite 8.0.16, vite-plugin-pwa 1.3.0. TS: `moduleResolution: "Bundler"`, `strict: true`. [Source: 1-2..1-6 package.json snapshots.]

## File Structure Requirements

**EDIT (existing — read before changing):**
- `server/src/handlers.ts` — has `handleCreateRoom` + `TableHost`/`ConnectionState`. ADD `handleJoinRoom` (append + bad-code/phase-illegal/room-full + atomic cap-check) and a small presence helper (e.g. `markDisconnected`) for onClose. Update the SCOPE header. Keep `handleCreateRoom` intact. Do NOT call send/getConnections from here (boundary).
- `server/src/dispatch.ts` — has `createRoom` case + the single try/catch. ADD a `joinRoom` case (handler → `setState` → fan-out loop) BEFORE `default`. Update SCOPE header. Keep the createRoom case + the single try/catch + the non-1.7 `default` rejection.
- `server/src/table-server.ts` — has `onStart`/`onConnect`(empty)/`onMessage`. ADD `onClose` (presence flip via handler + fan-out). Keep `onConnect` thin (document late-connect re-projection is the deferred reconnect FLOW). Do NOT add `static options = { hibernate: true }` or an alarm. Re-evaluate the WATCH `connections.ts` peel (likely still keep in table-server.ts).
- `client/src/socket.ts` — has `buildJoinRoomIntent`/`createRoomWithRetry`/`createSocket`. ADD a `joinRoom`-and-listen helper (reuse the teardown/timeout pattern; surface `bad-code` for retry, do NOT auto-retry it) + fail-loud `VITE_WS_URL` check on mount. Keep `maxRetries: 0`; preserve all 1.5/1.6 helpers. Do NOT mount into App.svelte.

**CREATE (new):**
- `server/test/integration/<name>` — the activation-gate (~6 device) multi-device-concurrent-join test against `wrangler dev` + the kebab-case routing assertion. Add an explicit run script (e.g. `test:integration`) or a documented manual procedure in the file header. Do NOT name it `*.do.test.ts` (it would wrongly run in the pool) or `*.test.ts` under an un-included path (silent zero coverage) — see deferred-work #31.

**EDIT (test):**
- `server/src/table-server.do.test.ts` — EXTEND with join round-trip + fan-out-to-A + bad-code + late-join (seeded non-lobby summary) + room-full + concurrent-join invariants + SM-6 no-token. Keep the 1.6 createRoom/claim tests.

**DO NOT TOUCH:**
- `shared/src/types.ts` — contract frozen (1.3); `joinRoom.payload` is `{code,name,sessionToken?}` — consume it, do NOT add fields; `ErrorReason` includes `bad-code`/`room-full`/`phase-illegal` — use them, do NOT add a reason. `shared/src/config.ts` — consume `MAX_PLAYERS`/`MIN_PLAYERS`, do NOT change.
- `server/src/project-state.ts` + `server/src/project-state.test.ts` — the projector + standing SM-6 gate; consume `projectStateFor`, do NOT modify it or its test (its lobby/non-host/spectator branches are now reachable via join — that is exercise, not modification; the optional branch-coverage hardening in deferred-work #44 is NOT required this story).
- `server/src/identity.ts` + `server/src/identity.test.ts` — consume `issueIdentity()`, do NOT modify.
- `server/src/persistence.ts` — consume `loadSummary`/`persistSummary`/`toSummary`/`reconcileSummaryToState`, do NOT modify (the durable field boundary — `isConnected` excluded — is load-bearing for the onClose presence rule).
- `server/src/room-code.ts`, `server/src/push-state.ts` — consume; push-state stays the sole send site (the fan-out loop calls into it). Do NOT add a `broadcast` helper.
- `server/src/index.ts` — Worker entry + routing; do NOT change.
- `eslint.config.js`, `server/vitest.config.ts`, `server/wrangler.jsonc`, `server/tsconfig.json`, `client/tsconfig.json`, `client/src/App.svelte`, `client/src/main.ts` (UNLESS a documented `test:integration` script requires a package.json edit — that is the one sanctioned config touch, in `server/package.json`/`vitest.config.ts` ONLY if you wire the integration runner there; prefer a standalone script).
- Do NOT create `server/src/rules/**` (Epic 2).

**MUST PRESERVE (regression guardrails):**
- System green end-to-end: `scaffold.test.ts`, `scaffold.do.test.ts`, `identity.test.ts`, the standing SM-6 `project-state.test.ts`, and the 1.6 createRoom/claim DO tests all keep passing; all ESLint gates green; client build + typecheck green.
- The SM-6 privacy guarantee survives the fan-out: each recipient is projected with ITS OWN `playerId` (never a single broadcast payload); no `sessionToken` and no non-owner `hand` reaches any device. Assert the no-token negative on the join payloads.
- Do NOT weaken any ESLint gate to make code compile/lint (standing 1.2–1.6 rule). The fan-out uses `pushState`, not `.broadcast`.
- Do NOT introduce `.send`/`.broadcast` outside push-state.ts (the fan-out loop calls push-state.ts; client send rides socket.ts's existing exemption); do NOT introduce a per-field storage key; do NOT introduce a runtime validation lib; do NOT enable hibernation or add an alarm.

## Testing Requirements

- **Test-file naming is convention-enforced (deferred-work #31 — the silent-zero-coverage trap):** `*.test.ts` → node `rules` project; `*.do.test.ts` → `do` (pool-workers) project; any other suffix or any path OUTSIDE both `include` globs runs in NO project (green CI, zero coverage). The integration test under `server/test/integration/` is OUTSIDE both project includes by design — give it an EXPLICIT runner (a script) or a documented manual procedure; never let it masquerade as covered. [Source: server/vitest.config.ts; deferred-work #31.]
- **`table-server.do.test.ts` (DO project) — EXTEND:** AC-1.7.1 join → 2-player roster + fan-out to the host socket (both A and B get an updated `tableState`, each with its own correct `you`); AC-1.7.2 bad-code → `error` on a never-claimed DO, no ghost entry; AC-1.7.3 late-join → seed a non-lobby `"table"` summary, joinRoom → `phase-illegal`; AC-1.7.5 room-full → `error` at MAX_PLAYERS+1, and a concurrent N-join fire → no duplicate seatIndex / no overflow / exactly `min(N+1, MAX_PLAYERS)` players; SM-6 → no `sessionToken` in any join payload. Header-comment that real concurrent WS is AC-1.7.4's `wrangler dev` job (the pool can't drive it).
- **Integration test (`server/test/integration/`, run via its own script) — AC-1.7.4 (SM-4):** ~6 concurrent real WS against `wrangler dev`; every device's roster ends consistent (all 6, correct order); a leave propagates `isConnected:false` to all remaining devices live; the kebab-case routing assertion (deferred-work #24). This is the activation gate — the single biggest pre-mortem finding; it CANNOT be a pool-workers test.
- **No client test this story** — client workspace has no runner (deferred-work #29). `socket.ts` verified by `svelte-check`/`tsc -b` + `vite build` + structural review.
- **Red-first proof (house style):** extend the DO test with the join assertion, run it against the current `default → phase-illegal` route, watch it FAIL (join returns `error`, not a 2-player `tableState`), then implement `handleJoinRoom` + the route + fan-out → GREEN.
- Run the full gate before marking done: `npm run typecheck && npm run lint && npm test && npm run build` (+ the integration script / manual procedure for AC-1.7.4).

## Previous Story Intelligence (Story 1.6)

- **The whole server spine is live and tested:** `onMessage` parses the envelope → `dispatch` (router + single try/catch + lightweight phase-legality) → `handleCreateRoom` (sole state-assignment + atomic claim) → `persistSummary` (single `"table"` key) → `pushState` (sole send, wraps `projectStateFor`). 1.7 EXTENDS this: a new handler, a new route, and the fan-out loop. Do NOT rebuild the spine — plug into it. [Source: 1-6 story; handlers.ts/dispatch.ts/push-state.ts.]
- **`connection.setState({ playerId })` is the binding mechanism** — dispatch stamps it on createRoom (1.6); join does the same, and the fan-out reads each connection's stamped `playerId`. `ConnectionState = { playerId: string }` already exists in handlers.ts. [Source: 1-6 dispatch.ts.]
- **Atomic claim pattern (copy the reasoning for the join cap-check):** 1.6 documents "no `await` between the claim-decision and the claim-write; the DO input gate serializes the onMessage turn." Apply the identical discipline to join's `players.length` cap-check → append. [Source: 1-6 handleCreateRoom CLAIM ATOMICITY note.]
- **GATE 1 is refined, not loosened:** `.send` is allowed in `client/src/socket.ts` (client→server intents) + `server/src/**/*.do.test.ts` (test WS harness); `.broadcast` is STILL banned everywhere except push-state.ts (which never broadcasts either — it sends per-connection). The fan-out MUST be a `pushState` loop. [Source: 1-6 eslint.config.js refinement; table-server Dev Notes.]
- **`projectStateFor` handles the spectator/lobby branches you now reach:** a `playerId` not seated → `you.isAlive/isConnected` false, no `you.hand`; `round === null` (lobby) → no `currentTurnId`/`turnToken`, `revealed:false`, `isLastPlayer:false`. Join exercises exactly these (a fresh joiner's projection, a pre-join socket in the fan-out). The optional branch-coverage hardening (deferred-work #44) is NOT required here. [Source: project-state.ts; deferred-work #44.]
- **Pattern: read-the-file-first + red-first proof.** 1.4/1.5/1.6 house style — read each seam before editing, write the failing assertion, prove red against the stub/route, then green. [Source: 1-4/1-5/1-6 stories.]
- **`onStart` runs before the first `onMessage` (inside `blockConcurrencyWhile`)** — confirmed SAFE in the 1.6 review. So a warm/claimed Table's `host.table` is non-null by the time `handleJoinRoom` runs; the cold/unclaimed (bad-code) case is `table === null && no summary`. [Source: 1-6 Review Findings.]

## Git Intelligence

- `2df8b90 Story 1.6: create a Table & get a Room Code + code review` (baseline) — added the full server spine (`handlers.handleCreateRoom`, `dispatch`, `push-state`, `persistence`, `table-server` lifecycle), client `socket.ts` createRoom helpers, `table-server.do.test.ts` (real-WS round-trip), `env.test.d.ts` `SELF`, and the GATE 1 refinement (client/test `.send` exemption). 1.7 runs against this green tree; consume the spine, extend `handlers`/`dispatch`/`table-server`/`socket.ts`/the DO test. [git log; 1-6 File List.]
- `51bb807 Story 1.5: player identity & session` — `issueIdentity()` (consumed for the joiner identity), client `socket.ts` (`buildJoinRoomIntent` already echoes the stored token), `maxRetries:0`. [1-5 story.]
- `908a80d Story 1.4: privacy chokepoint + standing SM-6 test` — `project-state.ts` + the standing gate the fan-out must route through per-recipient and keep green.
- `8874b9c Story 1.3: shared wire contract` — froze `@trash/shared`: `joinRoom{code,name,sessionToken?}`, `ErrorReason` (incl. `bad-code`/`room-full`/`phase-illegal`), `MAX_PLAYERS`. Consume; do NOT modify.
- `51d737d Story 1.2 code review` — GATE 1/GATE 2 mechanical gates; `handlers.ts`/`dispatch.ts`/`table-server.ts` are OUTSIDE `rules/**` (no purity ban); the `.send`/`.broadcast` ban applies (route via push-state.ts).

## Spike Intelligence (Story 1.1) — relevant to 1.7

- **Claim-on-create / read-in-reverse for bad-code:** the spike proved `idFromName(code)` reliably reports already-claimed vs fresh. 1.7 reads it in reverse — a fresh (unclaimed) DO is exactly the bad-code/expired case (`table === null && no summary`). [Source: 1-1-spike-findings AC1.]
- **Persistence boundary:** the durable summary persists `{code,phase,hostId,startingLives,players[id,name,lives,isAlive,seatIndex],phaseToken}` — `isConnected` is NOT durable. This is WHY onClose's presence flip is memory-only (no persist). [Source: 1-1-spike-findings AC2; persistence.ts.]
- **GC/hibernation is NOT this story:** the `getWebSockets()`-reads-0 finding + the hibernation-vs-`getConnections()` GC probe are Story 1.11. The fan-out's `getConnections()` is the partyserver registry (accurate in standard mode for iteration) — a DIFFERENT concern from the GC presence probe. Do NOT enable hibernation. [Source: 1-1-spike-findings AC3; epics.md#Story-1.11.]

## Project Structure Notes

- Alignment: architecture.md#Complete-Project-Directory-Structure is canonical (on-disk `server/src/...` form authoritative). 1.7 edits `handlers.ts`/`dispatch.ts`/`table-server.ts`/`socket.ts`, extends `table-server.do.test.ts`, populates `server/test/integration/`. No new `server/src/` module expected.
- **WATCH `connections.ts` peel:** the table-server header notes "peel connection/session mgmt into connections.ts only if WS-lifecycle code grows." 1.7 adds `onClose` (one presence flip) + keeps `onConnect` thin — the lifecycle is still modest. PREFER keeping it in `table-server.ts`; do NOT create `connections.ts` unless the onClose/presence logic genuinely sprawls. Re-evaluate when reconnection (deferred) or host-controls (Epic 4) grow the lifecycle. [Source: table-server.ts WATCH note; 1-6 Project Structure Notes.]
- `server/test/integration/` exists (only `.gitkeep`, authored in 1.2, reserved for THIS story + 1.11). The `.gitkeep` header already names it "Populated in Story 1.7 (multi-device concurrent join) and Story 1.11 (GC alarm)." Honor that — this is the home for the AC-1.7.4 activation-gate test. [Source: server/test/integration/.gitkeep.]
- Variance: architecture writes paths logically (`src/server/...`) and on-disk (`server/src/...`); the on-disk form is authoritative (proven 1.2–1.6).

### References

- [Source: epics.md#Epic-1 lines 214–218 — epic objective (activation gate SM-4; the live shared lobby), FR-1..4, Decision #1 (lightweight lobby validation), B (multi-device join AC)]
- [Source: epics.md#Story-1.7 lines 362–388 — user story + AC-1.7.1 (join → roster on every device), AC-1.7.2 (bad-code, no ghost join), AC-1.7.3 (late-join lobby-only, leaver stops Turns, no reconnect), AC-1.7.4 (~6 devices/~30s activation gate via wrangler dev — Pre-mortem B/SM-4), AC-1.7.5 (concurrent-join correctness via DO serialization, NOT the two-scope guard)]
- [Source: epics.md lines 164 (Pre-mortem B — the single biggest finding: multi-device-concurrency AC against wrangler dev), 168 (D — spike GC probe context)]
- [Source: epics.md#Story-1.6 lines 341–360 / #Story-1.8 lines 390–404 — what 1.6 handed 1.7 (lobby Table + spine); hostSetLives is 1.8, not 1.7]
- [Source: architecture.md round-trip lines 514–538 — the fan-out `for (const c of getConnections()) pushState(c)` pattern + the ✅/❌ no-broadcast example (per-recipient projection or leak hands)]
- [Source: architecture.md D3 lines 365–387 — single tableState event, pushed on every state change AND on (re)connect; joinRoom gated to lobby]
- [Source: architecture.md D4 lines 389–403 — two-scope guard is Epic 2; joinRoom gated to lobby ONLY (cannot race a Deal); lobby relies on DO serialization + lightweight checking]
- [Source: architecture.md D1 lines 316–328 — seatIndex immutable/append-only; three player states (isAlive/isConnected/removed) never conflated; disconnected-but-alive player still owes a Turn]
- [Source: architecture.md D2 lines 346–355 / D2.1 lines 359–362 — durable summary field boundary (isConnected excluded → presence is memory-only); reload coercion]
- [Source: architecture.md lines 104–110, 240–241, 532–538 — projectStateFor SOLE producer; pushState SOLE sender; .broadcast banned; fan-out per-connection]
- [Source: architecture.md §11.3 / AR-12 — identity playerId keys state; reconnection FLOW deferred (sessionToken echo accepted-not-resumed)]
- [Source: architecture.md#Complete-Project-Directory-Structure lines 656–732 — on-disk paths; server/test/integration/ for wrangler-dev connection-lifecycle tests]
- [Source: shared/src/types.ts:148–155 — Intent joinRoom{code,name,sessionToken?} (frozen); lines 166–178 ServerEvent/ErrorReason (bad-code/room-full/phase-illegal — frozen); Player/ProjectedTableState shape]
- [Source: shared/src/config.ts — MAX_PLAYERS 20, MIN_PLAYERS 2, DEFAULT_LIVES 3]
- [Source: server/src/handlers.ts — handleCreateRoom + TableHost/ConnectionState (extend with handleJoinRoom + presence helper); server/src/dispatch.ts — createRoom case + single try/catch (add joinRoom case + fan-out); server/src/table-server.ts — onStart/onConnect/onMessage (add onClose)]
- [Source: server/src/push-state.ts — pushState/pushError (the fan-out loops over these; sole send site); server/src/persistence.ts — DurablePlayer omits isConnected (presence is memory-only); server/src/project-state.ts — spectator/lobby branches reached by join]
- [Source: server/src/index.ts — routePartykitRequest; binding "Table" → URL namespace "table" (lowercase); the integration test asserts correct-cased routing — deferred-work #24]
- [Source: server/vitest.config.ts — node "rules" / pool "do" projects; pool CANNOT drive real concurrent WS (→ server/test/integration vs wrangler dev); test-naming trap — deferred-work #31]
- [Source: eslint.config.js — GATE 1 .send/.broadcast ban (push-state.ts exempt; socket.ts + *.do.test.ts exempt for .send only, .broadcast still banned)]
- [Source: client/src/socket.ts — buildJoinRoomIntent (1.5, token echo), createRoomWithRetry teardown/timeout pattern to mirror, createSocket maxRetries:0; fail-loud VITE_WS_URL — deferred-work #48]
- [Source: 1-6 story — server spine, setState binding, atomic-claim pattern, onStart-before-onMessage SAFE, GATE 1 refinement]
- [Source: 1-1-spike-findings AC1 (claim/unclaimed = bad-code in reverse), AC2 (persistence boundary → onClose presence memory-only), AC3 (hibernation/GC = 1.11)]
- [Source: deferred-work.md #24 (partyserver kebab-case routing assertion — owned by this story's integration test), #31 (test-naming silent-zero-coverage trap), #44 (SM-6 branch-coverage gaps now reachable — optional), #48 (fail-loud VITE_WS_URL — this flow owns it), #54 (createRoom/join name CONTENT validation deferred to lobby UI 1.9a/1.10)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context) — bmad-dev-story workflow.

### Debug Log References

- **Red-first proof (join, Task 1/5):** wrote the AC-1.7.1 join assertion against the `default → IntentError("phase-illegal")` route → the join returned an `error`, not a 2-player `tableState` (RED). Implemented `handleJoinRoom` + the `joinRoom` dispatch case + the `fanOut` loop → GREEN.
- **`getConnections` variance trap:** first attempt overrode partyserver's generic `getConnections<TState>()` with a non-generic narrowed signature → `TS2416` (a generic method is not assignable to a concrete instantiation under `implements`). Resolved by exposing a distinctly-named `connections()` on `TableHost` + the class (a thin typed wrapper over `getConnections<ConnectionState>()`), avoiding the override entirely.
- **Concurrent-join test assertion fix:** the first version asserted against "the largest roster among each guest's FIRST received event" — flaky, because fan-outs interleave across sockets and a guest's first message may reflect an earlier (smaller) roster. Rewrote to drain one event per guest (ensuring all joins processed) then assert against the DO's AUTHORITATIVE persisted `"table"` summary via `runInDurableObject` (contiguous seats 0..N, no duplicate, no overflow) — timing-independent.
- **Integration harness run (Task 6):** started `wrangler dev` on :8787, ran `TRASH_WS_URL=ws://127.0.0.1:8787 npm run test:integration` → all 16 assertions passed (6-device roster convergence, contiguous seats, single host, leave→presence on every remaining device, wrong-cased routing refused). Node 25 provides a global `WebSocket` client, so no new dependency was needed.

### Completion Notes List

- **AC-1.7.1** — `joinRoom{code,name,sessionToken?}` in `lobby` appends the Player (next seatIndex, alive/connected, lives = startingLives, server-issued playerId) and re-projects to EVERY connection via `push-state.ts` `fanOut` — each device gets its OWN per-player projection (the joiner learns `you.playerId`; existing devices see the new Player). Verified by the DO test (host + guest each receive a correct distinct projection).
- **AC-1.7.2** — a join to a never-claimed/expired code (fresh empty DO: `table===null` AND no `"table"` summary) returns `error{reason:"bad-code"}` to that connection only; no player appended, no summary written, no fan-out. Verified.
- **AC-1.7.3** — `phase !== "lobby"` ⇒ `error{reason:"phase-illegal"}` (late join refused; verified against a seeded non-lobby summary). A leaver's `onClose` flips `isConnected:false` (in-memory only — presence is not durable) and fans out; the record is retained with `isAlive` unchanged (they stop taking Turns; the seat stays). No reconnection (the `sessionToken` echo is accepted but not resumed). Verified by the leave-presence DO test + the integration harness.
- **AC-1.7.4 (SM-4 activation gate)** — `server/test/integration/multi-device-join.mjs` drives 6 REAL concurrent sockets against `wrangler dev`: every device converges to the full roster with contiguous seats (no stale lobby), exactly one device is host, and a leave propagates `isConnected:false` to every remaining device live. RAN AND PASSED end-to-end. Wired as `npm run test:integration --workspace=server` with a documented two-step manual procedure; standalone `.mjs` so it never masquerades as covered (deferred-work #31).
- **AC-1.7.5** — concurrent joins are correct via the DO's single-threaded `onMessage` serialization + the handler's atomic cap-check→append (no yield between the cap-decision and the in-memory push) — NOT the Epic 2 two-scope guard (which no-ops in lobby; documented in dispatch so it never reroutes lobby actions). A join past the seat cap → `room-full`. Verified: N concurrently-fired joins yield contiguous seats / no duplicate / no overflow (asserted against the authoritative persisted summary).
- **SM-6 preserved** — every fan-out projection is built per-recipient by `projectStateFor` and sent only by `push-state.ts` (`pushState`/`fanOut`); no `.broadcast`. The server-private `sessionToken` (even one echoed by the client) never enters a projection. Standing `project-state.test.ts` gate still green; the join SM-6 negative assertion added.
- **Carry-forward closed:** deferred-work #24 (kebab-case routing — asserted in the integration test, passing) and #48 (fail-loud `VITE_WS_URL` — `createSocket` now throws on unset/empty). #44 (SM-6 branch-coverage hardening) and #54 (name CONTENT validation) remain deferred per scope.
- **Scope honored** — `hostSetLives`/gameplay intents still `default`-rejected (1.8 / Epics 2–4 untouched); hibernation/GC deferred to 1.11 (no `static options`, no alarm); reconnection deferred; no new npm deps; `shared/src/types.ts`/`config.ts`/`project-state.ts`/`identity.ts`/`persistence.ts`/`room-code.ts`/`index.ts` untouched. GATE 2 untouched; no `rules/**` files created.
- **Full gate green:** `typecheck` PASS (client 99 files/0 errors; shared+server clean), `lint` PASS (0 errors), `npm test` PASS (20 tests / 6 files), `npm run build` PASS. Integration harness PASS against live `wrangler dev`.

### File List

- `server/src/handlers.ts` — MODIFIED (added `handleJoinRoom` — bad-code/phase-illegal/room-full + atomic append; `markDisconnected` presence helper; `MAX_PLAYERS`/`Player` imports; `TableHost.connections()` for fan-out; SCOPE header 1.6→1.7).
- `server/src/dispatch.ts` — MODIFIED (added the `joinRoom` case: handler → `setState` → `fanOut`; imports `handleJoinRoom`/`fanOut`; SCOPE header updated; gameplay intents still `default`-rejected).
- `server/src/push-state.ts` — MODIFIED (added `fanOut(connections, state)` — the per-recipient roster-change re-projection loop; the loop lives in the sole `.send` module; `.broadcast` never used).
- `server/src/table-server.ts` — MODIFIED (added `onClose` presence flip + fan-out via `markDisconnected`; `connections()` typed wrapper; clarified `onConnect` doc — no bare-connect projection; SCOPE/WATCH headers updated; hibernation still OFF).
- `server/src/table-server.do.test.ts` — MODIFIED (added 7 join/presence assertions: join+fan-out, bad-code, late-join via seeded summary, room-full, concurrent-join invariants, leave-presence, SM-6 no-token; `openConn` multi-event helper; imports `env`/`runInDurableObject`/`MAX_PLAYERS`).
- `server/src/env.test.d.ts` — MODIFIED (added `runInDurableObject` declaration so the late-join seed test typechecks).
- `server/test/integration/multi-device-join.mjs` — CREATED (the AC-1.7.4 / SM-4 activation-gate harness: 6 concurrent real sockets vs `wrangler dev`; roster convergence + leave-presence + kebab-case routing; standalone runner).
- `server/package.json` — MODIFIED (added `test:integration` script for the activation-gate harness).
- `client/src/socket.ts` — MODIFIED (added `joinRoomAndListen` + `JoinFailure` type — join send/listen, surfaces typed error, no auto-retry; `createSocket` now fail-loud on unset `VITE_WS_URL`; 1.5/1.6 helpers preserved; `maxRetries:0`; not mounted).

## Change Log

- 2026-06-19 — Story 1.7 context created (create-story): join + live multi-device roster scoped from epics/architecture/spike + 1.6 continuity. Status → ready-for-dev.
- 2026-06-19 — Story 1.7 implemented (dev-story): `handleJoinRoom` (bad-code/phase-illegal/room-full + atomic append) + `markDisconnected`; `dispatch` join route; `push-state.fanOut` (per-recipient roster re-projection — the architectural heart); `table-server.onClose` presence + fan-out; client `joinRoomAndListen` + fail-loud `VITE_WS_URL`. DO test +7 assertions (join/fan-out, bad-code, late-join, room-full, concurrency, presence, SM-6). Activation-gate harness (`multi-device-join.mjs`) RAN AND PASSED against live `wrangler dev` (6 concurrent devices — SM-4). Closed deferred-work #24 (routing) + #48 (fail-loud). GATE 1/2 intact; no new deps. Full gate green (typecheck/lint/test 20/build). Status → review.
