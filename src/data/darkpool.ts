/*
==================================================
  SLAYER TERMINAL - DARK POOL ENGINE (darkpool.ts)
  Derives an off-exchange story from the simulator
  snapshot: liquidity shelves, print classification
  and a net institutional posture. Deterministic per
  ticker + session day — swaps for a real DP feed
  without touching the page.
==================================================
*/

import Simulator from '../core/simulator';
import { dayKey, h01, hPick, hRange } from '../core/rng';
import type { MarketSnapshot } from '../types/market';
import type {
  DarkLeaderRow,
  DarkLeadersView,
  DarkPoolIntent,
  DarkPoolLevel,
  DarkPoolPrint,
  DarkPoolView,
  DarkSector,
  LevelRole,
  Posture,
} from '../types/darkpool';

const VENUES = ['UBS ATS', 'MS Pool', 'JPM-X', 'Sigma X', 'CrossFinder', 'IEX-D', 'Level ATS'];

// ---- sector universe for the Leaders view -----------------------------------
// Categorical identity colors — muted so the page stays black-first; the
// numbers carry the ranking, the dot only names the sector. Index ETFs ride
// in Financial Services (that's where the street files them, and it keeps the
// top card honest — index flow IS most of the dark tape).
const SECTOR_UNIVERSE: { sector: string; color: string; weight: number; tickers: string[] }[] = [
  { sector: 'Financial Services', color: '#7DD3A8', weight: 3.2, tickers: ['SPY', 'QQQ', 'IWM', 'JPM', 'BAC', 'GS', 'MS', 'SCHW', 'BLK', 'V'] },
  { sector: 'Technology', color: '#7EA6F0', weight: 2.4, tickers: ['NVDA', 'AAPL', 'MSFT', 'AMD', 'AVGO', 'TSM', 'MU', 'ORCL', 'INTC', 'CRM'] },
  { sector: 'Healthcare', color: '#E88A8A', weight: 1.1, tickers: ['UNH', 'LLY', 'JNJ', 'PFE', 'ABBV', 'MRK', 'TMO', 'CVS', 'ABT', 'ZTS'] },
  { sector: 'Consumer Cyclical', color: '#E8C468', weight: 0.95, tickers: ['TSLA', 'AMZN', 'HD', 'MCD', 'NKE', 'SBUX', 'LOW', 'TJX', 'BABA', 'EBAY'] },
  { sector: 'Industrials', color: '#9B8FE8', weight: 0.8, tickers: ['CAT', 'GE', 'BA', 'HON', 'UNP', 'DE', 'LMT', 'UPS', 'ETN', 'CSX'] },
  { sector: 'Communication Services', color: '#B48FE0', weight: 0.7, tickers: ['META', 'GOOGL', 'NFLX', 'DIS', 'T', 'VZ', 'CMCSA', 'SPOT', 'TMUS', 'CHTR'] },
  { sector: 'Consumer Defensive', color: '#6ECFC4', weight: 0.5, tickers: ['WMT', 'COST', 'PG', 'KO', 'PEP', 'PM', 'MDLZ', 'CL', 'MNST', 'KMB'] },
  { sector: 'Utilities', color: '#E0D080', weight: 0.32, tickers: ['NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'SRE', 'XEL', 'PCG', 'CEG'] },
  { sector: 'Real Estate', color: '#E89AC0', weight: 0.3, tickers: ['PLD', 'AMT', 'EQIX', 'SPG', 'O', 'PSA', 'CCI', 'DLR', 'VICI', 'IRT'] },
  { sector: 'Energy', color: '#E8A56E', weight: 0.3, tickers: ['XOM', 'CVX', 'COP', 'SLB', 'EOG', 'OXY', 'MPC', 'PSX', 'VLO', 'LNG'] },
  { sector: 'Basic Materials', color: '#93B87A', weight: 0.24, tickers: ['LIN', 'SHW', 'FCX', 'NEM', 'APD', 'NUE', 'DOW', 'ECL', 'ALB', 'EMN'] },
];

let sectorIndex: Map<string, { sector: string; color: string }> | null = null;

/** Sector identity (name + categorical dot color) for any ticker the Leaders
    universe carries. ONE sector map for the whole terminal — the flow pages
    read this instead of growing their own. Null for names we don't file. */
export function sectorOf(ticker: string): { sector: string; color: string } | null {
  if (!sectorIndex) {
    sectorIndex = new Map();
    for (const cfg of SECTOR_UNIVERSE) {
      for (const t of cfg.tickers) sectorIndex.set(t, { sector: cfg.sector, color: cfg.color });
    }
  }
  return sectorIndex.get(ticker.toUpperCase()) ?? null;
}

/** Stable per-ticker price: live sim price when the sim tracks it, otherwise a
    hash-derived quote that never jumps between renders. */
/*
  ASK THE DESK BEFORE INVENTING (2026-09-04). This checked Simulator.TICKERS,
  which holds only the four names the tick loop seeds, and drew everything else
  from a hash between $12 and $962. The board's own screenshot had Intel at
  $399.24, Oracle at $13.92 and Broadcom at $896.01 — while universeQuotes,
  which the rest of the desk reads, knew all three. Nineteen of the sector
  universe's hundred and ten names are quoted there, and they are precisely the
  ones large enough to top their sector tables, so the invented prices were
  what a reader actually saw.

  (The same mistake enrichPrint was making in the tape today, from the same
  cause: TICKERS is not the desk's list of names, it is the tick loop's.)

  The other ninety-one have no reference anywhere in this build, so they keep
  the seeded stand-in. Memoized because the quote sweep is not free and this is
  called once per name per rebuild of the board.
*/
let quoteCache: Map<string, number> | null = null;
function leaderPrice(sym: string): number {
  if (!quoteCache) quoteCache = new Map(Simulator.universeQuotes('SPY').map(q => [q.ticker, q.price]));
  const quoted = quoteCache.get(sym);
  if (quoted !== undefined) return quoted;
  return Number((12 + Math.pow(h01(`dpl-px-${sym}`), 1.6) * 950).toFixed(2));
}

/** Market-wide off-exchange leaders, grouped by sector. Deterministic per day
    (structure) with live prices for sim-tracked names — swaps for a real DP
    aggregation feed without touching the page. */
export function buildDarkPoolLeaders(): DarkLeadersView {
  const day = dayKey();

  const sectors: DarkSector[] = SECTOR_UNIVERSE.map(cfg => {
    // Day-varied sector weight: leadership rotates, Financials/Tech stay heavy
    const dayW = cfg.weight * (0.6 + h01(`${day}-dplw-${cfg.sector}`) * 0.9);

    const rows: DarkLeaderRow[] = cfg.tickers
      .map(sym => {
        const s = `${day}-dpl-${sym}`;
        const price = leaderPrice(sym);
        const notional = dayW * 1e9 * (0.04 + Math.pow(h01(`${s}-n`), 1.9));
        const spike = h01(`${s}-spike`) > 0.97 ? hRange(`${s}-spikem`, 5, 9) : 1;
        const pctAvgVol = Math.min(320, (1 + Math.pow(h01(`${s}-av`), 2.2) * 28) * spike);
        return {
          ticker: sym,
          price,
          dirUp: h01(`${s}-dir`) > 0.48,
          notional,
          pctAvgVol: Number(pctAvgVol.toFixed(1)),
          size: Math.round(notional / price / 100) * 100,
        };
      })
      .sort((a, b) => b.notional - a.notional);

    const notional = rows.reduce((a, r) => a + r.notional, 0);
    return {
      sector: cfg.sector,
      color: cfg.color,
      notional,
      sharePct: 0, // filled below once the total is known
      prints: Math.round(notional / hRange(`${day}-dplp-${cfg.sector}`, 1.6e6, 2.4e6)),
      rows,
    };
  }).sort((a, b) => b.notional - a.notional);

  const totalNotional = sectors.reduce((a, s) => a + s.notional, 0);
  for (const s of sectors) s.sharePct = (s.notional / totalNotional) * 100;

  return {
    totalNotional,
    totalPrints: sectors.reduce((a, s) => a + s.prints, 0),
    updated: new Date().toLocaleTimeString('en-GB'),
    sectors,
  };
}

const PRINT_COUNT = 26;
const LEVEL_COUNT = 6;

/** Cheap intraday "did price bounce here" count from the price history. */
function defendedCount(priceHistory: number[], level: number, tolPct: number): number {
  let count = 0;
  for (let i = 2; i < priceHistory.length; i++) {
    const prev = priceHistory[i - 1];
    const nearLevel = Math.abs(prev - level) / level < tolPct;
    if (!nearLevel) continue;
    const wasFalling = priceHistory[i - 2] > prev;
    const turnedUp = priceHistory[i] > prev;
    const wasRising = priceHistory[i - 2] < prev;
    const turnedDown = priceHistory[i] < prev;
    if ((wasFalling && turnedUp) || (wasRising && turnedDown)) count++;
  }
  return count;
}

function levelUsage(role: LevelRole, price: number, defended: number, sharePct: number): string {
  const p = price.toFixed(2);
  if (role === 'SUPPORT') {
    return defended >= 2
      ? `Buyer has defended $${p} ${defended}× today — longs lean on it; a close below flips the read to distribution.`
      : `Fresh accumulation shelf at $${p} (${sharePct.toFixed(0)}% of DP volume) — expect dips into it to slow; invalid below.`;
  }
  if (role === 'RESISTANCE') {
    return defended >= 2
      ? `Supply has capped price at $${p} ${defended}× — fade pushes into it until a sized print clears above.`
      : `Distribution ceiling at $${p} — rallies into the shelf meet a seller; breakout needs volume through it.`;
  }
  return `Two-way shelf at $${p} — institutions rotating, not committing. Trade the break: direction follows whichever side absorbs.`;
}

function classify(
  seedBase: string,
  vsSpotPct: number,
  sizePercentile: number,
  atLevel: boolean,
  sessionUp: boolean
): { intent: DarkPoolIntent; conviction: number; read: string } {
  // The read: sized prints below spot in an up-tape = someone building; sized
  // prints above spot into strength = someone leaving into liquidity. Small or
  // mid prints at VWAP-ish levels are rotation; prints glued to option shelves
  // are most likely hedge flow, not directional conviction.
  const sized = sizePercentile > 0.72;
  const below = vsSpotPct < -0.08;
  const above = vsSpotPct > 0.08;

  if (atLevel && h01(`${seedBase}-hedge`) > 0.55) {
    return {
      intent: 'HEDGE FLOW',
      conviction: Math.round(hRange(`${seedBase}-c1`, 48, 68)),
      read: 'Printed on an options shelf — likely dealer/desk hedge, not a directional bet. Don’t chase it.',
    };
  }
  if (sized && below && sessionUp) {
    return {
      intent: 'ACCUMULATION',
      conviction: Math.round(hRange(`${seedBase}-c2`, 70, 92)),
      read: 'Size bought below market in an up-tape — institution building a position on weakness. Level becomes support.',
    };
  }
  if (sized && above && !sessionUp) {
    return {
      intent: 'DISTRIBUTION',
      conviction: Math.round(hRange(`${seedBase}-c3`, 68, 90)),
      read: 'Size sold into strength while the tape weakens — supply overhead. Rallies into the print price should struggle.',
    };
  }
  if (sized) {
    const acc = h01(`${seedBase}-dir`) > 0.5;
    return {
      intent: acc ? 'ACCUMULATION' : 'DISTRIBUTION',
      conviction: Math.round(hRange(`${seedBase}-c4`, 55, 75)),
      read: acc
        ? 'Sized print near the lows of its window — leans accumulation; confirm if the level holds on the next test.'
        : 'Sized print near the highs of its window — leans distribution; confirm if bounces into it stall.',
    };
  }
  return {
    intent: 'ROTATION',
    conviction: Math.round(hRange(`${seedBase}-c5`, 35, 55)),
    read: 'Routine off-exchange rotation — no signal by itself; watch whether it clusters at a shelf.',
  };
}

export function buildDarkPoolView(snapshot: MarketSnapshot): DarkPoolView {
  const { ticker, spot, priceHistory, changePercent } = snapshot;
  const day = dayKey();
  const seed = (tag: string) => `${ticker}-${day}-dp-${tag}`;
  const sessionUp = changePercent >= 0;

  const lo = Math.min(...priceHistory, spot);
  const hi = Math.max(...priceHistory, spot);
  const range = Math.max(hi - lo, spot * 0.004);

  // ---- liquidity shelves ----------------------------------------------------
  // Anchor shelves inside the session range with a bias toward the extremes —
  // that's where institutional resting interest actually concentrates.
  const rawLevels = Array.from({ length: LEVEL_COUNT }, (_, i) => {
    const t = h01(seed(`lvl-${i}`));
    const edgeBiased = t < 0.5 ? Math.pow(t * 2, 1.5) / 2 : 1 - Math.pow((1 - t) * 2, 1.5) / 2;
    const price = lo + edgeBiased * range;
    const notional = hRange(seed(`lvln-${i}`), 18e6, 220e6);
    return { price, notional };
  }).sort((a, b) => b.price - a.price);

  const totalLevelNotional = rawLevels.reduce((a, l) => a + l.notional, 0);

  const levels: DarkPoolLevel[] = rawLevels.map((l, i) => {
    const distPct = ((l.price - spot) / spot) * 100;
    const defended = Math.min(defendedCount(priceHistory, l.price, 0.0012) + (h01(seed(`lvld-${i}`)) > 0.6 ? 1 : 0), 5);
    const role: LevelRole = Math.abs(distPct) < 0.12 ? 'PIVOT' : distPct < 0 ? 'SUPPORT' : 'RESISTANCE';
    const sharePct = (l.notional / totalLevelNotional) * 100;
    return {
      price: Number(l.price.toFixed(2)),
      notional: l.notional,
      prints: Math.round(hRange(seed(`lvlp-${i}`), 4, 26)),
      sharePct,
      role,
      defended,
      distPct,
      usage: levelUsage(role, l.price, defended, sharePct),
    };
  });

  // ---- prints -----------------------------------------------------------------
  const now = Date.now();
  const prints: DarkPoolPrint[] = Array.from({ length: PRINT_COUNT }, (_, i) => {
    const pSeed = seed(`p-${i}`);
    // Prints gravitate to shelves ~55% of the time; the rest scatter in range.
    const nearShelf = h01(`${pSeed}-at`) < 0.55;
    const shelf = levels[Math.floor(h01(`${pSeed}-which`) * levels.length)];
    const price = nearShelf
      ? shelf.price * (1 + hRange(`${pSeed}-jit`, -0.0008, 0.0008))
      : lo + h01(`${pSeed}-px`) * range;
    const sizePercentile = Math.pow(h01(`${pSeed}-sz`), 0.6);
    const size = Math.round(20000 + sizePercentile * 980000);
    const notional = size * price;
    const vsSpotPct = ((price - spot) / spot) * 100;
    const atLevel = nearShelf && Math.abs(price - shelf.price) / shelf.price < 0.001;
    const cls = classify(pSeed, vsSpotPct, sizePercentile, atLevel, sessionUp);
    const minutesAgo = Math.floor(Math.pow(h01(`${pSeed}-t`), 1.3) * 380);
    const ts = new Date(now - minutesAgo * 60000);
    return {
      id: i,
      time: `${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}`,
      ticker,
      price: Number(price.toFixed(2)),
      size,
      notional,
      venue: hPick(`${pSeed}-v`, VENUES),
      vsSpotPct,
      atLevel,
      ...cls,
    };
  }).sort((a, b) => (a.time < b.time ? 1 : -1));

  // ---- posture ------------------------------------------------------------------
  let accW = 0;
  let distW = 0;
  for (const p of prints) {
    if (p.intent === 'ACCUMULATION') accW += p.notional * (p.conviction / 100);
    if (p.intent === 'DISTRIBUTION') distW += p.notional * (p.conviction / 100);
  }
  const gross = accW + distW || 1;
  const netPosturePct = ((accW - distW) / gross) * 100;
  const posture: Posture = netPosturePct > 18 ? 'ACCUMULATING' : netPosturePct < -18 ? 'DISTRIBUTING' : 'BALANCED';
  const strongest = [...levels].sort((a, b) => b.notional - a.notional)[0];
  const postureNote =
    posture === 'ACCUMULATING'
      ? `Sized prints skew to the buy side — dips into the $${strongest.price.toFixed(2)} shelf are being absorbed.`
      : posture === 'DISTRIBUTING'
        ? `Sized prints skew to the sell side — strength into $${strongest.price.toFixed(2)} keeps meeting supply.`
        : 'Buy and sell blocks roughly offset — institutions rotating, not committing. Let a shelf break decide direction.';

  const totalNotional = prints.reduce((a, p) => a + p.notional, 0);
  const largest = prints.reduce<DarkPoolPrint | null>((a, p) => (a === null || p.notional > a.notional ? p : a), null);

  return {
    ticker,
    spot,
    dpSharePct: hRange(seed('share'), 34, 52),
    netPosturePct,
    posture,
    postureNote,
    totalNotional,
    levels,
    prints,
    largest,
  };
}

// ---- the off-exchange tape's history ----------------------------------------

/** One cross on the market-wide board, in the board's own units. */
export interface DarkCross {
  key: string;
  ticker: string;
  size: number;
  price: number;
  /** Billions — the field's unit since the board was cut. */
  notional: number;
  /** 24-hour clock, HH:MM:SS. */
  time: string;
  /** M/D. */
  date: string;
  /** Epoch ms. What actually orders the feed; the two strings above are how
      it is read, and a M/D string cannot be sorted or compared. */
  at: number;
}

/*
  THE DARK POOL'S HISTORY (Noah, 2026-09-04, the same breath that made it its
  own page: "make it a endless scroll... it should be nonstop").

  Same shape as the Live Tape's history and the same reasons — a pure function
  of (page, index), so a page is the same page every time it is asked for and
  there is nothing to await or fail. What differs is the CLOCK. Options prints
  arrive seconds apart and the tape walks back in seconds; blocks cross a few
  dozen times a session, so this walks back by SESSION — and skips the weekend,
  because a feed that offers Saturday's crosses is telling you something false
  about where the size went.
*/

/** Crosses per session before the feed steps back a day. */
const CROSSES_PER_SESSION = 22;
/** Minutes between crosses, walking back from the close. */
const CROSS_STRIDE_MIN = 17;
const SESSION_CLOSE_MIN = 16 * 60;

/** n sessions before `from`, weekends skipped. */
function sessionsBack(from: Date, n: number): Date {
  const d = new Date(from.getTime());
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() - 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d;
}

export function backfillCrosses(
  quotes: { ticker: string; price: number }[],
  page: number,
  count: number,
  anchorMs: number
): DarkCross[] {
  if (quotes.length === 0) return [];
  const anchor = new Date(anchorMs);
  const out: DarkCross[] = [];

  for (let j = 0; j < count; j++) {
    const i = page * count + j;
    const s = `dpx-${i}`;
    const session = Math.floor(i / CROSSES_PER_SESSION);
    const slot = i % CROSSES_PER_SESSION;

    /* Monotone by construction, which is the one thing this may not get wrong:
       within a session the slot walks the clock back from the close, and each
       new session is a day earlier. A feed whose clock steps forward as you
       scroll down it is unreadable. */
    const day = sessionsBack(anchor, session);
    const minute = SESSION_CLOSE_MIN - slot * CROSS_STRIDE_MIN;
    const hh = Math.floor(minute / 60);
    const mm = minute % 60;
    const ss = Math.floor(h01(`${s}-s`) * 60);
    day.setHours(hh, mm, ss, 0);

    const q = quotes[Math.floor(h01(`${s}-t`) * quotes.length)];
    const price = Number((q.price * (0.995 + h01(`${s}-p`) * 0.01)).toFixed(2));
    /* ONE CROSS, NOT A DAY'S WORTH — the range buildPrints was corrected to,
       kept here so the history and the live board speak the same size. */
    const notional = Number((0.008 + h01(`${s}-n`) * 0.17).toFixed(4));

    out.push({
      key: `hx-${i}`,
      ticker: q.ticker,
      price,
      notional,
      size: Math.round((notional * 1e9) / price / 100) * 100,
      time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`,
      date: `${day.getMonth() + 1}/${day.getDate()}`,
      at: day.getTime(),
    });
  }
  return out;
}
