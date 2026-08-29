import { useMemo, useState } from 'react';
import { useMarketData } from '../context/MarketDataContext';
import Simulator from '../core/simulator';
import {
  FUTURES_ROOTS, bigPrints, contractsFor, overnightClock, overnightFor, quoteFor,
  type FuturesRoot,
} from '../data/futures';
import { FUTURES_PHASE_WORDS, futuresPhaseAt } from '../core/calendar';
import { twinFamilyFor, twinMeasureFor, twinPrice } from '../data/indexTwins';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import StatCard from '../components/ui/StatCard';
import MetricGrid from '../components/ui/MetricGrid';
import SegmentedControl from '../components/ui/SegmentedControl';
import ProvenanceChip from '../components/ui/ProvenanceChip';
import DataState from '../components/ui/DataState';
import DataTable, { type Column } from '../components/ui/DataTable';
import { SPOT as INK_SPOT } from '../components/gex/palette';

/*
==================================================
  SLAYER TERMINAL - INDEX & FUTURES (pages/IndexFutures.tsx)

  §12 and §13 on one desk, because they are one
  question: what is the underlying REALLY doing.
==================================================

  THE DESK'S OWN THESIS SAYS OVERNIGHT RISK DECIDES THE OPEN, and until now
  the desk could not draw the overnight. Every chart here starts at 09:30
  because the cash tape does, so the eight hours in which the gap is
  actually formed were simply absent. This is those hours.

  THREE LENSES ON ONE UNDERLYING. The ETF is the tape everything else on
  this desk draws; the cash index is what the options are actually written
  on; the future is what trades while both are shut. They are not three
  instruments a reader should have to reconcile by hand, so the header puts
  them on one row with the BASIS stated between them — and says whether that
  basis was measured off paired samples or is still the seeded assumption.

  THE OVERNIGHT RANGE IS THE POINT OF THE CHART. Not the wiggle: the HIGH,
  the LOW, and where the cash open sits between them. A gap that opens above
  the overnight high is a different morning from one that opens inside the
  range, and that is a two-number question the cash chart cannot answer.

  VIX IS A LENS, NOT A TWIN. It has no ETF whose price times a ratio gives
  it and no future in this family, so it sits in its own row with its term
  structure — 1-day, 9-day and 30-day — which is the shape that actually
  says whether today is priced as an event.
*/

