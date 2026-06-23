// HostControls.svelte.test.ts — the one-level Host Controls modal sheet SHELL (Story 4.1, AC-4.1.6/.7/.8).
// Runs in "client-dom".
//
// Pins:
//   - it is a dialog with the HOST_CONTROLS heading/label (AC-4.1.6).
//   - it has a close affordance that calls the onclose callback; Escape also closes (AC-4.1.6).
//   - it is a SHELL this story: the three FR-14 controls (Lives stepper, remove player, reassign host) are
//     Story 4.2 — they must NOT be present yet (AC-4.1.7 / scope).
//   - Eyes-Up (AC-4.1.7): no timer/log/dashboard/ambient content.
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectedTableState } from "@trash/shared";
import { HOST_CONTROLS } from "../lib/copy";
import HostControls from "./HostControls.svelte";

afterEach(cleanup);

function state(over: Partial<ProjectedTableState> = {}): ProjectedTableState {
  return {
    code: "CND1",
    phase: "lobby",
    hostId: "me",
    startingLives: 3,
    you: { playerId: "me", isHost: true, isAlive: true, isConnected: true, isLastPlayer: false },
    players: [
      { id: "me", name: "Mar", lives: 3, isAlive: true, isConnected: true, seatIndex: 0 },
      { id: "p2", name: "Beto", lives: 3, isAlive: true, isConnected: true, seatIndex: 1 },
    ],
    phaseToken: 7,
    revealed: false,
    ...over,
  };
}

describe("HostControls sheet shell", () => {
  it("renders a dialog with the Host controls heading (AC-4.1.6)", () => {
    render(HostControls, { props: { state: state(), onclose: vi.fn() } });
    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(screen.getAllByText(HOST_CONTROLS).length).toBeGreaterThan(0);
  });

  it("the close affordance calls onclose (AC-4.1.6)", async () => {
    const onclose = vi.fn();
    render(HostControls, { props: { state: state(), onclose } });
    await fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onclose).toHaveBeenCalledOnce();
  });

  it("Escape closes the sheet (AC-4.1.6)", async () => {
    const onclose = vi.fn();
    render(HostControls, { props: { state: state(), onclose } });
    await fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onclose).toHaveBeenCalledOnce();
  });

  it("traps Tab focus inside the sheet — Tab from the last control wraps, never escaping to the bar (AC-4.1.6)", async () => {
    render(HostControls, { props: { state: state(), onclose: vi.fn() } });
    const dialog = screen.getByRole("dialog");
    const close = screen.getByRole("button", { name: /close/i });
    // The close button is the only (and therefore last) tabbable control in the 4.1 shell. Focus it, then
    // Tab: the trap must keep focus in the sheet (wrap to the first control) rather than escape to the
    // conductor bar behind the scrim.
    close.focus();
    await fireEvent.keyDown(dialog, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("is a SHELL — the three FR-14 controls are NOT present yet (Story 4.2 scope)", () => {
    const { container } = render(HostControls, { props: { state: state(), onclose: vi.fn() } });
    // No Lives stepper, no remove affordance, no reassign-host action in the 4.1 shell.
    expect(container.querySelector("[aria-label='Lives stepper']")).toBeNull();
    expect(screen.queryByText(/remove/i)).toBeNull();
    expect(screen.queryByText(/make .*host/i)).toBeNull();
  });

  it("holds no attention-sink content (Eyes-Up, AC-4.1.7)", () => {
    const { container } = render(HostControls, { props: { state: state(), onclose: vi.fn() } });
    expect(container.textContent ?? "").not.toMatch(/timer|activity|log|dashboard|score|streak/i);
  });
});
