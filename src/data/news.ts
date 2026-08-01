/*
==================================================
  SLAYER TERMINAL - NEWS + OUTCOME MODEL (news.ts)
  Two jobs: a generated catalyst feed, and a model
  read of each item — direction odds, expected move,
  and the prior population those odds are measured
  against.

  Nothing on this surface is reported. No firm, no
  publication and no official stands behind a
  headline; every item carries a provenance tag that
  says as much. Deterministic per session day; a real
  wire and model API fill the same contract later.
==================================================
*/

import { dayKey, h01, hRange } from '../core/rng';
import { UNIVERSE, lookup, type UniverseName } from './universe';

export type NewsCategory = 'Earnings' | 'Guidance' | 'Analyst' | 'Macro' | 'M&A' | 'Product' | 'Regulatory';

export interface NewsPrediction {
  /** Model P(ticker closes up next session), 0–100 */
  probUpPct: number;
  /** Signed expected move, next session, % */
  expMove1dPct: number;
  /** Signed expected move, five sessions, % */
  expMove5dPct: number;
  /** Model confidence in the read, 0–100 */
  confidencePct: number;
  /** Plain-language statement of what the base rate is and is not */
  analog: string;
  /** Simulated priors the base rate was measured over — not observations */
  baseN: number;
  /** Share of those priors that closed the headline's way, % */
  baseHitPct: number;
  /** Median absolute move those priors produced, % */
  baseMedianPct: number;
  /** What to do with it */
  playbook: string;
}

export interface NewsItem {
  id: string;
  time: string;
  minutesAgo: number;
  /** Provenance, not a byline — this feed is generated, not reported */
  source: string;
  /** null = macro / index-level */
  ticker: string | null;
  headline: string;
  category: NewsCategory;
  /** −1…+1 */
  sentiment: number;
  /** 0…1 — how market-moving the item is */
  magnitude: number;
  prediction: NewsPrediction;
}

/**
 * Provenance, not a byline. Every item used to be datelined to one of six real
 * newswires picked at random, which put a citation on a story that publication
 * never ran — and because the wire clusters list the sources of their members,
 * the page printed "Bloomberg · Reuters" as if a generated headline had been
 * independently confirmed. There is no wire behind this terminal. The field now
 * says only that, on every row.
 */
const PROVENANCE = 'MODELED';

interface Template {
  category: NewsCategory;
  sentiment: number;
  magnitude: number;
  make: (u: UniverseName, h: (tag: string) => number) => string;
}

/*
  Catalyst copy carries no named third party and no invented figure.
  Removed here: six investment banks paired with generated upgrades, downgrades
  and initiations; the price targets attached to them; three named regulators;
  and a dollar buyback authorization. A rating is somebody's opinion and a target
  is somebody's number — with nobody behind them they were decoration that read
  as research. What survives is the SHAPE the outcome model actually uses: which
  way the catalyst leans and how loud it is.
*/
const TICKER_TEMPLATES: Template[] = [
  {
    category: 'Analyst',
    sentiment: 0.55,
    magnitude: 0.4,
    make: u => `${u.name}: estimate revisions turn positive across sell-side coverage`,
  },
  {
    category: 'Analyst',
    sentiment: -0.5,
    magnitude: 0.38,
    make: (u, h) => `${u.name}: estimate cuts spread across coverage on ${hPickStr(h('why'), ['valuation', 'margin pressure', 'demand risk'])}`,
  },
  {
    category: 'Guidance',
    sentiment: 0.7,
    magnitude: 0.65,
    make: u => `${u.name} raises full-year outlook, cites stronger-than-expected demand`,
  },
  {
    category: 'Guidance',
    sentiment: -0.75,
    magnitude: 0.7,
    make: u => `${u.name} trims guidance; management flags softer second half`,
  },
  {
    category: 'Product',
    sentiment: 0.45,
    magnitude: 0.35,
    make: (u, h) =>
      `${u.name} unveils next-gen ${hPickStr(h('prod'), ['AI platform', 'flagship product line', 'enterprise suite', 'developer toolkit', 'data cloud', 'consumer device'])}; early reviews positive`,
  },
  {
    category: 'Analyst',
    sentiment: 0.5,
    magnitude: 0.42,
    make: u => `${u.name}: coverage breadth widens and new ratings skew bullish`,
  },
  {
    category: 'Product',
    sentiment: 0.4,
    magnitude: 0.4,
    make: (u, h) =>
      `${u.name} widens ${hPickStr(h('ptnr'), ['cloud', 'chip-supply', 'distribution'])} partnership to defend ${hPickStr(h('scope'), ['margins', 'its moat', 'unit reach'])}`,
  },
  {
    category: 'Guidance',
    sentiment: 0.35,
    magnitude: 0.5,
    make: (u, h) =>
      `${u.name} expands its buyback authorization; signals confidence in ${hPickStr(h('conf'), ['cash flow', 'the setup into year-end', 'end-market demand'])}`,
  },
  {
    category: 'M&A',
    sentiment: 0.6,
    magnitude: 0.75,
    make: (u, h) => `${u.name} in advanced talks to acquire ${hPickStr(h('tgt'), ['a private AI startup', 'a logistics rival', 'a fintech platform'])}`,
  },
  {
    category: 'Regulatory',
    sentiment: -0.6,
    magnitude: 0.55,
    make: (u, h) => `${u.name} draws a regulatory review of its ${hPickStr(h('area'), ['market practices', 'pending acquisition', 'data handling'])}`,
  },
  {
    category: 'Earnings',
    sentiment: 0.65,
    magnitude: 0.8,
    make: (u, h) => `${u.name} beats on top and bottom line; ${hPickStr(h('kpi'), ['margins', 'bookings', 'unit growth'])} outpace estimates`,
  },
  {
    category: 'Earnings',
    sentiment: -0.7,
    magnitude: 0.8,
    make: (u, h) => `${u.name} misses revenue estimates; ${hPickStr(h('kpi'), ['inventory build', 'churn', 'cost inflation'])} weighs`,
  },
];

