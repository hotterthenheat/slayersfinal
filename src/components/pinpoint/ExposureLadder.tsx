import { Fragment, type ReactNode } from 'react';
import { ROW_INTERACTIVE, interactiveRowProps } from '../ui/interactiveRow';
import { INK, SPOT, fmtStrike } from './ink';
import { heatInk } from '../gex/heatmap';

/*
==================================================
  SLAYER TERMINAL - THE COMB (components/pinpoint/ExposureLadder.tsx)
  Five exposures down one strike axis, and whether they agree.
==================================================

  ── WHY THE HEAT MAP WENT ─────────────────────────────────────────────────

  Noah: "heatmaps stem from skylit and i want something different." He is
  right about the provenance. Measuring it turned up something worse.

  THE SECOND AXIS CARRIED NOTHING. The grid was strike × expiry. Measured
  across SPY, QQQ and NVDA at ±20: the 0DTE share of a strike's exposure is
  31.95% at EVERY strike, on every name, spread 0.00. The engine scales each
  expiry by one factor across the whole chain, so value(strike, expiry) is
  f(strike) × g(expiry) — a rank-one surface. Two hundred and forty cells
  were being drawn to carry forty-one numbers and one global ratio.

  That is not a colour problem, and re-drawing the same matrix as stacked
  bars — which was this file's first attempt — inherits it exactly: every
  bar came out with the same banding, because every bar HAS the same
  banding. A picture cannot show a difference the data does not contain.

  THE ENCODING WAS ALSO WRONG. A heat map spends colour, its one strong
  channel, on magnitude — the thing colour is worst at. Nobody reads "how
  much bigger is this cell" off a saturation. So the figures went back into
  the cells to compensate, and at that point the grid was a table with a
  wash on it.

  ── WHAT THE DATA ACTUALLY HAS ───────────────────────────────────────────

  The five exposures disagree about where the book is heavy, and strongly.
  Correlation of |metric| against |gamma| across strikes, same three names:

      GEX   1.00        (it is itself)
      VEX   0.97 · 0.95 · 0.72
      VANNA 0.54 · 0.63 · 0.83
      CHARM 0.55 · 0.63 · 0.84
      DEX  −0.23 · −0.13 · 0.11      ← essentially unrelated

  And they peak at different strikes: on SPY, gamma at 500, vanna and charm
  at 495, delta at 490. THE STRIKE THAT PINS IS NOT THE STRIKE THE BOOK IS
  LEANING ON, and that is a fact a desk should be able to see in one glance
  rather than by switching a control five times and remembering.

  ── SO: SMALL MULTIPLES DOWN ONE AXIS ────────────────────────────────────

  Five narrow profiles sharing the strike ladder every desk in this section
  uses. Length is magnitude, side is sign, and each column carries its own
  peak marker so the eye can run down the row of peaks and see whether they
  line up.

    LENGTH  magnitude — position on a common scale is the most accurately
            read channel there is, and colour is the least.
    SIDE    sign. Absorbing left of a column's line, amplifying right.
    TICK    that column's own heaviest strike.

  EACH COLUMN IS NORMALISED TO ITS OWN PEAK, and that is forced rather than
  chosen: these are dollars per 1% move, dollars of underlying, dollars per
  vol point, delta dollars per vol point and delta dollars per day. There is
  no shared axis they could honestly sit on. So the shape is comparable, the
  magnitude is not, and the column header prints the peak it was scaled to
  so the reader is never guessing what full width means.

  ── WHY IT IS NOT LEVELS' CHART ───────────────────────────────────────────

  StrikeBars draws ONE metric for the whole book with the levels written on
  it — "where are the walls". This draws five at once and answers a question
  a single profile cannot ask: do they agree? Levels is the answer; this is
  the engine.
*/

export interface CombMetric {
  key: string;
  label: string;
  unit: string;
  /** The heaviest value in this column — its full width. Signed, because
      "peak $951M" and "peak −$951M" are opposite facts about the book and
      the header is the only place the column's magnitude is stated. */
  peak: number;
  /** The strike that peak sits at. */
  peakStrike: number;
}

export interface CombRow {
  strike: number;
  values: Record<string, number>;
  /** Ink for the strike label — a wall, a flip, a level the row is. */
  ink?: string;
  tag?: ReactNode;
  title?: string;
}

interface Props {
  rows: CombRow[];
  /** Strikes DESCENDING. */
  metrics: CombMetric[];
  spot: number;
  fmt: (v: number) => string;
  /** The metric the rail has selected. Drawn at full ink; the rest recede. */
  lead?: string;
  hoverStrike?: number | null;
  onHover?: (strike: number | null) => void;
  onSelect?: (strike: number) => void;
  selectedStrike?: number | null;
  className?: string;
  /**
   * Off when the picture meets a panel's own edge. A bordered grid inside a
   * bordered panel is two boxes drawn around one thing, and the inner one
   * always reads as a mistake.
   */
  bordered?: boolean;
}

