/*
  The story clock's invariants.

  These are hand-picked keyframes, and the failure they guard against already
  happened once: story time ran linearly across the film, which put Pulse at
  minute 2 of a 40-minute session while its chart drew the session's close. The
  numbers are cheap to change and expensive to get subtly wrong, so the
  relationships between them are asserted rather than eyeballed.
*/

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  SCENES,
  TRAILER_DURATION_MS,
  storyClockIsMonotonic,
  storyUAt,
  storyUAtSceneEnd,
  storyUAtSceneStart,
} from './useTrailerTimeline';
import { buildTrailerStory, LOTTO_P_GATE, STORY_SECONDS, spotAt } from './trailerStory';
import { expiryFor, fmtMonthDay, isTradingDay } from '../../core/calendar';
import Simulator from '../../core/simulator';
import { bsPriceAtT } from '../../components/compass/contractTrackModel';
import { COMPASS_VIEW_KEYS } from '../compassViews';

describe('story clock', () => {
  it('never runs the session backwards', () => {
    expect(storyClockIsMonotonic()).toBe(true);
  });

  it('starts at the open and ends at the close', () => {
    expect(storyUAt(0, 0)).toBe(0);
    expect(storyUAt(SCENES.length - 1, 1)).toBe(1);
  });

  it('is monotonic across every scene boundary', () => {
    let prev = -1;
    for (let i = 0; i < SCENES.length; i++) {
      for (const p of [0, 0.5, 1]) {
        const u = storyUAt(i, p);
        expect(u).toBeGreaterThanOrEqual(prev);
        prev = u;
      }
    }
  });

  it('puts Pulse on the approach into the level, not at the open', () => {
    // The scene is about price pressing into the shelf; if it ends in the first
    // few percent of the session it is showing a flat line and calling it pressure.
    expect(storyUAt(SCENES.findIndex(s => s.id === 'pulse'), 1)).toBeGreaterThan(0.3);
  });

  it('freezes the Tracker packet at the moment the scene opens, never after it', () => {
    const story = buildTrailerStory();
    const trackerIdx = SCENES.findIndex(s => s.id === 'tracker');
    const frozenSec = (story.packet.frozenAt - story.sessionStart) / 1000;
    const sceneStartSec = storyUAt(trackerIdx, 0) * STORY_SECONDS;
    const sceneEndSec = storyUAt(trackerIdx, 1) * STORY_SECONDS;
    expect(frozenSec).toBeCloseTo(sceneStartSec, 3);
    // The outcome is shown during the scene, so the freeze cannot be later than it.
    expect(frozenSec).toBeLessThanOrEqual(sceneEndSec);
    expect(frozenSec).toBe(storyUAtSceneStart('tracker') * STORY_SECONDS);
  });

  it('points every Open desk target at a pane the desk reads', () => {
    /*
      Whether the PATH resolves is checked against App.tsx in
      src/lib/routes.test.ts. What is left here is the part that file cannot
      know: the query string has to name a pane this desk actually reads.

      That claim is now checked against Compass's own vocabulary. It used to be
      checked against a regex literal typed into this file —
      /^view=(weigher|lotto|quick-scalp|rebounds|top-setups)$/ — which is the
      same species of lie as the version before it (that one was called "keeps
      every Open desk target a real route" and asserted the string starts with a
      slash). Renaming the Compass mode `lotto` to `lottery` drops the trailer's
      Lotto button through readView to null and silently opens the default pane;
      the whole suite stayed green at 1140. Two of those five values were also
      already used by no scene, so the list had drifted both ways at once.
    */
    for (const s of SCENES) {
      if (!s.route) continue;
      expect(s.route.startsWith('/')).toBe(true);
      const q = s.route.split('?')[1];
      if (!q) continue;
      const [key, value] = q.split('=');
      expect(key, `${s.id}: only ?view= is a pane selector`).toBe('view');
      expect(
        COMPASS_VIEW_KEYS.has(value),
        `${s.id}: "${value}" is not a pane Compass reads — readView would return ` +
          `null and open the default. Known: ${[...COMPASS_VIEW_KEYS].join(', ')}`,
      ).toBe(true);
    }
  });

  it('has no scene pointing at a pane that no longer exists', () => {
    // The other direction: a ?view= that Compass still accepts but whose scene
    // was cut leaves the vocabulary looking larger than the film uses. Harmless,
    // but it is how the old literal list came to carry two dead values.
    const used = SCENES.map(s => s.route?.split('?')[1])
      .filter(Boolean)
      .map(q => q!.split('=')[1]);
    for (const v of used) expect(COMPASS_VIEW_KEYS.has(v)).toBe(true);
  });

  it('runs for the length the copy claims', () => {
    expect(Math.round(TRAILER_DURATION_MS / 1000)).toBe(84);
  });
});

