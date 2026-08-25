import { fmtUsd } from '../../data/gex';
import { heatMagnitude, heatRgb } from './heatmap';
import type { GexLevel } from '../../types/market';
import type { KeyLevels } from '../../types/gex';

/*
==================================================
  SLAYER TERMINAL - PANE LADDER (components/gex/PaneLadder.tsx)

  The column that runs down the right edge of a
  Terrain pane: every strike as a row, the exposure
  parked there as a bar, and the price the market is
  actually at cutting through them.
==================================================

  WHY IT IS A LADDER AND NOT A DEPTH BOOK.

  The reference this was built against shows a book beside the tape — resting
  size at each price. This product has no resting size: it holds an options
  chain, not a limit book, and inventing one would mean inventing the numbers.
  So the column shows the size this desk CAN see, which is the exposure sitting
  at each strike — the same book the chart's own lines are drawn from.

  That sourcing is the whole design. `buildLadderFor` hands back the rows of
  the very snapshot `buildLevelsFor` reduces to four prices, and the named
  levels arrive as a prop from the pane that already holds them. So the KING
  bar in this column is at the KING line on the chart beside it, always, and
  not because two generators happened to agree.

  THE BAR IS DOUBLE-ENCODED, on purpose and for a reason the heatmap already
  wrote down: length AND colour carry the same number, off the same curve.
  Brightness is what the eye catches scanning a 120px column; length is what it
  reads once it stops. Sizing linearly while colouring on the ramp's curve
  produces rows that are visibly hot and visibly empty, which reads as a
  rendering fault rather than as a light strike — hence `heatMagnitude`.

  Steel is call-dominant (dealers absorb), gold is put-dominant (dealers
  amplify). Same inks as the matrix, the pressure ladder and the chart's
  trails, because a reader should not have to learn this column separately.
*/

interface PaneLadderProps {
  ticker: string;
  rows: GexLevel[];
  maxAbs: number;
  /** The pane's own named levels — never re-derived here, see the note above */
  levels: KeyLevels;
  /** Currently flashed on the chart, so the column can show which row it is */
  focusPrice?: number | null;
  /** Click a strike to flash it on the chart beside this rail */
  onSelect?: (price: number) => void;
  /*
    Pixels of the host's height that belong to the CHART'S TIME AXIS, not to
    its plot. The rail runs down the side of a chart, and without this it runs
    down the side of the time axis too — which is what made the times read as
    cut off: the axis stopped at the chart's edge and a column of strike bars
    carried on past it, so the corner where the two scales should meet was
    full of ladder. Reserving the axis's own height lines the rail's last row
    up with the plot's floor and leaves that corner empty, the way every
    charting product draws it.
  */
  axisInset?: number;
}

/*
  The bars are TRANSLUCENT (Noah, 2026-08-25: "everything is transparency
  there i need mines to be like that not all out there like this").

  Full-strength ramp values are right for a heatmap CELL, where the colour is
  the entire content of the cell and it is read against its neighbours. A rail
  beside a chart is not that: it sits in the reader's periphery while they
  watch the tape, and at full strength a column of solid gold and platinum
  blocks pulls the eye off the thing it is there to annotate. At 0.5 the ramp
  keeps its whole ordering — both poles, the gamma curve, the neutral floor —
  and stops competing with the candles.

  Nothing about contrast rides on this: the price and the tags sit in their
  own lanes on the bare surface, never over the bar.
*/
const BAR_ALPHA = 0.5;

/** Strikes print whole when they are whole — the rule every strike list uses. */
const fmtStrike = (v: number): string => (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));

