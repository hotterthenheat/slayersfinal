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
import { UNIVERSE, lookup, type UniverseName, type Sector } from './universe';

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
  /* 8.1 — WHY THE SCORE IS WHAT IT IS.

     "Sentiment display per article with the sentiment REASONING on hover —
     the reasoning field is the differentiator; don't drop it."

     A bare +0.7 next to a headline is a number the reader must either
     accept or ignore, and most will ignore it. The reasoning is what makes
     it checkable: a reader who disagrees with the reason can discount the
     score, which is the only useful thing to do with a sentiment model.

     Derived from the SAME template that set the score, so the words and
     the number cannot drift apart — there is no second place where a
     reason could be written down and quietly stop matching. */
  sentimentWhy: string;
  /** 0…1 — how market-moving the item is */
  magnitude: number;
  prediction: NewsPrediction;
}

/*
  8.1 · WHY THE SCORE IS WHAT IT IS.

  A bare +0.7 beside a headline is a number the reader must accept or
  ignore, and most will ignore it. The reasoning makes it CHECKABLE: a
  reader who disagrees with the reason can discount the score, which is the
  only useful thing anybody does with a sentiment model.

  KEYED TO THE CATEGORY AND THE DIRECTION, which is what actually decides
  the score — every template's sentiment is a constant chosen because of
  what KIND of news it is and which way it cuts. Writing a separate reason
  on each of the twenty-four templates would put the same fact in
  twenty-four places and let it drift from the number beside it; deriving
  it from the two inputs that set the score means the words cannot be wrong
  unless the score is.

  EACH REASON SAYS WHAT THE CATEGORY DOES TO A PRICE, not whether the news
  is good. "Analyst upgrade" is not an argument; "it moves the published
  expectation rather than the business, and the effect is usually one
  session" is one a reader can disagree with.
*/
const SENTIMENT_REASONS: Record<NewsCategory, { up: string; down: string }> = {
  Analyst: {
    up: 'A sell-side upgrade. Scored moderately positive: it moves the published expectation rather than the business, and the effect is usually one session unless the target is far from consensus.',
    down: 'A sell-side downgrade with a named cause. Same logic as an upgrade and the same modest weight — expectations moved, fundamentals did not.',
  },
  Guidance: {
    up: 'Management raised its own forecast. Scored strongly positive because it is the company revising the number every model is built on — the one forecast with inside information behind it.',
    down: 'Management cut its own forecast. Scored strongly negative for the same reason, and slightly harder than a raise: firms are reluctant to cut, so a cut usually understates the problem.',
  },
  Product: {
    up: 'A product or launch story. Scored mildly positive — it is the category with the loosest link to a quarter, and the market discounts announcements it cannot yet count in revenue.',
    down: 'A product setback — a recall, a delay, a failure. Scored negative harder than a launch is scored positive: the cost is immediate and the revenue was not yet booked.',
  },
  'M&A': {
    up: 'A deal story. Scored positive and high-magnitude: a bid re-rates a whole book, but the direction depends on which side this name is, and a talks-stage report is not a signed deal.',
    down: 'A deal falling apart or a bid withdrawn. Scored negative because the premium priced in comes back out at once.',
  },
  Regulatory: {
    up: 'A regulatory outcome in the name\'s favour — an approval, a case closed. Scored strongly positive: it removes a discount the market was already applying.',
    down: 'A regulator opening or escalating. Scored strongly negative and slow-burning: the cost is unknown, the timeline is long, and uncertainty itself carries a discount.',
  },
  Earnings: {
    up: 'A reported beat. The highest-magnitude category on the wire — it is the only one where the market gets an actual number rather than a claim about a future one.',
    down: 'A reported miss. Same magnitude, opposite sign, and the same reason: this is the number, not a forecast of it.',
  },
  Macro: {
    up: 'A macro release landing better than expected. Scored positive but attributed to no single name — it moves the whole board, which is why it carries no ticker.',
    down: 'A macro release landing worse than expected. Same breadth, opposite direction.',
  },
};

/** The one clause explaining a score, from the two things that set it. */
export function sentimentReason(category: NewsCategory, sentiment: number): string {
  const r = SENTIMENT_REASONS[category];
  if (!r) return 'Scored by category. No reasoning is recorded for this kind of story.';
  /* Zero has no direction and must not borrow one — a neutral headline
     that inherited the positive reason would be the model asserting a lean
     it does not have. */
  if (sentiment === 0) return 'Scored neutral: this kind of story moves a price only in combination with something else.';
  return sentiment > 0 ? r.up : r.down;
}

