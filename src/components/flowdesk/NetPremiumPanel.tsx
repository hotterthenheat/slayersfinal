import { useMemo, useState } from 'react';
import { buildNetPremium } from '../../data/netpremium';
import { fmtUsd } from '../../data/gex';

/*
  Net Premium tide — cumulative net call premium (green) vs net put premium
  (red) through the session, with price (gold) on its own scale. The
  "who is paying up" read next to the tape.
*/

interface NetPremiumPanelProps {
  ticker: string;
  revision: number;
}

const VB_W = 600;
const VB_H = 220;

const NetPremiumPanel = ({ ticker, revision }: NetPremiumPanelProps) => {
  const view = useMemo(
    () => buildNetPremium(ticker),
    // session tide advances on the scan revision
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ticker, revision]
  );
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!view || view.points.length < 2) {
    return (
      <div className="h-full flex items-center justify-center font-mono text-label text-textMuted uppercase tracking-widest">
        Awaiting session flow…
      </div>
    );
  }

  const { points, maxAbs } = view;
  const n = points.length;
  const xOf = (i: number) => (i / (n - 1)) * VB_W;
  const yPrem = (v: number) => VB_H / 2 - (v / maxAbs) * (VB_H / 2 - 8);
  let pLo = Infinity;
  let pHi = -Infinity;
  for (const p of points) {
    if (p.price < pLo) pLo = p.price;
    if (p.price > pHi) pHi = p.price;
  }
  const yPrice = (v: number) => 10 + (1 - (v - pLo) / (pHi - pLo || 1)) * (VB_H - 20);

  const path = (get: (p: (typeof points)[number]) => number, yScale: (v: number) => number) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yScale(get(p)).toFixed(1)}`).join('');

  const at = hoverIdx != null ? points[Math.max(0, Math.min(n - 1, hoverIdx))] : points[n - 1];
  const when = new Date(at.time * 1000);
  const whenLabel = `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;

  return (
    <div className="h-full min-h-0 p-2 flex flex-col gap-1.5">
      {/* Legend + live/hover readout */}
      <div className="flex items-center gap-3 px-1 flex-wrap font-mono text-micro select-none">
        <span className="flex items-center gap-1.5 text-textSecondary">
          <span className="inline-block w-2.5 h-0.5 rounded-full bg-bull" /> Net call prem
          <span className={`tnum font-semibold ${at.call >= 0 ? 'text-bull' : 'text-bear'}`}>{fmtUsd(at.call)}</span>
        </span>
        <span className="flex items-center gap-1.5 text-textSecondary">
          <span className="inline-block w-2.5 h-0.5 rounded-full bg-bear" /> Net put prem
          <span className={`tnum font-semibold ${at.put >= 0 ? 'text-bear' : 'text-bull'}`}>{fmtUsd(at.put)}</span>
        </span>
        <span className="flex items-center gap-1.5 text-textSecondary">
          <span className="inline-block w-2.5 h-0.5 rounded-full" style={{ background: '#E0B84E' }} /> Price
          <span className="tnum font-semibold text-textPrimary">{at.price.toFixed(2)}</span>
        </span>
        <span className="ml-auto text-textMuted tnum">{whenLabel}</span>
      </div>

      <div className="relative flex-grow min-h-0 border border-borderSubtle bg-inset rounded-md overflow-hidden">
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
          role="img"
          aria-label={`${ticker} net call vs put premium through the session`}
          onMouseMove={e => {
            const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            setHoverIdx(Math.round(((e.clientX - rect.left) / rect.width) * (n - 1)));
          }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* zero line */}
          <line x1={0} y1={VB_H / 2} x2={VB_W} y2={VB_H / 2} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          {/* price context first, under the premium lines */}
          <path d={path(p => p.price, yPrice)} fill="none" stroke="#E0B84E" strokeOpacity={0.75} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          <path d={path(p => p.call, yPrem)} fill="none" stroke="#30D158" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
          <path d={path(p => p.put, yPrem)} fill="none" stroke="#FF3B30" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
          {hoverIdx != null && (
            <line
              x1={xOf(Math.max(0, Math.min(n - 1, hoverIdx)))}
              y1={0}
              x2={xOf(Math.max(0, Math.min(n - 1, hoverIdx)))}
              y2={VB_H}
              stroke="rgba(255,255,255,0.25)"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {/* premium axis bounds */}
        <span className="absolute top-1 left-1.5 font-mono text-micro text-textMuted tnum">+{fmtUsd(maxAbs)}</span>
        <span className="absolute bottom-1 left-1.5 font-mono text-micro text-textMuted tnum">−{fmtUsd(maxAbs)}</span>
      </div>
    </div>
  );
};

export default NetPremiumPanel;
