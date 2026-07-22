/*
==================================================
  SLAYER TERMINAL - HEDGE IMPACT / HEX (hedgeimpact.ts)
  GEX says which way dealers must hedge. HEX asks the
  question that actually decides the tape: can the
  market absorb that hedging?

    HEX = required dealer hedge  ÷  available liquidity

  Two sessions can carry identical gamma and behave
  nothing alike — the difference is depth. This engine
  turns dealer gamma into the shares/futures dealers
  must trade over the next 5 / 15 / 30 / 60 minutes,
  divides by the liquidity available in each window,
  and finds the Hedge Failure Boundary: the move at
  which hedging alone outruns the book and becomes
  self-reinforcing.

  Gamma/OI are the chain's real values; depth (ADV) is
  modeled per name and clearly swappable for a real
  depth feed behind the same contract. Deterministic
  per ticker + day.
==================================================
*/

import { dayKey, hRange, hGauss } from '../core/rng';
import type { MarketSnapshot } from '../types/market';

export interface HedgeWindow {
  mins: number;
  label: string;
  /** Signed dealer hedge flow over the window ($, + = must buy) */
  flowUsd: number;
  /** Shares dealers must trade (abs) */
  shares: number;
  /** ES-equivalent futures (abs) */
  futures: number;
  /** Liquidity available in the window ($) */
  depthUsd: number;
  /** required hedge ÷ available liquidity for a 1σ window move */
  hex: number;
}

export type StressLabel = 'LIGHT' | 'BUILDING' | 'STRETCHED' | 'CRITICAL';

export interface HedgeImpactView {
  ticker: string;
  spot: number;
  longGamma: boolean;
  /** Dealer hedge $ demanded per 1% underlying move */
  hedgePer1pctUsd: number;
  hedgeSharesPer1pct: number;
  /** Modeled average daily $ volume — the liquidity denominator */
  advUsd: number;
  /** Whether hedging pushes with the move (short gamma) or against it (long gamma) */
  hedgeDirection: 'AMPLIFYING' | 'DAMPENING';
  windows: HedgeWindow[];
  /** Headline HEX — the 15-minute read */
  hex15: number;
  inventoryStress: number;
  stressLabel: StressLabel;
  /** Move (%) at which HEX crosses 1 in a 15-min window — hedging outruns depth */
  failureBoundaryPct: number;
  failureBoundaryPrice: number;
  failureSide: 'UP' | 'DOWN';
  /** HEX(move%) curve for the chart */
  curve: { movePct: number; hex: number }[];
  headline: string;
  note: string;
}

const WINDOWS = [
  { mins: 5, label: '5 min' },
  { mins: 15, label: '15 min' },
  { mins: 30, label: '30 min' },
  { mins: 60, label: '60 min' },
];

const MINS_PER_SESSION = 390;
const MINS_PER_YEAR = 390 * 252;
/** ES notional per point ≈ $50 × index; use $50 × spot as one future's delta */
const FUT_MULT = 50;

/** 1σ move (%) over `mins` minutes given an annualized vol. */
function windowMovePct(sigmaAnnual: number, mins: number): number {
  return sigmaAnnual * Math.sqrt(mins / MINS_PER_YEAR) * 100;
}

