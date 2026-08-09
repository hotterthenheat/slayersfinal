/*
  The trailer's Stocks board has to rank the way the desk ranks.

  This guards a defect that already shipped. `data/stocks.ts` dropped its news
  sleeve for want of a wire and its quality sleeve for want of a fundamentals
  feed, leaving momentum and flow. The trailer kept drawing four bars, and its
  composites stayed hand-set — so the film showed a factor the product does not
  compute, ranked names by weights the engine does not use, and put AVGO above
  MU on the strength of the sleeve that had been deleted.

  Both halves are asserted here: the weights are read out of `data/stocks.ts`
  itself rather than restated, so a change on either side of the seam breaks
  this rather than quietly re-opening the gap.
*/

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { buildTrailerStory } from './trailerStory';

const stocksSrc = readFileSync(join(process.cwd(), 'src/data/stocks.ts'), 'utf8');

/** The live sleeve weights, taken from the engine's own source. */
function liveWeights(): { momentum: number; flow: number } {
  const m = stocksSrc.match(
    /const SLEEVE_WEIGHTS = \{\s*momentum:\s*([\d.]+),\s*flow:\s*([\d.]+)\s*\}/
  );
  if (!m) throw new Error('SLEEVE_WEIGHTS not found in src/data/stocks.ts');
  return { momentum: Number(m[1]), flow: Number(m[2]) };
}

describe('trailer Stocks board', () => {
  it('reads its weights off the live engine', () => {
    const w = liveWeights();
    // A renormalisation, not a re-weighting — the composite still spans 0-1.
    expect(w.momentum + w.flow).toBeCloseTo(1, 3);
    expect(w.momentum).toBeGreaterThan(0);
    expect(w.flow).toBeGreaterThan(0);
  });

  it('composites every row at those weights', () => {
    const w = liveWeights();
    const rows = buildTrailerStory().stocks;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const blend = r.momentum * w.momentum + r.flow * w.flow;
      // The rows are written to 2dp, so the tolerance is the rounding, nothing more.
      expect(Math.abs(r.composite - blend)).toBeLessThanOrEqual(0.005);
    }
  });

  it('orders the board by that composite', () => {
    const rows = buildTrailerStory().stocks;
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].composite).toBeGreaterThanOrEqual(rows[i].composite);
    }
  });

  it('carries no sleeve the engine cannot compute', () => {
    const rows = buildTrailerStory().stocks;
    /*
      Quality needs fundamentals and the news sleeve needs a wire; neither is in
      any of the three market-data entitlements. A row that still carries the
      field is a row someone can put back on screen.
    */
    for (const r of rows) {
      expect(r).not.toHaveProperty('quality');
      expect(r).not.toHaveProperty('news');
    }
  });

  it('draws only the factors it carries', () => {
    const scene = readFileSync(
      join(process.cwd(), 'src/pages/trailer/scenes/StocksScene.tsx'),
      'utf8'
    );
    // The FACTORS list is what the scene actually renders as bars.
    const m = scene.match(/const FACTORS[\s\S]*?\];/);
    if (!m) throw new Error('FACTORS not found in StocksScene.tsx');
    const drawn = [...m[0].matchAll(/key:\s*'(\w+)'/g)].map(x => x[1]);
    expect(drawn.length).toBeGreaterThan(0);
    const row = buildTrailerStory().stocks[0] as unknown as Record<string, unknown>;
    for (const key of drawn) {
      expect(typeof row[key]).toBe('number');
    }
    expect(drawn).not.toContain('quality');
    expect(drawn).not.toContain('news');
  });
});
