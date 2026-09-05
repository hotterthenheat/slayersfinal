import { MARKET_HOLIDAYS, isoDate } from './calendar';

/*
==================================================
  SLAYER TERMINAL - THE STREAM'S OWN STATE
  (core/stream.ts)
==================================================

  Section 0.7 asks the desk to say what the CONNECTION is doing, and 0.8
  what the RATE LIMIT is doing. Both are about the same failure: a panel
  that has stopped updating looks exactly like a panel where nothing is
  happening, and the reader cannot tell which without being told.

  WHAT IS REACHABLE TODAY AND WHAT IS NOT, stated plainly, because building
  an indicator for a state that can never occur is how a desk starts lying:

    · `live` and `closed` are REAL right now. They come off the calendar,
      not off a transport, and the chip in the TopBar renders them for real.
    · `reconnecting`, `degraded` and `disconnected` cannot occur yet — the
      simulator does not disconnect. They are defined, worded, toned and
      proven here so that the transport, when it lands, has one place to
      report into and nothing has to be invented under deadline. Nothing
      fakes them into view.

  THE SUNDAY RULE IS THE POINT OF THE WHOLE FILE. `never show "no data" for
  a Sunday` — a market that is closed is not a feed that is broken, and the
  two share a rendering everywhere they are not distinguished. `marketPhase`
  exists so a panel can ask "is there supposed to be a print right now?"
  before it reaches for DataState's `empty`.

  THE CASH CALENDAR, NOT THE FUTURES ONE. core/calendar's `futuresPhaseAt`
  answers where an instant sits in the Globex week, which is the right
  question for the futures clock and the wrong one for an options panel:
  Globex is open at 03:00 and the options tape is not. This is the equity
  session — pre-market from 04:00, RTH 09:30–16:00, after-hours to 20:00 —
  and it is deliberately a SEPARATE function rather than a reinterpretation
  of the futures phase, because the two calendars really do differ (a
  holiday shortens Globex and closes the cash tape outright).
*/

/** What the desk's data connection is doing. */
export type StreamState = 'live' | 'reconnecting' | 'degraded' | 'disconnected' | 'closed';

export const STREAM_WORDS: Record<StreamState, { label: string; blurb: string }> = {
  live: { label: 'LIVE', blurb: 'Connected — prints are arriving as they happen' },
  reconnecting: { label: 'RECONNECTING', blurb: 'The connection dropped and is being re-established; the desk is showing its last good frame' },
  degraded: { label: 'DEGRADED', blurb: 'Connected, but arriving late or incomplete — treat timestamps as the truth, not the ordering' },
  disconnected: { label: 'OFFLINE', blurb: 'No connection. Nothing on screen is updating; every number is as of the stamp it carries' },
  closed: { label: 'CLOSED', blurb: 'The market is closed. Nothing is missing — there is nothing to print' },
};

/** Only one of these means the numbers on screen are current. */
export function isStreamCurrent(s: StreamState): boolean {
  return s === 'live';
}

/** A stream that is not current but is not BROKEN either. The distinction
    decides whether a panel shows a warning or simply a quieter stamp. */
export function isStreamFault(s: StreamState): boolean {
  return s === 'reconnecting' || s === 'degraded' || s === 'disconnected';
}

/* ── the cash session ──────────────────────────────────────────────────── */

export type MarketPhase = 'premarket' | 'rth' | 'afterhours' | 'closed' | 'holiday' | 'weekend';

export const MARKET_PHASE_WORDS: Record<MarketPhase, { label: string; blurb: string }> = {
  premarket: { label: 'PRE-MARKET', blurb: '04:00–09:30 ET — thin, wide, and not where the day is decided' },
  rth: { label: 'OPEN', blurb: '09:30–16:00 ET — the regular session' },
  afterhours: { label: 'AFTER HOURS', blurb: '16:00–20:00 ET — the tape keeps running past the close' },
  closed: { label: 'CLOSED', blurb: 'Between 20:00 and 04:00 ET — the tape is dark, not broken' },
  holiday: { label: 'HOLIDAY', blurb: 'A market holiday. There is no tape today' },
  weekend: { label: 'WEEKEND', blurb: 'Saturday or Sunday. There is no tape until Monday' },
};

const ET = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function etParts(at: Date): { weekday: string; mins: number; hh: string; mm: string; ss: string } {
  const p = Object.fromEntries(ET.formatToParts(at).map(x => [x.type, x.value]));
  const hour = Number(p.hour) % 24;   // Intl gives 24 for midnight, not 0
  return {
    weekday: String(p.weekday ?? ''),
    mins: hour * 60 + Number(p.minute),
    hh: String(hour).padStart(2, '0'),
    mm: String(p.minute),
    ss: String(p.second),
  };
}

