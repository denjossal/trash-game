// dispatch.ts — intent router + phase-legality; the single try/catch that turns an IntentError into a
// targeted `error` event. [Source: architecture.md#Canonical-round-trip, #The-rules table — single-error-catch-site]
//
// SCOPE (Story 1.6): routes createRoom (the only live intent). joinRoom (1.7), hostSetLives (1.8) and
// the gameplay intents (deal/swap/keep/drawFromDeck/revealAll/dealAgain/newGame/hostRemovePlayer/
// hostReassign — Epics 2–4) are routed to an explicit not-yet-implemented rejection, NEVER silently
// accepted. The ONE try/catch lives here; handlers throw IntentError and never send.
//
// LOBBY VALIDATION (Decision #1, AC-1.6.3): lobby-phase intents (createRoom, and later joinRoom) are
// guarded by lightweight phase-checking + the Durable Object's single-threaded serialization — NOT the
// formal two-scope token guard (turnToken/phaseToken), which would no-op in `lobby` and arrives in Epic 2
// (server/src/rules/validate.ts, not yet created). Documented so Epic 2's guard never reroutes lobby
// actions. createRoom carries no token (its payload is {name} only). [Source: architecture.md D4 lines
// 389–403; shared/src/types.ts Intent union.]
import type { Intent } from "@trash/shared";
import { IntentError } from "@trash/shared";
import { handleCreateRoom, type TableHost } from "./handlers.js";
import { pushError, pushState } from "./push-state.js";

/** The connection dispatch sends to. A partyserver Connection IS a WebSocket; we also stamp its
 *  per-connection playerId so subsequent intents on this socket know their owner. */
type DispatchConnection = {
  send(message: string): void;
  setState(state: { playerId: string }): unknown;
};

/**
 * Route one parsed intent. The SINGLE try/catch: any IntentError a handler throws becomes a targeted
 * `error` event to THIS connection; nothing else catches-and-sends. On a successful createRoom we stamp
 * the connection's playerId and push the freshly created lobby TableState back to the creator.
 */
export async function dispatch(host: TableHost, connection: DispatchConnection, intent: Intent): Promise<void> {
  try {
    switch (intent.type) {
      case "createRoom": {
        const playerId = await handleCreateRoom(host, intent);
        connection.setState({ playerId }); // bind this socket to the host's player for later intents.
        // host.table is non-null immediately after a successful create.
        pushState(connection, host.table!, playerId);
        return;
      }
      // --- NOT in Story 1.6 — explicit rejection, never a silent accept. ---
      // joinRoom → Story 1.7; hostSetLives → Story 1.8; deal/swap/keep/drawFromDeck/revealAll/
      // dealAgain/newGame/hostRemovePlayer/hostReassign → Epics 2–4.
      default:
        throw new IntentError("phase-illegal");
    }
  } catch (err) {
    if (err instanceof IntentError) {
      pushError(connection, err.reason);
      return;
    }
    throw err; // non-IntentError = a real bug; let it surface (onException / DO error path).
  }
}
