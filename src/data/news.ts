/*
==================================================
  SLAYER TERMINAL - NEWS + OUTCOME MODEL (news.ts)
  Two jobs: a stock-news feed, and a predictive read
  of each headline — direction odds, expected move
  and the historical analog behind the number.
  Deterministic per session day; the real wire and
  model API fill the same contract later.
==================================================
*/

import { dayKey, h01, hPick, hRange } from '../core/rng';
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
  /** The historical base rate behind the number */
  analog: string;
  /** What to do with it */
  playbook: string;
}

export interface NewsItem {
  id: string;
  time: string;
  minutesAgo: number;
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

const SOURCES = ['Bloomberg', 'Reuters', 'WSJ', 'CNBC', 'Barrons', 'FT'];
const BANKS = ['Morgan Stanley', 'Goldman', 'JPMorgan', 'Citi', 'UBS', 'Barclays'];

interface Template {
  category: NewsCategory;
  sentiment: number;
  magnitude: number;
  make: (u: UniverseName, h: (tag: string) => number) => string;
}

const TICKER_TEMPLATES: Template[] = [
  {
    category: 'Analyst',
    sentiment: 0.55,
    magnitude: 0.4,
    make: (u, h) =>
      `${BANKS[Math.floor(h('bank') * BANKS.length)]} upgrades ${u.name} to Buy, lifts target to $${Math.round(u.px * (1.12 + h('pt') * 0.15))}`,
  },
  {
    category: 'Analyst',
    sentiment: -0.5,
    magnitude: 0.38,
    make: (u, h) =>
      `${BANKS[Math.floor(h('bank') * BANKS.length)]} cuts ${u.name} to Neutral on ${hPickStr(h('why'), ['valuation', 'margin pressure', 'demand risk'])}`,
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
    make: (u, h) =>
      `${BANKS[Math.floor(h('bank') * BANKS.length)]} initiates ${u.name} at Overweight, Street-high $${Math.round(u.px * (1.18 + h('pt') * 0.2))} target`,
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
      `${u.name} authorizes $${2 + Math.floor(h('bb') * 18)}B buyback; signals confidence in ${hPickStr(h('conf'), ['cash flow', 'the setup into year-end', 'end-market demand'])}`,
  },
  {
    category: 'M&A',
    sentiment: 0.6,
    magnitude: 0.75,
    make: (u, h) => `${u.name} in advanced talks to acquire ${hPickStr(h('tgt'), ['a private AI startup', 'a logistics rival', 'a fintech platform'])}, sources say`,
  },
  {
    category: 'Regulatory',
    sentiment: -0.6,
    magnitude: 0.55,
    make: (u, h) =>
      `${hPickStr(h('agency'), ['FTC', 'DOJ', 'EU Commission'])} opens review into ${u.name}'s ${hPickStr(h('area'), ['market practices', 'pending acquisition', 'data handling'])}`,
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

const MACRO_TEMPLATES: Array<{ sentiment: number; magnitude: number; text: string }> = [
  { sentiment: 0.5, magnitude: 0.7, text: 'CPI cools to 2.4% y/y vs 2.6% est — rate-cut odds firm up' },
  { sentiment: -0.45, magnitude: 0.65, text: '10-yr yield pushes through 4.6% as supply concerns build' },
  { sentiment: 0.35, magnitude: 0.5, text: 'Jobless claims steady; soft-landing narrative intact' },
  { sentiment: -0.55, magnitude: 0.7, text: 'ISM services surprise contraction — growth scare risk returns' },
  { sentiment: 0.2, magnitude: 0.45, text: "Fed's Waller: policy 'well positioned', open to cuts if inflation cooperates" },
  { sentiment: -0.3, magnitude: 0.5, text: 'Crude jumps 3% on supply disruption; transports lag' },
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

const CATEGORY_BASE: Record<NewsCategory, { median: string; hit: number; n: number }> = {
  Earnings: { median: '3.1%', hit: 71, n: 96 },
  Guidance: { median: '2.6%', hit: 68, n: 74 },
  'M&A': { median: '2.2%', hit: 66, n: 38 },
  Regulatory: { median: '1.6%', hit: 62, n: 45 },
  Analyst: { median: '1.1%', hit: 60, n: 132 },
  Product: { median: '0.9%', hit: 57, n: 88 },
  Macro: { median: '0.8%', hit: 58, n: 210 },
};

function predict(category: NewsCategory, sentiment: number, magnitude: number, beta: number, seed: string): NewsPrediction {
  const kick = CATEGORY_KICK[category];
  const signal = sentiment * magnitude;
  const expMove1dPct = signal * kick * beta * (0.85 + h01(`${seed}-em`) * 0.3);
  const expMove5dPct = expMove1dPct * (1.35 + h01(`${seed}-em5`) * 0.5);
  const probUpPct = Math.round(50 + 40 * Math.tanh(signal * 2.1));
  const confidencePct = Math.round(42 + magnitude * 40 + h01(`${seed}-cf`) * 12);
  const base = CATEGORY_BASE[category];
  const dir = sentiment >= 0 ? 'higher' : 'lower';
  const analog = `${base.n} similar ${category.toLowerCase()} headlines on large caps: median ${base.median} move, ${base.hit}% closed ${dir} next session.`;

  let playbook: string;
  const abs1d = Math.abs(expMove1dPct);
  if (confidencePct < 55 || abs1d < 0.6) {
    playbook = 'Low-edge headline — no trade on its own. Stack it with flow and positioning before acting.';
  } else if (sentiment > 0 && magnitude > 0.6) {
    playbook = 'Strength tends to hold — buy the first pullback rather than the open print; invalid if day-one gains fully fade.';
  } else if (sentiment > 0) {
    playbook = 'Modest positive drift expected — sell into the pop if it overshoots the expected move.';
  } else if (magnitude > 0.6) {
    playbook = 'Downside repricing usually runs multiple sessions — fade bounces while the 5-day expected move stays negative.';
  } else {
    playbook = 'Knee-jerk dip likely absorbed — wait for stabilization; reassess if a second headline lands.';
  }

  return {
    probUpPct,
    expMove1dPct,
    expMove5dPct,
    confidencePct,
    analog,
    playbook,
  };
}

// ---- feed ------------------------------------------------------------------------
const FEED_SIZE = 18;

export function buildNewsFeed(): NewsItem[] {
  const day = dayKey();
  const items: NewsItem[] = [];
  const seen = new Set<string>(); // headline text already used this feed

  for (let i = 0; i < FEED_SIZE; i++) {
    const seed = `news-${day}-${i}`;
    const baseH = (tag: string) => h01(`${seed}-${tag}`);
    const isMacro = baseH('macro') < 0.28;
    const minutesAgo = Math.floor(Math.pow(baseH('t'), 1.25) * 420) + 2;
    const ts = new Date(Date.now() - minutesAgo * 60000);
    const time = `${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}`;
    const source = hPick(`${seed}-src`, SOURCES);

    // Re-roll the copy (salted) until it's unique in this feed — the template
    // pools are small, so two items can otherwise print byte-identical
    // headlines (e.g. two names "unveil a next-gen flagship product line").
    // The macro/name split stays fixed per slot so the feed mix is stable.
    let built: NewsItem | null = null;
    for (let salt = 0; salt < 8; salt++) {
      const last = salt === 7;
      const h = salt === 0 ? baseH : (tag: string) => h01(`${seed}-r${salt}-${tag}`);
      if (isMacro) {
        const t = MACRO_TEMPLATES[Math.floor(h('mt') * MACRO_TEMPLATES.length)];
        if (seen.has(t.text) && !last) continue;
        const sentiment = t.sentiment * (0.85 + h('sj') * 0.3);
        const magnitude = t.magnitude * (0.85 + h('mj') * 0.3);
        built = {
          id: seed, time, minutesAgo, source, ticker: null, headline: t.text,
          category: 'Macro', sentiment, magnitude,
          prediction: predict('Macro', sentiment, magnitude, 1, seed),
        };
      } else {
        const u = UNIVERSE[Math.floor(h('tk') * UNIVERSE.length)];
        const t = TICKER_TEMPLATES[Math.floor(h('tpl') * TICKER_TEMPLATES.length)];
        const headline = t.make(u, h);
        if (seen.has(headline) && !last) continue;
        const sentiment = t.sentiment * (0.8 + h('sj') * 0.4);
        const magnitude = t.magnitude * (0.8 + h('mj') * 0.4);
        built = {
          id: seed, time, minutesAgo, source, ticker: u.ticker, headline,
          category: t.category, sentiment, magnitude,
          prediction: predict(t.category, sentiment, magnitude, u.beta, seed),
        };
      }
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

/** Overall tape mood from the feed — the gauge at the top of the News page. */
export function marketMood(): { score: number; label: string; note: string } {
  const feed = buildNewsFeed();
  const w = feed.reduce((a, n) => a + n.magnitude, 0) || 1;
  const score = feed.reduce((a, n) => a + n.sentiment * n.magnitude, 0) / w;
  const label = score > 0.15 ? 'RISK-ON' : score < -0.15 ? 'RISK-OFF' : 'MIXED';
  const note =
    label === 'RISK-ON'
      ? 'Positive catalysts outweigh — dips are getting bought while the tape digests good news.'
      : label === 'RISK-OFF'
        ? 'Negative catalysts dominate — rallies are suspect until the headline pressure clears.'
        : 'Cross-currents in the tape — single-name stories matter more than index direction today.';
  return { score, label, note };
}
