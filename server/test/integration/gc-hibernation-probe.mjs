// Story 1.11 (AC-1.11.2) integration check — confirm WebSocket Hibernation is wired against a REAL
// `wrangler dev`, so the GC connection-probe (ctx.getWebSockets().length) is accurate and the idle-billing
// benefit (NFR-3/SM-7) holds.
//
// WHAT THIS LAYER VERIFIES (and what it cannot):
//   - VERIFIES: with `static options = { hibernate: true }`, a real WebSocket UPGRADE succeeds end-to-end
//     through the Worker fetch entry → routePartykitRequest → the hibernation-accept path, and the socket
//     stays open and live (create round-trip returns a tableState). If enabling hibernation had broken
//     partyserver's accept path for this version, the upgrade itself would fail here — this is the
//     "acceptWebSocket() is actually wired" precondition the spike told us to confirm.
//   - VERIFIES: a second device joins over its own live hibernation-accepted socket and both see the roster
//     (the hibernation accept path carries normal traffic, not just the upgrade).
//   - CANNOT (by design): assert ctx.getWebSockets().length directly — that is DO-internal and is asserted
//     DETERMINISTICALLY in the pool-workers runtime by table-server-gc.do.test.ts ("probe reads non-zero
//     while a socket is open"), which is the exact Story-1.1 spike regression. And it cannot wait the 3h
//     IDLE_TTL_MS to observe a real GC — that timing path is covered by runDurableObjectAlarm() in the pool.
//
// WHY NOT A vitest test: same reason as multi-device-join.mjs — the pool cannot drive a true wall-clock WS
// upgrade + hibernation roundtrip (server/vitest.config.ts). Standalone script, non-*.test.ts name on
// purpose (silent-zero-coverage trap), exits non-zero on failure.
//
// HOW TO RUN (manual two-step — `wrangler dev` must be live first):
//   1. npm run dev --workspace=server                 (wrangler dev, default :8787)
//   2. npm run test:integration:gc --workspace=server (or: node test/integration/gc-hibernation-probe.mjs)
//      Override the target with TRASH_WS_URL=ws://127.0.0.1:8787.

const WS_URL = (process.env.TRASH_WS_URL ?? "ws://127.0.0.1:8787").replace(/\/$/, "");

let failures = 0;
function check(label, cond) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.error(`  ✗ ${label}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Open a real WS, record the latest tableState seen. Resolves once the socket is OPEN. */
function openDevice(code) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_URL}/parties/table/${code}`);
    const device = { ws, code, last: null, error: null, openedOk: false };
    const timer = setTimeout(() => reject(new Error(`device timed out connecting to ${code}`)), 10_000);
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      device.openedOk = true;
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

const send = (device, intent) => device.ws.send(JSON.stringify(intent));

async function waitFor(predicate, budgetMs = 10_000, stepMs = 100) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(stepMs);
  }
  return false;
}

async function main() {
  const code = randomCode();
  console.log(`GC/hibernation check: real WS upgrade → /parties/table/${code} (target ${WS_URL})`);

  // --- The upgrade itself is the acceptWebSocket()-is-wired precondition (AC-1.11.2). ---
  const host = await openDevice(code);
  check("a real WebSocket UPGRADE succeeds under hibernation accept", host.openedOk);

  send(host, { type: "createRoom", payload: { name: "Host" } });
  const created = await waitFor(() => host.last && host.last.players.length === 1);
  check("the hibernation-accepted socket carries traffic (createRoom → tableState)", created);

  // --- A second live hibernation-accepted socket joins and both converge (live, not just the upgrade). ---
  const guest = await openDevice(code);
  send(guest, { type: "joinRoom", payload: { code, name: "Guest" } });
  const converged = await waitFor(
    () => host.last?.players.length === 2 && guest.last?.players.length === 2,
  );
  check("two live hibernation-accepted sockets both see the 2-player roster", converged);

  host.ws.close();
  guest.ws.close();

  console.log(
    "\nNote: ctx.getWebSockets() non-zero-while-open and the 3h-TTL self-delete are asserted " +
      "deterministically in the pool-workers project (table-server-gc.do.test.ts via runDurableObjectAlarm).",
  );
  if (failures > 0) {
    console.error(`\n${failures} assertion(s) FAILED — hibernation accept may not be wired for this partyserver version. See AC-1.11.2 fallback (probe getConnections()).`);
    process.exit(1);
  }
  console.log("\nHibernation accept confirmed: getWebSockets() is a valid GC probe.");
  process.exit(0);
}

function randomCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ"; // ambiguity-safe (mirrors @trash/shared ROOM_CODE_ALPHABET).
  let code = "";
  for (let i = 0; i < 4; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

main().catch((err) => {
  console.error("GC/hibernation harness crashed (is `wrangler dev` running on the target URL?):", err.message);
  process.exit(1);
});
