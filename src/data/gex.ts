/*
==================================================
  SLAYER TERMINAL - PINPOINT GEX MODEL (gex.ts)
  Derives chart levels/nodes, the strike×expiry
  matrix and the multi-ticker flow board from the
  simulator. Placeholder data contract — swaps for
  the real dealer-flow engine / ThetaData later.
==================================================
*/

import Simulator from '../core/simulator';
import { expiryFor, nextSession, fmtMonthDay } from '../core/calendar';
import type { MarketSnapshot, StrikeNode } from '../types/market';
import type {
  BoardTicker,
  DarkPoolPrint,
  GexMatrixData,
  GexMetric,
  GexView,
  KeyLevels,
  LadderRow,
  MatrixCell,
  NodeLevel,
  StrikeRange,
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

// ---- formatting -------------------------------------------------------------
export function fmtUsd(v: number): string {
  const sign = v < 0 ? '−' : '';
  const a = Math.abs(v);
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(1)}K`;
  return `${sign}$${a.toFixed(0)}`;
}

// ---- metric extraction ------------------------------------------------------
function metricValue(node: StrikeNode, metric: GexMetric): number {
  switch (metric) {
    case 'GEX':
      return node.netGex;
    case 'VEX':
      return node.netVex; // true $ per 1% vol — each metric view scales to its own max
    case 'GEX+VEX':
      return node.netGex * 0.7 + node.netVex * 28;
  }
}

// ---- levels & nodes ---------------------------------------------------------
/**
 * The structural levels, derived once. Anything that names a wall, a flip or a
 * king reads this — a panel that re-derives its own answers the same question
 * with a different number, and two panels on one screen then contradict each
 * other about where the regime turns.
 *
 * Walls and flip come off `plan`, which the simulator computes from the raw book
 * (simulator.ts:422-453). The flip in particular is the first UPWARD zero
 * crossing of the 3-strike-smoothed net-GEX profile: smoothed so one noisy
 * strike cannot fake a crossover, and upward because short-gamma-below /
 * long-gamma-above is what a desk means by the gamma flip. A first-sign-change
 * scan over a rescaled per-strike copy of the chain satisfies neither and lands
 * a strike away often enough to be seen.
 *
 * King is argmax |netGex| over the WHOLE chain, not a window: the largest
 * exposure in the book does not move because a panel is showing fewer strikes.
 */
export function buildLevels(snapshot: MarketSnapshot): KeyLevels {
  const { chain, spot, plan } = snapshot;
  let king = spot;
  let maxAbs = 0;
  for (const node of chain) {
    if (Math.abs(node.netGex) > maxAbs) {
      maxAbs = Math.abs(node.netGex);
      king = node.strike;
    }
  }
  return {
    spot,
    callWall: plan.resistanceWall,
    putWall: plan.supportWall,
    flip: plan.flipZone,
    king,
  };
}

/**
 * Pin: the heaviest total-OI strike in the `half`-wide window around spot.
 *
 * Off `KeyLevels` because it is the one level that legitimately depends on how
 * many strikes a panel is showing, so it takes the window as an argument instead
 * of pretending to be window-free. Open interest is raw — no view rescales it —
 * so two panels on the same window always land on the same strike.
 */
export function pinStrike(snapshot: MarketSnapshot, half: number): number {
  const { chain, spot } = snapshot;
  const desc = [...chain].sort((a, b) => b.strike - a.strike);
  const spotIdx = Math.max(0, desc.findIndex(n => n.strike <= spot));
  const start = Math.max(0, spotIdx - half);
  const window = desc.slice(start, start + half * 2 + 1);

  let pin = window[0]?.strike ?? spot;
  let heaviest = 0;
  for (const n of window) {
    if (n.callOI + n.putOI > heaviest) {
      heaviest = n.callOI + n.putOI;
      pin = n.strike;
    }
  }
  return pin;
}

function buildNodes(snapshot: MarketSnapshot, metric: GexMetric, range: StrikeRange): { nodes: NodeLevel[]; maxAbs: number } {
  const { chain, spot } = snapshot;
  const sorted = [...chain].sort((a, b) => a.strike - b.strike);
  const spotIdx = Math.max(0, sorted.findIndex(n => n.strike >= spot));
  const half = range === 10 ? 10 : 15; // strikes per side (chain carries 15 max)
  const start = Math.max(0, spotIdx - half);
  const window = sorted.slice(start, start + half * 2 + 1);

  let maxAbs = 1;
  const nodes = window.map(n => {
    const value = metricValue(n, metric);
    maxAbs = Math.max(maxAbs, Math.abs(value));
    return { strike: n.strike, value };
  });
  return { nodes, maxAbs };
}

// ---- strike × expiry matrix ---------------------------------------------------
// Keyed by days-to-expiry; the header shows the real calendar date, not "7D",
// since nobody converts a day-count to a date in their head at the tape.
const MATRIX_EXPIRIES = [
  { dte: 0, t: 0.003, decay: 1 },
  { dte: 1, t: 0.008, decay: 0.52 },
  { dte: 2, t: 0.012, decay: 0.38 },
  { dte: 5, t: 0.024, decay: 0.22 },
  { dte: 7, t: 0.032, decay: 0.16 },
];

/**
 * Column labels for the expiry matrix. Same-day keeps "0DTE" (traders read it
 * instantly); every later column shows its actual date (e.g. "Jul 24").
 *
 * Each horizon is calendar days — what a trader means by "7 DTE" — but two
 * horizons can resolve to the SAME session: standing on a Thursday, both "1 day"
 * and "2 days" land on that Friday, and two columns sharing a header reads as a
 * rendering bug. Horizons are ascending, so resolving them in order and forcing
 * each column strictly past the previous one keeps every column on its own
 * expiry.
 */
function matrixExpiryLabels(): string[] {
  const out: string[] = [];
  let prev: Date | null = null;
  for (let i = 0; i < MATRIX_EXPIRIES.length; i++) {
    const { dte } = MATRIX_EXPIRIES[i];
    let date = expiryFor(dte).date;
    if (prev !== null && date <= prev) {
      const after = new Date(prev);
      after.setDate(after.getDate() + 1);
      date = nextSession(after);
    }
    prev = date;
    out.push(i === 0 && dte === 0 ? '0DTE' : fmtMonthDay(date));
  }
  return out;
}

function buildMatrix(snapshot: MarketSnapshot, metric: GexMetric, range: StrikeRange, levels: KeyLevels): GexMatrixData {
  const { ticker, chain, spot } = snapshot;
  const sorted = [...chain].sort((a, b) => b.strike - a.strike); // descending
  const spotIdx = Math.max(0, sorted.findIndex(n => n.strike <= spot));
  const half = range === 10 ? 10 : 15; // strikes per side (chain carries 15 max)
  const start = Math.max(0, spotIdx - half);
  const window = sorted.slice(start, start + half * 2 + 1);

  let maxAbs = 1;

  const cells: MatrixCell[][] = window.map(node => {
    const base = metricValue(node, metric);
    return MATRIX_EXPIRIES.map((exp, c) => {
      const noise = h01(`${ticker}-${node.strike}-${exp.dte}`);
      // Farther expiries decay and occasionally flip sign (charm/vanna migration)
      const flip = c > 0 && noise > 0.86 ? -1 : 1;
      const value = base * exp.decay * (0.55 + noise * 0.9) * flip;
      const abs = Math.abs(value);
      if (abs > maxAbs) maxAbs = abs;
      // King crowns the 0DTE cell at the book's max-exposure strike (matches the chart level)
      return { value, king: c === 0 && node.strike === levels.king };
    });
  });

  const strikes = window.map(n => n.strike);
  const nearest = (target: number) => {
    let best = -1;
    let bestDist = Infinity;
    strikes.forEach((s, i) => {
      const d = Math.abs(s - target);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  };

  return {
    expiries: matrixExpiryLabels(),
    strikes,
    cells,
    maxAbs,
    spotRowIndex: nearest(levels.spot),
    callWallIndex: nearest(levels.callWall),
    putWallIndex: nearest(levels.putWall),
  };
}

// ---- multi-ticker flow board ---------------------------------------------------
const BOARD_LADDER_DEPTH = 9; // strikes each side of spot

function buildLadder(ticker: string, spot: number, step: number): { ladder: LadderRow[]; maxAbs: number } {
  const rows: LadderRow[] = [];
  let maxAbs = 1;
  let kingIdx = 0;
  let kingAbs = 0;

  for (let i = BOARD_LADDER_DEPTH; i >= -BOARD_LADDER_DEPTH; i--) {
    const strike = Math.round((spot + i * step) / step) * step;
    const dist = Math.abs(strike - spot) / (spot * 0.012);
    const mass = Math.exp(-dist * dist);
    const noise = h01(`${ticker}-${strike}-ladder`);
    const sign = noise > (i >= 0 ? 0.35 : 0.6) ? 1 : -1; // calls-heavy above, puts-heavy below
    const value = sign * mass * spot * 45000 * (0.3 + noise);
    const abs = Math.abs(value);
    if (abs > maxAbs) maxAbs = abs;
    if (abs > kingAbs) {
      kingAbs = abs;
      kingIdx = rows.length;
    }
    rows.push({ strike, value });
  }

  rows[kingIdx] = { ...rows[kingIdx], king: true };
  return { ladder: rows, maxAbs };
}

function buildPrints(ticker: string, spot: number): DarkPoolPrint[] {
  const count = 2 + (hash(`${ticker}-dp-count`) % 2);
  const prints: DarkPoolPrint[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const n1 = h01(`${ticker}-dp-${i}-p`);
    const n2 = h01(`${ticker}-dp-${i}-n`);
    const daysAgo = 1 + (hash(`${ticker}-dp-${i}-d`) % 12);
    const when = new Date(now.getTime() - daysAgo * 86400000);
    const price = Number((spot * (0.995 + n1 * 0.01)).toFixed(2));
    // Shares-first like the Dark Pool desk (5K–255K shares, small-skewed tail),
    // so the same cross prints the same size on both surfaces.
    const shares = Math.round(5000 + Math.pow(n2, 2.5) * 250000);
    const notional = shares * price;
    const hh = 9 + (hash(`${ticker}-dp-${i}-h`) % 7);
    const mm = hash(`${ticker}-dp-${i}-m`) % 60;
    const ss = hash(`${ticker}-dp-${i}-s`) % 60;
    prints.push({
      price,
      notional,
      date: `${when.getMonth() + 1}/${when.getDate()}`,
      size: Math.round(shares / 100) * 100,
      time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`,
    });
  }
  return prints;
}