const IndexFutures = () => {
  const { activeTicker, marketData } = useMarketData();
  const [root, setRoot] = useState<FuturesRoot>('ES');
  const now = useMemo(() => new Date(), []);
  const phase = futuresPhaseAt(now);

  const spec = FUTURES_ROOTS.find(r => r.root === root)!;
  const quote = useMemo(() => quoteFor(root, now), [root, now, marketData?.spot]);
  const dateIso = now.toISOString().slice(0, 10);
  const session = useMemo(
    () => (quote ? overnightFor(root, dateIso, quote.settlement) : null),
    [root, dateIso, quote?.settlement]
  );
  const prints = useMemo(
    () => (session ? bigPrints(root, session, dateIso) : []),
    [root, session, dateIso]
  );

  /* The three lenses, off the same measurement. */
  const fam = twinFamilyFor(spec.etf);
  const etfPx = Simulator.TICKERS[spec.etf]?.currentPrice ?? 0;
  const measure = fam ? twinMeasureFor(fam) : null;
  const indexPx = fam && measure ? twinPrice(fam, 'index', etfPx, measure) : null;

  /* VIX's own term structure — a lens with no twin. */
  const vix = useMemo(() => {
    const base = (Simulator.TICKERS[spec.etf]?.iv ?? 0.18) * 100;
    return [
      { key: 'VIX1D', label: '1-day', value: base * 1.28, note: 'today’s event pricing' },
      { key: 'VIX9D', label: '9-day', value: base * 1.08, note: 'the week ahead' },
      { key: 'VIX', label: '30-day', value: base, note: 'the headline number' },
      { key: 'VIX3M', label: '3-month', value: base * 0.94, note: 'the back end' },
    ];
  }, [spec.etf, marketData?.spot]);

  const printCols: Column<(typeof prints)[number]>[] = [
    { key: 'clock', header: 'Time', width: '80px', sortValue: p => p.min,
      render: p => <span className="font-mono text-[11px] text-textMuted">{p.clock}</span> },
    { key: 'session', header: 'Session', width: '130px', sortValue: p => p.phase,
      render: p => <span className="font-mono text-[10px] uppercase tracking-wider text-textSecondary">{FUTURES_PHASE_WORDS[p.phase].label}</span> },
    { key: 'px', header: 'Price', align: 'right', width: '96px', sortValue: p => p.price,
      render: p => <span className="font-mono text-[11px] text-textPrimary">{p.price.toFixed(2)}</span> },
    { key: 'size', header: 'Size', align: 'right', width: '90px', sortValue: p => p.size,
      render: p => <span className="font-mono text-[11px] text-textSecondary">{p.size.toLocaleString()}</span> },
    { key: 'side', header: 'Side', align: 'right', width: '70px', sortValue: p => p.side,
      render: p => <span className={`font-mono text-[10px] uppercase ${p.side === 'ASK' ? 'text-bull' : 'text-bear'}`}>{p.side}</span> },
  ];

  if (!quote || !session) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader breadcrumb={['Terminal', 'Index & Futures']} title="Index & Futures" subtitle="The cash index, the front month, and the session before the open" />
        <Panel className="w-full">
          <DataState kind="loading" title="Building the session" body="Waiting for the underlying tape to price the front month." />
        </Panel>
      </div>
    );
  }

  const { front, next } = contractsFor(root, now);
  const range = session.high - session.low;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={['Terminal', 'Index & Futures']}
        title="Index & Futures"
        subtitle="The cash index, the front month, and the session before the open"
        actions={
          <SegmentedControl
            ariaLabel="Contract"
            value={root}
            onChange={v => setRoot(v as FuturesRoot)}
            options={FUTURES_ROOTS.map(r => ({ value: r.root, label: r.root }))}
          />
        }
      />

      {/* §12 — the three lenses, and the basis between them */}
      <Panel
        title={`${spec.name}`}
        subtitle={`${front.code} · ${spec.etf} / ${spec.index} / ${root}`}
        className="w-full"
        actions={<ProvenanceChip sources={['candles']} note="The overnight session and the settlement are modelled." />}
      >
        <MetricGrid min="160px">
          <StatCard label={`${spec.etf} · ETF`} value={etfPx ? `$${etfPx.toFixed(2)}` : '—'} sub="the tape this desk draws" />
          <StatCard label={`${spec.index} · cash index`} value={indexPx ? indexPx.toFixed(2) : '—'} sub="what the options are written on" />
          <StatCard label={`${root} · front month`} value={quote.last.toFixed(2)} sub={`${front.code}, ${front.daysToExpiry}d to expiry`} />
          <StatCard
            label="Basis"
            value={`${quote.basis >= 0 ? '+' : ''}${quote.basis.toFixed(2)}`}
            sub={measure && measure.sampled > 0 ? `measured over ${measure.sampled} pairs` : 'seeded assumption — not yet measured'}
            tone={quote.basis >= 0 ? 'bull' : 'bear'}
          />
          <StatCard
            label="Vs settlement"
            value={`${quote.changeFromSettle >= 0 ? '+' : ''}${quote.changeFromSettle.toFixed(2)}`}
            sub={`${quote.changePct >= 0 ? '+' : ''}${quote.changePct.toFixed(2)}% · settle ${quote.settlement.toFixed(2)}`}
            tone={quote.changeFromSettle >= 0 ? 'bull' : 'bear'}
          />
          <StatCard label="Open interest" value={quote.openInterest.toLocaleString()} sub={`${quote.volume.toLocaleString()} traded`} />
          <StatCard
            label="Globex phase"
            value={FUTURES_PHASE_WORDS[phase].label}
            sub={FUTURES_PHASE_WORDS[phase].blurb}
            tone={phase === 'RTH' ? 'bull' : phase === 'MAINTENANCE' || phase === 'CLOSED' ? 'neutral' : 'select'}
          />
          <StatCard
            label="Roll"
            value={front.rollingSoon ? 'THIS WEEK' : `${front.daysToExpiry}d`}
            sub={front.rollingSoon ? `volume migrating to ${next.code}` : `then ${next.code}`}
            tone={front.rollingSoon ? 'warn' : 'neutral'}
          />
        </MetricGrid>
      </Panel>

      {/* §13 — the session the cash tape never sees */}
      <Panel
        poppable
        title="Overnight session"
        subtitle={`18:00 ET → 09:30 · ${session.bars.length} bars · range ${range.toFixed(2)}`}
        className="w-full"
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Overnight high" value={session.high.toFixed(2)} sub="the level the open is measured against" tone="bull" />
            <StatCard label="Overnight low" value={session.low.toFixed(2)} sub="and the one under it" tone="bear" />
            <StatCard label="Settlement" value={session.settlement.toFixed(2)} sub="prior session — the chart's line" />
            <StatCard
              label="Open sits at"
              value={session.openPositionPct === null ? '—' : `${session.openPositionPct.toFixed(0)}%`}
              sub="of the overnight range, low to high"
            />
          </div>

          {/* The range chart — phases shaded, settlement ruled */}
          <div className="relative h-48 border border-borderSubtle rounded bg-inset/40 overflow-hidden">
            <svg viewBox="0 0 930 100" preserveAspectRatio="none" className="w-full h-full" role="img" aria-label="Overnight session range">
              {/* Phase bands, so the reader can see WHERE the move happened */}
              <rect x="0" y="0" width="540" height="100" className="fill-white/[0.015]" />
              <rect x="540" y="0" width="390" height="100" className="fill-white/[0.03]" />
              {/* Settlement rule */}
              {/* SVG ink is an ATTRIBUTE here, not a Tailwind class. This file
                  first drew the line with `stroke-accent`, which resolves to
                  nothing — `accent` is not a token (the interface accent is
                  `select`) and no stroke-* utility exists anywhere in this
                  codebase. The line rendered at the right coordinates with
                  stroke:none, which looks exactly like an empty chart. */}
              <line
                x1="0" x2="930"
                y1={100 - ((session.settlement - session.low) / (range || 1)) * 100}
                y2={100 - ((session.settlement - session.low) / (range || 1)) * 100}
                stroke="#7d7d7d" strokeWidth="0.4" strokeDasharray="4 3"
              />
              <polyline
                fill="none"
                stroke={INK_SPOT}
                strokeWidth="0.9"
                strokeLinejoin="round"
                points={session.bars.map(b => `${b.min},${100 - ((b.close - session.low) / (range || 1)) * 100}`).join(' ')}
              />
            </svg>
            <div className="absolute inset-x-0 bottom-0 flex justify-between px-2 pb-1 pointer-events-none">
              {['18:00', '00:00', '03:00', '06:00', '09:30'].map(t => (
                <span key={t} className="font-mono text-[9px] text-textMuted">{t}</span>
              ))}
            </div>
            <div className="absolute top-1 left-2 font-mono text-[9px] uppercase tracking-widest text-textMuted">Asia</div>
            <div className="absolute top-1 left-[58%] font-mono text-[9px] uppercase tracking-widest text-textMuted">Europe → open</div>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* VIX — a lens with no twin */}
        <Panel title="Volatility term structure" subtitle="VIX1D · VIX9D · VIX · VIX3M" className="w-full">
          <MetricGrid min="130px">
            {vix.map(v => (
              <StatCard key={v.key} label={v.key} value={v.value.toFixed(2)} sub={`${v.label} — ${v.note}`} />
            ))}
          </MetricGrid>
          <p className="mt-3 text-[11px] text-textMuted leading-snug">
            {vix[0].value > vix[2].value
              ? 'The front is bid over the back — today is being priced as an event.'
              : 'The curve is in its usual shape: near-dated under the headline number.'}
          </p>
        </Panel>

        {/* The futures tape */}
        <Panel title="Futures tape" subtitle={`${front.code} · largest overnight prints`} className="w-full" flush>
          <DataTable
            columns={printCols}
            rows={prints}
            rowKey={p => `${p.min}-${p.size}`}
            initialSort={{ key: 'size', dir: 'desc' }}
            maxHeight="280px"
            emptyText="No large prints in this session."
          />
        </Panel>
      </div>
    </div>
  );
};

export default IndexFutures;
