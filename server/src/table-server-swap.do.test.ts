// table-server-swap.do.test.ts — the END-TO-END swap/keep wire path (Story 2.4). Runs in the `do` /
// @cloudflare/vitest-pool-workers project (real Workers runtime + real ctx.storage + a genuine
// WebSocket upgrade through the Worker fetch → routePartykitRequest → TableServer DO). Drives the
// actual onConnect/onMessage → dispatch → handleSwap/handleKeep → fanOut path, not an RPC shortcut.
//
// What this pins (AC-2.4.3/.4 + the turn-token guard + not-your-turn + SM-6 + the squirm signal):
//   - the active Player swaps → the caller and the right-hand neighbor EXCHANGE cards (each over its
//     OWN socket projection — neither ever sees the other's value pre-reveal, SM-6); the turn passes
//     right (currentTurnId advances); the receiver's projection carries the value-free justReceivedSwap.
//   - a SECOND (now-stale-token) swap is rejected with `stale-turn`; no second mutation.
//   - a swap from a NON-active socket is refused with `not-your-turn`.
//   - keep leaves the caller's card unchanged and advances the turn.
// [Source: epics.md#Story 2.4 569–603; table-server-deal.do.test.ts openConn harness; deferred-work #123.]
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
async function nextPhase(conn: OpenConn, phase: ProjectedTableState["phase"], tries = 10): Promise<ProjectedTableState> {
  for (let i = 0; i < tries; i++) {
    const view = asTableState(await conn.next());
    if (view.phase === phase) return view;
  }
  throw new Error(`never saw a tableState with phase ${phase} after ${tries} events`);
}

/** Read tableState events until currentTurnId matches the wanted value (the post-turn fan-out may trail
 *  buffered deal/earlier projections under hibernation). Returns that view. */
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

test("AC-2.4.3: the active Player swaps → caller & right-neighbor EXCHANGE cards; turn passes right; receiver sees justReceivedSwap", async () => {
  const { host, created, guests } = await lobbyOf("SWAP", 3); // host(seat0) + P1(seat1) + P2(seat2)
  const { hostDealt, guestDealt } = await deal(host, created, guests);

  const hostId = created.you.playerId;
  const neighborConn = guests[0]; // P1, seat 1 — the host's right-hand neighbor (its socket).
  const neighborDealt = guestDealt[0]; // P1's dealt projection.
  const neighborId = neighborDealt.you.playerId;
  const hostCardBefore = hostDealt.you.hand;
  const neighborCardBefore = neighborDealt.you.hand;
  expect(hostCardBefore).toBeDefined();
  expect(neighborCardBefore).toBeDefined();
  expect(hostDealt.currentTurnId).toBe(hostId); // host starts.

  // The host (active) swaps, carrying the fresh round's turnToken (0).
  host.send({ type: "swap", payload: { turnToken: hostDealt.turnToken } });

  // Host's post-swap projection: now holds the NEIGHBOR's former card; turn passed to the neighbor.
  const hostAfter = await nextTurn(host, neighborId);
  expect(hostAfter.you.hand).toEqual(neighborCardBefore); // host received the neighbor's former card
  expect(hostAfter.turnToken).toBe(1); // turn token bumped on the accepted swap
  expect(hostAfter.currentTurnId).toBe(neighborId); // turn passes right

  // Neighbor's post-swap projection: now holds the HOST's former card AND sees the squirm signal.
  const neighborAfter = await nextTurn(neighborConn, neighborId);
  expect(neighborAfter.you.hand).toEqual(hostCardBefore); // neighbor received the host's former card
  expect(neighborAfter.justReceivedSwap).toBe(true); // value-free squirm flag for the receiver

  // SM-6 over the wire: neither device ever carries another seat's hand; exactly one "hand" key each.
  expect(JSON.stringify(hostAfter).split('"hand"').length - 1).toBe(1);
  expect(JSON.stringify(neighborAfter).split('"hand"').length - 1).toBe(1);
  // The non-receiver (P2) does NOT get the squirm flag.
  const p2After = await nextTurn(guests[1], neighborId);
  expect(p2After.justReceivedSwap ?? false).toBe(false);

  host.close();
  for (const g of guests) g.close();
});

test("AC-2.4.4: KEEP retains the caller's card and passes the turn right", async () => {
  const { host, created, guests } = await lobbyOf("KEEP", 2); // host(seat0) + P1(seat1)
  const { hostDealt, guestDealt } = await deal(host, created, guests);
  const hostCardBefore = hostDealt.you.hand;
  const neighborId = guestDealt[0].you.playerId;

  host.send({ type: "keep", payload: { turnToken: hostDealt.turnToken } });
  const hostAfter = await nextTurn(host, neighborId);
  expect(hostAfter.you.hand).toEqual(hostCardBefore); // unchanged — kept
  expect(hostAfter.currentTurnId).toBe(neighborId); // turn passed right
  expect(hostAfter.turnToken).toBe(1);
  expect(hostAfter.justReceivedSwap ?? false).toBe(false); // keep clears/sets no squirm

  host.close();
  for (const g of guests) g.close();
});

test("AC-2.4.3 (turn guard): a stale-token swap is rejected with stale-turn BEFORE any mutation; a valid one then advances", async () => {
  const { host, created, guests } = await lobbyOf("STAL", 2);
  const { hostDealt, guestDealt } = await deal(host, created, guests);
  const neighborId = guestDealt[0].you.playerId;
  // It IS the host's turn (currentTurnId === host), but the host sends a WRONG turnToken (the round's
  // token is 0). The turn-scoped guard mismatches and throws stale-turn — before any exchange/advance.
  expect(hostDealt.turnToken).toBe(0);
  host.send({ type: "swap", payload: { turnToken: 7 } });
  expect(await nextErrorReason(host)).toBe("stale-turn");

  // The round is unmutated by the stale swap: a subsequent VALID swap still carries token 0 and is
  // accepted, advancing to the neighbor with the token bumped to 1.
  host.send({ type: "swap", payload: { turnToken: 0 } });
  const after = await nextTurn(host, neighborId);
  expect(after.turnToken).toBe(1); // only the VALID swap advanced it — the stale one mutated nothing.
  expect(after.currentTurnId).toBe(neighborId);

  host.close();
  for (const g of guests) g.close();
});

test("AC-2.4 (turn-authority): a swap from a NON-active socket is refused with not-your-turn", async () => {
  const { host, created, guests } = await lobbyOf("NYTN", 3);
  const { hostDealt, guestDealt } = await deal(host, created, guests);
  // It is the HOST's turn; a guest (not the current-turn player) attempts to swap.
  guests[1].send({ type: "swap", payload: { turnToken: hostDealt.turnToken } });
  expect(await nextErrorReason(guests[1])).toBe("not-your-turn");
  void guestDealt;

  host.close();
  for (const g of guests) g.close();
});
