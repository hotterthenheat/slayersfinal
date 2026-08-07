import { describe, it, expect } from 'vitest';
import Simulator from '../core/simulator';
import { buildSurfaceIntegrity, inspectSurface } from './surfaceIntegrity';
import type { IvSurfaceData } from '../types/gex';

/*
  What-Else — surface integrity. Detection is pinned on hand-built surfaces (one
  clean, one with each arbitrage planted), and the live surface is checked for a
  coherent, reconciling report.
*/

/** A flat, arbitrage-free surface: constant vol across strikes, rising slightly
    with time so total variance always increases. */
function cleanSurface(baseVol = 20): IvSurfaceData {
  const dte = [5, 10, 20, 40, 80];
  const moneyness = [0.8, 0.9, 1.0, 1.1, 1.2];
  const cells = dte.map(() => moneyness.map(() => baseVol));
  return { dte, moneyness, cells, min: baseVol, max: baseVol, forward: 100 };
}

describe('What-Else — surface integrity', () => {
  it('passes a clean, flat, arbitrage-free surface', () => {
    const v = inspectSurface('TEST', cleanSurface());
    expect(v.clean).toBe(true);
    expect(v.score).toBe(100);
    for (const c of v.checks) expect(c.pass).toBe(true);
  });

  it('flags a calendar arbitrage: variance falling with expiry', () => {
    const s = cleanSurface(20);
    // Drop the vol hard on the longest expiry at the money → total variance falls.
    s.cells[s.dte.length - 1][2] = 4;
    const v = inspectSurface('TEST', s);
    const cal = v.checks.find(c => c.key === 'calendar')!;
    expect(cal.pass).toBe(false);
    expect(cal.violations).toBeGreaterThan(0);
    expect(cal.worst).not.toBeNull();
  });

  it('flags a butterfly arbitrage: a spiked ATM vol dents the price convexity', () => {
    const s = cleanSurface(20);
    // A tall vol spike at the money on the front expiry makes the ATM call
    // dearer than the average of its neighbours — a concave price, a negative
    // density. (Big, because the 10%-wide grid's ITM neighbour is mostly
    // intrinsic; a real 5%-step surface trips on a far smaller one.)
    s.cells[0][2] = 200;
    const v = inspectSurface('TEST', s);
    const fly = v.checks.find(c => c.key === 'butterfly')!;
    expect(fly.pass).toBe(false);
    expect(fly.violations).toBeGreaterThan(0);
  });

  it('flags a smoothness break: an absurd vol jump between adjacent strikes', () => {
    const s = cleanSurface(20);
    s.cells[2][3] = 60; // 40-point jump at one strike
    const v = inspectSurface('TEST', s);
    const sm = v.checks.find(c => c.key === 'smoothness')!;
    expect(sm.pass).toBe(false);
    expect(sm.worst?.detail).toContain('jump');
  });

  it('reconciles the score and is deterministic on the live surface', () => {
    Simulator.ensureTicker('NVDA');
    const cfg = Simulator.TICKERS.NVDA;
    const a = buildSurfaceIntegrity('NVDA', cfg.currentPrice, cfg.iv);
    const b = buildSurfaceIntegrity('NVDA', cfg.currentPrice, cfg.iv);
    expect(a).toEqual(b);
    const totalAdj = a.checks.reduce((s, c) => s + c.total, 0);
    const totalViol = a.checks.reduce((s, c) => s + c.violations, 0);
    expect(a.score).toBe(Math.round(((totalAdj - totalViol) / totalAdj) * 100));
    expect(a.clean).toBe(totalViol === 0);
    // pass ⇔ zero violations, and a violation always names its worst offender.
    for (const c of a.checks) {
      expect(c.pass).toBe(c.violations === 0);
      if (c.violations > 0) expect(c.worst).not.toBeNull();
    }
  });
});
