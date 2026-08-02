/*
==================================================
  SLAYER TERMINAL - TRAILER STORY (trailerStory.ts)

  One symbol, one market event, one structural level, derived once.

  Every number the trailer shows is built here and handed down. Scenes render
  what they are given and never roll their own values: a trailer whose desks each
  invent their own numbers is a slideshow of unrelated dashboards, which is
  exactly the thing this is not.

  The chain, spot and structural levels come from the app's own simulator and
  `buildLevels` — the same single derivation every real desk reads, so the walls
  and flip shown here are the walls and flip the product would show. Story
  specifics (which prints arrive, which contracts compete, how the trade ends)
  are seeded from a fixed key so a replay is the same film.
==================================================
*/

import Simulator from '../../core/simulator';
import { buildLevels } from '../../data/gex';
import { h01, hGauss, hRange } from '../../core/rng';
import type {
  ContractRow,
  DarkPoolRead,
  DarkPrint,
  DistributionBin,
  EarningsRead,
  GammaCell,
  GammaField,
  GreekRow,
  LottoRow,
  MetaorderRead,
  NewsRead,
  OptionPrint,
  PricePoint,
  ProveItRead,
  RankedLevel,
  ScannerRow,
  SetupCandidate,
  StockRow,
  StressCase,
  TrackerOutcome,
  TrackerPacket,
  TrailerStory,
} from './trailerTypes';

const TICKER = 'NVDA';
const SEED = 'slayer-trailer-v1';

/** Story seconds. The narrative window, not the trailer's runtime. */
const STORY_SECONDS = 2400; // a 40-minute stretch of session
const PATH_POINTS = 200;

const round = (v: number, dp = 2) => Number(v.toFixed(dp));

/**
 * The session clock.
 *
 * Pinned to 10:42 ET on the story's own day rather than `Date.now()`, so the
 * timestamp that travels the State Thread is a market time the viewer can read
 * against the narrative — and so two viewers watching at different hours see the
 * same film. The date advances with the calendar; only the time of day is fixed.
 */
function sessionStart(): number {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 42, 0, 0);
  return d.getTime();
}

// ---- price path -------------------------------------------------------------
/**
 * Down into the level, chop on it, lift away.
 *
 * Shaped rather than sampled: the whole trailer is about one structural level
 * being approached, tested and held, and a free random walk tells that story
 * only by accident. The noise is seeded on top of a deliberate spine.
 */
function buildPath(spot0: number, level: number): PricePoint[] {
  const out: PricePoint[] = [];
  const drop = spot0 - level;
  for (let i = 0; i < PATH_POINTS; i++) {
    const u = i / (PATH_POINTS - 1);
    let spine: number;
    if (u < 0.42) {
      // approach — decelerating into the level
      spine = spot0 - drop * Math.pow(u / 0.42, 0.78);
    } else if (u < 0.66) {
      // test — three probes below, each shallower than the last
      const v = (u - 0.42) / 0.24;
      spine = level - drop * 0.16 * Math.sin(v * Math.PI * 3) * (1 - v * 0.55);
    } else {
      // reclaim
      const v = (u - 0.66) / 0.34;
      spine = level + drop * 0.62 * Math.pow(v, 1.35);
    }
    const noise = hGauss(`${SEED}-px-${i}`) * spot0 * 0.00055;
    out.push({ t: u * STORY_SECONDS, px: round(spine + noise) });
  }
  return out;
}

const pxAt = (path: PricePoint[], t: number): number => {
  if (t <= path[0].t) return path[0].px;
  const last = path[path.length - 1];
  if (t >= last.t) return last.px;
  const span = last.t / (path.length - 1);
  const i = Math.min(path.length - 2, Math.floor(t / span));
  const f = (t - path[i].t) / (path[i + 1].t - path[i].t);
  return path[i].px + (path[i + 1].px - path[i].px) * f;
};

