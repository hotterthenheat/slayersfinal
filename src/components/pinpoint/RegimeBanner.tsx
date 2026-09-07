import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMarketData } from '../../context/MarketDataContext';
import { REGIME_WORDS, buildFlipGauge } from '../../data/flipGauge';
import { IV_RANK_UNAVAILABLE, buildVolRegime } from '../../data/volRegime';
import AnimatedNumber from '../ui/AnimatedNumber';
import DistanceUnitPicker from '../ui/DistanceUnitPicker';
import TickerSearch from '../ui/TickerSearch';
import { TYPE } from './Desk';
import { useScanSnapshot } from './useScanSnapshot';
import { fmtStrike, regimeInk } from './ink';

/*
==================================================
  SLAYER TERMINAL - THE CONTEXT STRIP (components/pinpoint/RegimeBanner.tsx)
  The conditions every Pinpoint desk is read under.
==================================================

  Not a masthead. A masthead announces; this states the four or five
  conditions a reader has to hold in their head before any number on the
  desk below means anything: which name, where it is trading, which regime
  that puts them in, and what volatility is doing.

  ── TWO THINGS CAME OFF, IN ORDER ─────────────────────────────────────────

  THE WASH. Version one was a bordered card with a horizontal gradient in
  the regime's colour bleeding across it. The gradient carried nothing the
  word LONG GAMMA did not already carry, and a coloured panel at the top of
  every desk sets the whole page's temperature for a fact that changes
  twice a month.

  THE HEADLINE. Version two dropped the fill but kept a 28px regime with
  the flip and both walls beside it, on all nine desks. Both halves of that
  were wrong, and Noah named both: "long gamma on the top in a awkward
  size", and the walls "everywhere".

    · THE SIZE. Measured on the built pages, the largest type anywhere on
      Trace is 14px and on Terrain 13px, and both are dominated by 10 and
      11. This bar printed at twice the biggest thing on either desk a
      reader moves between. A workstation has no headline — the DATA is
      the largest thing on the screen and everything else is a label
      pointing at it — so the regime is a tag now, at the desk's own size,
      coloured because direction is one of the few jobs colour has here.

    · THE WALLS. A call wall and a put wall are the SUBJECT of the Levels
      desk. Repeating them above the Exposure surface, the Flow tape and
      the Audit table meant a reader saw the same two numbers nine times
      and read them nowhere — and on the surface they were drawn twice on
      one screen, once here and again on the grid's own rows. They live on
      Levels, and this strip links there.

  ── THE CLOCKS ────────────────────────────────────────────────────────────

  Spot is LIVE, because a price a reader is watching should tick. The
  regime comes off the ten-second scan snapshot every desk below shares,
  because a regime that disagreed with the surface under it — the bar
  saying long gamma while the grid drew a book that had already flipped —
  is the section lying about itself. Vol is memoised on the ticker: it
  walks the roster to place the name against its peers, which is scan-tier
  work and must not run on every tick.
*/

