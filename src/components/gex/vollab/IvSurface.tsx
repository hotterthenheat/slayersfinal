import { heatRgb } from '../heatmap';
import type { IvSurfaceData } from '../../../types/gex';

interface IvSurfaceProps {
  data: IvSurfaceData;
}

/*
  THE VIOLET CAME OFF (2026-09-06).

  This ramp used to run canvas → slate violet → periwinkle → cream, above a
  comment claiming it was "the same family as the GEX heatmap so the lab
  speaks the house language". It was not the same family: the house heat is
  ice-gold, and violet was a leftover from the teal-violet era. The result
  was a second, unrelated palette on a section that already runs one — a new
  hue introduced by a stale comment rather than by a decision.

  It is the house ICE ramp now, and DERIVED rather than copied: implied vol
  is strictly positive, so a sequential scale is right, and the ice side is
  already the sequential half of the house diverging pair. Asking heatRgb
  for a negative value of magnitude t walks exactly that half, so a change
  to the house ramp reaches this surface with nothing to edit here — and no
  pole value is spelled out in this file to drift out of date.
*/
const rampColor = (t: number): string => {
  const [r, g, b] = heatRgb(-Math.min(1, Math.max(0, t)), 1);
  return `rgb(${r},${g},${b})`;
};

/** The scale bar, sampled off the same ramp so the key cannot lie about the cells. */
const SCALE_GRADIENT = `linear-gradient(to bottom, ${[1, 0.75, 0.5, 0.25, 0].map(rampColor).join(', ')})`;

/** DTE × moneyness implied-vol heat grid with a sequential scale bar. */
const IvSurface = ({ data }: IvSurfaceProps) => {
  const { moneyness, dte, cells, min, max, forward } = data;
  const span = max - min || 1;

  return (
    <div className="flex gap-2 h-full min-h-0">
      <div className="flex-grow min-w-0 flex flex-col gap-1">
        <div className="flex-grow flex flex-col gap-[2px]">
          {dte.map((t, r) => (
            <div key={t} className="flex items-stretch gap-[2px] flex-1 min-h-[18px]">
              <span className="w-8 shrink-0 flex items-center font-mono text-[10px] tnum text-textMuted">{t}d</span>
              {cells[r].map((iv, c) => (
                <span
                  key={c}
                  title={`${t}DTE · ${moneyness[c].toFixed(2)} K/F · ${iv.toFixed(1)}% IV`}
                  className="flex-1"
                  style={{ background: rampColor((iv - min) / span) }}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-[2px] pl-8">
          {moneyness.map((m, c) => (
            <span key={m} className="flex-1 text-center font-mono text-[10px] tnum text-textMuted">
              {c % 4 === 0 ? m.toFixed(2) : ''}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between font-mono text-[10px] text-textMuted uppercase tracking-wider pl-8">
          <span>strike / forward</span>
          <span className="tnum normal-case">Fwd {forward.toFixed(2)}</span>
        </div>
      </div>

      {/* Scale */}
      <div className="shrink-0 w-9 flex flex-col items-center py-1 select-none">
        <span className="font-mono text-[10px] tnum text-textPrimary">{max.toFixed(0)}%</span>
        <div
          className="flex-grow w-2.5 my-1.5 rounded-full border border-borderSubtle"
          style={{ background: SCALE_GRADIENT }}
        />
        <span className="font-mono text-[10px] tnum text-textSecondary">{min.toFixed(0)}%</span>
        <span className="mt-1 font-mono text-[10px] text-textMuted uppercase">iv</span>
      </div>
    </div>
  );
};

export default IvSurface;
