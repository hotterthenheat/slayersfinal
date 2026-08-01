import { describe, it, expect } from 'vitest';
import Simulator from './simulator';
import {
  SCAN_UNIVERSE_SIZE,
  buildScanUniverse,
  resetScanUniverse,
  scanCoverage,
  scanEpoch,
  scanNameFor,
  scanSparkline,
} from './scanUniverse';
import {
  CANDIDATES_PER_NAME,
  COUNTER_TREND_CEILING,
  buildSkyVision,
  makeSetup,
  prescreenScore,
  resetSkyVisionCache,
  scannerFloor,
} from '../data/skyvision';
import { UNIVERSE, lookup } from '../data/universe';
import { SCANNERS, type ScannerKey } from '../types/skyvision';

/*
  Two things have gone wrong with this field, and these guard both.

  It started as four tickers x four strikes on one side of the tape — sixteen
  contracts, capped at two per name before anything was compared across names,
  so "top setups" meant "the best two on each of four symbols".

  Widening it then overshot in the other direction: it topped up to 520 out of
  the bundled NASDAQ listing, which carries {symbol, name} and nothing else. No
  market cap, no listing status, no options flag — so the only screen available
  was symbol shape plus a blacklist of name substrings, and 326 of the 520 came
  back as names no other desk in the terminal could open. Delisted shells,
  a SPAC, corporate notes quoted as equity, micro-cap thrifts, each priced off a
  hash of its own symbol string.

  So: the field must be REPRODUCIBLE (the whole terminal is a seeded simulator),
  must stay off the simulator's 1.5s tick loop (what makes it affordable), and
  every name in it must be one the rest of the terminal can answer a click on.
*/

const EPOCH = 1_800_000_000;
const snap = Simulator.buildSnapshot('SPY');

/** Symbols the old listing filter waved through, by category of wrongness. */
const LISTING_JUNK = [
  'AABA', // dissolved 2019
  'SGYP', // bankrupt, delisted 2019
  'SPEX', // delisted shell
  'DTEA', // delisted
  'KBLM', // SPAC, never a common-stock options book
  'JSM', //  Navient baby bond, quoted like equity
  'CTY', //  Qwest baby bond
  'ENO', //  Entergy New Orleans baby bond
  'OFED', // micro-cap thrift
  'MGYR', // micro-cap thrift
];

describe('scan universe: composition', () => {
  it('the curated universe carries enough names to rank', () => {
    expect(UNIVERSE.length).toBeGreaterThanOrEqual(150);
  });

  it('every curated name is unique and sits on a known sector', () => {
    const tickers = UNIVERSE.map(u => u.ticker);
    expect(new Set(tickers).size).toBe(tickers.length);
    expect(UNIVERSE.every(u => u.px > 0 && u.beta > 0)).toBe(true);
  });

  it('the field is exactly the names the terminal has a reference for', () => {
    // Coverage IS the cap. There is no separate size constant to drift away
    // from the set it is supposed to describe.
    const backed = new Set([...Simulator.WATCHLIST, ...UNIVERSE.map(u => u.ticker)]);
    expect(SCAN_UNIVERSE_SIZE).toBe(backed.size);
    expect(buildScanUniverse(EPOCH).length).toBe(SCAN_UNIVERSE_SIZE);
  });

  it('every ranked name is one another desk can open', () => {
    for (const n of buildScanUniverse(EPOCH)) {
      expect(n.coverage).not.toBe('listing');
      // Modeled means the simulator holds it; covered means universe.ts does.
      // Either way the price on the board traces a reference somebody set.
      if (n.coverage === 'covered') expect(lookup(n.ticker)!.px).toBe(n.base);
      else expect(Simulator.TICKERS[n.ticker].basePrice).toBe(n.base);
    }
  });

  it('the names the simulator models are always in, and flagged modeled', () => {
    const byTicker = new Map(buildScanUniverse(EPOCH).map(n => [n.ticker, n]));
    for (const t of Simulator.WATCHLIST) {
      expect(byTicker.get(t)?.coverage).toBe('modeled');
      expect(byTicker.get(t)?.live).toBe(true);
    }
    for (const u of UNIVERSE) expect(byTicker.has(u.ticker)).toBe(true);
  });

  it('the listing tail the old filter waved through is out of the field', () => {
    const names = new Set(buildScanUniverse(EPOCH).map(n => n.ticker));
    for (const junk of LISTING_JUNK) expect(names.has(junk)).toBe(false);
  });

  it('a name outside both tiers is still scannable, and says so', () => {
    // Search reaches the whole listing and Compass injects the active ticker
    // into the sweep, so this path stays open — it just cannot hide.
    resetScanUniverse();
    for (const junk of LISTING_JUNK) {
      expect(scanCoverage(junk)).toBe('listing');
      const n = scanNameFor(junk, EPOCH);
      expect(n.coverage).toBe('listing');
      expect(n.live).toBe(false);
      expect(lookup(junk)).toBeUndefined();
      expect(Number.isFinite(n.spot)).toBe(true);
    }
  });

  it('a sweep still generates thousands of candidate contracts', () => {
    expect(CANDIDATES_PER_NAME).toBeGreaterThanOrEqual(18);
    expect(SCAN_UNIVERSE_SIZE * CANDIDATES_PER_NAME).toBeGreaterThan(3000);
  });
});

