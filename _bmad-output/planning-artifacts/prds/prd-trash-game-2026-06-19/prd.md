---
title: Trash
status: final
created: 2026-06-19
updated: 2026-06-19
---

# PRD: Trash
*Working title — confirm.*

## 0. Document Purpose

This PRD is for the builder (Dennis) and any downstream UX, architecture, and implementation work. It builds on the product brief at `_bmad-output/planning-artifacts/briefs/brief-trash-game-2026-06-19/brief.md` and does not duplicate its positioning rationale. Vocabulary is anchored in the Glossary (§3); features are grouped with Functional Requirements (FRs) nested and numbered globally; assumptions are tagged inline as `[ASSUMPTION]` and indexed in §9. Technical "how" (stack, protocol, state machine) lives in the companion `addendum.md`, not here.

## 1. Vision

**Trash** turns "we're all here" into "we're all playing and laughing together," using nothing but the phones already in the room. It's a real-time party card game for a group physically together — family after a holiday meal, friends after dinner. Each player is dealt one **secret card**. On your turn you either **Swap** it onto the player to your right or **Keep** it. The low card nobody wants — the trash — gets shoved around the circle until the **Showdown**, when every card flips at once and the lowest card loses a life.

The phone is the dealer and the scorekeeper; the humans provide the drama. You glance down for about ten seconds a round and spend the rest of the time looking up at the people around you. The game lives in two beats that carry equal weight: the **squirm** of forcing your trash onto your neighbor, and the **simultaneous reveal** — the table-wide "OHHH" when the cards flip. When someone loses, the moment lands at the table, not on a leaderboard.

A note on the problem this solves: "nobody has a deck of cards" is the *enabling insight*, not the driver — it's what lets Trash exist as a phone game, not a validated market pain. The real driver is delight: the shared laugh, the "one more round" grip, and "I made this for us." Availability is the means; delight is the end.

Trash is built first and foremost for the maker's own gatherings. It is a 200-year-old public-domain folk game (Screw Your Neighbor / Chase the Ace) with no technical moat — its advantage is positioning and execution: free, no download, everyone on their own phone, in person, this game. It succeeds by getting *deeper* (more reasons for the same table to play one more round), not bigger.

## 2. Target User

### 2.1 Jobs To Be Done

- **(Builder, emotional)** "I made this for us" — give the people I gather with a reliable way to turn the after-dinner lull into a shared laugh.
- **(Host, functional)** Get everyone in and playing in seconds, with no downloads, accounts, or rules-explaining that kills the momentum.
- **(Host, social)** Conduct the table's energy — drive the pace, call the beats — without fighting the app.
- **(Any player, emotional)** Feel the squirm of shoving trash onto a neighbor and the jolt of the simultaneous reveal.
- **(Reluctant player, functional)** Understand exactly what to do on my turn without anyone leaning over to help.
- **(Table, social)** Keep the night going — "one more round" — without anyone being talked into it.

### 2.2 Non-Users (v1)

- **Remote / online-only groups.** Trash assumes everyone is at the same physical table; it does not replace the in-person reveal beat with chat, video, or remote sync features.
- **Solo / async players.** There is no single-player, no bots, no "play against the app."
- **Retention-driven players.** No accounts, streaks, daily challenges, or cross-night progression in v1 (see §5).

### 2.3 Key User Journeys

