import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { DUR, EASE } from '../../lib/motion';

/*
==================================================
  SLAYER TERMINAL - THE MODAL SHELL (ui/Overlay.tsx)

  One primitive on Radix Dialog. Every modal surface in the terminal mounts
  through here: the drilldown, the command palette, settings, shortcuts and
  onboarding.

  WHY A LIBRARY, HAVING HAND-ROLLED IT ONCE. `hooks/useFocusTrap.ts` was a
  careful implementation and it was still wrong in ways that only show up on a
  keyboard or a screen reader:

    - It trapped TAB but never marked the page behind the dialog. A screen
      reader walked straight into the desk underneath, because `aria-modal`
      alone does not remove content from the accessibility tree in every engine.
      Radix sets `aria-hidden` on the siblings and removes it on close.

    - Its focusable selector was a hand-written string, so `[contenteditable]`,
      `details > summary` and `audio/video[controls]` were not tab stops inside
      a dialog that contained them.

    - It filtered candidates with `el.offsetParent !== null` as a proxy for
      "visible". `offsetParent` is null for ANY `position: fixed` element, so a
      fixed control inside an overlay was silently dropped out of the tab cycle
      while being perfectly visible on screen.

    - Scroll-lock, Escape and the portal were re-implemented per overlay — five
      copies, each with its own idea of whether to listen on `window` or
      `document` and whether to restore the previous `overflow` value or assume
      `''`.

  None of that is a criticism of the code that was there; it is the reason this
  problem is solved in a library and not in an app. Radix also handles the parts
  nobody hand-rolls at all: pointer-events guarding while the overlay animates
  out, `aria-describedby` wiring, and restoring focus to the trigger even when
  the trigger unmounted while the dialog was open.

  WHAT IS KEPT. The motion is ours — Radix ships no animation, and `forceMount`
  plus `AnimatePresence` is how the exit transition survives the unmount. The
  chrome is ours. What is outsourced is the behaviour, which is the part that
  was wrong.
==================================================
*/

export interface OverlayProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name. Radix requires a title; this is rendered to screen readers only. */
  label: string;
  /** Panel classes — sizing and shape belong to the caller. */
  className?: string;
  /** Backdrop click closes by default; pass false for a flow that must be answered. */
  dismissible?: boolean;
  /**
   * Where the panel sits. `top` is for surfaces you type into — a command
   * palette anchored to the middle jumps as its result list grows and shrinks
   * under the cursor, which a fixed top edge does not.
   */
  align?: 'center' | 'top';
  /** Forwarded to the panel — list navigation stays with the caller. */
  onKeyDown?: (e: KeyboardEvent) => void;
  children: ReactNode;
}

const Overlay = ({
  open,
  onClose,
  label,
  className,
  dismissible = true,
  align = 'center',
  onKeyDown,
  children,
}: OverlayProps) => {
  /*
    FOCUS GOES BACK WHERE IT CAME FROM.

    Radix returns focus to its own `Dialog.Trigger` on close — and none of these
    overlays uses one. Every caller drives `open` from its own state (⌘K from a
    key handler, Settings from a gear button, the drilldown from a table row),
    so Radix has no trigger to hand focus back to and drops it on `<body>`.
    Measured: open Settings from the keyboard, press Escape, and
    `document.activeElement` is BODY — a keyboard reader is returned to the top
    of the document and has to tab back through the whole header.

    So the element that was focused when the overlay opened is remembered and
    refocused on close, guarded on still being in the document: a row drilldown
    can outlive the row that opened it when the table re-sorts underneath.
  */
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      return;
    }
    const el = opener.current;
    opener.current = null;
    if (el && el.isConnected) el.focus({ preventScroll: true });
  }, [open]);

  return (
  <Dialog.Root open={open} onOpenChange={next => !next && onClose()}>
    <AnimatePresence>
      {open && (
        /* `forceMount` on both parts: Radix would unmount them the moment `open`
           flips, and AnimatePresence cannot animate what React has already
           removed. Presence is driven by the guard above instead. */
        <Dialog.Portal forceMount>
          <Dialog.Overlay asChild forceMount>
            <motion.div
              className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-[3px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DUR.fast }}
            />
          </Dialog.Overlay>
          {/*
            CENTRED BY LAYOUT, NOT BY TRANSFORM, and the difference is not
            stylistic — the transform version was broken and shipped.

            The panel used to be `fixed left-1/2 -translate-x-1/2 top-1/2
            -translate-y-1/2`, and Tailwind's translate utilities work by
            writing the `transform` PROPERTY. The same element is a
            `motion.div` animating `scale` and `y`, and motion writes
            `style.transform` unconditionally — `translateY(10px) scale(0.97)`
            while animating and the literal string `none` once it settles.
            Inline style beats a class, so every modal in the terminal came to
            rest with its LEFT EDGE at 50vw instead of its centre. Measured:
            the command palette at 1500px sat at x=745 with width 512, where
            centred is x=494. A wide drilldown ran off the right of the screen
            and a phone got the whole panel pushed off-canvas.

            A flex container cannot be overridden by the child's transform, so
            centring moves here and the panel keeps its animation. The padding
            comes back with it: every hand-rolled overlay this component
            replaced had a viewport gutter (`p-3 sm:p-6`, `px-4`, `p-4`) and
            the rewrite dropped it, which made `w-full` on a fixed element
            resolve to 100vw and put every modal edge-to-edge on a phone.
            Inside a padded flex container it resolves against the content box,
            which is what the callers' `max-h-[calc(100vh-1.5rem)]` was written
            against.

            `pointer-events-none` on the container so the gutter is not a
            hit-target that swallows backdrop clicks; the panel takes them back.
          */}
          <div
            className={cn(
              'pointer-events-none fixed inset-0 z-[71] flex justify-center p-3 sm:p-6',
              align === 'top' ? 'items-start pt-[14vh] sm:pt-[16vh]' : 'items-center'
            )}
          >
          <Dialog.Content
            asChild
            forceMount
            onPointerDownOutside={e => !dismissible && e.preventDefault()}
            onEscapeKeyDown={e => !dismissible && e.preventDefault()}
          >
            <motion.div
              onKeyDown={onKeyDown}
              className={cn(
                'pointer-events-auto flex w-full flex-col',
                'overflow-hidden rounded-lg border border-borderMuted bg-panel shadow-overlay',
                /* Radix moves focus to this panel on open when nothing inside
                   claims it, so it IS a focus target and must show that it is.
                   `focus:outline-none` alone is what `focusRing.test.ts` exists
                   to forbid — the house ring replaces the outline rather than
                   removing it. */
                'focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60',
                className
              )}
              /* Rises into the middle of the screen rather than sliding in from
                 an edge — a drilldown is the thing you asked for, not a side tab. */
              initial={{ opacity: 0, scale: 0.97, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 10 }}
              transition={{ duration: DUR.quick, ease: EASE }}
            >
              {/* Radix warns without a title and screen readers need the name;
                  the visible header is the caller's business. */}
              <Dialog.Title className="sr-only">{label}</Dialog.Title>
              {children}
            </motion.div>
          </Dialog.Content>
          </div>
        </Dialog.Portal>
      )}
    </AnimatePresence>
  </Dialog.Root>
  );
};

export default Overlay;
