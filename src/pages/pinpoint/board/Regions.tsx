import { memo, useLayoutEffect, useRef, useState } from 'react';
import { ROLE_WORDS, type WindowKey, type WindowRead } from '../../../data/pinpoint/board';
import type { Matrix, MatrixRow } from '../../../data/pinpoint/matrix';
import { CALL_LEG, PUT_LEG, ROLE_INK, money, signed } from './ink';
import type { Density } from './density';

/*
  Three regions, three jobs, and they are kept apart on purpose:

    the LADDER    where is the positioning
    the OVERLAY   what is changing
    the CARD      why does this strike matter

  Any one of them answering another's question is how a terminal turns into
  a dashboard — the same number in three places, none of them the one you
  wanted.
*/

/* ── what is changing ───────────────────────────────────────────────────── */

/**
 * The change overlay, which is also the window control.
 *
 * ══ THE READOUT AND THE PICKER ARE ONE THING ══════════════════════════════
 *
 * The window chips started in the header beside the expiry chips, and the
 * measurement killed it: at 330px the two groups plus a ticker and a close
 * button ran seventy pixels past the panel, onto the panel beside it. The
 * fix is not a smaller chip — it is noticing that this row ALREADY lists
 * every window, with its change next to it.
 *
 * So clicking `15m` here measures over fifteen minutes, and the row that is
 * lit is the one the ladder's scores are using. One control, showing its own
 * consequence. The header keeps the expiry, which is a different question,
 * and the two can no longer be confused for each other because they are no
 * longer in the same strip.
 *
 * ══ THE TERM STRUCTURE IS THE READING ══════════════════════════════════════
 *
 * A column of totals says "four hours moved more than one minute", which is
 * arithmetic. What a reader glancing over from a chart wants is whether the
 * last minute is moving FASTER than the last five — whether this is
 * something starting or something finishing. So every row carries its
 * per-minute rate against the window one step out, and the arrow is that
 * comparison rather than the sign of the change.
 *
 * It is deliberately not a chart. A sparkline here would answer the ladder's
 * question badly and this one not at all.
 */
