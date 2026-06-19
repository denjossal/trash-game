---
baseline_commit: 8874b9c
---

# Story 1.4: Privacy chokepoint + standing SM-6 negative-assertion test

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Player,
I want my secret Card to be physically impossible to send to anyone else's device before Showdown,
so that the one hard integrity rule holds — verified mechanically, not by reviewer vigilance.

## Acceptance Criteria

**AC1 — `projectStateFor` is the SOLE producer of a `tableState` payload; others' hands omitted while hidden.**
Given `server/src/project-state.ts`,
When the egress layer is built,
Then `projectStateFor(state, playerId)` is the SOLE producer of a `tableState` payload, returning the caller's OWN `hand` (in `you.hand`) and OMITTING every other player's `hand` while `round.revealed` is `false`,
And `server/src/push-state.ts` remains the ONLY module that may call `connection.send` (enforced by the Story 1.2 ESLint gate — do NOT add a `.send` call to `project-state.ts`). *(AR-4, NFR-1.)*

**AC2 — The same function anticipates the reveal phase (Epic 3 extends, never weakens).**
Given the chokepoint is authored anticipating the reveal phase,
When `round.revealed` is `true` (a state only reachable in Epic 3),
Then the SAME `projectStateFor` function includes every player's `hand` in `players[]` — so Epic 3 EXTENDS this one function rather than weakening a too-narrow rule. The branch is `round.revealed`, the single switch. *(Decision #3.)*

**AC3 — The negative-assertion privacy test (the SM-6 acceptance criterion).**
Given the negative-assertion privacy test,
When a multi-player `TableState` with DISTINCT hands is projected for one `playerId` while `revealed === false`,
Then the test asserts NO other player's card value (nor any pre-Showdown-inferable derivative of it) appears ANYWHERE in that payload, and FAILS if one does.
And this test asserts ONLY the `revealed === false` behavior — the `revealed === true` projection is Story 3.2's acceptance, so this AC does NOT forward-bind to Epic 3 (do not author a reveal-true privacy assertion here). *(Amelia review.)*
And this test is registered as a STANDING CI gate that every later epic's new `ProjectedTableState` field must re-pass. *(Pre-mortem E.)*

