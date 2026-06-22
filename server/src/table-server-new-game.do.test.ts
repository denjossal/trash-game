// table-server-new-game.do.test.ts — the END-TO-END newGame wire path (Story 3.6). Runs in the `do` /
// @cloudflare/vitest-pool-workers project (real Workers runtime + real ctx.storage + a genuine WebSocket
// upgrade through the Worker fetch → routePartykitRequest → TableServer DO). Drives the actual
// onConnect/onMessage → dispatch → handleReveal (resolve-at-reveal → gameOver) → handleNewGame → fanOut
// path, not an RPC shortcut. Clones the table-server-deal-again.do.test.ts harness (openConn / nextPhase /
// nextTurn / nextErrorReason / lobbyOf / deal / everyoneKeeps); the gameOver setup mirrors that file's
// terminal DAGO case (seed both seats to 1 life + a deterministic high/low hand so the win-check lands
// gameOver with the host as the sole winner).
//
// What this pins (AC-3.6.2/.3/.7):
//   - happy path: deal → everyone keeps → allActed → revealAll resolves gameOver → Host newGame → the
//     projection arrives with phase `lobby`, every Player back to startingLives + isAlive=true, the
//     between-round result (winnerIds/loserIds/nextStartingPlayerId) cleared, round null, token bumped.
//   - server-authority: a NON-Host newGame at gameOver → `not-host`.
//   - double-tap: a second newGame (stale phase token) → `stale-phase`.
//   - wrong-phase: a newGame from a non-gameOver phase (right after deal, `turns`) → `phase-illegal`
//     (newGame and dealAgain are mutually exclusive on the phase gate — dealAgain only at roundResult,
//     newGame only at gameOver).
//   - re-open join: after newGame the table is `lobby` again, so a fresh joinRoom is admitted (late
//     arrivals can seat for the next game); existing Players are NOT forced to re-join.
// [Source: epics.md#Story 3.6; architecture.md#Phase gameOver→newGame→lobby; deal-again harness.]
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

/** Read tableState events off a connection until one reaches the wanted phase (skip staggered fan-outs). */
async function nextPhase(conn: OpenConn, phase: ProjectedTableState["phase"], tries = 16): Promise<ProjectedTableState> {
  for (let i = 0; i < tries; i++) {
    const ev = await conn.next();
    if (ev.type !== "tableState") continue;
    const view = (ev as Extract<ServerEvent, { type: "tableState" }>).payload;
    if (view.phase === phase) return view;
  }
  throw new Error(`never saw a tableState with phase ${phase} after ${tries} events`);
}

/** Read tableState events until currentTurnId matches the wanted value. */
async function nextTurn(conn: OpenConn, currentTurnId: string, tries = 16): Promise<ProjectedTableState> {
  for (let i = 0; i < tries; i++) {
    const ev = await conn.next();
    if (ev.type !== "tableState") continue;
    const view = (ev as Extract<ServerEvent, { type: "tableState" }>).payload;
    if (view.currentTurnId === currentTurnId) return view;
  }
  throw new Error(`never saw a tableState with currentTurnId ${currentTurnId} after ${tries} events`);
}

async function nextErrorReason(conn: OpenConn, tries = 12): Promise<string> {
  for (let i = 0; i < tries; i++) {
    const ev = await conn.next();
    if (ev.type === "error") return (ev as Extract<ServerEvent, { type: "error" }>).payload.reason;
  }
  throw new Error(`never saw an error event after ${tries} events`);
}

/** Build a host + (total-1) guests in lobby; wait for the durable roster to show every seat. */
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

/** Deal the round (host is the Starting Player). Returns each socket's own dealt projection. */
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

/** Run one full pass where EVERY alive seat keeps; drives deal → allActed. Conducts off currentTurnId. */
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

/** The id of the seat to act after the current one — the next seatIndex (wrapping) among the roster. */
function nextActorAfter(view: ProjectedTableState, byId: Map<string, OpenConn>): string {
  const seats = view.players
    .filter((p) => byId.has(p.id))
    .slice()
    .sort((a, b) => a.seatIndex - b.seatIndex);
  const pos = seats.findIndex((p) => p.id === view.currentTurnId);
  return seats[(pos + 1) % seats.length].id;
}

/**
 * Drive a heads-up table all the way to a `gameOver` projection, with the host as the sole winner. Mirrors
 * the deal-again harness's terminal (DAGO) setup: both seats forced to 1 life + a deterministic host-high /
 * guest-low hand on the live (memory-only) round at allActed, so the win-check lands gameOver. Returns the
 * host's gameOver projection plus the seat ids.
 */
