import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, X } from 'lucide-react';
import TickerQuickPick from '../../../components/gex/TickerQuickPick';
import { CONTROL_DENSE, CONTROL_ICON, CONTROL_OFF, CONTROL_ON } from '../../../components/pinpoint/Desk';
import { LADDER_METRICS, spotChangePct } from '../../../data/gex';
import { EXPIRIES, expiryOf, type ExpiryKey } from '../../../data/expiry';
import { ROLE_WORDS, WINDOWS, type Role, type WindowKey } from '../../../data/pinpoint/board';
import { buildVolRegime } from '../../../data/volRegime';
import { ROW_H, densityFor, fitRows, paneBounds } from './density';
import { Overlay } from './Drawer';
import { diffStream, mergeStream, seedStream, type StreamEvent, type StreamMemory } from '../../../data/pinpoint/stream';
import { buildExtras, type LaneMode, type SectionKey } from '../../../data/pinpoint/extras';
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
  type RowPulse,
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

/* The row height lives in density.ts beside the arithmetic that counts
   with it — see `ROW_H` and `fitReach` there. */

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
/*
  ══ TWO COLUMNS AND A PICTURE, NOT FIVE COLUMNS ═══════════════════════════

  Noah: "i also dont think you should have call and put on it at all times i
  tink it should always just be net gex and the overlay gives the infomation
  because its a lot to look at."

  He is right about the arithmetic as well as the reading. A put leg and a
  call leg are a question about ONE strike, and a COLUMN is the shape for a
  question asked of sixty-one rows at once. Asking it sixty-one times spent
  two hundred pixels of every panel restating a pair of numbers a reader
  looks at one row at a time — and the pair is still one pointer-move away,
  in the drawer, which is the right shape for it.

  What the table is now: which strike, what the net is there, what it has
  done over every window (drawn inside the net's own cell, costing nothing),
  and the zero-anchored picture of the book beside it.

  The strike column is eighty-eight because the PIN row is the widest one —
  the number, the tag and the star — and the net column is generous because
  it is now carrying the figure, the change badge and the time strip.
*/
/*
  ══ THE GAP IS CLOSED ═════════════════════════════════════════════════════

  Noah: "the column space is pretty big tbh, can we bridge the gap?"

  Measured: the strike's ink ended 33px into an 88px cell, and the net's
  figure was right-anchored in a 168px cell — a hundred and sixteen to a
  hundred and thirty pixels of nothing between a strike and its own number,
  on every row, which read as two tables standing apart.

  Two changes. The strike column is 76 — `505 PIN ★` at 12px semibold
  measures to 75 with its padding and border, and both 64 and 72 clipped
  the star off the one row a reader looks for first. And the net cell anchors LEFT: the figure in a fixed 62px slot
  right after the strike, then the change badge after the figure — "-$269.6M
  ▼83%" reads as a number and its change, which is what it is. The figure is
  still right-aligned inside its slot, so digits line up down the column;
  what moved is where the column starts. Gap now: about forty pixels, the
  same on every row.
*/
const COLS_LANE = '76px minmax(132px, 140px) minmax(0, 1fr)';
const COLS_BARE = '76px minmax(132px, 1fr)';

/**
 * What the strike and the net need before anything is left over.
 *
 * ══ MEASURED FROM THE WIDEST CELL THE BOOK CAN PRODUCE ════════════════════
 *
 * 140 was a guess and the sweep caught it inside one pass: ten pixels of the
 * net cell's own line cut on a three-panel board. The content is a change
 * badge and a figure — `⇄ $355.1K` beside `-$199.5M` is the shape that
 * decides it — which measures to about 122 on SPY's gamma book and further
 * on names with longer figures, over 24 of padding.
 *
 * 158 is that with headroom. The cap above it is 168, so the gap between the
 * strike and its own figure stays under ten pixels even at the widest.
 */
const TABLE_MIN_PX = 76 + 132;

/**
 * What they want when they are not being squeezed.
 *
 * ══ THE PICTURE MUST NOT TAKE ROOM THE FIGURES STILL NEED ═════════════════
 *
 * The gate used to measure leftover against the columns' MINIMUM, and a
 * `1fr` lane takes free space before a capped column can grow into it. So at
 * 470px the lane appeared, the net column stayed at its floor, and a `+$117%`
 * badge beside a `-$208.8M` figure was quietly cut inside its own cell.
 *
 * The leftover a picture may have is what remains once the NUMBERS have what
 * they want. Figures before decoration, and the arithmetic says so. Kept in
 * step with `TABLE_W` in density.ts, which decides the drawer against it.
 */
/*
  ══ AND NO WIDER THAN ITS CONTENT ═════════════════════════════════════════

  It was 200, and at two panels on a 1600 that put a hundred and forty pixels
  of nothing between the strike and its own figure — the badge and the money
  together run to about a hundred and twenty, and the rest was a gap wide
  enough to read as two separate tables. The slack belongs to the picture,
  which can use it.
*/
/*
  The net cell holds a 62px figure slot, a 4px gap and a change badge, over
  24px of padding. A dollar badge — `▲$174.5M`, the shape a small base
  produces — runs to about 52, which is 142 in all; the sweep measured the
  cell three pixels short of it on a five-panel board. 140 is the cap, and
  the figure slot does not move, so the gap the strike column closed stays
  closed.
*/
const TABLE_MAX_PX = 76 + 140;

const PROFILE_MIN_PX = 96;

/**
 * How many strikes either side of spot the table draws.
 *
 * ══ THE READER CHOOSES HOW MUCH BOOK TO LOOK AT ═══════════════════════════
 *
 * Noah: "its a lot to look at and add all the strikes but have focus mode
 * and have a ability to shorten the strikes or make it full."
 *
 * Both, and they are different tools. FOCUS dims the strikes carrying
 * nothing and leaves them in place, so the shape of the book including its
 * empty stretches is still visible. REACH removes rows entirely, which is
 * what you want when the far end of the chain is not in play today.
 *
 * `null` is the whole chain. Every figure on the page is still taken over
 * the whole chain whatever this says — see `reach` in MatrixOpts.
 *
 * ══ FIT: AS MANY AS THE SCREEN HAS ROWS FOR ═══════════════════════════════
 *
 * Noah: "you see how full on the screen and how well everything fits on
 * skylit ai heatmaps?" A fixed fifteen is the right span on one monitor and
 * the wrong one on every other — a third of a tall panel black, a short one
 * scrolling. FIT is the count the measured body can hold without scrolling,
 * centred on the money, and it is the opening view: the table arrives full
 * whatever the screen is, and the fixed spans are there for a reader who
 * wants LESS than that. See `fitRows` in density.ts.
 */
