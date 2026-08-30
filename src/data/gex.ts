/*
==================================================
  SLAYER TERMINAL - PINPOINT GEX MODEL (gex.ts)
  Derives chart levels/nodes, the strike×expiry
  matrix and the multi-ticker flow board from the
  simulator. Placeholder data contract — swaps for the
  real dealer-flow engine later. That engine is UW's
  spot-exposures family; ThetaData is out (re-pointed
  2026-08-26).
==================================================
*/

import Simulator from '../core/simulator';
import { expiryFor } from '../core/calendar';
import { pickFlip, pickWalls } from '../core/walls';
import type { GexLevel, MarketSnapshot, StrikeNode } from '../types/market';
import type {
  BoardTicker,
  DarkPoolPrint,
  GexMatrixData,
  GexMetric,
  GexView,
  HeatPatternRead,
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
  let supreme = spot;
  let maxAbs = 0;
  for (const node of chain) {
    if (Math.abs(node.netGex) > maxAbs) {
      maxAbs = Math.abs(node.netGex);
      supreme = node.strike;
    }
  }
  return {
    spot,
    callWall: plan.resistanceWall,
    putWall: plan.supportWall,
    flip: plan.flipZone,
    supreme,
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
// Four expiries, not five — the chart owns the page; the matrix stays narrow.
// (7D dropped: least signal for a 0DTE-first product, and it bought the chart
// a whole extra grid column.)
const MATRIX_EXPIRIES = [
  { label: '0DTE', dte: 0, t: 0.003, decay: 1 },
  { label: '1D', dte: 1, t: 0.008, decay: 0.52 },
  { label: '2D', dte: 2, t: 0.012, decay: 0.38 },
  { label: '5D', dte: 5, t: 0.024, decay: 0.22 },
];

/** Column headers carry the REAL resolved session date beside the tenor
    (Noah, 2026-08-18 — "real dates instead of 0DTE/1D/2D/5D"; the calendar
    resolves weekends/holidays so a 1D on Friday reads Monday's date). */
const matrixExpiryLabels = (): string[] =>
  MATRIX_EXPIRIES.map(e => `${e.label} · ${expiryFor(e.dte).label.slice(0, 5)}`);

// ---- heat pattern read ------------------------------------------------------
/** Name the field's configuration in the engine's own vocabulary (Noah,
    2026-08-18 — the map should say what it means; nobody else's map names
    the pattern). Deliberately levels-derived, NOT per-cell sign sums: sim
    cells encode option-side dominance, so raw sign sums would print the
    same pattern on every book — the flip/wall geometry is the engine's real
    regime read and it genuinely moves with the tape. Vocabulary is OURS
    (extract information, never grammar). */
export function readHeatPattern(levels: KeyLevels): HeatPatternRead {
  const { spot, flip, callWall, putWall } = levels;
  const px = (v: number) => v.toFixed(2);
  const aboveFlip = spot >= flip;
  const cwPct = ((callWall - spot) / Math.max(spot, 1)) * 100;
  const pwPct = ((spot - putWall) / Math.max(spot, 1)) * 100;
  /** Walls this close (%) box price in; a floor past GONE might as well not exist. */
  const TIGHT = 1.2;
  const GONE = 2.6;

  if (aboveFlip && cwPct <= TIGHT && pwPct <= TIGHT) {
    return {
      key: 'PINNED',
      direction: 'RANGE',
      read: `Absorbing walls at ${px(putWall)} and ${px(callWall)} box price in above the ${px(flip)} flip — dips get bought, rallies get sold, and drift beats trend until one side gives.`,
    };
  }
  if (aboveFlip) {
    return {
      key: 'SPRINGBOARD',
      direction: 'BULLISH',
      read: `Supportive field above the ${px(flip)} flip — dips into ${px(putWall)} get absorbed and the bounce carries; ${px(callWall)} overhead is the lid to beat.`,
    };
  }
  if (pwPct >= GONE) {
    return {
      key: 'WHIPSAW',
      direction: 'VOLATILE',
      read: `Below the ${px(flip)} flip with no floor in reach — hedging accelerates whichever way price moves, and the nearest shelf sits all the way down at ${px(putWall)}.`,
    };
  }
  return {
    key: 'TRAPDOOR',
    direction: 'BEARISH',
    read: `Below the ${px(flip)} flip the hedging amplifies moves — rallies get sold back under the ${px(callWall)} lid, and ${px(putWall)} is the only structure holding under price.`,
  };
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
      const noise = h01(`${ticker}-${node.strike}-${exp.label}`);
      // Farther expiries decay and occasionally flip sign (charm/vanna migration)
      const flip = c > 0 && noise > 0.86 ? -1 : 1;
      const value = base * exp.decay * (0.55 + noise * 0.9) * flip;
      const abs = Math.abs(value);
      if (abs > maxAbs) maxAbs = abs;
      // Supreme crowns the 0DTE cell at the book's max-exposure strike (matches the chart level)
      return { value, supreme: c === 0 && node.strike === kingStrike };
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

  rows[kingIdx] = { ...rows[kingIdx], supreme: true };
  return { ladder: rows, maxAbs };
}

/** Deterministic dark-pool prints for a ticker — exported for the 4-way board,
    which charts tickers outside the flow board's scan. */
export function buildPrints(ticker: string, spot: number): DarkPoolPrint[] {
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

function buildBoard(tickers?: string[]): BoardTicker[] {
  const list =
    tickers && tickers.length > 0
      ? tickers.map(t => Simulator.ensureTicker(t))
      : Simulator.WATCHLIST;
  return list.map(ticker => {
    const cfg = Simulator.TICKERS[ticker];
    const { ladder, maxAbs } = buildLadder(ticker, cfg.currentPrice, cfg.step);
    return {
      ticker,
      spot: cfg.currentPrice,
      // Through the one function, so the board cell and the chart header cannot
      // disagree about the day — they were two copies of the same expression
      // and would have had to be fixed twice.
      changePercent: spotChangePct(ticker),
      prints: buildPrints(ticker, cfg.currentPrice),
      ladder,
      ladderMaxAbs: maxAbs,
    };
  });
}

/** Key levels for ANY ticker, derived from its latest GEX snapshot — the same
    book the trails draw, so an expanded board chart agrees with its heatmap. */
/*
  THE RAIL'S LEVELS, off the LIVE book — P-24B.

  This read the last GEX SNAPSHOT, which is the book as it stood when the last
  bar rolled. The Exposure Profile reads the live chain. Same question, two
  vintages, and between bar rolls they answered differently — one half of the
  measured disagreement (six of eight names) this was written to end.

  Both now read the same input through the same reader: `readExposureNow`,
  over `chainFor`'s live book. `chainFor` rather than `snapshotFor` because
  the rail wants strikes, not a trade plan — see the simulator's note.

  The FALLBACKS stay this function's own. `readExposureNow` returns honest
  nulls ("no call wall qualifies" is a state an alert waits on); the rail
  cannot draw a null, so an unnamed level parks at spot and the rail simply
  draws no tag — the behaviour every caller here already had.
*/
export function buildLevelsFor(ticker: string): KeyLevels {
  const sym = Simulator.ensureTicker(ticker);
  const { chain, spot } = Simulator.chainFor(sym);
  if (chain.length === 0) return { spot, callWall: spot, putWall: spot, flip: spot, supreme: spot };
  const now = readExposureNow(chain.map(n => ({ strike: n.strike, value: n.netGex })), spot);
  return {
    spot,
    callWall: now.callWall ?? spot,
    putWall: now.putWall ?? spot,
    flip: now.flip ?? spot,
    supreme: now.supreme ?? spot,
  };
}

/*
  ══ THE BOOK AS AN ALERT SEES IT (T-22) ═════════════════════════════════════

  `buildLevelsFor` is for the RAIL, and the rail's fallbacks are wrong for an
  alert: an unnamed wall parked at `spot` moves every tick, so an exposure
  alert reading it would fire on the fallback's motion, not the wall's. This
  reader keeps core/walls.ts's real nulls — "no call wall qualifies" is a
  state, and an alert waits on it.

  `readExposureNow` is pure over a handed-in chain so the proof can stage a
  book; `exposureNowFor` is the one-line wrapper over the simulator's latest
  snapshot. Null from the wrapper means the book is unreadable, which every
  alert also waits on.
*/
export interface ExposureNow {
  /** Signed total of the chain's net GEX. */
  netGex: number;
  supreme: number | null;
  callWall: number | null;
  putWall: number | null;
  flip: number | null;
  /** The chain's strike spacing — smallest gap actually present (the ladder's
      own rule); 0 when the chain is too thin to say. */
  step: number;
}

export function readExposureNow(
  chain: readonly { strike: number; value: number }[],
  spot: number
): ExposureNow {
  let netGex = 0;
  let supreme: number | null = null;
  let kingAbs = 0;
  for (const l of chain) {
    netGex += l.value;
    const a = Math.abs(l.value);
    if (a > kingAbs) {
      kingAbs = a;
      supreme = l.strike;
    }
  }
  const w = pickWalls(chain, spot, l => l.value);
  const flip = pickFlip(chain, spot, l => l.value);
  const sorted = [...chain].sort((a, b) => a.strike - b.strike);
  let step = Infinity;
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i].strike - sorted[i - 1].strike;
    if (d > 1e-9) step = Math.min(step, d);
  }
  return {
    netGex,
    supreme,
    callWall: w.callWall,
    putWall: w.putWall,
    flip,
    step: Number.isFinite(step) ? step : 0,
  };
}

export function exposureNowFor(ticker: string): ExposureNow | null {
  const sym = Simulator.ensureTicker(ticker);
  const snaps = Simulator.getGexHistory(sym);
  const latest = snaps?.[snaps.length - 1];
  if (!latest || latest.levels.length === 0) return null;
  return readExposureNow(latest.levels, Simulator.TICKERS[sym].currentPrice);
}

/*
  The strike rows BESIDE a chart — the very snapshot `buildLevelsFor` reduces,
  handed back row by row instead of collapsed to four prices.

  That sourcing is the whole point and it is not an implementation detail. A
  rail that read its own generator would drift from the chart it sits against:
  the pane would draw a SUPREME line at one strike while the column beside it
  printed the heaviest bar at another, and both would look right on their own.
  `buildLadder` (the 4-way board's column) is exactly that second generator,
  which is why it is NOT what this returns.

  Nothing is computed here that the levels above do not already read. This
  windows the rows around spot — the same centring `buildNodes` uses for the
  chart's own nodes — and reports the largest magnitude in that window so a
  bar can be drawn as a fraction of it. The named levels stay the caller's:
  it already holds `KeyLevels` and passes them in, so wall, flip and supreme
  agree with the lines by construction rather than by coincidence.
*/
/*
  THE FIVE NETS THE RAIL CAN SHOW.

  One rail, one ruler, five questions — where dealer hedging bites (gamma),
  which way their shares lean (delta), what a vol move re-prices (vega),
  what a vol move does to their DELTA (vanna), and what the clock alone does
  to it (charm).

  NET ONLY, on purpose. The split into put and call legs is the Strike
  Pressure Ladder's job and it has the width for two bars a row; this column
  is one bar wide beside a chart, and a put/call pair drawn there is two
  half-height bars that say less than one whole one. What a reader wants off
  the edge of a chart is which way the strike leans and how hard.
*/
/*
  THE LADDER IS GAMMA, AND ONLY GAMMA.

  This briefly took a `metric` parameter with a five-net picker over it. That
  was the wrong home: the strike rail's job is what is trading at each strike
  right now, and hanging five greeks behind a dropdown on it buried that
  question under a menu. The nets belong on StrikeExposureBand, which is
  already a tall column of strikes with one net drawn across it, and that is
  where all five live. The parameter is gone rather than left defaulted —
  an argument no caller passes is an argument nobody has tested.
*/
export function buildLadderFor(
  ticker: string,
  depth = 30,
  scaleDepth = 10
): { rows: GexLevel[]; core: GexLevel[]; maxAbs: number; spot: number; step: number } {
  /* THE LIVE BOOK, like the levels above — P-24B. This read the last GEX
     snapshot while the TAGS drawn over these very bars came from
     `buildLevelsFor`, so between bar rolls the column crowned one strike and
     drew its tallest bar on another. One vintage, one book.

     AND IT STEADIED THE BAR SCALE rather than costing it, which is worth
     recording because the opposite was the obvious worry — this file's own
     rule is that "a bar chart whose scale moves while you look at it is a
     lie about size", and moving from a per-bar source to a per-tick one
     looks like exactly that trade. Measured within bars, active ticker:
     the snapshot path's `maxAbs` moved a median 1.86% per tick with a WORST
     CASE OF 26.8%; the live path moves 1.69% with a worst case of 3.8%. The
     jumps came from mixing vintages — the window slides with spot every
     tick while the values under it only jumped when the snapshot was
     rewritten. One book removes the discontinuity. On a non-active ticker,
     where the old snapshot was frozen solid (0.00%), the live read is
     0.02% median and 0.16% at worst: still, to the eye. */
  const sym = Simulator.ensureTicker(ticker);
  const { chain, spot } = Simulator.chainFor(sym);
  if (chain.length === 0) return { rows: [], core: [], maxAbs: 1, spot, step: 1 };

  const sorted = chain
    .map(n => ({ strike: n.strike, value: n.netGex }))
    .sort((a, b) => a.strike - b.strike);
  const spotIdx = Math.max(0, sorted.findIndex(n => n.strike >= spot));

  /*
    TWO WINDOWS, and they are deliberately different sizes.

    `rows` is what a consumer may DRAW — as wide as the chain is maintained, so
    a column placed against a price scale can fill whatever that scale happens
    to be showing. `core` is the near-spot set everything else reads: the bar
    scale, and the header's heaviest-strike line.

    They cannot be the same slice. Scale the bars over the wide window and
    every bar shortens the moment a far, heavy strike enters it. Let the drawn
    set follow the reader's zoom and the bars rescale under a zoom gesture —
    a bar chart whose scale moves while you look at it is a lie about size.
  */
  const slice = (d: number) => sorted.slice(Math.max(0, spotIdx - d), spotIdx + d + 1);
  const window = slice(depth);
  const core = slice(scaleDepth);

  let maxAbs = 1;
  for (const r of core) maxAbs = Math.max(maxAbs, Math.abs(r.value));

  /* The chain's own spacing, taken as the smallest gap actually present rather
     than assumed — a consumer placing rows by price needs it to know how many
     pixels one strike is worth. */
  let step = Infinity;
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i].strike - sorted[i - 1].strike;
    if (d > 1e-9) step = Math.min(step, d);
  }
  if (!Number.isFinite(step) || step <= 0) step = 1;

  // Descending, so the column runs the way a price axis does: high at the top.
  return { rows: [...window].reverse(), core: [...core].reverse(), maxAbs, spot, step };
}

