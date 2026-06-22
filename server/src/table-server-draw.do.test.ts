// table-server-draw.do.test.ts — the END-TO-END drawFromDeck wire path (Story 2.6). Runs in the `do` /
// @cloudflare/vitest-pool-workers project (real Workers runtime + real ctx.storage + a genuine WebSocket
// upgrade through the Worker fetch → routePartykitRequest → TableServer DO). Drives the actual
// onConnect/onMessage → dispatch → handleDraw → fanOut path, not an RPC shortcut. Mirrors the
// table-server-swap.do.test.ts harness (openConn / lobbyOf / deal).
//
// What this pins (AC-2.6.1/.2/.3 + the last-player authority + the allActed handoff + SM-6):
//   - the Last Player draws → their OWN card is replaced from the deck (over their OWN socket); the one
//     pass completes → phase becomes `allActed`; the active seat is cleared so NO device routes to a
//     phantom yourTurn; every device re-projects (SM-6 — no other seat's hand leaks).
//   - a drawFromDeck from a NON-last seat (even on their own turn) is refused `not-your-turn`.
//   - a stale-token draw is rejected `stale-turn` BEFORE any mutation.
// [Source: epics.md#Story 2.6; table-server-swap.do.test.ts openConn/lobbyOf/deal harness; deferred-work #123.]
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

test("AC-2.6.1/.2/.3 (heads-up): the Last Player draws → own card replaced from deck; pass completes → allActed; no phantom turn", async () => {
  // Heads-up: host(seat0, Starting Player) + P1(seat1, the Last Player). The host keeps to pass the turn
  // to P1; P1 (the last seat) draws — that closes the one pass → allActed.
  const { host, created, guests } = await lobbyOf("DRAW", 2);
  const { hostDealt, guestDealt } = await deal(host, created, guests);
  const p1 = guests[0];
  const p1Dealt = guestDealt[0];
  const p1Id = p1Dealt.you.playerId;

  // Only the LAST Player's device advertises isLastPlayer; the host (starting player) does not.
  expect(p1Dealt.you.isLastPlayer).toBe(true);
  expect(hostDealt.you.isLastPlayer).toBe(false);

  // Host (starting player) keeps → turn passes right to P1 (the Last Player).
  host.send({ type: "keep", payload: { turnToken: hostDealt.turnToken } });
  const p1Turn = await nextTurn(p1, p1Id);
  expect(p1Turn.currentTurnId).toBe(p1Id);
  expect(p1Turn.you.isLastPlayer).toBe(true);
  const p1CardBefore = p1Turn.you.hand;
  expect(p1CardBefore).toBeDefined();

  // P1 (the Last Player) draws from the deck, carrying the current turn token.
  p1.send({ type: "drawFromDeck", payload: { turnToken: p1Turn.turnToken } });

  // P1's post-draw projection: the one pass is complete → phase allActed; the active seat is cleared
  // (no currentTurnId), so P1 routes to Waiting, not a phantom yourTurn. P1 still holds exactly one card.
  const p1After = await nextPhase(p1, "allActed");
  expect(p1After.phase).toBe("allActed");
  expect(p1After.currentTurnId ?? "").toBe(""); // active seat cleared (router-leak fix)
  expect(p1After.you.hand).toBeDefined(); // still holds exactly one card (the drawn one)
  // SM-6 over the wire: P1's own card only; no other seat's hand present (exactly one "hand" key).
  expect(JSON.stringify(p1After).split('"hand"').length - 1).toBe(1);

  // The host also transitions to allActed with no active seat (every device routes to Waiting).
  const hostAfter = await nextPhase(host, "allActed");
  expect(hostAfter.currentTurnId ?? "").toBe("");
  expect(JSON.stringify(hostAfter).split('"hand"').length - 1).toBe(1); // host sees only its own card

  host.close();
  for (const g of guests) g.close();
});

test("AC-2.6 (last-player authority): a drawFromDeck from a NON-last seat (on its own turn) is refused not-your-turn", async () => {
  // 3 seats: host(seat0, Starting Player & first to act) is NOT the Last Player (P2 is). On the host's
  // OWN turn it crafts a drawFromDeck — refused, because only the Last Player may draw.
  const { host, created, guests } = await lobbyOf("AUTH", 3);
  const { hostDealt } = await deal(host, created, guests);
  expect(hostDealt.you.isLastPlayer).toBe(false); // the host is the starting player, not the last.
  host.send({ type: "drawFromDeck", payload: { turnToken: hostDealt.turnToken } });
  expect(await nextErrorReason(host)).toBe("not-your-turn");

  host.close();
  for (const g of guests) g.close();
});

test("AC-2.6 (turn guard): a stale-token draw is rejected stale-turn BEFORE any mutation", async () => {
  const { host, created, guests } = await lobbyOf("DSTL", 2);
  const { hostDealt, guestDealt } = await deal(host, created, guests);
  const p1 = guests[0];
  const p1Id = guestDealt[0].you.playerId;
  // Pass the turn to P1 (the Last Player).
  host.send({ type: "keep", payload: { turnToken: hostDealt.turnToken } });
  const p1Turn = await nextTurn(p1, p1Id);
  expect(p1Turn.turnToken).toBe(1); // token bumped by the host's keep.
  // P1 draws with a WRONG token → stale-turn, before any mutation.
  p1.send({ type: "drawFromDeck", payload: { turnToken: 99 } });
  expect(await nextErrorReason(p1)).toBe("stale-turn");

  host.close();
  for (const g of guests) g.close();
});
