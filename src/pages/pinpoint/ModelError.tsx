import { useMemo } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildModelError, inferredSeries, modelErrorWords, simulatedReference } from '../../data/modelError';
import { fmtUsd } from '../../data/gex';
import { ALERT } from '../../components/gex/palette';
import Panel from '../../components/ui/Panel';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import Term from '../../components/ui/Term';
import Simulator from '../../core/simulator';

/*
==================================================
  SLAYER TERMINAL - GEX MODEL ERROR — P-23
  (pages/pinpoint/ModelError.tsx)
==================================================

  THE AUDIT OF THE ENTIRE CATEGORY. Every GEX vendor infers dealer gamma
  from open interest and a sign assumption — including this desk. Periscope
  actualized gamma is verified attribution, which makes it ground truth,
  and a terminal holding ground truth can print the number nobody else can:
  how wrong is textbook GEX right now.

  THE REFERENCE IS SIMULATED TODAY, and the page says so in its loudest
  type, because a gauge measuring error against an invented truth without
  saying so would be the exact dishonesty it exists to expose. The owner's
  call: build the machinery now, swap the series the day the feed connects.
  Nothing else on the page changes that day.

  THE ERROR BAR WEARS ALERT ORANGE, not a heat ramp and not the regime
  pair. Model error is not dealer positioning — it is a warning about the
  measurement itself, and ALERT is the desk's ink for exactly that. Beyond
  25% the row's ink saturates; under it the bar stays muted.
*/

const BIG_MISS = 0.25;

const ModelError = () => {
  const { marketData } = useMarketData();

  const read = useMemo(() => {
    if (!marketData) return null;
    const snaps = Simulator.getGexHistory(marketData.ticker) ?? [];
    const inferred = inferredSeries(snaps);
    return buildModelError(inferred, simulatedReference(inferred, marketData.ticker));
  }, [marketData]);

  if (!read || read.now === null) {
    return (
      <div className="flex items-center justify-center h-64 font-mono text-[11px] uppercase tracking-widest text-textMuted">
        Awaiting the book…
      </div>
    );
  }

  const hhmm = (t: number) => {
    const d = new Date(t * 1000);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const tail = read.points.slice(-14);
  const maxPct = Math.max(...tail.map(p => Math.abs(p.errorPct ?? 0)), 1e-9);

  return (
    <div className="flex flex-col gap-3 flex-grow min-h-0">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="font-mono text-[12px] font-bold uppercase tracking-widest text-textPrimary">
          <Term k="Model error">How wrong is textbook GEX</Term>
        </h2>
        <ProvenanceChip sources={['exposure']} />
        <span
          className="font-mono text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border"
          style={{ color: ALERT, borderColor: ALERT }}
        >
          Simulated reference
        </span>
      </div>

      <p className="font-mono text-[13px] leading-relaxed text-textPrimary">{modelErrorWords(read)}</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1">
        {[
          {
            k: 'Error now',
            v: read.now.errorPct === null ? '—' : `${read.now.errorPct > 0 ? '+' : ''}${(read.now.errorPct * 100).toFixed(1)}%`,
          },
          { k: 'Rolling accuracy', v: read.accuracy === null ? '—' : `${Math.round(read.accuracy * 100)}%` },
          { k: 'Bias', v: read.bias },
          { k: 'Worst moment', v: read.worst ? hhmm(read.worst.time) : '—' },
        ].map(f => (
          <div key={f.k} className="flex flex-col">
            <span className="font-mono text-[9px] uppercase tracking-wider text-textMuted">{f.k}</span>
            <span className="font-mono text-[14px] font-bold tnum text-textPrimary">{f.v}</span>
          </div>
        ))}
      </div>

      <Panel title="Error Through The Session" subtitle="inferred vs the reference, moment by moment" className="w-full flex-1 min-h-0" bodyClassName="flex min-h-0">
        <div className="overflow-auto w-full min-h-0">
          <table className="w-full h-full border-collapse">
            <thead>
              <tr>
                {['Time', 'Inferred', 'Reference', 'Error', ''].map(h => (
                  <th
                    key={h}
                    className="px-2 py-1 text-right first:text-left font-mono text-[9px] uppercase tracking-wider text-textMuted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tail.map(p => {
                const pct = p.errorPct;
                const big = pct !== null && Math.abs(pct) >= BIG_MISS;
                const w = pct === null ? 0 : (Math.abs(pct) / maxPct) * 100;
                return (
                  <tr key={p.time}>
                    <td className="px-2 py-0.5 font-mono text-[10px] tnum text-textMuted">{hhmm(p.time)}</td>
                    <td className="px-2 py-0.5 text-right font-mono text-[10px] tnum text-textSecondary">{fmtUsd(p.inferred)}</td>
                    <td className="px-2 py-0.5 text-right font-mono text-[10px] tnum text-textSecondary">{fmtUsd(p.actualized)}</td>
                    <td className={`px-2 py-0.5 text-right font-mono text-[10px] tnum ${big ? 'font-semibold' : ''}`} style={big ? { color: ALERT } : undefined}>
                      {pct === null ? '—' : `${pct > 0 ? '+' : ''}${(pct * 100).toFixed(1)}%`}
                    </td>
                    <td className="px-2 py-0.5 w-[30%]">
                      <div
                        className="h-1.5 rounded-sm"
                        style={{ width: `${w}%`, background: ALERT, opacity: big ? 0.9 : 0.35 }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <p className="font-mono text-[9px] leading-relaxed text-textMuted">
        The reference below is SIMULATED — Periscope actualized gamma is not connected, so the gauge is
        exercising its own machinery against a seeded stand-in. The day the feed lands, only the series swaps:
        the join, the metrics and this page do not change. Positive error = the textbook computation OVERSTATES
        dealer gamma. Accuracy is mean-absolute, so errors in opposite directions cannot cancel into a
        flattering average.
      </p>
    </div>
  );
};

export default ModelError;