/*
  The named levels that land ON a strike get a tag; the flip lands BETWEEN them
  far more often than not, so it is drawn as a rule instead.

  A ROW IS REGULARLY MORE THAN ONE THING, and returning only the first is a
  quiet lie. `buildLevelsFor` takes king as the heaviest strike anywhere and
  putWall as the heaviest below spot, so whenever the book's weight sits under
  the market they are THE SAME STRIKE by construction — not a coincidence, and
  not rare: measured across the watchlist just now it was 6 names out of 6.
  A single-tag version would have printed K on every one of those rows and
  dropped the wall, on the surface whose entire justification is that it agrees
  with the chart beside it.
*/
const tagsFor = (strike: number, levels: KeyLevels): { text: string; ink: string }[] => {
  const at = (v: number) => Math.abs(strike - v) < 1e-9;
  const out: { text: string; ink: string }[] = [];
  if (at(levels.king)) out.push({ text: 'K', ink: 'text-king' });
  if (at(levels.callWall)) out.push({ text: 'CW', ink: 'text-bull' });
  if (at(levels.putWall)) out.push({ text: 'PW', ink: 'text-bear' });
  return out;
};

type Item =
  | { kind: 'row'; row: GexLevel }
  | { kind: 'rule'; price: number; tone: 'spot' | 'flip' };

/*
  Rows and rules in ONE descending list.

  The rules are not rows — spot and the flip are prices, and they almost never
  equal a strike. Placing them by index (\"after the 4th row\") is the bug that
  writes itself: the chain re-windows on a tick and the marker stays put while
  the prices under it move. So each rule is inserted where its PRICE falls,
  every render, and a rule outside the window lands at the end it belongs to
  rather than vanishing.
*/
const interleave = (rows: GexLevel[], levels: KeyLevels): Item[] => {
  const rules = [
    { price: levels.spot, tone: 'spot' as const },
    { price: levels.flip, tone: 'flip' as const },
  ].sort((a, b) => b.price - a.price);

  const out: Item[] = [];
  let ri = 0;
  for (const row of rows) {
    while (ri < rules.length && rules[ri].price > row.strike) {
      out.push({ kind: 'rule', price: rules[ri].price, tone: rules[ri].tone });
      ri++;
    }
    out.push({ kind: 'row', row });
  }
  while (ri < rules.length) {
    out.push({ kind: 'rule', price: rules[ri].price, tone: rules[ri].tone });
    ri++;
  }
  return out;
};

