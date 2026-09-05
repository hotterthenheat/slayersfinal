/*
  Acceptance test for PART 0.7 and 0.8 — the stream's own state.

  The failure this guards against is the one the checklist names: showing
  "no data" for a Sunday. A closed market and a dead feed produce the same
  empty panel everywhere they are not distinguished, and the reader cannot
  tell which without being told. Every claim below is about keeping those
  two apart, and about the arithmetic of the words that do it.
*/
import {
  STREAM_WORDS, MARKET_PHASE_WORDS, marketPhase, marketIsOpen, streamStateAt,
  isStreamCurrent, isStreamFault, describeGap, resumePoint, GAP_FLOOR_SECONDS,
  quotaState, pauseNotice, loadProgress, RATE_LIMIT_PER_MIN, QUOTA_WARN_AT,
  type StreamState, type MarketPhase,
} from '../src/core/stream';
import { MARKET_HOLIDAYS } from '../src/core/calendar';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

/* Instants are built in ET by construction: an ISO string with an explicit
   offset, so the test says what it means regardless of where it runs. EDT
   is -04:00; the winter cases below use -05:00 on purpose. */
const et = (iso: string) => new Date(iso);

// ── the Sunday rule ──────────────────────────────────────────────────────
{
  // 2026-09-06 is a Sunday. Midday, when a tape would look most wrongly dead.
  const sunday = et('2026-09-06T13:00:00-04:00');
  check('a Sunday reads WEEKEND, not closed-and-unexplained', marketPhase(sunday) === 'weekend',
    marketPhase(sunday));
  check('a Sunday is not open', !marketIsOpen(sunday));
  check('a Sunday stream reads closed, never a fault',
    streamStateAt(sunday) === 'closed' && !isStreamFault(streamStateAt(sunday)));

  const saturday = et('2026-09-05T13:00:00-04:00');
  check('Saturday too', marketPhase(saturday) === 'weekend');

  /*
    THE DISTINCTION HAS TO SURVIVE A FAULT. A dropped socket on a Sunday is
    still a dropped socket — it will still be dropped on Monday morning, and
    a desk that hides it until then has hidden it exactly when it could have
    been fixed. So a fault outranks the calendar; a healthy feed does not.
  */
  check('a fault outranks a closed market', streamStateAt(sunday, 'disconnected') === 'disconnected');
  check('a healthy feed does NOT outrank a closed market', streamStateAt(sunday, 'live') === 'closed');
}

// ── the cash session's boundaries ────────────────────────────────────────
{
  const cases: Array<[string, MarketPhase]> = [
    ['2026-09-08T03:59:00-04:00', 'closed'],
    ['2026-09-08T04:00:00-04:00', 'premarket'],
    ['2026-09-08T09:29:00-04:00', 'premarket'],
    ['2026-09-08T09:30:00-04:00', 'rth'],
    ['2026-09-08T15:59:00-04:00', 'rth'],
    ['2026-09-08T16:00:00-04:00', 'afterhours'],
    ['2026-09-08T19:59:00-04:00', 'afterhours'],
    ['2026-09-08T20:00:00-04:00', 'closed'],
    ['2026-09-08T23:59:00-04:00', 'closed'],
    ['2026-01-06T00:30:00-05:00', 'closed'],   // winter, past midnight ET
  ];
  let bad = '';
  for (const [iso, want] of cases) {
    const got = marketPhase(et(iso));
    if (got !== want) { bad = `${iso}: ${got}, expected ${want}`; break; }
  }
  check('every cash-session boundary lands on the right side', bad === '', bad);

  /*
    MIDNIGHT IS A REAL TRAP and it is asserted rather than assumed. Intl's
    hourCycle gives 24 for midnight, not 0, so an unguarded `hour * 60`
    reads 00:30 ET as 24:30 — past 20:00, which happens to give the right
    answer for `closed` and the wrong one for everything else. The 00:30
    case above only passes because the reader mods by 24.
  */
  check('midnight is hour 0, not hour 24', marketPhase(et('2026-09-08T00:30:00-04:00')) === 'closed');
  check('and 04:30 the same morning is pre-market, not closed',
    marketPhase(et('2026-09-08T04:30:00-04:00')) === 'premarket');
}

// ── holidays are read in ET, not in the reader's zone ────────────────────
{
  const holiday = [...MARKET_HOLIDAYS][0] as string;
  check('the holiday table is populated', typeof holiday === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(holiday), String(holiday));
  // Pick a holiday that is a weekday, so `weekend` cannot mask the result.
  let weekdayHoliday = '';
  for (const d of MARKET_HOLIDAYS) {
    const wd = new Date(`${d}T12:00:00-05:00`).getUTCDay();
    if (wd !== 0 && wd !== 6) { weekdayHoliday = d; break; }
  }
  if (weekdayHoliday) {
    check(`${weekdayHoliday} at 11:00 ET reads HOLIDAY, not OPEN`,
      marketPhase(new Date(`${weekdayHoliday}T11:00:00-05:00`)) === 'holiday');
    /*
      THE ZONE BUG THIS FORECLOSES: a 21:00 Pacific instant on the day
      BEFORE a holiday is already the holiday in New York. Reading the
      table with a local date gets that wrong for six hours a night — the
      six hours when a west-coast reader is actually at the desk.
    */
    const eveBeforeInPT = new Date(`${weekdayHoliday}T01:00:00-05:00`);  // 22:00 PT the previous evening
    check('a late-evening Pacific instant is read on the ET calendar date',
      marketPhase(eveBeforeInPT) === 'holiday', marketPhase(eveBeforeInPT));
  } else {
    check('a weekday holiday exists to test', false, 'none in the table');
  }
}

