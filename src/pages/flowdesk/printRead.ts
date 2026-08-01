/*
==================================================
  SLAYER TERMINAL - PRINT READ (printRead.ts)
  The sentences the print drawer speaks. Every clause
  reads a field the tape already computed, so the
  prose can never drift from the numbers beside it.
  Lives apart from the drawer component so that file
  keeps exporting only a component (fast refresh).
==================================================
*/

import type { FlowPrint } from '../../types/flowdesk';

export interface Aggressor {
  /** Short label for the hero block. */
  label: 'BUY' | 'SELL' | 'MID';
  /** Subject-first clause the read sentence opens with. */
  clause: string;
  /** Full class string — Tailwind JIT needs these literal. */
  tone: string;
}

export function aggressorOf(p: FlowPrint): Aggressor {
  if (p.side === 'ASK') return { label: 'BUY', clause: 'A buyer lifted the offer', tone: 'text-bull' };
  if (p.side === 'BID') return { label: 'SELL', clause: 'A seller hit the bid', tone: 'text-bear' };
  return { label: 'MID', clause: 'Both sides met in the middle', tone: 'text-textMuted' };
}

/**
 * True moneyness. `otmPct` is signed strike-versus-spot, so its sign only reads
 * as "out of the money" on a call; on a put it means the exact opposite. The
 * drawer used to print it as "OTM" and tint a positive value green, which called
 * an in-the-money put a bullish plus.
 */
export function moneyness(p: FlowPrint): { otm: boolean; pct: number; label: string; short: string } {
  const otm = p.right === 'C' ? p.otmPct > 0 : p.otmPct < 0;
  const pct = Math.abs(p.otmPct);
  if (pct < 0.05) return { otm, pct, label: 'struck at the money', short: 'At the money' };
  const word = otm ? 'out of the money' : 'in the money';
  return { otm, pct, label: `${pct.toFixed(1)}% ${word}`, short: `${pct.toFixed(1)}% ${otm ? 'OTM' : 'ITM'}` };
}

/** What the fill was, in one sentence: who pressed, for how much, on what. */
export function printRead(p: FlowPrint): string {
  const a = aggressorOf(p);
  const m = moneyness(p);
  const lots = `${p.size.toLocaleString()} ${p.size === 1 ? 'contract' : 'contracts'}`;
  const left = p.dte === 0 ? 'expiring today' : p.dte === 1 ? 'with one day left' : `with ${p.dte} days left`;
  return `${a.clause} on ${lots} at $${p.fill.toFixed(2)}, ${m.label} and ${left}.`;
}

/** What it implies: how it was worked, and whether the contract is growing. */
export function printImplication(p: FlowPrint): string {
  const how = p.sweep
    ? 'It swept several venues in one order, which reads as urgency rather than patience.'
    : p.legs > 1
      ? `It printed as one leg of a ${p.strat.toLowerCase()}, so the position around it is wider than this fill.`
      : 'It crossed in a single clip rather than sweeping, so the buyer took the liquidity that was already sitting there.';

  const oi =
    p.deltaOI > 0
      ? `Open interest in the contract is up ${p.deltaOI.toLocaleString()} on the session, so the day's flow here has been opening positions.`
      : p.deltaOI < 0
        ? `Open interest in the contract is down ${Math.abs(p.deltaOI).toLocaleString()} on the session, so some of the day's flow here has been closing.`
        : 'Open interest in the contract is unchanged on the session, so whether the position was opened or closed is still undecided.';

  return `${how} ${oi}`;
}

/** The honest alternative. Same fill, a different story behind it. */
export function competingRead(p: FlowPrint): string {
  if (p.side === 'MID') return 'A mid fill means neither side pressed, so it carries little direction on its own.';
  if (p.legs > 1) return 'One leg of a spread can point the opposite way to the package it belongs to.';
  if (p.side === 'ASK') {
    return p.right === 'C'
      ? 'Buying calls is as often the long leg of a spread or a hedge on a short position as it is an outright bullish bet.'
      : 'Buying puts is as often protection on stock already held as it is a directional short.';
  }
  return p.right === 'C'
    ? 'Selling calls can be an existing long taking profit, or a covered call against stock, rather than a new short.'
    : 'Selling puts can be protection being retired, or a willingness to be assigned lower, rather than an outright bullish bet.';
}

/** Print size against the contract's open interest — the "does this matter" ratio. */
export function sizeVsOi(p: FlowPrint): number {
  return p.oi > 0 ? (p.size / p.oi) * 100 : 0;
}
