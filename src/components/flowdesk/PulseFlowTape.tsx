import { useMemo, useState } from 'react';
import { ROW_INTERACTIVE, interactiveRowProps } from '../ui/interactiveRow';
import { X } from 'lucide-react';
import { buildPulseFlow, contractKey, type SessionPrint } from '../../data/pulseflow';
import HoverReadout from '../ui/HoverReadout';
import { BULL } from '../gex/palette';
import { fmtUsd } from '../../data/gex';
import Term from '../ui/Term';
import type { TermKey } from '../../data/terms';

// Jargon columns carry an in-place explainer (hover/focus) — the tape is the
// first place a new reader meets X-count, OTM% and SigScore.
const HEADERS: { label: string; term?: TermKey }[] = [
  { label: 'Time' },
  { label: 'Value' },
  { label: 'Spot' },
  { label: 'Strike' },
  { label: 'PC', term: 'P/C' },
  { label: 'Exp' },
  { label: 'X', term: 'X' },
  { label: 'Type', term: 'Type' },
  { label: 'Size' },
  { label: 'OTM%', term: 'OTM%' },
  { label: 'Sig', term: 'Sig' },
];

/*
  Pulse flow tape — the pro options-flow feed: time / premium / spot / strike /
  C-P / exp / aggressor / sweep-block / size / SigScore bar, with the
  calls-puts and bull-bear premium read in the header. Click any print to
  ISOLATE its contract: premium totals by side, puts/calls ratio bar and the
  tape filtered to that contract; Clear isolation returns to the full feed.
*/

interface PulseFlowTapeProps {
  ticker: string;
  revision: number;
}

const SigBar = ({ v }: { v: number }) => (
  <span className="inline-flex flex-col gap-0.5 w-12">
    <span className="h-[4px] rounded-full bg-white/[0.08] overflow-hidden">
      <span
        className="block h-full rounded-full"
        style={{ width: `${Math.round(v * 100)}%`, background: v >= 0.6 ? BULL : '#E8963C' }}
      />
    </span>
    <span className="font-mono text-micro text-textMuted tnum leading-none">{v.toFixed(2)}</span>
  </span>
);

