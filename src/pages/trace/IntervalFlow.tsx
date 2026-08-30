import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMarketData } from '../../context/MarketDataContext';
import { buildIntervalFlow, assemblyRatio, assembled } from '../../data/intervalFlow';
import { buildMultiLegFlow, structureRead } from '../../data/multiLeg';
import Panel from '../../components/ui/Panel';
import DataState from '../../components/ui/DataState';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import Chip from '../../components/ui/Chip';
import { fmtUsd } from '../../data/gex';

/*
==================================================
  SLAYER TERMINAL - INTERVAL & STRUCTURE FLOW
  (pages/trace/IntervalFlow.tsx)
==================================================

  Two readings the flat tape cannot give, on one page because they answer
  halves of the same question — what is actually being DONE in here, as
  opposed to what printed.

  ACCUMULATION (top). The tape sorted by print size shows you the loud
  orders. Someone building a position sends it in pieces precisely so it
  does not show up there, so this buckets by CONTRACT over a short window:
  forty 25-lots into one strike is a thousand-lot row here and forty
  unremarkable lines in the feed.

  STRUCTURE (bottom). A 2,000-lot leg of a vertical is not a 2,000-lot
  directional bet, and in the flat tape the two look identical. The
  structure share is the headline — a tape that is 8% spreads is a
  directional day and one that is 35% is a day of financing and hedging,
  and price behaves differently under the two.

  THE WINDOW IS THE CONTROL, and it is short on purpose. This is a "right
  now" surface; a long window turns accumulation back into a session total,
  which the scanner already gives.
*/

const WINDOWS = [
  { label: '5m', ms: 5 * 60_000 },
  { label: '10m', ms: 10 * 60_000 },
  { label: '30m', ms: 30 * 60_000 },
];

