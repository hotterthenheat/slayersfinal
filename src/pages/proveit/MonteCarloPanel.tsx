import { useEffect, useMemo, useRef, useState } from 'react';
import { histogram, type MonteCarloResult } from '../../core/quant';

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
const GRID = 'rgba(255,255,255,0.05)';
const AXIS_INK = 'rgba(168,177,194,0.85)';
const AXIS_FONT = "'IBM Plex Mono', ui-monospace, monospace";

interface MonteCarloPanelProps {
  mc: MonteCarloResult;
  spot: number;
  height?: number;
}

const MonteCarloPanel = ({ mc, spot, height = 260 }: MonteCarloPanelProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bins = useMemo(() => histogram(mc.terminal, spot, 28), [mc, spot]);
  const maxBin = Math.max(...bins.map(b => b.count), 1);

  /*
    THE CANVAS HAS TO HEAR ABOUT ITS OWN WIDTH.

    Everything below runs in one effect keyed on the market data, and the
    first thing it does is set `canvas.width` from `clientWidth`. That is the
    only place the backing store is ever sized, so before this observer the
    chart's pixels were resized by a PRICE CHANGE and by nothing else.

    Measured by dragging the viewport: the canvas stayed stretched for
    950-1507ms, which is the 1500ms feed tick, and looked like a slow redraw.
    It is not slow, it is absent — and the recordings run out. Once the active
    name's playhead pins, `spot` stops changing and the last dependency that
    was accidentally standing in for a resize handler stops firing too, so a
    window resize would leave this chart stretched for as long as the tab
    stayed open.

    Surface3D on the same page does not need this: it re-checks its size on
    every animation frame because it is always spinning.

    Same shape as PositioningMap's observer, including the bail-out compare —
    setting the same width back would re-run the whole draw for nothing.
  */
  const [boxWidth, setBoxWidth] = useState(0);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const read = (w: number) => {
      const rw = Math.round(w);
      setBoxWidth(prev => (prev === rw ? prev : rw));
    };
    read(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(entries => {
      const c = entries[0]?.contentRect;
      if (c) read(c.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    /*
      THE DOMAIN COMES FROM WHAT IS DRAWN, NOT FROM THE CONE.

      It used to be `[...cone.p5, ...cone.p95]` — the 90% band. But 90 full
      sampled paths are drawn on top of that band, and by definition around one
      in ten of them leaves it. Every one of those was clipped flat along the
      canvas edge, so the chart showed a hard horizontal ceiling and floor made
      of squashed paths, under a caption calling it the honest distribution of
      outcomes. The tails are the only risk-bearing part of a Monte Carlo and
      they were the part being cut off.

      `pad` keeps the extreme path a pixel or two inside the frame instead of
      drawn along it.
    */
    const drawn = [...mc.cone.p5, ...mc.cone.p95, ...mc.paths.flat()];
    const rawLo = Math.min(...drawn);
    const rawHi = Math.max(...drawn);
    const pad = Math.max((rawHi - rawLo) * 0.02, 0.01);
    const lo = rawLo - pad;
    const hi = rawHi + pad;

    // Room on the right for price ticks, and along the bottom for session marks.
    const PAD_R = 44;
    const PAD_B = 16;
    const plotW = w - PAD_R - 8;
    const plotH = h - PAD_B - 8;
    const X = (d: number) => (d / mc.days) * plotW + 4;
    const Y = (px: number) => plotH - ((px - lo) / (hi - lo)) * (plotH - 6) + 4;

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

    // spot reference
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = SPOT_LINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(4, Y(spot));
    ctx.lineTo(4 + plotW, Y(spot));
    ctx.stroke();
    ctx.setLineDash([]);

    /*
      AXES. The chart had none on either dimension: no price could be read off
      the vertical, and the horizontal ran 0..days with nothing saying so. A
      cone with no scale is a shape, not a measurement, and this is the page
      that argues trade ideas should live inside its fat part.

      Five price ticks down the right edge, the spot tick called out so the
      reader can see which side of it the mass sits on, and session marks along
      the bottom.
    */
    ctx.font = `9px ${AXIS_FONT}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (let i = 0; i <= 4; i++) {
      const px = lo + ((hi - lo) * i) / 4;
      const y = Y(px);
      ctx.strokeStyle = GRID;
      ctx.beginPath();
      ctx.moveTo(4, y);
      ctx.lineTo(4 + plotW, y);
      ctx.stroke();
      ctx.fillStyle = AXIS_INK;
      ctx.fillText(`$${px.toFixed(0)}`, 4 + plotW + 6, y);
    }
    // Spot gets its own label, in the spot line's own ink.
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(`$${spot.toFixed(0)}`, 4 + plotW + 6, Y(spot));

    /*
      The end labels hug the plot edges rather than centring on them: centred at
      X(0) = 4 the word "now" had half its glyphs off the left of the canvas and
      rendered as "ow", and centred at the right edge "+30d" ran under the price
      column and collided with the lowest tick.
    */
    ctx.textBaseline = 'top';
    ctx.fillStyle = AXIS_INK;
    const marks: [number, CanvasTextAlign][] = [
      [0, 'left'],
      [Math.round(mc.days / 2), 'center'],
      [mc.days, 'right'],
    ];
    for (const [d, align] of marks) {
      ctx.textAlign = align;
      ctx.fillText(d === 0 ? 'now' : `+${d}d`, X(d), plotH + 8);
    }
  }, [mc, spot, boxWidth]);

  return (
    <div className="flex flex-col gap-3">
      <canvas ref={canvasRef} className="w-full" style={{ height }} />
      {/* Terminal distribution */}
      <div>
        <div className="flex items-end gap-px h-14">
          {bins.map((b, i) => (
            <span
              key={i}
              className={`flex-1 rounded-t-[2px] ${b.aboveSpot ? 'holo-bar' : 'bg-bear/60'}`}
              style={{ height: `${(b.count / maxBin) * 100}%` }}
              title={`$${b.from.toFixed(2)}–$${b.to.toFixed(2)} · ${b.count} runs`}
            />
          ))}
        </div>
        <div className="mt-1.5 flex items-center justify-between font-mono text-[9px] uppercase tracking-widest text-textMuted">
          <span>${mc.terminal[0].toFixed(0)}</span>
          <span>terminal price after {mc.days} sessions · {mc.runs.toLocaleString()} runs</span>
          <span>${mc.terminal[mc.terminal.length - 1].toFixed(0)}</span>
        </div>
      </div>
    </div>
  );
};

export default MonteCarloPanel;
