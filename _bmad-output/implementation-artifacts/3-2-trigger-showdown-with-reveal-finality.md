---
baseline_commit: a8eda8b
---

# Story 3.2: Trigger Showdown with reveal-finality

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Host,
I want to flip every Card at once only after everyone has acted,
so that no Card is ever both still-mutable and visible — the reveal is final.

## Acceptance Criteria

1. **AC-3.2.1 — `revealAll` accepted only at `allActed`, flips `revealed`, advances to `showdown`.** A new `handleReveal` (in `server/src/handlers.ts`) accepts the Host's `revealAll` (payload `{phaseToken}`) when `phase === "allActed"`, sets `round.revealed = true`, advances `phase` to `"showdown"`, bumps the phase token, and persists the durable summary. It CONSUMES the existing Epic-2 phase token (`checkPhaseToken`/`bumpPhaseToken` from `validate.ts`) — NO new guard mechanism is introduced. *(FR-9, AR-6; architecture.md#Phase 580–585.)*

2. **AC-3.2.2 — reveal-finality: rejected before `allActed` and on double-tap.** A `revealAll` arriving in any phase other than `allActed` is rejected `phase-illegal`; a stale/double-tapped `revealAll` (carrying a token that no longer matches) is rejected `stale-phase` — in BOTH cases no Card is revealed and `round.revealed` stays false (no Card is ever both still-mutable and visible). The accepted-path order matches the `handleDeal` precedent: `shape → table-null → not-host → checkPhaseToken → phase(=="allActed") → mutate → bumpPhaseToken → persist`. *(NFR-5; handlers.handleDeal order.)*

3. **AC-3.2.3 — `not-host` server-authority.** Only the Host may trigger the reveal; a crafted `revealAll` from a non-Host device is refused `not-host` even at `allActed` (server-authoritative, NFR-2 — mirrors `handleDeal`/`handleHostSetLives`). The check runs BEFORE the token check is fine to mirror handleDeal exactly (`not-host` before `checkPhaseToken`). *(NFR-2.)*

