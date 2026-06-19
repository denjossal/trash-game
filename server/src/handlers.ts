// handlers.ts — one exported handle<Intent> fn per intent. The ONLY sites that assign
// table state (this.table = ...) or write ctx.storage, always AFTER validation.
// [Source: architecture.md#Canonical-round-trip, #Architectural-Boundaries — state-mutation boundary]
//
// SCOPE (Story 1.2): seam file only. Handlers land in Story 1.6+ (create/join/setLives)
// and Epics 2–4 (deal/turn/reveal/host-controls).
export {};
