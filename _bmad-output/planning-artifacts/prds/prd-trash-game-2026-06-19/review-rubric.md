# PRD Quality Review — Trash

*Reviewed: prd.md + addendum.md (prd-trash-game-2026-06-19). Calibrated to hobby/personal scale: rigor light, substance bar normal. This PRD is chain-top (feeds UX → architecture → stories), so done-ness and downstream usability are weighted hard.*

## Overall verdict: **Adequate** (one fix from strong)

This is a genuinely good hobby PRD. It is decision-ready, strategically coherent, and unusually disciplined about its own posture (eyes-up, deeper-not-bigger). Every FR carries explicit "Consequences (testable)," the Glossary is treated as load-bearing, and the UJs have named protagonists doing real work. It is held back from "strong" by one mechanical defect (the broken Glossary "Swap" entry feeds verbatim into stories) and one substantive tension the PRD half-acknowledges but never resolves cleanly: FR-8's King Block is described as privacy-preserving while §11.1 calls secret-card privacy the "single non-negotiable" rule — the refusal itself leaks one bit, and the document needs to state plainly that this is a *bounded, accepted* exception rather than implying no leak occurs. Neither is fatal; both are cheap to fix.

---

## 1. Decision-readiness — **Strong**

- **[ok]** Scope boundaries are decided, not hedged (§5, §6.2) — remote play, retention, variants, reconnection all explicitly out, each with a one-line rationale. *Fix:* none.
- **[ok]** Defaults are chosen so a builder can start: Lives default 3 (FR-4), Room Code 4-char (FR-1), deck threshold 10 (FR-13), Host starts every Round (Assumption §9). Each is tagged `[ASSUMPTION]` and indexed, so they're decisions-with-an-asterisk, not gaps. *Fix:* none.
- **[minor]** Working title still unconfirmed ("*Working title — confirm.*", §title) and OQ-6 leaves Room Code lifetime open. Both are immaterial to starting build. *Fix:* lock the title before UX copy work; defer OQ-6 to architecture.

## 2. Substance over theater — **Strong**

- **[ok]** Almost no filler. Every FR maps to a UJ or a stated gate; SMs tie back to specific FRs ("Validates FR-12," SM-1). *Fix:* none.
- **[ok]** §10 Aesthetic & Tone earns its place — "two big buttons," anti-references (feeds/chat/ads) — because it is the stated differentiator, not decoration. *Fix:* none.
- **[minor]** §1 Vision is two paragraphs of prose before the third paragraph delivers the real strategic content (public-domain game, no moat, "deeper not bigger"). Slightly long for a hobby PRD but not theatrical. *Fix:* optional trim.

## 3. Strategic coherence — **Strong**

- **[ok]** The thesis ("deeper, not bigger") is consistent end to end: Non-Goals (§5), counter-metrics SM-C2, and addendum positioning all reinforce it without contradiction. *Fix:* none.
- **[ok]** The two gates (Host activation, Reluctant Player weakest-link) are introduced in §2.3, drive UJ-1/UJ-2, and recur in SM-4/SM-5 and §10. Clean spine. *Fix:* none.
- **[major]** **King enforcement reverses a stated brief position** (FR-8 Notes: "reversing the brief's 'pure social, app does nothing' stance"). This is flagged honestly, but it sits in tension with §11.1's "single non-negotiable technical rule." The strategy is coherent *if* the reader accepts a deliberate privacy exception; the document never says that in those words. *Fix:* see Dimension 4 / FR-8 finding — state the exception explicitly.

## 4. Done-ness clarity — **Adequate** (mostly strong, one substantive hole)

Every FR has a "Consequences (testable)" block — exemplary for this dimension. Spot-checked all 13; each has at least one observable consequence. Issues:

- **[major]** **FR-8 King Block does not preserve the §11.1 hard rule as written; it carves an unstated exception.** §11.1 says a secret Card is delivered to its owner "until Showdown… the single non-negotiable technical rule." FR-8 refuses a Swap onto a King — which, by construction, leaks exactly one bit ("this player holds a King") to the swapper, derivable from the *action's outcome*, before Showdown. FR-8 and the addendum acknowledge the channel ("the bare fact of a refusal," "no observable difference in message shape/timing") but frame it as "privacy-preserving," which overclaims. The testable consequence "never includes or implies the blocked Player's Card value beyond the fact of the block" (FR-8 §176) literally concedes the leak in its own subordinate clause. *Fix:* reword §11.1 and FR-8 to state the rule as "no secret Card *value* is transmitted to a non-owner; the only permitted pre-Showdown information leak is the single bit implied by a King-Block refusal, which is an accepted, bounded exception." Then SM-6 ("pass/fail, not a gradient") becomes testable without self-contradiction.
- **[minor]** **SM-6 is currently self-contradictory against FR-8.** SM-6: "No Player can see another's secret Card before Showdown… pass/fail." Taken literally, FR-8's refusal *is* seeing-something about another card, so SM-6 fails by definition. *Fix:* scope SM-6 to "Card *value*," consistent with the FR-8 reword above.
- **[minor]** **"Peek and hide" has no testable consequence of its own.** FR-6 mentions "a control to peek and hide their own Card" but no consequence covers what peek/hide must guarantee (e.g., the value renders only on the owner device; hide clears it). For a privacy-critical app this should be testable. *Fix:* add a consequence to FR-5 or FR-6 binding peek/hide to the §11.1 owner-only rule.
- **[minor]** **FR-9 "once the Last Player has acted" is a precondition with no enforcement consequence.** It's unclear whether the app blocks an early Showdown or trusts the Host. *Fix:* state whether Trigger Showdown is gated or advisory.

