// ESLint mechanical gates (AR-13) — CI gates, not review. Two path-scoped rules:
//   1. .send / .broadcast banned everywhere EXCEPT server/src/push-state.ts (the SM-6 egress
//      chokepoint's single SERVER→CLIENT game-state send site).
//      Story 1.6 refinement: the ban's REAL target is SERVER game-state egress. Two sites that are
//      NOT server egress are exempted for `.send` ONLY (`.broadcast` stays banned for them):
//        - client/src/socket.ts — the CLIENT's outbound INTENT send (client→server, the opposite
//          direction; carries no game state, cannot leak a secret). Anticipated + deferred by Story 1.5.
//        - server/src/**/*.do.test.ts — the pool-workers test harness drives a CLIENT WebSocket
//          (`ws.send(intent)`) to exercise the round-trip; also client→server, not server egress.
//      push-state.ts remains the ONLY place SERVER game state is sent to a client — SM-6 intact.
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

// GATE 1 partial relaxation for non-egress `.send` sites (client outbound intents + test WS harness).
// `.broadcast` stays banned here — only push-state.ts may broadcast. Keeps the SM-6 server-egress
// chokepoint intact while permitting the client→server direction that createRoom/joinRoom require.
const broadcastOnlyBan = [
  "error",
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
  // Computed member access closes the alias / `globalThis["X"]` / `Math["random"]()` bypass that
  // the identifier+dotted-member selectors above miss (a string-literal property is not an Identifier
  // named Date/Math, and an aliased binding `const m = Math; m["random"]()` has no `Math` token).
  // Property-name match only — legitimate data access like `cfg["foo"]` is untouched.
  { selector: "MemberExpression[computed=true][property.value=/^(Date|Math|crypto|fetch|storage|ws|caches|console|performance)$/]", message: "rules/** is PURE — no computed access to restricted globals (e.g. globalThis['Date'])." },
  { selector: "MemberExpression[computed=true][property.value=/^(random|now|getRandomValues|randomUUID)$/]", message: "rules/** is PURE — no computed access to clock/RNG methods (e.g. Math['random'], aliased Date['now'])." },
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

  // GATE 1 exception — the ONE allowed SERVER→CLIENT game-state send site.
  {
    files: ["server/src/push-state.ts"],
    rules: { "no-restricted-properties": "off" },
  },

  // GATE 1 partial relaxation — non-egress `.send` sites (client→server intents + test WS harness).
  // `.send` allowed (these carry no server-side game state); `.broadcast` STILL banned. SM-6's
  // server-egress chokepoint (push-state.ts) is unaffected. [Story 1.6 — createRoom outbound intent.]
  {
    files: ["client/src/socket.ts", "server/src/**/*.do.test.ts"],
    rules: { "no-restricted-properties": broadcastOnlyBan },
  },

  // GATE 2 — purity of the rule engine.
  {
    files: ["server/src/rules/**/*.ts"],
    rules: {
      "no-restricted-syntax": rulesPurityBans,
      // Allowlist via regex: @trash/shared (and its subpaths) + SAME-TREE `./` imports only; ban all else.
      // `allow` is the inverse-match list; anything NOT matching is reported.
      // NOTE: `../` is banned (was `\\.{1,2}/`) — every parent of rules/ is an impure server module
      //   (persistence.ts, identity.ts, …), so a `../sibling` import would launder impurity into the
      //   pure graph past the per-file syntax bans. Intra-engine files live flat in rules/ (reach via ./).
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!@trash/shared(/.*)?$|\\./).*",
              message: "rules/** may import ONLY @trash/shared or same-tree ./ paths (purity boundary — no ../ escapes).",
            },
          ],
        },
      ],
    },
  },
);
