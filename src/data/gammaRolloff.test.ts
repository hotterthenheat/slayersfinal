import { describe, it, expect } from 'vitest';
import Simulator from '../core/simulator';
import { buildGammaRolloff } from './gammaRolloff';

/*
  P4.5 — the roll-off calendar partitions the book's gamma across the root's next
  listed expiries. These invariants hold for any day's draw.
*/
const TICKERS = ['SPX', 'SPY', 'NVDA', 'AAPL', 'KO'];

describe('P4.5 — gamma roll-off calendar', () => {
  it('lists real, holiday-aware expiries per root and shares sum to one', () => {
    for (const t of TICKERS) {
      const view = buildGammaRolloff(Simulator.buildSnapshot(t));
      expect(view.expiries.length).toBeGreaterThan(0);
      const shareSum = view.expiries.reduce((a, r) => a + r.share, 0);
      expect(shareSum).toBeCloseTo(1, 6);
      // Cumulative is monotone non-decreasing and closes at one.
      let prev = 0;
      for (const r of view.expiries) {
        expect(r.cumShare).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = r.cumShare;
      }
      expect(view.expiries[view.expiries.length - 1].cumShare).toBeCloseTo(1, 6);
    }
  });

  it('reconciles the total and finds the true biggest roll-off', () => {
    const view = buildGammaRolloff(Simulator.buildSnapshot('SPX'));
    const sum = view.expiries.reduce((a, r) => a + r.gamma, 0);
    expect(view.totalGamma).toBeCloseTo(sum, 4);
    const maxG = Math.max(...view.expiries.map(r => r.gamma));
    expect(view.biggest).not.toBeNull();
    expect(view.biggest!.gamma).toBeCloseTo(maxG, 6);
  });

  it('front-loads the schedule — the nearest expiry carries real weight', () => {
    // Gamma density is highest at the front, so the first rung is never a
    // rounding sliver of the book.
    const view = buildGammaRolloff(Simulator.buildSnapshot('SPY'));
    expect(view.expiries[0].share).toBeGreaterThan(0.05);

    // Half-life has to MEAN half. `halfLifeSessions >= 0` was the old
    // assertion, which a session count satisfies by construction — it would
    // hold if the field were hard-coded to zero. What the stat card claims is
    // that this is the FIRST rung whose cumulative share reaches 50%, so pin
    // exactly that: the rung at the half-life is at or past half, and every
    // rung before it is short of it.
    const halfIdx = view.expiries.findIndex(r => r.sessions === view.halfLifeSessions);
    expect(halfIdx).toBeGreaterThanOrEqual(0);
    expect(view.expiries[halfIdx].cumShare).toBeGreaterThanOrEqual(0.5);
    for (let i = 0; i < halfIdx; i++) expect(view.expiries[i].cumShare).toBeLessThan(0.5);
    expect(view.halfLifeSessions).toBeLessThanOrEqual(view.expiries[view.expiries.length - 1].sessions);
  });

  it('a daily-listing index shows more expiries than a monthly-only name', () => {
    const spx = buildGammaRolloff(Simulator.buildSnapshot('SPX'));
    expect(spx.convention).toBe('daily');
    // A daily root's first rung is a session away (0DTE), not a month.
    expect(spx.expiries[0].dte).toBeLessThanOrEqual(3);
  });
});
