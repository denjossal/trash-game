// Client entry. Mounts App; the PWA service worker is auto-registered by vite-plugin-pwa.
// SCOPE (Story 1.9a): mounts App (now the render-from-state router) and imports the design-token
// foundation once, before any surface renders. The read-only tableState store + the live socket.ts
// receive loop are wired in Story 1.10 (when the real Home/Lobby surfaces exist to drive them).
import { mount } from "svelte";
import App from "./App.svelte";
// Design-token foundation (Story 1.9a, UX-DR1). Imported ONCE here so the tokens + the global brand
// baseline load ahead of any surface; tokens.css @imports the local fonts.css. No Tailwind, no UI kit.
import "./tokens.css";

const app = mount(App, { target: document.getElementById("app")! });

export default app;
