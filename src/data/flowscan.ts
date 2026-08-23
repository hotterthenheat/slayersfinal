/*
==================================================
  SLAYER TERMINAL - FLOW SCANNER (flowscan.ts)
  The session tape, rolled up per contract: volume,
  premium, aggressor split, sweep count, and an
  estimate of what today's flow has done to open
  interest. The scanning tool behind Trace › Scanner.

  IT READS THE TAPE NOW, AND IT DID NOT BEFORE.

  Every figure on this desk used to be a hash. Volume
  was `oi × hRange(0.15, 1.9)`. The bid/ask split —
  which produced the bull score, which produced the
  BULLISH/BEARISH verdict on every row — was
  `hRange(12, 88)`. The column headed "Est ΔOI/d" was
  `(h01(seed) − 0.4) × volume × 0.5`.

  docs/DATA-FEASIBILITY.md names that pattern exactly,
  in the paragraph explaining why the closing-auction
  engine was deleted: "a hash of the ticker printed
  with a sigma after it". The difference here is that
  the real thing was already in the building. Trace ›
  Tape holds the session's actual prints for the same
  contracts, with real sizes, real aggressor sides
  read off the OPRA condition codes, real premium and
  real timestamps — and the Scanner was drawing beside
  it from an unrelated random source. Two desks, one
  set of contracts, two answers.

  So the rollup is a rollup. Volume is the sum of
  sizes. The bid/ask split is counted off the prints.
  Sweeps are the prints flagged as sweeps. A contract
  with no prints does not appear, because a FLOW
  scanner listing contracts with no flow is listing
  the chain.

  ΔOI IS THE ONE ESTIMATE, AND IT SAYS SO. See
  core/openInterest.ts:estimatedOI for what the
  estimate assumes and why it is stamped rather than
  folded into the settled figure.
==================================================
*/

import { estimatedOI } from '../core/openInterest';
import { expiryFor, fmtExpiryShort } from '../core/calendar';
import type { MarketSnapshot, OpenInterest } from '../types/market';
import type { FlowPrint } from '../types/flowdesk';

export type FlowSentiment = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface ScannerRow {
  id: string;
  ticker: string;
  strike: number;
  right: 'C' | 'P';
  otmPct: number;
  dte: number;
  expiry: string;
  /** Time of the most recent print on this contract. */
  last: string;
  /** Contracts traded today, summed off the prints. */
  volume: number;
  /** Settled open interest — the prior session's published close. */
  oi: number;
  /**
   * ESTIMATED position change since the open: buyer-initiated volume minus
   * seller-initiated volume. An estimate, not a measurement — the tape does not
   * say who was opening. See core/openInterest.ts:estimatedOI.
   */
  deltaOi: number;
  deltaOiPct: number;
  /** Settled OI plus the estimate above, carrying its own ESTIMATED stamp. */
  estOi: OpenInterest;
  premium: number;
  avgFill: number;
  iv: number;
  /**
   * Bid-side share of DIRECTIONAL volume, 0–100. Midpoint crosses are excluded
   * rather than split: a print that hit neither side is not half a seller, and
   * counting it as one would drag every contract's read toward 50 in proportion
   * to how much of its volume was negotiated.
   */
  bidPct: number;
  /** Share of the contract's volume that crossed at the midpoint, 0–100. */
  midPct: number;
  /** −100…+100 conviction (ask-lifted calls / bid-hit puts = bullish) */
  bullScore: number;
  sentiment: FlowSentiment;
  /** Prints on this contract that the exchange flagged as sweeps. */
  sweeps: number;
  /** Prints on this contract today. */
  prints: number;
  volOverOi: number;
}

export interface ScannerSummary {
  contracts: number;
  totalPremium: number;
  callPremium: number;
  putPremium: number;
  netPremium: number;
  bullish: boolean;
  sweeps: number;
  topBull: ScannerRow | null;
  topBear: ScannerRow | null;
  deltaOiLeader: ScannerRow | null;
}

