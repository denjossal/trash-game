<script lang="ts">
  // LanguageToggle.svelte — the per-device language chooser (Story 7.2, FR-15, UX-DR19). A quiet,
  // one-time choice surfaced on Home/Join BEFORE the Room Code, so a Spanish-speaking relative handed a
  // phone sees the app in their language from the first screen — off the clock, no turn pressure.
  //
  // DEVICE-LOCAL: reads/writes ONLY this device's preference via the Story-7.1 i18n store (getLanguage/
  // setLanguage → localStorage). It sends nothing to the server and is NEVER a Host/Table control (it
  // does not appear in the Host Controls overlay — language is per-device, never room-level). Selecting
  // a language re-renders the whole app immediately (t(...) reads the reactive store).
  //
  // A11y (NFR-10): a labeled segmented group of real ≥48dp <button>s. Each option carries a flag glyph
  // AND a text label (legible without color — color alone never conveys state), and the ACTIVE option is
  // marked with aria-pressed=true so a screen reader announces the current choice. Not a settings sink:
  // just the two languages, inline.
  import { LANGUAGES, type Language, getLanguage, setLanguage, t } from "../lib/i18n.svelte";

  const current = $derived(getLanguage());

  // Flag glyph per language — decorative (aria-hidden); the text label carries the meaning for SR /
  // color-blind / glyph-less environments. (A flag is a loose proxy for a language, never the sole cue.)
  const FLAG: Record<Language, string> = { en: "🇬🇧", es: "🇪🇸" };
  const NAME_KEY: Record<Language, "LANG_NAME_EN" | "LANG_NAME_ES"> = {
    en: "LANG_NAME_EN",
    es: "LANG_NAME_ES",
  };
</script>

<div class="toggle" role="group" aria-label={t("LANGUAGE_LABEL")}>
  {#each LANGUAGES as lang (lang)}
    <button
      class="option"
      type="button"
      aria-pressed={current === lang}
      onclick={() => setLanguage(lang)}
    >
      <span class="flag" aria-hidden="true">{FLAG[lang]}</span>
      <span class="name">{t(NAME_KEY[lang])}</span>
    </button>
  {/each}
</div>

<style>
  .toggle {
    display: inline-flex;
    gap: var(--space-stack-sm);
    /* A quiet inline control, not an attention surface (G1 / NFR-9). */
  }
  .option {
    min-height: 48px; /* >= 48dp tap target (NFR-10) */
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0 var(--space-stack-sm);
    border: var(--border-inert);
    border-radius: var(--radius-full);
    background: var(--color-surface-container-high);
    color: var(--color-on-surface);
    font-family: var(--font-family-body);
    font-size: var(--type-body-md-size);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  /* The active option: neon stroke — NOT color alone. The flag + text label (and aria-pressed) carry the
     state independently, so a color-blind / monochrome reader still knows which is selected. */
  .option[aria-pressed="true"] {
    border: var(--stroke-active);
    font-weight: var(--type-label-bold-weight);
  }
  .option:focus-visible {
    outline: var(--stroke-active);
    outline-offset: 2px;
  }
  .flag {
    font-size: var(--type-body-lg-size);
    line-height: 1;
  }
</style>
