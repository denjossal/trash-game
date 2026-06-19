// Identity-issuance unit test (the node "rules" vitest project — *.test.ts suffix; pure-function
// test, no WS/DO plumbing). [Source: server/vitest.config.ts naming convention; Story 1.5 AC-1.5.1.]
//
// Socket-independence (AC-1.5.1) is a STRUCTURAL property, asserted by the signature, not a mock:
// issueIdentity() takes no socket argument and reads no connection state. There is no connection
// flow in this story to mock against (table-server.ts is an empty class). We assert the values it
// produces (distinct, unique, UUID-v4-shaped); the "independent of socket id" guarantee holds
// because the function literally cannot observe a socket.
import { expect, test } from "vitest";
import { issueIdentity } from "./identity.js";

// crypto.randomUUID() v4 shape: 8-4-4-4-12 hex, version nibble "4", variant nibble 8|9|a|b.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test("issueIdentity: returns non-empty playerId + sessionToken, and they DIFFER", () => {
  const { playerId, sessionToken } = issueIdentity();
  expect(typeof playerId).toBe("string");
  expect(typeof sessionToken).toBe("string");
  expect(playerId.length).toBeGreaterThan(0);
  expect(sessionToken.length).toBeGreaterThan(0);
  // playerId is the PUBLIC state key; sessionToken is the PRIVATE reconnect proof. If they were the
  // same value, the public roster id would BE the reconnect secret (impersonation). Two distinct draws.
  expect(playerId).not.toBe(sessionToken);
});

test("issueIdentity: successive calls produce DISTINCT ids and DISTINCT tokens (uniqueness)", () => {
  const a = issueIdentity();
  const b = issueIdentity();
  expect(a.playerId).not.toBe(b.playerId); // guards against a hard-coded/constant regression
  expect(a.sessionToken).not.toBe(b.sessionToken);
});

test("issueIdentity: playerId and sessionToken are UUID-v4 shaped (pins crypto.randomUUID as source)", () => {
  const { playerId, sessionToken } = issueIdentity();
  expect(playerId).toMatch(UUID_V4);
  expect(sessionToken).toMatch(UUID_V4);
});
