import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, ChevronDown, ChevronUp } from 'lucide-react';
import { useTopWindow } from '../trace/useTopWindow';

export interface Column<T> {
  key: string;
  /** ReactNode so a header can wrap itself in a Term explainer */
  header: React.ReactNode;
  align?: 'left' | 'right';
  width?: string;
  /** Provide to make the column sortable */
  sortValue?: (row: T) => number | string;
  render: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  /** Scroll container height, e.g. "320px" */
  maxHeight?: string;
  emptyText?: string;
  /** Floating door home once the reader is a screen or so deep — the Live
      Tape's back-to-top grammar, aimed at THIS table's own scroller. */
  backToTop?: boolean;
  /**
   * DROP READ ROWS FROM THE DOM as the reader scrolls past them, standing a
   * measured spacer in their place. Opt-in, and off by default: it only earns
   * its keep on an endless feed, and every other table here has an end.
   *
   * THE WINDOW LIVES IN HERE rather than being handed in, because this
   * component owns `sort`. Sorting reorders every row, which makes an index
   * measured against the old order meaningless — the same way a filter change
   * invalidates the Live Tape's window. Only the component that knows a sort
   * happened can drop the window at the right moment.
   *
   * See useTopWindow for the measurements that justify any of this.
   */
  windowed?: boolean;
}