// ---- option prints ----------------------------------------------------------
function buildPrints(level: number, step: number): OptionPrint[] {
  const parentStrike = round(Math.round((level + step * 2) / step) * step, 2);
  const expiry = 'AUG 15';
  const out: OptionPrint[] = [];

  // Nine children of one sequence plus nine unrelated prints, interleaved. The
  // ratio matters as much as the count: a tape where every row belongs to the
  // same parent is not a tape, it is the answer printed out.
  const childTimes = [0, 6.4, 11.9, 18.2, 27.5, 33.1, 40.8, 47.6, 55.2];
  childTimes.forEach((at, i) => {
    const bid = round(2.18 + i * 0.06 + h01(`${SEED}-cb-${i}`) * 0.05);
    const ask = round(bid + 0.07 + h01(`${SEED}-ca-${i}`) * 0.04);
    out.push({
      id: `c${i}`,
      at,
      strike: parentStrike,
      right: 'C',
      expiry,
      dte: 11,
      size: Math.round(hRange(`${SEED}-cs-${i}`, 240, 1450)),
      premium: 0,
      fill: round(hRange(`${SEED}-cf-${i}`, 0.86, 1), 3),
      bid,
      ask,
      oi: 4820,
      kind: i === 3 ? 'BLOCK' : i % 2 === 0 ? 'SWEEP' : 'SPLIT',
      lean: 'CALL-SIDE',
      leanConf: round(hRange(`${SEED}-cl-${i}`, 0.61, 0.79), 2),
      quoteAgeMs: Math.round(hRange(`${SEED}-cq-${i}`, 40, 260)),
      urgency: i === 3 ? 'FIRM' : 'AGGRESSIVE',
      child: true,
    });
  });

  const noiseTimes = [3.1, 9.2, 15.7, 21.8, 23.4, 30.6, 34.2, 44.1, 51.9];
  noiseTimes.forEach((at, i) => {
    const right = i % 2 === 0 ? 'P' : 'C';
    const strike = round(Math.round((level - step * (i + 1)) / step) * step, 2);
    const bid = round(1.02 + h01(`${SEED}-nb-${i}`) * 0.9);
    const ask = round(bid + 0.05 + h01(`${SEED}-na-${i}`) * 0.09);
    out.push({
      id: `n${i}`,
      at,
      strike,
      right,
      expiry: i === 1 ? 'AUG 22' : expiry,
      dte: i === 1 ? 18 : 11,
      size: Math.round(hRange(`${SEED}-ns-${i}`, 25, 190)),
      premium: 0,
      fill: round(hRange(`${SEED}-nf-${i}`, 0.18, 0.72), 3),
      bid,
      ask,
      oi: Math.round(hRange(`${SEED}-no-${i}`, 400, 2600)),
      kind: 'BLOCK',
      lean: right === 'C' ? 'CALL-SIDE' : 'PUT-SIDE',
      leanConf: round(hRange(`${SEED}-nl-${i}`, 0.34, 0.52), 2),
      quoteAgeMs: Math.round(hRange(`${SEED}-nq-${i}`, 300, 1900)),
      urgency: 'PATIENT',
      child: false,
    });
  });

  out.sort((a, b) => a.at - b.at);
  for (const p of out) {
    p.premium = Math.round(p.size * (p.bid + (p.ask - p.bid) * p.fill) * 100);
  }
  return out;
}

// ---- scanner ----------------------------------------------------------------
function buildScanner(prints: OptionPrint[], ticker: string): ScannerRow[] {
  const ours = prints.find(p => p.child)!;
  const rows: ScannerRow[] = [
    {
      id: 'ours',
      label: `${ticker} ${ours.strike}C ${ours.expiry}`,
      premium: prints.filter(p => p.child).reduce((a, p) => a + p.premium, 0),
      volOi: 1.94,
      moneyness: 0.021,
      dte: 11,
      iv: 0.482,
      scoreFrom: 61,
      scoreTo: 88,
      state: 'LIVE READ',
      ours: true,
    },
    { id: 'r1', label: 'AMD 168C AUG 15', premium: 1_940_000, volOi: 2.71, moneyness: 0.038, dte: 11, iv: 0.516, scoreFrom: 84, scoreTo: 79, state: 'DECAYING', ours: false },
    { id: 'r2', label: 'SMCI 44P AUG 08', premium: 1_120_000, volOi: 1.42, moneyness: -0.019, dte: 4, iv: 0.694, scoreFrom: 77, scoreTo: 74, state: 'UNCONFIRMED', ours: false },
    { id: 'r3', label: 'MU 118C AUG 22', premium: 880_000, volOi: 0.98, moneyness: 0.052, dte: 18, iv: 0.441, scoreFrom: 72, scoreTo: 70, state: 'LIVE READ', ours: false },
    { id: 'r4', label: 'AVGO 172C AUG 15', premium: 640_000, volOi: 0.77, moneyness: 0.011, dte: 11, iv: 0.398, scoreFrom: 66, scoreTo: 63, state: 'UNCONFIRMED', ours: false },
    { id: 'r5', label: 'INTC 22P AUG 15', premium: 410_000, volOi: 0.61, moneyness: -0.044, dte: 11, iv: 0.552, scoreFrom: 58, scoreTo: 55, state: 'DECAYING', ours: false },
  ];
  return rows;
}