const RegimeBanner = () => {
  const { marketData, activeTicker, changeTicker } = useMarketData();
  const { snapshot: scan } = useScanSnapshot();
  const gauge = useMemo(() => (scan ? buildFlipGauge(scan) : null), [scan]);
  /*
    VOLATILITY IS A CONDITION, NOT A DESTINATION.

    It used to be a tab of its own: a reader who wanted to know whether
    implied was rich before reading a gamma wall had to leave the wall to
    find out. That is the wrong shape — vol is the weather every desk in
    this section is read under, so it rides here and the page it used to be
    is the door at the end of the line, for the surface and the term
    structure.
  */
  const vol = useMemo(() => {
    const rows = buildVolRegime(activeTicker, 30);
    return rows.find(r => r.ticker === activeTicker) ?? null;
  }, [activeTicker]);

  const regime = gauge?.regime ?? null;
  const ink = regimeInk(regime);
  const words = regime ? REGIME_WORDS[regime] : null;

  /* The accessible name says exactly what the strip draws and nothing more.
     It used to recite the flip and both walls; when those moved to Levels
     the sentence kept reading them out, which is a screen reader describing
     a bar that is no longer there. */
  const aria = marketData
    ? `${marketData.ticker} ${fmtStrike(marketData.spot)}. ` +
      (words ? `${words.label} — ${words.blurb}.` : 'No gamma flip on this book — no regime border to stand on.') +
      (vol ? ` ATM implied ${(vol.iv * 100).toFixed(2)} vol points` : '') +
      (vol && vol.premium !== null ? `, ${Math.abs(vol.premium * 100).toFixed(2)} ${vol.premium >= 0 ? 'over' : 'under'} 20-session realized` : '') +
      (vol ? `. ${Math.round(vol.crossSectionalIvPct)}th percentile across today's roster.` : '')
    : 'Waiting for the first tick';

  return (
    /*
      A FACT STRIP, NOT A MASTHEAD.

      This drew the regime at 28px with the flip, the call wall and the put
      wall beside it, on all nine desks. Two things were wrong with that and
      Noah named both: "long gamma on the top in a awkward size", and the
      walls "everywhere".

      THE SIZE. Measured on the built pages, the largest type on Trace is
      14px and on Terrain 13px. This bar was printing at twice that. A
      workstation has no headline — the data is the largest thing on the
      screen and the chrome points at it — so the regime is a tag now, at
      the same size as everything else, coloured because direction is one of
      the few jobs colour has here.

      THE WALLS. A call wall and a put wall are the SUBJECT of the Levels
      desk. Repeating them above the Exposure surface, the Flow tape and the
      Audit table meant the reader saw the same two numbers nine times and
      read them nowhere — and on the surface they were drawn twice on one
      screen, in the bar and again on the grid's own rows. They live on
      Levels now, which is the desk that answers for them.

      What stays is what every desk genuinely reads under: which name, where
      it is, which side of the flip that puts it on, and the volatility
      conditions. One line, everything at 10-11px.
    */
    <div
      role="status"
      aria-label={aria}
      data-regime={regime ?? 'none'}
      className="flex items-center gap-x-6 gap-y-2 flex-wrap border-b border-borderMuted pb-2.5"
    >
      <TickerSearch value={activeTicker} onChange={changeTicker} />
      {marketData && (
        <span className="font-mono text-[13px] leading-none tnum font-semibold text-textPrimary">
          <AnimatedNumber value={marketData.spot} format={v => fmtStrike(Number(v.toFixed(2)))} flash />
        </span>
      )}

      {/* The regime, as a tag. Colour carries it; size does not. */}
      <span className="inline-flex items-baseline gap-2 min-w-0" title={words?.blurb}>
        <span className={`${TYPE.label} font-bold whitespace-nowrap`} style={{ color: ink }}>
          {words ? words.label : 'NO FLIP'}
        </span>
        <span className={`${TYPE.body} text-textMuted truncate`}>
          {words ? words.blurb : 'the book does not change sign — no regime border to stand on'}
        </span>
      </span>

      {vol && (
        <>
          <ContextFact label="ATM IV" value={`${(vol.iv * 100).toFixed(2)}`} unit="vol pts" />
          <ContextFact
            label="Vs realized"
            value={vol.premium === null ? '—' : `${vol.premium >= 0 ? '+' : '−'}${Math.abs(vol.premium * 100).toFixed(2)}`}
            unit="over 20-session"
            title={vol.premium === null ? 'Not enough closes to realize a volatility over 20 sessions.' : undefined}
          />
          <ContextFact label="Roster" value={`${Math.round(vol.crossSectionalIvPct)}`} unit="percentile today" title={IV_RANK_UNAVAILABLE} />
          <ContextFact label="25Δ skew" value={`${vol.rr >= 0 ? '+' : '−'}${Math.abs(vol.rr).toFixed(2)}`} unit="put − call" />
        </>
      )}

      <span className="ml-auto flex items-center gap-4">
        <Link
          to="/pinpoint/levels"
          className={`${TYPE.label} text-textMuted hover:text-textPrimary transition-colors whitespace-nowrap`}
          title="The walls, the flip and what they are worth — the desk that answers for them"
        >
          Levels →
        </Link>
        <Link
          to="/pinpoint/vol"
          className={`${TYPE.label} text-textMuted hover:text-textPrimary transition-colors whitespace-nowrap`}
          title="The surface, the term structure, and the regime over time"
        >
          Vol →
        </Link>
        <DistanceUnitPicker dense />
      </span>
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

export default RegimeBanner;
