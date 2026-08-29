/*
==================================================
  SLAYER TERMINAL - THE TRADE JOURNAL (data/journal.ts)

  What was taken, why, and how it went — with the
  "why" captured BEFORE the outcome is known.
==================================================

  §18. The desk had a Setup Tracker (bookmarked setups with live metrics).
  It did not have a journal, which is a different thing: the tracker watches
  what MIGHT happen, the journal records what DID.

  THE THESIS IS WRITTEN AT ENTRY AND FROZEN. That is the entire discipline
  a journal exists to enforce — a thesis edited after the exit is not a
  record, it is a story. `thesis` is set once when the entry is logged, and
  the UI offers `review` as a separate, later field so hindsight has
  somewhere honest to go instead of overwriting the original.

  P&L IS COMPUTED, NEVER TYPED. A journal where the result is a free-text
  field drifts from the fills within a week. Entry price, exit price, size
  and side are the inputs; everything else is arithmetic — which also means
  a partial exit and an open position have exactly one definition of
  "unrealised".

  AN OPEN TRADE HAS NO RESULT, and says so. Not a zero, not a provisional
  number rendered in grey — null, drawn as an em-dash, the same rule the
  rest of this desk runs on.

  R IS THE UNIT THAT SURVIVES POSITION SIZING. Dollars flatter whoever
  traded biggest; R — the multiple of the risk the trader defined at entry —
  is the only figure that compares a $200 loss on a small account with a
  $2,000 one on a large. It is null when no stop was recorded, because an R
  without a defined risk is a number made up after the fact.
*/

export type TradeSide = 'LONG' | 'SHORT';
export type TradeStatus = 'OPEN' | 'CLOSED';

export interface JournalTrade {
  id: string;
  /** ISO timestamp of the entry. */
  openedAt: string;
  closedAt: string | null;
  ticker: string;
  /** Free text: "SPY 500C 09/19" or "SPY shares". */
  instrument: string;
  side: TradeSide;
  /** Contracts or shares. */
  size: number;
  entry: number;
  /** Null while the trade is open. */
  exit: number | null;
  /** The stop the trader defined AT ENTRY — the denominator of R. */
  stop: number | null;
  /** Written at entry, never edited. */
  thesis: string;
  /** Written after the fact — hindsight's honest home. */
  review: string;
  setup: string;
  tags: string[];
  /** Data URLs of pasted screenshots. */
  shots: string[];
}

export interface TradeResult {
  status: TradeStatus;
  /** Null while open. Dollars, per the contract multiplier. */
  pnl: number | null;
  pnlPct: number | null;
  /** Multiple of defined risk. Null with no stop, or while open. */
  r: number | null;
  /** How long it was held, in minutes. Null while open. */
  heldMin: number | null;
}

/** Options are per-contract ×100; anything else is 1:1. */
export const multiplierFor = (instrument: string): number =>
  /\d+(\.\d+)?\s*[CP]\b|\bcall\b|\bput\b/i.test(instrument) ? 100 : 1;

/** The one definition of a result. Everything on the page reads this. */
export function resultOf(t: JournalTrade): TradeResult {
  if (t.exit === null || t.closedAt === null) {
    return { status: 'OPEN', pnl: null, pnlPct: null, r: null, heldMin: null };
  }
  const mult = multiplierFor(t.instrument);
  const dir = t.side === 'LONG' ? 1 : -1;
  const per = (t.exit - t.entry) * dir;
  const pnl = per * t.size * mult;
  const pnlPct = t.entry !== 0 ? (per / t.entry) * 100 : null;
  /* R needs a stop DEFINED AT ENTRY. Without one there is no denominator,
     and inventing one after the exit is exactly the self-flattery a journal
     exists to prevent. */
  const risk = t.stop === null ? null : Math.abs(t.entry - t.stop);
  const r = risk === null || risk === 0 ? null : per / risk;
  const heldMin = Math.round((Date.parse(t.closedAt) - Date.parse(t.openedAt)) / 60000);
  return { status: 'CLOSED', pnl, pnlPct, r, heldMin };
}

