// The per-Table Durable Object — one DO per Table, SQLite-backed (free-tier requirement).
// [Source: architecture.md#D1, #D2, #Complete-Project-Directory-Structure]
//
// SCOPE (Story 1.2): minimal class so the binding resolves (name "Table" <-> class_name
// "TableServer" <-> this exported symbol, Init AC3). NO game logic — the phase machine
// (Story 1.6+), persistence (1.6), and the DO alarm GC (1.11) are added by later stories.
//
// Init AC5: authoritative Table state persists to ctx.storage; DO instance fields are
// cache-only (hibernation wipes in-memory fields). The storage seam exists from day one;
// the persistence logic itself arrives with the phase machine.
//
// WATCH (architecture watch-list): peel connection/session mgmt into connections.ts only
// if WS-lifecycle code grows; keep this module minimal.
import { Server } from "partyserver";

export class TableServer extends Server<Record<string, never>> {}
