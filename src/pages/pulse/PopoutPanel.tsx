/**
 * A panel rendered into its own OS window.
 *
 * The window is a real `window.open` popup, and the panel is rendered into it
 * with `createPortal`. That choice is load-bearing: a portal keeps the panel
 * inside the PARENT React tree, so it stays subscribed to MarketDataContext and
 * keeps ticking with the rest of the desk. Rendering a second React root in the
 * child window would give it a second simulator and two terminals that disagree
 * about the price, which is the one thing this product cannot do.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ScreenBox } from './presets';
import { boxMoved } from './detach';
import { adoptStyles } from './popoutWindow';

interface PopoutPanelProps {
  win: Window;
  children: ReactNode;
  /** User closed the window with its own close button, or it died. */
  onClosed: () => void;
  /** The window was moved or resized — persist so the layout restores here. */
  onMoved: (box: ScreenBox) => void;
}

const PopoutPanel = ({ win, children, onClosed, onMoved }: PopoutPanelProps) => {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  // Callbacks live in refs so the window is set up ONCE. Re-running the effect
  // when a parent re-render makes a new `onMoved` would tear down the mount
  // node on every market tick, and the panel would flicker once a second.
  const closedRef = useRef(onClosed);
  const movedRef = useRef(onMoved);
  closedRef.current = onClosed;
  movedRef.current = onMoved;

  useEffect(() => {
    if (win.closed) {
      closedRef.current();
      return;
    }
    const el = win.document.createElement('div');
    // The child body is a flex column so the panel fills the window and its
    // body scrolls, matching how a docked panel behaves inside its grid cell.
    // `inst-surface` is the same panel shell a docked panel wears — without it
    // the pop-out renders straight onto the canvas and reads as a hole rather
    // than a panel. No rounding: it is filling a window, not sitting in a grid.
    el.className = 'inst-surface';
    el.style.cssText = 'height:100%;display:flex;flex-direction:column;overflow:hidden;border-width:0';
    // Preserve the inline canvas colour openPanelWindow set against the
    // stylesheet arriving late; cssText would wipe it.
    const painted = win.document.body.style.background;
    win.document.body.style.cssText = 'margin:0;height:100vh;overflow:hidden';
    if (painted) win.document.body.style.background = painted;
    win.document.body.appendChild(el);
    const stopStyles = adoptStyles(win.document);
    setMount(el);

    const handleClosed = () => closedRef.current();
    win.addEventListener('pagehide', handleClosed);

    // The parent navigating away or reloading must take its children with it,
    // or the user is left with orphan windows rendering a dead React tree.
    const closeChild = () => win.close();
    window.addEventListener('pagehide', closeChild);

    // There is no "window moved" event, so position is polled. 400ms is slow
    // enough to be free and fast enough that dropping a panel on another
    // monitor and immediately saving the layout records where it landed.
    let last: ScreenBox | undefined;
    const poll = window.setInterval(() => {
      if (win.closed) {
        closedRef.current();
        return;
      }
      // innerWidth/innerHeight, not outer: `window.open`'s width and height
      // describe the CONTENT area, so persisting the outer size and feeding it
      // back would grow the window by the chrome height every reopen.
      const box: ScreenBox = { left: win.screenX, top: win.screenY, width: win.innerWidth, height: win.innerHeight };
      if (boxMoved(last, box)) {
        last = box;
        movedRef.current(box);
      }
    }, 400);

    return () => {
      window.clearInterval(poll);
      stopStyles();
      win.removeEventListener('pagehide', handleClosed);
      window.removeEventListener('pagehide', closeChild);
      // Unmounting means the panel was re-docked or the layout switched. The
      // window has nothing left to show, so it goes with it.
      if (!win.closed) win.close();
    };
  }, [win]);

  return mount ? createPortal(children, mount) : null;
};

export default PopoutPanel;
