import { useMemo } from 'react';
import Panel from '../ui/Panel';
import ProvenanceChip from '../ui/ProvenanceChip';
import { buildSeasonality, seasonalityRead, tailNote } from '../../data/seasonality';

/*
==================================================
  SLAYER TERMINAL - SEASONALITY, BY MONTH
  (components/gex/SeasonalityPanel.tsx)
==================================================

  Twelve months down the page: what this name has typically done in each,
  how often it closed green, and the spread it did it across.

  THE BAR IS THE MEDIAN, and it grows from a centre line rather than from
  the left, because these numbers are signed and a left-anchored bar makes
  −4% and +4% look like different sizes of the same thing.

  THE MEAN IS A TICK ON THAT BAR, not a second bar. Where the tick sits
  away from the bar's end IS the tail warning — a mean far below the median
  is a month that is usually fine and occasionally very bad — and putting
  it on the same axis is what makes the gap readable at a glance instead of
  arithmetic the reader has to do.

  THE HIT RATE CARRIES ITS SAMPLE. "70%" alone is not a number a reader can
  weigh; "70% of 15" is. The count sits beside every rate for exactly that
  reason, and the panel would rather be a character wider than imply a
  precision the sample cannot carry.
*/

interface SeasonalityPanelProps {
  ticker: string;
  className?: string;
}

const SeasonalityPanel = ({ ticker, className }: SeasonalityPanelProps) => {
  const s = useMemo(() => buildSeasonality(ticker), [ticker]);
  /* One scale across all twelve, so the bars are comparable down the
     column — per-row scaling would make every month look equally decisive. */
  const span = Math.max(...s.months.map(m => Math.max(Math.abs(m.medianPct), Math.abs(m.meanPct))), 1);

  return (
    <Panel
      title="Seasonality"
      subtitle={`median monthly return across ${s.months[0].years} years — ${s.best.label} strongest, ${s.worst.label} weakest`}
      className={className}
      actions={<ProvenanceChip sources={[]} kind="simulated" note="Generated per ticker and stable per name; replaced wholesale when a vendor history lands." />}
    >
      <p className="px-1 pb-2 text-[11px] text-textSecondary">{seasonalityRead(s)}</p>

      <div className="grid grid-cols-[2.2rem_1fr_3.4rem_3.6rem] items-center gap-x-2 px-1 pb-1">
        {['', '', 'Green', 'Range'].map((h, i) => (
          <span key={i} className="font-mono text-[8px] uppercase tracking-widest text-textMuted text-right first:text-left">
            {h}
          </span>
        ))}
      </div>

      <div className="flex flex-col">
        {s.months.map(m => {
          const here = m.month === s.currentMonth;
          const medW = (Math.abs(m.medianPct) / span) * 50;
          const meanPos = 50 + (m.meanPct / span) * 50;
          const note = tailNote(m);
          return (
            <div
              key={m.month}
              className={`grid grid-cols-[2.2rem_1fr_3.4rem_3.6rem] items-center gap-x-2 px-1 py-[3px] rounded ${
                here ? 'bg-white/[0.05]' : ''
              }`}
              title={`${m.label}: median ${m.medianPct}%, mean ${m.meanPct}%, green in ${m.positivePct}% of ${m.years} years (best ${m.bestPct}%, worst ${m.worstPct}%)${note ? ` — ${note}` : ''}`}
            >
              <span className={`font-mono text-[10px] ${here ? 'text-textPrimary font-semibold' : 'text-textSecondary'}`}>
                {m.label}
              </span>

              {/* The bar grows from the centre — these are signed returns. */}
              <span className="relative h-3 block">
                <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-white/[0.14]" />
                <span
                  aria-hidden
                  className={`absolute inset-y-[2px] rounded-[2px] ${m.medianPct >= 0 ? 'bg-bull/50' : 'bg-bear/50'}`}
                  style={m.medianPct >= 0 ? { left: '50%', width: `${medW}%` } : { right: '50%', width: `${medW}%` }}
                />
                {/* The mean, as a tick on the same axis — its distance from
                    the bar's end is the tail warning, made visual. */}
                <span
                  aria-hidden
                  className="absolute inset-y-0 w-px bg-textPrimary/70"
                  style={{ left: `${Math.max(0, Math.min(100, meanPos))}%` }}
                />
              </span>

              <span className="text-right font-mono text-[10px] tnum text-textSecondary">
                {m.positivePct}%
                <span className="text-textMuted">/{m.years}</span>
              </span>
              <span className={`text-right font-mono text-[10px] tnum font-semibold ${m.medianPct >= 0 ? 'text-bull' : 'text-bear'}`}>
                {m.medianPct >= 0 ? '+' : ''}
                {m.medianPct.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>

      <p className="px-1 pt-2 text-[10px] leading-snug text-textMuted">
        Bar is the median, the hairline is the mean. A mean far from the bar&rsquo;s end means the month&rsquo;s
        outcome is carried by a few outlying years rather than a typical one.
      </p>
    </Panel>
  );
};

export default SeasonalityPanel;
