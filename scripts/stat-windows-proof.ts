/*
  Acceptance test for 7.3 — every stat states its window.

  "A 20-day and 60-day number are different claims and must not share a
   label."

  The sharpest case on this desk is the sleeve column. Four scores render
  as four identical bars, 0-100, stacked in one cell — and momentum is 30
  sessions of price while quality is four quarters of filings. Two bars the
  same length, measured over windows an order of magnitude apart, read as
  two equally weighted votes on the same question. They are not.
*/
import { readFileSync } from 'node:fs';
import { SLEEVE_WINDOWS, buildStockBoard, buildSectorBoard, type StockSleeves } from '../src/data/stocks';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const board = buildStockBoard();
check('PREMISE: there is a board with sleeve scores', board.length > 0, `${board.length} names`);

// ── every sleeve declares a window ──────────────────────────────────────
{
  const sleeves = Object.keys(board[0].sleeves) as (keyof StockSleeves)[];
  check('every sleeve on the row has a declared window',
    sleeves.every(k => SLEEVE_WINDOWS[k]?.window?.length > 0),
    sleeves.map(k => `${k}=${SLEEVE_WINDOWS[k]?.window}`).join(' · '));
  check('and nothing is declared that is not a sleeve',
    Object.keys(SLEEVE_WINDOWS).every(k => sleeves.includes(k as keyof StockSleeves)));

  /*
    THE WINDOWS MUST ACTUALLY DIFFER, which is the whole point. If they
    were all "30 days" the disclosure would be noise; the reason it matters
    is that they span from one session to a fiscal year.
  */
  const windows = sleeves.map(k => SLEEVE_WINDOWS[k].window);
  check('the four windows are genuinely different', new Set(windows).size === windows.length,
    windows.join(' | '));

  check('each window carries a note explaining what that span means for the score',
    sleeves.every(k => SLEEVE_WINDOWS[k].note.length > 50));
  /* A note that only restates the window teaches nothing. The useful part
     is what the span implies — which sleeve turns first, which sits still. */
  const notes = sleeves.map(k => SLEEVE_WINDOWS[k].note.toLowerCase()).join(' ');
  check('the notes say what the differing spans imply',
    /turns first|sit still|reverse|decays/.test(notes));
}

// ── the surface carries it ──────────────────────────────────────────────
{
  const page = readFileSync('src/pages/Stocks.tsx', 'utf8');
  check('the bars quote the window from the shared table, not a literal',
    page.includes('SLEEVE_WINDOWS[sleeve]'));
  /* On hover AND in the header: a reader scanning the column should see
     the difference without having to discover a tooltip. */
  check('and the header names the spans without a hover',
    /30d · 4Q · today · 7d/.test(page));

  check('the short-interest column separates its two vintages',
    /settled · vs ADV/.test(page),
    'short interest is a settlement figure; days-to-cover moves daily');
}

// ── the sector board's two windows are named where they are drawn ───────
{
  const sectors = buildSectorBoard(board);
  check('the sector board builds', sectors.length > 0, `${sectors.length} sectors`);
  check('it carries two relative-strength windows', sectors.every(s =>
    Number.isFinite(s.rs1w) && Number.isFinite(s.rs1m)));
  const page = readFileSync('src/pages/Stocks.tsx', 'utf8');
  check('and both are labelled on the surface', /1w /.test(page) && /1m /.test(page));

  /*
    THE PHASE IS THE TWO WINDOWS DISAGREEING OR AGREEING, so it is only
    meaningful if both are visible. A phase word next to one number would
    be a claim the reader cannot check.
  */
  const bothVisible = /rs1w/.test(page) && /rs1m/.test(page);
  check('the phase word sits beside both windows it is derived from', bothVisible);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
