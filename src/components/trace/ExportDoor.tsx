import { useState } from 'react';
import { Download, Check } from 'lucide-react';
import { toCsv, csvFilename } from '../../core/csv';

/*
  6.2 · EXPORT — the door, and what it promises.

  THE FILE IS THE TABLE ON SCREEN. Same rows, same order, same columns —
  including the ones the reader hid, which stay hidden. An export that
  quietly reinstates a column or re-sorts is a DIFFERENT table wearing the
  same name, and the reader finds out after they have acted on it.

  So `columns` and `rows` are handed in already filtered and already sorted
  by the caller, and this component does no thinking of its own.

  The escaping, the formula defanging and the BOM live in core/csv.ts with
  their own proof — a spreadsheet executes a cell beginning with `=`, and
  the names on this page are typed by a person.
*/

export interface ExportDoorProps<T> {
  /** The columns AS SHOWN, in the order shown. */
  columns: readonly { key: string; label: string }[];
  /** The rows AS SHOWN — already filtered, already sorted. */
  rows: readonly T[];
  /** One cell. Return a primitive; formatting is the caller's to choose. */
  pick: (row: T, key: string) => unknown;
  /** Filename stem, e.g. "screener" or "footprints". */
  name: string;
  className?: string;
}

function ExportDoor<T>({ columns, rows, pick, name, className = '' }: ExportDoorProps<T>) {
  const [done, setDone] = useState(false);

  const save = () => {
    const blob = new Blob([toCsv(columns, rows, pick)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = csvFilename(name);
    document.body.appendChild(a);
    a.click();
    a.remove();
    /* Revoked on the next frame, not immediately: Safari has not started the
       download when click() returns, and a URL revoked underneath it yields
       an empty file with no error anywhere. */
    requestAnimationFrame(() => URL.revokeObjectURL(url));
    setDone(true);
    window.setTimeout(() => setDone(false), 1600);
  };

  const n = rows.length;
  return (
    <button
      type="button"
      onClick={save}
      disabled={n === 0}
      title={n === 0 ? 'Nothing to export on this cut' : `Download these ${n.toLocaleString('en-US')} rows as CSV — the table exactly as shown`}
      className={`inline-flex items-center gap-1.5 rounded px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-textMuted transition-colors hover:bg-white/[0.06] hover:text-textPrimary disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-textMuted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-select ${className}`}
    >
      {done ? <Check className="w-3 h-3 text-bull" /> : <Download className="w-3 h-3" />}
      {done ? 'saved' : 'export'}
    </button>
  );
}

export default ExportDoor;