/**
 * Roll the session tape up per contract.
 *
 * `snapshot` supplies the settled open interest to estimate against and the
 * spot to measure moneyness from; `prints` supplies everything else. Both are
 * arguments rather than one being fetched here, so the desk and the tape it
 * summarises can never be looking at different windows.
 */
export function buildScannerRows(snapshot: MarketSnapshot, prints: FlowPrint[]): ScannerRow[] {
  const { ticker, spot, chain } = snapshot;

  /* Settled OI per strike and right, off the chain. The prints carry their own
     settled figure too, but the chain is the book every other Pinpoint desk
     reads, and one desk quoting a different OI for a strike than its neighbour
     is the disagreement this file was rebuilt to end. */
  const settledFor = new Map<string, number>();
  for (const node of chain) {
    settledFor.set(`${node.strike}-C`, node.callOI.value);
    settledFor.set(`${node.strike}-P`, node.putOI.value);
  }

  interface Acc {
    prints: FlowPrint[];
    volume: number;
    premium: number;
    askVol: number;
    bidVol: number;
    midVol: number;
    ivWeighted: number;
    sweeps: number;
  }

  const byContract = new Map<string, Acc>();
  for (const p of prints) {
    if (p.ticker !== ticker) continue;
    const key = `${p.strike}-${p.right}-${p.dte}`;
    let a = byContract.get(key);
    if (!a) {
      a = { prints: [], volume: 0, premium: 0, askVol: 0, bidVol: 0, midVol: 0, ivWeighted: 0, sweeps: 0 };
      byContract.set(key, a);
    }
    a.prints.push(p);
    a.volume += p.size;
    a.premium += p.premium;
    if (p.side === 'ASK') a.askVol += p.size;
    else if (p.side === 'BID') a.bidVol += p.size;
    else a.midVol += p.size;
    a.ivWeighted += p.iv * p.size;
    if (p.sweep) a.sweeps += 1;
  }

  const rows: ScannerRow[] = [];
  for (const [, a] of byContract) {
    const first = a.prints[0];
    const directional = a.askVol + a.bidVol;
    const bidPct = directional > 0 ? (a.bidVol / directional) * 100 : 50;
    const askPct = 100 - bidPct;

    /*
      Ask-lifted calls and bid-hit puts read bullish; the reverse bearish.

      TWO THINGS DISCOUNT THE RAW SPLIT, and both exist because the rollup made
      the desk honest enough to expose a problem the hash had been hiding.

      `directionalShare` — how much of the volume took a side at all. A contract
      that negotiated its whole session at the midpoint should not inherit the
      sign of whichever handful of lots crossed.

      `evidence` — how many INDEPENDENT prints the split is counted over. The
      hashed version drew bidPct from hRange(12, 88) and so could never reach an
      extreme; a real rollup can, and does, constantly: most contracts on a
      session tape trade once or twice, and one print is 100% of its own volume
      on one side by definition. Shipping `+100 BULLISH` off a single trade is
      the fabricated-certainty pattern this repo has a guard file about. A
      contract with ONE print gets no verdict at all — one trade is a trade, not
      a lean — and beyond that the score converges on the raw split as the
      prints accumulate: 2 prints carry half of it, 4 carry two thirds, 8 carry
      four fifths.
    */
    const raw = first.right === 'C' ? askPct - bidPct : bidPct - askPct;
    const directionalShare = a.volume > 0 ? directional / a.volume : 0;
    const evidence = a.prints.length < 2 ? 0 : a.prints.length / (a.prints.length + 2);
    /* `+ 0` for the third time in this codebase, and the third time it was
       caught by a test rather than by reading: Math.round(-100 * 0) is NEGATIVE
       ZERO. It renders as "-0", and `>= 0` is true while its sign bit is not —
       so a score with no lean in it publishes a signed flat. See compass.ts:664
       and core/scanUniverse.ts, which carry the other two. */
    const bullScore = Math.max(-100, Math.min(100, Math.round(raw * directionalShare * evidence))) + 0;

    const settled = settledFor.get(`${first.strike}-${first.right}`) ?? first.oi.value;
    // Buyer-initiated volume opens, seller-initiated closes. The standard
    // convention, and an estimate — see core/openInterest.ts:estimatedOI.
    const signedVolume = a.askVol - a.bidVol;
    const est = estimatedOI(settled, signedVolume);

    // Newest print on the contract, by the tape's own HH:MM:SS strings.
    const last = a.prints.reduce((best, p) => (p.time > best.time ? p : best), a.prints[0]);

    rows.push({
      id: `${ticker}-${first.strike}-${first.right}-${first.dte}`,
      ticker,
      strike: first.strike,
      right: first.right,
      otmPct: ((first.strike - spot) / spot) * 100,
      dte: first.dte,
      expiry: fmtExpiryShort(expiryFor(first.dte).date),
      last: last.time.slice(0, 5),
      volume: a.volume,
      oi: settled,
      deltaOi: signedVolume,
      deltaOiPct: settled > 0 ? (signedVolume / settled) * 100 : 0,
      estOi: est,
      premium: a.premium,
      // Premium over contracts x 100 — the volume-weighted average fill, which
      // is what "average price paid" means for a contract that traded ten times.
      avgFill: a.volume > 0 ? Number((a.premium / (a.volume * 100)).toFixed(2)) : first.fill,
      iv: a.volume > 0 ? a.ivWeighted / a.volume : first.iv,
      bidPct: Math.round(bidPct),
      midPct: a.volume > 0 ? Math.round((a.midVol / a.volume) * 100) : 0,
      bullScore,
      sentiment: bullScore > 22 ? 'BULLISH' : bullScore < -22 ? 'BEARISH' : 'NEUTRAL',
      sweeps: a.sweeps,
      prints: a.prints.length,
      volOverOi: settled > 0 ? a.volume / settled : 0,
    });
  }

  return rows.sort((a, b) => b.premium - a.premium);
}

