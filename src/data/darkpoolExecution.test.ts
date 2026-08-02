import { describe, it, expect } from 'vitest';
import Simulator from '../core/simulator';
import { EXECUTION_NOTE, buildDarkPoolView } from './darkpool';
import type { DarkPoolExecution } from '../types/darkpool';

/**
 * The execution axis: HOW a dark print traded, as distinct from why.
 *
 * These are invariants rather than sampled values, because the archetypes only
 * mean anything if they stay internally consistent — a conditional venue
 * printing a hundred algo child fills, or a sweep crossing at the midpoint,
 * would tell a reader the data is generated rather than read. The suite runs
 * against the real clock like the rest of this project, so every assertion here
 * has to hold for any day's draw, not for one.
 */
const TICKERS = ['SPY', 'QQQ', 'NVDA', 'AAPL', 'TSLA', 'AMD', 'MSFT', 'IWM'];
const views = TICKERS.map(t => buildDarkPoolView(Simulator.buildSnapshot(t)));
const allPrints = views.flatMap(v => v.prints);

const KINDS: DarkPoolExecution[] = [
  'BLOCK CROSS',
  'LIS CROSS',
  'MIDPOINT',
  'ICEBERG',
  'VWAP SLICE',
  'SWEEP TO DARK',
  'LATE PRINT',
];

describe('dark pool execution archetypes', () => {
  it('classifies every print as exactly one known kind', () => {
    expect(allPrints.length).toBeGreaterThan(100);
    for (const p of allPrints) expect(KINDS).toContain(p.execution);
  });

  it('gives every kind a legend line, and no orphan lines', () => {
    expect(Object.keys(EXECUTION_NOTE).sort()).toEqual([...KINDS].sort());
    for (const note of Object.values(EXECUTION_NOTE)) expect(note.length).toBeGreaterThan(20);
  });

  it('never crosses a sweep at the midpoint', () => {
    // A sweep is an aggressor by definition — it pays the spread to get done.
    // If this ever passes vacuously the count assertion below catches it.
    const sweeps = allPrints.filter(p => p.execution === 'SWEEP TO DARK');
    expect(sweeps.length).toBeGreaterThan(0);
    for (const p of sweeps) expect(p.atMid).toBe(false);
  });

  it('always crosses a midpoint peg at the midpoint', () => {
    const mids = allPrints.filter(p => p.execution === 'MIDPOINT');
    expect(mids.length).toBeGreaterThan(0);
    for (const p of mids) expect(p.atMid).toBe(true);
  });

  it('reports a negotiated cross as a single fill', () => {
    for (const p of allPrints) {
      if (p.execution === 'BLOCK CROSS' || p.execution === 'LIS CROSS') expect(p.clips).toBe(1);
    }
  });

  it('works a reserve order and a schedule algo in many clips', () => {
    for (const p of allPrints) {
      if (p.execution === 'ICEBERG') expect(p.clips).toBeGreaterThanOrEqual(6);
      if (p.execution === 'VWAP SLICE') expect(p.clips).toBeGreaterThanOrEqual(12);
    }
  });

  it('keeps the kind and the venue archetype from contradicting each other', () => {
    // A conditional venue exists to avoid working an order in public clips, so
    // it must never carry one. This is the pairing that would give the
    // generator away, and it is why both read the same size percentile.
    for (const p of allPrints) {
      if (p.venue === 'CONDITIONAL ATS') expect(p.clips).toBe(1);
      if (p.execution === 'VWAP SLICE') expect(p.venue).not.toBe('CONDITIONAL ATS');
    }
  });

  it('only reports a late print late', () => {
    const late = allPrints.filter(p => p.execution === 'LATE PRINT');
    const prompt = allPrints.filter(p => p.execution !== 'LATE PRINT');
    expect(late.length).toBeGreaterThan(0);
    for (const p of late) expect(p.reportLagSec).toBeGreaterThanOrEqual(300);
    for (const p of prompt) expect(p.reportLagSec).toBeLessThan(60);
  });

  it('is stable for the same ticker and day', () => {
    const a = buildDarkPoolView(Simulator.buildSnapshot('SPY')).prints.map(p => `${p.execution}/${p.clips}`);
    const b = buildDarkPoolView(Simulator.buildSnapshot('SPY')).prints.map(p => `${p.execution}/${p.clips}`);
    expect(a).toEqual(b);
  });

  it('does not collapse to one archetype', () => {
    // A classifier that answers the same thing every time is not a classifier.
    // Four of seven across eight names is a low bar the shape has to clear.
    const seen = new Set(allPrints.map(p => p.execution));
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it('reaches the largest sizes only through large-in-scale kinds', () => {
    for (const v of views) {
      const biggest = [...v.prints].sort((a, b) => b.notional - a.notional)[0];
      expect(['BLOCK CROSS', 'LIS CROSS']).toContain(biggest.execution);
    }
  });

  it('leaves midpoint share inside a believable band for negotiated flow', () => {
    // Weighting blocks toward the mid put 76% of session dollars there, which
    // is not what a book of negotiated crosses looks like — the whole point of
    // negotiating is agreeing a price.
    for (const v of views) {
      const midUsd = v.prints.filter(p => p.atMid).reduce((a, p) => a + p.notional, 0);
      const share = midUsd / v.totalNotional;
      expect(share).toBeGreaterThan(0.1);
      expect(share).toBeLessThan(0.72);
    }
  });
});
