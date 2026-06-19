// Node-env smoke test (the "rules" project). Proves the node vitest project is green on the
// empty scaffold AND that @trash/shared imports by name. Replaced by real rule tests in Epic 2.
import { expect, test } from "vitest";
import { DEFAULT_LIVES, ROOM_CODE_LEN } from "@trash/shared";

test("scaffold: node project runs and @trash/shared imports by name", () => {
  expect(DEFAULT_LIVES).toBe(3);
  expect(ROOM_CODE_LEN).toBe(4);
});