## 5. Scope honesty — **Strong**

- **[ok]** Tally is proportionate to hobby stakes: 6 Open Questions, 4 `[ASSUMPTION]` tags (all indexed in §9), 4 `[NOTE FOR PM]` markers. None of the Open Questions block MVP build; each has a default or a "defer/validate in playtest" disposition. *Fix:* none.
- **[ok]** The Open Questions are real product questions (re-deal starting player, tie frequency, late join), not disguised gaps in core mechanics. *Fix:* none.
- **[minor]** OQ-4 ("confirm that's acceptable") and OQ-3 ("fun or annoying… validate in playtest") are addressed to the builder who *is* the PM — slight ceremony for a one-person project, but harmless. *Fix:* optional.

## 6. Downstream usability — **Adequate** (one mechanical defect, otherwise clean)

- **[major]** **Glossary "Swap" entry is broken prose** (§3, line 83): "force your Card onto the Player to your right, taking nothing in return is not how it works — see FR-6." This is a garbled, self-negating half-sentence (reads like a merged edit). The Glossary's own preamble says "Downstream workflows and readers must use these terms exactly… no synonyms" — so this exact text risks being copied verbatim into a story or UX label. *Fix:* rewrite to a clean definition, e.g. "**Swap** — Turn action: force your Card onto the Player to your right. You receive nothing back this Turn (it is not an exchange). The receiving Player still gets their own later Turn. See FR-6."
- **[ok]** **ID continuity is intact.** FR-1 through FR-13 present and sequential (no gaps, no dupes). UJ-1, UJ-2, UJ-3 all present and referenced by FRs ("Realizes UJ-1/UJ-2/UJ-3"). SM-1 through SM-7 plus SM-C1/SM-C2 all present and each cites the FR(s) it validates. *Fix:* none.
- **[ok]** **Cross-refs resolve.** §6.2→§11, FR-13→FR-11, FR-8→§11, FR-7 heads-up→FR-7, §8 OQ-6→§9 all point to live targets. Assumptions Index (§9) back-references match their inline tags. *Fix:* none.
- **[ok]** **Named UJ protagonists are present and consistent** — Marisol (Host, UJ-1/UJ-3) and Tío Beto (Reluctant Player, UJ-2). Glossary "Reluctant Player" archetype ties to Beto. *Fix:* none.
- **[minor]** Glossary "Last Player" and FR-7 both define the deck-draw option; minor duplication but not drift. The OQ index uses "OQ-6" while §8 numbers questions "1.–6." without the OQ prefix — a reader must infer OQ-6 = §8 item 6. *Fix:* prefix §8 items as OQ-1…OQ-6 for clean referencing.

## 7. Shape fit (consumer / multi-stakeholder party product) — **Strong**

- **[ok]** UJs are load-bearing and correctly center the two gating stakeholders (Host, Reluctant Player) rather than an abstract "user"; §2.3 explicitly justifies that focus ("everyone else is served for free once these work"). *Fix:* none.
- **[ok]** Multi-stakeholder reality is handled: Host-as-conductor vs. Player vs. Reluctant Player vs. the whole-Table moment (UJ-3) are distinct and each has FRs. The 2-player (heads-up) and 20-player edges are both addressed (FR-7, FR-10, FR-13). *Fix:* none.
- **[minor]** UJ climaxes contain meta-narration ("Realizes the activation gate," "Realizes the weakest-link gate") that reads like author notes inside the journey. Harmless but slightly breaks the protagonist POV. *Fix:* move gate-labels to the journey preamble, keep the climax in-world.

---

## Mechanical notes

- **Glossary "Swap" (§3, line 83):** broken half-sentence — must be rewritten before stories consume it. (See Dim 6.)
- **§8 numbering:** questions listed "1.–6." but indexed/referenced as "OQ-6." Adopt OQ-n prefixing for unambiguous downstream citation.
- **FR-8 / §11.1 / SM-6 wording triad:** align all three on "no Card *value* leaks; King-Block refusal is an accepted single-bit exception." Currently FR-8 calls itself "privacy-preserving," §11.1 calls privacy "non-negotiable," and SM-6 is literally pass/fail — these cannot all be true as written.
- **Title:** "*Working title — confirm.*" still open; resolve before UX copy.
- **Counter-metrics:** SM-C1 and SM-C2 are coherent and correctly oriented (they name what *not* to optimize and tie to SM-1/SM-2 and the deeper-not-bigger thesis). No issue.
- **Peek/hide:** add an owner-only testable consequence (privacy-critical, currently untested). (See Dim 4.)
- **Addendum:** clean separation of "how" from "what"; King-Block privacy note correctly defers side-channel concern to architecture and restates the social-only fallback. No issues.
