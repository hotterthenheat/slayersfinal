import { Fragment, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMarketData } from '../../context/MarketDataContext';
import { buildBasisBand, buildStrikeBasis } from '../../data/costBasis';
import BasisDrift from '../../components/gex/BasisDrift';
import { fmtUsd } from '../../data/gex';
import PainMapPanel from '../../components/gex/PainMapPanel';
import { HiddenStrikes } from '../../components/gex/HeatPill';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import SpotRule from '../../components/ui/SpotRule';
import Term from '../../components/ui/Term';
import Simulator from '../../core/simulator';

/*
==================================================
  SLAYER TERMINAL - THE PAIN MAP — P-16
  (pages/pinpoint/PainMap.tsx)
==================================================

  The directive calls this the highest-defensibility screen in the product
  and specifies its geometry: the strike ladder, with cost basis and
  unrealized P&L per row — strikes where holders sit deep underwater glow
  one way, deep in profit the other. It shipped first as a side panel
  carrying only the two bands; this is the screen the spec asked for.

  THE GLOW IS DIRECTION INK — bull green for holders in profit, bear red
  for holders underwater — because money up or down is the one thing
  red/green mean everywhere on this desk. Basis columns are plain figures:
  a price paid has no side and no direction.

  THE BANDS LEAD, because the flip level is the read a visitor came for;
  the ladder under them is where it lives strike by strike. Same engine,
  same tape, same tolerance as the bands — a ladder that disagreed with
  its own headline would be two products in a trench coat.
*/

const DTE_YEARS = 30 / 365;

