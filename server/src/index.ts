// @trash/server — Worker fetch entry. Routes /parties/:party/:name to the per-Table DO.
// [Source: architecture.md#Init-Story-Acceptance-Criteria 6; #Selected-Approach]
import { routePartykitRequest } from "partyserver";

// The DO class symbol MUST be exported here and its name MUST match wrangler.jsonc
// class_name "TableServer" and the binding "Table" (Init AC3).
export { TableServer } from "./table-server.js";

export interface Env {
  Table: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Init AC6: routePartykitRequest in the Worker fetch handler.
    // NOTE: partyserver kebab-cases the binding name for routing — binding "Table" → URL
    // namespace "table". Clients MUST route to /parties/table/<name> (lowercase), not /Table.
    const routed = await routePartykitRequest(request, env as never);
    if (routed) return routed;
    return new Response("trash-game server", { status: 404 });
  },
};
