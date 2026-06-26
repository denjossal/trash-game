// table-server-deal-again.do.test.ts — the END-TO-END dealAgain wire path (Story 3.4). Runs in the `do` /
// @cloudflare/vitest-pool-workers project (real Workers runtime + real ctx.storage + a genuine WebSocket
// upgrade through the Worker fetch → routePartykitRequest → TableServer DO). Drives the actual
// onConnect/onMessage → dispatch → handleReveal (resolve-at-reveal) → handleDealAgain → fanOut path, not an
// RPC shortcut. Clones the table-server-reveal.do.test.ts harness (openConn / nextPhase / nextTurn /
// nextErrorReason / lobbyOf / deal).
//
// What this pins (AC-3.4.5/.6/.7/.9):
//   - happy path (heads-up + a ≥3 case): deal → every seat acts → allActed → Host revealAll → the resolved
//     projection arrives with phase `roundResult`, revealed===true, loserIds set, and the loser's lives
//     decremented by one → Host dealAgain → a NEW `turns` round whose currentTurnId === the resolved Loser
//     (Loser starts — FR-12).
//   - server-authority: a NON-Host dealAgain → `not-host`.
//   - double-tap: a second dealAgain (stale phase token) → `stale-phase`.
//   - wrong-phase: a dealAgain from a non-roundResult phase (right after deal, `turns`) → `phase-illegal`.
//   - terminal: a gameOver outcome (drive a table to ≤1 alive) offers NO re-deal — the projection routes
//     terminal (gameOver, NOT roundResult), and a dealAgain there is rejected `phase-illegal`.
// [Source: epics.md#Story 3.4; architecture.md#Phase roundResult→dealAgain→turns; reveal harness.]
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

/**
 * Run one full pass where EVERY alive seat keeps (no card mutation), driving deal → allActed. Returns the
 * host's allActed projection. Seats act in turn order starting at the host (the Starting Player on round 1;
 * the resolved Loser after a re-deal). Each socket is keyed by its playerId. Conducts purely off the
 * currentTurnId the projections report, so it works for any seat count and any Starting Player.
 */
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
      // Wait until SOME device reports the next actor's turn (read off the host's stream).
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

test("AC-3.4.5/.9 (heads-up): revealAll resolves → roundResult → Host dealAgain → new turns, Loser starts", async () => {
  const { host, created, guests } = await lobbyOf("DA2", 2);
  const { hostDealt, guestDealt } = await deal(host, created, guests);
  const p1 = guests[0];
  const hostId = hostDealt.you.playerId;
  const p1Id = guestDealt[0].you.playerId;

  // Drive to allActed: host (start) keeps → P1 keeps.
  const allActed = await everyoneKeeps(host, hostId, [{ conn: p1, id: p1Id }], hostDealt);

  // Rig the hands so there is EXACTLY ONE loser (host lowest). The random deal can otherwise hand both
  // heads-up seats equal-rank cards → a TIE → 2 losers → the `loserIds.length === 1` assertion flakes
  // (a pre-existing nondeterminism, unrelated to the round-loss fix). Set deterministic ranks in the live
  // round before the reveal (server-side only; resolveShowdown reads these in-process). [See FULLFLOW rig.]
  const stub = env.Table.get(env.Table.idFromName("DA2"));
  await runInDurableObject(stub, async (instance) => {
    const t = (instance as unknown as TableServer).table!;
    t.round!.hands[hostId] = { rank: 2, suit: "♥" }; // lowest → host is the sole loser
    t.round!.hands[p1Id] = { rank: 13, suit: "♠" }; // high → safe
  });

  // Host reveals → resolution lands roundResult (≥2 alive), loserIds set, loser's lives decremented.
  host.send({ type: "revealAll", payload: { phaseToken: allActed.phaseToken } });
  const result = await nextPhase(host, "roundResult");
  await nextPhase(p1, "roundResult");
  expect(result.revealed).toBe(true);
  expect(result.loserIds).toBeDefined();
  expect(result.loserIds!.length).toBe(1);
  const loserId = result.loserIds![0];
  const loserSeat = result.players.find((pl) => pl.id === loserId)!;
  expect(loserSeat.lives).toBe(2); // started at 3, dropped one.

  // Host dealAgain → a fresh `turns` round whose currentTurnId === the resolved Loser (Loser starts).
  host.send({ type: "dealAgain", payload: { phaseToken: result.phaseToken } });
  const reDealt = await nextPhase(host, "turns");
  await nextPhase(p1, "turns");
  expect(reDealt.currentTurnId).toBe(loserId);
  // The between-round result is cleared on the fresh round.
  expect("loserIds" in reDealt).toBe(false);
  expect(reDealt.revealed).toBe(false);

  host.close();
  for (const g of guests) g.close();
});

