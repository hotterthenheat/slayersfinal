import { useMemo } from 'react';
import { buildOiHeat, rowWords } from '../../data/oiHeat';
import { LONG_GAMMA, SHORT_GAMMA } from './palette';
import Term from '../ui/Term';
import type { Candle, GexSnapshot } from '../../types/market';

/*
==================================================
  SLAYER TERMINAL - ΔOI HEAT — P-8
  (components/gex/OiHeatPanel.tsx)
==================================================

  Rows = strikes, columns = time, cells = CHANGE. The map is a snapshot of
  a stock; this is the flow that answers "is that wall growing or dying".

  THE INK IS THE REGIME PAIR AGAIN, and deliberately so: building reads in
  the same steel the call side wears and unwinding in the same gold, so a
  reader who knows the Positioning Map already knows this. Alpha carries
  magnitude against the grid's largest cell, symmetric around zero, because
  building and unwinding are opposite readings of one ruler.

  WHEN THERE IS NOTHING TO SHOW IT SAYS SO. A session that has not recorded
  two snapshots yet has no flow to report, and the panel says exactly that
  rather than drawing an empty grid that looks like a quiet day.
*/

const OiHeatPanel = ({
  snaps,
  bars,
  buckets = 8,
}: {
  snaps: GexSnapshot[];
  bars: Candle[];
  buckets?: number;
}) => {
  const heat = useMemo(() => buildOiHeat(snaps, bars, buckets), [snaps, bars, buckets]);

  if (!heat.hasOi || heat.rows.length === 0) {
    return (
      <div className="font-mono text-[10px] leading-relaxed text-textMuted">
        No position flow recorded yet this session — the grid needs at least two snapshots of the book to
        have a change to show.
      </div>
    );
  }

  const ink = (v: number) => {
    if (heat.maxAbs === 0 || v === 0) return 'transparent';
    const a = Math.min(0.85, 0.1 + (Math.abs(v) / heat.maxAbs) * 0.75);
    const rgb = v > 0 ? SHORT_GAMMA : LONG_GAMMA;
    return `${rgb}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
  };

  const hhmm = (t: number) => {
    const d = new Date(t * 1000);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  /* The busiest strikes first — a grid of every strike is unreadable, and
     the rows worth showing are the ones where something HAPPENED. */
  const rows = [...heat.rows].sort((a, b) => Math.abs(b.netToday) - Math.abs(a.netToday)).slice(0, 12);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">
          <Term k="ΔOI heat">Built and unwound</Term>
        </span>
        <span className="font-mono text-[9px] text-textMuted">
          {heat.hasFlex ? 'with the FLEX transfer split' : 'FLEX transfers not on this account — shown as —'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="px-1.5 py-0.5 text-left font-mono text-[9px] uppercase tracking-wider text-textMuted">
                Strike
              </th>
              {heat.columns.map(c => (
                <th key={c} className="px-1.5 py-0.5 text-right font-mono text-[9px] tnum text-textMuted">
                  {hhmm(c)}
                </th>
              ))}
              <th className="px-1.5 py-0.5 text-right font-mono text-[9px] uppercase tracking-wider text-textMuted">
                Net
              </th>
              <th className="px-1.5 py-0.5 text-right font-mono text-[9px] uppercase tracking-wider text-textMuted">
                FLEX
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.strike} title={rowWords(r)}>
                <td className="px-1.5 py-0.5 font-mono text-[10px] tnum text-textPrimary">{r.strike}</td>
                {r.cells.map(c => (
                  <td
                    key={c.time}
                    style={{ background: ink(c.deltaOi) }}
                    title={`${r.strike} · ${hhmm(c.time)} · calls ${c.deltaCall >= 0 ? '+' : ''}${c.deltaCall} · puts ${c.deltaPut >= 0 ? '+' : ''}${c.deltaPut}`}
                    className="px-1.5 py-0.5 text-right font-mono text-[10px] tnum text-textSecondary"
                  >
                    {c.deltaOi === 0 ? '·' : c.deltaOi > 0 ? `+${c.deltaOi.toLocaleString()}` : c.deltaOi.toLocaleString()}
                  </td>
                ))}
                <td className="px-1.5 py-0.5 text-right font-mono text-[10px] font-semibold tnum text-textPrimary">
                  {r.netToday > 0 ? '+' : ''}
                  {r.netToday.toLocaleString()}
                </td>
                {/* Null, not zero — "we cannot see transfers" is not "there
                    were none". The em-dash is the honest render. */}
                <td className="px-1.5 py-0.5 text-right font-mono text-[10px] tnum text-textMuted">
                  {r.cells.every(c => c.flexTransfer === null)
                    ? '—'
                    : r.cells.reduce((a, c) => a + (c.flexTransfer ?? 0), 0).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-[9px] leading-relaxed text-textMuted">
        Change, not level: a strike parked at the same open interest all day is blank here, and should be.
        Steel is building, gold is unwinding.
      </p>
    </div>
  );
};

export default OiHeatPanel;
