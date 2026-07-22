import { useMemo, useState } from 'react';
import { Crosshair } from 'lucide-react';
import Panel from '../ui/Panel';
import SegmentedControl from '../ui/SegmentedControl';
import type { StateDensityView, DensityPoint } from '../../data/statedensity';

const signed = (n: number, d = 2): string => `${n >= 0 ? '+' : ''}${n.toFixed(d)}`;

/** P(price ≤ K) read straight off the density's already-computed cumulative,
 *  linearly interpolated between grid points. No new model — just a lookup
 *  into the cdf the engine already integrated. */
function cdfAt(pts: DensityPoint[], K: number): number {
  if (K <= pts[0].price) return 0;
  if (K >= pts[pts.length - 1].price) return 1;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].price >= K) {
      const a = pts[i - 1];
      const b = pts[i];
      const u = (K - a.price) / (b.price - a.price || 1);
      return a.cdf + (b.cdf - a.cdf) * u;
    }
  }
  return 1;
}

const SOURCE_OPTS = [
  { value: 'implied', label: 'implied' },
  { value: 'realized', label: 'realized' },
] as const;
type Source = (typeof SOURCE_OPTS)[number]['value'];

/** A price-threshold control: pick a level, read the odds the density already
 *  prices of finishing above vs below it. Every number here is read from the
 *  view the page has already built — the curve, its cumulative and the σ anchors. */
const PriceThresholdOdds = ({ view }: { view: StateDensityView }) => {
  const lo = view.density[0].price;
  const hi = view.density[view.density.length - 1].price;
  const step = Math.max((hi - lo) / 240, 0.01);

  const [source, setSource] = useState<Source>('implied');
  const [threshold, setThreshold] = useState<number>(() => view.spot);

  const active = source === 'implied' ? view.density : view.realizedDensity;
  const K = Math.min(hi, Math.max(lo, threshold));

  const pBelow = useMemo(() => cdfAt(active, K) * 100, [active, K]);
  const pAbove = 100 - pBelow;
  const movePct = ((K - view.spot) / view.spot) * 100;
  const upFromSpot = K >= view.spot;

  // Quick-set anchors — all levels the engine already computed on this grid.
  const anchors: { label: string; value: number }[] = [
    { label: '−2σ', value: view.sigma2[0] },
    { label: 'spot', value: view.spot },
    { label: 'fwd', value: view.forward },
    { label: '+2σ', value: view.sigma2[1] },
  ];

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-1.5">
          <Crosshair className="w-3.5 h-3.5" /> Price-threshold odds
        </span>
      }
      subtitle={`odds above / below a level · ${view.horizonDays}D`}
      actions={
        <SegmentedControl<Source>
          ariaLabel="Density source for the threshold read"
          options={SOURCE_OPTS}
          value={source}
          onChange={setSource}
        />
      }
    >
      <div className="flex flex-col gap-4">
        {/* Chosen level + move from spot, with quick-set anchors */}
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <span className="block font-mono text-[11px] uppercase tracking-widest text-textMuted">Threshold level</span>
            <span className="font-mono text-3xl font-bold tnum text-textPrimary">{K.toFixed(2)}</span>
            <span className={`ml-2 font-mono text-[13px] tnum ${upFromSpot ? 'text-bull' : 'text-bear'}`}>
              {signed(movePct)}%
            </span>
            <span className="ml-1 font-mono text-[11px] text-textMuted uppercase tracking-wider">from spot</span>
          </div>
          <div className="flex items-center gap-1.5">
            {anchors.map(a => (
              <button
                key={a.label}
                onClick={() => setThreshold(a.value)}
                className="font-mono text-[11px] uppercase tracking-wider px-2 py-1 rounded border border-borderSubtle text-textSecondary hover:text-textPrimary hover:bg-white/[0.04] transition-colors"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* Level slider across the density's own price grid */}
        <div>
          <input
            type="range"
            min={lo}
            max={hi}
            step={step}
            value={K}
            onChange={e => setThreshold(parseFloat(e.target.value))}
            aria-label="Terminal price threshold"
            className="w-full accent-select cursor-pointer"
          />
          <div className="mt-1 flex items-center justify-between font-mono text-[9px] tnum text-textMuted select-none">
            <span>{lo.toFixed(0)}</span>
            <span className="uppercase tracking-wider">terminal price · {view.horizonDays}D</span>
            <span>{hi.toFixed(0)}</span>
          </div>
        </div>

        {/* Probability split — below (red) vs above (green) the line */}
        <div className="relative h-3 rounded-full overflow-hidden bg-white/[0.06] flex">
          <span className="h-full bg-bear/70" style={{ width: `${pBelow}%` }} aria-hidden />
          <span className="h-full bg-bull/70" style={{ width: `${pAbove}%` }} aria-hidden />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <span className="block font-mono text-[11px] uppercase tracking-wider text-textMuted truncate">
              P(below {K.toFixed(0)})
            </span>
            <span className="block font-mono text-2xl font-bold tnum text-bear">{pBelow.toFixed(1)}%</span>
          </div>
          <div className="min-w-0 text-right">
            <span className="block font-mono text-[11px] uppercase tracking-wider text-textMuted truncate">
              P(above {K.toFixed(0)})
            </span>
            <span className="block font-mono text-2xl font-bold tnum text-bull">{pAbove.toFixed(1)}%</span>
          </div>
        </div>

        {/* Honest framing of what a risk-neutral density is */}
        <p className="font-mono text-[11px] text-textMuted leading-relaxed">
          Read against the {source} curve. A risk-neutral density is not a literal price forecast — it is the odds the option
          book implies once risk premium is baked in, not a prediction of where the underlying will land.
        </p>
      </div>
    </Panel>
  );
};

export default PriceThresholdOdds;