/*
  Macro copy states a regime, never a release value. These lines used to quote
  prints that never happened — "CPI cools to 2.4% y/y vs 2.6% est", a 4.6% yield,
  a 3% move in crude — and one of them put an invented dovish quote in the mouth
  of a sitting Fed governor. A made-up print is the most citable thing on a
  terminal and the easiest to mistake for a real one.
*/
const MACRO_TEMPLATES: Array<{ sentiment: number; magnitude: number; text: string }> = [
  { sentiment: 0.5, magnitude: 0.7, text: 'Inflation print lands below consensus; rate-cut odds firm up' },
  { sentiment: -0.45, magnitude: 0.65, text: 'Long-end yields push higher as supply concerns build' },
  { sentiment: 0.35, magnitude: 0.5, text: 'Jobless claims steady; the soft-landing narrative holds' },
  { sentiment: -0.55, magnitude: 0.7, text: 'Services activity surprises to the downside; growth-scare risk returns' },
  { sentiment: 0.2, magnitude: 0.45, text: 'Rate-path commentary leans dovish; cuts stay on the table' },
  { sentiment: -0.3, magnitude: 0.5, text: 'Crude spikes on a supply disruption; transports lag' },
];

function hPickStr(v: number, arr: string[]): string {
  return arr[Math.floor(v * arr.length) % arr.length];
}

// ---- outcome model ------------------------------------------------------------
// Expected move scales with |sentiment| × magnitude × beta; direction odds are a
// squashed version of the same score so headline strength and odds stay coherent.
const CATEGORY_KICK: Record<NewsCategory, number> = {
  Earnings: 3.2,
  Guidance: 2.8,
  'M&A': 2.6,
  Regulatory: 1.9,
  Analyst: 1.4,
  Product: 1.2,
  Macro: 1.0,
};

function expMove1d(category: NewsCategory, sentiment: number, magnitude: number, beta: number, seed: string): number {
  return sentiment * magnitude * CATEGORY_KICK[category] * beta * (0.85 + h01(`${seed}-em`) * 0.3);
}

/**
 * Unit-variance normal draw. `hGauss` in core/rng is the obvious call, but it
 * builds its four uniforms from seeds differing only in the last character
 * ("-g1".."-g4"), and FNV-1a leaves those on a lattice: the sum keeps far less
 * spread than four independent draws would and the result lands at sd ≈ 0.54,
 * not 1. The residual below is stated in percent and the hit rate is a direct
 * consequence of it, so a scale that quietly means half of what it says is not
 * usable here. These tags differ in length as well as content, which pushes the
 * hash apart early. Measured sd 1.01 over 40k draws.
 */
