import { describe, expect, it } from 'vitest';
import { buildExecutionQuality, gradeOf, scorePrint } from './executionQuality';
import type { FlowPrint } from '../types/flowdesk';

/*
==================================================
  Execution quality is arithmetic, which is exactly why it
  needs guarding: an arithmetic error produces a plausible
  number rather than a crash, and every figure on this desk
  is presented as a measurement of what a fill cost.

  Two failure modes are pinned hardest.

    1. THE WEIGHTING. `eq`, `bps` and `quotedSpreadPct` are
       RATES. Summing or plain-averaging a rate across prints
       of wildly different size lets a $50 lottery ticket
       with a 100% spread carry the same weight as a $2M
       block that crossed at the mid. That is the same defect
       class as summing a per-contract greek, and the fix is
       the same: weight by the extensive quantity.

    2. THE SIDE SYMMETRY. Price improvement measured against
       the near touch scores an identical midpoint cross as a
       full half-spread of improvement on a buy and zero on a
       sell. Measured against the midpoint, both sides are
       one quantity.
==================================================
*/

const print = (over: Partial<FlowPrint>): FlowPrint => ({
  id: 1,
  time: '09:30',
  ticker: 'SPY',
  legs: 1,
  strike: 500,
  right: 'C',
  otmPct: 0,
  expiry: '01/17/2025',
  dte: 7,
  fill: 1.0,
  bid: 0.9,
  ask: 1.1,
  fillPos: 0.5,
  side: 'MID',
  flowScore: 0,
  ratioLabel: 'MID',
  ratioBidPct: 50,
  size: 10,
  premium: 1000,
  volume: 100,
  oi: { value: 100, asOf: '2025-01-16', freshness: 'SETTLED' },
  deltaOI: { value: 0, asOf: '2025-01-16', freshness: 'SETTLED' },
  spot: 500,
  iv: 20,
  volOverOI: 1,
  strat: '—',
  sweep: false,
  ...over,
});

describe('one print, scored', () => {
  it('measures the standard TCA quantities off bid, ask, fill and size', () => {
    // bid 0.90 / ask 1.10 → mid 1.00, quoted 0.20, half 0.10.
    // A fill at the ask is the full half-spread away from the mid.
    const s = scorePrint(print({ fill: 1.1, size: 25 }));
    expect(s.mid).toBeCloseTo(1.0, 10);
    expect(s.quotedSpread).toBeCloseTo(0.2, 10);
    expect(s.quotedSpreadPct).toBeCloseTo(20, 10);
    expect(s.effectiveSpread).toBeCloseTo(0.2, 10);
    expect(s.effectiveOverQuoted).toBeCloseTo(1, 10);
    expect(s.priceImprovement).toBeCloseTo(0, 10);
    expect(s.spreadCost).toBeCloseTo(0.1 * 25 * 100, 10);
  });

  it('scores a midpoint cross as free, and one outside the quote as worse than the touch', () => {
    const atMid = scorePrint(print({ fill: 1.0 }));
    expect(atMid.effectiveOverQuoted).toBe(0);
    expect(atMid.spreadCost).toBe(0);
    expect(atMid.priceImprovement).toBeCloseTo(0.1, 10); // saved the half-spread

    const outside = scorePrint(print({ fill: 1.25 }));
    expect(outside.effectiveOverQuoted).toBeGreaterThan(1);
    expect(outside.priceImprovement).toBeLessThan(0); // gave up MORE than the touch
    expect(gradeOf(outside.effectiveOverQuoted)).toBe('OUTSIDE');
  });

  it('treats a buy and a sell of the same distance identically', () => {
    /*
      The whole reason improvement is measured against the MIDPOINT. Against the
      near touch, a buy is scored on (ask − fill) and a sell on (fill − bid);
      those are two scales, they cannot be summed into a session total, and the
      same midpoint cross scores a full half-spread on one side and nothing on
      the other.
    */
    const buy = scorePrint(print({ fill: 1.05, side: 'ASK' }));
    const sell = scorePrint(print({ fill: 0.95, side: 'BID' }));
    expect(buy.effectiveSpread).toBeCloseTo(sell.effectiveSpread, 10);
    expect(buy.effectiveOverQuoted).toBeCloseTo(sell.effectiveOverQuoted, 10);
    expect(buy.priceImprovement).toBeCloseTo(sell.priceImprovement, 10);
    expect(buy.spreadCost).toBeCloseTo(sell.spreadCost, 10);
  });

  it('does not divide by a crossed or locked quote', () => {
    // A locked market (bid === ask) has no half-spread to measure against, and
    // a ratio over zero formats as "∞%" on a desk about cost.
    const locked = scorePrint(print({ bid: 1.0, ask: 1.0, fill: 1.0 }));
    expect(Number.isFinite(locked.effectiveOverQuoted)).toBe(true);
    expect(locked.effectiveOverQuoted).toBe(0);
    expect(Number.isFinite(locked.quotedSpreadPct)).toBe(true);
  });
});

