import { useMemo } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import { REGIME_WORDS, buildFlipGauge } from '../../data/flipGauge';
import { FLIP, LONG_GAMMA, SHORT_GAMMA } from './palette';
import Term from '../ui/Term';

/*
==================================================
  SLAYER TERMINAL - FLIP PROXIMITY STRIP — P-4
  (components/gex/FlipGaugeStrip.tsx)
==================================================

  One line, on every Pinpoint desk, answered before the page finishes
  rendering: which side of the flip the market is on, how far the flip is,
  and how many times it has been crossed today.

  THE INKS ARE THE HOUSE'S OWN. Red for SHORT GAMMA and green for LONG is the
  pair Noah chose for exactly this regime (palette.ts, 2026-08-18: "red =
  SHORT gamma (dealer hedging amplifies the move), green = LONG gamma (dips
  absorbed)"), already worn by the Positioning Map's headline and the heat
  legend. The flip PRICE is in the flip's own blue, as it is everywhere the
  line is drawn.

  DISTANCE IN DOLLARS AND PERCENT, and not in ATR or σ: the directive's
  sketch shows those units, and they arrive with T-19's desk-wide unit toggle
  — printing an ATR here before an ATR engine exists would be a number the
  app cannot source.

  NO FLIP IS A RENDERED STATE, not a hidden one. A one-sided book has no
  crossing, and the strip SAYS so — a gauge that vanished would read as
  broken, and one that printed spot would claim the flip is at the market.
*/

const fmt = (v: number) => (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));

const FlipGaugeStrip = () => {
  const { marketData } = useMarketData();
  /*
    Rebuilt on every tick rather than on a scan tier, deliberately: the whole
    point of a proximity gauge is that it is CURRENT, and the build is one
    pickFlip over the chain plus one pass over the session tail — measured
    well under a millisecond. The desks below it scan-tier their heavy
    rebuilds; this line is not one.
  */
  const gauge = useMemo(() => (marketData ? buildFlipGauge(marketData) : null), [marketData]);
  if (!gauge) return null;

  const words = gauge.regime ? REGIME_WORDS[gauge.regime] : null;

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-borderSubtle bg-panel rounded-md px-3 py-1.5"
      role="status"
      aria-label={
        words
          ? `${words.label} — ${words.blurb}. Spot ${fmt(gauge.spot)}, flip ${fmt(gauge.flip!)}, ` +
            `${Math.abs(gauge.distAbs!).toFixed(2)} away` +
            (gauge.crossings !== null ? `, crossed ${gauge.crossings} times today` : '')
          : 'No gamma flip — the book does not change sign'
      }
    >
      {words ? (
        <>
          <Term k="Gamma flip">
            <span
              className="font-mono text-[11px] font-bold uppercase tracking-wider"
              style={{ color: gauge.regime === 'SHORT' ? SHORT_GAMMA : LONG_GAMMA }}
              title={words.blurb}
            >
              {words.label}
            </span>
          </Term>
          <span className="font-mono text-[11px] tnum text-textSecondary">
            spot <span className="text-textPrimary">{fmt(gauge.spot)}</span>
          </span>
          <span className="font-mono text-[11px] tnum text-textSecondary">
            flip{' '}
            <span style={{ color: FLIP }} className="font-semibold">
              {fmt(gauge.flip!)}
            </span>
          </span>
          <span className="font-mono text-[11px] tnum text-textPrimary">
            {Math.abs(gauge.distAbs!).toFixed(2)} · {Math.abs(gauge.distPct!).toFixed(2)}%{' '}
            <span className="text-textSecondary">{gauge.distAbs! > 0 ? 'overhead' : 'below'}</span>
          </span>
          {/* Null while the session is too young for a zero to be a
              measurement — the count appears when it means something. */}
          {gauge.crossings !== null && (
            <span className="font-mono text-[11px] tnum text-textSecondary">
              crossed <span className="text-textPrimary">{gauge.crossings}×</span> today
            </span>
          )}
        </>
      ) : (
        <span className="font-mono text-[11px] text-textSecondary">
          No gamma flip — the book holds one sign across every strike. Dealer hedging leans one way at every level.
        </span>
      )}
    </div>
  );
};

export default FlipGaugeStrip;
