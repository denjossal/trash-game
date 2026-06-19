---
stepsCompleted: [1, 2, 3, 4, 5, 6]
documentsIncluded:
  - '_bmad-output/planning-artifacts/prds/prd-trash-game-2026-06-19/prd.md'
  - '_bmad-output/planning-artifacts/prds/prd-trash-game-2026-06-19/addendum.md'
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/planning-artifacts/epics.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-trash-game-2026-06-19/EXPERIENCE.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-trash-game-2026-06-19/DESIGN.md'
---

# Implementation Readiness Assessment Report

**Date:** 2026-06-19
**Project:** trash-game

## Document Inventory

| Type | Format | Path | Status |
|---|---|---|---|
| PRD | Sharded folder | `prds/prd-trash-game-2026-06-19/prd.md` (+ `addendum.md`) | ✅ single source |
| Architecture | Whole | `architecture.md` (`status: complete`, 8/8 steps) | ✅ single source |
| Epics & Stories | Whole | `epics.md` (5 epics + Epic 0 standing gates) | ✅ single source |
| UX Design | Sharded folder | `ux-designs/ux-trash-game-2026-06-19/` (`EXPERIENCE.md` + `DESIGN.md`, both `status: final`) | ✅ single source |

**Duplicates:** None. No document exists in both whole and sharded form.
**Missing required documents:** None. All four required types (PRD, Architecture, Epics, UX) present.
**Supporting artifacts (not assessed directly):** brief, brainstorming, technical research, per-doc review/decision-log/rubric files.

## PRD Analysis

Source: `prd.md` (§1–§11) + `addendum.md`. The PRD numbers FRs globally (FR-1…FR-14) and carries constraints as NFR-equivalents in §11 plus Success Metrics (§7) and Non-Goals (§5).

### Functional Requirements

- **FR-1 — Create a Table:** Host creates a Table from a browser and receives a Room Code; creator becomes Host + first Player; no account/email/install; Room Code = 4 uppercase letters, ambiguity-safe set (excludes O/0, I/1/L).
- **FR-2 — Join by Room Code:** Player joins with Room Code + display name; valid code adds them to the lobby roster on every device; invalid/expired rejected with a plain retry message; each Player gets a stable `playerId` + session token independent of socket identity.
- **FR-3 — Lobby roster:** all devices see the live roster before the Deal; join/leave updates all devices; late join allowed up to the first Deal only; no joining in progress; a Player who leaves mid-game stops taking Turns (no reconnection in MVP).
- **FR-4 — Host sets starting Lives:** Host sets Lives 1–5 before the first Deal (default 3 if unchanged); may also change between Rounds (→ FR-14).
- **FR-5 — Deal secret Cards:** Host deals one secret Card per active Player; full Deck reconstituted + reshuffled (Fisher–Yates / CSPRNG) each Deal; a Card value reaches only its owner's device; all devices transition to dealt state together; Starting Player = Host on Round 1, then previous Round's Loser; turn order to each Player's right.
- **FR-6 — Take a Turn (Swap/Keep):** active Player Swaps (exchange with the Player to their right) or Keeps; exactly two primary actions + peek/hide; own Card hidden by default, peek = explicit hold/tap, re-hides on release; inactive devices show only whose Turn it is; turn order is exactly one pass (Starting → Last, no wrap); no timer, no auto-advance.
- **FR-7 — Last Player option:** Last Player may Swap with the Player to their right OR draw a random Card from the Deck; draw replaces their Card and removes the discard from the Deck for the rest of the Round (returns at next Deal); covers the heads-up (2-Player) path.
- **FR-8 — King is social-only:** no special app behavior; simply the highest Card; the app never refuses a Swap based on a target's value and never reads another Player's Card to validate a Swap; King participates in Showdown like any other Card.
- **FR-9 — Trigger Showdown:** Host triggers once the Last Player has acted; all Cards reveal on all devices at the same moment; first time a non-owner receives another Player's Card value.
- **FR-10 — Compute & highlight Loser(s):** lowest by value only (Ace lowest, suit ignored); ties incl. all-tied → multiple Losers; correct and unambiguous at sizes up to 20.
- **FR-11 — Deduct Lives & eliminate:** each Loser loses exactly one Life; ties deduct from every tied Loser; a Player at 0 Lives is eliminated and excluded from subsequent Deals.
- **FR-12 — Win check & Re-deal:** exactly one non-eliminated Player → winner, game ends; 0-survivor case (all eliminated in one Showdown) → shared win; otherwise one Host Re-deal starts the next Round with survivors; Round's Loser starts next (multi-Loser tiebreak; eliminated-Loser falls to next surviving seat to the right).
- **FR-13 — Auto Deck scaling:** one 52-card deck for ≤10 Players, two merged decks for 11–20; not a Host setting; duplicate values + more frequent ties accepted at large Tables.
- **FR-14 — Host mid-session controls:** Host-only, never on a Player's Turn surface: change Lives (1–5, between Rounds), remove a Player (excluded from next Deal; mid-Round removal resolves at next Showdown/Re-deal), reassign Host (exactly one Host at any time).

