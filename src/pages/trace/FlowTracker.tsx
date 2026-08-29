import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Trash2, X } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildContractFlow, type ContractRef } from '../../data/contractflow';
import { fmtUsd } from '../../data/gex';
import {
  clearWatch, followUp, getWatchedContracts, getWatchedPrints, printKey,
  setPrintNote, subscribeWatch, toggleContract, togglePrint,
  type WatchedContract, type WatchedPrint,
} from '../../data/flowWatch';
import { aggregateByContract, contractKey, stanceLabel } from '../../data/flowScanner';
import Panel from '../../components/ui/Panel';
import DataTable, { type Column } from '../../components/ui/DataTable';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import Term from '../../components/ui/Term';
import DataState from '../../components/ui/DataState';

/*
==================================================
  SLAYER TERMINAL - FLOW TRACKER (pages/trace/FlowTracker.tsx)

  TRK_01 · TRK_02 · TRK_03 — follow the whale.
==================================================

  THE WORKFLOW THIS PAGE IS: a reader sees a print on the tape they do not
  want to lose, bookmarks it, and comes back later to ask what happened to
  it. That question — "how did this age" — is the whole module, and it is
  why a bookmark stores the print WHOLE rather than by id: the tape scrolls,
  ids get reused, and a reference into a rolling buffer would rot in minutes.

  THE THREE MODULES ARE ONE FLOW, not three tables that happen to share a
  page. A bookmarked PRINT (TRK_01) is a frozen moment plus what came after
  it; a watched CONTRACT (TRK_02) is the thing that keeps accumulating; and
  selecting either opens the same DRILLDOWN (TRK_03). Clicking through is
  the point, so the selection is shared rather than per-panel.

  EMPTY IS A REAL STATE HERE, not an oversight. A reader arrives at this page
  with nothing saved, and the honest thing is to say what the page is for and
  where the bookmark control lives — a blank grid would read as broken.
*/

const useWatch = <T,>(read: () => T): T =>
  useSyncExternalStore(subscribeWatch, read, read);

