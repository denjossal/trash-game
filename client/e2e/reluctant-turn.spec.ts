// AC-2.4.5 (Pre-mortem C / NFR-8 / SM-5) e2e — the Reluctant-Player completes a Turn UNAIDED, the card
// re-hides cleanly, and the debounce prevents a double-fire. Story 2.4 shipped only STRUCTURAL evidence
// (the Button debounce unit test + a two-button-only surface) and deferred the genuine unaided
// peek→decide→act flow to "validated by play" because jsdom can't drive a real press-and-hold + tap on
// the live surface. This spec runs that full flow on a REAL browser against a live server.
//
// THE FLOW (heads-up; the browser is player 2 = the Last Player, whose action ends the one pass):
//   1. peek the own card (press-and-hold) → it reveals; release → it re-hides cleanly (no leak).
//   2. tap KEEP → the turn completes → the round transitions to `allActed` (observed on the aux host's
//      projection — the server-authoritative truth, not a client guess).
//
// DEBOUNCE (AC-2.4.5): a rapid double-tap of KEEP must commit EXACTLY ONCE. Two guards make this true and
// we assert the OUTCOME (one commit), not the mechanism: (a) Button.svelte swallows a second activation
// within DEBOUNCE_MS (350ms); (b) even if a second intent escaped, it carries the now-stale turnToken and
// the server rejects it `stale-turn` (swallowed silently, AC-2.2.3). Either way the round advances once.
//
// HOW "exactly once" IS OBSERVED OVER THE WIRE: the projection does NOT expose `acted` (a server-only
// round field). It DOES expose `turnToken` — each ACCEPTED turn action bumps it by one (bumpTurnToken).
// So a single committed KEEP advances `turnToken` by exactly 1; a swallowed/stale second tap does not
// bump again. We capture the token before the taps and assert it advanced by exactly 1.
import { test, expect } from "@playwright/test";
import { driveBrowserToYourTurn } from "./helpers/table";

test.describe("AC-2.4.5 — Reluctant-Player completes a turn unaided", () => {
  test("peek (hold→release, clean re-hide) then KEEP completes the one pass", async ({ page }) => {
    const { host } = await driveBrowserToYourTurn(page);
    const peek = page.getByRole("button", { name: /peek/i });
    const keep = page.getByRole("button", { name: /^keep$/i });

    // The whole turn surface is the two-button hero + peek — nothing else competes (NFR-9). SWAP/KEEP
    // are the first two focus stops; peek follows. (A reluctant player isn't hunting for controls.)
    await expect(keep).toBeVisible();
    await expect(page.getByRole("button", { name: /^swap$/i })).toBeVisible();

    // 1) Peek: press-and-hold reveals; release re-hides cleanly (no persistent exposure).
    await expect(peek).toHaveAttribute("aria-pressed", "false");
    await peek.dispatchEvent("pointerdown");
    await expect(peek).toHaveAttribute("aria-pressed", "true");
    await peek.dispatchEvent("pointerup");
    await expect(peek).toHaveAttribute("aria-pressed", "false");

    // 2) Decide → KEEP. The browser is the Last Player, so this is the final turn of the one pass →
    //    the server transitions the round to `allActed` (the Epic-3 handoff). Observed on the aux host.
    await keep.click();
    const completed = await host.waitFor(() => (host.last as any)?.phase === "allActed");
    expect(completed).toBe(true);

    host.close();
  });

  test("a rapid double-tap of KEEP commits exactly once (debounce / stale-turn)", async ({ page }) => {
    const { host } = await driveBrowserToYourTurn(page);
    const keep = page.getByRole("button", { name: /^keep$/i });

    // The turn token BEFORE the browser acts (the aux host mirrors this round-scoped field). A single
    // accepted turn action bumps it by exactly 1; a swallowed/stale second tap does not bump again.
    const tokenBefore = (host.last as any)?.turnToken as number;
    expect(typeof tokenBefore).toBe("number");

    // Fire TWO native clicks SYNCHRONOUSLY in one browser tick on the SAME element handle. This is the
    // genuine double-fire the Button.svelte debounce defends against: the second click() runs before any
    // await / surface transition, so both hit the live button — the debounce lock must swallow the
    // second. (Driving two separate Playwright clicks can't reproduce this: the first commit transitions
    // the surface and detaches the button before the second locator resolves.)
    await keep.evaluate((el: HTMLButtonElement) => {
      el.click();
      el.click();
    });

    // The pass completes (browser is the Last Player) → `allActed`, and the active seat is cleared.
    const completed = await host.waitFor(() => (host.last as any)?.phase === "allActed");
    expect(completed).toBe(true);

    // EXACTLY ONE commit: the turn token advanced by precisely 1 (not 2). A double-commit would have
    // bumped it twice. Give the wire a beat to settle in case a stale second intent round-tripped.
    await page.waitForTimeout(500);
    const tokenAfter = (host.last as any)?.turnToken as number;
    expect(tokenAfter).toBe(tokenBefore + 1);

    // And the active seat is cleared on completion (the router-leak fix from Story 2.6) — no phantom turn.
    expect((host.last as any)?.currentTurnId).toBe("");

    host.close();
  });
});
