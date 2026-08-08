import { fmtUsd } from '../../data/gex';

/*
==================================================
  SLAYER TERMINAL - PAYOFF LADDER (flowdesk/PayoffLadder.tsx)
  What the contract is worth at expiry, across a ladder of underlying prices.

  Deliberately NOT a model. Every number here is the contract's definition —
  intrinsic value is max(S − K, 0) for a call and max(K − S, 0) for a put, and
  the outcome is that minus what was paid. No volatility, no rate, no discount
  factor, nothing the math provider owns. That is why it can live in a drilldown
  without waiting on the real math files: replacing them changes every other
  number on the card and cannot change this one.

  It answers the question a big print raises and nothing else on the card
  answers: what would the underlying have to do, and what is it worth if it
  does. It is shown only in the expanded view, because it is a table and a
  drilldown that leads with a table buries the read.
==================================================
*/

interface PayoffLadderProps {
  spot: number;
  strike: number;
  right: 'C' | 'P';
  /** Per-contract premium paid. */
  cost: number;
  /** Contracts, for the position-level column. */
  size: number;
  /** Half-width of the ladder as a fraction of spot. */
  span?: number;
}

/** Intrinsic value at expiry — the contract's definition, not a valuation. */
const intrinsic = (s: number, strike: number, right: 'C' | 'P') =>
  right === 'C' ? Math.max(s - strike, 0) : Math.max(strike - s, 0);

const PayoffLadder = ({ spot, strike, right, cost, size, span = 0.06 }: PayoffLadderProps) => {
  const breakeven = right === 'C' ? strike + cost : strike - cost;

  // Even rungs across the span, plus the two prices that matter regardless of
  // where the grid happens to land: where the market is now, and where this
  // position stops losing. Both are marked, so neither has to be eyeballed
  // between two rows.
  const rungs = [-span, -span / 2, -span / 4, 0, span / 4, span / 2, span].map(f => spot * (1 + f));
  const rows = [...rungs, breakeven]
    .filter(s => s > 0)
    .sort((a, b) => b - a)
    .map(s => {
      const v = intrinsic(s, strike, right);
      return {
        s,
        v,
        perContract: v - cost,
        position: (v - cost) * size * 100,
        isSpot: Math.abs(s - spot) < 1e-9,
        isBreakeven: Math.abs(s - breakeven) < 1e-9,
      };
    });

  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-label uppercase tracking-widest text-textSecondary">Buyer&rsquo;s outcome at expiry</span>
      <div className="inst-surface rounded-md overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-borderSubtle">
              {['Underlying', 'Worth', 'Per contract', 'Position'].map((h, i) => (
                <th
                  key={h}
                  className={`px-3 py-1.5 font-mono text-micro uppercase tracking-widest text-textMuted ${
                    i === 0 ? 'text-left' : 'text-right'
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr
                key={r.s}
                className={`border-b border-borderSubtle/40 last:border-0 ${
                  r.isSpot ? 'bg-select/[0.05]' : r.isBreakeven ? 'bg-warn/[0.05]' : ''
                }`}
              >
                <td className="px-3 py-1 text-left font-mono text-caption tnum text-textPrimary">
                  ${r.s.toFixed(2)}
                  {r.isSpot && <span className="ml-1.5 text-micro uppercase tracking-wider text-select">spot</span>}
                  {r.isBreakeven && <span className="ml-1.5 text-micro uppercase tracking-wider text-warn">b/e</span>}
                </td>
                <td className="px-3 py-1 text-right font-mono text-caption tnum text-textSecondary">
                  ${r.v.toFixed(2)}
                </td>
                <td
                  className={`px-3 py-1 text-right font-mono text-caption tnum ${
                    r.perContract > 0 ? 'text-bull' : r.perContract < 0 ? 'text-bear' : 'text-textMuted'
                  }`}
                >
                  {r.perContract >= 0 ? '+' : '−'}${Math.abs(r.perContract).toFixed(2)}
                </td>
                <td
                  className={`px-3 py-1 text-right font-mono text-caption font-semibold tnum ${
                    r.position > 0 ? 'text-bull' : r.position < 0 ? 'text-bear' : 'text-textMuted'
                  }`}
                >
                  {r.position >= 0 ? '+' : '−'}
                  {fmtUsd(Math.abs(r.position))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-micro leading-relaxed text-textMuted">
        Intrinsic value at expiry against the premium printed, for the side that bought. It ignores everything between
        now and then — no time value, no volatility, no early exercise — so it is the floor case, not a projection.
      </p>
    </div>
  );
};

export default PayoffLadder;
