import { Fragment, type ReactNode } from 'react';
import { heatInk } from '../gex/heatmap';
import { INK, LONG_GAMMA, SELECT, SHORT_GAMMA, ZONE_WORDS, fmtStrike } from './ink';
import { useSize } from './Desk';
import type { ZoneKind } from '../../types/gex';

/*
==================================================
  SLAYER TERMINAL - THE STRIKE PROFILE (components/pinpoint/StrikeProfile.tsx)
  The one picture most of the section draws: exposure by strike.
==================================================

  Strikes down the left, a centre line, bars to either side of it. Right
  of centre the book amplifies a move, left of it absorbs one, in the
  house heat inks — bars and cells are the only place those inks go.

  THE LEVELS ARE RULES, NOT BOXES. Noah: "i dont want call wall and put
  wall everywhere". A level is a hairline across the picture and a
  two-letter tag in the right gutter, in the level's ink, once. Zones are
  washes with no words in them; their names are in the inspector.

  ONE COMPONENT, FOUR SHAPES:
    diverge   one or more series on a shared centre — Levels, Drift (now
              bright, then dim), Flow, Holders' ladder, Targets
    columns   N series side by side, each on its own peak — Exposure's five
    mirror    two series back to back on one axis — Compare

  It draws itself to the box it is given and scrolls inside it only if the
  strikes outrun the height. Every row is a tab stop; the read-out beside
  the picture follows the pointer and the keyboard alike.
*/

export interface ProfileSeries {
  key: string;
  label?: string;
  /** `heat` colours by sign on the house ramp; `sign` by sign on the direction pair; a string is a fixed ink. */
  ink?: 'heat' | 'sign' | string;
  /** `thin` draws at 40% row height — the "then" of a now/then pair. */
  weight?: 'full' | 'thin';
  /** Mirror mode: which side of the axis this series grows to. */
  side?: 'left' | 'right';
  /** Columns mode: the peak this column is scaled to, signed. */
  peak?: number;
  peakStrike?: number;
  unit?: string;
}

export interface ProfileRow {
  strike: number;
  values: Record<string, number>;
  /** A word beside the strike — a rank, a tag. */
  tag?: ReactNode;
  ink?: string;
}

export type LevelKind = 'spot' | 'flip' | 'call-wall' | 'put-wall' | 'supreme' | 'pin' | 'max-pain' | 'custom';

export interface ProfileLevel {
  kind: LevelKind;
  price: number;
  /** Two to five characters. */
  tag: string;
  ink: string;
  dashed?: boolean;
}

export interface ProfileZone {
  from: number;
  to: number;
  kind: ZoneKind;
}

interface Props {
  /** Strikes DESCENDING. */
  rows: ProfileRow[];
  series: ProfileSeries[];
  /** Shared scale for diverge and mirror; columns scale each to its own peak. */
  maxAbs?: number;
  mode?: 'diverge' | 'columns' | 'mirror';
  levels?: ProfileLevel[];
  zones?: ProfileZone[];
  fmt: (v: number) => string;
  /** Print each bar's figure at its end. Off where the rows are dense. */
  figures?: boolean;
  hoverStrike?: number | null;
  onHover?: (strike: number | null) => void;
  selectedStrike?: number | null;
  onSelect?: (strike: number) => void;
  /** Which series the reader is here for; the others recede. */
  lead?: string;
  /** Diverge mode: draw the series end to end rather than over each other — a bar made of parts. */
  stack?: boolean;
  /** How a row is labelled; strikes by default. */
  fmtRow?: (strike: number) => string;
  /**
   * ══ FIT: AS MANY ROWS AS THE BOX HAS ROOM FOR ═══════════════════════════
   *
   * The board's opening span (Noah: "you see how full on the screen and
   * how well everything fits?"), carried to every ladder. Given a price,
   * the profile draws the slice of `rows` its own measured box holds at a
   * readable row height, centred on that price — no scroll, no strip of
   * nothing at the foot, and a taller monitor is more strikes rather than
   * taller bars. Without it, every row given is drawn and the row height
   * gives way.
   */
  fitAround?: number;
  ariaLabel: string;
  className?: string;
}

/** The row height FIT aims for — a bar with air, the table's own 29
    less the strip a ladder does not carry. */
export const ROW_FIT = 22;

/** The rows a box this tall holds at the fit height, floored so a short
    box is still a ladder. */
export const fitCount = (h: number, header = 0): number => Math.max(7, Math.floor((h - header) / ROW_FIT));

