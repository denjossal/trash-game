---
baseline_commit: 1cd161a
---

# Story 1.8: Host sets starting Lives

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Host,
I want to choose how many Lives everyone starts with,
so that I can tune the game length for the room before dealing.

## Acceptance Criteria

**AC-1.8.1 — Host sets Lives in `lobby`: value constrained to 1–5, applies to ALL Players; default stays 3 if never set.**
Given a Table in `lobby` phase,
When the **Host** sends `hostSetLives{phaseToken, lives}`,
Then `state.startingLives` is set to the clamped value (`lives` constrained to `MIN_LIVES`..`MAX_LIVES` = 1..5; out-of-range values clamp, never error), **every Player's `lives` is updated to the same value** (pre-Deal all Players are equal — there is no spent/remaining distinction yet), the durable summary is persisted (`startingLives` is a durable field), and a fresh `tableState` is **re-projected to EVERY connection** (`fanOut`) so all devices see the new value live. If the Host never sends `hostSetLives`, `startingLives` remains the create-time default `DEFAULT_LIVES` (3). *(FR-4; epics.md#Story-1.8 lines 396–400; architecture.md round-trip line 523; shared/src/config.ts MIN_LIVES/MAX_LIVES/DEFAULT_LIVES.)*

**AC-1.8.2 — A non-Host Player who attempts to set Lives is refused with `not-host`; nothing changes, no fan-out.**
Given a non-Host Player on a `lobby` Table,
When they send `hostSetLives`,
Then the server returns `error{reason:"not-host"}` to THAT connection only, `startingLives` and every Player's `lives` are UNCHANGED, no summary is written, and no other connection is notified. (The Lives control is also not OFFERED on a non-Host device — that is the Lobby-UI half, Story 1.10; this story enforces the SERVER authority that backs it.) *(FR-4, NFR-2/NFR-9; epics.md#Story-1.8 lines 402–404; shared/src/types.ts ErrorReason "not-host".)*

