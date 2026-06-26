// copy.ts — the build-time manifest string. The RUNTIME microcopy moved to the keyed, language-aware
// dictionary in i18n.svelte.ts (Story 7.1, FR-16): every surface now reads copy through `t(key, params)`
// so each device can render in its own language. Only the build-time manifest description — which the
// PWA config mirrors and which cannot read a reactive store — stays a plain const here.
//
// [Source: Story 7.1; i18n.svelte.ts holds the en/es dictionary + the `t` accessor.]

/**
 * The PWA manifest description — the corrected WARM copy (the generated "high-stakes underground"
 * line is REJECTED). The manifest itself lives in vite.config.ts (build-time config can't import an
 * app module cleanly), so this constant is the canonical home and the config mirrors this one literal.
 * Always English: the manifest is baked at build time, not per-device. [Source: imports/manifest.json
 * line 4; EXPERIENCE.md line 41.]
 */
export const MANIFEST_DESCRIPTION =
  "A party card game for friends and family at the same table — your phone is the dealer.";
