import AnimatedNumber from '../ui/AnimatedNumber';

/** Live spot readout with the house change stamp (Noah, 2026-08-17: red on
    a drop, green on a rise — and "back to white after the change"): the
    flash inks the move for a beat, then eases back to white while the
    number rolls. Exactly AnimatedNumber's Robinhood grammar, named for the
    chart strips that carry it. */
/*
  15 · MARKED, SO COHERENCE CAN BE CHECKED.

  "Ticker header: spot, change, session state — and make it coherent across
  widgets. The audit found the top bar at $470.99 while two panels read
  470.95 on the same screen."

  That is a claim about what is on screen, and until now nothing could
  verify it: a sweep looking for price-shaped figures cannot tell a spot
  from an option mark, and a Weigher ladder is 160 dollar figures stepping
  by the strike increment. The first version of that check compared two
  adjacent premiums and reported a price disagreement.

  `spotOf` marks the readouts that CLAIM to be the active name's spot —
  the header capsule, the widget headers — so a test can compare exactly
  those. A contract's own mark is not a spot and deliberately does not
  carry it.
*/
const SpotPrice = ({
  value,
  className = 'font-mono text-[11px] font-semibold tnum text-textPrimary',
  spotOf,
}: {
  value: number;
  className?: string;
  /** The ticker this figure claims to be the spot of. Omit for anything
      that is not a spot — a contract mark, a strike, a target. */
  spotOf?: string;
}) => (
  <AnimatedNumber
    value={value}
    format={v => `$${v.toFixed(2)}`}
    flash
    className={className}
    data-spot={spotOf}
  />
);

export default SpotPrice;
