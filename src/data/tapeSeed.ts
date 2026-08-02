/*
==================================================
  SLAYER TERMINAL - OPENING TAPE SEED (tapeSeed.ts)
  The prints that crossed before the reader arrived.
==================================================

  `MarketSnapshot.tape` is a PER-TICK DELTA, not a session tape: simulator.tick()
  builds a fresh array each 1.5s pass — 1–2 orders for the active symbol and 1–2
  for roughly half the rest of the watchlist (simulator.ts:531-554). Measured
  over 60 ticks that is 3.98 prints per tick, first tick 3. So a cold LiveTape
  opened on a handful of rows, took 5 ticks (7.5s) to cover one 640px box and 26
  ticks (39s) to reach 100 — the tape assembling under the reader rather than
  being there when they arrived.

  The simulator already solves this for price: seedCandles() walks a month of
  bars backwards from the current price so the chart opens on a session instead
  of a single dot. This does the same for the tape. It replays the ticks that
  preceded mount on the same cadence the provider runs, taking each print's
  reference price from that minute's candle close — so the opening tape traces
  to the same seeded session path the chart draws, not to a second reality — and
  applying tick()'s own strike / size / aggressor rules on top.

  Draws come from the shared hash family (core/rng), never from the simulator's
  mutable per-symbol RNG streams: pulling from those would advance the sequence
  every other consumer replays and desynchronise the whole terminal.
*/

import Simulator from '../core/simulator';
import { h01, hash } from '../core/rng';
import type { TapeOrder } from '../types/market';

/** The provider's tick cadence (MarketDataContext) — the backfill walks the same clock. */
const TICK_MS = 1500;
/** Candle bar width (simulator BAR_SECONDS) — how a backfilled tick finds its bar. */
const BAR_MS = 60_000;
/** Ticks per bar — also the slot count that keys a backfilled tick inside its minute. */
const TICKS_PER_BAR = BAR_MS / TICK_MS;
/** Ceiling on how far back to walk, so a thin watchlist cannot spin. 600 ticks is
    15 minutes — well inside the 390-bar session the newest candles belong to. */
const MAX_TICKS_BACK = 600;

/**
 * A backfilled print, carrying the instant it crossed as well as the clock
 * string LiveTape renders. `time` is `toLocaleTimeString()`, which has no date
 * on it, so two prints either side of local midnight read out of order as text
 * while the tape itself is in order; `at` is the number the walk-back is
 * actually ordered by.
 */
export interface SeededPrint extends TapeOrder {
  /** Epoch ms the print crossed — `time` is this instant rendered. */
  at: number;
}

/**
 * The session window immediately behind `Date.now()`, newest print first — the
 * same order LiveTape prepends live prints in.
 *
 * Deterministic: every draw is keyed on the symbol, the bar's timestamp and the
 * tick's slot within that bar, so the same session always paints the same
 * opening tape and it re-rolls as the session advances a minute rather than
 * replaying a frozen window.
 */
export function seedSessionTape(want: number): SeededPrint[] {
  const symbols = Array.from(new Set([Simulator.getActiveTicker(), ...Simulator.WATCHLIST]));
  const now = Date.now();
  const out: SeededPrint[] = [];

  for (let k = 1; out.length < want && k <= MAX_TICKS_BACK; k++) {
    const at = now - k * TICK_MS;
    const barsBack = Math.floor((k * TICK_MS) / BAR_MS);
    const slot = k % TICKS_PER_BAR;

    for (const sym of symbols) {
      const cfg = Simulator.TICKERS[sym];
      const bars = Simulator.getCandles(sym);
      if (!cfg || !bars || bars.length === 0) continue;
      const bar = bars[Math.max(0, bars.length - 1 - barsBack)];

      const seed = `${sym}-tape-${bar.time}-${slot}`;
      // Same two rates tick() runs: the active symbol always prints, the rest of
      // the watchlist prints on roughly half its ticks. Keeps the backfilled
      // window at the density the live tape goes on to produce, so the tape does
      // not visibly change pace at the handover.
      const prints =
        sym === symbols[0] || h01(`${seed}-gate`) > 0.45 ? 1 + (hash(`${seed}-n`) % 2) : 0;

      for (let i = 0; i < prints; i++) {
        const s = `${seed}-${i}`;
        const offset = (Math.floor(h01(`${s}-off`) * 7) - 3) * cfg.step;
        const strike = Math.round(bar.close / cfg.step) * cfg.step + offset;
        out.push({
          at,
          time: new Date(at).toLocaleTimeString(),
          ticker: sym,
          strike: strike.toFixed(2),
          type: h01(`${s}-cp`) > 0.5 ? 'C' : 'P',
          size: Math.floor(h01(`${s}-sz`) * 250) + 10,
          orderType: h01(`${s}-ot`) > 0.65 ? 'SWEEP' : 'BLOCK',
          side: h01(`${s}-sd`) > 0.48 ? 'ASK' : 'BID',
        });
      }
    }
  }

  return out.length > want ? out.slice(0, want) : out;
}
