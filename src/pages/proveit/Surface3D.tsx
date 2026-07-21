import { useMemo } from 'react';
import type { MarketSnapshot } from '../../types/market';
import VolSurface from '../../components/three/VolSurface';

/*
  Dealer-positioning surface, now rendered in real WebGL (three.js): strikes
  across, expiries deep, net GEX tall. Positive structure wears the holo silver
  run; negative gamma burns red — the same grammar as every 2D exposure view.
  Slow auto-orbit; drag to spin and tilt.
*/

const EXPIRY_ROWS = 11;

/** Row-major grid of normalized exposure heights (−1…1): rows = expiries, cols = strikes. */
function buildSurface(snapshot: MarketSnapshot): number[][] {
  const { chain, spot } = snapshot;
  const nodes = [...chain].sort((a, b) => a.strike - b.strike);
  const idx = nodes.findIndex(n => n.strike >= spot);
  const from = Math.max(0, idx - 12);
  const window = nodes.slice(from, from + 24);
  const maxAbs = Math.max(...window.map(n => Math.abs(n.netGex)), 1);

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
  return grid;
}

interface Surface3DProps {
  snapshot: MarketSnapshot;
  height?: number;
}

const Surface3D = ({ snapshot, height = 340 }: Surface3DProps) => {
  const grid = useMemo(() => buildSurface(snapshot), [snapshot]);

  return (
    <div className="relative select-none" style={{ height }}>
      <VolSurface grid={grid} colormap="exposure" height={height} />
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
