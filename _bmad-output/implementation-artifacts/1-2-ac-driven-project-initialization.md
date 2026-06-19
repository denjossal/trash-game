---
baseline_commit: NO_VCS
---

# Story 1.2: AC-driven project initialization

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the builder,
I want the repo scaffolded exactly to the architecture's init contract with the enforcement gates live from commit one,
so that every later story inherits the correct workspace layout, free-tier guarantees, and mechanical guardrails.

## Acceptance Criteria

> Verbatim from epics.md#Story-1.2 (lines 247–269), keyed for task traceability. The architecture's "Init-Story Acceptance Criteria" (architecture.md:254–276) is the authoritative expansion of AC1.

**AC1 — Workspace + Worker scaffold to the init contract (AR-1, architecture Init ACs 1–6)**
Given a fresh repo,
When initialization completes,
Then three npm workspaces exist — `shared`, `server`, `client` — with `shared` importable **by name** as `@trash/shared` (NO path-alias hack),
And the server uses the C3 **"Worker only"** template (NOT the DO template), with `wrangler.jsonc` declaring `migrations: [{ tag: "v1", new_sqlite_classes: ["TableServer"] }]` correct in this **first commit**, a pinned recent `compatibility_date`, and the DO binding **name ↔ `class_name` ↔ exported class symbol all matching**,
And the Worker fetch entry calls `routePartykitRequest(request, env)`,
And deps are pinned to the architecture's verified versions; directory layout matches the architecture tree (see Project Structure Notes — `server/src/rules/`, `server/src/`, `shared/src/`, `client/src/`, `server/test/integration/`).

**AC2 — Two-project vitest, both green on empty scaffold (AR-14)**
Given the vitest configuration,
When tests run,
Then there are two projects — **node env** (rules + projection) and **`@cloudflare/vitest-pool-workers`** (DO) — both green on an empty scaffold.

**AC3 — ESLint mechanical gates fail red-first then pass (AR-1, AR-13)**
Given the ESLint configuration (the mechanical privacy/purity gates),
When a `Date.now()` / `Math.random()` / `crypto` / `fetch` / `storage` / `this.` token is planted in `server/src/rules/**`, OR a `.send(` / `.broadcast(` is planted outside `server/src/push-state.ts`,
Then lint **FAILS** on each planted violation (the ban tests go red first — red/green discipline),
And removing the planted violations returns lint to green.

## Tasks / Subtasks

> ⚠️ This is the ONE place in Epic 1 where TDD red-first discipline applies to config: the ESLint ban-rules must be proven to FAIL (red) on a planted violation BEFORE you remove it (green). Story 1.1's findings explicitly note: "Amelia's TDD discipline resumes at Story 1.2's ESLint-gate red-first work." Do NOT write the rule and assume it works — plant a violation, watch lint fail, remove it, watch lint pass.

- [x] **Task 0 — Re-verify pinned versions at build time** (AC: 1) — DONE. All 8 pins match the 2026-06-19 snapshot exactly (no drift); `partyserver` 0.5.8 confirmed as the library in `cloudflare/partykit` (`packages/partyserver`).
  - [x] `npm view` confirmed: vite 8.0.16 · svelte 5.56.3 · @sveltejs/vite-plugin-svelte 7.1.2 · partyserver 0.5.8 · partysocket 1.2.0 · wrangler 4.103.0 · vitest 4.1.9 · @cloudflare/vitest-pool-workers 0.16.18. `vite-plugin-pwa` (not in the architecture list) = 1.3.0.
  - [x] `partyserver` repository.url = `cloudflare/partykit`, homepage = `packages/partyserver` — the maintained library, not the legacy CLI.

- [x] **Task 1 — Root workspace + shared package** (AC: 1) — DONE.
  - [x] Root `package.json` (private, `type:module`): `"workspaces": ["shared","server","client"]`; scripts `dev`/`test`/`lint`/`typecheck`/`build`.
  - [x] `tsconfig.base.json` at root; each package tsconfig extends it.
  - [x] `shared/` workspace: `@trash/shared` package.json, tsconfig.json, src/index.ts, src/types.ts, src/config.ts.
  - [x] SCOPE GUARD honored: `types.ts` is a stub (`SharedContractVersion` placeholder); `config.ts` holds the game tunables. Full contract deferred to 1.3.
  - [x] Import-by-name verified: `node_modules/@trash/shared -> ../../shared` symlink; node scaffold test imports `DEFAULT_LIVES`/`ROOM_CODE_LEN` from `@trash/shared`; NO `paths`/`baseUrl` alias anywhere.

