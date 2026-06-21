---
baseline_commit: 6409990536a72255db0fb9acc197ea6a29d97747
---

# Story 2.1: Deck build & seeded shuffle (pure, parameterized)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the builder,
I want a pure, deterministic-testable deck and shuffle whose composition is supplied as input,
so that the round can be dealt fairly today and scaled to two decks later (Epic 5) with a data change, not surgery.

## Acceptance Criteria

> Source ACs verbatim from [epics.md#Story 2.1] (lines 496–511). The "**Then**" clauses below are the binding contract; the AC IDs are this story's addressing scheme.

**AC-2.1.1 — `buildDeck(composition)` is parameterized, never hardcoded (Decision #8, D5)**
Given `server/src/rules/engine.ts`,
When `buildDeck(composition)` is called,
Then it returns a deck built from the **SUPPLIED composition** — for the Epic 2 single-deck case, one standard 52-card deck (ranks 1..13 × 4 suits) — with composition passed in as an argument, **never hardcoded to 52 inside deal logic**.
And the function is pure: same composition in → equal deck out, no ambient state, no randomness.

**AC-2.1.2 — `shuffle(deck, rng)` is a pure Fisher–Yates with the RNG injected**
Given `shuffle(deck, rng)`,
When it runs,
Then it is a pure **Fisher–Yates** shuffle with the RNG **injected as a parameter**, producing a **deterministic order for a fixed seed** (unit-tested), and it does not mutate its input deck argument (returns a new array — or is documented as in-place; pick one and test it).

**AC-2.1.3 — Production seeds from `crypto.getRandomValues()`, never `Math.random()`**
Given the production caller,
When it shuffles for a real deal,
Then it constructs the injected `rng` from **`crypto.getRandomValues()`** (native Workers WebCrypto) — **never `Math.random()`** — at a site **outside `server/src/rules/**`** (the purity boundary), and passes that `rng` into the pure `shuffle`.

**AC-2.1.4 — `server/src/rules/**` purity gate stays green**
Given the Story 1.2 ESLint purity gate on `server/src/rules/**/*.ts`,
When this story's rules code is linted,
Then it contains **no banned tokens** (`Date`, `Math.random`, `crypto`, `fetch`, `storage`, `ws`, `caches`, `console`, `this`, dynamic `import()`) and imports **only `@trash/shared` or same-tree `./` paths** — `eslint .` stays green.
And a planted violation (e.g. a `Math.random()` or `crypto` token inside `engine.ts`) makes lint go **red** (confirm the gate still bites — red/green discipline), then is removed to return green.

## Tasks / Subtasks

- [x] **Task 1 — Decide & define the `DeckComposition` input shape** (AC: 2.1.1)
  - [x] Chose `type DeckComposition = { decks: number }` — smallest input that makes Epic 5 a data change (`decks: 2`) and matches D5's "two merged decks" framing.
  - [x] Kept it **engine-local** in `engine.ts` (exported), NOT in `@trash/shared` — it is not sent over the wire. Promote to shared only if a non-server consumer ever needs it.
- [x] **Task 2 — Implement `buildDeck(composition)` (pure)** (AC: 2.1.1, 2.1.4)
  - [x] `buildDeck(composition)` exported from `server/src/rules/engine.ts`; `{ decks: n }` → `n × 52` cards (one of every rank 1..13 × 4 suits, per deck).
  - [x] `import type { Card } from "@trash/shared"`. Suits emitted decoratively; engine never compares suit.
  - [x] Pure array construction — no randomness/clock/this/storage. GATE 2 green.
- [x] **Task 3 — Implement `shuffle(deck, rng)` (pure Fisher–Yates, RNG injected)** (AC: 2.1.2, 2.1.4)
  - [x] `rng` contract: `type Rng = () => number` returning a float in `[0, 1)` (documented in `engine.ts`). Index derived as `Math.floor(rng() * (i + 1))` — uniform in `[0, i]`.
  - [x] Standard Fisher–Yates (last index down to 1, swap with chosen earlier-or-equal index). No biased `sort()`.
  - [x] Returns a **new array** (`deck.slice()` then shuffle the copy) — non-mutating; tested.
- [x] **Task 4 — Wire the production randomness seam (OUTSIDE rules/)** (AC: 2.1.3, 2.1.4)
  - [x] `server/src/rng.ts` (outside `rules/`) exports `cryptoRng(): Rng`, built from `crypto.getRandomValues(new Uint32Array(1))` normalized `/ 2^32` to `[0, 1)`. Mirrors `room-code.ts:36`.
  - [x] No deal handler here (that is Story 2.3). The seam is demonstrably correct and composes with `shuffle` (tested). 2.3's deal handler will call `shuffle(buildDeck(comp), cryptoRng())`.
  - [x] `rng.ts` is outside the purity glob; `crypto` permitted there — lint confirms green.
- [x] **Task 5 — Tests (node-env, `*.test.ts`)** (AC: all)
  - [x] `server/src/rules/engine.test.ts` (node project), house style (`import { expect, test } from "vitest"`, descriptive names, batch loops).
  - [x] buildDeck: 52/4-each (decks:1), 104/8-each (decks:2 — guards hardcoded-52 regression), all suits, purity (equal-but-distinct).
  - [x] shuffle determinism: seeded LCG → same order every run; **exact expected order** for a 5-card deck + seed 12345 pinned (`[5,1,3,2,4]`, the observed deterministic output).
  - [x] shuffle permutation (same multiset/length) + non-mutation (original untouched) + different-seed divergence.
  - [x] `cryptoRng` (`server/src/rng.test.ts`): values in `[0,1)`, >1 distinct over 1000 draws, composes with `shuffle` to a valid permutation. `crypto.getRandomValues` available in node-env vitest project.
  - [x] **Purity-gate red/green proof** (see Completion Notes): planted `Math.random()` in `engine.ts` → lint RED (`no Math.random`); planted `crypto` in `engine.test.ts` → lint RED (syntax ban survives the import exemption); both removed → GREEN.
- [x] **Task 6 — Verify gates** (AC: 2.1.4)
  - [x] `npm test` → server 44 / client 42 green; `npm run lint` → green; `npm run typecheck` → 0 errors.

### Review Findings

> Code review 2026-06-20 (3 layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor). All 4 ACs and every scope constraint verified SATISFIED by the Acceptance Auditor; Blind Hunter found no correctness bugs (random math + Fisher–Yates verified correct by execution). All substantive findings below share one root cause: the pure functions trust their input contracts rather than enforcing them — and the spec explicitly defers input validation to Story 2.2 (`validate.ts`).

- [x] [Review][Defer] `buildDeck({decks: Infinity})` never terminates (infinite loop / OOM) [server/src/rules/engine.ts:35] — deferred to Story 2.2. `for (let d = 0; d < composition.decks; d++)` with `decks: Infinity` loops forever, growing the array unbounded. Categorically worse than a wrong-but-bounded result. **Defer reason:** respects the spec's validation boundary (`validate.ts` / Story 2.2 owns input validation); no in-scope caller can pass `Infinity` (deck-count chooser is Story 5.1).
- [x] [Review][Defer] `shuffle` corrupts the deck with `undefined` holes when `rng()` returns ≥1, <0, or NaN [server/src/rules/engine.ts:54] — deferred, input-contract enforcement owned by Story 2.2. `j = Math.floor(rng()*(i+1))` can index out of bounds; the `[0,1)` contract is documented but not enforced. Not reachable in scope: production `cryptoRng` provably returns `[0,1)`; tests honor it.
- [x] [Review][Defer] `buildDeck` with non-integer `decks` silently builds `ceil(decks)` decks [server/src/rules/engine.ts:35] — deferred, input-contract enforcement owned by Story 2.2. `{decks: 1.5}` → 104 cards; no `Math.floor`/integer guard. `decks: number` is not branded-integer.
- [x] [Review][Defer] `buildDeck` with `decks` 0/negative/NaN silently returns an empty deck [server/src/rules/engine.ts:35] — deferred, input-contract enforcement owned by Story 2.2. Nonsensical composition treated as a valid 0-card deck rather than rejected.
- [x] [Review][Defer] Red-first purity-gate proof (AC-2.1.4) not evidenced as a durable artifact — deferred, pre-existing process gap. The dev's Completion Notes record the RED→GREEN planted-violation steps narratively, but the delivered tree shows the green end-state only. Gate logic is sound (pre-proven in Story 1.2). Carry as a note: per-story red-first confirmation rests on the dev record, not a re-runnable artifact.

## Dev Notes

### What this story IS / IS NOT
- **IS:** two pure functions (`buildDeck`, `shuffle`) in `server/src/rules/engine.ts` + a production RNG seam (`crypto.getRandomValues`) OUTSIDE rules/, with deterministic-seed unit tests. The FIRST code in the pure rule engine.
- **IS NOT:** the deal handler (Story 2.3), turn logic, the monotonic guard (Story 2.2), or any state mutation. No `Round` is constructed here, no `ctx.storage`, no DO code. TDD resumes in full here (red/green/refactor) — unlike the 1.1 spike.

### The purity boundary — the load-bearing constraint
`server/src/rules/**` is enforced PURE by the Story 1.2 ESLint gate. Verified config:
- **Glob:** `files: ["server/src/rules/**/*.ts"]` [eslint.config.js:101-122].
- **Banned tokens** (`no-restricted-syntax`): `Date.now`, `new Date`, bare `Date`, `performance.now`, `Math.random`, `crypto`, `fetch`, `storage`, `ws`, `caches`, `console`, `this`, dynamic `import()`, and computed-member bypasses like `Math['random']` / `['getRandomValues']` [eslint.config.js:34-63].
- **Import restriction:** rules/ may import ONLY `@trash/shared(/...)` or same-tree `./` paths — no `../` escapes [eslint.config.js:104-119].
- **Architecture statement:** "`server/src/rules/**` imports ONLY `@trash/shared`; no transport/storage/crypto/Date/Math.random (ESLint denylist). Fully node-unit-testable." [architecture.md:745-746]; rule table [architecture.md:553].

**Consequence:** `crypto.getRandomValues()` CANNOT live in `engine.ts`. The pure `shuffle` takes an injected `rng`; the crypto call lives in a separate non-rules module (Task 4). This is the deliberate seam, not a workaround — it is exactly what makes `shuffle` deterministically testable (AC-2.1.2).

### Architecture sources (deck & shuffle)
- **D5 — Deck Scaling & Shuffle** [architecture.md:405-418]: `buildDeck(playerCount)` → one 52-card deck for ≤10, two merged decks (104) for 11–20; "**Shuffle:** Fisher–Yates seeded by `crypto.getRandomValues()` — never `Math.random()`. Pure function `shuffle(deck, rng)` with the RNG injectable for deterministic tests."
  - **Note the signature drift:** D5 prose says `buildDeck(playerCount)`, but the Story 2.1 AC says `buildDeck(composition)` with "composition passed in — never hardcoded." Decision #8 ("deck composition is supplied, not assumed") and the AC WIN. Build to `composition`, not `playerCount`. The playerCount→composition mapping (≤10→1 deck, 11–20→2) is **Epic 5 / Story 5.1** — do NOT build that mapping here; just accept the composition the caller supplies. [epics.md:506; epics.md Decision #8.]
- **engine.ts responsibility** [architecture.md:686-691]: `buildDeck, shuffle(rng injected), nextAliveSeat/isLastPlayer/turn-order, applySwap/Keep/Draw, showdown resolution, lives/eliminate/win-check, tiebreak`. **This story implements ONLY `buildDeck` + `shuffle`**; the rest are later Epic 2/3 stories. Keep the file small and add the others as their stories land.
- **Crypto** [architecture.md:292]: native Workers WebCrypto — `crypto.getRandomValues()` (shuffle seed), `crypto.randomUUID()` (ids). No external crypto dep.
- **Implementation sequence** [architecture.md:486-488]: the pure engine (`buildDeck`, `shuffle`, turn-order, loser-computation, tiebreak + unit tests) is step 2, the dependency root of Epic 2.
- **Card comparison rule** [architecture.md:550]: `rank` is integer 1–13; comparison is `<`/`>` on `rank`; **suit is never compared**. (Relevant later; for deck-build just emit all four suits.)

### Current code state (verified)
- `server/src/rules/` exists but is **empty** (only `.gitkeep`). `engine.ts` does **not** exist yet — you are creating it.
- **`Card` type** [`shared/src/types.ts:19-22`]: `export type Card = { rank: number; /* 1..13 */ suit: "♠" | "♥" | "♦" | "♣"; /* decorative — never compared */ };`
- **`Round` type** [`shared/src/types.ts:66-74`]: `deck: Card[]` is SERVER-ONLY and is an *output* of dealing — not the composition input. Do not conflate.
- **Deck constant** [`shared/src/config.ts:6`]: `SINGLE_DECK_MAX_PLAYERS = 10`. (Players 2..20 via `MIN_PLAYERS`/`MAX_PLAYERS`.) The playerCount→deck-count mapping that uses this is Epic 5, not here.
- **Production randomness precedent** [`server/src/room-code.ts:36`]: `const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LEN));` with rejection sampling to avoid modulo bias — mirror this care if you map crypto bytes to a `[0,1)` float or a bounded index in `rng.ts`.
- **Identity crypto precedent** [`server/src/identity.ts:40-41`]: `crypto.randomUUID()`.

### Testing standards (match the house style)
- **Vitest projects** [`server/vitest.config.ts:18-42`]: `name:"rules"` (env `node`, `src/**/*.test.ts`, EXCLUDES `*.do.test.ts`) and `name:"do"` (pool-workers, `*.do.test.ts`). Pure-function tests are `*.test.ts` and run in node — that is this story.
- **Style reference** [`server/src/identity.test.ts:1-37`, `room-code.test.ts:35-46`]: `import { expect, test } from "vitest"`; descriptive names ("buildDeck: ...", "shuffle: ..."); batch loops (e.g. 1000 draws) for RNG properties; explicit regression-guard tests.
- **Determinism test pattern:** write a tiny seeded PRNG in the test file (e.g. a 1-line LCG: `let s = seed; const rng = () => (s = (s*1103515245 + 12345) & 0x7fffffff) / 0x80000000;`) so a fixed seed yields a fixed permutation. Assert the exact expected order for a small known deck — this is the core determinism guard.

### Carry-forward note (from Epic 1 retro / deferred-work.md)
- The Epic 1 retro flagged that **every numeric/string Intent field is unvalidated at the type level** and validation is owed to `server/src/rules/validate.ts` (a sibling of `engine.ts`). That is **Story 2.2's guard / a later validate story — NOT this story.** This story builds pure deck/shuffle only; do not add validation here. [deferred-work.md "Deferred from 1-3"; epic-1-retro-2026-06-20.md.]
- Per the retro action item, Story 2.2 will carry the "two-scope monotonic guard built WHOLE" + `validate.ts` obligations as explicit ACs. Not in scope for 2.1.

### Project Structure Notes
- New file: `server/src/rules/engine.ts` (pure). New test: `server/src/rules/engine.test.ts` (node project).
- New file (likely): `server/src/rng.ts` + `server/src/rng.test.ts` — OUTSIDE `server/src/rules/` so `crypto` is permitted. If you prefer, the crypto seam can live in an existing non-rules module, but a dedicated `rng.ts` keeps the seam explicit and testable.
- If `DeckComposition` goes on the wire contract, it lands in `shared/src/types.ts`; recommended to keep it engine-local unless a non-server consumer needs it.
- No changes to `wrangler.jsonc`, DO classes, or persistence in this story.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.1 — Deck build & seeded shuffle (lines 496–511)] — the source ACs.
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2 binding decisions — #1 (guard whole), #8 (deck composition supplied), pre-mortem C]
- [Source: _bmad-output/planning-artifacts/architecture.md#D5 — Deck Scaling & Shuffle (405–418); #Implementation Patterns rule table (550, 553); purity boundary (745–746); engine.ts responsibility (686–691); Crypto (292); implementation sequence (486–488)]
- [Source: server/src/rules/ (empty — .gitkeep only); shared/src/types.ts:19-22 (Card), 66-74 (Round); shared/src/config.ts:6 (SINGLE_DECK_MAX_PLAYERS)]
- [Source: eslint.config.js:34-63 (rulesPurityBans), 101-122 (rules/** glob + import restriction)]
- [Source: server/vitest.config.ts:18-42 (node `rules` vs `do` projects); server/src/identity.test.ts; server/src/room-code.ts:36 (crypto.getRandomValues precedent)]
- [Source: _bmad-output/implementation-artifacts/epic-1-retro-2026-06-20.md; deferred-work.md (validate.ts owed to Story 2.2)]

## Dev Agent Record

### Agent Model Used

Amelia (Senior Software Engineer persona) on Claude Opus 4.8 (1M context).

### Debug Log References

- `npx vitest run src/rules/engine.test.ts` → 10 passed (after RED→GREEN; exact-permutation snapshot pinned to observed deterministic output `[5,1,3,2,4]`).
- `npx vitest run src/rng.test.ts` → 3 passed.
- `npm test` (root) → server 44 passed (9 files), client 42 passed (5 files) — no regressions.
- `npm run lint` → green; `npm run typecheck` → 0 errors / 0 warnings.

### Completion Notes List

- Ultimate context engine analysis completed — comprehensive developer guide created.
- **Design decisions (from the story's recommended defaults):** `DeckComposition = { decks: number }`, engine-local (not on the wire); `Rng = () => number` in `[0,1)`; `shuffle` returns a new array (non-mutating).
- **GATE 2 refinement (decision surfaced to user, recommendation accepted):** the purity glob `server/src/rules/**/*.ts` also catches co-located test files, whose legitimate `import { test } from "vitest"` tripped `no-restricted-imports`. No prior rules test existed, so this convention (named at architecture.md:691) was never exercised. Added a **narrow** eslint override for `server/src/rules/**/*.test.ts` that relaxes ONLY the import allowlist (adds `vitest`); the **purity SYNTAX bans stay fully in force** — proven by planting `crypto` in the test file and seeing the gate still fire. `../` escapes into impure server modules remain banned. [eslint.config.js — new block after GATE 2.]
- **✅ AC-2.1.4 red/green purity-gate proof:** planted `Math.random()` in `engine.ts` → lint RED (`rules/** is PURE — no Math.random`); planted `crypto` in `engine.test.ts` → lint RED (`no crypto`, syntax ban survives the import exemption); both removed → lint GREEN. No planted tokens remain.
- **Scope held:** no validation (`validate.ts` → Story 2.2), no deal handler (→ Story 2.3), no deck-count mapping (→ Epic 5). Resolved the D5-prose `buildDeck(playerCount)` vs AC `buildDeck(composition)` drift in favor of the AC + Decision #8.

### File List

- `server/src/rules/engine.ts` (NEW) — pure `buildDeck(composition)` + `shuffle(deck, rng)` + `DeckComposition`/`Rng` types.
- `server/src/rules/engine.test.ts` (NEW) — node-env unit tests (buildDeck shape/parameterization/purity; shuffle determinism/permutation/non-mutation; pinned exact permutation).
- `server/src/rng.ts` (NEW) — `cryptoRng(): Rng` production randomness seam (outside `rules/`; uses `crypto.getRandomValues`).
- `server/src/rng.test.ts` (NEW) — `cryptoRng` range/entropy + composition-with-shuffle tests.
- `eslint.config.js` (MODIFIED) — narrow GATE 2 test-file exemption allowing `vitest` import in `rules/**/*.test.ts` (syntax purity bans unchanged).

### Change Log

- 2026-06-20 — Implemented pure `buildDeck` + seeded `shuffle` (Fisher–Yates, injected RNG) in `server/src/rules/engine.ts`; added the `crypto.getRandomValues()` production seam `server/src/rng.ts`; full unit coverage (13 new tests). Refined the GATE 2 ESLint purity gate with a narrow co-located-test import exemption (syntax bans intact). All gates green (server 44 / client 42 tests, lint, typecheck). Status → review.
