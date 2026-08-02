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
import { buildTrailerStory, STORY_SECONDS } from './trailerStory';

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