/*
  ══ WHAT "TODAY" OPENED AT ═══════════════════════════════════════════════════

  This used to divide by `basePrice`, and `basePrice` is not an open — it is a
  hardcoded seed constant (SPY 500, QQQ 440, AAPL 190, NVDA 120,
  `simulator.ts:32`). Every pane header printed that drift in green or red and
  called it the session change. It is the distance from a number that was true
  once and never moves again: it does not reset overnight, so it grows without
  bound across sessions, and on a name the walk has carried it reads as a huge
  day that never happened.

  The bars already carry the answer. Sessions are separated by an overnight
  gap (`simulator.ts:273`) that is far larger than the bar interval, so the
  first bar after the last such gap is today's first bar, and its `open` is
  today's open.
*/
function sessionOpenOf(bars: readonly { time: number; open: number }[]): number | null {
  if (!bars.length) return null;
  // The intraday spacing is the SMALLEST positive gap; an overnight gap is
  // orders of magnitude larger. Derived rather than imported, so this cannot
  // drift out of step with the simulator's own bar interval.
  let step = Infinity;
  for (let i = 1; i < bars.length; i++) {
    const d = bars[i].time - bars[i - 1].time;
    if (d > 0 && d < step) step = d;
  }
  if (!Number.isFinite(step)) return bars[0].open;
  let i = bars.length - 1;
  // 1.5x: tolerate a missing bar without mistaking it for a new session.
  while (i > 0 && bars[i].time - bars[i - 1].time <= step * 1.5) i--;
  return bars[i].open;
}

/** Session change for a ticker — measured from TODAY'S OPEN. Exported so a
    chart header and a board cell can never disagree about the day. */
export function spotChangePct(ticker: string): number {
  const key = Simulator.ensureTicker(ticker);
  const cfg = Simulator.TICKERS[key];
  const open = sessionOpenOf(Simulator.getCandles(key) ?? []);
  // No bars yet is a real state on first paint. Zero is the honest answer —
  // "no move recorded" — where falling back to basePrice would quietly print
  // the very number this function exists to stop printing.
  if (open == null || !(open > 0)) return 0;
  return ((cfg.currentPrice - open) / open) * 100;
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
export function buildGexView(
  snapshot: MarketSnapshot,
  metric: GexMetric,
  range: StrikeRange,
  boardTickers?: string[]
): GexView {
  const levels = buildLevels(snapshot);
  const { nodes, maxAbs } = buildNodes(snapshot, metric, range);
  return {
    levels,
    nodes,
    nodesMaxAbs: maxAbs,
    matrix: buildMatrix(snapshot, metric, range, levels.supreme),
    board: buildBoard(boardTickers),
  };
}
