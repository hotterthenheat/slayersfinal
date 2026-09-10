import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell } from 'lucide-react';
import {
  CONFLUENCE_EMA, TREND_GLYPH, confluenceTally, flipEdges, flipWords, heldWords,
  isFreshFlip, nearestFlip, trendWords,
  type ConfluenceRow, type FlipEdge, type TrendState,
} from '../../data/confluence';
import type { Timeframe } from '../../data/timeframe';
import type { UTCTimestamp } from 'lightweight-charts';
import { MAX_ALERTS, armMtf, useAlerts } from './alertStore';
import { ALERT } from './palette';
import { fmtStampLocal } from './chartTime';
import { useAnchoredMenu } from '../ui/useAnchoredMenu';

/*
==================================================
  SLAYER TERMINAL - WHEN THE TIMEFRAMES FLIP
  (gex/ConfluencePanel.tsx)

  The strip says whether they agree. This says what
  would change that, and what it would cost.
==================================================

  THE QUESTION THE STRIP COULD NOT ANSWER.

  T-12 put five glyphs in the identity row and they earned their width: one
  glance and you know whether the day is of one mind. But every reader's next
  question was the same, and the desk had no answer to it — WHERE IS THE LINE.
  The honest thing a reader could do was open a 5m pane, put an EMA21 and a
  VWAP on it, and eyeball which was higher. That is a minute of work for a
  number the strip already knows.

  IT IS READ OFF, NOT PREDICTED. There is no model here and nothing tunable.
  The state is "above both curves / below both / between", so the prices that
  change the state ARE the two curves — see data/confluence.ts, where the
  arithmetic lives so that a proof can hold it to the same rule the glyph
  comes from. Nothing on this panel can drift away from the letter beside it,
  because there is no second rule to drift.

  NEAREST FIRST, ALWAYS. The two edges are laid out in the order price would
  reach them rather than in a fixed up/down order, so the left-hand column is
  always the next thing that happens and the timeframes can be ranked down it
  by eye. Fixed columns would have put the near edge on the left for an `up`
  row and on the right for a `down` one, and made the reader check which.

  THE BELL WATCHES THE ROW, NOT EITHER PRICE UNDER IT — see WatchBell at the
  foot of this file for why the first build of it was wrong.

  This paragraph used to say the opposite, in as many words: that the bell
  armed a PRICE alert and was "not a subscription to the flip". That had been
  true, and then the bells were replaced and this was not, so the file's own
  doctrine block spent a commit contradicting its code. It is worth naming
  because the note on DataWindow warns about exactly this failure — a comment
  that says what was intended rather than what is there is how a wrong
  arrangement survives — and it happened here anyway, one file later.
*/

/*
  440, AND THE FIGURE IS MEASURED RATHER THAN CHOSEN.

  At 400 with the curve named beside each price, the near cell's bell walked
  into the far cell's glyph and the far cell's bell left the panel entirely —
  screenshotted, not guessed. A cell holds a glyph, a price of up to eight
  characters, a tag, a signed percent and a bell: 148px at the widest price
  this desk quotes, and there are two of them.
*/
const PANEL_W = 440;
/* tf · glyph · held · the near edge · the far one. Fixed left, fluid right:
   the two edge cells are the only ones whose content varies in width. */
const COLS = '26px 11px 52px 1fr 1fr 16px';

/** The desk's attention ink — see Glyph on why a flip's mark is not red or
    green. Same token the selection and the editor's caret use. */
const FRESH_INK = '#D2FF00';

const inkFor = (s: TrendState | null): string =>
  s === 'up' ? 'text-bull' : s === 'down' ? 'text-bear' : 'text-textMuted';

/*
  `+0.42%` / `-0.19%` — a distance, so it never takes the bull/bear inks.
  Those mean price direction on this desk, and nothing has moved yet.

  NO SIGN ON A DISTANCE THAT ROUNDS TO NOTHING. `+0.00%` claims a side price
  is not on, and the tape sits exactly on the session VWAP often enough that
  four rows can print it at once.
*/
const fmtMove = (m: number): string => {
  const pct = m * 100;
  return Math.abs(pct) < 0.005 ? '0.00%' : `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`;
};

/** The line a level IS. `EMA21` and `VWAP` are the rule's own words. */
const CURVE_TAG: Record<FlipEdge['curve'], string> = {
  ema: `EMA${CONFLUENCE_EMA}`,
  vwap: 'VWAP',
  both: 'both',
};

const fmtPrice = (p: number): string =>
  p >= 1000 ? p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : p.toFixed(2);

