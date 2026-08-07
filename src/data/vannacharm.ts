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
import { buildLevels, pinStrike } from './gex';
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

// Per-leg charm decay coefficient, jittered per strike: floor + span × jitter,
// scaled by the strike's own |charm| and by the fraction of the session left.
// The migration narrative quotes the mean of this span rather than restating a
// third number, so the sentence cannot drift away from the arithmetic above it.
const CHARM_DECAY_FLOOR = 0.42;
const CHARM_DECAY_SPAN = 0.4;

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

export interface GexProfilePoint {
  strike: number;
  /** Net GEX at that strike, signed dollars */
  value: number;
}

export interface LevelSet {
  callWall: number;
  putWall: number;
  flip: number;
  king: number;
}

/**
 * Walls / flip / king read off an arbitrary net-GEX-per-strike profile, by the
 * same rules the book's own levels use (simulator.ts `generateTradePlan`,
 * surfaced by gex.ts `buildLevels`): the heaviest |net GEX| strike each side of
 * spot for the walls, the first UPWARD zero crossing of the 3-strike-smoothed
 * profile for the flip, the heaviest strike anywhere for the king.
 *
 * It exists for the two profiles no engine can be asked for — a HYPOTHETICAL
 * book (the charm / vanna scenario) and a PAST one (a recorded bar's snapshot).
 * The current book is never routed through here; that comes from `buildLevels`,
 * and levels.test.ts asserts this function reproduces `buildLevels` exactly when
 * fed today's chain. So the two rules cannot drift apart silently, and the arrow
 * this panel draws from now to the scenario measures the scenario rather than
 * the difference between two ways of finding a wall.
 *
 * The version this replaced scanned a windowed, rescaled copy and took the first
 * sign change in EITHER direction as the flip: it disagreed with the rail on the
 * flip for 5 of 16 names, on one screen, with the rail sitting above it.
 */