**Total FRs: 14.**

### Non-Functional Requirements

Captured in PRD §11 (Constraints) and §7 (engineering/integrity bars). Numbered here NFR-1…NFR-10 to match the Epics doc's inventory (which lifts them verbatim).

- **NFR-1 — Privacy/Integrity (HARD, pass/fail, §11.1 / SM-6):** a secret Card reaches only its owner — never another device, UI, or network traffic — until Showdown; no feature may branch on another Player's secret Card before Showdown; enforced at a single egress chokepoint + negative-assertion test.
- **NFR-2 — Server-authoritative (§11.1):** no Card values or game-deciding logic on the client; clients send intents only; server validates phase/turn-ownership/Host-only and computes all results; client timestamps never trusted.
- **NFR-3 — Zero ongoing cost (HARD, launch gate, §11.2 / SM-7):** $0 at family/friends scale (free-tier, idle-to-zero); depends on WebSocket Hibernation wired AND rooms GC'd.
- **NFR-4 — Stable identity (§11.3):** all Player state keyed to `playerId` + session token (not socket identity) from day one; makes reconnection cheap later.
- **NFR-5 — Reveal-finality / simultaneity:** reveal gated server-side by the phase token — rejected unless every live Player has acted, so all Cards are final before any is public; "simultaneous" is best-effort presentation (ms time-sync deferred).
- **NFR-6 — Showdown flip-safety:** reveal flip ≤400ms, no strobe, nothing >3×/sec, no full-viewport flash; Reduce-Motion skips the flip (instant face-up, loser still clearly highlighted).
- **NFR-7 — Fast start (SM-4):** "let's play" → everyone dealt in well under ~30 seconds.
- **NFR-8 — No confusion-stop (SM-5):** a full game night runs without a Round stalling on a confused Player (validates two-button/minimal-surface).
- **NFR-9 — Eyes-up / minimal surface (§10):** active Player's screen = two big buttons + peek/hide and nothing else; inactive = only whose Turn it is; no feeds/chat/ads/idle animation/badges/scroll-bait.
- **NFR-10 — Accessibility floor:** large type, WCAG AA contrast on dark, tap targets ≥48dp; color independence (suit by shape, loser by stroke+scale+position, turn by frame+name — never color alone); SR labels with role+state; hidden own-Card rank absent from the a11y tree; Reduce-Motion variants; focus order = reading order; primary actions in the thumb-zone.

**Total NFRs: 10.**

### Additional Requirements / Constraints

