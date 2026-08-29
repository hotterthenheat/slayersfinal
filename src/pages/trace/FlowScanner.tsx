import { useMemo, useState } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import { aggregateByContract, chainStance, stanceLabel, type ContractRollup } from '../../data/flowScanner';
import { buildSessionTape, recentSessions } from '../../data/sessionTape';
import { fmtUsd } from '../../data/gex';
import Panel from '../../components/ui/Panel';
import DataTable, { type Column } from '../../components/ui/DataTable';
import StatCard from '../../components/ui/StatCard';
import SegmentedControl from '../../components/ui/SegmentedControl';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import Term from '../../components/ui/Term';

/*
==================================================
  SLAYER TERMINAL - FLOW SCANNER (pages/trace/FlowScanner.tsx)

  SCAN_01 · SCAN_02 · SCAN_03 — the three modules
  this page used to only describe.
==================================================

  THE TAPE ANSWERS "what just printed". THIS ANSWERS "what has been printing
  all day, and on which side" — the same prints, grouped by the contract they
  belong to, which is the unit a reader actually trades.

  ONE ENGINE FOR ALL THREE MODULES. The rollup, the score and the words all
  come from data/flowScanner.ts, which is proven against staged tapes where
  every number is computable by hand (scripts/flow-scanner-proof.ts). The
  session picker swaps the INPUT — today's live accumulation, or a replayed
  afternoon — and nothing else on the page changes, which is exactly what a
  real backfill will do later.

  THE SCORE SAYS WHEN IT DOESN'T KNOW. `decisiveness` is drawn beside every
  score because a contract that traded ten million dollars entirely on the
  mid is not neutral — it is UNREADABLE, and those are different facts. A bar
  at zero with "NO SIDE" written on it is the honest rendering.
*/

const SCORE_TONE = (score: number, decisive: number): string => {
  if (decisive < 20) return 'text-textMuted';
  if (score >= 20) return 'text-bull';
  if (score <= -20) return 'text-bear';
  return 'text-textSecondary';
};

/** A signed score as a centred bar — length is conviction, side is direction. */
const ScoreBar = ({ score, decisive }: { score: number; decisive: number }) => {
  const w = Math.min(50, (Math.abs(score) / 100) * 50 * (decisive / 100));
  const muted = decisive < 20;
  return (
    <div className="relative h-3 w-[92px] bg-white/[0.03] rounded-sm overflow-hidden" aria-hidden>
      <div className="absolute inset-y-0 left-1/2 w-px bg-borderSubtle" />
      <div
        className={`absolute inset-y-[3px] rounded-[1px] ${
          muted ? 'bg-white/15' : score >= 0 ? 'bg-bull/80' : 'bg-bear/80'
        }`}
        style={score >= 0 ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }}
      />
    </div>
  );
};

