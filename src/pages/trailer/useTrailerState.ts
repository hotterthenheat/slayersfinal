/*
  Trailer state derivation.

  One place turns "where are we in the film" into "what does the market look like
  right now". Scenes read this and render; they never compute their own spot,
  clock or regime, which is what keeps two desks on screen at once from
  disagreeing about the same event.
*/

import { createContext, useContext } from 'react';
import { STORY_SECONDS, spotAt } from './trailerStory';
import type { TrailerStateThread, TrailerStory } from './trailerTypes';
import type { TrailerTimeline } from './useTrailerTimeline';
import { SCENES, TRAILER_DURATION_MS } from './useTrailerTimeline';

/**
 * Which scene first establishes each field of the thread.
 *
 * Rendered as the acquisition order in the State Thread capsule: a field is dim
 * until the desk that measures it has been on screen. Pinpoint is the only place
 * dealer state can come from, so it cannot be lit before Pinpoint has run.
 */
export const THREAD_ACQUISITION: { field: keyof TrailerStateThread; sceneId: string; label: string }[] = [
  { field: 'ticker', sceneId: 'ignition', label: 'SYM' },
  { field: 'timestamp', sceneId: 'ignition', label: 'TIME' },
  { field: 'spot', sceneId: 'ignition', label: 'SPOT' },
  { field: 'regime', sceneId: 'pulse', label: 'REGIME' },
  { field: 'activeLevel', sceneId: 'pulse', label: 'LEVEL' },
  { field: 'flowState', sceneId: 'trace', label: 'FLOW' },
  { field: 'dealerState', sceneId: 'gamma', label: 'DEALER' },
  { field: 'gammaState', sceneId: 'gamma', label: 'GAMMA' },
  { field: 'volatilityState', sceneId: 'levels', label: 'VOL' },
  { field: 'setupId', sceneId: 'compass', label: 'SETUP' },
  { field: 'contractId', sceneId: 'weigher', label: 'CONTRACT' },
  { field: 'modelConfidence', sceneId: 'proveit', label: 'CONF' },
];

const sceneOrder = (id: string) => SCENES.findIndex(s => s.id === id);

/** Has the desk that measures this field already been on screen? */
export function threadHas(field: keyof TrailerStateThread, sceneIndex: number): boolean {
  const entry = THREAD_ACQUISITION.find(e => e.field === field);
  if (!entry) return true;
  return sceneIndex >= sceneOrder(entry.sceneId);
}

/**
 * The thread at a moment.
 *
 * Story time runs linearly across the whole film, so the session clock and the
 * spot advance monotonically from the first scene to the last — the timestamp
 * Pulse shows is earlier than the one Tracker freezes, because it is the same
 * clock and not a per-scene decoration.
 */
export function deriveThread(story: TrailerStory, timeMs: number, sceneIndex: number): TrailerStateThread {
  const u = TRAILER_DURATION_MS ? Math.min(1, timeMs / TRAILER_DURATION_MS) : 0;
  const storySec = u * STORY_SECONDS;
  const spot = spotAt(story, storySec);
  const changePct = ((spot - story.spot0) / story.spot0) * 100;

  // Regime flips with the story, not with the scene: price is below the flip for
  // most of the film and reclaims it late, which is the whole narrative.
  const belowFlip = spot < story.levels.flip;
  return {
    ticker: story.ticker,
    timestamp: story.sessionStart + storySec * 1000,
    spot: Number(spot.toFixed(2)),
    changePct: Number(changePct.toFixed(2)),
    regime: belowFlip ? 'PRESSURE · BELOW FLIP' : 'STABILIZING · ABOVE FLIP',
    dealerState: threadHas('dealerState', sceneIndex) ? (belowFlip ? 'INFERRED SHORT GAMMA' : 'INFERRED LONG GAMMA') : '—',
    gammaState: threadHas('gammaState', sceneIndex) ? (belowFlip ? 'AMPLIFYING' : 'ABSORBING') : '—',
    flowState: threadHas('flowState', sceneIndex)
      ? sceneIndex >= sceneOrder('metaorder')
        ? 'PARENT SEQUENCE · 58%'
        : 'CALL-SIDE · UNRESOLVED'
      : '—',
    volatilityState: threadHas('volatilityState', sceneIndex) ? 'IV RANK 42 · TERM FLAT' : '—',
    activeLevel: story.level,
    setupId: threadHas('setupId', sceneIndex) ? story.packet.setupId : undefined,
    contractId: threadHas('contractId', sceneIndex) ? story.packet.contractId : undefined,
    modelConfidence: threadHas('modelConfidence', sceneIndex) ? 0.63 : undefined,
  };
}

export interface TrailerContextValue {
  story: TrailerStory;
  thread: TrailerStateThread;
  timeline: TrailerTimeline;
  /** Progress inside the current scene, 0..1. The one input scenes animate from. */
  progress: number;
  reduced: boolean;
  /** Compact composition for phones — a different layout, not a squeezed one. */
  compact: boolean;
}

export const TrailerCtx = createContext<TrailerContextValue | null>(null);

export function useTrailer(): TrailerContextValue {
  const ctx = useContext(TrailerCtx);
  if (!ctx) throw new Error('useTrailer must be used inside the trailer shell');
  return ctx;
}

// ---- shared easing ----------------------------------------------------------
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Progress remapped to a window inside the scene, for staging beats. */
export const at = (p: number, from: number, to: number) => clamp01((p - from) / (to - from));

/** easeOutExpo — the house glide, as a scalar for non-framer maths. */
export const ease = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
