// interaction.ts — shared interaction-safety constants (Story 1.9b, UX-DR18).
//
// Lives in plain TS (not inside Button.svelte) so it has one importable home for both the component
// and its test — `tsc -b` only sees the default export of a `*.svelte` module via the ambient
// declaration, so a `<script module>` named export isn't reachable from a typed test.
// Client-only (architecture.md#Client-boundary).

/** Debounce window (ms): a second button activation within this window of a fired one is swallowed. */
export const DEBOUNCE_MS = 350;

/** Max display-name length (chars) accepted by the Home name field. Keeps roster rows / Lives-pip
 *  layout sane and bounds the string sent to the server (length/content validation is the lobby UI's
 *  job — Story 1.10). Lives in plain TS so the surface and its test share one importable home. */
export const MAX_NAME_LEN = 20;
