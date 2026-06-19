// Two vitest projects (AR-14):
//   - "rules": node env — pure rule engine + the SM-6 projection negative-assertion test (Story 1.4).
//   - "do":    @cloudflare/vitest-pool-workers — DO-level checks in the Workers runtime.
// Connection-lifecycle / hibernation is tested separately against `wrangler dev`
// (the pool cannot drive a real WS upgrade) — see server/test/integration/.
//
// vitest-pool-workers v4 wires the Workers runtime via the cloudflareTest() PLUGIN
// (the v3 defineWorkersProject/poolOptions API was removed).
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "rules",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.do.test.ts"],
        },
      },
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./wrangler.jsonc" },
          }),
        ],
        test: {
          name: "do",
          include: ["src/**/*.do.test.ts"],
        },
      },
    ],
  },
});
