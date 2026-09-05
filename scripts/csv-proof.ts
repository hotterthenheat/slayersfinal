/*
  Acceptance test for the export path (6.2, and every other Export door).

  A CSV writer looks like joining strings with commas. It is not: there are
  four ways to get it wrong, each of which produces a file that opens
  without complaint and is wrong. Two of them are about correctness and one
  is about the reader's machine.
*/
import { csvCell, csvRow, toCsv, csvFilename, isFormulaLike } from '../src/core/csv';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

// ── quoting ──────────────────────────────────────────────────────────────
{
  check('a plain value is left alone', csvCell('SPY') === 'SPY');
  check('a comma forces quotes', csvCell('a,b') === '"a,b"', csvCell('a,b'));
  check('a quote is doubled inside quotes', csvCell('say "hi"') === '"say ""hi"""', csvCell('say "hi"'));
  check('a newline forces quotes', csvCell('a\nb') === '"a\nb"', JSON.stringify(csvCell('a\nb')));
  check('a carriage return forces quotes too', csvCell('a\rb') === '"a\rb"', JSON.stringify(csvCell('a\rb')));
  check('null and undefined are empty, not the words',
    csvCell(null) === '' && csvCell(undefined) === '');
  check('a number survives as its digits', csvCell(1234.5) === '1234.5');

  /*
    THE SHIFT THIS PREVENTS. Without quoting, one comma in one cell moves
    every column after it by one for the rest of that row — and the file
    still opens, still looks like a table, and is wrong from that cell on.
  */
  const row = csvRow(['NVDA', 'a,b', 42]);
  check('a comma inside a cell does not add a column',
    row.split(',').length !== 3 && row === 'NVDA,"a,b",42', row);
}

// ── formula injection ────────────────────────────────────────────────────
{
  /*
    Excel, LibreOffice and Sheets EXECUTE a cell beginning with =, +, - or
    @. On this desk the fields a person types — a saved screen's name, a
    journal note, a reason tag — reach the exporter directly, so this is a
    live path and not a theoretical one.
  */
  for (const evil of ['=1+1', '+1+1', '@SUM(A1)', '=HYPERLINK("http://x","click")', "=cmd|'/c calc'!A1"]) {
    const out = csvCell(evil);
    check(`defangs ${evil.slice(0, 22)}`, out.startsWith('\t') || out.startsWith('"\t'), out.slice(0, 24));
  }
  check('a tab-led value is defanged too', csvCell('\t=1+1').startsWith('\t'));

  /*
    AND A NEGATIVE NUMBER IS NOT A FORMULA. This is the half a naive
    first-character check gets wrong, in a file full of negative premiums:
    defang it and every bearish figure arrives as text and nothing sums.
  */
  check('-1234.5 is a number, not a formula', csvCell('-1234.5') === '-1234.5' && !isFormulaLike('-1234.5'));
  check('a negative number typed by the caller survives', csvCell(-98765.4) === '-98765.4');
  check('-$1,234 reads as a number despite its dressing', !isFormulaLike('-$1,234'), csvCell('-$1,234'));
  check('a bare hyphen placeholder is harmless but still defanged',
    isFormulaLike('-') === true, csvCell('-'));
  check('an empty cell is not a formula', !isFormulaLike(''));
  check('a minus-led WORD is defanged', isFormulaLike('-cmd'), csvCell('-cmd'));
}

// ── the file ─────────────────────────────────────────────────────────────
{
  const cols = [{ key: 'ticker', label: 'Ticker' }, { key: 'net', label: 'Net' }];
  const rows = [{ ticker: 'SPY', net: -1200 }, { ticker: 'Q,Q', net: 340 }];
  const out = toCsv(cols, rows, (r, k) => (r as Record<string, unknown>)[k]);

  check('the file opens with a UTF-8 BOM', out.charCodeAt(0) === 0xfeff, `U+${out.charCodeAt(0).toString(16)}`);
  check('lines are CRLF, as RFC 4180 says', out.includes('\r\n') && !/[^\r]\n/.test(out));
  check('the header carries the LABELS, not the keys', out.includes('Ticker,Net'));
  check('a negative figure is exported as a number', out.includes('SPY,-1200'), out.split('\r\n')[1]);
  check('a comma in the data is quoted', out.includes('"Q,Q",340'));
  check('the file ends with a line break', out.endsWith('\r\n'));
  check('there is one line per row plus a header',
    out.replace(/\r\n$/, '').split('\r\n').length === rows.length + 1);

  /*
    COLUMN ORDER IS THE CALLER'S, which on the desk means the order the
    reader is looking at. An export that quietly reorders — or reinstates a
    column the reader hid — is a different table than the one on screen,
    and they will not find out until they act on it.
  */
  const flipped = toCsv([cols[1], cols[0]], rows, (r, k) => (r as Record<string, unknown>)[k]);
  check('reordering the columns reorders the file', flipped.includes('Net,Ticker') && flipped.includes('-1200,SPY'));
  const trimmed = toCsv([cols[0]], rows, (r, k) => (r as Record<string, unknown>)[k]);
  check('a hidden column stays out of the file', !trimmed.includes('-1200') && trimmed.includes('Ticker'));

  check('no rows still yields a usable header', toCsv(cols, [], () => '').includes('Ticker,Net'));
}

// ── the filename ─────────────────────────────────────────────────────────
{
  const at = new Date(2026, 8, 5, 14, 7);
  check('the stamp is sortable', csvFilename('screener', at) === 'screener-20260905-1407.csv', csvFilename('screener', at));
  check('path separators cannot escape the name',
    !csvFilename('a/b\\c', at).includes('/') && !csvFilename('a/b\\c', at).includes('\\'),
    csvFilename('a/b\\c', at));
  check('Windows-forbidden characters are stripped',
    !/[:*?"<>|]/.test(csvFilename('a:b*c?d"e<f>g|h', at)), csvFilename('a:b*c?d"e<f>g|h', at));
  check('spaces become hyphens', csvFilename('my screen', at) === 'my-screen-20260905-1407.csv');
  check('an empty name still produces a file', csvFilename('', at) === 'export-20260905-1407.csv', csvFilename('', at));
  check('a name of nothing but dots does too', csvFilename('...', at) === 'export-20260905-1407.csv', csvFilename('...', at));
  check('a very long name is bounded', csvFilename('x'.repeat(400), at).length < 80);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
