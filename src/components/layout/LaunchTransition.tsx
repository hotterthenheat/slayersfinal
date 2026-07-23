/* eslint-disable react-refresh/only-export-components -- provider component + its consumer hook are colocated by design (the React context pattern); fast-refresh's component-only rule does not apply here. */
/*
==================================================
  SLAYER TERMINAL - LAUNCH TRANSITION
  One branded gate, three triggers: "Launch terminal"
  CTAs, logo clicks, and every full page load (boot).
  Caret logo + a holo-silver progress line over black,
  then the destination fades in beneath it. The full
  moment plays once — the first-ever visit; every boot
  after (reload, history nav, a returning visitor) clips.
==================================================
*/

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { EASE } from '../../lib/motion';

interface LaunchCtxValue {
  /** Play the gate, then navigate (defaults to the terminal's front door). */
  launch: (to?: string) => void;
}

const LaunchCtx = createContext<LaunchCtxValue | null>(null);

export const useLaunch = (): LaunchCtxValue => {
  const ctx = useContext(LaunchCtx);
  if (!ctx) throw new Error('useLaunch must be used within LaunchProvider');
  return ctx;
};

/** Overlay fully visible while the bar fills… */
const HOLD_MS = 1050;
/** …then the destination mounts behind it before the fade-out starts. */
const REVEAL_MS = 300;
/** A reload / back-forward boot has nothing new to introduce — clip it. */
const RELOAD_HOLD_MS = 320;
/** Remembers that this browser has already seen the full boot moment. */
const BOOT_KEY = 'slayer_booted_v1';

/**
 * The full moment plays once — a first-ever visit. After that every boot
 * clips: reloads, history nav, and a returning visitor arriving fresh all
 * get the quick hold, so the gate never taxes someone who's seen it. Explicit
 * "Launch" clicks always play in full — that's a deliberate action, not a boot.
 */
const bootGateMs = (): number => {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const reload = nav && (nav.type === 'reload' || nav.type === 'back_forward');
    if (reload || localStorage.getItem(BOOT_KEY) === '1') return RELOAD_HOLD_MS + REVEAL_MS;
    localStorage.setItem(BOOT_KEY, '1');
  } catch {
    // performance / storage unavailable — fall through to the full hold
  }
  return HOLD_MS + REVEAL_MS;
};

const captionFor = (path: string) => (path === '/' ? 'Loading' : 'Entering terminal');

export const LaunchProvider = ({ children }: { children: ReactNode }) => {
  // Boot gate: every full page load (first visit, refresh) opens through it.
  const [active, setActive] = useState(true);
  const [caption, setCaption] = useState(() => captionFor(window.location.pathname));
  // How long the bar fills for the current pass — clipped on reload, full on
  // launch clicks. Read by the progress bar so the two never disagree.
  const [gateMs, setGateMs] = useState(bootGateMs);
  const busyRef = useRef(true);
  /** Boot renders the gate already opaque — a fade-in would flash the page. */
  const bootRef = useRef(true);
  const navigate = useNavigate();

  useEffect(() => {
    const t = window.setTimeout(() => {
      setActive(false);
      busyRef.current = false;
    }, gateMs);
    return () => window.clearTimeout(t);
    // gateMs is fixed for the boot pass; launch() drives later passes itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const launch = useCallback(
    (to: string = '/pulse') => {
      // A click must never no-op: if the boot gate (or another launch) is still
      // in flight, skip the animation and navigate straight through.
      if (busyRef.current) {
        navigate(to);
        return;
      }
      busyRef.current = true;
      bootRef.current = false;
      setCaption(captionFor(to));
      setGateMs(HOLD_MS + REVEAL_MS);
      setActive(true);
      window.setTimeout(() => {
        navigate(to);
        window.setTimeout(() => {
          setActive(false);
          busyRef.current = false;
        }, REVEAL_MS);
      }, HOLD_MS);
    },
    [navigate]
  );

  return (
    <LaunchCtx.Provider value={{ launch }}>
      {children}
      <AnimatePresence>
        {active && (
          <motion.div
            key="launch-gate"
            initial={bootRef.current ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="fixed inset-0 z-[100] bg-canvas flex flex-col items-center justify-center gap-6"
          >
            <span className="font-mono text-xl font-bold tracking-tight select-none">
              <span className="text-textMuted">&gt; </span>
              <span className="holo-text">slayer_terminal</span>
              <span className="inline-block w-[10px] h-[18px] ml-1.5 bg-textPrimary align-middle animate-cursor-blink" />
            </span>
            <div className="w-52 h-[2px] rounded-full bg-white/[0.08] overflow-hidden">
              <motion.div
                className="h-full rounded-full holo-bar"
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: gateMs / 1000, ease: [0.3, 0.1, 0.3, 1] }}
              />
            </div>
            <span className="font-mono text-micro uppercase tracking-[0.3em] text-textMuted select-none">
              {caption}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </LaunchCtx.Provider>
  );
};
