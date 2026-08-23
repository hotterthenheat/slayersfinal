import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { fmtUsd } from '../../data/gex';
import { heatCellStyle } from '../gex/heatmap';
import { FOCUS_RING } from '../ui/focusRing';
import TickerSearch from '../ui/TickerSearch';
import type { StrikeExposure } from '../../types/gex';

/*
==================================================
  SLAYER TERMINAL - THE STRIKE LADDER (terrain/StrikeLadder.tsx)

  One column: every strike in the book, top to bottom, with
  the dealer's net gamma at that strike painted into the
  cell and printed in it.

  A LADDER, NOT THE MATRIX. `GexMatrix` is strikes × EXPIRIES
  — a board you scan across to see how the book rolls off.
  This is strikes × ONE expiry, which is a different
  question: not "how does this change by Friday" but "what
  does the book look like right now, at every price". That
  is the question you ask standing beside a chart, which is
  where this lives, and it is why the two are separate
  components rather than one with a column count of 1.

  THE STRIKE IS OUTSIDE THE CELL. The gutter carries the
  price and nothing else — no fill, no heat — so a reader
  scanning for a level is reading a plain column of numbers
  rather than picking them out of a gradient. The cell to
  its right carries the whole visual weight, which makes the
  column read as a profile at a glance and as a table when
  you look at it.

  THE COLOUR IS OURS. Gold is short gamma, blue is long
  gamma, straight from `heatCellStyle` — the same painter
  the matrix uses, so a cell means the same thing on both
  desks. The ink is chosen by measured contrast against the
  fill it lands on rather than by a brightness guess.
==================================================
*/

export interface StrikeLadderProps {
  ticker: string;
  /** e.g. "Aug 17 (0DTE)" — the book this column is showing. */
  expiryLabel: string;
  /** Strikes, any order; rendered high to low. */
  strikes: StrikeExposure[];
  spot: number;
  /**
   * The scale every cell is painted against.
   *
   * Passed in rather than derived here, so the HOST decides whether a rail of
   * columns shares one scale or gives each its own — and has to say which. The
   * two answers look completely different and neither is right in the abstract:
   * shared makes a quiet book look quiet; per-column makes every book legible.
   * Terrain's call site carries the reasoning for the choice it made.
   */
  maxAbs: number;
  /** Rendered when the column can be dismissed. */
  onClose?: () => void;
  /** When given, the header ticker becomes a picker that repoints this column. */
  onTickerChange?: (symbol: string) => void;
  /** Fires with the strike under the pointer, for a host wiring the chart to it. */
  onHoverStrike?: (strike: number | null) => void;
}

/** Row height. 20px fits ~34 strikes in a 700px lane without scrolling. */
const ROW_H = 20;

const StrikeLadder = ({
  ticker,
  expiryLabel,
  strikes,
  spot,
  maxAbs,
  onClose,
  onTickerChange,
  onHoverStrike,
}: StrikeLadderProps) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const spotRef = useRef<HTMLDivElement | null>(null);

  const rows = [...strikes].sort((a, b) => b.strike - a.strike);
  // The strike the money is at. Nearest, not "the one below" — on a $1 chain a
  // spot of 731.9 belongs to 732, and rounding down would light the wrong row.
  const atSpot = rows.reduce(
    (best, r) => (Math.abs(r.strike - spot) < Math.abs(best - spot) ? r.strike : best),
    rows[0]?.strike ?? spot
  );

  /*
    Open on the money.

    A 40-strike ladder is taller than the lane, and a column that opens at its
    top strike shows the far out-of-the-money wing — the part of the book
    nobody opens this desk to read. Scrolling spot to the middle on mount and
    on a ticker change puts the rows either side of the money on screen, which
    is the whole reason the column is here.
  */
  useEffect(() => {
    const box = scrollRef.current;
    const row = spotRef.current;
    if (!box || !row) return;
    box.scrollTop = row.offsetTop - box.clientHeight / 2 + ROW_H / 2;
  }, [ticker, rows.length]);

  return (
    <section
      className="flex min-h-0 w-[178px] shrink-0 flex-col border-l border-borderSubtle"
      aria-label={`${ticker} dealer gamma by strike, ${expiryLabel}`}
    >
      <header className="flex shrink-0 items-center gap-1.5 px-1.5 py-1">
        {/* The symbol IS the picker when the host offers one — same control the
            top bar uses, so there is one way to change which name a surface is
            looking at rather than a second one invented for this rail. */}
        {onTickerChange ? (
          <TickerSearch compact value={ticker} onChange={onTickerChange} />
        ) : (
          <span className="rounded border border-borderSubtle bg-inset px-1.5 py-0.5 font-mono text-micro font-semibold uppercase tracking-wider text-textPrimary">
            {ticker}
          </span>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${ticker} ladder`}
            className={`-m-1 ml-auto shrink-0 p-1 text-textMuted transition-colors hover:text-textPrimary ${FOCUS_RING}`}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </header>

      {/*
        The expiry gets its own line.

        It shared the header row with the ticker picker and the close button,
        and at 178px there was not enough left for it: `AUG 24 (1DTE)` rendered
        as `AUG 24 (1…` in every column, which names a date and then hides the
        one part that says how far out the book is. A 16px row costs 2% of the
        lane and buys the whole label.
      */}
      <div className="shrink-0 truncate border-b border-borderSubtle px-1.5 pb-1 text-center font-mono text-micro uppercase tracking-wider text-textSecondary">
        {expiryLabel}
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto no-scrollbar"
        onMouseLeave={() => onHoverStrike?.(null)}
      >
        {rows.map(row => {
          const isSpot = row.strike === atSpot;
          return (
            <div
              key={row.strike}
              ref={isSpot ? spotRef : undefined}
              className="flex items-stretch"
              style={{ height: ROW_H }}
              onMouseEnter={() => onHoverStrike?.(row.strike)}
            >
              {/* The gutter: price only, never painted. */}
              <span
                className={`flex w-[46px] shrink-0 items-center justify-end pr-1.5 font-mono text-micro tnum ${
                  isSpot ? 'bg-rowHover font-bold text-textPrimary' : 'text-textMuted'
                }`}
              >
                {isSpot && (
                  /* A CSS triangle, not a glyph. `▸` (U+25B8) is outside the
                     shipped font subset, so the browser substitutes a different
                     face for that one character — a visibly wrong marker with
                     no error anywhere. Borders draw the same shape in the font
                     we actually ship, which is none. */
                  <span
                    aria-hidden="true"
                    className="mr-1 h-0 w-0 border-y-[3px] border-l-[4px] border-y-transparent border-l-textSecondary"
                  />
                )}
                {row.strike % 1 === 0 ? row.strike.toFixed(0) : row.strike.toFixed(1)}
              </span>
              {/* The cell: the whole visual weight of the row. */}
              <span
                className="flex min-w-0 flex-1 items-center justify-end px-1.5 font-mono text-micro tnum"
                style={heatCellStyle(row.gex.net, maxAbs)}
                title={`${ticker} ${row.strike} · net dealer gamma ${fmtUsd(row.gex.net)} · ${
                  row.gex.net < 0 ? 'short gamma, hedging amplifies' : 'long gamma, dips absorbed'
                }`}
              >
                {fmtUsd(row.gex.net)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default StrikeLadder;
