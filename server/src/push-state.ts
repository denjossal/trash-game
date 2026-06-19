// pushState(conn) — the ONLY module allowed to call connection.send / broadcast.
// [Source: architecture.md#Canonical-round-trip, #Architectural-Boundaries — single send site]
//
// The ESLint no-restricted-properties ban on .send/.broadcast is path-scoped to allow
// those calls HERE and nowhere else. This is the SM-6 egress chokepoint's I/O sink.
//
// SCOPE (Story 1.2): seam file only. pushState() is implemented alongside the phase machine
// (Story 1.6+). It will call connection.send({ type:"tableState", payload: projectStateFor(...) }).
export {};
