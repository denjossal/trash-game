// PRODUCTION randomness seam. Lives OUTSIDE server/src/rules/** so it may use crypto —
// the pure engine (rules/engine.ts) takes the rng injected and never touches entropy itself.
// Mirrors the crypto.getRandomValues() precedent in room-code.ts. [AC-2.1.3; architecture.md#Crypto line 292]
import type { Rng } from "./rules/engine.js";

const UINT32_RANGE = 0x1_0000_0000; // 2^32

/**
 * Build an {@link Rng} (float in [0, 1)) backed by native WebCrypto. Each call draws a fresh
 * 32-bit value from crypto.getRandomValues() and normalizes it to [0, 1) by dividing by 2^32 —
 * an unbiased mapping across the full uint32 range. Never uses Math.random().
 *
 * Pass the returned function into rules/engine#shuffle for a real, seeded-by-CSPRNG deal.
 */
export function cryptoRng(): Rng {
  const buf = new Uint32Array(1);
  return () => {
    crypto.getRandomValues(buf);
    return buf[0] / UINT32_RANGE;
  };
}
