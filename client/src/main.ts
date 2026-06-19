// Client entry. Mounts App; the PWA service worker is auto-registered by vite-plugin-pwa.
// SCOPE (Story 1.2): mount stub only. The read-only tableState store, socket.ts wiring,
// and surface router are authored in Stories 1.5/1.9/1.10.
import { mount } from "svelte";
import App from "./App.svelte";

const app = mount(App, { target: document.getElementById("app")! });

export default app;
