import { UNIVERSE, lookup } from './universe';
import { h01, dayKey } from '../core/rng';

/*
==================================================
  SLAYER TERMINAL - INSIDER FLOW (data/insiderFlow.ts)
==================================================

  WHAT THE PEOPLE WHO RUN THE COMPANY ACTUALLY DID WITH THEIR OWN SHARES —
  and, far more importantly, WHETHER THEY CHOSE TO.

  THE DISTINCTION THE WHOLE SURFACE EXISTS FOR. Most insider selling is a
  10b5-1 plan: a schedule adopted months earlier, executed automatically,
  with the seller having no view on the day it prints. A tracker that shows
  "CFO sold $4m" without saying it was a plan has told a reader something
  false in every way that matters — the CFO did not decide to sell today,
  they decided last spring to sell on a calendar.

  Discretionary trades are the ones that carry information, and the
  asymmetry is sharp: there are many reasons to sell (a house, a tax bill,
  diversification) and essentially one reason to buy. So a discretionary
  BUY is the strongest signal on this surface and everything else is
  context. `signal` says exactly that, and it is a word, not a score.

  ROLES, NOT NAMES. A real filing names a person. This desk has no filing
  feed, so it reports the ROLE — the chief executive, a director — and
  invents nothing about a real individual. When a feed lands, a `person`
  field goes beside `role` and every reading above it keeps working. A
  simulated surface that printed plausible-looking trades attributed to
  real named officers would be a fabricated record, and nothing on this
  desk is worth that.

  PRICE IS AGAINST TODAY'S, so a reader sees whether the insider did better
  or worse than the market since. That is the only comparison a filed price
  supports honestly — it is not a claim about their timing skill, it is the
  arithmetic.
*/

export type InsiderRole = 'CEO' | 'CFO' | 'COO' | 'Director' | 'EVP' | 'Chief Legal Officer' | '10% owner';
export type InsiderKind = 'BUY' | 'SELL';

/*
  ── THE FORM 4 TRANSACTION CODE ─────────────────────────────────────────

  The SEC defines exactly twenty codes in five groups. The code is not
  metadata on a row — it IS the row's identity, and it is the single
  largest thing naive insider trackers get wrong.

  Most Form 4 filings are not open-market trades. A grant (A), an option
  exercise (M) and a tax withholding (F) are compensation plumbing: the
  comp committee acted, or a vesting schedule did, and the insider formed
  no view about price on that day. The canonical vesting sequence is M
  followed by F — an RSU converts, a slice is withheld for statutory
  withholding — and it appears in trackers as "insider dumps stock". The F
  row even carries a per-share price, the fair market value used to compute
  the withholding, which is exactly why parsers mistake it for a sale. The
  shares never reach the market.

  So `discretionary` is a property of the CODE, and the board defaults to
  the codes where someone actually decided something.

  Only the codes this desk models are listed. The full twenty are P S V /
  A D F I M / C E H O X / G L W Z / J K U; the rest arrive with a real
  EDGAR feed and slot in beside these without changing any reading above.
*/
export type TxCode = 'P' | 'S' | 'A' | 'M' | 'F' | 'G' | 'D';

export interface TxCodeMeta {
  code: TxCode;
  label: string;
  /** Did the filer choose the trade, and does price/timing reflect a view? */
  discretionary: boolean;
  /** Did shares actually change hands in the market? */
  openMarket: boolean;
  /** Does the row ADD shares to the filer's holding (A) or remove them (D)?
      Form 4's own acquired/disposed flag. It lives here rather than being
      re-derived at each call site: a grant that disposed of shares is the
      kind of contradiction two copies of this knowledge produce. */
  acquires: boolean;
  note: string;
}

