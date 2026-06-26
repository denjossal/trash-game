---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: []
session_topic: 'v2 scope for the Trash game — with strong confirmed interest in Spanish language support (i18n)'
session_goals: 'Wide idea generation across all v2 possibilities before any narrowing'
selected_approach: 'ai-recommended'
techniques_used: ['What If Scenarios', 'Role Playing']
ideas_generated: 14
technique_execution_complete: true
session_active: false
workflow_completed: true
context_file: ''
---

# Brainstorming Session Results

**Facilitator:** Dennis_Salcedo
**Date:** 2026-06-25

## Session Overview

**Topic:** v2 scope for the Trash game — MVP is feature-complete, deployed to Cloudflare edge, and just passed its live playtest (minor issues deferred to a later iteration). Strong confirmed interest in **Spanish language support (i18n)**.

**Goals:** Wide idea generation — push for many v2 ideas across many angles before narrowing.

### Session Setup

**Known v2 candidates on the table at session start:**

- **Spanish / i18n** ← Dennis's stated priority
- **Powers mode** — Jack=Spy/peek, Queen=Thief/steal life, King=Blocker. ⚠️ King conflicts with the frozen MVP "King is social-only, zero app logic" rule (an app-enforced King-block deterministically leaks "neighbor holds a King," breaking the secret-card rule).
- **Reconnect / socket-liveness (AR-15)** — accepted MVP non-goal across all 5 epics; includes adoptSocket listener-leak items + disconnected-active-player handling.
- **Minor playtest issues** noted for "next iteration."

**Hard constraints carried from MVP:**
- Zero ongoing cost (G2 standing gate).
- Eyes-up / no attention-sink (G1 standing gate).
- Server-authoritative; secret cards never broadcast.

## Technique Selection

**Approach:** AI-Recommended Techniques

**Recommended sequence:**

- **What If Scenarios** (creative) — break the topic wide open beyond the 4 known candidates.
- **Role Playing** (collaborative) — generate ideas from the perspectives of real Trash players (Spanish-speaking abuela, the host, an eliminated kid, etc.).
- **SCAMPER Method** (structured) — systematically pressure each known candidate (esp. i18n + Powers) for sub-ideas.
- **Reverse Brainstorming** (creative) — "how would we ruin v2?" to surface risks-as-ideas, esp. the King info-leak.

**AI Rationale:** Wide divergent generation is the goal, so the sequence front-loads two expansive techniques (What If, Role Playing) to escape the 4 obvious candidates, then uses SCAMPER to mine depth out of the priorities, and closes with Reverse Brainstorming to convert known risks (King leak, reconnect edge cases) into design ideas.

## Ideas Generated

### Phase 1 · What If Scenarios — i18n / Spanish

**Decisions banked (host-confirmed):**
1. **Room-level language** — host picks one language for the whole table (NOT per-player). Simplicity win; server localizes room broadcasts once, not per-recipient.
2. **Lobby-only language lock** — host sets language before the game starts; CANNOT change mid-game (only on a new game). Eliminates re-localizing in-flight rounds. The deliberate *inverse* of the Epic-4 hostSetLives un-gating: lives = fairness knob (live), language = table identity (set once).
3. **All four scope tiers** (full Spanish, top to bottom).

