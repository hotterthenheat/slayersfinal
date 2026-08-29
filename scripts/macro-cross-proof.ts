/*
  Acceptance test for §14 (cross-asset) and §16 (macro detail) — the two
  surfaces that answer "what decided the open", which is the desk's own
  thesis and the thing a 09:30 chart cannot show.

  Proves:
  1. The risk convention is the READER'S, not the maths': a rising yen pair
     is risk-ON, a rising gold is risk-OFF, and a move too small to mean
     anything is FLAT rather than rounded into a direction
  2. Correlation is a real Pearson — ±1 on constructed series, 0 on
     orthogonal ones — and rides with its sample count
  3. The overnight verdict needs a majority, and says MIXED when the four
     disagree rather than picking a side
  4. A FUTURE macro event has NO actual, NO surprise and NO reaction — the
     one rule a generator most easily breaks by always returning a number
  5. A PAST one has all three, and surprise is exactly actual − consensus
  6. Units are carried per indicator, because "0.2" means four things here
  7. Everything is deterministic per (symbol/date)
*/
import { CROSS_ASSETS, correlate, overnightRiskRead, readCrossAssets } from '../src/data/crossAsset';
import { detailFor, macroCards, nextEvent, pastRecord } from '../src/data/macroDetail';
import { macroWindow } from '../src/data/events';

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, x = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`);
  ok ? pass++ : fail++;
};
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

const eq = Array.from({ length: 63 }, (_, i) => ({ min: i * 15, close: 5000 + Math.sin(i / 4) * 12 }));

// ── 2. correlation, on constructed series ─────────────────────────────────
{
  const a = [1, 2, 3, 4, 5, 6];
  check('a series correlates +1 with itself', near(correlate(a, a), 1, 1e-9), String(correlate(a, a)));
  check('and −1 with its negation', near(correlate(a, a.map(x => -x)), -1, 1e-9));
  check('a flat series correlates 0, not NaN', correlate(a, [2, 2, 2, 2, 2, 2]) === 0);
  check('too few points is 0, not a coin toss', correlate([1, 2], [1, 2]) === 0);
  check('the result is always inside [−1, 1]', (() => {
    for (let s = 0; s < 40; s++) {
      const x = Array.from({ length: 30 }, (_, i) => Math.sin(i * (s + 1)));
      const y = Array.from({ length: 30 }, (_, i) => Math.cos(i * (s + 2)));
      const c = correlate(x, y);
      if (!(c >= -1 && c <= 1)) return false;
    }
    return true;
  })());
}

// ── 1. the risk convention ────────────────────────────────────────────────
{
  const reads = readCrossAssets('2026-08-28', eq);
  check('PREMISE: four instruments, each with a role', reads.length === 4 && reads.every(r => r.spec.role.length > 20));
  check('gold is the one that reads risk-OFF when it rises',
    CROSS_ASSETS.find(a => a.key === 'XAU')!.riskOnWhenUp === false);
  check('the yen pair and the euro read risk-ON when they rise',
    CROSS_ASSETS.filter(a => a.key === 'USDJPY' || a.key === 'EURUSD').every(a => a.riskOnWhenUp));
  check('every read words its move for equities',
    reads.every(r => ['RISK-ON', 'RISK-OFF', 'FLAT'].includes(r.risk)),
    reads.map(r => `${r.spec.key}:${r.risk}`).join(' '));
  check('a move under a tenth of a percent is FLAT, not a direction',
    reads.every(r => (Math.abs(r.changePct) < 0.1) === (r.risk === 'FLAT')));
  check('correlation rides with its sample count', reads.every(r => r.samples > 10 && r.corr >= -1 && r.corr <= 1),
    reads.map(r => `${r.spec.key} ρ${r.corr.toFixed(2)}/${r.samples}`).join(' '));
  check('every series spans 18:00 ET to the open', reads.every(r => r.bars[0].min === 0 && r.bars[r.bars.length - 1].min === 930));
}

// ── 3. the verdict ────────────────────────────────────────────────────────
{
  const mk = (risks: ('RISK-ON' | 'RISK-OFF' | 'FLAT')[]) =>
    risks.map(r => ({ risk: r })) as unknown as Parameters<typeof overnightRiskRead>[0];
  check('three of four on is RISK-ON', overnightRiskRead(mk(['RISK-ON', 'RISK-ON', 'RISK-ON', 'FLAT'])).verdict === 'RISK-ON');
  check('three of four off is RISK-OFF', overnightRiskRead(mk(['RISK-OFF', 'RISK-OFF', 'RISK-OFF', 'FLAT'])).verdict === 'RISK-OFF');
  check('two against two is MIXED, not a coin flip',
    overnightRiskRead(mk(['RISK-ON', 'RISK-ON', 'RISK-OFF', 'RISK-OFF'])).verdict === 'MIXED');
  check('nothing moving is QUIET', overnightRiskRead(mk(['FLAT', 'FLAT', 'FLAT', 'FLAT'])).verdict === 'QUIET');
}

// ── 4+5+6. the macro card ─────────────────────────────────────────────────
{
  const today = new Date('2026-08-28T12:00:00');
  const cards = macroCards(today);
  check('PREMISE: the window holds events', cards.length > 2, `${cards.length} cards`);

  const future = cards.filter(c => !c.past);
  const past = cards.filter(c => c.past);
  check('PREMISE: the window straddles today', future.length > 0 && past.length > 0, `${past.length} past, ${future.length} ahead`);

  check('a FUTURE event has no actual, no surprise and no reaction',
    future.every(c => c.actual === null && c.surprise === null && c.reaction === null));
  check('— but it does carry a consensus, which is what is known', future.every(c => Number.isFinite(c.consensus)));
  check('a PAST event has all three', past.every(c => c.actual !== null && c.surprise !== null && c.reaction !== null));
  check('and surprise is exactly actual − consensus',
    past.every(c => Math.abs((c.actual as number) - c.consensus - (c.surprise as number)) < 0.011),
    past.slice(0, 2).map(c => `${c.kind} ${c.actual}−${c.consensus}=${c.surprise}`).join(' '));

  check('units are carried per indicator', (() => {
    const kinds = new Map(cards.map(c => [c.kind, c.unit]));
    return kinds.get('NFP') === 'k jobs' && kinds.get('CPI') === '%';
  })(), [...new Set(cards.map(c => `${c.kind}:${c.unit}`))].join(' '));

  check('the next event ahead is the nearest one', (() => {
    const n = nextEvent(cards);
    return n !== null && !n.past && cards.filter(c => !c.past).every(c => c.iso >= n.iso);
  })(), nextEvent(cards)?.label);

  const rec = pastRecord(cards, 'CPI');
  check('the past record counts hot against cold', rec.hot + rec.cold + rec.inline === past.filter(c => c.kind === 'CPI').length,
    `hot ${rec.hot} cold ${rec.cold} inline ${rec.inline}`);
  const none = pastRecord(cards.filter(c => !c.past), 'CPI');
  check('with no past prints it reports no average, not zero', none.avgReaction === null);
}

// ── 7. determinism ────────────────────────────────────────────────────────
{
  check('cross-asset replays identically for a date',
    JSON.stringify(readCrossAssets('2026-08-28', eq)) === JSON.stringify(readCrossAssets('2026-08-28', eq)));
  check('and differs on another date',
    JSON.stringify(readCrossAssets('2026-08-27', eq)) !== JSON.stringify(readCrossAssets('2026-08-28', eq)));
  const e = macroWindow(new Date('2026-08-28T12:00:00'))[0];
  check('a macro card is stable for its date',
    JSON.stringify(detailFor(e, '2026-08-28')) === JSON.stringify(detailFor(e, '2026-08-28')));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
