import type { CSSProperties, ReactNode } from 'react';
import { heatCellStyle } from '../gex/heatmap';
import { SPOT, fmtStrike } from './ink';

/*
==================================================
  SLAYER TERMINAL - HEAT GRID (components/pinpoint/HeatGrid.tsx)
  Strikes down, columns across, one cell per fact.
==================================================

  SpotGamma's TRACE, Unusual Whales' expiry grids, MenthorQ's level
  tables — the strike × something heatmap is the second picture every
  competitor draws, and the one desk of ours that drew it (the old Expiry
  Ladder) drew it as a table of numbers with a tint. This is the grid as a
  picture first: the cell IS the colour, the number rides inside it in
  ink the ramp has already solved for legibility, spot is a bright rule
  through the rows, and a cell that is ESTIMATED wears a dashed edge so
  the reader can see at a glance which of these facts have settled.

  Generic on purpose. The Heat desk draws positioning by expiry and the
  change through the session on the same component; the Replay desk
  draws strike × time on it. One grid, one grammar.
*/

export interface HeatColumn {
  key: string;
  label: ReactNode;
  /** Under the label — the unit, a note. */
  note?: ReactNode;
  /** A column whose values are not settled yet. */
  estimated?: boolean;
}

export interface HeatCell {
  col: string;
  value: number;
  /** Printed in the cell; when absent the value is formatted with `fmt`. */
  text?: string;
  /** A cell the reader should notice — drawn with a ring. */
  hot?: boolean;
  /** A cell whose value is still an estimate — drawn with a dashed edge. */
  estimated?: boolean;
  title?: string;
}

export interface HeatRow {
  strike: number;
  cells: HeatCell[];
  /** Ink for the strike label — a wall, a pin, a level the row is. */
  ink?: string;
  /** A tag beside the strike. */
  tag?: ReactNode;
  /** One sentence for the row — its title, read by hover and by the sweep. */
  title?: string;
}

interface HeatGridProps {
  columns: HeatColumn[];
  /** Strikes DESCENDING. */
  rows: HeatRow[];
  maxAbs: number;
  spot: number;
  fmt: (v: number) => string;
  hoverStrike?: number | null;
  onHover?: (strike: number | null) => void;
  onSelect?: (strike: number) => void;
  selectedStrike?: number | null;
  /** The first column header — "Strike" unless the grid is about something else. */
  cornerLabel?: ReactNode;
  className?: string;
  dense?: boolean;
}

const HeatGrid = ({ columns, rows, maxAbs, spot, fmt, hoverStrike = null, onHover, onSelect, selectedStrike = null, cornerLabel = 'Strike', className = '', dense = false }: HeatGridProps) => {
  const spotAfter = rows.findIndex(r => r.strike < spot);
  const padY = dense ? 'py-1' : 'py-1.5';
  return (
    <div className={`overflow-auto ${className}`} onMouseLeave={() => onHover?.(null)}>
      <table className="w-full border-separate border-spacing-0" data-heat-grid>
        <thead className="sticky top-0 z-10 bg-panel">
          <tr>
            <th className="text-left font-mono text-[9px] uppercase tracking-widest text-textMuted font-medium px-2 py-2 border-b border-borderSubtle">{cornerLabel}</th>
            {columns.map(c => (
              <th key={c.key} className="text-center font-mono text-[9px] uppercase tracking-widest text-textSecondary font-semibold px-1 py-2 border-b border-borderSubtle whitespace-nowrap">
                <span className={c.estimated ? 'border-b border-dashed border-textMuted/70' : ''}>{c.label}</span>
                {c.note && <span className="block font-normal text-[8px] tracking-wider text-textMuted normal-case">{c.note}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const hover = hoverStrike === r.strike;
            const sel = selectedStrike === r.strike;
            const cellStyleFor = (c: HeatCell): CSSProperties => ({
              ...heatCellStyle(c.value, maxAbs),
              ...(c.estimated ? { outline: '1px dashed rgba(237,237,237,0.35)', outlineOffset: -2 } : {}),
              ...(c.hot ? { boxShadow: 'inset 0 0 0 2px rgba(210,255,0,0.85)' } : {}),
            });
            return (
              <>
                {i === spotAfter && (
                  <tr key={`spot-${r.strike}`} aria-hidden data-spot-rule>
                    <td colSpan={columns.length + 1} className="p-0">
                      <div className="relative h-[2px]" style={{ background: SPOT }}>
                        <span className="absolute right-1 -top-[7px] rounded px-1 font-mono text-[8px] font-bold tracking-wider text-[#0a0a0a]" style={{ background: SPOT }}>
                          SPOT {fmtStrike(spot)}
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
                <tr
                  key={r.strike}
                  onMouseEnter={() => onHover?.(r.strike)}
                  onClick={() => onSelect?.(r.strike)}
                  aria-selected={sel || undefined}
                  title={r.title}
                  data-strike-row={r.strike}
                  className={`${onSelect ? 'cursor-pointer' : ''} ${hover ? 'bg-white/[0.04]' : ''} ${sel ? 'bg-select/[0.06]' : ''}`}
                >
                  <td className={`px-2 ${padY} font-mono text-[11px] tnum whitespace-nowrap border-b border-borderSubtle/40`} style={{ color: r.ink ?? (hover ? '#ededed' : '#a3a3a3') }}>
                    <span className={r.ink ? 'font-bold' : 'font-medium'}>{fmtStrike(r.strike)}</span>
                    {r.tag && <span className="ml-1.5 align-middle">{r.tag}</span>}
                  </td>
                  {columns.map(col => {
                    const c = r.cells.find(x => x.col === col.key);
                    if (!c)
                      return (
                        <td key={col.key} className={`px-1 ${padY} text-center font-mono text-[10px] text-textMuted/50 border-b border-borderSubtle/40`}>
                          —
                        </td>
                      );
                    return (
                      <td key={col.key} className={`px-1.5 ${padY} text-center font-mono text-[10px] tnum border-b border-borderSubtle/40`} style={cellStyleFor(c)} title={c.title} data-hot={c.hot || undefined} data-estimated={c.estimated || undefined}>
                        {c.text ?? fmt(c.value)}
                      </td>
                    );
                  })}
                </tr>
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default HeatGrid;
