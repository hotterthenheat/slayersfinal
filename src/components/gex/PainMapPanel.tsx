import { useMemo } from 'react';
import { buildBasisBand, bandWords } from '../../data/costBasis';
import { CALL_SIDE, PUT_SIDE, SPOT as SPOT_INK } from './palette';
import Term from '../ui/Term';
import type { FlowPrint } from '../../types/trace';

/*
==================================================
  SLAYER TERMINAL - THE PAIN MAP — P-16
  (components/gex/PainMapPanel.tsx)
==================================================

  A STRIKE'S GAMMA SAYS WHAT DEALERS MUST DO; ITS COST BASIS SAYS WHAT THE
  HOLDERS WILL DO. When price crosses the volume-weighted basis of today's
  aggressive call buyers, every one of them flips red→green at once — a
  mechanical supply event a reader can watch approaching, and the reason the
  directive calls this the most defensible thing in the product.

  THE BANDS ARE SPOTS, not premiums, because that is the axis a reader
  thinks on. The conversion is an inversion of the model, not an
  approximation, and it refuses rather than guesses when the basis is
  outside what any spot in range can mark.

  THE ASSUMPTION IS ON THE PANEL, not buried in the module. This tracks
  AGGRESSIVE LONGS — ask-side prints — because a basis mixing longs and
  shorts describes nobody. Anyone reading a flip level needs to know which
  population flips.
*/

const PainMapPanel = ({
  prints,
  spot,
  dteYears,
  iv,
}: {
  prints: FlowPrint[];
  spot: number;
  dteYears: number;
  iv: number;
}) => {
  const calls = useMemo(() => buildBasisBand(prints, 'C', spot, dteYears, iv), [prints, spot, dteYears, iv]);
  const puts = useMemo(() => buildBasisBand(prints, 'P', spot, dteYears, iv), [prints, spot, dteYears, iv]);

  const bands = [
    /* The side pair — these rows name a RIGHT, not a regime. */
    { band: calls, label: 'Call buyers', ink: CALL_SIDE },
    { band: puts, label: 'Put buyers', ink: PUT_SIDE },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">
          <Term k="Cost basis">Where today’s buyers got in</Term>
        </span>
        <span className="ml-auto font-mono text-[10px] tnum text-textMuted">
          spot <span style={{ color: SPOT_INK }}>{spot.toFixed(2)}</span>
        </span>
      </div>

      {bands.map(({ band, label, ink }) => (
        <div key={label} className="flex flex-col gap-0.5">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider" style={{ color: ink }}>
              {label}
            </span>
            <span className="font-mono text-[12px] font-semibold tnum text-textPrimary">
              {band.breakevenSpot === null ? '—' : band.breakevenSpot.toFixed(2)}
            </span>
            <span className="font-mono text-[10px] tnum text-textMuted">
              {band.contracts > 0 ? `${band.contracts.toLocaleString()} contracts` : 'no aggressive buying'}
            </span>
          </div>
          <p className="font-mono text-[10px] leading-relaxed text-textSecondary">{bandWords(band, spot)}</p>
        </div>
      ))}

      <p className="font-mono text-[9px] leading-relaxed text-textMuted">
        Tracks AGGRESSIVE LONGS — prints that lifted the ask. Bid-side prints are the other side of those trades,
        not short holders, and mid prints have no readable direction; a basis mixing them would describe nobody.
        Marked against the model at the current spot, so the level moves with price rather than with the last
        trade.
      </p>
    </div>
  );
};

export default PainMapPanel;
