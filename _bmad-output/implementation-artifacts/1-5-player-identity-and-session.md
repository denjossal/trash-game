---
baseline_commit: 908a80d
---

# Story 1.5: Player identity & session

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Player,
I want a stable identity that survives a socket blip,
so that all my game state is keyed to me — not my connection — making the game correct today and reconnection cheap to add later.

## Acceptance Criteria

**AC-1.5.1 — `identity.ts` issues a socket-independent `playerId` + session token; state keys by `playerId`, never socket id.**
Given a Player creating or joining a Table,
When identity is issued,
Then `server/src/identity.ts` assigns a `playerId` + session token via `crypto.randomUUID()`, independent of socket identity, and the design keys all server state by `playerId` (never socket id). *(NFR-4, AR-12.)*

**AC-1.5.2 — The client persists the session token to `localStorage` and echoes it on a subsequent `joinRoom`.**
Given the client,
When identity is received,
Then the session token is persisted to `localStorage` and echoed on a subsequent `joinRoom` (`joinRoom.payload.sessionToken` — the optional field already in the `Intent` contract). *(AR-12.)*

**AC-1.5.3 — partysocket auto-reconnect is DISABLED (issuance seam only; reconnection FLOW is out of MVP).**
And the client's `PartySocket` is constructed with auto-reconnect DISABLED — partysocket reconnects by default; the reconnection FLOW (session resumption, retry UX) is an explicit MVP non-goal. Only the **issuance seam** ships now; reconnect-readiness is the free byproduct of `playerId`-keying, not a built feature. *(§11.3 deferred; AR-12.)*

## Tasks / Subtasks