**[#1] Per-Player Locale** *(considered, REJECTED in favor of room-level)*
_Concept:_ Language as a per-player property chosen at join; mixed-language table simultaneously.
_Novelty:_ One-device-per-player makes simultaneous mixed-language nearly free — but host rejected for simplicity.

**[#4] Lobby-Only Language Lock**
_Concept:_ Language set at creation/lobby, frozen once first deal happens.
_Novelty:_ Complexity eliminator — never re-localize an in-flight round; localizes like room code / starting lives.

**[#5] Tier 1 — UI Chrome in Spanish**
_Concept:_ Every button/prompt/status line localizes ("Es tu turno", "Cambiar / Quedarse", "Mostrar las cartas").
_Novelty:_ Structural backbone — forces the copy.ts → keyed-message refactor every other tier rides on.

**[#6] Tier 2 — Warm Moments, Authored Not Translated**
_Concept:_ Loser/winner lines re-authored in Spanish by a human ear, tone-matched to the playful non-punishing voice.
_Novelty:_ The one tier where literal translation hurts; warmth is a design asset → treat Spanish copy as creative work.

**[#7] Tier 3 — Localized Comedy Sting**
_Concept:_ Loser's-device comedy moment gets a Spanish variant ("¡Basura!"/"¡Perdiste!").
_Novelty:_ Self-contained unit (loser device + showdown only); highest delight-per-byte.

**[#8] Tier 4 — Spanish Card Ranks (K→R for Rey)**
_Concept:_ Rank letters localize (As/Jota/Reina/Rey); suit stays ignored. Tiny card-display.ts change.
_Novelty:_ Outsized cultural signal. ⚠️ OPEN: Q=Reina and K=Rey both want "R" — needs a deliberate call (parked for PRD).

### Phase 2 · Role Playing → Architectural Analysis (per-player vs room-level)

**Architecture finding (grounded in code via Explore agent):**
- All user-facing copy is CLIENT-SIDE in `client/src/lib/copy.ts` (33 exports: 14 consts + 19 parameterized fns like `loser(name)`, `winner(name)`). Every surface imports from it; zero hardcoded strings.
- **The server is TEXT-FREE** — it sends ONLY structured codes (`ErrorReason` enum types.ts:191, `loserIds`/`winnerIds`/`phase`), never human-readable strings. The CLIENT maps codes→copy (e.g. Home.svelte:88 maps `room-full`→TABLE_BUSY).
- `projectStateFor(state, playerId)` (project-state.ts:16) already sends a per-player payload (own hand only).
- Card rank→letter map is pure & client-only in `card-display.ts:29` (`rankToLetter`, `rankSpeech`, `cardSpeech`, `SUIT_SPEECH`).

**[#10] Client-Local Language Is Architecturally CHEAPER Than Room-Level** ⭐ KEY INSIGHT
_Concept:_ Because all copy is client-side and the server is text-free, per-player language stored in the device's localStorage touches ZERO shared types, ZERO server code, ZERO persistence, ZERO projection. Room-level language would ADD a TableState contract field + a host-config handler + persistence + projection.
_Novelty:_ Inverts the usual "shared setting = simpler" intuition. The text-free server means the simplest build is "each client reads its own local preference and renders" — the server never knows language exists.

**DECISION REVERSAL (host-confirmed):** Flip from room-level → **CLIENT-LOCAL PER-PLAYER language.**
- ❌ Decisions #1 (room-level) and #2 (lobby-only host lock) are SUPERSEDED.
- ✅ New model: each player picks their own language; stored in **localStorage on their device**; client renders copy.ts + card-display.ts in that language. No server/shared/persistence change.
- ✅ Bonus: enables the mixed-language table (abuela sees Español, grandson sees English) — the original motivating scenario — for *less* code than room-level.
- Implication: i18n becomes a **CLIENT-ONLY epic** (copy.ts → keyed dictionaries + a local language toggle + card-display.ts localization). Mirrors how Epic 3.3/3.5 were client-only surfaces.

### SCOPE LOCK (host-confirmed): v2 = exactly TWO features
1. **Language** — client-local per-player (see #10 above).
2. **Off-turn peek** — see your own card while waiting (see #13 below).
Everything else (Powers mode, reconnect/AR-15) is OUT of v2.

### Feature 2 · Off-Turn Peek — "see your own card before others act"

**Scenario (host's words):** Players A, B, C. It's A's turn. While A decides swap/keep, B and C can peek their OWN cards — before A acts.

**Decisions banked (host-confirmed):**
- **Press-and-hold** gesture (same as today's on-turn peek, Story 2.5).
- Available to **anyone NOT currently on-turn** — both waiting-to-act AND already-acted players.
- Card **hides on release** (secret from shoulder-glance).
- Peek **always shows your CURRENT card** — after a swap moves a card into your hand, peek shows the new card. Simplest, consistent rule.

**[#13] Off-Turn Peek — See Your Own Card While Waiting** ⭐ FEATURE 2
_Concept:_ Today peek (press-and-hold to reveal own card) is YourTurn-surface only. v2 extends the SAME gesture to the Waiting surface, so any off-turn player can glance at their own card while the active player decides. On-demand, hides on release.
_Novelty:_ Same press-and-hold mechanic already built (2.5) on a second surface — but the gameplay texture shifts: players sweat their card as the swap chain approaches, not only on their turn.

**Architecture note (grounded earlier):** The server already sends `you.hand` to its owner at ALL times via `projectStateFor` (project-state.ts) — secret-card invariant intact (only the owner ever receives it). So off-turn peek is **CLIENT-ONLY**: B's own card is already on B's device during A's turn; today's client simply chooses not to render it on the Waiting surface. ZERO server/contract change.

**[#14] The Live Swap-Chain Tell** (emergent gameplay consequence — design-aware, not necessarily a feature)
_Concept:_ Because peek shows your CURRENT card, a receiving neighbor who peeks right after a swap learns their new card the instant the swap lands — which reveals their neighbor's old card. This is information that the on-turn-only peek hid.
_Novelty:_ Names the one real gameplay shift of feature #2: off-turn peek slightly increases information flow down the swap chain. Likely FINE (and even fun — more sweating), but worth a deliberate playtest watch. NOT a blocker; flagged so it's a conscious choice, not a surprise.

## Idea Organization and Prioritization

**v2 = EXACTLY TWO CLIENT-ONLY FEATURES.** Both touch zero server code, zero shared contract (`types.ts`), zero persistence, zero projection — preserving the project's five-epic streak of zero-contract-change work. Powers mode and reconnect/AR-15 are explicitly OUT of v2.

### Theme A — Language / i18n
_Ideas: #1, #4, #5, #6, #7, #8, #10, #11, #12_
- **Architecture decision (#10):** CLIENT-LOCAL PER-PLAYER, stored in localStorage. (Reversed the initial room-level/lobby-only idea #1/#4 once the Explore agent confirmed the server is text-free and copy is fully client-side.)
- **Scope = all four tiers:** UI chrome (#5), warm authored-not-translated copy (#6), localized comedy sting (#7), Spanish card ranks (#8).
- **Picker placement:** Home/Join screen (#11). Host conducting needs no localization — it's a social channel (#12).
- **Work shape:** copy.ts → keyed multi-language dictionaries + a local language toggle + card-display.ts rank localization.
- **RESOLVED (2026-06-25):** Spanish card-rank glyphs = **A=As, J=Jota, Q="Q" (Reina), K="R" (Rey)**. Only the King glyph changes (K→R); Q stays "Q" to avoid the Reina/Rey "R" collision with zero ambiguity. Chosen over S/C/R (authentic Spanish baraja — too unfamiliar) and J/D/R (Dama). Suit ignored as in MVP; this is `card-display.ts` `rankToLetter` only (+ `rankSpeech` for the Spanish spoken names: As/Jota/Reina/Rey).

### Theme B — Off-Turn Peek
_Ideas: #13, #14_
- **Decision:** press-and-hold on the WAITING surface; available to ANY off-turn player (pre-act AND post-act); peek always shows the CURRENT card; hides on release.
- **Architecture:** `you.hand` is already sent to its owner on every state push → CLIENT-ONLY (render existing data on a second surface).
- **Playtest watch (#14):** the live swap-chain tell — slight increase in info flow down the chain. Likely fun, not a blocker.

**Prioritization (Impact × Feasibility × Alignment):**

| Priority | Feature | Rationale |
|---|---|---|
| 1 — Quick win | Off-Turn Peek | Smallest change; one mechanic onto one extra surface; effectively completes Story 2.5. |
| 2 — Headline | Language | Bigger (copy.ts dictionary refactor + 4 tiers + picker) but the marquee v2 feature; tiers ride on the refactor. |

### Action Planning
1. Settle the Q/K→"R" mapping in the PRD.
2. Run `bmad-prd` to formalize both features into a v2 PRD.
3. Run `bmad-create-epics-and-stories` → likely Epic 6 (Off-Turn Peek, ~1–2 stories) + Epic 7 (i18n, ~3–4 stories: copy refactor → dictionaries → picker → card ranks).
4. Carry the playtest watch on #14 (swap-chain tell).

## Session Summary and Insights

**Key Achievements:**
- Converged a fuzzy "what's next for v2" into a sharp, two-feature, client-only scope.
- Reversed a major architectural decision (room-level → per-player language) on evidence: the text-free server makes per-player LESS code than room-level — the opposite of the usual intuition.
- Confirmed both features are buildable with zero shared-contract change, preserving the project's streak and keeping v2 low-risk.

**Creative Breakthroughs:**
- **#10 — Client-local language is cheaper than room-level.** The server-never-sends-text design (originally a privacy/testability choice) turned out to make i18n almost free and per-player-capable.
- **#13/#14 — Off-turn peek is "already-on-device" data.** The secret-card projection already ships `you.hand` to its owner at all times; the feature is purely rendering it on the Waiting surface — with a named, watchable swap-chain side effect.

**Session Reflections:**
- Host drove tight convergence — declined Powers mode and reconnect early to focus on two features. Divergence was front-loaded (i18n tiers, personas) then cut decisively.
- The architecture-grounded Explore pass was the pivot point: it flipped a product decision and shrank the whole epic.