export const TX_CODES: Record<TxCode, TxCodeMeta> = {
  P: {
    code: 'P',
    label: 'Open-market purchase',
    discretionary: true,
    openMarket: true,
    acquires: true,
    note: 'The insider bought with their own money at a price they accepted. The one event on this surface with a single obvious motive behind it.',
  },
  S: {
    code: 'S',
    label: 'Open-market sale',
    discretionary: true,
    openMarket: true,
    acquires: false,
    note: 'A real sale into the market — though a sale has many motives a purchase does not: tax, diversification, a house.',
  },
  A: {
    code: 'A',
    label: 'Grant or award',
    discretionary: false,
    openMarket: false,
    acquires: true,
    note: 'The compensation committee acted, not the insider. No decision, no purchase, no price paid.',
  },
  M: {
    code: 'M',
    label: 'Option or RSU conversion',
    discretionary: false,
    openMarket: false,
    acquires: true,
    note: 'A derivative converting to shares under an exempt plan. Mechanical — and when a sale follows the same day it is usually funding the exercise, not an exit.',
  },
  F: {
    code: 'F',
    label: 'Shares withheld for tax',
    discretionary: false,
    openMarket: false,
    acquires: false,
    note: 'The issuer withheld shares at vesting to cover statutory withholding. The shares never reached the market; the price shown is the valuation used to compute it, not a trade.',
  },
  G: {
    code: 'G',
    label: 'Bona fide gift',
    discretionary: true,
    openMarket: false,
    acquires: false,
    note: 'Chosen, but not a market transaction and no proceeds. Reportable on Form 4 within two business days since February 2023.',
  },
  D: {
    code: 'D',
    label: 'Disposition to the issuer',
    discretionary: false,
    openMarket: false,
    acquires: false,
    note: 'Shares returned to the company under a plan — a buyback or settlement, not a market sale.',
  },
};

/*
  ── THE 10b5-1 FLAG HAS THREE STATES, NOT TWO ───────────────────────────

  The checkbox became mandatory on Form 4 only for reports filed on or
  after 1 April 2023, and it does not apply to plans adopted before 27
  February 2023. So a row can be: filed under a plan, filed with the box
  unchecked, or from a vintage where the answer was never captured.

  Rendering that as a boolean would imply conviction the data does not
  support — an old discretionary-looking sale that was actually a plan
  trade would read as a decision. `unknown` is a real answer and is drawn
  as one.
*/
export type PlanState = 'plan' | 'discretionary' | 'unknown';

export interface InsiderTrade {
  id: string;
  ticker: string;
  role: InsiderRole;
  /** Fictional filer name — see the note on `PEOPLE`. */
  person: string;
  /** The Form 4 transaction code. THE ROW'S IDENTITY, not metadata. */
  code: TxCode;
  kind: InsiderKind;
  /** Shares transacted. */
  shares: number;
  /** Filed price per share. */
  price: number;
  /** Dollars. */
  value: number;
  /** Days since the transaction. */
  daysAgo: number;
  /** True when it ran off a pre-set 10b5-1 schedule — the seller took no
      view on the day. Kept as a boolean for the readings that predate the
      three-state flag; `plan` below is the honest version. */
  planned: boolean;
  /** plan / discretionary / unknown — see the note on PlanState. */
  plan: PlanState;
  /** Filers acting in the same name inside 30 days. A cluster roughly
      doubles the abnormal return of a lone purchase, and every competing
      product buries it on a separate page. */
  clusterCount: number;
  /** Shares still held afterwards, so a sale can be read against the stake
      rather than in isolation. */
  heldAfter: number;
  /** Percent of the holding this trade represented. */
  stakePct: number;
  /** Percent this name has moved since, signed. */
  sincePct: number;
}

export interface InsiderFlow {
  ticker: string;
  trades: InsiderTrade[];
  /** Dollars bought and sold in the window. */
  bought: number;
  sold: number;
  /** Net dollars — negative is net selling, which is the normal state. */
  net: number;
  /** Dollars that ran off a schedule rather than a decision. */
  plannedValue: number;
  /** Dollars of COMPENSATION plumbing — grants, conversions, withholdings.
      Kept apart from bought/sold on purpose: summing a vesting event into
      "sold" is the error that produces the "CFO dumps $4m" headline. */
  compValue: number;
  /** Distinct filers who bought on the open market inside 30 days. */
  buyerCluster: number;
  /** Discretionary buys — the informative subset. */
  openMarketBuys: number;
  /** One word for what this adds up to. */
  signal: 'accumulating' | 'distributing' | 'scheduled selling' | 'quiet';
  windowDays: number;
}

const ROLES: InsiderRole[] = ['CEO', 'CFO', 'COO', 'Director', 'EVP', 'Chief Legal Officer', '10% owner'];

