/*
==================================================
  SLAYER TERMINAL - GREEKS & REGIME (greeksmatrix.ts)
  The full dealer-exposure surface: not just gamma,
  but delta, vanna, charm, vomma, speed, color and
  ultima by strike — plus the dealer regime the net
  positioning implies (pinned / controlled trend /
  unstable breakout / liquidation cascade), a charm
  clock (positioning decay into the close) and a
  vanna-shock map (hedging from IV, not price).

  Gamma/delta/vega are the chain's real $ exposures;
  the higher-order greeks are modeled from them with
  their standard relationships. Deterministic per
  ticker + day.
==================================================
*/

import { dayKey, hRange } from '../core/rng';
import { buildLevels, pinStrike } from './gex';
import type { MarketSnapshot } from '../types/market';

export type GreekKey =
  | 'gamma'
  | 'delta'
  | 'vanna'
  | 'charm'
  | 'vomma'
  | 'veta'
  | 'speed'
  | 'color'
  | 'ultima'
  | 'zomma';

export const GREEKS: { key: GreekKey; label: string; blurb: string }[] = [
  { key: 'gamma', label: 'Gamma', blurb: 'hedging vs price — the pin/chase engine' },
  { key: 'delta', label: 'Delta', blurb: 'directional exposure to hedge' },
  { key: 'vanna', label: 'Vanna', blurb: 'delta drift as IV moves' },
  { key: 'charm', label: 'Charm', blurb: 'delta drift as time passes' },
  { key: 'vomma', label: 'Vomma', blurb: 'vega convexity — vol of vol' },
  { key: 'veta', label: 'Veta', blurb: 'vega decay as time passes' },
  { key: 'speed', label: 'Speed', blurb: 'how fast gamma changes with price' },
  { key: 'color', label: 'Color', blurb: 'how fast gamma changes with time' },
  { key: 'ultima', label: 'Ultima', blurb: 'third-order vol sensitivity' },
  { key: 'zomma', label: 'Zomma', blurb: 'how fast gamma changes with IV' },
];

export interface GreekRow {
  strike: number;
  distPct: number;
  gamma: number;
  delta: number;
  vanna: number;
  charm: number;
  vomma: number;
  veta: number;
  speed: number;
  color: number;
  ultima: number;
  zomma: number;
}

export type DealerRegime = 'PINNED / CHOPPY' | 'CONTROLLED TREND' | 'UNSTABLE BREAKOUT' | 'LIQUIDATION CASCADE';

export interface RegimeProb {
  regime: DealerRegime;
  prob: number;
  note: string;
}

export interface CharmPoint {
  time: string;
  minsToClose: number;
  /** Cumulative charm-driven dealer delta shift, $ */
  deltaShift: number;
}

export interface VannaPoint {
  volShockPct: number;
  /** Dealer hedge required for this IV shock, $ (positive = must buy) */
  hedgeUsd: number;
}

export interface GreeksRegimeView {
  ticker: string;
  spot: number;
  rows: GreekRow[];
  netByGreek: Record<GreekKey, number>;
  regimes: RegimeProb[];
  topRegime: RegimeProb;
  charmClock: CharmPoint[];
  charmToClose: number;
  vannaShock: VannaPoint[];
  /** Signed $ dealer delta from a +1% IV pop */
  vannaPerVol: number;
}

