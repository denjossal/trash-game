// Story 7.3 e2e — with Spanish selected, a peeked card face + its SR announce read in Spanish, in a
// REAL browser. Sets the device language to "es" (the toggle's localStorage key) BEFORE the app loads,
// then drives to YourTurn and peeks; asserts the SR announce region speaks Spanish (As/Jota/Reina/Rey,
// "de", Spanish suit). The face GLYPH for the King is "R" (Rey) — but the dealt rank is random, so we
// assert on the copy-independent, deterministic SR speech of the OWN card rather than a specific glyph.
import { test, expect } from "@playwright/test";
import { driveBrowserToYourTurn } from "./helpers/table";

test("Spanish device: the peeked own-card announce is in Spanish (de + Spanish suit)", async ({ page }) => {
  // Seed the per-device language before any navigation so the app boots in Spanish.
  await page.addInitScript(() => localStorage.setItem("trash.language", "es"));

  const { host } = await driveBrowserToYourTurn(page);
  const peek = page.getByRole("button", { name: /peek/i });
  const region = page.getByTestId("peek-announce");

  await peek.dispatchEvent("pointerdown");
  // The announce is "<rank> de <suit>" in Spanish. Assert the Spanish connector + a Spanish suit name —
  // both are language-determined (not rank-determined), so this holds for whatever card was dealt.
  await expect(region).toHaveText(/\bde\b/);
  await expect(region).toHaveText(/picas|corazones|diamantes|tréboles/);
  // And it is NOT the English form ("of <english suit>").
  await expect(region).not.toHaveText(/\bof\b/);

  await peek.dispatchEvent("pointerup");
  host.close();
});
