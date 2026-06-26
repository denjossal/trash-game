# Trash v2 PRD — Addendum

Depth that belongs downstream (architecture / UX / epics) or earned a place but doesn't fit the PRD body: rejected-alternative rationale, mechanism decisions, and the technical-how.

## A. Why per-player client-local language (rejected: room-level)

**Decision:** language is a per-device `localStorage` preference; the server never learns it.

**Why room-level was rejected.** Dennis initially chose room-level (host picks one Table language, lobby-only) for *simplicity*. An architecture pass reversed it on evidence:

- All user-facing copy is client-side in `client/src/lib/copy.ts` (33 exports: 14 consts + 19 parameterized fns like `loser(name)`).
- **The server is text-free.** It sends only structured codes — `ErrorReason` enum (`types.ts`), `loserIds`/`winnerIds`/`phase` — and the client maps codes → copy (e.g. `Home.svelte` maps `room-full` → `TABLE_BUSY`).
- `projectStateFor(state, playerId)` already sends a per-player payload (own hand only).
- The rank→letter map is pure and client-only in `card-display.ts`.

Consequence: a room-level language would have to *add* a `TableState` field + a host-config handler + persistence + projection — strictly more moving parts. Per-player-local touches none of that, and it uniquely enables the mixed-language table (the abuela-and-grandson scenario that motivated the whole feature). Less code **and** more capable — the rare case where the better product option is also the cheaper build.

## B. Spanish card-rank mapping — options considered

**Chosen:** A=As, J=Jota, **Q="Q" (Reina), K="R" (Rey)**. Only the King glyph changes.

| Option | Mapping | Verdict |
|---|---|---|
| **Keep Q, change K** ✅ | A / J / **Q** / **R** (As/Jota/Reina/Rey) | **Chosen.** Minimal change, zero ambiguity, no R/R collision (Q stays "Q"). |
| Authentic baraja | A / **S** / **C** / **R** (As/Sota/Caballo/Rey) | Rejected — Caballo (horse) replaces Queen; too unfamiliar for players raised on French-suited decks. |
| Dama for Queen | A / J / **D** / **R** (As/Jota/Dama/Rey) | Rejected — clean and all-Spanish, but Dennis preferred the minimal one-glyph change. |
| No glyph localization | A / J / Q / K | Rejected — drops Tier 4; loses the "this game speaks my language" card-face payoff. |

Suit is ignored by the game (MVP property) so this is purely the four face-rank glyphs + the spoken names. Rank comparison stays integer-based.

## C. Implementation shape (informative — for architecture/epics, not a commitment)

**Feature 4.1 (Language) — client-only:**
- Refactor `copy.ts` from flat exports into a keyed dictionary with one table per language; every surface reads through a `t(key, params)`-style accessor.
- A small language store/context reads the `localStorage` preference and selects the dictionary; reactive so a toggle re-renders.
- Language toggle component on the Home/Join surface.
- `card-display.ts`: `rankToLetter` and `rankSpeech` become language-aware (the only card change).
- Warm Spanish copy (Tier 2) authored, not machine-translated.

**Feature 4.2 (Off-Turn Peek) — client-only:**
- Extend the existing press-and-hold peek logic from the YourTurn surface to the Waiting surface, reading the already-delivered `you.hand`.
- Mirror the MVP peek's hide-on-release / focus-loss / page-hide safety behaviors exactly.

**Build order:** 4.2 first (quick win, ~1–2 stories), then 4.1 (~3–4 stories: copy refactor → dictionaries + toggle → warm copy → card ranks). Likely **Epic 6 = Off-Turn Peek**, **Epic 7 = i18n**.

## D. The swap-chain tell (deferred playtest observation)

Because off-Turn peek shows the *current* card, a receiver who peeks right after a swap learns their new card the instant the swap lands — revealing the neighbor's old card. The on-Turn-only MVP peek hid this. It's a deliberate, conscious gameplay shift: likely fine (more sweating, more fun), but the one thing to watch in the first v2 playtest (SM-C4). Not a blocker; not a design change unless play sours.

## E. Why Powers mode stays out of v2 (context for the deferral)

Powers mode (Jack=Spy/peek, Queen=Thief/steal life, King=Blocker) is the eventual headline, but King=Blocker reopens a problem the MVP deliberately closed: an app-enforced King-block deterministically leaks "your neighbor holds a King," breaking the secret-card rule. It needs a real design answer (and likely server/contract changes — the opposite of v2's client-only, zero-contract character), so it does not belong in this release.
