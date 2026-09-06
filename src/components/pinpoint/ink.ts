/*
==================================================
  SLAYER TERMINAL - PINPOINT INK (components/pinpoint/ink.ts)
  What colour is allowed to mean here, and nothing else.
==================================================

  ── THE CUT (2026-09-06) ──────────────────────────────────────────────────

  The first version of this file invented five METRIC inks — teal for
  delta, violet for vega, pink for vanna, orange for charm, gold for gamma
  — on top of the market pair, the level inks and the heat ramp. Ten hues
  reached one screen. A colour that appears on every card distinguishes no
  card, and a palette that competes with its own data is decoration
  wearing a system's clothes. The metric inks are gone. A desk says which
  greek it is drawing in WORDS, in its title, where the answer is
  unambiguous and costs nothing.

  ── WHAT SURVIVES, AND WHY ────────────────────────────────────────────────

  Two things in a market are worth a hue, because a trader already reads
  them as colour and would read them wrongly in grey:

    DIRECTION   green and red. Dealers absorbing or amplifying; a wall
                overhead or underneath; money up or money down. One pair,
                one meaning, every surface.

    MAGNITUDE   the house heat ramp (heatmap.ts), by sign. Bars and grid
                cells only — never text, never chrome.

  Three identities, each earned by being a thing a reader hunts for by
  name rather than reads off a scale:

    FLIP        the regime border. Blue because neither the market pair
                nor the ramp owns blue, and because it is the one line a
                reader looks for by name.
    SPOT        white. Where the market is.
    SELECTION   the app's own `select`. What you picked, or where the
                scrubber is standing. Already the selection colour in
                every other section — it is not invented here.

  SUPREME's magenta stays for exactly one job: labelling the heaviest
  strike ON THE CHART, where it sits beside four other labelled lines and
  has to be told apart from them. It is not a text colour anywhere.

  And one WARNING, the app's `warn` amber, for a claim the desk makes
  about its own reliability — a fallback fired, this number is estimated,
  this is the window where the model breaks. Never for "bad": bad has a
  direction and direction is already red.

  ── A GRADE IS BRIGHTNESS, NOT A HUE (2026-09-06) ─────────────────────────

  Four places graded something on three steps and all four reached for
  green / gold / red: level conviction (STRONG · HOLDING · THIN), audit
  accuracy, book divergence, open-interest kind. Gold was a sixth hue that
  existed only to be the middle of a traffic light, and the green and the
  red were the third meaning loaded onto a pair that already carries the
  regime AND the sign of money.

  A grade runs one way, so it is drawn the way a one-way scale should be:
  down the greyscale, bright to dim. `gradeInk` is that scale. Direction
  keeps the pair; anything that merely ranks gets brightness.

  Everything else is the greyscale the desk already has — textPrimary,
  textSecondary, textMuted — and hierarchy is made with size, weight and
  position instead of hue.
*/

import { CALL_WALL, FLIP, LONG_GAMMA, PUT_WALL, SHORT_GAMMA, SPOT, SUPREME } from '../gex/palette';
import type { ZoneKind } from '../../types/gex';

export { CALL_WALL, FLIP, LONG_GAMMA, PUT_WALL, SHORT_GAMMA, SPOT, SUPREME };

/** The desk's three text tiers, for the places that must set a colour in JS. */
export const INK = {
  primary: '#ededed',
  secondary: '#a3a3a3',
  muted: '#7d7d7d',
  rule: '#1c1c1c',
} as const;

/** Green when dealers absorb, red when they amplify, grey when neither. */
export const regimeInk = (regime: 'LONG' | 'SHORT' | null): string =>
  regime === 'LONG' ? LONG_GAMMA : regime === 'SHORT' ? SHORT_GAMMA : INK.secondary;

/** Money up, money down — the same pair, for a signed figure. */
export const signInk = (v: number): string => (v > 0 ? LONG_GAMMA : v < 0 ? SHORT_GAMMA : INK.secondary);