- [x] **Task 2 — Server (Cloudflare Worker) scaffold** (AC: 1) — DONE. (Authored the Worker-only scaffold files directly — equivalent to the C3 template; the interactive generator needs prompts unavailable here. Shape proven by Story 1.1.)
  - [x] Worker-only scaffold (NOT the DO template) — minimal Worker + `partyserver` library.
  - [x] `server/package.json`: dep `partyserver` 0.5.8; devDeps `wrangler` 4.103.0, `@cloudflare/vitest-pool-workers` 0.16.18, `vitest` 4.1.9 (all pinned exact).
  - [x] `server/wrangler.jsonc`: `main: src/index.ts`; binding `{name:"Table",class_name:"TableServer"}`; `migrations:[{tag:"v1",new_sqlite_classes:["TableServer"]}]`; `compatibility_date 2026-06-01`; `observability.enabled`.
  - [x] `server/src/index.ts`: fetch → `routePartykitRequest(request, env)`; exports `TableServer`.
  - [x] `server/src/table-server.ts`: minimal `class TableServer extends Server<...>` (no game logic).
  - [x] Seam skeleton created with boundary comments: `rules/` (.gitkeep), `project-state.ts`, `push-state.ts`, `dispatch.ts`, `handlers.ts`, `persistence.ts`, `room-code.ts`, `identity.ts`, `test/integration/` (.gitkeep).
  - [x] `server/.dev.vars.example`.
  - [x] `wrangler deploy --dry-run`: compiled (33.93 KiB); `env.Table (TableServer)` Durable Object binding resolved (Init AC3 verified).

- [x] **Task 3 — Two-project vitest, both green** (AC: 2) — DONE.
  - [x] `server/vitest.config.ts`: two projects — `rules` (node env) + `do` (`@cloudflare/vitest-pool-workers`). NOTE: this pool version (0.16.18 / vitest 4) dropped the `/config` `defineWorkersProject` API; wired via the `cloudflareTest()` plugin per the pool's own v3→v4 codemod.
  - [x] One smoke test per project: `scaffold.test.ts` (node — also asserts `@trash/shared` import-by-name) + `scaffold.do.test.ts` (resolves the `Table` DO binding in the Workers runtime).
  - [x] `npm test` from root: both `|rules|` and `|do|` projects green (2 files, 2 tests).

- [x] **Task 4 — ESLint mechanical gates (RED-FIRST)** (AC: 3) — DONE, red→green verified.
  - [x] `eslint.config.js`: (a) `no-restricted-properties` bans `.send`/`.broadcast` repo-wide, turned OFF only for `server/src/push-state.ts`; (b) `server/src/rules/**` purity via `no-restricted-syntax` (Date.now/Math.random/crypto/fetch/storage/ws/this/console) + `no-restricted-imports` (only `@trash/shared`).
  - [x] **RED:** planted `.send` outside push-state.ts + Date.now/Math.random/console in a rules file → lint exit 1 with 4 errors, each on the correct rule. (Debug Log.)
  - [x] **GREEN:** removed planted files → lint exit 0.
  - [x] Exception confirmed: a `.send(...)` placed inside `push-state.ts` → lint exit 0 (the one allowed site).

- [x] **Task 5 — Client (Vite + Svelte) scaffold** (AC: 1) — DONE. (Authored Vite+Svelte files directly — equivalent to `--template svelte-ts`.)
  - [x] `client/package.json`: deps `svelte` 5.56.3, `partysocket` 1.2.0, `@trash/shared`; devDeps `@sveltejs/vite-plugin-svelte` 7.1.2, `vite` 8.0.16, `vite-plugin-pwa` 1.3.0, `svelte-check`.
  - [x] `client/vite.config.ts`: svelte plugin + `VitePWA` (app-shell only, placeholder manifest — content deferred to 1.9/1.10). No Tailwind.
  - [x] `client/src/main.ts` (mount stub) + `App.svelte` (stub importing the shared contract type) + `index.html` + `vite-env.d.ts`.
  - [x] `vite build` succeeds: Svelte compiled, PWA SW + manifest generated.

- [x] **Task 6 — CI workflow** (AC: 1, 2, 3) — DONE.
  - [x] `.github/workflows/ci.yml`: `npm ci` → `typecheck` + `lint` + `test`.
  - [x] `.gitignore` extended (dist, .wrangler, .dev.vars, tsbuildinfo) — `/spike/` line PRESERVED (verified).
  - [x] `README.md` (workspaces + commands + deploy).

