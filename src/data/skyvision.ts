/*
==================================================
  SLAYER TERMINAL - SKY'S VISION ENGINE (skyvision.ts)
  Placeholder advisory model. Deterministic per contract
  so rows stay stable across ticks. Swap this whole file
  for the real quant engine / ThetaData feed later.
==================================================
*/

import Simulator from '../core/simulator';
import {
  SCAN_UNIVERSE_SIZE,
  buildScanUniverse,
  scanEpoch,
  scanNameFor,
  scanSparkline,
  type ScanName,
} from '../core/scanUniverse';
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

/*
  Score floors, calibrated against the WIDE field (see core/scanUniverse.ts).
  With four names and four strikes a floor was a formality — everything the
  generator produced was near-the-money and trend-aligned, so nothing was ever
  rejected and the floor's only job was to not fire. Over ~9,000 candidates it
  is the actual gate, so each one now has to mean something:

  - The five selective scanners keep their bars. A high floor across a wide
    field is exactly what "the best setups in the market" asks for — the field
    got two orders of magnitude bigger, so the bar should not come down.
  - 'all' drops 65 → 8, the score clamp's own minimum, i.e. no bar at all. Its
    blurb promises "every setup across all scanners" and now it means it: its
    count IS the field. Nothing about the rows changes — the screen shows the
    top of the ranking either way — but the number beside the tab stops being
    an arbitrary subset of a field the user was never shown.

  A note on what the floors do NOT decide. The EXIT verdict needs a score under
  72, and no contract scoring under 72 is ever going to be in the top 240 of
  9,000. That is not a floor problem and lowering one will not fix it: a scanner
  ranks opportunities, so its feed is the head of the distribution by
  construction. EXIT reaches a screen through Tracker, which rebuilds a setup
  the user already carries — which is the only place a "fading" read is
  actionable anyway.
*/
const PROFILES: Record<ScannerKey, ScannerProfile> = {
  'top-setups': { expiry: '0DTE', swingMul: 0.38, scalpMul: 0.18, moveBias: 1.0, scoreFloor: 84 },
  'quick-scalp': { expiry: '0DTE', swingMul: 0.22, scalpMul: 0.1, moveBias: 0.7, scoreFloor: 82 },
  discounted: { expiry: '1DTE', swingMul: 0.6, scalpMul: 0.28, moveBias: 1.35, scoreFloor: 78 },
  rebounds: { expiry: '1DTE', swingMul: 0.45, scalpMul: 0.22, moveBias: 1.15, scoreFloor: 76 },
  'whale-sweeps': { expiry: '0DTE', swingMul: 0.42, scalpMul: 0.2, moveBias: 1.1, scoreFloor: 83 },
  all: { expiry: '0DTE', swingMul: 0.38, scalpMul: 0.18, moveBias: 1.0, scoreFloor: 8 },
};

export function scannerFloor(scanner: ScannerKey): number {
  return PROFILES[scanner].scoreFloor;
}

// Thesis prose is DIRECTIONAL — a put setup must never carry a buy-wall
// "protective floor under our entry" story. Each scanner supplies a bull and
// a bear variant; the setup's right picks which one renders.
const WHY_LIBRARY: Record<ScannerKey, { chips: string[]; text: (t: string, k: number, bullish: boolean) => string }> = {
  'top-setups': {
    chips: ['TREND ALIGNED', 'DEALER SUPPORT', 'RSI CONFIRM'],
    text: (t, k, bullish) =>
      bullish
        ? `Solid institutional buy walls are supporting price at ${k}. Market makers are heavily short this strike and must buy ${t} to stay hedged, forming an automatic protective floor under our entry.`
        : `Heavy institutional supply caps price at ${k}. Market makers unload ${t} delta into every push toward the strike, forming an automatic ceiling pressing on each bounce.`,
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
    text: (t, k, bullish) =>
      bullish
        ? `${t} is oversold near key support at ${k}. Price has compressed into a structure floor where dealer hedging creates a natural bounce zone. Reversal probability is elevated.`
        : `${t} is overbought into key resistance at ${k}. Price has stretched into a structure ceiling where dealer hedging leans against the move. Rejection probability is elevated.`,
  },
  'whale-sweeps': {
    chips: ['BLOCK PRINTS', 'SMART MONEY', 'ACCUMULATION'],
    text: (t, k, bullish) =>
      bullish
        ? `Repeated large sweep orders are accumulating ${t} upside exposure near ${k}. Following the institutional footprint — size and persistence of prints suggest informed positioning.`
        : `Repeated large sweep orders are stacking ${t} downside protection near ${k}. Following the institutional footprint — size and persistence of prints suggest informed hedging or an outright short lean.`,
  },
  all: {
    chips: ['MULTI-SIGNAL', 'COMPOSITE', 'BROAD SCAN'],
    text: (t, k) =>
      `${t} at ${k} qualifies across multiple scanner criteria. Composite scoring aggregates trend alignment, premium value, and flow signals into a single unified ranking.`,
  },
};

