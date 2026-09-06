import { useEffect, useMemo, useRef, useState } from 'react';
import type { MarketSnapshot } from '../../types/market';
import DataState from '../../components/ui/DataState';
import { motionAllowed, usePrefs } from '../../data/prefs';

/*
  Dealer-positioning surface, rendered honest-to-goodness 3D on a canvas:
  strikes across, expiries deep, net GEX tall. Slow auto-orbit, drag to spin.
  Positive structure wears the holo silver run; negative gamma burns red —
  the same grammar as every 2D exposure view in the terminal.
*/

const EXPIRY_ROWS = 9;
const PITCH = 1.05; // radians — fixed camera tilt
const AUTO_SPIN = 0.0035; // radians per frame while idle

interface SurfacePoint {
  x: number;
  y: number;
  z: number; // −1…1 normalized exposure
}

function buildSurface(snapshot: MarketSnapshot): { grid: SurfacePoint[][]; strikes: number[] } {
  const { chain, spot } = snapshot;
  const nodes = [...chain].sort((a, b) => a.strike - b.strike);
  const idx = nodes.findIndex(n => n.strike >= spot);
  const from = Math.max(0, idx - 11);
  const window = nodes.slice(from, from + 22);
  const maxAbs = Math.max(...window.map(n => Math.abs(n.netGex)), 1);

  const grid: SurfacePoint[][] = [];
  for (let e = 0; e < EXPIRY_ROWS; e++) {
    // Near expiries carry the gamma; far rows decay toward vanna-shaped remnants
    const decay = Math.exp(-e * 0.38);
    const row: SurfacePoint[] = window.map((n, s) => ({
      x: s / (window.length - 1) - 0.5,
      y: e / (EXPIRY_ROWS - 1) - 0.5,
      z: (n.netGex / maxAbs) * decay + (n.vanna / maxAbs) * (1 - decay) * 0.35,
    }));
    grid.push(row);
  }
  return { grid, strikes: window.map(n => n.strike) };
}

