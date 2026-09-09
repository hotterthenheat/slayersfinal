import { heatRgb } from '../gex/heatmap';
import { INK, SELECT } from './ink';
import { useSize } from './Desk';

/*
==================================================
  SLAYER TERMINAL - HEAT FIELD (components/pinpoint/HeatField.tsx)
  A grid of cells whose colour is the value. Replay's strike × time and
  Vol's expiry × moneyness.
==================================================

  Cells, not a table: the field is the picture, and the figure in a cell
  is printed only where the cell is tall enough to hold one. The value
  under the pointer goes to the inspector.
*/

export interface HeatColumn {
  key: string;
  label: string;
  note?: string;
}
export interface HeatRow {
  key: string;
  label: string;
  cells: (number | null)[];
  ink?: string;
}

interface Props {
  columns: HeatColumn[];
  rows: HeatRow[];
  /** `diverging` colours by sign on the house ramp; `sequential` ramps from dark to the cool pole. */
  scale: { kind: 'diverging'; maxAbs: number } | { kind: 'sequential'; min: number; max: number };
  /** A column to ring — the scrubbed moment. */
  hotColumn?: string | null;
  fmt: (v: number) => string;
  onHover?: (cell: { row: HeatRow; column: HeatColumn; value: number | null } | null) => void;
  ariaLabel: string;
  className?: string;
}

const GUTTER_L = 44;
const HEADER = 22;

const rgb = (c: [number, number, number], a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

const HeatField = ({ columns, rows, scale, hotColumn = null, fmt, onHover, ariaLabel, className = '' }: Props) => {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const nC = columns.length;
  const nR = rows.length;
    /* A field with few rows should FILL the box it was given rather than
     leave the bottom half of the picture empty — Vol's surface is seven
     expiries and used to draw 190px of a 380px slot. */
  const cellH = nR ? Math.max(8, Math.min(48, Math.floor((h - HEADER) / nR))) : 8;
  const H = Math.max(h, HEADER + nR * cellH);
  const cellW = nC ? (w - GUTTER_L) / nC : 0;
  const fill = (v: number | null): string => {
    if (v === null) return 'rgba(255,255,255,0.03)';
    if (scale.kind === 'diverging') return rgb(heatRgb(v, scale.maxAbs || 1));
    const t = Math.max(0, Math.min(1, (v - scale.min) / ((scale.max - scale.min) || 1)));
    const c = heatRgb(-1, 1);
    return rgb(c, 0.12 + t * 0.88);
  };
  const showFigures = cellH >= 13 && cellW >= 44;
  const labelEvery = cellW >= 34 ? 1 : cellW >= 22 ? 2 : 3;

  return (
    <div ref={ref} className={`relative flex-1 min-h-0 overflow-auto ${className}`} onMouseLeave={() => onHover?.(null)} data-heat-field>
      {w > 0 && nR > 0 && nC > 0 && (
        <svg width={w} height={H} role="img" aria-label={ariaLabel} className="block select-none">
          {/* A time that runs into the next time is a smear, not an axis: on
              a phone the twelve slices label every other column, and the one
              the scrubber is on is always named. */}
          {columns.map((c, j) =>
            j % labelEvery === 0 || c.key === hotColumn ? (
              <text key={c.key} x={GUTTER_L + j * cellW + cellW / 2} y={13} textAnchor="middle" fontSize={9} fontFamily="ui-monospace, monospace" fontWeight={c.key === hotColumn ? 700 : 400} fill={c.key === hotColumn ? SELECT : INK.muted} data-heat-col={c.key}>
                {c.label}
              </text>
            ) : null
          )}
          {rows.map((r, i) => {
            const y = HEADER + i * cellH;
            return (
              <g key={r.key} data-heat-row={r.key}>
                {(cellH >= 11 || i % 2 === 0) && (
                  <text x={GUTTER_L - 6} y={y + cellH / 2 + 3.5} textAnchor="end" fontSize={9} fontFamily="ui-monospace, monospace" fontWeight={r.ink ? 700 : 400} fill={r.ink ?? INK.muted}>
                    {r.label}
                  </text>
                )}
                {columns.map((c, j) => {
                  const v = r.cells[j] ?? null;
                  const x = GUTTER_L + j * cellW;
                  return (
                    <g key={c.key} onMouseEnter={() => onHover?.({ row: r, column: c, value: v })}>
                      <rect x={x} y={y} width={Math.max(0, cellW - 1)} height={Math.max(0, cellH - 1)} fill={fill(v)} data-heat-cell />
                      {showFigures && v !== null && (
                        <text x={x + cellW / 2} y={y + cellH / 2 + 3.5} textAnchor="middle" fontSize={9} fontFamily="ui-monospace, monospace" fill="rgba(0,0,0,0.75)">
                          {fmt(v)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
          {hotColumn !== null && columns.some(c => c.key === hotColumn) && (
            <rect x={GUTTER_L + columns.findIndex(c => c.key === hotColumn) * cellW - 0.5} y={HEADER - 0.5} width={cellW} height={nR * cellH} fill="none" stroke={SELECT} strokeWidth={1.5} data-heat-hot />
          )}
        </svg>
      )}
    </div>
  );
};

export default HeatField;
