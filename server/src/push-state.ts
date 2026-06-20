// push-state.ts — the ONLY module allowed to call connection.send / broadcast.
// [Source: architecture.md#Canonical-round-trip, #Architectural-Boundaries — single send site]
//
// The ESLint no-restricted-properties ban on .send/.broadcast is path-scoped to allow those calls
// HERE and nowhere else. This is the SM-6 egress chokepoint's I/O sink. Every server→client byte
// originates here, and every tableState payload is built by projectStateFor (the SOLE producer) —
// raw TableState is NEVER serialized to a client. [Source: architecture.md lines 104–110, 240–241,
// 367–376; eslint.config.js GATE 1 + the server/src/push-state.ts exemption.]
//
// SCOPE (Story 1.6): pushState (the tableState send) + pushError (the targeted error send). Fan-out
// to every connection is the CALLER's loop (`for (const c of conns) pushState(c, ...)`), not broadcast.
import type { ErrorReason, ServerEvent, TableState } from "@trash/shared";
import { projectStateFor } from "./project-state.js";

/** Anything we can send a string to — a partyserver Connection IS a WebSocket. Kept minimal so this
 *  module does not import partyserver (and so tests can pass a stub). */
type Sendable = { send(message: string): void };

/**
 * Project `state` for `playerId` and send it as the single `tableState` event to ONE connection.
 * The projection (project-state.ts) is the sole producer — this never serializes raw TableState, so a
 * non-owner's hidden card (or the server-private session token, which is not in TableState) can never
 * leak. To fan out, the caller loops: `for (const c of this.getConnections()) pushState(c, state, pid)`.
 */
export function pushState(connection: Sendable, state: TableState, playerId: string): void {
  const event: ServerEvent = { type: "tableState", payload: projectStateFor(state, playerId) };
  connection.send(JSON.stringify(event));
}

/**
 * Send a targeted `error` event (the second and only other ServerEvent literal) to ONE connection.
 * Used by dispatch's single try/catch when a handler throws an IntentError. [Source: architecture.md
 * D3 — single error-catch site; ServerEvent union (tableState | error).]
 */
export function pushError(connection: Sendable, reason: ErrorReason): void {
  const event: ServerEvent = { type: "error", payload: { reason } };
  connection.send(JSON.stringify(event));
}
