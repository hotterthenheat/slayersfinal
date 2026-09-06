import { useMemo } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import { REGIME_WORDS, buildFlipGauge } from '../../data/flipGauge';
import { FLIP_KIND_NOTES, pickWalls } from '../../core/walls';
import { fmtDistance, impliedDaySigma, sessionAtr, type DistanceScales } from '../../data/atr';
import { useDistanceUnit } from '../../data/distanceUnits';
import AnimatedNumber from '../ui/AnimatedNumber';
import DistanceUnitPicker from '../ui/DistanceUnitPicker';
import TickerSearch from '../ui/TickerSearch';
import Term from '../ui/Term';
import { TYPE } from './Desk';
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

  const gauge = useMemo(() => (marketData ? buildFlipGauge(marketData) : null), [marketData]);
  const walls = useMemo(() => (marketData ? pickWalls(marketData.chain, marketData.spot, n => n.netGex) : null), [marketData]);
  const scales = useMemo<DistanceScales>(() => {
    if (!marketData) return { atr: null, sigma: null };
    return {
      atr: sessionAtr(Simulator.getCandles(marketData.ticker) ?? []),
      sigma: impliedDaySigma(marketData.spot, Simulator.TICKERS[marketData.ticker]?.iv ?? 0),
    };
  }, [marketData]);

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
    </div>
  );
};

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
