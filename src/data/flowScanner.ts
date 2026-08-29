import type { FlowPrint } from '../types/trace';

/*
==================================================
  SLAYER TERMINAL - FLOW AGGREGATION (data/flowScanner.ts)

  The tape rolled up per CONTRACT, and the
  directional read that follows from it.
==================================================

  The Live Tape answers "what just printed". This answers the question a
  reader asks thirty seconds later: "what has been printing ALL DAY, and on
  which side?" Same prints, grouped by the contract they belong to.

  THE SCORE IS SIDE-OF-SPREAD, PREMIUM-WEIGHTED, and it is the only honest
  reading available from a tape without quotes-at-trade:

      calls lifted at the ASK   → bullish        (+)
      calls hit at the BID      → bearish        (−)
      puts  lifted at the ASK   → bearish        (−)
      puts  hit at the BID      → bullish        (+)

  which is the same sentence the glossary already gives the reader for
  `Sentiment`, applied to a whole contract instead of one print.

  A MID FILL CONTRIBUTES NOTHING — not a half-vote, not a coin flip. A fill
  negotiated between the quotes does not say who was the aggressor, and the
  desk's rule is that an unknown is drawn as an absence rather than guessed.
  It still counts in the premium totals; it just does not move the direction.

  PREMIUM-WEIGHTED, NOT PRINT-COUNTED, because forty $5k lottery tickets and
  one $2M block are not forty-to-one evidence of anything. Weighting by
  dollars is what makes the score track conviction rather than enthusiasm.

  THE DENOMINATOR IS DIRECTIONAL PREMIUM, not total premium: a contract that
  traded $10M all on the mid would otherwise score 0 the same way a
  perfectly balanced one does, and those are different facts. `decisiveness`
  reports what share of the dollars actually took a side, so a reader can
  tell "no opinion" from "no evidence".
*/

export interface ContractRollup {
  /** Identity of the contract — ticker, strike, right and expiry together. */
  key: string;
  ticker: string;
  strike: number;
  right: 'C' | 'P';
  expiry: string;
  dte: number;
  /** Prints seen for this contract this session. */
  prints: number;
  /** Newest print's clock, as the tape renders it. */
  lastTime: string;
  /** Size-weighted average fill — what the flow actually paid. */
  avgFill: number;
  totalSize: number;
  totalPremium: number;
  /** From the newest print — these are contract facts, not print facts. */
  volume: number;
  oi: number;
  deltaOI: number;
  iv: number;
  volOverOI: number;
  /** Premium share, 0–100, on each side of the spread. */
  askPct: number;
  bidPct: number;
  midPct: number;
  /** −100…+100. Positive reads bullish. See the header for the rule. */
  score: number;
  /** 0–100: share of premium that took a side at all. */
  decisiveness: number;
  sweeps: number;
  multiLeg: number;
}

/** Contract identity. Expiry is part of it: same strike, different week is a
    different contract, and merging them would invent a position. */
export const contractKey = (p: Pick<FlowPrint, 'ticker' | 'strike' | 'right' | 'expiry'>): string =>
  `${p.ticker}|${p.strike}|${p.right}|${p.expiry}`;

/** One print's directional sign — 0 when the fill says nothing. */
export function printDirection(p: Pick<FlowPrint, 'right' | 'side'>): -1 | 0 | 1 {
  if (p.side === 'MID') return 0;
  const bought = p.side === 'ASK';
  const bullish = p.right === 'C' ? bought : !bought;
  return bullish ? 1 : -1;
}

/**
 * Roll a session's prints up per contract.
 *
 * Order out is by total premium, descending — the dollars are the reason a
 * contract is worth a row.
 */
