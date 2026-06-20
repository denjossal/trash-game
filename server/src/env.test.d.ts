// Types for the @cloudflare/vitest-pool-workers `cloudflare:test` module env, so the DO
// smoke test typechecks. Bindings mirror wrangler.jsonc.
declare module "cloudflare:test" {
  interface ProvidedEnv {
    Table: DurableObjectNamespace;
  }
  export const env: ProvidedEnv;
  // Service binding to the default Worker export — used by table-server.do.test.ts to drive a real
  // WebSocket upgrade through the Worker fetch entry → routePartykitRequest → the TableServer DO.
  // (Story 1.6: the createRoom round-trip test exercises onConnect/onMessage, not an RPC shortcut.)
  export const SELF: Fetcher;
}
