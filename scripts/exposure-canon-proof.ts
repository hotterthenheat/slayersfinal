/*
  Acceptance test for P-24B — the canonical exposure object.

  The directive's warning was that seven surfaces render the same strike-level
  exposure and can disagree. They did. Measured across eight names before this
  landed: SIX disagreed with the levels rail about a wall or the flip, and
  THREE named a different KING — META by 25 points, TSLA by 12.5.

  Two mechanisms, both closed here:

    THE SPLIT WAS NOT NET-PRESERVING. Each leg carried its own jittered
    multiplier, so the SUM moved by up to 18% of the gap between the legs —
    and that sum picks the walls and the flip.

    THE INPUTS WERE DIFFERENT VINTAGES. The profile read the live chain; the
    levels rail and the ladder read the last GEX snapshot, which is the book
    as it stood when the last bar rolled.

  Proves:
  1. The split preserves the net EXACTLY, at any jitter, and never flips a
     leg's sign
  2. Every strike's profile net is the raw net times one positive constant —
     the property that makes levels lens-invariant
  3. All three readers name the same walls, flip and king on every roster
     name — the disagreement this exists to end
  4. The expiry lens moves magnitudes and NOT levels
  5. The drawn WINDOW is a drawing choice: levels are identical at every
     window size
*/
import Simulator from '../src/core/simulator';
import { buildExposureProfile } from '../src/data/exposure';
import { buildLadderFor, buildLevelsFor, readExposureNow } from '../src/data/gex';
import { buildFlipGauge } from '../src/data/flipGauge';
import type { ExposureExpiry } from '../src/types/gex';
import type { StrikeWindow } from '../src/data/exposure';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const NAMES = ['SPY', 'QQQ', 'AAPL', 'NVDA', 'MSFT', 'TSLA', 'AMD', 'META'];
for (const t of NAMES) Simulator.ensureTicker(t);

// ── 1+2. the split, read off the built profile ────────────────────────────
{
  /*
    The split is private, so it is proven through what it produces: for every
    strike of every name, the profile's net must be the RAW net times the
    lens factor — one constant across the whole book. A per-leg jitter that
    moved the sum would break that ratio strike by strike, which is exactly
    how it hid.
  */
  let worstRatioSpread = 0;
  let signFlips = 0;
  let strikes = 0;
  for (const t of NAMES) {
    const snap = Simulator.snapshotFor(t);
    const prof = buildExposureProfile(snap, 'ALL', 15);
    const raw = new Map(snap.chain.map(n => [n.strike, n]));
    const ratios: number[] = [];
    for (const s of prof.strikes) {
      const n = raw.get(s.strike);
      if (!n || Math.abs(n.netGex) < 1) continue;
      strikes++;
      ratios.push(s.gex.net / n.netGex);
      /* A bounded transfer cannot turn a put leg into a call one. */
      if (n.putGex !== 0 && Math.sign(s.gex.put) !== Math.sign(n.putGex)) signFlips++;
      if (n.callGex !== 0 && Math.sign(s.gex.call) !== Math.sign(n.callGex)) signFlips++;
    }
    if (ratios.length > 1) worstRatioSpread = Math.max(worstRatioSpread, Math.max(...ratios) - Math.min(...ratios));
  }
  /* Ten strikes a name is the floor for a book worth reading at all — the
     real figure is ~25 (a 15-half window against a ~31-strike chain). */
  check('PREMISE: the sample is a real book on every name', strikes >= NAMES.length * 10, `${strikes} strikes across ${NAMES.length} names`);
  check(
    'every strike\'s net is the raw net times ONE constant — the split preserves it',
    worstRatioSpread < 1e-9,
    `worst spread ${worstRatioSpread.toExponential(2)}`
  );
  check('and no leg changed sign under the jitter', signFlips === 0, `${signFlips} flips`);
}

