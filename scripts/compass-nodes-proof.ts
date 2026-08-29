import Simulator from '../src/core/simulator';
import { makeSetup } from '../src/data/compass';
import { buildSetupTrack } from '../src/components/compass/trackModel';
import { buildNodes, levelReason } from '../src/components/compass/nodeReasons';
import type { OptionRight, Setup } from '../src/types/compass';

/*
==================================================
  SLAYER TERMINAL - CAMPAIGN NODE RAIL (proof)
==================================================

  THE BUG THIS FILE EXISTS FOR was in the shipped screenshot and I did not
  see it. The stop's sentence read "Below 129.75 the contract is worth about
  $1.04" — about a PUT, whose own card two panels away read "Breaks ABOVE
  129.93". A call is invalidated when the underlying falls through its level
  and a put when it rises through one, and a hardcoded word cannot be right
  about both. The type checker had nothing to say, and a screenshot of a
  call would have looked perfect.

  So every assertion here is about the SENTENCE agreeing with the number
  printed beside it:

  · the stop's side is read off the price, so it is right for both rights
  · a target quotes the spot the model actually solved for, and its
    direction agrees with the arithmetic
  · an unreachable target says so in words rather than printing a number
    nothing produced
  · the rail runs highest premium first, so it reads in the same direction
    as the chart it sits beside — the two views of one plan cannot disagree
    about which rung is on top
*/

let failed = 0;
const ok = (m: string) => console.log(`  ok   ${m}`);
const bad = (m: string) => { failed++; console.log(`  FAIL ${m}`); };
const t = (c: boolean, m: string) => (c ? ok(m) : bad(m));
const head = (m: string) => console.log(`\n${m}\n`);

const fixture = (ticker: string, right: OptionRight, offset: number): { setup: Setup; spot: number } => {
  Simulator.ensureTicker(ticker);
  const cfg = Simulator.TICKERS[ticker];
  const spot = cfg.currentPrice;
  const strike = Math.round(spot + offset);
  return { setup: makeSetup(ticker, spot, strike, right, 'top-setups', cfg.iv, 'odte'), spot };
};

const railFor = (ticker: string, right: OptionRight, offset: number, retired = false) => {
  const { setup } = fixture(ticker, right, offset);
  const track = buildSetupTrack(setup, Simulator.getCandles(ticker) ?? []);
  return { setup, track, nodes: buildNodes(track.levels, { setup, spotNow: track.spotNow, retired }) };
};

/* ── both rights, and the stop's side ────────────────────────────────── */
head('the stop names the side it is actually on');

for (const [ticker, right, offset] of [
  ['SPY', 'C', 3], ['SPY', 'P', -3], ['NVDA', 'P', -2], ['AAPL', 'C', 2],
] as [string, OptionRight, number][]) {
  const { setup, track, nodes } = railFor(ticker, right, offset);
  const stop = nodes.find(n => n.level.status === 'STOP');
  if (!stop) { bad(`${ticker} ${right}: PREMISE — no stop rung on the rail`); continue; }
  const above = setup.invalidationPrice > track.spotNow;
  const says = /\bAbove\b/.test(stop.reason) ? 'above' : /\bBelow\b/.test(stop.reason) ? 'below' : 'neither';
  t(says === (above ? 'above' : 'below'),
    `${ticker} ${right} ${setup.strike}: stop at ${setup.invalidationPrice.toFixed(2)} vs spot ${track.spotNow.toFixed(2)} — the line says "${says}"`);
  /* The reason is two sentences glued together and the first is a fragment
     from a table cell; a missing full stop ran them into one another. */
  t(!/\s{2,}/.test(stop.reason), `${ticker} ${right}: and it has no doubled spaces`);
  t(/[.!?]$/.test(stop.reason), `${ticker} ${right}: and it ends as a sentence`);
}

/* Both directions have to actually OCCUR, or the check above is a claim
   about one branch tested twice. */
{
  const sides = (['C', 'P'] as OptionRight[]).map(r => {
    const { setup, track } = railFor('SPY', r, r === 'C' ? 3 : -3);
    return setup.invalidationPrice > track.spotNow ? 'above' : 'below';
  });
  t(new Set(sides).size === 2, `PREMISE: a call and a put really do stop on opposite sides — ${sides.join(' / ')}`);
}

