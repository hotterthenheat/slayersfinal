import * as Popover from '@radix-ui/react-popover';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import CompanyLogo from './CompanyLogo';
import EmptyState from './EmptyState';
import type { TickerListing } from '../../data/tickers';

type TickerModule = typeof import('../../data/tickers');

interface TickerSearchProps {
  value: string;
  onChange: (symbol: string) => void;
  /**
   * Drop the brand mark and tighten the trigger, for a header too narrow to
   * spend 16px on a logo — a ladder column is 178px wide and already carries
   * an expiry and a close button.
   *
   * The mark earns its space on a single-name surface like the top bar, where
   * it is the one place the desk says which company it is on. In a rail of
   * four columns the SYMBOL is doing that job four times over.
   */
  compact?: boolean;
}

/** Compact searchable ticker menu — filters the full NASDAQ universe (lazy-loaded). */
const TickerSearch = ({ value, onChange, compact = false }: TickerSearchProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [mod, setMod] = useState<TickerModule | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);

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

  // Keep the keyboard highlight visible. The list is a 288px scroll box; the
  // highlight moved but never scrolled, so ArrowDown past row ~10 had no
  // visible effect at all.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${highlight}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  /* No outside-click listener: Popover dismisses on pointer-down outside, on
     Escape, and on focus leaving — and it returns focus to the trigger, which
     the hand-rolled version never did. */

  const optionId = (i: number) => `${listId}-opt-${i}`;

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
    }
    /* Escape is Popover's — it also restores focus to the trigger, which the
       manual branch did not. */
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className={
          compact
            ? 'flex items-center gap-1 rounded border border-borderSubtle bg-inset px-1.5 py-0.5 font-mono text-micro font-semibold uppercase tracking-wider leading-4 text-textPrimary transition-colors hover:border-borderMuted'
            : 'flex items-center gap-2 border border-borderSubtle hover:border-borderMuted bg-panel rounded-md pl-2.5 pr-2 py-1.5 font-mono text-caption transition-colors min-w-[104px] leading-4'
        }
      >
        {/* The mark stands in for the magnifier on the trigger. The button
            already says what it is by carrying a symbol and a chevron, and the
            search affordance is repeated inside the popover on the input that
            actually searches — so this slot is better spent saying WHICH name
            the desk is on. Single-name surface: exactly where a brand mark
            belongs (see ui/CompanyLogo.tsx). */}
        {!compact && <CompanyLogo ticker={value} size={16} />}
        <span className={compact ? '' : 'font-semibold text-textPrimary'}>{value}</span>
        <ChevronDown
          className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5 ml-auto'} text-textMuted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={8}
          /* The list owns its own arrow keys, so Radix must not also move focus
             between items — the input keeps focus and `highlight` drives the
             listbox, which is the combobox pattern this control has always
             used. */
          onOpenAutoFocus={e => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          className="z-40 w-72 border border-borderMuted bg-panel rounded-lg shadow-overlay overflow-hidden animate-slide-in"
          onKeyDown={onKeyDown}
        >
          <div className="flex items-center gap-2 px-3 border-b border-borderSubtle">
            <Search className="w-3.5 h-3.5 text-textMuted" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search all tickers…"
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={results[highlight] ? optionId(highlight) : undefined}
              aria-label="Search all tickers"
              className="w-full bg-transparent py-2.5 text-body text-textPrimary placeholder:text-textMuted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60 leading-5"
            />
          </div>
          <div ref={listRef} id={listId} role="listbox" aria-label="Tickers" className="max-h-72 overflow-y-auto py-1">
            {!mod ? (
              <div className="px-3 py-6 text-center font-mono text-label text-textMuted">Loading tickers…</div>
            ) : results.length === 0 ? (
              <EmptyState size="sm" title="No matches" body={`Nothing matches “${query}”`} />
            ) : (
              results.map((t, i) => (
                <button
                  key={t.symbol}
                  id={optionId(i)}
                  data-idx={i}
                  role="option"
                  aria-selected={i === highlight}
                  /* Tab should leave the popover, not walk 60 stops through it —
                     the arrow keys drive this list. */
                  tabIndex={-1}
                  onClick={() => pick(t.symbol)}
                  onMouseEnter={() => setHighlight(i)}
                  className={`w-full flex items-center gap-3 px-3 py-1.5 text-left transition-colors ${
                    i === highlight ? 'bg-white/[0.05]' : ''
                  }`}
                >
                  <span
                    className={`font-mono text-caption font-semibold w-16 shrink-0 ${
                      t.symbol === value ? 'text-select' : 'text-textPrimary'
                    } leading-4`}
                  >
                    {t.symbol}
                  </span>
                  <span className="text-label text-textSecondary truncate">{t.name}</span>
                </button>
              ))
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

export default TickerSearch;
