/*
==================================================
  SLAYER TERMINAL - HERO SCENE (landing)
  The hero backdrop IS the product: a live, slowly
  orbiting quant exposure surface rendered in real
  WebGL (three.js) — silver ridges of dealer support,
  red valleys of negative gamma. No external scene
  URL, no heavy runtime; WebGL failure degrades to a
  gradient. Replaces the old community Spline scene.
==================================================
*/

import VolSurface from '../../components/three/VolSurface';

const ROWS = 22;
const COLS = 30;

/** A smooth, deterministic exposure-shaped surface: a silver support ridge,
    a red short-gamma valley, and a fine ripple across the term structure. */
const HERO_GRID: number[][] = (() => {
  const g: number[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: number[] = [];
    for (let c = 0; c < COLS; c++) {
      const x = (c / (COLS - 1) - 0.5) * 2;
      const y = (r / (ROWS - 1) - 0.5) * 2;
      const ridge = Math.exp(-((x - 0.28) ** 2 + (y + 0.18) ** 2) * 2.1) * 0.95;
      const valley = Math.exp(-((x + 0.52) ** 2 + (y - 0.42) ** 2) * 3.0) * 0.6;
      const ripple = Math.sin(x * 3.1 + y * 2.0) * 0.11;
      row.push(Math.max(-1, Math.min(1, ridge - valley + ripple)));
    }
    g.push(row);
  }
  return g;
})();

const HeroScene = () => (
  <div
    className="w-full h-full overflow-hidden"
    aria-hidden
    style={{ background: 'radial-gradient(ellipse at 65% 45%, #101015 0%, #050505 70%)' }}
  >
    <VolSurface grid={HERO_GRID} colormap="exposure" height="100%" cursorReactive />
  </div>
);

export default HeroScene;
