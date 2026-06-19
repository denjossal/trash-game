/// <reference types="svelte" />
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// Custom Vite env vars (must be prefixed VITE_ to be exposed client-side). [Story 1.5: socket.ts]
interface ImportMetaEnv {
  /** PartySocket host/URL for the per-Table DO. Set in client `.env` (dev) / build env (prod). */
  readonly VITE_WS_URL?: string;
}
