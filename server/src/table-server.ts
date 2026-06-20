// The per-Table Durable Object — one DO per Table, SQLite-backed (free-tier requirement).
// [Source: architecture.md#D1, #D2, #Complete-Project-Directory-Structure]
//
// SCOPE (Story 1.6 → 1.7): wires the create/join round-trip + presence — the connection lifecycle
// (onStart hydrate, onConnect, onMessage parse, onClose presence), delegating to dispatch → handlers →
// persistence → push-state. The DO holds the authoritative TableState as an instance field (cache); the
// durable summary in ctx.storage["table"] is the source of truth (Init AC5 — instance fields are
// cache-only; hibernation wipes them). The phase machine (Epics 2–4) and the DO alarm GC (1.11) are later.
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
// code grows. Re-evaluated for 1.7: onClose adds one thin presence flip (delegated to handlers.markDisconnected)
// + a fan-out; the lifecycle is still modest, so it stays here. Re-evaluate when reconnection (deferred)
// or host-controls (Epic 4) grow it.
import type { Connection, WSMessage } from "partyserver";
import { Server } from "partyserver";
import type { Intent, TableState } from "@trash/shared";
import { dispatch } from "./dispatch.js";
import { markDisconnected, type ConnectionState, type TableHost } from "./handlers.js";
import { loadSummary, reconcileSummaryToState } from "./persistence.js";
import { fanOut } from "./push-state.js";

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
   * A new socket connected. Keep this thin — no state mutation here (that is the handler's job), and NO
   * projection on bare connect. A fresh socket has no stamped playerId until its createRoom/joinRoom
   * intent arrives (onMessage → dispatch → setState), so there is nothing to project per-player yet:
   *   - createRoom: the connection arrives BEFORE the Table exists; the handler produces the first push.
   *   - joinRoom: the handler appends + fans out (the new socket, now stamped, is in the fan-out set).
   * Re-projecting an ALREADY-identified socket on a bare reconnect (resolving its sessionToken → an
   * existing seat) is the deferred §11.3 / AR-12 reconnection FLOW, not this story (maxRetries:0 client-
   * side; only identity issuance ships). [Source: architecture.md D3 round-trip; D4 reconnection deferred.]
   */
  override onConnect(): void {
    // Intentionally empty: create/join intents drive the first projection (the fan-out includes the
    // joining socket). Bare-connect re-projection is the deferred reconnection FLOW. (A subclass override
    // may declare fewer parameters than the base onConnect(connection, ctx).)
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

  /**
   * A socket closed (the leave path — AC-1.7.3 "a leaver stops taking Turns"). Flip the owning Player's
   * `isConnected` to false and fan out so every remaining device sees them go offline live. The flip is
   * delegated to handlers.markDisconnected (the single state-mutation module) and is IN-MEMORY ONLY — no
   * persistSummary, because `isConnected` is ephemeral socket presence, deliberately excluded from the
   * durable summary. The player RECORD is retained (`isAlive` unchanged): a disconnected-but-alive player
   * still owes a Turn; the Host conducts around them (no auto-timeout in MVP). Only fan out when the flip
   * actually changed something (a known, previously-connected socket). This method is transport-only — it
   * never assigns table state directly and routes egress through push-state.ts (fanOut), never .send.
   * Reconnection (resuming the seat on a later socket) is the deferred §11.3 FLOW. [Source: architecture
   * lines 321–328; persistence.ts DurablePlayer omits isConnected; handlers.markDisconnected.]
   */
  override onClose(connection: Connection<ConnectionState>): void {
    const playerId = connection.state?.playerId;
    if (playerId === undefined) return; // socket never identified (no create/join completed) — nothing to flip.
    const changed = markDisconnected(this, playerId);
    if (changed && this.table !== null) {
      fanOut(this.connections(), this.table);
    }
  }

  /**
   * Every live connection, typed with our per-socket ConnectionState (the stamped playerId). This is the
   * TableHost.connections() implementation — a thin typed wrapper over partyserver's generic
   * `getConnections<TState>()`. Named distinctly from the base method to avoid re-satisfying its generic
   * variance under `implements`. The fan-out (dispatch join / onClose leave) reads each connection's
   * stamped playerId from `.state`. [Source: partyserver Server.getConnections; handlers.TableHost.]
   */
  connections(): Iterable<Connection<ConnectionState>> {
    return this.getConnections<ConnectionState>();
  }
}
