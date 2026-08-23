/*
==================================================
  SLAYER TERMINAL - DARK POOL ENGINE (darkpool.ts)
  Derives an off-exchange story from the simulator
  snapshot: liquidity shelves, print classification
  and a net institutional posture. Deterministic per
  ticker + session day — swaps for a real DP feed
  without touching the page.

  Execution archetype -> the real trade condition it maps to under the feed:
    BLOCK CROSS   -> 75 / 14 / 29  (block, Rule 127 / 155)
    VWAP SLICE    -> 59            (VWAP)
    SWEEP TO DARK -> 95            (ISO) + a TRF-reported off-exchange print
    LATE PRINT    -> 2 / 8 / 13    (out-of-seq / prior-reference / sold-last)
    MIDPOINT      -> derived: trade price at the NBBO mid (trade_quote)
    ICEBERG       -> inferred from repeated equal clips at one price
==================================================
*/

import { dayKey, h01, hPick, hRange } from '../core/rng';
import type { MarketSnapshot } from '../types/market';
import type {
  DarkPoolExecution,
  DarkPoolIntent,
  DarkPoolLevel,
  DarkPoolPrint,
  DarkPoolView,
  LevelRole,
  Posture,
} from '../types/darkpool';

/**
 * A session's worth of off-exchange prints.
 *
 * This was 26, which is roughly the number of BLOCKS a name prints in a day —
 * and it made the tape look like a summary rather than a tape. Real
 * off-exchange flow is mostly small: hundreds of odd lots and round lots from
 * internalisers and schedule algos, with a handful of negotiated crosses
 * carrying most of the dollars. The size curve below produces that shape, so
 * the row count went up without the notional running away with it.
 */
const PRINT_COUNT = 240;
const LEVEL_COUNT = 6;
/** Retests are displayed as "N×" with a "5+" top, so the count stops at 5. */
const RETEST_CAP = 5;

/*
  Venue ARCHETYPE, never a venue name. Which KIND of pool a block crossed in is
  the part a reader can use — a wholesaler is retail flow internalised in small
  clips, a bank ATS carries client and principal flow side by side, an agency
  venue crosses buy-side to buy-side, and a conditional venue only fires once
  both sides are large-in-scale. The distinction survives without borrowing
  anyone's brand: naming the real bank-operated ATSs hung invented crosses on
  regulated venues those firms actually run, which reads as a citation of a
  print that never happened rather than as a simulation.
*/
const MID_SIZE_VENUES = ['BANK ATS', 'AGENCY ATS', 'MIDPOINT ATS'] as const;

/**
 * Archetype for one print, keyed off its size — which is what actually sorts the
 * pools in practice: retail clips get internalised, ordinary institutional size
 * works a bank or agency book, and only large-in-scale size reaches a
 * conditional venue.
 */
function venueArchetype(seedBase: string, sizePercentile: number): string {
  if (sizePercentile > 0.88) return h01(`${seedBase}-v`) > 0.35 ? 'CONDITIONAL ATS' : 'BANK ATS';
  if (sizePercentile < 0.28) return h01(`${seedBase}-v`) > 0.45 ? 'WHOLESALER' : 'MIDPOINT ATS';
  return hPick(`${seedBase}-v`, MID_SIZE_VENUES);
}

/**
 * Intraday retests per shelf, from the price history.
 *
 * A reversal is credited to its NEAREST shelf and to that one only — the same
 * ownership rule the print clustering below uses. Testing each shelf
 * independently against a fixed band counted one turn six times over, so every
 * shelf on a chopping session reported the ceiling and "defended 5× today" said
 * something about the tape rather than about that price.
 */
function retestsByShelf(priceHistory: number[], shelves: number[], tolPct: number): number[] {
  const counts = new Array<number>(shelves.length).fill(0);
  for (let i = 2; i < priceHistory.length; i++) {
    const prev = priceHistory[i - 1];
    const wasFalling = priceHistory[i - 2] > prev;
    const turnedUp = priceHistory[i] > prev;
    const wasRising = priceHistory[i - 2] < prev;
    const turnedDown = priceHistory[i] < prev;
    if (!((wasFalling && turnedUp) || (wasRising && turnedDown))) continue;
    let owner = -1;
    let bestDist = Infinity;
    shelves.forEach((s, k) => {
      const d = Math.abs(prev - s) / s;
      if (d < bestDist) {
        bestDist = d;
        owner = k;
      }
    });
    if (owner >= 0 && bestDist < tolPct) counts[owner]++;
  }
  return counts;
}

