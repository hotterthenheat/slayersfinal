import { useMemo } from 'react';
import { buildOiHeat, rowWords } from '../../data/oiHeat';
import Term from '../ui/Term';
import type { Candle, GexSnapshot } from '../../types/market';

/*
==================================================
  SLAYER TERMINAL - ΔOI HEAT — P-8
  (components/gex/OiHeatPanel.tsx)
==================================================

  Rows = strikes, columns = time, cells = CHANGE. The map is a snapshot of
  a stock; this is the flow that answers "is that wall growing or dying".

  ΔOI HAS A HOUSE PATTERN AND THIS PANEL NOW FOLLOWS IT. PressureMatrix has
  drawn open-interest change the same way since the desk existed: an ↑ or ↓
  arrow with the number, bull green for building and bear red for unwinding,
  and INK ONLY ON THE DELTAS THAT MATTER — the top quintile by magnitude —
  because forty red/green arrows is noise and a handful is signal.

  It took two wrong rounds to land here, which is why the rule is written
  out. Round one painted red/green background washes (the generic heatmap
  this desk moved off). Round two "fixed" that to steel/gold washes — but
  steel/gold mean CALL SIDE and PUT SIDE everywhere else, and a strike
  gaining open interest has not picked a side, it has changed size. The
  house already had the answer; neither round looked for it. A surface that
  wants an established meaning derives from the component that owns it.

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

  /* PressureMatrix's significance rule, verbatim in spirit: the top
     quintile of |ΔOI| across the grid carries ink, everything else stays
     quiet. */
  const magnitudes = heat.rows.flatMap(r => r.cells.map(c => Math.abs(c.deltaOi))).sort((a, b) => a - b);
  const significantAbs = magnitudes.length ? magnitudes[Math.floor(magnitudes.length * 0.8)] : 0;
  const cellClass = (v: number) => {
    if (v === 0) return 'text-textMuted';
    const significant = significantAbs > 0 && Math.abs(v) >= significantAbs;
    return significant ? (v > 0 ? 'text-bull font-semibold' : 'text-bear font-semibold') : 'text-textSecondary';
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
                    title={`${r.strike} · ${hhmm(c.time)} · calls ${c.deltaCall >= 0 ? '+' : ''}${c.deltaCall} · puts ${c.deltaPut >= 0 ? '+' : ''}${c.deltaPut}`}
                    className={`px-1.5 py-0.5 text-right font-mono text-[10px] tnum ${cellClass(c.deltaOi)}`}
                  >
                    {c.deltaOi === 0 ? '·' : `${c.deltaOi > 0 ? '↑' : '↓'}${Math.abs(c.deltaOi).toLocaleString()}`}
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
        ↑ builds in green, ↓ unwinds in red — and only the deltas that matter carry ink, the same
        top-quintile rule the pressure matrix uses.
      </p>
    </div>
  );
};

export default OiHeatPanel;
