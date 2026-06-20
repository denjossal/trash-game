// dispatch.ts — intent router + phase-legality; the single try/catch that turns an IntentError into a
// targeted `error` event. [Source: architecture.md#Canonical-round-trip, #The-rules table — single-error-catch-site]
//
// SCOPE (Story 1.6 → 1.7 → 1.8): routes createRoom + joinRoom + hostSetLives. The gameplay intents
// (deal/swap/keep/drawFromDeck/revealAll/dealAgain/newGame/hostRemovePlayer/hostReassign — Epics 2–4)
// are routed to an explicit not-yet-implemented rejection, NEVER silently accepted. The ONE try/catch
// lives here; handlers throw IntentError and never send.
//
// LOBBY VALIDATION (Decision #1, AC-1.6.3/1.7.5/1.8.3): lobby-phase intents (createRoom, joinRoom,
// hostSetLives) are guarded by lightweight phase-checking + the Durable Object's single-threaded
// serialization — NOT the formal two-scope token guard (turnToken/phaseToken), which would no-op in
// `lobby` and arrives in Epic 2 (server/src/rules/validate.ts, not yet created). Documented so Epic 2's
// guard never reroutes lobby actions. createRoom/joinRoom carry no token (payloads are {name} /
// {code,name,sessionToken?}); hostSetLives carries a `phaseToken` that is ACCEPTED-BUT-NOT-GUARDED in
// lobby (it is 0 pre-Deal and never advances) and is NOT bumped (set-lives is config, not a transition).
// [Source: architecture.md D4 lines 389–403; shared/src/types.ts Intent union.]
//
// FAN-OUT (Story 1.7/1.8): a roster/config change (join, set-lives, and later leave/host-controls)
// re-projects to EVERY connection via push-state.ts `fanOut` — each device gets its OWN per-player
// projection (never a single broadcast payload). createRoom still pushes to the one creating socket only.
// [Source: round-trip 523.]
import type { Intent } from "@trash/shared";
import { IntentError } from "@trash/shared";
import { handleCreateRoom, handleHostSetLives, handleJoinRoom, type TableHost } from "./handlers.js";
import { fanOut, pushError, pushState } from "./push-state.js";

/** The connection dispatch sends to. A partyserver Connection IS a WebSocket; we also stamp its
 *  per-connection playerId so subsequent intents on this socket know their owner. */
type DispatchConnection = {
  send(message: string): void;
  setState(state: { playerId: string }): unknown;
  // The per-connection stamp (null until a create/join binds it). Read for the joinRoom re-seat guard.
  readonly state: { playerId: string } | null;
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
        // host.table is non-null immediately after a successful create. The creator is the only
        // connection, so a single push (not a fan-out) is correct here.
        pushState(connection, host.table!, playerId);
        return;
      }
      case "joinRoom": {
        // Pass this socket's current stamp so the handler can reject a re-join (a second joinRoom or
        // createRoom-then-joinRoom on the same socket would double-seat + orphan presence).
        const playerId = await handleJoinRoom(host, intent, connection.state?.playerId);
        connection.setState({ playerId }); // bind this socket to the joining player for later intents.
        // A roster change: re-project to EVERY connection (the joiner learns its own you.playerId; all
        // existing devices see the new Player). Each is projected for ITS OWN playerId by fanOut —
        // never one broadcast payload. host.table is non-null after a successful join.
        fanOut(host.connections(), host.table!);
        return;
      }
      case "hostSetLives": {
        // The Host sets starting Lives in lobby (config change, not identity). Pass this socket's current
        // stamp as the caller identity (same read the join re-seat guard uses): an unstamped socket →
        // undefined → not-host. The handler validates (shape → table-null → phase → host → clamp), mutates
        // startingLives + every player's lives, and persists. We do NOT setState (the caller is already
        // stamped from create/join — set-lives binds no new identity).
        await handleHostSetLives(host, intent, connection.state?.playerId);
        // A config change every device must re-render: re-project to EVERY connection, each for ITS OWN
        // playerId (never one broadcast). On the error path the handler throws before this line, so the
        // single try/catch turns a not-host/phase-illegal into a targeted `error` with NO fan-out.
        fanOut(host.connections(), host.table!);
        return;
      }
      // --- NOT in Story 1.8 — explicit rejection, never a silent accept. ---
      // deal/swap/keep/drawFromDeck/revealAll/dealAgain/newGame/hostRemovePlayer/hostReassign → Epics 2–4.
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
