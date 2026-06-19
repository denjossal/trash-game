---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-06-19'
inputDocuments:
  - '_bmad-output/planning-artifacts/briefs/brief-trash-game-2026-06-19/brief.md'
  - '_bmad-output/planning-artifacts/prds/prd-trash-game-2026-06-19/prd.md'
  - '_bmad-output/planning-artifacts/prds/prd-trash-game-2026-06-19/addendum.md'
  - '_bmad-output/planning-artifacts/research/technical-realtime-multiplayer-web-game-architecture-research-2026-06-18.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-trash-game-2026-06-19/EXPERIENCE.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-trash-game-2026-06-19/DESIGN.md'
workflowType: 'architecture'
project_name: 'trash-game'
user_name: 'Dennis_Salcedo'
date: '2026-06-19'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:** 14 FRs in 5 groups. The architecturally load-bearing
set is the Round-loop machine (FR-5–FR-12): a server-authoritative phase machine
`lobby → dealing → turns → allActed → showdown → roundResult → (dealAgain→dealing |
gameOver→newGame→lobby)`, driven entirely by guarded Host-conducted transitions with no
timers. (`turns→allActed` and `showdown→roundResult|gameOver` are server-internal; all
other edges are Host intents. The canonical `Phase` list and full transition map are in
Implementation Patterns §The contract types.) Swap is an *exchange* (FR-6);
Last Player may draw from deck (FR-7); King is social-only with zero app logic (FR-8);
Showdown computes lowest by value only, suit ignored, ties = multiple losers incl.
all-tied (FR-10/11); auto deck-scaling 1 deck ≤10 / 2 merged decks 11–20 (FR-13);
Host mid-session controls off the turn critical path (FR-14).

**Non-Functional Requirements (architecture-driving):**
- **Secret-card privacy (HARD, pass/fail — §11.1, SM-6):** a Card value is delivered
  only to its owner until Showdown; never broadcast, never inferable from behavior.
  This is a property of the *bytes on the wire*, not just app logic — so it is enforced
  at a single egress chokepoint and verified by a negative-assertion test (see
  Cross-Cutting Concerns). No feature may branch on a non-owner's card (the reason
  King is social-only).
- **Zero ongoing cost (HARD, launch gate — §11.2):** free-tier hosting, idle-to-zero.
  This is a *runtime-dependent* property, not a static design property — it depends on
  WebSocket Hibernation being wired in AND on rooms being garbage-collected. Treated
  as a launch-gate dependency, not a routine item.
- **Stable identity (HARD — §11.3):** all state keyed by playerId + session token,
  not socket id, from day one. This is load-bearing for *gameplay we ARE shipping*
  (turn-ownership validation, showdown attribution, private card re-delivery on a
  device wake) — NOT a reconnection feature. Reconnect-readiness is a free byproduct;
  the reconnection flow itself is an explicit non-goal (deferred).
- **Server-authoritative:** clients send intents only; the server validates phase,
  turn ownership, and Host-only actions, and computes all results. Client timestamps
  are never trusted — server arrival-order + sequence is the only ordering authority.
- **Simultaneity / reveal finality:** the Showdown reveal is gated server-side by the
  phase token — reveal is rejected unless `phase === "allActed"` (the phase the server
  enters once every live Player has acted), so all cards are already final before any is
  made public.
  "Simultaneous" is then a *presentation* concern (best-effort broadcast flip);
  millisecond time-sync is deferred (in-person social contagion carries the beat).
- **Showdown flip-safety:** ≤400ms, no strobe/full-viewport flash; Reduce-Motion skips.

**Scale & Complexity:**
- Primary domain: real-time web (stateful WebSocket server + thin PWA client)
- Complexity level: **MEDIUM** — *low implementation effort, HIGH correctness
  criticality.* Code volume is small (few thousand LOC), but three invariants fail
  SILENTLY with green tests if wrong: secret-card privacy, server-authority, and
  reveal-finality. The grading reflects the cost of a silent violation, not the LOC.
- Estimated architectural components: ~6 — (1) per-room authoritative state container
  (one Durable Object per Table), (2) pure transport-agnostic rule engine, (3) WS
  event-protocol layer (intents in / events out), (4) egress/projection function
  `projectStateFor(playerId, table)` — the SINGLE chokepoint for all client-bound
  messages and the privacy enforcement point, (5) PWA client with state-derived
  surface routing (a device asks "what's my current surface + my private hand?" and
  renders authoritative truth — re-enterable on wake), (6) identity/session layer.

### Technical Constraints & Dependencies

- Recommended stack (re-verify free-tier limits at build time): **PartyServer on
  Cloudflare Workers + Durable Objects** (one DO per Table), PartySocket client served
  free via Cloudflare Pages, JSON over WSS, TypeScript. Decision: commit to
  `partyserver` now (the frozen legacy `partykit` CLI is not carried). Rules kept
  transport-agnostic to (a) make the Socket.IO fallback cheap and (b) unit-test
  without the transport — and to firewall PartyServer as ejectable sugar over
  Cloudflare-native DO+WebSocket primitives given post-acquisition ecosystem flux.
- Shuffle: Fisher–Yates seeded by a CSPRNG (never Math.random()).
- **Launch-gate dependencies to confirm before committing (elevated from "open items"):**
  (a) confirm Durable Objects are usable at $0 on the current Cloudflare free tier
  and capture the actual free-tier numbers (request/duration/storage); (b) confirm
  WebSocket Hibernation is wired and compatible with PartyServer's connection model
  (idle rooms must cost nothing); (c) crude room/Room-Code GC + TTL (orphaned rooms
  are the only path from $0 to not-$0).
