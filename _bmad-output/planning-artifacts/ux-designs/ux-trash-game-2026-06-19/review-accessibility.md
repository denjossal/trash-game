---
title: Accessibility & Legibility Review — Trash ("Electric Social")
status: draft
reviewer: a11y/legibility review
date: 2026-06-19
scope: DESIGN.md + EXPERIENCE.md against prd.md
audience: 2–20 people at one table, dim light, arm's length, includes older adults & kids, dark-mode only
---

# Accessibility & Legibility Review — Trash

Headline a11y goal under evaluation: **legibility across a table at arm's length, in dim light, for Abuela and a 9-year-old.** Contrast ratios below were computed with the WCAG 2.x relative-luminance formula from the literal hex tokens in `DESIGN.md` frontmatter.

## Summary verdict

The core text and button system is genuinely strong — the primary surfaces clear WCAG AA with large margins, and the color-independence story (suit by shape, loser by stroke+scale, turn by frame+name) is specified consistently across all three docs. The privacy-on-screen model is sound. The real gaps are at the edges: a few UI-chrome tokens fall below the 3:1 line, several "implied" combos are never specified as tokens (the spec just asserts AA), and the spec is missing protections this *specific* audience needs — the showdown's "loud" motion + the error-red flash for motion-sensitive/older players, and the absence of any photosensitive-flash ceiling on the simultaneous reveal.

---

## CRITICAL

_None._ No combination in the shipped spec puts primary readable content below threshold, and the one hard integrity rule (secret card) is handled coherently. Nothing here will block a playtest. (Items below should still be settled before build.)

---

## HIGH

### H-1. Spent-life pips fail contrast and lean on color/fill alone
- **Location:** `DESIGN.md` → Components → Lives Indicator ("hollow = lost, using `secondary` for remaining and `outline-variant` for spent"). Token `outline-variant` = `#514255`.
- **Issue:** `outline-variant #514255` on `surface #1a0b2e` is **2.00:1** — below the 3:1 minimum for UI components / graphical objects. A spent (hollow) pip will be nearly invisible across a table in dim light, which is exactly the glance the audience makes to read "how many lives do I have left?" The distinction between remaining and spent then rests almost entirely on the mint fill being present vs. absent — a near-invisible outline is not a reliable second channel. The spec's own rule ("never a bare number alone — the count must be glanceable") is undercut by a non-glanceable spent state.
- **Fix:** Use a token ≥3:1 for the spent-pip stroke (e.g. `outline #9d8ba0` = 5.86:1, or `on-surface-variant #d4c0d7` = 10.9:1). Additionally distinguish remaining vs. spent by **shape**, not just fill — e.g. filled solid disc (remaining) vs. a clearly hollow ring with a visible gap or an inset dot — so the indicator survives both low contrast and color-blindness. Consider pairing with a small numeral for tables where pip rows get long.

### H-2. The showdown's "loud" motion + error-red has no protection for motion-sensitive or older players beyond Reduce Motion
- **Location:** `EXPERIENCE.md` → Interaction Primitives ("Showdown is the only place motion is loud — the simultaneous flip + loser highlight"), State Patterns → Showdown, Accessibility Floor → Reduce Motion; `DESIGN.md` → Turn Indicator ("must pulse slowly"), Cards → Loser highlight ("gentle scale-up").
- **Issue:** Reduce Motion is specified (good) but it is an **OS-level opt-in that most casual party users — especially Abuela and kids on a borrowed/again-handed phone — will never have set.** The default experience for everyone else is a full-table simultaneous flip animation plus a scaling, error-red-framed loser card. For this audience (older adults, motion-sensitivity, vestibular triggers) the default beat itself needs to be safe, not just the opt-out path. Also note "Turn Indicator must pulse slowly" is the *one* always-on animation, and the spec doesn't say it respects Reduce Motion (the Reduce Motion clause only names the showdown flip and the press scale).
- **Fix:** (1) Cap the default flip: short duration, no large translation/zoom, ease-out; specify the actual values rather than "loud." (2) Make the loser highlight reach its final state quickly and then hold static — avoid a looping/throbbing red. (3) Explicitly extend Reduce Motion to the **turn-frame pulse** (when reduced: a static thick frame, no pulsing) and the lives-pip update animation. (4) State that the showdown is fully legible as a *static* frame so the animation is pure garnish.

