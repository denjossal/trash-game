// Story 1.11 — Room garbage collection (zero-cost backstop). The "do" / @cloudflare/vitest-pool-workers
// project (real Workers runtime). Exercises the per-DO idle alarm + connection probe + self-delete WITHOUT
// waiting the 3h IDLE_TTL_MS: `runDurableObjectAlarm(stub)` fires the scheduled alarm immediately.
//
// PROBE STRATEGY (build decision): Hibernation is enabled (`static options = { hibernate: true }`), so the
// probe is `ctx.getWebSockets().length`. The exact spike regression (Story 1.1: standard-mode sockets read 0)
// is asserted in "single live connection reads non-zero" below — it proves Hibernation is actually wiring
// ctx.acceptWebSocket(). The real WS-upgrade + hibernation roundtrip can only be fully exercised against
// `wrangler dev` (see server/test/integration/gc-hibernation-probe.mjs); the pool drives the alarm logic.
// [Source: epics.md#Story-1.11; architecture.md#D7; 1-1-spike-findings AC3.]
import { SELF, env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import { ALARM_REARM_DEBOUNCE_MS, IDLE_TTL_MS } from "@trash/shared";
import type { ServerEvent } from "@trash/shared";

// A claimed, idle Table seeded directly into a DO's storage (the 1.7/1.8 seeding pattern). No socket is
// opened, so the GC probe must read zero connections.
async function seedClaimedTable(code: string): Promise<void> {
  const stub = env.Table.get(env.Table.idFromName(code));
  await runInDurableObject(stub, async (_instance, state) => {
    await state.storage.put("table", {
      code,
      phase: "lobby",
      hostId: "host-1",
      startingLives: 3,
      players: [{ id: "host-1", name: "Host", lives: 3, isAlive: true, seatIndex: 0 }],
      phaseToken: 0,
    });
  });
}

/** Open + accept a real WS to /parties/table/<code> (lowercase namespace). Returns the live socket so the
 *  caller can keep it open across an alarm fire (to assert a live room is preserved), then close it. */
async function openSocket(code: string): Promise<WebSocket> {
  const res = await SELF.fetch(`http://example.com/parties/table/${code}`, {
    headers: { Upgrade: "websocket" },
  });
  const ws = res.webSocket;
  if (!ws) throw new Error(`expected a WebSocket upgrade for /parties/table/${code}, got status ${res.status}`);
  ws.accept();
  return ws;
}

/** Send an intent and await the first server event (so the create/join has committed before we probe). */
function firstEvent(ws: WebSocket, intent: object): Promise<ServerEvent> {
  return new Promise<ServerEvent>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for a server event")), 5000);
    // { once: true } so the listeners detach after the first event — otherwise a kept-open socket that
    // sends further intents (the debounce test) would accumulate stale listeners across firstEvent calls.
    ws.addEventListener(
      "message",
      (ev: MessageEvent) => {
        clearTimeout(timer);
        resolve(JSON.parse(ev.data as string) as ServerEvent);
      },
      { once: true },
    );
    ws.addEventListener(
      "error",
      () => {
        clearTimeout(timer);
        reject(new Error("websocket error"));
      },
      { once: true },
    );
    ws.send(JSON.stringify(intent));
  });
}

test("AC-1.11.3/.6: GC alarm with NO active connections self-deletes (clears the table key, releasing the code)", async () => {
  const stub = env.Table.get(env.Table.idFromName("GONE"));
  await seedClaimedTable("GONE");

  // Arm the alarm directly (no socket → no onConnect arm), then fire it. The probe sees zero connections.
  await runInDurableObject(stub, async (_instance, state) => {
    await state.storage.setAlarm(Date.now() + IDLE_TTL_MS);
  });
  const ran = await runDurableObjectAlarm(stub);
  expect(ran).toBe(true); // an alarm was scheduled and fired.

  // The durable "table" key is gone — deleteAll() released it, so the code can be re-claimed.
  const summaryAfter = await runInDurableObject(stub, async (_instance, state) => state.storage.get("table"));
  expect(summaryAfter).toBeUndefined();
});

