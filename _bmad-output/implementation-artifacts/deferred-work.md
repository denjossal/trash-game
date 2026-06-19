# Deferred Work

## Deferred from: code review of 1-1-pre-build-spike (2026-06-19)

> Source story is a THROWAWAY spike. None of these require touching the (about-to-be-deleted) spike code; they are carried as known limitations / downstream follow-ups. The GO decision stands.

- **AC2 false-PASS verdict strings** [spike/src/table-server.ts:159-166,172-197] — `/inspect` & `/reload-coerce` emit "PASS"/`coerced:true` purely from `round===null`, which holds on any warm/cold/fresh instance, so the string does not prove a forced restart caused it. The findings doc already records the cold-restart half as an optional user step; no durable artifact is wrong. Risk if not noted: a future reader trusts the verbatim PASS over the findings caveats.
- **AC3 `getWebSockets()` returns 0 under partyserver default `hibernate:false`** [spike/src/table-server.ts:202-215,225-234] — this IS the recorded AC3 defect. The `alarm()` preserve-branch (sockets>0) is dead code in the spike. **Correction owned by Story 1.11:** enable partyserver Hibernation (preferred — also delivers the idle-billing benefit the $0 gate/SM-7 assumes) or count `getConnections()`; verify partyserver hibernation accepts via `ctx.acceptWebSocket()`.
- **AC3 `alarm()` GC decision never fired/observed** [spike/src/table-server.ts:225-234] — the 60s idle alarm was never awaited in the deployed run; the GC self-delete/preserve behavior was only probed synchronously via the HTTP endpoint. Folds into the Story 1.11 GC correction (verify the alarm path empirically there).
- **AC1 concurrent-claim race not exercised** [spike/src/table-server.ts:84-113] — only the sequential happy path was proven; the verdict "Claim-on-create CONFIRMED" reads stronger than observed. **Follow-up owned by Story 1.6:** ensure the claimed-marker read+write is atomic within the DO's single-threaded turn (no two creators both seeing "unclaimed").

## Deferred from: code review of 1-2-ac-driven-project-initialization (2026-06-19)

- **Client `tsc -b` permanently "out of date"** [client/tsconfig.json] — `noEmit:true` + `composite:false` means `tsc -b` checks for an output file that can never exist, so it rebuilds from scratch every run (incremental cache never registers up-to-date). Functionally fine — it does typecheck the client `.ts` files. Cosmetic/perf only; revisit (`tsc -p` or `tsc --noEmit` for the client leaf) if client typecheck time becomes a problem.
