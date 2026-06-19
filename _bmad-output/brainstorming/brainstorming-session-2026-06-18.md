---
stepsCompleted: [1, 2, 3, 4, 5, 6]
ideas_generated: ['everyone-connects-room-code', 'web-app-websockets', 'app-as-dealer-scorekeeper', 'host-manual-conductor', 'secret-cards-simultaneous-showdown', 'clockwise-swap-right', 'trash-keeps-moving', 'active-ui-swap-keep', 'peek-hide-own-card', 'lives-elimination-last-standing', 'instant-redeal', 'loser-comedy-fx', 'king-declared-physically', 'classic-mode-mvp', 'powers-mode-v2-jqk', 'jack-spy', 'queen-thief', 'king-blocker', 'reversal-modes-v2', 'ace-lowest', 'occasion-game-positioning']
inputDocuments: []
session_topic: 'A multiplayer mobile card-swapping game (trash-game) where players hold a single card and try not to end up holding the lowest'
session_goals: 'Expand and pressure-test the core concept; generate mechanics, hooks, edge cases, theme, and monetization/retention ideas before formalizing into a brief/PRD'
selected_approach: 'progressive-flow'
techniques_used: ['what-if-scenarios+scamper', 'mind-mapping+six-thinking-hats', 'role-playing+chaos-engineering', 'resource-constraints']
ideas_generated: []
context_file: ''
---

# Brainstorming Session Results

**Facilitator:** Dennis_Salcedo
**Date:** 2026-06-18

## Session Overview

**Topic:** A multiplayer mobile card-swapping game ("trash-game") — each player holds one card, takes turns optionally swapping with the next player, and whoever holds the lowest card at the showdown loses the round.

**Goals:** Expand and pressure-test the core concept — generate mechanics, hooks, edge cases, theme, art direction, and retention/monetization ideas before formalizing into a brief/PRD.

### Session Setup

User arrived with a structured initial concept (the "design-document" framing):

- **Platform:** Multiplayer mobile, smartphone-connected.
- **Components:** One or two standard 52-card packs (Jokers excluded).
- **Deal:** Each player dealt a single card.
- **King Rule:** King is the highest card; the player next in turn cannot swap with a King-holder (King is protected/blocking).
- **Turn action:** On your turn you may swap your card with the next player in line.
- **Last player:** May swap their card with a random card drawn from the deck.
- **Showdown / losing condition:** All cards revealed; lowest-value card holder(s) lose the round. Ties lose together (e.g., two 2s both lose).

> Note: This core matches the classic folk game known as Cuckoo / Ranter-Go-Round / Chase the Ace / Screw Your Neighbor — proven fun loop; goal is to make a distinctive mobile version.

## Technique Selection

**Approach:** Progressive Technique Flow
**Journey Design:** Systematic development from exploration to action

**Progressive Techniques:**

- **Phase 1 - Exploration:** What If Scenarios + SCAMPER — crack open every unquestioned rule, mutate the core.
- **Phase 2 - Pattern Recognition:** Mind Mapping + Six Thinking Hats (Black Hat) — cluster ideas, pressure-test the strongest.
- **Phase 3 - Development:** Role Playing (player personas) + Chaos Engineering — refine the loop, break it deliberately.
- **Phase 4 - Action Planning:** Resource Constraints — define the smallest fun playable MVP.

**Journey Rationale:** Game has a proven core loop but many unexamined assumptions and an undefined product layer (theme, social, retention). Progressive flow expands wide, then narrows toward a buildable MVP ready for a brief/PRD.

## Phase 1 — Expansive Exploration (What If + SCAMPER)

_Ideas generated through dialogue. Tagged by the assumption being challenged._

### 🔑 Foundational truths surfaced (anchor everything to these)

- **Core fun = "the read."** The whole tension is gauging whether your neighbor holds something lower than you before deciding to swap. Protect this; don't bury it.
- **Real-world problem being solved:** Friends/family already gather around a table to play, but **a physical deck is often missing/forgotten** → no game. **The phone becomes the deck.** Always-in-pocket, zero-setup card play for in-person groups.
- **Round structure / stakes:** Losing a round costs a set number of **lives**, or eliminates the player. Play continues **until one player remains** (last-one-standing). This wrapper gives each swap real weight.
- **User stance on variability:** Open to unpredictability but wants to understand the *mechanism* first — keep clean simplicity as the default, treat twists as optional layers/modes.

### What-If ideas (Phase 1 raw)

- **WI-1 (win condition):** Optional "reversal" rounds where highest loses instead of lowest — flips the value of every card. (Status: parked as optional mode, not core.)

### 📏 Canonical rule clarifications (authoritative — overrides earlier notes)

