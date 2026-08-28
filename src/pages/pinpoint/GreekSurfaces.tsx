import { useMemo, useState } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildGreekSurface, surfaceWords, GREEK_LENSES, LENS_META, type GreekLens } from '../../data/greekSurfaces';
import { fmtUsd } from '../../data/gex';
import { heatMagnitude, heatPoles, heatRgb } from '../../components/gex/heatmap';
import { CALL_SIDE, PUT_SIDE, SPOT } from '../../components/gex/palette';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import SegmentedControl from '../../components/ui/SegmentedControl';
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

  THE INKS, learned the hard way over two rounds. The Calls and Puts columns
  are a SIDE read — steel for calls, gold for puts, as the strike ladder and
  the glossary promise. The NET bar is dealer exposure by strike, which on
  this desk has exactly one rendering: the house heat from heatmap.ts —
  colour from heatRgb, LENGTH from heatMagnitude, because sizing a bar
  linearly while the book is heavy-tailed gives rows that are visibly hot
  and visibly empty at once (PaneLadder's comment says why, and it was
  measured). Round one drew all three columns in regime red/green; round two
  kept the bar on the regime pair and even asserted it in the sweep. Both
  rounds invented ink instead of deriving it from the component that owns
  the meaning.
*/

const GreekSurfaces = () => {
  const { marketData } = useMarketData();
  const [lens, setLens] = useState<GreekLens>('color');

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
          <thead>
            <tr>
              {['Strike', `Calls (${meta.unit})`, `Puts (${meta.unit})`, 'Net', ''].map(h => (
                <th
                  key={h}
                  className="px-2 py-1.5 text-right first:text-left font-mono text-[9px] uppercase tracking-wider text-textMuted"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              /* Colour AND length off the house ramp — see the header. */
              const [hr, hg, hb] = heatRgb(r.net, surface.maxAbs);
              const w = heatMagnitude(r.net, surface.maxAbs) * 100;
              return (
                <tr key={r.strike}>
                  <td className="px-2 py-1 font-mono text-[10px] tnum text-textPrimary">{r.strike}</td>
                  <td className="px-2 py-1 text-right font-mono text-[10px] tnum" style={{ color: CALL_SIDE }}>
                    {fmtUsd(r.call)}
                  </td>
                  <td className="px-2 py-1 text-right font-mono text-[10px] tnum" style={{ color: PUT_SIDE }}>
                    {fmtUsd(r.put)}
                  </td>
                  <td className="px-2 py-1 text-right font-mono text-[10px] font-semibold tnum text-textPrimary">
                    {fmtUsd(r.net)}
                  </td>
                  <td className="px-2 py-1 w-[30%]">
                    <div className="h-1.5 rounded-sm" style={{ width: `${w}%`, background: `rgb(${hr},${hg},${hb})` }} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      </div>

      <p className="font-mono text-[9px] leading-relaxed text-textMuted">
        Dealer-signed on the same convention as every other exposure here. Steel is the call side and gold the
        put side; the net bar is the house heat — gold climbs where the book amplifies, steel where it absorbs,
        on the same ramp and the same magnitude curve as the pressure matrix. Vol lenses read per vol point,
        clock lenses per trading day — the unit is in the column heading because these are not figures to read
        in the wrong one.
      </p>
    </div>
  );
};

export default GreekSurfaces;
