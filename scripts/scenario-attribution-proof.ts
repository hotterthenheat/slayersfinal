/*
  Acceptance test for P-17/P-18's spot scenario and P-19's attribution.

  The scenario engine is the one on this page a reader will trust most and
  check least — "if we get to 5,880" comes back with confident numbers — so
  the assertions below are about what it must NOT do as much as what it
  does: it must not invent a book change, must not disagree with the live
  map about what a wall is, and must not hand back a flow whose sign
  contradicts the book it just read.

  Proves:
  1. Moving spot RE-PICKS the levels, and the picks equal the shared
     pickWalls / pickFlip the live map uses — no second opinion
  2. The book is held fixed: the supreme (a whole-book argmax) does not move
     with spot, and read at today's spot the scenario IS today's map
  3. The flow is signed by the book's own convention — a put-dominant book
     forces BUYING up and SELLING down, a call-dominant one the reverse
  4. Flow scales with the gamma crossed and with the move, and a zero move
     forces nothing
  5. Degenerate inputs report null rather than a scenario
  6. Attribution matches by TOLERANCE, not equality — a print off the grid
     still attributes — and never reaches into a neighbouring strike
  7. It ranks by premium with the later print winning ties, splits call from
     put rather than hiding the composition, and its concentration read is a
     SHARE, so the same composition reads the same at any size
*/
import { buildSpotScenario, flowWords } from '../src/data/spotScenario';
import { buildStrikeAttribution, attributionWords, CONCENTRATION_BAR } from '../src/data/attribution';
import { pickFlip, pickWalls } from '../src/core/walls';
import Simulator from '../src/core/simulator';
import type { StrikeNode } from '../src/types/market';
import type { FlowPrint } from '../src/types/trace';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const node = (strike: number, netGex: number): StrikeNode =>
  ({ strike, netGex } as unknown as StrikeNode);

// ── 1+2. the levels re-pick, the book does not move ───────────────────────
{
  const snap = Simulator.snapshotFor('SPY');
  const here = buildSpotScenario(snap.chain, snap.spot, snap.spot);
  check('PREMISE: a scenario builds', here !== null);
  const livePicked = pickWalls(snap.chain, snap.spot, n => n.netGex);
  check(
    "at today's spot it reproduces today's walls — no second opinion",
    here?.callWall === (livePicked.callWall ?? null) && here?.putWall === (livePicked.putWall ?? null),
    `${here?.callWall}/${here?.putWall}`
  );
  check("and today's flip", here?.flip === pickFlip(snap.chain, snap.spot, n => n.netGex));

  /* Moved above the whole book, every strike is below spot — so no strike
     is left that could be a call wall. */
  const high = Math.max(...snap.chain.map(n => n.strike)) + 50;
  const above = buildSpotScenario(snap.chain, snap.spot, high);
  check('moved above the whole book, nothing is left to be a call wall', above?.callWall === null, String(above?.callWall));
  check('and the scenario agrees with pickWalls at that spot', above?.putWall === (pickWalls(snap.chain, high, n => n.netGex).putWall ?? null));
  check('the supreme does not move with spot — the book is held fixed', here?.supreme === above?.supreme, `${here?.supreme} vs ${above?.supreme}`);
}

// ── 3+4. the flow, and its sign ───────────────────────────────────────────
{
  const putHeavy = [node(100, 1e8), node(101, 1e8), node(102, 1e8)];
  check('a put-dominant book forces BUYING on the way up', (buildSpotScenario(putHeavy, 100, 102)?.hedgingFlow ?? 0) > 0);
  check('and SELLING on the way down', (buildSpotScenario(putHeavy, 102, 100)?.hedgingFlow ?? 0) < 0);

  const callHeavy = [node(100, -1e8), node(101, -1e8), node(102, -1e8)];
  check('a call-dominant book sells into a rally', (buildSpotScenario(callHeavy, 100, 102)?.hedgingFlow ?? 0) < 0);
  check('and buys a decline', (buildSpotScenario(callHeavy, 102, 100)?.hedgingFlow ?? 0) > 0);

  const a = buildSpotScenario(putHeavy, 100, 102)!.hedgingFlow;
  const b = buildSpotScenario([node(100, 2e8), node(101, 2e8), node(102, 2e8)], 100, 102)!.hedgingFlow;
  check('twice the gamma crossed is twice the flow', Math.abs(b - 2 * a) < 1e-6, `${a} → ${b}`);
  const far = buildSpotScenario([...putHeavy, node(103, 1e8), node(104, 1e8)], 100, 104)!.hedgingFlow;
  check('a longer move crosses more and forces more', far > a);
  check('a zero move forces nothing', buildSpotScenario(putHeavy, 101, 101)?.hedgingFlow === 0);
  check('and says so rather than printing $0', /No move, no forced flow/.test(flowWords(buildSpotScenario(putHeavy, 101, 101)!)));
  check('the words name the direction and the dollars', /forces roughly \$/.test(flowWords(buildSpotScenario(putHeavy, 100, 102)!)));
}

