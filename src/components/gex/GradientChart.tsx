import { preserveGreek } from '../ui/greek';
import ChartLegend from '../ui/ChartLegend';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SegmentedControl from '../ui/SegmentedControl';
import { buildGradientField, type GradientField, type GradientMetric } from '../../data/gradientField';
import { fmtUsd } from '../../data/gex';
import { CALL_WALL, PUT_WALL, FLIP, MUTED_INK, SHORT_GAMMA, LONG_GAMMA, CHARM_POS, CHARM_NEG } from './palette';
import type { KeyLevels } from '../../types/gex';
import { CHART_FONT } from '../charts/chartTheme';

/*
  VS3D-style gradient chart: the dealer gamma (or charm) field across the live
  session as a smooth TIME x PRICE gradient — posterized into contour bands so
  it reads like a topo map — with the tape drawn over it.

  Gamma paints the house sign pair: GOLD for short gamma, BLUE for long. It used
  to paint green/red off-token while charm took the gold/blue — so a gamma panel
  and a charm panel stacked in the default Pulse column said opposite things in
  the same two colours. Charm now owns cyan (+) / magenta (−).
*/

interface GradientChartProps {
  ticker: string;
  revision: number;
  levels: KeyLevels;
  height?: number;
}

const AXIS_W = 54;
const AXIS_H = 18;
const FONT = `10px ${CHART_FONT}`;

/** Posterized diverging colormaps — [r,g,b] at |t| in 0..1, by sign. Both ramps
    interpolate from the palette so the chart cannot drift off the token. */
const hexRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const FLOOR: [number, number, number] = [12, 12, 12]; // near-black at |t| = 0
const rampTo = (target: [number, number, number], a: number, out: [number, number, number]): void => {
  out[0] = FLOOR[0] + (target[0] - FLOOR[0]) * a;
  out[1] = FLOOR[1] + (target[1] - FLOOR[1]) * a;
  out[2] = FLOOR[2] + (target[2] - FLOOR[2]) * a;
};
const LONG_RGB = hexRgb(LONG_GAMMA);
const SHORT_RGB = hexRgb(SHORT_GAMMA);
const CHARM_P_RGB = hexRgb(CHARM_POS);
const CHARM_N_RGB = hexRgb(CHARM_NEG);

function gammaColor(t: number, out: [number, number, number]): void {
  rampTo(t >= 0 ? LONG_RGB : SHORT_RGB, Math.abs(t), out);
}
function charmColor(t: number, out: [number, number, number]): void {
  rampTo(t >= 0 ? CHARM_P_RGB : CHARM_N_RGB, Math.abs(t), out);
}

const METRIC_OPTIONS = [
  { value: 'gamma', label: 'Gamma' },
  { value: 'charm', label: 'Charm' },
] as const;