export const REACHES = [8, 15, 'fit', null] as const;
export type Reach = (typeof REACHES)[number];

/** Widths at which the book line can afford to say more. Measured from the
    PANEL, never the viewport — a breakpoint cannot know this is one of five. */
const W_EXPIRY = 720;
/**
 * Below this the five family tabs become one chip that cycles.
 *
 * Derived rather than chosen: the tabs need about 160px, the expiry cycler
 * 44, the ticker 58, the three view chips 120 and the close 16, over 16 of
 * padding and four gaps — call it 430. Below that something has to give, and
 * a control that cycles gives up nothing but a glance.
 */
const W_FAMILY = 430;
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
  /** The custom horizon's days out — the field beside the CUSTOM chip. */
  onCustomDte: (next: number) => void;
  onLookback: (next: WindowKey) => void;
  focus: boolean;
  /*
    ══ THE VIEW IS THE READER'S ══════════════════════════════════════════════

    Noah: "let it be added or remove based on each person", and "have a
    ability to shorten the strikes or make it full". Three choices, kept on
    the PANEL rather than the desk, for the same reason the family tabs are:
    a board exists so two books can be read differently side by side.
  */
  /** The zero-anchored picture beside the table. */
  ladder: boolean;
  onLadder: (next: boolean) => void;
  /** Strikes either side of spot, 'fit' for as many as the box holds, or
      null for the whole chain. */
  reach: Reach;
  onReach: (next: Reach) => void;
  /** The side drawer — every answer that is about one strike. */
  drawer: boolean;
  onDrawer: (next: boolean) => void;
  /** How wide the reader dragged it; null is the opening width. */
  paneW: number | null;
  onPaneW: (next: number | null) => void;
  /** Which of the pane's sections this reader keeps — see extras.ts. */
  sections: readonly SectionKey[];
  onSections: (next: SectionKey[]) => void;
  /** NET is the diverging picture; ABS is gross weight regardless of side. */
  laneMode: LaneMode;
  onLaneMode: (next: LaneMode) => void;
  /** Null while this is the only panel — a × that would leave an empty desk
      is a trap. */
  onClose: (() => void) | null;
  onTicker: (next: string) => void;
  onMetric: (next: LadderMetric) => void;
  /** The desk's tick; a change means the book moved. */
  pulse: number;
  /*
    ══ LINK POINTS EVERY PANEL AT THE SAME DISTANCE FROM SPOT ═══════════════

    LINK's promise is "the same distance from spot on every panel", and
    under FIT — where nothing scrolls — a scroll link keeps that promise to
    nobody. So the CURSOR is linked as well: the strike this panel is
    pointed at goes up as a count of strikes from spot, and every other
    linked panel lights the row at that count. That is the comparison the
    board exists to make: 500 in SPY beside 445 in QQQ, five strikes above
    the money in both.
  */
  /** The distance, in strikes from spot, another panel is pointed at; null
      when none is, or when this panel is the one pointing. */
  linkedSteps: number | null;
  onLinkSteps: (index: number, steps: number | null) => void;
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
  onCustomDte,
  onLookback,
  focus,
  ladder,
  onLadder,
  reach,
  onReach,
  drawer,
  onDrawer,
  paneW,
  onPaneW,
  sections,
  onSections,
  laneMode,
  onLaneMode,
  onClose,
  onTicker,
  onMetric,
  pulse,
  linkedSteps,
  onLinkSteps,
  registerScroller,
  onScroll,
}: Props) {
  /* THE SCALES ARE HELD ACROSS TICKS, so they live outside the build — see
     `holdScale` for why a column that re-normalises every tick reads as a
     market that moved when only the divisor did. */
  const scalesRef = useRef<Partial<Record<LadderMetric, number>> | null>(null);
  const netScalesRef = useRef<Partial<Record<LadderMetric, number>> | null>(null);
  /*
    ══ FIT IS RESOLVED HERE, BEFORE THE BOOK IS BUILT ══════════════════════

    The engine takes a number of strikes; 'fit' is the panel's own answer to
    what that number is, read off the body's measured height. Nothing below
    this line knows FIT exists — the matrix, the edges, the shortlist all see
    a count, which is what keeps the engine ignorant of pixels.
  */
  const [bodyH, setBodyH] = useState(0);
  const rowsN: number | undefined = reach === 'fit' ? fitRows(bodyH) : undefined;
  const reachN: number | undefined = reach === 'fit' || reach == null ? undefined : reach;
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
      prevNetScales: netScalesRef.current,
      expiry,
      customDte,
      lookback,
      reach: reachN,
      rows: rowsN,
    });
    scalesRef.current = built.scales;
    netScalesRef.current = built.netScales;
    return built;
    // `pulse` is the dependency that matters — it is the desk's tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, metric, expiry, customDte, lookback, reachN, rowsN, pulse]);

  /* A different symbol is a different book and a different family a different
     quantity; carrying a ruler across either would paint the first frame of
     the new one against the last frame of the old. */
  useEffect(() => {
    scalesRef.current = null;
    netScalesRef.current = null;
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
  /* One definition of what this panel can hold, used by the drawer and the
     lane alike. `ladder` goes in because it is the reader's choice and the
     drawer's floor depends on it — see `drawerFloor`. */
  const dens = useMemo(() => densityFor(width, height, ladder, paneW), [width, height, ladder, paneW]);
  const bounds = useMemo(() => paneBounds(width), [width]);
  /*
    ══ THE OVERLAY IS OPEN WHEN THE READER SAYS AND THERE IS ROOM ══════════

    Two conditions, and they are different kinds of thing. `drawer` is a
    choice; `dens.showDrawer` is arithmetic — below the floor the overlay
    would cover the strike and its net, which are the two things it exists
    to annotate.

    IT FLOATS, SO THE TABLE KEEPS ITS WIDTH. The first cut of this was a
    column beside the table, and every width decision below had to subtract
    it. The reference floats over the chart; this floats over the lane. The
    strike and the net stay visible on the left the way a price axis does
    beside the reference's panel.
  */
  /*
    ══ AND BELOW THE FLOOR, THE DOOR IS STILL THERE ════════════════════════

    Noah: "where is the button to see the slider panel comes and goes?"
    The INFO chip was gated on the floor, so on a three-panel board there
    was no button at all — the pane could only be reached by widening the
    window. The door is offered at every width now. Above the floor it
    opens the reader's stored pane beside the table; below it, where the
    pane would cover the figures, it opens a PEEK — the pane takes the body
    whole, is not remembered, and closes on the pull, the ✕ or Esc. The
    stored preference is untouched by a peek, so widening the board back
    finds the pane where the reader left it.
  */
  const [peek, setPeek] = useState(false);
  useEffect(() => {
    if (dens.showDrawer) setPeek(false);
  }, [dens.showDrawer]);
  const openDrawer = dens.showDrawer ? drawer : peek;
  const toggleDrawer = useCallback(() => {
    if (dens.showDrawer) onDrawer(!drawer);
    else setPeek(v => !v);
  }, [dens.showDrawer, drawer, onDrawer]);
  const closeDrawer = useCallback(() => {
    if (dens.showDrawer) onDrawer(false);
    else setPeek(false);
  }, [dens.showDrawer, onDrawer]);
  const showProfile = ladder && width - TABLE_MAX_PX >= PROFILE_MIN_PX;
  /* The lane is the grid's `1fr`, and `1fr` takes what is left once the
     capped columns have grown — so when the lane is drawn at all, this is
     exactly how wide it is. */
  const laneW = showProfile ? Math.max(0, width - TABLE_MAX_PX) : 0;
  const COLS = showProfile ? COLS_LANE : COLS_BARE;
  /* Whether turning the picture ON would actually draw one — the question
     the `BARS` chip has to be able to answer before it is offered. */
  const canLane = width - TABLE_MAX_PX >= PROFILE_MIN_PX;

  /*
    ══ THE STREAM: SEEDED ON THE FIRST READING, DIFFED ON EVERY ONE AFTER ══

    The panel keeps the last reading of THIS book and the events so far. A
    new symbol, family or expiry is a different book — the buffer starts
    again from a seed rather than diffing gamma against vega and calling it
    news. See data/pinpoint/stream.ts for what counts as an event.
  */
  const lastRead = useRef<Matrix | null>(null);
  const streamMem = useRef<StreamMemory>({ top: [] });
  const [stream, setStream] = useState<StreamEvent[]>([]);
  useEffect(() => {
    const prev = lastRead.current;
    lastRead.current = m;
    const same = prev && prev.ticker === m.ticker && prev.families[0] === m.families[0] && prev.expiry.key === m.expiry.key;
    if (!same) {
      setStream(seedStream(m, streamMem.current));
      return;
    }
    /* A span change comes back as silence from the engine — see the note
       in diffStream — so the buffer is simply kept across it. */
    const events = diffStream(prev, m, streamMem.current);
    if (events.length > 0) setStream(buf => mergeStream(buf, events));
  }, [m]);

  /*
    ══ WHAT ELSE THE REPO CAN SAY ABOUT THIS BOOK ══════════════════════════

    The expected move, vol, the session's series, today's prices, the pins —
    engines other desks already run, asked once per reading about this
    symbol at this expiry. See data/pinpoint/extras.ts.
  */
  /*
    ══ AT A FIVE-SECOND CADENCE, NOT EVERY TICK ════════════════════════════

    Measured: the extras are the largest engine cost a panel pays per tick
    — 3.1ms against 1.3 for the whole three-family matrix — and nothing in
    them moves at tick resolution: a cone to the close, a vol verdict, a
    day's series, the session's prices, the pins. On a five-panel board
    that was fifteen milliseconds of every long task spent recomputing
    answers that had not changed. They refresh every five seconds, and at
    once on a new symbol, expiry or chain.
  */
  const extrasBeat = Math.floor(m.builtAt / 5000);
  const extras = useMemo(
    () => buildExtras(ticker, m.expiry, m.spot, m.step),
    // `m` is read for spot and expiry at the moment of the beat; the beat is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ticker, expiry, customDte, m.step, extrasBeat]
  );
  /*
    THE TABLE MARKS WHAT THE PANE SHOWS, and only while it shows it. The two
    1σ strikes get a dashed rule when the MOVE section is on; a strike a
    session level lands on gets that level's tag when LEVELS is on. Turning
    a section off takes its marks off the rows too — a mark with no section
    explaining it is a mark the reader has to guess at.
  */
  const emSet = useMemo(
    () => new Set(sections.includes('move') && extras.move ? [extras.move.upStrike, extras.move.dnStrike] : []),
    [sections, extras.move]
  );
  const levelTags = useMemo(() => {
    const map = new Map<number, string>();
    if (!sections.includes('levels') || !extras.levels || m.step <= 0) return map;
    for (const l of extras.levels.levels) {
      const s = Math.round(l.price / m.step) * m.step;
      if (!map.has(s)) map.set(s, l.tag);
    }
    return map;
  }, [sections, extras.levels, m.step]);

  /* Pointing from the overlay — a card, a line in the feed — moves the
     cursor and brings the row into view, so the table and the panel are
     always about the same strike. */
  const point = useCallback(
    (strike: number | null) => {
      setHeld(strike);
      setCursor(strike);
      const el = bodyRef.current;
      if (!el || strike == null) return;
      const idx = m.rows.findIndex(r => r.strike === strike);
      if (idx < 0) return;
      const top = idx * ROW_H;
      if (top < el.scrollTop || top + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = Math.max(0, top - el.clientHeight / 2);
    },
    [m.rows]
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
  /*
    ══ A CLICK HOLDS THE STRIKE ════════════════════════════════════════════

    The pane and the foot described whatever the pointer was on, and only
    that — so reading the pane about a strike meant moving the pointer
    OFF the strike, at which point the pane stopped describing it. A held
    strike stays described until it is released: click it again, click
    another, Esc. Hover still previews over the top of it, the way a
    cursor previews over a selection, and pointing from the pane holds.
  */
  const [held, setHeld] = useState<number | null>(null);
  const shownStrike = cursor ?? held;
  const cursorRow = shownStrike == null ? null : m.rows.find(r => r.strike === shownStrike) ?? null;
  const onRow = useCallback((strike: number) => setCursor(strike), []);
  const onHold = useCallback((strike: number) => setHeld(h => (h === strike ? null : strike)), []);
  /* Up to the desk as a count of strikes from spot — rounded, because
     `steps` carries spot's fraction and would otherwise change every tick
     the price moved. */
  const myStepsOut = cursorRow ? Math.round(cursorRow.steps) : null;
  useEffect(() => {
    onLinkSteps(index, myStepsOut);
  }, [index, myStepsOut, onLinkSteps]);
  const linkedStrike = useMemo(
    () => (linkedSteps == null ? null : m.rows.find(r => Math.round(r.steps) === linkedSteps)?.strike ?? null),
    [linkedSteps, m.rows]
  );
  /* A held strike that the span no longer draws is released rather than
     kept as an invisible selection. */
  useEffect(() => {
    if (held != null && !m.rows.some(r => r.strike === held)) setHeld(null);
  }, [m.rows, held]);
  useEffect(() => {
    setHeld(null);
  }, [ticker]);

  /* The key line shows while the table has KEYBOARD focus and nothing is
     pointed at yet — the one moment a reader is asking what the keys are. */
  const [keysOn, setKeysOn] = useState(false);

  const bodyRef = useRef<HTMLDivElement | null>(null);
  const attachBody = useCallback(
    (el: HTMLDivElement | null) => {
      bodyRef.current = el;
      registerScroller(index, el);
    },
    [index, registerScroller]
  );
  /* The body's own box, for FIT. Its height is what the panel leaves once
     the head, the book line, the column head and the foot have theirs — a
     measurement, where a count of that chrome would be a guess that changes
     with width. It does not depend on how many rows are in it (`flex-1`,
     `min-h-0`), so a span that changes the row count cannot move the box
     that decided the span. */
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(entries => {
      const h = entries[0]?.contentRect.height;
      if (h == null) return;
      setBodyH(prev => (Math.abs(prev - h) < 1 ? prev : h));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

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
      const rows = m.rows;
      /* The pane's door, the hold and the shortlist walk. */
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        toggleDrawer();
        return;
      }
      if (e.key === 'Escape') {
        if (held != null) setHeld(null);
        else if (openDrawer) closeDrawer();
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        if (shownStrike != null) {
          e.preventDefault();
          onHold(shownStrike);
        }
        return;
      }
      const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp', '[', ']', 's', 'S'];
      if (!keys.includes(e.key)) return;
      e.preventDefault();
      if (rows.length === 0) return;
      const spotIdx = Math.max(0, rows.findIndex(r => r.strike <= m.spot));
      const at = shownStrike == null ? spotIdx : rows.findIndex(r => r.strike === shownStrike);
      let next: number;
      if (e.key === '[' || e.key === ']') {
        /*
          ══ WALK THE SHORTLIST BY RANK ══════════════════════════════════════
          `]` is the next loaded strike down the ranking, `[` the one before
          — the six that matter, in the order the score put them, without
          reading the table for them.
        */
        const ranked = m.loaded.map(r => r.strike);
        if (ranked.length === 0) return;
        const i = shownStrike == null ? -1 : ranked.indexOf(shownStrike);
        const j = e.key === ']' ? (i + 1) % ranked.length : (i <= 0 ? ranked.length - 1 : i - 1);
        next = rows.findIndex(r => r.strike === ranked[j]);
        if (next < 0) return;
      } else if (e.key === 's' || e.key === 'S') {
        next = spotIdx;
      } else {
        const step = e.key === 'PageDown' ? 10 : e.key === 'PageUp' ? -10 : e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
        next = e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1 : Math.min(rows.length - 1, Math.max(0, at + step));
      }
      setCursor(rows[next].strike);
      const el = bodyRef.current;
      if (el) {
        const top = next * ROW_H;
        if (top < el.scrollTop) el.scrollTop = top;
        else if (top + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H - el.clientHeight;
      }
    },
    [shownStrike, held, openDrawer, m.rows, m.loaded, m.spot, toggleDrawer, closeDrawer, onHold]
  );

  const change = spotChangePct(m.ticker);
  const up = change >= 0;
  const scale = m.scales[metric] ?? 1;
  /* The lane's own ruler — the book's heaviest net. See `netScales`. */
  const netScale = m.netScales[metric] ?? scale;
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
        {/*
          ══ FIVE TABS, OR ONE THAT CYCLES ═══════════════════════════════════

          The group used to shrink and clip, on the reasoning that a label
          giving way beats a control giving way. That was true while the head
          held a ticker, five families, four expiries and a close button; it
          stopped being true when the view toggles arrived beside them, and
          the measurement said so — eighty-two pixels of the family group cut
          on a four- and five-panel board, which is two and a half families a
          reader cannot see or click.

          Clipping was always the weaker half of the idea. The expiry group
          two steps to the right solved the same problem properly: below the
          width for the full set it becomes ONE chip showing the current
          value and cycling on click. State visible, control reachable, at
          every width. The families do the same thing now, and nothing in
          this header is cut at any size the board can produce.
        */}
        {width >= W_FAMILY ? (
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
                className={`${CONTROL_DENSE} ${on ? CONTROL_ON : CONTROL_OFF}`}
              >
                {spec.label}
              </button>
            );
          })}
        </div>
        ) : (
          <button
            data-matrix-metric={`${index}:cycle`}
            data-pp-setup="family"
            onClick={() => {
              const i = LADDER_METRICS.findIndex(x => x.key === metric);
              onMetric(LADDER_METRICS[(i + 1) % LADDER_METRICS.length].key);
            }}
            title={`${metricName(metric)} — click for the next family`}
            className={`${CONTROL_DENSE} ${CONTROL_ON} shrink-0 opacity-70 group-hover/setup:opacity-100 group-focus-within/setup:opacity-100`}
          >
            {metricLabel(metric)}
          </button>
        )}
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
                    className={`${CONTROL_DENSE} ${on ? CONTROL_ON : CONTROL_OFF}`}
                  >
                    {e.label}
                  </button>
                );
              })}
              {/*
                ══ ANY HORIZON ═══════════════════════════════════════════════
                The engine interpolated a custom expiry from the day it was
                built and a link could carry one (`custom21`), and no control
                on the page could ask for it. The chip picks it; the field
                beside it, drawn only while it is picked, sets the days.
              */}
              <button
                data-pp-expiry={`${index}:custom`}
                aria-pressed={expiry === 'custom'}
                onClick={() => onExpiry('custom')}
                title={`${customDte} days out — an interpolated horizon; set the days in the field`}
                className={`${CONTROL_DENSE} ${expiry === 'custom' ? CONTROL_ON : CONTROL_OFF}`}
              >
                {expiry === 'custom' ? `${customDte}D` : 'custom'}
              </button>
              {expiry === 'custom' && (
                <input
                  data-pp-custom-dte={index}
                  type="number"
                  min={1}
                  max={365}
                  value={customDte}
                  aria-label="Days to expiry"
                  onChange={e => {
                    const n = Math.round(Number(e.target.value));
                    if (Number.isFinite(n) && n >= 1 && n <= 365) onCustomDte(n);
                  }}
                  className="h-5 w-11 rounded border border-borderSubtle bg-transparent px-1 font-mono text-label tnum text-textPrimary outline-none focus-visible:ring-1 focus-visible:ring-select/60"
                />
              )}
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
            className={`${CONTROL_DENSE} ${CONTROL_ON} shrink-0 opacity-70 group-hover/setup:opacity-100 group-focus-within/setup:opacity-100`}
          >
            {expiryOf(expiry, customDte).label}
          </button>
        )}
        {/* ── the reader's own view of this book ───────────────────────
            Three toggles, on the right of the head where a hand goes
            looking. This PANEL's, not the desk's, for the same reason the
            family tabs are: a board exists so two books can be read
            differently side by side. */}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <Chip
            data={`${index}:${reach ?? 'all'}`}
            attr="data-pp-reach"
            on
            label={reach == null ? 'ALL' : reach === 'fit' ? 'FIT' : `±${reach}`}
            title={
              reach == null
                ? `The whole chain — ${m.window.chain} strikes. Click to shorten it.`
                : reach === 'fit'
                  ? `As many strikes as the panel has rows for — ${m.window.strikes} of ${m.window.chain}, no scrolling. Click for the whole chain.`
                  : `${m.window.strikes} of ${m.window.chain} strikes. Click for the next span.`
            }
            onClick={() => onReach(REACHES[(REACHES.indexOf(reach) + 1) % REACHES.length])}
          />
          {/* A TOGGLE THAT CANNOT CHANGE ANYTHING IS NOT A CONTROL. Below
              the lane's floor `BARS` would light up and draw nothing, and
              below the drawer's `INFO` would do the same — so each appears
              only where its own answer is reachable, and the head gets its
              width back on the narrow boards where it is scarce. */}
          {canLane && (
            <Chip
              data={String(index)}
              attr="data-pp-ladder"
              on={ladder}
              label="BARS"
              title={ladder ? 'Hide the book picture' : 'Draw the book on one centre line beside the table'}
              onClick={() => onLadder(!ladder)}
            />
          )}
          {canLane && ladder && (
            <Chip
              data={`${index}:${laneMode}`}
              attr="data-pp-lane-mode"
              on={laneMode === 'abs'}
              label={laneMode === 'abs' ? 'ABS' : 'NET'}
              title={laneMode === 'abs' ? 'Gross weight at each strike — click for the diverging net picture' : 'Net, diverging from zero — click for gross weight regardless of side'}
              onClick={() => onLaneMode(laneMode === 'abs' ? 'net' : 'abs')}
            />
          )}
          <Chip
            data={String(index)}
            attr="data-pp-drawer"
            on={openDrawer}
            label="INFO"
            title={
              openDrawer
                ? 'Close the pane — Esc'
                : dens.showDrawer
                  ? 'Open the pane beside the table — the book, the shortlist, the pointed strike · i'
                  : 'Open the pane over the table — it closes on Esc · i'
            }
            onClick={toggleDrawer}
          />
          {onClose && (
            <button
              data-matrix-close={index}
              onClick={onClose}
              title={`Close ${m.ticker}`}
              aria-label={`Close ${m.ticker}`}
              className={`${CONTROL_ICON} ${CONTROL_OFF} shrink-0 hover:text-bear`}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* ── what this book IS ───────────────────────────────────────────── */}
      <BookLine m={m} metric={metric} width={width} />

      {/*
        ══ THE FLOW BAND IS GONE FROM HERE ═══════════════════════════════════

        Noah: "did you create the overlay when i hover over each strike casue
        why is it still here?"

        A strip across the top listing every window's change could only ever
        be about the BOOK, and the question a reader has while looking at a
        row is about the ROW. Every strike draws its own seven windows inside
        its net cell now, and the drawer answers in figures for whichever one
        the pointer is on.

        The window PICKER survived the band — it is a real control and it
        shows its own consequence — and moved into the drawer, where the rest
        of the per-strike answers are. See `Windows` in Drawer.tsx.
      */}

      {/* ── the columns ─────────────────────────────────────────────────── */}
      <div className="relative shrink-0 border-b border-borderSubtle">
      <div role="grid" aria-label="columns">
        <div className="grid items-center py-1.5" style={{ gridTemplateColumns: COLS }} role="row">
          <span
            role="columnheader"
            className="border-r border-borderSubtle px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-textMuted"
          >
            Strike
          </span>
          {/* NET, AND THE TIME UNDER IT. The header names both, because the
              strip below the figure is a second reading in the same cell and
              a row of unlabelled ticks is a decoration. */}
          <span
            role="columnheader"
            className="flex items-baseline gap-2 overflow-hidden whitespace-nowrap px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-textMuted"
          >
            <span>net {metricLabel(metric)}</span>
            {DRIFT_METRICS.has(metric) && (
              <span
                className="text-[8px] tracking-[0.12em] text-textMuted/60"
                title="Each row's own change over 1m, 5m, 15m, 30m, 1H, 4H and 1D"
              >
                1m→1D
              </span>
            )}
          </span>
          {/* The picture's sides and its ruler, on one line. A diverging bar
              with no stated sides is a decoration; with no magnitude beside
              it, so is the shape.

              NOTHING AT ALL WHEN THE LANE IS OFF. The track does not exist in
              `COLS_BARE`, and an empty cell with `px-2` on it was sixteen
              pixels that hung past the panel's edge at the narrowest
              layout. */}
          {showProfile && (
            <span
              role="columnheader"
              className="flex min-w-0 items-baseline justify-center gap-1.5 overflow-hidden whitespace-nowrap px-2 font-mono text-[8px] uppercase tracking-[0.14em]"
              title={`Call-dominant grows left, put-dominant right · full bar ±${cellMoney(netScale)}`}
            >
              {/* THE SIDES ONLY WHERE THEY FIT. On a five-panel board the lane
                  is about 112px and `call ◄ ±$799.1M ► put` needs 122 — the
                  sweep measured ten pixels of it cut. The ruler is the part
                  that must print; the sides are the ink's own meaning, which
                  the legend on the desk bar states once for every panel. */}
              {laneMode === 'abs' ? (
                <>
                  <span className="text-textMuted">abs</span>
                  <span className="tnum text-textMuted">full {cellMoney(scale * 2)}</span>
                </>
              ) : (
                <>
                  {laneW >= 140 && <span style={{ color: NET_NEG_INK }}>call ◄</span>}
                  <span className="tnum text-textMuted">±{cellMoney(netScale)}</span>
                  {laneW >= 140 && <span style={{ color: NET_POS_INK }}>► put</span>}
                </>
              )}
            </span>
          )}
        </div>
      </div>
      {/*
        ══ THE PULL ════════════════════════════════════════════════════════

        A drawer has a handle on the edge it comes out of. The chip in the
        head is the same door, but a chip among chips is a setting; a tab
        on the edge of the table is the thing a hand reaches for (Noah:
        "where is the button to see the slider panel comes and goes?").

        It sits at the right end of the column head rather than on a row:
        the lane header is centred and leaves this corner empty at every
        width, so the tab covers no bar and no mark — on the body's edge it
        sat over the last letters of PIN on the one row nearest spot. Drawn
        only while the pane is away; when the pane is out, its ✕ is the
        handle.
      */}
      {!openDrawer && (
        <button
          data-pp-pull={index}
          onClick={toggleDrawer}
          aria-label="Open the strike pane"
          title={dens.showDrawer ? 'Open the pane · i' : 'Open the pane over the table · i'}
          className="absolute inset-y-0 right-0 z-10 flex w-4 items-center justify-center border-l border-white/[0.07] bg-white/[0.03] text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-select/60"
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
      )}
      </div>
      {/* ── the book ──────────────────────────────────────────────────────
          A grid, declared as one: sixty-one rows of divs told a screen reader
          nothing at all, and the only `role` in this file was on the tab
          group. */}
      {/* THE POINTER LEAVES THE WRAPPER, NOT THE BODY. The pane floats inside
          this box, so moving from a row onto the pane to read about it is
          not leaving — it used to be, and the pane emptied under the
          pointer that came to read it. */}
      <div className="relative flex min-h-0 flex-1" onMouseLeave={() => setCursor(null)}>
      <div
        ref={attachBody}
        data-matrix-body={index}
        role="grid"
        aria-rowcount={m.rows.length}
        aria-label={`${m.ticker} ${metricName(metric)} by strike`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={e => setKeysOn(e.target === e.currentTarget && e.currentTarget.matches(':focus-visible'))}
        onBlur={() => setKeysOn(false)}
        onScroll={e => onScroll(index, e.currentTarget.scrollTop)}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none focus-visible:ring-1 focus-visible:ring-select/40"
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
              cols={COLS}
              loaded={loadedSet.has(r.strike)}
              held={held === r.strike}
              linked={linkedStrike === r.strike && cursor !== r.strike}
              onHold={onHold}
              em={emSet.has(r.strike)}
              levelTag={levelTags.get(r.strike) ?? null}
              laneMode={laneMode}
              netScale={netScale}
              over={m.lookback.label}
              pulseScale={m.pulseScale}
              at={m.lookback.key}
              onHover={onRow}
            />
          </Fragment>
        ))}
        {spotAfter < 0 && m.rows.length > 0 && <SpotRule ticker={m.ticker} spot={m.spot} />}
        <WindowEdge strikes={m.window.strikes} side="below" />
      </div>

      {/* ── THE OVERLAY ──────────────────────────────────────────────────
          Out of the pane's right edge, over the lane: the loaded strikes as
          cards, the feed of what moved, and the pointed strike's detail. The
          body wrapper is `relative` so this sits inside the pane rather than
          over the neighbour. See Drawer.tsx. */}
      {openDrawer && (
        <Overlay
          board={m}
          extras={extras}
          pointed={cursorRow}
          stream={stream}
          lookback={lookback}
          sections={sections}
          onLookback={onLookback}
          onSections={onSections}
          onPoint={point}
          onClose={closeDrawer}
          width={dens.drawerW}
          /* A peek takes the body whole and has no grip: there is nothing
             beside it to trade width with. */
          onResize={dens.showDrawer ? onPaneW : undefined}
          bounds={bounds}
        />
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
        ) : keysOn ? (
          <KeysRead />
        ) : (
          <ScaleRead m={m} metric={metric} width={width} dollarBadges={dollarBadges} netScale={netScale} />
        )}
      </div>
    </section>
  );
}

