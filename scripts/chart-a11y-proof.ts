/*
  Acceptance test for 0.13 — "screen-reader labels on charts (summary text
  alternative)".

  THE ITEM HAS TWO HALVES AND THE SECOND ONE IS THE HARDER ONE.

  A chart that carries information available nowhere else needs a summary,
  or a reader who cannot see it gets an empty box between two headings.
  Canvas and bare SVG are the worst cases — recharts and
  lightweight-charts both render graphics with no accessible name at all.

  But a chart that DECORATES a number already on the page needs the
  opposite: it must get out of the way. A sparkline beside "68%" described
  aloud makes a reader hear the same fact twice, once in a worse form. So
  labelling everything is not the goal, and this proof checks the decision
  rather than the count — every chart is either named or explicitly hidden,
  and nothing is left silently unlabelled.

  AND THE SUMMARY STATES THE READING, NOT THE PICTURE. "Buyers, +$4.2M,
  crossed zero twice" is what a sighted reader takes in a second; "a line
  chart trending upward" is a description of ink.
*/
import { readFileSync, readdirSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const DIRS = ['src/components/gex', 'src/components/trace'];
const files: { path: string; src: string }[] = [];
for (const d of DIRS) {
  for (const f of readdirSync(d)) {
    if (!f.endsWith('.tsx')) continue;
    files.push({ path: `${d}/${f}`, src: readFileSync(`${d}/${f}`, 'utf8') });
  }
}
check('PREMISE: there are components to audit', files.length > 10, `${files.length} files`);

// ── every graphic is either named or deliberately hidden ────────────────
{
  /* A component draws a graphic if it renders SVG directly, mounts a
     charting library, or paints a canvas. Anything matching and doing
     neither of the two right things is the failure. */
  const draws = files.filter(f =>
    /<svg[\s>]/.test(f.src) || /createChart\(/.test(f.src) || /<ResponsiveContainer/.test(f.src) || /getContext\(['"]2d/.test(f.src)
  );
  check('several components draw graphics', draws.length >= 5, draws.length + ' drawing components');

  const unlabelled = draws.filter(f => !/aria-label|aria-hidden|role="img"/.test(f.src));
  check('every drawing component either names its graphic or hides it',
    unlabelled.length === 0,
    unlabelled.map(f => f.path.split('/').pop()).join(', '));
}

// ── the summaries say what the chart MEANS ──────────────────────────────
{
  const named = [
    'src/components/gex/OrderFlowPanel.tsx',
    'src/components/trace/NetFlowPane.tsx',
    'src/components/trace/ContractFlowChart.tsx',
    'src/components/gex/StrikeChart.tsx',
  ];
  for (const p of named) {
    const src = readFileSync(p, 'utf8');
    const short = p.split('/').pop() as string;
    check(`${short} builds a summary rather than a static label`,
      /aria-label=\{/.test(src),
      'the label is computed from the data');
    /* A label that says only what KIND of chart it is tells the reader
       nothing they could not guess from the heading above it. */
    check(`${short}'s summary carries figures, not just a chart type`,
      /\$\{/.test(src.slice(Math.max(0, src.indexOf('Summary')), src.indexOf('Summary') + 900)) ||
      /fmtUsd|toFixed|toLocaleString/.test(src),
      'interpolates real values');
  }
}

// ── the decorative one is hidden, and says why ─────────────────────────
{
  const trend = readFileSync('src/components/gex/TrendLine.tsx', 'utf8');
  check('the sparkline is hidden from assistive tech', /aria-hidden="true"/.test(trend));
  check('and it is not focusable, so a keyboard cannot land on nothing',
    /focusable="false"/.test(trend));
  /* The reason has to be written down, or the next person "fixes" it by
     adding a label and makes the page worse. */
  check('and the file says why hiding is the right answer here',
    /decorat/i.test(trend) && /twice/i.test(trend));
}

// ── the empty case still says something ─────────────────────────────────
{
  const net = readFileSync('src/components/trace/NetFlowPane.tsx', 'utf8');
  check('a chart with no data still describes itself',
    /nothing has printed in this cut yet/i.test(net));
  const cf = readFileSync('src/components/trace/ContractFlowChart.tsx', 'utf8');
  check('and so does the ledger', /nothing has printed on this contract/i.test(cf));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
