import Simulator from '../core/simulator';
import { sessionStarts } from './indicators';
import type { GexSnapshot } from '../types/market';

/*
==================================================
  SLAYER TERMINAL - WHAT MOVED (data/exposureDrift.ts)
  Per-strike change in dealer gamma, since the session's first reading.
==================================================

  ── THE QUESTION ──────────────────────────────────────────────────────────

  Noah, on charting: "i want when the person is charting on terrian they can
  still see real time gex change thats good about heat maps."

  That names the one genuinely good thing about a heat map, which is not the
  colour: it is that the picture is AMBIENT. You are watching the tape, and
  the book changing registers in your periphery without you going to look
  for it. The strike rail beside the chart already draws where the exposure
  IS. What it has never had is any notion of what it is DOING — every bar is
  a level, and a level that was the same an hour ago looks identical to one
  that tripled in the last twenty minutes.

  This is that missing channel: for every strike, how much dealer gamma has
  been added or taken away since the session's first recorded reading.

  ── WHY GAMMA AND NOT ALL FIVE ────────────────────────────────────────────

  The session buffer stores `GexSnapshot`, whose `levels` carry one number
  per strike — net GEX — and nothing else. Delta, vega, vanna and charm are
  computed off the LIVE chain and were never recorded through the day, so
  there is no earlier value to difference against.

  That is a real limit and it is reported rather than papered over: the rail
  draws the change on gamma, and on the other four it says the change is
  unavailable and why. The alternative — differencing a metric against a
  reconstruction of what it "would have been" — is the kind of number that
  looks like a measurement and is not one.

  ── THE REFERENCE IS TODAY'S FIRST READING ────────────────────────────────

  Not a rolling window. A rolling window answers "what happened in the last
  fifteen minutes", which flickers: a strike that built steadily all morning
  reads as nothing, and a single print reads as everything. Since-the-open
  is cumulative, so it grows and shrinks smoothly and answers the question a
  chartist actually has in front of a wall — is this level being built or
  taken apart TODAY.

  When the buffer holds only one reading there is no change to report, and
  the caller is handed null rather than a map full of zeros. Zero is a
  measurement; "nothing to compare against yet" is not the same claim.
*/

export interface StrikeDrift {
  /** Signed change in net GEX at this strike since the reference reading. */
  delta: number;
  /** What it was at the reference. */
  then: number;
  /** What it is now. */
  now: number;
}

export interface DriftRead {
  /** Keyed by strike. Strikes absent from either end are absent here. */
  by: Map<number, StrikeDrift>;
  /** The reference reading's timestamp, in seconds. */
  since: number;
  /** How many readings the session has recorded, so a caller can qualify it. */
  readings: number;
  /*
    WHETHER THE REFERENCE IS THE OPEN OR MERELY THE LAST READING.

    The two are different claims and the caller says which out loud. Without
    this the rail printed "since the session's first reading" while
    differencing against the previous one — the exact confusion the fallback
    comment below warns about, left unwired.
  */
  fromOpen: boolean;
  /** The largest absolute change, for scaling a mark against the bars. */
  maxAbs: number;
}

/*
  THE SESSION IS THE BARS' OWN SESSION, not a calendar day and not a window
  of hours I picked.

  Two wrong answers came before this one, and both are worth recording
  because they failed differently.

  A CALENDAR DAY made the reference depend on the VIEWER'S midnight — a
  reader in Tokyo and one in Chicago differencing against different mornings
  — and it breaks outright on a session that straddles midnight, which
  futures do every night.

  A FIXED SPAN OF HOURS then measured as "only one reading falls inside the
  current session" on a desk whose buffer plainly held a full day of them:
  the seeded history and the readings the desk appends as it runs do not sit
  a uniform distance apart, so any interval I invented was going to be wrong
  somewhere.

  The codebase already knows what a session is. `sessionStarts` reads it off
  the BARS — the same boundaries Replay scrubs between and the same ones the
  session-levels overlay draws from — so this asks that rather than adding a
  second, disagreeing definition. If two parts of a terminal disagree about
  where a session begins, one of them is lying to somebody.
*/
/** Why there is nothing to draw, when there is nothing to draw. */
export interface DriftUnavailable {
  read: null;
  why: string;
}
export interface DriftAvailable {
  read: DriftRead;
  why: null;
}

/**
 * The change at every strike since the start of the reading's own session.
 *
 * Never returns a bare null: the reason rides with the absence, because a
 * rail that simply stops drawing a channel teaches a reader that the channel
 * is unreliable rather than that the data is not there yet.
 */
export function buildStrikeDrift(ticker: string): DriftAvailable | DriftUnavailable {
  const history: GexSnapshot[] = Simulator.getGexHistory(ticker) ?? [];
  if (history.length < 2) {
    return { read: null, why: `The session buffer holds ${history.length} reading${history.length === 1 ? '' : 's'} — there is nothing yet to compare against.` };
  }

  const latest = history[history.length - 1];
  const bars = Simulator.getCandles(ticker) ?? [];
  const starts = sessionStarts(bars, 1);
  /* The last session boundary at or before the newest reading. With no bars
     to read one from — a name the desk has only just met — every reading in
     the buffer is fair game, which is the honest fallback: the reference is
     then the oldest thing there is rather than a boundary invented here. */
  let openAt = 0;
  for (const i of starts) {
    const t = bars[i]?.time ?? 0;
    if (t <= latest.time) openAt = t;
  }
  const session = history.filter(s => s.time >= openAt);
  /*
    ONE READING SINCE THE OPEN IS STILL A LIVE CHANNEL.

    A desk opened mid-session has a buffer that starts mid-session, and
    refusing to draw anything until the next bell would make the rail look
    broken for hours. So it falls back to the previous reading and CHANGES
    WHAT IT CLAIMS — `since` carries the reference's own timestamp, and the
    caller prints it, so "since the open" and "since the last reading" are
    never confused for one another.
  */
  const fromOpen = session.length >= 2;
  const first = fromOpen ? session[0] : history[history.length - 2];
  const then = new Map(first.levels.map(l => [l.strike, l.value]));

  const by = new Map<number, StrikeDrift>();
  let maxAbs = 0;
  for (const l of latest.levels) {
    const was = then.get(l.strike);
    /* A strike that was not on the book at the open has no change — it has
       an arrival, which is a different fact and not one this map claims. */
    if (was === undefined) continue;
    const delta = l.value - was;
    by.set(l.strike, { delta, then: was, now: l.value });
    maxAbs = Math.max(maxAbs, Math.abs(delta));
  }
  if (by.size === 0) {
    return { read: null, why: 'The book has recentred far enough that no strike on it now was on it at the session\u2019s first reading.' };
  }

  return {
    read: { by, since: first.time, readings: session.length, fromOpen, maxAbs: Math.max(1, maxAbs) },
    why: null,
  };
}

/** The strikes that moved most, largest first — the rail's one-line read. */
export function biggestMovers(drift: DriftRead, n = 3): { strike: number; delta: number }[] {
  return [...drift.by.entries()]
    .map(([strike, d]) => ({ strike, delta: d.delta }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, n);
}
