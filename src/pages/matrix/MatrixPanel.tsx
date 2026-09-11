import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  badgeWords,
  buildMatrix,
  cellMoney,
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
  the call leg, and what they leave behind. Under every figure a micro-bar
  growing from the column's left edge, so a row can be read as numbers or as
  a shape without choosing in advance.

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
}

export default function MatrixPanel({ index, ticker, metric, focus, onClose, onTicker, onMetric, pulse }: Props) {
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
  const showSubtitle = width >= 620;

  const [hover, setHover] = useState<number | null>(null);
  const hovered = hover == null ? null : m.rows.find(r => r.strike === hover) ?? null;

  /*
    ══ SPOT IS CENTRED ONCE, NOT EVERY TICK ══════════════════════════════════

    The table opens with the money in the middle and is then the reader's.
    Re-centring on every tick would drag the rows out from under a pointer
    trying to read one — the same fault as chrome moving under the cursor
    that caused it.
  */
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const centred = useRef('');
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || m.rows.length === 0) return;
    const key = `${ticker}|${metric}`;
    if (centred.current === key) return;
    centred.current = key;
    const idx = m.rows.findIndex(r => r.strike <= m.spot);
    if (idx < 0) return;
    el.scrollTop = Math.max(0, idx * ROW_H - el.clientHeight / 2);
  }, [ticker, metric, m.rows, m.spot]);

  const change = spotChangePct(m.ticker);
  const up = change >= 0;
  const scale = m.scales[metric] ?? 1;
  const spotAfter = useMemo(() => m.rows.findIndex(r => r.strike <= m.spot), [m.rows, m.spot]);
  const onRow = useCallback((strike: number) => setHover(strike), []);

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
        {showSubtitle && (
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

      {/* ── this panel's family, and the one-line read of its book ──────── */}
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
        {/* THE KING LINE. The heaviest strike in the family on screen and its
            share of that family's book — the one-line read of a whole panel,
            and the first thing a reader scanning five of them lands on. */}
        <span data-matrix-king={index} className="ml-auto flex items-baseline gap-1.5 font-mono text-[9px]">
          <span className="uppercase tracking-[0.16em]" style={{ color: TAG_INK.pin }}>
            King
          </span>
          {m.king ? (
            <>
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
            </>
          ) : (
            <span className="text-textMuted">no book</span>
          )}
        </span>
      </div>

      {/* ── the two header rows: the family, then its three legs ────────── */}
      <div className="shrink-0 border-b border-borderSubtle">
        <div className="grid items-center" style={{ gridTemplateColumns: COLS }}>
          <span className="border-r border-borderSubtle px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-textMuted">
            Strike
          </span>
          <span
            className="col-span-3 py-1.5 text-center font-mono text-[10px]"
            title={`${metricName(metric)} — ${metricUnit(metric)}`}
          >
            {/* THE SHOCK IS PRINTED, NOT ASSUMED. "$520.8M of gamma" is not a
                claim until it says per what, and every board this was measured
                against leaves it out. */}
            <span className="font-semibold uppercase tracking-[0.2em] text-textSecondary">{metricLabel(metric)}</span>
            <span className="text-textMuted"> · {SHOCK[metric]}</span>
          </span>
          <span className="min-w-0 overflow-hidden whitespace-nowrap px-2 text-center font-mono text-[9px] uppercase tracking-[0.16em] text-textMuted">
            {showProfile ? 'the book' : ''}
          </span>
        </div>
        <div className="grid items-center" style={{ gridTemplateColumns: COLS }}>
          <span className="h-full border-r border-borderSubtle" />
          {(['put', 'call', 'net'] as const).map(leg => (
            <span
              key={leg}
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

      {/* ── the book ────────────────────────────────────────────────────── */}
      <div
        ref={bodyRef}
        data-matrix-body={index}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        onMouseLeave={() => setHover(null)}
      >
        {m.rows.map((r, i) => (
          <div key={r.strike}>
            {i === spotAfter && <SpotRule ticker={m.ticker} spot={m.spot} />}
            <Row
              row={r}
              metric={metric}
              scale={scale}
              focus={focus}
              star={r.strike === starStrike}
              hovered={hover === r.strike}
              profile={showProfile}
              onHover={onRow}
            />
          </div>
        ))}
        {spotAfter < 0 && m.rows.length > 0 && <SpotRule ticker={m.ticker} spot={m.spot} />}
      </div>

      {/* ── the foot: what a full bar means, or the hovered strike ───────
          ONE SLOT, SHARED. A readout that appeared as a new row would push
          the table down the instant the pointer crossed onto it — chrome
          moving under the cursor that caused it, which is the fault Terrain's
          readout row was built to avoid. */}
      <div className="h-[24px] shrink-0 border-t border-borderSubtle px-3" data-matrix-foot={index}>
        {hovered ? (
          <HoverRead row={hovered} metric={metric} total={m.totals[metric] ?? 0} />
        ) : (
          <ScaleRead m={m} metric={metric} />
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

/* ── the price, drawn through the whole table ────────────────────────────── */

function SpotRule({ ticker, spot }: { ticker: string; spot: number }) {
  return (
    <div data-matrix-spot className="flex h-[20px] items-center gap-1.5 px-3" aria-label={`spot ${spot.toFixed(2)}`}>
      <span aria-hidden className="h-px flex-1 bg-white/35" />
      <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-textMuted">{ticker}</span>
      <span className="rounded-[2px] bg-white px-1.5 font-mono text-[10px] font-bold tnum leading-[15px] text-[#0a0a0a]">
        {spot.toFixed(2)}
      </span>
    </div>
  );
}

/* ── one strike ──────────────────────────────────────────────────────────── */

function Row({
  row,
  metric,
  scale,
  focus,
  star,
  hovered,
  profile,
  onHover,
}: {
  row: MatrixRow;
  metric: LadderMetric;
  scale: number;
  focus: boolean;
  star: boolean;
  hovered: boolean;
  profile: boolean;
  onHover: (strike: number) => void;
}) {
  const dim = focus && !row.meaningful;
  const tag = row.tags[0];
  const c = row.cells[metric];
  /* The badge is gamma's. The other four families are computed live from the
     chain and no history of them is kept, so a badge there would look
     measured and not be — see DRIFT_METRICS. */
  const badge = DRIFT_METRICS.has(metric) ? badgeWords(row.drift?.m5 ?? null) : null;
  const dir = row.drift?.m5?.dir ?? 0;
  return (
    <div
      data-matrix-row={row.strike}
      data-meaningful={row.meaningful ? 'true' : 'false'}
      onMouseEnter={() => onHover(row.strike)}
      style={{ gridTemplateColumns: COLS, height: ROW_H, opacity: dim ? 0.28 : 1 }}
      className={`grid items-center transition-opacity ${
        hovered ? 'bg-white/[0.07]' : tag === 'pin' ? 'bg-white/[0.04]' : ''
      }`}
    >
      <span className="flex h-full items-center gap-1 overflow-hidden border-r border-borderSubtle px-3 font-mono text-[10px] tnum text-textMuted">
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
      <Cell v={c?.net ?? 0} scale={scale} ink={netInk(c?.net ?? 0)} strong badge={badge} dir={dir} />
      <Profile v={c?.net ?? 0} scale={scale} show={profile} />
    </div>
  );
}

/**
 * One figure, and the bar under it.
 *
 * The bar grows from the column's LEFT edge while the figure is right
 * aligned, which is the reference's arrangement: the numbers line up for
 * scanning down, and the bars line up for scanning across. A zero reading
 * draws nothing at all, which is the only honest width for it.
 *
 * Nothing in the cell may WRAP. The row's height is fixed, so a badge and a
 * figure that together outran the cell did not make the row taller — they
 * spilled over the row below it, which is what a `+$32.1M` beside a `$8.5M`
 * did at five panels wide before the net column was widened and this was
 * nailed to one line.
 */
function Cell({
  v,
  scale,
  ink,
  strong = false,
  badge = null,
  dir = 0,
}: {
  v: number;
  scale: number;
  ink: string;
  strong?: boolean;
  badge?: string | null;
  dir?: 1 | 0 | -1;
}) {
  const t = scale > 0 ? Math.min(1, Math.abs(v) / scale) : 0;
  return (
    <span className="flex h-full min-w-0 flex-col justify-center overflow-hidden px-3">
      <span className="flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap leading-none">
        {badge && (
          <span
            className="shrink-0 rounded-[2px] px-1 text-[8px] font-bold leading-[12px]"
            style={{
              background: dir > 0 ? 'rgba(48,209,88,0.85)' : dir < 0 ? 'rgba(255,59,48,0.85)' : 'rgba(130,130,130,0.7)',
              color: '#0a0a0a',
            }}
          >
            {badge}
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
      <span aria-hidden className="mt-[5px] h-[2px] w-full">
        <span
          className="block h-full rounded-full"
          style={{ width: `${(t * 100).toFixed(2)}%`, background: ink, opacity: strong ? 1 : 0.85 }}
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
 * Every micro-bar in the table grows from its own left edge, which makes a
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
    <span data-matrix-profile className="relative flex h-full min-w-0 items-center overflow-hidden px-2">
      <span aria-hidden className="absolute inset-y-[5px] left-1/2 w-px bg-white/12" />
      <span aria-hidden className="relative block h-[9px] w-full">
        <span
          data-matrix-bar
          className="absolute top-0 h-full rounded-[1px]"
          style={{
            width: `${(t * 50).toFixed(2)}%`,
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

function ScaleRead({ m, metric }: { m: Matrix; metric: LadderMetric }) {
  /* The hint names what a hover will actually give. On gamma that is the
     clock; on the other four there is no stored history to clock, and
     promising one would be a lie the reader discovers by hovering. */
  const hint = DRIFT_METRICS.has(metric) ? 'hover one for its clock' : 'hover one for its share of the book';
  return (
    <div className="flex h-full items-center gap-3 font-mono text-[9px]">
      <span className="uppercase tracking-[0.16em] text-textMuted">full bar</span>
      <span className="tnum text-textPrimary">{cellMoney(m.scales[metric] ?? 0)}</span>
      <span className="truncate text-textMuted">per {SHOCK[metric]}</span>
      <span className="ml-auto shrink-0 truncate tnum text-textMuted">
        {m.meaningfulCount}/{m.rows.length} strikes carry something · {hint}
      </span>
    </div>
  );
}

/**
 * The hovered strike's CLOCK.
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
          d == null ? 'text-textMuted' : d.dir > 0 ? 'text-bull' : d.dir < 0 ? 'text-bear' : 'text-textSecondary'
        }`}
      >
        {d == null ? '—' : badgeWords(d) ?? 'flat'}
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
        <span className="text-[8px] uppercase tracking-wider text-textMuted">{metricLabel(metric)} net</span>
        <span className="text-[9px] tnum" style={{ color: netInk(c?.net ?? 0) }}>
          {cellMoney(c?.net ?? 0)}
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