const GradientChart = ({ ticker, revision, levels, height = 260 }: GradientChartProps) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [metric, setMetric] = useState<GradientMetric>('gamma');
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const field = useMemo(
    () => buildGradientField(ticker, metric),
    // rebuild when the session advances or the metric/symbol flips
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ticker, metric, revision]
  );
  const fieldRef = useRef<GradientField | null>(null);
  fieldRef.current = field;

  // Bake the field into an offscreen cols x rows canvas (posterized bands)
  const baked = useMemo(() => {
    if (!field) return null;
    const c = document.createElement('canvas');
    c.width = field.cols;
    c.height = field.rows;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const img = ctx.createImageData(field.cols, field.rows);
    const d = img.data;
    const rgb: [number, number, number] = [0, 0, 0];
    const paint = metric === 'gamma' ? gammaColor : charmColor;
    const STEPS = 7; // contour posterization
    for (let col = 0; col < field.cols; col++) {
      const base = col * field.rows;
      for (let r = 0; r < field.rows; r++) {
        const v = field.values[base + r];
        const q = Math.round(v * STEPS) / STEPS;
        paint(q, rgb);
        const p = ((field.rows - 1 - r) * field.cols + col) * 4; // row 0 = top = max price
        d[p] = rgb[0];
        d[p + 1] = rgb[1];
        d[p + 2] = rgb[2];
        d[p + 3] = 235;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }, [field, metric]);

  // Track the wrapper size
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Draw
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const f = fieldRef.current;
    if (!canvas || !f || !baked || size.w < 40 || size.h < 40) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const plotW = size.w - AXIS_W;
    const plotH = size.h - AXIS_H;
    const yOf = (price: number) => plotH - ((price - f.priceMin) / (f.priceMax - f.priceMin)) * plotH;
    const xOf = (col: number) => (col / Math.max(1, f.cols - 1)) * plotW;

    // field
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(baked, 0, 0, f.cols, f.rows, 0, 0, plotW, plotH);

    // subtle horizontal gridlines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    const ticks = 5;
    ctx.font = FONT;
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= ticks; i++) {
      const price = f.priceMin + ((f.priceMax - f.priceMin) * i) / ticks;
      const y = yOf(price);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(plotW, y);
      ctx.stroke();
      ctx.fillStyle = MUTED_INK;
      ctx.fillText(price.toFixed(2), plotW + 6, Math.min(plotH - 6, Math.max(6, y)));
    }

    // dealer levels — dotted rules in the house palette
    const levelSpecs: { price: number; color: string }[] = [
      { price: levels.callWall, color: CALL_WALL },
      { price: levels.putWall, color: PUT_WALL },
      { price: levels.flip, color: FLIP },
    ];
    ctx.setLineDash([2, 3]);
    for (const spec of levelSpecs) {
      if (spec.price <= f.priceMin || spec.price >= f.priceMax) continue;
      const y = yOf(spec.price);
      ctx.strokeStyle = spec.color + 'AA';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(plotW, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // the tape — session closes over the field
    ctx.strokeStyle = 'rgba(237,237,237,0.95)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let c = 0; c < f.cols; c++) {
      const x = xOf(c);
      const y = yOf(f.closes[c]);
      if (c === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // last-price pill on the axis
    const last = f.closes[f.cols - 1];
    const ly = Math.min(plotH - 8, Math.max(8, yOf(last)));
    ctx.fillStyle = '#ededed';
    ctx.fillRect(plotW + 2, ly - 8, AXIS_W - 4, 16);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillText(last.toFixed(2), plotW + 6, ly);

    // time axis
    ctx.fillStyle = MUTED_INK;
    ctx.textBaseline = 'alphabetic';
    const tTicks = Math.min(5, f.cols - 1);
    for (let i = 0; i <= tTicks; i++) {
      const c = Math.round(((f.cols - 1) * i) / tTicks);
      const d = new Date(f.times[c] * 1000);
      const label = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const x = Math.min(plotW - 30, Math.max(0, xOf(c) - 14));
      ctx.fillText(label, x, size.h - 5);
    }

    // hover crosshair + readout
    if (hover && hover.x < plotW && hover.y < plotH) {
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hover.x, 0);
      ctx.lineTo(hover.x, plotH);
      ctx.moveTo(0, hover.y);
      ctx.lineTo(plotW, hover.y);
      ctx.stroke();
      ctx.setLineDash([]);

      const col = Math.max(0, Math.min(f.cols - 1, Math.round((hover.x / plotW) * (f.cols - 1))));
      const price = f.priceMin + (1 - hover.y / plotH) * (f.priceMax - f.priceMin);
      const row = Math.max(0, Math.min(f.rows - 1, Math.round(((price - f.priceMin) / (f.priceMax - f.priceMin)) * (f.rows - 1))));
      const v = f.values[col * f.rows + row];
      const d = new Date(f.times[col] * 1000);
      const when = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const text = `${when} · ${price.toFixed(2)} · ${v >= 0 ? '+' : ''}${fmtUsd(v * f.scale)}`;
      ctx.font = FONT;
      const w = ctx.measureText(text).width + 12;
      const bx = Math.min(plotW - w - 4, Math.max(4, hover.x + 10));
      const by = Math.max(4, hover.y - 26);
      ctx.fillStyle = 'rgba(16,16,16,0.92)';
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(bx, by, w, 18);
      ctx.strokeRect(bx + 0.5, by + 0.5, w - 1, 17);
      ctx.fillStyle = '#ededed';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, bx + 6, by + 9);
    }
  }, [baked, size, hover, levels]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      <div className="flex items-center gap-3 px-1 flex-wrap select-none">
        <SegmentedControl
          ariaLabel="Gradient metric"
          options={METRIC_OPTIONS}
          value={metric}
          onChange={v => setMetric(v as GradientMetric)}
        />
        <ChartLegend
          variant="line"
          items={[
            {
              label: preserveGreek(metric === 'gamma' ? 'short γ → long γ' : '−charm → +charm'),
              kind: 'gradient',
              gradient:
                metric === 'gamma'
                  ? `linear-gradient(to right, ${SHORT_GAMMA}, #101010, ${LONG_GAMMA})`
                  : `linear-gradient(to right, ${CHARM_NEG}, #101010, ${CHARM_POS})`,
            },
          ]}
        />
        <span className="ml-auto font-mono text-micro text-textMuted uppercase tracking-wider hidden sm:inline">
          session field · tape overlaid
        </span>
      </div>
      <div
        ref={wrapRef}
        className="relative flex-grow border border-borderSubtle bg-inset rounded-md overflow-hidden"
        style={{ minHeight: height }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          role="img"
          aria-label={`${ticker} dealer ${metric} field across the session`}
          onMouseMove={e => {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top });
          }}
          onMouseLeave={() => setHover(null)}
        />
      </div>
    </div>
  );
};

export default GradientChart;
