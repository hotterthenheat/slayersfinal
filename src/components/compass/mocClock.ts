/*
  The ET market clock the Lotto desk runs on, and the one rule that reads it.

  It lives outside LottoBoard.tsx because a component file that also exports
  values trips react-refresh, and because the rule below is the kind of thing
  that goes wrong quietly: the acceptance gate it feeds used to fire in every
  market state, including two with nothing to trade, and nothing in the suite
  would have noticed it drifting back.
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

/** 9:30-16:00 ET, in minutes past midnight. */
const OPEN_MIN = 9 * 60 + 30;
const CLOSE_MIN = 16 * 60;
/** The closing-auction window: 15:45 to the cross. */
const MOC_MIN = 15 * 60 + 45;

export const computeClock = (ms: number): MocClock => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  const wd = get('weekday');
  let hh = parseInt(get('hour'), 10);
  if (hh === 24) hh = 0;
  const mm = parseInt(get('minute'), 10);
  const ss = parseInt(get('second'), 10);
  const isWeekday = !['Sat', 'Sun'].includes(wd);
  const mins = hh * 60 + mm;
  const marketOpen = isWeekday && mins >= OPEN_MIN && mins < CLOSE_MIN;
  const mocOpen = isWeekday && mins >= MOC_MIN && mins < CLOSE_MIN;
  const secsToClose = CLOSE_MIN * 60 - (mins * 60 + ss);
  const label = marketOpen
    ? mocOpen
      ? 'MOC window open'
      : 'market open'
    : isWeekday
      ? mins < OPEN_MIN
        ? 'pre-market'
        : 'after hours, closed'
      : 'weekend, closed';
  return { marketOpen, mocOpen, toClose: marketOpen ? fmtDur(secsToClose) : '—', secsToClose, label };
};

/**
 * Whether the Lotto board withholds itself until the risk is acknowledged.
 *
 * Only inside the closing-auction window. Measured before this rule existed,
 * with the page clock faked to five states, the gate fired in all five and the
 * board was unreachable in every one — including after the close and on a
 * Saturday, where it asked consent to a total loss on a session that had
 * already settled. A gate that fires unconditionally is a gate people learn to
 * dismiss unread, which is the opposite of what it is for.
 *
 * The risk paragraph itself is not conditional and never has been: it stays
 * pinned above the board in every state. This is only about withholding.
 */
export const lottoGateArmed = (clock: MocClock): boolean => clock.mocOpen;
