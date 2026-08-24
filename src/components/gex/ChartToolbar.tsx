/*
==================================================
  SLAYER TERMINAL - CHART TOOLBAR
  The big chart's control strip: timeframes, an
  Overlays multi-select (every layer independent),
  the candle theme, and fullscreen takeover. Compact
  dropdowns, terminal grammar.
==================================================
*/

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Grid2x2, Layers, Maximize2, Minimize2, PencilLine, Play } from 'lucide-react';
import { TIMEFRAMES, type Timeframe } from '../../data/timeframe';
import {
  CANDLE_THEMES,
  CANDLE_THEME_OPTIONS,
  setCandleTheme,
  useCandleThemeKey,
  type CandleTheme,
  type CandleThemeKey,
} from './candleTheme';
import type { ChartOverlays } from './StrikeChart';

interface ChartToolbarProps {
  timeframe: Timeframe;
  onTimeframe: (tf: Timeframe) => void;
  overlays: ChartOverlays;
  onOverlays: (next: ChartOverlays) => void;
  /** Minimal mode: timeframes + overlays only (expanded flow-board charts). */
  minimal?: boolean;
  /** Adds the candle-theme dropdown back in minimal mode (4-way board cells). */
  candles?: boolean;
  /** Restrict the Overlays menu to these keys — a chart that can't draw a
      layer must not offer its toggle (campaign map: levels + volume only). */
  overlayKeys?: (keyof ChartOverlays)[];
  /** Span the full width: timeframes pinned left, every other control pushed
      right (fullscreen stays last, so it lands furthest right). The divider
      becomes the invisible spacer that does the pushing. */
  spread?: boolean;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  drawing?: boolean;
  onToggleDrawing?: () => void;
  replay?: boolean;
  onToggleReplay?: () => void;
  /** Opens the 4-way board page — four charts, each with its own controls. */
  onOpenQuad?: () => void;
}

const TIMEFRAME_OPTIONS = TIMEFRAMES.map(t => ({ value: t.value, label: t.label }));

/** Bare timeframe strip — floating labels, no box, no dividers. The active
    one earns a soft chip (white = where you are); the rest are ghost text. */
