// HostControls.svelte.test.ts — the one-level Host Controls modal sheet: the shell (Story 4.1) + the three
// FR-14 controls (Story 4.2). Runs in "client-dom".
//
// Pins:
//   - it is a dialog with the HOST_CONTROLS heading/label; a close affordance + Escape close it; Tab is
//     trapped inside the sheet (shell — Story 4.1, AC-4.1.6).
//   - Lives stepper (AC-4.2.1): present + clamps 1..5 + sends sendHostSetLives(value, phaseToken).
//   - Remove (AC-4.2.3): an error-tinted remove per Player EXCEPT the Host's own row; a two-step confirm,
//     then sendHostRemovePlayer(id, phaseToken). A disconnected Player's row is dimmed (AR-15).
//   - Reassign (AC-4.2.5): a "make host" action per OTHER Player (excludes the Host) → sendHostReassign.
//   - Eyes-Up (AC-4.2.8): no timer/log/dashboard/ambient content.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectedTableState } from "@trash/shared";

const sendHostSetLives = vi.fn();
const sendHostRemovePlayer = vi.fn();
const sendHostReassign = vi.fn();
vi.mock("../lib/table-store.svelte", () => ({
  sendHostSetLives: (...a: unknown[]) => sendHostSetLives(...a),
  sendHostRemovePlayer: (...a: unknown[]) => sendHostRemovePlayer(...a),
  sendHostReassign: (...a: unknown[]) => sendHostReassign(...a),
}));

import { t } from "../lib/i18n.svelte";
import HostControls from "./HostControls.svelte";

// Story 7.1: copy moved to the keyed i18n dictionary; alias the English string so assertions read unchanged.
const HOST_CONTROLS = t("HOST_CONTROLS");

function player(id: string, name: string, over: Partial<ProjectedTableState["players"][number]> = {}) {
  return { id, name, lives: 3, isAlive: true, isConnected: true, seatIndex: 0, ...over };
}

function state(over: Partial<ProjectedTableState> = {}): ProjectedTableState {
  return {
    code: "CND1",
    phase: "roundResult",
    hostId: "me",
    startingLives: 3,
    you: { playerId: "me", isHost: true, isAlive: true, isConnected: true, isLastPlayer: false },
    players: [
      player("me", "Mar", { seatIndex: 0 }),
      player("p2", "Beto", { seatIndex: 1 }),
    ],
    phaseToken: 7,
    revealed: false,
    ...over,
  };
}

afterEach(cleanup);
beforeEach(() => {
  sendHostSetLives.mockReset();
  sendHostRemovePlayer.mockReset();
  sendHostReassign.mockReset();
});

