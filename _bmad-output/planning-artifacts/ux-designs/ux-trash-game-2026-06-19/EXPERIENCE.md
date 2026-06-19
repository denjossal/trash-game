---
name: Trash
status: final
sources:
  - {planning_artifacts}/prds/prd-trash-game-2026-06-19/prd.md
updated: 2026-06-19
---

# Trash — Experience Spine

> Real-time, in-person party card game. Phone-only (every player including the Host is on their own phone; no shared screen). Mobile web, portrait, dark-mode default. Paired with `DESIGN.md` (the "Electric Social" visual identity). This spine owns *how it works*; `DESIGN.md` owns *how it looks* and wins on any visual conflict. Both spines win over the Stitch mocks. Glossary terms (Table, Player, Host, Card, Lives, Swap, Keep, Showdown, Loser, Round, Turn, Starting Player, Last Player, Room Code, Re-deal) are used verbatim from the PRD.

## Foundation

Mobile web, **portrait**, served as a PWA (manifest + icons already produced). No app-store download, no accounts — a Player joins a Table with a 4-letter Room Code in a browser. No named UI framework; the app inherits browser/PWA conventions and defines its own components against `DESIGN.md` tokens. Dark mode is the only mode in MVP (`DESIGN.md` surface tokens are dark-native).

The guiding constraint is the PRD's **eyes-up principle**: the app is a quiet dealer and scorekeeper. Restraint is expressed as *fewer elements on screen*, not muted color — surfaces are sparse but high-contrast and legible at arm's length across a table. The two load-bearing roles drive every decision: the **Host** (must start a game in seconds and conduct it) and the **Reluctant Player** (must act with zero confusion — Abuela and the nine-year-old).

## Information Architecture

A Player is in exactly one context at a time; the app routes them to the right surface automatically based on Table state and whether it's their Turn. There is **no persistent navigation** (no tab bar, no drawer) — the game flow *is* the navigation. Restraint by structure.

| Surface | Reached from | Purpose |
|---|---|---|
| **Home** | App open (cold) | Create a Table, or Join with a Room Code |
| **Lobby** | After create/join | Room Code on display, roster fills live; Host sets Lives + Deals |
| **Your Turn** | Engine routes here when it's your Turn | The two-button hero: Swap / Keep + peek own Card |
| **Waiting** | Engine routes here when it's not your Turn | Only whose Turn it is. The calmest surface |
| **Showdown** | Host triggers it; routes all devices at once | Simultaneous reveal; Loser(s) highlighted. The loud beat |
| **Round Result** | After Showdown resolves | Who lost a Life; Re-deal (Host) / "waiting to re-deal" (others) |
| **Eliminated** | When a Player hits 0 Lives | Spectator state — still sees Waiting/Showdown, can't act |
| **Winner** | When one Player remains | End-of-game celebration; new game / done |
| **Host Controls** | Host taps the conductor affordance (overlay) | Deal/Showdown/Re-deal triggers + change Lives, remove Player, reassign Host |

→ Visual composition reference: the Stitch preview and `imports/` icons. Spine wins on conflict.

**Surface closure:** every PRD surface need maps to a surface above, and every surface is reached by a flow below. Host Controls is an **overlay** invoked from Lobby / Waiting / Round Result — deliberately never reachable from **Your Turn**, so conductor controls can never clutter the two-button turn screen (PRD FR-14).

## Voice and Tone

Microcopy. Brand voice and aesthetic posture live in `DESIGN.md.Brand & Style`. The voice is warm, playful, plainspoken, inclusive — never "high-stakes," never "underground," never mean. The generated manifest description ("a high-stakes underground card gathering") is **rejected**; corrected at finalize.