// ---- metaorder --------------------------------------------------------------
function buildMetaorder(prints: OptionPrint[]): MetaorderRead {
  const children = prints.filter(p => p.child);
  const total = children.reduce((a, p) => a + p.size, 0);
  return {
    childIds: children.map(p => p.id),
    windowSec: Math.round(children[children.length - 1].at - children[0].at),
    sharedStrike: children[0].strike,
    sharedExpiry: children[0].expiry,
    aggressorConsistency: 0.92,
    estimatedTotal: Math.round(total / 0.68),
    completedPct: 0.68,
    minutesRemaining: 14,
    // Deliberately a distribution, never a label. "Institutional" is not an
    // observation the tape can make.
    hypotheses: [
      { label: 'Single parent order', probability: 0.58 },
      { label: 'Correlated but separate takers', probability: 0.24 },
      { label: 'Delta hedge against stock', probability: 0.12 },
      { label: 'Opening spread leg', probability: 0.06 },
    ],
    invalidation: 'No further child within 6 min, or a same-strike bid-side print above 400 lots',
  };
}

// ---- dark pool --------------------------------------------------------------
function buildDarkPool(level: number, path: PricePoint[]): DarkPoolRead {
  const prints: DarkPrint[] = [];
  const venues = ['CONDITIONAL ATS', 'BANK ATS', 'AGENCY ATS', 'MIDPOINT ATS'];
  for (let i = 0; i < 9; i++) {
    const at = hRange(`${SEED}-dpa-${i}`, 0, STORY_SECONDS * 0.7);
    prints.push({
      at,
      px: round(level + hGauss(`${SEED}-dpp-${i}`) * level * 0.0008),
      notional: Math.round(hRange(`${SEED}-dpn-${i}`, 4.2e6, 61e6)),
      venue: venues[Math.floor(h01(`${SEED}-dpv-${i}`) * venues.length)],
    });
  }
  prints.sort((a, b) => a.at - b.at);
  const spotNow = path[path.length - 1].px;
  return {
    shelf: round(level),
    prints,
    shelfNotional: prints.reduce((a, p) => a + p.notional, 0),
    touches: 3,
    survivedTouches: 3,
    distancePct: round(((spotNow - level) / level) * 100, 2),
    state: 'ABSORPTION',
    // Every reading that fits, weighted — not one arrow.
    readings: [
      { label: 'Absorption', weight: 0.54 },
      { label: 'Unresolved', weight: 0.24 },
      { label: 'Pass-through', weight: 0.14 },
      { label: 'Rejection', weight: 0.08 },
    ],
  };
}

// ---- dealer field -----------------------------------------------------------
function buildGammaField(
  chain: { strike: number; netGex: number }[],
  levels: { callWall: number; putWall: number; flip: number; king: number },
  spot: number,
): GammaField {
  const sorted = [...chain].sort((a, b) => a.strike - b.strike);
  const centre = sorted.reduce((best, n) => (Math.abs(n.strike - spot) < Math.abs(best.strike - spot) ? n : best), sorted[0]);
  const ci = sorted.indexOf(centre);
  const window = sorted.slice(Math.max(0, ci - 9), Math.max(0, ci - 9) + 19);
  const strikes = window.map(n => n.strike);
  const expiries = ['0DTE', '1D', '4D', '11D', '18D'];
  const cells: GammaCell[] = [];
  let maxAbs = 0;
  window.forEach(n => {
    expiries.forEach((_, e) => {
      // Near expiries carry most of the gamma; the far ones flatten out.
      const decay = Math.exp(-e * 0.42);
      const jitter = 0.72 + h01(`${SEED}-gx-${n.strike}-${e}`) * 0.56;
      const v = n.netGex * decay * jitter;
      maxAbs = Math.max(maxAbs, Math.abs(v));
      cells.push({ strike: n.strike, expiryIdx: e, netGex: v });
    });
  });
  return {
    strikes,
    expiries,
    cells,
    flip: levels.flip,
    callWall: levels.callWall,
    putWall: levels.putWall,
    king: levels.king,
    maxAbs: maxAbs || 1,
    // The honest caveat: dealer sign is inferred, and this read leans on it.
    signDependence: 0.71,
  };
}