### H-3. No photosensitive-flash ceiling on the simultaneous reveal
- **Location:** `EXPERIENCE.md` → Flow 3 / State Patterns → Showdown ("Every device flips its Card face-up at the same moment"), `DESIGN.md` → Showdown loser highlight on saturated neon palette.
- **Issue:** The whole product is high-saturation neon on a dark base, and the deliberately "loud" beat flips up-to-20 cards at once and slams in a saturated red highlight. There is no stated constraint against flashing/strobe. WCAG 2.3.1 (and the general "three flashes per second" rule) matters for kids and anyone photosensitive in the room. A single clean flip is fine; the risk is if "loud" is later interpreted as a flashing/pulsing reveal sequence.
- **Fix:** Add an explicit rule: **no element flashes more than 3×/second; no full-screen flash; the reveal is a single transition, not a strobe.** Avoid rapid alternation between bright neon and dark surface during the reveal.

### H-4. Several load-bearing combos are asserted-AA but never pinned to tokens
- **Location:** `DESIGN.md` repeatedly asserts "All text-on-background combinations must maintain WCAG AA" and `EXPERIENCE.md` Accessibility Floor defers contrast to DESIGN.md, but specific component text colors are left implicit (e.g., Turn Indicator header text color, Room Code letter color on `surface-container-high`, eliminated/spectator dimmed text, disconnected "dimmed" roster rows, the on-surface-variant body color, inert 10%-white borders).
- **Issue:** "Dimmed" states (disconnected player rows, eliminated spectator, non-losing cards at "reduced opacity") are the most likely AA failures because dimming *lowers* contrast by design, and none specify a floor. "Non-losing cards recede (reduced opacity)" at showdown could push their rank below 4.5:1 — and a spectator/eliminated player still needs to *read* those cards. The inert 2px white-at-10%-opacity border (`DESIGN.md` Elevation §4) computes to ~1.0:1 and is decorative-only, which is fine, but it must never be the sole boundary of an interactive control.
- **Fix:** Pin a token to every text role and add a hard rule: **no dimmed/disabled/receded text may drop below 4.5:1 (3:1 for large rank glyphs).** Cap "reduced opacity" so receded showdown cards stay ≥4.5:1; the loser highlight should do the work via the *highlight*, not by making everyone else unreadable. Confirm Turn Indicator and Room Code text tokens explicitly (the obvious choices `on-surface #eddcff` at 11–14:1 are safe).

---

## MEDIUM

### M-1. `outline #9d8ba0` passes but is the floor — verify every UI border that relies on it
- **Location:** `DESIGN.md` → `outline #9d8ba0`, Inputs ("thick 3px borders"), Elevation.
- **Issue:** `outline` on `surface` is **5.86:1** — comfortably above 3:1, good. But if outline is ever used on a *lighter* container (`surface-container-highest #3d2e52`, `surface-bright #413257`) the ratio drops. On `#3d2e52` it is ~3.6:1 (ok); thinner/lighter combinations could slip.
- **Fix:** Restrict `outline` to use on the darker surfaces, or verify ≥3:1 per container it's drawn on. Keep input borders thick (the spec already says 3px), which helps perceptibility independent of contrast.

### M-2. Tap-target size is stated as ≥48dp but two cases need an explicit minimum
- **Location:** `DESIGN.md` → primary buttons (min 72px — excellent), List Items (min 80px — excellent); but the **peek control** (`EXPERIENCE.md` press-and-hold), the **Room Code join slots** (4 letter-slots), the **Lives stepper +/−**, and the **Host Controls "remove player"** affordance and the **conductor-bar entry** are not given sizes.
- **Issue:** The press-and-hold peek target is the single most-used gesture and must be large and obvious for the reluctant player; small +/− steppers and per-row "remove" icons are classic sub-48dp offenders. For kids and older adults the bar should arguably be higher than 48dp.
- **Fix:** State ≥48dp (recommend ≥56–64dp for this audience) for *every* interactive element including peek, stepper, join slots, and host-controls affordances. The 4 join slots should each be ≥48dp wide.

