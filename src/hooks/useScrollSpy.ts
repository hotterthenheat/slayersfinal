import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { useReducedMotion } from 'framer-motion';

interface ScrollSpyOptions {
  /** Distance below the viewport top where a section counts as current (px). */
  offset?: number;
  /** How long a clicked destination holds the marker before measurement takes over (ms). */
  release?: number;
}

/**
 * Tracks which in-page section the reader is on, and hands back link props that
 * scroll to a section without the marker sprinting through every tab en route.
 *
 * The lock/abandon/reflow structure is adapted from ddoemonn/interior (MIT) —
 * its point is that a click and a scroll are different intents: during a
 * click-scroll the marker belongs to the destination, not to whatever streams
 * past the line. Measured here before adopting: clicking the last tab walked the
 * pill backwards through four others before landing.
 *
 * The measurement itself is ours. Interior slides its detection line
 * proportionally down the viewport as you approach the page foot, which suits a
 * docs sidebar over short headings; on a page of tall narrative sections it
 * catches later sections early. Measured on the landing page, that line reached
 * 3 of 5 sections — two could never become current at any scroll position. A
 * fixed line just under the nav reaches all five.
 */
export const useScrollSpy = (selectors: readonly string[], { offset = 100, release = 900 }: ScrollSpyOptions = {}) => {
  const [active, setActive] = useState<string | null>(null);
  const reduced = useReducedMotion();

  const list = useRef(selectors);
  list.current = selectors;
  const frame = useRef(0);
  const lock = useRef<string | null>(null);
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const key = selectors.join('|');

  const measure = useCallback(() => {
    // The section closest to the line from above — NOT the last one in the
    // caller's order. The tabs are ordered by product and the page by narrative,
    // and the two do not match; comparing measured positions stays correct
    // however either is reordered.
    let current: string | null = null;
    let best = -Infinity;
    for (const sel of list.current) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const top = el.getBoundingClientRect().top;
      if (top <= offset && top > best) {
        best = top;
        current = sel;
      }
    }
    return current;
  }, [offset]);

  const unlock = useCallback(() => {
    lock.current = null;
    if (lockTimer.current) {
      clearTimeout(lockTimer.current);
      lockTimer.current = null;
    }
  }, []);

  const sync = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const next = measure();
      if (lock.current) {
        // Hold the destination until the scroll actually arrives there.
        if (lock.current === next) unlock();
        return;
      }
      setActive(prev => (prev === next ? prev : next));
    });
  }, [measure, unlock]);

  useEffect(() => {
    // A wheel or a touch means the reader took the page back mid-flight — drop
    // the lock rather than let it pin the marker to an abandoned destination.
    const abandon = () => {
      if (lock.current) unlock();
    };

    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    window.addEventListener('wheel', abandon, { passive: true });
    window.addEventListener('touchstart', abandon, { passive: true });

    // Sections move without anyone scrolling — the hero settles, a lazy panel
    // mounts, a breakpoint restacks the grid — and every reflow moves the
    // boundaries this reads.
    const ro = new ResizeObserver(sync);
    ro.observe(document.documentElement);
    for (const sel of key ? key.split('|') : []) {
      const el = document.querySelector(sel);
      if (el) ro.observe(el);
    }

    sync();

    return () => {
      window.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      window.removeEventListener('wheel', abandon);
      window.removeEventListener('touchstart', abandon);
      ro.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      if (lockTimer.current) clearTimeout(lockTimer.current);
    };
  }, [sync, unlock, key]);

  const getLinkProps = useCallback(
    (sel: string) => ({
      href: sel,
      'aria-current': (sel === active ? 'location' : undefined) as 'location' | undefined,
      onClick: (e: MouseEvent<HTMLAnchorElement>) => {
        // Leave modified clicks and middle-clicks to the browser — the href is
        // real, and someone opening it in a new tab means it.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        const el = document.querySelector(sel);
        if (!el) return;
        e.preventDefault();

        lock.current = sel;
        setActive(sel);
        el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });

        // Backstop: a scroll that never reaches the target (a section trimmed by
        // the page foot) would otherwise hold the lock forever.
        if (lockTimer.current) clearTimeout(lockTimer.current);
        lockTimer.current = setTimeout(() => {
          lockTimer.current = null;
          lock.current = null;
          sync();
        }, release);
      },
    }),
    [active, reduced, release, sync]
  );

  return { active, getLinkProps };
};

export default useScrollSpy;
