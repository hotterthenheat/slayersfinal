import { describe, it, expect } from 'vitest';
import { enrichPrint } from './flowtape';
import { buildInformedFlow, scorePrint } from './informedFlow';
import { settledOI } from '../core/simulator';
import { TRADE_CONDITION, STOCK_OPTION_CODES } from '../types/conditions';
import type { FlowPrint } from '../types/flowdesk';
import type { TapeOrder } from '../types/market';

/*
  What-Else — informed vs uninformed flow. The score is a transparent sum of
  microstructure priors, pinned here on hand-built prints, with the aggregates
  checked on a generated session tape.
*/

function mkPrint(o: Partial<FlowPrint>): FlowPrint {
  return {
    id: 1,
    time: '10:00:00',
    ticker: 'SPY',
    legs: 1,
    strike: 500,
    right: 'C',
    otmPct: 1,
    expiry: '01/01/2027',
    dte: 3,
    fill: 2,
    bid: 1.95,
    ask: 2.05,
    fillPos: 0.9,
    side: 'ASK',
    flowScore: 60,
    ratioLabel: 'ASK 60%',
    ratioBidPct: 40,
    size: 100,
    premium: 20000,
    volume: 400,
    oi: settledOI(200),
    deltaOI: settledOI(0),
    spot: 500,
    iv: 15,
    volOverOI: 2, // opening
    strat: '—',
    sweep: false,
    conditions: [TRADE_CONDITION.ASK_AGGRESSOR],
    greeks: { delta: 0.5, gamma: 0.02, theta: -0.1, vega: 0.3, rho: 0.1 },
    ...o,
  };
}

describe('What-Else — information score', () => {
  it('scores a swept, block, large, opening aggressor as INFORMED', () => {
    const p = mkPrint({
      side: 'ASK',
      sweep: true,
      volOverOI: 2,
      conditions: [TRADE_CONDITION.ASK_AGGRESSOR, TRADE_CONDITION.INTERMARKET_SWEEP, TRADE_CONDITION.BLOCK_TRADE],
    });
    const c = scorePrint(p, 0.95);
    expect(c.klass).toBe('INFORMED');
    expect(c.score).toBeGreaterThan(80);
    expect(c.reasons).toContain('swept for immediacy');
    expect(c.reasons).toContain('block size');
  });

  it('scores a mid, odd-lot, small, closing print as UNINFORMED', () => {
    const p = mkPrint({
      side: 'MID',
      sweep: false,
      volOverOI: 0.3, // closing
      conditions: [TRADE_CONDITION.ODD_LOT],
    });
    const c = scorePrint(p, 0.1);
    expect(c.klass).toBe('UNINFORMED');
    expect(c.score).toBeLessThan(30);
    expect(c.reasons).toContain('mid — no aggressor');
    expect(c.reasons).toContain('odd lot — retail proxy');
  });

  it('marks structure down: a delta-hedged aggressor is not a directional bet', () => {
    const directional = scorePrint(mkPrint({ conditions: [TRADE_CONDITION.ASK_AGGRESSOR] }), 0.7);
    const hedged = scorePrint(
      mkPrint({ conditions: [TRADE_CONDITION.ASK_AGGRESSOR, STOCK_OPTION_CODES[0]] }),
      0.7
    );
    expect(hedged.score).toBeLessThan(directional.score);
    expect(hedged.reasons).toContain('structure — no directional view');
    expect(hedged.sentiment).toBe('NEUTRAL'); // structure carries no direction (P4.2)
  });
});

function sampleTape(ticker: string): FlowPrint[] {
  const prints: FlowPrint[] = [];
  for (let i = 0; i < 300; i++) {
    const order: TapeOrder = {
      time: '10:00:00',
      ticker,
      strike: (495 + (i % 20)).toFixed(2),
      type: i % 2 === 0 ? 'C' : 'P',
      size: 10 + (i % 200),
      orderType: i % 3 === 0 ? 'SWEEP' : 'BLOCK',
      side: i % 2 === 0 ? 'ASK' : 'BID',
    };
    prints.push(enrichPrint(order, i));
  }
  return prints;
}

describe('What-Else — the session read', () => {
  const tape = sampleTape('SPY');
  const view = buildInformedFlow(tape, 'SPY');

  it('partitions premium into informed / mixed / uninformed with no leak', () => {
    const total = view.informedPremium + view.mixedPremium + view.uninformedPremium;
    const scopedTotal = tape.filter(p => p.ticker === 'SPY').reduce((a, p) => a + p.premium, 0);
    expect(total).toBeCloseTo(scopedTotal, 4);
    expect(view.informedShare).toBeGreaterThanOrEqual(0);
    expect(view.informedShare).toBeLessThanOrEqual(1);
  });

  it('reads the smart-money tilt off the informed slice only', () => {
    expect(view.smartNet).toBeCloseTo(view.smartBull - view.smartBear, 4);
    expect(view.smartBullish).toBe(view.smartNet >= 0);
    // Both classes are represented on a session-sized draw.
    expect(view.informedCount).toBeGreaterThan(0);
    expect(view.uninformedCount).toBeGreaterThan(0);
  });

  it('finds the highest-information print and scopes to one name', () => {
    expect(view.topInformed).not.toBeNull();
    const maxScore = Math.max(...view.prints.filter(p => p.klass === 'INFORMED').map(p => p.score));
    expect(view.topInformed!.score).toBe(maxScore);
    for (const p of view.prints) expect(p.print.ticker).toBe('SPY');
  });
});