describe("HostControls sheet — shell (Story 4.1)", () => {
  it("renders a dialog with the Host controls heading", () => {
    render(HostControls, { props: { state: state(), onclose: vi.fn() } });
    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(screen.getAllByText(HOST_CONTROLS).length).toBeGreaterThan(0);
  });

  it("the close affordance calls onclose", async () => {
    const onclose = vi.fn();
    render(HostControls, { props: { state: state(), onclose } });
    await fireEvent.click(screen.getByRole("button", { name: /close host controls/i }));
    expect(onclose).toHaveBeenCalledOnce();
  });

  it("Escape closes the sheet", async () => {
    const onclose = vi.fn();
    render(HostControls, { props: { state: state(), onclose } });
    await fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onclose).toHaveBeenCalledOnce();
  });

  it("traps Tab focus inside the sheet (never escaping to the bar)", async () => {
    render(HostControls, { props: { state: state(), onclose: vi.fn() } });
    const dialog = screen.getByRole("dialog");
    // Focus the last tabbable control, then Tab — the trap keeps focus in the sheet.
    const buttons = within(dialog).getAllByRole("button");
    buttons[buttons.length - 1].focus();
    await fireEvent.keyDown(dialog, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});

describe("HostControls — Lives stepper (Story 4.2, AC-4.2.1)", () => {
  it("renders the Lives stepper and sends hostSetLives with the current phaseToken", async () => {
    render(HostControls, { props: { state: state({ startingLives: 3, phaseToken: 7 }), onclose: vi.fn() } });
    expect(screen.getByLabelText(/lives stepper/i)).toBeTruthy();
    await fireEvent.click(screen.getByLabelText(/increase lives/i));
    expect(sendHostSetLives).toHaveBeenCalledWith(4, 7);
  });

  it("clamps the stepper to 1..5", () => {
    const { unmount } = render(HostControls, { props: { state: state({ startingLives: 1 }), onclose: vi.fn() } });
    expect((screen.getByLabelText(/decrease lives/i) as HTMLButtonElement).disabled).toBe(true);
    unmount();
    render(HostControls, { props: { state: state({ startingLives: 5 }), onclose: vi.fn() } });
    expect((screen.getByLabelText(/increase lives/i) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("HostControls — remove a Player (Story 4.2, AC-4.2.3)", () => {
  it("shows a remove affordance for every Player EXCEPT the Host's own row", () => {
    render(HostControls, { props: { state: state(), onclose: vi.fn() } });
    // p2 (Beto) is removable; the Host (Mar/me) is not.
    expect(screen.getByRole("button", { name: /remove beto/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /remove mar/i })).toBeNull();
  });

  it("requires a confirm step, then sends hostRemovePlayer(id, phaseToken)", async () => {
    render(HostControls, { props: { state: state({ phaseToken: 7 }), onclose: vi.fn() } });
    // First tap: ask. No send yet.
    await fireEvent.click(screen.getByRole("button", { name: /remove beto/i }));
    expect(sendHostRemovePlayer).not.toHaveBeenCalled();
    // The confirm prompt names the Player; tapping it sends.
    await fireEvent.click(screen.getByText(/remove beto\?/i));
    expect(sendHostRemovePlayer).toHaveBeenCalledWith("p2", 7);
  });

  it("dims a disconnected Player's row in the roster (AR-15)", () => {
    render(HostControls, {
      props: {
        state: state({
          players: [player("me", "Mar", { seatIndex: 0 }), player("p2", "Beto", { seatIndex: 1, isConnected: false })],
        }),
        onclose: vi.fn(),
      },
    });
    // "Beto" appears in both the Players roster (removable) and the reassign list; the dimmed `disconnected`
    // class is on the Players-roster row (the one that also holds the remove affordance).
    const removeBtn = screen.getByRole("button", { name: /remove beto/i });
    const row = removeBtn.closest("li")!;
    expect(row.className).toMatch(/disconnected/);
  });
});

describe("HostControls — reassign host (Story 4.2, AC-4.2.5)", () => {
  it("offers 'make host' for every OTHER Player (never the Host) and sends hostReassign", async () => {
    render(HostControls, { props: { state: state({ phaseToken: 7 }), onclose: vi.fn() } });
    // p2 can be made host; the Host (me) has no make-host action.
    expect(screen.getByRole("button", { name: /make beto host/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /make mar host/i })).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: /make beto host/i }));
    expect(sendHostReassign).toHaveBeenCalledWith("p2", 7);
  });

  it("allows reassigning to an ELIMINATED Player (an eliminated host keeps conducting)", () => {
    render(HostControls, {
      props: {
        state: state({
          players: [
            player("me", "Mar", { seatIndex: 0 }),
            player("p2", "Beto", { seatIndex: 1, isAlive: false, lives: 0 }),
          ],
        }),
        onclose: vi.fn(),
      },
    });
    // The eliminated Player still appears as a reassign target.
    expect(screen.getByRole("button", { name: /make beto host/i })).toBeTruthy();
  });
});

describe("HostControls — Eyes-Up (Story 4.2, AC-4.2.8)", () => {
  it("holds no attention-sink content (no timer/log/dashboard/score/streak)", () => {
    const { container } = render(HostControls, { props: { state: state(), onclose: vi.fn() } });
    expect(container.textContent ?? "").not.toMatch(/timer|activity|log|dashboard|score|streak/i);
  });
});
