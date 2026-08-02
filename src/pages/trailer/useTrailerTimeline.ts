/*
  The trailer's one clock.

  A single requestAnimationFrame loop owns time. Scenes never run their own
  interval — seventeen independent timers is how a trailer ends up with each desk
  ticking at its own rate, and it is also how it ends up dropping frames. Every
  scene derives what it shows from `sceneProgress`, so pausing, scrubbing,
  replaying and reduced-motion all work without a scene knowing they exist.
*/

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TrailerSceneDefinition } from './trailerTypes';

/**
 * Scene running order, lengths and story position.
 *
 * `storyEnd` is where the market has got to by the end of that scene, as a
 * fraction of the session the story covers. It is NOT the scene's position in
 * the film, and that distinction is the whole point: mapping story time linearly
 * onto film time put Pulse at minute 2 of a 40-minute session while its chart
 * drew the session's closing rebound, so the live edge of the chart and the spot
 * beside it described different moments. Anchoring each scene to the beat it
 * needs — Pulse ends with price pressed into the level, Dark Pool ends with the
 * shelf tested, Tracker ends after the outcome — makes them agree by
 * construction instead of by coincidence.
 *
 * Values must be strictly increasing; `storyClockIsMonotonic` asserts it.
 */
const SCENE_SPEC: (Omit<TrailerSceneDefinition, 'enterAtMs' | 'exitAtMs'> & { storyEnd: number })[] = [
  { storyEnd: 0.02, id: 'ignition', product: 'Terminal', durationMs: 4200, description: 'The terminal comes online and locks onto one symbol.' },
  { storyEnd: 0.44, id: 'pulse', product: 'Pulse', route: '/pulse', durationMs: 6000, description: 'Pulse shows price pressing into a structural level while order-flow pressure builds and the regime turns.', },
  { storyEnd: 0.5, id: 'trace', product: 'Trace · Live Tape', route: '/trace/live-tape', durationMs: 5200, description: 'Option prints arrive on the tape with fill position, size and an unresolved directional classification.' },
  { storyEnd: 0.54, id: 'scanner', product: 'Trace · Flow Scanner', route: '/trace/scanner', durationMs: 4000, description: 'A cross-contract scan ranks anomalies; one contract climbs the board as evidence accumulates.' },
  { storyEnd: 0.58, id: 'metaorder', product: 'Trace · Reconstruction', route: '/trace/reconstruction', durationMs: 4600, description: 'Child prints are grouped into a probable parent sequence with a probability, not a label.' },
  { storyEnd: 0.62, id: 'darkpool', product: 'Trace · Dark Pool', route: '/trace/dark-pool', durationMs: 4200, description: 'Off-exchange prints leave a persistent price shelf at the same structural level.' },
  { storyEnd: 0.66, id: 'gamma', product: 'Pinpoint · Gamma', route: '/pinpoint/gamma', durationMs: 5400, description: 'The dealer exposure field across strike and expiry, with the gamma flip above spot.' },
  { storyEnd: 0.7, id: 'levels', product: 'Pinpoint · Levels, Greeks, Stress', route: '/pinpoint/levels', durationMs: 5400, description: 'Ranked levels, exposure greeks, and a stress test that finds where the level stops surviving.' },
  { storyEnd: 0.74, id: 'compass', product: 'Compass · Setups', route: '/compass', durationMs: 5200, description: 'Candidate setups inherit the market state; the highest-scoring one is rejected on data quality.' },
  { storyEnd: 0.78, id: 'weigher', product: 'Compass · Contract Weigher', route: '/compass?view=weigher', durationMs: 5200, description: 'Five contracts express the same thesis; the anatomy of each decision is shown.' },
  { storyEnd: 0.81, id: 'lotto', product: 'Compass · Lotto', route: '/compass?view=lotto', durationMs: 4800, description: 'Terminal-outcome check on far out-of-the-money contracts; the cheapest is a no trade.' },
  { storyEnd: 0.84, id: 'scalp', product: 'Compass · Scalp and Rebound', route: '/compass?view=quick-scalp', durationMs: 4600, description: 'Two intraday models side by side: continuation in negative gamma, reversion in positive gamma.' },
  { storyEnd: 0.87, id: 'proveit', product: 'Prove It', route: '/prove-it', durationMs: 5000, description: 'Forecast and risk-neutral distributions, calibration, and a challenger model failing its promotion gate.' },
  { storyEnd: 0.89, id: 'stocks', product: 'Stocks', route: '/stocks', durationMs: 3400, description: 'Ranking across momentum, quality, flow and news, then routing the thesis to an instrument.' },
  { storyEnd: 0.91, id: 'news', product: 'News', route: '/news', durationMs: 3400, description: 'A catalyst arrives, duplicates cluster, and the forecast distribution repriced rather than a sentiment score.' },
  { storyEnd: 0.93, id: 'earnings', product: 'Earnings', route: '/earnings', durationMs: 4000, description: 'Implied against realized against forecast move, with direction and magnitude kept separate.' },
  { storyEnd: 0.97, id: 'tracker', product: 'Tracker', route: '/tracker', durationMs: 5200, description: 'The decision is frozen into an immutable packet, the market advances, and the alternatives are scored against it.' },
  { storyEnd: 1.0, id: 'convergence', product: 'Slayer Terminal', route: '/terminal', durationMs: 4600, description: 'All desks operating on the same event at once.' },
];

