import { expect, test } from "vitest";
import { cryptoRng } from "./rng.js";

// cryptoRng is the PRODUCTION randomness seam (outside rules/, so crypto is allowed here).
// It builds the injected rng for the pure shuffle from crypto.getRandomValues(). [AC-2.1.3]

test("cryptoRng: returns a function producing floats in [0, 1)", () => {
  const rng = cryptoRng();
  for (let i = 0; i < 1000; i++) {
    const v = rng();
    expect(typeof v).toBe("number");
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  }
});

test("cryptoRng: over many draws produces more than one distinct value (real entropy, not a constant)", () => {
  const rng = cryptoRng();
  const seen = new Set<number>();
  for (let i = 0; i < 1000; i++) seen.add(rng());
  expect(seen.size).toBeGreaterThan(1);
});

test("cryptoRng: composes with the pure shuffle to produce a valid permutation", async () => {
  const { buildDeck, shuffle } = await import("./rules/engine.js");
  const deck = buildDeck({ decks: 1 });
  const out = shuffle(deck, cryptoRng());
  expect(out.length).toBe(deck.length);
  const norm = (d: typeof deck) => d.map((c) => `${c.rank}${c.suit}`).sort();
  expect(norm(out)).toEqual(norm(deck));
});
