import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import TickerQuickPick from '../../../components/gex/TickerQuickPick';
import { LADDER_METRICS, spotChangePct } from '../../../data/gex';
import { EXPIRIES, expiryOf, type ExpiryKey } from '../../../data/expiry';
import { ROLE_WORDS, type Role, type WindowKey } from '../../../data/pinpoint/board';
import { buildVolRegime } from '../../../data/volRegime';
import { densityFor } from './density';
import { Loaded, Overlay, StrikeCard } from './Regions';
import { ROLE_INK } from './ink';
import type { LadderMetric } from '../../../data/gex';
import {
  CALL_INK,
  DRIFT_METRICS,
  NET_NEG_INK,
  NET_POS_INK,
  PUT_INK,
  SHOCK,
  TAG_INK,
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
} from '../../../data/pinpoint/matrix';

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
 * What the three legs want when they are not being squeezed.
 *
 * ══ THE PROFILE MUST NOT TAKE ROOM THE FIGURES STILL NEED ═════════════════
 *
 * The gate measured leftover against the columns' MINIMUM, and a `1fr`
 * profile takes free space before a capped column can grow into it. So at
 * 470px the profile appeared, the net column stayed at its 104px floor, and
 * a `+$117%` badge beside a `-$208.8M` figure — 132px of content — was
 * quietly cut inside its own cell. Sixty-one rows of it, on four panels.
 *
 * The leftover a picture may have is what remains once the NUMBERS have what
 * they want. Figures before decoration, and the arithmetic says so.
 */
const TABLE_MAX_PX = 80 + 116 + 116 + 150;

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
const W_EXPIRY = 640;
const W_FLIP = 400;
const W_CROWN = 500;
const W_TOP5 = 620;
const W_COUNT = 430;

/**
 * Where the panel can afford to state the conditions it is read under.
 *
 * ══ THE VOL LINE CAME DOWN WITH THE STRIP ═════════════════════════════════
 *
 * ATM implied and its premium over realized rode the section's conditions
 * row, which does not draw on a desk that holds its own symbols — see
 * `ownSymbols` in subnav.ts. A page-wide vol figure on a board of five books
 * could only ever be right about one of them anyway, so it moved rather than
 * went: every panel states the vol ITS symbol is trading at.
 *
 * Last in the book line and gated highest, because it is a condition rather
 * than a reading of this book — the net, the flip and the king answer first.
 */
const W_VOL = 700;
const W_HINT = 560;
const W_UNITS = 820;

/**
 * Below this, only the net keeps its bar.
 *
 * ══ AT PANEL WIDTH A MICRO-BAR READS AS AN UNDERLINE ══════════════════════
 *
 * A 2px coloured line directly beneath a right-aligned number at 377px does
 * not look like a magnitude; it looks like a text underline, or a link. Three
 * of them per row looks like three underlined numbers. They work at 950px and
 * stop working at 377px, and no amount of colour fixes that — it is the
 * proportion of the mark to the cell that misreads.
 *
 * So on a crowded board the row keeps ONE bar, under the answer, where it is
 * unambiguous because nothing above it is underlined.
 */
/*
  ══ THE BARS ARE THE ONE THING THAT NEVER GOES ════════════════════════════

  This was 520, and the measurement is what retired it: on a three-panel
  board at 1440 the panels come out at 469px, which is under the profile
  lane's floor as well, so every picture on the page went at once and three
  panels of pure digits was what a reader got at the density the board exists
  for.

  A leg bar costs NO horizontal room. It is a 3px rule drawn `w-full
  justify-end` INSIDE a cell the figure already occupies, so it cannot push a
  column or overflow one — the gate was about whether it read as a bar rather
  than about whether it fit. It reads as one at 84px: 3px tall with rounded
  ends, separated from the digits by four, which is not the shape of a text
  underline at any width.

  So the picture survives to the narrowest panel the board can make, and the
  zero-anchored PROFILE lane — which does cost width — is the thing that goes
  when there is no room. See `PROFILE_MIN_PX`.
*/
const W_LEG_BARS = 0;

/** An upper bound on one character of the lane's 8px bold uppercase, with
    `tracking-wider` included — see the note in `Profile`. */
export const INK_PER_CHAR = 7;

/** The lane's own padding at the edge the mark sits against. */
export const MARK_PAD = 8;

/**
 * Whether a lane this wide can name this role beside its bar.
 *
 * ══ ONE WORD NOW, NOT TWO ═════════════════════════════════════════════════
 *
 * It fitted a grade chip and, where there was room, a role word beside it.
 * The grade is gone — see the note in `data/pinpoint/board.ts` — so the
 * question is simply whether PUT WALL, the longest of the five, fits the
 * half its bar is not in.
 *
 * Exported so `pinpoint-board-proof.ts` can hold the arithmetic without a
 * browser: whatever this says is drawable has to fit the half.
 */
