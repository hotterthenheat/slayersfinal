/*
==================================================
  SLAYER TERMINAL - VANNA & CHARM MODEL (vannacharm.ts)
  Projects how dealer exposure migrates: CHARM decays
  it into the close, VANNA shifts it under an IV move.
  Derived from the simulator chain + its per-strike
  vanna/charm greeks. Placeholder — real engine later.
==================================================
*/

import Simulator from '../core/simulator';
import type { MarketSnapshot, StrikeNode } from '../types/market';
import type {
  IvShift,
  LevelShift,
  ShiftBarRow,
  ShiftMode,
  VannaCharmView,
  WallDriftPoint,
} from '../types/gex';

const HOURS_TO_CLOSE = 3; // fixed session posture for the sim

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

interface LevelSet {
  callWall: number;
  putWall: number;
  flip: number;
  king: number;
}

/** Walls / flip / king from a set of (strike, value) pairs, descending input. */
function levelsFrom(rows: { strike: number; value: number }[], spot: number): LevelSet {
  let callWall = spot;
  let putWall = spot;
  let king = spot;
  let maxAbove = 0;
  let maxBelow = 0;
  let maxAll = 0;
  for (const r of rows) {
    const mag = Math.abs(r.value);
    if (r.strike > spot && mag > maxAbove) {
      maxAbove = mag;
      callWall = r.strike;
    }
    if (r.strike < spot && mag > maxBelow) {
      maxBelow = mag;
      putWall = r.strike;
    }
    if (mag > maxAll) {
      maxAll = mag;
      king = r.strike;
    }
  }
  const asc = [...rows].sort((a, b) => a.strike - b.strike);
  let flip = spot;
  for (let i = 1; i < asc.length; i++) {
    if (Math.sign(asc[i - 1].value) !== Math.sign(asc[i].value)) {
      flip = (asc[i - 1].strike + asc[i].strike) / 2;
      break;
    }
  }
  return { callWall, putWall, flip, king };
}

// ---- scenario projection -------------------------------------------------------
function projectStrike(n: StrikeNode, mode: ShiftMode, ivShift: IvShift, maxCharm: number, spot: number, ticker: string): number {
  if (mode === 'CHARM') {
    // Delta decay bleeds gamma hardest at the money, and the CALL and PUT legs
    // bleed at different per-strike rates — that differential is what lets the
    // NET flip sign near zero (flip migrates) and lets neighboring strikes
    // overtake a wall (walls migrate). Pure uniform scaling can do neither.
    const norm = Math.abs(n.charm) / (maxCharm || 1);
    const t = HOURS_TO_CLOSE / 6.5;
    const jc = h01(`${ticker}-${n.strike}-charm-c`);
    const jp = h01(`${ticker}-${n.strike}-charm-p`);
    const callDecay = 1 - (0.42 + 0.4 * jc) * norm * t;
    const putDecay = 1 - (0.42 + 0.4 * jp) * norm * t;
    return n.callGex * callDecay + n.putGex * putDecay;
  }
  // VANNA: an IV move re-prices dealer deltas; vanna is signed per strike so
  // the profile tilts rather than scales — jitter keeps the tilt uneven enough
  // to re-rank walls under a real vol shock.
  const oiNotional = (n.callOI + n.putOI) * spot;
  const j = 0.6 + h01(`${ticker}-${n.strike}-vanna`) * 0.7;
  return n.netGex + n.vanna * oiNotional * 0.8 * j * ivShift;
}

// ---- wall drift timeline ---------------------------------------------------------
const DRIFT_BARS = 390; // one session of 1-min bars
const DRIFT_STEP = 3; // sample every 3rd bar

function buildDrift(ticker: string): WallDriftPoint[] {
  const candles = Simulator.getCandles(ticker);
  const snaps = Simulator.getGexHistory(ticker);
  if (!candles?.length || !snaps?.length) return [];

  const n = Math.min(DRIFT_BARS, snaps.length, candles.length);
  const candleTail = candles.slice(candles.length - n);
  const snapTail = snaps.slice(snaps.length - n);

  const out: WallDriftPoint[] = [];
  for (let i = 0; i < n; i += DRIFT_STEP) {
    const spot = candleTail[i].close;
    const { callWall, putWall, flip } = levelsFrom(snapTail[i].levels, spot);
    out.push({ time: snapTail[i].time, spot, callWall, putWall, flip });
  }
  return out;
}

