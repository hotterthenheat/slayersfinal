import type { CSSProperties, ReactNode } from 'react';
import { heatCellStyle } from '../gex/heatmap';
import { INK, SPOT, fmtStrike, signInk } from './ink';

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

  Generic on purpose. The Exposure desk draws positioning by expiry on it
  and the Replay desk draws strike × time. One grid, one grammar.

  ── DENSITY, AFTER THE FIRST BUILD WAS MEASURED (2026-09-06) ──────────────

  Noah: "learn from skylit heat maps". Measured on the built Exposure desk,
  three things were wrong and all three were about space:

    · THE STRIKE COLUMN WAS AS WIDE AS THE PICTURE'S OWN. `w-full` with
      seven equal columns gave a three-digit number 219 of the grid's 1534
      pixels — a seventh of the surface, blank.
    · ROWS WERE 29px TALL, so eighteen strikes were on a 1000px screen. A
      heat map is a FIELD; the reader is looking for the shape of the
      thing, and eighteen rows is not enough field to have a shape.
    · EVERY CELL PRINTED A FULL DOLLAR FIGURE at the same weight, so the
      numbers and not the colour carried the ranking, which is the one job
      a heat map exists to do.

  So: a colgroup that gives the strike axis the width it needs and no more
  (78px, measured, against a heat column's 159), a dense row, and an
  optional BAR column — a diverging bar off the centre line — for the row's
  total, which is what makes the grid rankable at a glance without reading a
  single number.

  MEASURED AFTER, on the Exposure surface at 1600×1000: rows at 25px against
  29, and with the desk's window opened to ±20 on the back of it, 41 strikes
  on the grid and 23 of them in view without scrolling, against 18 before.
*/

export interface HeatColumn {
  key: string;
  label: ReactNode;
  /** Under the label — the unit, a note. */
  note?: ReactNode;
  /** A column whose values are not settled yet. */
  estimated?: boolean;
  /**
   * `heat` fills the cell; `bar` draws a diverging bar off the centre and
   * leaves the cell unfilled. A bar column is for a total or a rank — the
   * thing the reader scans down — and it is deliberately a different
   * drawing so it never reads as one more expiry.
   */
  kind?: 'heat' | 'bar';
  /** Fixed width in px. Columns without one share what is left. */
  width?: number;
  /**
   * A scale of this column's own. A total column holds numbers several times
   * larger than the parts it sums, so on the grid's shared scale its bar
   * would peg at full width on every row and rank nothing.
   */
  maxAbs?: number;
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
  /** ~19px rows instead of ~29px. On for any grid a reader scans as a field. */
  dense?: boolean;
  /** The strike axis's width. Wide enough for the number and its tag, never
      wider — this column carried 225px of empty space before it was pinned. */
  strikeWidth?: number;
}

const HeatGrid = ({ columns, rows, maxAbs, spot, fmt, hoverStrike = null, onHover, onSelect, selectedStrike = null, cornerLabel = 'Strike', className = '', dense = false, strikeWidth = 76 }: HeatGridProps) => {
  const spotAfter = rows.findIndex(r => r.strike < spot);
  /* py-0.5 against py-1.5. Measured on Exposure — whose bar column stacks a
     figure over its underline and so sets the floor — that is a 25px row
     against a 29px one, and with the wider default window it puts 23 strikes
     in view where 18 were: a field the reader can see the shape of, rather
     than a window onto one. */
  const padY = dense ? 'py-0.5' : 'py-1.5';
  const rowType = dense ? 'text-[10px]' : 'text-[11px]';

  return (
    /* The grid is always clipped to a height and always scrolls, so it draws
       its own edge — the same hairline `Pane` draws, for the same reason. */
    <div className={`overflow-auto border border-borderSubtle ${className}`} onMouseLeave={() => onHover?.(null)}>
      <table className="w-full border-separate border-spacing-0 table-fixed" data-heat-grid>
        {/* The axis and any fixed column take exactly what they need; the heat
            columns divide what is left, which is what makes them the picture. */}
        <colgroup>
          <col style={{ width: strikeWidth }} />
          {columns.map(c => (
            <col key={c.key} style={c.width ? { width: c.width } : undefined} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-canvas">
          <tr>
            <th className={`text-left font-mono text-[10px] uppercase tracking-widest text-textMuted font-normal px-2 ${dense ? 'py-1.5' : 'py-2'} border-b border-borderSubtle`}>{cornerLabel}</th>
            {columns.map(c => (
              <th key={c.key} className={`text-center font-mono text-[10px] uppercase tracking-widest text-textSecondary font-semibold px-1 ${dense ? 'py-1.5' : 'py-2'} border-b border-borderSubtle whitespace-nowrap`}>
                <span className={c.estimated ? 'border-b border-dashed border-textMuted/70' : ''}>{c.label}</span>
                {c.note && <span className="block font-normal text-[10px] tracking-wider text-textMuted normal-case">{c.note}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const hover = hoverStrike === r.strike;
            const sel = selectedStrike === r.strike;
            const cellStyleFor = (c: HeatCell, scale: number): CSSProperties => ({
              ...heatCellStyle(c.value, scale),
              ...(c.estimated ? { outline: '1px dashed rgba(237,237,237,0.35)', outlineOffset: -2 } : {}),
              ...(c.hot ? { boxShadow: 'inset 0 0 0 2px rgba(210,255,0,0.85)' } : {}),
            });
            return (
              <>
                {i === spotAfter && (
                  /*
                    THE SPOT MARKER IS A ROW, NOT A BADGE FLOATING OVER ONE.

                    It used to be absolutely positioned at the right edge of a
                    2px rule, which put it on top of whatever the last column
                    happened to be — on Exposure, straight through the book
                    figure and its bar. A rule that obscures the data it is
                    marking has stopped being a marker. It costs one 14px row
                    and collides with nothing.
                  */
                  <tr key={`spot-${r.strike}`} aria-hidden data-spot-rule>
                    <td className="px-2 py-0 text-right font-mono text-[10px] font-bold tracking-wider whitespace-nowrap" style={{ color: SPOT }}>
                      {fmtStrike(spot)}
                    </td>
                    <td colSpan={columns.length} className="p-0">
                      <div className="h-[2px] my-[5px]" style={{ background: SPOT }} />
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
                  <td className={`px-2 ${padY} font-mono ${rowType} tnum whitespace-nowrap border-b border-borderSubtle/40`} style={{ color: r.ink ?? (hover ? INK.primary : INK.secondary) }}>
                    <span className={r.ink ? 'font-bold' : 'font-normal'}>{fmtStrike(r.strike)}</span>
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
                    /*
                      A BAR, NOT A FILL. The reader scans this column for
                      rank, and a bar answers rank at a glance where a
                      hundred filled cells all answer it at once and
                      therefore not at all. Drawn off the centre so the sign
                      is a direction rather than a colour to memorise.
                    */
                    const scale = col.maxAbs ?? maxAbs;
                    if (col.kind === 'bar') {
                      /*
                        THE BAR UNDERLINES THE NUMBER; IT DOES NOT SIT BEHIND
                        IT. The first build drew a diverging bar across the
                        cell with the figure centred on top, and on any row
                        whose bar was wide the two were illegible through each
                        other. Stacked, both are readable and the cell costs
                        three more pixels of height.

                        It is drawn in the RAMP'S OWN INK rather than the
                        direction pair, because the six columns beside it are
                        already saying "this sign is ice, that sign is gold".
                        A green-and-red bar in the seventh column would be a
                        second colour language for the fact the first six
                        spend their whole width on.
                      */
                      const w = Math.min(50, (Math.abs(c.value) / scale) * 50);
                      const pos = c.value >= 0;
                      const fill = heatCellStyle(c.value, scale).backgroundColor as string;
                      return (
                        <td key={col.key} className={`px-1.5 ${padY} border-b border-borderSubtle/40`} title={c.title} data-bar-cell>
                          <span className={`block text-right font-mono text-[10px] tnum ${hover || sel ? 'text-textPrimary' : 'text-textSecondary'}`}>
                            {c.text ?? fmt(c.value)}
                          </span>
                          <span className="relative block h-[3px] mt-[2px]" style={{ background: 'rgba(255,255,255,0.05)' }}>
                            <span className="absolute inset-y-[-1px] left-1/2 w-px bg-borderMuted" />
                            <span
                              className="absolute inset-y-0"
                              style={{ background: fill, left: pos ? '50%' : `${50 - w}%`, width: `${w}%` }}
                            />
                          </span>
                        </td>
                      );
                    }
                    return (
                      <td key={col.key} className={`px-1.5 ${padY} text-center font-mono text-[10px] tnum border-b border-borderSubtle/40`} style={cellStyleFor(c, scale)} title={c.title} data-hot={c.hot || undefined} data-estimated={c.estimated || undefined}>
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
