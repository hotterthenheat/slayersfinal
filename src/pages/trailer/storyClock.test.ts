/*
  The story clock's invariants.

  These are hand-picked keyframes, and the failure they guard against already
  happened once: story time ran linearly across the film, which put Pulse at
  minute 2 of a 40-minute session while its chart drew the session's close. The
  numbers are cheap to change and expensive to get subtly wrong, so the
  relationships between them are asserted rather than eyeballed.
*/

import { describe, it, expect } from 'vitest';
import { SCENES, TRAILER_DURATION_MS, storyClockIsMonotonic, storyUAt, storyUAtSceneStart } from './useTrailerTimeline';
import { buildTrailerStory, LOTTO_P_GATE, STORY_SECONDS } from './trailerStory';

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

  it('keeps every Open desk target a real route', () => {
    for (const s of SCENES) {
      if (!s.route) continue;
      expect(s.route.startsWith('/')).toBe(true);
      // A query-string target must name a pane the desk actually reads.
      const q = s.route.split('?')[1];
      if (q) expect(q).toMatch(/^view=(weigher|lotto|quick-scalp|rebounds|top-setups)$/);
    }
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

  it('still makes the argument the scene is built on', () => {
    // The point of the scene is that the best headline return is not the best
    // decision. If a re-pin ever collapses those onto one row, the scene's
    // closing line has a branch for it — but this should fail loudly first.
    const topEv = [...story.contracts].sort((a, b) => b.ev - a.ev)[0];
    expect(topEv.verdict).not.toBe('SELECTED');
  });

  it('gates the lottery strikes on the stated probability, not on an opinion', () => {
    for (const l of story.lotto) {
      expect(l.verdict).toBe(l.pTargetBeforeExpiry >= LOTTO_P_GATE ? 'CONSIDERED' : 'NO TRADE');
    }
    // The honesty rule the copy relies on: NO TRADE is on the board.
    expect(story.lotto.some(l => l.verdict === 'NO TRADE')).toBe(true);
  });
});