test("review-fix (durable starter): the persisted roundResult summary carries nextStartingPlayerId = the Loser", async () => {
  // The soft-lock/crash fix: nextStartingPlayerId is persisted so a roundResult reload re-deals the
  // correct Loser instead of falling back to hostId. Assert the durable "table" key carries it after the
  // reveal resolves to roundResult — the wire-level proof that a wake can recover the re-deal.
  const { host, created, guests } = await lobbyOf("DAST", 2);
  const { hostDealt, guestDealt } = await deal(host, created, guests);
  const p1 = guests[0];
  const hostId = hostDealt.you.playerId;
  const p1Id = guestDealt[0].you.playerId;

  const allActed = await everyoneKeeps(host, hostId, [{ conn: p1, id: p1Id }], hostDealt);
  host.send({ type: "revealAll", payload: { phaseToken: allActed.phaseToken } });
  const result = await nextPhase(host, "roundResult");
  const loserId = result.loserIds![0];

  const stub = env.Table.get(env.Table.idFromName("DAST"));
  const persisted = await runInDurableObject(stub, async (_instance, state) =>
    state.storage.get<{ phase: string; nextStartingPlayerId?: string; loserIds?: string[] }>("table"),
  );
  expect(persisted?.phase).toBe("roundResult");
  expect(persisted?.loserIds).toEqual([loserId]);
  // The resolved Loser is durable — a reload re-deals it (no hostId fallback, no soft-lock).
  expect(persisted?.nextStartingPlayerId).toBe(loserId);

  host.close();
  for (const g of guests) g.close();
});

test("AC-3.4.5/.9 (3 players): revealAll resolves → roundResult → dealAgain → new turns, Loser starts", async () => {
  const { host, created, guests } = await lobbyOf("DA3", 3);
  const { hostDealt, guestDealt } = await deal(host, created, guests);
  const hostId = hostDealt.you.playerId;
  const others = guests.map((conn, i) => ({ conn, id: guestDealt[i].you.playerId }));

  const allActed = await everyoneKeeps(host, hostId, others, hostDealt);
  host.send({ type: "revealAll", payload: { phaseToken: allActed.phaseToken } });
  const result = await nextPhase(host, "roundResult");
  expect(result.loserIds).toBeDefined();
  expect(result.loserIds!.length).toBeGreaterThanOrEqual(1);

  host.send({ type: "dealAgain", payload: { phaseToken: result.phaseToken } });
  const reDealt = await nextPhase(host, "turns");
  // The new Starting Player is the resolved Loser (the nextStartingPlayerId the resolution computed).
  // With ≥2 alive and at least one alive loser, currentTurnId must be one of the loserIds.
  expect(result.loserIds).toContain(reDealt.currentTurnId);

  host.close();
  for (const g of guests) g.close();
});

test("AC-3.4.7 (server-authority): a NON-Host dealAgain at roundResult is refused not-host", async () => {
  const { host, created, guests } = await lobbyOf("DAH", 2);
  const { hostDealt, guestDealt } = await deal(host, created, guests);
  const p1 = guests[0];
  const hostId = hostDealt.you.playerId;
  const p1Id = guestDealt[0].you.playerId;

  const allActed = await everyoneKeeps(host, hostId, [{ conn: p1, id: p1Id }], hostDealt);
  host.send({ type: "revealAll", payload: { phaseToken: allActed.phaseToken } });
  const result = await nextPhase(p1, "roundResult");

  // P1 (a guest) crafts a dealAgain → refused not-host (server-authoritative, before any mutation).
  p1.send({ type: "dealAgain", payload: { phaseToken: result.phaseToken } });
  expect(await nextErrorReason(p1)).toBe("not-host");

  host.close();
  for (const g of guests) g.close();
});