/**
 * One of the head's view toggles.
 *
 * The same shape as the expiry chips two groups to its left, because they
 * are the same kind of thing — a small piece of state the reader owns,
 * showing its own value rather than an icon that has to be learned. `±8`
 * and `ALL` are the answer, not a label for a menu that holds the answer.
 */
function Chip({
  data,
  attr,
  on,
  label,
  title,
  onClick,
}: {
  data: string;
  attr: string;
  on: boolean;
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      {...{ [attr]: data }}
      aria-pressed={on}
      onClick={onClick}
      title={title}
      className={`${CONTROL_DENSE} ${on ? CONTROL_ON : CONTROL_OFF} shrink-0`}
    >
      {label}
    </button>
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
  cols,
  loaded,
  over,
  em,
  levelTag,
  laneMode,
  netScale,
  pulseScale,
  at,
  held,
  linked,
  onHold,
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
  /** The panel's column template — it changes with the lane toggle, so the
      row cannot hold its own copy. */
  cols: string;
  /** The window every badge in this row is measured over, in words. */
  over: string;
  /** One of the expected move's 1σ edges lands here — a dashed rule. */
  em: boolean;
  /** A session level lands on this strike — PDH, ORL — shown where a role
      word would be, and only when there is no role word. */
  levelTag: string | null;
  laneMode: LaneMode;
  /** The lane's ruler: the book's heaviest net — see `netScales`. */
  netScale: number;
  /** The book's one ruler for the per-strike time strip — see `Pulse`. */
  pulseScale: number;
  /** Which window the reader has picked, marked on every strip. */
  at: WindowKey;
  /** In this book's ranked shortlist — see `loadedStrikes`. */
  loaded: boolean;
  /** Held by a click — the pane and the foot stay on it. */
  held: boolean;
  /** Another linked panel is pointed at this distance from spot. */
  linked: boolean;
  onHold: (strike: number) => void;
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
      data-matrix-em={em ? 'true' : undefined}
      data-meaningful={row.meaningful ? 'true' : 'false'}
      role="row"
      aria-rowindex={index + 1}
      /* "net $0.0" is what a zero row read as, which is a figure rather than
         a fact. A screen reader gets the word. */
      aria-label={`${row.strike}${tag ? ` ${TAG_TITLES[tag]}` : ''}, net ${c?.net ? cellMoney(c.net) : 'zero'}`}
      onMouseEnter={() => onHover(row.strike)}
      onClick={() => onHold(row.strike)}
      data-matrix-held={held ? 'true' : undefined}
      data-matrix-linked={linked ? 'true' : undefined}
      data-matrix-steps={Math.round(row.steps)}
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
        gridTemplateColumns: cols,
        height: ROW_H,
        opacity: dim ? 0.28 : 1,
        /* The held row draws a hairline round itself, over whatever rule
           its left edge already carries — two facts, one box. */
        boxShadow: [
          tag === 'pin' ? `inset 2px 0 0 ${TAG_INK.pin}` : loaded ? `inset 2px 0 0 ${netInk(c?.net ?? 0)}` : null,
          held ? 'inset 0 0 0 1px rgba(255,255,255,0.38)' : null,
        ]
          .filter(Boolean)
          .join(', ') || undefined,
        /* The linked row is a ghost of another panel's pointer: dashed, so
           it cannot be mistaken for this panel's own hold. */
        outline: linked ? '1px dashed rgba(255,255,255,0.32)' : undefined,
        outlineOffset: linked ? -1 : undefined,
      }}
      className={`grid cursor-default items-center transition-opacity ${
        active ? 'bg-white/[0.07]' : held ? 'bg-white/[0.05]' : tag === 'pin' ? 'bg-white/[0.055]' : ''
      } ${em ? 'border-t border-dashed border-white/25' : ''}`}
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
        className="flex h-full items-center gap-1 overflow-hidden border-r border-borderSubtle pl-3 pr-1.5 font-mono text-[12px] font-semibold tnum text-textPrimary/90"
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
        {!tag && levelTag && (
          <span
            data-matrix-level={levelTag}
            title="A session level lands on this strike"
            className="text-[8px] font-bold uppercase tracking-[0.1em] text-white/50"
          >
            {levelTag}
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
      {/* THE LEGS ARE NOT COLUMNS ANY MORE — see the note on `COLS_LANE`.
          Put and call are a question about one strike, and the drawer is the
          shape for a question about one strike. */}
      <Cell
        v={c?.net ?? 0}
        scale={netScale}
        ink={netInk(c?.net ?? 0)}
        strong
        bar
        drift={d}
        over={over}
        pulse={DRIFT_METRICS.has(metric) ? row.pulse : null}
        pulseScale={pulseScale}
        at={at}
      />
      {/* NET against the book's heaviest net; ABS against twice the leg
          ruler — see `netScales` for why the two rulers differ. */}
      {profile && (
        <Profile row={row} metric={metric} scale={laneMode === 'abs' ? scale : netScale} show width={laneW} loaded={loaded} mode={laneMode} />
      )}
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
  pulse = null,
  pulseScale = 0,
  at = '15m',
}: {
  v: number;
  scale: number;
  ink: string;
  strong?: boolean;
  bar?: boolean;
  drift?: Drift | null;
  /** The window the badge is measured over, in words — see `row.flow`. */
  over?: string;
  /** Every window's reading at this strike — see `Pulse`. */
  pulse?: RowPulse[] | null;
  pulseScale?: number;
  /** Which window the reader has picked, marked on the strip. */
  at?: WindowKey;
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
      <span className="flex flex-nowrap items-center gap-1 whitespace-nowrap leading-none">
        <span
          className={`w-[62px] shrink-0 text-right font-mono text-[12px] tnum ${
            strong ? 'font-semibold text-textPrimary' : 'text-textMuted'
          }`}
        >
          {cellMoney(v)}
        </span>
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
            className={`shrink-0 rounded-[2px] px-1 text-[9px] font-bold leading-[13px] ${
              crossed ? 'ring-1 ring-white/70' : ''
            }`}
            style={tone}
          >
            {words}
          </span>
        )}
      </span>
      {/*
        ══ UNDER THE NET, THE SHAPE OF THE MOVE OVER TIME ══════════════════

        The net cell's own bar was its magnitude against the group's ruler —
        the same fact the zero-anchored lane draws better, on a shared
        centre line, in the side's ink. So the space it held goes to the one
        picture nothing else on this row was drawing: what THIS strike has
        done across all seven windows at once.

        Costs no width. That is why it is here rather than in a column of
        its own: a column would have taken forty pixels the figures or the
        lane or the rail would have had to give up, and this row has spent
        three commits learning that the figures do not give anything up.
      */}
      {pulse && pulse.length > 0 ? (
        <Pulse rows={pulse} scale={pulseScale} at={at} />
      ) : bar ? (
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
      ) : null}
    </span>
  );
}