### M-3. Thumb-zone rule is one line at the bottom of the floor and conflicts with "Turn Indicator as full-width header bar"
- **Location:** `EXPERIENCE.md` → Accessibility Floor "One-handed reach: primary actions sit in the lower half (thumb zone)"; `DESIGN.md` → Turn Indicator "A full-width header bar **or** a thick frame around the entire viewport."
- **Issue:** The reach rule is sound but under-specified for a 2–20-person, any-hand-size, any-phone-size context. Also, if the turn indicator is implemented as a top header bar, it competes for the top zone while Swap/Keep sit at the bottom — fine — but the "Draw from deck" third button for the Last Player (`EXPERIENCE.md` open item) has unconfirmed placement and could push a primary action out of the thumb zone or create a 3-button row that's hard to hit one-handed.
- **Fix:** Specify that all of Swap / Keep / (Draw) live in the lower 50% with generous spacing; confirm the 3-button Last-Player layout keeps each target ≥48dp and reachable. Prefer the framed-viewport turn indicator over a top bar so it doesn't claim interactive real estate.

### M-4. Screen-reader announcement of the peek rank needs an explicit, owner-only mechanism — and a non-visual peek path
- **Location:** `EXPERIENCE.md` → Accessibility Floor "The peek control announces its rank only to the owner's device (and never persists in the accessibility tree when hidden)."
- **Issue:** The accessibility-tree handling is **sound and correct**: removing the rank from the a11y tree when hidden mirrors the visual hide, prevents a leak to a screen reader walking the tree, and matches the privacy rule (FR-6 / §11). No conflict there. The real gap: a blind/low-vision owner peeks via **press-and-hold** — but a VoiceOver/TalkBack user's gestures are intercepted by the screen reader, so a raw press-and-hold may not register, and "release to hide" has no SR equivalent. The card value must reach the owner non-visually without persisting.
- **Fix:** Specify the SR path explicitly: e.g., the peek control is a button labeled "Peek your card"; activating it announces the rank once via a polite live region and the value is NOT written into a persistent node — it is announced and discarded, re-announced on each activation. Define the SR "hide" as automatic (value never stored in the tree), so there is no release gesture to emulate. Confirm the value is still never sent to other devices (it isn't — it's owner-device only).

### M-5. Color-independence is specified consistently — but confirm the loser's "position" channel and the all-tied case
- **Location:** `DESIGN.md` → Cards (suit by shape; loser by error ramp + thick stroke + gentle scale-up + non-losers recede); `EXPERIENCE.md` → Accessibility Floor ("Loser conveyed by stroke + scale + position, not color alone").
- **Issue:** This is well-specified and consistent across docs — credit where due. Two checks: (1) `EXPERIENCE.md` lists **"position"** as a loser channel, but `DESIGN.md` does not describe any positional treatment — reconcile (is the loser repositioned/centered, or is "position" a mistaken claim?). (2) In the **all-tied** case (FR-10, common at 2-deck tables) *every* card is highlighted in error-red and scaled — so the differentiating channels collapse; "everyone loses" must be carried by **copy + lives-pip updates**, not the highlight (since highlighting all = highlighting none).
- **Fix:** Either implement the positional channel in DESIGN.md or drop "position" from the floor so the two docs agree. For all-tied, rely on the explicit copy ("everybody drops a life") and the pip animation as the primary signal, and confirm a uniformly-red board still reads as "everyone" not "error/broken."

### M-6. Suit pips: shape-only differentiation must survive small reds-vs-darks at table distance
- **Location:** `DESIGN.md` → Cards "Reds (♥♦) and darks (♠♣) distinguished by shape, not color reliance."
- **Issue:** Correctly color-independent. But ♥/♦ and ♠/♣ are silhouette-similar at distance to older eyes; suit is decorative (never affects loss, per FR-10/FR-8) so this is low-stakes — yet the spec leans on shape for an attribute it then says doesn't matter. The risk is only legibility/charm, not correctness.
- **Fix:** Since suit is purely decorative, ensure the **rank** (Display-XL) is the dominant, unmistakable element and the pip is clearly secondary; don't let a hard-to-distinguish pip imply game meaning. Confirm pips render at a size legible across the table or accept they're ornamental.

---

## LOW

