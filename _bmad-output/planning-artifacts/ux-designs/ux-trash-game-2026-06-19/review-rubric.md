# UX Spine Review — Trash Game (DESIGN.md + EXPERIENCE.md)

**Reviewed:** 2026-06-19
**Stakes:** Hobby/personal, but chain-top (feeds architecture + story creation).
**Verdict:** Both spines are substantive, internally coherent, and ~90% build-ready; a handful of cross-reference mismatches and three orphan-state gaps should be closed before downstream build, but nothing is fatal for hobby stakes.

Severity legend: **[BLOCKER]** would derail build · **[HIGH]** likely to cause rework · **[MED]** real gap, low blast radius · **[LOW]** polish/nit.

---

## 1. Coverage / Completeness

### DESIGN.md sections (Google Labs design.md contract)
All expected sections present and substantive: frontmatter tokens (colors/typography/rounded/spacing) ✓ (L7–107), Brand&Style (L109), Colors (L117), Typography (L128), Layout&Spacing (L136), Elevation&Depth (L144), Shapes (L153), Components (L159), Do's&Don'ts (L188). No furniture.

### EXPERIENCE.md sections
All expected sections present and substantive: Foundation (L13), IA (L19), Voice&Tone (L39), Component Patterns (L60), State Patterns (L76), Interaction Primitives (L96), Accessibility Floor (L104), Key Flows (L115). No furniture.

### Surface → State → Flow closure matrix
| Surface (EXP L23–33) | Has state coverage? | Appears in a flow? |
|---|---|---|
| Home | ✓ Cold open, Joining, Bad code (L79,80,92) | ✓ Flow 1 step 1, Flow 1 failure |
| Lobby | ✓ Empty, Filling (L81,82) | ✓ Flow 1 steps 2–4 |
| Your Turn | ✓ Your turn, Peeking, Last Player (L84,85,86) | ✓ Flow 2 |
| Waiting | ✓ Not your turn (L83) | ✓ Flow 2 step 1, Flow 4 step 1 |
| Showdown | ✓ Showdown, All-tied (L87,88) | ✓ Flow 3 |
| Round Result | ✓ Round result (L89) | ✓ Flow 3 step 5 |
| Eliminated | ✓ Eliminated (L90) | ✗ **No flow lands here** (see HIGH-1) |
| Winner | ✓ Winner (L91) | ~ Touched in Flow 3 step 5 ("If one Player remains → Winner") — thin but present |
| Host Controls | (overlay; treated via conductor states) | ✓ Flow 4 |

**Findings:**