// ── every state has words, and they are distinct ─────────────────────────
{
  const states: StreamState[] = ['live', 'reconnecting', 'degraded', 'disconnected', 'closed'];
  const labels = states.map(s => STREAM_WORDS[s].label);
  check('all five stream states are worded', states.every(s => STREAM_WORDS[s]?.label && STREAM_WORDS[s]?.blurb));
  check('no two states share a label', new Set(labels).size === labels.length, labels.join(', '));
  check('exactly one state means the numbers are current',
    states.filter(isStreamCurrent).length === 1 && isStreamCurrent('live'));
  check('closed is not a fault, and the three broken ones are',
    !isStreamFault('closed') && !isStreamFault('live') &&
    isStreamFault('reconnecting') && isStreamFault('degraded') && isStreamFault('disconnected'));

  const phases: MarketPhase[] = ['premarket', 'rth', 'afterhours', 'closed', 'holiday', 'weekend'];
  const plabels = phases.map(p => MARKET_PHASE_WORDS[p].label);
  check('all six market phases are worded', phases.every(p => MARKET_PHASE_WORDS[p]?.label && MARKET_PHASE_WORDS[p]?.blurb));
  check('no two phases share a label', new Set(plabels).size === plabels.length, plabels.join(', '));
}

// ── gaps ─────────────────────────────────────────────────────────────────
{
  check('a sub-floor gap says nothing', describeGap(0) === null && describeGap(1.9) === null);
  check('the floor itself speaks', describeGap(GAP_FLOOR_SECONDS) !== null);
  check('12 seconds reads as the checklist writes it', describeGap(12) === '12s of prints missing',
    String(describeGap(12)));
  /*
    THE UNITS KEEP THEIR PRECISION: 72 seconds is reported as 72 seconds,
    not rounded to "a minute", because a reader lining a gap up against a
    candle needs the seconds. The consequence is that the singular minute
    is unreachable at this threshold, which is why the pluralisation is done
    by a helper rather than by a branch — asserted directly below.
  */
  check('a 72-second gap keeps its seconds', describeGap(72) === '72s of prints missing',
    String(describeGap(72)));
  check('minutes take over at 90 seconds', describeGap(120) === '2 minutes of prints missing' &&
    describeGap(95) === '2 minutes of prints missing',
    `${describeGap(120)} / ${describeGap(95)}`);
  check('the pluraliser is correct for a singular it may never be handed',
    pauseNotice(60) === 'Refresh paused — resumes in 1 minute', String(pauseNotice(60)));
  check('hours are pluralised', describeGap(3600 * 3) === '3 hours of prints missing',
    String(describeGap(3600 * 3)));
  check('a NaN or negative gap says nothing rather than throwing',
    describeGap(NaN) === null && describeGap(-5) === null);

  check('a resume point is ET wall time to the second',
    resumePoint(et('2026-09-08T14:32:07-04:00')) === '14:32:07',
    resumePoint(et('2026-09-08T14:32:07-04:00')));
  check('and midnight resumes at 00, not 24',
    resumePoint(et('2026-09-08T00:04:09-04:00')) === '00:04:09',
    resumePoint(et('2026-09-08T00:04:09-04:00')));
}

// ── quota ────────────────────────────────────────────────────────────────
{
  check('the limit is the plan\'s real one', RATE_LIMIT_PER_MIN === 120);
  check('an idle desk is ok', quotaState(0) === 'ok' && quotaState(50) === 'ok');
  /*
    THE WARNING MUST FIRE BEFORE THE WALL, not at it — a "you have hit the
    limit" warning is a report, not a warning. 0.8 asks for a warning
    SURFACE, which only means anything if there is still room to act.
  */
  check('the warning fires with room left', quotaState(Math.ceil(RATE_LIMIT_PER_MIN * QUOTA_WARN_AT)) === 'warning' &&
    Math.ceil(RATE_LIMIT_PER_MIN * QUOTA_WARN_AT) < RATE_LIMIT_PER_MIN);
  check('the limit itself pauses', quotaState(RATE_LIMIT_PER_MIN) === 'paused' && quotaState(999) === 'paused');
  check('a zero limit pauses rather than dividing by it', quotaState(0, 0) === 'paused');

  check('the pause notice reads as the checklist writes it',
    pauseNotice(14) === 'Refresh paused — resumes in 14s', String(pauseNotice(14)));
  check('a fractional second rounds UP, never to a promise it cannot keep',
    pauseNotice(13.2) === 'Refresh paused — resumes in 14s', String(pauseNotice(13.2)));
  check('past the reset it says nothing', pauseNotice(0) === null && pauseNotice(-3) === null);
  check('over a minute it says minutes', pauseNotice(75) === 'Refresh paused — resumes in 2 minutes',
    String(pauseNotice(75)));

  check('progress is clamped at both ends',
    loadProgress(-5, 10) === 0 && loadProgress(15, 10) === 1 && loadProgress(5, 10) === 0.5);
  check('an unknown total is 0, not NaN', loadProgress(3, 0) === 0 && !Number.isNaN(loadProgress(3, 0)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