/** The slice of `rows` (descending) that fits, centred on `around`. */
export function fitSlice<T extends { strike: number }>(rows: T[], n: number, around: number): T[] {
  if (n >= rows.length) return rows;
  let mid = 0;
  let best = Infinity;
  for (let i = 0; i < rows.length; i++) {
    const d = Math.abs(rows[i].strike - around);
    if (d < best) {
      best = d;
      mid = i;
    }
  }
  const lo = Math.max(0, Math.min(rows.length - n, mid - Math.floor((n - 1) / 2)));
  return rows.slice(lo, lo + n);
}

const GUTTER_L = 48;
const ROW_MIN = 11;
const ROW_MAX = 26;
const HEADER = 30;
/* Mono at 9px is ~5.5px a glyph. The right gutter is measured rather than
   guessed: a level tag that outruns it lands on the figure at the end of a
   bar, which is exactly the collision the levels were moved out there to
   avoid. */
const TAG_CH = 5.6;
/* And the same arithmetic for the figure printed at a bar's end: a bar
   allowed to run to within 44px of the gutter put an eight-digit figure
   on top of the row's own tag. */
const FIGURE_W = 56;

const inkFor = (s: ProfileSeries, v: number): string =>
  s.ink === 'heat' || s.ink === undefined ? (v >= 0 ? heatInk.pos : heatInk.neg) : s.ink === 'sign' ? (v >= 0 ? LONG_GAMMA : SHORT_GAMMA) : s.ink;

