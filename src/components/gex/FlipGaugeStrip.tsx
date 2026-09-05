import { useMemo } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import { REGIME_WORDS, buildFlipGauge } from '../../data/flipGauge';
import { FLIP_KIND_NOTES } from '../../core/walls';
import { fmtDistance, impliedDaySigma, sessionAtr, type DistanceScales } from '../../data/atr';
import { useDistanceUnit } from '../../data/distanceUnits';
import { FLIP, LONG_GAMMA, SHORT_GAMMA } from './palette';
import Term from '../ui/Term';
import DistanceUnitPicker from '../ui/DistanceUnitPicker';

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

  DISTANCE IN THE DESK'S CHOSEN UNIT, leading, with percent as the constant
  second read (or dollars, when percent IS the choice) — T-19. The lead slot
  is the reader's ruler ($ · % · ATR · σ, one store for the whole desk); the
  second stays fixed so two surfaces can always be cross-checked at a
  glance. An ATR or σ the engine cannot measure yet renders as an em-dash,
  never as a number (data/atr.ts).

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
  const unit = useDistanceUnit();
  /* The two rulers, off the same stores every other surface reads. */
  const scales = useMemo<DistanceScales>(() => {
    if (!marketData) return { atr: null, sigma: null };
    return {
      atr: sessionAtr(Simulator.getCandles(marketData.ticker) ?? []),
      sigma: impliedDaySigma(marketData.spot, Simulator.TICKERS[marketData.ticker]?.iv ?? 0),
    };
  }, [marketData]);
  if (!gauge) return null;

  const words = gauge.regime ? REGIME_WORDS[gauge.regime] : null;
  const dist = gauge.distAbs === null ? null : Math.abs(gauge.distAbs);
  const unsigned = (v: string) => v.replace(/^[+−]/, '');
  const lead = dist === null ? '' : unit === '%' ? `${Math.abs(gauge.distPct!).toFixed(2)}%` : unsigned(fmtDistance(dist, gauge.spot, unit, scales));
  const second = dist === null ? '' : unit === '%' ? `$${dist.toFixed(2)}` : `${Math.abs(gauge.distPct!).toFixed(2)}%`;

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-borderSubtle bg-panel rounded-md px-3 py-1.5"
      role="status"
      aria-label={
        words
          ? `${words.label} — ${words.blurb}. Spot ${fmt(gauge.spot)}, flip ${fmt(gauge.flip!)}, ` +
            `${lead} away (${second})` +
            (gauge.kind === 'nearest-of-several' ? `, the nearest of ${gauge.crossings_all.length} sign changes on the book` : '') +
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
            {/* P-5.1 — SILENT UNLESS THERE IS SOMETHING TO SAY.

                Every book on this desk crosses zero exactly once today, so
                this renders nothing. It appears if a book ever carries more
                than one crossing, because then the blue line is the desk's
                PICK (the one nearest spot — a jitter crossing deep in the
                put tail is not a regime border) and the reader deserves to
                know a pick was made. The others are named in the tooltip so
                the qualifier is checkable rather than merely humble. */}
            {gauge.kind === 'nearest-of-several' && (
              <span
                className="ml-1 text-[9px] uppercase tracking-wider text-textMuted normal-case"
                title={`${FLIP_KIND_NOTES['nearest-of-several']}\n\nCrossings on this book: ${gauge.crossings_all.map(c => fmt(c)).join(', ')}.`}
              >
                {' '}nearest of {gauge.crossings_all.length}
              </span>
            )}
          </span>
          <span className="font-mono text-[11px] tnum text-textPrimary">
            {lead} · {second}{' '}
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
        /* No crossing anywhere on the grid. Measured as unreachable across
           all 22 names — the book always crosses — so this is the state the
           checklist asked for, kept because a one-sided book is a real
           market condition even if this simulator does not produce one, and
           the alternative is inheriting spot as a fake flip. */
        <span
          className="font-mono text-[11px] text-textSecondary"
          title={FLIP_KIND_NOTES['no-crossing']}
        >
          No gamma flip — the book holds one sign across every strike. Dealer hedging leans one way at every level.
        </span>
      )}
      <DistanceUnitPicker />
    </div>
  );
};

export default FlipGaugeStrip;
