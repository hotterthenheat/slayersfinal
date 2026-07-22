import { useMemo, useState } from 'react';
import type { MarketSnapshot } from '../../types/market';
import DealerSurface3D from '../../components/three/DealerSurface3D';
import SegmentedControl from '../../components/ui/SegmentedControl';
import HoverReadout from '../../components/ui/HoverReadout';
import { fmtUsd } from '../../data/gex';

/*
  Dealer-positioning surface: strikes across, expiries deep, net GEX tall.
  The default is a precise 2D heatmap — every strike × expiry cell is readable
  and hoverable, so exact levels don't hide inside a rotating solid. A toggle
  swaps in the WebGL 3D view for the shape-at-a-glance read. Positive structure
  reads green; negative gamma burns red — the same grammar as
  every 2D exposure view.
*/

const EXPIRY_ROWS = 11;

type View = '2d' | '3d';

const VIEW_OPTIONS = [
  { value: '2d', label: '2D' },
  { value: '3d', label: '3D' },
] as const;

interface SurfaceData {
  /** Row-major grid of normalized exposure heights (−1…1): rows = expiries, cols = strikes. */
  grid: number[][];
  strikes: number[];
  spotCol: number;
  /** max |net GEX| in the window, dollars — the surface's real scale */
  maxAbsUsd: number;
}

function buildSurface(snapshot: MarketSnapshot): SurfaceData {
  const { chain, spot } = snapshot;
  const nodes = [...chain].sort((a, b) => a.strike - b.strike);
  const idx = nodes.findIndex(n => n.strike >= spot);
  const from = Math.max(0, idx - 12);
  const window = nodes.slice(from, from + 24);
  const maxAbs = Math.max(...window.map(n => Math.abs(n.netGex)), 1);
  const strikes = window.map(n => n.strike);
  const spotFound = window.findIndex(n => n.strike >= spot);
  const spotCol = spotFound < 0 ? Math.max(0, window.length - 1) : spotFound;

  const grid: number[][] = [];
  for (let e = 0; e < EXPIRY_ROWS; e++) {
    // Near expiries carry the gamma; far rows decay toward vanna-shaped remnants
    const decay = Math.exp(-e * 0.32);
    grid.push(
      window.map(n => {
        const z = (n.netGex / maxAbs) * decay + (n.vanna / maxAbs) * (1 - decay) * 0.35;
        return Math.max(-1, Math.min(1, z));
      })
    );
  }
  return { grid, strikes, spotCol, maxAbsUsd: maxAbs };
}