function OverlayInner({
  reads,
  d,
  value,
  onPick,
}: {
  reads: WindowRead[];
  d: Density;
  value: WindowKey;
  onPick: (k: WindowKey) => void;
}) {
  /* Shortest first, and the long end is what goes — see `overlayWindows`. */
  /*
    ══ IT FITS ITSELF RATHER THAN BEING GUESSED AT ═══════════════════════════

    `overlayWindows` is an estimate from the measured width, and an estimate
    is what it can only ever be: an entry is a label, a figure and a mark,
    and the figure is `-$1.4B` on one book and `+$18M` on the next. The first
    cut picked a per-entry constant and the browser caught it — four entries
    at 330px, the last one twenty-nine pixels past the edge.

    So the estimate is the STARTING POINT and the element checks itself. One
    entry comes off per layout pass until the row fits, and the estimate
    going back up on a resize lets it grow again. No constant to get wrong,
    and it re-fits when a number changes width mid-session.
  */
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState(d.overlayWindows);
  useLayoutEffect(() => setFit(d.overlayWindows), [d.overlayWindows]);
  useLayoutEffect(() => {
    const el = rowRef.current;
    if (!el || d.overlay === 'column') return;
    if (el.scrollWidth > el.clientWidth + 1 && fit > 2) setFit(f => f - 1);
  });
  const room = d.overlay === 'column' ? d.overlayWindows : Math.min(fit, d.overlayWindows);
  const shown = reads.slice(0, room);
  /* NEVER HIDE THE SELECTED WINDOW. A control that does not show its own
     state is worse than a missing control. */
  if (!shown.some(r => r.key === value)) {
    const sel = reads.find(r => r.key === value);
    if (sel && shown.length > 0) shown[shown.length - 1] = sel;
  }
  if (d.overlay === 'column') {
    return (
      <div data-pp-overlay="column" className="flex flex-col">
        <Label d={d}>flow · net change</Label>
        {shown.map(r => (
          <button
            key={r.key}
            data-pp-window={r.key}
            aria-pressed={r.key === value}
            onClick={() => onPick(r.key)}
            title={`Measure change over ${r.label}`}
            className={`flex items-baseline gap-2 rounded px-1 py-[2px] text-left transition-colors ${
              r.key === value ? 'bg-white/[0.09]' : 'hover:bg-white/[0.05]'
            }`}
          >
            <span
              className="w-6 shrink-0 font-mono uppercase"
              style={{ fontSize: d.labelFont, color: r.key === value ? '#ededed' : '#7d7d7d' }}
            >
              {r.label}
            </span>
            <span
              className="flex-1 truncate text-right font-mono tnum"
              style={{ fontSize: d.chromeFont, color: r.covered ? tone(r.dir) : '#5a5a5a' }}
            >
              {r.covered ? signed(r.change) : '—'}
            </span>
            <Accel r={r} d={d} />
          </button>
        ))}
      </div>
    );
  }
  return (
    /* `min-w-0` and `overflow-hidden` are the backstop, not the plan. The
       count above is what makes it fit; this is what guarantees a
       mis-estimate CLIPS inside its own panel rather than escaping across
       the one beside it. */
    <div
      ref={rowRef}
      data-pp-overlay={d.overlay}
      data-pp-fit={shown.length}
      className="flex min-w-0 shrink items-center gap-3 overflow-hidden whitespace-nowrap"
    >
      <Label d={d}>flow</Label>
      {shown.map(r => (
        <button
          key={r.key}
          data-pp-window={r.key}
          aria-pressed={r.key === value}
          onClick={() => onPick(r.key)}
          title={`Measure change over ${r.label}`}
          className={`flex shrink-0 items-baseline gap-1 rounded px-1 transition-colors ${
            r.key === value ? 'bg-white/[0.09]' : 'hover:bg-white/[0.05]'
          }`}
        >
          <span
            className="font-mono uppercase"
            style={{ fontSize: d.labelFont, color: r.key === value ? '#ededed' : '#7d7d7d' }}
          >
            {r.label}
          </span>
          <span className="font-mono tnum" style={{ fontSize: d.chromeFont, color: r.covered ? tone(r.dir) : '#5a5a5a' }}>
            {r.covered ? signed(r.change) : '—'}
          </span>
          <Accel r={r} d={d} />
        </button>
      ))}
    </div>
  );
}

const tone = (dir: number) => (dir > 0 ? '#A855F7' : dir < 0 ? '#E8A33D' : '#a3a3a3');

/**
 * Speeding up, slowing down, or steady.
 *
 * Two marks rather than a number: the reader is being told a SHAPE, and a
 * second percentage here would compete with the one beside it. The chevron
 * is acceleration, never direction — direction is already carried by the
 * ink and the sign.
 */
function Accel({ r, d }: { r: WindowRead; d: Density }) {
  if (!r.covered || r.accel === 0) {
    return <span aria-hidden className="w-2 shrink-0 text-center text-textMuted/40" style={{ fontSize: d.labelFont }}>·</span>;
  }
  return (
    <span
      data-pp-accel={r.accel > 0 ? 'up' : 'down'}
      title={r.accel > 0 ? 'Faster than the next window out' : 'Slower than the next window out'}
      className="w-2 shrink-0 text-center"
      style={{ fontSize: d.labelFont, color: r.accel > 0 ? '#ededed' : '#6f6f6f' }}
    >
      {r.accel > 0 ? '»' : '«'}
    </span>
  );
}

/* ── which strikes are loaded ───────────────────────────────────────────── */

/**
 * The strikes the score ranked, best first.
 *
 * ══ THE BREAKDOWN IS WHY THE ROW IS HERE ══════════════════════════════════
 *
 * A ranked list with no working shown asks to be trusted. The four-segment
 * bar under each row is the row's own `parts` — gamma, flow, proximity,
 * urgency — at their weighted contributions, so the reader can see that this
 * strike is on the list because it is enormous and that one because it has
 * doubled in fifteen minutes. Two very different reasons to care, and a
 * single score cannot tell them apart.
 */
