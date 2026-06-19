---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments: ['_bmad-output/brainstorming/brainstorming-session-2026-06-18.md']
workflowType: 'research'
lastStep: 6
hard_constraint_zero_cost: true
research_type: 'technical'
research_topic: 'Real-time multiplayer web game architecture for "Trash" — WebSocket-based room/lobby system, server-authoritative game state, and a no-download web client for in-person play'
research_goals: 'Choose the right real-time framework (raw WebSockets vs Socket.IO vs game-server frameworks like Colyseus/PartyKit) and hosting/deployment approach for a small-scale, bursty, in-room party card game'
user_name: 'Dennis_Salcedo'
date: '2026-06-18'
web_research_enabled: true
source_verification: true
---

# Research Report: technical

**Date:** 2026-06-18
**Author:** Dennis_Salcedo
**Research Type:** technical

---

## Research Overview

This document researches the technical foundations for building **Trash** — a real-time, web-based multiplayer party card game for friends and family in the same room, where each player is dealt a secret card and "the read" (gauging whether your neighbor holds something lower) drives the fun. The research was conducted across five web-verified phases: scope confirmation, technology-stack analysis, integration-pattern (protocol) design, architectural design, and implementation planning. All non-obvious claims are cited; fast-moving facts (pricing, free-tier limits, newer ecosystems) are flagged for re-verification at build time.

The headline conclusion, sharpened by the user's **hard zero-cost constraint**, is a recommended stack of **PartyServer on Cloudflare Workers + Durable Objects** (one Durable Object per room) with a **PartySocket** web client served free via Cloudflare Pages — the only validated path that is free, supports long-lived WebSockets, wakes instantly (hibernation, so no cold-start join delay), and is private-by-default for hidden cards. The non-negotiable architecture rule throughout is **server-authoritative state with secret cards delivered only to their owner** (never broadcast), preserving game integrity against the realistic "curious teenager in DevTools" threat model.

A full executive summary, recommendation rationale, methodology, and next steps follow in the **Research Synthesis** section below.

---

<!-- Content will be appended sequentially through research workflow steps -->

## Technical Research Scope Confirmation

**Research Topic:** Real-time multiplayer web game architecture for "Trash" — WebSocket-based room/lobby system, server-authoritative game state, and a no-download web client for in-person play

**Research Goals:** Choose the right real-time framework (raw WebSockets vs Socket.IO vs game-server frameworks like Colyseus/PartyKit) and the hosting/deployment approach for a small-scale, bursty, in-room party card game

**Technical Research Scope:**

- Architecture Analysis — server-authoritative state, room/lobby model, secret-card privacy, reconnection patterns
- Implementation Approaches — raw WebSockets vs Socket.IO vs game frameworks (Colyseus, PartyKit, Phoenix Channels)
- Technology Stack — backend runtime, real-time library, frontend, room-code join flow
- Integration Patterns — WebSocket protocols, event design, broadcast vs targeted private messages
- Performance & Hosting — scalability for bursty small tables, deployment options, free-tier cost viability

**Research Methodology:**

- Current web data with rigorous source verification
- Multi-source validation for critical technical claims
- Confidence level framework for uncertain information
- Comprehensive technical coverage with architecture-specific insights

**Scope Confirmed:** 2026-06-18

---

## Technology Stack Analysis

_Researched via parallel web-verified subagents (2025–2026 data). Claims cited; uncertainties flagged. Fast-moving pricing/free-tier numbers should be re-verified before committing._

### Real-Time Frameworks & Libraries

The decisive lens for **Trash**: how does each option deliver **private, per-player state** (each player sees only their own card) without leaking hidden cards, and how much must you build yourself?

| Option | Type | Runtime | Authoritative state OOTB | Rooms | Reconnect | Secret-state model | Cost | Current version |
|---|---|---|---|---|---|---|---|---|
| **Raw `ws`** | Transport only | Node + native browser WS | No (build it) | No | No | `socket.send()` per-connection — private is the *only* primitive | MIT, free | ws 8.21.0 (2026-05) |
| **Socket.IO** | Messaging framework | Node + JS client | No (build it) | **Yes** | **Yes** | `socket.emit()` to one socket; room-broadcast convenience *can leak if misused* | MIT, free | 4.8.3 (2025-12) |
| **Colyseus** | Authoritative game server | Node (Bun exp.) | **Yes** (Schema sync) | Yes + matchmaking | **Yes** (`allowReconnection`) | ⚠️ Default broadcasts ALL state — **must** use `StateView`/`@view()` | MIT free; Cloud $15/mo (no free host) | 0.17.10 (2026-04) |
| **PartyKit / PartyServer** | Room server on Cloudflare | CF Workers + Durable Objects | No (build it) | Yes (parties) | **Yes** (PartySocket + Hibernation) | **Private by default**; `connection.send()` per player | MIT; real CF free tier | `partyserver` 0.5.8 (2026-06) — legacy `partykit` frozen |
| **Phoenix Channels** | Full app server | Elixir / BEAM | **Yes** | Yes (topics) | **Yes** | Per-socket `push` + `handle_out/3` filtering | MIT, free | Phoenix 1.8.8 |
| **Supabase / Ably / Pusher** | Managed pub/sub | SaaS | **No** (still build a backend) | Yes (channels) | **Yes** | Per-player **private channels** w/ token/RLS auth | See hosting | Supabase realtime 2.109.0 |

