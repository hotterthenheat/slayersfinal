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
  | 'ice-gold'
  | 'steel-gold'
  | 'ice-plasma'
  | 'terminal'
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
export const HEAT_MODE = 'ice-gold' as HeatMode;

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
  | 'ice-gold'
  | 'steel-gold'
  | 'ice-plasma'
  | 'terminal'
  | 'pastel'
  | 'spectrum'
  | 'amber'
  | 'redwood'
  | 'thermal'
  | 'teal-violet'
  | 'gold-slate',
  RampPalette
> = {
  /* THE HOUSE HEAT, round 3 (Noah, 2026-08-18 — ice-plasma kept on the
     shelf below, "try something else"): a metallic duotone no charting
     product runs. ABSORB (neg, call-dominant = dealers long gamma) climbs
     STEEL — slate to glowing platinum, structure rendered as the house
     hardware metal. AMPLIFY (pos, put-dominant = dealers short gamma)
     climbs GOLD — bronze to molten honey, fuel rendered as heat. The
     accessibility ace: one side is ACHROMATIC, so no hue discrimination is
     needed at all — gray vs colored separates for every vision type, with
     a pole luminance gap (platinum L=0.82 vs gold L=0.60) on top. Honey
     gold #F5C542 is yellower than warn orange #FF9500 and nowhere near
     lime's acid green-yellow. One hue per side, luminance walk, ARC-LENGTH
     EVEN stops (OKLab, spread 1.03x/1.05x — scratchpad regenerates). */
  /*
    ICE-GOLD — the house heat, round 4 (Noah, 2026-08-30: "take his heatmap
    colors").

    ONLY THE COOL SIDE MOVED. steel-gold's absorb ramp climbed a near-
    achromatic grey; this one climbs ice-blue to a pale cyan. The gold is
    untouched, so the pairing a reader already knows — cool absorbs, warm
    amplifies — still reads the same way, and every surface that shares this
    ramp moves together.

    THE STOPS ARE MEASURED, NOT INVENTED. Sampled from the partner build's
    own Time Machine heatmap, brightest to darkest:

      #c1e7f2  #a3d0e3  #85c4d5  #74b3d6  #57a9c1  #3f9cc7  #194262

    which is the ramp below, resampled onto our own nine even stops.

    WHAT THIS COSTS, stated plainly. steel-gold's argument was that one side
    is ACHROMATIC, so separating the two needed no hue discrimination at all
    — the strongest possible answer for colour vision deficiency. Ice-blue
    against gold is a blue/yellow axis instead. That is still the SAFEST
    coloured axis (deuteranopia and protanopia, the common types, both keep
    it, and the two sides remain far apart in lightness), but it is no
    longer free: tritanopia, which is rare, loses hue here and is left with
    lightness alone. steel-gold stays in this file, one word away.
  */
  'ice-gold': {
    // positive = put-dominant = dealers short gamma = AMPLIFY (gold, unchanged)
    pos: [
      [0, [42, 42, 42]],
      [0.125, [66, 53, 20]],
      [0.25, [89, 72, 23]],
      [0.375, [114, 91, 26]],
      [0.5, [139, 110, 28]],
      [0.625, [165, 131, 31]],
      [0.75, [191, 152, 37]],
      [0.875, [218, 174, 51]],
      [1, [245, 197, 66]],
    ],
    // negative = call-dominant = dealers long gamma = ABSORB (ice)
    neg: [
      [0, [42, 42, 42]], //     #2A2A2A the shared neutral
      [0.125, [25, 66, 98]], // #194262 measured, deep end
      [0.25, [40, 92, 130]], // #285C82
      [0.375, [63, 156, 199]], // #3F9CC7 measured
      [0.5, [87, 169, 193]], // #57A9C1 measured
      [0.625, [116, 179, 214]], // #74B3D6 measured
      [0.75, [133, 196, 213]], // #85C4D5 measured
      [0.875, [163, 208, 227]], // #A3D0E3 measured
      [1, [193, 231, 242]], //  #C1E7F2 measured, pale ice
    ],
    gradient:
      'linear-gradient(to top, #C1E7F2 0%, #74B3D6 22%, #3F9CC7 38%, #2A2A2A 50%, #8B6E1C 62%, #BF9825 78%, #F5C542 100%)',
  },
  'steel-gold': {
    // positive = put-dominant = dealers short gamma = AMPLIFY (gold)
    pos: [
      [0, [42, 42, 42]], //     #2A2A2A
      [0.125, [66, 53, 20]], // #423514
      [0.25, [89, 72, 23]], //  #594817
      [0.375, [114, 91, 26]], // #725B1A
      [0.5, [139, 110, 28]], // #8B6E1C
      [0.625, [165, 131, 31]], // #A5831F
      [0.75, [191, 152, 37]], // #BF9825
      [0.875, [218, 174, 51]], // #DAAE33
      [1, [245, 197, 66]], //   #F5C542 honey gold
    ],
    // negative = call-dominant = dealers long gamma = ABSORB (steel)
    neg: [
      [0, [42, 42, 42]], //     #2A2A2A
      [0.125, [56, 63, 73]], // #383F49
      [0.25, [75, 85, 98]], //  #4B5562
      [0.375, [97, 108, 123]], // #616C7B
      [0.5, [120, 132, 148]], // #788494
      [0.625, [145, 157, 173]], // #919DAD
      [0.75, [170, 182, 198]], // #AAB6C6
      [0.875, [198, 208, 221]], // #C6D0DD
      [1, [226, 234, 244]], //  #E2EAF4 platinum
    ],
    // top of the bar is +maxAbs, so gold leads
    gradient:
      'linear-gradient(to bottom, #F5C542 0%, #DAAE33 6%, #BF9825 13%, #A5831F 19%, #8B6E1C 25%, #725B1A 31%, #594817 38%, #423514 44%, #2A2A2A 50%, #383F49 56%, #4B5562 63%, #616C7B 69%, #788494 75%, #919DAD 81%, #AAB6C6 88%, #C6D0DD 94%, #E2EAF4 100%)',
  },
  /* THE HOUSE HEAT (Noah, 2026-08-18 — the heatmap revamp, palette round 2:
     blue/amber read as "seen elsewhere"): sign speaks DEALER GAMMA, not
     option side. Under the standard street convention a call-dominant
     strike is dealers LONG gamma (they absorb — sell rallies, buy dips) and
     a put-dominant strike is dealers SHORT gamma (they amplify). Our sim's
     netGex is an option-side code with calls NEGATIVE, so: neg = absorb =
     ICE (glacial cyan — structure that holds price), pos = amplify =
     PLASMA (hot rose — fuel that accelerates it). Values print unchanged.

     Deliberately none of the usual heatmap axes: not Skylit's teal-purple,
     not their schematic yellow-purple, not the fintech-default blue/orange.
     Ice pole #3DD6E8 is bluer than darkpool teal #2DD4BF and far more
     saturated than flip's pale sky #7DD3FC; plasma pole #FF5EA8 is pink —
     not bear red, not supreme purple. Colorblindness is covered by a built-in
     POLE LUMINANCE OFFSET (ice L=0.55 vs plasma L=0.32) so brightness
     separates the sides even where hue can't. One hue per side, luminance
     walk, ARC-LENGTH EVEN stops (OKLab, generated — delta spread
     1.10x/1.07x, scratchpad ramp-azure-ember.mjs regenerates them). */
  'ice-plasma': {
    // positive = put-dominant = dealers short gamma = AMPLIFY (plasma)
    pos: [
      [0, [42, 42, 42]], //     #2A2A2A
      [0.125, [65, 28, 44]], // #411C2C
      [0.25, [91, 31, 61]], //  #5B1F3D
      [0.375, [118, 36, 78]], // #76244E
      [0.5, [146, 43, 94]], //  #922B5E
      [0.625, [174, 51, 111]], // #AE336F
      [0.75, [201, 63, 129]], // #C93F81
      [0.875, [228, 78, 149]], // #E44E95
      [1, [255, 94, 168]], //   #FF5EA8 plasma
    ],
    // negative = call-dominant = dealers long gamma = ABSORB (ice)
    neg: [
      [0, [42, 42, 42]], //     #2A2A2A
      [0.125, [22, 58, 71]], // #163A47
      [0.25, [21, 78, 94]], //  #154E5E
      [0.375, [21, 99, 117]], // #156375
      [0.5, [24, 121, 140]], // #18798C
      [0.625, [27, 143, 163]], // #1B8FA3
      [0.75, [38, 166, 186]], // #26A6BA
      [0.875, [49, 190, 209]], // #31BED1
      [1, [61, 214, 232]], //   #3DD6E8 ice
    ],
    // top of the bar is +maxAbs, so plasma leads
    gradient:
      'linear-gradient(to bottom, #FF5EA8 0%, #E44E95 6%, #C93F81 13%, #AE336F 19%, #922B5E 25%, #76244E 31%, #5B1F3D 38%, #411C2C 44%, #2A2A2A 50%, #163A47 56%, #154E5E 63%, #156375 69%, #18798C 75%, #1B8FA3 81%, #26A6BA 88%, #31BED1 94%, #3DD6E8 100%)',
  },
  // House red/green — the industrial one. The pastel ramps read as bubblegum
  // because they travel across HUES (powder blue → periwinkle, lavender →
  // cream); every stop is a different colour, so the grid looks decorative.
  // This one holds ONE hue per side and walks only luminance, the way a
  // phosphor readout does: near-zero sinks into the panel, and intensity is
  // the single thing your eye tracks. Poles are the real `bull` / `bear`
  // tokens, so the matrix finally agrees with the walls, chips and badges
  // around it.
  // NOTE the sign mapping, it is not arbitrary. The sim writes dealers net
  // SHORT calls (dealerCallDirection -0.55) and flips the put leg, so a
  // call-dominant strike lands NEGATIVE and a put-dominant one POSITIVE —
  // netGex is effectively an option-side code here. Green therefore belongs on
  // `neg`. Measured on SPY: the call wall row prints −$149.1M and the put wall
  // row +$507.8M, so pairing green with `pos` would put a green CW label on a
  // red row and a red PW label on a green row. It also lines up the chart's own
  // trails legend, which already calls heatPoles.neg "call walls".
  // Stops are ARC-LENGTH EVEN, not hand-placed — see the note above. The old
  // four hand-picked anchors survive as waypoints on the same path (oxblood
  // ~#601612, deep pine ~#14542B); all that changed is how fast the eye
  // travels between them.
  terminal: {
    // positive = put-dominant
    pos: [
      [0, [42, 42, 42]], //      #2A2A2A
      [0.125, [50, 38, 38]], //  #322626
      [0.25, [62, 34, 33]], //   #3E2221
      [0.375, [75, 28, 26]], //  #4B1C1A
      [0.5, [96, 22, 18]], //    #601612 oxblood
      [0.625, [139, 28, 22]], // #8B1C16
      [0.75, [181, 36, 29]], //  #B5241D brick
      [0.875, [218, 48, 38]], // #DA3026
      [1, [255, 59, 48]], //     #FF3B30 bear
    ],
    // negative = call-dominant
    neg: [
      [0, [42, 42, 42]], //      #2A2A2A
      [0.125, [37, 51, 42]], //  #25332A
      [0.25, [30, 64, 42]], //   #1E402A
      [0.375, [20, 84, 43]], //  #14542B deep pine
      [0.5, [25, 106, 50]], //   #196A32
      [0.625, [29, 128, 58]], // #1D803A
      [0.75, [35, 152, 67]], //  #239843 signal green
      [0.875, [41, 178, 76]], // #29B24C
      [1, [48, 209, 88]], //     #30D158 bull
    ],
    // top of the bar is +maxAbs, so red leads
    gradient:
      'linear-gradient(to bottom, #FF3B30 0%, #DA3026 6%, #B5241D 13%, #8B1C16 19%, #601612 25%, #4B1C1A 31%, #3E2221 38%, #322626 44%, #2A2A2A 50%, #25332A 56%, #1E402A 63%, #14542B 69%, #196A32 75%, #1D803A 81%, #239843 88%, #29B24C 94%, #30D158 100%)',
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

/*
  Magnitude → ramp position.

  Linear |value|/maxAbs looks obviously right and renders a black grid. GEX is
  violently heavy-tailed: one strike carries the book. Measured on a live SPY
  matrix — max $543.6M, MEDIAN $27.4M, i.e. the middle cell sits at t=0.05, and
  70 of 102 cells fell under t=0.1. Result: 90% of cells within 25 RGB of the
  neutral, only 2 of 84 carrying real colour. A perceptually even ramp is worth
  nothing when the data never travels along it.

  A power curve fixes it without touching what the colours MEAN. Gamma expands
  the crowded low end and compresses the sparse high end, so the same numbers
  spread across the whole ramp:

    gamma 0.4:  median 0.05 -> 0.30,  p90 0.24 -> 0.56,  max 1 -> 1

  Ordering, sign and the neutral zero all survive; only the spacing changes.
  Tune with the distribution in front of you, never by eye.
*/
const HEAT_GAMMA = 0.4;
function heatT(value: number, maxAbs: number): number {
  const linear = Math.min(1, Math.abs(value) / (maxAbs || 1));
  return Math.pow(linear, HEAT_GAMMA);
}

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

/*
  Cell ink. The old rule compared a *perceived* luminance to a hand-tuned
  threshold per ramp, which is not the quantity WCAG contrast is built on — it
  picked the worse of the two inks near the flip and bottomed out at 3.74:1.

  Contrast against light ink falls as the cell brightens while contrast against
  dark ink rises, so the best possible flip point is exactly where the two
  curves cross. Solving ratio(L, DARK) = ratio(LIGHT, L) gives
  L = sqrt((Ll + 0.05)(Ld + 0.05)) − 0.05 ≈ 0.168, and picking the better ink
  either side of it guarantees ≥4.11:1 — the ceiling for this ink pair. Any
  other threshold is strictly worse, so this is not a knob to tune.
*/
const INK_LIGHT = '#ededed';
const INK_DARK = '#0a0a0a';
function relativeLuminance([r, g, b]: RGB): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const INK_CROSSOVER = Math.sqrt((relativeLuminance([237, 237, 237]) + 0.05) * (relativeLuminance([10, 10, 10]) + 0.05)) - 0.05;
const inkFor = (rgb: RGB): string => (relativeLuminance(rgb) > INK_CROSSOVER ? INK_DARK : INK_LIGHT);

/*
  Magnitude on the ramp's OWN curve, 0..1 — exported so a bar's LENGTH can use
  the same spacing its colour does. Sizing a bar linearly while colouring it on
  the gamma curve gives a row that is visibly hot and visibly ~empty, which
  reads as a rendering fault rather than as a light strike. The note above says
  why the linear scale is wrong for this data; it is wrong for length too.
*/
export function heatMagnitude(value: number, maxAbs: number): number {
  return heatT(value, maxAbs);
}

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

const EMERALD: RGB = [48, 209, 88];
const ROSE: RGB = [255, 59, 48];
const TINT_START = 0.78;
const TINT_MAX = 0.5;

const ramp = RAMPS[HEAT_MODE as keyof typeof RAMPS];

export function heatCellStyle(value: number, maxAbs: number): CSSProperties {
  const t = heatT(value, maxAbs);

  if (ramp) {
    const rgb = rampColor(value >= 0 ? ramp.pos : ramp.neg, t);
    return { backgroundColor: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`, color: inkFor(rgb) };
  }

  if (HEAT_MODE === 'diverging') {
    const alpha = 0.05 + t * 0.5;
    return {
      backgroundColor:
        value >= 0 ? `rgba(48,209,88,${alpha.toFixed(3)})` : `rgba(255,59,48,${alpha.toFixed(3)})`,
      color: '#ededed',
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
    const tint = value >= 0 ? EMERALD : ROSE;
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

/*
  THE SAME POLES AS BARE "r,g,b", and a darker step of each for TEXT.

  The rule above — "legends must derive from these, never hardcode" — was
  stated for hex, and the Strike Pressure Ladder still kept its own
  '226,234,244' because it needs the `rgba(${rgb},${alpha})` form, which the
  hex export cannot give it. So the one surface whose colours carry exactly
  the heatmap's meaning was the one surface holding a private copy, and
  switching the ramp to ice-gold would have left it drawing calls in the old
  platinum while every other surface moved.

  `heatInk` is the 0.75 stop rather than the pole: the full pole is nearly
  white at 11px and reads as plain text instead of as the call side.
*/
const rgbTriple = (stops: Stops): string => {
  const c = stops[stops.length - 1][1];
  return `${c[0]},${c[1]},${c[2]}`;
};
const stopHex = (stops: Stops, t: number): string => {
  const hit = stops.reduce((best, cur) => (Math.abs(cur[0] - t) < Math.abs(best[0] - t) ? cur : best), stops[0]);
  const [r, g, b] = hit[1];
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
};
/** Pole colours as bare "r,g,b", for callers that build their own rgba(). */
export const heatPoleRgb = ramp
  ? { pos: rgbTriple(ramp.pos), neg: rgbTriple(ramp.neg) }
  : { pos: '237,237,237', neg: '143,143,143' };
/** A darker step of each pole, legible as small text on the panel. */
export const heatInk = ramp
  ? { pos: stopHex(ramp.pos, 1), neg: stopHex(ramp.neg, 0.75) }
  : { pos: '#ededed', neg: '#8f8f8f' };

export const heatScaleGradient: string = ramp
  ? ramp.gradient
  : HEAT_MODE === 'diverging'
    ? 'linear-gradient(to bottom, rgba(48,209,88,0.85), rgba(48,209,88,0.12) 46%, rgba(20,20,20,1) 50%, rgba(255,59,48,0.12) 54%, rgba(255,59,48,0.85))'
    : HEAT_MODE === 'hybrid'
      ? 'linear-gradient(to bottom, rgb(126,210,180), rgb(235,235,235) 14%, rgb(61,61,61) 50%, rgb(5,5,5) 86%, rgb(122,32,47))'
      : 'linear-gradient(to bottom, rgb(235,235,235), rgb(61,61,61) 50%, rgb(5,5,5))';

/** Scale end-label classes (sign already carried by the printed values). */
/*
  END-LABEL COLOURS AS A STYLE, NOT A CLASS.

  These used to be Tailwind class strings with the hex written inline
  (`text-[#F5C542]`), one hand-kept pair per ramp mode. Deriving them from
  the ramp is right, but it cannot stay a class: Tailwind only generates the
  class names it can see LITERALLY in the source, so a `text-[${...}]` built
  at run time reaches the stylesheet as nothing and the label renders in the
  inherited colour. (The same trap cost the Weigher's scanner its column
  grid this week.) A colour is a style; it goes in `style`.

  The legacy non-ramp modes keep class names, because those ARE literal.
*/
export const heatScaleLabelStyle: { pos: CSSProperties; neg: CSSProperties } | null = ramp
  ? { pos: { color: heatPoles.pos }, neg: { color: heatPoles.neg } }
  : null;

export const heatScaleLabels =
  ramp
    ? { pos: '', neg: '' }
    : HEAT_MODE === 'terminal'
      ? // Terminal's poles are inverted vs 'diverging' — see the ramp note:
        // positive is put-dominant (red) and negative call-dominant (green),
        // so each end label wears the colour of the bar end it sits against.
        { pos: 'text-bear', neg: 'text-bull' }
      : HEAT_MODE === 'diverging'
        ? { pos: 'text-bull', neg: 'text-bear' }
        : { pos: 'text-textPrimary', neg: 'text-textSecondary' };