### L-1. Focus order is specified for Your Turn but not the multi-element surfaces
- **Location:** `EXPERIENCE.md` → Accessibility Floor "Focus order follows reading order... Swap/Keep are the first two focus stops on Your Turn."
- **Issue:** Good for the critical surface. Lobby (roster + room code + lives stepper + deal), Host Controls overlay (lives, remove-per-row, reassign, close), and Showdown (many cards) have no stated order, and the Host Controls **overlay** needs a focus trap + restore-focus-on-close, which isn't mentioned.
- **Fix:** Specify reading-order focus for each surface; for the overlay, add focus-trap-while-open and return focus to the conductor affordance on close; the loser card should receive focus (or an SR announcement) at Showdown.

### L-2. "Your turn" SR announcement and routing transitions need a politeness/duplication rule
- **Location:** `EXPERIENCE.md` → Accessibility Floor "The turn indicator announces 'Your turn' on transition."
- **Issue:** Good. But the app auto-routes between surfaces (Waiting → Your Turn → Showdown) with no user action; abrupt SR context changes can be disorienting and double-announce. Showdown routes "all devices at once" — needs an announcement too (loser result), and the eliminated/spectator transition needs a non-punishing SR string matching the warm copy.
- **Fix:** Define assertive vs. polite live regions per transition; announce Showdown result and lives change; reuse the warm copy verbatim for SR ("You're out — stick around and heckle") so SR users get the same tone.

### L-3. Tertiary electric-yellow text on dark is fine for large/UI but verify if ever used as small body
- **Location:** `DESIGN.md` → `tertiary #d0cc05` ("critical warnings or secondary highlights").
- **Issue:** `tertiary #d0cc05` on `surface #1a0b2e` computes to a very high ratio against dark, so it passes — but the spec doesn't bound *where* yellow text appears. As long as it's on the dark surface it's safe; on a light/mint container it would fail.
- **Fix:** Keep yellow on the dark surface only; if used on mint/violet containers, switch to its paired `on-tertiary` token.

### L-4. Dim-light assumption vs. neon — consider an "across the table" type-size floor, not just contrast
- **Location:** `DESIGN.md` Typography (`body-md` 16px / weight 500), the smallest defined text.
- **Issue:** Contrast is excellent, but legibility *at arm's length across a table* is also a **size** problem. 16px body at 0.5–1m for older eyes is small. The audience bar is "Abuela reads it from across the table," not "Abuela reads it holding the phone."
- **Fix:** Confirm 16px is only for the player's own close-held UI; anything meant to be read across the table (room code, whose-turn name, loser name) should use display/headline scales. The Room Code (Display-LG) and rank (Display-XL) already do this well — extend the principle to the active-player name on Waiting.

---

## What's working (so the build doesn't "fix" it)

- **Computed contrast on primary content is excellent:** on-surface text `#eddcff`/`#1a0b2e` = **14.4:1**; on-surface-variant = 10.9:1; primary-button black-on-mint = **16.3:1**; secondary violet text on dark = 10.9:1; error text on dark = 10.9:1; turn-frame mint on dark = 14.4:1.
- **The four frontmatter combos the brief flagged all PASS:** on-primary `#520071`/primary `#ecb2ff` = 7.75:1; on-primary-container `#ffffff`/primary-container `#bd00ff` = **4.56:1** (just clears 4.5:1 — keep text large/bold here, no thin weights); on-secondary-container `#007255`/secondary-container `#36ffc4` = **4.60:1** (also a thin pass — bold only); on-surface/surface = 14.4:1. Note: the two ~4.5:1 passes are *tight*; do not render small or sub-500-weight text in those pairs.
- **Critical anti-pattern correctly forbidden:** plain white text on mint (`#ffffff`/`#36ffc4`) is **1.29:1** — and `DESIGN.md` correctly specifies **black** text on the mint primary button, avoiding exactly this trap.
- **Color independence is specified consistently** across DESIGN.md and EXPERIENCE.md and PRD (suit by shape, loser by stroke+scale, turn by frame+name) — no surface relies on color as the sole carrier (with the H-1 lives-pip caveat).
- **Privacy-on-screen model is sound:** hidden-by-default, peek = press-and-hold, auto-hide on release/blur/background, and rank removed from the a11y tree when hidden — this matches FR-6 and §11 and does not conflict with SR needs once M-4's owner-only announcement path is specified.
- **Reduce Motion and ≥48dp are present**; the discipline of "fewer elements" inherently aids legibility and cognitive load for the reluctant player.
