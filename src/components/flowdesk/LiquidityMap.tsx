import { useEffect, useRef } from 'react';
import { createLiquidityBook, thermal, type LiqColumn, type LiquidityBook } from '../../data/liquiditymap';

/*
  Bookmap-style order-flow heatmap on a GPU-friendly 2D canvas.

    • The resting book is a smooth thermal field (black→blue→cyan→white→yellow→
      orange→red) drawn from a small offscreen buffer scaled up with bilinear
      smoothing — continuous evolving bands, not rectangles. A gamma lift brings
      out subtle deep-blue mid-tones; a 256-entry LUT keeps the lookup cheap.
    • Price traces the field as candles, a line, or pure trade bubbles.
    • A stack of TOGGLE-ABLE overlays rides the same surface — all from real or
      derived-from-the-book data, nothing fabricated:
        flow      soft-glow trade bubbles (grow-in, natural overlap)
        volume    executed size per column, in a bottom strip
        delta     cumulative buy−sell, a line in the same strip
        darkpool  off-exchange shelves as tagged horizontal levels
        crosshair a cursor read on the price axis
    • A live DOM ladder pins to the right; depths ease toward their targets so
      the numbers tween rather than snapping.
    • The field streams right→left in a fixed viewport — zero layout shift.
*/

export type LiqChartType = 'candle' | 'line' | 'bubbles';

export interface LiqOverlays {
  flow: boolean;
  volume: boolean;
  delta: boolean;
  darkpool: boolean;
  crosshair: boolean;
}

/** A dark-pool shelf to draw as a tagged horizontal level (real data upstream). */
export interface LiqDPLevel {
  price: number;
  notional: number;
}

export const DEFAULT_OVERLAYS: LiqOverlays = {
  flow: true,
  volume: true,
  delta: true,
  darkpool: true,
  crosshair: true,
};

interface LiquidityMapProps {
  ticker: string;
  spot: number;
  /** Fixed pixel height. Omit (or pass `fill`) to fill the parent element. */
  height?: number;
  fill?: boolean;
  chartType?: LiqChartType;
  overlays?: LiqOverlays;
  darkPoolLevels?: LiqDPLevel[];
}

const COLS = 210; // visible time columns
const COL_MS = 90; // ms between new columns (~11 cols/sec)
const GAMMA = 0.72; // lifts low depths into the blue mid-tones
const GROW_COLS = 1.9; // columns over which a fresh bubble eases in
const DOM_EASE = 0.14; // per-frame approach for the tweened ladder depths
const SCALE_EASE = 0.06; // per-frame approach for the strip auto-scales

const CANDLE_UP = '#30D158';
const CANDLE_DN = '#FF3B30';
const PRICE_LINE = '#ededed';
const DP_COLOR = '45,212,191'; // house darkpool token (#2dd4bf) — off-exchange, one color app-wide

const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);

