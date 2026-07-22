import { useEffect, useRef } from 'react';
import { createLiquidityBook, thermal, type LiqColumn, type LiquidityBook } from '../../data/liquiditymap';

/*
  Bookmap-style order-book heatmap on a GPU-friendly 2D canvas.

    • The resting book is a smooth thermal field (black→blue→cyan→white→yellow→
      orange→red) drawn from a small offscreen buffer scaled up with bilinear
      smoothing, so liquidity reads as continuous evolving bands — not rectangles.
      A gamma lift brings out subtle deep-blue mid-tones; a 256-entry LUT keeps
      the per-pixel colour lookup cheap.
    • Price traces the field as candles, a line, or pure trade bubbles (chartType).
    • Executed trades are soft-glow bubbles pre-rendered as sprites, so hundreds
      overlap naturally and animate in instead of popping.
    • A live DOM ladder pins to the right; its depths ease toward their targets
      so the numbers tween rather than snapping.
    • A crosshair tracks the cursor with a price read on the axis.
    • The field streams right→left by advancing a stateful book one column at a
      time and gliding sub-column between pushes — a fixed viewport with zero
      layout shift, resize jitter or redraw flicker.
*/

export type LiqChartType = 'candle' | 'line' | 'bubbles';

interface LiquidityMapProps {
  ticker: string;
  spot: number;
  /** Fixed pixel height. Omit (or pass `fill`) to fill the parent element. */
  height?: number;
  fill?: boolean;
  chartType?: LiqChartType;
}

const COLS = 210; // visible time columns
const COL_MS = 90; // ms between new columns (~11 cols/sec)
const GAMMA = 0.72; // lifts low depths into the blue mid-tones
const GROW_COLS = 1.9; // columns over which a fresh bubble eases in
const DOM_EASE = 0.14; // per-frame approach for the tweened ladder depths

const CANDLE_UP = '#30D158';
const CANDLE_DN = '#FF3B30';
const PRICE_LINE = '#ededed';

const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);

/** Pre-render a soft radial-glow sprite once; drawImage-scaling it per trade is
    far cheaper than building a gradient every frame and gives free overlap. */
function makeGlowSprite(r: number, g: number, b: number): HTMLCanvasElement {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const cx = c.getContext('2d')!;
  const grd = cx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0.0, `rgba(${Math.min(255, r + 60)},${Math.min(255, g + 60)},${Math.min(255, b + 60)},0.95)`);
  grd.addColorStop(0.28, `rgba(${r},${g},${b},0.72)`);
  grd.addColorStop(0.6, `rgba(${r},${g},${b},0.26)`);
  grd.addColorStop(1.0, `rgba(${r},${g},${b},0)`);
  cx.fillStyle = grd;
  cx.fillRect(0, 0, S, S);
  return c;
}

