import { memo } from 'react';
import { X } from 'lucide-react';
import { ROLE_WORDS, WINDOWS, type WindowKey } from '../../../data/pinpoint/board';
import { asLevels, type Matrix, type MatrixRow } from '../../../data/pinpoint/matrix';
import type { StreamEvent } from '../../../data/pinpoint/stream';
import { CALL_LEG, PUT_LEG, ROLE_INK, money, signed } from './ink';

/*
==================================================
  SLAYER TERMINAL - THE PANEL'S SIDE PANE
  (pages/pinpoint/board/Drawer.tsx)
==================================================

  ══ WHAT IT IS ═════════════════════════════════════════════════════════════

  Noah: "i just like the side pane thing to show important info like the
  loaded strikes how many of them xyz and all other info you think is
  necessary ... i like the bit blurry transparent thing."

  A pane that floats out of the pane's right edge, translucent and blurred
  over the lane, holding the readings that are about the BOOK and about ONE
  STRIKE rather than about every row — the things a column is the wrong
  shape for. It is not a sidebar of the table's own chrome, and it is not a
  copy of anybody's product: the first cut of this file drew the reference's
  option-setup cards with ring gauges and a risk slider, and Noah's reading
  was exact — "right idea but wrong thing, no option call outs." The idea is
  the pane. The content is ours.

  ══ WHAT IS IN IT, TOP TO BOTTOM ═══════════════════════════════════════════

    THE BOOK        net, side, regime, the named levels, vol
    LOADED STRIKES  the score's shortlist, counted, with each one's change
                    over the window — and the window control beside it
    THE STRIKE      whatever the pointer is on: legs, greeks, every window
    RECENT          what moved, newest first — see data/pinpoint/stream.ts

  Nothing here is a verdict and nothing is drawn to look like a signal. It
  is figures, in the order a reader glancing over from a chart wants them.
*/

export interface PaneProps {
  board: Matrix;
  /** The strike under the pointer, or the one the reader clicked. */
  pointed: MatrixRow | null;
  stream: StreamEvent[];
  lookback: WindowKey;
  onLookback: (k: WindowKey) => void;
  onPoint: (strike: number | null) => void;
  onClose: () => void;
  width: number;
}