describe('scan universe: determinism', () => {
  it('the same epoch replays the identical field', () => {
    const a = buildScanUniverse(EPOCH).map(n => ({ ...n }));
    resetScanUniverse();
    const b = buildScanUniverse(EPOCH).map(n => ({ ...n }));
    expect(b).toEqual(a);
  });

  it('name order is a fixed sample, not iteration luck', () => {
    const a = buildScanUniverse(EPOCH).map(n => n.ticker);
    resetScanUniverse();
    const b = buildScanUniverse(EPOCH).map(n => n.ticker);
    expect(b).toEqual(a);
    // A smaller field is a prefix of the full one — truncating drops names, it
    // never reshuffles the ones that stay.
    expect(buildScanUniverse(EPOCH, 60).map(n => n.ticker)).toEqual(a.slice(0, 60));
  });

  it('field order is not the order sectors happen to be typed in universe.ts', () => {
    // Ties in the global sort fall through to field order, so a sector-grouped
    // field would resolve them toward whichever sector was listed first.
    const order = buildScanUniverse(EPOCH).map(n => n.ticker);
    const curated = order.filter(t => !Simulator.WATCHLIST.includes(t));
    const sectors = curated.map(t => lookup(t)!.sector);
    const firstTen = new Set(sectors.slice(0, 10));
    expect(firstTen.size).toBeGreaterThan(3);
  });

  it('prices move with the epoch and land back on the same number', () => {
    const now = buildScanUniverse(EPOCH).find(n => !n.live)!;
    const later = buildScanUniverse(EPOCH + 90).find(n => n.ticker === now.ticker)!;
    expect(later.spot).not.toBe(now.spot);
    resetScanUniverse();
    expect(buildScanUniverse(EPOCH + 90).find(n => n.ticker === now.ticker)!.spot).toBe(later.spot);
  });

  it('a sparkline is reproducible and ends on the price it is drawn beside', () => {
    const n = buildScanUniverse(EPOCH).find(x => !x.live)!;
    const line = scanSparkline(n.ticker, n.spot, EPOCH);
    expect(line).toEqual(scanSparkline(n.ticker, n.spot, EPOCH));
    expect(line[line.length - 1]).toBe(n.spot);
    expect(line.every(Number.isFinite)).toBe(true);
  });

  it('the whole feed replays bit-for-bit at a fixed epoch', () => {
    const flat = (s: ScannerKey) => {
      resetSkyVisionCache();
      resetScanUniverse();
      return buildSkyVision(snap, s, { epoch: EPOCH }).groups.flatMap(g =>
        g.setups.map(x => `${x.id}@${x.score}/${x.verdict}/${x.mid}`)
      );
    };
    for (const s of SCANNERS) expect(flat(s.key)).toEqual(flat(s.key));
  });
});

