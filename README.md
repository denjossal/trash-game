# Trash

A private-by-default, zero-cost, server-authoritative party card game on Cloudflare
Workers + Durable Objects (SQLite) + Pages.

## Workspaces

Three npm workspaces in one repo:

- **`shared`** — `@trash/shared`, the wire contract (types + game-tunable config), imported by name by both other packages.
- **`server`** — the Cloudflare Worker: one Durable Object per Table, the pure rule engine (`src/rules/`), and the privacy chokepoint (`project-state.ts` + `push-state.ts`).
- **`client`** — the Vite + Svelte PWA, deployed to Cloudflare Pages.

## Commands (from repo root)

| Command | What it does |
|---|---|
| `npm run dev` | `wrangler dev` (server) + `vite` (client) — multi-tab = multi-player local playtest |
| `npm test` | vitest — two projects: node (rules + projection) and `@cloudflare/vitest-pool-workers` (DO) |
| `npm run lint` | ESLint mechanical gates: `.send`/`.broadcast` path-scope ban + `server/src/rules/**` purity |
| `npm run typecheck` | `tsc -b` across all workspaces |
| `npm run build` | `vite build` (client) |

## Deploy

- **Server:** `npm run deploy --workspace=server` (`wrangler deploy`).
- **Client:** `vite build` → Cloudflare Pages.

Both run at $0 on the free tier (Workers + DO SQLite + Pages + WebSocket Hibernation, idle-to-zero).
