/*
==================================================
  SLAYER TERMINAL - CONTRACT FLOW (drilldown data)
  The intraday flow of a SINGLE options contract, plus
  the underlying's net-premium tape — the two series
  behind the print-detail drilldown. Deterministic per
  contract (same hash family as the rest of the tape),
  so a contract always paints the same drilldown.
==================================================
*/

import { hRange, hGauss, hash } from '../core/rng';

export type FlowSide = 'BID' | 'MID' | 'ASK';

/**
 * Minimal contract identity the drilldown needs — the shared shape every desk
 * that shows a single contract (the tape print, a scanner row, …) can satisfy.
 * `FlowPrint` already carries every field, so it is assignable as-is; other
 * desks map their row onto this before opening the drilldown.
 */
export interface ContractRef {
  ticker: string;
  strike: number;
  right: 'C' | 'P';
  /** MM/DD/YYYY — seeds the deterministic drilldown alongside ticker+strike+right */
  expiry: string;
  /** representative contract premium ($ per contract) */
  fill: number;
  /** bid-side share of the contract's day, 0–100 */
  ratioBidPct: number;
  /** underlying spot */
  spot: number;
  /** dominant aggressor side */
  side: FlowSide;
  /** representative print size (0 when the row is an aggregate) */
  size: number;
  volume: number;
  oi: number;
  premium: number;
  otmPct: number;
  volOverOI: number;
  /** leg count — 1 for a single contract */
  legs: number;
}

export interface ContractPrintPoint {
  min: number; // minutes since the 09:30 open (0…390)
  price: number; // contract premium at the print
  size: number; // contracts
  side: FlowSide; // aggressor
}

export interface NetPremiumPoint {
  min: number;
  netCall: number; // cumulative net call premium ($, ≥0 side)
  netPut: number; // cumulative net put premium ($, ≤0 side)
  price: number; // underlying
}

export interface ContractFlow {
  points: ContractPrintPoint[];
  avg: { min: number; price: number }[];
  ratio: { bid: number; mid: number; ask: number }; // shares 0…1 by size
  count: { bid: number; mid: number; ask: number }; // print counts
  priceMin: number;
  priceMax: number;
  volMax: number;
  net: {
    series: NetPremiumPoint[];
    callBought: number;
    callSold: number;
    putBought: number;
    putSold: number;
    netPrem: number;
    ncp: number;
    npp: number;
    uMin: number;
    uMax: number;
    premAbs: number;
    bullishPct: number; // 0…100
  };
}

const SESSION_MIN = 390; // 09:30 → 16:00

/** Format minutes-since-open as an ET clock label. */
export function flowClock(min: number): string {
  const total = 9 * 60 + 30 + min;
  const h = Math.floor(total / 60);
  const m = total % 60;
  const hh = h > 12 ? h - 12 : h;
  return `${hh}:${String(m).padStart(2, '0')}`;
}

