import { useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Pause, Play } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { enrichPrint, sentimentOf, summarizeTape } from '../../data/flowtape';
import { buildGexView, fmtUsd } from '../../data/gex';
import Panel from '../../components/ui/Panel';
import SegmentedControl from '../../components/ui/SegmentedControl';
import type { FlowPrint, PrintSentiment, TapeSummary } from '../../types/flowdesk';

const MAX_ROWS = 120;
const READ_INTERVAL_MS = 8_000;

type FlowFilter = 'ALL' | 'SWEEP' | 'BLOCK';
type SentFilter = 'ALL' | PrintSentiment;

const FLOW_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'SWEEP', label: 'Sweeps' },
  { value: 'BLOCK', label: 'Blocks' },
] as const;

const SENT_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'BULLISH', label: 'Bullish' },
  { value: 'BEARISH', label: 'Bearish' },
] as const;

const PREM_OPTIONS = [
  { value: '0', label: 'All' },
  { value: '100000', label: '≥$100K' },
  { value: '500000', label: '≥$500K' },
  { value: '1000000', label: '≥$1M' },
] as const;

/** Whale prints get an edge accent (row-level structure, not rainbow text). */
const rowAccent = (premium: number): string =>
  premium >= 1_000_000
    ? 'shadow-[inset_2px_0_0_0_rgba(234,0,255,0.75)]'
    : premium >= 250_000
      ? 'shadow-[inset_2px_0_0_0_rgba(255,149,0,0.5)]'
      : '';

/** The terminal's read of the tape — same voice as market notes. */
function tapeRead(rows: FlowPrint[], summary: TapeSummary): string {
  if (rows.length === 0) return 'Awaiting prints…';
  const zdte = rows.filter(r => r.dte === 0).length;
  const parts = [
    `${summary.bullish ? 'Bullish' : 'Bearish'} tape — ${
      summary.bullish ? 'aggressive call buying leads' : 'put premium leads'
    } by ${fmtUsd(Math.abs(summary.netPremium))}`,
  ];
  if (summary.largest)
    parts.push(
      `largest print ${summary.largest.ticker} ${summary.largest.strike}${summary.largest.right} at ${fmtUsd(summary.largest.premium)}`
    );
  if (summary.sweeps > 2) parts.push(`${summary.sweeps} sweeps on the tape`);
  if (rows.length >= 20 && zdte / rows.length > 0.25) parts.push(`0DTE is ${Math.round((zdte / rows.length) * 100)}% of flow`);
  return `${parts.join(' · ')}.`;
}

// ---- session strip ------------------------------------------------------------
const RatioBar = ({ left, right }: { left: number; right: number }) => {
  const total = left + right || 1;
  return (
    <span className="flex w-full h-[3px] rounded-full overflow-hidden bg-white/[0.06] mt-1.5">
      <span className="h-full bg-bull/90" style={{ width: `${(left / total) * 100}%` }} />
      <span className="h-full bg-bear/80" style={{ width: `${(right / total) * 100}%` }} />
    </span>
  );
};

const SessionCard = ({
  label,
  value,
  sub,
  tone = 'text-textPrimary',
  children,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
  children?: React.ReactNode;
}) => (
  <div className="border border-borderSubtle bg-panel rounded-md px-3 py-2 min-w-0">
    <div className="font-mono text-[10px] uppercase tracking-widest text-textSecondary truncate">{label}</div>
    <div className={`mt-0.5 font-mono text-base font-bold tnum ${tone}`}>{value}</div>
    {sub && <div className="font-mono text-[10px] text-textSecondary truncate">{sub}</div>}
    {children}
  </div>
);