function PaneInner({ board, pointed, stream, lookback, onLookback, onPoint, onClose, width }: PaneProps) {
  const lead = board.families[0];
  const book = board.books[lead];
  const L = asLevels(board.landmarks, board.spot);
  const at = (strike: number) => (Number.isFinite(strike) ? board.rows.find(r => r.strike === strike) : undefined);

  return (
    <div
      data-pp-overlay-panel
      role="region"
      aria-label={`${board.ticker} book and strikes`}
      className="absolute inset-y-2 right-2 z-20 flex flex-col overflow-hidden rounded-xl border border-white/[0.09] bg-[#0b0b10]/[0.84] shadow-2xl shadow-black/60 backdrop-blur-md"
      style={{ width }}
    >
      {/* ── head ──────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] px-3 py-2">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-white/85">{board.ticker}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/45">
          {lead} · {board.expiry.label}
        </span>
        <button
          onClick={onClose}
          aria-label="Close"
          className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-white/45 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-3 [scrollbar-width:thin]">
        {/* ── the book ──────────────────────────────────────────────── */}
        {book && (
          <section data-pp-book className="flex flex-col gap-1.5">
            <Label>the book</Label>
            <span className="flex items-baseline gap-2">
              <span className="font-mono text-[18px] font-semibold tnum" style={{ color: book.net >= 0 ? PUT_LEG : CALL_LEG }}>
                {money(book.net)}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/50">
                net {lead} · {book.net >= 0 ? 'put-dominant' : 'call-dominant'}
                {lead === 'gex' && (book.net >= 0 ? ' · amplifying' : ' · damping')}
              </span>
            </span>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <Level word="pin" strike={L.supreme} row={at(L.supreme)} lead={lead} />
              <Level word="flip" strike={L.flip} row={undefined} lead={lead} spot={board.spot} />
              <Level word="put wall" strike={L.putWall} row={at(L.putWall)} lead={lead} />
              <Level word="call wall" strike={L.callWall} row={at(L.callWall)} lead={lead} />
            </div>
          </section>
        )}

        {/* ── loaded strikes ────────────────────────────────────────── */}
        <section data-pp-loaded className="flex flex-col gap-1.5">
          <span className="flex items-center gap-2">
            <Label>
              loaded strikes · {board.loaded.length} of {board.rows.length}
            </Label>
            <span className="ml-auto flex items-center gap-0.5" role="group" aria-label="Measure change over">
              {WINDOWS.map(w => {
                const on = w.key === lookback;
                return (
                  <button
                    key={w.key}
                    data-pp-window={w.key}
                    aria-pressed={on}
                    onClick={() => onLookback(w.key)}
                    className={`rounded px-1 py-[2px] font-mono text-[9px] font-semibold uppercase tracking-[0.08em] transition-colors ${
                      on ? 'bg-white/[0.14] text-white' : 'text-white/35 hover:bg-white/[0.06] hover:text-white/70'
                    }`}
                  >
                    {w.label}
                  </button>
                );
              })}
            </span>
          </span>
          {board.loaded.length === 0 ? (
            <span className="py-2 font-mono text-[11px] text-white/40">Nothing carries enough to list. The book is quiet.</span>
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
                      className={`flex w-full items-baseline gap-2 rounded-md px-1.5 py-1 text-left transition-colors ${
                        on ? 'bg-white/[0.09]' : 'hover:bg-white/[0.05]'
                      }`}
                    >
                      <span className="w-3 shrink-0 text-right font-mono text-[9px] tnum text-white/35">{i + 1}</span>
                      <span className="w-9 shrink-0 font-mono text-[12px] font-semibold tnum text-white/90">{r.strike}</span>
                      {r.role && (
                        <span className="shrink-0 font-mono text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color: ROLE_INK[r.role] }}>
                          {ROLE_WORDS[r.role]}
                        </span>
                      )}
                      <span className="ml-auto shrink-0 font-mono text-[11px] tnum" style={{ color: net >= 0 ? PUT_LEG : CALL_LEG }}>
                        {money(net)}
                      </span>
                      <span className="w-14 shrink-0 text-right font-mono text-[10px] tnum text-white/45">
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

        {/* ── the pointed strike ────────────────────────────────────── */}
        <section data-pp-card={pointed ? pointed.strike : 'empty'} className="flex flex-col gap-2 border-t border-white/[0.07] pt-3">
          {pointed ? (
            <Strike board={board} row={pointed} />
          ) : (
            <>
              <Label>the strike</Label>
              <span className="font-mono text-[11px] leading-relaxed text-white/40">
                Point at a row, or click one above. Its legs, its greeks and what it has done over every window come here.
              </span>
            </>
          )}
        </section>

        {/* ── what moved ────────────────────────────────────────────── */}
        <section className="flex flex-col gap-1 border-t border-white/[0.07] pt-3">
          <Label>recent</Label>
          {stream.length === 0 ? (
            <span className="py-1 font-mono text-[11px] text-white/40">Waiting for the first tick.</span>
          ) : (
            <ol data-pp-stream={stream.length} className="flex flex-col">
              {stream.map(e => (
                <li key={e.id} data-pp-event={e.source}>
                  <button
                    onClick={() => onPoint(e.strike)}
                    disabled={e.strike == null}
                    className="flex w-full items-baseline gap-2 rounded-md px-1.5 py-[3px] text-left transition-colors enabled:hover:bg-white/[0.05] disabled:cursor-default"
                  >
                    <span className="w-14 shrink-0 font-mono text-[10px] tnum text-white/35">{clock(e.at)}</span>
                    <span className="min-w-0 flex-1 font-mono text-[11px] leading-snug text-white/75">{e.text}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* ── foot ──────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-2 border-t border-white/[0.07] px-3 py-1.5 font-mono text-[10px] text-white/40">
        <span className="truncate">{pointed ? `${pointed.strike} · ${pointed.steps >= 0 ? '+' : '−'}${Math.abs(pointed.steps).toFixed(1)} from spot` : `${board.window.strikes} of ${board.window.chain} strikes drawn`}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 uppercase tracking-[0.12em]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#5BE07A]" aria-hidden />
          live · {clock(board.builtAt)}
        </span>
      </div>
    </div>
  );
}

/** One named level in the book section — the word, the strike, the net. */
function Level({
  word,
  strike,
  row,
  lead,
  spot,
}: {
  word: string;
  strike: number;
  row: MatrixRow | undefined;
  lead: Matrix['families'][number];
  spot?: number;
}) {
  const has = Number.isFinite(strike);
  const net = row?.cells[lead]?.net;
  return (
    <span className="flex items-baseline gap-1.5 overflow-hidden whitespace-nowrap">
      <span className="w-14 shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-white/40">{word}</span>
      {has ? (
        <>
          <span className="font-mono text-[12px] font-semibold tnum text-white/90">{strike}</span>
          {net !== undefined && (
            <span className="truncate font-mono text-[10px] tnum" style={{ color: net >= 0 ? PUT_LEG : CALL_LEG }}>
              {money(net)}
            </span>
          )}
          {spot !== undefined && net === undefined && (
            <span className="truncate font-mono text-[10px] tnum text-white/45">
              {strike > spot ? 'above' : 'below'} by {Math.abs(strike - spot).toFixed(2)}
            </span>
          )}
        </>
      ) : (
        <span className="font-mono text-[11px] text-white/30">—</span>
      )}
    </span>
  );
}

/** The pointed strike: legs, greeks, every window. */
function Strike({ board, row }: { board: Matrix; row: MatrixRow }) {
  const lead = board.families[0];
  const cell = row.cells[lead];
  const net = cell?.net ?? 0;
  const ink = net >= 0 ? PUT_LEG : CALL_LEG;
  return (
    <>
      <span className="flex items-baseline gap-2">
        <span className="font-mono text-[18px] font-semibold tnum text-white">{row.strike}</span>
        {row.role && (
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: ROLE_INK[row.role] }}>
            {ROLE_WORDS[row.role]}
          </span>
        )}
        <span className="ml-auto font-mono text-[10px] text-white/40">
          {row.share >= 0.001 ? `${(row.share * 100).toFixed(1)}%` : '<0.1%'} of the book
        </span>
      </span>
      <span className="flex items-baseline gap-2">
        <span className="font-mono text-[16px] font-semibold tnum" style={{ color: ink }}>
          {money(net)}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/45">net {lead}</span>
      </span>
      <div data-pp-legs className="grid grid-cols-4 gap-2">
        <Figure k="put" v={cell?.put ?? 0} ink={PUT_LEG} />
        <Figure k="call" v={cell?.call ?? 0} ink={CALL_LEG} />
        <Figure k="dex" v={row.cells.dex?.net ?? 0} />
        <Figure k="vex" v={row.cells.vex?.net ?? 0} />
      </div>
      {row.pulse.length > 0 && (
        <div data-pp-strike-windows={row.pulse.length} className="grid grid-cols-7 gap-1 pt-1">
          {WINDOWS.map(w => {
            const q = row.pulse.find(x => x.key === w.key);
            const on = w.key === board.lookback.key;
            return (
              <span key={w.key} className={`flex flex-col items-center gap-0.5 rounded-md py-1 ${on ? 'bg-white/[0.08]' : ''}`}>
                <span className="font-mono text-[9px] uppercase text-white/45">{w.label}</span>
                <span
                  className="font-mono text-[10px] tnum"
                  style={{ color: !q ? 'rgba(255,255,255,0.25)' : q.crossed ? '#ededed' : q.grew >= 0 ? PUT_LEG : CALL_LEG }}
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

function Figure({ k, v, ink }: { k: string; v: number; ink?: string }) {
  return (
    <span className="flex flex-col overflow-hidden">
      <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/40">{k}</span>
      <span className="truncate font-mono text-[11px] tnum" style={{ color: ink ?? 'rgba(255,255,255,0.75)' }}>
        {money(v)}
      </span>
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/45">{children}</span>;
}

/** A compact money for the seven-window grid, where `$12.3M` is too wide. */
const short = (v: number): string => {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toFixed(0);
};

const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const Overlay = memo(PaneInner);
