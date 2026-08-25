/*
==================================================
  SLAYER TERMINAL - COMPARE SYMBOLS
  TradingView's "+" next to the symbol capsule
  (Noah, 2026-08-23): opens a compact search over
  the full universe; HOVERING a symbol row reveals
  the three ways to lay it on the chart — Same %
  scale / New price scale / New pane. Added symbols
  list at the top with their line ink and an ✕.
==================================================
*/

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import type { TickerListing } from '../../data/tickers';
import type { CompareEntry, CompareMode } from './StrikeChart';

type TickerModule = typeof import('../../data/tickers');

const MODE_LABEL: Record<CompareMode, string> = {
  percent: 'Same % scale',
  scale: 'New price scale',
  pane: 'New pane',
};

interface CompareControlProps {
  /** The chart's own name — excluded from the list */
  current: string;
  compares: CompareEntry[];
  onAdd: (ticker: string, mode: CompareMode) => void;
  onRemove: (ticker: string, mode: CompareMode) => void;
  /** Roster cap — the + dims when reached */
  max?: number;
}

const CompareControl = ({ current, compares, onAdd, onRemove, max = 4 }: CompareControlProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [mod, setMod] = useState<TickerModule | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const full = compares.length >= max;

  // Outside click / Escape closes — the TickerQuickPick contract
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    import('../../data/tickers').then(setMod);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const taken = useMemo(() => new Set(compares.map(c => c.ticker)), [compares]);
  const results: TickerListing[] = useMemo(
    () => (mod ? mod.searchTickers(query, 24).filter(t => t.symbol !== current && !taken.has(t.symbol)) : []),
    [mod, query, current, taken]
  );

  const add = (symbol: string, mode: CompareMode) => {
    onAdd(symbol.trim().toUpperCase(), mode);
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title={full ? `Compare (${max} max — remove one first)` : 'Compare symbol'}
        aria-label="Compare symbol"
        className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white/[0.06] hover:bg-white/[0.10] text-textSecondary hover:text-textPrimary transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-40 w-[380px] border border-borderMuted bg-panel rounded-md shadow-2xl shadow-black/60 overflow-hidden animate-slide-in">
          <div className="flex items-center gap-1.5 px-2 border-b border-borderSubtle">
            <Search className="w-3 h-3 text-textMuted shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Compare symbols…"
              className="w-full bg-transparent py-1.5 font-mono text-[11px] text-textPrimary placeholder:text-textMuted focus:outline-none"
            />
          </div>

          {compares.length > 0 && (
            <div className="border-b border-borderSubtle/60 py-1">
              <div className="px-2.5 pt-1 pb-0.5 font-mono text-[9px] uppercase tracking-wider text-textMuted">
                Added symbols
              </div>
              {compares.map(c => (
                <div key={`${c.ticker}:${c.mode}`} className="flex items-center gap-2 px-2.5 py-1">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.ink }} aria-hidden />
                  <span className="font-mono text-[11px] font-semibold text-textPrimary w-14 shrink-0">{c.ticker}</span>
                  <span className="font-mono text-[10px] text-textMuted">{MODE_LABEL[c.mode]}</span>
                  <button
                    onClick={() => onRemove(c.ticker, c.mode)}
                    aria-label={`Remove ${c.ticker} comparison`}
                    title="Remove comparison"
                    className="ml-auto inline-flex items-center justify-center w-5 h-5 rounded text-textMuted hover:text-textPrimary hover:bg-white/[0.06] transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="max-h-64 overflow-y-auto py-1">
            {!mod ? (
              <div className="px-2.5 py-4 text-center font-mono text-[10px] text-textMuted">Loading tickers…</div>
            ) : results.length === 0 ? (
              <div className="px-2.5 py-4 text-center font-mono text-[10px] text-textMuted">No matches</div>
            ) : (
              results.map(t => (
                <div key={t.symbol} className="group relative flex items-center gap-2 px-2.5 py-1.5 hover:bg-white/[0.04] transition-colors">
                  <span className="font-mono text-[11px] font-semibold text-textPrimary w-14 shrink-0">{t.symbol}</span>
                  <span className="text-[10px] text-textSecondary truncate">{t.name === t.symbol ? '' : t.name}</span>
                  {/* The TV move: the row's right side becomes the three
                      scale choices on hover — how the line joins the chart */}
                  {!full && (
                    <span className="touch-reveal absolute right-1.5 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1 bg-panel pl-1.5">
                      {(Object.keys(MODE_LABEL) as CompareMode[]).map(mode => (
                        <button
                          key={mode}
                          onClick={() => add(t.symbol, mode)}
                          className="px-1.5 py-0.5 rounded border border-borderSubtle bg-inset font-mono text-[9px] text-textSecondary hover:text-textPrimary hover:border-borderMuted whitespace-nowrap transition-colors"
                        >
                          {MODE_LABEL[mode]}
                        </button>
                      ))}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CompareControl;
