/*
  Acceptance test for Part 2 — "Indicator picker with parameter editing".

  The one invariant that matters is the one the old sub-pane spec was
  written to hold: THE LEGEND NAMES THE PERIOD THE SERIES USES. Parameter
  editing makes that harder to keep, not easier — there are now three
  readers of the period (chart, menu, legend) and a reader can change it —
  so the proof pins every reader to one table and then reads the chart's
  source to make sure no literal survived.
*/
import { readFileSync } from 'node:fs';
import {
  PARAM_KEYS,
  PARAM_SPEC,
  isCustom,
  paramLabel,
  paramsFor,
  withParam,
  type IndicatorParams,
} from '../src/data/indicatorParams';
import { DEFAULT_INDICATORS, SUB_PANE_SPEC, subPaneLegend } from '../src/components/gex/StrikeChart';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

// ---- the table is well-formed ---------------------------------------------------
for (const k of PARAM_KEYS) {
  const s = PARAM_SPEC[k];
  const n = s.defaults.length;
  check(`${k}: labels, defaults, min, max and decimals all have ${n} slots`,
    [s.labels, s.min, s.max, s.decimals].every(a => a.length === n));
  check(`${k}: every default sits inside its own bounds`,
    s.defaults.every((d, i) => d >= s.min[i] && d <= s.max[i]));
}
check('every param key is an indicator the chart knows', PARAM_KEYS.every(k => k in DEFAULT_INDICATORS));

// ---- the sub-pane spec is THIS table, not a second copy -------------------------
for (const [k, spec] of Object.entries(SUB_PANE_SPEC)) {
  if (!spec || spec.params.length === 0) continue;
  check(`${k}: the sub-pane spec's periods are the param table's defaults`,
    JSON.stringify(spec.params) === JSON.stringify(PARAM_SPEC[k as keyof typeof PARAM_SPEC]?.defaults),
    `${spec.params.join(' ')} vs ${PARAM_SPEC[k as keyof typeof PARAM_SPEC]?.defaults.join(' ')}`);
}

// ---- defaults, overrides, clamping ------------------------------------------------
check('no overrides means the defaults', JSON.stringify(paramsFor('rsi')) === '[14]');
check('an override is honoured', paramsFor('rsi', { rsi: [9] })[0] === 9);
check('a partial override fills the rest from defaults — MACD fast only', JSON.stringify(paramsFor('macd', { macd: [8] })) === '[8,26,9]');
check('an override under the floor is clamped up', paramsFor('rsi', { rsi: [1] })[0] === PARAM_SPEC.rsi.min[0]);
check('an override over the ceiling is clamped down', paramsFor('rsi', { rsi: [9999] })[0] === PARAM_SPEC.rsi.max[0]);
check('NaN falls back to the default rather than poisoning the series', paramsFor('rsi', { rsi: [NaN] })[0] === 14);
check('a fractional period is rounded to a whole bar', paramsFor('rsi', { rsi: [13.6] })[0] === 14);
check('but a multiplier keeps one decimal', paramsFor('bb', { bb: [20, 2.25] })[1] === 2.3);
check('isCustom is false on defaults', !isCustom('bb'));
check('and true once moved', isCustom('bb', { bb: [20, 3] }));

// ---- the label follows the parameter -------------------------------------------
check('EMA labels its period', paramLabel('ema21') === 'EMA 21');
check('and follows an edit', paramLabel('ema21', { ema21: [13] }) === 'EMA 13');
check('MACD lists three periods with spaces', paramLabel('macd') === 'MACD 12 26 9');
check('Bollinger joins period and σ with a middle dot', paramLabel('bb') === 'BB 20·2', paramLabel('bb'));
check('and a non-integer σ keeps its decimal', paramLabel('bb', { bb: [20, 2.5] }) === 'BB 20·2.5');
check('the chart legend prints the same words', subPaneLegend('rsi', { rsi: [9] }) === 'RSI 9');
check('and the legend with no params is the legend it always was', subPaneLegend('macd') === 'MACD 12 26 9');

// ---- editing round-trips cleanly ----------------------------------------------------
{
  let p: IndicatorParams | undefined = undefined;
  p = withParam(p, 'rsi', 0, 9);
  check('setting a slot creates the entry', JSON.stringify(p) === '{"rsi":[9]}');
  p = withParam(p, 'macd', 1, 30);
  check('a second indicator keeps the first', p.rsi?.[0] === 9 && JSON.stringify(p.macd) === '[12,30,9]');
  p = withParam(p, 'rsi', 0, 14);
  check('RESTORING A DEFAULT REMOVES THE KEY, so an edited-then-restored config serialises like an untouched one', !('rsi' in p));
  p = withParam(p, 'macd', 0, 0);
  check('an out-of-range edit lands on the bound, not off the chart', p.macd?.[0] === PARAM_SPEC.macd.min[0]);
}

// ---- no literal survived in the chart ------------------------------------------------
{
  const src = readFileSync('src/components/gex/StrikeChart.tsx', 'utf8');
  const literals = [
    /bollingerSeries\(bars,\s*20,\s*2\)/,
    /smaSeries\(bars,\s*200\)/,
    /rsiSeries\(bars,\s*14\)/,
    /donchianSeries\(bars,\s*20\)/,
    /supertrendSeries\(bars,\s*10,\s*3\)/,
    /keltnerSeries\(bars,\s*20,\s*10,\s*2\)/,
    /key === 'ema9' \? 9 : key === 'ema21' \? 21 : 50/,
    /a\.source === 'ema9' \? 9/,
  ];
  const left = literals.filter(re => re.test(src));
  check('every hardcoded period in the chart went through the table', left.length === 0, left.map(String).join(' | '));
  /* The rebuild signature is the line that starts with the ticker and
     timeframe; the params have to be ON that line, or a period change with
     no series added or removed leaves the reader watching RSI 14 under a
     legend that says 9. Matched on the line itself rather than on a window
     of characters before the ref assignment — the first draft looked 2,500
     characters back and the effect body is nearly twice that. */
  check(
    'the series rebuild is keyed on the params too',
    /const sig = `\$\{ticker\}\|\$\{timeframe\}\|\$\{barClock\}[^\n]*indicators\.params/.test(src)
  );
}

// ---- the menu offers the editor and bounds it ------------------------------------------
{
  const src = readFileSync('src/components/gex/ChartToolbar.tsx', 'utf8');
  check('the menu renders a parameter editor', /withParam\(/.test(src));
  check('with the table\'s bounds on the input', /min=\{spec\.min\[i\]\}/.test(src) && /max=\{spec\.max\[i\]\}/.test(src));
  check('and the row label follows the parameter', /paramLabel\(/.test(src));
  check('and offers a way back to the defaults', /NO_PARAMS|reset/i.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