export function markFor(laneW: number, role: Role): boolean {
  if (!role) return false;
  return laneW / 2 - MARK_PAD >= ROLE_WORDS[role].length * INK_PER_CHAR;
}

interface Props {
  /** Position on the board. It is the only thing that distinguishes two
      panels showing the same symbol, so it — not the ticker — keys the hooks
      a test drives the panel by. */
  index: number;
  ticker: string;
  /** This panel's family. Its own, not the desk's — see the note above. */
  metric: LadderMetric;
  /*
    ══ WHICH CONTRACTS, AND OVER WHAT STRETCH ════════════════════════════════

    Two controls, two questions, and the terminal used to answer both without
    asking either: every exposure it drew was a 0DTE reading measured over
    five minutes, and nothing on any screen said so. `expiry` is which
    contracts the book is; `lookback` is how far back a change is measured.
    Conflating them is why the old surface could not ask "what is building"
    without also changing which book it was looking at.
  */
  expiry: ExpiryKey;
  customDte: number;
  lookback: WindowKey;
  onExpiry: (next: ExpiryKey) => void;
  onLookback: (next: WindowKey) => void;
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

export default function BoardPanel({
  index,
  ticker,
  metric,
  expiry,
  customDte,
  lookback,
  onExpiry,
  onLookback,
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
    /* THE CARD ASKS FOR DELTA AND VEGA. A gex-only build left both at zero
       in the one place a reader looks to understand a strike, and a figure
       that is always zero is worse than an absent one. The leading family is
       still `metric` — it is what every score, tag and crown is about. */
    const fams: LadderMetric[] = metric === 'dex' || metric === 'vex'
      ? [metric, ...(['dex', 'vex'] as LadderMetric[]).filter(f => f !== metric)]
      : [metric, 'dex', 'vex'];
    const built = buildMatrix(ticker, fams, {
      prevScales: scalesRef.current,
      expiry,
      customDte,
      lookback,
    });
    scalesRef.current = built.scales;
    return built;
    // `pulse` is the dependency that matters — it is the desk's tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, metric, expiry, customDte, lookback, pulse]);

  /* A different symbol is a different book and a different family a different
     quantity; carrying a ruler across either would paint the first frame of
     the new one against the last frame of the old. */
  useEffect(() => {
    scalesRef.current = null;
  }, [ticker, metric, expiry]);

  /*
    WIDTH IN, CONTENT OUT. What the panel can hold is measured from the panel,
    never guessed from the viewport — a breakpoint cannot know that this is
    one of five panels sharing the window, and the same `xl:` that is roomy on
    a single book hides a subtitle that fits and shows one that does not.
  */
  const rootRef = useRef<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      setWidth(prev => (Math.abs(prev - r.width) < 1 ? prev : r.width));
      setHeight(prev => (Math.abs(prev - r.height) < 1 ? prev : r.height));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  /* The measured density the shared regions are drawn at — one definition of
     what this panel can hold, used by the overlay, the loaded list and the
     card alike. */
  const dens = useMemo(() => densityFor(width, height), [width, height]);
  /*
    ══ THE PROFILE IS MEASURED AGAINST WHAT THE TABLE ACTUALLY HAS ═════════

    This asked the PANEL for its width while the rail was already holding two
    hundred pixels of it, so at 708px — two panels on a 1440, the commonest
    board there is — the gate saw 246px of slack, drew the lane, and the lane
    came out eighteen wide with its contents cut by sixty-six.

    A column decides whether it fits from the room LEFT, not from the room
    the panel started with.
  */
  const tableW = width - dens.railW;
  const showProfile = tableW - TABLE_MAX_PX >= PROFILE_MIN_PX;
  /* The lane is the grid's `1fr`, and `1fr` takes what is left once the
     capped columns have grown — so when the lane is drawn at all, this is
     exactly how wide it is. Measured against the render: 574 of table less
     462 of columns is the 112px the browser reports. */
  const laneW = showProfile ? Math.max(0, tableW - TABLE_MAX_PX) : 0;
  const showLegBars = width >= W_LEG_BARS;
  const bandDens = useMemo(
    () => ({ ...dens, overlay: (width >= 520 ? 'row' : 'mini') as 'row' | 'mini' }),
    [dens, width]
  );

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
    /*
      ══ DO NOT CENTRE IN A BOX THAT IS NOT THERE YET ═══════════════════════

      This ran once, marked itself done, and then never ran again — so it had
      to be right the first time, and for one render it was not. The desk now
      MEASURES its own height rather than counting the chrome above it, which
      means the first paint has no height on the desk at all: the body is
      unconstrained, its clientHeight is the full 1,825px of book, and
      `idx * ROW_H − clientHeight / 2` comes out negative. Clamped to zero,
      marked centred, and every panel opened at the top of its chain with
      spot thirty rows below the fold.

      A scroller that cannot scroll has nothing to centre. Waiting for the
      box to be smaller than its content is the same condition stated
      honestly, and it costs one extra pass.
    */
    if (el.scrollHeight <= el.clientHeight) return;
    centred.current = ticker;
    const idx = m.rows.findIndex(r => r.strike <= m.spot);
    if (idx < 0) return;
    el.scrollTop = Math.max(0, idx * ROW_H - el.clientHeight / 2);
    /* `height` is the panel's measured box — see the ResizeObserver above.
       It is in the list because the box settling is the event this is
       waiting for, not because the centring reads it. */
  }, [ticker, m.rows, m.spot, height]);

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
  /* One lookup per row rather than a scan of the shortlist per row. */
  const loadedSet = useMemo(() => new Set(m.loaded.map(r => r.strike)), [m.loaded]);
  const spotAfter = useMemo(() => m.rows.findIndex(r => r.strike <= m.spot), [m.rows, m.spot]);

