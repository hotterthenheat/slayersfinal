/**
 * The DOM half of popping a panel out. Separate from PopoutPanel.tsx so that
 * file exports nothing but a component — a module that mixes components and
 * helpers loses hot reload for everything in it, which on a 1400-line workspace
 * means a full page reload on every keystroke.
 */
import type { ScreenBox } from './presets';
import { popoutFeatures } from './detach';

/**
 * Open the window.
 *
 * Must be called from inside the click handler's own call stack. A popup
 * inherits its opener's user activation, and that activation does not survive
 * into `useEffect` — opening there is blocked outright in Safari and
 * intermittently in Chrome, which presents as "the button does nothing
 * sometimes". Returns null when the blocker wins anyway.
 */
export function openPanelWindow(box: ScreenBox, name: string, title: string): Window | null {
  // The name makes this idempotent: asking for a name that is already open
  // focuses the existing window instead of spawning a second copy.
  const win = window.open('', `slayer_${name}`, popoutFeatures(box));
  if (!win) return null;
  try {
    win.document.title = title;
    // A reused window still holds the previous mount. Clear it so the portal
    // renders into a clean body rather than under a stale tree.
    win.document.body.innerHTML = '';
    // Paint the canvas colour inline, NOW, before the copied stylesheet has
    // fetched. Measured: the sheet lands somewhere between 1.2s and 2.5s on a
    // cold popup, and until it does the window is white — a full second of
    // flashbang next to a dark terminal, on a panel the user just asked to move
    // to another monitor. Read off the live body so it cannot drift from the
    // token.
    const canvas = getComputedStyle(document.body).backgroundColor;
    if (canvas && canvas !== 'rgba(0, 0, 0, 0)') win.document.body.style.background = canvas;
  } catch {
    /* already closed, or a browser that refuses document access on a fresh
       about:blank. The caller treats a dead window as a blocked one. */
  }
  return win;
}

/**
 * Mirror the app's stylesheets into the child document.
 *
 * A popup opened on `about:blank` inherits nothing — no Tailwind, no tokens, no
 * dark background. In a production build the CSS is a `<link>` the popup can
 * refetch (same origin, already cached). In dev, Vite injects `<style>`
 * elements and REPLACES their contents on every hot update, so the clones have
 * to be rebuilt when the parent head changes or the pop-out silently drifts a
 * stylesheet behind the main window mid-session.
 *
 * Returns a teardown for the observer.
 */
export function adoptStyles(dst: Document): () => void {
  const links = new Set<string>();
  let styleClones: HTMLStyleElement[] = [];

  const copyLinks = () => {
    document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach(l => {
      if (links.has(l.href)) return;
      links.add(l.href);
      const clone = dst.createElement('link');
      clone.rel = 'stylesheet';
      clone.href = l.href;
      dst.head.appendChild(clone);
    });
  };

  const copyStyles = () => {
    styleClones.forEach(n => n.remove());
    styleClones = [...document.querySelectorAll('style')].map(s => {
      const clone = dst.createElement('style');
      clone.textContent = s.textContent;
      dst.head.appendChild(clone);
      return clone;
    });
  };

  copyLinks();
  copyStyles();

  // `body { @apply bg-canvas ... }` and `html { color-scheme: dark }` ride in
  // on the copied sheet, but the classes the shell puts on those ELEMENTS do
  // not, and without them the pop-out opens white.
  dst.documentElement.className = document.documentElement.className;
  dst.body.className = document.body.className;
  dst.documentElement.lang = document.documentElement.lang || 'en';

  const obs = new MutationObserver(() => {
    copyLinks();
    copyStyles();
  });
  obs.observe(document.head, { childList: true, subtree: true, characterData: true });
  return () => obs.disconnect();
}
