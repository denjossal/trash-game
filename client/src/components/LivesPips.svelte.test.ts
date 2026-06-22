// LivesPips.svelte.test.ts — the Lives indicator (Story 1.10, UX-DR15; tick-down animation Story 3.4).
// Runs in "client-dom".
//
// Pins:
//   - filled discs = remaining lives, hollow rings = spent — distinguished by SHAPE (class), not colour
//     alone (NFR-10); the counts follow the `lives` / `startingLives` props.
//   - the numeral is paired only for startingLives >= 4 (never a bare number for a short row).
//   - TICK-DOWN (Story 3.4): the spent (hollow) pip carries the enter-animation hook so the @media
//     reduce-motion skip applies at runtime. jsdom does NOT evaluate @media or keyframes, so we assert the
//     structural target the skip depends on — the `.pip.hollow` element exists when a life is spent (one
//     more hollow than at full lives) — mirroring how Button/Showdown's reduce-motion is pinned by hook,
//     not by computed style.
import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import LivesPips from "./LivesPips.svelte";

afterEach(cleanup);

describe("LivesPips", () => {
  it("renders `lives` filled discs and (startingLives - lives) hollow rings", () => {
    const { container } = render(LivesPips, { props: { lives: 2, startingLives: 3 } });
    expect(container.querySelectorAll(".pip.filled").length).toBe(2);
    expect(container.querySelectorAll(".pip.hollow").length).toBe(1);
  });

  it("at FULL lives there are no hollow (spent) pips", () => {
    const { container } = render(LivesPips, { props: { lives: 3, startingLives: 3 } });
    expect(container.querySelectorAll(".pip.filled").length).toBe(3);
    expect(container.querySelectorAll(".pip.hollow").length).toBe(0);
  });

  it("filled and hollow pips are distinguished by SHAPE class (not colour alone) — NFR-10", () => {
    const { container } = render(LivesPips, { props: { lives: 1, startingLives: 3 } });
    // The two pip kinds carry distinct classes (disc vs ring), the shape cue a colour-blind player reads.
    expect(container.querySelector(".pip.filled")).not.toBeNull();
    expect(container.querySelector(".pip.hollow")).not.toBeNull();
  });

  it("pairs a numeral only when startingLives >= 4 (never a bare number for a short row)", () => {
    const short = render(LivesPips, { props: { lives: 2, startingLives: 3 } });
    expect(short.container.querySelector('[data-testid="lives-numeral"]')).toBeNull();
    cleanup();
    const long = render(LivesPips, { props: { lives: 3, startingLives: 5 } });
    expect(long.container.querySelector('[data-testid="lives-numeral"]')).not.toBeNull();
  });

  it("the spent (hollow) pip carries the tick-down animation hook (.pip.hollow — the @media skip target)", () => {
    // After a life is lost, the row shows one hollow pip; the brief enter animation lives on `.pip.hollow`,
    // and the prefers-reduced-motion @media block neutralises it. jsdom can't evaluate @media/keyframes, so
    // we pin the structural target the skip keys off: a spent pip renders as a `.pip.hollow` element.
    const { container } = render(LivesPips, { props: { lives: 2, startingLives: 3 } });
    const hollow = container.querySelector(".pip.hollow");
    expect(hollow).not.toBeNull();
    expect(hollow?.classList.contains("hollow")).toBe(true);
  });
});
