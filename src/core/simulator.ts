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
  StrikeNode,
  TapeOrder,
  TickerConfig,
  TickerSymbol,
  TradePlan,
} from '../types/market';

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

    // Charm (Delta decay)
    const charmCall = -Np_d1 * (r / (v * Math.sqrt(t)) - d2 / (2 * t));
    const charmPut = charmCall + r * Math.exp(-r * t);

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

  // Configured Tick States — core tickers with hand-set params
  const TICKERS: Record<string, TickerConfig> = {
    SPY: { basePrice: 500, currentPrice: 500, iv: 0.15, step: 1 },
    QQQ: { basePrice: 440, currentPrice: 440, iv: 0.18, step: 1 },
    AAPL: { basePrice: 190, currentPrice: 190, iv: 0.20, step: 0.5 },
    NVDA: { basePrice: 120, currentPrice: 120, iv: 0.35, step: 0.5 }
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

  // Seed a historical price buffer with realistic values
  function seedHistory(sym: string): void {
    const cfg = TICKERS[sym];
    let p = cfg.basePrice;
    priceHistory[sym] = [];
    for (let i = 0; i < historyLimit; i++) {
      p += (Math.random() - 0.5) * cfg.step * 0.5;
      priceHistory[sym].push(p);
    }
    cfg.currentPrice = Number(p.toFixed(2));
    seedCandles(sym);
  }

  // Seed a multi-session OHLC candle buffer walking back from the current price.
  // Sessions are one calendar day apart (overnight gap) so daily/weekly
  // aggregation produces sensible bars.
  function seedCandles(sym: string): void {
    const cfg = TICKERS[sym];
    const nowSec = Math.floor(Date.now() / 1000);
    const alignedNow = nowSec - (nowSec % BAR_SECONDS);
    const overnightGap = 86400 - (SESSION_BARS - 1) * BAR_SECONDS; // jump to same slot, prev day
    const bars: Candle[] = [];
    let close = cfg.currentPrice;
    let t = alignedNow;

    // Build newest→oldest, then reverse
    for (let s = 0; s < SESSIONS; s++) {
      for (let i = 0; i < SESSION_BARS; i++) {
        const range = cfg.basePrice * cfg.iv * 0.0035 * (0.4 + Math.random());
        const open = close + (Math.random() - 0.5) * range;
        const high = Math.max(open, close) + Math.random() * range * 0.5;
        const low = Math.min(open, close) - Math.random() * range * 0.5;
        bars.push({
          time: t,
          open: Number(open.toFixed(2)),
          high: Number(high.toFixed(2)),
          low: Number(low.toFixed(2)),
          close: Number(close.toFixed(2)),
          volume: Math.round(2000 + Math.random() * 18000),
        });
        close = open;
        t -= i === SESSION_BARS - 1 ? overnightGap : BAR_SECONDS;
      }
      // Overnight price gap between sessions
      close += (Math.random() - 0.5) * cfg.basePrice * cfg.iv * 0.02;
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
        volume: Math.round(1500 + Math.random() * 9000),
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
      last.volume += Math.round(500 + Math.random() * 4000);

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
      const basePrice = Number((15 + (h % 58500) / 100).toFixed(2)); // ~15..600
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

    // TTM Squeeze Approximation: Bollinger Bands inside Keltner Channel
    const slice = prices.slice(-20);
    const sma20 = slice.reduce((a, b) => a + b, 0) / 20;
    const variance = slice.reduce((a, b) => a + Math.pow(b - sma20, 2), 0) / 20;
    const stdDev = Math.sqrt(variance);
    const atrProxy = stdDev * 0.9; // Simplified range proxy

    const bbUpper = sma20 + 2 * stdDev;
    const bbLower = sma20 - 2 * stdDev;
    const kUpper = sma20 + 1.5 * atrProxy;
    const kLower = sma20 - 1.5 * atrProxy;

    const squeeze = (bbUpper < kUpper) && (bbLower > kLower);

    return { rsi, ema9, ema21, ema50, squeeze };
  }

  // Generate Strike-by-Strike Chain
  function generateOptionsChain(tickerKey: TickerSymbol, spotOverride?: number): StrikeNode[] {
    const config = TICKERS[tickerKey];
    const spot = spotOverride ?? config.currentPrice;
    const step = config.step;
    const iv = config.iv;

    const strikes: StrikeNode[] = [];
    const baseStrike = Math.round(spot / step) * step;
    const strikeRange = 15;

    for (let i = -strikeRange; i <= strikeRange; i++) {
      const strike = baseStrike + i * step;

      const distance = Math.abs(strike - spot) / spot;
      const baseOI = Math.max(100, Math.round(20000 * Math.exp(-Math.pow(distance * 15, 2))));

      let callOI = Math.round(baseOI * (i > 0 ? 1.4 : 0.8));
      let putOI = Math.round(baseOI * (i < 0 ? 1.6 : 0.7));

      if (strike % (step * 5) === 0) {
        callOI = Math.round(callOI * 2.2);
        putOI = Math.round(putOI * 2.5);
      }

      const t = 0.003; // 0DTE
      const greeks = calculateGreeks(spot, strike, t, iv);

      const dealerCallDirection = -0.4; // Net short calls
      const dealerPutDirection = -0.6;  // Net short puts

      const callGex = callOI * 100 * greeks.gamma * spot * spot * 0.01 * dealerCallDirection;
      const putGex = putOI * 100 * greeks.gamma * spot * spot * 0.01 * dealerPutDirection * -1;

      const netGex = callGex + putGex;

      const callDex = callOI * 100 * greeks.deltaCall * spot * dealerCallDirection;
      const putDex = putOI * 100 * greeks.deltaPut * spot * dealerPutDirection;
      const netDex = callDex + putDex;

      const callVex = callOI * 100 * greeks.vega * dealerCallDirection;
      const putVex = putOI * 100 * greeks.vega * dealerPutDirection;
      const netVex = callVex + putVex;

      strikes.push({
        strike,
        callOI,
        putOI,
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

  // Generate Sky's Vision Plan
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

    let flipStrike = spot;
    for (let i = 1; i < chain.length; i++) {
      if (Math.sign(chain[i - 1].netGex) !== Math.sign(chain[i].netGex)) {
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
    const confidence = Math.abs(score - 50) * 2 + 50;

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

      const drift = 0.02 * (Math.random() - 0.48);
      const volatility = config.iv * 0.15;
      const shock = Math.random() > 0.98 ? (Math.random() - 0.5) * 3 : 1;

      let deltaPrice = (drift + (Math.random() - 0.5) * volatility * shock) * config.basePrice * 0.01;
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
          ? Math.floor(Math.random() * 2) + 1
          : Math.random() > 0.45
            ? Math.floor(Math.random() * 2) + 1
            : 0;
      for (let i = 0; i < count; i++) {
        const offset = (Math.floor(Math.random() * 7) - 3) * cfg.step;
        const strike = Math.round(cfg.currentPrice / cfg.step) * cfg.step + offset;
        tape.push({
          time: new Date().toLocaleTimeString(),
          ticker: sym,
          strike: strike.toFixed(2),
          type: Math.random() > 0.5 ? 'C' : 'P',
          size: Math.floor(Math.random() * 250) + 10,
          orderType: Math.random() > 0.65 ? 'SWEEP' : 'BLOCK',
          side: Math.random() > 0.48 ? 'ASK' : 'BID'
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
      const count = Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        const offset = (Math.floor(Math.random() * 7) - 3) * cfg.step;
        const strike = Math.round(cfg.currentPrice / cfg.step) * cfg.step + offset;
        tape.push({
          time: new Date().toLocaleTimeString(),
          ticker: key,
          strike: strike.toFixed(2),
          type: Math.random() > 0.5 ? 'C' : 'P',
          size: Math.floor(Math.random() * 250) + 10,
          orderType: Math.random() > 0.65 ? 'SWEEP' : 'BLOCK',
          side: Math.random() > 0.48 ? 'ASK' : 'BID',
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
    tick,
    getGreeks: calculateGreeks
  };
})();

export default Simulator;