// What the shelf has been doing, not what to do about it. The share is a share
// of session block DOLLARS — the quantity sharePct is actually computed from —
// and calling it volume described a share count nothing here counts.
function levelUsage(role: LevelRole, price: number, defended: number, sharePct: number): string {
  const p = price.toFixed(2);
  if (role === 'SUPPORT') {
    return defended >= 2
      ? `Price has turned up off $${p} ${defended}× today — the bid keeps showing there, and a close below turns the read to distribution.`
      : `Fresh accumulation shelf at $${p} (${sharePct.toFixed(0)}% of session block dollars) — dips into it are where the resting size sits. Below it the read is void.`;
  }
  if (role === 'RESISTANCE') {
    return defended >= 2
      ? `Supply has capped price at $${p} ${defended}× today — it stays capped until a sized print clears above.`
      : `Distribution ceiling at $${p} — rallies into the shelf keep meeting a seller; a break through needs volume behind it.`;
  }
  return `Two-way shelf at $${p} — institutions rotating, not committing. Direction follows whichever side absorbs the other.`;
}


/**
 * How the print was executed.
 *
 * Keyed off the SAME size and price facts the venue archetype reads, so the two
 * columns can never contradict each other — a conditional venue printing a
 * hundred algo child fills would be a tell that this is generated rather than a
 * read, since a conditional venue exists precisely to avoid that.
 *
 * `clips` is the count of child fills behind the print, and it is what actually
 * separates the archetypes: one negotiated cross is 1, a reserve order working
 * is dozens of identical ones, a schedule algo is many small ones.
 */
function execution(
  seedBase: string,
  sizePercentile: number,
  vsSpotPct: number,
  atLevel: boolean,
): { execution: DarkPoolExecution; clips: number; atMid: boolean; reportLagSec: number } {
  const r = h01(`${seedBase}-x`);
  const far = Math.abs(vsSpotPct) > 0.35;
  let kind: DarkPoolExecution;
  let clips: number;

  if (sizePercentile > 0.88) {
    // Large-in-scale. Either a conditional match or a negotiated cross, and
    // either way it prints once.
    // Large-in-scale is a MiFID II construct with no US equivalent; a large
    // negotiated US cross is just a block. Its prints fold into BLOCK CROSS.
    kind = 'BLOCK CROSS';
    clips = 1;
  } else if (far && r > 0.6) {
    // Sitting well away from spot is what a late report looks like — it traded
    // when price was there, and only reached the tape afterwards.
    kind = 'LATE PRINT';
    clips = 1 + Math.floor(h01(`${seedBase}-xc`) * 3);
  } else if (sizePercentile < 0.28) {
    // Retail-scale clips: a schedule algo, or a midpoint peg.
    kind = r > 0.5 ? 'VWAP SLICE' : 'MIDPOINT';
    clips = kind === 'VWAP SLICE' ? 12 + Math.floor(h01(`${seedBase}-xc`) * 90) : 1 + Math.floor(h01(`${seedBase}-xc`) * 4);
  } else if (atLevel && r > 0.55) {
    // Repeated equal clips parked at one price is a reserve order working.
    kind = 'ICEBERG';
    clips = 6 + Math.floor(h01(`${seedBase}-xc`) * 40);
  } else if (r > 0.72) {
    kind = 'SWEEP TO DARK';
    clips = 2 + Math.floor(h01(`${seedBase}-xc`) * 7);
  } else {
    kind = r > 0.36 ? 'BLOCK CROSS' : 'MIDPOINT';
    clips = kind === 'BLOCK CROSS' ? 1 : 1 + Math.floor(h01(`${seedBase}-xc`) * 5);
  }

  // A sweep is an aggressor by definition and never crosses at the mid; a
  // midpoint peg always does. Everything else is a coin weighted by kind —
  // negotiated size is the LEAST likely to sit at the mid, because the whole
  // point of negotiating is agreeing a price. Weighting blocks toward the mid
  // put 76% of session dollars there, which is not what a book of negotiated
  // crosses looks like.
  const atMid =
    kind === 'MIDPOINT'
      ? true
      : kind === 'SWEEP TO DARK'
        ? false
        : h01(`${seedBase}-xm`) > (kind === 'BLOCK CROSS' ? 0.62 : 0.5);

  // Report lag. A late print is late by definition; the rest clear in seconds.
  const reportLagSec =
    kind === 'LATE PRINT'
      ? Math.round(hRange(`${seedBase}-xl`, 300, 5400))
      : Math.round(hRange(`${seedBase}-xl`, 1, 28));

  return { execution: kind, clips, atMid, reportLagSec };
}