/**
 * Short label per scene for the chapter nav.
 *
 * The nav used to render `product.split(' · ')[0]`, which put four tabs reading
 * TRACE and four reading COMPASS next to each other — a nav where half the tabs
 * are indistinguishable is not a nav.
 */
export const SCENE_SHORT: Record<string, string> = {
  ignition: 'START',
  pulse: 'PULSE',
  trace: 'TAPE',
  scanner: 'SCANNER',
  metaorder: 'RECON',
  darkpool: 'DARK POOL',
  gamma: 'GAMMA',
  levels: 'LEVELS',
  compass: 'SETUPS',
  weigher: 'WEIGHER',
  lotto: 'LOTTO',
  scalp: 'SCALP',
  proveit: 'PROVE IT',
  stocks: 'STOCKS',
  news: 'NEWS',
  earnings: 'EARNINGS',
  tracker: 'TRACKER',
  convergence: 'SYSTEM',
};

export const SCENES: TrailerSceneDefinition[] = (() => {
  let at = 0;
  return SCENE_SPEC.map(s => {
    const enterAtMs = at;
    at += s.durationMs;
    return { ...s, enterAtMs, exitAtMs: at };
  });
})();

export const TRAILER_DURATION_MS = SCENES[SCENES.length - 1].exitAtMs;

/** Story fraction at the head of each scene — the previous scene's end. */
const STORY_START: number[] = SCENE_SPEC.map((_, i) => (i === 0 ? 0 : SCENE_SPEC[i - 1].storyEnd));

/**
 * Where the market has got to, 0..1 of the session.
 *
 * Every consumer reads this: the spot on the thread, the reveal on each chart,
 * the timestamp in the HUD, the moment the Tracker packet freezes. One function
 * means they cannot drift apart.
 */
export function storyUAt(sceneIndex: number, sceneProgress: number): number {
  const i = Math.max(0, Math.min(SCENE_SPEC.length - 1, sceneIndex));
  const from = STORY_START[i];
  const to = SCENE_SPEC[i].storyEnd;
  return from + (to - from) * Math.max(0, Math.min(1, sceneProgress));
}

/** Story fraction at the instant a named scene begins. */
export function storyUAtSceneStart(id: string): number {
  const i = SCENE_SPEC.findIndex(s => s.id === id);
  return i < 0 ? 0 : STORY_START[i];
}

/** Story fraction at the instant a named scene ends. */
export function storyUAtSceneEnd(id: string): number {
  const i = SCENE_SPEC.findIndex(s => s.id === id);
  return i < 0 ? 1 : SCENE_SPEC[i].storyEnd;
}

/** Guard for the one invariant the keyframes have: the session cannot run backwards. */
export function storyClockIsMonotonic(): boolean {
  return SCENE_SPEC.every((s, i) => s.storyEnd > STORY_START[i] && s.storyEnd <= 1);
}