const SOURCES = ['Bloomberg', 'Reuters', 'WSJ', 'CNBC', 'Barrons', 'FT'];
const BANKS = ['Morgan Stanley', 'Goldman', 'JPMorgan', 'Citi', 'UBS', 'Barclays'];

/* A headline is only credible if it could be written about THIS company.
   "Broadcom unveils next-gen enterprise suite" is fine; the same line under
   Exxon is not, and a reader who catches the feed writing it stops trusting
   every other number on the desk. So a template may name the sectors it
   belongs to; one that names none is universal — an upgrade, a miss, a
   regulator's letter happen to everybody. */
interface Template {
  category: NewsCategory;
  sentiment: number;
  magnitude: number;
  /** Sectors this line fits. Omitted = fits every name. */
  sectors?: Sector[];
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
    sectors: ['Technology', 'Communication', 'Consumer Discretionary'],
    make: (u, h) =>
      `${u.name} unveils next-gen ${hPickStr(h('prod'), ['AI platform', 'flagship product line', 'enterprise suite'])}; early reviews positive`,
  },
  {
    category: 'M&A',
    sentiment: 0.6,
    magnitude: 0.75,
    make: (u, h) =>
      `${u.name} in advanced talks to acquire ${hPickStr(h('tgt'), SECTOR_TARGETS[u.sector])}, sources say`,
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

  /* ── the sector shelves ────────────────────────────────────────────────
     Lines that only make sense for the businesses they name. These are what
     stop the feed reading like one company's news with the ticker swapped:
     a chip name gets a foundry line, a bank gets a net-interest-margin
     line, an energy name gets a barrel. Each still carries its own
     sentiment and magnitude, so the outcome model treats them as first
     class rather than as flavour text. */
  {
    category: 'Product',
    sentiment: 0.6,
    magnitude: 0.55,
    sectors: ['Technology'],
    make: (u, h) =>
      `${u.name} says ${hPickStr(h('node'), ['3nm', '2nm', 'next-node'])} capacity is sold out through ${hPickStr(h('when'), ['next quarter', 'year end', 'the first half'])}`,
  },
  {
    category: 'Guidance',
    sentiment: -0.6,
    magnitude: 0.6,
    sectors: ['Technology'],
    make: (u, h) =>
      `${u.name} flags ${hPickStr(h('what'), ['foundry allocation', 'memory pricing', 'export-licence'])} pressure into next quarter`,
  },
  {
    category: 'Guidance',
    sentiment: 0.5,
    magnitude: 0.6,
    sectors: ['Financials'],
    make: (u, h) =>
      `${u.name} lifts net-interest-income outlook; ${hPickStr(h('why'), ['deposit costs ease', 'loan growth holds', 'credit stays clean'])}`,
  },
  {
    category: 'Guidance',
    sentiment: -0.6,
    magnitude: 0.62,
    sectors: ['Financials'],
    make: (u, h) =>
      `${u.name} builds reserves as ${hPickStr(h('book'), ['card', 'commercial real-estate', 'small-business'])} charge-offs tick up`,
  },
  {
    /* Guidance, not Macro: it is this company's own production outlook, and
       tagging it Macro would file a single name's news under the shelf a
       reader keeps for CPI prints. */
    category: 'Guidance',
    sentiment: 0.55,
    magnitude: 0.6,
    sectors: ['Energy'],
    make: (u, h) =>
      `${u.name} lifts production guidance as ${hPickStr(h('basin'), ['Permian', 'Gulf', 'offshore'])} output beats plan`,
  },
  {
    category: 'Guidance',
    sentiment: -0.55,
    magnitude: 0.58,
    sectors: ['Energy'],
    make: (u, h) =>
      `${u.name} takes ${hPickStr(h('unit'), ['refining', 'chemicals', 'upstream'])} margin hit on weaker crack spreads`,
  },
  {
    category: 'Regulatory',
    sentiment: 0.75,
    magnitude: 0.8,
    sectors: ['Health Care'],
    make: (u, h) =>
      `FDA clears ${u.name}'s ${hPickStr(h('drug'), ['lead candidate', 'label expansion', 'combination therapy'])} ahead of schedule`,
  },
  {
    category: 'Regulatory',
    sentiment: -0.8,
    magnitude: 0.85,
    sectors: ['Health Care'],
    make: (u, h) =>
      `${u.name} trial misses primary endpoint in ${hPickStr(h('ph'), ['Phase II', 'Phase III'])}; programme under review`,
  },
  {
    category: 'Product',
    sentiment: -0.55,
    magnitude: 0.6,
    sectors: ['Consumer Discretionary'],
    make: (u, h) =>
      `${u.name} recalls ${hPickStr(h('n'), ['a production batch', 'several model years'])} over a ${hPickStr(h('fault'), ['software', 'supplier', 'assembly'])} fault`,
  },
  {
    category: 'Guidance',
    sentiment: 0.5,
    magnitude: 0.5,
    sectors: ['Consumer Discretionary', 'Consumer Staples'],
    make: (u, h) =>
      `${u.name} reports ${(1 + h('comp') * 5).toFixed(1)}% same-store sales growth; traffic leads ticket`,
  },
  {
    category: 'Guidance',
    sentiment: -0.5,
    magnitude: 0.52,
    sectors: ['Consumer Staples'],
    make: (u, h) =>
      `${u.name} says ${hPickStr(h('in'), ['input costs', 'freight', 'packaging'])} will outrun pricing into next year`,
  },
  {
    category: 'Guidance',
    sentiment: 0.55,
    magnitude: 0.58,
    sectors: ['Industrials', 'Materials'],
    make: (u, h) =>
      `${u.name} books a ${hPickStr(h('sz'), ['multi-year', 'record'])} order backlog in ${hPickStr(h('seg'), ['aerospace', 'defence', 'infrastructure'])}`,
  },
  {
    category: 'Guidance',
    sentiment: -0.5,
    magnitude: 0.55,
    sectors: ['Industrials', 'Materials'],
    make: (u, h) =>
      `${u.name} warns on ${hPickStr(h('seg'), ['destocking', 'freight rates', 'input inflation'])}; orders slip quarter on quarter`,
  },
  {
    category: 'Regulatory',
    sentiment: -0.5,
    magnitude: 0.55,
    sectors: ['Utilities'],
    make: (u, h) =>
      `Regulator defers ${u.name}'s rate case; ${hPickStr(h('spend'), ['grid hardening', 'capex recovery', 'storm cost'])} recovery slips`,
  },
  {
    category: 'Product',
    sentiment: 0.5,
    magnitude: 0.5,
    sectors: ['Communication'],
    make: (u, h) =>
      `${u.name} posts record ${hPickStr(h('eng'), ['engagement', 'paid subscribers', 'ad impressions'])}; monetisation ahead of plan`,
  },
];

