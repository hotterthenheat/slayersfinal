import { UNIVERSE, lookup, type Sector } from './universe';
import { h01, dayKey } from '../core/rng';

/*
==================================================
  SLAYER TERMINAL - ETF EXPOSURE (data/etfExposure.ts)
==================================================

  HOW MUCH OF A NAME IS BEING TRADED BY PEOPLE WHO ARE NOT TRADING IT.

  A stock that is 30% passively driven does not respond to its own news the
  way a 5% one does. When SPY takes a billion dollars of inflow, the
  authorised participant buys every constituent in index weight — nobody in
  that chain formed a view on the name, and the print lands in its tape
  anyway. A reader looking at a bid that will not lift, or a rally with no
  headline under it, is very often looking at a creation basket.

  THE TWO DIRECTIONS, AND THEY ARE DIFFERENT QUESTIONS.

    exposureFor(ticker) — which funds hold this name, at what weight, and
    how many of its shares a day of their flow moves. This is the one a
    single-name reader wants.

    basketFor(etf) — what one fund is, and where its flow goes. This is the
    one an index reader wants, and it is how you find the name that is
    being dragged rather than bought.

  THE HEADLINE IS THE PASSIVE SHARE, not the dollar figure. "$41m of NVDA
  bought through funds today" means nothing without the name's own volume
  beside it; the same $41m is noise in NVDA and the entire tape in a small
  cap. `passivePct` is that number, and it is what the panel leads with.

  SHARES, NOT DOLLARS, IS THE HONEST UNIT for the impact figure. A basket
  buys SHARES — the dollar amount is an artefact of where the price
  happened to be — and a reader comparing a name against its own average
  volume needs shares to do it.

  WEIGHTS ARE MODELLED, and it says so wherever it is drawn. They are
  generated from the fund's mandate and the name's sector and size, stable
  per day, and they sum to a sensible fraction of each fund rather than to
  a fabricated 100% of a book this desk does not hold. When a holdings feed
  lands, `FUNDS` and `weightOf` are the two things that change.
*/

export interface Fund {
  ticker: string;
  name: string;
  /** Assets in dollars — sets how big a basket move is. */
  aum: number;
  /** Broad funds hold everything; sector funds hold their own shelf. */
  sectors: Sector[] | null;
  /** How concentrated the top of the book is; cap-weighted funds are top
      heavy, equal-weight ones are not. */
  concentration: number;
  kind: 'broad' | 'sector' | 'thematic';
}

export const FUNDS: Fund[] = [
  { ticker: 'SPY', name: 'S&P 500', aum: 620e9, sectors: null, concentration: 0.9, kind: 'broad' },
  { ticker: 'QQQ', name: 'Nasdaq 100', aum: 310e9, sectors: ['Technology', 'Communication', 'Consumer Discretionary', 'Health Care'], concentration: 1.25, kind: 'broad' },
  { ticker: 'VTI', name: 'Total Market', aum: 480e9, sectors: null, concentration: 0.8, kind: 'broad' },
  /* IWM is deliberately absent. The Russell 2000 is small caps and this
     universe is thirty large ones, so every weight it produced would be a
     fund holding a name it does not hold. A fund list that is short and
     true beats one that is long and wrong. */
  { ticker: 'RSP', name: 'S&P 500 Equal Weight', aum: 68e9, sectors: null, concentration: 0.12, kind: 'broad' },
  { ticker: 'XLK', name: 'Technology Select', aum: 72e9, sectors: ['Technology'], concentration: 1.4, kind: 'sector' },
  { ticker: 'XLF', name: 'Financial Select', aum: 48e9, sectors: ['Financials'], concentration: 1.0, kind: 'sector' },
  { ticker: 'XLE', name: 'Energy Select', aum: 36e9, sectors: ['Energy'], concentration: 1.5, kind: 'sector' },
  { ticker: 'XLV', name: 'Health Care Select', aum: 40e9, sectors: ['Health Care'], concentration: 1.0, kind: 'sector' },
  { ticker: 'XLY', name: 'Consumer Discretionary Select', aum: 21e9, sectors: ['Consumer Discretionary'], concentration: 1.35, kind: 'sector' },
  { ticker: 'XLP', name: 'Consumer Staples Select', aum: 16e9, sectors: ['Consumer Staples'], concentration: 1.1, kind: 'sector' },
  { ticker: 'XLI', name: 'Industrial Select', aum: 19e9, sectors: ['Industrials'], concentration: 0.9, kind: 'sector' },
  { ticker: 'XLB', name: 'Materials Select', aum: 6e9, sectors: ['Materials'], concentration: 1.1, kind: 'sector' },
  { ticker: 'XLU', name: 'Utilities Select', aum: 18e9, sectors: ['Utilities'], concentration: 1.0, kind: 'sector' },
  { ticker: 'XLC', name: 'Communication Select', aum: 21e9, sectors: ['Communication'], concentration: 1.5, kind: 'sector' },
  { ticker: 'SMH', name: 'Semiconductors', aum: 24e9, sectors: ['Technology'], concentration: 1.7, kind: 'thematic' },
  { ticker: 'ARKK', name: 'Innovation', aum: 6e9, sectors: ['Technology', 'Health Care', 'Consumer Discretionary'], concentration: 1.3, kind: 'thematic' },
  { ticker: 'MAGS', name: 'Magnificent Seven', aum: 2e9, sectors: ['Technology', 'Communication', 'Consumer Discretionary'], concentration: 2.0, kind: 'thematic' },
];

