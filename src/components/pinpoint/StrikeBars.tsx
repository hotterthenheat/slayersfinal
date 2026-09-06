import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { heatRgb } from '../gex/heatmap';
import { CALL_WALL, FLIP, PUT_WALL, SPOT, SUPREME, ZONE_WORDS, fmtStrike } from './ink';
import type { FlipKind } from '../../core/walls';
import type { ZoneBand } from '../../types/gex';

/*
==================================================
  SLAYER TERMINAL - STRIKE BARS (components/pinpoint/StrikeBars.tsx)
  The one picture Pinpoint is: dealer exposure by
  strike, with the market and its levels drawn on it.
==================================================

  Every competitor draws this chart and every one draws it the same way,
  because it is the right way: strikes down the side like a price ladder,
  a bar per strike growing out of a centre line, the sign of the bar
  saying which way the dealers lean, spot drawn across it so a reader
  sees at once what is above them and what is below. SpotGamma's, Unusual
  Whales', Gexbot's — all this shape. Ours adds the levels as WORDS on the
  picture (CALL WALL, PUT WALL, FLIP, SUPREME) so the reader is never
  matching a legend to a line, and it shades the zones the desk has read
  off the book so "friction" and "air pocket" are places on the chart,
  not rows in a table somewhere else.

  ── INK ──────────────────────────────────────────────────────────────────

  Bars wear the house heat ramp by sign (heatmap.ts — gold where the book
  amplifies, ice where it absorbs), the same ramp every grid in the
  section uses, so a gold bar here and a gold cell on the Heat desk are
  the same fact. The levels wear the level inks from gex/palette.

  ── GEOMETRY ─────────────────────────────────────────────────────────────

  Measured, not viewBox-scaled: text in a stretched SVG stretches with it.
  The container's width is read once per resize and the layout is done in
  pixels; the height is the rows' height, so a ±10 window is airy and a
  ±30 window is dense but every strike still has its own row and label.
*/

export interface BarRow {
  strike: number;
  /** The bar in net mode. */
  net: number;
  /** The two legs in split mode. */
  put: number;
  call: number;
  oi: number;
  volume: number;
}

export interface BarLevels {
  spot: number;
  flip: number | null;
  flipKind: FlipKind;
  callWall: number | null;
  putWall: number | null;
  supreme: number | null;
  /** Extra ticks on the left gutter — the pins. */
  ticks?: { price: number; label: string; ink: string }[];
}

interface StrikeBarsProps {
  /** Strikes DESCENDING — the top row is the highest strike. */
  rows: BarRow[];
  maxAbs: number;
  levels: BarLevels;
  zones?: ZoneBand[];
  split: boolean;
  /** Dollar formatter for the tooltip. */
  fmt: (v: number) => string;
  /** Distance-from-spot formatter for the tooltip. */
  fmtDist: (strike: number) => string;
  hoverStrike: number | null;
  selectedStrike: number | null;
  onHover: (strike: number | null) => void;
  onSelect: (strike: number) => void;
  /** What one bar means — the caption drawn under the chart. */
  caption?: ReactNode;
}

const GUTTER_L = 58;
const GUTTER_R = 112;

function rowHeightFor(n: number): number {
  if (n <= 21) return 26;
  if (n <= 31) return 22;
  if (n <= 41) return 17;
  return 13;
}

