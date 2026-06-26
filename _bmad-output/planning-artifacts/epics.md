---
stepsCompleted: [1, "1-confirmed", 2, 3]
v2StepsCompleted: [1, "1-confirmed", 2, 3]
inputDocuments:
  - '_bmad-output/planning-artifacts/prds/prd-trash-game-2026-06-19/prd.md'
  - '_bmad-output/planning-artifacts/prds/prd-trash-game-2026-06-19/addendum.md'
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-trash-game-2026-06-19/EXPERIENCE.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-trash-game-2026-06-19/DESIGN.md'
  - '_bmad-output/planning-artifacts/prds/prd-trash-game-2026-06-25/prd.md'
  - '_bmad-output/planning-artifacts/prds/prd-trash-game-2026-06-25/addendum.md'
---

# trash-game - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for trash-game (Trash), decomposing the requirements from the PRD, UX Design, and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

FR-1: A Host can create a Table from a web browser and receive a 4-uppercase-letter, ambiguity-safe Room Code to share; creator becomes Host and first Player; no account/email/install required.
FR-2: A Player can join an existing Table by entering its Room Code + display name; valid code adds them to the lobby roster on all devices; invalid/expired code rejected with a plain retry message; each Player gets a stable `playerId` + session token independent of socket identity.
FR-3: All connected devices see the live lobby roster before the Deal; join/leave updates all devices; late join allowed up to the first Deal only; no joining a game in progress; a Player who leaves mid-game stops taking Turns (no reconnection in MVP).
FR-4: The Host can set starting Lives (1–5) for the Table before the first Deal (default 3); may also change Lives between Rounds (FR-14).
FR-5: The Host can Deal one secret Card to each active Player to begin a Round; full Deck reconstituted + reshuffled (Fisher–Yates / CSPRNG) each Deal; a Card value is delivered only to its owner's device; all devices transition to dealt state together (simultaneous reveal-down); Starting Player = Host on first Round, then previous Round's Loser; turn order proceeds to each Player's right.
FR-6: On their Turn, the active Player can Swap (exchange Cards with the Player to their right) or Keep; exactly two primary actions (Swap/Keep) + peek/hide; own Card hidden by default, peek requires explicit hold/tap and re-hides on release; inactive devices show only whose Turn it is; turn order is exactly one pass (Starting → Last Player, no wrap); no timer, no auto-advance.
FR-7: The Last Player can Swap with the Player to their right OR draw a random Card from the Deck; drawing replaces their Card and removes the discarded Card from the Deck for the rest of the Round (returns at next Deal); covers the heads-up (2-Player) path.
FR-8: King is social-only — no special app behavior; it is simply the highest Card; the app never refuses a Swap based on a target's Card value and never reads another Player's Card to validate a Swap; King participates in Showdown like any other Card.
FR-9: The Host can trigger the Showdown once the Last Player has acted; all Cards reveal on all devices at the same moment; this is the first time a non-owner device receives another Player's Card value.
FR-10: At Showdown the app computes the lowest Card by value only (Ace lowest, suit ignored) and highlights the Loser(s); ties (incl. the all-tied case) produce multiple Losers; correct/unambiguous at Table sizes up to 20.
FR-11: Each Loser loses exactly one Life automatically; ties deduct from every tied Loser; a Player at zero Lives is marked eliminated and excluded from subsequent Deals.
FR-12: When exactly one non-eliminated Player remains, they win and the game ends; zero-survivors case (all eliminated in one Showdown) = shared win; otherwise a single Host Re-deal starts the next Round with surviving Players; the Round's Loser becomes the next Starting Player (multi-Loser tiebreak per FR-5; eliminated-Loser falls to next surviving seat to the right).
FR-13: The app auto-scales the Deck to Table size without Host input — one 52-card deck for ≤10 Players, two merged decks for 11–20; not surfaced as a setting; duplicate values (and more frequent ties) are accepted at large Tables.
FR-14: The Host has mid-session controls (available only to the Host, never on a Player's Turn surface): change Lives (1–5, between Rounds), remove a Player (excluded from next Deal; mid-Round removal resolves at next Showdown/Re-deal), and reassign the Host role (exactly one Host at any time).

#### v2 (PRD prd-trash-game-2026-06-25)

FR-15: A Player chooses their UI language on their own device — a toggle on the Home/Join surface, reachable before entering a Room Code; the choice is stored in the device's `localStorage`, survives reload/re-join, and is per-device (changes nothing on any other device or on the Table/server). v2 supports English (default) and Spanish; the toggle is legible in both states (not color-alone).
FR-16: All mechanical UI chrome localizes to the chosen language — every button, prompt, and status line ("Es tu turno", "Cambiar / Quedarse", "Mostrar las cartas"); `copy.ts` becomes a keyed dictionary with one entry per language read through by every surface; parameterized strings (loser(name), roomCode(code), …) localize with parameters intact and grammatically natural; the Room Code value itself is not translated (only its label).
FR-17: The warm emotional copy (loser, winner, waiting, elimination lines) is AUTHORED in Spanish to match the MVP's playful, non-punishing voice — not machine-translated; co-winner joining reads naturally in Spanish grammar. Definition of Done: a fluent-Spanish speaker reviews the warm copy for warmth/voice and signs off (approver: Dennis or a designated fluent reviewer) — this sign-off is the FR-17 acceptance gate.
FR-18: Localized comedy sting (Tier 3) — SATISFIED BY DESIGN. The loser's-device comedy moment carries no language content (purely visual), so it is language-neutral and needs no v2 work; the FR re-activates only if a future sting gains words or spoken audio.
FR-19: Card face glyphs and spoken (screen-reader) names localize — Spanish glyphs A=As, J=Jota, Q="Q" (Reina), K="R" (Rey); only the King glyph changes from the English face, and the Queen glyph stays "Q" to avoid the Reina/Rey "R" collision (the Q-glyph / "Reina"-speech mismatch is INTENTIONAL — do not "fix" it). Spoken names in Spanish (As/Jota/Reina/Rey + number cards). Suit stays ignored; this touches only `card-display.ts` (`rankToLetter`/`rankSpeech`); rank comparison stays integer-based and unchanged.
FR-20: A Player who is NOT currently on their Turn can press-and-hold to peek their own Card on the Waiting surface — available to any off-turn Player (both waiting-to-act and already-acted), card hides on release (and on focus-loss / page-hide, matching the MVP on-Turn peek's safety behavior), always shows the Player's CURRENT card (after a Swap moves a new Card in, the peek shows the new Card). The privacy invariant holds without exception: a Card is shown only to its owner's own device while that owner holds the gesture; nothing new is sent over the wire and no other Player's Card is ever revealed.

### NonFunctional Requirements

NFR-1 (Privacy/Integrity — HARD, pass/fail, §11.1 / SM-6): A secret Card is delivered only to its owner — never to any other device, not in UI, not in network traffic — until Showdown. No feature's behavior may depend on reading another Player's secret Card before Showdown. Enforced at a single egress chokepoint (`projectStateFor`) and verified by a negative-assertion egress test.
NFR-2 (Server-authoritative state, §11.1): No Card values or game-deciding logic live on the client; clients send intents only; the server validates phase, turn ownership, and Host-only actions and computes all results; client timestamps are never trusted.
NFR-3 (Zero ongoing cost — HARD, launch gate, §11.2 / SM-7): Zero ongoing cost to run at family/friends scale (free-tier hosting, idle-to-zero). Depends on WebSocket Hibernation being wired AND rooms being garbage-collected.
NFR-4 (Stable identity, §11.3): All Player state keyed to a stable `playerId` + session token (not socket identity) from day one, making future reconnection cheap without re-architecting.
NFR-5 (Reveal-finality / simultaneity): The Showdown reveal is gated server-side by the phase token — rejected unless every live Player has acted, so all Cards are final before any becomes public; "simultaneous" is a best-effort presentation flip (millisecond time-sync deferred).
NFR-6 (Showdown flip-safety): The reveal flip is ≤400ms, no strobe, nothing flashing >3×/second, no full-viewport flash; Reduce-Motion skips the flip (cards appear face-up instantly, loser still clearly highlighted).
NFR-7 (Fast start, SM-4): "Let's play" to everyone dealt in well under ~30 seconds.
NFR-8 (No confusion-stop, SM-5): A full game night runs without a Round stalling on a confused Player (validates the two-button/minimal-surface design).
NFR-9 (Eyes-up / minimal surface, §10): The active Player's screen is two big buttons + peek/hide and nothing else; inactive screens show only whose Turn it is; no feeds, chat, ads, idle/ambient animation between Turns, badges, or anything that invites scrolling.
NFR-10 (Accessibility floor): Legible across a table — large type, high contrast (WCAG AA on the dark surface), tap targets ≥48dp; color independence (suit by shape, loser by stroke+scale+position, turn by frame+name — never color alone); screen-reader labels with role+state; hidden own-Card rank absent from the a11y tree; Reduce-Motion variants; focus order follows reading order; primary actions in the lower (thumb-zone) half.

### Additional Requirements

(From Architecture — technical/infrastructure requirements that shape implementation.)

- AR-1 (Starter / init contract): No opinionated starter. Three npm workspaces in one repo (`shared`, `server`, `client`). Server = minimal C3 "Worker only" template + `partyserver` (library); client = Vite + Svelte (svelte-ts), no Tailwind. The init story is AC-driven (see Architecture "Init-Story Acceptance Criteria"): C3 Worker-only template; `migrations: [{ tag: "v1", new_sqlite_classes: ["TableServer"] }]` correct in commit one; binding name ↔ class_name ↔ exported symbol all match; pinned recent `compatibility_date`; authoritative state persists to `ctx.storage` (DO instance fields are cache-only); pinned deps/versions; directory layout `src/server/` `src/rules/` `client/` `test/`; `routePartykitRequest(request, env)` in the Worker fetch handler.
- AR-2 (Pre-build spike): Before relying on it, verify Cloudflare `idFromName` creation-on-address semantics + the claim-on-create flow (D7); force-kill a DO mid-round to validate the D2 field boundary and D2.1 reload-reconciliation coercion.
- AR-3 (Pure rule engine): Game rules live in `server/src/rules/**` as pure, transport-agnostic functions — import only `@trash/shared`; no transport/storage/crypto/Date/Math.random (ESLint denylist + import restriction); fully node-unit-testable. Includes `buildDeck`, `shuffle(rng injected)`, `nextAliveSeat`/turn-order/`isLastPlayer`, lowest-value/Loser computation (incl. all-tied), Showdown resolution order, lives/eliminate/win-check, multi-Loser tiebreak.
- AR-4 (Egress chokepoint): `projectStateFor(state, playerId)` is the SOLE producer of client-bound `tableState` payloads; `connection.send`/`broadcast` exist ONLY in `push-state.ts` (ESLint path-scoped ban elsewhere); a negative-assertion projection test is the SM-6 acceptance criterion.
- AR-5 (Authoritative state shape / DO): One Durable Object per Table (SQLite-backed). `TableState` mutated only by validated intents in `handlers.ts` (single mutation site); `hands` and `deck` are server-only; `seatIndex` immutable-for-life; three distinct player states (`isAlive`/`isConnected`/removed) never conflated; eliminated Host keeps conducting; current-turn-Player removal advances the turn.
- AR-6 (Two-scope monotonic guard): Turn token guards turn-scoped intents (swap/keep/draw); phase token guards Host-conducted transitions (deal/reveal/re-deal/host-controls/join-gating); `revealAll` also requires `phase === "allActed"`; stale mismatch returns a typed `error` (`stale-turn`/`stale-phase`) handled by silent resync; client timestamps never read.
- AR-7 (Event protocol): Server→client = a single `tableState` event (full `ProjectedTableState`, never deltas) pushed on every state change and on (re)connect, plus a targeted `error`; client→server = the fixed `Intent` union; `{type,payload}` envelope, camelCase JSON; transient beat signals (`justReceivedSwap`, `revealed`) ride as value-free fields on the snapshot; no continuous/animation-driven server messages.
- AR-8 (Persistence depth + reload coercion): Persist a durable summary (`code, phase, hostId, startingLives, players[{id,name,lives,isAlive,seatIndex}], phaseToken`) to one `ctx.storage` key `"table"` on phase transitions; the in-flight `round` is memory-only (a restart costs exactly one re-deal). D2.1: on DO wake, if persisted `phase` implies a live round but `round === null`, coerce to a safe between-rounds surface and bump `phaseToken` before the first projection.
- AR-9 (Deck/shuffle mechanism): `buildDeck(playerCount)` → 52 cards ≤10 players, two merged decks (104) for 11–20 (a variance choice, not capacity); reconstitute + reshuffle each Deal; Fisher–Yates seeded by `crypto.getRandomValues()`, never `Math.random()`; pure `shuffle(deck, rng)` with injectable RNG.
- AR-10 (Showdown resolution order): Canonical order — reveal → compute Loser(s) by lowest value → deduct one Life each → mark eliminations → win-check (1 alive = winner; 0 alive = shared win; ≥2 continue) → only if ≥2 alive and re-dealing, compute next Starting Player via the tiebreak.
- AR-11 (Room Code + GC/TTL): 4 letters from an ambiguity-safe alphabet (exclude O,0,I,1,L) via `crypto.getRandomValues()`; uniqueness via claim-on-create (the DO namespace is the registry, `idFromName(code)`, regenerate-on-collision); GC via the DO's own `ctx.storage` alarm (default 3h idle, debounced refresh) that self-deletes only when no active connections. The connection probe requires partyserver Hibernation enabled (sockets accepted via the native `ctx.acceptWebSocket()`) so `ctx.getWebSockets().length === 0` is accurate — else count `[...this.getConnections()].length`. CORRECTION (Story 1.1 spike, 2026-06-19): `ctx.getWebSockets()` returns ONLY hibernation-accepted sockets and reads 0 for standard-mode (partyserver default) live connections, so an uncorrected probe would delete a live room.
- AR-12 (Identity/session): `identity.ts` issues `playerId` + session token (`crypto.randomUUID()`) at create/join; client stores it in `localStorage` and echoes it on `joinRoom`; partysocket auto-reconnect DISABLED (reconnection flow is out of MVP; issuance seam stays).
- AR-13 (CI enforcement gates): ESLint `.send`/`.broadcast` path-scope ban; `src/rules/**` purity denylist + import restriction; the negative-assertion projection (privacy) test; TypeScript unions (`Intent`/`ServerEvent`/`ErrorReason`/`ProjectedTableState`/`Card`) as the contract substrate; CI = typecheck + eslint + vitest (incl. privacy test).
- AR-14 (Test strategy): Vitest two projects — node env (pure rules + projection negative-assertion) and `@cloudflare/vitest-pool-workers` (DO-level); connection-lifecycle/hibernation exercised via integration against `wrangler dev`.
- AR-15 (Disconnected-active-player handling, documented assumption): No auto-skip in MVP — the Host conducts around a disconnected active Player; the table proceeds socially.

### UX Design Requirements

(From EXPERIENCE.md and DESIGN.md — each specific enough to drive a story with testable ACs.)

- UX-DR1 (Design tokens as CSS custom properties): Author the full DESIGN.md token set — color palette (the "Electric Social" dark/neon system), typography scale (Anybody + Hanken Grotesk; weights ≥500), spacing (8px base, 32px container padding), radii (chunky geometry, pill primaries), elevation (tonal stacking + 4px neon active stroke) — as plain CSS custom properties in `tokens.css`. No Tailwind, no UI kit. Bundle the two fonts (Anybody, Hanken Grotesk) locally.
- UX-DR2 (Render-from-state surface router): `App.svelte` routes `ProjectedTableState` → exactly one surface; no persistent navigation (no tab bar/drawer); every surface is a pure function of current state; on any reconnect/app-resume/handoff the device re-derives its correct surface from state alone (the enshrined experience invariant). "Loading" = no `tableState` yet → Home/connecting surface.
- UX-DR3 (Home surface): Two big buttons — "Start a table" / "Join a table"; join shows a 4 letter-slot Room Code field (auto-uppercase, auto-advance, paste-friendly) + display-name entry; inline warm error under the field on bad/expired code; logo, no heavy splash.
- UX-DR4 (Lobby surface): Large letter-spaced Room Code display (Display-LG, most prominent element); live-updating roster with Lives pips; Host-only Lives stepper (1–5, default 3); Host conductor bar with Deal (disabled until ≥2 Players); warm "share the code" / "waiting for players" copy.
- UX-DR5 (Your Turn surface): The two-button hero — SWAP / KEEP as massive (≥72px) pill primaries in the thumb zone, plus a press-and-hold peek control; neon active frame around the viewport with a gentle ~1.2s pulse (Reduce-Motion → static frame); nothing else competes. Last Player adds a visually-subordinate Secondary "Draw from deck" third button, shown only on that one seat.
- UX-DR6 (Waiting surface): The calmest surface — only the active Player's name (static frame, no pulse, no motion) + your own Lives; no Card, nothing to scroll.
- UX-DR7 (Peek interaction): Press-and-hold reveals own Card (big rank + suit pip, Display-XL); release re-hides immediately; also auto-hides on losing focus and on app-background; the hidden rank is never persistent and never in the a11y tree when hidden; an SR-accessible "Peek your card" activatable element announces the rank once to the owner's device only and discards it.
- UX-DR8 (Card display component): Big rank + single large suit pip (not a corner index, not photoreal); Ace = `A` (lowest), King = `K` (highest); suit decorative, distinguished by shape not color; face-down neon-outlined back as the hidden resting state; rank→letter map lives ONLY in `client/src/lib/card-display.ts`.
- UX-DR9 (Showdown surface + flip): All Cards flip face-up together via the safe ≤400ms coordinated flip (no strobe/full-viewport flash); Loser(s) framed in the error ramp with thick stroke + gentle scale-up (stroke+scale+position, never color alone), unmistakable across 20 cards; non-losing cards recede to no lower than 70% opacity (faces stay ≥4.5:1 legible); warm tease copy on the losing device ("Ooof — lowest card, {name}"); all-tied → all highlighted + "everybody drops a life" copy; designed so v1.1 produced FX can drop in without rework. Reduce-Motion → instant face-up, no scale.
- UX-DR10 (Round Result surface): Lives pips tick down with a brief animation; Host sees Re-deal, others see "waiting to re-deal"; copy reflects that the previous Round's Loser starts the next. (Note: Round Result + Showdown may merge into one continuous beat — confirm in build.)
- UX-DR11 (Eliminated surface): On reaching 0 Lives, route to a spectator state with warm copy ("You're out — stick around and heckle"); the Player keeps receiving Waiting/Showdown views but gets no actions and is skipped in turn order — never a dead-end screen.
- UX-DR12 (Winner surface): When one Player remains (or a shared win), an end-of-game celebration with "{name} wins it. One more?"; "one more?" routes the Host to a new game with the same Table.
- UX-DR13 (Host Controls overlay): A one-level modal sheet (on `surface-container-high`) invoked from the conductor bar on Lobby/Waiting/Round Result — never reachable from Your Turn; contains the Lives stepper (1–5), the roster with a per-row remove affordance (error-tinted, with confirm), and a "Make someone else host" action; closes back to the surface beneath, never stacks two deep.
- UX-DR14 (Conductor bar component): Host-only bottom-anchored (thumb-zone) bar on non-turn surfaces holding the single phase-appropriate primary (Deal/Showdown/Re-deal) + a ≥48dp ⚙ controls affordance; absent entirely for non-Hosts and on Your Turn.
- UX-DR15 (Lives indicator component): Pip row — remaining = filled neon-mint circles, spent = hollow outlined rings (shape not color); spent-pip outline uses `outline` (#9d8ba0), never `outline-variant`; pair pips with a numeral for ≥4 Lives; brief animation on Life loss.
- UX-DR16 (Microcopy / voice): Apply the EXPERIENCE.md voice table verbatim across all surfaces (warm, playful, plainspoken, inclusive; never high-stakes/underground/mean); reject the generated "high-stakes underground" manifest description and correct the PWA manifest copy.
- UX-DR17 (PWA shell): `vite-plugin-pwa` provides the installable app-shell (manifest + the two produced icons, cleaned/warm copy); offline gameplay explicitly out of scope (game requires the live WebSocket); portrait-only, dark-mode-only in MVP.
- UX-DR18 (Interaction primitives + safety): Tap to act with debounced buttons (no double-fire); no timers/auto-advance anywhere; Showdown is the only place motion is loud; the banned-elements list (feeds/chat/push/badges/idle animation/scroll-bait) is honored everywhere.

#### v2 (PRD prd-trash-game-2026-06-25)

- UX-DR19 (Language toggle on Home/Join): A per-device language toggle on the Home/Join surface, reachable before entering the Room Code (off the clock). Legible in both states — flag + label, never color-alone (NFR-10). Reflects/sets the `localStorage` preference; reactive so a change re-renders the surface immediately. v2 = English (default) / Spanish; the toggle does NOT appear as a host/Table control (it is device-local, not room-level). Eyes-up: a one-time quiet choice, not a settings sink.
- UX-DR20 (Off-Turn peek on the Waiting surface): The calm Waiting surface (UX-DR6) gains a press-and-hold peek affordance that mirrors UX-DR7's behavior exactly — own Card shows as Display-XL on hold, re-hides on release / focus-loss / app-background; rank absent from the a11y tree when hidden; an SR-accessible "Peek your card" element announces the rank once to the owner's device only. The Waiting surface otherwise stays the calmest surface (no always-on card, no motion, nothing to scroll — NFR-9). Available to any Player whose Turn it is not; the on-Turn peek (UX-DR7) remains the affordance for the active Player (the two are mutually exclusive by surface, never doubled).

### FR Coverage Map

FR-1: Epic 1 — Create a Table; Host gets a Room Code.
FR-2: Epic 1 — Join a Table by Room Code + display name; stable playerId/session token.
FR-3: Epic 1 — Live lobby roster; late join up to first Deal only; no mid-game join.
FR-4: Epic 1 — Host sets starting Lives (1–5, default 3) before first Deal.
FR-5: Epic 2 — Deal secret Cards; reshuffle each Deal; simultaneous dealt state; Starting Player rule.
FR-6: Epic 2 — Take a Turn (Swap/Keep); two-button surface; peek/hide; one pass.
FR-7: Epic 2 — Last Player option (Swap or draw from Deck); heads-up path.
FR-8: Epic 2 — King is social-only (no app logic; never reads another's Card).
FR-9: Epic 3 — Trigger Showdown; simultaneous reveal across all devices.
FR-10: Epic 3 — Compute lowest by value + highlight Loser(s); ties incl. all-tied. (Correctness-at-20 validated in Epic 5.)
FR-11: Epic 3 — Deduct Lives + eliminate at zero.
FR-12: Epic 3 — Win check + one-tap Re-deal; Loser starts next Round.
FR-13: Epic 5 — Auto Deck scaling (1 deck ≤10, 2 merged decks 11–20).
FR-14: Epic 4 — Host mid-session controls (change Lives, remove Player, reassign Host).
FR-15: Epic 7 — Per-device language choice (toggle on Home/Join; localStorage).
FR-16: Epic 7 — UI chrome localizes (copy.ts keyed dictionary).
FR-17: Epic 7 — Warm authored Spanish copy (fluent-speaker sign-off DoD).
FR-18: — Satisfied by design (comedy sting is purely visual; no v2 work).
FR-19: Epic 7 — Spanish card ranks (A=As / J=Jota / Q="Q" / K="R"; card-display.ts).
FR-20: Epic 6 — Off-Turn peek on the Waiting surface.

**NFR / AR / UX-DR distribution (cross-cutting items threaded as ACs):**
- NFR-1 / AR-4 (privacy chokepoint) — established in Epic 1, upheld in every subsequent epic.
- NFR-2 (server-authoritative), NFR-4 / AR-12 (identity), NFR-3 / AR-11 (zero-cost + GC), AR-1/2/3/13/14 (init, spike, pure engine, CI gates, tests) — Epic 1.
- AR-6 (monotonic guard) — Epic 2 (turn token), Epic 3/4 (phase token).
- AR-9 (deck/shuffle) — `shuffle` + single-deck `buildDeck` in Epic 2; 2-deck variance in Epic 5.
- AR-10 (Showdown resolution order), NFR-5 (reveal-finality), NFR-6 (flip-safety) — Epic 3.
- AR-5 (player-state rules), AR-8 (persistence + reload coercion) — Epic 1 seam; host-control specifics in Epic 4.
- NFR-9 (eyes-up), NFR-10 (accessibility), UX-DR1/16/18 (tokens, voice, primitives) — established Epic 1, applied per-surface throughout.
- UX-DR15 (Lives indicator) — Epic 1 (roster) + Epic 3 (deduction animation).
- UX-DR17 (PWA shell) — Epic 1.

## Epic List

### Epic 0: Standing Gates (properties of the whole)
Two build-wide, pass/fail guardrails — Eyes-Up / no-attention-sink (SM-2, SM-C1, SM-C2, the non-goals) and $0 / no-paid-dependency (SM-7) — that every other story must pass. Not features; siblings to the SM-6 privacy gate. Added after the full-set party-mode review (Mary) to stop the decomposition from orphaning the counter-metrics and properties-of-the-whole.
**SMs covered:** SM-1 (friction-not-prompt), SM-2, SM-7, SM-C1, SM-C2; §5 Non-Goals.

### Epic 1: Get to a Table together
A Host opens a URL, creates a Table, and reads out a 4-letter Room Code; Players join by entering it and land in a live, shared lobby where the Host sets Lives — all running on the private-by-default, server-authoritative, zero-cost foundation that the rest of the game depends on. Delivers the activation gate (SM-4) and stands up the one hard rule (secret-Card privacy) and the rule-engine/identity/persistence seams before any card is ever dealt.
**FRs covered:** FR-1, FR-2, FR-3, FR-4

### Epic 2: Play a Round
From a freshly dealt hand, every Player takes their Turn around the Table exactly once — peek your secret Card, then Swap it onto the Player to your right or Keep it; the Last Player may instead draw from the Deck; the King stays social. Delivers the squirm beat and the two-button, zero-confusion turn experience (SM-5), with the secret-Card privacy rule held the entire way.
**FRs covered:** FR-5, FR-6, FR-7, FR-8

### Epic 3: The Showdown
Once the Last Player has acted, the Host triggers the simultaneous reveal; the app flips every Card at once, computes the lowest value, highlights the Loser(s) (ties and all-tied included), deducts a Life, eliminates anyone at zero, declares a winner when one remains, and re-deals in one tap with the Loser starting the next Round. Delivers the reveal beat (SM-3) and closes the core game loop end-to-end.
**FRs covered:** FR-9, FR-10, FR-11, FR-12

### Epic 4: Conduct the night
The Host keeps a real table moving without restarting — change Lives between Rounds, remove a Player who left the room, and hand off the Host role — through conductor controls that live off the turn critical path and never clutter a Player's two-button turn screen. Serves the Host conductor gate.
**FRs covered:** FR-14

### Epic 5: Scale to the whole table
The app silently scales the Deck to the headcount — one deck for ≤10 Players, two merged decks for 11–20 — so the Host never thinks about it, and the Loser computation stays correct and unambiguous at a full 20-Player table where duplicate values (and more frequent ties) are expected and accepted.
**FRs covered:** FR-13 (and hardens FR-10/FR-11 at scale)

### Epic 6: See your card while you wait (v2)
A waiting Player can press-and-hold to peek their own secret Card on the Waiting surface — not just on their own Turn — so they can study their hand as the swap chain crawls toward them. Delivers the off-Turn-peek tension (UJ-5, SM-4), entirely client-side, with the secret-Card privacy rule held the whole way. Standalone: extends the Story 2.5 peek mechanic onto the Story 2.4 Waiting surface, reading the already-delivered `you.hand`; no dependency on Epic 7.
**FRs covered:** FR-20

### Epic 7: Play in your language (v2)
Each Player picks their own UI language on their device — English or Spanish — and the whole app speaks it to them: buttons, prompts, the warm loser/winner lines, and the Spanish card faces (As, Jota, Reina, Rey). A mixed table just works — abuela plays in Español while her grandson plays in English on his own phone. Delivers the bilingual welcome (UJ-4, SM-3), client-local per-device, with zero server or contract change. Standalone: a pure client refactor of `copy.ts` + `card-display.ts` + a toggle; no dependency on Epic 6.
**FRs covered:** FR-15, FR-16, FR-17, FR-19 (FR-18 satisfied-by-design)

## Party-Mode Review Decisions (binding on story creation)

Resolved with Winston (Architect), Sally (UX), Amelia (Dev). These do not change the 5-epic boundaries — they fix what lands in Epic 1 and several story-level ACs.

1. **Two-scope monotonic guard — built WHOLE in Epic 2 (Winston's vision, user-confirmed).** The guard primitive (turn token + phase token + stale-message rejection + reload coercion) is built as ONE primitive in Epic 2, not split across epics and not deferred to Epic 3. Epic 2 exercises BOTH scopes: phase token for `deal`, turn token for `swap`/`keep`/`drawFromDeck`. **Epic 1's create/join/set-lives uses lightweight phase validation only** (lobby-phase checks), NOT the formal token guard — the full guard arrives with Deal. Epics 3 & 4 only CONSUME the existing phase token (reveal-finality, host-controls); they introduce no new guard mechanism. (Resolves Amelia's Hazard A by having Epic 2 own both scopes, while honoring Winston's "don't split the mechanism.")
2. **Full `TableState` shape defined once, up front, in Epic 1 (`@trash/shared`).** Even though elimination / re-deal / loser-starts-next aren't exercised until Epic 3, the complete state shape — `lives`, `isAlive`, `seatIndex`, `startingPlayerId` — is defined in `@trash/shared` during Epic 1 so Epic 3 EXTENDS state rather than retrofitting it through `projectStateFor` and the durable summary. (Winston + Amelia agreed.)
3. **`projectStateFor` + the SM-6 negative-assertion test are written in Epic 1 ANTICIPATING the reveal phase.** The chokepoint and its privacy test are authored so Epic 3's Showdown reveal EXTENDS them (reveal flips `round.revealed`, projection then includes others' hands) rather than WEAKENING a too-narrow "never project another hand, full stop" rule. The SM-6 test pins to the engine-seam, not a floating "privacy" concept.
4. **A thinnest-possible reachable reveal closes the round loop (Sally).** The first end-to-end vertical slice must not stop at the end of Epic 2 with an un-resolved round. The bare simultaneous flip (Epic 3's minimal reveal) must be reachable as soon as the round loop closes so the squirm beat (Epic 2) is always playtested WITH its consequence (the reveal) attached. (Reinforced by the PRD's own "minimal-but-real" Showdown for MVP.)
5. **Per-surface voice-conformance ACs, peaking at Epic 3 (Sally).** UX-DR16 (voice) is a cross-epic thread, not an Epic-1 deliverable that closes at Lobby. Every epic that ships a new surface owns a voice-conformance AC; the highest-risk one is Epic 3's loser copy ("Ooof — lowest card, {name}", never "YOU LOST").
6. **Eliminated-spectator and Host Controls are play-confirmed bets, not build-to-spec (Sally).** Epic 3's Eliminated surface and Epic 4's Host Controls ship with ACs framed as validated-by-play (watch a real eliminated player stay engaged; watch a host conduct a real game without fumbling), reflecting their `[ASSUMPTION]`/playtest tags in the UX spec.
7. **Epic 3's Showdown resolution test is parameterized 2..20 from day one (Amelia).** The lowest-incl-all-tied / deduction / elimination / win-check pure tests run across player counts 2..20 in Epic 3 so Epic 5 does NOT reopen the core resolution function. Epic 5 therefore shrinks to: the deck-size mapping (1 deck ≤10 / 2 merged decks 11–20) + one boundary integration test.
8. **Deck is parameterized from Epic 2 (Winston).** `buildDeck` takes composition as input from Epic 2 ("deck composition is supplied, not assumed") so Epic 5's two-deck merge is a data/config change, not surgery on the deal logic.
9. **Spike is a hard go/no-go gate as the FIRST story of Epic 1 (Winston).** The pre-build spike (AR-2) is story 1.1, gate-and-stop with a documented go/no-go — not just the first card in the stack. If it invalidates the persistence boundary or `idFromName` semantics, the DO-per-Table premise is re-evaluated before any lobby code is written.

### Pre-mortem additions (binding — sharpen the above and close one gap)

A. **Epic 3 — squirm + reveal tuned JOINTLY in one live session (sharpens #4).** It is not enough that the reveal is reachable when the round loop closes. Before Epic 3 closes, the squirm beat (Epic 2) and the reveal beat (Epic 3) must be tuned together in the SAME live play session — never tuned separately. AC framing: "observed in one sitting that the swap-dread and the flip-payoff land as a pair." (Failure mode: each beat tuned in isolation, neither lands at the table.)

B. **Epic 1 — multi-device concurrent-join AC (NEW GAP, SM-4).** The plan tests `joinRoom` logic but not the concurrent room-fill EXPERIENCE that the activation gate actually lives on. Add an explicit Epic 1 AC: "6 devices join within ~30s and every device's roster updates live for every join/leave," exercised against `wrangler dev` with multiple tabs (the pool-workers project cannot drive real concurrent WS). This is the single biggest pre-mortem finding — the activation gate is a multi-device-concurrency property, not a single-device unit test.

C. **Epic 2 — Reluctant-Player play-confirmed AC (pins NFR-8 / SM-5).** "No confusion-stop" is qualitative and uncatchable by unit tests. Epic 2's turn story ships with a play-confirmed AC: "a genuine non-gamer completes a Turn (peek → Swap/Keep) unaided, with the card re-hiding cleanly and the debounce preventing double-fire." Framed as validated-by-play, like the #6 bets.

D. **Epic 1 spike go/no-go INCLUDES the GC connection probe (sharpens #9).** The story-1.1 go/no-go must empirically validate the GC connection-probe behavior (the probe reads correctly on alarm; self-delete only with no active connections; 3h idle TTL backstop) — NOT just `idFromName` claim-on-create and the D2/D2.1 persistence boundary. The thing that turns $0 into not-$0 (orphaned rooms) is exactly the thing easiest to under-test in a "throwaway" spike. (Spike outcome, 2026-06-19: `ctx.getWebSockets().length` is accurate ONLY when partyserver Hibernation is enabled — it reads 0 for standard-mode live sockets — so the probe requires Hibernation enabled or must count `getConnections()`; see AR-11 / Story 1.11.)

E. **SM-6 privacy test is a STANDING CI gate re-run on every new projection field (sharpens #3).** The negative-assertion projection test is not a one-time Epic 1 deliverable. Every epic that adds a field to `ProjectedTableState` (beat signals like `justReceivedSwap`, `loserIds`, `winnerIds`, reveal-phase hands) must re-pass the privacy assertion in CI. AC framing for each such field: "the new field carries no card value or pre-Showdown-inferable information, verified by the standing projection test."

## Epic 0: Standing Gates (properties of the whole)

Not buildable features — these are pass/fail, build-wide guardrails that EVERY other story must pass, siblings to the SM-6 privacy gate. They exist because the decomposition turned every *thing-to-build* into a story and would otherwise orphan every *thing-to-NOT-build* and every property-of-the-whole — which is exactly where this product's soul lives (Mary review). Established at the start of Epic 1's foundation work and enforced for the life of the project.

**Anchors:** SM-1, SM-2, SM-7, SM-C1, SM-C2; PRD §5 Non-Goals, §10 Aesthetic & Tone, §7 Counter-metrics.

### Story G1: Eyes-up / no-attention-sink standing gate

As the maker,
I want a build-wide gate that rejects anything that pulls eyes down,
So that no surface story can quietly optimize the exact thing the PRD calls failure.

**Acceptance Criteria:**

**Given** any story that adds or changes a surface
**When** it is reviewed for done
**Then** it must pass the Eyes-Up gate: NO feeds, chat, badges, notifications, streaks, accounts, leaderboards, dwell-maximizing or idle/ambient animation between Turns, and nothing that invites scrolling — the inactive surface shows only whose Turn it is; the active surface is two buttons + peek. *(SM-2, SM-C1, §5 Non-Goals, §10.)*

**Given** the counter-metrics (do NOT optimize)
**When** any metric/instrumentation is proposed
**Then** the build never optimizes for screen time, session length on-device, per-Turn dwell (SM-C1), or reach/install/returning-group counts (SM-C2); if any telemetry exists at all it may not target these as goals. *(SM-C1, SM-C2.)*

**Given** "one more round" (SM-1)
**When** continuation is designed
**Then** it is served by REMOVING friction (one-tap re-deal, no re-setup), never by a prompt-engine (no nag, no stats, no streak) — see Story 3.6 / 3.4 ACs.

### Story G2: $0 / no-paid-dependency standing gate

As the maker,
I want a build-wide gate that keeps the running cost at zero,
So that the launch gate (SM-7) can't be breached by a dependency added three stories deep.

**Acceptance Criteria:**

**Given** any story that adds a dependency or infrastructure
**When** it is reviewed for done
**Then** it must pass the $0 gate: no managed/paid WebSocket tier, no hosted TURN/STUN, no push service, no paid analytics, no always-on compute — only the free-tier Cloudflare Workers + Durable Objects (SQLite) + Pages + WebSocket Hibernation path, idle-to-zero. *(SM-7, §11.2.)*

**Given** the zero-cost property is runtime-dependent (Hibernation wired + rooms GC'd)
**When** the build is assessed
**Then** SM-7 is treated as pass/fail like SM-6: the GC alarm (Story 1.11) + Hibernation + free-tier limits are re-verified, and any new persistent connection or storage growth path is checked against the free-tier numbers. *(SM-7, NFR-3.)*

## Epic 1: Get to a Table together

A Host opens a URL, creates a Table, and reads out a 4-letter Room Code; Players join by entering it and land in a live, shared lobby where the Host sets Lives — all running on the private-by-default, server-authoritative, zero-cost foundation that the rest of the game depends on. Delivers the activation gate (SM-4) and stands up the one hard rule (secret-Card privacy) and the rule-engine/identity/persistence seams before any card is ever dealt.

**FRs:** FR-1, FR-2, FR-3, FR-4 · **Anchors:** AR-1, AR-2, AR-3, AR-4, AR-5, AR-8, AR-11, AR-12, AR-13, AR-14; NFR-1, NFR-2, NFR-3, NFR-4; UX-DR1–4, 15, 16, 17, 18 · **Binding decisions:** #1 (lightweight lobby validation, no formal guard yet), #2 (full TableState up front), #3 + E (chokepoint anticipates reveal; standing privacy gate), #9 + D (spike go/no-go incl. GC probe), B (multi-device join AC).

### Story 1.1: Pre-build spike — go/no-go on the Durable Object premise

As the builder,
I want to empirically verify the riskiest Cloudflare assumptions before any product code,
So that the DO-per-Table, zero-cost, persistence-on-restart premise is proven (or re-decided) before I build on it.

**Acceptance Criteria:**

**Given** a throwaway Worker + Durable Object spike project
**When** `createRoom` derives a DO via `idFromName(code)` and marks it claimed on first init, and a second create addresses the same name
**Then** the claim-on-create flow is observed to behave as the architecture assumes (an addressed DO can report already-claimed so the caller regenerates)
**And** the findings are written to a short spike findings doc (not shipped code).

**Given** a DO holding an in-flight round in memory and a durable summary in `ctx.storage`
**When** the DO is force-killed / restarted mid-round
**Then** the durable summary (code, phase, hostId, startingLives, players[id,name,lives,isAlive,seatIndex], phaseToken) survives and the in-flight round is gone
**And** the D2.1 reload-reconciliation coercion is validated: on wake, a persisted phase implying a live round with `round === null` coerces to a safe between-rounds surface and bumps `phaseToken` before the first projection.

**Given** a DO with one or more live WebSocket connections and an idle GC alarm firing
**When** the connection probe runs
**Then** the DO self-deletes ONLY when there are no active connections, and a room with connected players is NOT deleted
**And** the probe-behavior finding is captured in the findings doc — INCLUDING the spike result (2026-06-19) that `ctx.getWebSockets()` returns ONLY hibernation-accepted sockets and reads 0 for standard-mode (partyserver-default) live sockets, so the probe requires partyserver Hibernation enabled (or must count `getConnections()`). *(Pre-mortem D; carried into AR-11 / Story 1.11.)*

**Given** the spike findings
**When** any assumption (idFromName claim-on-create, persistence boundary, D2.1 coercion, GC/hibernation probe) is found false
**Then** a documented go/no-go decision is recorded and the DO-per-Table premise is re-evaluated BEFORE Story 1.2 begins. *(This story is gate-and-stop — decision #9.)*

### Story 1.2: AC-driven project initialization

As the builder,
I want the repo scaffolded exactly to the architecture's init contract with the enforcement gates live from commit one,
So that every later story inherits the correct workspace layout, free-tier guarantees, and mechanical guardrails.

**Acceptance Criteria:**

**Given** a fresh repo
**When** initialization completes
**Then** three npm workspaces exist — `shared`, `server`, `client` — with `shared` importable by name as `@trash/shared` (no path-alias hack)
**And** the server uses the C3 "Worker only" template (NOT the DO template), with `wrangler.jsonc` declaring `migrations: [{ tag: "v1", new_sqlite_classes: ["TableServer"] }]` correct in this first commit, a pinned recent `compatibility_date`, and the DO binding name ↔ `class_name` ↔ exported class symbol all matching
**And** the Worker fetch entry calls `routePartykitRequest(request, env)`
**And** deps are pinned to the architecture's verified versions; directory layout includes `server/src/server/`, `server/src/rules/`, `client/`, and `test/`.

**Given** the vitest configuration
**When** tests run
**Then** there are two projects — node env (rules + projection) and `@cloudflare/vitest-pool-workers` (DO) — both green on an empty scaffold.

**Given** the ESLint configuration (the mechanical privacy/purity gates)
**When** a `Date.now()` / `Math.random()` / `crypto` / `fetch` / `storage` / `this.` token is planted in `server/src/rules/**`, OR a `.send(`/`.broadcast(` is planted outside `server/src/push-state.ts`
**Then** lint FAILS on each planted violation (the ban tests go red first — red/green discipline)
**And** removing the planted violations returns lint to green. *(AR-1, AR-13.)*

### Story 1.3: Shared wire contract — full state shape up front

As the builder,
I want the complete authoritative and projected state shapes plus the intent/event/error unions defined once in `@trash/shared`,
So that later epics extend the contract rather than retrofitting it, and a contract change breaks compilation on both server and client immediately.

**Acceptance Criteria:**

**Given** `@trash/shared`
**When** the contract is authored
**Then** it defines `Card` (`rank: 1..13`, decorative `suit`), `Phase` (enumerating ALL SEVEN phase values up front per the architecture's canonical list — `lobby`/`dealing`/`turns`/`allActed`/`showdown`/`roundResult`/`gameOver` — where `allActed` is the real phase value the server enters when the one pass completes, that 2.6 emits and 3.2 consumes; it is a Phase literal, NOT a derived predicate), the full `TableState` (incl. `players[].lives/isAlive/seatIndex`, `hostId`, `startingLives`, `phaseToken`, and `round` with `startingPlayerId`/`currentTurnId`/`turnToken`/`hands`/`deck`/`acted`/`revealed`), `ProjectedTableState`, the `Intent` union, the `ServerEvent` union (`tableState` | `error`), the `ErrorReason` union, and `IntentError` as a pure class
**And** the elimination/seat/lives/startingPlayer fields AND the `allActed` phase value exist now even though they are not exercised until Epic 2/3 — so 3.2 consumes a phase the contract already names, never introduces it. *(Decision #2; Winston review.)*

**And** the `Intent` union names `newGame` (Host, `gameOver`→`lobby` "one more?", phaseToken-guarded) up front alongside `dealAgain`, so Story 3.6's "one more?" extends a contract the type already names rather than introducing a new intent late. *(Winston review — phase-machine reconciliation: `dealAgain` = between-rounds re-deal; `newGame` = new game on the same Table.)*

**Given** the `Card` type
**When** any comparison is written
**Then** comparison is `<`/`>` on integer `rank` only; `suit` is never compared; the rank→letter map does NOT live in `@trash/shared` (it is client-only, Story 1.9).

**Given** a future contract change
**When** a field is added or changed in `@trash/shared`
**Then** both `server` and `client` fail to compile until updated (single source of truth verified).

**Given** the wire protocol rules (AR-7)
**When** the contract is authored
**Then** it encodes: server→client is a SINGLE `tableState` event carrying a complete `ProjectedTableState` (never deltas/patches — no `patch`/`delta` field exists in the type) plus a targeted `error`; every message is a `{type,payload}` envelope with camelCase fields; transient beat signals (`justReceivedSwap`, `revealed`, `loserIds`, `winnerIds`) are value-free fields ON the snapshot, not separate streams; and there are NO continuous/animation-driven server messages (beats are discrete state changes only). *(AR-7 — recall gap; the protocol rules, not just the types.)*

### Story 1.4: Privacy chokepoint + standing SM-6 negative-assertion test

As a Player,
I want my secret Card to be physically impossible to send to anyone else's device before Showdown,
So that the one hard integrity rule holds — verified mechanically, not by reviewer vigilance.

**Acceptance Criteria:**

**Given** `server/src/project-state.ts`
**When** the egress layer is built
**Then** `projectStateFor(state, playerId)` is the SOLE producer of a `tableState` payload, returning the caller's own `hand` and OMITTING every other player's `hand` while `round.revealed` is false
**And** `server/src/push-state.ts` is the ONLY module that calls `connection.send` (enforced by the Story 1.2 ESLint gate).

**Given** the chokepoint is authored anticipating the reveal phase
**When** `round.revealed` is true (a state only reachable in Epic 3)
**Then** the SAME projection function includes other players' hands — so Epic 3 EXTENDS this function rather than weakening a too-narrow rule. *(Decision #3.)*

**Given** the negative-assertion privacy test (the SM-6 acceptance criterion)
**When** a multi-player `TableState` with distinct hands is projected for one playerId while `revealed === false`
**Then** the test asserts NO other player's card value (or any pre-Showdown-inferable derivative) appears anywhere in that payload, and FAILS if one does. (This story asserts ONLY the `revealed=false` behavior — the reveal-true projection is Story 3.2's, so this AC does not forward-bind to Epic 3.) *(Amelia review.)*
**And** this test is registered as a STANDING CI gate that every later epic's new `ProjectedTableState` field must re-pass. *(Pre-mortem E.)*

**Given** the SM-6 inference channels (no card seen OR INFERRED — pass/fail)
**When** the standing privacy test runs
**Then** it asserts, in addition to value-absence: (a) **constant message shape** — the pre-Showdown projection has the same structure/field-set regardless of any player's hidden card value (no value-dependent branch that changes payload shape or size); (b) a documented obligation that turn-scoped responses (swap/keep/peek/draw) are **timing-indistinguishable** by card value (no value-dependent server latency branch); (c) a documented obligation that no surface renders a **behavioral tell** (glow/enabled-state/count) that lets a neighbor infer a hidden card. *(Mary review — SM-6 inference channels; (a) is a unit AC, (b)/(c) are standing review obligations carried into 2.4/2.5/2.7.)*

### Story 1.5: Player identity & session

As a Player,
I want a stable identity that survives a socket blip,
So that all my game state is keyed to me — not my connection — making the game correct today and reconnection cheap to add later.

**Acceptance Criteria:**

**Given** a Player creating or joining a Table
**When** identity is issued
**Then** `identity.ts` assigns a `playerId` + session token via `crypto.randomUUID()`, independent of socket identity, and all server state is keyed by `playerId` (never socket id). *(NFR-4, AR-12.)*

**Given** the client
**When** identity is received
**Then** the session token is persisted to `localStorage` and echoed on a subsequent `joinRoom`
**And** partysocket auto-reconnect is DISABLED (the reconnection FLOW is out of MVP; only the issuance seam ships now).

### Story 1.6: Create a Table and get a Room Code

As a Host,
I want to create a Table from my browser and get a short code to read aloud,
So that I can start a game in seconds with no account, email, or install.

**Acceptance Criteria:**

**Given** a browser with no account/session
**When** the Host sends `createRoom{name}`
**Then** a new Table is created server-side, the creator becomes Host and first Player, and a Room Code is returned
**And** the code is 4 uppercase letters from the ambiguity-safe alphabet (excludes O,0,I,1,L), generated via `crypto.getRandomValues()`. *(FR-1, AR-11.)*

**Given** code generation
**When** a generated code addresses an already-claimed (active) DO
**Then** the server regenerates and retries (claim-on-create; the DO namespace is the registry).

**Given** no Player has joined yet
**When** the Host creates the Table
**Then** the Table is in `lobby` phase and validation at this stage is lightweight phase-checking only — NOT the formal two-scope token guard (which arrives in Epic 2). *(Decision #1.)*

### Story 1.7: Join a Table and see a live, multi-device roster

As a Player,
I want to enter the Room Code and immediately see myself and everyone else appear,
So that the whole table gets in and ready within the activation window.

**Acceptance Criteria:**

**Given** a valid Room Code and a display name in `lobby` phase
**When** a Player sends `joinRoom{code,name,sessionToken?}`
**Then** they are added to the Table and every connected device's roster updates to show the new Player. *(FR-2, FR-3.)*

**Given** an invalid or expired Room Code
**When** a Player attempts to join
**Then** an `error` with reason `bad-code` is returned and the Player can retry; no partial/ghost join occurs.

**Given** a game already past the first Deal
**When** a Player attempts to join with the code
**Then** the join is refused (no joining a game in progress; late join allowed in lobby only). A Player who leaves mid-game stops taking Turns; no reconnection in MVP.

**Given** ~6 devices joining the same Table within ~30 seconds (the activation gate)
**When** each device joins or leaves
**Then** every device's roster reflects every change live, with no stale lobby on any device — verified by an integration test against `wrangler dev` with multiple concurrent connections (the pool-workers project cannot drive real concurrent WS). *(Pre-mortem B — SM-4.)*

**Given** two devices joining the same Table at the same instant near the seat cap
**When** the concurrent joins are processed
**Then** correctness is guaranteed by the Durable Object's single-threaded serialization + state-shape validation (NOT the formal two-scope guard, which would no-op in `lobby` phase) — an explicit concurrent-join test asserts this, and the lobby's reliance on DO serialization + lightweight validation is documented so Epic 2's guard never reroutes lobby actions. *(Winston review; decision #1.)*

### Story 1.8: Host sets starting Lives

As a Host,
I want to choose how many Lives everyone starts with,
So that I can tune the game length for the room before dealing.

**Acceptance Criteria:**

**Given** a Table in `lobby` phase
**When** the Host sets a Lives value
**Then** the value is constrained to 1–5 and applies to all Players; if the Host never changes it, the default is 3. *(FR-4.)*

**Given** a non-Host Player
**When** they attempt to set Lives
**Then** the action is refused (`not-host`); the Lives control is not offered on their device.

### Story 1.9a: Design-token foundation & render-from-state router

As any Player,
I want the app to look like "Trash" and route to the right surface from current state,
So that the visual foundation and the state-driven routing every later surface inherits are correct.

**Acceptance Criteria:**

**Given** the client styling foundation
**When** tokens are authored
**Then** the full DESIGN.md "Electric Social" token set (color palette, Anybody + Hanken Grotesk type scale with weights ≥500, 8px-based spacing, chunky radii / pill primaries, tonal-stack elevation + 4px neon active stroke) exists as plain CSS custom properties in `client/src/tokens.css` — no Tailwind, no UI kit — and the two fonts are bundled locally. *(UX-DR1.)*

**Given** the render-from-state router
**When** a `ProjectedTableState` (or none yet) arrives
**Then** `App.svelte` routes to exactly one surface as a pure function of state, with no persistent navigation; "no `tableState` yet" renders the Home/connecting surface. *(UX-DR2.)*

### Story 1.9b: PWA shell, voice primitives & interaction safety

As any Player,
I want the app installable, warm in its words, and safe to tap,
So that the installability, voice, and interaction-safety primitives every surface inherits are in place.

**Acceptance Criteria:**

**Given** the PWA shell and global microcopy/voice
**When** the app is installed / strings render
**Then** `vite-plugin-pwa` provides an installable app-shell (manifest + the two produced icons; portrait-only, dark-only; offline gameplay explicitly out of scope), the manifest description is corrected to the warm voice (the "high-stakes underground" copy is rejected), and the shared microcopy primitives follow the EXPERIENCE.md voice table. *(UX-DR16, UX-DR17.)*

**Given** interaction safety primitives
**When** any primary action is tapped
**Then** the shared button primitive debounces (no double-fire), tap targets are ≥48dp, and primary actions sit in the lower thumb-zone. *(UX-DR18, NFR-10.)*

### Story 1.10: Home & Lobby surfaces

As a Host or joining Player,
I want warm, sparse Home and Lobby screens,
So that I can start or join a table and watch the room fill, all within the activation window.

**Acceptance Criteria:**

**Given** the Home surface (built on the Story 1.9 foundation)
**When** it renders
**Then** it shows two big buttons — "Start a table" / "Join a table"; Join shows a 4 letter-slot Room Code field (auto-uppercase, auto-advance, paste-friendly) + display-name entry; a bad/expired code shows a warm inline error under the field. *(UX-DR3.)*

**Given** the Lobby surface
**When** it renders
**Then** the Room Code displays large and letter-spaced (Display-LG, the most prominent element), the roster updates live with Lives pips (filled = remaining neon-mint, hollow = spent using the `outline` token; numeral paired for ≥4), the Host sees a Lives stepper (1–5, default 3) and a conductor bar with Deal disabled until ≥2 Players. *(UX-DR4, UX-DR15.)*

**Given** all Home/Lobby copy
**When** strings render
**Then** they match the EXPERIENCE.md voice table verbatim (warm, playful, inclusive; never high-stakes/underground/mean). *(UX-DR16 — first surface application of the cross-epic voice thread, decision #5.)*

### Story 1.11: Room garbage collection (zero-cost backstop)

As the builder,
I want abandoned Tables to clean themselves up,
So that orphaned rooms can never turn the $0 running cost into a real cost.

**Acceptance Criteria:**

**Given** an active Table DO
**When** activity occurs
**Then** the DO arms a `ctx.storage` alarm (default `IDLE_TTL_MS`, 3h), debounced so it only re-arms if more than a few minutes since the last arm (no per-intent write amplification). *(AR-11, NFR-3.)*

**Given** the alarm timing must be testable without waiting 3h
**When** the GC tests run
**Then** they assert behavior via an injected clock / `IDLE_TTL_MS` config + alarm fast-forward in the pool-workers project — NOT wall-clock duration. *(Amelia review.)*

**Given** partyserver Hibernation must be enabled so connections are accepted via the native hibernation API (`ctx.acceptWebSocket()`) — the precondition for an accurate connection probe AND for the idle-billing benefit NFR-3/SM-7 assume
**When** Story 1.11 is built
**Then** it verifies partyserver's hibernation mode actually wires `ctx.acceptWebSocket()` (e.g. that an open socket appears in `ctx.getWebSockets()`); if hibernation cannot be confirmed, the GC probe instead counts partyserver's own registry `[...this.getConnections()].length`. *(Story 1.1 spike correction, 2026-06-19.)*

**Given** the GC alarm fires
**When** the connection probe runs
**Then** the DO self-deletes (clears storage, releasing the Room Code) ONLY if there are no active connections — `ctx.getWebSockets().length === 0` when Hibernation is enabled, else `[...this.getConnections()].length === 0`; a room with hibernating-but-connected players is preserved and the 3h idle TTL is the backstop for sockets that never cleanly close.

**Given** a single live (open) WebSocket connection — the exact case the Story 1.1 spike caught reading 0 under standard-mode sockets
**When** the connection probe runs
**Then** a test asserts the probe reports a NON-zero count (so a room full of active players is never deleted); `ctx.getWebSockets()` returns ONLY hibernation-accepted sockets, so this test fails unless Hibernation is enabled (or the probe counts `getConnections()`). *(Story 1.1 spike correction, 2026-06-19.)*

**Given** no central reaper exists
**When** any Table is GC'd
**Then** it is solely via that Table's own DO alarm (per the spike-validated behavior from Story 1.1).

## Epic 2: Play a Round

From a freshly dealt hand, every Player takes their Turn around the Table exactly once — peek your secret Card, then Swap it onto the Player to your right or Keep it; the Last Player may instead draw from the Deck; the King stays social. Delivers the squirm beat and the two-button, zero-confusion turn experience (SM-5), with the secret-Card privacy rule held the entire way.

**FRs:** FR-5, FR-6, FR-7, FR-8 · **Anchors:** AR-3, AR-6, AR-9; NFR-1, NFR-2, NFR-8, NFR-9, NFR-10; UX-DR5, 6, 7, 8, 18 · **Binding decisions:** #1 (two-scope guard built WHOLE here; Epic 2 exercises BOTH scopes — phase token for `deal`, turn token for `swap`/`keep`/`drawFromDeck`), #8 (deck composition supplied, not assumed), pre-mortem C (Reluctant-Player play-confirmed AC).

### Story 2.1: Deck build & seeded shuffle (pure, parameterized)

As the builder,
I want a pure, deterministic-testable deck and shuffle whose composition is supplied as input,
So that the round can be dealt fairly today and scaled to two decks later (Epic 5) with a data change, not surgery.

**Acceptance Criteria:**

**Given** `server/src/rules/engine.ts`
**When** `buildDeck(composition)` is called
**Then** it returns a deck from the SUPPLIED composition (a single 52-card deck for the Epic 2 single-deck case), with composition passed in — never hardcoded to 52 inside deal logic. *(Decision #8, AR-9.)*

**Given** `shuffle(deck, rng)`
**When** it runs
**Then** it is a pure Fisher–Yates with the RNG injected, produces a deterministic order for a fixed seed (unit-tested), and the production caller seeds it from `crypto.getRandomValues()` — never `Math.random()`
**And** `server/src/rules/**` purity holds (no crypto/Date/Math.random/storage tokens — the Story 1.2 ESLint gate stays green).

### Story 2.2: Two-scope monotonic guard (built whole)

As the builder,
I want one monotonic-guard primitive covering both turn-scoped and phase-scoped intents,
So that turn races, double-taps, replays, ordering, and reveal-finality are all one family of check — built once, not split across epics.

**Acceptance Criteria:**

**Given** the guard primitive
**When** it is authored
**Then** a **turn token** (`round.turnToken`) guards turn-scoped intents (`swap`/`keep`/`drawFromDeck`) and a **phase token** (`phaseToken`) guards Host-conducted transitions (`deal`/`revealAll`/`dealAgain`/host-controls and lobby `joinRoom` gating) — both built now as one mechanism. *(Decision #1, AR-6.)*

**Given** an intent carrying a token
**When** the token does not match the server's expected value (stale / double-tap / replay / race)
**Then** the server rejects it with a typed `error` (`stale-turn` or `stale-phase`), does NOT mutate state, and client timestamps are never consulted.

**Given** a client receiving `stale-turn`/`stale-phase`
**When** it handles the error
**Then** it discards silently with NO toast and re-renders the next `tableState` snapshot (a benign double-tap never shows a user-facing error).

**Given** the accepted path
**When** a valid turn-scoped or phase-scoped intent is applied
**Then** the corresponding token increments monotonically (so the next stale copy mismatches).

**Given** the guard is the single chokepoint every phase transition flows through (the WRITE counterpart to Story 1.4's READ chokepoint)
**When** any guarded phase transition is accepted
**Then** the durable summary (`code, phase, hostId, startingLives, players[{id,name,lives,isAlive,seatIndex}], phaseToken`) is persisted to the single `ctx.storage` key `"table"`, while the in-flight `round` stays in memory only. *(Winston review — closes the persistence-implementation gap; AR-8.)*

**Given** a Durable Object waking from hibernation/restart (D2.1 reload coercion)
**When** the persisted `phase` implies a live round but `round === null`
**Then** the server coerces `phase` to a safe between-rounds / needs-redeal surface and bumps `phaseToken` BEFORE the first projection — verified by a mid-round force-reload test (the behavior the 1.1 spike validated is now IMPLEMENTED here). *(Winston review; AR-8 / D2.1.)*

### Story 2.3: Deal secret Cards & simultaneous dealt state

As a Host,
I want one tap to deal a secret Card to every active Player and move the whole table into the round at once,
So that the reveal-down beat happens simultaneously and play can begin.

**Acceptance Criteria:**

**Given** a Table in `lobby` with ≥2 Players
**When** the Host sends `deal` (carrying the current `phaseToken`)
**Then** the Deck is reconstituted and reshuffled, each active Player receives exactly one Card, `acted` resets to `[]`, and the phase advances to the turns phase — a double-tapped `deal` is rejected by the phase token (Story 2.2). *(FR-5.)*

**Given** the dealt state
**When** projections are pushed
**Then** each device receives only its OWN Card via `projectStateFor` (others' hands omitted; the standing SM-6 test still passes), and all devices transition to the dealt state together so the reveal-down is simultaneous. *(NFR-1.)*

**Given** Starting Player rules
**When** the Round begins
**Then** the Host is the Starting Player on the very first Round of a game; turn order proceeds to each Player's right via `nextAliveSeat`; (the previous-Round's-Loser-starts rule is exercised in Epic 3 once a Loser exists). *(FR-5.)*

**Given** the fast-start measure (SM-4 / NFR-7 — end-to-end "let's play" → dealt)
**When** a Host creates, ~6 Players join, and the Host Deals
**Then** the create→join→dealt path completes in well under ~30 seconds, measured end-to-end at the moment of `deal` (this is where "dealt" happens), spanning Stories 1.6→1.7→2.3. *(NFR-7 — recall gap; owns the end-to-end timing.)*

### Story 2.4: Take a Turn — Swap or Keep (the two-button hero)

As an active Player (including the Reluctant Player),
I want exactly two big choices on my turn — Swap or Keep,
So that I can act instantly with zero confusion and shove my trash onto my neighbor (the squirm).

**Acceptance Criteria:**

**Given** it becomes a Player's Turn
**When** the engine routes them
**Then** their device shows the Your Turn surface — the neon active frame (gentle ~1.2s pulse; static under Reduce Motion), two massive (≥72px) pill primaries SWAP and KEEP in the thumb zone, and a peek control; nothing else competes. *(FR-6, UX-DR5, NFR-9.)*

**Given** an inactive Player
**When** someone else is acting
**Then** their device shows ONLY the Waiting surface — the active Player's name in a static frame, no pulse, no motion, plus their own Lives; never any Card value. *(FR-6, UX-DR6.)*

**Given** SWAP
**When** the active Player taps it (carrying the turn token)
**Then** the active Player and the Player to their right EXCHANGE Cards (each then holds the other's former Card; everyone still holds exactly one), the Turn passes right, and the receiving Player's device shows a value-free squirm signal (`justReceivedSwap`) — which carries no card data and re-passes the standing SM-6 test. *(FR-6, AR-7.)*

**Given** KEEP
**When** the active Player taps it
**Then** their Card is retained and the Turn passes right; turn order is exactly ONE pass (Starting Player → Last Player, no wrap); there is no timer and no auto-advance.

**Given** a genuine non-gamer at the table
**When** they take a Turn unaided (peek → Swap/Keep)
**Then** they complete it without anyone leaning over to help, the card re-hides cleanly, and the debounce prevents a double-fire — validated by play, not only unit test. *(Pre-mortem C, NFR-8/SM-5.)*

**Given** the King is social-only (FR-8 — a negative requirement: absence of code, folded here per Amelia review)
**When** any Swap is validated
**Then** the Swap is NEVER refused on the basis of the target's Card value, `validate.ts`/`engine.ts` contain NO King-specific branch and NEVER read another Player's Card to decide whether a Swap is allowed, and a standing test asserts no Swap-validation path depends on a non-owner's hand (the King is simply the highest value at Showdown). The table's "you can't dump on me" convention is honored socially; the app shows nothing. *(FR-8, NFR-1, §11.1.)*

**Given** the accessibility floor on Your Turn (NFR-10)
**When** the surface is built
**Then** SWAP and KEEP are the FIRST two focus stops (focus order follows reading order), every action is labeled with role + state, and the turn indicator announces "Your turn" to the screen reader on transition. *(NFR-10 — recall gap; focus order + SR turn-announce.)*

### Story 2.5: Peek your own Card

As an active Player,
I want to press and hold to peek my secret Card and have it hide the instant I let go,
So that I can decide my move without ever exposing my hand to the neighbor leaning over.

**Acceptance Criteria:**

**Given** the Your Turn surface
**When** the Player presses and holds the peek control
**Then** their own Card shows as a big rank + single suit pip (Display-XL), and on release it re-hides immediately; it is never shown persistently. *(FR-6, UX-DR7, UX-DR8.)*

**Given** a peeked Card and a distraction
**When** the control loses focus or the app is backgrounded
**Then** the Card auto-hides (a phone set down never exposes a hand). *(Verified via manual/Playwright — blur/visibilitychange/pagehide are not deterministic in jsdom; Amelia review.)*

**Given** the hidden (default) state
**When** the surface renders
**Then** the Card is a face-down neon-outlined back, and the rank is NOT present in the accessibility tree while hidden. *(Asserted as a node/component a11y-tree test — Amelia review.)*

**Given** the SR peek path
**When** the "Peek your card" element is activated
**Then** it announces the rank ONCE to the owner's device only and discards it (never a persistent readable node, never sent to any other device). *(UX-DR7, NFR-10.)*

**Given** the rank→letter display
**When** a Card renders
**Then** the int→letter map (1→A … 13→K, Ace lowest) lives ONLY in `client/src/lib/card-display.ts`; suit is decorative, distinguished by shape not color. *(UX-DR8.)*

### Story 2.6: Last Player option — Swap or draw from the Deck

As the Last Player,
I want a third choice — draw a random Card from the Deck instead of swapping,
So that the final seat (and the heads-up game) has the luck-of-the-draw escape.

**Acceptance Criteria:**

**Given** the single Last Player (whose right-hand neighbor is the Starting Player)
**When** their Turn arrives
**Then** their device adds a visually-subordinate Secondary "Draw from deck" button alongside SWAP/KEEP — shown ONLY on that one seat; every other Player still sees exactly Swap/Keep. *(FR-7, UX-DR5.)*

**Given** the Last Player draws from the Deck
**When** the draw resolves (carrying the turn token)
**Then** their Card is replaced by a random Card from the remaining Deck, the discarded Card is removed from the Deck for the rest of the Round (returns at the next Deal), and this is the final Turn of the one pass.

**Given** the last action of the one-pass resolves (Last Player's Swap/Keep/draw)
**When** the turn completes
**Then** the round phase transitions to the `allActed` phase value (the phase named in the 1.3 contract) — so Story 3.2's `revealAll` only READS/consumes it and never introduces it. *(Winston review.)*

**Given** the deck-draw availability (edge E2)
**When** the Last Player draws
**Then** there is ALWAYS ≥1 Card available — deck size ≥ player count by construction (52 ≥ 20 single-deck; 104 for 11–20 two-deck), so no empty-deck path exists; this is stated so a reviewer need not re-derive it and a future change can't silently break it. *(Edge-case sweep E2.)*

**Given** a heads-up Table (2 Players)
**When** the Round plays
**Then** Player 1 (Starting Player) may Swap (exchange with Player 2) or Keep; Player 2 (Last Player) may Swap with Player 1 or draw from the Deck — the deck draw is pure luck. *(FR-7 heads-up path.)*

*(Story 2.7 — King is social-only — folded into Story 2.4 per Amelia review: it is a negative requirement (absence of code), realized as a standing test, not buildable work. FR-8 traceability preserved via the 2.4 AC above.)*

## Epic 3: The Showdown

Once the Last Player has acted, the Host triggers the simultaneous reveal; the app flips every Card at once, computes the lowest value, highlights the Loser(s) (ties and all-tied included), deducts a Life, eliminates anyone at zero, declares a winner when one remains, and re-deals in one tap with the Loser starting the next Round. Delivers the reveal beat (SM-3) and closes the core game loop end-to-end.

**FRs:** FR-9, FR-10, FR-11, FR-12 · **Anchors:** AR-6 (consumes phase token), AR-10; NFR-1, NFR-5, NFR-6, NFR-10; UX-DR9, 10, 11, 12, 15, 16 · **Binding decisions:** #3 + E (reveal EXTENDS the chokepoint; standing privacy test re-passes on `loserIds`/`winnerIds`/revealed hands), #5 (voice peaks here — loser copy), #6 (Eliminated = play-confirmed bet), #7 (resolution test parameterized 2..20), pre-mortem A (squirm + reveal tuned jointly).

### Story 3.1: Showdown resolution engine (pure, parameterized 2..20)

As the builder,
I want a pure function that computes the canonical Showdown outcome for any table size,
So that loser-finding, ties, deduction, elimination, and the win-check are correct and tested across 2..20 once — so Epic 5 never reopens it.

**Acceptance Criteria:**

**Given** `server/src/rules/engine.ts`
**When** the resolution runs over a set of revealed hands
**Then** it follows the canonical order: (1) reveal, (2) compute Loser(s) = all Players holding the lowest VALUE by rank (Ace lowest; suit ignored; duplicate values are exact ties — all such Players lose), (3) deduct one Life from each Loser, (4) mark `isAlive=false` for any Player at 0 Lives, (5) win-check, (6) — only if ≥2 alive and re-dealing — compute next Starting Player. *(FR-10, FR-11, AR-10.)*

**Given** the win-check (step 5)
**When** it evaluates
**Then** exactly 1 alive → that Player wins (game over); 0 alive (all tied to zero in one Showdown) → shared win (game over); ≥2 alive → continue. The tiebreak (step 6) NEVER runs when the game ended at step 5. *(FR-12.)*

**Given** the multi-Loser tiebreak (step 6)
**When** a Re-deal will occur
**Then** the next Starting Player is the tied Loser seated earliest in turn order from the previous Starting Player's seat (scan right via `nextAliveSeat`; previous Starting Player eligible if themselves a tied Loser); if that Loser was eliminated this Showdown, the next surviving seat to their right starts. *(FR-12, AR-10.)*

**Given** the pure resolution tests
**When** they run
**Then** they are PARAMETERIZED across player counts 2..20 and cover: single lowest, two-way tie, all-tied (every Player same value), zero-survivors shared win, single-survivor win, and tiebreak-with-eliminated-loser — all in node env, no I/O
**And** the tiebreak-with-eliminated-loser fixtures HAND-CONSTRUCT the eliminated state directly (seed `isAlive=false` seats in the input), NOT via the Epic-3 elimination flow — so this pure test never forward-binds to Story 3.4. *(Decision #7; Amelia review — so Epic 5 adds only deck-size mapping, not a re-test of this function.)*
**And** the cases include the permutation where MULTIPLE tied Losers are ALL eliminated this Showdown while ≥2 other Players survive — the starting-seat scan (`nextAliveSeat` from the previous Starting Player's seat) must skip past ALL eliminated tied Losers to the next surviving seat. *(Edge-case sweep E3.)*

### Story 3.2: Trigger Showdown with reveal-finality

As a Host,
I want to flip every Card at once only after everyone has acted,
So that no Card is ever both still-mutable and visible — the reveal is final.

**Acceptance Criteria:**

**Given** a Round where the Last Player has acted (phase = `allActed`: every `isAlive` Player from the Deal snapshot is in `acted`)
**When** the Host sends `revealAll` (carrying the current `phaseToken`)
**Then** the reveal is accepted, `round.revealed` becomes true, and the phase advances — consuming the existing phase token from Epic 2 (no new guard introduced). *(FR-9, AR-6.)*

**Given** a `revealAll` arriving before `allActed`, or a double-tap
**When** it is validated
**Then** it is rejected (`phase-illegal` or `stale-phase`); no Card is revealed while any Card is still mutable. *(NFR-5.)*

**Given** the reveal
**When** projections are pushed
**Then** because `round.revealed` is true, `projectStateFor` now INCLUDES every Player's hand in each payload (the SAME function from Story 1.4, extended — not weakened), and this is the first moment a non-owner device receives another Player's Card value; the standing SM-6 test confirms hands are present ONLY when `revealed` is true. *(Decision #3 + E, NFR-1.)*

### Story 3.3: Showdown surface — the safe flip & loser highlight

As the whole table,
I want every Card to flip together and the loser to be unmistakable,
So that the reveal lands as a shared "OHHH" even across twenty cards — the loud beat.

**Acceptance Criteria:**

**Given** the Showdown surface
**When** `revealed` flips true
**Then** all Cards animate face-up via a single coordinated flip ≤400ms — no strobe, nothing flashing >3×/second, no full-viewport flash; under Reduce Motion the flip is skipped (cards appear face-up instantly). *(FR-9, NFR-6, UX-DR9.)*

**Given** the computed Loser(s)
**When** the surface renders the result
**Then** Loser Card(s) are framed in the error ramp with a thick stroke + gentle scale-up (highlight by stroke + scale + position, never color alone), unmistakable across up to 20 cards; non-losing Cards recede to no lower than 70% opacity (faces stay ≥4.5:1 legible). *(FR-10, UX-DR9, NFR-10.)*

**Given** the loser copy (the highest-stakes voice moment)
**When** the losing device renders
**Then** it shows warm tease copy ("Ooof — lowest card, {name}"), never "YOU LOST"; the all-tied case shows "Tie for lowest — everybody drops a life!" *(UX-DR16, decision #5 — voice peaks here.)*

**Given** the reveal is designed for the deferred v1.1 produced FX
**When** the beat is built
**Then** it is minimal-but-real (not sterile) and structured so FX can drop onto the loser's phone later without rework. *(PRD §6.2.)*

**Given** the squirm beat (Epic 2) and this reveal beat
**When** they are tuned
**Then** they are tuned TOGETHER in the same live play session before Epic 3 closes — observed in one sitting that swap-dread and flip-payoff land as a pair, never tuned separately. The implementation AC is the ≤400ms flip + highlight (testable, node/component); the joint-tuning is a TIME-BOXED design-review gate with an explicit freeze criterion ("the pair lands; ship") — NOT an open-ended build clause. *(Pre-mortem A; Amelia review — timebox.)*

### Story 3.4: Round Result, Lives & one-tap Re-deal

As a Host,
I want Lives to tick down clearly and a single tap to start the next Round,
So that the game keeps moving toward a winner with the Loser starting the next hand.

**Acceptance Criteria:**

**Given** the Showdown resolved (Story 3.1)
**When** the Round Result surface renders
**Then** each Loser's Lives pips tick down by exactly one with a brief animation (ties deduct from every tied Loser); the Host sees a Re-deal action, others see "waiting to re-deal." *(FR-11, UX-DR10, UX-DR15.)*

**Given** ≥2 Players remain alive
**When** the Host sends `dealAgain` (carrying the phaseToken)
**Then** the next Round starts with all surviving Players (eliminated Players excluded), returning to the Deal flow — and the Loser of the Round just resolved is the Starting Player (tiebreak per Story 3.1; if that Loser was eliminated, the next surviving seat to their right). *(FR-12, FR-5.)*

**Given** Re-deal
**When** the Host taps it
**Then** it is exactly one action — no re-setup, no re-joining.

**Given** the survivor count after a Showdown (edge E1)
**When** the Round Result resolves
**Then** a Re-deal is offered ONLY when ≥2 Players are alive; the ≥2-alive branch is the SOLE path to a Deal — a Round can never start with <2 Players (the 1-alive and 0-alive cases are terminal win-states handled by the win-check in Story 3.1, never a Re-deal). *(Edge-case sweep E1.)*

### Story 3.5: Eliminated — spectator, not a dead-end (play-confirmed bet)

As a knocked-out Player,
I want to stay part of the table's energy after I lose my last Life,
So that I keep heckling and watching instead of staring at a dead-end screen.

**Acceptance Criteria:**

**Given** a Player reaching 0 Lives at a Showdown
**When** their device routes
**Then** it shows the Eliminated surface with warm copy ("You're out — stick around and heckle"), and they are marked `isAlive=false` (permanent, excluded from subsequent Deals). *(FR-11, UX-DR11, UX-DR16.)*

**Given** an eliminated Player
**When** play continues
**Then** they keep receiving the Waiting and Showdown views as a spectator, get no Swap/Keep/Deal actions, and are skipped in turn order (`nextAliveSeat` skips them). *(UX-DR11.)*

**Given** the spectator hypothesis
**When** validated
**Then** the AC is play-confirmed — a real eliminated player (test a 9-year-old / a non-gamer) is observed to stay engaged rather than disengage — not merely built-to-spec. *(Decision #6.)*

### Story 3.6: Winner — end the game warmly

As the last Player standing (or a shared winner),
I want a warm celebration with an easy "one more,"
So that the night flows into another game without friction.

**Acceptance Criteria:**

**Given** the win-check declares a winner (1 alive) or a shared win (0 alive, all tied to zero)
**When** the Winner surface renders
**Then** it shows an end-of-game celebration with "{name} wins it. One more?" (shared win names all co-winners). *(FR-12, UX-DR12, UX-DR16.)*

**Given** the "one more?" action
**When** the Host taps it
**Then** it sends the `newGame` intent (Host-only, phaseToken-guarded), the phase transitions `gameOver`→`lobby` with the SAME roster, `startingLives` is re-applied to all Players, and join re-opens for late arrivals up to the next first Deal — no re-joining for existing Players. This is distinct from `dealAgain` (the between-rounds re-deal of Story 3.4, which stays within an ongoing game). *(UX-DR12; Winston review — phase-machine `gameOver→lobby` edge.)*

**Given** SM-1 is UNPROMPTED re-deals (not manufactured engagement)
**When** the Winner / Round Result surfaces are built
**Then** "one more" is exactly ONE tap with NO stats screen, NO streak/score-history, NO countdown nag, NO leaderboard — the retention-software vocabulary the PRD forbids. SM-1 is served by removing friction, never by a prompt-engine. *(Mary review — protects SM-1 / SM-C1 / the "not retention software" non-goal; gated by the Eyes-Up standing gate, Epic 0/Story G1.)*

## Epic 4: Conduct the night

The Host keeps a real table moving without restarting — change Lives between Rounds, remove a Player who left the room, and hand off the Host role — through conductor controls that live off the turn critical path and never clutter a Player's two-button turn screen. Serves the Host conductor gate.

**FRs:** FR-14 · **Anchors:** AR-5, AR-6 (consumes phase token); NFR-2, NFR-9, NFR-10; UX-DR13, 14, 16 · **Binding decisions:** #1 (host-controls consume the phase token), #6 (Host Controls = play-confirmed bet).

### Story 4.1: Conductor bar & Host Controls overlay (off the turn path)

As a Host,
I want a dedicated place for conductor actions that never appears on a Player's turn screen,
So that mid-session controls never compete with Swap/Keep.

**Acceptance Criteria:**

**Given** a Host on a non-turn surface (Lobby, Waiting, Round Result)
**When** the surface renders
**Then** a Host-only conductor bar is anchored at the bottom (thumb zone) holding the single phase-appropriate primary (Deal / Showdown / Re-deal) plus a ≥48dp ⚙ controls affordance. *(UX-DR14.)*

**Given** a non-Host, or the Your Turn surface
**When** it renders
**Then** the conductor bar is absent entirely — it is never reachable from Your Turn. *(UX-DR14, NFR-9.)*

**Given** the ⚙ affordance
**When** the Host opens it
**Then** a one-level modal sheet (on `surface-container-high`) opens over the surface beneath, never stacking two deep, and closes back to that surface. *(UX-DR13.)*

**Given** the conductor surface is a natural home for "ambient richness"
**When** it is built
**Then** it contains ONLY the phase action + the three FR-14 controls — NO turn timer, NO activity/event log, NO player-status dashboard, NO ambient/idle content. *(Mary review — the conductor overlay must not become an attention sink; gated by the Eyes-Up standing gate.)*

### Story 4.2: Host mid-session controls — Lives, remove, reassign (play-confirmed bet)

As a Host,
I want to adjust Lives, remove a departed Player, and hand off the Host role,
So that I can keep the night moving without restarting the Table.

**Acceptance Criteria:**

**Given** the controls overlay between Rounds
**When** the Host changes Lives
**Then** a new value (1–5) is set for ongoing play (host-control intent carries the phaseToken; rejected if stale). `[ASSUMPTION: clamp-vs-top-up effect on Players already below the new value settled in build.]` *(FR-14, AR-6.)*

**Given** the roster in the overlay
**When** the Host removes a Player (error-tinted affordance, with confirm)
**Then** the removed Player leaves the roster and is excluded from the next Deal; mid-Round removal resolves at the next Showdown/Re-deal (not by rewriting the current Round) — EXCEPT when the removed Player is the current-turn Player, in which case the server advances `currentTurnId = nextAliveSeat(removed)` and adds them to `acted` so the one-pass can still satisfy the `turns → allActed` condition. *(FR-14, AR-5.)*

**Given** the "Make someone else host" action
**When** the Host reassigns to another Player
**Then** the new Host gains the conductor controls, the former Host becomes a regular Player, and exactly one Host exists at any time; an eliminated Host keeps conducting until they reassign or disconnect. *(FR-14, AR-5.)*

**Given** all three controls
**When** present
**Then** they are available ONLY to the Host and NEVER appear on any Player's Your Turn surface. *(FR-14, NFR-9.)*

**Given** the conductor experience
**When** validated
**Then** the AC is play-confirmed — a Host is observed conducting a real game (change Lives, remove a departed cousin, optionally hand off) without fumbling — not merely built-to-spec. *(Decision #6.)*

**Given** a disconnected-but-alive Player whose Turn it is (`currentTurnId` with `isConnected=false`) (AR-15)
**When** the Turn would stall on them
**Then** there is NO auto-timeout/auto-skip in MVP — the Host conducts the table around them socially; the disconnected Player is shown dimmed on the roster (per UX-DR state pattern) and the table proceeds. `[ASSUMPTION: MVP relies on the Host to advance past a disconnected active Player; an automatic skip rule is deferred.]` *(AR-15 — recall gap; documented assumption now owned by a story.)*

## Epic 5: Scale to the whole table

The app silently scales the Deck to the headcount — one deck for ≤10 Players, two merged decks for 11–20 — so the Host never thinks about it, and the Loser computation stays correct and unambiguous at a full 20-Player table where duplicate values (and more frequent ties) are expected and accepted.

**FRs:** FR-13 (hardens FR-10/FR-11 at scale) · **Anchors:** AR-9; NFR-10 · **Binding decisions:** #7 + #8 (resolution already tested 2..20 in Epic 3; deck composition already parameterized in Epic 2 — so this epic is thin).

### Story 5.1: Auto Deck scaling to two merged decks at 11–20

As a Host of a big table,
I want the app to use enough cards for everyone without me thinking about it,
So that an 11–20 Player Table plays correctly with the expected variance.

**Acceptance Criteria:**

**Given** the deck composition supplied to `buildDeck` (parameterized in Epic 2, Story 2.1)
**When** the Table has 10 Players or fewer
**Then** one standard 52-card deck is used; when 11 or more, two standard decks are merged into one shuffled draw pile (104 cards). *(FR-13, AR-9.)*

**Given** deck selection
**When** a Round is dealt
**Then** the choice is automatic from headcount and NOT surfaced as a Host setting; with two decks the same value can appear more than once (duplicate values are normal). *(FR-13.)*

**Given** the existing parameterized resolution engine (Epic 3, Story 3.1, tested 2..20)
**When** a 20-Player two-deck Showdown resolves
**Then** the lowest-value Loser computation — including the now-more-frequent multi-Loser and all-tied cases — is correct and unambiguous; this is verified by ONE boundary integration test at 20 Players (the pure resolution logic is NOT re-tested here — it was parameterized 2..20 in Story 3.1). *(Decision #7, FR-10/FR-11 at scale.)*

**Given** the loser highlight at a full table
**When** 20 cards are revealed
**Then** the Loser(s) remain unmistakable (stroke + scale + position; the app finds them, not human eyeballing). *(FR-10, NFR-10, UX-DR9.)*

## Epic 6: See your card while you wait (v2)

A waiting Player can press-and-hold to peek their own secret Card on the Waiting surface — not just on their own Turn — so they can study their hand as the swap chain crawls toward them. Delivers the off-Turn-peek tension (UJ-5, SM-4), entirely client-side, with the secret-Card privacy rule held the whole way.

**FRs:** FR-20 · **Anchors:** NFR-1 (privacy/SM-6), NFR-9 (eyes-up), NFR-10 (a11y); UX-DR6 (Waiting surface), UX-DR7 (peek behavior reused), UX-DR20 (new) · **v2 guardrails:** §11.3 zero-contract-change (no `types.ts`/server/persistence/projection change), G1 Eyes-Up, G2 $0. · **Build note:** the quick win — build FIRST. Extends Story 2.5's peek onto Story 2.4's Waiting surface; reads the already-delivered `you.hand`.

### Story 6.1: Peek your own Card while waiting

As a Player whose Turn it isn't (waiting to act, or already acted),
I want to press and hold to peek my own Card on the Waiting surface,
So that I can track what I'm holding as the swap chain crawls toward me — without ever exposing it to anyone else.

**Acceptance Criteria:**

**Given** the Waiting surface (any Player whose Turn it currently is NOT — both not-yet-acted and already-acted)
**When** the Player presses and holds the peek control
**Then** their own Card shows as a big rank + single suit pip (Display-XL), and on release it re-hides immediately — identical behavior to the on-Turn peek (Story 2.5 / UX-DR7); it is never shown persistently. *(FR-20, UX-DR20.)*

**Given** a peeked Card on the Waiting surface and a distraction
**When** the control loses focus or the app is backgrounded
**Then** the Card auto-hides (a phone set down while waiting never exposes a hand). *(FR-20; verified via manual/Playwright — blur/visibilitychange/pagehide are not deterministic in jsdom, per the Story 2.5 precedent.)*

**Given** the Player's current Card (after a Swap moved a new Card into their hand)
**When** they peek on the Waiting surface
**Then** the peek shows their CURRENT card (the newly-received one), not a stale snapshot — because the projection already delivers the owner their up-to-date `you.hand` on every state push. *(FR-20.)*

**Given** the hidden (default) state on the Waiting surface
**When** the surface renders
**Then** the Card is NOT shown (the Waiting surface stays the calmest surface — only the active Player's name + your own Lives + the peek affordance; no always-on card, no motion, nothing to scroll), and the rank is NOT present in the accessibility tree while hidden. *(FR-20, NFR-9, UX-DR6, UX-DR20.)*

**Given** the SR peek path on the Waiting surface
**When** the "Peek your card" element is activated
**Then** it announces the rank ONCE to the owner's device only and discards it (never a persistent readable node, never sent to any other device) — mirroring the Story 2.5 SR path. *(NFR-10, UX-DR20.)*

**Given** the standing SM-6 privacy gate and the §11.3 zero-contract-change guardrail (Epic 0 / Story 1.4)
**When** Story 6.1 is built
**Then** NO server, `@trash/shared` (`types.ts`), persistence, or `projectStateFor` change is made — the owner's own `you.hand` is ALREADY delivered on every push; this story only RENDERS already-delivered data on a second client surface; the standing privacy test still passes unchanged (no new `ProjectedTableState` field is added). *(NFR-1, §11.3, Pre-mortem E.)*

**Given** the active Player (whose Turn it currently IS)
**When** surfaces render
**Then** the off-Turn peek (this story / Waiting surface) and the on-Turn peek (Story 2.5 / Your Turn surface) are mutually exclusive by surface — never doubled; the active Player keeps peeking via the existing Your Turn affordance, the waiting Players via this one. *(FR-20, UX-DR20.)*

**Given** the "swap-chain tell" (peeking right after a received Swap reveals the receiver's new card, hence the neighbor's old card — an emergent, deliberate v2 information shift)
**When** Epic 6 is validated
**Then** it is a play-confirmed observation (SM-C4), NOT a build clause — observed in a real session whether the extra information flow adds tension (good) or sours play into cheating-accusations (bad); fallback if it sours = revisit via correct-course. This story ships the mechanic; the tell is watched, not gated. *(SM-C4; PRD §8 open item; addendum D.)*

## Epic 7: Play in your language (v2)

Each Player picks their own UI language on their device — English or Spanish — and the whole app speaks it to them: buttons, prompts, the warm loser/winner lines, and the Spanish card faces (As, Jota, Reina, Rey). A mixed table just works — abuela plays in Español while her grandson plays in English on his own phone. Delivers the bilingual welcome (UJ-4, SM-3), client-local per-device, with zero server or contract change.

**FRs:** FR-15, FR-16, FR-17, FR-19 (FR-18 satisfied-by-design) · **Anchors:** NFR-9 (eyes-up), NFR-10 (a11y — color-independence on the toggle, SR speech in-language); UX-DR8 (card display), UX-DR16 (voice), UX-DR19 (new), UX-DR3 (Home surface) · **v2 guardrails:** §11.3 zero-contract-change, G1 Eyes-Up, G2 $0. · **Build note:** pure client refactor of `copy.ts` + `card-display.ts` + a toggle. Story order matters: 7.1 (dictionary refactor) is the backbone every later story rides on.

### Story 7.1: Keyed copy dictionary & language store (the backbone)

As the builder,
I want all client copy keyed and read through a language-aware accessor backed by a per-device preference,
So that the whole app can render in a chosen language and adding Spanish (and later, any language) is just more dictionary entries.

**Acceptance Criteria:**

**Given** `client/src/lib/copy.ts` (today: 33 flat exports — 14 consts + 19 parameterized fns)
**When** it is refactored
**Then** copy becomes a keyed dictionary with one table per language (English + Spanish) read through a single accessor (e.g. `t(key, params)`); every surface reads through it; no user-facing string remains a bare hardcoded literal in a component. *(FR-16.)*

**Given** the parameterized strings (e.g. `loser(name)`, `winner(name)`, `roomCode(code)`, `waitingForHost(host)`)
**When** they localize
**Then** they keep their parameters intact and read grammatically natural in each language; the Room Code VALUE is never translated (only its surrounding label). *(FR-16.)*

**Given** a per-device language preference
**When** the language store is built
**Then** the chosen language is read from / written to the device's `localStorage`, the store is reactive (a change re-renders surfaces immediately), the first-run default is English (no device-locale auto-detect in v2), and the preference is per-device only — it sends nothing to the server and changes nothing on any other device. *(FR-15.)*

**Given** the §11.3 zero-contract-change guardrail and G2 $0 gate
**When** Story 7.1 is built
**Then** NO server, `@trash/shared` (`types.ts`), persistence, or `projectStateFor` change is made, and no new dependency or paid service is added (a tiny hand-rolled dictionary/accessor, no heavyweight i18n runtime unless it is zero-cost and offline) — client-only. *(§11.3, G2.)*

**Given** an English-only baseline before Spanish copy exists
**When** the refactor lands
**Then** the app renders identically to today in English (a pure refactor with no visible change for English users) — verified by existing surface tests still passing; this de-risks 7.1 as a behavior-preserving change before any translation work. *(FR-16; regression-safety.)*

### Story 7.2: Language toggle on the Home / Join surface

As a Player (including a Spanish-speaking relative handed a phone),
I want to choose my language on the first screen before I join,
So that the app speaks my language from the moment I enter the room code — off the clock, before any turn pressure.

**Acceptance Criteria:**

**Given** the Home / Join surface (built on the Story 7.1 store)
**When** it renders
**Then** a language toggle is present and reachable BEFORE entering the Room Code; it shows the current language and switches between English and Spanish; selecting a language updates the `localStorage` preference and re-renders the surface (and the whole app) immediately. *(FR-15, UX-DR19.)*

**Given** the accessibility floor (NFR-10)
**When** the toggle renders
**Then** each state is legible without relying on color alone (e.g. flag + text label), the control is a ≥48dp tap target, and it is labeled with role + current state for screen readers. *(FR-15, NFR-10, UX-DR19.)*

**Given** the Eyes-Up gate (G1) and the device-local model
**When** the toggle is placed
**Then** it is a one-time quiet choice on Home/Join (not a persistent settings sink, not an attention surface), and it is NOT presented as a Host/Table control anywhere (language is per-device, never room-level — it never appears in the Host Controls overlay). *(G1, NFR-9, UX-DR19.)*

**Given** a returning device
**When** the app re-opens or the Player re-joins
**Then** the last-chosen language is restored from `localStorage` (the choice persists across reload/re-join). *(FR-15.)*

### Story 7.3: Spanish card ranks (faces + screen-reader speech)

As a Spanish-speaking Player,
I want the cards to read in Spanish,
So that the faces I see (and hear) are As, Jota, Reina, Rey — the game speaks my language down to the cards.

**Acceptance Criteria:**

**Given** `client/src/lib/card-display.ts` (`rankToLetter`, `rankSpeech`) — the SOLE home of the rank→letter map (UX-DR8)
**When** the chosen language is Spanish
**Then** rank glyphs render as **A = As, J = Jota, Q = "Q" (Reina), K = "R" (Rey)** — only the King glyph changes from the English face; the Queen glyph stays "Q" to avoid the Reina/Rey "R" collision; number cards render their numerals unchanged. *(FR-19, UX-DR8.)*

**Given** the screen-reader speech path
**When** a Card is announced in Spanish
**Then** spoken rank names are **As / Jota / Reina / Rey** (and the number cards in Spanish); the Queen's GLYPH "Q" paired with SPOKEN "Reina" is an INTENTIONAL mismatch (glyph dodges the R-collision; speech is fully Spanish) and is documented as such so it is not "corrected" downstream. *(FR-19, NFR-10.)*

**Given** suit handling and rank comparison
**When** Spanish ranks render
**Then** suit stays decorative and ignored by the game exactly as in the MVP (distinguished by shape not color), and rank COMPARISON remains integer-based and untouched — this story changes display/speech only, never game logic. *(FR-19, UX-DR8.)*

**Given** the English language selection
**When** cards render
**Then** the English faces are unchanged (A / J / Q / K, spoken Ace/Jack/Queen/King) — Spanish is purely additive. *(FR-19; regression-safety.)*

### Story 7.4: Warm Spanish voice (authored, not translated)

As a Spanish-speaking Player,
I want the emotional moments to feel as warm and playful in Spanish as in English,
So that losing a life still feels like gentle ribbing, never a cold "you lost."

**Acceptance Criteria:**

**Given** the warm copy keys (loser, winner, waiting, elimination, "one more?")
**When** the Spanish entries are authored
**Then** they are written to match the MVP's playful, non-punishing, inclusive voice (EXPERIENCE.md voice table) — NOT machine-translated; the loser line lands as gentle tease (never a Spanish "YOU LOST"), and the all-tied line carries the same warmth as the English. *(FR-17, UX-DR16.)*

**Given** co-winners and parameterized warmth
**When** the Spanish winner/co-winner copy renders
**Then** co-winner joining reads grammatically natural in Spanish ("Ana y Ben"; the 3+ list form), and parameterized names slot in naturally. *(FR-17, UX-DR16.)*

**Given** the FR-17 Definition of Done (subjective "tone-matched" needs a human gate)
**When** the Spanish warm copy is reviewed for done
**Then** a fluent-Spanish speaker reviews it for warmth/voice and SIGNS OFF (approver: Dennis or a designated fluent reviewer); the story is not complete until this sign-off is recorded. This is the FR-17 acceptance gate, mirroring the MVP's per-surface voice-conformance ACs (decision #5). *(FR-17.)*

**Given** the mixed-language table (the motivating scenario, UJ-4 / SM-3)
**When** Epic 7 is validated end-to-end
**Then** it is play-confirmed (SM-3): a Spanish-speaking relative at a mixed table plays a full session in Spanish needing no UI help, while another player at the same table plays in English on their own device, and neither sees a state discrepancy (SM-C3 "no accidental Babel" — only language differs, never game state). *(SM-3, SM-C3, UJ-4.)*
