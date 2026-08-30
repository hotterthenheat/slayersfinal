import { useMemo, useState } from 'react';
import { Bell, BellOff, MessageSquare, Smartphone, Trash2, RotateCcw } from 'lucide-react';
import { useMarketData } from '../context/MarketDataContext';
import {
  alertLabel, clearAlerts, removeAlert, rearmAlert, useAlerts, type Alert,
} from '../components/gex/alertStore';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import StatCard from '../components/ui/StatCard';
import MetricGrid from '../components/ui/MetricGrid';
import DataState from '../components/ui/DataState';
import DataTable, { type Column } from '../components/ui/DataTable';
import AlertsMenu from '../components/gex/AlertsMenu';
import ProvenanceChip from '../components/ui/ProvenanceChip';

/*
==================================================
  SLAYER TERMINAL - ALERTS (pages/Alerts.tsx)

  §17. The rail had a menu; this is the desk.
==================================================

  THE MENU ARMS THEM, THIS PAGE ANSWERS FOR THEM. A dropdown on a chart
  toolbar is the right place to arm an alert on the level you are looking
  at; it is the wrong place to see everything you have armed across every
  ticker, what has already fired, and what happened next.

  ARMED AND FIRED ARE TWO LISTS, not one list with a flag. A reader scanning
  for "what is still watching" and one asking "what went off while I was
  away" are asking different questions, and merging them makes both harder.
  A fired alert keeps its row — with the option to re-arm — because deleting
  it on trigger destroys exactly the history this page exists to show.

  DESTINATIONS ARE DISABLED AND SAY WHY. Discord and phone delivery need a
  server that outlives the tab, and there isn't one. The controls are drawn
  and disabled with the reason on them rather than hidden, because a reader
  should be able to see what the product intends to do next — and a toggle
  that looks live but silently does nothing is the failure this whole desk
  argues against.

  ALERTS ONLY FIRE WHILE THE TAB IS OPEN, and the page says so at the top.
  That is the single most important caveat about this feature and it belongs
  where it cannot be missed.
*/

const KIND_WORDS: Record<string, string> = {
  price: 'Price', level: 'Level', indicator: 'Indicator',
  gexFlip: 'Gamma flip', newKing: 'New supreme', wallMove: 'Wall move', flow: 'Flow',
};

