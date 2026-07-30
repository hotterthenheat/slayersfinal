import { describe, it, expect } from 'vitest';
import { heatCellStyle } from './heatmap';

/** WCAG relative luminance + contrast ratio, computed independently of the
    implementation so this test can't agree with a bug by sharing its maths. */
const lin = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const lum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a: [number, number, number], b: [number, number, number]) => {
  const la = lum(...a);
  const lb = lum(...b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
const parse = (css: string): [number, number, number] => {
  const m = css.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (m) return [+m[1], +m[2], +m[3]];
  const h = css.match(/^#([0-9a-f]{6})$/i);
  if (!h) throw new Error(`unparseable colour: ${css}`);
  const n = parseInt(h[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

describe('heatCellStyle ink contrast', () => {
  // Sweep the whole signed range at a fine step. The bug this guards picked the
  // ink from a brightness threshold, and a saturated green computed 0.497 —
  // missing the flip by 0.003 and landing at 2.4:1, so the STRONGEST cells were
  // the least readable. Cell values regenerate per load, so assert the property
  // across the range rather than pinning specific values.
  const MAX = 1000;
  const samples: number[] = [];
  for (let v = -MAX; v <= MAX; v += MAX / 200) samples.push(v);

  it('never renders a cell below the 4.5:1 AA floor', () => {
    const failures: { value: number; ratio: number; bg: string; fg: string }[] = [];
    for (const v of samples) {
      const s = heatCellStyle(v, MAX);
      const bg = s.backgroundColor as string | undefined;
      const fg = s.color as string | undefined;
      if (!bg || !fg || bg.startsWith('rgba')) continue; // alpha-tinted modes sit on the panel, not a solid fill
      const r = ratio(parse(fg), parse(bg));
      if (r < 4.5) failures.push({ value: Math.round(v), ratio: +r.toFixed(2), bg, fg });
    }
    expect(failures).toEqual([]);
  });

  it('picks whichever of the two inks actually wins, not the brighter-looking one', () => {
    // At full positive intensity the fill is the ramp's brightest green; dark ink
    // must win there. At zero it is near-black; light ink must win.
    expect(heatCellStyle(MAX, MAX).color).toBe('#0a0a0a');
    expect(heatCellStyle(0, MAX).color).toBe('#ededed');
  });
});
