/*
  Acceptance test for live volume by strike.

  Proves:
  1. It counts CONTRACTS off the print tape, split call and put, per strike
  2. The window is real — a print older than it is not counted, and the
     answer therefore MOVES as time passes, which is the whole point (the
     chain's existing per-strike volume is a day-stable hash of OI and
     cannot do this)
  3. Only the asked-for ticker is counted
  4. Coverage is honest: a window longer than the tape reaches is reported
     as truncated rather than served as a full count
  5. Degenerate input — empty tape, zero window, sizeless prints
*/
import { strikeFlow, flowAt, fmtContracts } from '../src/data/strikeFlow';
import type { FlowPrint } from '../src/types/trace';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const NOW = 1_760_000_000_000;
const P = (
  strike: number,
  right: 'C' | 'P',
  size: number,
  agoMs: number,
  ticker = 'SPY'
): FlowPrint & { at: number } =>
  ({ ticker, strike, right, size, at: NOW - agoMs } as unknown as FlowPrint & { at: number });

const MIN = 60_000;

// ── 1. contracts by strike, split by right ────────────────────────────────
{
  const tape = [
    P(500, 'C', 100, 1 * MIN),
    P(500, 'C', 50, 2 * MIN),
    P(500, 'P', 30, 3 * MIN),
    P(505, 'P', 400, 1 * MIN),
  ];
  const f = strikeFlow(tape, 'SPY', 10 * MIN, NOW);
  check('one row per strike that traded', f.rows.length === 2, f.rows.map(r => r.strike).join(','));
  const at500 = flowAt(f, 500)!;
  check('calls are summed', at500.callVolume === 150, String(at500.callVolume));
  check('puts are summed separately', at500.putVolume === 30, String(at500.putVolume));
  check('and the row total is both', at500.volume === 180);
  check('prints are counted apart from contracts', at500.prints === 3, String(at500.prints));
  check('the heaviest strike sets the scale', f.maxVolume === 400, String(f.maxVolume));
  check('the total is every contract in the window', f.total === 580, String(f.total));
  check('rows come back in strike order', f.rows[0].strike < f.rows[1].strike);
}

// ── 2. the window is real, and the answer moves ───────────────────────────
{
  const tape = [P(500, 'C', 100, 1 * MIN), P(500, 'C', 900, 30 * MIN)];
  const recent = strikeFlow(tape, 'SPY', 5 * MIN, NOW);
  const wider = strikeFlow(tape, 'SPY', 60 * MIN, NOW);
  check('a print older than the window is not counted', recent.total === 100, String(recent.total));
  check('a wider window sees it', wider.total === 1000, String(wider.total));
  /* THE THING THE OLD FIGURE COULD NOT DO: the same tape, read later, gives
     a different answer because the flow aged out. */
  const later = strikeFlow(tape, 'SPY', 5 * MIN, NOW + 10 * MIN);
  check('the same tape read ten minutes later reports LESS — it is live', later.total === 0, String(later.total));
}

// ── 3. one name only ──────────────────────────────────────────────────────
{
  const tape = [P(500, 'C', 100, 1 * MIN, 'SPY'), P(500, 'C', 700, 1 * MIN, 'QQQ')];
  check('another ticker\'s prints are not counted', strikeFlow(tape, 'SPY', 10 * MIN, NOW).total === 100);
  check('and asking for that one gets its own', strikeFlow(tape, 'QQQ', 10 * MIN, NOW).total === 700);
}

// ── 4. honest coverage ────────────────────────────────────────────────────
{
  const tape = [P(500, 'C', 100, 2 * MIN)];
  const short = strikeFlow(tape, 'SPY', 60 * MIN, NOW);
  check('a window longer than the tape reaches is flagged truncated', short.truncated, `coverage ${Math.round(short.coverageMs / 1000)}s`);
  check('— and coverage says how far back it really goes', Math.abs(short.coverageMs - 2 * MIN) < 1000);
  const deep = [P(500, 'C', 100, 2 * MIN), P(500, 'C', 10, 90 * MIN)];
  check('a tape that outreaches the window is NOT truncated', !strikeFlow(deep, 'SPY', 60 * MIN, NOW).truncated);
}

// ── 5. degenerate ─────────────────────────────────────────────────────────
{
  check('an empty tape is the empty flow', strikeFlow([], 'SPY', 10 * MIN, NOW).rows.length === 0);
  check('a zero window counts nothing', strikeFlow([P(500, 'C', 100, 1000)], 'SPY', 0, NOW).rows.length === 0);
  check('a sizeless print is skipped, not counted as zero volume', strikeFlow([P(500, 'C', 0, 1000)], 'SPY', 10 * MIN, NOW).rows.length === 0);
  check('a strike that did not trade has no row', flowAt(strikeFlow([P(500, 'C', 5, 1000)], 'SPY', 10 * MIN, NOW), 999) === null);
}

// ── the words ─────────────────────────────────────────────────────────────
{
  check('contracts read as a person says them', fmtContracts(840) === '840' && fmtContracts(1240) === '1.2k' && fmtContracts(12400) === '12k', `${fmtContracts(1240)} / ${fmtContracts(12400)}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