// ---- levels / greeks / stress ----------------------------------------------
function buildRankedLevels(
  levels: { callWall: number; putWall: number; flip: number; king: number },
  spot: number,
): RankedLevel[] {
  const mk = (price: number, role: RankedLevel['role'], reaction: number, confidence: number, sensitivity: number): RankedLevel => ({
    price: round(price),
    role,
    distancePct: round(((price - spot) / spot) * 100, 2),
    reaction,
    confidence,
    sensitivity,
  });
  return [
    mk(levels.putWall, 'SUPPORT', 0.72, 0.81, 0.22),
    mk(levels.flip, 'PIVOT', 0.64, 0.66, 0.58),
    mk(levels.king, 'RESISTANCE', 0.58, 0.74, 0.31),
    mk(levels.callWall, 'RESISTANCE', 0.51, 0.69, 0.28),
  ].sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct));
}

const GREEKS: GreekRow[] = [
  { key: 'gex', label: 'GEX', now: -412e6, drift: 0.34, unit: '$/1%' },
  { key: 'dex', label: 'DEX', now: 1.94e9, drift: -0.12, unit: '$' },
  { key: 'vex', label: 'VEX', now: -88e6, drift: 0.21, unit: '$/vol' },
  { key: 'cex', label: 'CEX', now: 24e6, drift: 0.44, unit: '$/day' },
  { key: 'vanna', label: 'VANNA', now: -61e6, drift: 0.28, unit: '$/vol·%' },
  { key: 'charm', label: 'CHARM', now: 39e6, drift: 0.52, unit: '$/day' },
];

const STRESS: StressCase[] = [
  { label: 'SPOT −0.5%', spotShock: -0.005, ivShock: 0, hoursForward: 0, hedgeFlow: -184e6, levelSurvives: true, note: 'Hedging sells into the level; the shelf absorbs it' },
  { label: 'SPOT −1.2%', spotShock: -0.012, ivShock: 0, hoursForward: 0, hedgeFlow: -496e6, levelSurvives: false, note: 'Below the flip the same hedge flow amplifies instead of absorbing' },
  { label: 'IV +2.0', spotShock: 0, ivShock: 0.02, hoursForward: 0, hedgeFlow: 92e6, levelSurvives: true, note: 'Vanna adds dealer length — the level firms' },
  { label: 'T +3h', spotShock: 0, ivShock: 0, hoursForward: 3, hedgeFlow: 141e6, levelSurvives: true, note: 'Charm migrates exposure toward the strike into the close' },
];

// ---- compass ----------------------------------------------------------------
function buildSetups(ticker: string, level: number, step: number): SetupCandidate[] {
  const f = (key: string, label: string, value: number, weight: number) => ({ key, label, value, weight });
  return [
    {
      id: 'SU-1',
      label: `${ticker} reclaim of ${round(level)} shelf`,
      right: 'C',
      horizon: 'WEEKLIES · 11D',
      factors: [
        f('level', 'Level quality', 0.81, 0.24),
        f('flow', 'Flow corroboration', 0.74, 0.22),
        f('dealer', 'Dealer state', 0.58, 0.18),
        f('vol', 'Volatility state', 0.52, 0.14),
        f('data', 'Data quality', 0.88, 0.12),
        f('model', 'Model confidence', 0.63, 0.10),
      ],
      pTargetBeforeStop: 0.57,
      evAfterCosts: 0.128,
      expectedShortfall: -0.41,
      dataQuality: 0.88,
      modelConfidence: 0.63,
      invalidation: `Two closes below ${round(level - step * 2)} or the parent sequence stalling`,
      verdict: 'SELECTED',
    },
    {
      id: 'SU-2',
      label: `${ticker} momentum continuation`,
      right: 'C',
      horizon: 'WEEKLIES · 4D',
      factors: [
        f('level', 'Level quality', 0.44, 0.24),
        f('flow', 'Flow corroboration', 0.91, 0.22),
        f('dealer', 'Dealer state', 0.49, 0.18),
        f('vol', 'Volatility state', 0.38, 0.14),
        f('data', 'Data quality', 0.41, 0.12),
        f('model', 'Model confidence', 0.35, 0.10),
      ],
      pTargetBeforeStop: 0.54,
      evAfterCosts: -0.019,
      expectedShortfall: -0.72,
      dataQuality: 0.41,
      modelConfidence: 0.35,
      invalidation: 'Quote age exceeded the gate before entry could be priced',
      // The headline number is the best on the board and it still fails.
      verdict: 'REJECTED',
      rejectReason: 'DATA-QUALITY GATE · quotes stale beyond 1.5s at the size required',
    },
    {
      id: 'SU-3',
      label: `${ticker} fade into the call wall`,
      right: 'P',
      horizon: 'WEEKLIES · 11D',
      factors: [
        f('level', 'Level quality', 0.69, 0.24),
        f('flow', 'Flow corroboration', 0.28, 0.22),
        f('dealer', 'Dealer state', 0.62, 0.18),
        f('vol', 'Volatility state', 0.47, 0.14),
        f('data', 'Data quality', 0.83, 0.12),
        f('model', 'Model confidence', 0.44, 0.10),
      ],
      pTargetBeforeStop: 0.48,
      evAfterCosts: 0.021,
      expectedShortfall: -0.55,
      dataQuality: 0.83,
      modelConfidence: 0.44,
      invalidation: 'A close above the call wall',
      verdict: 'ALTERNATIVE',
    },
    {
      id: 'SU-4',
      label: `${ticker} straddle into the event`,
      right: 'C',
      horizon: 'SWINGS · 18D',
      factors: [
        f('level', 'Level quality', 0.36, 0.24),
        f('flow', 'Flow corroboration', 0.41, 0.22),
        f('dealer', 'Dealer state', 0.33, 0.18),
        f('vol', 'Volatility state', 0.71, 0.14),
        f('data', 'Data quality', 0.79, 0.12),
        f('model', 'Model confidence', 0.29, 0.10),
      ],
      pTargetBeforeStop: 0.41,
      evAfterCosts: -0.064,
      expectedShortfall: -0.88,
      dataQuality: 0.79,
      modelConfidence: 0.29,
      invalidation: 'Event premium already priced above the forecast move',
      verdict: 'REJECTED',
      rejectReason: 'NO EDGE · implied move exceeds the forecast move',
    },
  ];
}