function unitNormal(seed: string): number {
  const s = h01(`${seed}~1`) + h01(`${seed}~22`) + h01(`${seed}~333`) + h01(`${seed}~4444`);
  return (s - 2) * Math.sqrt(3);
}

/**
 * The one quantity the base rate asserts: the standard deviation, in %, of the
 * residual next-session move — the part of the outcome the catalyst does NOT
 * explain, the noise a direction call has to clear. It widens with beta and with
 * how loud the print is, because a big catalyst stretches the whole distribution
 * and not just its mean. State that, and the hit rate and the median below stop
 * being opinions and become consequences of it.
 */
const RESIDUAL_1D_PCT = 1.3;
const RESIDUAL_EVENT_GAIN = 1.6;

function residual1d(beta: number, magnitude: number, seed: string): number {
  return unitNormal(`${seed}-resid`) * RESIDUAL_1D_PCT * beta * (1 + magnitude * RESIDUAL_EVENT_GAIN);
}

// ---- catalyst draw ---------------------------------------------------------------
const FEED_SIZE = 18;
const MACRO_SHARE = 0.28;
/** Session-to-session spread on a template's stated sentiment / magnitude. */
const MACRO_SPREAD = 0.3;
const NAME_SPREAD = 0.4;

const jitter = (base: number, v: number, spread: number): number => base * (1 - spread / 2 + v * spread);

interface RolledCatalyst {
  category: NewsCategory;
  sentiment: number;
  magnitude: number;
  beta: number;
  /** null = index-level */
  ticker: string | null;
  /** Headline copy for this roll — only the feed needs it built */
  text: (h: (tag: string) => number) => string;
}

/**
 * One catalyst draw. Today's feed and the prior population it is scored against
 * both come through here, so the base rate cannot end up measured over a
 * different generator than the one printing the headlines.
 */
function rollCatalyst(isMacro: boolean, h: (tag: string) => number): RolledCatalyst {
  if (isMacro) {
    const t = MACRO_TEMPLATES[Math.floor(h('mt') * MACRO_TEMPLATES.length)];
    return {
      category: 'Macro',
      sentiment: jitter(t.sentiment, h('sj'), MACRO_SPREAD),
      magnitude: jitter(t.magnitude, h('mj'), MACRO_SPREAD),
      beta: 1,
      ticker: null,
      text: () => t.text,
    };
  }
  const u = UNIVERSE[Math.floor(h('tk') * UNIVERSE.length)];
  const t = TICKER_TEMPLATES[Math.floor(h('tpl') * TICKER_TEMPLATES.length)];
  return {
    category: t.category,
    sentiment: jitter(t.sentiment, h('sj'), NAME_SPREAD),
    magnitude: jitter(t.magnitude, h('mj'), NAME_SPREAD),
    beta: u.beta,
    ticker: u.ticker,
    text: hh => t.make(u, hh),
  };
}

// ---- prior population ------------------------------------------------------------
export interface CatalystPrior {
  /** Sessions back in the model's own generated history */
  sessionsBack: number;
  category: NewsCategory;
  sentiment: number;
  magnitude: number;
  beta: number;
  /** What the model expected the print to do, % */
  expMove1dPct: number;
  /** What it did once residual noise is applied, % */
  realized1dPct: number;
}

/** Sessions of its own history the model scores itself against (~one year). */
const PRIOR_SESSIONS = 252;

let priorCache: CatalystPrior[] | null = null;

/**
 * The population every base rate and every analog on this surface is measured
 * over: the same generator that prints today's feed, replayed across its own
 * past sessions. Change a template or a kick and these move with it.
 *
 * What it replaced was a hand-typed table — Earnings 3.1% / 71% / n=96, and six
 * more like it — rendered as "71% of the time, across 96 observations". Nothing
 * had observed anything. There is no market history behind this terminal, and a
 * sample size is a claim about evidence, so the only base rate that can honestly
 * be printed is the one the model's own assumptions produce.
 *
 * Fixed seeds, not the session day: a prior does not change because a day
 * passed, and a base rate that re-rolled nightly would not be a base rate.
 */
