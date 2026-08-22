import type { CSSProperties } from 'react';
import { SHORT_GAMMA, LONG_GAMMA } from './palette';

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
  | 'gamma-regime'
  | 'hybrid'
  | 'mono'
  | 'diverging';

/*
  `as HeatMode` stops TS from narrowing to the literal so the other branches stay legal.

  WHY THIS IS NO LONGER 'green-red'. The cells hold NET DEALER GAMMA, and the sign
  of that number is a REGIME, not a direction. Positive does not mean bullish; it
  means dealers absorb, so dips get bought toward the walls and the tape pins.
  Negative does not mean bearish; it means hedging amplifies whichever way price
  goes. The desk's own reading note says exactly that — "dealer support" and
  "hedging amplifies the move" — while the cells underneath it were painted in
  the market's language for up and down.

  The house already had the right pair for this and was already using it. Nine
  hundred lines away, `components/gex/palette.ts` defines

      SHORT_GAMMA #E0B84E  gold — amplifying regime
      LONG_GAMMA  #5EA0EF  blue — absorbing regime

  and the positioning map on Pinpoint > Levels draws the SAME QUANTITY in them.
  So one desk was calling net gamma green-and-red and its neighbour was calling
  it blue-and-gold, and a reader moving between them had to know that the two
  palettes meant the same thing. `heatmapRegime.test.ts` now fails if they ever
  diverge again.

  It also gives the terminal back its own face: a full-bleed grid of saturated
  green and red is the loudest surface in an app whose accent is holographic
  silver, and it read as a different product.
*/
export const HEAT_MODE = 'gamma-regime' as HeatMode;

type RGB = [number, number, number];
type Stops = [number, RGB][];

const NEUTRAL: RGB = [42, 42, 42]; // dark gray — sits calmly on the panel surface

interface RampPalette {
  pos: Stops;
  neg: Stops;
  gradient: string;
}

// Ramps run from neutral (t=0) → extreme (t=1)
const RAMPS: Record<
  'green-red' | 'gamma-regime' | 'pastel' | 'spectrum' | 'amber' | 'redwood' | 'thermal' | 'teal-violet' | 'gold-slate',
  RampPalette
