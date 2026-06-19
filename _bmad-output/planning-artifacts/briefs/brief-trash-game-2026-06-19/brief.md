---
title: "Product Brief: Trash"
status: complete
created: 2026-06-19
updated: 2026-06-19
---

# Product Brief: Trash

## Executive Summary

**Trash** is a real-time party card game for the people already sitting around your table — family at a holiday, friends after dinner — played on the phones in their pockets. Each player is dealt one secret card; on your turn you choose to **shove your card onto the player to your right** or keep it. The "trash" — the low card nobody wants — gets passed around the circle until the **showdown**, when every card flips at once and the lowest card loses a life. Lose all your lives and you're out; last one standing wins; one tap re-deals and the next round is already going.

The game runs on a simple division of labor: **the phone is the dealer and scorekeeper, and the humans provide the drama.** Players look down for about ten seconds a round — deal, their turn, the reveal — and spend the rest of the time looking *up*, at each other, where a party actually happens. When someone loses, a bit of good-natured comedy fires on *their* phone, and the table erupts. Then someone says "one more."

The enabling insight: a group that wants to play cards almost always *can't* — the deck is the one thing nobody brought. Trash turns the phone into the deck, so the game is always available, joins in seconds by room code, and needs no app-store download. But availability is the means, not the end. The end is **the shared laugh and the "one more round" grip** — a genuinely good game, built first for the maker's own people, good enough that they reach for it on purpose.

## The Problem

Getting a group that's *already together* to actually play something is harder than it should be. The deck is forgotten or lost. Someone half-remembers a game but not the rules, and explaining them kills the momentum. Phone games at gatherings usually pull each person *down into their own screen* — the opposite of what a party wants. So the group defaults to scrolling, or the energy just dissipates.

Underneath that is the real gap: **there's no effortless way to turn "we're all here" into "we're all playing and laughing together."** A great in-person party game needs almost nothing on the screen and almost everything at the table — and most digital games get that backwards.

This is, honestly, less a widespread market pain than a specific, recurring opportunity at the gatherings the maker cares about: the moment after dinner when everyone's still at the table and *something fun should happen next*. Trash exists to make that moment reliable.

## Who This Serves

**The whole table is the user** — a group anywhere from a handful of people up to a big gathering of ~20 (the game has been played in real life with 8, 10, 12, even 20 around the room) — mixed ages, physically together — who want to play *together* rather than disappear into separate screens. The experience has to delight all of them at once. But a table doesn't fail on average — it fails at two specific points, so two roles are load-bearing:

**The Host (the activation gate).** Every group has a ringleader — the one who says "let's play something." They start the table and drive the energy. If they can't get everyone in and playing in seconds, *the game never happens at all*. The Host needs near-zero setup (room code, no downloads, no accounts) and simple conductor controls to move the table through each round without it feeling like work. Win the Host and the table gets to the table.

**The reluctant player (the weakest-link gate).** Abuela, the youngest kid, the one who "doesn't do phone games." If *they* get confused, the round stalls and three people lean over to help — and the energy dies. Their screen has to be impossible to misread: on your turn, two big buttons — **Swap** or **Keep** — and nothing else. Win the weakest link and nobody gets left behind.

Everyone in between — the competitive cousin, the casual player, the kid who just likes the comedy when someone loses — is served for free once those two gates are clear. Success for all of them is the same simple thing: they're laughing, they're looking *up* at each other, and someone keeps saying "one more round."

## What Makes This Different

Let's be honest about what this is: Trash is a 200-year-old public-domain folk game (Screw Your Neighbor / Chase the Ace), and the technology — a room-code web app — is trivially copyable. There is no technical moat here, and the brief won't pretend there is one. The advantage is **positioning and execution**, and it's real:

**It occupies a genuinely empty spot.** Digital versions of this game already exist — but they're built for playing with people who *aren't in the room* (online/remote). The products that nail *in-person* play (AirConsole, Jackbox) all need a **shared screen or TV** and often cost money — your phone is a controller, not your private hand. Nothing found does all five at once: **free, no download, everyone on their own phone, in person, this game.** That's the spot Trash takes.

