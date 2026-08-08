import { KNOWABILITY, knowabilityTitle, type Knowability } from './knowability';

/*
  The chip for ui/knowability.ts — a three-dot meter and a word.

  Deliberately NOT a SignalBadge. Every other status pill in the app is a
  bordered, tinted, uppercase badge, and knowability has to sit BESIDE those
  without competing with them: a Fracture row already carries a regime tone, a
  landing card already carries a verdict, and a Trace print already carries an
  intent. A second bordered pill in that row reads as a second verdict. The dot
  meter is quieter than a badge and, unlike a badge, it is a SCALE — three dots
  against one is legible before the word is read, which is the whole job.

  Extracted verbatim from pages/fracture/Fracture.tsx so that desk's render is
  byte-identical after the move; the only change there is the import.
*/

interface KnowabilityChipProps {
  tier: Knowability;
  /**
   * Why THIS figure sits at this tier. Shown in the tooltip in place of the
   * tier's generic hint. Worth supplying: "inferred from liquidation
   * thresholds — not directly observable" tells a reader something the word
   * "Assumed" on its own cannot.
   */
  basis?: string;
  className?: string;
}

const KnowabilityChip = ({ tier, basis, className = '' }: KnowabilityChipProps) => {
  const m = KNOWABILITY[tier];
  return (
    <span className={`inline-flex items-center gap-1.5 shrink-0 ${className}`} title={knowabilityTitle(tier, basis)}>
      <span className="flex items-center gap-[3px]">
        {[0, 1, 2].map(i => (
          <span key={i} className={`w-1 h-1 rounded-full ${i < m.dots ? 'bg-textSecondary' : 'bg-white/15'}`} />
        ))}
      </span>
      <span className={`font-mono text-label uppercase tracking-wider ${m.text}`}>{m.label}</span>
    </span>
  );
};

export default KnowabilityChip;
