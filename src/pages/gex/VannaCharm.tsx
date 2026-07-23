import { useEffect, useMemo, useRef, useState } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildVannaCharm } from '../../data/vannacharm';
import { fmtUsd } from '../../data/gex';
import Panel from '../../components/ui/Panel';
import SegmentedControl from '../../components/ui/SegmentedControl';
import SignalBadge from '../../components/ui/SignalBadge';
import StatCard from '../../components/ui/StatCard';
import MigrationMap from '../../components/gex/vannacharm/MigrationMap';
import LevelShiftList from '../../components/gex/vannacharm/LevelShiftList';
import WallDrift from '../../components/gex/vannacharm/WallDrift';
import type { MarketSnapshot } from '../../types/market';
import type { IvShift, ShiftMode, VannaCharmView } from '../../types/gex';
import type { Tone } from '../../components/ui/tones';

/** Migration projections sweep on the scan tier. */
const SCAN_INTERVAL_MS = 10_000;

const MODE_OPTIONS = [
  { value: 'CHARM', label: 'Charm · into close' },
  { value: 'VANNA', label: 'Vanna · IV shift' },
] as const;

const IV_OPTIONS = [
  { value: '-2', label: '−2 vol' },
  { value: '-1', label: '−1' },
  { value: '1', label: '+1' },
  { value: '2', label: '+2 vol' },
] as const;

// Strike-focus filter — the vanna/charm feed is a single-expiry strike window,
// so "focus" narrows the existing rows by side / activity rather than by expiry.
const FOCUS_OPTIONS = [
  { value: 'ALL', label: 'All strikes' },
  { value: 'UP', label: 'Above spot' },
  { value: 'DOWN', label: 'Below spot' },
  { value: 'MOVERS', label: 'Movers' },
] as const;
type Focus = (typeof FOCUS_OPTIONS)[number]['value'];

const VIEW_OPTIONS = [
  { value: 'STRIKE', label: 'Per-strike' },
  { value: 'CUML', label: 'Cumulative' },
] as const;
type ContribView = (typeof VIEW_OPTIONS)[number]['value'];

const FOCUS_LABEL: Record<Focus, string> = {
  ALL: 'all strikes',
  UP: 'above spot',
  DOWN: 'below spot',
  MOVERS: 'movers only',
};

