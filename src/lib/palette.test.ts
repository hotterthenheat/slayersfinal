import { describe, expect, it } from 'vitest';
import config from '../../tailwind.config';
import { candleTheme } from '../components/gex/candleTheme';
import { BEAR, BULL, CALL_WALL, PUT_WALL } from '../components/gex/palette';

/*
==================================================
  SLAYER TERMINAL - PALETTE GUARD (lib/palette.test.ts)
  Two things a colour system fails at silently.

  1. Two names for one colour. A measured census of the running app found 91
     distinct saturated colours on screen, and two pairs of tokens sitting ONE
     degree of hue apart — near-duplicates that nobody can tell apart but that
     both have to be maintained, and that make "which token is this?" an
     unanswerable question at a call site.
  2. Two colours for one meaning. The candles drew a down bar violet while the
     cumulative delta, the walls and the exposure grid beside them drew down
     red. That is the more expensive failure: a reader learns the language once
     and then one panel speaks a dialect.

  These fail loudly rather than being caught in a screenshot six waves later.
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

/** Shortest arc between two hues, so 359° and 1° are 2° apart, not 358°. */
const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

const colors = config.theme?.extend?.colors as Record<string, string>;

/** Tokens that carry a hue. Surfaces, borders and text are greys by design. */
const HUED = Object.entries(colors).filter(([, v]) => typeof v === 'string' && v.startsWith('#') && hsl(v).s > 0.25);

/**
 * Pairs allowed to share a hue, each with the reason it is safe.
 *
 * The bar for an entry here is DISJOINTNESS BY CONSTRUCTION — not "they look
 * different enough" and not "they probably won't collide".
 */
const SHARED_HUE_OK: [string, string, string][] = [
  // Nothing yet. Scan/Models identity reuses the flip and darkpool TOKENS
  // outright (see NAV_GROUP_ACCENT) rather than minting look-alikes, which is
  // why this list is empty: sharing a value is fine, minting a twin is not.
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

  it('keeps the identity hues clear of every structural hue', () => {
    // The rule in tailwind.config.ts: an identity accent must not be mistakable
    // for a colour that means something about the market.
    const identity = ['groupRead', 'groupYours'];
    const structural = ['bull', 'bear', 'warn', 'shortGamma', 'longGamma', 'flip', 'king', 'darkpool'];
    for (const id of identity) {
      expect(colors[id], `${id} is missing`).toBeDefined();
      for (const st of structural) {
        const gap = hueGap(hsl(colors[id]).h, hsl(colors[st]).h);
        expect(gap, `${id} sits ${gap.toFixed(0)}° from ${st} — too close to read as a different thing`).toBeGreaterThanOrEqual(25);
      }
    }
  });

  it('does not resurrect the dead aliases', () => {
    // Six tokens with zero call sites were carried for several waves; two of
    // them (gammaNeg, warning) were duplicates of bear and warn under a second
    // name, which is the near-duplicate problem in its purest form.
    for (const dead of ['primary', 'secondary', 'silver', 'gammaPos', 'gammaNeg', 'warning']) {
      expect(colors[dead], `${dead} is back — it had no call sites and duplicated a live token`).toBeUndefined();
    }
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
