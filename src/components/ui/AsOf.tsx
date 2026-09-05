import { useEffect, useState } from 'react';
import { futuresPhaseAt, isTradingDay, FUTURES_PHASE_WORDS } from '../../core/calendar';

/*
==================================================
  SLAYER TERMINAL - HOW OLD IS THIS NUMBER
  (components/ui/AsOf.tsx)
==================================================

  Nothing on this desk said how old anything was. Every panel drew its number
  in the same ink whether it arrived a second ago or belonged to yesterday's
  settlement, and a reader had no way to tell the difference from the screen.

  THE THREE AGES A NUMBER ON AN OPTIONS DESK CAN HAVE, and they are genuinely
  different claims rather than three shades of the same one:

    TICK-FRESH    a quote or a print, seconds old. Its age is worth watching
                  because a feed that stops is indistinguishable from a market
                  that went quiet unless something is counting.
    SESSION       derived from the day so far. It is as current as the session
                  is, and saying "as of 14:32" is the whole story.
    SETTLED       open interest, above all. OI is published ONCE, overnight,
                  for the PREVIOUS session — so an OI number shown at 10:00 on
                  Friday describes Thursday's close and will not move again
                  until Saturday morning. A desk that renders it beside live
                  volume without saying so is inviting the reader to compute a
                  vol/OI ratio across two different days.

  THE T+1 POINT IS THE ONE THAT MATTERS. Intraday ΔOI is an ESTIMATE until the
  settlement file lands. The checklist asks for distinct ink for that, and the
  distinction is real modelling rather than decoration: an estimated build and
  a settled build are different confidences and should not look alike.

  These are deliberately small. An as-of stamp that competes with the number
  it dates has got the hierarchy backwards.
*/

const ET = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const ET_FULL = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "Thu 16:15" in exchange time — the only clock an options desk should quote. */
export const etStamp = (d: Date): string => ET.format(d).replace(',', '');
export const etStampFull = (d: Date): string => ET_FULL.format(d).replace(',', '');

/**
 * THE LAST SETTLEMENT, which is what an open-interest number is really dated.
 * OI for a session is published overnight, so before roughly 06:00 ET the
 * freshest file on the desk is still the one from two sessions back.
 */
export function lastOiSettlement(now: Date = new Date()): Date {
  const d = new Date(now);
  const etHour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false }).format(d)
  );
  /* Step back to the session the file describes: yesterday's close, or the day
     before if the overnight run has not finished yet. */
  d.setDate(d.getDate() - (etHour < 6 ? 2 : 1));
  while (!isTradingDay(d)) d.setDate(d.getDate() - 1);
  d.setHours(16, 15, 0, 0);
  return d;
}

/** A quiet "as of" stamp for a panel header. */
export const AsOf = ({ at, label = 'as of' }: { at: Date; label?: string }) => (
  <span
    title={`${label} ${etStampFull(at)} ET`}
    className="font-mono text-[9px] uppercase tracking-wider text-textMuted whitespace-nowrap tnum"
  >
    {label} {etStamp(at)} ET
  </span>
);

/**
 * THE OPEN-INTEREST BADGE. Not styled as a warning, because settled OI is not
 * a fault — it is the correct, final number for the session it names. The
 * badge exists so the reader knows WHICH session that is.
 */
export const OiAsOf = ({ at = lastOiSettlement() }: { at?: Date }) => (
  <span
    title={`Open interest is published once, overnight, for the previous session. This is ${etStampFull(at)} ET — it will not move again until the next settlement file lands.`}
    className="inline-flex items-center gap-1 rounded border border-borderSubtle px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-textMuted whitespace-nowrap tnum"
  >
    OI as of {etStamp(at)} ET
  </span>
);

/**
 * ESTIMATED VS SETTLED, as ink rather than a word. Returns the class an
 * intraday ΔOI surface should carry: hatched while it is a same-session
 * estimate, solid once the settlement file it is guessing at has landed.
 */
export const estimatedInk = (settled: boolean): string =>
  settled ? '' : 'bg-[repeating-linear-gradient(135deg,transparent,transparent_3px,rgba(255,255,255,0.05)_3px,rgba(255,255,255,0.05)_6px)]';

/**
 * THE TICK-AGE DOT. Bright while the feed is current, fading as the last tick
 * recedes, hollow once it is older than `staleAfterMs`.
 *
 * A FEED THAT STOPPED AND A MARKET THAT WENT QUIET look identical on a screen
 * of unchanging numbers, and only one of them is a fault. This is the cheapest
 * possible way to tell them apart, and it is why the dot reports AGE rather
 * than a binary connected/disconnected: the interesting state is the one in
 * between, where ticks are arriving but slowly.
 */
export const TickAge = ({
  at,
  staleAfterMs = 15000,
  label = 'last tick',
}: {
  at: number | null;
  staleAfterMs?: number;
  label?: string;
}) => {
  /* Its own clock: the age changes while nothing else on the panel does, so
     re-rendering the parent for it would be the wrong trade. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  if (at === null) return null;
  const age = Math.max(0, now - at);
  const stale = age > staleAfterMs;
  const secs = Math.floor(age / 1000);
  return (
    <span
      title={`${label} ${secs}s ago${stale ? ' — the feed may have stopped' : ''}`}
      aria-label={`${label} ${secs} seconds ago`}
      className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-textMuted tnum"
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${stale ? 'border border-warn' : 'bg-bull'}`}
        style={stale ? undefined : { opacity: Math.max(0.25, 1 - age / staleAfterMs) }}
      />
      {stale ? `${secs}s` : ''}
    </span>
  );
};

/**
 * WHAT THE SESSION IS DOING, so a panel can say "pre-market, the chain is
 * yesterday's" rather than leaving the reader to infer it from the clock.
 */
export const SessionPhase = ({ at = new Date() }: { at?: Date }) => {
  const phase = futuresPhaseAt(at);
  const w = FUTURES_PHASE_WORDS[phase];
  return (
    <span
      title={w.blurb}
      className="font-mono text-[9px] uppercase tracking-wider text-textMuted whitespace-nowrap"
    >
      {w.label}
    </span>
  );
};
