/*
==================================================
  SLAYER TERMINAL - EXPIRY CALENDAR (expiryCalendar.ts)  [P3.2]
  The per-root expiry list. The real feed returns the actual expiries a symbol
  lists; the simulator has to honour the same listing conventions or every panel
  keyed on expiry (the strike x expiry matrix, the roll-off calendar) claims
  expiries that do not exist.

  Three conventions:
    - index and large ETFs list DAILIES (SPX/SPY have an expiry every session)
    - liquid single names list WEEKLIES (a Friday every week)
    - everything else lists MONTHLIES (the third Friday)

  Everything resolves through core/calendar.ts (holiday-aware) and t comes from
  core/optionTime.ts — no third clock is introduced. `t` replaces the hardcoded
  per-row time and decay the matrix used to carry.
==================================================
*/

import { today, isTradingDay, sessionsBetween } from './calendar';
import { yearsToExpiry } from './optionTime';

export type ListingConvention = 'daily' | 'weekly' | 'monthly';

/** Index roots and the large ETFs that list a contract every session. */
const DAILY_ROOTS = new Set(['SPX', 'NDX', 'RUT', 'VIX', 'XSP', 'DJX', 'SPY', 'QQQ', 'IWM', 'DIA']);

/**
 * Liquid single names (and sector/leveraged ETFs) that list weeklies. Not
 * exhaustive — the real feed will replace this with the actual per-root list —
 * but enough that a weekly name and a monthly name render visibly different
 * expiry sets. Everything not named here falls through to monthlies.
 */
const WEEKLY_ROOTS = new Set([
  'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'GOOG', 'AMD', 'NFLX',
  'AVGO', 'MU', 'INTC', 'MRVL', 'SMCI', 'CRM', 'ORCL', 'PLTR', 'COIN', 'MSTR',
  'BABA', 'UBER', 'DIS', 'BA', 'JPM', 'BAC', 'GS', 'V', 'MA', 'WMT', 'COST',
  'HD', 'PANW', 'SNOW', 'SMH', 'XLF', 'XLE', 'GLD', 'TLT', 'TQQQ', 'SOXL',
]);

export function listingConvention(ticker: string): ListingConvention {
  const t = ticker.toUpperCase();
  if (DAILY_ROOTS.has(t)) return 'daily';
  if (WEEKLY_ROOTS.has(t)) return 'weekly';
  return 'monthly';
}

export interface ChainExpiry {
  /** The real expiry — always a trading day. */
  date: Date;
  /** CALENDAR days to expiry. What a trader means by "7 DTE". */
  dte: number;
  /** TRADING sessions to expiry. */
  sessions: number;
  /** Year fraction, floored at half a session (core/optionTime.ts). */
  t: number;
}

const DAY_MS = 86_400_000;

function toChainExpiry(date: Date, base: Date): ChainExpiry {
  const dte = Math.max(0, Math.round((date.getTime() - base.getTime()) / DAY_MS));
  return { date, dte, sessions: sessionsBetween(base, date), t: yearsToExpiry(dte) };
}

/** Roll a date back to the nearest prior trading day (holidays roll a weekly to Thursday). */
function toSession(d: Date): Date {
  const out = new Date(d);
  for (let i = 0; i < 6 && !isTradingDay(out); i++) out.setDate(out.getDate() - 1);
  return out;
}

/** The next `count` trading sessions on or after `base`. */
function dailySessions(base: Date, count: number): Date[] {
  const out: Date[] = [];
  const d = new Date(base);
  for (let guard = 0; out.length < count && guard < count * 3 + 10; guard++) {
    if (isTradingDay(d)) out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** The next `count` weekly (Friday) expiries on or after `base`. */
function weeklyExpiries(base: Date, count: number): Date[] {
  const out: Date[] = [];
  const d = new Date(base);
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1); // advance to the coming Friday
  for (let guard = 0; out.length < count && guard < count + 10; guard++) {
    const f = toSession(d);
    if (f.getTime() >= base.getTime()) out.push(f);
    d.setDate(d.getDate() + 7);
  }
  return out;
}

/** The next `count` monthly (third-Friday) expiries on or after `base`. */
function monthlyExpiries(base: Date, count: number): Date[] {
  const out: Date[] = [];
  let y = base.getFullYear();
  let m = base.getMonth();
  for (let guard = 0; out.length < count && guard < count + 14; guard++) {
    const first = new Date(y, m, 1);
    const firstFriday = 1 + ((5 - first.getDay() + 7) % 7);
    const f = toSession(new Date(y, m, firstFriday + 14)); // third Friday
    if (f.getTime() >= base.getTime()) out.push(f);
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

/**
 * The expiries a root actually lists, nearest first, capped at `columns`.
 * Dailies fill the first week from trading sessions, then extend with weeklies;
 * weeklies and monthlies use their own cadence.
 */
export function expiryCalendar(ticker: string, columns = 6): ChainExpiry[] {
  const base = today();
  const conv = listingConvention(ticker);

  let dates: Date[];
  if (conv === 'daily') {
    const near = dailySessions(base, Math.min(columns, 5));
    const last = near[near.length - 1];
    const extend = weeklyExpiries(base, columns).filter(f => f.getTime() > last.getTime());
    dates = [...near, ...extend].slice(0, columns);
  } else if (conv === 'weekly') {
    dates = weeklyExpiries(base, columns).slice(0, columns);
  } else {
    dates = monthlyExpiries(base, columns).slice(0, columns);
  }

  // Strictly increasing — two horizons must never share a column.
  const uniq: Date[] = [];
  for (const d of dates) {
    if (!uniq.length || d.getTime() > uniq[uniq.length - 1].getTime()) uniq.push(d);
  }
  return uniq.map(d => toChainExpiry(d, base));
}
