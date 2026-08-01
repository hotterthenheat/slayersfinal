/*
==================================================
  COMMUNITY - SHARED LOCAL STORE (store.ts)
  One copy of the community state for all three tabs.
  Each page used to hold its own useState(loadCommunity)
  and write the whole object back on any mutation, so
  the tab you touched last silently overwrote whatever
  the other two had loaded. A module-level store read
  through useSyncExternalStore keeps them in step
  without threading a provider through the layout.
==================================================
*/

import { useCallback, useSyncExternalStore } from 'react';
import {
  EMPTY_COMMUNITY,
  loadCommunity,
  saveCommunity,
  type CommunityState,
} from '../../data/community';
import type { CommunityIdea, FeatureRequest, FeedbackEntry } from '../../types/community';

let snapshot: CommunityState | null = null;
const listeners = new Set<() => void>();

/** Cached so useSyncExternalStore compares a stable reference between renders. */
function getSnapshot(): CommunityState {
  if (!snapshot) snapshot = loadCommunity();
  return snapshot;
}

/** No SSR in this app, but React wants the hook's third argument to exist. */
const getServerSnapshot = (): CommunityState => EMPTY_COMMUNITY;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function commit(next: CommunityState): void {
  snapshot = next;
  saveCommunity(next);
  for (const l of listeners) l();
}

function mutate(fn: (state: CommunityState) => CommunityState): void {
  commit(fn(getSnapshot()));
}

export interface CommunityApi {
  state: CommunityState;
  addIdea: (idea: CommunityIdea) => void;
  removeIdea: (id: string) => void;
  addRequest: (request: FeatureRequest) => void;
  removeRequest: (id: string) => void;
  addNote: (note: FeedbackEntry) => void;
  removeNote: (id: string) => void;
  /** Back / un-back a roadmap item. Local to this browser, and it says so. */
  toggleBacked: (id: string) => void;
  clearAll: () => void;
}

export function useCommunity(): CommunityApi {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const addIdea = useCallback((idea: CommunityIdea) => {
    mutate(s => ({ ...s, ideas: [idea, ...s.ideas] }));
  }, []);
  const removeIdea = useCallback((id: string) => {
    mutate(s => ({ ...s, ideas: s.ideas.filter(i => i.id !== id) }));
  }, []);
  const addRequest = useCallback((request: FeatureRequest) => {
    mutate(s => ({ ...s, requests: [request, ...s.requests] }));
  }, []);
  const removeRequest = useCallback((id: string) => {
    mutate(s => ({ ...s, requests: s.requests.filter(r => r.id !== id) }));
  }, []);
  const addNote = useCallback((note: FeedbackEntry) => {
    mutate(s => ({ ...s, feedback: [note, ...s.feedback] }));
  }, []);
  const removeNote = useCallback((id: string) => {
    mutate(s => ({ ...s, feedback: s.feedback.filter(f => f.id !== id) }));
  }, []);
  const toggleBacked = useCallback((id: string) => {
    mutate(s => ({
      ...s,
      voted: s.voted.includes(id) ? s.voted.filter(v => v !== id) : [...s.voted, id],
    }));
  }, []);
  const clearAll = useCallback(() => commit(EMPTY_COMMUNITY), []);

  return {
    state,
    addIdea,
    removeIdea,
    addRequest,
    removeRequest,
    addNote,
    removeNote,
    toggleBacked,
    clearAll,
  };
}
