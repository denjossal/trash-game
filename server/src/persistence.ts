// persistence.ts — the ONE ctx.storage key "table" holding the durable summary blob;
// the summary write on phase transitions; the D2.1 reload-reconciliation coercion on wake.
// [Source: architecture.md#D2, #D2.1, #Integration-Points — one storage key]
//
// SCOPE (Story 1.2): seam file only. Init AC5 requires the storage seam to exist from day
// one; the write/coercion logic is implemented with the phase machine (Story 1.6+).
export {};
