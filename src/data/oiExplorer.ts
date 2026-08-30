import Simulator from '../core/simulator';
import { h01, dayKey } from '../core/rng';

/*
==================================================
  SLAYER TERMINAL - OVERNIGHT OI (data/oiExplorer.ts)
==================================================

  What changed in the open interest WHILE THE MARKET WAS SHUT — which
  contracts were opened overnight, which were closed, and where the biggest
  moves sit.

  THIS IS NOT oiHeat, AND THE DIFFERENCE IS THE WHOLE POINT. P-8's ΔOI heat
  answers "which strikes are being built RIGHT NOW", cell by cell through
  the session, off consecutive live snapshots. This answers a question that
  can only be asked before the bell: positions are not settled intraday —
  open interest is published once, after the close — so the only honest
  OI *change* number is yesterday's close against the one before it. A
  reader wants it premarket, on a board, ranked.

  Two surfaces, two vintages, no overlap: one is the session's flow, this
  is the overnight book.

  WHY PERCENT AND ABSOLUTE ARE BOTH KEPT. A strike going 200 -> 2,000 is
  +900% and 1,800 contracts; one going 80,000 -> 90,000 is +12.5% and
  10,000. The first is a new position, the second is a big one getting
  bigger, and a board that ranks on either alone hides one of them. The
  default rank is absolute — that is where the money is — with the percent
  beside it so a small-but-new contract is still findable.

  NEW POSITIONS ARE MARKED, NOT INFERRED FROM SIZE. `wasEmpty` is true when
  yesterday's OI was zero: a contract that did not exist before last night
  is a different object from one that grew, and a reader should not have to
  work that out from a percentage that would be infinite.

  SIMULATED, and it says so. Generated per contract from the day's seed and
  stable within a session, so a reader who reloads sees the same board.
*/

export interface OiRow {
  key: string;
  ticker: string;
  expiry: string;
  strike: number;
  right: 'C' | 'P';
  dte: number;
  /** Open interest at the previous close. */
  prevOi: number;
  /** Open interest published after last night's close. */
  oi: number;
  /** oi − prevOi, signed. */
  change: number;
  /** Percent change, or null when there was nothing to grow from. */
  changePct: number | null;
  /** True when the contract carried no open interest yesterday. */
  wasEmpty: boolean;
}

export interface OiExplorer {
  rows: OiRow[];
  /** Contracts that grew, shrank, and appeared from nothing. */
  opened: number;
  closed: number;
  fresh: number;
  /** Net contracts added across the board. */
  netChange: number;
  asOf: string;
}

export type OiSort = 'absolute' | 'percent' | 'closed';

const EMPTY: OiExplorer = { rows: [], opened: 0, closed: 0, fresh: 0, netChange: 0, asOf: '' };

/**
 * The overnight board for one name.
 *
 * @param ticker  the symbol
 * @param sort    'absolute' ranks by contracts added — where the money is;
 *                'percent' surfaces the small-but-new; 'closed' inverts to
 *                the biggest unwinds
 * @param limit   rows kept
 */
export function buildOiExplorer(ticker: string, sort: OiSort = 'absolute', limit = 30, day = dayKey()): OiExplorer {
  const sym = Simulator.ensureTicker(ticker);
  const { chain } = Simulator.chainFor(sym);
  if (chain.length === 0) return EMPTY;

  const rows: OiRow[] = [];
  let opened = 0;
  let closed = 0;
  let fresh = 0;
  let netChange = 0;

  for (const node of chain) {
    for (const right of ['C', 'P'] as const) {
      const oi = right === 'C' ? node.callOI : node.putOI;
      if (!(oi > 0)) continue;
      const seed = `${sym}|${day}|${node.strike}|${right}|oiov`;
      /* Yesterday's book as a fraction of today's. Mostly close to 1 — a
         chain does not turn over nightly — with a thin tail of contracts
         that genuinely appeared or were closed out. */
      const r = h01(seed);
      let prevOi: number;
      if (r < 0.04) prevOi = 0; // brand new
      else if (r < 0.14) prevOi = Math.round(oi * (1.15 + h01(`${seed}|d`) * 0.9)); // unwound
      else prevOi = Math.round(oi * (0.72 + h01(`${seed}|g`) * 0.33)); // grew or held

      const change = oi - prevOi;
      if (change === 0) continue;
      const wasEmpty = prevOi === 0;
      rows.push({
        key: `${sym}|${node.strike}|${right}`,
        ticker: sym,
        expiry: '',
        strike: node.strike,
        right,
        dte: 0,
        prevOi,
        oi,
        change,
        /* Null, not Infinity: there is no percentage change from nothing,
           and printing one would be arithmetic theatre. `wasEmpty` carries
           that fact instead. */
        changePct: wasEmpty ? null : Number(((change / prevOi) * 100).toFixed(1)),
        wasEmpty,
      });
      netChange += change;
      if (wasEmpty) fresh += 1;
      if (change > 0) opened += 1;
      else closed += 1;
    }
  }

  const ranked = [...rows].sort((a, b) => {
    if (sort === 'closed') return a.change - b.change;
    if (sort === 'percent') {
      /* A contract that appeared from nothing outranks any finite percent —
         it is the strongest version of the thing this sort looks for. */
      if (a.wasEmpty !== b.wasEmpty) return a.wasEmpty ? -1 : 1;
      return (b.changePct ?? 0) - (a.changePct ?? 0);
    }
    return Math.abs(b.change) - Math.abs(a.change);
  });

  return { rows: ranked.slice(0, limit), opened, closed, fresh, netChange, asOf: day };
}

/** The board's headline. */
export function oiRead(e: OiExplorer, ticker: string): string {
  if (e.rows.length === 0) return `No open-interest change published for ${ticker}.`;
  const dir = e.netChange > 0 ? 'added' : 'closed';
  const n = Math.abs(e.netChange).toLocaleString();
  const freshNote = e.fresh > 0 ? `, ${e.fresh} of them contracts that did not exist yesterday` : '';
  return `${ticker} ${dir} ${n} contracts of open interest overnight across ${e.opened + e.closed} strikes${freshNote}.`;
}