  /* The star and the crown are the SAME strike, and neither of them works it
     out here: the engine's king is the extreme of the family on screen, so
     the row marking and the header line cannot come to different answers
     about which strike is the biggest. */
  const starStrike = m.king?.strike ?? null;

  /* Whether the units sentence in the foot is about anything on this panel —
     see `ScaleRead`. A dollar badge is one whose base was too small to divide
     by, or whose answer ran past the cap. */
  const dollarBadges = useMemo(
    () =>
      DRIFT_METRICS.has(metric) &&
      m.rows.some(r => {
        const d = r.drift?.m5;
        return !!d && d.material && !d.crossed && d.pct == null;
      }),
    [m.rows, metric]
  );

  return (
    <section
      ref={rootRef}
      data-matrix-panel={index}
      data-matrix-ticker={m.ticker}
      data-matrix-metric-of={metric}
      className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-borderSubtle bg-[#050505]"
      aria-label={`${m.ticker} ${metricName(metric)} by strike`}
    >
      {/*
        ══ THREE BANDS, NOT FIVE ═════════════════════════════════════════

        It was header, tabs, book line, `GEX · 1% move`, `PUT CALL NET` —
        five hairline-separated strips in five different alignments, about
        122px of chrome before a single strike, and two of them saying the
        same thing: the lit tab already reads GEX and the band 25px below it
        read GEX again. On a five-panel board that was an eighth of every
        panel spent on its own furniture.

        Now each band has one job. WHO this is and what it can be; WHAT the
        book is; and what the COLUMNS are. The shock keeps its promise of
        being printed rather than assumed — it is in the foot, beside the
        ruler it qualifies, which is where a normalisation belongs.
      */}

      {/* ── who this is, and what it can be ─────────────────────────────

          ══ IDENTITY IS LIT; SETUP IS QUIET UNTIL REACHED FOR ═════════════

          Terrain's grading, and its reasoning holds here unchanged: WHAT AM
          I LOOKING AT is a question a reader has while their eyes are on the
          book and their cursor is somewhere else, so the symbol stays at
          full strength — on a five-panel board, dimming it would mean five
          tables you cannot tell apart without waving at each one. HOW IS IT
          SET UP is a question you only have while reaching for a control, so
          the families and the expiries rest at seventy per cent and come up
          when the cursor or the keyboard arrives.

          OPACITY, NEVER REMOVAL. Terrain can hide a toolbar outright because
          what it uncovers is more chart. Hiding these would leave a table
          with no visible statement of which family and which expiry it is
          drawn at, which is the exact fault the expiry control was built to
          fix. Quiet is the whole of the idea; gone is a different one.

          `focus-within` as well as hover, because a control you can Tab to
          and cannot see is worse than one you cannot reach. */}
      <div className="group/setup flex h-[26px] shrink-0 items-center gap-2 overflow-hidden border-b border-borderSubtle px-2">
        <TickerQuickPick ticker={m.ticker} onPick={onTicker} slim title="Change this panel's symbol" />
        {/* THE TABS YIELD; THE CLOSE BUTTON DOES NOT. At the narrowest panel
            the family group pushed the × seventeen pixels past the edge and
            the header's own clip swallowed it — a panel a reader could open
            and not close. The group shrinks now and the button is nailed
            down, so what gives way is a label rather than a control. */}
        <div
          role="group"
          aria-label={`${m.ticker} exposure family`}
          data-pp-setup="family"
          className="inline-flex min-w-0 shrink items-center gap-0.5 overflow-hidden opacity-70 transition-opacity duration-200 group-hover/setup:opacity-100 group-focus-within/setup:opacity-100"
        >
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
        {/* WHICH CONTRACTS. Every number on this table used to be a 0DTE
            reading with nothing saying so; this is the control that was
            missing, and it rebuilds the chain at a real horizon rather than
            scaling one. */}
        {width >= W_EXPIRY && (
          <>
            <span aria-hidden className="h-3 w-px shrink-0 bg-borderMuted" />
            <div
              role="group"
              aria-label="expiry"
              data-pp-setup="expiry"
              className="inline-flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity duration-200 group-hover/setup:opacity-100 group-focus-within/setup:opacity-100"
            >
              {EXPIRIES.map(e => {
                const on = e.key === expiry;
                return (
                  <button
                    key={e.key}
                    data-pp-expiry={`${index}:${e.key}`}
                    aria-pressed={on}
                    onClick={() => onExpiry(e.key)}
                    title={`${e.name} — ${e.dte}DTE`}
                    className={`rounded px-1.5 py-[3px] font-mono text-[9px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                      on ? 'bg-borderMuted text-textPrimary' : 'text-textMuted hover:bg-white/[0.06] hover:text-textSecondary'
                    }`}
                  >
                    {e.label}
                  </button>
                );
              })}
            </div>
          </>
        )}
        {width < W_EXPIRY && (
          /* TOO NARROW FOR FOUR CHIPS IS NOT TOO NARROW FOR THE CONTROL. A
             header that drops its expiry picker leaves a reader unable to
             tell which contracts they are looking at, which is worse than the
             crowding. One chip, showing the current horizon, cycling on
             click — state visible, always. */
          <button
            data-pp-expiry={`${index}:cycle`}
            data-pp-setup="expiry"
            onClick={() => {
              const i = EXPIRIES.findIndex(e => e.key === expiry);
              onExpiry(EXPIRIES[(i + 1) % EXPIRIES.length].key);
            }}
            title={`${expiryOf(expiry, customDte).name} — click for the next expiry`}
            className="shrink-0 rounded bg-borderMuted px-1.5 py-[3px] font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-textPrimary opacity-70 transition-all duration-200 hover:bg-white/20 group-hover/setup:opacity-100 group-focus-within/setup:opacity-100"
          >
            {expiryOf(expiry, customDte).label}
          </button>
        )}
        {onClose && (
          <button
            data-matrix-close={index}
            onClick={onClose}
            title={`Close ${m.ticker}`}
            aria-label={`Close ${m.ticker}`}
            className="ml-auto inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-textMuted transition-colors hover:bg-white/10 hover:text-bear"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* ── what this book IS ───────────────────────────────────────────── */}
      <BookLine m={m} metric={metric} width={width} />

      {/* ── what is CHANGING, and the control that chooses the window ────
          One row, one job twice over: the figures are the term structure —
          whether the last minute is faster than the last five — and clicking
          one measures the table's change over it. The readout and the picker
          are the same object, which is what stops the header carrying two
          control groups it has no room for. */}
      <div className="flex h-[22px] shrink-0 items-center overflow-hidden border-b border-borderSubtle px-2">
        {/* THE BAND IS A ROW WHATEVER THE RAIL IS. `densityFor` answers for
            the rail, where the overlay stacks; here it lies in a strip 22px
            tall, and handing it the rail's answer stacked seven entries into
            a band with room for one. The shape is the container's to say. */}
        <Overlay reads={m.reads} d={bandDens} value={lookback} onPick={onLookback} />
      </div>

      {/* ── the columns ─────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-borderSubtle" role="grid" aria-label="columns">
        <div className="grid items-center py-1.5" style={{ gridTemplateColumns: COLS }} role="row">
          <span
            role="columnheader"
            className="border-r border-borderSubtle px-3 font-mono text-[9px] uppercase tracking-[0.18em] text-textMuted"
          >
            Strike
          </span>
          {(['put', 'call', 'net'] as const).map(leg => (
            <span
              key={leg}
              role="columnheader"
              className="px-3 text-right font-mono text-[9px] uppercase tracking-[0.18em] text-textMuted"
            >
              {leg}
            </span>
          ))}
          {/* The profile's sides and its ruler, on one line. A diverging bar
              with no stated sides is a decoration; with no magnitude beside
              it, so is the shape. */}
          {/* NO PADDING WHEN THERE IS NOTHING TO PAD. The track is
              `minmax(0,1fr)` and collapses to zero when the profile stands
              down — but `px-2` does not collapse, so an EMPTY cell was still
              sixteen pixels wide and hung that far past the panel's edge at
              the narrowest layout. A gap of nothing does not need a gutter. */}
          <span
            role="columnheader"
            className={`flex min-w-0 items-baseline justify-center gap-1.5 overflow-hidden whitespace-nowrap font-mono text-[8px] uppercase tracking-[0.14em] ${
              showProfile ? 'px-2' : ''
            }`}
          >
            {showProfile && (
              <>
                <span style={{ color: NET_NEG_INK }}>call ◄</span>
                <span className="tnum text-textMuted">±{cellMoney(scale)}</span>
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
      <div className="flex min-h-0 flex-1">
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
              laneW={laneW}
              legBars={showLegBars}
              loaded={loadedSet.has(r.strike)}
              over={m.lookback.label}
              onHover={onRow}
            />
          </Fragment>
        ))}
        {spotAfter < 0 && m.rows.length > 0 && <SpotRule ticker={m.ticker} spot={m.spot} />}
        <WindowEdge strikes={m.window.strikes} side="below" />
      </div>

      {/* ── WHICH STRIKES, AND WHY ───────────────────────────────────────
          The table says what is at every level exactly; it cannot say which
          of its sixty-one rows is about to matter. The rail is the two
          readings that answer that — the score's own ranking, and the
          selected strike's case — and it appears only where there is room
          for it rather than squeezing the book. */}
      {dens.showRail && (
        <aside
          data-pp-rail={index}
          className="flex min-h-0 shrink-0 flex-col gap-2 overflow-hidden border-l border-borderSubtle px-2 py-1.5"
          style={{ width: dens.railW }}
        >
          {dens.showLoaded && <Loaded board={m} d={dens} selected={cursor} onSelect={setCursor} />}
          <div className="mt-auto shrink-0 border-t border-borderSubtle pt-1.5">
            <StrikeCard board={m} row={cursorRow} d={dens} />
          </div>
        </aside>
      )}
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
          <ScaleRead m={m} metric={metric} width={width} dollarBadges={dollarBadges} />
        )}
      </div>
    </section>
  );
}