const FlowScanner = () => {
  const { activeTicker, marketData, flowTape } = useMarketData();
  const sessions = useMemo(() => recentSessions(8), []);
  /** '' = today's live accumulation; otherwise a replayed session. */
  const [session, setSession] = useState('');
  const [rightFilter, setRightFilter] = useState<'ALL' | 'C' | 'P'>('ALL');
  const [selected, setSelected] = useState<string | null>(null);

  const spot = marketData?.spot ?? 0;

  /* SCAN_03 — the picker swaps the INPUT, nothing else. */
  const prints = useMemo(() => {
    if (!session) return flowTape;
    return spot > 0 ? buildSessionTape(activeTicker, session, spot) : [];
  }, [session, flowTape, activeTicker, spot]);

  const rollups = useMemo(() => aggregateByContract(prints), [prints]);
  const rows = useMemo(
    () => (rightFilter === 'ALL' ? rollups : rollups.filter(r => r.right === rightFilter)),
    [rollups, rightFilter]
  );
  const stance = useMemo(() => chainStance(rollups, activeTicker), [rollups, activeTicker]);

  const columns: Column<ContractRollup>[] = [
    {
      key: 'contract', header: 'Contract', width: '150px',
      sortValue: r => r.strike,
      render: r => (
        <span className="font-mono text-[11px]">
          <span className="text-textPrimary">{r.strike}</span>
          <span className={r.right === 'C' ? 'text-bull ml-1' : 'text-bear ml-1'}>{r.right}</span>
          <span className="text-textMuted ml-2">{r.expiry.slice(0, 5)}</span>
          <span className="text-textMuted ml-1">· {r.dte}d</span>
        </span>
      ),
    },
    { key: 'last', header: 'Last', align: 'right', width: '74px', sortValue: r => r.lastTime,
      render: r => <span className="font-mono text-[11px] text-textMuted">{r.lastTime}</span> },
    { key: 'prints', header: 'Prints', align: 'right', width: '62px', sortValue: r => r.prints,
      render: r => <span className="font-mono text-[11px] text-textSecondary">{r.prints}</span> },
    { key: 'avgFill', header: <Term k="Prem">Avg fill</Term>, align: 'right', width: '76px', sortValue: r => r.avgFill,
      render: r => <span className="font-mono text-[11px] text-textSecondary">${r.avgFill.toFixed(2)}</span> },
    { key: 'premium', header: 'Premium', align: 'right', width: '92px', sortValue: r => r.totalPremium,
      render: r => <span className="font-mono text-[11px] text-textPrimary">{fmtUsd(r.totalPremium)}</span> },
    { key: 'volume', header: <Term k="Volume">Vol</Term>, align: 'right', width: '80px', sortValue: r => r.volume,
      render: r => <span className="font-mono text-[11px] text-textSecondary">{r.volume.toLocaleString()}</span> },
    { key: 'oi', header: <Term k="Open interest">OI</Term>, align: 'right', width: '80px', sortValue: r => r.oi,
      render: r => <span className="font-mono text-[11px] text-textSecondary">{r.oi.toLocaleString()}</span> },
    { key: 'doi', header: <Term k="ΔOI">ΔOI</Term>, align: 'right', width: '76px', sortValue: r => r.deltaOI,
      render: r => (
        <span className={`font-mono text-[11px] ${r.deltaOI > 0 ? 'text-bull' : r.deltaOI < 0 ? 'text-bear' : 'text-textMuted'}`}>
          {r.deltaOI > 0 ? '▲' : r.deltaOI < 0 ? '▼' : '·'} {Math.abs(r.deltaOI).toLocaleString()}
        </span>
      ) },
    { key: 'voi', header: <Term k="V/OI">V/OI</Term>, align: 'right', width: '64px', sortValue: r => r.volOverOI,
      render: r => <span className="font-mono text-[11px] text-textSecondary">{r.volOverOI.toFixed(2)}×</span> },
    { key: 'iv', header: <Term k="IV">IV</Term>, align: 'right', width: '62px', sortValue: r => r.iv,
      render: r => <span className="font-mono text-[11px] text-textSecondary">{r.iv.toFixed(1)}%</span> },
    {
      key: 'score', header: <Term k="Sentiment">Side</Term>, align: 'right', width: '190px',
      sortValue: r => r.score,
      render: r => (
        <div className="flex items-center justify-end gap-2">
          <span className={`font-mono text-[10px] uppercase tracking-wider ${SCORE_TONE(r.score, r.decisiveness)}`}>
            {stanceLabel(r.score, r.decisiveness)}
          </span>
          <ScoreBar score={r.score} decisive={r.decisiveness} />
        </div>
      ),
    },
  ];

  const sel = rows.find(r => r.key === selected) ?? null;

  return (
    <div className="flex flex-col gap-4">
      {/* SCAN_02 — the chain's own stance, above the contracts that make it */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <StatCard
          label={`${activeTicker} stance`}
          value={stanceLabel(stance.score, stance.decisiveness)}
          sub={`${stance.score >= 0 ? '+' : '−'}${Math.abs(stance.score).toFixed(0)} · ${stance.decisiveness.toFixed(0)}% of dollars took a side`}
          tone={stance.decisiveness < 20 ? 'neutral' : stance.score >= 20 ? 'bull' : stance.score <= -20 ? 'bear' : 'neutral'}
        />
        <StatCard label="Call premium" value={fmtUsd(stance.callPremium)} sub={`${stance.contracts} contracts on the tape`} />
        <StatCard label="Put premium" value={fmtUsd(stance.putPremium)} sub="same session, put side" />
        <StatCard label="Total premium" value={fmtUsd(stance.totalPremium)} sub={session ? `replayed ${session}` : 'today, from the tape'} />
      </div>

      <Panel
        title="Contract Aggregation"
        subtitle={`SCAN_01 · ${rows.length} contracts${session ? ` · replay ${session}` : ' · live'}`}
        className="w-full"
        actions={
          <div className="flex items-center gap-2">
            <ProvenanceChip
              sources={['tape', 'prints']}
              state={session ? 'stale' : 'ok'}
              note={session ? 'A replayed session, regenerated deterministically — not a recording of that day.' : undefined}
            />
            <SegmentedControl
              value={rightFilter}
              onChange={v => setRightFilter(v as 'ALL' | 'C' | 'P')}
              options={[{ value: 'ALL', label: 'All' }, { value: 'C', label: 'Calls' }, { value: 'P', label: 'Puts' }]}
            />
            {/* SCAN_03 — session replay */}
            <select
              aria-label="Session"
              value={session}
              onChange={e => { setSession(e.target.value); setSelected(null); }}
              className="bg-transparent border border-borderSubtle rounded px-2 py-1 font-mono text-[10px] text-textSecondary uppercase tracking-wider focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              <option value="">Today · live</option>
              {sessions.slice(1).map(d => <option key={d} value={d}>Replay {d}</option>)}
            </select>
          </div>
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={r => r.key}
          onRowClick={r => setSelected(r.key === selected ? null : r.key)}
          selectedKey={selected}
          initialSort={{ key: 'premium', dir: 'desc' }}
          maxHeight="460px"
          emptyText={session ? 'No prints in this replayed session.' : 'Waiting for the tape to accumulate prints…'}
        />
      </Panel>

      {sel && (
        <Panel title="Selected contract" subtitle={`${sel.ticker} ${sel.strike}${sel.right} · ${sel.expiry}`} className="w-full">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            <StatCard label="Premium" value={fmtUsd(sel.totalPremium)} sub={`${sel.prints} prints`} />
            <StatCard label="Avg fill" value={`$${sel.avgFill.toFixed(2)}`} sub={`${sel.totalSize.toLocaleString()} contracts`} />
            <StatCard label="At ask" value={`${sel.askPct.toFixed(0)}%`} sub="premium share" tone="bull" />
            <StatCard label="At bid" value={`${sel.bidPct.toFixed(0)}%`} sub="premium share" tone="bear" />
            <StatCard label="At mid" value={`${sel.midPct.toFixed(0)}%`} sub="took no side" />
            <StatCard label="Sweeps" value={String(sel.sweeps)} sub={`${sel.multiLeg} multi-leg`} />
            <StatCard
              label="Read"
              value={stanceLabel(sel.score, sel.decisiveness)}
              sub={`${sel.decisiveness.toFixed(0)}% decisive`}
              tone={sel.decisiveness < 20 ? 'neutral' : sel.score >= 20 ? 'bull' : sel.score <= -20 ? 'bear' : 'neutral'}
            />
          </div>
        </Panel>
      )}
    </div>
  );
};

export default FlowScanner;