/** The run, and — when there was one to see — the bar it started on. */
const rowTitle = (row: ConfluenceRow): string => {
  const base = trendWords(row);
  if (row.sinceTime === null || row.sincePrice === null) return base;
  return `${base} — since ${fmtStampLocal(row.sinceTime as UTCTimestamp)} at ${fmtPrice(row.sincePrice)}`;
};

/*
  THE GLYPH, WITH A DOT ON IT WHILE THE FLIP IS STILL NEWS.

  A MARK, NOT A COLOUR, because the colour is already saying which way the row
  reads and a second meaning on the same channel would cost the first one. The
  same mark in the strip and in the panel, so the thing you notice at a glance
  is the thing you find when you open it.

  IT WAS AN UNDERLINE AND THAT WAS THE WRONG MARK. Screenshotted at 2x: under
  a green triangle it read fine, and under the FLAT glyph — which is itself a
  horizontal bar — it read as a slightly thicker dash. The rows most likely to
  be fresh are the ones sitting on a curve, which are exactly the flat ones,
  so the mark was missing precisely where it was needed.

  The dot is the desk's attention ink rather than a bull or bear one, and
  deliberately: a flip's DIRECTION is already the glyph it sits on, and this
  says only that it is new. It is positioned absolutely, so a strip whose
  width budget is already spent (MTF_FULL_PX) does not grow when one appears.
*/
const Glyph = ({ row }: { row: ConfluenceRow }) => (
  <span aria-hidden className={`relative inline-flex font-mono text-[9px] leading-none ${inkFor(row.state)}`}>
    {row.state === null ? '–' : TREND_GLYPH[row.state]}
    {isFreshFlip(row) && (
      <span
        /* CENTRED ABOVE, not off the corner. At the corner the dot fell into
           the 6px gap between one timeframe and the next and read as
           belonging to the one after it — measured on the strip at 2x, where
           "1m ▲ •" and "• 5m" are the same pixels. Above the glyph it can
           only be about that glyph. */
        className="absolute -top-[3px] left-1/2 -translate-x-1/2 h-[3px] w-[3px] rounded-full"
        style={{ background: FRESH_INK }}
      />
    )}
  </span>
);

interface StripProps {
  rows: ConfluenceRow[];
  form: 'full' | 'tight';
  /** Whose timeframes these are — the panel names it, and alerts are per pane. */
  ticker: string;
}

/*
  THE TIMEFRAMES, AND WHETHER THEY AGREE — T-12.

  BULL AND BEAR INK, deliberately, and it is the one place on this desk where
  that is not a violation: the house rule is "red/green is price direction
  only", and price direction is exactly what these arrows are. Nothing here
  touches the dealer palette.

  ONE TRIGGER, NOT FIVE. The whole strip is a single button with one title and
  one accessible name — five tooltips on five 20px targets is five things to
  hover, and in the tight form the labels are the only way to know which is
  which. The per-row detail is what the panel is for.

  IT COSTS NO WIDTH TO BE A BUTTON. The negative margin is cancelled by the
  padding, so the hover surface grows and the measured strip does not — the
  identity row's width budget (MTF_FULL_PX) was set against this content and
  a button that grew it would have shed the change-percent beside it.
*/
export const ConfluenceStrip = ({ rows, form, ticker }: StripProps) => {
  const [open, setOpen] = useState(false);
  const { anchorRef, placed } = useAnchoredMenu<HTMLButtonElement>(open, 'bottom', PANEL_W);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const words = rows.map(trendWords).join(' · ');
  const near = nearestFlip(rows);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    /* Window-CAPTURE, and it stops the key going further — the desk collapses
       an expanded pane on the same Escape, and both listeners are on window.
       The innermost thing open gets the key. Same contract as CompareControl. */
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      /* Back where it came from — Escape inside a panel that took focus
         would otherwise drop a keyboard reader at the top of the document. */
      anchorRef.current?.focus();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, anchorRef]);

  /*
    THE PANEL TAKES FOCUS, AND HANDS IT BACK.

    Ten bells live in here and every one of them arms something. Without this
    the next Tab after opening lands on whatever the pane had next — behind a
    panel that is covering it — which is the same defect the compare menu was
    fixed for. Focus goes to the dialog rather than to the first bell, so a
    reader arrives at the top of it and Tab walks the levels in order.
  */
  useEffect(() => {
    if (open && placed) menuRef.current?.focus();
  }, [open, placed]);

  return (
    <>
      <button
        ref={anchorRef}
        data-mtf-strip
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={`${words}${near ? ` — nearest: ${flipWords(near.tf, near.edge)}` : ''}\nClick for the prices that change them`}
        aria-label={`Timeframe trend — ${words}. Open the flip levels`}
        className={`shrink-0 -mx-1 px-1 py-0.5 rounded inline-flex items-center gap-1.5 transition-colors hover:bg-white/[0.06] ${
          open ? 'bg-white/[0.08]' : ''
        }`}
      >
        {rows.map(r => (
          <span key={r.tf} className="inline-flex items-baseline gap-0.5">
            {form === 'full' && <span className="font-mono text-[9px] text-textMuted">{r.tf}</span>}
            {/* A timeframe with too little history gets a dash, never a bar —
                "no view" and "flat" are different claims (data/confluence.ts). */}
            <Glyph row={r} />
          </span>
        ))}
      </button>

      {open && placed && createPortal(
        <div
          ref={menuRef}
          role="dialog"
          tabIndex={-1}
          aria-label={`${ticker} timeframe flip levels`}
          style={{ position: 'fixed', ...placed.box }}
          className="z-[120] w-[440px] max-w-[calc(100vw-16px)] rounded-md border border-borderMuted bg-panel shadow-2xl shadow-black/60 overflow-y-auto overscroll-contain animate-slide-in outline-none"
        >
          <PanelHead rows={rows} ticker={ticker} />
          <div
            className="grid gap-x-1.5 px-2.5 pt-1.5 pb-1 font-mono text-[8px] uppercase tracking-[0.14em] text-textMuted"
            style={{ gridTemplateColumns: COLS }}
          >
            <span>TF</span>
            <span aria-hidden />
            <span title="How long this timeframe has read the same way. A + means it has read that way for every bar in view — the flip itself is further back than the data goes.">
              Held
            </span>
            <span title="The nearer of the two prices that change this row">Next</span>
            <span title="The far one — where the row reads the opposite way">Then</span>
            <span className="sr-only">Watch</span>
          </div>
          {rows.map(r => (
            <FlipRow key={r.tf} row={r} ticker={ticker} />
          ))}
          <PanelFoot />
        </div>,
        document.body
      )}
    </>
  );
};

