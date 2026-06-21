---
baseline_commit: e614b5b
---

# Story 2.3: Deal secret Cards & simultaneous dealt state

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Host,
I want one tap to deal a secret Card to every active Player and move the whole table into the round at once,
so that the reveal-down beat happens simultaneously and play can begin.

## Acceptance Criteria

> Source ACs verbatim from [epics.md#Story 2.3] (lines 545–567). The "**Then**" clauses are the binding contract; the AC IDs are this story's addressing scheme.

**AC-2.3.1 — Deal reconstitutes + reshuffles, deals one Card each, resets `acted`, advances phase; double-tap rejected (FR-5)**
Given a Table in `lobby` with ≥2 Players,
When the Host sends `deal` (carrying the current `phaseToken`),
Then the Deck is reconstituted and reshuffled, each active (`isAlive`) Player receives **exactly one** Card, `round.acted` resets to `[]`, and the phase advances to the turns phase — and a **double-tapped `deal` is rejected by the phase token** (Story 2.2's `checkPhaseToken` → `stale-phase`, no second deal).

**AC-2.3.2 — Per-device projection: own Card only; SM-6 holds; simultaneous dealt state (NFR-1)**
Given the dealt state,
When projections are pushed,
Then each device receives **only its OWN Card** via `projectStateFor` (others' hands omitted while `revealed === false`; the standing SM-6 negative-assertion test still passes), and **all devices transition to the dealt state together** (a single fan-out re-projects every connection) so the reveal-down is simultaneous.

**AC-2.3.3 — Starting Player rule + turn order to the right (FR-5)**
Given Starting Player rules,
When the Round begins,
Then the **Host is the Starting Player on the very first Round of a game** (`round.startingPlayerId === round.currentTurnId === hostId`); turn order proceeds to each Player's right via `nextAliveSeat`; (the previous-Round's-Loser-starts rule is exercised in Epic 3 once a Loser exists — do NOT build it here).

**AC-2.3.4 — Fast-start measure (SM-4 / NFR-7): create→join→dealt well under ~30s**
Given the fast-start measure (end-to-end "let's play" → dealt),
When a Host creates, ~6 Players join, and the Host Deals,
Then the **create→join→dealt path completes in well under ~30 seconds**, measured end-to-end at the moment of `deal` (this is where "dealt" happens), spanning Stories 1.6→1.7→2.3. *(NFR-7 — this story OWNS the end-to-end timing.)*

## Tasks / Subtasks

- [x] **Task 1 — Engine: pure `nextAliveSeat` + `dealRound` in `server/src/rules/engine.ts`** (AC: 2.3.1, 2.3.3)
  - [x] Add `nextAliveSeat(players: Player[], fromSeatIndex: number): string` — the rotation primitive the architecture names in `engine.ts` [architecture.md:316–318, 688]. Walk RIGHT (increasing `seatIndex`, wrapping) from `fromSeatIndex`, skipping non-present seats; return the playerId of the next seat that is `isAlive` (MVP turn-order uses `isAlive`; the `isConnected` turn-skip is Host-conducted-social, NOT auto, per architecture.md:325–328 — do NOT skip on `isConnected` here). Pure: no clock/RNG/IO. This is REUSED by turn order (2.4), "Player to your right" (2.4 swap), and the D6 tiebreak (3.1) — build it once, generically. **Decide & document** the param shape (whole `players[]` + a seat index is recommended — it has the seat ordering and alive flags; do NOT pass the un-ordered playerId list).
  - [x] Add `dealRound(players, deckComposition, rng, startingPlayerId): Round` — PURE. Builds `shuffle(buildDeck(composition), rng)`, deals **exactly one** Card to each `isAlive` Player (deck order; the remaining deck stays in `round.deck` for the Last-Player draw — Story 2.6), constructs the `Round`: `{ startingPlayerId, currentTurnId: startingPlayerId, turnToken: 0, hands, deck: remaining, acted: [], revealed: false }`. The `rng` is INJECTED (the crypto seam stays outside `rules/` — Task 3 passes `cryptoRng()`). Deals only to `isAlive` Players (eliminated seats get no Card — relevant from Epic 3 on; in this story all are alive). **Eliminated/zero-life Players are excluded** by the `isAlive` filter — same predicate `nextAliveSeat` uses, so the dealt set and the turn walk agree.
  - [x] **GATE 2 purity holds** for both new functions: no `Date`/`Math.random`/`crypto`/`fetch`/`storage`/`ws`/`caches`/`console`/`this`/dynamic-`import()`; imports ONLY `@trash/shared`/`./`. `import type { Player, Round, Card } from "@trash/shared"`.

- [x] **Task 2 — validate.ts: the deal-path field validation 2.1 deferred (deck-input gaps #7–9)** (AC: 2.3.1)
  - [x] `deal` is the FIRST real caller of `buildDeck`/`shuffle`, so the deck-input guards 2.1 deferred (deferred-work #7–9) attach HERE — this is the "validate.ts grows as each handler lands" pattern named in 2.2. Add a pure guard the deal handler calls BEFORE `dealRound`. Recommended: `assertDealable(playerCount: number, composition: DeckComposition): void` (or fold into the handler's pre-checks) that rejects with `IntentError("phase-illegal")` when the composition would mis-deal: `composition.decks` must be a finite, positive **integer** (guards #8 `Infinity`-hang, #9 non-integer/0/negative/NaN), and `decks * 52 >= playerCount` (deck must cover the table — by construction `52 >= 20`, but assert it so a future change can't silently under-deal; edge E2). Keep `validate.ts` PURE (GATE 2). The pure-`shuffle` OOB-on-bad-rng gap (#7) is NOT reachable here — production passes `cryptoRng()` which provably returns `[0,1)`; note in a comment that the contract stays caller-enforced (cite #7).
  - [x] In this story the composition is `{ decks: 1 }` (single-deck, ≤10 players — and 2..20 all fit one deck; the 11–20 → 2-deck mapping is Story 5.1, NOT here — do NOT build the playerCount→deckCount mapping). Supply `{ decks: 1 }` at the deal call site (Decision #8 — composition supplied, never assumed).

- [x] **Task 3 — `handleDeal` in `server/src/handlers.ts` + route it in `dispatch.ts`** (AC: 2.3.1, 2.3.2, 2.3.3)
  - [x] Add `handleDeal(host, intent, callerPlayerId): Promise<void>` following the EXACT order the 2.2 chokepoint documents: **shape → table-null → phase → host → guard(phaseToken) → mutate → bump → persist**. Specifically:
    - **shape guard** (lightweight, Decision #1 — mirrors `handleHostSetLives:265`): `typeof intent.payload?.phaseToken !== "number" || !Number.isFinite(...)` → `IntentError("phase-illegal")` (a raw TypeError on the token read would escape as a non-IntentError and the client would hang — same precedent as the lobby handlers).
    - **table-null** → `IntentError("phase-illegal")` (no room to deal).
    - **phase** must be `"lobby"` (the only legal pre-deal phase for the FIRST deal; the `roundResult --dealAgain-->` re-deal is Story 3.4, a DIFFERENT intent) → else `IntentError("phase-illegal")`.
    - **not-host**: `callerPlayerId !== host.table.hostId` → `IntentError("not-host")` (server-authoritative host check, NFR-2 — same as set-lives:280).
    - **≥2 active Players** guard: count `isAlive` Players; `< MIN_PLAYERS` → `IntentError("phase-illegal")` (Deal disabled until ≥2 — the server enforces it independently of the client's disabled button).
    - **guard the phaseToken**: `checkPhaseToken(host.table, intent.payload.phaseToken)` (Story 2.2) — a double-tapped/stale `deal` throws `stale-phase` here, BEFORE any mutation (AC-2.3.1's double-tap rejection). Call `assertDealable(...)` (Task 2) too.
    - **mutate**: `startingPlayerId = hostId` (first-round rule, AC-2.3.3); `host.table.round = dealRound(players, {decks:1}, cryptoRng(), startingPlayerId)`; `host.table.phase = "turns"`. (The `"dealing"` phase is a transient the same transition passes THROUGH — architecture.md:577 "server moves to `turns` in the same transition"; land directly in `"turns"`, do NOT push a `"dealing"` projection. Document this so a reviewer doesn't expect a `dealing` snapshot.)
    - **bump**: `bumpPhaseToken(host.table)` (Story 2.2) — so the next stale `deal` mismatches.
    - **persist**: `await persistSummary(host.storage, host.table)` — the durable summary carries `phase:"turns"` + bumped `phaseToken`; `round` is MEMORY-ONLY and is NOT persisted (toSummary already drops it — AC-2.2.5; verify the deal does NOT try to persist `round`).
  - [x] In `dispatch.ts`: add a `case "deal":` that calls `handleDeal(host, intent, connection.state?.playerId)` then **`fanOut(host.connections(), host.table!)`** — every device re-projects with its OWN Card (AC-2.3.2 simultaneous dealt state). REMOVE `deal` from the `default: throw IntentError("phase-illegal")` rejection comment (it is now implemented) and update the SCOPE header comment (deal is no longer "not in this story"). The single try/catch already turns a thrown `stale-phase`/`not-host`/`phase-illegal` into a targeted `error` — no new catch.
  - [x] `cryptoRng` lives in `server/src/rng.ts` (Story 2.1, OUTSIDE `rules/`) — import it in `handlers.ts` and pass `cryptoRng()` into `dealRound`. The handler is the seam between impure entropy and the pure engine: `dealRound(..., cryptoRng(), ...)`. Do NOT import `crypto` directly in handlers — reuse the existing `rng.ts` seam.

- [x] **Task 4 — projectStateFor: confirm the dealt projection is already correct (no change expected)** (AC: 2.3.2, 2.3.3)
  - [x] READ `project-state.ts` first: it ALREADY projects `you.hand` from `round.hands[playerId]` when a round exists [project-state.ts:39–42], omits all `players[].hand` while `revealed === false` [:56], and sets `currentTurnId`/`turnToken` from the round [:75–78]. So a freshly-dealt `round` (revealed:false) projects each owner's own Card and nothing else — **no projector change should be needed**. If you find a gap, the fix is HERE (the SOLE chokepoint — never project a hand from a handler). Do NOT touch `you.isLastPlayer` (it stays `false` — its real derivation is Story 2.6; project-state.ts:33–35 documents this).
  - [x] Verify the SM-6 standing test (`project-state.test.ts`) still passes UNCHANGED with a real dealt round — it already exercises a populated `hands` map with `revealed:false`. This story does not add a new `ProjectedTableState` field, so the "re-pass SM-6 for the new field" obligation does not trigger; just confirm green.

- [x] **Task 5 — Tests: engine purity/determinism, validate guards, deal handler, dealt projection, DO integration** (AC: all)
  - [x] **`server/src/rules/engine.test.ts`** (extend; node `rules` project): `nextAliveSeat` — wraps right, skips non-`isAlive` seats, single-alive returns itself, seat order respected (batch over a few rosters). `dealRound` — deals exactly one Card per `isAlive` Player; `acted === []`; `revealed === false`; `currentTurnId === startingPlayerId`; `turnToken === 0`; total dealt + `deck.length === 52` (no card lost or duplicated, single-deck); deterministic for a fixed-seed `rng` (reuse the 2.1 LCG pattern — pin a small expected hand assignment). PURE (no banned tokens).
  - [x] **`server/src/rules/validate.test.ts`** (extend; node): `assertDealable` (or the chosen guard) — accepts `{decks:1}` with 2..20 players; rejects `decks` `Infinity`/`0`/`-1`/`1.5`/`NaN` with `IntentError("phase-illegal")`; rejects when `decks*52 < playerCount` (construct a degenerate composition to prove the cover-check bites). These close deferred-work #8/#9 at the deal path.
  - [x] **`server/src/handlers.test.ts`** (create or extend the node-project handler tests if a pattern exists; else cover via the DO test): `handleDeal` rejects not-host (`not-host`), wrong phase (`phase-illegal`), <2 alive (`phase-illegal`), bad shape (`phase-illegal`), and a stale `phaseToken` (`stale-phase` — the phase-scoped reason, NOT `stale-turn`). Accepts the happy path: `round` populated, `phase==="turns"`, `phaseToken` bumped by exactly 1, `acted===[]`, `startingPlayerId===hostId`. NOTE: `handleDeal` needs a `TableHost` stub (mirror how existing handler tests stub it, if any) — if no pure handler-test harness exists, fold these assertions into the DO integration test (Task 5 last bullet) rather than inventing a heavy mock.
  - [x] **`server/src/project-state.test.ts`** (extend, node): one new case — a dealt round (3 seats, distinct ranks, `revealed:false`) projects ONLY the caller's own `you.hand` and omits every `players[].hand`; `phase==="turns"`, `currentTurnId` present. (Complements the standing SM-6 negative assertion — proves the OWNER's card IS present after a real deal, while non-owners' are not.)
  - [x] **`server/src/table-server-deal.do.test.ts`** (NEW, Workers `do` project — mirror `table-server-reload.do.test.ts`'s `SELF.fetch` + WebSocket-upgrade harness): the END-TO-END wire path — create a room, join ≥1 more player over real sockets, send a `deal` intent (with the current `phaseToken`) from the host socket, and assert each socket receives a `tableState` with `phase:"turns"`, its OWN `you.hand` present, other `players[].hand` ABSENT, `currentTurnId === hostId`. Then send a SECOND `deal` with the now-STALE token → assert a targeted `error{reason:"stale-phase"}` and NO second deal (the round/hands are unchanged). Assert the persisted `"table"` key holds `phase:"turns"` + bumped token (the deal persist). This DO test is also where the non-host `deal` rejection (`not-host`) can be exercised over the wire if the pure handler harness is absent.
  - [x] **GATE 2 red/green discipline** (per-story confirmation, like 2.1/2.2): plant a `Date.now()`/`crypto` token in `engine.ts` (or `validate.ts`), see lint go RED, remove → GREEN. Record in Completion Notes (the gate is pre-proven; this confirms it still bites for the new deal code).

- [x] **Task 6 — Fast-start measure (AC-2.3.4 / NFR-7)** (AC: 2.3.4)
  - [x] This AC is a **measured end-to-end property**, not a unit assertion. The DO integration test (Task 5) already exercises create→join(×6)→deal over real sockets in the Workers harness — note in Completion Notes that this path completes near-instantly in-test (no human latency), which is the structural evidence the create→join→dealt round-trip has no blocking/timeout. The "well under ~30s" human-paced claim is validated by manual play once the conductor Deal button lands (Story 4.1) — record that the SERVER path imposes no delay (single DO turn per intent; one fan-out at deal). Do NOT add a wall-clock timer assertion (flaky); the structural evidence + the absence of any sleep/poll in the path is the deliverable here.

- [x] **Task 7 — Verify gates** (AC: all)
  - [x] `npm test` → server (rules + do projects) + client all green; baseline is **server 68 / client 45** (2.2) — the count grows with the new tests; **no regressions** (especially the standing SM-6 test and the 2.2 guard/reload tests).
  - [x] `npm run lint` → green (`engine.ts`/`validate.ts` pass GATE 2; handlers/dispatch pass GATE 1 — no `.send` outside push-state.ts).
  - [x] `npm run typecheck` → 0 errors.

## Dev Notes

### What this story IS / IS NOT
- **IS:** the SERVER deal flow — `handleDeal` (the FIRST gameplay handler) wiring the full accepted chokepoint **guard → mutate → bump → persist** that Story 2.2 built and documented; pure `dealRound` + `nextAliveSeat` added to `engine.ts`; the deal-path deck-input validation 2.1 deferred (deferred-work #8/#9) added to `validate.ts`; `dispatch` routing `deal` → handler → `fanOut`; and the DO-level integration test proving the simultaneous dealt state + own-card-only projection + double-tap rejection over real sockets.
- **IS NOT:** the Your Turn / Waiting surfaces (Story 2.4), the Swap/Keep handlers (2.4), Peek (2.5), the Last-Player draw (2.6 — the leftover `round.deck` is built and carried here but consumed there), `revealAll`/Showdown (Epic 3), the `dealAgain` re-deal (Story 3.4), `isLastPlayer` derivation (2.6), or the conductor-bar **Deal button** (Story 4.1). **No client changes this story** (user-confirmed) — `deal` is server-only until 4.1 wires the button + send path. No new `ProjectedTableState` field, no new `ErrorReason`, no contract change.
- **The `dealing` phase is transient.** Architecture: `deal` does `lobby → dealing → turns` "in the same transition" [architecture.md:577, 584]; the server lands directly in `"turns"` — do NOT emit a `"dealing"` projection or pause there. `"dealing"` exists in the `Phase` union for completeness but no snapshot is ever pushed in it this story.

### The accepted-path chokepoint — the order every gameplay handler now follows (from 2.2)
`handleDeal` is the FIRST consumer of the 2.2 primitive, so it SETS the precedent the swap/keep/draw/reveal handlers copy:
```
shape-guard → table-null → phase-check → host-check → ≥2-alive → checkPhaseToken(state, token)
  → mutate (dealRound + phase="turns") → bumpPhaseToken(state) → persistSummary → [dispatch] fanOut
```
- `checkPhaseToken` / `bumpPhaseToken` are imported from `server/src/rules/validate.ts` (Story 2.2). The guard THROWS `stale-phase` on a mismatch (a double-tapped `deal`) — caught by dispatch's single try/catch and turned into a targeted `error`; the client (2.2) swallows it silently. [validate.ts:49–65; dispatch.ts:81–87.]
- The bump happens AFTER a successful mutate and BEFORE persist, so the persisted token and the in-memory token agree, and the next stale copy mismatches. This is exactly the loop 2.2's tests pin (bump → stale copy throws). [2.2 Dev Notes; validate.test.ts.]
- deferred-work #117 (the bumps are bare mutators with no enforced check-coupling) — `handleDeal` is the FIRST place to honor the order BY CONVENTION. Keep `checkPhaseToken` and `bumpPhaseToken` visibly adjacent in the handler so the pairing reads as one unit; do NOT bump without a prior check or without persisting.

### validate.ts scope — this story grows it (the 2.2 carry-forward, now due)
- 2.2 shipped the guard PRIMITIVE only and left a header comment in `validate.ts` naming the future field-validation obligation. **2.3 is where the DEAL-path field validation lands** — the deck-input gaps 2.1 deferred (deferred-work #7–9): `decks` finite/positive-integer, deck-covers-table. This is the named pattern: "field validation attaches to the story that introduces each intent's handler." [validate.ts:13–18; 2.2 Dev Notes "validate.ts scope"; deferred-work #8/#9.]
- Do NOT front-load the OTHER intents' field checks (swap/keep `turnToken` bounds → 2.4; `rank` 1..13 → only matters where a Card is read, Showdown 3.1; `hostSetLives` already clamps in its handler). Add ONLY the deal-path guards this story's handler needs.
- deferred-work #7 (pure `shuffle` OOB on a bad `rng`) is NOT reachable from the deal path — production `cryptoRng()` provably returns `[0,1)`. Leave it caller-enforced; note it in a comment.

### Engine helpers — pure, REUSED downstream (build generically)
- `nextAliveSeat(players, fromSeatIndex)` is the SINGLE rotation primitive [architecture.md:316–318]. It is reused by: turn order (2.4 passes after swap/keep), "Player to your right" (2.4 swap target), and the D6 starting-player tiebreak (3.1). Build it once, generic over the `players[]` + a seat index — do NOT special-case the deal. Walk by `seatIndex` (immutable-for-life, never re-indexed [architecture.md:319]), skip seats that are not `isAlive`, wrap around.
- **MVP turn-order skips on `isAlive` ONLY, not `isConnected`.** A disconnected-but-alive Player still owes a Turn; the Host conducts around them socially (no auto-skip in MVP) [architecture.md:325–328]. So `nextAliveSeat` filters on `isAlive`; do NOT add an `isConnected` skip (that would silently change turn order vs. the spec).
- `dealRound` deals to `isAlive` Players only. In THIS story every Player is alive (eliminations are Epic 3), but coding the `isAlive` filter now means the same function works for `dealAgain` (3.4) with eliminated seats excluded (FR-11) — and the dealt set matches the `nextAliveSeat` walk. The remaining `deck` (52 − playerCount cards) is carried in `round.deck` for the Last-Player draw (2.6) — build it, leave it; do NOT add draw logic.

### Current code state (verified — read these before writing)
- **`server/src/rules/engine.ts`** [engine.ts:1–60]: exports `buildDeck(composition)`, `shuffle(deck, rng)`, types `DeckComposition = {decks:number}` + `Rng = () => number`. `dealRound`/`nextAliveSeat` do NOT exist — you ADD them here. Reuse `buildDeck`/`shuffle` exactly as-is (do not reimplement).
- **`server/src/rules/validate.ts`** [validate.ts:1–65]: exports `checkTurnToken`/`checkPhaseToken` (compare + throw) + `bumpTurnToken`/`bumpPhaseToken`. The deal handler CONSUMES `checkPhaseToken`/`bumpPhaseToken`. ADD the deal-path field guard here (Task 2).
- **`server/src/rng.ts`** [rng.ts:15–21]: `cryptoRng(): Rng` — the production entropy seam OUTSIDE `rules/`. Import + call in `handlers.ts`; pass into `dealRound`. (Story 2.1 already verified it composes with `shuffle`.)
- **`server/src/handlers.ts`** [handlers.ts:1–319]: `handleCreateRoom`/`handleJoinRoom`/`handleHostSetLives`/`markDisconnected`. ADD `handleDeal` following the `handleHostSetLives` shape (shape→table-null→phase→host→mutate→persist) PLUS the guard+bump (the new bit). The `TableHost` interface [:19–37] is the handler's view of the DO (`table`, `storage`, `connections()`); no change needed. Mirror the payload-shape-guard precedent [:265] and the not-host check [:280].
- **`server/src/dispatch.ts`** [dispatch.ts:41–88]: the single router + try/catch. ADD `case "deal":`. The `default: throw IntentError("phase-illegal")` [:78–79] currently rejects all gameplay intents — REMOVE `deal` from that set (update the SCOPE comment [:4–7, :76–77]). `fanOut` is already imported [:25]. The catch [:81–87] already converts a thrown `IntentError` to a targeted `error` — no change.
- **`server/src/project-state.ts`** [project-state.ts:15–81]: the SOLE projector. Already handles `you.hand` (own card from `round.hands`), omits non-owner hands while `revealed===false`, projects `currentTurnId`/`turnToken`. Expected NO change (Task 4 verifies). The `you.isLastPlayer:false` stub [:33–35] stays — its derivation is 2.6.
- **`server/src/push-state.ts`** [push-state.ts:33–61]: `pushState`/`pushError`/`fanOut` — the ONLY `.send` site (GATE 1). The deal re-projection is `fanOut(connections, state)` in dispatch (already the join/set-lives pattern). Do NOT call `.send` from a handler.
- **`server/src/table-server.ts`** [table-server.ts:104–120]: `onMessage` parses the envelope → `dispatch`. No DO change needed for deal (the handler does the persist; `onStart` reconcile/re-persist is 2.2, already correct). The deal does arm no new alarm beyond the existing `armIdleAlarm()` post-dispatch.
- **`server/src/persistence.ts`** [persistence.ts:33–53]: `toSummary` ALREADY drops `round` + `isConnected`; `persistSummary` writes the `"table"` key. The deal persist reuses `persistSummary(host.storage, host.table)` with `phase:"turns"` — `round` is automatically excluded (AC-2.2.5). VERIFY: do not add a per-field round persist.
- **`shared/src/types.ts`** [types.ts]: `Intent` already names `{type:"deal", payload:{phaseToken:number}}` [:151]; `Round`/`Phase`/`Player`/`ErrorReason` all frozen and sufficient. NO contract change — do not add a field or ErrorReason.
- **`shared/src/config.ts`**: `MIN_PLAYERS=2`, `MAX_PLAYERS=20`, `SINGLE_DECK_MAX_PLAYERS=10`. Use `MIN_PLAYERS` for the ≥2 guard. The playerCount→deckCount mapping that would use `SINGLE_DECK_MAX_PLAYERS` is **Story 5.1** — supply `{decks:1}` here.

### SM-6 / privacy — the load-bearing invariant the deal must not breach
- A dealt Card is delivered ONLY to its owner's device, NEVER to anyone else, before Showdown (NFR-1, the one hard integrity rule). This is enforced at the SINGLE chokepoint `projectStateFor` [project-state.ts:1–8] — the deal handler must NOT serialize a hand itself (it routes through `fanOut` → `pushState` → `projectStateFor`, never `.send`). Because the projector already redacts non-owner hands while `revealed===false`, a correct deal that populates `round.hands` and fans out is SM-6-safe by construction.
- The standing negative-assertion test [project-state.test.ts] is the CI gate. It already runs against a populated `hands` map; confirm it stays green. This story adds NO `ProjectedTableState` field, so the "re-pass SM-6 for any NEW field" rule does not trigger — but if a reviewer asks, the deal exposes only `you.hand` (the owner's own), which the test's owner-card assertion already covers.

### Testing standards (match the house style)
- **Vitest projects** [server/vitest.config.ts]: `name:"rules"` (env `node`, `src/**/*.test.ts`, EXCLUDES `*.do.test.ts`) for pure tests — `engine.test.ts`, `validate.test.ts`, `project-state.test.ts`. `name:"do"` (pool-workers, `*.do.test.ts`) for the DO integration test. Name the new DO test EXACTLY `*.do.test.ts` (any other suffix runs in NO project — silent zero coverage).
- **Style** [engine.test.ts; identity.test.ts; validate.test.ts]: `import { expect, test } from "vitest"`; descriptive names ("dealRound: deals exactly one card per alive player"); batch loops for properties; explicit regression-guard tests; `expect(() => fn()).toThrow(IntentError)` + assert `err.reason`.
- **Determinism** [2.1 engine.test.ts]: reuse the tiny LCG seed pattern to pin `dealRound`'s card assignment for a fixed seed (proves the deal is deterministic-testable, the whole point of the injected `rng`).
- **DO integration** [table-server-reload.do.test.ts; table-server.do.test.ts; scaffold.do.test.ts]: `SELF.fetch(...,{headers:{Upgrade:"websocket"}})` → `res.webSocket` → `ws.accept()`; send intents as JSON strings; read pushed `tableState` events off the socket; read the persisted `"table"` key via `runInDurableObject(stub, ... state.storage.get("table"))`. Mirror the reload test's `seedSummary`/`wakeDurableObject`/`readPersisted` helpers and the create/join DO test's intent-send pattern.

### Previous story intelligence (Stories 2.1 + 2.2 — both done)
- **2.1** shipped pure `buildDeck`/`shuffle` + the `cryptoRng()` seam (`rng.ts`, outside `rules/`) and the narrow GATE 2 test-file import exemption (`vitest` allowed in `rules/**/*.test.ts`). `engine.test.ts`/`validate.test.ts` inherit that exemption — no eslint change. 2.1 deferred the deck-input guards (#7–9) explicitly to "validate.ts / the deal path" — that is THIS story (Task 2).
- **2.2** built the guard PRIMITIVE (`checkPhaseToken`/`bumpPhaseToken`) and DOCUMENTED the accepted-path order `guard → mutate → bump → persist` as the canonical convention future handlers follow — `handleDeal` is the first to USE it. 2.2 also closed the D2.1 re-persist (#61) and locked AC-2.2.5 (`round` never persisted) by test — the deal persist relies on that boundary holding. 2.2 deferred (#117): the bumps are bare mutators — honor the order by convention in `handleDeal`.
- **2.2 review** flagged (deferred): `checkTurnToken` would deref a `null` round in a future swap/keep caller — NOT this story (deal reads no turn token), but the swap handler (2.4) must null-check `round` before `checkTurnToken`. Noted for continuity.

### Git intelligence
- Recent commits (1.11 → 2.1 → 2.2) are one tightly-scoped slice each, full gate verification, no scope creep. 2.1 added `engine.ts` + tests; 2.2 added `validate.ts` + a small `onStart` re-persist + a client comment. **2.3 should be similarly contained:** `engine.ts` (+`dealRound`/`nextAliveSeat`), `validate.ts` (+deal-path guard), `handlers.ts` (+`handleDeal`), `dispatch.ts` (+`case "deal"`), tests (engine/validate/project-state/new DO test). No client change, no contract change, no new dependency. Do NOT add a validation library (the contract is type-only + the pure `IntentError`).

### Project Structure Notes
- **Modified:** `server/src/rules/engine.ts` (+`dealRound`, `nextAliveSeat`); `server/src/rules/validate.ts` (+deal-path field guard); `server/src/handlers.ts` (+`handleDeal`, import `cryptoRng`/engine/validate helpers); `server/src/dispatch.ts` (+`case "deal"`, update SCOPE comment + default-reject set).
- **New:** `server/src/table-server-deal.do.test.ts` (Workers `do` project — the end-to-end deal wire test).
- **Modified (tests):** `server/src/rules/engine.test.ts`, `server/src/rules/validate.test.ts`, `server/src/project-state.test.ts` (extend each).
- **Possibly new:** `server/src/handlers.test.ts` (only if a pure handler-test harness fits; otherwise fold handler-rejection assertions into the DO test — do NOT invent a heavy `TableHost` mock).
- **No change:** `shared/src/types.ts` (contract frozen — `deal` intent + `Round`/`Phase` already named), `shared/src/config.ts`, `project-state.ts` (expected — verify only), `push-state.ts`, `table-server.ts`, `persistence.ts`, `eslint.config.js` (2.1 exemption covers the rules tests), `wrangler.jsonc`, and ALL client files (user-confirmed server-only scope).

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.3 — Deal secret Cards & simultaneous dealt state (lines 545–567)] — the source ACs.
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2 (490–494) — FRs FR-5/6/7/8; binding decisions #1 (two-scope guard, phase token guards `deal`), #8 (deck composition supplied)]
- [Source: _bmad-output/planning-artifacts/architecture.md#D1 State Shape (300–344) — Round shape, seating, `nextAliveSeat`, `acted` resets at Deal, `currentTurnId` sole turn authority, isAlive vs isConnected; #D2/D2.1 persistence (346–363); #D3 protocol/Intent (365–387 — `deal` carries phaseToken); #D4 guard (389–403); #D5 deck/shuffle (405–418); phase machine (570–590 — `lobby --deal--> dealing -> turns`, `dealing` transient); engine.ts responsibility (688)]
- [Source: server/src/rules/engine.ts:1–60 (buildDeck/shuffle/DeckComposition/Rng); server/src/rng.ts:15–21 (cryptoRng seam)]
- [Source: server/src/rules/validate.ts:1–65 (checkPhaseToken/bumpPhaseToken consumed here; validate.ts-scope header naming the field-validation home)]
- [Source: server/src/handlers.ts:259–295 (handleHostSetLives — the shape→table-null→phase→host→mutate→persist precedent + payload-shape guard); :61–117 (handleCreateRoom claim/build); dispatch.ts:41–88 (router + single try/catch + default reject); push-state.ts:33–61 (fanOut/pushState); project-state.ts:15–81 (projector — own-hand only, revealed switch)]
- [Source: server/src/persistence.ts:33–53 (toSummary drops round + persistSummary); shared/src/types.ts:39–46 (Phase), 66–74 (Round), 148–155 (Intent — deal), 171–178 (ErrorReason); shared/src/config.ts (MIN_PLAYERS, SINGLE_DECK_MAX_PLAYERS)]
- [Source: server/src/table-server-reload.do.test.ts (DO test harness — SELF.fetch upgrade, runInDurableObject seed/read); server/src/project-state.test.ts (standing SM-6 negative-assertion gate); server/vitest.config.ts (rules vs do projects)]
- [Source: _bmad-output/implementation-artifacts/deferred-work.md #7–9 (deck-input gaps owned by the deal path / validate.ts — THIS story), #117 (bump mutators — honor order by convention); 2-2 story Dev Notes (accepted-path order, validate.ts scope); 2-1 story (buildDeck/shuffle/cryptoRng + deferred inputs)]

## Review Findings

> Code review 2026-06-20 (Blind Hunter + Edge Case Hunter + Acceptance Auditor, full mode). All four ACs SATISFIED; all scope constraints (server-only, no contract change, no new ErrorReason, `isLastPlayer` stays false, no deckCount mapping, `round` memory-only, lands directly in `turns`) hold. 1 patch, 3 deferred, 5 dismissed.

- [x] [Review][Patch] Handler header comment documents the WRONG guard order vs. the actual code [server/src/handlers.ts:313] — FIXED 2026-06-20: header order aligned with code + cross-reference to the inline token-before-phase rationale. — the precedent-setting JSDoc lists `shape → table-null → phase → host → ≥2-alive → checkPhaseToken → mutate → bump → persist`, but the implemented (and correct, deliberate, tested) order is `shape → table-null → not-host → checkPhaseToken → phase → ≥2-alive → assertDealable → mutate → bump → persist`. The Completion Notes (line 181) document the real ordering and its rationale (token-before-phase so a benign double-tap surfaces as `stale-phase`, not `phase-illegal`). Since this handler bills itself as "the precedent every later handler copies," the stale comment will mislead 2.4+ copy-paste. Fix: align the header comment's order with the code (and the inline rationale at :354-360).

- [x] [Review][Defer] `nextAliveSeat` silently returns a wrong-but-plausible seat on an unknown `fromSeatIndex` [server/src/rules/engine.ts:77,87] — deferred, not reachable in 2.3 (deal does not call `nextAliveSeat`); latent for the 2.4/3.1 reuse it is built for.
- [x] [Review][Defer] `dealRound` has no internal bounds guard; writes `undefined` into `Record<string,Card>` if the deck can't cover the alive set [server/src/rules/engine.ts:115] — deferred, prevented in 2.3 by `assertDealable` at the sole caller; latent for `dealAgain` (3.4) / alternate-composition reuse.
- [x] [Review][Defer] `dealRound` trusts `startingPlayerId` without verifying it is an alive, seated player [server/src/handlers.ts:383 → engine.ts:118-119] — deferred, the first-deal caller passes `hostId` (always alive/seated in lobby); latent for `dealAgain` (3.4) where the host could be eliminated.

## Dev Agent Record

### Agent Model Used

Amelia (Senior Software Engineer persona) on Claude Opus 4.8 (1M context).

### Debug Log References

- `npx vitest run src/rules/engine.test.ts` → 20 passed (10 new: `nextAliveSeat` right-walk/wrap/skip-dead/single-alive/seat-order; `dealRound` one-card-per-alive/fresh-invariants/alive-only/no-loss-or-dupe/determinism).
- `npx vitest run src/rules/validate.test.ts` → 15 passed (5 new: `assertDealable` accepts 1 deck for 2..20 + 2 decks; rejects Infinity/0/-1/NaN/1.5 → phase-illegal; rejects deck-can't-cover-table).
- `npx vitest run src/project-state.test.ts` → 3 passed (1 new: a dealt round projects the caller's own hand only, `phase:"turns"`, currentTurn=host, no players[].hand — no projector change was needed).
- `npx vitest run --project do src/table-server-deal.do.test.ts` → 5 passed (Workers runtime, real sockets: deal moves all devices to `turns` together with own-card-only + host-starts; double-tap → `stale-phase`, no second deal, round never persisted; non-host → `not-host`; <2 players → `phase-illegal`; 6-seat fast-start structural evidence).
- `npm test` (root) → server **89 passed (13 files)**, client **45 passed (5 files)** — baseline was 68/45; **+21 server, +0 client**, no regressions (standing SM-6 gate + 2.2 guard/reload tests all still green).
- `npm run lint` → green; `npm run typecheck` → 0 errors.
- **GATE 2 red/green proof:** planted `Date.now()` in `engine.ts` `dealRound` → `eslint` RED (2 errors: `no Date.now` / `no Date`); removed → GREEN. No planted tokens remain.

### Completion Notes List

- **First gameplay handler — the accepted-path chokepoint is now LIVE (AC-2.3.1/.2/.3):** `handleDeal` (server/src/handlers.ts) runs the order Story 2.2 documented and SETS THE PRECEDENT for 2.4+: `shape → table-null → not-host → checkPhaseToken → phase-legality → ≥2-alive → assertDealable → mutate (dealRound + phase="turns") → bumpPhaseToken → persistSummary`, with `fanOut` in dispatch's `case "deal"`. `checkPhaseToken`/`bumpPhaseToken` are the 2.2 primitives, kept visibly adjacent (deferred-work #117 — honor the order by convention).
- **Guard-before-phase ordering decision (AC-2.3.1):** the AC requires a double-tapped deal to be rejected *by the phase token*. The race: two deals both carry token 0; the first is accepted (bumps to 1, moves to `turns`); the second still carries 0. I placed `checkPhaseToken` BEFORE the `phase==="lobby"` gate so the benign double-tap surfaces as `stale-phase` (silently swallowed by the client, Story 2.2) rather than `phase-illegal`. A deal carrying the CORRECT current token on a non-lobby phase still falls through to the phase gate (correctly `phase-illegal`). Verified by the DO double-tap test.
- **Pure engine (AC-2.3.1/.3):** `dealRound(players, composition, rng, startingPlayerId)` reconstitutes+reshuffles via the existing `buildDeck`/`shuffle`, deals one card to each `isAlive` seat in deck order, carries the remaining deck for the Last-Player draw (2.6), and sets the fresh-round invariants (`turnToken:0`, `acted:[]`, `revealed:false`, `currentTurnId=startingPlayerId`). `nextAliveSeat(players, fromSeatIndex)` is the single rotation primitive (sorts by `seatIndex`, walks right wrapping, skips non-`isAlive`, lone-alive returns itself) — built generic for reuse by 2.4 turn-order/swap-target and the 3.1 tiebreak. Both PURE (GATE 2). `rng` is injected; the handler supplies `cryptoRng()` (rng.ts seam, outside rules/).
- **`"dealing"` is transient:** the handler advances `lobby → turns` directly (architecture "in the same transition"); no `"dealing"` snapshot is ever pushed.
- **validate.ts grew the deal-path field validation (closes #8/#9):** `assertDealable(playerCount, composition)` rejects a non-finite/non-integer/non-positive `decks` (one `Number.isInteger` predicate covers Infinity/NaN/0/negative/1.5) and a composition that can't cover the table (`decks*52 < playerCount`, edge E2). The related #7 (pure `shuffle` OOB on a bad rng) is NOT reachable from the deal path (production `cryptoRng()` provably returns `[0,1)`) — left caller-enforced, noted in a comment.
- **SM-6 holds, no projector change (AC-2.3.2):** `projectStateFor` already emitted `you.hand` from `round.hands` and omitted non-owner hands while `revealed===false` — confirmed by a new pure test AND the DO wire test (the host's serialized projection contains exactly ONE `"hand"` key). The standing SM-6 negative-assertion gate passes unchanged.
- **`round` stays memory-only (AC-2.2.5 preserved):** the deal persists via `persistSummary` (toSummary drops `round`); the DO double-tap test asserts the durable `"table"` key holds `phase:"turns"` + bumped token and NO `round`.
- **Fast-start (AC-2.3.4 / NFR-7):** the 6-seat DO test exercises create→join×5→deal over real sockets and completes near-instantly — structural evidence the server path has no sleep/poll/timeout (one DO turn per intent + a single fan-out at deal). The human-paced "<30s" claim is validated by manual play once the conductor Deal button lands (Story 4.1); no flaky wall-clock assertion added.
- **Scope held (user-confirmed):** server-only — NO client changes (the Deal button is the conductor bar, Story 4.1; Your Turn/Waiting are 2.4). No contract change (`shared/src/types.ts` already named the `deal` intent + `Round`/`Phase`); no new `ErrorReason`; no validation library. `you.isLastPlayer` stays `false` (its derivation is 2.6).
- **Test-harness note:** under WebSocket Hibernation the join fan-outs to each socket are staggered/interleaved, so the DO deal test reads-until-phase (`nextPhase`) / reads-until-error (`nextErrorReason`) and waits on the durable roster before dealing — the same delivery-timing-decoupling lesson the 1.7 concurrency test established (poll the source of truth, don't count events).

### File List

- `server/src/rules/engine.ts` (MODIFIED) — added pure `nextAliveSeat(players, fromSeatIndex)` (rotation primitive) and `dealRound(players, composition, rng, startingPlayerId)` (build/shuffle/deal one card per alive seat → fresh Round); imports `Player`/`Round` types.
- `server/src/rules/engine.test.ts` (MODIFIED) — +10 node tests for `nextAliveSeat` + `dealRound`.
- `server/src/rules/validate.ts` (MODIFIED) — added pure `assertDealable(playerCount, composition)` (deal-path deck-input validation, closes deferred-work #8/#9); imports `DeckComposition` type from `./engine.js`.
- `server/src/rules/validate.test.ts` (MODIFIED) — +5 node tests for `assertDealable`.
- `server/src/handlers.ts` (MODIFIED) — added `handleDeal` (the first gameplay handler: full guard→mutate→bump→persist chokepoint); imports `dealRound`, `assertDealable`/`checkPhaseToken`/`bumpPhaseToken`, `cryptoRng`, `MIN_PLAYERS`.
- `server/src/dispatch.ts` (MODIFIED) — added `case "deal"` → `handleDeal` + `fanOut`; removed `deal` from the not-implemented default set; updated the SCOPE header comment.
- `server/src/project-state.test.ts` (MODIFIED) — +1 node test: a dealt round projects only the caller's own hand (confirms no projector change was needed).
- `server/src/table-server-deal.do.test.ts` (NEW) — Workers-runtime end-to-end deal wire tests (5): simultaneous dealt state + own-card-only + host-starts; double-tap `stale-phase`; non-host `not-host`; <2-player `phase-illegal`; 6-seat fast-start structural evidence.

### Change Log

- 2026-06-20 — Implemented the server-side `deal` flow (Story 2.3): pure `dealRound` + `nextAliveSeat` in `rules/engine.ts`; deal-path deck-input validation `assertDealable` in `rules/validate.ts` (closes deferred-work #8/#9); `handleDeal` in `handlers.ts` wiring the first live accepted-path chokepoint (guard → mutate → bump → persist, consuming the 2.2 primitive); `case "deal"` + fan-out in `dispatch.ts`. `lobby → turns` directly (transient `dealing`), one secret Card per alive seat, Host is the first-round Starting Player, double-tap rejected by the phase token (`stale-phase`), SM-6 holds (own-card-only projection — no projector change), `round` stays memory-only. +21 server tests (engine/validate/project-state/new DO integration test); client unchanged (server-only scope); lint + typecheck green; GATE 2 red/green re-proven for the new deal code. Status → review.