test("AC-3.4.7 (double-tap): a second dealAgain carries a stale token → rejected stale-phase", async () => {
  const { host, created, guests } = await lobbyOf("DADBL", 2);
  const { hostDealt, guestDealt } = await deal(host, created, guests);
  const p1 = guests[0];
  const hostId = hostDealt.you.playerId;
  const p1Id = guestDealt[0].you.playerId;

  const allActed = await everyoneKeeps(host, hostId, [{ conn: p1, id: p1Id }], hostDealt);
  host.send({ type: "revealAll", payload: { phaseToken: allActed.phaseToken } });
  const result = await nextPhase(host, "roundResult");

  const tokenAtResult = result.phaseToken;
  // First dealAgain accepted (bumps the token → turns).
  host.send({ type: "dealAgain", payload: { phaseToken: tokenAtResult } });
  await nextPhase(host, "turns");
  // A double-tap re-sends the SAME (now-stale) token → stale-phase.
  host.send({ type: "dealAgain", payload: { phaseToken: tokenAtResult } });
  expect(await nextErrorReason(host)).toBe("stale-phase");

  host.close();
  for (const g of guests) g.close();
});

test("AC-3.4.6 (wrong-phase): a dealAgain from `turns` (right after deal) is rejected phase-illegal", async () => {
  const { host, created, guests } = await lobbyOf("DAWP", 2);
  const { hostDealt } = await deal(host, created, guests);
  // Right after the deal the phase is `turns`, not roundResult — a dealAgain here is refused.
  expect(hostDealt.phase).toBe("turns");
  host.send({ type: "dealAgain", payload: { phaseToken: hostDealt.phaseToken } });
  expect(await nextErrorReason(host)).toBe("phase-illegal");

  host.close();
  for (const g of guests) g.close();
});

test("AC-3.4.6/.9 (terminal): a gameOver outcome offers NO re-deal — dealAgain there is phase-illegal", async () => {
  // Drive a heads-up table to allActed, then force BOTH seats to 1 life (so the loser hits 0 → eliminated
  // → exactly 1 alive → the win-check lands gameOver, not roundResult). Mutating the in-memory round.hands
  // to give the host a STRICTLY higher card makes the loser deterministic (the guest), so the gameOver
  // winner is the host. The mutation is on the live instance (round is memory-only) at allActed, before
  // the reveal — exactly the state a real multi-round game reaches.
  const { host, created, guests } = await lobbyOf("DAGO", 2);
  const { hostDealt, guestDealt } = await deal(host, created, guests);
  const p1 = guests[0];
  const hostId = hostDealt.you.playerId;
  const p1Id = guestDealt[0].you.playerId;

  const allActed = await everyoneKeeps(host, hostId, [{ conn: p1, id: p1Id }], hostDealt);

  // Seed the terminal precondition on the live instance: both at 1 life; host holds the higher card so the
  // guest is the sole loser → drops to 0 → eliminated → 1 alive → gameOver, host is the winner.
  const stub = env.Table.get(env.Table.idFromName("DAGO"));
  await runInDurableObject(stub, async (instance) => {
    // The worker-configuration types env.Table as DurableObjectStub<undefined>, so the pool can't infer
    // the instance type — cast to TableServer to reach the public `table` field (the in-memory state).
    const table = (instance as unknown as TableServer).table!;
    for (const pl of table.players) pl.lives = 1;
    table.round!.hands[hostId] = { rank: 13, suit: "♠" }; // King — strictly highest.
    table.round!.hands[p1Id] = { rank: 2, suit: "♥" }; // low — the sole loser.
  });

  // Host reveals → resolution lands gameOver (≤1 alive). The projection routes terminal: phase gameOver,
  // winnerIds names the host, the loser is eliminated. NO re-deal affordance reaches anyone.
  host.send({ type: "revealAll", payload: { phaseToken: allActed.phaseToken } });
  const over = await nextPhase(host, "gameOver");
  expect(over.revealed).toBe(true);
  expect(over.winnerIds).toBeDefined();
  expect(over.winnerIds).toContain(hostId);
  const loserSeat = over.players.find((pl) => pl.id === p1Id)!;
  expect(loserSeat.lives).toBe(0);
  expect(loserSeat.isAlive).toBe(false);

  // A dealAgain at gameOver is rejected phase-illegal (a Round can never start with <2 Players — E1).
  host.send({ type: "dealAgain", payload: { phaseToken: over.phaseToken } });
  expect(await nextErrorReason(host)).toBe("phase-illegal");

  host.close();
  for (const g of guests) g.close();
});