// ---- premium / greeks model ----------------------------------------------
/** DTE for a profile expiry label; 0DTE floors at half a trading day. */
function dteOf(expiry: string): number {
  return expiry === '0DTE' ? 0.5 : 1;
}

/** Intrinsic + normal-shaped time value with a REAL √T term, so a 0DTE
    contract prices cheaper than a 1DTE and OTM decay width scales with vol. */
function estimatePremium(spot: number, strike: number, right: OptionRight, iv: number, dte: number): number {
  const t = Math.max(0.5, dte) / 252;
  const width = iv * Math.sqrt(t);
  const m = Math.log(strike / spot) / (width || 1e-6);
  const timeValue = spot * width * 0.4 * Math.exp(-(m * m) / 2);
  const intrinsic = right === 'C' ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
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

// ---- opportunity score ----------------------------------------------------
/*
  ONE definition of the score, shared by the cheap prescreen and the full
  builder. The scan ranks ~9,000 candidates per sweep but materialises only the
  few hundred it shows, so the score has to be computable without paying for
  greeks, prose and a take-profit ladder. Keeping the arithmetic here — rather
  than copied into a fast path — is what makes the two provably agree, and
  scanUniverse.test.ts asserts it on a grid.
*/

/** How hard a contract facing the tape is marked down. */
const COUNTER_TREND_MULT = 0.72;
/** Half-width of the per-contract jitter, in score points. */
const JITTER_HALF = 4;
/** Ceiling a counter-trend contract can reach — an exact bound, used to prune. */
export const COUNTER_TREND_CEILING = 96 * COUNTER_TREND_MULT + JITTER_HALF;

/**
 * Near-the-money and aligned with the ticker's lean scores highest; far-OTM or
 * opposed contracts score low, so the verdict spans ENTER / WATCH / EXIT.
 * `jitter01` is the candidate's third RNG draw.
 */
function scoreOf(spot: number, strike: number, aligned: boolean, jitter01: number): number {
  const proximity = 1 - Math.min(1, Math.abs(strike - spot) / (spot * 0.03));
  return Math.round(
    clamp(
      96 * (0.4 + 0.6 * proximity) * (aligned ? 1 : COUNTER_TREND_MULT) + (jitter01 - 0.5) * (JITTER_HALF * 2),
      8,
      99
    )
  );
}

/**
 * The score a full makeSetup() would produce, without building the setup.
 * Burns the same first three draws off the same seeded stream, so the number is
 * identical rather than merely close.
 */
export function prescreenScore(
  ticker: string,
  spot: number,
  strike: number,
  right: OptionRight,
  scanner: ScannerKey,
  aligned: boolean
): number {
  const rng = mulberry(hash(`${ticker}-${strike}-${right}-${scanner}`));
  rng(); // live mid
  rng(); // health
  return scoreOf(spot, strike, aligned, rng());
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

/**
 * `leanBullish` lets the scan hand in a lean it already knows. Without it the
 * builder reads the ticker's candle buffer, and reading a candle buffer for a
 * name the simulator has never seen registers it — 78ms of session seeding, and
 * a permanent seat in the 1.5s tick loop. Fine for the handful of contracts a
 * user opens; ruinous for a five-hundred-name sweep.
 */
export function makeSetup(
  ticker: string,
  spot: number,
  strike: number,
  right: OptionRight,
  scanner: ScannerKey,
  iv: number,
  leanBullish?: boolean
): Setup {
  const profile = PROFILES[scanner];
  const rng = mulberry(hash(`${ticker}-${strike}-${right}-${scanner}`));
  const strikeLabel = strike % 1 === 0 ? strike.toFixed(0) : strike.toFixed(2);
  const contract = `${ticker} ${strikeLabel}${right}`;

  const dte = dteOf(profile.expiry);
  const mid = Number(estimatePremium(spot, strike, right, iv, dte).toFixed(2));
  // Spread widens with distance from spot and 0DTE urgency — liquidity is a
  // real variable here, not a constant 3% decoration
  const otmDist = Math.abs(strike - spot) / spot;
  const spreadPctModel = clamp(1.2 + otmDist * 180 + (dte <= 0.5 ? 0.6 : 0), 0.8, 7);
  const spread = Math.max(0.02, mid * (spreadPctModel / 100));
  const bid = Number((mid - spread / 2).toFixed(2));
  const ask = Number((mid + spread / 2).toFixed(2));
  const liveMid = Number((mid * (0.9 + rng() * 0.2)).toFixed(2));

  const health = clamp(healthFor(spot, strike, right) + Math.round((rng() - 0.5) * 12), 5, 99);
  const momentum = momentumFromHealth(health);

  const bullish = leanBullish ?? tickerLean(ticker, scanner);
  const aligned = bullish ? right === 'C' : right === 'P';
  const score = scoreOf(spot, strike, aligned, rng());
  // ±1σ expected move of the UNDERLYING over the contract's life — real math
  // (iv·√t), not a decorative random percentage
  const expectedMovePct = Number((iv * Math.sqrt(Math.max(0.5, dte) / 252) * 100).toFixed(1));

  const greeks = Simulator.getGreeks(spot, strike, Math.max(0.5, dte) / 252, iv);
  const delta = right === 'C' ? greeks.deltaCall : greeks.deltaPut;
  const verdict: Verdict = score >= 88 ? 'ENTER' : score >= 72 ? 'WATCH' : 'EXIT';

  const why = WHY_LIBRARY[scanner];
  // Observational headlines only — the engine describes what the signal shows,
  // it never instructs the user to place an order ("enter now" is off-limits).
  const headline =
    verdict === 'ENTER'
      ? `STRONG ${right === 'C' ? 'CALL' : 'PUT'} — CONDITIONS ALIGNED`
      : verdict === 'WATCH'
        ? 'BUILDING — UNCONFIRMED'
        : 'FADING — LOW CONVICTION';

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
    whyText: why.text(ticker, strike, right === 'C'),
    greeks: {
      delta: Number(delta.toFixed(2)),
      gamma: Number(greeks.gamma.toFixed(4)),
      theta: Number((-(mid - Math.max(right === 'C' ? spot - strike : strike - spot, 0)) / (2 * Math.max(0.5, dte))).toFixed(2)),
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

/** Directional lean per ticker+scanner, read from the ACTUAL tape — hour
    momentum plus day direction — so "TREND ALIGNED" means what it says.
    Mean-reversion scanners (rebounds) fade the trend instead of following it. */
function tickerLean(ticker: string, scanner: ScannerKey): boolean {
  const candles = Simulator.getCandles(ticker) ?? [];
  const n = candles.length;
  if (n < 120) return true;
  const last = candles[n - 1].close;
  const hourAgo = candles[n - 61].close;
  const dayAgo = candles[Math.max(0, n - 391)].close;
  const up = last - hourAgo + 0.5 * (last - dayAgo) >= 0;
  return scanner === 'rebounds' ? !up : up;
}

/** Same read for a scan-universe name, off its own session path — no candle
    buffer, so no simulator registration. Rebounds still fade the trend. */
function scanLean(name: ScanName, scanner: ScannerKey): boolean {
  const up = name.live ? tickerLean(name.ticker, 'top-setups') : name.trendUp;
  return scanner === 'rebounds' ? !up : up;
}

/** Bars in one session — the span both sparkline sources cover, so a live name
    and a scanned one are showing the same window of time. */
const SESSION_BARS = 390;

/** A live name's group traces its ACTUAL bars, so the feed's sparkline and the
    chart the user opens next are the same session. Only a handful of names are
    live, so reading the buffer costs nothing at sweep scale. */
function liveSparkline(ticker: string, spot: number, points = 24): number[] {
  const candles = Simulator.getCandles(ticker) ?? [];
  if (candles.length < SESSION_BARS) return [];
  const stride = Math.floor(SESSION_BARS / points);
  const out: number[] = new Array(points + 1);
  for (let i = 0; i < points; i++) out[i] = candles[candles.length - 1 - (points - i) * stride].close;
  out[points] = spot;
  return out;
}

/*
  ---- the sweep ------------------------------------------------------------
  Strikes either side of spot on BOTH rights, so a bearish tape can still
  surface a call and the ranking is a real choice rather than a formality.
  Nine strikes x two rights x the scan universe is the field; what the screen
  shows is the top of it.
*/
const STRIKE_OFFSETS = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
const RIGHTS: OptionRight[] = ['C', 'P'];

/** Candidates per name per sweep. */
export const CANDIDATES_PER_NAME = STRIKE_OFFSETS.length * RIGHTS.length;

/*
  Display caps. The scan ranks thousands; these decide how much of that ranking
  reaches the DOM. The table wants depth — hundreds of rows to sort — while the
  card view renders a header, a sparkline and N cards per group, so the group
  count is the expensive axis and the row count is not.
*/
const DISPLAY_CAP = 240;
const GROUP_CAP = 40;
const PER_TICKER_CAP = 8;

interface Candidate {
  name: ScanName;
  strike: number;
  right: OptionRight;
  score: number;
  /** The scanner's read on the name — carried so stage two need not re-derive it */
  leanBullish: boolean;
}

interface Feed {
  groups: SetupGroup[];
  /** Candidates that cleared the scanner's floor across the whole field */
  totalFound: number;
  /** Setups actually materialised for the screen */
  shown: number;
}

/**
 * Rank the field, then build only what shows.
 *
 * Stage one prices nothing: it burns three RNG draws per candidate and keeps
 * the score. Stage two builds full Setups — greeks, prose, take-profit ladder —
 * for the few hundred that survive a single GLOBAL sort. The old code did the
 * opposite (build everything, then cap two per ticker before any cross-ticker
 * comparison), which is why the market's third-best setup lost its seat to a
 * weaker one on a different name.
 */
function buildFeed(scanner: ScannerKey, activeTicker: string, epoch: number, size: number): Feed {
  const floor = PROFILES[scanner].scoreFloor;
  const universe = buildScanUniverse(epoch, size);
  // Whatever the user is looking at is always in the field, even when it sits
  // outside the ranked pool.
  const names = universe.some(n => n.ticker === activeTicker)
    ? universe
    : [scanNameFor(activeTicker, epoch), ...universe];

  // A contract facing the tape cannot beat this, ever — so when the floor sits
  // above it, the whole counter-trend half of the field is skipped rather than
  // scored and discarded. Exact bound, not a heuristic.
  const skipCounterTrend = COUNTER_TREND_CEILING < floor;

  const survivors: Candidate[] = [];
  for (const name of names) {
    const bullish = scanLean(name, scanner);
    for (const right of RIGHTS) {
      const aligned = bullish ? right === 'C' : right === 'P';
      if (!aligned && skipCounterTrend) continue;
      for (const k of STRIKE_OFFSETS) {
        const strike = Math.round((name.spot + k * name.step) / name.step) * name.step;
        const score = prescreenScore(name.ticker, name.spot, strike, right, scanner, aligned);
        if (score >= floor) survivors.push({ name, strike, right, score, leanBullish: bullish });
      }
    }
  }

  // One global sort — the whole point. Ties break on ticker then strike so the
  // order is a function of the field, not of iteration luck.
  survivors.sort(
    (a, b) =>
      b.score - a.score ||
      (a.name.ticker < b.name.ticker ? -1 : a.name.ticker > b.name.ticker ? 1 : 0) ||
      a.strike - b.strike ||
      (a.right < b.right ? -1 : a.right > b.right ? 1 : 0)
  );

  // Admit down the ranking. Per-ticker and group caps stop one name owning the
  // board and keep the card view a list rather than a document.
  const admitted = new Map<string, Candidate[]>();
  let shown = 0;
  for (const c of survivors) {
    if (shown >= DISPLAY_CAP) break;
    const bucket = admitted.get(c.name.ticker);
    if (!bucket) {
      if (admitted.size >= GROUP_CAP) continue;
      admitted.set(c.name.ticker, [c]);
    } else {
      if (bucket.length >= PER_TICKER_CAP) continue;
      bucket.push(c);
    }
    shown++;
  }

  // Setups are built on first read, not on admission. Five of the six builds a
  // sweep runs exist only to put a number on a scanner tab — they count groups
  // and never open one, so materialising 240 contracts for each of them would
  // be 5/6ths of the work thrown away. Rank is already known from stage one, so
  // the sort below costs nothing either.
  const groups: SetupGroup[] = [];
  for (const [ticker, bucket] of admitted) {
    const { name } = bucket[0];
    let built: Setup[] | null = null;
    const live = name.live ? liveSparkline(ticker, name.spot) : [];
    const sparkline = live.length ? live : scanSparkline(ticker, name.spot, epoch);
    // The feed tints the sparkline by changePct, so the number has to be the
    // line's own slope — otherwise a rising line can print red.
    const changePct = ((sparkline[sparkline.length - 1] - sparkline[0]) / sparkline[0]) * 100;
    groups.push({
      ticker,
      spot: name.spot,
      sparkline,
      changePct: Number(changePct.toFixed(2)),
      found: bucket.length,
      get setups(): Setup[] {
        return (built ??= bucket.map(c =>
          makeSetup(ticker, name.spot, c.strike, c.right, scanner, name.iv, c.leanBullish)
        ));
      },
    });
  }
  const best = new Map(groups.map(g => [g.ticker, admitted.get(g.ticker)![0].score]));
  groups.sort((a, b) => best.get(b.ticker)! - best.get(a.ticker)!);

  return { groups, totalFound: survivors.length, shown };
}

// One sweep drives six scanner builds (the active pane plus five tab counts),
// and Compass re-enters every tick for the contract chain. Keyed on the epoch,
// so the repeats are free and the field is identical across all six.
const feedCache = new Map<string, Feed>();
const FEED_CACHE_MAX = 12;

function cachedFeed(scanner: ScannerKey, activeTicker: string, epoch: number, size: number): Feed {
  const key = `${scanner}|${activeTicker}|${epoch}|${size}`;
  const hit = feedCache.get(key);
  if (hit) return hit;
  const built = buildFeed(scanner, activeTicker, epoch, size);
  if (feedCache.size >= FEED_CACHE_MAX) feedCache.delete(feedCache.keys().next().value as string);
  feedCache.set(key, built);
  return built;
}

/** Drops the memoised sweeps. Tests use it to measure a cold build. */
export function resetSkyVisionCache(): void {
  feedCache.clear();
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
        premium: Number(estimatePremium(spot, node.strike, 'C', iv, 1).toFixed(2)),
        // Centered noise so OTM strikes can print red — a change column that
        // can never go negative reads fake.
        changePct: Math.round(clamp((spot - node.strike) / spot * 800 + (callRng() - 0.35) * 30, -60, 130)),
        health: callHealth,
        momentum: momentumFromHealth(callHealth),
        action: actionFromHealth(callHealth),
      },
      put: {
        premium: Number(estimatePremium(spot, node.strike, 'P', iv, 1).toFixed(2)),
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
function buildImpact(snapshot: MarketSnapshot, expiry: string): ImpactRow[] {
  const { ticker, spot, chain } = snapshot;
  const totalGamma = chain.reduce((a, n) => a + Math.abs(n.netGex), 0) || 1;
  const rows = chain.flatMap(node => {
    // Delta notional in $B: shares of exposure × spot at ~0.5 avg delta
    const mk = (right: OptionRight, oi: number, gammaScale: number): Omit<ImpactRow, 'rank'> => ({
      contract: `${ticker} ${node.strike % 1 === 0 ? node.strike.toFixed(0) : node.strike.toFixed(2)}${right}`,
      expiry,
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

/** Pins the sweep to a fixed epoch. Tests use it; the app leaves it alone. */
export interface SkyVisionOptions {
  epoch?: number;
  universeSize?: number;
}

/**
 * The feed is behind a getter on purpose. Compass rebuilds this object every
 * 1.5s purely to read `.chain` — the contract chain is meant to breathe with
 * price — and paying for a five-hundred-name sweep to reach a twelve-row
 * ladder would put the scan on the render path. Touch `.groups` and you get
 * the sweep; touch `.chain` and you get the chain.
 */
export function buildSkyVision(
  snapshot: MarketSnapshot,
  scanner: ScannerKey,
  options: SkyVisionOptions = {}
): SkyVisionData {
  const epoch = options.epoch ?? scanEpoch();
  const size = options.universeSize ?? SCAN_UNIVERSE_SIZE;
  const activeIv = Simulator.TICKERS[snapshot.ticker]?.iv ?? 0.2;
  const feed = () => cachedFeed(scanner, snapshot.ticker, epoch, size);

  return {
    scanner,
    get groups() {
      return feed().groups;
    },
    /** Everything the scanner's floor let through, across the whole field. */
    get totalFound() {
      return feed().totalFound;
    },
    /** What the caps let onto the screen. */
    get shown() {
      return feed().shown;
    },
    chain: buildChain(snapshot, activeIv),
    impact: buildImpact(snapshot, PROFILES[scanner].expiry),
  };
}
