import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { NotebookPen } from 'lucide-react';
import { addTrade } from '../data/journal';
import { MIN_BACKTEST_TRADES, runBacktest, type BacktestTrade } from '../data/backtest';
import { SCANNERS, type ScannerKey } from '../types/compass';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import StatCard from '../components/ui/StatCard';
import MetricGrid from '../components/ui/MetricGrid';
import DataTable, { type Column } from '../components/ui/DataTable';
import SegmentedControl from '../components/ui/SegmentedControl';
import ProvenanceChip from '../components/ui/ProvenanceChip';
import DataState from '../components/ui/DataState';
import { BULL, PUT_WALL } from '../components/gex/palette';

/*
==================================================
  SLAYER TERMINAL - THE BACKTEST (pages/Backtest.tsx)

  §9. What the scanners would have done.
==================================================

  A SCANNER THAT CANNOT BE CHECKED IS A HOROSCOPE WITH A NUMBER ON IT.
  Compass scores setups every session; this is the page that asks whether
  those scores have ever been worth anything.

  IT IS BADGED AS A MODEL, in the desk's own vocabulary, because that is
  what it is: there is no historical fill data behind it, and outcomes are
  generated deterministically rather than measured. What the page
  demonstrates is the SHAPE of the answer — the curve, the markers, the
  statistics, the drawdown — so a real harness later swaps the outcome
  function without redrawing anything.

  THE DRAWDOWN IS ALWAYS ON SCREEN, beside the net. An equity curve without
  its drawdown is the half of the picture that sells; the half that decides
  whether a reader could actually have held the thing is how far underwater
  it went getting there.

  AND R IS THE UNIT, not dollars — the same choice the journal makes, for
  the same reason. A backtest compares STRATEGIES, and position size is the
  one variable that must not be allowed to speak.
*/

const WINDOWS = [
  { value: '60', label: '60 sessions' },
  { value: '120', label: '120' },
  { value: '250', label: '1 year' },
] as const;