const PainMap = () => {
  const { marketData, flowTape } = useMarketData();
  const navigate = useNavigate();

  const ladder = useMemo(() => {
    if (!marketData || marketData.chain.length === 0) return null;
    const iv = Simulator.TICKERS[marketData.ticker]?.iv ?? 0.2;
    const step = marketData.chain.length > 1 ? Math.abs(marketData.chain[1].strike - marketData.chain[0].strike) : 1;
    /* The window the profile uses: nearest strikes both sides of spot. */
    const strikes = [...new Set(marketData.chain.map(n => n.strike))]
      .sort((a, b) => Math.abs(a - marketData.spot) - Math.abs(b - marketData.spot))
      .slice(0, 21)
      .sort((a, b) => b - a);
    const rows = strikes.map(strike => {
      const call = buildStrikeBasis(flowTape, strike, 'C', marketData.spot, DTE_YEARS, iv, step / 2);
      const put = buildStrikeBasis(flowTape, strike, 'P', marketData.spot, DTE_YEARS, iv, step / 2);
      const pnl = (call.unrealized ?? 0) + (put.unrealized ?? 0);
      const hasPnl = call.unrealized !== null || put.unrealized !== null;
      return { strike, call, put, pnl: hasPnl ? pnl : null };
    });
    const maxAbsPnl = Math.max(...rows.map(r => Math.abs(r.pnl ?? 0)), 1e-9);
    const spotAfter = rows.findIndex((r, i) => r.strike >= marketData.spot && (rows[i + 1]?.strike ?? -Infinity) < marketData.spot);
    /*
      QUIET RUNS FOLD — the Time Machine's own grammar (HiddenStrikes). On a
      quiet morning most strikes have no aggressive longs at all, and a
      ladder that is four-fifths em-dashes buries the four rows that ARE the
      product. A contiguous run of three or more empty rows becomes one line
      that says the count; runs of one or two stay, because a lone gap reads
      fine and a fold line costs the same height it saves. Runs never cross
      the spot rule — the rows beside spot are the ones a reader locates
      themselves by, whatever they hold.
    */
    const isEmpty = (r: (typeof rows)[number]) => r.pnl === null && r.call.basis === null && r.put.basis === null;
    type RenderItem = { kind: 'row'; row: (typeof rows)[number]; index: number } | { kind: 'fold'; count: number };
    const items: RenderItem[] = [];
    let run: number[] = [];
    const flush = () => {
      if (run.length >= 3) items.push({ kind: 'fold', count: run.length });
      else for (const idx of run) items.push({ kind: 'row', row: rows[idx], index: idx });
      run = [];
    };
    rows.forEach((r, i) => {
      if (isEmpty(r)) run.push(i);
      else {
        flush();
        items.push({ kind: 'row', row: r, index: i });
      }
      if (i === spotAfter) flush(); // the rule lands here — a fold must not swallow it
    });
    flush();
    /* The companion chart's inputs — the same band inversion the panel
       words, plus the session tape to watch price approach them on. */
    const callBe = buildBasisBand(flowTape, 'C', marketData.spot, DTE_YEARS, iv).breakevenSpot;
    const putBe = buildBasisBand(flowTape, 'P', marketData.spot, DTE_YEARS, iv).breakevenSpot;
    const tape = (Simulator.getCandles(marketData.ticker) ?? []).slice(-240);
    return { rows, items, maxAbsPnl, spotAfter, iv, callBe, putBe, tape };
  }, [marketData, flowTape]);

  if (!marketData || !ladder) {
    return (
      <div className="flex items-center justify-center h-64 font-mono text-[11px] uppercase tracking-widest text-textMuted">
        Awaiting the tape…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 flex-grow min-h-0">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="font-mono text-[12px] font-bold uppercase tracking-widest text-textPrimary">
          <Term k="Cost basis">Pain Map</Term>
        </h2>
        <ProvenanceChip sources={['prints', 'carry']} />
      </div>

      {/* 5.6 — NOT MAX PAIN, AND THE PAGE HAS TO SAY WHICH.

          This will be mistaken for max pain within a second of a trader
          landing on it — the name is close, the shape is a strike ladder,
          and every options desk has a max-pain screen. It is a better idea
          than max pain and the checklist is right that it must not inherit
          the reputation of the usual thing.

          THE DIFFERENCE IS THE INPUT, and it is not subtle. Max pain asks
          which strike would expire worthless for the most OPEN INTEREST —
          a static count of contracts that says nothing about what anyone
          paid, treats a position opened last March identically to one
          opened this morning, and rests on a claim about who wants what
          that nobody has ever demonstrated.

          This reads the PRINTS: what today's buyers actually paid, strike
          by strike, and therefore where they are underwater and where they
          are in profit. It is a real cost basis rather than a count, and
          the flip level it produces is a price at which real positions turn
          — which is why it changes as the tape runs and max pain does not. */}
      <p className="px-1 text-[11px] leading-snug text-textMuted">
        <span className="text-textSecondary">This is not max pain.</span>{' '}
        Max pain counts open interest and asks which strike expires worthless for the most contracts — a static
        tally that ignores what anybody paid. This reads what today&apos;s buyers actually paid, strike by strike,
        so the level below is where real positions flip from profit to loss. It moves as the tape runs; max pain
        does not.
      </p>

      {/* Ladder and bands share the row at xl — the ladder is tall and
          narrow, the bands are prose; stacked they were a strip of page
          each with a void beside both. */}
      <div className="flex-1 flex flex-col xl:flex-row gap-4 min-h-0">
      {/* The bands — where today's buyers collectively flip. */}
      <div className="border border-borderSubtle bg-panel rounded-md p-3 xl:order-2 xl:w-[380px] shrink-0 self-start flex flex-col gap-3">
        <PainMapPanel prints={flowTape} spot={marketData.spot} dteYears={DTE_YEARS} iv={ladder.iv} />
        {/* The directive's companion chart: the bands ON the tape, so the
            flip is a level you watch price approach, not a sentence. */}
        <BasisDrift bars={ladder.tape} callBe={ladder.callBe} putBe={ladder.putBe} />
      </div>

      {/* The ladder — the same read, strike by strike. */}
      <div className="border border-borderSubtle bg-panel rounded-md p-2 overflow-auto flex-1 min-h-0 xl:order-1">
        <table className="w-full h-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#0c0c0c]">
              {['Strike', 'Call basis', 'Put basis', 'Contracts', 'Unrealized P&L', ''].map((h, i) => (
                <th
                  key={h || i}
                  className={`px-2 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-widest text-textMuted border-b border-borderSubtle ${
                    i === 0 ? 'w-px text-left whitespace-nowrap' : 'text-right'
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ladder.items.map((item, k) => {
              if (item.kind === 'fold') {
                return (
                  <tr key={`fold-${k}`}>
                    <td colSpan={6} className="p-0">
                      <HiddenStrikes count={item.count} />
                    </td>
                  </tr>
                );
              }
              const r = item.row;
              const i = item.index;
              const underwater = r.pnl !== null && r.pnl < 0;
              const green = r.pnl !== null && r.pnl > 0;
              const w = r.pnl === null ? 0 : (Math.abs(r.pnl) / ladder.maxAbsPnl) * 100;
              return (
                <Fragment key={r.strike}>
                  <tr
                    onClick={() => navigate('/pulse', { state: { focusPrice: r.strike } })}
                    title="Flash on chart"
                    className="cursor-pointer hover:bg-white/[0.02] transition-colors border-b border-borderSubtle/40 last:border-0"
                  >
                    <td className="w-px px-2 py-1 font-mono text-[11px] font-semibold tnum text-textPrimary whitespace-nowrap">
                      {r.strike}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-[10px] tnum text-textSecondary">
                      {r.call.basis === null ? '—' : r.call.basis.toFixed(2)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-[10px] tnum text-textSecondary">
                      {r.put.basis === null ? '—' : r.put.basis.toFixed(2)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-[10px] tnum text-textMuted">
                      {r.call.contracts + r.put.contracts > 0 ? (r.call.contracts + r.put.contracts).toLocaleString() : '·'}
                    </td>
                    <td
                      className={`px-2 py-1 text-right font-mono text-[10px] font-semibold tnum ${
                        underwater ? 'text-bear' : green ? 'text-bull' : 'text-textMuted'
                      }`}
                    >
                      {r.pnl === null ? '—' : fmtUsd(r.pnl)}
                    </td>
                    <td className="px-2 py-1 w-[26%]">
                      <span className="block h-[3px] w-full rounded-full bg-white/[0.04]">
                        <span
                          className={`block h-full rounded-full ${underwater ? 'bg-bear/80' : 'bg-bull/80'}`}
                          style={{ width: `${w}%` }}
                        />
                      </span>
                    </td>
                  </tr>
                  {i === ladder.spotAfter && (
                    <tr>
                      <td colSpan={6} className="px-2 py-1">
                        <SpotRule ticker={marketData.ticker} price={marketData.spot} />
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
        Basis is the volume-weighted fill of today's AGGRESSIVE LONGS at each strike — ask-side prints only, both
        rights. P&L is marked against the model at the current spot, green in profit and red underwater: when
        price crosses a row's basis, every holder in it flips at once.
      </p>
    </div>
  );
};

export default PainMap;
