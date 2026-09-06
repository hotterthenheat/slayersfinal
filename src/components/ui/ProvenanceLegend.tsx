import { useState } from 'react';
import { PROVENANCE_NOTES, PROVENANCE_WORDS, DATA_STATE_NOTES, DATA_STATE_WORDS, type ProvenanceKind, type DataState } from '../../data/provenance';
import Modal from './Modal';

/*
==================================================
  SLAYER TERMINAL - WHAT THE CHIPS MEAN
  (components/ui/ProvenanceLegend.tsx)
==================================================

  The desk labels where every number came from, in one word, on the panel that
  shows it. That vocabulary is only useful if a reader can find out what the
  words mean without being told by a person.

  WHY THE FOOTER AND NOT THE CHIP. The obvious home is the chip itself —
  click "derived", read what derived means. It is also the wrong one here,
  because a chip whose kind is `simulated` or `model` deliberately draws
  nothing on this build, so on a desk with no feeds attached most panels have
  no chip to click and the legend would be unreachable exactly when someone
  most wants it. The footer is on every page and needs no state to find.

  FIVE KINDS AND FOUR STATES ARE TWO AXES, NOT NINE WORDS, and the table says
  so by having two columns. "measured · stale" is two true statements about
  one number; collapsing them into a single word would force dropping one.
*/

const KINDS: ProvenanceKind[] = ['live', 'measured', 'derived', 'model', 'simulated'];
const STATES: DataState[] = ['ok', 'stale', 'partial', 'unavailable'];

/* The dot treatments the chip actually uses, repeated here so the legend
   shows the mark rather than describing it. If these drift from
   ProvenanceChip the legend is lying, so they are worth reading together. */
const DOT: Record<ProvenanceKind, string> = {
  live: 'bg-textSecondary ring-1 ring-textSecondary/40',
  measured: 'bg-textSecondary',
  derived: 'border border-current',
  model: 'border border-current',
  simulated: 'border border-current opacity-60',
};

export const ProvenanceLegend = () => (
  <div className="flex flex-col gap-5">
    <section className="flex flex-col gap-2">
      <h4 className="font-mono text-[10px] font-semibold uppercase tracking-widest text-textPrimary">
        Where a number came from
      </h4>
      <p className="text-[11px] text-textMuted leading-relaxed">
        Every panel says what it is standing on. The word is the claim; the dot is the
        same claim at a glance.
      </p>
      <ul className="flex flex-col gap-1.5 mt-1">
        {KINDS.map(k => (
          <li key={k} className="flex items-start gap-2.5">
            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 text-textSecondary ${DOT[k]}`} />
            <span className="min-w-0">
              <span className="font-mono text-[11px] uppercase tracking-wider text-textSecondary">
                {PROVENANCE_WORDS[k]}
              </span>
              <span className="block text-[11px] text-textMuted leading-relaxed">{PROVENANCE_NOTES[k]}</span>
            </span>
          </li>
        ))}
      </ul>
      {/* Said plainly rather than left for someone to notice. */}
      <p className="text-[11px] text-textMuted leading-relaxed mt-1 border-t border-borderSubtle pt-2">
        On this build no market feed is attached, so every source resolves to the
        last of those. The two weakest kinds draw no chip rather than writing
        the same word across every panel; the moment a feed lands, the three
        above start labelling themselves.
      </p>
    </section>

    <section className="flex flex-col gap-2">
      <h4 className="font-mono text-[10px] font-semibold uppercase tracking-widest text-textPrimary">
        And how it is doing
      </h4>
      <p className="text-[11px] text-textMuted leading-relaxed">
        A second axis, shown as a suffix — "measured · stale" is two true things about
        one number.
      </p>
      <ul className="flex flex-col gap-1.5 mt-1">
        {STATES.map(s => (
          <li key={s}>
            <span
              className={`font-mono text-[11px] uppercase tracking-wider ${
                s === 'stale' || s === 'partial' ? 'text-warn' : 'text-textSecondary'
              }`}
            >
              {/* `ok` deliberately has no word and no note in the shared
                  vocabulary — a current value draws no suffix, which is the
                  right call on a panel and the wrong one in a legend. The
                  state a reader meets most often would have been the one this
                  page never explained. */}
              {DATA_STATE_WORDS[s] || 'no suffix'}
            </span>
            <span className="block text-[11px] text-textMuted leading-relaxed">
              {DATA_STATE_NOTES[s] || 'The value is current. Nothing is appended to the label.'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  </div>
);

/** The footer's entry point — a link, and the legend behind it. */
export const ProvenanceLegendLink = ({ className = '' }: { className?: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className={className}>
        What the data labels mean
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        ariaLabel="What the data labels mean"
        header={
          <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-textPrimary">
            Data labels
          </span>
        }
      >
        <div className="p-4 max-w-xl">
          <ProvenanceLegend />
        </div>
      </Modal>
    </>
  );
};

export default ProvenanceLegend;
