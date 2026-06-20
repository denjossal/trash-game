---
baseline_commit: 51bb807
---

# Story 1.6: Create a Table and get a Room Code

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Host,
I want to create a Table from my browser and get a short code to read aloud,
so that I can start a game in seconds with no account, email, or install.

## Acceptance Criteria

**AC-1.6.1 — `createRoom{name}` creates a server-side Table; creator becomes Host + first Player; a 4-letter Room Code is returned.**
Given a browser with no account/session,
When the Host sends `createRoom{name}`,
Then a new Table is created server-side, the creator becomes Host (`hostId === creator playerId`) and first Player (`players[0]`, `seatIndex 0`, `isAlive true`, `isConnected true`), the Table is delivered back as a `tableState` event whose `code` is the Room Code,
And the code is **4 uppercase letters from the ambiguity-safe alphabet** (`ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ"` — excludes O,0,I,1,L; `ROOM_CODE_LEN = 4`), generated via **`crypto.getRandomValues()`** (NOT `Math.random()`). *(FR-1, AR-11; epics.md#Story-1.6 lines 349–352.)*

**AC-1.6.2 — Claim-on-create: a generated code that addresses an already-claimed (active) DO triggers regenerate + retry.**
Given code generation,
When a generated code addresses an already-claimed (active) DO,
Then the server regenerates a fresh code and retries (claim-on-create — the DO namespace IS the registry; no central store). The claim read+write MUST be **atomic within the DO's single-threaded turn** so two simultaneous creates of the same code cannot both observe "unclaimed". *(epics.md#Story-1.6 lines 354–356; 1-1-spike-findings AC1 + the [Story 1.6] claim-on-create-race follow-up.)*

**AC-1.6.3 — A freshly created Table is in `lobby` phase; lobby validation is lightweight phase-checking only (NOT the Epic 2 two-scope guard).**
Given no Player has joined yet,
When the Host creates the Table,
Then the Table is in `phase: "lobby"`, `round: null`, `phaseToken: 0`, `startingLives: DEFAULT_LIVES (3)`, and validation at this stage is lightweight phase-checking only — NOT the formal two-scope token guard (which arrives in Epic 2). The lobby's reliance on the DO's single-threaded serialization + lightweight phase-checking is documented so Epic 2's guard never reroutes lobby actions. *(Decision #1; epics.md#Story-1.6 lines 358–360.)*

## Tasks / Subtasks

> **TDD order (test-first, per the house style proven in 1.4/1.5): write the failing test, watch it fail against the current stub, then green it.** The createRoom round-trip is exercised by a **`*.do.test.ts`** (the `do` / pool-workers vitest project — it can drive `env.Table.idFromName(...).fetch(...)` against a real DO in the Workers runtime). Room-code generation is a **pure** unit testable in the node `rules` project via a `*.test.ts` — but `room-code.ts` lives in `server/src/` (NOT `rules/**`) because it uses `crypto.getRandomValues()`.

- [x] **Task 1 — Implement `room-code.ts`: crypto code generation (AC: 1, 2)** *(test-first — wrote Task 2's assertions first, RED against `export {}` (`generateRoomCode is not a function`, 3/3), then GREEN)*
  - [x] Read `server/src/room-code.ts` first — it is a seam stub (`export {}` + header comment citing D7/AR-11/spike). Replaced the stub body; KEPT + updated the header (SCOPE now records Story 1.6 generation; claim wired in table-server.ts).
  - [x] Export a **pure** `generateRoomCode(): string` returning `ROOM_CODE_LEN` (4) chars drawn uniformly from `ROOM_CODE_ALPHABET` via `crypto.getRandomValues(new Uint8Array(...))`. Both constants imported by name from `@trash/shared` — alphabet/length NOT hard-coded.
  - [x] **Modulo bias avoided:** rejection sampling — reject bytes ≥ `MAX_UNBIASED_BYTE = floor(256/22)*22 = 242`, redraw. Documented in a comment. Pinned by the in-range-over-1000-draws test in Task 2.
  - [x] `crypto.getRandomValues()` native global — NO import, NO npm dependency. `room-code.ts` is in `server/src/`, NOT `rules/**`, so GATE 2 purity does not apply; `crypto` is legitimate here.
  - [x] Claim logic NOT in `room-code.ts` — generation is pure; the `ctx.storage` claim read/write lives in `table-server.ts` (Task 3). `room-code.ts` stays pure-and-testable.

- [x] **Task 2 — Author `room-code.test.ts` (pure generation unit test, node `rules` project) (AC: 1, 2)**
  - [x] Created `server/src/room-code.test.ts` (`*.test.ts` → node `rules` project; pure, no WS/DO).
  - [x] Asserts 4-char output; every char ∈ `ROOM_CODE_ALPHABET`; NO char ∈ `{O,0,I,1,L}` (explicit negative — AR-11 ambiguity-safety).
  - [x] Over 1000 draws: every char in-range (catches modulo-bias overrun) + >1 distinct code (catches a constant regression).
  - [x] Imports `ROOM_CODE_ALPHABET`/`ROOM_CODE_LEN` from `@trash/shared` (import-by-name) so the test pins against the SAME constants production uses. 3/3 GREEN.

- [x] **Task 3 — Wire the DO connection lifecycle + claim-on-create in `table-server.ts` (AC: 1, 2, 3)**
  - [x] Read `server/src/table-server.ts` first (empty class). Added the lifecycle (`onStart`/`onConnect`/`onMessage`) + `table` field + `storage` getter; `implements TableHost`. Kept/updated the header + WATCH comment. State generic unchanged (`Record<string,never>`).
  - [x] **Hibernation OFF** — no `static options = { hibernate: true }`. Documented as Story 1.11's job (spike AC3). Default standard accept mode.
  - [x] **Room code IS the DO name** — `code: this.name` (= `ctx.id.name`, from the URL the client picked). DO does not rename itself.
  - [x] **Claim flow** — client picks the candidate + connects; the DO claims or rejects. `handleCreateRoom` does the atomic claim: `host.table !== null` (warm) OR `loadSummary() !== undefined` (cold) ⇒ already-claimed ⇒ `IntentError`; else build + persist (the claim-write). No `await` between the claim-decision and the warm check; cold check + persist are gated by the DO input gate serializing the whole `onMessage` turn. Used the persisted summary as the claim record — single `"table"` key, no second marker key needed.
  - [x] `onConnect` — minimal (no mutation/send); the createRoom intent drives the first push. Re-projecting to a late connection is Story 1.7. (Override declares fewer params — valid.)
  - [x] `onMessage` — parses the `{type,payload}` envelope to `Intent`, delegates to `dispatch`. Never mutates/sends. Non-string / malformed-JSON / non-envelope messages dropped silently (lightweight lobby handling; no validation lib, no error-channel abuse).
  - [x] Authoritative `TableState` held as the `table` instance field, hydrated from `ctx.storage` in `onStart` via `reconcileSummaryToState` (cache-only per Init AC5). Round always `null` in 1.6 so D2.1 coercion no-ops; the seam lives in persistence.ts.

- [x] **Task 4 — Implement `dispatch.ts`: intent router + phase-legality + the single error-catch site (AC: 1, 3)**
  - [x] Read the stub; implemented `dispatch(host, connection, intent)`. Header SCOPE updated.
  - [x] Routes by `intent.type`; `createRoom` is the only live route. `joinRoom` + all gameplay intents hit the `default` branch → `IntentError("phase-illegal")` (explicit rejection, never a silent accept).
  - [x] **Single try/catch → IntentError → `error` event** via `pushError` (push-state.ts). Non-IntentError rethrows (real bug surfaces). Only catch-and-send site.
  - [x] **Lightweight phase-legality only** documented in the header (Decision #1) so Epic 2's two-scope guard never reroutes lobby actions. `createRoom` carries no token (payload `{name}` only).

- [x] **Task 5 — Implement `handlers.ts` (handleCreateRoom), `persistence.ts` (summary write/load), `push-state.ts` (the send site) (AC: 1, 2, 3)**
  - [x] **`handlers.ts`** — `handleCreateRoom(host, intent)` (sole state-assignment site). Issues identity via `issueIdentity()`; `playerId` → `hostId` + `players[0].id`. Builds `TableState` `{ code: host.name, phase:"lobby", hostId, startingLives: DEFAULT_LIVES, players:[{seat 0, alive, connected, lives:3}], round:null, phaseToken:0 }`. Assigns `host.table` then `persistSummary` (the claim-write). Returns the host `playerId`. **Token-delivery decision: the `sessionToken` is NOT delivered this story** — its only consumer is the joinRoom echo / reconnection FLOW (Story 1.7+ / deferred), `ServerEvent` is frozen to `tableState|error` (no third event), `createRoom.payload` is frozen to `{name}`, and the projection carries `you.playerId` (the public key the client needs). Token stays server-side; documented in the handler. No projection leak.
  - [x] **`persistence.ts`** — `TABLE_KEY="table"`, `toSummary`/`persistSummary`/`loadSummary` against the single key; `DurableSummary` = exactly `{code,phase,hostId,startingLives,players[{id,name,lives,isAlive,seatIndex}],phaseToken}` (drops `round` + `isConnected`). `reconcileSummaryToState` = the D2.1 coercion seam (live-round phase + lost round ⇒ `roundResult` + `phaseToken+1`); no-ops for lobby. No per-field keys.
  - [x] **`push-state.ts`** — `pushState(connection, state, playerId)` sends `{type:"tableState", payload: projectStateFor(...)}`; `pushError(connection, reason)` sends the `error` event. The ONLY `.send` site for server game-state egress; calls `projectStateFor` (never serializes raw `TableState`). Minimal `Sendable` type so it doesn't import partyserver. Fan-out is the caller's loop (1.7), never `broadcast`.

- [x] **Task 6 — Client: wire `createRoom` send + code-candidate generation + retry into `socket.ts` (AC: 1, 2)**
  - [x] Read `socket.ts` first (1.5). Extended MINIMALLY; NOT mounted into `App.svelte`. 1.5's helpers/`maxRetries:0`/localStorage-try-catch preserved.
  - [x] Added `buildCreateRoomIntent(name)` → `{type:"createRoom", payload:{name}}`, `generateCandidateCode()` (rejection-sampled, mirrors the server generator), and `createRoomWithRetry(name)` (connects to a candidate, sends createRoom, on an `error` regenerates + reconnects transparently). **Generator-location decision: a small client-side candidate generator drawing from the SAME frozen `@trash/shared` `ROOM_CODE_ALPHABET`/`ROOM_CODE_LEN`** — one source of truth for the alphabet (no divergence), without moving `crypto` generation into `@trash/shared`. Server `room-code.ts` stays the server authority; the client candidate is validated by the DO's claim.
  - [x] Reconnect stays disabled (`maxRetries:0`). Session-token persistence on `tableState` is a no-op this story (token not delivered — see Task 5); `persistSessionToken` remains for the 1.7 echo path.
  - [x] **Client test reality** — no client test added; verified by `svelte-check`/`tsc -b` (99 files, 0 errors) + `vite build` + structural review. Server round-trip covered by the `*.do.test.ts`.

- [x] **Task 7 — Author `table-server.do.test.ts`: createRoom round-trip + claim-retry (DO project) (AC: all)**
  - [x] Created `server/src/table-server.do.test.ts` (`*.do.test.ts` → `do` project). Drives a REAL WebSocket upgrade via `SELF.fetch("/parties/table/<CODE>", {headers:{Upgrade:"websocket"}})` → exercises the actual `onConnect`/`onMessage` path (not an RPC shortcut). Added `SELF` to `env.test.d.ts`.
  - [x] **AC-1.6.1/1.6.3:** asserts `tableState` → `phase:"lobby"`, `phaseToken:0`, `startingLives:3`, `revealed:false`, `currentTurnId`/`turnToken` absent; `code` = addressed name + 4 ambiguity-safe chars; `players.length===1`, player at seat 0 alive/connected/lives 3; `hostId===you.playerId===players[0].id`, `you.isHost`.
  - [x] **AC-1.6.2:** same-code re-create → `error` (client regenerates); a DIFFERENT code claims cleanly (`tableState`).
  - [x] **SM-6:** asserts the serialized `tableState` payload contains no `sessiontoken` (case-insensitive) and no token on `you`/`players[]`.
  - [x] **Concurrent-claim note** in the header: single-threaded-turn argument + real concurrency is Story 1.7's `wrangler dev` job; pool can't drive concurrent WS.

- [x] **Task 8 — Green the full gate suite (AC: all)**
  - [x] `npm run typecheck` passes — shared+server clean; client `svelte-check` 99 files / 0 errors. (Added `SELF` to `env.test.d.ts` so the DO test typechecks.)
  - [x] `npm run lint` passes — 0 errors. GATE 1 refined (push-state.ts still the sole SERVER-egress send; `client/src/socket.ts` + `*.do.test.ts` exempted for `.send` ONLY — client→server intents, not server egress; `.broadcast` still banned for them). GATE 2 untouched; no `rules/**` files created.
  - [x] `npm test` passes — 13 tests / 6 files (4 prior + 3 room-code + 3 DO round-trip; wait — 7 prior). Re-counted: 13 total = 7 prior (scaffold node, scaffold do, 3 identity, 2 project-state) + 3 room-code + 3 DO. Standing SM-6 `project-state.test.ts` + both scaffolds green.
  - [x] `npm run build` passes — client, 109 modules; `socket.ts` typechecked via `tsc -b`.

## Dev Notes

### What this story is (and is NOT)
- **IS:** the first END-TO-END server round-trip — `createRoom{name}` → DO connection lifecycle (`onConnect`/`onMessage`) → `dispatch` (router + single error-catch + lightweight phase-legality) → `handleCreateRoom` (the sole state-assignment site) → `persistence` (durable summary to `ctx.storage["table"]`) → `pushState` (the sole `.send` site, wrapping `projectStateFor`). Plus `room-code.ts` crypto generation and the DO **claim-on-create** (atomic within the single-threaded turn — the spike's 1.6 follow-up). Plus the minimal client `socket.ts` extension to send `createRoom` with a candidate code and retry on claim conflict.
- **IS NOT:** `joinRoom`. The join flow, the live multi-device roster, `bad-code`/expired handling, and the concurrent-join `wrangler dev` integration test are **Story 1.7** — leave `joinRoom` an unimplemented seam (do NOT silently accept it). [Source: epics.md#Story-1.7 lines 362–389.]
- **IS NOT:** dealing/turns/showdown/host-controls — those handlers (`deal`/`swap`/`revealAll`/`hostSetLives`/...) are Epics 2–4. Route them as not-implemented; do NOT stub gameplay logic.
- **IS NOT:** the two-scope token guard. Lobby validation is lightweight phase-checking + DO serialization ONLY (Decision #1). The `validate.ts` guard is Epic 2 (`server/src/rules/validate.ts` — does not exist yet). [Source: architecture.md D4 lines 399–400; epics.md#Story-1.6 line 360.]
- **IS NOT:** room GC / hibernation / the idle TTL alarm. Hibernation stays OFF (user-confirmed); `getWebSockets()`-vs-`getConnections()` GC probe + the 3h alarm are **Story 1.11**. Do NOT add `static options = { hibernate: true }` or an alarm. [Source: 1-1-spike-findings AC3; epics.md#Story-1.11 lines 458–488.]
- **IS NOT:** reconnection. Identity KEYING ships (it already did, 1.5); the resumption/retry FLOW is an explicit non-goal. `socket.ts` keeps `maxRetries: 0`. [Source: 1-5 story; architecture.md Deferred lines 139–140.]

### The chicken-and-egg of a server-generated code (resolved)
The architecture says "`createRoom` generates a code, derives the DO by `idFromName(code)`" — but a DO **cannot choose its own name**; the name comes from the URL the client connects to (`/parties/table/<name>` → `routePartykitRequest` → `idFromName(name)` → `this.name === ctx.id.name`). The spike (AC1) proved the resolution: **the CLIENT generates a candidate code and connects to that DO; the DO self-claims on first init or reports already-claimed; the client regenerates + retries on a conflict.** So:
- `generateRoomCode()` (pure, `room-code.ts`) is the candidate generator. The CLIENT calls it to pick `/parties/table/<candidate>`.
- The DO's `code` is simply `this.name` — it does not generate or rename itself.
- The claim authority is the DO (single-threaded `ctx.storage` read+write), NOT a central registry.
- **Open implementation choice to settle in code (flagged in Task 6):** should `generateRoomCode()` live in `@trash/shared` so client and server share ONE alphabet/generator, or stay server-side with the client holding its own candidate generator? **Prefer a single shared generator** to guarantee client and server never diverge on the alphabet — but `crypto.getRandomValues()` in `@trash/shared` is fine (shared is not purity-gated; only `server/src/rules/**` is). If you move it to shared, update the import sites and keep the test in the node project. Whichever you choose, the EXCLUDED-char property (no O,0,I,1,L) must hold and be tested.

### Claim-conflict has NO dedicated `ErrorReason` — resolve without touching the frozen contract
The `ErrorReason` union (`stale-turn | stale-phase | not-your-turn | not-host | bad-code | room-full | phase-illegal`) has **no `code-taken`/`code-claimed` reason**, and the contract is FROZEN (1.3 — do NOT add one). So the claim-conflict signal to the client cannot be a new `ErrorReason`. Resolve it one of these ways (pick + document):
- **Preferred — make claim-conflict invisible to the user (it already is by design):** a code collision is ~1-in-200k. The client regenerates + reconnects transparently; the human never sees an error. The server can signal "already claimed" via a benign mechanism the client treats as "retry with a new candidate" — e.g. close the socket / refuse the create without surfacing a user-facing `error`, and the client's retry loop (Task 6) picks a fresh code. This keeps the frozen `ErrorReason` union honest (none of its reasons mean "code taken") and matches the spike's `{result: "ALREADY_CLAIMED"}` being a control signal, not a game error.
- If you DO route it through the `error` channel, you must reuse an existing reason — there is no honest fit (`bad-code` means "the code you tried to JOIN doesn't exist", the opposite of "this code is taken"). Prefer the non-`error` control path above over overloading `bad-code`. Whatever you choose, the **user never sees a failure for a transparent collision retry**, and you do NOT modify `shared/src/types.ts`. [Source: shared/src/types.ts:171–178 frozen ErrorReason; 1-1-spike-findings AC1 control-signal shape.]

### Claim-on-create atomicity (the spike's explicit 1.6 follow-up — do not miss this)
The spike (1-1-spike-findings, follow-up "[Story 1.6] claim-on-create race") requires: **the claimed-marker read+write must be atomic within the DO's single-threaded turn — no two creators both seeing "unclaimed".** DO turns are single-threaded, BUT an `await` yields the turn. So: read the claim record and write the claim WITHOUT an intervening `await` that could let a second `createRoom` interleave between your read ("unclaimed") and your write. If you must `await ctx.storage.get(...)` then `await ctx.storage.put(...)`, ensure no OTHER createRoom can run between them — the safest pattern is to perform the get→decide→put as the first thing in the handler with no yield to another inbound message in between (the DO input gate already serializes storage ops, but reason about it explicitly and comment it). [Source: 1-1-spike-findings AC1 mechanism note + follow-up line 109.]

### Privacy: the session token must never enter a projection
`issueIdentity()` returns `{playerId, sessionToken}`. `playerId` is PUBLIC (it's `hostId`/`players[].id`, in every projection). `sessionToken` is PRIVATE — held only on the issuing device. It MUST NOT appear in any `ProjectedTableState` (the standing SM-6 `project-state.test.ts` would not catch a token leak directly — it asserts card privacy — so **add an explicit "no sessionToken in payload" assertion** in `table-server.do.test.ts`). Decide the token-delivery path: the simplest is the client already holds the issued identity client-side (1.5), but createRoom issues the host identity SERVER-side — so the token must travel back to the host's client somehow without riding the projection. Options to weigh: (a) the host's identity is issued client-side and SENT in the createRoom payload (but the `Intent` `createRoom.payload` is `{name}` only — frozen contract, do NOT add a field); (b) deliver the token via a connection-state / out-of-band mechanism that is NOT the `tableState` projection. **Document your chosen path and prove the projection stays token-free.** [Source: 1-5 story; shared/src/types.ts:149 frozen `createRoom` payload; project-state.ts.]

### partyserver 0.5.8 API surface (verified against installed typings)
- `class TableServer extends Server<Env, Props>` — `Server` extends `DurableObject<Env>`. Lifecycle hooks to override: `onStart(props?)`, `onConnect(connection, ctx)`, `onMessage(connection, message)`, `onClose(...)`, `onError(...)`. [node_modules/partyserver/dist/index.d.ts:204–367.]
- `this.name` — the DO name (= `ctx.id.name`), the Room Code; available in every entry point incl. `onStart`. [index.d.ts:244–260.]
- `this.ctx` — DO state; `this.ctx.storage` is the DO storage API for the durable summary. `this.sql\`...\`` exists (SQLite) but the architecture mandates a single `ctx.storage` key `"table"` (D2) — use `ctx.storage`, NOT raw SQL, for the summary.
- `this.getConnections()` — iterable of `Connection` (used for re-projecting to all in 1.7; for 1.6's create there is just the one creating connection). `connection` is a `WebSocket & { id, state, setState() }`.
- `static options = { hibernate?: boolean }` — leave UNSET (default false / standard mode) this story. [index.d.ts:209–211.]
- `broadcast(...)` / `connection.send(...)` exist on the class — but GATE 1 bans `.send`/`.broadcast` everywhere except `push-state.ts`. Route ALL outbound through `pushState`. Note `broadcast` is also banned outside push-state.ts; if you ever need fan-out, do it as `for (const c of this.getConnections()) pushState(c, ...)` from push-state.ts, NOT `this.broadcast(...)`.

### Inbound intent parsing (AR-7 envelope)
`onMessage` receives a `WSMessage` (string|ArrayBuffer). Parse string JSON to an `Intent` (`{type, payload}`, camelCase). There is NO runtime schema lib (no zod/valibot — forbidden by the contract header). For lobby (Decision #1) a malformed/unknown intent is handled by lightweight checking → typed `error`; do NOT add a validation framework. The TypeScript `Intent` union is the contract; trust-but-narrow on `type`. [Source: shared/src/types.ts header lines 5–7; architecture.md D4.]

## Architecture Compliance

- **Location (on-disk workspace form is authoritative):** `server/src/{room-code,table-server,dispatch,handlers,persistence,push-state}.ts`; tests `server/src/room-code.test.ts` + `server/src/table-server.do.test.ts`; client `client/src/socket.ts`. NO new directories; do NOT create `server/src/rules/**` (Epic 2). [Source: architecture.md#Complete-Project-Directory-Structure lines 656–732; 1-2..1-5 on-disk convention.]
- **State-mutation boundary:** `handlers.ts` is the ONLY site that assigns table state and the only thing that writes via persistence; it runs only AFTER validation/claim. `dispatch.ts` routes + holds the single try/catch. `onMessage` neither mutates nor sends. [Source: architecture.md D3 lines 514–539; handlers.ts/dispatch.ts headers.]
- **Egress chokepoint (SM-6 / AR-4):** `projectStateFor` (project-state.ts, implemented) is the SOLE producer of client payloads; `pushState` (push-state.ts) is the SOLE sender (`.send`/`.broadcast` ESLint-banned elsewhere — GATE 1). Every outbound `tableState` and `error` goes through push-state.ts. [Source: architecture.md lines 104–110, 240–241; eslint.config.js GATE 1 + exemption.]
- **Single storage key (D2):** durable summary in `ctx.storage["table"]` ONLY; round is memory-only (null here). No per-field keys. [Source: architecture.md D2 lines 346–355; line 557 violation note.]
- **Identity (§11.3 / AR-12):** all state keyed by `playerId` (never socket id); creator's `playerId` = `hostId` = `players[0].id`. `issueIdentity()` (implemented, 1.5) produces it. Session token stays client-private. [Source: architecture.md §11.3; identity.ts; 1-5 story.]
- **Lobby validation (Decision #1):** lightweight phase-checking + DO single-threaded serialization, NOT the Epic 2 two-scope guard (which would no-op in lobby). Documented so the Epic 2 guard never reroutes lobby actions. [Source: architecture.md D4 lines 399–400; epics.md#Story-1.6 line 360, #Story-1.7 lines 388–389.]
- **Room code (D7 / AR-11):** 4 letters, `ROOM_CODE_ALPHABET` (excl. O,0,I,1,L), `crypto.getRandomValues()`; claim-on-create via the DO namespace; regenerate on collision. [Source: architecture.md D7 lines 437–447.]
- **Import-by-name:** server + client import the contract from `@trash/shared` (`import type { Intent, TableState } from "@trash/shared"`; `import { DEFAULT_LIVES, ROOM_CODE_ALPHABET, ROOM_CODE_LEN } from "@trash/shared"`), never a relative path into `shared/`. [Source: 1-3/1-4/1-5 dev notes.]
- **Routing:** clients route to `/parties/table/<name>` (lowercase `table` — partyserver kebab-cases the binding "Table"). [Source: server/src/index.ts routing NOTE.]

## Library / Framework Requirements

- **No new dependencies, server or client.** `crypto.getRandomValues()`/`crypto.randomUUID()` are native (Workers + Node ≥ 22 + browsers). `partyserver@0.5.8` (server) and `partysocket@1.2.0` (client) are already pinned. Do NOT add `uuid`/`nanoid`/`zod`/`valibot`/any package. [Source: server/package.json; client/package.json; architecture.md §292; types.ts header lines 5–7.]
- Toolchain (pinned, already installed — do not bump): typescript 5.9.3, eslint 9.39.1, typescript-eslint 8.46.4, vitest 4.1.9, @cloudflare/vitest-pool-workers 0.16.18, @cloudflare/workers-types 4.20260619.1, wrangler 4.103.0, partyserver 0.5.8, svelte 5.56.3, svelte-check 4.4.1, vite 8.0.16, vite-plugin-pwa 1.3.0. TS: `moduleResolution: "Bundler"`, `strict: true`. [Source: 1-2..1-5 package.json snapshots.]

## File Structure Requirements

**EDIT (existing — read before changing):**
- `server/src/room-code.ts` — stub (`export {}` + header). Implement `generateRoomCode()`; keep/extend header (record 1.6).
- `server/src/table-server.ts` — empty `class TableServer extends Server<Record<string,never>>`. Add `onConnect`/`onMessage`/`onStart` + claim + state field; keep header/WATCH comment. Do NOT add `static options = { hibernate: true }`.
- `server/src/dispatch.ts` — stub. Implement router + single try/catch + lightweight phase-legality.
- `server/src/handlers.ts` — stub. Implement `handleCreateRoom` (sole state-assignment site). Leave `joinRoom`/gameplay handlers unimplemented.
- `server/src/persistence.ts` — stub. Implement summary write/load (single `"table"` key) + D2.1 coercion seam.
- `server/src/push-state.ts` — stub. Implement `pushState` (the sole `.send`/`.broadcast` site).
- `client/src/socket.ts` — 1.5 wrapper. Add `buildCreateRoomIntent` + candidate-code + claim-retry; keep `maxRetries:0`, `loadSessionToken`/`persistSessionToken`/`buildJoinRoomIntent` intact. Do NOT mount into `App.svelte`.

**CREATE (new):**
- `server/src/room-code.test.ts` — pure generation test (node `rules` project, `*.test.ts`).
- `server/src/table-server.do.test.ts` — createRoom round-trip + claim-retry (DO project, `*.do.test.ts`).

**DO NOT TOUCH:**
- `shared/src/types.ts` — contract frozen (1.3); `createRoom.payload` is `{name}` only — consume it, do NOT add fields. `shared/src/config.ts` — consume constants, do NOT change.
- `server/src/project-state.ts` + `server/src/project-state.test.ts` — the implemented projector + standing SM-6 gate; consume `projectStateFor`, do NOT modify it or its test.
- `server/src/identity.ts` + `server/src/identity.test.ts` — implemented (1.5); consume `issueIdentity()`, do NOT modify.
- `server/src/index.ts` — Worker entry + DO export + routing (implemented). Do NOT change the routing/export.
- `eslint.config.js`, `server/vitest.config.ts`, `server/wrangler.jsonc`, `server/tsconfig.json`, `client/tsconfig.json`, `client/src/App.svelte`, `client/src/main.ts`.
- Do NOT create `server/src/rules/**` (Epic 2 — `engine.ts`/`validate.ts`).

**MUST PRESERVE (regression guardrails):**
- System green end-to-end: `scaffold.test.ts`, `scaffold.do.test.ts`, `identity.test.ts`, the standing SM-6 `project-state.test.ts` all keep passing; all ESLint gates green; client build + typecheck green.
- The SM-6 privacy guarantee survives: no card value and no `sessionToken` reaches a non-owner; every outbound payload is built by `projectStateFor` and sent only by `pushState`.
- Do NOT weaken any ESLint gate to make code compile/lint (standing 1.2–1.5 rule).
- Do NOT introduce `.send`/`.broadcast` outside `push-state.ts`; do NOT introduce a per-field storage key; do NOT introduce a runtime validation lib.

## Testing Requirements

- **Test-file naming is convention-enforced:** `*.test.ts` → node `rules` project; `*.do.test.ts` → `do` (pool-workers) project; any other suffix runs in NO project (silent zero coverage). Name them exactly. [Source: server/vitest.config.ts; deferred-work.md #31.]
- **`room-code.test.ts` (node `rules`, pure):** 4-char output; all chars ∈ `ROOM_CODE_ALPHABET`; NO char ∈ {O,0,I,1,L}; over many draws every char in-range (catches modulo-bias overrun) + >1 distinct code (catches a constant). Import constants by name from `@trash/shared`.
- **`table-server.do.test.ts` (DO project):** AC-1.6.1/1.6.3 createRoom → `lobby` TableState shape (host=first player, seat 0, lives 3, phaseToken 0, code 4-letter, round-fields absent); AC-1.6.2 same-code re-create → already-claimed (client would retry), different code → clean claim; SM-6: payload carries NO `sessionToken`. Header-comment the single-threaded-turn argument for atomic claim + that real concurrency is Story 1.7's `wrangler dev` job.
- **No client test this story** — client workspace has no runner; root `npm test` is server-only (deferred-work #29). Client `socket.ts` verified by `svelte-check`/`tsc -b` + `vite build` + structural review.
- Run the full gate before marking done: `npm run typecheck && npm run lint && npm test && npm run build`.

## Previous Story Intelligence (Story 1.5)

- **`issueIdentity()` is implemented and tested** (`server/src/identity.ts`, `{playerId, sessionToken}`, two distinct `crypto.randomUUID()` draws). 1.6 CONSUMES it to mint the host identity — `playerId` → `hostId` + `players[0].id`. The session token stays client-private; do NOT surface it in a projection. [Source: 1-5 story; identity.ts.]
- **`client/src/socket.ts` exists** (`createSocket` with `maxRetries: 0`, `loadSessionToken`/`persistSessionToken`/`buildJoinRoomIntent`, `SESSION_TOKEN_KEY = "trash.sessionToken"`, `VITE_WS_URL`). 1.6 EXTENDS it (createRoom send + candidate/retry); do NOT rewrite its identity/persistence plumbing or re-enable reconnect. 1.5's review hardened `localStorage` access with try/catch (SecurityError/QuotaExceededError) — preserve that.
- **`project-state.ts` is the implemented pure projector** with the standing SM-6 negative-assertion gate. 1.6 calls `projectStateFor` from `push-state.ts` — do NOT bypass it, do NOT modify it. The projector OMITS `round` fields when `round===null` (createRoom's case): `currentTurnId`/`turnToken`/`you.hand` absent, `revealed:false`, `isLastPlayer:false`. [Source: 1-4 story; project-state.ts.]
- **Pattern: read-the-file-first + red-first proof.** 1.4/1.5 house style — read each seam before replacing it, write the failing test, prove it red against the stub, then green. Apply to `room-code.test.ts` (vs the `export {}` stub) and `table-server.do.test.ts` (vs the empty class).
- **No validation lib in the stack** — lobby validation is lightweight phase-checking, not zod/valibot and not the Epic 2 two-scope guard. [Source: 1-3/1-4/1-5 dev notes; types.ts header.]

## Git Intelligence

- `51bb807 Story 1.5: player identity & session + code review` (baseline) — added `issueIdentity()` + `identity.test.ts`, client `socket.ts` (reconnect-disabled, token persist/echo), `vite-env.d.ts` `VITE_WS_URL`. Your work runs against this green tree; consume `issueIdentity()`/`socket.ts`, do not disturb them. [git log; 1-5 story File List.]
- `6f74feb CI: fix npm ci E401` — lockfile repinned to public registry (CI hygiene; no code surface for 1.6).
- `908a80d Story 1.4: privacy chokepoint + standing SM-6 test` — `project-state.ts` projector + the standing `project-state.test.ts` gate you must keep green and route every payload through.
- `8874b9c Story 1.3: shared wire contract` — froze `@trash/shared`: `createRoom`/`joinRoom` Intents, `TableState`/`Player`/`Round`/`ProjectedTableState`, `ServerEvent` (`tableState`|`error`), `ErrorReason` (incl. `bad-code`/`room-full`/`phase-illegal`), `IntentError`. Consume; do NOT modify.
- `51d737d Story 1.2 code review: harden mechanical gates` — GATE 1 (`.send`/`.broadcast` ban, push-state.ts exempt) + GATE 2 (`rules/**` purity). `room-code.ts`/`table-server.ts`/etc. are OUTSIDE `rules/**` so `crypto` is allowed; the `.send` ban applies to all of them (route via push-state.ts).
- `32d952d Story 1.2: AC-driven project initialization` — created the seam layout (`room-code.ts`/`dispatch.ts`/`handlers.ts`/`persistence.ts`/`push-state.ts` as `export {}` stubs; `table-server.ts` empty class) you now fill; `wrangler.jsonc` (`new_sqlite_classes: ["TableServer"]`), the two-project `vitest.config.ts`.

## Spike Intelligence (Story 1.1) — directly load-bearing for 1.6

- **Claim-on-create WORKS (edge-validated):** `idFromName(code)` reliably reports `ALREADY_CLAIMED` on the second create of the same code and `CLAIMED_NOW` on a fresh one — so `createRoom` can regenerate + retry. **The real `room-code.ts`/claim must copy the spike mechanism:** on first init write a `claimed` marker into the DO's `ctx.storage`; createRoom reads it and regenerates on a hit. [Source: 1-1-spike-findings AC1 lines 28–37.]
- **ATOMIC-CLAIM is an explicit 1.6 follow-up (do not miss):** "ensure the claimed-marker read+write is atomic within the DO's single-threaded turn (no two creators both seeing 'unclaimed')." Reason about the `await`-yields-the-turn hazard explicitly and comment it. [Source: 1-1-spike-findings follow-up line 109.]
- **Persistence boundary confirmed:** the durable summary persists to the single `"table"` `ctx.storage` key with `lives/hostId/startingLives/seatIndex/phaseToken/players` intact; the `round` is memory-only. Build `persistence.ts` to exactly this field set. [Source: 1-1-spike-findings AC2 lines 41–50.]
- **GC/hibernation is NOT this story:** the `getWebSockets()`-reads-0-for-standard-mode finding and the hibernation-vs-`getConnections()` GC probe are Story 1.11. Do NOT enable hibernation or add an alarm in 1.6. [Source: 1-1-spike-findings AC3 lines 61–78; follow-up line 108.]

## Project Structure Notes

- Alignment: architecture.md#Complete-Project-Directory-Structure is canonical. 1.6 fills `room-code.ts`/`table-server.ts`/`dispatch.ts`/`handlers.ts`/`persistence.ts`/`push-state.ts`, adds `room-code.test.ts` + `table-server.do.test.ts`, extends `client/src/socket.ts`. No new directories.
- Variance: architecture writes paths logically (`src/server/...`) and on-disk (`server/src/...`); the **on-disk workspace form is authoritative** (proven 1.2–1.5).
- The WATCH note in `table-server.ts` ("peel connection/session mgmt into `connections.ts` only if WS-lifecycle code grows") does not yet trigger — 1.6's lifecycle is small (createRoom only). Keep it in `table-server.ts`; do NOT create `connections.ts`. Re-evaluate when 1.7+ grow the lifecycle.
- `server/test/integration/` (the `wrangler dev` connection-lifecycle harness named in the architecture) is **Story 1.7's** concurrent-join job — do NOT create it this story.

### References

- [Source: epics.md#Epic-1 lines 214–218 — epic objective (activation gate SM-4; identity/persistence/rule-engine seams) + FR-1..4 / AR anchors / NFR-1..4 / Decision #1 (lightweight lobby validation) / #2 (full TableState up front)]
- [Source: epics.md#Story-1.6 lines 341–360 — user story + AC-1.6.1 (createRoom → Host+first Player+code), AC-1.6.2 (claim-on-create regenerate/retry), AC-1.6.3 (lobby phase, lightweight validation, Decision #1)]
- [Source: epics.md#Story-1.7 lines 362–389 — what 1.6 hands to join: code consumed via joinRoom; lobby phase; concurrent-join correctness via DO serialization (Story 1.7's wrangler-dev integration test, NOT 1.6's)]
- [Source: architecture.md D7 lines 437–447 — Room Code: 4 letters, ambiguity-safe alphabet (excl O,0,I,1,L), crypto.getRandomValues(); claim-on-create via idFromName, regenerate on collision; DO namespace IS the registry]
- [Source: architecture.md D3 round-trip lines 514–539 — intent → dispatch (single try/catch) → handler (sole state-assignment) → persist (ctx.storage "table") → pushState (re-project to connections); CLIENT→SERVER {type,payload} envelope]
- [Source: architecture.md D2 lines 346–362 — single ctx.storage key "table"; durable summary field boundary; D2.1 reload-reconciliation coercion]
- [Source: architecture.md D4 lines 389–403 — two-scope guard is Epic 2; joinRoom gated to lobby; lobby actions rely on DO serialization + lightweight checking, NOT the guard]
- [Source: architecture.md lines 104–110, 240–241, 367–376, 534–535 — projectStateFor SOLE producer; pushState SOLE sender; .send/.broadcast ESLint-banned elsewhere; single tableState event; re-project to every connection]
- [Source: architecture.md §11.3 / AR-12 lines ~700–702 — identity.ts issues playerId+session token; all state keyed by playerId; reconnection FLOW deferred]
- [Source: architecture.md#Complete-Project-Directory-Structure lines 656–732 — on-disk paths for room-code.ts/table-server.ts/dispatch.ts/handlers.ts/persistence.ts/push-state.ts/identity.ts/project-state.ts]
- [Source: shared/src/types.ts:148–155 — Intent union: createRoom.payload {name} (frozen, do NOT add fields), joinRoom {code,name,sessionToken?}; lines 82–90 TableState; 52–59 Player; 107–136 ProjectedTableState; 166–178 ServerEvent/ErrorReason; 186–194 IntentError]
- [Source: shared/src/config.ts — ROOM_CODE_ALPHABET "ABCDEFGHJKMNPQRSTUVWXYZ", ROOM_CODE_LEN 4, DEFAULT_LIVES 3]
- [Source: server/src/{room-code,table-server,dispatch,handlers,persistence,push-state}.ts — the seam stubs/empty class this story fills (read each before changing)]
- [Source: server/src/identity.ts — implemented issueIdentity() (1.5); server/src/project-state.ts — implemented projectStateFor() + standing SM-6 test (1.4)]
- [Source: server/src/index.ts — routePartykitRequest; binding "Table" → URL namespace "table" (lowercase); DO export]
- [Source: node_modules/partyserver/dist/index.d.ts:204–367 — Server extends DurableObject; onStart/onConnect/onMessage/onClose; this.name (=ctx.id.name, the room code); getConnections(); static options.hibernate (leave unset)]
- [Source: eslint.config.js — GATE 1 .send/.broadcast ban (push-state.ts exempt, repo-wide **/*.ts); GATE 2 rules/** purity (NOT applicable to 1.6's files — they're outside rules/**)]
- [Source: server/vitest.config.ts — node "rules" (*.test.ts) + "do" (*.do.test.ts) projects; naming-convention warning; pool cannot drive real concurrent WS]
- [Source: 1-1-spike-findings.md AC1 (claim-on-create CLAIMED_NOW/ALREADY_CLAIMED + the [Story 1.6] atomic-claim follow-up line 109), AC2 (persistence field set), AC3 (hibernation/GC = Story 1.11, not 1.6)]
- [Source: 1-5 story — issueIdentity() consumed for hostId; socket.ts extended for createRoom; session token client-private; deferred-work.md #29 (client no test runner) / #31 (test naming)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context) — bmad-dev-story workflow.

### Debug Log References

- **Red-first proof (room-code, Tasks 1–2):** wrote `room-code.test.ts` first; ran `--project=rules room-code` against the `export {}` stub → 3/3 FAILED (`TypeError: generateRoomCode is not a function`). Implemented `generateRoomCode()` (rejection sampling, `MAX_UNBIASED_BYTE=242`) → 3/3 GREEN. The in-range-over-1000-draws assertion pins the unbiased draw.
- **createRoom round-trip (Task 7) — real WS, not RPC:** the DO test drives `SELF.fetch("/parties/table/<CODE>", {headers:{Upgrade:"websocket"}})`, accepts the returned `webSocket`, sends the `createRoom` intent, awaits the first server event. This exercises the genuine `routePartykitRequest → onConnect → onMessage → dispatch → handler → push-state` path in the Workers runtime. 3/3 GREEN on first full run after the `SELF` type was added.
- **Typecheck gap — `cloudflare:test` `SELF`:** the project's local `env.test.d.ts` re-declares the `cloudflare:test` module (with `env`+`Table`), which shadows the package's own d.ts, so `SELF` was missing under `tsc -b`. Fix: added `export const SELF: Fetcher;` to `env.test.d.ts` (the package itself types it identically). Not in the story's DO-NOT-TOUCH list.
- **GATE 1 conflict (resolved with user):** the client's outbound `socket.send(intent)` and the test's `ws.send(intent)` tripped the repo-wide `.send` ban (only `push-state.ts` exempt). The ban's real target is SERVER→CLIENT game-state egress (SM-6); these two sites are client→server (intents, no game state) and a test harness. Refined the gate (per user decision "Scope the GATE 1 exemption"): `client/src/socket.ts` + `server/src/**/*.do.test.ts` exempted for `.send` ONLY — `.broadcast` STILL banned for them; `push-state.ts` stays the sole server-egress site. SM-6 chokepoint intact. Documented in `eslint.config.js`.
- **Two open design decisions settled in code:** (1) **Generator location** — kept server `room-code.ts` as the authority; the client uses a small candidate generator drawing from the SAME frozen `@trash/shared` `ROOM_CODE_ALPHABET`/`ROOM_CODE_LEN` (one alphabet source of truth, no `crypto` moved into shared). (2) **Session-token delivery** — NOT delivered this story: `ServerEvent` is frozen (`tableState|error`, no third event), `createRoom.payload` is frozen (`{name}`), the token's only consumer is the joinRoom-echo / reconnection FLOW (1.7+/deferred), and the projection already carries `you.playerId`. Token stays server-side; zero projection leak (asserted by the SM-6 DO test).

### Completion Notes List

- **AC-1.6.1** — `createRoom{name}` creates a server-side Table end-to-end: `room-code.ts` `generateRoomCode()` (unbiased `crypto.getRandomValues` draw from the ambiguity-safe alphabet); the client picks a candidate + connects; `table-server.ts` (`onMessage`) → `dispatch.ts` → `handleCreateRoom` issues identity, stamps the creator as `hostId` + `players[0]` (seat 0, alive, connected, lives `DEFAULT_LIVES`=3), assigns `host.table` (sole state-assignment site), persists the durable summary, and `pushState` returns the `tableState` whose `code` is the 4-letter Room Code. Verified by the DO round-trip test.
- **AC-1.6.2** — claim-on-create: `handleCreateRoom` rejects a create when the DO is already claimed (`host.table !== null` warm, or `loadSummary() !== undefined` cold) with `IntentError("phase-illegal")`; the client (`createRoomWithRetry`) treats any createRoom `error` as "regenerate + reconnect", transparently. Atomic within the DO's single-threaded turn (no yield between claim-decision and claim-write; DO input gate serializes the `onMessage` turn). Verified: same-code re-create → `error`, different code → clean claim.
- **AC-1.6.3** — fresh Table is `phase:"lobby"`, `round:null`, `phaseToken:0`, `startingLives:3`; validation is lightweight phase-checking + DO serialization (NOT the Epic 2 two-scope guard) — documented in `dispatch.ts` so Epic 2's guard never reroutes lobby actions. Verified by the lobby-shape assertions.
- **SM-6 privacy preserved** — every server→client payload built by `projectStateFor` + sent only by `pushState`; the server-private `sessionToken` never enters a projection (asserted in the DO test); standing `project-state.test.ts` gate still green.
- **Persistence (D2/D2.1)** — single `ctx.storage["table"]` key; durable summary = `{code,phase,hostId,startingLives,players[{id,name,lives,isAlive,seatIndex}],phaseToken}` (round memory-only); `onStart` hydrates via `reconcileSummaryToState` (D2.1 coercion seam — no-ops in lobby, ready for 2.2/2.3).
- **Scope honored** — `joinRoom`/gameplay intents explicitly rejected (not stubbed); hibernation/GC deferred to 1.11; reconnection deferred; no new npm deps; `shared/src/types.ts` + `config.ts` + `project-state.ts` + `identity.ts` + `index.ts` untouched. GATE 2 untouched; no `rules/**` files created.
- **Full gate green:** `typecheck` PASS (client 99 files/0 errors; shared+server clean), `lint` PASS (0 errors), `npm test` PASS (13 tests / 6 files), `npm run build` PASS (109 modules).

### File List

- `server/src/room-code.ts` — MODIFIED (replaced `export {}` stub with `generateRoomCode()` — unbiased rejection-sampled crypto draw from `ROOM_CODE_ALPHABET`).
- `server/src/room-code.test.ts` — CREATED (pure generation test, node `rules` project; len/in-alphabet/no-ambiguous-char/unbiased-over-1000/distinct; proven red-first).
- `server/src/push-state.ts` — MODIFIED (replaced stub with `pushState` + `pushError` — the sole server→client game-state egress site; wraps `projectStateFor`).
- `server/src/persistence.ts` — MODIFIED (replaced stub with `TABLE_KEY`, `DurableSummary`/`DurablePlayer`, `toSummary`/`persistSummary`/`loadSummary`, `reconcileSummaryToState` D2.1 seam).
- `server/src/handlers.ts` — MODIFIED (replaced stub with `handleCreateRoom` + `TableHost`/`ConnectionState` interfaces — sole state-assignment site + atomic claim).
- `server/src/dispatch.ts` — MODIFIED (replaced stub with `dispatch` — router + single try/catch → IntentError → error; explicit non-1.6 intent rejection).
- `server/src/table-server.ts` — MODIFIED (empty class → `onStart` hydrate + `onConnect` + `onMessage` parse/dispatch + `table` field + `storage` getter; `implements TableHost`; hibernation deliberately OFF).
- `server/src/table-server.do.test.ts` — CREATED (createRoom round-trip + claim-retry + SM-6 no-token, DO `do` project; real WS upgrade via `SELF.fetch`).
- `server/src/env.test.d.ts` — MODIFIED (added `export const SELF: Fetcher;` so the DO test typechecks under `tsc -b`).
- `client/src/socket.ts` — MODIFIED (added `generateCandidateCode`, `buildCreateRoomIntent`, `createRoomWithRetry`; imports `ROOM_CODE_ALPHABET`/`ROOM_CODE_LEN`; 1.5 helpers + `maxRetries:0` preserved).
- `eslint.config.js` — MODIFIED (GATE 1 refined: `.send` exemption extended to `client/src/socket.ts` + `server/src/**/*.do.test.ts` for client→server intents/test-harness; `.broadcast` still banned there; `push-state.ts` remains the sole server-egress site — SM-6 intact).

### Review Findings

_Code review 2026-06-19 (bmad-code-review; baseline 51bb807; layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor). All 3 ACs + frozen-contract/SM-6/DO-NOT-TOUCH constraints VERIFIED satisfied by the Acceptance Auditor. `onStart`-before-`onMessage` claim race confirmed SAFE (partyserver `#ensureInitialized` runs `onStart` inside `blockConcurrencyWhile` before the first `onMessage`)._

- [x] [Review][Decision→Patch] Unvalidated `createRoom` payload shape — RESOLVED (shape guard, IntentError). `handleCreateRoom` now rejects a missing payload or non-string `name` with `IntentError("phase-illegal")` (a clean client `error` instead of an uncaught `TypeError` that the framework swallows → client hang). Name CONTENT rules (empty/whitespace/length) deferred to the lobby UI story (1.9a/1.10) per Decision #1 "lightweight phase-checking only" — recorded in deferred-work.md. [server/src/handlers.ts handleCreateRoom guard]
- [x] [Review][Patch] `createRoomWithRetry` hangs + leaks listeners on non-message failures — FIXED. Added `close`/`error` listeners + a per-attempt timeout (`CREATE_ROOM_ATTEMPT_TIMEOUT_MS`); all failure modes funnel through one `failAttempt` that clears the timer, removes all four listeners, closes the socket, and retries-or-rejects. A `settled` guard makes a late close/error after success a no-op. [client/src/socket.ts createRoomWithRetry]
- [x] [Review][Patch] `createRoomWithRetry` retries on any `error` and only counts `error` replies — FIXED. The retry counter now advances on every failure mode (server `error`, socket close, transport error, timeout), so exhaustion is always reachable; the reject message carries the last failure reason rather than a fixed "exhausted code-claim retries". Retrying on any `error` reason kept intentionally (claim-conflict has no dedicated ErrorReason; the attempt cap bounds non-collision errors) and documented in-code. [client/src/socket.ts createRoomWithRetry]
- [x] [Review][Defer] `reconcileSummaryToState` bumps `phaseToken+1` on D2.1 coercion but never re-persists [server/src/persistence.ts:434-446] — deferred, out of 1.6 scope (coercion can only fire mid-round, which arrives Story 2.2/2.3); the un-bumped durable token re-coerces on repeated eviction. Belongs to the phase-machine work that exercises this seam.

## Change Log

- 2026-06-19 — Story 1.6 context created (create-story): full createRoom round-trip scoped from epics/architecture/spike + 1.5 continuity. Status → ready-for-dev.
- 2026-06-19 — Story 1.6 code review (bmad-code-review): 3 ACs + frozen-contract/SM-6/DO-NOT-TOUCH all VERIFIED. 3 patches applied — (1) `handleCreateRoom` payload SHAPE guard (missing/non-string name → clean `IntentError` instead of an uncaught TypeError → client hang); (2) `createRoomWithRetry` `close`/`error`/timeout handling + listener cleanup so a failed/silent socket can't hang the Promise; (3) retry counter advances on every failure mode. 1 deferred (D2.1 `phaseToken` re-persist → Epic 2) + 1 deferred (name-content validation → lobby UI 1.9a/1.10). Full gate green (typecheck/lint/test 13/build). Status → done.
- 2026-06-19 — Story 1.6 implemented (dev-story): `room-code.ts` `generateRoomCode()` (red-first) + test; server spine `push-state`/`persistence`/`handlers`/`dispatch`/`table-server` (createRoom → lobby Table, atomic claim-on-create, durable summary, SM-6 egress); client `socket.ts` (`createRoomWithRetry` candidate+claim-retry); `table-server.do.test.ts` (real-WS round-trip + claim-retry + SM-6). GATE 1 refined (client→server `.send` exemption; server-egress chokepoint intact, user-approved); GATE 2 untouched. Full gate green (typecheck/lint/test 13/build). Status → review.
