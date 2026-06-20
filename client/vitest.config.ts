// Client vitest — node-env project for PURE client functions (Story 1.9a: the render-from-state
// router). The router is a pure (ProjectedTableState | null) -> Surface function, so it needs no DOM
// and no Workers runtime — plain node env, mirroring the server's "rules" project (AR-14).
//
// Svelte component testing is intentionally NOT set up here (no surface needs it yet — the surfaces
// are render-from-state stubs in 1.9a; the routing CORRECTNESS lives in the extracted pure function).
// Add a jsdom/@testing-library project later if a surface grows logic worth mounting.
//
// TEST-FILE NAMING: `*.test.ts` only (same convention as server/vitest.config.ts).
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "client",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
