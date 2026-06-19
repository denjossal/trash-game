// Types for the @cloudflare/vitest-pool-workers `cloudflare:test` module env, so the DO
// smoke test typechecks. Bindings mirror wrangler.jsonc.
declare module "cloudflare:test" {
  interface ProvidedEnv {
    Table: DurableObjectNamespace;
  }
  export const env: ProvidedEnv;
}