**AC-1.8.3 — `hostSetLives` outside `lobby` is refused; lightweight phase-checking only (NOT the Epic 2 two-scope guard).**
Given a Table whose `phase` is NOT `lobby` (a game past the first Deal),
When the Host sends `hostSetLives`,
Then the action is refused with `error{reason:"phase-illegal"}` — setting *starting* Lives is a pre-Deal/lobby action; the mid-session Lives change (between Rounds, with the clamp-vs-top-up question) is the separate `hostRemovePlayer`/host-controls work of **Story 4.2 (FR-14)** and is NOT in scope here. Lobby validation is lightweight phase-checking + DO single-threaded serialization (Decision #1) — `validate.ts`/the two-scope token guard is Epic 2. The `phaseToken` in the payload is accepted but NOT guarded against in lobby (it is `0` and never advances pre-Deal), and `hostSetLives` does **NOT** bump `phaseToken` (setting config is not a phase transition). *(Decision #1; epics.md#Story-1.8 line 398; architecture.md D4 lines 389–403; epics.md#Story-4.2 line 847 — clamp-vs-top-up deferred to Epic 4.)*

**AC-1.8.4 — Payload shape is guarded; a malformed `hostSetLives` is a clean typed `error`, never a hang.**
Given a `hostSetLives` whose payload is missing or whose `lives` is not a finite number,
When the Host sends it,
Then it is rejected cleanly (lightweight shape guard, mirroring `handleCreateRoom`/`handleJoinRoom`) — a raw `TypeError` from reading `intent.payload.lives` would NOT be an `IntentError`, so dispatch would rethrow it and the client would get NO `error` event and hang. A non-numeric/absent `lives` ⇒ `error` (use the closest honest frozen reason — see Dev Notes "phaseToken & shape-guard reason"). No state change, no persist, no fan-out. *(architecture.md lightweight lobby validation; handlers.ts payload-shape-guard pattern; Decision #1.)*

**AC-1.8.5 — SM-6 preserved: the `startingLives` fan-out leaks no secret state and no session token.**
Given the `hostSetLives` fan-out re-projection,
When every device receives the updated `tableState`,
Then each payload is built per-recipient by `projectStateFor` and sent ONLY via `push-state.ts` (`pushState`/`fanOut`) — never `.broadcast`; `startingLives` is a PUBLIC field (not a card value), no non-owner `hand` appears (no round exists in lobby anyway), and no `sessionToken` is present. The standing `project-state.test.ts` SM-6 gate stays green. *(SM-6 / AR-4; architecture.md lines 104–110, 532–538; eslint.config.js GATE 1.)*

## Tasks / Subtasks

> **TDD order (house style proven in 1.4/1.5/1.6/1.7): write the failing test, watch it RED against the current `default → phase-illegal` route in dispatch.ts, then GREEN it.** The set-lives round-trip + fan-out is exercised by **`table-server.do.test.ts`** (EXTEND the existing file — the `do` / pool-workers project drives real `SELF.fetch(..., {Upgrade:"websocket"})` against a live DO). Reuse the existing `openConn` multi-event helper (host + guest sockets) for the host/non-host + fan-out assertions, and `createRoomRoundTrip` for single-event cases. **No new integration test** (no multi-device concurrency property here — set-lives is a single Host action, not the activation gate).

- [x] **Task 1 — Implement `handleHostSetLives` in `handlers.ts` (AC: 1, 2, 3, 4)** *(test-first: extend `table-server.do.test.ts` with the AC-1.8.1 set-lives assertion, prove it RED against the `default → phase-illegal` route — set-lives returns `error` not an updated `tableState` — then GREEN)*
  - [x] Read `server/src/handlers.ts` FIRST (it has `handleCreateRoom` + `handleJoinRoom` + `markDisconnected` + `TableHost`/`ConnectionState`). Add `handleHostSetLives(host, intent, callerPlayerId): Promise<void>` (no playerId to return — the caller is already seated/stamped; set-lives mutates config, it does not create identity). Update the SCOPE header (1.7 → 1.8).
  - [x] **PAYLOAD SHAPE GUARD (AC-1.8.4):** reject a missing payload / non-finite `lives` (`typeof intent.payload?.lives !== "number" || !Number.isFinite(intent.payload.lives)`) — mirrors the `handleCreateRoom`/`handleJoinRoom` shape guards. See Dev Notes for the reason code.
  - [x] **bad-code / table-null:** `host.table === null` ⇒ a set-lives to an unclaimed DO cannot happen via the shipped client (you must create/join first), but guard defensively — throw `IntentError("phase-illegal")` (no room to configure). Document that onStart-before-onMessage means null ⇒ never claimed.
  - [x] **phase-illegal (AC-1.8.3):** `host.table.phase !== "lobby"` ⇒ `IntentError("phase-illegal")`. Setting *starting* Lives is lobby-only; mid-session is Story 4.2.
  - [x] **not-host (AC-1.8.2):** `callerPlayerId !== host.table.hostId` ⇒ `IntentError("not-host")`. **This is the FIRST use of the `not-host` ErrorReason in the codebase** — import nothing new (it is already in the frozen `ErrorReason` union); just throw it. The caller's playerId comes from `connection.state?.playerId` (passed by dispatch, same mechanism as the join re-seat guard).
  - [x] **CLAMP (AC-1.8.1):** `const next = Math.max(MIN_LIVES, Math.min(MAX_LIVES, Math.trunc(intent.payload.lives)))`. Out-of-range clamps (never errors) per the AC ("constrained to 1–5"). `Math.trunc` so a fractional 2.7 → 2 (defensive; the client stepper only sends integers). Import `MIN_LIVES`, `MAX_LIVES` by name from `@trash/shared`.
  - [x] **MUTATE + PERSIST (sole state-assignment site):** set `host.table.startingLives = next` AND `for (const p of host.table.players) p.lives = next` (pre-Deal every Player's `lives` tracks `startingLives` — they were seeded equal at create/join; keep them equal). Then `await persistSummary(host.storage, host.table)` (`startingLives` AND `players[].lives` are BOTH durable fields — unlike the presence flip, this MUST persist). No yield between the mutation and persist (single DO turn; mirrors the 1.7 append commit-point discipline — though set-lives has no concurrency cap, keep the read→decide→write tight).
  - [x] **Idempotent / no-op safe:** setting the same value re-persists + re-fans-out harmlessly (no error). Do NOT early-return on an unchanged value — a re-fan-out is cheap and keeps every device authoritative.

- [x] **Task 2 — Route `hostSetLives` in `dispatch.ts` + fan out to EVERY connection (AC: 1, 2, 3, 4, 5)**
  - [x] Add `case "hostSetLives":` BEFORE `default`. On success: `await handleHostSetLives(host, intent, connection.state?.playerId)` then `fanOut(host.connections(), host.table!)`. Do NOT `setState` (the caller is already stamped from their create/join; set-lives binds no new identity). Update the SCOPE header (set-lives live; gameplay intents still `default`-rejected).
  - [x] **Caller playerId:** pass `connection.state?.playerId` to the handler (a not-yet-identified socket has `state === null` → `undefined` callerPlayerId → `!== hostId` → `not-host`, the correct refusal for a socket that never created/joined). Same read the join re-seat guard uses.
  - [x] The single try/catch is unchanged: `not-host`/`phase-illegal` become a targeted `error` to the calling connection only (no fan-out on the error path — dispatch rethrows/returns before the fan-out line).
  - [x] Keep the createRoom + joinRoom cases and the non-1.8 `default` rejection intact (deal/swap/keep/drawFromDeck/revealAll/dealAgain/newGame/hostRemovePlayer/hostReassign still rejected — Epics 2–4).

- [x] **Task 3 — Extend `table-server.do.test.ts`: set-lives round-trip + clamp + not-host + phase-illegal + shape-guard + fan-out + SM-6 (AC: 1, 2, 3, 4, 5)**
  - [x] **AC-1.8.1 set + fan-out + lives sync:** create on socket A (host, stays open), join on socket B (guest), then A sends `hostSetLives{phaseToken:0, lives:5}` → BOTH A and B receive a fresh `tableState` with `startingLives === 5` AND every `players[].lives === 5` (host AND guest seats). Use the `openConn` multi-event helper.
  - [x] **AC-1.8.1 clamp:** host sends `lives:9` → `startingLives === 5` (MAX_LIVES); host sends `lives:0` (or `-3`) → `startingLives === 1` (MIN_LIVES). Assert no `error` (clamps, not rejects).
  - [x] **AC-1.8.2 not-host:** guest socket B sends `hostSetLives{phaseToken:0, lives:2}` → B receives `error{reason:"not-host"}`; the authoritative roster (assert via a follow-up host projection or `runInDurableObject` on the persisted summary) still shows the prior `startingLives`/`lives` (unchanged). No fan-out to A.
  - [x] **AC-1.8.3 phase-illegal:** seed a non-lobby `"table"` summary via `runInDurableObject` (mirror the 1.7 late-join seed at lines 237–259 — D2.1 coerces a live phase to `roundResult` on wake, still `!== "lobby"`), connect + create/identify, send `hostSetLives` → `error{reason:"phase-illegal"}`.
  - [x] **AC-1.8.4 shape guard:** host sends `hostSetLives{phaseToken:0}` (no `lives`) and `hostSetLives{phaseToken:0, lives:"5"}` (string) → a clean typed `error` (the chosen reason), no hang, no state change.
  - [x] **AC-1.8.5 SM-6:** assert no `sessionToken` appears in any set-lives fan-out payload (reuse the join SM-6 assertion shape at lines 383+); `startingLives` present and public.
  - [x] Keep ALL 1.6/1.7 tests (createRoom/claim/join/bad-code/late-join/room-full/concurrency/presence/SM-6) passing.

- [x] **Task 4 — Client: wire `hostSetLives` send into `socket.ts` (AC: 1, 2)**
  - [x] Read `client/src/socket.ts` FIRST. Add a `buildHostSetLivesIntent(lives, phaseToken)` builder (mirrors `buildJoinRoomIntent`/`buildCreateRoomIntent`) and/or a thin send helper that posts `{type:"hostSetLives", payload:{phaseToken, lives}}` on the LIVE socket (the lobby keeps a socket open after join/create — the consuming surface is the Host Lobby stepper, Story 1.10). Reuse the existing send path; do NOT open a new socket per set-lives.
  - [x] **Scope guard:** this is the WIRE only. Do NOT build the stepper UI, the Lives pips, or mount into `App.svelte` — that is Story 1.10 (UX-DR4). Keep `maxRetries:0`; preserve all 1.5/1.6/1.7 helpers. If a clean live-socket send helper does not yet exist (1.7's `joinRoomAndListen` resolves and detaches listeners), add a minimal `sendIntent(socket, intent)` builder-level export and document that the lobby surface (1.10) owns mounting + liveness. **A builder-only export (no live-send plumbing) is acceptable** if wiring a live send would require the un-mounted lobby socket lifecycle — note the decision in Completion Notes.
  - [x] **No client test this story** (client workspace has no runner — deferred-work #29). Verify via `svelte-check`/`tsc -b` + `vite build` + structural review. The set-lives round-trip is covered server-side by the DO test.

- [x] **Task 5 — Green the full gate (AC: all)**
  - [x] `npm run typecheck` — shared+server clean; client `svelte-check`/`tsc -b` 0 errors.
  - [x] `npm run lint` — 0 errors. GATE 1 intact: the fan-out calls `pushState`/`fanOut` (push-state.ts), NO new `.send`/`.broadcast` outside it; client builder rides socket.ts's existing exemption. No gate weakened to compile (standing 1.2–1.7 rule).
  - [x] `npm test` — all prior tests + the new set-lives/clamp/not-host/phase-illegal/shape/SM-6 DO assertions pass.
  - [x] `npm run build` — client build green.
  - [x] (No integration script this story — set-lives is not the multi-device activation gate; the 1.7 `multi-device-join.mjs` harness is untouched.)

## Dev Notes

### What this story is (and is NOT)
- **IS:** the SERVER authority + wire for the Host setting starting Lives — `handleHostSetLives` (the new state-assignment site: clamp `lives` to 1–5, set `startingLives`, sync every Player's `lives`, persist, fan out), the `hostSetLives` dispatch route, and the client send builder. It enforces **Host-only** (`not-host`), **lobby-only** (`phase-illegal`), **clamp 1–5** (no error on out-of-range), and **default 3** (the create-time default if the Host never sets it). [Source: epics.md#Story-1.8 lines 390–404; FR-4.]
- **IS NOT:** the Lobby UI — the **Lives stepper (1–5, default 3)**, the **Lives pips** (filled = remaining neon-mint / hollow = spent), and offering/hiding the control by Host status are **Story 1.10** (UX-DR4). 1.8 ships the WIRE + server authority that backs "the control is not offered on a non-Host device"; the *offering* is the UI's job. Do NOT build the stepper or mount socket.ts into App.svelte. [Source: epics.md#Story-1.10 lines 451–452; UX-DR4 line 76.]
- **IS NOT:** the **mid-session** Lives change. `hostSetLives` here is the **pre-Deal/lobby** "set starting Lives" only. Changing Lives *between Rounds* — where Players may already be BELOW the new value, raising the **clamp-vs-top-up** question — is **Story 4.2 / FR-14** (the host-controls overlay), explicitly deferred there (`[ASSUMPTION: clamp-vs-top-up … settled in build]`, epics.md line 847). In lobby there is NO spent/remaining distinction: every Player's `lives === startingLives`, so 1.8 simply sets both to the same clamped value — **M1 does not apply to this story.** Do NOT implement any clamp-vs-top-up reconciliation. [Source: epics.md#Story-4.2 line 847; sprint-status.yaml M1 note "due before Epic 4 / Story 4-2".]
- **IS NOT:** the two-scope token guard. Lobby set-lives validation is lightweight phase-checking + DO single-threaded serialization ONLY (Decision #1). `validate.ts` and the formal phaseToken/turnToken guard are Epic 2. Do NOT create `server/src/rules/**`. [Source: architecture.md D4 lines 389–403; epics.md Decision #1.]
- **IS NOT:** Deal / per-round lives initialization. Story 2.3's Deal will initialize each active Player's round lives from `startingLives`; Story 3.4 ticks Lives down on a loss; Story 3.6 re-applies `startingLives` on "one more". This story only sets the *config value* + keeps lobby Players in sync with it. Do NOT touch dealing/turns/showdown or create `rules/**`. [Source: epics.md#Story-2.3, #Story-3.4 line 753, #Story-3.6 lines 800–801.]
- **IS NOT:** reconnection, room GC/hibernation, or any change to the frozen contract. `hostSetLives{phaseToken, lives}` and `not-host` already exist in `@trash/shared` (1.3, frozen). Consume them; do NOT add a field or a reason; do NOT enable hibernation or add an alarm (1.11). [Source: shared/src/types.ts Intent/ErrorReason — frozen.]

### The spine is live — plug `hostSetLives` into it (do NOT rebuild)
The full server spine has shipped (1.6/1.7): `onMessage` parses the `{type,payload}` envelope → `dispatch` (router + the single try/catch + lightweight phase-legality) → `handle<Intent>` (sole state-assignment, after validation) → `persistSummary` (single `"table"` key) → `pushState`/`fanOut` (sole send, per-recipient projection). 1.8 adds exactly three things: a new handler (`handleHostSetLives`), a new dispatch case, and a client send builder. The fan-out pattern is identical to join's (a roster/config change re-projects to EVERY connection). [Source: 1-7 story Dev Notes; handlers.ts/dispatch.ts/push-state.ts.]

### Host authority — the `not-host` chokepoint (NEW this story)
- The Host is `host.table.hostId` — set to `players[0].id` at create (handlers.ts:94), independent of `isAlive` (an eliminated Host keeps conducting — architecture lines 339–343). The caller's identity is `connection.state?.playerId`, stamped by dispatch on create (1.6) / join (1.7) via `setState`. The handler compares `callerPlayerId === host.table.hostId`; a mismatch (or an unstamped socket → `undefined`) throws `not-host`. [Source: dispatch.ts setState; handlers.ts hostId; architecture NFR-2/NFR-9 server-authoritative + host-only.]
- **`not-host` is first used here.** It is already in the frozen `ErrorReason` union (types.ts:175) — reserved by 1.3 for exactly this. No contract change. Future host-only intents (`hostRemovePlayer`/`hostReassign`, Epic 4) will reuse the same check; keep the host-check shape clean/reusable but do NOT prematurely extract a helper unless a second host intent lands this story (it does not).
- **NFR-2 (server-authoritative):** the client never decides authority. Even though Story 1.10 will hide the stepper on non-Host devices, the SERVER must independently refuse a non-Host `hostSetLives` (a crafted wire message bypasses any client gating). The DO test asserts this directly (AC-1.8.2). [Source: NFR-2; epics.md#Story-1.8 line 402.]

### `lives` sync — set `startingLives` AND every Player's `lives` (lobby invariant)
At create (handlers.ts:95–104) and join (handlers.ts:208), each Player's `lives` is seeded to the Table's `startingLives` — so in `lobby` the invariant is **`every players[i].lives === startingLives`**. `hostSetLives` MUST preserve it: set `startingLives = next` AND walk `players[]` setting each `p.lives = next`. (If you set only `startingLives`, the roster's Lives pips — Story 1.10 renders `players[].lives` — would show the OLD value and diverge from the stepper.) This is the lobby analogue; the per-round divergence (spent lives) only begins at Deal (2.3). No clamp/top-up subtlety because all values are equal pre-Deal. [Source: handlers.ts create/join lives seeding; epics.md#Story-1.10 line 451 "Lives pips" render players[].lives; #Story-1.8 "applies to all Players".]

### `phaseToken` & the shape-guard reason (two lobby-validation calls you must make)
- **phaseToken is carried but NOT guarded in lobby.** The frozen payload is `hostSetLives{phaseToken, lives}`, but Decision #1 says lobby uses lightweight phase-checking, NOT the two-scope guard. In `lobby`, `phaseToken` is `0` and never advances (the first bump is the Deal, Epic 2). So: accept the intent regardless of the payload's `phaseToken` value (do NOT compare it to `host.table.phaseToken`), and **do NOT bump `phaseToken`** in `handleHostSetLives` — setting config is not a phase transition (only deal/reveal/re-deal/newGame bump it — types.ts:28–35). Document this so Epic 2's `validate.ts` never starts guarding lobby set-lives. [Source: architecture.md D4 lines 389–403; types.ts phase-machine comment; Decision #1.]
- **Shape-guard reason for a malformed `lives` (AC-1.8.4).** There is no perfect frozen `ErrorReason` for "bad payload" (the contract froze a small set). Follow the established precedent: `handleCreateRoom`/`handleJoinRoom` reject a malformed payload as **`phase-illegal`** ("this request is not in a shape we can act on") — handlers.ts:73, 167, with a documented rationale. Use **`phase-illegal`** here too for a missing/non-numeric `lives`, and comment it identically (closest honest frozen reason; do NOT add a new reason). Note: out-of-RANGE numeric `lives` is NOT a shape error — it CLAMPS (AC-1.8.1). Only a non-number/absent `lives` is the shape-guard `phase-illegal`. [Source: handlers.ts:69–74, 162–168 payload-shape-guard precedent.]

### Persistence — set-lives MUST persist (unlike the presence flip)
`startingLives` and `players[].lives` are BOTH in the durable summary (`DurablePlayer` = `Pick<Player,"id"|"name"|"lives"|"isAlive"|"seatIndex">`, persistence.ts:22; `DurableSummary.startingLives`, line 27). So `handleHostSetLives` MUST `await persistSummary(host.storage, host.table)` after the mutation — a reload must see the Host's chosen value. This is the OPPOSITE of `markDisconnected` (presence is memory-only, NOT persisted, because `isConnected` is excluded from the summary). Do not confuse the two. [Source: persistence.ts DurablePlayer/DurableSummary; 1-7 markDisconnected note.]

### Idempotency / no concurrency cap (simpler than join)
Set-lives has no seat-cap race (it mutates existing fields, appends nothing), so it needs no atomic cap-check. But keep the read(`hostId`/`phase`)→decide→write(`startingLives`+`lives`)→`await persistSummary` in a tight single DO turn (the only `await` is the persist, after the in-memory mutation). Two concurrent set-lives from the same Host serialize on the DO input gate; last-write-wins is correct and harmless (both persist + fan out the authoritative value). [Source: handlers.ts atomicity discipline (create/join); architecture single-threaded DO turn.]

### Read-the-file-first + red-first proof (house style)
1.4–1.7 house style: read each seam before editing, write the failing assertion, prove it RED against the current `default → phase-illegal` route (set-lives returns a bare `error`, not an updated `tableState`), then implement handler + route + fan-out → GREEN. [Source: 1-4/1-5/1-6/1-7 stories.]

## Architecture Compliance

- **Location (on-disk workspace form authoritative):** edits to `server/src/{handlers,dispatch}.ts`; test extension `server/src/table-server.do.test.ts`; client `client/src/socket.ts`. NO new `server/src/` modules; do NOT create `server/src/rules/**` (Epic 2) or `connections.ts` (no WS-lifecycle growth this story — set-lives is an intent, not a connection event). [Source: architecture.md#Complete-Project-Directory-Structure lines 656–732; 1-2..1-7 on-disk convention.]
- **State-mutation boundary:** `handlers.ts` (`handleHostSetLives`) is the ONLY site that assigns `host.table` / writes via persistence, AFTER validation (shape → table-null → phase → host → clamp). `dispatch.ts` routes + holds the single try/catch + orchestrates the fan-out. The handler NEVER calls send/`connections()` (transport boundary). [Source: architecture.md D3 lines 514–539; handlers.ts header.]
- **Egress chokepoint (SM-6 / AR-4):** `projectStateFor` SOLE producer; `pushState`/`fanOut` (push-state.ts) SOLE sender; the set-lives fan-out is the existing `fanOut(host.connections(), host.table!)` loop — NEVER `.broadcast`. [Source: architecture.md lines 104–110, 532–538; eslint.config.js GATE 1.]
- **Single storage key (D2):** durable summary in `ctx.storage["table"]` ONLY; persist on set-lives (a durable-field change: `startingLives` + `players[].lives`). `round` stays null in lobby. [Source: architecture.md D2 lines 346–355; persistence.ts.]
- **Lobby validation (Decision #1):** lightweight phase-checking (`phase === "lobby"`) + host-check + DO serialization, NOT the Epic 2 two-scope guard (which would no-op in lobby). `hostSetLives`'s `phaseToken` is accepted-but-not-guarded; no phaseToken bump. [Source: architecture.md D4 lines 389–403; epics.md Decision #1.]
- **Import-by-name:** `import { MIN_LIVES, MAX_LIVES, IntentError } from "@trash/shared"`; `import type { Intent } from "@trash/shared"`. Never a relative path into `shared/`. `DEFAULT_LIVES` is already imported in handlers.ts (the create-time default; set-lives does not re-default). [Source: 1-3..1-7 dev notes; config.ts.]
- **Three player states never conflated:** `hostSetLives` touches `lives` (game-config, lobby = startingLives) only; it does NOT touch `isAlive` (game logic) or `isConnected` (presence). [Source: architecture.md lines 321–328.]

## Library / Framework Requirements

- **No new dependencies, server or client.** `MIN_LIVES`/`MAX_LIVES`/`DEFAULT_LIVES` are already in `@trash/shared/config.ts`. `IntentError`/`not-host`/the `hostSetLives` Intent are already in `@trash/shared` (frozen 1.3). No `uuid`/`nanoid`/`zod`/`valibot`. [Source: shared/src/config.ts lines 12–15; shared/src/types.ts Intent line 153, ErrorReason line 175.]
- Toolchain (pinned, already installed — do NOT bump): typescript 5.9.3, eslint 9.39.1, typescript-eslint 8.46.4, vitest 4.1.9, @cloudflare/vitest-pool-workers 0.16.18, @cloudflare/workers-types 4.20260619.1, wrangler 4.103.0, partyserver 0.5.8, partysocket 1.2.0, svelte 5.56.3, svelte-check 4.4.1, vite 8.0.16, vite-plugin-pwa 1.3.0. TS: `moduleResolution: "Bundler"`, `strict: true`. [Source: 1-2..1-7 package.json snapshots.]

## File Structure Requirements

**EDIT (existing — read before changing):**
- `server/src/handlers.ts` — has `handleCreateRoom` + `handleJoinRoom` + `markDisconnected` + `TableHost`/`ConnectionState`. ADD `handleHostSetLives(host, intent, callerPlayerId)` (shape guard → table-null → phase → not-host → clamp → set `startingLives` + sync `players[].lives` → persist). Add `MIN_LIVES`/`MAX_LIVES` to the existing `@trash/shared` import. Update the SCOPE header (1.7 → 1.8). Keep create/join/markDisconnected intact. Do NOT call send/`connections()` from here (boundary).
- `server/src/dispatch.ts` — has createRoom + joinRoom cases + the single try/catch. ADD a `hostSetLives` case (handler → `fanOut`, NO `setState`) BEFORE `default`. Update SCOPE header. Keep create/join cases + the single try/catch + the non-1.8 `default` rejection (gameplay intents still rejected).
- `client/src/socket.ts` — has `buildCreateRoomIntent`/`buildJoinRoomIntent`/`createRoomWithRetry`/`joinRoomAndListen`/`createSocket`. ADD a `buildHostSetLivesIntent(lives, phaseToken)` builder (+ optional thin live-socket send helper). Reuse the builder pattern; do NOT open a new socket per set-lives, do NOT auto-retry, do NOT mount into App.svelte. Keep `maxRetries:0`; preserve all 1.5/1.6/1.7 helpers.

**EDIT (test):**
- `server/src/table-server.do.test.ts` — EXTEND with set-lives round-trip + clamp (min/max) + not-host + phase-illegal (seeded non-lobby summary, mirror lines 237–259) + shape-guard + fan-out-to-both + SM-6 no-token. Reuse `openConn` (multi-event) + `createRoomRoundTrip` (single-event) + the `asTableState` helper. Keep ALL 1.6/1.7 tests.

**DO NOT TOUCH:**
- `shared/src/types.ts` — contract frozen (1.3); `hostSetLives.payload` is `{phaseToken, lives}` and `ErrorReason` includes `not-host` — CONSUME them, do NOT add fields/reasons. `shared/src/config.ts` — CONSUME `MIN_LIVES`/`MAX_LIVES`/`DEFAULT_LIVES`, do NOT change the values.
- `server/src/project-state.ts` + `server/src/project-state.test.ts` — the projector + standing SM-6 gate; `startingLives` already flows through (project-state.ts:64). CONSUME `projectStateFor`; do NOT modify it or its test.
- `server/src/persistence.ts` — CONSUME `persistSummary`/`loadSummary`/`toSummary`; `startingLives` + `players[].lives` are already durable fields. Do NOT modify.
- `server/src/identity.ts`, `server/src/room-code.ts`, `server/src/push-state.ts`, `server/src/index.ts` — CONSUME; push-state stays the sole send site (the fan-out loop calls `fanOut`). Do NOT add a `broadcast` helper.
- `server/src/table-server.ts` — NO change expected (set-lives is an Intent routed by `onMessage`→dispatch, NOT a connection-lifecycle event; `onConnect`/`onClose` are untouched). Only touch it if a genuine, documented need arises.
- `eslint.config.js`, `server/vitest.config.ts`, `server/wrangler.jsonc`, tsconfigs, `client/src/App.svelte`, `client/src/main.ts` — untouched (no integration runner this story).
- `server/test/integration/**` — untouched (set-lives is not the multi-device activation gate; the 1.7 harness stays as-is).
- Do NOT create `server/src/rules/**` (Epic 2).

**MUST PRESERVE (regression guardrails):**
- System green end-to-end: `scaffold.*`, `identity.test.ts`, the standing SM-6 `project-state.test.ts`, and ALL 1.6/1.7 createRoom/claim/join/bad-code/late-join/room-full/concurrency/presence/SM-6 DO tests keep passing; all ESLint gates green; client build + typecheck green.
- SM-6 survives the set-lives fan-out: each recipient is projected with ITS OWN `playerId` (never a single broadcast); `startingLives` is public; no `sessionToken` reaches any device. Assert the no-token negative on the set-lives payloads.
- Do NOT weaken any ESLint gate to compile/lint (standing 1.2–1.7 rule). The fan-out uses `fanOut`/`pushState`, not `.broadcast`.
- Do NOT introduce `.send`/`.broadcast` outside push-state.ts; do NOT introduce a per-field storage key; do NOT add a runtime validation lib; do NOT enable hibernation or add an alarm; do NOT bump `phaseToken` for set-lives.

## Testing Requirements

- **Test-file naming is convention-enforced (deferred-work #31):** `*.test.ts` → node `rules` project; `*.do.test.ts` → `do` (pool-workers) project. The set-lives round-trip needs a real WS upgrade against the DO → it belongs in `table-server.do.test.ts` (the `do` project). Do NOT put a WS test in a bare `*.test.ts` (it would run in the node project with no DO). [Source: server/vitest.config.ts; deferred-work #31.]
- **`table-server.do.test.ts` (DO project) — EXTEND:** AC-1.8.1 set → both host + guest receive `tableState` with `startingLives === N` and every `players[].lives === N`; AC-1.8.1 clamp → `lives:9 → 5`, `lives:0 → 1`, no error; AC-1.8.2 not-host → guest set-lives → `error{reason:"not-host"}`, authoritative value unchanged; AC-1.8.3 phase-illegal → seeded non-lobby summary → `error{reason:"phase-illegal"}`; AC-1.8.4 shape → missing/non-number `lives` → clean typed `error`, no hang; AC-1.8.5 SM-6 → no `sessionToken` in any set-lives payload. Reuse `openConn`/`createRoomRoundTrip`/`asTableState`.
- **No client test this story** — client workspace has no runner (deferred-work #29). `socket.ts` verified by `svelte-check`/`tsc -b` + `vite build` + structural review.
- **Red-first proof (house style):** extend the DO test with the AC-1.8.1 set assertion, run it against the current `default → phase-illegal` route, watch it FAIL (set-lives returns a bare `error`, not an updated `tableState`), then implement `handleHostSetLives` + the route + fan-out → GREEN.
- Run the full gate before marking done: `npm run typecheck && npm run lint && npm test && npm run build`. (No integration script this story.)

## Previous Story Intelligence (Story 1.7)

- **The fan-out pattern is the load-bearing reuse:** 1.7's `fanOut(host.connections(), host.table!)` (push-state.ts) re-projects a roster/config change to EVERY connection, each with its own `you`. Set-lives reuses it verbatim — a `startingLives` change is exactly the same "everyone must re-render" event as a join. Do NOT broadcast; do NOT project once. [Source: 1-7 fan-out Dev Notes; dispatch.ts joinRoom case lines 49–58.]
- **`connection.state?.playerId` is the caller-identity read** — dispatch stamps it on create/join via `setState`; the join re-seat guard reads it (handlers.ts:191; dispatch.ts:52). Set-lives reads the SAME stamp to identify the Host. An unstamped socket → `undefined` → `not-host` (correct: a socket that never created/joined cannot be Host). [Source: 1-7 re-seat guard; dispatch.ts:52.]
- **Payload-shape-guard precedent:** `handleCreateRoom` (handlers.ts:72) and `handleJoinRoom` (handlers.ts:166) reject a malformed payload as `phase-illegal` with a documented rationale (a raw TypeError would not be an IntentError → client hangs). Copy this exactly for `lives`. [Source: handlers.ts:69–74, 162–168.]
- **Atomic discipline:** 1.6/1.7 keep the decision→write in one DO turn with no intervening `await`. Set-lives's only `await` is `persistSummary`, after the in-memory mutation. No cap-check needed (no append). [Source: 1-6/1-7 atomicity notes.]
- **`onStart`-before-`onMessage` is SAFE** (confirmed 1.6 review): a warm/claimed Table's `host.table` is non-null by the time the handler runs. A null table at set-lives ⇒ never claimed ⇒ `phase-illegal` (defensive — unreachable via the shipped client). [Source: 1-6 Review Findings.]
- **GATE 1 is refined, not loosened:** `.send` allowed in `client/src/socket.ts` + `server/src/**/*.do.test.ts`; `.broadcast` STILL banned everywhere except push-state.ts (which never broadcasts). The set-lives fan-out is a `fanOut`/`pushState` call. [Source: 1-6/1-7 eslint.config.js refinement.]

## Git Intelligence

- `1cd161a Story 1.7: join a Table & live multi-device roster + code review` (baseline) — added `handleJoinRoom` + `markDisconnected` (handlers.ts), the `joinRoom` dispatch route + the `fanOut` loop (push-state.ts), `onClose` presence (table-server.ts), `joinRoomAndListen` + fail-loud `VITE_WS_URL` (socket.ts), and +7 DO test assertions. 1.8 runs against this green tree; consume the spine + the fan-out, extend `handlers`/`dispatch`/`socket.ts`/the DO test. [git log; 1-7 File List.]
- `2df8b90 Story 1.6: create a Table & get a Room Code` — the server spine (`handleCreateRoom`, `dispatch` router + single try/catch, `pushState`/`pushError`, `persistence`, `table-server` lifecycle), client createRoom helpers, the DO test harness (`createRoomRoundTrip`/`openConn`), GATE 1 refinement. The `hostId`/`startingLives`/`players[].lives` seeding 1.8 reads. [1-6 story.]
- `8874b9c Story 1.3: shared wire contract` — FROZE `@trash/shared`: `hostSetLives{phaseToken,lives}`, `ErrorReason` incl. `not-host`, `MIN_LIVES`/`MAX_LIVES`/`DEFAULT_LIVES`. Consume; do NOT modify.
- `908a80d Story 1.4: privacy chokepoint + SM-6 test` — `project-state.ts` + the standing gate the set-lives fan-out must route through per-recipient and keep green (`startingLives` already projected, line 64).

## Spike Intelligence (Story 1.1) — relevant to 1.8

- **Persistence boundary:** the durable summary persists `{code,phase,hostId,startingLives,players[id,name,lives,isAlive,seatIndex],phaseToken}`. So a set-lives change to `startingLives` + `players[].lives` IS durable and MUST persist (the opposite of the memory-only presence flip). [Source: 1-1-spike-findings AC2; persistence.ts DurablePlayer/DurableSummary.]
- **`onStart` hydrates before the first `onMessage`** — a warm/claimed Table is non-null when set-lives runs (the host must have created/joined first). [Source: 1-1-spike-findings; 1-6 Review.]
- **GC/hibernation is NOT this story** (1.11). Do NOT enable hibernation or add an alarm. [Source: 1-1-spike-findings AC3; epics.md#Story-1.11.]

## Project Structure Notes

- Alignment: architecture.md#Complete-Project-Directory-Structure is canonical (on-disk `server/src/...` form authoritative). 1.8 edits `handlers.ts`/`dispatch.ts`/`socket.ts`, extends `table-server.do.test.ts`. No new module.
- **No `connections.ts` peel:** the table-server WATCH note ("peel WS-lifecycle into connections.ts only if it grows") is NOT triggered — set-lives adds no connection-lifecycle code (it is an Intent handled by dispatch; `onConnect`/`onClose` untouched). Keep `table-server.ts` as-is. [Source: table-server.ts WATCH note; 1-7 Project Structure Notes.]
- **No `validate.ts` / `rules/**`:** lobby set-lives is lightweight phase+host checking (Decision #1). The pure rule engine + `validate.ts` (two-scope guard) are Epic 2. Do NOT create them. [Source: architecture.md D4; epics.md Decision #1.]
- Variance: architecture writes paths logically (`src/server/...`) and on-disk (`server/src/...`); the on-disk form is authoritative (proven 1.2–1.7).

### References

- [Source: epics.md#Epic-1 lines 214–218 — epic objective ("the Host sets Lives" in the live shared lobby), FR-1..4]
- [Source: epics.md#Story-1.8 lines 390–404 — user story + AC (Host sets Lives 1–5 default 3 in lobby, applies to all Players; non-Host refused not-host, control not offered)]
- [Source: epics.md#Story-1.10 lines 438–452 — Lobby surface renders the Lives stepper (1–5, default 3) + Lives pips (the UI half, NOT this story)]
- [Source: epics.md#Story-2.3 / #Story-3.4 line 753 / #Story-3.6 lines 800–801 — Deal initializes per-round lives from startingLives; loss ticks lives down; "one more" re-applies startingLives]
- [Source: epics.md#Story-4.2 line 847 — mid-session Lives change + the clamp-vs-top-up open decision (M1), DEFERRED to Epic 4, NOT this story]
- [Source: epics.md Decision #1 lines 149–150 — Epic 1 create/join/set-lives uses lightweight phase validation only, NOT the two-scope guard; Decision #2 — full state shape up front]
- [Source: architecture.md round-trip lines 514–538 — the fan-out `for (const c of getConnections()) pushState(c)` + the ✅/❌ no-broadcast example (per-recipient projection)]
- [Source: architecture.md D3 lines 365–387 — single tableState event pushed on every state change; host-controls (incl. hostSetLives) carry phaseToken]
- [Source: architecture.md D4 lines 389–403 — two-scope guard is Epic 2; lobby relies on DO serialization + lightweight checking; phaseToken bumped only on Host transitions (deal/reveal/re-deal/newGame), NOT set-lives]
- [Source: architecture.md D1 lines 316–328 — three player states (isAlive/isConnected/lives) never conflated; Host conducts independent of isAlive]
- [Source: architecture.md D2 lines 346–355 — single ctx.storage["table"] key; startingLives + players[].lives durable; round memory-only]
- [Source: architecture.md lines 104–110, 532–538 — projectStateFor SOLE producer; pushState/fanOut SOLE sender; .broadcast banned]
- [Source: architecture.md NFR-2 / NFR-9 — server validates Host-only actions; no game-deciding logic on the client; host-only controls never appear on a Player surface]
- [Source: shared/src/types.ts:148–155 — Intent hostSetLives{phaseToken,lives} (frozen); lines 170–178 ErrorReason incl. not-host (frozen); TableState.startingLives line 86; Player.lives line 55]
- [Source: shared/src/config.ts:12–15 — DEFAULT_LIVES 3, MIN_LIVES 1, MAX_LIVES 5]
- [Source: server/src/handlers.ts — handleCreateRoom (hostId/startingLives/lives seeding lines 94–104), handleJoinRoom (lives = startingLives line 208), markDisconnected (memory-only presence — the persist contrast), TableHost/ConnectionState, payload-shape-guard precedent lines 69–74/162–168; ADD handleHostSetLives]
- [Source: server/src/dispatch.ts — createRoom + joinRoom cases + the single try/catch + setState binding (line 52 reads connection.state) + the non-1.x default rejection; ADD the hostSetLives case]
- [Source: server/src/push-state.ts — pushState/pushError/fanOut (the fan-out the set-lives case reuses; sole send site); server/src/project-state.ts — projectStateFor projects startingLives (line 64), SOLE producer; server/src/persistence.ts — DurablePlayer/DurableSummary carry startingLives + lives (durable → must persist)]
- [Source: server/vitest.config.ts — node "rules" / pool "do" projects; set-lives WS round-trip belongs in *.do.test.ts; test-naming trap deferred-work #31]
- [Source: server/src/table-server.do.test.ts — createRoomRoundTrip (single-event) + openConn (multi-event) + asTableState helpers; late-join seed pattern lines 237–259; SM-6 no-token assertion shape lines 383+; EXTEND with set-lives cases]
- [Source: eslint.config.js — GATE 1 .send/.broadcast ban (push-state.ts exempt; socket.ts + *.do.test.ts exempt for .send only)]
- [Source: client/src/socket.ts — buildCreateRoomIntent/buildJoinRoomIntent builder pattern, joinRoomAndListen, createSocket maxRetries:0; ADD buildHostSetLivesIntent]
- [Source: 1-7 story — fan-out pattern, connection.state caller-identity, payload-shape-guard precedent, atomicity, onStart-before-onMessage SAFE, GATE 1 refinement]
- [Source: 1-1-spike-findings AC2 (persistence boundary → set-lives MUST persist), AC3 (hibernation/GC = 1.11)]
- [Source: sprint-status.yaml M1 note — hostSetLives clamp-vs-top-up due before Epic 4 / Story 4-2 — confirms the mid-session decision is NOT this (lobby) story]

## Dev Agent Record

### Agent Model Used

Opus 4.8 (1M context) — claude-opus-4-8[1m]

### Debug Log References

- RED proof: ran `npx vitest run --project do -t "1.8"` against the current `default → phase-illegal` route — 5 of the 6 new cases FAILED (set-lives returned a bare `error` instead of an updated `tableState`; the AC-1.8.2 guest send got `phase-illegal` not `not-host`). The lone pass was AC-1.8.3 (it expects `error`, which the default route already produced). After implementing `handleHostSetLives` + the dispatch route + fan-out: all 6 GREEN.
- Full gate: `npm run typecheck` (shared+server tsc -b + client svelte-check) 0 errors; `npm run lint` 0 errors (GATE 1 intact); `npm test` 27/27 pass (6 files); `npm run build` green (PWA precache regenerated).

### Completion Notes List

- **Server authority shipped.** `handleHostSetLives(host, intent, callerPlayerId)` is the new sole state-assignment site for set-lives: shape-guard → table-null → phase (`lobby`-only) → host (`not-host`) → clamp (1–5, `Math.trunc` + `Math.max/min`) → set `startingLives` AND sync every `players[].lives` → `persistSummary`. The dispatch `hostSetLives` case calls it then `fanOut(host.connections(), host.table!)`; no `setState` (caller already stamped). This is the **first use of the frozen `not-host` ErrorReason** — thrown directly, no contract change.
- **Shape-guard reason = `phase-illegal`** (a missing/non-finite `lives`), following the exact documented `handleCreateRoom`/`handleJoinRoom` precedent (closest honest frozen reason; out-of-RANGE numeric `lives` is NOT a shape error — it clamps). No new ErrorReason added.
- **`phaseToken` accepted-but-not-guarded and NOT bumped** — set-lives is config, not a phase transition (Decision #1). The AC-1.8.1 test asserts `phaseToken` stays 0 after a set.
- **Persisted (unlike the presence flip):** `startingLives` + `players[].lives` are both durable fields, so the handler `await persistSummary` after the in-memory mutation (the only `await`). The AC-1.8.2 not-host test inspects the persisted summary via `runInDurableObject` to confirm the authoritative value is unchanged on refusal.
- **Client wire decision (Task 4):** shipped `buildHostSetLivesIntent(lives, phaseToken)` + a thin `sendIntent(socket, intent)` helper — **builder-only is the sanctioned outcome here.** `createRoomWithRetry`/`joinRoomAndListen` resolve and detach their own listeners, so the Host Lobby surface (Story 1.10) owns the kept-open socket's lifecycle + liveness; mounting the stepper + receive loop is 1.9a/1.10 (UX-DR4). `socket.ts`'s `.send` rides the existing GATE 1 exemption (eslint.config.js line 96). No new socket per set-lives, `maxRetries:0` preserved, App.svelte untouched.
- **Scope held:** no `validate.ts`/`rules/**`, no contract/config change, no hibernation/alarm, no integration runner. No mid-session clamp-vs-top-up (M1 / Story 4.2) — lobby keeps every Player equal to `startingLives`. All 1.6/1.7 DO tests still pass.

### File List

- `server/src/handlers.ts` — MODIFIED: added `handleHostSetLives`; added `MIN_LIVES`/`MAX_LIVES` to the `@trash/shared` import; updated SCOPE header (1.7 → 1.8).
- `server/src/dispatch.ts` — MODIFIED: added the `hostSetLives` case (handler → `fanOut`, no `setState`); imported `handleHostSetLives`; updated SCOPE + LOBBY-VALIDATION + FAN-OUT header comments.
- `server/src/table-server.do.test.ts` — MODIFIED: added 6 Story 1.8 tests (set+fan-out+lives-sync, clamp, not-host, phase-illegal, shape-guard, SM-6); added `MIN_LIVES`/`MAX_LIVES` to the `@trash/shared` test import.
- `client/src/socket.ts` — MODIFIED: added `buildHostSetLivesIntent(lives, phaseToken)` builder + `sendIntent(socket, intent)` thin live-socket send helper (wire only; no UI/mount).
- `_bmad-output/implementation-artifacts/1-8-host-sets-starting-lives.md` — MODIFIED: tasks checked, Dev Agent Record, File List, Change Log, Status → review.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — MODIFIED: 1-8 status ready-for-dev → in-progress → review.

## Change Log

| Date       | Change                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| 2026-06-19 | Story 1.8 implemented: `handleHostSetLives` (server authority — clamp/host-only/lobby-only/persist/sync), `hostSetLives` dispatch route + fan-out, client `buildHostSetLivesIntent`/`sendIntent` wire, +6 DO tests. Full gate green (typecheck/lint/27 tests/build). Status → review. |
| 2026-06-19 | Code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor): all 5 ACs + all Dev-Notes constraints SATISFIED. 0 decision-needed, 0 patch, 2 defer (both forward/pre-existing seams), 9 dismissed as noise/false-positive. Status → done. |

## Review Findings

_Code review 2026-06-19 — three adversarial layers (Blind Hunter / Edge Case Hunter / Acceptance Auditor). Acceptance Auditor confirmed all five ACs and every Dev-Notes constraint SATISFIED. No actionable defects. 9 findings dismissed as noise or false positives (`phaseToken` accepted-but-not-guarded is per AC-1.8.3; shape-guard `phase-illegal` is the documented frozen-reason precedent; `hostId` is always a server-issued playerId so the "undefined hostId priv-esc" path is unreachable; tests ARE present in the diff; `host.table!` is safe under the single-threaded DO input gate; `Math.trunc` normalization is sanctioned by AC-1.8.1). The two findings below are deferred — neither is a defect in 1.8's scope._

- [x] [Review][Defer] `sendIntent` does not guard socket `readyState` / has no send-failure path [client/src/socket.ts] — deferred, forward seam (Story 1.9a/1.10 owns lobby socket liveness/mounting)
- [x] [Review][Defer] Mutate-then-`persistSummary` is not atomic on a storage-write failure [server/src/handlers.ts:292-294] — deferred, pre-existing convention (identical ordering in `handleCreateRoom`:113-114 and `handleJoinRoom`:216)
- [x] [Review][Defer] AC-1.8.2 "no fan-out to others" not positively asserted via a second open socket [server/src/table-server.do.test.ts] — deferred, test-coverage hardening only (the code path is correct: the `not-host` throw precedes `fanOut`)