const PaneLadder = ({
  ticker,
  rows,
  maxAbs,
  levels,
  focusPrice = null,
  onSelect,
  axisInset = 0,
}: PaneLadderProps) => {
  if (rows.length === 0) return null;
  const items = interleave(rows, levels);

  /*
    EVERY BAR LANE THE SAME WIDTH, and this is a correctness fix rather than a
    tidiness one.

    Letting the tag and the strike take their natural widths made the lane
    between them a different size on every row, so a bar's PIXEL length no
    longer tracked its value. Measured on the built page: the KING row — the
    heaviest strike in the book, and the one wearing two tags — drew a bar at
    55% of its row while a lighter neighbour with no tag drew 56%. Scanning
    the column for the longest bar found the wrong strike. That is the one
    thing this column exists to get right.

    So both outer lanes are reserved on every row, sized in `ch` off the widest
    content actually present. `ch` is exact in a monospace face, which is what
    this column is set in, so nothing is guessed and nothing truncates: a
    7-character index strike widens the lane for the whole rail instead of
    being clipped on its own row.
  */
  const tagLen = Math.max(0, ...rows.map(r => tagsFor(r.strike, levels).map(t => t.text).join('·').length));
  const priceLen = Math.max(...rows.map(r => fmtStrike(r.strike).length));

  return (
    <div
      className="shrink-0 w-[132px] flex flex-col min-h-0 border-l border-borderSubtle/70"
      aria-label={`${ticker} exposure by strike`}
    >
      <div className="shrink-0 flex items-baseline gap-1 px-2 py-1 border-b border-borderSubtle/70 select-none">
        <span className="font-mono text-[8px] font-semibold uppercase tracking-widest text-textMuted">Size</span>
        <span className="ml-auto font-mono text-[8px] font-semibold uppercase tracking-widest text-textMuted">Strike</span>
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">

        {items.map((item, i) => {
          if (item.kind === 'rule') return <Rule key={`r${i}`} ticker={ticker} price={item.price} tone={item.tone} />;

          const { row } = item;
          const rgb = heatRgb(row.value, maxAbs);
          const pct = heatMagnitude(row.value, maxAbs) * 100;
          const tags = tagsFor(row.strike, levels);
          const active = focusPrice != null && Math.abs(focusPrice - row.strike) < 1e-9;
          const named = tags.map(t => t.text).join('·');
          const label = `${fmtStrike(row.strike)}, ${fmtUsd(row.value)}${named ? ` — ${named}` : ''}`;

          const body = (
            <>
              <span
                className="shrink-0 flex items-center font-mono text-[7px] font-bold leading-none"
                style={{ width: `${tagLen}ch` }}
              >
                {tags.map((t, ti) => (
                  <span key={t.text} className={t.ink}>
                    {ti > 0 && <span className="text-textMuted">·</span>}
                    {t.text}
                  </span>
                ))}
              </span>
              {/* THE BAR HAS ITS OWN LANE, and that is a contrast fix, not a
                  layout preference. Drawn across the full row it ran under the
                  price, and the price is the one thing in this column that must
                  be readable: measured over the platinum pole the strike text
                  came out at 1.27:1, which is not text, it is texture. The
                  price and the tags now sit on the bare surface at 7.85:1 and
                  the bar takes whatever width is left — no fixed lane widths,
                  so a 7-character index strike shortens the bar instead of
                  truncating the number.

                  It grows from the chart's side, so it reads as size reaching
                  out of the tape rather than as a bar chart pinned to an axis.
                  The transition is on width ALONE — animating the colour too
                  made quiet rows strobe on every tick. */}
              <span className="relative flex-1 min-w-0 self-stretch my-px">
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 rounded-[2px] transition-[width] duration-700"
                  style={{ width: `${pct.toFixed(1)}%`, backgroundColor: `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${BAR_ALPHA})` }}
                />
              </span>
              <span
                className={`shrink-0 text-right font-mono text-[10px] font-semibold tnum ${
                  active ? 'text-select' : 'text-textSecondary'
                }`}
                style={{ width: `${priceLen}ch` }}
              >
                {fmtStrike(row.strike)}
              </span>
            </>
          );

          const cls = `flex-1 min-h-[13px] flex items-center gap-1 px-1.5 overflow-hidden ${
            active ? 'bg-select/10' : ''
          }`;

          /* A row is only a control when clicking it does something. Rendering
             a button either way would put a tab stop on all 21 rows of a
             column that cannot be actioned. */
          return onSelect ? (
            <button
              key={row.strike}
              type="button"
              onClick={() => onSelect(row.strike)}
              aria-pressed={active}
              aria-label={`Flash ${label} on the chart`}
              title={label}
              className={`${cls} text-left hover:bg-white/[0.05] transition-colors`}
            >
              {body}
            </button>
          ) : (
            <div key={row.strike} className={cls} title={label}>
              {body}
            </div>
          );
        })}
        {/* The chart's time axis, kept empty beside itself — see `axisInset`. */}
        {axisInset > 0 && <div className="shrink-0" style={{ height: axisInset }} aria-hidden />}
      </div>
    </div>
  );
};

/** Spot and the flip cut ACROSS the column — they are prices, not strikes. */
const Rule = ({ ticker, price, tone }: { ticker: string; price: number; tone: 'spot' | 'flip' }) => {
  const spot = tone === 'spot';
  return (
    <div
      className="shrink-0 relative h-[14px] flex items-center select-none"
      aria-label={`${ticker} ${spot ? 'spot' : 'gamma flip'} ${price.toFixed(2)}`}
    >
      <span
        aria-hidden
        className={`absolute inset-x-0 top-1/2 h-px ${spot ? 'bg-textPrimary/60' : 'bg-flip/60'}`}
        style={spot ? undefined : { backgroundImage: 'repeating-linear-gradient(to right,#7DD3FC 0 3px,transparent 3px 6px)' }}
      />
      <span
        className={`relative ml-auto mr-1 rounded-[2px] px-1 font-mono text-[8px] font-bold tnum leading-[10px] ${
          spot ? 'bg-textPrimary text-[#0a0a0a]' : 'bg-flip text-[#0a0a0a]'
        }`}
      >
        {price.toFixed(2)}
      </span>
    </div>
  );
};

export default PaneLadder;