const Backtest = () => {
  const [scanner, setScanner] = useState<ScannerKey | 'ALL'>('ALL');
  const [win, setWin] = useState<'60' | '120' | '250'>('120');
  const run = useMemo(() => runBacktest(scanner, Number(win)), [scanner, win]);
  const [logged, setLogged] = useState<Set<string>>(new Set());
  const s = run.stats;

  const cols: Column<BacktestTrade>[] = [
    { key: 'date', header: 'Session', width: '120px', sortValue: t => t.date,
      render: t => <span className="font-mono text-[11px] text-textMuted">{t.date}</span> },
    { key: 'scanner', header: 'Scanner', width: '150px', sortValue: t => t.scanner,
      render: t => <span className="font-mono text-[10px] uppercase tracking-wider text-textSecondary">{t.scanner}</span> },
    { key: 'ticker', header: 'Ticker', width: '90px', sortValue: t => t.ticker,
      render: t => <span className="font-mono text-[11px] text-textPrimary">{t.ticker}</span> },
    { key: 'r', header: 'R', align: 'right', width: '90px', sortValue: t => t.r,
      render: t => <span className={`font-mono text-[11px] ${t.r >= 0 ? 'text-bull' : 'text-bear'}`}>{t.r >= 0 ? '+' : ''}{t.r.toFixed(2)}</span> },
    { key: 'eq', header: 'Equity', align: 'right', width: '100px', sortValue: t => t.equity,
      render: t => <span className="font-mono text-[11px] text-textSecondary">{t.equity >= 0 ? '+' : ''}{t.equity.toFixed(2)}R</span> },
    {
      /*
        §9's journal integration, in the only direction that is honest.

        A backtest trade is a MODELLED outcome; the journal is a record of
        what a person actually did. Pushing one into the other as a closed
        trade would put fiction into the ledger the desk's own statistics are
        computed from — so this copies the SETUP across and leaves it OPEN,
        with the backtest named in the thesis. The reader fills in the fills.
      */
      key: 'log', header: '', align: 'right', width: '90px',
      render: t => (
        <button
          onClick={e => {
            e.stopPropagation();
            addTrade({
              openedAt: new Date().toISOString(), closedAt: null,
              ticker: t.ticker, instrument: `${t.ticker} (from backtest)`,
              side: t.r >= 0 ? 'LONG' : 'SHORT', size: 1, entry: 0, exit: null, stop: null,
              thesis: `Taken from the ${t.scanner} backtest, session ${t.date}, which modelled ${t.r >= 0 ? '+' : ''}${t.r.toFixed(2)}R. Fill in the real entry and stop.`,
              review: '', setup: t.scanner, tags: ['backtest', t.scanner], shots: [],
            });
            setLogged(l => new Set(l).add(`${t.date}-${t.scanner}-${t.i}`));
          }}
          disabled={logged.has(`${t.date}-${t.scanner}-${t.i}`)}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-mono text-[9px] uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
            logged.has(`${t.date}-${t.scanner}-${t.i}`)
              ? 'border-borderSubtle/50 text-textMuted/50 cursor-default'
              : 'border-borderSubtle text-textMuted hover:text-textPrimary'
          }`}
        >
          <NotebookPen size={9} /> {logged.has(`${t.date}-${t.scanner}-${t.i}`) ? 'Logged' : 'Journal'}
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={['Terminal', 'Compass', 'Backtest']}
        title="Backtest"
        subtitle="What the scanners would have done, in multiples of risk"
        actions={
          <div className="flex items-center gap-2">
            <SegmentedControl
              ariaLabel="Window"
              value={win}
              onChange={v => setWin(v as '60')}
              options={WINDOWS.map(w => ({ value: w.value, label: w.label }))}
            />
          </div>
        }
      />

      <div className="flex items-center gap-1 flex-wrap" role="tablist" aria-label="Scanner">
        {(['ALL', ...SCANNERS.map(x => x.key)] as const).map(k => (
          <button
            key={k}
            role="tab"
            aria-selected={scanner === k}
            onClick={() => setScanner(k as ScannerKey | 'ALL')}
            className={`px-2.5 py-1 rounded font-mono text-[10px] uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
              scanner === k ? 'bg-white/[0.07] text-textPrimary' : 'text-textMuted hover:text-textSecondary'
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      <MetricGrid min="150px">
        <StatCard label="Net" value={`${s.netR >= 0 ? '+' : ''}${s.netR.toFixed(1)}R`} sub={`over ${s.trades} trades`}
          tone={s.netR > 0 ? 'bull' : s.netR < 0 ? 'bear' : 'neutral'} />
        <StatCard
          label="Max drawdown"
          value={`−${s.maxDrawdownR.toFixed(1)}R`}
          sub="deepest peak to trough — how far underwater it went"
          tone={s.maxDrawdownR > Math.abs(s.netR) ? 'bear' : 'neutral'}
        />
        <StatCard
          label="Win rate"
          value={s.winRate === null ? '—' : `${s.winRate.toFixed(0)}%`}
          sub={s.winRate === null ? `needs ${MIN_BACKTEST_TRADES} trades` : `${s.wins}W / ${s.losses}L`}
        />
        <StatCard label="Average R" value={s.avgR === null ? '—' : `${s.avgR >= 0 ? '+' : ''}${s.avgR.toFixed(2)}R`}
          sub={`best ${s.bestR.toFixed(1)} · worst ${s.worstR.toFixed(1)}`}
          tone={s.avgR === null ? 'neutral' : s.avgR >= 0 ? 'bull' : 'bear'} />
        <StatCard label="Profit factor" value={s.profitFactor === null ? '—' : s.profitFactor.toFixed(2)}
          sub={s.profitFactor === null ? 'nothing lost in this window' : 'gross win over gross loss'} />
      </MetricGrid>

      <Panel
        poppable
        title="Equity, in R"
        subtitle={`${run.sessions} sessions · ${scanner === 'ALL' ? 'every scanner' : scanner}`}
        className="w-full"
        actions={<ProvenanceChip sources={['prints']} kind="model" note="Outcomes are generated, not measured — this shows the shape of the answer, not a track record." />}
      >
        {run.trades.length === 0 ? (
          <DataState kind="empty" title="No trades in this window" body="This scanner did not fire over the sessions selected." />
        ) : (
          <div className="h-56 border border-borderSubtle rounded bg-inset/40">
            <svg viewBox={`0 0 ${run.trades.length} 100`} preserveAspectRatio="none" className="w-full h-full" role="img" aria-label="Equity curve in R">
              {(() => {
                const eq = run.trades.map(t => t.equity);
                const lo = Math.min(0, ...eq), hi = Math.max(0, ...eq);
                const span = hi - lo || 1;
                const y = (v: number) => 100 - ((v - lo) / span) * 100;
                /* The peak line makes the drawdown visible as the gap
                   between it and the curve — the thing the number names. */
                let peak = -Infinity;
                const peaks = eq.map(v => { peak = Math.max(peak, v); return peak; });
                return (
                  <>
                    <line x1="0" x2={run.trades.length} y1={y(0)} y2={y(0)} stroke="#7d7d7d" strokeWidth="0.3" strokeDasharray="3 3" />
                    <polyline fill="none" stroke="#7d7d7d" strokeWidth="0.4" strokeDasharray="2 2"
                      points={peaks.map((v, i) => `${i},${y(v)}`).join(' ')} />
                    <polyline fill="none" stroke={eq[eq.length - 1] >= 0 ? BULL : PUT_WALL} strokeWidth="0.7"
                      points={eq.map((v, i) => `${i},${y(v)}`).join(' ')} />
                  </>
                );
              })()}
            </svg>
          </div>
        )}
        <p className="mt-2 text-[11px] text-textMuted leading-snug">
          The dotted line is the running peak; the gap beneath it is the drawdown. R is the multiple of the risk
          defined at entry — the unit that compares strategies without letting position size do the talking.
          {' '}
          <Link to="/journal" className="text-textSecondary hover:text-textPrimary underline decoration-dotted">
            Your own journal
          </Link>{' '}
          measures the same way.
        </p>
      </Panel>

      <Panel title="Trades" subtitle={`${run.trades.length} in this window`} className="w-full" flush collapsible id="backtest-trades">
        <DataTable columns={cols} rows={run.trades} rowKey={t => `${t.date}-${t.scanner}-${t.i}`}
          initialSort={{ key: 'date', dir: 'desc' }} maxHeight="380px" emptyText="No trades." />
      </Panel>
    </div>
  );
};

export default Backtest;
