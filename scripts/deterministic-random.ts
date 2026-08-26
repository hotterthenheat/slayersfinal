/*
  A FIXED RANDOM STREAM, installed before anything that draws from it.

  WHY. `src/core/simulator.ts` calls `Math.random()` directly — price moves,
  order-flow breathing, shock rolls, the tape. That is correct for the product:
  a desk demo that painted the same tape every morning would be a screenshot.
  It is wrong for a gate. A proof that walks the live book and then asserts
  something about where the book ENDED UP is re-rolling its own fixture on
  every run, so it fails on a dice roll rather than on a regression — and a
  gate that cries wolf is worse than no gate, because the next red is ignored.

  Measured: `levels-proof.ts` walked 6000 ticks and its mutation guard came
  back 1, 2, 2, 1, 2, 3 out of 8 across six consecutive runs. Never zero in
  those six, but 1/8 is one draw from zero, and zero is a hard failure.

  So the stream is pinned. Same seed, same tape, same walls, every run and
  every machine — the assertions then answer "did the code change?", which is
  the only question a gate can answer honestly.

  NOT `src/core/rng.ts`. That module is a HASH: one string seed in, one value
  out, so research modules re-roll per day and per key. This needs the other
  shape — a sequential stream standing in for `Math.random()`, which takes no
  argument and must not repeat. Different job, and it lives in `scripts/` so
  no product code carries a test's scaffolding.

  IMPORT IT FIRST. ESM evaluates imports in source order, and `simulator.ts`
  seeds its watchlist at module scope. Listed below the simulator, this file
  installs the stream AFTER the book it was meant to pin has already been
  built.
*/

/** mulberry32 — one multiply-xorshift round. Chosen for being small enough to
    read in full and verify by eye; a gate's own randomness should not be a
    dependency, and should not be a thing anyone has to trust. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Arbitrary and fixed. It is not tuned to make any assertion pass: the guard
    in `levels-proof.ts` reports how much drift this seed actually produced, so
    a seed that produced none would fail the file rather than quietly weaken
    it. */
export const RANDOM_SEED = 0x51a7e2;

Math.random = mulberry32(RANDOM_SEED);
