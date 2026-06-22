// dispatch.ts — intent router + phase-legality; the single try/catch that turns an IntentError into a
// targeted `error` event. [Source: architecture.md#Canonical-round-trip, #The-rules table — single-error-catch-site]
//
// SCOPE (Story 1.6 → 1.7 → 1.8 → 2.3 → 2.4 → 2.6 → 3.2 → 3.4): routes createRoom + joinRoom + hostSetLives +
// deal + swap + keep + drawFromDeck + revealAll (the Showdown trigger — Story 3.2) + dealAgain (the between-
// rounds re-deal — Story 3.4). The remaining gameplay intents (newGame/hostRemovePlayer/hostReassign —
// Stories 3.6/4.x) are routed to an explicit not-yet-implemented rejection, NEVER silently accepted. The ONE
// try/catch lives here; handlers throw IntentError and never send.
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
import {
  handleCreateRoom,
  handleDeal,
  handleDealAgain,
  handleDraw,
  handleHostSetLives,
  handleJoinRoom,
  handleKeep,
  handleReveal,
  handleSwap,
  type TableHost,
} from "./handlers.js";
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
      case "deal": {
        // The Host deals (Story 2.3, FR-5). The handler runs the full accepted-path chokepoint
        // (shape → table-null → phase → host → ≥2-alive → checkPhaseToken → mutate → bump → persist),
        // landing the table in `turns` with each Player's secret Card in the memory-only round. On a
        // double-tap / stale token it throws `stale-phase` (or not-host/phase-illegal) BEFORE this line,
        // so the single try/catch emits a targeted `error` with NO fan-out. On success we fan out so
        // every device transitions to the dealt state TOGETHER (simultaneous reveal-down, AC-2.3.2),
        // each receiving ONLY its own Card via projectStateFor (others' hands omitted — SM-6).
        await handleDeal(host, intent, connection.state?.playerId);
        fanOut(host.connections(), host.table!);
        return;
      }
      case "swap": {
        // The active Player exchanges their Card with the Player to their right (Story 2.4, FR-6). The
        // handler runs the turn-scoped accepted-path chokepoint (shape → table-null → round-null/phase →
        // not-your-turn → checkTurnToken → applySwap → bumpTurnToken), with NO persist (memory-only round
        // change). On a stale/double-tapped token it throws `stale-turn` (or not-your-turn/phase-illegal)
        // BEFORE this line → the single try/catch emits a targeted `error` (swallowed silently by the
        // client, Story 2.2) with NO fan-out. On success we fan out so every device re-projects with its
        // OWN Card and the new currentTurnId; the receiver's snapshot carries the value-free
        // justReceivedSwap squirm signal (SM-6 holds — own-card-only via projectStateFor).
        await handleSwap(host, intent, connection.state?.playerId);
        fanOut(host.connections(), host.table!);
        return;
      }
      case "keep": {
        // The active Player keeps their Card and passes the Turn right (Story 2.4, FR-6). Same chokepoint
        // as swap, but applyKeep leaves hands untouched. NO persist (memory-only round change). Fan out on
        // success so every device sees the advanced currentTurnId.
        await handleKeep(host, intent, connection.state?.playerId);
        fanOut(host.connections(), host.table!);
        return;
      }
      case "drawFromDeck": {
        // The Last Player draws a random Card from the Deck instead of swapping (Story 2.6, FR-7). Same
        // turn-scoped chokepoint as swap/keep PLUS a last-player authority check; handleDraw is the ONE
        // turn handler that PERSISTS (it completes the one pass → phase turns→allActed + phaseToken). On a
        // stale token / non-last-seat / null-round it throws (stale-turn / not-your-turn / phase-illegal)
        // BEFORE this line → the single try/catch emits a targeted `error`, NO fan-out. On success we fan
        // out so EVERY device re-projects with the drawer's new own Card (SM-6 — own-card-only) and the
        // `allActed` phase (the active seat is cleared, so everyone routes to Waiting until reveal, Epic 3).
        await handleDraw(host, intent, connection.state?.playerId);
        fanOut(host.connections(), host.table!);
        return;
      }
      case "revealAll": {
        // The Host triggers the simultaneous Showdown reveal (Story 3.2, FR-9). The handler runs the
        // PHASE-scoped accepted-path chokepoint (shape → table-null → not-host → checkPhaseToken →
        // phase=="allActed" → revealed=true + phase=showdown → bumpPhaseToken → persist), consuming the
        // existing Epic-2 phase token (no new guard). On a reveal before allActed / a non-Host / a stale
        // double-tap it throws (phase-illegal / not-host / stale-phase) BEFORE this line → the single
        // try/catch emits a targeted `error` with NO fan-out, and nothing is revealed (reveal-finality,
        // NFR-5). On success we fan out so every device flips TOGETHER to `showdown`; because
        // round.revealed is now true, each per-device projection includes EVERY seat's hand — the first
        // moment a non-owner receives another Player's Card (SM-6 extended via projectStateFor, Decision #3).
        await handleReveal(host, intent, connection.state?.playerId);
        fanOut(host.connections(), host.table!);
        return;
      }
      case "dealAgain": {
        // The Host re-deals between rounds (Story 3.4, FR-12). The handler runs the PHASE-scoped accepted-
        // path chokepoint (shape → table-null → not-host → checkPhaseToken → phase=="roundResult" → deal
        // survivors with the resolved Loser as Starting Player → clear result → phase=turns → bumpPhaseToken
        // → persist), cloning handleDeal. On a non-Host / stale double-tap / wrong-phase (incl. gameOver) it
        // throws (not-host / stale-phase / phase-illegal) BEFORE this line → the single try/catch emits a
        // targeted `error` with NO fan-out. On success we fan out so every device transitions to the freshly
        // dealt `turns` round TOGETHER, each receiving ONLY its own Card via projectStateFor (SM-6).
        await handleDealAgain(host, intent, connection.state?.playerId);
        fanOut(host.connections(), host.table!);
        return;
      }
      // --- NOT yet implemented — explicit rejection, never a silent accept. ---
      // newGame (Story 3.6) / hostRemovePlayer/hostReassign (Epic 4).
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
