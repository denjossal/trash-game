// table-server-reload.do.test.ts — the D2.1 reload-coercion RE-PERSIST (Story 2.2, AC-2.2.6). Runs in
// the `do` / @cloudflare/vitest-pool-workers project (real Workers runtime + real ctx.storage) so we
// can assert what is PERSISTED to the "table" key after the DO wakes, not just the in-memory cache.
//
// The bug this closes (deferred-work #61): onStart's reconcile coerced a lost live-round phase to
// roundResult and bumped phaseToken+1 in MEMORY, but never re-persisted — so a second eviction reloaded
// the OLD token and coerced AGAIN. AC-2.2.6 requires the bumped token to be made durable so phaseToken
// monotonicity holds across repeated restarts. [Source: architecture.md D2.1; persistence.ts onStart.]
//
// HOW WE TRIGGER onStart: partyserver runs onStart inside #ensureInitialized on the first request to the
// DO. A bare runInDurableObject does NOT drive that path, so we open a real WebSocket (SELF.fetch +
// Upgrade) to force the lifecycle — exactly the harness the create/join DO tests use. We then read the
// PERSISTED "table" key (the durable source of truth) to prove the re-persist, which is the whole point.
import { SELF, env, runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";

type StoredSummary = {
  code: string;
  phase: string;
  hostId: string;
  startingLives: number;
  players: { id: string; name: string; lives: number; isAlive: boolean; seatIndex: number }[];
  phaseToken: number;
};

const liveRoundSummary = (code: string, phaseToken: number): StoredSummary => ({
  code,
  phase: "turns", // a live-round phase → must coerce on wake.
  hostId: "host-1",
  startingLives: 3,
  players: [{ id: "host-1", name: "Host", lives: 3, isAlive: true, seatIndex: 0 }],
  phaseToken,
});

/** Seed a durable summary into the DO's storage for `code`. */
async function seedSummary(code: string, summary: StoredSummary): Promise<void> {
  const stub = env.Table.get(env.Table.idFromName(code));
  await runInDurableObject(stub, async (_instance, state) => {
    await state.storage.put("table", summary);
  });
}

/** Open + immediately close a WebSocket to force the DO lifecycle (onStart via #ensureInitialized). */
async function wakeDurableObject(code: string): Promise<void> {
  const res = await SELF.fetch(`http://example.com/parties/table/${code}`, {
    headers: { Upgrade: "websocket" },
  });
  const ws = res.webSocket;
  if (!ws) throw new Error(`expected a WebSocket upgrade for /parties/table/${code}, got status ${res.status}`);
  ws.accept();
  // Give onStart (which ran before this connect, inside blockConcurrencyWhile) a tick to settle the
  // re-persist, then close — we read the durable key afterward.
  await new Promise((r) => setTimeout(r, 20));
  ws.close();
}

/** Read the persisted "table" summary for `code` (the durable source of truth). */
async function readPersisted(code: string): Promise<StoredSummary | undefined> {
  const stub = env.Table.get(env.Table.idFromName(code));
  return runInDurableObject(stub, async (_instance, state) => state.storage.get<StoredSummary>("table"));
}

test("AC-2.2.6: waking on a lost live round coerces to roundResult, bumps phaseToken, and RE-PERSISTS it", async () => {
  // Seed a summary implying a live round (phase "turns", token 5). The round object is never persisted,
  // so on wake `round === null` while phase says "turns": the D2.1 coercion case.
  await seedSummary("RLD1", liveRoundSummary("RLD1", 5));

  await wakeDurableObject("RLD1");

  // The DURABLE "table" key now holds the COERCED phase + BUMPED token (the re-persist — the #61 fix).
  const persisted = await readPersisted("RLD1");
  expect(persisted?.phase).toBe("roundResult");
  expect(persisted?.phaseToken).toBe(6);
});

test("AC-2.2.6: a SECOND restart does NOT bump again (monotonicity across repeated restarts)", async () => {
  // Seed a summary that ALREADY reflects a prior coercion: phase roundResult, token 6 (a safe phase).
  await seedSummary("RLD2", { ...liveRoundSummary("RLD2", 6), phase: "roundResult" });

  await wakeDurableObject("RLD2");

  // The durable token is UNCHANGED — re-coercion does not fire on a safe phase, so the bump from the
  // first restart is the only bump. (Were the first-restart re-persist missing, a re-seeded live-round
  // summary would bump every wake — this test pins that a safe phase is stable.)
  const persisted = await readPersisted("RLD2");
  expect(persisted?.phase).toBe("roundResult");
  expect(persisted?.phaseToken).toBe(6);
});

test("AC-2.2.5/AC-2.2.6: a lobby wake is read-only (no coercion, no token bump)", async () => {
  await seedSummary("RLD3", { ...liveRoundSummary("RLD3", 2), phase: "lobby" });

  await wakeDurableObject("RLD3");

  const persisted = await readPersisted("RLD3");
  expect(persisted?.phase).toBe("lobby");
  expect(persisted?.phaseToken).toBe(2); // unchanged — lobby is not a live-round phase.
});
