/*
==================================================
  SLAYER TERMINAL - REPORT CONTROL
  Part 12 · the moderation affordance on a row.
==================================================

  ONE BUTTON PER ROW, AND WHICH BUTTON DEPENDS ON WHOSE ROW IT IS.

  A post this browser wrote gets DELETE, because it exists nowhere else and
  removing it is a true deletion. Everyone else's gets REPORT, which hides
  the row here and queues a claim — the split, and the reason for it, is
  written down in data/moderation.ts.

  THE DIALOG SAYS WHAT WILL HAPPEN BEFORE IT HAPPENS. A reader who presses
  report expects something to change; if the copy only promised a review
  they would press it again when the post stayed put. So the confirm button
  names the immediate effect ("Hide and report"), and the line beneath it
  is honest that nothing has reached a human yet.
*/

import { useState } from 'react';
import { Flag, Trash2, Undo2 } from 'lucide-react';
import Modal from '../ui/Modal';
import {
  REPORT_REASONS,
  REPORT_REASON_ORDER,
  excerptOf,
  reportBlockedBecause,
  reportIsActionable,
  type ReportReason,
  type ReportTarget,
} from '../../data/moderation';

interface Props {
  targetKind: ReportTarget;
  targetId: string;
  /** The text the claim is about — copied into the report as an excerpt. */
  body: string;
  /** True when this browser authored the row: delete, not report. */
  mine: boolean;
  onFile: (reason: ReportReason, detail: string, excerpt: string) => void;
  onDelete: () => void;
}

const ReportControl = ({ targetKind, targetId, body, mine, onFile, onDelete }: Props) => {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('spam');
  const [detail, setDetail] = useState('');

  const close = () => {
    setOpen(false);
    setReason('spam');
    setDetail('');
  };

  if (mine) {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          aria-label="Delete this post"
          title="Delete"
          className="shrink-0 p-1 rounded text-textMuted hover:text-bear hover:bg-white/[0.04] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-select"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <Modal
          open={open}
          onClose={close}
          ariaLabel="Delete this post"
          widthClass="max-w-[440px]"
          header={<span className="text-[13px] font-semibold text-textPrimary">Delete this post?</span>}
        >
          <div className="flex flex-col gap-4">
            <p className="text-[12px] text-textSecondary leading-relaxed">
              It was written in this browser and has never left it, so this removes it for good. There is no undo.
            </p>
            <p className="border-l border-borderSubtle pl-3 text-[12px] text-textMuted italic leading-relaxed">
              {excerptOf(body)}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  onDelete();
                  close();
                }}
                className="px-3 py-1.5 rounded-md border border-bear/40 bg-bear/[0.06] hover:bg-bear/[0.12] font-mono text-[11px] font-semibold uppercase tracking-wider text-bear transition-colors"
              >
                Delete
              </button>
              <button
                onClick={close}
                className="px-3 py-1.5 rounded-md border border-borderSubtle hover:bg-white/[0.03] font-mono text-[11px] uppercase tracking-wider text-textSecondary transition-colors"
              >
                Keep it
              </button>
            </div>
          </div>
        </Modal>
      </>
    );
  }

  const blocked = reportBlockedBecause(reason, detail);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Report this post"
        title="Report"
        className="shrink-0 p-1 rounded text-textMuted hover:text-warn hover:bg-white/[0.04] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-select"
      >
        <Flag className="w-3.5 h-3.5" />
      </button>
      <Modal
        open={open}
        onClose={close}
        ariaLabel="Report this post"
        widthClass="max-w-[520px]"
        header={<span className="text-[13px] font-semibold text-textPrimary">Report this {targetKind}</span>}
      >
        <div className="flex flex-col gap-4">
          <p className="border-l border-borderSubtle pl-3 text-[12px] text-textMuted italic leading-relaxed">
            {excerptOf(body)}
          </p>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="font-mono text-[10px] uppercase tracking-widest text-textMuted mb-1.5">
              What is wrong with it
            </legend>
            {REPORT_REASON_ORDER.map(key => {
              const spec = REPORT_REASONS[key];
              const on = reason === key;
              return (
                <label
                  key={key}
                  className={`flex items-start gap-2.5 rounded-md border px-3 py-2 cursor-pointer transition-colors ${
                    on ? 'border-select/50 bg-select/[0.06]' : 'border-borderSubtle hover:bg-white/[0.03]'
                  }`}
                >
                  <input
                    type="radio"
                    name={`report-${targetKind}-${targetId}`}
                    checked={on}
                    onChange={() => setReason(key)}
                    className="mt-[3px] accent-select"
                  />
                  <span className="min-w-0">
                    <span className={`block text-[12px] font-semibold ${on ? 'text-textPrimary' : 'text-textSecondary'}`}>
                      {spec.label}
                    </span>
                    <span className="block mt-0.5 text-[11px] text-textMuted leading-snug">{spec.note}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          <div>
            <label
              htmlFor={`report-detail-${targetId}`}
              className="block font-mono text-[10px] uppercase tracking-widest text-textMuted mb-1.5"
            >
              Detail {REPORT_REASONS[reason].needsDetail ? '(required for this reason)' : '(optional)'}
            </label>
            <textarea
              id={`report-detail-${targetId}`}
              value={detail}
              onChange={e => setDetail(e.target.value)}
              rows={2}
              placeholder="What should a reviewer look at?"
              className="w-full bg-inputBg border border-borderSubtle rounded-md px-2.5 py-2 text-[12px] text-textPrimary placeholder:text-textMuted focus:border-borderMuted outline-none transition-colors resize-y"
            />
            {blocked && <p className="mt-1.5 text-[11px] text-warn leading-snug">{blocked}</p>}
          </div>

          {/* The two halves, in the order they happen. */}
          <div className="border-t border-borderSubtle pt-3 flex flex-col gap-1">
            <p className="text-[11px] text-textSecondary leading-relaxed">
              <span className="text-textPrimary font-semibold">Now:</span> the post disappears from your feed. You can
              put it back from “Hidden by you” at the bottom of the page.
            </p>
            <p className="text-[11px] text-textSecondary leading-relaxed">
              <span className="text-textPrimary font-semibold">Next:</span> the report is filed. Nobody has reviewed it
              — moderation arrives with accounts, and this queue is what it will read.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onFile(reason, detail.trim(), excerptOf(body));
                close();
              }}
              disabled={!reportIsActionable(reason, detail)}
              className="px-3 py-1.5 rounded-md border border-warn/40 bg-warn/[0.06] hover:bg-warn/[0.12] font-mono text-[11px] font-semibold uppercase tracking-wider text-warn transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              Hide and report
            </button>
            <button
              onClick={close}
              className="px-3 py-1.5 rounded-md border border-borderSubtle hover:bg-white/[0.03] font-mono text-[11px] uppercase tracking-wider text-textSecondary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default ReportControl;

/*
  THE UNDO SHELF. Hiding something with no way back turns a misclick into a
  permanent hole in the feed, and the reader cannot even tell how big the
  hole is. This lists what they hid, why, and puts it back.
*/
export const HiddenShelf = ({
  count,
  children,
}: {
  count: number;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <div className="border border-borderSubtle bg-panel rounded-md px-4 py-2.5">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-textMuted hover:text-textSecondary transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-select rounded"
      >
        <Undo2 size={11} />
        Hidden by you
        <span className="tnum text-textSecondary">{count}</span>
      </button>
      {open && <div className="mt-3 flex flex-col gap-2">{children}</div>}
    </div>
  );
};