function LoadedInner({
  board,
  d,
  selected,
  onSelect,
}: {
  board: Matrix;
  d: Density;
  selected: number | null;
  onSelect: (s: number | null) => void;
}) {
  const rows = board.loaded.slice(0, d.loadedRows);
  if (rows.length === 0) return null;
  return (
    <div data-pp-loaded className="flex min-h-0 flex-col overflow-hidden">
      <Label d={d}>loaded strikes</Label>
      <div className="flex min-h-0 flex-col gap-[3px] overflow-y-auto">
        {rows.map((r, i) => (
          <button
            key={r.strike}
            data-pp-loaded-row={r.strike}
            onClick={() => onSelect(selected === r.strike ? null : r.strike)}
            className={`flex w-full flex-col gap-[3px] rounded px-1.5 py-1 text-left transition-colors ${
              selected === r.strike ? 'bg-white/[0.09]' : 'hover:bg-white/[0.05]'
            }`}
          >
            <span className="flex items-baseline gap-1.5 overflow-hidden whitespace-nowrap">
              {/*
                ══ THE RANK, NOT AN ADJECTIVE ════════════════════════════

                This was a HOT / WARM / FADE chip, and the list it led is
                ALREADY IN SCORE ORDER — so the chip was a five-bucket
                paraphrase printed on top of an exact ranking, and a reader
                comparing two rows marked WARM had no way to tell which of
                them the desk thought was the bigger deal.

                The position says it exactly and costs a character.
              */}
              <span
                className="w-3 shrink-0 text-right font-mono tnum text-textMuted"
                style={{ fontSize: d.labelFont }}
                aria-hidden
              >
                {i + 1}
              </span>
              <span className="shrink-0 font-mono font-semibold tnum text-textPrimary" style={{ fontSize: d.chromeFont + 1 }}>
                {r.strike}
              </span>
              <span
                className="shrink-0 font-mono tnum"
                style={{ fontSize: d.labelFont, color: (r.cells[board.families[0]]?.net ?? 0) >= 0 ? PUT_LEG : CALL_LEG }}
              >
                {money(r.cells[board.families[0]]?.net ?? 0)}
              </span>
              {r.role && (
                <span
                  className="ml-auto shrink-0 font-mono font-bold uppercase tracking-wider"
                  style={{ fontSize: d.labelFont, color: ROLE_INK[r.role] }}
                >
                  {ROLE_WORDS[r.role]}
                </span>
              )}
            </span>
            <Breakdown row={r} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** The four terms, at the widths they actually contributed. */
function Breakdown({ row }: { row: MatrixRow }) {
  const seg = [
    { k: 'gamma', v: row.parts.gamma * 0.38, c: '#4F8CFF' },
    { k: 'flow', v: row.parts.flow * 0.22, c: '#A855F7' },
    { k: 'proximity', v: row.parts.proximity * 0.24, c: '#E8A33D' },
    { k: 'urgency', v: row.parts.urgency * 0.16, c: '#FF7A45' },
  ];
  return (
    <span aria-hidden className="flex h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]">
      {seg.map(s => (
        <span key={s.k} style={{ width: `${(s.v * 100).toFixed(2)}%`, background: s.c }} />
      ))}
    </span>
  );
}

/* ── why this strike matters ────────────────────────────────────────────── */

/**
 * The selected strike.
 *
 * ══ ONLY WHAT ANSWERS "WHY" ═══════════════════════════════════════════════
 *
 * Every metric this desk holds for a strike would fill the panel and answer
 * nothing. What is here is the chain a reader actually follows: how much is
 * at this level, which way it puts dealers, whether it is growing, and what
 * sits between here and spot — because a wall five strikes away with nothing
 * in between behaves very differently from one with three levels stacked in
 * front of it.
 */
function CardInner({ board, row, d }: { board: Matrix; row: MatrixRow | null; d: Density }) {
  if (!row) {
    return (
      <div data-pp-card="empty" className="flex flex-col gap-1">
        <Label d={d}>strike detail</Label>
        <span className="font-mono text-textMuted" style={{ fontSize: d.chromeFont }}>
          Click a strike for its reading.
        </span>
      </div>
    );
  }

  /* What stands between spot and this level — the reason a far wall can be
     nearer than it looks, and a near one further. */
  const lead = board.families[0];
  const netOf = (r: MatrixRow) => r.cells[lead]?.net ?? 0;
  const between = board.rows
    .filter(r => (row.steps > 0 ? r.strike > board.spot && r.strike < row.strike : r.strike < board.spot && r.strike > row.strike))
    .reduce((t, r) => t + Math.abs(netOf(r)), 0);
  const cell = row.cells[lead];
  const net = cell?.net ?? 0;
  return (
    <div data-pp-card={row.strike} className="flex flex-col gap-1.5">
      <span className="flex items-baseline gap-2">
        <span className="font-mono font-semibold tnum text-textPrimary" style={{ fontSize: d.chromeFont + 5 }}>
          {row.strike}
        </span>
        <span className="font-mono text-textMuted" style={{ fontSize: d.labelFont }}>
          {row.steps >= 0 ? '+' : '-'}
          {Math.abs(row.steps).toFixed(1)} strikes
        </span>
        {row.role && (
          <span
            className="ml-auto rounded-[2px] px-1 font-mono font-bold uppercase tracking-wider"
            style={{ fontSize: d.labelFont, background: `${ROLE_INK[row.role]}22`, color: ROLE_INK[row.role] }}
          >
            {ROLE_WORDS[row.role]}
          </span>
        )}
      </span>

      <span className="flex flex-col">
        <span className="font-mono uppercase tracking-[0.16em] text-textMuted" style={{ fontSize: d.labelFont }}>
          net gamma
        </span>
        <span
          className="font-mono font-semibold tnum leading-none"
          style={{ fontSize: d.chromeFont + 9, color: net >= 0 ? PUT_LEG : CALL_LEG }}
        >
          {money(net)}
        </span>
      </span>

      <span className="font-mono uppercase tracking-[0.1em] text-textSecondary" style={{ fontSize: d.labelFont }}>
        {net >= 0 ? 'dealer short gamma · moves amplified' : 'dealer long gamma · moves damped'}
      </span>
      {row.changePct !== null && Math.abs(row.changePct) >= 1 && (
        <span
          className="font-mono uppercase tracking-[0.1em]"
          style={{ fontSize: d.labelFont, color: row.changePct >= 0 ? '#4F8CFF' : '#7d7d7d' }}
        >
          {row.changePct >= 0 ? '▲' : '▼'} {Math.abs(row.changePct).toFixed(0)}% over {board.lookback.label}
        </span>
      )}

      <span className="grid grid-cols-4 gap-1 border-t border-borderSubtle pt-1.5">
        <Cell d={d} k="C" v={cell?.call ?? 0} ink={CALL_LEG} />
        <Cell d={d} k="P" v={cell?.put ?? 0} ink={PUT_LEG} />
        <Cell d={d} k="DEX" v={row.cells.dex?.net ?? 0} />
        <Cell d={d} k="VEX" v={row.cells.vex?.net ?? 0} />
      </span>

      <span className="flex flex-col border-t border-borderSubtle pt-1.5">
        <span className="font-mono uppercase tracking-[0.14em] text-textMuted" style={{ fontSize: d.labelFont }}>
          between spot and {row.strike}
        </span>
        <span className="font-mono tnum text-textSecondary" style={{ fontSize: d.chromeFont }}>
          {money(between)} in the way · {row.share >= 0.001 ? `${(row.share * 100).toFixed(1)}%` : '<0.1%'} of the book
        </span>
      </span>
    </div>
  );
}

function Cell({ d, k, v, ink }: { d: Density; k: string; v: number; ink?: string }) {
  return (
    <span className="flex flex-col overflow-hidden">
      <span className="font-mono uppercase tracking-[0.1em] text-textMuted" style={{ fontSize: d.labelFont }}>
        {k}
      </span>
      <span className="truncate font-mono tnum" style={{ fontSize: d.chromeFont, color: ink ?? '#a3a3a3' }}>
        {money(v)}
      </span>
    </span>
  );
}

function Label({ d, children }: { d: Density; children: React.ReactNode }) {
  return (
    <span
      className="mb-0.5 shrink-0 font-mono uppercase tracking-[0.18em] text-textMuted"
      style={{ fontSize: d.labelFont }}
    >
      {children}
    </span>
  );
}

export const Overlay = memo(OverlayInner);
export const Loaded = memo(LoadedInner);
export const StrikeCard = memo(CardInner);
