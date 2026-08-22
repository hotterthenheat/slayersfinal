/*
==================================================
  SLAYER TERMINAL - COMMAND COCKPIT MODEL (command.ts)
  Dealer pressure matrix, key-levels rail, order-flow
  delta and auto market notes, derived from the
  simulator. Placeholder data contract — swaps for the
  real feed later.
==================================================
*/

import Simulator from '../core/simulator';
import { buildLevels, pinStrike } from './gex';
import type { MarketSnapshot } from '../types/market';
import type {
  CommandView,
  DealerBias,
  DeltaByPrice,
  DeltaEquivFlow,
  DeltaPoint,
  KeyLevelRow,
  KeyLevels,
  OrderFlowData,
  PressureRow,
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

// ---- dealer pressure matrix -------------------------------------------------
function buildPressure(
  snapshot: MarketSnapshot,
  levels: KeyLevels,
  half: number,
  pin: number
): { rows: PressureRow[]; maxAbs: number } {
  const { ticker, spot, chain } = snapshot;
  const desc = [...chain].sort((a, b) => b.strike - a.strike);
  const spotIdx = Math.max(0, desc.findIndex(n => n.strike <= spot));
  const start = Math.max(0, spotIdx - half);
  const window = desc.slice(start, start + half * 2 + 1);

  // Flip row = strike nearest the flip level
  let flipStrike = window[0]?.strike ?? spot;
  let flipDist = Infinity;
  for (const n of window) {
    const d = Math.abs(n.strike - levels.flip);
    if (d < flipDist) {
      flipDist = d;
      flipStrike = n.strike;
    }
  }

  let maxAbs = 1;
  const rows: PressureRow[] = window.map(n => {
    const jc = h01(`${ticker}-${n.strike}-cp`);
    const jp = h01(`${ticker}-${n.strike}-pp`);
    const call = {
      pressure: n.callGex * (0.7 + jc * 0.6),
      deltaOI: Math.round((jc - 0.45) * n.callOI.value * 0.3),
      volume: Math.round(n.callOI.value * (0.25 + jc * 0.55)),
    };
    const put = {
      pressure: n.putGex * (0.7 + jp * 0.6),
      deltaOI: Math.round((jp - 0.45) * n.putOI.value * 0.3),
      volume: Math.round(n.putOI.value * (0.25 + jp * 0.55)),
    };
    const net = call.pressure + put.pressure;
    maxAbs = Math.max(maxAbs, Math.abs(call.pressure), Math.abs(put.pressure), Math.abs(net));
    return { strike: n.strike, pin: n.strike === pin, flip: n.strike === flipStrike, call, put, net };
  });

  return { rows, maxAbs };
}

// ---- key-levels rail ----------------------------------------------------------
function pressureAt(snapshot: MarketSnapshot, price: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (const n of snapshot.chain) {
    const d = Math.abs(n.strike - price);
    if (d < bestDist) {
      bestDist = d;
      best = Math.abs(n.netGex);
    }
  }
  return best;
}

function buildKeyLevels(snapshot: MarketSnapshot, levels: KeyLevels, pin: number): KeyLevelRow[] {
  const { spot } = snapshot;
  const dist = (price: number) => ((price - spot) / spot) * 100;
  const rows: KeyLevelRow[] = [
    { kind: 'call-wall', label: 'Call Wall', price: levels.callWall, distPct: dist(levels.callWall), pressure: pressureAt(snapshot, levels.callWall) },
    { kind: 'spot', label: 'Spot', price: spot, distPct: 0, pressure: 0 },
    { kind: 'put-wall', label: 'Put Wall', price: levels.putWall, distPct: dist(levels.putWall), pressure: pressureAt(snapshot, levels.putWall) },
    { kind: 'pin', label: 'Pin Level', price: pin, distPct: dist(pin), pressure: pressureAt(snapshot, pin) },
    { kind: 'flip', label: 'Flip Level', price: levels.flip, distPct: dist(levels.flip), pressure: pressureAt(snapshot, levels.flip) },
    { kind: 'king', label: 'King Strike', price: levels.king, distPct: dist(levels.king), pressure: pressureAt(snapshot, levels.king) },
  ];
  // Price-descending like a ladder, spot embedded naturally
  return rows.sort((a, b) => b.price - a.price);
}

// ---- order flow ---------------------------------------------------------------
const SESSION_BARS = 390; // one cash session of 1m bars (mirrors the simulator)

/**
 * Session order flow built from the current session's 1m candles, so every stat
 * is genuinely session-scoped and internally consistent:
 * - ONE per-bar signed delta feeds BOTH the cumulative line and the by-price
 *   histogram, so the histogram sums to the net delta by construction.
 * - VWAP is truly volume-weighted (Σ typical·vol / Σ vol) and POC is the
 *   max-VOLUME price bucket, not the most-visited one.
 * - Buy/sell $ volume derive from the session's actual traded notional.
 */
/**
 * Delta-equivalent flow for a cash index (P4.4). Share volume is undefined, but
 * the options book is not: callDex/putDex are its $ delta exposure per strike
 * (callDex = callOI·100·Δcall·spot, so a call is long delta and a put short).
 * Summing them expresses the whole book as one underlying-equivalent delta, and
 * dividing by spot restates the net in share-equivalents — the honest index
 * stand-in for the missing share flow.
 */
function buildDeltaEquiv(snapshot: MarketSnapshot): DeltaEquivFlow {
  const { spot, chain } = snapshot;
  let callDollars = 0;
  let putDollars = 0;
  const byStrike = [...chain]
    .sort((a, b) => b.strike - a.strike)
    .map(n => {
      callDollars += n.callDex;
      putDollars += n.putDex;
      return { strike: n.strike, value: Math.round(n.netDex) };
    });
  const netDollars = callDollars + putDollars;
  return {
    callDollars: Math.round(callDollars),
    putDollars: Math.round(putDollars),
    netDollars: Math.round(netDollars),
    netShares: Math.round(netDollars / spot),
    byStrike,
  };
}

function buildOrderFlow(snapshot: MarketSnapshot): OrderFlowData {
  const { ticker, spot } = snapshot;
  if (Simulator.isIndex(ticker)) {
    // A cash index has no share volume, so cumulative delta, delta-by-price,
    // VWAP and POC cannot exist. Share flow stays unavailable, but the options
    // book does exist — deltaEquiv carries its delta-equivalent flow (P4.4), and
    // the panel renders that instead of a bare unavailable state.
    return {
      available: false,
      cumulativeDelta: [],
      deltaByPrice: [],
      buyVolume: 0,
      sellVolume: 0,
      netDelta: 0,
      vwap: spot,
      poc: spot,
      deltaEquiv: buildDeltaEquiv(snapshot),
    };
  }
  const all = Simulator.getCandles(ticker) ?? [];
  // Trailing session-sized window. NOT length % SESSION_BARS — bars roll in one
  // at a time, and a modulo window would collapse the "session" stats to a
  // couple of bars the minute after load.
  const bars = all.slice(-SESSION_BARS);

  if (!bars.length) {
    return { available: true, cumulativeDelta: [], deltaByPrice: [], buyVolume: 0, sellVolume: 0, netDelta: 0, vwap: spot, poc: spot, deltaEquiv: null };
  }

  // One signed dollar-delta per bar — bar body × traded shares (× a flow
  // multiplier standing in for the unobserved aggressor split), plus
  // deterministic microstructure noise on the body.
  const totalVol = bars.reduce((a, b) => a + b.volume, 0) || 1;
  const notional = totalVol * spot; // session $ traded
  const barDelta = bars.map((b, i) => {
    const noise = (h01(`${ticker}-cd-${i}`) - 0.5) * 0.0004 * spot;
    return (b.close - b.open + noise) * b.volume * 1000;
  });

  const cumulativeDelta: DeltaPoint[] = [];
  let cum = 0;
  for (let i = 0; i < bars.length; i++) {
    cum += barDelta[i];
    cumulativeDelta.push({ minute: i, value: cum });
  }
  const netDelta = cum;

  // Volume-at-price + delta-by-price over the same bars and buckets
  let lo = Infinity;
  let hi = -Infinity;
  for (const b of bars) {
    if (b.low < lo) lo = b.low;
    if (b.high > hi) hi = b.high;
  }
  const BUCKETS = 12;
  const width = (hi - lo) / BUCKETS || 1;
  const bucketDelta = new Array<number>(BUCKETS).fill(0);
  const bucketVol = new Array<number>(BUCKETS).fill(0);
  for (let i = 0; i < bars.length; i++) {
    const b = Math.min(BUCKETS - 1, Math.max(0, Math.floor((bars[i].close - lo) / width)));
    bucketDelta[b] += barDelta[i];
    bucketVol[b] += bars[i].volume;
  }
  const deltaByPrice: DeltaByPrice[] = [];
  let poc = spot;
  let pocVol = -1;
  for (let b = 0; b < BUCKETS; b++) {
    const price = lo + width * (b + 0.5);
    if (bucketVol[b] > pocVol) {
      pocVol = bucketVol[b];
      poc = price;
    }
    deltaByPrice.push({ price: Number(price.toFixed(2)), value: bucketDelta[b] });
  }

  // True session VWAP: typical price weighted by bar volume
  let pv = 0;
  for (const b of bars) pv += ((b.high + b.low + b.close) / 3) * b.volume;
  const vwap = pv / totalVol;

  const buyVolume = (notional + netDelta) / 2;
  const sellVolume = (notional - netDelta) / 2;

  return {
    available: true,
    cumulativeDelta,
    deltaByPrice,
    buyVolume,
    sellVolume,
    netDelta,
    vwap: Number(vwap.toFixed(2)),
    poc: Number(poc.toFixed(2)),
    deltaEquiv: null,
  };
}

// ---- auto market notes ----------------------------------------------------------
/** One generated observation per scan, or null when nothing is notable. */
export function makeAutoNote(snapshot: MarketSnapshot, levels: KeyLevels, bias: DealerBias): string | null {
  const { spot } = snapshot;
  const pct = (a: number, b: number) => Math.abs((a - b) / b) * 100;
  const fmt = (v: number) => (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));

  if (pct(spot, levels.callWall) < 0.15)
    return `Spot testing ${fmt(levels.callWall)} call wall; dealer supply concentrated overhead.`;
  if (pct(spot, levels.putWall) < 0.15)
    return `Spot pressing ${fmt(levels.putWall)} put wall; dealer support being tested.`;
  if (pct(spot, levels.flip) < 0.12)
    return `Price is at the ${fmt(levels.flip)} gamma flip; dealer hedging switches direction here.`;
  // Regime notes defer to the book-derived bias (the badge next to this note),
  // so the note can never claim short gamma while the badge reads supportive.
  if (spot < levels.flip && bias !== 'LONG_GAMMA')
    return `Trading below the ${fmt(levels.flip)} flip; dealers short gamma, so expect amplified moves.`;
  if (spot > levels.flip && bias === 'LONG_GAMMA')
    return `Supportive positioning above ${fmt(levels.flip)}; dips into ${fmt(levels.putWall)} likely absorbed.`;
  return null;
}

