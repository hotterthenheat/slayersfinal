/*
==================================================
  SLAYER TERMINAL - NEWS INTEL (newsintel.ts)
  HALF-LIFE & CATALYST SIMILARITY. The wire tells you
  what happened; this engine tells you what it usually
  MEANS for price. For the active name's headlines it
  reads:
    · News half-life — how long this catalyst TYPE
      keeps moving price before the effect decays
    · Catalyst-similarity — the closest past analog
      events and how they actually resolved
    · Narrative-vs-positioning — does the options book
      agree with the headline lean, or fade it?
    · Informational vs mechanical — is the move fresh
      information repricing, or crowded flow/hedging?
    · Event-vol extraction — the implied straddle move
      the catalyst injects
    · Priced-in score — how much of that move the tape
      has already discounted
    · Invalidation — what would void the read

  The headline feed and the model's direction/expected
  move come from news.ts (buildNewsFeed); positioning
  is read off the live chain. Half-lives, analog base
  rates and event vols are modeled per catalyst type
  and swap for a real event-study feed behind the same
  contract. Deterministic per ticker + day.
==================================================
*/

import { dayKey, h01, hRange, hGauss, hPick } from '../core/rng';
import type { MarketSnapshot } from '../types/market';
import { buildNewsFeed, type NewsCategory, type NewsItem } from './news';

export type HeadlineScope = 'NAME' | 'MACRO';
export type CatalystNature = 'INFORMATIONAL' | 'MECHANICAL';
export type PositioningAgreement = 'CONFIRMS' | 'DIVERGES' | 'NEUTRAL';

export interface CatalystAnalog {
  /** Relative period tag of the analog event */
  when: string;
  /** Short descriptor of how the analog played out */
  descriptor: string;
  /** How close the analog is to today's setup, 0–100 */
  similarityPct: number;
  /** Signed next-session move the analog produced, % */
  outcome1dPct: number;
  /** Whether the day-one move held (vs round-tripped) */
  followThrough: boolean;
}

export interface HeadlineIntel {
  id: string;
  time: string;
  minutesAgo: number;
  source: string;
  scope: HeadlineScope;
  ticker: string | null;
  category: NewsCategory;
  headline: string;
  sentiment: number;
  magnitude: number;
  /** Hours the catalyst type typically keeps moving price */
  halfLifeHours: number;
  halfLifeLabel: string;
  /** Fraction of the expected move already discounted, 0–100 */
  pricedInPct: number;
  /** Fresh-information repricing vs positioning/flow-driven */
  nature: CatalystNature;
  natureNote: string;
  /** Implied straddle move the catalyst injects, % */
  eventVolPct: number;
  /** Does options positioning agree with the headline lean? */
  agreement: PositioningAgreement;
  /** Signed lean gap: + = positioning more bullish than the headline */
  divergenceScore: number;
  agreementNote: string;
  /** Closest past analog events, best match first */
  analogs: CatalystAnalog[];
  /** What would void the read */
  invalidation: string;
  /** Model direction/expected move carried from news.ts */
  expMove1dPct: number;
  probUpPct: number;
}

export interface NewsIntelView {
  ticker: string;
  spot: number;
  /** Name headlines first, then any market-wide macro context */
  headlines: HeadlineIntel[];
  /** True when the name has at least one single-name catalyst today */
  hasNameHeadlines: boolean;
  nameCount: number;
  macroCount: number;
  /** Options positioning lean read off the chain, −1…+1 (+ = call-heavy) */
  positioningLean: number;
  positioningLabel: string;
  /** Magnitude-weighted narrative lean of the name's wire, −1…+1 */
  narrativeLean: number;
  /** Dominant catalyst category across the read */
  dominantCategory: NewsCategory | null;
  /** Median catalyst half-life across the read (hours) */
  medianHalfLifeHours: number;
  medianHalfLifeLabel: string;
  /** Magnitude-weighted priced-in, 0–100 */
  aggPricedInPct: number;
  /** Net narrative-vs-positioning agreement */
  netAgreement: PositioningAgreement;
  /** Signed agreement, −100…100 (+ = book confirms the wire) */
  agreementScore: number;
  /** Magnitude-weighted implied event move, % */
  eventVolPct: number;
  /** e.g. "2 informational · 1 mechanical" */
  natureSplit: string;
  headline: string;
  note: string;
}

// ---- catalyst constants -----------------------------------------------------------
/** One trading session in hours — the unit half-lives cross into "sessions". */
const SESSION_HOURS = 6.5;