/** −1…1 normalized exposure → house-grammar heatmap fill. Green = support (+), red = negative gamma (−). */
function cellColor(z: number): string {
  const t = Math.min(Math.abs(z) * 1.3, 1);
  const alpha = 0.05 + t * 0.9;
  if (z >= 0) {
    const r = Math.round(130 - t * 82);
    const g = 210;
    const b = Math.round(160 - t * 72);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  const g = Math.round(80 - t * 34);
  const b = Math.round(64 - t * 24);
  return `rgba(255,${g},${b},${alpha})`;
}

const fmtStrike = (s: number) => s.toLocaleString(undefined, { maximumFractionDigits: 1 });

interface Surface3DProps {
  snapshot: MarketSnapshot;
  height?: number;
}

const Surface3D = ({ snapshot, height = 340 }: Surface3DProps) => {
  const [view, setView] = useState<View>('2d');
  const [hover, setHover] = useState<{ r: number; c: number; z: number; x: number; y: number } | null>(null);
  const { grid, strikes, spotCol, maxAbsUsd } = useMemo(() => buildSurface(snapshot), [snapshot]);
  const cols = strikes.length;
  const rows = grid.length;
  const spotLeft = cols > 0 ? ((spotCol + 0.5) / cols) * 100 : 50;

  return (
    <div className="relative flex flex-col select-none" style={{ height }}>
      {/* view header */}
      <div className="flex items-center justify-between gap-2 px-3.5 pt-3 pb-2">
        <span className="font-mono text-[11px] uppercase tracking-widest text-textMuted truncate">
          strikes × expiries × net GEX
        </span>
        <SegmentedControl ariaLabel="Surface view" options={VIEW_OPTIONS} value={view} onChange={setView} />
      </div>

      {view === '3d' ? (
        <div className="relative flex-1 min-h-0">
          <DealerSurface3D grid={grid} strikes={strikes} spotCol={spotCol} maxAbsUsd={maxAbsUsd} />
          <div className="absolute bottom-2 right-3 font-mono text-[10px] uppercase tracking-widest text-textMuted pointer-events-none">
            drag · scroll to zoom
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col px-3.5 pb-2.5">
          <div className="flex-1 min-h-0 flex">
            {/* expiry (y) axis gutter */}
            <div className="flex flex-col justify-between items-center pr-2 py-0.5 shrink-0">
              <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">near</span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted [writing-mode:vertical-rl] rotate-180">
                expiry
              </span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">far</span>
            </div>

            <div className="flex-1 min-w-0 flex flex-col">
              {/* heatmap */}
              <div className="relative flex-1 min-h-0 rounded-sm overflow-hidden bg-borderSubtle">
                <div
                  className="absolute inset-0 grid gap-px"
                  style={{
                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                  }}
                >
                  {grid.map((row, r) =>
                    row.map((z, c) => (
                      <div
                        key={`${r}-${c}`}
                        onMouseEnter={e => setHover({ r, c, z, x: e.clientX, y: e.clientY })}
                        onMouseMove={e => setHover({ r, c, z, x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setHover(h => (h && h.r === r && h.c === c ? null : h))}
                        className="transition-[filter] hover:brightness-125 cursor-crosshair"
                        style={{ background: cellColor(z) }}
                      />
                    ))
                  )}
                </div>
                {/* spot column guide */}
                <div
                  className="absolute top-0 bottom-0 w-px bg-white/45 pointer-events-none"
                  style={{ left: `${spotLeft}%` }}
                />
              </div>

              {/* strike (x) axis */}
              <div className="relative h-4 mt-1.5">
                <span className="absolute left-0 font-mono text-[11px] text-textMuted tnum">
                  ${fmtStrike(strikes[0])}
                </span>
                <span
                  className="absolute -translate-x-1/2 font-mono text-[11px] text-textSecondary tnum whitespace-nowrap"
                  style={{ left: `${spotLeft}%` }}
                >
                  ${fmtStrike(strikes[spotCol])} spot
                </span>
                <span className="absolute right-0 font-mono text-[11px] text-textMuted tnum">
                  ${fmtStrike(strikes[cols - 1])}
                </span>
              </div>
            </div>
          </div>

          {/* legend */}
          <div className="flex items-center gap-3 pt-2 font-mono text-[11px] uppercase tracking-wider text-textMuted">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-[3px] bg-bull/90 inline-block rounded-full" /> dealer support
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-[3px] bg-bear/80 inline-block rounded-full" /> negative gamma
            </span>
            <span className="ml-auto text-[10px] tracking-widest">hover a cell for the read</span>
          </div>

          {hover && (
            <HoverReadout x={hover.x} y={hover.y}>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[12px] font-bold text-textPrimary tnum">${fmtStrike(strikes[hover.c])}</span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">
                  {hover.r < rows / 3 ? 'near' : hover.r < (2 * rows) / 3 ? 'mid' : 'far'} exp
                </span>
              </div>
              <div className={`mt-0.5 font-mono text-[13px] font-bold tnum ${hover.z >= 0 ? 'text-bull' : 'text-bear'}`}>
                {hover.z >= 0 ? '+' : '−'}
                {fmtUsd(Math.abs(hover.z * maxAbsUsd))}
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-textSecondary">
                {hover.z >= 0 ? 'dealer support · long γ' : 'negative gamma · short γ'}
              </div>
            </HoverReadout>
          )}
        </div>
      )}
    </div>
  );
};

export default Surface3D;