/** The tally, and the one line worth reading first. */
const PanelHead = ({ rows, ticker }: { rows: ConfluenceRow[]; ticker: string }) => {
  const t = confluenceTally(rows);
  const near = nearestFlip(rows);
  const count = (n: number, s: TrendState | null, glyph: string) => (
    <span className={`inline-flex items-baseline gap-0.5 ${n === 0 ? 'text-textMuted/40' : inkFor(s)}`}>
      <span className="tnum">{n}</span>
      <span aria-hidden className="text-[9px]">{glyph}</span>
    </span>
  );
  return (
    <div className="border-b border-borderSubtle px-2.5 py-2">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-textMuted">Timeframes</span>
        <span className="ml-auto font-mono text-[10px] font-semibold text-textPrimary">{ticker}</span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-2.5 font-mono text-[10px]">
        {count(t.up, 'up', TREND_GLYPH.up)}
        {count(t.flat, 'flat', TREND_GLYPH.flat)}
        {count(t.down, 'down', TREND_GLYPH.down)}
        {t.none > 0 && count(t.none, null, '–')}
      </div>
      {/*
        THE HEADLINE IS THE NEAREST FLIP, because on a strip of five the useful
        fact is rarely "they agree" — it is which one is about to stop agreeing.
      */}
      <div className="mt-1.5 font-mono text-[10px] leading-[14px]">
        {near ? (
          <>
            <span className="uppercase tracking-[0.14em] text-[8px] text-textMuted">Nearest </span>
            <span className="text-textPrimary">{flipWords(near.tf, near.edge)}</span>
          </>
        ) : (
          <span className="text-textMuted">No timeframe has the bars to have a view yet.</span>
        )}
      </div>
    </div>
  );
};

const PanelFoot = () => (
  <div className="border-t border-borderSubtle px-2.5 py-1.5 font-mono text-[9px] leading-[13px] text-textMuted">
    Up above both the EMA{CONFLUENCE_EMA} and the VWAP, down below both, flat between — so
    every level here is one of those two lines, on the last bar. A bell watches the ROW: it
    fires when that timeframe turns the other way, whatever the curves do to get there.
  </div>
);

/** One timeframe: how it reads, how long it has, and its two edges. */
/** One timeframe: how it reads, how long it has, its two edges, and a bell
    that watches the READING rather than either of the prices under it. */