// ---- weigher ----------------------------------------------------------------
function buildContracts(level: number, step: number): ContractRow[] {
  const base = Math.round((level + step * 2) / step) * step;
  const defs: { k: number; dte: number; expiry: string; verdict: ContractRow['verdict']; why: string }[] = [
    { k: base - step * 2, dte: 11, expiry: 'AUG 15', verdict: 'ALTERNATIVE', why: 'Most delta per dollar, but the widest spread of the five' },
    { k: base, dte: 11, expiry: 'AUG 15', verdict: 'SELECTED', why: 'Best utility after execution cost and shortfall' },
    { k: base + step * 2, dte: 11, expiry: 'AUG 15', verdict: 'ALTERNATIVE', why: 'Cheaper, but breakeven sits above the target' },
    { k: base, dte: 4, expiry: 'AUG 08', verdict: 'REJECTED', why: 'Theta burn exceeds the modelled drift over the horizon' },
    { k: base + step * 5, dte: 11, expiry: 'AUG 15', verdict: 'REJECTED', why: 'Headline return is the highest; the path it needs is the least likely' },
  ];
  return defs.map((d, i) => {
    const moneyness = (d.k - level) / level;
    const mid = round(Math.max(0.28, 4.9 - moneyness * 92 - (11 - d.dte) * 0.16));
    const spreadPct = round(0.018 + i * 0.006 + Math.max(0, moneyness) * 0.42, 3);
    const bid = round(mid * (1 - spreadPct / 2));
    const ask = round(mid * (1 + spreadPct / 2));
    const delta = round(Math.max(0.06, 0.62 - moneyness * 9.5), 3);
    const executionCost = round(((ask - bid) / 2 + 0.01) / mid, 3);
    const physicalExit = round(mid * (1 + (0.42 - Math.max(0, moneyness) * 7.4)), 2);
    const ev = round((physicalExit - mid) / mid - executionCost, 3);
    return {
      id: `K${d.k}-${d.expiry}`,
      strike: round(d.k),
      right: 'C',
      expiry: d.expiry,
      dte: d.dte,
      bid,
      ask,
      mid,
      spreadPct,
      quoteAgeMs: Math.round(hRange(`${SEED}-cq2-${i}`, 60, 620)),
      oi: Math.round(hRange(`${SEED}-coi-${i}`, 900, 8200)),
      volume: Math.round(hRange(`${SEED}-cvol-${i}`, 400, 6400)),
      delta,
      gamma: round(0.021 - Math.abs(moneyness) * 0.12, 4),
      vega: round(0.19 - Math.abs(moneyness) * 0.6, 3),
      theta: round(-(0.11 + (11 - d.dte) * 0.021), 3),
      iv: round(0.44 + Math.max(0, moneyness) * 1.1, 3),
      breakeven: round(d.k + mid),
      physicalExit,
      executionCost,
      ev,
      expectedShortfall: round(-(0.38 + Math.max(0, moneyness) * 5.2), 3),
      utility: round(ev - Math.max(0, moneyness) * 0.9 - spreadPct * 2.4, 3),
      liquidityRisk: round(Math.min(0.94, 0.12 + Math.max(0, moneyness) * 6.1 + (11 - d.dte) * 0.02), 2),
      verdict: d.verdict,
      why: d.why,
    };
  });
}