/* What a company in each sector would plausibly be buying — the M&A line
   used to offer every name the same three targets, which is how a utility
   ended up bidding for a fintech platform. */
const SECTOR_TARGETS: Record<Sector, string[]> = {
  Technology: ['a private AI startup', 'a chip-design house', 'an observability vendor'],
  Communication: ['a games studio', 'a streaming catalogue', 'an ad-tech platform'],
  'Consumer Discretionary': ['a direct-to-consumer brand', 'a logistics rival', 'a last-mile delivery network'],
  'Consumer Staples': ['a premium label', 'a regional bottler', 'a private-label manufacturer'],
  Financials: ['a fintech platform', 'a regional lender', 'a wealth-management book'],
  'Health Care': ['a clinical-stage biotech', 'a diagnostics business', 'a specialty pharma portfolio'],
  Energy: ['a Permian acreage package', 'a midstream operator', 'a renewables developer'],
  Industrials: ['an automation supplier', 'an aerospace parts maker', 'a rail logistics operator'],
  Materials: ['a specialty chemicals unit', 'a lithium project', 'a packaging business'],
  Utilities: ['a regional grid operator', 'a solar portfolio', 'a storage developer'],
};

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

/**
 * The templates a given sector may draw on: the universal ones plus its own
 * shelf. Exported so the acceptance test can prove no name is ever handed a
 * headline about a business it is not in.
 */
