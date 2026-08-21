import { describe, it, expect } from 'vitest';
import { enrichPrint } from './flowtape';
import { buildInformedFlow, scorePrint } from './informedFlow';
import { settledOI } from '../core/openInterest';
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
    volOverOI: 2,
    strat: '—',
    sweep: false,
    conditions: [TRADE_CONDITION.ASK_AGGRESSOR],
    greeks: { delta: 0.5, gamma: 0.02, theta: -0.1, vega: 0.3, rho: 0.1 },
    ...o,
  };
}

describe('What-Else — information score', () => {
  it('scores a swept, block-premium, large aggressor as INFORMED', () => {
    const p = mkPrint({
      side: 'ASK',
      sweep: true,
      premium: 200_000, // clears the $150k exchange block threshold
      conditions: [TRADE_CONDITION.ASK_AGGRESSOR, TRADE_CONDITION.INTERMARKET_SWEEP],
    });
    const c = scorePrint(p, 0.95);
    expect(c.klass).toBe('INFORMED');
    expect(c.score).toBeGreaterThan(80);
    expect(c.reasons).toContain('swept for immediacy');
    expect(c.reasons).toContain('block premium');
  });

  it('scores a mid, retail-size, small print as UNINFORMED', () => {
    const p = mkPrint({
      side: 'MID',
      sweep: false,
      size: 5, // retail-scale lot
      conditions: [],
    });
    const c = scorePrint(p, 0.1);
    expect(c.klass).toBe('UNINFORMED');
    expect(c.score).toBeLessThan(30);
    expect(c.reasons).toContain('mid — no aggressor');
    expect(c.reasons).toContain('retail-size lot');
  });

  it('block and retail-size are REACHABLE — the condition-code versions never were', () => {
    // The two branches used to test OPRA 75 (BLOCK_TRADE) and OPRA 115
    // (ODD_LOT). Both are equity-feed conditions that an options print never
    // carries, so +14 and −20 were dead weight: no print on this desk could
    // ever trip either one. Pin that the replacements actually fire, and that
    // they are what moves the score.
    const base = { conditions: [TRADE_CONDITION.ASK_AGGRESSOR], sweep: false, volOverOI: 2 };

    const small = scorePrint(mkPrint({ ...base, premium: 20_000, size: 500 }), 0.5);
    const block = scorePrint(mkPrint({ ...base, premium: 200_000, size: 500 }), 0.5);
    expect(small.reasons).not.toContain('block premium');
    expect(block.reasons).toContain('block premium');
    expect(block.score - small.score).toBe(14);

    const round = scorePrint(mkPrint({ ...base, premium: 20_000, size: 500 }), 0.5);
    const retail = scorePrint(mkPrint({ ...base, premium: 20_000, size: 5 }), 0.5);
    expect(round.reasons).not.toContain('retail-size lot');
    expect(retail.reasons).toContain('retail-size lot');
    expect(round.score - retail.score).toBe(20);

    // And the old codes are now inert here — carrying them changes nothing,
    // which is the honest state of affairs for an options tape.
    const withDeadCodes = scorePrint(
      mkPrint({ ...base, premium: 20_000, size: 500, conditions: [TRADE_CONDITION.ASK_AGGRESSOR, TRADE_CONDITION.BLOCK_TRADE, TRADE_CONDITION.ODD_LOT] }),
      0.5
    );
    expect(withDeadCodes.score).toBe(small.score);
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

  it('buckets every print exactly once, and never colours a bucket against its own class', () => {
    const binned = view.scoreBuckets.reduce((a, b) => a + b.count, 0);
    expect(binned).toBe(view.prints.length);
    // A bucket's class must be the class the scorer would give a print of that
    // score — otherwise the histogram's colours contradict the table's labels.
    for (const b of view.scoreBuckets) {
      const expected =
        b.lo >= view.thresholds.informed ? 'INFORMED' : b.lo <= view.thresholds.uninformed ? 'UNINFORMED' : 'MIXED';
      expect(b.klass).toBe(expected);
      for (const p of view.prints.filter(p => p.score === b.lo)) expect(p.klass).toBe(b.klass);
    }
    // Premium in each bucket reconciles with the prints that landed there.
    const informedFromBuckets = view.scoreBuckets.filter(b => b.klass === 'INFORMED').reduce((a, b) => a + b.premium, 0);
    expect(informedFromBuckets).toBeCloseTo(view.informedPremium, 4);
  });

  it('walks the tilt forward in time and lands on the headline net', () => {
    expect(view.tilt).toHaveLength(view.prints.length);
    // The last point of the running walk IS the stat card's number. If the walk
    // ran backwards over the newest-first tape it would still end at the same
    // total, so also check the path itself is chronological.
    expect(view.tilt[view.tilt.length - 1].net).toBeCloseTo(view.smartNet, 4);
    expect(view.tilt[0].i).toBe(0);

    const chronoIds = [...view.prints].sort((a, b) => a.print.id - b.print.id).map(r => r.print.id);
    const tiltIds = view.tilt.map(p => p.i);
    expect(tiltIds).toEqual(chronoIds.map((_, i) => i));

    // Only INFORMED prints may move the line: every step must be attributable
    // to an informed print's premium, and a step of zero to anything else.
    const chrono = [...view.prints].sort((a, b) => a.print.id - b.print.id);
    for (let i = 0; i < chrono.length; i++) {
      const step = view.tilt[i].net - (i === 0 ? 0 : view.tilt[i - 1].net);
      if (chrono[i].klass !== 'INFORMED') expect(step).toBe(0);
    }
  });
});

/*
  The open/close term is gone and must stay gone.

  `scorePrint` used to add 12 points and tag a print "opening risk (vol > OI)",
  and subtract 6 when the ratio was under 1. OPRA carries no open/close flag —
  only CBOE's Open-Close Volume Summary and ISE's Open/Close Trade Profile do,
  and neither is on any tier here. The deeper problem is that open and close are
  properties of a POSITION and the two counterparties to one print can be on
  opposite sides of it, so there is no fact in the print for a heuristic to
  approximate.

  Worth writing down how this was missed: the test above was called "scores a
  swept, block-premium, large, OPENING aggressor as INFORMED" and its fixture
  carried `volOverOI: 2, // opening`. It asserted nothing about either. Removing
  the twelve points left it green, because the other factors cleared its
  threshold on their own. A name is not a check.
*/
describe('open/close inference', () => {
  it('does not move the score', () => {
    // Same print twice, differing only in volume/OI. Any gap is an open/close
    // claim by another name.
    const base = { side: 'ASK' as const, sweep: true, premium: 200_000 };
    const high = scorePrint(mkPrint({ ...base, volOverOI: 9 }), 0.9);
    const low = scorePrint(mkPrint({ ...base, volOverOI: 0.1 }), 0.9);
    expect(high.score, 'volume over open interest is shifting the information score').toBe(low.score);
  });

  it('tags no print as opening or closing', () => {
    for (const v of [0.1, 0.9, 1.1, 5, 20]) {
      const c = scorePrint(mkPrint({ side: 'ASK', sweep: true, volOverOI: v }), 0.9);
      for (const r of c.reasons) {
        expect(r.toLowerCase(), `a print was tagged "${r}"`).not.toMatch(/opening|closing/);
      }
    }
  });
});