/** A hex ink at an alpha, for a chip ground that has to sit on near-black
    without becoming a block. */
function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a.toFixed(3)})`;
}

/** A share, with a floor that says "small" rather than "none". 0.0% against a
    figure of −$76.0K reads as a bug in the table; `<0.1%` reads as the truth. */
function sharePct(share: number): string {
  if (share <= 0) return '0.0%';
  return share < 0.001 ? '<0.1%' : `${(share * 100).toFixed(1)}%`;
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
  /* The same engine the section's strip reads, asked about THIS panel's
     symbol. Keyed on the ticker so five panels of one name pay for it once. */
  const vol = useMemo(
    () => (width >= W_VOL ? buildVolRegime(m.ticker, 30).find(r => r.ticker === m.ticker) ?? null : null),
    [m.ticker, width]
  );
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

      {vol && (
        <span data-matrix-vol={m.ticker} className="flex items-baseline gap-1" title={`${m.ticker} at-the-money implied volatility, 30 days`}>
          <span className="uppercase tracking-[0.16em] text-textMuted">iv</span>
          <span className="font-semibold tnum text-textSecondary">{(vol.iv * 100).toFixed(2)}</span>
          {vol.premium !== null && (
            <span className="tnum text-textMuted">
              {vol.premium >= 0 ? '+' : '−'}
              {Math.abs(vol.premium * 100).toFixed(2)} vs rv
            </span>
          )}
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
          {/* The arrow alone. Colouring it bull/bear would say the crown
              getting heavier is bullish, which is the same claim the chips
              just stopped making. */}
          {DRIFT_METRICS.has(metric) && (
            <span aria-hidden className="text-textSecondary">
              {m.king.dir > 0 ? '▲' : m.king.dir < 0 ? '▼' : '·'}
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
  laneW,
  legBars,
  loaded,
  over,
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
  laneW: number;
  /** The window every badge in this row is measured over, in words. */
  over: string;
  legBars: boolean;
  /** In this book's ranked shortlist — see `loadedStrikes`. */
  loaded: boolean;
  onHover: (strike: number) => void;
}) {
  const dim = focus && !row.meaningful;
  const tag = row.tags[0];
  const c = row.cells[metric];
  /*
    ══ THE ROW'S CHANGE IS OVER THE WINDOW THE READER PICKED ═══════════════

    This was `row.drift.m5` — the last five minutes, hardcoded, on all
    sixty-one rows. The window control above changed which strikes made the
    shortlist and what the band at the top read, and then every row in the
    table went on reporting five minutes whatever it said (Noah: "did you
    make the overlay per strike? so far looks like you just put it on the
    top and i don't want that").

    `row.flow` is the same measurement over the CHOSEN window, built in the
    engine beside the score it feeds, so the badge and the ranking cannot
    disagree about what moved.

    Still gamma's: the other four families are computed live from the chain
    and no history of them is kept, so a badge there would look measured and
    not be — see DRIFT_METRICS, and the foot, which says so.
  */
  const d = DRIFT_METRICS.has(metric) ? row.flow : null;
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
      /*
        THE PIN ROW WAS TOO FAINT TO FIND. `bg-white/[0.04]` on the one row
        the whole panel is about meant hunting for it. A 2px rule down its
        left edge is findable at a glance and still quieter than a fill.

        ══ ONE RULE, TWO FACTS, AND PIN WINS ═══════════════════════════════

        The shortlist is marked in the profile lane, and the profile lane is
        the first picture to go when the panel is narrow — so on the boards
        where a reader most needs "which of these sixty-one matters", the
        answer was nowhere. The left edge costs no width and is already
        being drawn, so it carries the shortlist too.

        They collide on the row that is both, which is most pins, so the
        order is fixed rather than blended: PIN INK WINS. Magenta means pin
        across this whole section and a row that is the pin must not be
        wearing some other colour; the strike column says the word PIN
        regardless, so nothing is carried by this one channel alone.

        BELOW PIN, THE RULE IS THE ROW'S SIDE. It used to be the grade's ink,
        and the grade is gone — so rather than invent a colour for "on the
        shortlist", the rule takes the ink the row is already speaking in:
        violet where the level is put-dominant, amber where it is call-. The
        PRESENCE of the rule is the shortlist; its hue is the same fact the
        figure and the bar are stating, which is the section's rule
        everywhere else and is one fewer colour to learn.
      */
      style={{
        gridTemplateColumns: COLS,
        height: ROW_H,
        opacity: dim ? 0.28 : 1,
        boxShadow:
          tag === 'pin'
            ? `inset 2px 0 0 ${TAG_INK.pin}`
            : loaded
              ? `inset 2px 0 0 ${netInk(c?.net ?? 0)}`
              : undefined,
      }}
      className={`grid items-center transition-opacity ${
        active ? 'bg-white/[0.07]' : tag === 'pin' ? 'bg-white/[0.055]' : ''
      }`}
    >
      {/*
        ══ THE STRIKE IS THE ROW'S IDENTITY, NOT ITS FOOTNOTE ══════════════

        It was 10px `textMuted` — the faintest mark on a line whose brightest
        was the net. The eye scanning for a level had to hunt past the answer
        to find the question. Three levels now, in the order a reader needs
        them: the net is the answer and stays brightest, the strike is what
        you are looking for, and the two legs are the working-out.
      */}
      <span
        role="rowheader"
        className="flex h-full items-center gap-1 overflow-hidden border-r border-borderSubtle px-3 font-mono text-[11px] tnum text-textSecondary"
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
      <Cell v={c?.put ?? 0} scale={scale} ink={PUT_INK} bar={legBars} />
      <Cell v={c?.call ?? 0} scale={scale} ink={CALL_INK} bar={legBars} />
      <Cell v={c?.net ?? 0} scale={scale} ink={netInk(c?.net ?? 0)} strong bar drift={d} over={over} />
      <Profile row={row} metric={metric} scale={scale} show={profile} width={laneW} loaded={loaded} />
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
 * A nonzero reading always draws. Sub-pixel bars rounded to nothing, so a
 * whole stretch of small strikes had an empty bar lane that read as "no
 * data" rather than as "small" — and telling those two apart is the entire
 * reason the empty strikes are in the table. The floor bought that back and
 * cost a lane of identical specks at the quiet end, so the OPACITY carries
 * the magnitude the width can no longer show.
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
  bar = true,
  drift = null,
  over = '5 minutes',
}: {
  v: number;
  scale: number;
  ink: string;
  strong?: boolean;
  bar?: boolean;
  drift?: Drift | null;
  /** The window the badge is measured over, in words — see `row.flow`. */
  over?: string;
}) {
  const t = scale > 0 ? Math.min(1, Math.abs(v) / scale) : 0;
  const crossed = drift?.crossed ?? false;
  const words = drift ? (crossed ? crossWords(drift) : badgeWords(drift)) : null;
  /*
    ══ THE CHIP ANNOTATES THE NUMBER, IT IS NOT THE NUMBER ═══════════════

    Solid saturated green and red blocks at full opacity, sitting next to
    money drawn in greys — on a gamma panel they were the loudest thing on
    the screen, and they are the footnote. Worse at board level: only gamma
    keeps history, so two panels were covered in chips and three had none,
    and the board read as two live panels and three dead ones when all five
    were equally live.

    Tinted ground, coloured text. Same information, an order of magnitude
    quieter, and the difference between a panel with chips and one without
    stops being the first thing the eye reports.

    A CROSSING KEEPS THE OLD VOLUME. It is rare, it is the event the whole
    badge mechanism exists for, and it should be the one chip that shouts.
  */
  /*
    ══ THE CHIP IS THE ROW'S SIDE, NOT A VERDICT ═════════════════════════

    It was solid green for building and solid red for draining, which put the
    strongest two-tone signal in trading — the one every reader has been
    taught means UP and DOWN, GOOD and BAD — onto a claim that is neither. A
    put wall filling is not bullish. And a green `+79%` sat directly beside
    an amber `−$194.4M`: two colour systems fighting inside one cell.

    The arrow says which way. The ink says which side, the same side the
    figure beside it and the bar beneath it are already saying, so the cell
    finally speaks with one voice. Green and red go back to meaning price.

    THE TINT CARRIES THE SIZE, which is what buys back the scanning the
    two-tone was doing: a level that has moved a lot sits on a stronger
    ground than one that has barely shifted, so "where is the book filling"
    is still answerable at a glance down the column.
  */
  const side = v >= 0 ? NET_POS_INK : NET_NEG_INK;
  const heat = drift ? Math.max(0.1, Math.min(0.34, Math.abs(drift.grew) / Math.max(1, scale) * 1.9 + 0.1)) : 0.1;
  const tone = crossed
    ? { background: crossedTo(drift as Drift) === 'put' ? NET_POS_INK : NET_NEG_INK, color: '#0a0a0a' }
    : { background: rgba(side, heat), color: side };
  return (
    <span role="gridcell" className="flex h-full min-w-0 flex-col justify-center overflow-hidden px-3">
      <span className="flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap leading-none">
        {words && (
          <span
            data-matrix-badge={crossed ? 'cross' : 'move'}
            title={
              crossed
                ? `This strike changed side over the last ${over}`
                : drift?.pct == null
                  ? UNITS_NOTE
                  : `Change in weight over the last ${over}`
            }
            className={`shrink-0 rounded-[2px] px-1 text-[8px] font-bold leading-[12px] ${
              crossed ? 'ring-1 ring-white/70' : ''
            }`}
            style={tone}
          >
            {words}
          </span>
        )}
        <span
          className={`shrink-0 font-mono text-[11px] tnum ${
            strong ? 'font-semibold text-textPrimary' : 'text-textMuted'
          }`}
        >
          {cellMoney(v)}
        </span>
      </span>
      {/* THREE PIXELS, NOT TWO, and only where it can be told from an
          underline — see `W_LEG_BARS`. A 2px rule under a right-aligned
          number is the shape of a text underline; 3px with rounded ends,
          separated, is the shape of a bar. */}
      {bar && (
        <span aria-hidden className="mt-[4px] flex h-[3px] w-full justify-end">
          <span
            className="block h-full rounded-full"
            style={{
              width: t > 0 ? `max(2px, ${(t * 100).toFixed(2)}%)` : '0px',
              background: ink,
              /* A speck at the quiet end of the book recedes instead of
                 forming a lane of meaningless dots — the cost of flooring
                 the width, paid back in opacity. */
              opacity: strong ? Math.max(0.45, Math.min(1, 0.45 + t * 1.6)) : Math.max(0.3, Math.min(0.85, 0.3 + t * 1.4)),
            }}
          />
        </span>
      )}
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
function Profile({
  row,
  metric,
  scale,
  show,
  width,
  loaded,
}: {
  row: MatrixRow;
  metric: LadderMetric;
  scale: number;
  show: boolean;
  /** How wide the lane actually is — the mark is drawn to fit it. */
  width: number;
  loaded: boolean;
}) {
  if (!show) return <span />;
  const v = row.cells[metric]?.net ?? 0;
  const t = scale > 0 ? Math.min(1, Math.abs(v) / scale) : 0;
  const pos = v >= 0;
  const ink = pos ? NET_POS_INK : NET_NEG_INK;
  /* INTENSITY IS A FUNCTION OF LENGTH, so the walls come forward and the
     shelf of small levels recedes instead of forming a uniform hedge. */
  const alpha = 0.34 + Math.min(0.66, t * 1.05);
  /*
    ══ A MARK SHOWS WHAT ITS HALF OF THE LANE CAN HOLD ═══════════════════

    Same rule as the flow band: a label that does not fit is not a smaller
    label, it is a label printed over something else. The gate is per ROW
    because the words are per row — PUT WALL is three characters longer than
    MAGNET and five longer than PIN, and one threshold for all of them
    passes on the short word and then prints the long one over its own bar.

    `INK_PER_CHAR` is an upper bound, not an average: 8px bold uppercase at
    `tracking-wider` puts the widest glyphs — W and M — at about 6.6px, and
    a bound is what a gate needs. Rounding it up costs a word that would
    just have fitted and buys never printing one over the picture.

    Nothing is lost when a mark goes. The row keeps its rule down the left
    edge at every width, the rail names the same strikes wherever there is a
    rail, and the strike column still says PIN, PW and CW.
  */
  const mark = markFor(width, row.role);
  return (
    <span
      data-matrix-profile
      data-loaded={loaded ? 'true' : 'false'}
      /* THE BAR'S OWN NUMBER, so the claim that the picture is the figures
         is checkable from outside rather than taken on trust. */
      data-net={Math.round(v)}
      role="gridcell"
      className="relative flex h-full min-w-0 items-center overflow-hidden px-2"
    >
      {/* THE ZERO AXIS, drawn like one. Every bar in this lane is measured
          from it, so it is a line rather than a hint. */}
      <span aria-hidden className="absolute inset-y-[3px] left-1/2 w-px bg-white/25" />
      <span aria-hidden className="relative block h-[13px] w-full">
        <span
          data-matrix-bar
          className="absolute top-0 h-full rounded-[2px]"
          style={{
            width: t > 0 ? `max(2px, ${(t * 50).toFixed(2)}%)` : '0px',
            background: ink,
            opacity: alpha,
            ...(pos ? { left: '50%' } : { right: '50%' }),
          }}
        />
      </span>

      {/*
        ══ THE LOADED STRIKES ARE MARKED WHERE THEY LIVE ═══════════════════

        They were a list in the rail, which is a fine list and the wrong
        place to answer "which of THESE bars matters". A reader scanning the
        ladder had to hold five strike numbers in their head and find them
        again by eye.

        So the level's NAME rides on the row itself, on the outer edge of
        the lane away from the bar, where it annotates without covering. The
        list stays — it ranks, which a ladder in strike order cannot — but
        the ladder no longer needs it to be read.

        THE NAME, AND NOT A GRADE. A chip reading HOT or WARM sat here too,
        and it was an adjective in a table of figures restating a ranking the
        rail already states exactly. PIN and PUT WALL are facts about the
        book that no number on the row says; that is the whole test for
        earning a word here.
      */}
      {loaded && row.role && mark && (
        <span
          /* ══ THE MARK GOES IN THE HALF THE BAR IS NOT IN ════════════════
             It was pinned to the bar's OWN side — `right-2` beside a bar
             anchored at `left: 50%` — so the two grew towards each other and
             the longest bars in the book, which are the ones most likely to
             be on the shortlist, had the word printed over them. Measured on
             a 112px lane: 18px of overlap on the pin row. The empty half is
             where an annotation belongs. */
          className={`pointer-events-none absolute inset-y-0 flex items-center gap-1 whitespace-nowrap ${
            pos ? 'left-2' : 'right-2 flex-row-reverse'
          }`}
        >
          <span
            data-matrix-role={row.role}
            className="text-[8px] font-bold uppercase tracking-wider"
            style={{ color: ROLE_INK[row.role] }}
          >
            {ROLE_WORDS[row.role]}
          </span>
        </span>
      )}
    </span>
  );
}

/* ── the foot, in its two states ─────────────────────────────────────────── */

function ScaleRead({
  m,
  metric,
  width,
  dollarBadges,
}: {
  m: Matrix;
  metric: LadderMetric;
  width: number;
  dollarBadges: boolean;
}) {
  /*
    ══ CLAUSES DROP WHOLE, THEY DO NOT GET CUT ═══════════════════════════

    `FULL BAR $793.8M pe…` and `hover one for its share of the` — a line cut
    mid-word reads as broken rather than as abbreviated, and both of those
    were on every panel of a five-panel board. The book line was already
    dropping whole clauses by width; this does the same, and nothing here
    truncates.

    The units sentence is the last to arrive and only arrives when it is
    ABOUT something: a paragraph of prose explaining a dollar badge, sitting
    in the footer of a panel that has no dollar badges on it, was the
    wordiest thing on the screen and was addressed to nobody.
  */
  const hint = DRIFT_METRICS.has(metric) ? 'hover one for its clock' : 'hover one for its share of the book';
  return (
    <div className="flex h-full items-center gap-3 overflow-hidden whitespace-nowrap font-mono text-[9px]">
      <span className="uppercase tracking-[0.16em] text-textMuted">full bar</span>
      <span className="tnum text-textPrimary">{cellMoney(m.scales[metric] ?? 0)}</span>
      <span className="text-textMuted">per {SHOCK[metric]}</span>
      {width >= W_COUNT && (
        <span className="ml-auto tnum text-textMuted">
          {m.meaningfulCount}/{m.rows.length} carry something
        </span>
      )}
      {width >= W_HINT && <span className="text-textMuted">· {hint}</span>}
      {width >= W_UNITS && dollarBadges && <span className="text-textMuted/70">· {UNITS_NOTE}</span>}
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
      {/* The glyph carries the direction here too, so the clock does not
          reintroduce the green/red the chips just gave back to price. */}
      <span
        className={`text-[9px] tnum ${
          d == null ? 'text-textMuted' : d.crossed ? 'text-textPrimary' : 'text-textSecondary'
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
