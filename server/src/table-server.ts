// The per-Table Durable Object — one DO per Table, SQLite-backed (free-tier requirement).
// [Source: architecture.md#D1, #D2, #Complete-Project-Directory-Structure]
//
// SCOPE (Story 1.6 → 1.7): wires the create/join round-trip + presence — the connection lifecycle
// (onStart hydrate, onConnect, onMessage parse, onClose presence), delegating to dispatch → handlers →
// persistence → push-state. The DO holds the authoritative TableState as an instance field (cache); the
// durable summary in ctx.storage["table"] is the source of truth (Init AC5 — instance fields are
// cache-only; hibernation wipes them). The phase machine (Epics 2–4) arrives later.
//
// Init AC5: authoritative Table state persists to ctx.storage; DO instance fields are cache-only. The
// in-flight `round` is intentionally memory-only (null in lobby) and is never persisted (D2).
//
// HIBERNATION (Story 1.11): ENABLED via `static options = { hibernate: true }`. This makes partyserver
// accept sockets through the native ctx.acceptWebSocket(), which (a) keeps live sockets visible to the GC
// connection probe and (b) stops GB-s accruing for idle connections (NFR-3/SM-7). The Story 1.1 spike
// proved the inverse: under the standard-accept default, ctx.getWebSockets() reads 0 for a room full of
// live players, so an uncorrected probe would DELETE A LIVE ROOM. The GC probe (onAlarm) counts
// [...this.connections()].length — partyserver's getConnections() filters to OPEN sockets, so a socket in
// CLOSING state is not miscounted as active (the raw ctx.getWebSockets() does NOT filter readyState). The
// AC-1.11.2 integration check confirms hibernation actually wires acceptWebSocket() for this partyserver
// version. [Source: 1-1-spike-findings AC3; architecture.md#D7.]
//
// WATCH (architecture watch-list): peel connection/session mgmt into connections.ts only if WS-lifecycle
// code grows. Re-evaluated for 1.7: onClose adds one thin presence flip (delegated to handlers.markDisconnected)
// + a fan-out; the lifecycle is still modest, so it stays here. Re-evaluate when reconnection (deferred)
// or host-controls (Epic 4) grow it.
import type { Connection, WSMessage } from "partyserver";
import { Server } from "partyserver";
import { ALARM_REARM_DEBOUNCE_MS, IDLE_TTL_MS, type Intent, type TableState } from "@trash/shared";
import { dispatch } from "./dispatch.js";
import { markDisconnected, type ConnectionState, type TableHost } from "./handlers.js";
import { loadSummary, reconcileSummaryToState } from "./persistence.js";
import { fanOut } from "./push-state.js";

export class TableServer extends Server<Record<string, never>> implements TableHost {
  // Enable WebSocket Hibernation (Story 1.11): sockets are accepted via the native ctx.acceptWebSocket(),
  // so ctx.getWebSockets() reflects live connections (accurate GC probe) and idle GB-s stop accruing.
  static options = { hibernate: true };

  // Authoritative in-memory TableState (cache; null until claimed). handlers.ts is the ONLY writer.
  table: TableState | null = null;

  // Wall-clock time the idle GC alarm was last armed (cache-only; reset to null on wake — safe, since the
  // next activity simply re-arms; over-arming is harmless, only under-arming would be risky — D7). Used to
  // debounce re-arms so a burst of intents does not rewrite the alarm on every message.
  #lastAlarmArmedAt: number | null = null;

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
    // No state mutation / projection here (create/join intents drive the first projection; the fan-out
    // includes the joining socket). Bare-connect re-projection is the deferred reconnection FLOW. We DO
    // arm the idle GC alarm: an opened socket is activity, so the room is live and the idle TTL clock
    // (re)starts. Debounced, so reconnect storms don't write-amplify. [Story 1.11 AC-1.11.1.]
    this.armIdleAlarm();
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
    // A handled inbound message is activity — refresh the idle TTL (debounced). dispatch swallows
    // IntentErrors into a targeted `error`, so this also runs for a benignly-rejected intent; that is fine,
    // the socket is open and the room is genuinely active (and the debounce caps the write rate anyway).
    this.armIdleAlarm();
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

  /**
   * Arm the idle GC alarm for `now + IDLE_TTL_MS`, DEBOUNCED: skip if we armed within the last
   * ALARM_REARM_DEBOUNCE_MS, so a burst of intents/connections does not rewrite the alarm on every message
   * (no per-intent setAlarm write amplification — D7). Called on activity (onConnect, post-dispatch). The
   * debounce no-op is safe: over-arming the TTL costs nothing; only too-short a TTL would be risky.
   * [Story 1.11 AC-1.11.1; architecture.md#D7.]
   */
  private armIdleAlarm(): void {
    const now = Date.now();
    if (this.#lastAlarmArmedAt !== null && now - this.#lastAlarmArmedAt <= ALARM_REARM_DEBOUNCE_MS) {
      return; // within the debounce window — the existing alarm stands.
    }
    // Fire-and-forget: arming the alarm must never block the connection/message path. Stamp the debounce
    // marker ONLY after the write succeeds — otherwise a swallowed setAlarm rejection would leave no alarm
    // scheduled yet mark the room "armed," and the debounce would suppress the next activity's retry for a
    // full ALARM_REARM_DEBOUNCE_MS (a window with NO GC alarm). On failure we leave #lastAlarmArmedAt
    // unchanged so the very next activity re-attempts. (The TTL is a backstop, not a hard deadline.)
    void this.ctx.storage
      .setAlarm(now + IDLE_TTL_MS)
      .then(() => {
        this.#lastAlarmArmedAt = now;
      })
      .catch(() => {});
  }

  /**
   * The idle GC alarm fired (partyserver's native alarm() calls this after #ensureInitialized()). Probe for
   * active connections via `[...this.connections()].length` — partyserver's getConnections() filters to
   * OPEN sockets (readyState === READY_STATE_OPEN), so a socket that is mid-CLOSE is correctly NOT counted.
   * (Hibernation is what makes this accurate: under the standard-accept default the Story 1.1 spike found a
   * room full of live players reading 0 — see the class-header note. We deliberately do NOT use the raw
   * ctx.getWebSockets().length here: it returns every accepted socket regardless of readyState, so a socket
   * in CLOSING state would be miscounted as active and a just-emptied room would survive another full TTL.)
   * Self-delete ONLY when empty — deleteAll() clears the durable "table" key, RELEASING the Room Code for
   * re-claim (claim-on-create finds an unclaimed DO). A room with connected players is preserved and the
   * alarm re-armed, so the 3h idle TTL remains the backstop for sockets that never cleanly close. No central
   * reaper — GC is solely this DO's own alarm. [Story 1.11 AC-1.11.2/.3/.4/.6; architecture.md#D7; 1-1-spike-findings AC3.]
   */
  override async onAlarm(): Promise<void> {
    const activeConnections = [...this.connections()].length;
    if (activeConnections === 0) {
      await this.ctx.storage.deleteAll(); // self-delete — clears "table", releasing the code.
      this.table = null; // drop the in-memory cache so a re-claim on this id starts clean.
      this.#lastAlarmArmedAt = null;
      return;
    }
    // Still active — preserve the room and re-arm the idle backstop.
    this.#lastAlarmArmedAt = Date.now();
    await this.ctx.storage.setAlarm(Date.now() + IDLE_TTL_MS);
  }
}
