/*
==================================================
  SLAYER TERMINAL - THE DISPLAY CLOCK IS EASTERN

  Every time on this terminal is a US market time.
  `toLocaleTimeString` with no zone renders in the
  VIEWER's, so the same recorded bar read 15:59 in
  New York, 20:59 in London and 04:59 the next
  morning in Tokyo — and the "last scan" stamp
  beside it disagreed with the chart axis it was
  describing. Sixteen call sites, sixteen clocks.

  Related but separate from core/clock.ts: that one
  decides what time the ENGINE thinks it is, and
  exists so a replay does not score against the wall
  clock. This one only decides how a moment is
  PRINTED. Nothing here feeds scoring.

  Locale is pinned too. `toLocaleDateString(undefined,
  ...)` took the viewer's locale, so a date rendered
  as "Aug 24" or "24 août" depending on the browser.
==================================================
*/

const ZONE = 'America/New_York';

const HMS = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const HM = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const DAY_MONTH = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  day: '2-digit',
  month: 'short',
});

const MONTH_DAY = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONE,
  month: 'short',
  day: 'numeric',
});

const MONTH_YEAR = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONE,
  month: 'short',
  year: '2-digit',
});

/** "15:59:04" Eastern. Takes a Date or UNIX seconds. */
export const etClock = (at: Date | number = new Date()): string =>
  HMS.format(typeof at === 'number' ? at * 1000 : at);

/** "15:59" Eastern. Takes a Date or UNIX seconds. */
export const etHm = (at: Date | number): string =>
  HM.format(typeof at === 'number' ? at * 1000 : at);

/** "24 Aug" Eastern. */
export const etDayMonth = (at: Date | number): string =>
  DAY_MONTH.format(typeof at === 'number' ? at * 1000 : at);

/** "Aug 24" Eastern — US order, for surfaces that read that way. */
export const etMonthDay = (at: Date | number): string =>
  MONTH_DAY.format(typeof at === 'number' ? at * 1000 : at);

/** "Aug 26" style month + 2-digit year, Eastern. */
export const etMonthYear = (at: Date | number): string =>
  MONTH_YEAR.format(typeof at === 'number' ? at * 1000 : at);
