// ESLint mechanical gates (AR-13) — CI gates, not review. Two path-scoped rules:
//   1. .send / .broadcast banned everywhere EXCEPT server/src/push-state.ts (the SM-6 egress
//      chokepoint's single send site).
//   2. server/src/rules/** is PURE: no clock/RNG/crypto/fetch/storage/ws/this/console/caches,
//      no dynamic import, and may import (statically OR dynamically) ONLY @trash/shared + relative.
// Proven red-first in Story 1.2 (plant a violation -> lint fails -> remove -> green).
import tseslint from "typescript-eslint";

// GATE 1: ban member access like `connection.send(...)` / `room.broadcast(...)`.
const sendBroadcastBan = [
  "error",
  { property: "send", message: "Only server/src/push-state.ts may call .send (SM-6 egress chokepoint, AR-4)." },
  { property: "broadcast", message: "Only server/src/push-state.ts may call .broadcast (SM-6 egress chokepoint, AR-4)." },
];

// GATE 2: tokens/forms forbidden inside server/src/rules/** (purity denylist).
// Hardened against the bypasses a code review found: globalThis.* access, identifier aliasing,
// the Date constructor, performance/caches, and dynamic import().
const rulesPurityBans = [
  "error",
  // Clock: ban Date.now() AND `new Date()` AND globalThis.Date, in every access shape.
  { selector: "MemberExpression[property.name='now'][object.name='Date']", message: "rules/** is PURE — no Date.now (inject time)." },
  { selector: "MemberExpression[property.name='now'][object.property.name='Date']", message: "rules/** is PURE — no globalThis.Date.now (inject time)." },
  { selector: "NewExpression[callee.name='Date']", message: "rules/** is PURE — no `new Date()` (inject time)." },
  { selector: "Identifier[name='Date']", message: "rules/** is PURE — no Date (inject time)." },
  { selector: "Identifier[name='performance']", message: "rules/** is PURE — no performance.now (inject time)." },
  // RNG: ban Math.random in every shape.
  { selector: "MemberExpression[property.name='random'][object.name='Math']", message: "rules/** is PURE — no Math.random (inject RNG)." },
  { selector: "MemberExpression[property.name='random'][object.property.name='Math']", message: "rules/** is PURE — no globalThis.Math.random (inject RNG)." },
  // Transport / storage / non-determinism — identifier-based so aliasing + globalThis.* are caught
  // (the property side of `globalThis.crypto` is also an Identifier named `crypto`).
  { selector: "Identifier[name='crypto']", message: "rules/** is PURE — no crypto (inject)." },
  { selector: "Identifier[name='fetch']", message: "rules/** is PURE — no fetch (transport-free)." },
  { selector: "Identifier[name='storage']", message: "rules/** is PURE — no storage (no persistence)." },
  { selector: "Identifier[name='ws']", message: "rules/** is PURE — no ws (transport-free)." },
  { selector: "Identifier[name='caches']", message: "rules/** is PURE — no caches (no persistence)." },
  { selector: "Identifier[name='console']", message: "rules/** is PURE — no console." },
  { selector: "ThisExpression", message: "rules/** is PURE — no `this.` (free functions only)." },
  // Dynamic import escapes no-restricted-imports (which only governs static imports), so ban the
  // expression form outright. Static-import purity is enforced by the no-restricted-imports rule below.
  { selector: "ImportExpression", message: "rules/** is PURE — no dynamic import() (static @trash/shared + relative only)." },
];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dev-dist/**",
      "**/.wrangler/**",
      "spike/**",
      "**/*.tsbuildinfo",
    ],
  },

  // Baseline TS recommended rules for all TS files.
  ...tseslint.configs.recommended.map((c) => ({ ...c, files: ["**/*.ts"] })),

  // GATE 1 — .send/.broadcast banned repo-wide by default.
  {
    files: ["**/*.ts"],
    rules: { "no-restricted-properties": sendBroadcastBan },
  },

  // GATE 1 exception — the ONE allowed send site.
  {
    files: ["server/src/push-state.ts"],
    rules: { "no-restricted-properties": "off" },
  },

  // GATE 2 — purity of the rule engine.
  {
    files: ["server/src/rules/**/*.ts"],
    rules: {
      "no-restricted-syntax": rulesPurityBans,
      // Allowlist via regex: @trash/shared (and its subpaths) + relative imports only; ban all else.
      // `allow` is the inverse-match list; anything NOT matching is reported.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!@trash/shared(/.*)?$|\\.{1,2}/).*",
              message: "rules/** may import ONLY @trash/shared or relative paths (purity boundary).",
            },
          ],
        },
      ],
    },
  },
);