const TimeframeStrip = ({ value, onChange }: { value: Timeframe; onChange: (tf: Timeframe) => void }) => (
  <div role="group" aria-label="Timeframe" className="inline-flex items-center gap-0.5">
    {TIMEFRAME_OPTIONS.map(opt => {
      const active = opt.value === value;
      return (
        <button
          key={opt.value}
          aria-pressed={active}
          onClick={() => onChange(opt.value)}
          className={`px-2 py-1 rounded font-mono text-[11px] transition-colors ${
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

const OVERLAY_ITEMS: { key: keyof ChartOverlays; label: string; hint: string }[] = [
  { key: 'trails', label: 'Exposure trails', hint: 'LED strike bands — strength & fade' },
  { key: 'levels', label: 'Key levels', hint: 'CW · PW · flip · king axis chips' },
  { key: 'darkpool', label: 'Dark pool', hint: 'Off-exchange print lines' },
  { key: 'volume', label: 'Volume', hint: 'Session bars along the floor' },
];

/** Small anchored dropdown with outside-click dismissal. */
const Dropdown = ({
  label,
  icon,
  open,
  onToggle,
  children,
}: {
  label: string;
  icon?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) => (
  <div className="relative">
    <button
      onClick={onToggle}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border font-mono text-[10px] uppercase tracking-wider transition-colors ${
        open
          ? 'border-borderMuted bg-white/[0.05] text-textPrimary'
          : 'border-borderSubtle bg-white/[0.02] text-textSecondary hover:text-textPrimary'
      }`}
    >
      {icon}
      {label}
      <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && (
      <div className="absolute right-0 top-full mt-1 z-40 min-w-[210px] border border-borderMuted bg-panel rounded-md shadow-2xl shadow-black/60 overflow-hidden animate-slide-in">
        {children}
      </div>
    )}
  </div>
);

const ChartToolbar = ({
  timeframe,
  onTimeframe,
  overlays,
  onOverlays,
  minimal = false,
  candles = false,
  overlayKeys,
  spread = false,
  fullscreen = false,
  onToggleFullscreen,
  drawing = false,
  onToggleDrawing,
  replay = false,
  onToggleReplay,
  onOpenQuad,
}: ChartToolbarProps) => {
  const themeKey = useCandleThemeKey();
  const [openMenu, setOpenMenu] = useState<'overlays' | 'candles' | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Outside click closes whichever menu is open
  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [openMenu]);

  const activeCandleLabel = CANDLE_THEME_OPTIONS.find(o => o.value === themeKey)?.label ?? 'Chrome';
  const overlayItems = overlayKeys ? OVERLAY_ITEMS.filter(i => overlayKeys.includes(i.key)) : OVERLAY_ITEMS;
  const activeOverlayCount = overlayItems.filter(i => overlays[i.key]).length;

  return (
    <div ref={rootRef} className={`flex items-center gap-2 flex-wrap ${spread ? 'w-full' : ''}`}>
      <TimeframeStrip value={timeframe} onChange={onTimeframe} />

      {/* Spread mode: the divider stops being a line and becomes the spacer
          that shoves every following control to the right edge. */}
      <span className={spread ? 'ml-auto' : 'w-px h-4 bg-borderSubtle'} aria-hidden />

      <Dropdown
        label={`Overlays ${activeOverlayCount}`}
        icon={<Layers className="w-3 h-3" />}
        open={openMenu === 'overlays'}
        onToggle={() => setOpenMenu(m => (m === 'overlays' ? null : 'overlays'))}
      >
        <div className="p-1.5 flex flex-col gap-0.5">
          {overlayItems.map(item => {
            const on = overlays[item.key];
            return (
              <button
                key={item.key}
                onClick={() => onOverlays({ ...overlays, [item.key]: !on })}
                className="flex items-start gap-2.5 px-2.5 py-2 rounded text-left hover:bg-white/[0.03] transition-colors"
              >
                <span
                  className={`mt-px inline-flex w-3.5 h-3.5 shrink-0 items-center justify-center rounded-[3px] border ${
                    on ? 'bg-select border-select' : 'border-borderMuted'
                  }`}
                >
                  {on && <Check className="w-2.5 h-2.5 text-[#0a0a0a]" />}
                </span>
                <span className="min-w-0">
                  <span className={`block font-mono text-[11px] font-semibold ${on ? 'text-textPrimary' : 'text-textSecondary'}`}>
                    {item.label}
                  </span>
                  <span className="block text-[10px] text-textSecondary leading-snug">{item.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Dropdown>

      {(!minimal || candles) && (
      <Dropdown
        /* Minimal surfaces (desk widgets) drop the theme name from the
           trigger — at panel width the long label wrapped Expand off the
           row's right edge; the menu itself still shows the active theme. */
        label={minimal ? 'Candles' : `Candles · ${activeCandleLabel}`}
        open={openMenu === 'candles'}
        onToggle={() => setOpenMenu(m => (m === 'candles' ? null : 'candles'))}
      >
        <div className="p-1.5 flex flex-col gap-0.5">
          {CANDLE_THEME_OPTIONS.map(opt => {
            const t: CandleTheme = CANDLE_THEMES[opt.value];
            const hollowUp = t.borderUp !== undefined && t.borderUp !== t.up;
            return (
              <button
                key={opt.value}
                onClick={() => {
                  setCandleTheme(opt.value as CandleThemeKey);
                  setOpenMenu(null);
                }}
                className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded font-mono text-[11px] transition-colors ${
                  opt.value === themeKey
                    ? 'bg-white/[0.06] text-textPrimary font-semibold'
                    : 'text-textSecondary hover:text-textPrimary hover:bg-white/[0.03]'
                }`}
              >
                {/* Swatch = the theme's own surface with its up/down pair on it */}
                <span
                  className="inline-flex h-4 w-7 shrink-0 items-center justify-center gap-[3px] rounded-[3px] border border-white/10"
                  style={{ background: t.canvas?.bg ?? '#111214' }}
                >
                  <span
                    className="w-[5px] h-[10px] rounded-[1px]"
                    style={
                      hollowUp
                        ? { boxShadow: `inset 0 0 0 1px ${t.borderUp}` }
                        : { background: t.up }
                    }
                  />
                  <span className="w-[5px] h-[10px] rounded-[1px]" style={{ background: t.down }} />
                </span>
                {opt.label}
                {opt.value === themeKey && <Check className="w-3 h-3 ml-auto text-select" />}
              </button>
            );
          })}
        </div>
      </Dropdown>
      )}

      {!minimal && (
        <>
          <button
            onClick={onToggleDrawing}
            title={drawing ? 'Exit draw mode' : 'Draw on the chart'}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border font-mono text-[10px] uppercase tracking-wider transition-colors ${
              drawing
                ? 'border-select/60 bg-select/10 text-select'
                : 'border-borderSubtle bg-white/[0.02] text-textSecondary hover:text-textPrimary hover:border-borderMuted'
            }`}
          >
            <PencilLine className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onToggleReplay}
            title={replay ? 'Exit replay' : 'Replay session history'}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border font-mono text-[10px] uppercase tracking-wider transition-colors ${
              replay
                ? 'border-select/60 bg-select/10 text-select'
                : 'border-borderSubtle bg-white/[0.02] text-textSecondary hover:text-textPrimary hover:border-borderMuted'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            Replay
          </button>

        </>
      )}

      {/* Renders whenever wired, minimal mode included — the desk's chart
          widget is the door to /pulse/board since the old Pulse page retired
          (2026-08-17). Same rule as fullscreen below. */}
      {onOpenQuad && (
        <button
          onClick={onOpenQuad}
          title="4-way board — four charts, each with its own controls"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-borderSubtle bg-white/[0.02] font-mono text-[10px] uppercase tracking-wider text-textSecondary hover:text-textPrimary hover:border-borderMuted transition-colors"
        >
          <Grid2x2 className="w-3.5 h-3.5" />
        </button>
      )}

      {onToggleFullscreen && (
        <button
          onClick={onToggleFullscreen}
          title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen chart'}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-borderSubtle bg-white/[0.02] font-mono text-[10px] uppercase tracking-wider text-textSecondary hover:text-textPrimary hover:border-borderMuted transition-colors"
        >
          {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );
};

export default ChartToolbar;