// ---- top-level assembly ----------------------------------------------------------
/** Strikes each side of spot in the pressure window; matches the exposure map's default. */
const PRESSURE_HALF = 10;

export function buildCommandView(snapshot: MarketSnapshot): CommandView {
  const { chain } = snapshot;

  // gex.ts owns the level derivation. The cockpit reads it rather than keeping a
  // second opinion: the rail and the positioning map share a screen, so a
  // re-derived flip or king shows up as one panel contradicting the other.
  const levels = buildLevels(snapshot);
  const pin = pinStrike(snapshot, PRESSURE_HALF);
  const { rows, maxAbs } = buildPressure(snapshot, levels, PRESSURE_HALF, pin);

  const netGex = chain.reduce((a, n) => a + n.netGex, 0);
  const kingAbs = Math.abs(chain.find(n => n.strike === levels.king)?.netGex ?? 0);
  const threshold = kingAbs * 0.8;
  let bias: DealerBias = 'BALANCED';
  let biasNote = 'Balanced positioning';
  if (netGex < -threshold) {
    bias = 'SHORT_GAMMA';
    biasNote = 'Net negative gamma';
  } else if (netGex > threshold) {
    bias = 'LONG_GAMMA';
    biasNote = 'Net supportive gamma';
  }

  return {
    pressure: rows,
    pressureMaxAbs: maxAbs,
    keyLevels: buildKeyLevels(snapshot, levels, pin),
    orderFlow: buildOrderFlow(snapshot),
    bias,
    biasNote,
  };
}
