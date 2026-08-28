import { useMemo, useState } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildGreekSurface, surfaceWords, GREEK_LENSES, LENS_META, type GreekLens } from '../../data/greekSurfaces';
import { fmtUsd } from '../../data/gex';
import { CALL_SIDE, LONG_GAMMA, PUT_SIDE, SHORT_GAMMA, SPOT } from '../../components/gex/palette';
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

  TWO INK PAIRS, AND THEY MEAN DIFFERENT THINGS. The Calls and Puts columns
  are a SIDE read, so they wear the desk's side pair — steel for calls, gold
  for puts, exactly as the strike ladder and the glossary already promise.
  The Net bar is a SIGNED read, so it wears the regime pair — red amplifies,
  green absorbs.

  The first cut of this page used the regime pair for all three, which drew
  the Calls column in red and the Puts column in green: two columns that are
  never a regime, coloured as though they were. The screenshots caught it,
  and the side pair now lives in palette.ts so the next surface reaches for
  the right one rather than the nearest one.
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
  /* The window a reader can actually use — the strikes nearest spot, which
     is where every one of these greeks is largest anyway. */
  const rows = [...surface.rows]
    .sort((a, b) => Math.abs(a.strike - (marketData?.spot ?? 0)) - Math.abs(b.strike - (marketData?.spot ?? 0)))
    .slice(0, 21)
    .sort((a, b) => b.strike - a.strike);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        <SegmentedControl
          ariaLabel="Greek lens"
          options={GREEK_LENSES.map(l => ({ value: l, label: LENS_META[l].label }))}
          value={lens}
          onChange={v => setLens(v as GreekLens)}
        />
        <ProvenanceChip sources={['chain', 'carry']} />
        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-textMuted">
          spot <span style={{ color: SPOT }}>{marketData?.spot.toFixed(2)}</span>
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <p className="font-mono text-[11px] leading-relaxed text-textSecondary">{meta.question}</p>
        <p className="font-mono text-[12px] leading-relaxed text-textPrimary">{surfaceWords(surface)}</p>
      </div>

      <div className="border border-borderSubtle bg-panel rounded-md overflow-x-auto">
        <table className="w-full border-collapse">
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
              const w = surface.maxAbs > 0 ? (Math.abs(r.net) / surface.maxAbs) * 100 : 0;
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
                    <div className="h-1.5 rounded-sm" style={{ width: `${w}%`, background: r.net >= 0 ? SHORT_GAMMA : LONG_GAMMA }} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-[9px] leading-relaxed text-textMuted">
        Dealer-signed on the same convention as every other exposure here. Steel is the call side and gold the put
        side; the net bar is red where the book amplifies and green where it absorbs. Vol lenses read per vol
        point, clock lenses per trading day — the unit is in the column heading because these are not figures to
        read in the wrong one.
      </p>
    </div>
  );
};

export default GreekSurfaces;
