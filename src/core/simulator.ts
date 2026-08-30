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
import { blackScholesGreeks } from './greeks';
import { dayKey } from './rng';
import { pickFlip, pickWalls } from './walls';
import type { UniverseQuote } from '../types/compass';

const Simulator = (() => {
  // Math Helpers
  // Greeks math lives in core/greeks.ts now — shared with the scoring
  // engine so replay prices with byte-identical code.
  const calculateGreeks = blackScholesGreeks;

  // Configured Tick States — core tickers with hand-set params
  const TICKERS: Record<string, TickerConfig> = {
    SPY: { basePrice: 500, currentPrice: 500, iv: 0.15, step: 1 },
    QQQ: { basePrice: 440, currentPrice: 440, iv: 0.18, step: 1 },
    AAPL: { basePrice: 190, currentPrice: 190, iv: 0.20, step: 0.5 },
    NVDA: { basePrice: 120, currentPrice: 120, iv: 0.35, step: 0.5 }
  };

  /** Core watchlist that always populates the opportunity feed. */
  const WATCHLIST = ['SPY', 'QQQ', 'AAPL', 'NVDA'];

  /* The scan roster: famous optionable names the Compass board sweeps WITHOUT
     seeding them into the tick loop (registration costs ~0.6s of forward-simmed
     candles per name — twenty at once is a frozen terminal). Base prices are
     hand-set sim reference values, same idea as TICKERS above; a name promotes
     to a full TICKERS entry the first time the user actually opens it. */
  const SCAN_ROSTER: { ticker: string; px: number; iv: number }[] = [
    { ticker: 'TSLA', px: 248, iv: 0.48 },
    { ticker: 'META', px: 512, iv: 0.3 },
    { ticker: 'MSFT', px: 428, iv: 0.22 },
    { ticker: 'AMZN', px: 186, iv: 0.28 },
    { ticker: 'GOOGL', px: 172, iv: 0.26 },
    { ticker: 'AMD', px: 162, iv: 0.42 },
    { ticker: 'NFLX', px: 640, iv: 0.32 },
    { ticker: 'AVGO', px: 168, iv: 0.34 },
    { ticker: 'COIN', px: 245, iv: 0.55 },
    { ticker: 'PLTR', px: 28, iv: 0.5 },
    { ticker: 'JPM', px: 205, iv: 0.2 },
    { ticker: 'ORCL', px: 142, iv: 0.27 },
    { ticker: 'CRM', px: 262, iv: 0.29 },
    { ticker: 'UBER', px: 72, iv: 0.36 },
    { ticker: 'MU', px: 118, iv: 0.44 },
    { ticker: 'BA', px: 178, iv: 0.33 },
    { ticker: 'DIS', px: 92, iv: 0.25 },
    { ticker: 'INTC', px: 31, iv: 0.4 },
  ];

  /** Strike grid increment by price magnitude — the sim's convention. */
  function stepFor(price: number): number {
    if (price < 50) return 0.5;
    if (price < 150) return 1;
    if (price < 400) return 2.5;
    return 5;
  }

  /** Day-stable lightweight quote for an unregistered roster name. Reads the
      engine clock through dayKey, so a pinned replay re-derives it exactly. */
  function scanQuote(base: { ticker: string; px: number; iv: number }): UniverseQuote {
    const h = symbolHash(`${base.ticker}-${dayKey()}-uq`);
    const jitter = 1 + (((h % 1000) / 1000 - 0.5) * 0.06); // ±3%, day-stable
    const price = Number((base.px * jitter).toFixed(2));
    return { ticker: base.ticker, price, iv: base.iv, step: stepFor(price) };
  }

  let activeTicker = 'SPY';
  const priceHistory: Record<string, number[]> = {};
  const historyLimit = 100;

  // OHLC candle state — one rolling multi-session series per ticker
  const candleHistory: Record<string, Candle[]> = {};
  const candleTickCount: Record<string, number> = {};
  /* Time of the CURRENT session's first bar, per symbol — what tells the
     live roll when a session has run its SESSION_BARS and the next bar
     belongs to tomorrow. Set by seeding, advanced by the roll. */
  const sessionOpenTime: Record<string, number> = {};
  /*
    T-14 — THE SECONDS TAPE, live-only by construction.

    Each tick is one real price observation, and in tape time one tick is a
    quarter of a minute — so every tick appends exactly one 15-second bar,
    aligned to the minute grid (offsets 0/15/30/45). Seeding adds NONE: the
    region before boot has no sub-minute truth to offer, which is the same
    shape a real per-second WebSocket feed has (history starts at connect),
    and the honest design T-14 asks for — no backfill resampled from 1m
    bars wearing a sub-minute label.
  */
  const secondsHistory: Record<string, Candle[]> = {};
  /* Two sessions of quarters (4 per minute × 390 × 2) — written as the
     number because the constants it derives from are declared below. */
  const SECONDS_LIMIT = 3120;
  const BAR_SECONDS = 60; // 1-minute base bars
  const TICKS_PER_BAR = 4; // each simulated bar aggregates 4 ticks
  const SESSION_BARS = 390; // ~6.5h session at 1-min bars
  /* One calendar day minus the session — the jump between a session's last
     bar and the next session's first. Seeding and the LIVE roll below share
     this single definition so they cannot disagree about what a night is. */
  const OVERNIGHT_GAP_SECONDS = 86400 - (SESSION_BARS - 1) * BAR_SECONDS;
  const SESSIONS = 22; // ~1 month of sessions seeded up front
  const CANDLE_LIMIT = SESSIONS * SESSION_BARS + 600;

  // Net-GEX-per-strike snapshots, kept as deep as the candle buffer so the
  // chart's exposure trails cover the full visible history.
  const gexHistory: Record<string, GexSnapshot[]> = {};
  const RECENT_GEX_BARS = SESSIONS * SESSION_BARS;
  const GEX_LIMIT = RECENT_GEX_BARS + 600;

  function symbolHash(sym: string): number {
    let h = 2166136261;
    for (let i = 0; i < sym.length; i++) {
      h ^= sym.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /*
    Persistent OI book — the market's memory. Real open interest lives at a
    strike for days; it doesn't teleport to wherever price wanders. Each
    ticker keeps a per-strike OI ledger that drifts slowly toward the "fresh"
    ATM-centered profile (positioning migrates), breathes with order-flow
    noise, and decays once price leaves a strike far behind. Everything that
    reads a chain (matrix, trails, walls) reads THIS book, so walls persist,
    get tested, and fade for real instead of shadowing price.
  */
  interface BookEntry {
    callOI: number;
    putOI: number;
  }
  const oiBook: Record<string, Map<number, BookEntry>> = {};
  const BOOK_RANGE = 30; // strikes maintained each side of spot
  const BOOK_BLEND = 0.012; // per-bar migration toward the fresh profile (~1h half-life)

  // The profile OI drifts toward: ATM-concentrated, round-number magnets.
  function freshOI(strike: number, spot: number, step: number): BookEntry {
    const distance = Math.abs(strike - spot) / spot;
    const baseOI = Math.max(100, Math.round(20000 * Math.exp(-Math.pow(distance * 15, 2))));
    let callOI = Math.round(baseOI * (strike > spot ? 1.4 : 0.8));
    let putOI = Math.round(baseOI * (strike < spot ? 1.6 : 0.7));
    if (Math.round(strike / (step * 5)) * step * 5 === strike) {
      callOI = Math.round(callOI * 2.2);
      putOI = Math.round(putOI * 2.5);
    }
    return { callOI, putOI };
  }

  function evolveBook(sym: string, spot: number, blend = BOOK_BLEND): void {
    const cfg = TICKERS[sym];
    const step = cfg.step;
    let book = oiBook[sym];
    if (!book) {
      book = oiBook[sym] = new Map();
      blend = 1; // first call seeds the book outright
    }
    const base = Math.round(spot / step) * step;
    const alive = new Set<number>();
    for (let i = -BOOK_RANGE; i <= BOOK_RANGE; i++) {
      const strike = Number((base + i * step).toFixed(2));
      alive.add(strike);
      const want = freshOI(strike, spot, step);
      const cur = book.get(strike);
      if (!cur) {
        // a strike entering the tradable window starts small — OI builds, it doesn't teleport
        const scale = blend >= 1 ? 1 : 0.2;
        book.set(strike, {
          callOI: Math.round(want.callOI * scale),
          putOI: Math.round(want.putOI * scale),
        });
      } else {
        const flow = () => 1 + (Math.random() - 0.5) * 0.05; // order-flow breathing
        cur.callOI = Math.max(50, Math.round((cur.callOI + (want.callOI - cur.callOI) * blend) * flow()));
        cur.putOI = Math.max(50, Math.round((cur.putOI + (want.putOI - cur.putOI) * blend) * flow()));
      }
    }
    // strikes price left behind: positions unwind gradually, then fall away
    for (const [k, e] of book) {
      if (alive.has(k)) continue;
      e.callOI = Math.round(e.callOI * 0.985);
      e.putOI = Math.round(e.putOI * 0.985);
      if (e.callOI < 120 && e.putOI < 120) book.delete(k);
    }
  }

  /*
    GEX-aware price step — the feedback loop. The book shapes the walk:
      · heavy shelves are BARRIERS: a move that would punch through gets most
        of its overshoot absorbed (tests and bounces), with a rare clean
        break that runs;
      · the nearest strong shelf exerts a gentle PIN when price is close
        (grind-along-the-wall days);
      · between shelves ("no man's land") volatility runs freer.
    Gamma is approximated with a single Gaussian per strike so seeding stays
    fast; the display path keeps exact Black-Scholes.
  */
  function gexAwareStep(sym: string, price: number, scale = 1): number {
    const cfg = TICKERS[sym];
    const book = oiBook[sym];
    const step = cfg.step;
    if (!book) return (Math.random() - 0.5) * cfg.basePrice * cfg.iv * 0.0035;

    const sqT = Math.sqrt(0.003); // 0DTE horizon, matching the display chain
    const denom = Math.max(1e-6, price * cfg.iv * sqT);
    // reference wall: what a fully-loaded ATM round-number shelf computes to
    const refWall = (20000 * 2.4 * 100 * price * price * 0.01 * 0.54) / (2.5066 * denom);

    const base = Math.round(price / step) * step;
    let nearAbove: { strike: number; s: number } | null = null;
    let nearBelow: { strike: number; s: number } | null = null;
    let localNet = 0;
    for (let i = -8; i <= 8; i++) {
      const strike = Number((base + i * step).toFixed(2));
      const e = book.get(strike);
      if (!e) continue;
      const z = (strike - price) / denom;
      const gamma = Math.exp(-z * z / 2) / (2.5066 * denom);
      const v =
        e.callOI * 100 * gamma * price * price * 0.01 * -0.55 +
        e.putOI * 100 * gamma * price * price * 0.01 * 0.53;
      localNet += v;
      const s = Math.min(1, Math.abs(v) / refWall);
      if (s < 0.22) continue; // not a real shelf
      if (strike > price && (!nearAbove || strike < nearAbove.strike)) nearAbove = { strike, s };
      if (strike < price && (!nearBelow || strike > nearBelow.strike)) nearBelow = { strike, s };
    }

    // base random step; quiet zones (no shelf either side) run ~35% hotter
    const inNoMansLand = !nearAbove && !nearBelow;
    const range = cfg.basePrice * cfg.iv * 0.0035 * (0.4 + Math.random()) * (inNoMansLand ? 1.35 : 1);
    let move = (Math.random() - 0.5) * 2 * range * scale;

    // pin: the nearest strong shelf pulls when price is within ~2.5 strikes
    const magnet = [nearAbove, nearBelow]
      .filter((w): w is { strike: number; s: number } => w !== null)
      .sort((a, b) => Math.abs(a.strike - price) - Math.abs(b.strike - price))[0];
    if (magnet && Math.abs(magnet.strike - price) < step * 2.5) {
      move += (magnet.strike - price) * 0.05 * magnet.s;
    }

    // barrier: absorb most of any overshoot through a strong shelf; rare clean break
    const next = price + move;
    const wall = move > 0 ? nearAbove : nearBelow;
    if (wall && ((move > 0 && next > wall.strike) || (move < 0 && next < wall.strike))) {
      const breakout = Math.random() > 0.975;
      if (!breakout) {
        const through = next - wall.strike;
        move = wall.strike - price + through * (1 - 0.85 * wall.s);
      } else {
        move *= 1.6; // wall breaks: the move runs
      }
    }

    return move;
  }

  // Seed a historical price buffer + candles + GEX history for one symbol.
  function seedHistory(sym: string): void {
    seedCandles(sym);
    const closes = candleHistory[sym].map(b => b.close);
    priceHistory[sym] = closes.slice(-historyLimit);
  }

  // Forward-simulate a multi-session OHLC buffer from basePrice: price walks
  // THROUGH the evolving OI book (pins, tests, breaks), and every bar's GEX
  // snapshot is taken from the book as it stood at that moment. Sessions are
  // one calendar day apart so daily/weekly aggregation produces sensible bars.
  function seedCandles(sym: string): void {
    const cfg = TICKERS[sym];
    /* Late-seeded names join the CLOCK ALREADY RUNNING, not the wall clock:
       bar time advances ~15× wall speed (one 60s bar per 4 real ticks), so a
       name ensured mid-session and anchored to Date.now() would land its
       whole history deep in the veterans' past — its compare line ends a
       fifth of the way into the chart and never catches up (Noah,
       2026-08-23: "the iwm one looks far behind"). Anchor to the newest bar
       of any ticker already seeded; wall clock only for the very first. */
    const ref = Object.values(candleHistory).find(b => b && b.length > 0);
    const nowSec = ref ? ref[ref.length - 1].time : Math.floor(Date.now() / 1000);
    const alignedNow = nowSec - (nowSec % BAR_SECONDS);
    const overnightGap = OVERNIGHT_GAP_SECONDS;
    const totalSpanSec = SESSIONS * (SESSION_BARS - 1) * BAR_SECONDS + SESSIONS * overnightGap;
    const bars: Candle[] = [];
    const snaps: GexSnapshot[] = [];
    let close = cfg.basePrice;
    let t = alignedNow - totalSpanSec + overnightGap;

    /* Roster names must LAND on their scan quote: the board priced their
       cards off it, and a first click that seeds them 15% away opens the
       monitor on floor-priced garbage. A gentle homeward pull (0.15% of the
       remaining gap per bar) steers the walk to end ≈ basePrice while the
       book evolves ON the corrected path — wall physics stay coherent, and
       the watchlist keeps its unpulled drift (a feature: it reads live). */
    const homeK = SCAN_ROSTER.some(r => r.ticker === sym) ? 0.0015 : 0;

    evolveBook(sym, close, 1); // seed the book at the journey's start

    for (let s = 0; s < SESSIONS; s++) {
      sessionOpenTime[sym] = t; // by loop's end: the LAST session's open
      for (let i = 0; i < SESSION_BARS; i++) {
        const open = close;
        const move = gexAwareStep(sym, close);
        const pull = homeK > 0 ? (cfg.basePrice - close) * homeK : 0;
        close = Number((close + move + pull).toFixed(2));
        const wig = cfg.basePrice * cfg.iv * 0.0012 * Math.random();
        bars.push({
          time: t,
          open: Number(open.toFixed(2)),
          high: Number((Math.max(open, close) + wig).toFixed(2)),
          low: Number((Math.min(open, close) - wig).toFixed(2)),
          close,
          volume: Math.round(2000 + Math.random() * 18000),
        });
        evolveBook(sym, close);
        snaps.push(computeGexSnapshot(sym, close, t));
        t += BAR_SECONDS;
      }
      // overnight: gap the price, roll positions harder than intraday drift
      t += overnightGap - BAR_SECONDS;
      close = Number((close + (Math.random() - 0.5) * cfg.basePrice * cfg.iv * 0.02).toFixed(2));
      evolveBook(sym, close, 0.18);
    }

    /* Final-session taper (roster names only): the homeward pull gets the
       walk NEAR the quote; this closes the residual exactly, spread across
       the last session so no single bar jumps. The book evolved on the
       unadjusted path, so its strain is bounded by that residual (≈2%) over
       one session — versus 15% everywhere without it. First click now
       prices the SAME market the card did. */
    if (homeK > 0 && bars.length > 0) {
      const gap = Number((cfg.basePrice - close).toFixed(2));
      if (Math.abs(gap) > 0.005) {
        const K = Math.min(SESSION_BARS, bars.length);
        for (let j = 0; j < K; j++) {
          const b = bars[bars.length - K + j];
          const adjC = gap * ((j + 1) / K);
          const adjO = gap * (j / K);
          b.open = Number((b.open + adjO).toFixed(2));
          b.close = Number((b.close + adjC).toFixed(2));
          b.high = Number((b.high + Math.max(adjO, adjC)).toFixed(2));
          b.low = Number((b.low + Math.min(adjO, adjC)).toFixed(2));
        }
        close = cfg.basePrice;
      }
    }

    cfg.currentPrice = close;
    candleHistory[sym] = bars;
    candleTickCount[sym] = 0;
    gexHistory[sym] = snaps.slice(-GEX_LIMIT);
  }

  // Net GEX (all-expiry proxy) per strike at a given price, captured as one snapshot
  function computeGexSnapshot(sym: string, spot: number, time: number): GexSnapshot {
    const chain = generateOptionsChain(sym, spot);
    /* OI rides along with the gamma it explains (P-8) — same instant, same
       chain, so a ΔOI reading can never be timestamped away from the level
       it is meant to account for. */
    return {
      time,
      levels: chain.map(n => ({ strike: n.strike, value: n.netGex, callOI: n.callOI, putOI: n.putOI })),
    };
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
      /*
        THE SESSION ROLLS LIVE, exactly as it does in the seeded history.

        Before T-9 this branch appended bars at BAR_SECONDS forever, so the
        seeded tape had sessions and the live tape was one endless day — after
        ~26 wall-minutes of uptime (390 bars at ~4s each) every session-cut
        feature quietly starved: the session levels' "prior day" stopped
        advancing, and the expected-move cone's forward half stayed collapsed
        because RTH_MINUTES − elapsed never went positive again.

        A completed session gets the same overnight the seeder gives one: the
        time jumps by the shared gap, the price gaps by the same formula, and
        the book rolls harder than intraday drift (0.18 vs the tick's default)
        — one set of physics, written once above and reused here.
      */
      const opened = sessionOpenTime[sym];
      const rolls = opened !== undefined && last.time - opened >= (SESSION_BARS - 1) * BAR_SECONDS;
      let time: number;
      let open: number;
      if (rolls) {
        time = last.time + OVERNIGHT_GAP_SECONDS;
        sessionOpenTime[sym] = time;
        const cfg = TICKERS[sym];
        cfg.currentPrice = Number(
          (price + (Math.random() - 0.5) * cfg.basePrice * cfg.iv * 0.02).toFixed(2)
        );
        open = cfg.currentPrice;
        evolveBook(sym, open, 0.18);
      } else {
        time = last.time + BAR_SECONDS;
        open = last.close;
      }
      const barClose = TICKERS[sym].currentPrice;
      const rollVolume = Math.round(1500 + Math.random() * 9000);
      bars.push({
        time,
        open,
        high: Math.max(open, barClose),
        low: Math.min(open, barClose),
        close: barClose,
        volume: rollVolume,
      });
      if (bars.length > CANDLE_LIMIT) bars.shift();
      pushSecondsBar(sym, time, open, barClose, rollVolume);

      evolveBook(sym, barClose); // the book keeps living as new bars roll

      if (gh) {
        gh.push(computeGexSnapshot(sym, barClose, time));
        if (gh.length > GEX_LIMIT) gh.shift();
      }
    } else {
      const prevClose = last.close;
      const foldVolume = Math.round(500 + Math.random() * 4000);
      last.close = price;
      last.high = Math.max(last.high, price);
      last.low = Math.min(last.low, price);
      last.volume += foldVolume;
      /* The fold's quarter: offsets 15/30/45 into the forming minute. */
      pushSecondsBar(sym, last.time + (count % TICKS_PER_BAR) * 15, prevClose, price, foldVolume);

      // Keep the forming bar's node snapshot live — only for the visible (active) ticker
      if (gh && gh.length && sym === activeTicker) {
        gh[gh.length - 1] = computeGexSnapshot(sym, price, gh[gh.length - 1].time);
      }
    }
  }

  /** One tick, one 15-second bar — see the seconds-tape note above. */
  function pushSecondsBar(sym: string, time: number, open: number, close: number, volume: number): void {
    const ring = (secondsHistory[sym] ??= []);
    ring.push({ time, open, high: Math.max(open, close), low: Math.min(open, close), close, volume });
    if (ring.length > SECONDS_LIMIT) ring.shift();
  }

  /** Register a config for any symbol on demand (synthesized for non-core tickers). */
  function ensureTicker(symbolRaw: string): string {
    const sym = symbolRaw.toUpperCase();
    if (!TICKERS[sym]) {
      /* A roster name seeds FROM its roster quote — the scan board priced its
         cards off that quote, and a click that re-rolled the name to a hash
         price would grade a different market than the card the user clicked
         (the exact board-vs-panel schism documented in the partner's build). */
      const roster = SCAN_ROSTER.find(r => r.ticker === sym);
      if (roster) {
        const q = scanQuote(roster);
        TICKERS[sym] = { basePrice: q.price, currentPrice: q.price, iv: q.iv, step: q.step };
      } else {
        const h = symbolHash(sym);
        const basePrice = Number((15 + (h % 58500) / 100).toFixed(2)); // ~15..600
        const iv = 0.15 + ((h >>> 5) % 45) / 100; // ~0.15..0.60
        const step = basePrice >= 100 ? 1 : 0.5;
        TICKERS[sym] = { basePrice, currentPrice: basePrice, iv, step };
      }
    }
    if (!priceHistory[sym]) seedHistory(sym);
    return sym;
  }

  /* DECLARED BEFORE THE SEED LOOP BELOW, and that is load-bearing rather
     than tidy. `WATCHLIST.forEach(seedHistory)` runs at module
     initialisation and reaches generateOptionsChain, so a `const` declared
     further down is still in its temporal dead zone when the chain is first
     built — "Cannot access 'qGreek' before initialization", which
     type-checks perfectly and throws the moment the module loads. The
     proofs caught it; tsc could not. */
  /*
    QUANTISATION AND STRUCTURAL SHARING, and both halves are needed.

    THE MEASUREMENT THAT PROMPTED THIS. The site's jitter traces to a long
    task on every 1500ms tick; the tick's own work is 0.6ms, so the cost is
    the repaint the new snapshot forces. The snapshot's chain was measured
    changing on 7 ticks in 8 — but look at what was changing:

      475:1.3096195226730748e-13 -> 475:1.4021...e-13

    A gamma of 1.3e-13 at a far strike is numerically zero. It cannot move
    a pixel, it cannot move a dollar of exposure, and no reader will ever
    see it. Yet it made the strike "different", which made the chain
    different, which invalidated every layer downstream of it.

    QUANTISING ALONE WOULD NOT HAVE HELPED. A chart handed a fresh array
    redraws whether or not its contents match. So the two go together:
    round to a precision far finer than anything displayed, and then REUSE
    THE PREVIOUS OBJECT for any strike whose rounded values are identical.
    Unchanged strikes keep their reference, so a memoised consumer can bail
    out on identity, and when NO strike moved the whole array comes back as
    the same array.

    THE PRECISIONS ARE CHOSEN AGAINST WHAT IS DRAWN, with several orders of
    magnitude to spare. Per-share greeks are shown to four decimals and kept
    to ten; dollar exposures run to millions and are kept to the cent.
    Nothing that could change a rendered figure is rounded away — a strike
    whose gamma genuinely moves still reports a new object, every tick.
  */
  const qGreek = (v: number) => Math.round(v * 1e10) / 1e10;
  const qMoney = (v: number) => Math.round(v * 100) / 100;
  /** Last chain per ticker, so unchanged strikes can keep their identity. */
  const chainMemo = new Map<string, StrikeNode[]>();

  function sameStrike(a: StrikeNode, b: StrikeNode): boolean {
    return a.strike === b.strike && a.callOI === b.callOI && a.putOI === b.putOI
      && a.gamma === b.gamma && a.netGex === b.netGex && a.callGex === b.callGex
      && a.putGex === b.putGex && a.netDex === b.netDex && a.callDex === b.callDex
      && a.putDex === b.putDex && a.netVex === b.netVex && a.callVex === b.callVex
      && a.putVex === b.putVex && a.vanna === b.vanna && a.charm === b.charm
      && a.netVanna === b.netVanna && a.netCharm === b.netCharm;
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
    // 30 each side — the whole maintained book (BOOK_RANGE), so a ±30 window
    // on the ladder shows real rows, not a repeat of ±15 (Noah, 2026-08-22:
    // far strikes are where the tail hedges sit). The real feed carries the
    // full chain; this only costs the sim's seeding ~2× per name.
    const strikeRange = 30;
    if (!oiBook[tickerKey]) evolveBook(tickerKey, spot); // lazy seed for stray callers
    const book = oiBook[tickerKey];

    for (let i = -strikeRange; i <= strikeRange; i++) {
      const strike = Number((baseStrike + i * step).toFixed(2));

      // OI comes from the persistent book — walls have memory. Fallback for
      // strikes outside the maintained window (spot far from book center).
      const entry = book.get(strike) ?? freshOI(strike, spot, step);
      const callOI = entry.callOI;
      const putOI = entry.putOI;

      const t = 0.003; // 0DTE
      const greeks = calculateGreeks(spot, strike, t, iv);

      // Weights chosen so net GEX comes out two-sided with comparable
      // magnitudes: call-dominated shelves above spot ≈ −0.4·base, put
      // shelves below ≈ +0.4·base. The old −0.4/−0.6 split let the put side
      // outweigh calls ~4.5× everywhere, so negative walls never registered
      // anywhere in the terminal (heatmap, trails, positioning).
      const dealerCallDirection = -0.55; // Net short calls
      const dealerPutDirection = -0.53;  // Net short puts

      const callGex = callOI * 100 * greeks.gamma * spot * spot * 0.01 * dealerCallDirection;
      const putGex = putOI * 100 * greeks.gamma * spot * spot * 0.01 * dealerPutDirection * -1;

      const netGex = callGex + putGex;

      const callDex = callOI * 100 * greeks.deltaCall * spot * dealerCallDirection;
      const putDex = putOI * 100 * greeks.deltaPut * spot * dealerPutDirection;
      const netDex = callDex + putDex;

      const callVex = callOI * 100 * greeks.vega * dealerCallDirection;
      const putVex = putOI * 100 * greeks.vega * dealerPutDirection;
      const netVex = callVex + putVex;

      /* VANNA and CHARM given the same treatment as the three above, so the
         rail can put all five on one ruler. Vanna is d(delta)/d(vol), so
         x spot x 0.01 puts it in dollars per vol POINT, matching how GEX is
         scaled per 1% move; charm is d(delta)/d(time), so x spot is dollars
         of delta per day. Each leg takes its OWN side's open interest and
         its own dealer direction — the node's plain `charm` averaged the two
         legs together, which is not an exposure. */
      const callVanna = callOI * 100 * greeks.vanna * spot * 0.01 * dealerCallDirection;
      const putVanna = putOI * 100 * greeks.vanna * spot * 0.01 * dealerPutDirection;
      const netVanna = callVanna + putVanna;

      const callCharm = callOI * 100 * greeks.charmCall * spot * dealerCallDirection;
      const putCharm = putOI * 100 * greeks.charmPut * spot * dealerPutDirection;
      const netCharm = callCharm + putCharm;

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
        charm: (greeks.charmCall + greeks.charmPut) / 2,
        callVanna,
        putVanna,
        netVanna,
        callCharm,
        putCharm,
        netCharm,
      });
    }

    /* Quantise, then share. The key carries the spot override so a chain
       asked for at a hypothetical price never overwrites the live one. */
    /* THE NETS ARE DERIVED FROM THE ROUNDED LEGS, NEVER ROUNDED THEMSELVES.

       The first cut rounded all three of call/put/net independently, and
       exposure-canon-proof failed it immediately: `round(a) + round(b)` is
       not `round(a + b)`, so the net drifted from its own legs by up to
       1.92e-2 — two cents of pure rounding error. The proof's claim is that
       the split PRESERVES the net, and it is right to insist: a rail and a
       profile reading the same strike would have disagreed by cents that
       came from nowhere.

       Rounding the legs and summing them keeps the identity exact at any
       precision. */
    const rounded = strikes.map(n => {
      const callGex = qMoney(n.callGex), putGex = qMoney(n.putGex);
      const callDex = qMoney(n.callDex), putDex = qMoney(n.putDex);
      const callVex = qMoney(n.callVex), putVex = qMoney(n.putVex);
      return {
        ...n,
        gamma: qGreek(n.gamma),
        vanna: qGreek(n.vanna),
        charm: qGreek(n.charm),
        callGex, putGex, netGex: callGex + putGex,
        callDex, putDex, netDex: callDex + putDex,
        callVex, putVex, netVex: callVex + putVex,
      };
    });

    const key = `${tickerKey}|${spotOverride ?? ''}`;
    const prev = chainMemo.get(key);
    if (!prev || prev.length !== rounded.length) {
      chainMemo.set(key, rounded);
      return rounded;
    }
    let moved = 0;
    const shared = rounded.map((n, i) => {
      if (sameStrike(n, prev[i])) return prev[i];
      moved++;
      return n;
    });
    /* Nothing moved at all: hand back the SAME array, so an identity check
       upstream skips the whole chain rather than walking it. */
    const out = moved === 0 ? prev : shared;
    chainMemo.set(key, out);
    return out;
  }

  // Generate Compass plan
  function generateTradePlan(tickerKey: TickerSymbol, spot: number, chain: StrikeNode[], indicators: Indicators): TradePlan {
    const config = TICKERS[tickerKey];

    /* Walls come from core/walls.ts, the ONE copy of this rule.

       This used to pick by |netGex| plus side of spot, which is the bug that
       was already fixed in data/gex.ts `buildLevelsFor` and NOT here — so the
       same book named one pair of walls for Terrain and a different pair for
       the GEX matrix, `readHeatPattern`'s prose and the Pulse board. The flip
       below carries a comment asking the reader to keep two copies in step;
       the walls are the case where that did not survive, so they moved out.

       `netGex` IS what the snapshot calls `value` — computeGexSnapshot maps
       one spelling to the other — which is why both callers can share a rule
       at all.

       UNNAMED FALLS BACK TO A FIXED BRACKET, not to spot: these walls also set
       target1/target2 and the stop below, and a target sitting exactly on
       entry is not a plan. Four steps out is what this function always used
       when the scan found nothing, and it keeps the support < spot < resistance
       ordering that `readHeatPattern` reads as a percentage distance. */
    const picked = pickWalls(chain, spot, n => n.netGex);
    const supportWall = picked.putWall ?? spot - config.step * 4;
    const resistanceWall = picked.callWall ?? spot + config.step * 4;

    /* The flip from core/walls.ts, beside the walls it already reads from
       there. The comment this replaces said "Matches data/gex.ts
       buildLevelsFor" — a request to keep two copies in step by hand, which
       is the arrangement that failed for the walls in this same function. */
    const flipStrike = pickFlip(chain, spot, n => n.netGex) ?? spot;

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

      // Live ticks walk through the SAME wall physics as seeded history
      // (scale 0.5: four ticks compose one bar-sized move in quadrature).
      const shock = Math.random() > 0.98 ? 2.2 : 1;
      let deltaPrice = gexAwareStep(ticker, config.currentPrice, 0.5) * shock;
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

  /**
   * A snapshot for ANY ticker, read from current state without advancing the
   * simulation. `tick` only ever emits the active symbol, so surfaces that show
   * several names at once (a workspace of panels, a multi-chart board) need
   * this to derive per-ticker views. Pure read — safe to call during render.
   */
  function snapshotFor(symbolRaw: string): MarketSnapshot {
    const sym = ensureTicker(symbolRaw);
    const cfg = TICKERS[sym];
    const chain = generateOptionsChain(sym);
    const indicators = getIndicators(priceHistory[sym]);
    return {
      ticker: sym,
      spot: cfg.currentPrice,
      changePercent: ((cfg.currentPrice - cfg.basePrice) / cfg.basePrice) * 100,
      priceHistory: priceHistory[sym],
      chain,
      indicators,
      plan: generateTradePlan(sym, cfg.currentPrice, chain, indicators),
      // The tape is a session-wide stream, not a per-ticker derivation; callers
      // that need prints read them from the live snapshot instead.
      tape: [],
    };
  }

  return {
    TICKERS,
    WATCHLIST,
    snapshotFor,
    /**
     * The LIVE book alone — P-24B's canonical input.
     *
     * `snapshotFor` also builds indicators and a trade plan, which a surface
     * that only wants "where are the walls right now" pays for and throws
     * away. Measured: the chain is most of the cost either way, but the
     * levels rail runs once per pane per tick and had no reason to build
     * four trade plans a second to answer a question about strikes.
     */
    chainFor: (symbolRaw: string): { chain: StrikeNode[]; spot: number } => {
      const sym = ensureTicker(symbolRaw);
      return { chain: generateOptionsChain(sym), spot: TICKERS[sym].currentPrice };
    },
    ensureTicker,
    setActiveTicker: (t: string): string => {
      activeTicker = ensureTicker(t);
      return activeTicker;
    },
    getActiveTicker: (): string => activeTicker,
    /** T-14's live-only 15-second bars — empty until the app has ticked,
        exactly as a per-second feed is empty before it connects. */
    getSecondsBars: (sym: string): Candle[] => {
      ensureTicker(sym);
      return (secondsHistory[sym] ??= []);
    },
    /** Live intraday OHLC bars (mutated in place each tick — treat as read-only). */
    getCandles: (sym: string): Candle[] => {
      const key = ensureTicker(sym);
      return candleHistory[key];
    },
    /** Bars WITHOUT the seeding side effect — null for names never simmed.
        For render-time reads over many symbols (the board's session sparks):
        getCandles would synchronously forward-sim every unseeded name. */
    peekCandles: (sym: string): Candle[] | null => candleHistory[sym.toUpperCase()] ?? null,
    /** Net-GEX-per-strike snapshots parallel to the candle series (read-only). */
    getGexHistory: (sym: string): GexSnapshot[] => {
      const key = ensureTicker(sym);
      return gexHistory[key];
    },
    tick,
    getGreeks: calculateGreeks,
    /** The live harness's answer to "what is the market right now" for the
        scan universe. Engine modules (Compass) take this as an ARGUMENT
        instead of reading the simulator themselves — a replay harness passes
        historical quotes through the same parameter.

        The roster reaches past the seeded watchlist WITHOUT registering
        names: ensureTicker forward-seeds a full candle history (~0.6s per
        name — 20 of them would freeze the terminal for the exact reason the
        partner's build grew a separate scan engine). Unseeded names get a
        lightweight day-stable quote instead; the first CLICK on one of their
        cards is what seeds them, one name at a time, the Dark Pool Leaders
        precedent. */
    universeQuotes: (active: string): UniverseQuote[] => {
      const names = Array.from(new Set([active, ...WATCHLIST, ...SCAN_ROSTER.map(r => r.ticker)]));
      return names.map(t => {
        if (TICKERS[t]) {
          const cfg = TICKERS[t];
          return { ticker: t, price: cfg.currentPrice, iv: cfg.iv, step: cfg.step };
        }
        const base = SCAN_ROSTER.find(r => r.ticker === t);
        if (base) return scanQuote(base);
        // Unknown free-entry name — seed it for real (single name, user-chosen).
        const key = ensureTicker(t);
        const cfg = TICKERS[key];
        return { ticker: key, price: cfg.currentPrice, iv: cfg.iv, step: cfg.step };
      });
    },
  };
})();

export default Simulator;