/* ── a target quotes the number the model solved for ─────────────────── */
head('a target quotes the spot the model solved for, in the right direction');

{
  const { setup, track, nodes } = railFor('SPY', 'C', 3);
  const targets = nodes.filter(n => n.level.key.startsWith('tp'));
  t(targets.length > 0, `PREMISE: the campaign has rungs — ${targets.length}`);
  for (const { level, reason } of targets) {
    if (level.status === 'HIT') {
      t(reason.includes(level.premium.toFixed(2)), `${level.label} (hit): names the premium it banked`);
      continue;
    }
    if (level.spotNeeded == null) {
      t(/No .* price inside/.test(reason) && !/\d+\.\d\d,/.test(reason),
        `${level.label}: unreachable, and says so rather than printing a number`);
      continue;
    }
    t(reason.includes(level.spotNeeded.toFixed(2)),
      `${level.label}: quotes ${level.spotNeeded.toFixed(2)}, the price the solver returned`);
    const above = level.spotNeeded > track.spotNow;
    t(new RegExp(`% ${above ? 'above' : 'below'} `).test(reason),
      `${level.label}: and calls it ${above ? 'above' : 'below'} ${track.spotNow.toFixed(2)}`);
  }
  t(nodes.every(n => n.reason.trim().length > 0 && /[.!?]$/.test(n.reason)),
    `every rung on ${setup.contract} carries a finished sentence`);
}

/* ── the order matches the chart ─────────────────────────────────────── */
head('the rail runs in the chart\'s own direction');

for (const [ticker, right, offset] of [['SPY', 'C', 3], ['NVDA', 'P', -2]] as [string, OptionRight, number][]) {
  const { nodes, track } = railFor(ticker, right, offset);
  const prem = nodes.map(n => n.level.premium);
  t(prem.every((v, i) => i === 0 || prem[i - 1] >= v),
    `${ticker} ${right}: highest premium first — ${prem.map(v => v.toFixed(2)).join(' > ')}`);
  /* And it holds every rung the chart draws a line for: a node the chart has
     no line for, or a line with no node, is the two views disagreeing. */
  t(nodes.length === track.levels.length,
    `${ticker} ${right}: every level on the chart has a node — ${nodes.length} of ${track.levels.length}`);
}

/* ── a retired campaign stops giving instructions ────────────────────── */
head('a retired campaign stops telling the reader what to do');

{
  const { nodes } = railFor('SPY', 'C', 3, true);
  const pending = nodes.filter(n => n.level.status === 'PENDING' || n.level.status === 'IN PROGRESS');
  t(pending.length > 0, `PREMISE: there are unfinished rungs to speak about — ${pending.length}`);
  t(pending.every(n => /retired/.test(n.reason) && !/has to reach/.test(n.reason)),
    'no unfinished rung still says what the underlying "has to reach"');
  /* The rungs that are FACTS stay facts — a retired campaign still banked
     what it banked, and still opened where it opened. */
  const ref = nodes.find(n => n.level.status === 'REF');
  t(!!ref && /Opened here/.test(ref.reason), 'and the reference still says where the position was opened');
}

/* ── the reason never restates its own row ───────────────────────────── */
head('a reason adds something the row does not already print');

{
  const { nodes } = railFor('AAPL', 'C', 2);
  const target = nodes.find(n => n.level.key.startsWith('tp') && n.level.spotNeeded != null);
  if (!target) bad('PREMISE: no reachable target to check');
  else {
    t(!target.reason.startsWith(`${target.level.label} `),
      `${target.level.label}: the sentence does not open by repeating the label`);
    t(/\d/.test(target.reason), 'and it carries a figure the row itself does not show');
  }
}

/* ── nothing throws on a degenerate level ────────────────────────────── */
head('a level with nothing behind it still produces a sentence');

{
  const { setup, track } = railFor('SPY', 'C', 3);
  const orphan = { key: 'tp9', label: 'TP9', premium: 0, fromRefPct: 0, spotNeeded: null, status: 'PENDING' as const, docked: true };
  const r = levelReason(orphan, { setup, spotNow: track.spotNow, retired: false });
  t(typeof r === 'string' && r.length > 0 && /[.!?]$/.test(r), `an unreachable, docked rung reads: "${r}"`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${failed} failing\n`);
process.exit(failed === 0 ? 0 : 1);