export function catalystPriors(): readonly CatalystPrior[] {
  if (priorCache) return priorCache;
  const out: CatalystPrior[] = [];
  for (let s = 1; s <= PRIOR_SESSIONS; s++) {
    for (let i = 0; i < FEED_SIZE; i++) {
      const seed = `prior-${s}-${i}`;
      const h = (tag: string) => h01(`${seed}-${tag}`);
      const c = rollCatalyst(h('macro') < MACRO_SHARE, h);
      const expMove1dPct = expMove1d(c.category, c.sentiment, c.magnitude, c.beta, seed);
      out.push({
        sessionsBack: s,
        category: c.category,
        sentiment: c.sentiment,
        magnitude: c.magnitude,
        beta: c.beta,
        expMove1dPct,
        realized1dPct: expMove1dPct + residual1d(c.beta, c.magnitude, seed),
      });
    }
  }
  priorCache = out;
  return out;
}

export interface CategoryBaseRate {
  /** Priors measured — simulated events, not observations of a market */
  n: number;
  /** Share that closed the way their headline leaned, % */
  hitPct: number;
  /** Median absolute realized move, % */
  medianPct: number;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

let baseCache: Record<NewsCategory, CategoryBaseRate> | null = null;

/** Per-category base rate, measured across `catalystPriors()`. */
export function categoryBaseRates(): Record<NewsCategory, CategoryBaseRate> {
  if (baseCache) return baseCache;
  const moves = new Map<NewsCategory, number[]>();
  const hits = new Map<NewsCategory, number>();
  for (const p of catalystPriors()) {
    const arr = moves.get(p.category);
    if (arr) arr.push(Math.abs(p.realized1dPct));
    else moves.set(p.category, [Math.abs(p.realized1dPct)]);
    if (p.realized1dPct * p.sentiment > 0) hits.set(p.category, (hits.get(p.category) ?? 0) + 1);
  }
  const out = {} as Record<NewsCategory, CategoryBaseRate>;
  for (const [category, arr] of moves) {
    out[category] = {
      n: arr.length,
      hitPct: Math.round(((hits.get(category) ?? 0) / arr.length) * 100),
      medianPct: Math.round(median(arr) * 10) / 10,
    };
  }
  baseCache = out;
  return out;
}

function predict(category: NewsCategory, sentiment: number, magnitude: number, beta: number, seed: string): NewsPrediction {
  const expMove1dPct = expMove1d(category, sentiment, magnitude, beta, seed);
  const expMove5dPct = expMove1dPct * (1.35 + h01(`${seed}-em5`) * 0.5);
  const probUpPct = Math.round(50 + 40 * Math.tanh(sentiment * magnitude * 2.1));
  const confidencePct = Math.round(42 + magnitude * 40 + h01(`${seed}-cf`) * 12);
  const base = categoryBaseRates()[category];
  const dir = sentiment >= 0 ? 'higher' : 'lower';
  // Says what the number is before it says what it is worth: these are the
  // model's own simulated priors, and the sentence must not be readable as
  // measured market history.
  const analog = `Measured over ${base.n} simulated ${category.toLowerCase()} catalysts from this model's own generator — no market history stands behind it: median ${base.medianPct}% move, ${base.hitPct}% closed ${dir} next session.`;

  let playbook: string;
  const abs1d = Math.abs(expMove1dPct);
  if (confidencePct < 55 || abs1d < 0.6) {
    playbook = 'Low-edge headline, no trade on its own. Stack it with flow and positioning before acting.';
  } else if (sentiment > 0 && magnitude > 0.6) {
    playbook = 'Strength tends to hold. Buy the first pullback rather than the open print; invalid if day-one gains fully fade.';
  } else if (sentiment > 0) {
    playbook = 'Modest positive drift expected. Sell into the pop if it overshoots the expected move.';
  } else if (magnitude > 0.6) {
    playbook = 'Downside repricing usually runs multiple sessions. Fade bounces while the 5-day expected move stays negative.';
  } else {
    playbook = 'Knee-jerk dip likely absorbed. Wait for stabilization; reassess if a second headline lands.';
  }

  return {
    probUpPct,
    expMove1dPct,
    expMove5dPct,
    confidencePct,
    analog,
    baseN: base.n,
    baseHitPct: base.hitPct,
    baseMedianPct: base.medianPct,
    playbook,
  };
}

// ---- feed ------------------------------------------------------------------------
export function buildNewsFeed(): NewsItem[] {
  const day = dayKey();
  const items: NewsItem[] = [];
  const seen = new Set<string>(); // headline text already used this feed

  for (let i = 0; i < FEED_SIZE; i++) {
    const seed = `news-${day}-${i}`;
    const baseH = (tag: string) => h01(`${seed}-${tag}`);
    const isMacro = baseH('macro') < MACRO_SHARE;
    const minutesAgo = Math.floor(Math.pow(baseH('t'), 1.25) * 420) + 2;
    const ts = new Date(Date.now() - minutesAgo * 60000);
    const time = `${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}`;

    // Re-roll the copy (salted) until it's unique in this feed — the template
    // pools are small, so two items can otherwise print byte-identical
    // headlines (e.g. two names "unveil a next-gen flagship product line").
    // The macro/name split stays fixed per slot so the feed mix is stable.
    let built: NewsItem | null = null;
    for (let salt = 0; salt < 8; salt++) {
      const last = salt === 7;
      const h = salt === 0 ? baseH : (tag: string) => h01(`${seed}-r${salt}-${tag}`);
      const c = rollCatalyst(isMacro, h);
      const headline = c.text(h);
      if (seen.has(headline) && !last) continue;
      built = {
        id: seed,
        time,
        minutesAgo,
        source: PROVENANCE,
        ticker: c.ticker,
        headline,
        category: c.category,
        sentiment: c.sentiment,
        magnitude: c.magnitude,
        prediction: predict(c.category, c.sentiment, c.magnitude, c.beta, seed),
      };
      break;
    }
    if (built) {
      seen.add(built.headline);
      items.push(built);
    }
  }

  return items.sort((a, b) => a.minutesAgo - b.minutesAgo);
}

/** Aggregate news lean for one name, −1…+1 — consumed by Compass and Stocks. */
export function tickerSentiment(ticker: string): number {
  const feed = buildNewsFeed();
  const mine = feed.filter(n => n.ticker === ticker);
  if (mine.length === 0) {
    // No headline today — drift with a mild deterministic sector mood instead.
    const u = lookup(ticker);
    return u ? hRange(`${dayKey()}-mood-${u.sector}`, -0.25, 0.35) : 0;
  }
  const w = mine.reduce((a, n) => a + Math.abs(n.magnitude), 0) || 1;
  return mine.reduce((a, n) => a + n.sentiment * Math.abs(n.magnitude), 0) / w;
}

/**
 * The one cut that turns a −1…+1 sentiment into a direction word. Exported so
 * the tape-mood mix and the per-headline tone read off the same threshold —
 * they were two separate literals and could disagree on the same headline.
 */
export const SENTIMENT_CUT = 0.12;
export type NewsLean = 'bullish' | 'bearish' | 'flat';
export const newsLean = (s: number): NewsLean => (s > SENTIMENT_CUT ? 'bullish' : s < -SENTIMENT_CUT ? 'bearish' : 'flat');

export interface MarketMood {
  score: number;
  label: string;
  note: string;
  /** Headline counts behind the score — what the reader can actually check */
  mix: Record<NewsLean, number>;
  /** Headlines carried by each catalyst type, biggest first */
  byCategory: Array<{ category: NewsCategory; count: number }>;
  nameCount: number;
  macroCount: number;
}

/** Overall tape mood from the feed — the gauge at the top of the News page. */
export function marketMood(): MarketMood {
  const feed = buildNewsFeed();
  const w = feed.reduce((a, n) => a + n.magnitude, 0) || 1;
  const score = feed.reduce((a, n) => a + n.sentiment * n.magnitude, 0) / w;
  const label = score > 0.15 ? 'RISK-ON' : score < -0.15 ? 'RISK-OFF' : 'MIXED';

  const mix: Record<NewsLean, number> = { bullish: 0, bearish: 0, flat: 0 };
  const cats = new Map<NewsCategory, number>();
  for (const n of feed) {
    mix[newsLean(n.sentiment)] += 1;
    cats.set(n.category, (cats.get(n.category) ?? 0) + 1);
  }
  const byCategory = [...cats.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

  const note =
    label === 'RISK-ON'
      ? 'Positive catalysts outweigh. Dips are getting bought while the tape digests good news.'
      : label === 'RISK-OFF'
        ? 'Negative catalysts dominate. Rallies are suspect until the headline pressure clears.'
        : 'Cross-currents in the tape: single-name stories matter more than index direction today.';
  return {
    score,
    label,
    note,
    mix,
    byCategory,
    nameCount: feed.filter(n => n.ticker).length,
    macroCount: feed.filter(n => !n.ticker).length,
  };
}
