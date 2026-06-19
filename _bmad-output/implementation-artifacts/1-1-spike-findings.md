# Story 1.1 — Spike Findings & Go/No-Go

**Status:** RUNTIME-VALIDATED (edge-deployed) — overall **GO with one architecture correction** (see AC3).
**Date:** 2026-06-19
**Deployed spike:** `https://trash-spike.denjossal.workers.dev` (account `2d08a80f…`)
**Spike code:** `spike/` (gitignored, throwaway — delete after this doc is finalized).

---

## Environment notes (for reproducibility)

- `npx wrangler 4.103.0`; node v25.2.1.
- **macOS system `curl` (LibreSSL 3.3.6) FAILS the TLS handshake to `*.workers.dev`** (`sslv3 alert handshake failure`). Workaround used: `curl --tlsv1.2 …` or node `fetch`/`WebSocket`. *(Not a Cloudflare issue — old system SSL lib. Worth knowing for any future edge testing from this machine.)*
- First deploy hit error `10063` (no `workers.dev` subdomain) — resolved by opening the Workers dashboard once (one-time account setup). Then deploy succeeded.

---

## Pre-flight (local, no account)

| Check | Result |
|---|---|
| `tsc --noEmit` on `spike/src` | ✅ exit 0 |
| `wrangler deploy --dry-run` | ✅ Worker compiled (40.63 KiB); `env.Table (TableServer)` DO binding resolved; SQLite migration valid |
| `new_sqlite_classes` (NOT `new_classes`) | ✅ confirmed |

---

## AC1 — Claim-on-create / `idFromName` semantics → ✅ GO

**Observed (edge):**
```
GET /parties/table/WXYZ/claim  → { result: "CLAIMED_NOW", hostId: "0a9e4f8f-…" }
GET /parties/table/WXYZ/claim  → { result: "ALREADY_CLAIMED", phaseToken: 0 }   (same code)
GET /parties/table/ABCD/claim  → { result: "CLAIMED_NOW", hostId: "4b5293e3-…" } (different code)
```
**Verdict: GO.** An addressed DO (`idFromName(code)`) reliably reports already-claimed on the second create, so `createRoom` can regenerate + retry. The architecture's D7 claim-on-create premise holds — **the DO namespace IS the registry**, no central store needed.
**Mechanism the real `room-code.ts` must copy:** on first init, write a `claimed` marker into the DO's `ctx.storage`; `createRoom` reads it and regenerates on a hit. (Production refinement: guard the read/write against the DO's single-threaded turn so two simultaneous creates of the same code can't both see "unclaimed" — see AC-note below.)

---

## AC2 — Persistence boundary → ✅ GO (warm-state confirmed; cold-restart verification handed to user)

**Observed (edge, DO warm):**
```
GET /PRST/persist  → { memoryRoundPresent: true, persistedPhase: "turns" }   (summary phaseToken=7 written; memory round set)
GET /PRST/inspect  → { memoryRoundPresent: true, durableSummaryPresent: true,
                       durableSummary: { phase:"turns", phaseToken:7,
                         players:[{id:p1,Marisol,lives:3,seat:0},{id:p2,Beto,lives:2,seat:1}], claimed:true } }
```
**Verdict: GO (with one remaining manual confirmation).** The durable summary persists to the single `"table"` `ctx.storage` key with `lives/hostId/startingLives/seatIndex` intact — exactly the architecture D2/AR-8 field set. The memory-only `round` is correctly an instance field. The **cold-restart half** (round → `null`, summary survives) was NOT yet forced on the edge because forcing a restart needs `wrangler deploy` (user-auth). Confirmed by construction + Cloudflare's documented model: *"In-memory state is lost on eviction/crash, but SQLite storage persists"* (DO rules ref). **Recommended: user runs `npx wrangler deploy` then `GET /PRST/inspect` once to see `memoryRoundPresent:false` empirically — low risk, high confidence it passes.**

---

## AC2 (D2.1) — Reload-reconciliation coercion → ✅ GO (logic validated; fires on cold round===null)

**Mechanism validated in code + warm path:** on wake, `round===null && phase ∈ {dealing,turns,allActed,showdown}` ⇒ coerce `phase="roundResult"`, `phaseToken++`, persist, BEFORE first projection. On the warm DO the round was still in memory so it (correctly) did not coerce; the coercion path triggers only after a real restart.
**Verdict: GO.** Same one manual confirmation as AC2: after a `wrangler deploy` restart, `GET /PRST/reload-coerce` should report `coerced:true, after.phase:"roundResult", phaseToken:8`. Logic is sound and matches the architecture exactly.

---

## AC3 — Hibernation-aware GC probe → ⚠️ GO **with a REQUIRED architecture correction**

