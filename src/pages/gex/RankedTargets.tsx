import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
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
  'DOWNSIDE CUSHION': 'rgba(199,211,232,0.85)',
  'UPSIDE RESISTANCE': 'rgba(255,59,48,0.75)',
  MAGNET: 'rgba(234,0,255,0.8)',
  NEUTRAL: 'transparent',
};

const fmtStrike = (v: number) => (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));

/** Small two-tone C/P chip — never a banner. */
const CpChip = ({ t }: { t: RankedTarget }) => {
  const total = t.callVol + t.putVol || 1;
  const callPct = Math.round((t.callVol / total) * 100);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="flex w-12 h-[4px] rounded-full overflow-hidden bg-white/[0.06]">
        <span className="h-full bg-bull/90" style={{ width: `${callPct}%` }} />
        <span className="h-full bg-bear/80" style={{ width: `${100 - callPct}%` }} />
      </span>
      <span className="font-mono text-[10px] tnum text-textPrimary">{callPct}%C</span>
    </span>
  );
};

// ---- podium: the three strikes that own the day ------------------------------

const PodiumCard = ({ t, onFlash }: { t: RankedTarget; onFlash: () => void }) => {
  const isPrimary = t.rank === 1;
  return (
    <motion.button
      layout
      layoutId={`rt-${t.strike}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ layout: { type: 'spring', stiffness: 340, damping: 32 }, opacity: { duration: 0.18 } }}
      onClick={onFlash}
      title="Flash on chart"
      className={`group relative text-left rounded-md border overflow-hidden transition-colors ${
        isPrimary
          ? 'border-[#EA00FF]/35 bg-[#EA00FF]/[0.035] hover:bg-[#EA00FF]/[0.06]'
          : 'border-borderSubtle bg-inset hover:border-borderMuted hover:bg-white/[0.02]'
      }`}
      style={{ boxShadow: `inset 2px 0 0 0 ${CLASS_EDGE[t.hedgingClass]}` }}
    >
      {/* Header — rank, strike, tags · score */}
      <div className="flex items-start gap-2 px-3.5 pt-3">
        <div className="flex items-baseline gap-2 flex-wrap min-w-0">
          <span className="font-mono text-[10px] tnum text-textSecondary">#{t.rank}</span>
          <span className="font-mono text-[18px] font-bold tnum text-textPrimary">{fmtStrike(t.strike)}</span>
          {t.tags.map(tag => (
            <SignalBadge key={tag} tone={TAG_TONE[tag]}>
              {tag}
            </SignalBadge>
          ))}
        </div>
        <div className="ml-auto text-right shrink-0">
          <span className="block font-mono text-[9px] uppercase tracking-widest text-textSecondary">Score</span>
          <span className={`block font-mono text-[20px] font-bold tnum leading-tight ${isPrimary ? 'text-king' : 'text-textPrimary'}`}>
            {t.score}
          </span>
        </div>
        <ArrowUpRight className="absolute top-2.5 right-2.5 w-3 h-3 text-textMuted opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Score bar */}
      <div className="px-3.5 mt-1.5">
        <span className="block relative h-[3px] rounded-full bg-white/[0.06]">
          <span
            className={`absolute inset-y-0 left-0 rounded-full ${isPrimary ? 'bg-[#EA00FF]/80' : 'bg-white/40'}`}
            style={{ width: `${t.score}%` }}
          />
        </span>
      </div>

      {/* Stats — neutral ink; color is reserved for the verdict */}
      <div className="px-3.5 mt-3 grid grid-cols-4 gap-2">
        {[
          { label: 'BPS', value: `${t.bps >= 0 ? '+' : ''}${t.bps}` },
          { label: 'NBR', value: `${t.nbr.toFixed(2)}x`, strong: t.nbr >= 1.5 },
          { label: 'Volume', value: t.volume.toLocaleString() },
          { label: 'Open Int', value: t.openInterest.toLocaleString() },
        ].map(s => (
          <div key={s.label}>
            <span className="block font-mono text-[9px] uppercase tracking-widest text-textSecondary">{s.label}</span>
            <span className={`block font-mono text-[12px] tnum ${s.strong ? 'text-textPrimary font-bold' : 'text-textPrimary'}`}>
              {s.value}
            </span>
          </div>
        ))}
      </div>

      {/* Verdict strip — the only place color speaks */}
      <div className="mt-3 px-3.5 py-2 border-t border-borderSubtle/60 flex items-center gap-2">
        <span className={`font-mono text-[13px] font-semibold tnum ${t.netGex >= 0 ? 'text-bull' : 'text-bear'}`}>
          {fmtUsd(t.netGex)}
        </span>
        <span className={`font-mono text-[9px] font-semibold uppercase tracking-wider ${t.pressure === 'SUPPORT' ? 'text-bull' : 'text-bear'}`}>
          {t.pressure}
        </span>
        <span className="ml-3">
          <CpChip t={t} />
        </span>
        <span className={`ml-auto font-mono text-[10px] font-semibold uppercase tracking-wider ${CLASS_TEXT[t.hedgingClass]}`}>
          {t.hedgingClass}
        </span>
      </div>
    </motion.button>
  );
};

// ---- ladder: the tail, dense and calm ----------------------------------------

const LadderRow = ({ t, onFlash }: { t: RankedTarget; onFlash: () => void }) => (
  <motion.button
    layout
    layoutId={`rt-${t.strike}`}
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ layout: { type: 'spring', stiffness: 340, damping: 32 }, opacity: { duration: 0.18 } }}
    onClick={onFlash}
    title="Flash on chart"
    className="group w-full flex items-center gap-3 px-3.5 h-11 text-left border-b border-borderSubtle/30 last:border-0 transition-colors hover:bg-white/[0.03]"
    style={{ boxShadow: `inset 2px 0 0 0 ${CLASS_EDGE[t.hedgingClass]}` }}
  >
    <span className="w-7 shrink-0 font-mono text-[10px] tnum text-textSecondary">#{t.rank}</span>
    <span className="w-40 shrink-0 flex items-center gap-1.5 min-w-0">
      <span className="font-mono text-[12px] font-bold tnum text-textPrimary">{fmtStrike(t.strike)}</span>
      {t.tags.map(tag => (
        <SignalBadge key={tag} tone={TAG_TONE[tag]}>
          {tag}
        </SignalBadge>
      ))}
    </span>
    <span className="hidden md:flex items-center gap-2 w-24 shrink-0">
      <span className="relative flex-1 h-[3px] rounded-full bg-white/[0.06]">
        <span className="absolute inset-y-0 left-0 rounded-full bg-white/40" style={{ width: `${t.score}%` }} />
      </span>
      <span className="font-mono text-[11px] font-semibold tnum text-textPrimary">{t.score}</span>
    </span>
    <span className="w-14 shrink-0 text-right font-mono text-[11px] tnum text-textPrimary">
      {t.bps >= 0 ? '+' : ''}
      {t.bps}
    </span>
    <span className={`w-14 shrink-0 text-right font-mono text-[11px] tnum text-textPrimary ${t.nbr >= 1.5 ? 'font-bold' : ''}`}>
      {t.nbr.toFixed(2)}x
    </span>
    <span className="hidden lg:block w-20 shrink-0 text-right font-mono text-[11px] tnum text-textPrimary">
      {t.volume.toLocaleString()}
    </span>
    <span className="hidden lg:block w-20 shrink-0 text-right font-mono text-[11px] tnum text-textPrimary">
      {t.openInterest.toLocaleString()}
    </span>
    <span className="hidden xl:block shrink-0">
      <CpChip t={t} />
    </span>
    <span className={`ml-auto w-24 shrink-0 text-right font-mono text-[11px] font-semibold tnum ${t.netGex >= 0 ? 'text-bull' : 'text-bear'}`}>
      {fmtUsd(t.netGex)}
    </span>
    <span className={`hidden sm:block w-36 shrink-0 text-right font-mono text-[9px] font-semibold uppercase tracking-wider ${CLASS_TEXT[t.hedgingClass]}`}>
      {t.hedgingClass}
    </span>
  </motion.button>
);

/** Ladder column captions — one whisper, not one per row. */
const LadderHead = () => (
  <div className="flex items-center gap-3 px-3.5 h-7 border-b border-borderSubtle bg-[#0c0c0c] select-none">
    <span className="w-7 shrink-0 font-mono text-[9px] uppercase tracking-widest text-textSecondary">Rank</span>
    <span className="w-40 shrink-0 font-mono text-[9px] uppercase tracking-widest text-textSecondary">Strike</span>
    <span className="hidden md:block w-24 shrink-0 font-mono text-[9px] uppercase tracking-widest text-textSecondary">Score</span>
    <span className="w-14 shrink-0 text-right font-mono text-[9px] uppercase tracking-widest text-textSecondary">BPS</span>
    <span className="w-14 shrink-0 text-right font-mono text-[9px] uppercase tracking-widest text-textSecondary">NBR</span>
    <span className="hidden lg:block w-20 shrink-0 text-right font-mono text-[9px] uppercase tracking-widest text-textSecondary">Volume</span>
    <span className="hidden lg:block w-20 shrink-0 text-right font-mono text-[9px] uppercase tracking-widest text-textSecondary">Open Int</span>
    <span className="hidden xl:block w-[76px] shrink-0 font-mono text-[9px] uppercase tracking-widest text-textSecondary">C/P</span>
    <span className="ml-auto w-24 shrink-0 text-right font-mono text-[9px] uppercase tracking-widest text-textSecondary">Net GEX</span>
    <span className="hidden sm:block w-36 shrink-0 text-right font-mono text-[9px] uppercase tracking-widest text-textSecondary">Class</span>
  </div>
);

const RankedTargets = () => {
  const { marketData } = useMarketData();
  const navigate = useNavigate();
  const [isolator, setIsolator] = useState<Isolator>('ALL');

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
  const podium = filtered.slice(0, 3);
  const ladder = filtered.slice(3);

  return (
    <>
      {/* Controls + primary target */}
      <div className="flex items-center gap-3 flex-wrap">
        <SegmentedControl ariaLabel="Strategy isolator" options={ISOLATOR_OPTIONS} value={isolator} onChange={setIsolator} />
        {primary && (
          <button
            onClick={() => flash(primary)}
            className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-[#EA00FF]/30 bg-[#EA00FF]/[0.05] hover:bg-[#EA00FF]/[0.1] transition-colors"
            title="Flash on chart"
          >
            <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-king">Primary target</span>
            <span className="font-mono text-[11px] font-bold tnum text-textPrimary">{fmtStrike(primary.strike)}</span>
            <span className="font-mono text-[10px] tnum text-king">{primary.score}/100</span>
            <ArrowUpRight className="w-3 h-3 text-textSecondary" />
          </button>
        )}
        <span className="ml-auto font-mono text-[10px] text-textMuted uppercase tracking-widest tnum">
          {filtered.length} of {view.targets.length} strikes · scan {lastScanAt} · 10s
        </span>
      </div>

      {/* Ranked ladder — podium up top, dense rows for the tail */}
      <Panel
        title="Ranked Targets"
        subtitle="priority strikes — click to flash on the chart"
        flush
        className="w-full"
      >
        {filtered.length === 0 ? (
          <div className="py-10 text-center font-mono text-[11px] text-textMuted uppercase tracking-widest">
            No strikes match this isolator
          </div>
        ) : (
          <LayoutGroup>
            <div className="p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <AnimatePresence initial={false} mode="popLayout">
                {podium.map(t => (
                  <PodiumCard key={t.strike} t={t} onFlash={() => flash(t)} />
                ))}
              </AnimatePresence>
            </div>
            {ladder.length > 0 && (
              <div className="border-t border-borderSubtle">
                <LadderHead />
                <div className="overflow-y-auto max-h-[480px]">
                  <AnimatePresence initial={false} mode="popLayout">
                    {ladder.map(t => (
                      <LadderRow key={t.strike} t={t} onFlash={() => flash(t)} />
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </LayoutGroup>
        )}
      </Panel>
    </>
  );
};

export default RankedTargets;
