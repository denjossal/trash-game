# PRD Quality Review — Trash v2 (prd-trash-game-2026-06-25)

## Overall verdict

This is a tight, decision-ready v2 PRD that knows exactly what it is: a two-feature, deliberately client-only extension of a shipped MVP, scoped pre-locked, for a zero-cost hobby game. The thesis is clear, the scope honesty is excellent, and the FRs mostly carry testable consequences — an engineer could write stories off this. The few real gaps are narrow and proportionate: one FR (FR-17) leans on subjective ("warm," "tone-matched") acceptance language that needs a thin reviewer-sign-off gate, the FR-19 Queen-glyph rule has a small internal tension worth a one-line note, and the success metrics are honest but entirely observational (which is correct for the stakes, just worth naming). Nothing here blocks the downstream epics/UX phase.

## Decision-readiness — strong

Decisions are stated as decisions, not buried. The headline architectural call (per-player client-local language vs room-level) is made explicitly in §4.1 and §5, with the trade-off named and the rejected alternative pushed to the addendum — exactly the right altitude. The build order is committed (4.2 first, then 4.1, §4 intro) rather than left implicit. Open Questions (§8) are genuinely triaged: three are struck through as RESOLVED with dates, and the two that remain are explicitly tagged `[OPEN — non-blocker]` and `[OPEN — minor, deferred]` with owners — these are real open items deferred to playtest observation, not rhetorical questions. The `[NOTE FOR PM]` callouts (FR-17, FR-19) sit at actual tensions (creative deliverable vs string-swap; rejected glyph mappings), not safe checkpoints.

No findings.

## Substance over theater — strong

No furniture. Two personas (§2), both load-bearing: the Spanish-speaking relative drives FR-15–19 and SM-3; the waiting player drives FR-20 and SM-4. The Vision (§1) is specific to this product ("sweat their own card as the swap chain crawls toward them") and could not be swapped into another PRD. The constraints (§11) are real project invariants (privacy, G2 zero-cost, zero contract change) with product-specific consequences, not boilerplate NFRs. The "client-only" claim is substantiated, not asserted — §4.2 names the exact mechanism (`you.hand` already on the device via the secret-card projection) and the addendum backs it with file-level evidence.

No findings.

## Strategic coherence — strong

There is a clear thesis: "make Trash feel like *our* game at *our* table" without adding anything the host conducts or the server knows (§1). Both features serve it — widen the welcome (language), deepen the tension (peek) — and the zero-contract-change constraint (§11.3) is the spine that unifies them and justifies the deferral of Powers mode (§6.2, addendum E). Prioritization follows the thesis and risk, not ease alone (the quick win is sequenced first, but the headline is named the headline). Counter-metrics exist and are well-chosen (SM-C3 Babel, SM-C4 leak/cheating) and actually probe the two riskiest assumptions of the chosen design.

No findings.

## Done-ness clarity — adequate

Most FRs are unforgiving-test-ready. FR-15, FR-16, FR-20 each carry concrete, verifiable consequences (localStorage persistence across reload; per-device isolation; press-and-hold + hide-on-release/focus-loss/page-hide; peek shows the *current* card after a swap). FR-18 is cleanly closed as satisfied-by-design with a stated re-activation trigger. The weak spot is FR-17: its acceptance bar is inherently subjective ("tone-matched to the English originals' warmth," "lands as gentle ribbing," "reviewed by a human ear") — this is appropriate for creative copy but is not a condition an engineer or test can mechanically verify, so the "done" gate must be a named human sign-off, not an automated check.