- **Success Metrics (§7):** SM-1 "one more round" (unprompted re-deals), SM-2 eyes-up, SM-3 the reveal lands, SM-4 fast start, SM-5 no confusion-stop, SM-6 integrity holds (pass/fail), SM-7 $0 to run.
- **Counter-metrics — do NOT optimize (§7):** SM-C1 screen-engagement/time-in-app, SM-C2 reach/install count.
- **Non-Goals (§5):** not remote/online, not retention software, not a variant rules engine (Powers mode = v2), not an attention sink, not self-healing against disconnects in MVP.
- **Open Questions still genuinely open:** OQ-3 two-deck tie frequency (playtest), OQ-6 idle Room-Code TTL (build-time, assumed 3h).
- **Unresolved `[ASSUMPTION]`s carried into build:** default Lives = 3; multi-Loser tiebreak seating; zero-survivor shared win; **mid-session Lives change effect (clamp vs. top-up)**; mid-Round removal timing.
- **Technical direction (addendum):** PartyServer on Cloudflare Workers + Durable Objects (one DO per Table), PartySocket, JSON-over-WSS, TypeScript, pure transport-agnostic rule functions, Fisher–Yates + CSPRNG. King social-only rationale (any app-enforced block leaks the secret). Powers-mode v2 design notes.

### PRD Completeness Assessment

