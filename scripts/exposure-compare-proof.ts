/*
  Acceptance test for P-22's two-ticker exposure compare.

  The normalization IS the feature. Two books on different price axes and
  different dollar scales cannot be compared at all, and the two ways to get
  it wrong both produce confident output: leave the dollars unnormalized and
  the bigger book "diverges" everywhere; leave the axis in dollars and
  nothing ever aligns. Both are staged.

  Proves:
  1. IDENTICAL SHAPES AT DIFFERENT SCALES READ AS IDENTICAL. A book ten
     times the notional of another, with the same shape, must show ZERO
     divergence — this is the assertion that proves the dollar normalization
     is real rather than decorative
  2. IDENTICAL SHAPES AT DIFFERENT PRICE LEVELS ALSO ALIGN — a $5,880 index
     and a $588 ETF land in the same percent buckets
  3. A genuine shape difference DOES show up, signed, in the bucket where it
     lives, and the widest bucket is the one that actually differs most
  4. Each book's share is of its OWN total, so shares are bounded and
     comparable
  5. Strikes outside the reach are dropped rather than piled onto the edge
     bucket, where they would invent a shelf
  6. Levels are reported in percent from each book's own spot — the only
     form in which two instruments' walls can be compared
  7. Degenerate inputs report null
*/
import { buildExposureCompare, compareWords, BUCKET_PCT, REACH_PCT } from '../src/data/exposureCompare';
import type { MarketSnapshot, StrikeNode } from '../src/types/market';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

const node = (strike: number, netGex: number): StrikeNode => ({ strike, netGex } as unknown as StrikeNode);
const snap = (ticker: string, spot: number, chain: StrikeNode[]): MarketSnapshot =>
  ({ ticker, spot, chain } as unknown as MarketSnapshot);

/* One shape, expressed at any price level and any notional scale: gamma
   placed at −2%, 0% and +2% from whatever spot it is given. */
const shaped = (ticker: string, spot: number, scale: number) =>
  snap(ticker, spot, [
    node(spot * 1.02, -3 * scale),
    node(spot, 1 * scale),
    node(spot * 0.98, 2 * scale),
  ]);

// ── 1. scale invariance ───────────────────────────────────────────────────
{
  const small = shaped('SPY', 588, 1e6);
  const huge = shaped('SPX', 588, 1e9); // same price, 1000× the notional
  const c = buildExposureCompare(small, huge)!;
  check('PREMISE: the compare builds', c !== null && c.buckets.length > 0);
  check(
    'a book 1000× the notional with the SAME shape shows zero divergence',
    near(c.totalDivergence, 0, 1e-12),
    String(c.totalDivergence)
  );
  check('and the read says so in words', /no structural divergence/.test(compareWords(c)));
}

// ── 2. price-level invariance ─────────────────────────────────────────────
{
  const etf = shaped('SPY', 588, 1e6);
  const index = shaped('SPX', 5_880, 1e9); // ten times the price AND bigger
  const c = buildExposureCompare(etf, index)!;
  check(
    'a $5,880 index and a $588 ETF with the same shape align exactly',
    near(c.totalDivergence, 0, 1e-12),
    String(c.totalDivergence)
  );
  /* The buckets that carry the shape are the ±2% ones, on both. */
  const at2 = c.buckets.find(b => near(b.pct, 2, 1e-6));
  check('and the shape lands in the percent bucket it belongs to', at2 !== undefined && at2.a !== 0 && at2.b !== 0, JSON.stringify(at2));
}

