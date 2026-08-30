import type { FlowPrint } from '../types/trace';

/*
==================================================
  SLAYER TERMINAL - LIVE VOLUME BY STRIKE
  (data/strikeFlow.ts)
==================================================

  How many contracts are going into each strike RIGHT NOW, counted off the
  option print tape.

  WHY THIS EXISTS RATHER THAN THE FIGURE ALREADY ON THE CHAIN. Every strike
  already carries a `volume`, and it is a placeholder that says so:

      // SAME seed and formula as rankedtargets.ts — one volume per strike
      // across the terminal, until a real tape replaces both
      const volume = Math.round(oi * (0.2 + h01(`${ticker}-${strike}-tvol`) * 0.7));

  It is a day-stable hash of open interest. It does not move while you watch
  it, it cannot answer "what is being hit in the last few minutes", and two
  strikes with identical OI report volume in a fixed ratio all day. Anything
  built on it that CALLS itself live would be a lie about the tape.

  The print tape is the real thing: every option print carries a strike, a
  right, a size and a timestamp, and it accumulates as the session runs. Sum
  it by strike and the answer moves because the market moved.

  A ROLLING WINDOW, NOT THE SESSION. "How much is going into each one right
  now" is a question about recent flow, so this counts a window rather than
  the whole day — a strike that took size at the open and nothing since is
  not where the money is going now. The window is the caller's, because a
  rail beside a chart and a scanner ranking names want different spans.

  WHAT IT CANNOT SEE. The tape itself is capped and aged by
  MarketDataContext, so a window longer than the tape's own retention
  silently reports less than it should. `coverageMs` says how far back the
  tape actually reaches, and a caller asking for more than that is told,
  rather than being handed a short count dressed as a full one.
*/

export interface StrikeFlowRow {
  strike: number;
  /** Contracts traded at this strike inside the window, calls. */
  callVolume: number;
  /** …and puts. */
  putVolume: number;
  /** Both sides. */
  volume: number;
  /** Prints, not contracts — a hundred singles is not one block of a hundred. */
  prints: number;
}

export interface StrikeFlow {
  rows: StrikeFlowRow[];
  /** The heaviest strike's total, for scaling a column. 0 on an empty tape. */
  maxVolume: number;
  /** Every contract counted, across every strike in the window. */
  total: number;
  /** How far back the tape actually reaches, in ms — see the header. */
  coverageMs: number;
  /** True when the window asked for more history than the tape holds. */
  truncated: boolean;
}

const EMPTY: StrikeFlow = { rows: [], maxVolume: 0, total: 0, coverageMs: 0, truncated: false };

/**
 * Contracts by strike over the last `windowMs`, from the live print tape.
 *
 * @param tape    prints with an `at` stamp, newest first (the tape's own order)
 * @param ticker  only this name's prints are counted
 * @param windowMs how far back to look
 * @param now     injectable, so this can be proven at a chosen instant
 */
export function strikeFlow(
  tape: readonly (FlowPrint & { at: number })[],
  ticker: string,
  windowMs: number,
  now: number = Date.now()
): StrikeFlow {
  if (tape.length === 0 || !(windowMs > 0)) return EMPTY;

  const cutoff = now - windowMs;
  const byStrike = new Map<number, StrikeFlowRow>();
  let total = 0;
  let oldest = Infinity;

  for (const p of tape) {
    if (p.ticker !== ticker) continue;
    /* Coverage is measured over the WHOLE tape for this name, not just the
       window — it answers "how far back could I have looked", which is only
       meaningful if prints outside the window still count toward it. */
    if (p.at < oldest) oldest = p.at;
    if (p.at < cutoff) continue;
    const size = Number.isFinite(p.size) ? p.size : 0;
    if (size <= 0) continue;

    let row = byStrike.get(p.strike);
    if (!row) {
      row = { strike: p.strike, callVolume: 0, putVolume: 0, volume: 0, prints: 0 };
      byStrike.set(p.strike, row);
    }
    if (p.right === 'C') row.callVolume += size;
    else row.putVolume += size;
    row.volume += size;
    row.prints += 1;
    total += size;
  }

  if (byStrike.size === 0) {
    return { ...EMPTY, coverageMs: Number.isFinite(oldest) ? Math.max(0, now - oldest) : 0 };
  }

  const rows = [...byStrike.values()].sort((a, b) => a.strike - b.strike);
  let maxVolume = 0;
  for (const r of rows) maxVolume = Math.max(maxVolume, r.volume);

  const coverageMs = Number.isFinite(oldest) ? Math.max(0, now - oldest) : 0;
  return { rows, maxVolume, total, coverageMs, truncated: coverageMs < windowMs };
}

/** One strike's row out of a built flow, or null if nothing traded there. */
export function flowAt(flow: StrikeFlow, strike: number): StrikeFlowRow | null {
  return flow.rows.find(r => Math.abs(r.strike - strike) < 1e-9) ?? null;
}

/** "12.4k" / "840" — contracts, in a column's worth of characters. */
export function fmtContracts(n: number): string {
  const v = Math.round(n);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(v >= 10_000 ? 0 : 1)}k`;
  return String(v);
}