// ── 3. the three readers agree ────────────────────────────────────────────
{
  let disagree = 0;
  const notes: string[] = [];
  for (const t of NAMES) {
    const snap = Simulator.snapshotFor(t);
    const prof = buildExposureProfile(snap, 'ALL', 15);
    const rail = buildLevelsFor(t);
    const now = readExposureNow(snap.chain.map(n => ({ strike: n.strike, value: n.netGex })), snap.spot);
    const same =
      prof.levels.callWall === rail.callWall &&
      prof.levels.putWall === rail.putWall &&
      prof.levels.flip === rail.flip &&
      prof.levels.king === rail.king &&
      rail.callWall === (now.callWall ?? rail.spot) &&
      rail.putWall === (now.putWall ?? rail.spot) &&
      rail.flip === (now.flip ?? rail.spot) &&
      rail.king === (now.king ?? rail.spot);
    if (!same) {
      disagree++;
      notes.push(`${t}: profile ${prof.levels.callWall}/${prof.levels.putWall}/${prof.levels.king} vs rail ${rail.callWall}/${rail.putWall}/${rail.king}`);
    }
  }
  check('the profile, the rail and the canonical reader name the same levels', disagree === 0, notes.slice(0, 2).join(' | '));

  /* And the ladder — the drawn column — reads the same book, so the tag over
     a bar and the bar under it cannot come from different moments. */
  let ladderOff = 0;
  for (const t of NAMES) {
    const lad = buildLadderFor(t);
    const now = readExposureNow(lad.rows, lad.spot);
    const rail = buildLevelsFor(t);
    if ((now.king ?? rail.spot) !== rail.king) ladderOff++;
  }
  check('and the ladder\'s own book crowns the strike the rail tags', ladderOff === 0, `${ladderOff} of ${NAMES.length} off`);

  /*
    THE FLIP STRIP READS THE SAME BOOK AS THE MAP UNDER IT.

    Measured on screen after this landed: the Exposure Profile's strip said
    495.50 while the map below it said 496.50. That is NOT a second
    derivation — it is the scan tier, which the map stamps in its own header
    ("SCAN hh:mm:ss · 10S"): heavy surfaces recalibrate every ten seconds so
    they do not flicker per tick, while the strip is live, and in ten seconds
    the price moves and the flip moves with it.

    Handed ONE snapshot, they must agree exactly — and that is what this
    pins. It cannot see a tier delay and is not meant to; what it catches is
    the thing that would actually be a bug: somebody re-deriving the strip's
    flip a second way.
  */
  let stripOff = 0;
  for (const t of NAMES) {
    const snap = Simulator.snapshotFor(t);
    const gauge = buildFlipGauge(snap);
    const prof = buildExposureProfile(snap, 'ALL', 10);
    if ((gauge.flip ?? snap.spot) !== prof.levels.flip) stripOff++;
  }
  check('one snapshot, one flip — the strip and the map cannot re-derive it apart', stripOff === 0, `${stripOff} of ${NAMES.length} off`);
}

// ── 4. the lens moves magnitudes, not levels ──────────────────────────────
{
  const LENSES: ExposureExpiry[] = ['0DTE', '1D', '5D', 'OPEX', 'ALL'];
  let levelDrift = 0;
  let magnitudeMoved = false;
  for (const t of NAMES) {
    const snap = Simulator.snapshotFor(t);
    const base = buildExposureProfile(snap, '0DTE', 15);
    for (const lens of LENSES) {
      const p = buildExposureProfile(snap, lens, 15);
      if (
        p.levels.callWall !== base.levels.callWall ||
        p.levels.putWall !== base.levels.putWall ||
        p.levels.flip !== base.levels.flip ||
        p.levels.king !== base.levels.king
      ) levelDrift++;
      if (lens !== '0DTE' && Math.abs(p.netGex - base.netGex) > 1) magnitudeMoved = true;
    }
  }
  check('PREMISE: the lens really does change the magnitudes', magnitudeMoved);
  check('but every lens names the same levels', levelDrift === 0, `${levelDrift} drifts`);
}