const FlipRow = ({ row, ticker }: { row: ConfluenceRow; ticker: string }) => {
  const edges = flipEdges(row);
  return (
    <div
      data-mtf-row={row.tf}
      title={rowTitle(row)}
      className="grid items-baseline gap-x-1.5 px-2.5 py-[3px] hover:bg-white/[0.03]"
      style={{ gridTemplateColumns: COLS }}
    >
      <span className="font-mono text-[10px] text-textSecondary">{row.tf}</span>
      <Glyph row={row} />
      {row.state === null ? (
        <span className="col-span-3 font-mono text-[10px] text-textMuted">
          only {row.bars} bar{row.bars === 1 ? '' : 's'} — no view yet
        </span>
      ) : (
        <>
          <span className="font-mono text-[10px] tnum text-textSecondary" title={heldWords(row)}>
            {row.heldBars}
            {/* Not a flip anybody could have watched — see `flippedInView`. */}
            {!row.flippedInView && <span className="text-textMuted">+</span>}
            <span className="text-textMuted"> bar{row.heldBars === 1 ? '' : 's'}</span>
          </span>
          <EdgeCell edge={edges[0]} near />
          <EdgeCell edge={edges[1]} />
        </>
      )}
      <WatchBell row={row} ticker={ticker} />
    </div>
  );
};

/** A price that changes the row, with the state it changes to. */
const EdgeCell = ({ edge, near = false }: { edge?: FlipEdge; near?: boolean }) => {
  if (!edge) {
    /* The two curves on one price — one boundary, and the row crosses two
       states at once. There is no second edge to print, and a dash here says
       so rather than leaving a gap that reads as a bug. */
    return <span className="font-mono text-[10px] text-textMuted/40">—</span>;
  }
  return (
    <span className="flex items-baseline gap-1 min-w-0">
      <span aria-hidden className={`font-mono text-[9px] leading-none ${inkFor(edge.to)}`}>
        {TREND_GLYPH[edge.to]}
      </span>
      <span className={`font-mono text-[10px] tnum ${near ? 'text-textPrimary' : 'text-textSecondary'}`}>
        {fmtPrice(edge.price)}
      </span>
      {/* WHICH LINE IT IS, in the space the cell already had. Today's session
          VWAP is one number however the bars are cut, so four rows print it
          and without this they read as a bug rather than as the point. */}
      <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-textMuted/70">
        {CURVE_TAG[edge.curve]}
      </span>
      <span className="ml-auto font-mono text-[10px] tnum text-textMuted">{fmtMove(edge.move)}</span>
    </span>
  );
};

/*
  ONE BELL PER ROW, AND IT WATCHES THE ROW.

  There were two, one on each price, and they armed PRICE alerts. That was
  the obvious thing to build and it was the wrong thing: the level is a
  curve. An alert at 500.45 because the VWAP was there when you pressed it
  fires on a number that, by the time price arrives, is not the VWAP and is
  not anything — and the panel had to carry a footnote apologising for it.

  This arms the reading instead (alertStore, MtfAlert). Armed at up, it
  fires when the row reads down, whatever either curve did on the way. The
  prices stay on the page because they are what a reader puts an order at;
  they are simply no longer pretending to be an alert.
*/
const WatchBell = ({ row, ticker }: { row: ConfluenceRow; ticker: string }) => {
  const alerts = useAlerts(ticker);
  const [refused, setRefused] = useState('');
  const armed = alerts.find(a => a.kind === 'mtf' && a.tf === row.tf);
  const full = alerts.length >= MAX_ALERTS;
  const what = armed
    ? `Watching the ${row.tf} — it fires when the row turns the other way`
    : `Alert when the ${row.tf} turns${row.state ? ` off ${row.state}` : ''}`;
  return (
    <button
      data-mtf-watch={row.tf}
      aria-pressed={!!armed}
      onClick={() => {
        if (armed) { setRefused('Already watching that timeframe'); return; }
        if (full) { setRefused(`${MAX_ALERTS} is the most one pane carries`); return; }
        setRefused(armMtf(ticker, row.tf) ? '' : 'Already watching that timeframe');
      }}
      title={refused || what}
      aria-label={what}
      className={`shrink-0 -my-0.5 inline-flex h-4 w-4 items-center justify-center rounded transition-colors ${
        armed ? 'cursor-default' : 'text-textMuted/50 hover:text-textPrimary hover:bg-white/[0.08]'
      }`}
      style={armed ? { color: ALERT } : undefined}
    >
      <Bell className="h-2.5 w-2.5" fill={armed ? 'currentColor' : 'none'} />
    </button>
  );
};

export default ConfluenceStrip;
