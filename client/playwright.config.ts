// Playwright e2e config — the Epic 2 → Epic 3 GATE (Epic 2 retro 2026-06-22, action 3).
//
// WHY THIS EXISTS: three Epic 2 ACs are "validated by play / manual-confirmed" with no re-runnable
// home — AC-2.5.2 (peek auto-hides on background/tab-switch/navigate-away — non-deterministic in
// jsdom), AC-2.4.5 (Reluctant-Player completes a turn unaided + debounce), AC-2.3.4 (fast-start).
// jsdom cannot drive real `visibilitychange`/`pagehide`/pointer-hold; a real browser can. This harness
// turns those manual checklists into regression-protected e2e cases against the REAL client + a live
// `wrangler dev` server. (The Epic 1 multi-device activation gate is already covered, browser-free, by
// server/test/integration/multi-device-join.mjs — Playwright is justified by the BROWSER-only client ACs.)
//
// LEAN-DEPENDENCY POSTURE (Epic 0 / Gate G2 — $0, no paid dep): Playwright is free + dev-only (it does
// not ship to the Worker/Pages runtime, so G2 holds). We install CHROMIUM ONLY (the mobile-portrait PWA
// target) to keep the footprint small — see `projects` below.
//
// NOT IN `npm test`: this is a separately-invoked gate (`npm run test:e2e --workspace=client`), never
// folded into the unit/DO suite — same discipline as the .mjs integration harnesses (deferred-work #31:
// nothing masquerades as covered). It boots its own servers via `webServer` so there's no manual dance.
import { defineConfig, devices } from "@playwright/test";

// The Vite dev server the browser loads. Vite picks 5173 by default; pin it so VITE_WS_URL + baseURL agree.
const CLIENT_PORT = 5173;
// `wrangler dev` default. The client talks to it over WS (VITE_WS_URL); the spec also opens raw aux
// sockets here to drive setup intents (join a 2nd player + host `deal`) the Deal button can't yet send
// (the conductor Deal button is Story 4.1 — not built in Epic 2).
const SERVER_PORT = 8787;

export default defineConfig({
  testDir: "./e2e",
  // Phone-first game: fail fast locally, retry once on CI for socket-timing flakes.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Sockets + a real DO have non-trivial setup latency; keep the per-test budget generous but bounded.
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: process.env.CI ? "github" : "list",
  use: {
    // `localhost` (NOT 127.0.0.1): Vite's dev server binds to `localhost` only (it prints
    // "Network: use --host to expose"), which on some machines resolves to ::1 (IPv6) while 127.0.0.1
    // is refused. Matching the host Vite actually binds keeps the browser nav reliable cross-machine.
    baseURL: `http://localhost:${CLIENT_PORT}`,
    trace: "on-first-retry",
  },
  // Chromium only (lean posture). Mobile-portrait viewport — the real target form factor (UX-DR17).
  projects: [
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 7"] },
    },
  ],
  // Boot BOTH servers for the run. `wrangler dev` first (the WS authority), then `vite` with
  // VITE_WS_URL pointed at it so the real client connects to the real Worker + Durable Object.
  webServer: [
    {
      command: "npm run dev --workspace=server",
      cwd: "..",
      // PORT (not url) readiness: `wrangler dev` only does WebSocket upgrades on /parties/* — every plain
      // GET (incl. "/") returns 404, so a `url` probe would never see a 2xx/3xx and would time out. A
      // port check just waits for the TCP listener, which is the right readiness signal for a WS server.
      port: SERVER_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "npm run dev",
      env: { VITE_WS_URL: `ws://127.0.0.1:${SERVER_PORT}` },
      port: CLIENT_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