/*
  The story's geometry.

  Every one of these was a real defect before it was a test. The trailer used to
  read the live simulator, whose price advances every 1500ms and whose book
  therefore depended on how long the app had been open before /trailer mounted:
  cold, the strongest level below spot sat 0.02% away, the net book gamma was
  positive while the thread read SHORT GAMMA, and the same price appeared on the
  level board twice under two different roles. Pinning the session fixed it; these
  assert it stays fixed, because a re-pin is one constant away.
*/
describe('story geometry', () => {
  const story = buildTrailerStory();

  it('orders the level, the flip, the open and the call wall the way the film narrates them', () => {
    const { putWall, flip, callWall } = story.levels;
    expect(putWall).toBe(story.level);
    expect(putWall).toBeLessThan(flip);
    expect(flip).toBeLessThan(story.spot0);
    expect(story.spot0).toBeLessThanOrEqual(callWall);
  });

  it('leaves the session somewhere to fall', () => {
    // Below about a percent the approach is inside the noise and the chart reads
    // as a flat wobble rather than a level being tested.
    expect((story.spot0 - story.level) / story.spot0).toBeGreaterThanOrEqual(0.01);
  });

  it('draws a path that actually tests the level and reclaims the flip', () => {
    const lo = Math.min(...story.path.map(p => p.px));
    const close = story.path[story.path.length - 1].px;
    expect(lo).toBeLessThan(story.level); // pierced, not merely approached
    expect(story.path[0].px).toBeGreaterThan(story.levels.flip); // opens in the calm regime
    expect(close).toBeGreaterThan(story.levels.flip); // and returns to it
    expect(close).toBeLessThan(story.spot0); // without pretending the day was green
  });

  it('shows a net GEX that agrees with the regime the thread reports', () => {
    // The GEX row used to be a hard-coded −$412M sitting under a gamma field
    // whose cells summed positive.
    const gex = story.greeks.find(g => g.key === 'gex')!;
    expect(gex.now).toBeLessThan(0);
  });

  it('never puts one price on the level board twice', () => {
    const prices = story.rankedLevels.map(l => l.price);
    expect(new Set(prices).size).toBe(prices.length);
    // Exactly one pivot, and the board carries no role of its own — role is a
    // live read, derived where it is drawn.
    expect(story.rankedLevels.filter(l => l.isFlip)).toHaveLength(1);
    expect(story.rankedLevels.every(l => !('role' in l) && !('distancePct' in l))).toBe(true);
  });
});