const rgb = (c: [number, number, number], a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

const StrikeBars = ({ rows, maxAbs, levels, zones = [], split, fmt, fmtDist, hoverStrike, selectedStrike, onHover, onSelect, caption }: StrikeBarsProps) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w && Math.abs(w - width) > 1) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width || 720);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rowH = rowHeightFor(rows.length);
  const padTop = 14;
  const height = padTop + rows.length * rowH + 10;
  const plotL = GUTTER_L;
  const plotR = Math.max(plotL + 120, width - GUTTER_R);
  const zeroX = (plotL + plotR) / 2;
  const half = (plotR - plotL) / 2 - 6;
  const scale = maxAbs > 0 ? half / maxAbs : 0;

  const yOf = (i: number) => padTop + i * rowH + rowH / 2;
  /** Interpolated y for any price, off the descending strike grid. */
  const yAt = useMemo(() => {
    return (price: number): number | null => {
      if (rows.length === 0) return null;
      if (price >= rows[0].strike) return yOf(0) - Math.min(rowH / 2, ((price - rows[0].strike) / Math.max(1e-9, rows[0].strike - (rows[1]?.strike ?? rows[0].strike - 1))) * rowH);
      const last = rows.length - 1;
      if (price <= rows[last].strike) return yOf(last) + Math.min(rowH / 2, ((rows[last].strike - price) / Math.max(1e-9, (rows[last - 1]?.strike ?? rows[last].strike + 1) - rows[last].strike)) * rowH);
      for (let i = 0; i < last; i++) {
        const hi = rows[i].strike;
        const lo = rows[i + 1].strike;
        if (price <= hi && price >= lo) {
          const t = hi === lo ? 0 : (hi - price) / (hi - lo);
          return yOf(i) + t * rowH;
        }
      }
      return null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, rowH]);

  const hovered = hoverStrike != null ? rows.find(r => r.strike === hoverStrike) : undefined;
  const hoverIdx = hovered ? rows.indexOf(hovered) : -1;

  const flipOn = levels.flip !== null && levels.flipKind !== 'no-crossing';
  const spotY = yAt(levels.spot);
  const flipY = levels.flip !== null ? yAt(levels.flip) : null;

  const levelTag = (price: number | null, label: string, ink: string, dy = 0) => {
    if (price === null) return null;
    const y = yAt(price);
    if (y === null) return null;
    return (
      <g key={label} transform={`translate(${plotR + 6}, ${y + dy})`}>
        <rect x={0} y={-7} width={GUTTER_R - 10} height={14} rx={3} fill={`${ink}22`} stroke={`${ink}88`} />
        <text x={(GUTTER_R - 10) / 2} y={3.5} textAnchor="middle" fontSize={8.5} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontWeight={700} fill={ink} letterSpacing={0.6}>
          {label} {fmtStrike(price)}
        </text>
      </g>
    );
  };

  const aria = `${split ? 'Put and call' : 'Net'} dealer exposure by strike, ${rows.length} strikes from ${fmtStrike(rows[0]?.strike ?? 0)} to ${fmtStrike(rows[rows.length - 1]?.strike ?? 0)}. Spot ${fmtStrike(levels.spot)}` +
    (levels.callWall !== null ? `, call wall ${fmtStrike(levels.callWall)}` : '') +
    (levels.putWall !== null ? `, put wall ${fmtStrike(levels.putWall)}` : '') +
    (levels.flip !== null ? `, ${flipOn ? 'flip' : 'nearest to zero'} ${fmtStrike(levels.flip)}` : ', no flip on the grid') +
    '.';

  return (
    <div ref={hostRef} className="relative w-full select-none" onMouseLeave={() => onHover(null)}>
      <svg width={width} height={height} role="img" aria-label={aria} className="block" data-strike-bars>
        {/* zones */}
        {zones.map((z, i) => {
          const top = yAt(z.from);
          const bot = yAt(z.to);
          if (top === null || bot === null) return null;
          const w = ZONE_WORDS[z.kind];
          return (
            <g key={`${z.kind}-${i}`}>
              <rect x={plotL} y={top - rowH / 2} width={plotR - plotL} height={bot - top + rowH} fill={w.fill} />
              <text x={plotL + 4} y={top - rowH / 2 + 9} fontSize={8} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fill={w.ink} letterSpacing={0.8} opacity={0.9}>
                {w.label.toUpperCase()}
              </text>
            </g>
          );
        })}

        {/* row hover / selection wash */}
        {hoverIdx >= 0 && <rect x={0} y={yOf(hoverIdx) - rowH / 2} width={width} height={rowH} fill="rgba(255,255,255,0.05)" />}
        {selectedStrike != null && rows.some(r => r.strike === selectedStrike) && (
          <rect x={0} y={yOf(rows.findIndex(r => r.strike === selectedStrike)) - rowH / 2} width={width} height={rowH} fill="rgba(210,255,0,0.06)" stroke="rgba(210,255,0,0.35)" />
        )}

        {/* centre line */}
        <line x1={zeroX} x2={zeroX} y1={padTop - 4} y2={height - 6} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />

        {/* bars */}
        {rows.map((r, i) => {
          const y = yOf(i);
          const bh = Math.max(3, rowH - (rowH > 16 ? 8 : 4));
          const legs = split
            ? [
                { v: r.put, off: -bh / 4, h: bh / 2 },
                { v: r.call, off: bh / 4, h: bh / 2 },
              ]
            : [{ v: r.net, off: 0, h: bh }];
          const dim = hoverIdx >= 0 && hoverIdx !== i ? 0.55 : 1;
          return (
            <g key={r.strike} data-strike={r.strike} data-net={r.net} onMouseEnter={() => onHover(r.strike)} onClick={() => onSelect(r.strike)} style={{ cursor: 'pointer' }}>
              <rect x={0} y={y - rowH / 2} width={width} height={rowH} fill="transparent" />
              <text x={GUTTER_L - 8} y={y + 3.5} textAnchor="end" fontSize={rowH >= 22 ? 10.5 : 9} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fill={r.strike === selectedStrike ? '#D2FF00' : hoverIdx === i ? '#ededed' : '#a3a3a3'} fontWeight={hoverIdx === i || r.strike === selectedStrike ? 700 : 500}>
                {fmtStrike(r.strike)}
              </text>
              {legs.map((leg, k) => {
                const len = Math.abs(leg.v) * scale;
                const c = heatRgb(leg.v, maxAbs);
                return (
                  <rect
                    key={k}
                    x={leg.v >= 0 ? zeroX : zeroX - len}
                    y={y - bh / 2 + (leg.off + bh / 2 - leg.h / 2)}
                    width={Math.max(len, leg.v === 0 ? 0 : 1.5)}
                    height={leg.h}
                    rx={1.5}
                    fill={rgb(c, dim)}
                  />
                );
              })}
            </g>
          );
        })}

        {/* flip */}
        {flipY !== null && (
          <g>
            <line x1={plotL - 4} x2={plotR + 4} y1={flipY} y2={flipY} stroke={FLIP} strokeWidth={flipOn ? 1.5 : 1} strokeDasharray={levels.flipKind === 'sole' ? undefined : levels.flipKind === 'nearest-of-several' ? '6 3' : '2 3'} opacity={flipOn ? 1 : 0.8} />
          </g>
        )}
        {/* spot */}
        {spotY !== null && (
          <g>
            <line x1={plotL - 4} x2={plotR + 4} y1={spotY} y2={spotY} stroke={SPOT} strokeWidth={1.5} />
            <line x1={plotL - 4} x2={plotR + 4} y1={spotY} y2={spotY} stroke="rgba(237,237,237,0.25)" strokeWidth={6} />
          </g>
        )}

        {/* left-gutter ticks: the pins */}
        {(levels.ticks ?? []).map(t => {
          const y = yAt(t.price);
          if (y === null) return null;
          return (
            <g key={t.label}>
              <line x1={2} x2={9} y1={y} y2={y} stroke={t.ink} strokeWidth={2} />
              <title>{`${t.label} ${fmtStrike(t.price)}`}</title>
            </g>
          );
        })}

        {/* right-gutter tags */}
        {levelTag(levels.callWall, 'CALL WALL', CALL_WALL, levels.callWall !== null && Math.abs((yAt(levels.callWall) ?? 0) - (spotY ?? -99)) < 8 ? -8 : 0)}
        {levelTag(levels.putWall, 'PUT WALL', PUT_WALL, levels.putWall !== null && Math.abs((yAt(levels.putWall) ?? 0) - (spotY ?? -99)) < 8 ? 8 : 0)}
        {levels.supreme !== null && levels.supreme !== levels.callWall && levels.supreme !== levels.putWall && levelTag(levels.supreme, 'SUPREME', SUPREME)}
        {levels.flip !== null && levelTag(levels.flip, flipOn ? 'FLIP' : '≈ ZERO', FLIP, Math.abs((flipY ?? 0) - (spotY ?? -99)) < 8 ? -8 : 0)}
        {levelTag(levels.spot, 'SPOT', SPOT, levels.flip !== null && Math.abs((flipY ?? 0) - (spotY ?? -99)) < 8 ? 8 : 0)}
      </svg>

      {/* tooltip */}
      {hovered && hoverIdx >= 0 && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-borderMuted bg-[#0d0d0d]/95 px-2.5 py-2 shadow-xl"
          style={{ left: Math.min(width - 190, Math.max(GUTTER_L, zeroX + 12)), top: Math.max(0, yOf(hoverIdx) - 40) }}
          data-strike-tooltip
        >
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[12px] font-bold text-textPrimary tnum">{fmtStrike(hovered.strike)}</span>
            <span className="font-mono text-[10px] text-textMuted tnum">{fmtDist(hovered.strike)}</span>
          </div>
          <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[10px] tnum">
            <span className="text-textMuted">net</span>
            <span className="text-textPrimary text-right font-semibold">{fmt(hovered.net)}</span>
            <span className="text-textMuted">puts</span>
            <span className="text-right" style={{ color: rgb(heatRgb(Math.abs(hovered.put) || 1, 1)) }}>{fmt(hovered.put)}</span>
            <span className="text-textMuted">calls</span>
            <span className="text-right" style={{ color: rgb(heatRgb(-(Math.abs(hovered.call) || 1), 1)) }}>{fmt(hovered.call)}</span>
            <span className="text-textMuted">OI · vol</span>
            <span className="text-textSecondary text-right">{hovered.oi.toLocaleString('en-US')} · {hovered.volume.toLocaleString('en-US')}</span>
          </div>
        </div>
      )}

      {caption && <div className="px-1 pt-1.5 text-[10px] text-textMuted leading-snug">{caption}</div>}
    </div>
  );
};

export default StrikeBars;