// ---- top-level assembly -----------------------------------------------------------
export function buildVannaCharm(
  snapshot: MarketSnapshot,
  mode: ShiftMode,
  ivShift: IvShift,
  half: 10 | 15 = 10
): VannaCharmView {
  const { ticker, spot, chain } = snapshot;

  const desc = [...chain].sort((a, b) => b.strike - a.strike);
  const spotIdx = Math.max(0, desc.findIndex(n => n.strike <= spot));
  const start = Math.max(0, spotIdx - half);
  const window = desc.slice(start, start + half * 2 + 1);

  const maxCharm = window.reduce((a, n) => Math.max(a, Math.abs(n.charm)), 0);

  // Pin (max total OI) for the rail
  let pinStrike = window[0]?.strike ?? spot;
  let pinOI = 0;
  for (const n of window) {
    if (n.callOI + n.putOI > pinOI) {
      pinOI = n.callOI + n.putOI;
      pinStrike = n.strike;
    }
  }

  let maxAbs = 1;
  const rows: ShiftBarRow[] = window.map(n => {
    const projected = projectStrike(n, mode, ivShift, maxCharm, spot, ticker);
    maxAbs = Math.max(maxAbs, Math.abs(n.netGex), Math.abs(projected));
    return { strike: n.strike, pin: n.strike === pinStrike, current: n.netGex, projected };
  });

  const base = levelsFrom(rows.map(r => ({ strike: r.strike, value: r.current })), spot);
  const proj = levelsFrom(rows.map(r => ({ strike: r.strike, value: r.projected })), spot);

  const shifts: LevelShift[] = [
    { label: 'Call Wall', kind: 'call-wall', current: base.callWall, projected: proj.callWall },
    { label: 'Gamma Flip', kind: 'flip', current: base.flip, projected: proj.flip },
    { label: 'Put Wall', kind: 'put-wall', current: base.putWall, projected: proj.putWall },
    { label: 'King Node', kind: 'king', current: base.king, projected: proj.king },
  ];

  // Narrative — the terminal explains the dominant flow
  const fmt = (v: number) => (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));
  const atmBleed = Math.round(0.62 * (HOURS_TO_CLOSE / 6.5) * 100);
  const flipMove = proj.flip - base.flip;
  const insights =
    mode === 'CHARM'
      ? [
          `Charm bleed drains ~${atmBleed}% of at-the-money gamma over the final ${HOURS_TO_CLOSE}h — wings hold their weight.`,
          flipMove !== 0
            ? `The flip drifts ${fmt(base.flip)} → ${fmt(proj.flip)} into the close; the sticky/slippery border is moving ${flipMove > 0 ? 'up' : 'down'}.`
            : `The flip holds at ${fmt(base.flip)} into the close.`,
          proj.callWall !== base.callWall || proj.putWall !== base.putWall
            ? `Walls migrate: call ${fmt(base.callWall)} → ${fmt(proj.callWall)}, put ${fmt(base.putWall)} → ${fmt(proj.putWall)}. Late-day levels ≠ morning levels.`
            : `Walls hold — expect the morning structure to govern the close.`,
        ]
      : [
          `An IV ${ivShift > 0 ? `expansion (+${ivShift})` : `crush (${ivShift})`} re-prices dealer deltas via vanna — the profile tilts, it doesn't just scale.`,
          flipMove !== 0
            ? `Flip re-prices ${fmt(base.flip)} → ${fmt(proj.flip)} under this vol scenario.`
            : `Flip is vol-stable at ${fmt(base.flip)} under this scenario.`,
          ivShift < 0
            ? `Vol crush forces mechanical dealer buying — supportive even with spot unchanged.`
            : `Vol expansion forces mechanical dealer selling — a headwind even with spot unchanged.`,
        ];

  return {
    ticker,
    spot,
    mode,
    ivShift,
    rows,
    maxAbs,
    flipCurrent: base.flip,
    flipProjected: proj.flip,
    shifts,
    drift: buildDrift(ticker),
    insights,
  };
}
