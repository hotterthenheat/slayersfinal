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
import type { MarketSnapshot } from '../types/market';

export type GreekKey = 'gamma' | 'delta' | 'vanna' | 'charm' | 'vomma' | 'speed' | 'color' | 'ultima';

export const GREEKS: { key: GreekKey; label: string; blurb: string }[] = [
  { key: 'gamma', label: 'Gamma', blurb: 'hedging vs price — the pin/chase engine' },
  { key: 'delta', label: 'Delta', blurb: 'directional exposure to hedge' },
  { key: 'vanna', label: 'Vanna', blurb: 'delta drift as IV moves' },
  { key: 'charm', label: 'Charm', blurb: 'delta drift as time passes' },
  { key: 'vomma', label: 'Vomma', blurb: 'vega convexity — vol of vol' },
  { key: 'speed', label: 'Speed', blurb: 'how fast gamma changes with price' },
  { key: 'color', label: 'Color', blurb: 'how fast gamma changes with time' },
  { key: 'ultima', label: 'Ultima', blurb: 'third-order vol sensitivity' },
];

export interface GreekRow {
  strike: number;
  distPct: number;
  gamma: number;
  delta: number;
  vanna: number;
  charm: number;
  vomma: number;
  speed: number;
  color: number;
  ultima: number;
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
  const { ticker, spot, chain, plan, indicators } = snapshot;
  const day = dayKey();
  const seed = (t: string) => hRange(`${ticker}-${day}-grk-${t}`, -1, 1);

  const window = [...chain]
    .sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))
    .slice(0, 20)
    .sort((a, b) => b.strike - a.strike);

  const rows: GreekRow[] = window.map(n => {
    const m = (n.strike - spot) / spot;
    const oiScale = (n.callOI + n.putOI) * 100 * spot * 1e-4;
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
    return {
      strike: n.strike,
      distPct: m * 100,
      gamma,
      delta,
      vanna,
      charm,
      vomma,
      speed,
      color,
      ultima,
    };
  });

  const sum = (k: GreekKey) => rows.reduce((a, r) => a + r[k], 0);
  const netByGreek = {
    gamma: sum('gamma'),
    delta: sum('delta'),
    vanna: sum('vanna'),
    charm: sum('charm'),
    vomma: sum('vomma'),
    speed: sum('speed'),
    color: sum('color'),
    ultima: sum('ultima'),
  } as Record<GreekKey, number>;

  // ---- dealer regime probability ----
  const netGex = netByGreek.gamma;
  const gexMag = rows.reduce((a, r) => a + Math.abs(r.gamma), 0) || 1;
  const longGamma = netGex > 0;
  const belowFlip = spot < plan.flipZone;
  const nearPin = Math.abs((spot - plan.resistanceWall) / spot) < 0.01 || rows.some(r => Math.abs(r.distPct) < 0.3 && Math.abs(r.gamma) > gexMag * 0.14);
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
  const notes: Record<DealerRegime, string> = {
    'PINNED / CHOPPY': 'Dealers are long gamma near a magnet — hedging dampens moves and price coils around the wall. Sell premium, fade the edges.',
    'CONTROLLED TREND': 'Long gamma but away from the pin — dealers cushion pullbacks so trends grind rather than snap. Trade with the drift, buy dips.',
    'UNSTABLE BREAKOUT': 'Short-gamma zone — dealer hedging amplifies moves. Breaks tend to run; expect expansion, respect momentum.',
    'LIQUIDATION CASCADE': 'Short gamma into weakness — hedging feeds selling. Tail risk is live; size down and watch the fracture line.',
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
