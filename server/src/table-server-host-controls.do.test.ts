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

test("dealAgain floor: removing seats below MIN_PLAYERS at roundResult makes the Re-deal phase-illegal (no degenerate solo round)", async () => {
  // Regression (code-review 5.1): handleHostRemovePlayer has no phase gate / floor and the roundResult
  // gate's ≥2-alive guarantee only holds for an UNTOUCHED roster — so removal can drop the table below
  // MIN_PLAYERS at roundResult. handleDealAgain must enforce the floor itself (assertDealable only checks
  // deck-cover, which a 1-alive {decks:1} composition passes). Remove BOTH guests → host alone (1 alive),
  // then a Re-deal must be refused rather than dealing a 1-player round.
  const { host, guests, result, p1Id, p2Id } = await driveToRoundResult("RDFLOOR");
  host.send({ type: "hostRemovePlayer", payload: { phaseToken: result.phaseToken, playerId: p1Id } });
  const afterFirst = await nextRosterSize(host, 2);
  host.send({ type: "hostRemovePlayer", payload: { phaseToken: afterFirst.phaseToken, playerId: p2Id } });
  const afterSecond = await nextRosterSize(host, 1); // host alone, still roundResult

  host.send({ type: "dealAgain", payload: { phaseToken: afterSecond.phaseToken } });
  expect(await nextErrorReason(host)).toBe("phase-illegal");
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

test("REPRO playtest 2026-06-23 (remove a NON-current un-acted player): the current player can STILL swap/keep", async () => {
  // Playtest: "after removing a player can't swap or keep." A different player (not on turn) was removed,
  // and the current player saw Swap/Keep but the taps did nothing. Repro: 3 players at `turns`; the host
  // is the Starting Player (current). Remove a NON-current, un-acted guest, then the host (still current)
  // sends `keep` with the projected turnToken — it MUST be accepted and advance the turn, not be rejected.
  const { host, created, guests } = await lobbyOf("RMNONCUR", 3);
  const { hostDealt } = await deal(host, created, guests);
  const hostId = hostDealt.you.playerId;
  expect(hostDealt.currentTurnId).toBe(hostId); // host is the current (starting) player

  // Pick a guest who is NOT on turn and has NOT acted.
  const victimId = [...hostDealt.players].find((p) => p.id !== hostId)!.id;
  expect(victimId).not.toBe(hostDealt.currentTurnId);

  // Host removes the non-current guest mid-Round.
  host.send({ type: "hostRemovePlayer", payload: { phaseToken: hostDealt.phaseToken, playerId: victimId } });
  const afterRemove = await nextRosterSize(host, 2);
  expect(afterRemove.players.some((p) => p.id === victimId)).toBe(false);
  // The host is STILL the current-turn player (a non-current removal must not touch the round).
  expect(afterRemove.currentTurnId).toBe(hostId);

  // Now the host tries to keep — supplying the turnToken from the post-removal projection (what the live
  // client would actually send). If the bug is real this is rejected and the turn never advances.
  host.send({ type: "keep", payload: { turnToken: afterRemove.turnToken! } });
  const stub = env.Table.get(env.Table.idFromName("RMNONCUR"));
  // Give the keep a moment to apply, then inspect the live round: the host must now be in `acted`
  // (the keep was accepted) and the turn advanced off the host.
  let live: { acted: string[]; currentTurnId: string | undefined; phase: string } | null = null;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 20));
    live = await runInDurableObject(stub, async (instance) => {
      const t = (instance as unknown as TableServer).table!;
      return { acted: [...(t.round?.acted ?? [])], currentTurnId: t.round?.currentTurnId, phase: t.phase };
    });
    if (live.acted.includes(hostId)) break;
  }
  // THE ASSERTION: the host's keep was accepted (host is in acted). If the bug reproduces, this FAILS —
  // the keep was silently rejected (stale-turn / not-your-turn / phase-illegal) and acted stays empty.
  expect(live!.acted).toContain(hostId);

  host.close();
  for (const g of guests) g.close();
});

