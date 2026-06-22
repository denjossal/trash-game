---
baseline_commit: 1b5e966
---

# Story 3.5: Eliminated — spectator, not a dead-end (play-confirmed bet)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a knocked-out Player,
I want to stay part of the table's energy after I lose my last Life,
so that I keep heckling and watching instead of staring at a dead-end screen.

## Acceptance Criteria

1. **AC-3.5.1 — The Eliminated surface is the real spectator surface (replaces the 1.9a stub).** When a Player reaches 0 Lives at a Showdown they are marked `isAlive=false` (already done — Story 3.4's resolve-at-reveal sets it permanently; eliminated seats are excluded from subsequent Deals by `dealRound`, which deals `isAlive` seats only). `client/src/surfaces/Eliminated.svelte` (currently the 1.9a copy stub) is fleshed into the real surface: it shows the warm tease copy `ELIMINATED` (`"You're out — stick around and heckle."`, ALREADY in copy.ts:86 — reuse verbatim, do NOT add a new string), framed as a sideline-spectator surface, NEVER a dead-end. The voice is warm/playful — never "Game over. You have been eliminated." (the banned "Don't" column). *(FR-11, UX-DR11, UX-DR16; EXPERIENCE.md:54,90,156-158.)*

2. **AC-3.5.2 — Non-punishing screen-reader announcement on the eliminated transition.** The surface carries an `aria-live` region that announces the elimination to a screen-reader user using the SAME warm copy verbatim (`ELIMINATED`), so SR users get the identical tone — never a punishing "you lost" string. Use `role="status"` + `aria-live="polite"` (NOT `assertive` — elimination is a calm sideline transition, not an urgent turn prompt; contrast YourTurn's `assertive` turn-announce). The announced text reuses the `ELIMINATED` constant; it is NOT a separate hardcoded string. *(NFR-10; review-accessibility.md:93-94 "the eliminated/spectator transition needs a non-punishing SR string matching the warm copy … reuse the warm copy verbatim for SR".)*

3. **AC-3.5.3 — Dimmed/spectator text meets the WCAG AA contrast floor.** The surface's body/subline text (the dimmed spectator treatment) MUST stay ≥4.5:1 against the deep-space purple background — use an existing AA-compliant token (`--color-on-surface` for the lead, `--color-on-surface-variant` `#d4c0d7` for the subline, the same split the stub already uses), NEVER a sub-floor custom dim. Do NOT introduce a new lower-contrast "eliminated grey" — the accessibility review flags dimmed states as the most likely AA failures. The eliminated Player must still comfortably READ the surface. *(NFR-10; DESIGN.md:126 "All text-on-background combinations must maintain WCAG AA"; review-accessibility.md:44-45.)*

4. **AC-3.5.4 — Spectator steady-state: no actions, keeps watching, skipped in turn order (REGRESSION-GUARD — already built upstream).** An eliminated Player gets NO Swap/Keep/Deal/Re-deal actions and is skipped in turn order. This is ALREADY TRUE via the router + engine and MUST NOT regress: `route-from-state.ts` routes an eliminated Player to `eliminated` for live phases (`!you.isAlive` at :56 overrides turns/waiting/roundResult), so they never reach `yourTurn` (no action buttons); and `nextAliveSeat` (engine.ts:88) skips `!isAlive` seats so an eliminated Player is never `currentTurnId`. The eliminated Player STILL watches the loud beat: the `phase === "showdown" || state.revealed` branch (route-from-state.ts:53) is evaluated BEFORE `:56`, so a knocked-out spectator still routes to `showdown` and watches every flip. NO change to `route-from-state.ts`, `nextAliveSeat`, or any server file — this AC is a standing-behavior guard, verified by re-passing the existing `route-from-state.test.ts` cases (:59-60, :116-132). *(UX-DR11; EXPERIENCE.md:157; route-from-state.ts:48/:53/:56; engine.ts:88-104.)*

5. **AC-3.5.5 — The eliminated Player is NOT dropped from the room.** An eliminated Player remains a connected seat in `players[]` (the server keeps eliminated seats in the array — Story 3.4: "resolution now leaves eliminated seats in `players[]`"); they keep receiving every projection (Waiting/Showdown/etc.) as a spectator. NO change to room membership, presence, or GC. (This is upstream behavior; the story neither adds nor removes it — stated so a reviewer need not re-derive it.) *(FR-11, UX-DR11; EXPERIENCE.md:157 "They are not dropped from the room".)*

6. **AC-3.5.6 — Render test + gates (client-only).** A new `client/src/surfaces/Eliminated.svelte.test.ts` (client-dom, mirroring `RoundResult.svelte.test.ts`/`Showdown.svelte.test.ts`): the surface renders the warm `ELIMINATED` copy; it exposes an `aria-live` status region carrying that warm copy (assert the live-region attribute + the warm text — never "Game over"/"eliminated"-style punishing copy); it renders NO Swap/Keep/Re-deal `<button>` (a spectator has no actions). The existing `route-from-state.test.ts` eliminated cases re-pass unchanged. Client `npm test` + `npm run lint` (GATE-1 egress / GATE-2 purity) + `npm run typecheck` (svelte-check 0 problems) + `npm run build` all green; RED-first confirmed (the new test fails against the bare stub — at minimum the aria-live assertion — before the surface is built out). NO server `npm test` change expected (no server files touched). *(NFR-2; testing standards below.)*

7. **AC-3.5.7 — Play-confirmed bet (the Decision #6 validation gate, not buildable code).** The spectator hypothesis is validated BY PLAY, not merely built-to-spec: a real eliminated player (a 9-year-old / a non-gamer) is observed to stay engaged — leaning in, calling the next loser — rather than disengage. This is a TIME-BOXED play-observation gate with an explicit pass criterion ("the eliminated player stays in the moment, not staring at a dead-end"), NOT an open-ended build clause and NOT a unit test. If the bet FAILS in play, raise a `correct-course` (the fallback is a simpler rest screen — EXPERIENCE.md:167 `[ASSUMPTION]`), do not silently expand scope. *(Decision #6; epics.md:155,783-785; EXPERIENCE.md:167 `[ASSUMPTION]` Eliminated-as-spectator "confirm in playtest that spectating beats a simpler dead-end".)*

## Tasks / Subtasks

- [x] **Task 1 — Flesh `Eliminated.svelte` into the real spectator surface** (AC: 1, 2, 3) — client
  - [x] In `client/src/surfaces/Eliminated.svelte`, replace the 1.9a STUB scope comment with a real Story-3.5 scope note (spectator surface; warm copy; non-punishing SR announce; reached for an eliminated Player on live phases AND a non-winner at `gameOver`).
  - [x] Keep reusing the `ELIMINATED` copy constant (copy.ts:86) verbatim. Keep the existing lead/subline visual split (`ELIMINATED.split(" — ")`) so the single source string stays the source of truth (UX-DR16) — do NOT inline a literal or add a new copy string.
  - [x] Add an `aria-live="polite"` `role="status"` region announcing the warm `ELIMINATED` copy to SR users (AC-3.5.2). CHOSE the "visible copy IS the live region" option (put `role="status" aria-live="polite"` on the `<main>` so the lead + subline are announced together as the one warm sentence — ONE source, no hidden duplicate that could drift). `polite`, not `assertive`.
  - [x] Contrast (AC-3.5.3): kept the lead in `--color-on-surface` and the subline in `--color-on-surface-variant` (both AA on the deep-space background). No new lower-contrast dim introduced — the stub's tokens already satisfy the floor; styles unchanged.
  - [x] Kept `Eliminated.svelte` a PURE props surface (`{ state }: { state: ProjectedTableState }`) — no store/socket import, no `sendIntent`, NO action button. The warm copy is state-independent so `state` stays unused (`void state;` kept).
- [x] **Task 2 — Tests (RED-first) + gates** (AC: 6)
  - [x] New `client/src/surfaces/Eliminated.svelte.test.ts` (client-dom, jsdom), cloning the `RoundResult.svelte.test.ts` harness (render + `state()` factory; gameOver-non-winner shape + a live-turn spectator case). Asserts: (a) the warm copy renders (lead + subline); (b) a `[role="status"][aria-live="polite"]` region carries that warm text; (c) NO `<button>` elements (a spectator has no actions); (d) the punishing "game over"/"you have been eliminated" tone is absent.
  - [x] Confirmed the existing `route-from-state.test.ts` eliminated cases (:59-60, :116-120, :124-126, :130-132) re-pass UNCHANGED — the router was not touched (AC-3.5.4 standing guard holds).
  - [x] Gates: client `npm test` (112, 14 files), `npm run lint` (GATE-1 + GATE-2 clean), `npm run typecheck` (svelte-check 0 problems / tsc 0), `npm run build` (PWA built) — all green. RED-first confirmed (the aria-live assertion failed against the bare stub before the live region was added). Server `npm test` 187/187 green (unaffected — no server files changed; one DO test flaked once then passed on re-run, see Debug Log).
- [x] **Task 3 — Play-confirmed bet gate (NON-CODE — record only)** (AC: 7)
  - [x] No code/unit test written for this. Recorded in Completion Notes that AC-3.5.7 is a time-boxed play-observation gate (Decision #6) — see Completion Notes for the pass criterion + fallback.

## Dev Notes

### What this story IS and is NOT

- **IS:** a CLIENT-ONLY surface story. Flesh the `Eliminated.svelte` 1.9a stub into the real spectator surface: warm `ELIMINATED` copy (reused), a non-punishing `aria-live` SR announcement matching that copy, an AA contrast floor on the dimmed text, and a render test. Plus the Decision-#6 play-confirmed-bet AC (a noted play-observation gate, not code).
- **IS NOT:** NOT a server change (the elimination itself — `isAlive=false`, exclusion from Deals, turn-skip — was ALL built by 3.1/3.4; this story consumes it). NOT a router change (`route-from-state.ts` already routes eliminated → `eliminated` and keeps them watching showdown — verified, not modified). NOT the Winner surface (Story 3.6). NOT a new copy string (`ELIMINATED` exists). NOT a live spectator roster/standings on the Eliminated surface (declined — the spectator watches the field thin via the Waiting/Showdown views they still receive; the Eliminated surface itself stays the calm warm-copy sideline). NOT a `types.ts`/contract change. NOT produced FX.

### The elimination machinery is already built — this story is the surface body only (read before Task 1)

Everything mechanical about elimination already exists upstream; do NOT rebuild it:
- **`isAlive=false` is set at resolution** — Story 3.4's resolve-at-reveal (`handleReveal` → `resolveShowdown`) deducts lives and marks `isAlive=false` for any Player at 0, leaving the eliminated seat IN `players[]`. Permanent; excluded from subsequent Deals (`dealRound` deals `isAlive` seats only — engine.ts:136,148). [3-4 Dev Notes; engine.ts:136,148.]
- **Turn-order skip** — `nextAliveSeat` (engine.ts:88-104) returns only `isAlive` seats, so an eliminated Player is NEVER `currentTurnId` → never routes to `yourTurn` → has no action buttons. No "disable the buttons" code is needed; the router simply never shows them. [engine.ts:88-104.]
- **Routing is complete** — `route-from-state.ts` (already built, Story 1.9a, confirmed for Epic 3): at `gameOver` a non-winner → `eliminated` (:48); the loud-beat branch (`showdown || revealed`, :53) is evaluated BEFORE the generic `!isAlive → eliminated` (:56), so an eliminated spectator STILL watches the flip; otherwise `!you.isAlive` overrides turns/waiting/roundResult → `eliminated` (:56). All of this is covered by existing `route-from-state.test.ts` cases. **Do NOT modify the router** — this story makes the surface it routes to real, nothing more.
- **`you.isAlive` is in the projection** — `projectStateFor` sets `you.isAlive` (project-state.ts:32) and per-seat `isAlive` (:57), value-free. The surface does not need to compute aliveness.

So the ONLY net-new artifact is the surface body + its test. Treat the rest as a regression guard (AC-3.5.4/.5): if a change here would alter routing or turn-order, it is out of scope and wrong.

### REUSE — do not reinvent

- **`ELIMINATED` copy constant** [copy.ts:86] — `"You're out — stick around and heckle."` Already exists, already the surface's source string. Reuse verbatim (UX-DR16 single-source voice). Do NOT add a new constant or inline a literal.
- **The `ELIMINATED.split(" — ")` lead/subline split** [Eliminated.svelte:15] — the existing visual split (heading = "You're out", subline = "stick around and heckle.") keeps the single copy string as the source of truth. Keep it.
- **`sr-only` + `role="status"`/`aria-live` pattern** [YourTurn.svelte:115-117,253; Waiting.svelte:32; Showdown.svelte:96-98; RoundResult.svelte:37] — the established SR live-region pattern across surfaces. Eliminated uses `aria-live="polite"` (calm transition), in contrast to YourTurn's `assertive` (urgent turn prompt). The `sr-only` class style lives in YourTurn:253 if a visually-hidden region is wanted; otherwise make the visible warm-copy element the live region (one source, no duplication).
- **Contrast tokens** [`--color-on-surface`, `--color-on-surface-variant: #d4c0d7`] — both AA-compliant on the deep-space purple background. The stub already uses them. Keep — do NOT introduce a custom dim (AC-3.5.3 / review-accessibility.md:44-45).
- **`RoundResult.svelte.test.ts` / `Showdown.svelte.test.ts`** — the client-dom test harness shape to clone (render + a `state()` factory + `@testing-library/svelte`). Eliminated is simpler (no store mock needed — no actions).

### Purity / boundary placement

- `Eliminated.svelte` is a PURE props surface — `{ state }: { state: ProjectedTableState }`, no store imports, no `sendIntent`, no action buttons. A spectator emits no intents, so there is NO client egress here (GATE-1 trivially satisfied — the surface never imports `table-store`/`socket`).
- The warm copy is state-independent (the same line for any eliminated player), so the surface MAY ignore `state` entirely (keep or drop the stub's `void state;`). It does NOT need to read `winnerIds`/`loserIds`/roster — that is the Winner surface (3.6) and the declined live-roster option.

### Phase machine / routing (no change — the guard)

```
… resolution (Story 3.4) marks isAlive=false for any Player at 0 lives …
route-from-state.ts:
  gameOver + not in winnerIds      -> eliminated      (:48)   ← terminal non-winner
  showdown || revealed             -> showdown        (:53)   ← eliminated STILL watches the flip (wins over :56)
  !you.isAlive                     -> eliminated      (:56)   ← live-phase spectator (overrides turns/waiting/roundResult)
```
`Surface` union already names `"eliminated"` (route-from-state.ts:22); `App.svelte:44-45` already renders `<Eliminated state={state!} />`. NO router/App/types change. This story only changes what `Eliminated.svelte` renders.

### Previous story intelligence

- **3.4 (review, baseline)** is the PRODUCER that set `isAlive=false`, kept eliminated seats in `players[]`, populated `winnerIds` at `gameOver`, and confirmed the router precedence (gameOver :48 > revealed :53 > eliminated :56). 3.4's Dev Notes explicitly scoped "the Eliminated surface body (Story 3.5 — `isAlive=false` is set here; the surface is 3.5)" to THIS story. The hand-less-seat projection guard (AC-3.4.8) means an eliminated seat in a revealed projection OMITS its `hand` — the Showdown surface (which the spectator watches) renders that seat face-down defensively. No action needed here; just don't break it.
- **3.3 (done, merged)** built the Showdown surface the eliminated spectator still watches; its spectator-no-seat guard (a `you.playerId` mapping to no seat) is already handled there. The Eliminated surface is even simpler (state-independent warm copy).
- **1.9a/1.9b (done)** created the `Eliminated.svelte` stub + the router + the `ELIMINATED` copy constant. The stub's lead/subline split + AA tokens are the foundation to keep.
- TDD discipline (RED-first) confirmed productive across 3.1-3.4 — mirror it (Task 2 test RED before Task 1 builds out the aria-live region / removes the bare-stub gap).

### Git intelligence

- `1b5e966` (HEAD, branch `story/3-4-...`) — Story 3.4 (resolve-at-reveal producer + one-tap re-deal + code review). This story's baseline. (3.4 is at `review`; 3.5 builds on its branch tip — the elimination producer must exist for the eliminated surface to be reachable in a real game.)
- Pattern across 3.1-3.4: each story clones the prior surface/test harness. `Eliminated.svelte.test.ts` clones the `RoundResult.svelte.test.ts`/`Showdown.svelte.test.ts` client-dom harness — continue exactly this.

### Testing standards

- **Client `client-dom` (`*.svelte.test.ts`, jsdom):** new `Eliminated.svelte.test.ts` — render the warm copy; assert the `aria-live`/`role="status"` region carries it; assert NO action `<button>` and NO punishing copy. Clone `RoundResult.svelte.test.ts` (no store mock needed — Eliminated has no `sendDealAgain`/intent).
- **Client `client-node` (`*.test.ts`, node):** the existing `route-from-state.test.ts` eliminated cases re-pass UNCHANGED (the AC-3.5.4 standing guard). Do NOT add new router cases — the routing is already exhaustively tested; this story does not change it.
- **No server tests:** no server file is touched. Run server `npm test` only to confirm no accidental coupling (it should be unchanged from 3.4's 183).
- RED-first; client baseline ≈ 104 (3.4). The Eliminated test is net-new (~1 file, a few cases). jsdom can render the surface fully (no @media/keyframes caveat — there's no animation here).

### Project Structure Notes

- **Client (UPDATE):** `surfaces/Eliminated.svelte` (stub → real spectator surface: scope comment, aria-live region, confirm AA tokens). **NEW test:** `surfaces/Eliminated.svelte.test.ts`.
- **No change:** `route-from-state.ts`, `App.svelte`, `lib/copy.ts` (ELIMINATED exists), any server/shared file, `types.ts`. If the dev finds themselves editing the router, the engine, or adding a copy string, STOP — that is out of scope (the machinery is upstream).
- Aligns with architecture boundaries: `client/src/surfaces` = routed surfaces (pure props components), `client/src/lib/copy.ts` = single-source voice (reuse only). No structural variance.

### References

- [Source: epics.md#Story 3.5 (lines 767-785)] — the 3 ACs: Eliminated surface + warm copy + `isAlive=false` permanent/excluded; keeps Waiting/Showdown as spectator, no actions, skipped in turn order; play-confirmed bet (Decision #6).
- [Source: epics.md:83 (UX-DR11)] — route to spectator state, warm copy, keeps Waiting/Showdown, no actions, skipped in turn order, never a dead-end. [Source: epics.md:155 (Decision #6)] — Eliminated = play-confirmed bet, validated-by-play. [Source: epics.md:667 (Epic 3 binding decisions)] — #6 Eliminated play-confirmed.
- [Source: EXPERIENCE.md:31,54,90,156-158,167] — Eliminated = spectator (still sees Waiting/Showdown, can't act); warm "Do" copy vs banned "Don't"; Flow 5 (heckle from the sidelines, climax = stays part of the energy, not a dead-end); `[ASSUMPTION]` confirm-in-playtest tag (the bet + its fallback).
- [Source: review-accessibility.md:44-45,93-94] — dimmed eliminated/spectator text is a likely AA failure (keep ≥4.5:1); the eliminated/spectator transition needs a NON-PUNISHING SR string MATCHING the warm copy, reused verbatim.
- [Source: DESIGN.md:17,113,124,126] — `--color-on-surface-variant: #d4c0d7`; deep-space purple background; all text WCAG AA; warm/good-natured voice (teases, never punishes).
- [Source: client/src/surfaces/Eliminated.svelte] — the 1.9a stub to flesh out (lead/subline split, AA tokens, `void state`).
- [Source: client/src/lib/copy.ts:85-86] — `ELIMINATED` constant (reuse verbatim; do NOT add a string).
- [Source: client/src/route-from-state.ts:22,48,53,56] — the `Surface` union (`"eliminated"` named); the three routing branches (gameOver-non-winner / showdown-or-revealed-wins / `!isAlive`-spectator). DO NOT modify.
- [Source: client/src/route-from-state.test.ts:59-60,116-132] — the existing eliminated routing cases that must re-pass (AC-3.5.4 guard).
- [Source: client/src/surfaces/YourTurn.svelte:115-117,253] — the `sr-only` + `role="status"`/`aria-live` pattern (Eliminated uses `polite`, not YourTurn's `assertive`). [Source: client/src/surfaces/RoundResult.svelte.test.ts; Showdown.svelte.test.ts] — the client-dom test harness to clone.
- [Source: server/src/rules/engine.ts:88-104 (nextAliveSeat), :136,148 (dealRound deals isAlive only)] — the turn-skip + Deal-exclusion machinery (REUSE/standing — no change). [Source: server/src/project-state.ts:32,57] — `you.isAlive` / per-seat `isAlive` already projected.
- [Source: client/src/App.svelte:44-45] — `<Eliminated state={state!} />` already wired in the render chain (no change).

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (1M context) — `us.anthropic.claude-opus-4-8[1m]`

### Debug Log References

- Baseline (green): client 104 (3.4), server 187 (3.4 branch tip — already includes the 3.4 DO tests).
- RED-first confirmed: the new `Eliminated.svelte.test.ts` aria-live assertion FAILED against the bare 1.9a stub (`container.querySelector('[aria-live]')` was null) — 1 failed / 3 passed — before the `role="status" aria-live="polite"` region was added; GREEN (4/4) after.
- Final gates (all green): client `npm test` 112 (14 files), `npm run typecheck` (svelte-check 199 files 0 errors / 0 warnings, tsc 0), `npm run lint` (eslint clean — GATE-1 egress + GATE-2 purity), `npm run build` (PWA built, sw.js generated). Server `npm test` 187/187.
- FLAKE NOTE (not a regression): one server `.do.test.ts` (`@cloudflare/vitest-pool-workers`) reported a single failure on the first full-suite run, then passed on two subsequent runs (187/187). No server file was touched by this story (client-only), so this is the known timing-flakiness of the workers-pool integration env, unrelated to 3.5.

### Completion Notes List

- **Eliminated surface (Task 1, AC-3.5.1/.2/.3):** `Eliminated.svelte` fleshed from the 1.9a copy stub into the real spectator surface. The warm `ELIMINATED` line (`"You're out — stick around and heckle."`, copy.ts:86) is REUSED verbatim, kept as the lead/subline visual split (`ELIMINATED.split(" — ")`) so the single voice string stays the source of truth. The `<main>` itself carries `role="status" aria-live="polite"` so a screen-reader user hears the SAME warm sentence (matching tone, never a punishing string — review-accessibility.md:93-94); `polite` because elimination is a calm sideline transition, not the `assertive` urgency of YourTurn's turn-announce. Making the visible copy the live region keeps ONE source — no hidden duplicate that could drift. Contrast floor (AC-3.5.3) held by keeping the existing AA tokens (`--color-on-surface` lead, `--color-on-surface-variant` subline); no new sub-floor dim. The surface stays a PURE props component with NO store import and NO action button.
- **Spectator steady-state (Task 1, AC-3.5.4/.5):** verified upstream-built and NOT regressed — `route-from-state.ts` (untouched) routes an eliminated Player to `eliminated` at live phases (:56) and at gameOver-non-winner (:48) while the `showdown||revealed` branch (:53) still wins so they keep watching the flip; `nextAliveSeat` (untouched) skips `!isAlive` seats so an eliminated Player never becomes `currentTurnId` → never routes to `yourTurn` → has no buttons; eliminated seats stay in `players[]` (set by 3.4). The four existing `route-from-state.test.ts` eliminated cases re-pass unchanged. No server/router/types change.
- **Tests (Task 2, AC-3.5.6):** new `Eliminated.svelte.test.ts` (4 cases, client-dom) cloning the RoundResult harness — warm copy renders, the aria-live=polite status region carries it, no action buttons, the banned "game over"/"you have been eliminated" tone is absent, and the same warm surface renders for a live-phase spectator (not only at gameOver). RED-first confirmed.
- **Play-confirmed bet (Task 3, AC-3.5.7) — NON-CODE GATE (Decision #6):** the spectator hypothesis is validated BY PLAY, not by a test. To be run in a live session with a real eliminated player (a 9-year-old / a non-gamer); **pass criterion:** the eliminated player stays engaged — leaning in, calling the next loser — rather than disengaging or staring at a dead-end. This is a time-boxed play-observation gate, NOT an open-ended build clause. **On failure:** raise `correct-course`; the documented fallback is a simpler rest screen (EXPERIENCE.md:167 `[ASSUMPTION]`). The code build is complete (Tasks 1-2 + gates green); this bet is validated separately in play and is NOT a blocker on the code's "review" status.

### File List

**Client (UPDATE)**
- `client/src/surfaces/Eliminated.svelte` — 1.9a stub → real spectator surface (Story-3.5 scope comment; `role="status" aria-live="polite"` live region on `<main>`; warm `ELIMINATED` copy reused; AA tokens kept; pure props, no buttons).

**Client (TEST)**
- `client/src/surfaces/Eliminated.svelte.test.ts` — NEW (4 cases: warm copy / aria-live-polite status region / no action buttons / live-phase spectator).

## Change Log

- 2026-06-22 — Story 3.5 implemented (Eliminated spectator surface, client-only): fleshed `Eliminated.svelte` from the 1.9a stub into the real sideline-spectator surface — warm `ELIMINATED` copy reused verbatim, a non-punishing `role="status" aria-live="polite"` SR announcement matching that copy, AA contrast tokens held, pure props with no actions. The elimination machinery (isAlive=false, turn-skip via `nextAliveSeat`, routing) was all built upstream (3.1/3.4) and verified not regressed (existing `route-from-state.test.ts` eliminated cases re-pass). New `Eliminated.svelte.test.ts` (4 cases). AC-3.5.7 is a Decision-#6 play-confirmed bet recorded as a non-code play-observation gate. Tests: client 104→112; server 187 unaffected. Lint/typecheck/build green. RED-first confirmed.
