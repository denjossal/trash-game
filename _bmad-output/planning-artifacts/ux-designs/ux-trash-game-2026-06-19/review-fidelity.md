---
title: UX Fidelity Review — Trash
type: fidelity-review
status: draft
created: 2026-06-19
reviewer: fidelity check (PRD → DESIGN.md + EXPERIENCE.md)
sources:
  - prds/prd-trash-game-2026-06-19/prd.md
  - ux-designs/ux-trash-game-2026-06-19/DESIGN.md
  - ux-designs/ux-trash-game-2026-06-19/EXPERIENCE.md
---

# UX Fidelity Review — Trash

**Verdict:** The spines faithfully honor the PRD's load-bearing decisions (eyes-up restraint, two-button discipline, King social-only, privacy model, both design gates, named-protagonist journeys, manifest rejection); the gaps are two omitted-but-not-contradicted rules (Host-starts-first-round, no-mid-game-join) and one underspecified beat (FX-deferred-to-v1.1 not stated), none of which are contradictions.

Severity legend: **BLOCKER** (contradicts PRD / regression) · **HIGH** (load-bearing decision missing) · **MEDIUM** (rule gap or drift, low risk) · **LOW** (polish / tension) · **OK** (confirmed honored).

---

## 1. Eyes-up principle (PRD §10)

- **OK** — EXPERIENCE Foundation + IA express restraint as "fewer elements on screen, not muted color"; Waiting is "the calmest surface — no Card, nothing to scroll, no motion"; no persistent navigation ("the game flow *is* the navigation"); explicit Banned list (feeds, chat, push, badges, streaks, idle/ambient animation, scrolling). DESIGN Do's/Don'ts reinforce. No surface pulls eyes down between Turns. This is the strongest-honored spine.