**It has a point of view most party apps get wrong: eyes up, not down.** The whole design is built around *not* owning your attention — the app is a quiet dealer and scorekeeper, you glance at it for about ten seconds a round, and the rest of the party happens at the table, between people. Most phone games do the opposite and pull everyone into their own screen. That discipline — doing *less* on screen, on purpose — is the differentiator you can't copy by cloning a feature list, because it's a set of choices, not a feature.

**It's built first for a real table.** This isn't a market play chasing scale; it's a tool a host actually wants to pull out at their own gatherings, tuned to the failure points of real groups (the activation moment, the weakest-link player). That focus keeps it honest and keeps it good.

The bet isn't "no one else could build this." It's "no one has bothered to build *exactly this*, well, for free — and execution on the table experience is the whole game."

## Success Criteria

The north star is unchanged and unapologetically subjective: **the people at the table are genuinely delighted.** Player joy at a real gathering beats any dashboard. But "delight" can be observed — three in-the-moment signals, watchable at a real table, stand in for it:

**The signals that matter (observed in the room):**
- **"One more round."** A sitting runs through multiple re-deals without anyone needing to be talked into it. The instant re-deal loop grips on its own — people don't ask for "one more" of something they're merely tolerating.
- **Eyes up.** During play, people are looking at each other and laughing — not drifting off into other apps. The "quiet dealer, eyes-up" design holds in practice rather than just in theory.
- **The laugh fires.** When someone loses, the comedy moment reliably gets a table-wide reaction. The heartbeat beats.

**The bars that make those possible (engineering / integrity):**
- **Fast to start:** from "let's play" to everyone dealt in well under ~30 seconds — room code, no download, no accounts.
- **A full game night runs without a confusion-stop** — nobody gets stuck not knowing what to do, no round stalls on the weakest-link player.
- **Integrity holds:** no player can ever see another's secret card before the showdown — not in the UI, not in the network traffic. (The one hard technical rule.)
- **$0 to run** at family/friends scale — the hard zero-cost constraint is met.

A quiet lagging indicator, not a target to chase: if the night's genuinely good, the group pulls Trash out again at the *next* gathering on their own. We don't design for return — we design for the great session, and the rotation spot follows.

## The Solution

Everyone at the table opens a link or types a short **room code** in their phone's browser — no app store, no account, no install. One person is the **Host**, who conducts the game from their screen; everyone else just gets their hand.

A round plays like this:

1. The phone **deals each player one secret card**, visible only to them (they can peek and hide it at will on their turn).
2. Play passes **around the table, each player to the one on their right**. On your turn, your screen shows exactly two big buttons — **Swap** (shove your card onto the player to your right) or **Keep**. The trash keeps moving: even if you were just handed something worse, that next player gets their own choice.
3. The **last player** can swap with a random card from the deck instead.
4. **Showdown:** every card flips at once, and the app clearly shows who's holding the lowest — **Ace is lowest**, that player loses a life. Ties lose together.
5. Lose all your lives and you're out. **Last player standing wins.** One tap re-deals and the next round is already going.

