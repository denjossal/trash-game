// Button.svelte.test.ts — interaction-safety behavior of the shared Button primitive (Story 1.9b,
// UX-DR18 / NFR-10). Runs under the jsdom "client-dom" vitest project (see client/vitest.config.ts).
//
// Tests the behavior that MATTERS, not styling:
//   - debounce: a rapid double-tap fires the handler exactly ONCE; a tap after the window fires again
//   - disabled: a disabled Button never fires
//   - semantics: the rendered control is a real, focusable <button> (the keyboard / AT path)
//
// Uses vitest fake timers to advance past the debounce window deterministically (no real sleeps).
// [Source: EXPERIENCE.md line 98 "buttons debounce"; line 66 "One tap = one committed action"; line
//  114 "Swap/Keep are the first two focus stops"; story AC-1.9b.6.]
import { cleanup, render } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Button from "./Button.svelte";
import { DEBOUNCE_MS } from "../lib/interaction";

// A minimal label snippet — the Button's `children` prop is a Svelte Snippet, not a plain function.
const label = (text: string) => createRawSnippet(() => ({ render: () => `<span>${text}</span>` }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Button — interaction safety", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("fires the handler exactly once for a rapid double-tap (debounce)", async () => {
    const onclick = vi.fn();
    const { getByRole } = render(Button, { props: { onclick, children: label("Deal") } });
    const button = getByRole("button");

    button.click();
    button.click(); // second tap within the window — swallowed

    expect(onclick).toHaveBeenCalledTimes(1);
  });

  it("fires again once the debounce window has elapsed", async () => {
    const onclick = vi.fn();
    const { getByRole } = render(Button, { props: { onclick, children: label("Deal") } });
    const button = getByRole("button");

    button.click();
    expect(onclick).toHaveBeenCalledTimes(1);

    button.click(); // still inside the window
    expect(onclick).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(DEBOUNCE_MS + 1); // window elapses
    button.click();
    expect(onclick).toHaveBeenCalledTimes(2);
  });

  it("does not fire when disabled", () => {
    const onclick = vi.fn();
    const { getByRole } = render(Button, {
      props: { onclick, disabled: true, children: label("Deal") },
    });
    const button = getByRole("button");

    button.click();

    expect(onclick).not.toHaveBeenCalled();
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders a real, focusable <button> (keyboard / AT path)", () => {
    const onclick = vi.fn();
    const { getByRole } = render(Button, { props: { onclick, children: label("Deal") } });
    const button = getByRole("button") as HTMLButtonElement;

    expect(button.tagName).toBe("BUTTON");
    button.focus();
    expect(document.activeElement).toBe(button);
  });
});
