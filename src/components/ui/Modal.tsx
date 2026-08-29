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

import { useEffect, type ReactNode } from 'react';
import { useMediaQuery } from './useMediaQuery';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

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
  /*
    §22 — ON A PHONE A DRAWER IS A SHEET.

    A centred card is a desktop shape: at 390px it either fills the viewport
    with margins nobody asked for or floats above the fold. Every phone
    reader already knows the bottom sheet, so below `md` this mounts as one —
    docked to the bottom edge, full width, rounded at the top, rising rather
    than scaling.

    One decision here reaches every drawer on the desk, because they all go
    through this component. That is the reason to fix it in Modal rather than
    per page.
  */
  const sheet = useMediaQuery('(max-width: 767px)');
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

  /*
    ONLY ONE PADDING CLASS IS EMITTED BELOW. Writing `p-4` in the base string
    and `p-0` in the sheet branch puts BOTH in the class attribute, and
    Tailwind resolves that by STYLESHEET order rather than attribute order —
    so the sheet came up inset by 16px on every edge and neither reached the
    bottom nor spanned the width. Measured, not guessed: 358px of 390.
  */
  if (!open) return null;

  return createPortal(
    <div className={`fixed inset-0 z-[90] flex ${sheet ? 'items-end justify-center' : 'items-center justify-center p-4'}`}>
      {/* Backdrop — dimmed but deliberately still legible underneath */}
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] animate-modal-backdrop" onClick={onClose} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={
          sheet
            ? 'relative w-full max-h-[88vh] flex flex-col border-t border-borderMuted bg-panel rounded-t-2xl shadow-2xl shadow-black/70 overflow-hidden animate-modal-sheet'
            : `relative w-full ${widthClass} max-h-[86vh] flex flex-col border border-borderMuted bg-panel rounded-lg shadow-2xl shadow-black/70 overflow-hidden animate-modal-card`
        }
      >
        {/* §22 — the grab handle. It is not draggable and does not pretend to
            be; it is the affordance a phone reader uses to recognise a sheet
            at a glance, and it marks the top edge as the thing to dismiss
            past. Purely decorative, so it is hidden from the tree. */}
        {sheet && (
          <div className="flex justify-center pt-2 pb-1 shrink-0" aria-hidden>
            <span className="block w-9 h-1 rounded-full bg-white/20" />
          </div>
        )}
        {/* Three tracks so the centre stays centred no matter how long the
            identity on the left runs — an absolute overlay would collide. */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3 border-b border-borderSubtle shrink-0">
          <div className="min-w-0">{header}</div>
          <div className="flex items-center justify-center">{headerCenter}</div>
          <div className="flex items-center justify-end gap-2">
            {headerActions}
            <button
              onClick={onClose}
              aria-label="Close"
              className={`rounded text-textMuted hover:text-textPrimary hover:bg-white/[0.05] transition-colors shrink-0 ${
                sheet ? 'p-2 -m-1' : 'p-1 -m-1'
              }`}
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