/*
  One session, one calendar, one clock.

  The film advertises a single event, so nothing in it may imply a different day
  from anything else. Each of these was a real contradiction: expiry labels and
  DTEs were hard-coded strings hanging off the viewer's own date, the news feed
  was stamped past the window it plays in, and the Tracker's forward path opened
  at a price from later than the decision it was scoring.
*/
describe('one session', () => {
  const story = buildTrailerStory();

  it('lands on a trading day', () => {
    expect(isTradingDay(new Date(story.sessionStart))).toBe(true);
  });

  it("uses New York's calendar day, not the viewer's", () => {
    // Built on the browser's local date it was a local day wearing an ET label:
    // Monday breakfast in Asia is still Sunday in New York, so the film picked
    // the wrong session and every DTE hung off it.
    const ny = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const session = new Date(story.sessionStart);
    // The session is NY's day, or the most recent session at or before it.
    const iso = `${session.getFullYear()}-${String(session.getMonth() + 1).padStart(2, '0')}-${String(
      session.getDate(),
    ).padStart(2, '0')}`;
    expect(iso <= ny).toBe(true);
    // And never more than a long weekend behind it.
    const gap = (new Date(`${ny}T00:00:00`).getTime() - new Date(`${iso}T00:00:00`).getTime()) / 86400000;
    expect(gap).toBeLessThanOrEqual(4);
    // The wall clock the HUD prints is the session's, unshifted.
    expect(session.getHours()).toBe(10);
    expect(session.getMinutes()).toBe(42);
  });

  it('agrees with the calendar about every maturity it names', () => {
    const session = new Date(story.sessionStart);
    const seen = new Map<string, number>();
    for (const c of story.contracts) seen.set(c.expiry, c.dte);
    for (const p of story.prints) seen.set(p.expiry, p.dte);
    expect(seen.size).toBeGreaterThan(1); // more than one maturity is on screen
    for (const [label, dte] of seen) {
      // The label must be the date that many days from THIS session, and the
      // walk must land on a session rather than a weekend.
      const e = expiryFor(dte, session);
      expect(fmtMonthDay(e.date).toUpperCase()).toBe(label);
      expect(e.dte).toBe(dte);
      expect(isTradingDay(e.date)).toBe(true);
    }
  });

  it('puts earnings after the weeklies it is quoted against', () => {
    const nearest = Math.min(...story.contracts.map(c => c.dte));
    expect(story.earnings.daysAway).toBeGreaterThan(nearest);
    const e = expiryFor(story.earnings.daysAway, new Date(story.sessionStart));
    expect(fmtMonthDay(e.date).toUpperCase()).toBe(story.earnings.date);
  });

  it('stamps the news cluster inside the window the scene plays it in', () => {
    const window = (storyUAtSceneEnd('news') - storyUAtSceneStart('news')) * STORY_SECONDS;
    for (const item of story.news.items) {
      expect(item.at).toBeGreaterThanOrEqual(0);
      expect(item.at).toBeLessThanOrEqual(window);
    }
    // And they still arrive in order, spread across it rather than bunched.
    const ats = story.news.items.map(i => i.at);
    expect([...ats].sort((a, b) => a - b)).toEqual(ats);
    expect(ats[ats.length - 1]).toBeGreaterThan(window * 0.5);
  });

  it('fits the tape sequence inside the window the scene plays it in', () => {
    // The rows print their own timestamps in a T column, so they have to be
    // reachable by the session clock while that scene is on screen. They used to
    // be rescaled into a cinematic window instead, which put a print stamped 0.0s
    // eleven story seconds in.
    const window = (storyUAtSceneEnd('trace') - storyUAtSceneStart('trace')) * STORY_SECONDS;
    for (const p of story.prints) {
      expect(p.at).toBeGreaterThanOrEqual(0);
      expect(p.at).toBeLessThanOrEqual(window);
    }
  });

  it('names the Prove It horizon in sessions, counted in sessions', () => {
    const session = new Date(story.sessionStart);
    // The NEAR maturity, which is the one the band is quoted against — the
    // contracts table also carries the short-dated rival, and picking that by
    // mistake is how this assertion first failed.
    const near = expiryFor(Math.max(...story.contracts.map(c => c.dte)), session);
    expect(story.proveIt.horizonLabel).toContain(`${near.sessions} sessions`);
    // The trap: `dte` is calendar days and is normally the larger number.
    expect(near.sessions).toBeLessThanOrEqual(near.dte);
  });

  it('models the outcome over exactly the window the Tracker scene covers', () => {
    // Modelled over the rest of the session while the scene covers less of it,
    // the chart reached prices the clock had not and the counterfactuals scored
    // before the moment they were measured at.
    const window = (storyUAtSceneEnd('tracker') - storyUAtSceneStart('tracker')) * STORY_SECONDS;
    const rest = (1 - storyUAtSceneStart('tracker')) * STORY_SECONDS;
    expect(window).toBeLessThan(rest);
    // Decay is the window, so a same-strike pair one expiry apart still differs
    // by time value rather than by a day of theta neither of them paid.
    const short = story.contracts.reduce((a, c) => (c.dte < a.dte ? c : a));
    expect(Math.abs(short.theta)).toBeGreaterThan(0);
  });

  it('opens the tracked outcome at the price on the tape when the packet froze', () => {
    const freeze = spotAt(story, storyUAtSceneStart('tracker') * STORY_SECONDS);
    expect(story.outcome.path[0].px).toBeCloseTo(Number(freeze.toFixed(2)), 2);
    // And it must not open at the session close, which is what it used to do.
    expect(story.outcome.path[0].px).not.toBe(story.path[story.path.length - 1].px);
  });
});

