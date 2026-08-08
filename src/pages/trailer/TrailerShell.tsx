/*
  The shell.

  Owns the clock, the story and the layout, and mounts exactly one scene. Only
  one, deliberately: seventeen mounted scenes is seventeen subtrees re-rendering
  on every frame of a 60fps timeline, and the cost of that is the thing the
  viewer notices first.

  The camera between scenes is a transform on the whole stage rather than a wipe.
  Related scenes (tape into scanner, setup into contracts) push in; a change of
  desk pulls back and settles. Under reduced motion it collapses to a crossfade
  and the narrative survives untouched.
*/

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import useMediaQuery from '../../hooks/useMediaQuery';
import { buildTrailerStory } from './trailerStory';
import { deriveThread, TrailerCtx, ease, at } from './useTrailerState';
import { useTrailerTimeline, SCENES, storyUAt } from './useTrailerTimeline';
import TrailerHUD from './TrailerHUD';
import TrailerControls from './TrailerControls';
import StateThread from './StateThread';

import IgnitionScene from './scenes/IgnitionScene';
import PulseScene from './scenes/PulseScene';
import TraceTapeScene from './scenes/TraceTapeScene';
import FlowScannerScene from './scenes/FlowScannerScene';
import MetaorderScene from './scenes/MetaorderScene';
import DarkPoolScene from './scenes/DarkPoolScene';
import PinpointScene from './scenes/PinpointScene';
import LevelsStressScene from './scenes/LevelsStressScene';
import CompassScene from './scenes/CompassScene';
import WeigherScene from './scenes/WeigherScene';
import LottoScene from './scenes/LottoScene';
import ScalpReboundScene from './scenes/ScalpReboundScene';
import ProveItScene from './scenes/ProveItScene';
import StocksScene from './scenes/StocksScene';
import TrackerScene from './scenes/TrackerScene';
import ConvergenceScene from './scenes/ConvergenceScene';

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  ignition: IgnitionScene,
  pulse: PulseScene,
  trace: TraceTapeScene,
  scanner: FlowScannerScene,
  metaorder: MetaorderScene,
  darkpool: DarkPoolScene,
  gamma: PinpointScene,
  levels: LevelsStressScene,
  compass: CompassScene,
  weigher: WeigherScene,
  lotto: LottoScene,
  scalp: ScalpReboundScene,
  proveit: ProveItScene,
  stocks: StocksScene,
  tracker: TrackerScene,
  convergence: ConvergenceScene,
};

/**
 * Scenes that continue the one before them rather than changing desk.
 *
 * A continuation pushes in — the camera moving closer to the same evidence. A
 * change of desk pulls back first, which is what makes "this is a different part
 * of the same event" legible without a caption.
 */
const CONTINUES = new Set(['scanner', 'metaorder', 'darkpool', 'levels', 'weigher', 'lotto', 'scalp']);

