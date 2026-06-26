---
title: Trash v2
status: final
created: 2026-06-25
updated: 2026-06-25
supersedes: none (extends prd-trash-game-2026-06-19, which remains the MVP baseline)
---

# PRD: Trash v2

## 0. Document Purpose

This PRD scopes **v2** of Trash — the first feature release after the MVP shipped, deployed to the Cloudflare edge, and passed its live playtest. It defines exactly two additions and explicitly defers everything else. It extends, and does not replace, the MVP PRD (`prd-trash-game-2026-06-19`); all MVP functional requirements, the FR numbering (this doc continues from FR-14), the standing gates (G1 eyes-up, G2 zero-cost), and the privacy invariant remain in force.

## 1. Vision

Make Trash feel like *our* game at *our* table — in our language, with no one left squinting at a button they can't read or waiting blind for a swap they can't anticipate. v2 widens the welcome (Spanish, per player) and deepens the tension (every player can sweat their own card as the swap chain crawls toward them), without adding a single new thing the host has to conduct or the server has to know.

## 2. Target User

The same family-and-friends table from the MVP — with two members now explicitly served:

- **The Spanish-speaking relative** (e.g. an abuela) who joins on a phone handed to her and wants the buttons, the warm lines, and the loser sting in Spanish — at a table where others may be reading the same game in English.
- **The waiting player** (anyone whose turn it isn't) who, in the MVP, could only see *whose* turn it was — and now can glance at their own card while the action approaches.

No new persona is introduced. v2 lowers two friction points for people already at the table.

### 2.1 Key User Journeys

> **UJ-4 — Abuela plays in Spanish at a mixed table.**
> Abuela's grandson hands her his phone at the Home screen. She taps the language toggle to **Español** before entering the room code. From that moment her device speaks Spanish — "Es tu turno", "Cambiar / Quedarse", the loser line, the card faces (As, Jota, Reina, Rey) — while her grandson three seats over keeps playing in English on his own phone. Nobody had to set a table language; nobody else's screen changed.

> **UJ-5 — A waiting player sweats the swap chain.**
> It's Ana's turn; Beto and Carla are waiting. Beto presses and holds his card to remind himself what he's holding as the swap chain develops, then lets go — it hides again. Later, after a swap lands a new card in his hand, he peeks again and sees the *new* card. He's never on the clock when he peeks, and the card is never shown to anyone but him.

## 3. Glossary

Terms inherited from the MVP PRD unless noted. New/clarified for v2:

- **Locale / Language** — a per-player, per-device UI language preference (currently English or Spanish). A property of the *device*, not the Table.
- **Off-Turn Peek** — pressing-and-holding to reveal one's own Card while it is *not* one's Turn (extends the MVP on-Turn peek, FR-9-era, to the Waiting surface).
- **Comedy Sting** — the loser's-device moment at Showdown (sound/visual), now localizable.

## 4. Features

Both features are **client-only**: they touch no shared wire contract (`types.ts`), no server handler, no persistence, and no per-player state projection. This preserves the project's MVP-long streak of zero-contract-change work and keeps v2 low-risk. Build order: **Feature 4.2 (Off-Turn Peek) first** as the quick win, then **4.1 (Language)** as the headline.

### 4.1 Language (per-player, client-local)

The MVP's user-facing text lives entirely on the client (`copy.ts`, 33 entries) and the server is text-free — it sends only structured codes (`ErrorReason`, `loserIds`, `phase`) that the client turns into words. Because of this, language is a *client-local* preference: each player chooses their own, stored on their own device, with no server awareness. This is both less code than a room-level setting **and** the only model that supports a mixed-language table.

#### FR-15: Choose a language on your own device

A Player can choose their UI language on their own device, before or during a session, and it persists on that device.

**Consequences (testable):**
- A language toggle is available on the **Home / Join surface** — reachable *before* entering a Room Code, so the choice is made off the clock.
- The chosen language is stored in the device's `localStorage` and survives reload and re-join; a returning device defaults to its last choice.
- Language is **per-device**: changing it on one Player's phone changes nothing on any other Player's phone, and nothing on the Table/server.
- Supported languages in v2: **English** (default) and **Spanish**. The toggle itself is legible in both states (e.g. flag + label, not color alone) per G1/accessibility.
- `[ASSUMPTION]` First-run default is English (the MVP language); a device with no stored preference shows English. Confirm if a device-locale auto-detect is wanted instead — deferred as an enhancement, not v2.

#### FR-16: Spanish UI chrome (Tier 1)

All mechanical UI text localizes to the chosen language.

**Consequences (testable):**
- Every button, prompt, and status line renders in the chosen language — e.g. "Es tu turno", "Cambiar / Quedarse", "Mostrar las cartas", "Sala: ABCD".
- No user-facing string remains hardcoded English when Spanish is selected; `copy.ts` becomes a keyed dictionary with one entry per language and every surface reads through it.
- Parameterized strings (loser(name), winner(name), roomCode(code), etc.) localize with their parameters intact and grammatically natural in Spanish.
- The Room Code itself is **not** translated (it's a 4-letter code, language-neutral); only its surrounding label localizes.

#### FR-17: Warm moments, authored not machine-translated (Tier 2)

The emotional copy — loser, winner, waiting, elimination lines — is *authored* in Spanish to match the MVP's playful, non-punishing voice, not literally translated.

**Consequences (testable):**
- The loser and winner lines in Spanish are tone-matched to the English originals' warmth (e.g. a Spanish loser line lands as gentle ribbing, never "YOU LOST"), reviewed by a human ear.
- Co-winner joining ("Ana and Ben" → "Ana y Ben"; the 3+ Oxford-style list) reads naturally in Spanish grammar.
- `[NOTE FOR PM]` Spanish warm copy is a *creative* deliverable, not a string-swap. Treat it like the original copywriting pass: it can be drafted in the build but should get a delight-pass review.
- **Definition of Done:** because "tone-matched" is subjective, the Spanish warm copy is not complete until a fluent Spanish speaker reviews it for warmth/voice and signs off. **Approver: Dennis** (or a fluent-Spanish reviewer he designates). This sign-off is the FR-17 acceptance gate.

#### FR-18: Localized comedy sting (Tier 3) — SATISFIED BY DESIGN

The loser's-device comedy moment at Showdown carries no language content (it is purely visual), so it is language-neutral and needs no localization in v2.

**Consequences (testable):**
- The comedy sting presents identically regardless of the device's chosen language (it contains no words or spoken audio).
- **RESOLVED (2026-06-25):** the current/planned sting is purely visual → Tier 3 is satisfied by design and carries no v2 work. Should a future sting gain words or spoken audio, this FR re-activates: the loser-device-only, Showdown-only sting would then present in that device's chosen language.

#### FR-19: Spanish card ranks (Tier 4)

Card face glyphs and spoken (screen-reader) names localize.

**Consequences (testable):**
- Rank glyphs in Spanish: **A = As, J = Jota, Q = "Q" (Reina), K = "R" (Rey).** Only the King glyph changes from the English face (K→R); the Queen glyph stays "Q" to avoid the Reina/Rey "R" collision.
- **Intentional glyph/speech mismatch:** the Queen's *glyph* stays "Q" while its *spoken* name is "Reina" — this is deliberate (the glyph avoids the R-collision; the speech is fully Spanish). Not a bug; do not "fix" the glyph to match the speech.
- Spoken/screen-reader names in Spanish: **As, Jota, Reina, Rey** (and the number cards in Spanish).
- Suit remains ignored by the game (as in the MVP) — this tier touches only the four face-rank glyphs and the spoken names in `card-display.ts` (`rankToLetter` / `rankSpeech`). Rank *comparison* stays integer-based and unchanged.
- `[NOTE FOR PM]` Rejected alternatives (authentic baraja Sota/Caballo/Rey = S/C/R; Dama = J/D/R) are recorded in the addendum.

### 4.2 Off-Turn Peek

In the MVP, a Player can press-and-hold to peek their own Card **only on their own Turn**; while waiting, they see only whose Turn it is. v2 extends the identical gesture to the Waiting surface so a Player can study their hand as the swap chain develops. The data requires no server change: the server already sends each Player their own `you.hand` on every state push (the secret-card projection chokepoint), so the card is already on the device — the client simply renders it on a second surface.

#### FR-20: Peek your own Card while waiting

A Player who is not currently on their Turn can press-and-hold to reveal their own Card.

**Consequences (testable):**
- The peek gesture is **press-and-hold**, identical to the MVP on-Turn peek; the Card **hides on release** (and on focus-loss / page-hide, matching the MVP peek's safety behavior).
- Peek is available to **any Player whose Turn it is not** — both those waiting for their first Turn and those who have already acted.
- The peek is **not** available to the Player whose Turn it currently is via this surface (they peek through the existing on-Turn affordance) — i.e. the two peek affordances are mutually exclusive by surface, never doubled.
- Peek **always shows the Player's current Card**: if a Swap has moved a new Card into their hand, the peek shows the new Card.
- The privacy invariant holds: a Card is shown only to its owner's device and only while that owner is actively holding the gesture. No Card is broadcast; no other Player's Card is ever revealed by this feature.

## 5. Non-Goals (Explicit)

Carried from the MVP, plus v2-specific:

- **Not** room-level / host-controlled language. Language is per-device by deliberate design (mixed-language tables are a feature, not a bug).
- **Not** server-aware language. The server stays text-free and language-blind.
- **Not** mid-feature scope creep: no third language beyond English/Spanish in v2, no per-Table language lock, no translation of Player names or Room Codes.
- **Not** Powers mode (still the headline beyond v2).
- **Not** reconnect / socket-liveness (AR-15) — still an accepted non-goal.

## 6. v2 Scope

### 6.1 In Scope
- FR-15, FR-16, FR-17, FR-19: per-player client-local language (English/Spanish) — chrome, authored warm copy, and Spanish card ranks.
- FR-18 (comedy sting, Tier 3): **satisfied by design** — the sting is purely visual; no v2 work.
- FR-20: off-Turn peek on the Waiting surface.

### 6.2 Out of Scope for v2
- **Powers mode** (Jack=Spy, Queen=Thief, King=Blocker) — deferred to **a later release**; carries an unresolved secret-card info-leak problem for King (see addendum).
- **Reconnect / socket-liveness (AR-15)** — deferred; accepted non-goal.
- **Additional languages** beyond English/Spanish — deferred; the FR-16 dictionary refactor makes adding a third language cheap later.
- **Device-locale auto-detect** for the first-run language default — deferred enhancement (FR-15 assumption).

## 7. Success Metrics

> **SM-3 — "She just played."** A Spanish-speaking relative at a mixed table plays a full session in Spanish without needing a translator for the buttons or the result. Validates FR-15, FR-16, FR-17, FR-19. *Target: observed — at least one mixed-language sitting where the Spanish player needs no UI help.*

> **SM-4 — Sweating the chain.** Waiting players use the off-Turn peek to track their hand as the swap chain approaches, raising table tension rather than confusion. Validates FR-20. *Target: observed — players peek while waiting and react to the chain; no one is confused about whose card they're seeing.*

**Counter-metrics:**

> **SM-C3 — No accidental Babel.** A mixed-language table never produces a coordination failure — e.g. a Spanish player and an English player disagreeing about game state because their screens "said different things." (They shouldn't: only *language* differs, never *state*.) *Watch: any report of "my screen said X, yours said Y."*

> **SM-C4 — No leak, no cheating.** The off-Turn peek never reveals another Player's Card, and the "swap-chain tell" (a receiver learning a neighbor's old card by peeking right after a swap) does not sour play into accusations of cheating. *Watch: this is the one deliberate playtest observation for v2.*

## 8. Open Questions

- ~~**Spanish card-rank glyph collision (Q/K both want R).**~~ **RESOLVED (2026-06-25):** A=As, J=Jota, Q="Q" (Reina), K="R" (Rey). Only the King glyph changes.
- ~~**Room-level vs per-player language.**~~ **RESOLVED (2026-06-25):** per-player, client-local — cheaper and enables mixed-language tables.
- ~~**Comedy sting contents (FR-18).**~~ **RESOLVED (2026-06-25):** the sting is purely visual (no words/audio) → Tier 3 satisfied by design, no v2 work.
- **[OPEN — non-blocker] Swap-chain tell.** Does off-Turn peek's slight increase in information flow down the swap chain help (more sweating) or hurt (feels like cheating)? Resolve by observation in the first v2 playtest, not by design. Owner: Dennis.
- **[OPEN — minor, deferred] First-run language default (FR-15).** English default vs device-locale auto-detect. Defaulted to English for v2; revisit as a later enhancement.

## 9. Assumptions Index

- `[ASSUMPTION]` FR-15: first-run default language is English; no auto-detect in v2.
- `[ASSUMPTION]` The MVP on-Turn peek's safety behaviors (hide on release / focus-loss / page-hide) are the contract FR-20 mirrors verbatim.
- (FR-18 comedy-sting assumption resolved 2026-06-25: sting is purely visual → satisfied by design.)

## 10. Aesthetic & Tone

Unchanged from the MVP — **eyes up, not down (G1).** v2 must not turn the app into more of a screen: the language toggle is a one-time, off-the-clock choice on the Home surface; the off-Turn peek is a deliberate press-and-hold, not an always-on display that invites staring. Spanish copy carries the same warm, playful, non-punishing voice as the English (FR-17) — the warmth is the product, in either language.

## 11. Constraints & Guardrails

### 11.1 Privacy / Integrity (hard rule)
The MVP invariant holds without exception: **a secret Card is sent only to its owner and never broadcast.** FR-20 changes only *when the owner's own already-delivered card is rendered on their own device* — it sends nothing new over the wire and reveals nothing to anyone else.

### 11.2 Cost (hard constraint — G2)
Zero ongoing cost at family/friends scale. Both v2 features are client-only — no new server compute, storage, or external service — so G2 is preserved by construction.

### 11.3 Zero contract change
v2 introduces **no change** to the shared wire contract (`types.ts`), server handlers, persistence, or per-player state projection. Any proposed v2 work that would require a server or shared-contract change is out of scope by definition and must be re-PRD'd.