/** Baseline hours a catalyst type keeps moving price before the effect halves. */
const CATEGORY_HALF_LIFE: Record<NewsCategory, number> = {
  Earnings: 33,
  Guidance: 27,
  'M&A': 44,
  Regulatory: 21,
  Analyst: 6.5,
  Product: 9.5,
  Macro: 13,
};

/** How information-driven (vs mechanical) a catalyst type tends to be, 0–1. */
const NATURE_BASE: Record<NewsCategory, number> = {
  Earnings: 0.86,
  Guidance: 0.8,
  'M&A': 0.76,
  Regulatory: 0.7,
  Macro: 0.6,
  Product: 0.42,
  Analyst: 0.3,
};

/** Short analog outcome fragments per catalyst type. */
const ANALOG_FRAGMENTS: Record<NewsCategory, string[]> = {
  Earnings: ['beat + raise, gap held', 'in-line print, faded the open', 'beat but soft guide, round-tripped', 'miss, knife-catch bounce'],
  Guidance: ['raise, multi-day drift', 'cut, slow bleed lower', 'reaffirm, muted reaction', 'raise then fully retraced'],
  Analyst: ['upgrade, one-day pop', 'PT raise, no follow-through', 'downgrade, quick fade', 'double-upgrade, trend held'],
  Macro: ['CPI cool, broad risk-on day', 'yields spike, market-wide fade', 'soft-landing bid returned', 'growth scare, positioning unwind'],
  'M&A': ['deal talks, spike + held', 'rumor denied, full retrace', 'accretive deal, slow drift up', 'regulatory snag, gap down'],
  Product: ['launch pop, faded by close', 'strong reviews, slow build', 'delay flagged, quick dip', 'refresh, muted tape'],
  Regulatory: ['probe opened, gap down', 'fine settled, relief pop', 'ruling favorable, short squeeze', 'overhang, slow bleed'],
};

/** Relative period tags for analog events. */
const PERIODS = ["Q4 '23", "Feb '24", "May '24", "Q2 '24", "Aug '24", "Q3 '24", "Nov '24", "Q4 '24", "Jan '25", "Feb '25", "Q1 '25", "May '25"];

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

function halfLifeLabel(hours: number): string {
  return hours >= SESSION_HOURS ? `${(hours / SESSION_HOURS).toFixed(1)} sess` : `${hours.toFixed(1)}h`;
}

/** Closest past analog events + how they resolved. Deterministic per headline. */
function buildAnalogs(seed: string, category: NewsCategory, sentiment: number, magnitude: number, evMag: number): CatalystAnalog[] {
  const frags = ANALOG_FRAGMENTS[category];
  const dir = sentiment >= 0 ? 1 : -1;
  const out: CatalystAnalog[] = [];
  for (let i = 0; i < 3; i++) {
    const s = `${seed}-an${i}`;
    // Most analogs follow the headline sign; strong sentiment pulls more into line.
    const followsSign = h01(`${s}-od`) < 0.72 + Math.abs(sentiment) * 0.16;
    const outDir = followsSign ? dir : -dir;
    const outcome1dPct = outDir * hRange(`${s}-mag`, 0.5, 1.05) * (evMag + 0.7 + magnitude * 0.6);
    out.push({
      when: hPick(`${s}-per`, PERIODS),
      descriptor: hPick(`${s}-desc`, frags),
      similarityPct: Math.round(clamp(hRange(`${s}-sim`, 66, 93) - i * 7, 38, 96)),
      outcome1dPct,
      followThrough: h01(`${s}-ft`) < 0.5 + Math.abs(sentiment) * 0.22 + magnitude * 0.1,
    });
  }
  return out.sort((a, b) => b.similarityPct - a.similarityPct);
}

