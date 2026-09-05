import { useMemo, useState } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildExposureCompare, compareWords, COMPARE_MODE_WORDS, type CompareMode } from '../../data/exposureCompare';
import { heatMagnitude, heatPoles, heatRgb } from '../../components/gex/heatmap';
import { SPOT } from '../../components/gex/palette';
import { twinFamilyFor } from '../../data/indexTwins';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import Term from '../../components/ui/Term';
import Simulator from '../../core/simulator';

/*
==================================================
  SLAYER TERMINAL - TWO-TICKER COMPARE — P-22
  (pages/pinpoint/ExposureCompare.tsx)
==================================================

  Structural divergence between an index and its ETF, or between two
  correlated indices, is a real signal that nothing in the product surfaces.
  A reader flipping between two tabs is comparing shapes from memory across
  two different price axes and two different dollar scales — which is not
  comparing at all.

  ONE AXIS: PERCENT FROM SPOT, running down the page so both books read
  against the same ladder. Each row shows the two books' shares of their own
  gamma facing each other from a centre line, with the divergence between
  them as the third column. Bars grow OUTWARD from the middle so agreement
  looks symmetric and disagreement is instantly visibly lopsided — the shape
  of the row is the read.
*/

const ExposureCompare = () => {
  const { marketData } = useMarketData();
  /*
    THE PICKER LEADS WITH THE PAIRS THE READ IS FOR. The directive's cases
    are SPX vs SPY and SPY vs QQQ — an instrument against its correlated
    sibling, where a divergence is a signal. T-17's twin families are the
    desk's own registry of who is correlated with whom, so the correlated
    group is derived from it: the OTHER families' ETFs (their cash indices
    and futures have no simulated book yet — they join the group the day
    their chains exist). Everything else stays available under a divider,
    because a reader may want an uncorrelated look — but the page no longer
    opens on SPY vs a random single name as though that were the product.
  */
  const { correlated, rest } = useMemo(() => {
    const all = Object.keys(Simulator.TICKERS).slice(0, 12);
    const mine = marketData?.ticker ?? '';
    const fams = ['SPY', 'QQQ', 'IWM'];
    const corr = fams.filter(t => t !== mine && all.includes(t) && twinFamilyFor(t) !== null);
    return { correlated: corr, rest: all.filter(t => t !== mine && !corr.includes(t)) };
  }, [marketData?.ticker]);
  const [other, setOther] = useState<string>('');
  /* 5.8 — SHAPE OR IMPACT. Two normalisations that answer different
     questions, so this is a toggle and not a preference: shape divides each
     book by its own total |GEX| and asks whether they are positioned the
     same way; impact divides by the name's dollar turnover and asks whose
     dealers have more to do relative to what the name can absorb. Shape
     defaults because this page's headline is structural divergence. */
  const [mode, setMode] = useState<CompareMode>('shape');

  const partner = other || correlated[0] || rest[0] || '';
  const compare = useMemo(() => {
    if (!marketData || !partner) return null;
    const b = Simulator.snapshotFor(partner as Parameters<typeof Simulator.snapshotFor>[0]);
    return b ? buildExposureCompare(marketData, b, mode) : null;
  }, [marketData, partner, mode]);

  if (!compare) {
    return (
      <div className="flex items-center justify-center h-64 font-mono text-[11px] uppercase tracking-widest text-textMuted">
        Awaiting both books…
      </div>
    );
  }

  const maxShare = Math.max(...compare.buckets.map(b => Math.max(Math.abs(b.a), Math.abs(b.b))), 1e-9);

  return (
    <div className="flex flex-col gap-3 flex-grow min-h-0">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-mono text-[12px] font-bold uppercase tracking-widest text-textPrimary">
          <Term k="Structural divergence">{compare.tickerA} vs {compare.tickerB}</Term>
        </span>
        <select
          aria-label="Compare against"
          value={partner}
          onChange={e => setOther(e.target.value)}
          className="bg-panel border border-borderSubtle rounded px-2 py-1 font-mono text-[10px] text-textPrimary"
        >
          {correlated.length > 0 && (
            <optgroup label="Correlated books — the read this page is for">
              {correlated.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Everything else">
            {rest.map(t => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </optgroup>
        </select>
        <span className="inline-flex items-center gap-1 rounded border border-borderSubtle p-0.5" role="group" aria-label="Normalisation">
          {(['shape', 'impact'] as CompareMode[]).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              title={COMPARE_MODE_WORDS[m].note}
              aria-pressed={mode === m}
              className={`rounded px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider transition-colors ${
                mode === m ? 'bg-white/[0.08] text-textPrimary' : 'text-textMuted hover:text-textSecondary'
              }`}
            >
              {COMPARE_MODE_WORDS[m].label}
            </button>
          ))}
        </span>
        {/* A fallback is never silent: impact needs BOTH turnovers, and one
            missing would otherwise draw two books on different rulers and
            call the difference divergence. */}
        {compare.modeRequested !== compare.mode && (
          <span
            className="font-mono text-[9px] uppercase tracking-wider text-warn"
            title="Impact needs a dollar turnover for both names and one of these has too little history. Showing shape instead — the alternative would put the two books on different rulers and draw the mismatch as divergence."
          >
            showing shape — no turnover
          </span>
        )}
        <ProvenanceChip sources={['chain', 'exposure']} />
      </div>

      <p className="font-mono text-[12px] leading-relaxed text-textPrimary">{compareWords(compare)}</p>

      <div className="flex-1 flex flex-col xl:flex-row gap-4 min-h-0">
      <div className="border border-borderSubtle bg-panel rounded-md overflow-auto flex-1 min-h-0 xl:order-1">
        <table className="w-full h-full border-collapse">
          <thead>
            <tr>
              {['% from spot', compare.tickerA, compare.tickerB, 'divergence'].map(h => (
                <th
                  key={h}
                  className="px-2 py-1.5 text-left font-mono text-[9px] uppercase tracking-wider text-textMuted"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...compare.buckets].reverse().map(b => {
              /* House heat for both books — colour AND length off the ramp,
                 like every other exposure bar on the desk. */
              const [ar, ag, ab] = heatRgb(b.a, maxShare);
              const [br2, bg2, bb2] = heatRgb(b.b, maxShare);
              const wa = heatMagnitude(b.a, maxShare) * 100;
              const wb = heatMagnitude(b.b, maxShare) * 100;
              const atSpot = Math.abs(b.pct) < 1e-9;
              const widest = compare.widest !== null && b.pct === compare.widest.pct && Math.abs(b.divergence) > 0.02;
              return (
                <tr key={b.pct} className={atSpot ? 'bg-white/[0.04]' : widest ? 'bg-white/[0.02]' : ''}>
                  <td
                    className="px-2 py-0.5 font-mono text-[10px] tnum"
                    style={{ color: atSpot ? SPOT : undefined }}
                  >
                    {b.pct > 0 ? '+' : ''}
                    {b.pct.toFixed(2)}%
                  </td>
                  <td className="px-2 py-0.5">
                    <div className="flex justify-end">
                      <div
                        className="h-1.5 rounded-sm"
                        style={{ width: `${b.a === 0 ? 0 : wa}%`, background: `rgb(${ar},${ag},${ab})` }}
                      />
                    </div>
                  </td>
                  <td className="px-2 py-0.5">
                    <div
                      className="h-1.5 rounded-sm"
                      style={{ width: `${b.b === 0 ? 0 : wb}%`, background: `rgb(${br2},${bg2},${bb2})` }}
                    />
                  </td>
                  <td className={`px-2 py-0.5 font-mono text-[10px] tnum ${widest ? 'text-textPrimary font-semibold' : 'text-textSecondary'}`}>
                    {b.divergence === 0 ? '·' : `${b.divergence > 0 ? '+' : ''}${(b.divergence * 100).toFixed(1)}`}
                    {widest ? ' ◀' : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="xl:order-2 xl:w-[340px] shrink-0 flex flex-col gap-4 self-start">
      <div className="border border-borderSubtle bg-panel rounded-md p-3 grid grid-cols-2 gap-4">
        {([['a', compare.tickerA], ['b', compare.tickerB]] as const).map(([k, name]) => (
          <div key={k} className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-textMuted">{name} levels</span>
            {(['callWall', 'putWall', 'flip'] as const).map(l => (
              <span key={l} className="font-mono text-[10px] tnum text-textSecondary">
                {l} {compare.levels[k][l] === null ? '—' : `${compare.levels[k][l]! > 0 ? '+' : ''}${compare.levels[k][l]!.toFixed(2)}%`}
              </span>
            ))}
          </div>
        ))}
      </div>

      <p className="font-mono text-[9px] leading-relaxed text-textMuted">
        Both books are placed on percent-from-spot and normalized to a share of their own total gamma, so what is
        compared is the SHAPE of the positioning rather than its size. Without both, the bigger book would appear
        to diverge everywhere and nothing would ever align. The bars are the house heat —{' '}
        <span style={{ color: heatPoles.pos }}>gold amplifies</span>,{' '}
        <span style={{ color: heatPoles.neg }}>steel absorbs</span> — and ◀ marks where the books disagree most.
      </p>
      </div>
      </div>
    </div>
  );
};

export default ExposureCompare;