/** Where a wall-clock instant sits in the EQUITY session. */
export function marketPhase(at: Date = new Date()): MarketPhase {
  const { weekday, mins } = etParts(at);
  if (weekday === 'Sat' || weekday === 'Sun') return 'weekend';
  /* The holiday table is keyed by ET calendar date, so the instant has to be
     read in ET before it is asked about — a 21:00 PT instant on the 3rd is
     the 4th in New York, and asking with the local date reads the wrong
     row for exactly the six hours it matters most. */
  const etDate = new Date(at.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  if (MARKET_HOLIDAYS.has(isoDate(etDate))) return 'holiday';
  if (mins < 4 * 60) return 'closed';
  if (mins < 9 * 60 + 30) return 'premarket';
  if (mins < 16 * 60) return 'rth';
  if (mins < 20 * 60) return 'afterhours';
  return 'closed';
}

/** True when a print is SUPPOSED to be arriving. A panel that is empty
    while this is false is not a panel with a problem. */
export function marketIsOpen(at: Date = new Date()): boolean {
  return marketPhase(at) === 'rth';
}

/**
 * The state to show, given what the transport reports.
 *
 * `feed` is what the connection layer knows about itself and nothing more —
 * today no transport reports anything, so callers pass nothing and get the
 * calendar's answer. The closed market OUTRANKS a healthy feed (a live
 * socket at 02:00 is still not printing anything) but never outranks a
 * fault: a socket that has dropped is worth saying so on a Sunday too,
 * because it will still be dropped on Monday.
 */
export function streamStateAt(at: Date = new Date(), feed?: StreamState): StreamState {
  if (feed && isStreamFault(feed)) return feed;
  return marketIsOpen(at) ? 'live' : 'closed';
}

/* ── gaps ──────────────────────────────────────────────────────────────── */

/**
 * A hole in the tape, in words. Returns null below the floor, because a
 * sub-second gap is a network hiccup and a banner for it is noise.
 *
 * The floor is 2s rather than 1s deliberately: at one second every ordinary
 * scheduling stutter would raise a banner, and a banner that cries wolf is
 * worse than no banner — the reader learns to dismiss it and then misses
 * the twelve-second hole that mattered.
 */
export const GAP_FLOOR_SECONDS = 2;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function describeGap(seconds: number): string | null {
  if (!(seconds >= GAP_FLOOR_SECONDS)) return null;
  /* THE UNITS HOLD PRECISION WHERE IT MATTERS. A tape gap is read against a
     chart, and "75s" is a different fact from "a minute" when the reader is
     deciding whether a candle is trustworthy — so seconds run to 90 rather
     than to 60, and minutes to 90 rather than to 60.

     Which means the SINGULAR never fires at these thresholds: the minute
     branch starts at a value that rounds to 2, and so does the hour branch.
     The first draft wrote `${m} minute${m === 1 ? '' : 's'}` inline and the
     proof caught that the singular arm was unreachable. Rather than keep a
     branch nothing can take, or move a threshold to make it reachable and
     lose the precision, the pluralisation is done once by a helper that is
     correct for any n — so a future threshold change cannot reintroduce
     "1 minutes". */
  if (seconds < 90) return `${Math.round(seconds)}s of prints missing`;
  if (seconds < 90 * 60) return `${plural(Math.round(seconds / 60), 'minute')} of prints missing`;
  return `${plural(Math.round(seconds / 3600), 'hour')} of prints missing`;
}

/** "resuming from 14:32:07" — the ET wall time a recovered stream picks up
    at, so a reader can line the resume up against their own chart. */
export function resumePoint(at: Date): string {
  const { hh, mm, ss } = etParts(at);
  return `${hh}:${mm}:${ss}`;
}

/* ── 0.8 · quota ───────────────────────────────────────────────────────── */

/*
  THE LIMIT IS A REAL NUMBER FROM A REAL PLAN: Unusual Whales allows 120
  requests a minute. Nothing on this desk counts requests yet — the
  simulator makes none — so `quotaState` is a pure function of a count a
  caller supplies, and the countdown is a pure function of a reset time.
  That is the whole of what can be honestly built before there is a client
  to meter, and it is the part that is fiddly enough to be worth having
  written down and proven rather than improvised at the call site.
*/
export const RATE_LIMIT_PER_MIN = 120;

/** Below this share of the budget nothing is said; above it, a warning;
    at or past the limit, refresh is paused. 0.8 asks for a warning
    SURFACE, which means it has to fire before the wall, not at it. */
export const QUOTA_WARN_AT = 0.8;

export type QuotaState = 'ok' | 'warning' | 'paused';

export function quotaState(used: number, limit = RATE_LIMIT_PER_MIN): QuotaState {
  if (limit <= 0) return 'paused';
  if (used >= limit) return 'paused';
  return used / limit >= QUOTA_WARN_AT ? 'warning' : 'ok';
}

/** "Refresh paused — resumes in 14s". Null when there is nothing to say. */
export function pauseNotice(secondsUntilReset: number): string | null {
  if (!(secondsUntilReset > 0)) return null;
  const s = Math.ceil(secondsUntilReset);
  if (s < 60) return `Refresh paused — resumes in ${s}s`;
  return `Refresh paused — resumes in ${plural(Math.ceil(s / 60), 'minute')}`;
}

/** Backfill and bulk loads report as a fraction with a floor of 0 and a
    ceiling of 1 — a progress bar that can render 1.04 is a progress bar
    that has already lied once. */
export function loadProgress(done: number, total: number): number {
  if (!(total > 0)) return 0;
  return Math.max(0, Math.min(1, done / total));
}
