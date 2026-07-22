import * as THREE from 'three';

/*
  Shared colour ramps for the Quant Lab 3D surface tiles. Each ramp maps a
  normalized height to an RGB colour in the same grammar as a scientific
  colormap, and exposes a matching CSS gradient for the panel's colourbar
  legend. Kept in one place so the mesh and the legend never drift.

    spectral  — IV surface: deep blue (low) → cyan → green → amber → red (high)
    gamma     — dealer gamma: diverging, green ridges (+) / red troughs (−)
    magma     — open interest: near-black → violet → magenta → warm amber
*/

export type RampKind = 'spectral' | 'gamma' | 'magma';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

type Stop = [pos: number, r: number, g: number, b: number];

const SPECTRAL: Stop[] = [
  [0.0, 0.03, 0.18, 0.42],
  [0.22, 0.09, 0.5, 0.8],
  [0.42, 0.16, 0.78, 0.66],
  [0.6, 0.55, 0.85, 0.24],
  [0.78, 0.97, 0.74, 0.13],
  [1.0, 0.93, 0.26, 0.12],
];

const MAGMA: Stop[] = [
  [0.0, 0.02, 0.02, 0.09],
  [0.28, 0.22, 0.07, 0.36],
  [0.52, 0.5, 0.12, 0.5],
  [0.72, 0.83, 0.24, 0.44],
  [0.88, 0.98, 0.5, 0.34],
  [1.0, 0.99, 0.79, 0.42],
];

function sample(stops: Stop[], t: number, out: THREE.Color): THREE.Color {
  const x = clamp(t, 0, 1);
  let i = 0;
  while (i < stops.length - 1 && x > stops[i + 1][0]) i++;
  const a = stops[i];
  const b = stops[Math.min(i + 1, stops.length - 1)];
  const f = (x - a[0]) / (b[0] - a[0] || 1);
  out.setRGB(a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f);
  return out;
}

/** Normalized height (spectral/magma: 0…1; gamma: −1…1) → RGB. */
export function rampColor(z: number, kind: RampKind, out: THREE.Color): THREE.Color {
  if (kind === 'gamma') {
    // diverging: green support (+) vs hot red (−); brightness scales with magnitude
    const t = Math.min(Math.abs(z) * 1.25, 1);
    const b = 0.12 + t * 0.8;
    if (z >= 0) out.setRGB(b * 0.24, b, b * 0.46);
    else out.setRGB(b, b * 0.2, b * 0.17);
    return out;
  }
  return sample(kind === 'magma' ? MAGMA : SPECTRAL, z, out);
}

/** CSS linear-gradient (left = low) for the colourbar legend beside each surface. */
export const RAMP_CSS: Record<RampKind, string> = {
  spectral: 'linear-gradient(to top, #082e6b, #1780cc, #29c7a8, #8cd93d, #f7bd21, #ed431f)',
  gamma: 'linear-gradient(to top, #d43329, #7a1a15, #0a0a0d, #187a3f, #30d158)',
  magma: 'linear-gradient(to top, #05050f, #38125c, #801f80, #d43d70, #fa8057, #fcc96b)',
};