test("REPRO v2 (GUEST is current; host removes a DIFFERENT non-current player): the guest can still keep", async () => {
  // Closer to the live report: a GUEST is taking their turn while the host removes someone else.
  // 4 players so that after the host keeps, a guest is current AND there is still another removable
  // non-current guest. Then remove that other guest and have the current guest keep.
  const { host, created, guests } = await lobbyOf("RMGUESTCUR", 4);
  const { hostDealt, guestDealt } = await deal(host, created, guests);
  const hostId = hostDealt.you.playerId;
  expect(hostDealt.currentTurnId).toBe(hostId);

  // Host keeps → turn advances to the next seat (a guest).
  host.send({ type: "keep", payload: { turnToken: hostDealt.turnToken } });
  // Find which guest is now current.
  const afterHostKeep = await nextTurn(host, nextActorAfter(hostDealt, new Map([
    [hostId, host],
    ...guestDealt.map((g, i) => [g.you.playerId, guests[i]] as const),
  ])), 20);
  const currentGuestId = afterHostKeep.currentTurnId!;
  expect(currentGuestId).not.toBe(hostId);
  const currentGuestConn = guests[guestDealt.findIndex((g) => g.you.playerId === currentGuestId)];

  // Remove a DIFFERENT non-current guest (not the host, not the current guest).
  const victimId = afterHostKeep.players.find((p) => p.id !== hostId && p.id !== currentGuestId)!.id;
  host.send({ type: "hostRemovePlayer", payload: { phaseToken: afterHostKeep.phaseToken, playerId: victimId } });
  const afterRemove = await nextRosterSize(host, 3);
  expect(afterRemove.currentTurnId).toBe(currentGuestId); // current guest's turn is untouched

  // The current guest reads its OWN latest projection (what its live client holds) and keeps.
  const guestView = await nextRosterSize(currentGuestConn, 3);
  currentGuestConn.send({ type: "keep", payload: { turnToken: guestView.turnToken! } });

  const stub = env.Table.get(env.Table.idFromName("RMGUESTCUR"));
  let live: { acted: string[] } | null = null;
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 20));
    live = await runInDurableObject(stub, async (instance) => {
      const t = (instance as unknown as TableServer).table!;
      return { acted: [...(t.round?.acted ?? [])] };
    });
    if (live.acted.includes(currentGuestId)) break;
  }
  expect(live!.acted).toContain(currentGuestId);

  host.close();
  for (const g of guests) g.close();
});

test("REPRO playtest 2026-06-23 (remove a player in the LOBBY, then deal): the round deals and is playable", async () => {
  // Playtest: "Before starting the game I remove the player so game is stuck." Repro: 3 players in the
  // lobby, host removes a guest, THEN host deals. The deal must succeed and land a playable `turns` round
  // (every alive seat carded, currentTurnId on a present seat). Survivors keep their original seatIndex
  // (immutable-for-life), so the roster is now non-contiguous in seatIndex — the deal/turn walk must cope.
  const code = "RMLOBBY";
  const { host, created, guests } = await lobbyOf(code, 3);
  const hostId = created.you.playerId;
  const stub = env.Table.get(env.Table.idFromName(code));
  const peek = () =>
    runInDurableObject(stub, async (instance) => {
      const t = (instance as unknown as TableServer).table!;
      return {
        phase: t.phase as string,
        phaseToken: t.phaseToken,
        players: t.players.map((p) => ({ id: p.id, seatIndex: p.seatIndex, isAlive: p.isAlive })),
        currentTurnId: t.round?.currentTurnId,
        turnToken: t.round?.turnToken,
        acted: [...(t.round?.acted ?? [])],
        carded: t.round ? t.players.filter((p) => p.isAlive && t.round!.hands[p.id] !== undefined).length : 0,
      };
    });
  const settle = () => new Promise((r) => setTimeout(r, 30));

  // Remove a guest in the LOBBY (before any deal).
  let s = await peek();
  const victimId = s.players.find((p) => p.id !== hostId)!.id;
  host.send({ type: "hostRemovePlayer", payload: { phaseToken: s.phaseToken, playerId: victimId } });
  for (let i = 0; i < 20 && (await peek()).players.length !== 2; i++) await settle();
  s = await peek();
  expect(s.players.some((p) => p.id === victimId)).toBe(false);
  expect(s.phase).toBe("lobby");

  // Now DEAL.
  host.send({ type: "deal", payload: { phaseToken: s.phaseToken } });
  for (let i = 0; i < 20 && (await peek()).phase !== "turns"; i++) await settle();
  s = await peek();
  // CHECKPOINT 1: does the deal reach a playable turns round at all (server state)?
  expect(s.phase).toBe("turns");
  expect(s.carded).toBe(2); // both remaining alive seats carded
  expect(s.players.some((p) => p.id === s.currentTurnId)).toBe(true); // turn on a present seat

  // CHECKPOINT 2: the current player can act.
  const connById = new Map<string, OpenConn>([[hostId, host], [s.players.find((p)=>p.id!==hostId)!.id, guests[0]]]);
  connById.get(s.currentTurnId!)?.send({ type: "keep", payload: { turnToken: s.turnToken! } });
  for (let i = 0; i < 20 && !(await peek()).acted.includes(s.currentTurnId!); i++) await settle();
  expect((await peek()).acted).toContain(s.currentTurnId!);

  host.close();
  for (const g of guests) g.close();
});

