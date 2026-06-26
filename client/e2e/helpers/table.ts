// e2e helper — drive a real browser client to a dealt "Your Turn" surface, with ZERO production changes.
//
// THE CONSTRAINT: peek (Story 2.5) only renders on the YourTurn surface, which requires a dealt round —
// but the conductor "Deal" button is Story 4.1 (NOT built in Epic 2), so the browser client cannot
// itself create→deal through clicks alone. We solve this WITHOUT adding any test-only production seam:
//
//   - An AUXILIARY raw WebSocket (Node's BUILT-IN global `WebSocket`, Node ≥22 — NO new dependency,
//     the SAME approach as server/test/integration/multi-device-join.mjs) plays the HOST: it createRoom
//     → deal → keep, driving the round forward.
//   - The browser page JOINS as player 2 over the REAL client UI (Home → Join a table). In heads-up,
//     player 2 is the Last Player; the Host is the Starting Player. After the Host's `keep`, the turn
//     passes right to player 2 → the browser routes to YourTurn. Now peek is on a REAL browser surface.
//
// So: the browser exercises the genuine client (real socket, real surface, real DOM events); the aux
// socket only supplies the Host-side intents the Epic-2 UI can't yet send. No `window` hook, no dev-only
// export, no change under client/src.
// Uses Node's built-in global `WebSocket` (Node ≥22) — no `ws` dependency, matching the .mjs harness.
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

const SERVER_PORT = 8787;
const WS_URL = `ws://127.0.0.1:${SERVER_PORT}`;
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ"; // ambiguity-safe — mirrors @trash/shared ROOM_CODE_ALPHABET.

function randomCode(): string {
  let code = "";
  // No crypto needed for a test fixture; collisions are astronomically unlikely and a retry is cheap.
  for (let i = 0; i < 4; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return code;
}

/** A minimal aux socket that records the latest tableState it has seen (so we can read phaseToken/turnToken). */
class AuxSocket {
  private ws: WebSocket;
  last: Record<string, unknown> | null = null;
  error: string | null = null;

  private constructor(ws: WebSocket) {
    this.ws = ws;
  }

  static open(code: string): Promise<AuxSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${WS_URL}/parties/table/${code}`);
      const aux = new AuxSocket(ws);
      const timer = setTimeout(() => reject(new Error(`aux socket timed out connecting to ${code}`)), 10_000);
      ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolve(aux);
      });
      ws.addEventListener("message", (ev: MessageEvent) => {
        const event = JSON.parse(ev.data as string);
        if (event.type === "tableState") aux.last = event.payload;
        else if (event.type === "error") aux.error = event.payload.reason;
      });
      ws.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error(`aux socket error connecting to ${code}`));
      });
    });
  }

  send(intent: unknown): void {
    this.ws.send(JSON.stringify(intent));
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      /* already closed */
    }
  }

  /** Wait until `predicate()` holds against the latest snapshot, or the budget elapses. */
  async waitFor(predicate: () => boolean, budgetMs = 15_000, stepMs = 50): Promise<boolean> {
    const deadline = Date.now() + budgetMs;
    while (Date.now() < deadline) {
      if (predicate()) return true;
      await new Promise((r) => setTimeout(r, stepMs));
    }
    return false;
  }
}

export interface DealtTable {
  code: string;
  host: AuxSocket;
  /** The turn token the browser's (player 2 / Last Player) draw/swap/keep intent would carry. */
  turnToken: number;
}

/**
 * Create a room (aux host), join the browser as player 2 over the real UI, and DEAL — stopping while the
 * Host (player 0 / Starting Player) is on turn, so the browser is on the WAITING surface (it is NOT yet
 * player 2's turn). Returns once the page shows Waiting with the off-turn peek control present.
 */
export async function driveBrowserToWaiting(page: Page, name = "E2E"): Promise<DealtTable> {
  const code = randomCode();

  // 1) Aux HOST creates the room and waits for the lobby (it is player 0 / Starting Player).
  const host = await AuxSocket.open(code);
  host.send({ type: "createRoom", payload: { name: "AuxHost" } });
  const created = await host.waitFor(() => Array.isArray((host.last as any)?.players) && (host.last as any).players.length === 1);
  if (!created) throw new Error(`aux host never reached lobby for ${code} (is wrangler dev running?)`);

  // 2) Browser JOINS as player 2 through the REAL client UI (Home → Join a table → code + name → Join).
  await page.goto("/");
  await page.getByRole("button", { name: /join a table/i }).click();
  const slots = page.getByRole("textbox", { name: /room code letter/i });
  const letters = code.split("");
  for (let i = 0; i < letters.length; i++) {
    await slots.nth(i).fill(letters[i]);
  }
  await page.getByRole("textbox", { name: /your name/i }).fill(name);
  await page.getByRole("button", { name: /join a table/i }).click();

  // The browser is in the Lobby once it lands a tableState (App routes away from Home). The Lobby's
  // Room-Code header has the EXACT label `Room code <CODE>` — distinct from Home's `Room code` group +
  // `Room code letter N` slots (which would make a prefix match ambiguous). Match the full code.
  await expect(page.locator(`[aria-label="Room code ${code}"]`)).toBeVisible({ timeout: 15_000 });

  // 3) Aux host waits until it sees BOTH players, then DEALS (≥2 alive — the server's deal precondition).
  const bothSeated = await host.waitFor(() => (host.last as any)?.players?.length === 2);
  if (!bothSeated) throw new Error("aux host never saw player 2 join");
  host.send({ type: "deal", payload: { phaseToken: (host.last as any).phaseToken } });

  // After the deal: phase "turns", Host (player 0) is the Starting Player → it is the HOST's turn. The
  // browser (player 2) is on WAITING. The off-turn peek (Story 6.1) renders here on the real surface.
  const dealt = await host.waitFor(() => (host.last as any)?.phase === "turns" && typeof (host.last as any)?.turnToken === "number");
  if (!dealt) throw new Error("deal did not advance the round to `turns`");
  await expect(page.getByRole("button", { name: /peek/i })).toBeVisible({ timeout: 15_000 });

  const turnToken = ((host.last as any)?.turnToken as number) ?? 0;
  return { code, host, turnToken };
}

/**
 * As driveBrowserToWaiting, but then advance the Host's turn (aux host KEEPS) so the turn passes right to
 * player 2 (heads-up: the Last Player) and the browser lands on YourTurn with the peek + SWAP/KEEP hero.
 */
export async function driveBrowserToYourTurn(page: Page, name = "E2E"): Promise<DealtTable> {
  const { code, host } = await driveBrowserToWaiting(page, name);

  // The aux host KEEPS to pass the turn right to player 2 → the browser routes to YourTurn.
  host.send({ type: "keep", payload: { turnToken: (host.last as any).turnToken } });
  await expect(page.getByRole("button", { name: /peek/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /^keep$/i })).toBeVisible({ timeout: 15_000 });

  const turnToken = ((host.last as any)?.turnToken as number) ?? 0;
  return { code, host, turnToken };
}