export function buildGreeksRegime(snapshot: MarketSnapshot): GreeksRegimeView {
  const { ticker, spot, chain, indicators } = snapshot;
  const day = dayKey();
  const seed = (t: string) => hRange(`${ticker}-${day}-grk-${t}`, -1, 1);

  const window = [...chain]
    .sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))
    .slice(0, 20)
    .sort((a, b) => b.strike - a.strike);

  const rows: GreekRow[] = window.map(n => {
    const m = (n.strike - spot) / spot;
    // per-1%-shift notional so vanna/charm sit on the same $ scale family as
    // gamma/delta instead of an arbitrary 1e-4 haircut
    const oiScale = (n.callOI.value + n.putOI.value) * 100 * spot * 0.01;
    const gamma = n.netGex;
    const delta = n.netDex;
    const vega = n.netVex;
    const vanna = n.vanna * oiScale;
    const charm = n.charm * oiScale;
    // Higher-order greeks modeled from the base surface with their relationships
    const speed = gamma * -m * 9; // dGamma/dSpot — signed by moneyness
    const color = gamma * (0.35 + Math.abs(m) * 4) * (indicators.squeeze ? 0.6 : 1) * -0.5; // dGamma/dTime
    const vomma = vega * (0.4 + Math.abs(m) * 6) * (1 + seed(`vom-${n.strike}`) * 0.15);
    const ultima = vomma * -m * 5;
    // Veta = dVega/dTime. Vega bleeds toward zero into expiry, so it is signed
    // against vega and damped in a squeeze; the (1 + |m|) envelope keeps it from
    // being a flat multiple of the vega it rides on (its own d1·d2 term).
    const veta = vega * -(0.45 + Math.abs(m) * 1.5) * (indicators.squeeze ? 0.7 : 1);
    // Zomma = dGamma/dVol, the Γ·(d1·d2 − 1)/σ shape with σ folded into the
    // scale: negative near the money (gamma falls as vol rises), flipping
    // positive out in the wings where d1·d2 clears 1.
    const zomma = gamma * (Math.abs(m) * 8 - 0.55);
    return {
      strike: n.strike,
      distPct: m * 100,
      gamma,
      delta,
      vanna,
      charm,
      vomma,
      veta,
      speed,
      color,
      ultima,
      zomma,
    };
  });

  const sum = (k: GreekKey) => rows.reduce((a, r) => a + r[k], 0);
  const netByGreek = {
    gamma: sum('gamma'),
    delta: sum('delta'),
    vanna: sum('vanna'),
    charm: sum('charm'),
    vomma: sum('vomma'),
    veta: sum('veta'),
    speed: sum('speed'),
    color: sum('color'),
    ultima: sum('ultima'),
    zomma: sum('zomma'),
  } as Record<GreekKey, number>;

  // ---- dealer regime probability ----
  const netGex = netByGreek.gamma;
  const longGamma = netGex > 0;
  // Flip, wall and pin all come off the levels rail. The regime is a claim about
  // where price sits relative to the structure, so it has to be the same
  // structure Pinpoint's other panels draw: this used to test the call wall and
  // then call the result a pin, and an at-the-money gamma test rolled here is a
  // third answer to a question gex.ts already owns. `half` is 10 because the
  // matrix window is the 20 strikes nearest spot — 10 either side.
  const levels = buildLevels(snapshot);
  const pin = pinStrike(snapshot, 10);
  const belowFlip = spot < levels.flip;
  const nearPin = Math.abs((spot - pin) / spot) < 0.01 || Math.abs((spot - levels.callWall) / spot) < 0.01;
  const rsiExtreme = indicators.rsi > 68 || indicators.rsi < 32;
  const trendUp = indicators.ema9 >= indicators.ema21;
  void trendUp;

  // Raw scores → softmax-ish normalization to probabilities
  const raw: Record<DealerRegime, number> = {
    'PINNED / CHOPPY': (longGamma ? 2.2 : 0.5) + (nearPin ? 1.4 : 0) + hRange(`${ticker}-${day}-pin`, 0, 0.6),
    'CONTROLLED TREND': (longGamma ? 1.6 : 0.7) + (!nearPin ? 1.0 : 0) + (rsiExtreme ? 0.4 : 0) + hRange(`${ticker}-${day}-ct`, 0, 0.6),
    'UNSTABLE BREAKOUT': (belowFlip ? 1.9 : 0.6) + (!longGamma ? 1.2 : 0) + hRange(`${ticker}-${day}-ub`, 0, 0.7),
    'LIQUIDATION CASCADE': (belowFlip && !longGamma ? 1.6 : 0.3) + (rsiExtreme && belowFlip ? 0.9 : 0) + hRange(`${ticker}-${day}-lc`, 0, 0.5),
  };
  const total = Object.values(raw).reduce((a, x) => a + x, 0);
  // Each note says what the book is doing and what that implies for the tape,
  // and stops there. These render on Pinpoint > Greeks beside the probability,
  // where a closing clause like "sell premium" reads as the desk's instruction
  // rather than as a description of a long-gamma regime.
  const notes: Record<DealerRegime, string> = {
    'PINNED / CHOPPY': 'Dealers are long gamma near a magnet — hedging dampens moves and price coils around the level. Realized range stays inside the implied one, and pushes off the edges keep getting hedged back.',
    'CONTROLLED TREND': 'Long gamma but away from the pin — dealers cushion pullbacks, so pullbacks stay shallow and the drift grinds on rather than snapping.',
    'UNSTABLE BREAKOUT': 'Short-gamma zone — dealer hedging amplifies moves. Breaks tend to run, and range expansion is the norm here rather than the exception.',
    'LIQUIDATION CASCADE': 'Short gamma into weakness — hedging feeds selling. Tail risk is live, and the fracture line is where the book stops absorbing it.',
  };
  const regimes: RegimeProb[] = (Object.keys(raw) as DealerRegime[])
    .map(r => ({ regime: r, prob: Math.round((raw[r] / total) * 100), note: notes[r] }))
    .sort((a, b) => b.prob - a.prob);
  const topRegime = regimes[0];

  // ---- charm clock: dealer delta drift into the close ----
  const charmTotal = netByGreek.charm;
  const charmClock: CharmPoint[] = [];
  for (let i = 0; i <= 13; i++) {
    const frac = i / 13; // 09:30 → 16:00
    const mins = Math.round(30 + frac * 390);
    const h = 9 + Math.floor(mins / 60);
    const m = mins % 60;
    // Charm's effect accelerates as time-to-close shrinks (t^-0.5 like)
    const accel = Math.pow(frac, 2.2);
    charmClock.push({
      time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      minsToClose: Math.round((1 - frac) * 390),
      deltaShift: charmTotal * accel,
    });
  }
  const charmToClose = charmTotal;

  // ---- vanna shock: hedging from IV moves, not price ----
  const vannaTotal = netByGreek.vanna;
  const vannaShock: VannaPoint[] = [];
  for (let v = -3; v <= 3; v += 0.5) {
    vannaShock.push({ volShockPct: v, hedgeUsd: vannaTotal * v });
  }
  const vannaPerVol = vannaTotal;

  return {
    ticker,
    spot,
    rows,
    netByGreek,
    regimes,
    topRegime,
    charmClock,
    charmToClose,
    vannaShock,
    vannaPerVol,
  };
}