export function buildContractFlow(p: ContractRef): ContractFlow {
  const key = `${p.ticker}-${p.strike}${p.right}-${p.expiry}`;

  // ---- contract flow: this contract's intraday prints ----
  const N = 34;
  const askShare = Math.max(0.12, Math.min(0.9, 1 - p.ratioBidPct / 100)); // ask-weighted when bullish
  const points: ContractPrintPoint[] = [];
  let price = Math.max(0.05, p.fill * (1 + hRange(`${key}-p0`, -0.26, -0.04)));
  const drift = (p.fill - price) / (N - 1);
  let priceMin = price;
  let priceMax = price;
  for (let i = 0; i < N; i++) {
    const t = Math.round((i / (N - 1)) * SESSION_MIN);
    price = Math.max(0.05, price + drift + hGauss(`${key}-w${i}`) * p.fill * 0.028);
    if (i === N - 1) price = p.fill;
    priceMin = Math.min(priceMin, price);
    priceMax = Math.max(priceMax, price);
    const r = (hash(`${key}-s${i}`) % 1000) / 1000;
    let side: FlowSide = r < askShare * 0.85 ? 'ASK' : r < askShare * 0.85 + 0.15 ? 'MID' : 'BID';
    let size = Math.round(hRange(`${key}-z${i}`, 1, 55));
    if (hash(`${key}-big${i}`) % 9 === 0) size = Math.round(hRange(`${key}-zb${i}`, 90, 420));
    if (i === N - 1) {
      size = Math.max(size, p.size);
      side = p.side === 'ASK' ? 'ASK' : p.side === 'BID' ? 'BID' : 'MID';
    }
    points.push({ min: t, price, size, side });
  }

  let cumV = 0;
  let cumPV = 0;
  const avg = points.map(pt => {
    cumV += pt.size;
    cumPV += pt.size * pt.price;
    return { min: pt.min, price: cumPV / (cumV || 1) };
  });

  let bid = 0;
  let mid = 0;
  let ask = 0;
  let cbid = 0;
  let cmid = 0;
  let cask = 0;
  for (const pt of points) {
    if (pt.side === 'BID') {
      bid += pt.size;
      cbid++;
    } else if (pt.side === 'MID') {
      mid += pt.size;
      cmid++;
    } else {
      ask += pt.size;
      cask++;
    }
  }
  const tot = bid + mid + ask || 1;
  const volMax = Math.max(...points.map(pt => pt.size), 1);
  const pad = (priceMax - priceMin) * 0.16 || p.fill * 0.1;
  priceMin = Math.max(0, priceMin - pad);
  priceMax = priceMax + pad;

  // ---- net premium: underlying-level cumulative tape ----
  const M = 60;
  const tilt = p.right === 'C' ? (p.side === 'ASK' ? 1 : -0.35) : p.side === 'BID' ? 0.55 : -0.75;
  const series: NetPremiumPoint[] = [];
  let cb = 0;
  let cs = 0;
  let pb = 0;
  let ps = 0;
  let u = p.spot * (1 + hRange(`${key}-u0`, -0.028, 0.006));
  const uDrift = (p.spot - u) / (M - 1);
  let uMin = u;
  let uMax = u;
  for (let i = 0; i < M; i++) {
    const t = Math.round((i / (M - 1)) * SESSION_MIN);
    cb += hRange(`${key}-cb${i}`, 0, 6e6) * (tilt > 0 ? 1.35 : 0.7);
    cs += hRange(`${key}-cs${i}`, 0, 5e6);
    pb += hRange(`${key}-pb${i}`, 0, 4e6) * (tilt < 0 ? 1.35 : 0.7);
    ps += hRange(`${key}-ps${i}`, 0, 4e6);
    u = u + uDrift + hGauss(`${key}-uw${i}`) * p.spot * 0.004;
    if (i === M - 1) u = p.spot;
    uMin = Math.min(uMin, u);
    uMax = Math.max(uMax, u);
    series.push({ min: t, netCall: cb - cs, netPut: -(pb - ps), price: u });
  }
  const netPrem = cb - cs - (pb - ps);
  const premAbs = Math.max(...series.map(n => Math.max(Math.abs(n.netCall), Math.abs(n.netPut))), 1);
  const uPad = (uMax - uMin) * 0.15 || p.spot * 0.01;
  const bullishPct = Math.round(50 + Math.max(-42, Math.min(42, (netPrem / premAbs) * 42)));

  return {
    points,
    avg,
    ratio: { bid: bid / tot, mid: mid / tot, ask: ask / tot },
    count: { bid: cbid, mid: cmid, ask: cask },
    priceMin,
    priceMax,
    volMax,
    net: {
      series,
      callBought: cb,
      callSold: cs,
      putBought: pb,
      putSold: ps,
      netPrem,
      ncp: cb - cs,
      npp: -(pb - ps),
      uMin: uMin - uPad,
      uMax: uMax + uPad,
      premAbs,
      bullishPct,
    },
  };
}
