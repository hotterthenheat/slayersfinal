import { describe, it, expect } from 'vitest';
import {
  buildNewsFeed,
  catalystPriors,
  categoryBaseRates,
  type NewsCategory,
  type NewsItem,
} from './news';
import { lookup } from './universe';

/*
  What the news surface is allowed to CLAIM, pinned.

  Nothing here tested this module before, so a green suite said nothing about
  it, and three fabrications lived behind that green. Ratings and price targets
  were attributed to six real investment banks and datelined to real newswires,
  which put a research citation on a story no firm issued and no wire ran. The
  base rates were a hand-typed table — Earnings 3.1% / 71% / n=96 — rendered as
  "71% of the time, across 96 observations" when nothing had observed anything.
  And the hit rate, once it was genuinely derived, was still printed with a
  direction word borrowed from whichever headline was selected: the same 66%
  read "closed higher" on a bullish print and "closed lower" on a bearish one,
  while only 49% of those priors closed up either way.

  The through-line is that a figure tracing to the engine is not enough — the
  label has to describe the quantity that was actually measured. These tests
  re-derive the base rates from the prior population rather than asking the
  engine to confirm its own table.
*/

const CATEGORIES: NewsCategory[] = [
  'Earnings',
  'Guidance',
  'Analyst',
  'Macro',
  'M&A',
  'Product',
  'Regulatory',
];

/*
  Real-world proper nouns that must never reappear as an AUTHORITY — a firm
  behind a rating, a wire behind a dateline, an official behind a quote. Matched
  on word boundaries because ordinary catalyst copy contains them as substrings —
  "defend" carries "Fed", "second half" carries "SEC".
*/
const REAL_WORLD_NAMES = [
  'Goldman', 'Sachs', 'Morgan', 'JPMorgan', 'Citi', 'Citigroup', 'Barclays', 'UBS',
  'Jefferies', 'Wedbush', 'Bernstein', 'Evercore', 'Stifel', 'Oppenheimer', 'Cowen',
  'Mizuho', 'Nomura', 'Deutsche', 'HSBC', 'BofA', 'Merrill', 'Baird', 'Piper',
  'Bloomberg', 'Reuters', 'CNBC', 'WSJ', 'Barron', 'MarketWatch', 'Benzinga', 'Dow Jones',
  'Fed', 'FOMC', 'Powell', 'SEC', 'FTC', 'DOJ', 'FDA', 'Treasury',
];

/*
  A name headline opens on the universe row it is about — the template pool is
  all `${u.name} …` — so the subject is stripped before the blacklist runs and
  what is matched is the CLAIM. Five curated names collide with the list
  word-for-word (Goldman Sachs, Morgan Stanley, JPMorgan Chase, Citigroup,
  Kinder Morgan), and a company being the subject of its own story is not the
  defect: "Goldman Sachs beats on top and bottom line" is a headline, "Goldman
  Sachs raises its target" would be borrowed authority. The fields an
  attribution would have to live in — source, and the model's own read — are
  matched whole.

  Blacklisting the subject too made this test a coin flip on the calendar:
  buildNewsFeed() draws on the session day, so it went red on every date whose
  roll landed on one of those five and green on the rest.
*/
const claimOf = (n: NewsItem): string => {
  const subject = n.ticker ? lookup(n.ticker)?.name : null;
  return subject && n.headline.startsWith(subject) ? n.headline.slice(subject.length) : n.headline;
};

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

describe('news feed carries no borrowed authority', () => {
  const feed = buildNewsFeed();

  it('renders a feed', () => {
    expect(feed.length).toBeGreaterThan(0);
  });

  it('cites no real firm, wire or regulator behind any rendered claim', () => {
    const rendered = feed.flatMap(n => [
      claimOf(n),
      n.source,
      n.prediction.analog,
      n.prediction.playbook,
    ]);
    for (const name of REAL_WORLD_NAMES) {
      const re = new RegExp(`\\b${name}\\b`);
      const hit = rendered.find(s => re.test(s));
      expect(hit ?? '', `"${name}" appears in rendered news copy`).toBe('');
    }
  });

  it('tags every row with provenance rather than a byline', () => {
    // One value, on every row: there is no wire behind this terminal.
    expect([...new Set(feed.map(n => n.source))]).toEqual(['MODELED']);
  });

  it('quotes no price target or rating in a headline', () => {
    // A target is somebody's number and a rating is somebody's opinion; with
    // nobody behind them they read as research. $-figures and PT/target copy
    // are how they came back last time.
    for (const n of feed) {
      expect(n.headline).not.toMatch(/\$\s?\d/);
      expect(n.headline).not.toMatch(/\b(price target|PT|upgrades? to|downgrades? to|initiates? at)\b/i);
    }
  });
});

describe('base rates are derived, not asserted', () => {
  const priors = catalystPriors();
  const rates = categoryBaseRates();

  it('covers every category the feed can emit', () => {
    // predict() dereferences base.n unconditionally — a missing category is a
    // crash, not a blank.
    for (const c of CATEGORIES) expect(rates[c], `no base rate for ${c}`).toBeDefined();
  });

  it('counts n from the prior population', () => {
    for (const c of CATEGORIES) {
      expect(rates[c].n).toBe(priors.filter(p => p.category === c).length);
    }
    expect(CATEGORIES.reduce((a, c) => a + rates[c].n, 0)).toBe(priors.length);
  });

  it('re-derives hit rate and median independently', () => {
    for (const c of CATEGORIES) {
      const g = priors.filter(p => p.category === c);
      const hits = g.filter(p => p.realized1dPct * p.sentiment > 0).length;
      expect(rates[c].hitPct).toBe(Math.round((hits / g.length) * 100));
      expect(rates[c].medianPct).toBe(Math.round(median(g.map(p => Math.abs(p.realized1dPct))) * 10) / 10);
    }
  });
});

describe('the base-rate sentence describes the quantity it measured', () => {
  const feed = buildNewsFeed();

  it('never restates a direction-resolved hit rate as up or down', () => {
    // hitPct is the share that resolved in its OWN headline's direction, which
    // is directionless — "closed higher"/"closed lower" is a different claim.
    for (const n of feed) {
      expect(n.prediction.analog).not.toMatch(/closed (higher|lower)/);
    }
  });

  it('says the priors are simulated and disclaims market history', () => {
    for (const n of feed) {
      expect(n.prediction.analog).toMatch(/simulated/);
      expect(n.prediction.analog).toMatch(/no market history/);
    }
  });

  it('quotes the same hit rate for a category regardless of headline lean', () => {
    // The tell that the old label was detached from the measurement: the figure
    // is a property of the category, so two items of one category must quote it
    // identically no matter which way each leans.
    const byCategory = new Map<NewsCategory, number[]>();
    for (const n of feed) {
      const arr = byCategory.get(n.category) ?? [];
      arr.push(n.prediction.baseHitPct);
      byCategory.set(n.category, arr);
    }
    for (const [c, hits] of byCategory) {
      expect(new Set(hits).size, `${c} quotes more than one hit rate`).toBe(1);
      expect(hits[0]).toBe(categoryBaseRates()[c].hitPct);
    }
  });
});
