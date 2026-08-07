/*
==================================================
  SLAYER TERMINAL - FLOW TAPE ENRICHMENT (flowtape.ts)
  Expands the simulator's thin TapeOrder into a full
  FlowPrint deterministically. Placeholder — the real
  per-print feed fills the same contract later.
==================================================
*/

import Simulator, { settledOI } from '../core/simulator';
import { expiryFor, fmtExpiryLong } from '../core/calendar';
import { yearsToExpiry } from '../core/optionTime';
import type { ContractGreeks, TapeOrder } from '../types/market';
import type { FlowPrint, PrintSentiment, StratTag, TapeSummary } from '../types/flowdesk';
import {
  TRADE_CONDITION,
  MULTI_LEG_CODES,
  STOCK_OPTION_CODES,
  SINGLE_LEG_MECHANISM_CODES,
  aggressorSide,
  isSweep,
  isDirectional,
} from '../types/conditions';

// ---- deterministic RNG ------------------------------------------------------
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function h01(seed: string): number {
  return (hash(seed) % 1000) / 1000;
}

const DTE_POOL = [0, 1, 2, 5, 9, 16, 30, 44, 72, 102, 254];
const STRATS: StratTag[] = ['Vertical', 'Butterfly', 'Ratio', 'Custom'];

// ---- trade-stamped greeks ---------------------------------------------------
function normCdf(x: number): number {
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2);
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(x * x) / 2);
  return 0.5 * (1 + Math.sign(x) * erf);
}
function normPdf(x: number): number {
  return Math.exp(-(x * x) / 2) / Math.sqrt(2 * Math.PI);
}

/**
 * The 1st-order Black-Scholes greek vector ThetaData stamps on a trade
 * (`trade_greeks`). This is the input to per-print dealer-inventory change
 * (P4.3): gamma and delta are read there, but the full 1st-order vector is
 * stamped because that is what the vendor field carries. r = 0.045 matches
 * core/contractScore.ts; time floors at half a session via yearsToExpiry, one
 * convention shared with every pricer on the desk.
 */
function tradeGreeks(spot: number, strike: number, dte: number, iv: number, right: 'C' | 'P'): ContractGreeks {
  const T = yearsToExpiry(dte);
  const r = 0.045;
  const sig = Math.max(iv, 1e-4);
  const sqT = Math.sqrt(T);
  const d1 = (Math.log(spot / strike) + (r + (sig * sig) / 2) * T) / (sig * sqT);
  const d2 = d1 - sig * sqT;
  const disc = Math.exp(-r * T);
  const pdf = normPdf(d1);
  const gamma = pdf / (spot * sig * sqT);
  const vega = (spot * pdf * sqT) / 100; // per 1 vol point
  const delta = right === 'C' ? normCdf(d1) : normCdf(d1) - 1;
  const thetaAnnual =
    right === 'C'
      ? -(spot * pdf * sig) / (2 * sqT) - r * strike * disc * normCdf(d2)
      : -(spot * pdf * sig) / (2 * sqT) + r * strike * disc * normCdf(-d2);
  const rho =
    right === 'C'
      ? (strike * T * disc * normCdf(d2)) / 100
      : (-strike * T * disc * normCdf(-d2)) / 100;
  return { delta, gamma, theta: thetaAnnual / 365, vega, rho };
}