const ExposureLadder = ({
  rows,
  metrics,
  spot,
  fmt,
  lead,
  hoverStrike = null,
  onHover,
  onSelect,
  selectedStrike = null,
  className = '',
  bordered = true,
}: Props) => {
  const spotAfter = rows.findIndex(r => r.strike < spot);

  return (
    <div className={`${bordered ? 'border border-borderSubtle rounded-md' : ''} overflow-auto ${className}`} onMouseLeave={() => onHover?.(null)}>
      <table className="w-full border-separate border-spacing-0 table-fixed" data-exposure-comb>
        <colgroup>
          <col style={{ width: 78 }} />
          {metrics.map(m => (
            <col key={m.key} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-canvas">
          <tr>
            <th scope="col" className="text-left font-mono text-label uppercase text-textMuted font-normal px-2 py-2 border-b border-borderSubtle align-bottom">
              Strike
            </th>
            {metrics.map(m => {
              const on = m.key === lead;
              return (
                <th
                  key={m.key}
                  scope="col"
                  className="px-2 py-2 border-b border-borderSubtle align-bottom"
                  title={`${m.label} — ${m.unit}. Scaled to its own heaviest strike, ${fmtStrike(m.peakStrike)} at ${fmt(m.peak)}.`}
                  data-comb-col={m.key}
                  data-lead={on || undefined}
                >
                  <span
                    className={`block font-mono text-label uppercase font-semibold ${on ? 'text-textPrimary' : 'text-textSecondary'}`}
                  >
                    {m.label}
                  </span>
                  {/* The peak IS the axis. Without it a full-width bar means
                      nothing, and with it every column is readable in its own
                      unit without pretending they share one. */}
                  <span className="block font-mono text-label tnum text-textMuted normal-case tracking-normal">
                    peak {fmt(m.peak)} @ {fmtStrike(m.peakStrike)}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const hover = hoverStrike === r.strike;
            const sel = selectedStrike === r.strike;
            return (
              <Fragment key={r.strike}>
                {i === spotAfter && (
                  <tr key={`spot-${r.strike}`} aria-hidden data-spot-rule>
                    <td
                      className="px-2 py-0 text-right font-mono text-label font-bold whitespace-nowrap"
                      style={{ color: SPOT }}
                    >
                      {fmtStrike(spot)}
                    </td>
                    <td colSpan={metrics.length} className="p-0">
                      <div className="h-0.5 my-1" style={{ background: SPOT }} />
                    </td>
                  </tr>
                )}
                <tr
                  {...(onSelect ? interactiveRowProps(() => onSelect(r.strike), sel, 'native') : {})}
                  onMouseEnter={() => onHover?.(r.strike)}
                  onFocus={() => onHover?.(r.strike)}
                  onClick={() => onSelect?.(r.strike)}
                  title={r.title}
                  data-strike-row={r.strike}
                  className={`${onSelect ? ROW_INTERACTIVE : ''} ${hover ? 'bg-white/[0.04]' : ''} ${sel ? 'bg-select/[0.06]' : ''}`}
                >
                  <td
                    className="px-2 py-1 font-mono text-label tracking-normal tnum whitespace-nowrap border-b border-borderSubtle/40"
                    style={{ color: r.ink ?? (hover ? INK.primary : INK.secondary) }}
                  >
                    <span className={r.ink ? 'font-bold' : 'font-normal'}>{fmtStrike(r.strike)}</span>
                    {r.tag && <span className="ml-2 align-middle">{r.tag}</span>}
                  </td>
                  {metrics.map(m => {
                    const v = r.values[m.key] ?? 0;
                    const w = Math.min(50, (Math.abs(v) / (Math.abs(m.peak) || 1)) * 50);
                    const pos = v >= 0;
                    const isPeak = r.strike === m.peakStrike;
                    const on = m.key === lead;
                    return (
                      <td
                        key={m.key}
                        className="px-2 py-1 border-b border-borderSubtle/40"
                        title={`${fmtStrike(r.strike)} · ${m.label} ${fmt(v)} (${m.unit})`}
                        data-comb-cell={m.key}
                      >
                        <span className="flex items-center gap-2">
                        <span className="relative flex items-center h-[12px] flex-1 min-w-0">
                          <span className="absolute inset-y-0 left-1/2 w-px bg-borderMuted" />
                          <span
                            className="absolute inset-y-[1px]"
                            style={{
                              left: pos ? '50%' : `${50 - w}%`,
                              width: `${w}%`,
                              background: pos ? heatInk.pos : heatInk.neg,
                              /* The unselected columns recede rather than
                                 disappear: the comparison across columns is
                                 the whole point, so they must stay readable —
                                 the rail chooses a lead, it does not hide the
                                 other four. */
                              opacity: on ? 1 : 0.55,
                            }}
                          />
                          {/* The column's own heaviest strike. A reader runs
                              their eye down the five ticks; if they are on
                              different rows, the greeks disagree about where
                              the book is, which is the read this picture
                              exists for. */}
                          {isPeak && (
                            <span
                              className="absolute inset-y-0"
                              style={{ left: pos ? `calc(50% + ${w}% - 3px)` : `calc(${50 - w}% )`, width: 3, background: INK.primary }}
                              aria-hidden
                              data-comb-peak={m.key}
                            />
                          )}
                        </span>
                        {/*
                          THE FIGURE IS ON THE PICTURE, NOT BEHIND IT.

                          Noah: "i want the info to be displayed with out a
                          overlay". The first cut put every value in the
                          cell's `title`, so reading one number meant hovering
                          and reading two meant hovering twice — a workstation
                          that hides its own data behind a tooltip. The bar
                          answers "how much, roughly, and which way" at a
                          glance; the figure answers "exactly how much" without
                          the reader having to ask for it. The tooltip stays
                          for the unit and the full precision.
                        */}
                        <span
                          className={`hidden sm:block shrink-0 w-[62px] text-right font-mono text-label tracking-normal tnum ${
                            hover || sel ? 'text-textPrimary' : on ? 'text-textSecondary' : 'text-textMuted'
                          }`}
                        >
                          {fmt(v)}
                        </span>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ExposureLadder;
