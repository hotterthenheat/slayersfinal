import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
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

  return (
    <div className="overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
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
        <tbody>
          {sortedRows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center font-mono text-[11px] text-textMuted">
                {emptyText}
              </td>
            </tr>
          ) : (
            sortedRows.map(row => {
              const key = rowKey(row);
              const selected = selectedKey === key;
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border-b border-borderSubtle/60 last:border-0 transition-colors ${
                    onRowClick ? 'cursor-pointer' : ''
                  } ${
                    selected
                      ? 'bg-select/[0.06] shadow-[inset_2px_0_0_0_rgba(199,211,232,0.7)]'
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
    </div>
  );
};

export default DataTable;