/**
 * Rank of a name INSIDE the fund that holds it, by notional heft — the
 * stand-in for index weight ordering until a holdings feed lands.
 *
 * Ranking against the whole universe was the first version and it was
 * wrong: Exxon is the biggest thing in an energy fund and roughly the
 * twenty-fifth biggest thing overall, and a universe-wide rank fed the
 * decay below a number that drove its weight to zero. A sector fund's
 * ladder starts at its own top.
 */
function heftRank(fund: Fund, ticker: string): number {
  const book = fund.sectors ? UNIVERSE.filter(u => fund.sectors!.includes(u.sector)) : UNIVERSE;
  const sorted = [...book].sort((a, b) => b.px * b.beta - a.px * a.beta);
  const i = sorted.findIndex(u => u.ticker === ticker);
  return i < 0 ? book.length : i;
}

/* THE CEILING ON ONE NAME, and it is a real rule rather than a taste. A
   concentrated fund cannot put an unbounded share in a single holding —
   the diversification rules a RIC lives under cap the big positions, which
   is why XLE is roughly a fifth Exxon and not half of it.

   This also fixes the number that made the first two versions wrong. The
   desk tracks thirty names; a utilities fund holds thirty of its own and
   this universe contains ONE of them. A flat "82% covered" then handed
   that single name 82% of the fund. Coverage has to fall out of how many
   of a fund's holdings we actually have, so it is the smaller of the
   kind's target and what those names could legitimately add up to. */
const MAX_SINGLE: Record<Fund['kind'], number> = { broad: 0.09, sector: 0.22, thematic: 0.28 };
const COVERAGE_TARGET: Record<Fund['kind'], number> = { broad: 0.45, sector: 0.82, thematic: 0.9 };

/** What share of a fund this desk can account for, given how many of its
    holdings are in the universe. */
function coverage(fund: Fund, held: number): number {
  return Math.min(COVERAGE_TARGET[fund.kind], held * MAX_SINGLE[fund.kind]);
}

/* Weights are computed for a fund's WHOLE book at once and normalised to
   that coverage, then cached per fund and day.

   The first version scored each name independently and clamped the result
   at 24%. Every sector fund pinned to the clamp — a two-name energy shelf
   produced a raw 37% and printed 24.00% for both, which is the model
   showing its ceiling rather than its answer. Normalising is the honest
   shape anyway: a fund's weights are shares of one book, so they have to be
   computed against each other. */
const weightCache = new Map<string, Map<string, number>>();