const Alerts = () => {
  const { activeTicker, marketData } = useMarketData();
  const alerts = useAlerts(activeTicker);
  const [tab, setTab] = useState<'armed' | 'fired'>('armed');

  const armed = useMemo(() => alerts.filter(a => a.firedAt === 0), [alerts]);
  const fired = useMemo(() => alerts.filter(a => a.firedAt > 0).sort((a, b) => b.firedAt - a.firedAt), [alerts]);
  const rows = tab === 'armed' ? armed : fired;

  const cols: Column<Alert>[] = [
    { key: 'kind', header: 'Type', width: '120px', sortValue: a => a.kind,
      render: a => <span className="font-mono text-[10px] uppercase tracking-wider text-textMuted">{KIND_WORDS[a.kind] ?? a.kind}</span> },
    { key: 'what', header: 'Condition', sortValue: a => alertLabel(a),
      render: a => <span className="text-[11px] text-textSecondary">{alertLabel(a)}</span> },
    /* Only the FIRED tab gets a timestamp. `armedAt` exists on one alert
       kind, not on the base, so an "armed at" column would be blank for
       most rows — and a blank column that looks like a missing value is
       worse than a column that is not there. */
    { key: 'when', header: 'Fired', align: 'right', width: '150px',
      sortValue: a => a.firedAt,
      render: a => (
        <span className="font-mono text-[11px] text-textMuted">
          {a.firedAt > 0
            ? new Date(a.firedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
            : <span className="text-textMuted">watching</span>}
        </span>
      ) },
    { key: 'act', header: '', align: 'right', width: '110px',
      render: a => (
        <div className="flex items-center justify-end gap-1">
          {a.firedAt > 0 && marketData && (
            <button
              aria-label="Re-arm"
              onClick={e => { e.stopPropagation(); rearmAlert(activeTicker, a.id, marketData.spot, Date.now()); }}
              className="p-1 rounded text-textMuted hover:text-textPrimary focus:outline-none focus-visible:ring-1 focus-visible:ring-select"
            ><RotateCcw size={12} /></button>
          )}
          <button
            aria-label="Delete alert"
            onClick={e => { e.stopPropagation(); removeAlert(activeTicker, a.id); }}
            className="p-1 rounded text-textMuted hover:text-bear focus:outline-none focus-visible:ring-1 focus-visible:ring-select"
          ><Trash2 size={12} /></button>
        </div>
      ) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={['Terminal', 'Alerts']}
        title="Alerts"
        subtitle={`Everything armed on ${activeTicker}, and everything that has fired`}
        actions={marketData ? <AlertsMenu ticker={activeTicker} spot={marketData.spot} tf="15m" /> : undefined}
      />

      {/* The caveat that matters most, where it cannot be missed */}
      <div className="flex items-start gap-2 border border-warn/30 bg-warn/[0.05] rounded-md px-3 py-2">
        <BellOff size={14} className="text-warn mt-0.5 shrink-0" />
        <p className="text-[11px] text-textSecondary leading-snug">
          <span className="text-warn font-semibold">Alerts fire only while this tab is open.</span>{' '}
          Evaluation runs in the browser against the live tape — close the tab and nothing is watching.
          Delivery that outlives the session needs a server, which this build does not have.
        </p>
      </div>

      <MetricGrid min="150px">
        <StatCard label="Armed" value={String(armed.length)} sub={`on ${activeTicker}`} tone={armed.length > 0 ? 'select' : 'neutral'} />
        <StatCard label="Fired" value={String(fired.length)} sub="kept, so the history survives" />
        <StatCard label="Spot" value={marketData ? `$${marketData.spot.toFixed(2)}` : '—'} sub="what conditions are measured against" />
      </MetricGrid>

      <Panel
        title="Alert list"
        subtitle={`${rows.length} ${tab}`}
        className="w-full"
        flush
        actions={
          <div className="flex items-center gap-2">
            <ProvenanceChip sources={['tape']} kind="derived" note="Conditions are evaluated here against the simulated tape." />
            <div className="inline-flex rounded border border-borderSubtle overflow-hidden" role="tablist" aria-label="Alert state">
              {(['armed', 'fired'] as const).map(t => (
                <button
                  key={t} role="tab" aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-select ${
                    tab === t ? 'bg-white/[0.07] text-textPrimary' : 'text-textMuted hover:text-textSecondary'
                  }`}
                >{t} · {t === 'armed' ? armed.length : fired.length}</button>
              ))}
            </div>
            {rows.length > 0 && (
              <button
                onClick={() => clearAlerts(activeTicker)}
                className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-textMuted hover:text-bear focus:outline-none focus-visible:ring-1 focus-visible:ring-select rounded px-1"
              ><Trash2 size={11} /> Clear</button>
            )}
          </div>
        }
      >
        {rows.length === 0 ? (
          <DataState
            kind="empty"
            title={tab === 'armed' ? 'Nothing armed' : 'Nothing has fired'}
            body={tab === 'armed'
              ? `Arm an alert from the menu above, or from any chart's bell — a level, an indicator cross, a gamma flip, a new supreme, a wall move, or a flow print over a floor.`
              : 'Alerts that trigger stay here with their timestamp, so the history survives the session.'}
          />
        ) : (
          <DataTable columns={cols} rows={rows} rowKey={a => a.id}
            initialSort={{ key: 'when', dir: 'desc' }} maxHeight="420px" emptyText="Nothing here." />
        )}
      </Panel>

      {/* Destinations — drawn, disabled, and honest about why */}
      <Panel title="Delivery" subtitle="Where a triggered alert would go" className="w-full">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            [Bell, 'In this tab', 'A banner on the desk while the tab is open.', true],
            [MessageSquare, 'Discord', 'Needs a server that outlives the tab.', false],
            [Smartphone, 'Phone push', 'Needs a server and a registered device.', false],
          ] as const).map(([Icon, label, note, live]) => (
            <div
              key={label}
              className={`flex items-start gap-2 border rounded-md px-3 py-2 ${live ? 'border-borderSubtle' : 'border-borderSubtle/50 opacity-60'}`}
            >
              <Icon size={14} className={live ? 'text-textSecondary mt-0.5' : 'text-textMuted mt-0.5'} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-textSecondary">{label}</span>
                  <span className={`font-mono text-[9px] uppercase tracking-wider ${live ? 'text-bull' : 'text-textMuted'}`}>
                    {live ? 'on' : 'unavailable'}
                  </span>
                </div>
                <p className="text-[11px] text-textMuted leading-snug mt-0.5">{note}</p>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
};

export default Alerts;