**Sources:** ws — https://github.com/websockets/ws • Socket.IO — https://socket.io/ , rooms https://socket.io/docs/v4/rooms/ • Colyseus — https://docs.colyseus.io/ , StateView https://docs.colyseus.io/state/view/ , pricing https://www.colyseus.io/pricing • PartyKit acquisition — https://blog.cloudflare.com/cloudflare-acquires-partykit/ , PartyServer API https://docs.partykit.io/reference/partyserver-api/ • Phoenix — https://phoenix.hexdocs.pm/channels.html • Supabase — https://supabase.com/docs/guides/realtime/broadcast , https://supabase.com/pricing • Ably — https://ably.com/pricing • Pusher — https://pusher.com/channels/pricing/

**Framework recommendation ranking (for a simple, bursty, in-room, turn-based, free-tier-friendly, secret-state game):**

1. **PartyKit / PartyServer on Cloudflare** — *top pick.* Private-by-default per-connection messaging is the safest model for hidden cards (no broadcast to misuse); rooms map cleanly to room codes; reconnection + hibernation suit bursty in-room play; genuine CF free tier. You build authoritative state in the Durable Object (modest for a small card game). **Build on `partyserver`, not the frozen legacy `partykit` CLI.**
2. **Colyseus** — strongest *batteries-included* option for turn-based authoritative games (free state sync, matchmaking, reconnection). Non-negotiable: **must** use `StateView`/`@view()` for hidden cards or you leak every hand. No free managed hosting.
3. **Socket.IO** — best low-ceremony general-purpose choice. Rooms + reconnection + transport fallback OOTB; private sends via `socket.emit()`. Free/MIT, huge ecosystem. You build authoritative logic and must never put hidden cards in a room broadcast.
4. **Raw `ws`** — maximum control / minimalism; cleanest secret-state primitive, but hand-roll rooms, reconnection, sessions.
5. **Phoenix Channels** — best architecture, highest adoption cost (Elixir + self-host); overkill here unless you know the stack.
6. **Managed pub/sub (Supabase/Ably/Pusher)** — viable but awkward; none is an authoritative server, so you'd build a backend *and* wire private channels for no gameplay benefit.

### Hosting & Deployment (long-lived WebSocket connections)

Critical constraint: **persistent, stateful WebSocket connections** — not stateless HTTP serverless. Also bursty/idle-most-of-the-time, so cold-start/idle-sleep matters for "instant" room joins.

| Platform | WS long-lived support | Free tier | Cold start / idle | Cheapest paid | Notes |
|---|---|---|---|---|---|
| **Cloudflare Workers + Durable Objects** | ✅ (WebSocket Hibernation) | ✅ genuine free tier (100k req/day, 13k GB-s/day on Workers Free w/ SQLite DO) | Effectively instant; idle rooms hibernate (zero idle cost) | Workers Paid $5/mo | One DO per game room; best fit |
| **Hetzner VPS (CX22)** | ✅ full control | ❌ none | None — always-on | **≈€3.79/mo** IPv6-only (+€0.50/mo IPv4) | Cheapest always-on; you manage the box; 20 TB EU traffic incl. |
| **DigitalOcean droplet** | ✅ | ❌ | None — always-on | ~$4/mo | Same self-managed model |
| **Render** | ✅ | ✅ free (sleeps) | ~1-min cold start on free | ~$7/mo always-on (Starter) | Cold start hurts instant joins on free tier |
| **Fly.io** | ✅ | limited | scale-to-zero possible | ~$2/mo | |
| **Railway** | ✅ | trial credit | — | ~$5/mo | |
| **Heroku** | ✅ but mandatory 55s heartbeat | ❌ (killed 2022) | — | paid only | Not recommended |
| **Vercel / Netlify** | ❌ not viable for self-hosted long-lived WS | — | — | — | Serverless function model; avoid for the WS server |
| **Ably / Pusher** | transport only | Ably 6M msgs/mo, 200 conns; Pusher 100 conns / 200k msgs/day | n/a | Ably $29/mo; Pusher $49/mo | Still need separate compute for game logic |

**Sources:** Cloudflare DO pricing — https://developers.cloudflare.com/durable-objects/platform/pricing/ • Hetzner — https://www.hetzner.com/pressroom/new-cx-plans/ , billing https://docs.hetzner.com/cloud/billing/faq/ , IPs https://docs.hetzner.com/cloud/servers/primary-ips/overview/ • (Render/Fly/Railway/Heroku/Vercel pricing pages — verify current before committing.)

**Hosting recommendation ranking:**

