/*
==================================================
  SLAYER TERMINAL - TICKER QUICK-PICK
  The compact in-header ticker switcher shared by
  the flow-board minis, the 4-way chart board and
  the live chart's fullscreen strip. The menu is a
  full-universe search (S&P 500 + NASDAQ listings),
  not a watchlist — four presets and a blind text
  box was the whole reachable market until Noah
  called it (2026-08-18). Unknown symbols still
  pick on Enter; the sim synthesizes them.
==================================================
*/

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import TickerLookup from '../ui/TickerLookup';

interface TickerQuickPickProps {
  ticker: string;
  onPick: (ticker: string) => void;
}

const TickerQuickPick = ({ ticker, onPick }: TickerQuickPickProps) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Outside click / Escape closes the picker
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

  const pick = (sym: string) => {
    setOpen(false);
    if (sym && sym !== ticker) onPick(sym);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title="Switch ticker"
        className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-textPrimary hover:text-select transition-colors"
      >
        {ticker}
        <ChevronDown className={`w-3 h-3 text-textSecondary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-40 w-72 border border-borderMuted bg-panel rounded-md shadow-2xl shadow-black/60 overflow-hidden animate-slide-in">
          <TickerLookup active={ticker} onPick={pick} />
        </div>
      )}
    </div>
  );
};

export default TickerQuickPick;
