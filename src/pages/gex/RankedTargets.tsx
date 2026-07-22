import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, ArrowUp, ArrowDown, ChevronUp, ChevronDown } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildRankedTargets } from '../../data/rankedtargets';
import { fmtUsd } from '../../data/gex';
import Panel from '../../components/ui/Panel';
import SegmentedControl from '../../components/ui/SegmentedControl';
import SignalBadge from '../../components/ui/SignalBadge';
import type { MarketSnapshot } from '../../types/market';
import type { HedgingClass, RankedTarget, TargetTag } from '../../types/gex';
import type { Tone } from '../../components/ui/tones';

/** Rankings sweep on the scan tier — priority must not reshuffle per tick. */
const SCAN_INTERVAL_MS = 10_000;

type Isolator = 'ALL' | 'TOP10' | 'NBR' | 'WALLS' | 'NEAR';

const ISOLATOR_OPTIONS = [
  { value: 'ALL', label: 'All strikes' },
  { value: 'TOP10', label: 'Top 10' },
  { value: 'NBR', label: 'NBR 1.5x+' },
  { value: 'WALLS', label: 'Walls' },
  { value: 'NEAR', label: 'Near spot' },
] as const;

const TAG_TONE: Record<TargetTag, Tone> = {
  WALL: 'warn',
  PIN: 'neutral',
  KING: 'magenta',
  'SPOT TARGET': 'select',
};

const CLASS_TEXT: Record<HedgingClass, string> = {
  'DOWNSIDE CUSHION': 'text-bull',
  'UPSIDE RESISTANCE': 'text-bear',
  MAGNET: 'text-king',
  NEUTRAL: 'text-textSecondary',
};

/** Left edge accent per hedging class — the whale-print grammar. */
const CLASS_EDGE: Record<HedgingClass, string> = {
  'DOWNSIDE CUSHION': 'rgba(48,209,88,0.85)',
  'UPSIDE RESISTANCE': 'rgba(255,59,48,0.75)',
  MAGNET: 'rgba(234,0,255,0.8)',
  NEUTRAL: 'transparent',
};

const fmtStrike = (v: number) => (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));

