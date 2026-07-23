import type { CSSProperties } from 'react';

/*
  Heatmap cell coloring for the GEX matrix + ladders.

  Diverging ramp palettes (positive = stabilizing GEX, negative = accelerating):
    'thermal'     — cool steel/ice-blue (+) ↔ warm amber/orange (−). Reads as a
                    pressure map: hot = dealers accelerate, cool = they stabilize.
    'teal-violet' — teal (+) ↔ violet (−). Modern, distinctive.
    'gold-slate'  — gold (+) ↔ slate-blue (−). Premium, restrained.

  Legacy modes:
    'hybrid'      — mono base, extreme cells pick up a whisper of emerald/rose.
    'mono'        — black↔white spectrum, gray neutral.
    'diverging'   — emerald (+) / rose (−) washes.

  Flip HEAT_MODE to switch instantly.
*/
export type HeatMode =
  | 'green-red'
  | 'pastel'
  | 'spectrum'
  | 'amber'
  | 'redwood'
  | 'thermal'
  | 'teal-violet'
  | 'gold-slate'
  | 'hybrid'
  | 'mono'
  | 'diverging';

// `as HeatMode` stops TS from narrowing to the literal so the other branches stay legal.
// green-red: positive GEX = green (stabilizing), negative = red — the house grammar,
// keeping flip (baby-blue) and king (magenta) unambiguous on the chart.
export const HEAT_MODE = 'green-red' as HeatMode;

type RGB = [number, number, number];
type Stops = [number, RGB][];

const NEUTRAL: RGB = [42, 42, 42]; // dark gray — sits calmly on the panel surface

interface RampPalette {
  pos: Stops;
  neg: Stops;
  gradient: string;
}

