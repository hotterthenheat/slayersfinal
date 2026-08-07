import { describe, it, expect } from 'vitest';
import { enrichPrint } from './flowtape';
import type { TapeOrder } from '../types/market';
import { aggressorSide, isSweep, isMultiLeg, isDeltaHedged } from '../types/conditions';

/**
 * P3.1 — the enrichment stamps OPRA condition codes on every print and derives
 * side/sweep from them, so the tape carries the exchange fact rather than an
 * inference. These assertions hold for any deterministic draw.
 */
function sampleTape() {
  const prints = [];
  let id = 0;
  for (let i = 0; i < 500; i++) {
    const order: TapeOrder = {
      time: '10:00:00',
      ticker: 'SPY',
      strike: (400 + (i % 45)).toFixed(2),
      type: i % 2 === 0 ? 'C' : 'P',
      size: 10 + (i % 240),
      orderType: i % 3 === 0 ? 'SWEEP' : 'BLOCK',
      side: i % 2 === 0 ? 'ASK' : 'BID',
    };
    prints.push(enrichPrint(order, id++));
  }
  return prints;
}

describe('P3.1 — condition codes + aggressor on every print', () => {
  const prints = sampleTape();

  it('every print carries a conditions array', () => {
    for (const p of prints) expect(Array.isArray(p.conditions)).toBe(true);
  });

  it('side reads from the aggressor code and sweep from condition 95', () => {
    for (const p of prints) {
      expect(p.side).toBe(aggressorSide(p.conditions) ?? 'MID');
      expect(p.sweep).toBe(isSweep(p.conditions));
    }
  });

  it('a multi-leg code implies the print also reports legs > 1', () => {
    for (const p of prints) {
      if (isMultiLeg(p.conditions)) expect(p.legs).toBeGreaterThan(1);
    }
  });

  it('the distribution is sensible and non-uniform', () => {
    const withAgg = prints.filter(p => aggressorSide(p.conditions) !== null).length;
    const sweeps = prints.filter(p => isSweep(p.conditions)).length;
    const multi = prints.filter(p => isMultiLeg(p.conditions)).length;
    const hedged = prints.filter(p => isDeltaHedged(p.conditions)).length;

    // Most prints carry an exchange aggressor; a mid minority carries none.
    expect(withAgg).toBeGreaterThan(prints.length * 0.6);
    expect(withAgg).toBeLessThan(prints.length);
    // Sweeps and multi-leg are meaningful minorities; delta-hedged is rarer than
    // multi-leg; every bucket has at least one member across the session.
    expect(sweeps).toBeGreaterThan(0);
    expect(multi).toBeGreaterThan(0);
    expect(hedged).toBeGreaterThan(0);
    expect(hedged).toBeLessThan(multi);
  });
});