- [x] **Task 1 — Implement the identity-issuance body in `server/src/identity.ts` (AC: 1)** *(test-first — write Task 2's assertions first, watch them fail against the `export {}` stub, then green them here)*
  - [x] Read `server/src/identity.ts` first. It is currently a seam stub (`export {}` + scope comment). Replace it with the real issuance module. Do NOT delete the header comment block (it cites AR-12 / §11.3 — keep it, update the `SCOPE (Story 1.2)` line to note 1.5 implemented it).
  - [x] Export a pure function `issueIdentity(): { playerId: string; sessionToken: string }` that returns `{ playerId: crypto.randomUUID(), sessionToken: crypto.randomUUID() }`. Two distinct `randomUUID()` calls — `playerId` and `sessionToken` are separate values (the token is the future reconnect proof-of-ownership; the id is the state key). [Source: architecture.md#AR-12; #Integration-Points — Identity.]
  - [x] Use the global `crypto.randomUUID()` — native Workers WebCrypto, NO import, NO npm dependency. [Source: architecture.md §292 "native Workers WebCrypto … crypto.randomUUID() (playerId/session token). No external crypto dependency. (Verified.)".] Do NOT add `uuid`/`nanoid` or any package.
  - [x] `identity.ts` lives in `server/src/`, NOT `server/src/rules/**` — the rules-purity ESLint gate (which would ban `crypto`) does NOT apply here. `crypto.randomUUID()` is legitimate and expected in this file. The `.send`/`.broadcast` ban DOES apply repo-wide, but this function sends nothing. [Source: eslint.config.js GATE 2 scope = `server/src/rules/**` only.]
  - [x] Document via a code comment the §11.3 reconnect-ready seam: the token-→-player resolver (`resolveIdentity(inboundToken, players)`) is the deferred half. **Resolver decision (confirmed with user): comment-only seam** — `issueIdentity()` ships fully tested; the resolver is named in the header comment as the Story 1.7 join-flow seam (no resolver code, no dead/untested code). [Source: architecture.md `identity.ts` line — "resolve inbound token → player (the §11.3 reconnect-ready seam — issuance in MVP, reconnection FLOW deferred)".]

- [x] **Task 2 — Author the identity-issuance unit test (AC: 1)**
  - [x] Create `server/src/identity.test.ts` (the node `rules` vitest project — `*.test.ts` suffix, NOT `*.do.test.ts`; this is a pure-function test, no WS/DO plumbing). [Source: server/vitest.config.ts naming convention.]
  - [x] Assert `issueIdentity()` returns an object with string `playerId` and `sessionToken`, both non-empty, and **`playerId !== sessionToken`** (two distinct UUIDs — guards against a copy-paste single-call regression).
  - [x] Assert two successive calls return DISTINCT `playerId`s and DISTINCT `sessionToken`s (uniqueness — guards against a hard-coded/constant regression).
  - [x] Assert `playerId` matches the UUID v4 shape (`/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`) — pins that `crypto.randomUUID()` (not some ad-hoc generator) is the source. Same for `sessionToken`. [Note: `crypto.randomUUID()` is available in the vitest node environment — Node ≥ 22, the pinned floor.]
  - [x] Do NOT assert socket-independence by mocking a socket (there is no connection flow in this story); socket-independence is a *structural* property — the function takes no socket argument and reads no connection state. State it in the test header comment as the rationale.

- [x] **Task 3 — Create the client `socket.ts` wrapper: reconnect disabled + token persistence (AC: 2, 3)**
  - [x] Read `client/src/main.ts` and `client/src/App.svelte` first (both are scope-stubs; `socket.ts` does not yet exist). Create `client/src/socket.ts`. [Source: architecture.md#Complete-Project-Directory-Structure — `client/src/socket.ts` "PartySocket wrapper; persists session token to localStorage; echoes it on joinRoom".]
  - [x] Import `PartySocket` from `partysocket` (1.2.0, already a client dependency — do NOT add it). Construct it with **auto-reconnect disabled** via `maxRetries: 0` (verified against the installed 1.2.0 typings — `Options.maxRetries`; NOT `startClosed`, which would suppress the initial connect too). Comment added. (AC-1.5.3.)
  - [x] Read `VITE_WS_URL` from `import.meta.env` for the socket host/URL (the env-driven URL the architecture's `socket.ts` description names). Do NOT hard-code a URL. If unset in dev, fall back is fine for the seam — but the read MUST go through `import.meta.env.VITE_WS_URL`. [Source: architecture.md `socket.ts` — "reads VITE_WS_URL".]
  - [x] **localStorage persistence (AC-1.5.2):** implement two small helpers — `loadSessionToken(): string | null` and `persistSessionToken(token: string): void` — with `const SESSION_TOKEN_KEY = "trash.sessionToken"` (one module-level key constant). `buildJoinRoomIntent(code, name)` reads the stored token and sets `payload.sessionToken` (the optional field already in the `Intent` union), omitting the key when absent. `localStorage` access guarded by `typeof localStorage !== "undefined"`. [Source: shared/src/types.ts `joinRoom` Intent; architecture.md `socket.ts` description.]
  - [x] **Scope guard:** ships the wrapper's identity/persistence plumbing + disabled-reconnect construction only. Exports helpers + `createSocket()` factory + `buildJoinRoomIntent()`. NOT mounted into `App.svelte`; no surface router, no `main.ts` store wiring, no live send/receive loop, no outbound `.send`. The `App.svelte` SSoT scaffold is untouched. [Source: client/src/main.ts SCOPE comment; client/src/App.svelte SCOPE comment.]

- [x] **Task 4 — Green the full gate suite (AC: all)**
  - [x] `npm run typecheck` passes (shared + server + client). `socket.ts` + `vite-env.d.ts` typecheck under `svelte-check` + `tsc -b`; `PartySocket` options and `import.meta.env.VITE_WS_URL` valid (declared in `vite-env.d.ts`). → 99 files, 0 errors.
  - [x] `npm run lint` passes — no `.send`/`.broadcast` token in `identity.ts` or `socket.ts`; no `rules/**` purity regression. (`crypto.randomUUID()` in `identity.ts` allowed — outside `rules/**`.) → clean.
  - [x] `npm test` passes — node `rules` project (incl. new `identity.test.ts`) + `do` project. → 7 tests / 4 files, all green (4 prior + 3 new).
  - [x] `npm run build` passes — client builds clean (109 modules). The unimported `socket.ts` is tree-shaken out of the bundle (expected for an unmounted seam) and is still fully typechecked by `tsc -b` — no no-op reference needed; that gate is sufficient.

## Dev Notes

### What this story is (and is NOT)
- **IS:** the identity-ISSUANCE seam. (1) `server/src/identity.ts` — a pure `issueIdentity()` returning a fresh `playerId` + session token via `crypto.randomUUID()`. (2) `client/src/socket.ts` — a PartySocket wrapper with reconnect DISABLED that persists the session token to `localStorage` and is wired to echo it on `joinRoom`. Both are seams the create/join flows (Stories 1.6/1.7) will *call*; this story ships the mechanism, not the flow.
- **IS NOT:** the create/join connection flow. There is no `onConnect`/`onMessage` in `table-server.ts` yet (it is an empty `class TableServer extends Server`), no `dispatch`/`handlers`, no live send/receive loop. Do NOT wire `issueIdentity()` into a connection lifecycle — Story 1.6 (`createRoom`) and 1.7 (`joinRoom`) own that. [Source: server/src/table-server.ts — empty class; epics Story 1.6/1.7.]
- **IS NOT:** the reconnection FLOW. Identity KEYING ships; resumption/retry UX is an explicit non-goal (deferred). [Source: architecture.md Deferred — "Reconnection flow / session resumption / retry UX (identity keying stays; the flow itself is an explicit non-goal)".]
- **IS NOT:** server state keyed by `playerId` in code — there is no mutable `TableState` instance yet. AC-1.5.1's "all server state is keyed by `playerId` (never socket id)" is satisfied DESIGN-wise here: `issueIdentity()` produces the key, and the contract (`shared/src/types.ts`) already keys `Player.id`, `Round.hands[playerId]`, `hostId`, `currentTurnId`, `startingPlayerId` by `playerId` — never by a socket id (no socket-id field exists in the contract). The runtime keying is exercised when 1.6/1.7 build the flow. Do NOT invent a `TableState` instance or a player registry in this story.
- **IS NOT:** a new wire-contract field. The `joinRoom` Intent ALREADY carries `sessionToken?: string` (`shared/src/types.ts:150`, frozen by Story 1.3). Do NOT modify `shared/src/types.ts` — consume the existing optional. [Source: shared/src/types.ts — `Intent` union.]

### Why two distinct UUIDs (playerId ≠ sessionToken)
`playerId` is the PUBLIC state key — it appears in `ProjectedTableState.you.playerId` and `players[].id`, visible to every device at the table. The `sessionToken` is the PRIVATE reconnect proof — it is held only on the issuing device's `localStorage` and echoed back on `joinRoom`. If they were the same value, the public id would BE the reconnect secret and any device that saw the roster could impersonate a seat. Issue them as two independent `crypto.randomUUID()` values from day one — this is the impersonation-prevention property §11.3 is load-bearing for. [Source: architecture.md §11.3 "all state keyed by playerId + session token"; Cross-Cutting #4 stable-identity keying.]

### Resolver: stub or ship?
The `identity.ts` directory description names a second responsibility: "resolve inbound token → player (the §11.3 reconnect-ready seam)". This story's AC set covers ISSUANCE only (AC-1.5.1 issues; the resolver is consumed by the 1.7 join flow that does not exist yet). Recommendation: ship `issueIdentity()` (fully tested) and leave the resolver as a one-line comment naming it as the Story 1.7 seam — do NOT build a resolver against a non-existent player registry. If you do add a resolver signature, it MUST be a pure `(token: string, players: Player[]) => Player | undefined` lookup with a unit test, and it MUST NOT do reconnection side-effects. Prefer the comment-only seam to avoid shipping untested/unused code that a later review flags as dead.

### partysocket reconnect-disable (verify against installed 1.2.0)
partysocket reconnects automatically by default; the architecture explicitly requires it OFF this story. The disable mechanism in the `partysocket`/`PartySocket` API has varied across versions — **read the installed typings before coding** (`node_modules/partysocket/*.d.ts`, or the `PartySocketOptions` type) to confirm the exact option (historically a `maxRetries`/`startClosed`/reconnect-related option, but DO NOT guess — verify). Whatever the option, the constructed socket must not auto-reconnect after a drop. Add the AR-12 comment so a future reader knows the disable is deliberate, not an oversight. [Source: architecture.md `socket.ts` — "RECONNECT DISABLED (reconnection out-of-MVP — partysocket reconnects by default)".]

### crypto.randomUUID() availability
- **Server (Workers runtime):** `crypto.randomUUID()` is a global — native Workers WebCrypto, no import. Verified by architecture §292.
- **Test (vitest node `rules` project):** Node ≥ 22 (the CI floor / `engines` target) exposes `crypto.randomUUID()` as a global; no `import { randomUUID } from "node:crypto"` needed. If a stray lint/type error appears for the global `crypto` in the node test, prefer referencing the same global the production code uses (do not diverge the test's UUID source from production's).
- **No npm dependency** — do not add `uuid`, `nanoid`, `@types/uuid`, etc. (Adding a dep would also need a $0-gate / lockfile justification.)

### Client testing reality (why AC-1.5.2 has no automated test this story)
The client workspace has NO test runner — `client/package.json` scripts are `dev`/`build`/`preview`/`typecheck` only; root `npm test` runs the **server workspace only** (`"test": "npm run test --workspace=server"`). This is a known, deliberate gap (deferred-work.md #29 — "Root `npm test` covers only the `server` workspace … client/shared have no test gate"). Therefore:
- AC-1.5.2 (localStorage persist + echo) is verified by `svelte-check`/`tsc` typecheck + the build gate + the structural review of `socket.ts`, NOT by an automated unit test. Do NOT stand up a whole client vitest project just for this story — that is out of scope and would expand the gate surface unilaterally (a standing 1.2 rule: do not broaden CI gates ad hoc).
- Make the persistence logic trivially reviewable: one `SESSION_TOKEN_KEY` constant, one `persistSessionToken`, one `loadSessionToken`, the `typeof localStorage` guard, and the `joinRoom` echo point — small, obvious, correct by inspection.
- If you want belt-and-suspenders, extracting the pure token-key/echo logic into a tiny helper that COULD later be unit-tested is fine, but shipping a new client test runner is NOT this story's job.

### Server-side: keep it pure and seam-only
- `issueIdentity()` is a pure-ish factory (its only effect is the CSPRNG draw via `crypto.randomUUID()`; it touches no storage, no socket, no `this`). It is NOT in `rules/**`, so the purity ESLint gate does not run on it — but keep it minimal and side-effect-free anyway; the flow code (1.6/1.7) owns persistence and connection state. [Source: eslint.config.js GATE 2 files glob = `server/src/rules/**`.]
- Do NOT touch `table-server.ts`, `dispatch.ts`, `handlers.ts`, `persistence.ts`, `push-state.ts`, `project-state.ts`, `room-code.ts` — they are other stories' seams. This story implements ONLY `identity.ts` on the server.

### Serialization / contract notes
- `sessionToken` rides on `joinRoom.payload` as `sessionToken?: string` (optional — omitted on a fresh first join, present on a re-join echo). Omit-when-absent: when there is no stored token, do NOT send `sessionToken: undefined` — leave the key off the payload. [Source: shared/src/types.ts:150; architecture.md serialization rule "omit a key when ABSENT; never serialize null".]

## Architecture Compliance

- **Location:** server identity is `server/src/identity.ts`; client socket wrapper is `client/src/socket.ts` (on-disk workspace form is authoritative — architecture.md sometimes writes logical `src/server/...`/`src/client/...`; use the `<workspace>/src/...` form proven in Stories 1.2–1.4). [Source: architecture.md#Complete-Project-Directory-Structure; 1-4 Project Structure Notes.]
- **Identity model (§11.3, HARD):** all state keyed by `playerId` + session token, not socket id, from day one — load-bearing for turn-ownership validation, showdown attribution, and private-card re-delivery on device wake (NOT a reconnection feature). [Source: architecture.md §11.3; NFR-4.]
- **Auth:** none — `playerId` + session token + Room Code; no accounts/OAuth/JWT. Do not introduce any auth library. [Source: architecture.md §287.]
- **Import-by-name:** the client imports the contract from `@trash/shared` (`import type { Intent } from "@trash/shared"`), never a relative path into `shared/`. [Source: 1-3/1-4 dev notes.]
- **Naming:** `identity.ts`/`socket.ts` kebab-case files; `issueIdentity`/`loadSessionToken`/`persistSessionToken`/`createSocket` camelCase; `SESSION_TOKEN_KEY` SCREAMING_SNAKE module constant. [Source: architecture.md naming conventions.]
- **No deltas / single chokepoint untouched:** this story adds no server→client send path; `push-state.ts` + `project-state.ts` remain the only egress, untouched. [Source: architecture.md Cross-Cutting #1; eslint GATE 1.]

## Library / Framework Requirements

- **No new dependencies, server or client.** `crypto.randomUUID()` is native (Workers + Node ≥ 22 + browsers). `partysocket@1.2.0` is already a client dependency; `partyserver@0.5.8` is already a server dependency. Do NOT add `uuid`/`nanoid`/any package. [Source: client/package.json; server/package.json; architecture.md §292.]
- Toolchain (pinned, already installed — do not bump): typescript 5.9.3, eslint 9.39.1, typescript-eslint 8.46.4, vitest 4.1.9, @cloudflare/vitest-pool-workers 0.16.18, wrangler 4.103.0, svelte 5.56.3, svelte-check 4.4.1, vite 8.0.16, @sveltejs/vite-plugin-svelte 7.1.2, vite-plugin-pwa 1.3.0. TypeScript: `moduleResolution: "Bundler"`, `strict: true`. [Source: 1-2/1-3/1-4 package.json; client/package.json.]
- `import.meta.env.VITE_WS_URL` — typed via vite's client types (`client/src/vite-env.d.ts`); add a `VITE_WS_URL` declaration to `ImportMetaEnv` there only if `tsc`/`svelte-check` complains about the untyped access (a 1-line `readonly VITE_WS_URL?: string;`). [Source: client/src/vite-env.d.ts; vite env typing convention.]

## File Structure Requirements

**EDIT (existing — read before changing):**
- `server/src/identity.ts` — currently a seam stub (`export {}` + header comment). Replace the stub with the real `issueIdentity()` body; keep/extend the header comment block (update the `SCOPE (Story 1.2)` line to record 1.5 implemented issuance, resolver deferred to 1.7).
- `client/src/vite-env.d.ts` — ONLY if needed to type `VITE_WS_URL` (1-line addition to `ImportMetaEnv`). Otherwise do not touch.

**CREATE (new):**
- `server/src/identity.test.ts` — identity-issuance unit test (node `rules` project, `*.test.ts` suffix).
- `client/src/socket.ts` — PartySocket wrapper: reconnect disabled, `localStorage` token persist/load, `joinRoom` echo wiring, `VITE_WS_URL` read, `createSocket()` factory.

**DO NOT TOUCH:**
- `shared/src/types.ts` — the contract is frozen (Story 1.3); `joinRoom.payload.sessionToken?` already exists. Consume it; do not change it.
- `shared/src/config.ts`, the ESLint gates (`eslint.config.js`), `wrangler.jsonc`, `server/vitest.config.ts`, `server/tsconfig.json`, `client/tsconfig.json`.
- Server seams owned by other stories: `table-server.ts`, `dispatch.ts`, `handlers.ts`, `persistence.ts`, `push-state.ts`, `project-state.ts`, `room-code.ts`. (Story 1.5 implements `identity.ts` ONLY on the server.)
- `client/src/App.svelte` (the 1.3 SSoT `satisfies` scaffold) and `client/src/main.ts` (mount stub) — do NOT mount `socket.ts` into the surface yet; that is Stories 1.9a/1.10. (Exception: see the Task 4 build-prune note if vite tree-shakes the unimported `socket.ts` into a build problem — the minimal fix is a no-op reference, not a real wiring.)

**MUST PRESERVE (regression guardrails):**
- System stays green end-to-end: both server scaffold smoke tests (`scaffold.test.ts`, `scaffold.do.test.ts`) keep passing; the standing SM-6 test (`project-state.test.ts`) keeps passing; all ESLint gates stay green; client build + typecheck stay green.
- The server single-source-of-truth guarantee (1.3 AC4) survives — this story adds no contract consumer that would break it, and changes no contract type.
- Do NOT weaken any ESLint gate to make code compile/lint (standing 1.2/1.3/1.4 rule).
- The `.send`/`.broadcast` egress ban: do not introduce either token in `identity.ts` or `socket.ts`. (The client legitimately calls `socket.send(intent)` for OUTBOUND intents in later stories — but that send loop is NOT this story; do not add it. If a `.send` is unavoidable in the wrapper this story, note that GATE 1 bans `.send` repo-wide on `**/*.ts` and `socket.ts` is NOT exempt — keep the outbound send out of 1.5 to stay green. Confirm `npm run lint` is green before marking done.)

## Testing Requirements

- **Test-file naming is convention-enforced, not code-enforced.** The server test is `server/src/identity.test.ts` — `*.test.ts` runs in the node `rules` vitest project. A `*.spec.ts`/`*.workers.ts` file runs in NO project (silent zero coverage). This is a PURE function test → node project, NOT the `do` (pool-workers) project. [Source: server/vitest.config.ts; deferred-work.md #31.]
- **`issueIdentity()` test (AC-1.5.1):** non-empty string `playerId` + `sessionToken`; `playerId !== sessionToken`; two calls give distinct ids AND distinct tokens (uniqueness); UUID-v4 shape for both. Follow the `scaffold.test.ts` import-by-name pattern (`import { ... } from "@trash/shared"` where needed; `import { issueIdentity } from "./identity.js"`). [Source: server/src/scaffold.test.ts.]
- **No `do`-project test is needed** — there is no DO/WS behavior in this story (`issueIdentity` is pure; the connection flow is 1.6/1.7). Do NOT add a `*.do.test.ts`.
- **Client `socket.ts` has NO automated test this story** — the client workspace has no test runner and root `npm test` is server-only (deferred-work.md #29). AC-1.5.2/AC-1.5.3 are verified by typecheck (`svelte-check` + `tsc -b`), the `vite build` gate, and structural review (one key constant, guarded `localStorage`, disabled reconnect, `joinRoom` echo point). Do NOT introduce a client vitest project for this story.
- Run the full gate before marking done: `npm run typecheck && npm run lint && npm test && npm run build`.

## Previous Story Intelligence (Story 1.4)

- **`project-state.ts` is now a real pure projection** (Story 1.4 filled the throwing seam) and the **standing SM-6 negative-assertion test** (`server/src/project-state.test.ts`) is a CI gate. This story adds NO new `ProjectedTableState` field, so the SM-6 standing gate is not in play — but if you were ever tempted to surface `sessionToken` in a projection, DON'T: the token is client-private and must never appear in any `ProjectedTableState`. [Source: 1-4 story; project-state.test.ts standing gate.]
- **`playerId` is already the projection's identity key** — `ProjectedTableState.you.playerId` and `players[].id` were consumed by 1.4's projector. `issueIdentity()` produces exactly that key; the projector trusts a well-formed `TableState` keyed by it. [Source: 1-4 dev notes; shared/src/types.ts.]
- **No validation lib in the stack** — issuance does no range/format validation of inbound tokens (that is Epic 2 `rules/validate.ts` for intent payloads, and the 1.7 join flow for token resolution). [Source: 1-3/1-4 dev notes; deferred-work.md 1.3 review.]
- **Pattern: read-the-file-first + red-first proof.** 1.4's File Structure Requirements and Debug Log show the house style: read the seam before replacing it, write the failing test first, prove it red against the stub/leak, then green. Apply the same to `identity.test.ts` vs the `export {}` stub.

## Git Intelligence

- `908a80d Story 1.4: privacy chokepoint + standing SM-6 negative-assertion test` (baseline) — filled `project-state.ts`, added the standing SM-6 test, recorded SM-6 inference obligations in `deferred-work.md`. Your work runs against this green tree; do not disturb the projection or its test.
- `8874b9c Story 1.3: shared wire contract` — froze `@trash/shared` incl. `joinRoom.payload.sessionToken?` (the field you echo) and the `playerId`-keyed contract. Consume; do not modify.
- `51d737d Story 1.2 code review: harden mechanical gates` — the `.send`/`.broadcast` ban (push-state.ts exempt) and `rules/**` purity gate you run against. `identity.ts` is outside `rules/**`, so `crypto.randomUUID()` is allowed there; the `.send` ban still applies to both `identity.ts` and `socket.ts`.
- `32d952d Story 1.2: AC-driven project initialization` — created the workspace scaffold and the `identity.ts`/`socket.ts`(absent)/seam layout you fill. partysocket@1.2.0 (client) and partyserver@0.5.8 (server) were pinned here.

## Spike Intelligence (Story 1.1) — identity implications

- **Identity must be socket-independent because the socket is unstable** — the spike confirmed hibernation/standard-mode connection quirks (`getWebSockets()` returning 0 under partyserver standard mode, GC fix deferred to 1.11). Keying state to `playerId` (not a socket/connection id) is precisely what makes the game correct across a socket blip and a DO wake — this story's whole reason for being. Do NOT key anything to a connection id. [Source: 1-1-spike-findings AC3; deferred-work.md #2/#14.]
- **`claim-on-create` host identity (1.6 follow-up):** the spike's atomic-claim race is owned by Story 1.6, not here — but note that the Host's `playerId` (issued by THIS story's `issueIdentity()` at create time) is what 1.6 stamps as `hostId`. Keep `issueIdentity()` caller-agnostic (host vs joiner is the caller's concern, not the issuer's). [Source: deferred-work.md 1.1 review — AC1 concurrent-claim → Story 1.6.]

## Project Structure Notes

- Alignment: architecture.md#Complete-Project-Directory-Structure is the canonical map. This story fills `server/src/identity.ts`, adds `server/src/identity.test.ts`, and creates `client/src/socket.ts`. No new directories.
- Variance to watch: architecture.md writes paths in logical (`src/server/...`, `src/client/...`) and on-disk (`server/src/...`, `client/src/...`) forms. The **on-disk workspace form is authoritative** (proven 1.2–1.4): use `server/src/identity.ts` and `client/src/socket.ts`.
- The architecture's WATCH note ("peel connection/session mgmt into `connections.ts` only if WS-lifecycle code grows") does NOT trigger this story — there is no WS-lifecycle code here. Keep identity in `identity.ts`; do not create `connections.ts`. [Source: server/src/table-server.ts WATCH comment.]

### References

- [Source: epics.md#Story-1.5 lines 324–339 — user story + AC-1.5.1/2/3 (issue playerId+token via crypto.randomUUID socket-independent; localStorage persist + joinRoom echo; partysocket reconnect DISABLED)]
- [Source: epics.md#Epic-1 lines 215–218 — epic objective (activation gate, identity/persistence seams) + FR-2/NFR-4/AR-12 anchors]
- [Source: epics.md FR-2 line 22; NFR-4 line 41 — stable playerId + session token independent of socket identity, from day one]
- [Source: architecture.md §11.3 (Stable identity — HARD) — all state keyed by playerId + session token, not socket id; reconnect-readiness is a free byproduct; reconnection flow is an explicit non-goal]
- [Source: architecture.md #AR-12 / #Integration-Points — Identity — identity.ts issues playerId + session token at create/join; client stores in localStorage, echoes on joinRoom; partysocket auto-reconnect DISABLED]
- [Source: architecture.md §287 (Auth: none — playerId + session token + Room Code, no accounts/OAuth/JWT); §292 (native Workers WebCrypto crypto.randomUUID() — no external crypto dependency)]
- [Source: architecture.md #Complete-Project-Directory-Structure — server/src/identity.ts ("resolve inbound token → player … reconnection FLOW deferred"); client/src/socket.ts ("RECONNECT DISABLED; persists session token to localStorage; echoes it on joinRoom; reads VITE_WS_URL")]
- [Source: architecture.md Deferred — "Reconnection flow / session resumption / retry UX (identity keying stays; the flow itself is an explicit non-goal)"]
- [Source: architecture.md Cross-Cutting #4 — stable-identity keying everywhere; load-bearing for gameplay, reconnect-readiness a byproduct]
- [Source: shared/src/types.ts:148–155 — Intent union; joinRoom.payload.sessionToken?: string (frozen Story 1.3)]
- [Source: server/src/identity.ts — the seam stub (export {}) this story implements]
- [Source: server/src/table-server.ts — empty TableServer class (no connection flow yet); WATCH note re connections.ts]
- [Source: client/src/main.ts, client/src/App.svelte — scope stubs; socket.ts wiring scheduled for 1.5/1.9/1.10]
- [Source: client/package.json — partysocket@1.2.0; scripts: dev/build/preview/typecheck (no test); server/package.json — partyserver@0.5.8]
- [Source: eslint.config.js — GATE 1 .send/.broadcast ban (push-state.ts exempt, repo-wide on **/*.ts); GATE 2 rules/** purity (NOT applicable to identity.ts)]
- [Source: server/vitest.config.ts — node `rules` project for the pure identity test; `*.test.ts` suffix]
- [Source: deferred-work.md #29 (root npm test is server-only; client/shared have no test gate) and #31 (test-file naming convention)]
- [Source: 1-1-spike-findings AC3 / deferred-work.md #2/#14 — socket-id instability under hibernation; why identity must be socket-independent]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context) — bmad-dev-story workflow.

### Debug Log References

- **Red-first proof of the identity test (Tasks 1–2):** wrote `server/src/identity.test.ts` first and ran `npm test --workspace=server` against the `export {}` stub → all 3 new tests FAILED with `TypeError: issueIdentity is not a function` (existing 4 tests still passed). Implemented the `issueIdentity()` body in `identity.ts` → re-ran → 7/7 GREEN. Confirms the tests genuinely pin the issuance behavior, not a tautology.
- **partysocket reconnect-disable — verified, not guessed (Task 3):** inspected the installed typings (`node_modules/partysocket/ws-DmY8PlZb.d.ts` `Options`, `node_modules/partysocket/index.d.ts` `PartySocketOptions`). `ReconnectingWebSocket` retries on close up to `maxRetries`; `maxRetries: 0` disables auto-reconnect after a drop. Chose `maxRetries: 0` over `startClosed: true` — `startClosed` would also suppress the INITIAL connection, which is wrong (we want the first connect, just no auto-reconnect).
- **Build-prune check (Task 4):** `socket.ts` is not yet imported by `App.svelte`/`main.ts`, so `vite build` tree-shakes it out of the bundle (109 modules transformed, no `socket.ts` chunk) — this is correct for an unmounted seam and does NOT error. The story's "no-op reference if vite prunes it" fallback was unnecessary: `tsc -b` (run by the client `typecheck`/`build` script) typechecks `socket.ts` regardless of bundling, which is the gate that matters here.

### Completion Notes List

- **AC-1.5.1** — Implemented `issueIdentity(): Identity` in `server/src/identity.ts` (replaced the `export {}` seam stub). Returns `{ playerId: crypto.randomUUID(), sessionToken: crypto.randomUUID() }` — two INDEPENDENT draws (playerId = public state key; sessionToken = private reconnect proof; distinct so the public roster id is not the reconnect secret → impersonation prevention, §11.3). Uses the global `crypto.randomUUID()` (native Workers WebCrypto; no import, no npm dep). Caller-agnostic (host vs joiner is the caller's concern). The token→player RESOLVER half is left as a documented comment-only Story 1.7 seam (confirmed with user) — no unused/untested code shipped. State-keys-by-playerId is satisfied design-wise: the function produces the key, and the frozen `@trash/shared` contract already keys all state by `playerId`, never a socket id (no socket-id field exists). `identity.ts` is outside `rules/**`, so `crypto` is allowed; no `.send`/`.broadcast`.
- **AC-1.5.1 test** — `server/src/identity.test.ts` (node `rules` project, `*.test.ts`): asserts non-empty string `playerId`/`sessionToken`, `playerId !== sessionToken`, distinct ids+tokens across two calls (uniqueness), and UUID-v4 shape for both (pins `crypto.randomUUID()` as the source). Socket-independence asserted structurally (function takes no socket arg) per the test header rationale — no mock.
- **AC-1.5.2** — `client/src/socket.ts`: `SESSION_TOKEN_KEY = "trash.sessionToken"` (single constant), `loadSessionToken()`/`persistSessionToken()` (both guarded by `typeof localStorage !== "undefined"`), and `buildJoinRoomIntent(code, name)` which echoes the stored token into `payload.sessionToken` (omit-when-absent: key left off when no token). Consumes the existing `joinRoom.payload.sessionToken?` optional — `shared/src/types.ts` untouched.
- **AC-1.5.3** — `createSocket(room)` constructs `PartySocket` with `maxRetries: 0` (auto-reconnect DISABLED; verified against partysocket 1.2.0 typings). `host` read from `import.meta.env.VITE_WS_URL` (declared in `client/src/vite-env.d.ts`); never hard-coded. Issuance seam only — `socket.ts` is NOT mounted into `App.svelte`, has no live send/receive loop, no outbound `.send`. Reconnection FLOW remains an explicit MVP non-goal.
- **Client test gate** — none added (deliberate): the client workspace has no test runner and root `npm test` is server-only (deferred-work #29). AC-1.5.2/1.5.3 verified by typecheck (`svelte-check` + `tsc -b`) + `vite build` + structural review (one key constant, guarded storage, `maxRetries: 0`, single `joinRoom` echo point). No client vitest project stood up.
- **Full gate green end-to-end:** `npm run typecheck` PASS (99 files / 0 errors), `npm run lint` PASS (no `.send`/`.broadcast` introduced; no purity regression), `npm test` PASS (7 tests / 4 files — 4 prior + 3 new identity), `npm run build` PASS (client, 109 modules). No ESLint gate weakened; the standing SM-6 test + both scaffold smoke tests still pass; `shared/src/types.ts` and all other-story seams untouched.

### File List

- `server/src/identity.ts` — MODIFIED (replaced `export {}` seam stub with the `issueIdentity()` issuance body + `Identity` type + resolver-seam comment for Story 1.7).
- `server/src/identity.test.ts` — CREATED (identity-issuance unit test: distinct/unique/UUID-v4-shaped, node `rules` project; proven red-first).
- `client/src/socket.ts` — CREATED (PartySocket wrapper: `maxRetries: 0` reconnect-disabled `createSocket`, `localStorage` token persist/load, `buildJoinRoomIntent` echo, `VITE_WS_URL` host).
- `client/src/vite-env.d.ts` — MODIFIED (added `ImportMetaEnv.VITE_WS_URL` declaration for the typed `import.meta.env` read).

## Review Findings

_Code review 2026-06-19 (Blind Hunter + Edge Case Hunter + Acceptance Auditor; uncommitted diff vs `908a80d`). All three ACs and every hard constraint CONFIRMED satisfied by the Acceptance Auditor — no AC violations, no forbidden-file touches, no gate weakening, no new deps, contract frozen. Findings below are robustness gaps in the unmounted `socket.ts` seam._

- [x] [Review][Defer] `createSocket` silently connects to a malformed URL when `VITE_WS_URL` is unset [client/src/socket.ts:62-66] — deferred to Story 1.6/1.7. `host: import.meta.env.VITE_WS_URL ?? ""` yields `host: ""`. Edge Hunter verified against `node_modules/partysocket/dist/index.js`: an empty host does NOT throw at construction (the empty-host guard lives only in `reconnect()`); `getPartyInfo` builds `wss:///parties/main/<room>` (empty authority) and `_connect()` fires immediately. With `maxRetries: 0` the single failed connect is swallowed — a misconfigured build gets a dead socket with no diagnostic. **Reason for defer:** the spec sanctions the empty fallback for this issuance-only seam ("fall back is fine for the seam"); the socket isn't mounted yet, so no live connection can fail until the connection flow (Story 1.6/1.7) — which owns fail-loud config behavior — actually constructs it.
- [x] [Review][Patch] `localStorage` getItem/setItem can throw despite the `typeof` guard — FIXED: wrapped `getItem`/`setItem` in try/catch so `loadSessionToken` returns `null` and `persistSessionToken` no-ops on a storage throw (SecurityError / QuotaExceededError), matching the documented graceful-degradation contract. Full gate re-run green. — `hasLocalStorage()` only checks `typeof localStorage !== "undefined"`, which guards the absent case but NOT `SecurityError` (Safari private mode / storage blocked, where `localStorage` is defined but every access throws) or `QuotaExceededError` (setItem, quota full). The throw propagates uncaught out of `loadSessionToken`/`persistSessionToken`/`buildJoinRoomIntent`, breaking the join flow rather than degrading to the documented "null / no stored token" path. The file's own doc comment claims it "never throws under SSR / test / PWA-precache contexts" — true for absence, false for access-denied/quota. [client/src/socket.ts:25-34]



- 2026-06-19 — Story 1.5 context created (create-story): identity-issuance seam scoped from epics/architecture/contract + 1.4 continuity. Server `identity.ts` (`issueIdentity()` via crypto.randomUUID, playerId ≠ sessionToken) + unit test; client `socket.ts` (reconnect disabled, localStorage token persist/echo on joinRoom). Reconnection FLOW + connection wiring (1.6/1.7) explicitly out of scope. Status → ready-for-dev.
- 2026-06-19 — Story 1.5 implemented (dev-story): `issueIdentity()` body (two distinct crypto.randomUUID draws) + red-first unit test; client `socket.ts` (PartySocket `maxRetries: 0` reconnect-disabled, localStorage token persist/load, `buildJoinRoomIntent` echo, `VITE_WS_URL`); `vite-env.d.ts` typing. Resolver = comment-only Story 1.7 seam (user-confirmed). Full gate green (typecheck/lint/test/build). Status → review.