test("AC-1.11.3/.4: GC alarm with a LIVE connection preserves the room AND re-arms (probe reads non-zero)", async () => {
  const code = "LIVE";
  const ws = await openSocket(code);
  const created = await firstEvent(ws, { type: "createRoom", payload: { name: "Host" } });
  expect(created.type).toBe("tableState"); // the DO is claimed and the socket is live.

  const stub = env.Table.get(env.Table.idFromName(code));

  // AC-1.11.4 — the exact Story-1.1 spike regression: with Hibernation enabled, an open socket is visible
  // to ctx.getWebSockets() (the native-accept proof) AND to partyserver's getConnections() (what onAlarm
  // actually probes). Under the old standard-accept default getWebSockets() read 0 and would delete a live
  // room. Poll: the WS upgrade/registration pipeline is staggered under hibernation (same reason the 1.7
  // concurrency test polls), so a single synchronous read can race ahead of the socket appearing.
  const probeWhileOpen = () =>
    runInDurableObject(stub, async (instance) => {
      const i = instance as unknown as {
        ctx: { getWebSockets(): unknown[] };
        connections(): Iterable<unknown>;
      };
      return { webSockets: i.ctx.getWebSockets().length, connections: [...i.connections()].length };
    });
  let active = await probeWhileOpen();
  for (let tries = 0; tries < 50 && (active.webSockets === 0 || active.connections === 0); tries++) {
    await new Promise((r) => setTimeout(r, 20));
    active = await probeWhileOpen();
  }
  expect(active.webSockets).toBeGreaterThan(0); // hibernation wired native acceptWebSocket().
  expect(active.connections).toBeGreaterThan(0); // the OPEN-filtered count onAlarm uses reads non-zero.

  // Fire the alarm while the socket is OPEN → must NOT delete; must re-arm.
  const ran = await runDurableObjectAlarm(stub);
  expect(ran).toBe(true);

  const { summary, alarm } = await runInDurableObject(stub, async (_instance, state) => ({
    summary: await state.storage.get("table"),
    alarm: await state.storage.getAlarm(),
  }));
  expect(summary).toBeDefined(); // room preserved — a table full of players is never GC'd.
  expect(alarm).not.toBeNull(); // re-armed (the 3h TTL is the backstop for sockets that never cleanly close).

  ws.close();
});

test("AC-1.11.1/.5: the idle alarm is armed on activity (a fresh connection arms it)", async () => {
  const code = "ARMD";
  const ws = await openSocket(code);
  await firstEvent(ws, { type: "createRoom", payload: { name: "Host" } });

  const stub = env.Table.get(env.Table.idFromName(code));
  const alarm = await runInDurableObject(stub, async (_instance, state) => state.storage.getAlarm());
  expect(alarm).not.toBeNull(); // onConnect/activity armed the idle alarm.

  // The armed time is roughly now + IDLE_TTL_MS (within a generous window — no wall-clock dependence on
  // the exact instant; we only assert it is in the future by ~the TTL, not a literal). Uses the config
  // constant, never a hard-coded 3h literal.
  const now = Date.now();
  expect(alarm!).toBeGreaterThan(now);
  expect(alarm!).toBeLessThanOrEqual(now + IDLE_TTL_MS + 60_000);

  ws.close();
});

test("AC-1.11.1/.5: re-arm is debounced — a second activity within the window does not move the alarm", async () => {
  const code = "DBNC";
  const stub = env.Table.get(env.Table.idFromName(code));
  await seedClaimedTable(code);

  // Drive two activities back-to-back (well within ALARM_REARM_DEBOUNCE_MS). The first arms; the second
  // must be a no-op (same scheduled time), proving no per-intent write amplification.
  const ws = await openSocket(code);
  // A connection + a message are two activities inside the debounce window.
  await firstEvent(ws, { type: "joinRoom", payload: { code, name: "Guest" } });
  const firstAlarm = await runInDurableObject(stub, async (_instance, state) => state.storage.getAlarm());
  expect(firstAlarm).not.toBeNull();

  // POSITIVE bracket #1 — firstAlarm is a REAL arm (a future instant ~now+TTL), not a stale/leftover value.
  // Without this, the equality below could pass vacuously if arming never actually wrote a meaningful alarm.
  const armedAt = Date.now();
  expect(firstAlarm!).toBeGreaterThan(armedAt);
  expect(firstAlarm!).toBeLessThanOrEqual(armedAt + IDLE_TTL_MS + 60_000);

  // Another intent immediately (still within the debounce window) must NOT rewrite the alarm.
  ws.send(JSON.stringify({ type: "hostSetLives", payload: { phaseToken: 0, lives: 4 } }));
  await new Promise((r) => setTimeout(r, 50)); // let the message turn run
  const secondAlarm = await runInDurableObject(stub, async (_instance, state) => state.storage.getAlarm());
  expect(secondAlarm).toBe(firstAlarm); // debounced — unchanged to the millisecond within the window.

  // POSITIVE bracket #2 — prove arming can move the alarm at all, so the equality above means "debounced",
  // not "arming is dead". Fire the GC alarm with the socket still OPEN: onAlarm's active branch re-arms to a
  // FRESH now+TTL (and resets its internal debounce marker), so the stored alarm advances past firstAlarm.
  const ran = await runDurableObjectAlarm(stub);
  expect(ran).toBe(true);
  const rearmed = await runInDurableObject(stub, async (_instance, state) => state.storage.getAlarm());
  expect(rearmed).not.toBeNull();
  expect(rearmed!).toBeGreaterThan(firstAlarm!); // arming demonstrably moves the alarm forward.

  // Sanity: the debounce window is the imported config, not a literal (guards against silent drift).
  expect(ALARM_REARM_DEBOUNCE_MS).toBeGreaterThan(0);

  ws.close();
});
