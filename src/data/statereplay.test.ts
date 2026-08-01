import { describe, it, expect } from 'vitest';
import Simulator from '../core/simulator';
import { buildStateReplay, type StateReplayView } from './statereplay';
import type { MarketSnapshot } from '../types/market';

/*
  What Market-State Replay is allowed to CLAIM, pinned.

  Nothing tested this module before, and the fabrication it carried was the
  subtle variant: the arithmetic was already derived — 176 sessions synthesized,
  every rate counted off that population — but the copy presented the result as
  observed market history. "In N comparable sessions… ", "today's state has real
  precedent", "the setup is fighting its own history", "it holds on the held-out
  sample too". No session here happened, nothing was fitted, and so nothing was
  held out. Correct numbers under a label describing a quantity the engine never
  computed is the same fabrication as an invented number.

  Two things are therefore checked: that every rate still re-derives from the
  population the panel reports (so the copy fix did not paper over drift), and
  that no rendered string claims a measurement, a holdout or a trade.
*/

const NAMES = ['SPY', 'QQQ', 'AAPL', 'NVDA', 'MSFT', 'TSLA'];

/** One snapshot per name — `buildSnapshot` draws a fresh tape each call, so the
    view must be built from a snapshot that is captured once. */
const cases = NAMES.map(ticker => {
  const snap: MarketSnapshot = Simulator.buildSnapshot(ticker);
  return { ticker, snap, view: buildStateReplay(snap) };
});

const rendered = (v: StateReplayView): string[] => [v.receipts, v.headline, v.note];

describe('state replay: the reported rates re-derive from the reported population', () => {
  it.each(cases)('$ticker keeps the comparable set inside the synthesized pool', ({ view }) => {
    expect(view.n).toBeGreaterThan(0);
    expect(view.n).toBeLessThanOrEqual(view.pool);
  });

  it.each(cases)('$ticker outcome shares partition the comparable set', ({ view }) => {
    expect(view.targetPct + view.stopPct + view.neitherPct).toBe(100);
  });

  it.each(cases)('$ticker calibration bins account for every analog', ({ view }) => {
    expect(view.calibration.reduce((a, b) => a + b.count, 0)).toBe(view.n);
  });

  it.each(cases)('$ticker recency split accounts for every analog', ({ view }) => {
    expect(view.oos.inSampleN + view.oos.outSampleN).toBe(view.n);
    expect(view.oos.degradationPts).toBe(view.oos.inSampleTargetPct - view.oos.outSampleTargetPct);
  });

  it.each(cases)('$ticker edge is exactly the gap to the stated no-edge baseline', ({ view }) => {
    expect(view.edgePts).toBe(view.targetPct - view.baselineTargetPct);
  });

  it.each(cases)('$ticker edge decay closes on the same outcome shares by the horizon', ({ view }) => {
    // Every resolved analog resolves inside the horizon, so the last checkpoint's
    // cumulative rates ARE the outcome distribution — a second derivation of the
    // headline numbers off the same population.
    // Within a point: the decay series rounds to one decimal before the panel's
    // integers, and the outcome shares absorb the neither-share remainder.
    const last = view.edgeDecay[view.edgeDecay.length - 1];
    expect(last.bar).toBe(view.horizonBars);
    expect(Math.abs(last.cumTargetPct - view.targetPct)).toBeLessThanOrEqual(1);
    expect(Math.abs(last.cumStopPct - view.stopPct)).toBeLessThanOrEqual(1);
  });

  it.each(cases)('$ticker replays the plan geometry rather than deriving its own', ({ snap, view }) => {
    // Target, stop and direction come off the trade plan the simulator built.
    // A local re-derivation here would quietly disagree with the rest of the desk.
    const entry = snap.plan.entry || snap.spot;
    expect(view.targetDistPct).toBeCloseTo((Math.abs(snap.plan.target1 - entry) / entry) * 100, 6);
    expect(view.stopDistPct).toBeCloseTo((Math.abs(entry - snap.plan.stopLoss) / entry) * 100, 6);
    expect(view.rr).toBeCloseTo(view.targetDistPct / view.stopDistPct, 6);
    expect(view.direction).toBe(snap.plan.direction);
    expect(view.spot).toBe(snap.spot);
  });

  it.each(cases)('$ticker rebuilds identically from the same snapshot', ({ snap, view }) => {
    expect(buildStateReplay(snap)).toEqual(view);
  });
});

describe('state replay copy says what the population is', () => {
  it.each(cases)('$ticker names the analogs as simulated before quoting a rate', ({ view }) => {
    expect(view.receipts).toMatch(/simulated/i);
    expect(view.headline).toMatch(/simulated/i);
  });

  it.each(cases)('$ticker claims no observed market history', ({ view }) => {
    for (const s of rendered(view)) {
      expect(s).not.toMatch(/\bcomparable sessions\b/i);
      expect(s).not.toMatch(/\breal precedent\b/i);
      expect(s).not.toMatch(/\bits own history\b/i);
      expect(s).not.toMatch(/\b(actually happened|market history|historical(ly)?)\b/i);
      expect(s).not.toMatch(/\bbacktest(ed)?\b/i);
      // "observed" is allowed only in the disclaimer that denies it.
      expect(s).not.toMatch(/(?<!\bnot )\bobserved\b/i);
    }
  });

  it.each(cases)('$ticker calls the recency split what it is, never a holdout', ({ view }) => {
    // Nothing is fitted and daysAgo is drawn independently of the outcome, so
    // "held out" would claim a test the module cannot run.
    for (const s of rendered(view)) {
      expect(s).not.toMatch(/\bheld[- ]out\b/i);
      expect(s).not.toMatch(/\bout[- ]of[- ]sample\b/i);
    }
  });

  it.each(cases)('$ticker does not present calibration as corroboration', ({ view }) => {
    // Outcomes are drawn from their own predicted probabilities, so agreement is
    // a consistency check on the sampler and cannot prove the model right.
    expect(view.note).not.toMatch(/isn't fooling itself|proves|confirms|validated/i);
    if (view.calibrationErrorPct <= 6) expect(view.note).toMatch(/drawn from its own predicted probability/i);
  });

  it.each(cases)('$ticker instructs no trade and claims no position', ({ view }) => {
    for (const s of rendered(view)) {
      expect(s).not.toMatch(/\b(buy|sell|short|enter|exit|trim|add to|take profit|trade it|size (it )?(up|down)|before sizing)\b/i);
      expect(s).not.toMatch(/\bour (entry|position|stop|target)\b/i);
      // "long setup" / "short setup" state a position the app does not hold;
      // the plan's own words are BULLISH / BEARISH.
      expect(s).not.toMatch(/\b(long|short) setup\b/i);
    }
  });
});