const StrikeProfile = ({
  rows,
  series,
  maxAbs = 1,
  mode = 'diverge',
  levels = [],
  zones = [],
  fmt,
  figures = false,
  hoverStrike = null,
  onHover,
  selectedStrike = null,
  onSelect,
  lead,
  stack = false,
  fmtRow = fmtStrike,
  fitAround,
  ariaLabel,
  className = '',
}: Props) => {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const header0 = mode === 'columns' ? HEADER : 0;
  /* Under FIT the rows are the box's, not the caller's — see `fitAround`.
     Before the box is measured (h = 0) the floor applies, and the first
     measured frame replaces it. */
  rows = fitAround !== undefined && h > 0 ? fitSlice(rows, fitCount(h, header0), fitAround) : rows;
  const n = rows.length;
  /* The row nearest spot, for the `s` key — the board's key, the same here. */
  const spotAt = levels.find(l => l.kind === 'spot')?.price;
  const spotRow = spotAt === undefined || n === 0 ? null : rows.reduce((b, r) => (Math.abs(r.strike - spotAt) < Math.abs(b.strike - spotAt) ? r : b)).strike;
  const rowTagW = rows.some(r => r.tag !== undefined) ? 30 : 0;
  const levelTagW = levels.length ? Math.max(...levels.map(l => l.tag.length)) * TAG_CH + 6 : 0;
  const GUTTER_R = Math.max(16, rowTagW + levelTagW + 6);
  const header = mode === 'columns' ? HEADER : 0;
  const rowH = n ? Math.max(ROW_MIN, Math.min(ROW_MAX, Math.floor((h - header) / n))) : ROW_MIN;
  const H = Math.max(h, header + n * rowH);
  const plotL = GUTTER_L;
  const plotR = Math.max(plotL + 40, w - GUTTER_R);
  const plotW = plotR - plotL;
  const yOf = (i: number) => header + i * rowH;
  /** The y of a price, between the rows it falls between. */
  const yAt = (price: number): number | null => {
    if (!n) return null;
    if (price >= rows[0].strike) return price > rows[0].strike + (rows[0].strike - (rows[1]?.strike ?? rows[0].strike - 1)) ? null : yOf(0) + rowH / 2;
    for (let i = 0; i < n - 1; i++) {
      const hi = rows[i].strike;
      const lo = rows[i + 1].strike;
      if (price <= hi && price >= lo) return yOf(i) + rowH / 2 + ((hi - price) / (hi - lo)) * rowH;
    }
    return price >= rows[n - 1].strike - 1 ? yOf(n - 1) + rowH / 2 : null;
  };

  /*
    FIVE LANES DO NOT FIT A PHONE. At 390 the columns were 30px wide: the
    bars were slivers, no figure could be printed beside them, and the peak
    captions ran into each other. So below a measured width the picture
    draws the ONE exposure the reader picked, full width — the other four
    are a tap away on the same control that chose this one.
  */
  const narrow = mode === 'columns' && plotW < 520;
  const drawn = narrow ? series.filter(s => s.key === lead).concat(series.filter(s => s.key === lead).length ? [] : series.slice(0, 1)) : series;
  /* Columns: each series gets a lane with its own centre and scale. */
  const lanes = mode === 'columns' && !narrow ? drawn.length : 1;
  const laneGap = 12;
  const laneW = (plotW - laneGap * (lanes - 1)) / lanes;
  const laneX = (k: number) => plotL + k * (laneW + laneGap);

  const barH = Math.max(3, rowH - Math.max(2, Math.round(rowH * 0.28)));
  const labelSize = rowH >= 14 ? 10 : 9;
  const showFigures = figures && rowH >= 12 && (mode !== 'columns' || narrow || laneW >= 120);

  /* Tags in the right gutter: nudge apart when two levels share a row. */
  const tagYs: number[] = [];
  const placeTag = (y: number) => {
    let ty = y;
    for (let tries = 0; tries < 6; tries++) {
      if (!tagYs.some(o => Math.abs(o - ty) < 11)) break;
      ty += 11;
    }
    tagYs.push(ty);
    return ty;
  };

  return (
    <div ref={ref} className={`relative flex-1 min-h-0 overflow-auto ${className}`} onMouseLeave={() => onHover?.(null)} data-strike-profile data-mode={narrow ? 'diverge' : mode} data-columns={narrow ? 1 : lanes}>
      {w > 0 && n > 0 && (
        <svg width={w} height={H} role="img" aria-label={ariaLabel} className="block select-none">
          {/* zones — washes behind everything, no words */}
          {zones.map((z, i) => {
            const y0 = yAt(z.from + 0.5) ?? yAt(z.from);
            const y1 = yAt(z.to - 0.5) ?? yAt(z.to);
            if (y0 === null || y1 === null) return null;
            return <rect key={i} x={plotL} y={Math.min(y0, y1)} width={plotW} height={Math.abs(y1 - y0)} fill={ZONE_WORDS[z.kind].fill} data-zone={z.kind} />;
          })}

          {/* column headers */}
          {mode === 'columns' &&
            drawn.map((s, k) => (
              <g key={s.key} data-column={s.key} data-lead={s.key === lead || undefined}>
                <text x={laneX(k) + laneW / 2} y={11} textAnchor="middle" fontSize={10} fontFamily="ui-monospace, monospace" fontWeight={600} letterSpacing="0.1em" fill={s.key === lead ? INK.primary : INK.secondary}>
                  {(s.label ?? s.key).toUpperCase()}
                </text>
                {s.peak !== undefined && (narrow || laneW >= 100) && (
                  <text x={laneX(k) + laneW / 2} y={23} textAnchor="middle" fontSize={9} fontFamily="ui-monospace, monospace" fill={INK.muted} data-peak-label>
                    {fmt(s.peak)}
                    {s.peakStrike !== undefined ? ` @ ${fmtStrike(s.peakStrike)}` : ''}
                  </text>
                )}
              </g>
            ))}

          {/* centre lines */}
          {!stack &&
            Array.from({ length: lanes }, (_, k) => {
              const cx = mode === 'mirror' ? plotL + plotW / 2 : laneX(k) + laneW / 2;
              return <line key={k} x1={cx} x2={cx} y1={header} y2={H} stroke={INK.rule} strokeWidth={1} />;
            })}

          {/* rows */}
          {rows.map((r, i) => {
            const y = yOf(i);
            const hover = hoverStrike === r.strike;
            const sel = selectedStrike === r.strike;
            return (
              <g
                key={r.strike}
                data-strike={r.strike}
                tabIndex={0}
                role="button"
                aria-label={`${fmtRow(r.strike)}: ${series.map(s => `${s.label ?? s.key} ${fmt(r.values[s.key] ?? 0)}`).join(', ')}`}
                onFocus={() => onHover?.(r.strike)}
                onMouseEnter={() => onHover?.(r.strike)}
                onClick={() => onSelect?.(r.strike)}
                onKeyDown={e => {
                  /* The board's keys: Enter holds, ↑↓ walk the ladder, s
                     goes to spot, Esc lets go. */
                  const g = e.currentTarget;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect?.(r.strike);
                  } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    const next = e.key === 'ArrowUp' ? g.previousElementSibling : g.nextElementSibling;
                    if (next instanceof SVGGElement && next.hasAttribute('data-strike')) next.focus();
                  } else if (e.key === 's' && spotRow !== null) {
                    e.preventDefault();
                    const at = g.parentElement?.querySelector<SVGGElement>(`[data-strike="${spotRow}"]`);
                    at?.focus();
                  } else if (e.key === 'Escape') {
                    onHover?.(null);
                    g.blur();
                  }
                }}
                style={{ cursor: onSelect ? 'pointer' : 'default', outline: 'none' }}
              >
                <rect x={0} y={y} width={w} height={rowH} fill={sel ? 'rgba(210,255,0,0.06)' : hover ? 'rgba(255,255,255,0.045)' : 'transparent'} />
                <text x={plotL - 6} y={y + rowH / 2 + labelSize * 0.36} textAnchor="end" fontSize={labelSize} fontFamily="ui-monospace, monospace" fontWeight={r.ink ? 700 : 400} fill={r.ink ?? (hover || sel ? INK.primary : INK.muted)}>
                  {fmtRow(r.strike)}
                </text>
                {(() => { let acc = 0; return drawn.map((s, k) => {
                  const v = r.values[s.key] ?? 0;
                  const scale = mode === 'columns' ? Math.abs(s.peak ?? maxAbs) || 1 : maxAbs || 1;
                  /* A STACK GROWS FROM THE LEFT EDGE, not from the centre.
                     Its parts are all positive — a rank is not signed — so a
                     centre line would leave half the picture empty and halve
                     the length that carries the comparison. */
                  const half = stack ? plotW - 8 : (mode === 'mirror' ? plotW / 2 : laneW / 2) - (showFigures ? FIGURE_W : 6);
                  const len = Math.min(half, (Math.abs(v) / scale) * half);
                  const cx = stack ? plotL : mode === 'mirror' ? plotL + plotW / 2 : laneX(mode === 'columns' ? k : 0) + laneW / 2;
                  const toLeft = stack ? false : mode === 'mirror' ? s.side === 'left' : v < 0;
                  const x0 = stack ? cx + acc : cx;
                  const x = toLeft ? x0 - len : x0;
                  if (stack) acc += len;
                  const bh = s.weight === 'thin' ? Math.max(2, Math.round(barH * 0.4)) : barH;
                  const by = y + (rowH - barH) / 2 + (s.weight === 'thin' ? barH - bh : 0);
                  const dim = lead !== undefined && s.key !== lead;
                  const isPeak = mode === 'columns' && s.peakStrike === r.strike;
                  return (
                    <Fragment key={s.key}>
                      {len > 0 && <rect x={x} y={by} width={Math.max(1, len)} height={bh} fill={inkFor(s, v)} opacity={dim ? 0.45 : s.weight === 'thin' ? 0.55 : 1} data-series={s.key} />}
                      {isPeak && <rect x={toLeft ? x - 3 : x + len} y={y + 1} width={3} height={rowH - 2} fill={INK.primary} data-peak={s.key} />}
                      {showFigures && (mode !== 'diverge' || k === 0) && (
                        <text x={toLeft ? x - 4 : x + len + 4} y={y + rowH / 2 + labelSize * 0.36} textAnchor={toLeft ? 'end' : 'start'} fontSize={labelSize} fontFamily="ui-monospace, monospace" fill={hover || sel ? INK.primary : dim ? INK.muted : INK.secondary} data-figure>
                          {fmt(v)}
                        </text>
                      )}
                    </Fragment>
                  );
                }); })()}
                {r.tag && (
                  <text x={plotR + 4} y={y + rowH / 2 + labelSize * 0.36} fontSize={Math.min(labelSize, 10)} fontFamily="ui-monospace, monospace" fontWeight={700} fill={r.ink ?? INK.secondary}>
                    {r.tag}
                  </text>
                )}
              </g>
            );
          })}

          {/* levels — a rule and a tag, once */}
          {levels.map(l => {
            const y = yAt(l.price);
            if (y === null) return null;
            const ty = placeTag(y);
            return (
              <g key={`${l.kind}-${l.tag}-${l.price}`} data-level={l.kind} data-price={l.price} pointerEvents="none">
                <line x1={plotL} x2={plotR} y1={y} y2={y} stroke={l.ink} strokeWidth={l.kind === 'spot' ? 1.5 : 1} strokeDasharray={l.dashed ? '3 3' : undefined} opacity={l.kind === 'spot' ? 0.9 : 0.75} />
                <text x={w - 2} y={ty + 3.5} textAnchor="end" fontSize={9} fontFamily="ui-monospace, monospace" fontWeight={700} letterSpacing="0.06em" fill={l.ink}>
                  {l.tag}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {selectedStrike !== null && (
        <span className="sr-only" data-selected-strike={selectedStrike}>
          {fmtStrike(selectedStrike)} selected
        </span>
      )}
      <span className="sr-only" style={{ color: SELECT }} />
    </div>
  );
};

export default StrikeProfile;
