import { PROVENANCE_WORDS, weakest, type ProvenanceKey } from '../../data/provenance';

/*
  P-1's chip. Names what a panel is standing on, in one word, with the
  sentence on hover.

  NO PALETTE INK. The dealer colours all mean market things and red/green is
  price direction; "where this number came from" is none of those, so the
  chip is steel and carries its state in the WORD plus a dot's fill —
  measured solid, derived hollow, modelled hollow and dimmed. A reader
  scanning for the strongest source is looking for the solid dot.
*/

const ProvenanceChip = ({ sources, className = '' }: { sources: readonly ProvenanceKey[]; className?: string }) => {
  const e = weakest(sources);
  const solid = e.kind === 'measured';
  const dim = e.kind === 'modelled';
  return (
    <span
      title={e.note}
      aria-label={`Data provenance: ${PROVENANCE_WORDS[e.kind]} — ${e.note}`}
      className={`inline-flex items-center gap-1 rounded border border-borderSubtle px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
        dim ? 'text-textMuted' : 'text-textSecondary'
      } ${className}`}
    >
      <span
        aria-hidden
        className={`inline-block w-1.5 h-1.5 rounded-full ${solid ? 'bg-textSecondary' : 'border border-current'}`}
      />
      {PROVENANCE_WORDS[e.kind]}
    </span>
  );
};

export default ProvenanceChip;