export function templatesFor(sector: Sector): Template[] {
  return TICKER_TEMPLATES.filter(t => !t.sectors || t.sectors.includes(sector));
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

// ---- the deep read ----------------------------------------------------------------
/*
  The outcome tab answers "what does this headline do to price". The deep read
  answers the harder question underneath it: how much of that is ALREADY in the
  price, how long the catalyst keeps working, and whether the options book is
  backing the story or leaning against it. Same contract, different depth.
*/

export interface NewsDeepRead {
  /** % of the expected move the tape has already discounted */
  pricedInPct: number;
  /** Sessions until the catalyst's pull halves */
  halfLifeSessions: number;
  /** The options market's implied move for the event, ± % */
  eventVolPct: number;
  /** −1…+1 — does the book agree with the wire? */
  bookAlignment: number;
  bookLabel: 'CONFIRMS' | 'NEUTRAL' | 'FADES';
  /** Which force is actually doing the moving */
  driver: 'INFORMATIONAL' | 'MECHANICAL';
  /** How far the book leans on its own, −1…+1 */
  bookLean: number;
  read: string;
  invalidation: string;
}

/*
  How long each kind of catalyst keeps working, in sessions. An analyst note is
  spent within a day; a deal reprices the name for a week. Scaled by how big the
  item is — a large-magnitude headline of any kind outlives a small one.
*/
const HALF_LIFE_SESSIONS: Record<NewsCategory, number> = {
  Earnings: 4.2,
  Guidance: 3.4,
  'M&A': 5.6,
  Analyst: 0.9,
  Macro: 2.3,
  Product: 1.8,
  Regulatory: 3.0,
};

const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The positioning read behind a headline — deterministic per item + session day. */
export function buildNewsDeepRead(item: NewsItem): NewsDeepRead {
  const day = dayKey();
  const s = (tag: string) => `${item.id}-${day}-deep-${tag}`;
  const { sentiment, magnitude, category, minutesAgo, prediction } = item;

  // Catalyst decay — bigger headlines keep working longer
  const halfLifeSessions = Number((HALF_LIFE_SESSIONS[category] * (0.7 + magnitude * 0.7)).toFixed(1));

  // Where the options book sits on its own, independent of the wire
  const bookLean = Number(hRange(s('book'), -0.85, 0.85).toFixed(2));
  // Agreement is signed: same direction = confirms, opposite = fades. A book (or
  // a wire) sitting near flat lands neutral no matter what the other one does.
  const agree = Math.sign(sentiment) === Math.sign(bookLean) ? 1 : -1;
  const bookAlignment = Number(
    clampN(agree * Math.min(Math.abs(sentiment), Math.abs(bookLean)) * 2.2, -1, 1).toFixed(2)
  );
  const bookLabel: NewsDeepRead['bookLabel'] =
    bookAlignment > 0.2 ? 'CONFIRMS' : bookAlignment < -0.2 ? 'FADES' : 'NEUTRAL';

  // Priced in. A headline that has already printed is never at zero — the tape
  // reacts on the first print — so the read starts at a base and climbs from
  // there: with the clock (how much of the half-life has burned) and with
  // positioning that was already leaning this way before the story landed. A
  // book leaning AGAINST it pulls the number down: that move is still to come.
  const elapsedSessions = minutesAgo / 390; // 390 min in a US session
  const burned = 1 - Math.pow(0.5, elapsedSessions / Math.max(halfLifeSessions, 0.1));
  const alignedShare = (bookAlignment + 1) / 2; // 0 = fully against, 1 = fully with
  const pricedInPct = Math.round(
    clampN(0.3 + 0.48 * burned + 0.2 * (alignedShare - 0.5) * 2, 0.05, 0.98) * 100
  );

  // What the options market charges for the event — always at least a little
  // wider than the model's point estimate, because it pays for both tails.
  const eventVolPct = Number(
    (Math.abs(prediction.expMove1dPct) * hRange(s('vol'), 1.05, 1.9) + 0.15).toFixed(1)
  );

  // If the book leans harder than the story does, the move is positioning
  // unwinding rather than the news being digested.
  const driver: NewsDeepRead['driver'] =
    Math.abs(bookLean) > Math.abs(sentiment) ? 'MECHANICAL' : 'INFORMATIONAL';

  const name = item.ticker ?? 'the index';
  const dirWord = sentiment >= 0 ? 'higher' : 'lower';
  const read =
    pricedInPct >= 70
      ? `Most of this is already in ${name} — about ${pricedInPct}% of the move has been discounted, and the catalyst is ${halfLifeSessions} sessions from losing half its pull. ${
          bookLabel === 'FADES'
            ? 'The options book is leaning the other way, which is the more interesting side of the trade.'
            : 'Chasing it here pays for information the tape already has.'
        }`
      : bookLabel === 'FADES'
        ? `The wire reads ${dirWord} but the book is positioned against it — only ${pricedInPct}% is discounted, so either the story is wrong or positioning is offside. ${
            driver === 'MECHANICAL' ? 'Positioning is the bigger force here.' : 'The story is the bigger force here.'
          }`
        : bookLabel === 'CONFIRMS'
          ? `Wire and book agree on ${name} — the story reads ${dirWord} and positioning is already tilted that way, with ${pricedInPct}% discounted and ${halfLifeSessions} sessions of pull left. Options are pricing ±${eventVolPct}% for the event.`
          : `The book is not taking a side on ${name} yet — ${pricedInPct}% discounted with ${halfLifeSessions} sessions of catalyst left, and options pricing ±${eventVolPct}%. ${
              driver === 'MECHANICAL' ? 'What moves it is positioning, not the headline.' : 'This one still trades on the story.'
            }`;

  const invalidation =
    sentiment >= 0
      ? `The read dies if ${name} gives back the initial pop and the book flips negative before the catalyst decays.`
      : `The read dies if ${name} reclaims the pre-headline level and the book stops leaning short.`;

  return {
    pricedInPct,
    halfLifeSessions,
    eventVolPct,
    bookAlignment,
    bookLabel,
    driver,
    bookLean,
    read,
    invalidation,
  };
}

// ---- feed ------------------------------------------------------------------------
const FEED_SIZE = 18;

export function buildNewsFeed(): NewsItem[] {
  const day = dayKey();
  const items: NewsItem[] = [];

  for (let i = 0; i < FEED_SIZE; i++) {
    const seed = `news-${day}-${i}`;
    const h = (tag: string) => h01(`${seed}-${tag}`);
    const isMacro = h('macro') < 0.28;
    const minutesAgo = Math.floor(Math.pow(h('t'), 1.25) * 420) + 2;
    const ts = new Date(Date.now() - minutesAgo * 60000);
    const time = `${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}`;
    const source = hPick(`${seed}-src`, SOURCES);

    if (isMacro) {
      const t = MACRO_TEMPLATES[Math.floor(h('mt') * MACRO_TEMPLATES.length)];
      const sentiment = t.sentiment * (0.85 + h('sj') * 0.3);
      const magnitude = t.magnitude * (0.85 + h('mj') * 0.3);
      items.push({
        id: seed,
        time,
        minutesAgo,
        source,
        ticker: null,
        headline: t.text,
        category: 'Macro',
        sentiment,
        sentimentWhy: sentimentReason('Macro', sentiment),
        magnitude,
        prediction: predict('Macro', sentiment, magnitude, 1, seed),
      });
    } else {
      const u = UNIVERSE[Math.floor(h('tk') * UNIVERSE.length)];
      /* Only lines that could be written about THIS company. The pool is
         rebuilt per name rather than filtered from a pre-picked template,
         because rejecting-and-retrying would bias the feed toward whatever
         the universal templates are and quietly starve the sector shelves. */
      const pool = templatesFor(u.sector);
      const t = pool[Math.floor(h('tpl') * pool.length)];
      const sentiment = t.sentiment * (0.8 + h('sj') * 0.4);
      const magnitude = t.magnitude * (0.8 + h('mj') * 0.4);
      items.push({
        id: seed,
        time,
        minutesAgo,
        source,
        ticker: u.ticker,
        headline: t.make(u, h),
        category: t.category,
        sentiment,
        sentimentWhy: sentimentReason(t.category, sentiment),
        magnitude,
        prediction: predict(t.category, sentiment, magnitude, u.beta, seed),
      });
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
  const label = score > 0.15 ? 'LEANS BULLISH' : score < -0.15 ? 'LEANS BEARISH' : 'MIXED';
  const note =
    label === 'LEANS BULLISH'
      ? 'Positive catalysts outweigh — good news is getting bought while the market digests it.'
      : label === 'LEANS BEARISH'
        ? 'Negative catalysts dominate — rallies look suspect until the headline pressure clears.'
        : 'Cross-currents today — single-name stories matter more than overall market direction.';
  return { score, label, note };
}
