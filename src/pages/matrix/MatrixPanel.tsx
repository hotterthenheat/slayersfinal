import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import TickerQuickPick from '../../components/gex/TickerQuickPick';
import { LADDER_METRICS, spotChangePct } from '../../data/gex';
import type { LadderMetric } from '../../data/gex';
import {
  CALL_INK,
  DRIFT_METRICS,
  NET_NEG_INK,
  NET_POS_INK,
  PUT_INK,
  SHOCK,
  TAG_TITLES,
  TAG_WORDS,
  UNITS_NOTE,
  badgeWords,
  buildMatrix,
  cellMoney,
  crossWords,
  crossedTo,
  crownWord,
  metricLabel,
  metricName,
  metricUnit,
  netInk,
  type Drift,
  type Matrix,
  type MatrixRow,
} from '../../data/matrix';

/*
==================================================
  SLAYER TERMINAL - MATRIX PANEL
  Inventory & sensitivity by strike, one ticker.
==================================================

  The panel draws; `data/matrix.ts` decides. Nothing in this file computes an
  exposure, a share or a direction — it places rows, and every number on it
  came out of a function `npm test` can hold to account. That split is the
  reason Terrain's proven halves stopped breaking, and it is copied on purpose.

  ══ THE SHAPE ═════════════════════════════════════════════════════════════

  Strike down the left; ONE family across it in three columns — the put leg,
  the call leg, and what they leave behind. Under every figure a micro-bar,
  and at the end the book itself drawn from zero.

  ══ THE FAMILY IS THE PANEL'S, NOT THE DESK'S ═════════════════════════════

  The tabs are HERE, inside the panel, and that is the whole point of a board
  (Noah: "if i want spx vex on one and spx gex on one or spx dex xyz"). A
  desk-wide switch makes four panels four symbols of the same picture; a
  per-panel switch lets them be four PICTURES — the same symbol in gamma,
  delta and vega side by side, which is the comparison the board exists to
  make and the one a single tab bar at the top cannot express.

  THE SPOT RULE CUTS THE WHOLE TABLE. Every row above it is the resistance
  side and every row below it the support side, so the reader never holds the
  price in their head while reading a strike column.
*/

/** Row height. A figure and a bar in each cell — the leading is what keeps a
    column of money from reading as a block of digits. */
const ROW_H = 29;

const TAG_INK: Record<string, string> = {
  pin: '#EA00FF',
  callWall: '#30D158',
  putWall: '#FF3B30',
  flip: '#4F8CFF',
};

/*
  ══ THE TABLE IS DENSE, AND THE LAST COLUMN IS WHY ════════════════════════

  Strike, the family's three legs, and then whatever is left over.

  The legs were `1fr` and stretched to fill the panel, which put each figure a
  hundred and fifty pixels from the bar underneath it: the number sat at the
  cell's right edge, the bar grew from its left, and at that width they
  stopped reading as one mark. The reference is dense for exactly this reason
  — its columns are about ninety pixels and the bar is right under the digits
  it belongs to.

  So the legs are CAPPED and the slack goes to the end, which keeps a
  two-panel desk and a five-panel desk drawing the same table instead of the
  same table stretched. What sits in that slack is the profile — see
  `PROFILE_MIN_PX`.

  The net column is the widest of the three because it is the only one
  carrying a badge as well as a figure, and a `+$32.1M` beside a `$8.5M` in a
  ninety-pixel cell wrapped onto a second line and burst the row.

  The strike column is eighty because the PIN row is the widest one — the
  number, the tag and the star — and at seventy-four it clipped the star off
  the one row in the book a reader looks for first.
*/
const COLS = '80px minmax(84px, 116px) minmax(84px, 116px) minmax(104px, 150px) minmax(0, 1fr)';

/** What the three legs need before anything is left over. */
const TABLE_MIN_PX = 80 + 84 + 84 + 104;

/**
 * The slack a zero-anchored profile needs before it is worth drawing.
 *
 * ══ THE LAST COLUMN EARNS ITS WIDTH OR DOES NOT EXIST ═════════════════════
 *
 * On a five-panel board there is no room left and the column collapses to
 * nothing, which is right: the table is already the whole panel. On a one- or
 * two-panel board the same `1fr` was three hundred pixels of black, and dead
 * space that wide reads as a rendering fault rather than as restraint.
 *
 * So the profile appears when the leftover can hold a bar that means
 * something and is absent when it cannot. A twenty-pixel diverging bar is not
 * a smaller picture of the book; it is a smudge.
 */
const PROFILE_MIN_PX = 96;