/** One line on what each execution archetype is, for the tape's own legend. */
export const EXECUTION_NOTE: Record<DarkPoolExecution, string> = {
  'BLOCK CROSS': 'One negotiated print, agreed away from the book and reported as a single fill.',
  MIDPOINT: 'Crossed inside the spread, so neither side paid it. Passive by construction.',
  ICEBERG: 'A reserve order working: the same clip printing over and over at one price.',
  'VWAP SLICE': 'Schedule-algo child orders — small, even, and about the clock rather than the price.',
  'SWEEP TO DARK': 'An aggressor that took the lit book and finished off-exchange. Pays up to get done.',
  'LATE PRINT': 'Reported well after it traded, which is why it can sit far from where price is now.',
};

function classify(
  seedBase: string,
  vsSpotPct: number,
  sizePercentile: number,
  atLevel: boolean,
  sessionUp: boolean
): { intent: DarkPoolIntent; conviction: number; read: string } {
  // The read: sized prints below spot in an up-tape = someone building; sized
  // prints above spot into strength = someone leaving into liquidity. Small or
  // mid prints at VWAP-ish levels are rotation; a print that lands exactly on a
  // shelf where resting size already sits reads as offset flow rather than
  // directional conviction — atLevel is that liquidity shelf, and the copy says
  // so, because this module never looks at the option chain and cannot know
  // whether a dealer strike sits there.
  const sized = sizePercentile > 0.72;
  const below = vsSpotPct < -0.08;
  const above = vsSpotPct > 0.08;

  if (atLevel && h01(`${seedBase}-hedge`) > 0.55) {
    return {
      intent: 'HEDGE FLOW',
      conviction: Math.round(hRange(`${seedBase}-c1`, 48, 68)),
      read: 'Crossed straight onto a resting-size shelf — that pattern reads as hedge or offset flow rather than a directional bet.',
    };
  }
  if (sized && below && sessionUp) {
    return {
      intent: 'ACCUMULATION',
      conviction: Math.round(hRange(`${seedBase}-c2`, 70, 92)),
      read: 'Size bought below market in an up-tape — reads as an institution building on weakness. The level acts as support while it holds.',
    };
  }
  if (sized && above && !sessionUp) {
    return {
      intent: 'DISTRIBUTION',
      conviction: Math.round(hRange(`${seedBase}-c3`, 68, 90)),
      read: 'Size sold into strength while the tape weakens — supply overhead. Rallies into the print price have been struggling.',
    };
  }
  if (sized) {
    const acc = h01(`${seedBase}-dir`) > 0.5;
    return {
      intent: acc ? 'ACCUMULATION' : 'DISTRIBUTION',
      conviction: Math.round(hRange(`${seedBase}-c4`, 55, 75)),
      read: acc
        ? 'Sized print near the lows of its window — leans accumulation; the confirmation is the level holding on its next test.'
        : 'Sized print near the highs of its window — leans distribution; the confirmation is bounces into it stalling.',
    };
  }
  return {
    intent: 'ROTATION',
    conviction: Math.round(hRange(`${seedBase}-c5`, 35, 55)),
    read: 'Routine off-exchange rotation — no signal by itself; the tell is whether it clusters at a shelf.',
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

  // ---- shelf anchors ----------------------------------------------------------
  // Shelf PRICES first (edge-biased inside the session range — where resting
  // institutional interest concentrates); their notionals are derived from the
  // prints that actually land on them, so a shelf is exactly the blocks it hosts
  // and its share agrees with the session total.
  const shelfPrices = Array.from({ length: LEVEL_COUNT }, (_, i) => {
    const t = h01(seed(`lvl-${i}`));
    const edgeBiased = t < 0.5 ? Math.pow(t * 2, 1.5) / 2 : 1 - Math.pow((1 - t) * 2, 1.5) / 2;
    return lo + edgeBiased * range;
  }).sort((a, b) => b - a);

  // ---- prints -----------------------------------------------------------------
  const now = Date.now();
  const prints: DarkPoolPrint[] = Array.from({ length: PRINT_COUNT }, (_, i) => {
    const pSeed = seed(`p-${i}`);
    // Prints gravitate to shelves ~55% of the time; the rest scatter in range.
    const nearShelf = h01(`${pSeed}-at`) < 0.55;
    const shelfPrice = shelfPrices[Math.floor(h01(`${pSeed}-which`) * shelfPrices.length)];
    const price = nearShelf
      ? shelfPrice * (1 + hRange(`${pSeed}-jit`, -0.0008, 0.0008))
      : lo + h01(`${pSeed}-px`) * range;
    // Heavily right-skewed, the way off-exchange size actually distributes: the
    // median print is a few hundred shares and the top of the book is six
    // figures. The exponent does the work — a linear draw here would put the
    // average print at 125K shares and every row would read as a block.
    const sizePercentile = Math.pow(h01(`${pSeed}-sz`), 0.6);
    const size = Math.round(100 + Math.pow(sizePercentile, 6) * 260000);
    const notional = size * price;
    const vsSpotPct = ((price - spot) / spot) * 100;
    const atLevel = nearShelf && Math.abs(price - shelfPrice) / shelfPrice < 0.001;
    const cls = classify(pSeed, vsSpotPct, sizePercentile, atLevel, sessionUp);
    const exe = execution(pSeed, sizePercentile, vsSpotPct, atLevel);
    const minutesAgo = Math.floor(Math.pow(h01(`${pSeed}-t`), 1.3) * 380);
    const ts = new Date(now - minutesAgo * 60000);
    return {
      id: i,
      at: ts.getTime(),
      time: `${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}`,
      ticker,
      price: Number(price.toFixed(2)),
      size,
      notional,
      venue: venueArchetype(pSeed, sizePercentile),
      vsSpotPct,
      atLevel,
      ...exe,
      ...cls,
    };
  }).sort((a, b) => (a.time < b.time ? 1 : -1));

  const totalNotional = prints.reduce((a, p) => a + p.notional, 0);

  // ---- liquidity shelves from the prints ---------------------------------------
  // Each print belongs to its NEAREST shelf only, and dollars, print count and
  // share all read that same cluster against the same session total the page
  // reports — so the six shares can never sum past 100%, and the row's own
  // arithmetic checks out: share × session total is the dollars beside it.
  // A resting-interest base used to pad the displayed notional and a random
  // 1–4 used to pad the print count, which broke exactly that: the row showed
  // more dollars than its share bought and more prints than the session held.
  // A shelf nothing crossed at today is a real state and now reads as $0.
  const clusterOf = new Map<number, DarkPoolPrint[]>();
  for (const p of prints) {
    let best = -1;
    let bestDist = Infinity;
    shelfPrices.forEach((sp, i) => {
      const d = Math.abs(p.price - sp) / sp;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    if (best >= 0 && bestDist < 0.001) {
      const g = clusterOf.get(best);
      if (g) g.push(p);
      else clusterOf.set(best, [p]);
    }
  }
  const retests = retestsByShelf(priceHistory, shelfPrices, 0.0012);
  const levels: DarkPoolLevel[] = shelfPrices.map((price, i) => {
    const cluster = clusterOf.get(i) ?? [];
    const notional = cluster.reduce((a, p) => a + p.notional, 0);
    const distPct = ((price - spot) / spot) * 100;
    const defended = Math.min(retests[i], RETEST_CAP);
    const role: LevelRole = Math.abs(distPct) < 0.12 ? 'PIVOT' : distPct < 0 ? 'SUPPORT' : 'RESISTANCE';
    const sharePct = (notional / (totalNotional || 1)) * 100;
    return {
      price: Number(price.toFixed(2)),
      notional,
      prints: cluster.length,
      sharePct,
      role,
      defended,
      distPct,
      usage: levelUsage(role, price, defended, sharePct),
    };
  });

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
  // Anchor the note on the strongest shelf on the MATCHING side of spot, so an
  // accumulation read never cites a resistance shelf overhead (and vice versa).
  // Rank only shelves that actually hosted a block: the note says size is being
  // absorbed at that price, which a shelf nothing crossed at cannot support.
  const ranked = [...levels].sort((a, b) => b.notional - a.notional);
  const hosted = ranked.filter(l => l.prints > 0);
  const pool = hosted.length ? hosted : ranked;
  const strongest =
    (posture === 'ACCUMULATING'
      ? pool.find(l => l.price < spot)
      : posture === 'DISTRIBUTING'
        ? pool.find(l => l.price > spot)
        : pool[0]) ?? pool[0];
  const postureNote =
    posture === 'ACCUMULATING'
      ? `Sized prints skew to the buy side — dips into the $${strongest.price.toFixed(2)} shelf are being absorbed.`
      : posture === 'DISTRIBUTING'
        ? `Sized prints skew to the sell side — strength into $${strongest.price.toFixed(2)} keeps meeting supply.`
        : 'Buy and sell blocks roughly offset — institutions rotating, not committing. Direction waits on a shelf break.';

  const largest = prints.reduce<DarkPoolPrint | null>((a, p) => (a === null || p.notional > a.notional ? p : a), null);

  return {
    ticker,
    spot,
    netPosturePct,
    posture,
    postureNote,
    totalNotional,
    levels,
    prints,
    largest,
  };
}