export function enrichPrint(order: TapeOrder, id: number): FlowPrint {
  const seed = `${order.ticker}-${order.strike}-${order.side}-${order.size}-${id}`;
  const h = (tag: string) => h01(`${seed}-${tag}`);

  const cfg = Simulator.TICKERS[order.ticker];
  const spot = cfg?.currentPrice ?? 100;
  const baseIv = cfg?.iv ?? 0.2;
  const strike = Number(order.strike);
  const right = order.type;

  // Short-dated skew on expiry selection
  const dte = DTE_POOL[Math.floor(Math.pow(h('dte'), 1.6) * DTE_POOL.length)];
  const expiry = fmtExpiryLong(expiryFor(dte).date);

  // Premium estimate: intrinsic + gaussian time value scaled by DTE
  const intrinsic = right === 'C' ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
  const money = (strike - spot) / spot;
  const timeValue =
    spot * baseIv * 0.08 * Math.exp(-Math.pow(money * 18, 2) / 2) * (0.5 + Math.sqrt((dte + 1) / 30));
  const fill = Number(Math.max(0.05, intrinsic * 0.98 + timeValue).toFixed(2));

  // Fill position within the spread follows the aggressor side
  const spreadW = Math.max(0.02, fill * 0.03 * (0.6 + h('spr')));
  const fillPos = order.side === 'ASK' ? 0.72 + h('pos') * 0.28 : h('pos') * 0.28;
  const mid = order.side === 'ASK' ? fill - spreadW * fillPos : fill + spreadW * (1 - fillPos);
  const bid = Number((mid - spreadW / 2).toFixed(2));
  const ask = Number((mid + spreadW / 2).toFixed(2));

  const isMid = h('mid') > 0.82;
  const legs = h('legs') > 0.78 ? 2 + Math.floor(h('legs2') * 3) : 1;
  const strat: StratTag = legs > 1 ? STRATS[Math.floor(h('strat') * STRATS.length)] : h('strat') > 0.9 ? 'Custom' : '—';

  // ---- Trade condition codes (P3.1) --------------------------------------
  // The real feed stamps these; here the enrichment derives them from the order
  // the simulator produced, so downstream reads the exchange fact — aggressor,
  // sweep, structure — instead of inferring side from the fill. Frequencies are
  // plausible, not uniform: most prints plain with an exchange aggressor, a
  // sweep minority, a meaningful multi-leg share, a smaller delta-hedged slice,
  // and rare auction/cabinet mechanisms.
  const conditions: number[] = [];
  if (!isMid) {
    conditions.push(order.side === 'ASK' ? TRADE_CONDITION.ASK_AGGRESSOR : TRADE_CONDITION.BID_AGGRESSOR);
  }
  if (order.orderType === 'SWEEP') conditions.push(TRADE_CONDITION.INTERMARKET_SWEEP);
  if (legs > 1) {
    // A spread leg — aligned with legs > 1 so the ×N marker and the code agree.
    conditions.push(MULTI_LEG_CODES[Math.floor(h('mleg') * MULTI_LEG_CODES.length)]);
  } else if (h('hedge') > 0.92) {
    // Delta-hedged: qualified-contingent or a stock+option print. Non-directional.
    conditions.push(
      h('hedge2') > 0.5
        ? TRADE_CONDITION.QUALIFIED_CONTINGENT_TRADE
        : STOCK_OPTION_CODES[Math.floor(h('hedge3') * STOCK_OPTION_CODES.length)]
    );
  }
  if (h('mech') > 0.96) {
    conditions.push(SINGLE_LEG_MECHANISM_CODES[Math.floor(h('mech2') * SINGLE_LEG_MECHANISM_CODES.length)]);
  }
  if (h('cab') > 0.99) conditions.push(TRADE_CONDITION.CABINET);

  // Side and sweep now read the codes rather than the fill.
  const side: FlowPrint['side'] = aggressorSide(conditions) ?? 'MID';
  const flowScore = isMid
    ? Math.round((h('fs') - 0.5) * 24)
    : Math.round((side === 'ASK' ? 1 : -1) * (48 + h('fs') * 52));

  const ratioBidPct = Math.round(side === 'BID' ? 45 + h('rb') * 50 : side === 'ASK' ? 5 + h('rb') * 50 : 35 + h('rb') * 30);
  const ratioLabel = isMid ? 'MID' : ratioBidPct >= 50 ? `BID ${ratioBidPct}%` : `ASK ${100 - ratioBidPct}%`;

  const volume = Math.round(order.size * (4 + h('vol') * 80));
  const oi = Math.max(1, Math.round(volume * (0.4 + h('oi') * 3.2)));
  const deltaOI = h('doi') > 0.35 ? Math.round((h('doi2') - 0.4) * oi * 0.25) : 0;

  // The print's own implied vol — the vol the greeks below are stamped at, so the
  // displayed iv and the trade_greeks vector describe the same contract.
  const ivFrac = baseIv * (0.8 + h('iv') * 0.6);

  return {
    id,
    time: order.time,
    ticker: order.ticker,
    legs,
    strike,
    right,
    otmPct: Number((money * 100).toFixed(1)),
    expiry,
    dte,
    fill,
    bid,
    ask,
    fillPos: Number(fillPos.toFixed(2)),
    side,
    flowScore,
    ratioLabel,
    ratioBidPct,
    size: order.size,
    premium: Math.round(fill * order.size * 100),
    volume,
    oi: settledOI(oi),
    deltaOI: settledOI(deltaOI),
    spot: Number(spot.toFixed(2)),
    iv: Number((ivFrac * 100).toFixed(2)),
    volOverOI: Number((volume / oi).toFixed(2)),
    strat,
    sweep: isSweep(conditions),
    conditions,
    // trade_greeks: the greek vector stamped at this print, the input the Gamma
    // Tape reads to turn one print into a dealer-inventory change (P4.3).
    greeks: tradeGreeks(spot, strike, dte, ivFrac, right),
  };
}