const LiquidityMap = ({ ticker, spot, height, fill, chartType = 'candle' }: LiquidityMapProps) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Capture props that shouldn't restart the stream. Live ticks (spot) and a
  // chart-type toggle are read from refs inside the render loop, so only the
  // ticker rebuilds the book.
  const spotRef = useRef(spot);
  spotRef.current = spot;
  const chartRef = useRef<LiqChartType>(chartType);
  chartRef.current = chartType;
  // Cursor position within the heatmap, for the crosshair.
  const mouseRef = useRef<{ x: number; y: number; on: boolean }>({ x: 0, y: 0, on: false });

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const book: LiquidityBook = createLiquidityBook(ticker, spotRef.current || 500);
    const rows = book.rows;

    // ---- thermal LUT: gamma-lifted colour per 0…255 depth bucket ----
    const lut = new Uint8ClampedArray(256 * 3);
    const rgb: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < 256; i++) {
      thermal(Math.pow(i / 255, GAMMA), rgb);
      lut[i * 3] = rgb[0];
      lut[i * 3 + 1] = rgb[1];
      lut[i * 3 + 2] = rgb[2];
    }

    // ---- bubble glow sprites ----
    const buySprite = makeGlowSprite(48, 209, 88);
    const sellSprite = makeGlowSprite(255, 78, 66);

    // rolling buffer of the visible columns (oldest→newest left→right)
    const buf: LiqColumn[] = [];
    for (let i = 0; i < COLS; i++) buf.push(book.next());

    // tweened DOM depths — ease toward the live column each frame
    const domDisp = new Float32Array(rows);
    domDisp.set(buf[COLS - 1].depth);

    // offscreen thermal field (COLS × rows) — rebuilt only when a column is pushed
    const field = document.createElement('canvas');
    field.width = COLS;
    field.height = rows;
    const fctx = field.getContext('2d')!;
    const img = fctx.createImageData(COLS, rows);

    const paintField = () => {
      const data = img.data;
      for (let x = 0; x < COLS; x++) {
        const depth = buf[x].depth;
        for (let r = 0; r < rows; r++) {
          const li = ((depth[r] * 255) | 0) * 3;
          // flip vertically: high row (high price) at top
          const p = ((rows - 1 - r) * COLS + x) * 4;
          data[p] = lut[li];
          data[p + 1] = lut[li + 1];
          data[p + 2] = lut[li + 2];
          data[p + 3] = 255;
        }
      }
      fctx.putImageData(img, 0, 0);
    };
    paintField();

    // ---- geometry (recomputed on resize) ----
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;
    let heatW = 0;
    let plotH = 0;
    let axisW = 50;
    let domW = 128;

    const resize = () => {
      const w = wrap.clientWidth;
      const h = fill ? wrap.clientHeight : height ?? 540;
      if (!w || !h) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = w;
      H = h;
      // The ladder + axis collapse gracefully on narrow embeds (e.g. a Pulse tile)
      domW = W >= 560 ? 128 : W >= 420 ? 96 : 0;
      axisW = W >= 360 ? 50 : 38;
      heatW = W - axisW - domW;
      plotH = H;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const rowToY = (row: number) => plotH - (row / (rows - 1)) * plotH;
    const yToRow = (y: number) => (1 - y / plotH) * (rows - 1);

    // ---- cursor tracking ----
    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      mouseRef.current = { x, y, on: x >= 0 && x <= heatW && y >= 0 && y <= plotH };
    };
    const onLeave = () => {
      mouseRef.current.on = false;
    };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);

    let last = performance.now();
    let acc = 0;
    let raf = 0;

    const render = (sub: number) => {
      const chart = chartRef.current;
      const colW = heatW / (COLS - 1);
      ctx.clearRect(0, 0, W, H);

      // ---- heatmap field (scaled up, smoothed, sub-column offset) ----
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, heatW, plotH);
      ctx.clip();
      ctx.drawImage(field, 0, 0, COLS, rows, -sub * colW, 0, COLS * colW, plotH);

      const xOf = (i: number) => (i - sub) * colW;

      // ---- price path: candles or line ----
      if (chart === 'candle') {
        const bodyW = Math.max(1.4, colW * 0.62);
        for (let i = 0; i < COLS; i++) {
          const col = buf[i];
          const x = xOf(i);
          if (x < -colW || x > heatW + colW) continue;
          const up = col.c >= col.o;
          ctx.strokeStyle = up ? CANDLE_UP : CANDLE_DN;
          ctx.fillStyle = up ? CANDLE_UP : CANDLE_DN;
          ctx.globalAlpha = 0.92;
          ctx.lineWidth = Math.max(0.75, colW * 0.14);
          ctx.beginPath();
          ctx.moveTo(x, rowToY(col.h));
          ctx.lineTo(x, rowToY(col.l));
          ctx.stroke();
          const yo = rowToY(col.o);
          const yc = rowToY(col.c);
          ctx.fillRect(x - bodyW / 2, Math.min(yo, yc), bodyW, Math.max(1, Math.abs(yc - yo)));
        }
        ctx.globalAlpha = 1;
      } else if (chart === 'line') {
        // soft under-glow then a crisp neutral line through the closes
        ctx.beginPath();
        for (let i = 0; i < COLS; i++) {
          const x = xOf(i);
          const y = rowToY(buf[i].c);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(237,237,237,0.16)';
        ctx.lineWidth = 5;
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.strokeStyle = PRICE_LINE;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // ---- executed trades (soft-glow sprites, grow-in) ----
      // Trades show in every mode; the chart type only tunes their weight —
      // biggest in the pure-bubbles view, dialed back under the line.
      {
        const sizeK = chart === 'bubbles' ? 1.15 : 0.9;
        const maxR = chart === 'bubbles' ? 26 : 20;
        const baseAlpha = chart === 'line' ? 0.5 : 0.85;
        for (let i = 0; i < COLS; i++) {
          const col = buf[i];
          const x = xOf(i);
          if (x < -20 || x > heatW + 20) continue;
          const ageCols = COLS - 1 - i + sub;
          const growIn = reduce ? 1 : easeOut(Math.min(1, ageCols / GROW_COLS));
          const scale = 0.42 + 0.58 * growIn;
          for (const tr of col.trades) {
            const baseR = Math.min(maxR, Math.max(2, Math.sqrt(tr.size) * sizeK));
            const d = baseR * scale * 3.1; // sprite carries the glow halo out to its edge
            ctx.globalAlpha = baseAlpha * (0.5 + 0.5 * growIn);
            ctx.drawImage(tr.buy ? buySprite : sellSprite, x - d / 2, rowToY(tr.row) - d / 2, d, d);
          }
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      // ---- current price line + tag ----
      const cur = buf[COLS - 1];
      const py = rowToY(cur.c);
      ctx.strokeStyle = 'rgba(237,237,237,0.6)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(heatW, py);
      ctx.stroke();
      ctx.setLineDash([]);

      // ---- crosshair (cursor) ----
      const m = mouseRef.current;
      if (m.on) {
        ctx.strokeStyle = 'rgba(237,237,237,0.26)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(m.x, 0);
        ctx.lineTo(m.x, plotH);
        ctx.moveTo(0, m.y);
        ctx.lineTo(heatW, m.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // ---- price-axis strip ----
      const ladderX = W - domW;
      const axisX = heatW;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(axisX, 0, axisW, plotH);
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#7a7f88';
      const ticks = Math.max(6, Math.min(12, Math.round(plotH / 68)));
      for (let k = 0; k <= ticks; k++) {
        const row = (k / ticks) * (rows - 1);
        ctx.fillText(book.rowToPrice(row).toFixed(2), ladderX - 5, rowToY(row));
      }

      // ---- DOM ladder (fixed, right edge) ----
      if (domW > 0) {
        // ease displayed depths toward the live column
        const tgt = cur.depth;
        for (let r = 0; r < rows; r++) domDisp[r] += (tgt[r] - domDisp[r]) * DOM_EASE;

        ctx.fillStyle = 'rgba(255,255,255,0.015)';
        ctx.fillRect(ladderX, 0, domW, plotH);
        const barMax = domW - 44;
        const rowH = plotH / rows;
        const curRow = cur.c;
        for (let r = 0; r < rows; r++) {
          const v = domDisp[r];
          const y = rowToY(r);
          const bid = r <= curRow;
          const near = Math.abs(r - curRow) < rows * 0.06;
          const len = Math.min(barMax, v * barMax * 1.35);
          ctx.fillStyle = bid
            ? near ? 'rgba(48,209,88,0.85)' : 'rgba(48,209,88,0.42)'
            : near ? 'rgba(255,78,66,0.85)' : 'rgba(255,78,66,0.42)';
          // bars grow left from the number column toward the axis
          ctx.fillRect(ladderX + (domW - 40) - len, y - rowH * 0.42, len, Math.max(0.9, rowH * 0.84));
        }

        // numeric depth read on the near-touch window, plus the extremes
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'right';
        const labelStep = Math.max(1, Math.round(rows / 46));
        for (let r = 0; r < rows; r++) {
          const near = Math.abs(r - curRow) < rows * 0.06;
          // near the touch, label denser (every other row) but never every row —
          // at this resolution per-row labels would collide
          const step = near ? 2 : labelStep;
          if (r % step !== 0) continue;
          const y = rowToY(r);
          const bid = r <= curRow;
          ctx.fillStyle = near ? (bid ? '#8ff0b4' : '#ff9a90') : 'rgba(150,155,163,0.7)';
          ctx.fillText(String(Math.round(domDisp[r] * 100)), W - 4, y);
        }
      }

      // ---- current price tag spanning axis + ladder ----
      ctx.fillStyle = PRICE_LINE;
      ctx.fillRect(axisX, py - 8, axisW + domW, 16);
      ctx.fillStyle = '#050505';
      ctx.textAlign = 'left';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillText(book.rowToPrice(cur.c).toFixed(2), axisX + 5, py);

      // ---- crosshair price tag on the axis ----
      if (m.on) {
        const cy = m.y;
        ctx.fillStyle = 'rgba(20,22,28,0.95)';
        ctx.fillRect(axisX, cy - 8, axisW, 16);
        ctx.strokeStyle = 'rgba(237,237,237,0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(axisX + 0.5, cy - 7.5, axisW - 1, 15);
        ctx.fillStyle = '#ededed';
        ctx.textAlign = 'right';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillText(book.rowToPrice(yToRow(cy)).toFixed(2), ladderX - 5, cy);
      }
    };

    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (!reduce) {
        acc += dt;
        while (acc >= COL_MS) {
          acc -= COL_MS;
          buf.push(book.next());
          buf.shift();
          paintField();
        }
      }
      render(reduce ? 0 : acc / COL_MS);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
    };
    // Rebuilds only on ticker change — spot/chartType are read from refs and the
    // size is handled by the ResizeObserver, so neither restarts the stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  return (
    // Transparent wrapper — the host (Trace hero frame, Pulse tile) supplies the
    // surface, so the map never double-frames.
    <div
      ref={wrapRef}
      className="w-full h-full overflow-hidden"
      style={fill ? undefined : { height: height ?? 540 }}
    >
      <canvas ref={canvasRef} className="block cursor-crosshair" />
    </div>
  );
};

export default LiquidityMap;
