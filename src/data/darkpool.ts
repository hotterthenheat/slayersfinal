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

import { dayKey, h01, hPick, hRange } from '../core/rng';
import type { MarketSnapshot } from '../types/market';
import type {
  DarkPoolIntent,
  DarkPoolLevel,
  DarkPoolPrint,
  DarkPoolView,
  LevelRole,
  Posture,
} from '../types/darkpool';

const VENUES = ['UBS ATS', 'MS Pool', 'JPM-X', 'Sigma X', 'CrossFinder', 'IEX-D', 'Level ATS'];

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