export function aggregateByContract(prints: FlowPrint[]): ContractRollup[] {
  const acc = new Map<string, {
    r: ContractRollup;
    fillWeighted: number;
    askPrem: number;
    bidPrem: number;
    midPrem: number;
    dirPrem: number;
    newest: number;
  }>();

  prints.forEach((p, i) => {
    const key = contractKey(p);
    let e = acc.get(key);
    if (!e) {
      e = {
        r: {
          key, ticker: p.ticker, strike: p.strike, right: p.right, expiry: p.expiry, dte: p.dte,
          prints: 0, lastTime: p.time, avgFill: 0, totalSize: 0, totalPremium: 0,
          volume: p.volume, oi: p.oi, deltaOI: p.deltaOI, iv: p.iv, volOverOI: p.volOverOI,
          askPct: 0, bidPct: 0, midPct: 0, score: 0, decisiveness: 0, sweeps: 0, multiLeg: 0,
        },
        fillWeighted: 0, askPrem: 0, bidPrem: 0, midPrem: 0, dirPrem: 0, newest: -1,
      };
      acc.set(key, e);
    }
    const r = e.r;
    r.prints++;
    r.totalSize += p.size;
    r.totalPremium += p.premium;
    e.fillWeighted += p.fill * p.size;
    if (p.sweep) r.sweeps++;
    if (p.legs > 1) r.multiLeg++;

    if (p.side === 'ASK') e.askPrem += p.premium;
    else if (p.side === 'BID') e.bidPrem += p.premium;
    else e.midPrem += p.premium;

    const dir = printDirection(p);
    if (dir !== 0) {
      e.dirPrem += p.premium;
      r.score += dir * p.premium; // normalised below
    }

    /* Contract-level facts come from the NEWEST print, not the first: volume,
       OI and IV move through the session and the latest print carries the
       current reading. Index order is the tie-break, since the tape hands
       prints newest-first. */
    if (e.newest < 0 || i < e.newest) {
      e.newest = i;
      r.lastTime = p.time;
      r.volume = p.volume;
      r.oi = p.oi;
      r.deltaOI = p.deltaOI;
      r.iv = p.iv;
      r.volOverOI = p.volOverOI;
    }
  });

  const out: ContractRollup[] = [];
  for (const e of acc.values()) {
    const r = e.r;
    const prem = r.totalPremium;
    r.avgFill = r.totalSize > 0 ? e.fillWeighted / r.totalSize : 0;
    r.askPct = prem > 0 ? (e.askPrem / prem) * 100 : 0;
    r.bidPct = prem > 0 ? (e.bidPrem / prem) * 100 : 0;
    r.midPct = prem > 0 ? (e.midPrem / prem) * 100 : 0;
    /* Normalised by DIRECTIONAL premium — see the header. */
    r.score = e.dirPrem > 0 ? (r.score / e.dirPrem) * 100 : 0;
    r.decisiveness = prem > 0 ? (e.dirPrem / prem) * 100 : 0;
    out.push(r);
  }
  return out.sort((a, b) => b.totalPremium - a.totalPremium);
}

/** The same read for a whole chain — one ticker's contracts together. */
export interface ChainStance {
  ticker: string;
  score: number;
  decisiveness: number;
  callPremium: number;
  putPremium: number;
  totalPremium: number;
  contracts: number;
}

export function chainStance(rollups: ContractRollup[], ticker: string): ChainStance {
  const mine = rollups.filter(r => r.ticker === ticker);
  let score = 0, dirPrem = 0, total = 0, callPrem = 0, putPrem = 0;
  for (const r of mine) {
    total += r.totalPremium;
    if (r.right === 'C') callPrem += r.totalPremium;
    else putPrem += r.totalPremium;
    /* Re-weight each contract's own score by the dollars that made it — a
       contract's score is already premium-weighted inside itself, so the
       chain is the weighted mean of the parts. */
    const contractDirPrem = (r.decisiveness / 100) * r.totalPremium;
    score += (r.score / 100) * contractDirPrem;
    dirPrem += contractDirPrem;
  }
  return {
    ticker,
    score: dirPrem > 0 ? (score / dirPrem) * 100 : 0,
    decisiveness: total > 0 ? (dirPrem / total) * 100 : 0,
    callPremium: callPrem,
    putPremium: putPrem,
    totalPremium: total,
    contracts: mine.length,
  };
}

/** Words for a score — the same vocabulary the tape's Sentiment column uses. */
export function stanceLabel(score: number, decisiveness: number): string {
  if (decisiveness < 20) return 'NO SIDE';
  if (score >= 55) return 'STRONG BULL';
  if (score >= 20) return 'BULLISH';
  if (score > -20) return 'MIXED';
  if (score > -55) return 'BEARISH';
  return 'STRONG BEAR';
}
