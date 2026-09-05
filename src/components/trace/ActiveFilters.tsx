import { X } from 'lucide-react';

/*
  6.2 · WHAT IS CURRENTLY EXCLUDED, said where the count is.

  THE FAILURE THIS FIXES is quiet and common: a reader sets a filter, scrolls
  away, comes back, and reads "412 contracts" as the market. The count is
  honest and the reading is wrong, because the filter is off-screen behind a
  door. Everything else on the page then inherits the error — the stats
  strip, the read sentence, the export.

  So the filters that are ON get named in the open, each one removable where
  it is named, with a clear-all beside them. Nothing is named when nothing is
  filtering, so the row costs no space on the common path.
*/

export interface ActiveFilter {
  /** Stable id — also the React key. */
  key: string;
  /** What the reader chose, in their words: "calls only", "≥ $1M". */
  label: string;
  /** Turn just this one off. */
  onClear: () => void;
}

const ActiveFilters = ({
  filters,
  onClearAll,
  className = '',
}: { filters: readonly ActiveFilter[]; onClearAll?: () => void; className?: string }) => {
  if (filters.length === 0) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`} role="status" aria-label="Active filters">
      <span className="font-mono text-[9px] uppercase tracking-widest text-textMuted">filtered by</span>
      {filters.map(f => (
        <button
          key={f.key}
          type="button"
          onClick={f.onClear}
          title={`Remove: ${f.label}`}
          className="inline-flex items-center gap-1 rounded border border-select/25 bg-select/10 px-1.5 py-0.5 font-mono text-[9px] text-select transition-colors hover:border-select/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-select"
        >
          {f.label}
          <X className="w-2.5 h-2.5" aria-hidden />
        </button>
      ))}
      {onClearAll && filters.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="font-mono text-[9px] uppercase tracking-wider text-textMuted transition-colors hover:text-textPrimary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-select"
        >
          clear all
        </button>
      )}
    </span>
  );
};

export default ActiveFilters;