const fmtNotional = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(0)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${n | 0}`;

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

const LiquidityMap = ({ ticker, spot, height, fill, chartType = 'candle', overlays, darkPoolLevels }: LiquidityMapProps) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Capture props that shouldn't restart the stream. Live ticks (spot), the
  // chart type, overlay toggles and dark-pool levels are all read from refs
  // inside the render loop, so only the ticker rebuilds the book.
  const spotRef = useRef(spot);
  spotRef.current = spot;
  const chartRef = useRef<LiqChartType>(chartType);
  chartRef.current = chartType;
  const ovRef = useRef<LiqOverlays>(overlays ?? DEFAULT_OVERLAYS);
  ovRef.current = overlays ?? DEFAULT_OVERLAYS;
  const dpRef = useRef<LiqDPLevel[]>(darkPoolLevels ?? []);
  dpRef.current = darkPoolLevels ?? [];
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

    // tweened DOM depths + eased auto-scales for the bottom strip
    const domDisp = new Float32Array(rows);
    domDisp.set(buf[COLS - 1].depth);
    let volScale = 1;
    let cumScale = 1;

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
          const p = ((rows - 1 - r) * COLS + x) * 4; // flip: high price on top
          data[p] = lut[li];
          data[p + 1] = lut[li + 1];
          data[p + 2] = lut[li + 2];
          data[p + 3] = 255;
        }
      }
      fctx.putImageData(img, 0, 0);
    };
    paintField();

    // per-column executed buy/sell size — derived once per push, reused each frame
    const buyVol = new Float32Array(COLS);
    const sellVol = new Float32Array(COLS);
    const recomputeVols = () => {
      for (let i = 0; i < COLS; i++) {
        let b = 0;
        let s = 0;
        for (const tr of buf[i].trades) (tr.buy ? (b += tr.size) : (s += tr.size));
        buyVol[i] = b;
        sellVol[i] = s;
      }
    };
    recomputeVols();

    // ---- geometry (recomputed on resize) ----
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;
    let heatW = 0;
    let axisW = 50;
    let domW = 128;

    const resize = () => {
      const w = wrap.clientWidth;
      const h = fill ? wrap.clientHeight : height ?? 540;
      if (!w || !h) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = w;
      H = h;
      domW = W >= 560 ? 128 : W >= 420 ? 96 : 0;
      axisW = W >= 360 ? 50 : 38;
      heatW = W - axisW - domW;
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

    // ---- cursor tracking ----
    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, on: true };
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
      const ov = ovRef.current;
      const dps = dpRef.current;
      const colW = heatW / (COLS - 1);

      // The bottom strip appears only when volume/delta are on; the heatmap
      // plot shrinks to make room so nothing ever overlaps.
      const stripOn = ov.volume || ov.delta;
      const stripH = stripOn ? Math.max(54, Math.min(120, H * 0.15)) : 0;
      const gap = stripOn ? 8 : 0;
      const plotH = H - stripH - gap;
      const rowToY = (row: number) => plotH - (row / (rows - 1)) * plotH;
      const yToRow = (y: number) => (1 - y / plotH) * (rows - 1);
      const xOf = (i: number) => (i - sub) * colW;

      ctx.clearRect(0, 0, W, H);

      // ---- heatmap field (scaled up, smoothed, sub-column offset) ----
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, heatW, plotH);
      ctx.clip();
      ctx.drawImage(field, 0, 0, COLS, rows, -sub * colW, 0, COLS * colW, plotH);

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
      if (ov.flow) {
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
            const d = baseR * scale * 3.1;
            ctx.globalAlpha = baseAlpha * (0.5 + 0.5 * growIn);
            ctx.drawImage(tr.buy ? buySprite : sellSprite, x - d / 2, rowToY(tr.row) - d / 2, d, d);
          }
        }
        ctx.globalAlpha = 1;
      }

      // ---- dark-pool shelves (tagged horizontal levels) ----
      if (ov.darkpool && dps.length) {
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.textBaseline = 'middle';
        for (const lv of dps) {
          const row = book.priceToRow(lv.price);
          if (row < 0 || row > rows - 1) continue;
          const y = rowToY(row);
          ctx.strokeStyle = `rgba(${DP_COLOR},0.5)`;
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 4]);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(heatW, y);
          ctx.stroke();
          ctx.setLineDash([]);
          const label = `DP ${fmtNotional(lv.notional)}`;
          const tw = ctx.measureText(label).width + 10;
          const tx = heatW - tw - 3;
          ctx.fillStyle = 'rgba(10,12,20,0.82)';
          ctx.fillRect(tx, y - 7, tw, 14);
          ctx.fillStyle = `rgba(${DP_COLOR},0.95)`;
          ctx.textAlign = 'left';
          ctx.fillText(label, tx + 5, y);
        }
      }

      // ---- current price line ----
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

      // ---- crosshair (cursor), only over the heatmap ----
      const m = mouseRef.current;
      const crossOn = ov.crosshair && m.on && m.x <= heatW && m.y <= plotH && m.y >= 0;
      if (crossOn) {
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
      ctx.restore();

      // ---- bottom strip: volume histogram + cumulative-delta line ----
      if (stripOn) {
        const sy0 = plotH + gap;
        const sy1 = H;
        const sh = sy1 - sy0;
        ctx.fillStyle = 'rgba(255,255,255,0.015)';
        ctx.fillRect(0, sy0, heatW, sh);

        if (ov.volume) {
          let vMax = 1;
          for (let i = 0; i < COLS; i++) {
            const v = buyVol[i] + sellVol[i];
            if (v > vMax) vMax = v;
          }
          volScale += (vMax - volScale) * SCALE_EASE;
          const bw = Math.max(1, colW * 0.7);
          for (let i = 0; i < COLS; i++) {
            const x = xOf(i);
            if (x < -colW || x > heatW + colW) continue;
            const v = buyVol[i] + sellVol[i];
            const bh = (v / volScale) * sh * 0.92;
            ctx.fillStyle = buyVol[i] >= sellVol[i] ? 'rgba(48,209,88,0.5)' : 'rgba(255,78,66,0.5)';
            ctx.fillRect(x - bw / 2, sy1 - bh, bw, bh);
          }
        }

        if (ov.delta) {
          // running cumulative delta across the window, auto-scaled and centred
          let cum = 0;
          let cMax = 1;
          const cy = sy0 + sh / 2;
          const pts: number[] = new Array(COLS);
          for (let i = 0; i < COLS; i++) {
            cum += buyVol[i] - sellVol[i];
            pts[i] = cum;
            const a = Math.abs(cum);
            if (a > cMax) cMax = a;
          }
          cumScale += (cMax - cumScale) * SCALE_EASE;
          // zero baseline
          ctx.strokeStyle = 'rgba(237,237,237,0.12)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, cy);
          ctx.lineTo(heatW, cy);
          ctx.stroke();
          // the line
          ctx.beginPath();
          for (let i = 0; i < COLS; i++) {
            const x = xOf(i);
            const y = cy - (pts[i] / cumScale) * (sh / 2) * 0.9;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = pts[COLS - 1] >= 0 ? 'rgba(70,210,235,0.55)' : 'rgba(220,120,240,0.5)';
          ctx.lineWidth = 3.2;
          ctx.stroke();
          ctx.strokeStyle = pts[COLS - 1] >= 0 ? '#46d2eb' : '#dc78f0';
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }

        // strip labels
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(150,155,163,0.7)';
        ctx.fillText(ov.volume && ov.delta ? 'VOLUME · Δ' : ov.volume ? 'VOLUME' : 'CUM DELTA', 6, sy0 + 4);
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
          ctx.fillRect(ladderX + (domW - 40) - len, y - rowH * 0.42, len, Math.max(0.9, rowH * 0.84));
        }

        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'right';
        const labelStep = Math.max(1, Math.round(rows / 46));
        for (let r = 0; r < rows; r++) {
          const near = Math.abs(r - curRow) < rows * 0.06;
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
      if (crossOn) {
        const cyv = m.y;
        ctx.fillStyle = 'rgba(20,22,28,0.95)';
        ctx.fillRect(axisX, cyv - 8, axisW, 16);
        ctx.strokeStyle = 'rgba(237,237,237,0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(axisX + 0.5, cyv - 7.5, axisW - 1, 15);
        ctx.fillStyle = '#ededed';
        ctx.textAlign = 'right';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillText(book.rowToPrice(yToRow(cyv)).toFixed(2), ladderX - 5, cyv);
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
          recomputeVols();
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
    // Rebuilds only on ticker change — spot/chartType/overlays/dark-pool levels
    // are read from refs and the size is handled by the ResizeObserver.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  return (
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