// ---- lotto ------------------------------------------------------------------
function buildLotto(spot: number, step: number): LottoRow[] {
  const defs = [
    { k: Math.round((spot + step * 2) / step) * step, verdict: 'CONSIDERED' as const, why: 'Reachable inside the session on the modelled path' },
    { k: Math.round((spot + step * 6) / step) * step, verdict: 'NO TRADE' as const, why: 'Needs a move in the top decile of intraday range with 2h left' },
    { k: Math.round((spot + step * 12) / step) * step, verdict: 'NO TRADE' as const, why: 'Cheapest on the board; the required path is a tail, not a drift' },
  ];
  return defs.map((d, i) => {
    const required = (d.k - spot) / spot;
    const ask = round(Math.max(0.04, 1.9 * Math.exp(-required * 74)), 2);
    return {
      id: `L${i}`,
      strike: round(d.k),
      ask,
      breakevenMove: round((required + ask / spot) * 100, 2),
      requiredMove: round(required * 100, 2),
      pFirstPassage: round(Math.max(0.005, 0.46 * Math.exp(-required * 96)), 3),
      pTargetBeforeExpiry: round(Math.max(0.003, 0.38 * Math.exp(-required * 104)), 3),
      thetaBurnPerHour: round(ask * (0.11 + i * 0.05), 3),
      spreadCost: round(0.03 + i * 0.05, 3),
      terminalLiquidity: round(Math.max(0.05, 0.82 - i * 0.31), 2),
      pinRisk: round(0.18 + i * 0.09, 2),
      maxLoss: 1,
      verdict: d.verdict,
      why: d.why,
    };
  });
}

// ---- prove it ---------------------------------------------------------------
function buildProveIt(spot: number): ProveItRead {
  const bins: DistributionBin[] = [];
  const lo = spot * 0.955;
  const hi = spot * 1.055;
  for (let i = 0; i < 34; i++) {
    const px = lo + ((hi - lo) * i) / 33;
    const zP = (px - spot * 1.004) / (spot * 0.017);
    const zQ = (px - spot * 1.0) / (spot * 0.0205);
    bins.push({
      px: round(px),
      physical: Math.exp(-0.5 * zP * zP),
      // Risk-neutral is wider and centred lower — the two are not the same claim.
      riskNeutral: Math.exp(-0.5 * zQ * zQ) * 0.94,
    });
  }
  const calibration: ProveItRead['calibration'] = [];
  for (let i = 1; i <= 9; i++) {
    const p = i / 10;
    calibration.push({ predicted: p, observed: round(p + hGauss(`${SEED}-cal-${i}`) * 0.035, 3) });
  }
  return {
    bins,
    calibration,
    expectedLow: round(spot * 0.982),
    expectedHigh: round(spot * 1.026),
    tailProb: 0.041,
    horizonLabel: 'Close-to-close, 11 sessions, ±1σ band',
    models: [
      { name: 'gex-drift v4', role: 'CHAMPION', crps: 0.0184, calibrationErr: 0.021, economicValue: 0.061, walkForward: 0.58, promoted: true, gate: 'IN PRODUCTION' },
      { name: 'flow-attn v1', role: 'CHALLENGER', crps: 0.0179, calibrationErr: 0.048, economicValue: 0.012, walkForward: 0.51, promoted: false, gate: 'FAILED · calibration error above 0.03 gate' },
      { name: 'vol-carry v2', role: 'CHALLENGER', crps: 0.0201, calibrationErr: 0.026, economicValue: 0.034, walkForward: 0.54, promoted: false, gate: 'FAILED · economic value below champion after costs' },
    ],
  };
}

