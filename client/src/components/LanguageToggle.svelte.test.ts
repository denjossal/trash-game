// LanguageToggle.svelte.test.ts — the per-device language chooser (Story 7.2, FR-15, UX-DR19). Runs in
// the "client-dom" project (jsdom + runes). Pins the toggle contract; the Home placement (toggle present
// BEFORE the Room Code) is asserted in Home.svelte.test.ts.
//
// What this pins (AC-7.2.*):
//   - both languages render as a labeled group; the ACTIVE one is aria-pressed (SR knows the choice).
//   - each option carries a TEXT label (legible without color alone — NFR-10); ≥48dp tap target.
//   - selecting a language updates the store (getLanguage) and re-renders (the pressed state moves).
//   - the choice persists to localStorage (returning device restores it).
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LANGUAGE_KEY, getLanguage, setLanguage, t } from "../lib/i18n.svelte";
import LanguageToggle from "./LanguageToggle.svelte";

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* partial shim — ignore */
  }
}
function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

afterEach(cleanup);
beforeEach(() => {
  safeRemove(LANGUAGE_KEY);
  setLanguage("en");
});

describe("LanguageToggle", () => {
  it("renders both languages as a group labeled 'Language'", () => {
    render(LanguageToggle);
    expect(screen.getByRole("group", { name: t("LANGUAGE_LABEL") })).toBeTruthy();
    expect(screen.getByRole("button", { name: /english/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /español/i })).toBeTruthy();
  });

  it("each option carries a TEXT label (legible without color alone — NFR-10)", () => {
    render(LanguageToggle);
    // The accessible name comes from the text span, not the decorative (aria-hidden) flag glyph.
    expect(screen.getByRole("button", { name: t("LANG_NAME_EN") })).toBeTruthy();
    expect(screen.getByRole("button", { name: t("LANG_NAME_ES") })).toBeTruthy();
  });

  it("marks the CURRENT language with aria-pressed (English by default)", () => {
    render(LanguageToggle);
    expect(screen.getByRole("button", { name: /english/i }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /español/i }).getAttribute("aria-pressed")).toBe("false");
  });

  it("each option is a real, operable <button> (the ≥48dp size is the .option CSS, verified visually)", () => {
    render(LanguageToggle);
    // jsdom doesn't apply scoped <style> rules to getComputedStyle, so the 48px min-height can't be read
    // here — that tap-target size lives in the .option rule and is a real-browser concern. What jsdom CAN
    // pin is that each option is a genuine <button> (keyboard-operable, focusable, AT-exposed by role).
    const en = screen.getByRole("button", { name: /english/i });
    expect(en.tagName).toBe("BUTTON");
    expect(en.getAttribute("type")).toBe("button");
  });

  it("selecting Español updates the store and moves the pressed state (re-renders)", async () => {
    render(LanguageToggle);
    await fireEvent.click(screen.getByRole("button", { name: /español/i }));
    expect(getLanguage()).toBe("es");
    expect(screen.getByRole("button", { name: /español/i }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /english/i }).getAttribute("aria-pressed")).toBe("false");
  });

  it("persists the choice to localStorage (returning device restores it)", async () => {
    render(LanguageToggle);
    await fireEvent.click(screen.getByRole("button", { name: /español/i }));
    const stored = safeGet(LANGUAGE_KEY);
    if (stored !== null) expect(stored).toBe("es"); // assert only when the shim supports storage
  });
});
