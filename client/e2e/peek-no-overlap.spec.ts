// Layout regression gate (code-review 6.1): the peek card must NOT overlap / intercept taps on the
// SWAP/KEEP hero (YourTurn), and the off-turn peek must work on the Waiting surface. jsdom can't catch
// an overflow-overlap, so this drives the REAL client on the Pixel-7 mobile viewport — where, during the
// 6.1 work, a mis-ordered peek block once covered the hero and swallowed every tap. Playwright's
// actionability check (no `force`) fails a click if another element intercepts the pointer at the
// target's center — exactly the overlap symptom — so a plain `.click()` is the assertion.
import { test, expect } from "@playwright/test";
import { driveBrowserToWaiting, driveBrowserToYourTurn } from "./helpers/table";

test("YourTurn: SWAP/KEEP are not overlapped by the peek card; KEEP commits the turn", async ({ page }) => {
  const { host } = await driveBrowserToYourTurn(page);

  const swap = page.getByRole("button", { name: /^swap$/i });
  const keep = page.getByRole("button", { name: /^keep$/i });
  await expect(swap).toBeVisible();
  await expect(keep).toBeVisible();

  // No `force`: fails if the peek card (or anything) intercepts the pointer at KEEP's center.
  await keep.click({ timeout: 5000 });

  // KEEP committed → the browser (player 2 / Last Player, heads-up) acted → the pass completes and the
  // YourTurn hero is gone. This only happens if the tap actually landed on the button.
  await expect(keep).toBeHidden({ timeout: 15_000 });

  host.close();
});

test("Waiting: the off-turn peek (shared <Peek>) reveals on press-and-hold and re-hides on release", async ({ page }) => {
  const { host } = await driveBrowserToWaiting(page);

  // It is NOT the browser's turn → no SWAP/KEEP hero, just the calm name + the peek affordance.
  await expect(page.getByRole("button", { name: /^swap$/i })).toHaveCount(0);

  const peek = page.getByRole("button", { name: /peek/i });
  await expect(peek).toBeVisible();
  await expect(peek).toHaveAttribute("aria-pressed", "false");
  await peek.dispatchEvent("pointerdown");
  await expect(peek).toHaveAttribute("aria-pressed", "true");
  await peek.dispatchEvent("pointerup");
  await expect(peek).toHaveAttribute("aria-pressed", "false");

  host.close();
});
