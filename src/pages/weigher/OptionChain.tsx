import { useMemo, useState } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import { buildChain, listExpiries, type ChainLeg, type ChainRow } from '../../data/optionChain';
import Panel from '../../components/ui/Panel';
import SegmentedControl from '../../components/ui/SegmentedControl';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import DataState from '../../components/ui/DataState';
import Term from '../../components/ui/Term';

/*
==================================================
  SLAYER TERMINAL - THE OPTION CHAIN
  (pages/weigher/OptionChain.tsx)
==================================================

  §3's screen. Calls on the left, puts on the right, strikes down the spine
  — the layout every options reader already knows, so nothing here has to be
  learned.

  EXPIRY IS A TAB BAR, and the tabs are the REAL listed board: today and the
  next four sessions, then Fridays, then the monthlies. Evenly-spaced dates
  would hide the thing the Expiry Ladder exists to ask — whether a wall is
  today's or structural — so the spacing is the listing's, not a range.

  THE SPINE CARRIES THE MONEY. Spot sits between two rows as a rule, the ATM
  strike is marked, and every ITM cell is tinted on its own side — so which
  half of the board is in the money is legible without reading a number.
  That tint is the ONE place this screen uses fill, which is why the greeks
  underneath can stay plain.

  GREEK COLUMNS ARE OPT-IN, in groups, because a chain with delta, gamma,
  theta, vega, vanna and charm on both sides is 26 columns and unreadable on
  a laptop. The default is what a reader looks at first — price, size,
  vol — and the greeks arrive when asked for. Density does the same job
  vertically.
*/

type Density = 'comfortable' | 'compact';
type GreekSet = 'none' | 'core' | 'all';

const fmt = (n: number, d = 2) => n.toFixed(d);
const fmtSize = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

