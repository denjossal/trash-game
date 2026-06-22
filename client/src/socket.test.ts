// socket.test.ts — pure shape tests for the client intent BUILDERS (Story 3.4 adds buildDealAgainIntent).
// Runs in the "client-node" project (no DOM, no socket). The builders are pure functions that produce a
// frozen-contract Intent envelope; the live send (sendIntent → socket.send) is the GATE-1-exempt seam the
// table-store wires, exercised separately. We pin the dealAgain builder here because it is the FIRST client
// phase-conducting send and shares the {phaseToken} payload with deal/revealAll/newGame (the grouped Intent
// member) — a wrong literal or a stray field would be a wire-contract break. [Source: shared/src/types.ts Intent.]
import { describe, expect, it } from "vitest";
import { buildDealAgainIntent } from "./socket";

describe("buildDealAgainIntent (Story 3.4)", () => {
  it("produces a dealAgain intent carrying exactly the phaseToken", () => {
    const intent = buildDealAgainIntent(7);
    expect(intent.type).toBe("dealAgain");
    expect(intent.payload).toEqual({ phaseToken: 7 });
  });

  it("the payload has ONLY phaseToken (no stray fields leak onto the frozen contract)", () => {
    const intent = buildDealAgainIntent(0);
    expect(Object.keys(intent.payload)).toEqual(["phaseToken"]);
    expect(Object.keys(intent).sort()).toEqual(["payload", "type"]);
  });
});
