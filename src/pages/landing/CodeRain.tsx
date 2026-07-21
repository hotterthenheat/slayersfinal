/*
==================================================
  SLAYER TERMINAL - CODE-RAIN (hero backdrop)
  A faithful rebuild of the real slayerterminal.com
  hero: columns of tinted terminal output raining up
  and down over pure black. Steel = SkyVision, amber =
  Pinpoint/dealer-flow, dim = the rest. Layered on top:
  a cursor-following light that lifts the glyphs beneath
  the pointer (mix-blend screen) — the terminal reacts
  to you. Reduced-motion freezes the columns.
  DOM columns + CSS transforms — GPU-cheap, no canvas.
==================================================
*/

import { useEffect, useMemo, useRef, useState } from 'react';
import { RAIN_POOL, tintFor, type RainTint } from './rainPool';

interface Column {
  left: number; // %
  dur: number; // s
  delay: number; // s (negative — starts mid-cycle)
  opacity: number;
  up: boolean;
  lines: string[]; // one set; rendered twice for a seamless loop
}

const TINT_COLOR: Record<RainTint, string> = {
  steel: '#6A93B5',
  amber: '#C79350',
  bright: '#6B7177',
  '': '#454E58',
};

const LINES_PER_COL = 30;

/** Deterministic-enough shuffle pick — UI noise, so Math.random is fine here. */
function pickLines(): string[] {
  const out: string[] = [];
  for (let i = 0; i < LINES_PER_COL; i++) {
    out.push(RAIN_POOL[Math.floor(Math.random() * RAIN_POOL.length)]);
  }
  return out;
}

const CodeRain = ({ className = '' }: { className?: string }) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [cols, setCols] = useState(0);
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // column count tracks width (matches the real site's 4–10 band, a touch denser)
  useEffect(() => {
    const compute = () => {
      const w = wrapRef.current?.clientWidth ?? window.innerWidth;
      setCols(Math.max(5, Math.min(12, Math.floor(w / 155))));
    };
    compute();
    const ro = new ResizeObserver(compute);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const columns = useMemo<Column[]>(() => {
    if (!cols) return [];
    const arr: Column[] = [];
    for (let c = 0; c < cols; c++) {
      const dur = 40 + Math.random() * 46;
      arr.push({
        left: c * (100 / cols) + (Math.random() * 3 - 1.5),
        dur,
        delay: -Math.random() * dur,
        opacity: 0.4 + Math.random() * 0.22,
        up: Math.random() > 0.5,
        lines: pickLines(),
      });
    }
    return arr;
  }, [cols]);

  // cursor light — write pointer position into CSS vars, rAF-throttled
  useEffect(() => {
    if (reduce) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    let raf = 0;
    let tx = 50;
    let ty = 40; // target %, easing toward it
    let cx = 50;
    let cy = 40;
    let alive = true;

    const onMove = (e: PointerEvent) => {
      const r = wrap.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width) * 100;
      ty = ((e.clientY - r.top) / r.height) * 100;
    };
    const loop = () => {
      if (!alive) return;
      cx += (tx - cx) * 0.12;
      cy += (ty - cy) * 0.12;
      wrap.style.setProperty('--mx', `${cx.toFixed(2)}%`);
      wrap.style.setProperty('--my', `${cy.toFixed(2)}%`);
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
    };
  }, [reduce]);

  return (
    <div
      ref={wrapRef}
      className={`absolute inset-0 overflow-hidden ${className}`}
      style={{ background: '#08090A', ['--mx' as string]: '50%', ['--my' as string]: '40%' }}
      aria-hidden
    >
      {/* rain columns */}
      {columns.map((col, i) => (
        <div
          key={i}
          className={reduce ? 'rain-col rain-static' : 'rain-col'}
          style={{
            position: 'absolute',
            top: 0,
            left: `${col.left}%`,
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            whiteSpace: 'nowrap',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: '12px',
            fontWeight: 500,
            lineHeight: 1.85,
            letterSpacing: '0.01em',
            userSelect: 'none',
            willChange: 'transform',
            opacity: reduce ? 0.28 : col.opacity,
            animation: reduce
              ? 'none'
              : `${col.up ? 'rain-up' : 'rain-down'} ${col.dur}s linear infinite`,
            animationDelay: `${col.delay}s`,
          }}
        >
          {[...col.lines, ...col.lines].map((line, j) => {
            const t = tintFor(line);
            return (
              <span key={j} style={{ color: TINT_COLOR[t], opacity: t === 'steel' || t === 'amber' ? 0.72 : 1 }}>
                {line}
              </span>
            );
          })}
        </div>
      ))}

      {/* cursor light — lifts the glyphs beneath the pointer */}
      {!reduce && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            mixBlendMode: 'screen',
            background:
              'radial-gradient(circle 300px at var(--mx) var(--my), rgba(199,211,232,0.26) 0%, rgba(199,211,232,0.09) 32%, transparent 64%)',
          }}
        />
      )}
    </div>
  );
};

export default CodeRain;
