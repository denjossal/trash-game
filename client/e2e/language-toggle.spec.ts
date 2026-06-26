// Story 7.2 e2e — the language toggle on Home, in a REAL browser: it renders before the Room Code,
// switching sets the pressed state + persists to localStorage, and the choice survives a reload. (The
// Spanish COPY itself is Stories 7.3/7.4 — until then `es` mirrors English, so we assert the toggle
// state + persistence, not a visible text swap.)
import { test, expect } from "@playwright/test";

test("Home language toggle: switch to Español, persists across reload", async ({ page }) => {
  await page.goto("/");

  const group = page.getByRole("group", { name: /language/i });
  await expect(group).toBeVisible(); // present on the first screen, before any Room Code entry

  const en = page.getByRole("button", { name: /english/i });
  const es = page.getByRole("button", { name: /español/i });
  await expect(en).toHaveAttribute("aria-pressed", "true"); // English by default
  await expect(es).toHaveAttribute("aria-pressed", "false");

  // Switch to Español → pressed state moves immediately (the store is reactive).
  await es.click();
  await expect(es).toHaveAttribute("aria-pressed", "true");
  await expect(en).toHaveAttribute("aria-pressed", "false");

  // Persisted to localStorage (device-local; sends nothing).
  const stored = await page.evaluate(() => localStorage.getItem("trash.language"));
  expect(stored).toBe("es");

  // Returning device: reload restores the choice from localStorage.
  await page.reload();
  await expect(page.getByRole("button", { name: /español/i })).toHaveAttribute("aria-pressed", "true");
});
