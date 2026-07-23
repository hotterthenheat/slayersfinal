/* eslint-disable react-refresh/only-export-components -- provider component + its consumer hook are colocated by design (the React context pattern); fast-refresh's component-only rule does not apply here. */
/*
==================================================
  SLAYER TERMINAL - TRACKER CONTEXT
  Manages bookmarked setups with localStorage
  persistence. Provides track/untrack/isTracked
  to the entire app.
==================================================
*/

import React, { createContext, useContext, useState, useCallback } from 'react';
import type { TrackedSetup } from '../types/tracker';
import type { Setup, ScannerKey, OptionRight, Verdict } from '../types/skyvision';

/** Minimal shape to bookmark a contract weighed outside the setups scan. */
export interface TrackContractInput {
  id: string;
  contract: string;
  ticker: string;
  strike: number;
  right: OptionRight;
  score: number;
  verdict: Verdict;
  scanner?: ScannerKey;
}

const STORAGE_KEY = 'slayer_tracked_setups';

function loadFromStorage(): TrackedSetup[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToStorage(setups: TrackedSetup[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(setups));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

interface TrackerContextValue {
  trackedSetups: TrackedSetup[];
  trackSetup: (setup: Setup, scanner: ScannerKey) => void;
  trackContract: (c: TrackContractInput) => void;
  untrackSetup: (id: string) => void;
  isTracked: (id: string) => boolean;
}

const TrackerContext = createContext<TrackerContextValue | null>(null);

export const TrackerProvider = ({ children }: { children: React.ReactNode }) => {
  const [trackedSetups, setTrackedSetups] = useState<TrackedSetup[]>(loadFromStorage);

  const trackSetup = useCallback((setup: Setup, scanner: ScannerKey) => {
    setTrackedSetups(prev => {
      if (prev.some(t => t.id === setup.id)) return prev; // already tracked
      const next = [
        ...prev,
        {
          id: setup.id,
          contract: setup.contract,
          ticker: setup.ticker,
          strike: setup.strike,
          right: setup.right,
          scanner,
          trackedAt: Date.now(),
          scoreAtTrack: setup.score,
          verdictAtTrack: setup.verdict,
        },
      ];
      saveToStorage(next);
      return next;
    });
  }, []);

  const trackContract = useCallback((c: TrackContractInput) => {
    setTrackedSetups(prev => {
      if (prev.some(t => t.id === c.id)) return prev; // already tracked
      const next = [
        ...prev,
        {
          id: c.id,
          contract: c.contract,
          ticker: c.ticker,
          strike: c.strike,
          right: c.right,
          scanner: c.scanner ?? 'top-setups',
          trackedAt: Date.now(),
          scoreAtTrack: c.score,
          verdictAtTrack: c.verdict,
        },
      ];
      saveToStorage(next);
      return next;
    });
  }, []);

  const untrackSetup = useCallback((id: string) => {
    setTrackedSetups(prev => {
      const next = prev.filter(t => t.id !== id);
      saveToStorage(next);
      return next;
    });
  }, []);

  const isTracked = useCallback(
    (id: string) => trackedSetups.some(t => t.id === id),
    [trackedSetups]
  );

  return (
    <TrackerContext.Provider value={{ trackedSetups, trackSetup, trackContract, untrackSetup, isTracked }}>
      {children}
    </TrackerContext.Provider>
  );
};

export const useTracker = (): TrackerContextValue => {
  const context = useContext(TrackerContext);
  if (!context) {
    throw new Error('useTracker must be used within a TrackerProvider');
  }
  return context;
};
