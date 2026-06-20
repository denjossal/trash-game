// Vite + Svelte + vite-plugin-pwa (installable app-shell only — UX-DR17).
// Story 1.9b: the REAL installable manifest (warm voice copy + the two produced icons) ships here —
// portrait-only, dark-only. Offline *gameplay* stays explicitly out of scope (the game needs the
// live WebSocket): we precache the static shell only, NO runtime caching of game/WS data.
// No Tailwind, no UI kit. [Source: architecture.md#Selected-Approach, #Development/Build/Deploy,
// #Complete-Project-Directory-Structure (public/manifest.json "cleaned, warm copy"; PWA-scope
// footnote); epics.md#Story-1.9b lines 430-432; EXPERIENCE.md "Voice and Tone" line 41.]
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: "autoUpdate",
      // Precache the locally-bundled fonts (Story 1.9a) + the app icons (1.9b) alongside the default
      // app-shell assets — the default globPatterns omit woff2, so without this the shell would
      // re-fetch the fonts. (Static shell only — offline gameplay is out of scope.)
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
      },
      // The real installable manifest (Story 1.9b). description = the corrected WARM voice copy
      // (the generated "high-stakes underground" copy is REJECTED, EXPERIENCE.md line 41 / DESIGN.md
      // line 115); the single source for this one sentence is MANIFEST_DESCRIPTION in src/lib/copy.ts
      // (build-time config can't import an app module cleanly, so the literal is mirrored here).
      // background/theme = the DESIGN.md surface #1a0b2e (was the 1.9a placeholder #1a1320).
      manifest: {
        name: "Trash",
        short_name: "Trash",
        description:
          "A party card game for friends and family at the same table — your phone is the dealer.",
        start_url: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#1a0b2e",
        theme_color: "#1a0b2e",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
});