- **King Rule (refined):** When a player *draws/holds* a King, they must **immediately reveal it to everyone** and announce that the **adjacent player is blocked** (cannot swap with them). King is public, not secret.
- **Ace Rule:** **Ace is always the LOWEST card** in the deck (not high). So Ace = the most dangerous card to hold at showdown.

### Phase 1 decisions

- **D-1 (modes):** Ship a **Classic mode** (pure original rules) AND a **Powers/variant mode**. Players must always be able to choose the clean classic version. ✅ confirmed direction.
- **D-2 (rejected for now):** Option B (anyone burns turn to blind-draw from deck) — not keen. ❌
- **D-3 (rejected for now):** Option C (hidden info about your own card) — not keen. ❌
- **D-4 (favored):** Option A (special-card powers) is the preferred unpredictability mechanism — *as an optional variant mode*. ✅

### ⚡ Powers Mode — design (confirmed)

**Design principle:** Only the **royal court (Jack, Queen, King)** carry powers. **Number cards and Ace stay pure** (no powers) — keeps "the read" on low cards clean and simple.

- **King** 👑 — *The Blocker.* Held publicly (must reveal on draw); the adjacent player is blocked from swapping with the King-holder. (Same as canonical.)
- **Queen** 👑 — *The Thief.* When played/revealed, steals a life from the round's loser (or forces an extra swap — exact effect TBD in Phase 3). ✅ liked
- **Jack** 🃏 — *The Spy.* Lets the holder peek at the neighbor's card before deciding to swap — turns the read into real information. ✅ liked
- **Number cards (2–10) & Ace:** **no powers.** ✅ confirmed (Ace remains simply the lowest/most dangerous card).

- **D-5 (activation — KEY decision):** Powers are **player-triggered**, NOT automatic. The holder must actively choose to activate. → Introduces **bluffing & timing** ("do they have a power, and will they use it?") as a skill layer. ✅ confirmed

### 🎭 Identity & positioning (confirmed)

- **The name "Trash" = the mechanic, not a grungy theme.** You're dealt a **"trash" card** and the game is about **passing the trash** along to someone else so *you're* not stuck holding the worst card at showdown. Self-explanatory, memorable hook ("hot potato with cards").
- **Audience:** **Family-oriented**, social, brings people together. Friends + family.
- **Occasion / play pattern:** NOT a daily-grind game. It's an **occasion game** — family gatherings, get-togethers, parties. Played in bursts when people are physically together.
- **Connection model (confirmed):** **Everyone connects** — each player joins a shared table via their own phone; each phone is that player's private hand. (Not pass-and-play single device.)

> Positioning implication: This is a "fill the gap when there's no deck" + "instant party game for the group you're already with" product. Retention is driven by *gatherings*, not daily streaks — design accordingly (low friction to start a table, fun enough to do "one more round").

### 🎉 Table experience & feedback (confirmed)

- **Loser feedback (FX-1):** When a player loses a round, a **comical animation + sound effect** plays **on the losing player's device**. Lightweight humiliation = the fun. (Keep it good-natured/family-friendly.)
- **The Host role (HOST-1):** One player is the designated **Host** who **orchestrates game flow** via the app — e.g., prompts the group "You may now view your card," then confirms the transition to the next phase (the swap), advancing the table through phases. Host = the human conductor; app gives them the controls.
- **Design philosophy (PHIL-1):** **Let humans do the human parts; let the phone do the dealing/tracking.** Because everyone's at the same physical table, social actions don't need app logic.
  - **King Rule needs NO special app logic** — the player simply **declares the King physically** to the group ("I have a King, the player next to me is blocked"). The table enforces it socially.
  - Implication: this likely extends to other "announce-able" moments — the app tracks state (cards, lives, whose turn), humans handle the theatrics and social enforcement.

### 🔁 Replayability & flow (confirmed)

- **RE-1 ("one more round" hook):** **Instant re-deal** — one tap, no lobby reset. Same table, immediately deal the next round. This is the engine of "okay, ONE more." ✅
- **EDGE-1 (2 players remaining):** Swap-with-neighbor **still applies** with 2 players (the two simply swap with each other). ✅ Nuance to resolve in Phase 3: with 2 players the "next player" and "previous player" are the same person, and the "last player draws from deck" rule may need a tweak for heads-up play.
- **EDGE-2 (standoff / everyone refuses to swap):** Not a real-world problem — in practice players don't all refuse. No special handling needed. ✅ (noted, parked)

### 🏗️ Open architecture tension (flagged for Phase 3)

- **ARCH-1 — "Dumb dealer" vs "Smart referee" spectrum:** Given King is declared physically and powers are player-triggered, how much rules-knowledge does the app need? Ranges from app-just-deals-and-tracks-lives (humans run everything) to app-enforces-turns-and-validates-powers. **This is the core architecture decision** — resolve in Phase 3.

