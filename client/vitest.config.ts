// Client vitest — TWO projects (Story 1.9b):
//
//  1. "client-node"  — node env for PURE client functions (Story 1.9a: the render-from-state router,
//                       a pure (ProjectedTableState | null) -> Surface function — no DOM, no Workers).
//                       Matches `src/**/*.test.ts` but EXCLUDES the `*.svelte.test.ts` component tests.
//  2. "client-dom"   — jsdom env for COMPONENT tests that must mount Svelte (Story 1.9b: the Button
//                       primitive — debounce is the first genuine client logic worth mounting, exactly
//                       the "surface grows logic worth mounting" case the 1.9a config anticipated).
//                       Matches `src/**/*.svelte.test.ts` only.
//
// Both run under `npm test --workspace=client` (vitest runs all projects). Keeping them separate
// keeps the fast pure-function tests out of the heavier jsdom env, and mirrors the server's
// two-project split (rules:node + do:pool-workers, AR-14).
//
// TEST-FILE NAMING: pure ->`*.test.ts`; component -> `*.svelte.test.ts`.
import { svelteTesting } from "@testing-library/svelte/vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "client-node",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.svelte.test.ts"],
        },
      },
      {
        // The svelte plugin compiles .svelte components; svelteTesting() wires the browser-condition
        // resolution + auto-cleanup so client-side mount() works under jsdom (not the server build).
        plugins: [svelte(), svelteTesting()],
        test: {
          name: "client-dom",
          environment: "jsdom",
          include: ["src/**/*.svelte.test.ts"],
        },
      },
    ],
  },
});