const FlowTracker = () => {
  const { activeTicker, marketData, flowTape } = useMarketData();
  const prints = useWatch(getWatchedPrints);
  const contracts = useWatch(getWatchedContracts);
  const [selected, setSelected] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const spot = marketData?.spot ?? 0;
  const rollups = useMemo(() => aggregateByContract(flowTape), [flowTape]);

  /* Selecting a row in either table opens the same drilldown. When the saved
     list changes under the selection (a delete), drop it rather than leaving
     a drilldown pointing at nothing. */
  const known = useMemo(
    () => new Set([...contracts.map(c => c.key), ...prints.map(w => contractKey(w.print))]),
    [contracts, prints]
  );
  useEffect(() => {
    if (selected && !known.has(selected)) setSelected(null);
  }, [known, selected]);

  const drill = useMemo(() => {
    if (!selected) return null;
    const [ticker, strikeS, right] = selected.split('|');
    const roll = rollups.find(r => r.key === selected);
    const saved = prints.find(w => contractKey(w.print) === selected)?.print;
    const ref: ContractRef = {
      ticker,
      strike: Number(strikeS),
      right: right as 'C' | 'P',
      fill: roll?.avgFill ?? saved?.fill ?? 1,
      spot: spot || saved?.spot || Number(strikeS),
      size: roll?.totalSize ?? saved?.size ?? 100,
      side: (roll ? (roll.askPct >= roll.bidPct ? 'ASK' : 'BID') : saved?.side ?? 'MID') as ContractRef['side'],
      volume: roll?.volume ?? saved?.volume ?? 0,
      oi: roll?.oi ?? saved?.oi ?? 0,
      iv: roll?.iv ?? saved?.iv ?? 20,
      atMinute: 195,
    };
    return { ref, flow: buildContractFlow(ref) };
  }, [selected, rollups, prints, spot]);

  // ── TRK_01 ──────────────────────────────────────────────────────────────
  const printCols: Column<WatchedPrint>[] = [
    { key: 'time', header: 'Print', width: '150px', sortValue: w => w.print.time,
      render: w => (
        <span className="font-mono text-[11px]">
          <span className="text-textMuted">{w.print.time}</span>
          <span className="text-textPrimary ml-2">{w.print.strike}</span>
          <span className={w.print.right === 'C' ? 'text-bull' : 'text-bear'}>{w.print.right}</span>
        </span>
      ) },
    { key: 'prem', header: 'Premium', align: 'right', width: '92px', sortValue: w => w.print.premium,
      render: w => <span className="font-mono text-[11px] text-textPrimary">{fmtUsd(w.print.premium)}</span> },
    { key: 'fill', header: <Term k="Spread">Fill</Term>, align: 'right', width: '110px', sortValue: w => w.print.fillPos,
      render: w => (
        <span className="font-mono text-[11px] text-textSecondary">
          ${w.print.fill.toFixed(2)} <span className="text-textMuted">· {(w.print.fillPos * 100).toFixed(0)}%</span>
        </span>
      ) },
    { key: 'side', header: <Term k="Flow">Side</Term>, align: 'right', width: '66px', sortValue: w => w.print.side,
      render: w => (
        <span className={`font-mono text-[10px] uppercase ${w.print.side === 'ASK' ? 'text-bull' : w.print.side === 'BID' ? 'text-bear' : 'text-textMuted'}`}>
          {w.print.side}
        </span>
      ) },
    {
      key: 'since', header: 'Since bookmark', align: 'right', width: '190px',
      sortValue: w => followUp(w, flowTape).premiumSince,
      render: w => {
        const f = followUp(w, flowTape);
        if (f.printsSince === 0) return <span className="font-mono text-[11px] text-textMuted">— nothing since</span>;
        return (
          <span className="font-mono text-[11px] text-textSecondary">
            {f.printsSince} prints · {fmtUsd(f.premiumSince)}
            <span className={`ml-2 ${f.askPctSince >= 55 ? 'text-bull' : f.askPctSince <= 45 ? 'text-bear' : 'text-textMuted'}`}>
              {f.askPctSince.toFixed(0)}% ask
            </span>
          </span>
        );
      },
    },
    { key: 'note', header: 'Note', width: '150px',
      render: w => (
        noteFor === printKey(w.print) ? (
          <input
            autoFocus
            value={noteDraft}
            onChange={e => setNoteDraft(e.target.value)}
            onBlur={() => { setPrintNote(w.print, noteDraft); setNoteFor(null); }}
            onKeyDown={e => {
              if (e.key === 'Enter') { setPrintNote(w.print, noteDraft); setNoteFor(null); }
              if (e.key === 'Escape') { e.stopPropagation(); setNoteFor(null); }
            }}
            onClick={e => e.stopPropagation()}
            className="w-full bg-transparent border-b border-select/60 text-[11px] text-textPrimary focus:outline-none"
            placeholder="why this one…"
          />
        ) : (
          <button
            onClick={e => { e.stopPropagation(); setNoteFor(printKey(w.print)); setNoteDraft(w.note ?? ''); }}
            className="text-left text-[11px] text-textMuted hover:text-textPrimary truncate w-full focus:outline-none focus-visible:ring-1 focus-visible:ring-select rounded"
          >
            {w.note ?? '+ note'}
          </button>
        )
      ) },
    { key: 'rm', header: '', align: 'right', width: '36px',
      render: w => (
        <button
          aria-label="Remove bookmark"
          onClick={e => { e.stopPropagation(); togglePrint(w.print); }}
          className="text-textMuted hover:text-bear focus:outline-none focus-visible:ring-1 focus-visible:ring-select rounded p-0.5"
        >
          <X size={12} />
        </button>
      ) },
  ];

  // ── TRK_02 ──────────────────────────────────────────────────────────────
  const contractCols: Column<WatchedContract>[] = [
    { key: 'c', header: 'Contract', width: '160px', sortValue: c => c.strike,
      render: c => (
        <span className="font-mono text-[11px]">
          <span className="text-textPrimary">{c.ticker} {c.strike}</span>
          <span className={c.right === 'C' ? 'text-bull ml-1' : 'text-bear ml-1'}>{c.right}</span>
          <span className="text-textMuted ml-2">{c.expiry.slice(0, 5)}</span>
        </span>
      ) },
    { key: 'today', header: 'Today', align: 'right', width: '150px',
      sortValue: c => rollups.find(r => r.key === c.key)?.totalPremium ?? 0,
      render: c => {
        const r = rollups.find(x => x.key === c.key);
        if (!r) return <span className="font-mono text-[11px] text-textMuted">— quiet today</span>;
        return <span className="font-mono text-[11px] text-textSecondary">{r.prints} prints · {fmtUsd(r.totalPremium)}</span>;
      } },
    { key: 'voi', header: <Term k="V/OI">V/OI</Term>, align: 'right', width: '84px',
      sortValue: c => rollups.find(r => r.key === c.key)?.volOverOI ?? 0,
      render: c => {
        const r = rollups.find(x => x.key === c.key);
        return <span className="font-mono text-[11px] text-textSecondary">{r ? `${r.volOverOI.toFixed(2)}×` : '—'}</span>;
      } },
    { key: 'read', header: <Term k="Sentiment">Read</Term>, align: 'right', width: '120px',
      sortValue: c => rollups.find(r => r.key === c.key)?.score ?? 0,
      render: c => {
        const r = rollups.find(x => x.key === c.key);
        if (!r) return <span className="font-mono text-[10px] text-textMuted uppercase">no flow</span>;
        return (
          <span className={`font-mono text-[10px] uppercase tracking-wider ${
            r.decisiveness < 20 ? 'text-textMuted' : r.score >= 20 ? 'text-bull' : r.score <= -20 ? 'text-bear' : 'text-textSecondary'
          }`}>
            {stanceLabel(r.score, r.decisiveness)}
          </span>
        );
      } },
    { key: 'rm', header: '', align: 'right', width: '36px',
      render: c => (
        <button
          aria-label="Stop watching"
          onClick={e => { e.stopPropagation(); toggleContract(c); }}
          className="text-textMuted hover:text-bear focus:outline-none focus-visible:ring-1 focus-visible:ring-select rounded p-0.5"
        >
          <X size={12} />
        </button>
      ) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel
          title="Tracked Flow"
          subtitle={`TRK_01 · ${prints.length} bookmarked`}
          className="w-full"
          flush
          actions={prints.length > 0 && (
            <button
              onClick={() => clearWatch('prints')}
              className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-textMuted hover:text-bear focus:outline-none focus-visible:ring-1 focus-visible:ring-select rounded px-1"
            >
              <Trash2 size={11} /> Clear
            </button>
          )}
        >
          {prints.length === 0 ? (
            <DataState
              kind="empty"
              title="No prints bookmarked"
              body="Bookmark a print from the Live Tape and it lands here — with what the contract did after you saved it."
            />
          ) : (
            <DataTable
              columns={printCols}
              rows={prints}
              rowKey={w => printKey(w.print)}
              onRowClick={w => setSelected(s => (s === contractKey(w.print) ? null : contractKey(w.print)))}
              selectedKey={selected}
              maxHeight="300px"
              emptyText="No prints bookmarked."
            />
          )}
        </Panel>

        <Panel
          title="Tracked Contracts"
          subtitle={`TRK_02 · ${contracts.length} watched`}
          className="w-full"
          flush
          actions={
            <div className="flex items-center gap-2">
              {marketData && (
                <button
                  onClick={() => toggleContract({ ticker: activeTicker, strike: Math.round(spot), right: 'C', expiry: rollups[0]?.expiry ?? '—' })}
                  className="font-mono text-[10px] uppercase tracking-wider text-textMuted hover:text-textPrimary focus:outline-none focus-visible:ring-1 focus-visible:ring-select rounded px-1"
                >
                  + ATM call
                </button>
              )}
              {contracts.length > 0 && (
                <button
                  onClick={() => clearWatch('contracts')}
                  className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-textMuted hover:text-bear focus:outline-none focus-visible:ring-1 focus-visible:ring-select rounded px-1"
                >
                  <Trash2 size={11} /> Clear
                </button>
              )}
            </div>
          }
        >
          {contracts.length === 0 ? (
            <DataState
              kind="empty"
              title="No contracts watched"
              body="Watch a contract from the Scanner or the tape to follow its volume, open interest and side through the session."
            />
          ) : (
            <DataTable
              columns={contractCols}
              rows={contracts}
              rowKey={c => c.key}
              onRowClick={c => setSelected(s => (s === c.key ? null : c.key))}
              selectedKey={selected}
              maxHeight="300px"
              emptyText="No contracts watched."
            />
          )}
        </Panel>
      </div>

      {/* TRK_03 — one drilldown, opened from either table above */}
      <Panel
        title="Contract Drilldown"
        subtitle={drill ? `TRK_03 · ${drill.ref.ticker} ${drill.ref.strike}${drill.ref.right}` : 'TRK_03'}
        className="w-full"
      >
        {!drill ? (
          <DataState kind="empty" title="Nothing selected" body="Pick a bookmarked print or a watched contract above to open its session — flow, net premium and the vol/OI ledger." />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
              <StatCard label="Volume" value={drill.flow.stats.vol.toLocaleString()} sub={`${drill.flow.stats.volOverOi.toFixed(2)}× OI`} />
              <StatCard label="Open interest" value={drill.flow.stats.oi.toLocaleString()} sub="contracts outstanding" />
              <StatCard label="Avg price" value={`$${drill.flow.stats.avgPrice.toFixed(2)}`} sub="session mean fill" />
              <StatCard label="Premium" value={fmtUsd(drill.flow.stats.premium)} sub="contract total" />
              <StatCard label="Ask share" value={`${drill.flow.stats.askSharePct.toFixed(0)}%`} sub={`${drill.flow.stats.askCount} lifted / ${drill.flow.stats.bidCount} hit`}
                tone={drill.flow.stats.askSharePct >= 55 ? 'bull' : drill.flow.stats.askSharePct <= 45 ? 'bear' : 'neutral'} />
              <StatCard label="Net premium" value={fmtUsd(drill.flow.net.netPrem)} sub={`${drill.flow.net.bullishPct.toFixed(0)}% leaning bull`}
                tone={drill.flow.net.netPrem >= 0 ? 'bull' : 'bear'} />
              <StatCard label="Multi-leg" value={`${drill.flow.stats.multiPct.toFixed(0)}%`} sub="of contracts" />
              <StatCard label="OTM" value={`${drill.flow.stats.otmPct.toFixed(1)}%`} sub="from spot" />
            </div>

            <div>
              <h4 className="font-mono text-[10px] uppercase tracking-widest text-textMuted mb-2">Vol / OI ledger</h4>
              <MetricGrid min="150px">
                {drill.flow.history.slice(0, 8).map(d => (
                  <StatCard
                    key={d.date}
                    label={d.date}
                    value={d.vol.toLocaleString()}
                    sub={`OI ${d.oi.toLocaleString()} · ${d.oiChangePct >= 0 ? '+' : ''}${d.oiChangePct.toFixed(1)}% · IV ${d.iv.toFixed(1)}%`}
                    tone={d.oiChangePct > 0 ? 'bull' : d.oiChangePct < 0 ? 'bear' : 'neutral'}
                  />
                ))}
              </MetricGrid>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
};

export default FlowTracker;
