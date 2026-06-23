// table-server-deck-scaling.do.test.ts — the END-TO-END auto-deck-scaling boundary (Story 5.1, FR-13).
// Runs in the `do` / @cloudflare/vitest-pool-workers project (real Workers runtime + real ctx.storage +
// a genuine WebSocket upgrade), driving the actual createRoom → joinRoom×N → deal → handleDeal path.
//
// What this pins (AC-5.1.4/.5):
//   - a real deal at exactly 10 Players uses ONE 52-card deck (42-card leftover after dealing 10).
//   - a real deal at exactly 11 Players uses TWO merged decks / 104 cards (93-card leftover after 11).
//   - every alive seat is dealt exactly one card at both sizes; the round is dealable (no throw).
//   - a full 20-Player deal succeeds (2 decks) and cards all 20 seats.
// The deck count is engine-internal (not over the wire), so we inspect the LIVE round on the DO instance
// (round is never persisted to the "table" summary — D2). [Source: epics.md#Decision-7 (one boundary
// integration test); engine.ts compositionFor/dealRound; table-server-deal.do.test.ts harness.]
import { SELF, env, runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import type { Card, ProjectedTableState, ServerEvent } from "@trash/shared";
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

// `tries` is generous: at large tables the host socket buffers one `lobby` join fan-out per guest
// (staggered under hibernation) ahead of its single `turns` projection, so we must drain past all of
// them — ~total events for a `total`-seat table. [Same staggered-delivery lesson as the deal harness.]
async function nextPhase(conn: OpenConn, phase: ProjectedTableState["phase"], tries = 40): Promise<ProjectedTableState> {
  for (let i = 0; i < tries; i++) {
    const view = asTableState(await conn.next());
    if (view.phase === phase) return view;
  }
  throw new Error(`never saw a tableState with phase ${phase} after ${tries} events`);
}

/** Set up a host + (total-1) guests in lobby; poll the durable roster until every seat has committed
 *  (join fan-outs are staggered under hibernation — the roster is the source of truth). */
async function lobbyOf(code: string, total: number): Promise<{ host: OpenConn; created: ProjectedTableState; guests: OpenConn[] }> {
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
  for (let tries = 0; tries < 60 && count < total; tries++) {
    await new Promise((r) => setTimeout(r, 20));
    count = await readCount();
  }
  expect(count).toBe(total);
  return { host, created, guests };
}

/** Drive a real deal at `total` players and return { handsDealt, leftoverDeck } read off the LIVE round. */
async function dealAndInspect(code: string, total: number): Promise<{ handsDealt: number; leftoverDeck: number }> {
  const { host, created, guests } = await lobbyOf(code, total);
  host.send({ type: "deal", payload: { phaseToken: created.phaseToken } });
  await nextPhase(host, "turns");

  const stub = env.Table.get(env.Table.idFromName(code));
  const round = await runInDurableObject(stub, async (instance) => {
    const table = (instance as unknown as TableServer).table!;
    const r = table.round!;
    // Return plain counts so nothing DO-bound escapes the closure.
    return { hands: Object.keys(r.hands).length, deck: (r.deck as Card[]).length };
  });

  host.close();
  for (const g of guests) g.close();
  return { handsDealt: round.hands, leftoverDeck: round.deck };
}

test("AC-5.1.5 (boundary, 10 players): a deal uses ONE 52-card deck — 10 cards dealt, 42 leftover", async () => {
  const { handsDealt, leftoverDeck } = await dealAndInspect("DECK10", 10);
  expect(handsDealt).toBe(10); // one card per alive seat
  expect(leftoverDeck).toBe(52 - 10); // 1 deck: 42 cards remain for the Last-Player draw
});

test("AC-5.1.5 (boundary, 11 players): a deal uses TWO merged decks — 11 cards dealt, 93 leftover (104-card deck)", async () => {
  const { handsDealt, leftoverDeck } = await dealAndInspect("DECK11", 11);
  expect(handsDealt).toBe(11); // one card per alive seat
  expect(leftoverDeck).toBe(104 - 11); // 2 merged decks: 93 cards remain
});

test("AC-5.1.4 (full table, 20 players): a deal succeeds with two decks and cards all 20 seats", async () => {
  const { handsDealt, leftoverDeck } = await dealAndInspect("DECK20", 20);
  expect(handsDealt).toBe(20);
  expect(leftoverDeck).toBe(104 - 20); // 84 leftover — dealRound's coverage assert is satisfied
});
