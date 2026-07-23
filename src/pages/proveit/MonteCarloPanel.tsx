import { useEffect, useMemo, useRef, useState } from 'react';
import { histogram, type MonteCarloResult } from '../../core/quant';
import HoverReadout from '../../components/ui/HoverReadout';

/*
  The fan chart: sampled GBM paths in faint chrome, the percentile cone in
  brighter silver, the median in near-white — plus a terminal-price histogram
  so the whole distribution is readable at a glance, not just the average.
*/

const PATH_STROKE = 'rgba(199,211,232,0.08)';
const CONE_OUTER = 'rgba(168,196,232,0.10)';
const CONE_INNER = 'rgba(198,214,240,0.16)';
const MEDIAN = 'rgba(238,241,248,0.95)';
const SPOT_LINE = 'rgba(255,255,255,0.35)';

interface MonteCarloPanelProps {
  mc: MonteCarloResult;
  spot: number;
  height?: number;
}

const MonteCarloPanel = ({ mc, spot, height = 260 }: MonteCarloPanelProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bins = useMemo(() => histogram(mc.terminal, spot, 28), [mc, spot]);
  const maxBin = Math.max(...bins.map(b => b.count), 1);
  const [hover, setHover] = useState<{ d: number; leftPct: number; x: number; y: number } | null>(null);

  const onConeMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const w = rect.width || 1;
    const frac = (e.clientX - rect.left - 4) / (w - 8);
    const d = Math.max(0, Math.min(mc.days, Math.round(frac * mc.days)));
    setHover({ d, leftPct: (((d / mc.days) * (w - 8) + 4) / w) * 100, x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const padB = 13; // room for the day (x) axis
      const all = [...mc.cone.p5, ...mc.cone.p95];
      const lo = Math.min(...all) * 0.998;
      const hi = Math.max(...all) * 1.002;
      const X = (d: number) => (d / mc.days) * (w - 8) + 4;
      const Y = (px: number) => (h - padB) - ((px - lo) / (hi - lo)) * (h - padB - 8) - 4;

      ctx.font = '9px "JetBrains Mono", monospace';

      // price (y) gridlines + right-edge labels
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let i = 0; i <= 4; i++) {
        const px = lo + (hi - lo) * (i / 4);
        const y = Y(px);
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(4, y);
        ctx.lineTo(w - 2, y);
        ctx.stroke();
        ctx.fillStyle = '#7d7d7d';
        ctx.fillText(px.toFixed(0), w - 3, y - 6);
      }

      // cone fills
      const fillBand = (top: number[], bot: number[], fill: string) => {
        ctx.fillStyle = fill;
        ctx.beginPath();
        top.forEach((p, d) => (d === 0 ? ctx.moveTo(X(d), Y(p)) : ctx.lineTo(X(d), Y(p))));
        for (let d = bot.length - 1; d >= 0; d--) ctx.lineTo(X(d), Y(bot[d]));
        ctx.closePath();
        ctx.fill();
      };
      fillBand(mc.cone.p95, mc.cone.p5, CONE_OUTER);
      fillBand(mc.cone.p75, mc.cone.p25, CONE_INNER);

      // sampled paths
      ctx.lineWidth = 1;
      ctx.strokeStyle = PATH_STROKE;
      for (const path of mc.paths) {
        ctx.beginPath();
        path.forEach((p, d) => (d === 0 ? ctx.moveTo(X(d), Y(p)) : ctx.lineTo(X(d), Y(p))));
        ctx.stroke();
      }

      // median
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = MEDIAN;
      ctx.beginPath();
      mc.cone.p50.forEach((p, d) => (d === 0 ? ctx.moveTo(X(d), Y(p)) : ctx.lineTo(X(d), Y(p))));
      ctx.stroke();

      // spot reference + label
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = SPOT_LINE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(4, Y(spot));
      ctx.lineTo(w - 4, Y(spot));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = SPOT_LINE;
      ctx.textAlign = 'left';
      ctx.fillText(`spot ${spot.toFixed(0)}`, 5, Y(spot) - 6);

      // day (x) axis labels
      ctx.fillStyle = '#7d7d7d';
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      ctx.fillText('0d', 4, h - 3);
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(mc.days / 2)}d`, w / 2, h - 3);
      ctx.textAlign = 'right';
      ctx.fillText(`${mc.days}d`, w - 3, h - 3);
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [mc, spot]);

  const move = (arr: number[]): string => {
    const v = arr[hover ? hover.d : 0] ?? spot;
    const pct = ((v - spot) / spot) * 100;
    return `$${v.toFixed(0)} · ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="w-full cursor-crosshair"
          style={{ height }}
          role="img"
          aria-label="Monte Carlo price-path fan chart"
          onMouseMove={onConeMove}
          onMouseLeave={() => setHover(null)}
        />
        {hover && (
          <span
            className="pointer-events-none absolute top-0 bottom-0 w-px bg-white/30"
            style={{ left: `${hover.leftPct}%` }}
          />
        )}
        {hover && (
          <HoverReadout x={hover.x} y={hover.y}>
            <div className="font-mono text-micro uppercase tracking-widest text-textMuted">
              {hover.d === 0 ? 'today' : `+${hover.d} session${hover.d > 1 ? 's' : ''}`}
            </div>
            <div className="mt-1 font-mono text-data font-bold tnum text-textPrimary">median {move(mc.cone.p50)}</div>
            <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5 font-mono text-micro tnum text-textSecondary">
              <span className="text-textMuted">50% band</span>
              <span>{move(mc.cone.p25)} → {move(mc.cone.p75)}</span>
              <span className="text-textMuted">90% band</span>
              <span>{move(mc.cone.p5)} → {move(mc.cone.p95)}</span>
            </div>
          </HoverReadout>
        )}
      </div>
      {/* legend */}
      <div className="flex items-center gap-3 -mt-1 font-mono text-micro uppercase tracking-wider text-textMuted">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2 rounded-[1px]" style={{ background: CONE_OUTER }} /> 90% band</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2 rounded-[1px]" style={{ background: CONE_INNER }} /> 50% band</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-[2px]" style={{ background: MEDIAN }} /> median</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-0 border-t border-dashed" style={{ borderColor: SPOT_LINE }} /> spot</span>
      </div>
      {/* Terminal distribution */}
      <div>
        <div className="flex items-end gap-px h-14">
          {bins.map((b, i) => (
            <span
              key={i}
              className={`flex-1 rounded-t-[2px] ${b.aboveSpot ? 'bg-bull/70' : 'bg-bear/60'}`}
              style={{ height: `${(b.count / maxBin) * 100}%` }}
              title={`$${b.from.toFixed(2)}–$${b.to.toFixed(2)} · ${b.count} runs`}
            />
          ))}
        </div>
        <div className="mt-1.5 flex items-center justify-between font-mono text-micro uppercase tracking-widest text-textMuted">
          <span>${mc.terminal[0].toFixed(0)}</span>
          <span>terminal price after {mc.days} sessions · {mc.runs.toLocaleString()} runs</span>
          <span>${mc.terminal[mc.terminal.length - 1].toFixed(0)}</span>
        </div>
      </div>
    </div>
  );
};

export default MonteCarloPanel;
