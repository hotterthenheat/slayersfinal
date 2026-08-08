/*
==================================================
  SLAYER TERMINAL - GAMMA TAPE (gammatape.ts)  [P4.3]
  Every other GEX panel INFERS dealer positioning from open interest — a
  once-a-day snapshot of where the book probably sits. The Gamma Tape reads it
  straight off the print: each trade carries a greek vector (trade_greeks) and an
  exchange aggressor (145/146), and those two facts say exactly how much gamma
  and delta the dealer just took onto — or shed from — inventory.

  The sign convention is the whole idea, so it is spelled out once here:

    - A customer who LIFTS THE ASK is BUYING. The dealer is the other side, so the
      dealer SELLS the option and is now SHORT it. A long option is long gamma;
      a short option is short gamma. So a customer buy hands the dealer NEGATIVE
      gamma. dealerSign = −1.
    - A customer who HITS THE BID is SELLING. The dealer BUYS and is now LONG the
      option — POSITIVE gamma. dealerSign = +1.
    - No exchange aggressor (a midpoint print) is directionally mute: it moved
      size but named no initiator, so it contributes 0 to the dealer book here.

  Gamma is signed the same for calls and puts (both long options are long gamma),
  so the right does not enter the gamma sign — only the aggressor does. Delta
  does depend on the right, and the dealer's delta is what the dealer must hedge:
  sell a call, hedge by buying stock (dealer short delta); sell a put, hedge by
  selling stock (dealer long delta). Both fall straight out of dealerSign × the
  option's own greek.

  Deterministic: reads FlowPrint.greeks (data/flowtape stamps it) and nothing
  mutable. Scope one underlying at a time — a dealer's gamma book is per name, so
  summing SPY and NVDA into one cumulative would be a category error.
==================================================
*/

import { math } from '../core/mathProvider';
import type { FlowPrint } from '../types/flowdesk';

/** Dealer position sign implied by the exchange aggressor. */
export type DealerSign = -1 | 0 | 1;

export function dealerSignOf(print: FlowPrint): DealerSign {
  // Customer lifted the ask -> dealer sold -> short (−1). Customer hit the bid
  // -> dealer bought -> long (+1). Midpoint -> no initiator -> 0.
  return print.side === 'ASK' ? -1 : print.side === 'BID' ? 1 : 0;
}

export interface GammaPrint {
  print: FlowPrint;
  dealerSign: DealerSign;
  /** $ dealer GEX change from this print, per 1% underlying move. Negative =
      dealer shed gamma (got shorter); positive = dealer added gamma. */
  dGamma: number;
  /** $ dealer delta change from this print — the hedge it forces. Negative =
      dealer got shorter delta and must BUY the underlying to flatten. */
  dDelta: number;
  /** Running dealer GEX for this name after this print. */
  cumGamma: number;
}

export interface GammaTapeView {
  ticker: string;
  /** Per-print rows, NEWEST FIRST for the tape. cumGamma on each row is the
      running total AT THAT PRINT (computed chronologically before reversing). */
  prints: GammaPrint[];
  /** Total dealer GEX the session's directional prints built, $ per 1% move. */
  netGamma: number;
  /** netGamma ≥ 0 — dealers long gamma (dampening) vs short (amplifying). */
  longGamma: boolean;
  /** Gamma added to the long side, $ (sum of positive dGamma). */
  addedLong: number;
  /** Gamma shed to the short side, $ (absolute sum of negative dGamma). */
  addedShort: number;
  /** Net dealer delta accrued across the session, $. Its sign is the hedge
      direction: negative = dealers net short delta, a standing bid under price. */
  netDelta: number;
  /** Most-negative point the cumulative reached — the session's deepest short. */
  troughGamma: number;
  /** Most-positive point the cumulative reached. */
  peakGamma: number;
  /** The single print that moved dealer gamma the most, by |dGamma|. */
  biggest: GammaPrint | null;
  /** Times the cumulative crossed zero — each is a gamma regime flip. */
  flips: number;
  /** Prints carrying a clear exchange aggressor (dealerSign ≠ 0). */
  directed: number;
}

/*
  The $ unit conventions (GEX per 1% move, dealer delta) come from the MATH SEAM
  (core/mathProvider.ts). They are a convention, not a formula — a house model
  that expresses gamma per 1-point move, or prices a non-100 multiplier,
  overrides them there and this whole tape restates itself.
*/

/**
 * Turn a tape into the dealer's gamma book for ONE name. Pass the whole tape;
 * this filters to `ticker` so the caller does not have to, and so the cumulative
 * is a single coherent book rather than a sum across underlyings.
 */
export function buildGammaTape(prints: FlowPrint[], ticker: string): GammaTapeView {
  // Chronological for the running total. Ordering is by ID, not by `time`:
  // `time` is a bare HH:MM:SS string, so a lexical compare is only accidentally
  // chronological — it inverts the moment a tape spans midnight (or a session
  // that crosses into the next day), which would silently reverse the entire
  // cumulative. The tape's id scheme is monotonic in time by construction
  // (data/flowtape assigns TAPE_ID_CEILING − index over a newest-first seed, so
  // a HIGHER id is a NEWER print), which makes ascending id exactly
  // chronological with no string parsing and no calendar assumption.
  const chrono = prints.filter(p => p.ticker === ticker).sort((a, b) => a.id - b.id);

  let cum = 0;
  let addedLong = 0;
  let addedShort = 0;
  let netDelta = 0;
  let troughGamma = 0;
  let peakGamma = 0;
  let flips = 0;
  let directed = 0;
  let biggest: GammaPrint | null = null;

  const rows: GammaPrint[] = chrono.map(p => {
    const dealerSign = dealerSignOf(p);
    const gamma = p.greeks?.gamma ?? 0;
    const delta = p.greeks?.delta ?? 0;
    const dGamma = dealerSign * math.gammaDollars(gamma, p.size, p.spot);
    const dDelta = dealerSign * math.deltaDollars(delta, p.size, p.spot);

    if (dealerSign !== 0) directed++;
    if (dGamma > 0) addedLong += dGamma;
    else if (dGamma < 0) addedShort += -dGamma;
    netDelta += dDelta;

    const before = cum;
    cum += dGamma;
    if (cum < troughGamma) troughGamma = cum;
    if (cum > peakGamma) peakGamma = cum;
    // A flip is a sign change of the running total across a print. Touching zero
    // and returning to the same side is not a flip; leaving zero for the first
    // time is not either (before === 0).
    if (before !== 0 && cum !== 0 && Math.sign(before) !== Math.sign(cum)) flips++;

    const row: GammaPrint = { print: p, dealerSign, dGamma, dDelta, cumGamma: cum };
    if (!biggest || Math.abs(dGamma) > Math.abs(biggest.dGamma)) biggest = row;
    return row;
  });

  const netGamma = cum;
  rows.reverse(); // newest-first for the tape

  return {
    ticker,
    prints: rows,
    netGamma,
    longGamma: netGamma >= 0,
    addedLong,
    addedShort,
    netDelta,
    troughGamma,
    peakGamma,
    biggest,
    flips,
    directed,
  };
}
