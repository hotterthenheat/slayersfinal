import { useEffect, useRef, useState } from 'react';
import { ascendingSpotIndex, barGap, labelStride, layoutBand, spotX } from './strikeBand';
import { BULL, PUT_WALL, SPOT } from './palette';
import { fmtUsd } from '../../data/gex';
import type { ExposureProfileData } from '../../types/gex';

/*
==================================================
  SLAYER TERMINAL - EXPOSURE BY STRIKE, AS A BAND
  (components/gex/StrikeExposureBand.tsx)

  The reference's "Net Delta Exposure By Strike":
  strike along the bottom, signed exposure diverging
  from a rule through the middle, spot marked where
  it actually falls between two strikes.

  WHY THIS IS NOT A PANE IN THE PRICE CHART, and
  could never be. Every pane lightweight-charts draws
  shares ONE time axis — that is what makes a pane a
  pane rather than a second chart. This band's axis is
  the STRIKE. Forced into the chart's pane stack it
  would have to pretend strikes were timestamps, and
  the crosshair, the pan and the zoom would all then
  be lying about what the reader was pointing at.

  So it docks BELOW the chart instead: the same
  toggle, the same menu, the same persistence, and its
  own axis where it needs one.

  SVG AND NOT CANVAS. Forty bars and a rule is not a
  drawing problem, and canvas would buy nothing except
  a devicePixelRatio bug waiting to happen. SVG scales
  with the box, prints crisply, and needs no resize
  observer to stay sharp.

  THE INKS ARE THE HOUSE DIRECTION PAIR — the same
  two the flow band and the drift lines wear. A signed
  exposure bar is a direction, and the reader has
  already learned green-up/red-down twice on this
  screen; a third vocabulary for the same idea is a
  cost with no return.
==================================================
*/

/*
  WHICH GREEK THE BAND DRAWS — all five nets, on the surface built for
  reading a net by strike.

  It carried three. Vanna and charm were the two the desk had exposures for
  and nowhere to put them: a rail picker was tried and pulled, because the
  strike ladder answers a different question (what is trading at each strike
  right now) and cramming five greeks behind a dropdown there would have
  buried it. This band is already a tall column of strikes with one net
  drawn across it, which is exactly the shape those two want, so they join
  the three that were here rather than getting a fourth vocabulary of their
  own.

  THE UNIT LINE IS NOT DECORATION. Gamma per 1% and charm per day are not
  comparable quantities, and a reader flicking between them needs the
  denominator to change in front of them or they will read the second number
  in the first one's units.
*/
export type BandMetric = 'gex' | 'dex' | 'vex' | 'vanna' | 'charm';

export const BAND_METRICS: { key: BandMetric; label: string; unit: string }[] = [
  { key: 'dex', label: 'Net delta exposure', unit: 'per $1 move' },
  { key: 'gex', label: 'Net gamma exposure', unit: 'per 1% move' },
  { key: 'vex', label: 'Net vega exposure', unit: 'per 1% vol' },
  { key: 'vanna', label: 'Net vanna exposure', unit: 'delta per 1% vol' },
  { key: 'charm', label: 'Net charm exposure', unit: 'delta per day' },
];

export interface StrikeExposureBandProps {
  data: ExposureProfileData;
  metric: BandMetric;
  onMetric?: (m: BandMetric) => void;
  /** Drawing height of the plot itself, excluding the header and axis rows. */
  plotHeight?: number;
  onClose?: () => void;
}

/* Room under the plot for the strike labels, and above it for the header. */
const AXIS_H = 14;
/* The narrowest two strike labels may sit at before they touch. */
const LABEL_MIN_PX = 42;

/*
  WHERE EACH METRIC READS FROM — the per-strike split and the headline net,
  named together in ONE table.

  These were two separate maps: one here for the headline, one implied by
  whatever key the plot indexed strikes with. Nothing tied them, so pointing
  a metric's headline at the wrong net produced a band that drew the right
  bars under the wrong number — perfectly plausible on screen, and a lie.
  A proof of the data alone cannot catch that; it has to check the mapping,
  and it can only check a mapping that is written down once.
*/
export const BAND_FIELDS: Record<
  BandMetric,
  { split: 'gex' | 'dex' | 'vex' | 'vanna' | 'charm'; net: 'netGex' | 'netDex' | 'netVex' | 'netVanna' | 'netCharm' }
> = {
  gex: { split: 'gex', net: 'netGex' },
  dex: { split: 'dex', net: 'netDex' },
  vex: { split: 'vex', net: 'netVex' },
  vanna: { split: 'vanna', net: 'netVanna' },
  charm: { split: 'charm', net: 'netCharm' },
};

