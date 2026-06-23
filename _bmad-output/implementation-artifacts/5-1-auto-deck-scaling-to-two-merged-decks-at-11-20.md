---
baseline_commit: 78f93fc066e23fb7df870312957f34a034b8b058
---

# Story 5.1: Auto Deck scaling — two merged decks at 11–20 players

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Host running a big table,
I want the app to silently use two merged decks once 11+ Players are seated,
so that every Player still gets a real card at a 20-Player table — and I never have to think about decks.

## Context & Why This Story Matters

This is the **only build story of Epic 5 ("Scale to the whole table")** and the **last functional story of the MVP** — it hardens FR-10/FR-11 at scale and delivers FR-13. Two prior planning bets (verified against the live code during the Epic-4 retro) make this story **small**:

1. **Resolution is parameterized 2..20 from day one (binding Decision #7).** `resolveShowdown` has four `for (n = 2; n <= 20; n++)` tests (`server/src/rules/engine.test.ts:598-639`) and `assertDealable` accepts any size 2..20. **This story does NOT reopen the core resolution function** — duplicate values (and the more frequent ties they cause) are already an accepted, tested property.
2. **The Deck is parameterized from Epic 2 (binding Decision #8).** `buildDeck(composition: DeckComposition)` already takes `{ decks: number }` as input (`engine.ts:32/47`); its own doc comment says *"2 for the 11–20-player merged-deck case (Epic 5 / Story 5.1 chooses the count — not this story)."* `assertDealable` already validates `decks * 52 >= playerCount`.

So the **entire functional gap** is one hardcoded constant. Today both deal sites use a fixed single deck:

```ts
// server/src/handlers.ts:26-29
const DEAL_COMPOSITION = { decks: 1 } as const;
// …used at handlers.ts:542 (handleDeal) and handlers.ts:704 (handleDealAgain)
```

This story replaces that constant with a **pure player-count → deck-count mapping**: `≤10 → { decks: 1 }`, `11–20 → { decks: 2 }`, keyed on the already-existing `SINGLE_DECK_MAX_PLAYERS = 10` constant (`shared/src/config.ts:6`, which already cites FR-13). The deck choice becomes a **data/config decision computed at deal time**, not surgery on the deal logic — exactly as the architecture intended.

**NO `shared/src/types.ts` wire-contract change** (`DeckComposition` is engine-internal — never sent over the wire; `decks` count is not projected), NO new `ErrorReason`, NO router change, NO client change. This is a **server-only, rules-layer** story.

## Acceptance Criteria

1. **AC-5.1.1 — A new pure mapping computes the deck count from the alive Player count.** A pure function (e.g. `compositionFor(playerCount: number): DeckComposition`, living in `server/src/rules/engine.ts` so it stays inside the GATE-2 purity boundary) returns `{ decks: 1 }` for `playerCount <= SINGLE_DECK_MAX_PLAYERS` (10) and `{ decks: 2 }` for `playerCount` in 11..MAX_PLAYERS (20). It reads the threshold from the existing `SINGLE_DECK_MAX_PLAYERS` constant — it does NOT hardcode a literal `10`. PURE: no clock/RNG/IO/`this` (GATE-2 safe). *[Source: epics.md FR-13:33,106; AR-9:61,113; shared/src/config.ts:6; engine.ts DeckComposition:26-32.]*

2. **AC-5.1.2 — Both deal sites use the mapping instead of the fixed single deck.** `handleDeal` (`handlers.ts:542`) and `handleDealAgain` (`handlers.ts:704`) build the round with `compositionFor(aliveCount)` rather than the hardcoded `DEAL_COMPOSITION = { decks: 1 }`. The `aliveCount` already computed for the `assertDealable` / `MIN_PLAYERS` check is the input (alive seats only — eliminated seats get no card, FR-11). The now-unused `DEAL_COMPOSITION` constant is removed (or repurposed) so there is no dead single-deck literal left behind. *[Source: handlers.ts:529-542,704; engine.ts dealRound:125-131.]*

3. **AC-5.1.3 — `assertDealable` still guards the computed composition at both sites.** The existing `assertDealable(aliveCount, composition)` call (`handlers.ts:536`) is passed the SAME computed composition that `dealRound` receives (not the old constant), so the deck-covers-the-table invariant (`decks * 52 >= playerCount`, validate.ts:92) holds for the 2-deck case too. By construction `2 * 52 = 104 >= 20`, but the guard must validate what is actually dealt. (If `handleDealAgain` does not currently call `assertDealable`, document why it is safe there — the roster only shrinks between rounds — or add the call for symmetry.) *[Source: validate.ts:88-94; handlers.ts:536.]*

4. **AC-5.1.4 — At 11–20 Players every alive seat gets exactly one card and the leftover deck still supports the Last-Player draw.** With 2 decks (104 cards), a 20-Player deal deals 20 cards and leaves 84 in `round.deck` for the Story-2.6 `drawFromDeck` Last-Player option (which `shift()`s the top of `round.deck`). `dealRound`'s self-assert (`deck.length < alive.length → throw`, engine.ts:138) is satisfied. No behavior of the deal/turn/draw loop changes other than the deck size. *[Source: engine.ts dealRound:114,138; engine.ts applyDraw:194-213.]*

5. **AC-5.1.5 — The 10↔11 boundary is correct (the one integration test the epic calls for).** A deal at exactly **10** Players uses 1 deck (52 cards); a deal at exactly **11** Players uses 2 decks (104 cards). This boundary is covered by a server DO/integration test that drives a real deal at each side of the threshold and asserts the dealt outcome (every seat carded; the round is dealable) — not merely a unit test of the mapping. *[Source: epics.md Decision #7:156 ("one boundary integration test"); existing `table-server-deal.do.test.ts` harness.]*

6. **AC-5.1.6 — Loser computation stays correct and unambiguous at a full 20-Player table with duplicate values.** With 2 merged decks, duplicate `{rank,suit}` cards exist, so duplicate VALUES and more frequent ties are expected and **accepted** (FR-10/FR-13). The existing parameterized `resolveShowdown` 2..20 tests already cover all-tied / two-way-tie / single-lowest at n=20; this story confirms (does not rewrite) that the resolution function is unchanged and those tests still pass. **No new resolution logic.** *[Source: engine.test.ts:598-639; epics.md FR-13:33 "duplicate values … are accepted", #7:156.]*

7. **AC-5.1.7 — Server-only, NO contract/client change; gates green.** NO `shared/src/types.ts` change (`DeckComposition` stays engine-internal — not projected, not over the wire), NO new `ErrorReason`, NO `route-from-state.ts`/Surface change, NO client change. GATE-1 (no `socket.send` from a surface — N/A, no client change) and GATE-2 (rules purity — the mapping lives in `rules/` and reuses `buildDeck`, does NOT reimplement deck building) hold. Lint + typecheck (`tsc -b` 0 / `svelte-check` 0) + build (PWA) all green; new + existing server and client tests pass. *[Source: architecture.md GATE-1/GATE-2; AC-2.1.1 buildDeck reuse.]*

## Tasks / Subtasks

- [x] **Task 1 — Pure deck-count mapping (AC: 5.1.1)**
  - [x] Add `export function compositionFor(playerCount: number): DeckComposition` to `server/src/rules/engine.ts` (next to `buildDeck`/`DeckComposition`). Return `{ decks: playerCount <= SINGLE_DECK_MAX_PLAYERS ? 1 : 2 }`. Import `SINGLE_DECK_MAX_PLAYERS` from `@trash/shared` — do NOT hardcode `10`.
  - [x] JSDoc it as PURE (GATE-2): same input → same output, no IO/clock/RNG/`this`. Note that the count is engine-internal (Decision #8) and that resolution at scale is already covered (Decision #7) — so this function is the whole of FR-13's logic.
  - [x] RED-first: write the unit test before the function (see Task 4) and watch it fail to resolve / fail the assertion. (Confirmed: 4 RED `compositionFor is not a function` → GREEN.)
- [x] **Task 2 — Wire both deal sites to the mapping (AC: 5.1.2, 5.1.3)**
  - [x] `handleDeal` (`handlers.ts`): replace `DEAL_COMPOSITION` in the `assertDealable(...)` call AND the `dealRound(...)` call with `compositionFor(aliveCount)` (computed once into `const composition`, passed to both).
  - [x] `handleDealAgain` (`handlers.ts`): compute the surviving alive count and pass `compositionFor(aliveCount)` to `dealRound`. Confirmed it did NOT call `assertDealable` before — added it for symmetry.
  - [x] Remove the now-dead `DEAL_COMPOSITION = { decks: 1 }` constant (handlers.ts:26-29) and the stale "single-deck fits ≤20" comment.
  - [x] Add the `compositionFor` import to `handlers.ts`.
- [x] **Task 3 — Confirm the leftover-deck + resolution invariants hold at scale (AC: 5.1.4, 5.1.6)**
  - [x] Verified `dealRound` deals to `isAlive` seats only and leaves `round.deck = deck.slice(next)` for the draw; 2-deck (104) covers 20 with 84 leftover (boundary test asserts it live).
  - [x] Verified the parameterized `resolveShowdown` 2..20 tests (`engine.test.ts:598-639`) are untouched and still green — resolution NOT modified.
- [x] **Task 4 — Tests: mapping unit + 10↔11 boundary integration (AC: 5.1.1, 5.1.4, 5.1.5)**
  - [x] **Unit** (`engine.test.ts`): `compositionFor` → `{decks:1}` for 2,5,9,10 and `{decks:2}` for 11,15,20; the seam pinned to `SINGLE_DECK_MAX_PLAYERS` exactly (10→1, 11→2); purity.
  - [x] **Boundary integration** (new `table-server-deck-scaling.do.test.ts`): real deal at **10** (1 deck — 10 dealt, 42 leftover) and at **11** (2 decks — 11 dealt, 93 leftover), inspecting the LIVE round. This is the one integration test Decision #7 calls for.
  - [x] 20-Player deal smoke: deal succeeds, 20 seats carded, 84 leftover (no `dealRound` coverage throw).
- [x] **Task 5 — Gates (AC: 5.1.7)**
  - [x] `npm run lint` (GATE-2 purity — `compositionFor` in `rules/`, reuses `buildDeck`) clean; `npm run typecheck` (`tsc -b` 0 + `svelte-check` 0); `npm run build` (PWA) OK. `npm run test` both workspaces.
  - [x] Confirmed NO `shared/src/types.ts` change and NO new `ErrorReason`; the `shared/` + `client/` diff is empty (server-only).
  - [x] One reveal `.do.test.ts` flaked on the cold full-suite run (known `@cloudflare/vitest-pool-workers` pattern — touches `revealAll`, untouched here); passed in isolation and on the warm full-suite re-run (217/217).

### Review Findings

_Code review 2026-06-23 (adversarial: Blind Hunter + Edge Case Hunter + Acceptance Auditor). All 7 ACs verified satisfied. 1 patch, 1 defer, 3 dismissed as noise/by-design._

- [x] [Review][Patch] Orphaned JSDoc — `buildDeck`'s doc comment now precedes `compositionFor` [server/src/rules/engine.ts:42-60] — FIXED 2026-06-23: moved `buildDeck`'s doc block back below `compositionFor`, directly above its declaration. Typecheck green. The new `compositionFor` JSDoc (lines 47-57) was inserted between `buildDeck`'s existing doc comment (lines 42-45, "Build a deck from the SUPPLIED composition (AC-2.1.1)…") and the `buildDeck` declaration. Result: `compositionFor` carries two stacked comment blocks (the upper one describes `buildDeck`) and `buildDeck` lost its own doc. Introduced by this diff. Fix: move the `buildDeck` doc block back down to sit directly above `export function buildDeck`.
- [x] [Review][Patch] `handleDealAgain` has no `MIN_PLAYERS` floor — a 1-player re-deal is reachable [server/src/handlers.ts:704-711] — FIXED 2026-06-23 (Dennis opted to fold the pre-existing fix in at MVP close). Added `if (aliveCount < MIN_PLAYERS) throw new IntentError("phase-illegal")` to `handleDealAgain` right after computing `aliveCount`, completing the symmetry with `handleDeal`. RED-first confirmed: the new regression test `dealAgain floor: …` in `table-server-host-controls.do.test.ts` TIMED OUT without the guard (the 1-player Re-deal proceeded silently, no `error` event) and PASSES with it. server 217→218, lint/typecheck green. Original diagnosis below. `handleHostRemovePlayer` (Story 4.2) is accepted at any phase incl. `roundResult` with no floor check, deferring to "the next Deal/Re-deal handles it (handleDeal enforces ≥ MIN_PLAYERS)" (handlers.ts:343-344). But `handleDealAgain` enforces no `MIN_PLAYERS` — only the `roundResult` phase gate, whose stated ≥2-alive invariant (handlers.ts:657) is broken precisely by mid-session removal. Reachable: 2 alive at `roundResult` → host removes 1 → 1 alive (still `roundResult`) → Re-deal → a 1-player round starts silently (`assertDealable(1,{decks:1})` passes; `dealRound` deals the single alive seat; the re-seated starter survives so no throw). NOT caused by Story 5.1 — the dealAgain path never floored; 5.1's added `assertDealable` is "for symmetry" but validates deck-cover, not the floor (so the symmetry with `handleDeal` is actually incomplete — `handleDeal` also has the `MIN_PLAYERS` gate this path still lacks). Suggested follow-up: add `if (aliveCount < MIN_PLAYERS) throw new IntentError("phase-illegal")` to `handleDealAgain` after computing `aliveCount`.

## Dev Notes

### This is a server-only, rules-layer story — NO contract change
- **The wire contract does NOT change.** `DeckComposition` (`engine.ts:26-32`) is explicitly engine-internal — "not sent over the wire, so it stays out of @trash/shared." The deck count is never projected to clients (`project-state.ts` does not carry it) and no Intent references it. So there is **no `shared/src/types.ts` edit, no new `ErrorReason`, no `route-from-state.ts`/Surface change, and no client change at all.** [Source: engine.ts:28-30.]
- **The whole change is: one hardcoded constant → one pure mapping, called at two sites.** Do not over-build. There is no new state, no new phase, no new handler, no new intent.

### Files to touch (all server)
- **`server/src/rules/engine.ts`** — ADD `compositionFor(playerCount)` beside `buildDeck`/`DeckComposition`. Reuse `buildDeck` via `dealRound` (do NOT reimplement deck construction — GATE-2 + AC-2.1.1 reuse). PURE.
- **`server/src/handlers.ts`** — UPDATE `handleDeal` (~line 529-542) and `handleDealAgain` (~line 700-704): compute `const composition = compositionFor(aliveCount)` and pass it to BOTH `assertDealable` and `dealRound`. REMOVE the `DEAL_COMPOSITION = { decks: 1 }` constant (lines 26-29). Add the `compositionFor` import.
- **`server/src/rules/engine.test.ts`** (or sibling) — `compositionFor` unit tests.
- **`server/src/table-server-deal.do.test.ts`** (or new `table-server-deck-scaling.do.test.ts`) — the 10↔11 boundary integration test.

### Current state of the files being modified (read before editing)
- **`handlers.ts:26-29`** — `const DEAL_COMPOSITION = { decks: 1 } as const;` with a comment claiming "≤20 players all fit one 52-card deck" (true for *covering* a deal, but NOT what FR-13 wants — FR-13 wants two decks at 11+ for variance, not capacity; AR-9:61 "a variance choice, not capacity"). This comment becomes stale and must be replaced.
- **`handleDeal` (handlers.ts:529-544)** — already computes `aliveCount = table.players.filter(p => p.isAlive).length`, enforces `>= MIN_PLAYERS`, calls `assertDealable(aliveCount, DEAL_COMPOSITION)`, then `dealRound(table.players, DEAL_COMPOSITION, cryptoRng(), startingPlayerId)`. The minimal change: derive `composition` from `aliveCount` and substitute it in both calls. Preserve everything else (phase gate, token bump, persist).
- **`handleDealAgain` (handlers.ts:703-704)** — re-deals at `roundResult` to surviving seats; today: `dealRound(table.players, DEAL_COMPOSITION, cryptoRng(), startingPlayerId)`. **Confirmed: it does NOT currently call `assertDealable`** — it relies on `dealRound`'s own coverage self-assert (engine.ts:138). Compute the surviving alive count and pass `compositionFor(aliveCount)`. Adding an `assertDealable(aliveCount, composition)` call here for symmetry is cheap and honest (the shrinking roster keeps a once-dealable table dealable, but the explicit guard matches `handleDeal`).
  - **Expected & correct: the deck count can DROP between rounds.** A re-deal recomputes from the *current* alive count — e.g. 11 alive (2 decks) → one eliminated → 10 alive → next `dealAgain` uses 1 deck. This is correct (variance scales to the live headcount, not the original), NOT a bug. The boundary test (AC-5.1.5) is about the *deal-time* count at each site, so a `dealAgain`-crossing-the-boundary case is a nice optional addition but the `handleDeal` 10↔11 split is the required one.
- **`dealRound` (engine.ts:125-159)** — takes `composition`, calls `shuffle(buildDeck(composition), rng)`, self-asserts `deck.length >= alive.length`. Unchanged by this story; just receives a possibly-2-deck composition.
- **`assertDealable` (validate.ts:88-94)** — already validates `Number.isInteger(decks) && decks > 0` and `decks * 52 >= playerCount`. Unchanged; just receives the computed composition. `{decks:2}` passes both checks for any playerCount ≤ 20.

### Why no resolution change (the crucial "don't reopen it" note)
- Two merged decks introduce **duplicate `{rank,suit}` cards** → duplicate VALUES → more frequent ties. This is **accepted by design** (FR-13:33, FR-10). The lowest-value computation, ties-incl-all-tied, deduction, elimination, and win-check are all already proven across 2..20 (`engine.test.ts:598-639`, four parameterized tests authored in Story 3.1 precisely so Epic 5 would not reopen them). **Do not modify `resolveShowdown` or its tests.** If a 20-player tie scenario seems "new," it is already covered.

### Constants & reuse anchors (do not reinvent)
- `SINGLE_DECK_MAX_PLAYERS = 10` (`shared/src/config.ts:6`) — the threshold; already cites D5/FR-13. The mapping keys on this.
- `MAX_PLAYERS = 20`, `MIN_PLAYERS = 2` (`shared/src/config.ts:9-10`) — table bounds. `joinRoom` already enforces `>= MAX_PLAYERS` rejection (handlers.ts:213), so `playerCount` reaching `compositionFor` is always 2..20; the function need not defend above 20, but a `> SINGLE_DECK_MAX_PLAYERS` test is the cleanest expression (no upper literal).
- `buildDeck` / `DeckComposition` / `dealRound` — reuse as-is.

### Testing standards
- **RED-first** (project standing practice across all epics): write the failing unit + boundary test before the mapping/wiring exists; confirm RED, then GREEN.
- Engine/unit tests in `server/src/rules/*.test.ts` (pure, fast). DO/integration tests in `server/src/*.do.test.ts` via the existing `@cloudflare/vitest-pool-workers` harness (drive a real `createRoom` → N× `joinRoom` → `deal`). Clone the deal-driving helpers in `table-server-deal.do.test.ts` rather than inventing a harness.
- Known flake: a `.do.test.ts` may flake once on a cold full-suite run — re-run before treating as a regression (documented pattern since Epic 3).

### Project Structure Notes
- Mapping belongs in `server/src/rules/engine.ts` (GATE-2 purity boundary — the ESLint denylist on `server/src/rules/**` forbids transport/storage/crypto/Date/Math.random; a pure `playerCount → {decks}` function complies). It must NOT live in `handlers.ts` as ad-hoc logic, and must NOT go in `@trash/shared` (it is engine-internal, not contract).
- No new files are strictly required (mapping + tests can extend existing engine + deal-test files), but a dedicated `table-server-deck-scaling.do.test.ts` is acceptable and mirrors the per-feature DO-test convention.

### References
- [Source: epics.md#FR-13 line 33, line 106 — auto deck scaling, duplicate values accepted]
- [Source: epics.md#AR-9 line 61, line 113 — `buildDeck(playerCount)` → 52 ≤10 / 104 for 11–20, "a variance choice, not capacity"]
- [Source: epics.md#Epic-5 line 142-143; Decision #7 line 156 (resolution parameterized 2..20; "one boundary integration test"); Decision #8 line 157 (`buildDeck` takes composition; "data/config change, not surgery")]
- [Source: server/src/rules/engine.ts:26-57 — `DeckComposition`, `buildDeck`; line 125-159 — `dealRound`]
- [Source: server/src/rules/validate.ts:88-94 — `assertDealable` deck-covers-table guard]
- [Source: server/src/handlers.ts:26-29 — `DEAL_COMPOSITION`; line 529-542 — `handleDeal`; line 704 — `handleDealAgain`]
- [Source: shared/src/config.ts:6 — `SINGLE_DECK_MAX_PLAYERS = 10`; line 9-10 — `MIN_PLAYERS`/`MAX_PLAYERS`]
- [Source: server/src/rules/engine.test.ts:598-639 — parameterized `resolveShowdown` 2..20 tests (do not modify)]
- [Source: epic-4-retro-2026-06-22.md — both prerequisite bets verified solid; Epic 5 = mapping + one boundary test]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (1M context) — `us.anthropic.claude-opus-4-8[1m]`

### Debug Log References

- RED-first (unit) confirmed: the 4 `compositionFor` tests in `engine.test.ts` failed with `TypeError: compositionFor is not a function` before the export existed; all green after adding the function.
- Boundary DO test snag fixed: the 20-player case initially timed out in `nextPhase` (default `tries=12`). At a 20-seat table the host socket buffers ~one `lobby` join fan-out per guest ahead of its single `turns` projection (staggered under WebSocket Hibernation — the documented delivery pattern), so `tries` was raised to 40 to drain past them. 10/11-player cases passed at the default; the bump only matters for large tables.
- Known flake encountered: `table-server-reveal.do.test.ts` failed once on the cold full-suite run, passed in isolation and on the warm re-run (the `@cloudflare/vitest-pool-workers` cold-run pattern). It touches `revealAll`, which this story never modified — not a regression.

### Completion Notes List

- **The whole change is one constant → one pure mapping (as scoped).** Added `compositionFor(playerCount): DeckComposition` to `rules/engine.ts` (`{ decks: playerCount <= SINGLE_DECK_MAX_PLAYERS ? 1 : 2 }`), keyed on the shared `SINGLE_DECK_MAX_PLAYERS=10` constant — no hardcoded literal. PURE (GATE-2: lives in `rules/`, reuses `buildDeck` via `dealRound`, no IO/clock/RNG).
- **Both deal sites wired (AC-5.1.2/.3).** `handleDeal` and `handleDealAgain` now compute `const composition = compositionFor(aliveCount)` and pass the SAME value to `assertDealable` AND `dealRound`. Removed the dead `DEAL_COMPOSITION = { decks: 1 }` constant + its stale comment.
- **`handleDealAgain` `assertDealable` added for symmetry.** Confirmed it relied solely on `dealRound`'s coverage self-assert before; the explicit guard now matches `handleDeal`. The deck count correctly DROPS when the roster shrinks below 11 between rounds (variance scales to the live headcount — not a bug).
- **Resolution NOT reopened (AC-5.1.6).** `resolveShowdown` and its parameterized 2..20 tests are untouched; duplicate values / more frequent ties at 2 decks are the accepted, already-tested property (FR-10/FR-13).
- **Server-only, no contract change (AC-5.1.7).** `git diff` confirms zero `shared/` and `client/` changes. NO `types.ts`, NO new `ErrorReason`, NO router/client change. `DeckComposition` stays engine-internal.
- **Gates green:** server 210 → **217** (+4 `compositionFor` unit, +3 deck-scaling DO), client 137 unchanged, lint clean, typecheck `svelte-check` 0 / `tsc` 0, build (PWA) OK.

### File List

- `server/src/rules/engine.ts` (+`compositionFor`; +`SINGLE_DECK_MAX_PLAYERS` import)
- `server/src/handlers.ts` (wire `compositionFor` at both deal sites; remove `DEAL_COMPOSITION`; +`compositionFor` import; +`assertDealable` in `handleDealAgain`)
- `server/src/rules/engine.test.ts` (+4 `compositionFor` unit tests; +`SINGLE_DECK_MAX_PLAYERS`/`compositionFor` imports)
- `server/src/table-server-deck-scaling.do.test.ts` (NEW — 10↔11 boundary + 20-player integration tests)
- `server/src/handlers.ts` (REVIEW FIX 2026-06-23 — `handleDealAgain` MIN_PLAYERS floor guard; see Review Findings)
- `server/src/table-server-host-controls.do.test.ts` (REVIEW FIX 2026-06-23 — +1 regression test `dealAgain floor: …`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (5-1 → in-progress → review; epic-5 → in-progress)

## Change Log

- 2026-06-23 — Story 5.1 implemented (dev-story): FR-13 auto deck scaling shipped. NEW pure `compositionFor(playerCount)` in `rules/engine.ts` (≤10→{decks:1}, 11–20→{decks:2}), keyed on the existing `SINGLE_DECK_MAX_PLAYERS=10` (no literal). Wired at BOTH deal sites (`handleDeal` + `handleDealAgain`) — same composition passed to `assertDealable` + `dealRound`; removed the dead `DEAL_COMPOSITION={decks:1}` constant; added `assertDealable` to `handleDealAgain` for symmetry (it had none — relied on dealRound's coverage assert). Resolution NOT reopened (resolveShowdown 2..20 untouched; duplicate values/ties at 2 decks accepted by design). SERVER-ONLY: NO types.ts/ErrorReason/router/client change (DeckComposition is engine-internal; `git diff` of shared/+client/ is empty). Tests: +4 `compositionFor` unit + NEW `table-server-deck-scaling.do.test.ts` (real deal at 10→1 deck/42 leftover, 11→2 decks/93 leftover, 20→2 decks/84 leftover). server 210→217, client 137 unchanged; lint/typecheck(svelte-check 0/tsc 0)/build(PWA) green. RED-first confirmed. One reveal `.do.test.ts` cold-run flake (known pool-workers pattern, untouched code), passed on warm re-run. Branch baseline 78f93fc. Status → review.
- 2026-06-23 — Story 5.1 created (create-story): the only build story of Epic 5 and the last functional MVP story. Delivers FR-13 (auto deck scaling — 1 deck ≤10, 2 merged decks 11–20) by replacing the hardcoded `DEAL_COMPOSITION = {decks:1}` (handlers.ts:26-29) with a pure `compositionFor(playerCount)` mapping in `rules/engine.ts`, keyed on the existing `SINGLE_DECK_MAX_PLAYERS=10` constant, called at both deal sites (handleDeal:542 + handleDealAgain:704) with the same composition passed to `assertDealable` + `dealRound`. Server-only: NO types.ts/ErrorReason/router/client change (`DeckComposition` is engine-internal). Both prerequisite bets verified in the Epic-4 retro: `resolveShowdown` already parameterized 2..20 (do NOT reopen) + `buildDeck` already takes composition. Tests: `compositionFor` unit + the 10↔11 boundary integration test (Decision #7) + a 20-player smoke. RED-first. Duplicate values / more ties at 2 decks are accepted by design (FR-10/FR-13). Baseline HEAD (main tip after Epic 4 merge). Status → ready-for-dev.