/** Dense sortable data table. Wrap in <Panel flush> for the standard look. */
const DataTable = <T,>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedKey,
  initialSort,
  maxHeight,
  emptyText = 'No data',
  backToTop = false,
  windowed = false,
}: DataTableProps<T>) => {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  /* Which box actually scrolls. Capped (maxHeight) → this table's own box.
     Uncapped → the table flows with the PAGE (Noah, 2026-08-30: "not a static
     box that you scroll INSIDE of... actually be able to scroll DOWN like in
     live tape"), so the door home watches and drives the shell's main. */
  const scrollBox = () => (maxHeight ? scrollerRef.current : (scrollerRef.current?.closest('main') ?? null));
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    if (!backToTop) return;
    const el = scrollBox();
    if (!el) return;
    const onScroll = () => setShowTop(el.scrollTop > 600);
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backToTop, maxHeight]);

  /* The tape's own tween: absolute writes on the house curve each frame, so
     nothing can shove scrollTop mid-glide; reduced-motion jumps. */
  const scrollToTop = () => {
    const el = scrollBox();
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.scrollTop = 0;
      return;
    }
    const start = el.scrollTop;
    const t0 = performance.now();
    const DUR = 450;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.scrollTop = 0;
    };
    const step = (now: number) => {
      if (done) return;
      const t = Math.min(1, (now - t0) / DUR);
      const e = 1 - Math.pow(1 - t, 3); // easeOutCubic, the house curve
      el.scrollTop = Math.round(start * (1 - e));
      if (t < 1) requestAnimationFrame(step);
      else finish();
    };
    requestAnimationFrame(step);
    window.setTimeout(finish, DUR + 100);
  };

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find(c => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const sv = col.sortValue;
    return [...rows].sort((a, b) => {
      const va = sv(a);
      const vb = sv(b);
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sort, columns]);

  /* ── the top window ───────────────────────────────────────────────────
     Only mounted state; `windowed` decides whether it is ever driven. The
     hook is cheap when idle and calling it unconditionally keeps the hook
     order stable, which a conditional would not. */
  const win = useTopWindow(sortedRows.length);
  const tbodyRef = useRef<HTMLTableSectionElement | null>(null);

  /* A NEW ORDER IS A NEW LIST. Sorting moves every row, so an index measured
     against the previous order points somewhere else entirely and the spacer
     stands for a height that is no longer above the reader. Dropping the
     window on a sort change also returns them to the top of an order they
     have not read yet, which is what they asked for by sorting. */
  const orderSig = `${sort?.key ?? ''}|${sort?.dir ?? ''}`;
  const lastOrder = useRef(orderSig);
  if (windowed && lastOrder.current !== orderSig) {
    lastOrder.current = orderSig;
    win.reset();
  }

  /* Its own listener, on whichever box actually scrolls. Bound once — so
     `sync` must be stable and read refs, which useTopWindow guarantees. */
  useEffect(() => {
    if (!windowed) return;
    const el = scrollBox();
    if (!el) return;
    const onScroll = () => win.sync(el, tbodyRef.current);
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowed, maxHeight, win.sync]);

  const shown = windowed ? sortedRows.slice(win.start) : sortedRows;

  const toggleSort = (col: Column<T>) => {
    if (!col.sortValue) return;
    setSort(prev =>
      prev?.key === col.key ? { key: col.key, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key: col.key, dir: 'desc' }
    );
  };

  return (
    <div ref={scrollerRef} className="overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="bg-[#0c0c0c] border-b border-borderSubtle">
            {columns.map(col => (
              <th
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className={`px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-textMuted whitespace-nowrap ${
                  col.align === 'right' ? 'text-right' : 'text-left'
                } ${col.sortValue ? 'cursor-pointer select-none hover:text-textSecondary' : ''}`}
                onClick={() => toggleSort(col)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.align === 'right' && sort?.key === col.key && (
                    sort.dir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />
                  )}
                  {col.header}
                  {col.align !== 'right' && sort?.key === col.key && (
                    sort.dir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={tbodyRef}>
          {/* The rows the window has stood down, at exactly the height they
              held. `data-divider` is the house marker for a row that is not a
              data row — the Live Tape's colgroup measurement keys on it, and
              nothing here should mistake a one-cell row for a print. */}
          {windowed && win.spacerPx > 0 && (
            <tr data-divider="" aria-hidden>
              <td colSpan={columns.length} style={{ height: win.spacerPx, padding: 0 }} />
            </tr>
          )}
          {sortedRows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center font-mono text-[11px] text-textMuted">
                {emptyText}
              </td>
            </tr>
          ) : (
            shown.map(row => {
              const key = rowKey(row);
              const selected = selectedKey === key;
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border-b border-borderSubtle/60 last:border-0 transition-colors ${
                    onRowClick ? 'cursor-pointer' : ''
                  } ${
                    /* Holographic silver, not lime (Noah, 2026-08-30): a selected
                       row is WHERE YOU ARE — the same rail the drilldown's
                       latest row and the Weigher's open row wear. */
                    selected
                      ? 'bg-[#C7D3E8]/[0.06] shadow-[inset_2px_0_0_0_rgba(199,211,232,0.7)]'
                      : 'hover:bg-white/[0.02]'
                  }`}
                >
                  {columns.map(col => (
                    <td
                      key={col.key}
                      className={`px-3 py-2 font-mono text-xs tnum whitespace-nowrap ${
                        col.align === 'right' ? 'text-right' : 'text-left'
                      }`}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      {backToTop &&
        showTop &&
        createPortal(
          <button
            onClick={scrollToTop}
            title="Back to top"
            aria-label="Scroll back to the top"
            className="fixed bottom-6 right-6 z-40 inline-flex items-center justify-center w-9 h-9 rounded-full border border-borderMuted bg-panel/90 backdrop-blur-sm text-textSecondary hover:text-textPrimary hover:border-borderMuted hover:bg-panelHover shadow-lg shadow-black/40 transition-colors animate-soft-in"
          >
            <ArrowUp className="w-4 h-4" />
          </button>,
          document.body
        )}
    </div>
  );
};

/* MEMOISED (Noah, 2026-08-30: "some sort of buffer... jolts the entire
   website"). Measured on the Screener: every 1.5s market tick re-rendered
   this table — 250 rows × 17 cells — for 55–104ms, and the minute turn for
   182ms, with nothing on screen changing. The tick reaches every page
   through the market-data context; this table has no business redrawing for
   it unless its rows, columns or selection actually changed. Callers keep
   `rowKey` and `onRowClick` referentially stable (useCallback) so the memo
   can do its job; the cast keeps the generic signature memo() would erase. */
export default memo(DataTable) as typeof DataTable;
