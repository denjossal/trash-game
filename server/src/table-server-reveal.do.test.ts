// table-server-reveal.do.test.ts — the END-TO-END revealAll wire path (Story 3.2). Runs in the `do` /
// @cloudflare/vitest-pool-workers project (real Workers runtime + real ctx.storage + a genuine WebSocket
// upgrade through the Worker fetch → routePartykitRequest → TableServer DO). Drives the actual
// onConnect/onMessage → dispatch → handleReveal → fanOut path, not an RPC shortcut. Mirrors the
// table-server-draw.do.test.ts harness (openConn / nextPhase / nextErrorReason / lobbyOf / deal).
//
// What this pins (AC-3.2.1/.2/.3/.4/.7 — UPDATED for Story 3.4's resolve-at-reveal):
//   - happy path: deal → every seat acts (last action → allActed) → Host revealAll → resolution runs in the
//     SAME transition (Story 3.4): every device gets a projection with revealed===true AND every seat's hand
//     present (SM-6-over-the-wire: the reveal is the FIRST moment a non-owner receives another seat's card).
//     Because resolution lands the phase at `roundResult` (heads-up: both alive after the loser drops one
//     life), the projection's PHASE is `roundResult` with `revealed:true` (the wire never rests at the
//     transient `showdown` literal) and `loserIds` is set. The hand-key count === player count.
//   - reveal-finality: a revealAll BEFORE allActed (phase `turns`, right after deal) is rejected
//     `phase-illegal`; no Card is revealed while any Card is still mutable (NFR-5).
//   - server-authority: a NON-Host revealAll at allActed is refused `not-host` (NFR-2).
//   - double-tap: a second revealAll (stale phase token) is rejected `stale-phase`.
// [Source: epics.md#Story 3.2/3.4; architecture.md#Phase allActed→showdown→roundResult; table-server-draw.do.test.ts harness.]
import { SELF, env, runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import type { ProjectedTableState, ServerEvent } from "@trash/shared";

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
async function nextPhase(conn: OpenConn, phase: ProjectedTableState["phase"], tries = 12): Promise<ProjectedTableState> {
  for (let i = 0; i < tries; i++) {
    const ev = await conn.next();
    if (ev.type !== "tableState") continue;
    const view = (ev as Extract<ServerEvent, { type: "tableState" }>).payload;
    if (view.phase === phase) return view;
  }
  throw new Error(`never saw a tableState with phase ${phase} after ${tries} events`);
}

/** Read tableState events until currentTurnId matches the wanted value. */
async function nextTurn(conn: OpenConn, currentTurnId: string, tries = 12): Promise<ProjectedTableState> {
  for (let i = 0; i < tries; i++) {
    const ev = await conn.next();
    if (ev.type !== "tableState") continue;
    const view = (ev as Extract<ServerEvent, { type: "tableState" }>).payload;
    if (view.currentTurnId === currentTurnId) return view;
  }
  throw new Error(`never saw a tableState with currentTurnId ${currentTurnId} after ${tries} events`);
}

async function nextErrorReason(conn: OpenConn, tries = 10): Promise<string> {
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

test("AC-3.2.1/.4 + 3.4 (heads-up): allActed → Host revealAll → resolved roundResult, revealed, ALL hands, loserIds", async () => {
  // Heads-up: host(seat0, Starting Player) + P1(seat1, Last Player). Host keeps → P1 keeps → allActed.
  const { host, created, guests } = await lobbyOf("RVL", 2);
  const { hostDealt, guestDealt } = await deal(host, created, guests);
  const p1 = guests[0];
  const p1Id = guestDealt[0].you.playerId;

  // Host (starting player) keeps → turn passes to P1 (the Last Player).
  host.send({ type: "keep", payload: { turnToken: hostDealt.turnToken } });
  const p1Turn = await nextTurn(p1, p1Id);
  // P1 keeps → the one pass completes → allActed (active seat cleared).
  p1.send({ type: "keep", payload: { turnToken: p1Turn.turnToken } });
  const hostAllActed = await nextPhase(host, "allActed");
  await nextPhase(p1, "allActed");
  expect(hostAllActed.revealed).toBe(false); // cards still hidden at allActed (final but not revealed).

  // Host triggers the reveal, carrying the current phase token. Resolution runs in the SAME transition
  // (Story 3.4): heads-up → exactly one loser drops a life, both stay alive (≥2) → lands `roundResult`
  // with revealed:true (the wire never rests at the transient `showdown` literal).
  host.send({ type: "revealAll", payload: { phaseToken: hostAllActed.phaseToken } });

  // Every device now sees `roundResult` with revealed===true, loserIds set, and EVERY seat's hand present.
  const hostShow = await nextPhase(host, "roundResult");
  const p1Show = await nextPhase(p1, "roundResult");
  for (const view of [hostShow, p1Show]) {
    expect(view.phase).toBe("roundResult");
    expect(view.revealed).toBe(true);
    // The resolution set loserIds (exactly one loser in a heads-up with distinct ranks).
    expect(view.loserIds).toBeDefined();
    expect(view.loserIds!.length).toBe(1);
    // gameOver-only winnerIds stays absent at roundResult (≥2 alive).
    expect("winnerIds" in view).toBe(false);
    // The loser's life dropped to 2 (started at 3); the non-loser stays at 3.
    const loserId = view.loserIds![0];
    const loserSeat = view.players.find((pl) => pl.id === loserId)!;
    expect(loserSeat.lives).toBe(2);
    expect(loserSeat.isAlive).toBe(true); // 2 lives → still alive (≥2-alive branch).
    // SM-6-over-the-wire: EVERY seat in players[] still carries its hand (round kept → revealed stays true).
    expect(view.players.length).toBe(2);
    for (const entry of view.players) expect(entry.hand).toBeDefined();
    // "hand" key count = 2 seats in players[] + 1 own you.hand = 3 (each seat's card present once).
    expect(JSON.stringify(view).split('"hand"').length - 1).toBe(3);
  }

  host.close();
  for (const g of guests) g.close();
});

test("AC-3.2.2 (reveal-finality): a revealAll BEFORE allActed is rejected phase-illegal — nothing revealed", async () => {
  const { host, created, guests } = await lobbyOf("RFIN", 2);
  const { hostDealt } = await deal(host, created, guests);
  // Right after the deal the phase is `turns` (cards still mutable) — a reveal here must be refused.
  expect(hostDealt.phase).toBe("turns");
  host.send({ type: "revealAll", payload: { phaseToken: hostDealt.phaseToken } });
  expect(await nextErrorReason(host)).toBe("phase-illegal");

  host.close();
  for (const g of guests) g.close();
});

test("AC-3.2.3 (server-authority): a NON-Host revealAll at allActed is refused not-host", async () => {
  const { host, created, guests } = await lobbyOf("RHOST", 2);
  const { hostDealt, guestDealt } = await deal(host, created, guests);
  const p1 = guests[0];
  const p1Id = guestDealt[0].you.playerId;
  // Drive to allActed: host keeps, P1 keeps.
  host.send({ type: "keep", payload: { turnToken: hostDealt.turnToken } });
  const p1Turn = await nextTurn(p1, p1Id);
  p1.send({ type: "keep", payload: { turnToken: p1Turn.turnToken } });
  const p1AllActed = await nextPhase(p1, "allActed");

  // P1 (a guest, not the Host) crafts a revealAll at allActed → refused not-host (server-authoritative).
  p1.send({ type: "revealAll", payload: { phaseToken: p1AllActed.phaseToken } });
  expect(await nextErrorReason(p1)).toBe("not-host");

  host.close();
  for (const g of guests) g.close();
});

test("AC-3.2.2 (double-tap): a second revealAll carries a stale token → rejected stale-phase", async () => {
  const { host, created, guests } = await lobbyOf("RDBL", 2);
  const { hostDealt, guestDealt } = await deal(host, created, guests);
  const p1 = guests[0];
  const p1Id = guestDealt[0].you.playerId;
  host.send({ type: "keep", payload: { turnToken: hostDealt.turnToken } });
  const p1Turn = await nextTurn(p1, p1Id);
  p1.send({ type: "keep", payload: { turnToken: p1Turn.turnToken } });
  const hostAllActed = await nextPhase(host, "allActed");

  const tokenAtAllActed = hostAllActed.phaseToken;
  // First reveal is accepted (bumps the phase token; resolution lands roundResult — heads-up, ≥2 alive).
  host.send({ type: "revealAll", payload: { phaseToken: tokenAtAllActed } });
  await nextPhase(host, "roundResult");
  // A double-tap re-sends the SAME (now-stale) token → stale-phase, before any further transition.
  host.send({ type: "revealAll", payload: { phaseToken: tokenAtAllActed } });
  expect(await nextErrorReason(host)).toBe("stale-phase");

  host.close();
  for (const g of guests) g.close();
});
