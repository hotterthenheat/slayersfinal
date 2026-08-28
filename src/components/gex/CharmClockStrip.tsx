import { buildCharmClock, charmClockWords } from '../../data/charmClock';
import { FLIP } from './palette';
import Term from '../ui/Term';

/*
==================================================
  SLAYER TERMINAL - CHARM CLOCK STRIP — P-15
  (components/gex/CharmClockStrip.tsx)
==================================================

  TWO BARS, AND THE GAP BETWEEN THEM IS THE WHOLE POINT. The upper bar is
  the clock — how much of the session has passed. The lower is the charm —
  how much of the day's delta decay has actually been paid. They start and
  end together and diverge by up to 25 points in between, and that gap is
  the thing a reader cannot get anywhere else: mid-afternoon the clock says
  most of the day is gone and the charm says most of the decay has not
  happened yet.

  ONE BAR WOULD HAVE HIDDEN IT. A single "62% realized" figure is a number
  without a reference; against the clock it is an argument.
*/

const CharmClockStrip = ({ elapsedMinutes, sessionMinutes }: { elapsedMinutes: number; sessionMinutes?: number }) => {
  const c = buildCharmClock(elapsedMinutes, sessionMinutes);
  const pct = (x: number) => `${Math.round(x * 100)}%`;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">
          <Term k="Charm clock">Today’s decay</Term>
        </span>
        <span className="font-mono text-[10px] tnum text-textMuted">
          {Math.round(c.remaining)} min to the bell
        </span>
      </div>

      {[
        { label: 'session gone', v: c.clockShare, ink: 'rgba(226,234,244,0.35)' },
        { label: 'charm paid', v: c.realizedShare, ink: FLIP },
      ].map(bar => (
        <div key={bar.label} className="flex items-center gap-2">
          <span className="w-[74px] shrink-0 font-mono text-[9px] uppercase tracking-wider text-textMuted">
            {bar.label}
          </span>
          <div className="flex-1 h-1.5 rounded-sm bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-sm transition-[width] duration-500"
              style={{ width: `${bar.v * 100}%`, background: bar.ink }}
            />
          </div>
          <span className="w-[34px] shrink-0 text-right font-mono text-[10px] tnum text-textSecondary">
            {pct(bar.v)}
          </span>
        </div>
      ))}

      <p className="font-mono text-[10px] leading-relaxed text-textSecondary">{charmClockWords(c)}</p>
    </div>
  );
};

export default CharmClockStrip;
