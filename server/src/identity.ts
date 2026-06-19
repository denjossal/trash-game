// identity.ts — issues playerId + session token (crypto.randomUUID) at create/join;
// resolves an inbound token to a player. The §11.3 reconnect-ready seam (issuance in MVP;
// reconnection FLOW deferred).
// [Source: architecture.md#AR-12, #Integration-Points — Identity]
//
// SCOPE: Story 1.5 implements the ISSUANCE half (issueIdentity). The token→player RESOLVER half
// (the "resolve inbound token → player" responsibility named in the architecture directory map) is
// the Story 1.7 join-flow seam — it resolves against a player registry that does not exist yet
// (table-server.ts is still an empty class). Deliberately NOT built here: it would be unused, untested
// dead code. Story 1.7 adds resolveIdentity(token, players) when the join flow + roster exist.
//
// PURITY: this file is in server/src/, NOT server/src/rules/**, so the rules-purity ESLint gate does
// NOT apply — crypto.randomUUID() is legitimate here. issueIdentity() is still side-effect-free apart
// from the CSPRNG draw: it touches no storage, no socket, no `this`. The repo-wide .send/.broadcast
// ban applies, but this function sends nothing.

/**
 * A freshly issued player identity. Both values come from independent `crypto.randomUUID()` draws:
 *  - `playerId`     — the PUBLIC state key. Appears in ProjectedTableState.you.playerId / players[].id,
 *                     visible to every device at the table. All server state keys by this, never a socket id.
 *  - `sessionToken` — the PRIVATE reconnect proof. Held only on the issuing device's localStorage and
 *                     echoed back on joinRoom. Kept distinct from playerId so the public roster id is NOT
 *                     the reconnect secret (impersonation prevention — §11.3).
 */
export type Identity = {
  playerId: string;
  sessionToken: string;
};

/**
 * Issue a new, socket-independent identity at create/join. Caller-agnostic: host vs joiner is the
 * caller's concern (Story 1.6 stamps the host's playerId as hostId), not the issuer's.
 *
 * Uses the global `crypto.randomUUID()` (native Workers WebCrypto; also a global in Node ≥ 22 and
 * browsers) — no import, no npm dependency. [Source: architecture.md §292 "native Workers WebCrypto …
 * crypto.randomUUID() (playerId/session token). No external crypto dependency. (Verified.)"]
 */
export function issueIdentity(): Identity {
  return {
    playerId: crypto.randomUUID(),
    sessionToken: crypto.randomUUID(),
  };
}