| Context | Do | Don't |
|---|---|---|
| Home actions | "Start a table" · "Join a table" | "Create Lobby" · "Enter Game Code" |
| Room code | "Your table code: **WXYZ** — read it out." | "Share code to invite players" |
| Waiting for host | "Hang tight — {Host} deals when everyone's in." | "Awaiting host action" |
| Your turn | "Your turn. Swap it or keep it?" | "Make your selection" |
| Swap / Keep buttons | **SWAP** · **KEEP** | "Exchange card" · "Hold" |
| King at the table | (nothing — the app stays out of it) | Any on-screen King "block" message |
| Peek hint | "Press and hold to peek." | "Tap to reveal your secret card" |
| Showdown loser | "Ooof — lowest card. That's a life, {name}." | "You lost." · "You failed." |
| Tie | "Tie for lowest — everybody drops a life!" | "Multiple losers detected" |
| Eliminated | "You're out — stick around and heckle." | "Game over. You have been eliminated." |
| Winner | "{name} wins it. One more?" | "Victory! Final standings:" |
| Bad code | "No table with that code — check the letters?" | "Error 404: Room not found" |

Names use the Player's entered display name. Keep sentences short and complete; one idea per line; no jargon.

## Component Patterns

Behavioral. Visual specs live in `DESIGN.md.Components`.

| Component | Use | Behavioral rules |
|---|---|---|
| **Primary action button** | Home, Lobby Deal, Swap/Keep, Re-deal | One tap = one committed action. Press scales to 95% (`DESIGN.md`). Swap/Keep require no confirm — speed matters; the move is reversible only by the next Player's Turn, which is the game. |
| **Card display** | Your Turn (own), Showdown (all) | Own Card hidden by default; peek is press-and-hold. At Showdown, all Cards render face-up simultaneously; Loser(s) get the error-ramp highlight. |
| **Turn indicator** | Waiting, Your Turn | Shows the active Player's name. On Your Turn, the whole viewport carries the neon active frame (`DESIGN.md` Turn Indicator). Never shows any Card value. |
| **Roster list** | Lobby, Host Controls | Live-updating list of joined Players with Lives pips. In Host Controls, each row gains a remove affordance. |
| **Lives indicator** | Waiting, Showdown, Round Result, roster | Pip row (filled/hollow). Updates with a brief animation when a Life is lost. |
| **Room code field** | Home (join), Lobby (display) | Join: 4 letter-slots, auto-uppercase, auto-advance, paste-friendly. Display: large, letter-spaced, read-aloud friendly. |
| **Lives stepper** | Lobby (Host), Host Controls | Host picks 1–5; default 3. Big +/− or segmented control. |
| **Host conductor bar** | Host-only, on non-turn surfaces | Triggers Deal / Showdown / Re-deal at the right phase. Hosts the controls overlay entry. Hidden entirely for non-Hosts and on Your Turn. |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Cold open | Home | Two big buttons: Start / Join. No splash beyond the logo. |
| Joining | Home → Lobby | After valid code, name entry, then drop into Lobby roster. Joining is allowed only **before the first Deal** — once a game is underway, the code no longer admits new Players (PRD FR-3). A late arrival waits for the next game. |
| Empty lobby | Lobby | "Waiting for players… share code **WXYZ**." Host's Deal disabled until ≥2 Players. |
| Lobby filling | Lobby | Roster animates each join. Host sees enabled Deal at ≥2 Players. |
| Not your turn | Waiting | Only the active Player's name + your own Lives. Calmest surface — no Card, nothing to scroll, no motion. |
| Your turn | Your Turn | Neon active frame; SWAP + KEEP; peek control. Nothing else. |
| Peeking | Your Turn | Hold reveals own Card rank+suit; release re-hides immediately. |
| Last Player | Your Turn | Adds a third option: **Draw from deck** (alongside Swap/Keep). This is the *one* sanctioned exception to the two-button rule, and it appears **only on the single Last Player's screen** — every other Player still sees exactly Swap/Keep. The third button is visually subordinate (Secondary style) so Swap/Keep stay the obvious primaries; the Reluctant Player is rarely the Last Player and, when they are, the extra option reads as "or take a mystery card." (PRD FR-7; reconciles with DESIGN.md's "two buttons and nothing else" Do's row — that rule governs the *common* turn, this is the bounded last-seat case.) |
| Showdown | Showdown | All Cards flip together (the safe ≤400ms flip defined in `DESIGN.md` Motion & Flash); Loser(s) highlighted (error ramp); losing device gets the warm-tease copy + the round's biggest moment. **MVP scope:** this is a *minimal-but-real* reveal — the produced comedy FX (animation + sound on the Loser's phone) is deferred to **v1.1** (PRD §6.2). Design the beat so FX can drop in later without rework; do not over-build or, conversely, leave it sterile. |
| All-tied | Showdown | Every Card same value → all highlighted; "everybody drops a life" copy (PRD FR-10). |
| Round result | Round Result | Lives pips update; Host sees **Re-deal**, others see "waiting to re-deal." The **first Round** of a game is started by the Host; **every Round after** is started by the previous Round's Loser (PRD FR-5/FR-12). |
| Eliminated | Eliminated → spectator | Player keeps seeing Waiting/Showdown but cannot act; framed as "heckle from the sidelines," not a dead-end. |
| Winner | Winner | One Player left → celebration; "one more?" routes Host to a new game with the same Table. |
| Bad/expired code | Home | Inline warm error under the code field; field stays, ready to retry. |
| Player disconnected | Waiting / Lobby | Roster marks them dimmed; the table continues or restarts socially (no reconnection in MVP — PRD §6.2). No blocking modal. |
| Host left | any | Reassign-Host path surfaces (PRD FR-14); exactly one Host always exists. |

