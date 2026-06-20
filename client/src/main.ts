// Client entry. Mounts App; the PWA service worker is auto-registered by vite-plugin-pwa.
// SCOPE (Story 1.9a → 1.10): mounts App (the render-from-state router) and imports the design-token
// foundation once, before any surface renders. The read-only tableState store + the live receive loop
// live in `lib/table-store.svelte.ts` (Story 1.10) — a module-level $state holder whose ONLY writer is
// the receive loop; App reads it via readTableState() and the Home surface drives create/join through
// startTable()/joinTable(). The store is self-instantiating on import, so main.ts stays thin.
import { mount } from "svelte";
import App from "./App.svelte";
// Design-token foundation (Story 1.9a, UX-DR1). Imported ONCE here so the tokens + the global brand
// baseline load ahead of any surface; tokens.css @imports the local fonts.css. No Tailwind, no UI kit.
import "./tokens.css";

const app = mount(App, { target: document.getElementById("app")! });

export default app;