> = {
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
  /*
    THE HOUSE RAMP. Blue (+, dealers absorb) <-> gold (−, hedging amplifies) —
    the same two tokens the positioning map draws this quantity in, so the two
    Pinpoint desks stop describing one number in two colour languages.

    Poles are LONG_GAMMA #5EA0EF and SHORT_GAMMA #E0B84E exactly; the mid stops
    are those hues carried down toward the neutral so a mid-strength cell still
    reads as its own regime rather than as grey. Neutral stays dark so near-zero
    cells recede into the panel instead of competing with the walls.
  */
  'gamma-regime': {
    pos: [
      [0.0, NEUTRAL],
      [0.5, [44, 88, 140]],
      [1.0, [94, 160, 239]], // LONG_GAMMA #5EA0EF
    ],
    neg: [
      [0.0, NEUTRAL],
      [0.5, [124, 100, 42]],
      [1.0, [224, 184, 78]], // SHORT_GAMMA #E0B84E
    ],
    gradient: 'linear-gradient(to bottom, #5EA0EF 0%, #2C588C 32%, #2a2a2a 50%, #7C642A 68%, #E0B84E 100%)',
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
      // Endpoints read the tokens; the 22%/78% stops are genuine ramp
      // intermediates, not drifted duplicates.
      `linear-gradient(to bottom, ${SHORT_GAMMA} 0%, #C49E3C 22%, #2a2a2a 50%, #5270A8 78%, ${LONG_GAMMA} 100%)`,
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

// Perceptual lift for the low/mid end: raw magnitude is near-linear, which
// leaves weak cells hovering around flat NEUTRAL gray (a weak + reads the same
// as a weak −). A gamma < 1 pushes small values toward their hue sooner while
// leaving the poles (t=1) untouched, so the ordering never inverts.
/*
  Where a cell sits on its ramp, 0 (neutral) to 1 (pole).

  THE EXPONENT USED TO BE 0.7, and that one number was most of why the grid read
  as a quilt. An exponent BELOW one pushes middling cells toward the pole: a
  strike carrying 30% of the board's largest exposure rendered at 0.30^0.7 = 0.43
  of full saturation, so a hundred-odd ordinary cells all arrived at roughly the
  same loud colour and the two that actually mattered had nothing left to stand
  out with. Contrast was being spent on noise.

  Above one, the ramp does what a heat scale is for. The same 30% cell now lands
  at 0.30^1.5 = 0.16 and recedes into the panel, while the walls keep the top of
  the range to themselves. Nothing is hidden — every cell still carries its own
  colour, and the exact figure is one hover away — but the eye is pointed at the
  extremes instead of at all of it at once.
*/
const heatT = (value: number, maxAbs: number): number =>
  Math.pow(Math.min(1, Math.abs(value) / (maxAbs || 1)), 1.5);

/** Raw ramp color for a signed value — used by the on-chart node overlay. */
export function heatRgb(value: number, maxAbs: number): RGB {
  const t = heatT(value, maxAbs);
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

// The two inks a heat cell can wear, and the WCAG relative-luminance formula
// used to choose between them. `perceivedLuminance` above is the cheap
// YIQ approximation — fine for deciding a tint, wrong for deciding legibility.
const INK_DARK = '#0a0a0a';
const INK_LIGHT = '#ededed';
const INK_DARK_RGB: RGB = [10, 10, 10];
const INK_LIGHT_RGB: RGB = [237, 237, 237];

const relLuminance = ([r, g, b]: RGB): number => {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

const contrastRatio = (a: RGB, b: RGB): number => {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const AA = 4.5;
const mix = ([r, g, b]: RGB, [tr, tg, tb]: RGB, k: number): RGB => [
  Math.round(r + (tr - r) * k),
  Math.round(g + (tg - g) * k),
  Math.round(b + (tb - b) * k),
];

/**
 * Choose the ink, and where the fill sits in the crossover band — mid-tones
 * where NEITHER ink clears 4.5:1 (a mid green tops out around 4.46) — nudge the
 * fill the short way until one does.
 *
 * The old code acknowledged this band and shipped a text-shadow instead, which
 * does not make 11px digits legible. Pushing the fill toward whichever pole its
 * best ink already prefers costs a few percent of saturation in a narrow slice
 * of the ramp and buys a readable number, which is the point of the cell.
 */
function inkFor(fill: RGB): { bg: RGB; ink: string; dark: boolean } {
  let bg = fill;
  for (let step = 0; step <= 12; step++) {
    const dRatio = contrastRatio(INK_DARK_RGB, bg);
    const lRatio = contrastRatio(INK_LIGHT_RGB, bg);
    const dark = dRatio >= lRatio;
    if (Math.max(dRatio, lRatio) >= AA) return { bg, ink: dark ? INK_DARK : INK_LIGHT, dark };
    // Dark ink wants a lighter cell; light ink wants a darker one.
    bg = mix(fill, dark ? INK_LIGHT_RGB : INK_DARK_RGB, (step + 1) * 0.04);
  }
  // Unreachable for any real ramp stop, but never return an unreadable cell.
  return { bg, ink: contrastRatio(INK_DARK_RGB, bg) >= contrastRatio(INK_LIGHT_RGB, bg) ? INK_DARK : INK_LIGHT, dark: true };
}

export function heatCellStyle(value: number, maxAbs: number): CSSProperties {
  const t = heatT(value, maxAbs);

  if (ramp) {
    const rgb = rampColor(value >= 0 ? ramp.pos : ramp.neg, t);
    // Pick the ink that actually wins the contrast, rather than guessing from a
    // brightness threshold. The old rule flipped at perceivedLuminance > 0.5,
    // and a saturated green like rgb(42,177,79) computes 0.497 — it missed the
    // flip by 0.003, kept the light ink and landed at 2.4:1. That inverted the
    // whole panel: the strongest cells, the ones a reader most wants, were the
    // least legible while dim cells sat above 12:1. Same two candidates, chosen
    // by measurement.
    const { bg, ink, dark } = inkFor(rgb);
    return {
      backgroundColor: `rgb(${bg[0]},${bg[1]},${bg[2]})`,
      color: ink,
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
  HEAT_MODE === 'gamma-regime'
    ? { pos: 'text-longGamma', neg: 'text-shortGamma' }
    : HEAT_MODE === 'diverging' || HEAT_MODE === 'green-red'
      ? { pos: 'text-bull', neg: 'text-bear' }
      : { pos: 'text-textPrimary', neg: 'text-textSecondary' };