const OptionChain = () => {
  const { activeTicker, marketData } = useMarketData();
  const expiries = useMemo(() => listExpiries(), []);
  const [expIdx, setExpIdx] = useState(0);
  const [density, setDensity] = useState<Density>('comfortable');
  const [greeks, setGreeks] = useState<GreekSet>('core');
  const [nearOnly, setNearOnly] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);

  const spot = marketData?.spot ?? 0;
  const baseIv = Simulator.TICKERS[activeTicker]?.iv ?? 0.2;

  const chain = useMemo(
    () => (spot > 0 ? buildChain(activeTicker, spot, baseIv, expiries[expIdx], 16) : null),
    [activeTicker, spot, baseIv, expiries, expIdx]
  );

  const rows = useMemo(() => {
    if (!chain) return [];
    if (!nearOnly) return chain.rows;
    /* "Near the money" is ±8 strikes, which is the window a reader actually
       trades and keeps the table on one screen. */
    const atIdx = chain.rows.findIndex(r => r.atm);
    return chain.rows.slice(Math.max(0, atIdx - 8), atIdx + 9);
  }, [chain, nearOnly]);

  if (!chain) {
    return (
      <Panel className="w-full">
        <DataState kind="loading" title="Building the chain" body="Waiting for a spot price to hang the strikes off." />
      </Panel>
    );
  }

  const pad = density === 'compact' ? 'py-0.5' : 'py-1.5';
  const showCore = greeks !== 'none';
  const showAll = greeks === 'all';

  /* One leg's cells. Rendered mirrored: the call side reads right-to-left
     toward the spine, which is how a chain is scanned. */
  const legCells = (leg: ChainLeg, side: 'call' | 'put') => {
    const tint = leg.itm ? (side === 'call' ? 'bg-bull/[0.06]' : 'bg-bear/[0.06]') : '';
    /* ORDERED OUTWARD FROM THE SPINE. A chain is read from the strike out:
       price first, then size, then vol, then the greeks. The call side
       reverses this whole array so both sides put bid/mark/ask against the
       strike column, which is the layout every options reader already has
       in their hands. */
    const cells = [
      <td key="bid" className={`px-2 ${pad} text-right font-mono text-[11px] text-bull/90 ${tint}`}>{fmt(leg.bid)}</td>,
      <td key="mark" className={`px-2 ${pad} text-right font-mono text-[11px] text-textPrimary font-semibold ${tint}`}>{fmt(leg.mark)}</td>,
      <td key="ask" className={`px-2 ${pad} text-right font-mono text-[11px] text-bear/90 ${tint}`}>{fmt(leg.ask)}</td>,
      <td key="last" className={`px-2 ${pad} text-right font-mono text-[11px] text-textMuted ${tint}`}>{fmt(leg.last)}</td>,
      <td key="oi" className={`px-2 ${pad} text-right font-mono text-[11px] text-textSecondary ${tint}`}>{fmtSize(leg.oi)}</td>,
      <td key="vol" className={`px-2 ${pad} text-right font-mono text-[11px] text-textMuted ${tint}`}>{fmtSize(leg.volume)}</td>,
      <td key="iv" className={`px-2 ${pad} text-right font-mono text-[11px] text-textSecondary ${tint}`}>{fmt(leg.iv, 1)}%</td>,
    ];
    if (showCore) {
      cells.push(
        <td key="d" className={`px-2 ${pad} text-right font-mono text-[11px] text-textSecondary ${tint}`}>{fmt(leg.delta, 3)}</td>,
        <td key="g" className={`px-2 ${pad} text-right font-mono text-[11px] text-textSecondary ${tint}`}>{fmt(leg.gamma, 4)}</td>,
        <td key="t" className={`px-2 ${pad} text-right font-mono text-[11px] text-textSecondary ${tint}`}>{fmt(leg.theta, 2)}</td>,
        <td key="v" className={`px-2 ${pad} text-right font-mono text-[11px] text-textSecondary ${tint}`}>{fmt(leg.vega, 3)}</td>
      );
    }
    if (showAll) {
      cells.push(
        <td key="vn" className={`px-2 ${pad} text-right font-mono text-[11px] text-textMuted ${tint}`}>{fmt(leg.vanna, 3)}</td>,
        <td key="ch" className={`px-2 ${pad} text-right font-mono text-[11px] text-textMuted ${tint}`}>{fmt(leg.charm, 4)}</td>
      );
    }
    return side === 'call' ? cells.reverse() : cells;
  };

  const headers = (side: 'call' | 'put') => {
    const h: { key: string; label: React.ReactNode }[] = [
      { key: 'bid', label: 'Bid' },
      { key: 'mark', label: 'Mark' },
      { key: 'ask', label: 'Ask' },
      { key: 'last', label: 'Last' },
      { key: 'oi', label: <Term k="Open interest">OI</Term> },
      { key: 'vol', label: <Term k="Volume">Vol</Term> },
      { key: 'iv', label: <Term k="IV">IV</Term> },
    ];
    if (showCore) h.push(
      { key: 'd', label: <Term k="Delta">Δ</Term> }, { key: 'g', label: <Term k="Gamma">Γ</Term> },
      { key: 't', label: <Term k="Theta">Θ</Term> }, { key: 'v', label: <Term k="Vega">V</Term> }
    );
    if (showAll) h.push({ key: 'vn', label: <Term k="Vanna">Vanna</Term> }, { key: 'ch', label: <Term k="Charm">Charm</Term> });
    return side === 'call' ? h.reverse() : h;
  };

  const cols = 1 + headers('call').length * 2;

  return (
    <div className="flex flex-col gap-3">
      {/* The board */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Expiry">
        {expiries.map((e, i) => (
          <button
            key={e.label}
            role="tab"
            aria-selected={i === expIdx}
            onClick={() => { setExpIdx(i); setSelected(null); }}
            className={`shrink-0 px-2.5 py-1 rounded font-mono text-[10px] uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
              i === expIdx ? 'bg-white/[0.07] text-textPrimary' : 'text-textMuted hover:text-textSecondary'
            }`}
          >
            {e.dte === 0 ? '0DTE' : `${e.dte}d`}
            <span className="ml-1.5 opacity-60">{e.weekday} {e.label.slice(0, 5)}</span>
          </button>
        ))}
      </div>

      <Panel
        title="Option chain"
        subtitle={`${activeTicker} · ${chain.expiry.weekday} ${chain.expiry.label} · ${chain.expiry.sessions} sessions · ATM IV ${chain.atmIv}%`}
        className="w-full"
        flush
        actions={
          <div className="flex items-center gap-2">
            <ProvenanceChip sources={['chain']} note="Strikes, spreads and the vol smile are modelled per expiry." />
            <SegmentedControl
              ariaLabel="Greeks"
              value={greeks}
              onChange={v => setGreeks(v as GreekSet)}
              options={[{ value: 'none', label: 'Price' }, { value: 'core', label: 'Greeks' }, { value: 'all', label: '+ Vanna/Charm' }]}
            />
            <SegmentedControl
              ariaLabel="Strike range"
              value={nearOnly ? 'near' : 'all'}
              onChange={v => setNearOnly(v === 'near')}
              options={[{ value: 'near', label: 'Near' }, { value: 'all', label: 'All' }]}
            />
            <SegmentedControl
              ariaLabel="Density"
              value={density}
              onChange={v => setDensity(v as Density)}
              options={[{ value: 'comfortable', label: 'Roomy' }, { value: 'compact', label: 'Dense' }]}
            />
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-inset z-10">
              <tr className="border-b border-borderSubtle">
                <th colSpan={headers('call').length} className="px-2 py-1 text-center font-mono text-[10px] uppercase tracking-widest text-bull/80">Calls</th>
                <th className="px-2 py-1 text-center font-mono text-[10px] uppercase tracking-widest text-textMuted border-x border-borderSubtle">Strike</th>
                <th colSpan={headers('put').length} className="px-2 py-1 text-center font-mono text-[10px] uppercase tracking-widest text-bear/80">Puts</th>
              </tr>
              <tr className="border-b border-borderSubtle">
                {headers('call').map(h => (
                  <th key={`c-${h.key}`} className="px-2 py-1 text-right font-mono text-[9px] uppercase tracking-wider text-textMuted">{h.label}</th>
                ))}
                <th className="px-2 py-1 text-center font-mono text-[9px] uppercase tracking-wider text-textMuted border-x border-borderSubtle">—</th>
                {headers('put').map(h => (
                  <th key={`p-${h.key}`} className="px-2 py-1 text-right font-mono text-[9px] uppercase tracking-wider text-textMuted">{h.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r: ChainRow) => {
                const sel = selected === r.strike;
                return (
                  <tr
                    key={r.strike}
                    onClick={() => setSelected(sel ? null : r.strike)}
                    className={`border-b border-borderSubtle/30 cursor-pointer transition-colors ${
                      sel ? 'bg-white/[0.06]' : r.atm ? 'bg-white/[0.03]' : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    {legCells(r.call, 'call')}
                    <td className={`px-2 ${pad} text-center font-mono text-[11px] border-x border-borderSubtle ${
                      r.atm ? 'text-textPrimary font-bold' : 'text-textSecondary'
                    }`}>
                      {r.strike}
                      {r.atm && <span className="ml-1 text-[8px] text-accent uppercase tracking-wider">atm</span>}
                    </td>
                    {legCells(r.put, 'put')}
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={cols}><DataState kind="empty" title="No strikes" body="This expiry has no strikes in the selected range." pad="sm" /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
};

export default OptionChain;
