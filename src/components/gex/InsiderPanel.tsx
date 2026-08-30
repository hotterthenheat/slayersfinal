import { useMemo, useState } from 'react';
import Panel from '../ui/Panel';
import Chip from '../ui/Chip';
import DataState from '../ui/DataState';
import ProvenanceChip from '../ui/ProvenanceChip';
import { insiderFlow, insiderRead } from '../../data/insiderFlow';
import { fmtUsd } from '../../data/gex';

/*
==================================================
  SLAYER TERMINAL - INSIDER PANEL
  (components/gex/InsiderPanel.tsx)
==================================================

  THE PLAN BADGE IS THE POINT OF THIS PANEL.

  Most insider selling runs off a 10b5-1 schedule adopted months earlier and
  executed automatically. A board that shows "CFO sold $4m" without saying
  so has told the reader something false in every way that matters: the CFO
  did not decide to sell today. So the badge sits on the row, not in a
  footnote, and the summary line leads with what share of the selling was
  a calendar rather than a decision.

  DISCRETIONARY BUYS ARE DRAWN LOUDEST because the asymmetry is real —
  there are many reasons to sell and essentially one to buy. Everything
  else on this board is context for that one line.

  ROLES, NOT NAMES. This desk has no filing feed, so it reports the role
  and invents nothing about a real person.
*/

const WINDOWS = [
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '180d', days: 180 },
];

const SIGNAL_INK: Record<string, string> = {
  accumulating: 'text-bull',
  distributing: 'text-bear',
  'scheduled selling': 'text-textSecondary',
  quiet: 'text-textMuted',
};

interface InsiderPanelProps {
  ticker: string;
  className?: string;
}

const InsiderPanel = ({ ticker, className }: InsiderPanelProps) => {
  const [days, setDays] = useState(90);
  const f = useMemo(() => insiderFlow(ticker, days), [ticker, days]);

  return (
    <Panel
      title="Insider transactions"
      subtitle="what the people running the company did with their own shares — and whether they chose to"
      className={className}
      actions={
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            {WINDOWS.map(w => (
              <Chip key={w.label} active={days === w.days} onClick={() => setDays(w.days)} title={`Filings over the last ${w.label}`}>
                {w.label}
              </Chip>
            ))}
          </span>
          <ProvenanceChip
            sources={['chain']}
            note="Modelled filings, stable within a session. Roles are reported rather than names: this desk has no filing feed, and printing a plausible trade under a real officer's name would be inventing a record. The plan badge marks a 10b5-1 schedule — a sale decided months before it printed."
          />
        </span>
      }
    >
      {f.trades.length === 0 ? (
        <DataState
          kind="empty"
          title="Nothing filed"
          body={`No insider filed a transaction in ${ticker} in this window. An empty window is a fact about the company, not a gap in the data.`}
        />
      ) : (
        <>
          <div className="px-1 pb-3 flex items-end gap-5 flex-wrap">
            <div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Reads as</div>
              <div className={`mt-0.5 font-mono text-lg font-semibold capitalize ${SIGNAL_INK[f.signal]}`}>{f.signal}</div>
            </div>
            <div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Bought on the open market</div>
              <div className={`mt-0.5 font-mono text-lg font-semibold tnum ${f.openMarketBuys > 0 ? 'text-bull' : 'text-textMuted'}`}>
                {f.openMarketBuys > 0 ? fmtUsd(f.openMarketBuys) : '—'}
              </div>
            </div>
            <div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Sold</div>
              <div className="mt-0.5 font-mono text-lg font-semibold tnum text-textSecondary">{fmtUsd(f.sold)}</div>
            </div>
            <div>
              {/* The number that stops a reader over-reading the one above. */}
              <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Of that, on a schedule</div>
              <div className="mt-0.5 font-mono text-lg font-semibold tnum text-textMuted">{fmtUsd(f.plannedValue)}</div>
            </div>
          </div>

          <p className="px-1 pb-3 text-[12px] text-textSecondary leading-snug">{insiderRead(f)}</p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse">
              <thead>
                <tr className="border-b border-borderSubtle">
                  {['When', 'Who', 'What', 'Shares', 'Price', 'Value', 'Of stake', 'Since'].map((h, i) => (
                    <th
                      key={h}
                      className={`py-1.5 px-2 font-mono text-[9px] font-semibold uppercase tracking-widest text-textMuted ${
                        i <= 2 ? 'text-left' : 'text-right'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {f.trades.map(t => {
                  const loud = t.kind === 'BUY' && !t.planned;
                  return (
                    <tr
                      key={t.id}
                      className={`border-b border-borderSubtle/60 transition-colors ${
                        loud ? 'bg-bull/[0.06] hover:bg-bull/[0.10]' : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <td className="py-1.5 px-2 font-mono text-[10px] tnum text-textMuted">{t.daysAgo}d ago</td>
                      <td className="py-1.5 px-2 font-mono text-[11px] text-textSecondary">{t.role}</td>
                      <td className="py-1.5 px-2">
                        <span
                          className={`font-mono text-[11px] font-semibold ${t.kind === 'BUY' ? 'text-bull' : 'text-bear'}`}
                        >
                          {t.kind}
                        </span>
                        {/* Not a footnote — a scheduled sale is a different
                            event from a chosen one, and the row has to say
                            which before a reader draws anything from it. */}
                        {t.planned && (
                          <span
                            className="ml-1.5 rounded px-1 font-mono text-[8px] font-bold uppercase tracking-widest text-textMuted border border-borderSubtle"
                            title="A 10b5-1 plan — the schedule was adopted months before this printed, so it carries no view on today."
                          >
                            plan
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono text-[11px] tnum text-textPrimary">
                        {t.shares.toLocaleString()}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono text-[11px] tnum text-textSecondary">
                        ${t.price.toFixed(2)}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono text-[11px] tnum text-textPrimary font-semibold">
                        {fmtUsd(t.value)}
                      </td>
                      <td
                        className="py-1.5 px-2 text-right font-mono text-[10px] tnum text-textMuted"
                        title={`${t.heldAfter.toLocaleString()} shares still held after this trade`}
                      >
                        {t.stakePct}%
                      </td>
                      {/* Arithmetic, not a verdict on their timing. */}
                      <td
                        className={`py-1.5 px-2 text-right font-mono text-[10px] tnum ${
                          t.sincePct >= 0 ? 'text-bull/80' : 'text-bear/80'
                        }`}
                      >
                        {t.sincePct >= 0 ? '+' : ''}
                        {t.sincePct}%
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
  );
};

export default InsiderPanel;