/*
  `IntradayPoint` and `buildContractIntraday` were here and are DELETED, not
  moved. Nothing imported them: the Scanner's row drawer draws
  `ContractFlowChart` off data/contractflow.ts, and has since before this file
  was rewritten. What was left behind was an exported builder that spread
  `row.premium / n` evenly across forty points, multiplied it by a hash and by
  the sign of the row's own lean, and returned a curve that could only ever be
  monotone in the direction the verdict had already chosen. Dead code is bad
  enough; dead code that fabricates a chart agreeing with its own caption is
  worth naming on the way out.
*/

export function summarizeScanner(rows: ScannerRow[]): ScannerSummary {
  const callPremium = rows.filter(r => r.right === 'C').reduce((a, r) => a + r.premium, 0);
  const putPremium = rows.filter(r => r.right === 'P').reduce((a, r) => a + r.premium, 0);
  // Bull premium = bullish-scored contracts; net leans that way
  const bullPrem = rows.filter(r => r.sentiment === 'BULLISH').reduce((a, r) => a + r.premium, 0);
  const bearPrem = rows.filter(r => r.sentiment === 'BEARISH').reduce((a, r) => a + r.premium, 0);
  const byScore = [...rows].sort((a, b) => b.bullScore - a.bullScore);
  const byDeltaOi = [...rows].sort((a, b) => Math.abs(b.deltaOi) - Math.abs(a.deltaOi));
  return {
    contracts: rows.length,
    totalPremium: callPremium + putPremium,
    callPremium,
    putPremium,
    netPremium: bullPrem - bearPrem,
    bullish: bullPrem >= bearPrem,
    sweeps: rows.reduce((a, r) => a + (r.sweeps > 0 ? 1 : 0), 0),
    topBull: byScore[0] ?? null,
    topBear: byScore[byScore.length - 1] ?? null,
    deltaOiLeader: byDeltaOi[0] ?? null,
  };
}
