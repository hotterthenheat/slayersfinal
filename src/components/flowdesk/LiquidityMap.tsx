import { useEffect, useRef } from 'react';
import { createLiquidityBook, thermal, type LiqColumn, type LiquidityBook } from '../../data/liquiditymap';

/*
  Bookmap-style order-book heatmap on a GPU-friendly 2D canvas.

    • The resting book is a smooth thermal field (black→blue→cyan→white→yellow→
      orange→red) drawn from a small offscreen buffer scaled up with bilinear
      smoothing, so liquidity reads as continuous evolving bands — not rectangles.
    • Candlesticks trace price through the field; executed trades are proportional
      buy/sell bubbles.
    • A fixed DOM ladder pins to the right edge.
    • The field streams right→left by advancing a stateful book one column at a
      time and gliding sub-column between pushes — a fixed viewport with zero
      layout shift, resize jitter or redraw flicker.
*/

interface LiquidityMapProps {
  ticker: string;
  spot: number;
  height?: number;
}

const COLS = 190; // visible time columns
const COL_MS = 95; // ms between new columns (~10.5 cols/sec)
const AXIS_W = 46; // price-axis strip between heatmap and ladder
const DOM_W = 120; // DOM ladder width
const TIME_H = 0;

const CANDLE_UP = '#30D158';
const CANDLE_DN = '#FF3B30';

