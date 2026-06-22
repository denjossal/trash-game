---
baseline_commit: 0219e38
---

# Story 3.6: Winner — end the game warmly

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the last Player standing (or a shared winner),
I want a warm celebration with an easy "one more,"
so that the night flows into another game without friction.

## Acceptance Criteria

1. **AC-3.6.1 — The Winner surface celebrates the winner(s) with warm "{name} wins it. One more?" copy (replaces the 1.9a stub).** When the win-check declares a winner (1 alive) or a shared win (0 alive, all tied to zero) the game lands in `gameOver` with `winnerIds` populated (already done — Story 3.4's resolve-at-reveal sets `phase = "gameOver"` + `winnerIds` for the ≤1-alive outcome; engine `resolveShowdown` returns `{ kind: "winner"; winnerIds }` for 1-alive sole-winner OR 0-alive shared win). `client/src/surfaces/Winner.svelte` (currently the 1.9a stub) is fleshed into the real celebration surface: it renders the warm `winner(name)` copy (`` `${name} wins it. One more?` ``, ALREADY in copy.ts:89 — reuse verbatim, do NOT inline a literal or change the string). For a **shared win** (multiple ids in `winnerIds`) the surface names **all co-winners** by joining them into the single `name` slot (e.g. `winner("Ana and Ben")`) — one source string, no new copy constant (UX-DR16 single-source voice). The voice is warm/celebratory — never a stats screen or a punishing tone. *(FR-12, UX-DR12, UX-DR16; epics.md:795-797.)*

2. **AC-3.6.2 — Host-only "one more?" sends the `newGame` intent (the `gameOver`→`lobby` producer).** A new server handler `handleNewGame` clones the handleDeal/handleDealAgain accepted-path chokepoint via the SHARED `requirePhaseConductor` helper with `expectedPhase = "gameOver"` (shape → table-null → not-host → checkPhaseToken → phase===`gameOver`), then mutates: re-apply `startingLives` to every Player (`p.lives = table.startingLives`), reset every `p.isAlive = true` (the SAME roster — `id`/`name`/`seatIndex`/`isConnected` unchanged), set `phase = "lobby"`, clear the between-round result (`loserIds`/`winnerIds`/`nextStartingPlayerId` all → `undefined`), clear `round = null`, `bumpPhaseToken`, `persistSummary`. A `case "newGame"` is added to `dispatch.ts` (before the `default`) routing to `handleNewGame` + `fanOut`. This is **distinct from `dealAgain`** (the between-rounds re-deal of Story 3.4, which stays within an ongoing game at `roundResult`→`turns`). *(FR-12, UX-DR12; architecture.md:386,581,589,598-600; Winston review — phase-machine `gameOver`→`lobby` edge.)*

3. **AC-3.6.3 — `gameOver`→`lobby` re-opens the SAME Table for "one more" with no re-joining.** After `newGame`, the phase is `lobby` with the identical roster (same `players[]`, full `startingLives`, all `isAlive=true`), the old round/result is gone, and join re-opens for late arrivals up to the next first Deal — **existing Players do NOT re-join** (their connection/session is untouched; they simply receive a fresh `lobby` projection). `handleJoinRoom`'s existing `phase === "lobby"` admit-gate (handlers.ts) now admits late arrivals again; no change to join/session/GC is made here. *(UX-DR12; epics.md:801; architecture.md:589 "same roster, reopens join, re-applies startingLives".)*

4. **AC-3.6.4 — The Host can start "one more" even if the Host did NOT win (AR-5: an eliminated/non-winning Host keeps conducting).** The router sends ONLY the winner to the `winner` surface at `gameOver`; every non-winner (including a non-winning Host) routes to `eliminated` (route-from-state.ts:47-48). Because the Host conductor role is independent of `isAlive`/winning (AR-5; architecture.md:335-336 "an eliminated Host… keeps conducting"), the Host-only "one more?" control is placed on **BOTH** the `Winner` surface AND the `Eliminated` surface, each gated on `state.you.isHost && state.phase === "gameOver"`. On `Eliminated`, the Host sees the warm `ELIMINATED` spectator copy PLUS the "one more?" action; a non-Host (or the Host before `gameOver`, i.e. the live-phase spectator case) sees NO new-game action. NO router change. *(AR-5; epics.md:57; architecture.md:335-336; route-from-state.ts:46-48.)*

5. **AC-3.6.5 — A non-Host on the Winner surface sees a calm "waiting on the host" line, never a dead button.** On the `Winner` surface a non-Host sees the celebration copy PLUS a calm waiting line in a `role="status"` `aria-live="polite"` region (mirroring the Showdown/RoundResult non-Host re-deal pattern), so they know the Host drives the next game — never a disabled/dead "one more?" button. Use a new-game-specific waiting copy constant (`WAITING_TO_NEW_GAME`, added to copy.ts — the existing `WAITING_TO_REDEAL` "deal again" wording is semantically wrong for a NEW game; this is the one new copy string the story adds, kept single-source). On the `Eliminated` surface the non-Host case is the existing calm spectator copy (no waiting line needed there — Eliminated is already a calm sideline; only the Host gets the extra action). *(UX-DR12, UX-DR16, NFR-10; copy.ts:83 WAITING_TO_REDEAL is the pattern; Showdown.svelte:101-113 / RoundResult.svelte:53-65 the non-Host layout.)*

6. **AC-3.6.6 — SM-1 "one more" is exactly ONE tap with NO retention-software vocabulary.** The Winner (and the Host-on-Eliminated) "one more" is a single tap that goes straight to a fresh `lobby` — NO stats screen, NO streak/score-history, NO countdown nag, NO leaderboard, NO win-tally. SM-1 (unprompted re-play) is served by REMOVING friction, never by a prompt-engine. The Winner surface shows the celebration + the one action, nothing more. *(SM-1, SM-C1; epics.md:803-805; Mary review — protects the "not retention software" non-goal; gated by the Eyes-Up standing gate, Epic 0 / G1.)*

7. **AC-3.6.7 — Server tests (RED-first) — the `newGame` producer.** A new `server/src/table-server-new-game.do.test.ts` (cloning the `table-server-deal-again.do.test.ts` DO harness, live `@cloudflare/vitest-pool-workers` instance) covers: (a) **happy path** — Host taps `newGame` at `gameOver` → phase `lobby`, every Player `lives === startingLives` & `isAlive === true`, `winnerIds`/`loserIds`/`nextStartingPlayerId` cleared, `round === null`, phaseToken bumped; (b) **not-host** — a guest's crafted `newGame` at `gameOver` → `not-host`, no transition; (c) **stale double-tap** — a second `newGame` with the now-stale phaseToken → `stale-phase`, no double transition; (d) **wrong-phase** — `newGame` at `roundResult` (and/or `turns`) → `phase-illegal` (the `dealAgain`/`newGame` phase gates are mutually exclusive — `dealAgain` only at `roundResult`, `newGame` only at `gameOver`); (e) **re-open join** — after `newGame`, a late `joinRoom` is admitted (phase is `lobby` again) while existing Players are NOT forced to re-join. RED-first confirmed (the new test fails against `dispatch.ts`'s current `default → phase-illegal` for `newGame` before the case is wired). *(NFR-2, NFR-5; testing standards below.)*