## Interaction Primitives

- **Tap** to act (Start, Join, Swap, Keep, Deal, Re-deal). No accidental double-fire — buttons debounce.
- **Press-and-hold** to peek your own Card; **release** to hide. This is the only gesture carrying secrecy — it must auto-hide on release, on losing focus, and on app-background, so a phone set down never exposes a hand.
- **No timers, no auto-advance.** A Turn waits for the active Player; the Host conducts phase transitions (PRD: humans do the theatrics).
- **Showdown is the only place motion is loud** — the simultaneous flip + loser highlight. Everywhere else, motion is minimal.
- **Banned** (PRD eyes-up + non-goals): feeds, chat, push re-engagement, badge counts, streaks, idle/ambient animation between Turns, anything that invites scrolling.

## Accessibility Floor

Behavioral. Visual contrast lives in `DESIGN.md` (all text-on-surface combinations meet WCAG AA on the dark base).

- **Legibility across a table** is the headline a11y goal: large type, high contrast, and tap targets **≥ 48dp** (the PRD's "Abuela and a kid, in dim light, at arm's length" bar).
- **Color independence:** suit conveyed by shape not color; Loser conveyed by stroke + scale + position, not color alone; turn state by the framed viewport + name, not color alone.
- **Screen readers:** every action labeled with role + state. The turn indicator announces "Your turn" on transition. When hidden, the own-Card rank is **not present in the accessibility tree** (privacy parity with the visual hidden state).
- **Screen-reader peek path:** press-and-hold is intercepted by SR gestures, so the peek control also exposes a standard activatable element ("Peek your card") that, when activated, **announces the rank once to the owner's device only and immediately discards it** from the tree — never a persistent readable node, never sent to any other device.
- **Reduce Motion:** skip the showdown flip (cards appear face-up instantly, loser still clearly highlighted by stroke + position); skip the turn-frame pulse (static frame); skip the press scale. Highlight never depends on the motion.
- **Photosensitivity:** no element flashes more than 3×/second; no full-viewport flash at Showdown (see `DESIGN.md` Motion & Flash). The reveal is a single settle, not a strobe.
- **Focus order** follows reading order on each sparse surface; Swap/Keep are the first two focus stops on Your Turn.
- **One-handed reach:** primary actions sit in the lower half of the viewport (thumb zone), not the top.

## Key Flows

### Flow 1 — Start the table (Marisol, the Host, plates still on the table)

1. Marisol opens the URL; **Home** shows two buttons. She taps **Start a table**.
2. **Lobby** opens with a big 4-letter Room Code. She reads it out: "tee-table code, WXYZ."
3. As cousins type it on their own phones, names pop into the roster live.
4. She sets **Lives** to 3 and, once everyone's in, taps **Deal**.
5. **Climax:** every phone in the room lands on its dealt state at the same instant; the table goes quiet for ten seconds. Setup-to-dealt took well under thirty seconds. *(Realizes PRD UJ-1.)*

Failure: a cousin mistypes the code → warm inline error on their Home, code field ready to retry; the rest of the table is unaffected.

### Flow 2 — Take a turn without help (Tío Beto, who "doesn't do phone games")

1. Beto's phone has been showing only **Waiting** — a single name, nothing to fuss with.
2. The engine routes him to **Your Turn**: the viewport gains the neon frame; two huge buttons, **SWAP** and **KEEP**, and a peek control. Nothing else.
3. He **presses and holds** to peek — his Card appears; he grimaces; he **releases** and it hides.
4. He taps **SWAP**. His Card and his right-hand neighbor's exchange.
5. **Climax:** his screen returns to the calm Waiting view. Nobody leaned over to help him. *(Realizes PRD UJ-2.)*

Edge: his neighbor declares "I've got a King — can't dump on me!" That's social; the app shows nothing about it. Beto taps **KEEP** instead.

### Flow 3 — The showdown (the whole table, any size 2–20)

1. The Last Player acts; Marisol taps **Showdown** in her conductor bar.
2. Every device flips its Card face-up **at the same moment**.
3. The app computes the lowest rank and **highlights the Loser(s)** in the error ramp — unmistakable even across twenty cards.
4. **Climax:** the losing phone shows the warm tease ("Ooof — lowest card, Beto"); the table erupts. A tie highlights everyone tied and drops a Life from each. *(Realizes PRD UJ-3.)*
5. **Round Result:** Lives pips tick down. If one Player remains → **Winner** ("one more?"). Otherwise Marisol taps **Re-deal**, and the Loser of this Round starts the next.

### Flow 4 — Conduct mid-game (Marisol, the night is running long)

1. From **Waiting** (or Round Result), Marisol taps the conductor affordance → **Host Controls** overlay.
2. She drops **Lives** for the next Round to shorten the game, removes a cousin who left the room, and could hand off Host if she wanted to step away.
3. She closes the overlay; play resumes. These controls never appeared on anyone's **Your Turn** screen. *(Realizes PRD FR-14.)*

### Flow 5 — Knocked out but still in it (the cousin who just lost their last Life)

1. At a Showdown, the cousin is the Loser and drops to **0 Lives**.
2. Their device routes to **Eliminated** — warm copy: "You're out — stick around and heckle."
3. They are **not** dropped from the room: they keep receiving the **Waiting** (whose-turn) and **Showdown** views as a spectator, but get no Swap/Keep/Deal actions and are skipped in turn order.
4. **Climax:** they stay part of the table's energy — leaning over, calling the next loser — instead of staring at a dead-end screen. The game thins toward one Player without anyone feeling shoved out of the party. *(Covers the Eliminated surface; honors the PRD's "no dead-ends, table stays social" intent.)*

---

## Open items

- `[ASSUMPTION]` Portrait-only orientation (landscape not designed for MVP).
- `[ASSUMPTION]` "Draw from deck" for the Last Player is a Secondary-styled third button on Your Turn, only for that seat; exact placement to confirm against a rendered mock.
- `[NOTE FOR UX]` Round Result and Showdown may merge into one continuous beat in build if the two-screen split feels slow — confirm in a mock.
- `[ASSUMPTION]` Eliminated-as-spectator (keeps receiving Waiting/Showdown views — see Flow 5) rather than a "you're out" rest screen; confirm in playtest that spectating beats a simpler dead-end.