const PulseFlowTape = ({ ticker, revision }: PulseFlowTapeProps) => {
  const view = useMemo(
    () => buildPulseFlow(ticker),
    // the stream extends as the session advances
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ticker, revision]
  );
  const [isolated, setIsolated] = useState<string | null>(null);
  const [hover, setHover] = useState<{ p: SessionPrint; x: number; y: number } | null>(null);

  const rows = useMemo(() => {
    if (!view) return [];
    return isolated ? view.prints.filter(p => contractKey(p) === isolated) : view.prints;
  }, [view, isolated]);

  if (!view) {
    return (
      <div className="h-full flex items-center justify-center font-mono text-label text-textMuted uppercase tracking-widest">
        Awaiting session flow…
      </div>
    );
  }

  const iso = isolated && rows.length ? rows[0] : null;
  const isoBid = iso ? rows.filter(p => p.x === 'Bid').reduce((a, p) => a + p.value, 0) : 0;
  const isoAsk = iso ? rows.filter(p => p.x === 'Ask').reduce((a, p) => a + p.value, 0) : 0;
  const isoTotal = iso ? rows.reduce((a, p) => a + p.value, 0) : 0;

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Header: isolation strip OR the stream read */}
      {iso ? (
        <div className="flex items-center gap-3 px-2.5 py-1.5 border-b border-borderSubtle flex-wrap select-none">
          <span
            className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-label font-bold tnum ${
              iso.pc === 'C' ? 'border-bull/40 bg-bull/10 text-bull' : 'border-bear/40 bg-bear/10 text-bear'
            }`}
          >
            {ticker} {iso.strike % 1 === 0 ? iso.strike.toFixed(0) : iso.strike.toFixed(2)}
            {iso.pc} · {iso.exp}
          </span>
          <span className="font-mono text-micro uppercase tracking-wider text-textMuted tnum">
            Last <span className="text-textPrimary font-semibold">{iso.price.toFixed(2)}</span>
          </span>
          <span className="font-mono text-micro uppercase tracking-wider text-textMuted tnum">
            Bid$ <span className="text-bear font-semibold">{fmtUsd(isoBid)}</span>
          </span>
          <span className="font-mono text-micro uppercase tracking-wider text-textMuted tnum">
            Ask$ <span className="text-bull font-semibold">{fmtUsd(isoAsk)}</span>
          </span>
          <span className="font-mono text-micro uppercase tracking-wider text-textMuted tnum">
            {rows.length} prints · <span className="text-textPrimary font-semibold">{fmtUsd(isoTotal)}</span>
          </span>
          <button
            onClick={() => setIsolated(null)}
            className="ml-auto inline-flex items-center gap-1.5 border border-borderSubtle hover:border-borderMuted bg-panel rounded px-2 py-1 font-mono text-micro uppercase tracking-wider text-textSecondary hover:text-textPrimary transition-colors"
          >
            <X className="w-3 h-3" /> Clear isolation
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-2.5 py-1.5 border-b border-borderSubtle flex-wrap select-none font-mono text-micro uppercase tracking-wider text-textMuted tnum">
          <span>
            Calls/Puts <span className="text-textPrimary font-semibold">{view.calls}/{view.puts}</span>
          </span>
          <span>
            Bull <span className="text-bull font-semibold">{fmtUsd(view.bullPrem)}</span>
          </span>
          <span>
            Bear <span className="text-bear font-semibold">{fmtUsd(view.bearPrem)}</span>
          </span>
          <span className="ml-auto normal-case text-textMuted hidden sm:inline">click a print to isolate its contract</span>
        </div>
      )}

      {/* Tape */}
      <div className="flex-grow overflow-y-auto min-h-0">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-panel z-10">
            <tr className="border-b border-borderSubtle">
              {HEADERS.map(h => (
                <th key={h.label} className="px-2 py-1 text-left font-mono text-micro uppercase tracking-wider text-textMuted whitespace-nowrap">
                  {h.term ? <Term k={h.term}>{h.label}</Term> : h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(p => (
              <tr
                key={p.id}
                onClick={() => setIsolated(prev => (prev === contractKey(p) ? null : contractKey(p)))}
                {...interactiveRowProps(
                  () => setIsolated(prev => (prev === contractKey(p) ? null : contractKey(p))),
                  isolated === contractKey(p)
                )}
                /* Focus drives the same read-out hover does, so the premium
                   arithmetic and the aggression sentence are not mouse-only. */
                onFocus={e => setHover({ p, x: e.currentTarget.getBoundingClientRect().right - 40, y: e.currentTarget.getBoundingClientRect().bottom })}
                onBlur={() => setHover(h => (h && h.p.id === p.id ? null : h))}
                onMouseEnter={e => setHover({ p, x: e.clientX, y: e.clientY })}
                onMouseMove={e => setHover({ p, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHover(h => (h && h.p.id === p.id ? null : h))}
                className={`border-b border-borderSubtle/30 hover:bg-rowHover transition-colors ${ROW_INTERACTIVE}`}
              >
                <td className="px-2 py-[5px] font-mono text-label text-textMuted tnum whitespace-nowrap">{p.time}</td>
                <td className="px-2 py-[5px] font-mono text-label font-semibold text-textPrimary tnum whitespace-nowrap">{fmtUsd(p.value)}</td>
                <td className="px-2 py-[5px] font-mono text-label text-textSecondary tnum">{p.spot.toFixed(2)}</td>
                <td className="px-2 py-[5px] font-mono text-label font-semibold text-textPrimary tnum">
                  {p.strike % 1 === 0 ? p.strike.toFixed(0) : p.strike.toFixed(2)}
                </td>
                <td className={`px-2 py-[5px] font-mono text-label font-bold ${p.pc === 'C' ? 'text-bull' : 'text-bear'}`}>
                  {p.pc === 'C' ? 'Call' : 'Put'}
                </td>
                <td className="px-2 py-[5px] font-mono text-label text-textMuted tnum whitespace-nowrap">{p.exp}</td>
                <td className="px-2 py-[5px] font-mono text-label text-textSecondary">{p.x}</td>
                <td className={`px-2 py-[5px] font-mono text-label font-semibold ${p.type === 'SWEEP' ? 'text-shortGamma' : 'text-longGamma'}`}>
                  {p.type === 'SWEEP' ? 'Sweep' : 'Block'}
                </td>
                <td className="px-2 py-[5px] font-mono text-label text-textSecondary tnum">{p.size.toLocaleString()}</td>
                <td className="px-2 py-[5px] font-mono text-label text-textMuted tnum">{p.otmPct.toFixed(1)}</td>
                <td className="px-2 py-[5px]">
                  <SigBar v={p.sigScore} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {hover && (
          <HoverReadout x={hover.x} y={hover.y}>
            <div className="flex items-baseline gap-2">
              <span className={`font-mono text-caption font-bold tnum ${hover.p.pc === 'C' ? 'text-bull' : 'text-bear'}`}>
                {hover.p.ticker} {hover.p.strike % 1 === 0 ? hover.p.strike.toFixed(0) : hover.p.strike.toFixed(2)}
                {hover.p.pc}
              </span>
              <span className="font-mono text-micro text-textMuted tnum">
                {hover.p.exp} · {hover.p.dte === 0 ? '0DTE' : `${hover.p.dte}d`}
              </span>
            </div>
            <div className="mt-0.5 font-mono text-micro text-textSecondary tnum">
              {hover.p.size.toLocaleString()} × ${hover.p.price.toFixed(2)} × 100 = {fmtUsd(hover.p.value)}
            </div>
            <div className="mt-0.5 font-mono text-micro text-textSecondary">
              {hover.p.x === 'Ask'
                ? 'lifted the ask — buyer paying up'
                : hover.p.x === 'Bid'
                  ? 'hit the bid — seller aggressive'
                  : 'priced mid — negotiated'}
              {' · '}
              {hover.p.type === 'SWEEP' ? 'swept multiple exchanges' : 'crossed in one block'}
            </div>
          </HoverReadout>
        )}
      </div>
    </div>
  );
};

export default PulseFlowTape;