async function driveToGameOver(
  code: string,
): Promise<{ host: OpenConn; guests: OpenConn[]; over: ProjectedTableState; hostId: string; p1Id: string }> {
  const { host, created, guests } = await lobbyOf(code, 2);
  const { hostDealt, guestDealt } = await deal(host, created, guests);
  const p1 = guests[0];
  const hostId = hostDealt.you.playerId;
  const p1Id = guestDealt[0].you.playerId;

  const allActed = await everyoneKeeps(host, hostId, [{ conn: p1, id: p1Id }], hostDealt);

  const stub = env.Table.get(env.Table.idFromName(code));
  await runInDurableObject(stub, async (instance) => {
    const table = (instance as unknown as TableServer).table!;
    for (const pl of table.players) pl.lives = 1;
    table.round!.hands[hostId] = { rank: 13, suit: "♠" }; // King — strictly highest → host wins.
    table.round!.hands[p1Id] = { rank: 2, suit: "♥" }; // low — the sole loser, drops to 0 → eliminated.
  });

  host.send({ type: "revealAll", payload: { phaseToken: allActed.phaseToken } });
  const over = await nextPhase(host, "gameOver");
  return { host, guests, over, hostId, p1Id };
}

test("AC-3.6.2/.3 (happy): revealAll → gameOver → Host newGame → lobby, same roster reset to full lives & alive", async () => {
  const { host, guests, over, hostId, p1Id } = await driveToGameOver("NG2");
  // Precondition: a real gameOver with the host as the sole winner, guest eliminated.
  expect(over.revealed).toBe(true);
  expect(over.winnerIds).toContain(hostId);
  expect(over.players.find((pl) => pl.id === p1Id)!.isAlive).toBe(false);

  // Host taps "one more?" → newGame. The table returns to lobby with the SAME roster, fully reset.
  host.send({ type: "newGame", payload: { phaseToken: over.phaseToken } });
  const lobby = await nextPhase(host, "lobby");
  await nextPhase(guests[0], "lobby");

  // SAME roster (same ids/seats), full startingLives, all alive again.
  expect(lobby.players.length).toBe(2);
  expect(lobby.players.map((p) => p.id).sort()).toEqual([hostId, p1Id].sort());
  for (const p of lobby.players) {
    expect(p.lives).toBe(lobby.startingLives);
    expect(p.isAlive).toBe(true);
  }
  // The between-round result is cleared; no stale revealed round.
  expect("winnerIds" in lobby).toBe(false);
  expect("loserIds" in lobby).toBe(false);
  expect(lobby.revealed).toBe(false);
  expect(lobby.currentTurnId).toBeUndefined();
  // The phase token was bumped past the gameOver value (a stale newGame copy would now mismatch).
  expect(lobby.phaseToken).toBeGreaterThan(over.phaseToken);

  host.close();
  for (const g of guests) g.close();
});

test("AC-3.6.2 (server-authority): a NON-Host newGame at gameOver is refused not-host", async () => {
  const { host, guests, over } = await driveToGameOver("NGH");
  const p1 = guests[0];
  // P1 (a guest — and the eliminated loser) crafts a newGame → refused not-host, before any mutation.
  p1.send({ type: "newGame", payload: { phaseToken: over.phaseToken } });
  expect(await nextErrorReason(p1)).toBe("not-host");

  host.close();
  for (const g of guests) g.close();
});

test("AC-3.6.7 (double-tap): a second newGame carries a stale token → rejected stale-phase", async () => {
  const { host, guests, over } = await driveToGameOver("NGDBL");
  const tokenAtOver = over.phaseToken;
  // First newGame accepted (bumps the token → lobby).
  host.send({ type: "newGame", payload: { phaseToken: tokenAtOver } });
  await nextPhase(host, "lobby");
  // A double-tap re-sends the SAME (now-stale) token → stale-phase.
  host.send({ type: "newGame", payload: { phaseToken: tokenAtOver } });
  expect(await nextErrorReason(host)).toBe("stale-phase");

  host.close();
  for (const g of guests) g.close();
});

test("AC-3.6.7 (wrong-phase): a newGame from `turns` (right after deal) is rejected phase-illegal", async () => {
  // newGame is accepted ONLY at gameOver — the mirror of dealAgain's roundResult-only gate. Right after a
  // deal the phase is `turns`, so a newGame here is refused (the two transitions are mutually exclusive).
  const { host, created, guests } = await lobbyOf("NGWP", 2);
  const { hostDealt } = await deal(host, created, guests);
  expect(hostDealt.phase).toBe("turns");
  host.send({ type: "newGame", payload: { phaseToken: hostDealt.phaseToken } });
  expect(await nextErrorReason(host)).toBe("phase-illegal");

  host.close();
  for (const g of guests) g.close();
});

test("AC-3.6.3 (re-open join): after newGame the table is lobby again → a fresh joinRoom is admitted", async () => {
  const { host, guests, over } = await driveToGameOver("NGJOIN");
  // Host starts one more → back to lobby.
  host.send({ type: "newGame", payload: { phaseToken: over.phaseToken } });
  const lobby = await nextPhase(host, "lobby");
  expect(lobby.phase).toBe("lobby");

  // A brand-new device joins for the next game — admitted ONLY because join re-opened (phase === lobby).
  const late = await openConn("NGJOIN");
  late.send({ type: "joinRoom", payload: { code: "NGJOIN", name: "Late" } });
  const lateView = await nextPhase(late, "lobby");
  // The late arrival is seated; the roster grows to 3 (the two existing Players did NOT re-join).
  expect(lateView.players.length).toBe(3);
  expect(lateView.players.some((p) => p.name === "Late")).toBe(true);

  late.close();
  host.close();
  for (const g of guests) g.close();
});
