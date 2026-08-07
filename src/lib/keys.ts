/*
==================================================
  SLAYER TERMINAL - KEYBOARD GUARDS (lib/keys.ts)
  The two questions every global single-key shortcut has to ask before it fires.

  Three surfaces bind single-key shortcuts to `window` — the shell ([ ] ?), the
  terminal index (1-9) and the Pulse desk (E F A Esc) — and each had grown its
  own copy of the first guard. The copies had drifted: Pulse's missed <select>,
  so a keystroke aimed at a dropdown also toggled the desk behind it. Only the
  index had the second guard at all, so with the command palette open on Pulse,
  Escape closed the palette AND un-maximized the panel behind it, and `f` put
  the desk into fullscreen underneath the Settings dialog.
==================================================
*/

/** True when focus is in a field, so a shortcut never fires mid-typing. */
export const isTypingTarget = (el: EventTarget | null): boolean => {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable;
};

/**
 * True while a modal dialog is on screen.
 *
 * A modal owns the keyboard by definition — that is what `aria-modal` declares —
 * so nothing underneath it may act on a keystroke, including the Escape that is
 * dismissing the modal itself. Read from the DOM rather than from shared state
 * because the overlays are mounted by four different owners (the shell, the
 * desks, the drilldowns, onboarding) and no single component knows about all of
 * them; the attribute is the one thing they all already declare.
 */
export const overlayOwnsKeyboard = (): boolean =>
  document.querySelector('[role="dialog"][aria-modal="true"]') != null;