describe('scan universe: price coherence with the live desks', () => {
  it('a live name reports the simulator price, never a second one', () => {
    resetScanUniverse();
    for (const t of Simulator.WATCHLIST) {
      const n = scanNameFor(t, EPOCH);
      expect(n.live).toBe(true);
      expect(n.spot).toBe(Simulator.TICKERS[t].currentPrice);
      expect(n.base).toBe(Simulator.TICKERS[t].basePrice);
    }
  });

  it('a curated name is priced off the universe reference', () => {
    resetScanUniverse();
    expect(scanNameFor('LLY', EPOCH).base).toBe(lookup('LLY')!.px);
  });

  it('the full sweep and a single lookup agree, name for name', () => {
    // They are one derivation now; this holds them there.
    resetScanUniverse();
    for (const n of buildScanUniverse(EPOCH)) expect(scanNameFor(n.ticker, EPOCH)).toEqual(n);
  });

  it('promoting a scanned name onto a live desk keeps its reference and its grid', () => {
    resetScanUniverse();
    const covered = buildScanUniverse(EPOCH).find(n => n.coverage === 'covered')!;
    const before = scanNameFor(covered.ticker, EPOCH);
    Simulator.buildSnapshot(covered.ticker); // registers it, exactly as a search would
    expect(Simulator.TICKERS[covered.ticker].basePrice).toBe(before.base);
    expect(Simulator.TICKERS[covered.ticker].iv).toBe(before.iv);
    expect(Simulator.TICKERS[covered.ticker].step).toBe(before.step);
    // ...and the scan now defers to the simulator for its price.
    resetScanUniverse();
    expect(scanNameFor(covered.ticker, EPOCH).coverage).toBe('modeled');
  });
});

describe('scan cost: the wide field stays off the tick loop', () => {
  it('a full sweep registers no new simulator tickers', () => {
    resetScanUniverse();
    resetSkyVisionCache();
    const before = Object.keys(Simulator.TICKERS).length;
    for (const s of SCANNERS) {
      const d = buildSkyVision(snap, s.key, { epoch: EPOCH });
      d.groups.forEach(g => g.setups.length);
    }
    // Registering a name costs ~70ms of session seeding AND a permanent seat in
    // the 1.5s tick loop, which is why the scan prices its own field.
    expect(Object.keys(Simulator.TICKERS).length).toBe(before);
  });

  it('reading only the contract chain does not run the sweep', () => {
    resetSkyVisionCache();
    resetScanUniverse();
    buildScanUniverse(EPOCH);
    const t0 = performance.now();
    let rows = 0;
    for (let i = 0; i < 50; i++) rows += buildSkyVision(snap, 'top-setups', { epoch: EPOCH }).chain.rows.length;
    const perCall = (performance.now() - t0) / 50;
    expect(rows).toBeGreaterThan(0);
    // Compass rebuilds this object every 1.5s purely for the chain.
    expect(perCall).toBeLessThan(2);
  });
});

