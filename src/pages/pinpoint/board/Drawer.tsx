import { memo, useCallback, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { ROLE_WORDS, WINDOWS, type WindowKey } from '../../../data/pinpoint/board';
import { asLevels, type Matrix, type MatrixRow } from '../../../data/pinpoint/matrix';
import type { StreamEvent } from '../../../data/pinpoint/stream';
import {
  SECTIONS,
  SECTION_TITLES,
  SECTION_WORDS,
  type Extras,
  type SectionKey,
} from '../../../data/pinpoint/extras';
import { CALL_LEG, PUT_LEG, ROLE_INK, money, signed } from './ink';
import { ROW, Segmented } from '../../../components/pinpoint/Desk';
import Chip from '../../../components/ui/Chip';

/*
==================================================
  SLAYER TERMINAL - THE PANEL'S SIDE PANE
  (pages/pinpoint/board/Drawer.tsx)
==================================================

  ══ WHAT IT IS ═════════════════════════════════════════════════════════════

  Noah: "i just like the side pane thing to show important info like the
  loaded strikes how many of them xyz and all other info you think is
  necessary ... i like the bit blurry transparent thing ... make sure you
  can add and remove it and make sure the typography is very good and
  readable."

  A pane that floats out of the pane's right edge, translucent and blurred
  over the lane, holding the readings that are about the BOOK and about ONE
  STRIKE rather than about every row — the things a column is the wrong
  shape for.

  ══ SECTIONS, AND THE READER CHOOSES THEM ══════════════════════════════════

  Nine, each a reading an engine in this repo already makes, each a chip in
  the row under the head. On by default: the book, the shortlist, the
  pointed strike, the expected move, vol, and what moved. Available: the
  session's gamma series and percentile, today's session prices, and the
  pins. A chip that is off is a section that is not drawn, not a section
  that is drawn empty — the pane is exactly as tall as what the reader
  asked for. See data/pinpoint/extras.ts for what each one reads.

  ══ THE TYPE ═══════════════════════════════════════════════════════════════

  Three sizes and they are the whole scale: 10px for a label, 12px for a
  figure or a line, 20px for the one figure a section leads with. Labels at
  55% white, lines at 78%, figures at 92% — the first cut ran 9px labels at
  45%, which is a legend, not a reading. Mono for anything with digits,
  the sans for a sentence.
*/

export interface PaneProps {
  board: Matrix;
  extras: Extras;
  /** The strike under the pointer, or the one the reader clicked. */
  pointed: MatrixRow | null;
  stream: StreamEvent[];
  lookback: WindowKey;
  sections: readonly SectionKey[];
  onLookback: (k: WindowKey) => void;
  onSections: (next: SectionKey[]) => void;
  onPoint: (strike: number | null) => void;
  onClose: () => void;
  width: number;
  /** Set when the pane sits beside the table and may be dragged; absent
      for a peek, which takes the body whole. Null resets to the opening
      width. */
  onResize?: (w: number | null) => void;
  bounds?: { min: number; max: number };
}

/** The keyboard's step on the grip. */
const GRIP_STEP = 16;

function PaneInner({ board, extras, pointed, stream, lookback, sections, onLookback, onSections, onPoint, onClose, width, onResize, bounds }: PaneProps) {
  const lead = board.families[0];
  const on = new Set(sections);
  const toggle = (k: SectionKey) => onSections(on.has(k) ? sections.filter(s => s !== k) : [...sections, k]);
  /* Drawn in the canonical order whatever order they were switched on in,
     so two panels with the same sections look the same. */
  const drawn = SECTIONS.filter(k => on.has(k));

  /*
    ══ THE GRIP ════════════════════════════════════════════════════════════

    Noah: "let people be able to customize how big the slide screener is,
    some people may want it smaller."

    The pane's table edge is a grip. While it is dragged the width is held
    HERE and painted directly, and the desk is told once, on release — a
    stored board rewritten sixty times a second for a drag is a lot of
    storage traffic for one gesture. The range is the panel's (`bounds`):
    the pane never covers the strike or its net, however far it is pulled.
    Double-click puts the opening width back. From the keyboard the grip is
    a focusable separator: ← / ↑ wider, → / ↓ narrower, Home the narrowest,
    End the widest.
  */
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [dragW, setDragW] = useState<number | null>(null);
  const clampW = useCallback((w: number) => (bounds ? Math.max(bounds.min, Math.min(bounds.max, Math.round(w))) : Math.round(w)), [bounds]);
  const onGripDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!onResize || !bounds || e.button !== 0) return;
      e.preventDefault();
      const rect = rootRef.current?.getBoundingClientRect();
      const right = rect?.right ?? e.clientX + width;
      /* Where on the grip it was grabbed, so the edge follows the pointer
         by exactly the distance moved rather than snapping to it. */
      const grab = e.clientX - (rect?.left ?? e.clientX);
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      let last = width;
      const move = (ev: PointerEvent) => {
        last = clampW(right - (ev.clientX - grab));
        setDragW(last);
      };
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        setDragW(null);
        if (last !== width) onResize(last);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    },
    [onResize, bounds, width, clampW]
  );
  const onGripKey = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!onResize || !bounds) return;
      const next =
        e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? width + GRIP_STEP
          : e.key === 'ArrowRight' || e.key === 'ArrowDown'
            ? width - GRIP_STEP
            : e.key === 'Home'
              ? bounds.min
              : e.key === 'End'
                ? bounds.max
                : null;
      if (next == null) return;
      e.preventDefault();
      onResize(clampW(next));
    },
    [onResize, bounds, width, clampW]
  );
  const shownW = dragW ?? width;
  /* Under this every grid in the pane reflows to fewer columns and the
     shortlist head wraps — see DRAWER_MIN_W in density.ts for the width
     at which that was measured to leave nothing cut. */
  const narrow = shownW < 340;

  return (
    <div
      ref={rootRef}
      data-pp-overlay-panel
      data-pp-pane-w={shownW}
      data-pp-pane-narrow={narrow ? 'true' : undefined}
      role="region"
      aria-label={`${board.ticker} book and strikes`}
      className={`absolute inset-y-2 right-2 z-20 flex animate-[pp-slide-in_.22s_cubic-bezier(.2,.7,.2,1)] flex-col overflow-hidden rounded-xl border border-white/[0.09] bg-[#0b0b10]/[0.84] shadow-2xl shadow-black/60 backdrop-blur-md motion-reduce:animate-none ${
        dragW != null ? 'select-none' : ''
      }`}
      style={{ width: shownW }}
    >
      {onResize && bounds && (
        <div
          data-pp-grip
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the pane"
          aria-valuemin={bounds.min}
          aria-valuemax={bounds.max}
          aria-valuenow={shownW}
          tabIndex={0}
          title="Drag to resize · double-click for the opening width · ← → from the keyboard"
          onPointerDown={onGripDown}
          onDoubleClick={() => onResize(null)}
          onKeyDown={onGripKey}
          className="group/grip absolute inset-y-0 left-0 z-10 flex w-2 cursor-ew-resize items-center justify-center outline-none focus-visible:bg-white/[0.06]"
        >
          <span
            aria-hidden
            className={`h-10 w-[3px] rounded-full transition-colors ${
              dragW != null ? 'bg-white/70' : 'bg-white/20 group-hover/grip:bg-white/55'
            }`}
          />
        </div>
      )}
      {/* ── head ──────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] px-3 py-2">
        <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.1em] text-white/90">{board.ticker}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/55">
          {lead} · {board.expiry.label}
        </span>
        {/* The Modal's close — the one every dialog on the terminal wears. */}
        <button
          onClick={onClose}
          aria-label="Close"
          title="Close the pane — Esc"
          className="-m-1 ml-auto rounded p-1 text-textMuted transition-colors hover:bg-white/[0.05] hover:text-textPrimary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── the sections, as chips — add and remove ───────────────────── */}
      <div
        data-pp-sections={drawn.length}
        role="group"
        aria-label="Sections"
        className="flex shrink-0 flex-wrap items-center gap-1 border-b border-white/[0.07] px-3 py-2"
      >
        {/* The kit's Chip — "the house idiom for compact selectors that
            sit inside a panel's own toolbar", which is what these are. */}
        {SECTIONS.map(k => (
          <Chip key={k} data-pp-section={k} active={on.has(k)} onClick={() => toggle(k)} title={SECTION_TITLES[k]}>
            {SECTION_WORDS[k].toUpperCase()}
          </Chip>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-3 [scrollbar-width:thin]">
        {drawn.length === 0 && (
          <span className="py-4 text-[12px] leading-relaxed text-white/50">Every section is off. Switch one on above.</span>
        )}
        {drawn.map(k => (
          <Section key={k} k={k} board={board} extras={extras} pointed={pointed} stream={stream} lookback={lookback} onLookback={onLookback} onPoint={onPoint} narrow={narrow} />
        ))}
      </div>

      {/* ── foot ──────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-2 border-t border-white/[0.07] px-3 py-1.5 font-mono text-[10px] text-white/50">
        <span className="truncate">
          {dragW != null
            ? `${dragW}px wide${bounds && dragW === bounds.min ? ' · narrowest' : bounds && dragW === bounds.max ? ' · widest' : ''}`
            : pointed
              ? `${pointed.strike} · ${pointed.steps >= 0 ? '+' : '−'}${Math.abs(pointed.steps).toFixed(1)} from spot`
              : `${board.window.strikes} of ${board.window.chain} strikes drawn`}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 uppercase tracking-[0.12em]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#5BE07A]" aria-hidden />
          live · {clock(board.builtAt)}
        </span>
      </div>
    </div>
  );
}

/* ── one section ────────────────────────────────────────────────────────── */

function Section({
  k,
  board,
  extras,
  narrow,
  pointed,
  stream,
  lookback,
  onLookback,
  onPoint,
}: {
  k: SectionKey;
  board: Matrix;
  extras: Extras;
  pointed: MatrixRow | null;
  stream: StreamEvent[];
  lookback: WindowKey;
  onLookback: (k: WindowKey) => void;
  onPoint: (strike: number | null) => void;
  /** The pane is at its narrow cut — grids go to one column. */
  narrow: boolean;
}) {
  const lead = board.families[0];
  switch (k) {
    case 'book':
      return <Book board={board} narrow={narrow} />;
    case 'loaded':
      return <Loaded board={board} pointed={pointed} lookback={lookback} onLookback={onLookback} onPoint={onPoint} />;
    case 'strike':
      return (
        <section data-pp-card={pointed ? pointed.strike : 'empty'} className="flex flex-col gap-2">
          {pointed ? (
            <Strike board={board} row={pointed} narrow={narrow} />
          ) : (
            <>
              <Label>the strike</Label>
              <span className="text-[12px] leading-relaxed text-white/50">
                Point at a row, or click one above. Its legs, its greeks and what it has done over every window come here.
              </span>
            </>
          )}
        </section>
      );
    case 'move':
      return <Move board={board} m={extras.move} narrow={narrow} />;
    case 'vol':
      return <Vol v={extras.vol} lead={lead} narrow={narrow} />;
    case 'session':
      return <Session s={extras.session} lead={lead} narrow={narrow} />;
    case 'levels':
      return <Levels l={extras.levels} board={board} narrow={narrow} />;
    case 'pins':
      return <Pins p={extras.pins} board={board} narrow={narrow} />;
    case 'recent':
      return <Recent stream={stream} onPoint={onPoint} />;
  }
}

/* ── the book ───────────────────────────────────────────────────────────── */

function Book({ board, narrow }: { board: Matrix; narrow: boolean }) {
  const lead = board.families[0];
  const book = board.books[lead];
  const L = asLevels(board.landmarks, board.spot);
  const at = (strike: number) => (Number.isFinite(strike) ? board.rows.find(r => r.strike === strike) : undefined);
  if (!book) return null;
  return (
    <section data-pp-book className="flex flex-col gap-2">
      <Label>the book</Label>
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono text-[20px] font-semibold leading-none tnum" style={{ color: book.net >= 0 ? PUT_LEG : CALL_LEG }}>
          {money(book.net)}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/55">
          net {lead} · {book.net >= 0 ? 'put-dominant' : 'call-dominant'}
          {lead === 'gex' && (book.net >= 0 ? ' · amplifying' : ' · damping')}
        </span>
      </span>
      <div className={`grid gap-x-3 gap-y-1.5 ${narrow ? 'grid-cols-1' : 'grid-cols-2'}`}>
        <Level word="pin" strike={L.supreme} row={at(L.supreme)} lead={lead} />
        <Level word="flip" strike={L.flip} row={undefined} lead={lead} spot={board.spot} />
        <Level word="put wall" strike={L.putWall} row={at(L.putWall)} lead={lead} />
        <Level word="call wall" strike={L.callWall} row={at(L.callWall)} lead={lead} />
      </div>
    </section>
  );
}

/** One named level — the word, the strike, the net. */
function Level({ word, strike, row, lead, spot }: { word: string; strike: number; row: MatrixRow | undefined; lead: Matrix['families'][number]; spot?: number }) {
  const has = Number.isFinite(strike);
  const net = row?.cells[lead]?.net;
  return (
    <span className="flex items-baseline gap-1.5 overflow-hidden whitespace-nowrap">
      {/* Wide enough for CALL WALL — at 56px the strike ran into the word. */}
      <span className="w-[66px] shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-white/55">{word}</span>
      {has ? (
        <>
          <span className="font-mono text-[13px] font-semibold tnum text-white/92">{strike}</span>
          {net !== undefined && (
            <span className="truncate font-mono text-[11px] tnum" style={{ color: net >= 0 ? PUT_LEG : CALL_LEG }}>
              {money(net)}
            </span>
          )}
          {spot !== undefined && net === undefined && (
            <span className="truncate font-mono text-[11px] tnum text-white/55">
              {strike > spot ? 'above' : 'below'} by {Math.abs(strike - spot).toFixed(2)}
            </span>
          )}
        </>
      ) : (
        <span className="font-mono text-[12px] text-white/35">—</span>
      )}
    </span>
  );
}

/* ── the shortlist ──────────────────────────────────────────────────────── */

function Loaded({
  board,
  pointed,
  lookback,
  onLookback,
  onPoint,
}: {
  board: Matrix;
  pointed: MatrixRow | null;
  lookback: WindowKey;
  onLookback: (k: WindowKey) => void;
  onPoint: (strike: number | null) => void;
}) {
  const lead = board.families[0];
  return (
    <section data-pp-loaded className="flex flex-col gap-1.5">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Label>
          loaded strikes · {board.loaded.length} of {board.rows.length}
        </Label>
        <Segmented
          dense
          ariaLabel="Measure change over"
          className="ml-auto"
          options={WINDOWS.map(w => ({ value: w.key, label: w.label, attrs: { 'data-pp-window': w.key } }))}
          value={lookback}
          onChange={onLookback}
        />
      </span>
      {board.loaded.length === 0 ? (
        <span className="py-2 text-[12px] text-white/50">Nothing carries enough to list. The book is quiet.</span>
      ) : (
        <ol className="flex flex-col">
          {board.loaded.map((r, i) => {
            const net = r.cells[lead]?.net ?? 0;
            const on = pointed?.strike === r.strike;
            return (
              <li key={r.strike}>
                <button
                  data-pp-loaded-row={r.strike}
                  onClick={() => onPoint(on ? null : r.strike)}
                  title={on ? 'Release this strike' : 'Hold this strike — the table and the pane stay on it'}
                  className={`${ROW} flex items-baseline gap-2 px-1.5 py-1 ${on ? 'bg-white/[0.09]' : ''}`}
                >
                  <span className="w-3 shrink-0 text-right font-mono text-[10px] tnum text-white/40">{i + 1}</span>
                  <span className="w-9 shrink-0 font-mono text-[13px] font-semibold tnum text-white/92">{r.strike}</span>
                  {r.role && (
                    <span className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: ROLE_INK[r.role] }}>
                      {ROLE_WORDS[r.role]}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 font-mono text-[12px] tnum" style={{ color: net >= 0 ? PUT_LEG : CALL_LEG }}>
                    {money(net)}
                  </span>
                  <span className="w-14 shrink-0 text-right font-mono text-[11px] tnum text-white/55">
                    {r.flow && r.flow.material
                      ? `${r.flow.grew >= 0 ? '▲' : '▼'} ${r.flow.pct != null ? `${Math.abs(r.flow.pct).toFixed(0)}%` : money(Math.abs(r.flow.grew))}`
                      : '—'}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/* ── the pointed strike ─────────────────────────────────────────────────── */

function Strike({ board, row, narrow }: { board: Matrix; row: MatrixRow; narrow: boolean }) {
  const lead = board.families[0];
  const cell = row.cells[lead];
  const net = cell?.net ?? 0;
  const ink = net >= 0 ? PUT_LEG : CALL_LEG;
  return (
    <>
      <span className="flex items-baseline gap-2">
        <span className="font-mono text-[20px] font-semibold leading-none tnum text-white">{row.strike}</span>
        {row.role && (
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: ROLE_INK[row.role] }}>
            {ROLE_WORDS[row.role]}
          </span>
        )}
        <span className="ml-auto font-mono text-[11px] text-white/50">
          {row.share >= 0.001 ? `${(row.share * 100).toFixed(1)}%` : '<0.1%'} of the book
        </span>
      </span>
      <span className="flex items-baseline gap-2">
        <span className="font-mono text-[16px] font-semibold tnum" style={{ color: ink }}>
          {money(net)}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/55">net {lead}</span>
      </span>
      <div data-pp-legs className={`grid gap-2 ${narrow ? 'grid-cols-2' : 'grid-cols-4'}`}>
        <Figure k="put" v={cell?.put ?? 0} ink={PUT_LEG} />
        <Figure k="call" v={cell?.call ?? 0} ink={CALL_LEG} />
        <Figure k="dex" v={row.cells.dex?.net ?? 0} />
        <Figure k="vex" v={row.cells.vex?.net ?? 0} />
      </div>
      {row.pulse.length > 0 && (
        <div data-pp-strike-windows={row.pulse.length} className={`grid gap-1 pt-1 ${narrow ? 'grid-cols-4' : 'grid-cols-7'}`}>
          {WINDOWS.map(w => {
            const q = row.pulse.find(x => x.key === w.key);
            const on = w.key === board.lookback.key;
            return (
              <span key={w.key} className={`flex flex-col items-center gap-0.5 rounded-md py-1 ${on ? 'bg-white/[0.08]' : ''}`}>
                <span className="font-mono text-[10px] uppercase text-white/55">{w.label}</span>
                <span
                  className="font-mono text-[11px] tnum"
                  style={{ color: !q ? 'rgba(255,255,255,0.3)' : q.crossed ? '#ededed' : q.grew >= 0 ? PUT_LEG : CALL_LEG }}
                  title={q ? `${signed(q.grew)} over ${w.label}${q.crossed ? ' · crossed side' : ''}` : 'Not in the book that far back'}
                >
                  {q ? `${q.grew >= 0 ? '+' : '−'}${short(Math.abs(q.grew))}` : '—'}
                </span>
              </span>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ── the expected move ──────────────────────────────────────────────────── */

function Move({ board, m, narrow }: { board: Matrix; m: Extras['move']; narrow: boolean }) {
  return (
    <section data-pp-move={m ? 'on' : 'none'} className="flex flex-col gap-1.5">
      <Label>expected move · to the close</Label>
      {!m ? (
        <Absent>No session bars behind this book yet.</Absent>
      ) : (
        <>
          <span className="flex items-baseline gap-2">
            <span className="font-mono text-[20px] font-semibold leading-none tnum text-white/92">±{m.sigma.toFixed(2)}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/55">
              1σ · {Math.round(m.minutesToClose)} min left
            </span>
          </span>
          <div className={`grid gap-x-3 gap-y-1 ${narrow ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <Pair k="1σ up" v={m.up1} strike={m.upStrike} spot={board.spot} />
            <Pair k="1σ down" v={m.dn1} strike={m.dnStrike} spot={board.spot} />
            <Pair k="2σ up" v={m.up2} spot={board.spot} />
            <Pair k="2σ down" v={m.dn2} spot={board.spot} />
          </div>
          <span className="text-[11px] leading-snug text-white/50">
            The 1σ edges are marked on the table at {m.dnStrike} and {m.upStrike}.
          </span>
        </>
      )}
    </section>
  );
}

function Pair({ k, v, strike, spot }: { k: string; v: number; strike?: number; spot: number }) {
  return (
    <span className="flex items-baseline gap-1.5 overflow-hidden whitespace-nowrap">
      <span className="w-14 shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-white/55">{k}</span>
      <span className="font-mono text-[13px] font-semibold tnum text-white/92">{v.toFixed(2)}</span>
      <span className="truncate font-mono text-[11px] tnum text-white/50">
        {strike !== undefined ? `· ${strike}` : `· ${((v / spot - 1) * 100).toFixed(2)}%`}
      </span>
    </span>
  );
}

/* ── vol ────────────────────────────────────────────────────────────────── */

function Vol({ v, lead, narrow }: { v: Extras['vol']; lead: string; narrow: boolean }) {
  const word: Record<string, string> = { quiet: 'implied under realized', ordinary: 'implied near realized', strained: 'implied well over realized', unknown: 'no realized to compare' };
  return (
    <section data-pp-vol={v ? v.verdict : 'none'} className="flex flex-col gap-1.5">
      <Label>vol · what {lead} is read under</Label>
      {!v ? (
        <Absent>No implied for this name.</Absent>
      ) : (
        <>
          <span className="flex items-baseline gap-2">
            <span className="font-mono text-[20px] font-semibold leading-none tnum text-white/92">{(v.iv * 100).toFixed(2)}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/55">atm iv · {word[v.verdict]}</span>
          </span>
          <div className={`grid gap-2 ${narrow ? 'grid-cols-2' : 'grid-cols-3'}`}>
            <Figure k="rv 20" v={v.rv20} fmt={x => (x === null ? '—' : (x * 100).toFixed(2))} />
            <Figure k="skew 25Δ" v={v.rr} fmt={x => `${x >= 0 ? '+' : ''}${x.toFixed(2)}`} />
            <Figure k="term" v={v.slope} fmt={x => `${x.toFixed(2)}×`} />
          </div>
        </>
      )}
    </section>
  );
}

/* ── the session ────────────────────────────────────────────────────────── */

function Session({ s, lead, narrow }: { s: Extras['session']; lead: string; narrow: boolean }) {
  return (
    <section data-pp-session={s ? s.points.length : 'none'} className="flex flex-col gap-1.5">
      <Label>session · net {lead} over the day</Label>
      {!s ? (
        <Absent>No readings yet this session.</Absent>
      ) : (
        <>
          <Spark points={s.points.map(p => p.netGex)} min={s.min} max={s.max} />
          <div className={`grid gap-2 ${narrow ? 'grid-cols-2' : 'grid-cols-3'}`}>
            <Figure k="now" v={s.points[s.points.length - 1].netGex} fmt={money} ink={s.points[s.points.length - 1].netGex >= 0 ? PUT_LEG : CALL_LEG} />
            <Figure k="rank" v={s.pctile} fmt={x => (x === null ? '—' : `${Math.round(x)}${ordinal(Math.round(x))} pct`)} title={s.pctile !== null ? `Against ${s.sessions} sessions` : 'No history to rank against'} />
            <Figure k="charm" v={s.charmRealized} fmt={x => `${Math.round(x * 100)}% done`} title="Share of the day's charm already realized" />
          </div>
        </>
      )}
    </section>
  );
}

/** A polyline of the day's net, with the zero line drawn where it is. */
function Spark({ points, min, max }: { points: number[]; min: number; max: number }) {
  const W = 300;
  const H = 40;
  const lo = Math.min(min, 0);
  const hi = Math.max(max, 0);
  const span = hi - lo || 1;
  const y = (v: number) => H - ((v - lo) / span) * H;
  const step = points.length > 1 ? W / (points.length - 1) : W;
  const d = points.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = points[points.length - 1] ?? 0;
  return (
    <svg data-pp-spark={points.length} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-10 w-full" aria-hidden>
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
      <polyline points={d} fill="none" stroke={last >= 0 ? PUT_LEG : CALL_LEG} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ── session levels ─────────────────────────────────────────────────────── */

function Levels({ l, board, narrow }: { l: Extras['levels']; board: Matrix; narrow: boolean }) {
  return (
    <section data-pp-levels={l ? l.levels.length : 'none'} className="flex flex-col gap-1.5">
      <Label>session levels · nearest first</Label>
      {!l ? (
        <Absent>No session prices yet.</Absent>
      ) : (
        <ol className={`grid gap-x-3 gap-y-1 ${narrow ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {l.levels.slice(0, 8).map(lv => (
            <li key={lv.key} className="flex items-baseline gap-1.5 overflow-hidden whitespace-nowrap">
              <span className="w-8 shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-white/60">{lv.tag}</span>
              <span className="font-mono text-[13px] font-semibold tnum text-white/92">{lv.price.toFixed(2)}</span>
              <span className="truncate font-mono text-[11px] tnum" style={{ color: lv.away >= 0 ? PUT_LEG : CALL_LEG }}>
                {lv.away >= 0 ? '+' : '−'}
                {Math.abs(lv.away).toFixed(2)}
              </span>
            </li>
          ))}
        </ol>
      )}
      {l && (
        <span className="text-[11px] leading-snug text-white/50">
          Spot {board.spot.toFixed(2)}
          {l.nearestAbove ? ` · ${l.nearestAbove.tag} ${(l.nearestAbove.price - board.spot).toFixed(2)} overhead` : ''}
          {l.nearestBelow ? ` · ${l.nearestBelow.tag} ${(board.spot - l.nearestBelow.price).toFixed(2)} under` : ''}
        </span>
      )}
    </section>
  );
}

/* ── pins ───────────────────────────────────────────────────────────────── */

function Pins({ p, board, narrow }: { p: Extras['pins']; board: Matrix; narrow: boolean }) {
  return (
    <section data-pp-pins={p ? 'on' : 'none'} className="flex flex-col gap-1.5">
      <Label>pins · where the book wants to close</Label>
      {!p ? (
        <Absent>No open interest to weigh.</Absent>
      ) : (
        <>
          <div className={`grid gap-2 ${narrow ? 'grid-cols-2' : 'grid-cols-3'}`}>
            <Figure k="max pain" v={p.maxPain} fmt={x => (x === null ? '—' : x.toFixed(0))} title="The strike that pays the least across all open interest" />
            <Figure k="gamma pin" v={p.gammaPin} fmt={x => (x === null ? '—' : x.toFixed(1))} title="Where the gamma mass sits" />
            <Figure k="gap" v={p.gap} fmt={x => (x === null ? '—' : `${x >= 0 ? '+' : ''}${x.toFixed(1)}`)} title="Gamma pin less max pain" />
          </div>
          <span className="text-[11px] leading-snug text-white/50">
            {p.gap === null
              ? 'One of the two cannot be read on this chain.'
              : Math.abs(p.gap) < board.step
                ? 'The gamma mass and the open interest agree.'
                : `The gamma mass sits ${Math.abs(p.gap).toFixed(1)} ${p.gap > 0 ? 'above' : 'below'} where the open interest would pin.`}
          </span>
        </>
      )}
    </section>
  );
}

/* ── what moved ─────────────────────────────────────────────────────────── */

function Recent({ stream, onPoint }: { stream: StreamEvent[]; onPoint: (s: number | null) => void }) {
  return (
    <section className="flex flex-col gap-1">
      <Label>recent</Label>
      {stream.length === 0 ? (
        <span className="py-1 text-[12px] text-white/50">Waiting for the first tick.</span>
      ) : (
        <ol data-pp-stream={stream.length} className="flex flex-col">
          {stream.map(e => (
            <li key={e.id} data-pp-event={e.source}>
              <button
                onClick={() => onPoint(e.strike)}
                disabled={e.strike == null}
                className={`${ROW} flex items-baseline gap-2 px-1.5 py-[3px] disabled:cursor-default disabled:hover:bg-transparent`}
              >
                <span className="w-14 shrink-0 font-mono text-[10px] tnum text-white/40">{clock(e.at)}</span>
                <span className="min-w-0 flex-1 text-[12px] leading-snug text-white/80">{e.text}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ── shared ─────────────────────────────────────────────────────────────── */

function Figure<T extends number | null>({
  k,
  v,
  ink,
  fmt,
  title,
}: {
  k: string;
  v: T;
  ink?: string;
  fmt?: (v: T) => string;
  title?: string;
}) {
  const text = fmt ? fmt(v) : v === null ? '—' : money(v as number);
  return (
    <span className="flex flex-col overflow-hidden" title={title}>
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/55">{k}</span>
      <span className="truncate font-mono text-[12px] font-semibold tnum" style={{ color: ink ?? 'rgba(255,255,255,0.86)' }}>
        {text}
      </span>
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/55">{children}</span>;
}

function Absent({ children }: { children: React.ReactNode }) {
  return <span className="text-[12px] leading-relaxed text-white/45">{children}</span>;
}

/** A compact money for the seven-window grid, where `$12.3M` is too wide. */
const short = (v: number): string => {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toFixed(0);
};

const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0];
};

const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const Overlay = memo(PaneInner);
