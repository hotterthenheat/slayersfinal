import { Star } from 'lucide-react';
import { toggleWatch, useWatchlist, WATCHLIST_CAP } from '../../data/watchlist';

/*
==================================================
  SLAYER TERMINAL - KEEP THIS NAME (components/ui/WatchButton.tsx)
==================================================

  One control, on every row that names a company: a calendar report, a new
  listing, a screening board row.

  ── IT STOPS THE CLICK IT SITS INSIDE ─────────────────────────────────────

  Every surface this lands on has a clickable row — clicking a report opens
  its dossier, clicking a board row opens its thesis. A star that also fired
  the row would take the reader somewhere else every time they tried to keep
  a name, and the failure would be invisible: the name IS added, and then
  the page changes underneath them. `stopPropagation` is the whole
  affordance, the same reason the glossary's `Term` swallows its own click.

  ── THE STATE IS IN THE LABEL, NOT ONLY THE INK ───────────────────────────

  A filled star and a hollow star at 12px are one shape apart, so the button
  carries `aria-pressed` and a title that says which way the click will go.
  A reader who cannot see the fill can still tell whether the name is kept.
*/

const WatchButton = ({ ticker, className = '' }: { ticker: string; className?: string }) => {
  const list = useWatchlist();
  const on = list.includes(ticker.toUpperCase());
  const full = !on && list.length >= WATCHLIST_CAP;

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Stop watching ${ticker}` : `Watch ${ticker}`}
      title={
        on
          ? `${ticker} is on your watchlist — click to remove it`
          : full
            ? `Your watchlist is full at ${WATCHLIST_CAP} names — adding ${ticker} drops the oldest`
            : `Keep ${ticker} on your watchlist`
      }
      data-watch={ticker}
      data-watched={on || undefined}
      onClick={e => {
        e.stopPropagation();
        toggleWatch(ticker);
      }}
      className={`inline-flex items-center justify-center w-6 h-6 rounded transition-colors ${
        on ? 'text-select hover:text-select/80' : 'text-textMuted/60 hover:text-textSecondary'
      } ${className}`}
    >
      <Star className="w-3.5 h-3.5" fill={on ? 'currentColor' : 'none'} strokeWidth={on ? 1.5 : 1.75} />
    </button>
  );
};

export default WatchButton;