describe('scan ranking', () => {
  it('the prescreen and the full build agree on the score, exactly', () => {
    const cases: [string, number, number, 'C' | 'P', boolean][] = [];
    for (const t of ['SPY', 'AAPL', 'LLY', 'F']) {
      for (let k = -4; k <= 4; k++) {
        for (const r of ['C', 'P'] as const) {
          for (const lean of [true, false]) cases.push([t, 100 + k, 100, r, lean]);
        }
      }
    }
    for (const [ticker, strike, spot, right, lean] of cases) {
      for (const s of SCANNERS) {
        const aligned = lean ? right === 'C' : right === 'P';
        expect(prescreenScore(ticker, spot, strike, right, s.key, aligned)).toBe(
          makeSetup(ticker, spot, strike, right, s.key, 0.2, lean).score
        );
      }
    }
  });

  it('ranks globally — every shown setup beats every setup left out', () => {
    resetSkyVisionCache();
    const d = buildSkyVision(snap, 'top-setups', { epoch: EPOCH });
    const shown = d.groups.flatMap(g => g.setups);
    // The old engine capped two per ticker BEFORE comparing tickers, so a
    // ticker's third-best could be dropped for another name's weaker second.
    const weakestShown = Math.min(...shown.map(s => s.score));
    expect(weakestShown).toBeGreaterThanOrEqual(scannerFloor('top-setups'));
    // The board is genuinely a selection: more contracts clear the floor than
    // fit on it. The margin is smaller than it was, because the field it is
    // measured against no longer includes names that cannot be opened.
    expect(d.totalFound).toBeGreaterThan(shown.length);
  });

  it('every scanner fills a table, spread over most of the field', () => {
    for (const s of SCANNERS) {
      resetSkyVisionCache();
      const d = buildSkyVision(snap, s.key, { epoch: EPOCH });
      const rows = d.groups.flatMap(g => g.setups);
      expect(rows.length).toBeGreaterThan(150);
      // Narrowing the field to real names did not narrow the board: it still
      // fills, and it still spreads across most of the universe rather than
      // stacking contracts on a handful of names.
      expect(d.groups.length).toBeGreaterThan(SCAN_UNIVERSE_SIZE * 0.5);
      expect(d.shown).toBe(rows.length);
      // The card header's "N found" has to be the number of cards under it.
      for (const g of d.groups) expect(g.found).toBe(g.setups.length);
    }
  });

  it("a group's change is its own sparkline's slope", () => {
    resetSkyVisionCache();
    // The feed tints the line by changePct, so a rising line must never be red.
    for (const g of buildSkyVision(snap, 'all', { epoch: EPOCH }).groups) {
      expect(g.sparkline.length).toBeGreaterThan(10);
      expect(g.sparkline[g.sparkline.length - 1]).toBe(g.spot);
      const slope = ((g.sparkline[g.sparkline.length - 1] - g.sparkline[0]) / g.sparkline[0]) * 100;
      expect(g.changePct).toBeCloseTo(slope, 2);
      expect(g.changePct >= 0).toBe(slope >= 0);
    }
  });

  it('the field is far larger than what reaches the screen', () => {
    resetSkyVisionCache();
    const all = buildSkyVision(snap, 'all', { epoch: EPOCH });
    // 'All' carries no floor, so its count IS the field — and the field is the
    // universe, not a padded denominator.
    expect(all.totalFound).toBe(buildScanUniverse(EPOCH).length * CANDIDATES_PER_NAME);
    expect(all.totalFound).toBeGreaterThan(all.shown * 10);
  });

  it('both sides of the tape are scanned, and counter-trend is marked down', () => {
    resetSkyVisionCache();
    const rows = buildSkyVision(snap, 'all', { epoch: EPOCH }).groups.flatMap(g => g.setups);
    expect(new Set(rows.map(r => r.right)).size).toBe(2);
    // A contract facing the tape can never outscore this — the bound the sweep
    // prunes on, so it has to hold.
    for (const t of ['SPY', 'NVDA', 'PG']) {
      for (const r of ['C', 'P'] as const) {
        for (let k = -4; k <= 4; k++) {
          expect(prescreenScore(t, 100, 100 + k, r, 'top-setups', false)).toBeLessThanOrEqual(
            COUNTER_TREND_CEILING
          );
        }
      }
    }
  });

  it('a strict floor keeps its bar over the field', () => {
    resetSkyVisionCache();
    const strict = buildSkyVision(snap, 'top-setups', { epoch: EPOCH });
    const loose = buildSkyVision(snap, 'all', { epoch: EPOCH });
    expect(scannerFloor('top-setups')).toBeGreaterThan(scannerFloor('all'));
    expect(strict.totalFound).toBeLessThan(loose.totalFound);
    for (const g of strict.groups) {
      for (const s of g.setups) expect(s.score).toBeGreaterThanOrEqual(84);
    }
  });

  it('the sweep is quantised to the scan clock, not the price tick', () => {
    expect(scanEpoch(0)).toBe(0);
    expect(scanEpoch(9_999)).toBe(0);
    expect(scanEpoch(10_000)).toBe(1);
  });
});
