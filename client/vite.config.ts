// Vite + Svelte + vite-plugin-pwa (installable app-shell only — UX-DR17).
// PWA *content* (manifest copy, icons, surfaces, tokens.css) is authored in Stories 1.9/1.10.
// No Tailwind, no UI kit. [Source: architecture.md#Selected-Approach, #Development/Build/Deploy]
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: "autoUpdate",
      // Minimal placeholder manifest — cleaned/warm copy + the two produced icons land in Story 1.9b/1.10.
      manifest: {
        name: "Trash",
        short_name: "Trash",
        display: "standalone",
        orientation: "portrait",
        background_color: "#1a1320",
        theme_color: "#1a1320",
      },
    }),
  ],
});