export function levelsOfProfile(profile: GexProfilePoint[], spot: number): LevelSet {
  const asc = [...profile].sort((a, b) => a.strike - b.strike);
  const step = asc.length > 1 ? Math.abs(asc[1].strike - asc[0].strike) || 1 : 1;

  // Same fallbacks as the plan: a side with no strike on it brackets spot rather
  // than collapsing the wall onto it and printing a zero-wide defended range.
  let callWall = spot + step * 4;
  let putWall = spot - step * 4;
  let king = spot;
  let maxAbove = 0;
  let maxBelow = 0;
  let maxAll = 0;
  for (const r of asc) {
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

  // Smoothed so one noisy strike cannot fake a crossover, and UPWARD because
  // short-gamma-below / long-gamma-above is what a desk means by the flip.
  const smoothed = (i: number) =>
    (asc[Math.max(0, i - 1)].value + asc[i].value + asc[Math.min(asc.length - 1, i + 1)].value) / 3;
  let flip = spot;
  for (let i = 1; i < asc.length; i++) {
    if (smoothed(i - 1) < 0 && smoothed(i) >= 0) {
      flip = (asc[i - 1].strike + asc[i].strike) / 2;
      break;
    }
  }

  return { callWall, putWall, flip, king };
}

// ---- scenario projection -------------------------------------------------------
function projectStrike(n: StrikeNode, mode: ShiftMode, ivShift: IvShift, maxCharm: number, spot: number, ticker: string): number {
  if (mode === 'CHARM') {
    // Decay is scaled by the strike's OWN charm against the book's heaviest, so
    // it bleeds hardest wherever the greeks engine actually puts charm — not at
    // a strike assumed in advance. The CALL and PUT legs then bleed at different
    // per-strike rates, and that differential is what lets the NET flip sign near
    // zero (flip migrates) and lets a neighbour overtake a wall (walls migrate).
    // Pure uniform scaling can do neither.
    const norm = Math.abs(n.charm) / (maxCharm || 1);
    const t = HOURS_TO_CLOSE / 6.5;
    const jc = h01(`${ticker}-${n.strike}-charm-c`);
    const jp = h01(`${ticker}-${n.strike}-charm-p`);
    const callDecay = 1 - (CHARM_DECAY_FLOOR + CHARM_DECAY_SPAN * jc) * norm * t;
    const putDecay = 1 - (CHARM_DECAY_FLOOR + CHARM_DECAY_SPAN * jp) * norm * t;
    return n.callGex * callDecay + n.putGex * putDecay;
  }
  // VANNA: an IV move re-prices dealer deltas; vanna is signed per strike so
  // the profile tilts rather than scales — jitter keeps the tilt uneven enough
  // to re-rank walls under a real vol shock.
  const oiNotional = (n.callOI.value + n.putOI.value) * spot;
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

  // Each recorded snapshot is the whole chain as it stood at that bar's close,
  // so the walls read off it are the book's walls at that moment — the same
  // question the rail answers about now, asked of a bar that has already gone.
  const out: WallDriftPoint[] = [];
  const sample = (i: number) => {
    const spot = candleTail[i].close;
    const { callWall, putWall, flip } = levelsOfProfile(snapTail[i].levels, spot);
    out.push({ time: snapTail[i].time, spot, callWall, putWall, flip });
  };
  for (let i = 0; i < n; i += DRIFT_STEP) sample(i);
  // The stride can stop short of the final bar. It must not: the right edge of
  // this series is "now", and WallDrift anchors the scenario column's own "now"
  // dot beside it on one shared price axis — a right edge two bars stale puts
  // two prices on that axis for a single moment.
  if ((n - 1) % DRIFT_STEP !== 0) sample(n - 1);
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

  // ONE projection, of the whole book. The rows below are a window onto it, not
  // a second projection of their own: charm's per-strike normalizer used to be
  // the window's own heaviest charm, so the same strike projected to a different
  // dollar figure on a 10-strike panel than on a 15-strike one, and the levels
  // read off it could only be compared with the book-wide current levels by
  // luck. A projection is a property of the book, like the levels it moves.
  let maxCharm = 0;
  let charmPeak = spot; // the strike carrying it — the charm narrative's anchor
  for (const n of chain) {
    const c = Math.abs(n.charm);
    if (c > maxCharm) {
      maxCharm = c;
      charmPeak = n.strike;
    }
  }
  const projectedProfile: GexProfilePoint[] = chain.map(n => ({
    strike: n.strike,
    value: projectStrike(n, mode, ivShift, maxCharm, spot, ticker),
  }));
  const projectedAt = new Map(projectedProfile.map(p => [p.strike, p.value]));

  const desc = [...chain].sort((a, b) => b.strike - a.strike);
  const spotIdx = Math.max(0, desc.findIndex(n => n.strike <= spot));
  const start = Math.max(0, spotIdx - half);
  const window = desc.slice(start, start + half * 2 + 1);

  // Pin is the one structural level that legitimately depends on the window, so
  // it takes this panel's window as an argument instead of re-scanning for it.
  const pin = pinStrike(snapshot, half);

  let maxAbs = 1;
  const rows: ShiftBarRow[] = window.map(n => {
    const projected = projectedAt.get(n.strike) ?? n.netGex;
    maxAbs = Math.max(maxAbs, Math.abs(n.netGex), Math.abs(projected));
    return { strike: n.strike, pin: n.strike === pin, current: n.netGex, projected };
  });

  // "Now" is the book's own answer, from the single derivation every other panel
  // reads. "Scenario" is the same rules asked of the projected book. Both sides
  // of every arrow below therefore move only because the scenario moved them.
  const base = buildLevels(snapshot);
  const proj = levelsOfProfile(projectedProfile, spot);

  const shifts: LevelShift[] = [
    { label: 'Call Wall', kind: 'call-wall', current: base.callWall, projected: proj.callWall },
    { label: 'Gamma Flip', kind: 'flip', current: base.flip, projected: proj.flip },
    { label: 'Put Wall', kind: 'put-wall', current: base.putWall, projected: proj.putWall },
    { label: 'King Strike', kind: 'king', current: base.king, projected: proj.king },
  ];

  // Narrative — the terminal explains the dominant flow
  const fmt = (v: number) => (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));
  // The quoted bleed is the mean decay coefficient at norm = 1, which lands on
  // the heaviest-charm strike — and the greeks put that a few percent OUT of the
  // money on every name in the watchlist, never at it. The sentence used to call
  // it at-the-money gamma: a real number under a label nothing computed.
  const peakBleed = Math.round((CHARM_DECAY_FLOOR + CHARM_DECAY_SPAN / 2) * (HOURS_TO_CLOSE / 6.5) * 100);
  const flipMove = proj.flip - base.flip;
  const insights =
    mode === 'CHARM'
      ? [
          `Charm bleeds ~${peakBleed}% of the gamma at ${fmt(charmPeak)} — the heaviest-charm strike — over the final ${HOURS_TO_CLOSE}h. Every other strike bleeds in proportion to its own charm, so the wings hold their weight.`,
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
