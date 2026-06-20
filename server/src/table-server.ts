// The per-Table Durable Object — one DO per Table, SQLite-backed (free-tier requirement).
// [Source: architecture.md#D1, #D2, #Complete-Project-Directory-Structure]
//
// SCOPE (Story 1.6): wires the createRoom round-trip — the connection lifecycle (onStart hydrate,
// onConnect, onMessage parse), delegating to dispatch → handlers → persistence → push-state. The DO
// holds the authoritative TableState as an instance field (cache); the durable summary in
// ctx.storage["table"] is the source of truth (Init AC5 — instance fields are cache-only; hibernation
// wipes them). joinRoom (1.7), the phase machine (Epics 2–4), and the DO alarm GC (1.11) are later.
//
// Init AC5: authoritative Table state persists to ctx.storage; DO instance fields are cache-only. The
// in-flight `round` is intentionally memory-only (null in lobby) and is never persisted (D2).
//
// HIBERNATION: deliberately NOT enabled this story (no `static options = { hibernate: true }`). The
// hibernation-accept mode + the GC connection-probe are Story 1.11's job (the Story 1.1 spike found
// ctx.getWebSockets() reads 0 for standard-mode sockets); enabling it here would couple 1.6 to GC/
// billing. Default standard accept mode. [Source: 1-1-spike-findings AC3 → Story 1.11.]
//
// WATCH (architecture watch-list): peel connection/session mgmt into connections.ts only if WS-lifecycle
// code grows; 1.6's lifecycle is small (createRoom only), so keep this module minimal.
import type { Connection, WSMessage } from "partyserver";
import { Server } from "partyserver";
import type { Intent, TableState } from "@trash/shared";
import { dispatch } from "./dispatch.js";
import type { ConnectionState, TableHost } from "./handlers.js";
import { loadSummary, reconcileSummaryToState } from "./persistence.js";

export class TableServer extends Server<Record<string, never>> implements TableHost {
  // Authoritative in-memory TableState (cache; null until claimed). handlers.ts is the ONLY writer.
  table: TableState | null = null;

  /** The DO storage handle for the single durable "table" key (D2). Exposes ctx.storage to TableHost. */
  get storage(): DurableObjectStorage {
    return this.ctx.storage;
  }

  /**
   * Hydrate the in-memory cache from the durable summary on first wake (Init AC5 — instance fields are
   * cache-only). If a summary exists, rebuild via the D2.1 reconcile (which coerces a lost live-round
   * phase to roundResult; a no-op for a lobby Table). A never-claimed DO stays `table: null` so the
   * first createRoom can claim it. [Source: architecture.md D2/D2.1; spike AC2.]
   */
  override async onStart(): Promise<void> {
    const summary = await loadSummary(this.storage);
    if (summary !== undefined) {
      this.table = reconcileSummaryToState(summary);
    }
  }

  /**
   * A new socket connected. Keep this thin — no state mutation here (that is the handler's job). If a
   * Table already exists, project the current state to the just-connected socket so it renders the
   * lobby immediately; this is the seam Story 1.7 leans on for live roster updates. For the createRoom
   * flow the connection arrives BEFORE the Table exists (the creator's first connect), so there is
   * nothing to push yet — the createRoom handler produces the first push. We do NOT know this socket's
   * playerId until its createRoom/joinRoom intent stamps it, so we cannot project per-player here for a
   * fresh connection. [Source: architecture.md D3 round-trip — pushed on (re)connect.]
   */
  override onConnect(): void {
    // Intentionally minimal in 1.6: the createRoom intent (onMessage → dispatch → handler) drives the
    // first projection. Re-projecting an existing Table to a late connection is Story 1.7 (join), where
    // the connection's playerId is known from the joinRoom intent. (A subclass override may declare
    // fewer parameters than the base onConnect(connection, ctx).)
  }

  /**
   * Inbound client → server message. Parse the {type,payload} envelope (camelCase JSON, AR-7) into an
   * Intent and delegate to dispatch. This method NEVER assigns table state or sends — dispatch holds the
   * single try/catch and handlers are the sole state-assignment site (state-mutation boundary). A
   * non-string / unparseable / non-object message is ignored (lightweight lobby handling — Decision #1;
   * no validation lib). [Source: architecture.md D3 lines 514–539; D4 lobby validation.]
   */
  override async onMessage(connection: Connection<ConnectionState>, message: WSMessage): Promise<void> {
    if (typeof message !== "string") return; // binary frames are not part of the intent protocol.
    let intent: Intent;
    try {
      intent = JSON.parse(message) as Intent;
    } catch {
      return; // malformed JSON — drop silently (lightweight lobby handling; no error channel abuse).
    }
    if (typeof intent !== "object" || intent === null || typeof (intent as { type?: unknown }).type !== "string") {
      return; // not an intent envelope — drop.
    }
    await dispatch(this, connection, intent);
  }
}