## Phase 2 — Pattern Recognition (Mind Map + Black Hat)

### Clusters identified
1. **Core Loop** — the read; swap-or-not; lives → elimination; last one standing.
2. **Modes** — Classic (pure) vs Powers (J/Q/K, player-triggered); both selectable.
3. **Phone-as-Dealer** — everyone connects; each phone = private hand; app = dealer + scorekeeper.
4. **Table/Social Experience** — Host conductor role; loser comedy FX; humans handle theatrics (King declared physically).
5. **Replayability** — instant re-deal; occasion-driven (not daily).

### ⚫ Black Hat — risk decisions (confirmed)

- **RISK 1 — Join friction (table setup must be fast):** Resolved → players join a table by **typing in a Room Code**. ✅ (Target: starting/joining a table should be near-instant so the social moment isn't lost.)
- **RISK 2 — Heads-down screens kill the party:** Resolved → screen attention is **NOT constant**; a player should look at their phone **~10 seconds maximum** per round (deal + their turn + reveal). Design must keep eyes UP at the table the rest of the time. ✅
- **RISK 3 — Powers add "smart referee" complexity:** Resolved → **Classic mode ships FIRST as the simple MVP. Powers mode is a later (v2) addition.** ✅ This sharply scopes the MVP.

### 🎯 MVP crystallized (from Black Hat)

The MVP is **Classic mode only**: everyone connects via room code → app deals one card each → Host orchestrates view/swap phases → swap-or-not around the table → last player can swap with deck → showdown reveal → lowest loses a life → comedy FX on loser → instant re-deal → last one standing wins. Powers (J/Q/K), and any extra modes, are explicitly post-MVP.

## Phase 3 — Idea Development (Role Play + Chaos Engineering)

### 🖥️ Screen / role specs (confirmed via persona role-play)

- **Active player screen (UI-1):** Dead simple. Just **two big buttons: "Swap" or "Keep."** Nothing else competing for attention. (Serves the non-techy "Abuela" player — impossible to miss what to do.)
- **Host screen (UI-2):** Displays **who currently holds the turn**. The Host **manually manages turn transitions** for the MVP (taps to advance whose turn it is / phase). No auto-advance in MVP.
- **Inactive players screen (UI-3):** Shows **whose turn it is** (that player's **name**) and **their card once revealed**. Keeps spectators engaged and glanceable (respects RISK 2 / ~10-sec attention).
- **ARCH-1 resolved (MVP):** App is a **"smart-ish dealer + scorekeeper" with a manual Host conductor** — it deals, tracks turn/lives/state, and offers Swap/Keep, but the **Host drives phase progression manually**. Not a fully automated referee. ✅

### 💥 Chaos Engineering — edge-case decisions (confirmed)

- **CHAOS 1 — Card secrecy (CRITICAL, protects core fun):** Cards stay **SECRET until the final showdown.** Inactive players do **NOT** see a card when a player finishes their turn — UI-3's "see their card once revealed" means **only at the showdown reveal.** This preserves "the read" as a true gamble. ✅
  - ⚠️ Correction to UI-3: during play, inactive players see only **whose turn it is (name)** — NOT the card. All cards reveal together at showdown.
- **CHAOS 2 — Disconnect / dead phone mid-round:** **NOT handled in MVP.** (Out of scope for v1; group restarts/handles socially.) ✅
- **CHAOS 3 — Re-peek own card:** A player **can toggle to check or hide their own card** during their turn (peek at will before deciding). ✅
- **CHAOS 4 — Slow/phantom turn:** **No app handling needed** — people react/nudge each other socially (it's an in-person game). ✅

## Phase 4 — Action Planning (Resource Constraints)

### Platform & tech (confirmed)

- **TECH-1:** Use **WebSockets** for real-time table sync — keeps it simple and cross-platform. Strongly implies a **web app** (open a link / enter room code, **no app-store download**) — which also crushes RISK 1 join friction. ✅

### Definition of success (confirmed)

- **SUCCESS-1:** **The family/friends are genuinely delighted playing it.** That's the bar. (Player joy at a real gathering > metrics.) ✅

### 🔄 Turn loop & turn order (confirmed — mechanical core)

- **TURN-1 — Direction:** Play proceeds **clockwise** around the table.
- **TURN-2 — The swap target:** On your turn you may swap your card with the **player directly to your right** (the next player in clockwise order). You shove your trash onto the next player.
- **TURN-3 — Action:** On your turn, choose **Swap** (exchange with the player to your right) or **Keep** (do nothing). Then the turn passes clockwise.
- **TURN-4 — Trash keeps moving:** Every player gets their own decision when their turn arrives, **even if they were just handed a worse card.** A player who receives a swapped card can still choose Swap or Keep on their own turn → trash flows downstream around the table.
- **TURN-5 — King block:** If the player to your right holds/declared a King, you **cannot** swap into them; your only option is Keep. (Enforced socially; King declared physically per PHIL-1.)
- **TURN-6 — Last player:** The final player in the round (no further player to pass to) may instead **swap with a random card drawn from the deck**, or Keep.
- **TURN-7 — One pass = one round:** Each player acts **exactly once** per round; one full clockwise pass around the circle completes the round, then showdown.
- **TURN-8 — Showdown:** After the last player acts, **all cards reveal simultaneously**; lowest card loses (Ace = lowest); ties lose together.
- **Open (minor, for PRD):** Who is the **starting player** each round and does it rotate? (Not yet decided — likely rotates clockwise each round; confirm in PRD.)

---

## 🎁 Executive Summary

**Trash** is a real-time, web-based multiplayer party card game for **friends and family gathered around the same table**. It solves a real problem: groups want to play a quick card game together but **often don't have a physical deck** — so the phone becomes the deck.

Each player is dealt one **secret card**. The "trash" (a low card) gets passed clockwise around the table as players choose to **Swap** (push their card to the player on their right) or **Keep**. At the **showdown**, all cards reveal at once — the **lowest card loses a life**. Lose all your lives and you're out; **last player standing wins**, then **instant re-deal** keeps the night going.

The genius is the division of labor: **the app is the dealer + scorekeeper; the humans provide the drama.** Players look at their phone for ~10 seconds a round — the rest of the time eyes are up at the table, where they belong.

- **Tech:** WebSockets, web app, room-code join (no app-store download).
- **MVP:** Classic mode only.
- **v2+:** Powers mode (Jack = Spy/peek, Queen = Thief, King = Blocker), modes/modifiers, themes.
- **Success metric:** the people at the table are genuinely delighted.

## 🃏 Final Rules of Record (Classic Mode)

1. Played with **1–2 standard 52-card packs**, **no Jokers**.
2. Each player is dealt **one secret card**.
3. **Ace is the lowest card; King is the highest.**
4. Play goes **clockwise**. On your turn: **Swap** (exchange with the player to your right) or **Keep**.
5. **King:** held publicly (declared to the table); the player to a King-holder's left cannot swap into them.
6. **Trash keeps moving** — every player gets their own Swap/Keep decision once per round, even if just handed a worse card.
7. **Last player** may swap with a **random card from the deck** instead, or Keep.
8. **Showdown:** all cards reveal at once; **lowest card loses** a life; **ties lose together**.
9. **Elimination:** lose all lives → out. **Last player standing wins.** Then **instant re-deal**.

## 💡 Idea Inventory (by status)

**Locked into MVP**
- Everyone-connects via **room code**; web app + WebSockets
- App = dealer + scorekeeper; **Host manually conducts** phases
- Secret cards until **simultaneous showdown** (protects "the read")
- Clockwise swap-with-player-to-your-right; trash keeps moving
- Active player UI = **just Swap / Keep**; peek/hide own card
- Inactive players see **whose turn it is** (name only) until showdown
- Lives → elimination → last one standing; **instant re-deal**
- **Comedy animation + sound** on loser's device
- King declared physically (no app logic)

**Parked for v2+**
- **Powers mode** (player-triggered): **Jack** = Spy (peek neighbor), **Queen** = Thief (steal a life), **King** = Blocker
- Reversal/round-modifier modes ("highest loses," "7s wild," etc.)
- Cross-night stats / standings ("Mom won 3, loser does dishes")
- Themes, cosmetics, monetization

**Rejected**
- Anyone burns a turn to blind-draw from deck (Option B)
- Hidden info about your own card (Option C)
- Powers on number cards / Ace
- Auto-advancing turns, timers, standoff handling

**Open questions for the PRD**
- Starting player each round + rotation rule
- Heads-up (2-player) tweak to the "last player draws from deck" rule
- Min/max player count; exact starting lives; 1 vs 2 decks threshold
- Disconnect/reconnect handling (explicitly out of MVP, but plan for v1.x)

## 🚀 Recommended Next Steps

1. **Create a Product Brief** (`bmad-product-brief`) — turn this into a structured concept doc (problem, audience, MVP scope, success criteria). This session gives you ~80% of the content already.
2. **Then the PRD** (`bmad-prd`) — the first *required* BMad gate; resolve the open questions above into firm requirements.
3. Carry the **Final Rules of Record** and **MVP feature list** forward verbatim — they're decision-complete.

> Run each in a fresh context window. This document is the input.

---

_Session complete. Phases 1–4 of Progressive Technique Flow executed: Expansive Exploration → Pattern Recognition → Idea Development → Action Planning._


