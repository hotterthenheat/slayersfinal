/*
==================================================
  SLAYER TERMINAL - THE DESK'S OWN DATA, IN PINE (data/pine/feed.ts)
  What TradingView cannot run.
==================================================

  A Pine engine that only serves open/high/low/close is a worse TradingView.
  The reason to have one here is the OTHER half of this terminal: the dealer
  book. A reader can write

      wall = slayer.callwall
      plot(wall, "call wall")
      alertcondition(ta.crossover(close, wall), "through the call wall")

  and there is no other charting platform on earth where that line compiles.

  ─────────────────────────────────────────────────────────────────────────
  THE ONE DISTINCTION THIS FILE EXISTS TO ENFORCE

  Some of the desk's numbers have REAL PER-BAR HISTORY and some are a
  SNAPSHOT OF TODAY. The engine must never let a reader confuse them.

    SERIES     the gamma book is recorded once a minute, so net GEX, the
               walls, the flip and the open interest at every strike each
               have a value AT EVERY BAR. `ta.crossover(close, callwall)`
               means what it looks like: spot went through a wall that was
               there at the time.

    SNAPSHOT   net delta, vega and charm exposure come off the CURRENT
               chain. There is one of them, for right now. Handing that back
               on every bar draws a perfectly flat line across the chart
               that looks exactly like history and is not — and someone
               would trade the "level" it appears to hold.

  Both are available, because refusing the snapshot half would mean a reader
  cannot ask "what is dealer delta today" at all. But a run that touches the
  snapshot half NAMES IT, in `run.notes`, the same way a run that reads a
  higher-timeframe bar early names that. The editor prints those notes under
  the verdict. The engine draws what the script says and says what it did.

  ─────────────────────────────────────────────────────────────────────────
  WHY THE HOST BUILDS IT

  This file is TYPES ONLY. The interpreter stays pure — it is handed a feed
  through `RunOpts` exactly as it is handed `resolveBars`, so the engine can
  be proved against a staged book with no simulator behind it, and the app
  is the only thing that knows where a book comes from.
*/

/** One bar's reading of the dealer book, already aligned to the run's bars. */
export interface BookBar {
  /** Signed total net dealer gamma across the whole book, in dollars. */
  netGex: number;
  /** The four structural prices. Null is a real answer: "none qualifies". */
  callWall: number | null;
  putWall: number | null;
  flip: number | null;
  supreme: number | null;
  /** The chain's strike spacing at this bar; 0 when it is too thin to say. */
  step: number;
  /** Every strike's net GEX at this bar, ascending by strike. */
  strikes: readonly BookStrike[];
}

export interface BookStrike {
  strike: number;
  /** Net GEX at this strike, signed dollars. */
  value: number;
  /** Open interest at the same instant. Undefined on a snapshot recorded
      before OI was carried — which reads as `na`, never as zero. */
  callOI?: number;
  putOI?: number;
}

/**
 * TODAY'S CHAIN, collapsed to totals — one reading, no history.
 *
 * Every field here is the same number on every bar of the run. That is the
 * whole reason this type is separate from `BookBar` rather than a few more
 * fields on it: the shape of the data says which kind it is, so a future
 * reader of this code cannot accidentally serve one as the other.
 */
export interface ChainNow {
  /** Signed totals across the live chain, in dollars. */
  netDex: number;
  netVex: number;
  netVanna: number;
  netCharm: number;
  /** Argmin of total intrinsic payout. Null on a chain with no OI. */
  maxPain: number | null;
  /** |Gamma-dollar|-weighted centroid of the strikes. */
  gammaPin: number | null;
}

/**
 * What the host hands the engine.
 *
 * `book` is indexed by the run's own bar index, so alignment is settled
 * before the engine ever sees it — one place to get right rather than one
 * per built-in. A null entry is a bar with no book behind it (the history
 * does not reach back that far), and every `slayer.*` series reads `na`
 * there rather than carrying the last known value forward.
 */
/**
 * THE REST OF THE DESK, per bar.
 *
 * `book` is the dealer chain. This is everything else the desk knows that has
 * a value at every bar rather than only today: the option tape summed into
 * the same buckets the candles use, realised volatility, and whether a bar
 * carries an event.
 *
 * EVERY LANE IS NULLABLE PER BAR, and that is load-bearing rather than
 * defensive. The option tape accumulates from the moment the app opens and
 * keeps roughly four hours; a chart showing six hundred bars has flow behind
 * the last dozen and nothing behind the rest. A zero there would assert "the
 * tape was quiet", which is a claim about the market. A null says "we were
 * not listening", which is a claim about us, and it is the true one.
 */
export interface DeskBar {
  /** Call premium printed in this bar, dollars. Null where the tape does not reach. */
  callPrem: number | null;
  putPrem: number | null;
  /** Annualised realised volatility, percent. Null inside the warm-up window. */
  rv: number | null;
  /** True on a bar carrying an earnings or macro event. */
  event: boolean;
}

/**
 * LEVELS THE DESK COMPUTES ONCE FOR THE SESSION, not per bar.
 *
 * A volume profile's point of control is a property of a session, not of a
 * bar; so is the expected-move band the options priced this morning. They are
 * handed over as levels and tagged SNAPSHOT in the reference, for the same
 * reason the greeks are: plotted per bar they draw a flat line that looks
 * exactly like a level which held all day, and a reader cannot tell the two
 * apart from the picture.
 */
export interface DeskLevels {
  /** Volume profile — point of control and the value area's edges. */
  vpoc: number | null;
  vah: number | null;
  val: number | null;
  /** The band the options priced for today, at one and two sigma. */
  em1Hi: number | null;
  em1Lo: number | null;
  em2Hi: number | null;
  em2Lo: number | null;
  /** Yesterday's high, low and close. */
  pdh: number | null;
  pdl: number | null;
  pdc: number | null;
  /** The opening range and the initial balance, once each is complete. */
  orHi: number | null;
  orLo: number | null;
  ibHi: number | null;
  ibLo: number | null;
  /** Today's implied volatility as the feed reports it, percent. */
  iv: number | null;
}

export interface SlayerFeed {
  book: readonly (BookBar | null)[];
  now: ChainNow | null;
  /** Aligned to `book` and to the bars — one entry per bar, or absent. */
  desk?: readonly DeskBar[];
  levels?: DeskLevels;
  /**
   * How far back the option tape actually reaches, as a bar index. Scripts
   * reading flow are told this in a note rather than left to work out why
   * their indicator starts two thirds of the way across the chart.
   */
  flowFromBar?: number | null;
}

/** The nearest strike to a price, or null when the book is empty. */
export function strikeNear(strikes: readonly BookStrike[], price: number): BookStrike | null {
  let best: BookStrike | null = null;
  let bestGap = Infinity;
  for (const s of strikes) {
    const gap = Math.abs(s.strike - price);
    if (gap < bestGap) {
      bestGap = gap;
      best = s;
    }
  }
  return best;
}
