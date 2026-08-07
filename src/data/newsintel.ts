/*
==================================================
  SLAYER TERMINAL - NEWS INTEL (newsintel.ts)
  HALF-LIFE & CATALYST SIMILARITY. The catalyst feed
  says what the model generated; this engine reads what
  that usually MEANS for price. For the active name's
  headlines it reads:
    · News half-life — how long this catalyst TYPE
      keeps moving price before the effect decays
    · Catalyst-similarity — the nearest catalysts in
      the model's own prior population and how those
      resolved
    · Narrative-vs-positioning — does the options book
      agree with the headline lean, or fade it?
    · Informational vs mechanical — is the move fresh
      information repricing, or crowded flow/hedging?
    · Event-vol extraction — the implied straddle move
      the catalyst injects
    · Priced-in score — how much of that move the tape
      has already discounted
    · Invalidation — what would void the read

  The headline feed, the model's direction/expected
  move and the prior population the analogs are drawn
  from all come from news.ts; positioning is read off
  the live chain. Half-lives and nature weights are
  STATED per catalyst type — assumptions, not
  measurements — and swap for a real event-study feed
  behind the same contract. Deterministic per ticker
  + day.
==================================================
*/

import { dayKey, h01, hRange, hGauss } from '../core/rng';
import type { MarketSnapshot } from '../types/market';
import { buildLevels } from './gex';
import { buildNewsFeed, catalystPriors, type CatalystPrior, type NewsCategory, type NewsItem } from './news';
import { lookup } from './universe';

export type HeadlineScope = 'NAME' | 'MACRO';
export type CatalystNature = 'INFORMATIONAL' | 'MECHANICAL';
export type PositioningAgreement = 'CONFIRMS' | 'DIVERGES' | 'NEUTRAL';

export interface CatalystAnalog {
  /** Where the analog sits in the model's own history, e.g. "-84 sess" */
  when: string;
  /** Derived descriptor: the analog's setup and how its move sized up */
  descriptor: string;
  /** How close the analog is to today's setup, 0–100 */
  similarityPct: number;
  /** Signed next-session move the analog produced, % */
  outcome1dPct: number;
  /** Whether the analog closed the way its own headline leaned */
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
  /** Magnitude-weighted narrative lean of the name's catalyst feed, −1…+1 */
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
  /** Signed agreement, −100…100 (+ = book confirms the feed) */
  agreementScore: number;
  /** Magnitude-weighted implied event move, % */
  eventVolPct: number;
  /** e.g. "2 informational · 1 mechanical" */
  natureSplit: string;
  /*
    There is deliberately no summary `headline` here. This view used to build one
    — "The feed leans bullish and options are positioned call-heavy, so the book
    confirms it. Roughly 62% looks priced in…" — which the screen dropped because
    it opened on a judgement and then restated the four Stats beside it. Dropping
    the consumer left the producer, and an unrendered sentence is a sentence that
    comes back the next time someone needs a subtitle. The fields it wrapped
    (narrativeLean, positioningLabel, netAgreement, aggPricedInPct,
    medianHalfLifeLabel) are all still here to be read individually.
  */
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

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

function halfLifeLabel(hours: number): string {
  return hours >= SESSION_HOURS ? `${(hours / SESSION_HOURS).toFixed(1)} sess` : `${hours.toFixed(1)}h`;
}

/*
  ---- analogs ----------------------------------------------------------------
  These used to be invented: a random pick from a list of canned outcome phrases,
  stamped with a real calendar period ("Feb '24", "Q4 '24") and given a random
  similarity score and a random outcome. Dated to a month that actually happened,
  it read as an event study — a claim that a specific past print resolved a
  specific way. Nothing had looked anything up.

  They are now an actual nearest-neighbour lookup into the prior population
  news.ts generates and measures its base rates over: same catalyst type, closest
  in setup, reported at its own offset in that history with the outcome the model
  gave it. Every field below is read or derived from the matched prior.
*/

/** Axis spans used to normalise the setup distance, so no one axis dominates. */
const SENTIMENT_SPAN = 2;
const MAGNITUDE_SPAN = 1;
const BETA_SPAN = 1.3;

function setupSimilarity(p: CatalystPrior, sentiment: number, magnitude: number, beta: number): number {
  const ds = (p.sentiment - sentiment) / SENTIMENT_SPAN;
  const dm = (p.magnitude - magnitude) / MAGNITUDE_SPAN;
  const db = (p.beta - beta) / BETA_SPAN;
  return clamp(100 - Math.sqrt((ds * ds + dm * dm + db * db) / 3) * 100, 0, 100);
}

/** The analog's own setup, plus how its outcome sized up against the call on it. */
function describePrior(p: CatalystPrior): string {
  const size = p.magnitude >= 0.62 ? 'loud' : p.magnitude >= 0.36 ? 'mid-size' : 'quiet';
  const lean = p.sentiment >= 0 ? 'bullish' : 'bearish';
  const call = Math.abs(p.expMove1dPct);
  // Below the floor the ratio is noise dividing by noise, so it goes unstated.
  if (call < 0.1) return `${size} ${lean} print, no meaningful call on it`;
  return `${size} ${lean} print, ${(Math.abs(p.realized1dPct) / call).toFixed(1)}× the modeled move`;
}

/** The closest catalysts in the model's own history, best match first. */
function buildAnalogs(category: NewsCategory, sentiment: number, magnitude: number, beta: number): CatalystAnalog[] {
  return catalystPriors()
    .filter(p => p.category === category)
    .map(p => ({ p, similarityPct: setupSimilarity(p, sentiment, magnitude, beta) }))
    .sort((a, b) => b.similarityPct - a.similarityPct)
    .slice(0, 3)
    .map(({ p, similarityPct }) => ({
      when: `-${p.sessionsBack} sess`,
      descriptor: describePrior(p),
      similarityPct: Math.round(similarityPct),
      outcome1dPct: p.realized1dPct,
      followThrough: p.realized1dPct * p.sentiment > 0,
    }));
}

/** Per-headline intelligence for one catalyst-feed item. */
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
  // Names which input drives the path. Both lines used to end on an order
  // ("Trade the direction", "Fade exhaustion, watch the unwind"); what they were
  // really saying is which variable the read hangs on, so they say that instead.
  const natureNote =
    nature === 'INFORMATIONAL'
      ? 'Fresh-information repricing — the path tracks the fundamentals rather than the book. Direction is the live variable here; flow is secondary to it.'
      : 'Positioning-driven — hedging and crowded flow, not new information, set the path. It resolves on exhaustion and the unwind, not on the story.';

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
        ? `The book disagrees — a ${narrWord} headline into ${posWord} positioning. Someone is offside, which resolves as a squeeze or a fade rather than a clean trend.`
        : 'Positioning is roughly neutral to the headline — the book adds little edge either way here.';