/** Rank-change vs the previous scan: ▲ moved toward #1, ▼ slipped. */
const RankDelta = ({ delta }: { delta: number | undefined }) => {
  if (delta === undefined || delta === 0)
    return <span className="w-6 shrink-0 font-mono text-[10px] text-textMuted select-none">·</span>;
  const up = delta > 0;
  return (
    <span
      className={`w-6 shrink-0 inline-flex items-center gap-0.5 font-mono text-[10px] tnum ${up ? 'text-bull' : 'text-bear'}`}
      title={`${up ? 'up' : 'down'} ${Math.abs(delta)} since last scan`}
    >
      {up ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
      {Math.abs(delta)}
    </span>
  );
};

// ---- sortable table ----------------------------------------------------------

type SortKey = 'rank' | 'strike' | 'score' | 'bps' | 'nbr' | 'volume' | 'openInterest' | 'netGex' | 'hedgingClass';

const COLUMNS: { key: SortKey; label: string; align: 'left' | 'right'; cls: string; num: boolean }[] = [
  // Rank column dropped — rows already sort by rank and the top cards call out
  // #1/#2/#3, so an explicit rank number was redundant. The rank-movement arrow
  // moves next to the strike below (that's the non-redundant part).
  { key: 'strike', label: 'Strike', align: 'left', cls: 'w-44', num: true },
  { key: 'score', label: 'Score', align: 'left', cls: 'w-28', num: true },
  { key: 'bps', label: 'Dist', align: 'right', cls: 'w-16', num: true },
  { key: 'nbr', label: 'NBR', align: 'right', cls: 'w-16', num: true },
  { key: 'volume', label: 'Volume', align: 'right', cls: 'hidden lg:table-cell w-24', num: true },
  { key: 'openInterest', label: 'Open Int', align: 'right', cls: 'hidden lg:table-cell w-24', num: true },
  { key: 'netGex', label: 'Net GEX', align: 'right', cls: 'w-28', num: true },
  { key: 'hedgingClass', label: 'Class', align: 'right', cls: 'hidden sm:table-cell w-40', num: false },
];

const RankedTargets = () => {
  const { marketData } = useMarketData();
  const navigate = useNavigate();
  const [isolator, setIsolator] = useState<Isolator>('ALL');
  // Default to Score-desc (same order as engine rank) so the active-sort indicator
  // shows on a real column header instead of a phantom 'rank' key.
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'score', dir: 'desc' });

  const [scanSnapshot, setScanSnapshot] = useState<MarketSnapshot | null>(null);
  const [lastScanAt, setLastScanAt] = useState('');
  const scanRef = useRef<MarketSnapshot | null>(null);
  const lastScanTimeRef = useRef(0);

  useEffect(() => {
    if (!marketData) return;
    const now = Date.now();
    const due =
      !scanRef.current ||
      now - lastScanTimeRef.current >= SCAN_INTERVAL_MS ||
      scanRef.current.ticker !== marketData.ticker;
    if (due) {
      scanRef.current = marketData;
      lastScanTimeRef.current = now;
      setScanSnapshot(marketData);
      setLastScanAt(new Date(now).toLocaleTimeString('en-GB'));
    }
  }, [marketData]);

  const view = useMemo(() => (scanSnapshot ? buildRankedTargets(scanSnapshot) : null), [scanSnapshot]);

  // Rank-change vs the last scan — remembers the engine's own rank per strike and
  // subtracts; no new ranking math. Resets naturally when strikes change ticker.
  const prevRanks = useRef<Map<number, number>>(new Map());
  const [deltas, setDeltas] = useState<Map<number, number>>(new Map());
  useEffect(() => {
    if (!view) return;
    const next = new Map<number, number>();
    const d = new Map<number, number>();
    for (const t of view.targets) {
      next.set(t.strike, t.rank);
      const prev = prevRanks.current.get(t.strike);
      if (prev !== undefined && prev !== t.rank) d.set(t.strike, prev - t.rank);
    }
    setDeltas(d);
    prevRanks.current = next;
  }, [view]);

  const filtered = useMemo(() => {
    if (!view) return [];
    switch (isolator) {
      case 'TOP10':
        return view.targets.slice(0, 10);
      case 'NBR':
        return view.targets.filter(t => t.nbr >= 1.5);
      case 'WALLS':
        return view.targets.filter(t => t.tags.includes('WALL') || t.tags.includes('KING'));
      case 'NEAR':
        return view.targets.filter(t => Math.abs(t.bps) <= 100);
      default:
        return view.targets;
    }
  }, [view, isolator]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const { key, dir } = sort;
    arr.sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      let cmp: number;
      if (typeof av === 'string' && typeof bv === 'string') cmp = av.localeCompare(bv);
      else cmp = (av as number) - (bv as number);
      return dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sort]);

  if (!view) {
    return (
      <Panel className="h-64" bodyClassName="flex items-center justify-center">
        <span className="font-mono text-[11px] text-textMuted uppercase tracking-widest">
          Awaiting feed initialization…
        </span>
      </Panel>
    );
  }

  const primary = view.targets[0];
  const flash = (t: RankedTarget) => navigate('/pulse', { state: { focusPrice: t.strike } });
  const top3 = view.targets.slice(0, 3);

  const toggleSort = (key: SortKey) =>
    setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'rank' || key === 'strike' ? 'asc' : 'desc' }));

  return (
    <>
      {/* Controls + primary target */}
      <div className="flex items-center gap-3 flex-wrap">
        <SegmentedControl ariaLabel="Strategy isolator" options={ISOLATOR_OPTIONS} value={isolator} onChange={setIsolator} />
        {primary && (
          <button
            onClick={() => flash(primary)}
            className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-king/30 bg-king/[0.05] hover:bg-king/[0.1] transition-colors"
            title="Flash on chart"
          >
            <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-king">Primary target</span>
            <span className="font-mono text-[12px] font-bold tnum text-textPrimary">{fmtStrike(primary.strike)}</span>
            <span className="font-mono text-[11px] tnum text-king">{primary.score}/100</span>
            <ArrowUpRight className="w-3 h-3 text-textSecondary" />
          </button>
        )}
        <span className="ml-auto font-mono text-[10px] text-textMuted uppercase tracking-widest tnum">
          {filtered.length} of {view.targets.length} strikes · scan {lastScanAt} · 10s
        </span>
      </div>

      {/* Compact top-3 summary — a glance, not a podium */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {top3.map(t => (
          <button
            key={t.strike}
            onClick={() => flash(t)}
            title="Flash on chart"
            className={`group relative text-left rounded-md border px-3 py-2.5 transition-colors ${
              t.rank === 1
                ? 'border-king/35 bg-king/[0.035] hover:bg-king/[0.06]'
                : 'border-borderSubtle bg-inset hover:border-borderMuted'
            }`}
            style={{ boxShadow: `inset 2px 0 0 0 ${CLASS_EDGE[t.hedgingClass]}` }}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] tnum text-textSecondary">#{t.rank}</span>
              <span className="font-mono text-[16px] font-bold tnum text-textPrimary">{fmtStrike(t.strike)}</span>
              <span className={`ml-auto font-mono text-[16px] font-bold tnum ${t.rank === 1 ? 'text-king' : 'text-textPrimary'}`}>{t.score}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className={`font-mono text-[12px] font-semibold tnum ${t.netGex >= 0 ? 'text-bull' : 'text-bear'}`}>{fmtUsd(t.netGex)}</span>
              <span className={`ml-auto font-mono text-[10px] font-semibold uppercase tracking-wider ${CLASS_TEXT[t.hedgingClass]}`}>
                {t.hedgingClass}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Sortable ranking table — the working surface */}
      <Panel title="Ranked Targets" subtitle="every strike scored — click a header to sort, a row to flash on the chart" flush className="w-full">
        {sorted.length === 0 ? (
          <div className="py-10 text-center font-mono text-[11px] text-textMuted uppercase tracking-widest">No strikes match this isolator</div>
        ) : (
          <div className="overflow-auto max-h-[560px]">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-borderSubtle">
                  {COLUMNS.map(col => {
                    const activeSort = sort.key === col.key;
                    return (
                      <th key={col.key} className={`${col.cls} px-3 py-2 select-none sticky top-0 z-10 bg-panelRaised`}>
                        <button
                          onClick={() => toggleSort(col.key)}
                          className={`w-full inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                            col.align === 'right' ? 'justify-end' : 'justify-start'
                          } ${activeSort ? 'text-textPrimary' : 'text-textSecondary hover:text-textPrimary'}`}
                        >
                          {col.label}
                          {activeSort ? (
                            sort.dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                          ) : (
                            <span className="w-3" />
                          )}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sorted.map(t => (
                  <tr
                    key={t.strike}
                    onClick={() => flash(t)}
                    title="Flash on chart"
                    className="group cursor-pointer border-b border-borderSubtle/30 last:border-0 hover:bg-white/[0.03] transition-colors"
                    style={{ boxShadow: `inset 2px 0 0 0 ${CLASS_EDGE[t.hedgingClass]}` }}
                  >
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="font-mono text-[13px] font-bold tnum text-textPrimary">{fmtStrike(t.strike)}</span>
                        <RankDelta delta={deltas.get(t.strike)} />
                        {t.tags.map(tag => (
                          <SignalBadge key={tag} tone={TAG_TONE[tag]}>
                            {tag}
                          </SignalBadge>
                        ))}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2">
                        <span className="relative flex-1 h-[3px] rounded-full bg-white/[0.06] min-w-[36px]">
                          <span
                            className={`absolute inset-y-0 left-0 rounded-full ${t.rank === 1 ? 'bg-king/80' : 'bg-white/40'}`}
                            style={{ width: `${t.score}%` }}
                          />
                        </span>
                        <span className="font-mono text-[12px] font-semibold tnum text-textPrimary">{t.score}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[12px] tnum text-textPrimary">
                      {t.bps >= 0 ? '+' : ''}
                      {t.bps}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono text-[12px] tnum text-textPrimary ${t.nbr >= 1.5 ? 'font-bold' : ''}`}>
                      {t.nbr.toFixed(2)}x
                    </td>
                    <td className="hidden lg:table-cell px-3 py-2.5 text-right font-mono text-[12px] tnum text-textPrimary">
                      {t.volume.toLocaleString()}
                    </td>
                    <td className="hidden lg:table-cell px-3 py-2.5 text-right font-mono text-[12px] tnum text-textPrimary">
                      {t.openInterest.toLocaleString()}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono text-[12px] font-semibold tnum ${t.netGex >= 0 ? 'text-bull' : 'text-bear'}`}>
                      {fmtUsd(t.netGex)}
                    </td>
                    <td className={`hidden sm:table-cell px-3 py-2.5 text-right font-mono text-[10px] font-semibold uppercase tracking-wider ${CLASS_TEXT[t.hedgingClass]}`}>
                      {t.hedgingClass}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
};

export default RankedTargets;
