/*
==================================================
  SLAYER TERMINAL - EXPOSURE PROFILE MODEL (exposure.ts)
  Builds the GEX/DEX/VEX strike matrix, dealer
  positioning map, zones, bias and insight narrative
  from the simulator chain. Placeholder data contract —
  swaps for the real dealer-flow engine later.
==================================================
*/

import { fmtUsd } from './gex';
import type { MarketSnapshot, StrikeNode } from '../types/market';
import type {
  DealerBias,
  ExposureExpiry,
  ExposureLevels,
  ExposureProfileData,
  GreekSplit,
  StrikeExposure,
  ZoneBand,
} from '../types/gex';

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

// Farther expiries carry less gamma; ALL aggregates the pipeline.
const EXPIRY_DECAY: Record<ExposureExpiry, number> = {
  '0DTE': 1,
  '1D': 0.52,
  '2D': 0.38,
  '5D': 0.22,
  '7D': 0.16,
  // Monthly expiration carries the heavy structural weight (institutional books)
  OPEX: 0.85,
  ALL: 3.13,
};

function scaleSplit(put: number, call: number, factor: number, jitter: number): GreekSplit {
  const p = put * factor * (0.82 + jitter * 0.36);
  const c = call * factor * (0.82 + (1 - jitter) * 0.36);
  return { put: p, call: c, net: p + c };
}

// ---- top-level build ----------------------------------------------------------
export function buildExposureProfile(
  snapshot: MarketSnapshot,
  expiry: ExposureExpiry,
  half: 10 | 15
): ExposureProfileData {
  const { ticker, spot, chain } = snapshot;
  const factor = EXPIRY_DECAY[expiry];

  // Window around spot, descending strikes (highest first)
  const desc = [...chain].sort((a, b) => b.strike - a.strike);
  const spotIdx = Math.max(0, desc.findIndex(n => n.strike <= spot));
  const start = Math.max(0, spotIdx - half);
  const window = desc.slice(start, start + half * 2 + 1);

  // Pin = max total OI strike inside the window (round-number magnets win)
  let pinStrike = window[0]?.strike ?? spot;
  let pinOI = 0;
  for (const n of window) {
    if (n.callOI + n.putOI > pinOI) {
      pinOI = n.callOI + n.putOI;
      pinStrike = n.strike;
    }
  }

  const maxAbs = { gex: 1, dex: 1, vex: 1 };
  const strikes: StrikeExposure[] = window.map((n: StrikeNode) => {
    const jitter = h01(`${ticker}-${n.strike}-${expiry}-exp`);
    const gex = scaleSplit(n.putGex, n.callGex, factor, jitter);
    const dex = scaleSplit(n.putDex, n.callDex, factor, jitter);
    const vex = scaleSplit(n.putVex * 40, n.callVex * 40, factor, jitter); // dollar-comparable
    maxAbs.gex = Math.max(maxAbs.gex, Math.abs(gex.put), Math.abs(gex.call), Math.abs(gex.net));
    maxAbs.dex = Math.max(maxAbs.dex, Math.abs(dex.put), Math.abs(dex.call), Math.abs(dex.net));
    maxAbs.vex = Math.max(maxAbs.vex, Math.abs(vex.put), Math.abs(vex.call), Math.abs(vex.net));
    return { strike: n.strike, pin: n.strike === pinStrike, gex, dex, vex };
  });

  // Aggregates
  const netGex = strikes.reduce((a, s) => a + s.gex.net, 0);
  const netDex = strikes.reduce((a, s) => a + s.dex.net, 0);
  const netVex = strikes.reduce((a, s) => a + s.vex.net, 0);

  // Walls = strongest |net GEX| above / below spot; flip = first sign change
  let callWall = spot;
  let putWall = spot;
  let maxAbove = 0;
  let maxBelow = 0;
  for (const s of strikes) {
    const mag = Math.abs(s.gex.net);
    if (s.strike > spot && mag > maxAbove) {
      maxAbove = mag;
      callWall = s.strike;
    }
    if (s.strike < spot && mag > maxBelow) {
      maxBelow = mag;
      putWall = s.strike;
    }
  }
  const asc = [...strikes].sort((a, b) => a.strike - b.strike);
  let flip = spot;
  for (let i = 1; i < asc.length; i++) {
    if (Math.sign(asc[i - 1].gex.net) !== Math.sign(asc[i].gex.net)) {
      flip = (asc[i - 1].strike + asc[i].strike) / 2;
      break;
    }
  }

  const levels: ExposureLevels = { spot, callWall, putWall, pin: pinStrike, flip };

  // Zone bands (strikes descending: from ≥ to). One row of breathing room per wall.
  const strikeList = strikes.map(s => s.strike);
  const step = strikeList.length > 1 ? Math.abs(strikeList[0] - strikeList[1]) : 1;
  const zones: ZoneBand[] = [
    { from: callWall + step, to: callWall - step, kind: 'call-wall', label: 'CALL WALL' },
    { from: putWall + step, to: putWall - step, kind: 'put-wall', label: 'PUT WALL' },
  ];
  if (callWall - putWall > 3 * step) {
    zones.push({ from: callWall - step * 2, to: putWall + step * 2, kind: 'friction', label: 'FRICTION' });
  }

  // Dealer bias from net gamma positioning
  const biasThreshold = maxAbs.gex * 0.6;
  let bias: DealerBias = 'NEUTRAL';
  let biasNote = 'Balanced positioning';
  if (netGex < -biasThreshold) {
    bias = 'BEARISH';
    biasNote = 'Net negative gamma — moves amplified';
  } else if (netGex > biasThreshold) {
    bias = 'BULLISH';
    biasNote = 'Net supportive gamma — dips absorbed';
  }

  // Insight narrative — levels translated to English
  const fmtK = (v: number) => (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));
  const inFriction = spot > putWall && spot < callWall;
  const insights = [
    `Net GEX is ${netGex < 0 ? 'negative' : 'positive'} (${fmtUsd(netGex)}). Dealers ${
      netGex < 0 ? 'amplify moves' : 'dampen moves'
    } ${netGex < 0 ? 'below' : 'above'} ${fmtK(flip)}, ${netGex < 0 ? 'stabilize' : 'accelerate'} beyond it.`,
    inFriction
      ? `Price sits between key levels (${fmtK(putWall)} – ${fmtK(callWall)}) inside the friction zone.`
      : `Price is ${spot >= callWall ? 'above the call wall' : 'below the put wall'} — outside the friction zone.`,
    `Strongest dealer support sits at ${fmtK(pinStrike)} (pin level).`,
    `A break below ${fmtK(putWall)} shifts pressure toward ${fmtK(putWall - step * 2)}.`,
    `A break above ${fmtK(callWall)} opens quick supply up to ${fmtK(callWall + step * 2)}.`,
  ];

  // Spot marker slot (strikes descending)
  let spotAfterIndex = strikes.findIndex(
    (row, i) => row.strike >= spot && (strikes[i + 1]?.strike ?? -Infinity) < spot
  );
  if (spotAfterIndex === -1) spotAfterIndex = spot > (strikes[0]?.strike ?? 0) ? -0.5 : strikes.length - 1;

  return {
    ticker,
    expiry,
    strikes,
    maxAbs,
    netGex,
    netDex,
    netVex,
    levels,
    zones,
    bias,
    biasNote,
    insights,
    spotAfterIndex,
  };
}
