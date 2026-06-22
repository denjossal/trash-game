---
baseline_commit: c39fb78
---

# Story 3.4: Round Result, Lives & one-tap Re-deal

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Host,
I want Lives to tick down clearly and a single tap to start the next Round,
so that the game keeps moving toward a winner with the Loser starting the next hand.

## Acceptance Criteria

1. **AC-3.4.1 — Resolution at reveal (the producer 3.3 consumes).** `handleReveal` (server/src/handlers.ts), after flipping `round.revealed = true`, NOW also calls the pure `resolveShowdown` (Story 3.1) and applies its result: each Loser's `lives` deducted by exactly one (ties deduct from EVERY tied Loser), `isAlive=false` for any Player at 0, and the phase advances to `roundResult` (≥2 alive) or `gameOver` (≤1 alive) per the win-check. The resolved `loserIds` (always) and `winnerIds` (on the terminal outcome) are stored on `TableState` and projected. The `round` is KEPT (not cleared) so `revealed === true` and every hand stays projectable through the beat. *(FR-10, FR-11, FR-12, AR-10; architecture.md#D6 419–435; resolve-at-reveal decision — see Dev Notes "Resolution timing".)*

2. **AC-3.4.2 — `loserIds`/`winnerIds` carried durably & projected.** Add `loserIds?: string[]` and `winnerIds?: string[]` to `TableState` (shared/src/types.ts) AND to the persisted durable summary (server/src/persistence.ts — `toSummary` / `reconcileSummaryToState`), so a DO reload at `roundResult`/`gameOver` still shows the pips and the loser/winner. `projectStateFor` emits `state.loserIds`/`state.winnerIds` (omit-when-absent), and the `_beats` `satisfies` scaffold (project-state.ts:103–107) is REMOVED (the real producer now structurally sets these fields). *(architecture.md#ProjectedTableState 615–628; deferred-work.md — _beats scaffold "remove once a real producer sets these".)*

3. **AC-3.4.3 — The revealed beat surface (Showdown) gains the Host Re-deal affordance.** Because resolution keeps `round` (so `revealed === true`), `route-from-state.ts` routes the resolved `roundResult`/`gameOver` projection to the SHOWDOWN surface (the `phase === "showdown" || state.revealed` branch wins, as built). The Showdown surface (client/src/surfaces/Showdown.svelte) therefore carries the full loud beat: the flip + loser highlight (already built, 3.3) PLUS — when `≥2` alive (phase `roundResult`) — a Host-only Re-deal action and a non-Host "waiting to re-deal" line. The Re-deal affordance is ABSENT on `gameOver` (terminal — Winner is Story 3.6) and absent for non-Hosts. (Note the router precedence: the `gameOver` branch at route-from-state.ts:48 is evaluated BEFORE the `revealed` branch at :53, so a `gameOver` projection — even with `revealed === true` — routes to `winner`/`eliminated`, NEVER to Showdown. The flip + loser-highlight beat is therefore NOT shown at `gameOver`; those terminal surfaces are Stories 3.6/3.5, not built here. This is correct, not a missing beat.) *(FR-11, UX-DR10, UX-DR14; route-from-state.ts:48/:53; merge-of-beat decision — see Dev Notes "Router contract".)*

4. **AC-3.4.4 — Lives pips tick down with a brief, reduce-motion-safe animation.** `LivesPips.svelte` (client/src/components/) gains a brief enter animation on the newly-spent pip when a Player's `lives` decreases. NOTE the existing markup: the component renders TWO separate keyed `{#each}` blocks — `Array(filled)` discs (keys `f${i}`) and `Array(hollow)` rings (keys `h${i}`) — so a life loss does NOT mutate one element from disc→ring; Svelte REMOVES the last filled `<span>` and ADDS a hollow `<span>`. The animation therefore plays on the appearing hollow pip (a brief CSS enter animation on `.pip.hollow`), NOT a disc→ring morph on a persistent element (which the markup cannot produce). Under `prefers-reduced-motion: reduce` the animation is skipped (the pip appears instantly) — the SAME pure-CSS `@media` pattern as Button.svelte/Showdown.svelte (no JS `matchMedia`). The shape difference (disc vs ring) is the cue, never color alone (NFR-10). The pips appear wherever `LivesPips` is already used (Lobby/Waiting + the revealed beat). *(FR-11, UX-DR10, UX-DR15, NFR-6, NFR-10; DESIGN.md 179–182 "brief animation on Life loss".)*

5. **AC-3.4.5 — `dealAgain` handler: one-tap re-deal, Loser starts.** A new `handleDealAgain` (server/src/handlers.ts), cloning the `handleDeal`/`handleReveal` accepted-path chokepoint, accepts the Host's `dealAgain` (payload `{phaseToken}`) ONLY when `phase === "roundResult"`: it deals the surviving Players (eliminated excluded), with the Starting Player = the Loser of the round just resolved (the `nextStartingPlayerId` the resolution computed via the Story-3.1 tiebreak; if that Loser was eliminated, the next surviving seat to the right). It clears the prior round's `loserIds`/`winnerIds`, builds the new round via `dealRound`, lands in `turns`, bumps the phase token, and persists. `dispatch.ts` adds `case "dealAgain"` (handler + `fanOut`), removing `dealAgain` from the not-yet-implemented `default` stub. *(FR-12, FR-5, AR-6; epics.md#Story 3.4; architecture.md#Phase 588.)*

6. **AC-3.4.6 — Re-deal is exactly one action, offered ONLY at `≥2` alive (E1).** The Re-deal is a single Host tap — NO re-setup, NO re-joining (it reuses the Deal flow's `dealRound`). It is offered ONLY when `≥2` Players are alive: the `roundResult` phase is itself the `≥2`-alive branch (the win-check sent `≤1` alive to `gameOver`, never `roundResult`), so `dealAgain` at `gameOver` is rejected `phase-illegal`. A Round can NEVER start with `<2` Players. *(Edge-case sweep E1; epics.md:763–765.)*

7. **AC-3.4.7 — server-authority rejections (clone the chokepoint).** `handleDealAgain` mirrors the `handleDeal` order exactly: shape guard (non-finite `phaseToken` → `phase-illegal`) → `table === null` → `phase-illegal` → non-Host → `not-host` → `checkPhaseToken` (stale/double-tap → `stale-phase`) → phase gate (`!== "roundResult"` → `phase-illegal`) → mutate → `bumpPhaseToken` → `persistSummary`. NO new `ErrorReason` code (the union is frozen). `handleDealAgain` throws `IntentError` (handler boundary), never the plain `Error` of the pure engine. *(NFR-2, NFR-5; handlers.handleDeal order; types.ts ErrorReason frozen.)*

8. **AC-3.4.8 — hand-less-seat projection guard (close deferred-work).** Because resolution now leaves eliminated seats in `players[]` while `revealed === true`, `projectStateFor` MUST guard the reveal-branch assignment so an eliminated/hand-less seat does NOT get `entry.hand = undefined` (a constant-shape breach): `const h = round.hands[p.id]; if (h) entry.hand = h;` (project-state.ts:61). The Showdown surface already renders such a seat defensively face-down (3.3) — this closes the server half so the key is genuinely OMITTED for hand-less seats. *(deferred-work.md story-1.4/story-3.2 — project-state.ts:61/:56 reveal-true undefined-hand; AC4 constant-shape.)*

9. **AC-3.4.9 — end-to-end DO integration test + gates.** A new `server/src/table-server-deal-again.do.test.ts` (mirroring `table-server-reveal.do.test.ts`) drives the real wire path: deal → every seat acts → `allActed` → Host `revealAll` → the resolved projection arrives at every device with `phase` = `roundResult`, `revealed === true`, `loserIds` set, and the loser's `lives` decremented by one → Host `dealAgain` → a new `turns` round with `currentTurnId` = the resolved Loser. Plus rejections: a non-Host `dealAgain` → `not-host`; a double-tapped `dealAgain` → `stale-phase`; a `dealAgain` from a non-`roundResult` phase → `phase-illegal`; a `gameOver` outcome (drive a table to ≤1 alive) offers NO re-deal (the projection routes to winner/eliminated, not a Re-deal). The standing SM-6 `project-state.test.ts` re-passes (incl. the hand-less-seat omission case). server `npm test` + client `npm test` + lint (GATE-1 egress / GATE-2 purity) + typecheck + build all green; RED-first confirmed.

## Tasks / Subtasks

- [x] **Task 1 — Wire `resolveShowdown` into `handleReveal` (the resolution)** (AC: 1, 2, 8)
  - [x] In `handleReveal` (handlers.ts), AFTER the existing flip (`round.revealed = true`), call `resolveShowdown(host.table.players, host.table.round.hands, host.table.round.startingPlayerId)`. The previous-Starting-Player arg is `round.startingPlayerId` (the round being resolved).
  - [x] Apply the result: `host.table.players = result.players` (the NEW array with lives deducted + eliminations); set `host.table.loserIds = result.loserIds`.
  - [x] Branch on `result.outcome.kind`: `"winner"` → `host.table.phase = "gameOver"`, `host.table.winnerIds = result.outcome.winnerIds`; `"continue"` → `host.table.phase = "roundResult"`, stash `result.outcome.nextStartingPlayerId` so `dealAgain` can use it (carry it on the round, e.g. keep `round` and read it back, OR store a `nextStartingPlayerId` on TableState — see Dev Notes "Carrying the next starter").
  - [x] KEEP `host.table.round` (do NOT null it) — `revealed` must stay true so the beat shows hands + highlight. Clear `loserIds`/`winnerIds` only at the NEXT `dealAgain`/`newGame` (Task 4).
  - [x] Update `handleReveal`'s mutation step + its SCOPE comment block: it NO LONGER stops at `showdown` — it resolves through to `roundResult`/`gameOver`. (The transient `showdown` phase value is now internal-only; the wire never rests there because resolution is synchronous in the same handler. Note this in the comment so a reader isn't surprised the `showdown` literal is "skipped".)
  - [x] Guard project-state.ts:61: `const h = round.hands[p.id]; if (h) entry.hand = h;` (AC-3.4.8).
- [x] **Task 2 — Contract + persistence carrier for the result** (AC: 2)
  - [x] `shared/src/types.ts`: add `loserIds?: string[]` and `winnerIds?: string[]` to `TableState` (the server-only state). They are between-round result fields (live in `roundResult`/`gameOver`).
  - [x] `server/src/persistence.ts`: add both to the persisted `DurableSummary` shape + `toSummary` (write) + `reconcileSummaryToState` (read on wake), so a reload at `roundResult`/`gameOver` restores them. Decide the D2.1 wake-coercion interaction: a coerced lost-round wake lands in `roundResult` (round=null) — the persisted `loserIds`/`winnerIds` (if any) should survive; if none were persisted the surface simply shows no highlight (acceptable).
  - [x] `server/src/project-state.ts`: emit `if (state.loserIds) projection.loserIds = state.loserIds;` and the same for `winnerIds` (omit-when-absent). REMOVE the `_beats` `satisfies` scaffold (lines 103–107) + its `void _beats;` — the real producer now structurally consumes the two fields.
- [x] **Task 3 — `LivesPips` tick-down animation** (AC: 4) — client
  - [x] Add a brief, reduce-motion-safe CSS ENTER animation to `client/src/components/LivesPips.svelte` on the appearing hollow pip (`.pip.hollow`). DO NOT try to morph a single element disc→ring: the component renders two separate keyed `{#each}` blocks (`Array(filled)` / `Array(hollow)`), so a life loss removes a filled `<span>` and adds a hollow `<span>` — there is no persistent element to transition. The natural fit is a short keyframe on the entering `.pip.hollow` (e.g. a brief scale/opacity settle). Pure-CSS `@media (prefers-reduced-motion: reduce) { animation: none; }` — mirror Button.svelte / Showdown.svelte; NO JS matchMedia. NFR-10: the cue is shape (disc vs ring), never color alone.
  - [x] Keep `LivesPips` a pure props component (`{ lives, startingLives }`) — the animation triggers structurally from the `lives` prop changing across projections (one fewer filled pip → one more hollow pip rendered); do NOT restructure into a single per-pip array or add component state, which would risk the Lobby/Waiting reuse.
- [x] **Task 4 — `handleDealAgain` + dispatch route** (AC: 5, 6, 7)
  - [x] Add `handleDealAgain(host, intent, callerPlayerId)` to handlers.ts, cloning the `handleDeal`/`handleReveal` accepted-path order (Task signature uses `Extract<Intent, { type: "deal" | "revealAll" | "dealAgain" | "newGame" }>` — same grouped-member extract as handleDeal:336/handleReveal:429).
  - [x] Phase gate: `host.table.phase !== "roundResult"` → `phase-illegal` (this is also the `≥2`-alive guard, AC-3.4.6 — `gameOver` never reaches here).
  - [x] Derive the alive Starting Player = the `nextStartingPlayerId` resolved at reveal (read it from wherever Task 1 stashed it). Defense-in-depth: `dealRound` already asserts an alive/seated starter (3.1 hardening), so a stale/eliminated id throws rather than silently mis-seats.
  - [x] Mutate: clear `host.table.loserIds`/`winnerIds`; `host.table.round = dealRound(alivePlayers, DEAL_COMPOSITION, cryptoRng(), startingPlayerId)`; `host.table.phase = "turns"`. Deal only surviving players (eliminated excluded — `dealRound` already deals `isAlive` seats only).
  - [x] `bumpPhaseToken` → `persistSummary`. Throw `IntentError`, never plain `Error`.
  - [x] `dispatch.ts`: add `case "dealAgain": { await handleDealAgain(host, intent, connection.state?.playerId); fanOut(host.connections(), host.table!); return; }` (the exact `case "deal"`/`case "revealAll"` shape). Remove `dealAgain` from the `default`-stub comment list (leaving `newGame`/`hostRemovePlayer`/`hostReassign`). Update the SCOPE header.
- [x] **Task 5 — The Host Re-deal affordance on the revealed beat** (AC: 3) — client
  - [x] In `client/src/surfaces/Showdown.svelte`, add a Host-only Re-deal block shown ONLY when the phase is `roundResult` (i.e. `≥2` alive, re-dealable): if `state.you.isHost` → a primary `<Button>` (the RE_DEAL copy) that calls `sendDealAgain(state.phaseToken)`; else a "waiting to re-deal" line (WAITING_TO_REDEAL copy). Absent on `gameOver` (the projection routes to winner/eliminated, never here). Mirror the Lobby conductor's inline Host-only block (`{#if isHost}`) — the shared conductor-bar COMPONENT is Story 4.1, NOT this story.
  - [x] Add `buildDealAgainIntent(phaseToken)` to `client/src/socket.ts` (mirror `buildHostSetLivesIntent`; use the grouped-member Extract caveat) and `sendDealAgain(phaseToken)` to `client/src/lib/table-store.svelte.ts` (mirror `sendHostSetLives`: guard `liveSocket !== null`, call `sendIntent`). This is the FIRST client phase-conducting send builder — establish it cleanly.
  - [x] Add the new copy constants to `client/src/lib/copy.ts` (e.g. `RE_DEAL = "Re-deal"`, `WAITING_TO_REDEAL = "Waiting to re-deal…"`) annotated with Story 3.4. Keep the warm voice; the previous-Loser-starts-next framing per UX-DR10/EXPERIENCE.md:89 may colour the copy. (The RoundResult.svelte stub stays the round=null/coerced fallback — it is NOT the primary beat surface; do not move the flip/highlight there.)
- [x] **Task 6 — Tests (RED-first) + gates** (AC: 9)
  - [x] DO integration: new `server/src/table-server-deal-again.do.test.ts`, cloning `table-server-reveal.do.test.ts` (openConn/nextPhase/nextTurn/nextErrorReason/lobbyOf/deal). Happy path (heads-up + a ≥3 case): deal → act → revealAll → assert `roundResult` + `revealed` + `loserIds` + loser `lives` decremented → `dealAgain` → new `turns` with `currentTurnId` = resolved loser. Rejections: non-Host `dealAgain` → `not-host`; double-tap → `stale-phase`; wrong-phase → `phase-illegal`; a `gameOver` drive (table to ≤1 alive) → projection routes terminal, no re-deal.
  - [x] Unit: extend `project-state.test.ts` — a revealed projection with an eliminated/hand-less seat OMITS that seat's `hand` key (AC-3.4.8); a projection with `state.loserIds`/`winnerIds` set emits them. Do NOT re-test `resolveShowdown` (3.1 owns it exhaustively — no forward-bind, epics.md:692).
  - [x] Client unit: `socket.ts` `buildDealAgainIntent` shape test (pure `*.test.ts`); store `sendDealAgain` seam if the file has a test. `Showdown.svelte.test.ts` (client-dom): Host sees the Re-deal button at `roundResult` and a tap calls the send; non-Host sees "waiting to re-deal"; neither appears at `gameOver`. `LivesPips.svelte.test.ts`: the hollow pip carries the enter-animation hook/class (jsdom can't eval @media or keyframes — assert the structural class on `.pip.hollow`, Button/Showdown precedent).
  - [x] Gates: server `npm test`, client `npm test`, `npm run lint` (GATE-1 + GATE-2), `npm run typecheck`, `npm run build` — all green; SM-6 `project-state.test.ts` re-passes. Confirm RED before GREEN.

## Dev Notes

### What this story IS and is NOT

- **IS:** the PRODUCER that closes the core loop. Server: wire `resolveShowdown` into `handleReveal` (resolve-at-reveal), carry `loserIds`/`winnerIds` durably, project them, add `handleDealAgain` + dispatch route, guard the hand-less-seat projection. Client: the LivesPips tick-down animation, the Host Re-deal affordance on the revealed beat (Showdown surface), the first `dealAgain` send builder + store seam, the new copy.
- **IS NOT:** any change to the PURE `resolveShowdown`/`dealRound`/`nextAliveSeat` (REUSE only — 3.1 built + hardened them). NOT the Winner surface body (Story 3.6 — this story only sets `winnerIds` + lands `gameOver`). NOT the Eliminated surface body (Story 3.5 — `isAlive=false` is set here; the surface is 3.5). NOT the `newGame` intent (3.6). NOT the shared conductor-bar component (Story 4.1 / UX-DR14 — build the Re-deal as an inline Host-only block). NOT produced FX (v1.1). NOT a new `ErrorReason` code (frozen).

### Resolution timing — RESOLVED: resolve-at-reveal (read before Task 1)

The phase machine names `showdown --(resolution)--> roundResult | gameOver` as server-internal [types.ts:32; architecture.md#587]. Story 3.2 deliberately stopped `handleReveal` at `showdown` (loserIds unset), deferring resolution here. **Decision (user-confirmed): resolution runs INSIDE `handleReveal`, synchronously in the same transition as the flip.** So `revealAll` now flips `revealed=true` AND resolves: lives deducted, eliminations marked, `loserIds`/`winnerIds` set, phase lands at `roundResult` (≥2 alive) or `gameOver` (≤1). The `round` is KEPT so `revealed` stays true and every hand + the loser highlight render on the beat. Consequence: the wire never rests at the `showdown` phase literal — it is now a transient internal value (the flip beat is shown on a `roundResult`/`gameOver` projection that still carries `revealed:true`). The 3.3 Showdown surface, built as a CONSUMER of `state.loserIds`, lights up automatically now that the producer sets it.

### Router contract — RESOLVED: the revealed beat = Showdown surface; Re-deal lives there

`route-from-state.ts` evaluates `if (phase === "showdown" || state.revealed) return "showdown";` (line 53) BEFORE the `roundResult` branch (line 59). With resolve-at-reveal, a resolved `roundResult` projection still has `revealed === true` (round kept), so **it routes to the SHOWDOWN surface** — by design. The `gameOver` branch (line 48) is evaluated EARLIER STILL, so the terminal outcome short-circuits to `winner`/`eliminated` BEFORE the `revealed` branch can fire: a `gameOver` projection — even carrying `revealed === true` (round kept) — does NOT route to Showdown, so the flip + loser-highlight beat is deliberately absent at `gameOver` (the Winner/Eliminated surfaces own the terminal beat — Stories 3.6/3.5). This is the correct precedence, not a missing beat; do not "fix" it by reordering the router. **Decision (user-confirmed): the full loud beat (flip + loser highlight + Lives pips tick + Host Re-deal / others "waiting to re-deal") lives on the Showdown surface while `revealed === true`.** `dealAgain` clears the round → `revealed:false` → the next deal lands in `turns`. The `RoundResult.svelte` surface remains the fallback for a `roundResult` projection with `round === null` (the D2.1 wake-coercion case + any future cleared-round path); it is NOT the primary beat surface and stays minimal. Do NOT change `route-from-state.ts` (the reveal-branch-gating option was declined — keep the router as-built; this also means the `roundResult` surface is reached only via round=null). This honors "keep Showdown/RoundResult separate" at the phase/router level while the player-facing beat is unified on the revealed Showdown projection.

> Reviewer note (precedence): this resolves deferred-work.md story-1.9a item route-from-state.ts:53 ("`revealed` short-circuits to showdown for ANY phase") by DESIGN — the short-circuit is intentional and correct here (the revealed beat IS the result beat). It also satisfies the route-from-state.ts:48 deferred item: `winnerIds` is now populated at `gameOver`, so the real winner no longer routes to `eliminated`.

### Carrying the next starter (Task 1 ↔ Task 4 handoff)

`resolveShowdown`'s `continue` outcome carries `nextStartingPlayerId`. `handleDealAgain` (a separate intent/handler) needs it. Two clean options — pick one and document it:
- **(a) Keep it on the kept `round`:** since the round is kept through `roundResult`, store the next starter on it (e.g. reuse/repurpose a field, or read `round.startingPlayerId` — but that is the PREVIOUS starter, so a distinct field is clearer). 
- **(b) Store on `TableState`:** add a transient `nextStartingPlayerId?` alongside `loserIds`/`winnerIds`, cleared on `dealAgain`. Symmetric with the result carrier; survives reload if persisted.
Prefer (b) for symmetry with the durable result fields and so a reload at `roundResult` can still re-deal correctly. (If not persisted, a reload would lose the next starter — then `dealAgain` must recompute via the tiebreak, which needs the loser set + previous starter; persisting it is simpler.)

### REUSE — do not reinvent

- **`resolveShowdown(players, hands, previousStartingPlayerId)` → `ShowdownResult`** [engine.ts:304] — the pure resolver. Returns `{ loserIds, players (NEW, lives deducted + isAlive marked), outcome: {kind:"winner";winnerIds} | {kind:"continue";nextStartingPlayerId} }`. Inputs never mutated. Self-asserts (unknown prev starter / no hands) — pass `round.hands` + `round.startingPlayerId`. Do NOT re-implement loser-finding/lives/win-check/tiebreak.
- **`dealRound(players, composition, rng, startingPlayerId)` → `Round`** [engine.ts:125] — the round builder. Deals `isAlive` seats only (eliminated excluded — exactly FR-11). Self-asserts deck coverage + alive/seated starter (3.1 Action-4 hardening, added FOR this story's `dealAgain`). `handleDeal` calls it with `cryptoRng()` + `DEAL_COMPOSITION`; clone that.
- **`handleDeal` accepted-path chokepoint** [handlers.ts:331] + **`handleReveal`** [handlers.ts:424] — the precedent `handleDealAgain` clones; the resolution wiring extends `handleReveal`. Copy the order, the shape guard, the `Extract<Intent,{...}>` parameter comment.
- **`checkPhaseToken`/`bumpPhaseToken`** [validate.ts:53,67], **`assertDealable`** [validate.ts:88], **`persistSummary`**, **`fanOut`** — the established guard/mutate/bump/persist/fan-out primitives. NO new guard mechanism.
- **`LivesPips.svelte`** [client/src/components/] — already renders disc/ring pips (shape not color, numeral ≥4). Reused by Lobby/Waiting. Add ONLY the tick-down animation; keep it a pure props component.
- **Lobby conductor block** [Lobby.svelte `{#if isHost}` ... `.conductor`] — the inline Host-only affordance pattern to mirror for the Re-deal button. The shared conductor-bar component is Story 4.1.
- **`sendHostSetLives` / `buildHostSetLivesIntent`** [table-store.svelte.ts / socket.ts] — the two-layer client send pattern to mirror for `sendDealAgain`/`buildDealAgainIntent`. `sendIntent` [socket.ts] is the GATE-1-exempt send seam. `phaseToken` comes from `state.phaseToken`.

### Phase machine (the single source of truth — no Phase literal change)

```
allActed   --revealAll-->  [resolve-at-reveal]  --> roundResult | gameOver
                                                    (revealed=true, round KEPT, loserIds/winnerIds set)
roundResult --dealAgain--> dealing -> turns          (Host; phaseToken; survivors; Loser starts — THIS STORY)
gameOver   --newGame-->    lobby                      (Story 3.6 — NOT this story)
```
`Phase`, `Intent` (`dealAgain` named), `ProjectedTableState.loserIds?/winnerIds?` are ALL pre-named in the contract [types.ts:39–46,155–162,140–141]. The ONLY `types.ts` change is adding `loserIds?`/`winnerIds?` (and optionally `nextStartingPlayerId?`) to the SERVER-only `TableState`.

### Purity / boundary placement

- `resolveShowdown`/`dealRound` are PURE (GATE-2, `rules/**`) — call them from `handlers.ts` (the mutation boundary); apply their returned NEW arrays to `host.table.*`, then persist + project. Do NOT mutate inside `rules/`.
- `handleReveal`/`handleDealAgain` throw `IntentError` (handler boundary). The pure engine's asserts throw plain `Error` — if one fires it is a server bug, not a client-rejectable intent (it would surface as a non-IntentError throw → dispatch's catch logs + generic close, per the 1.3 deferred `ErrorReason` note). Deriving a valid alive starter before `dealRound` keeps the plain-Error asserts as defense-in-depth, not the primary path.
- GATE-1 egress: `projectStateFor` stays send-free; only `push-state.ts`/`fanOut` send. The client `sendDealAgain` → `sendIntent` → `socket.send` is the legitimate client egress (the ban is server-`.ts` scoped).

### Previous story intelligence

- **3.1 (done)** built the pure `resolveShowdown` (discriminated-union outcome, NEW players array, co-winner-correct for the 0-alive shared win) + hardened `dealRound`/`nextAliveSeat` with asserts SPECIFICALLY so 3.4's `dealAgain` consumes a primitive that cannot silently lie [3-1 Dev Notes; AC-3.1.7]. 3.1 explicitly scoped the `dealAgain` handler, lives UI, projection wiring, and deriving the alive starter to THIS story.
- **3.2 (done)** built `handleReveal` (allActed→showdown, flip only) cloning `handleDeal`, and added the reveal-true SM-6 projection test + `table-server-reveal.do.test.ts`. Its review DEFERRED the project-state.ts:61 hand-less-seat guard explicitly to "when 3.4 lands" [deferred-work.md story-3.2] — AC-3.4.8 closes it. This story EXTENDS `handleReveal` to resolve through (no longer stops at showdown).
- **3.3 (done, merged PR)** built `Showdown.svelte` as a CONSUMER of `state.loserIds` (flip + loser highlight + warm copy), dormant until this producer sets `loserIds`. Its code-review fixes (loser scale on `.seat`, `loserIds` as Set, spectator-no-seat guard) are in place. This story makes that surface light up — and adds the Host Re-deal affordance to it (AC-3.4.3). The defensive face-down render for hand-less seats (3.3) pairs with AC-3.4.8's server-side omission.
- TDD discipline (RED-first) confirmed productive across 3.1/3.2 — mirror it (Task 6 tests RED before Task 1/2/4 pass).

### Git intelligence

- `c39fb78` (main) — Story 3.3 merged (Showdown surface + code-review fixes). This story's baseline.
- `1fceeac` 3.2 reveal-finality; `a8eda8b` 3.1 pure resolveShowdown + Action-4 hardening. Pattern across 3.1–3.3: each story clones the prior chokepoint/test harness; `handleDealAgain` + `table-server-deal-again.do.test.ts` continue exactly this.

### Testing standards

- **Server `rules`/unit (`*.test.ts`, node):** extend `project-state.test.ts` (loserIds/winnerIds emitted; hand-less-seat omission). Do NOT add `resolveShowdown` cases (3.1 owns it; no forward-bind).
- **Server `do` (`*.do.test.ts`, `@cloudflare/vitest-pool-workers`):** new `table-server-deal-again.do.test.ts`, clone the `table-server-reveal.do.test.ts` harness. Real WS upgrade through the Worker → DO; drive `onMessage → dispatch`, never an RPC shortcut.
- **Client `client-node` (`*.test.ts`, node):** `socket.ts` builder shape; any pure store seam.
- **Client `client-dom` (`*.svelte.test.ts`, jsdom):** `Showdown.svelte.test.ts` (Host Re-deal at roundResult / waiting line / absent at gameOver / tap sends), `LivesPips.svelte.test.ts` (enter-animation hook on `.pip.hollow` present — jsdom can't eval @media/keyframes, assert the structural class per Button/Showdown precedent).
- RED-first; server baseline ≈ 170 (3.2), client ≈ 93 (3.3). Additions are net-new.

### Project Structure Notes

- **Server (UPDATE):** `handlers.ts` (resolution in handleReveal + new handleDealAgain), `dispatch.ts` (case dealAgain), `project-state.ts` (emit loserIds/winnerIds, remove _beats, guard hand-less seat), `persistence.ts` (carry result in summary). **Shared (UPDATE):** `types.ts` (TableState result fields). **NEW test:** `table-server-deal-again.do.test.ts`. **Server REUSE (no change):** `rules/engine.ts`, `rules/validate.ts`.
- **Client (UPDATE):** `surfaces/Showdown.svelte` (Host Re-deal affordance), `components/LivesPips.svelte` (animation), `lib/copy.ts` (new constants), `socket.ts` (builder), `lib/table-store.svelte.ts` (sendDealAgain). `RoundResult.svelte` stays the minimal round=null fallback (no flip/highlight there).
- Aligns with architecture boundaries: `handlers.ts` = mutation, `dispatch.ts` = router, `project-state.ts` = privacy chokepoint, `rules/**` = pure (reuse only), `client/src/lib` = client-only. No structural variance.

### References

- [Source: epics.md#Story 3.4 (lines 743–765)] — the 4 ACs: pips tick (ties deduct all), Host Re-deal / others waiting, `dealAgain` (phaseToken) → survivors + Loser starts, one action, ≥2-alive-only (E1).
- [Source: architecture.md#D6 419–435] — canonical resolution order + tiebreak (the resolveShowdown contract). [#Phase 574–590] — the phase machine; `showdown→roundResult|gameOver` server-internal; `roundResult→dealAgain→dealing→turns`. [#ProjectedTableState 615–628] — loserIds/winnerIds server-computed value-free.
- [Source: shared/src/types.ts:32–35,39–46,140–141,155–162] — phase-machine comment; Phase; ProjectedTableState.loserIds?/winnerIds?; Intent (dealAgain named, {phaseToken}). TableState (89–97) has NO result field — this story adds it.
- [Source: server/src/rules/engine.ts:304 (resolveShowdown), :125 (dealRound), :88 (nextAliveSeat)] — the pure primitives to REUSE; the ShowdownResult shape (engine.ts:12–18).
- [Source: server/src/handlers.ts:331 (handleDeal), :424 (handleReveal), :413–418 (handleReveal scope note "resolution is Story 3.4")] — the chokepoint precedent + the deferred resolution.
- [Source: server/src/dispatch.ts (case deal/revealAll; default stub naming dealAgain/newGame)] — the case shape + stub to shrink.
- [Source: server/src/project-state.ts:22,61,78–79,103–107] — the revealed branch; the hand-less-seat assignment to guard (AC-3.4.8); the loserIds/winnerIds omission + the _beats scaffold to remove.
- [Source: server/src/rules/validate.ts:53,67,88] — checkPhaseToken/bumpPhaseToken/assertDealable. ErrorReason frozen (types.ts:178–185).
- [Source: client/src/route-from-state.ts:48,53,59] — the router precedence; the resolved `winnerIds`/`revealed`/`roundResult` branches (deferred-work items 1.9a closed by this story).
- [Source: client/src/surfaces/Showdown.svelte] — the 3.3 consumer surface (loserIds Set, loser/tie copy, defensive face-down) that this story's producer feeds + extends with the Re-deal affordance.
- [Source: client/src/components/LivesPips.svelte] — the pip widget to animate (UX-DR15 "brief animation on Life loss" — the one missing piece).
- [Source: client/src/lib/table-store.svelte.ts (sendHostSetLives), client/src/socket.ts (buildHostSetLivesIntent, sendIntent)] — the client send pattern to mirror for dealAgain.
- [Source: server/src/table-server-reveal.do.test.ts] — the DO integration harness to clone.
- [Source: deferred-work.md — story-1.4/story-3.2 (project-state.ts hand-less seat), story-1.9a (route-from-state.ts:48/:53 winnerIds/revealed)] — the deferred items this story closes.
- [Source: EXPERIENCE.md State Patterns; UX-DR10/UX-DR14/UX-DR15; DESIGN.md 179–182] — Round Result beat content; pips animation; conductor-bar (full component is 4.1).

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (1M context) — `us.anthropic.claude-opus-4-8[1m]`

### Debug Log References

- Baseline (green): server 170, client 93.
- RED-first confirmed on the producer/contract seams: the project-state emit + persistence round-trip tests failed before the `TableState`/`DurableSummary` fields and the projector emit were added (3 failing). The reveal DO test's `showdown`-phase assertions failed under resolve-at-reveal (now `roundResult`) until the assertions were updated.
- Final gates (all green): server `npm test` 183 (18 files), client `npm test` 104 (12 files), `npm run lint` (GATE-1 egress + GATE-2 purity), `npm run typecheck` (0 errors / svelte-check 0 problems), `npm run build` (PWA built).

### Completion Notes List

- **Resolve-at-reveal (Task 1, AC-3.4.1):** `handleReveal` now flips `revealed=true` AND runs the pure `resolveShowdown` synchronously in the same transition — applying the NEW players array (lives deducted + eliminations), stashing `loserIds` (always) / `winnerIds` (terminal only) / `nextStartingPlayerId` (continue only), and landing `roundResult` (≥2 alive) or `gameOver` (≤1). The `round` is KEPT so `revealed` stays true through the beat. The `showdown` phase literal is now transient/internal (the wire never rests there) — documented in the handler SCOPE comment.
- **Contract + persistence (Task 2, AC-3.4.2):** `TableState` gained `loserIds?`/`winnerIds?`/`nextStartingPlayerId?`. `DurableSummary` + `toSummary` + `reconcileSummaryToState` carry `loserIds`/`winnerIds` durably (omit-when-absent) so a reload at `roundResult`/`gameOver` restores them; `nextStartingPlayerId` is intentionally NOT persisted (a coerced reload re-derives a valid alive starter via `dealRound`'s assert). `projectStateFor` emits both omit-when-absent; the `_beats` SSoT scaffold was removed (the real producer now structurally consumes the two fields).
- **Hand-less-seat guard (AC-3.4.8):** `project-state.ts:61` now reads-then-guards (`const h = round.hands[p.id]; if (h) entry.hand = h;`) so an eliminated/hand-less seat OMITS the `hand` key under `revealed` rather than assigning `undefined` (closes deferred-work story-1.4/3.2).
- **`handleDealAgain` + dispatch (Task 4, AC-3.4.5/.6/.7):** new handler clones the `handleDeal` accepted-path chokepoint (shape → table-null → not-host → checkPhaseToken → phase==roundResult → deal survivors with the resolved Loser starting → clear result → turns → bump → persist). The `roundResult` gate IS the ≥2-alive guard (E1) — `gameOver` is rejected `phase-illegal`. No new `ErrorReason`. `dispatch.ts` adds `case "dealAgain"` and shrinks the not-yet-implemented stub to `newGame`/`hostRemovePlayer`/`hostReassign`.
- **LivesPips tick-down (Task 3, AC-3.4.4):** a brief reduce-motion-safe enter animation (`pip-tick`) on the appearing `.pip.hollow` (the natural fit for the two-`{#each}` markup — a life loss removes a filled span and adds a hollow span; there is no persistent element to morph). Pure-CSS `@media (prefers-reduced-motion: reduce)` skip; the cue is shape (disc vs ring), not colour. Kept a pure props component.
- **Host Re-deal affordance (Task 5, AC-3.4.3):** an inline Host-only block on `Showdown.svelte`, shown ONLY at `phase === "roundResult"` (Host → a primary `RE_DEAL` Button calling `sendDealAgain(state.phaseToken)`; non-Host → the `WAITING_TO_REDEAL` line). Absent at `gameOver` (routes to winner/eliminated). The FIRST client phase-conducting send: `buildDealAgainIntent` (socket.ts) + `sendDealAgain` (table-store) mirror the `hostSetLives` two-layer pattern. New copy `RE_DEAL`/`WAITING_TO_REDEAL`. `RoundResult.svelte` left as the minimal round=null fallback.
- **Tests (Task 6, AC-3.4.9):** new `table-server-deal-again.do.test.ts` (heads-up + 3-player happy paths via the real wire; non-host / double-tap / wrong-phase rejections; a gameOver drive — seeding 1 life + a deterministic high/low hand on the live instance at allActed — confirms NO re-deal). `project-state.test.ts` + `persistence.test.ts` extended. New `socket.test.ts` (builder shape), `LivesPips.svelte.test.ts`, and Re-deal cases in `Showdown.svelte.test.ts`. The reveal DO test was updated to the resolve-at-reveal outcome (`roundResult` + `loserIds` + decremented life).
- **Routing precedence (closes deferred-work 1.9a):** the resolved `roundResult` projection carries `revealed:true` → routes to the Showdown surface by design (route-from-state.ts:53); `gameOver` (:48) wins over `:53`, so the terminal outcome routes to winner/eliminated and the Re-deal beat is correctly absent there. `winnerIds` is now populated at `gameOver` (the real winner no longer routes to `eliminated`).

### File List

**Shared (UPDATE)**
- `shared/src/types.ts` — `TableState` gains `loserIds?`/`winnerIds?`/`nextStartingPlayerId?`.

**Server (UPDATE)**
- `server/src/handlers.ts` — resolve-at-reveal in `handleReveal` + new `handleDealAgain`; `resolveShowdown` import.
- `server/src/dispatch.ts` — `case "dealAgain"` + `handleDealAgain` import; SCOPE/stub comments updated.
- `server/src/project-state.ts` — emit `loserIds`/`winnerIds` (omit-when-absent); guard hand-less seat (AC-3.4.8); removed `_beats` scaffold.
- `server/src/persistence.ts` — `DurableSummary` + `toSummary` + `reconcileSummaryToState` carry `loserIds`/`winnerIds`.

**Server (TEST)**
- `server/src/table-server-deal-again.do.test.ts` — NEW (6 cases).
- `server/src/table-server-reveal.do.test.ts` — UPDATED to resolve-at-reveal (`roundResult` outcome).
- `server/src/project-state.test.ts` — UPDATED (loserIds/winnerIds emit + hand-less-seat omission).
- `server/src/persistence.test.ts` — UPDATED (result-field round-trip).

**Client (UPDATE)**
- `client/src/surfaces/Showdown.svelte` — Host Re-deal block (roundResult-only) + `sendDealAgain` wiring.
- `client/src/components/LivesPips.svelte` — tick-down enter animation + reduce-motion skip.
- `client/src/socket.ts` — `buildDealAgainIntent`.
- `client/src/lib/table-store.svelte.ts` — `sendDealAgain` seam.
- `client/src/lib/copy.ts` — `RE_DEAL` / `WAITING_TO_REDEAL`.

**Client (TEST)**
- `client/src/socket.test.ts` — NEW (builder shape).
- `client/src/components/LivesPips.svelte.test.ts` — NEW (render + animation hook).
- `client/src/surfaces/Showdown.svelte.test.ts` — UPDATED (Re-deal cases).

## Change Log

- 2026-06-22 — Story 3.4 implemented (resolve-at-reveal producer + one-tap re-deal): wired `resolveShowdown` into `handleReveal`, carried `loserIds`/`winnerIds` durably + projected them, added `handleDealAgain` + dispatch route, LivesPips tick-down animation, the Host Re-deal affordance on the revealed beat (first client phase-conducting send), and the hand-less-seat projection guard. Tests: server 170→183, client 93→104; lint/typecheck/build green. RED-first confirmed.