// ── 5. degenerate ─────────────────────────────────────────────────────────
{
  check('an empty book yields no scenario', buildSpotScenario([], 100, 105) === null);
  check('and a nonsense spot yields none', buildSpotScenario([node(100, 1)], 0, 105) === null && buildSpotScenario([node(100, 1)], 100, -5) === null);
}

// ── 6+7. attribution ──────────────────────────────────────────────────────
{
  const print = (id: number, strike: number, premium: number, right: 'C' | 'P' = 'C', size = 100): FlowPrint =>
    ({ id, strike, premium, right, size } as unknown as FlowPrint);

  const prints = [
    print(1, 500, 1_000_000),
    print(2, 500.2, 500_000, 'P'), // inside a 1.0 step's tolerance
    print(3, 501, 9_000_000),      // the neighbour — must NOT be pulled in
    print(4, 499.4, 250_000),      // outside 0.5 tolerance of 500
  ];
  const at500 = buildStrikeAttribution(prints, 500, 1);
  check('a print off the grid by less than half a step still attributes', at500.prints.some(p => p.id === 2));
  check('the neighbouring strike is NOT pulled in', !at500.prints.some(p => p.id === 3), at500.prints.map(p => p.id).join(','));
  check('nor one just outside the tolerance', !at500.prints.some(p => p.id === 4));
  check('the split names both sides rather than hiding them', at500.callPremium === 1_000_000 && at500.putPremium === 500_000);
  check('and the total is their sum', at500.totalPremium === 1_500_000);
  check('contracts count both rights', at500.contracts === 200);

  const tied = buildStrikeAttribution([print(7, 500, 1_000), print(9, 500, 1_000), print(8, 500, 5_000)], 500, 1);
  check('ranked by premium', tied.prints[0].id === 8);
  check('and ties go to the later print', tied.prints[1].id === 9 && tied.prints[2].id === 7);
  check('the largest is the head of the list', tied.largest?.id === 8);

  const oneBig = buildStrikeAttribution([print(1, 500, 9_000_000), print(2, 500, 100_000), print(3, 500, 100_000)], 500, 1);
  check('a concentrated level says one participant built it', /ONE call order/.test(attributionWords(oneBig)), attributionWords(oneBig));
  const spread = buildStrikeAttribution([print(1, 500, 100_000), print(2, 500, 100_000), print(3, 500, 100_000, 'P'), print(4, 500, 100_000)], 500, 1);
  check('a spread level says the crowd did', /built by the crowd/.test(attributionWords(spread)), attributionWords(spread));

  /*
    THE BAR IS A SHARE, so the SAME COMPOSITION must read the same at any
    size — which is the whole reason it is not a dollar figure. Identical
    ratios six orders of magnitude apart, both verdicts compared directly.
  */
  const ratios = (scale: number) => [print(1, 500, 30 * scale), print(2, 500, 35 * scale), print(3, 500, 35 * scale)];
  const tiny = attributionWords(buildStrikeAttribution(ratios(1), 500, 1));
  const huge = attributionWords(buildStrikeAttribution(ratios(1_000_000), 500, 1));
  check(`the bar is a SHARE (${CONCENTRATION_BAR}) — identical composition reads identically at any size`, tiny === huge && /crowd/.test(tiny), `${tiny} | ${huge}`);
  const domTiny = attributionWords(buildStrikeAttribution([print(1, 500, 90), print(2, 500, 10)], 500, 1));
  const domHuge = attributionWords(buildStrikeAttribution([print(1, 500, 90e6), print(2, 500, 10e6)], 500, 1));
  check('— and a dominated strike does too', domTiny === domHuge && /ONE/.test(domTiny));
  check('an empty strike says carry-over rather than nothing', /carry-over positioning/.test(attributionWords(buildStrikeAttribution([], 500, 1))));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