/** The app's selection colour. What the reader picked, or where the scrubber is. */
export const SELECT = '#D2FF00';

/** The app's warning amber. A claim about the desk's own reliability, nothing else. */
export const WARN = '#FF9500';

/**
 * A three-step grade, drawn as brightness rather than a traffic light.
 *
 * `0` is the best step and gets the full ink; each step down dims. Use it
 * where a reader is SCANNING for the strong ones — level conviction is the
 * case it was built for: the levels worth leaning on should jump out of a
 * list of six.
 *
 * Do NOT use it on a headline figure whose bad end is the news. Audit's
 * accuracy and Compare's divergence both took it briefly, and both went
 * dimmest exactly when they had the most to say. A figure that carries a
 * section stands in the reading ink at its size, and the warning amber marks
 * what is wrong.
 */
export const gradeInk = (step: 0 | 1 | 2): string => (step === 0 ? INK.primary : step === 1 ? INK.secondary : INK.muted);

export type MetricKey = 'gex' | 'dex' | 'vex' | 'vanna' | 'charm';

export interface MetricWords {
  key: MetricKey;
  /** The chip on the control. */
  label: string;
  /** The long name — the title says this, so no hue has to. */
  name: string;
  /** What one bar of it means. */
  reads: string;
  /** The unit a reader should hold in their head. */
  unit: string;
}

export const METRICS: Record<MetricKey, MetricWords> = {
  gex: {
    key: 'gex',
    label: 'Gamma',
    name: 'Gamma exposure',
    reads: 'what the dealers must buy or sell per 1% move at each strike — the shape of the floor and the ceiling',
    unit: 'per 1% move',
  },
  dex: {
    key: 'dex',
    label: 'Delta',
    name: 'Delta exposure',
    reads: 'the directional stock the dealers already hold against each strike',
    unit: 'shares held',
  },
  vex: {
    key: 'vex',
    label: 'Vega',
    name: 'Vega exposure',
    reads: 'what a one-point vol move does to the dealers’ book at each strike',
    unit: 'per vol point',
  },
  vanna: {
    key: 'vanna',
    label: 'Vanna',
    name: 'Vanna exposure',
    reads: 'the delta the dealers gain or lose at each strike when vol moves one point',
    unit: 'per vol point',
  },
  charm: {
    key: 'charm',
    label: 'Charm',
    name: 'Charm exposure',
    reads: 'the delta the dealers gain or lose at each strike as one day passes',
    unit: 'per day',
  },
};

/*
  ZONES. A band on the chart, drawn as a wash behind the bars. The two wall
  zones borrow the direction pair because that is what they are; friction
  and the air pocket are STRUCTURE rather than direction, so they are drawn
  in the chart's own grey at two weights instead of earning hues of their
  own. The label on the band is what tells them apart.
*/
export const ZONE_WORDS: Record<ZoneKind, { label: string; ink: string; fill: string; reads: string }> = {
  'call-wall': {
    label: 'Call wall',
    ink: CALL_WALL,
    fill: 'rgba(48,209,88,0.07)',
    reads: 'supply overhead — dealers sell into a rally here',
  },
  'put-wall': {
    label: 'Put wall',
    ink: PUT_WALL,
    fill: 'rgba(255,59,48,0.07)',
    reads: 'demand underneath — dealers buy a dip here',
  },
  friction: {
    label: 'Friction',
    ink: INK.secondary,
    fill: 'rgba(255,255,255,0.05)',
    reads: 'heavy hedging both ways — price grinds rather than runs',
  },
  'air-pocket': {
    label: 'Air pocket',
    ink: INK.muted,
    fill: 'rgba(255,255,255,0.02)',
    reads: 'almost no dealer gamma — price does not stop here',
  },
};

/** A strike, printed the way the chain prints it. */
export const fmtStrike = (v: number): string => (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));