const fmtStrike = (v: number) => (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));
const signTone = (v: number): Tone => (v > 0 ? 'bull' : v < 0 ? 'bear' : 'neutral');
const signedUsd = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtUsd(Math.abs(v))}`;

interface Contrib {
  strike: number;
  pin?: boolean;
  current: number;
  projected: number;
  delta: number;
  absShift: number;
}

interface Cuml {
  n: number;
  cur: number;
  proj: number;
  delta: number;
  curUp: number;
  projUp: number;
  dUp: number;
  curDn: number;
  projDn: number;
  dDn: number;
}

/** Ranked largest contributors — biggest |Δ net GEX| under the scenario. */
const ContributorList = ({ rows, max }: { rows: Contrib[]; max: number }) => (
  <div className="flex flex-col">
    <div className="flex items-center gap-3 px-2 py-1.5 border-b border-borderSubtle font-mono text-label font-semibold uppercase tracking-widest text-textMuted select-none">
      <span className="w-16 shrink-0">Strike</span>
      <span className="flex-1 min-w-0">Shift |Δ|</span>
      <span className="w-44 shrink-0 text-right">Now → Proj</span>
      <span className="w-24 shrink-0 text-right">Δ</span>
    </div>
    {rows.map(r => {
      const up = r.delta >= 0;
      const w = Math.max(2, (r.absShift / (max || 1)) * 100);
      return (
        <div
          key={r.strike}
          className={`flex items-center gap-3 px-2 py-2 border-b border-borderSubtle/30 last:border-0 ${r.pin ? 'bg-white/[0.03]' : ''}`}
        >
          <span className="w-16 shrink-0 font-mono text-caption font-semibold tnum text-textSecondary">
            {fmtStrike(r.strike)}
            {r.pin && <span className="ml-1 font-mono text-micro font-bold uppercase text-textPrimary">pin</span>}
          </span>
          <span className="relative flex-1 min-w-0 h-[6px] rounded-sm bg-white/[0.04] overflow-hidden">
            <span
              className={`absolute inset-y-0 left-0 rounded-sm ${up ? 'bg-bull/80' : 'bg-bear/80'}`}
              style={{ width: `${w}%` }}
            />
          </span>
          <span className="w-44 shrink-0 text-right font-mono text-label tnum text-textSecondary">
            {fmtUsd(r.current)} <span className="text-textMuted">→</span> {fmtUsd(r.projected)}
          </span>
          <span className={`w-24 shrink-0 text-right font-mono text-caption font-bold tnum ${up ? 'text-bull' : 'text-bear'}`}>
            {signedUsd(r.delta)}
          </span>
        </div>
      );
    })}
  </div>
);

/** Aggregate (Σ) view — running totals of the same rows, split above/below spot. */
const CumulativePanel = ({ c }: { c: Cuml }) => (
  <div className="flex flex-col gap-3">
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <StatCard label="Net now · Σ" value={signedUsd(c.cur)} tone={signTone(c.cur)} sub={`${c.n} strikes in focus`} />
      <StatCard label="Net projected · Σ" value={signedUsd(c.proj)} tone={signTone(c.proj)} sub="under the scenario" />
      <StatCard
        label="Net Δ · migration"
        value={signedUsd(c.delta)}
        tone={signTone(c.delta)}
        sub={c.delta >= 0 ? 'net gamma builds' : 'net gamma bleeds'}
      />
    </div>
    <div className="rounded-md inst-surface">
      <div className="grid grid-cols-[1fr_repeat(3,6rem)] gap-x-3 px-3 py-2 border-b border-borderSubtle font-mono text-label font-semibold uppercase tracking-widest text-textMuted select-none">
        <span>Region</span>
        <span className="text-right">Now</span>
        <span className="text-right">Proj</span>
        <span className="text-right">Δ</span>
      </div>
      {[
        { label: 'Above spot · calls', now: c.curUp, proj: c.projUp, d: c.dUp },
        { label: 'Below spot · puts', now: c.curDn, proj: c.projDn, d: c.dDn },
      ].map(r => (
        <div
          key={r.label}
          className="grid grid-cols-[1fr_repeat(3,6rem)] gap-x-3 items-center px-3 py-2 border-b border-borderSubtle/30 last:border-0"
        >
          <span className="font-mono text-caption font-semibold uppercase tracking-wider text-textSecondary">{r.label}</span>
          <span className="text-right font-mono text-label tnum text-textPrimary">{signedUsd(r.now)}</span>
          <span className="text-right font-mono text-label tnum text-textPrimary">{signedUsd(r.proj)}</span>
          <span
            className={`text-right font-mono text-caption font-bold tnum ${r.d > 0 ? 'text-bull' : r.d < 0 ? 'text-bear' : 'text-textMuted'}`}
          >
            {signedUsd(r.d)}
          </span>
        </div>
      ))}
    </div>
    <p className="font-mono text-label text-textMuted leading-relaxed">
      Σ sums net GEX across the {c.n} strikes shown. Δ is the projected − now migration: positive builds toward long
      gamma (stabilizing), negative bleeds toward short gamma (accelerant).
    </p>
  </div>
);

const VannaCharm = () => {
  const { marketData } = useMarketData();
  const [mode, setMode] = useState<ShiftMode>('CHARM');
  const [ivKey, setIvKey] = useState<'-2' | '-1' | '1' | '2'>('-1');
  const [focus, setFocus] = useState<Focus>('ALL');
  const [view, setView] = useState<ContribView>('STRIKE');

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

  const data = useMemo(
    () => (scanSnapshot ? buildVannaCharm(scanSnapshot, mode, Number(ivKey) as IvShift) : null),
    [scanSnapshot, mode, ivKey]
  );

  if (!data) {
    return (
      <Panel className="h-64" bodyClassName="flex items-center justify-center">
        <span className="font-mono text-label text-textMuted uppercase tracking-widest">
          Awaiting feed initialization…
        </span>
      </Panel>
    );
  }

  // ── Filter existing rows (no recompute — subset + read of computed values) ──
  const spot = data.spot;
  const focusRows =
    focus === 'UP'
      ? data.rows.filter(r => r.strike > spot)
      : focus === 'DOWN'
        ? data.rows.filter(r => r.strike < spot)
        : focus === 'MOVERS'
          ? data.rows.filter(r => r.projected !== r.current)
          : data.rows;

  // Map reads the same scale (data.maxAbs) so magnitudes stay comparable across filters.
  const mapData: VannaCharmView = { ...data, rows: focusRows.length ? focusRows : data.rows };

  // Largest contributors by |Δ net GEX|.
  const contributors: Contrib[] = focusRows
    .map(r => ({ ...r, delta: r.projected - r.current, absShift: Math.abs(r.projected - r.current) }))
    .sort((a, b) => b.absShift - a.absShift)
    .slice(0, 6);
  const maxContrib = contributors.reduce((m, c) => Math.max(m, c.absShift), 1);

  // Cumulative (Σ) roll-up of the same rows.
  const cuml: Cuml = focusRows.reduce<Cuml>(
    (acc, r) => {
      acc.n += 1;
      acc.cur += r.current;
      acc.proj += r.projected;
      if (r.strike > spot) {
        acc.curUp += r.current;
        acc.projUp += r.projected;
      } else if (r.strike < spot) {
        acc.curDn += r.current;
        acc.projDn += r.projected;
      }
      return acc;
    },
    { n: 0, cur: 0, proj: 0, delta: 0, curUp: 0, projUp: 0, dUp: 0, curDn: 0, projDn: 0, dDn: 0 }
  );
  cuml.delta = cuml.proj - cuml.cur;
  cuml.dUp = cuml.projUp - cuml.curUp;
  cuml.dDn = cuml.projDn - cuml.curDn;

  const ivNum = Number(ivKey);

  return (
    <>
      {/* Scenario controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <SegmentedControl ariaLabel="Migration mode" options={MODE_OPTIONS} value={mode} onChange={setMode} />
        {mode === 'VANNA' && (
          <SegmentedControl ariaLabel="IV shift" options={IV_OPTIONS} value={ivKey} onChange={setIvKey} />
        )}
        <span className="h-4 w-px bg-borderSubtle hidden sm:block" />
        <SegmentedControl ariaLabel="Strike focus" options={FOCUS_OPTIONS} value={focus} onChange={setFocus} />
        <span className="ml-auto font-mono text-label text-textMuted uppercase tracking-widest tnum">
          scan {lastScanAt} · 10s
        </span>
      </div>

      {/* Sign convention — stated up front so every value below reads unambiguously */}
      <div className="flex items-center gap-x-4 gap-y-2 flex-wrap rounded-md inst-surface px-3 py-2">
        <span className="font-mono text-label font-semibold uppercase tracking-widest text-textSecondary">
          Net GEX sign
        </span>
        <span className="flex items-center gap-2 font-mono text-label text-textMuted">
          <SignalBadge tone="bull">+ long gamma</SignalBadge> dealers dampen moves · stabilizing
        </span>
        <span className="flex items-center gap-2 font-mono text-label text-textMuted">
          <SignalBadge tone="bear">− short gamma</SignalBadge> dealers amplify moves · accelerant
        </span>
        <span className="ml-auto font-mono text-label text-textMuted uppercase tracking-wider">
          {mode === 'CHARM'
            ? 'Δ = into-close projection − now'
            : `Δ = IV ${ivNum > 0 ? '+' : ''}${ivNum} ${ivNum > 0 ? 'expansion' : 'crush'} − now`}
        </span>
      </div>

      {/* Migration map + shifts/narrative */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        <Panel
          title="Exposure Migration Map"
          subtitle={`${
            mode === 'CHARM' ? 'net gex — now vs close (charm decay)' : `net gex — now vs iv ${ivNum > 0 ? '+' : ''}${ivKey} (vanna)`
          }${focus === 'ALL' ? '' : ` · ${FOCUS_LABEL[focus]}`}`}
          flush
          className="xl:col-span-7 min-w-0"
          bodyClassName="flex flex-col max-h-[560px]"
        >
          <MigrationMap data={mapData} />
        </Panel>

        <div className="xl:col-span-5 min-w-0 flex flex-col gap-4">
          <Panel title="Level Shifts" subtitle="where the structure moves" flush className="w-full">
            <LevelShiftList shifts={data.shifts} />
          </Panel>
          <Panel title="Migration Read" subtitle="dominant flow, in english" className="w-full flex-1">
            <ul className="flex flex-col gap-2">
              {data.insights.map((line, i) => (
                <li key={i} className="flex items-start gap-2 text-label text-textSecondary leading-relaxed">
                  <span className="text-textMuted mt-px select-none">›</span>
                  <span className="tnum">{line}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      {/* Contribution breakdown — per-strike movers vs cumulative roll-up */}
      <Panel
        title="Migration Contribution"
        subtitle={view === 'STRIKE' ? 'largest movers by |Δ net gex|' : 'aggregate across shown strikes (Σ)'}
        className="w-full"
        actions={<SegmentedControl ariaLabel="Contribution view" options={VIEW_OPTIONS} value={view} onChange={setView} />}
        flush={view === 'STRIKE'}
      >
        {focusRows.length === 0 ? (
          <div className="py-6 text-center font-mono text-label text-textMuted uppercase tracking-widest">
            No strikes in focus
          </div>
        ) : view === 'STRIKE' ? (
          <ContributorList rows={contributors} max={maxContrib} />
        ) : (
          <CumulativePanel c={cuml} />
        )}
      </Panel>

      {/* Wall drift timeline */}
      <Panel
        title="Wall Drift"
        subtitle="session timeline — walls, flip & spot"
        className="w-full"
        bodyClassName="h-[240px]"
      >
        <WallDrift drift={data.drift} />
      </Panel>
    </>
  );
};

export default VannaCharm;
