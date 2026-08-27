/*
==================================================
  SLAYER TERMINAL - WORKSPACE STRIKE PRESSURE LADDER
  The heatmap widget's successor (Mo, 2026-08-19).
  Each copy on the desk keeps its own expiry, strike
  range and instrument lens, so one panel can watch
  same-day gamma while the panel beside it watches
  OPEX on the same name.

  It rebuilds from ctx.snapshot rather than reading
  ctx.exposure, because ctx.exposure is the desk's
  view (0DTE, ±10) and this panel is allowed to
  disagree with it. No 1s pulse: the old heatmap
  "breathed" on a cosmetic modulation — a ladder
  moves only when the book does.
==================================================
*/

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Maximize2, Minimize2 } from 'lucide-react';
import StrikePressureLadder from '../../components/gex/StrikePressureLadder';
import SignalBadge from '../../components/ui/SignalBadge';
import RichRead from '../../components/ui/RichRead';
import { useFadeClose } from '../../components/ui/useFadeClose';
import { buildExposureProfile, STRIKE_WINDOWS, type StrikeWindow } from '../../data/exposure';
import { readHeatPattern } from '../../data/gex';
import { netSinceOpenRatio } from '../../data/levelview';
import { twinFamilyFor, twinLabel, twinMeasureFor, twinPrice, fmtTwin, type TwinLensKey } from '../../data/indexTwins';
import type { Tone } from '../../components/ui/tones';
import type { ExposureExpiry, HeatPatternRead } from '../../types/gex';
import type { WorkspaceCtx } from './registry';

/** Pattern chip tone follows the read's direction — the engine's verdict
    wears its own color, never the field's. */
const PATTERN_TONE: Record<HeatPatternRead['direction'], Tone> = {
  BULLISH: 'bull',
  BEARISH: 'bear',
  RANGE: 'neutral',
  VOLATILE: 'warn',
};

/** The time axis, as a control above the ladder — not a grid beside it. */
const EXPIRIES: { value: ExposureExpiry; label: string }[] = [
  { value: '0DTE', label: '0DTE' },
  { value: '1D', label: '1D' },
  { value: '2D', label: '2D' },
  { value: '5D', label: '5D' },
  { value: '7D', label: '7D' },
  { value: 'OPEX', label: 'OPEX' },
  { value: 'ALL', label: 'All' },
];
/** ±10 for the day's fight, ±30 for the whole book — the tail hedges live out there */
const RANGES: StrikeWindow[] = STRIKE_WINDOWS;

/** Bare strip in the chart-toolbar grammar — active earns a soft chip, the
    rest are ghost text. No box, no dividers. */