/*
  FICTIONAL FILERS. Noah asked for names so the page can be judged as a
  page before the API keys go in — these are invented people, and they are
  invented deliberately: a real officer's name attached to a trade they did
  not make is a fabricated record about a real person, and the UI looks
  identical either way. A real EDGAR feed replaces this array with the
  reportingOwner name off the filing.
*/
/*
  ROLE IS A PROPERTY OF THE PERSON AT A COMPANY, not of a row — and the
  singular offices are singular.

  Drawing a role per row put one filer on the board as CEO on one line and
  CFO on the next. Seeding on person+ticker fixed that but left a second
  contradiction: two different people both drawing CEO of the same company.
  So the offices that only one person can hold are handed out by RANK — the
  people are ordered deterministically per ticker, and the first three take
  chief executive, chief financial and chief operating. Everyone after them
  gets a title a company can have several of.

  A reader who spots two CEOs stops believing the rest of the table, and
  they are right to.
*/
const SINGULAR_ROLES: InsiderRole[] = ['CEO', 'CFO', 'COO'];
const PLURAL_ROLES: InsiderRole[] = ['Director', 'EVP', 'Chief Legal Officer', '10% owner'];

function roleFor(ticker: string, person: string): InsiderRole {
  /* A stable order over the whole cast for THIS company. */
  const ranked = [...PEOPLE].sort(
    (a, b) => h01(`${ticker}|${a}|rank`) - h01(`${ticker}|${b}|rank`)
  );
  const i = ranked.indexOf(person);
  if (i < SINGULAR_ROLES.length) return SINGULAR_ROLES[i];
  return PLURAL_ROLES[(i - SINGULAR_ROLES.length) % PLURAL_ROLES.length];
}

const PEOPLE = [
  'A. Vance Holloway', 'Imani Okoro-Reid', 'Duncan Pryce', 'Sofia Marchetti-Lang',
  'Errol Nakamura', 'Bettina Groves', 'Rashid El-Amin', 'Cordelia Fairbanks',
  'Nils Thorvald', 'Josephine Adeyemi', 'Gus Ravensworth', 'Marisela Ibarra-Quinn',
];

/**
 * The definition the whole surface turns on: an OPEN-MARKET buy is one
 * somebody chose to make. A purchase inside a 10b5-1 plan is not one.
 *
 * Exported as a predicate rather than left inline because the generator
 * below never emits a planned buy — the combination is rare enough in real
 * filings that modelling it would blunt the one informative event here — so
 * an inline `!planned` is a guard nothing can currently reach, and an
 * unreachable guard is an untested one. A feed of real filings WILL contain
 * planned buys, and this is the line that has to be right when it arrives.
 */
export const isOpenMarketBuy = (t: { code: TxCode; plan: PlanState }): boolean => {
  const m = TX_CODES[t.code];
  return m.openMarket && m.acquires && m.discretionary && t.plan !== 'plan';
};

const EMPTY: InsiderFlow = {
  ticker: '',
  trades: [],
  bought: 0,
  sold: 0,
  net: 0,
  plannedValue: 0,
  compValue: 0,
  buyerCluster: 0,
  openMarketBuys: 0,
  signal: 'quiet',
  windowDays: 0,
};

/**
 * One name's insider transactions over a window.
 *
 * @param ticker     the symbol
 * @param windowDays how far back to look — 90 is the conventional window
 * @param day        the session key, injectable so this is provable
 */
