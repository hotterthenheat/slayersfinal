import { EARLY_CLOSES, marketClock } from '../../core/calendar';

/*
  The ET market clock the Lotto desk runs on, and the one rule that reads it.

  It lives outside LottoBoard.tsx because a component file that also exports
  values trips react-refresh, and because the rule below is the kind of thing
  that goes wrong quietly: the acceptance gate it feeds used to fire in every
  market state, including two with nothing to trade, and nothing in the suite
  would have noticed it drifting back.

  The calendar decision is core/calendar's, not this module's. It was this
  module's for one commit — a weekday test and a hardcoded 16:00 — and that is a
  parallel primitive with two failure modes the shared calendar already handles:
  on Thanksgiving it called the market open and armed the gate at 15:45 for a
  session that did not exist, and on the half-days it missed the real pre-cross
  window entirely, arming instead almost three hours after the 13:00 bell.
*/

const fmtDur = (secs: number): string => {
  const s = Math.max(0, secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};

export interface MocClock {
  marketOpen: boolean;
  mocOpen: boolean;
  toClose: string;
  secsToClose: number;
  label: string;
}

/** The closing auction runs the last quarter hour, whenever the bell is. */
const MOC_MINUTES = 15;

export const computeClock = (ms: number): MocClock => {
  const clock = marketClock(new Date(ms));
  const [hh, mm, ss] = clock.time.split(':').map(Number);
  const mins = hh * 60 + mm;

  // A half day ends at 13:00. The same lookup core/calendar makes, on the same
  // ET day string it resolved, so the two cannot disagree about which day it is.
  const closeMin = EARLY_CLOSES.has(clock.day) ? 13 * 60 : 16 * 60;
  const marketOpen = clock.phase === 'open';
  const mocOpen = marketOpen && mins >= closeMin - MOC_MINUTES;
  const secsToClose = closeMin * 60 - (mins * 60 + ss);

  const label = marketOpen
    ? mocOpen
      ? 'MOC window open'
      : EARLY_CLOSES.has(clock.day)
        ? 'market open, early close'
        : 'market open'
    : clock.phase === 'weekend'
      ? 'weekend, closed'
      : clock.phase === 'holiday'
        ? 'market holiday'
        : clock.phase === 'pre'
          ? 'pre-market'
          : 'after hours, closed';

  return { marketOpen, mocOpen, toClose: marketOpen ? fmtDur(secsToClose) : '—', secsToClose, label };
};

/**
 * Whether the Lotto board withholds itself until the risk is acknowledged.
 *
 * Only inside the closing-auction window. Measured before this rule existed,
 * with the page clock faked to five market states, the gate fired in all five
 * and the board was unreachable in every one — including after the close and on
 * a Saturday, where it asked consent to a total loss on a session that had
 * already settled. A gate that fires unconditionally is a gate people learn to
 * dismiss unread, which is the opposite of what it is for.
 *
 * The risk paragraph itself is not conditional and never has been: it stays
 * pinned above the board in every state. This is only about withholding.
 */
export const lottoGateArmed = (clock: MocClock): boolean => clock.mocOpen;