const LiquidityMap = ({ ticker, spot, height = 540 }: LiquidityMapProps) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // capture spot so live ticks don't rebuild the streaming book — it rebuilds
  // only when the ticker changes.
  const spotRef = useRef(spot);
  spotRef.current = spot;

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const book: LiquidityBook = createLiquidityBook(ticker, spotRef.current || 500, 132);
    const rows = book.rows;

    // rolling buffer of the visible columns (oldest→newest left→right)
    const buf: LiqColumn[] = [];
    for (let i = 0; i < COLS; i++) buf.push(book.next());

    // offscreen thermal field (COLS × rows) — rebuilt only when a column is pushed
    const field = document.createElement('canvas');
    field.width = COLS;
    field.height = rows;
    const fctx = field.getContext('2d')!;
    const img = fctx.createImageData(COLS, rows);
    const rgb: [number, number, number] = [0, 0, 0];

    const paintField = () => {
      const data = img.data;
      for (let x = 0; x < COLS; x++) {
        const depth = buf[x].depth;
        for (let r = 0; r < rows; r++) {
          thermal(depth[r], rgb);
          // flip vertically: high row (high price) at top
          const p = ((rows - 1 - r) * COLS + x) * 4;
          data[p] = rgb[0];
          data[p + 1] = rgb[1];
          data[p + 2] = rgb[2];
          data[p + 3] = 255;
        }
      }
      fctx.putImageData(img, 0, 0);
    };
    paintField();

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = height;
    let heatW = 0;
    let plotH = 0;

    const resize = () => {
      const w = wrap.clientWidth;
      if (!w) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = w;
      H = height;
      heatW = W - AXIS_W - DOM_W;
      plotH = H - TIME_H;
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

    let last = performance.now();
    let acc = 0;
    let raf = 0;

    const render = (sub: number) => {
      const colW = heatW / (COLS - 1);
      ctx.clearRect(0, 0, W, H);

      // ---- heatmap field (scaled up, smoothed, sub-column offset) ----
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, heatW, plotH);
      ctx.clip();
      // draw the COLS-wide field to COLS*colW, shifted left by sub*colW
      ctx.drawImage(field, 0, 0, COLS, rows, -sub * colW, 0, COLS * colW, plotH);
      ctx.restore();

      const xOf = (i: number) => (i - sub) * colW;

      // ---- candlesticks ----
      const bodyW = Math.max(1.4, colW * 0.62);
      for (let i = 0; i < COLS; i++) {
        const col = buf[i];
        const x = xOf(i);
        if (x < -colW || x > heatW + colW) continue;
        const up = col.c >= col.o;
        ctx.strokeStyle = up ? CANDLE_UP : CANDLE_DN;
        ctx.fillStyle = up ? CANDLE_UP : CANDLE_DN;
        ctx.globalAlpha = 0.9;
        // wick
        ctx.lineWidth = Math.max(0.75, colW * 0.14);
        ctx.beginPath();
        ctx.moveTo(x, rowToY(col.h));
        ctx.lineTo(x, rowToY(col.l));
        ctx.stroke();
        // body
        const yo = rowToY(col.o);
        const yc = rowToY(col.c);
        const top = Math.min(yo, yc);
        const bh = Math.max(1, Math.abs(yc - yo));
        ctx.fillRect(x - bodyW / 2, top, bodyW, bh);
      }
      ctx.globalAlpha = 1;

      // ---- executed trades (proportional bubbles) ----
      for (let i = 0; i < COLS; i++) {
        const col = buf[i];
        const x = xOf(i);
        if (x < -8 || x > heatW + 8) continue;
        for (const tr of col.trades) {
          const rad = Math.max(1.4, Math.sqrt(tr.size) * 0.9);
          ctx.beginPath();
          ctx.arc(x, rowToY(tr.row), rad, 0, Math.PI * 2);
          ctx.fillStyle = tr.buy ? 'rgba(48,209,88,0.55)' : 'rgba(255,59,48,0.55)';
          ctx.fill();
          ctx.lineWidth = 0.6;
          ctx.strokeStyle = tr.buy ? 'rgba(120,240,160,0.7)' : 'rgba(255,140,130,0.7)';
          ctx.stroke();
        }
      }

      // ---- current price line + tag ----
      const cur = buf[COLS - 1];
      const py = rowToY(cur.c);
      ctx.strokeStyle = 'rgba(237,237,237,0.7)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(heatW, py);
      ctx.stroke();
      ctx.setLineDash([]);

      // ---- single price-axis strip (between heatmap and ladder) ----
      const ladderX = W - DOM_W;
      const axisX = heatW; // strip [heatW, ladderX]
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(axisX, 0, AXIS_W, plotH);
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#7a7f88';
      const ticks = 8;
      for (let k = 0; k <= ticks; k++) {
        const row = (k / ticks) * (rows - 1);
        ctx.fillText(book.rowToPrice(row).toFixed(2), ladderX - 5, rowToY(row));
      }

      // ---- DOM ladder (fixed, right edge): bid green below price, ask red above ----
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      ctx.fillRect(ladderX, 0, DOM_W, plotH);
      const domDepth = cur.depth;
      let dMax = 0.0001;
      for (let r = 0; r < rows; r++) if (domDepth[r] > dMax) dMax = domDepth[r];
      const barMax = DOM_W - 8;
      const rowH = plotH / rows;
      for (let r = 0; r < rows; r++) {
        const v = domDepth[r];
        const y = rowToY(r);
        const below = r <= cur.c;
        const len = (v / dMax) * barMax;
        ctx.fillStyle = below ? 'rgba(48,209,88,0.5)' : 'rgba(255,59,48,0.5)';
        ctx.fillRect(ladderX + 4, y - rowH / 2, len, Math.max(0.8, rowH));
      }
      // current price tag spanning the axis + ladder
      ctx.fillStyle = '#ededed';
      ctx.fillRect(axisX, py - 8, AXIS_W + DOM_W, 16);
      ctx.fillStyle = '#050505';
      ctx.textAlign = 'left';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillText(book.rowToPrice(cur.c).toFixed(2), axisX + 5, py);
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
    };
    // Rebuilds only on ticker/height change — spot is read from spotRef so live
    // ticks never restart the stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, height]);

  return (
    <div ref={wrapRef} className="w-full inst-surface rounded-md overflow-hidden" style={{ height }}>
      <canvas ref={canvasRef} className="block" />
    </div>
  );
};

export default LiquidityMap;
