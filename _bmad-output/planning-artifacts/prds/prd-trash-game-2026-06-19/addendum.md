# PRD Addendum — Trash

Depth that belongs to downstream work (architecture, UX spec) but does not live in the PRD body. Carried forward from the product brief and technical research so it isn't lost.

## Technical direction (for architecture)

**Hard constraints (also in PRD §11):** zero ongoing cost; server-authoritative state; secret Cards delivered only to their owner; state keyed to stable `playerId` + session token.

**Recommended stack (from technical research, re-verify free-tier limits at build time):**
- **PartyServer on Cloudflare Workers + Durable Objects** — one Durable Object per room/Table.
- **PartySocket** web client, served free via **Cloudflare Pages**.
- **JSON over WSS.**
- Rationale: the only validated free option supporting long-lived WebSockets that wakes instantly (hibernation) and is private-by-default for secret cards.
- **Fallback:** Node + Socket.IO — but not free at always-on (Render free tier sleeps with cold starts).

**Engineering decisions:**
- Keep game rules as **pure, transport-agnostic functions** — insurance against PartyServer ecosystem flux post-acquisition, and the basis for unit tests.
- **TypeScript.**
- Shuffle: **Fisher–Yates seeded by a CSPRNG**, not `Math.random()`.
- Reference: WebSocket event protocol, phase state machine, and 6-step implementation roadmap in `_bmad-output/planning-artifacts/research/technical-realtime-multiplayer-web-game-architecture-research-2026-06-18.md`. Re-verify current Cloudflare free-tier limits and PartyServer entry point at build time.

## King handling — why social-only (decision rationale, for architecture)

App-enforced King-blocking was considered and **rejected** during PRD finalize. Because "holds a King" would be the only reason the app ever refuses a Swap, any refusal is biconditional with "neighbor holds a King" — so the swapper (and any observer watching the turn indicator stall) could deduce the secret Card with certainty, before Showdown. Neutral message wording doesn't help: the *fact* of refusal is the leak. That directly breaks the one hard rule (§11.1 / SM-6). Resolution: **the King is social-only** — the app has zero King logic and never branches on a non-owner's Card value before the simultaneous reveal. Architecture implication: the rule engine must never need to read another Player's Card to validate a Swap.

## Powers mode (v2) — design rationale (carried from brief, for future design)

The v2 headline is **Powers mode** (player-triggered): Jack = Spy (peek), Queen = Thief (steal a life), King = Blocker. Two load-bearing design constraints from the brief:
- **Number cards and Ace stay "pure"** — they get no powers, so the core read/squirm stays clean and the base game is still legible underneath the powers layer.
- **Powers are player-triggered**, which is what adds the bluff/timing dimension (deciding *when* to spend a power) on top of Classic. Note: a player-triggered King Blocker in Powers mode would face the same secret-leak problem as the rejected MVP enforcement — revisit the privacy model when designing Powers.

## Positioning depth (for any future product/marketing work)

- 200-year-old public-domain folk game lineage: Screw Your Neighbor / Chase the Ace / Cuckoo. No technical moat — advantage is positioning + execution.
- Empty-spot claim: nothing found does all five at once — free + no-download + everyone-own-phone + in-person + this game. Existing digital versions are remote-online (chasetheace.cards, Whoops-ie, Techu); in-person analogs need a shared screen and/or cost money (AirConsole, Jackbox, Bunch). Stated as an execution opportunity, not a defensible moat. (Competitive-scan confidence: high on web versions being remote-oriented; could not exhaustively crawl app stores.)
- Vision path = deeper, not bigger: Powers mode (v2) → light round modifiers, cross-night bragging rights, theme/character. All are "more reasons for the same table to play one more round," not growth levers. Built for the maker's own people; spread is a welcome bonus, not the plan.

## Core-fun framing (carried from brief, for UX)

- Two co-equal emotional beats: the **squirm** of shoving trash onto your neighbor (Swap decision) and the **simultaneous reveal** (the "OHHH" flip). Secrecy-until-Showdown serves the laugh (surprise), not only strategic reading.
- Two design gates: Host (activation) and Reluctant Player (weakest-link). Design wins or loses at these two.
