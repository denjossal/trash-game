// AC-2.3.4 (SM-4 / NFR-7) e2e — the fast-start measure: create → join → DEALT completes well under ~30s.
// Story 2.3 shipped only STRUCTURAL evidence (the DO test exercises the path with no human latency and
// asserts no sleep/poll), and deferred the real end-to-end timing to "manual play once the conductor Deal
// button lands (Story 4.1)". This spec measures the create→join→dealt round-trip over a REAL browser +
// real WebSockets + a live Worker/DO, end-to-end, and asserts it lands comfortably inside the activation
// window — turning the manual claim into a re-runnable gate (the server path imposes no blocking delay).
//
// WHAT IS MEASURED: from "begin creating the room" to "the browser is on the dealt YourTurn surface"
// (the moment a Player can act). driveBrowserToYourTurn() does exactly create → browser-joins-over-UI →
// deal → advance-to-the-browser's-turn, so timing it captures the full create→join→dealt path (spanning
// Stories 1.6 → 1.7 → 2.3, the ACs that own this window). This is MACHINE-paced (no human think time), so
// the budget is deliberately generous — we are proving the SERVER/transport path has no blocking stall,
// not benchmarking human speed. A regression that introduced a sleep/poll/timeout would blow this budget.
import { test, expect } from "@playwright/test";
import { driveBrowserToYourTurn } from "./helpers/table";

test.describe("AC-2.3.4 — fast-start (create → join → dealt)", () => {
  test("create → join → dealt completes well under the ~30s activation window", async ({ page }) => {
    // Start the clock at the very beginning of the create→join→deal flow.
    const start = Date.now();
    const { host } = await driveBrowserToYourTurn(page);
    // driveBrowserToYourTurn only resolves once the browser is on the dealt YourTurn surface (its
    // internal `await expect(peek).toBeVisible()`), so this elapsed time IS create→join→dealt→ready.
    const elapsedMs = Date.now() - start;

    // The NFR-7 budget is "well under ~30s" for the human-paced path; the machine-paced path should be a
    // small fraction of that. 15s is a generous ceiling that still fails loudly if a blocking stall is
    // ever introduced into the create/join/deal round-trip (the structural property Story 2.3 asserted).
    expect(elapsedMs).toBeLessThan(15_000);

    // Sanity: the round really is dealt + live (not a false-fast "reached an error surface"). The browser
    // is the Last Player on a dealt round → the aux host sees phase `turns` with a live turn token.
    expect((host.last as any)?.phase === "turns" || (host.last as any)?.phase === "allActed").toBe(true);

    host.close();
  });
});
