import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';
import type { TickerListing } from '../../data/tickers';
import { useAnchoredMenu } from './useAnchoredMenu';
import { NO_MATCH_NOTE } from '../../data/coverage';

type TickerModule = typeof import('../../data/tickers');

interface TickerSearchProps {
  value: string;
  onChange: (symbol: string) => void;
}

/** The menu's own width — `w-72`. Passed to the placement rather than measured,
    because it is a constant here and measuring costs a reposition frame. */
const MENU_W = 288;

/*
==================================================
  SLAYER TERMINAL - THE TICKER PICKER (TickerSearch)

  Compact searchable ticker menu — filters the full
  NASDAQ universe (lazy-loaded).

  PLACED AND PORTALLED, NOT `absolute right-0`.

  The menu used to hang off the trigger with
  `absolute right-0 top-full`, which is correct only
  while the trigger has 288px of room to its LEFT. It
  does not on a phone. Every page that renders this
  puts it in a header row that WRAPS at a narrow
  width, and a wrapped row starts at the left edge —
  so the trigger sits at x=16..120 and a right-hung
  menu is laid out from x=-168.

  Measured at 390x844 on the built app, before this:
  the search input's left edge at x=-134, so a reader
  could not see what they typed; 2 of the first 8
  symbol rows returned themselves from
  `document.elementFromPoint`, and the rest returned
  something else or nothing. Identical numbers on
  /pinpoint/exposure-profile and /trace/tracker —
  which reach this through two different shells — so
  it is this component's placement, not any one
  page's layout.

  `useAnchoredMenu` is the rule the toolbar menus and
  the compare popover already use, and its whole
  purpose is keeping the far edge on screen. This is
  the fourth caller, not a fourth copy.
==================================================
*/
const TickerSearch = ({ value, onChange }: TickerSearchProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [mod, setMod] = useState<TickerModule | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const { anchorRef, placed } = useAnchoredMenu<HTMLButtonElement>(open, 'bottom', MENU_W);

  const results: TickerListing[] = useMemo(
    () => (mod ? mod.searchTickers(query, 60) : []),
    [mod, query]
  );

  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlight(0);
      if (!mod) import('../../data/tickers').then(setMod);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, mod]);

  useEffect(() => setHighlight(0), [query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      /* The menu is PORTALLED to <body>, so it is not inside `wrapRef` any
         more. Without the second clause every mousedown on a symbol row read
         as a click outside, closed the menu on mousedown, and unmounted the
         row before its own click could fire — the picker would have stopped
         picking. */
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const pick = (symbol: string) => {
    onChange(symbol);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[highlight]) pick(results[highlight].symbol);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={anchorRef}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 border border-borderSubtle hover:border-borderMuted bg-panel rounded-md pl-2.5 pr-2 py-1.5 font-mono text-xs transition-colors min-w-[104px]"
      >
        <Search className="w-3.5 h-3.5 text-textMuted" />
        <span className="font-semibold text-textPrimary">{value}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-textMuted ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* `placed` is null until the box has been measured, so the menu is never
          painted at the origin for a frame on its way to the right place. */}
      {open && placed && createPortal(
        <div
          ref={menuRef}
          /* A COLUMN UNDER THE PLACED maxHeight, rather than a fixed `max-h-72`
             on the list. The placement already knows how much room there is
             between the trigger and the window edge; a hard 288px list ignored
             it and ran off the bottom of a short window. The search row holds
             its size and the list takes what is left. */
          style={{ position: 'fixed', ...placed.box }}
          className="z-[120] w-72 max-w-[calc(100vw_-_16px)] flex flex-col border border-borderMuted bg-panel rounded-lg shadow-2xl shadow-black overflow-hidden animate-slide-in"
          onKeyDown={onKeyDown}
        >
          <div className="shrink-0 flex items-center gap-2 px-3 border-b border-borderSubtle">
            <Search className="w-3.5 h-3.5 text-textMuted" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search all tickers…"
              className="w-full bg-transparent py-2.5 text-sm text-textPrimary placeholder:text-textMuted focus:outline-none"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
            {!mod ? (
              <div className="px-3 py-6 text-center font-mono text-[11px] text-textMuted">Loading tickers…</div>
            ) : results.length === 0 ? (
              <div className="px-3 py-6 text-center flex flex-col gap-1">
                <span className="font-mono text-[11px] text-textMuted">No matches</span>
                {/* WHICH KIND OF NOTHING. "No matches" alone reads as a feed
                    that came back empty, and a reader waits or retries. The
                    desk carries a fixed universe, so the honest answer is that
                    the symbol is out of scope — nothing will arrive. */}
                <span className="font-mono text-[10px] text-textMuted/70 leading-relaxed">{NO_MATCH_NOTE}</span>
              </div>
            ) : (
              results.map((t, i) => (
                <button
                  key={t.symbol}
                  onClick={() => pick(t.symbol)}
                  onMouseEnter={() => setHighlight(i)}
                  className={`w-full flex items-center gap-3 px-3 py-1.5 text-left transition-colors ${
                    i === highlight ? 'bg-white/[0.05]' : ''
                  }`}
                >
                  <span
                    className={`font-mono text-xs font-semibold w-16 shrink-0 ${
                      t.symbol === value ? 'text-select' : 'text-textPrimary'
                    }`}
                  >
                    {t.symbol}
                  </span>
                  <span className="text-[11px] text-textSecondary truncate">{t.name}</span>
                </button>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default TickerSearch;
