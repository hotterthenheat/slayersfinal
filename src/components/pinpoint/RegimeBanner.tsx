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
import { CALL_WALL, FLIP, PUT_WALL, REGIME_WASH, fmtStrike, regimeInk } from './ink';

/*
==================================================
  SLAYER TERMINAL - THE REGIME BANNER (components/pinpoint/RegimeBanner.tsx)
  The one line every Pinpoint desk opens with.
==================================================

  SpotGamma's Key Levels, MenthorQ's ranked levels, every Discord bot's
  "SPY 500 · flip 498 · call wall 505 · put wall 495" — the read a trader
  wants BEFORE any chart is: where is spot against the flip, so which
  regime am I in, and where are the two walls. The old shell carried this
  as a grey strip under a grey card and it read as furniture. This is the
  headline: the card is washed in the regime's own colour, the regime is
  the largest words on it, and the three levels sit beside it with their
  distances in the reader's chosen ruler.

  Rebuilt every tick, deliberately — it is a proximity read and must be
  current; the build is one pickFlip and one pickWalls over the chain,
  well under a millisecond. The desks below scan-tier their heavy work.
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
  /* The chosen ruler leads; percent rides second as the constant cross-check
     (a reader on ATR still wants to know it is 0.4%). When the ruler IS
     percent, dollars ride second. */
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
    <div
      role="status"
      aria-label={aria}
      data-regime={regime ?? 'none'}
      className="relative overflow-hidden rounded-lg border border-borderSubtle bg-panel"
      style={{ boxShadow: `inset 3px 0 0 0 ${ink}` }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ background: REGIME_WASH[regime ?? 'NONE'] }} aria-hidden />
      <div className="relative flex items-center gap-x-5 gap-y-2 flex-wrap px-4 py-2.5">
        {/* who */}
        <div className="flex items-center gap-3">
          <TickerSearch value={activeTicker} onChange={changeTicker} />
          {marketData && (
            <span className="font-mono text-[18px] font-bold tnum text-textPrimary leading-none">
              <AnimatedNumber value={marketData.spot} format={v => fmtStrike(Number(v.toFixed(2)))} flash />
            </span>
          )}
        </div>

        {/* the regime — the largest words on the card */}
        <div className="flex flex-col min-w-0">
          <span className="font-mono text-[15px] font-black uppercase tracking-[0.14em] leading-none" style={{ color: ink }}>
            {words ? words.label : 'NO FLIP'}
          </span>
          <span className="mt-1 text-[11px] text-textSecondary leading-snug">
            {words ? words.blurb : 'the book does not change sign — no regime border to stand on'}
          </span>
        </div>

        {/* the three levels with distances */}
        <div className="ml-auto flex items-center gap-x-5 gap-y-1 flex-wrap">
          {gauge && gauge.flip !== null && (
            <Level ink={FLIP} label={flipOn ? 'Flip' : '≈ zero'} price={gauge.flip} dist={dist(gauge.flip)} term="Gamma flip" note={FLIP_KIND_NOTES[gauge.kind]} kind={gauge.kind} />
          )}
          {walls?.callWall != null && <Level ink={CALL_WALL} label="Call wall" price={walls.callWall} dist={dist(walls.callWall)} term="Call wall" />}
          {walls?.putWall != null && <Level ink={PUT_WALL} label="Put wall" price={walls.putWall} dist={dist(walls.putWall)} term="Put wall" />}
          {gauge && (
            <div className="flex flex-col">
              <span className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Crossed today</span>
              <span className="font-mono text-[13px] font-bold tnum text-textPrimary leading-tight">
                {gauge.crossings === null ? <span className="text-textMuted font-medium">too early</span> : `${gauge.crossings}×`}
              </span>
            </div>
          )}
          <DistanceUnitPicker dense />
        </div>
      </div>
    </div>
  );
};

const Level = ({ ink, label, price, dist, term, note, kind }: { ink: string; label: string; price: number; dist: string; term: 'Gamma flip' | 'Call wall' | 'Put wall'; note?: string; kind?: string }) => (
  <div className="flex flex-col" title={note} data-level={term} data-flip-kind={kind}>
    <Term k={term}>
      <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: ink }}>
        {label}
      </span>
    </Term>
    <span className="font-mono text-[13px] font-bold tnum leading-tight" style={{ color: ink }}>
      {fmtStrike(price)} <span className="text-[10px] font-medium text-textSecondary">{dist}</span>
    </span>
  </div>
);

export default RegimeBanner;