- **LOW — drift / internal tension.**
  - **Location:** DESIGN.md → Components → Turn Indicator ("It must pulse slowly to indicate 'Active Turn' status") vs. EXPERIENCE.md → Interaction Primitives ("Showdown is the only place motion is loud — everywhere else, motion is minimal") and Do's/Don'ts "Animate or pulse the calm Waiting screen — it should stay quiet."
  - **Issue:** A *slow pulse* on the Your-Turn frame is defensible (it's a wayfinding cue for the active player, not idle/ambient content), but DESIGN states the indicator "must pulse" without scoping it to Your Turn vs. Waiting, leaving a reader free to pulse the turn name on the Waiting surface too — which the Don'ts forbid.
  - **Fix:** In DESIGN Turn Indicator, scope the pulse explicitly to the **active player's own viewport frame on Your Turn**; state the Waiting turn-name is static. EXPERIENCE already implies this; make the two agree.

## 2. Two-button turn + Last Player 3rd button (PRD FR-6, FR-7)

- **OK** — EXPERIENCE State Patterns: "Your turn → SWAP + KEEP; peek control. Nothing else." The Last Player third option is correctly isolated: State Patterns "Last Player → Adds a third option: **Draw from deck** … Only for the Last Player (PRD FR-7)." The two-button discipline is preserved for everyone else; Host controls are kept off Your Turn entirely (see §6 below).

- **LOW — confirm only.**
  - **Location:** EXPERIENCE.md → Open items: "`[ASSUMPTION]` 'Draw from deck' … exact placement to confirm against a rendered mock."
  - **Issue:** Not a fidelity problem — correctly flagged as an open layout detail. Ensure the third button reads as clearly subordinate so the Last Player's screen doesn't feel like "three co-equal buttons" (which would dent the two-button mental model the Reluctant Player relies on).
  - **Fix:** When the mock lands, render Draw-from-deck visually subordinate to SWAP/KEEP (e.g., secondary style) and only for that seat. No spec change needed now.

## 3. Privacy / King social-only (PRD FR-8, §11.1)

- **OK (no regression)** — EXPERIENCE explicitly shows **NO King logic**: Voice/Tone table "King at the table → (nothing — the app stays out of it) / Don't: Any on-screen King 'block' message"; Flow 2 Edge "That's social; the app shows nothing about it." There is no on-screen King block anywhere — the FR-8 regression risk is clean.
- **OK** — Peek is press-and-hold with auto-hide on release **and** on focus-loss **and** on app-background (EXPERIENCE Interaction Primitives), exceeding the PRD's "phone set down doesn't expose a hand" bar. Card hidden by default (DESIGN Cards "Hidden (default) state"). No card shown to non-owners until Showdown (Card display component; FR-9 honored). Screen-reader note ensures the peeked rank "never persists in the accessibility tree when hidden" — a privacy detail the PRD didn't even ask for.

## 4. Both design gates — Host & Reluctant Player

- **OK** — Foundation names both as "the two load-bearing roles [that] drive every decision." Host gate served by Home→Lobby→Deal flow (Flow 1, fast start) and the conductor bar / Host Controls overlay (Flow 4). Reluctant Player gate served by the two-button Your Turn + warm plainspoken microcopy ("Abuela and the nine-year-old"). IA routes each Player to exactly one context automatically — no menu-hunting. Both gates honored.

## 5. Two co-equal beats — squirm (Swap) & simultaneous reveal (Showdown); FX deferral

- **OK** — Showdown is explicitly "the loud beat" (IA), is the only place loud motion is allowed (Interaction Primitives), and gets the error-ramp loser highlight + warm tease copy. The squirm is carried by Swap with no confirm ("speed matters") and the grimace beat in Flow 2.

- **MEDIUM — gap: FX-deferred-to-v1.1 is never stated in either spine.**
  - **Location:** PRD §6.2 + SM-3 note (produced comedy FX = animation+sound on the Loser's phone, deferred to v1.1; the MVP reveal is deliberately "minimal but real, not sterile"). EXPERIENCE.md → State Patterns "Showdown" and Flow 3 step 4 describe "the round's biggest moment" / "the table erupts" but never scope what is MVP vs. v1.1.
  - **Issue:** Neither spine tells the builder that produced FX (sound + comedy animation on the loser's device) is **out of MVP**. Risk runs both ways: a builder could over-build the FX (violating "de-risk the plumbing first"), or could under-build the MVP reveal into something sterile (violating "minimal but real"). The PRD treats this boundary as load-bearing (it's why SM-3 is partially deferred).
  - **Fix:** Add one line to EXPERIENCE Showdown state (or Open items) explicitly: "MVP Showdown = simultaneous flip + computed loser highlight + warm tease copy. Produced comedy FX (sound + loser-phone animation) is **v1.1 (PRD §6.2)** — do not build in MVP, but the MVP reveal must still feel playful, not clinical."

## 6. Game-rules accuracy

Verified each PRD rule against the spines:

- **OK — Swap = EXCHANGE (not one-way):** EXPERIENCE Flow 2 "His Card and his right-hand neighbor's exchange"; Swap/Keep buttons map to PRD verbs. Matches FR-6 / Glossary.
- **OK — Ace lowest / King highest:** DESIGN Cards "Ace reads as A and is the lowest; King K is the highest." Matches FR-10.
- **OK — Ties = all lose:** EXPERIENCE All-tied state "Every Card same value → all highlighted; 'everybody drops a life'"; Tie copy. Matches FR-10/FR-11.
- **OK — Loser starts next Round:** EXPERIENCE Round result "Next Round's Starting Player = this Round's Loser (PRD FR-5/FR-12)."
- **OK — Lives 1-5 default 3:** DESIGN Lives stepper "Host picks 1–5; default 3."
- **OK — 2-20 Players incl. heads-up:** EXPERIENCE Flow 3 "any size 2–20"; empty-lobby Deal disabled until ≥2.
- **OK — App computes Loser (no eyeballing):** stated repeatedly (DESIGN Cards "computed, never left to human scanning"; EXPERIENCE Flow 3).
- **OK — Host controls FR-14 present and kept OFF the turn screen:** IA Host Controls overlay "deliberately never reachable from Your Turn"; conductor bar "Hidden entirely … on Your Turn"; Flow 4 covers change Lives / remove Player / reassign Host. Honored precisely.
- **OK — No reconnection:** EXPERIENCE Player-disconnected state "no reconnection in MVP — PRD §6.2."

- **HIGH — gap: Host-starts-the-FIRST-Round is omitted.**
  - **Location:** PRD FR-5 / Glossary Starting Player ("the Host on the first Round of a game, then the previous Round's Loser"). EXPERIENCE.md → Round result only states "Next Round's Starting Player = this Round's Loser." No surface or flow states who starts the very first Round.
  - **Issue:** The spine states only the steady-state rule and silently drops the first-Round special case. Not a contradiction, but a load-bearing rule the builder needs (and Flow 1 ends at "Deal" without naming who takes the first Turn). Without it, the first-round starting seat is undefined in the UX.
  - **Fix:** In EXPERIENCE (Flow 1 climax or a State Patterns row), add: "First Round of a game: the **Host** is the Starting Player (PRD FR-5); every Round after, the previous Round's Loser starts."

- **MEDIUM — gap: "no joining a game already in progress" (FR-3) not stated.**
  - **Location:** PRD FR-3 / §6.2 (late join allowed only at the lobby up to the first Deal; no mid-game join). EXPERIENCE.md → IA Lobby ("roster fills live") and State Patterns describe joining, but never state the **cutoff** (no join after first Deal / no join to a game in progress).
  - **Issue:** A builder reading the spine could allow a Join attempt to land in a running Table. The PRD makes this an explicit non-goal and a constraint behind stable-identity design.
  - **Fix:** Add a Home/Join state row: "Joining a code whose Table is already in a Round → warm 'this table's already playing — catch the next game' message; no mid-game join (PRD FR-3 / §6.2)." Or note the lobby join cutoff at first Deal in the Lobby surface.

- **LOW — minor: zero-survivors shared-win case not surfaced.**
  - **Location:** PRD FR-12 (all remaining Players eliminated in one Showdown → share the win). EXPERIENCE Winner state covers "one Player left" only.
  - **Issue:** The PRD-tagged ASSUMPTION (shared win) has no UX treatment. Low risk (rare edge), but the Winner surface should not break when >1 winner.
  - **Fix:** Note that the Winner surface must handle a **shared win** (multiple names) per FR-12.

- **LOW — minor: auto Deck scaling (FR-13) invisible by design — confirm.**
  - **Location:** PRD FR-13 ("the Host never thinks about it"; not surfaced as a setting). Neither spine mentions it.
  - **Issue:** Correct to keep it invisible. The only UX consequence — more frequent ties at large tables — is already handled by the All-tied state. No action needed; noted for completeness.

## 7. Journeys mirrored as named flows

- **OK** — UJ-1 Marisol → Flow 1 ("Start the table (Marisol, the Host…)"), UJ-2 Tío Beto → Flow 2 ("Take a turn without help (Tío Beto…)"), UJ-3 the table → Flow 3 ("The showdown (the whole table, any size 2–20)"). Named protagonists preserved verbatim; each flow tags the PRD UJ it realizes. Flow 4 additionally realizes FR-14. Edge cases (mistyped code, King decline) carried into the flows.

## 8. Manifest / tone

- **OK (spines reject it)** — DESIGN Brand & Style: "Never 'high-stakes,' never 'underground,' never mean … (including the generated manifest copy) … explicitly rejected." EXPERIENCE Voice/Tone: "The generated manifest description ('a high-stakes underground card gathering') is **rejected**; corrected at finalize." Both spines correctly reject the Stitch manifest framing.

- **MEDIUM — open action: the manifest.json file itself still needs fixing at finalize.**
  - **Location:** EXPERIENCE Foundation ("served as a PWA (manifest + icons already produced)") + Voice/Tone ("corrected at finalize").
  - **Issue:** The spines *say* the manifest copy is rejected and will be "corrected at finalize," but the underlying `manifest.json` artifact still contains the "high-stakes underground" description — the correction is deferred to the finalize step and is not yet done. This is a tracked-but-open item, not a spine defect.
  - **Fix:** At finalize, edit the PWA `manifest.json` `description` (and any `name`/`short_name` carrying the framing) to the warm positioning. Confirm this is on the finalize checklist so it isn't lost; the spines correctly own the *intent*, the artifact still needs the *edit*.

---

## Summary table

| # | Area | Severity | One-line |
|---|------|----------|----------|
| 6 | Starting Player | **HIGH** | Host-starts-first-Round rule (FR-5) omitted; only steady-state Loser-starts is stated. |
| 5 | Showdown FX | **MEDIUM** | FX deferral to v1.1 (§6.2) never stated — over/under-build risk on the loud beat. |
| 6 | Mid-game join | **MEDIUM** | "No joining a game in progress" (FR-3) cutoff not stated on Join/Lobby. |
| 8 | Manifest file | **MEDIUM** | Spines reject the copy; `manifest.json` artifact still needs the actual edit at finalize. |
| 1 | Turn-indicator pulse | **LOW** | DESIGN "must pulse" not scoped to Your Turn; could conflict with "keep Waiting quiet." |
| 6 | Shared win | **LOW** | Zero-survivors shared-win (FR-12) has no Winner-surface treatment. |

No BLOCKERs. No contradictions of PRD load-bearing decisions. The privacy/King/eyes-up/two-button core is honored cleanly.
