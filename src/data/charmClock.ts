import { RTH_MINUTES } from '../core/calendar';

/*
==================================================
  SLAYER TERMINAL - THE CHARM CLOCK (data/charmClock.ts)

  How much of today's charm has already been paid,
  and how much is still to come — P-15.
==================================================

  P-0 MADE THE CLOCK REAL. Before it, `t` was pinned at 0.4615 and the charm
  projection at 09:35 was byte-identical to the one at 15:55 — on a page
  about where exposure migrates as TIME shifts, on a 0DTE product, where the
  last hour does most of the work. This is what gets built once it ticks.

  CHARM IS NOT PAID EVENLY, and that is the entire content of this strip.
  Delta decay runs as the derivative of a √τ term, so it ACCELERATES into
  the bell: the last thirty minutes of a session carry far more of the day's
  charm than the first thirty. A progress bar that advanced linearly with
  the clock would be a clock, not a charm reading, and would tell a reader
  the opposite of the truth at exactly the moment they care — mid-afternoon,
  when the linear read says "most of the day is gone" and the charm read
  says "most of the decay has not happened yet".

  THE MEASURE. For an option expiring at today's close, charm ∝ 1/√τ, so the
  charm accumulated from the open to a moment is the integral of that — and
  the integral of τ^(−1/2) is 2√τ. Working in fractions of a session:

      remaining share = √(τ_now / τ_open) = √(minutes left / session length)

  So at the halfway bell √0.5 ≈ 0.71 of the day's charm is still ahead, not
  0.50. At the final half hour of a 390-minute session, √(30/390) ≈ 0.28 —
  more than a quarter of the whole day's delta decay packed into the last
  7.7% of it. That is the number this strip exists to show.

  IT IS A SHAPE CLAIM, NOT A DOLLAR CLAIM. This says how the day's charm is
  DISTRIBUTED across the session, which follows from the √τ form alone. It
  does not claim to know the dollar total — that depends on the book, and
  the map beside it is where those numbers live.
*/

export interface CharmClock {
  /** Minutes elapsed in the session, clamped to it. */
  elapsed: number;
  /** Minutes to the bell. */
  remaining: number;
  /** Share of the SESSION that has passed — the linear read, for contrast. */
  clockShare: number;
  /** Share of the day's CHARM already realized, 0–1. */
  realizedShare: number;
  /** Share still ahead. */
  remainingShare: number;
}

/**
 * Where the session's charm stands.
 *
 * @param elapsedMinutes minutes since the open — clamped into the session
 * @param sessionMinutes the session's length; defaults to RTH
 */
export function buildCharmClock(elapsedMinutes: number, sessionMinutes: number = RTH_MINUTES): CharmClock {
  const span = sessionMinutes > 0 ? sessionMinutes : RTH_MINUTES;
  const elapsed = Math.min(span, Math.max(0, elapsedMinutes));
  const remaining = span - elapsed;
  /* √(remaining / span) — see the header. At the bell this is 0 and every
     share is exactly realized, which is the boundary a reader checks first. */
  const remainingShare = Math.sqrt(remaining / span);
  return {
    elapsed,
    remaining,
    clockShare: elapsed / span,
    realizedShare: 1 - remainingShare,
    remainingShare,
  };
}

/** The sentence the strip carries. */
export function charmClockWords(c: CharmClock): string {
  if (c.remaining <= 0) return 'The session is done — all of today’s charm has been paid.';
  if (c.elapsed <= 0) return 'The bell has not rung — all of today’s delta decay is still ahead.';
  const realized = Math.round(c.realizedShare * 100);
  const clock = Math.round(c.clockShare * 100);
  /* The comparison IS the read: charm running behind the clock is the
     non-obvious fact, and it holds for the whole session. */
  return `${clock}% of the session is gone but only ${realized}% of today’s charm has been paid — decay accelerates into the bell.`;
}
