# Adversarial Review — Trash PRD (2026-06-19)

Reviewer posture: adversarial / red-team, focused on rules-correctness and the one hard integrity rule (PRD §11.1, SM-6): *a secret Card reaches only its owner until Showdown.*

Scope reviewed: `prd.md` (full), `addendum.md` (full).

Verdict in one line: the privacy rule is **broken by design** at FR-8 (the King Block is a deterministic 1-bit information leak), and the core Swap mechanic (FR-6/FR-7/Glossary) is **underspecified and internally contradictory** to the point of being unimplementable as written.

Findings are ordered by severity.

---

## CRITICAL

### F-1 — King Block refusal is a deterministic secret-Card leak (violates §11.1 / SM-6)
**Severity:** Critical
**Location:** FR-8, FR-8 Feature-NFR, §11.1 third bullet, Glossary "King Block", addendum "King Block — privacy implementation note", UJ-2 edge case.

**Attack (full inference walk):**
1. The published rule (Glossary "King Block", FR-8) states the *only* condition under which a Swap is refused is that the target holds a King. There is no other documented block condition.
2. Player A attempts Swap onto the player to their right, B. The server refuses with the neutral message "that player can't be swapped into right now" (FR-8 Consequence 1).
3. A, knowing the rules, performs a one-step deduction: *refusal ⇔ B holds a King.* The inference is **deterministic and 100% certain**, because the refusal predicate is biconditional with "B holds King."
4. The neutrality of the message wording (FR-8 Consequence 2) is irrelevant. The PRD's defense protects against leaking *via message content*, but the leak vector is the **fact of refusal itself**, which is observable regardless of wording. FR-8 even concedes the message carries "the fact of the block" — that fact *is* the King.

This means A now knows B's exact secret Card (King) before Showdown. King is also the single most game-relevant value to know (it is the guaranteed non-loser and the only "safe" card). SM-6 is explicitly pass/fail — "No Player can see another's secret Card before Showdown — not in the UI, not in network traffic." A learns B's card with certainty through normal, intended app behavior. **The MVP as specified fails its own one hard integrity rule.**

**Information accumulation across turns:** It compounds. Because only the player to your *right* can be Swap-targeted (FR-6), each refusal pins one specific neighbor as a King-holder. With re-attempts or across the natural flow, multiple Kings on the table become known. A savvy table quickly maps out who is "safe," degrading both the secrecy guarantee and the "squirm/surprise" core beat the PRD says secrecy exists to protect (addendum "Core-fun framing").

**Is the documented fallback adequate?** Partially, but it is mis-framed. FR-8 Notes and the addendum offer "fall back to social-only King handling" *only if a playtester is observed inferring a King.* This treats a deterministic, provable leak as a maybe-it-won't-be-noticed risk. It is not a perceptual risk; it is a logical certainty. The fallback should not be conditional on playtest observation — the leak exists on paper.

**Suggested fix (choose one, and state it as a decision, not a deferral):**
- **(A) Drop server-side King enforcement; go social-only.** This is the clean way to preserve SM-6 as literally written. The app never refuses a Swap; humans honor the King rule socially. No leak because the server never reveals the block.
- **(B) Make the block predicate non-biconditional so refusal is not diagnostic.** E.g., the server *probabilistically or always* blocks/redirects in ways not tied solely to King (impractical and confusing — not recommended).
- **(C) Re-scope SM-6.** If King enforcement is kept, SM-6 must be rewritten to admit "...except the binary fact that a Swap target holds a King, which is intentionally inferable." This makes the rule honest, but the PRD currently claims the opposite (FR-8 NFR, §11.1) — pick one and stop claiming non-leakage.

Whatever is chosen, the PRD currently asserts both "King Block enforced server-side, privacy-preserving" (FR-8 title, §6.1) *and* "secret Card never inferable" (§11.1, SM-6). Those two claims are mutually exclusive. This contradiction must be resolved before architecture work.

---

### F-2 — Swap card-movement model is incomplete and contradictory (unimplementable as written)
**Severity:** Critical
**Location:** Glossary "Swap", FR-6 Consequence "Swap", Player definition (§3), FR-7.

**The contradiction:**
- Glossary "Player": "Holds at most one Card at a time during a round."
- FR-6 "Swap": "the active Player's Card moves to the Player on their right; that Player now holds it."

If A Swaps onto B, FR-6 says B "now holds" A's card. But B already held a card. After the move, what does B hold — one card or two? And critically, **what does A hold?** FR-6 never says. The text describes a one-way *move*, not a *swap*. A one-way move would leave A holding nothing (violating the round model where every Player reveals a Card at Showdown) and leave B holding two cards (violating "at most one Card").

