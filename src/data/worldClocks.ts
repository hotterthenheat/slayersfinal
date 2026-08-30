/*
==================================================
  SLAYER TERMINAL - WORLD CLOCKS (data/worldClocks.ts)
==================================================

  The trading day around the planet: what time it is in each major centre,
  and whether that centre's cash session is OPEN right now.

  WHY THIS SITS BESIDE A GLOBE. Noah, 2026-08-30: "shows the times of the
  world". A globe already draws the terminator — the line between the lit
  and dark halves — which is the same fact these clocks carry in numbers.
  Daylight is not the point though; the SESSION is. Frankfurt and London
  are both in daylight for most of a New York morning and only one of them
  is still trading by lunch, so a lit city is not an open one and the strip
  says which, in words, rather than leaving a reader to infer it from
  shading.

  TIME ZONES COME FROM THE PLATFORM, NOT FROM A TABLE OF OFFSETS. A
  hardcoded "New York is UTC−5" is wrong for eight months of the year and
  wrong in a different way for the week the US and Europe disagree about
  when to change. `Intl.DateTimeFormat` with an IANA zone knows all of it,
  including the transitions, and it is in every browser this desk supports.

  SESSION HOURS ARE THE CASH SESSION, local. They are approximate by
  design — this strip answers "is Tokyo awake", not "may I route an order"
  — and holidays are NOT modelled, which is written here so nobody later
  reads an open chip as a trading calendar.
*/

export interface WorldClock {
  /** Short label for the strip. */
  city: string;
  /** IANA zone — the platform resolves the offset, including DST. */
  zone: string;
  /** Cash-session open and close in LOCAL minutes from midnight. */
  openMin: number;
  closeMin: number;
  /** Where it sits, so a caller can fly the globe there. */
  lat: number;
  lng: number;
}

const HM = (h: number, m = 0) => h * 60 + m;

export const WORLD_CLOCKS: WorldClock[] = [
  { city: 'New York', zone: 'America/New_York', openMin: HM(9, 30), closeMin: HM(16), lat: 40.71, lng: -74.01 },
  { city: 'London', zone: 'Europe/London', openMin: HM(8), closeMin: HM(16, 30), lat: 51.51, lng: -0.13 },
  { city: 'Frankfurt', zone: 'Europe/Berlin', openMin: HM(9), closeMin: HM(17, 30), lat: 50.11, lng: 8.68 },
  { city: 'Tokyo', zone: 'Asia/Tokyo', openMin: HM(9), closeMin: HM(15), lat: 35.68, lng: 139.69 },
  { city: 'Hong Kong', zone: 'Asia/Hong_Kong', openMin: HM(9, 30), closeMin: HM(16), lat: 22.32, lng: 114.17 },
  { city: 'Sydney', zone: 'Australia/Sydney', openMin: HM(10), closeMin: HM(16), lat: -33.87, lng: 151.21 },
];

export interface ClockRead {
  city: string;
  lat: number;
  lng: number;
  /** Local wall time, 24h, e.g. "14:07". */
  time: string;
  /** Local weekday index, 0 = Sunday — the weekend test. */
  weekday: number;
  open: boolean;
  /** Minutes until the next open or close, for the "opens in" line. */
  minutesToEdge: number;
}

/**
 * Read one centre's local clock and session state.
 *
 * `at` is injectable so this can be proven at a chosen instant rather than
 * only at whatever second the test happens to run.
 */
export function readClock(c: WorldClock, at: Date = new Date()): ClockRead {
  /* One formatter call gives hour, minute AND weekday in the target zone —
     asking for them separately can straddle a minute boundary and report a
     time from one instant with a weekday from the next. */
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: c.zone,
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(at);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  /* 'en-US' with hour12:false renders midnight as 24 in some engines. */
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekday = Math.max(0, WD.indexOf(get('weekday')));
  const now = hour * 60 + minute;

  const weekend = weekday === 0 || weekday === 6;
  const open = !weekend && now >= c.openMin && now < c.closeMin;
  const minutesToEdge = open ? c.closeMin - now : now < c.openMin ? c.openMin - now : 24 * 60 - now + c.openMin;

  return {
    city: c.city,
    lat: c.lat,
    lng: c.lng,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    weekday,
    open,
    minutesToEdge,
  };
}

/** Every centre, in the order the trading day actually reaches them. */
export function readAllClocks(at: Date = new Date()): ClockRead[] {
  return WORLD_CLOCKS.map(c => readClock(c, at));
}

/** "2h 15m" / "45m" — the countdown beside a closed centre. */
export function fmtGap(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}
