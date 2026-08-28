import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMarketData } from '../../context/MarketDataContext';
import { buildGreekSurface, surfaceWords, GREEK_LENSES, LENS_META, type GreekLens } from '../../data/greekSurfaces';
import { fmtUsd } from '../../data/gex';
import { heatMagnitude, heatPoles, heatRgb } from '../../components/gex/heatmap';
import { CALL_SIDE, PUT_SIDE, SPOT } from '../../components/gex/palette';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import SegmentedControl from '../../components/ui/SegmentedControl';
import SpotRule from '../../components/ui/SpotRule';
import Simulator from '../../core/simulator';

/*
==================================================
  SLAYER TERMINAL - HIGHER-GREEK SURFACES
  (pages/pinpoint/GreekSurfaces.tsx) — P-12/13/14
==================================================

  ONE PAGE, FIVE LENSES. Color, vomma, speed, veta and zomma are the same
  book read through different derivatives, so they share a page the way
  GEX/DEX/VEX share the positioning map. Five tabs would have made five
  unrelated-looking products out of one idea.

  THE LENS CARRIES ITS UNIT AND ITS QUESTION, always on screen. These are
  greeks most readers have never traded against, and a column of large
  numbers with no unit is worse than no column: the question line is what
  makes the surface usable by someone who does not already know what vomma
  is, and the unit is what stops them reading a per-day figure as a
  per-year one.

  THE PROFILE IS MIRRORED AROUND ZERO — the shape competitors' exposure
  profiles get right and a left-anchored bar cannot: with every bar
  growing from the left edge, "which SIDE is this strike on" is a colour
  question; grown from a centre axis it is the SILHOUETTE, and the flip is
  where the shape crosses the spine. Right into gold where the book
  amplifies, left into steel where it absorbs — LENGTH from heatMagnitude,
  colour from heatRgb, because sizing linearly while the book is
  heavy-tailed gives rows visibly hot and visibly empty at once.

  THE INKS, learned the hard way over two rounds. The Calls and Puts
  columns are a SIDE read — steel for calls, gold for puts, as the strike
  ladder and the glossary promise. The bar is dealer exposure by strike,
  which on this desk has exactly one rendering: the house heat from
  heatmap.ts. Round one drew all three columns in regime red/green; round
  two kept the bar on the regime pair and even asserted it in the sweep.
  Both rounds invented ink instead of deriving it from the component that
  owns the meaning.
*/

