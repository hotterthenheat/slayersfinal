import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import Simulator from './simulator';
import { settledOI, OI_SETTLED_ASOF } from './openInterest';
import type { MarketDataProvider } from './marketDataProvider';

/*
  P5.1 — the provider seam. The compile-time conformance proof lives in
  simulator.ts (`export default Simulator satisfies MarketDataProvider`). This
  proves the same at runtime AND from the consumer's side: the app only ever
  holds the interface, never the concrete simulator, so everything a desk needs
  has to be reachable through this narrowed handle. A real feed built to this
  interface serves the whole terminal.
*/
describe('P5.1 — MarketDataProvider seam', () => {
  // The app sees the feed only through the interface, never the concrete type.
  const provider: MarketDataProvider = Simulator;

  it('exposes the full market-data surface the desks consume', () => {
    const methods = [
      'ensureTicker',
      'setActiveTicker',
      'getActiveTicker',
      'isIndex',
      'getCandles',
      'getGexHistory',
      'buildSnapshot',
      'buildSnapshotAt',
      'tick',
      'getGreeks',
    ] as const;
    for (const m of methods) expect(typeof provider[m]).toBe('function');
    expect(provider.TICKERS).toBeTruthy();
    expect(Array.isArray(provider.WATCHLIST)).toBe(true);
  });

  it('builds a well-formed snapshot through the interface handle', () => {
    const snap = provider.buildSnapshot('SPY');
    expect(snap.ticker).toBe('SPY');
    expect(snap.spot).toBeGreaterThan(0);
    expect(snap.chain.length).toBeGreaterThan(0);
    // The pinned snapshot is reproducible for the same (symbol, spot, regime).
    const a = provider.buildSnapshotAt('SPY', 500, 20000);
    const b = provider.buildSnapshotAt('SPY', 500, 20000);
    expect(a.chain.length).toBe(b.chain.length);
    expect(a.chain[0].strike).toBe(b.chain[0].strike);
  });

  it('classifies indices and prices greeks through the seam', () => {
    expect(provider.isIndex('SPX')).toBe(true);
    expect(provider.isIndex('SPY')).toBe(false);
    const g = provider.getGreeks(500, 500, 0.05, 0.15);
    expect(g.gamma).toBeGreaterThan(0);
    expect(g.deltaCall).toBeGreaterThan(0);
    expect(g.deltaPut).toBeLessThan(0);
  });
});

/** Every .ts / .tsx file under a directory, recursively. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe('P5.1 — nothing outside core/ reaches around the seam', () => {
  const SRC = join(process.cwd(), 'src');

  it('OI freshness is a shared domain module, not a simulator convenience', () => {
    // The seam header states that the simulator's own conveniences are not part
    // of the contract. `settledOI` was one of them and data/flowtape imported it
    // straight off the simulator — so the day a real ThetaData feed replaces the
    // simulator, a DESK would have broken rather than a boundary. It now lives
    // in core/openInterest, which a real feed keeps: the OPRA once-a-day
    // publication schedule is a fact about the market, not about the simulator.
    expect(typeof settledOI).toBe('function');
    const oi = settledOI(1234);
    expect(oi.value).toBe(1234);
    expect(oi.freshness).toBe('SETTLED');
    expect(oi.asOf).toBe(OI_SETTLED_ASOF);
    expect(oi.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('no module outside core/ imports a non-seam symbol from the simulator', () => {
    // Named imports off core/simulator are the reach the seam exists to stop.
    // The DEFAULT import is fine — that IS the provider handle, and it is typed
    // as MarketDataProvider everywhere it matters.
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const rel = file.slice(SRC.length + 1);
      if (rel.startsWith('core/')) continue;
      const src = readFileSync(file, 'utf8');
      // `import Simulator, { X } from '.../core/simulator'` or `import { X } from ...`
      for (const m of src.matchAll(/import\s+([^;]*?)\s+from\s+['"][^'"]*core\/simulator['"]/g)) {
        const clause = m[1];
        const named = clause.match(/\{([^}]*)\}/);
        if (!named) continue;
        const symbols = named[1]
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
          // A pure `type` import cannot pull runtime behaviour across the seam.
          .filter(s => !s.startsWith('type '));
        if (symbols.length > 0) offenders.push(`${rel}: { ${symbols.join(', ')} }`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