// Ramps run from neutral (t=0) → extreme (t=1)
const RAMPS: Record<'green-red' | 'pastel' | 'spectrum' | 'amber' | 'redwood' | 'thermal' | 'teal-violet' | 'gold-slate', RampPalette> = {
  // House diverging: green (+, stabilizing) ↔ red (−, accelerating). Neutral stays
  // dark so near-zero cells recede; poles are the bull/bear tokens.
  'green-red': {
    pos: [
      [0.0, NEUTRAL],
      [0.5, [30, 120, 63]],
      [1.0, [48, 209, 88]], // bull #30D158
    ],
    neg: [
      [0.0, NEUTRAL],
      [0.5, [122, 32, 30]],
      [1.0, [255, 59, 48]], // bear #FF3B30
    ],
    gradient: 'linear-gradient(to bottom, #30D158 0%, #1E783F 32%, #2a2a2a 50%, #7A201E 68%, #FF3B30 100%)',
  },
  // Requested pastel scheme — cool blues (+, stabilizing) ↔ warm lavender/cream
  // (−, accelerating). Softer than the punchy schemes; neutral stays dark so
  // near-zero cells recede into the panel.
  pastel: {
    pos: [
      [0.0, NEUTRAL],
      [0.5, [175, 212, 216]], // #AFD4D8 powder blue
      [1.0, [151, 136, 196]], // #9788C4 periwinkle
    ],
    neg: [
      [0.0, NEUTRAL],
      [0.5, [188, 169, 209]], // #BCA9D1 lavender
      [1.0, [239, 232, 224]], // #EFE8E0 cream
    ],
    gradient:
      'linear-gradient(to bottom, #9788C4 0%, #AFD4D8 32%, #2a2a2a 50%, #BCA9D1 68%, #EFE8E0 100%)',
  },
  // Periwinkle → blue → cyan (+) ↔ pale pink → plum (−), gray neutral
  spectrum: {
    pos: [
      [0.0, NEUTRAL],
      [0.4, [137, 161, 239]], // #89A1EF periwinkle
      [0.7, [0, 165, 224]], //   #00A5E0 fresh sky
      [1.0, [50, 203, 255]], //  #32CBFF sky aqua
    ],
    neg: [
      [0.0, NEUTRAL],
      [0.4, [254, 206, 241]], // #FECEF1 petal frost
      [1.0, [239, 156, 218]], // #EF9CDA plum
    ],
    gradient:
      'linear-gradient(to bottom, #32CBFF 0%, #00A5E0 18%, #89A1EF 38%, #2a2a2a 50%, #FECEF1 72%, #EF9CDA 100%)',
  },
  // Cool blue (+) ↔ bright amber/gold (−). High-contrast on dark; uses the
  // requested FFD000/FFB700 yellows for the strongly-visible negative pole.
  amber: {
    pos: [
      [0.0, NEUTRAL],
      [0.4, [46, 92, 132]],
      [0.72, [74, 150, 208]],
      [1.0, [122, 196, 240]],
    ],
    neg: [
      [0.0, NEUTRAL],
      [0.4, [150, 110, 24]],
      [0.72, [255, 208, 0]], //  #FFD000 jonquil
      [1.0, [255, 183, 0]], //   #FFB700 selective yellow
    ],
    gradient:
      'linear-gradient(to bottom, #7AC4F0 0%, #4A96D0 20%, #2E5C84 38%, #2A2929 50%, #966E18 62%, #FFD000 82%, #FFB700 100%)',
  },
  // Cool Blue / Light Grayish (+) ↔ Redwood / Burnt Umber (−), gray neutral
  redwood: {
    pos: [
      [0.0, NEUTRAL],
      [0.42, [17, 48, 71]], //  #113047 cool blue
      [0.72, [115, 154, 185]], // #739ab9 light grayish blue
      [1.0, [168, 197, 218]], //  brighter steel
    ],
    neg: [
      [0.0, NEUTRAL],
      [0.42, [109, 18, 11]], //  #6d120b burnt umber
      [0.72, [176, 42, 41]], //  #b02a29 redwood
      [1.0, [214, 82, 76]], //   brighter red
    ],
    gradient:
      'linear-gradient(to bottom, #A8C5DA 0%, #739ab9 20%, #113047 40%, #2a2a2a 50%, #6d120b 64%, #b02a29 82%, #D6524C 100%)',
  },
  thermal: {
    pos: [
      [0.0, NEUTRAL],
      [0.4, [96, 120, 168]], //  slate
      [0.7, [56, 140, 210]], //  steel blue
      [1.0, [80, 190, 245]], //  ice blue
    ],
    neg: [
      [0.0, NEUTRAL],
      [0.4, [196, 122, 54]], //  ember (brighter)
      [0.7, [242, 158, 48]], //  amber
      [1.0, [255, 188, 72]], //  bright orange
    ],
    gradient:
      'linear-gradient(to bottom, #50BEF5 0%, #388CD2 20%, #6078A8 38%, #2a2a2a 50%, #C47A36 64%, #F29E30 82%, #FFBC48 100%)',
  },
  'teal-violet': {
    pos: [
      [0.0, NEUTRAL],
      [0.45, [40, 120, 110]],
      [0.75, [30, 170, 150]],
      [1.0, [45, 212, 191]],
    ],
    neg: [
      [0.0, NEUTRAL],
      [0.45, [110, 88, 150]],
      [0.75, [140, 110, 220]],
      [1.0, [167, 139, 250]],
    ],
    gradient:
      'linear-gradient(to bottom, #2DD4BF 0%, #1EAA96 22%, #2a2a2a 50%, #8C6EDC 78%, #A78BFA 100%)',
  },
  'gold-slate': {
    pos: [
      [0.0, NEUTRAL],
      [0.45, [138, 112, 52]],
      [0.75, [196, 158, 60]],
      [1.0, [224, 184, 78]],
    ],
    neg: [
      [0.0, NEUTRAL],
      [0.45, [78, 94, 128]],
      [0.75, [82, 112, 168]],
      [1.0, [110, 140, 198]],
    ],
    gradient:
      'linear-gradient(to bottom, #E0B84E 0%, #C49E3C 22%, #2a2a2a 50%, #5270A8 78%, #6E8CC6 100%)',
  },
};

function lerp(a: number, b: number, u: number): number {
  return Math.round(a + (b - a) * u);
}

function rampColor(stops: Stops, t: number): RGB {
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t <= t1) {
      const u = (t - t0) / (t1 - t0 || 1);
      return [lerp(c0[0], c1[0], u), lerp(c0[1], c1[1], u), lerp(c0[2], c1[2], u)];
    }
  }
  return stops[stops.length - 1][1];
}

function perceivedLuminance([r, g, b]: RGB): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Raw ramp color for a signed value — used by the on-chart node overlay. */
export function heatRgb(value: number, maxAbs: number): RGB {
  const t = Math.min(1, Math.abs(value) / (maxAbs || 1));
  const r = RAMPS[HEAT_MODE as keyof typeof RAMPS];
  if (r) return rampColor(value >= 0 ? r.pos : r.neg, t);
  // grayscale fallback for the legacy mono/hybrid/diverging modes
  const lum = value >= 0 ? 0.3 + t * 0.6 : 0.3;
  const c = Math.round(lum * 255);
  return [c, c, c];
}

