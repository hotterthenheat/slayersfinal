import { h01, hPick, hRange } from '../core/rng';
import type { FlowPrint, StratTag } from '../types/trace';

/*
==================================================
  SLAYER TERMINAL - A PAST SESSION'S TAPE
  (data/sessionTape.ts)
==================================================

  Session Replay needs a whole day of prints for a date that is already over.
  The live tape only accumulates from the moment the app opened, so there is
  nothing to replay until a feed backfills the bell — and until then this
  stands in, on the same seeded-hash technique every other simulated surface
  in the product uses.

  DETERMINISTIC BY (TICKER, DATE) is the property that matters, and it is the
  one the proof pins. A replay that reshuffled itself every render would be
  useless for the thing a reader does with it — scrub back and forth over the
  same afternoon and compare. Same date in, same tape out, forever.

  ORDERED NEWEST FIRST, because that is what the live tape hands its readers
  and what `aggregateByContract` reads its "latest reading" from. A generator
  that returned oldest-first would silently invert every contract's volume,
  OI and IV.

  THE SHAPE IS THE REAL ONE. Every field a live print carries is populated
  here, so the Scanner reads one type whether it is looking at today's live
  accumulation or a replayed afternoon — and a feed later replaces this
  function, not the screen.
*/

/** Prints in a generated session. Enough to fill a scanner, not a stress test. */
const PRINTS_PER_SESSION = 260;
const RTH_MINUTES = 390;

const clock = (min: number): string => {
  const h = 9 + Math.floor((min + 30) / 60);
  const m = (min + 30) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
};

/**
 * A full session of prints for one ticker on one date.
 *
 * @param dateIso YYYY-MM-DD — the seed, so the same day always replays the same
 * @param spot    the underlying's level that session; strikes hang off it
 */
export function buildSessionTape(ticker: string, dateIso: string, spot: number): FlowPrint[] {
  const step = spot >= 300 ? 5 : spot >= 100 ? 2.5 : 1;
  const atm = Math.round(spot / step) * step;
  const out: FlowPrint[] = [];

  for (let i = 0; i < PRINTS_PER_SESSION; i++) {
    const s = `${ticker}|${dateIso}|${i}`;
    /* Prints cluster toward the open and the close, the way a real session
       does — squaring a uniform draw and mirroring it puts weight at both
       ends without inventing a distribution nobody can read. */
    const u = h01(`${s}|t`);
    const shaped = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
    const minute = Math.min(RTH_MINUTES - 1, Math.floor(shaped * RTH_MINUTES));

    const right: 'C' | 'P' = h01(`${s}|r`) > 0.46 ? 'C' : 'P';
    const strikeOff = Math.round(hRange(`${s}|k`, -6, 6)) * step;
    const strike = Math.max(step, atm + strikeOff);
    const dte = hPick(`${s}|d`, [0, 0, 0, 1, 2, 3, 7, 14, 30]);
    const size = Math.max(1, Math.round(hRange(`${s}|z`, 1, 900) ** 1.15));
    const fill = Math.max(0.01, Number(hRange(`${s}|f`, 0.15, 14).toFixed(2)));
    const spreadW = Math.max(0.01, fill * hRange(`${s}|w`, 0.02, 0.12));
    const bid = Math.max(0.01, Number((fill - spreadW / 2).toFixed(2)));
    const ask = Number((fill + spreadW / 2).toFixed(2));
    const fillPos = h01(`${s}|p`);
    const side: FlowPrint['side'] = fillPos > 0.62 ? 'ASK' : fillPos < 0.38 ? 'BID' : 'MID';
    const legs = h01(`${s}|l`) > 0.87 ? hPick(`${s}|ln`, [2, 2, 3, 4]) : 1;
    const oi = Math.round(hRange(`${s}|oi`, 400, 40_000));
    const volume = Math.round(hRange(`${s}|v`, 50, 25_000));

    out.push({
      id: i,
      time: clock(minute),
      ticker,
      legs,
      strike,
      right,
      otmPct: Number((((strike - spot) / spot) * 100 * (right === 'C' ? 1 : -1)).toFixed(2)),
      expiry: expiryLabel(dateIso, dte),
      dte,
      fill,
      bid,
      ask,
      fillPos: Number(fillPos.toFixed(2)),
      side,
      flowScore: Math.round((fillPos - 0.5) * 200),
      ratioLabel: side === 'MID' ? 'MID' : `${side} ${Math.round(hRange(`${s}|rl`, 52, 88))}%`,
      ratioBidPct: Math.round(hRange(`${s}|rb`, 12, 88)),
      size,
      premium: Math.round(size * fill * 100),
      volume,
      oi,
      deltaOI: Math.round(hRange(`${s}|doi`, -1_500, 3_000)),
      spot,
      iv: Number(hRange(`${s}|iv`, 9, 68).toFixed(1)),
      volOverOI: Number((volume / Math.max(1, oi)).toFixed(2)),
      strat: (legs > 1 ? hPick(`${s}|st`, ['VERTICAL', 'BUTTERFLY', 'RATIO']) : 'SINGLE') as StratTag,
      sweep: h01(`${s}|sw`) > 0.78,
    });
  }

  /* Newest first — the live tape's order, and what the aggregator's
     "latest reading" rule depends on. */
  return out.sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0));
}

/** MM/DD/YYYY, `dte` sessions after the replayed date. */
function expiryLabel(dateIso: string, dte: number): string {
  const d = new Date(`${dateIso}T12:00:00`);
  let added = 0;
  while (added < dte) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

/** The last N trading days ending today — the replay picker's options. */
export function recentSessions(count: number, today = new Date()): string[] {
  const out: string[] = [];
  const d = new Date(today);
  while (out.length < count) {
    if (d.getDay() !== 0 && d.getDay() !== 6) {
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    d.setDate(d.getDate() - 1);
  }
  return out;
}