8. **AC-3.6.8 — Client tests (RED-first) + render + gates.** A new `client/src/surfaces/Winner.svelte.test.ts` (client-dom, cloning `Showdown.svelte.test.ts`'s Host-only-button harness — store-mock so `sendNewGame` is asserted): (a) the celebration copy renders with the winner's name; (b) a **shared win** (2 ids in `winnerIds`) renders BOTH names joined; (c) the **Host** sees a "one more?" `<Button>` whose click calls `sendNewGame(state.phaseToken)`; (d) a **non-Host** sees the calm `role="status"` waiting line and NO "one more?" button. `Eliminated.svelte.test.ts` is EXTENDED: a **Host at `gameOver`** sees a "one more?" button calling `sendNewGame(state.phaseToken)`; a **non-Host eliminated** (and the existing live-phase spectator) still sees NO action button (the 3.5 cases re-pass). The existing `route-from-state.test.ts` gameOver cases (winner→`winner`, non-winner→`eliminated`) re-pass UNCHANGED. Client `npm test` + `npm run lint` (GATE-1 egress / GATE-2 purity) + `npm run typecheck` (svelte-check 0 problems) + `npm run build` all green; RED-first confirmed. *(NFR-2; testing standards below.)*

## Tasks / Subtasks

- [x] **Task 1 — Server: `handleNewGame` + dispatch case (the `gameOver`→`lobby` producer)** (AC: 2, 3) — server
  - [x] In `server/src/handlers.ts`, add `export async function handleNewGame(host, intent, callerPlayerId)` immediately after `handleDealAgain`. Signature mirrors `handleDealAgain`: `intent: Extract<Intent, { type: "deal" | "revealAll" | "dealAgain" | "newGame" }>`, `callerPlayerId: string | undefined`.
  - [x] First line: `requirePhaseConductor(host, intent, callerPlayerId, "gameOver");` then `const table = host.table!;` (the helper proved it non-null). This gives shape → table-null → not-host → checkPhaseToken → phase===`gameOver` for free — do NOT re-implement those checks.
  - [x] Mutate (SAME roster, fresh game): in-place `for (const p of table.players) { p.lives = table.startingLives; p.isAlive = true; }` — re-apply `startingLives` (handleHostSetLives lives-sync precedent), reset `isAlive=true` (every seat plays again). Keep `id`/`name`/`seatIndex`/`isConnected` untouched (it is the same roster, NOT a re-create). (Used the in-place loop matching handleHostSetLives rather than a `.map` — same effect, same precedent.)
  - [x] Mutate: `table.phase = "lobby";` (re-opens join). Clear the between-round result EXACTLY as `handleDealAgain` does: `table.loserIds = undefined; table.winnerIds = undefined; table.nextStartingPlayerId = undefined;`. Clear `table.round = null;` (the round is cleared only at the next dealAgain/newGame).
  - [x] `bumpPhaseToken(table);` then `await persistSummary(host.storage, table);` — keep the guard→mutate→bump→persist order (deferred-work #117). `toSummary` already omits `round`/`isConnected` and omits-when-absent the cleared result fields — NO persistence.ts change needed.
  - [x] In `server/src/dispatch.ts`, add `case "newGame": { await handleNewGame(host, intent, connection.state?.playerId); fanOut(host.connections(), host.table!); return; }` BEFORE the `default:` (which currently rejects `newGame` as `phase-illegal`). Imported `handleNewGame`. Updated the SCOPE header + the "NOT yet implemented" comment to only the still-unimplemented Epic-4 host-controls.
  - [x] DID NOT touch `shared/src/types.ts` (`newGame` already in the Intent union; `gameOver`/`lobby` already in the Phase union), `project-state.ts` (already projects `winnerIds` omit-when-absent + a `lobby` projection), `validate.ts` (`checkPhaseToken`/`bumpPhaseToken` work as-is), `persistence.ts`, or `engine.ts`.

- [x] **Task 2 — Client: send seam (`buildNewGameIntent` + `sendNewGame`)** (AC: 2) — client
  - [x] In `client/src/socket.ts`, added `export function buildNewGameIntent(phaseToken: number): PhaseIntent { return { type: "newGame", payload: { phaseToken } }; }` (clone `buildDealAgainIntent`; `newGame` already in the `PhaseIntent` Extract).
  - [x] In `client/src/lib/table-store.svelte.ts`, added `export function sendNewGame(phaseToken: number): void { if (liveSocket === null) return; sendIntent(liveSocket, buildNewGameIntent(phaseToken)); }` (clone `sendDealAgain`; imported `buildNewGameIntent`).

- [x] **Task 3 — Client: copy + Winner surface** (AC: 1, 5, 6) — client
  - [x] In `client/src/lib/copy.ts`, added `WAITING_TO_NEW_GAME = "Waiting on the host to start one more…"` (new-game analog of `WAITING_TO_REDEAL`) AND a short `ONE_MORE = "One more"` button label (the warm celebration line already carries the "One more?" question; the Button verb is short). REUSED the existing `winner(name)` verbatim — no shared-win string; co-winners join into the `name` slot.
  - [x] In `client/src/surfaces/Winner.svelte` (fleshed the 1.9a stub): Story-3.6 scope note; `winnerNames = filter(winnerIds).map(name)` then `joinedName` ("Ana" / "Ana and Ben" / "Ana, Ben, and Cy"); render `winner(joinedName)` with a defensive `"Winner!"` fallback when empty.
  - [x] `isHost = $derived(state.you.isHost)` + `canStartNewGame = $derived(state.phase === "gameOver")`. Host sees `<Button onclick={() => sendNewGame(state.phaseToken)}>{ONE_MORE}</Button>`; non-Host sees `<p role="status" aria-live="polite">{WAITING_TO_NEW_GAME}</p>` (cloned Showdown layout + `data-testid` hooks `newgame-host`/`newgame-waiting`). Imported `Button`, `sendNewGame`, `winner`, `ONE_MORE`, `WAITING_TO_NEW_GAME`.
  - [x] SM-1 guard (AC-3.6.6): the surface holds ONLY the celebration copy + the one action (or non-Host waiting line). No stats/streak/score/leaderboard/countdown (test asserts none of that vocabulary renders).

- [x] **Task 4 — Client: Host "one more?" on the Eliminated surface (AR-5 — non-winning Host can conduct)** (AC: 4) — client
  - [x] In `client/src/surfaces/Eliminated.svelte`: ADDED a Host-only, `gameOver`-only "one more" action below the warm spectator copy, gated on `state.you.isHost && state.phase === "gameOver"`. A non-Host, and the Host at a live phase (`phase !== "gameOver"`), see NO new-game action — the calm spectator surface is otherwise UNCHANGED from 3.5.
  - [x] Imported `Button` + `sendNewGame` (was a pure props surface in 3.5). The egress is a guarded Host action via the GATE-1-exempt store seam (same pattern as Showdown's `sendDealAgain`) — lint GATE-1 clean. Kept `role="status" aria-live="polite"` on the warm-copy child region (3.5 behavior); `<main>` stays a bare landmark (3.5 test re-passes).
  - [x] DID NOT change the router or the 3.5 spectator behavior for the non-Host / live-phase cases. The eliminated non-Host stays a calm sideline spectator (no buttons) exactly as 3.5 shipped (existing 3.5 cases re-pass).

- [x] **Task 5 — Tests (RED-first) + gates** (AC: 7, 8)
  - [x] **Server:** new `server/src/table-server-new-game.do.test.ts` cloning `table-server-deal-again.do.test.ts` (live DO instance; `driveToGameOver` mirrors the deal-again terminal DAGO setup — heads-up, both at 1 life, deterministic host-high/guest-low hand). 5 cases: happy `gameOver`→`lobby` (lives reset to startingLives, all isAlive=true, result cleared, round null, token bumped) / not-host / stale double-tap → `stale-phase` / wrong-phase (`turns`→`phase-illegal`) / re-open join (a fresh `joinRoom` admitted post-`newGame`, roster grows to 3 without existing Players re-joining).
  - [x] **Client (client-dom):** new `Winner.svelte.test.ts` (4 cases) cloning the Showdown store-mock harness — celebration copy + name / shared-win two-name join / Host one-more Button calling `sendNewGame(phaseToken)` / non-Host `role="status"` waiting line + NO button. EXTENDED `Eliminated.svelte.test.ts` (+2 cases): Host-at-`gameOver` sees a one-more Button calling `sendNewGame(phaseToken)`; Host at a live phase + the non-Host cases still render NO action button (3.5 cases re-pass).
  - [x] **Client (client-node):** the existing `route-from-state.test.ts` gameOver cases (winner→`winner`, non-winner→`eliminated`) re-pass UNCHANGED (no router change).
  - [x] **Gates:** RED-first confirmed (server new-game DO test 4/5 failed against `dispatch.ts default → phase-illegal` before Task 1; Winner test 4/4 + the new Eliminated Host case failed against the stubs before Tasks 3/4). After: server `npm test` 192, client `npm test` 118, `npm run lint` (GATE-1 + GATE-2 clean), `npm run typecheck` (svelte-check 200 files 0 errors / 0 warnings, tsc 0), `npm run build` (PWA built) — all green.

## Dev Notes

### What this story IS and is NOT

- **IS:** the FULL-STACK slice that closes the game lifecycle — the `newGame` PRODUCER (`gameOver`→`lobby`, same roster, lives re-applied, join re-opened) + the warm Winner celebration surface + the Host-only "one more?" reachable from BOTH the Winner and Eliminated surfaces (AR-5). Plus a new-game waiting line for non-Hosts. RED-first server + client tests.
- **IS NOT:** NOT a `types.ts`/contract change (`newGame`/`gameOver`/`lobby` are ALL pre-named in the frozen Intent/Phase unions). NOT a `resolveShowdown`/`engine.ts` change (the win-check that sets `gameOver` + `winnerIds` is built — 3.1/3.4). NOT a router change (`route-from-state.ts` already routes winner→`winner`, non-winner→`eliminated` at `gameOver`). NOT a `project-state.ts`/`persistence.ts` change (both already carry `winnerIds`/result fields omit-when-absent + a `lobby` projection). NOT the Epic-4 conductor bar / host mid-session controls. NOT a stats/streak/leaderboard screen (SM-1 explicitly forbids it — AC-3.6.6). NOT produced FX.

### The terminal machinery is already built — this story wires the "one more" producer + surface (read before Task 1)

Everything that REACHES `gameOver` exists; do NOT rebuild it:
- **`gameOver` + `winnerIds` are set at resolution** — Story 3.4's resolve-at-reveal (`handleReveal` → `resolveShowdown`) sets `phase = "gameOver"` + `table.winnerIds = result.outcome.winnerIds` + `nextStartingPlayerId = undefined` for the ≤1-alive (winner) outcome (handlers.ts:450-455). `resolveShowdown` returns `{ kind: "winner"; winnerIds }` for BOTH the 1-alive sole winner AND the 0-alive shared win (all tied to zero) — co-winners come through as multiple ids (engine.ts:12-18, ShowdownResult union; engine resolveShowdown win-check). The round is KEPT at `gameOver` so the revealed beat still rendered — and is cleared only at the next `dealAgain`/`newGame` (handlers.ts:464). [3-4 Dev Notes; handlers.ts:447-462.]
- **The Intent + Phase types already name everything** — `newGame` is in the Intent union (types.ts:171, grouped with `deal|revealAll|dealAgain` under the shared `{ phaseToken }` payload), and `gameOver`/`lobby` are in the Phase union (types.ts:39-46). The architecture FROZE this up front (architecture.md:284,386,598-600) so 3.6 "extends a contract the type already names rather than introducing a new intent late." Do NOT edit `types.ts`.
- **The router is complete** — `route-from-state.ts:47-48`: at `gameOver`, `state.winnerIds?.includes(you.playerId) ? "winner" : "eliminated"`. The `Surface` union already names `"winner"` and `App.svelte:24,46-47` already renders `<Winner state={state!} />`. Do NOT modify the router. (This is WHY the Host "one more?" must also live on `Eliminated` — a non-winning Host routes there; see AC-3.6.4.)
- **The chokepoint helper is built** — `requirePhaseConductor(host, intent, callerPlayerId, expectedPhase)` (handlers.ts:618-653) encapsulates shape → table-null → not-host → checkPhaseToken → phase-gate in the load-bearing order. `handleDeal` (expectedPhase `lobby`), `handleReveal` (`allActed`), `handleDealAgain` (`roundResult`) are the three live callers. `handleNewGame` is the FOURTH — expectedPhase `gameOver`. Clone `handleDealAgain` almost verbatim; only the phase gate, the roster reset, and `phase = "lobby"` (vs `dealRound`/`turns`) differ.

So the net-new artifacts are: `handleNewGame` + its dispatch case (server); `buildNewGameIntent`/`sendNewGame` + `WAITING_TO_NEW_GAME` + the Winner surface body + the Eliminated Host action (client); and the two test files. Treat the win-check, the router, and the types as standing — if a change here would touch them, it is out of scope.

### REUSE — do not reinvent

- **`requirePhaseConductor`** [handlers.ts:618-653] — the SHARED phase chokepoint. Use it with `expectedPhase = "gameOver"`. Do NOT hand-roll the not-host/stale-phase/phase-illegal checks.
- **`handleDealAgain`** [handlers.ts:502-545] — the closest clone target: same Extract type, same `requirePhaseConductor` → mutate → clear-result → `bumpPhaseToken` → `persistSummary` shape. The result-clearing lines (534-536) are copied verbatim. `handleNewGame` differs only in: phase gate `gameOver` (not `roundResult`), roster reset (lives + isAlive, no `dealRound`), `phase = "lobby"` + `round = null` (not `turns`/new round).
- **`handleHostSetLives`** [handlers.ts:308-309] — the precedent for re-applying `startingLives` across all players (`for (const p of players) p.lives = next`). `handleNewGame` does the same with `table.startingLives`.
- **`winner(name)` copy** [copy.ts:89] — `` `${name} wins it. One more?` ``. REUSE verbatim; join co-winner names into the `name` slot. Do NOT add a shared-win string.
- **`WAITING_TO_REDEAL`** [copy.ts:83] — the PATTERN (a non-Host waiting line) but NOT the text (re-deal ≠ new game). Add `WAITING_TO_NEW_GAME` as its new-game analog (the ONE new copy string).
- **Showdown.svelte:101-113 / RoundResult.svelte:53-65** — the Host-only-Button / non-Host-`role="status"`-waiting-line layout to clone for the Winner surface, including the `data-testid="redeal-host"`/`"redeal-waiting"` style hooks (use new-game names, e.g. `newgame-host`/`newgame-waiting`).
- **`buildDealAgainIntent` [socket.ts:155-160] / `sendDealAgain` [table-store.svelte.ts:147-150]** — the send-seam pattern for `buildNewGameIntent`/`sendNewGame` (`newGame` already in the `PhaseIntent` Extract, socket.ts:153).
- **`table-server-deal-again.do.test.ts`** — the live-DO test harness to clone for `table-server-new-game.do.test.ts` (drive to the terminal phase via a deterministic seed; the deal-again test already drives to `gameOver` for its "no re-deal at gameOver" case — reuse that setup, then send `newGame` instead).
- **`Showdown.svelte.test.ts` (Host-only-button cases) / `Eliminated.svelte.test.ts` (3.5)** — the client-dom harnesses to clone/extend (store-mock for `sendNewGame`).

### Co-winner naming (AC-3.6.1) — confirmed decision

A shared win (0 alive, all tied to zero) puts MULTIPLE ids in `winnerIds`. Per the confirmed design: JOIN the names into the single `name` slot and pass to the existing `winner(name)` constant verbatim (e.g. `winner("Ana and Ben")` → `"Ana and Ben wins it. One more?"`). This keeps ONE source string (UX-DR16). The slight grammatical imperfection ("…and Ben wins it") is accepted for the rare all-tied case — do NOT add a plural copy variant. The 1.9a stub already does first-winner lookup (`state.players.find(... winnerIds?.includes ...)`); extend it to `filter(...).map((p) => p.name)` + a join.

### Host reach on "one more" (AC-3.6.4) — confirmed decision

The router sends the WINNER to `winner` and every non-winner (incl. a non-winning/eliminated Host) to `eliminated`. AR-5 + architecture.md:335-336 require the Host conductor role to be independent of `isAlive`/winning — "an eliminated Host keeps conducting." Confirmed approach: place the Host-only `gameOver` "one more?" action on **BOTH** surfaces (gated `state.you.isHost && state.phase === "gameOver"`), NOT a router change. The `gameOver` gate matters on `Eliminated` because that surface ALSO renders for live-phase spectators (route-from-state.ts:56) where there is no new game to start. A non-Host eliminated player sees the calm 3.5 spectator surface unchanged.

### Purity / boundary placement / egress (GATE-1/GATE-2)

- `handleNewGame` is the SINGLE mutation site for the `gameOver`→`lobby` transition (AR-5 — `TableState` mutated only by validated intents in `handlers.ts`). It is pure-of-I/O except the trailing `persistSummary` (the established handler shape). No `engine.ts` change — the roster reset is a straight `.map`, not a rules computation.
- `Winner.svelte` and the `gameOver`-Host branch of `Eliminated.svelte` become store consumers (import `sendNewGame`). This is legitimate client egress — a guarded Host action, the SAME pattern as Showdown's `sendDealAgain` (GATE-1 permits the `table-store`/`socket` import for an action surface). The non-Host / live-phase paths emit nothing. Keep the egress behind the `isHost && gameOver` gate.
- Do NOT read or expose any card value / hand on these surfaces (SM-6) — Winner/Eliminated render names + the action only.

### Phase machine / routing (the contract — no change)

```
… resolution (Story 3.4) at the win-check: ≤1 alive → phase=gameOver + winnerIds set (engine resolveShowdown {kind:"winner"}) …
route-from-state.ts:
  phase === "lobby"                         -> lobby            (:44)   ← AFTER newGame: the SAME table, join re-opened
  phase === "gameOver" && in winnerIds      -> winner           (:48)   ← the winner celebrates + (Host) one more?
  phase === "gameOver" && NOT in winnerIds  -> eliminated       (:48)   ← non-winner; a non-winning HOST gets one more? here (AC-3.6.4)
handlers.ts handleNewGame (NEW):
  requirePhaseConductor(…, "gameOver") -> reset roster (lives+isAlive) -> phase=lobby -> clear result -> round=null -> bumpPhaseToken -> persist
```
`gameOver --newGame--> lobby` is the only new transition; it is the mirror of `lobby --deal--> turns` run backwards to a fresh game. Architecture froze it at types.ts:34 (Phase comment), :589 (transition table), :598-600 (Intent comment).

### Previous story intelligence

- **3.5 (done, baseline)** built the Eliminated spectator surface as a PURE props component (warm `ELIMINATED` copy, `role="status" aria-live="polite"`, no buttons). 3.6 ADDS a single Host-only `gameOver` action to it — keep the 3.5 SR announce + AA tokens intact; do NOT regress the non-Host calm spectator path. 3.5's `Eliminated.svelte.test.ts` (4 cases) is EXTENDED, not replaced — its no-button assertions must still hold for the non-Host / live-phase cases.
- **3.4 (done)** is the PRODUCER that set `phase=gameOver` + `winnerIds` and KEPT the round at gameOver (cleared only at dealAgain/newGame — handlers.ts:464, which 3.6 now honors). 3.4's Dev Notes explicitly scoped "Winner surface (3.6), newGame (3.6)" to THIS story. The `dealAgain`/`newGame` distinction (between-rounds vs new-game) is the Winston phase-machine reconciliation — keep them mutually-exclusive on phase gates (`roundResult` vs `gameOver`).
- **3.3 (done)** built the Showdown surface with the Host-only `sendDealAgain` button + non-Host waiting line — the EXACT layout/test pattern the Winner surface clones.
- **1.8 (done)** set `startingLives` (DEFAULT_LIVES=3, MIN 1 / MAX 5) and the `handleHostSetLives` lives-sync loop — the precedent for re-applying lives in `handleNewGame`.
- **1.9a (done)** created the `Winner.svelte` stub (first-winner name lookup already present), the router `winner` branch, the `winner(name)` copy constant, and the `App.svelte` `<Winner>` wiring — all foundations to BUILD ON, not recreate.
- TDD discipline (RED-first) confirmed productive across 3.1-3.5 — mirror it: server DO test RED against the `default → phase-illegal` before the dispatch case; client Winner test RED against the bare stub before the surface body.

### Git intelligence

- `0219e38` (HEAD, branch `story/3-5-...`) — Story 3.5 (Eliminated spectator surface + code review). This story's baseline. (3.5 is at `done`; 3.6 builds on its branch tip — the Eliminated surface 3.6 extends must exist.)
- Pattern across 3.1-3.5: each story clones the prior surface/test harness and reuses the chokepoint/engine primitives. 3.6 continues exactly this — `handleNewGame` clones `handleDealAgain`; `Winner.svelte` clones the Showdown Host-button pattern; the DO test clones `table-server-deal-again.do.test.ts`.
- Server `.do.test.ts` flakiness note (from 3.4/3.5): `@cloudflare/vitest-pool-workers` occasionally flakes one DO test on a cold run, then passes on re-run. If the new DO test flakes once, re-run before treating it as a regression.

### Testing standards

- **Server `.do.test.ts` (`@cloudflare/vitest-pool-workers`, live DO instance):** new `table-server-new-game.do.test.ts` — clone `table-server-deal-again.do.test.ts`. Drive a real game to `gameOver` (heads-up at 1 life: create → join → set lives 1 → deal → swap/keep through the pass → revealAll → winner). Then assert the 5 cases (happy / not-host / stale double-tap / wrong-phase / re-open join). RED-first against the unwired `newGame` (dispatch `default → phase-illegal`).
- **Client `client-dom` (`*.svelte.test.ts`, jsdom):** new `Winner.svelte.test.ts` (clone `Showdown.svelte.test.ts` store-mock harness — mock `sendNewGame`). Cases: copy+name / shared-win join / Host button calls `sendNewGame(phaseToken)` / non-Host `role="status"` waiting line + no button. EXTEND `Eliminated.svelte.test.ts` (Host-at-gameOver button + non-Host/live-phase no-button).
- **Client `client-node` (`*.test.ts`, node):** existing `route-from-state.test.ts` gameOver cases re-pass UNCHANGED (no router change). Do NOT add router cases.
- RED-first; server baseline 187 (3.5 branch tip), client baseline 112 (3.5). New server DO test (~5 cases) + new client Winner test (~4 cases) + extended Eliminated test. jsdom renders both surfaces fully (no @media/keyframes caveat — no animation here).

### Project Structure Notes

- **Server (UPDATE):** `handlers.ts` (add `handleNewGame`), `dispatch.ts` (add `case "newGame"` + import). **NEW test:** `table-server-new-game.do.test.ts`.
- **Client (UPDATE):** `socket.ts` (`buildNewGameIntent`), `lib/table-store.svelte.ts` (`sendNewGame`), `lib/copy.ts` (`WAITING_TO_NEW_GAME`), `surfaces/Winner.svelte` (stub → real), `surfaces/Eliminated.svelte` (add Host-only gameOver action). **NEW test:** `surfaces/Winner.svelte.test.ts`. **EXTEND test:** `surfaces/Eliminated.svelte.test.ts`.
- **No change:** `shared/src/types.ts` (Intent/Phase frozen), `server/src/rules/engine.ts` + `validate.ts`, `server/src/project-state.ts`, `server/src/persistence.ts`, `client/src/route-from-state.ts`, `client/src/App.svelte`. If the dev finds themselves editing `types.ts`, the router, the engine, or the projector, STOP — that machinery is upstream/frozen.
- Aligns with architecture boundaries: `handlers.ts` = single mutation site; `surfaces/` = routed pure(-ish) surfaces; `lib/copy.ts` = single-source voice; `socket.ts`/`table-store` = the client send seam. No structural variance.

### References

- [Source: epics.md:787-805 (Story 3.6)] — the ACs: warm "{name} wins it. One more?" (co-winners named) celebration; `newGame` Host-only phaseToken-guarded `gameOver`→`lobby` same-roster + startingLives re-applied + join re-opened (distinct from `dealAgain`); SM-1 one-tap, NO stats/streak/countdown/leaderboard.
- [Source: epics.md:84 (UX-DR12)] — Winner surface "{name} wins it. One more?"; "one more?" routes the Host to a new game with the same Table. [Source: epics.md:32 (FR-12), :62 (AR-10), :683 (win-check)] — 1 alive winner / 0 alive shared win / ≥2 continue. [Source: epics.md:57 (AR-5)] — eliminated Host keeps conducting. [Source: epics.md:194,803-805 (SM-1)] — one more = remove friction, NOT a prompt-engine.
- [Source: architecture.md:284,386,581,589,598-600] — `newGame` (Host, `gameOver`→`lobby` "one more?", phaseToken) named UP FRONT in the Intent union; the `gameOver --newGame--> lobby` transition (same roster, reopens join, re-applies startingLives); `gameOver` = win-check terminal awaiting "one more?". [Source: architecture.md:335-336] — Host conductor role independent of `isAlive` (eliminated Host keeps conducting).
- [Source: server/src/handlers.ts:502-545 (handleDealAgain)] — the clone target (Extract type, requirePhaseConductor → mutate → clear-result:534-536 → bumpPhaseToken → persistSummary). [Source: handlers.ts:618-653 (requirePhaseConductor)] — the shared phase chokepoint (use expectedPhase "gameOver"). [Source: handlers.ts:447-464 (handleReveal)] — where gameOver + winnerIds are set; round cleared only at next dealAgain/newGame (:464). [Source: handlers.ts:308-309 (handleHostSetLives)] — the startingLives re-apply precedent.
- [Source: server/src/dispatch.ts (default → phase-illegal for newGame)] — the case to add before `default`.
- [Source: server/src/rules/engine.ts:12-18 (ShowdownResult), resolveShowdown win-check] — `{ kind: "winner"; winnerIds }` for 1-alive sole + 0-alive shared win.
- [Source: shared/src/types.ts:39-46 (Phase: lobby/gameOver), :89-110 (TableState: startingLives/players/winnerIds/loserIds/nextStartingPlayerId), :168-175 (Intent: newGame already in the grouped phaseToken member)] — all frozen; NO change.
- [Source: server/src/project-state.ts:83-88] — winnerIds projected omit-when-absent; a `lobby` projection already emitted. [Source: server/src/persistence.ts:23-64] — DurableSummary/toSummary carry result fields omit-when-absent, drop round/isConnected. NO change.
- [Source: client/src/route-from-state.ts:46-48] — gameOver → winner (in winnerIds) | eliminated (else). DO NOT modify. [Source: client/src/route-from-state.test.ts:55-61] — the gameOver winner/non-winner cases that must re-pass.
- [Source: client/src/App.svelte:24,46-47] — `<Winner state={state!} />` already wired. [Source: client/src/surfaces/Winner.svelte:1-35] — the 1.9a stub (first-winner lookup present) to flesh. [Source: client/src/surfaces/Eliminated.svelte] — the 3.5 spectator surface to ADD the Host-only gameOver action to (keep the SR announce + AA tokens).
- [Source: client/src/lib/copy.ts:89 (winner), :83 (WAITING_TO_REDEAL pattern), :86 (ELIMINATED)] — reuse `winner` verbatim; add `WAITING_TO_NEW_GAME` analog. [Source: client/src/surfaces/Showdown.svelte:101-113, RoundResult.svelte:53-65] — the Host-only-Button / non-Host-status-waiting layout + testids to clone.
- [Source: client/src/socket.ts:153,155-160 (PhaseIntent / buildDealAgainIntent), client/src/lib/table-store.svelte.ts:147-150 (sendDealAgain)] — the send-seam to clone for buildNewGameIntent/sendNewGame.
- [Source: server/src/table-server-deal-again.do.test.ts] — the live-DO harness to clone (already drives to gameOver). [Source: client/src/surfaces/Showdown.svelte.test.ts (Host-button cases), Eliminated.svelte.test.ts (3.5)] — the client-dom harnesses to clone/extend.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (1M context) — `us.anthropic.claude-opus-4-8[1m]`

### Debug Log References

- Baseline (green): server 187 (3.5 branch tip), client 112. Branch `story/3-6-winner-end-the-game-warmly` off `0219e38`.
- RED-first (server, Task 1): the new `table-server-new-game.do.test.ts` ran 4 failed / 1 passed against the unwired `newGame` (`dispatch.ts default → phase-illegal`) — happy/not-host/double-tap/re-open all failed; the wrong-phase test passed because it already expected `phase-illegal`. GREEN (5/5) after `handleNewGame` + the dispatch case.
- RED-first (client, Task 3): `Winner.svelte.test.ts` ran 4 failed against the 1.9a stub (no copy/button/waiting line). GREEN (4/4) after fleshing the surface.
- RED-first (client, Task 4): the new Host-at-gameOver `Eliminated.svelte.test.ts` case ran 1 failed / 5 passed against the pure-props 3.5 surface (no one-more button). GREEN (6/6) after adding the Host-only gated action.
- Final gates (all green): server `npm test` 192 (19 files; re-run once more, no flake), client `npm test` 118 (15 files), `npm run lint` (eslint clean — GATE-1 egress + GATE-2 purity), `npm run typecheck` (svelte-check 200 files 0 errors / 0 warnings, tsc 0), `npm run build` (PWA built, sw.js generated).

### Completion Notes List

- **Server `newGame` producer (Task 1, AC-3.6.2/.3):** new `handleNewGame` clones the `handleDealAgain` accepted-path chokepoint via the SHARED `requirePhaseConductor(host, intent, callerPlayerId, "gameOver")` — the terminal-only mirror of dealAgain's `roundResult`-only gate, so the two transitions are mutually exclusive on phase. It resets the SAME roster in place (`p.lives = table.startingLives; p.isAlive = true` for every seat — the handleHostSetLives lives-sync precedent; `id`/`name`/`seatIndex`/`isConnected` untouched), returns `phase = "lobby"` (re-opening join — `handleJoinRoom` admits ONLY at lobby), clears the terminal result (`loserIds`/`winnerIds`/`nextStartingPlayerId = undefined`) and the revealed `round = null`, then `bumpPhaseToken` + `persistSummary` (guard→mutate→bump→persist). Dispatch gained `case "newGame"` (→ `handleNewGame` + `fanOut`) before the `default`; the SCOPE header + the "NOT yet implemented" comment now name only the Epic-4 host-controls. No `types.ts`/`project-state.ts`/`persistence.ts`/`validate.ts`/`engine.ts` change (all upstream/frozen — verified `resolveShowdown` already returns `{kind:"winner",winnerIds}` for 1-alive sole AND 0-alive shared win; `toSummary` already omits round + omit-when-absent result fields).
- **Client send seam (Task 2, AC-3.6.2):** `buildNewGameIntent(phaseToken)` (socket.ts, clone of `buildDealAgainIntent`; `newGame` already in the `PhaseIntent` Extract) + `sendNewGame(phaseToken)` (table-store, clone of `sendDealAgain` via the GATE-1-exempt `sendIntent`).
- **Winner surface (Task 3, AC-3.6.1/.5/.6):** `Winner.svelte` fleshed from the 1.9a stub. Names every winner via `filter(winnerIds).map(name)` joined into the ONE `winner(name)` slot ("Ana" / "Ana and Ben" / "Ana, Ben, and Cy") — co-winners through one source string, no plural variant (UX-DR16). Host sees a single `ONE_MORE` Button → `sendNewGame(state.phaseToken)`; a non-Host winner sees a calm `role="status" aria-live="polite"` `WAITING_TO_NEW_GAME` line, never a dead button. SM-1 (AC-3.6.6): only the celebration + the one action — no stats/streak/leaderboard (test asserts none render). Added `ONE_MORE` + `WAITING_TO_NEW_GAME` copy constants; `winner(name)` reused verbatim.
- **Eliminated Host one-more (Task 4, AC-3.6.4, AR-5):** the router sends only the winner to Winner at gameOver; a non-winning/eliminated Host routes to Eliminated. Because the Host conductor role is independent of isAlive/winning (architecture.md:335-336), the SAME one-more action was added to `Eliminated.svelte`, gated `state.you.isHost && state.phase === "gameOver"`. A non-Host spectator, and the Host at a live phase (mid-game elimination, no game to restart yet), see the calm 3.5 spectator surface UNCHANGED (no action). Kept the 3.5 SR announce (`role="status" aria-live="polite"` child region) + the bare `<main>` landmark + the AA tokens — no regression (3.5 cases re-pass). The egress is a guarded Host action via the store seam (GATE-1 clean).
- **No router change:** at gameOver the winner routes to `winner`, every non-winner (incl. a non-winning Host) to `eliminated` — `route-from-state.ts` untouched; its gameOver cases re-pass. The Host's one-more reach is solved by placing the action on BOTH terminal surfaces (the user-confirmed decision), not by re-routing.

### File List

**Server (UPDATE)**
- `server/src/handlers.ts` — new `handleNewGame` (gameOver→lobby producer; reset roster, clear result, round=null, bump, persist).
- `server/src/dispatch.ts` — new `case "newGame"` (→ `handleNewGame` + `fanOut`); imported `handleNewGame`; updated SCOPE header + the not-yet-implemented comment.

**Server (TEST)**
- `server/src/table-server-new-game.do.test.ts` — NEW (5 cases: happy gameOver→lobby / not-host / stale double-tap / wrong-phase / re-open join).

**Client (UPDATE)**
- `client/src/socket.ts` — new `buildNewGameIntent`.
- `client/src/lib/table-store.svelte.ts` — new `sendNewGame`; imported `buildNewGameIntent`.
- `client/src/lib/copy.ts` — new `ONE_MORE` + `WAITING_TO_NEW_GAME` constants (`winner` reused verbatim).
- `client/src/surfaces/Winner.svelte` — 1.9a stub → real celebration surface (co-winner join, Host-only one-more Button, non-Host waiting line).
- `client/src/surfaces/Eliminated.svelte` — added the Host-only `gameOver`-gated one-more action (3.5 spectator behavior preserved).

**Client (TEST)**
- `client/src/surfaces/Winner.svelte.test.ts` — NEW (4 cases: copy+name / shared-win join / Host button→sendNewGame / non-Host waiting + no button).
- `client/src/surfaces/Eliminated.svelte.test.ts` — EXTENDED (+2 cases: Host-at-gameOver button→sendNewGame / Host-at-live-phase no button; store mock added).

## Change Log

- 2026-06-22 — Story 3.6 implemented (Winner — end the game warmly, full-stack): the `newGame` "one more?" producer + the warm Winner celebration. SERVER: new `handleNewGame` (clones `handleDealAgain` via `requirePhaseConductor(expectedPhase="gameOver")` — resets the same roster to full `startingLives`+`isAlive`, returns `phase=lobby`, clears `loserIds`/`winnerIds`/`nextStartingPlayerId`+`round`, bumps phaseToken, persists) + dispatch `case "newGame"`→`handleNewGame`+`fanOut`. `gameOver`→`lobby` re-opens join (existing Players don't re-join). CLIENT: `buildNewGameIntent`/`sendNewGame` send seam; `Winner.svelte` fleshed from the 1.9a stub (co-winners joined into the `winner(name)` slot, Host-only `ONE_MORE` Button→`sendNewGame`, non-Host calm `WAITING_TO_NEW_GAME` waiting line); the same Host-only `gameOver`-gated one-more action ADDED to `Eliminated.svelte` (AR-5 — a non-winning/eliminated Host keeps conducting; router untouched, action on BOTH terminal surfaces). New copy `ONE_MORE`/`WAITING_TO_NEW_GAME`; `winner(name)` reused verbatim. SM-1: exactly one tap, no stats/streak/leaderboard. No `types.ts`/router/engine/projection/persistence change (all upstream/frozen). New `table-server-new-game.do.test.ts` (5 cases) + new `Winner.svelte.test.ts` (4) + extended `Eliminated.svelte.test.ts` (+2); `route-from-state.test.ts` gameOver cases re-pass unchanged. Tests: server 187→192, client 112→118. Lint (GATE-1/2)/typecheck (svelte-check 0 / tsc 0)/build all green. RED-first confirmed.
