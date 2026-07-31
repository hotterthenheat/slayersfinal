/*
==================================================
  SLAYER TERMINAL - EXPOSURE PROFILE MODEL (exposure.ts)
  Builds the GEX/DEX/VEX strike matrix, dealer
  positioning map, zones, bias and insight narrative
  from the simulator chain. Placeholder data contract —
  swaps for the real dealer-flow engine later.
==================================================
*/

import { buildLevels, fmtUsd, pinStrike as pinStrikeOf } from './gex';
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

// Farther expiries carry less gamma; ALL is exactly the SUM of the five
// expiry factors, so the aggregate view always equals the sum of its parts.
const EXPIRY_DECAY: Record<ExposureExpiry, number> = {
  '0DTE': 1,
  '1D': 0.52,
  '2D': 0.38,
  '5D': 0.22,
  '7D': 0.16,
  ALL: 1 + 0.52 + 0.38 + 0.22 + 0.16,
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

  // Pin comes from gex.ts rather than a second copy of the same scan. The two
  // copies agreed only by being identical, so either could be edited alone and
  // the panels would drift apart with nothing to catch it.
  const pin = pinStrikeOf(snapshot, half);

  const maxAbs = { gex: 1, dex: 1, vex: 1 };
  const strikes: StrikeExposure[] = window.map((n: StrikeNode) => {
    const jitter = h01(`${ticker}-${n.strike}-${expiry}-exp`);
    const gex = scaleSplit(n.putGex, n.callGex, factor, jitter);
    const dex = scaleSplit(n.putDex, n.callDex, factor, jitter);
    const vex = scaleSplit(n.putVex, n.callVex, factor, jitter); // true $ per 1% vol
    maxAbs.gex = Math.max(maxAbs.gex, Math.abs(gex.put), Math.abs(gex.call), Math.abs(gex.net));
    maxAbs.dex = Math.max(maxAbs.dex, Math.abs(dex.put), Math.abs(dex.call), Math.abs(dex.net));
    maxAbs.vex = Math.max(maxAbs.vex, Math.abs(vex.put), Math.abs(vex.call), Math.abs(vex.net));
    return { strike: n.strike, pin: n.strike === pin, gex, dex, vex };
  });

  // Aggregates over the rendered window. These scale the bars and nothing else:
  // they are an expiry-filtered, windowed view, so they are NOT the same number
  // as the whole-chain net the cockpit prints, and must not be used to decide
  // which way dealers lean.
  const netGex = strikes.reduce((a, s) => a + s.gex.net, 0);
  const netDex = strikes.reduce((a, s) => a + s.dex.net, 0);
  const netVex = strikes.reduce((a, s) => a + s.vex.net, 0);

  // Levels come from gex.ts. This function used to derive walls and the flip
  // from its own rescaled, jittered, expiry-decayed copy of the chain, which is
  // why the landing page printed FLIP 501.50 in the levels rail and FLIP 500.50
  // in the positioning map roughly five hundred pixels below it — same screen,
  // same instrument, two answers. A level is a property of the book, not of how
  // many strikes a panel happens to be drawing, so there is one derivation now.
  const shared = buildLevels(snapshot);
  const { callWall, putWall, flip } = shared;
  const levels: ExposureLevels = { spot, callWall, putWall, pin, flip, king: shared.king };

  // The bias reads the whole chain, on the same basis as the cockpit. Deciding
  // it from the windowed sum above had the two panels disagreeing on the SIGN
  // for two of sixteen tickers, so one screen said dealers amplify while the
  // other said they absorb.
  const chainNetGex = chain.reduce((a, n) => a + n.netGex, 0);

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

  // Dealer bias from net gamma positioning, measured against the chain's own
  // scale so the threshold means the same thing on SPY as on a $40 name.
  const chainScale = chain.reduce((a, n) => Math.max(a, Math.abs(n.netGex)), 1);
  const biasThreshold = chainScale * 0.6;
  let bias: DealerBias = 'NEUTRAL';
  let biasNote = 'Balanced positioning';
  if (chainNetGex < -biasThreshold) {
    bias = 'BEARISH';
    biasNote = 'Net negative gamma, moves amplified';
  } else if (chainNetGex > biasThreshold) {
    bias = 'BULLISH';
    biasNote = 'Net supportive gamma, dips absorbed';
  }

  // Insight narrative — levels translated to English
  const fmtK = (v: number) => (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));
  const inFriction = spot > putWall && spot < callWall;
  const insights = [
    // The sides are a property of the FLIP (short gamma below, long above),
    // not of the aggregate sign — the sentence anchors on where spot sits.
    `Net GEX is ${chainNetGex < 0 ? 'negative' : 'positive'} (${fmtUsd(chainNetGex)}). Dealers amplify moves below ${fmtK(flip)} and dampen them above it, and spot is ${spot >= flip ? 'above' : 'below'} the flip.`,
    inFriction
      ? `Price sits between key levels (${fmtK(putWall)} to ${fmtK(callWall)}) inside the friction zone.`
      : `Price is ${spot >= callWall ? 'above the call wall' : 'below the put wall'}, outside the friction zone.`,
    `Heaviest OI magnet sits at ${fmtK(pin)} (pin level), so price gravitates there into expiry.`,
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
