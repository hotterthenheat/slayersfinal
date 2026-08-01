import { describe, it, expect } from 'vitest';
import Simulator from './simulator';
import {
  SCAN_UNIVERSE_SIZE,
  buildScanUniverse,
  resetScanUniverse,
  scanEpoch,
  scanNameFor,
  scanPoolSize,
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
  The scanner used to rank four tickers x four strikes on one side of the tape —
  sixteen contracts, capped at two per name before anything was compared across
  names, so "top setups" meant "the best two on each of four symbols". These
  guard the widening: the field has to be big, it has to be REPRODUCIBLE (the
  whole terminal is a seeded simulator), and widening it must not drag hundreds
  of names into the simulator's 1.5s tick loop, which is what makes the wide
  field affordable in the first place.
*/

const EPOCH = 1_800_000_000;
const snap = Simulator.buildSnapshot('SPY');

describe('scan universe: size', () => {
  it('the curated universe carries enough names to rank', () => {
    expect(UNIVERSE.length).toBeGreaterThanOrEqual(150);
  });

  it('every curated name is unique and sits on a known sector', () => {
    const tickers = UNIVERSE.map(u => u.ticker);
    expect(new Set(tickers).size).toBe(tickers.length);
    expect(UNIVERSE.every(u => u.px > 0 && u.beta > 0)).toBe(true);
  });

  it('the scannable pool reaches far past the curated tier', () => {
    // The bundled NASDAQ listing minus funds, warrants and non-equity lines.
    expect(scanPoolSize()).toBeGreaterThan(4000);
    expect(scanPoolSize()).toBeGreaterThan(UNIVERSE.length * 20);
  });

  it('the shipped universe is hundreds of names, not a watchlist', () => {
    const names = buildScanUniverse(EPOCH);
    expect(names.length).toBe(SCAN_UNIVERSE_SIZE);
    expect(names.length).toBeGreaterThan(Simulator.WATCHLIST.length * 100);
  });

  it('the live watchlist and the curated universe are always in the field', () => {
    const names = new Set(buildScanUniverse(EPOCH).map(n => n.ticker));
    for (const t of Simulator.WATCHLIST) expect(names.has(t)).toBe(true);
    for (const u of UNIVERSE) expect(names.has(u.ticker)).toBe(true);
  });

  it('a sweep generates thousands of candidate contracts', () => {
    expect(CANDIDATES_PER_NAME).toBeGreaterThanOrEqual(18);
    expect(SCAN_UNIVERSE_SIZE * CANDIDATES_PER_NAME).toBeGreaterThan(9000);
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
    const a = buildScanUniverse(EPOCH, 900).map(n => n.ticker);
    resetScanUniverse();
    const b = buildScanUniverse(EPOCH, 900).map(n => n.ticker);
    expect(b).toEqual(a);
    // A smaller universe is a prefix of a larger one — growing the cap adds
    // names, it never reshuffles the ones already in.
    expect(buildScanUniverse(EPOCH, 300).map(n => n.ticker)).toEqual(a.slice(0, 300));
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

  it('promoting a scanned name onto a live desk keeps its reference and its grid', () => {
    resetScanUniverse();
    // A long-tail name the curated universe does not carry.
    const tail = buildScanUniverse(EPOCH).find(n => !n.live && !lookup(n.ticker))!;
    const before = scanNameFor(tail.ticker, EPOCH);
    Simulator.buildSnapshot(tail.ticker); // registers it, exactly as a search would
    expect(Simulator.TICKERS[tail.ticker].basePrice).toBe(before.base);
    expect(Simulator.TICKERS[tail.ticker].iv).toBe(before.iv);
    expect(Simulator.TICKERS[tail.ticker].step).toBe(before.step);
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
    // Registering a name costs ~78ms of session seeding AND a permanent seat in
    // the 1.5s tick loop. Hundreds of them would be unusable, which is the
    // whole reason the scan prices its own field.
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
    expect(d.totalFound).toBeGreaterThan(shown.length * 5);
  });

  it('every scanner fills a table with hundreds of rows', () => {
    for (const s of SCANNERS) {
      resetSkyVisionCache();
      const d = buildSkyVision(snap, s.key, { epoch: EPOCH });
      const rows = d.groups.flatMap(g => g.setups);
      expect(rows.length).toBeGreaterThan(150);
      expect(d.groups.length).toBeGreaterThan(20);
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
    // 'All' carries no floor, so its count IS the field.
    expect(all.totalFound).toBe(buildScanUniverse(EPOCH).length * CANDIDATES_PER_NAME);
    expect(all.totalFound).toBeGreaterThan(all.shown * 20);
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

  it('a strict floor keeps its bar over the wide field', () => {
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
