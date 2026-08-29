import { useMemo } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildModelError, inferredSeries, modelErrorWords, simulatedReference } from '../../data/modelError';
import { ALERT } from '../../components/gex/palette';
import ErrorDrift from '../../components/gex/ErrorDrift';
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

      {/* Table left, verdict rail right at xl — the four facts and the
          confession are the page's second column, not a strip above a
          half-width table in a void. */}
      <div className="flex-1 flex flex-col xl:flex-row gap-4 min-h-0">
      <div className="xl:order-2 xl:w-[320px] shrink-0 flex flex-col gap-4">
        <div className="border border-borderSubtle bg-panel rounded-md p-3 grid grid-cols-2 xl:grid-cols-1 gap-x-6 gap-y-2">
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
              <span className="font-mono text-[16px] font-bold tnum text-textPrimary">{f.v}</span>
            </div>
          ))}
        </div>
      </div>

      <Panel title="Error Through The Session" subtitle="inferred vs the reference, moment by moment" className="w-full flex-1 min-h-0 xl:order-1" bodyClassName="flex min-h-0">
        <ErrorDrift points={read.points.slice(-90)} />
      </Panel>

      </div>

      {/* §23 — the honesty stays, the plumbing talk goes. What a reader
          needs is that the reference is simulated and how to read the sign;
          which vendor product would supply it, and what happens on the day
          it does, is our problem rather than theirs. The provenance chip
          carries the "simulated" claim in the desk's shared vocabulary. */}
      <p className="font-mono text-[9px] leading-relaxed text-textMuted">
        The reference below is SIMULATED: the gauge is measuring its own machinery against a seeded
        stand-in rather than an actualized reading. Positive error = the textbook computation OVERSTATES
        dealer gamma. Accuracy is mean-absolute, so errors in opposite directions cannot cancel into a
        flattering average.
      </p>
    </div>
  );
};

export default ModelError;
