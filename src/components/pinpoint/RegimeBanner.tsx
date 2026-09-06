import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMarketData } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import { REGIME_WORDS, buildFlipGauge } from '../../data/flipGauge';
import { IV_RANK_UNAVAILABLE, VERDICT_WORDS, buildVolRegime } from '../../data/volRegime';
import { FLIP_KIND_NOTES, pickWalls } from '../../core/walls';
import { fmtDistance, impliedDaySigma, sessionAtr, type DistanceScales } from '../../data/atr';
import { useDistanceUnit } from '../../data/distanceUnits';
import AnimatedNumber from '../ui/AnimatedNumber';
import DistanceUnitPicker from '../ui/DistanceUnitPicker';
import TickerSearch from '../ui/TickerSearch';
import Term from '../ui/Term';
import { TYPE } from './Desk';
import { useScanSnapshot } from './useScanSnapshot';
import { CALL_WALL, FLIP, INK, PUT_WALL, fmtStrike, regimeInk } from './ink';

/*
==================================================
  SLAYER TERMINAL - THE MASTHEAD (components/pinpoint/RegimeBanner.tsx)
  The line every Pinpoint desk opens with.
==================================================

  The read a trader wants before any chart: which side of the flip spot is
  on, so which regime they are trading, and where the two walls are.

  ── THE WASH CAME OFF (2026-09-06) ────────────────────────────────────────

  The first version drew this as a bordered card with a horizontal gradient
  in the regime's colour bleeding across it. The gradient carried no
  information the word REGIME did not already carry, and a coloured panel
  at the top of every desk sets the whole page's temperature for a fact
  that changes twice a month.

  It is a masthead now: one line, one rule under it, no fill. The regime is
  the largest words on the page because it is the most important fact on
  the page — that is the whole emphasis budget, spent once. Everything else
  on the line is a label and a number at the same weight as the desk below,
  so the eye moves from the regime to the levels to the desk in that order
  and nothing competes.

  Rebuilt every tick, deliberately: it is a proximity read and must be
  current. One pickFlip and one pickWalls over the chain, well under a
  millisecond; the desks below scan-tier their heavy work.
*/

