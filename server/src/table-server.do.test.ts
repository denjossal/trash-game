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
import { SELF, env, runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import { MAX_LIVES, MAX_PLAYERS, MIN_LIVES, ROOM_CODE_ALPHABET, ROOM_CODE_LEN } from "@trash/shared";
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

// --- Story 1.7: join round-trip + fan-out + bad-code + late-join + room-full + concurrency ---
//
// CONCURRENCY NOTE (carried from 1.6): the pool-workers project cannot drive TRUE wall-clock-concurrent
// WebSockets — multiple SELF.fetch upgrades to the same /parties/table/<code> route to the SAME DO and
// its messages are serialized by the DO input gate (exactly the property AC-1.7.5 rests on). The
// ~6-device live activation gate (AC-1.7.4 / SM-4) needs real concurrent sockets and lives in
// server/test/integration against `wrangler dev`. Here we assert the single-turn correctness:
// concurrent-fired joins (queued behind the gate) yield no duplicate seatIndex and no seat-cap overflow.
//
// The createRoom helper above closes its socket after the first event. Join needs sockets that STAY OPEN
// to observe the fan-out (the host receiving an updated roster when a joiner arrives), so the helpers
// below open a connection, expose send + an event-queue reader, and let the caller close when done.

type ServerEventMessage = ServerEvent;

/** An open, accepted WebSocket to /parties/table/<code> with a small event reader. Stays open until
 *  close() — so a host socket can observe the fan-out triggered by a later joiner. */
type OpenConn = {
  send(intent: object): void;
  /** Resolve with the next server event AFTER this call (events that arrived earlier are buffered). */
  next(timeoutMs?: number): Promise<ServerEventMessage>;
  close(): void;
};

async function openConn(code: string): Promise<OpenConn> {
  const res = await SELF.fetch(`http://example.com/parties/table/${code}`, {
    headers: { Upgrade: "websocket" },
  });
  const ws = res.webSocket;
  if (!ws) throw new Error(`expected a WebSocket upgrade for /parties/table/${code}, got status ${res.status}`);
  ws.accept();

  const buffer: ServerEventMessage[] = [];
  let waiter: ((ev: ServerEventMessage) => void) | null = null;
  ws.addEventListener("message", (ev: MessageEvent) => {
    const parsed = JSON.parse(ev.data as string) as ServerEventMessage;
    if (waiter) {
      const w = waiter;
      waiter = null;
      w(parsed);
    } else {
      buffer.push(parsed);
    }
  });

  return {
    send: (intent: object) => ws.send(JSON.stringify(intent)),
    next: (timeoutMs = 5000) =>
      new Promise<ServerEventMessage>((resolve, reject) => {
        const buffered = buffer.shift();
        if (buffered) {
          resolve(buffered);
          return;
        }
        const timer = setTimeout(() => reject(new Error("timed out waiting for a server event")), timeoutMs);
        waiter = (ev) => {
          clearTimeout(timer);
          resolve(ev);
        };
      }),
    close: () => ws.close(),
  };
}

function asTableState(ev: ServerEventMessage): ProjectedTableState {
  expect(ev.type).toBe("tableState");
  return (ev as Extract<ServerEvent, { type: "tableState" }>).payload;
}

test("AC-1.7.1: joinRoom adds the Player and re-projects to EVERY connection (host + joiner)", async () => {
  // Host creates + stays open so it can observe the fan-out when a joiner arrives.
  const host = await openConn("JOIN");
  host.send({ type: "createRoom", payload: { name: "Marisol" } });
  const created = asTableState(await host.next());
  expect(created.players).toHaveLength(1);
  expect(created.you.isHost).toBe(true);

  // A second device joins the same code (same DO).
  const guest = await openConn("JOIN");
  guest.send({ type: "joinRoom", payload: { code: "JOIN", name: "Beto" } });

  // The joiner receives the updated roster as ITS OWN projection (you = Beto, seat 1, not host).
  const guestView = asTableState(await guest.next());
  expect(guestView.players).toHaveLength(2);
  const beto = guestView.players.find((p) => p.name === "Beto");
  expect(beto).toBeDefined();
  expect(beto!.seatIndex).toBe(1);
  expect(beto!.isAlive).toBe(true);
  expect(beto!.isConnected).toBe(true);
  expect(beto!.lives).toBe(created.startingLives);
  expect(guestView.you.playerId).toBe(beto!.id);
  expect(guestView.you.isHost).toBe(false);

  // The HOST also receives a fresh projection (the fan-out) — roster now 2, still host on its own view.
  const hostView = asTableState(await host.next());
  expect(hostView.players).toHaveLength(2);
  expect(hostView.you.isHost).toBe(true);
  expect(hostView.you.playerId).toBe(created.you.playerId);

  host.close();
  guest.close();
});

test("AC-1.7.2: joining a never-claimed (bad/expired) code returns error bad-code, no ghost join", async () => {
  // Connect to a code that was NEVER created → a fresh, unclaimed DO (table === null, no summary).
  const conn = await openConn("NOPE");
  conn.send({ type: "joinRoom", payload: { code: "NOPE", name: "Lost" } });

  const ev = await conn.next();
  expect(ev.type).toBe("error");
  expect((ev as Extract<ServerEvent, { type: "error" }>).payload.reason).toBe("bad-code");
  conn.close();
});

test("AC-1.7.3: joining a Table past the first Deal (phase !== lobby) is refused with phase-illegal", async () => {
  // The `deal` handler is Epic 2, so we SEED a non-lobby durable summary directly into the DO's storage,
  // then connect + join. onStart hydrates it; D2.1 coerces a live-round phase (`turns`) to `roundResult`
  // on wake — still !== "lobby", so the late-join refusal holds either way. [Source: persistence.ts D2.1.]
  const stub = env.Table.get(env.Table.idFromName("LATE"));
  await runInDurableObject(stub, async (_instance, state) => {
    await state.storage.put("table", {
      code: "LATE",
      phase: "turns",
      hostId: "host-1",
      startingLives: 3,
      players: [{ id: "host-1", name: "Host", lives: 3, isAlive: true, seatIndex: 0 }],
      phaseToken: 2,
    });
  });

  const conn = await openConn("LATE");
  conn.send({ type: "joinRoom", payload: { code: "LATE", name: "TooLate" } });
  const ev = await conn.next();
  expect(ev.type).toBe("error");
  expect((ev as Extract<ServerEvent, { type: "error" }>).payload.reason).toBe("phase-illegal");
  conn.close();
});

test("AC-1.7.5: joining at the seat cap returns error room-full", async () => {
  // Create a Table, then fill it to MAX_PLAYERS (1 host + MAX-1 joiners), then one more join → room-full.
  const host = await openConn("FULL");
  host.send({ type: "createRoom", payload: { name: "Host" } });
  await host.next(); // created (roster 1)

  for (let i = 1; i < MAX_PLAYERS; i++) {
    const g = await openConn("FULL");
    g.send({ type: "joinRoom", payload: { code: "FULL", name: `P${i}` } });
    await g.next(); // its own join projection (roster i+1)
    // leave the socket open — closing it would flip isConnected but the seat is retained (still counts).
  }

  const overflow = await openConn("FULL");
  overflow.send({ type: "joinRoom", payload: { code: "FULL", name: "TooMany" } });
  const ev = await overflow.next();
  expect(ev.type).toBe("error");
  expect((ev as Extract<ServerEvent, { type: "error" }>).payload.reason).toBe("room-full");
  overflow.close();
  host.close();
});

test("re-seat guard: a second joinRoom on the SAME socket is refused (no double-seat, no orphaned presence)", async () => {
  // Code review 2026-06-19: handleJoinRoom is symmetric with handleCreateRoom's re-claim guard — a socket
  // that already owns a seat cannot re-join (it would mint a second playerId, push a duplicate Player, and
  // the re-stamp would orphan the first seat's presence forever). Drive both re-join shapes on one socket.
  const host = await openConn("RSEAT");
  host.send({ type: "createRoom", payload: { name: "Host" } });
  const created = asTableState(await host.next()); // roster 1

  // (a) createRoom-then-joinRoom on the SAME socket → refused; roster unchanged.
  host.send({ type: "joinRoom", payload: { code: "RSEAT", name: "HostAgain" } });
  const hostRejoin = await host.next();
  expect(hostRejoin.type).toBe("error");
  expect((hostRejoin as Extract<ServerEvent, { type: "error" }>).payload.reason).toBe("phase-illegal");

  // (b) a legitimate guest joins, then re-sends joinRoom on its own socket → refused.
  const guest = await openConn("RSEAT");
  guest.send({ type: "joinRoom", payload: { code: "RSEAT", name: "Guest" } });
  asTableState(await guest.next()); // its own join projection (roster 2)
  await host.next(); // host's fan-out for the guest join — drain it
  guest.send({ type: "joinRoom", payload: { code: "RSEAT", name: "GuestAgain" } });
  const guestRejoin = await guest.next();
  expect(guestRejoin.type).toBe("error");
  expect((guestRejoin as Extract<ServerEvent, { type: "error" }>).payload.reason).toBe("phase-illegal");

  // The roster is still exactly host + guest — no duplicate seat was created by either re-join attempt.
  const stub = env.Table.get(env.Table.idFromName("RSEAT"));
  const players = await runInDurableObject(stub, async (_instance, state) => {
    const summary = await state.storage.get<{ players: { id: string }[] }>("table");
    return summary?.players ?? [];
  });
  expect(players).toHaveLength(2);
  expect(new Set(players.map((p) => p.id)).size).toBe(2); // host + guest, no phantom third
  expect(created.you.playerId).toBe(players[0].id); // host's original seat intact (not orphaned/replaced)

  host.close();
  guest.close();
});

test("AC-1.7.5: concurrently-fired joins stay correct (no duplicate seatIndex, no overflow)", async () => {
  const host = await openConn("RACE");
  host.send({ type: "createRoom", payload: { name: "Host" } });
  const created = asTableState(await host.next());
  expect(created.code).toBe("RACE");

  // Open N sockets and fire joinRoom on all of them WITHOUT awaiting between sends. The DO input gate
  // serializes the onMessage turns, so each join sees the previously-appended roster (the append is the
  // commit point, with no yield between the cap-check and the push). Asserts the single-turn property
  // AC-1.7.5 rests on; true wall-clock concurrency is AC-1.7.4's wrangler-dev job.
  const N = 5;
  const guests = await Promise.all(Array.from({ length: N }, () => openConn("RACE")));
  guests.forEach((g, i) => g.send({ type: "joinRoom", payload: { code: "RACE", name: `G${i}` } }));

  // Wait until every join has COMMITTED to the authoritative roster before asserting. We poll the DO's
  // persisted roster up to 1+N rather than draining "one event per guest": a guest's first received event
  // may be an interleaved fan-out from an EARLIER join (not its own), and under WebSocket Hibernation the
  // upgrade/delivery pipeline is staggered enough that one-event-per-guest no longer coincides with
  // all-joins-committed. Polling the durable source of truth removes that delivery-timing coupling while
  // keeping the invariant under test unchanged. [Story 1.11: hibernation accept staggers WS delivery.]
  const stub = env.Table.get(env.Table.idFromName("RACE"));
  const readSeats = () =>
    runInDurableObject(stub, async (_instance, state) => {
      const summary = await state.storage.get<{ players: { seatIndex: number }[] }>("table");
      return (summary?.players ?? []).map((p) => p.seatIndex).sort((a, b) => a - b);
    });
  let seats = await readSeats();
  for (let tries = 0; tries < 50 && seats.length < 1 + N; tries++) {
    await new Promise((r) => setTimeout(r, 20));
    seats = await readSeats();
  }

  expect(seats.length).toBe(1 + N);
  expect(seats.length).toBeLessThanOrEqual(MAX_PLAYERS);
  expect(seats).toEqual(Array.from({ length: 1 + N }, (_, i) => i)); // contiguous, no gap
  expect(new Set(seats).size).toBe(seats.length); // no duplicate seatIndex

  host.close();
  guests.forEach((g) => g.close());
});

test("AC-1.7.3: a leaver flips isConnected:false on every remaining device (presence fan-out)", async () => {
  const host = await openConn("LEAV");
  host.send({ type: "createRoom", payload: { name: "Host" } });
  await host.next(); // created

  const guest = await openConn("LEAV");
  guest.send({ type: "joinRoom", payload: { code: "LEAV", name: "Leaver" } });
  await guest.next(); // guest's join projection
  const afterJoin = asTableState(await host.next()); // host's fan-out: roster 2, both connected
  const leaver = afterJoin.players.find((p) => p.name === "Leaver")!;
  expect(leaver.isConnected).toBe(true);

  // The guest leaves — onClose flips its isConnected:false and fans out to the remaining host socket.
  guest.close();
  const afterLeave = asTableState(await host.next());
  const goneNow = afterLeave.players.find((p) => p.name === "Leaver")!;
  expect(goneNow.isConnected).toBe(false); // presence flipped — they stop taking Turns.
  expect(goneNow.isAlive).toBe(true); // RECORD retained — a disconnected-but-alive player still owes a Turn.
  expect(afterLeave.players).toHaveLength(2); // seat NOT removed.

  host.close();
});

test("AC-1.7.1 SM-6: join projections carry NO sessionToken", async () => {
  const host = await openConn("TOKN");
  host.send({ type: "createRoom", payload: { name: "Host" } });
  await host.next();

  const guest = await openConn("TOKN");
  guest.send({ type: "joinRoom", payload: { code: "TOKN", name: "Guest", sessionToken: "should-not-echo" } });
  const guestView = await guest.next();

  // The sessionToken (even one echoed by the client) must never ride a projection. The token is
  // accepted-but-not-resumed in MVP (no reconnection FLOW) and stays server/client-private.
  const serialized = JSON.stringify(asTableState(guestView));
  expect(serialized.toLowerCase()).not.toContain("sessiontoken");
  expect(serialized).not.toContain("should-not-echo");

  host.close();
  guest.close();
});

// --- Story 1.8: hostSetLives — set starting Lives + fan-out + clamp + not-host + phase-illegal + shape ---
//
// The set-lives round-trip is a single Host action (not the multi-device activation gate), so it reuses
// the same in-DO WS harness: create on a host socket (stays open), join a guest, then drive hostSetLives.
// All cases run against the SAME DO (same idFromName), serialized by the input gate. [Source: Story 1.8 AC-all.]

test("AC-1.8.1: hostSetLives sets startingLives + every player's lives, fanned out to host AND guest", async () => {
  const host = await openConn("LIVS");
  host.send({ type: "createRoom", payload: { name: "Marisol" } });
  const created = asTableState(await host.next());
  expect(created.startingLives).toBe(3); // DEFAULT_LIVES before any set.

  const guest = await openConn("LIVS");
  guest.send({ type: "joinRoom", payload: { code: "LIVS", name: "Beto" } });
  asTableState(await guest.next()); // guest's join projection
  asTableState(await host.next()); // host's join fan-out — drain

  // The Host sets Lives to 5. Both devices receive a fresh tableState (the fan-out re-projection).
  host.send({ type: "hostSetLives", payload: { phaseToken: 0, lives: 5 } });

  const hostView = asTableState(await host.next());
  expect(hostView.startingLives).toBe(5);
  for (const p of hostView.players) expect(p.lives).toBe(5); // every seat synced (host + guest)
  expect(hostView.phaseToken).toBe(0); // set-lives does NOT bump phaseToken (not a phase transition)

  const guestView = asTableState(await guest.next());
  expect(guestView.startingLives).toBe(5);
  for (const p of guestView.players) expect(p.lives).toBe(5);

  host.close();
  guest.close();
});

test("AC-1.8.1: out-of-range lives CLAMP to MIN_LIVES..MAX_LIVES (never an error)", async () => {
  const host = await openConn("CLMP");
  host.send({ type: "createRoom", payload: { name: "Host" } });
  await host.next(); // created

  // Above MAX clamps to MAX_LIVES (5).
  host.send({ type: "hostSetLives", payload: { phaseToken: 0, lives: 9 } });
  const high = asTableState(await host.next());
  expect(high.startingLives).toBe(MAX_LIVES);

  // Below MIN clamps to MIN_LIVES (1) — both 0 and a negative value.
  host.send({ type: "hostSetLives", payload: { phaseToken: 0, lives: 0 } });
  const low = asTableState(await host.next());
  expect(low.startingLives).toBe(MIN_LIVES);

  host.send({ type: "hostSetLives", payload: { phaseToken: 0, lives: -3 } });
  const neg = asTableState(await host.next());
  expect(neg.startingLives).toBe(MIN_LIVES);

  host.close();
});

test("AC-1.8.2: a non-Host hostSetLives is refused with not-host; authoritative value unchanged, no fan-out", async () => {
  const host = await openConn("NHST");
  host.send({ type: "createRoom", payload: { name: "Host" } });
  await host.next(); // created (startingLives 3)

  const guest = await openConn("NHST");
  guest.send({ type: "joinRoom", payload: { code: "NHST", name: "Guest" } });
  asTableState(await guest.next()); // guest join projection
  asTableState(await host.next()); // host join fan-out — drain

  // The guest (non-Host) attempts to set Lives → refused to THAT connection only.
  guest.send({ type: "hostSetLives", payload: { phaseToken: 0, lives: 2 } });
  const refusal = await guest.next();
  expect(refusal.type).toBe("error");
  expect((refusal as Extract<ServerEvent, { type: "error" }>).payload.reason).toBe("not-host");

  // The authoritative persisted summary is UNCHANGED (still startingLives 3, lives 3) — no mutation, no
  // fan-out (the host saw no new tableState; its next event, after a real set, would be the only push).
  const stub = env.Table.get(env.Table.idFromName("NHST"));
  const summary = await runInDurableObject(stub, async (_instance, state) =>
    state.storage.get<{ startingLives: number; players: { lives: number }[] }>("table"),
  );
  expect(summary?.startingLives).toBe(3);
  for (const p of summary?.players ?? []) expect(p.lives).toBe(3);

  host.close();
  guest.close();
});

test("AC-1.8.3: hostSetLives outside lobby is refused with phase-illegal", async () => {
  // Seed a non-lobby summary (mirror the 1.7 late-join seed). D2.1 coerces the live `turns` phase to
  // `roundResult` on wake — still !== "lobby", so the lobby-only set-lives refusal holds.
  const stub = env.Table.get(env.Table.idFromName("PHIL"));
  await runInDurableObject(stub, async (_instance, state) => {
    await state.storage.put("table", {
      code: "PHIL",
      phase: "turns",
      hostId: "host-1",
      startingLives: 3,
      players: [{ id: "host-1", name: "Host", lives: 3, isAlive: true, seatIndex: 0 }],
      phaseToken: 2,
    });
  });

  // Connect + create to identify this socket as the host of THIS DO... but the DO is already claimed
  // (seeded summary) so createRoom is rejected. Instead we just send hostSetLives on a fresh socket:
  // the seeded phase is non-lobby, so phase-illegal fires before the host check regardless of identity.
  const conn = await openConn("PHIL");
  conn.send({ type: "hostSetLives", payload: { phaseToken: 2, lives: 4 } });
  const ev = await conn.next();
  expect(ev.type).toBe("error");
  expect((ev as Extract<ServerEvent, { type: "error" }>).payload.reason).toBe("phase-illegal");
  conn.close();
});

test("AC-1.8.4: a malformed hostSetLives (missing / non-number lives) is a clean typed error, no hang", async () => {
  const host = await openConn("SHAP");
  host.send({ type: "createRoom", payload: { name: "Host" } });
  await host.next(); // created

  // Missing `lives` entirely.
  host.send({ type: "hostSetLives", payload: { phaseToken: 0 } });
  const missing = await host.next();
  expect(missing.type).toBe("error");

  // Non-numeric `lives` (a string).
  host.send({ type: "hostSetLives", payload: { phaseToken: 0, lives: "5" } });
  const nonNumber = await host.next();
  expect(nonNumber.type).toBe("error");

  // The state is unchanged after the malformed sends — a follow-up valid set still works (no hang).
  host.send({ type: "hostSetLives", payload: { phaseToken: 0, lives: 4 } });
  const ok = asTableState(await host.next());
  expect(ok.startingLives).toBe(4);

  host.close();
});

test("AC-1.8.5 SM-6: the hostSetLives fan-out carries NO sessionToken; startingLives is public", async () => {
  const host = await openConn("SM6L");
  host.send({ type: "createRoom", payload: { name: "Host" } });
  await host.next(); // created

  host.send({ type: "hostSetLives", payload: { phaseToken: 0, lives: 2 } });
  const view = asTableState(await host.next());

  const serialized = JSON.stringify(view);
  expect(serialized.toLowerCase()).not.toContain("sessiontoken");
  expect(view.startingLives).toBe(2); // the public field is present and visible.

  host.close();
});
