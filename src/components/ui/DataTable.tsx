import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import EmptyState from './EmptyState';
import Term from './Term';
import { preserveGreek } from './greek';
import type { TermKey } from '../../data/terms';

export interface Column<T> {
  key: string;
  header: string;
  /**
   * Optional band this column sits under, rendered as a spanning header row
   * above the column names. A dense table with a dozen columns reads as a wall
   * of abbreviations without it — the band is what tells you that `Clips` and
   * `Report lag` are both describing the execution and not the instrument.
   * Adjacent columns sharing a name form one band; leave it off entirely and
   * the extra row is not rendered at all.
   */
  group?: string;
  /** Dictionary key — wraps the header in a <Term> jargon explainer */
  help?: TermKey;
  /**
   * Keep the header out of the layout but not out of the table. A column of
   * watchlist stars needs no visible caption above 34px of icon, but a header
   * cell with nothing in it is a column nobody can name — which is what a
   * screen reader gets when it reads the cell and finds the row's star has no
   * column to belong to.
   */
  headerHidden?: boolean;
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
  emptyText?: string;
}

/** Dense sortable data table. Wrap in <Panel flush> for the standard look. */
const DataTable = <T,>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedKey,
  initialSort,
  emptyText = 'No data',
}: DataTableProps<T>) => {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null);

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

  const toggleSort = (col: Column<T>) => {
    if (!col.sortValue) return;
    setSort(prev =>
      prev?.key === col.key ? { key: col.key, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key: col.key, dir: 'desc' }
    );
  };

  // Runs of adjacent columns that share a group name. A column with no group
  // still occupies a cell in the band row, or the colSpans stop lining up.
  const bands = useMemo(() => {
    if (!columns.some(c => c.group)) return [];
    const out: { name: string; span: number }[] = [];
    for (const col of columns) {
      const name = col.group ?? '';
      const last = out[out.length - 1];
      if (last && last.name === name) last.span += 1;
      else out.push({ name, span: 1 });
    }
    return out;
  }, [columns]);

  /*
    Horizontal only. A `maxHeight` prop used to make this a vertical scroller
    too, and every table in the app passed one — so reading a long board meant
    scrolling a box inside the page, hitting the bottom of the document with
    rows still hidden, then hunting for the inner scrollbar. The page scrolls;
    the table is as tall as its rows. Wide tables still scroll sideways in place
    rather than pushing the document over.
  */
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-10">
          {bands.length > 0 && (
            <tr className="bg-panelRaised border-b border-borderSubtle/60">
              {bands.map((b, i) => (
                <th
                  key={`${b.name}-${i}`}
                  colSpan={b.span}
                  scope="colgroup"
                  className={`px-3 pt-2 pb-1 font-mono text-micro font-semibold uppercase tracking-widest text-textMuted whitespace-nowrap text-left ${
                    i > 0 ? 'border-l border-borderSubtle/60' : ''
                  }`}
                >
                  {b.name}
                </th>
              ))}
            </tr>
          )}
          <tr className="bg-panelRaised border-b border-borderSubtle">
            {columns.map(col => (
              <th
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                aria-sort={
                  col.sortValue
                    ? sort?.key === col.key
                      ? sort.dir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                    : undefined
                }
                tabIndex={col.sortValue ? 0 : undefined}
                onKeyDown={
                  col.sortValue
                    ? e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleSort(col);
                        }
                      }
                    : undefined
                }
                className={`px-3 py-2 font-mono text-label font-semibold uppercase tracking-wider text-textSecondary whitespace-nowrap ${
                  col.align === 'right' ? 'text-right' : 'text-left'
                } ${col.sortValue ? 'cursor-pointer select-none hover:text-textPrimary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60' : ''}`}
                onClick={() => toggleSort(col)}
              >
                <span className={`inline-flex items-center gap-1 ${col.headerHidden ? 'sr-only' : ''}`}>
                  {col.align === 'right' && sort?.key === col.key && (
                    sort.dir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />
                  )}
                  {col.help ? <Term k={col.help}>{preserveGreek(col.header)}</Term> : preserveGreek(col.header)}
                  {col.align !== 'right' && sort?.key === col.key && (
                    sort.dir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>
                <EmptyState size="sm" title={emptyText} />
              </td>
            </tr>
          ) : (
            sortedRows.map(row => {
              const key = rowKey(row);
              const selected = selectedKey === key;
              // aria-current, not aria-selected: a `row` only supports selection
              // inside a grid, and this is a table. ui/interactiveRow.ts states
              // the rule once for every clickable row in the app.
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  aria-current={onRowClick && selected ? true : undefined}
                  onKeyDown={
                    onRowClick
                      ? e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                  className={`border-b border-borderSubtle/60 last:border-0 transition-colors ${
                    onRowClick
                      ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60'
                      : ''
                  } ${
                    selected
                      ? 'inst-selected'
                      : 'hover:bg-rowHover'
                  }`}
                >
                  {columns.map(col => (
                    <td
                      key={col.key}
                      className={`px-3 py-2 font-mono text-caption tnum whitespace-nowrap ${
                        col.align === 'right' ? 'text-right' : 'text-left'
                      } leading-4`}
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
    </div>
  );
};

export default DataTable;