const Strip = <T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
}) => (
  <div role="group" aria-label={label} className="inline-flex items-center gap-0.5">
    {options.map(opt => {
      const active = opt.value === value;
      return (
        <button
          key={String(opt.value)}
          aria-pressed={active}
          onClick={() => onChange(opt.value)}
          className={`px-1.5 py-1 rounded font-mono text-[10px] transition-colors ${
            active
              ? 'bg-white/[0.07] text-textPrimary font-semibold'
              : 'text-textMuted hover:text-textPrimary hover:bg-white/[0.03]'
          }`}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);

const StrikeLadderWidget = ({ ctx }: { ctx: WorkspaceCtx }) => {
  const [expiry, setExpiry] = useState<ExposureExpiry>('0DTE');
  const [range, setRange] = useState<StrikeWindow>(10);
  /* The instrument lens (Noah, 2026-08-18): on index families the strikes,
     the pattern read and the basis chip re-denominate — SPY · SPX · ES. */
  const [lens, setLens] = useState<TwinLensKey>('etf');
  const [full, setFull] = useState(false);
  const fam = twinFamilyFor(ctx.ticker);
  const activeLens: TwinLensKey = fam ? lens : 'etf';
  const { closing, close } = useFadeClose(() => setFull(false));

  // Same takeover contract as the chart: Esc exits (fading), page scroll
  // locks under it.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [full, close]);

  // Scan-tier: ctx.snapshot is the desk's 10s reference, so the ladder holds
  // still between sweeps and re-reads at once on a name change.
  const data = useMemo(() => {
    try {
      return buildExposureProfile(ctx.snapshot, expiry, range);
    } catch {
      return null;
    }
  }, [ctx.snapshot, expiry, range]);

  // The engine names the book's configuration — the strip above the ladder
  // is its voice. Under a lens the levels convert FIRST, so the read prints
  // the instrument's prices.
  /* T-17: one measurement per scan tick backs every conversion below. */
  const tm = useMemo(() => (fam ? twinMeasureFor(fam) : null), [fam, data]);

  const pattern = useMemo(() => {
    if (!data) return null;
    const { levels } = data;
    if (!fam || !tm || activeLens === 'etf') return readHeatPattern(levels);
    const c = (v: number) => twinPrice(fam, activeLens, v, tm);
    return readHeatPattern({
      spot: c(levels.spot),
      flip: c(levels.flip),
      callWall: c(levels.callWall),
      putWall: c(levels.putWall),
      king: c(levels.king),
    });
  }, [data, fam, tm, activeLens]);

  // The ghost spine's data — net at the open vs now, per strike — on the
  // same scan clock as the ladder.
  const openRatio = useMemo(
    () => netSinceOpenRatio(ctx.ticker),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.snapshot, ctx.ticker]
  );

  // Strike column in the lens's terms — the ladder itself stays the ETF book.
  const strikeFormat = useMemo(() => {
    if (!fam || !tm || activeLens === 'etf' || !data) return undefined;
    return (s: number) => fmtTwin(twinPrice(fam, activeLens, s, tm));
  }, [fam, tm, activeLens, data]);

  const body = (
    <div className="h-full min-h-0 flex flex-col">
      {/* Controls sit in the body — the header is the drag handle. */}
      <div className="shrink-0 px-2 py-1.5 border-b border-borderSubtle/60 flex items-center gap-2 flex-wrap">
        {full && (
          <button
            onClick={close}
            className="group inline-flex items-center gap-1.5 border border-borderSubtle hover:border-borderMuted rounded-md px-2.5 py-1 font-mono text-[10px] text-textSecondary hover:text-textPrimary transition-colors"
          >
            <ArrowLeft className="w-3 h-3 transition-transform duration-200 ease-out group-hover:-translate-x-0.5" /> Back
          </button>
        )}
        <Strip label="Expiry" value={expiry} options={EXPIRIES} onChange={setExpiry} />
        <span className="w-px h-3.5 bg-borderSubtle" />
        <Strip label="Strike range" value={range} options={RANGES.map(r => ({ value: r, label: `±${r}` }))} onChange={setRange} />
        {fam && (
          <>
            <span className="w-px h-3.5 bg-borderSubtle" />
            <Strip
              label="Instrument"
              value={activeLens}
              options={(['etf', 'index', 'futures'] as TwinLensKey[]).map(k => ({ value: k, label: twinLabel(fam, k) }))}
              onChange={setLens}
            />
            {data && tm && (
              <span className="font-mono text-[9px] text-textMuted tnum">
                {fam.futures} {fmtTwin(twinPrice(fam, 'futures', data.levels.spot, tm))} · +
                {fmtTwin(tm.basis)} over {fam.index} {tm.sampled > 0 ? `· measured ${tm.sampled}m` : '· inferred'}
              </span>
            )}
          </>
        )}
        <button
          onClick={() => (full ? close() : setFull(true))}
          title={full ? 'Exit fullscreen (Esc)' : 'Fullscreen ladder'}
          className="ml-auto shrink-0 p-1 rounded text-textMuted hover:text-textPrimary hover:bg-white/[0.05] transition-colors"
        >
          {full ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
        </button>
      </div>
      {/* The pattern strip — what the ladder below actually says. */}
      {pattern && (
        <div className="shrink-0 px-2.5 py-1.5 border-b border-borderSubtle/60 flex items-center gap-2">
          <SignalBadge tone={PATTERN_TONE[pattern.direction]} dot>
            {pattern.key}
          </SignalBadge>
          <p className="min-w-0 text-[11px] text-textSecondary leading-snug">
            <RichRead text={pattern.read} />
          </p>
        </div>
      )}
      <div className="flex-1 min-h-0">
        {data ? (
          <StrikePressureLadder data={data} strikeFormat={strikeFormat} openRatio={openRatio} fill />
        ) : (
          <div className="h-full grid place-items-center font-mono text-[11px] text-textMuted">
            No exposure for {ctx.ticker}
          </div>
        )}
      </div>
    </div>
  );

  // Portal, not a plain fixed div: react-grid-layout positions panels with CSS
  // transforms, and a transformed ancestor becomes the containing block for
  // position:fixed — so an in-place overlay would size itself to the widget
  // instead of the viewport. Escaping to <body> is the only way out.
  return full
    ? createPortal(
        <div
          className={`fixed inset-0 z-[80] bg-canvas p-3 flex flex-col animate-soft-in transition-opacity duration-200 ease-out ${
            closing ? 'opacity-0' : ''
          }`}
        >
          <div className="flex-1 min-h-0 border border-borderSubtle bg-panel rounded-lg overflow-hidden">{body}</div>
        </div>,
        document.body
      )
    : body;
};

export default StrikeLadderWidget;