function fundWeights(fund: Fund, day: string): Map<string, number> {
  const key = `${fund.ticker}|${day}`;
  const hit = weightCache.get(key);
  if (hit) return hit;

  const book = fund.sectors ? UNIVERSE.filter(u => fund.sectors!.includes(u.sector)) : UNIVERSE;
  /* Rank decay, steepened by the fund's concentration: a cap-weighted tech
     fund puts a fifth of itself in two names, an equal-weight one spreads
     the same slice across everything. */
  const raw = book.map(u => {
    const rank = heftRank(fund, u.ticker);
    const decay = Math.exp((-rank / Math.max(4, book.length)) * fund.concentration * 2.2);
    const jitter = 0.85 + h01(`${fund.ticker}|${u.ticker}|${day}|w`) * 0.3;
    return { ticker: u.ticker, score: decay * jitter };
  });
  const cov = coverage(fund, book.length);
  const ceiling = MAX_SINGLE[fund.kind];
  const out = new Map<string, number>();

  /* CAP AND REDISTRIBUTE, not cap and discard. Normalising into the covered
     share and then clipping the leaders was the first version, and it lost
     whatever was clipped: a concentrated fund summed to seventy percent of
     a book it claimed to cover eighty-two of. The weight a ceiling takes off
     the leader belongs to the rest of the book, which is also how a real
     capped index rebalances. Each pass pins whoever breached, then shares
     what is left over the names still under it. */
  let pool = raw.slice();
  let remaining = cov;
  for (let guard = 0; guard < book.length + 2 && pool.length > 0; guard++) {
    const total = pool.reduce((s2, r) => s2 + r.score, 0);
    if (!(total > 0)) break;
    const over = pool.filter(r => (r.score / total) * remaining > ceiling);
    if (over.length === 0) {
      for (const r of pool) out.set(r.ticker, Number(((r.score / total) * remaining * 100).toFixed(2)));
      pool = [];
      break;
    }
    for (const r of over) {
      out.set(r.ticker, Number((ceiling * 100).toFixed(2)));
      remaining -= ceiling;
    }
    pool = pool.filter(r => !over.includes(r));
  }
  /* Anything the loop could not place — only reachable when the ceiling
     times the book is exactly the coverage — sits at the ceiling. */
  for (const r of pool) out.set(r.ticker, Number((ceiling * 100).toFixed(2)));
  for (const u of book) if (!out.has(u.ticker)) out.set(u.ticker, 0);
  weightCache.set(key, out);
  return out;
}

/**
 * A name's weight in a fund, as a percent. Zero when the fund's mandate
 * does not cover the name's sector — a sector fund holding something
 * outside its shelf would be the model contradicting its own label — and
 * zero for a name this desk does not know.
 *
 * The mandate is enforced in ONE place, where `fundWeights` builds the
 * book. This used to re-check it here as well; a second guard that can
 * drift out of step with the first is not a safety net, it is a second
 * thing to keep true, and the map simply has no entry for a name the fund
 * does not hold.
 */
export function weightOf(fund: Fund, ticker: string, day = dayKey()): number {
  return fundWeights(fund, day).get(ticker) ?? 0;
}

/** What share of a fund this desk can account for — drawn beside the board
    so nobody reads the weights as a complete holdings list. */
export function coverageOf(fund: Fund, day = dayKey()): number {
  const held = [...fundWeights(fund, day).values()].filter(w => w > 0).length;
  return Math.round(coverage(fund, held) * 100);
}

export interface FundHolding {
  fund: Fund;
  /** Percent of the fund sitting in this name. */
  weightPct: number;
  /** Dollars of the fund attributable to the name. */
  positionUsd: number;
  /** The fund's net creation/redemption today, in dollars — signed. */
  fundFlowUsd: number;
  /** Shares of the name that flow moved, signed. Shares, not dollars: a
      basket buys shares, and a reader compares against share volume. */
  sharesMoved: number;
  /** Dollars of the name that flow moved, signed. */
  usdMoved: number;
}

export interface EtfExposure {
  ticker: string;
  holdings: FundHolding[];
  /** Net shares of the name bought (+) or sold (−) through funds today. */
  netShares: number;
  netUsd: number;
  /** The name's own share volume today — the denominator. */
  shareVolume: number;
  /** Passive share of the name's volume, 0–100. THE headline. */
  passivePct: number;
  /** Dollars of the name held across these funds. Not a percent of float —
      this desk has no float figure, and inventing one to divide by would
      make the honest number worse. */
  heldUsd: number;
  asOf: string;
}

const EMPTY: EtfExposure = {
  ticker: '',
  holdings: [],
  netShares: 0,
  netUsd: 0,
  shareVolume: 0,
  passivePct: 0,
  heldUsd: 0,
  asOf: '',
};

/** A fund's net creation/redemption today, in dollars. Scales with AUM, so
    a $620bn fund and a $2bn one do not print the same flow. */