export const sceneIndexAt = (t: number): number => {
  for (let i = 0; i < SCENES.length; i++) if (t < SCENES[i].exitAtMs) return i;
  return SCENES.length - 1;
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export interface TrailerTimeline {
  timeMs: number;
  sceneIndex: number;
  scene: TrailerSceneDefinition;
  sceneProgress: number;
  playing: boolean;
  finished: boolean;
  /** True once the cinematic run has completed at least once — unlocks Explore. */
  explored: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  replay: () => void;
  skipToEnd: () => void;
  goToScene: (index: number) => void;
  step: (delta: number) => void;
  seek: (ms: number) => void;
}

/**
 * @param autoStart whether the film should begin on mount. The route waits for an
 *   explicit launch so nothing plays at a viewer who did not ask for it.
 */
export function useTrailerTimeline(autoStart: boolean): TrailerTimeline {
  const [timeMs, setTimeMs] = useState(0);
  const [playing, setPlaying] = useState(autoStart);
  const [explored, setExplored] = useState(false);

  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);
  const timeRef = useRef(0);
  const playingRef = useRef(false);

  // One loop. It only exists while playing, so a paused trailer costs nothing.
  useEffect(() => {
    if (!playing) {
      lastRef.current = null;
      return;
    }
    const frame = (now: number) => {
      const prev = lastRef.current;
      lastRef.current = now;
      // A tab that was hidden hands back a huge delta on the first frame back;
      // clamping keeps the film from jumping a whole scene on return.
      //
      // The ceiling is a backstop for that case, not a frame budget. At 64ms it
      // was under four frames, so any machine dropping below ~16fps — a mid-range
      // phone, a laptop with the trailer in a background window — quietly ran the
      // film in slow motion, and the 84-second timeline took two minutes without
      // anything looking wrong. 500ms still catches the tab-restore jump (which
      // arrives in seconds) while letting a genuinely slow renderer stay on the
      // clock and drop frames instead.
      const dt = prev == null ? 0 : Math.min(now - prev, 500);
      const next = timeRef.current + dt;
      if (next >= TRAILER_DURATION_MS) {
        timeRef.current = TRAILER_DURATION_MS;
        setTimeMs(TRAILER_DURATION_MS);
        setPlaying(false);
        setExplored(true);
        return;
      }
      timeRef.current = next;
      setTimeMs(next);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastRef.current = null;
    };
  }, [playing]);

  // A hidden tab does no work — rAF already throttles, but pausing outright
  // means the film does not silently advance while nobody is watching it.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const seek = useCallback((ms: number) => {
    const t = Math.max(0, Math.min(TRAILER_DURATION_MS, ms));
    timeRef.current = t;
    lastRef.current = null;
    setTimeMs(t);
  }, []);

  const play = useCallback(() => {
    if (timeRef.current >= TRAILER_DURATION_MS) {
      timeRef.current = 0;
      setTimeMs(0);
    }
    setPlaying(true);
  }, []);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => (playing ? pause() : play()), [playing, pause, play]);
  const replay = useCallback(() => {
    seek(0);
    setPlaying(true);
  }, [seek]);
  const skipToEnd = useCallback(() => {
    seek(TRAILER_DURATION_MS);
    setPlaying(false);
    setExplored(true);
  }, [seek]);
  /**
   * Seek to a scene.
   *
   * While playing, land on its first frame and let it play. While PAUSED, land
   * on a settled frame instead: at progress 0 most `Beat`s are at zero opacity
   * and several scenes have not mounted a row yet, so stepping through a paused
   * film — which is what a viewer does to read it — arrived at a blank stage and
   * stayed there. 0.82 is past every scene's staging and before its closing
   * beat, so the destination is the composed frame.
   */
  const goToScene = useCallback(
    (index: number) => {
      const i = Math.max(0, Math.min(SCENES.length - 1, index));
      const s = SCENES[i];
      seek(playingRef.current ? s.enterAtMs : s.enterAtMs + (s.exitAtMs - s.enterAtMs) * 0.82);
      setExplored(true);
    },
    [seek],
  );
  const step = useCallback(
    (delta: number) => {
      const i = sceneIndexAt(timeRef.current);
      goToScene(i + delta);
    },
    [goToScene],
  );

  // `goToScene` reads `playing` without re-creating itself on every play/pause,
  // so the controls keep a stable identity across the film.
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  const sceneIndex = sceneIndexAt(timeMs);
  const scene = SCENES[sceneIndex];
  const sceneProgress = clamp01((timeMs - scene.enterAtMs) / (scene.exitAtMs - scene.enterAtMs));
  const finished = timeMs >= TRAILER_DURATION_MS;

  return useMemo(
    () => ({
      timeMs,
      sceneIndex,
      scene,
      sceneProgress,
      playing,
      finished,
      explored: explored || finished,
      play,
      pause,
      toggle,
      replay,
      skipToEnd,
      goToScene,
      step,
      seek,
    }),
    [timeMs, sceneIndex, scene, sceneProgress, playing, finished, explored, play, pause, toggle, replay, skipToEnd, goToScene, step, seek],
  );
}
