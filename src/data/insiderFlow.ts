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

export interface InsiderTrade {
  id: string;
  ticker: string;
  role: InsiderRole;
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
      view on the day. */
  planned: boolean;
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
  /** Discretionary buys — the informative subset. */
  openMarketBuys: number;
  /** One word for what this adds up to. */
  signal: 'accumulating' | 'distributing' | 'scheduled selling' | 'quiet';
  windowDays: number;
}

const ROLES: InsiderRole[] = ['CEO', 'CFO', 'COO', 'Director', 'EVP', 'Chief Legal Officer', '10% owner'];

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
export const isOpenMarketBuy = (t: { kind: InsiderKind; planned: boolean }): boolean =>
  t.kind === 'BUY' && !t.planned;

const EMPTY: InsiderFlow = {
  ticker: '',
  trades: [],
  bought: 0,
  sold: 0,
  net: 0,
  plannedValue: 0,
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

  for (let i = 0; i < count; i++) {
    const s = `${seed}|${i}`;
    const role = ROLES[Math.floor(h01(`${s}|r`) * ROLES.length)];
    /* Selling dominates real insider activity by a wide margin — options
       vest and get sold, and there is one reason to buy against many to
       sell. A 50/50 draw would make buys unremarkable, which is the exact
       opposite of what they are. */
    const kind: InsiderKind = h01(`${s}|k`) < 0.22 ? 'BUY' : 'SELL';
    /* And most of the selling is scheduled. A buy on a 10b5-1 plan is rare
       enough to be worth not modelling at all. */
    const planned = kind === 'SELL' && h01(`${s}|p`) < 0.68;
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
      kind,
      shares,
      price,
      value,
      daysAgo,
      planned,
      heldAfter,
      stakePct: Number(((shares / (shares + heldAfter)) * 100).toFixed(1)),
      sincePct,
    });
    if (kind === 'BUY') {
      bought += value;
      if (isOpenMarketBuy({ kind, planned })) openMarketBuys += value;
    } else {
      sold += value;
    }
    if (planned) plannedValue += value;
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

  return { ticker: u.ticker, trades, bought, sold, net, plannedValue, openMarketBuys, signal, windowDays };
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

/** Names with discretionary insider buying — the desk-wide version, and the
    only ranking on this surface worth showing across the universe. */
export function insiderBuyers(windowDays = 90, day = dayKey()): InsiderFlow[] {
  return UNIVERSE.map(u => insiderFlow(u.ticker, windowDays, day))
    .filter(f => f.openMarketBuys > 0)
    .sort((a, b) => b.openMarketBuys - a.openMarketBuys);
}