export function insiderFlow(ticker: string, windowDays = 90, day = dayKey()): InsiderFlow {
  const u = lookup(ticker);
  if (!u) return { ...EMPTY, ticker, windowDays };

  const seed = `${u.ticker}|${day}|ins`;
  /* Most names have a handful of filings in a quarter and some have none.
     A feed that always produced rows would make an empty window — which is
     itself a fact about a company — impossible to see. */
  const count = Math.floor(h01(`${seed}|n`) * 7);
  const trades: InsiderTrade[] = [];
  let bought = 0;
  let sold = 0;
  let plannedValue = 0;
  let openMarketBuys = 0;
  let compValue = 0;

  for (let i = 0; i < count; i++) {
    const s = `${seed}|${i}`;
    const person = PEOPLE[Math.floor(h01(`${s}|pn`) * PEOPLE.length)];
    const role = roleFor(u.ticker, person);
    /* Selling dominates real insider activity by a wide margin — options
       vest and get sold, and there is one reason to buy against many to
       sell. A 50/50 draw would make buys unremarkable, which is the exact
       opposite of what they are. */

    /* THE CODE IS DRAWN FIRST, and everything else follows from it — which
       is the right way round, because the code is what the row IS.

       The mix is the real one's: most Form 4 rows are compensation
       plumbing. Grants, conversions and tax withholdings together outweigh
       open-market activity, and a generator that emitted mostly P and S
       would produce a feed that flatters the surface by making its own
       hardest problem disappear. */
    const cr = h01(`${s}|c`);
    const code: TxCode =
      cr < 0.2 ? 'M' : cr < 0.37 ? 'F' : cr < 0.51 ? 'A' : cr < 0.79 ? 'S' : cr < 0.9 ? 'P' : cr < 0.96 ? 'D' : 'G';
    const meta = TX_CODES[code];

    /* Direction is READ OFF THE CODE TABLE, not drawn beside it. Drawing
       kind independently would produce a grant that disposed of shares. */
    const kind: InsiderKind = meta.acquires ? 'BUY' : 'SELL';

    /* THREE STATES. A plan flag only exists where the filing carried the
       checkbox, so a slice of rows is genuinely unknown rather than
       assumed discretionary — see the note on PlanState. Only open-market
       sales can sit under a plan; a withholding or a grant is not a trade
       anyone scheduled. */
    const pr = h01(`${s}|p`);
    /* A 10b5-1 plan is overwhelmingly a SELLING instrument. People schedule
       diversification; almost nobody schedules conviction. Drawing the same
       plan rate for both directions put a majority of purchases under a
       plan, which quietly destroys the asymmetry this whole surface is
       built on — a discretionary buy is supposed to be the rare, loud row.
       Buys keep a small plan rate rather than none, because buy plans do
       exist and a model that forbids them cannot ever be wrong about one. */
    const planRate = meta.acquires ? 0.1 : 0.6;
    const plan: PlanState = !meta.openMarket
      ? 'discretionary'
      : pr < planRate
        ? 'plan'
        : pr < planRate + 0.28
          ? 'discretionary'
          : 'unknown';
    const planned = plan === 'plan';
    const daysAgo = Math.floor(h01(`${s}|d`) * windowDays) + 1;
    const shares = Math.round((500 + h01(`${s}|sh`) ** 2 * 120_000) / 100) * 100;
    /* The filed price sits near today's, off by the drift since. */
    const sincePct = Number(((h01(`${s}|m`) * 2 - 1) * 14).toFixed(1));
    const price = Number((u.px / (1 + sincePct / 100)).toFixed(2));
    const value = Math.round(shares * price);
    const heldAfter = Math.round(shares * (2 + h01(`${s}|h`) * 40));
    trades.push({
      id: s,
      ticker: u.ticker,
      role,
      person,
      code,
      kind,
      shares,
      price,
      value,
      daysAgo,
      planned,
      plan,
      /* Filled in after the loop — a cluster is a property of the WINDOW,
         not of a row, so it cannot be known while the row is built. */
      clusterCount: 0,
      heldAfter,
      stakePct: Number(((shares / (shares + heldAfter)) * 100).toFixed(1)),
      sincePct,
    });
    /* BOUGHT AND SOLD ARE MARKET ACTIVITY ONLY.

       A grant and a tax withholding both carry a share count and a price,
       and summing them into "sold" is precisely the error that produces the
       "CFO dumps $4m" headline about a vesting event. Non-market codes are
       counted separately, so the two questions — what did they trade, and
       what did the plan hand them — never contaminate each other. */
    if (meta.openMarket) {
      if (kind === 'BUY') {
        bought += value;
        if (isOpenMarketBuy({ code, plan })) openMarketBuys += value;
      } else {
        sold += value;
      }
      /* Planned SALES only. A planned purchase is real but rare, and
         folding it in here made the "% of the selling that was scheduled"
         line divide a mixed numerator by a sales-only denominator — it
         printed 555%. */
      if (planned && kind === 'SELL') plannedValue += value;
    } else {
      compValue += value;
    }
  }

  /* CLUSTERS. Filers acting in the same name inside 30 days — a cluster
     purchase roughly doubles the abnormal return of a lone one, and every
     competing product hides the count on a separate page. Counted over
     DISTINCT people, so one officer filing four times is not a cluster. */
  const recentBuyers = new Set(
    trades.filter(t => t.code === 'P' && t.daysAgo <= 30).map(t => t.person)
  );
  const recentSellers = new Set(
    trades.filter(t => t.code === 'S' && t.daysAgo <= 30).map(t => t.person)
  );
  for (const t of trades) {
    if (t.daysAgo > 30) continue;
    if (t.code === 'P') t.clusterCount = recentBuyers.size;
    else if (t.code === 'S') t.clusterCount = recentSellers.size;
  }

  trades.sort((a, b) => a.daysAgo - b.daysAgo);
  const net = bought - sold;

  /* THE VERDICT, and the order of these tests is the argument.

     A discretionary buy is checked FIRST and against the smallest bar,
     because it is the only genuinely informative event here. Selling is
     only called distribution when a real share of it was someone's actual
     decision — otherwise it is a calendar running, and saying
     "distributing" about a schedule adopted last spring would be the
     surface inventing an intention. */
  const discretionarySold = sold - plannedValue;
  let signal: InsiderFlow['signal'] = 'quiet';
  if (trades.length === 0) signal = 'quiet';
  else if (openMarketBuys > 0 && openMarketBuys >= discretionarySold) signal = 'accumulating';
  else if (discretionarySold > 0 && discretionarySold >= sold * 0.4) signal = 'distributing';
  else if (sold > 0) signal = 'scheduled selling';

  return { ticker: u.ticker, trades, bought, sold, net, plannedValue, compValue, buyerCluster: recentBuyers.size, openMarketBuys, signal, windowDays };
}

