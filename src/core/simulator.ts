/*
==================================================
  SLAYER TERMINAL - SIMULATION ENGINE (simulator.ts)
  Options Physics, Greeks Math, & Live Ticker Feed
==================================================
*/

import type {
  Candle,
  GexSnapshot,
  Greeks,
  Indicators,
  MarketSnapshot,
  OpenInterest,
  StrikeNode,
  TapeOrder,
  TickerConfig,
  TickerSymbol,
  TradePlan,
} from '../types/market';
import { lookup as universeLookup } from '../data/universe';
// rng.ts imports nothing, so this cannot cycle. (scanUniverse.ts is the one
// module this file must never import: that dependency runs the other way, and
// the cycle surfaces as `undefined` at module init rather than as a type error.)
import { dayKey } from './rng';
import { etTime, isoDate, isTradingDay, today } from './calendar';
import { expiryCalendar, listingConvention } from './expiryCalendar';

/** The session date settled open interest represents: the last trading day
    strictly before today. OI publishes ~06:30 ET for the PRIOR session's close,
    so this is the honest "as of" for every OI the simulator emits. Computed once. */
const OI_SETTLED_ASOF: string = (() => {
  const d = today();
  do {
    d.setDate(d.getDate() - 1);
  } while (!isTradingDay(d));
  return isoDate(d);
})();

/** Wrap a raw open-interest count as a SETTLED figure. The simulator has no
    intraday estimator (that is a later phase), so every OI it emits is the prior
    session's settled value. Source: ThetaData daily open_interest. */
export function settledOI(value: number): OpenInterest {
  return { value, asOf: OI_SETTLED_ASOF, freshness: 'SETTLED' };
}

