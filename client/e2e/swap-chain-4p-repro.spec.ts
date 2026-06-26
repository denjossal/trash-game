// Swap-chain guard (playtest 2026-06-26 report: A,B,C,D — "A can swap, B CANNOT swap"). The ROOT CAUSE
// was server-side and DEPLOY-ONLY: the in-flight round was memory-only, so a Durable Object that
// hibernated between A's and B's turns woke and coerced the round away (fixed by persisting the round —
// see server/persistence.ts + table-server-reload.do.test.ts "ROUND-LOSS FIX"). This spec is the CLIENT-
// side companion: it pins the 4-player swap-chain handoff (A swaps → B is the swap RECEIVER → B swaps)
// against a live server, so the front-end half of the path stays covered. It cannot reproduce the
// hibernation itself (wrangler dev rarely evicts); the server reload test covers the eviction directly.
// Topology: aux A (seat 0, starting), browser B (seat 1), aux C (seat 2), aux D (seat 3).
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
  error: string | null = null;
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
        else if (e.type === "error") aux.error = e.payload?.reason ?? "error";
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

test("4 players: A swaps, then B (swap receiver) swaps — B's swap must commit", async ({ page }) => {
  const code = randomCode();

  // A = aux host (seat 0). Browser = B (seat 1). C, D = aux (seats 2, 3).
  const a = await Aux.open(code);
  a.send({ type: "createRoom", payload: { name: "A" } });
  expect(await a.waitFor(() => a.last?.players?.length === 1)).toBe(true);

  await page.goto("/");
  await page.getByRole("button", { name: /join a table/i }).click();
  const slots = page.getByRole("textbox", { name: /room code letter/i });
  const letters = code.split("");
  for (let i = 0; i < letters.length; i++) await slots.nth(i).fill(letters[i]);
  await page.getByRole("textbox", { name: /your name/i }).fill("B");
  await page.getByRole("button", { name: /join a table/i }).click();
  await expect(page.locator(`[aria-label="Room code ${code}"]`)).toBeVisible({ timeout: 15_000 });
  expect(await a.waitFor(() => a.last?.players?.length === 2)).toBe(true);

  const c = await Aux.open(code);
  c.send({ type: "joinRoom", payload: { code, name: "C" } });
  expect(await a.waitFor(() => a.last?.players?.length === 3)).toBe(true);
  const d = await Aux.open(code);
  d.send({ type: "joinRoom", payload: { code, name: "D" } });
  expect(await a.waitFor(() => a.last?.players?.length === 4)).toBe(true);

  // Identify seat ids (immutable seatIndex order).
  const bySeat = [...a.last.players].sort((x: any, y: any) => x.seatIndex - y.seatIndex);
  const idA = bySeat[0].id;
  const idB = bySeat[1].id;
  const idC = bySeat[2].id;

  // Deal. A (seat 0) is starting player → A's turn.
  a.send({ type: "deal", payload: { phaseToken: a.last.phaseToken } });
  expect(await a.waitFor(() => a.last?.phase === "turns" && a.last?.currentTurnId === idA)).toBe(true);

  // A SWAPS → turn passes right to B; B becomes the swap receiver. turnToken bumps 0→1.
  a.send({ type: "swap", payload: { turnToken: a.last.turnToken } });
  expect(await a.waitFor(() => a.last?.currentTurnId === idB)).toBe(true);
  const tokenAtB = a.last.turnToken as number;

  // The browser (B) is now on YourTurn (the swap receiver — justReceivedSwap). The SWAP button is live.
  const swap = page.getByRole("button", { name: /^swap$/i });
  await expect(swap).toBeVisible({ timeout: 15_000 });

  // B taps SWAP (touch). If the bug reproduces, the turn never leaves B.
  const sbox = await swap.boundingBox();
  if (!sbox) throw new Error("no swap box");
  await touchTap(page, sbox.x + sbox.width / 2, sbox.y + sbox.height / 2);

  // ASSERTION: B's swap committed → turn passed right to C and turnToken advanced past tokenAtB.
  const committed = await a.waitFor(() => a.last?.currentTurnId === idC && (a.last?.turnToken as number) > tokenAtB, 8000);
  expect(committed).toBe(true);

  a.close();
  c.close();
  d.close();
});
