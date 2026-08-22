import type { ExpiryBook, OpenInterest, StrikeNode } from '../types/market';

/*
==================================================
  SLAYER TERMINAL - FOLD THE EXPIRY BOOKS INTO ONE CHAIN (core/chainAggregate.ts)

  The chain a desk reads is a SUM of the per-expiry books, and this is the sum.

  WHY IT MATTERS THAT THE ARROW POINTS THIS WAY. It used to point the other way.
  The simulator built one book at the FRONT expiry's `t` and called that the
  chain, and `data/gex.ts` then produced the strike x expiry matrix by projecting
  that single aggregate across the calendar with a decay anchored on the front
  month. Every "by expiry" figure on the terminal was therefore a restatement of
  the same curve at different scales.

  That is survivable for a heatmap and fatal for anything that asks what one
  expiry CONTRIBUTES. Remove an expiry from a projection of itself and you get
  the projection back, rescaled — so "0DTE holds 34% of the structure" would be
  a property of the decay function, not of the book. It is the same defect class
  as the closing-auction engine this codebase deleted: an answer that looks
  measured and is actually a restatement of its own input.

  So the books are primary now, and the chain is derived. An expiry can be left
  out of this fold and what comes back is a genuinely different structure.

  EXTENSIVE VS INTENSIVE, WHICH IS THE ONLY SUBTLE PART. A `StrikeNode` mixes two
  kinds of quantity and they do not aggregate the same way:

    extensive  callOI, putOI, and every *Gex/*Dex/*Vex dollar figure
               -> SUM. Two books each holding $1M of gamma hold $2M together.

    intensive  gamma, vanna, charm — per-CONTRACT greeks
               -> OPEN-INTEREST-WEIGHTED MEAN. Adding a 0DTE gamma of 0.08 to a
                  60-day gamma of 0.01 and reporting 0.09 describes no contract
                  that exists; the weighted mean is the gamma of the average
                  contract actually open at that strike.

  Summing an intensive greek is the kind of mistake that produces numbers which
  look plausible, scale with the number of expiries you happen to list, and are
  wrong by a factor nobody can see. `chainAggregate.test.ts` pins both halves.
==================================================
*/

const addOI = (a: OpenInterest, b: OpenInterest): OpenInterest => ({
  value: a.value + b.value,
  // The stamp is a property of the FEED, not of the arithmetic: every book in a
  // fold carries the same settlement, so the fold carries it unchanged. Taking
  // the newer of two would quietly upgrade a settled figure by mixing it.
  asOf: a.asOf,
  freshness: a.freshness,
});

/**
 * One strike, folded across the books that list it.
 *
 * `weights` are the open interest each book contributes at this strike, used for
 * the intensive greeks. Total zero (a strike listed with no open interest
 * anywhere) falls back to a plain mean rather than dividing by zero — the greek
 * is then the average of the contracts, which is the only defensible reading
 * when nothing is open to weight by.
 */
function foldStrike(parts: StrikeNode[], weights: number[]): StrikeNode {
  const total = weights.reduce((a, b) => a + b, 0);
  const mean = (pick: (n: StrikeNode) => number): number =>
    total > 0
      ? parts.reduce((a, n, i) => a + pick(n) * weights[i], 0) / total
      : parts.reduce((a, n) => a + pick(n), 0) / parts.length;

  const sum = (pick: (n: StrikeNode) => number): number => parts.reduce((a, n) => a + pick(n), 0);

  return {
    strike: parts[0].strike,
    callOI: parts.map(n => n.callOI).reduce(addOI),
    putOI: parts.map(n => n.putOI).reduce(addOI),
    // Intensive — the greek of the average open contract at this strike.
    gamma: mean(n => n.gamma),
    vanna: mean(n => n.vanna),
    charm: mean(n => n.charm),
    // Extensive — dollars of exposure, which add.
    callGex: sum(n => n.callGex),
    putGex: sum(n => n.putGex),
    netGex: sum(n => n.netGex),
    callDex: sum(n => n.callDex),
    putDex: sum(n => n.putDex),
    netDex: sum(n => n.netDex),
    callVex: sum(n => n.callVex),
    putVex: sum(n => n.putVex),
    netVex: sum(n => n.netVex),
  };
}

/**
 * The chain these books make together, ascending by strike.
 *
 * Books need not list the same strikes — a 0DTE ladder is usually tighter than a
 * LEAP's — so the fold is keyed on the strike itself and a strike listed by one
 * book survives into the chain carrying only that book's exposure. That is the
 * honest reading: nobody holds anything at a strike their expiry does not list.
 */
export function aggregateChain(books: ExpiryBook[]): StrikeNode[] {
  const byStrike = new Map<number, { parts: StrikeNode[]; weights: number[] }>();

  for (const book of books) {
    for (const node of book.nodes) {
      let slot = byStrike.get(node.strike);
      if (!slot) {
        slot = { parts: [], weights: [] };
        byStrike.set(node.strike, slot);
      }
      slot.parts.push(node);
      slot.weights.push(node.callOI.value + node.putOI.value);
    }
  }

  return [...byStrike.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, slot]) => foldStrike(slot.parts, slot.weights));
}

/**
 * The chain as it would read with one expiry gone.
 *
 * This is the whole point of holding the books separately, and it is deliberately
 * a filter over the same fold rather than a second code path: what a reader sees
 * after removing an expiry is built by exactly the arithmetic that built what
 * they saw before it, so a difference between the two is a difference in the
 * BOOK and never a difference in how it was summed.
 */
export function chainWithout(books: ExpiryBook[], drop: (b: ExpiryBook) => boolean): StrikeNode[] {
  return aggregateChain(books.filter(b => !drop(b)));
}
