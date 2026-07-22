import { useState } from 'react';
import type { IvSurfaceData } from '../../../types/gex';
import HoverReadout from '../../ui/HoverReadout';

interface IvSurfaceProps {
  data: IvSurfaceData;
}

// Sequential ramp: quiet canvas → slate violet → periwinkle → cream.
// Same family as the GEX heatmap so the lab speaks the house language.
const STOPS: [number, [number, number, number]][] = [
  [0.0, [18, 18, 20]],
  [0.45, [74, 68, 112]],
  [0.75, [151, 136, 196]],
  [1.0, [239, 232, 224]],
];

function rampColor(t: number): string {
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [t0, c0] = STOPS[i];
    const [t1, c1] = STOPS[i + 1];
    if (t <= t1) {
      const u = (t - t0) / (t1 - t0 || 1);
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * u);
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * u);
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * u);
      return `rgb(${r},${g},${b})`;
    }
  }
  return 'rgb(239,232,224)';
}

/** DTE × moneyness implied-vol heat grid with a sequential scale bar. */
const IvSurface = ({ data }: IvSurfaceProps) => {
  const { moneyness, dte, cells, min, max, forward } = data;
  const span = max - min || 1;
  const [hover, setHover] = useState<{ t: number; m: number; iv: number; x: number; y: number } | null>(null);

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
                  onMouseEnter={e => setHover({ t, m: moneyness[c], iv, x: e.clientX, y: e.clientY })}
                  onMouseMove={e => setHover({ t, m: moneyness[c], iv, x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setHover(h => (h && h.t === t && h.m === moneyness[c] ? null : h))}
                  className="flex-1 rounded-[2px] cursor-crosshair hover:brightness-125"
                  style={{ background: rampColor((iv - min) / span) }}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-[2px] pl-8">
          {moneyness.map((m, c) => (
            <span key={m} className="flex-1 text-center font-mono text-[8px] tnum text-textMuted">
              {c % 4 === 0 ? m.toFixed(2) : ''}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between font-mono text-[9px] text-textMuted uppercase tracking-wider pl-8">
          <span>strike / forward</span>
          <span className="tnum normal-case">Fwd {forward.toFixed(2)}</span>
        </div>
      </div>

      {/* Scale */}
      <div className="shrink-0 w-9 flex flex-col items-center py-1 select-none">
        <span className="font-mono text-[9px] tnum text-textPrimary">{max.toFixed(0)}%</span>
        <div
          className="flex-grow w-2.5 my-1.5 rounded-full border border-borderSubtle"
          style={{
            background: 'linear-gradient(to bottom, #EFE8E0 0%, #9788C4 25%, #4a4470 55%, #121214 100%)',
          }}
        />
        <span className="font-mono text-[9px] tnum text-textSecondary">{min.toFixed(0)}%</span>
        <span className="mt-1 font-mono text-[8px] text-textMuted uppercase">iv</span>
      </div>

      {hover && (
        <HoverReadout x={hover.x} y={hover.y}>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[12px] font-bold text-textPrimary tnum">{hover.iv.toFixed(1)}%</span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">IV</span>
          </div>
          <div className="mt-0.5 flex items-center gap-3 font-mono text-[10px] tnum text-textSecondary">
            <span>{hover.t}DTE</span>
            <span>{hover.m.toFixed(2)} K/F</span>
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-textMuted tnum">Fwd {forward.toFixed(2)}</div>
        </HoverReadout>
      )}
    </div>
  );
};

export default IvSurface;
