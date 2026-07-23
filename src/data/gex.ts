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
  const sign = v < 0 ? '-' : '';
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
      return node.netVex * 40; // scale VEX into a comparable dollar magnitude
    case 'GEX+VEX':
      return node.netGex * 0.7 + node.netVex * 28;
  }
}

// ---- levels & nodes ---------------------------------------------------------
function buildLevels(snapshot: MarketSnapshot): KeyLevels {
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

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Days-to-expiry → the actual expiry date (e.g. "Jul 23"), skipping weekends
    since listed options expire on trading days. */
function expiryLabel(dte: number): string {
  const d = new Date();
  let added = 0;
  while (added < dte) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) added += 1; // skip Sat/Sun
  }
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
}

function buildMatrix(snapshot: MarketSnapshot, metric: GexMetric, range: StrikeRange, kingStrike: number): GexMatrixData {
  const { ticker, chain, spot, plan } = snapshot;
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
      return { value, king: c === 0 && node.strike === kingStrike };
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
    expiries: MATRIX_EXPIRIES.map(e => expiryLabel(e.dte)),
    strikes,
    cells,
    maxAbs,
    spotRowIndex: nearest(spot) ?? -1,
    callWallIndex: nearest(plan.resistanceWall),
    putWallIndex: nearest(plan.supportWall),
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
    const notional = Number((0.8 + n2 * 3.4).toFixed(2));
    const hh = 9 + (hash(`${ticker}-dp-${i}-h`) % 7);
    const mm = hash(`${ticker}-dp-${i}-m`) % 60;
    const ss = hash(`${ticker}-dp-${i}-s`) % 60;
    prints.push({
      price,
      notional,
      date: `${when.getMonth() + 1}/${when.getDate()}`,
      size: Math.round((notional * 1e9) / price / 100) * 100,
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

// ---- live pulse ------------------------------------------------------------------
/**
 * Per-second modulation of the matrix cells — a looping (self-recycling)
 * wave per cell so the heatmap breathes in real time between scans. Sign is
 * preserved and maxAbs is untouched, so colors morph without the scale or
 * the strike window moving.
 */
const PULSE_PERIOD_S = 24;

export function pulseMatrix(matrix: GexMatrixData, tick: number): GexMatrixData {
  const phase01 = (tick % PULSE_PERIOD_S) / PULSE_PERIOD_S;
  const cells = matrix.cells.map((row, r) =>
    row.map((cell, c) => {
      const p = h01(`${matrix.strikes[r]}-${c}-pulse`);
      const slow = Math.sin(2 * Math.PI * (phase01 + p));
      const fast = Math.sin(2 * Math.PI * (phase01 * 3 + p * 7));
      return { ...cell, value: cell.value * (1 + 0.14 * slow + 0.05 * fast) };
    })
  );
  return { ...matrix, cells };
}

// ---- top-level assembly --------------------------------------------------------
export function buildGexView(snapshot: MarketSnapshot, metric: GexMetric, range: StrikeRange): GexView {
  const levels = buildLevels(snapshot);
  const { nodes, maxAbs } = buildNodes(snapshot, metric, range);
  return {
    levels,
    nodes,
    nodesMaxAbs: maxAbs,
    matrix: buildMatrix(snapshot, metric, range, levels.king),
    board: buildBoard(),
  };
}