// ── 3. a real difference shows up, signed ─────────────────────────────────
{
  const a = snap('SPY', 500, [node(510, 1e8), node(500, 1e8)]);      // +2% is call-heavy... 
  const b = snap('QQQ', 400, [node(408, -1e8), node(400, 1e8)]);      // +2% is the opposite sign
  const c = buildExposureCompare(a, b)!;
  const at2 = c.buckets.find(x => near(x.pct, 2, 1e-6))!;
  check('PREMISE: both books put gamma at +2%', at2.a !== 0 && at2.b !== 0);
  check('opposite signs at the same bucket produce a large divergence', Math.abs(at2.divergence) > 0.5, String(at2.divergence));
  check('and it is SIGNED — a − b', near(at2.divergence, at2.a - at2.b));
  /*
    SIGNED MEANS IT CAN BE NEGATIVE. The case above happens to divide
    positive, so an unsigned |a − b| survived it — swapping the books must
    flip the sign, which only a genuinely signed subtraction does.
  */
  const swapped = buildExposureCompare(b, a)!;
  const at2Swapped = swapped.buckets.find(x => near(x.pct, 2, 1e-6))!;
  check('swapping the books flips the sign — it is a subtraction, not a magnitude', near(at2Swapped.divergence, -at2.divergence), `${at2Swapped.divergence} vs ${-at2.divergence}`);
  check('— and one of the two is genuinely negative', at2.divergence < 0 || at2Swapped.divergence < 0);
  check('the widest bucket is the one that differs most', Math.abs(c.widest!.divergence) >= Math.abs(at2.divergence) - 1e-12);
  check('the words name where and which book', /above spot/.test(compareWords(c)) && /(SPY|QQQ)/.test(compareWords(c)), compareWords(c).slice(0, 90));
}

// ── 4. shares are of each book's own total ────────────────────────────────
{
  const c = buildExposureCompare(shaped('SPY', 500, 1e6), shaped('QQQ', 400, 7e8))!;
  const sumA = c.buckets.reduce((s, b) => s + Math.abs(b.a), 0);
  const sumB = c.buckets.reduce((s, b) => s + Math.abs(b.b), 0);
  check('each book’s absolute shares sum to 1 over its own book', near(sumA, 1, 1e-9) && near(sumB, 1, 1e-9), `${sumA} / ${sumB}`);
  check('so every share is bounded by 1', c.buckets.every(b => Math.abs(b.a) <= 1 && Math.abs(b.b) <= 1));
}

// ── 5. the reach ──────────────────────────────────────────────────────────
{
  /* A strike 30% away must be DROPPED, not piled onto the edge bucket. */
  const withFar = snap('SPY', 500, [node(500, 1e8), node(650, 9e9)]);
  const plain = snap('SPY', 500, [node(500, 1e8)]);
  const c = buildExposureCompare(withFar, plain)!;
  const edge = c.buckets[c.buckets.length - 1];
  check(`a strike beyond ±${REACH_PCT}% does not land on the edge bucket`, near(edge.a, 0), String(edge.a));
  /* It is dropped from the buckets but still counted in the book's total,
     which is correct: it IS part of that book's gamma, it is just off-map.
     So the on-map shares no longer sum to 1 — and that is honest. */
  const onMap = c.buckets.reduce((s, b) => s + Math.abs(b.a), 0);
  check('— and its absence is visible as on-map share below 1', onMap < 1, String(onMap));
  check('the bucket half-width is the documented one', BUCKET_PCT === 0.25);
}

// ── 6. levels in percent ──────────────────────────────────────────────────
{
  const c = buildExposureCompare(shaped('SPY', 588, 1e6), shaped('SPX', 5_880, 1e9))!;
  check(
    'walls are reported in percent from each book’s own spot',
    c.levels.a.callWall !== null && near(c.levels.a.callWall!, c.levels.b.callWall!, 1e-9),
    `${c.levels.a.callWall} vs ${c.levels.b.callWall}`
  );
  check('— so two instruments’ levels are finally comparable', near(c.levels.a.putWall ?? 0, c.levels.b.putWall ?? 0, 1e-9));
}

// ── 7. degenerate ─────────────────────────────────────────────────────────
{
  check('an empty book reports null', buildExposureCompare(snap('A', 100, []), shaped('B', 100, 1)) === null);
  check('a zero spot reports null', buildExposureCompare(snap('A', 0, [node(1, 1)]), shaped('B', 100, 1)) === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
