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
import { MAX_ALERTS, armPrice, useAlerts } from './alertStore';
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

  THE BELL ARMS A PRICE, AND SAYS SO. A one-click alert at the level is the
  reason this is a tool rather than a table, but the level is a curve and
  curves move — an alert there is a PRICE alert at where the curve stands
  now, not a subscription to the flip. The footnote says exactly that. A
  button that quietly promised the second would be the most expensive kind of
  wrong on this desk.
*/

const PANEL_W = 400;
/* tf · glyph · held · the near edge · the far one. Fixed left, fluid right:
   the two edge cells are the only ones whose content varies in width. */
const COLS = '30px 12px 58px 1fr 1fr';

const inkFor = (s: TrendState | null): string =>
  s === 'up' ? 'text-bull' : s === 'down' ? 'text-bear' : 'text-textMuted';

/** `+0.42%` / `-0.19%` — a distance, so it never takes the bull/bear inks.
    Those mean price direction on this desk, and nothing has moved yet. */
const fmtMove = (m: number): string => `${m >= 0 ? '+' : ''}${(m * 100).toFixed(2)}%`;

const fmtPrice = (p: number): string =>
  p >= 1000 ? p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : p.toFixed(2);

/** The run, and — when there was one to see — the bar it started on. */
const rowTitle = (row: ConfluenceRow): string => {
  const base = trendWords(row);
  if (row.sinceTime === null || row.sincePrice === null) return base;
  return `${base} — since ${fmtStampLocal(row.sinceTime as UTCTimestamp)} at ${fmtPrice(row.sincePrice)}`;
};

/*
  THE GLYPH, UNDERLINED WHILE THE FLIP IS STILL NEWS.

  A mark rather than a colour, because the colour is already saying which way
  the row reads and a second meaning on the same channel would cost the first
  one. It is the same mark in the strip and in the panel, so the thing you
  noticed at a glance is the thing you find when you open it.
*/
const Glyph = ({ row }: { row: ConfluenceRow }) => (
  <span
    aria-hidden
    className={`font-mono text-[9px] leading-none ${inkFor(row.state)} ${
      isFreshFlip(row) ? 'border-b border-current pb-[1px]' : ''
    }`}
  >
    {row.state === null ? '–' : TREND_GLYPH[row.state]}
  </span>
);

interface StripProps {
  rows: ConfluenceRow[];
  form: 'full' | 'tight';
  /** Whose timeframes these are — the panel names it, and alerts are per pane. */
  ticker: string;
  /** Where the market is, which fixes which way an armed price is crossed. */
  spot: number;
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
export const ConfluenceStrip = ({ rows, form, ticker, spot }: StripProps) => {
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
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, anchorRef]);

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
          aria-label={`${ticker} timeframe flip levels`}
          style={{ position: 'fixed', ...placed.box }}
          className="z-[120] w-[400px] max-w-[calc(100vw-16px)] rounded-md border border-borderMuted bg-panel shadow-2xl shadow-black/60 overflow-y-auto overscroll-contain animate-slide-in"
        >
          <PanelHead rows={rows} ticker={ticker} />
          <div
            className="grid gap-x-2 px-2.5 pt-1.5 pb-1 font-mono text-[8px] uppercase tracking-[0.14em] text-textMuted"
            style={{ gridTemplateColumns: COLS }}
          >
            <span>TF</span>
            <span aria-hidden />
            <span title="How long this timeframe has read the same way. A + means it has read that way for every bar in view — the flip itself is further back than the data goes.">
              Held
            </span>
            <span title="The nearer of the two prices that change this row">Next</span>
            <span title="The far one — where the row reads the opposite way">Then</span>
          </div>
          {rows.map(r => (
            <FlipRow key={r.tf} row={r} ticker={ticker} spot={spot} />
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
    Up above both the EMA{CONFLUENCE_EMA} and the VWAP, down below both, flat between — so the
    levels are those two curves, read off the last bar. A bell arms a price alert AT that
    level; the curves move and the level with them.
  </div>
);

/** One timeframe: how it reads, how long it has, and its two edges. */
const FlipRow = ({ row, ticker, spot }: { row: ConfluenceRow; ticker: string; spot: number }) => {
  const edges = flipEdges(row);
  return (
    <div
      data-mtf-row={row.tf}
      title={rowTitle(row)}
      className="grid items-baseline gap-x-2 px-2.5 py-[3px] hover:bg-white/[0.03]"
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
          <EdgeCell edge={edges[0]} tf={row.tf} ticker={ticker} spot={spot} near />
          <EdgeCell edge={edges[1]} tf={row.tf} ticker={ticker} spot={spot} />
        </>
      )}
    </div>
  );
};

/** A price that changes the row, with the state it changes to and a bell. */
const EdgeCell = ({
  edge, tf, ticker, spot, near = false,
}: { edge?: FlipEdge; tf: Timeframe; ticker: string; spot: number; near?: boolean }) => {
  const alerts = useAlerts(ticker);
  const [refused, setRefused] = useState('');
  if (!edge) {
    /* The two curves on one price — one boundary, and the row crosses two
       states at once. There is no second edge to print, and a dash here says
       so rather than leaving a gap that reads as a bug. */
    return <span className="font-mono text-[10px] text-textMuted/40">—</span>;
  }
  const armed = alerts.some(a => a.kind === 'price' && Math.abs(a.price - edge.price) < 0.005);
  const full = alerts.length >= MAX_ALERTS;
  const label = flipWords(tf, edge);
  return (
    <span className="flex items-baseline gap-1 min-w-0" title={refused || label}>
      <span aria-hidden className={`font-mono text-[9px] leading-none ${inkFor(edge.to)}`}>
        {TREND_GLYPH[edge.to]}
      </span>
      <span className={`font-mono text-[10px] tnum ${near ? 'text-textPrimary' : 'text-textSecondary'}`}>
        {fmtPrice(edge.price)}
      </span>
      <span className="ml-auto font-mono text-[10px] tnum text-textMuted">{fmtMove(edge.move)}</span>
      <button
        onClick={() => {
          if (armed) { setRefused('Already watching that price'); return; }
          if (full) { setRefused(`${MAX_ALERTS} is the most one pane carries`); return; }
          setRefused(armPrice(ticker, edge.price, spot) ? '' : 'There is already an alert there');
        }}
        aria-label={`Alert at ${fmtPrice(edge.price)}, where ${label}`}
        className={`shrink-0 -my-0.5 inline-flex h-4 w-4 items-center justify-center rounded transition-colors ${
          armed ? 'cursor-default' : 'text-textMuted/50 hover:text-textPrimary hover:bg-white/[0.08]'
        }`}
        style={armed ? { color: ALERT } : undefined}
      >
        <Bell className="h-2.5 w-2.5" fill={armed ? 'currentColor' : 'none'} />
      </button>
    </span>
  );
};

export default ConfluenceStrip;
