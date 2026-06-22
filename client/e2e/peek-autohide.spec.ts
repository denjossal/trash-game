// AC-2.5.2 (+ AC-2.5.1) e2e — peek press-and-hold reveal + auto-hide on the BROWSER-ONLY events that
// jsdom cannot drive: `visibilitychange` (app backgrounded / tab switch) and `pagehide` (navigate away /
// suspend), plus the control's `blur`. Story 2.5 unit-tested only `blur` (jsdom-reliable) and recorded
// a six-point MANUAL checklist for the rest; this spec converts that checklist into a re-runnable gate.
//
// "A phone set down never exposes a hand." (UX-DR7 / NFR-10 — the privacy intent behind auto-hide.)
//
// HOW REVEAL IS OBSERVED: Card.svelte renders the rank face (via rankToLetter) ONLY inside {#if revealed}
// — so the rank glyph is PRESENT in the DOM while revealed and ABSENT when hidden (the same a11y-tree-
// absent guarantee 2.5 leans on). We assert on the peek control's aria-pressed state (the unambiguous,
// copy-independent reveal signal) rather than a specific letter, since the dealt card's rank is random.
import { test, expect } from "@playwright/test";
import { driveBrowserToYourTurn } from "./helpers/table";

test.describe("AC-2.5.2 — peek auto-hide (browser-only events)", () => {
  test("press-and-hold reveals; release re-hides immediately (AC-2.5.1)", async ({ page }) => {
    const { host } = await driveBrowserToYourTurn(page);
    const peek = page.getByRole("button", { name: /peek/i });

    // Hidden by default.
    await expect(peek).toHaveAttribute("aria-pressed", "false");

    // Press-and-hold → revealed.
    await peek.dispatchEvent("pointerdown");
    await expect(peek).toHaveAttribute("aria-pressed", "true");

    // Release → re-hides immediately (no timer, no pin).
    await peek.dispatchEvent("pointerup");
    await expect(peek).toHaveAttribute("aria-pressed", "false");

    host.close();
  });

  test("backgrounding the app (visibilitychange → hidden) auto-hides a held peek", async ({ page }) => {
    const { host } = await driveBrowserToYourTurn(page);
    const peek = page.getByRole("button", { name: /peek/i });

    await peek.dispatchEvent("pointerdown");
    await expect(peek).toHaveAttribute("aria-pressed", "true");

    // Simulate the phone being set down / the tab being switched: document becomes hidden and fires
    // visibilitychange. (Playwright can't truly background a tab, but the client listens for exactly
    // this event — so we drive the real listener the way a real backgrounding would.)
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await expect(peek).toHaveAttribute("aria-pressed", "false");
    host.close();
  });

  test("pagehide (navigate away / suspend) auto-hides a held peek", async ({ page }) => {
    const { host } = await driveBrowserToYourTurn(page);
    const peek = page.getByRole("button", { name: /peek/i });

    await peek.dispatchEvent("pointerdown");
    await expect(peek).toHaveAttribute("aria-pressed", "true");

    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));

    await expect(peek).toHaveAttribute("aria-pressed", "false");
    host.close();
  });

  test("losing focus (blur) auto-hides a held peek", async ({ page }) => {
    const { host } = await driveBrowserToYourTurn(page);
    const peek = page.getByRole("button", { name: /peek/i });

    await peek.focus();
    await peek.dispatchEvent("pointerdown");
    await expect(peek).toHaveAttribute("aria-pressed", "true");

    await peek.blur();
    await expect(peek).toHaveAttribute("aria-pressed", "false");
    host.close();
  });
});
