import { useMemo, useState } from 'react';
import Panel from '../ui/Panel';
import Chip from '../ui/Chip';
import DataState from '../ui/DataState';
import ProvenanceChip from '../ui/ProvenanceChip';
import { buildOiExplorer, oiRead, type OiSort } from '../../data/oiExplorer';

/*
==================================================
  SLAYER TERMINAL - THE OVERNIGHT BOOK
  (components/gex/OvernightOiPanel.tsx)
==================================================

  Sits under the ΔOI heat, and answers the other half of the same subject.
  The heat above is the SESSION — which strikes are being built right now,
  snapshot against snapshot. This is the OVERNIGHT book: what settled while
  the market was shut, which is the only vintage in which an open-interest
  change is a published fact rather than an inference.

  THREE SORTS BECAUSE THERE ARE THREE QUESTIONS. Where did the money go
  (absolute), what appeared out of nothing (percent), and what got closed
  out (closed). One board ranked one way answers a third of what a reader
  came for.

  A NEW CONTRACT SHOWS ITS BADGE, NOT A PERCENTAGE. There is no percent
  change from zero, so the cell says NEW and the reader learns something
  truer than "∞%".
*/

const SORTS: { key: OiSort; label: string; hint: string }[] = [
  { key: 'absolute', label: 'Biggest', hint: 'Most contracts added or removed — where the money went' },
  { key: 'percent', label: 'Fastest', hint: 'Largest proportional build; contracts that appeared from nothing lead' },
  { key: 'closed', label: 'Unwound', hint: 'The biggest positions closed out overnight' },
];

interface OvernightOiPanelProps {
  ticker: string;
  className?: string;
}

const OvernightOiPanel = ({ ticker, className }: OvernightOiPanelProps) => {
  const [sort, setSort] = useState<OiSort>('absolute');
  const e = useMemo(() => buildOiExplorer(ticker, sort, 24), [ticker, sort]);

  return (
    <Panel
      title="Overnight open interest"
      subtitle="what settled while the market was shut — published once, after the close"
      className={className}
      actions={
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            {SORTS.map(s => (
              <Chip key={s.key} active={sort === s.key} onClick={() => setSort(s.key)} title={s.hint}>
                {s.label}
              </Chip>
            ))}
          </span>
          <ProvenanceChip
            sources={['chain']}
            note="Yesterday's close against the one before it. Open interest is published once a day, so this is the only vintage in which its change is a fact rather than an inference."
          />
        </span>
      }
    >
      {e.rows.length === 0 ? (
        <DataState kind="empty" title="No overnight change" body={`Nothing moved in ${ticker}'s open interest last night.`} />
      ) : (
        <>
          <p className="px-1 pb-2 text-[11px] text-textSecondary">{oiRead(e, ticker)}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[440px] border-collapse">
              <thead>
                <tr className="border-b border-borderSubtle">
                  {['Strike', 'Yesterday', 'Now', 'Change', '%'].map((h, i) => (
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
                {e.rows.map(r => (
                  <tr key={r.key} className="border-b border-borderSubtle/60 hover:bg-white/[0.03] transition-colors">
                    <td className="py-1 px-2 font-mono text-[11px]">
                      <span className="text-textPrimary font-semibold">
                        {r.strike % 1 === 0 ? r.strike.toFixed(0) : r.strike.toFixed(2)}
                      </span>
                      <span className={`ml-1 ${r.right === 'C' ? 'text-textSecondary' : 'text-warn'}`}>{r.right}</span>
                      {r.wasEmpty && (
                        <span className="ml-1.5 rounded px-1 font-mono text-[8px] font-bold uppercase tracking-widest text-supreme border border-supreme/40">
                          new
                        </span>
                      )}
                    </td>
                    <td className="py-1 px-2 text-right font-mono text-[11px] tnum text-textMuted">
                      {r.prevOi.toLocaleString()}
                    </td>
                    <td className="py-1 px-2 text-right font-mono text-[11px] tnum text-textSecondary">
                      {r.oi.toLocaleString()}
                    </td>
                    <td
                      className={`py-1 px-2 text-right font-mono text-[11px] tnum font-semibold ${
                        r.change > 0 ? 'text-bull' : 'text-bear'
                      }`}
                    >
                      {r.change > 0 ? '+' : ''}
                      {r.change.toLocaleString()}
                    </td>
                    {/* NEW carries no percent — there is no change from zero,
                        and the badge beside the strike already said it. */}
                    <td className="py-1 px-2 text-right font-mono text-[10px] tnum text-textMuted">
                      {r.changePct === null ? <span>&mdash;</span> : `${r.changePct > 0 ? '+' : ''}${r.changePct}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
};

export default OvernightOiPanel;
