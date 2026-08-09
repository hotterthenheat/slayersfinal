import { describe, it, expect } from 'vitest';
import Simulator from './simulator';
import { histogram, modelScoreboard, type ModelRow } from './quant';
import { buildFlowSweeps } from '../data/flowSweeps';
import type { Candle } from '../types/market';

describe('histogram', () => {
  // sorted terminal sample (runMonteCarlo feeds a sorted terminal array)
  const terminal = [90, 95, 98, 100, 102, 105, 110];

  it('produces exactly the requested number of bins', () => {
    expect(histogram(terminal, 100, 10)).toHaveLength(10);
  });

  it('assigns every value to exactly one bin (counts sum to the sample size)', () => {
    const bins = histogram(terminal, 100, 10);
    expect(bins.reduce((sum, b) => sum + b.count, 0)).toBe(terminal.length);
  });

  it('flags the lowest bin below spot and the highest above it', () => {
    const bins = histogram(terminal, 100, 10); // range 90..110, spot 100
    expect(bins[0].aboveSpot).toBe(false);
    expect(bins[bins.length - 1].aboveSpot).toBe(true);
  });

  it('is resilient to a degenerate (flat) terminal range', () => {
    const flat = [100, 100, 100];
    const bins = histogram(flat, 100, 8);
    expect(bins).toHaveLength(8);
    expect(bins.reduce((sum, b) => sum + b.count, 0)).toBe(flat.length);
  });
});

/*
  What the Prove It scoreboard is allowed to CLAIM, pinned.

  Nothing tested this module's scoreboard before, so a green suite said nothing
  about it, and a fabricated statistics table lived behind that green: five
  engines with hit rates 68/64/71/61/66 over samples of 412/286/530/348/124,
  rendered under "every engine tracked against what actually happened". Nothing
  had been tracked. The sparkline beside each row was a random walk and
  "edge bps/signal" was the invented hit rate minus fifty, times a random
  multiplier — a dollar-unit figure computed from a number nobody measured.

  These tests re-derive every figure from the populations the rows are scored
  over rather than asking the engine to confirm its own table, and they hold the
  copy to describing generated history. A row that cannot be re-derived here is
  a row that came from somewhere other than the simulator.
*/

/** The literals the retired table shipped — they must not come back, in any row. */
const RETIRED_HIT_RATES = [68, 64, 71, 61, 66];
const RETIRED_SAMPLES = [412, 286, 530, 348, 124];

/** Engines that were carried on the board with a number nothing could resolve. */
const UNSCOREABLE_ENGINES = [
  'Compass Weigher',
  'Trace Posture',
  'Pinpoint Levels',
  // Both of these went with their data. The earnings calendar and the news wire
  // are not on any feed tier the product can buy, so neither engine has a real
  // event to be scored against — see core/quant.ts's header.
  'Earnings Engine',
  'News outcome model',
];

const board = modelScoreboard();
const row = (name: string): ModelRow => {
  const found = board.find(r => r.model === name);
  if (!found) throw new Error(`no scoreboard row named "${name}"`);
  return found;
};

/** Independent re-derivation of a hit rate over a set of signed (call, outcome) pairs. */
const rateOf = (pairs: Array<[number, number]>): number => {
  const live = pairs.filter(([side, move]) => side !== 0 && move !== 0);
  return (live.filter(([side, move]) => side * move > 0).length / live.length) * 100;
};

describe('model scoreboard: every row is scored, none is asserted', () => {
  it('grades at least one engine and gives every row a real population', () => {
    expect(board.length).toBeGreaterThan(0);
    for (const r of board) {
      expect(r.sample, `${r.model} has no population`).toBeGreaterThan(0);
      expect(Number.isInteger(r.sample)).toBe(true);
    }
  });

  it('recomputes to the same board — no per-render roll', () => {
    // The old table re-rolled its hit rates off dayKey with a ±3 jitter, so the
    // same "measurement" moved between renders. A scored figure cannot.
    expect(modelScoreboard()).toEqual(board);
  });

  it('carries none of the retired hand-typed figures', () => {
    for (const r of board) {
      expect(RETIRED_SAMPLES, `${r.model} kept a retired sample size`).not.toContain(r.sample);
      // A scored rate may legitimately land on one of these integers, but not
      // paired with the sample size the fabricated table shipped alongside it.
      const idx = RETIRED_HIT_RATES.indexOf(r.hitRatePct);
      if (idx >= 0) expect(r.sample).not.toBe(RETIRED_SAMPLES[idx]);
    }
  });

  it('drops the engines it cannot resolve rather than giving them a number', () => {
    // Each needs a full chain and trade plan at every historical bar, and the
    // simulator keeps no such history — scoring them would mean re-deriving the
    // walls and flip that gex.ts:buildLevels owns.
    for (const name of UNSCOREABLE_ENGINES) {
      expect(board.map(r => r.model), `${name} is back on the board`).not.toContain(name);
    }
  });

  it('states rates and populations in ranges a count can produce', () => {
    for (const r of board) {
      expect(r.hitRatePct).toBeGreaterThanOrEqual(0);
      expect(r.hitRatePct).toBeLessThanOrEqual(100);
      // 12 blocks of the same population, each a hit rate over its slice.
      expect(r.trend).toHaveLength(12);
      for (const t of r.trend) {
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(100);
      }
      // The old sparkline was a random walk seeded off the model name and drifted
      // far outside a percentage; a block hit rate cannot.
      expect(Math.max(...r.trend) - Math.min(...r.trend)).toBeLessThanOrEqual(100);
    }
  });
});

