import { useMemo, useState, useSyncExternalStore } from 'react';
import { ImagePlus, Plus, Trash2, X } from 'lucide-react';
import {
  MIN_STATS_TRADES, addTrade, closeTrade, dailyPnl, equityCurve, getTrades,
  removeTrade, resultOf, statsOf, subscribeJournal, updateTrade,
  type JournalTrade,
} from '../data/journal';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import StatCard from '../components/ui/StatCard';
import MetricGrid from '../components/ui/MetricGrid';
import DataState from '../components/ui/DataState';
import DataTable, { type Column } from '../components/ui/DataTable';
import Modal from '../components/ui/Modal';
import ProvenanceChip from '../components/ui/ProvenanceChip';
import { BULL, PUT_WALL } from '../components/gex/palette';

/*
==================================================
  SLAYER TERMINAL - THE JOURNAL (pages/Journal.tsx)

  §18. What was taken, why, and how it went.
==================================================

  THE TRACKER WATCHES WHAT MIGHT HAPPEN; THIS RECORDS WHAT DID. They are
  different pages on purpose — a watchlist that quietly becomes a
  performance record is how a desk ends up unable to answer "how did last
  month actually go".

  THE THESIS IS WRITTEN AT ENTRY AND CANNOT BE EDITED. That is the whole
  discipline, and the store enforces it rather than the form: `updateTrade`
  has no way to carry a thesis. Hindsight gets its own field — REVIEW —
  written afterwards, so it has somewhere honest to go instead of quietly
  replacing what the trader actually believed at the time.

  EVERY NUMBER ON THIS PAGE IS COMPUTED FROM THE FILLS. There is no "P&L"
  input, because a typed result drifts from the fills inside a week. Entry,
  exit, size and side go in; dollars, percent, R and hold time come out.

  R IS THE HEADLINE, NOT DOLLARS. Dollars flatter whoever traded biggest; R
  is the only figure that compares a small loss on a small account to a large
  one on a large. It is blank without a stop recorded at entry, because an R
  with a denominator invented after the exit is the exact self-flattery a
  journal exists to prevent.
*/

const fmtUsd = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const EMPTY_FORM = {
  ticker: '', instrument: '', side: 'LONG' as const, size: '', entry: '', stop: '',
  thesis: '', setup: '', tags: '',
};