/** Widths at which the book line can afford to say more. Measured from the
    PANEL, never the viewport — a breakpoint cannot know this is one of five. */
const W_FLIP = 400;
const W_CROWN = 500;
const W_TOP5 = 620;
const W_SUBTITLE = 620;
const W_UNITS = 760;

interface Props {
  /** Position on the board. It is the only thing that distinguishes two
      panels showing the same symbol, so it — not the ticker — keys the hooks
      a test drives the panel by. */
  index: number;
  ticker: string;
  /** This panel's family. Its own, not the desk's — see the note above. */
  metric: LadderMetric;
  focus: boolean;
  /** Null while this is the only panel — a × that would leave an empty desk
      is a trap. */
  onClose: (() => void) | null;
  onTicker: (next: string) => void;
  onMetric: (next: LadderMetric) => void;
  /** The desk's tick; a change means the book moved. */
  pulse: number;
  /** The desk holds one strike axis for the whole board — see its note on
      `link`. The panel hands up its scroller and reports what the reader did
      to it; it never reaches for another panel itself. */
  registerScroller: (index: number, el: HTMLElement | null) => void;
  onScroll: (index: number, top: number) => void;
}

export default function MatrixPanel({
  index,
  ticker,
  metric,
  focus,
  onClose,
  onTicker,
  onMetric,
  pulse,
  registerScroller,
  onScroll,
}: Props) {
  /* THE SCALES ARE HELD ACROSS TICKS, so they live outside the build — see
     `holdScale` for why a column that re-normalises every tick reads as a
     market that moved when only the divisor did. */
  const scalesRef = useRef<Partial<Record<LadderMetric, number>> | null>(null);
  const m: Matrix = useMemo(() => {
    const built = buildMatrix(ticker, [metric], { prevScales: scalesRef.current });
    scalesRef.current = built.scales;
    return built;
    // `pulse` is the dependency that matters — it is the desk's tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, metric, pulse]);

  /* A different symbol is a different book and a different family a different
     quantity; carrying a ruler across either would paint the first frame of
     the new one against the last frame of the old. */
  useEffect(() => {
    scalesRef.current = null;
  }, [ticker, metric]);

  /*
    WIDTH IN, CONTENT OUT. What the panel can hold is measured from the panel,
    never guessed from the viewport — a breakpoint cannot know that this is
    one of five panels sharing the window, and the same `xl:` that is roomy on
    a single book hides a subtitle that fits and shows one that does not.
  */
  const rootRef = useRef<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth(prev => (Math.abs(prev - w) < 1 ? prev : w));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const showProfile = width - TABLE_MIN_PX >= PROFILE_MIN_PX;

  /*
    ══ ONE CURSOR, TWO WAYS TO MOVE IT ═══════════════════════════════════════

    The readout used to be driven by `onMouseEnter` alone, which made the
    whole table unreachable without a pointer. The strike being read is one
    piece of state now, and the mouse and the arrow keys both set it — so
    keyboard and pointer cannot disagree about which row the foot is
    describing.
  */
  const [cursor, setCursor] = useState<number | null>(null);
  const cursorRow = cursor == null ? null : m.rows.find(r => r.strike === cursor) ?? null;
  const onRow = useCallback((strike: number) => setCursor(strike), []);

  const bodyRef = useRef<HTMLDivElement | null>(null);
  const attachBody = useCallback(
    (el: HTMLDivElement | null) => {
      bodyRef.current = el;
      registerScroller(index, el);
    },
    [index, registerScroller]
  );

  /*
    ══ SPOT IS CENTRED ONCE PER SYMBOL, NOT PER TICK AND NOT PER FAMILY ══════

    The table opens with the money in the middle and is then the reader's.
    Re-centring every tick would drag rows out from under a pointer trying to
    read one. Re-centring on a FAMILY change would undo the thing the
    per-panel tabs exist for: flipping SPY from gamma to delta is a question
    about the strikes already on screen, and throwing the reader back to spot
    answers a different one. A new SYMBOL is a different book, so that does
    re-centre.
  */
  const centred = useRef('');
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || m.rows.length === 0) return;
    if (centred.current === ticker) return;
    centred.current = ticker;
    const idx = m.rows.findIndex(r => r.strike <= m.spot);
    if (idx < 0) return;
    el.scrollTop = Math.max(0, idx * ROW_H - el.clientHeight / 2);
  }, [ticker, m.rows, m.spot]);

  /* Walking the book from the keyboard. The cursor starts at spot rather than
     at the top, because that is where a reader's attention already is. */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'];
      if (!keys.includes(e.key)) return;
      e.preventDefault();
      const rows = m.rows;
      if (rows.length === 0) return;
      const spotIdx = Math.max(0, rows.findIndex(r => r.strike <= m.spot));
      const at = cursor == null ? spotIdx : rows.findIndex(r => r.strike === cursor);
      const step = e.key === 'PageDown' ? 10 : e.key === 'PageUp' ? -10 : e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
      const next =
        e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1 : Math.min(rows.length - 1, Math.max(0, at + step));
      setCursor(rows[next].strike);
      const el = bodyRef.current;
      if (el) {
        const top = next * ROW_H;
        if (top < el.scrollTop) el.scrollTop = top;
        else if (top + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H - el.clientHeight;
      }
    },
    [cursor, m.rows, m.spot]
  );

  const change = spotChangePct(m.ticker);
  const up = change >= 0;
  const scale = m.scales[metric] ?? 1;
  const spotAfter = useMemo(() => m.rows.findIndex(r => r.strike <= m.spot), [m.rows, m.spot]);

  /* The star and the crown are the SAME strike, and neither of them works it
     out here: the engine's king is the extreme of the family on screen, so
     the row marking and the header line cannot come to different answers
     about which strike is the biggest. */
  const starStrike = m.king?.strike ?? null;

  return (
    <section
      ref={rootRef}
      data-matrix-panel={index}
      data-matrix-ticker={m.ticker}
      data-matrix-metric-of={metric}
      className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-borderSubtle bg-[#050505]"
      aria-label={`${m.ticker} ${metricName(metric)} by strike`}
    >
      {/* ── the title block ─────────────────────────────────────────────
          The reference wears its product name here; this wears the SYMBOL,
          because a board of these is five books at once and which one you
          are looking at has to be unmistakable. */}
      <header className="flex h-[30px] shrink-0 items-center gap-2.5 border-b border-borderSubtle px-3">
        <TickerQuickPick ticker={m.ticker} onPick={onTicker} slim title="Change this panel's symbol" />
        {width >= W_SUBTITLE && (
          <span className="truncate font-mono text-[9px] uppercase tracking-[0.2em] text-textMuted">
            inventory &amp; sensitivity by strike
          </span>
        )}
        <span className="ml-auto font-mono text-[12px] font-semibold tnum text-textPrimary">
          ${m.spot.toFixed(2)}
        </span>
        <span className={`font-mono text-[10px] font-semibold tnum ${up ? 'text-bull' : 'text-bear'}`}>
          {up ? '+' : ''}
          {change.toFixed(2)}%
        </span>
        {onClose && (
          <button
            data-matrix-close={index}
            onClick={onClose}
            title={`Close ${m.ticker}`}
            aria-label={`Close ${m.ticker}`}
            className="inline-flex h-4 w-4 items-center justify-center rounded text-textMuted transition-colors hover:bg-white/10 hover:text-bear"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </header>

      {/* ── this panel's family ─────────────────────────────────────────── */}
      <div className="flex h-[26px] shrink-0 items-center gap-2 border-b border-borderSubtle px-2">
        <div role="group" aria-label={`${m.ticker} exposure family`} className="inline-flex items-center gap-0.5">
          {LADDER_METRICS.map(spec => {
            const on = spec.key === metric;
            return (
              <button
                key={spec.key}
                data-matrix-metric={`${index}:${spec.key}`}
                aria-pressed={on}
                onClick={() => onMetric(spec.key)}
                title={`${spec.name}, per ${SHOCK[spec.key]} · ${spec.unit}`}
                className={`rounded px-2 py-[3px] font-mono text-[9px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                  on ? 'bg-borderMuted text-textPrimary' : 'text-textMuted hover:bg-white/[0.06] hover:text-textSecondary'
                }`}
              >
                {spec.label}
              </button>
            );
          })}
        </div>
        <Stamp at={m.builtAt} />
      </div>

      {/* ── what this book IS ───────────────────────────────────────────── */}
      <BookLine m={m} metric={metric} width={width} />

      {/* ── the two header rows: the family, then its three legs ────────── */}
      {/* The header rows are OUTSIDE the scroller so they stay put, which
          means they cannot be rows of the grid below. They are their own
          small grid, labelled as such, rather than a rowgroup orphaned from
          any table. */}
      <div className="shrink-0 border-b border-borderSubtle" role="grid" aria-label={`${metricLabel(metric)} columns`}>
        <div className="grid items-center" style={{ gridTemplateColumns: COLS }} role="row">
          <span
            role="columnheader"
            className="border-r border-borderSubtle px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-textMuted"
          >
            Strike
          </span>
          <span
            role="columnheader"
            aria-colspan={3}
            className="col-span-3 py-1.5 text-center font-mono text-[10px]"
            title={`${metricName(metric)} — ${metricUnit(metric)}`}
          >
            {/* THE SHOCK IS PRINTED, NOT ASSUMED. "$520.8M of gamma" is not a
                claim until it says per what, and every board this was measured
                against leaves it out. */}
            <span className="font-semibold uppercase tracking-[0.2em] text-textSecondary">{metricLabel(metric)}</span>
            <span className="text-textMuted"> · {SHOCK[metric]}</span>
          </span>
          {/* THE PROFILE STATES ITS RULER. A shape with no magnitude beside it
              is a decoration; the full half-width is this many dollars. */}
          <span
            role="columnheader"
            className="min-w-0 overflow-hidden whitespace-nowrap px-2 text-center font-mono text-[9px] uppercase tracking-[0.16em] text-textMuted"
          >
            {showProfile ? `the book · ±${cellMoney(scale)}` : ''}
          </span>
        </div>
        <div className="grid items-center" style={{ gridTemplateColumns: COLS }} role="row">
          <span className="h-full border-r border-borderSubtle" />
          {(['put', 'call', 'net'] as const).map(leg => (
            <span
              key={leg}
              role="columnheader"
              className="px-3 pb-1.5 text-right font-mono text-[9px] uppercase tracking-[0.18em] text-textMuted"
            >
              {leg}
            </span>
          ))}
          {/* The profile's own axis legend. A diverging bar with no stated
              sides is a decoration; with them it is a reading. */}
          <span className="grid min-w-0 grid-cols-2 gap-2 overflow-hidden whitespace-nowrap px-2 pb-1.5 font-mono text-[8px] uppercase tracking-[0.14em] text-textMuted">
            {showProfile && (
              <>
                <span className="text-right" style={{ color: NET_NEG_INK }}>
                  call ◄
                </span>
                <span style={{ color: NET_POS_INK }}>► put</span>
              </>
            )}
          </span>
        </div>
      </div>

      {/* ── the book ──────────────────────────────────────────────────────
          A grid, declared as one: sixty-one rows of divs told a screen reader
          nothing at all, and the only `role` in this file was on the tab
          group. */}
      <div
        ref={attachBody}
        data-matrix-body={index}
        role="grid"
        aria-rowcount={m.rows.length}
        aria-label={`${m.ticker} ${metricName(metric)} by strike`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onScroll={e => onScroll(index, e.currentTarget.scrollTop)}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none focus-visible:ring-1 focus-visible:ring-select/40"
        onMouseLeave={() => setCursor(null)}
      >
        <WindowEdge strikes={m.window.strikes} side="above" />
        {m.rows.map((r, i) => (
          /* A keyed Fragment, not a wrapper div. The div was sixty-one
             throwaway nodes per panel — three hundred on a full board —
             existing only to host the conditional spot rule. */
          <Fragment key={r.strike}>
            {i === spotAfter && <SpotRule ticker={m.ticker} spot={m.spot} />}
            <Row
              row={r}
              index={i}
              metric={metric}
              scale={scale}
              focus={focus}
              star={r.strike === starStrike}
              active={cursor === r.strike}
              profile={showProfile}
              onHover={onRow}
            />
          </Fragment>
        ))}
        {spotAfter < 0 && m.rows.length > 0 && <SpotRule ticker={m.ticker} spot={m.spot} />}
        <WindowEdge strikes={m.window.strikes} side="below" />
      </div>

      {/* ── the foot: what a full bar means, or the strike under the cursor
          ONE SLOT, SHARED. A readout that appeared as a new row would push
          the table down the instant the pointer crossed onto it — chrome
          moving under the cursor that caused it, which is the fault Terrain's
          readout row was built to avoid. */}
      <div
        className="h-[24px] shrink-0 border-t border-borderSubtle px-3"
        data-matrix-foot={index}
        aria-live="polite"
      >
        {cursorRow ? (
          <HoverRead row={cursorRow} metric={metric} total={m.totals[metric] ?? 0} />
        ) : (
          <ScaleRead m={m} metric={metric} width={width} />
        )}
      </div>
    </section>
  );
}

/** A share, with a floor that says "small" rather than "none". 0.0% against a
    figure of −$76.0K reads as a bug in the table; `<0.1%` reads as the truth. */
function sharePct(share: number): string {
  if (share <= 0) return '0.0%';
  return share < 0.001 ? '<0.1%' : `${(share * 100).toFixed(1)}%`;
}

/**
 * When this reading was taken.
 *
 * A board left open on a second monitor shows a stale panel and a live one
 * identically. Nothing on the page said what time it was — the clock windows
 * are all relative ("5m"), which is a duration and not an instant.
 */
function Stamp({ at }: { at: number }) {
  const d = new Date(at);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return (
    <span
      data-matrix-stamp
      title="When this reading was taken"
      className="ml-auto font-mono text-[9px] tnum text-textMuted"
    >
      {hh}:{mm}:{ss}
    </span>
  );
}

/**
 * The one line that says which side the whole book is on.
 *
 * ══ SIXTY-ONE EXACT ROWS AND NO ANSWER ════════════════════════════════════
 *
 * Every strike was right and the panel could not say whether the book was net
 * put-dominant or net call-dominant — the number every competing board leads
 * with. `totals` is Σ|net|, a magnitude sum, so the signed total did not exist
 * anywhere on the page.
 *
 * The regime word is GAMMA'S ALONE. Positive net gamma is put-dominant, which
 * is dealers short gamma, which is a market that amplifies its own moves —
 * that chain of meaning does not exist for vega or charm, and printing
 * "amplifying" beside a delta total would be a sentence that sounds like
 * analysis and is not.
 */
function BookLine({ m, metric, width }: { m: Matrix; metric: LadderMetric; width: number }) {
  const book = m.books[metric];
  if (!book) return null;
  const side = book.net >= 0 ? 'put-dominant' : 'call-dominant';
  const regime = DRIFT_METRICS.has(metric) ? (book.net >= 0 ? 'amplifying' : 'damping') : null;
  return (
    <div
      data-matrix-book={m.ticker}
      className="flex h-[22px] shrink-0 items-center gap-2 overflow-hidden whitespace-nowrap border-b border-borderSubtle px-3 font-mono text-[9px]"
    >
      <span className="uppercase tracking-[0.16em] text-textMuted">net</span>
      <span className="font-semibold tnum" style={{ color: netInk(book.net) }}>
        {cellMoney(book.net)}
      </span>
      <span className="text-textSecondary">{side}</span>
      {regime && (
        <span
          className="text-textMuted"
          title="Positive net gamma is put-dominant — dealers short gamma, a tape that amplifies its own moves"
        >
          · {regime}
        </span>
      )}

      {width >= W_FLIP && (
        <span className="flex items-baseline gap-1">
          <span className="uppercase tracking-[0.16em]" style={{ color: TAG_INK.flip }}>
            flip
          </span>
          {book.flip != null ? (
            <>
              <span className="tnum text-textSecondary">{book.flip}</span>
              {book.flipDistance != null && (
                <span className="tnum text-textMuted">
                  {book.flipDistance >= 0 ? '↓' : '↑'}
                  {Math.abs(book.flipDistance).toFixed(1)}
                </span>
              )}
            </>
          ) : (
            /* A window with no crossing has no flip. Printing one anyway
               would be inventing the single most actionable level on the
               page. */
            <span className="text-textMuted">none in window</span>
          )}
        </span>
      )}

      {width >= W_CROWN && m.king && (
        <span data-matrix-king className="ml-auto flex items-baseline gap-1.5">
          <span className="uppercase tracking-[0.16em]" style={{ color: TAG_INK.pin }}>
            {crownWord(book.top1)}
          </span>
          <span className="tnum text-textSecondary">{m.king.strike}</span>
          <span className="tnum text-textPrimary">{sharePct(m.king.share)}</span>
          {DRIFT_METRICS.has(metric) && (
            <span
              aria-hidden
              className={m.king.dir > 0 ? 'text-bull' : m.king.dir < 0 ? 'text-bear' : 'text-textMuted'}
            >
              {m.king.dir > 0 ? '↑' : m.king.dir < 0 ? '↓' : '·'}
            </span>
          )}
          {width >= W_TOP5 && (
            <span className="tnum text-textMuted" title="What the five heaviest strikes hold between them">
              top5 {(book.top5 * 100).toFixed(0)}%
            </span>
          )}
        </span>
      )}
    </div>
  );
}

/**
 * The edge of the chain, named as an edge.
 *
 * The table presented as the complete book — "every strike, including the
 * empty ones" — which is true of everything inside the window and silent
 * about the window existing. A reader scrolling to the last row could not
 * tell "the book ends here" from "our chain does".
 */
function WindowEdge({ strikes, side }: { strikes: number; side: 'above' | 'below' }) {
  return (
    /* A `role="grid"` may only contain rows, and this sat inside one as a
       bare div — so did the spot rule. Both are rows carrying one wide cell,
       which is what they are visually as well. */
    <div
      data-matrix-edge={side}
      role="row"
      className="flex h-[18px] items-center gap-2 px-3 font-mono text-[8px] uppercase tracking-[0.14em] text-textMuted/70"
    >
      <span aria-hidden className="h-px flex-1 bg-borderSubtle" />
      <span role="gridcell" className="truncate">
        chain window · {strikes} strikes around spot
      </span>
      <span aria-hidden className="h-px flex-1 bg-borderSubtle" />
    </div>
  );
}

/* ── the price, drawn through the whole table ────────────────────────────── */

function SpotRule({ ticker, spot }: { ticker: string; spot: number }) {
  return (
    <div data-matrix-spot role="row" className="flex h-[20px] items-center gap-1.5 px-3">
      <span aria-hidden className="h-px flex-1 bg-white/35" />
      <span role="gridcell" className="flex items-center gap-1.5" aria-label={`spot ${spot.toFixed(2)}`}>
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-textMuted">{ticker}</span>
        <span className="rounded-[2px] bg-white px-1.5 font-mono text-[10px] font-bold tnum leading-[15px] text-[#0a0a0a]">
          {spot.toFixed(2)}
        </span>
      </span>
    </div>
  );
}

/* ── one strike ──────────────────────────────────────────────────────────── */

function Row({
  row,
  index,
  metric,
  scale,
  focus,
  star,
  active,
  profile,
  onHover,
}: {
  row: MatrixRow;
  index: number;
  metric: LadderMetric;
  scale: number;
  focus: boolean;
  star: boolean;
  active: boolean;
  profile: boolean;
  onHover: (strike: number) => void;
}) {
  const dim = focus && !row.meaningful;
  const tag = row.tags[0];
  const c = row.cells[metric];
  /* The badge is gamma's. The other four families are computed live from the
     chain and no history of them is kept, so a badge there would look
     measured and not be — see DRIFT_METRICS. */
  const d = DRIFT_METRICS.has(metric) ? row.drift?.m5 ?? null : null;
  return (
    <div
      data-matrix-row={row.strike}
      data-meaningful={row.meaningful ? 'true' : 'false'}
      role="row"
      aria-rowindex={index + 1}
      /* "net $0.0" is what a zero row read as, which is a figure rather than
         a fact. A screen reader gets the word. */
      aria-label={`${row.strike}${tag ? ` ${TAG_TITLES[tag]}` : ''}, net ${c?.net ? cellMoney(c.net) : 'zero'}`}
      onMouseEnter={() => onHover(row.strike)}
      style={{ gridTemplateColumns: COLS, height: ROW_H, opacity: dim ? 0.28 : 1 }}
      className={`grid items-center transition-opacity ${
        active ? 'bg-white/[0.07]' : tag === 'pin' ? 'bg-white/[0.04]' : ''
      }`}
    >
      <span
        role="rowheader"
        className="flex h-full items-center gap-1 overflow-hidden border-r border-borderSubtle px-3 font-mono text-[10px] tnum text-textMuted"
      >
        {row.strike}
        {tag && (
          <span
            title={TAG_TITLES[tag]}
            className="text-[8px] font-bold uppercase tracking-[0.1em]"
            style={{ color: TAG_INK[tag] }}
          >
            {TAG_WORDS[tag]}
          </span>
        )}
        {/* The extreme, marked the way the reference marks it — one star per
            panel, on whatever the family on screen says is biggest. */}
        {star && (
          <span title="The largest reading in this book" className="text-[9px] leading-none text-textPrimary">
            ★
          </span>
        )}
      </span>
      <Cell v={c?.put ?? 0} scale={scale} ink={PUT_INK} />
      <Cell v={c?.call ?? 0} scale={scale} ink={CALL_INK} />
      <Cell v={c?.net ?? 0} scale={scale} ink={netInk(c?.net ?? 0)} strong drift={d} />
      <Profile v={c?.net ?? 0} scale={scale} show={profile} />
    </div>
  );
}

/**
 * One figure, and the bar under it.
 *
 * ══ THE BAR BELONGS TO THE NUMBER ABOVE IT ════════════════════════════════
 *
 * The bar grew from the cell's LEFT edge while the figure was right aligned,
 * which put them a hundred pixels apart in a 116px cell — two marks where
 * there should be one, and the very fault the note on `COLS` describes the
 * column widths as existing to prevent. Both are anchored right now: the
 * digits and the bar under them are one object, and the bars still line up
 * across a row because every cell's right edge does.
 *
 * A nonzero reading always draws at least a pixel. Sub-pixel bars rounded to
 * nothing, so a whole stretch of small strikes had an empty bar lane that
 * read as "no data" rather than as "small" — and telling those two apart is
 * the entire reason the empty strikes are in the table.
 *
 * Nothing in the cell may WRAP. The row's height is fixed, so a badge and a
 * figure that together outran the cell did not make the row taller — they
 * spilled over the row below it.
 */
function Cell({
  v,
  scale,
  ink,
  strong = false,
  drift = null,
}: {
  v: number;
  scale: number;
  ink: string;
  strong?: boolean;
  drift?: Drift | null;
}) {
  const t = scale > 0 ? Math.min(1, Math.abs(v) / scale) : 0;
  const crossed = drift?.crossed ?? false;
  const words = drift ? (crossed ? crossWords(drift) : badgeWords(drift)) : null;
  /* A crossing takes the ink of the side it landed ON, because the event is
     which side it is now — not whether it got heavier on the way. */
  const badgeBg = crossed
    ? crossedTo(drift as Drift) === 'put'
      ? NET_POS_INK
      : NET_NEG_INK
    : (drift?.dir ?? 0) > 0
      ? 'rgba(48,209,88,0.85)'
      : (drift?.dir ?? 0) < 0
        ? 'rgba(255,59,48,0.85)'
        : 'rgba(130,130,130,0.7)';
  return (
    <span role="gridcell" className="flex h-full min-w-0 flex-col justify-center overflow-hidden px-3">
      <span className="flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap leading-none">
        {words && (
          <span
            data-matrix-badge={crossed ? 'cross' : 'move'}
            title={
              crossed
                ? 'This strike changed side in the last five minutes'
                : drift?.pct == null
                  ? UNITS_NOTE
                  : 'Change in weight over the last five minutes'
            }
            className={`shrink-0 rounded-[2px] px-1 text-[8px] font-bold leading-[12px] ${
              crossed ? 'ring-1 ring-white/70' : ''
            }`}
            style={{ background: badgeBg, color: '#0a0a0a' }}
          >
            {words}
          </span>
        )}
        <span
          className={`shrink-0 font-mono text-[11px] tnum ${
            strong ? 'font-semibold text-textPrimary' : 'text-textSecondary'
          }`}
        >
          {cellMoney(v)}
        </span>
      </span>
      <span aria-hidden className="mt-[5px] flex h-[2px] w-full justify-end">
        <span
          className="block h-full rounded-full"
          style={{
            width: t > 0 ? `max(1px, ${(t * 100).toFixed(2)}%)` : '0px',
            background: ink,
            opacity: strong ? 1 : 0.85,
          }}
        />
      </span>
    </span>
  );
}

/**
 * The book itself, anchored at zero.
 *
 * ══ THE ONE PICTURE THE THREE COLUMNS CANNOT DRAW ═════════════════════════
 *
 * Every micro-bar in the table is anchored to its own cell, which makes a
 * column scannable and says nothing about SIDE — a long amber bar and a long
 * violet bar are the same length and opposite facts. This column is the other
 * arrangement: one centre line for the whole panel, put-dominant growing
 * right and call-dominant growing left, on the same ruler as everything else.
 *
 * Read down it and the shape of the book is there without reading a digit:
 * where the weight sits relative to spot, and where it changes sides.
 *
 * It is drawn only when the leftover width can hold it — see
 * `PROFILE_MIN_PX`. On a five-panel board the column is zero wide and this
 * renders an empty span, which is the correct amount of picture for the room
 * available.
 */
function Profile({ v, scale, show }: { v: number; scale: number; show: boolean }) {
  if (!show) return <span />;
  const t = scale > 0 ? Math.min(1, Math.abs(v) / scale) : 0;
  const pos = v >= 0;
  return (
    <span
      data-matrix-profile
      role="gridcell"
      className="relative flex h-full min-w-0 items-center overflow-hidden px-2"
    >
      <span aria-hidden className="absolute inset-y-[5px] left-1/2 w-px bg-white/12" />
      <span aria-hidden className="relative block h-[9px] w-full">
        <span
          data-matrix-bar
          className="absolute top-0 h-full rounded-[1px]"
          style={{
            width: t > 0 ? `max(1px, ${(t * 50).toFixed(2)}%)` : '0px',
            background: pos ? NET_POS_INK : NET_NEG_INK,
            opacity: 0.92,
            ...(pos ? { left: '50%' } : { right: '50%' }),
          }}
        />
      </span>
    </span>
  );
}

/* ── the foot, in its two states ─────────────────────────────────────────── */

function ScaleRead({ m, metric, width }: { m: Matrix; metric: LadderMetric; width: number }) {
  /* The hint names what a hover will actually give. On gamma that is the
     clock; on the other four there is no stored history to clock, and
     promising one would be a lie the reader discovers by hovering. */
  const hint = DRIFT_METRICS.has(metric) ? 'hover one for its clock' : 'hover one for its share of the book';
  return (
    <div className="flex h-full items-center gap-3 font-mono text-[9px]">
      <span className="uppercase tracking-[0.16em] text-textMuted">full bar</span>
      <span className="tnum text-textPrimary">{cellMoney(m.scales[metric] ?? 0)}</span>
      <span className="truncate text-textMuted">per {SHOCK[metric]}</span>
      {/* WHY THE UNITS CHANGE. A badge dropping from `+312%` to `+$25.4M` had
          nothing on the surface explaining why its neighbours now spoke a
          different language. */}
      {width >= W_UNITS && DRIFT_METRICS.has(metric) && (
        <span className="truncate text-textMuted/70">· {UNITS_NOTE}</span>
      )}
      <span className="ml-auto shrink-0 truncate tnum text-textMuted">
        {m.meaningfulCount}/{m.rows.length} strikes carry something · {hint}
      </span>
    </div>
  );
}

/**
 * The strike under the cursor, and its CLOCK.
 *
 * What a row cannot say on its own: how it got here. One badge is a single
 * window; this is the same reading over four of them, so a level that has
 * been filling all session reads differently from one that jumped in the
 * last minute even though both print the same +40% on the row.
 *
 * It speaks for GAMMA and says so. The other four families are computed from
 * the live chain with no history kept, and a clock invented for them would
 * be the worst kind of number on this desk: one that looks measured and is
 * not. See DRIFT_METRICS.
 */
function HoverRead({ row, metric, total }: { row: MatrixRow; metric: LadderMetric; total: number }) {
  const win = (label: string, d: Drift | null) => (
    <span key={label} className="flex items-baseline gap-0.5">
      <span className="text-[8px] uppercase text-textMuted">{label}</span>
      <span
        className={`text-[9px] tnum ${
          d == null ? 'text-textMuted' : d.crossed ? 'text-textPrimary' : d.dir > 0 ? 'text-bull' : d.dir < 0 ? 'text-bear' : 'text-textSecondary'
        }`}
      >
        {d == null ? '—' : d.crossed ? crossWords(d) : badgeWords(d) ?? 'flat'}
      </span>
    </span>
  );
  const c = row.cells[metric];
  /* SHARE IS OF THE WHOLE BOOK, not of the biggest strike. The denominator is
     the engine's Σ|net| for this family — the panel holds no arithmetic of
     its own, which is the rule that kept Terrain's halves from drifting. */
  const share = total > 0 ? Math.abs(c?.net ?? 0) / total : 0;
  return (
    <div className="flex h-full items-center gap-2.5 overflow-hidden whitespace-nowrap font-mono">
      <span className="text-[10px] font-semibold tnum text-textPrimary">{row.strike}</span>
      {row.tags.map(t => (
        <span
          key={t}
          title={TAG_TITLES[t]}
          className="text-[8px] font-bold uppercase tracking-wider"
          style={{ color: TAG_INK[t] }}
        >
          {TAG_WORDS[t]}
        </span>
      ))}
      <span className="flex items-baseline gap-1">
        <span className="text-[8px] uppercase tracking-wider text-textMuted">put</span>
        <span className="text-[9px] tnum" style={{ color: PUT_INK }}>
          {cellMoney(c?.put ?? 0)}
        </span>
      </span>
      <span className="flex items-baseline gap-1">
        <span className="text-[8px] uppercase tracking-wider text-textMuted">call</span>
        <span className="text-[9px] tnum" style={{ color: CALL_INK }}>
          {cellMoney(c?.call ?? 0)}
        </span>
      </span>
      <span className="flex items-baseline gap-1">
        <span className="text-[8px] uppercase tracking-wider text-textMuted">share</span>
        <span className="text-[9px] tnum text-textSecondary">{sharePct(share)}</span>
      </span>
      {row.drift ? (
        <span className="ml-auto flex items-center gap-1.5">
          <span className="text-[8px] uppercase tracking-wider text-textMuted">gex</span>
          {win('1m', row.drift.m1)}
          {win('5m', row.drift.m5)}
          {win('15m', row.drift.m15)}
          {win('30m', row.drift.m30)}
        </span>
      ) : (
        <span className="ml-auto text-[9px] text-textMuted">no stored history for {metricLabel(metric)}</span>
      )}
    </div>
  );
}