**AC4 — Constant message shape (the unit AC half of the inference-channel rule).**
Given the SM-6 inference channels (a card must be neither SEEN nor INFERRED — pass/fail),
When the standing privacy test runs,
Then it asserts **constant message shape**: the pre-Showdown projection has the SAME structure / field-set / array length regardless of any player's hidden card value — there is NO value-dependent branch that changes the payload's shape or size. (Proven by projecting two `TableState`s that differ ONLY in hidden card values and deep-comparing the two `revealed=false` projections field-for-field after stripping the owner's own `you.hand`.) *(Mary review — inference channel (a).)*

**AC5 — Standing review obligations carried forward (documented, NOT coded here).**
Given the remaining SM-6 inference channels,
When this story is closed,
Then it records two STANDING review obligations (not implemented in 1.4 — there is no turn/peek/swap code yet): (b) turn-scoped responses (`swap`/`keep`/`peek`/`drawFromDeck`) MUST be **timing-indistinguishable** by card value (no value-dependent server-latency branch); (c) no surface may render a **behavioral tell** (glow / enabled-state / count) that lets a neighbor infer a hidden card. These are carried into the Epic 2 turn stories — **Story 2.4** (Swap/Keep), **Story 2.5** (Peek), **Story 2.6** (Last-player Swap/draw) — and appended to `deferred-work.md`. *(Mary review — inference channels (b)/(c) are standing obligations, not unit ACs. NOTE: the epics' Mary-review parenthetical writes "2.4/2.5/2.7"; Epic 2 has no Story 2.7 — the on-disk mapping is peek = 2.5, draw = 2.6. Use the 2.4/2.5/2.6 mapping.)*

## Tasks / Subtasks

- [x] **Task 1 — Implement the pure projection body in `project-state.ts` (AC: 1, 2)**
  - [x] Read `server/src/project-state.ts` first. Replace the `throw new Error(...)` stub body of `projectStateFor(state, playerId)` with the real pure projection. Keep the exported signature `projectStateFor(state: TableState, playerId: string): ProjectedTableState` exactly as-is (Story 1.3 wired the server SSoT consumer to it).
  - [x] Build `you`: locate the caller's `Player` in `state.players` by `id === playerId`. Set `playerId`, `isHost` (`state.hostId === playerId`), `isAlive`, `isConnected` from that record. Set `you.hand` to `state.round?.hands[playerId]` (the caller's OWN card) when a round exists; omit the key (do not set `undefined` explicitly — see Dev Notes → serialization) when there is no round.
  - [x] Compute `you.isLastPlayer` server-side as a value-free boolean. **MVP scope:** this story has no turn engine; set `isLastPlayer: false` and add an inline comment that the real last-player derivation lands in Story 2.6 (the field MUST exist now per the contract, value-free). Do NOT invent turn-order logic here.
  - [x] Build `players[]`: map `state.players` (preserve order). For EACH seat, copy `id, name, lives, isAlive, isConnected, seatIndex`. For `hand`: **omit it for ALL seats (including self) while `state.round?.revealed !== true`**; include `hand: state.round.hands[p.id]` for every seat ONLY when `state.round?.revealed === true`. (Self's hidden card is exposed via `you.hand` ONLY — never duplicated into `players[]` pre-reveal. *[Source: deferred-work.md — 1.3 review privacy clarification.]*)
  - [x] Build the top-level fields: `code`, `phase`, `hostId`, `startingLives` from `state`; `phaseToken` from `state.phaseToken`; `revealed` = `state.round?.revealed ?? false` (always present — never omitted, it is a meaningful `false`). Set `currentTurnId`/`turnToken` from `state.round` when a round exists, else omit (optional). Omit `loserIds`/`winnerIds`/`justReceivedSwap` entirely in this story (those beats are Epic 3 / 2.4 — no code sets them yet).
  - [x] Keep the function PURE: no `Date`/`Math.random`/`crypto`/`fetch`/`storage`/`this`/`console`, no `.send`/`.broadcast`. (It lives in `server/src/`, NOT `rules/**`, so the rules-purity ESLint gate does not apply — but the `.send`/`.broadcast` ban DOES apply here, and the function must stay a pure transform regardless. See Dev Notes.)

- [x] **Task 2 — Author the SM-6 negative-assertion privacy test (AC: 3, 4)** *(test-first discipline — write the assertion, watch it fail against a deliberately leaky projection, then confirm green against the real one)*
  - [x] Create `server/src/project-state.test.ts` (the node `rules` vitest project — `*.test.ts` suffix, NOT `*.do.test.ts`; this is a PURE function test, no WS plumbing). [Source: server/vitest.config.ts naming convention.]
  - [x] Build a fixture: a `TableState` with `round.revealed === false` and ≥3 players holding DISTINCT, recognizable card values (e.g. ranks 3, 7, 11 — distinct so a leak is unambiguous). Project it for player A.
  - [x] **Value-absence (AC3):** assert that no OTHER player's card value appears anywhere in the projection. Implement this as a deep walk of the serialized projection (`JSON.stringify` round-trip, or a recursive scan) checking that each non-owner's `{rank, suit}` is absent; assert `players[]` entries for non-owner seats have NO `hand` key (`'hand' in entry === false`). Confirm player A's OWN card IS present (in `you.hand`) — privacy must not over-redact the owner.
  - [x] **Constant message shape (AC4):** build a SECOND `TableState` identical to the first EXCEPT every hidden card value is different (e.g. ranks 1, 13, 5). Project both for the same `playerId` while `revealed === false`. Strip `you.hand` from each (the one field that legitimately varies with the owner's own card), then deep-equal the two projections — assert IDENTICAL structure, field-set, and `players[]` length. A value-dependent branch that changed shape/size fails here.
  - [x] Add a clearly-labeled comment block at the top of the test: `// STANDING SM-6 CI GATE (Pre-mortem E). Every later epic that adds a ProjectedTableState field MUST re-pass this test for that field: the new field carries no card value or pre-Showdown-inferable information while revealed===false.` (AC3 standing-gate registration is satisfied by this test living in the always-run `rules` project + this doc-comment.)
  - [x] Red-first proof: temporarily make `projectStateFor` leak (e.g. include all hands in `players[]` unconditionally) → run `npm test` → confirm the value-absence assertion FAILS. Revert to the correct body → confirm green. Record both in the Debug Log.

- [x] **Task 3 — Record the standing review obligations (AC: 5)**
  - [x] Append a section to `_bmad-output/implementation-artifacts/deferred-work.md` titled `## Standing obligations from: Story 1.4 (SM-6 inference channels)` capturing obligations (b) timing-indistinguishability of `swap`/`keep`/`peek`/`drawFromDeck` responses and (c) no behavioral tell (glow/enabled-state/count) — each tagged with its owning story (2.4 / 2.5 / 2.6). These are NOT code in 1.4.

- [x] **Task 4 — Green the full gate suite (AC: all)**
  - [x] `npm run typecheck` passes (shared + server + client). The `project-state.ts` body must construct a valid `ProjectedTableState` — if it does not typecheck, the projection is structurally wrong.
  - [x] `npm run lint` passes — no `.send`/`.broadcast` token introduced in `project-state.ts`; no purity regression elsewhere.
  - [x] `npm test` passes — node `rules` project (now incl. the new SM-6 test) + `do` project, all green.
  - [x] `npm run build` passes (client unaffected, but the gate must stay green end-to-end).

### Review Findings

_Code review 2026-06-19 (bmad-code-review: Blind Hunter + Edge Case Hunter + Acceptance Auditor). All 5 ACs PASS; full gate green. 2 patch, 3 defer, 9 dismissed as noise._

- [x] [Review][Patch] AC3 test has a rank-collision false-negative [server/src/project-state.test.ts:62] — fixture owner rank `3` equals `lives: 3` and `startingLives: 3`, so a leaked rank-3 card from B/C would be masked by the `collectValues` Set, and the positive assertion `values.has(handA.rank)` passes via `lives` even if `you.hand` were dropped. The test never asserts hidden **suits** are absent (suits are the only collision-free values). Fix: choose card ranks disjoint from every other integer in the fixture (lives/startingLives/seatIndex/tokens — e.g. 6/9/12), and add suit-absence assertions for non-owner cards. (blind+edge+auditor)
- [x] [Review][Patch] SSoT hole for read-only `Round` fields after scaffolding removal [server/src/project-state.ts:91] — removing the 1.3 `_state`/`_round` `satisfies` scaffolding left `Round.startingPlayerId`, `Round.acted`, and `Round.deck` UNGUARDED in production code: the body never reads them and `_beats`/`_card` don't cover them. Auditor verified empirically (`tsc` rename) that renaming any of the three PASSES the production typecheck — their SSoT rename-detection now survives only because the test fixture happens to construct a full `Round`. The File Structure Requirements warned to remove scaffolding "ONLY if the new body genuinely constructs every field"; the Debug Log's re-proof only renamed `winnerIds` (a `_beats`-covered optional), overstating coverage. Fix: add a `satisfies Pick<Round, "startingPlayerId" | "acted" | "deck">` binding alongside `_beats` (or a `satisfies Round` literal), restoring body-level rename-detection independent of any test. (auditor)
- [x] [Review][Defer] Reveal-true assigns `entry.hand = undefined` for a seat with no hand entry [server/src/project-state.ts:56] — deferred, reveal-true path is Story 3.2 / Epic 3 (this story scopes only `revealed === false`; AC3 forbids forward-binding). When `revealed === true` and `round.hands[p.id]` is missing, `entry.hand = round.hands[p.id]` makes the key present with value `undefined` (breaches omit-when-absent / constant-shape pre-serialization; JSON.stringify currently masks it). Carry into Story 3.2 — guard with `const h = round.hands[p.id]; if (h) entry.hand = h;`.
- [x] [Review][Defer] Reveal-true projection path has zero test coverage [server/src/project-state.test.ts] — deferred, the `revealed === true` assertion is explicitly Story 3.2's acceptance (AC3 says do not author a reveal-true privacy assertion here). The only branch that exposes others' cards is untested; the Story 3.2 test should also catch the `entry.hand = undefined` defer above.
- [x] [Review][Defer] Branch-coverage gaps in the SM-6 test [server/src/project-state.test.ts] — deferred, body already handles these via `round?.…`; happy-path-only is acceptable for this story's scope. Untested: `round === null` (lobby / D2.1), non-host projector, a projector not at seat 0, `playerId` not seated (spectator fallback), and empty / single / duplicate-id rosters. Optional hardening for a future test-strengthening pass.

## Dev Notes

### What this story is (and is NOT)
- **IS:** implementing the pure projection BODY of the already-typed `projectStateFor` seam (Story 1.3 left the signature + a throwing stub), and authoring the SM-6 negative-assertion privacy test that becomes a STANDING CI gate. This is the single hardest HARD-constraint in the build (NFR-1 / §11.1 / SM-6).
- **IS NOT:** implementing `pushState`, dispatch, handlers, the turn engine, persistence, the deck, or any phase transition. Those seams stay stubs (Stories 1.5–1.11, Epic 2+). `projectStateFor` is a PURE transform `(TableState, playerId) → ProjectedTableState`; it neither sends nor mutates.
- **IS NOT:** the reveal-true privacy behavior's acceptance test. The function MUST support `revealed === true` (AC2 — the branch exists), but its negative-assertion test is Story 3.2's. This story's test asserts ONLY `revealed === false` (AC3). Do not write a reveal-true privacy assertion here.
- **IS NOT:** runtime intent validation. No range/token checks — that is Epic 2 `rules/validate.ts`. `projectStateFor` trusts a well-formed `TableState`.

### The privacy rule, stated precisely (the thing the test pins)
While `round.revealed === false` (every phase before Showdown):
- `you.hand` = the caller's OWN card (from `round.hands[playerId]`), present when a round exists.
- `players[].hand` is **OMITTED for every seat, including the caller's own seat.** The caller's card is exposed in `you.hand` ONLY — never duplicated into the `players[]` entry. (This avoids the `you` ↔ `players[]` double-source-of-truth the 1.3 review flagged, and keeps the constant-shape invariant clean: every `players[]` entry has the identical key-set regardless of any hidden value.)

When `round.revealed === true` (reachable only in Epic 3 / Showdown):
- `players[].hand` = `round.hands[p.id]` for EVERY seat (all hands now projectable). This is the SAME function, one `if (revealed)` branch — Epic 3 extends, never replaces. [Source: epics.md#Story-1.4 AC; deferred-work.md 1.3 review clarification; architecture.md lines 367–376, 614–620.]

### Constant-message-shape invariant (AC4 — why it matters)
SM-6 is "no card SEEN **or INFERRED**." A naive projector that, say, only sets a key when a value is non-zero, or that varies array length by card rank, would leak information through the *shape* of the message even with values absent. AC4 pins this: build two states differing ONLY in hidden card values, project both (`revealed=false`), strip the owner's own `you.hand`, and the two projections must be byte-for-byte structurally identical. Practically this means: never branch the projection's field-set or `players[]` length on a hidden card value. Omit-when-absent keys (`currentTurnId`, beats) are fine because their presence depends on PHASE/round-existence, not on a hidden card value.

### Serialization rules (must hold in the produced object)
- Every message is a `{ type, payload }` envelope; `projectStateFor` returns the PAYLOAD (`ProjectedTableState`). The envelope (`{ type: "tableState", payload }`) is assembled by `pushState` (Story 1.6) — do not add the envelope here.
- **Omit a key when its value is ABSENT; never serialize `null`.** Use optional-key omission (don't assign `undefined`) so the key is genuinely absent on the wire. `[]` / `false` / `0` are MEANINGFUL and always present — `revealed: false` is always emitted, never omitted. [Source: architecture.md lines 547–548; types.ts comment.]
- camelCase fields (already fixed by the `ProjectedTableState` type).

### Purity & egress constraints on this file
- `project-state.ts` is in `server/src/`, NOT `server/src/rules/**` — so the `rules/**` purity ESLint denylist does NOT apply to it. BUT the function must still be a deterministic pure transform (no clock/RNG/IO) by design — the privacy guarantee depends on it being a referentially-transparent projection.
- The repo-wide `.send`/`.broadcast` ESLint ban DOES apply here (only `push-state.ts` is exempted). `projectStateFor` must NOT call `.send`/`.broadcast` — it returns data; `pushState` sends it. [Source: eslint.config.js GATE 1; architecture.md lines 525–537, 544–545.]
- `rank` is compared with `<`/`>` only and `suit` is never compared — but this story does no comparison at all (pure projection). The int→letter map stays client-only; never reference letters here. [Source: architecture.md lines 550–551.]

### Canonical round-trip (where this function sits)
```
src/server/handlers/handle-<intent>.ts        (Epic 2 — not this story)
  ... validated mutation produces new TableState ...
  for (const c of this.getConnections()) pushState(c)   // (Story 1.6)

src/server/push-state.ts  (the ONE module allowed to call connection.send — Story 1.6)
  pushState(c) = c.send({ type:"tableState", payload: projectStateFor(state, c.playerId) })
                                                        └── THIS STORY (the pure projector)
```
[Source: architecture.md#Canonical-round-trip lines 512–538.]

## Architecture Compliance

- **Location:** the pure projector is `server/src/project-state.ts` (on-disk workspace form is authoritative; architecture.md sometimes writes `src/server/project-state.ts` logically — use `server/src/project-state.ts`). The single send site is `server/src/push-state.ts` — left a stub this story. [Source: architecture.md#Project-Directory-Structure lines 694–695; 1-3 Project Structure Notes.]
- **Single chokepoint (AR-4):** `projectStateFor` is the SOLE producer of a client-bound `tableState` payload; any hand-built `tableState` payload elsewhere is a violation (review + this negative-assertion test). [Source: architecture.md lines 104–108, 290, 544.]
- **No deltas:** the projection is ALWAYS a complete `ProjectedTableState`; no `patch`/`delta` field exists in the type. [Source: architecture.md line 549.]
- **Import-by-name:** import contract types from `@trash/shared` (`import type { ... }`), never a relative path into `shared/`. No path aliases. [Source: 1-3 dev notes; 1-2 invariant.]
- **Naming:** `project-state.ts` kebab-case; `projectStateFor` camelCase; types PascalCase. [Source: architecture.md lines 559–566.]

## Library / Framework Requirements

- **No new dependencies.** The projector is pure TypeScript over `@trash/shared` types; the test is plain vitest (`expect`/`test`). Do NOT add a deep-equal library — vitest's `expect(...).toEqual(...)` does deep structural comparison; `JSON.parse(JSON.stringify(x))` is sufficient for the value-absence scan.
- Toolchain (pinned, already installed — do not bump): typescript 5.9.3, eslint 9.39.1, typescript-eslint 8.46.4, vitest 4.1.9, @cloudflare/vitest-pool-workers 0.16.18, wrangler 4.103.0. TypeScript: `moduleResolution: "Bundler"`, `strict: true`, `composite: true` (inherited from `tsconfig.base.json`). [Source: 1-3 / 1-2 package.json.]

## File Structure Requirements

**EDIT (existing — read before changing):**
- `server/src/project-state.ts` — currently a typed seam: `projectStateFor` signature + a throwing body + `satisfies` SSoT bindings (`_card`/`_round`/`_player`/`_state`/`_projection`). Replace the throwing body with the real pure projection. **The Story 1.3 `satisfies` bindings exist to keep the server SSoT guarantee real (AC4 of 1.3); the real `projectStateFor` body now structurally consumes the full contract, so the standalone `_state`/`_projection` scaffolding bindings MAY be removed** — but ONLY if the new body genuinely constructs every field (incl. the optionals it sets). If you remove them, confirm `npm run typecheck` still breaks on a contract mutation (re-prove the server SSoT half is intact — see 1.3 Task 7). If unsure, leave them; they are harmless type-only locals.
- `_bmad-output/implementation-artifacts/deferred-work.md` — append the standing-obligations section (Task 3).

**CREATE (new):**
- `server/src/project-state.test.ts` — the SM-6 negative-assertion test (node `rules` project).

**DO NOT TOUCH:** `server/src/push-state.ts` (its real body is Story 1.6 — leave the seam), `shared/src/types.ts` (the contract is frozen by 1.3; the projection consumes it, does not change it), the ESLint gates, `wrangler.jsonc`, `vitest.config.ts`, the `dispatch.ts`/`handlers.ts`/`persistence.ts`/`identity.ts`/`room-code.ts` seams.

**MUST PRESERVE (regression guardrails):**
- The system stays green end-to-end: both scaffold smoke tests (`scaffold.test.ts`, `scaffold.do.test.ts`) keep passing; all ESLint gates stay green; client build stays green.
- The server single-source-of-truth guarantee (1.3 AC4) survives: a contract change must still break `server` typecheck. The real `projectStateFor` body becomes the structural consumer that upholds this.
- Do NOT weaken any ESLint gate to make code compile/lint (a standing 1.2/1.3 rule).

## Testing Requirements

- **Test-file naming is convention-enforced, not code-enforced.** This test is `server/src/project-state.test.ts` — `*.test.ts` runs in the node `rules` vitest project. A `*.spec.ts` / `*.workers.ts` file runs in NO project (silent zero coverage). The SM-6 test is a PURE function test → node project, NOT the `do` (pool-workers) project. [Source: server/vitest.config.ts; deferred-work.md #8.]
- **The SM-6 negative-assertion test is this story's central test and a STANDING CI gate.** It must (a) prove a non-owner card value is absent from the `revealed=false` projection (AC3) and (b) prove constant message shape across differing hidden values (AC4). Prove it red-first: introduce a deliberate leak, watch the assertion fail, revert, watch it pass. Record both in the Debug Log.
- **No `do`-project test is needed** — there is no DO/WS behavior in this story (the projector is pure). The connection-send wiring (`pushState`) and its DO-level test arrive in Story 1.6.
- Run the full gate before marking done: `npm run typecheck && npm run lint && npm test && npm run build`.

## Previous Story Intelligence (Story 1.3)

- **`project-state.ts` already holds the typed seam you are filling.** Story 1.3 placed `projectStateFor(state: TableState, playerId: string): ProjectedTableState` here (a throwing body) PLUS exhaustive `satisfies` bindings so the contract types have a server-side structural consumer. Read the file first; preserve the exported signature; the satisfies scaffolding is now optionally redundant (see File Structure Requirements).
- **The 1.3 review explicitly DEFERRED the privacy enforcement to THIS story** and gave the precise rule: "in `players[]`, omit `hand` for ALL seats (incl. self) until `revealed`; self's card lives only in `you.hand`." Follow that verbatim. [Source: deferred-work.md — 1.3 review, `ProjectedTableState` privacy bullet.]
- **`ProjectedTableState` permits `players[].hand?`** by design (for the revealed case) — the TYPE does not enforce privacy; `projectStateFor` + this test do. Don't expect the compiler to catch a leak; the test is the enforcement. [Source: 1-3 Review Findings — Defer #2.]
- **No validation lib in the stack.** The projector trusts a well-formed `TableState`; no zod/valibot. [Source: 1-3 dev notes.]
- **`projectStateFor` throwing a raw `Error` is a known seam quirk** (deferred from 1.3): once you implement the real body, it no longer throws on the happy path. The dispatch-catch / `internal` error-code decision remains an Epic 2 concern — not this story. [Source: deferred-work.md — 1.3 review, ErrorReason bullet.]

## Git Intelligence

- `8874b9c Story 1.3: shared wire contract — full state shape up front` — authored the full `@trash/shared` contract and the `project-state.ts` typed seam you are now implementing. The `ProjectedTableState` / `TableState` / `Round` shapes are frozen here; consume them, do not change them.
- `51d737d Story 1.2 code review: harden mechanical gates` — hardened the `.send`/`.broadcast` egress ban (only `push-state.ts` exempt) and the `rules/**` purity gate. Your projection runs against these; the `.send` ban applies to `project-state.ts` (do not add a send call there).
- `32d952d Story 1.2: AC-driven project initialization` — created the workspace scaffold, the two-project vitest config, and the seam stubs.

## Spike Intelligence (Story 1.1) — projection implications

- **`round` is memory-only and null between rounds / after a D2.1 reload coercion.** `projectStateFor` must tolerate `state.round === null` (lobby, roundResult, gameOver, or post-reload): in that case there is no `you.hand`, no `players[].hand`, no `currentTurnId`/`turnToken`, and `revealed` is `false`. Use `state.round?.…` access throughout — do NOT assume a round exists. [Source: 1-1-spike-findings AC2; architecture.md D2/D2.1.]
- **Do NOT couple the projection to connection/socket state.** No `getWebSockets()`/connection-count field belongs in the projection (the spike found `getWebSockets()` returns 0 under partyserver standard mode; the GC fix is Story 1.11). The projection is a pure function of `TableState` + `playerId` only. [Source: 1-1 AC3; deferred-work.md #2.]

## Project Structure Notes

- Alignment: the directory tree in architecture.md#Project-Directory-Structure is the canonical map; this story fills `server/src/project-state.ts` and adds `server/src/project-state.test.ts`. No new directories.
- Variance to watch: architecture.md writes paths in two forms — logical `src/server/project-state.ts` and on-disk `server/src/project-state.ts`. The **on-disk workspace form is authoritative** (proven Story 1.2): use `server/src/project-state.ts`. The same caveat: `server/src/rules/` (not `server/src/server/rules/`) — but this story touches neither `rules/` nor a `server/` subdir.

### References

- [Source: epics.md#Story-1.4 lines 298–322 — user story + AC1–AC4 (value-absence, reveal-anticipation, constant shape, standing-gate, inference channels)]
- [Source: epics.md#Epic-1 lines 56, 65, 110, 152, 170, 218 — AR-4 egress chokepoint, AR-13 CI gates, decision #3+E (chokepoint anticipates reveal; standing privacy gate)]
- [Source: architecture.md lines 104–108, 290, 367–380 — privacy enforced at ONE chokepoint, single send site, projection-on-every-change, no continuous messages]
- [Source: architecture.md lines 512–557 — canonical round-trip, DO/DON'T projection example, rule-enforcement table (sole producer, .send ban, no deltas)]
- [Source: architecture.md lines 592–628 — ProjectedTableState shape + server-computed value-free fields]
- [Source: architecture.md lines 300–363 — TableState/Round shape, server-only hands/deck, D2.1 round-null coercion]
- [Source: shared/src/types.ts — frozen Card/Player/Round/TableState/ProjectedTableState contract (Story 1.3)]
- [Source: server/src/project-state.ts — the typed seam (signature + throwing body + satisfies bindings) this story implements]
- [Source: server/src/push-state.ts — the single send site (stub; Story 1.6 implements); leave untouched]
- [Source: eslint.config.js — GATE 1 .send/.broadcast ban (push-state.ts exempt); GATE 2 rules/** purity (not applicable to project-state.ts)]
- [Source: server/vitest.config.ts — node `rules` project for the pure SM-6 test; `*.test.ts` suffix]
- [Source: deferred-work.md — 1.3 review privacy clarification (omit hand for all seats incl. self until revealed; self via you.hand only); getWebSockets caveat #2; vitest suffix #8]
- [Source: 1-1-spike-findings AC2/AC3 — round memory-only / null tolerance; no connection-count coupling]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context) — bmad-dev-story workflow.

### Debug Log References

- **Red-first proof of the SM-6 test (Task 2):** temporarily changed the `players[]` hand branch in `project-state.ts` from `if (revealed && round)` to `if (round)` (leak all hands unconditionally). `npm test` → BOTH the AC3 value-absence test and the AC4 constant-shape test FAILED: the leaky projection exposed non-owner ranks (e.g. rank 11/♦) inside `players[]` entries, and the two differing-value fixtures no longer deep-equalled. Reverted to the correct `if (revealed && round)` body → `npm test` GREEN (4 tests, 3 files). This proves the test genuinely pins the privacy behavior, not a tautology.
- **SSoT preservation re-proof (MUST PRESERVE):** after removing the 1.3 `_state`/`_projection` scaffolding, renamed `ProjectedTableState.winnerIds` → `winnerIdsXX` in `shared/src/types.ts` and ran `npm run typecheck` → server typecheck FAILED at `project-state.ts:95` (the `_beats` `Pick<…>` binding). Reverted → clean. The server half of the single-source-of-truth guarantee (1.3 AC4) survives the scaffolding removal because `_beats` now structurally consumes the three optional beat fields the real body leaves unset.

### Completion Notes List

- Implemented the pure projection body of `projectStateFor(state, playerId)` — the SOLE producer of a `tableState` payload (AC1). The single privacy switch is `round?.revealed ?? false` (AC2): while `false` every seat's `hand` is omitted (incl. self — self's card lives only in `you.hand`, no `you`↔`players[]` double source of truth); the SAME function includes every seat's `hand` when `true` (Epic 3 extends, never weakens). `you.isLastPlayer` is value-free `false` for MVP (real derivation deferred to Story 2.6, comment in code). `currentTurnId`/`turnToken` are present only when a round exists; `loserIds`/`winnerIds`/`justReceivedSwap` are omitted entirely (no code sets them yet). `revealed` is always emitted (meaningful `false`). Tolerates `round === null` (lobby / D2.1 coercion) via `round?.…` throughout. Function is pure — no clock/RNG/IO, no `.send`/`.broadcast`.
- Authored the standing SM-6 negative-assertion test `server/src/project-state.test.ts` (node `rules` project). AC3: deep-walk of the JSON-serialized projection proves no non-owner rank appears anywhere, every `players[]` entry has no `hand` key, and the owner's OWN card IS present in `you.hand` (no over-redaction). AC4: two fixtures differing ONLY in hidden card values are projected, `you.hand` stripped, and deep-equalled — pinning constant message shape (no value-dependent shape/length branch). Doc-comment registers it as a STANDING CI gate (Pre-mortem E).
- ✅ AC5: recorded the two standing review obligations (b) timing-indistinguishability and (c) no behavioral tell in `deferred-work.md`, each tagged to its owning Epic 2 story (2.4 / 2.5 / 2.6). NOT coded in 1.4 (no turn/peek/swap code exists yet).
- Removed the now-redundant `_state`/`_projection` 1.3 scaffolding (the real body structurally consumes the contract); retained a minimal `_beats` `satisfies Pick<…>` binding to keep the SSoT rename-detection alive for the three optional beat fields the body does not yet set (re-proven, see Debug Log).
- Full gate green end-to-end: `npm run typecheck` PASS, `npm run lint` PASS (no `.send`/`.broadcast` token introduced), `npm test` PASS (4 tests / 3 files — 2 scaffold smoke + 2 new SM-6), `npm run build` PASS. No ESLint gate weakened; both scaffold smoke tests still pass.

### File List

- `server/src/project-state.ts` — MODIFIED (replaced throwing stub body with the real pure projection; removed `_state`/`_projection` scaffolding; added minimal `_beats`/`_card` SSoT bindings).
- `server/src/project-state.test.ts` — CREATED (standing SM-6 negative-assertion test: AC3 value-absence + AC4 constant-shape).
- `_bmad-output/implementation-artifacts/deferred-work.md` — MODIFIED (appended "Standing obligations from: Story 1.4 (SM-6 inference channels)").

## Change Log

- 2026-06-19 — Story 1.4 context created (create-story): privacy chokepoint implementation + standing SM-6 negative-assertion test scoped from epics/architecture/contract + 1.3 deferred privacy clarification. Status → ready-for-dev.
- 2026-06-19 — Story 1.4 implemented (dev-story): pure `projectStateFor` body (single `revealed` privacy switch, others' hands omitted pre-reveal, self via `you.hand` only), standing SM-6 negative-assertion test (AC3 value-absence + AC4 constant-shape, proven red-first), standing obligations (b)/(c) recorded. SSoT guarantee re-proven after scaffolding trim. Full gate green (typecheck/lint/test/build). Status → review.
