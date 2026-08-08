import { describe, expect, it } from 'vitest';
import config from '../../tailwind.config';
import { candleTheme } from '../components/gex/candleTheme';
import { BEAR, BULL, CALL_WALL, PUT_WALL } from '../components/gex/palette';

/*
==================================================
  SLAYER TERMINAL - PALETTE GUARD (lib/palette.test.ts)
  The house system is holographic silver, white and black.

  Three ways that has been broken, each now failing loudly rather than turning
  up in a screenshot six waves later.

  1. A hue invented for chrome. Four "desk identity" colours were added to give
     the guide and the index some life. They had no basis: the brand has a
     living-foil silver for exactly that job. HUE_BUDGET below is the whole
     permitted list, and it contains only colours that describe the MARKET.
  2. Two names for one colour. Two of those invented hues landed one degree
     from tokens that already existed — near-duplicates nobody can tell apart
     but both of which have to be maintained.
  3. Two colours for one meaning. The candles drew a down bar violet while the
     cumulative delta, the walls and the exposure grid beside them drew down
     red — a reader learns the language once and then one panel speaks a
     dialect.
==================================================
*/

type Hsl = { h: number; s: number; l: number };

/** #RRGGBB → HSL, degrees and 0..1. */
function hsl(hex: string): Hsl {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  const l = (mx + mn) / 2;
  let h = 0;
  if (d !== 0) {
    h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  }
  return { h: (h + 360) % 360, s: d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), l };
}

/**
 * How much colour a value actually carries, 0..255.
 *
 * Chroma, not HSL saturation: saturation is `d / (1 - |2l - 1|)`, whose
 * denominator collapses near white, so holo-silver #E4E8F4 scores 0.42 and
 * would be filed as a hue. Its chroma is 16 — which is what the eye sees.
 */
const chroma = (hex: string): number => {
  const n = parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return Math.max(r, g, b) - Math.min(r, g, b);
};

/** Shortest arc between two hues, so 359° and 1° are 2° apart, not 358°. */
const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

const colors = config.theme?.extend?.colors as Record<string, string>;

/** Tokens that carry a hue. Surfaces, borders, text and the silver are not. */
const HUED = Object.entries(colors).filter(([, v]) => typeof v === 'string' && v.startsWith('#') && chroma(v) >= 40);

/**
 * Pairs allowed to share a hue, each with the reason it is safe.
 *
 * The bar for an entry here is DISJOINTNESS BY CONSTRUCTION — not "they look
 * different enough" and not "they probably won't collide".
 */
const SHARED_HUE_OK: [string, string, string][] = [
  // Empty, and it should stay that way. The identity hues that once needed an
  // exemption here were deleted instead: chrome uses the animated foil.
];

const allowed = (a: string, b: string) =>
  SHARED_HUE_OK.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

describe('token palette', () => {
  it('has no two tokens within 5° of hue', () => {
    const clashes: string[] = [];
    for (let i = 0; i < HUED.length; i++) {
      for (let j = i + 1; j < HUED.length; j++) {
        const [an, av] = HUED[i];
        const [bn, bv] = HUED[j];
        const gap = hueGap(hsl(av).h, hsl(bv).h);
        if (gap < 5 && !allowed(an, bn)) {
          clashes.push(`${an} ${av} (${hsl(av).h.toFixed(0)}°) ≈ ${bn} ${bv} (${hsl(bv).h.toFixed(0)}°) — ${gap.toFixed(1)}° apart`);
        }
      }
    }
    expect(clashes, clashes.join('\n')).toEqual([]);
  });

  /**
   * The whole hue budget, and why each entry is allowed to exist.
   *
   * The house system is holographic silver, white and black. A hue is spent
   * ONLY where the market itself is the thing being coloured — direction,
   * dealer-gamma sign, and three structural levels — and every one of those
   * predates this list. Nothing gets a hue for identity, for decoration, or to
   * stop a page looking plain; a page that needs life uses the animated foil
   * (.holo-text / .holo-bar / .holo-border), which IS the brand.
   *
   * A new entry here is a design decision, not a styling one. If a token needs
   * to be added, the reason goes in this table beside it.
   */
  const HUE_BUDGET: Record<string, string> = {
    bull: 'direction — up',
    bear: 'direction — down',
    warn: 'caution and data freshness',
    shortGamma: 'dealer gamma sign — amplifying',
    longGamma: 'dealer gamma sign — absorbing',
    flip: 'the gamma flip level',
    king: 'the peak-exposure strike',
    darkpool: 'off-exchange prints',
  };

  it('spends a hue only where the market is what is being coloured', () => {
    const spent = HUED.map(([name]) => name).sort();
    const allowed = Object.keys(HUE_BUDGET).sort();
    expect(
      spent,
      `The palette is holo-silver, white and black. Every hue must earn its place in HUE_BUDGET — ` +
        `use .holo-text / .holo-bar / .holo-border for anything that is chrome.`
    ).toEqual(allowed);
  });

  it('does not resurrect the dead aliases', () => {
    // Six tokens with zero call sites were carried for several waves; two of
    // them (gammaNeg, warning) were duplicates of bear and warn under a second
    // name, which is the near-duplicate problem in its purest form.
    for (const dead of ['primary', 'secondary', 'silver', 'gammaPos', 'gammaNeg', 'warning']) {
      expect(colors[dead], `${dead} is back — it had no call sites and duplicated a live token`).toBeUndefined();
    }
  });

  it('keeps the interface accent a silver, not a hue', () => {
    // `select` is the flat fallback for the animated foil, so it has to stay in
    // the silver family: the gradient's first and last stops are the same
    // value, and reduced-motion degrades to it.
    expect(chroma(colors.select)).toBeLessThan(40);
    expect(hsl(colors.select).l).toBeGreaterThan(0.85);
  });
});

describe('one direction language', () => {
  it('candles are the bull/bear tokens, not a second green/red', () => {
    expect(candleTheme.up).toBe(BULL);
    expect(candleTheme.down).toBe(BEAR);
    expect(candleTheme.wickUp).toBe(BULL);
    expect(candleTheme.wickDown).toBe(BEAR);
  });

  it('volume tints carry the same hue as the bar they sit under', () => {
    // rgba(48,209,88,…) is BULL; a literal drifting here is how the "signature"
    // theme diverged in the first place.
    const rgb = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
    };
    expect(candleTheme.volUp).toContain(rgb(BULL));
    expect(candleTheme.volDown).toContain(rgb(BEAR));
  });

  it('the walls, the tape and the candles agree on up and down', () => {
    expect(CALL_WALL).toBe(BULL);
    expect(PUT_WALL).toBe(BEAR);
    expect(colors.bull).toBe(BULL);
    expect(colors.bear).toBe(BEAR);
  });
});
