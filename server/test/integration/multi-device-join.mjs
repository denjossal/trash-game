// Activation-gate integration test (Story 1.7, AC-1.7.4 / SM-4) — the single biggest pre-mortem
// finding: the activation gate is a MULTI-DEVICE-CONCURRENCY property, not a single-device unit test.
//
// WHY THIS IS NOT A vitest-pool-workers TEST: the `do` pool project cannot drive TRUE wall-clock-
// concurrent WebSocket upgrades + the fan-out timing across independent sockets (see server/vitest.config.ts
// + the table-server.do.test.ts concurrency note). This harness drives ~6 REAL concurrent WebSocket
// clients (Node's global WebSocket — no new dependency) against a running `wrangler dev`.
//
// IT IS NOT NAMED *.test.ts / *.do.test.ts ON PURPOSE: those suffixes would run it under the vitest
// projects (where it cannot work). It is a standalone script with its own runner so it never masquerades
// as covered (deferred-work #31 — the silent-zero-coverage trap). It exits non-zero on any failure.
//
// HOW TO RUN (manual two-step — `wrangler dev` must be live first):
//   1. In one terminal:  npm run dev --workspace=server      (starts wrangler dev, default :8787)
//   2. In another:       npm run test:integration --workspace=server
//      (override the target with TRASH_WS_URL, e.g. TRASH_WS_URL=ws://127.0.0.1:8787)
//
// COVERAGE (logged at the end so nothing is silently skipped):
//   - AC-1.7.4: 6 devices join one Table within ~30s; EVERY device's final roster shows all 6 players,
//     correct seatIndex order, no stale lobby anywhere.
//   - AC-1.7.3: a leave propagates isConnected:false to every remaining device live.
//   - deferred-work #24: partyserver kebab-case routing — /parties/table/<code> routes; the wrong-cased
//     /parties/Table/<code> does NOT upgrade (404), proving the lowercased-binding requirement.

const WS_URL = (process.env.TRASH_WS_URL ?? "ws://127.0.0.1:8787").replace(/\/$/, "");
const DEVICES = 6;
const SETTLE_MS = 1500; // allow fan-outs to propagate to every socket before asserting.

let failures = 0;
function check(label, cond) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}`);
  }
}

/** A device: an open WebSocket that records the LATEST tableState it has seen (the live roster). */
function openDevice(code) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_URL}/parties/table/${code}`);
    const device = { ws, code, last: null, error: null };
    const timer = setTimeout(() => reject(new Error(`device timed out connecting to ${code}`)), 10_000);
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      resolve(device);
    });
    ws.addEventListener("message", (ev) => {
      const event = JSON.parse(ev.data);
      if (event.type === "tableState") device.last = event.payload;
      else if (event.type === "error") device.error = event.payload.reason;
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error(`device socket error connecting to ${code}`));
    });
  });
}

function send(device, intent) {
  device.ws.send(JSON.stringify(intent));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wait until `predicate(device)` holds or the budget elapses (live-update window, NFR activation gate). */
async function waitFor(predicate, budgetMs = 30_000, stepMs = 100) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(stepMs);
  }
  return false;
}

async function main() {
  const code = randomCode();
  console.log(`Activation gate: ${DEVICES} devices → /parties/table/${code} (target ${WS_URL})`);

  // --- Device 0 creates; devices 1..5 join, all within the activation window. ---
  const host = await openDevice(code);
  send(host, { type: "createRoom", payload: { name: "Host" } });
  await waitFor(() => host.last && host.last.players.length === 1);

  const guests = [];
  for (let i = 1; i < DEVICES; i++) {
    const g = await openDevice(code);
    send(g, { type: "joinRoom", payload: { code, name: `Device${i}` } });
    guests.push(g);
  }
  const all = [host, ...guests];

  // --- AC-1.7.4: every device's roster converges to all 6 players, correct seat order, no stale lobby. ---
  const converged = await waitFor(() => all.every((d) => d.last && d.last.players.length === DEVICES));
  check(`all ${DEVICES} devices see a full roster (no stale lobby)`, converged);

  await sleep(SETTLE_MS);
  for (const d of all) {
    const seats = (d.last?.players ?? []).map((p) => p.seatIndex);
    const sorted = [...seats].sort((a, b) => a - b);
    const contiguous = sorted.every((s, i) => s === i) && sorted.length === DEVICES;
    check(`device ${d.last?.you?.playerId?.slice(0, 8) ?? "?"} sees contiguous seats 0..${DEVICES - 1}`, contiguous);
  }
  // Exactly one device reports isHost on its own projection (the creator); none of the guests do.
  const hostsSeen = all.filter((d) => d.last?.you?.isHost).length;
  check("exactly one device's own projection is isHost", hostsSeen === 1);

  // --- AC-1.7.3: a leave flips isConnected:false on every remaining device, live. ---
  const leaver = guests[guests.length - 1];
  const leaverId = leaver.last.you.playerId;
  leaver.ws.close();
  const remaining = all.filter((d) => d !== leaver);
  const presencePropagated = await waitFor(() =>
    remaining.every((d) => {
      const rec = d.last?.players.find((p) => p.id === leaverId);
      return rec && rec.isConnected === false;
    }),
  );
  check("a leave propagates isConnected:false to every remaining device", presencePropagated);
  await sleep(SETTLE_MS);
  for (const d of remaining) {
    const rec = d.last?.players.find((p) => p.id === leaverId);
    check(`device sees leaver alive-but-disconnected (seat retained)`, !!rec && rec.isAlive === true && rec.isConnected === false);
  }
  check("the seat is retained (roster still full length)", remaining.every((d) => d.last?.players.length === DEVICES));

  // --- deferred-work #24: kebab-case routing. Correct case routed (above). Wrong case must NOT upgrade. ---
  const wrongCaseRefused = await new Promise((resolve) => {
    const ws = new WebSocket(`${WS_URL}/parties/Table/${code}`); // capital T — wrong binding namespace.
    const timer = setTimeout(() => {
      ws.close();
      resolve(false); // opened (unexpected) or hung — treat as not-refused.
    }, 5000);
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      ws.close();
      resolve(false); // a successful upgrade on the wrong case would be a routing regression.
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      resolve(true); // refused (404 / no upgrade) — the lowercased-binding requirement holds.
    });
  });
  check("wrong-cased /parties/Table/<code> is refused (kebab-case routing — deferred-work #24)", wrongCaseRefused);

  for (const d of all) {
    try {
      d.ws.close();
    } catch {
      /* already closed */
    }
  }

  console.log(
    `\nCoverage: AC-1.7.4 (6-device live roster), AC-1.7.3 (leave→presence), deferred-work #24 (routing).`,
  );
  if (failures > 0) {
    console.error(`\n${failures} assertion(s) FAILED.`);
    process.exit(1);
  }
  console.log("\nAll activation-gate assertions passed.");
  process.exit(0);
}

function randomCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ"; // ambiguity-safe (mirrors @trash/shared ROOM_CODE_ALPHABET).
  let code = "";
  for (let i = 0; i < 4; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

main().catch((err) => {
  console.error("Integration harness crashed (is `wrangler dev` running on the target URL?):", err.message);
  process.exit(1);
});