4. **AC-3.2.4 — reveal-true projection exposes every hand (SM-6 extended, not weakened).** Because `round.revealed` is now true, `projectStateFor` (the SAME Story-1.4 chokepoint, ALREADY branching on `revealed`) includes EVERY Player's `hand` in each per-device payload — the first moment a non-owner device receives another Player's Card value. The standing SM-6 test gains a `revealed === true` counterpart confirming hands are present ONLY when `revealed` is true, and that the projection is otherwise constant-shape across seats. The dispatch fan-out re-projects to every connection on the accepted reveal so all devices flip TOGETHER. *(Decision #3 + E, NFR-1, FR-9.)*

5. **AC-3.2.5 — dispatch routes `revealAll`; the not-yet-implemented stub shrinks.** `dispatch.ts` adds a `case "revealAll"` that calls `handleReveal` then `fanOut` (on success) — exactly the `case "deal"` shape; the error path throws BEFORE fan-out so the single try/catch emits a targeted `error` with NO fan-out. `revealAll` is REMOVED from the `default` "not yet implemented" rejection list (the remaining stub is `dealAgain`/`newGame`/`hostRemovePlayer`/`hostReassign`). *(architecture.md round-trip; dispatch.ts single-error-catch-site.)*

6. **AC-3.2.6 — scope: reveal only, NOT resolution.** This story flips `revealed` and lands in `showdown`; it does NOT call `resolveShowdown`, does NOT deduct Lives, does NOT mark eliminations, does NOT compute `loserIds`/`winnerIds`, does NOT transition `showdown → roundResult | gameOver`. The Showdown resolution (calling Story 3.1's `resolveShowdown`, lives deduction, the result/gameOver transition, the Re-deal) is Story 3.4; the flip animation + loser highlight surface is Story 3.3. NO `shared/src/types.ts` change (the contract already names `revealAll`, the `showdown` phase, and `revealed`). *(epics.md#Story 3.2/3.3/3.4 boundary; 3.1 Dev Notes "IS NOT" clause.)*

7. **AC-3.2.7 — end-to-end DO integration test + gates.** A new `server/src/table-server-reveal.do.test.ts` (mirroring the `table-server-draw.do.test.ts` harness) drives the real wire path: deal → every seat acts (last action → `allActed`) → Host `revealAll` → every device receives a `showdown` projection WITH all hands present (SM-6-over-the-wire: every seat's hand visible only now); plus the two rejections (a pre-`allActed` `revealAll` → `phase-illegal`; a non-Host `revealAll` at `allActed` → `not-host`). server `npm test` + client tests + lint (GATE-1 egress / GATE-2 purity) + typecheck + build all green; the standing SM-6 `project-state.test.ts` re-passes with its new reveal-true case.

## Tasks / Subtasks

- [x] **Task 1 — Author `handleReveal`** (AC: 1, 2, 3, 6)
  - [x] Add `handleReveal(host, intent, callerPlayerId)` to `server/src/handlers.ts`. Signature mirrors `handleDeal`: `intent: Extract<Intent, { type: "deal" | "revealAll" | "dealAgain" | "newGame" }>` (the Intent union groups these four under one `{phaseToken}` member — Extract by a single literal is `never`; dispatch's `case "revealAll"` guarantees the variant at the call site, same as handleDeal's comment at handlers.ts:333-336).
  - [x] Accepted-path order EXACTLY mirroring handleDeal: shape guard (`typeof intent.payload?.phaseToken !== "number" || !Number.isFinite(...)` → `phase-illegal`) → `host.table === null` → `phase-illegal` → `callerPlayerId !== host.table.hostId` → `not-host` → `checkPhaseToken(host.table, intent.payload.phaseToken)` → `host.table.phase !== "allActed"` → `phase-illegal` → mutate → `bumpPhaseToken` → `persistSummary`.
  - [x] Mutate: `host.table.round.revealed = true`; `host.table.phase = "showdown"`. The phase gate `host.table.phase !== "allActed" || host.table.round === null` makes the `round` deref safe (only `turns`/`allActed` carry a live round; a D2.1-coerced wake lands in `roundResult`, never `allActed`) — defensive null check folded into the phase gate.
  - [x] Do NOT call `resolveShowdown`, do NOT touch `players[].lives`/`isAlive`, do NOT set `loserIds`/`winnerIds`, do NOT transition past `showdown` (AC-3.2.6 — that is Story 3.4).
- [x] **Task 2 — Route `revealAll` in dispatch** (AC: 5)
  - [x] In `dispatch.ts`, imported `handleReveal` and added `case "revealAll": { await handleReveal(host, intent, connection.state?.playerId); fanOut(host.connections(), host.table!); return; }` — the exact `case "deal"` shape, with the documented JSDoc comment block (reveal-finality rejections / every device flips together / SM-6 hands now projectable).
  - [x] Removed `revealAll` from the `default`-stub comment list (now `dealAgain/newGame` Stories 3.4/3.6 + `hostRemovePlayer/hostReassign` Epic 4 remain) and updated the SCOPE header to include `→ 3.2 ... revealAll`.
- [x] **Task 3 — Reveal-true SM-6 counterpart in `project-state.test.ts`** (AC: 4) — RED FIRST ✅ (added before impl; the revealed-branch projection was pre-built, so these pass on the existing chokepoint — the true RED was Task 4's wire path)
  - [x] Added `3.2: a revealed projection includes EVERY seat's hand for any caller` — a `revealed: true` round → `projectStateFor` includes every player's `hand` in `players[]` + the owner's `you.hand`; the deep value-walk now FINDS the other seats' ranks AND suits (inverse of the AC3 negative assertion).
  - [x] Added `3.2: the revealed projection is constant-shape across differing hand values` — two revealed fixtures with differing values produce identical structure / `players[].length` / key-set (AC4 invariant holds at reveal too).
  - [x] The existing `revealed: false` SM-6 tests stay green (10 → 12 in `project-state.test.ts`); the chokepoint is extended via its existing `revealed` branch, never weakened.
- [x] **Task 4 — End-to-end DO integration test** (AC: 7) — RED FIRST ✅ (confirmed 3 failing before `handleReveal`/dispatch route existed — `revealAll` hit `default → phase-illegal`)
  - [x] New `server/src/table-server-reveal.do.test.ts`, mirroring the `table-server-draw.do.test.ts` local harness (openConn / nextPhase / nextTurn / nextErrorReason / lobbyOf / deal).
  - [x] Happy path (heads-up): lobby → deal → host keeps → P1 (Last Player) keeps → `allActed` (asserted `revealed===false` there) → Host `revealAll` with the current `phaseToken` → every device receives `phase==="showdown"` with `revealed===true` AND every `players[]` seat's `hand` present (hand-key count = 2 seats + 1 own = 3 over the wire — the inverse of the draw test's `=== 1`).
  - [x] Reject 1: a `revealAll` BEFORE `allActed` (phase `turns`, right after deal) → `phase-illegal`.
  - [x] Reject 2: a NON-Host (`guest`) `revealAll` at `allActed` → `not-host`.
  - [x] Reject 3: a double-tapped `revealAll` (second send with the now-stale token) → `stale-phase`.
- [x] **Task 5 — Gates green** (AC: 7)
  - [x] server `npm test` 170 passed (164 baseline + 6 new: 2 unit + 4 DO); client `npm test` 82 passed; `npm run lint` (GATE-1 egress + GATE-2 purity) clean; `npm run typecheck` 0 errors; `npm run build` OK. Standing SM-6 `project-state.test.ts` re-passes 12/12 (incl. the 2 new reveal-true cases).

## Dev Notes

### What this story IS and is NOT

- **IS:** one new handler (`handleReveal`) in `server/src/handlers.ts` + one dispatch route (`case "revealAll"`) + the reveal-true SM-6 projection test + an end-to-end DO integration test. It makes `round.revealed = true` REACHABLE (it was, until now, only a type) so the ALREADY-BUILT `revealed`-true branch in `projectStateFor` fires.
- **IS NOT:** any call to `resolveShowdown` (Story 3.1's pure function — consumed by Story 3.4's `dealAgain`), any Lives deduction / elimination, any `loserIds`/`winnerIds` projection, any `showdown → roundResult | gameOver` transition, any client surface (the flip animation + loser highlight is Story 3.3), or any `shared/src/types.ts` change. Do not implement resolution or the Round-Result UI here.

### The phase boundary — `allActed → showdown` (this story's single transition)

The canonical phase machine [architecture.md#Phase 580–585; types.ts:28–46]:
```
turns      --(last seat acted)--> allActed     (server-internal — Story 2.6 ALREADY ships this)
allActed   --revealAll-->         showdown      (Host; phaseToken; REJECTED unless phase === "allActed")  ← THIS STORY
showdown   --(resolution)->       roundResult | gameOver   (server-internal — Story 3.4)
```
`allActed` is a REAL Phase literal that Story 2.6 ENTERS via `maybeCompletePass` (handlers.ts:472 — sets `phase="allActed"`, clears `currentTurnId`, bumps phaseToken). This story only READS it as the gate for `revealAll` and never sets it (the 2.6 contract: "Story 3.2's `revealAll` only READS/consumes `allActed`"). `showdown` means `round.revealed === true` and hands are projectable to all.

### REUSE — do not reinvent (the established server primitives & precedent)

Read `server/src/handlers.ts`, `dispatch.ts`, `validate.ts`, and `project-state.ts` in full before writing — `handleReveal` is a near-clone of `handleDeal` on the PHASE scope:
- **`checkPhaseToken(state, token)`** `validate.ts:53` + **`bumpPhaseToken(state)`** `validate.ts:67` — THE phase-scope guard pair (Story 2.2). `validate.ts:48-51` literally pre-documents: *"The extra `revealAll` guard requiring `phase === "allActed"` is Story 3.2's concern; this primitive ships only the token compare."* You ADD that phase gate IN `handleReveal` (not in validate.ts — the primitive is generic). Do NOT write a new guard.
- **`handleDeal`** `handlers.ts:331` — the PHASE-consumer precedent. Copy its accepted-path order, its shape-guard rationale, its `not-host` check, and its `Extract<Intent, {...}>` parameter type comment verbatim in spirit. `handleReveal` differs ONLY in: phase gate is `allActed` (not `lobby`), no `≥2-alive`/`assertDealable` (no deal), mutate is `revealed=true`+`phase="showdown"` (not `dealRound`).
- **`projectStateFor`** `project-state.ts:22,52-63` — the `revealed` switch is ALREADY built: `const revealed = round?.revealed ?? false;` then `if (revealed && round) entry.hand = round.hands[p.id];` for every seat. This story changes NO projection code — it only makes `revealed` reach `true`. The `revealed` top-level field is already always projected (project-state.ts:74). Confirm you write NO new projection branch.
- **`fanOut(host.connections(), host.table!)`** — the per-device re-projection (push-state.ts), exactly as `case "deal"` calls it. Each device gets its OWN projection — at `showdown` every device's projection now carries all hands (each still constant-shape).

### Purity / boundary placement (where each piece lives)

- `handleReveal` lives in `handlers.ts` (the state-mutation boundary — the only site that assigns `host.table.*` / writes storage). It is NOT in `rules/` (it mutates + persists — not pure). Throw `IntentError` (the handler/validate boundary error), NOT the plain `Error` the pure engine throws.
- The phase gate + token guard are the only validation; no FIELD validation is needed (the only payload field is `phaseToken`, shape-guarded like handleDeal). No `validate.ts` change (the `assertDealable` pattern is deal-only; reveal has no composition).
- GATE-1 (egress ban): `handleReveal` must not `.send`/`.broadcast` — it mutates + persists only; dispatch owns the fan-out. GATE-2 (purity) does not apply to handlers.ts (only `server/src/rules/**`), but `projectStateFor` is egress-banned (GATE-1) and you touch it only in tests.

### Reveal-finality (NFR-5) — the safety property to pin

"No Card is ever both still-mutable and visible." Cards are mutable in `turns` (swap/keep/draw move hands). The `allActed`-only gate guarantees `revealed` cannot flip while any seat can still act: by the time `phase === "allActed"`, `maybeCompletePass` has already cleared `currentTurnId` and every `isAlive` seat is in `round.acted` (no turn handler will accept — `requireActiveTurn` rejects `phase !== "turns"` as `phase-illegal`). So a reveal at `allActed` sees only final, immutable cards. The double-tap rejection (`stale-phase`) and the pre-`allActed` rejection (`phase-illegal`) are the two ways the guard enforces finality (AC-3.2.2).

### SM-6 extended, not weakened (Decision #3 + E)

The standing privacy test (`project-state.test.ts`) asserts ONLY the `revealed === false` behavior today (its header says so, lines 7–8: *"the `revealed === true` projection is Story 3.2's acceptance, not this story's"*). This story ADDS the reveal-true counterpart: when `revealed === true`, EVERY seat's hand IS present (the deep value-walk now FINDS the other ranks — the inverse assertion). This is the FIRST moment a non-owner receives another Player's Card value, and it is correct (NFR-1). The pre-reveal tests stay green — the chokepoint is the SAME function, extended via its existing `revealed` branch, never a second/weakened rule.

### Type shapes (no change — read-only context)

`shared/src/types.ts`:
- `Phase` (line 39) already includes `"showdown"` (line 44) and `"allActed"` (line 43). No change.
- `Round.revealed: boolean` (line 73) — "true only after a valid revealAll." This story is the producer.
- `Intent` (line 158): `{ type: "deal" | "revealAll" | "dealAgain" | "newGame"; payload: { phaseToken: number } }` — `revealAll` is ALREADY named and carries `{phaseToken}`. No change.
- `ProjectedTableState.revealed: boolean` (line 139) always present; `players[].hand?` (line 134) "present only when revealed." Both already projected by project-state.ts. `loserIds`/`winnerIds` (140–141) stay UNSET this story (Story 3.4).

### Previous story intelligence (Story 3.1 — just completed, `review`)

- 3.1 shipped the PURE `resolveShowdown` in `engine.ts` (canonical D6 order, discriminated-union outcome, NEW players array — inputs never mutated) + Action-4 primitive hardening (`dealRound`/`nextAliveSeat` asserts). 3.1 explicitly scoped OUT this story's work: *"any handler, dispatch route, phase transition, projection ... are Story 3.2 (`revealAll` trigger + reveal-true projection)"* [3-1 Dev Notes:74].
- 3.1's `resolveShowdown` is NOT called here — it is Story 3.4's `dealAgain` that consumes it (to derive the alive starter + deduct lives). This story stops at `showdown`. Do not import or call `resolveShowdown`.
- TDD discipline confirmed productive in 3.1 (RED-first: 17 failing → green). Mirror it: write Task 3/4 tests RED before Task 1/2 pass.
- 3.1's review added asserts to the pure engine; this story touches NO engine code — its asserts/guards are `IntentError`s in the handler/validate layer.

### Git intelligence (recent commits)

- `a8eda8b` Story 3.1: pure resolveShowdown + Action-4 hardening (the baseline; engine-only, no handler/dispatch/projection change — so this story is the FIRST to wire the showdown phase).
- `45ed0c7` Story 2.6: last-player draw + the `maybeCompletePass` shared completion step (handlers.ts:472) that ENTERS `allActed` and clears `currentTurnId` — the precondition this story's `revealAll` gate depends on.
- Pattern across 2.3–2.6: each gameplay handler copies the `handleDeal` accepted-path chokepoint; the DO integration test mirrors the prior `*-*.do.test.ts` harness. `handleReveal` + `table-server-reveal.do.test.ts` continue exactly this pattern.

### Testing standards

- **Node `rules`/unit project** (`*.test.ts`): `project-state.test.ts` — add the reveal-true cases. `import { expect, test } from "vitest"`, flat `test(...)`, no I/O. Reuse the file's existing `player()` / `tableWithHands()` / `collectValues()` helpers; add a revealed variant (set `round.revealed = true`).
- **DO integration project** (`*.do.test.ts`, `@cloudflare/vitest-pool-workers`): new `table-server-reveal.do.test.ts` — copy the `table-server-draw.do.test.ts` local harness (openConn/nextPhase/nextErrorReason/lobbyOf/deal). Real WebSocket upgrade through the Worker → DO; drive `onMessage → dispatch → handleReveal → fanOut`, never an RPC shortcut.
- RED-first: confirm the new tests FAIL before `handleReveal`/dispatch route exist (revealAll currently hits the `default` → `phase-illegal`, so the happy-path test fails on "never saw showdown").
- Server test count baseline ≈ 164 (3.1 review). Your additions are net-new (≈2 unit + ≈3 DO).

### Project Structure Notes

- Touched source: `server/src/handlers.ts` (UPDATE — add `handleReveal`), `server/src/dispatch.ts` (UPDATE — add `case "revealAll"`, import, shrink stub). Touched tests: `server/src/project-state.test.ts` (UPDATE — reveal-true cases), `server/src/table-server-reveal.do.test.ts` (NEW). NO client, NO `shared/`, NO `rules/` change.
- Aligns with architecture: `handlers.ts` = state-mutation boundary, `dispatch.ts` = router + single try/catch, `project-state.ts` = privacy chokepoint. No structural variance.

### References

- [Source: epics.md#Story 3.2 (lines 695–713)] — the three ACs (allActed-only accept + revealed=true + phase advance; pre-allActed/double-tap rejection; reveal-true projection includes every hand via the SAME function).
- [Source: epics.md#Story 3.3/3.4 (lines 715–765)] — the boundary: 3.3 = flip animation + loser highlight (client); 3.4 = `dealAgain` re-deal + Lives + resolution. This story stops at `showdown`.
- [Source: architecture.md#Phase 570–588] — the canonical phase machine: `allActed --revealAll--> showdown` (rejected unless `phase === "allActed"`); `showdown --(resolution)--> roundResult|gameOver` is Story 3.4.
- [Source: architecture.md#D6 419–435] — Showdown resolution order step 1 = reveal (this story); steps 2–6 = Story 3.4 (via 3.1's resolveShowdown).
- [Source: server/src/handlers.ts:331–396 (handleDeal)] — the PHASE-consumer accepted-path precedent `handleReveal` clones; handlers.ts:472 (maybeCompletePass) — where `allActed` is entered (Story 2.6).
- [Source: server/src/rules/validate.ts:48–55] — `checkPhaseToken`/`bumpPhaseToken`; the in-code note that the `phase === "allActed"` gate is THIS story's concern.
- [Source: server/src/dispatch.ts:86–97 (case "deal"), 131–134 (default stub)] — the `case` shape to copy + the stub to shrink.
- [Source: server/src/project-state.ts:22,52–63,74] — the ALREADY-BUILT `revealed` projection switch; this story makes `revealed` reach true (no projection-code change).
- [Source: server/src/project-state.test.ts:7–9] — the standing SM-6 test scoped its reveal-true case to THIS story.
- [Source: server/src/table-server-draw.do.test.ts] — the DO integration harness to mirror (openConn/nextPhase/nextErrorReason/lobbyOf/deal; the `"hand"`-key-count SM-6-over-the-wire assertion to invert).
- [Source: shared/src/types.ts:39–46,73,139,158] — `Phase`/`Round.revealed`/`ProjectedTableState.revealed`/`Intent` — all pre-named, no change.

## Dev Agent Record

### Agent Model Used

Opus 4.8 (1M context) — claude-opus-4-8[1m]

### Debug Log References

- RED confirmed: `npm run test --workspace=server` → 3 failed / 167 passed before implementation (revealAll hit the dispatch `default → phase-illegal` stub: happy-path timed out never reaching `showdown`; not-host got `phase-illegal`; double-tap timed out). The 2 new projection unit tests passed pre-impl (the `revealed` projection branch was already built — Story 1.4 — so the genuine RED was the wire path).
- GREEN: same command → 170 passed (164 prior + 6 new). One iteration on the happy-path SM-6 assertion: hand-key count is 3 not 2 (2 seats in `players[]` + 1 own `you.hand`), fixed to assert `players.length` + each `players[].hand` defined + total `"hand"` count 3.
- Gates: client 82 passed; lint (GATE-1 egress + GATE-2 purity) clean; typecheck 0 errors; build OK; SM-6 `project-state.test.ts` 12/12.

### Completion Notes List

- **`handleReveal` (handlers.ts)** — the SECOND PHASE-scope consumer, a near-clone of `handleDeal`. Accepted-path order identical to handleDeal (shape → table-null → not-host → checkPhaseToken → phase gate → mutate → bumpPhaseToken → persist), differing only in the gate (`phase === "allActed"`) and the mutation (`round.revealed = true` + `phase = "showdown"`). Throws `IntentError` (handler boundary), consuming the Epic-2 phase token primitive (`checkPhaseToken`/`bumpPhaseToken`) — NO new guard mechanism, exactly as validate.ts:48-51 pre-documented.
- **Reveal-finality (NFR-5, AC-3.2.2)** structurally enforced: the `allActed`-only gate means a reveal can only fire once the one pass is complete (currentTurnId cleared, every alive seat in `acted`, turn handlers reject `phase !== "turns"`), so no Card is ever both still-mutable and visible. The double-tap (`stale-phase`) and pre-`allActed` (`phase-illegal`) rejections both throw BEFORE the mutation — confirmed by the DO test.
- **`dispatch.ts`** — added `case "revealAll"` (handleReveal + fanOut, the exact `case "deal"` shape); shrank the not-yet-implemented stub to `dealAgain/newGame/hostRemovePlayer/hostReassign`; updated the SCOPE header.
- **SM-6 EXTENDED, not weakened (Decision #3):** NO `projectStateFor` code change. The `revealed` switch (project-state.ts:22,61) was already built (Story 1.4 anticipated the reveal); this story makes `round.revealed` REACHABLE, so the existing branch now fires and exposes every seat's hand. The standing SM-6 test gains its reveal-true counterpart (the inverse value-walk: all hands present iff revealed) while the pre-reveal negative assertions stay green.
- **Scope held (AC-3.2.6):** reveal + land in `showdown` ONLY. NO `resolveShowdown` call, NO Lives/elimination, NO `loserIds`/`winnerIds`, NO `showdown → roundResult | gameOver` transition (Story 3.4), NO client flip/highlight surface (Story 3.3), NO `shared/src/types.ts` change (`revealAll`/`showdown`/`revealed` all pre-named). Touched files: handlers.ts + dispatch.ts (source) + project-state.test.ts + new table-server-reveal.do.test.ts (tests) — no client/shared/rules change.
- **Branch:** `story/3-2-trigger-showdown-with-reveal-finality` (off `e632561` = main with Story 3.1 merged via PR #17). Story frontmatter `baseline_commit: a8eda8b` (the 3.1 commit, now in main).

### File List

- `server/src/handlers.ts` (modified) — added `handleReveal` (exported) after `handleDeal`.
- `server/src/dispatch.ts` (modified) — imported `handleReveal`; added `case "revealAll"` (handleReveal + fanOut); shrank the default-stub comment + updated the SCOPE header.
- `server/src/project-state.test.ts` (modified) — added two Story 3.2 reveal-true tests (every-hand-present + constant-shape) and the `revealedTableWithHands` fixture helper.
- `server/src/table-server-reveal.do.test.ts` (new) — end-to-end DO integration test: happy-path reveal at allActed → showdown with all hands; pre-allActed → phase-illegal; non-Host → not-host; double-tap → stale-phase.

## Change Log

- 2026-06-22 — Story 3.2 implemented (review): `handleReveal` (allActed→showdown, revealed=true, phase-token consume) + `case "revealAll"` dispatch route + reveal-true SM-6 projection tests + end-to-end `table-server-reveal.do.test.ts`. Server 170 / client 82 green; lint/typecheck/build clean; SM-6 standing test 12/12. PURE projection unchanged (revealed branch pre-built); scope held to reveal-only (no resolution/UI/types change). RED-first confirmed (3 fail → pass).

## Review Findings

- [x] [Review][Defer] `projectStateFor` reveal branch can assign `entry.hand = undefined` for a hand-less seat [server/src/project-state.ts:61] — deferred, pre-existing (Story 1.4 code, NOT this diff). `if (revealed && round) entry.hand = round.hands[p.id]` iterates EVERY seat in `state.players`, but `dealRound` only populates `hands` for `isAlive` seats. Unreachable in 3.2 (eliminations only happen in `resolveShowdown` on the `showdown → roundResult` transition = Story 3.4, unwired — at `showdown`/`revealed` every seat is still alive with a hand), but the JSDoc constant-shape claim (project-state.ts:49–51) is not enforced by a guard. Becomes a real constant-shape break once Story 3.4 leaves eliminated seats in `players[]` while `revealed === true`. Add a `round.hands[p.id] !== undefined` guard (or omit the key) when 3.4 wires resolution.
