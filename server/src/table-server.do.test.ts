// createRoom round-trip + claim-on-create test (the "do" / @cloudflare/vitest-pool-workers project —
// runs in the real Workers runtime so it can drive a genuine WebSocket upgrade through the Worker
// fetch entry → routePartykitRequest → the TableServer DO). Exercises the actual onConnect/onMessage
// path end-to-end, not an RPC shortcut. [Source: server/vitest.config.ts `do` project; Story 1.6 AC-all.]
//
// CONCURRENCY NOTE: the pool-workers project cannot drive true wall-clock-concurrent WebSockets (see
// vitest.config.ts). The atomic-claim correctness (no two creators both seeing "unclaimed") rests on
// the Durable Object's single-threaded turn — handleCreateRoom does its claim read→decide→write with no
// yield to another inbound message between them. We assert it SEQUENTIALLY: a second createRoom against
// the same code (same idFromName) is rejected. The full multi-device concurrent test is Story 1.7's
// `wrangler dev` integration job. [Source: 1-1-spike-findings AC1 + follow-up; epics.md#Story-1.7.]
import { SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LEN } from "@trash/shared";
import type { ProjectedTableState, ServerEvent } from "@trash/shared";

// Open a WebSocket to /parties/table/<code> (lowercase binding namespace — see index.ts routing note),
// send the given intent, and resolve with the FIRST server event received. Rejects on timeout so a
// hung connection fails loudly rather than hanging the suite.
async function createRoomRoundTrip(
  code: string,
  intent: object,
): Promise<ServerEvent> {
  const res = await SELF.fetch(`http://example.com/parties/table/${code}`, {
    headers: { Upgrade: "websocket" },
  });
  const ws = res.webSocket;
  if (!ws) throw new Error(`expected a WebSocket upgrade for /parties/table/${code}, got status ${res.status}`);
  ws.accept();

  return await new Promise<ServerEvent>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for a server event")), 5000);
    ws.addEventListener("message", (ev: MessageEvent) => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(ev.data as string) as ServerEvent);
      } catch (err) {
        reject(err as Error);
      } finally {
        ws.close();
      }
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("websocket error"));
    });
    ws.send(JSON.stringify(intent));
  });
}

test("AC-1.6.1/1.6.3: createRoom creates a lobby Table — host is first player, code returned", async () => {
  const event = await createRoomRoundTrip("WXYZ", { type: "createRoom", payload: { name: "Marisol" } });

  expect(event.type).toBe("tableState");
  const s = (event as Extract<ServerEvent, { type: "tableState" }>).payload;

  // Phase + structural lobby shape (AC-1.6.3).
  expect(s.phase).toBe("lobby");
  expect(s.phaseToken).toBe(0);
  expect(s.startingLives).toBe(3); // DEFAULT_LIVES
  expect(s.revealed).toBe(false);
  // round-derived fields are omitted while round === null (createRoom's case).
  expect(s.currentTurnId).toBeUndefined();
  expect(s.turnToken).toBeUndefined();

  // The code is the DO name we addressed, and is 4 chars from the ambiguity-safe alphabet (AC-1.6.1).
  expect(s.code).toBe("WXYZ");
  expect(s.code.length).toBe(ROOM_CODE_LEN);
  for (const ch of s.code) expect(ROOM_CODE_ALPHABET).toContain(ch);

  // Host is the first (and only) player at seat 0, alive, connected (AC-1.6.1).
  expect(s.players).toHaveLength(1);
  const p = s.players[0];
  expect(p.name).toBe("Marisol");
  expect(p.seatIndex).toBe(0);
  expect(p.isAlive).toBe(true);
  expect(p.isConnected).toBe(true);
  expect(p.lives).toBe(3);

  // hostId === the creator's playerId === you.playerId, and you.isHost is true (AC-1.6.1).
  expect(s.hostId).toBe(s.you.playerId);
  expect(s.you.playerId).toBe(p.id);
  expect(s.you.isHost).toBe(true);
});

test("AC-1.6.2: re-creating against an ALREADY-CLAIMED code is rejected (client would regenerate)", async () => {
  // First create claims the code.
  const first = await createRoomRoundTrip("CLMD", { type: "createRoom", payload: { name: "Beto" } });
  expect(first.type).toBe("tableState");

  // Second create against the SAME code (same idFromName) hits the persisted claim → error, so the
  // client picks a fresh candidate. (The spike's CLAIMED_NOW → ALREADY_CLAIMED, now in production code.)
  const second = await createRoomRoundTrip("CLMD", { type: "createRoom", payload: { name: "Imposter" } });
  expect(second.type).toBe("error");

  // A DIFFERENT code claims cleanly.
  const other = await createRoomRoundTrip("FRSH", { type: "createRoom", payload: { name: "Carmen" } });
  expect(other.type).toBe("tableState");
  expect((other as Extract<ServerEvent, { type: "tableState" }>).payload.code).toBe("FRSH");
});

test("SM-6: the tableState payload carries NO sessionToken (the token is client-private)", async () => {
  const event = await createRoomRoundTrip("PRIV", { type: "createRoom", payload: { name: "Nadia" } });
  expect(event.type).toBe("tableState");

  // The session token is the PRIVATE reconnect proof — it must never ride a projection. Assert it
  // appears nowhere in the serialized payload (belt-and-suspenders alongside the standing SM-6 gate in
  // project-state.test.ts, which covers card privacy). [Source: 1-5 story; project-state.ts.]
  const s = (event as Extract<ServerEvent, { type: "tableState" }>).payload;
  const serialized = JSON.stringify(s);
  expect(serialized.toLowerCase()).not.toContain("sessiontoken");
  // The projection shape carries no token field anywhere on `you` or `players`.
  expect((s.you as Record<string, unknown>).sessionToken).toBeUndefined();
  // Light structural assertion that nothing snuck a token onto a player entry.
  for (const player of s.players) {
    expect((player as Record<string, unknown>).sessionToken).toBeUndefined();
  }
  // Silence unused-type lint if ProjectedTableState import is otherwise unreferenced.
  const _typecheck: ProjectedTableState = s;
  void _typecheck;
});
