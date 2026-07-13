/*
==================================================
  SLAYER TERMINAL - SKY'S VISION ENGINE (skyvision.ts)
  Placeholder advisory model. Deterministic per contract
  so rows stay stable across ticks. Swap this whole file
  for the real quant engine / ThetaData feed later.
==================================================
*/

import Simulator from '../core/simulator';
import type { MarketSnapshot } from '../types/market';
import type {
  ChainAction,
  ChainRow,
  ContractChain,
  ImpactRow,
  Momentum,
  OptionRight,
  ScannerKey,
  Setup,
  SetupGroup,
  SkyVisionData,
  TakeProfit,
  TakeProfitStatus,
  Verdict,
} from '../types/skyvision';

// ---- deterministic RNG ----------------------------------------------------
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry(seedNum: number): () => number {
  let a = seedNum;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ---- scanner tuning -------------------------------------------------------
interface ScannerProfile {
  expiry: string;
  swingMul: number; // swing target aggressiveness
  scalpMul: number; // scalp exit tightness
  moveBias: number; // expected-move scaling
  scoreFloor: number; // min score to surface a setup
}

const PROFILES: Record<ScannerKey, ScannerProfile> = {
  'top-setups': { expiry: '0DTE', swingMul: 0.38, scalpMul: 0.18, moveBias: 1.0, scoreFloor: 90 },
  'quick-scalp': { expiry: '0DTE', swingMul: 0.22, scalpMul: 0.1, moveBias: 0.7, scoreFloor: 88 },
  discounted: { expiry: '1DTE', swingMul: 0.6, scalpMul: 0.28, moveBias: 1.35, scoreFloor: 86 },
  rebounds: { expiry: '1DTE', swingMul: 0.45, scalpMul: 0.22, moveBias: 1.15, scoreFloor: 85 },
  'whale-sweeps': { expiry: '0DTE', swingMul: 0.42, scalpMul: 0.2, moveBias: 1.1, scoreFloor: 89 },
  all: { expiry: '0DTE', swingMul: 0.38, scalpMul: 0.18, moveBias: 1.0, scoreFloor: 80 },
};

const WHY_LIBRARY: Record<ScannerKey, { chips: string[]; text: (t: string, k: number) => string }> = {
  'top-setups': {
    chips: ['TREND ALIGNED', 'DEALER SUPPORT', 'RSI CONFIRM'],
    text: (t, k) =>
      `Solid institutional buy walls are supporting price at ${k}. Market makers are heavily short this strike and must buy ${t} to stay hedged, forming an automatic protective floor under our entry.`,
  },
  'quick-scalp': {
    chips: ['HIGH GAMMA', 'FAST DECAY', 'TIGHT STOP'],
    text: (t) =>
      `Concentrated gamma at this strike makes ${t} whippy — dealer re-hedging amplifies small moves. Scalp the pop and take profit fast before theta bleeds the premium.`,
  },
  discounted: {
    chips: ['CHEAP PREMIUM', 'ASYMMETRIC', 'VALUE'],
    text: (t) =>
      `Premium is mispriced relative to the projected move. Implied vol is underpricing the expected ${t} range, giving an asymmetric payout if the move materializes.`,
  },
  rebounds: {
    chips: ['OVERSOLD', 'STRUCTURE SUPPORT', 'MEAN REVERSION'],
    text: (t, k) =>
      `${t} is oversold near key support at ${k}. Price has compressed into a structure floor where dealer hedging creates a natural bounce zone. Reversal probability is elevated.`,
  },
  'whale-sweeps': {
    chips: ['BLOCK PRINTS', 'SMART MONEY', 'ACCUMULATION'],
    text: (t, k) =>
      `Repeated large sweep orders are accumulating ${t} exposure near ${k}. Following the institutional footprint — size and persistence of prints suggest informed positioning.`,
  },
  all: {
    chips: ['MULTI-SIGNAL', 'COMPOSITE', 'BROAD SCAN'],
    text: (t, k) =>
      `${t} at ${k} qualifies across multiple scanner criteria. Composite scoring aggregates trend alignment, premium value, and flow signals into a single unified ranking.`,
  },
};

// ---- premium / greeks model ----------------------------------------------
function estimatePremium(spot: number, strike: number, right: OptionRight, iv: number): number {
  const intrinsic = right === 'C' ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
  const moneyness = (strike - spot) / spot;
  const timeValue = spot * iv * 0.06 * Math.exp(-Math.pow(moneyness * 22, 2) / 2);
  return Math.max(0.05, intrinsic + timeValue);
}

function healthFor(spot: number, strike: number, right: OptionRight): number {
  // Calls: healthier ITM (low strike). Puts: healthier ITM (high strike).
  const moneyness = (strike - spot) / spot; // + above spot
  const base = right === 'C' ? 50 - moneyness * 900 : 50 + moneyness * 900;
  return Math.round(clamp(base, 22, 78));
}

function momentumFromHealth(health: number): Momentum {
  if (health >= 56) return 'STRENGTHENING';
  if (health >= 45) return 'NEUTRAL';
  return 'WEAKENING';
}

function actionFromHealth(health: number): ChainAction {
  if (health >= 56) return 'HOLD';
  if (health >= 45) return 'REDUCE';
  return 'SELL';
}

// ---- setup builder --------------------------------------------------------
function buildTakeProfits(mid: number, profile: ScannerProfile, rng: () => number, verdict: Verdict): TakeProfit[] {
  const ladders = [0.3, 0.8, 1.5, 2.5].map(p => p * (0.8 + profile.moveBias * 0.3));
  const progress = rng();
  // Progress only exists on active recommendations — a WATCH/EXIT setup was
  // never entered, so nothing can be HIT or IN PROGRESS.
  const active = verdict === 'ENTER';
  return ladders.map((pct, i): TakeProfit => {
    let status: TakeProfitStatus = 'PENDING';
    if (active) {
      if (progress > 0.66 && i === 0) status = 'HIT';
      else if (i === 0 || (i === 1 && progress > 0.4)) status = 'IN PROGRESS';
    }
    return {
      level: i + 1,
      status,
      expectedPct: Math.round(pct * 100),
      target: Number((mid * (1 + pct)).toFixed(2)),
    };
  });
}

export function makeSetup(
  ticker: string,
  spot: number,
  strike: number,
  right: OptionRight,
  scanner: ScannerKey,
  iv: number
): Setup {
  const profile = PROFILES[scanner];
  const rng = mulberry(hash(`${ticker}-${strike}-${right}-${scanner}`));
  const strikeLabel = strike % 1 === 0 ? strike.toFixed(0) : strike.toFixed(2);
  const contract = `${ticker} ${strikeLabel}${right}`;

  const mid = Number(estimatePremium(spot, strike, right, iv).toFixed(2));
  const spread = Math.max(0.02, mid * 0.03);
  const bid = Number((mid - spread / 2).toFixed(2));
  const ask = Number((mid + spread / 2).toFixed(2));
  const liveMid = Number((mid * (0.9 + rng() * 0.2)).toFixed(2));

  const health = clamp(healthFor(spot, strike, right) + Math.round((rng() - 0.5) * 12), 5, 99);
  const momentum = momentumFromHealth(health);

  // Opportunity score: near-the-money + aligned with the ticker's lean scores highest;
  // far-OTM or opposed contracts score low, so verdict spans ENTER / WATCH / EXIT.
  const bullish = tickerLean(ticker, scanner);
  const aligned = bullish ? right === 'C' : right === 'P';
  const proximity = 1 - Math.min(1, Math.abs(strike - spot) / (spot * 0.03));
  const score = Math.round(
    clamp(96 * (0.4 + 0.6 * proximity) * (aligned ? 1 : 0.55) + (rng() - 0.5) * 8, 8, 99)
  );
  const expectedMovePct = Number((profile.moveBias * (24 + rng() * 22)).toFixed(1));

  const greeks = Simulator.getGreeks(spot, strike, 0.01, iv);
  const delta = right === 'C' ? greeks.deltaCall : greeks.deltaPut;
  const verdict: Verdict = score >= 88 ? 'ENTER' : score >= 72 ? 'WATCH' : 'EXIT';

  const why = WHY_LIBRARY[scanner];
  const headline =
    verdict === 'ENTER'
      ? `STRONG ${right === 'C' ? 'CALL' : 'PUT'} — ENTER NOW`
      : verdict === 'WATCH'
        ? 'BUILDING — WAIT FOR TRIGGER'
        : 'FADING — STAND ASIDE';

  // Liquidity: derive from bid/ask spread
  const spreadPct = mid > 0 ? ((ask - bid) / mid) * 100 : 0;
  const liquidityLabel: 'Tight' | 'Normal' | 'Wide' = spreadPct <= 2 ? 'Tight' : spreadPct <= 5 ? 'Normal' : 'Wide';
  const liquiditySpread = `${spreadPct.toFixed(1)}% spread`;

  // Invalidation: nearest support/resistance based on direction
  const invalidationOffset = spot * (0.008 + rng() * 0.012); // 0.8–2% away
  const invalidationPrice = right === 'C'
    ? Number((spot - invalidationOffset).toFixed(2))     // calls invalidate below
    : Number((spot + invalidationOffset).toFixed(2));     // puts invalidate above
  const invalidationReasons = [
    'Dealer buy-wall support',
    'Gamma concentration floor',
    'Dark-pool accumulation level',
    'Key open-interest cluster',
  ];
  const invalidationReason = invalidationReasons[Math.floor(rng() * invalidationReasons.length)];

  return {
    id: `${ticker}-${strikeLabel}-${right}-${scanner}`,
    ticker,
    contract,
    right,
    strike,
    expiry: profile.expiry,
    score,
    verdict,
    topRated: score >= 93,
    topOpportunity: score >= 90,
    expectedMovePct,
    swingTarget: { price: Number((mid * (1 + profile.swingMul)).toFixed(2)), pct: Math.round(profile.swingMul * 100) },
    scalpExit: { price: Number((mid * (1 + profile.scalpMul)).toFixed(2)), pct: Math.round(profile.scalpMul * 100) },
    headline,
    whyChips: why.chips,
    whyText: why.text(ticker, strike),
    greeks: {
      delta: Number(delta.toFixed(2)),
      gamma: Number(greeks.gamma.toFixed(4)),
      theta: Number((-Math.abs(greeks.vega) * 0.4 - rng() * 4).toFixed(2)),
      vega: Number(greeks.vega.toFixed(2)),
      iv: Number((iv * 100).toFixed(1)),
    },
    bid,
    ask,
    mid,
    liveMid,
    confidence: Math.round(clamp((score - 55) * 2.1, 5, 98)),
    health,
    momentum,
    takeProfits: buildTakeProfits(mid, profile, rng, verdict),
    liquidityLabel,
    liquiditySpread,
    invalidationPrice,
    invalidationReason,
  };
}

// ---- feed / groups --------------------------------------------------------
function buildSparkline(ticker: string, spot: number): number[] {
  const rng = mulberry(hash(`${ticker}-spark`));
  const out: number[] = [];
  let p = spot * 0.994;
  for (let i = 0; i < 24; i++) {
    p += (rng() - 0.47) * spot * 0.002;
    out.push(Number(p.toFixed(2)));
  }
  out.push(spot);
  return out;
}

/** Deterministic directional lean per ticker+scanner. Shared by feed and monitor. */
function tickerLean(ticker: string, scanner: ScannerKey): boolean {
  return mulberry(hash(`${ticker}-${scanner}-group`))() > 0.42;
}

function buildGroup(ticker: string, spot: number, iv: number, step: number, scanner: ScannerKey): SetupGroup | null {
  const bullish = tickerLean(ticker, scanner);
  const candidates: Setup[] = [];

  // Sample a handful of near-the-money strikes on the favored side
  for (let i = 0; i <= 3; i++) {
    const right: OptionRight = bullish ? 'C' : 'P';
    const strike = Math.round((spot + (bullish ? i : -i) * step) / step) * step;
    const setup = makeSetup(ticker, spot, strike, right, scanner, iv);
    if (setup.score >= PROFILES[scanner].scoreFloor) candidates.push(setup);
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  const setups = candidates.slice(0, 2);
  const sparkline = buildSparkline(ticker, spot);
  const changePct = ((sparkline[sparkline.length - 1] - sparkline[0]) / sparkline[0]) * 100;

  return { ticker, spot, sparkline, changePct: Number(changePct.toFixed(2)), found: setups.length, setups };
}

// ---- contract chain -------------------------------------------------------
function buildChain(snapshot: MarketSnapshot, iv: number): ContractChain {
  const { ticker, spot, chain } = snapshot;
  const sorted = [...chain].sort((a, b) => a.strike - b.strike);
  const spotIdx = sorted.findIndex(n => n.strike >= spot);
  const start = Math.max(0, spotIdx - 6);
  const window = sorted.slice(start, start + 12);

  const rows: ChainRow[] = window.map(node => {
    const callHealth = healthFor(spot, node.strike, 'C');
    const putHealth = healthFor(spot, node.strike, 'P');
    const callRng = mulberry(hash(`${ticker}-${node.strike}-C-chain`));
    const putRng = mulberry(hash(`${ticker}-${node.strike}-P-chain`));
    return {
      strike: node.strike,
      call: {
        premium: Number(estimatePremium(spot, node.strike, 'C', iv).toFixed(2)),
        // Centered noise so OTM strikes can print red — a change column that
        // can never go negative reads fake.
        changePct: Math.round(clamp((spot - node.strike) / spot * 800 + (callRng() - 0.35) * 30, -60, 130)),
        health: callHealth,
        momentum: momentumFromHealth(callHealth),
        action: actionFromHealth(callHealth),
      },
      put: {
        premium: Number(estimatePremium(spot, node.strike, 'P', iv).toFixed(2)),
        changePct: Math.round(clamp((node.strike - spot) / spot * 800 + (putRng() - 0.35) * 30, -60, 130)),
        health: putHealth,
        momentum: momentumFromHealth(putHealth),
        action: actionFromHealth(putHealth),
      },
    };
  });

  return { ticker, spot, rows };
}

// ---- impact leaderboard ---------------------------------------------------
function buildImpact(snapshot: MarketSnapshot): ImpactRow[] {
  const { ticker, spot, chain } = snapshot;
  const totalGamma = chain.reduce((a, n) => a + Math.abs(n.netGex), 0) || 1;
  const rows = chain.flatMap(node => {
    // Delta notional in $B: shares of exposure × spot at ~0.5 avg delta
    const mk = (right: OptionRight, oi: number, gammaScale: number): Omit<ImpactRow, 'rank'> => ({
      contract: `${ticker} ${node.strike % 1 === 0 ? node.strike.toFixed(0) : node.strike.toFixed(2)}${right}`,
      expiry: '0DTE',
      openInterest: oi,
      volume: Math.round(oi * (0.3 + (hash(`${node.strike}${right}`) % 50) / 100)),
      deltaNotional: Number(((oi * 100 * spot * 0.5) / 1e9).toFixed(2)),
      gamma: Number(((Math.abs(node.netGex) / totalGamma) * 100 * gammaScale).toFixed(1)),
    });
    return [mk('C', node.callOI, 0.45), mk('P', node.putOI, 0.38)];
  });
  return rows
    .sort((a, b) => b.gamma - a.gamma)
    .slice(0, 8)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

// ---- top-level assembly ---------------------------------------------------
export function buildSkyVision(snapshot: MarketSnapshot, scanner: ScannerKey): SkyVisionData {
  // Curated watchlist plus whatever ticker is currently active
  const feedTickers = Array.from(new Set([snapshot.ticker, ...Simulator.WATCHLIST]));

  const groups: SetupGroup[] = [];
  for (const t of feedTickers) {
    Simulator.ensureTicker(t);
    const cfg = Simulator.TICKERS[t];
    const group = buildGroup(t, cfg.currentPrice, cfg.iv, cfg.step, scanner);
    if (group) groups.push(group);
  }
  groups.sort((a, b) => (b.setups[0]?.score ?? 0) - (a.setups[0]?.score ?? 0));

  const totalFound = groups.reduce((a, g) => a + g.found, 0);
  const activeIv = Simulator.TICKERS[snapshot.ticker].iv;

  return {
    scanner,
    groups,
    totalFound,
    shown: totalFound,
    chain: buildChain(snapshot, activeIv),
    impact: buildImpact(snapshot),
  };
}
