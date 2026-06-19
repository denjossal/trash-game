// DO-project smoke test (the "do" project, @cloudflare/vitest-pool-workers). Proves the
// Workers-runtime project is green on the empty scaffold and the DO binding resolves.
// Replaced by real DO tests in Story 1.6+.
import { env } from "cloudflare:test";
import { expect, test } from "vitest";

test("scaffold: Table DO binding resolves in the Workers runtime", () => {
  const id = env.Table.idFromName("SCAF");
  const stub = env.Table.get(id);
  expect(stub).toBeDefined();
});
