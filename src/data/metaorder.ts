/*
==================================================
  SLAYER TERMINAL - METAORDER RECONSTRUCTION (metaorder.ts)
  Trace › Reconstruction. The tape shows children —
  individual prints. This engine reassembles them
  into the PARENT (meta) order the desk is actually
  working: the strategy, the estimated full size, how
  much is already done, how long the rest should take,
  and whether the footprint reads as informed
  conviction or routine hedging.

  A parent order is never a single ticket — it's a
  clip worked over minutes. We cluster the prints,
  infer the strategy from the leg geometry and
  aggressor side, and project the completion curve.

  Chain strikes are the live chain; the child-print
  clip and the parent-order reconstruction are modeled
  from snapshot.tape and swap for a real
  execution-reconstruction feed behind the same
  contract. Deterministic per ticker + day.
==================================================
*/

import { dayKey, h01, hRange, hGauss, hPick } from '../core/rng';
import type { MarketSnapshot } from '../types/market';

export type Urgency = 'LOW' | 'MED' | 'HIGH';
export type InfoClass = 'INFORMED' | 'MIXED' | 'HEDGE';
export type InfoLabel = 'low' | 'moderate' | 'high';

export type MetaStrategy =
  | 'OPENING CALL SPREAD'
  | 'OPENING PUT SPREAD'
  | 'OUTRIGHT CALL BUYING'
  | 'OUTRIGHT PUT BUYING'
  | 'PROTECTIVE PUT HEDGE'
  | 'COLLAR HEDGE'
  | 'OVERWRITE / CALL SALE';

/** One reassembled clip — an individual child print of a parent order. */
export interface ChildPrint {
  id: number;
  time: string;
  /** 0…1 position in the session (modeled clock, no wall time) */
  atFrac: number;
  strike: number;
  right: 'C' | 'P';
  size: number;
  premium: number;
  side: 'ASK' | 'BID';
  orderType: 'SWEEP' | 'BLOCK';
}

/** Child prints collapsed onto the distinct legs of the parent order. */
export interface MetaLeg {
  strike: number;
  right: 'C' | 'P';
  size: number;
  premium: number;
  /** Dominant aggressor side across the leg's clips */
  side: 'ASK' | 'BID';
  /** BOUGHT = long leg, SOLD = short leg */
  action: 'BOUGHT' | 'SOLD';
}

export interface Metaorder {
  id: string;
  ticker: string;
  strategy: MetaStrategy;
  /** Human phrase for the headline, e.g. "opening call-spread" */
  phrase: string;
  /** +1 bullish · −1 bearish · 0 non-directional / hedge */
  dir: -1 | 0 | 1;
  legs: MetaLeg[];
  children: ChildPrint[];
  childCount: number;
  /** Premium worked so far, $ (gross across legs) */
  filledUsd: number;
  /** Estimated full parent size, $ */
  estTotalUsd: number;
  pctComplete: number;
  minsElapsed: number;
  minsRemainingLo: number;
  minsRemainingHi: number;
  urgency: Urgency;
  /** Minutes for half the remaining clip to print at the current pace */
  halfLifeMin: number;
  infoClass: InfoClass;
  /** Probability this opens exposure vs closes it, 0–100 */
  openingProb: number;
  /** Premium-weighted share lifting the ask (buy aggression), 0–100 */
  askPct: number;
  /** Share of child prints tagged as sweeps, 0–100 */
  sweepShare: number;
  /** Signed directional information score, −100…+100 */
  infoScore: number;
  infoLabel: InfoLabel;
  headline: string;
  read: string;
}

export interface MetaorderView {
  ticker: string;
  spot: number;
  metaorders: Metaorder[];
  detected: number;
  childPrintCount: number;
  /** Live tape prints the reconstruction was seeded from */
  seedPrints: number;
  totalReconstructedUsd: number;
  largest: Metaorder | null;
  /** Premium-weighted net directional info across all parents, −100…+100 */
  netInfoScore: number;
  netBias: 'BULLISH' | 'BEARISH' | 'BALANCED';
  /** Share of reconstructed premium classified INFORMED, 0–100 */
  informedSharePct: number;
  avgOpeningProb: number;
  headline: string;
}

interface LegTemplate {
  right: 'C' | 'P';
  /** OTM steps out from the anchor rung on this right's ladder */
  offset: number;
  side: 'ASK' | 'BID';
  action: 'BOUGHT' | 'SOLD';
  /** Share of the clip that lands on this leg */
  weight: number;
}

interface StratDef {
  key: MetaStrategy;
  phrase: string;
  dir: -1 | 0 | 1;
  /** Base informed (1) vs hedge (0) tendency */
  infoBias: number;
  /** Base opening (1) vs closing (0) probability */
  openBias: number;
  legs: LegTemplate[];
  read: string;
}

