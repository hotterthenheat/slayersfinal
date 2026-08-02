/**
 * The attached monitors, when the browser will tell us.
 *
 * Chromium's Window Management API is the only way a web app can place a window
 * on a specific display. It is permission-gated and Chromium-only, so every
 * caller has to work without it: the fallback is one screen (the current one),
 * which still pops panels out into real windows that the user drags wherever
 * they want. That is the honest floor, and it is what most of this feature is
 * worth on Safari and Firefox.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScreenBox } from './presets';

export interface DisplayInfo extends ScreenBox {
  /** OS label when exposed ("Built-in Retina Display"), else a generated one. */
  label: string;
  isPrimary: boolean;
  /** True when this is the display the terminal window is currently on. */
  isCurrent: boolean;
}

/** The slice of the Window Management API this file uses. Not in lib.dom yet. */
interface ScreenDetailedLike {
  availLeft: number;
  availTop: number;
  availWidth: number;
  availHeight: number;
  label?: string;
  isPrimary?: boolean;
}
interface ScreenDetailsLike extends EventTarget {
  screens: ScreenDetailedLike[];
  currentScreen: ScreenDetailedLike;
}
type WindowWithScreens = Window & {
  getScreenDetails?: () => Promise<ScreenDetailsLike>;
};

export const canPlaceWindows = (): boolean =>
  typeof window !== 'undefined' && typeof (window as WindowWithScreens).getScreenDetails === 'function';

/** The one display we can always describe, with no permission at all. */
function currentDisplayOnly(): DisplayInfo[] {
  if (typeof window === 'undefined') return [];
  const s = window.screen;
  return [
    {
      // `avail*` excludes the taskbar / menu bar, so a centred window does not
      // open underneath it.
      left: (s as Screen & { availLeft?: number }).availLeft ?? 0,
      top: (s as Screen & { availTop?: number }).availTop ?? 0,
      width: s.availWidth,
      height: s.availHeight,
      label: 'This display',
      isPrimary: true,
      isCurrent: true,
    },
  ];
}

function toDisplays(details: ScreenDetailsLike): DisplayInfo[] {
  const cur = details.currentScreen;
  return details.screens.map((s, i) => ({
    left: s.availLeft,
    top: s.availTop,
    width: s.availWidth,
    height: s.availHeight,
    // The OS label is only populated once permission is granted; before that it
    // is an empty string, and "Display 2" beats a blank menu row.
    label: s.label && s.label.trim() ? s.label : `Display ${i + 1}`,
    isPrimary: Boolean(s.isPrimary),
    isCurrent: s === cur || (s.availLeft === cur?.availLeft && s.availTop === cur?.availTop),
  }));
}

export function useScreens() {
  const [displays, setDisplays] = useState<DisplayInfo[]>(currentDisplayOnly);
  /** Multi-display placement is available AND permitted. Distinct from
      `canPlaceWindows()`, which only says the API exists. */
  const [granted, setGranted] = useState(false);
  const detailsRef = useRef<ScreenDetailsLike | null>(null);

  /**
   * Ask for the display list. Must be called from a user gesture the first
   * time: the permission prompt is gesture-gated, and calling it on mount would
   * spend the prompt on someone who never opens the pop-out menu, then be
   * denied for the session.
   */
  const request = useCallback(async (): Promise<DisplayInfo[]> => {
    const w = window as WindowWithScreens;
    if (typeof w.getScreenDetails !== 'function') return currentDisplayOnly();
    try {
      const details = detailsRef.current ?? (await w.getScreenDetails());
      detailsRef.current = details;
      const next = toDisplays(details);
      setDisplays(next);
      setGranted(true);
      return next;
    } catch {
      // Denied, dismissed, or thrown by a browser that has the method but not
      // the permission. One display, no error surface: the pop-out still works.
      setGranted(false);
      return currentDisplayOnly();
    }
  }, []);

  // Monitors get plugged in, unplugged and rearranged mid-session. Only
  // subscribe once permission has actually been granted, since `details` does
  // not exist before that.
  useEffect(() => {
    const details = detailsRef.current;
    if (!details || !granted) return;
    const onChange = () => setDisplays(toDisplays(details));
    details.addEventListener('screenschange', onChange);
    return () => details.removeEventListener('screenschange', onChange);
  }, [granted]);

  return { displays, granted, request, supported: canPlaceWindows() };
}