const RegimeBanner = () => {
  const { marketData, activeTicker, changeTicker } = useMarketData();
  const unit = useDistanceUnit();
  /*
    ONE CLOCK FOR THE LEVELS, ANOTHER FOR THE PRICE — and that is the fix,
    not a compromise.

    This masthead read the LIVE tick while every desk under it reads the
    ten-second scan, so the two disagreed on screen: the bar said the call
    wall was 501 while the surface under it marked 500, and the bar said
    spot 500.03 while the grid's own marker said 499.96. Two numbers for one
    fact, six inches apart, with nothing to tell a reader which to believe.

    A wall is STRUCTURE: it belongs to the book, it moves when the book
    moves, and it has to be the same wall the desk below is drawing or the
    section is lying about itself. So the levels come off the scan snapshot,
    shared with every desk.

    The DISTANCE to that wall is a price question and stays live — which is
    the read this bar exists for. The wall stops hopping; how far you are
    from it still ticks.
  */
  const { snapshot: scan } = useScanSnapshot();
  const gauge = useMemo(() => (scan ? buildFlipGauge(scan) : null), [scan]);
  const walls = useMemo(() => (scan ? pickWalls(scan.chain, scan.spot, n => n.netGex) : null), [scan]);
  const scales = useMemo<DistanceScales>(() => {
    if (!marketData) return { atr: null, sigma: null };
    return {
      atr: sessionAtr(Simulator.getCandles(marketData.ticker) ?? []),
      sigma: impliedDaySigma(marketData.spot, Simulator.TICKERS[marketData.ticker]?.iv ?? 0),
    };
  }, [marketData]);

  /*
    VOLATILITY IS A CONDITION, NOT A DESTINATION.

    It used to be the ninth tab: a reader who wanted to know whether implied
    was rich before reading a gamma wall had to leave the wall to find out.
    That is the wrong shape — vol is the weather every desk in this section
    is read under, so it rides on the masthead and the page it used to be is
    the door at the end of the line, for the surface and the term structure.

    Memoised on the ticker: this walks the roster to place the name against
    its peers, which is scan-tier work and must not run on every tick like
    the flip read above it.
  */
  const vol = useMemo(() => {
    const rows = buildVolRegime(activeTicker, 30);
    return rows.find(r => r.ticker === activeTicker) ?? null;
  }, [activeTicker]);

  const regime = gauge?.regime ?? null;
  const ink = regimeInk(regime);
  const words = regime ? REGIME_WORDS[regime] : null;
  /* The chosen ruler leads; percent rides second as the cross-check a reader
     on ATR still wants. When the ruler IS percent, dollars ride second. */
  const dist = (price: number | null) => {
    if (price === null || !marketData) return '';
    const lead = fmtDistance(price - marketData.spot, marketData.spot, unit, scales);
    const second = unit === '%' ? fmtDistance(price - marketData.spot, marketData.spot, '$', scales) : fmtDistance(price - marketData.spot, marketData.spot, '%', scales);
    return `${lead} (${second.replace(/^[+−]/, '')})`;
  };
  const flipOn = gauge !== null && gauge.flip !== null && gauge.kind !== 'no-crossing';

  const aria = marketData
    ? `${marketData.ticker} ${fmtStrike(marketData.spot)}. ${words ? `${words.label} — ${words.blurb}.` : 'No gamma flip on this book.'}` +
      (gauge?.flip !== null && gauge ? ` Flip ${fmtStrike(gauge.flip)}, ${dist(gauge.flip)} away.` : '') +
      (walls?.callWall != null ? ` Call wall ${fmtStrike(walls.callWall)}, ${dist(walls.callWall)}.` : '') +
      (walls?.putWall != null ? ` Put wall ${fmtStrike(walls.putWall)}, ${dist(walls.putWall)}.` : '') +
      (gauge?.crossings !== null && gauge ? ` Crossed ${gauge.crossings} times today.` : '')
    : 'Waiting for the first tick';

  return (
    <div role="status" aria-label={aria} data-regime={regime ?? 'none'} className="flex items-end gap-x-10 gap-y-4 flex-wrap border-b border-borderMuted pb-3">
      {/* who, and where it is */}
      <div className="flex items-center gap-3">
        <TickerSearch value={activeTicker} onChange={changeTicker} />
        {marketData && (
          <span className={`${TYPE.lead} text-textPrimary`}>
            <AnimatedNumber value={marketData.spot} format={v => fmtStrike(Number(v.toFixed(2)))} flash />
          </span>
        )}
      </div>

      {/* THE fact — the only place on a Pinpoint desk that spends this much size */}
      <div className="flex flex-col gap-1 min-w-0">
        <span className={`${TYPE.lead} uppercase tracking-[0.06em]`} style={{ color: ink }}>
          {words ? words.label : 'NO FLIP'}
        </span>
        <span className={`${TYPE.body} text-textMuted`}>
          {words ? words.blurb : 'the book does not change sign — no regime border to stand on'}
        </span>
      </div>

      {/* the levels, as a row of label/value pairs at the desk's own weight */}
      <div className="ml-auto flex items-end gap-x-8 gap-y-3 flex-wrap">
        {gauge && gauge.flip !== null && (
          <Level ink={FLIP} label={flipOn ? 'Flip' : '≈ zero'} price={gauge.flip} dist={dist(gauge.flip)} term="Gamma flip" note={FLIP_KIND_NOTES[gauge.kind]} kind={gauge.kind} />
        )}
        {walls?.callWall != null && <Level ink={CALL_WALL} label="Call wall" price={walls.callWall} dist={dist(walls.callWall)} term="Call wall" />}
        {walls?.putWall != null && <Level ink={PUT_WALL} label="Put wall" price={walls.putWall} dist={dist(walls.putWall)} term="Put wall" />}
        {gauge && (
          <div className="flex flex-col gap-1">
            <span className={`${TYPE.label} text-textMuted`}>Crossed today</span>
            <span className="font-mono text-[13px] leading-none tnum font-semibold text-textPrimary">
              {gauge.crossings === null ? <span className="text-textMuted font-normal">too early</span> : `${gauge.crossings}×`}
            </span>
          </div>
        )}
        <DistanceUnitPicker dense />
      </div>

      {/*
        THE CONTEXT LINE. Quieter than everything above it on purpose: these
        are the conditions, not the read. Every figure here says what it is
        and what it is not — the percentile is explicitly NOT an IV rank,
        because this desk has no implied history to rank against and a number
        called "IV Rank 62" that is actually a cross-sectional percentile is
        the kind of false precision that costs a terminal its credibility.
      */}
      {vol && (
        <div className="w-full flex items-center gap-x-7 gap-y-2 flex-wrap pt-2.5 border-t border-borderSubtle/70">
          <ContextFact label="ATM IV" value={`${(vol.iv * 100).toFixed(2)}`} unit="vol points" />
          <ContextFact
            label="Vs realized"
            value={vol.premium === null ? '—' : `${vol.premium >= 0 ? '+' : '−'}${Math.abs(vol.premium * 100).toFixed(2)}`}
            unit="implied − 20-session realized"
            title={vol.premium === null ? 'Not enough closes to realize a volatility over 20 sessions.' : undefined}
          />
          <ContextFact
            label="Among the roster"
            value={`${Math.round(vol.crossSectionalIvPct)}`}
            unit="percentile, today"
            title={IV_RANK_UNAVAILABLE}
          />
          <ContextFact label="25Δ skew" value={`${vol.rr >= 0 ? '+' : '−'}${Math.abs(vol.rr).toFixed(2)}`} unit="put IV − call IV" />
          <ContextFact label="Vol read" value={VERDICT_WORDS[vol.verdict].label} unit={VERDICT_WORDS[vol.verdict].note} />
          <Link
            to="/pinpoint/vol"
            className={`ml-auto ${TYPE.label} text-textMuted hover:text-textPrimary transition-colors underline decoration-dotted underline-offset-4`}
          >
            The surface, the term structure →
          </Link>
        </div>
      )}
    </div>
  );
};

/** One condition on the context line. Label over value, at the desk's weight. */
const ContextFact = ({ label, value, unit, title }: { label: string; value: string; unit: string; title?: string }) => (
  <div className="flex flex-col gap-0.5 min-w-0" title={title}>
    <span className={`${TYPE.label} text-textMuted whitespace-nowrap`}>{label}</span>
    <span className="flex items-baseline gap-1.5 min-w-0">
      <span className="font-mono text-[13px] leading-none tnum font-semibold text-textPrimary">{value}</span>
      <span className={`${TYPE.body} text-textMuted truncate`}>{unit}</span>
    </span>
  </div>
);

const Level = ({ ink, label, price, dist, term, note, kind }: { ink: string; label: string; price: number; dist: string; term: 'Gamma flip' | 'Call wall' | 'Put wall'; note?: string; kind?: string }) => (
  <div className="flex flex-col gap-1" title={note} data-level={term} data-flip-kind={kind}>
    <Term k={term}>
      <span className={TYPE.label} style={{ color: ink }}>
        {label}
      </span>
    </Term>
    <span className="font-mono text-[13px] leading-none tnum font-semibold" style={{ color: ink }}>
      {fmtStrike(price)} <span className="font-normal" style={{ color: INK.muted }}>{dist}</span>
    </span>
  </div>
);

export default RegimeBanner;