const Journal = () => {
  const trades = useSyncExternalStore(subscribeJournal, getTrades, getTrades);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [open, setOpen] = useState<JournalTrade | null>(null);
  const [closing, setClosing] = useState('');

  const stats = useMemo(() => statsOf(trades), [trades]);
  const days = useMemo(() => dailyPnl(trades), [trades]);
  const curve = useMemo(() => equityCurve(days), [days]);

  const submit = () => {
    const size = Number(form.size), entry = Number(form.entry);
    if (!form.ticker || !Number.isFinite(size) || size <= 0 || !Number.isFinite(entry)) return;
    addTrade({
      openedAt: new Date().toISOString(), closedAt: null,
      ticker: form.ticker.toUpperCase(),
      instrument: form.instrument || `${form.ticker.toUpperCase()} shares`,
      side: form.side, size, entry, exit: null,
      stop: form.stop === '' ? null : Number(form.stop),
      thesis: form.thesis, review: '', setup: form.setup,
      tags: form.tags.split(',').map(s => s.trim()).filter(Boolean),
      shots: [],
    });
    setForm({ ...EMPTY_FORM });
    setAdding(false);
  };

  const cols: Column<JournalTrade>[] = [
    { key: 'when', header: 'Opened', width: '130px', sortValue: t => t.openedAt,
      render: t => <span className="font-mono text-[11px] text-textMuted">{t.openedAt.slice(5, 16).replace('T', ' ')}</span> },
    { key: 'what', header: 'Instrument', width: '190px', sortValue: t => t.instrument,
      render: t => (
        <span className="font-mono text-[11px]">
          <span className="text-textPrimary">{t.ticker}</span>
          <span className="text-textMuted ml-2">{t.instrument}</span>
        </span>
      ) },
    { key: 'side', header: 'Side', width: '70px', sortValue: t => t.side,
      render: t => <span className={`font-mono text-[10px] uppercase ${t.side === 'LONG' ? 'text-bull' : 'text-bear'}`}>{t.side}</span> },
    { key: 'in', header: 'In / Out', align: 'right', width: '120px', sortValue: t => t.entry,
      render: t => (
        <span className="font-mono text-[11px] text-textSecondary">
          {t.entry} <span className="text-textMuted">→</span> {t.exit ?? <span className="text-textMuted">open</span>}
        </span>
      ) },
    { key: 'pnl', header: 'P&L', align: 'right', width: '110px',
      sortValue: t => resultOf(t).pnl ?? -Infinity,
      render: t => {
        const r = resultOf(t);
        if (r.pnl === null) return <span className="font-mono text-[11px] text-textMuted">—</span>;
        return <span className={`font-mono text-[11px] ${r.pnl >= 0 ? 'text-bull' : 'text-bear'}`}>{fmtUsd(r.pnl)}</span>;
      } },
    { key: 'r', header: 'R', align: 'right', width: '80px',
      sortValue: t => resultOf(t).r ?? -Infinity,
      render: t => {
        const r = resultOf(t).r;
        if (r === null) return <span className="font-mono text-[11px] text-textMuted">—</span>;
        return <span className={`font-mono text-[11px] ${r >= 0 ? 'text-bull' : 'text-bear'}`}>{r >= 0 ? '+' : ''}{r.toFixed(2)}R</span>;
      } },
    { key: 'setup', header: 'Setup', width: '140px', sortValue: t => t.setup,
      render: t => <span className="text-[11px] text-textMuted truncate">{t.setup || '—'}</span> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={['Terminal', 'Journal']}
        title="Journal"
        subtitle="What was taken, why, and how it went"
        actions={
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-borderSubtle font-mono text-[10px] uppercase tracking-wider text-textSecondary hover:text-textPrimary focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          >
            <Plus size={11} /> Log a trade
          </button>
        }
      />

      <MetricGrid min="150px">
        <StatCard label="Net P&L" value={fmtUsd(stats.netPnl)} sub={`${stats.closed} closed · ${stats.open} open`}
          tone={stats.netPnl > 0 ? 'bull' : stats.netPnl < 0 ? 'bear' : 'neutral'} />
        <StatCard
          label="Win rate"
          value={stats.winRate === null ? '—' : `${stats.winRate.toFixed(0)}%`}
          sub={stats.winRate === null ? `needs ${MIN_STATS_TRADES} closed trades` : `${stats.wins}W / ${stats.losses}L`}
        />
        <StatCard label="Average R" value={stats.avgR === null ? '—' : `${stats.avgR >= 0 ? '+' : ''}${stats.avgR.toFixed(2)}R`}
          sub={stats.avgR === null ? 'no stops recorded yet' : `best ${stats.bestR?.toFixed(1)} · worst ${stats.worstR?.toFixed(1)}`}
          tone={stats.avgR === null ? 'neutral' : stats.avgR >= 0 ? 'bull' : 'bear'} />
        <StatCard label="Profit factor" value={stats.profitFactor === null ? '—' : stats.profitFactor.toFixed(2)}
          sub={stats.profitFactor === null ? 'nothing has lost yet' : `${fmtUsd(stats.grossWin)} won / ${fmtUsd(stats.grossLoss)} lost`} />
        <StatCard label="Trades" value={String(stats.trades)} sub="logged in this browser" />
      </MetricGrid>

      {/* The equity curve */}
      <Panel title="Equity" subtitle={`${days.length} trading day${days.length === 1 ? '' : 's'} with a close`} className="w-full"
        actions={<ProvenanceChip sources={['tape']} kind="measured" note="Your own recorded fills — the one surface here that is not modelled." />}>
        {curve.length === 0 ? (
          <DataState kind="empty" title="No closed trades yet" body="Log a trade and close it, and the curve starts here." pad="sm" />
        ) : (
          <div className="h-40 border border-borderSubtle rounded bg-inset/40 p-2">
            <svg viewBox={`0 0 ${Math.max(curve.length - 1, 1)} 100`} preserveAspectRatio="none" className="w-full h-full" role="img" aria-label="Equity curve">
              {(() => {
                const vals = curve.map(c => c.equity);
                const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
                const span = hi - lo || 1;
                const y = (v: number) => 100 - ((v - lo) / span) * 100;
                return (
                  <>
                    <line x1="0" x2={Math.max(curve.length - 1, 1)} y1={y(0)} y2={y(0)} stroke="#7d7d7d" strokeWidth="0.3" strokeDasharray="2 2" />
                    <polyline fill="none" stroke={vals[vals.length - 1] >= 0 ? BULL : PUT_WALL} strokeWidth="0.8"
                      points={curve.map((c, i) => `${i},${y(c.equity)}`).join(' ')} />
                  </>
                );
              })()}
            </svg>
          </div>
        )}
      </Panel>

      <Panel title="Trades" subtitle={`${trades.length} logged`} className="w-full" flush>
        {trades.length === 0 ? (
          <DataState
            kind="empty"
            title="The journal is empty"
            body="Log a trade with its thesis at entry. The thesis is frozen once written — hindsight goes in the review field afterwards."
          />
        ) : (
          <DataTable columns={cols} rows={trades} rowKey={t => t.id}
            onRowClick={t => { setOpen(t); setClosing(''); }} selectedKey={open?.id ?? null}
            initialSort={{ key: 'when', dir: 'desc' }} maxHeight="440px" emptyText="No trades logged." />
        )}
      </Panel>

      {/* Log a trade */}
      {adding && (
        <Modal open onClose={() => setAdding(false)} ariaLabel="Log a trade" header="Log a trade">
          <div className="grid grid-cols-2 gap-3 min-w-[420px]">
            {([
              ['ticker', 'Ticker', 'SPY'], ['instrument', 'Instrument', 'SPY 500C 09/19'],
              ['size', 'Size', '2'], ['entry', 'Entry', '3.00'], ['stop', 'Stop (for R)', '2.50'],
              ['setup', 'Setup', 'flip reclaim'],
            ] as const).map(([k, label, ph]) => (
              <label key={k} className="flex flex-col gap-1">
                <span className="font-mono text-[9px] uppercase tracking-wider text-textMuted">{label}</span>
                <input
                  value={form[k]} placeholder={ph}
                  onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                  className="bg-inset border border-borderSubtle rounded px-2 py-1 text-[12px] text-textPrimary focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                />
              </label>
            ))}
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[9px] uppercase tracking-wider text-textMuted">Side</span>
              <select value={form.side} onChange={e => setForm(f => ({ ...f, side: e.target.value as 'LONG' }))}
                className="bg-inset border border-borderSubtle rounded px-2 py-1 text-[12px] text-textPrimary focus:outline-none focus-visible:ring-1 focus-visible:ring-accent">
                <option value="LONG">LONG</option><option value="SHORT">SHORT</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[9px] uppercase tracking-wider text-textMuted">Tags (comma separated)</span>
              <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="0dte, gamma"
                className="bg-inset border border-borderSubtle rounded px-2 py-1 text-[12px] text-textPrimary focus:outline-none focus-visible:ring-1 focus-visible:ring-accent" />
            </label>
            <label className="col-span-2 flex flex-col gap-1">
              <span className="font-mono text-[9px] uppercase tracking-wider text-textMuted">Thesis — written now, frozen after</span>
              <textarea value={form.thesis} onChange={e => setForm(f => ({ ...f, thesis: e.target.value }))} rows={3}
                placeholder="Why this trade, before you know how it goes."
                className="bg-inset border border-borderSubtle rounded px-2 py-1 text-[12px] text-textPrimary focus:outline-none focus-visible:ring-1 focus-visible:ring-accent" />
            </label>
            <div className="col-span-2 flex justify-end gap-2">
              <button onClick={() => setAdding(false)} className="px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-textMuted hover:text-textSecondary focus:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded">Cancel</button>
              <button onClick={submit} className="px-3 py-1 rounded border border-select/50 text-select font-mono text-[10px] uppercase tracking-wider hover:bg-select/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent">Log it</button>
            </div>
          </div>
        </Modal>
      )}

      {/* The detail drawer */}
      {open && (() => {
        const r = resultOf(open);
        return (
          <Modal open onClose={() => setOpen(null)} ariaLabel="Trade detail" header={`${open.ticker} · ${open.instrument}`}>
            <div className="flex flex-col gap-3 min-w-[420px] max-w-[560px]">
              <MetricGrid min="120px">
                <StatCard label="Side / size" value={`${open.side} ${open.size}`} sub={`entry ${open.entry}`} />
                <StatCard label="P&L" value={r.pnl === null ? '—' : fmtUsd(r.pnl)} sub={r.pnl === null ? 'still open' : `${r.pnlPct?.toFixed(1)}%`}
                  tone={r.pnl === null ? 'neutral' : r.pnl >= 0 ? 'bull' : 'bear'} />
                <StatCard label="R" value={r.r === null ? '—' : `${r.r >= 0 ? '+' : ''}${r.r.toFixed(2)}R`}
                  sub={open.stop === null ? 'no stop recorded' : `stop ${open.stop}`} />
                <StatCard label="Held" value={r.heldMin === null ? '—' : `${Math.floor(r.heldMin / 60)}h ${r.heldMin % 60}m`} sub={r.status.toLowerCase()} />
              </MetricGrid>

              <div>
                <div className="font-mono text-[9px] uppercase tracking-wider text-textMuted">Thesis · written at entry, frozen</div>
                <p className="text-[12px] text-textSecondary leading-snug mt-1">{open.thesis || <span className="text-textMuted">Nothing written.</span>}</p>
              </div>

              <label className="flex flex-col gap-1">
                <span className="font-mono text-[9px] uppercase tracking-wider text-textMuted">Review · hindsight goes here</span>
                <textarea
                  value={open.review} rows={3}
                  onChange={e => { updateTrade(open.id, { review: e.target.value }); setOpen({ ...open, review: e.target.value }); }}
                  placeholder="What actually happened, and what you would do again."
                  className="bg-inset border border-borderSubtle rounded px-2 py-1 text-[12px] text-textPrimary focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                />
              </label>

              {open.tags.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {open.tags.map(t => (
                    <span key={t} className="px-1.5 py-0.5 rounded border border-borderSubtle font-mono text-[9px] uppercase tracking-wider text-textMuted">{t}</span>
                  ))}
                </div>
              )}

              {/* Screenshots — pasted, held locally */}
              <div className="flex items-center gap-2 flex-wrap">
                {open.shots.map((s, i) => (
                  <span key={i} className="relative">
                    <img src={s} alt="" className="h-16 rounded border border-borderSubtle" />
                    <button
                      aria-label="Remove screenshot"
                      onClick={() => { const next = open.shots.filter((_, j) => j !== i); updateTrade(open.id, { shots: next }); setOpen({ ...open, shots: next }); }}
                      className="absolute -top-1 -right-1 bg-panel border border-borderSubtle rounded-full p-0.5 text-textMuted hover:text-bear"
                    ><X size={9} /></button>
                  </span>
                ))}
                <label className="inline-flex items-center gap-1 px-2 py-1 rounded border border-dashed border-borderSubtle font-mono text-[9px] uppercase tracking-wider text-textMuted hover:text-textSecondary cursor-pointer">
                  <ImagePlus size={11} /> Add screenshot
                  <input
                    type="file" accept="image/*" className="sr-only"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        const next = [...open.shots, String(reader.result)];
                        updateTrade(open.id, { shots: next });
                        setOpen({ ...open, shots: next });
                      };
                      reader.readAsDataURL(f);
                    }}
                  />
                </label>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-borderSubtle pt-3">
                {r.status === 'OPEN' ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={closing} onChange={e => setClosing(e.target.value)} placeholder="exit price"
                      className="w-28 bg-inset border border-borderSubtle rounded px-2 py-1 text-[12px] text-textPrimary focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                    />
                    <button
                      onClick={() => { const v = Number(closing); if (Number.isFinite(v)) { closeTrade(open.id, v); setOpen(null); } }}
                      className="px-3 py-1 rounded border border-select/50 text-select font-mono text-[10px] uppercase tracking-wider hover:bg-select/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                    >Close trade</button>
                  </div>
                ) : <span className="font-mono text-[10px] text-textMuted uppercase tracking-wider">Closed {open.closedAt?.slice(0, 16).replace('T', ' ')}</span>}
                <button
                  onClick={() => { removeTrade(open.id); setOpen(null); }}
                  className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-textMuted hover:text-bear focus:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded"
                ><Trash2 size={11} /> Delete</button>
              </div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
};

export default Journal;