/** Holo silver for structure that supports, red for structure that chases. */
function strokeFor(z: number, alpha: number): string {
  if (z >= 0) {
    // interpolate chrome → ice blue → white along |z|
    const t = Math.min(Math.abs(z) * 1.4, 1);
    const r = Math.round(174 + t * 70);
    const g = Math.round(185 + t * 60);
    const b = Math.round(207 + t * 45);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  const t = Math.min(Math.abs(z) * 1.4, 1);
  return `rgba(255,${Math.round(80 - t * 30)},${Math.round(64 - t * 20)},${alpha})`;
}

interface Surface3DProps {
  snapshot: MarketSnapshot;
  height?: number;
}

const Surface3D = ({ snapshot, height = 340 }: Surface3DProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const yawRef = useRef(0.7);
  const draggingRef = useRef<{ x: number; yaw: number } | null>(null);
  const surface = useMemo(() => buildSurface(snapshot), [snapshot]);
  const surfaceRef = useRef(surface);
  surfaceRef.current = surface;
  /*
    10 — THE FLAT READ, WHEN THE SURFACE CANNOT BE DRAWN.

    `canvas.getContext('2d')` returning null used to `return` and leave a
    340px hole: a reader whose browser refuses the canvas — a hardened
    profile, a printer, an assistive rendering path — got a blank box with
    no explanation and no data. A projection is a way of LOOKING at these
    numbers, not the only way of having them.

    So the fallback is the same grid, flat: strikes across, expiries down,
    each cell inked by the value the mesh would have lifted. It is also what
    the page prints, which is the second reason to have it — a rotating
    canvas prints as whatever frame it happened to be on.
  */
  const [flat, setFlat] = useState(false);
  /*
    AND THE SPIN OBEYS THE SYSTEM. A surface that turns forever is exactly
    the animation a reader with reduced motion set at the OS level has asked
    not to be shown, and the desk's own settings copy says motion can only
    ever be reduced, never added. Still draggable — the reader moving it
    themselves is not motion imposed on them.

    Read through `usePrefs` rather than by calling `motionAllowed()` inside
    the frame, so flipping the setting re-runs the effect instead of taking
    effect on whatever the next unrelated render happens to be.
  */
  const prefs = usePrefs();
  const spin = motionAllowed(prefs.motion);
  /* And a still surface STOPS. A loop that re-draws an unchanged frame 60
     times a second is not visibly animating, but it is still a spinning fan
     on a laptop — reduced motion should cost less, not the same. */
  const kickRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setFlat(true);
      return;
    }
    let raf = 0;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      if (!draggingRef.current && spin) yawRef.current += AUTO_SPIN;
      const yaw = yawRef.current;
      const { grid } = surfaceRef.current;

      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const cosP = Math.cos(PITCH);
      const sinP = Math.sin(PITCH);
      const scale = Math.min(w, h * 1.5) * 0.62;
      const cx = w / 2;
      const cy = h / 2 + h * 0.06;

      const project = (p: SurfacePoint): [number, number, number] => {
        const rx = p.x * cosY - p.y * sinY;
        const ry = p.x * sinY + p.y * cosY;
        const sx = cx + rx * scale;
        const sy = cy + ry * cosP * scale * 0.9 - p.z * sinP * (scale * 0.28);
        return [sx, sy, ry]; // ry = depth for alpha
      };

      const alphaFor = (depth: number) => 0.28 + (0.5 - depth) * 0.5;

      // rows (strike lines per expiry)
      for (const row of grid) {
        for (let i = 0; i < row.length - 1; i++) {
          const a = project(row[i]);
          const b = project(row[i + 1]);
          const z = (row[i].z + row[i + 1].z) / 2;
          ctx.strokeStyle = strokeFor(z, Math.max(0.12, Math.min(0.9, alphaFor((a[2] + b[2]) / 2))));
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.stroke();
        }
      }
      // columns (term structure per strike)
      for (let s = 0; s < grid[0].length; s++) {
        for (let e = 0; e < grid.length - 1; e++) {
          const a = project(grid[e][s]);
          const b = project(grid[e + 1][s]);
          const z = (grid[e][s].z + grid[e + 1][s].z) / 2;
          ctx.strokeStyle = strokeFor(z, Math.max(0.08, Math.min(0.7, alphaFor((a[2] + b[2]) / 2) * 0.7)));
          ctx.lineWidth = 0.75;
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.stroke();
        }
      }

      if (spin || draggingRef.current) raf = requestAnimationFrame(draw);
      else raf = 0;
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    kickRef.current = schedule;
    schedule();
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [spin]);

  if (flat) {
    const { grid, strikes } = surface;
    return (
      <div className="flex flex-col gap-2" style={{ minHeight: height }} data-surface-fallback>
        <DataState
          kind="unavailable"
          title="The projection cannot be drawn here"
          body="This browser did not give the page a drawing surface, so the mesh is unavailable. The same numbers are below, flat: strikes across, expiries down."
          pad="sm"
        />
        <div className="overflow-x-auto">
          <table className="border-spacing-0">
            <thead>
              <tr>
                <th className="text-left font-mono text-[10px] uppercase tracking-widest text-textMuted font-normal px-2 py-1">Exp</th>
                {strikes.map(k => (
                  <th key={k} className="font-mono text-[10px] tnum text-textMuted font-normal px-1 py-1">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((row, e) => (
                <tr key={e}>
                  <td className="font-mono text-[10px] tnum text-textMuted px-2 py-0.5">+{e}</td>
                  {row.map((p, i) => (
                    <td key={i} className="px-1 py-0.5">
                      <span
                        className="block w-4 h-4"
                        title={`${strikes[i]} · expiry +${e} · ${p.z >= 0 ? 'supports' : 'chases'} ${Math.abs(p.z).toFixed(2)}`}
                        style={{ background: strokeFor(p.z, Math.min(0.15 + Math.abs(p.z), 1)) }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="relative select-none" style={{ height }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onPointerDown={e => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          draggingRef.current = { x: e.clientX, yaw: yawRef.current };
          kickRef.current();
        }}
        onPointerMove={e => {
          if (draggingRef.current) {
            yawRef.current = draggingRef.current.yaw + (e.clientX - draggingRef.current.x) * 0.008;
            kickRef.current();
          }
        }}
        onPointerUp={() => (draggingRef.current = null)}
        onPointerLeave={() => (draggingRef.current = null)}
      />
      <div className="absolute bottom-2 left-3 flex items-center gap-3 font-mono text-[9px] uppercase tracking-widest text-textMuted pointer-events-none">
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-[2px] holo-bar inline-block" /> dealer support
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-[2px] bg-bear/80 inline-block" /> negative gamma
        </span>
        <span>drag to orbit</span>
      </div>
    </div>
  );
};

export default Surface3D;