const STRATS: StratDef[] = [
  {
    key: 'OUTRIGHT CALL BUYING',
    phrase: 'outright call buying',
    dir: 1,
    infoBias: 0.86,
    openBias: 0.93,
    legs: [{ right: 'C', offset: 0, side: 'ASK', action: 'BOUGHT', weight: 1 }],
    read: 'Calls swept at the ask with no offsetting leg — the most directional footprint on the tape. Pure long-delta conviction, urgency-priced; the buyer is paying for immediacy, not fishing for a fill.',
  },
  {
    key: 'OUTRIGHT PUT BUYING',
    phrase: 'outright put buying',
    dir: -1,
    infoBias: 0.8,
    openBias: 0.9,
    legs: [{ right: 'P', offset: 0, side: 'ASK', action: 'BOUGHT', weight: 1 }],
    read: 'Puts lifted outright and aggressively. Either a directional bearish bet or downside protection being built fast in size — the clip pace and lack of a financing leg lean it toward a view, not a hedge.',
  },
  {
    key: 'OPENING CALL SPREAD',
    phrase: 'opening call-spread',
    dir: 1,
    infoBias: 0.68,
    openBias: 0.9,
    legs: [
      { right: 'C', offset: 0, side: 'ASK', action: 'BOUGHT', weight: 0.62 },
      { right: 'C', offset: 2, side: 'BID', action: 'SOLD', weight: 0.38 },
    ],
    read: 'Buying the nearer call and selling the further one — a defined-risk bullish opener. Someone is paying up for upside inside a band rather than chasing unlimited convexity; the short leg finances the view.',
  },
  {
    key: 'OPENING PUT SPREAD',
    phrase: 'opening put-spread',
    dir: -1,
    infoBias: 0.66,
    openBias: 0.88,
    legs: [
      { right: 'P', offset: 0, side: 'ASK', action: 'BOUGHT', weight: 0.62 },
      { right: 'P', offset: 2, side: 'BID', action: 'SOLD', weight: 0.38 },
    ],
    read: 'Long the nearer put, short the further one — a financed bearish opener. Positioning for a measured move down, capped and cost-reduced; the geometry says target, not tail.',
  },
  {
    key: 'PROTECTIVE PUT HEDGE',
    phrase: 'protective put hedge',
    dir: 0,
    infoBias: 0.18,
    openBias: 0.82,
    legs: [{ right: 'P', offset: 1, side: 'ASK', action: 'BOUGHT', weight: 1 }],
    read: 'OTM puts bought against existing length — reads as insurance, not a view. Low directional information: the underlying position is the signal here, not this print. Don’t read it as a fresh bearish bet.',
  },
  {
    key: 'COLLAR HEDGE',
    phrase: 'collar hedge',
    dir: 0,
    infoBias: 0.16,
    openBias: 0.7,
    legs: [
      { right: 'P', offset: 1, side: 'ASK', action: 'BOUGHT', weight: 0.5 },
      { right: 'C', offset: 1, side: 'BID', action: 'SOLD', weight: 0.5 },
    ],
    read: 'Long puts financed by short calls around spot — a classic collar. Risk is being fenced, not opened; treat it as hedge flow that caps both tails rather than a directional signal.',
  },
  {
    key: 'OVERWRITE / CALL SALE',
    phrase: 'overwrite / call sale',
    dir: -1,
    infoBias: 0.3,
    openBias: 0.32,
    legs: [{ right: 'C', offset: 1, side: 'BID', action: 'SOLD', weight: 1 }],
    read: 'OTM calls sold in size — income overwrite against stock or a close of longs into strength. Mildly bearish supply overhead with low new information; the seller wants premium or an exit, not a move.',
  },
];

const MINS_PER_SESSION = 390;

const pad = (n: number): string => String(n).padStart(2, '0');

/** Session HH:MM from a 0…1 session fraction (09:30 → 16:00). No wall clock. */
function sessionTime(frac: number): string {
  const clamped = Math.max(0, Math.min(1, frac));
  const mins = Math.round(30 + clamped * MINS_PER_SESSION);
  return `${pad(9 + Math.floor(mins / 60))}:${pad(mins % 60)}`;
}

