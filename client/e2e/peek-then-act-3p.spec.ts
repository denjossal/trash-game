// Regression guard (playtest 2026-06-25 report: "3 players, peek first, then SWAP/KEEP does nothing").
// That turned out to be a stale-Vite-HMR artifact during active editing — NOT a code defect (the live
// deploy and a fresh build both work) — but the peek→act path on a MIDDLE player had no automated
// coverage, so pin it. Builds the exact 3-player topology: two aux players (seats 0 and 2) + the browser
// (seat 1, a MIDDLE player — NOT the Last Player, so no Draw button). Host keeps → it is the browser's
// turn. The browser peeks (real TOUCH press-and-hold + release, which triggers the implicit pointer
// capture that dispatchEvent does not), then taps KEEP. Assert the turn commits (the aux host sees
// turnToken advance — the turn passed right to seat 2).
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

const SERVER_PORT = 8787;
const WS_URL = `ws://127.0.0.1:${SERVER_PORT}`;
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";

function randomCode(): string {
  let code = "";
  for (let i = 0; i < 4; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return code;
}

class Aux {
  ws: WebSocket;
  last: any = null;
  private constructor(ws: WebSocket) {
    this.ws = ws;
  }
  static open(code: string): Promise<Aux> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${WS_URL}/parties/table/${code}`);
      const aux = new Aux(ws);
      const t = setTimeout(() => reject(new Error("aux connect timeout")), 10_000);
      ws.addEventListener("open", () => {
        clearTimeout(t);
        resolve(aux);
      });
      ws.addEventListener("message", (ev: MessageEvent) => {
        const e = JSON.parse(ev.data as string);
        if (e.type === "tableState") aux.last = e.payload;
      });
      ws.addEventListener("error", () => {
        clearTimeout(t);
        reject(new Error("aux error"));
      });
    });
  }
  send(i: unknown): void {
    this.ws.send(JSON.stringify(i));
  }
  close(): void {
    try {
      this.ws.close();
    } catch {
      /* */
    }
  }
  async waitFor(p: () => boolean, budget = 15_000): Promise<boolean> {
    const end = Date.now() + budget;
    while (Date.now() < end) {
      if (p()) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  }
}

async function touchTap(page: Page, x: number, y: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test("3 players: browser is a MIDDLE player; peek (touch hold) then KEEP commits the turn", async ({ page }) => {
  const code = randomCode();

  // Two aux players: host (seat 0) + guest2 (seat 2). The browser joins between them (seat 1).
  const host = await Aux.open(code);
  host.send({ type: "createRoom", payload: { name: "AuxHost" } });
  expect(await host.waitFor(() => host.last?.players?.length === 1)).toBe(true);

  // Browser joins as seat 1 (the 2nd to join).
  await page.goto("/");
  await page.getByRole("button", { name: /join a table/i }).click();
  const slots = page.getByRole("textbox", { name: /room code letter/i });
  const letters = code.split("");
  for (let i = 0; i < letters.length; i++) await slots.nth(i).fill(letters[i]);
  await page.getByRole("textbox", { name: /your name/i }).fill("Browser");
  await page.getByRole("button", { name: /join a table/i }).click();
  await expect(page.locator(`[aria-label="Room code ${code}"]`)).toBeVisible({ timeout: 15_000 });
  expect(await host.waitFor(() => host.last?.players?.length === 2)).toBe(true);

  // Third player joins (seat 2).
  const guest2 = await Aux.open(code);
  guest2.send({ type: "joinRoom", payload: { code, name: "Guest2" } });
  expect(await host.waitFor(() => host.last?.players?.length === 3)).toBe(true);

  // Deal. Host (seat 0) is the starting player → host's turn. Browser (seat 1) is on Waiting.
  host.send({ type: "deal", payload: { phaseToken: host.last.phaseToken } });
  expect(await host.waitFor(() => host.last?.phase === "turns")).toBe(true);

  // Host KEEPS → turn passes right to seat 1 (the browser) → YourTurn.
  host.send({ type: "keep", payload: { turnToken: host.last.turnToken } });
  const keep = page.getByRole("button", { name: /^keep$/i });
  const peek = page.getByRole("button", { name: /peek/i });
  await expect(keep).toBeVisible({ timeout: 15_000 });
  await expect(peek).toBeVisible();

  // The browser is a MIDDLE player → NO Draw button (it is not the Last Player).
  await expect(page.getByRole("button", { name: /draw from deck/i })).toHaveCount(0);

  const tokenBefore = host.last.turnToken as number;

  // PEEK via real touch: hold → release.
  const pbox = await peek.boundingBox();
  if (!pbox) throw new Error("no peek box");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: pbox.x + pbox.width / 2, y: pbox.y + pbox.height / 2 }],
  });
  await expect(peek).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(150);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(peek).toHaveAttribute("aria-pressed", "false");

  // Now TAP KEEP via touch. If the bug is real, this is swallowed and the turn never advances.
  const kbox = await keep.boundingBox();
  if (!kbox) throw new Error("no keep box");
  await touchTap(page, kbox.x + kbox.width / 2, kbox.y + kbox.height / 2);

  // Committed → turnToken advances by 1 (the turn passed to seat 2). Assert the OUTCOME on the server.
  const committed = await host.waitFor(() => (host.last?.turnToken as number) === tokenBefore + 1, 8000);
  expect(committed).toBe(true);

  host.close();
  guest2.close();
});