// ── 5. the window is a drawing choice ─────────────────────────────────────
{
  const WINDOWS: StrikeWindow[] = [10, 15, 20, 30];
  let drift = 0;
  let rowsMoved = false;
  for (const t of NAMES) {
    const snap = Simulator.snapshotFor(t);
    const base = buildExposureProfile(snap, 'ALL', 10);
    for (const w of WINDOWS) {
      const p = buildExposureProfile(snap, 'ALL', w);
      if (
        p.levels.callWall !== base.levels.callWall ||
        p.levels.putWall !== base.levels.putWall ||
        p.levels.flip !== base.levels.flip ||
        p.levels.king !== base.levels.king
      ) drift++;
      if (p.strikes.length !== base.strikes.length) rowsMoved = true;
    }
  }
  check('PREMISE: the window really does change how many rows are drawn', rowsMoved);
  check('but resizing it never renames a level', drift === 0, `${drift} drifts`);

  /*
    AND THE CASE THAT ACTUALLY BITES, staged rather than hoped for.

    The live names all carry their walls within ten strikes of spot, so every
    window happens to see every wall and a windowed pick agrees with a
    full-book one by luck. That let the "pick over the drawn window" mutation
    survive the loop above — a guard that cannot fail is not a guard.

    So: a book whose heaviest CALL shelf sits twenty strikes above spot,
    outside a ten-half window entirely. The full book must still name it;
    a windowed pick would name the biggest thing it could see instead.
  */
  const staged = Simulator.snapshotFor('SPY');
  const step = 1;
  const spot = 500;
  const chain = [];
  for (let i = -25; i <= 25; i++) {
    const strike = spot + i * step;
    /* A modest near shelf, and a far one four times heavier at +20. */
    const near = i === 5 ? -4e8 : 0;
    const far = i === 20 ? -1.6e9 : 0;
    const put = i === -5 ? 3e8 : 0;
    const netGex = near + far + put;
    chain.push({
      strike, netGex,
      callGex: netGex < 0 ? netGex : 0,
      putGex: netGex > 0 ? netGex : 0,
      callOI: 100, putOI: 100, gamma: 0,
      callDex: 0, putDex: 0, netDex: 0,
      callVex: 0, putVex: 0, netVex: 0, vanna: 0, charm: 0,
    });
  }
  const far = buildExposureProfile({ ...staged, spot, chain }, 'ALL', 10);
  check(
    'a wall twenty strikes out is still THE wall at a ten-strike window',
    far.levels.callWall === spot + 20,
    `named ${far.levels.callWall}, expected ${spot + 20}`
  );
  check(
    'and the king with it — the full book decides both',
    far.levels.king === spot + 20,
    `king ${far.levels.king}`
  );
  check(
    'while the drawn rows really did stop short of it',
    !far.strikes.some(r => r.strike === spot + 20),
    `${far.strikes.length} rows, ${far.strikes[0]?.strike} … ${far.strikes[far.strikes.length - 1]?.strike}`
  );

  /*
    THE FLIP NEEDS ITS OWN STAGED BOOK, for the same reason and by the same
    argument: above, the sign change sits five strikes from spot, so a
    windowed pick finds it too and the "flip over the window" mutation lived.

    Here the book is put-dominant for forty strikes and only turns
    call-dominant at +15 — outside a ten-half window, which sees one sign
    throughout and would report NO FLIP at all, falling back to spot. The
    full book puts it at the crossing.
  */
  const flipChain = [];
  for (let i = -25; i <= 25; i++) {
    const netGex = i >= 15 ? -5e8 : 4e8;
    flipChain.push({
      strike: spot + i * step, netGex,
      callGex: netGex < 0 ? netGex : 0,
      putGex: netGex > 0 ? netGex : 0,
      callOI: 100, putOI: 100, gamma: 0,
      callDex: 0, putDex: 0, netDex: 0,
      callVex: 0, putVex: 0, netVex: 0, vanna: 0, charm: 0,
    });
  }
  const farFlip = buildExposureProfile({ ...staged, spot, chain: flipChain }, 'ALL', 10);
  check(
    'a flip fifteen strikes out is found at a ten-strike window',
    Math.abs(farFlip.levels.flip - (spot + 14.5)) < 1e-9,
    `flip ${farFlip.levels.flip}, expected ${spot + 14.5}`
  );
  check(
    'PREMISE: the drawn window really does hold one sign throughout',
    farFlip.strikes.every(r => r.gex.net > 0),
    `${farFlip.strikes.filter(r => r.gex.net <= 0).length} non-positive rows drawn`
  );

  /*
    AND THE STRIP AGREES ON THE SAME STAGED BOOK — the case the live-name
    check above cannot reach.

    That check compares the strip and the map on real names, where the flip
    sits within a few strikes of spot by construction (the picker takes the
    NEAREST sign change), so a windowed re-derivation would agree with a
    full-book one by luck and the mutation survived. Here the only crossing
    is fifteen strikes out, past any window the map draws: a strip that
    re-derived its flip through a windowed profile would report NO FLIP and
    fall back to spot, while the book plainly has one.
  */
  const stagedGauge = buildFlipGauge({ ...staged, spot, chain: flipChain });
  check(
    'the strip finds the far flip too — it reads the book, not a window of it',
    stagedGauge.flip !== null && Math.abs(stagedGauge.flip - (spot + 14.5)) < 1e-9,
    `strip ${stagedGauge.flip}, map ${farFlip.levels.flip}`
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