const Simulator = (() => {
  // Math Helpers
  function normalCDF(x: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989422804 * Math.exp(-x * x / 2);
    const p = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return x >= 0 ? 1 - d * p : d * p;
  }

  function normalPDF(x: number): number {
    return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
  }

  // Black-Scholes Greeks Calculator
  // S: Spot, K: Strike, t: Time to expiry in years, v: Implied Volatility, r: Risk-free rate
  function calculateGreeks(S: number, K: number, t: number, v: number, r = 0.05): Greeks {
    if (t <= 0) t = 0.0001; // Avoid division by zero
    if (v <= 0) v = 0.01;

    const d1 = (Math.log(S / K) + (r + (v * v) / 2) * t) / (v * Math.sqrt(t));
    const d2 = d1 - v * Math.sqrt(t);

    const Nd1 = normalCDF(d1);
    const Np_d1 = normalPDF(d1);

    // Delta
    const deltaCall = Nd1;
    const deltaPut = Nd1 - 1;

    // Gamma (same for call/put)
    const gamma = Np_d1 / (S * v * Math.sqrt(t));

    // Vega (same for call/put)
    const vega = (S * Math.sqrt(t) * Np_d1) / 100; // Divided by 100 to show price change per 1% vol change

    // Vanna
    const vanna = -Np_d1 * d2 / v;

    // Charm (Delta decay). With no dividend yield modeled (q = 0), put charm
    // equals call charm exactly — deltaPut = deltaCall − 1, a constant apart,
    // so their time-decay is identical. (A nonzero adjustment only appears
    // with a dividend yield: charmPut = charmCall + q·e^(−qt).)
    const charmCall = -Np_d1 * (r / (v * Math.sqrt(t)) - d2 / (2 * t));
    const charmPut = charmCall;

    return {
      deltaCall,
      deltaPut,
      gamma,
      vega,
      vanna,
      charmCall,
      charmPut
    };
  }

  // Configured Tick States — core tickers with hand-set params. Equity base
  // prices are sourced from the shared universe so the live desks and the
  // research pages (Stocks/News/Earnings/Compass) show the same price for the
  // same name; SPY/QQQ are ETFs outside that universe and keep their own refs.
  const aaplPx = universeLookup('AAPL')?.px ?? 232.4;
  const nvdaPx = universeLookup('NVDA')?.px ?? 138.6;
  const TICKERS: Record<string, TickerConfig> = {
    SPY: { basePrice: 500, currentPrice: 500, iv: 0.15, step: 1 },
    QQQ: { basePrice: 440, currentPrice: 440, iv: 0.18, step: 1 },
    AAPL: { basePrice: aaplPx, currentPrice: aaplPx, iv: 0.20, step: 0.5 },
    NVDA: { basePrice: nvdaPx, currentPrice: nvdaPx, iv: 0.35, step: 0.5 }
  };

  /** Core watchlist that always populates the opportunity feed. */
  const WATCHLIST = ['SPY', 'QQQ', 'AAPL', 'NVDA'];

  let activeTicker = 'SPY';
  const priceHistory: Record<string, number[]> = {};
  const historyLimit = 100;

  // OHLC candle state — one rolling multi-session series per ticker
  const candleHistory: Record<string, Candle[]> = {};
  const candleTickCount: Record<string, number> = {};
  const BAR_SECONDS = 60; // 1-minute base bars
  const TICKS_PER_BAR = 4; // each simulated bar aggregates 4 ticks
  const SESSION_BARS = 390; // ~6.5h session at 1-min bars
  const SESSIONS = 22; // ~1 month of sessions seeded up front
  const CANDLE_LIMIT = SESSIONS * SESSION_BARS + 600;

  // Net-GEX-per-strike snapshots, parallel to candleHistory but only kept for
  // recent sessions — the node overlay is an intraday feature.
  const gexHistory: Record<string, GexSnapshot[]> = {};
  const RECENT_GEX_BARS = 6 * SESSION_BARS;
  const GEX_LIMIT = RECENT_GEX_BARS + 600;

  function symbolHash(sym: string): number {
    let h = 2166136261;
    for (let i = 0; i < sym.length; i++) {
      h ^= sym.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // ---- seeded per-symbol RNG --------------------------------------------------
  // The terminal is designed to be reproducible ("the same seed always paints
  // the same tape" — core/rng.ts). Every stochastic draw below comes from a
  // per-symbol mulberry32 stream seeded from the symbol and the calendar day,
  // so a reload replays the identical month of candles and session tape.
  //
  // The day comes from `dayKey()`, the same function the twenty research
  // modules use. It used to be `Math.floor(Date.now() / 86400000)`, which is a
  // UTC boundary while `dayKey()` reads the LOCAL date — so west of Greenwich
  // the terminal had two new-day events. Reload after 5pm Pacific and every
  // candle regenerated while the scanners, news and dossiers stayed on the
  // previous draw; reload again at local midnight and the reverse happened.
  // Both halves are arbitrary generated data, which is exactly why nothing
  // caught it: neither one looks wrong on its own.
  const daySeed = symbolHash(dayKey());
  const rngStreams: Record<string, () => number> = {};
  function mulberry32(a: number): () => number {
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rand(sym: string): number {
    let s = rngStreams[sym];
    if (!s) s = rngStreams[sym] = mulberry32(symbolHash(sym) ^ Math.imul(daySeed, 2654435761));
    return s();
  }

  // Seed a historical price buffer with realistic values
  function seedHistory(sym: string): void {
    const cfg = TICKERS[sym];
    let p = cfg.basePrice;
    priceHistory[sym] = [];
    for (let i = 0; i < historyLimit; i++) {
      p += (rand(sym) - 0.5) * cfg.step * 0.5;
      priceHistory[sym].push(p);
    }
    cfg.currentPrice = Number(p.toFixed(2));
    seedCandles(sym);
  }

  /** Markets don't trade weekends — sessions must land on weekdays only. */
  function isWeekend(sec: number): boolean {
    const d = new Date(sec * 1000).getUTCDay();
    return d === 0 || d === 6;
  }

  // Seed a multi-session OHLC candle buffer walking back from the current price.
  // Sessions sit one TRADING day apart (weekends skipped) so daily/weekly
  // aggregation produces sensible bars.
  function seedCandles(sym: string): void {
    const cfg = TICKERS[sym];
    const nowSec = Math.floor(Date.now() / 1000);
    let alignedNow = nowSec - (nowSec % BAR_SECONDS);
    while (isWeekend(alignedNow)) alignedNow -= 86400; // anchor the live session to a weekday
    const overnightGap = 86400 - (SESSION_BARS - 1) * BAR_SECONDS; // jump to same slot, prev day
    const bars: Candle[] = [];
    let close = cfg.currentPrice;
    let t = alignedNow;

    // Build newest→oldest, then reverse
    for (let s = 0; s < SESSIONS; s++) {
      for (let i = 0; i < SESSION_BARS; i++) {
        const range = cfg.basePrice * cfg.iv * 0.0035 * (0.4 + rand(sym));
        const open = close + (rand(sym) - 0.5) * range;
        const high = Math.max(open, close) + rand(sym) * range * 0.5;
        const low = Math.min(open, close) - rand(sym) * range * 0.5;
        bars.push({
          time: t,
          open: Number(open.toFixed(2)),
          high: Number(high.toFixed(2)),
          low: Number(low.toFixed(2)),
          close: Number(close.toFixed(2)),
          volume: Math.round(2000 + rand(sym) * 18000),
        });
        close = open;
        if (i === SESSION_BARS - 1) {
          t -= overnightGap;
          while (isWeekend(t)) t -= 86400; // skip Sat/Sun when crossing sessions
        } else {
          t -= BAR_SECONDS;
        }
      }
      // Overnight price gap between sessions
      close += (rand(sym) - 0.5) * cfg.basePrice * cfg.iv * 0.02;
    }

    bars.reverse();
    candleHistory[sym] = bars;
    candleTickCount[sym] = 0;

    // GEX snapshots only for the most recent sessions (intraday overlay)
    const gexStart = Math.max(0, bars.length - RECENT_GEX_BARS);
    gexHistory[sym] = bars.slice(gexStart).map(b => computeGexSnapshot(sym, b.close, b.time));
  }

  // Net GEX (all-expiry proxy) per strike at a given price, captured as one snapshot
  function computeGexSnapshot(sym: string, spot: number, time: number): GexSnapshot {
    const chain = generateOptionsChain(sym, spot);
    return { time, levels: chain.map(n => ({ strike: n.strike, value: n.netGex })) };
  }

  // Fold the latest tick into the current bar; roll a new bar every TICKS_PER_BAR ticks
  function updateCandles(sym: string): void {
    const bars = candleHistory[sym];
    if (!bars || bars.length === 0) return;
    const price = TICKERS[sym].currentPrice;
    const count = (candleTickCount[sym] = (candleTickCount[sym] ?? 0) + 1);
    const last = bars[bars.length - 1];
    const gh = gexHistory[sym];

    if (count % TICKS_PER_BAR === 0) {
      const time = last.time + BAR_SECONDS;
      bars.push({
        time,
        open: last.close,
        high: Math.max(last.close, price),
        low: Math.min(last.close, price),
        close: price,
        volume: Math.round(1500 + rand(sym) * 9000),
      });
      if (bars.length > CANDLE_LIMIT) bars.shift();

      if (gh) {
        gh.push(computeGexSnapshot(sym, price, time));
        if (gh.length > GEX_LIMIT) gh.shift();
      }
    } else {
      last.close = price;
      last.high = Math.max(last.high, price);
      last.low = Math.min(last.low, price);
      last.volume += Math.round(500 + rand(sym) * 4000);

      // Keep the forming bar's node snapshot live — only for the visible (active) ticker
      if (gh && gh.length && sym === activeTicker) {
        gh[gh.length - 1] = computeGexSnapshot(sym, price, gh[gh.length - 1].time);
      }
    }
  }

  /** Register a config for any symbol on demand (synthesized for non-core tickers). */
  function ensureTicker(symbolRaw: string): string {
    const sym = symbolRaw.toUpperCase();
    if (!TICKERS[sym]) {
      const h = symbolHash(sym);
      // Prefer the shared universe's reference price so a name shown on the
      // research desks reads the same here; fall back to a hashed price for the
      // long tail of searchable tickers the universe doesn't list.
      const basePrice = universeLookup(sym)?.px ?? Number((15 + (h % 58500) / 100).toFixed(2)); // ~15..600
      const iv = 0.15 + ((h >>> 5) % 45) / 100; // ~0.15..0.60
      const step = basePrice >= 100 ? 1 : 0.5;
      TICKERS[sym] = { basePrice, currentPrice: basePrice, iv, step };
    }
    if (!priceHistory[sym]) seedHistory(sym);
    return sym;
  }

  // Seed the core watchlist
  WATCHLIST.forEach(seedHistory);

  // Calculate Indicators
  function getIndicators(prices: number[]): Indicators {
    const len = prices.length;
    if (len < 50) return { rsi: 50, ema9: prices[len - 1], ema21: prices[len - 1], ema50: prices[len - 1], squeeze: false };

    // EMA
    const calcEMA = (period: number, prevEMA: number, curPrice: number): number => {
      const k = 2 / (period + 1);
      return curPrice * k + prevEMA * (1 - k);
    };

    let ema9 = prices[0];
    let ema21 = prices[0];
    let ema50 = prices[0];

    for (let i = 1; i < len; i++) {
      ema9 = calcEMA(9, ema9, prices[i]);
      ema21 = calcEMA(21, ema21, prices[i]);
      ema50 = calcEMA(50, ema50, prices[i]);
    }

    // RSI (14)
    let gains = 0;
    let losses = 0;
    for (let i = len - 14; i < len; i++) {
      const diff = prices[i] - prices[i - 1];
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    let rsi = 50;
    if (losses === 0) rsi = 100;
    else if (gains !== 0) {
      const rs = (gains / 14) / (losses / 14);
      rsi = 100 - (100 / (1 + rs));
    }

    // TTM-style squeeze: volatility compression — the recent 20-tick dispersion
    // sits well inside the longer-run dispersion. (The classic BB-inside-KC test
    // is unsatisfiable when the Keltner "ATR" is derived from the SAME stdDev:
    // 2σ < 1.35σ can never hold. The channel needs an independent, longer
    // baseline, which is what the full-buffer dispersion provides here.)
    const slice = prices.slice(-20);
    const sma20 = slice.reduce((a, b) => a + b, 0) / 20;
    const variance = slice.reduce((a, b) => a + Math.pow(b - sma20, 2), 0) / 20;
    const stdDev = Math.sqrt(variance);
    const smaAll = prices.reduce((a, b) => a + b, 0) / len;
    const varAll = prices.reduce((a, b) => a + Math.pow(b - smaAll, 2), 0) / len;
    const squeeze = stdDev < Math.sqrt(varAll) * 0.72;

    return { rsi, ema9, ema21, ema50, squeeze };
  }

  /**
   * A price series that ends at `spot`, derived rather than remembered.
   *
   * Only `buildSnapshotAt` uses this. The live `priceHistory` is a rolling buffer
   * that `tick()` rewrites, so anything reading it inherits the wall clock; this
   * is a pure function of (symbol, spot, regime day), which is what makes a
   * pinned snapshot actually pinned. Shape matches the live seeding — a drift
   * with per-bar texture — so the indicators come out in the same range.
   */
  function pinnedHistory(tickerKey: TickerSymbol, spot: number, regimeDay: number): number[] {
    const cfg = TICKERS[tickerKey];
    const key = `${tickerKey}:pin:${spot.toFixed(2)}:${regimeDay}`;
    const out: number[] = [];
    for (let i = 0; i < historyLimit; i++) {
      const u = i / (historyLimit - 1);
      const noise = ((symbolHash(`${key}:${i}`) % 1000) / 1000 - 0.5) * cfg.step * 1.6;
      // Older bars sit below, so the series arrives at spot rather than wandering
      // to it — the same "walked up into the level" shape the live seeding has.
      out.push(Number((spot - (1 - u) * cfg.step * 5 + noise).toFixed(2)));
    }
    out[out.length - 1] = spot;
    return out;
  }

  // Generate Strike-by-Strike Chain
  function generateOptionsChain(tickerKey: TickerSymbol, spotOverride?: number, regimeDayOverride?: number): StrikeNode[] {
    const config = TICKERS[tickerKey];
    const spot = spotOverride ?? config.currentPrice;
    const step = config.step;
    const iv = config.iv;

    const strikes: StrikeNode[] = [];
    const baseStrike = Math.round(spot / step) * step;
    // Chain-realistic, ticker-dependent width: an index or large ETF lists a
    // deep ladder, a single name a shallower one. Kept moderate so the panels
    // that read the whole chain do not regress — the exposure profile and the
    // matrix window around spot regardless of how many strikes exist.
    const conv = listingConvention(tickerKey);
    const strikeRange = conv === 'daily' ? 30 : conv === 'weekly' ? 22 : 16;
    // Time from the ticker's actual FRONT expiry, not a hardcoded 0DTE. A daily
    // root's front is ~0DTE; a monthlies-only name's is weeks out, so its gamma
    // is spread across strikes instead of spiked at the money. Every greek in
    // the chain is priced at this t.
    const t = expiryCalendar(tickerKey)[0].t;

    // Daily positioning regime: the price where customer call-overwriting supply
    // gives way to put-hedging demand. It pivots the OI skew — and therefore the
    // gamma flip — so the flip is a real structural level that sits away from
    // spot and moves day to day, not an artifact glued half a step above price.
    // Mostly a touch below spot (positive-gamma days), sometimes above.
    //
    // The day is overridable so a caller that must be reproducible can name the
    // session it is showing. Live desks pass nothing and get today's regime.
    const regimeDay = regimeDayOverride ?? Math.floor(Date.now() / 86400000);
    const regime01 = (symbolHash(`${tickerKey}:regime:${regimeDay}`) % 1000) / 1000;
    const pivot = spot * (1 + (regime01 * 0.014 - 0.011)); // −1.1% … +0.3% of spot

    for (let i = -strikeRange; i <= strikeRange; i++) {
      const strike = baseStrike + i * step;

      const distance = Math.abs(strike - spot) / spot;
      const baseOI = Math.max(100, Math.round(20000 * Math.exp(-Math.pow(distance * 15, 2))));

      // Per-strike positioning noise so the book has texture and the flip zone
      // is a zone, not a razor edge.
      const sh = symbolHash(`${tickerKey}:${strike.toFixed(2)}:oi`);
      const noiseC = 0.75 + ((sh % 1000) / 1000) * 0.5;
      const noiseP = 0.75 + (((sh >>> 10) % 1000) / 1000) * 0.5;

      let callOI = Math.round(baseOI * (strike > pivot ? 1.5 : 0.8) * noiseC);
      let putOI = Math.round(baseOI * (strike < pivot ? 1.5 : 0.7) * noiseP);

      if (strike % (step * 5) === 0) {
        callOI = Math.round(callOI * 2.2);
        putOI = Math.round(putOI * 2.2);
      }

      const greeks = calculateGreeks(spot, strike, t, iv);

      // Dealer book, standard convention: net LONG calls (customers overwrite
      // calls, dealers absorb them) and net SHORT puts (customers buy downside
      // hedges). Long-call gamma supports price (positive GEX); short-put gamma
      // amplifies it (negative GEX). Both legs' vega follow the same book.
      // Weights balanced so the BOOK TOTAL's sign follows the daily regime:
      // pivot below spot → call-supported book, net positive; pivot above →
      // put-dominated, net negative. Neither sign is structurally locked in.
      const dealerCallDirection = 0.5; // Net long calls
      const dealerPutDirection = -0.6; // Net short puts

      const callGex = callOI * 100 * greeks.gamma * spot * spot * 0.01 * dealerCallDirection;
      const putGex = putOI * 100 * greeks.gamma * spot * spot * 0.01 * dealerPutDirection;

      const netGex = callGex + putGex;

      // DEX uses the standard delta-weighted-OI display convention: call delta
      // is positive, put delta negative, so the profile reads call-heavy above /
      // put-heavy below without a dealer-direction overlay.
      const callDex = callOI * 100 * greeks.deltaCall * spot;
      const putDex = putOI * 100 * greeks.deltaPut * spot;
      const netDex = callDex + putDex;

      const callVex = callOI * 100 * greeks.vega * dealerCallDirection;
      const putVex = putOI * 100 * greeks.vega * dealerPutDirection;
      const netVex = callVex + putVex;

      strikes.push({
        strike,
        callOI: settledOI(callOI),
        putOI: settledOI(putOI),
        gamma: greeks.gamma,
        callGex,
        putGex,
        netGex,
        callDex,
        putDex,
        netDex,
        callVex,
        putVex,
        netVex,
        vanna: greeks.vanna,
        charm: (greeks.charmCall + greeks.charmPut) / 2
      });
    }

    return strikes;
  }

  // Generate Compass Plan
  function generateTradePlan(tickerKey: TickerSymbol, spot: number, chain: StrikeNode[], indicators: Indicators): TradePlan {
    const config = TICKERS[tickerKey];

    let supportWall = spot - config.step * 4;
    let resistanceWall = spot + config.step * 4;
    let maxPutGex = 0;
    let maxCallGex = 0;

    chain.forEach(node => {
      if (node.strike < spot && Math.abs(node.netGex) > maxPutGex) {
        maxPutGex = Math.abs(node.netGex);
        supportWall = node.strike;
      }
      if (node.strike > spot && Math.abs(node.netGex) > maxCallGex) {
        maxCallGex = Math.abs(node.netGex);
        resistanceWall = node.strike;
      }
    });

    // Gamma flip: first upward zero-crossing of the (3-strike smoothed) net-GEX
    // profile — put-dominated (negative) below, call-supported (positive) above.
    // Smoothing keeps a single noisy strike from faking the crossover.
    let flipStrike = spot;
    const smoothGex = (i: number) => {
      const a = chain[Math.max(0, i - 1)].netGex;
      const b = chain[i].netGex;
      const c = chain[Math.min(chain.length - 1, i + 1)].netGex;
      return (a + b + c) / 3;
    };
    for (let i = 1; i < chain.length; i++) {
      if (smoothGex(i - 1) < 0 && smoothGex(i) >= 0) {
        flipStrike = (chain[i - 1].strike + chain[i].strike) / 2;
        break;
      }
    }

    let score = 50;
    const isEmaAligned = (indicators.ema9 > indicators.ema21) && (indicators.ema21 > indicators.ema50);
    const isEmaBearish = (indicators.ema9 < indicators.ema21) && (indicators.ema21 < indicators.ema50);

    if (isEmaAligned) score += 20;
    if (isEmaBearish) score -= 20;

    if (indicators.rsi > 60) score += 15;
    if (indicators.rsi < 40) score -= 15;

    const inPositiveGex = spot > flipStrike;
    if (inPositiveGex) score += 15;
    else score -= 15;

    if (indicators.squeeze) score += 10;

    score = Math.max(10, Math.min(90, score));

    const direction = score >= 50 ? 'BULLISH' : 'BEARISH';
    // Conviction stays a true percentage: score ∈ [10, 90] maps to [50, 100].
    const confidence = 50 + Math.abs(score - 50) * 1.25;

    const entry = spot;
    let stopLoss = direction === 'BULLISH' ? supportWall - config.step * 0.5 : resistanceWall + config.step * 0.5;
    const target1 = direction === 'BULLISH' ? resistanceWall : supportWall;
    const target2 = direction === 'BULLISH' ? resistanceWall + config.step * 3 : supportWall - config.step * 3;

    const minDistance = spot * 0.005;
    if (Math.abs(entry - stopLoss) < minDistance) {
      stopLoss = direction === 'BULLISH' ? entry - minDistance : entry + minDistance;
    }

    return {
      ticker: tickerKey,
      direction,
      score,
      confidence: Math.round(confidence),
      entry: Number(entry.toFixed(2)),
      stopLoss: Number(stopLoss.toFixed(2)),
      target1: Number(target1.toFixed(2)),
      target2: Number(target2.toFixed(2)),
      flipZone: Number(flipStrike.toFixed(2)),
      supportWall: Number(supportWall.toFixed(2)),
      resistanceWall: Number(resistanceWall.toFixed(2))
    };
  }

  // Simulate one tick
  function tick(callback?: (data: MarketSnapshot) => void): void {
    Object.keys(TICKERS).forEach(ticker => {
      const config = TICKERS[ticker];
      const history = priceHistory[ticker];

      const drift = 0.02 * (rand(ticker) - 0.48);
      const volatility = config.iv * 0.15;
      const shock = rand(ticker) > 0.98 ? (rand(ticker) - 0.5) * 3 : 1;

      let deltaPrice = (drift + (rand(ticker) - 0.5) * volatility * shock) * config.basePrice * 0.01;
      deltaPrice = Math.max(-config.step * 2, Math.min(config.step * 2, deltaPrice));

      config.currentPrice = Number((config.currentPrice + deltaPrice).toFixed(2));

      history.push(config.currentPrice);
      if (history.length > historyLimit) {
        history.shift();
      }

      updateCandles(ticker);
    });

    const activeConfig = TICKERS[activeTicker];
    const chain = generateOptionsChain(activeTicker);
    const indicators = getIndicators(priceHistory[activeTicker]);
    const plan = generateTradePlan(activeTicker, activeConfig.currentPrice, chain, indicators);

    // Multi-ticker tape — the whole watchlist prints; the active symbol prints a touch more
    const tape: TapeOrder[] = [];
    const tapeTickers = Array.from(new Set([activeTicker, ...WATCHLIST]));
    for (const sym of tapeTickers) {
      const cfg = TICKERS[sym];
      const count =
        sym === activeTicker
          ? Math.floor(rand(sym) * 2) + 1
          : rand(sym) > 0.45
            ? Math.floor(rand(sym) * 2) + 1
            : 0;
      for (let i = 0; i < count; i++) {
        const offset = (Math.floor(rand(sym) * 7) - 3) * cfg.step;
        const strike = Math.round(cfg.currentPrice / cfg.step) * cfg.step + offset;
        tape.push({
          time: etTime(Date.now()),
          ticker: sym,
          strike: strike.toFixed(2),
          type: rand(sym) > 0.5 ? 'C' : 'P',
          size: Math.floor(rand(sym) * 250) + 10,
          orderType: rand(sym) > 0.65 ? 'SWEEP' : 'BLOCK',
          side: rand(sym) > 0.48 ? 'ASK' : 'BID'
        });
      }
    }

    if (callback) {
      callback({
        ticker: activeTicker,
        spot: activeConfig.currentPrice,
        changePercent: ((activeConfig.currentPrice - activeConfig.basePrice) / activeConfig.basePrice) * 100,
        priceHistory: priceHistory[activeTicker],
        chain,
        indicators,
        plan,
        tape
      });
    }
  }

  return {
    TICKERS,
    WATCHLIST,
    ensureTicker,
    setActiveTicker: (t: string): string => {
      activeTicker = ensureTicker(t);
      return activeTicker;
    },
    getActiveTicker: (): string => activeTicker,
    /** Live intraday OHLC bars (mutated in place each tick — treat as read-only). */
    getCandles: (sym: string): Candle[] => {
      const key = ensureTicker(sym);
      return candleHistory[key];
    },
    /** Net-GEX-per-strike snapshots parallel to the candle series (read-only). */
    getGexHistory: (sym: string): GexSnapshot[] => {
      const key = ensureTicker(sym);
      return gexHistory[key];
    },
    /**
     * Build a full MarketSnapshot for ANY symbol — the enabler for per-panel
     * independent tickers in the Pulse workspace. Prices for every ticker
     * already advance each tick(); this runs the same chain/indicator/plan
     * builders the active feed uses, for the requested symbol, plus a small
     * per-symbol tape slice. Every downstream view builder is pure (snapshot)
     * => view, so it works unchanged on a per-panel snapshot.
     */
    buildSnapshot: (sym: string): MarketSnapshot => {
      const key = ensureTicker(sym);
      const cfg = TICKERS[key];
      const chain = generateOptionsChain(key);
      const indicators = getIndicators(priceHistory[key]);
      const plan = generateTradePlan(key, cfg.currentPrice, chain, indicators);
      const tape: TapeOrder[] = [];
      const count = Math.floor(rand(key) * 3);
      for (let i = 0; i < count; i++) {
        const offset = (Math.floor(rand(key) * 7) - 3) * cfg.step;
        const strike = Math.round(cfg.currentPrice / cfg.step) * cfg.step + offset;
        tape.push({
          time: etTime(Date.now()),
          ticker: key,
          strike: strike.toFixed(2),
          type: rand(key) > 0.5 ? 'C' : 'P',
          size: Math.floor(rand(key) * 250) + 10,
          orderType: rand(key) > 0.65 ? 'SWEEP' : 'BLOCK',
          side: rand(key) > 0.48 ? 'ASK' : 'BID',
        });
      }
      return {
        ticker: key,
        spot: cfg.currentPrice,
        changePercent: ((cfg.currentPrice - cfg.basePrice) / cfg.basePrice) * 100,
        priceHistory: priceHistory[key],
        chain,
        indicators,
        plan,
        tape,
      };
    },
    /**
     * A snapshot pinned to a caller-supplied spot, with no tape and no RNG draw.
     *
     * `buildSnapshot` reads the live `currentPrice` and pulls from the symbol's
     * random stream to mint a tape slice, so two calls a tick apart return
     * different books — right for a live desk, fatal for anything that has to be
     * reproducible. Every field here is a pure function of (symbol, spot,
     * positioning regime): nothing is drawn, nothing is mutated, and calling it
     * leaves the live feed exactly where it was.
     *
     * That includes the price history, which is the part that is easy to get
     * wrong. Handing back `priceHistory[key]` looked harmless — the chain and the
     * walls do not read it — but `tick()` rewrites that array every 1.5 seconds,
     * so the indicators moved between two identical calls AND the array inside an
     * already-returned snapshot kept changing underneath its holder. A pinned
     * snapshot that aliases live state is not pinned. `pinnedHistory` synthesises
     * its own series instead, ending exactly at the requested spot.
     *
     * `regimeDay` pins the daily positioning regime (the OI pivot, and therefore
     * the gamma flip). Omit it for today's regime; pass one to name the session
     * being shown.
     */
    buildSnapshotAt: (sym: string, spot: number, regimeDay?: number): MarketSnapshot => {
      const key = ensureTicker(sym);
      const cfg = TICKERS[key];
      const day = regimeDay ?? Math.floor(Date.now() / 86400000);
      const chain = generateOptionsChain(key, spot, day);
      const history = pinnedHistory(key, spot, day);
      const indicators = getIndicators(history);
      return {
        ticker: key,
        spot,
        changePercent: ((spot - cfg.basePrice) / cfg.basePrice) * 100,
        priceHistory: history,
        chain,
        indicators,
        plan: generateTradePlan(key, spot, chain, indicators),
        tape: [],
      };
    },
    tick,
    getGreeks: calculateGreeks
  };
})();

export default Simulator;
