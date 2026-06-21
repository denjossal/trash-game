// table-server-deal.do.test.ts — the END-TO-END deal wire path (Story 2.3). Runs in the `do` /
// @cloudflare/vitest-pool-workers project (real Workers runtime + real ctx.storage + a genuine
// WebSocket upgrade through the Worker fetch → routePartykitRequest → TableServer DO). Drives the
// actual onConnect/onMessage → dispatch → handleDeal → fanOut path, not an RPC shortcut.
//
// What this pins (AC-2.3.1/.2/.3 + the persist boundary):
//   - a Host deals → every device transitions to `turns` TOGETHER (fan-out), each seeing ONLY its own
//     Card (others' hands omitted — SM-6), currentTurnId === host (first-round Starting Player rule).
//   - a SECOND (now-stale) `deal` is rejected with `stale-phase`; no second deal mutates the round.
//   - a non-Host `deal` is refused with `not-host`.
//   - the persisted "table" key holds phase:"turns" + the BUMPED phaseToken; `round` is never persisted.
// [Source: epics.md#Story 2.3 545–567; table-server.do.test.ts openConn harness; persistence.ts D2/D2.1.]
import { SELF, env, runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import { MIN_PLAYERS } from "@trash/shared";
import type { ProjectedTableState, ServerEvent } from "@trash/shared";

type ServerEventMessage = ServerEvent;

/** An open, accepted WebSocket to /parties/table/<code> with a small buffered event reader. Stays open
 *  until close() — so a host socket can observe the fan-out triggered by its own deal. (Mirrors the
 *  openConn harness in table-server.do.test.ts.) */
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

/**
 * Read tableState events off a connection until one reaches the wanted phase, returning it. Under
 * WebSocket Hibernation the join fan-outs to each socket are staggered/interleaved, so a socket may
 * have several buffered `lobby` projections queued ahead of its `turns` one — draining "one event per
 * join" desyncs at scale. Reading-until-phase removes that delivery-timing coupling (the same lesson as
 * the 1.7 concurrency test, which polls the durable roster instead of counting events).
 */
async function nextPhase(conn: OpenConn, phase: ProjectedTableState["phase"], tries = 10): Promise<ProjectedTableState> {
  for (let i = 0; i < tries; i++) {
    const view = asTableState(await conn.next());
    if (view.phase === phase) return view;
  }
  throw new Error(`never saw a tableState with phase ${phase} after ${tries} events`);
}

/** Read events until an `error` arrives (skipping any buffered tableState fan-outs queued ahead of it),
 *  and return its reason. Same delivery-timing robustness as nextPhase, for error-expecting cases. */
async function nextErrorReason(conn: OpenConn, tries = 10): Promise<string> {
  for (let i = 0; i < tries; i++) {
    const ev = await conn.next();
    if (ev.type === "error") return (ev as Extract<ServerEvent, { type: "error" }>).payload.reason;
  }
  throw new Error(`never saw an error event after ${tries} events`);
}

/** Set up a host + (n-1) guests in lobby; return the open host conn + the created projection + guests.
 *  Buffered join fan-outs are left on each socket — callers use nextPhase() to skip past them. */
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
  // Wait until the durable roster shows every seat before dealing (the join commits are the source of
  // truth; event delivery is staggered under hibernation). [1.7 concurrency-test polling pattern.]
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

test("AC-2.3.1/.2/.3: a Host deal moves every device to `turns` together; each sees ONLY its own Card; Host starts", async () => {
  const { host, created, guests } = await lobbyOf("DEAL", 3); // host + 2 guests
  expect(created.phase).toBe("lobby");
  expect(created.phaseToken).toBe(0);

  // The Host deals carrying the current phaseToken (0).
  host.send({ type: "deal", payload: { phaseToken: created.phaseToken } });

  // Host's own dealt projection: phase turns, own card present, others omitted, currentTurn = host.
  const hostView = await nextPhase(host, "turns");
  expect(hostView.phaseToken).toBe(1); // bumped from 0 on the accepted deal.
  expect(hostView.you.hand).toBeDefined(); // the Host's OWN secret card.
  expect(hostView.currentTurnId).toBe(created.you.playerId); // Host is first-round Starting Player.
  expect(hostView.turnToken).toBe(0); // fresh round.
  // No other seat carries a hand while hidden.
  for (const p of hostView.players) expect("hand" in p).toBe(false);

  // Each guest also transitions (the simultaneous fan-out) and sees ONLY its own card.
  for (const g of guests) {
    const gv = await nextPhase(g, "turns");
    expect(gv.you.hand).toBeDefined(); // its OWN card
    expect(gv.currentTurnId).toBe(created.you.playerId); // host starts (same on every device)
    for (const p of gv.players) expect("hand" in p).toBe(false); // no leaked hands
  }

  // SM-6 over the wire: the host's serialized projection contains exactly ONE hand (its own).
  const serialized = JSON.stringify(hostView);
  // crude structural check: only one "hand" key in the whole payload (you.hand), none on players[].
  const handKeys = serialized.split('"hand"').length - 1;
  expect(handKeys).toBe(1);

  host.close();
  for (const g of guests) g.close();
});

test("AC-2.3.1: a double-tapped (stale-token) deal is rejected with stale-phase; no second deal", async () => {
  const { host, created } = await lobbyOf("DBL2", 2); // host + 1 guest
  host.send({ type: "deal", payload: { phaseToken: created.phaseToken } });
  const firstDeal = await nextPhase(host, "turns");
  expect(firstDeal.phaseToken).toBe(1);

  // The Host double-taps with the OLD token (0) — the server already bumped to 1, so this mismatches
  // the now-bumped phase token (checked BEFORE the phase-legality gate, so it surfaces as stale-phase).
  host.send({ type: "deal", payload: { phaseToken: 0 } });
  expect(await nextErrorReason(host)).toBe("stale-phase");

  // The durable summary is unchanged by the rejected double-tap: still phase:"turns", token 1, round
  // never persisted.
  const stub = env.Table.get(env.Table.idFromName("DBL2"));
  const persisted = await runInDurableObject(stub, async (_instance, state) =>
    state.storage.get<Record<string, unknown>>("table"),
  );
  expect(persisted?.phase).toBe("turns");
  expect(persisted?.phaseToken).toBe(1);
  expect("round" in (persisted ?? {})).toBe(false); // round is memory-only (AC-2.2.5)

  host.close();
});

test("AC-2.3 (host-authority): a non-Host deal is refused with not-host; no deal happens", async () => {
  const { host, created, guests } = await lobbyOf("NHDL", 2);
  // A guest (non-Host) attempts to deal → refused to THAT connection only.
  guests[0].send({ type: "deal", payload: { phaseToken: created.phaseToken } });
  expect(await nextErrorReason(guests[0])).toBe("not-host");

  // Still in lobby — the guest's illegal deal mutated nothing.
  const stub = env.Table.get(env.Table.idFromName("NHDL"));
  const persisted = await runInDurableObject(stub, async (_instance, state) =>
    state.storage.get<{ phase: string; phaseToken: number }>("table"),
  );
  expect(persisted?.phase).toBe("lobby");
  expect(persisted?.phaseToken).toBe(0);

  host.close();
  guests[0].close();
});

test("AC-2.3.1: dealing with only 1 Player (below MIN_PLAYERS) is refused with phase-illegal", async () => {
  const host = await openConn("SOLO");
  host.send({ type: "createRoom", payload: { name: "Lonely" } });
  const created = asTableState(await host.next());
  expect(created.players).toHaveLength(1);
  expect(MIN_PLAYERS).toBe(2); // documents the threshold the server enforces.

  host.send({ type: "deal", payload: { phaseToken: created.phaseToken } });
  expect(await nextErrorReason(host)).toBe("phase-illegal");

  host.close();
});

test("AC-2.3.4 (fast-start structural evidence): create → join×5 → deal completes with no blocking delay", async () => {
  // SM-4 / NFR-7 is a human-paced "well under ~30s" measure validated by manual play once the conductor
  // Deal button lands (Story 4.1). Here we exercise the SERVER path end-to-end — a 6-seat table (host +
  // 5 joiners) created and dealt over real sockets — and assert it completes near-instantly in-test. The
  // structural evidence: the create→join→dealt round-trip has no sleep / poll / timeout on the path; one
  // DO turn per intent + a single fan-out at deal. (No wall-clock assertion — that would be flaky.)
  const { host, created, guests } = await lobbyOf("FAST", 6);
  expect(created.players).toHaveLength(1);

  host.send({ type: "deal", payload: { phaseToken: created.phaseToken } });
  const dealt = await nextPhase(host, "turns");
  expect(dealt.players).toHaveLength(6); // all six seated and dealt.
  expect(dealt.you.hand).toBeDefined();

  // Every guest got its dealt projection too (the simultaneous transition).
  for (const g of guests) {
    const gv = await nextPhase(g, "turns");
    expect(gv.you.hand).toBeDefined();
  }

  host.close();
  for (const g of guests) g.close();
});