export function buildHedgeImpact(snapshot: MarketSnapshot): HedgeImpactView {
  const { ticker, spot, chain, changePercent, indicators, plan } = snapshot;
  const day = dayKey();

  const netGex = chain.reduce((a, n) => a + n.netGex, 0);
  const gammaMag = chain.reduce((a, n) => a + Math.abs(n.netGex), 0) || spot * 1e6;
  const netDex = chain.reduce((a, n) => a + n.netDex, 0);
  const longGamma = netGex >= 0;

  // Dealer hedge $ per 1% move — the signed gamma notional they must rebalance.
  const hedgePer1pctUsd = Math.abs(netGex);
  const hedgeSharesPer1pct = hedgePer1pctUsd / spot;

  // Available liquidity: modeled $ ADV, scaled off the name's gamma footprint
  // (bigger books trade bigger). Clearly swappable for a real depth feed.
  const advUsd = gammaMag * hRange(`${ticker}-${day}-adv`, 9, 22);

  // Impact factor — long gamma hedges AGAINST the move (adds liquidity, absorptive);
  // short gamma hedges WITH it (consumes liquidity). Crowding stretches it.
  const crowding = hRange(`${ticker}-${day}-crowd`, 0.85, 1.3);
  const impact = (longGamma ? 0.4 : 1.15) * crowding;

  // Annualized vol proxy for expected window moves
  const sigmaAnnual = Math.max(0.12, 0.16 + (indicators.squeeze ? -0.03 : 0.03) + hRange(`${ticker}-${day}-sig`, 0, 0.34));

  // Direction of forced hedging: short gamma amplifies the current drift; long
  // gamma leans against it. Charm adds a small close-ward bias either way.
  const driftSign = changePercent >= 0 ? 1 : -1;
  const hedgeSign = longGamma ? -driftSign : driftSign;

  const windows: HedgeWindow[] = WINDOWS.map(w => {
    const movePct = windowMovePct(sigmaAnnual, w.mins);
    const requiredUsd = hedgePer1pctUsd * movePct * impact;
    const depthUsd = advUsd * (w.mins / MINS_PER_SESSION);
    const hex = requiredUsd / Math.max(depthUsd, 1);
    const flowUsd = hedgeSign * hedgePer1pctUsd * movePct;
    const shares = Math.abs(flowUsd) / spot;
    return {
      mins: w.mins,
      label: w.label,
      flowUsd,
      shares,
      futures: shares / FUT_MULT,
      depthUsd,
      hex,
    };
  });

  const hex15 = windows[1].hex;

  // Hedge Failure Boundary — the move where a 15-min window's required hedge
  // equals its available depth (HEX = 1). Below it, hedging is absorbed; above,
  // it outruns the book and feeds on itself.
  const depth15 = windows[1].depthUsd;
  const failureBoundaryPct = Math.max(0.1, depth15 / Math.max(hedgePer1pctUsd * impact, 1));
  const failureSide: 'UP' | 'DOWN' = longGamma ? (driftSign > 0 ? 'UP' : 'DOWN') : driftSign > 0 ? 'UP' : 'DOWN';
  const failureBoundaryPrice = spot * (1 + (failureSide === 'UP' ? 1 : -1) * failureBoundaryPct / 100);

  // Dealer inventory stress — how stretched the book is right now.
  const distFromFlip = Math.abs((spot - plan.flipZone) / spot);
  const dexStrain = Math.min(1, Math.abs(netDex) / (gammaMag * 0.6 + 1));
  const rawStress =
    (longGamma ? 26 : 58) +
    (indicators.squeeze ? 10 : 0) +
    dexStrain * 18 +
    Math.min(18, distFromFlip * 400) * (longGamma ? -0.5 : 1) +
    hGauss(`${ticker}-${day}-hex-stress`) * 8;
  const inventoryStress = Math.round(Math.max(3, Math.min(99, rawStress)));
  const stressLabel: StressLabel =
    inventoryStress >= 78 ? 'CRITICAL' : inventoryStress >= 58 ? 'STRETCHED' : inventoryStress >= 36 ? 'BUILDING' : 'LIGHT';

  // HEX(move%) curve for the chart — linear in the move for a fixed 15-min depth
  const curve: { movePct: number; hex: number }[] = [];
  for (let m = 0; m <= 3.01; m += 0.25) {
    curve.push({ movePct: Number(m.toFixed(2)), hex: (hedgePer1pctUsd * m * impact) / Math.max(depth15, 1) });
  }

  const hedgeDirection = longGamma ? 'DAMPENING' : 'AMPLIFYING';
  const fmtPct = failureBoundaryPct.toFixed(2);
  const headline = longGamma
    ? `Dealers are long gamma — hedging leans against the move and adds liquidity. HEX holds near ${hex15.toFixed(2)}; it would take a ${fmtPct}% move inside 15 minutes before hedging outruns the book.`
    : `Dealers are short gamma — hedging pushes with the move and eats liquidity. HEX is ${hex15.toFixed(2)} on a 15-minute window, and a move past ${fmtPct}% (${failureSide.toLowerCase()}, to $${failureBoundaryPrice.toFixed(2)}) tips hedging into self-reinforcing.`;
  const note =
    hex15 >= 1
      ? 'Required hedging already exceeds the liquidity available to absorb it in the near windows — expect dealer flow to move price, not just follow it.'
      : 'Hedging fits inside available liquidity for now — dealers can rebalance without dislocating the tape, unless the move accelerates past the failure boundary.';

  return {
    ticker,
    spot,
    longGamma,
    hedgePer1pctUsd,
    hedgeSharesPer1pct,
    advUsd,
    hedgeDirection,
    windows,
    hex15,
    inventoryStress,
    stressLabel,
    failureBoundaryPct,
    failureBoundaryPrice,
    failureSide,
    curve,
    headline,
    note,
  };
}
