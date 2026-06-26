// Home.svelte.test.ts — the cold-open Home surface (Story 1.10, AC-1.10.1/.3). Runs in "client-dom".
//
// Behavior pinned (not styling):
//   - renders the two warm primary actions from copy.ts (Start / Join)
//   - tapping "Join a table" reveals the 4-slot Room Code field + a display-name entry
//   - a bad/expired code surfaces the warm BAD_CODE copy under the field; the field persists
//   - copy is sourced from copy.ts (no rejected "high-stakes"/"underground" framing rendered)
//
// The socket session calls live in table-store.svelte (startTable/joinTable). We mock that module so
// the test drives the UI without a real WebSocket. [Source: story Task 2; EXPERIENCE.md Cold open/Bad code.]
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../lib/i18n.svelte";
import { MAX_NAME_LEN } from "../lib/interaction";

// Story 7.1: copy moved to the keyed i18n dictionary. These aliases resolve the English strings once so
// the existing assertions (which match on the rendered text) read unchanged.
const BAD_CODE = t("BAD_CODE");
const JOIN_TABLE = t("JOIN_TABLE");
const START_TABLE = t("START_TABLE");
const TABLE_BUSY = t("TABLE_BUSY");

// Mock the session module: startTable/joinTable are async; the test controls resolve/reject.
const startTable = vi.fn();
const joinTable = vi.fn();
vi.mock("../lib/table-store.svelte", () => ({
  startTable: (...a: unknown[]) => startTable(...a),
  joinTable: (...a: unknown[]) => joinTable(...a),
}));

import Home from "./Home.svelte";

afterEach(cleanup);
beforeEach(() => {
  startTable.mockReset().mockResolvedValue(undefined);
  joinTable.mockReset().mockResolvedValue(undefined);
});

describe("Home surface", () => {
  it("renders the two warm primary actions (Start / Join) from copy.ts", () => {
    render(Home);
    expect(screen.getByText(START_TABLE)).toBeTruthy();
    expect(screen.getByText(JOIN_TABLE)).toBeTruthy();
  });

  it("does not render any rejected framing", () => {
    const { container } = render(Home);
    expect(container.textContent?.toLowerCase()).not.toContain("high-stakes");
    expect(container.textContent?.toLowerCase()).not.toContain("underground");
  });

  it("(Story 7.2) renders the language toggle BEFORE the Room Code entry (reachable on the first screen)", () => {
    render(Home);
    // The language group is present at the cold-open "choose" step — before Join reveals the code field.
    const group = screen.getByRole("group", { name: t("LANGUAGE_LABEL") });
    expect(group).toBeTruthy();
    expect(screen.queryByRole("group", { name: /room code/i })).toBeNull(); // code field not shown yet
    expect(screen.getByRole("button", { name: t("LANG_NAME_ES") })).toBeTruthy();
  });

  it("reveals the Room Code field + name entry when Join is chosen", async () => {
    render(Home);
    await fireEvent.click(screen.getByText(JOIN_TABLE));
    // 4 single-letter code slots + a name input.
    const codeSlots = screen.getAllByLabelText(/room code letter/i);
    expect(codeSlots).toHaveLength(4);
    expect(screen.getByLabelText(/your name/i)).toBeTruthy();
  });

  it("auto-uppercases and restricts code slots to the ambiguity-safe alphabet", async () => {
    render(Home);
    await fireEvent.click(screen.getByText(JOIN_TABLE));
    const slots = screen.getAllByLabelText(/room code letter/i) as HTMLInputElement[];
    await fireEvent.input(slots[0], { target: { value: "w" } });
    expect(slots[0].value).toBe("W"); // uppercased
    await fireEvent.input(slots[1], { target: { value: "0" } }); // banned (ambiguity-safe excludes 0)
    expect(slots[1].value).toBe("");
  });

  it("shows the warm BAD_CODE error under the field on a bad-code rejection; field persists", async () => {
    joinTable.mockRejectedValueOnce(Object.assign(new Error("joinRoom failed: bad-code"), { reason: "bad-code" }));
    render(Home);
    await fireEvent.click(screen.getByText(JOIN_TABLE));
    const slots = screen.getAllByLabelText(/room code letter/i) as HTMLInputElement[];
    for (const [i, ch] of ["W", "X", "Y", "Z"].entries()) {
      await fireEvent.input(slots[i], { target: { value: ch } });
    }
    await fireEvent.input(screen.getByLabelText(/your name/i), { target: { value: "Mar" } });
    await fireEvent.click(screen.getByText(/join/i, { selector: "button:not([disabled])" }));

    expect(await screen.findByText(BAD_CODE)).toBeTruthy();
    // Field still present, ready to retry.
    expect(screen.getAllByLabelText(/room code letter/i)).toHaveLength(4);
  });

  it("shows the warm TABLE_BUSY copy (not BAD_CODE) on a room-full / already-playing rejection", async () => {
    joinTable.mockRejectedValueOnce(
      Object.assign(new Error("joinRoom failed: room-full"), { reason: "room-full" }),
    );
    render(Home);
    await fireEvent.click(screen.getByText(JOIN_TABLE));
    const slots = screen.getAllByLabelText(/room code letter/i) as HTMLInputElement[];
    for (const [i, ch] of ["W", "X", "Y", "Z"].entries()) {
      await fireEvent.input(slots[i], { target: { value: ch } });
    }
    await fireEvent.input(screen.getByLabelText(/your name/i), { target: { value: "Mar" } });
    await fireEvent.click(screen.getByText(/join/i, { selector: "button:not([disabled])" }));

    // The code is RIGHT — "check the letters" would mislead; the busy-table copy shows instead.
    expect(await screen.findByText(TABLE_BUSY)).toBeTruthy();
    expect(screen.queryByText(BAD_CODE)).toBeNull();
  });

  it("caps the display-name field at MAX_NAME_LEN chars", async () => {
    render(Home);
    await fireEvent.click(screen.getByText(START_TABLE));
    const nameEl = screen.getByLabelText(/your name/i) as HTMLInputElement;
    expect(nameEl.maxLength).toBe(MAX_NAME_LEN);
  });

  it("spreads a multi-char paste across slots and leaves the pasted slot showing one letter", async () => {
    render(Home);
    await fireEvent.click(screen.getByText(JOIN_TABLE));
    const slots = screen.getAllByLabelText(/room code letter/i) as HTMLInputElement[];
    // Paste the full code into slot 0; it spreads across all four slots.
    await fireEvent.input(slots[0], { target: { value: "WXYZ" } });
    expect(slots.map((s) => s.value)).toEqual(["W", "X", "Y", "Z"]);
  });
});