Two load-bearing roles gate the whole experience: the **Host** (the activation gate — if they can't get everyone playing in seconds, the game never happens) and the **Reluctant Player** (the weakest-link gate — if they get confused, the round stalls and the energy dies). The journeys below center those two; everyone else is served for free once these work.

- **UJ-1. Marisol starts the table in the time it takes to clear plates.**
  - **Persona + context:** Marisol is the ringleader at every family gathering — the one who says "okay, let's play something." Her cousins are still at the table, half of them not phone-game people.
  - **Entry state:** Unauthenticated, no app installed. She opens a URL in her phone browser.
  - **Path:** Taps **Create Table** → sees a short **Room Code** → calls it out to the table → as each person opens the same URL and enters the code, their name pops into her **lobby** roster → she sets lives (picks 3) → taps **Deal**.
  - **Climax:** Every phone in the room shows a card (or "waiting") at the same moment; the room goes quiet for ten seconds. Setup-to-dealt was well under ~30 seconds.
  - **Resolution:** Marisol is now the conductor — she advances the table through each phase. Realizes the activation gate.
  - **Edge case:** Someone fat-fingers the code and lands in no table; they just re-enter it. A late arrival can join the lobby before the next deal.

- **UJ-2. Tío Beto, who "doesn't do phone games," takes his turn without help.**
  - **Persona + context:** Beto is the reluctant player — happy to be handed something foolproof, lost the instant a screen has more than it needs.
  - **Entry state:** In a dealt round; it becomes his turn.
  - **Path:** His phone — which until now showed only *whose turn it is* — switches to exactly two big buttons: **Swap** and **Keep**, with a way to peek and hide his own card. He peeks, grimaces, taps **Swap**.
  - **Climax:** His card is gone, shoved onto the player to his right; his phone returns to the calm "whose turn" view. Nobody leaned over to help him.
  - **Resolution:** Play continues to his right. Realizes the weakest-link gate.
  - **Edge case:** The player to his right loudly declares "I've got a King — you can't dump on me!" That's a social convention the table honors; the app stays out of it (FR-8). Beto shrugs and taps **Keep** instead. No secret card is ever revealed by the app.

- **UJ-3. The whole table at the Showdown.**
  - **Persona + context:** Any round, any group size from 2 up to ~20.
  - **Entry state:** The Last Player has acted; the round is ready to resolve.
  - **Path:** Marisol taps to trigger the **Showdown** → every card flips at once across all phones → the app computes the lowest and **highlights the loser(s)** → the losing player's life count drops.
  - **Climax:** The simultaneous reveal lands — the table reacts. The loser is unmistakable even at a 20-card table because the app, not human eyeballing, found them.
  - **Resolution:** Anyone eliminated (zero lives) is marked out; if one player remains they win; otherwise Marisol taps once to **Re-deal** and the next round is already going.
  - **Edge case:** A tie for lowest — multiple players lose a life together, all highlighted.

## 3. Glossary

*Downstream workflows and readers must use these terms exactly. FRs, UJs, and SMs use these terms verbatim; no synonyms anywhere else in the PRD.*

- **Table** — A single game session, identified by a Room Code, hosted in one server-authoritative room. Has one Host and 2-20 Players.
- **Room Code** — The short code Players enter to join a Table. The only join credential; no accounts.
- **Host** — The Player who created the Table and manually conducts phase transitions (deal, trigger showdown, re-deal). A Host is also a Player.
- **Player** — A participant at a Table, identified by a stable `playerId` + session token (not socket identity). Holds at most one Card at a time during a round.
- **Reluctant Player** — Design archetype (not a system role): a Player who must be able to act with zero confusion. Drives the two-button constraint.
- **Card** — One playing card. Only its **value** matters — Ace (lowest) through King (highest); suit is ignored everywhere in the game, including Showdown comparison. A Player's Card is **secret** — visible only to its owner until Showdown.
- **Deck** — The single shuffled draw pile Cards are dealt from. Built from one standard 52-card deck up to ~10 Players; two standard decks merged into one pile above (see FR-13). With two decks, duplicate values are normal.
- **Lives** — The count of strikes a Player has remaining (Host sets 1-5 at setup). Reaching zero eliminates the Player.
- **Deal** — Host action that gives each active Player one secret Card and begins a Round.
- **Round** — One full cycle: Deal → one pass of turns around the Table → Showdown → life deduction → elimination check.
- **Turn** — A single Player's choice on a Round: Swap or Keep.
- **Starting Player** — The Player who takes the first Turn in a Round: the Host on the first Round of a game, then the previous Round's Loser (FR-5, FR-12).
- **Swap** — Turn action: **exchange** your Card with the Player to your right — you give them your Card and receive theirs. Each Player still holds exactly one Card afterward. (Both Players still get their own later Turns.)
- **Keep** — Turn action: hold your Card; the Turn passes to your right.
- **Last Player** — The Player whose right-hand neighbor is the Starting Player — i.e., the final Player reached in the single one-pass turn order. May Swap with the Player to their right **or** draw a random Card from the Deck (FR-7).
- **Showdown** — Host-triggered simultaneous reveal of all Cards; the app computes the lowest value and deducts a Life from the loser(s).
- **Loser** — The Player(s) holding the lowest Card at Showdown (Ace lowest). Ties produce multiple Losers.
- **Re-deal** — One-tap Host action that starts the next Round with surviving Players.

## 4. Features

### 4.1 Table Setup & Join

**Description:** A Host creates a Table and gets a Room Code; Players join by entering it in a browser — no download, no account. Players appear in a lobby roster as they join. The Host sets starting Lives and triggers the first Deal. Realizes UJ-1. Optimized for the activation gate: from "let's play" to dealt in well under ~30 seconds.

**Functional Requirements:**

#### FR-1: Create a Table

A Host can create a Table from a web browser and receive a Room Code to share. Realizes UJ-1.

**Consequences (testable):**
- A new Table is created server-side with a unique Room Code; the creator becomes the Host and the first Player.
- No account, email, or install is required to create a Table.
- The Room Code is **4 uppercase letters** drawn from an ambiguity-safe set (excluding easily-confused glyphs such as O/0 and I/1/L) so it's easy to say aloud and type.

#### FR-2: Join a Table by Room Code

A Player can join an existing Table by entering its Room Code and a display name. Realizes UJ-1.

**Consequences (testable):**
- Entering a valid Room Code adds the Player to that Table's lobby and shows their name on every connected device's roster.
- An invalid or expired Room Code is rejected with a plain message; the Player can retry.
- Each Player is assigned a stable `playerId` + session token at join, independent of socket identity.

#### FR-3: Lobby roster

All connected devices see the current roster of joined Players before the Deal. Realizes UJ-1.

**Consequences (testable):**
- Joining or leaving the lobby updates the roster on all devices.
- A late-arriving Player can join the lobby up until the first Deal of a game.
- Players join only at the lobby — there is no joining a game already in progress. A Player who leaves mid-game simply stops taking Turns; the Table continues or restarts socially (no reconnection in MVP, §6.2).

#### FR-4: Host sets starting Lives

The Host can set the starting Lives (1-5) for the Table before the first Deal.

**Consequences (testable):**
- The Host selects a value from 1 to 5; the chosen value applies to all Players.
- `[ASSUMPTION: default is 3 if the Host doesn't change it.]`
- The Host may also change Lives between Rounds — see FR-14.

### 4.2 The Round Loop

**Description:** The core game. The Host triggers the Deal; each Player gets one secret Card. Play proceeds Turn by Turn around the Table — the Starting Player goes first (the Host on the first Round, then the previous Round's Loser), and play passes to each Player's right. On your Turn you Swap or Keep; the Last Player may instead draw from the Deck. Realizes UJ-2. The active Player's screen shows only Swap/Keep plus peek/hide; inactive Players see only whose Turn it is.

**Functional Requirements:**

#### FR-5: Deal secret Cards

The Host can Deal one secret Card to each active Player to begin a Round.

**Consequences (testable):**
- Each Player receives exactly one Card, dealt from a freshly shuffled Deck.
- Each Deal reconstitutes the full Deck(s) and re-shuffles — any Cards removed in a prior Round (e.g., a Last Player deck-draw discard) return to the Deck.
- A Player's Card value is delivered only to that Player's device; it is never sent to any other device (see Constraints §11). All devices transition to the dealt state together, so the reveal-down beat happens simultaneously.
- The Deck is shuffled with Fisher-Yates seeded by a CSPRNG. *(Mechanism detail → addendum.)*
- The Starting Player takes the first Turn; turn order then proceeds to each Player's right. The Host is the Starting Player for the very first Round; for every Round after that, the previous Round's Loser is the Starting Player (FR-12). On a multi-Loser tie, the tied Loser seated earliest from the prior Starting Player starts `[ASSUMPTION; tunable]`.

#### FR-6: Take a Turn — Swap or Keep

On their Turn, the active Player can Swap (exchange Cards with the Player to their right) or Keep. Realizes UJ-2.

**Consequences (testable):**
- The active Player's device shows exactly two primary actions — **Swap** and **Keep** — plus a control to peek and hide their own Card.
- **Swap:** the active Player and the Player to their right **exchange** Cards — each then holds the other's former Card. Every Player still holds exactly one Card. The Turn then passes to the right. (Both Players still get their own Turns when those come.)
- **Keep:** the active Player retains their Card; the Turn passes to the right.
- The active Player's own Card is **hidden by default**; peeking requires an explicit hold/tap and the Card re-hides automatically when released — it is never shown persistently.
- Inactive Players' devices show only whose Turn it currently is (a name) — never any Card value.
- Turn order is exactly **one pass**: it begins at the Starting Player and ends at the Last Player (whose right-hand neighbor is the Starting Player). Play does **not** wrap back around for a second pass.
- No timer and no auto-advance: the Turn waits for the active Player's choice.

#### FR-7: Last Player option (deck draw)

The Last Player can Swap with the Player to their right **or** draw a random Card from the Deck. Here "Swap" means the same exchange operation as FR-6.

**Consequences (testable):**
- The Last Player's device offers the deck-draw option in addition to Swap/Keep.
- Drawing from the Deck replaces the Last Player's Card with a random Card from the remaining Deck; the Last Player's discarded Card is removed from the Deck for the rest of the Round (it returns at the next Deal, per FR-5).
- **Heads-up (2 Players):** Player 1 (the Starting Player) chooses Swap (exchange with Player 2) or Keep; Player 2 is the Last Player and may Swap (exchange) with Player 1 **or** draw a random Card from the Deck. The deck draw is pure luck. Realizes the 2-player path.

#### FR-8: King is social-only

The King has no special app behavior; it is simply the highest Card. Any "King blocks the swap" convention is honored by people at the Table, not enforced by the app. Realizes UJ-2 edge case.

**Consequences (testable):**
- A Swap is never refused on the basis of the target's Card value; the app does not read another Player's Card to decide whether a Swap is allowed.
- The King participates in Showdown like any other Card (highest value; never the Loser unless all Cards are Kings).

**Notes:** This preserves the one hard integrity rule (§11.1) without exception. App-enforced King-blocking was considered and rejected: because "holds a King" would be the only reason a Swap is refused, any refusal would deterministically reveal that the neighbor holds a King — a secret-Card leak before Showdown, to the swapper and to anyone watching the turn indicator. Keeping the King social is the only way the app never has to leak. *(Rationale logged in `.decision-log.md`.)*

### 4.3 Showdown, Lives & Re-deal

**Description:** The Host triggers the Showdown; all Cards flip simultaneously across every device. The app computes the lowest Card, highlights the Loser(s), and deducts a Life. Players at zero Lives are eliminated; last Player standing wins; otherwise one tap re-deals. Realizes UJ-3. This is the reveal beat — the second of the two co-equal core beats — so its UX matters even in MVP.

**Functional Requirements:**

#### FR-9: Trigger Showdown

The Host can trigger the Showdown once the Last Player has acted. Realizes UJ-3.

**Consequences (testable):**
- All Players' Cards are revealed on all devices at the same moment (simultaneous reveal).
- The reveal is the first time a non-owner device receives any other Player's Card value.

#### FR-10: Compute and highlight Loser(s)

At Showdown the app computes the lowest Card and highlights the Loser(s). Realizes UJ-3.

**Consequences (testable):**
- Comparison is by **value only** — Ace (lowest) through King (highest). Suit is never considered; two Cards of the same value are an exact tie regardless of suit.
- The Player(s) holding the lowest value are highlighted as Loser(s); a tie for lowest highlights all tied Players.
- **All-tied case:** if every remaining Player holds the same value, all of them are Losers and all lose a Life this Showdown. This is in scope and expected to occur more often at large two-Deck Tables.
- The computation is correct and unambiguous at Table sizes up to 20 (the app finds the Loser(s); Players do not eyeball it).

#### FR-11: Deduct Lives & eliminate

Each Loser loses one Life automatically; a Player at zero Lives is eliminated. Realizes UJ-3.

**Consequences (testable):**
- Each highlighted Loser's Lives decrease by exactly one.
- Ties deduct a Life from every tied Loser in the same Showdown.
- A Player reaching zero Lives is marked eliminated and is excluded from subsequent Deals.

#### FR-12: Win check & Re-deal

When one Player remains, they win; otherwise the Host can Re-deal to start the next Round. Realizes UJ-3.

**Consequences (testable):**
- If exactly one non-eliminated Player remains after a Showdown, that Player is declared the winner and the game ends.
- **Zero-survivors case:** if the last remaining Players all reach zero Lives in the same Showdown (a tie that eliminates everyone at once), they **share the win** `[ASSUMPTION: shared win; alternative would be a sudden-death re-deal among them]`.
- Otherwise, a single Host tap (Re-deal) starts the next Round with all surviving Players, returning to FR-5.
- The Loser of the Round just resolved becomes the Starting Player for the next Round (multi-Loser tiebreak per FR-5). If that Loser was eliminated, the next surviving Player to their right starts `[ASSUMPTION; tunable]`.
- Re-deal is one action — no re-setup, no re-joining.

### 4.4 Deck Scaling

**Description:** Large tables (real play reaches ~20) make a single 52-card Deck too thin. The app silently scales the Deck to the headcount so the Host never thinks about it.

**Functional Requirements:**

#### FR-13: Auto Deck scaling

The app uses enough Cards for the Table size without Host input.

**Consequences (testable):**
- Tables of **10 Players or fewer** use one standard 52-card deck; Tables of **11 or more** use two standard decks **merged into one shuffled draw pile**.
- Deck selection is automatic and not surfaced as a Host setting.
- With two decks, the same Card value can appear more than once; ties (multiple Losers, including the all-tied case in FR-10) are resolved per FR-10/FR-11 and are expected to be more common — this is acceptable.

**Notes:** `[NOTE FOR PM]` Two identical Decks means duplicate values are normal at large tables, so ties at Showdown will happen more often. The design already supports ties (multiple Losers), so this is consistent — flagging it so the showdown UX and any future stats account for it.

### 4.5 Host Controls (mid-session)

**Description:** Real tables shift — the game drags, someone leaves the room, a phantom device lingers, or the ringleader needs to hand off. The Host has a small set of mid-session controls to keep the night moving without restarting. These are conductor tools, kept off the critical path (a Player taking a Turn never sees them) so they don't clutter the two-button experience. Serves the Host (activation/conductor) gate.

**Functional Requirements:**

#### FR-14: Host mid-session controls

The Host can adjust Lives, remove a Player, and reassign the Host role between Rounds.

**Consequences (testable):**
- **Change Lives:** Between Rounds (not mid-Round), the Host can set a new Lives value (1-5). `[ASSUMPTION: it applies as a new ceiling/grant for ongoing play; exact effect on Players already below the new value — clamp vs. top-up — to be settled in UX/build.]`
- **Remove a Player:** The Host can remove a Player from the Table; the removed Player leaves the roster and is excluded from the next Deal. Removing a Player mid-Round is resolved at the next Showdown/Re-deal, not by rewriting the current Round `[ASSUMPTION; tunable]`.
- **Reassign Host:** The Host can pass the Host role to another Player; the new Host gains the conductor controls and the former Host becomes a regular Player. Exactly one Host exists at any time.
- These controls are available only to the Host and never appear on a Player's Turn surface (they must not compete with Swap/Keep).

**Notes:** `[NOTE FOR PM]` This was pulled into MVP at the user's request (it was previously deferred). Two assumption tags above (Lives-change effect, mid-Round removal timing) are deliberately left for UX/build to settle — flag if either needs a product decision sooner.

## 5. Non-Goals (Explicit)

- **Not a remote/online game.** No matchmaking, no playing with people who aren't in the room, no video/voice.
- **Not retention software.** No accounts, logins, profiles, streaks, daily challenges, push notifications, or cross-night progression in v1.
- **Not a rules engine for variants.** Classic mode only in MVP; Powers mode (Jack/Queen/King abilities) is v2.
- **Not an attention sink.** The app deliberately does *less* on screen. No feeds, chat, ads, or anything that pulls eyes down between Turns.
- **Not self-healing against disconnects in MVP.** If someone drops, the group restarts socially (see §6.2); state is keyed to stable player identity so reconnection is cheap to add later.

## 6. MVP Scope

### 6.1 In Scope

- Create/join a Table by Room Code; web app, no download, no accounts (FR-1-FR-3).
- Host sets Lives 1-5 (FR-4).
- Full Round loop: Deal secret Cards → Swap/Keep around the Table → Last Player deck-draw option → Showdown → compute & highlight Loser(s) → deduct Lives → eliminate → win check → one-tap Re-deal (FR-5-FR-12).
- 2-20 Players, including the heads-up path (FR-7).
- King handled socially (no app logic), so the integrity rule never needs an exception (FR-8).
- Auto Deck scaling (FR-13).
- Host mid-session controls: change Lives, remove a Player, reassign Host (FR-14).
- Server-authoritative state with private secret Cards (the one hard integrity rule, §11).
- A clean simultaneous-reveal Showdown moment with clear Loser highlight (the reveal beat) — minimal but real, not sterile.
- Zero ongoing cost to run.

### 6.2 Out of Scope for MVP

- **Produced comedy FX** (animation + sound on the Loser's phone) — deferred to **v1.1 (fast-follow)**. `[NOTE FOR PM]` This is the emotional heartbeat of the product. It is out of MVP only to de-risk the plumbing first; the MVP's minimal reveal beat exists specifically so the first playtest still tests the real loop. Revisit immediately after MVP proves the loop.
- **Powers mode** (Jack = Spy, Queen = Thief, King = Blocker as a triggered power) — **v2**, the headline next step.
- **Reconnection / disconnect handling** — the group restarts socially in MVP; stable player identity is in place from day one to make this cheap later. No joining a game already in progress (FR-3).
- **Cross-night stats / bragging rights, themes, characters, round modifiers, cosmetics, monetization** — later, if ever; consistent with "deeper, not bigger."

## 7. Success Metrics

The north star is unapologetically subjective: **the people at the table are genuinely delighted.** Because this is an occasion game made for the maker's own gatherings, success is observed in the room, not on a dashboard. The three primary metrics are the observable signals the maker committed to; they are validated by direct observation at a real gathering, not telemetry.

**Primary**
- **SM-1 — "One more round."** A sitting runs through multiple unprompted Re-deals; nobody has to be talked into continuing. Validates FR-12 (and the loop FR-5-FR-11 behind it). *Target: at least one real session reaches several consecutive Re-deals with no "should we stop?" friction.*
- **SM-2 — Eyes up.** During play, Players look at each other and laugh rather than drifting into other apps. Validates the two-button/minimal-surface design in FR-6 (and the §10 tone). *Target: observed — no habitual side-scrolling during Turns.*
- **SM-3 — The reveal lands.** The simultaneous Showdown reliably produces a table-wide reaction. Validates FR-9-FR-10. *Target: observed table reaction at Showdown across most Rounds.* `[NOTE FOR PM]` In MVP this signal is carried by the bare simultaneous-flip beat; the brief's fuller "the laugh fires" depends on the produced comedy FX, which is deferred to v1.1 (§6.2). Re-evaluate SM-3 once FX lands — the full version of this signal is partially deferred with it.

**Engineering / integrity bars (enable the signals)**
- **SM-4 — Fast start.** "Let's play" to everyone dealt in well under ~30 seconds. Validates FR-1-FR-5.
- **SM-5 — No confusion-stop.** A full game night runs without a Round stalling on a confused Player. Validates FR-6 (and §10).
- **SM-6 — Integrity holds.** No Player can see *or infer* another's secret Card before Showdown — not in the UI, not in network traffic, not from app behavior. Validates §11, FR-5, FR-8, FR-9. *This is pass/fail, not a gradient.* (Note: this is why the King is social-only per FR-8 — any app-enforced block would leak it.)
- **SM-7 — $0 to run** at family/friends scale. Validates §11 cost constraint.

**Counter-metrics (do not optimize)**
- **SM-C1 — Screen engagement / time-in-app.** Counterbalances SM-1/SM-2. More time looking at the phone is a *failure*, not success — the whole point is eyes up. Never optimize for screen time, session length on-device, or per-Turn dwell.
- **SM-C2 — Reach / install count.** Counterbalances any drift toward "bigger." Trash wins by making one night great, not by spreading. Do not treat user counts, shares, or returning-group rate as targets. (A group pulling Trash out again is a welcome *lagging* indicator, not a design goal.)

## 8. Open Questions

1. ~~**Re-deal starting player.**~~ **RESOLVED:** the Host is the Starting Player for the *first* Round; thereafter the previous Round's Loser starts (see FR-5/FR-12). Open sub-question: when a Round had multiple Losers (a tie), which of them starts? `[ASSUMPTION: the tied Loser seated earliest in turn order from the previous Starting Player; tunable.]`
2. ~~**Deck threshold exact value.**~~ **RESOLVED:** 1 deck for 2-10 Players, 2 decks for 11-20 (FR-13).
3. **Two-deck tie frequency.** With duplicate values likely at large tables, are frequent multi-Loser Showdowns fun or annoying? Validate in playtest; may motivate a tie-break rule later. *(Genuinely open — playtest question.)*
4. ~~**Mid-session Host controls.**~~ **RESOLVED:** pulled into MVP — change Lives, remove a Player, reassign Host (FR-14). Two sub-details (Lives-change effect on Players already below the new value; mid-Round removal timing) left as `[ASSUMPTION]` for UX/build.
5. ~~**Late join / leave mid-game.**~~ **RESOLVED:** no joining a game in progress; lobby join up to the first Deal only; a Player who leaves mid-game stops taking Turns, table continues/restarts socially (FR-3; §6.2). Full reconnection remains out of MVP.
6. ~~**Room Code format.**~~ **RESOLVED:** 4 uppercase letters, ambiguity-safe set (FR-1). Open sub-question: when does an idle Table/Room Code expire? `[ASSUMPTION: after a period of inactivity; exact TTL for build.]`

## 9. Assumptions Index

- §4.1 / FR-4 — Default starting Lives is 3 if the Host doesn't change it.
- §4.2 / FR-5, FR-12 — Multi-Loser-tie tiebreak for who starts the next Round: the tied Loser seated earliest from the prior Starting Player; if the Loser-to-start was eliminated, the next surviving Player to their right starts. Both tunable.
- §4.3 / FR-12 — In the zero-survivors case (all remaining Players eliminated in one Showdown), they share the win; alternative is a sudden-death re-deal.
- §4.5 / FR-14 — Mid-session Lives change: effect on Players already below the new value (clamp vs. top-up) left for UX/build. Mid-Round Player removal resolves at the next Showdown/Re-deal, not by rewriting the current Round.
- §8 / OQ-6 — A Table/Room Code expires after some period of inactivity; exact TTL for build.

## 10. Aesthetic & Tone

The product's defining discipline is **eyes up, not down** — doing less on screen, on purpose. This is the differentiator that can't be copied from a feature list, so it constrains every UI decision.

- **The app is a quiet dealer and scorekeeper, not the show.** The show is the people at the table. A Player should look at their phone for ~10 seconds a Round and otherwise be looking up.
- **The active Player's screen is two big buttons.** Swap / Keep, plus a peek/hide control. Nothing else competes for attention. The Reluctant Player must never be confused — this is the weakest-link gate. The Card stays hidden by default and re-hides on its own (FR-6), so a phone set down doesn't expose a hand to the neighbor leaning over.
- **Inactive screens are nearly empty** — only whose Turn it is. No idle content, no notifications, nothing to scroll.
- **Comedy is good-natured.** When the produced FX arrives (v1.1), it fires on the Loser's phone and is funny, not mean. Even the MVP's minimal reveal should feel playful, not clinical.
- **Anti-references:** anything that pulls each person into their own screen — feeds, chat, ads, dwell-maximizing animations between Turns. If a feature would make the table look *down*, it's wrong for Trash.

*Detailed visual direction, copy/voice, and FX design belong to the UX spec (`bmad-ux`); this section sets the non-negotiable posture.*

## 11. Constraints & Guardrails

### 11.1 Privacy / Integrity (hard rule)

- **A secret Card is delivered only to its owner — never to any other device — until Showdown.** Not in the UI, not in network traffic. This is the single non-negotiable technical rule (validated by SM-6).
- **State is server-authoritative.** No Card values or game-deciding logic live on the client where a curious Player could read them by poking at the browser.
- **No feature's behavior may depend on reading another Player's secret Card before Showdown.** This is why the King is social-only (FR-8): an app-enforced King block would leak — the bare fact of a refused Swap would reveal that the neighbor holds a King, both to the swapper and to anyone watching the turn indicator. The app never branches on a non-owner's Card value until the simultaneous reveal.

### 11.2 Cost (hard constraint)

- **Zero ongoing cost** to run at family/friends scale. This bounds the architecture (free-tier hosting, idle-to-zero) and is a launch gate, not a nice-to-have. *(Recommended stack and how it meets this → addendum.)*

### 11.3 State identity

- **All Player state is keyed to a stable `playerId` + session token, not socket identity, from day one.** This makes future reconnection (out of MVP, §6.2) cheap to add without re-architecting.

---

*Technical direction (PartyServer / Cloudflare Workers + Durable Objects, PartySocket, JSON-over-WSS, the phase state machine, the WebSocket event protocol, pure transport-agnostic rule functions, and the shuffle mechanism) is carried in the companion `addendum.md` and the technical research doc, not in this PRD.*