const CHROME: RGB = [48, 209, 88]; // positive GEX = green (silver is selection-only)
const ROSE: RGB = [255, 59, 48];
const TINT_START = 0.78;
const TINT_MAX = 0.5;

const ramp = RAMPS[HEAT_MODE as keyof typeof RAMPS];

export function heatCellStyle(value: number, maxAbs: number): CSSProperties {
  const t = Math.min(1, Math.abs(value) / (maxAbs || 1));

  if (ramp) {
    const rgb = rampColor(value >= 0 ? ramp.pos : ramp.neg, t);
    // Flip to dark ink once the cell is bright enough to carry it (0.5, not 0.55,
    // so saturated greens — which read far better on dark ink — get it). A 1px
    // shadow lifts legibility on the mid-tone cells where no single ink hits AA.
    const dark = perceivedLuminance(rgb) > 0.5;
    return {
      backgroundColor: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`,
      color: dark ? '#0a0a0a' : '#ededed',
      textShadow: dark ? '0 1px 1px rgba(255,255,255,0.3)' : '0 1px 1px rgba(0,0,0,0.6)',
    };
  }

  if (HEAT_MODE === 'diverging') {
    const alpha = 0.05 + t * 0.5;
    const base = value >= 0 ? [48, 209, 88] : [255, 59, 48];
    const comp = base.map(ch => Math.round(ch * alpha + 10 * (1 - alpha))) as [number, number, number];
    const dark = perceivedLuminance(comp) > 0.5;
    return {
      backgroundColor: `rgba(${base[0]},${base[1]},${base[2]},${alpha.toFixed(3)})`,
      color: dark ? '#0a0a0a' : '#ededed',
      textShadow: dark ? '0 1px 1px rgba(255,255,255,0.3)' : '0 1px 1px rgba(0,0,0,0.6)',
    };
  }

  // mono base: neutral gray (t=0) → white for positive, black for negative
  const luminance = value >= 0 ? 0.24 + t * 0.68 : 0.24 - t * 0.22;
  const channel = Math.round(luminance * 255);
  let r = channel;
  let g = channel;
  let b = channel;

  if (HEAT_MODE === 'hybrid' && t > TINT_START) {
    const weight = ((t - TINT_START) / (1 - TINT_START)) * TINT_MAX;
    const tint = value >= 0 ? CHROME : ROSE;
    r = lerp(r, tint[0], weight);
    g = lerp(g, tint[1], weight);
    b = lerp(b, tint[2], weight);
  }

  return {
    backgroundColor: `rgb(${r},${g},${b})`,
    color: luminance > 0.52 ? '#0a0a0a' : '#ededed',
  };
}

/** Pole colors of the active ramp — legends must derive from these, never hardcode. */
const poleHex = (stops: Stops): string => {
  const c = stops[stops.length - 1][1];
  return `rgb(${c[0]},${c[1]},${c[2]})`;
};
export const heatPoles = ramp
  ? { pos: poleHex(ramp.pos), neg: poleHex(ramp.neg) }
  : { pos: '#ededed', neg: '#8f8f8f' };

export const heatScaleGradient: string = ramp
  ? ramp.gradient
  : HEAT_MODE === 'diverging'
    ? 'linear-gradient(to bottom, rgba(48,209,88,0.85), rgba(48,209,88,0.12) 46%, rgba(20,20,20,1) 50%, rgba(255,59,48,0.12) 54%, rgba(255,59,48,0.85))'
    : HEAT_MODE === 'hybrid'
      ? 'linear-gradient(to bottom, rgb(126,210,180), rgb(235,235,235) 14%, rgb(61,61,61) 50%, rgb(5,5,5) 86%, rgb(122,32,47))'
      : 'linear-gradient(to bottom, rgb(235,235,235), rgb(61,61,61) 50%, rgb(5,5,5))';

/** Scale end-label classes (sign already carried by the printed values). */
export const heatScaleLabels =
  HEAT_MODE === 'diverging' || HEAT_MODE === 'green-red'
    ? { pos: 'text-bull', neg: 'text-bear' }
    : { pos: 'text-textPrimary', neg: 'text-textSecondary' };