// ---- stocks / news / earnings ----------------------------------------------
function buildStocks(ticker: string): StockRow[] {
  const rows: StockRow[] = [
    { ticker, momentum: 0.74, quality: 0.68, flow: 0.88, news: 0.52, composite: 0.76, sector: 'SEMIS', relStrength: 0.81, offExchange: 0.63, routing: 'OPTIONS', ours: true },
    { ticker: 'AMD', momentum: 0.66, quality: 0.51, flow: 0.71, news: 0.44, composite: 0.62, sector: 'SEMIS', relStrength: 0.69, offExchange: 0.48, routing: 'STOCK', ours: false },
    { ticker: 'AVGO', momentum: 0.58, quality: 0.79, flow: 0.42, news: 0.38, composite: 0.57, sector: 'SEMIS', relStrength: 0.61, offExchange: 0.39, routing: 'SPREAD', ours: false },
    { ticker: 'MU', momentum: 0.49, quality: 0.44, flow: 0.55, news: 0.61, composite: 0.51, sector: 'SEMIS', relStrength: 0.47, offExchange: 0.51, routing: 'STOCK', ours: false },
    { ticker: 'INTC', momentum: 0.22, quality: 0.31, flow: 0.28, news: 0.34, composite: 0.27, sector: 'SEMIS', relStrength: 0.19, offExchange: 0.24, routing: 'NO TRADE', ours: false },
  ];
  return rows;
}

function buildNews(): NewsRead {
  return {
    // Sources are described by type, never by a fabricated masthead.
    items: [
      { at: 0, source: 'Exchange filing', headline: 'Supply agreement expanded with a top-3 cloud customer', catalyst: 'GUIDANCE-ADJACENT', novelty: 0.81, duplicates: 0, contradiction: false },
      { at: 42, source: 'Newswire summary', headline: 'Same agreement, syndicated', catalyst: 'GUIDANCE-ADJACENT', novelty: 0.12, duplicates: 6, contradiction: false },
      { at: 96, source: 'Sell-side note', headline: 'Estimate raised on the same agreement', catalyst: 'ESTIMATE REVISION', novelty: 0.34, duplicates: 2, contradiction: false },
      { at: 158, source: 'Trade press', headline: 'Channel check reads capacity as unchanged', catalyst: 'SUPPLY', novelty: 0.58, duplicates: 0, contradiction: true },
    ],
    driftBefore: 0.004,
    driftAfter: 0.0061,
    widthBefore: 0.017,
    widthAfter: 0.0206,
    confidence: 0.44,
  };
}

function buildEarnings(spot: number): EarningsRead {
  const straddle = round(spot * 0.078);
  return {
    date: 'AUG 27',
    daysAway: 12,
    timeConfirmed: false,
    session: 'AFTER CLOSE (estimated)',
    straddleCost: straddle,
    impliedMovePct: round((straddle / spot) * 100, 2),
    realizedMedianPct: 6.4,
    forecastMovePct: 6.9,
    ivCrush: 0.38,
    pDirection: 0.52,
    pMagnitude: 0.61,
    structures: [
      { label: 'LONG VOL', verdict: 'AGAINST', note: 'Implied move sits above both the realized median and the forecast' },
      { label: 'SHORT VOL', verdict: 'NEUTRAL', note: 'Edge is real but thin once crush timing risk is priced' },
      { label: 'DIRECTIONAL', verdict: 'AGAINST', note: 'Direction probability is a coin flip; magnitude is the only signal' },
      { label: 'WAIT FOR DAY TWO', verdict: 'FAVOURED', note: 'Post-event continuation has the only measured edge here' },
      { label: 'NO EDGE', verdict: 'NEUTRAL', note: 'Valid outcome; the desk is not required to have a position' },
    ],
    selected: 'WAIT FOR DAY TWO',
  };
}

