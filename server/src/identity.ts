// identity.ts — issues playerId + session token (crypto.randomUUID) at create/join;
// resolves an inbound token to a player. The §11.3 reconnect-ready seam (issuance in MVP;
// reconnection FLOW deferred).
// [Source: architecture.md#AR-12, #Integration-Points — Identity]
//
// SCOPE (Story 1.2): seam file only. Implemented in Story 1.5 (player identity & session).
export {};