- [x] **Task 7 — Full green pass** (AC: 1, 2, 3) — DONE. All five green from root: ✅ typecheck · ✅ lint · ✅ vitest (both projects) · ✅ wrangler dry-run · ✅ vite build.

### Review Findings

> Code review 2026-06-19 (Amelia). 3-layer adversarial (Blind / Edge Case / Acceptance). Real product-foundation code → production bar. The scaffold's ACs are all met and both flagged deviations cleared, BUT the reviewers found that several **mechanical gates have holes** — exactly the failure mode that matters most for a foundation story, since later stories inherit these gates. All patches applied this session; re-verified green.

- [x] [Review][Patch] Client typecheck/build gate did NOT typecheck `.svelte` (svelte-check installed but unwired; broken Svelte shipped green) [client/package.json] — FIXED: wired `svelte-check` into `typecheck`/`build` + CI.
- [x] [Review][Patch] `rules/**` `no-restricted-imports` banned `@trash/shared` — the one allowed import (failed closed; would break CI for Story 1.3+) [eslint.config.js] — FIXED: corrected to allow `@trash/shared` + relative, ban everything else.
- [x] [Review][Patch] `globalThis.Date.now()` / `globalThis.Math.random()` bypassed the purity selectors [eslint.config.js] — FIXED: added globalThis-aware + property-name selectors.
- [x] [Review][Patch] `console` ban defeated by alias / `globalThis.console` [eslint.config.js] — FIXED: hardened to identifier-based ban.
- [x] [Review][Patch] `new Date()` / `performance.now()` / `caches` not banned in `rules/**` [eslint.config.js] — FIXED: added bans (Date constructor, performance, caches).
- [x] [Review][Patch] Dynamic `import()` bypassed the `rules/**` import restriction [eslint.config.js] — FIXED: banned `ImportExpression` in rules/**.
- [x] [Review][Patch] partyserver kebab-cases the binding → URL namespace is `/parties/table/` (lowercase); comment omitted this (downstream 404 risk) [server/src/index.ts] — FIXED: comment added.
- [x] [Review][Defer] Client `tsc -b` permanently "out of date" (noEmit + non-composite defeats incremental rebuild) [client/tsconfig.json] — deferred, cosmetic; functionally typechecks fine. Revisit if client build time becomes a problem.

### Review Findings (2026-06-19, round 2 — full-commit adversarial review)

> Second adversarial review (Blind Hunter / Edge Case Hunter / Acceptance Auditor) against the full initial commit. All 3 ACs re-confirmed MET; the round-1 patches all verified genuinely present. New findings are all about the *reach* of the mechanical gates — load-bearing bypasses were empirically probed (lint run against planted violations) before classification, and 6 plausible-sounding bypass claims were dismissed as false positives (computed `conn["send"]()`, optional-chain `conn?.send()`, `Date["now"]()` — all CAUGHT by probe).

**Decision-needed (both resolved → deferred):**
- [x] [Review][Decision→Defer] Root `npm test` only runs the `server` workspace — `client`/`shared` have no test gate. RESOLVED: deliberate for now — client/shared are stubs (per the 1.3 scope boundary) with nothing meaningful to test. Broaden the root `test` script when client/shared get real logic (1.3+). [package.json]
- [x] [Review][Decision→Defer] The `.send`/`.broadcast` egress ban is scoped to `**/*.ts` only; `.svelte`/`.js` are unguarded. RESOLVED: server-only is correct by design — SM-6 is the SERVER's single send site (`push-state.ts`); the client legitimately calls `socket.send(intent)`, so a client-side ban would be wrong. Action: document the scope intent in the gate comment (deferred, low priority). [eslint.config.js]

**Patch (probe-confirmed real) — ALL APPLIED + re-verified green-on-clean, red-on-violation:**
- [x] [Review][Patch] `rules/**` purity bypassable via computed/aliased global access — `Math["random"]()` (aliased binding) and `globalThis["Date"]` evaded the selectors. FIXED [eslint.config.js]: added two computed-`MemberExpression` bans (restricted-global names + clock/RNG method names) keyed on `property.value`. Re-proof: `const m = Math; m["random"]()` now flagged; legitimate `cfg["foo"]` data access untouched.
- [x] [Review][Patch] `rules/**` import allowlist permitted `../` escapes — `import from "../persistence.js"` (an impure server sibling) was allowed by `\.{1,2}/`. FIXED [eslint.config.js]: tightened regex to `^(?!@trash/shared(/.*)?$|\./).*` — allows `@trash/shared` + same-tree `./` only, bans `../`. Re-proof: `../persistence.js` now flagged; `@trash/shared` + `./` still allowed.
- [x] [Review][Patch→Defer] Vitest partition silently drops any test file not ending `.test.ts`/`.do.test.ts`. RESOLVED as a documented convention rather than guard machinery — the partition is exhaustive for the repo's only test suffix; the "hole" requires inventing a non-conventional filename. Added a TEST-FILE NAMING CONVENTION comment to `server/vitest.config.ts` warning that no other suffix is recognized.
- [x] [Review][Patch] `@trash/shared: "*"` was the weakest constraint. FIXED [server/package.json, client/package.json]: pinned to `"0.0.0"` (matches the workspace version). NOTE: the reviewers suggested `workspace:*`, but this repo uses **npm 11** workspaces and npm does NOT support the `workspace:` protocol (pnpm/yarn/bun only) — `workspace:*` would break `npm install`. The `0.0.0` pin resolves to the local symlink and rejects a registry package of a different version. Re-verified: `npm install --dry-run` exit 0, `@trash/shared` still links locally.

**Deferred (real, not actionable now):**
- [x] [Review][Defer] partyserver kebab-cases the binding → `/parties/table/<name>` routing is comment-only and untested; `scaffold.do.test.ts` uses `env.Table` directly, bypassing routing, so a client hitting `/parties/Table/...` would 404 with the gate green. Routing assertion belongs in the Story 1.7 integration tests. [server/src/index.ts]
- [x] [Review][Defer] `rules/**` purity does not ban scheduling/ambient non-determinism globals (`setTimeout`, `queueMicrotask`, `setInterval`, `Intl`, `WeakRef`, `FinalizationRegistry`); the denylist is a fixed enumerated set. Extend when the engine (Epic 2) actually needs guarding. [eslint.config.js]
- [x] [Review][Defer] `compatibility_date`/version-pin freshness is comment-only ("re-verify at run time") with no automated assertion — relies on a human reading the comment at deploy. [server/wrangler.jsonc]
- [x] [Review][Defer] No `engines` field; the Node floor for vite 8 / vitest 4 / wrangler 4.103 is unenforced locally (CI pins Node 22), so a contributor on an older Node hits a different failure than CI. [package.json]
- [x] [Review][Defer] `.ts`-as-package-entry (`shared` `main`/`exports` → `./src/index.ts`) works only under bundler/dev resolution; a node-native consumer would fail to load `.ts`. Acceptable for an internal monorepo; landmine only if anything ever does node-native resolution. [shared/package.json]

> Dismissed as noise (6): computed `conn["send"]()` ban-evasion (probe: CAUGHT), optional-chain `conn?.send()` (probe: CAUGHT), `Date["now"]()` (caught by blanket `Date` identifier ban), purity identifier-bans firing on type positions (intentional per spec "denylist tokens"), redundant `globalThis.Date.now` selector (redundant ≠ defect), and the client `tsc -b` incremental-cache item (already deferred in round 1).

## Dev Notes

### What this story IS and IS NOT

- **IS:** the AC-driven scaffold — three workspaces, the Worker + SQLite-DO binding correct in commit one, two-project vitest green on empty, ESLint mechanical gates proven red-then-green, CI wired.
- **IS NOT:** the wire contract (1.3), the privacy chokepoint/SM-6 test (1.4), identity (1.5), room creation (1.6), any surface/tokens/PWA-content (1.9/1.10), or the GC alarm (1.11). Create the **seam files** (empty/stub) so the layout and ESLint path-scopes are real, but do NOT fill them.
- This is **not** the throwaway spike. Story 1.1's `spike/` code MUST NOT be carried into this scaffold (decision #9; Story 1.1 Dev Notes). The real repo is built fresh here.

### CRITICAL: directory-layout source of truth (variance flagged)

The epic AC text (epics.md:260) says `server/src/server/`. The architecture's authoritative directory tree (architecture.md:657–732) does **NOT** nest a `server/` under `src/` — server modules live flat under `server/src/` (`table-server.ts`, `project-state.ts`, `push-state.ts`, `dispatch.ts`, `handlers.ts`, `persistence.ts`, `room-code.ts`, `identity.ts`) with the pure engine under `server/src/rules/`. **Follow the architecture tree** — it is the later, detailed, validated layout. The epic's `src/server/` phrasing predates the architecture's structure section. [Source: architecture.md#Complete-Project-Directory-Structure]

### Init-Story Acceptance Criteria (the authoritative AC1 expansion) — architecture.md:254–276

1. C3 **"Worker only"** template (NOT the DO template — DO template = `new_classes` key-value DO; we REQUIRE `new_sqlite_classes`).
2. `migrations: [{ tag: "v1", new_sqlite_classes: ["TableServer"] }]` correct in **commit one** — migration tags are append-only/immutable; a later "fix" can't rewrite `v1` without deleting the DO.
3. `wrangler.jsonc` **binding name ↔ `class_name` ↔ exported class symbol** all match (mismatch → runtime "DurableObject class not found").
4. Pin a recent `compatibility_date` (must support SQLite-in-DO + WS hibernation).
5. **Authoritative Table state persists to `ctx.storage`; DO instance fields are cache-only** — the storage seam exists from day one (no mid-round persistence logic yet; just the seam).
6. Pinned deps + versions; directory layout per the tree; `routePartykitRequest(request, env)` in the Worker fetch handler.

### Pinned versions (architecture 2026-06-19 snapshot — RE-VERIFY at build time, Task 0)

`vite 8.0.16` · `svelte 5.56.3` · `@sveltejs/vite-plugin-svelte 7.1.2` · `partyserver 0.5.8` · `partysocket 1.2.0` · `wrangler 4.103.0` · `vitest 4.1.9` · `@cloudflare/vitest-pool-workers 0.16.18`. Pin EXACT versions (no `^`/`~` on these critical ones). [Source: architecture.md#Web-Verified-Facts, lines 176–178]

### Initialization commands (verified 2026-06-19 — Story 1.1 confirmed the server half works)

```bash
# Server — C3 "Worker only" template (NOT the DO template)
npm create cloudflare@latest server -- --type=hello-world --ts --no-deploy --no-git
npm install partyserver
npm install -D @cloudflare/vitest-pool-workers vitest wrangler
# wrangler.jsonc: durable_objects bindings {name:"Table",class_name:"TableServer"};
#   migrations [{tag:"v1",new_sqlite_classes:["TableServer"]}]; pinned compatibility_date;
#   Worker fetch entry: routePartykitRequest(request, env)

# Client — Vite + Svelte (no Tailwind)
npm create vite@latest client -- --template svelte-ts
cd client && npm install && npm install partysocket @trash/shared
npm install -D vite-plugin-pwa
```
[Source: architecture.md#Initialization-Commands, lines 216–233]

### ESLint gates — exact ban rules (AR-13, the agent-checkable rule table)

- **`.send`/`.broadcast` path-scope ban (repo-wide except `server/src/push-state.ts`):** `no-restricted-properties` on `send` and `broadcast`. This is the SM-6 privacy chokepoint enforcement — only `push-state.ts` may call `connection.send`. [Source: architecture.md#The-rules table, line 545]
- **`server/src/rules/**` purity:** denylist tokens `Date.now`, `Math.random`, `crypto`, `fetch`, `ws`, `storage`, `this.`, `console`; import restriction → may import ONLY `@trash/shared`. `IntentError` (a pure class in `@trash/shared`, authored 1.3) is import-safe and does NOT break purity. [Source: architecture.md#The-rules table line 553; #Architectural-Boundaries lines 744–746]
- Red-first is the AC (AC3): the ban must be PROVEN to fail on a planted violation, then pass on removal. [Source: epics.md:266–269]

### Root scripts (suggested)

`dev` = `wrangler dev` (server) + `vite dev` (client) concurrently; `test` = vitest across workspaces; `lint` = eslint; `typecheck` = `tsc -b` across workspaces. Client `socket.ts` (later) reads `VITE_WS_URL` — never hardcode localhost. [Source: architecture.md#Development/Build/Deploy, lines 780–789]

### Architecture boundaries this scaffold must make REAL (even as stubs)

- **Privacy chokepoint:** `project-state.ts` (pure projector) + `push-state.ts` (sole send site) exist as two named files — the names ARE the invariant. [architecture.md:741–743]
- **Purity boundary:** `server/src/rules/**` imports only `@trash/shared`. [architecture.md:744–746]
- **State-mutation boundary:** `this.table = …` / `ctx.storage` writes only in `handlers.ts` (no logic yet, just the file). [architecture.md:747–748]
- **Contract boundary:** `@trash/shared` imported by name by both server and client; a contract change must break BOTH compilations (verified fully in 1.3). [architecture.md:751–753]
- **`ctx.storage` uses ONE key `"table"`** (D2) — relevant to 1.6+/1.11, not exercised here. [architecture.md:557]
- **Watch-list:** do NOT pre-create `client/src/components/` — let the first reused widget pull it into existence. `table-server.ts` is the god-module risk; keep it minimal. [architecture.md:731, 790–792]

### Standing gates this story must pass (Epic 0)

- **G2 ($0 / no paid dependency):** every dep added here must be free-tier-only — Cloudflare Workers + DO (SQLite) + Pages + WS Hibernation. No managed/paid tier, no push service, no paid analytics. The SQLite-DO (`new_sqlite_classes`) IS the free-tier requirement. [Source: epics.md#Story-G2, lines 198–212]
- **G1 (Eyes-up):** no surfaces ship here, so trivially satisfied — but do not scaffold any feed/chat/badge/analytics primitive. [Source: epics.md#Story-G1]

### Previous Story Intelligence — Story 1.1 (the spike, status `review`, GO recorded)

- **GO decision recorded** — the DO-per-Table premise is validated; proceed to 1.2. [1-1-...md Change Log, 2026-06-19]
- **Reuse this proven knowledge:** the exact `wrangler.jsonc` shape (SQLite DO via `new_sqlite_classes`, binding `Table`↔`TableServer`), `routePartykitRequest` in the fetch entry, and `wrangler deploy --dry-run` as the compile check — all confirmed working in the spike. The spike's `spike/wrangler.jsonc` and `spike/src/index.ts` are a correct REFERENCE for shape (not for copy-paste — fresh repo).
- **CARRY-FORWARD CORRECTION (do not lose):** Story 1.1 found `ctx.getWebSockets()` returns 0 for partyserver's default standard-mode sockets, so the GC probe (Story 1.11) must enable partyserver Hibernation or count `getConnections()`. **Not 1.2's job** — but if you touch `table-server.ts` WS config, do NOT bake in the broken `getWebSockets().length === 0` assumption. [Source: 1-1-spike-findings.md AC3; AR-11 correction; carried to Story 1.11]
- **CLEANUP DEPENDENCY:** Story 1.1 left `spike/` on disk (deletion deferred to user — needs `wrangler delete` auth). Before/while scaffolding, confirm the `spike/` directory does not collide with or get mistaken for the real `server/`. The repo `.gitignore` ignores `/spike/`; preserve that until the spike is torn down. [Source: 1-1-...md Task 5 last subtask]
- **Env gotcha (this machine):** system `curl` (LibreSSL 3.3.6) fails TLS to `*.workers.dev`; use `curl --tlsv1.2` or node fetch if any edge check is needed. [Source: 1-1-spike-findings.md Environment notes]

### Git Intelligence

Repo has **zero commits** (Story 1.1 worked in a gitignored `spike/`). This story produces the **first real commit(s)** of the actual project. Critical-path consequence: AC1's "`migrations` correct in **commit one**" is literal — `v1` is immutable, so get `new_sqlite_classes` right before the first DO is ever created. Suggest committing the scaffold once all five green checks (Task 7) pass.

### Testing Standards (AR-14)

- Vitest, two projects: **node env** (pure rules + projection negative-assertion — only a smoke test here) and **`@cloudflare/vitest-pool-workers`** (DO-level — smoke test here). Both green on empty scaffold = AC2.
- Connection-lifecycle/hibernation is tested via integration against `wrangler dev` (the pool-workers project CANNOT drive a real WS upgrade) — `server/test/integration/` dir exists now, populated in 1.7/1.11.
- The SM-6 negative-assertion privacy test is a **pure-function** node test authored in Story 1.4 — CI is wired here to run vitest so 1.4 just adds the test. [Source: architecture.md#Testing, lines 246–250, 785–787]

### Project Structure Notes

- **Target tree** (authoritative — architecture.md:657–732): `trash-game/{package.json, tsconfig.base.json, eslint.config.js, .gitignore, .github/workflows/ci.yml, shared/, server/, client/}`. See the architecture tree for the full per-file layout and the boundary comments — replicate the structure and the comment intent.
- **Variance:** epic AC says `server/src/server/`; architecture tree says flat `server/src/` + `server/src/rules/`. **Resolution: follow the architecture tree** (documented above under "directory-layout source of truth").
- **Scope boundary with 1.3:** `@trash/shared` is a compiling stub here; 1.3 authors the full contract. Keep `types.ts` minimal so 1.3 doesn't have to undo anything.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.2 (lines 247–269) — the source ACs]
- [Source: _bmad-output/planning-artifacts/epics.md#Party-Mode-Review-Decisions — #2 (full TableState up front, 1.3), #9 (spike gate before 1.2)]
- [Source: _bmad-output/planning-artifacts/epics.md#Requirements-Inventory — AR-1, AR-3, AR-13, AR-14; NFR-3; G1/G2]
- [Source: _bmad-output/planning-artifacts/architecture.md#Init-Story-Acceptance-Criteria (254–276)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Web-Verified-Facts (165–179) — pinned versions + free-tier facts]
- [Source: _bmad-output/planning-artifacts/architecture.md#Selected-Approach + Initialization-Commands (190–252)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation-Patterns — The rules table (540–558), Enforcement summary (640–647)]
- [Source: _bmad-output/planning-artifacts/architecture.md#Complete-Project-Directory-Structure (650–732) — AUTHORITATIVE layout]
- [Source: _bmad-output/planning-artifacts/architecture.md#Architectural-Boundaries + Development/Build/Deploy (737–792)]
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-06-19.md — item 2 (1.2 satisfies AC-driven init), Handoff priority #2]
- [Source: _bmad-output/implementation-artifacts/1-1-pre-build-spike-...md + 1-1-spike-findings.md — GO decision, reusable wrangler config, AR-11 GC correction, spike cleanup dependency]

## Dev Agent Record

### Agent Model Used

Amelia (Senior Software Engineer persona) on Claude Opus 4.8 (1M context).

### Debug Log References

- **Task 0 versions** (`npm view`): vite 8.0.16 · svelte 5.56.3 · @sveltejs/vite-plugin-svelte 7.1.2 · partyserver 0.5.8 · partysocket 1.2.0 · wrangler 4.103.0 · vitest 4.1.9 · @cloudflare/vitest-pool-workers 0.16.18 — all match snapshot. partyserver repository.url = `git://github.com/cloudflare/partykit.git`.
- `npm install` → added 547 packages, 0 vulnerabilities; `@trash/shared` symlinked into node_modules (import-by-name works).
- `npm run typecheck` (`tsc -b shared server client`) → exit 0.
- **ESLint RED** (planted violations): exit 1, 4 errors — `no-restricted-properties` (.send outside push-state.ts) + `no-restricted-syntax` ×3 (Date.now, Math.random, console in rules/**).
- **ESLint GREEN** (violations removed): exit 0. Exception check — `.send` inside push-state.ts: exit 0 (allowed).
- `vitest run --reporter=verbose` → `✓ |rules| src/scaffold.test.ts` + `✓ |do| src/scaffold.do.test.ts` (2 passed).
- `wrangler deploy --dry-run` → Total Upload 33.93 KiB; `env.Table (TableServer)` Durable Object binding resolved; exit 0.
- `vite build` → 109 modules; PWA v1.3.0 generated `sw.js` + `manifest.webmanifest`; exit 0.

### Completion Notes List

- **All 3 ACs satisfied.** AC1 (workspaces + Worker/SQLite-DO scaffold + import-by-name + binding match + pinned versions + architecture-tree layout), AC2 (two vitest projects both green), AC3 (ESLint gates proven red→green with the push-state.ts exception).
- **Directory-layout variance resolved as planned:** followed the architecture tree (flat `server/src/` + `server/src/rules/`), NOT the epic AC's `server/src/server/` phrasing. Seam files created as stubs so the layout + ESLint path-scopes are real.
- **Scope boundary with 1.3 honored:** `@trash/shared` is a compiling stub (`SharedContractVersion` + config tunables only); the full wire contract is left for Story 1.3.
- **DEVIATION — vitest-pool-workers config API:** the story's config sketch used the v3 `defineWorkersProject` from `@cloudflare/vitest-pool-workers/config`, but pinned version 0.16.18 (vitest 4) REMOVED that subpath. Migrated to the v4 `cloudflareTest()` plugin form (`import { cloudflareTest } from "@cloudflare/vitest-pool-workers"` + `defineConfig` from `vitest/config`), per the pool's own bundled v3→v4 codemod. No version change — same pinned dep, corrected config shape. Flag for review.
- **DEVIATION — scaffold authored directly, not via interactive generators:** `npm create cloudflare`/`npm create vite` are interactive and can't run unattended here. The resulting files are equivalent to the C3 "Worker only" + `svelte-ts` templates and the wrangler dry-run + vite build confirm correctness. Flag for review.
- **Added root devDeps not pre-listed in the story:** `eslint` 9.39.1, `typescript` 5.9.3, `typescript-eslint` 8.46.4 (root), `svelte-check` (client). Necessary to run the AC3 lint gate + typecheck; all free/dev-only (G2-clean). Flag for review.
- **`compatibility_date 2026-06-01`** carried from the Story 1.1 spike (accepted by wrangler 4.103.0; dry-run clean). Re-verify/bump at deploy time per the standing instruction.
- **Carry-forwards still open (NOT this story):** AR-11 GC `getWebSockets()` correction → Story 1.11; atomic claim-on-create → Story 1.6; `spike/` teardown (`wrangler delete` + `rm -rf spike`) still pending user auth — `/spike/` remains gitignored and is ESLint-ignored.
- **First real commit:** repo had zero commits; `migrations v1 new_sqlite_classes` is correct in this first scaffold (immutable tag). Not committed yet — left to the user.

### File List

NEW (all paths relative to repo root):
- `package.json` — private root; workspaces shared/server/client; scripts; root devDeps
- `tsconfig.base.json` — shared compiler options (no path-alias)
- `eslint.config.js` — the two mechanical gates (AR-13)
- `.gitignore` — MODIFIED (extended; preserved `/spike/`)
- `.github/workflows/ci.yml` — typecheck + lint + test
- `README.md`
- `shared/package.json`, `shared/tsconfig.json`, `shared/src/index.ts`, `shared/src/types.ts` (stub), `shared/src/config.ts` (game tunables)
- `server/package.json`, `server/tsconfig.json`, `server/wrangler.jsonc`, `server/vitest.config.ts`, `server/.dev.vars.example`
- `server/src/index.ts` (Worker entry + routePartykitRequest), `server/src/table-server.ts` (minimal DO)
- `server/src/project-state.ts`, `push-state.ts`, `dispatch.ts`, `handlers.ts`, `persistence.ts`, `room-code.ts`, `identity.ts` (seam stubs)
- `server/src/rules/.gitkeep`, `server/test/integration/.gitkeep`
- `server/src/scaffold.test.ts` (node smoke), `server/src/scaffold.do.test.ts` (DO smoke), `server/src/env.test.d.ts`
- `client/package.json`, `client/tsconfig.json`, `client/vite.config.ts`, `client/svelte.config.js`, `client/index.html`
- `client/src/main.ts`, `client/src/App.svelte`, `client/src/vite-env.d.ts`
- `package-lock.json` (generated)

## Change Log

- 2026-06-19 — Scaffolded the AC-driven three-workspace project (shared/server/client). Worker + SQLite-DO binding correct in the first scaffold (`new_sqlite_classes` v1); `routePartykitRequest` wired; pinned verified versions. Two-project vitest (node `rules` + pool-workers `do`) green. ESLint mechanical gates (`.send`/`.broadcast` path-scope ban + `rules/**` purity) proven RED on planted violations then GREEN. CI wired (typecheck+lint+test). All five gates green. Status → review. Two config deviations flagged for review (vitest-pool-workers v4 plugin API; scaffold authored directly vs. interactive generators).
- 2026-06-19 — Addressed code review findings — 7 patches applied, 1 deferred. The review found the mechanical gates had HOLES (the highest-stakes failure for a foundation story): (1) client typecheck/build did NOT typecheck `.svelte` (wired `svelte-check` into typecheck/build/CI); (2) `rules/**` import rule banned `@trash/shared` itself — failed closed (corrected the allowlist regex); (3–6) purity selectors bypassable via `globalThis.*`, the `Date` constructor, `performance`/`caches`, aliased `console`, and dynamic `import()` (hardened all selectors + banned `ImportExpression`); (7) added `@cloudflare/workers-types` as a direct devDep + documented partyserver's kebab-cased `/parties/table/` namespace. Each fix re-verified empirically (allowed-import now passes; all 6 bypass forms now go red; svelte-check catches a planted Svelte type error). Deferred: client `tsc -b` incremental-cache cosmetic. Full five gates re-confirmed green (incl. a cold CI-equivalent typecheck).