function buildBoard(): BoardTicker[] {
  return Simulator.WATCHLIST.map(ticker => {
    const cfg = Simulator.TICKERS[ticker];
    const { ladder, maxAbs } = buildLadder(ticker, cfg.currentPrice, cfg.step);
    return {
      ticker,
      spot: cfg.currentPrice,
      changePercent: ((cfg.currentPrice - cfg.basePrice) / cfg.basePrice) * 100,
      prints: buildPrints(ticker, cfg.currentPrice),
      ladder,
      ladderMaxAbs: maxAbs,
    };
  });
}

// ---- matrix pulse ----------------------------------------------------------------
/**
 * Retired. Returns the matrix untouched, and exists only so the call sites that
 * still wrap it keep compiling; they should drop the wrapper.
 *
 * This used to multiply every cell by a two-term sine once a second so the
 * heatmap "breathed" between scans. A liveness cue is a fair design choice — but
 * this one moved the DATA, not the presentation. GexMatrix prints
 * `fmtUsd(cell.value)` inside every cell and the hover read-out repeats it,
 * signed and labelled ("dealer support · long γ"). So the dollar figure a reader
 * takes off the grid swung across 31% of its own magnitude while the book had
 * not moved, and the 1/1.19 normalisation meant a cell peaked at 99.6% of its
 * true value and spent the rest of the cycle understating it — down to 68% — so
 * the ±maxAbs the colour rail advertises was a number no cell could reach.
 * Nothing in the dealer book produces that wobble; it was there to look alive.
 *
 * A cue that no read-out reports would be legitimate — a per-cell `pulse` weight
 * carried alongside `value` and spent on opacity or glow in GexMatrix. That
 * needs a field on MatrixCell and a change in the component, so it is not
 * smuggled back in here on the value.
 */
export function pulseMatrix(
  matrix: GexMatrixData,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the tick that used to drive the wobble; kept so existing call sites still type-check
  tick?: number
): GexMatrixData {
  return matrix;
}

// ---- top-level assembly --------------------------------------------------------
export function buildGexView(snapshot: MarketSnapshot, metric: GexMetric, range: StrikeRange): GexView {
  const levels = buildLevels(snapshot);
  const { nodes, maxAbs } = buildNodes(snapshot, metric, range);
  return {
    levels,
    nodes,
    nodesMaxAbs: maxAbs,
    matrix: buildMatrix(snapshot, metric, range, levels),
    board: buildBoard(),
  };
}
