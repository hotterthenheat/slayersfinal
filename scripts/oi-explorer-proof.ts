/*
  Acceptance test for the overnight OI board.

  Proves:
  1. It reports a CHANGE between two vintages, and a contract that did not
     move is not a row — a board of unchanged strikes is noise
  2. A contract that did not exist yesterday is MARKED, and its percent is
     null rather than Infinity — there is no percentage change from nothing
  3. The three sorts genuinely order differently: absolute finds the money,
     percent finds the small-but-new, closed inverts to the unwinds
  4. The tallies match the rows they summarise
  5. It is stable within a day — a reader who reloads sees the same board
*/
import { buildOiExplorer, oiRead } from '../src/data/oiExplorer';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const T = 'SPY';

// ── 1. it is a change board ───────────────────────────────────────────────
{
  const e = buildOiExplorer(T, 'absolute', 200);
  check('the board has rows', e.rows.length > 0, `${e.rows.length}`);
  check('every row actually moved', e.rows.every(r => r.change !== 0));
  check('change is today against yesterday, exactly', e.rows.every(r => r.change === r.oi - r.prevOi));
  check('both vintages are kept, not just the delta', e.rows.every(r => r.oi >= 0 && r.prevOi >= 0));
}

// ── 2. a contract that did not exist ──────────────────────────────────────
{
  const e = buildOiExplorer(T, 'percent', 400);
  const news = e.rows.filter(r => r.wasEmpty);
  check('PREMISE: some contracts appeared overnight', news.length > 0, `${news.length}`);
  check('a new contract has null percent, never Infinity', news.every(r => r.changePct === null));
  check('— and is flagged, so a reader does not infer it from the gap', news.every(r => r.prevOi === 0 && r.wasEmpty));
  const grown = e.rows.filter(r => !r.wasEmpty);
  check('a grown contract has a real percent', grown.every(r => r.changePct !== null && Number.isFinite(r.changePct)));
  check('and that percent is the change over yesterday', grown.slice(0, 20).every(r => Math.abs((r.changePct as number) - (r.change / r.prevOi) * 100) < 0.2));
}

// ── 3. the sorts differ ───────────────────────────────────────────────────
{
  const abs = buildOiExplorer(T, 'absolute', 30);
  const pct = buildOiExplorer(T, 'percent', 30);
  const cls = buildOiExplorer(T, 'closed', 30);
  check('absolute leads with the biggest contract move', Math.abs(abs.rows[0].change) >= Math.abs(abs.rows[abs.rows.length - 1].change));
  check('absolute really is sorted by size of change', abs.rows.every((r, i) => i === 0 || Math.abs(abs.rows[i - 1].change) >= Math.abs(r.change)));
  check('percent leads with contracts that appeared from nothing', pct.rows[0].wasEmpty);
  check('closed leads with an unwind, not a build', cls.rows[0].change < 0, String(cls.rows[0].change));
  check('closed is ascending — the biggest unwind first', cls.rows.every((r, i) => i === 0 || cls.rows[i - 1].change <= r.change));
  check('the three orders are not the same board', JSON.stringify(abs.rows.map(r => r.key)) !== JSON.stringify(cls.rows.map(r => r.key)));
}

// ── 4. the tallies ────────────────────────────────────────────────────────
{
  const e = buildOiExplorer(T, 'absolute', 5000);
  const opened = e.rows.filter(r => r.change > 0).length;
  const closed = e.rows.filter(r => r.change < 0).length;
  const fresh = e.rows.filter(r => r.wasEmpty).length;
  check('the opened tally matches the rows', e.opened === opened, `${e.opened} vs ${opened}`);
  check('the closed tally matches', e.closed === closed, `${e.closed} vs ${closed}`);
  check('the fresh tally matches', e.fresh === fresh, `${e.fresh} vs ${fresh}`);
  check('net change is the sum of the changes', e.netChange === e.rows.reduce((a, r) => a + r.change, 0));
  check('the read names the count and the fresh ones', /contracts of open interest overnight/.test(oiRead(e, T)), oiRead(e, T).slice(0, 100));
}

// ── 5. stable within the day ──────────────────────────────────────────────
{
  const a = buildOiExplorer(T, 'absolute', 20);
  const b = buildOiExplorer(T, 'absolute', 20);
  check('two reads of the same day agree', JSON.stringify(a.rows) === JSON.stringify(b.rows));
  const other = buildOiExplorer('QQQ', 'absolute', 20);
  check('another name is a different board', JSON.stringify(a.rows.map(r => r.key)) !== JSON.stringify(other.rows.map(r => r.key)));
  /* A different DAY must give a different board — otherwise "overnight"
     never changes and the surface is a still life. */
  const yesterday = buildOiExplorer(T, 'absolute', 20, '2020-01-02');
  check('a different session is a different board', JSON.stringify(a.rows) !== JSON.stringify(yesterday.rows));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