- **[HIGH-1] Eliminated surface has no flow.** Location: EXP IA L32 + State L90; no Key Flow (L115–149) reaches Eliminated. Issue: an entire IA surface — and the one with the most novel behavior (spectator-but-can't-act, must keep receiving Showdown views) — is never walked end-to-end, and its own Open Item (L158) flags the spectator model as unconfirmed. This is exactly the surface most likely to be under-built. Fix: add a short Flow 5 ("get eliminated, become a heckler") or fold an elimination beat into Flow 3 step 5, showing the transition into and the steady state of Eliminated.

- **[MED-1] No flow exercises the multi-round loop / Starting Player = previous Loser.** Location: EXP L89 (FR-5/FR-12) states it; Flow 3 step 5 mentions Re-deal but no flow shows round N → round N+1 with the Loser starting. Issue: the single most game-defining rule (loser leads next round) is asserted in a state row but never demonstrated, so an engineer sees the rule but not the routing handoff. Fix: extend Flow 3 or add a one-line round-transition flow.

- **[MED-2] "Draw from deck" (Last Player third option) is stateful but visually unspecified.** Location: EXP L86 + Open Item L156; DESIGN Components Buttons (L161–163) defines only Primary/Secondary, no third-button layout for the 3-option Your Turn. Issue: Your Turn is the most-protected screen ("two huge buttons and nothing else," DESIGN L193) yet sometimes has three — and neither spine resolves how a third button coexists with that constraint. Open Item L156 admits placement is unconfirmed. Fix: DESIGN should specify the 3-button layout (or EXPERIENCE should commit a behavioral placement), since this is a build-time hard choice, not a mock-polish detail.

- **[LOW-1] "Host left / Reassign Host" state lists Surface = "any."** Location: EXP L94. Issue: "any" is not a real surface; the reassignment UI has no defined treatment or entry point (Host Controls is gone with the Host). Fix: name the surface (likely an auto-promoted overlay on the next non-turn surface) and define who triggers/sees it.

---

## 2. Cross-Reference Integrity (EXPERIENCE → DESIGN)

EXPERIENCE consistently defers visual ownership to DESIGN by name (L11, L62, L106) — good discipline. Checking each named reference resolves:

| EXP reference | Location | Resolves in DESIGN? |
|---|---|---|
| "neon active frame" / Turn Indicator | EXP L68, L84 | ✓ DESIGN L178–179 (Turn Indicator, 8px Secondary Neon Mint frame, pulses) |
| "error ramp" / "error-ramp highlight" | EXP L67, L87, L141 | ✓ DESIGN L170 (`error`/`error-container`, thick stroke + scale-up) |
| Display-LG (room code) | EXP L71 implied | ✓ DESIGN L176 (Room Code Display uses Display-LG); token `display-lg` L62 |
| Lives pips (filled/hollow) | EXP L70, L83 | ✓ DESIGN L172–173 (`secondary` filled / `outline-variant` spent) |
| Press scales to 95% | EXP L66 | ✓ DESIGN L162 |
| ≥48dp targets | EXP L108 | ~ DESIGN says "≥48dp" in Don'ts L197 but Primary button min-height is "72px" (L162) and list items "80px" (L186) — consistent, just unit-mixed (dp vs px), see LOW-2 |

**Findings:**

- **[MED-3] "Reduce Motion" / "auto-hide on app-background" behaviors have no visual or token anchor and aren't a DESIGN concern that DESIGN acknowledges.** Location: EXP L99 (auto-hide on background), L111 (Reduce Motion skips flip/scale). These are behavioral-only and correctly live in EXPERIENCE — not a defect, but note: DESIGN's only motion specs are "pulse slowly" (L179) and "scale to 95%" (L162); the showdown flip animation EXP references (L101, L111) is **never defined in DESIGN**. Issue: EXPERIENCE repeatedly cites "the showdown flip" as a concrete animation but DESIGN (which owns motion/depth) never specifies it (no duration, no easing, no flip mechanic). Fix: add a one-line Showdown flip spec to DESIGN Elevation&Depth or a Motion note, so "skip the flip" (Reduce Motion) has a defined thing to skip.

- **[LOW-2] dp vs px unit inconsistency.** Location: EXP L108 ("≥48dp"), DESIGN L197 ("≥48dp") vs DESIGN button/list heights in px (L162, L186) and spacing tokens in px (L100–106). Issue: cosmetic, but a builder must reconcile dp↔px. Fix: pick one (px, given the token system is px) and state the mapping once.

- **[LOW-3] "Huge Rank displays and scoreboards" (DESIGN L132) references a scoreboard surface that doesn't exist in EXPERIENCE's IA.** Issue: there is no scoreboard surface (Lives pips are the only scorekeeping, EXP L70). Minor orphan reference in DESIGN copy. Fix: drop "scoreboards" or map it to Round Result/Lives.

---

## 3. Decision-Readiness for Downstream Build

Strong overall: copy is specified verbatim (EXP Voice table L43–56), gestures are concrete (press-and-hold + release/blur/background, L99), routing is deterministic (engine routes by Table state + Turn, L21), and the loser highlight is explicitly "computed, never left to human scanning" (DESIGN L170, EXP L141). An engineer can build Home, Lobby, Waiting, Your Turn, Showdown, Round Result largely from these two docs.

**Findings:**

- **[HIGH-2] Host conductor affordance has no visual/placement spec and a routing contradiction risk.** Location: EXP L73 ("Host conductor bar," "Hosts the controls overlay entry," hidden on Your Turn), Flow 4 L147 ("taps the conductor affordance"). DESIGN has **no component** for the conductor bar/affordance (Components L159–186 omit it entirely). Issue: this is a Host-only, phase-aware, multi-surface control — the second-most-important interactive element after Swap/Keep — and DESIGN, the visual owner, never describes it. An engineer cannot place or style it. Fix: add a "Host Conductor" component to DESIGN with placement (e.g., bottom bar / FAB), and confirm it sits in the thumb zone without violating one-handed-reach (EXP L113).

- **[MED-4] "Big +/− or segmented control" for Lives stepper is an unresolved either/or.** Location: EXP L72; DESIGN Inputs&Toggles (L181–183) defines Input Fields and Switches but no stepper/segmented control. Issue: vague hand-waving ("or") on a real control with no DESIGN spec. Fix: pick one and add the stepper to DESIGN Components.

- **[MED-5] Winner surface treatment is thin.** Location: EXP L91 ("celebration; 'one more?' routes Host to a new game"); DESIGN gives Showdown the "loudest beat" (L194) but says nothing about Winner celebration visuals. Issue: "celebration" is the kind of vague word the rubric flags — no concrete treatment. Fix: one line in DESIGN or EXP on what the Winner celebration concretely is (and confirm it doesn't out-shout Showdown, which DESIGN reserves as the loudest moment, L115/L194 — potential tension).

- **[LOW-4] Player-disconnected: "table continues or restarts socially" is deliberately under-defined.** Location: EXP L93. Acceptable for hobby/MVP (no reconnection per PRD §6.2) and the visual ("dimmed roster row, no blocking modal") is concrete enough. No fix required; noting as intentional.

---

## 4. Substance Over Theater

No furniture sections detected in either spine. Claims are backed:
- "restraint = fewer elements, not muted color" recurs and is operationalized (two buttons; calm Waiting; banned list EXP L102). ✓
- Loser highlight is computed (DESIGN L170, EXP L141) — backed, not aspirational. ✓
- Accessibility Floor gives concrete numbers (≥48dp, AA, color-independence via shape/stroke/position, L108–113). ✓

**Findings:**

- **[LOW-5] "celebration" (Winner) and "the biggest moment" (Showdown, EXP L87) lean on adjective rather than spec.** Covered by MED-5 for Winner. Showdown is otherwise well-specified (simultaneous flip, error-ramp highlight, tease copy), so its adjective is backed. Fix: see MED-5.

---

## 5. Consistency Between the Two Spines

Generally tight. Both agree on: dark-only MVP, eyes-up, fewer-elements restraint, error-ramp loser, neon frame turn indicator, reject manifest copy, shape-not-color suits, peek-only card reveal. Conflict-resolution order is explicitly stated (EXP L11: DESIGN wins on visual conflict; both win over Stitch).

**Findings:**

- **[MED-6] Your Turn "two buttons and nothing else" vs the Last Player three-button state.** Location: DESIGN Do's L193 ("Two huge buttons (Swap / Keep) and nothing else on the active-turn screen") directly vs EXP L86 (Last Player gets a third "Draw from deck" button). Issue: a literal reading of DESIGN's Don't ("Crowd the turn screen") could be read to forbid the third button the PRD requires (FR-7). Not a true contradiction (the third button is a PRD requirement, not clutter), but the two docs don't acknowledge each other here. Fix: DESIGN's Do's row should carve out the documented Last-Player exception so the two spines don't appear to disagree. Ties to MED-2.

- **[LOW-6] Secondary color naming.** DESIGN frontmatter sets `secondary: '#ffffff'` (L28) while body copy + Components call the CTA color "Secondary Neon Mint" (L122, L150, L162, L179) — which is actually `secondary-container: '#36ffc4'` (L30). Issue: the token literally named `secondary` is white, but every prose reference to "Secondary" means the mint container. A builder wiring `secondary` to a CTA background would get white. Fix: either rename references to `secondary-container` or note that "Secondary Neon Mint" = `secondary-container` token. (Low because the hexes make intent recoverable, but it's a genuine footgun.)

---

## 6. Open-Items Density (hobby stakes)

Four tagged open items (EXP L155–158): 3 `[ASSUMPTION]`, 1 `[NOTE FOR UX]`. For a chain-top hobby spine this density is **appropriate — arguably commendable** (low, and each is a real fork-in-the-road rather than a punt): portrait-only, Draw-from-deck placement, Round Result/Showdown merge, Eliminated spectator model. They are honest about exactly the items this review independently flagged (MED-2, HIGH-1). No excess; nothing that should have been resolved is hidden behind a tag.

**Finding:**

- **[LOW-7] Two open items (L156 Draw-from-deck, L158 Eliminated model) correspond to the two biggest build-readiness gaps in this review (MED-2/MED-6, HIGH-1).** Not a density problem — a sequencing note: these two specifically should be resolved before story creation, not deferred to "confirm in a mock," because they change IA/component contracts, not just pixels.

---

## Priority Fix List (for downstream build)

1. **[HIGH-1]** Add a flow that lands on **Eliminated**; confirm spectator model (resolves Open Item L158).
2. **[HIGH-2]** Add a **Host Conductor** component to DESIGN (placement + thumb-zone) — currently unbuildable from DESIGN.
3. **[MED-2/MED-6]** Resolve the **Last-Player third button** (Draw from deck): spec its layout in DESIGN and carve the exception into the "two buttons only" Do's row.
4. **[MED-3]** Define the **Showdown flip animation** in DESIGN so Reduce-Motion has a defined thing to skip.
5. **[LOW-6]** Disambiguate **"Secondary Neon Mint" → `secondary-container`** token (the `secondary` token is white).

Everything else is MED/LOW polish. No blockers.