  // --- Invalidation ---
  // The flip and the call wall come off gex.ts buildLevels, which owns them for
  // the whole terminal. They were read straight off `snapshot.plan` here, which
  // happens to hold the same two numbers today — but the moment the rail changes
  // how a flip is defined, this sentence would keep quoting the old one, and a
  // reader would see FLIP at one price in the levels rail and another inside an
  // invalidation clause on the same name.
  const bull = sentiment >= 0;
  const levels = buildLevels(snapshot);
  const invalidation =
    scope === 'MACRO'
      ? `Read voids if a same-session counter-print reverses the macro lean, or ${snapshot.ticker} decouples from the tape and trades on its own flow.`
      : bull
        ? `Read voids if ${snapshot.ticker} loses the flip zone $${levels.flip.toFixed(2)}, or the day-one gain fully round-trips inside ${halfLifeLabel(halfLifeHours)}.`
        : `Read voids if ${snapshot.ticker} reclaims $${levels.callWall.toFixed(2)}, or a same-session rebuttal headline lands and holds.`;

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
    analogs: buildAnalogs(category, sentiment, magnitude, lookup(item.ticker ?? '')?.beta ?? 1),
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
  const callOI = chain.reduce((a, n) => a + n.callOI.value, 0);
  const putOI = chain.reduce((a, n) => a + n.putOI.value, 0);
  const pcSkew = (callOI - putOI) / Math.max(callOI + putOI, 1);
  const dexScale = chain.reduce((a, n) => a + Math.abs(n.netDex), 0) || 1;
  const netDex = chain.reduce((a, n) => a + n.netDex, 0);
  const dexLean = clamp(netDex / dexScale, -1, 1);
  const positioningLean = clamp(Math.tanh(pcSkew * 3) * 0.7 + dexLean * 0.3, -1, 1);
  const positioningLabel = positioningLean > 0.1 ? 'CALL-HEAVY' : positioningLean < -0.1 ? 'PUT-HEAVY' : 'BALANCED';

  // --- Split the feed: this name's catalysts, plus a little macro context ---
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

  // --- Timing read: what the priced-in / agreement combination DESCRIBES ---
  // The comment above this block used to end "…means to do", and the copy below
  // it obliged: wait, size, trade inside that window, treat macro as the driver.
  // The desk observes. Each branch now states what the combination of priced-in
  // and agreement leaves unresolved, and lets the reader decide what that is
  // worth.
  const note = hasNameHeadlines
    ? aggPricedInPct >= 65
      ? 'Most of the expected move is already discounted, so the headline itself is late information. What is left is a positioning-driven overshoot, or a fresh print that resets the clock.'
      : netAgreement === 'DIVERGES'
        ? 'Feed and book disagree: the unresolved question is who capitulates, not what the headline said. That shape resolves as a squeeze or a fade rather than a clean trend.'
        : 'Room left before the move is fully priced. The half-life is the window the catalyst is still working in; past it, the read is stale rather than wrong.'
    : 'Positioning-only read: with no name catalyst, the book leans without a story behind it. Macro items are the only catalyst in the read until a single-name headline prints.';

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
    note,
  };
}