### Findings
- **medium** FR-17 acceptance is subjective with no defined sign-off gate (§4.17) — "tone-matched," "lands as gentle ribbing," "reviewed by a human ear" are not mechanically testable; a story author can't tell when this FR is done. *Fix:* make the "delight-pass review" an explicit acceptance condition with a named approver (e.g. "Dennis sign-off on Spanish loser/winner/elimination lines") so the story has a checkable Definition of Done, even if the judgment itself stays human.
- **low** FR-19 Queen-glyph rule has a latent internal tension (§4.19) — the glyph stays "Q" but the spoken/screen-reader name is "Reina," so a sighted Spanish player sees "Q" while the screen reader says "Reina"; this is a deliberate collision-avoidance choice (documented in addendum B) but the FR doesn't flag the glyph/speech mismatch as intentional. *Fix:* add one clause noting the Q-glyph-but-Reina-speech split is intentional, so a story author doesn't "fix" it as a bug.

## Scope honesty — strong

Among the best parts of this PRD. §5 Non-Goals does real work (per-device by design, server stays language-blind, no third language, no name/code translation) and §6.2 Out of Scope re-states deferrals with reasons (Powers mode carries the King info-leak problem; reconnect is an accepted non-goal). De-scoping is explicit, never silent. The Assumptions Index (§9) round-trips against the inline `[ASSUMPTION]` tags. Open-items density is low and entirely non-blocking — appropriate for a green-light-to-build PRD at this stakes. The one nit: §9 still lists the FR-18 assumption ("*if* purely visual, the tier is satisfied-by-design") as a live assumption even though §4.18 and §8 mark it RESOLVED — minor index drift, see Mechanical notes.

No blocking findings.

## Downstream usability — adequate

This PRD is chain-top (it feeds epics/UX/stories — the addendum even pre-sketches Epic 6/7), so traceability matters. It largely holds: FR IDs are contiguous (FR-15..FR-20) and continue the MVP sequence correctly; SM/UJ IDs are unique and continue from the MVP (UJ-4/5, SM-3/4, SM-C3/C4); cross-references resolve; the Glossary (§3) defines the new nouns (Locale/Language, Off-Turn Peek, Comedy Sting). UJs each have a named protagonist (Abuela; Beto/Ana/Carla). The one usability snag for source-extraction: SM-3 claims to validate "FR-15–FR-19" but FR-18 is a no-work satisfied-by-design item, so the metric→FR mapping is slightly loose (see Mechanical notes). Several FRs reference MVP terms ("FR-9-era" on-Turn peek) that resolve only against the baseline MVP PRD — fine given this doc explicitly extends it, but story authors will need that companion at hand.

No blocking findings.

## Shape fit — strong

Correctly shaped for a hobby/solo, experience-kind product extension. Rigor is light, substance bar is met. UJs are load-bearing here (it's a consumer-facing experience), and they're present and concrete. The PRD is not over-formalized (no market sizing, GTM, compliance — correctly absent for the stakes, as intended) nor under-formalized (the two features that exist are specified to story-readiness). Brownfield handling is clean: it explicitly distinguishes itself as an extension of the MVP baseline, references existing code accurately (per the addendum's file-level grounding), and re-states which invariants carry forward.

No findings.

## Mechanical notes

- **Assumptions Index drift (low):** §9 lists the FR-18 assumption as live ("if purely visual…"), but FR-18 (§4.18) and Open Question 3 (§8) both mark it RESOLVED (2026-06-25, purely visual). Update or strike the §9 entry to match the resolved state so the index reflects reality.
- **SM→FR mapping looseness (low):** SM-3 (§7) says it validates "FR-15–FR-19," but FR-18 is satisfied-by-design with no v2 work and FR-17 is creative-copy. Tighten to "FR-15, FR-16, FR-17, FR-19" so the metric maps only to FRs that ship behavior.
- **Glossary cross-ref (informational):** FR-9-era / on-Turn peek and other MVP terms resolve only against `prd-trash-game-2026-06-19`. This is expected for an extension PRD; just ensure the baseline travels with this doc into the epics phase.
- ID continuity (FR-15..20, UJ-4/5, SM-3/4, SM-C3/C4) is clean — no gaps or duplicates. Required sections for the stakes are all present.