// ---- tracker ----------------------------------------------------------------
function buildTracker(
  ticker: string,
  setup: SetupCandidate,
  contract: ContractRow,
  level: number,
  spot: number,
  start: number,
): { packet: TrackerPacket; outcome: TrackerOutcome } {
  const packet: TrackerPacket = {
    id: 'TR-4417',
    frozenAt: start + STORY_SECONDS * 1000,
    ticker,
    setupId: setup.id,
    contractId: contract.id,
    entry: contract.mid,
    stop: round(level * 0.988),
    target: round(level * 1.031),
    level: round(level),
    ev: setup.evAfterCosts,
    expectedShortfall: setup.expectedShortfall,
    dataQuality: setup.dataQuality,
    modelVersion: 'gex-drift v4',
    invalidation: setup.invalidation,
    alternatives: ['SU-3', 'K+2 AUG 15', 'K+5 AUG 15', 'AUG 08 same strike'],
  };

  const path: PricePoint[] = [];
  for (let i = 0; i < 60; i++) {
    const u = i / 59;
    const spine = spot + (packet.target - spot) * Math.pow(u, 1.2) * 0.82;
    path.push({ t: u, px: round(spine + hGauss(`${SEED}-out-${i}`) * spot * 0.0016) });
  }

  return {
    packet,
    outcome: {
      path,
      targetProgress: 0.82,
      invalidationRisk: 0.14,
      survived: true,
      outcome: 'CLOSED ON RULE',
      counterfactuals: [
        { label: 'K+2 AUG 15 (cheaper strike)', result: -0.18, better: false },
        { label: 'K+5 AUG 15 (the lottery)', result: -1.0, better: false },
        { label: 'AUG 08 same strike', result: -0.44, better: false },
        { label: 'SU-3 fade the call wall', result: 0.06, better: false },
      ],
      attribution: [
        { label: 'Level quality', contribution: 0.41 },
        { label: 'Flow corroboration', contribution: 0.28 },
        { label: 'Contract selection', contribution: 0.19 },
        { label: 'Dealer state', contribution: 0.07 },
        { label: 'Volatility state', contribution: -0.05 },
      ],
      // One outcome is one sample. It updates a weight; it does not crown a model.
      learning: 'LEARN',
      learningNote:
        'One outcome updates the level-quality weight inside its prior. Promotion still requires the walk-forward gate, not this trade.',
    },
  };
}

// ---- assembly ---------------------------------------------------------------
let cached: TrailerStory | null = null;

/**
 * Build (and memoize) the story.
 *
 * Memoized because replaying the trailer must show the same film — and because
 * `Simulator.buildSnapshot` advances the simulator's own RNG, so calling it per
 * mount would drift the chain out from under a viewer who hit Replay.
 */
export function buildTrailerStory(): TrailerStory {
  if (cached) return cached;

  const snapshot = Simulator.buildSnapshot(TICKER);
  const levels = buildLevels(snapshot);
  const spot0 = snapshot.spot;
  // The story happens at the put wall: the one structural level every desk in
  // the trailer refers back to.
  const level = round(levels.putWall);
  const step = Math.max(0.5, round((levels.callWall - levels.putWall) / 12, 1));

  const path = buildPath(spot0, level);
  const spotNow = path[path.length - 1].px;
  const prints = buildPrints(level, step);
  const setups = buildSetups(TICKER, level, step);
  const contracts = buildContracts(level, step);
  const selectedSetup = setups.find(s => s.verdict === 'SELECTED')!;
  const selectedContract = contracts.find(c => c.verdict === 'SELECTED')!;
  const start = sessionStart();
  const { packet, outcome } = buildTracker(TICKER, selectedSetup, selectedContract, level, spotNow, start);

  cached = {
    ticker: TICKER,
    sessionStart: start,
    level,
    spot0,
    path,
    levels: {
      callWall: round(levels.callWall),
      putWall: round(levels.putWall),
      flip: round(levels.flip),
      king: round(levels.king),
    },
    prints,
    scanner: buildScanner(prints, TICKER),
    metaorder: buildMetaorder(prints),
    darkPool: buildDarkPool(level, path),
    gamma: buildGammaField(snapshot.chain, levels, spot0),
    rankedLevels: buildRankedLevels(levels, spotNow),
    greeks: GREEKS,
    stress: STRESS,
    setups,
    contracts,
    lotto: buildLotto(spotNow, step),
    scalp: { horizonMin: 25, pTargetBeforeStop: 0.61, spreadCost: 0.019, quoteStability: 0.84, gammaEfficiency: 0.72, minutesToCutoff: 38 },
    rebound: { touch: level, displacement: -1.9, absorption: 0.68, flowReversal: 0.57, dealerSupport: 0.63, excursion: 1.4, invalidation: round(level * 0.988) },
    proveIt: buildProveIt(spotNow),
    stocks: buildStocks(TICKER),
    news: buildNews(),
    earnings: buildEarnings(spotNow),
    packet,
    outcome,
  };
  return cached;
}

/** Test/HMR escape hatch — drops the memo so the next build re-derives. */
export function resetTrailerStory(): void {
  cached = null;
}

/** Spot at a point in the story window, from the one shaped path. */
export function spotAt(story: TrailerStory, storySec: number): number {
  return pxAt(story.path, storySec);
}

export { STORY_SECONDS };