1. **Cloudflare Workers + Durable Objects** — best fit: free, instant joins via WebSocket Hibernation, **zero idle cost** (ideal for an occasion game that's mostly idle), one DO per game room. Pairs naturally with PartyServer (#1 framework).
2. **Cheap always-on VPS** — **Hetzner CX22 ≈ €3.79/mo** (cheapest always-on, verified 2026-06-18) or DigitalOcean ~$4/mo. Full control, instant, zero cold start; you manage everything.
3. **Render** — free (with ~1-min cold start) or ~$7/mo always-on. Easiest managed Node deploy, but free-tier cold start undermines "instant" joins.
4. **Fly.io (~$2/mo) / Railway ($5/mo)** — fine alternatives.
5. **Ably / Pusher** — transport only; still need separate compute.
6. **Heroku** — no free tier, mandatory heartbeat. **Vercel / Netlify — not viable** for a self-hosted long-lived WebSocket server.

### Architecture Patterns (server-authoritative + secret cards)

**TL;DR principles:**

- **Server owns 100% of game state and dealing.** Clients send *intents* ("Swap"/"Keep"); the server validates (right player? legal phase? sender is Host?) and computes results. Clients are "privileged spectators," not authorities. (Gambetta — https://gabrielgambetta.com/client-server-game-architecture.html)
- **Never transmit a card a player shouldn't see.** Hiding cards in the UI while sending the full deck/all hands is the cardinal sin — visible in the WebSocket frames, JS memory, or a patched client (same failure mode as wallhacks). The fix is **server-side filtering**: secret data is never serialized to unauthorized clients. (Riot Fog of War — https://www.riotgames.com/en/news/demolishing-wallhacks-valorants-fog-war)
- **Threat model for Trash:** people in the same room, low stakes → the realistic adversary is "a curious teenager in DevTools," not pro cheaters. That lowers urgency but **not** the rule — doing it right is barely harder than doing it wrong.

**Private vs broadcast messaging (library mapping):**

| Need | Socket.IO | Colyseus |
|---|---|---|
| Private (one player's card) | `io.to(socket.id).emit(...)` / `socket.emit(...)` | `client.send(...)` or `@view()` + `client.view.add()` |
| Broadcast public event (turn, showdown) | `io.to(roomCode).emit(...)` | `this.broadcast(...)` or shared `@type()` state |
| Room concept | `socket.join(roomCode)` | built-in `Room` |

**Room / lobby:** short collision-checked room code (4–6 chars, avoid ambiguous `0/O`, `1/I/L`); in-memory `roomCode → roomState` map; first joiner flagged `isHost`. Only the Host's flow actions (`startGame`, `nextPhase`/`revealAll`, `dealAgain`) are honored — server checks `isHost`; the client merely shows/hides the button.

**Authoritative phase machine:**

```
LOBBY → DEAL → TURNS → SHOWDOWN → SCORE → (REDEAL → DEAL | GAME_OVER)
```
- `DEAL`: server shuffles (Fisher–Yates + CSPRNG, not `Math.random()`), deals one **secret** card per alive player, **emits each card privately**, broadcasts "cards dealt" (face-down).
- `TURNS`: accept a Swap/Keep **only** from the player at `currentTurnIndex`; advance + broadcast `turnChanged`.
- `SHOWDOWN`: Host action reveals all hands (now public); server computes lowest/loser(s).
- `SCORE → REDEAL`: decrement lives, eliminate at zero; Host `dealAgain` if ≥2 alive, else `GAME_OVER`.
- **Manual-Host fit:** because everyone is co-located, no timers needed — Host buttons map to *guarded* transition messages; server validates sender-is-Host **and** transition-is-legal.

**Reconnection:** for MVP, deferrable — but **key all state by a stable `playerId` (session token in `localStorage`), never by socket id** (socket ids change on reconnect). Costs almost nothing now, saves a painful refactor later. Colyseus has `allowReconnection(client, 30)` built in; Socket.IO has connection-state recovery + a persistent-session pattern.

**Common pitfalls:** (1) leaking hidden state via "hide in UI"; (2) trusting client input (re-derive every result server-side); (3) turn race conditions (guard by `senderId === players[currentTurnIndex].id` + monotonic turn token to drop late/duplicate actions); (4) keying state by socket id; (5) predictable `Math.random()` shuffle; (6) not garbage-collecting abandoned rooms.

**Sources:** Gambetta client-server architecture — https://gabrielgambetta.com/client-server-game-architecture.html • Socket.IO rooms/private messaging — https://socket.io/docs/v4/rooms/ , https://socket.io/docs/v4/private-messaging-part-1/ • Colyseus StateView — https://docs.colyseus.io/state/view , reconnection — https://docs.colyseus.io/room/reconnection • Riot Fog of War — https://www.riotgames.com/en/news/demolishing-wallhacks-valorants-fog-war • Secure shuffle — https://www.npmjs.com/package/crypto-shuffle

### Technology Adoption Notes & Uncertainties (flagged)

- **PartyKit:** Cloudflare acquired it (2024-04-05); legacy `partykit` CLI frozen — target **PartyServer**. Hosted-product long-term status post-acquisition is ambiguous.
- **Colyseus `StateView`:** newer, manually managed, self-described "not optimized for large datasets" — fine at 3–10 players/small hands; verify against your installed version. Code snippets are illustrative, not copy-paste-tested.
- **Pricing/free-tier numbers move:** re-verify before committing (Pusher free tier is **100** concurrent connections; Supabase **free projects pause after ~1 week idle** — a real annoyance for an occasion game; exact Hetzner CAX11 price, Render Starter price, Fly tiny-invoice handling all flagged as soft).
- **Version-date noise:** some GitHub release pages returned garbled dates via fetch; versions corroborated via npm / official docs (e.g. Phoenix 1.8.8 from docs).

---

## Integration Patterns Analysis

_Scoped to what Trash actually needs: a single-server real-time WebSocket protocol. Much of the generic enterprise-integration landscape (REST vs GraphQL vs gRPC, Kafka, service mesh, sagas, API gateways) is **not relevant** to a single-server party game and is noted only to justify exclusion._

### Communication Protocol: WebSocket (the right and only fit)

- **Use WebSocket over WSS (TLS).** On an HTTPS page, browsers block mixed-content `ws://`, so `wss://` is mandatory in production. (MDN — https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_client_applications)
- **Native browser client lifecycle:** `open` → `message` → `close`/`error`. `send()` is asynchronous and accepts text/JSON/binary; receive via the `message` event (`JSON.parse(e.data)`). For a card game, **text frames carrying JSON** are the correct, simplest choice — no binary needed. (MDN, same source.)
- **Bfcache caveat:** pages with an open WebSocket may not enter the back/forward cache; close the socket on `pagehide`. Minor, but worth handling.
- **Why not REST/GraphQL/gRPC?** Those are request/response (client-initiated) models. Trash needs the **server to push** unsolicited events (your turn, someone got eliminated, showdown). That's exactly WebSocket's purpose; polling REST would be laggy and wasteful, and gRPC-web/streaming is overkill for a hobby party game.

### Data Format: JSON messages with a `type` discriminator

Standard real-time pattern: every message is a JSON object with a `type` (event name) and a payload. With **raw WebSocket** you hand-roll this; **Socket.IO** gives it to you natively (named events + automatic serialization of "any serializable data structure — Objects, Arrays, Buffers"; no manual `JSON.stringify()`). (Socket.IO emitting — https://socket.io/docs/v4/emitting-events/)

```jsonc
// Generic envelope (raw WS). Socket.IO replaces this with emit("eventName", payload).
{ "type": "swap", "payload": { "roomCode": "WXYZ" } }
```

### Request/Response within WebSocket: acknowledgements

For actions that need a server verdict (e.g., "was my Swap accepted?"), use **Socket.IO acknowledgement callbacks** (with `socket.timeout(ms)` since v4.4.0 to avoid hanging) — or, with raw WS, a correlation-id field you match on the reply. (Socket.IO emitting — https://socket.io/docs/v4/emitting-events/)

```js
// Socket.IO: client asks, server validates and acknowledges
socket.timeout(5000).emit("swap", { roomCode }, (res) => {
  // res = { ok: true } or { ok: false, reason: "not-your-turn" }
});
```

### Proposed Event Protocol for Trash (MVP)

Two directions: **client → server = intents** (validated), **server → client = state/events** (authoritative). Hidden cards go only to their owner (see Architecture: private vs broadcast).

**Client → Server (intents):**

| Event | Sender | Payload | Server validates |
|---|---|---|---|
| `createRoom` | any | `{ name }` | — (issues roomCode + sessionToken) |
| `joinRoom` | any | `{ roomCode, name, sessionToken? }` | code exists, not full/started |
| `startGame` | **Host** | `{}` | sender isHost, phase=LOBBY, ≥min players |
| `swap` / `keep` | active player | `{}` | sender == currentTurn player, phase=TURNS |
| `drawFromDeck` | last player | `{}` | sender is last player, phase=TURNS |
| `revealAll` | **Host** | `{}` | sender isHost, phase=TURNS |
| `dealAgain` | **Host** | `{}` | sender isHost, phase=SCORE, ≥2 alive |

**Server → Client (events):**

| Event | Target | Payload |
|---|---|---|
| `roomState` | broadcast | `{ phase, players:[{id,name,lives,isAlive,connected}], hostId, currentTurnId }` |
| `yourCard` | **private** (one player) | `{ suit, rank }` |
| `turnChanged` | broadcast | `{ currentTurnId }` |
| `showdown` | broadcast | `{ hands:[{playerId,suit,rank}], loserIds:[...] }` |
| `roundResult` | broadcast | `{ eliminatedIds:[...], lives:{...} }` |
| `gameOver` | broadcast | `{ winnerId }` |
| `loserFx` | **private** (loser) | `{ fx: "comedy-1" }` (triggers the comedy animation/sound on the loser's device) |
| `error` | private | `{ reason }` |

> Design notes: `yourCard` and `loserFx` are **targeted/private** — never broadcast. Everything public (turn, showdown, standings) is a room broadcast. This protocol is framework-agnostic: in Socket.IO each row is an `emit`/`on`; in raw WS each is a `type` in the JSON envelope; in PartyServer, `connection.send()` (private) vs `room.broadcast()` (public).

### Interoperability / Integration scope

- **Single logical server, no microservices.** One WebSocket server (or one Durable Object per room on Cloudflare) owns a room's state. No service mesh, no message broker, no inter-service API — the "integration surface" is just **browser ↔ game server**.
- **No external API integrations in MVP** (no accounts, payments, or third-party services). This keeps the security surface tiny.
- **Auth pattern (lightweight):** a per-player **session token** issued on join (stored in `localStorage`), echoed on reconnect — not OAuth/JWT infrastructure. Room code is the table's join secret. (See Architecture: reconnection.)

### Integration Security Patterns (right-sized)

- **WSS/TLS** for all traffic (mandatory on HTTPS). 
- **Validate every inbound message server-side** (it's an unauthenticated *intent*, not a fact) — turn ownership, phase legality, Host-only actions.
- **Never serialize hidden cards** to non-owners (the core anti-cheat rule).
- **No heavyweight auth needed** for an in-room social MVP; session token + room code is proportionate to the "curious teenager in DevTools" threat model. OAuth/JWT/mTLS would be over-engineering here.

**Sources:** Socket.IO emitting & acknowledgements — https://socket.io/docs/v4/emitting-events/ • Native WebSocket client API (lifecycle, send/JSON, wss, bfcache) — https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_client_applications

**Uncertainty flags:** The event protocol above is a *proposed design* derived from the verified WebSocket/Socket.IO APIs and the game rules — it is a recommendation, not an industry-standard spec; exact event names/payloads should be finalized in the PRD/architecture phase.

---

## Architectural Patterns and Design

_Synthesizes the framework, hosting, and protocol findings into a concrete system design for Trash, with trade-offs. Two recommended stacks are presented: the simplest "boring" path and the best-fit Cloudflare path._

### System Architecture Pattern: client–server, server-authoritative monolith

Trash is a **single-server, server-authoritative real-time application** — not microservices, not serverless-stateless, not peer-to-peer.

- **One stateful server process owns each room's canonical state** (deck, hands, lives, phase, turn). Browser clients are thin renderers that send intents and receive authoritative events.
- **Per-room isolation:** each table (room code) is an independent state container. This is naturally a **monolith** (one Node process holding a `Map<roomCode, RoomState>`) or, on Cloudflare, **one Durable Object per room** — a documented, purpose-built pattern (Cloudflare lists "multiplayer games" as a target use case; each DO has a globally-unique name and coordinates the clients who join it, with WebSocket Hibernation for idle rooms). (https://developers.cloudflare.com/durable-objects/)
- **No message broker / service mesh / DB-of-record needed for MVP.** State is in-memory per room; durable persistence is optional (DO storage if you want rooms to survive a restart — not required for an ephemeral party game).

### Two Recommended Stacks (trade-off)

**Stack A — "Boring & well-trodden" (lowest learning curve)**
- **Server:** Node.js + **Socket.IO** (rooms + reconnection + fallback OOTB)
- **Host:** **Render** (free w/ ~1-min cold start, or ~$7/mo always-on) or **Hetzner CX22 (~€3.79/mo, always-on)**
- **Client:** any lightweight frontend (vanilla JS or a small React/Svelte app)
- *Trade-off:* most familiar, huge ecosystem, you must discipline yourself to never broadcast hidden cards; cold-start on free Render hurts "instant join."

**Stack B — "Best fit" (cheapest at idle, instant joins, safest secret-state)**
- **Server:** **PartyServer** (one party = one room = one Durable Object)
- **Host:** **Cloudflare Workers + Durable Objects** (genuine free tier, zero idle cost, WebSocket Hibernation = instant wake)
- **Client:** **PartySocket** (auto-reconnect) + lightweight frontend
- *Trade-off:* private-by-default messaging (safest for secret cards), zero idle cost (ideal for an occasion game), but a newer ecosystem and you build authoritative logic in the DO. Build on `partyserver`, not the frozen legacy `partykit` CLI.

> **Recommendation:** If you value familiarity and a gentle path → **Stack A (Socket.IO)**. If you value lowest cost, instant joins for an idle-most-of-the-time game, and the safest hidden-card model → **Stack B (Cloudflare/PartyServer)**. Both are sound; this is a learning-curve-vs-fit choice to resolve in the architecture phase.

> **⚠️ HARD CONSTRAINT (confirmed by user): zero ongoing cost.** This decisively favors **Stack B (Cloudflare Workers + Durable Objects + PartyServer)** — it is the only validated option with a *genuine free tier that supports long-lived WebSockets at zero idle cost*. Stack A's free option (Render) sleeps with ~1-min cold starts (hurts instant joins), and the always-on VPS path (Hetzner ~€3.79/mo) is not free. **Free static client hosting** pairs via Cloudflare Pages / GitHub Pages / Netlify free tier. Re-verify Cloudflare free-tier limits before committing, but at 3–10 players bursty/occasional usage, the free tier is expected to suffice.

### Design Principles & Best Practices

- **Server-authoritative; clients are "privileged spectators."** Clients send intents; server validates and computes. (Gambetta — https://gabrielgambetta.com/client-server-game-architecture.html)
- **Never serialize hidden state to non-owners** — secret cards via targeted/private messages only (the cardinal anti-cheat rule; same principle as fog-of-war/wallhack defense — Riot — https://www.riotgames.com/en/news/demolishing-wallhacks-valorants-fog-war).
- **Single source of truth per room**, mutated only by validated transitions.
- **Stable player identity** (`playerId` + session token), never socket id — cheap insurance for reconnection.
- **CSPRNG Fisher–Yates shuffle**, not `Math.random()` (https://www.npmjs.com/package/crypto-shuffle).

### Data Architecture

- **In-memory authoritative state per room** is sufficient for MVP (rooms are ephemeral; a crashed room simply ends — acceptable for a party game).
- **State shape:** `{ code, phase, hostId, players:[{id,name,lives,isAlive,connected}], currentTurnIndex, deck (server-only), hands (server-only, delivered privately), round }`.
- **No database required for MVP.** Optional later: Durable Object storage (Stack B) or Redis/Postgres (Stack A) if you add cross-session stats/persistence — explicitly post-MVP.

### Scalability & Performance

- **Scale characteristics:** bursty, low-volume, small tables (3–10 players), idle most of the time. **Vertical/per-room scaling, not horizontal sharding**, is the relevant axis.
- **Stack A:** a single small instance handles many concurrent small tables easily; if you ever needed horizontal scale you'd add a Socket.IO adapter (Redis) for cross-node rooms — **not needed at this scale** (noted to avoid premature optimization).
- **Stack B:** scales automatically — each room is its own Durable Object; idle rooms hibernate at zero cost; Cloudflare handles distribution. Best match for "mostly idle, occasional bursts."
- **Latency:** in-room players are co-located but routed via the server; turn-based pacing means latency is non-critical (no real-time physics) — a major simplifier.

### Security Architecture (right-sized)

- **WSS/TLS** mandatory (browsers block mixed-content ws:// on HTTPS).
- **Validate every inbound intent** server-side: turn ownership, phase legality, Host-only actions.
- **Private delivery of hidden cards**; broadcast only public events.
- **Session token + room code** as lightweight auth — proportionate to the in-room, low-stakes, "curious teenager in DevTools" threat model. No OAuth/JWT/mTLS for MVP.
- **Room lifecycle hygiene:** garbage-collect abandoned rooms to bound memory (Stack A) — automatic via hibernation/eviction on Stack B.

### Deployment & Operations

- **Stack A:** containerized Node app (or plain `node server.js`) on Render/Hetzner/Fly; single region is fine (in-room players tolerate normal latency). Health check + auto-restart.
- **Stack B:** `wrangler deploy` to Cloudflare; Durable Objects are globally distributed and serverless — minimal ops, no servers to patch.
- **Both:** static client assets served over HTTPS (Cloudflare Pages / Render static / any CDN); room-code-based deep links for instant join (no app store, per the no-download goal).

**Sources:** Cloudflare Durable Objects (per-entity coordination, WebSocket Hibernation, multiplayer-games use case) — https://developers.cloudflare.com/durable-objects/ • Gambetta server-authoritative architecture — https://gabrielgambetta.com/client-server-game-architecture.html • Riot Fog of War (anti-cheat principle) — https://www.riotgames.com/en/news/demolishing-wallhacks-valorants-fog-war • Secure shuffle — https://www.npmjs.com/package/crypto-shuffle • (Framework/hosting sources as cited in Technology Stack Analysis.)

**Uncertainty flags:** Stack recommendations weigh learning-curve vs fit — both are validated as sound; the final pick is a project-preference decision for the architecture phase. Cloudflare DO free-tier limits and PartyServer's ecosystem maturity should be re-verified before committing (see earlier flags).

---

## Implementation Approaches and Technology Adoption

_Tailored to the confirmed **zero-cost** constraint → recommended path is the Cloudflare/PartyServer stack. Guidance is right-sized for a solo/hobby builder, not an enterprise team._

### Technology Adoption Strategy

- **Greenfield, single-stack, incremental.** No legacy/migration concerns — start clean. Adopt one real-time library and one host; don't mix.
- **Vertical slice first:** build the thinnest end-to-end loop (create room → join via code → deal one secret card → reveal) before adding lives/elimination/re-deal. Proves the hardest parts (private messaging, room sync) early.
- **Classic mode only** for MVP (per brainstorm); defer Powers mode (J/Q/K) entirely.

### Development Workflow & Tooling (recommended stack — zero cost)

- **Scaffold:** `npm create partykit@latest` (supports `--typescript`); core is a server class with `onConnect` / `onMessage` handlers + **PartySocket** on the client. (https://docs.partykit.io/quickstart/)
- **Local dev:** `npx partykit dev` (serves on :1999; open multiple browser windows to simulate players). For the Cloudflare-native `partyserver` library, dev/deploy is via **Wrangler** — `wrangler dev` (local) and `wrangler deploy` (ship), the official Cloudflare CLI. (https://developers.cloudflare.com/workers/wrangler/)
- **Deploy:** `npx partykit deploy` (to Cloudflare) or `wrangler deploy`. Static client to **Cloudflare Pages / GitHub Pages / Netlify free tier** — all $0.
- **Version control:** Git/GitHub (free). **CI/CD:** GitHub Actions free tier → `wrangler deploy` on push (optional; manual deploy is fine for a hobby project).
- **Language:** TypeScript recommended (catches protocol/payload-shape bugs in the event messages).

### Testing & QA (right-sized)

- **Manual multi-window playtesting** is the primary loop (open N browser tabs = N players) — fast and matches the in-room reality.
- **Unit-test the pure game logic** (shuffle, deal, lowest-card resolution, lives/elimination, turn validation) separately from the WebSocket layer — keep game rules in framework-agnostic functions so they're trivially testable.
- **Real-device check:** test on actual phones over real wifi/cellular before a family gathering (the true environment).
- E2E automation (Playwright) is optional/post-MVP.

### Deployment & Operations

- **Stack B (recommended):** serverless — no servers to patch, Durable Objects auto-distribute, idle rooms hibernate at zero cost. Ops burden ≈ minimal.
- **Observability:** Cloudflare dashboard/`wrangler tail` for logs is sufficient at this scale. No APM/monitoring stack needed for MVP.
- **No disaster recovery needed** — rooms are ephemeral; a crashed room just ends (acceptable per MVP scope).

### Team Organization & Skills

- **Solo/hobby project.** Skills needed: JavaScript/TypeScript, basic WebSocket/event-driven thinking, a little Cloudflare Workers familiarity. No backend-framework or DBA skills required (no database in MVP).
- **Learning curve:** PartyServer/Durable Objects is newer than Socket.IO — budget a little ramp-up time; the Socket.IO fallback (Stack A) exists if the Cloudflare model proves frustrating, but it isn't free at always-on.

### Cost Optimization & Resource Management

- **Target: $0 ongoing.** Cloudflare Workers free tier + Durable Objects free allotment + free static hosting + free domain option (`*.workers.dev` / `*.pages.dev`) = no recurring cost for hobby-scale, bursty usage.
- **Watch-points:** Durable Objects free-tier request/duration limits (re-verify current numbers); a custom domain (~$10/yr) is optional, not required.
- **Avoid premature cost:** no managed realtime service (Ably/Pusher paid tiers), no always-on VPS, no database — all unnecessary for MVP.

### Risk Assessment & Mitigation

| Risk | Mitigation |
|---|---|
| Hidden-card leak (core integrity) | Private-by-default messaging (PartyServer `connection.send()`); never broadcast hands |
| PartyServer ecosystem newness | Keep game logic framework-agnostic so a swap to Socket.IO is cheap if needed |
| Free-tier limits exceeded | Re-verify limits; usage is bursty/low — very unlikely at family scale |
| Join friction kills the moment | Room-code + deep link, no download (web app); test join time on real phones |
| Disconnect mid-round | Out of MVP scope (accepted); design state keyed by `playerId` to add later cheaply |

## Technical Research Recommendations

### Implementation Roadmap

1. **Spike (vertical slice):** scaffold PartyServer; create/join room by code; deal **one secret card privately**; reveal on Host action. *Proves private messaging + room sync.*
2. **Core loop:** clockwise turn order; Swap/Keep intents (server-validated); last-player draw-from-deck; simultaneous showdown; lowest-loses resolution.
3. **Stakes:** lives, elimination, last-one-standing, **instant re-deal**.
4. **Polish:** Host conductor controls (manual phase advance); inactive-player view (whose turn); **loser comedy FX** (private `loserFx` event); peek/hide own card.
5. **Real-device playtest** with family; iterate on clarity/latency.
6. **(Post-MVP):** reconnection/grace period; Powers mode (J/Q/K); optional persistence/stats.

### Technology Stack Recommendation (final, given zero-cost constraint)

- **Real-time + host:** **PartyServer on Cloudflare Workers + Durable Objects** (one DO per room) — free, instant joins (Hibernation), private-by-default secret state.
- **Client:** **PartySocket** + a lightweight frontend (vanilla TS, or small Svelte/React) served free via Cloudflare Pages.
- **Protocol:** JSON over WSS using the event protocol defined in Integration Patterns.
- **Language:** TypeScript. **Shuffle:** Fisher–Yates + CSPRNG.
- **Fallback (if Cloudflare model frustrates):** Node + Socket.IO, but note it isn't free at always-on (Render free sleeps with cold starts).

### Skill Development Requirements

- Comfort with **TypeScript** and **event-driven WebSocket** patterns.
- Basic **Cloudflare Workers + Durable Objects + Wrangler** workflow (`wrangler dev`/`deploy`).
- Keep **game rules as pure, testable functions** decoupled from the transport.

### Success Metrics & KPIs

- **Primary (from brainstorm):** family/friends are genuinely delighted; they reach for the app instead of a physical deck.
- **Practical:** a full game night runs without a confusion-stop; **join-to-playing < ~20–30s**; **no hidden card ever visible** in the network tab (integrity check); **$0 hosting bill**.

**Sources:** PartyKit/PartyServer quickstart (scaffold, `partykit dev`/`deploy`, Cloudflare target) — https://docs.partykit.io/quickstart/ • Cloudflare Wrangler (official CLI, `wrangler dev`/`deploy`) — https://developers.cloudflare.com/workers/wrangler/ • Durable Objects — https://developers.cloudflare.com/durable-objects/ • (Architecture/integration sources as cited above.)

**Uncertainty flags:** The PartyKit quickstart page still references the legacy `partykit` CLI (`npx partykit dev/deploy`); the **actively-developed Cloudflare-native path is the `partyserver` library deployed via Wrangler** — confirm the current recommended entry point in Cloudflare/PartyServer docs at build time, as this area is in flux post-acquisition. Free-tier limits and exact CLI commands should be re-verified before committing.

---

# Research Synthesis: Building "Trash" — A Free, Real-Time, In-Room Multiplayer Web Card Game

## Executive Summary

The deck is the one thing the group always forgets. **Trash** turns that failure into a product: the phone becomes the deck, and the folk game (Cuckoo / Chase the Ace / Screw Your Neighbor) becomes an always-in-pocket party game for the people already at the table. The technical challenge is deceptively narrow — a handful of players, a few cards, turn-based pacing — but it hides one genuinely hard requirement: **each player must see only their own card until the showdown.** Get that right and the game has integrity; get it wrong (the classic "send everything, hide it in the UI" mistake) and any curious player with DevTools can win every round.

This research evaluated the 2025–2026 landscape across six real-time frameworks, eight hosting options, and the architecture/protocol patterns that govern hidden-information multiplayer games. Under the user's **hard zero-cost constraint**, the findings converge cleanly: build on **PartyServer running on Cloudflare Workers + Durable Objects** (one Durable Object per room), with a **PartySocket** web client served free via Cloudflare Pages, communicating JSON over WSS. This is the only validated combination that is genuinely free, supports long-lived WebSocket connections, wakes instantly via hibernation (no cold-start delay when a family sits down to play), and is **private-by-default** — the safest possible model for secret cards, because there is no convenient broadcast primitive to misuse.

The architecture is a **server-authoritative monolith, isolated per room**: the server owns the deck, hands, lives, turn, and phase; clients send *intents* (Swap/Keep) that the server validates; the human **Host** conducts phase transitions; and humans handle the theatrics (the King is declared physically). No database, message broker, or microservices are needed for the MVP. The biggest risk is not technical scale (the load is tiny and bursty) but the **post-acquisition flux of the PartyKit/PartyServer ecosystem** — mitigated by keeping game rules as pure, transport-agnostic functions so a fallback to Socket.IO is cheap.

**Key Technical Findings:**

- **Server-authoritative state with per-player private messaging is mandatory** — secret cards delivered only to their owner; everything public is a room broadcast. This is the single most important design decision.
- **WebSocket (WSS) + JSON is the right and only protocol** — the server must push unsolicited events (turn, elimination, showdown); REST/GraphQL/gRPC don't fit.
- **The recommended stack is the only free, instant-wake, WebSocket-capable option** — Cloudflare's "one Durable Object per game room" is a documented, purpose-built pattern for multiplayer games.
- **No database, broker, or microservices for MVP** — in-memory per-room state suffices; rooms are ephemeral.
- **The realistic threat model is mild** (in-room, low-stakes), but doing secret-state correctly is barely harder than doing it wrong.

**Technical Recommendations:**

1. **Build on PartyServer + Cloudflare Workers/Durable Objects** (Stack B); serve the client free via Cloudflare Pages. Confirm `partyserver`-via-Wrangler as the current entry point at build time.
2. **Enforce private-by-default secret cards** — `connection.send()` to the owner; never include a hand in a broadcast.
3. **Keep game rules as pure, testable, transport-agnostic functions** — insurance against ecosystem churn and the basis for unit tests.
4. **Key all state by a stable `playerId` + session token** (not socket id) from day one, even though reconnection is out of MVP scope.
5. **Ship Classic mode only**; build a thin vertical slice (create → join → deal secret card → reveal) first.

## Table of Contents

1. Research Introduction & Methodology *(this section + earlier scope)*
2. Technology Stack Analysis *(see section above)*
3. Integration Patterns — WebSocket Protocol *(see section above)*
4. Architectural Patterns & Design *(see section above)*
5. Implementation Approaches & Roadmap *(see section above)*
6. Research Synthesis & Recommendations *(this section)*

## Research Methodology

- **Scope:** real-time framework selection + hosting + architecture/protocol for a small-scale, bursty, in-room, turn-based, hidden-information party card game with a zero-cost constraint.
- **Approach:** five web-verified phases; three parallel research subagents for the stack analysis (frameworks, hosting, architecture) plus targeted `WebFetch` verification of official docs (Socket.IO, MDN WebSocket API, Cloudflare Durable Objects/Wrangler, PartyKit quickstart).
- **Verification:** claims cited to primary sources (official docs, vendor pricing, authoritative game-networking references); fast-moving or post-acquisition facts explicitly flagged for re-verification.
- **Confidence:** High on architecture/protocol principles (stable, well-established); Medium on specific pricing/free-tier numbers and PartyServer ecosystem entry point (in flux — flagged throughout).

## Achieved Goals

- ✅ **Chose the real-time framework:** PartyServer (with Socket.IO as the documented fallback), with a full ranked comparison of all six candidates for this exact use case.
- ✅ **Chose the hosting/deployment approach:** Cloudflare Workers + Durable Objects, satisfying the zero-cost + long-lived-WebSocket + instant-join requirements; full ranked hosting matrix included.
- ✅ **Bonus deliverables beyond the original goals:** a concrete WebSocket event protocol for Trash, the server-authoritative + secret-card architecture, an authoritative phase state machine, a 6-step implementation roadmap, and a right-sized security model.

## Risk Assessment (consolidated)

| Risk | Severity | Mitigation |
|---|---|---|
| Hidden-card leak (integrity) | High | Private-by-default messaging; never broadcast hands; integrity-check the network tab |
| PartyServer ecosystem flux (post-Cloudflare-acquisition) | Medium | Keep rules transport-agnostic; Socket.IO fallback ready; confirm entry point at build time |
| Free-tier limits exceeded | Low | Usage is tiny/bursty; re-verify limits before launch |
| Join friction kills the moment | Medium | Room code + deep link, no download; test join time on real phones (<~20–30s) |
| Disconnect mid-round | Low (out of MVP) | Accepted for MVP; state keyed by `playerId` to add reconnection cheaply later |

## Future Outlook (right-sized)

- **Near-term (post-MVP):** reconnection/grace period; **Powers mode** (Jack = Spy/peek, Queen = Thief, King = Blocker, player-triggered); optional cross-night stats.
- **Ecosystem watch:** the Cloudflare/PartyServer story is consolidating post-acquisition; expect the recommended entry point and docs to keep evolving — revisit before committing and again before any major rebuild.

## Conclusion & Next Steps

The research de-risks the build: the stack is free and proven, the architecture is well-understood, and the one hard problem (secret cards) has a clean, documented solution. **Trash is technically straightforward to build correctly** — the effort is in the game-feel polish (instant joins, the loser comedy FX, glanceable UI), not the plumbing.

**Recommended next BMad steps:**

1. **Product Brief** (`bmad-product-brief`) — fold this research's stack decision and constraints into the concept doc.
2. **PRD** (`bmad-prd`) — the first required planning gate; resolve open game questions (starting-player rotation, player counts, starting lives, heads-up tweak) and lock the event protocol.
3. **Architecture** (`bmad-create-architecture`) — formalize the PartyServer/Durable Objects design and the WebSocket event contract.

---

**Technical Research Completion Date:** 2026-06-19
**Research Period:** 2025–2026 current technical landscape
**Source Verification:** All non-obvious technical facts cited; fast-moving facts flagged for re-verification
**Technical Confidence Level:** High on architecture/protocol; Medium on pricing/ecosystem-entry specifics (flagged)

_This document is an authoritative technical reference for building Trash and feeds directly into the Product Brief, PRD, and Architecture phases._