function usd(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(a / 1e3).toFixed(0)}K`;
  return `$${a.toFixed(0)}`;
}

export function buildMetaorderView(snapshot: MarketSnapshot): MetaorderView {
  const { ticker, spot, chain, indicators, tape } = snapshot;
  const day = dayKey();

  // Chain rungs nearest spot, split into OTM ladders per right.
  const window = [...chain].sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot)).slice(0, 18);
  const callLadder = window.filter(n => n.strike >= spot).sort((a, b) => a.strike - b.strike);
  const putLadder = window.filter(n => n.strike < spot).sort((a, b) => b.strike - a.strike);

  // Modeled IV proxy — sets the child-print premiums off strike distance.
  const ivProxy = 0.18 + hRange(`${ticker}-${day}-mo-iv`, 0, 0.22) + (indicators.squeeze ? -0.02 : 0.02);
  const unitPx = (strike: number, right: 'C' | 'P'): number => {
    const intrinsic = right === 'C' ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
    const m = Math.abs(strike - spot) / spot;
    const timeValue = spot * ivProxy * 0.11 * Math.exp(-m * 6);
    return Math.max(0.05, intrinsic + timeValue);
  };

  // How many parent orders the tape resolves into. Seeded off the live tape size
  // so a busier session reconstructs into more parents.
  const seedPrints = tape.length;
  const count = Math.round(hRange(`${ticker}-${day}-mo-count`, 3, 6));

  const metaorders: Metaorder[] = [];
  for (let i = 0; i < count; i++) {
    const seed = (t: string) => `${ticker}-${day}-mo-${i}-${t}`;
    const def = hPick(seed('strat'), STRATS);

    // Anchor depth on each ladder — how far OTM this desk is working.
    const legStrike = (right: 'C' | 'P', offset: number): number => {
      const ladder = right === 'C' ? callLadder : putLadder;
      if (ladder.length === 0) return spot;
      const base = Math.floor(h01(seed('base')) * Math.min(3, ladder.length));
      return ladder[Math.min(ladder.length - 1, base + offset)].strike;
    };

    // Cumulative leg weights for weighted clip assignment.
    const totalWeight = def.legs.reduce((a, l) => a + l.weight, 0);

    const childCount = Math.round(hRange(seed('cc'), 4, 14));
    const clipBase = hRange(seed('clip'), 60, 900);
    const startFrac = hRange(seed('start'), 0.05, 0.7);
    const spanFrac = hRange(seed('span'), 0.05, 0.28);

    const children: ChildPrint[] = [];
    for (let j = 0; j < childCount; j++) {
      // Pick a leg by weight.
      let roll = h01(seed(`leg-${j}`)) * totalWeight;
      let leg = def.legs[0];
      for (const l of def.legs) {
        if (roll < l.weight) {
          leg = l;
          break;
        }
        roll -= l.weight;
      }
      const strike = legStrike(leg.right, leg.offset);
      const size = Math.round(clipBase * hRange(seed(`sz-${j}`), 0.5, 1.6));
      const premium = size * 100 * unitPx(strike, leg.right);
      const denom = Math.max(1, childCount - 1);
      const atFrac = Math.min(0.99, startFrac + spanFrac * (j / denom) + hRange(seed(`jit-${j}`), -0.01, 0.01));
      // Aggressive, informed clips sweep more; hedges block more.
      const sweep = h01(seed(`sw-${j}`)) < 0.28 + def.infoBias * 0.42;
      children.push({
        id: j,
        time: sessionTime(atFrac),
        atFrac,
        strike,
        right: leg.right,
        size,
        premium,
        side: leg.side,
        orderType: sweep ? 'SWEEP' : 'BLOCK',
      });
    }
    children.sort((a, b) => a.atFrac - b.atFrac);

    // Collapse clips onto distinct legs.
    const legMap = new Map<string, MetaLeg>();
    for (const c of children) {
      const key = `${c.strike}-${c.right}`;
      const existing = legMap.get(key);
      const template = def.legs.find(l => l.right === c.right && legStrike(l.right, l.offset) === c.strike);
      const action = template?.action ?? 'BOUGHT';
      if (existing) {
        existing.size += c.size;
        existing.premium += c.premium;
      } else {
        legMap.set(key, { strike: c.strike, right: c.right, size: c.size, premium: c.premium, side: c.side, action });
      }
    }
    const legs = [...legMap.values()].sort((a, b) => b.premium - a.premium);

    const filledUsd = children.reduce((a, c) => a + c.premium, 0);
    const askUsd = children.filter(c => c.side === 'ASK').reduce((a, c) => a + c.premium, 0);
    const askPct = filledUsd > 0 ? (askUsd / filledUsd) * 100 : 0;
    const sweepShare = (children.filter(c => c.orderType === 'SWEEP').length / Math.max(1, childCount)) * 100;

    const pctComplete = Math.round(hRange(seed('pct'), 22, 86));
    const estTotalUsd = filledUsd / (pctComplete / 100);
    const remainingUsd = Math.max(0, estTotalUsd - filledUsd);
    const minsElapsed = Math.max(1, Math.round(spanFrac * MINS_PER_SESSION));
    const rate = filledUsd / minsElapsed; // $/min worked so far
    const baseRemain = Math.max(2, Math.min(240, remainingUsd / Math.max(rate, 1)));

    // Urgency — how hard the counterparty is pressing to complete.
    const urgScore =
      (askPct / 100) * 0.4 + (sweepShare / 100) * 0.35 + def.infoBias * 0.2 + hGauss(seed('urg')) * 0.05;
    const urgency: Urgency = urgScore > 0.66 ? 'HIGH' : urgScore > 0.42 ? 'MED' : 'LOW';

    const remLoMult = urgency === 'HIGH' ? 0.55 : urgency === 'MED' ? 0.72 : 0.85;
    const remHiMult = urgency === 'HIGH' ? 1.1 : urgency === 'MED' ? 1.35 : 1.6;
    const minsRemainingLo = Math.max(1, Math.round(baseRemain * remLoMult));
    const minsRemainingHi = Math.max(minsRemainingLo + 3, Math.round(baseRemain * remHiMult));
    const halfLifeMin = Math.max(1, Math.round(baseRemain * (urgency === 'HIGH' ? 0.3 : urgency === 'MED' ? 0.45 : 0.62)));

    // Information vs hedge — leg geometry sets the base, aggression tilts it.
    const informed = def.infoBias * 0.6 + (askPct / 100) * 0.3 + (sweepShare / 100) * 0.1;
    const infoClass: InfoClass = informed > 0.62 ? 'INFORMED' : informed > 0.4 ? 'MIXED' : 'HEDGE';

    // Opening vs closing — buying at the ask and sweeping reads as opening.
    const openingProb = Math.round(
      Math.max(
        5,
        Math.min(97, def.openBias * 100 + (askPct - 50) * 0.18 + (sweepShare - 40) * 0.14 + hGauss(seed('open')) * 5)
      )
    );

    // Directional information score — signed conviction × informed-ness × weight.
    const mag = Math.min(100, informed * (40 + (askPct / 100) * 40) + Math.min(20, estTotalUsd / 1e6));
    const infoScore = Math.round(def.dir * mag);
    const absInfo = Math.abs(infoScore);
    const infoLabel: InfoLabel = absInfo >= 55 ? 'high' : absInfo >= 28 ? 'moderate' : 'low';

    const headline = `Probable ${def.phrase} metaorder — est. total ${usd(estTotalUsd)}, ~${pctComplete}% complete, ${minsRemainingLo}-${minsRemainingHi} min remaining, directional info: ${infoLabel}.`;

    metaorders.push({
      id: `${ticker}-mo-${i}`,
      ticker,
      strategy: def.key,
      phrase: def.phrase,
      dir: def.dir,
      legs,
      children,
      childCount,
      filledUsd,
      estTotalUsd,
      pctComplete,
      minsElapsed,
      minsRemainingLo,
      minsRemainingHi,
      urgency,
      halfLifeMin,
      infoClass,
      openingProb,
      askPct,
      sweepShare,
      infoScore,
      infoLabel,
      headline,
      read: def.read,
    });
  }

  metaorders.sort((a, b) => b.estTotalUsd - a.estTotalUsd);

  const detected = metaorders.length;
  const childPrintCount = metaorders.reduce((a, m) => a + m.childCount, 0);
  const totalReconstructedUsd = metaorders.reduce((a, m) => a + m.estTotalUsd, 0);
  const largest = metaorders.reduce<Metaorder | null>((a, m) => (a === null || m.estTotalUsd > a.estTotalUsd ? m : a), null);

  const weight = totalReconstructedUsd || 1;
  const netInfoScore = Math.round(
    Math.max(-100, Math.min(100, metaorders.reduce((a, m) => a + m.infoScore * m.estTotalUsd, 0) / weight))
  );
  const netBias: MetaorderView['netBias'] = netInfoScore > 12 ? 'BULLISH' : netInfoScore < -12 ? 'BEARISH' : 'BALANCED';

  const informedUsd = metaorders.filter(m => m.infoClass === 'INFORMED').reduce((a, m) => a + m.estTotalUsd, 0);
  const informedSharePct = (informedUsd / weight) * 100;
  const avgOpeningProb = detected ? Math.round(metaorders.reduce((a, m) => a + m.openingProb, 0) / detected) : 0;

  const biasPhrase =
    netBias === 'BULLISH'
      ? `net directional info leans bullish (+${netInfoScore})`
      : netBias === 'BEARISH'
        ? `net directional info leans bearish (${netInfoScore})`
        : `net directional info is balanced (${netInfoScore >= 0 ? '+' : ''}${netInfoScore})`;
  const headline = `${detected} parent orders reconstructed from ${childPrintCount} child prints — ${usd(totalReconstructedUsd)} of premium being worked, ${biasPhrase}. Informed flow is ${informedSharePct.toFixed(0)}% of the reconstructed tape.`;

  return {
    ticker,
    spot,
    metaorders,
    detected,
    childPrintCount,
    seedPrints,
    totalReconstructedUsd,
    largest,
    netInfoScore,
    netBias,
    informedSharePct,
    avgOpeningProb,
    headline,
  };
}
