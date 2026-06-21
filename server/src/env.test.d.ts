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
  // Run a callback inside a Durable Object's context (instance + state/storage). Story 1.7 uses it to
  // SEED a non-lobby durable summary directly into a DO's storage so the late-join refusal (phase !==
  // "lobby") can be exercised before the Epic 2 `deal` handler exists. [vitest-pool-workers API.]
  export function runInDurableObject<O extends Rpc.DurableObjectBranded | undefined, R>(
    stub: DurableObjectStub<O>,
    callback: (instance: O, state: DurableObjectState) => R | Promise<R>,
  ): Promise<R>;
  // Immediately run (and remove) the DO's scheduled alarm, if any; returns true if an alarm ran. Story
  // 1.11 uses it to fire the idle GC alarm without waiting the 3h IDLE_TTL_MS wall-clock. [pool-workers API.]
  export function runDurableObjectAlarm(stub: DurableObjectStub): Promise<boolean>;
}