/** The window's headline. */
export function insiderRead(f: InsiderFlow): string {
  if (f.trades.length === 0) {
    return `No insider filed a transaction in ${f.ticker} in the last ${f.windowDays} days.`;
  }
  const n = f.trades.length;
  const head = `${n} insider ${n === 1 ? 'transaction' : 'transactions'} in ${f.ticker} over ${f.windowDays} days.`;
  if (f.signal === 'accumulating') {
    return `${head} Insiders bought on the open market — the one trade on this surface with a single obvious motive behind it.`;
  }
  if (f.signal === 'scheduled selling') {
    const pct = f.sold > 0 ? Math.round((f.plannedValue / f.sold) * 100) : 0;
    return `${head} ${pct}% of the selling ran off pre-set 10b5-1 plans, so it carries no view on today — the schedule was adopted months ago.`;
  }
  if (f.signal === 'distributing') {
    return `${head} A real share of the selling was discretionary, not scheduled — someone chose to sell.`;
  }
  return head;
}

/**
 * Every filing across the universe, newest first — the desk-wide feed the
 * page reads, as opposed to `insiderFlow`'s single-name view.
 *
 * The `codes` filter defaults to the OPEN-MARKET pair. That is not a
 * convenience: most Form 4 rows are compensation plumbing, and a feed that
 * mixes a tax withholding into the same list as a chief executive buying
 * with their own money has buried the only row worth reading. Everything
 * else is one toggle away, never gone.
 */
export function insiderFeed(
  windowDays = 90,
  codes: TxCode[] = ['P', 'S'],
  day = dayKey()
): InsiderTrade[] {
  const keep = new Set(codes);
  return UNIVERSE.flatMap(u => insiderFlow(u.ticker, windowDays, day).trades)
    .filter(t => keep.has(t.code))
    .sort((a, b) => a.daysAgo - b.daysAgo);
}

/** Names with discretionary insider buying — the desk-wide version, and the
    only ranking on this surface worth showing across the universe. */
export function insiderBuyers(windowDays = 90, day = dayKey()): InsiderFlow[] {
  return UNIVERSE.map(u => insiderFlow(u.ticker, windowDays, day))
    .filter(f => f.openMarketBuys > 0)
    .sort((a, b) => b.openMarketBuys - a.openMarketBuys);
}