test("REPRO playtest 2026-06-23 (FULL FLOW: lives=1, remove D, host A loses → eliminated, B's turn): B can keep", async () => {
  // Exact live flow: A creates; B,C,D join; A sets lives=1; deal; remove D; A (host) loses the round →
  // 0 lives → eliminated; 2 alive (B,C) → roundResult; re-deal → it's B's turn but B can't swap/keep.
  // POLL-BASED (never waits on socket fan-out, which is what hangs): drive by inspecting the live DO state.
  const code = "FULLFLOW";
  const { host: a, created, guests } = await lobbyOf(code, 4);
  const [b, c] = guests;
  const aId = created.you.playerId;
  const stub = env.Table.get(env.Table.idFromName(code));

  const peek = () =>
    runInDurableObject(stub, async (instance) => {
      const t = (instance as unknown as TableServer).table!;
      return {
        phase: t.phase as string,
        phaseToken: t.phaseToken,
        startingLives: t.startingLives,
        players: t.players.map((p) => ({ id: p.id, seatIndex: p.seatIndex, isAlive: p.isAlive, lives: p.lives })),
        currentTurnId: t.round?.currentTurnId,
        turnToken: t.round?.turnToken,
        acted: [...(t.round?.acted ?? [])],
        nextStartingPlayerId: t.nextStartingPlayerId,
        hands: t.round ? Object.keys(t.round.hands) : [],
      };
    });
  const settle = () => new Promise((r) => setTimeout(r, 30));

  // A sets lives = 1 (lobby).
  let s = await peek();
  a.send({ type: "hostSetLives", payload: { phaseToken: s.phaseToken, lives: 1 } });
  for (let i = 0; i < 20 && (await peek()).startingLives !== 1; i++) await settle();
  s = await peek();
  expect(s.startingLives).toBe(1);

  // Deal.
  a.send({ type: "deal", payload: { phaseToken: s.phaseToken } });
  for (let i = 0; i < 20 && (await peek()).phase !== "turns"; i++) await settle();
  s = await peek();
  expect(s.phase).toBe("turns");
  const bySeat = [...s.players].sort((x, y) => x.seatIndex - y.seatIndex);
  const bId = b ? bySeat.find((p) => p.id !== aId)!.id : "";
  const dId = bySeat[bySeat.length - 1].id; // last seat = D
  void c;

  // Remove D.
  a.send({ type: "hostRemovePlayer", payload: { phaseToken: s.phaseToken, playerId: dId } });
  for (let i = 0; i < 20 && (await peek()).players.length !== 3; i++) await settle();
  s = await peek();
  expect(s.players.some((p) => p.id === dId)).toBe(false);

  // Conns by id (only A,B,C remain relevant). Build the non-host id list once and assert every entry
  // mapped to a REAL id — a `?? ""` fallback would silently map a connection to an empty-string key, so
  // `connById.get(currentTurnId)` would miss and the keep would no-op (under-driving the pass and
  // failing CHECKPOINT 1 for the wrong reason). Pin that the map is well-formed before driving.
  const nonHostIds = bySeat.filter((p) => p.id !== aId).map((p) => p.id);
  const connById = new Map<string, OpenConn>([[aId, a], ...guests.map((g, i) => [nonHostIds[i], g] as const)]);
  expect([...connById.keys()].every((id) => id.length > 0)).toBe(true);

  // Drive remaining alive seats to allActed by keeping on whoever holds the turn. A transient/stale
  // peek (mid fan-out) can momentarily read a non-`turns` phase or an empty currentTurnId BEFORE the
  // pass actually completes — do NOT treat that as "done" (the old `break` conflated the two and could
  // exit having sent zero keeps, then fail CHECKPOINT 1 as a confusing timing artifact). Instead skip
  // and re-poll; only `allActed` ends the loop. Track keeps sent so a stuck pass is diagnosable.
  let keepsSent = 0;
  for (let i = 0; i < 30; i++) {
    s = await peek();
    if (s.phase === "allActed") break;
    if (s.phase === "turns" && s.currentTurnId) {
      connById.get(s.currentTurnId)?.send({ type: "keep", payload: { turnToken: s.turnToken! } });
      keepsSent++;
    }
    await settle(); // transient state → just wait and re-poll
  }
  s = await peek();
  // The pass cannot complete without at least one keep landing — guard so a zero-keep early exit is
  // reported as such rather than masquerading as a phase bug.
  expect(keepsSent).toBeGreaterThan(0);
  expect(s.phase).toBe("allActed"); // CHECKPOINT 1: did the pass complete after D's removal?

  // Rig hands so A (host) is lowest → A loses its only life → eliminated.
  await runInDurableObject(stub, async (instance) => {
    const t = (instance as unknown as TableServer).table!;
    const alive = t.players.filter((p) => p.isAlive).map((p) => p.id);
    t.round!.hands[aId] = { rank: 2, suit: "♥" }; // lowest → A loses
    for (const id of alive) if (id !== aId) t.round!.hands[id] = { rank: 13, suit: "♠" };
  });

  // Reveal.
  s = await peek();
  a.send({ type: "revealAll", payload: { phaseToken: s.phaseToken } });
  for (let i = 0; i < 20 && !["roundResult", "gameOver"].includes((await peek()).phase); i++) await settle();
  s = await peek();
  expect(s.phase).toBe("roundResult"); // CHECKPOINT 2: 2 alive (B,C) → roundResult not gameOver
  expect(s.players.find((p) => p.id === aId)?.isAlive).toBe(false); // A eliminated
  const nextStarter = s.players.find((p) => p.id === s.nextStartingPlayerId);
  expect(nextStarter?.isAlive).toBe(true); // CHECKPOINT 3: next starter must be ALIVE, never eliminated A

  // Re-deal.
  s = await peek();
  a.send({ type: "dealAgain", payload: { phaseToken: s.phaseToken } });
  for (let i = 0; i < 20 && (await peek()).phase !== "turns"; i++) await settle();
  s = await peek();
  expect(s.phase).toBe("turns"); // CHECKPOINT 4: re-deal reached a playable round
  const cur = s.players.find((p) => p.id === s.currentTurnId);
  expect(cur?.isAlive).toBe(true); // CHECKPOINT 5: the turn points at an ALIVE present seat

  // The current player keeps — must be accepted (this is "B can't swap/keep").
  connById.get(s.currentTurnId!)?.send({ type: "keep", payload: { turnToken: s.turnToken! } });
  for (let i = 0; i < 20 && !(await peek()).acted.includes(s.currentTurnId!); i++) await settle();
  const final = await peek();
  expect(final.acted).toContain(s.currentTurnId!); // CHECKPOINT 6: B's keep was accepted

  void bId;
  a.close();
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

test("strand regression: removing the live round's Starting Player then revealing does NOT freeze the table", async () => {
  // Playtest 2026-06-23: the game randomly stranded after a few rounds. ROOT CAUSE — handleHostRemovePlayer
  // re-seated currentTurnId + the between-round nextStartingPlayerId, but NOT the LIVE round's
  // round.startingPlayerId. resolveShowdown asserts that id is a seated player (engine.ts:329); with the
  // starter removed, the reveal threw a plain Error (rethrown by dispatch) AFTER phase→showdown but BEFORE
  // the fan-out, freezing every device. Repro: re-deal (the prior Loser becomes the new round's starter),
  // remove that starter mid-round, drive the survivors' pass, reveal → must reach roundResult, not strand.
  const { host, guests, result, hostId, p1Id, p2Id } = await driveToRoundResult("RMSTART");
  const p2 = guests[1];
  const stub = env.Table.get(env.Table.idFromName("RMSTART"));

  // Re-deal: p1 (the prior Loser) is seated as the new round's startingPlayerId (and currentTurnId).
  host.send({ type: "dealAgain", payload: { phaseToken: result.phaseToken } });
  const dealt = await nextPhase(host, "turns");
  const before = await runInDurableObject(stub, async (instance) => {
    return { startingPlayerId: (instance as unknown as TableServer).table!.round!.startingPlayerId };
  });
  expect(before.startingPlayerId).toBe(p1Id); // precondition: p1 starts this round.

  // Remove p1 — the live round's Starting Player — mid-round.
  host.send({ type: "hostRemovePlayer", payload: { phaseToken: dealt.phaseToken, playerId: p1Id } });
  const afterRemove = await nextRosterSize(host, 2);
  expect(afterRemove.players.some((p) => p.id === p1Id)).toBe(false);
  // THE FIX: the live round's starter must have been re-seated off the removed id.
  const reseated = await runInDurableObject(stub, async (instance) => {
    return { startingPlayerId: (instance as unknown as TableServer).table!.round?.startingPlayerId };
  });
  expect(reseated.startingPlayerId).not.toBe(p1Id);

  // Drive the two survivors' one pass to allActed. p1 was on turn and was advanced + marked acted by the
  // removal, so the remaining un-acted seats are host + p2. Keep on whoever currently holds the turn.
  const conns = new Map<string, OpenConn>([[hostId, host], [p2Id, p2]]);
  for (let i = 0; i < 3; i++) {
    const live = await runInDurableObject(stub, async (instance) => {
      const t = (instance as unknown as TableServer).table!;
      return { phase: t.phase, currentTurnId: t.round?.currentTurnId ?? "", turnToken: t.round?.turnToken ?? 0 };
    });
    if (live.phase !== "turns") break;
    const c = conns.get(live.currentTurnId);
    if (!c) break;
    c.send({ type: "keep", payload: { turnToken: live.turnToken } });
    await new Promise((r) => setTimeout(r, 40)); // let the keep land before re-reading.
  }

  // Reveal — read the live phaseToken (projection ordering is noisy after a removal) and send revealAll.
  const atAllActed = await runInDurableObject(stub, async (instance) => {
    const t = (instance as unknown as TableServer).table!;
    return { phase: t.phase, phaseToken: t.phaseToken };
  });
  expect(atAllActed.phase).toBe("allActed");
  host.send({ type: "revealAll", payload: { phaseToken: atAllActed.phaseToken } });

  // THE ASSERTION: resolveShowdown must run without throwing — the table reaches roundResult/gameOver, not a
  // frozen "showdown". Poll the live phase (a strand leaves it stuck at "showdown" with no result forever).
  let finalPhase = "showdown";
  for (let i = 0; i < 25; i++) {
    finalPhase = await runInDurableObject(stub, async (instance) => (instance as unknown as TableServer).table!.phase);
    if (finalPhase === "roundResult" || finalPhase === "gameOver") break;
    await new Promise((r) => setTimeout(r, 40));
  }
  expect(["roundResult", "gameOver"]).toContain(finalPhase); // NOT stuck at "showdown".

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