describe('the session', () => {
  it('sums dollars and weights rates by premium', () => {
    /*
      THE LOAD-BEARING TEST. A tiny print with a terrible fill beside a large one
      that crossed at the mid. A plain mean of E/Q says 0.5 — the session paid
      half the spread. Premium-weighted says ~0.001, because essentially none of
      the session's dollars paid anything. Only the second describes the tape.
    */
    const tiny = print({ id: 1, bid: 0.03, ask: 0.08, fill: 0.08, size: 1, premium: 8 });
    const block = print({ id: 2, bid: 9.9, ask: 10.1, fill: 10.0, size: 2_000, premium: 2_000_000 });

    const v = buildExecutionQuality([tiny, block], 'SPY');
    expect(v.prints).toBe(2);
    expect(v.premium).toBe(8 + 2_000_000);

    // Dollars sum: only the tiny print paid anything, and it paid the half-spread.
    expect(v.spreadCost).toBeCloseTo(0.025 * 1 * 100, 8);

    // The plain mean would be 0.5. Premium-weighted is essentially zero.
    const plainMean = (1 + 0) / 2;
    expect(plainMean).toBe(0.5);
    expect(v.effectiveOverQuoted).toBeLessThan(0.001);

    // Same for the quoted-spread rate: the tiny contract's spread is 71% of its
    // mid and must not carry the session.
    expect(v.quotedSpreadPct).toBeLessThan(3);
  });

  it('reports cost in basis points of the premium that actually traded', () => {
    const p = print({ bid: 0.9, ask: 1.1, fill: 1.1, size: 100, premium: 11_000 });
    const v = buildExecutionQuality([p], 'SPY');
    // 0.10 x 100 x 100 = $1,000 paid on $11,000 of premium.
    expect(v.spreadCost).toBeCloseTo(1000, 8);
    expect(v.costBps).toBeCloseTo((1000 / 11_000) * 10_000, 6);
  });

  it('drops prints it cannot score rather than scoring them as free', () => {
    /*
      A print with no two-sided quote is not a free fill; it is a print this
      measure cannot speak about. Folding it in as `cost 0` drags every session
      average toward zero in proportion to how much of the tape is unquotable —
      the desk would look better the less it knew.
    */
    const quoted = print({ id: 1, bid: 0.9, ask: 1.1, fill: 1.1, size: 10, premium: 1_100 });
    const unquoted = print({ id: 2, bid: 0, ask: 0, fill: 1.0, size: 10, premium: 1_000 });
    const v = buildExecutionQuality([quoted, unquoted], 'SPY');
    expect(v.prints).toBe(1);
    expect(v.premium).toBe(1_100);
    expect(v.effectiveOverQuoted).toBeCloseTo(1, 8);
  });

  it('accounts for every scored print exactly once across the histogram', () => {
    const prints = Array.from({ length: 40 }, (_, i) =>
      print({ id: i, fill: 0.9 + (i / 40) * 0.35, size: 5 + i, premium: 500 + i * 37 })
    );
    const v = buildExecutionQuality(prints, 'SPY');
    expect(v.buckets.reduce((a, b) => a + b.prints, 0)).toBe(v.prints);
    expect(v.buckets.reduce((a, b) => a + b.premium, 0)).toBeCloseTo(v.premium, 6);
    expect(v.buckets.reduce((a, b) => a + b.cost, 0)).toBeCloseTo(v.spreadCost, 6);
  });

  it('cuts by expiry and by side without losing or double-counting a print', () => {
    const prints = [
      print({ id: 1, dte: 0, side: 'ASK' }),
      print({ id: 2, dte: 3, side: 'ASK' }),
      print({ id: 3, dte: 21, side: 'BID' }),
      print({ id: 4, dte: 60, side: 'MID' }),
      print({ id: 5, dte: 200, side: 'BID' }),
    ];
    const v = buildExecutionQuality(prints, 'SPY');
    expect(v.byExpiry.reduce((a, c) => a + c.prints, 0)).toBe(5);
    expect(v.bySide.reduce((a, c) => a + c.prints, 0)).toBe(5);
    expect(v.byExpiry.map(c => c.key)).toEqual(['0DTE', '1-7d', '8-30d', '31-90d', '90d+']);
    expect(v.bySide.find(c => c.key === 'Hit bid')!.prints).toBe(2);
    // An empty band is dropped rather than rendered as a zero row — a
    // distribution with a phantom category in it is a worse picture than one
    // with fewer bars.
    expect(buildExecutionQuality([print({ side: 'MID' })], 'SPY').bySide.map(c => c.key)).toEqual([
      'Crossed mid',
    ]);
  });

  it('answers about one name, not the whole tape', () => {
    // Three desks read the one session tape. A desk that forgot to scope would
    // report another symbol's spreads under this symbol's heading.
    const mine = print({ id: 1, ticker: 'SPY', bid: 0.9, ask: 1.1, fill: 1.1, size: 10, premium: 1_100 });
    const theirs = print({ id: 2, ticker: 'QQQ', bid: 0.9, ask: 1.1, fill: 1.0, size: 900, premium: 90_000 });
    const v = buildExecutionQuality([mine, theirs], 'SPY');
    expect(v.prints).toBe(1);
    expect(v.premium).toBe(1_100);
    expect(v.effectiveOverQuoted).toBeCloseTo(1, 8);
  });

  it('survives a tape with nothing scoreable', () => {
    const v = buildExecutionQuality([print({ bid: 0, ask: 0 })], 'SPY');
    expect(v.prints).toBe(0);
    expect(v.premium).toBe(0);
    expect(Number.isFinite(v.costBps)).toBe(true);
    expect(Number.isFinite(v.effectiveOverQuoted)).toBe(true);
    expect(v.worst).toBeNull();
    expect(v.byExpiry).toEqual([]);
  });
});