The name "Swap" implies an *exchange* (A gets B's old card, B gets A's old card), which is the actual mechanic of the source folk game (Screw Your Neighbor: you trade with your right-hand neighbor). But FR-6's prose describes a non-reciprocal push ("force ... onto," "moves to," "taking nothing in return"). These are two different games.

**The Glossary entry is literally garbled:** "Swap — Turn action: force your Card onto the Player to your right, **taking nothing in return is not how it works** — see FR-6." This sentence is broken English and self-negating; a downstream implementer cannot derive the mechanic from it. It appears to be a half-finished edit. The Glossary is declared the authoritative vocabulary source (§3 header: "must use these terms exactly... no synonyms"), so a broken canonical definition poisons everything downstream.

**Trace — 3 players (Host A, then B to A's right, then C to B's right; circle C→A):**
- Deal: A=card_a, B=card_b, C=card_c.
- A's turn: A Swaps onto B. Under "exchange" reading: A=card_b, B=card_a. Under "one-way push" reading: B=??? (holds card_a AND card_b?), A=nothing.
- B's turn: B Swaps onto C. Ambiguity now cascades — which card does B push if B holds two? The model does not say.
- C is Last Player (see F-3): C Swaps onto A or draws from Deck.
- Result: under the only coherent reading (exchange), every player ends with exactly one card and the trash has circulated. Under FR-6's literal text, the card count is broken by the first Swap.

**Trace — heads-up / 2 players (FR-7):**
- P1 Swaps onto P2: exchange → P1=card2, P2=card1. One-way → P2 holds both, P1 holds nothing. FR-7 then says P2 (Last Player) "may Swap with Player 1 or draw." Note FR-7 *does* use the word "Swap **with**" (reciprocal) for the Last Player, while FR-6 uses "force ... onto" (non-reciprocal) for everyone else. **The two FRs use two different mechanics.** This is a direct internal contradiction within the same round loop.

**Suggested fix:** Pick the exchange model (it is the only one that keeps "one Card per Player" invariant and matches the source game and the word "Swap"), then rewrite consistently:
- Glossary "Swap": "Swap — Turn action: exchange your Card with the Player to your right. You give them your Card and receive theirs. Each Player still holds exactly one Card."
- FR-6 Consequence: "Swap: the active Player and the Player to their right exchange Cards; each then holds the other's former Card. The Turn passes to the right."
- Reconcile FR-7's "Swap with" so it means the same operation as FR-6.
- Then re-examine the brief's "squirm of shoving trash onto your neighbor" framing — an *exchange* means you also receive their card, which changes the emotional beat the PRD sells. If the intended feel really is a one-way push, then the round model (one card per player, simultaneous reveal of all) must be redesigned, because a one-way push cannot preserve one-card-per-player. Either way, the current text cannot ship.

---

## HIGH

### F-3 — "Last Player" is well-defined only by accident; depends on the unconfirmed "Host starts" assumption
**Severity:** High
**Location:** Glossary "Last Player", FR-5 Consequence 4, FR-7, §8 OQ-1, §9 (assumption).

**Attack:** "Last Player" = "the final Player to act in a Round's turn order" (Glossary). Turn order is "Host starts, play passes to each Player's right" (FR-5). The Last Player is therefore the Player immediately to the Host's *left* (the one whose right-hand neighbor is the Host) — i.e., the last seat reached before the turn would wrap back to the Host. This is computable, but only because the Host-starts rule is fixed.

However, §8 OQ-1 and §9 leave "Host starts every Round" as an **unconfirmed `[ASSUMPTION]`**, and explicitly floats rotating the start (e.g., loser/winner starts). If the start rotates, "Last Player" silently redefines each round, and any code or copy that hard-codes "Last Player = Host's left neighbor" breaks. The Last Player is the only seat with the special deck-draw power (FR-7), so this is mechanically load-bearing, not cosmetic. An open question this central should not be left open going into architecture.

Also: the turn order never explicitly states the loop terminates *before* returning to the Host (no second go-around). It is implied by "Last Player" but never stated as a Consequence in FR-6. An implementer could read FR-6's "the Turn passes to the right" as unbounded.

