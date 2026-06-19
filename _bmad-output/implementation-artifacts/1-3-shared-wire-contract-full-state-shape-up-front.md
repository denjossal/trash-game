---
baseline_commit: 51d737d1d34f701527f6e72de0e009a4d585b334
---

# Story 1.3: Shared wire contract — full state shape up front

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the builder,
I want the complete authoritative and projected state shapes plus the intent/event/error unions defined once in `@trash/shared`,
so that later epics extend the contract rather than retrofitting it, and a contract change breaks compilation on both server and client immediately.

## Acceptance Criteria

**AC1 — The full contract is authored in `@trash/shared`.**
Given `@trash/shared`,
When the contract is authored,
Then it defines, in `shared/src/types.ts`:
- `Card` (`rank: number` constrained 1..13, decorative `suit: '♠' | '♥' | '♦' | '♣'`)
- `Phase` enumerating ALL SEVEN canonical values up front: `'lobby' | 'dealing' | 'turns' | 'allActed' | 'showdown' | 'roundResult' | 'gameOver'` — where `allActed` is the real phase value the server enters when the one pass completes (it is a `Phase` literal, **NOT** a derived predicate); Story 2.6 emits it and Story 3.2 consumes it
- the full authoritative `TableState` (incl. `players[].lives/isAlive/seatIndex`, `hostId`, `startingLives`, `phaseToken`, and `round` with `startingPlayerId`/`currentTurnId`/`turnToken`/`hands`/`deck`/`acted`/`revealed`)
- `Player` and `Round` (the constituent types of `TableState`)
- `ProjectedTableState` (the client-bound projection shape)
- the `Intent` union
- the `ServerEvent` union (`tableState | error`)
- the `ErrorReason` union
- `IntentError` as a pure class
And the elimination/seat/lives/startingPlayer fields AND the `allActed` phase value exist now even though they are not exercised until Epic 2/3 — so 3.2 consumes a phase the contract already names and never introduces it. *(Decision #2; Winston review.)*

**AC2 — Forward-named intents present up front.**
Given the `Intent` union,
When it is authored,
Then it names `newGame` (Host, `gameOver`→`lobby` "one more?", `phaseToken`-guarded) up front alongside `dealAgain`, so Story 3.6's "one more?" extends a contract the type already names rather than introducing a new intent late. *(Winston review — phase-machine reconciliation: `dealAgain` = between-rounds re-deal; `newGame` = new game on the same Table.)*

**AC3 — Rank-only comparison; letter map is client-only.**
Given the `Card` type,
When any comparison is written,
Then comparison is `<`/`>` on integer `rank` only; `suit` is never compared; and the rank→letter map does **NOT** live in `@trash/shared` (it is client-only, Story 1.9).

**AC4 — Single source of truth breaks both consumers.**
Given a future contract change,
When a field is added or changed in `@trash/shared`,
Then both `server` and `client` fail to compile until updated. **Verification:** each package must hold a type-level consumer of the contract such that `npm run typecheck` fails on `server` AND on `client` when the contract is altered. This must be demonstrated red-first (temporarily mutate the contract → both typechecks fail → revert → both pass).

**AC5 — Wire-protocol rules (AR-7) are encoded in the types.**
Given the wire protocol rules (AR-7),
When the contract is authored,
Then it encodes:
- server→client is a SINGLE `tableState` event carrying a complete `ProjectedTableState` (never deltas/patches — **no `patch`/`delta` field exists in any type**) plus a targeted `error`
- every message is a `{ type, payload }` envelope with camelCase fields
- transient beat signals (`justReceivedSwap`, `revealed`, `loserIds`, `winnerIds`) are value-free fields **ON** the `ProjectedTableState` snapshot, not separate event streams
- there are NO continuous/animation-driven server messages (beats are discrete state changes only — no third `ServerEvent` literal). *(AR-7.)*

## Tasks / Subtasks

- [x] **Task 1 — Author `Card`, `Phase`, `Player`, `Round`, `TableState` (AC: 1, 3)**
  - [x] In `shared/src/types.ts`, replace the `SharedContractVersion` stub with `Card = { rank: number; suit: '♠' | '♥' | '♦' | '♣' }`. Document inline: `rank` is integer 1..13, Ace=1 (lowest), King=13 (highest); `suit` is decorative and never compared.
  - [x] Define `Phase` as a 7-literal union in canonical order: `'lobby' | 'dealing' | 'turns' | 'allActed' | 'showdown' | 'roundResult' | 'gameOver'`. Add the canonical transition comment block (see Dev Notes → Phase machine) so downstream stories read one source.
  - [x] Define `Player = { id: string; name: string; lives: number; isAlive: boolean; isConnected: boolean; seatIndex: number }`.
  - [x] Define `Round = { startingPlayerId: string; currentTurnId: string; turnToken: number; hands: Record<string, Card>; deck: Card[]; acted: string[]; revealed: boolean }`. Comment `hands`/`deck` as SERVER-ONLY (never serialized except to owner / at showdown).
  - [x] Define `TableState = { code: string; phase: Phase; hostId: string; startingLives: number; players: Player[]; round: Round | null; phaseToken: number }`. Comment that `round` is in-memory only (not persisted) and that the persisted summary is `{ code, phase, hostId, startingLives, players, phaseToken }`.
- [x] **Task 2 — Author `ProjectedTableState` with AR-7 beat fields (AC: 1, 5)**
  - [x] Define `ProjectedTableState` exactly per the architecture shape (Dev Notes → ProjectedTableState). Include `you: { playerId; isHost; isAlive; isConnected; isLastPlayer; hand?: Card }`, `players[]` with optional `hand?` (present only when revealed), `currentTurnId?`, `turnToken?`, `phaseToken`, `revealed`, and the value-free beat fields `loserIds?`, `winnerIds?`, `justReceivedSwap?`.
  - [x] Assert in a comment that NO `patch`/`delta` field exists and beats are fields on the snapshot, not streams (AR-7).
- [x] **Task 3 — Author the `Intent` union (AC: 1, 2)**
  - [x] Define `Intent` as a discriminated union on `type` exactly per architecture (Dev Notes → Intent union), including `createRoom`, `joinRoom`, the `phaseToken`-guarded Host transitions `deal | revealAll | dealAgain | newGame`, the `turnToken`-guarded `swap | keep | drawFromDeck`, and the host-control intents `hostSetLives | hostRemovePlayer | hostReassign`.
  - [x] Confirm `newGame` and `dealAgain` are both present now (AC2).
- [x] **Task 4 — Author `ServerEvent`, `ErrorReason`, `IntentError` (AC: 1, 5)**
  - [x] Define `ServerEvent = { type: 'tableState'; payload: ProjectedTableState } | { type: 'error'; payload: { reason: ErrorReason } }`. No third literal (AC5).
  - [x] Define `ErrorReason = 'stale-turn' | 'stale-phase' | 'not-your-turn' | 'not-host' | 'bad-code' | 'room-full' | 'phase-illegal'`.
  - [x] Define `IntentError` as a **pure** class (extends `Error`) carrying a `reason: ErrorReason`. It lives in `shared/src/types.ts` and must contain no `Date`/`Math.random`/`crypto`/IO (it is imported by the pure `rules/**` tree in Epic 2 — see purity gate in Dev Notes).
- [x] **Task 5 — Export the contract; remove the stub cleanly (AC: 1, 4)**
  - [x] `shared/src/index.ts` already does `export * from "./types.js"` and `export * from "./config.js"`. Verify the new types/class flow through `@trash/shared` unchanged. Do NOT add path aliases (import-by-name only — see Project Structure Notes).
  - [x] Remove `SharedContractVersion` only after Task 6 has migrated its two consumers (`client/src/App.svelte`, any test referencing it).
- [x] **Task 6 — Wire a type-level consumer in BOTH `server` and `client` (AC: 4)**
  - [x] In `client`: replace the `SharedContractVersion` reference in `client/src/App.svelte` with a real contract reference (`const phase: Phase = "lobby"`) so a contract change breaks `npm run typecheck` in `client` (svelte-check + tsc).
  - [x] In `server`: added the real `projectStateFor(state: TableState, playerId: string): ProjectedTableState` signature in `server/src/project-state.ts` (Story 1.4's home — not throwaway) so a contract change breaks server `tsc -b`.
  - [x] `server/src/scaffold.test.ts` did NOT reference `SharedContractVersion` (it imports `DEFAULT_LIVES`/`ROOM_CODE_LEN`) — left untouched; only `client/src/App.svelte` referenced the stub and was migrated.
- [x] **Task 7 — Red-first proof of single source of truth (AC: 4)** *(test-first discipline)*
  - [x] Temporarily mutated the contract (`Phase` `"lobby"`→`"lobbyMUTATED"`; `TableState.code`→`codeMUTATED`), ran the per-workspace typechecks, and confirmed BOTH `server` and `client` fail to compile. Failures recorded in Debug Log. Mutation reverted; both pass.
- [x] **Task 8 — Green the full gate suite (AC: all)**
  - [x] `npm run typecheck` passes (shared, server, client).
  - [x] `npm run lint` passes — no purity/egress gate violations.
  - [x] `npm test` passes (server vitest — node `rules` project + `do` project; 2/2).
  - [x] `npm run build` passes (client vite build incl. svelte-check + PWA).

### Review Findings

*Code review 2026-06-19 (fresh-context, 3 adversarial layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor).*

- [x] [Review][Patch] AC4 single-source-of-truth consumers are structurally too narrow — guarantee held only for the two Task-7 anchor fields, not "any field add/change" [server/src/project-state.ts; client/src/App.svelte] — **RESOLVED.** Replaced the narrow anchors with exhaustive `satisfies` bindings: server `project-state.ts` now binds fully-populated `Card`/`Player`/`Round`/`TableState`/`ProjectedTableState` literals (optionals included); `App.svelte` binds `ProjectedTableState` + `Intent` + `ServerEvent` (the contract types the client touches over the wire; `TableState`/`Round` are server-only and intentionally not client-anchored). Re-proved red-first with non-anchor/optional/nested/union mutations (`Card.rank`, `Player.seatIndex`, optional `ProjectedTableState.winnerIds`, `ErrorReason."stale-turn"`): server 8 TS errors, client 4 errors — both sides now break. Reverted; all gates green. (Blind Hunter + Acceptance Auditor.)
- [x] [Review][Defer] `Card.rank` / Intent numeric+string fields are unconstrained at the type level [shared/src/types.ts] — deferred: by design. `rank: number` matches architecture verbatim; the stack has no validation lib by design; range/integer/token validation is Epic 2 `server/src/rules/validate.ts`. (Blind + Edge.)
- [x] [Review][Defer] `ProjectedTableState.players[].hand` privacy + `you`↔`players[]` consistency not enforced by the type [shared/src/types.ts] — deferred: enforced by `projectStateFor` + the SM-6 negative-assertion test, both Story 1.4 scope; the type intentionally permits `hand?` for the revealed/showdown case. (Blind + Edge.)
- [x] [Review][Defer] No `internal`/`not-implemented` code in `ErrorReason`; `projectStateFor` throws a raw `Error` [shared/src/types.ts; server/src/project-state.ts] — deferred: Epic 2 dispatch-catch design concern. Confirmed zero callers today (genuinely unreachable until Story 1.4). (Blind + Edge.)

## Dev Notes

### What this story is (and is NOT)
- **IS:** authoring TypeScript types + one pure class (`IntentError`) in `@trash/shared`, replacing the `0.0.0-stub`, and wiring a type-level consumer on each side so the single-source-of-truth guarantee is real (AC4).
- **IS NOT:** runtime schema validation. There is **no zod/valibot/io-ts in the stack** — the TypeScript types ARE the single source of truth. Runtime intent validation (`validate<Intent>` throwing `IntentError`) is **Story 2.x / `server/src/rules/validate.ts`**, NOT this story. Do not add a validation library. [Source: architecture.md#Stack — native types only; `validate.ts` is the runtime checker, Epic 2.]
- **IS NOT:** implementing `projectStateFor`, dispatch, handlers, persistence, or the engine. Those seams exist as stubs from Story 1.2 and are filled by Stories 1.4+. You only give them their type signatures' worth of contract.

### Phase machine (paste this comment block above `Phase`)
```
// Canonical phase machine — guards in dispatch (Epic 2); each Host edge bumps phaseToken:
//   lobby      --deal-->        dealing -> turns         (Host; phaseToken)
//   turns      --(last seat acted)--> allActed           (server-internal, on final accepted turn — Story 2.6)
//   allActed   --revealAll-->   showdown                 (Host; phaseToken; rejected unless phase === "allActed")
//   showdown   --(resolution)-> roundResult | gameOver   (server-internal: >=2 alive -> roundResult; <=1 -> gameOver)
//   roundResult--dealAgain-->   dealing -> turns         (Host; phaseToken — Story 3.4)
//   gameOver   --newGame-->     lobby                    (Host "one more?"; phaseToken; same roster — Story 3.6)
//   (any live phase, on DO wake with round===null) --D2.1 coerce--> roundResult (bump phaseToken before first projection)
```
`allActed` is a real Phase literal, not a predicate. [Source: epics.md#Story-1.3 lines 279–282; architecture.md#Phase lines 574–590.]

### Intent union (author exactly this shape)
```ts
type Intent =
  | { type: "createRoom";       payload: { name: string } }
  | { type: "joinRoom";         payload: { code: string; name: string; sessionToken?: string } }
  | { type: "deal" | "revealAll" | "dealAgain" | "newGame"; payload: { phaseToken: number } }
  | { type: "swap" | "keep" | "drawFromDeck";               payload: { turnToken: number } }
  | { type: "hostSetLives";     payload: { phaseToken: number; lives: number } }
  | { type: "hostRemovePlayer"; payload: { phaseToken: number; playerId: string } }
  | { type: "hostReassign";     payload: { phaseToken: number; playerId: string } };
```
[Source: architecture.md#shared/types.ts lines 595–604.] Both `dealAgain` and `newGame` MUST be present now (AC2).

### ProjectedTableState (author exactly this shape)
```ts
type ProjectedTableState = {
  code: string; phase: Phase; hostId: string; startingLives: number;
  you: { playerId: string; isHost: boolean; isAlive: boolean; isConnected: boolean;
         isLastPlayer: boolean; hand?: Card };          // own view; hand = own card only
  players: { id: string; name: string; lives: number; isAlive: boolean;
             isConnected: boolean; seatIndex: number; hand?: Card }[]; // hand only if revealed
  currentTurnId?: string; turnToken?: number; phaseToken: number;
  revealed: boolean; loserIds?: string[]; winnerIds?: string[];
  justReceivedSwap?: boolean;
};
```
`you.isLastPlayer`, `you.isAlive/isConnected`, and `winnerIds` are **server-computed, value-free** — the client never recomputes turn-order, elimination, or win logic. [Source: architecture.md#ProjectedTableState lines 592–628.]

### ServerEvent / ErrorReason (author exactly this shape)
```ts
type ServerEvent =
  | { type: "tableState"; payload: ProjectedTableState }
  | { type: "error";      payload: { reason: ErrorReason } };

type ErrorReason =
  | "stale-turn" | "stale-phase" | "not-your-turn" | "not-host"
  | "bad-code" | "room-full" | "phase-illegal";
```
[Source: architecture.md#shared/types.ts lines 606–612.] No third `ServerEvent` literal (AC5).

### Serialization rules (encode via type shape, document in comments)
- Every message is `{ type, payload }`; JSON fields camelCase.
- Omit a key when its value is ABSENT (hence the `?` optionals on beat fields and `hand`); never serialize `null`; `[]`/`false`/`0` are meaningful and always included. The optionals in `ProjectedTableState` encode "omit when absent"; required fields (`revealed`, `phaseToken`, arrays) are always present. [Source: architecture.md lines 547–548.]

### `IntentError` purity constraint
- `IntentError` is imported by `server/src/rules/**`, which is ESLint-purity-gated: NO `Date.now`/`new Date()`/`Math.random`/`crypto`/`fetch`/`storage`/`ws`/`this.`/`console`/`performance`/`caches`, no dynamic `import()`, and imports restricted to `@trash/shared` + same-tree `./`. A class that only sets `this.reason = reason` and calls `super(message)` is fine. Do NOT put a timestamp or id-gen in it. [Source: 1-2 review — purity denylist; architecture.md#rule-enforcement-table.]

## Architecture Compliance

- **Location:** all contract types in `shared/src/types.ts`; tunables stay in `shared/src/config.ts` (already authored — do not duplicate). [architecture.md#Project-Directory-Structure.]
- **Import-by-name:** consumers import `@trash/shared` (npm-workspace symlink). **NO path aliases / `paths` / `baseUrl`** — Story 1.2 proved import-by-name end-to-end; introducing an alias is a regression. [1-2 dev notes.]
- **No deltas:** `tableState` payload is ALWAYS a complete `ProjectedTableState`; a `patch`/`delta` field anywhere violates AR-7 (review + type enforce). [architecture.md#rule-enforcement-table.]
- **`projectStateFor` is the sole egress producer** (Story 1.4 implements). If you annotate `project-state.ts` as the server-side consumer (Task 6), give it the `ProjectedTableState` return type only — do not implement projection logic here.
- **Naming:** types `PascalCase` (no `I` prefix); union members are string literals; `camelCase` fields. Module file is `kebab-case.ts`. [architecture.md lines 559–566.]
- **Card semantics:** `rank` integer 1..13, compared with `<`/`>` only; `suit` decorative, never compared; rank→letter map stays in `client/src/lib/card-display.ts` (Story 1.9) — never in `shared`/`server`/`rules`. [architecture.md lines 550–551.]

## Library / Framework Requirements

- **No new dependencies.** Contract is type-only TypeScript + one class. Do not add zod/valibot or any validation lib.
- TypeScript 5.9.3, `moduleResolution: "Bundler"`, `strict: true`, `composite: true` (inherited from `tsconfig.base.json`). Use `.js` extensions in relative re-exports (`./types.js`) per existing `index.ts` (NodeNext/Bundler ESM convention already in place).
- Toolchain (pinned, already installed): eslint 9.39.1, typescript-eslint 8.46.4, vitest 4.1.9, @cloudflare/vitest-pool-workers 0.16.18, svelte 5.56.3, svelte-check 4.4.1, wrangler 4.103.0. [1-2 File List / package.json.]

## File Structure Requirements

**EDIT (existing — read before changing):**
- `shared/src/types.ts` — currently the `SharedContractVersion = "0.0.0-stub"` placeholder. Replace with the full contract.
- `shared/src/index.ts` — already re-exports `./types.js` + `./config.js`; verify, do not restructure.
- `client/src/App.svelte` — currently references `SharedContractVersion`. Re-point to a real contract type (Task 6).
- `server/src/scaffold.test.ts` — keep the import-by-name assertion; update only if it touches `SharedContractVersion`.
- `server/src/project-state.ts` — Story 1.2 seam stub; preferred home for the server-side type-level consumer (annotate return as `ProjectedTableState`). Read it first to preserve the existing stub contract/comment.

**DO NOT TOUCH:** `shared/src/config.ts` (already complete), wrangler/vitest/eslint configs, the `rules/` purity or `push-state` exception gates, `server/src/scaffold.do.test.ts`.

**MUST PRESERVE:** the system stays green end-to-end. The two scaffold smoke tests (`scaffold.test.ts`, `scaffold.do.test.ts`) must keep passing; the ESLint gates must keep passing; client build must keep passing. A contract that compiles but breaks an existing gate is not done.

## Testing Requirements

- **Test-file naming is convention-enforced, not code-enforced:** node tests `*.test.ts` (vitest "rules" project), DO tests `*.do.test.ts` (vitest "do" project). A `*.spec.ts` file runs in NO project (silent zero-coverage). Use only the two recognized suffixes. [1-2 deferred-work #8; `server/vitest.config.ts` comment.]
- **AC4 red-first proof (Task 7):** this is the story's central test. It is a *compilation* test, not a unit test — demonstrate by mutating the contract and observing BOTH `server` and `client` typechecks fail, then revert. Record both failures in the Debug Log. This satisfies "no task complete without passing tests" via the typecheck gate.
- **No new runtime unit tests are required** for pure type definitions (types have no runtime). The existing smoke tests + the typecheck/lint/build gates are the suite. If you add the server consumer in a `*.test.ts`, keep it a trivial `satisfies`/type assertion, not a behavioral test.
- Run the full gate before marking done: `npm run typecheck && npm run lint && npm test && npm run build`.

## Previous Story Intelligence (Story 1.2)

- **Workspaces:** root `package.json` has `workspaces: ["shared","server","client"]`; cross-package dep pinned as `"@trash/shared": "0.0.0"` (npm 11 has no `workspace:*` protocol). Resolves via symlink; **no path alias anywhere** — keep it that way.
- **Import-by-name proven:** `server/src/scaffold.test.ts` imports `{ DEFAULT_LIVES, ROOM_CODE_LEN } from "@trash/shared"` and passes. The contract you author flows through `@trash/shared` the same way.
- **ESLint gates are live and were HARDENED in code review** (commit `51d737d`): (1) `.send`/`.broadcast` banned everywhere except `server/src/push-state.ts`; (2) `rules/**` purity denylist incl. computed-member bypasses (`Date["now"]`, `Math["random"]`, `globalThis[...]`), dynamic `import()`, and import-allowlist (`@trash/shared` + same-tree only). Your type-only contract won't trip these — but the Task-6 server consumer must not introduce a banned token or a `../` import into `rules/**`.
- **Client typecheck wired:** `client` `typecheck`/`build` run `svelte-check` (wired in code review). A contract change in `client/src/App.svelte` WILL be caught — that's the AC4 client half.
- **Seam stubs exist for 1.4+:** `project-state.ts`, `push-state.ts`, `dispatch.ts`, `handlers.ts`, `persistence.ts`, `room-code.ts`, `identity.ts` are stubs. Prefer wiring the server type consumer into `project-state.ts` so it survives into Story 1.4.

## Git Intelligence

- `32d952d Story 1.2: AC-driven project initialization` — created the three-workspace scaffold, configs, seam stubs, smoke tests.
- `51d737d Story 1.2 code review: harden mechanical gates` — hardened the ESLint purity/egress gates and wired client svelte-check into typecheck/build/CI. The hardened gates are the guardrails your work runs against; do not weaken them to make the contract compile.

## Spike Intelligence (Story 1.1) — state-shape implications

- **Persisted summary = `{ code, phase, hostId, startingLives, players[], phaseToken }`** to a single `ctx.storage["table"]` key. In-memory `round` is NOT serialized (lost on DO eviction). Your `TableState` type must make `round: Round | null` and document the persisted subset. [1-1-spike-findings AC2.]
- **D2.1 reload coercion:** on DO wake, if persisted `phase` is a live-round phase but `round === null`, server coerces `phase → 'roundResult'` and bumps `phaseToken` before first projection. The type must support `phase` + `phaseToken` mutability and `round` nullability (it does, with the shape above). Logic is Story 1.4+/persistence. [1-1 AC2 D2.1.]
- **Do NOT couple the contract to `getWebSockets()` semantics.** The spike found `ctx.getWebSockets()` returns 0 under partyserver standard mode; the GC fix is Story 1.11. No connection-count field belongs in the wire contract. [1-1 AC3; deferred-work #2.]

## Project Structure Notes

- Alignment: the directory tree in architecture.md#Project-Directory-Structure is the canonical map; this story only fills `shared/src/types.ts` and adds two thin consumers. No new directories, no moved files.
- Variance to watch: architecture.md sometimes writes paths as `src/shared/types.ts` / `src/server/...` (logical) while the on-disk layout is the workspace form `shared/src/types.ts` / `server/src/...`. The **on-disk workspace form is authoritative** (proven in Story 1.2). Use `shared/src/types.ts`.

### References

- [Source: epics.md#Story-1.3 lines 271–297 — user story, all ACs, AR-7 protocol rules]
- [Source: epics.md#Epic-1 lines 126–128, 214–219 — epic objectives, binding decision #2 "full TableState up front"]
- [Source: architecture.md#shared/types.ts lines 595–624 — Intent, ServerEvent, ErrorReason verbatim shapes]
- [Source: architecture.md#Phase lines 574–590 — 7-literal Phase enum + canonical transitions]
- [Source: architecture.md#TableState lines 304–315 — authoritative state shape]
- [Source: architecture.md#ProjectedTableState lines 592–628 — projection shape + value-free beat fields]
- [Source: architecture.md#rule-enforcement-table lines 540–557 — no-deltas, ServerEvent two-literal, envelope, purity gates]
- [Source: architecture.md#Naming lines 559–566 — PascalCase types, camelCase fields, kebab-case files]
- [Source: architecture.md#Stack lines 235–252, 176–178 — pinned versions; types-only (no validation lib)]
- [Source: 1-2-ac-driven-project-initialization.md — workspace layout, import-by-name, ESLint gates, scripts]
- [Source: deferred-work.md #2, #8 — getWebSockets caveat, vitest test-suffix convention]
- [Source: 1-1-spike-findings.md AC2/AC3 — persisted summary set, D2.1 coercion, hibernation caveat]

## Dev Agent Record

### Agent Model Used

Opus 4.8 (1M context) — `us.anthropic.claude-opus-4-8[1m]`

### Debug Log References

**AC4 red-first proof (Task 7) — the central test of this story.** Types have no runtime; the
compiler is the test harness. Temporarily mutated `shared/src/types.ts` (`Phase` `"lobby"`→`"lobbyMUTATED"`
and `TableState.code`→`codeMUTATED`), then ran each workspace's typecheck:

- **Server** (`npx tsc -b shared server`) FAILED as required:
  `server/src/project-state.ts(15,72): error TS2339: Property 'code' does not exist on type 'TableState'.`
- **Client** (`npx svelte-check`) FAILED as required:
  `ERROR "src/App.svelte" 9:9 "Type '"lobby"' is not assignable to type 'Phase'."`

Reverted both mutations; confirmed `grep MUTATED` returns nothing and all gates green. This demonstrates
the single-source-of-truth guarantee: a contract change breaks compilation on BOTH server and client.

**Final gate run (from repo root):**
- `npm run typecheck` → 0 errors (shared + server + client; svelte-check 96 files, 0 errors)
- `npm run lint` → clean (`eslint .`; purity + `.send`/`.broadcast` egress gates pass)
- `npm test` → 2/2 passed (vitest `rules` node project + `do` pool-workers project)
- `npm run build` → client vite build + PWA generated, OK

**Note on lint:** initial server consumer used `_state`/`_playerId` underscore-prefixed params; the
project's `@typescript-eslint/no-unused-vars` has no `argsIgnorePattern`, so it flagged them. Rather than
weaken the Story-1.2 ESLint config (a standing guardrail), the params are now referenced in the
not-yet-implemented `throw` message — honest and lint-clean.

### Completion Notes List

- Authored the full `@trash/shared` wire contract in `shared/src/types.ts`, replacing the `0.0.0-stub`:
  `Card`, `Phase` (7 literals + canonical-transition comment), `Player`, `Round`, `TableState`,
  `ProjectedTableState`, `Intent`, `ServerEvent`, `ErrorReason`, and `IntentError` (pure class).
- **No new dependencies.** Contract is type-only + one pure class; no zod/valibot. Runtime validation
  remains Epic 2's `rules/validate.ts`.
- **No path aliases** — `@trash/shared` still resolves by name via the npm-workspace symlink (Story 1.2
  invariant preserved). `shared/src/index.ts` re-exports were already correct; no change needed.
- AR-7 encoded: single `tableState` event with complete `ProjectedTableState` (no `patch`/`delta` field),
  two-literal `ServerEvent`, value-free beat fields on the snapshot.
- AC2 forward-naming: both `dealAgain` and `newGame` present in `Intent` now.
- AC3: `Card.rank` is integer 1..13 with `suit` decorative; no rank→letter map in shared (stays client-only).
- `IntentError` kept pure (only `super(reason)` + `this.reason`/`this.name`) so the purity-gated
  `rules/**` tree can import it in Epic 2.
- Server consumer placed in `server/src/project-state.ts` as the real `projectStateFor` signature —
  it survives into Story 1.4 (not throwaway) and gives the server half of the SSoT guarantee.

### File List

- `shared/src/types.ts` — MODIFIED — replaced stub with the full wire contract (all types + `IntentError`).
- `client/src/App.svelte` — MODIFIED — client SSoT consumer: exhaustive `satisfies` bindings for `ProjectedTableState` + `Intent` + `ServerEvent` (the wire types the client touches).
- `server/src/project-state.ts` — MODIFIED — typed `projectStateFor(TableState) → ProjectedTableState` seam signature + exhaustive `satisfies` bindings for `Card`/`Player`/`Round`/`TableState`/`ProjectedTableState` (server SSoT consumer; projection body is Story 1.4).

## Change Log

- 2026-06-19 — Story 1.3 implemented: full `@trash/shared` wire contract authored; type-level consumers wired in server + client; single-source-of-truth proven red-first. All gates green (typecheck/lint/test/build). Status → review.
- 2026-06-19 — Code review (fresh-context, 3 adversarial layers): 1 patch, 3 defer. Patch — AC4 consumers were structurally too narrow (caught only the 2 anchored fields). Hardened both sides to exhaustive `satisfies` bindings covering all contract types incl. optionals/nested; re-proved red-first across non-anchor/optional/nested/union mutations (server 8 errors, client 4). All gates green. Status → done.