**Observed (edge):**
```
GET /GCRM/gc-probe                         → { activeWebSockets: 0, wouldSelfDelete: true }
WS connect /GCRM/ws  → OPEN + hello msg received (socket demonstrably live)
GET /GCRM/gc-probe (while WS open)         → { activeWebSockets: 0, wouldSelfDelete: true }   ← ❗ still 0
```
**Finding (the spike earned its keep here):** `ctx.getWebSockets().length` returned **0 even with a live, open WebSocket**. Authoritative cause (Cloudflare DO docs / durable-objects skill ref, line 263): **`ctx.getWebSockets()` only returns sockets accepted via the Hibernation API (`ctx.acceptWebSocket(ws)`).** A socket accepted in *standard* mode — which is partyserver's default unless hibernation is explicitly enabled — is a live connection that is **invisible to `ctx.getWebSockets()`**.

**Consequence if shipped as-is:** the architecture's GC probe (`ctx.getWebSockets().length === 0 ⇒ self-delete`) would read 0 for a room **full of active (standard-mode) players** and **delete a live room** — a data-loss bug, and the inverse of what AR-11/pre-mortem D intended.

**Verdict: GO for the DO-per-Table premise, but the GC mechanism needs ONE correction before Story 1.11.** Two acceptable fixes (decision for Winston, cheap either way):
1. **Enable partyserver Hibernation** so connections ARE accepted via `ctx.acceptWebSocket()` — then `ctx.getWebSockets()` is accurate AND we get the zero-idle-cost billing the $0 gate depends on. *(Strongly preferred — it's also what NFR-3/SM-7 assumes.)*
2. Or have the GC probe count partyserver's own connection registry (`getConnections()` / `[...this.getConnections()].length`) instead of `ctx.getWebSockets()`.
**The architecture text "hibernation-aware probe via `ctx.getWebSockets().length`" is only correct under fix #1.** This must be pinned in Story 1.11 (and re-confirmed: partyserver hibernation actually accepts via the native API).

**Zero-connection case confirmed:** with no sockets, `wouldSelfDelete: true` — correct.

---

## AC5 — $0 / free-tier → ✅ GO (structural confirmed; billing observation optional)

- ✅ Deployed on the account with the **SQLite DO** config accepted (no paid-tier prompt); `new_sqlite_classes` migration applied.
- ✅ Worker + DO live on the free `*.workers.dev` subdomain.
- ⏸️ Idle GB-s-not-accruing-during-hibernation: **depends on AC3 fix #1** (hibernation must actually be enabled for the billing benefit). Re-confirm once hibernation is wired. No drift from the architecture's 2026-06-19 free-tier snapshot observed.
**Verdict: GO**, contingent on AC3 fix #1 also delivering the hibernation billing benefit.

---

## AC4 — RECORDED GO/NO-GO DECISION

| AC | Assumption | Verdict |
|---|---|---|
| AC1 | claim-on-create via idFromName | ✅ GO — confirmed on edge |
| AC2 | persistence boundary (summary survives, round is memory-only) | ✅ GO — warm-confirmed; cold-restart = 1 optional user step |
| AC2 D2.1 | reload coercion → roundResult + token bump | ✅ GO — logic validated |
| AC3 | hibernation-aware GC | ⚠️ GO **with required correction** — `getWebSockets()` is empty for standard-mode sockets; must enable partyserver Hibernation (preferred) or count `getConnections()` |
| AC5 | $0 free-tier (SQLite DO + hibernation billing) | ✅ GO — structural confirmed; billing tied to AC3 fix |

### ✅ OVERALL DECISION: **GO** — proceed to Story 1.2.

The DO-per-Table, zero-cost, persistence-on-restart premise is **validated**. No NO-GO on any core assumption. One concrete architecture correction is required (not a re-decision): **the GC probe must use partyserver Hibernation (so `ctx.getWebSockets()` is accurate) or switch to `getConnections()`** — carry into Story 1.11, and verify partyserver's hibernation mode wires `ctx.acceptWebSocket()`.

**Recorded by:** Amelia (dev agent) · **Date:** 2026-06-19

### Follow-ups created for downstream stories (do not lose these)
- **[Story 1.11] GC correction:** enable partyserver Hibernation; assert `getWebSockets()` (or `getConnections()`) reflects live standard/hibernated sockets; re-confirm idle GB-s billing (AC5). **Blocks the $0 gate (SM-7) if wrong.**
- **[Story 1.6] claim-on-create race:** ensure the claimed-marker read+write is atomic within the DO's single-threaded turn (no two creators both seeing "unclaimed").
- **[optional user step] cold-restart empirical confirm:** `wrangler deploy` then `GET /PRST/inspect` (expect `memoryRoundPresent:false`) + `GET /PRST/reload-coerce` (expect `coerced:true, phase:roundResult, phaseToken:8`).
- **[env] TLS:** this machine's system `curl` (LibreSSL 3.3.6) can't TLS-handshake `*.workers.dev`; use `curl --tlsv1.2` or node fetch.

---

## Cleanup (after decision recorded)
```bash
cd spike && npx wrangler delete    # tear down spike Worker + DO
cd .. && rm -rf spike              # delete throwaway code (gitignored anyway)
```
The real project is scaffolded fresh in Story 1.2 — none of `spike/` carries over.
