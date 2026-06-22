---
baseline_commit: e0a93c12b5162076cf989bae0edbda6b6e7d0c57
---

# Story 3.1: Showdown resolution engine (pure, parameterized 2..20)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the builder,
I want a pure function that computes the canonical Showdown outcome for any table size,
so that loser-finding, ties, deduction, elimination, and the win-check are correct and tested across 2..20 once — so Epic 5 never reopens it.

## Acceptance Criteria

1. **AC-3.1.1 — Canonical resolution order.** A new pure function in `server/src/rules/engine.ts` computes the Showdown outcome over a set of revealed hands following the canonical D6 order: (1) reveal (caller's precondition — `round.revealed` is already true), (2) compute Loser(s) = ALL Players holding the lowest VALUE by rank (Ace=1 lowest; suit IGNORED; duplicate values are exact ties — all such Players lose), (3) deduct one Life from each Loser, (4) mark `isAlive=false` for any Player at 0 Lives, (5) win-check, (6) — only if ≥2 alive AND a Re-deal will occur — compute the next Starting Player. *(FR-10, FR-11, AR-10; architecture.md#D6 421–435.)*

2. **AC-3.1.2 — Win-check (step 5).** Exactly 1 alive → that Player wins (game over); 0 alive (all tied to zero in one Showdown) → shared win (game over); ≥2 alive → continue. The tiebreak (step 6) NEVER runs when the game ended at step 5. *(FR-12; architecture.md#D6 427–428.)*

3. **AC-3.1.3 — Multi-Loser tiebreak (step 6).** When a Re-deal will occur, the next Starting Player is the tied Loser seated EARLIEST in turn order from the previous Starting Player's seat (scan right via `nextAliveSeat`; the previous Starting Player is eligible if themselves a tied Loser); if that Loser was eliminated this Showdown, the next surviving seat to their right starts. *(FR-12, AR-10; architecture.md#D6 431–435.)*

4. **AC-3.1.4 — Parameterized tests 2..20.** The pure resolution tests are PARAMETERIZED across player counts 2..20 and cover: single lowest, two-way tie, all-tied (every Player same value), zero-survivors shared win, single-survivor win, and tiebreak-with-eliminated-loser — all in node env, no I/O. *(Decision #7.)*

5. **AC-3.1.5 — No forward-bind to 3.4.** The tiebreak-with-eliminated-loser fixtures HAND-CONSTRUCT the eliminated state directly (seed `isAlive=false` seats in the input), NOT via the Epic-3 elimination flow — so this pure test never forward-binds to Story 3.4. *(Decision #7; Amelia review — so Epic 5 adds only deck-size mapping, not a re-test of this function.)*

6. **AC-3.1.6 — All-eliminated-tied-losers permutation.** The cases include the permutation where MULTIPLE tied Losers are ALL eliminated this Showdown while ≥2 other Players survive — the starting-seat scan (`nextAliveSeat` from the previous Starting Player's seat) must skip past ALL eliminated tied Losers to the next surviving seat. *(Edge-case sweep E3.)*

7. **AC-3.1.7 — Action-4 pre-flight: assert-in-primitive (engine hardening for 3.4 reuse).** The forward-deferred engine-primitive precondition gaps come due at Story 3.4's `dealAgain` (the first caller that can pass a possibly-eliminated previous host). Per the resolved Action-4 decision (assert-in-primitive), this story hardens the SHARED primitives so 3.4 consumes a primitive that cannot silently lie:
   - **`dealRound` asserts deck coverage:** throw if `deck.length < aliveCount` (closes `engine.ts:115` — `hands[p.id] = deck[next]` writing `undefined` into `Record<string,Card>`). *(deferred-work.md:46.)*
   - **`dealRound` asserts a valid alive starter:** throw if `startingPlayerId` is not an alive, seated player in the supplied roster (closes `engine.ts:118-120` — `currentTurnId = startingPlayerId` pointing at a dead/cardless seat). *(deferred-work.md:47.)*
   - **`nextAliveSeat` asserts a known seat:** an unknown `fromSeatIndex` (no matching seat) ASSERTS rather than silently returning an arbitrary alive seat (closes `engine.ts:77,87`). The lone-alive-seat-returns-itself and the documented ≤1-alive terminal-case fallback behavior are PRESERVED for the resolution path. *(deferred-work.md:45.)*
   - These asserts MUST NOT regress the existing 2.3/2.4/2.6 callers (all of which pass valid inputs today). The `dealAgain`-specific caller logic (deriving the alive starter via this story's tiebreak, the `revealAll` handler, the re-deal UI) remains owned by Story 3.4 — this story hardens the primitive only.

8. **AC-3.1.8 — Purity & no contract change.** The new function and the hardening live entirely in `server/src/rules/engine.ts` under the GATE-2 purity denylist (no transport/storage/crypto/`Date`/`Math.random`). NO `shared/src/types.ts` change, NO client change, NO handler/dispatch change, NO `validate.ts` change. The function is a pure input→output mapping; the caller (Story 3.4 handler) owns mutation/persistence/projection. *(GATE 2; architecture.md#D5 502; Decision #7.)*

## Tasks / Subtasks

- [x] **Task 1 — Author the pure `resolveShowdown` function** (AC: 1, 2, 3, 8)
  - [x] Add `resolveShowdown` to `server/src/rules/engine.ts`. PURE input→output: `(players: Player[], hands: Record<string,Card>, previousStartingPlayerId: string) => ShowdownResult`. Output `{ loserIds, players (NEW array), outcome }` where `outcome` is a discriminated union `{kind:"winner"; winnerIds} | {kind:"continue"; nextStartingPlayerId}` — the union makes a terminal game carry NO next-starter (AC-3.1.2 enforced by the type). Inputs never mutated.
  - [x] Step 2 — Loser(s) = all players holding a hand at the lowest `hands[id].rank`. `rank` compared ONLY, suit never read (pinned by the suit-IGNORED test). Duplicate ranks all lose.
  - [x] Step 3 — deduct one Life from each Loser into a new array (`{...p, lives: lives-1}`).
  - [x] Step 4 — `isAlive = lives > 0` for each loser.
  - [x] Step 5 — win-check: `aliveAfter <= 1` → `winner` (1 alive → that id; 0 alive → all who just dropped to 0 = co-winners, none dropped); else `continue`. Tiebreak not computed on terminal.
  - [x] Step 6 — REUSED `nextAliveSeat` for the eliminated-loser skip; scan right (inclusive of prev starter) over `bySeat` for the earliest tied loser; surviving → they start, eliminated → `nextAliveSeat(next, theirSeat)`.
- [x] **Task 2 — Action-4 primitive hardening** (AC: 7, 8)
  - [x] `dealRound`: asserts `deck.length >= alive.length` (plain `Error`) — closes `engine.ts:115`.
  - [x] `dealRound`: asserts `startingPlayerId` is in the alive set (plain `Error`) — closes `engine.ts:118-120`. 2.3 first-deal host still passes (regression-tested).
  - [x] `nextAliveSeat`: asserts `startPos !== -1` (unknown seat throws) — closes `engine.ts:77,87`. Lone-alive-returns-self and all ≥2-alive callers preserved (existing test at :141 + new regression guard stay green).
- [x] **Task 3 — Parameterized 2..20 tests** (AC: 4, 5, 6) — RED FIRST ✅ (confirmed 17 failing before impl)
  - [x] Added to `server/src/rules/engine.test.ts` (flat `test(...)`, node-env). No `*.do.test.ts` (pure).
  - [x] Parameterized 2..20: single-lowest, all-tied (-1 each), all-tied-to-zero shared win. Plus fixed-size cases: single lowest, suit-ignored, two-way tie, all-tied continue, single-survivor win, zero-survivor shared win, tiebreak (earliest from prev starter), prev-starter-eligible, tiebreak-with-eliminated-loser, E3 all-eliminated-tied-losers.
  - [x] AC-3.1.5: eliminated fixtures SEED `isAlive`/`lives` directly via `seatL(...)` — no 3.4 flow.
  - [x] AC-3.1.6: E3 test (B,C tied losers both eliminated, ≥2 survive) asserts the scan skips BOTH to D.
  - [x] Hardening regression tests added (dealRound bounds + alive-starter; nextAliveSeat unknown-seat throws + lone-alive preserved).
- [x] **Task 4 — Gates green** (AC: 8)
  - [x] server `npm test` 158 passed (141 prior + 17 new); client 82 passed; lint (GATE-2) clean; typecheck 0 errors; build OK. SM-6 standing test (`project-state.test.ts`) 10/10 UNCHANGED. Only `engine.ts` + `engine.test.ts` changed.

### Review Findings

_Code review 2026-06-22 (Blind Hunter + Edge Case Hunter + Acceptance Auditor). 2 patches APPLIED, 1 dismissed. (1 decision-needed resolved → patch: add asserts now.) Server 164 / lint / typecheck green._

- [x] [Review][Patch] `resolveShowdown` must assert its own preconditions (unknown `previousStartingPlayerId` + empty `hands`) [engine.ts:310-311,336-344] — APPLIED. Two latent gaps in the pure resolver. (a) An unknown `previousStartingPlayerId` (not seated in `players` — exactly the eliminated-previous-host case 3.4's `dealAgain` introduces) made `seatOf` return `undefined` → `startPos = -1` → on the `continue` branch the loop read `bySeat[(-1+0)%m] = bySeat[-1] = undefined` → `TypeError` (verified via node). (b) Empty `contenders` (no player holds a hand) → `Math.min(...[]) = Infinity` → empty `loserSet`, no-op resolution. FIX: `resolveShowdown` now throws a named plain `Error` (purity boundary) when `previousStartingPlayerId` is not seated in `players` and when `contenders.length === 0`, mirroring the `nextAliveSeat`/`dealRound` Action-4 asserts. +2 regression tests (`not a seated player`, `no revealed hands`).

- [x] [Review][Patch] AC-3.1.4: three of six enumerated cases + the AC-3.1.6 permutation were fixed-size only, not parameterized across 2..20 [engine.test.ts] — APPLIED. Added parameterized sweeps: two-way tie (2..20), single-survivor win (2..20), tiebreak-with-eliminated-loser (3..20), and the AC-3.1.6 all-eliminated-tied-losers permutation (4..20, smallest n that leaves ≥2 survivors after 2 eliminations). All six AC-3.1.4 cases + the AC-3.1.6 permutation now run across table sizes.

## Dev Notes

### What this story IS and is NOT

- **IS:** one new pure function (`resolveShowdown`, name your call but match the `applySwap`/`dealRound` export convention) in `server/src/rules/engine.ts` + parameterized 2..20 tests + the Action-4 primitive hardening (asserts on `dealRound`/`nextAliveSeat`).
- **IS NOT:** any handler, dispatch route, phase transition, projection, client surface, or `types.ts` change. Those are Story 3.2 (`revealAll` trigger + reveal-true projection) and Story 3.4 (`dealAgain` re-deal, lives UI, deriving the alive starter from THIS function's tiebreak). Do not implement `revealAll`, `dealAgain`, `loserIds`/`winnerIds` projection, or any surface here.

### Canonical resolution order — the single source of truth

architecture.md#D6 (lines 421–435) and epics.md#Story 3.1 are identical and authoritative:
1. Reveal (precondition — `round.revealed=true` already set by 3.2's `revealAll`; this function does not flip it).
2. Loser(s) = all at lowest `rank`; suit ignored; duplicate ranks all lose (FR-10).
3. Deduct one Life per Loser (every tied Loser).
4. Mark `isAlive=false` at 0 Lives.
5. Win-check: 1 alive → winner; 0 alive → shared win (GAME_OVER, FR-12); ≥2 alive → continue.
6. ONLY if ≥2 alive and re-dealing → next Starting Player via the tiebreak. NEVER runs on a terminal verdict.

**Tiebreak (step 6):** next Starting Player = the tied Loser seated earliest in turn order scanning RIGHT from the previous Starting Player's seat (prev Starting Player eligible if themselves a tied Loser); if eliminated this Showdown, the next surviving seat to their right. `[architecture.md#D6 431–435]`

### REUSE — do not reinvent (the engine's existing primitives)

Read `server/src/rules/engine.ts` in full before writing. The relevant existing exports:
- **`nextAliveSeat(players, fromSeatIndex)`** `engine.ts:74` — THE single seat-rotation primitive. The step-6 tiebreak is "pure `nextAliveSeat` math from D1" (architecture.md#502). Use it; do not write a second seat walker.
- **`dealRound`** `engine.ts:104`, **`applySwap/applyKeep/applyDraw`** — your hardening touches `dealRound` and `nextAliveSeat`; mirror their PURE, value-free, well-JSDoc'd style.
- **`SUITS` comment `engine.ts:7`** — "`suit` is NEVER compared (rank is the value)." Your loser-finding compares `rank` only.
- **Ace lowest:** `RANKS` `engine.ts:10` is `[1..13]`, Ace=1 lowest, King=13 highest. Lowest VALUE = lowest `rank`.

### Type shapes (no change — read-only context)

`shared/src/types.ts`:
- `Card = { rank: number; suit }` (`rank` 1..13; line 19).
- `Player = { id; name; lives: number; isAlive: boolean; isConnected; seatIndex }` (line 52). `isAlive` = has Lives (game logic — architecture.md#321); turn/seat walks use `isAlive`, NEVER `isConnected`.
- `Round = { startingPlayerId; currentTurnId; turnToken; hands: Record<string,Card>; deck; acted; revealed; lastSwapReceiverId? }` (line 66). MEMORY-ONLY.
- `ProjectedTableState.loserIds?` / `.winnerIds?` (lines 140–141) ALREADY EXIST in the contract (value-free, projected by 3.2/3.4 — NOT this story). So `resolveShowdown` producing `loserIds`/`winnerIds` data needs NO `types.ts` change; the projection wiring is downstream.

### Purity boundary (GATE 2 — non-negotiable)

`engine.ts:1-3`: PURE rule engine, imports ONLY `@trash/shared`; no transport/storage/crypto/`Date`/`Math.random` — enforced by the ESLint GATE-2 denylist on `server/src/rules/**`. `resolveShowdown` and the hardening must stay inside this boundary. The function returns NEW data; it must not mutate the input `Player[]`/`hands` (the caller owns state mutation + persistence + projection — architecture.md#D5 502, "the tiebreak/turn-order live in the pure engine").

### Action-4 pre-flight — RESOLVED (read this before Task 2)

The assert-vs-trust question (epic-2-retro-2026-06-22.md:74; sprint-status.yaml top comment block) was resolved BEFORE this story: **assert-in-primitive**. The three gaps are documented at deferred-work.md:45-47. Rationale for landing the hardening HERE (3.1) rather than 3.4: this is the engine story, so 3.4 consumes an already-hardened primitive and the re-deal story stays focused on the handler/UI. The `dealAgain`-side alive-starter DERIVATION (using this story's step-6 tiebreak) + the `revealAll`/projection work remain 3.4/3.2. Throw a plain `Error` in the pure engine (IntentError belongs to `validate.ts`/handlers).

### Testing standards

- Node-env `server/src/rules/engine.test.ts` (`*.test.ts`), `import { expect, test } from "vitest"` — the file's established convention (no `describe`; flat `test(...)`/`test.each`). Pure, no I/O, no Workers pool. RED-first (Task 3 before Task 1 passes) per the TDD discipline.
- Mirror existing parameterization (the `buildDeck { decks: 2 }` test at `engine.test.ts:52`, the `nextAliveSeat` skip/wrap tests at 122–155). The existing lone-alive-seat test (`engine.test.ts:141`) is a REGRESSION GUARD for the `nextAliveSeat` hardening — it must stay green.
- Server test count baseline ≈ 140 (per sprint-status 2.6 note); your additions are net-new pure tests.

### Project Structure Notes

- Single touched source file: `server/src/rules/engine.ts` (UPDATE). Single touched test file: `server/src/rules/engine.test.ts` (UPDATE). No new files, no client/shared changes — aligns with the architecture engine location (architecture.md#689 `rules/engine.ts` — "showdown resolution order, lives/eliminate/win-check, tiebreak").
- No variance from project structure.

### References

- [Source: epics.md#Story 3.1 (lines 669–693)] — the four ACs, the parameterized 2..20 + Decision #7 no-forward-bind clause, the all-eliminated-tied-losers edge (E3).
- [Source: architecture.md#D6 (lines 419–435)] — canonical resolution order + tiebreak (the single source of truth).
- [Source: architecture.md#D5 (line 502)] — "tiebreak/turn-order are pure `nextAliveSeat` math from D1 — they live in the pure engine."
- [Source: architecture.md#689, #761-762] — engine.ts owns showdown resolution/loser/lives/tiebreak.
- [Source: server/src/rules/engine.ts:7,10,74,104] — `suit` never compared; Ace=1 lowest; `nextAliveSeat` reuse; `dealRound` to harden.
- [Source: shared/src/types.ts:19,52,66,140-141] — `Card`/`Player`/`Round` shapes; `loserIds`/`winnerIds` pre-named in the contract.
- [Source: deferred-work.md:45-47] — the three Action-4 engine-primitive gaps (nextAliveSeat unknown-seat, dealRound bounds, dealRound alive-starter).
- [Source: epic-2-retro-2026-06-22.md:74; sprint-status.yaml top comment] — Action-4 RESOLVED: assert-in-primitive.
- [Source: deferred-work.md:135] — Winner stub drops co-winners; the resolution must produce ALL co-winners for the 0-alive shared-win case.

## Dev Agent Record

### Agent Model Used

Opus 4.8 (1M context) — claude-opus-4-8[1m]

### Debug Log References

- RED confirmed: `npm run test --workspace=server` → 17 failed / 141 passed before implementation (resolveShowdown missing + asserts not yet present).
- GREEN: same command → 158 passed (141 prior + 17 new). lint clean, typecheck 0 errors, build OK, client 82 passed.

### Completion Notes List

- **`resolveShowdown` (pure)** added to `server/src/rules/engine.ts` with an exported `ShowdownResult` type. Signature `(players, hands, previousStartingPlayerId) => ShowdownResult`. Returns a NEW `players` array — inputs never mutated (pinned by a no-mutation test); the caller (Story 3.4 handler) owns state mutation/persistence/projection.
- **Discriminated-union outcome** (`{kind:"winner";winnerIds} | {kind:"continue";nextStartingPlayerId}`) makes AC-3.1.2 a TYPE invariant: a terminal game cannot carry a next-starter, and the tiebreak is only computed in the `continue` branch (never on a terminal verdict).
- **Co-winner correctness (FR-12 / deferred-work.md:135):** the 0-alive shared-win case names EVERY player who dropped to zero — the Winner-stub "drops co-winners" trap is structurally avoided here at the source.
- **Tiebreak REUSES `nextAliveSeat`** (no second seat-walker) for the eliminated-loser skip; the earliest-tied-loser scan walks `bySeat` right from the previous starter's seat (inclusive). E3 (multiple tied losers all eliminated, ≥2 survive) verified to skip ALL eliminated losers to the next surviving seat.
- **Action-4 hardening (assert-in-primitive)** folded into this engine story: `dealRound` asserts deck coverage + an alive/seated `startingPlayerId`; `nextAliveSeat` asserts a known `fromSeatIndex`. All throw plain `Error` (purity boundary — `IntentError` stays in `validate.ts`/handlers). The 2.3/2.4/2.6 callers pass valid inputs, so no regression (full suite + the lone-alive-seat guard at `engine.test.ts:141` stay green). Story 3.4 still owns deriving the alive starter via this function's step-6 tiebreak before calling `dealRound` (defense in depth).
- **Scope held:** PURE/GATE-2; NO `shared/src/types.ts`, client, handler, dispatch, or `validate.ts` change. `loserIds`/`winnerIds` were already pre-named in the contract (types.ts:140-141), so the projection wiring (3.2/3.4) needs no type change.
- **Branch:** `story/3-1-showdown-resolution-engine` (off `e0a93c1`).

### File List

- `server/src/rules/engine.ts` (modified) — added `ShowdownResult` type + `resolveShowdown`; hardened `dealRound` (deck-coverage + alive-starter asserts) and `nextAliveSeat` (unknown-seat assert).
- `server/src/rules/engine.test.ts` (modified) — added the Story 3.1 resolveShowdown suite (incl. parameterized 2..20) + Action-4 hardening regression tests; added `resolveShowdown` to the import.

## Change Log

- 2026-06-22 — Story 3.1 implemented (review): pure `resolveShowdown` (canonical D6 order) + parameterized 2..20 tests + Action-4 engine-primitive hardening (AC-3.1.7). Server 158 / client 82 green; lint/typecheck/build clean; SM-6 standing test unchanged.
