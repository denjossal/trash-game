// table-server-host-controls.do.test.ts — the END-TO-END FR-14 Host mid-session controls wire path
// (Story 4.2). Runs in the `do` / @cloudflare/vitest-pool-workers project (real Workers runtime + real
// ctx.storage + a genuine WebSocket upgrade). Drives the actual onConnect/onMessage → dispatch →
// handleHostSetLives / handleHostRemovePlayer / handleHostReassign → fanOut path. Clones the
// table-server-new-game.do.test.ts harness (openConn / nextPhase / nextTurn / nextErrorReason / lobbyOf /
// deal / everyoneKeeps).
//
// What this pins (AC-4.2.1..7):
//   hostSetLives mid-session ("set ongoing, never revive", M1):
//     - at roundResult, a Host Lives change sets startingLives + every ALIVE seat's lives to the new value;
//       an eliminated (isAlive:false, lives:0) seat is UNCHANGED — NEVER revived.
//     - a non-Host change → not-host; a stale phaseToken → stale-phase; the lobby path still works (1.8).
//   hostRemovePlayer:
//     - happy: the seat leaves the roster, excluded from the next deal.
//     - mid-Round removal of the CURRENT-turn Player at `turns` advances currentTurnId to the next alive
//       seat AND adds the removed id to round.acted; removing a NON-current Player leaves the turn unchanged.
//     - non-host → not-host; stale → stale-phase; self-remove (target===hostId) → phase-illegal; bad id →
//       phase-illegal.
//     - seatIndex collision: after a removal, a fresh joinRoom gets a seatIndex no live seat holds.
//   hostReassign:
//     - happy: hostId moves to the target; the new host's you.isHost projects true, the old host's false.
//     - non-host → not-host; stale → stale-phase; reassign-to-self → phase-illegal; an ELIMINATED target
//       is allowed (an eliminated host keeps conducting).
// [Source: epics.md#Story 4.2; architecture.md 316-344; new-game harness.]
import { SELF, env, runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import type { ProjectedTableState, ServerEvent } from "@trash/shared";
import type { TableServer } from "./table-server.js";

type ServerEventMessage = ServerEvent;

type OpenConn = {
  send(intent: object): void;
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

async function nextPhase(conn: OpenConn, phase: ProjectedTableState["phase"], tries = 16): Promise<ProjectedTableState> {
  for (let i = 0; i < tries; i++) {
    const ev = await conn.next();
    if (ev.type !== "tableState") continue;
    const view = (ev as Extract<ServerEvent, { type: "tableState" }>).payload;
    if (view.phase === phase) return view;
  }
  throw new Error(`never saw a tableState with phase ${phase} after ${tries} events`);
}

async function nextTurn(conn: OpenConn, currentTurnId: string, tries = 16): Promise<ProjectedTableState> {
  for (let i = 0; i < tries; i++) {
    const ev = await conn.next();
    if (ev.type !== "tableState") continue;
    const view = (ev as Extract<ServerEvent, { type: "tableState" }>).payload;
    if (view.currentTurnId === currentTurnId) return view;
  }
  throw new Error(`never saw a tableState with currentTurnId ${currentTurnId} after ${tries} events`);
}

/** Read tableState events until one reports the wanted roster size (skip staggered fan-outs). */
async function nextRosterSize(conn: OpenConn, size: number, tries = 16): Promise<ProjectedTableState> {
  for (let i = 0; i < tries; i++) {
    const ev = await conn.next();
    if (ev.type !== "tableState") continue;
    const view = (ev as Extract<ServerEvent, { type: "tableState" }>).payload;
    if (view.players.length === size) return view;
  }
  throw new Error(`never saw a tableState with ${size} players after ${tries} events`);
}

/** Read tableState events until you.isHost matches the wanted value on this connection's projection. */
async function nextIsHost(conn: OpenConn, isHost: boolean, tries = 16): Promise<ProjectedTableState> {
  for (let i = 0; i < tries; i++) {
    const ev = await conn.next();
    if (ev.type !== "tableState") continue;
    const view = (ev as Extract<ServerEvent, { type: "tableState" }>).payload;
    if (view.you.isHost === isHost) return view;
  }
  throw new Error(`never saw a tableState with you.isHost=${isHost} after ${tries} events`);
}

async function nextErrorReason(conn: OpenConn, tries = 12): Promise<string> {
  for (let i = 0; i < tries; i++) {
    const ev = await conn.next();
    if (ev.type === "error") return (ev as Extract<ServerEvent, { type: "error" }>).payload.reason;
  }
  throw new Error(`never saw an error event after ${tries} events`);
}

async function lobbyOf(
  code: string,
  total: number,
): Promise<{ host: OpenConn; created: ProjectedTableState; guests: OpenConn[] }> {
  const host = await openConn(code);
  host.send({ type: "createRoom", payload: { name: "Host" } });
  const created = asTableState(await host.next());

  const guests: OpenConn[] = [];
  for (let i = 1; i < total; i++) {
    const g = await openConn(code);
    g.send({ type: "joinRoom", payload: { code, name: `P${i}` } });
    guests.push(g);
  }
  const stub = env.Table.get(env.Table.idFromName(code));
  const readCount = () =>
    runInDurableObject(stub, async (_instance, state) => {
      const summary = await state.storage.get<{ players: unknown[] }>("table");
      return summary?.players?.length ?? 0;
    });
  let count = await readCount();
  for (let tries = 0; tries < 50 && count < total; tries++) {
    await new Promise((r) => setTimeout(r, 20));
    count = await readCount();
  }
  expect(count).toBe(total);
  return { host, created, guests };
}

async function deal(
  host: OpenConn,
  created: ProjectedTableState,
  guests: OpenConn[],
): Promise<{ hostDealt: ProjectedTableState; guestDealt: ProjectedTableState[] }> {
  host.send({ type: "deal", payload: { phaseToken: created.phaseToken } });
  const hostDealt = await nextPhase(host, "turns");
  const guestDealt: ProjectedTableState[] = [];
  for (const g of guests) guestDealt.push(await nextPhase(g, "turns"));
  return { hostDealt, guestDealt };
}

function nextActorAfter(view: ProjectedTableState, byId: Map<string, OpenConn>): string {
  const seats = view.players
    .filter((p) => byId.has(p.id))
    .slice()
    .sort((a, b) => a.seatIndex - b.seatIndex);
  const pos = seats.findIndex((p) => p.id === view.currentTurnId);
  return seats[(pos + 1) % seats.length].id;
}

async function everyoneKeeps(
  host: OpenConn,
  hostId: string,
  others: { conn: OpenConn; id: string }[],
  firstTurn: ProjectedTableState,
): Promise<ProjectedTableState> {
  const byId = new Map<string, OpenConn>([[hostId, host], ...others.map((o) => [o.id, o.conn] as const)]);
  let view = firstTurn;
  const seatCount = byId.size;
  for (let i = 0; i < seatCount; i++) {
    const actorId = view.currentTurnId!;
    const conn = byId.get(actorId)!;
    conn.send({ type: "keep", payload: { turnToken: view.turnToken } });
    if (i < seatCount - 1) {
      view = await nextTurn(host, nextActorAfter(view, byId), 20);
    }
  }
  return nextPhase(host, "allActed");
}

/**
 * Drive a heads-up table to `roundResult` (≥2 alive) with the host as the loser-but-survivor and the guest
 * eliminated would be a win, so instead seed THREE seats: host (high), p1 (low loser), p2 (mid) at 3 lives,
 * so the loser drops to 2 and the round continues → roundResult. Returns the roundResult projection + ids.
 */
async function driveToRoundResult(
  code: string,
): Promise<{ host: OpenConn; guests: OpenConn[]; result: ProjectedTableState; hostId: string; p1Id: string; p2Id: string }> {
  const { host, created, guests } = await lobbyOf(code, 3);
  const { hostDealt, guestDealt } = await deal(host, created, guests);
  const p1 = guests[0];
  const p2 = guests[1];
  const hostId = hostDealt.you.playerId;
  const p1Id = guestDealt[0].you.playerId;
  const p2Id = guestDealt[1].you.playerId;

  const allActed = await everyoneKeeps(
    host,
    hostId,
    [
      { conn: p1, id: p1Id },
      { conn: p2, id: p2Id },
    ],
    hostDealt,
  );

  const stub = env.Table.get(env.Table.idFromName(code));
  await runInDurableObject(stub, async (instance) => {
    const table = (instance as unknown as TableServer).table!;
    table.round!.hands[hostId] = { rank: 13, suit: "♠" }; // high
    table.round!.hands[p1Id] = { rank: 2, suit: "♥" }; // lowest → loses one life (3→2), still alive
    table.round!.hands[p2Id] = { rank: 9, suit: "♦" }; // mid
  });

  host.send({ type: "revealAll", payload: { phaseToken: allActed.phaseToken } });
  const result = await nextPhase(host, "roundResult");
  return { host, guests, result, hostId, p1Id, p2Id };
}

// --- hostSetLives mid-session (M1 "set ongoing, never revive") ---

test("AC-4.2.1 (M1): a mid-session hostSetLives sets startingLives + every ALIVE seat's lives; an eliminated seat is NEVER revived", async () => {
  const { host, guests, result, hostId, p1Id, p2Id } = await driveToRoundResult("HSL1");
  // Force p2 eliminated on the durable state so we can prove the never-revive rule.
  const stub = env.Table.get(env.Table.idFromName("HSL1"));
  await runInDurableObject(stub, async (instance) => {
    const table = (instance as unknown as TableServer).table!;
    const p2 = table.players.find((p) => p.id === p2Id)!;
    p2.lives = 0;
    p2.isAlive = false;
  });

  // Host raises Lives to 5 mid-session (at roundResult).
  host.send({ type: "hostSetLives", payload: { phaseToken: result.phaseToken, lives: 5 } });
  const after = await nextRosterSize(host, 3);
  // Wait until the change has landed (startingLives reflects it).
  let view = after;
  for (let i = 0; i < 16 && view.startingLives !== 5; i++) view = await nextPhase(host, "roundResult");

  expect(view.startingLives).toBe(5);
  // Alive seats are topped up to 5.
  expect(view.players.find((p) => p.id === hostId)!.lives).toBe(5);
  expect(view.players.find((p) => p.id === p1Id)!.lives).toBe(5);
  // The eliminated seat is UNTOUCHED — never revived.
  const p2 = view.players.find((p) => p.id === p2Id)!;
  expect(p2.lives).toBe(0);
  expect(p2.isAlive).toBe(false);

  host.close();
  for (const g of guests) g.close();
});

test("AC-4.2.1 (server-authority): a NON-Host mid-session hostSetLives is refused not-host", async () => {
  const { host, guests, result } = await driveToRoundResult("HSLH");
  const p1 = guests[0];
  p1.send({ type: "hostSetLives", payload: { phaseToken: result.phaseToken, lives: 5 } });
  expect(await nextErrorReason(p1)).toBe("not-host");
  host.close();
  for (const g of guests) g.close();
});

test("AC-4.2.2 (stale): a mid-session hostSetLives carrying a stale phaseToken → stale-phase", async () => {
  const { host, guests, result } = await driveToRoundResult("HSLS");
  // Re-deal bumps the token, making `result.phaseToken` stale.
  host.send({ type: "dealAgain", payload: { phaseToken: result.phaseToken } });
  await nextPhase(host, "turns");
  // Now a hostSetLives with the OLD token mismatches.
  host.send({ type: "hostSetLives", payload: { phaseToken: result.phaseToken, lives: 4 } });
  expect(await nextErrorReason(host)).toBe("stale-phase");
  host.close();
  for (const g of guests) g.close();
});

test("AC-4.2.2 (lobby regression): hostSetLives still works in lobby (Story 1.8 path)", async () => {
  const { host, created, guests } = await lobbyOf("HSLLOB", 2);
  expect(created.phase).toBe("lobby");
  host.send({ type: "hostSetLives", payload: { phaseToken: created.phaseToken, lives: 5 } });
  let view = await nextPhase(host, "lobby");
  for (let i = 0; i < 16 && view.startingLives !== 5; i++) view = await nextPhase(host, "lobby");
  expect(view.startingLives).toBe(5);
  for (const p of view.players) expect(p.lives).toBe(5);
  host.close();
  for (const g of guests) g.close();
});

// --- hostRemovePlayer ---

test("AC-4.2.3 (happy): a Host removes a Player at roundResult → the seat leaves the roster", async () => {
  const { host, guests, result, p2Id } = await driveToRoundResult("RM1");
  host.send({ type: "hostRemovePlayer", payload: { phaseToken: result.phaseToken, playerId: p2Id } });
  const after = await nextRosterSize(host, 2);
  expect(after.players.some((p) => p.id === p2Id)).toBe(false);
  expect(after.phaseToken).toBeGreaterThan(result.phaseToken);
  host.close();
  for (const g of guests) g.close();
});

test("AC-4.2.4 (mid-Round, current turn): removing the current-turn Player advances the turn + adds them to acted", async () => {
  const { host, created, guests } = await lobbyOf("RMTURN", 3);
  const { hostDealt, guestDealt } = await deal(host, created, guests);
  const hostId = hostDealt.you.playerId;
  // The host is the Starting Player (currentTurnId === hostId) right after the deal.
  expect(hostDealt.currentTurnId).toBe(hostId);
  const seatAfterHost = [...hostDealt.players].sort((a, b) => a.seatIndex - b.seatIndex).find((p) => p.id !== hostId)!;

  // Host removes themselves? No — self-remove is forbidden; remove the CURRENT-turn player by reassigning
  // first is overkill. Instead drive the turn to a guest, then remove that guest.
  // Host keeps → turn moves to the next seat.
  host.send({ type: "keep", payload: { turnToken: hostDealt.turnToken } });
  const nextView = await nextTurn(host, guestDealt.find((g) => g.you.playerId !== hostId)!.you.playerId, 20).catch(
    () => null,
  );
  const turnView = nextView ?? (await nextPhase(host, "turns"));
  const currentId = turnView.currentTurnId!;
  expect(currentId).not.toBe(hostId); // a guest is now on turn
  void seatAfterHost;

  // Host removes the current-turn guest mid-Round.
  host.send({ type: "hostRemovePlayer", payload: { phaseToken: turnView.phaseToken, playerId: currentId } });
  const after = await nextRosterSize(host, 2);
  // The removed seat is gone; the turn advanced to a still-present alive seat (NOT the gone one).
  expect(after.players.some((p) => p.id === currentId)).toBe(false);
  expect(after.currentTurnId).not.toBe(currentId);
  // And the removed id was added to round.acted (inspect the live round).
  const stub = env.Table.get(env.Table.idFromName("RMTURN"));
  const acted = await runInDurableObject(stub, async (instance) => {
    const table = (instance as unknown as TableServer).table!;
    return table.round!.acted.includes(currentId);
  });
  expect(acted).toBe(true);

  host.close();
  for (const g of guests) g.close();
});

test("AC-4.2.4 (mid-Round, current turn is the LAST un-acted seat): removal completes the pass → allActed (no stall)", async () => {
  // Regression (code review 2026-06-23): when every OTHER alive seat has already acted and the Host removes
  // the current-turn Player, the pass must complete (turns → allActed) so revealAll is reachable — the
  // handler must re-run maybeCompletePass AFTER the splice, not strand the Round in `turns`.
  const { host, created, guests } = await lobbyOf("RMLAST", 3);
  const { hostDealt, guestDealt } = await deal(host, created, guests);
  const hostId = hostDealt.you.playerId;
  const byId = new Map<string, OpenConn>([
    [hostId, host],
    ...guestDealt.map((g, i) => [g.you.playerId, guests[i]] as const),
  ]);
  // Act for the first two seats only (host + the next actor), so the THIRD seat is on turn but un-acted.
  // After the deal the host is the Starting Player. (Mirrors everyoneKeeps' nextActorAfter/nextTurn drive.)
  let view: ProjectedTableState = hostDealt;
  for (let i = 0; i < 2; i++) {
    const actorId = view.currentTurnId!;
    byId.get(actorId)!.send({ type: "keep", payload: { turnToken: view.turnToken } });
    view = await nextTurn(host, nextActorAfter(view, byId), 20);
  }
  const lastActorId = view.currentTurnId!;
  expect(lastActorId).not.toBe(hostId); // a guest is the final un-acted seat

  // Host removes the last un-acted current-turn Player → the one pass is now complete.
  host.send({ type: "hostRemovePlayer", payload: { phaseToken: view.phaseToken, playerId: lastActorId } });
  await nextRosterSize(host, 2);
  // Inspect the live state: the Round must have transitioned turns → allActed (not stranded), with the
  // active seat cleared — proving maybeCompletePass ran after the splice.
  const stub = env.Table.get(env.Table.idFromName("RMLAST"));
  const live = await runInDurableObject(stub, async (instance) => {
    const table = (instance as unknown as TableServer).table!;
    return { phase: table.phase, currentTurnId: table.round?.currentTurnId, hasGone: table.players.some((p) => p.id === lastActorId) };
  });
  expect(live.phase).toBe("allActed");
  expect(live.currentTurnId).toBe(""); // active seat cleared on pass completion
  expect(live.hasGone).toBe(false);

  host.close();
  for (const g of guests) g.close();
});

test("AC-4.2.4 (mid-Round, non-current): removing a non-current Player leaves the turn unchanged", async () => {
  const { host, created, guests } = await lobbyOf("RMNON", 3);
  const { hostDealt, guestDealt } = await deal(host, created, guests);
  const hostId = hostDealt.you.playerId;
  expect(hostDealt.currentTurnId).toBe(hostId);
  // Remove a guest who is NOT on turn (the host is on turn).
  const victim = guestDealt.find((g) => g.you.playerId !== hostId)!.you.playerId;
  host.send({ type: "hostRemovePlayer", payload: { phaseToken: hostDealt.phaseToken, playerId: victim } });
  const after = await nextRosterSize(host, 2);
  expect(after.players.some((p) => p.id === victim)).toBe(false);
  // The current turn is still the host (the round was not rewritten for a non-current removal).
  expect(after.currentTurnId).toBe(hostId);
  host.close();
  for (const g of guests) g.close();
});

test("AC-4.2.3 (server-authority): a NON-Host hostRemovePlayer → not-host", async () => {
  const { host, guests, result, p1Id } = await driveToRoundResult("RMH");
  guests[0].send({ type: "hostRemovePlayer", payload: { phaseToken: result.phaseToken, playerId: p1Id } });
  expect(await nextErrorReason(guests[0])).toBe("not-host");
  host.close();
  for (const g of guests) g.close();
});

test("AC-4.2.3 (stale): a hostRemovePlayer with a stale token → stale-phase", async () => {
  const { host, guests, result, p1Id, p2Id } = await driveToRoundResult("RMSTALE");
  // First removal bumps the token.
  host.send({ type: "hostRemovePlayer", payload: { phaseToken: result.phaseToken, playerId: p2Id } });
  await nextRosterSize(host, 2);
  // Re-using the original (now-stale) token → stale-phase.
  host.send({ type: "hostRemovePlayer", payload: { phaseToken: result.phaseToken, playerId: p1Id } });
  expect(await nextErrorReason(host)).toBe("stale-phase");
  host.close();
  for (const g of guests) g.close();
});

test("AC-4.2.3 (self-remove forbidden): a Host removing themselves → phase-illegal", async () => {
  const { host, guests, result, hostId } = await driveToRoundResult("RMSELF");
  host.send({ type: "hostRemovePlayer", payload: { phaseToken: result.phaseToken, playerId: hostId } });
  expect(await nextErrorReason(host)).toBe("phase-illegal");
  host.close();
  for (const g of guests) g.close();
});

test("AC-4.2.3 (bad id): removing an unknown playerId → phase-illegal", async () => {
  const { host, guests, result } = await driveToRoundResult("RMBAD");
  host.send({ type: "hostRemovePlayer", payload: { phaseToken: result.phaseToken, playerId: "no-such-id" } });
  expect(await nextErrorReason(host)).toBe("phase-illegal");
  host.close();
  for (const g of guests) g.close();
});

test("AC-4.2.7 (seatIndex collision): after a removal a fresh join gets a seatIndex no live seat holds", async () => {
  // Drive a REAL join (not a simulated derivation): joinRoom is lobby-only, so stay in lobby. Build a
  // 3-seat lobby (host=seat0, P1=seat1, P2=seat2), remove the MIDDLE seat (seat1) while in lobby (removal is
  // accepted at any phase), then have a 4th guest actually joinRoom. Under the OLD `length` rule the roster
  // is now length 2 → the new seat would be 2 → collide with the live seat2. The `max+1` fix yields seat3.
  const { host, created, guests } = await lobbyOf("SEATIDX", 3);
  // Map seatIndex → playerId from the host's roster once all 3 have joined.
  const full = await nextRosterSize(host, 3);
  const seat1Id = full.players.find((p) => p.seatIndex === 1)!.id;

  // Remove the MIDDLE seat (seatIndex 1) in lobby.
  host.send({ type: "hostRemovePlayer", payload: { phaseToken: created.phaseToken, playerId: seat1Id } });
  const afterRemove = await nextRosterSize(host, 2);
  const remainingSeats = afterRemove.players.map((p) => p.seatIndex).sort((a, b) => a - b);
  expect(remainingSeats).toEqual([0, 2]);

  // A 4th guest joins for real — handleJoinRoom assigns its seatIndex.
  const newcomer = await openConn("SEATIDX");
  newcomer.send({ type: "joinRoom", payload: { code: "SEATIDX", name: "Newcomer" } });
  const joined = await nextRosterSize(newcomer, 3);
  const newSeat = joined.players.find((p) => p.id === joined.you.playerId)!.seatIndex;

  // The newly-assigned seat must NOT collide with the live seat2 — the regression this AC guards.
  expect(remainingSeats.includes(newSeat)).toBe(false);
  expect(newSeat).toBe(3); // max(0, 2) + 1, NOT players.length (=2)

  newcomer.close();
  host.close();
  for (const g of guests) g.close();
});

// --- hostReassign ---

test("AC-4.2.5 (happy): a Host reassigns to another Player → hostId moves; new host you.isHost true, old host false", async () => {
  const { host, guests, result, hostId, p1Id } = await driveToRoundResult("RA1");
  host.send({ type: "hostReassign", payload: { phaseToken: result.phaseToken, playerId: p1Id } });
  // The old host's projection now reports you.isHost=false.
  const oldHostView = await nextIsHost(host, false);
  expect(oldHostView.hostId).toBe(p1Id);
  // The new host (p1) sees you.isHost=true.
  const newHostView = await nextIsHost(guests[0], true);
  expect(newHostView.you.isHost).toBe(true);
  void hostId;
  host.close();
  for (const g of guests) g.close();
});

test("AC-4.2.5 (server-authority): a NON-Host hostReassign → not-host", async () => {
  const { host, guests, result, p1Id } = await driveToRoundResult("RAH");
  guests[0].send({ type: "hostReassign", payload: { phaseToken: result.phaseToken, playerId: p1Id } });
  expect(await nextErrorReason(guests[0])).toBe("not-host");
  host.close();
  for (const g of guests) g.close();
});

test("AC-4.2.5 (self-reassign): a Host reassigning to themselves → phase-illegal", async () => {
  const { host, guests, result, hostId } = await driveToRoundResult("RASELF");
  host.send({ type: "hostReassign", payload: { phaseToken: result.phaseToken, playerId: hostId } });
  expect(await nextErrorReason(host)).toBe("phase-illegal");
  host.close();
  for (const g of guests) g.close();
});

test("AC-4.2.5 (eliminated target allowed): reassigning to an eliminated Player succeeds (eliminated host keeps conducting)", async () => {
  const { host, guests, result, p2Id } = await driveToRoundResult("RAELIM");
  const stub = env.Table.get(env.Table.idFromName("RAELIM"));
  await runInDurableObject(stub, async (instance) => {
    const table = (instance as unknown as TableServer).table!;
    const p2 = table.players.find((p) => p.id === p2Id)!;
    p2.lives = 0;
    p2.isAlive = false;
  });
  host.send({ type: "hostReassign", payload: { phaseToken: result.phaseToken, playerId: p2Id } });
  const view = await nextIsHost(host, false);
  expect(view.hostId).toBe(p2Id);
  host.close();
  for (const g of guests) g.close();
});

test("AC-4.2.5 (stale): a hostReassign with a stale token → stale-phase", async () => {
  const { host, guests, result, p1Id } = await driveToRoundResult("RASTALE");
  host.send({ type: "dealAgain", payload: { phaseToken: result.phaseToken } });
  await nextPhase(host, "turns");
  host.send({ type: "hostReassign", payload: { phaseToken: result.phaseToken, playerId: p1Id } });
  expect(await nextErrorReason(host)).toBe("stale-phase");
  host.close();
  for (const g of guests) g.close();
});