const TrailerShell: React.FC<{ autoStart: boolean }> = ({ autoStart }) => {
  const story = useMemo(() => buildTrailerStory(), []);
  const timeline = useTrailerTimeline(autoStart);
  const reducedPref = useReducedMotion();
  const reduced = !!reducedPref;
  const compact = useMediaQuery('(max-width: 767px)');

  const [muted, setMuted] = useState(true);
  const [chromeVisible, setChromeVisible] = useState(true);
  const idleRef = useRef<number | null>(null);

  const { sceneIndex, scene, sceneProgress, playing, goToScene, toggle, replay, step } = timeline;
  const storyU = storyUAt(sceneIndex, sceneProgress);
  const thread = useMemo(
    () => deriveThread(story, sceneIndex, sceneProgress),
    [story, sceneIndex, sceneProgress],
  );

  /*
    Chrome hides while the film runs and comes back on any input — but never
    while it holds focus.

    The idle timer used to fade the transport out on a schedule regardless, so a
    keyboard user who tabbed to Next and paused to read lost the focus ring, and
    then their focused control sat inside a container with `pointer-events-none`:
    invisible, still focused, still activatable. `focusin` on the chrome pins it
    open; `focusout` hands it back to the timer.
  */
  useEffect(() => {
    const chrome = () => document.getElementById('trailer-chrome');
    const holdsFocus = () => {
      const el = document.activeElement;
      return !!el && el !== document.body && !!chrome()?.contains(el);
    };
    const wake = () => {
      setChromeVisible(true);
      if (idleRef.current) window.clearTimeout(idleRef.current);
      if (holdsFocus()) return;
      idleRef.current = window.setTimeout(() => setChromeVisible(false), 2600);
    };
    wake();
    window.addEventListener('pointermove', wake);
    window.addEventListener('keydown', wake);
    window.addEventListener('touchstart', wake);
    window.addEventListener('focusin', wake);
    window.addEventListener('focusout', wake);
    return () => {
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('keydown', wake);
      window.removeEventListener('touchstart', wake);
      window.removeEventListener('focusin', wake);
      window.removeEventListener('focusout', wake);
      if (idleRef.current) window.clearTimeout(idleRef.current);
    };
  }, []);

  /*
    A new scene starts at the top of the stage.

    On compact the stage is the scrolling element and it outlives the scene
    inside it, so scrolling down a tall scene and pressing Next opened the next
    one halfway down — past its heading and its first evidence.
  */
  useEffect(() => {
    document.getElementById('trailer-stage')?.scrollTo({ top: 0 });
  }, [sceneIndex]);

  // Keyboard transport. Ignored while focus is on anything that owns the key
  // itself — a field, or a control that activates on Space or Enter.
  //
  // Excluding only fields was not enough: a keyboard user tabs to Next scene,
  // presses Space to press it, and the global handler ran too, so one keystroke
  // both advanced the scene and toggled playback. Buttons, links and anything
  // wearing role="button" are all Space- or Enter-activated, so they are all the
  // browser's keystroke, not ours.
  useEffect(() => {
    const SELF_HANDLING = 'input, textarea, select, button, a[href], [role="button"], [role="slider"], [contenteditable="true"]';
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.(SELF_HANDLING)) return;
      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        toggle();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        step(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        step(-1);
      } else if (e.key === 'r') {
        replay();
      } else if (e.key === 'm') {
        setMuted(m => !m);
      } else if (e.key === 'Home') {
        goToScene(0);
      } else if (e.key === 'End') {
        goToScene(SCENES.length - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, step, replay, goToScene]);

  const ctx = useMemo(
    () => ({ story, thread, timeline, progress: sceneProgress, storyU, reduced, compact }),
    [story, thread, timeline, sceneProgress, storyU, reduced, compact],
  );

  const Scene = SCENE_COMPONENTS[scene.id] ?? IgnitionScene;

  // Camera: a short settle at the head of each scene, direction set by whether
  // this scene continues the last one.
  const settle = ease(at(sceneProgress, 0, 0.12));
  const pushIn = CONTINUES.has(scene.id);
  const camera = reduced
    ? { opacity: settle }
    : {
        opacity: 0.25 + settle * 0.75,
        transform: `scale(${pushIn ? 1.03 - settle * 0.03 : 0.985 + settle * 0.015})`,
      };

  return (
    <TrailerCtx.Provider value={ctx}>
      <div className="h-screen w-full flex flex-col bg-canvas text-textPrimary overflow-hidden">
        <TrailerHUD />

        {/*
          Desktop composes to the frame; a phone composes to the column.

          On a phone the grids collapse to one column and several scenes are
          taller than the viewport — held to `h-full` they painted their last
          rows straight over the scene statement underneath. So the stage scrolls
          and the wrapper drops to `min-h-full`, which leaves each scene root's
          `h-full` resolving against an indefinite height, i.e. its own content.
          `contain: paint` stays on the desktop stage only: it is there so the
          camera transform cannot invalidate the chrome each frame, and on a
          scrolling stage it would clip the scroll.
        */}
        <main
          id="trailer-stage"
          className={`flex-1 min-h-0 px-3 sm:px-5 py-3 sm:py-4 ${compact ? 'overflow-y-auto' : ''}`}
          style={compact ? undefined : { contain: 'paint' }}
        >
          <div className={compact ? 'min-h-full' : 'h-full min-h-0'} style={camera}>
            <Scene />
          </div>
        </main>

        {/* One live region for the whole film. Scene descriptions are announced on
            change rather than on every frame. */}
        <p className="sr-only" aria-live="polite">
          {`Scene ${sceneIndex + 1} of ${SCENES.length}. ${scene.product}. ${scene.description}`}
        </p>

        <div id="trailer-chrome" className="shrink-0">
          <StateThread />
          <TrailerControls visible={chromeVisible || !playing} muted={muted} onToggleMute={() => setMuted(m => !m)} />
        </div>
      </div>
    </TrailerCtx.Provider>
  );
};

export default TrailerShell;
