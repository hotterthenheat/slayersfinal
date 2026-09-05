/*
  Acceptance test for Part 1.2 — "Timeframe selector states … with disabled
  reasons where history is short."

  Two things are guarded. The count has to be the count the chart would
  ACTUALLY draw — dividing minutes by 1,440 says a day is 1,440 minutes of
  bars and reports six sessions where there are twenty-two. And the refusal
  has to be reachable on the desk's own history: a floor nothing ever
  trips is a control that cannot be checked, and a floor everything trips
  is a chart with no timeframes.
*/
import Simulator from '../src/core/simulator';
import { MIN_BARS, TIMEFRAMES, aggregateCandles, barCounts, tooShort } from '../src/data/timeframe';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const base = Simulator.getCandles('SPY');
check('PREMISE: there is a base history', base.length > 1000, `${base.length} one-minute bars`);

const counts = barCounts(base);
check('every timeframe is counted', TIMEFRAMES.every(t => typeof counts[t.value] === 'number'));

/* The count is the aggregation's own length — the same function the chart
   draws with, so the two cannot disagree about how many bars 1D has. */
check(
  'the count is what aggregateCandles would draw, timeframe by timeframe',
  TIMEFRAMES.every(t => counts[t.value] === aggregateCandles(base, t.minutes).length)
);

/* Sessions are 390 minutes, not 1,440. Twenty-two sessions must count as
   twenty-two daily bars, not six. */
const sessions = Math.round(base.length / 390);
check('1D counts SESSIONS, not calendar minutes', Math.abs((counts['1D'] ?? 0) - sessions) <= 1, `${counts['1D']} bars for ${sessions} sessions`);
check('and that is not the six a minutes/1440 division would report', (counts['1D'] ?? 0) > 10);

/* The refusal is reachable, and it lands where it should. */
const refused = TIMEFRAMES.filter(t => tooShort(counts, t.value) !== null).map(t => t.value);
check('at least one timeframe is refused on this history', refused.length > 0, refused.join(', '));
check('and 1W is among them — five weeks is not a weekly chart', refused.includes('1W'));
check('but 1D is not — twenty-two sessions is a daily chart', !refused.includes('1D'));
check('and the intraday set is untouched', ['1m', '5m', '15m', '30m', '1h'].every(tf => !refused.includes(tf as never)));
check('the seconds tape is never judged here — it empties on the chart itself', tooShort(counts, '15s') === null);

const why = tooShort(counts, '1W')!;
check('the reason names the count', why.includes(String(counts['1W'])), why);
check('and the floor', why.includes(String(MIN_BARS)));
check('and the timeframe it is refusing', why.includes('1W'));
check('and reads as a sentence, not a code', /history/.test(why) && /needs/.test(why));

/* Absent counts must never disable anything — a chart with no history
   information keeps every control live. */
check('no counts means no refusals', TIMEFRAMES.every(t => tooShort(undefined, t.value) === null));
check('a missing entry means no refusal either', tooShort({}, '1W') === null);

/* Exactly at the floor is allowed; one under is not. */
check('the floor is inclusive', tooShort({ '1W': MIN_BARS }, '1W') === null);
check('one bar under it is refused', tooShort({ '1W': MIN_BARS - 1 }, '1W') !== null);
check('and one bar is singular in the sentence', /1 bar of/.test(tooShort({ '1W': 1 }, '1W') ?? ''));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
