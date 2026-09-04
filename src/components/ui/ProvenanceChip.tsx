import {
  DATA_STATE_NOTES, DATA_STATE_WORDS, PROVENANCE_NOTES, PROVENANCE_WORDS,
  weakest, type DataState, type ProvenanceKind, type ProvenanceKey,
} from '../../data/provenance';

/*
  P-1's chip, grown to the full vocabulary. Names what a panel is standing
  on, in one word, with the sentence on hover.

  NO PALETTE INK, still. The dealer colours all mean market things and
  red/green is price direction; "where this number came from" is none of
  those. So the chip is steel and carries its kind in the WORD plus the
  DOT'S TREATMENT — which gives five distinguishable states without
  borrowing a single meaning from the map:

    live        a filled dot with a ring, the only one that moves
    measured    filled
    derived     hollow

  `model` and `simulated` draw NOTHING — see the note in the component. The
  vocabulary still has five kinds and weakest() still ranks all five; two of
  them simply have no chip. When a feed lands, the three above start
  appearing on their own.

  STATE IS A SUFFIX, NOT A SIXTH WORD. "measured · stale" says two true
  things; a single word would have to drop one of them. Unavailable is the
  exception that earns different treatment — a struck-through dot and the
  word "no data" — because there is no value behind it to qualify.

  THE WARN INK IS THE ONE BORROWED COLOUR, and only for stale and partial.
  Those are the two states a reader must not scroll past, and the rule
  against palette ink is about not implying a MARKET meaning; amber here
  reads as "attention", which is what it means everywhere else on the desk.
*/

const DOT: Record<ProvenanceKind, string> = {
  live: 'bg-textSecondary ring-1 ring-textSecondary/40',
  measured: 'bg-textSecondary',
  derived: 'border border-current',
  model: 'border border-current',
  simulated: 'border border-current opacity-60',
};

export interface ProvenanceChipProps {
  sources: readonly ProvenanceKey[];
  /** Overrides the kind derived from `sources` — for a panel that IS a model. */
  kind?: ProvenanceKind;
  /** How the value is doing right now. Defaults to ok. */
  state?: DataState;
  /** Extra sentence appended to the hover text. */
  note?: string;
  className?: string;
}

const ProvenanceChip = ({ sources, kind, state = 'ok', note, className = '' }: ProvenanceChipProps) => {
  const e = weakest(sources);
  const k = kind ?? e.kind;

  /*
    THE TWO WEAKEST KINDS DO NOT DRAW (Noah, 2026-09-04: "strip all the fake
    sim mod"). This desk is a private UI render with no feeds attached yet,
    so every source in the registry currently resolves to `simulated` — which
    meant the chip's whole job on every panel was to write the word
    "simulated" across a build being shown to a partner.

    The chip is not deleted and neither are its call sites, because the
    vocabulary is right and the day a feed lands the honest label is worth
    having. It simply says nothing for the two kinds that name a stand-in.
    `live`, `measured` and `derived` still draw, so the moment a panel
    stands on something real it starts labelling itself again, with no
    call-site edit anywhere.

    The sweep enforces this from the other side now: it used to assert the
    chip WAS present and DID read "simulated", and it asserts the absence
    instead, so the wording cannot creep back in unnoticed.
  */
  if (k === 'simulated' || k === 'model') return null;
  const word = PROVENANCE_WORDS[k];
  const stateWord = DATA_STATE_WORDS[state];
  // `simulated` returned above, so unavailable is the only dimming left.
  const dim = state === 'unavailable';

  const title = [
    PROVENANCE_NOTES[k],
    e.note,
    state !== 'ok' ? DATA_STATE_NOTES[state] : '',
    note ?? '',
  ].filter(Boolean).join(' ');

  return (
    <span
      title={title}
      aria-label={`Data provenance: ${word}${stateWord ? `, ${stateWord}` : ''} — ${title}`}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
        state === 'stale' || state === 'partial'
          ? 'border-warn/40 text-warn'
          : `border-borderSubtle ${dim ? 'text-textMuted' : 'text-textSecondary'}`
      } ${className}`}
    >
      <span aria-hidden className="relative inline-flex items-center justify-center w-1.5 h-1.5">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${DOT[k]}`} />
        {state === 'unavailable' && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="block w-2 h-px bg-current rotate-45" />
          </span>
        )}
      </span>
      {word}
      {stateWord && <span className="opacity-80">&nbsp;· {stateWord}</span>}
    </span>
  );
};

export default ProvenanceChip;
