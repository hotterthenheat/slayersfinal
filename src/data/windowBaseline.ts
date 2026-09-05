/*
==================================================
  SLAYER TERMINAL - WHAT A WINDOW USUALLY CARRIES
  (data/windowBaseline.ts)
==================================================

  Section 6.6: "Compare each window against its own historical share — a
  flat expectation flags the open and close every day."

  THAT IS THE WHOLE BUG, and it is worth stating precisely because it is the
  kind that survives review. Intraday volume is a U: the first quarter-hour
  of the cash session carries an order of magnitude more than one at lunch,
  and the last carries nearly as much. A "busy window" detector that ranks
  windows by raw volume therefore reports the open and the close, every
  single day, with total confidence — and it is never wrong and never
  useful. The reader learns to ignore it inside a week.

  A window is interesting when it carries more than IT usually does. That
  needs a per-window expectation, which is what this file is.

  WHERE THE SHAPE COMES FROM, and what it is not. The curve below is the
  well-documented U of US cash-equity intraday volume — heavy open, a long
  midday trough with its floor just after 13:00 ET, and a close that lifts
  hard through the last half hour into the auction. It is a STANDING SHAPE,
  not a measurement of this desk's own history: nothing here has 30 sessions
  of per-window volume to average, and inventing one from the simulator
  would be measuring the simulator. So the numbers are a stated prior, the
  provenance is `model`, and the surface says so. When a real history lands,
  `baselineShare` is the one function that has to change.

  THE SHARES ARE NORMALISED AT LOAD rather than trusted to sum. Hand-typed
  percentages that "should" total 100 are how a ratio silently gains 3% — and
  the whole point of this file is a ratio.
*/

/** 09:30 ET as a quarter-hour index from midnight: the cash open. */
export const RTH_WINDOW_START = 38;
/** 09:30–16:00 is 6.5 hours — 26 quarter-hour windows. */
export const RTH_WINDOW_COUNT = 26;
export const RTH_WINDOW_END = RTH_WINDOW_START + RTH_WINDOW_COUNT; // exclusive

/* The raw shape, in percent of a session's volume per quarter-hour, opening
   window first. Read down the column and the U is visible: 11.5 at the bell,
   a floor of 2.2 either side of 13:00, and 9.7 in the last fifteen minutes. */
const RAW_SHAPE = [
  11.5, 7.0, 5.4, 4.6,   // 09:30 – 10:30
  4.0, 3.6, 3.2, 3.0,    // 10:30 – 11:30
  2.8, 2.6, 2.4, 2.3,    // 11:30 – 12:30
  2.2, 2.2, 2.2, 2.3,    // 12:30 – 13:30
  2.4, 2.5, 2.7, 2.9,    // 13:30 – 14:30
  3.2, 3.6, 4.2, 5.0,    // 14:30 – 15:30
  6.5, 9.7,              // 15:30 – 16:00
] as const;

/** Each RTH window's expected share of the session, as a fraction summing
    to exactly 1. Index 0 is 09:30–09:45. */
export const WINDOW_BASELINE: readonly number[] = (() => {
  const total = RAW_SHAPE.reduce((a, b) => a + b, 0);
  return RAW_SHAPE.map(v => v / total);
})();

/** True when a quarter-hour index falls inside the cash session. */
export function isRthWindow(idx: number): boolean {
  return Number.isInteger(idx) && idx >= RTH_WINDOW_START && idx < RTH_WINDOW_END;
}

/**
 * What share of a session's volume this window normally carries.
 * Null outside the cash session — there is no baseline for 03:00 because
 * there is no cash session at 03:00, and returning a small number instead
 * of nothing would invite a ratio that means nothing.
 */
export function baselineShare(idx: number): number | null {
  if (!isRthWindow(idx)) return null;
  return WINDOW_BASELINE[idx - RTH_WINDOW_START];
}

/**
 * How this window is running against itself: 1 is exactly usual, 3 is three
 * times usual, 0.5 is half.
 *
 * `share` is this window's share of the session's volume so far, as a
 * fraction. Null when there is no baseline to compare against, or when the
 * session has no volume yet — a ratio against zero is not a big number, it
 * is not a number.
 */
export function relativeVolume(share: number, idx: number): number | null {
  const base = baselineShare(idx);
  if (base === null || !(base > 0)) return null;
  if (!Number.isFinite(share) || share < 0) return null;
  return share / base;
}

/** The threshold above which a window has genuinely broken from its own
    habit. Twice usual is a real event; 1.2× is noise wearing a badge. */
export const BURST_RATIO = 2;

export type WindowPace = 'quiet' | 'usual' | 'busy' | 'burst';

export function paceOf(ratio: number | null): WindowPace | null {
  if (ratio === null) return null;
  if (ratio >= BURST_RATIO) return 'burst';
  if (ratio >= 1.35) return 'busy';
  if (ratio <= 0.65) return 'quiet';
  return 'usual';
}

export const PACE_WORDS: Record<WindowPace, string> = {
  quiet: 'quiet for the hour',
  usual: 'about usual',
  busy: 'busier than usual',
  burst: 'a burst',
};

/**
 * The ratio in words: "3.1x its usual", "about usual", "half its usual".
 *
 * Multiples are spoken as multiples and fractions as fractions, because
 * "0.4x its usual" is a number a reader has to invert in their head at
 * exactly the moment they are scanning a row.
 */
export function describeRelative(ratio: number | null): string | null {
  if (ratio === null) return null;
  if (ratio >= 1.15) return `${ratio.toFixed(1)}× its usual`;
  if (ratio <= 0.87) {
    const inv = 1 / ratio;
    if (inv >= 1.8 && inv <= 2.2) return 'half its usual';
    if (inv >= 2.7 && inv <= 3.3) return 'a third of its usual';
    return `${(ratio * 100).toFixed(0)}% of its usual`;
  }
  return 'about usual';
}
