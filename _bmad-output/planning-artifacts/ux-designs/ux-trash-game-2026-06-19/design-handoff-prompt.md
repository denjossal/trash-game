# Trash — Design Handoff Prompt

**How to use this:** Paste the prompt block below into your external design tool — default target is **Google Stitch** (https://stitch.withgoogle.com), which emits a `DESIGN.md` plus per-screen HTML. It also works in v0, Galileo, Figma AI, or any "describe-an-app, get-screens" generator. Save whatever the tool produces (DESIGN.md, HTML, images, Figma link) back into this workspace folder (`ux-designs/ux-trash-game-2026-06-19/` — drop visual outputs in `imports/`). When you've got visuals you like, come back and run `bmad-ux` again in **Update** mode and I'll write `EXPERIENCE.md` against them and reconcile both spines.

**Note on directions:** You haven't locked a visual personality yet — on purpose. The prompt asks the tool to generate **3 distinct directions** so you decide by looking, not by label. Pick one (or mix), then we proceed.

---

## PROMPT (paste this)

> I'm designing a mobile web app called **Trash** — a real-time party card game played by a group of people **physically sitting together at the same table**, each on their own phone (no app download, no accounts, they join with a 4-letter room code). The phone is just the dealer and scorekeeper; the real game happens between people at the table.
>
> **The single most important design principle: "eyes up, not down."** The screen must *recede*. A player should glance at their phone for about 10 seconds per round and spend the rest of the time looking at the people around them, laughing. Do **less** on screen, on purpose. This is the opposite of an engagement-maximizing app — no feeds, no chat, no idle content, nothing that pulls a person down into their screen between turns. The discipline of restraint is the whole point.
>
> **Two people must never be confused:** (1) the **Host**, who needs to start a game in seconds and conduct the table; (2) the **reluctant player** — picture a grandmother or a kid who "doesn't do phone games" — who must be able to take their turn with zero confusion. On their turn, the screen is **exactly two enormous buttons** and nothing else.
>
> **Platform & scheme:** Mobile web, **portrait**, phone-only (every player including the Host is on a phone — there is no shared TV screen). **Dark mode is the default** (these games happen in dim living rooms and backyards at night; the screen shouldn't be a glowing beacon). Buttons and key text must be **readable at arm's length across a table**, in poor lighting, by older eyes — large type, high contrast, generous tap targets.
>
> **Tone:** good-natured and playful, never mean. There's comedy when someone loses, but it's warm teasing, not punishment.
>
> **Cards:** show a playing card as a **big rank + suit pip** (huge "A", "7", "K" with a clear ♠♥♦♣), simplified and modern — instantly readable across a table, not photo-realistic and not a tiny corner index. Ace is the lowest card, King the highest.
>
> **Please generate THREE distinct visual directions** for me to choose between, each as a complete dark-mode design system + the key screens listed below:
>
> 1. **Bold Playful Party** — saturated high-energy color, big chunky rounded shapes, friendly oversized buttons; feels like a party, reads instantly across a room.
> 2. **Clean Minimal** — mostly quiet dark surfaces, one or two restrained accent colors, lots of negative space; the app almost disappears so the table is the show.
> 3. **Warm Tactile Card-Table** — evokes a real card table: deep felt-green or warm wood tones, subtly card-like surfaces, a homey physical-game feeling without skeuomorphic clutter.
>
> For each direction, define: a dark color palette (named tokens), type scale (large and legible), corner-rounding, spacing scale, and the core components (big primary buttons, the card display, a turn indicator, a lives/score indicator, the room-code display).
>
> **Screens to design (per direction, or at least for the chosen one):**
>
> *Core loop:*
> 1. **Home** — create a table, or join with a room code. Near-zero friction; the two paths obvious.
> 2. **Lobby** — the room code shown big (4 uppercase letters), the roster of players who've joined filling in live, and a Host-only control to set starting lives (1–5) and a big **Deal** button. Non-hosts see "waiting for host."
> 3. **Your Turn** — the hero screen. Two giant buttons: **SWAP** (exchange your card with the player to your right) and **KEEP**. Plus a way to peek at your own secret card. Nothing else competes.
> 4. **Waiting** — what a player sees when it's *not* their turn: only **whose turn it is** (a name), calm and nearly empty. No card values, nothing to scroll. This is where "eyes up" is won.
> 5. **Showdown** — the loud moment. All cards reveal at once; the app computes and **clearly highlights the lowest card / the loser(s)**. Must work whether there are 3 cards or 20. The losing player's screen should feel the moment (playful, not cruel). Ties highlight everyone tied.
> 6. **Eliminated / Winner** — a player who's lost all their lives; and the last-player-standing winner screen.
>
> *Host conductor controls:*
> 7. **Host controls** — Host-only conductor surface: trigger Deal / trigger Showdown / one-tap Re-deal; and a small mid-session panel to change lives, remove a player, and hand off the host role. These must stay **off** a player's turn screen so they never clutter the two-button experience.
>
> *Peek/hide interaction:*
> 8. **Peek card** — show the secret-card state: the card is **hidden by default**; the player **holds/presses** to peek at their own card and it **auto-hides** when released (so a phone set down never exposes a hand to the neighbor leaning over). Show both the hidden and the peeking state.
>
> *Error / edge states:*
> 9. **Edge states** — invalid/expired room code; a player disconnected mid-game; an empty lobby (no one's joined yet); and the all-tied showdown (everyone holds the same value, everyone loses a life).
>
> Keep every non-showdown screen calm and sparse. Reserve visual energy and motion for the **showdown reveal** — that's the one beat allowed to be loud. Optimize relentlessly for legibility across a table and for a confused first-time player understanding their turn in under two seconds.

---

## Constraints the chosen design MUST honor (carry these into review)

These come from the PRD (`prds/prd-trash-game-2026-06-19/prd.md`) and are non-negotiable regardless of which direction wins:

- **Eyes-up / restraint.** No feeds, chat, ads, badges, idle content, or dwell-maximizing animation between turns. Inactive screens show only whose turn it is.
- **Two-button turn.** The active player's turn screen is Swap + Keep + peek/hide, and nothing else. Reluctant player must understand it instantly.
- **Privacy in the physical room.** Card hidden by default; peek is an explicit hold; auto-re-hide on release. The visual must never persistently display a player's card. (The network-privacy rule is an architecture concern, but the *screen* must not betray a card either.)
- **Legibility across a table** in dim light, for older eyes: large type, high contrast (meet WCAG AA against the dark surface), big tap targets (≥ 48dp).
- **Showdown scales to 20 cards.** The loser highlight must be computed and unmistakable at large tables, not reliant on a human scanning 20 cards.
- **Comedy is warm, not cruel.** The loser moment teases; it doesn't punish.
- **Comedy FX is deferred (v1.1).** The MVP showdown is a clean simultaneous flip + clear loser highlight — "minimal but real." Don't over-invest the handoff in produced animation/sound; design the beat so FX can drop in later.

## What happens next

1. Run the prompt; save outputs into this folder (`imports/` for visuals, or let the tool emit `DESIGN.md` here).
2. Pick a direction (or tell me to mix elements).
3. Re-run `bmad-ux` (Update mode). I'll: distill the chosen visuals into `DESIGN.md`, author `EXPERIENCE.md` (IA, states, interactions, accessibility, the key flows with Marisol/Tío Beto as protagonists), reconcile against the PRD, and finalize both spines.
