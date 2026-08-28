import { useMemo, useState } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildExposureCompare, compareWords } from '../../data/exposureCompare';
import { LONG_GAMMA, SHORT_GAMMA, SPOT } from '../../components/gex/palette';
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
  const tickers = useMemo(() => Object.keys(Simulator.TICKERS).slice(0, 12), []);
  const [other, setOther] = useState<string>('');

  const partner = other || tickers.find(t => t !== marketData?.ticker) || '';
  const compare = useMemo(() => {
    if (!marketData || !partner) return null;
    const b = Simulator.snapshotFor(partner as Parameters<typeof Simulator.snapshotFor>[0]);
    return b ? buildExposureCompare(marketData, b) : null;
  }, [marketData, partner]);

  if (!compare) {
    return (
      <div className="flex items-center justify-center h-64 font-mono text-[11px] uppercase tracking-widest text-textMuted">
        Awaiting both books…
      </div>
    );
  }

  const maxShare = Math.max(...compare.buckets.map(b => Math.max(Math.abs(b.a), Math.abs(b.b))), 1e-9);

  return (
    <div className="flex flex-col gap-3">
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
          {tickers
            .filter(t => t !== compare.tickerA)
            .map(t => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
        </select>
        <ProvenanceChip sources={['chain', 'exposure']} />
      </div>

      <p className="font-mono text-[12px] leading-relaxed text-textPrimary">{compareWords(compare)}</p>

      <div className="border border-borderSubtle bg-panel rounded-md overflow-x-auto">
        <table className="w-full border-collapse">
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
              const wa = (Math.abs(b.a) / maxShare) * 100;
              const wb = (Math.abs(b.b) / maxShare) * 100;
              const atSpot = Math.abs(b.pct) < 1e-9;
              return (
                <tr key={b.pct} className={atSpot ? 'bg-white/[0.04]' : ''}>
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
                        style={{ width: `${wa}%`, background: b.a >= 0 ? SHORT_GAMMA : LONG_GAMMA }}
                      />
                    </div>
                  </td>
                  <td className="px-2 py-0.5">
                    <div
                      className="h-1.5 rounded-sm"
                      style={{ width: `${wb}%`, background: b.b >= 0 ? SHORT_GAMMA : LONG_GAMMA }}
                    />
                  </td>
                  <td className="px-2 py-0.5 font-mono text-[10px] tnum text-textSecondary">
                    {b.divergence === 0 ? '·' : `${b.divergence > 0 ? '+' : ''}${(b.divergence * 100).toFixed(1)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-4">
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
        to diverge everywhere and nothing would ever align.
      </p>
    </div>
  );
};

export default ExposureCompare;