const IntervalFlowPage = () => {
  const { flowTape, activeTicker } = useMarketData();
  const navigate = useNavigate();
  const [windowMs, setWindowMs] = useState(WINDOWS[1].ms);
  const [scope, setScope] = useState<'all' | 'active'>('all');

  const ticker = scope === 'active' ? activeTicker : null;
  const flow = useMemo(
    () => buildIntervalFlow(flowTape, ticker, windowMs, 40),
    [flowTape, ticker, windowMs]
  );
  const structures = useMemo(
    () => buildMultiLegFlow(flowTape, ticker, windowMs),
    [flowTape, ticker, windowMs]
  );
  const quiet = useMemo(() => assembled(flow), [flow]);

  const controls = (
    <span className="flex items-center gap-1">
      <Chip active={scope === 'all'} onClick={() => setScope('all')} title="Every name printing">
        All
      </Chip>
      <Chip active={scope === 'active'} onClick={() => setScope('active')} title={`${activeTicker} only`}>
        {activeTicker}
      </Chip>
      <span className="w-2" />
      {WINDOWS.map(w => (
        <Chip key={w.label} active={windowMs === w.ms} onClick={() => setWindowMs(w.ms)} title={`Accumulation over the last ${w.label}`}>
          {w.label}
        </Chip>
      ))}
    </span>
  );

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Accumulation by contract"
        subtitle={`one row per contract over the last ${WINDOWS.find(w => w.ms === windowMs)?.label} — ranked by premium`}
        actions={
          <span className="flex items-center gap-2">
            {controls}
            <ProvenanceChip sources={['prints']} note="Summed from the live print tape; the window is rolling, so a row falls off when its prints age out." />
          </span>
        }
      >
        {flow.rows.length === 0 ? (
          <DataState
            kind="empty"
            title="Nothing in the window yet"
            body="No prints have landed in this interval. Widen the window, or wait for the tape."
          />
        ) : (
          <>
            {quiet.length > 0 && (
              <p className="px-1 pb-2 text-[11px] text-textSecondary">
                <span className="text-textPrimary font-semibold">{quiet.length}</span>{' '}
                {quiet.length === 1 ? 'contract was' : 'contracts were'} assembled out of pieces rather than
                sent — the size a feed sorted by print size cannot show you.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <thead>
                  <tr className="border-b border-borderSubtle">
                    {['Contract', 'Contracts', 'Prints', 'Assembled', 'Ask side', 'Vol/OI', 'Premium'].map((h, i) => (
                      <th
                        key={h}
                        className={`py-1.5 px-2 font-mono text-[9px] font-semibold uppercase tracking-widest text-textMuted ${
                          i === 0 ? 'text-left' : 'text-right'
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {flow.rows.map(r => {
                    const ratio = assemblyRatio(r);
                    const isQuiet = quiet.some(q => q.key === r.key);
                    return (
                      <tr
                        key={r.key}
                        onClick={() => navigate(`/weigher`, { state: { ticker: r.ticker, strike: r.strike, right: r.right } })}
                        className="border-b border-borderSubtle/60 hover:bg-white/[0.03] cursor-pointer transition-colors"
                        title={`${r.ticker} ${r.strike}${r.right} ${r.expiry} — ${r.contracts} contracts across ${r.prints} prints. Open it on the Weigher.`}
                      >
                        <td className="py-1.5 px-2 font-mono text-[11px]">
                          <span className="text-textPrimary font-semibold">{r.ticker}</span>{' '}
                          <span className="text-textSecondary">
                            {r.strike}
                            {r.right}
                          </span>{' '}
                          <span className="text-textMuted text-[10px]">{r.dte}d</span>
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono text-[11px] tnum text-textPrimary">
                          {r.contracts.toLocaleString()}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono text-[11px] tnum text-textSecondary">{r.prints}</td>
                        {/* The tell: size over its largest single print. */}
                        <td
                          className={`py-1.5 px-2 text-right font-mono text-[11px] tnum ${
                            isQuiet ? 'text-supreme font-semibold' : 'text-textMuted'
                          }`}
                        >
                          {ratio.toFixed(1)}&times;
                        </td>
                        <td
                          className={`py-1.5 px-2 text-right font-mono text-[11px] tnum font-semibold ${
                            r.askPct >= 60 ? 'text-bull' : r.askPct <= 40 ? 'text-bear' : 'text-textSecondary'
                          }`}
                        >
                          {r.askPct}%
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono text-[11px] tnum text-textSecondary">
                          {/* null is "we were not told", drawn as an em-dash
                              rather than as a zero. */}
                          {r.volOverOi === null ? <span className="text-textMuted">&mdash;</span> : `${r.volOverOi.toFixed(2)}×`}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono text-[11px] tnum text-textPrimary font-semibold">
                          {fmtUsd(r.premium)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

      <Panel
        title="Structure"
        subtitle="spreads, butterflies and ratios against the directional tape"
        actions={<ProvenanceChip sources={['prints']} note="Grouped by the structure tag each print carries. This tape does not link a structure's legs to each other, so per-leg detail is not shown rather than guessed." />}
      >
        <p className="px-1 pb-3 text-[12px] text-textSecondary">{structureRead(structures)}</p>
        {structures.groups.length === 0 ? (
          <DataState kind="empty" title="No structures in the window" body="Every print in this interval was a single leg." />
        ) : (
          <div className="flex flex-col gap-1.5">
            {structures.groups.map(g => (
              <div key={g.strat} className="flex items-center gap-3 px-1">
                <span className="w-20 shrink-0 font-mono text-[11px] text-textPrimary">{g.strat}</span>
                <span className="relative flex-1 h-4 rounded bg-white/[0.03] overflow-hidden">
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 bg-supreme/35"
                    style={{ width: `${g.sharePct}%` }}
                  />
                  <span className="absolute inset-y-0 left-1.5 flex items-center font-mono text-[10px] tnum text-textPrimary">
                    {g.sharePct}%
                  </span>
                </span>
                <span className="w-16 text-right font-mono text-[10px] tnum text-textSecondary">{g.prints} prints</span>
                <span className="w-14 text-right font-mono text-[10px] tnum text-textSecondary">{g.avgLegs} legs</span>
                <span
                  className={`w-12 text-right font-mono text-[10px] tnum font-semibold ${
                    g.askPct >= 60 ? 'text-bull' : g.askPct <= 40 ? 'text-bear' : 'text-textSecondary'
                  }`}
                >
                  {g.askPct}%
                </span>
                <span className="w-20 text-right font-mono text-[11px] tnum text-textPrimary font-semibold">
                  {fmtUsd(g.premium)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
};

export default IntervalFlowPage;