**Heads-up check (FR-7):** "Player 2 is the Last Player" — consistent with the rule (P1 = Host starts, P2 is to P1's right and is the last/only other seat). ✔ This case is fine, *given* Host-starts.

**Suggested fix:** Promote OQ-1 to a decision before build. State explicitly in FR-6/FR-7: "Turn order is exactly one pass: it begins at the starting Player and ends at the Player whose right-hand neighbor is the starting Player (the Last Player). Play does not wrap back to the starting Player." Define "Last Player" relative to "the starting Player," not "the Host," so it survives a future rotation decision.

### F-4 — Two-deck Showdown lowest-card / tie computation is underspecified beyond "ties happen"
**Severity:** High
**Location:** FR-10, FR-11, FR-13, Glossary "Loser", §8 OQ-3.

**Attack:** With two Decks (>10 Players, FR-13), duplicate values exist by design. FR-10 says "Ace is lowest... Player(s) holding the lowest Card are highlighted as Loser(s); a tie highlights all tied Players." That covers *value* ties. But several things are unspecified:
1. **Suit/rank within a value:** Cards have suits (it's a 52-card deck). Are two Aces of different suits a tie, or does suit break it? The PRD treats a Card as having only a value (Glossary "Card" — "a value Ace through King"), implying suit is ignored. If so, state it. If not, FR-10 is wrong. As written, value-only is implied but never asserted, so an implementer might import suit ordering from real cards and silently create a non-tie where the design wants a tie.
2. **Deck-draw discard and remaining-deck composition (FR-7):** The Last Player's discarded Card is "removed from play for the Round." With two decks merged, is the deck a single shuffled 104-card pile, or two separate piles? FR-13 says "two Decks" but never says they are merged into one draw pile. The deck-draw randomness and duplicate distribution depend on this.
3. **All-tie / everyone-lowest degenerate case:** If every remaining Player holds the same value (possible and far more likely with duplicates, or trivially in a 2-player round), all players are Losers and all lose a life simultaneously (FR-11). Is that intended? In heads-up with one deck this can also happen (two equal values impossible with one deck unless... never with one deck; but with the Last Player's deck-draw it's still one-deck values so no dup — fine). At large tables, a "everyone loses a life" round is possible. Not addressed.

OQ-3 acknowledges tie *frequency* as a fun question but does not resolve the *computational* ambiguities above.

**Suggested fix:**
- State in FR-10/Glossary "Card": "Only the value (Ace=1 ... King=13) determines lowest; suit is ignored entirely for Showdown comparison." (Or define a suit tiebreak — but value-only matches the tie-tolerant design.)
- State in FR-7/FR-13 whether two Decks form one merged draw pile and how the draw pile relates to dealt Cards.
- Add a Consequence for the degenerate "all tied" case (acceptable: every tied Player loses one Life), so it is explicitly in-scope rather than a surprise.

---

## MEDIUM

### F-5 — Peek/Hide control is a local-screen leak surface with no specified guardrail
**Severity:** Medium
**Location:** FR-6 Consequence 1 ("a control to peek and hide their own Card"), §10, UJ-2, §11.1.

**Attack:** The integrity rule is about *network/other devices*, but the round's secrecy in a shared physical room also depends on the owner's own screen. The whole game is people sitting together looking at each other's phones. "Peek and hide" implies the card is hidden by default and shown on demand — good — but the PRD never specifies: (a) default state is hidden, (b) the card auto-hides after a short interval or on losing turn-focus, (c) the card is never persistently displayed. UJ-2 shows Beto peeking then the card being "gone" after Swap, implying transient display, but it's not a Consequence. Without "auto-hide," a player who peeks and sets the phone down leaks to the neighbor leaning over — the exact in-person threat model the product lives in. This is not the §11.1 network rule, but it is the same secret-Card-secrecy goal in the physical channel the product explicitly targets.

**Suggested fix:** Add FR-6 Consequences: "The owner's Card is hidden by default; peeking requires an explicit hold/tap; the Card re-hides automatically when the peek control is released and is never shown persistently." Hand the visual treatment to the UX spec but assert the auto-hide invariant here.

### F-6 — Turn indicator / phase transitions: timing and elimination can leak indirectly
**Severity:** Medium
**Location:** FR-6 (inactive screens show "whose Turn"), FR-8 (server timing), FR-11 (elimination), §11.1.

**Attack (timing side channel, ties to F-1):** §11.1 and FR-8 NFR ask that there be "ideally no observable difference in message shape/timing" between a generic refusal and a King refusal. But the deeper timing issue: a King Block refusal is the *only* case where an action is rejected and the turn does *not* advance. Inactive devices see "whose Turn it is." If A's Swap is refused, the turn indicator does **not** move (A must now Keep/draw), whereas a successful Swap/Keep advances it. An observer (or B themselves) watching the turn indicator stall on A sees "A's action was rejected" → King inference, again. So the leak in F-1 is also observable to *third parties* via the public turn indicator, not just to A. This widens F-1's blast radius.

**Suggested fix:** Tie to F-1's resolution. If King enforcement is dropped (F-1 fix A), this disappears. If kept, the turn indicator must not betray a rejected action (e.g., refusal is invisible to non-actors and the actor silently re-chooses), which is hard — another argument for social-only.

### F-7 — Re-deal preserves no card state, but "removed from play for the Round" + re-deal interaction is unstated
**Severity:** Medium
**Location:** FR-7 (discard "removed from play for the Round"), FR-12 (Re-deal "returns to FR-5"), FR-5 ("freshly shuffled Deck").

**Attack:** FR-7 removes the Last Player's discarded card "for the Round." FR-5 says each Deal uses "a freshly shuffled Deck." So on Re-deal, the full Deck returns — consistent. But this is only consistent if "freshly shuffled Deck" means the *complete* Deck is reconstituted every Round (discards return). It is never stated that removed/discarded Cards come back at the next Deal. An implementer carrying a depleting deck across rounds would slowly run out of cards. Minor, but a real gap given FR-13 deck-scaling math depends on full deck size.

**Suggested fix:** State in FR-5/FR-12: "Each Deal reconstitutes and re-shuffles the full Deck(s); Cards removed in a prior Round return."

---

## LOW

### F-8 — Deal does not specify simultaneous private delivery vs. staggered; minor leak-adjacent ambiguity
**Severity:** Low
**Location:** FR-5, UJ-1 climax ("every phone... at the same moment").
FR-5 says each Player's value goes only to that device (good, satisfies §11.1). UJ-1 wants simultaneity for the beat. Neither is contradicted, but FR-5 has no Consequence asserting the deal is private *per device* AND surfaced simultaneously. Low risk, but worth one explicit Consequence so the "ten seconds quiet" beat is testable and the privacy and timing requirements are not conflated.
**Fix:** Add FR-5 Consequence: "Each device receives only its own Card value, and all devices transition to the dealt state together."

### F-9 — "Last Player standing wins" vs. simultaneous tie elimination edge case
**Severity:** Low
**Location:** FR-11, FR-12.
If a Showdown tie causes the *last two* remaining Players to both hit zero Lives in the same Showdown (both are Losers, both at 1 Life), FR-12's "exactly one non-eliminated Player remains" is false — *zero* remain. The win condition has no rule for "everyone eliminated simultaneously." Rare but reachable, especially with duplicate-heavy two-deck ties (F-4).
**Fix:** Add FR-12 Consequence for the zero-survivors case (e.g., "draw," or the tied Players share the win, or sudden-death re-deal among them).

### F-10 — Glossary "Swap" cross-reference loop and broken sentence (editorial, but it's the canonical source)
**Severity:** Low (editorial) / contributes to Critical F-2.
The Glossary "Swap" entry is grammatically broken and defers entirely to FR-6 ("see FR-6"), while FR-6 itself is incomplete (F-2). The single authoritative definition is non-functional. Fix as part of F-2.

---

## Summary table

| ID | Sev | One-line |
|----|-----|----------|
| F-1 | Critical | King Block refusal deterministically leaks "B holds a King" — breaks SM-6 / §11.1 by design. |
| F-2 | Critical | Swap card-movement model is contradictory/incomplete (Glossary garbled; FR-6 one-way push vs FR-7 "swap with"); unimplementable. |
| F-3 | High | "Last Player" only well-defined under the unconfirmed "Host starts" assumption (OQ-1); one-pass termination never stated. |
| F-4 | High | Two-deck lowest-card/tie computation underspecified: suit handling, merged vs split deck, all-tie degenerate case. |
| F-5 | Medium | Peek/Hide has no auto-hide/default-hidden invariant — in-person screen leak in the product's own threat model. |
| F-6 | Medium | Turn-indicator stall on a refused Swap leaks the King block to third parties (widens F-1). |
| F-7 | Medium | Deck reconstitution across Re-deals never stated; deck could deplete. |
| F-8 | Low | Deal lacks an explicit per-device-private + simultaneous Consequence. |
| F-9 | Low | No rule for simultaneous total elimination (zero survivors) at Showdown. |
| F-10 | Low | Canonical Glossary "Swap" entry is grammatically broken (rolls into F-2). |

**Bottom line:** Two Critical findings block the PRD's central claims. F-1 means the headline integrity guarantee (SM-6, the stated pass/fail bar) is violated by an intended feature; the PRD simultaneously asserts the feature is "privacy-preserving" and that no secret Card is inferable — those cannot both be true. F-2 means the core verb of the game ("Swap") has no coherent definition. Both must be resolved before UX/architecture proceed; the cleanest resolution to F-1 is dropping server-side King enforcement (social-only), which also dissolves F-6.