// ---- cells ----------------------------------------------------------------------
const SpreadCell = ({ print }: { print: FlowPrint }) => {
  const dot = print.side === 'ASK' ? 'bg-bull' : print.side === 'BID' ? 'bg-bear' : 'bg-white/50';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-[9px] tnum text-textMuted">{print.bid.toFixed(2)}</span>
      <span className="relative w-12 h-[3px] rounded-full bg-white/[0.07]">
        <span
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[6px] h-[6px] rounded-full ${dot}`}
          style={{ left: `${print.fillPos * 100}%` }}
        />
      </span>
      <span className="font-mono text-[9px] tnum text-textMuted">{print.ask.toFixed(2)}</span>
    </span>
  );
};

/** Side + conviction score. BUY = hit the ask, SELL = hit the bid. */
const FlowCell = ({ print }: { print: FlowPrint }) => {
  const score = print.flowScore;
  const tone = score > 15 ? 'text-bull' : score < -15 ? 'text-bear' : 'text-textMuted';
  const bar = score > 15 ? 'bg-bull/90' : score < -15 ? 'bg-bear/80' : 'bg-white/25';
  const half = Math.abs(score) / 2;
  const sideLabel = print.side === 'ASK' ? 'BUY' : print.side === 'BID' ? 'SELL' : 'MID';
  return (
    <span className="inline-flex flex-col items-start gap-[3px] w-16">
      <span className="inline-flex items-center gap-1.5">
        <span
          className={`inline-flex w-9 justify-center rounded border px-1 py-px font-mono text-[9px] font-semibold ${
            print.side === 'ASK'
              ? 'border-bull/30 bg-bull/[0.07] text-bull'
              : print.side === 'BID'
                ? 'border-bear/30 bg-bear/[0.07] text-bear'
                : 'border-borderSubtle text-textMuted'
          }`}
        >
          {sideLabel}
        </span>
        <span className={`w-7 text-right font-mono text-[10px] tnum font-semibold ${tone}`}>
          {score > 0 ? '+' : ''}
          {score}
        </span>
      </span>
      <span className="relative w-16 h-[3px] rounded-full bg-white/[0.07]">
        <span className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20" />
        <span
          className={`absolute top-0 bottom-0 rounded-full ${bar}`}
          style={score >= 0 ? { left: '50%', width: `${half}%` } : { right: '50%', width: `${half}%` }}
        />
      </span>
    </span>
  );
};

const RatioCell = ({ print }: { print: FlowPrint }) => {
  const tone = print.ratioLabel === 'MID' ? 'text-textMuted' : print.ratioBidPct >= 50 ? 'text-bear' : 'text-bull';
  return (
    <span className="inline-flex flex-col items-end gap-[3px] w-16">
      <span className={`font-mono text-[9px] font-semibold uppercase tracking-wide tnum leading-[14px] ${tone}`}>
        {print.ratioLabel}
      </span>
      <span className="flex w-16 h-[3px] rounded-full overflow-hidden bg-white/[0.06]">
        <span className="h-full bg-bear/80" style={{ width: `${print.ratioBidPct}%` }} />
        <span className="h-full bg-bull/90" style={{ width: `${100 - print.ratioBidPct}%` }} />
      </span>
    </span>
  );
};

const SENT_TEXT: Record<PrintSentiment, string> = {
  BULLISH: 'text-bull',
  BEARISH: 'text-bear',
  NEUTRAL: 'text-textMuted',
};

// Grouped two-tier header — same grammar as the exposure / pressure matrices
const GROUPS: { label: string; cols: { label: string; align?: 'right' }[] }[] = [
  {
    label: 'Contract',
    cols: [
      { label: 'Print' },
      { label: 'Exp · DTE', align: 'right' },
      { label: 'OTM', align: 'right' },
      { label: 'Spot', align: 'right' },
    ],
  },
  {
    label: 'Execution',
    cols: [
      { label: 'Fill', align: 'right' },
      { label: 'Spread' },
      { label: 'Size', align: 'right' },
      { label: 'Prem', align: 'right' },
    ],
  },
  {
    label: 'Conviction',
    cols: [{ label: 'Flow' }, { label: 'Day Ratio', align: 'right' }, { label: 'Sentiment', align: 'right' }],
  },
  {
    label: 'Activity',
    cols: [
      { label: 'Vol', align: 'right' },
      { label: 'OI', align: 'right' },
      { label: 'ΔOI', align: 'right' },
      { label: 'V/OI', align: 'right' },
      { label: 'IV', align: 'right' },
      { label: 'Tag' },
    ],
  },
];
const COL_COUNT = 1 + GROUPS.reduce((a, g) => a + g.cols.length, 0);

/** Streaming rich options prints in the house grammar — session strip, filters, multi-ticker. */
const LiveTape = () => {
  const { marketData } = useMarketData();
  const [rows, setRows] = useState<FlowPrint[]>([]);
  const [paused, setPaused] = useState(false);
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [read, setRead] = useState('Awaiting prints…');
  const [flowFilter, setFlowFilter] = useState<FlowFilter>('ALL');
  const [sentFilter, setSentFilter] = useState<SentFilter>('ALL');
  const [minPremKey, setMinPremKey] = useState<'0' | '100000' | '500000' | '1000000'>('0');
  const idRef = useRef(0);
  const lastReadRef = useRef(0);

  useEffect(() => {
    if (!marketData || paused) return;
    const fresh = marketData.tape.map(o => enrichPrint(o, ++idRef.current));
    if (fresh.length === 0) return;
    setRows(prev => [...fresh, ...prev].slice(0, MAX_ROWS));
  }, [marketData, paused]);

  // Session truth is the full tape; filters shape the view only
  const summary = useMemo(() => summarizeTape(rows), [rows]);

  const filtered = useMemo(() => {
    const minPrem = Number(minPremKey);
    return rows.filter(
      r =>
        (flowFilter === 'ALL' || (flowFilter === 'SWEEP' ? r.sweep : !r.sweep)) &&
        (sentFilter === 'ALL' || sentimentOf(r) === sentFilter) &&
        r.premium >= minPrem
    );
  }, [rows, flowFilter, sentFilter, minPremKey]);

  const topTickers = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.ticker, (m.get(r.ticker) ?? 0) + r.premium);
    return [...m.entries()]
      .map(([ticker, premium]) => ({ ticker, premium }))
      .sort((a, b) => b.premium - a.premium)
      .slice(0, 6);
  }, [rows]);
  const topMax = topTickers[0]?.premium ?? 1;

  // Dark-pool crosses for the rail — deterministic per ticker, so keyed on the
  // active symbol rather than every tick
  const activeTicker = marketData?.ticker;
  const darkPrints = useMemo(() => {
    if (!marketData) return [];
    return buildGexView(marketData, 'GEX', 10)
      .board.flatMap(t =>
        t.prints.map((p, i) => ({
          key: `${t.ticker}-${i}`,
          ticker: t.ticker,
          size: p.size,
          price: p.price,
          notional: p.notional,
          time: p.time,
          date: p.date,
        }))
      )
      .sort((a, b) => b.notional - a.notional)
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicker]);

  useEffect(() => {
    const now = Date.now();
    if (now - lastReadRef.current < READ_INTERVAL_MS && rows.length > 3) return;
    lastReadRef.current = now;
    setRead(tapeRead(rows, summary));
  }, [rows, summary]);

  const toggleMark = (id: number) =>
    setMarked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const dirTotal = summary.bullPremium + summary.bearPremium || 1;
  const bearPct = Math.round((summary.bearPremium / dirTotal) * 100);

  return (
    <>
      {/* Session strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
        <SessionCard label="Session Premium" value={fmtUsd(summary.totalPremium)} sub={`${rows.length} prints on tape`} />
        <SessionCard label="Call / Put Premium" value={`${summary.callCount} / ${summary.putCount}`} sub={`${fmtUsd(summary.callPremium)} vs ${fmtUsd(summary.putPremium)}`}>
          <RatioBar left={summary.callPremium} right={summary.putPremium} />
        </SessionCard>
        <SessionCard
          label="Bullish vs Bearish"
          value={bearPct >= 50 ? `${bearPct}% BEAR` : `${100 - bearPct}% BULL`}
          tone={bearPct >= 50 ? 'text-bear' : 'text-bull'}
        >
          <RatioBar left={summary.bullPremium} right={summary.bearPremium} />
        </SessionCard>
        <SessionCard label="Sweeps" value={String(summary.sweeps)} sub="aggressive orders" tone="text-warn" />
        <SessionCard label="Blocks" value={String(summary.blocks)} sub="negotiated size" />
        <SessionCard
          label="Largest Print"
          value={summary.largest ? fmtUsd(summary.largest.premium) : '—'}
          sub={summary.largest ? `${summary.largest.ticker} ${summary.largest.strike}${summary.largest.right}` : 'awaiting tape'}
          tone={summary.largest && summary.largest.premium >= 1_000_000 ? 'text-king' : 'text-textPrimary'}
        />
      </div>

      {/* Controls + filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setPaused(p => !p)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border font-mono text-[11px] font-semibold uppercase tracking-wider transition-colors ${
            paused
              ? 'border-warn/40 bg-warn/[0.06] text-warn hover:bg-warn/[0.1]'
              : 'border-bull/40 bg-bull/[0.06] text-bull hover:bg-bull/[0.1]'
          }`}
        >
          {paused ? (
            <>
              <Play className="w-3 h-3" /> Paused
            </>
          ) : (
            <>
              <Pause className="w-3 h-3" /> Live
            </>
          )}
        </button>
        <SegmentedControl ariaLabel="Flow type" options={FLOW_OPTIONS} value={flowFilter} onChange={setFlowFilter} />
        <SegmentedControl ariaLabel="Sentiment" options={SENT_OPTIONS} value={sentFilter} onChange={setSentFilter} />
        <SegmentedControl ariaLabel="Min premium" options={PREM_OPTIONS} value={minPremKey} onChange={setMinPremKey} />
        <span className="ml-auto font-mono text-[10px] text-textMuted uppercase tracking-wider tnum">
          {filtered.length} of {rows.length} prints · {marked.size} marked
        </span>
      </div>

      {/* The terminal's read of the tape */}
      <div className={`flex items-start gap-2.5 border-l-2 pl-3 py-0.5 ${summary.bullish ? 'border-bull/70' : 'border-bear/70'}`}>
        <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-textMuted pt-px shrink-0">
          Tape read
        </span>
        <p className="text-[11px] text-textSecondary leading-snug tnum">{read}</p>
      </div>

      {/* Tape + concentration */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <Panel title="Options Tape" subtitle="streaming prints — newest first" flush className="xl:col-span-9 min-w-0">
          <div className="overflow-auto max-h-[640px]">
            <table className="w-full border-collapse min-w-[1320px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#0c0c0c]">
                  <th rowSpan={2} className="px-2 py-1.5 text-left font-mono text-[9px] font-semibold uppercase tracking-widest text-textSecondary border-b border-borderSubtle w-24">
                    Time
                  </th>
                  {GROUPS.map(g => (
                    <th
                      key={g.label}
                      colSpan={g.cols.length}
                      className="px-2 py-1.5 text-center font-mono text-[10px] font-bold uppercase tracking-widest text-textPrimary border-b border-l border-borderSubtle"
                    >
                      {g.label}
                    </th>
                  ))}
                </tr>
                <tr className="bg-[#0c0c0c]">
                  {GROUPS.flatMap(g =>
                    g.cols.map((c, i) => (
                      <th
                        key={`${g.label}-${c.label}`}
                        className={`px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-widest text-textSecondary border-b border-borderSubtle whitespace-nowrap ${
                          i === 0 ? 'border-l' : ''
                        } ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                      >
                        {c.label}
                      </th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={COL_COUNT} className="py-10 text-center font-mono text-[11px] text-textMuted uppercase tracking-widest">
                      {rows.length === 0 ? 'Awaiting first prints…' : 'No prints match the filters'}
                    </td>
                  </tr>
                )}
                {filtered.map(r => {
                  const sent = sentimentOf(r);
                  return (
                    <tr key={r.id} className={`border-b border-borderSubtle/30 last:border-0 animate-slide-in hover:bg-white/[0.02] ${rowAccent(r.premium)}`}>
                      {/* Time rail */}
                      <td className="px-2 py-1.5 bg-inset border-r border-borderSubtle/40 whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          <button
                            onClick={() => toggleMark(r.id)}
                            className={`transition-colors ${marked.has(r.id) ? 'text-select' : 'text-textMuted/40 hover:text-textSecondary'}`}
                            aria-label="Track print"
                          >
                            <Bookmark className="w-3 h-3" fill={marked.has(r.id) ? 'currentColor' : 'none'} />
                          </button>
                          <span className="font-mono text-[10px] tnum text-textMuted">{r.time}</span>
                        </span>
                      </td>

                      {/* Contract */}
                      <td className="px-2 py-1.5 whitespace-nowrap border-l border-borderSubtle/30">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold ${
                            r.right === 'C' ? 'border-bull/30 bg-bull/10 text-bull' : 'border-bear/30 bg-bear/10 text-bear'
                          }`}
                        >
                          {r.ticker} {r.strike}{r.right}
                        </span>
                        {r.legs > 1 && <span className="ml-1.5 font-mono text-[9px] text-select">×{r.legs}</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-[10px] tnum text-textSecondary whitespace-nowrap">
                        {r.expiry.slice(0, 5)} · <span className={r.dte === 0 ? 'text-warn font-semibold' : ''}>{r.dte}d</span>
                      </td>
                      <td className={`px-2 py-1.5 text-right font-mono text-[10px] tnum ${r.otmPct >= 0 ? 'text-bull' : 'text-bear'}`}>
                        {r.otmPct >= 0 ? '+' : ''}
                        {r.otmPct.toFixed(1)}%
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-[10px] tnum text-textSecondary">${r.spot.toFixed(2)}</td>

                      {/* Execution */}
                      <td className="px-2 py-1.5 text-right font-mono text-[11px] tnum font-semibold text-textPrimary border-l border-borderSubtle/30">
                        ${r.fill.toFixed(2)}
                      </td>
                      <td className="px-2 py-1.5"><SpreadCell print={r} /></td>
                      <td className="px-2 py-1.5 text-right font-mono text-[11px] tnum text-textPrimary">{r.size.toLocaleString()}</td>
                      <td className={`px-2 py-1.5 text-right font-mono text-[11px] tnum ${r.premium >= 250_000 ? 'font-bold text-textPrimary' : 'text-textSecondary'}`}>
                        {fmtUsd(r.premium)}
                      </td>

                      {/* Conviction */}
                      <td className="px-2 py-1.5 border-l border-borderSubtle/30"><FlowCell print={r} /></td>
                      <td className="px-2 py-1.5 text-right"><RatioCell print={r} /></td>
                      <td className={`px-2 py-1.5 text-right font-mono text-[10px] font-semibold ${SENT_TEXT[sent]}`}>{sent}</td>

                      {/* Activity */}
                      <td className="px-2 py-1.5 text-right font-mono text-[10px] tnum text-textSecondary border-l border-borderSubtle/30">
                        {r.volume.toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-[10px] tnum text-textSecondary">{r.oi.toLocaleString()}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-[10px] tnum whitespace-nowrap">
                        {r.deltaOI === 0 ? (
                          <span className="text-textMuted">—</span>
                        ) : (
                          <span className={r.deltaOI > 0 ? 'text-bull' : 'text-bear'}>
                            {r.deltaOI > 0 ? '↑' : '↓'}
                            {Math.abs(r.deltaOI).toLocaleString()}
                          </span>
                        )}
                      </td>
                      <td className={`px-2 py-1.5 text-right font-mono text-[10px] tnum ${r.volOverOI >= 5 ? 'text-warn font-semibold' : 'text-textSecondary'}`}>
                        {r.volOverOI.toFixed(2)}x
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-[10px] tnum text-textSecondary">{r.iv.toFixed(1)}%</td>
                      <td className="px-2 py-1.5 font-mono text-[9px] text-textMuted whitespace-nowrap">
                        {r.sweep ? <span className="text-warn font-semibold">SWEEP</span> : r.strat}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Right rail: concentration summary on top, dark-pool feed below */}
        <div className="xl:col-span-3 min-w-0 flex flex-col gap-4">
          <Panel title="Top Tickers" subtitle="session premium concentration" className="w-full">
            <div className="flex flex-col gap-2.5">
              {topTickers.length === 0 && (
                <span className="font-mono text-[10px] text-textMuted uppercase tracking-widest py-6 text-center">
                  Awaiting tape…
                </span>
              )}
              {topTickers.map((t, i) => (
                <div key={t.ticker} className="flex items-center gap-2">
                  <span className={`w-12 shrink-0 font-mono text-[11px] font-semibold ${i === 0 ? 'text-king' : 'text-textPrimary'}`}>
                    {t.ticker}
                  </span>
                  <span className="relative flex-1 h-[5px] rounded-full bg-white/[0.05]">
                    <span
                      className={`absolute inset-y-0 left-0 rounded-full ${i === 0 ? 'bg-[#EA00FF]/70' : 'bg-white/25'}`}
                      style={{ width: `${(t.premium / topMax) * 100}%` }}
                    />
                  </span>
                  <span className="w-14 shrink-0 text-right font-mono text-[10px] tnum text-textSecondary">
                    {fmtUsd(t.premium)}
                  </span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Dark Pool" subtitle="off-exchange crosses · by notional" flush className="w-full flex-1 min-h-0">
            <div className="overflow-y-auto max-h-[360px]">
              {darkPrints.length === 0 ? (
                <span className="block font-mono text-[10px] text-textMuted uppercase tracking-widest py-6 text-center">
                  Awaiting prints…
                </span>
              ) : (
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-[#0c0c0c]">
                      {['Ticker', 'Size', 'Price', 'Notional', 'Time'].map((h, i) => (
                        <th
                          key={h}
                          className={`px-2 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-widest text-textSecondary border-b border-borderSubtle ${
                            i === 0 ? 'text-left' : 'text-right'
                          }`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {darkPrints.map(p => (
                      <tr
                        key={p.key}
                        title={`${p.date} · ${p.time}`}
                        className="border-b border-borderSubtle/30 last:border-0 hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="px-2 py-2 whitespace-nowrap">
                          <span className="flex items-center gap-1.5">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-darkpool" />
                            <span className="font-mono text-[11px] font-semibold text-textPrimary">{p.ticker}</span>
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-[11px] tnum text-textSecondary">
                          {p.size.toLocaleString()}
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-[11px] tnum text-textSecondary">
                          ${p.price.toFixed(2)}
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-[11px] font-bold tnum text-textPrimary">
                          ${p.notional.toFixed(2)}B
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-[10px] tnum text-textSecondary whitespace-nowrap">
                          {p.time.slice(0, 5)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
};

export default LiveTape;
