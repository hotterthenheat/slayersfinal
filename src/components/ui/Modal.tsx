/*
==================================================
  SLAYER TERMINAL - MODAL
  A centred overlay card — the house pattern for
  drilldowns that need room but must not take the
  screen. Deliberately NOT a side drawer: a right-
  hand panel covers the very rows you are comparing
  against, while a centred card over a dimmed tape
  keeps the context you came from visible.

  Owns the portal, backdrop, escape, click-outside,
  scroll lock and motion. Callers supply a header
  and a body; the body scrolls, the header doesn't.
==================================================
*/

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useFocusTrap } from './useFocusTrap';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  header: ReactNode;
  children: ReactNode;
  /** Extra controls pinned to the header's right, before the close button. */
  headerActions?: ReactNode;
  /** Controls centred in the header — for the one control the whole view hangs on. */
  headerCenter?: ReactNode;
  /** Tailwind max-width class — default is the medium drilldown size. */
  widthClass?: string;
}

const Modal = ({ open, onClose, ariaLabel, header, children, headerActions, headerCenter, widthClass = 'max-w-[760px]' }: ModalProps) => {
  // Escape closes; the page underneath must not scroll while we're up.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  /* Escape and the scroll lock were already here; the keyboard was not.
     Opening this card left focus on the row behind it, so the first Tab
     walked the tape underneath instead of the drilldown on top of it. */
  const cardRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(open, cardRef);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      {/* Backdrop — dimmed but deliberately still legible underneath */}
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] animate-modal-backdrop" onClick={onClose} aria-hidden />

      {/* tabIndex -1: not a tab stop, but focusable, so the trap has somewhere
          to put the keyboard when the card has no focusable child of its own. */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={`relative w-full ${widthClass} max-h-[86vh] flex flex-col border border-borderMuted bg-panel rounded-lg shadow-2xl shadow-black/70 overflow-hidden animate-modal-card`}
      >
        {/* Three tracks so the centre stays centred no matter how long the
            identity on the left runs — an absolute overlay would collide.

            THREE TRACKS NEED THREE TRACKS' WORTH OF ROOM. Held at every width,
            the identity was squeezed into roughly 100px on a 390px screen and
            wrapped to seven lines, with the stepper and the close button
            floating vertically centred in the MIDDLE of that stack — measured
            on the print drilldown, a 250px header on an 844px phone. Below
            `sm` the header wraps instead: identity across the top, controls on
            the row beneath. The grid returns the moment there is room for it. */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-borderSubtle shrink-0 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:gap-3">
          <div className="w-full min-w-0 sm:w-auto">{header}</div>
          <div className="flex items-center justify-center">{headerCenter}</div>
          <div className="ml-auto flex items-center justify-end gap-2 sm:ml-0">
            {headerActions}
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-1 -m-1 rounded text-textMuted hover:text-textPrimary hover:bg-white/[0.05] transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* [&>*]:shrink-0 — sections render at natural height and the BODY
            scrolls. Without it, any child with overflow-hidden (rounded frames)
            has a flex min-size of 0 and gets crushed to fit 86vh instead:
            clipped text, half-drawn charts, whole sections silently missing. */}
        <div className="overflow-y-auto px-4 py-4 flex flex-col gap-4 [&>*]:shrink-0">{children}</div>
      </div>
    </div>,
    document.body
  );
};

export default Modal;