/**
 * Aggressive call buys / put sells read bullish; the inverse reads bearish.
 * A multi-leg leg or a delta-hedged print carries no standalone direction, so it
 * reads NEUTRAL regardless of which side it hit — the P4.2 clean-flow contract.
 * A spread leg lifting the ask is not a bull; its delta is offset by the other
 * legs the print does not show.
 */
export function sentimentOf(p: FlowPrint): PrintSentiment {
  if (p.side === 'MID' || !isDirectional(p.conditions)) return 'NEUTRAL';
  return (p.right === 'C' && p.side === 'ASK') || (p.right === 'P' && p.side === 'BID') ? 'BULLISH' : 'BEARISH';
}

export function summarizeTape(prints: FlowPrint[]): TapeSummary {
  let bull = 0;
  let bear = 0;
  let callCount = 0;
  let callPremium = 0;
  let putCount = 0;
  let putPremium = 0;
  let sweeps = 0;
  let directional = 0;
  let structure = 0;
  let largest: FlowPrint | null = null;

  for (const p of prints) {
    if (p.right === 'C') {
      callCount++;
      callPremium += p.premium;
    } else {
      putCount++;
      putPremium += p.premium;
    }
    if (p.sweep) sweeps++;
    // Directional = single-leg, un-hedged (P4.2). Spread legs and delta-hedged
    // prints are structure: they trade but they do not take a side, so they are
    // split out here and never reach the bull/bear net below.
    if (isDirectional(p.conditions)) directional += p.premium;
    else structure += p.premium;
    if (!largest || p.premium > largest.premium) largest = p;
    const s = sentimentOf(p);
    if (s === 'BULLISH') bull += p.premium;
    else if (s === 'BEARISH') bear += p.premium;
  }

  const netPremium = bull - bear;
  return {
    totalPremium: callPremium + putPremium,
    netPremium,
    bullish: netPremium >= 0,
    bullPremium: bull,
    bearPremium: bear,
    directionalPremium: directional,
    structurePremium: structure,
    callCount,
    callPremium,
    putCount,
    putPremium,
    pcRatio: callCount > 0 ? Number((putCount / callCount).toFixed(2)) : 0,
    rvol: Number((0.55 + h01(`rvol-${prints.length}`) * 0.5).toFixed(2)),
    sweeps,
    blocks: prints.length - sweeps,
    largest: largest
      ? { ticker: largest.ticker, strike: largest.strike, right: largest.right, premium: largest.premium }
      : null,
  };
}