describe('sweep-print row re-derives from the seeded candle series', () => {
  const r = row('Sweep prints');
  const FOLLOW = 30;
  const WINDOW = 220;

  /** Walk the same bars the engine drew its prints on, independently of quant.ts. */
  const replay = (): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    for (const ticker of Simulator.WATCHLIST) {
      const bars: Candle[] = Simulator.getCandles(ticker);
      if (!bars || bars.length < WINDOW + FOLLOW) continue;
      let step = Infinity;
      for (let i = 1; i < Math.min(bars.length, 400); i++) {
        const d = bars[i].time - bars[i - 1].time;
        if (d > 0 && d < step) step = d;
      }
      const at = new Map(bars.map((b, i) => [b.time, i]));
      for (let end = WINDOW; end <= bars.length - FOLLOW; end += WINDOW) {
        for (const s of buildFlowSweeps(ticker, bars.slice(end - WINDOW, end), WINDOW)) {
          const i = at.get(s.time);
          if (i === undefined) continue;
          const to = bars[i + FOLLOW];
          if (!to || to.time - bars[i].time > FOLLOW * step) continue;
          out.push([s.side === 'C' ? 1 : -1, ((to.close - bars[i].close) / bars[i].close) * 100]);
        }
      }
    }
    return out;
  };

  const pairs = replay();

  it('counts n off the prints the chart would have drawn', () => {
    expect(r.sample).toBe(pairs.filter(([side, move]) => side !== 0 && move !== 0).length);
  });

  it('re-derives the hit rate independently', () => {
    expect(r.hitRatePct).toBe(Math.round(rateOf(pairs)));
  });

  it('skips every print whose follow window crosses the overnight gap', () => {
    // A gap is a jump, not a move the print called. Fewer calls than prints is
    // the tell that the skip is live.
    let printed = 0;
    for (const ticker of Simulator.WATCHLIST) {
      const bars: Candle[] = Simulator.getCandles(ticker);
      for (let end = WINDOW; end <= bars.length - FOLLOW; end += WINDOW) {
        printed += buildFlowSweeps(ticker, bars.slice(end - WINDOW, end), WINDOW).length;
      }
    }
    expect(printed).toBeGreaterThan(r.sample);
  });
});

describe('scoreboard copy describes generated history, never a measurement', () => {
  it('says on every row that the history is generated', () => {
    for (const r of board) {
      expect(r.note, `${r.model} does not name its population`).toMatch(/simulated|seeded|generated/i);
    }
  });

  it('claims no observation, backtest or market history anywhere', () => {
    const rendered = board.flatMap(r => [r.model, r.scope, r.note]);
    for (const s of rendered) {
      expect(s).not.toMatch(/\bobservations?\b/i);
      expect(s).not.toMatch(/\bbacktest(ed)?\b/i);
      expect(s).not.toMatch(/\blast \d+ sessions\b/i);
      expect(s).not.toMatch(/\breal (money|history|trades?)\b/i);
    }
  });

  it('instructs no one to trade and claims no position', () => {
    // The product observes. PLAY never becomes a price word, and the app holds
    // nothing, so no row may speak of an entry it does not have.
    const rendered = board.flatMap(r => [r.model, r.scope, r.note]);
    for (const s of rendered) {
      expect(s).not.toMatch(/\b(buy|sell|short|enter|exit|trim|chase|our (entry|position))\b/i);
    }
  });

  it('names no real firm, venue or wire on generated output', () => {
    const rendered = board.flatMap(r => [r.model, r.scope, r.note]).join(' ');
    for (const name of ['Goldman', 'Morgan', 'JPMorgan', 'Citi', 'Bloomberg', 'Reuters', 'CNBC', 'Nasdaq', 'NYSE', 'CBOE']) {
      expect(rendered, `"${name}" appears in scoreboard copy`).not.toMatch(new RegExp(`\\b${name}\\b`, 'i'));
    }
  });
});
