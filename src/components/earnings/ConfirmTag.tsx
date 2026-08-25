/*
==================================================
  SLAYER TERMINAL - EARNINGS CONFIRM TAG
  Whether an earnings date is company-CONFIRMED or
  still an analyst ESTIMATE. Soft-green dot = locked
  in (a spot of go against the muted word), amber dot
  = tentative — the same "pending" amber the dawn/rich
  cues use. One dot, one word, no jargon.
==================================================
*/

const ConfirmTag = ({ confirmed, dense = false, long = false }: { confirmed: boolean; dense?: boolean; long?: boolean }) => (
  <span
    className={`inline-flex items-center gap-1 font-mono uppercase tracking-wider leading-none ${
      confirmed ? 'text-textMuted' : 'text-warn'
    } ${dense ? 'text-[9px]' : 'text-[10px]'}`}
  >
    <span className={`rounded-full ${confirmed ? 'bg-bull' : 'bg-warn'} ${dense ? 'w-1 h-1' : 'w-1.5 h-1.5'}`} />
    {confirmed ? (long ? 'Confirmed date' : 'Confirmed') : long ? 'Estimated date' : 'Est.'}
  </span>
);

export default ConfirmTag;