const StrikeExposureBand = ({
  data,
  metric,
  onMetric,
  plotHeight = 96,
  onClose,
}: StrikeExposureBandProps) => {
  /*
    The band is laid out in the box's OWN pixels rather than in a fixed
    viewBox stretched to fit. A viewBox would scale the bars and the type
    together, so the strike labels would grow on a wide desk and shrink to
    nothing on a phone — and the 1px floor that keeps a tiny value visible
    would stop being 1px.
  */
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth(Math.max(0, Math.floor(w)));
    });
    ro.observe(el);
    setWidth(Math.max(0, Math.floor(el.getBoundingClientRect().width)));
    return () => ro.disconnect();
  }, []);

  /*
    STRIKES ASCEND LEFT TO RIGHT, and the profile hands them down.

    Reversed here rather than at the source: the ladder surfaces read
    top-to-bottom high-to-low, which is right for a vertical rail beside a
    price axis, and the horizontal band reads left-to-right low-to-high, which
    is right for an axis of prices. Both orders are correct for their own
    shape; only one of them can be the array's.
  */
  const rows = [...data.strikes].reverse();
  /* spotAfterIndex counts from the descending end, so it has to be mirrored
     with the rows — in the proved module, because an off-by-one here would put
     the spot rule one strike from the market and look perfectly fine. */
  const spotIndex = ascendingSpotIndex(data.spotAfterIndex, rows.length);

  /* Proportional air, not two fixed pixels — see barGap. At desk width the
     fixed gap left the bars touching, and a row of touching bars is a block. */
  const field = BAND_FIELDS[metric];
  const bars = layoutBand(
    rows,
    r => (r as (typeof rows)[number])[field.split].net,
    data.maxAbs[field.split],
    width,
    plotHeight,
    barGap(width, rows.length)
  );
  const stride = labelStride(rows.length, width, LABEL_MIN_PX);
  const rule = spotX(spotIndex, rows.length, width);
  const net = data[field.net];
  const meta = BAND_METRICS.find(m => m.key === metric) ?? BAND_METRICS[0];

  return (
    <div className="flex flex-col border-t border-borderSubtle bg-inset/40">
      <div className="flex items-center gap-2 px-2 py-1">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-textSecondary">
          {meta.label}
        </span>
        <span className="font-mono text-[9px] text-textMuted">· {meta.unit}</span>
        <span
          className="font-mono text-[10px] font-semibold tnum"
          style={{ color: net >= 0 ? BULL : PUT_WALL }}
        >
          {fmtUsd(net)}
        </span>
        {/* Every other net is one click away, on the surface where they are
            read live. */}
        {onMetric && (
          <span className="ml-auto flex items-center gap-1">
            {BAND_METRICS.map(m => (
              <button
                key={m.key}
                onClick={() => onMetric(m.key)}
                title={`${m.label} · ${m.unit}`}
                className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-widest transition-colors ${
                  m.key === metric
                    ? 'bg-white/[0.10] text-textPrimary'
                    : 'text-textMuted hover:bg-white/[0.06] hover:text-textSecondary'
                }`}
              >
                {m.key}
              </button>
            ))}
          </span>
        )}
        {onClose && (
          <button
            onClick={onClose}
            title="Hide this band"
            aria-label="Hide the exposure band"
            className={`${onMetric ? '' : 'ml-auto'} rounded px-1 font-mono text-[10px] text-textMuted transition-colors hover:bg-white/[0.08] hover:text-textPrimary`}
          >
            ✕
          </button>
        )}
      </div>

      <div ref={boxRef} className="w-full">
        {width > 0 && (
          <svg width={width} height={plotHeight + AXIS_H} className="block" role="img" aria-label={`${meta.label} by strike`}>
            {/* The zero rule, drawn UNDER the bars so a full-scale bar does not
                get a line through its base. */}
            <line
              x1={0}
              x2={width}
              y1={plotHeight / 2}
              y2={plotHeight / 2}
              stroke="rgba(255,255,255,0.18)"
              strokeDasharray="3 3"
            />
            {rule !== null && (
              <line x1={rule} x2={rule} y1={0} y2={plotHeight} stroke={SPOT} strokeOpacity={0.45} strokeDasharray="2 3" />
            )}
            {bars.map(b => (
              <rect
                key={b.strike}
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                fill={b.positive ? BULL : PUT_WALL}
                fillOpacity={0.85}
              >
                <title>{`${b.strike} · ${fmtUsd(b.value)}`}</title>
              </rect>
            ))}
            {bars.map((b, i) =>
              i % stride === 0 ? (
                <text
                  key={`t${b.strike}`}
                  x={b.x + b.w / 2}
                  y={plotHeight + AXIS_H - 3}
                  textAnchor="middle"
                  className="fill-textMuted font-mono"
                  style={{ fontSize: 9 }}
                >
                  {b.strike}
                </text>
              ) : null
            )}
          </svg>
        )}
      </div>
    </div>
  );
};

export default StrikeExposureBand;
