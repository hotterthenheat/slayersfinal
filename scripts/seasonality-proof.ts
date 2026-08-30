/*
  Acceptance test for seasonality.

  Proves:
  1. Twelve months, each summarising a real sample — and the summary
     actually matches the returns it claims to summarise
  2. The headline is the MEDIAN, not the mean: best/worst rank on it, so a
     month that is flat for years and enormous once cannot be crowned
  3. A hit rate always carries its sample size — a rate without one is a
     number nobody can weigh
  4. It is stable per name: a reader who checks twice sees the same history,
     and two names see different ones
  5. The tail note fires only when mean and median actually diverge
*/
import { buildSeasonality, monthlyReturns, seasonalityRead, tailNote, MONTHS, SEASONALITY_YEARS } from '../src/data/seasonality';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};
const near = (a: number, b: number, eps = 0.02) => Math.abs(a - b) < eps;

// ── 1. the summary matches its sample ─────────────────────────────────────
{
  const s = buildSeasonality('SPY');
  check('twelve months', s.months.length === 12, s.months.map(m => m.label).join(''));
  check('labelled in calendar order', s.months.every((m, i) => m.label === MONTHS[i] && m.month === i));

  for (const m of s.months.slice(0, 3)) {
    const rs = monthlyReturns('SPY', m.month);
    const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
    const sorted = [...rs].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    const med = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    const wins = rs.filter(r => r > 0).length;
    check(`${m.label}: the mean is the sample's mean`, near(m.meanPct, mean));
    check(`${m.label}: the median is the sample's median`, near(m.medianPct, med));
    check(`${m.label}: the hit rate is the sample's`, m.positivePct === Math.round((wins / rs.length) * 100));
    check(`${m.label}: best and worst are the sample's extremes`, m.bestPct === Math.max(...rs) && m.worstPct === Math.min(...rs));
  }
}

// ── 2. ranked on the median ───────────────────────────────────────────────
{
  const s = buildSeasonality('NVDA');
  const maxMed = Math.max(...s.months.map(m => m.medianPct));
  const minMed = Math.min(...s.months.map(m => m.medianPct));
  check('the best month is the highest MEDIAN', s.best.medianPct === maxMed, `${s.best.label} ${s.best.medianPct}`);
  check('the worst month is the lowest MEDIAN', s.worst.medianPct === minMed, `${s.worst.label} ${s.worst.medianPct}`);
  /* And that is a different answer from ranking on the mean, at least
     sometimes — if it never were, the distinction would be decorative. */
  let differs = false;
  for (const t of ['SPY', 'QQQ', 'NVDA', 'AAPL', 'TSLA', 'META', 'AMZN', 'GOOGL']) {
    const x = buildSeasonality(t);
    const byMean = [...x.months].sort((a, b) => b.meanPct - a.meanPct)[0];
    if (byMean.month !== x.best.month) differs = true;
  }
  check('mean-ranking and median-ranking really can disagree', differs, 'across eight names');
}

// ── 3. the sample is always printed ───────────────────────────────────────
{
  const s = buildSeasonality('AAPL');
  check('every month carries its year count', s.months.every(m => m.years === SEASONALITY_YEARS && m.years > 0));
  check('a hit rate is a percentage of that count', s.months.every(m => m.positivePct >= 0 && m.positivePct <= 100));
  check('the read names the sample size', /\d+ years/.test(seasonalityRead(s)), seasonalityRead(s).slice(0, 90));
}

// ── 4. stable per name, different between names ───────────────────────────
{
  const a = buildSeasonality('SPY');
  const b = buildSeasonality('SPY');
  check('the same name reads the same twice', JSON.stringify(a.months) === JSON.stringify(b.months));
  const q = buildSeasonality('QQQ');
  check('a different name reads differently', JSON.stringify(a.months) !== JSON.stringify(q.months));
}

// ── 5. the tail note ──────────────────────────────────────────────────────
{
  check('no note when mean and median agree', tailNote({ month: 0, label: 'Jan', meanPct: 1.0, medianPct: 1.2, positivePct: 50, years: 15, bestPct: 5, worstPct: -5 }) === null);
  const low = tailNote({ month: 0, label: 'Jan', meanPct: -2, medianPct: 1.5, positivePct: 60, years: 15, bestPct: 5, worstPct: -30 });
  check('mean far BELOW median warns of rare violent losses', !!low && /occasionally very bad/.test(low));
  const high = tailNote({ month: 0, label: 'Jan', meanPct: 4, medianPct: 0.5, positivePct: 50, years: 15, bestPct: 40, worstPct: -5 });
  check('mean far ABOVE median warns the average is carried by outliers', !!high && /outsized/.test(high));
}

// ── the current month is marked ───────────────────────────────────────────
{
  const s = buildSeasonality('SPY', new Date('2026-09-15T12:00:00Z'));
  check('the current month is the one we are in', s.currentMonth === 8, `${MONTHS[s.currentMonth]}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
