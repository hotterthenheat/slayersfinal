/*
==================================================
  SLAYER TERMINAL - PINPOINT INK (components/pinpoint/ink.ts)
  The colour doctrine of the rebuilt section, in one place.
==================================================

  Noah, 2026-09-05: "i dont like the pages you make that are black and grey
  have no soul … i dont mind if you use colors everything should just be
  super nice." The old Pinpoint was twelve desks of grey text on black
  cards with the colour reserved for one bar chart. Colour here is not
  decoration — every hue carries ONE meaning, the same meaning on every
  desk, and a reader who learns it once reads every page.

    THE REGIME PAIR — what the dealers' hedging does to a move.
      absorb   green   dealers long gamma; dips bought, rips sold
      amplify  red     dealers short gamma; moves chased

    THE LEVELS — a price that matters, each in its own ink everywhere.
      call wall   green    supply overhead
      put wall    red      demand underneath
      flip        blue     the border between the two regimes
      supreme     magenta  the single heaviest strike on the book
      spot        white    where the market is

    THE METRICS — which greek a surface is drawing.
      gamma   ice/gold  the house heat ramp (heatmap.ts), by sign
      delta   teal      directional inventory
      vega    violet    vol inventory
      vanna   pink      how delta moves with vol
      charm   orange    how delta moves with time

  Heat (any strike grid or bar of net exposure) stays on the house ramp
  from heatmap.ts — Noah chose it over three palette rounds and it is not
  re-decided here. The level and regime inks come from gex/palette.ts, the
  desk-wide single source, so a wall is the same green on a chart, a
  table and a sentence.
*/

import { CALL_WALL, FLIP, LONG_GAMMA, PUT_WALL, SHORT_GAMMA, SPOT, SUPREME } from '../gex/palette';
import type { ZoneKind } from '../../types/gex';

export { CALL_WALL, FLIP, LONG_GAMMA, PUT_WALL, SHORT_GAMMA, SPOT, SUPREME };

/** Green when dealers absorb, red when they amplify. */
export const regimeInk = (regime: 'LONG' | 'SHORT' | null): string =>
  regime === 'LONG' ? LONG_GAMMA : regime === 'SHORT' ? SHORT_GAMMA : '#a3a3a3';

export type MetricKey = 'gex' | 'dex' | 'vex' | 'vanna' | 'charm';

export interface MetricWords {
  key: MetricKey;
  /** The chip. */
  label: string;
  /** The long name. */
  name: string;
  /** What a bar of it means, in one line — the caption under the chart. */
  reads: string;
  /** Ink for anything that is about this metric and not about its sign. */
  ink: string;
}

export const METRICS: Record<MetricKey, MetricWords> = {
  gex: {
    key: 'gex',
    label: 'GEX',
    name: 'Gamma exposure',
    reads: 'how much the dealers must buy or sell per 1% move at each strike — the shape of the floor and the ceiling',
    ink: '#F2C94C',
  },
  dex: {
    key: 'dex',
    label: 'DEX',
    name: 'Delta exposure',
    reads: 'the directional stock the dealers already hold against each strike — what they are long or short',
    ink: '#5EEAD4',
  },
  vex: {
    key: 'vex',
    label: 'VEX',
    name: 'Vega exposure',
    reads: 'what a one-point vol move does to the dealers’ book at each strike',
    ink: '#A78BFA',
  },
  vanna: {
    key: 'vanna',
    label: 'Vanna',
    name: 'Vanna exposure',
    reads: 'how much delta the dealers gain or lose at each strike when vol moves one point',
    ink: '#F472B6',
  },
  charm: {
    key: 'charm',
    label: 'Charm',
    name: 'Charm exposure',
    reads: 'how much delta the dealers gain or lose at each strike as one day passes',
    ink: '#FB923C',
  },
};

export const ZONE_WORDS: Record<ZoneKind, { label: string; ink: string; fill: string; reads: string }> = {
  'call-wall': {
    label: 'Call wall',
    ink: CALL_WALL,
    fill: 'rgba(48,209,88,0.10)',
    reads: 'supply overhead — dealers sell into a rally here',
  },
  'put-wall': {
    label: 'Put wall',
    ink: PUT_WALL,
    fill: 'rgba(255,59,48,0.10)',
    reads: 'demand underneath — dealers buy a dip here',
  },
  friction: {
    label: 'Friction',
    ink: '#F2C94C',
    fill: 'rgba(242,201,76,0.08)',
    reads: 'heavy hedging both ways — price grinds rather than runs',
  },
  'air-pocket': {
    label: 'Air pocket',
    ink: '#7DD3FC',
    fill: 'rgba(125,211,252,0.07)',
    reads: 'almost no dealer gamma — price does not stop here',
  },
};

/** The washes a card wears to say which regime it is describing. */
export const REGIME_WASH: Record<'LONG' | 'SHORT' | 'NONE', string> = {
  LONG: 'linear-gradient(90deg, rgba(48,209,88,0.14), rgba(48,209,88,0.03) 45%, rgba(0,0,0,0) 80%)',
  SHORT: 'linear-gradient(90deg, rgba(255,59,48,0.14), rgba(255,59,48,0.03) 45%, rgba(0,0,0,0) 80%)',
  NONE: 'linear-gradient(90deg, rgba(163,163,163,0.10), rgba(0,0,0,0) 60%)',
};

/** A strike, printed the way the chain prints it. */
export const fmtStrike = (v: number): string => (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));