const GreekSurfaces = () => {
  const { marketData } = useMarketData();
  const [lens, setLens] = useState<GreekLens>('color');
  const navigate = useNavigate();

  const iv = marketData ? (Simulator.TICKERS[marketData.ticker]?.iv ?? 0.2) : 0.2;
  const surface = useMemo(
    () => (marketData ? buildGreekSurface(marketData.chain, marketData.spot, iv, lens) : null),
    [marketData, iv, lens]
  );

  if (!surface || surface.rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 font-mono text-[11px] uppercase tracking-widest text-textMuted">
        Awaiting the book…
      </div>
    );
  }

  const meta = LENS_META[lens];
  /* The whole book's heaviest strike — the one-line answer a reader scans
     for before any table. */
  const heaviest = surface.rows.reduce<(typeof surface.rows)[number] | null>(
    (best, r) => (best === null || Math.abs(r.net) > Math.abs(best.net) ? r : best),
    null
  );
  /* The window a reader can actually use — the strikes nearest spot, which
     is where every one of these greeks is largest anyway. */
  const rows = [...surface.rows]
    .sort((a, b) => Math.abs(a.strike - (marketData?.spot ?? 0)) - Math.abs(b.strike - (marketData?.spot ?? 0)))
    .slice(0, 21)
    .sort((a, b) => b.strike - a.strike);
  const spot = marketData?.spot ?? 0;
  /* The matrix idiom: spot rules BETWEEN the rows it sits between. */
  const spotAfter = rows.findIndex((r, i) => r.strike >= spot && (rows[i + 1]?.strike ?? -Infinity) < spot);

  return (
    <div className="flex flex-col gap-3 flex-grow min-h-0">
      <div className="flex items-center gap-3 flex-wrap">
        <SegmentedControl
          ariaLabel="Greek lens"
          options={GREEK_LENSES.map(l => ({ value: l, label: LENS_META[l].label }))}
          value={lens}
          onChange={v => setLens(v as GreekLens)}
        />
        <ProvenanceChip sources={['chain', 'carry']} />
        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-textMuted">
          <span style={{ color: heatPoles.pos }}>gold amplifies</span> · <span style={{ color: heatPoles.neg }}>steel absorbs</span> · spot{' '}
          <span style={{ color: SPOT }}>{marketData?.spot.toFixed(2)}</span>
        </span>
      </div>

      <div className="flex-1 flex flex-col xl:flex-row gap-4 min-h-0">
      <div className="xl:order-2 xl:w-[340px] shrink-0 self-start border border-borderSubtle bg-panel rounded-md p-3 flex flex-col gap-2">
        <p className="font-mono text-[11px] leading-relaxed text-textSecondary">{meta.question}</p>
        <p className="font-mono text-[12px] leading-relaxed text-textPrimary">{surfaceWords(surface)}</p>
        {heaviest && (
          <p className="font-mono text-[10px] leading-relaxed text-textMuted">
            Concentration: strike <span className="tnum text-textSecondary">{heaviest.strike}</span> carries the
            heaviest {meta.label.toLowerCase()} exposure on the book — {fmtUsd(heaviest.net)}.
          </p>
        )}
      </div>

      <div className="border border-borderSubtle bg-panel rounded-md overflow-auto flex-1 min-h-0 xl:order-1">
        <table className="w-full h-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#0c0c0c]">
              {['Strike', `Calls (${meta.unit})`, '← absorbs · amplifies →', `Puts (${meta.unit})`, 'Net'].map((h, i) => (
                <th
                  key={h}
                  className={`px-2 py-1.5 font-mono text-[9px] uppercase tracking-wider text-textMuted border-b border-borderSubtle ${
                    i === 0 ? 'w-px text-left whitespace-nowrap' : i === 2 ? 'text-center font-normal normal-case' : 'text-right'
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              /* Colour off the house ramp, LENGTH off its magnitude curve —
                 half the track is the bar's whole range, since it grows
                 from the centre spine. */
              const [hr, hg, hb] = heatRgb(r.net, surface.maxAbs);
              const half = heatMagnitude(r.net, surface.maxAbs) * 50;
              return (
                <Fragment key={r.strike}>
                  <tr
                    onClick={() => navigate('/pulse', { state: { focusPrice: r.strike } })}
                    title="Flash on chart"
                    className="cursor-pointer hover:bg-white/[0.02] transition-colors border-b border-borderSubtle/40 last:border-0"
                  >
                    <td className="w-px px-2 py-1 font-mono text-[10px] font-semibold tnum text-textPrimary whitespace-nowrap">
                      {r.strike}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-[10px] tnum" style={{ color: CALL_SIDE }}>
                      {fmtUsd(r.call)}
                    </td>
                    <td className="px-2 py-1 w-[34%]">
                      <div className="relative h-[9px] w-full rounded-sm bg-white/[0.03]">
                        {/* The spine — the zero every bar grows away from. */}
                        <span className="absolute left-1/2 -top-0.5 -bottom-0.5 w-px bg-white/20" />
                        <span
                          data-bar
                          className="absolute top-[1.5px] bottom-[1.5px] rounded-sm"
                          style={{
                            background: `rgb(${hr},${hg},${hb})`,
                            width: `${half}%`,
                            ...(r.net >= 0 ? { left: '50%' } : { right: '50%' }),
                          }}
                        />
                      </div>
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-[10px] tnum" style={{ color: PUT_SIDE }}>
                      {fmtUsd(r.put)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-[10px] font-semibold tnum text-textPrimary">
                      {fmtUsd(r.net)}
                    </td>
                  </tr>
                  {i === spotAfter && marketData && (
                    <tr>
                      <td colSpan={5} className="px-2 py-1">
                        <SpotRule ticker={marketData.ticker} price={spot} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      </div>

      <p className="font-mono text-[9px] leading-relaxed text-textMuted">
        Dealer-signed on the same convention as every other exposure here. Steel is the call side and gold the
        put side; the profile grows from the zero spine in the house heat — right into gold where the book
        amplifies, left into steel where it absorbs, on the same ramp and the same magnitude curve as the
        pressure matrix. Vol lenses read per vol point, clock lenses per trading day — the unit is in the
        column heading because these are not figures to read in the wrong one. Click a strike to flash it on
        the chart.
      </p>
    </div>
  );
};

export default GreekSurfaces;
