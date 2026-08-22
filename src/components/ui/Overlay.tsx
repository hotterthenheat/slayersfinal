import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import type { KeyboardEvent, ReactNode } from 'react';
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
}: OverlayProps) => (
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
          <Dialog.Content
            asChild
            forceMount
            onPointerDownOutside={e => !dismissible && e.preventDefault()}
            onEscapeKeyDown={e => !dismissible && e.preventDefault()}
          >
            <motion.div
              onKeyDown={onKeyDown}
              className={cn(
                'fixed left-1/2 z-[71] flex w-full -translate-x-1/2 flex-col',
                align === 'top' ? 'top-[18vh]' : 'top-1/2 -translate-y-1/2',
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
        </Dialog.Portal>
      )}
    </AnimatePresence>
  </Dialog.Root>
);

export default Overlay;