/**
 * The multi-timeframe overlay, for ONE strike.
 *
 * ══ WHAT IS CHANGING, ASKED OF A LEVEL RATHER THAN OF A BOOK ══════════════
 *
 * Noah: "did you make the overlay per strike? so far looks like you just put
 * it on the top and i don't want that."
 *
 * Seven ticks, one per window, in the SAME order as the flow band at the top
 * of the panel — so the band is this strip's legend and a reader can map a
 * tick to the window that named it without a second label on every row.
 *
 * ══ UP IS HEAVIER, DOWN IS LIGHTER, AND THE HUE IS STILL THE SIDE ═════════
 *
 * The tick grows from a centre line: above it the level got heavier over
 * that window, below it lighter. Direction carries heavier-vs-lighter and
 * the INK carries put-dominant-vs-call-dominant, which is the section's rule
 * everywhere else — so this introduces no colour a reader has to learn, and
 * green and red stay meaning price.
 *
 * ══ ONE RULER FOR THE WHOLE BOOK, ON A SQUARE ROOT ════════════════════════
 *
 * Heights are against `pulseScale`, the biggest move at any strike over any
 * window. Normalising each row to its own maximum would make a strike that
 * moved four dollars look exactly like the one that moved four hundred
 * million, and the whole point of a column of these is scanning down it.
 *
 * But that ruler is set by the heaviest strike's SESSION move, and against
 * it a typical fifteen-minute tick is under one percent — which in four
 * pixels of half-height is nothing at all. Measured on the first cut: a
 * column of grey dashes with the data invisible inside it.
 *
 * The square root is the fix and it keeps the only property that matters
 * here: it is monotone, so a bigger move is never a shorter tick and the
 * picture cannot contradict the figures beside it. What it buys is that a
 * move one percent of the day's biggest draws at a tenth of full height
 * instead of a hundredth, which is the difference between a mark and a
 * rounding error.
 *
 * A window this strike has no history for draws NOTHING and still holds its
 * slot, so the seven positions mean the same thing on every row — a level
 * that was not in the book an hour ago has a gap there, not a shifted strip.
 */
