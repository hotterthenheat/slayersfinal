/* eslint-disable react-refresh/only-export-components -- provider component + its consumer hook are colocated by design (the React context pattern); fast-refresh's component-only rule does not apply here. */
/*
==================================================
  SLAYER TERMINAL - FOCUS MODE
  A single app-wide "cinematic zoom": any panel that
  opts in (focusable) can bloom to a full-bleed frame
  over a dimmed desk, its live content relocated into
  the overlay via a portal so data keeps streaming.
  One panel focused at a time; Esc or the backdrop
  returns you exactly where you were.
==================================================
*/

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import FocusLayer from '../components/ui/FocusLayer';

interface FocusCtxValue {
  /** id of the panel currently in focus, or null */
  focusedId: string | null;
  /** the focused panel's title, shown in the overlay header */
  title: ReactNode;
  /** the overlay's content container — panels portal their body into this */
  overlayEl: HTMLElement | null;
  focus: (id: string, title: ReactNode) => void;
  close: () => void;
  /** ref callback the overlay uses to register its content container */
  registerOverlay: (el: HTMLElement | null) => void;
}

const FocusCtx = createContext<FocusCtxValue | null>(null);

export const useFocus = (): FocusCtxValue => {
  const ctx = useContext(FocusCtx);
  if (!ctx) throw new Error('useFocus must be used within FocusProvider');
  return ctx;
};

export const FocusProvider = ({ children }: { children: ReactNode }) => {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [title, setTitle] = useState<ReactNode>(null);
  const [overlayEl, setOverlayEl] = useState<HTMLElement | null>(null);

  const focus = useCallback((id: string, t: ReactNode) => {
    setFocusedId(id);
    setTitle(t);
  }, []);
  const close = useCallback(() => setFocusedId(null), []);
  const registerOverlay = useCallback((el: HTMLElement | null) => setOverlayEl(el), []);

  return (
    <FocusCtx.Provider value={{ focusedId, title, overlayEl, focus, close, registerOverlay }}>
      {children}
      <FocusLayer />
    </FocusCtx.Provider>
  );
};