The division of labor is the design: **the app is a quiet dealer and scorekeeper; the humans provide the drama.** Social moments stay social — when someone draws a King (the highest card, which blocks the player who'd swap into them), they just *declare it to the table*; the app doesn't need to police it.

Under the hood, the game is **server-authoritative** — the server owns the deck, deals, and results, and a player's secret card is sent *only* to that player, never broadcast. That one rule (proven out in the technical research) is what keeps the game honest against a curious player poking at their browser.

## Scope

This is a tightly bounded first version. The boundary matters more than the feature list.

**In — the MVP (Classic mode):**
- Create / join a table by **room code**; web app, no download, no accounts.
- The full game loop: deal one **secret** card each → **Swap/Keep** around the table (each player to the one on their right) → last player may draw from the deck → **simultaneous showdown** → lowest loses a life → elimination → last one standing → **instant re-deal**.
- **Host conductor controls** — the Host manually advances the table through each phase (no auto-advancing turns, no timers).
- **Player screens:** active player sees just **Swap/Keep** (and can peek/hide their own card); inactive players see only **whose turn it is** (a name) until the showdown.
- A **minimal reveal moment** at showdown — cards flip together and the loser is clearly highlighted. (Good showdown UX, so the playtest tests the *real* loop, not a sterile result.)
- **Server-authoritative state with private secret cards** — the one non-negotiable integrity rule.
- **Zero ongoing cost** to run.

**Explicitly out (deferred, with intent):**
- **The produced comedy FX** (the animation + sound that fires on the loser's phone) — this is the *first fast-follow (v1.1)*, not part of the MVP. It's the heartbeat, but the loop gets proven first, then the polish goes on.
- **Powers mode** (Jack = Spy, Queen = Thief, King = Blocker, player-triggered) — the headline v2.
- **Reconnection / disconnect handling** — out of MVP; the group restarts socially. (State is keyed to a stable player identity from day one so this is cheap to add later.)
- **Reversal / modifier modes, cross-night stats, themes, cosmetics, monetization** — later, if ever.

**Open questions the PRD must close** (requirements-level, not brief-level): starting-player and rotation rule; the heads-up (2-player) tweak to the last-player-draws-from-deck rule; exact min/max player count (real play has reached ~20 — see note below); starting number of lives; and the **one-vs-two-deck** threshold. That last one is no longer optional: at up to ~20 players a single 52-card deck is too thin, so two decks become a real requirement, and the showdown UI must comfortably reveal and resolve a large number of cards.

## Vision

Trash succeeds by getting **deeper, not bigger.** The win isn't a user-count chart — it's becoming the richest, most-replayable version of itself for the people who actually play it.

The clearest next step is **Powers mode**: the royal court earns abilities the holder chooses whether to use — **Jack the Spy** (peek at your neighbor before you decide), **Queen the Thief** (steal a life from the round's loser), **King the Blocker** (already public, blocks the swap into them). Number cards and the Ace stay pure, so "the read" on the dangerous low cards stays clean. Crucially, powers are *player-triggered*, which adds a layer of bluff and timing — "do they have a power, and will they dare use it?" — without ever taking the simple Classic game away from the table that just wants the simple game.

From there, depth compounds: round modifiers (a "reversal" round where highest loses), light cross-night bragging rights ("Mom's won three — loser does the dishes"), and a bit of theme and character. None of it is a growth lever; all of it is *more reasons for the same table to play one more round, one more night.*

It's built first and foremost for the maker's own people. If it's good enough that it spreads on its own, that's a welcome bonus — but it's not the plan, and the brief won't pretend it is. The plan is a genuinely great game that real tables keep reaching for.

---

## Technical Direction (carried from research — for the PRD & Architecture phases)

Not a brief-level decision, but the technical research is decision-grade and should travel with this document so it isn't re-litigated downstream:

- **Hard constraint:** zero ongoing cost.
- **Recommended stack:** **PartyServer on Cloudflare Workers + Durable Objects** (one Durable Object per room) with a **PartySocket** web client served free via Cloudflare Pages; JSON over WSS. The only validated free option supporting long-lived WebSockets that wakes instantly (hibernation) and is private-by-default for secret cards. *(Fallback: Node + Socket.IO — but not free at always-on.)*
- **Non-negotiable rule:** **server-authoritative state; a secret card is sent only to its owner, never broadcast.**
- **Keep game rules as pure, transport-agnostic functions** — insurance against the post-acquisition flux in the PartyServer ecosystem, and the basis for unit tests.
- **Key all state by a stable `playerId` + session token** (not socket id) from day one, so reconnection is cheap to add later.
- TypeScript; Fisher–Yates shuffle seeded by a CSPRNG (not `Math.random()`).

> Full detail — WebSocket event protocol, phase state machine, and a 6-step implementation roadmap — lives in `_bmad-output/planning-artifacts/research/technical-realtime-multiplayer-web-game-architecture-research-2026-06-18.md`. Re-verify Cloudflare free-tier limits and the current PartyServer entry point at build time.