The PRD is **complete, internally consistent, and unusually disciplined.** Every FR has testable "Consequences"; the Glossary is enforced verbatim across FRs/UJs/SMs; the hard rules (§11) are explicit and pass/fail; Non-Goals and Counter-metrics are first-class (protecting the product's "eyes-up" soul). It correctly pushes mechanism/"how" to the addendum. The only items not fully closed are **deliberately deferred product `[ASSUMPTION]`s** — most are tunable-by-playtest and harmless, but **one (FR-14 clamp-vs-top-up) carries a correctness consequence** that interacts with permanent elimination and should be decided before Epic 4 (flagged for Step 5 risk analysis). No structural PRD gaps.

## Epic Coverage Validation

Validated each PRD FR against an actual story with testable ACs (not merely the epics' self-declared "FR Coverage Map"). The epics doc additionally carries an explicit NFR / Architecture-Requirement (AR-1…AR-15) / UX-DR (UX-DR1…18) inventory and threads them as per-story ACs — assessed alongside the FRs.

### Coverage Matrix — Functional Requirements

| FR | Requirement (short) | Epic / Story | Status |
|---|---|---|---|
| FR-1 | Create Table + Room Code | Epic 1 · Story 1.6 | ✓ Covered |
| FR-2 | Join by code + stable identity | Epic 1 · Story 1.5 (identity) + 1.7 (join) | ✓ Covered |
| FR-3 | Live lobby roster; lobby-only join | Epic 1 · Story 1.7 | ✓ Covered |
| FR-4 | Host sets Lives 1–5 (default 3) | Epic 1 · Story 1.8 | ✓ Covered |
| FR-5 | Deal secret Cards; reshuffle; Starting Player | Epic 2 · Story 2.3 (deal) + 2.1 (deck/shuffle) | ✓ Covered |
| FR-6 | Take a Turn (Swap/Keep); peek; one pass | Epic 2 · Story 2.4 + 2.5 (peek) | ✓ Covered |
| FR-7 | Last Player draw-from-deck; heads-up | Epic 2 · Story 2.6 | ✓ Covered |
| FR-8 | King social-only (no app logic) | Epic 2 · folded into Story 2.4 (negative req + standing test) | ✓ Covered |
| FR-9 | Trigger Showdown; simultaneous reveal | Epic 3 · Story 3.2 (finality) + 3.3 (flip) | ✓ Covered |
| FR-10 | Compute & highlight Loser(s); ties | Epic 3 · Story 3.1 (engine) + 3.3 (highlight); hardened at 20 in Epic 5 · 5.1 | ✓ Covered |
| FR-11 | Deduct Lives & eliminate | Epic 3 · Story 3.1 + 3.4 (UI tick-down) + 3.5 (eliminated surface) | ✓ Covered |
| FR-12 | Win check + Re-deal; Loser starts next | Epic 3 · Story 3.1 (win-check/tiebreak) + 3.4 (dealAgain) + 3.6 (winner / newGame) | ✓ Covered |
| FR-13 | Auto Deck scaling 1/2 decks | Epic 5 · Story 5.1 (composition parameterized in Epic 2 · 2.1) | ✓ Covered |
| FR-14 | Host mid-session controls | Epic 4 · Story 4.1 (overlay) + 4.2 (lives/remove/reassign) | ✓ Covered |

### Coverage Matrix — NFRs (threaded as cross-cutting ACs)

| NFR | Established / Upheld | Status |
|---|---|---|
| NFR-1 Privacy (SM-6) | Epic 1 · Story 1.4 (chokepoint + standing test); re-passed every epic adding a projection field (pre-mortem E) | ✓ Covered |
| NFR-2 Server-authoritative | Epic 1 (intent validation) + Epic 2 · Story 2.2 (guard) | ✓ Covered |
| NFR-3 Zero-cost (SM-7) | Epic 0 · G2 standing gate + Epic 1 · Story 1.1 (spike) + 1.11 (GC) | ✓ Covered |
| NFR-4 Stable identity | Epic 1 · Story 1.5 | ✓ Covered |
| NFR-5 Reveal-finality | Epic 3 · Story 3.2 | ✓ Covered |
| NFR-6 Flip-safety | Epic 3 · Story 3.3 | ✓ Covered |
| NFR-7 Fast start | Epic 2 · Story 2.3 (owns end-to-end ≤30s timing) | ✓ Covered |
| NFR-8 No confusion-stop | Epic 2 · Story 2.4 (play-confirmed AC, pre-mortem C) | ✓ Covered |
| NFR-9 Eyes-up | Epic 0 · G1 standing gate + per-surface | ✓ Covered |
| NFR-10 Accessibility | Epic 1 · Story 1.9b + per-surface (2.4 focus order, 2.5 a11y tree, 3.3 color-independence) | ✓ Covered |

### Missing Requirements

**None.** All 14 FRs and all 10 NFRs trace to at least one story with testable acceptance criteria. No FR appears in the epics that is absent from the PRD (no scope inflation). The decomposition also covers items the PRD only implies:

- **Epic 0 standing gates** (Eyes-Up, $0) make the Non-Goals and Counter-metrics (SM-C1/C2) first-class pass/fail siblings to SM-6 — a genuine strengthening, not a gap.
- **Pre-mortem additions A–E** add multi-device concurrent-join (SM-4 as a concurrency property), joint squirm+reveal tuning, Reluctant-Player play-confirmation, GC/hibernation in the spike, and the standing privacy gate. These close qualitative gaps unit tests can't catch.

### Coverage Statistics

- Total PRD FRs: **14** · FRs covered: **14** · **FR coverage: 100%**
- Total NFRs: **10** · NFRs covered: **10** · **NFR coverage: 100%**
- Architecture Requirements (AR-1…AR-15): all anchored to ≥1 story (per the epics' Anchors lines).
- Reverse-traceability (epics → PRD): no orphan stories; every story cites an FR/NFR/AR/UX-DR.

**Note carried to Step 6:** the just-completed `Phase`-enum reconciliation (and the new `newGame` intent for the `gameOver→lobby` "one more?" edge) are now consistent across Architecture and Epics (Stories 1.3, 2.6, 3.2, 3.6, 4.2). Coverage is unaffected — FR-12's "one more?" is now explicitly homed in Story 3.6 via `newGame`.

## UX Alignment Assessment

### UX Document Status

**Found.** Two peer spines, both `status: final`: `EXPERIENCE.md` (behavior/IA/flows — owns *how it works*) and `DESIGN.md` (the "Electric Social" visual identity — owns *how it looks*, wins on visual conflict). Phone-only, portrait, dark-mode-only MVP. The UX explicitly anchors on PRD Glossary terms verbatim and names the PRD FRs it realizes.

### UX ↔ PRD Alignment

**Strong, no gaps.** The IA's 9 surfaces close exactly over the PRD's surface needs (UX states "every PRD surface need maps to a surface… and every surface is reached by a flow"). The 5 Key Flows realize UJ-1/2/3 plus the two FR-14 / Eliminated cases. Direct trace-points verified:

- Two-button hero + peek-on-hold + one-pass (FR-6); Last-Player draw as the one sanctioned 3rd-button exception (FR-7) — explicitly reconciled with DESIGN.md's "two buttons and nothing else."
- King = nothing on screen (FR-8), with the voice table forbidding any on-screen "block" message.
- Simultaneous flip + Loser highlight + ties/all-tied copy (FR-9/10), minimal-but-real for v1.1 FX (PRD §6.2).
- Loser starts next Round; first Round by Host (FR-5/12). Conductor controls never on Your Turn (FR-14).
- **Tone correction matches PRD §10:** the generated "high-stakes underground" framing is rejected; warm/playful/inclusive voice — consistent with the PRD and with the saved correction in the UX memory.

### UX ↔ Architecture Alignment

**Strong — the architecture was authored *from* the UX, not merely compatible with it.** Verified couplings:

- **Render-from-state router** (Architecture's "enshrined experience invariant"; Story 1.9a) directly implements EXPERIENCE.md's "no persistent navigation — game flow IS the navigation" and the auto-routing-by-state IA. Svelte was chosen *specifically* to make render-from-state the default and defuse the cross-surface DOM-patching risk that would land a Reluctant Player on a wrong surface.
- **Privacy/peek:** EXPERIENCE.md's auto-hide-on-blur/background + "rank not in the a11y tree when hidden" + SR-announce-once-and-discard map to architecture's client-only peek (local UI state, never sent) and the `projectStateFor` chokepoint. No card value crosses the wire for peek.
- **Flip-safety:** ≤400ms / no full-viewport flash / Reduce-Motion-skips (NFR-6) homed in `client/src/lib/reduce-motion.ts` and Story 3.3.
- **Design tokens as CSS custom properties, no Tailwind** (Story 1.9a) matches DESIGN.md being authored as tokens; the architecture explicitly declines Tailwind/UI-kit starters to keep the privacy-critical code deliberate.
- **Beat signals value-free:** the squirm (`justReceivedSwap`) and reveal (`revealed`) ride as value-free fields — consistent with EXPERIENCE.md's "Showdown is the only loud beat" and the SM-6 inference-channel obligations.

### Alignment Issues

- **(Minor, already a UX `[NOTE]`)** Round Result + Showdown *may merge* into one continuous beat in build (EXPERIENCE.md open item; Epics UX-DR10 echoes "confirm in build"). The `Phase` machine keeps them as distinct phases (`showdown` → `roundResult`); a merged *presentation* is fine over two distinct *phases*, but the build should treat this as a presentation decision, not a state-machine change. **No conflict — flagged so the merge doesn't get mistaken for collapsing two phases.**
- **(Minor)** `justReceivedSwap` lifecycle on an idempotent snapshot is under-specified (also raised in the architecture review) — a transient/edge-triggered field on a render-from-state snapshot needs a "computed at projection time, never persisted, not replayed on reconnect" rule so a woken device doesn't re-squirm. Carries to Step 5/6.

### Warnings

**None blocking.** UX is present, final, and the most tightly-integrated-with-architecture artifact in the set. The open items in EXPERIENCE.md (portrait-only, draw-button placement, RoundResult/Showdown merge, eliminated-as-spectator) are all `[ASSUMPTION]`/playtest items already mirrored as play-confirmed ACs in the Epics — none are silent gaps.

## Epic Quality Review

Applied the create-epics-and-stories standards rigorously: user-value-not-technical-milestone, epic independence (Epic N may not require Epic N+1), no forward story dependencies, story sizing, AC quality (Given/When/Then, testable, error paths), and the starter-template-first rule.

### Epic Structure — User-Value & Independence

| Epic | Title is user-centric? | Independent of later epics? | Verdict |
|---|---|---|---|
| Epic 0 — Standing Gates | N/A (properties-of-the-whole) | N/A (cross-cutting) | ✅ Justified exception (see below) |
| Epic 1 — Get to a Table together | ✅ "open a URL, get a code, land in a live lobby" | ✅ stands alone | ✅ Pass |
| Epic 2 — Play a Round | ✅ "take your Turn, shove your trash" | ✅ uses only Epic 1 | ✅ Pass |
| Epic 3 — The Showdown | ✅ "the reveal, the OHHH" | ✅ uses Epic 1+2 | ✅ Pass |
| Epic 4 — Conduct the night | ✅ "keep the table moving without restarting" | ✅ uses Epic 1–3 | ✅ Pass |
| Epic 5 — Scale to the whole table | ✅ "play correctly at 20" | ✅ uses Epic 1–3 | ✅ Pass |

**Every epic delivers user value and is named for what a user/Host can do** — none is a "build the API / set up the database" technical milestone. Epic boundaries are clean vertical slices of the experience.

### The two apparent "technical" items — assessed, both JUSTIFIED (not violations)

1. **Epic 0 (Standing Gates: Eyes-Up, $0)** — *not* a feature epic; explicitly framed as pass/fail properties-of-the-whole, sibling to the SM-6 privacy gate, enforced for the life of the project. This is the correct way to keep Non-Goals/Counter-metrics from being orphaned by a feature-only decomposition. **Keep — it strengthens the plan.**
2. **Story 1.1 (pre-build spike) + 1.2 (AC-driven init)** — the standards REQUIRE an init-from-starter story as Epic 1's first story when the architecture specifies one; the architecture specifies an *AC-driven* init (no opinionated starter). Story 1.2 satisfies this exactly (workspaces, `new_sqlite_classes`, ESLint gates red-first). Story 1.1 (spike) is a deliberate **gate-and-stop go/no-go** (decision #9) ahead of it, since the whole DO-per-Table premise rests on unverified Cloudflare semantics. **Correct sequencing — a technical *story*, not a technical *epic*.**

### Forward-Dependency Analysis — the highest-risk check, and it PASSES

The decomposition was clearly authored to eliminate forward references. Each claimed defense verified against the story text:

- **`allActed` phase + full `TableState` defined in Story 1.3** (Epic 1) so Epic 2/3 *extend* rather than introduce — ✓ (and now hardened by our Phase-enum fix).
- **`projectStateFor` written in 1.4 anticipating reveal**, with 1.4's AC scoped to assert ONLY `revealed=false` so it does NOT forward-bind to Epic 3's 3.2 — ✓ (a textbook "anticipate without forward-binding" split).
- **`buildDeck(composition)` parameterized in Story 2.1** so Epic 5's two-deck merge is a data change — ✓.
- **Showdown resolution parameterized 2..20 in Story 3.1**, with eliminated-state fixtures hand-constructed (NOT via the 3.4 elimination flow) so 3.1 does not forward-bind to 3.4 — ✓.
- **Two-scope guard built WHOLE in Epic 2 (Story 2.2)**; Epic 1 uses lightweight lobby validation only; Epics 3/4 only *consume* the phase token — ✓ (decision #1 resolves Amelia's Hazard A cleanly).

**No story depends on a later story to be completable.** Within-epic ordering is acyclic and each story builds only on earlier ones. This is the strongest forward-dependency hygiene I've assessed.

### Acceptance Criteria Quality

- **Format:** Consistent Given/When/Then BDD throughout, with FR/NFR/AR/UX-DR citations per AC.
- **Testable & specific:** ACs name concrete tokens (`phaseToken`, `stale-turn`, `nextAliveSeat`, `ctx.getWebSockets().length`), exact values (1–5 Lives, ≤400ms, ≥48dp, ≥72px, 3h TTL), and the SM-6 negative-assertion as the literal acceptance test.
- **Error/edge paths covered:** bad-code retry (1.7), stale double-tap silent resync (2.2), empty-deck impossibility stated (2.6 E2), `<2`-player Re-deal impossibility (3.4 E1), all-tied-to-zero shared win (3.1), multiple-eliminated-tied-Losers seat scan (3.1 E3), mid-round current-turn removal (4.2), disconnected-active-player no-auto-skip (4.2).
- **Qualitative gates handled honestly:** SM-5/SM-4/eliminated-engagement/host-conducting are framed as *play-confirmed* ACs (decisions #6, pre-mortems A/B/C), not pretend-unit-testable. The non-determinism of blur/visibilitychange (2.5) is explicitly routed to Playwright/manual, not jsdom.

### Story Sizing & Database/Entity Timing

- **Sizing:** stories are single-purpose and completable; the heaviest (1.7 multi-device join, 3.1 resolution engine, 2.2 guard) are appropriately central, not bloated. The 1.9 split into 1.9a (tokens+router) / 1.9b (PWA+voice+safety) shows deliberate right-sizing.
- **State-shape timing:** the one intentional exception to "create tables when needed" — the FULL `TableState` is defined up front in 1.3 (decision #2) — is the *correct* call here: a wire contract shared by server+client whose late extension would force `projectStateFor` + durable-summary retrofits. There is no relational DB; the single `ctx.storage` "table" key is introduced exactly when persistence first matters (2.2). ✓

### Findings by Severity

**🔴 Critical Violations:** **None.**

**🟠 Major Issues:** **None.**

**🟡 Minor Concerns (carry into build — none block start):**
- **M1 — FR-14 clamp-vs-top-up unresolved with a correctness edge.** Story 4.2 carries `[ASSUMPTION: clamp-vs-top-up settled in build]`. This is the one open item with a real correctness consequence: if a mid-game Lives raise can lift a Player who is at 0, it contradicts the "permanent elimination" rule (Architecture D1; Story 3.5). **Recommendation:** make a product decision before Epic 4 — recommended default: a Lives change sets the value for *ongoing* Players and can NEVER un-eliminate a 0-Life Player (elimination stays permanent). Cheap to pin as an AC.
- **M2 — `justReceivedSwap` lifecycle unspecified** on a render-from-state snapshot (also raised in Steps 4 + architecture review). **Recommendation:** specify in Story 2.4 that it is computed at projection time for the single post-swap push only, never persisted, never replayed on reconnect/wake.
- **M3 — `room-full` / `MAX_PLAYERS` enforcement has no explicit AC.** The `ErrorReason` includes `room-full` and config has `MAX_PLAYERS`, but no story asserts the 20-player cap rejection. **Recommendation:** add a one-line AC to Story 1.7.
- **M4 — Eliminated-Host-as-previous-Starting-Player tiebreak fixture.** Story 3.1's parameterized tests cover eliminated tied Losers, but not explicitly the case where the *previous Starting Player seat* (the scan origin) belongs to an eliminated Host who keeps conducting (Architecture D1). **Recommendation:** add that fixture to Story 3.1 (it's well-defined by `nextAliveSeat`, just untested).
- **M5 — RoundResult/Showdown merge is a UX `[NOTE]`** that should be explicitly scoped as a *presentation* merge over two distinct phases, not a state-machine collapse (see Step 4). Documentation nit.

### Best-Practices Compliance Checklist (whole plan)

- [x] Every epic delivers user value
- [x] Every epic functions independently of later epics
- [x] Stories appropriately sized & single-purpose
- [x] No forward dependencies (rigorously verified)
- [x] State/storage introduced when first needed (full contract up front is a justified, documented exception)
- [x] Clear, testable Given/When/Then acceptance criteria
- [x] FR/NFR/AR/UX-DR traceability maintained per story
- [x] Init-from-(AC-driven)-starter is Epic 1's first build story; gated by a go/no-go spike

**Overall epic quality: exceptionally high.** Zero critical or major violations. The five minor concerns are AC-level clarifications, and only M1 is a genuine product decision (with a correctness consequence) rather than a documentation tightening.

## Summary and Recommendations

### Overall Readiness Status

**✅ READY FOR IMPLEMENTATION.**

All four required artifacts (PRD, Architecture, Epics, UX) are present, final/complete, single-source (no duplicates), and mutually consistent. **100% FR coverage (14/14) and 100% NFR coverage (10/10)**, every requirement traceable to a story with testable acceptance criteria. **Zero critical and zero major epic-quality violations**; forward-dependency hygiene is rigorously clean. The one hard rule (secret-card privacy, SM-6) has a mechanical acceptance test; zero-cost (SM-7) is empirically verified and gated behind a go/no-go spike. The cross-document `Phase`-enum contradiction found earlier was resolved during this session and re-verified consistent across Architecture and Epics.

This is a high-confidence READY — not a "ready with reservations."

### Critical Issues Requiring Immediate Action

**None.** No blocker- or major-severity issues were found. The five minor concerns below do not block starting Epic 1; four are AC-level documentation tightening and one (M1) is a product decision due before Epic 4.

### Recommended Next Steps

1. **Make the M1 product decision before Epic 4 (only item with a correctness consequence):** does a mid-game `hostSetLives` raise interact with permanent elimination? Recommended default — a Lives change applies to ongoing Players and can NEVER un-eliminate a 0-Life Player; pin it as a Story 4.2 AC. *(This is the single decision worth making explicitly now.)*
2. **Pin the four documentation-level minors as AC clarifications:** M2 `justReceivedSwap` lifecycle → Story 2.4; M3 `room-full`/`MAX_PLAYERS=20` enforcement → Story 1.7; M4 eliminated-Host-as-prior-Starting-Player tiebreak fixture → Story 3.1; M5 RoundResult/Showdown as a presentation-merge-not-phase-collapse note → Story 3.3/UX-DR10.
3. **Begin implementation at Story 1.1 — the pre-build spike — as a hard go/no-go gate.** It must empirically validate `idFromName` claim-on-create, the D2/D2.1 persistence boundary, AND the hibernation-aware GC probe (pre-mortem D) before any product code. If any assumption is false, re-evaluate the DO-per-Table premise before Story 1.2.
4. **Carry the two genuinely-open PRD playtest questions forward** (not blockers): OQ-3 two-deck tie frequency and OQ-6 idle Room-Code TTL — both resolve via soft-launch observation, exactly as the PRD intends.
5. **Environment nit:** the BMad customization resolver requires Python 3.11+ (current environment is older); resolved manually this run with no impact. Upgrade Python if you want the scripted path for future BMad skills.

### Final Note

This assessment identified **5 issues across 1 category** (Epic Quality — all 🟡 minor), plus 2 cross-referenced minor alignment notes already folded into those five. **Zero critical, zero major.** Of the five, only **M1** warrants a decision before its epic; the rest are cheap AC tightenings that can be done as each story is drafted. The planning set is unusually mature — adversarially reviewed across multiple party-mode and pre-mortem passes — and is ready to proceed to implementation as-is once M1 is decided.

---

**Assessor:** Winston (Architect), acting as Implementation-Readiness PM
**Date:** 2026-06-19
**Method:** 6-step bmad-check-implementation-readiness (document discovery → PRD extraction → FR/NFR coverage → UX alignment → epic quality → final assessment), with source documents read verbatim rather than from summary.