function Pulse({ rows, scale, at }: { rows: RowPulse[]; scale: number; at: WindowKey }) {
  const by = new Map(rows.map(r => [r.key, r]));
  return (
    <span
      aria-hidden
      data-matrix-pulse={rows.length}
      /*
        ══ A SPARKLINE UNDER THE FIGURE, NOT A BAND ACROSS THE CELL ════════
        Stretched to the cell's full 126px the seven ticks came out fifteen
        wide and four tall — flat blocks, which read as a row of dashes
        rather than as a shape, and sixty-one rows of them textured the
        whole column. Narrow and tall is what a sparkline is: the same seven
        readings in a third of the width, attached to the number they are
        about, with room to actually differ in height.
      */
      className="relative mt-[2px] flex h-[11px] w-[62px] items-center justify-end gap-[2px]"
    >
      {/* ONE BASELINE, NOT SEVEN. A centre line per slot drew a dashed grey
          rule across the whole column that read as noise and competed with
          the ticks standing on it. The axis is continuous because time is. */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-white/[0.09]" />
      {WINDOWS.map(w => {
        const r = by.get(w.key);
        const t = r && scale > 0 ? Math.sqrt(Math.min(1, Math.abs(r.grew) / scale)) : 0;
        const heavier = (r?.grew ?? 0) >= 0;
        /* THE PICKED WINDOW IS MARKED ON EVERY ROW, which is the other half
           of making the control visible where the reading is: the band says
           which window is selected once, the table says it sixty-one times. */
        const picked = w.key === at;
        return (
          <span key={w.key} className="relative block h-full flex-1" style={{ maxWidth: 6, minWidth: 3 }}>
            {picked && (
              <span
                aria-hidden
                className="absolute inset-x-0 top-1/2 h-px bg-white/40"
              />
            )}
            {r && t > 0 && (
              <span
                className="absolute inset-x-0 rounded-[1px]"
                style={{
                  height: `max(1.5px, ${(t * 50).toFixed(1)}%)`,
                  background: r.crossed ? '#ededed' : r.change >= 0 ? NET_POS_INK : NET_NEG_INK,
                  opacity: picked ? 1 : 0.66,
                  ...(heavier ? { bottom: '50%' } : { top: '50%' }),
                }}
              />
            )}
          </span>
        );
      })}
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
  mode,
}: {
  row: MatrixRow;
  metric: LadderMetric;
  scale: number;
  show: boolean;
  /** How wide the lane actually is — the mark is drawn to fit it. */
  width: number;
  loaded: boolean;
  mode: LaneMode;
}) {
  if (!show) return <span />;
  const cell = row.cells[metric];
  /*
    ══ ABS: HOW MUCH IS HERE, NOT WHICH WAY ═══════════════════════════════

    The competitors' "absolute gamma" — the gross weight at a strike, puts
    and calls added — which answers "where is the book heavy" without
    asking which side it leans. Drawn from the lane's left edge in a neutral
    ink against twice the net ruler, because gross can reach twice net and
    the two modes must not share a full-bar meaning.
  */
  const abs = mode === 'abs';
  const v = abs ? Math.abs(cell?.put ?? 0) + Math.abs(cell?.call ?? 0) : (cell?.net ?? 0);
  const t = scale > 0 ? Math.min(1, Math.abs(v) / (abs ? scale * 2 : scale)) : 0;
  const pos = abs ? true : v >= 0;
  const ink = abs ? 'rgba(255,255,255,0.55)' : pos ? NET_POS_INK : NET_NEG_INK;
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
      {!abs && <span aria-hidden className="absolute inset-y-[3px] left-1/2 w-px bg-white/25" />}
      <span aria-hidden className="relative block h-[13px] w-full">
        <span
          data-matrix-bar
          className="absolute top-0 h-full rounded-[2px]"
          style={{
            width: t > 0 ? `max(2px, ${(t * (abs ? 100 : 50)).toFixed(2)}%)` : '0px',
            background: ink,
            opacity: alpha,
            ...(abs ? { left: 0 } : pos ? { left: '50%' } : { right: '50%' }),
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

/* ── the foot, in its three states ───────────────────────────────────────── */

/**
 * The keys, once, where a hand has just landed.
 *
 * Seven of them and nothing on screen said so. This shows while the table
 * has keyboard focus and no strike is pointed at yet, and gives way to the
 * strike's own reading the moment one is.
 */
function KeysRead() {
  const keys: [string, string][] = [
    ['↑↓', 'walk'],
    ['⇞⇟', 'ten'],
    ['] [', 'shortlist'],
    ['s', 'spot'],
    ['↵', 'hold'],
    ['i', 'pane'],
    ['esc', 'release'],
  ];
  return (
    <div data-matrix-keys className="flex h-full items-center gap-3 overflow-hidden whitespace-nowrap font-mono text-[9px]">
      {keys.map(([k, what]) => (
        <span key={k} className="flex items-baseline gap-1">
          <span className="rounded-[2px] bg-white/[0.08] px-1 text-textPrimary">{k}</span>
          <span className="text-textMuted">{what}</span>
        </span>
      ))}
    </div>
  );
}

function ScaleRead({
  m,
  metric,
  width,
  dollarBadges,
  netScale,
}: {
  m: Matrix;
  metric: LadderMetric;
  width: number;
  dollarBadges: boolean;
  /** The lane's ruler — see `netScales`. */
  netScale: number;
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
      <span className="tnum text-textPrimary">{cellMoney(netScale)}</span>
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