/** Per-headline intelligence for one wire item. */
function analyzeItem(item: NewsItem, scope: HeadlineScope, snapshot: MarketSnapshot, positioningLean: number): HeadlineIntel {
  const { category, sentiment, magnitude, prediction } = item;
  const seed = `${dayKey()}-ni-${item.id}`;

  // --- News half-life: catalyst-type decay, stretched by how big the item is ---
  const halfLifeHours = clamp(CATEGORY_HALF_LIFE[category] * (0.72 + magnitude * 0.7) * (0.9 + h01(`${seed}-hl`) * 0.25), 2, 96);

  // --- Priced-in: time-decay since the print blended with positioning alignment ---
  const timeDiscount = 1 - Math.pow(0.5, item.minutesAgo / (halfLifeHours * 60));
  const narr = Math.tanh(sentiment * 1.9);
  const posAlign = clamp(0.5 + 0.5 * narr * positioningLean, 0, 1);
  const pricedFrac = clamp(0.58 * timeDiscount + 0.42 * posAlign + hGauss(`${seed}-pi`) * 0.03, 0.04, 0.96);
  const pricedInPct = Math.round(pricedFrac * 100);

  // --- Informational vs mechanical ---
  const infoScore = NATURE_BASE[category] * (0.7 + magnitude * 0.5) - pricedFrac * 0.28 + hRange(`${seed}-nat`, -0.06, 0.06);
  const nature: CatalystNature = infoScore >= 0.5 ? 'INFORMATIONAL' : 'MECHANICAL';
  const natureNote =
    nature === 'INFORMATIONAL'
      ? 'Fresh-information repricing — the path tracks the fundamentals, not the book. Trade the direction, not the flow.'
      : 'Positioning-driven — hedging and crowded flow, not new information, set the path. Fade exhaustion, watch the unwind.';

  // --- Event-vol extraction: the implied straddle move the catalyst injects ---
  const evMag = Math.abs(prediction.expMove1dPct);
  const eventVolPct = (evMag + 0.15) * (1.1 + magnitude * 0.5);

  // --- Narrative vs positioning ---
  const narrH = Math.tanh(sentiment * 1.8);
  const agreeProduct = narrH * positioningLean;
  const divergenceScore = Math.round((positioningLean - narrH) * 100);
  const agreement: PositioningAgreement =
    Math.abs(narrH) < 0.12 || Math.abs(positioningLean) < 0.1
      ? 'NEUTRAL'
      : agreeProduct > 0.04
        ? 'CONFIRMS'
        : agreeProduct < -0.04
          ? 'DIVERGES'
          : 'NEUTRAL';
  const narrWord = sentiment > 0.08 ? 'bullish' : sentiment < -0.08 ? 'bearish' : 'neutral';
  const posWord = positioningLean > 0.1 ? 'call-heavy' : positioningLean < -0.1 ? 'put-heavy' : 'balanced';
  const agreementNote =
    agreement === 'CONFIRMS'
      ? `The book agrees — a ${narrWord} headline into ${posWord} positioning. Aligned flow tends to extend the move.`
      : agreement === 'DIVERGES'
        ? `The book disagrees — a ${narrWord} headline into ${posWord} positioning. Someone is offside; expect a squeeze or a fade, not a clean trend.`
        : 'Positioning is roughly neutral to the headline — the book adds little edge either way here.';

  // --- Invalidation ---
  const bull = sentiment >= 0;
  const { plan } = snapshot;
  const invalidation =
    scope === 'MACRO'
      ? `Read voids if a same-session counter-print reverses the macro lean, or ${snapshot.ticker} decouples from the tape and trades on its own flow.`
      : bull
        ? `Read voids if ${snapshot.ticker} loses the flip zone $${plan.flipZone.toFixed(2)}, or the day-one gain fully round-trips inside ${halfLifeLabel(halfLifeHours)}.`
        : `Read voids if ${snapshot.ticker} reclaims $${plan.resistanceWall.toFixed(2)}, or a same-session rebuttal headline lands and holds.`;

  return {
    id: item.id,
    time: item.time,
    minutesAgo: item.minutesAgo,
    source: item.source,
    scope,
    ticker: item.ticker,
    category,
    headline: item.headline,
    sentiment,
    magnitude,
    halfLifeHours,
    halfLifeLabel: halfLifeLabel(halfLifeHours),
    pricedInPct,
    nature,
    natureNote,
    eventVolPct,
    agreement,
    divergenceScore,
    agreementNote,
    analogs: buildAnalogs(seed, category, sentiment, magnitude, evMag),
    invalidation,
    expMove1dPct: prediction.expMove1dPct,
    probUpPct: prediction.probUpPct,
  };
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function buildNewsIntel(snapshot: MarketSnapshot): NewsIntelView {
  const { ticker, spot, chain } = snapshot;

  // --- Options positioning lean off the live chain (+ = call-heavy / bullish) ---
  const callOI = chain.reduce((a, n) => a + n.callOI, 0);
  const putOI = chain.reduce((a, n) => a + n.putOI, 0);
  const pcSkew = (callOI - putOI) / Math.max(callOI + putOI, 1);
  const dexScale = chain.reduce((a, n) => a + Math.abs(n.netDex), 0) || 1;
  const netDex = chain.reduce((a, n) => a + n.netDex, 0);
  const dexLean = clamp(netDex / dexScale, -1, 1);
  const positioningLean = clamp(Math.tanh(pcSkew * 3) * 0.7 + dexLean * 0.3, -1, 1);
  const positioningLabel = positioningLean > 0.1 ? 'CALL-HEAVY' : positioningLean < -0.1 ? 'PUT-HEAVY' : 'BALANCED';

  // --- Split the wire: this name's catalysts, plus a little macro context ---
  const feed = buildNewsFeed();
  const nameItems = feed.filter(n => n.ticker === ticker);
  const macroItems = feed.filter(n => n.ticker === null).slice(0, 2);

  const headlines: HeadlineIntel[] = [
    ...nameItems.map(n => analyzeItem(n, 'NAME', snapshot, positioningLean)),
    ...macroItems.map(n => analyzeItem(n, 'MACRO', snapshot, positioningLean)),
  ];

  const nameCount = nameItems.length;
  const macroCount = macroItems.length;
  const hasNameHeadlines = nameCount > 0;

  // --- Aggregates (magnitude-weighted so the loud catalyst leads) ---
  const wSum = headlines.reduce((a, h) => a + h.magnitude, 0) || 1;
  const aggPricedInPct = Math.round(headlines.reduce((a, h) => a + h.pricedInPct * h.magnitude, 0) / wSum);
  const eventVolPct = headlines.reduce((a, h) => a + h.eventVolPct * h.magnitude, 0) / wSum;
  const narrativeLean = clamp(headlines.reduce((a, h) => a + h.sentiment * h.magnitude, 0) / wSum, -1, 1);

  const medianHalfLifeHours = median(headlines.map(h => h.halfLifeHours));

  // Category mode → the dominant catalyst driving the name today.
  let dominantCategory: NewsCategory | null = null;
  if (headlines.length) {
    const counts = new Map<NewsCategory, number>();
    for (const h of headlines) counts.set(h.category, (counts.get(h.category) ?? 0) + h.magnitude);
    dominantCategory = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  const agreementScore = Math.round(clamp(Math.tanh(narrativeLean * 1.7) * Math.tanh(positioningLean * 1.7), -1, 1) * 100);
  const netAgreement: PositioningAgreement =
    Math.abs(narrativeLean) < 0.08 || Math.abs(positioningLean) < 0.08
      ? 'NEUTRAL'
      : agreementScore > 12
        ? 'CONFIRMS'
        : agreementScore < -12
          ? 'DIVERGES'
          : 'NEUTRAL';

  const infoN = headlines.filter(h => h.nature === 'INFORMATIONAL').length;
  const mechN = headlines.length - infoN;
  const natureSplit = `${infoN} informational · ${mechN} mechanical`;

  // --- Summary read ---
  const narrWord = narrativeLean > 0.1 ? 'bullish' : narrativeLean < -0.1 ? 'bearish' : 'mixed';
  const posWord = positioningLean > 0.1 ? 'call-heavy' : positioningLean < -0.1 ? 'put-heavy' : 'balanced';
  const agreeWord = netAgreement === 'CONFIRMS' ? 'the book confirms it' : netAgreement === 'DIVERGES' ? 'the book fades it' : 'the book is neutral';
  const domWord = dominantCategory ? dominantCategory.toLowerCase() : 'macro';

  const headline = hasNameHeadlines
    ? `${nameCount} live ${domWord} catalyst${nameCount > 1 ? 's' : ''} on ${ticker}. The wire leans ${narrWord} and options are positioned ${posWord}, so ${agreeWord}. Roughly ${aggPricedInPct}% looks priced in, with a ${halfLifeLabel(medianHalfLifeHours)} half-life on the read.`
    : `No single-name catalyst on ${ticker} today — positioning reads ${posWord}. The macro wire is the only live driver; the per-headline intel populates the moment a name-specific print lands.`;

  const note = hasNameHeadlines
    ? aggPricedInPct >= 65
      ? 'Most of the expected move is already discounted — chasing the headline is late. Wait for a positioning-driven overshoot to fade, or a fresh print to reset the clock.'
      : netAgreement === 'DIVERGES'
        ? 'Wire and book disagree: the edge is in who capitulates, not the headline itself. Size for a squeeze or a fade rather than a clean trend.'
        : 'Room left before the move is fully priced. The half-life says how long the catalyst keeps working — trade inside that window, not after it.'
    : 'Positioning-only read: with no name catalyst, the book leans without a story behind it. Treat macro items as the tape driver until a single-name headline prints.';

  return {
    ticker,
    spot,
    headlines,
    hasNameHeadlines,
    nameCount,
    macroCount,
    positioningLean,
    positioningLabel,
    narrativeLean,
    dominantCategory,
    medianHalfLifeHours,
    medianHalfLifeLabel: halfLifeLabel(medianHalfLifeHours),
    aggPricedInPct,
    netAgreement,
    agreementScore,
    eventVolPct,
    natureSplit,
    headline,
    note,
  };
}