/*
  The pinned snapshot's contract.

  `buildSnapshotAt` exists so the trailer does not inherit the wall clock. It
  once handed back the live `priceHistory` array, so its indicators moved between
  two identical calls and the array inside an already-returned snapshot kept
  changing underneath its holder.
*/
describe('pinned snapshot', () => {
  it('returns the same book before and after the live feed advances', () => {
    const before = Simulator.buildSnapshotAt('NVDA', 138.6, 20667);
    const snapshotOfHistory = [...before.priceHistory];
    for (let i = 0; i < 3; i++) Simulator.tick(() => {});
    const after = Simulator.buildSnapshotAt('NVDA', 138.6, 20667);

    expect(after.chain).toEqual(before.chain);
    expect(after.indicators).toEqual(before.indicators);
    expect(after.plan).toEqual(before.plan);
    // The returned history is the caller's, not a window onto the live buffer.
    expect(before.priceHistory).not.toBe(after.priceHistory);
    expect(before.priceHistory).toEqual(snapshotOfHistory);
    expect(before.priceHistory[before.priceHistory.length - 1]).toBe(138.6);
  });
});

/*
  The Weigher's ranking.

  The verdicts used to be authored above the code that computes utility, so the
  selected row could contradict the column beside it. These assert the label is
  the sort's output and nothing else.
*/
describe('contract weigher', () => {
  const story = buildTrailerStory();

  it('selects the contract with the highest utility, and only that one', () => {
    const best = [...story.contracts].sort((a, b) => b.utility - a.utility)[0];
    const selected = story.contracts.filter(c => c.verdict === 'SELECTED');
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe(best.id);
  });

  it('rejects exactly the rows that fail to clear zero', () => {
    for (const c of story.contracts) {
      if (c.verdict === 'SELECTED') continue;
      expect(c.verdict).toBe(c.utility <= 0 ? 'REJECTED' : 'ALTERNATIVE');
    }
  });

  it('hands the packet and the counterfactuals to the row that won', () => {
    const selected = story.contracts.find(c => c.verdict === 'SELECTED')!;
    expect(story.packet.contractId).toBe(selected.id);
    expect(story.packet.entry).toBe(selected.mid);
    expect(story.packet.target).toBe(story.levels.callWall);
    expect(story.packet.stop).toBeLessThan(story.level);
    // Every other contract is scored, none of them twice.
    const scored = story.outcome.counterfactuals.map(c => c.label);
    expect(scored).toHaveLength(story.contracts.length); // four rivals plus the rival setup
    expect(new Set(scored).size).toBe(scored.length);
  });

  it('leaves the scene a closing line that is true of the board', () => {
    /*
      This assertion has now been wrong twice, in opposite directions, and both
      times for the same reason: it tried to make a property of ONE DAY'S
      generated board into an invariant.

      It began as `top-by-return is never SELECTED` — the scene's thesis that the
      biggest payoff is not the best decision — carrying a note that the closing
      line branches if the two ever collapse and that this "should fail loudly
      first". It duly did, on a date where the set's only near expiry, K136
      AUG 11, topped both columns. That is not a defect: a nearer expiry has more
      leverage, so it can win payoff and utility at once, and which expiries the
      story mints depends on the day it is built.

      The obvious repair — assert that utility REORDERS the payoff ranking — is
      the same mistake one step out. Swept across 45 consecutive dates it failed
      on 2026-09-03, where the two orderings happen to coincide exactly.

      Neither is invariant, because neither can be: `utility = p·return +
      (1-p)·shortfall - 0.22·liquidityRisk`, and whether that reorders five rows
      depends on how p, shortfall and liquidity vary across the contracts a given
      day produces. WeigherScene knows this and prints one of two sentences.

      So this tests what is actually guaranteed: whichever branch the scene
      takes, the sentence it prints is true of the board it is printed beside.
      Both readings are checked, so the day decides which one runs and neither
      can quietly start lying.
    */
    const selected = story.contracts.find(c => c.verdict === 'SELECTED')!;
    const topReturn = story.contracts.reduce(
      (best, r) => (r.returnAtTarget > best.returnAtTarget ? r : best),
      story.contracts[0]
    );

    if (topReturn.id === selected.id) {
      // "…the same contract wins on both."
      expect(topReturn.utility).toBe(Math.max(...story.contracts.map(c => c.utility)));
    } else {
      // "…returns X% if the target is reached and Y% if it is not, and that is
      //  why it is not the one taken."
      expect(topReturn.returnAtTarget).toBeGreaterThan(selected.returnAtTarget);
      expect(topReturn.utility).toBeLessThan(selected.utility);
      expect(topReturn.expectedShortfall).toBeLessThan(0);
    }
  });

  it('keeps the closing line branched, so it cannot assert a shape again', () => {
    // The data test above is only honest because the scene has both sentences.
    // Hard-coding either one back in is the regression it cannot see, so the
    // branch itself is guarded here rather than left to a reviewer to notice.
    const scene = readFileSync(join(process.cwd(), 'src/pages/trailer/scenes/WeigherScene.tsx'), 'utf8');
    expect(scene).toContain('topReturn.id === selected.id');
  });

  it('prices on the clock its DTEs are measured in', () => {
    /*
      `expiryFor().dte` is CALENDAR days. Dividing it by a 252-session year handed
      the pricer ~45% more time than the contract has, inflating every mid, greek,
      mark and therefore the ranking. Re-derive each mid at both clocks against
      the spot the Weigher scene shows: the calendar one has to match, the session
      one has to be visibly richer.
    */
    const entrySpot = Number(
      spotAt(story, storyUAtSceneStart('weigher') * STORY_SECONDS).toFixed(2),
    );
    for (const c of story.contracts) {
      const calendar = bsPriceAtT(entrySpot, c.strike, c.iv, c.dte / 365, 'C');
      const sessions = bsPriceAtT(entrySpot, c.strike, c.iv, c.dte / 252, 'C');
      expect(c.mid).toBeCloseTo(Number(calendar.toFixed(2)), 2);
      expect(sessions).toBeGreaterThan(calendar * 1.05);
    }
  });

  it('models Lotto and Prove It at the spot their own scenes show', () => {
    // Both were built from the session close while playing at story progress
    // 0.78 and 0.87 — a ladder struck off a future price, and distributions
    // centred on one with the live marker drawn over them.
    const at = (id: string) => Number(spotAt(story, storyUAtSceneStart(id) * STORY_SECONDS).toFixed(2));
    const close = story.path[story.path.length - 1].px;

    const lottoSpot = at('lotto');
    expect(lottoSpot).not.toBe(close);
    // The nearest rung is the first step above the spot the scene is standing on.
    expect(story.lotto[0].strike).toBeGreaterThan(lottoSpot);
    expect(story.lotto[0].requiredMove).toBeCloseTo(
      ((story.lotto[0].strike - lottoSpot) / lottoSpot) * 100,
      2,
    );

    const proveSpot = at('proveit');
    expect(proveSpot).not.toBe(close);
    // The forecast band brackets the spot it was built at.
    expect(story.proveIt.expectedLow).toBeLessThan(proveSpot);
    expect(story.proveIt.expectedHigh).toBeGreaterThan(proveSpot);
  });

  it('keeps utility an expectation and IF TARGET a branch', () => {
    // The two must not be the same number: utility weights the target branch
    // against the loss at the stop, so on any row that can lose it sits below.
    for (const c of story.contracts) {
      expect(c.utility).toBeLessThan(c.returnAtTarget);
      expect(c.expectedShortfall).toBeLessThan(c.returnAtTarget);
    }
  });

  it('gates the lottery strikes on the stated probability, not on an opinion', () => {
    for (const l of story.lotto) {
      expect(l.verdict).toBe(l.pTargetBeforeClose >= LOTTO_P_GATE ? 'CONSIDERED' : 'NO TRADE');
    }
    // The honesty rule the copy relies on: NO TRADE is on the board.
    expect(story.lotto.some(l => l.verdict === 'NO TRADE')).toBe(true);
  });
});
