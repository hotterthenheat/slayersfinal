/*
==================================================
  SLAYER TERMINAL - EXPORT, WITHOUT THE FOOTGUNS
  (core/csv.ts)
==================================================

  Sections 6.2 and 7.x ask for export. Writing a CSV looks like joining
  strings with commas, and it is not — there are four ways to get it wrong
  and each one produces a file that opens without complaint and is wrong.

  QUOTING. A value containing a comma, a quote, a newline or a carriage
  return must be quoted, and an embedded quote doubled. Miss it and every
  column after the offending one shifts by one, silently, for the rest of
  the row. Ticker names are safe; a screen NAME the reader typed is not.

  FORMULA INJECTION, which is the one that matters and the one nearly every
  hand-rolled exporter misses. Excel, LibreOffice and Sheets EXECUTE a cell
  beginning with =, +, - or @. A field carrying `=HYPERLINK(...)` or
  `=cmd|'/c calc'!A1` runs when the reader opens the file — and on this desk
  the fields a person can type (a saved screen's name, a journal note, a
  reason tag) reach the exporter directly. Every such cell is prefixed with
  a tab, which the spreadsheet strips on display and refuses to evaluate.

  A NEGATIVE NUMBER IS NOT A FORMULA. `-1234.5` begins with a hyphen and
  must not be defanged, or every bearish figure in the file arrives as text
  and nothing sums. The guard tests whether the value PARSES as a number
  before it looks at the first character — the exact case a naive
  first-character check gets wrong, in a file full of negative premiums.

  THE BOM IS DELIBERATE. Excel on Windows reads a UTF-8 CSV as the local
  code page unless the file opens with a byte-order mark, so a ticker with
  an accent or a note with an em dash arrives as mojibake. Three bytes buy
  correctness on the platform most readers are using.

  CRLF, likewise: RFC 4180 says CRLF, and older Excel builds treat a bare
  LF file as one enormous row.
*/

const NEEDS_QUOTES = /[",\r\n]/;
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/** True when a cell would be evaluated rather than displayed. */
export function isFormulaLike(value: string): boolean {
  if (value === '') return false;
  // A number is a number, whatever it starts with — see the header.
  if (Number.isFinite(Number(value.replace(/[$,%\s]/g, '')))) return false;
  return FORMULA_LEAD.test(value);
}

/** One cell, quoted and defanged as needed. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'string' ? value : String(value);
  if (isFormulaLike(s)) s = `\t${s}`;
  if (NEEDS_QUOTES.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvRow(cells: readonly unknown[]): string {
  return cells.map(csvCell).join(',');
}

/**
 * A whole file: header row, then data rows, CRLF-separated, BOM-prefixed.
 *
 * Rows are read through `pick` rather than by key order, so the file's
 * column order is the caller's — which on this desk means the ORDER THE
 * READER SEES, including any columns they hid. An export that silently
 * reorders or reinstates columns is a different table than the one on
 * screen, and the reader will not notice until they act on it.
 */
export function toCsv<T>(
  columns: readonly { key: string; label: string }[],
  rows: readonly T[],
  pick: (row: T, key: string) => unknown
): string {
  const lines = [csvRow(columns.map(c => c.label))];
  for (const r of rows) lines.push(csvRow(columns.map(c => pick(r, c.key))));
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** A filename that is safe on every platform and says what it holds. */
export function csvFilename(base: string, at: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}`;
  /* Windows forbids \ / : * ? " < > | and trailing dots; the rest of the
     world mostly objects to slashes. One rule, applied everywhere, rather
     than a per-platform branch nobody can test. */
  const safe = base.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '-').replace(/^\.+|\.+$/g, '').slice(0, 60) || 'export';
  return `${safe}-${stamp}.csv`;
}