export interface JournalStats {
  trades: number;
  closed: number;
  open: number;
  wins: number;
  losses: number;
  /** Null under the minimum sample — see MIN_STATS_TRADES. */
  winRate: number | null;
  grossWin: number;
  grossLoss: number;
  /** Gross win / gross loss. Null when nothing has lost yet. */
  profitFactor: number | null;
  netPnl: number;
  /** Average R across trades that HAVE an R. */
  avgR: number | null;
  bestR: number | null;
  worstR: number | null;
}

/** Below this, a win rate is noise wearing a percent sign. */
export const MIN_STATS_TRADES = 5;

export function statsOf(trades: readonly JournalTrade[]): JournalStats {
  let wins = 0, losses = 0, grossWin = 0, grossLoss = 0, net = 0, open = 0;
  const rs: number[] = [];
  for (const t of trades) {
    const r = resultOf(t);
    if (r.status === 'OPEN') { open++; continue; }
    const pnl = r.pnl ?? 0;
    net += pnl;
    if (pnl > 0) { wins++; grossWin += pnl; }
    else if (pnl < 0) { losses++; grossLoss += Math.abs(pnl); }
    if (r.r !== null) rs.push(r.r);
  }
  const closed = wins + losses + (trades.length - open - wins - losses);
  return {
    trades: trades.length,
    closed: trades.length - open,
    open,
    wins,
    losses,
    winRate: closed >= MIN_STATS_TRADES && wins + losses > 0 ? (wins / (wins + losses)) * 100 : null,
    grossWin,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    netPnl: net,
    avgR: rs.length > 0 ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
    bestR: rs.length > 0 ? Math.max(...rs) : null,
    worstR: rs.length > 0 ? Math.min(...rs) : null,
  };
}

/** One calendar day's realised P&L — the equity curve's steps. */
export interface DayPnl {
  date: string;
  pnl: number;
  trades: number;
}

export function dailyPnl(trades: readonly JournalTrade[]): DayPnl[] {
  const by = new Map<string, DayPnl>();
  for (const t of trades) {
    const r = resultOf(t);
    if (r.status === 'OPEN' || t.closedAt === null) continue;
    const date = t.closedAt.slice(0, 10);
    const row = by.get(date) ?? { date, pnl: 0, trades: 0 };
    row.pnl += r.pnl ?? 0;
    row.trades++;
    by.set(date, row);
  }
  return [...by.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Running equity from a flat start — the curve, not the bars. */
export function equityCurve(days: readonly DayPnl[]): { date: string; equity: number }[] {
  let run = 0;
  return days.map(d => { run += d.pnl; return { date: d.date, equity: run }; });
}

// ── storage: local, like every other desk preference ─────────────────────
const KEY = 'slayer_journal_v1';

const read = (): JournalTrade[] => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as JournalTrade[]) : [];
  } catch {
    return [];
  }
};

let trades: JournalTrade[] = read();
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
const persist = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(trades));
  } catch {
    /* A full quota drops the write, never the page. */
  }
};

export const subscribeJournal = (fn: () => void): (() => void) => {
  subs.add(fn);
  return () => subs.delete(fn);
};
export const getTrades = (): JournalTrade[] => trades;

export function addTrade(t: Omit<JournalTrade, 'id'>): JournalTrade {
  const full: JournalTrade = { ...t, id: `t${Date.now()}${Math.round(Math.random() * 1e4)}` };
  trades = [full, ...trades];
  persist();
  emit();
  return full;
}

/**
 * Update a trade.
 *
 * `thesis` is deliberately NOT updatable — see the header. A thesis edited
 * after the outcome is a story, and the type makes that impossible rather
 * than asking the UI to remember.
 */
export function updateTrade(id: string, patch: Partial<Omit<JournalTrade, 'id' | 'thesis' | 'openedAt'>>): void {
  trades = trades.map(t => (t.id === id ? { ...t, ...patch } : t));
  persist();
  emit();
}

export function removeTrade(id: string): void {
  trades = trades.filter(t => t.id !== id);
  persist();
  emit();
}

export function closeTrade(id: string, exit: number, closedAt = new Date().toISOString()): void {
  updateTrade(id, { exit, closedAt });
}
