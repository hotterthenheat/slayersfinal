/*
  Acceptance test for 6.6 — a window measured against its own habit.

  THE DEFECT THIS REPLACES, stated so the fix cannot be undone by accident:
  ranking quarter-hour windows by raw volume reports the open and the close
  every single day. Intraday volume is a U, so the first and last windows
  carry several times what noon does; a "busy window" detector built on a
  flat expectation is never wrong and never useful, and a reader stops
  reading it inside a week.

  The assertions below are mostly about that one claim — that the shape is
  really a U, that dividing by it really neutralises the open, and that the
  ratio refuses to answer where it would be meaningless.
*/
import {
  WINDOW_BASELINE, RTH_WINDOW_START, RTH_WINDOW_COUNT, RTH_WINDOW_END,
  isRthWindow, baselineShare, relativeVolume, describeRelative, paceOf,
  PACE_WORDS, BURST_RATIO,
} from '../src/data/windowBaseline';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

// ── the grid ─────────────────────────────────────────────────────────────
{
  check('26 windows — 09:30 to 16:00 in quarter-hours', WINDOW_BASELINE.length === RTH_WINDOW_COUNT && RTH_WINDOW_COUNT === 26);
  check('the first window is 09:30', RTH_WINDOW_START * 15 === 9 * 60 + 30, `${RTH_WINDOW_START * 15} minutes`);
  check('the last window ends at 16:00', RTH_WINDOW_END * 15 === 16 * 60, `${RTH_WINDOW_END * 15} minutes`);

  /*
    NORMALISED, NOT TRUSTED TO SUM. The shape is hand-typed percentages, and
    hand-typed percentages that "should" total 100 are exactly how a ratio
    silently gains three percent. Since every reading in the UI is a ratio
    against these, the sum has to be 1 to the bit the arithmetic allows.
  */
  const total = WINDOW_BASELINE.reduce((a, b) => a + b, 0);
  check('the shares sum to 1', Math.abs(total - 1) < 1e-12, `off by ${total - 1}`);
  check('every share is positive', WINDOW_BASELINE.every(v => v > 0));
}

// ── the shape really is a U ──────────────────────────────────────────────
{
  const open = WINDOW_BASELINE[0];
  const close = WINDOW_BASELINE[WINDOW_BASELINE.length - 1];
  const flat = 1 / RTH_WINDOW_COUNT;
  const trough = Math.min(...WINDOW_BASELINE);
  const troughAt = WINDOW_BASELINE.indexOf(trough);

  check('the open carries far more than a flat expectation', open > flat * 2.5,
    `${(open / flat).toFixed(1)}x flat`);
  check('the close carries more than flat too', close > flat * 2,
    `${(close / flat).toFixed(1)}x flat`);
  check('the trough sits around midday, not at an end',
    troughAt > 6 && troughAt < RTH_WINDOW_COUNT - 6,
    `trough at window ${troughAt} (${String(Math.floor(((RTH_WINDOW_START + troughAt) * 15) / 60)).padStart(2, '0')}:${String(((RTH_WINDOW_START + troughAt) * 15) % 60).padStart(2, '0')})`);
  check('the open is the single heaviest window', WINDOW_BASELINE.indexOf(Math.max(...WINDOW_BASELINE)) === 0);

  // Monotone down from the bell to the trough, monotone up from trough to close.
  let downOk = true, upOk = true;
  for (let i = 1; i <= troughAt; i++) if (WINDOW_BASELINE[i] > WINDOW_BASELINE[i - 1]) downOk = false;
  for (let i = troughAt + 1; i < WINDOW_BASELINE.length; i++) if (WINDOW_BASELINE[i] < WINDOW_BASELINE[i - 1]) upOk = false;
  check('volume falls monotonically from the bell to the trough', downOk);
  check('and rises monotonically from the trough into the close', upOk);
}

