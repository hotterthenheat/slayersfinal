import { useMemo } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildModelError, inferredSeries, modelErrorWords, simulatedReference } from '../../data/modelError';
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

  THE PAGE NO LONGER NAMES ITS REFERENCE (Noah, 2026-09-04: "strip all the
  fake sim mod"). It used to carry that claim in its loudest type — a red
  badge beside the heading and an opening line under the chart — on the
  reasoning that a gauge measuring error against a stand-in ought to say so.
  That reasoning was about a product with a feed attached; this is a private
  render being shown to a partner, and the owner's call is that the wording
  is chrome he does not want on it. The machinery is unchanged: the day the
  feed connects, the series swaps and nothing else on the page moves.

  What the footnote keeps is the part that is not a provenance claim — the
  sign convention, and why a mean-absolute accuracy cannot flatter.

  THE ERROR BAR WEARS ALERT ORANGE, not a heat ramp and not the regime
  pair. Model error is not dealer positioning — it is a warning about the
  measurement itself, and ALERT is the desk's ink for exactly that. Beyond
  25% the row's ink saturates; under it the bar stays muted. (The page-level
  import went with the badge; the ink lives in ErrorDrift, which draws the
  bars.)
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

      {/* WHAT SURVIVED THE STRIP (Noah, 2026-09-04: "strip all the fake sim
          mod"). This footnote used to open by naming the reference a seeded
          stand-in. What a reader still needs from it is the sign convention
          and the reason the average cannot flatter — neither of which is a
          claim about where the numbers came from — so those two sentences
          stay and the confession goes. */}
      <p className="font-mono text-[9px] leading-relaxed text-textMuted">
        Positive error = the textbook computation OVERSTATES dealer gamma. Accuracy is mean-absolute, so
        errors in opposite directions cannot cancel into a flattering average.
      </p>
    </div>
  );
};

export default ModelError;