- **Architecture decisions to PIN DOWN (rules + mechanisms, not subsystems):**
  the monotonic-guard principle (turn token + phase token — see Cross-Cutting #3);
  multi-loser starting-player tiebreak (a one-line RULE in the engine, not a
  subsystem); minimal mid-round state rehydration on Worker restart/wake (no general
  persistence framework).

### Cross-Cutting Concerns Identified

1. **Secret-state privacy** — enforced at ONE chokepoint: `projectStateFor(playerId,
   table)` is the SOLE producer of client-bound payloads; direct `connection.send` /
   `room.broadcast` of game state is forbidden (review/lint-enforced) — the chokepoint
   is a guarantee only if nothing bypasses it. Verified by a negative-assertion egress
   test that fails if any card value reaches a non-owner (this test IS the SM-6
   acceptance criterion). (If persistence returns in v1.1, this invariant must extend
   to any re-serialization of stored state.)
2. **Server-authoritative intent validation** — phase + turn-ownership + Host-only.
   Reveal-finality is enforced by the phase token: a reveal is rejected unless
   `phase === "allActed"`, so no card is ever both mutable and visible. This collapse of
   the commit-reveal barrier into one guard DEPENDS ON three server-enforced
   sub-guarantees (now explicit acceptance criteria): (a) one-pass turn order, (b)
   reveal gated on `phase === "allActed"`, (c) no post-action card mutation.
3. **Monotonic-guard principle (two scopes)** — the single design idea that makes
   turn-race, replayed/double-tap intents, idempotency, ordering, AND reveal-finality
   one family of check: a **turn token** guards turn-scoped intents (swap/keep/draw —
   accept only if token == expected, then advance, so races/dupes mismatch), and a
   **phase token** guards Host-conducted transitions (deal/reveal/re-deal/host-controls
   and join — accept only if phase == expected, then advance, so a double-tapped
   conductor action finds the phase already moved). Same monotonic-guard idea at two
   scopes; client timestamps are never consulted.
4. **Stable-identity keying** — playerId + session token everywhere (load-bearing for
   gameplay; reconnect-readiness is a free byproduct, not a built feature).
5. **State-derived re-enterable routing** — surface AND private hand are a pure
   function of authoritative current state; a woken/locked phone re-derives truth
   rather than replaying missed events (protects the Reluctant Player's zero-confusion
   gate).
6. **Zero-cost / idle-to-zero operability** — depends on Hibernation + room GC. NOTE
   (Story 1.1 spike): the idle-billing benefit and the GC connection-probe BOTH require
   partyserver Hibernation to be explicitly enabled (so sockets are accepted via
   `ctx.acceptWebSocket()`); GB-s only stop accruing for hibernated connections, and
   `ctx.getWebSockets()` only sees hibernation-accepted sockets — see D7.

### Deferred (explicitly OUT of MVP — each safe to defer, no MVP success metric at risk)

- Reconnection flow / session resumption / retry UX (identity keying stays; the flow
  does not — explicit non-goal).
- Host-disconnect / host succession (in-person: a dead Host phone → the table
  re-creates in seconds; fast-start covers it). First item v1.1 picks up.
- Clocked / time-synced reveal (in-person social contagion carries the "OHHH"; plain
  broadcast flip is sufficient and more true to the room).
- Durable Object eviction-persistence of mid-round state (a DO stays warm under
  continuous WS traffic for cooperative friends-and-family play; documented as
  known data-loss-on-Worker-restart — friends tolerate one re-deal).
- Timing/size side-channel privacy hardening (a public-launch threat model, not 8
  cooperative friends in a room).
- Room-create rate-limiting / abuse protection — DEFERRED per user decision: the MVP
  is a CONTROLLED/SOFT LAUNCH (link shared with friends/family, not promoted publicly);
  Cloudflare platform limits are the backstop. `[ASSUMPTION — revisit if the create
  endpoint is ever openly exposed on the public internet: the brute-forceable 4-letter
  Room-Code namespace + open create endpoint would then become a real cost/abuse risk
  and this flips to MVP.]`

## Starter Template Evaluation

### Primary Technology Domain

Real-time web: a stateful WebSocket server (Cloudflare Worker + one Durable Object per
Table via `partyserver`) plus a thin client PWA (Vite + Svelte). No database, no auth
provider, no server-side rendering framework.

### Web-Verified Facts (2026-06-19 — supersede the technical research's older snapshot)

- **Durable Objects are free**: Workers Free plan includes DOs with the **SQLite storage
  backend**; limits 100,000 requests/day, 13,000 GB-s/day, 5 GB storage. (CF DO pricing.)
- **WebSocket Hibernation** confirmed: "Billable Duration (GB-s) charges do not accrue
  during hibernation" — idle rooms with open sockets cost nothing. (CF DO websockets.)
- **`partyserver` v0.5.8**, in the `cloudflare/partykit` monorepo
  (`packages/partyserver`), last pushed 2026-06-14, not archived — actively maintained.
  It is a **library**, not a CLI scaffold; the legacy `partykit` CLI is not used.
- These three facts CLEAR launch-gate dependencies (a) and (b) from the Project Context
  Analysis. Only (c) crude room GC/TTL remains, and it is ours to build (routine MVP).
- **Verified current versions (npm registry, 2026-06-19; re-verify at build time):**
  vite 8.0.16 · svelte 5.56.3 · @sveltejs/vite-plugin-svelte 7.1.2 · partyserver 0.5.8 ·
  partysocket 1.2.0 · wrangler 4.103.0 · vitest 4.1.9 · @cloudflare/vitest-pool-workers 0.16.18.

### Starter Options Considered

1. **Community `partyvite` starters** (partyserver × Vite × React × Tailwind × Workers) —
   current, but bundle React + Tailwind the UX spec deliberately left open, and obscure
   the privacy-critical code we must author deliberately. Rejected.
2. **Full-stack web starters** (T3, Next.js) — wrong shape: SSR + DB + auth we don't
   have; fights the server-authoritative WS-DO model. Rejected.
3. **No opinionated starter — minimal Wrangler + partyserver base, Vite + Svelte client**
   (SELECTED).

### Selected Approach: No opinionated starter — minimal C3 Worker base + `partyserver`; **Vite + Svelte** client

**Rationale for Selection:**
A starter pays off when it makes many safe defaults you don't care about. For a
DO-per-Table, no-DB, no-auth, no-SSR app we care about nearly every server default, and
our hardest HARD-constraint code (the `projectStateFor` egress chokepoint, the two-scope
monotonic guard, private-by-default messaging) is exactly what a generic starter buries.
So the **server** starts from a minimal C3 Worker base + `partyserver` as a library.

The **client** decision was refined in review (party mode): "no UI framework" was
correctly read as "we haven't picked one," NOT "ship raw imperative DOM." Three separable
decisions were untangled — starter vs build tool vs rendering primitive. We adopt **Vite**
(build/HMR/PWA assets — zero UI opinion) and **Svelte** (a compile-away reactive layer
that makes *render-from-state* the DEFAULT, not a discipline to remember). This directly
defuses the panel's flagged risk: imperative cross-surface DOM patching colliding with
out-of-band state pushes — the failure that would land a Reluctant Player on a
half-rendered/wrong surface or break the showdown beat. **No Tailwind** — DESIGN.md tokens
are authored directly as CSS custom properties. Svelte compiles away (tiny runtime),
served static on Cloudflare Pages, so the zero-cost/eyes-up posture is preserved.

**Enshrined experience invariant (testable architectural requirement):**
> Every surface is rendered purely as a function of current engine state. On any
> reconnect, app-resume, or device-handoff, the device re-derives and re-renders its
> correct surface from state alone — no surface ever displays controls or data belonging
> to a different state.

**Initialization Commands (verified 2026-06-19; re-verify at build time):**

```bash
# Server (Worker + Durable Object) — choose the "Hello World" → "Worker only" template
npm create cloudflare@latest trash-game -- --type=hello-world --ts --no-deploy --no-git
cd trash-game
npm install partyserver
npm install -D @cloudflare/vitest-pool-workers vitest
# wrangler.jsonc: bind the DO as a SQLite class (free-tier requirement):
#   "durable_objects": { "bindings": [{ "name": "Table", "class_name": "TableServer" }] }
#   "migrations": [{ "tag": "v1", "new_sqlite_classes": ["TableServer"] }]
#   Worker fetch entry: routePartykitRequest(request, env)

# Client (Vite + Svelte, no Tailwind)
npm create vite@latest client -- --template svelte-ts
cd client && npm install && npm install partysocket
# Static client deployed free via Cloudflare Pages; server via `wrangler deploy`
```

**Architectural Decisions Provided by the (minimal) base:**

- **Language & Runtime:** TypeScript on Cloudflare Workers; one Durable Object per Table
  (`partyserver` `Server` subclass), **SQLite-backed DO class** (free-tier requirement).
- **Real-time:** `partyserver` server + `partysocket` client; JSON over WSS. ALL
  client-bound payloads route through `projectStateFor` (Cross-Cutting #1) — direct
  `connection.send` / `broadcast` of game state is forbidden.
- **Client rendering:** Vite + Svelte; render-from-state model (the experience invariant
  above); DESIGN.md tokens as plain CSS custom properties (no Tailwind, no UI kit).
- **Build/Deploy:** Wrangler (`wrangler dev` / `wrangler deploy`) for the server; Vite
  build → Cloudflare Pages for the client. CI optional.
- **Testing:** Vitest (node env) for the pure rule engine + the egress negative-assertion
  privacy test (the SM-6 acceptance test, a pure-function test — no WS plumbing);
  `@cloudflare/vitest-pool-workers` for DO-level checks; connection-lifecycle/hibernation
  exercised via integration against `wrangler dev` (the pool cannot drive a real WS
  upgrade + hibernation roundtrip).
- **Code Organization:** pure transport-agnostic rule engine (`src/rules/`) isolated from
  transport (`src/server/`), client in `client/` — testability + PartyServer-ejectability.

### Init-Story Acceptance Criteria (carry into the first implementation story)

The init story is an **AC-driven contract**, not "scaffold and wire it up." Required ACs:
1. C3 **"Worker only"** template (NOT the DO template — it scaffolds `new_classes` =
   key-value DO; we REQUIRE `new_sqlite_classes`, or the free-tier SQLite guarantee is lost).
2. `migrations: [{ tag: "v1", new_sqlite_classes: ["TableServer"] }]` correct in commit
   one — migration tags are append-only/immutable; a later "fix" can't rewrite `v1`
   without deleting the DO.
3. `wrangler.jsonc` **binding name ↔ `class_name` ↔ exported class symbol** all match
   (mismatch → runtime "DurableObject class not found").
4. Pin a recent `compatibility_date` (must support SQLite-in-DO + WS hibernation).
5. **Authoritative Table state persists to `ctx.storage`; DO instance fields are
   cache-only** — hibernation wipes in-memory fields, so relying on them = table state
   vanishing after idle (the zero-idle-cost feature becoming a data-loss bug).
   *(Note: this AC keeps the door open; whether mid-round state is fully persisted vs.
   accepted-as-lost-on-restart is settled in the Deferred list — but the storage seam
   exists from day one.)*
6. Pinned deps + versions (above); directory layout `src/server/` `src/rules/`
   `client/` `test/`; `routePartykitRequest(request, env)` in the Worker fetch handler.

**Note:** Project initialization using these commands and ACs should be the first
implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Already decided (by stack / prior steps — recorded, not re-litigated):**
- Language/runtime: **TypeScript on Cloudflare Workers**.
- Real-time transport: **`partyserver` + `partysocket`, JSON over WSS**.
- State container: **one Durable Object per Table, SQLite-backed** (`ctx.storage`).
- Client: **Vite + Svelte**, render-from-state, DESIGN.md tokens as CSS custom properties.
- Database: **none** — no external DB; DO `ctx.storage` is the only persistence seam.
- Auth: **none** — `playerId` + session token + Room Code; no accounts/OAuth/JWT.
- API style: **no REST/GraphQL** — WebSocket intents-in / events-out only.
- Hosting/deploy: **Wrangler → Workers**; client → **Cloudflare Pages**.
- Privacy enforcement: single **`projectStateFor` egress chokepoint** + negative-assertion test.
- Crypto: **native Workers WebCrypto** — `crypto.getRandomValues()` (shuffle seed),
  `crypto.randomUUID()` (playerId/session token). No external crypto dependency. (Verified.)

**Critical decisions (block implementation):** D1 state shape, D3 protocol, D4 monotonic
guard, D5 deck/shuffle, D6 tiebreak + Showdown resolution order.
**Important decisions:** D2 persistence depth, D7 Room Code + GC/TTL.
**Deferred (per Context Analysis):** mid-round full persistence, reconnection flow,
host succession, clocked reveal, rate-limiting, side-channel hardening.

### D1 — Authoritative State Shape

A single `TableState`, mutated only by validated intents inside the DO:

```ts
type Card = { rank: 1..13; suit: '♠'|'♥'|'♦'|'♣' }   // rank 1=Ace(low)..13=King(high); suit decorative
type Player = { id; name; lives; isAlive; isConnected; seatIndex }   // seatIndex = seating order
type Round = {
  startingPlayerId; currentTurnId; turnToken;
  hands: Record<playerId, Card>;   // SERVER-ONLY — never serialized except to owner / at showdown
  deck: Card[];                    // SERVER-ONLY
  acted: playerId[];               // who has taken their turn this one-pass
  revealed: boolean;               // true only after a valid revealAll
}
type TableState = { code; phase; hostId; startingLives; players: Player[]; round: Round|null; phaseToken }
```
- **Seating:** ordered `players` array by `seatIndex`. A single rotation primitive
  `nextAliveSeat(from)` (right = increasing `seatIndex`, wrapping, skipping non-present
  seats) is reused by turn order, "Player to your right," and the D6 tiebreak.
- **`seatIndex` is immutable-for-life — never re-indexed.** Player removal flips
  `isAlive=false` (record/seat retained, never reused); all walks skip non-present seats.
- **Three distinct player states, never conflated:** `isAlive` = has Lives (game logic;
  false = eliminated, permanent, spectates); `isConnected` = socket open (presence only);
  removed = host-removed (excluded from next Deal, FR-14). A disconnected-but-alive
  Player still owes a Turn.
- **Disconnected active player (turn-skip):** if `currentTurnId` is `isConnected=false`,
  the Host conducts around them — the table proceeds socially (no auto-timeout in MVP).
  `[ASSUMPTION: MVP relies on the Host to advance past a disconnected player; an
  automatic skip rule is deferred.]`
- `acted` resets to `[]` exactly at Deal; `currentTurnId` is the sole turn authority.
  The **`turns → allActed` transition condition** is: every `isAlive` Player (by the
  alive-set snapshot taken at Deal) ∈ `acted`. `allActed` is a real `Phase` value the
  server enters on the final accepted turn intent (Story 2.6) — NOT a derived predicate
  re-evaluated at reveal time; `revealAll` then simply guards on `phase === "allActed"`.
- **Only `hands` and `deck` are server-only.** Everything else is safe to project.
- **Host conductor role is independent of `isAlive`.** An eliminated Host (lives 0,
  spectating) REMAINS the Host and keeps conducting (Deal/Reveal/Re-deal) unless they
  manually reassign or disconnect — deliberately covering the common case of the deferred
  host-succession problem so the conductor seat never goes empty just because the Host lost.
- **Removing the current-turn Player (the one mid-round exception).** Host removal
  normally resolves at the next Showdown/Re-deal (FR-14), NOT by rewriting the current
  round — EXCEPT when the removed Player is `currentTurnId`: the server then advances
  `currentTurnId = nextAliveSeat(removed)` and adds the removed Player to `acted`, so the
  one-pass can still satisfy the `turns → allActed` condition (otherwise the table stalls
  on a gone Player's turn).

### D2 — Persistence Depth: durable summary only

On each **phase transition**, persist a small **durable summary** to `ctx.storage`; the
**in-flight round** stays in memory only.
- **Explicit field boundary.** DURABLE SUMMARY (`ctx.storage`, written on phase
  transitions): `code, phase, hostId, startingLives, players[{id,name,lives,isAlive,
  seatIndex}], phaseToken`. EPHEMERAL (memory-only, lost on restart): the entire
  `round` object — `hands, deck, turnToken, currentTurnId, acted, revealed`. Because
  `lives, hostId, startingLives, seatIndex` are all DURABLE, a restart costs only the
  in-flight round → exactly one re-deal; elimination integrity and host identity survive.
- Rationale: a DO stays warm under active play (Hibernation keeps the socket, not a cold
  restart); the realistic loss event is a deploy/Worker restart, tolerated as one re-deal.
  AC-5's storage seam is therefore exercised from day one, minimally.
- **D2.1 Reload-reconciliation rule (REQUIRED).** On DO wake, if the persisted `phase` is
  a live-round phase (`dealing`/`turns`/`allActed`/`showdown`) but `round === null`, the
  server MUST coerce `phase` to `roundResult` (the safe between-rounds / needs-redeal
  surface — Host can `dealAgain`) and bump `phaseToken` BEFORE the first projection. The persisted `phase` is never trusted to imply round data that no longer
  exists — clients re-derive a recovery surface, never a half-rendered live table.

### D3 — Event Protocol: one authoritative projected snapshot

**Server → client = a single `tableState` event** carrying `projectStateFor(playerId,
table)` — the per-player projection (own hand included; others' hands omitted until
`revealed`). Pushed on every state change and on (re)connect. Plus a targeted `error`.
- Rationale: natural fit for Svelte render-from-state; makes the egress chokepoint the
  ONLY sender (one place to audit for SM-6); makes re-entry trivial (a reconnecting
  device just receives the current snapshot — no event replay).
- **Transient beat signals** ride as small adjunct fields on the snapshot or a tiny
  targeted event, carrying NO card data: e.g. `justReceivedSwap: true` (the squirm —
  value-free) and the showdown flip is driven by the snapshot flipping `round.revealed`
  true (presentation does the ≤400ms flip).
- **Guardrail (Independent Architect):** NO continuous / animation-driven server messages
  — beats are discrete events (`acted`, `revealed`) only. This fences the one way the
  per-recipient projection's N×N message count could ever bite (it does not at 2–20
  human-paced players; projection is per-recipient by necessity of the privacy rule).

**Client → server intents** (each validated server-side): `createRoom{name}`,
`joinRoom{code,name,sessionToken?}` (allowed in `lobby` phase only), `deal` (Host),
`swap`/`keep` (active player, carries `turnToken`), `drawFromDeck` (Last Player, carries
`turnToken`), `revealAll` (Host, carries `phaseToken`), `dealAgain` (Host, carries
`phaseToken`), `newGame` (Host, `gameOver`→`lobby` "one more?", carries `phaseToken`),
`hostSetLives{n}` / `hostRemovePlayer{id}` / `hostReassign{id}` (Host, carry `phaseToken`).

### D4 — Two-Scope Monotonic Guard

- **Turn token** (`round.turnToken`, integer): incremented on each accepted turn-scoped
  intent (`swap`/`keep`/`drawFromDeck`). The intent carries the token it believes
  current; server rejects a mismatch → covers turn-race + replay + double-tap + ordering.
- **Phase token** (`phaseToken`, integer): incremented on each accepted Host transition
  (`deal`/`revealAll`/`dealAgain`/`newGame`/host-controls). The `revealAll` guard ALSO
  requires `phase === "allActed"` so no card is ever both mutable and visible.
- Both tokens retained deliberately: turn-scoped and phase-scoped concurrency are
  different axes (a swap racing a swap vs. a double-tapped Deal/Reveal); one token would
  conflate them. Cost is two integers. **`joinRoom` is gated to `lobby` phase only** (so
  it cannot race a Deal); in-progress tables use reconnect, which bumps no token.
- **Stale handling is silent:** a mismatch returns a typed `error` (`stale-turn` /
  `stale-phase`) the client resolves by re-rendering the latest snapshot — a benign
  double-tap never shows a user-facing error. Client timestamps are never read.

### D5 — Deck Scaling & Shuffle

- **Deck:** `buildDeck(playerCount)` → one 52-card deck for ≤10 players, two merged decks
  (104) for 11–20. Each `deal`/`dealAgain` reconstitutes and reshuffles the full deck(s)
  (any Last-Player deck-draw discards return).
- **Why 2 decks at 11+ when 1 card/player needs only 52:** NOT a capacity requirement
  (one deck covers 20 single-card hands; deck exhaustion is impossible at any size). It
  is a deliberate VARIANCE choice per PRD FR-13 — two merged decks introduce duplicate
  values, making multi-loser ties more common at big tables (accepted/expected by the
  PRD; connected to PRD Open Question #3, a playtest question). Documented so the rule
  never reads as a bug.
- **Shuffle:** Fisher–Yates seeded by `crypto.getRandomValues()` — never `Math.random()`.
  Pure function `shuffle(deck, rng)` with the RNG injectable for deterministic tests.

### D6 — Multi-Loser Starting-Player Tiebreak + Showdown Resolution Order

**Showdown Resolution Order (canonical — all-tied / single-survivor cases depend on it):**
1. Reveal (`round.revealed=true`; cards become projectable to all).
2. Compute Loser(s) = all Players holding the lowest VALUE (incl. all-tied; duplicate
   two-deck cards are exact value-ties and all lose — FR-10).
3. Deduct one Life from each Loser.
4. Mark eliminations (`isAlive=false` for any Player at 0 Lives).
5. **Win-check:** exactly 1 alive → winner (GAME_OVER); 0 alive (all-tied to zero in one
   Showdown) → shared win (GAME_OVER, FR-12); ≥2 alive → continue.
6. **Only if ≥2 alive and a Re-deal will occur:** compute the next Starting Player.

**Tiebreak (step 6 only):** the next Starting Player is the tied Loser **seated earliest
in turn order from the previous Starting Player's seat** (scan right via `nextAliveSeat`;
the previous Starting Player is eligible if they are themselves a tied Loser). If that
Loser was eliminated this Showdown, the **next surviving seat to their right** starts.
The tiebreak NEVER runs when the game ended at step 5.

### D7 — Room Code + GC/TTL (crude-correct)

- **Room Code:** 4 letters from an ambiguity-safe alphabet (exclude `O,0,I,1,L` →
  ~21–22 letters → ~200k codes), generated via `crypto.getRandomValues()`.
- **Uniqueness via claim-on-create (the DO namespace IS the registry).** There is no
  central registry; `createRoom` generates a code, derives the DO by `idFromName(code)`,
  and the DO marks itself **claimed** on first initialization. If the addressed DO reports
  already-claimed (an active room), regenerate and retry. The claim is tied to actual host
  creation so the GC alarm reclaims abandoned codes. (At ~200k codes and <100 ever-live
  tables, collisions are astronomically rare anyway — claim-on-create makes the rare case
  correct rather than relying on odds alone.)
- **GC/TTL:** each Table DO sets a **`ctx.storage` alarm** (default **3h idle**), refreshed
  on activity (debounced — only re-arm if > a few minutes since last arm, to avoid
  per-intent write amplification). On alarm the DO self-deletes (clears storage) ONLY when
  it has **no active connections**. No central reaper. This is the sole defense of the $0
  gate against orphaned rooms.
- **CORRECTION (Story 1.1 spike, 2026-06-19 — empirically validated against the CF
  Durable Objects docs): the "no active connections" probe must NOT use
  `ctx.getWebSockets().length` by default.** `ctx.getWebSockets()` returns ONLY sockets
  accepted via the Hibernation API (`ctx.acceptWebSocket(ws)`); a socket accepted in
  *standard* mode (partyserver's default unless hibernation is explicitly enabled) is a
  live connection that is **invisible** to `ctx.getWebSockets()` — it reads **0 for a room
  full of active players**, so the alarm would DELETE A LIVE ROOM (data loss; the exact
  inverse of the GC intent). The spike deployed a real partyserver Worker+DO, opened a live
  socket, and observed `ctx.getWebSockets().length === 0`.
  - **PREFERRED FIX: enable partyserver Hibernation** so connections are accepted via the
    native `ctx.acceptWebSocket()`. This makes `ctx.getWebSockets().length === 0` an
    accurate "no active connections" probe AND delivers the idle-billing benefit
    NFR-3/SM-7 depend on (GB-s only stop accruing for *hibernated* connections — see
    Cross-Cutting #6). `[Verify partyserver's hibernation mode actually accepts via the
    native ctx.acceptWebSocket() — confirm when Story 1.11 is built.]`
  - **ALTERNATIVE: count partyserver's own connection registry** — probe
    `[...this.getConnections()].length === 0` instead of `ctx.getWebSockets()`. Correct
    regardless of accept mode, but does NOT by itself buy the idle-billing benefit.
  - The phrase "hibernation-aware probe via `ctx.getWebSockets().length`" is **only correct
    if partyserver Hibernation is actually enabled** — it is NOT the default.
- **GC depends on sockets actually closing.** A backgrounded PWA that retains an open
  (hibernated) socket keeps the room alive — correct for "everyone stepped away mid-game";
  the **3h idle TTL is the backstop** for phones-in-pocket whose sockets never cleanly close.
- `[ASSUMPTION: 3h idle TTL — safe-by-margin under Hibernation (over-long costs nothing;
  only too-short is risky); log session durations in soft launch to tune. PRD OQ-6.]`

### Decision Impact Analysis

**Implementation sequence (dependency order):**
0. **Spike (before build):** verify Cloudflare `idFromName` creation-on-address semantics
   + the claim-on-create flow (D7); force-kill a DO mid-round to validate the D2 field
   boundary and the D2.1 reload-reconciliation coercion.
1. Project init (the AC-driven init story from Starter Evaluation).
2. Pure rule engine (`src/rules/`): `buildDeck`, `shuffle`, `nextAliveSeat`/turn-order,
   lowest-value/Loser computation incl. all-tied, the Showdown resolution order, tiebreak
   (D5/D6) + unit tests.
3. `projectStateFor` + the negative-assertion privacy test (SM-6 acceptance — D3/D1).
4. DO `TableServer`: phase machine, two-scope guard (D4), intent validation, durable
   summary persistence + D2.1 reload coercion (D2).
5. WS protocol wiring (intents in / `tableState` out — D3).
6. Svelte client: render-from-state surfaces (the experience invariant), peek (local),
   squirm signal, showdown flip.
7. Host controls, deck scaling at 11–20, GC alarm (D7).

**Cross-component dependencies:**
- `projectStateFor` (3) depends on the state shape (D1) and is the ONLY thing that may
  serialize to a client — it gates everything in (5)/(6).
- The two-scope guard (D4) depends on the tokens in `TableState` (D1) and is consumed by
  every mutating intent.
- The tiebreak/turn-order (D5/D6) are pure `nextAliveSeat` math from D1 — they live in the
  rule engine and are unit-testable without the transport.

## Implementation Patterns & Consistency Rules

The stack eliminates most classic conflict points (no database tables, no REST endpoints,
no UI framework). These rules target where divergence is possible AND damaging, and each
is written to be **agent-checkable** — a violation is detectable by a token, a path, or a
type, never by interpretation.

### Canonical round-trip (anchor example — read this first)

```
CLIENT → SERVER   {"type":"swap","payload":{"turnToken":7}}
                  // {type,payload} envelope · camelCase JSON · intent name = "swap"

src/server/handlers/handle-swap.ts
  1. validateSwap(state, conn.playerId, payload)  // pure, from src/rules; throws IntentError(reason) if bad
  2. state = applySwap(state, conn.playerId)       // pure, from src/rules; returns NEW state
  3. this.table = state                            // the ONLY site that assigns table state
  4. persistSummaryIfPhaseChanged(state)           // ctx.storage.put("table", summary)
  5. for (const c of this.getConnections()) pushState(c)   // re-project to EVERY connection

src/server/push-state.ts  (the ONE module allowed to call connection.send)
  pushState(c) = c.send({ type:"tableState", payload: projectStateFor(state, c.playerId) })

SERVER → CLIENT (each, seat-specific)
  {"type":"tableState","payload":{ /* ProjectedTableState — own hand only */ }}
```

```ts
// ✅ DO — every outbound snapshot is built by the chokepoint, sent only via pushState
for (const c of this.getConnections()) pushState(c);

// ❌ DON'T — hand-rolled projection / direct send bypasses the chokepoint → leaks hands
c.send({ type: "tableState", payload: { ...this.table } });   // serializes every hand
```

### The rules (each row is independently checkable)

| Rule | Applies to (path/token) | Violation = | Enforced by |
|---|---|---|---|
| `projectStateFor` is the SOLE producer of a `tableState` payload | `src/server/` | any hand-built `tableState` payload | review + negative-assertion test |
| `connection.send`/`broadcast` exist ONLY in `src/server/push-state.ts` | repo-wide | any `.send(`/`.broadcast(` token elsewhere | **ESLint `no-restricted-properties`, path-scoped** |
| Every server→client `type` ∈ `"tableState" \| "error"` | `src/shared` union | a third literal anywhere | the `ServerEvent` union type |
| Every message is `{ type, payload }`; JSON fields camelCase | wire | snake_case field, missing envelope | the shared envelope type |
| Omit a key when its value is ABSENT; never serialize `null`; `[]`/`false`/`0` are meaningful and always included | wire | a `null` on the wire, or an omitted `false`/`[]` | review |
| `tableState` payload is ALWAYS a complete `ProjectedTableState` — never deltas/patches | `src/server/` | a `patch`/`delta` field | type (no patch field exists) |
| `rank` is the integer 1–13; comparison is `<`/`>` on `rank`; suit never compared | `src/rules`, `src/shared` | comparing suit, or `rank` as a string | the `Card` type |
| int→letter map (`1→A … 13→K`) lives ONLY in `src/client` | `src/client` | letters referenced in `src/server`/`src/shared`/`src/rules` | grep for letter map outside client |
| Table state is assigned ONLY inside a `handle<Intent>` fn, after its validator passed | `src/server/handlers/` | `this.table = …` / `storage.put` elsewhere | review (single assignment site) |
| `src/rules/**` is PURE | `src/rules/**` | tokens `Date.now`, `Math.random`, `crypto`, `fetch`, `ws`, `storage`, `this.`, `console`; any import outside `src/shared` | **ESLint denylist + import restriction** |
| Intent handlers signal failure by `throw new IntentError(reason)`; one dispatcher catch emits the `error` event | `src/server/handlers/` | returning `{ok:false}`, or sending `error` from a handler | review (single catch site) |
| `error.reason` ∈ the fixed `ErrorReason` union | `src/shared` | a free-string reason | the `ErrorReason` type |
| Client holds the last `tableState` read-only and derives its surface from it; only UI-only state (peeking) is local and never sent | `client/` | client mutating game state, or sending UI state as truth | review |
| `ctx.storage` uses ONE key `"table"` holding the durable summary blob (D2) | `src/server/` | per-field storage keys | review |

### Naming (the parts not already fixed by a type)

- Files: TS modules `kebab-case.ts`; Svelte components `PascalCase.svelte` (one per surface).
- Functions/vars `camelCase`; types `PascalCase` (no `I` prefix); module constants
  `SCREAMING_SNAKE` (`SINGLE_DECK_MAX_PLAYERS`, `IDLE_TTL_MS`, `ROOM_CODE_ALPHABET`).
- **Intent names and event/error types are NOT prose law — they are union types in
  `src/shared`** (`type Intent`, `type ServerEvent`, `type ErrorReason`). The types are the
  single source of truth; this doc lists them for reference only.

### The contract types (in `src/shared/`, imported by server + client)

```ts
// THE authoritative phase list — single source of truth. Every other reference in this
// doc (the state-machine prose, the guards, the durable summary, Epic 1.3's AC) uses
// EXACTLY these seven literals; `allActed` is a real Phase value, NOT a derived predicate.
type Phase =
  | "lobby"        // pre-deal; the ONLY phase joinRoom is accepted in
  | "dealing"      // Deal applied; hands dealt face-down, turn order set (transient — server moves to "turns" in the same transition)
  | "turns"        // one pass in progress; currentTurnId is the active seat
  | "allActed"     // one pass complete (every isAlive Player ∈ round.acted); cards final but still hidden — the ONLY phase revealAll is accepted in
  | "showdown"     // revealAll applied; round.revealed === true; hands now projectable to all
  | "roundResult"  // Showdown resolved (lives deducted, eliminations marked); awaiting Host dealAgain or a win
  | "gameOver";    // win-check terminal (1 survivor, or 0-survivor shared win); awaiting "one more?" (new game, same Table)

// Canonical transitions (the phase machine — guards in D4; each Host edge bumps phaseToken):
//   lobby      --deal-->        dealing -> turns         (Host; phaseToken)
//   turns      --(last seat acted)--> allActed           (server-internal, on the final accepted turn intent — see Story 2.6)
//   allActed   --revealAll-->   showdown                 (Host; phaseToken; rejected unless phase === "allActed")
//   showdown   --(resolution)-> roundResult | gameOver   (server-internal, per D6 resolution order: ≥2 alive -> roundResult; ≤1 alive -> gameOver)
//   roundResult--dealAgain-->   dealing -> turns         (Host; phaseToken; deals surviving Players, Loser starts — Story 3.4)
//   gameOver   --newGame-->     lobby                    (Host "one more?"; phaseToken; same roster, reopens join, re-applies startingLives — Story 3.6)
//   (any live phase, on DO wake with round===null) --D2.1 coerce--> roundResult  (bump phaseToken before first projection)

type Card = { rank: number /* 1..13, Ace=1 lowest, King=13 highest */;
              suit: '♠'|'♥'|'♦'|'♣' };   // suit decorative, never compared

type Intent =
  | { type: "createRoom";  payload: { name: string } }
  | { type: "joinRoom";    payload: { code: string; name: string; sessionToken?: string } }
  | { type: "deal" | "revealAll" | "dealAgain" | "newGame"; payload: { phaseToken: number } }
  // deal: lobby→dealing→turns · revealAll: allActed→showdown · dealAgain: roundResult→dealing→turns ·
  // newGame: gameOver→lobby ("one more?", same roster — Story 3.6). All Host-only, phaseToken-guarded.
  | { type: "swap" | "keep" | "drawFromDeck";   payload: { turnToken: number } }
  | { type: "hostSetLives"; payload: { phaseToken: number; lives: number } }
  | { type: "hostRemovePlayer"; payload: { phaseToken: number; playerId: string } }
  | { type: "hostReassign"; payload: { phaseToken: number; playerId: string } };

type ServerEvent =
  | { type: "tableState"; payload: ProjectedTableState }
  | { type: "error";      payload: { reason: ErrorReason } };

type ErrorReason =
  | "stale-turn" | "stale-phase" | "not-your-turn" | "not-host"
  | "bad-code" | "room-full" | "phase-illegal";

// The shape every device renders. Other players' hands are absent unless revealed.
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
> `you.isLastPlayer`, `you.isAlive`/`isConnected`, and `winnerIds` are **server-computed,
> value-free** — they exist so the client never recomputes turn-order, elimination, or
> win logic. The server stays authoritative over its DERIVATIONS, not just raw state.

### Process patterns

- **Error vs stale handling (client):** `stale-turn` / `stale-phase` → discard, NO toast,
  await the next `tableState` (silent resync). All other reasons → warm error copy
  (EXPERIENCE.md voice). No user-facing dialog for a benign double-tap.
- **Re-project timing:** after ANY successful mutation, project and push `tableState` to
  EVERY connected device at the table, every time (no conditional/partial pushes).
- **Loading/empty states:** the client has exactly the surfaces in EXPERIENCE.md's IA;
  "loading" is simply "no `tableState` received yet" → the Home/connecting surface.

### Enforcement summary

**Mechanical gates (CI, not review):** the ESLint `.send`/`.broadcast` path-scope ban; the
`src/rules/**` purity denylist + import restriction; the negative-assertion projection test;
TypeScript itself (the `Intent`/`ServerEvent`/`ErrorReason`/`ProjectedTableState`/`Card`
unions make most "format" violations a compile error).
**Review gates:** single-assignment-site, single-error-catch-site, one storage key.

## Project Structure & Boundaries

### Complete Project Directory Structure

Three npm workspaces in one repo: **`shared`** (the wire contract, imported by name as
`@trash/shared` by both other packages — no path-alias hack), **`server`** (the Cloudflare
Worker), **`client`** (the Vite+Svelte PWA → Pages). The pure rule engine lives in `server`
(it's server-authoritative and never shipped to the client).

```
trash-game/
├── README.md
├── package.json                 # private root; "workspaces": ["shared","server","client"]
├── tsconfig.base.json           # shared compiler options; each package extends it
├── eslint.config.js             # path-scoped: ban .send/.broadcast outside push-state.ts;
│                                #   server/src/rules/** purity denylist + import restriction
├── .gitignore
├── .github/workflows/ci.yml     # typecheck + eslint gates + vitest (incl. privacy test)
│
├── shared/                      # @trash/shared — THE WIRE CONTRACT (type-only + a little config)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── types.ts             # Card, Phase, Intent, ServerEvent, ErrorReason, IntentError (pure class),
│       │                        #   ProjectedTableState, AND TableState/Player/Round
│       └── config.ts            # game tunables: SINGLE_DECK_MAX_PLAYERS, MIN/MAX_PLAYERS,
│                                #   DEFAULT_LIVES, ROOM_CODE_ALPHABET, ROOM_CODE_LEN, IDLE_TTL_MS
│
├── server/                      # @trash/server — Cloudflare Worker (deployed via wrangler)
│   ├── package.json             # deps: partyserver; devDeps: wrangler, @cloudflare/vitest-pool-workers
│   ├── tsconfig.json
│   ├── wrangler.jsonc           # main: src/index.ts; durable_objects binding {name:"Table",
│   │                            #   class_name:"TableServer"}; migrations:[{tag:"v1",
│   │                            #   new_sqlite_classes:["TableServer"]}]; compatibility_date
│   ├── .dev.vars.example        # local env sample (no secrets needed in MVP)
│   ├── vitest.config.ts         # test.projects: [ {rules, env:node}, {do, pool:workers} ]
│   ├── src/
│   │   ├── index.ts             # Worker fetch entry → routePartykitRequest(request, env)
│   │   ├── rules/               # PURE engine — imports ONLY @trash/shared; no transport/storage/crypto/Date/Math.random
│   │   │   ├── engine.ts        # the reducer + helpers: buildDeck, shuffle(rng injected),
│   │   │   │                    #   nextAliveSeat/isLastPlayer/turn-order, applySwap/Keep/Draw,
│   │   │   │                    #   showdown resolution order, lives/eliminate/win-check, tiebreak
│   │   │   ├── validate.ts      # validate<Intent>(state, playerId, payload) → throw IntentError
│   │   │   └── *.test.ts        # node-env unit tests (all-tied, heads-up, tiebreak, shape privacy)
│   │   ├── table-server.ts      # class TableServer extends Server — phase machine + DO alarm GC.
│   │   │                        #   WATCH: peel connection/session mgmt into connections.ts if it grows
│   │   ├── project-state.ts     # projectStateFor(state, playerId) → ProjectedTableState (SOLE producer)
│   │   ├── push-state.ts        # pushState(conn) — the ONLY caller of connection.send (ESLint-banned elsewhere)
│   │   ├── dispatch.ts          # intent router + phase-legality; single try/catch → IntentError → error event
│   │   ├── handlers.ts          # one exported handle<Intent> fn per intent; the ONLY state-assignment sites
│   │   ├── persistence.ts       # ctx.storage key "table"; summary write; D2.1 reload coercion
│   │   ├── room-code.ts         # crypto code gen + claim-on-create (D7)
│   │   ├── identity.ts          # issue playerId + session token (crypto.randomUUID); resolve inbound
│   │   │                        #   token → player (the §11.3 reconnect-ready seam — issuance in MVP,
│   │   │                        #   reconnection FLOW deferred)
│   │   └── *.test.ts            # projection negative-assertion (SM-6) + DO tests (pool-workers project)
│   └── test/integration/        # connection-lifecycle/hibernation vs `wrangler dev` (not the pool)
│
└── client/                      # @trash/client — Vite + Svelte PWA → Cloudflare Pages
    ├── package.json             # deps: svelte, partysocket, @trash/shared; devDep: vite-plugin-pwa
    ├── vite.config.ts           # svelte plugin + vite-plugin-pwa (installable app-shell)
    ├── tsconfig.json
    ├── index.html
    ├── public/
    │   ├── manifest.json        # from ux imports/ (cleaned, warm copy)
    │   ├── icons/               # the two produced app icons
    │   └── fonts/               # Anybody, Hanken Grotesk
    └── src/
        ├── main.ts              # mounts App; registers PWA service worker; holds last tableState (read-only store)
        ├── socket.ts            # PartySocket wrapper; reads VITE_WS_URL; RECONNECT DISABLED
        │                        #   (reconnection out-of-MVP — partysocket reconnects by default).
        │                        #   Persists session token to localStorage; echoes it on joinRoom
        ├── tokens.css           # DESIGN.md tokens as CSS custom properties (no Tailwind)
        ├── App.svelte           # router: ProjectedTableState → surface (the experience invariant)
        ├── lib/
        │   ├── card-display.ts  # rank→letter map (1→A…13→K) — CLIENT-ONLY
        │   └── reduce-motion.ts # prefers-reduced-motion gate for the flip
        └── surfaces/            # one component per IA surface (EXPERIENCE.md) — high count is CORRECT here
            ├── Home.svelte Lobby.svelte
            ├── YourTurn.svelte Waiting.svelte
            ├── Showdown.svelte RoundResult.svelte
            ├── Eliminated.svelte Winner.svelte
            └── HostControls.svelte   # overlay; never reachable from YourTurn
        # NOTE: no components/ dir pre-created — let the first genuinely reused widget pull it into existence.
```

> **PWA scope:** `vite-plugin-pwa` provides the installable app-shell only. Offline
> *gameplay* is explicitly out of scope — the game requires the live WebSocket.

### Architectural Boundaries

- **Transport boundary:** browser ↔ one Worker/Durable Object over WSS. No REST, no
  third-party APIs. `server/src/index.ts` routes to the per-Table DO.
- **Privacy chokepoint:** `project-state.ts` (pure projector) + `push-state.ts` (sole I/O
  sink) are the ONLY code that serializes state to a client. Kept as two named files on
  purpose — the names ARE the invariant (pure projection vs. the single send site).
- **Purity boundary:** `server/src/rules/**` imports ONLY `@trash/shared`; no
  transport/storage/crypto/Date/Math.random (ESLint denylist). Fully node-unit-testable.
  (`IntentError` is a pure class in `@trash/shared`, so importing it does not break purity.)
- **State-mutation boundary:** `this.table = …` and `ctx.storage` writes occur ONLY in
  `handlers.ts` (after validation) — nowhere else.
- **Client boundary:** `client` imports ONLY `@trash/shared`; holds `tableState`
  read-only; renders surface = f(state). Letter-mapping lives only in `client/src/lib`.
- **Contract boundary:** `TableState`, `ProjectedTableState`, and `IntentError` ALL live in
  `@trash/shared` (the projector's signature spans server↔client; the client renders error
  reasons), so a contract change breaks compilation on both sides immediately.

### Requirements → Structure Mapping

- **Table Setup & Join (FR-1–4):** `handlers.ts` (createRoom/joinRoom/hostSetLives),
  `room-code.ts`, `identity.ts`; `surfaces/Home,Lobby`.
- **Round Loop (FR-5–8):** `rules/engine.ts` (deal/turn-order/swap/keep/draw),
  `rules/validate.ts`, `handlers.ts`; `surfaces/YourTurn,Waiting`. King = no code (FR-8).
- **Showdown/Lives/Re-deal (FR-9–12):** `rules/engine.ts` (resolution order/loser/lives/
  tiebreak); `handlers.ts`; `surfaces/Showdown,RoundResult,Winner,Eliminated`.
- **Deck Scaling (FR-13):** `rules/engine.ts` `buildDeck` (the 2-deck variance rule).
- **Host Controls (FR-14):** `handlers.ts` (host-*); `surfaces/HostControls` (overlay).

### Integration Points & Data Flow

- **Inbound:** client sends an `Intent` → `dispatch.ts` validates (phase/token/host) → calls
  a pure `rules` fn → `handlers.ts` assigns `this.table` → `persistence` writes summary on
  phase change → `pushState` re-projects to every connection.
- **Outbound:** the only server→client messages are `tableState` (per-player projection)
  and `error`. Beat signals ride as fields on `tableState`.
- **Identity:** `playerId` + session token issued server-side (`identity.ts`) at
  create/join, stored client-side (`localStorage`), echoed on `joinRoom` — reconnect-ready
  per §11.3 (issuance in MVP; reconnection flow deferred).
- **Persistence:** one `ctx.storage` key `"table"` (durable summary); round in memory; D2.1
  coercion on DO wake. GC via the DO's own `ctx.storage` alarm.
- **No external data flow:** no DB, no analytics, no third-party calls in MVP.

### Development / Build / Deploy

- **Dev:** root script runs `wrangler dev` (server on e.g. `:8787`) + `vite dev` (client,
  HMR). Client `socket.ts` reads `VITE_WS_URL` (→ `ws://localhost:8787` locally) — no
  hardcoded localhost. Multi-tab = multi-player local playtest.
- **Test:** `vitest` with two projects — node env (rules + projection negative-assertion)
  and pool-workers (DO); `server/test/integration` runs against `wrangler dev` for
  WS/hibernation (the pool can't drive a real WS upgrade).
- **Build/Deploy:** `wrangler deploy` (server); `vite build` → Cloudflare Pages (client).
  Both $0; CI gates run in `ci.yml`.
- **Watch-list (not pre-built):** `table-server.ts` is the real god-module risk — peel
  `connections.ts` off it only when WS-lifecycle code grows; do NOT pre-create
  `client/src/components/`.

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:** All stack choices are mutually compatible and web-verified
(2026-06-19): TypeScript · Cloudflare Workers · partyserver 0.5.8 · SQLite-backed DO
(free-tier confirmed) · WebSocket Hibernation (zero idle cost confirmed) · Vite 8 + Svelte 5
· partysocket 1.2.0. No version conflicts. No contradictory decisions: the chokepoint, the
two-scope monotonic guard, render-from-state, and durable-summary persistence reinforce
rather than fight each other.

**Pattern Consistency:** Patterns support the decisions — `projectStateFor`/`pushState`
enforce privacy; the turn/phase tokens enforce server-authority; render-from-state enforces
the experience invariant; camelCase + `@trash/shared` types make the wire contract one
source of truth. Naming is consistent and largely type-enforced.

**Structure Alignment:** The three-workspace tree enables every pattern — `shared` (one
contract), `server/rules` (pure, ESLint-fenced), `server` (chokepoint + single mutation
site), `client` (read-only render-from-state). Boundaries are explicit and CI-gated.

### Requirements Coverage Validation ✅

**Functional Requirements Coverage:** All 14 FRs trace to a specific home (FR-1→14 mapped
in Project Structure §Requirements→Structure). Notably FR-8 (King social-only) is satisfied
by the ABSENCE of code — the privacy rule structurally forbids branching on another
player's card, so no King logic can exist.

**Non-Functional Requirements Coverage:**
- Privacy (SM-6, §11.1): single `projectStateFor` chokepoint + negative-assertion test
  (the acceptance criterion) + ESLint send-ban. Beat signals are value-free. ✅
- Zero cost (§11.2): DO free on Workers Free plan + Hibernation (no idle billing) +
  per-DO self-GC. All verified. ✅
- Stable identity (§11.3): `identity.ts` issues playerId+token; state keyed by it
  everywhere; reconnect-ready (flow deferred). ✅
- Server-authoritative: intent validation (phase/token/host) + single mutation site +
  client-timestamps-never-trusted. ✅
- Simultaneity / reveal-finality: reveal gated on `phase === "allActed"`; flip is presentation
  (best-effort broadcast). ✅
- Showdown flip-safety + Reduce-Motion: client `reduce-motion.ts`; ≤400ms, no strobe. ✅
- Fast start (SM-4): no accounts/download; claim-on-create; join in lobby. ✅
- Reluctant-Player zero-confusion (SM-5): two-button YourTurn; render-from-state
  re-enterable routing; conductor controls never on YourTurn. ✅

### Implementation Readiness Validation ✅

**Decision Completeness:** All critical decisions (D1–D7) documented with the resolution
order, the two-scope guard, deck/shuffle, tiebreak, GC. Versions pinned and verified. One
pre-build spike flagged (D7 `idFromName` semantics + D2 field boundary).

**Structure Completeness:** Complete three-workspace tree with every file named and mapped
to FRs; boundaries CI-gated; both `swap` and `createRoom` round-trips traced end-to-end
with no missing files.

**Pattern Completeness:** Conflict points addressed as an agent-checkable rule table
(path/token/violation/enforced-by); the contract types are the enforcement substrate;
error + stale-resync + re-project timing specified; a canonical annotated round-trip +
chokepoint do/don't provided.

### Gap Analysis Results

**Critical Gaps:** None open. (The two earlier-found structural gaps — player identity and
PWA service worker — are now homed in `identity.ts` and `vite-plugin-pwa`.)

**Important Gaps (carry into build, not blocking):**
- **Pre-build spike (documented):** verify Cloudflare `idFromName` creation-on-address
  semantics + claim-on-create (D7); force-kill a DO mid-round to validate the D2 field
  boundary + D2.1 coercion. The one thing to confirm empirically before relying on it.
- **Disconnected-active-player turn-skip:** MVP relies on the Host to conduct around a
  disconnected player; no auto-skip (documented assumption).

**Nice-to-Have Gaps (post-MVP):** the full Deferred list (reconnection flow, host
succession, clocked reveal, mid-round persistence, rate-limiting, side-channel hardening) —
each consciously deferred with no MVP success metric at risk.

### Validation Issues Addressed

All issues surfaced across the party-mode and elicitation passes were resolved in-place:
the egress chokepoint mechanism (pushState + ESLint), `ProjectedTableState` completeness
(isLastPlayer/isAlive/winnerIds), the D2 reload-reconciliation rule, the claim-on-create
room-code mechanism, the GC connection-probe (corrected by the Story 1.1 spike — requires
partyserver Hibernation enabled so `ctx.getWebSockets()` is accurate, else count
`getConnections()`; see D7), the canonical Showdown resolution
order, the 2-deck variance rationale, the vitest projects split, the shared-import via
three workspaces, and the identity + PWA homes.

### Architecture Completeness Checklist

**Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed (MEDIUM — low effort, high correctness criticality)
- [x] Technical constraints identified (privacy, zero-cost, stable identity)
- [x] Cross-cutting concerns mapped (6, incl. the monotonic-guard principle)

**Architectural Decisions**
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified (web-verified 2026-06-19)
- [x] Integration patterns defined (WS intents/events, single snapshot)
- [x] Performance considerations addressed (human-paced; per-recipient projection bounded)

**Implementation Patterns**
- [x] Naming conventions established (largely type-enforced)
- [x] Structure patterns defined (purity + chokepoint + single-mutation boundaries)
- [x] Communication patterns specified (envelope, contract types, re-project timing)
- [x] Process patterns documented (error/stale-resync, loading)

**Project Structure**
- [x] Complete directory structure defined (three workspaces, every file named)
- [x] Component boundaries established (CI-gated)
- [x] Integration points mapped (inbound/outbound/identity/persistence)
- [x] Requirements to structure mapping complete (all 14 FRs)

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION (all 16 checklist items `[x]`; no Critical
Gaps open; one pre-build spike and one documented assumption noted as Important — neither
blocks starting).

**Confidence Level:** High — the launch-gate dependencies (DO-free, Hibernation) were
empirically verified, the hard privacy rule has a mechanical acceptance test, and the
design was adversarially reviewed across five party-mode panels and four elicitation passes.

**Key Strengths:**
- The one hard rule (secret-card privacy) is concentrated at a single, testable chokepoint.
- Scary-sounding concerns collapsed into reused mechanisms (one monotonic guard; reveal =
  one phase check; private re-delivery = a property of render-from-state).
- Zero-cost is verified, not hoped (DO-free + Hibernation + self-GC).
- Disciplined MVP scope — every deferral tied to "no success metric at risk."

**Areas for Future Enhancement:** the Deferred list — reconnection + host succession
(v1.1's first picks), produced comedy FX (v1.1, the emotional heartbeat), clocked reveal,
Powers mode (v2), rate-limiting (if the launch surface ever goes public).

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions (D1–D7) and the agent-checkable rule table exactly.
- Route every client-bound payload through `projectStateFor`/`pushState`; never broadcast state.
- Keep `server/src/rules/**` pure; mutate state only in `handlers.ts`; one storage key.
- Render the client from `tableState` only; never recompute server-derived flags.

**First Implementation Priority:**
1. The pre-build SPIKE (D7 `idFromName` + D2 mid-round kill test).
2. Then the AC-driven project-init story (three workspaces; `wrangler.jsonc` with
   `new_sqlite_classes`; vitest projects; ESLint gates).
3. Then the pure `rules/engine` + the `projectStateFor` negative-assertion privacy test.