export function fundFlow(fund: Fund, day = dayKey()): number {
  const r = h01(`${fund.ticker}|${day}|flow`) * 2 - 1;
  /* Cubed so most days are quiet and the occasional one is genuinely big —
     a uniform draw makes every day a flow day, which is not how baskets
     behave. The cube is ODD, so it carries the sign of r on its own;
     multiplying by sign(r) as well — which this did — made the magnitude
     positive for every fund on every day and quietly deleted redemptions
     from the model. */
  return Math.round(fund.aum * 0.004 * r * r * r * 8);
}

/**
 * Which funds hold a name, and what their flow did to it today.
 *
 * @param ticker the name
 * @param day    the session key, injectable so this is provable
 */
export function exposureFor(ticker: string, day = dayKey()): EtfExposure {
  const u = lookup(ticker);
  if (!u) return { ...EMPTY, ticker };

  const holdings: FundHolding[] = [];
  let netShares = 0;
  let netUsd = 0;
  let heldUsd = 0;

  for (const fund of FUNDS) {
    const weightPct = weightOf(fund, ticker, day);
    if (weightPct <= 0) continue;
    const positionUsd = fund.aum * (weightPct / 100);
    const fundFlowUsd = fundFlow(fund, day);
    const usdMoved = fundFlowUsd * (weightPct / 100);
    const sharesMoved = Math.round(usdMoved / u.px);
    holdings.push({ fund, weightPct, positionUsd, fundFlowUsd, sharesMoved, usdMoved });
    netShares += sharesMoved;
    netUsd += usdMoved;
    heldUsd += positionUsd;
  }

  /* Ranked by POSITION, not by today's flow. The book is the durable fact;
     a fund that happened to be flat today still owns the name tomorrow, and
     a board that reordered itself every session would be unreadable. */
  holdings.sort((a, b) => b.positionUsd - a.positionUsd);

  const shareVolume = Math.round(4e6 + h01(`${ticker}|${day}|vol`) * 5.6e7);
  return {
    ticker,
    holdings,
    netShares,
    netUsd,
    shareVolume,
    /* Absolute: a redemption is as passive as a creation. The direction is
       carried by netShares, right beside it. */
    passivePct: shareVolume > 0 ? Number(Math.min(100, (Math.abs(netShares) / shareVolume) * 100).toFixed(1)) : 0,
    heldUsd: Math.round(heldUsd),
    asOf: day,
  };
}

export interface BasketRow {
  ticker: string;
  name: string;
  sector: Sector;
  weightPct: number;
  sharesMoved: number;
  usdMoved: number;
}

export interface FundBasket {
  fund: Fund;
  flowUsd: number;
  rows: BasketRow[];
  /** Names the flow touched. */
  names: number;
  asOf: string;
}

/** What one fund holds, and where today's basket went. */
export function basketFor(etf: string, day = dayKey(), limit = 20): FundBasket | null {
  const fund = FUNDS.find(f => f.ticker === etf.toUpperCase());
  if (!fund) return null;
  const flowUsd = fundFlow(fund, day);
  const rows: BasketRow[] = [];
  for (const u of UNIVERSE) {
    const weightPct = weightOf(fund, u.ticker, day);
    if (weightPct <= 0) continue;
    const usdMoved = flowUsd * (weightPct / 100);
    rows.push({
      ticker: u.ticker,
      name: u.name,
      sector: u.sector,
      weightPct,
      sharesMoved: Math.round(usdMoved / u.px),
      usdMoved,
    });
  }
  rows.sort((a, b) => b.weightPct - a.weightPct);
  return { fund, flowUsd, rows: rows.slice(0, limit), names: rows.length, asOf: day };
}

/** The exposure's headline. */
export function exposureRead(e: EtfExposure): string {
  if (e.holdings.length === 0) return `No fund in this list holds ${e.ticker}.`;
  const dir = e.netShares > 0 ? 'bought' : 'sold';
  const n = Math.abs(e.netShares).toLocaleString();
  const lead = e.holdings[0];
  const body = `Funds ${dir} ${n} shares of ${e.ticker} today — ${e.passivePct}% of its volume, by people taking no view on it. ${lead.fund.ticker} is the largest holder at ${lead.weightPct}% of the fund.`;
  if (e.passivePct >= 25) return `${body} At this share, the tape is largely a basket and the name's own news is the smaller force in it.`;
  if (e.passivePct < 5) return `${body} At this share the name is trading on its own account.`;
  return body;
}