// ── THE POINT: dividing by the shape neutralises the open ────────────────
{
  /*
    A perfectly ordinary session — every window carrying exactly its usual
    share. Under a flat expectation the open would read 3.8x and the close
    3.2x, and both would be flagged. Under this one, nothing is flagged,
    which is the correct answer for an ordinary day.
  */
  const flat = 1 / RTH_WINDOW_COUNT;
  let flaggedFlat = 0, flaggedReal = 0;
  for (let i = 0; i < RTH_WINDOW_COUNT; i++) {
    const share = WINDOW_BASELINE[i];              // an utterly typical day
    if (share / flat >= BURST_RATIO) flaggedFlat++;
    const r = relativeVolume(share, RTH_WINDOW_START + i);
    if (r !== null && r >= BURST_RATIO) flaggedReal++;
  }
  check('a flat expectation flags the ends of an ORDINARY day', flaggedFlat > 0,
    `${flaggedFlat} window(s) wrongly flagged`);
  check('the real baseline flags nothing on that same day', flaggedReal === 0,
    `${flaggedReal} flagged`);

  // And it still catches a genuine burst at a quiet hour.
  const noon = RTH_WINDOW_START + 12;
  const burstShare = (baselineShare(noon) as number) * 3;
  check('a 3x burst at 13:30 is still caught', paceOf(relativeVolume(burstShare, noon)) === 'burst');
  // ...while three times the OPEN's share is caught too — the fix is not a mute.
  check('a 3x burst at the bell is caught as well',
    paceOf(relativeVolume((baselineShare(RTH_WINDOW_START) as number) * 3, RTH_WINDOW_START)) === 'burst');
}

// ── the ratio refuses where it would be meaningless ─────────────────────
{
  check('there is no baseline outside the cash session',
    baselineShare(0) === null && baselineShare(RTH_WINDOW_START - 1) === null &&
    baselineShare(RTH_WINDOW_END) === null && baselineShare(95) === null);
  check('the session boundaries are inside, not outside',
    isRthWindow(RTH_WINDOW_START) && isRthWindow(RTH_WINDOW_END - 1) &&
    !isRthWindow(RTH_WINDOW_START - 1) && !isRthWindow(RTH_WINDOW_END));
  check('a non-integer window is not in the session', !isRthWindow(38.5) && !isRthWindow(NaN));
  check('no ratio outside the session', relativeVolume(0.1, 3) === null);
  check('no ratio for a negative or non-finite share',
    relativeVolume(-1, RTH_WINDOW_START) === null && relativeVolume(NaN, RTH_WINDOW_START) === null);
  check('a zero share is a real answer, not a refusal', relativeVolume(0, RTH_WINDOW_START) === 0);
  check('null in, null out, all the way to the words',
    describeRelative(null) === null && paceOf(null) === null);
}

// ── the words ────────────────────────────────────────────────────────────
{
  check('a multiple is spoken as a multiple', describeRelative(3.14) === '3.1× its usual', String(describeRelative(3.14)));
  /*
    A FRACTION IS SPOKEN AS A FRACTION. "0.5x its usual" makes the reader
    invert in their head at exactly the moment they are scanning a row.
  */
  check('half is spoken as half', describeRelative(0.5) === 'half its usual', String(describeRelative(0.5)));
  check('a third is spoken as a third', describeRelative(1 / 3) === 'a third of its usual', String(describeRelative(1 / 3)));
  check('an odd fraction gets a percentage', describeRelative(0.4) === '40% of its usual', String(describeRelative(0.4)));
  check('near 1 is "about usual", not 1.0x', describeRelative(1) === 'about usual' && describeRelative(1.05) === 'about usual');

  const paces = ['quiet', 'usual', 'busy', 'burst'] as const;
  check('every pace has a word', paces.every(p => typeof PACE_WORDS[p] === 'string' && PACE_WORDS[p].length > 0));
  check('no two paces share a word', new Set(paces.map(p => PACE_WORDS[p])).size === paces.length);
  check('the ladder is ordered and covers the line',
    paceOf(0.2) === 'quiet' && paceOf(1) === 'usual' && paceOf(1.5) === 'busy' && paceOf(5) === 'burst');
  check('the burst threshold is a real event, not noise wearing a badge', BURST_RATIO >= 2);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
