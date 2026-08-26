/*
==================================================
  SLAYER TERMINAL - CHART TOOLBAR
  The big chart's control strip: timeframes, an
  Overlays multi-select (every layer independent),
  the candle theme, and fullscreen takeover. Compact
  dropdowns, terminal grammar.
==================================================
*/

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  Bell,
  CandlestickChart,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Fullscreen,
  Grid2x2,
  Layers,
  Maximize2,
  Minimize2,
  Palette,
  PencilLine,
  Play,
} from 'lucide-react';
import { TIMEFRAMES, type Timeframe } from '../../data/timeframe';
import {
  CANDLE_THEMES,
  CANDLE_THEME_OPTIONS,
  setCandleTheme,
  useCandleThemeKey,
  type CandleTheme,
  type CandleThemeKey,
} from './candleTheme';
import { CHART_STYLES, INDICATOR_INKS, type ChartIndicators, type ChartOverlays, type ChartStyle } from './StrikeChart';
import AlertsMenu from './AlertsMenu';

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
  /**
   * EVERY CONTROL AT ITS SMALLEST — for a strip that has to fit a phone.
   *
   * Two changes, and both are about line count rather than taste. The seven
   * timeframe buttons collapse into one trigger that opens them as a menu:
   * they need 251px laid out, which is most of a 390px screen and the single
   * biggest reason the strip wrapped. And every dropdown drops its word for
   * its icon, keeping the word as the hover/AT name — the same trade
   * `vertical` already makes for a side-docked toolbox.
   *
   * Measured at 390px: a 218px strip before, 75px after. (The phone host then
   * spends some of that back on 40px touch targets, landing at 105px — still
   * an eighth of the screen where the first attempt took a quarter.)
   */
  compact?: boolean;
  /** Stack the strip top-to-bottom — the floating toolbox docked to a side
      edge (Noah, 2026-08-23). Ignores `spread`. */
  vertical?: boolean;
  /** Which side the dropdown menus open toward — a side-docked toolbox has
      no room below itself. */
  menuSide?: MenuSide;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  drawing?: boolean;
  onToggleDrawing?: () => void;
  replay?: boolean;
  onToggleReplay?: () => void;
  /** The tape's SHAPE (candles/bars/line/…) — TradingView's picker, distinct
      from the color theme (Noah, 2026-08-23) */
  chartStyle?: ChartStyle;
  onChartStyle?: (s: ChartStyle) => void;
  /** Indicator overlays — EMAs, VWAP */
  indicators?: ChartIndicators;
  onIndicators?: (next: ChartIndicators) => void;
  /* Shows the Alerts menu. Both are needed: the symbol the alerts belong to,
     and where the market is — which fixes the side a new alert has to be
     crossed from, and seeds the box near the price rather than at zero. */
  alertTicker?: string;
  alertSpot?: number;
  /** Mode 3 (Noah, 2026-08-23): TOTAL fullscreen — the taskbar itself goes
      away and only Esc brings it back. TradingView's corner-bracket icon. */
  onTotalFullscreen?: () => void;
  /** Opens the 4-way board page — four charts, each with its own controls. */
  onOpenQuad?: () => void;
}

const TIMEFRAME_OPTIONS = TIMEFRAMES.map(t => ({ value: t.value, label: t.label }));

/** Bare timeframe strip — floating labels, no box, no dividers. The active
    one earns a BUBBLE (Noah, 2026-08-23): a fully-round chip that springs
    from timeframe to timeframe as one continuous piece, stretching to each
    label's width on the way. layoutId is namespaced per strip — the 4-way
    board mounts four of these and the bubbles must not jump between cells. */
const TimeframeStrip = ({
  value,
  onChange,
  vertical = false,
}: {
  value: Timeframe;
  onChange: (tf: Timeframe) => void;
  vertical?: boolean;
}) => {
  const uid = useId();
  return (
    <div
      role="group"
      aria-label="Timeframe"
      /* flex-wrap: a flex ITEM wider than its line does not split, it SPILLS,
         and the page starts scrolling sideways. Seven timeframes need 251px
         and a 390px screen gives the rail 213 once Terrain's layout picker is
         beside it. Wrapping changes nothing at any width where they already
         fit. */
      className={`inline-flex gap-0.5 ${vertical ? 'flex-col items-stretch' : 'flex-wrap items-center'}`}
    >
      {TIMEFRAME_OPTIONS.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`relative px-2 py-1 rounded-full font-mono text-[11px] transition-colors ${
              active
                ? 'text-textPrimary font-semibold'
                : 'text-textMuted hover:text-textPrimary hover:bg-white/[0.03]'
            }`}
          >
            {active && (
              <motion.span
                layoutId={`tf-bubble-${uid}`}
                className="absolute inset-0 rounded-full bg-white/[0.10]"
                transition={{ type: 'spring', stiffness: 480, damping: 28 }}
                aria-hidden
              />
            )}
            <span className="relative">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
};

/* TradingView-style glyphs beside each chart-style row (Noah, 2026-08-23) —
   hand-drawn 14px marks, all in the house white via currentColor. */
const STYLE_GLYPHS: Record<ChartStyle, ReactNode> = {
  bars: (
    <svg viewBox="0 0 14 14" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <path d="M4 2v9M2.5 5H4M4 8h1.5M10 3v9M8.5 10H10M10 5h1.5" />
    </svg>
  ),
  candles: (
    <svg viewBox="0 0 14 14" className="w-3.5 h-3.5" fill="currentColor" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
      <path fill="none" d="M4 1.5v2M4 8.5v2.5M10 2.5v2M10 10v1.5" />
      <rect x="2.9" y="3.5" width="2.2" height="5" rx="0.4" />
      <rect x="8.9" y="4.5" width="2.2" height="5.5" rx="0.4" />
    </svg>
  ),
  hollow: (
    <svg viewBox="0 0 14 14" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
      <path d="M4 1.5v2M4 8.5v2.5M10 2.5v2M10 10v1.5" />
      <rect x="2.9" y="3.5" width="2.2" height="5" rx="0.4" />
      <rect x="8.9" y="4.5" width="2.2" height="5.5" rx="0.4" />
    </svg>
  ),
  line: (
    <svg viewBox="0 0 14 14" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 10L5 6.5l3 2 4.5-5" />
    </svg>
  ),
  step: (
    <svg viewBox="0 0 14 14" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 10.5h3V7h3V3.5h4" />
    </svg>
  ),
  area: (
    <svg viewBox="0 0 14 14" className="w-3.5 h-3.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 10L5 6.5l3 2 4.5-5V12h-11Z" fill="currentColor" opacity="0.25" stroke="none" />
      <path d="M1.5 10L5 6.5l3 2 4.5-5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  baseline: (
    <svg viewBox="0 0 14 14" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 7h11" strokeWidth="1" strokeDasharray="2 1.6" opacity="0.55" />
      <path d="M1.5 9.5L5 4.5l3 4 4.5-5" strokeWidth="1.2" />
    </svg>
  ),
};

const INDICATOR_ITEMS: { key: keyof ChartIndicators; label: string; hint: string }[] = [
  { key: 'ema9', label: 'EMA 9', hint: '9-bar exponential moving average' },
  { key: 'ema21', label: 'EMA 21', hint: '21-bar exponential moving average' },
  { key: 'ema50', label: 'EMA 50', hint: '50-bar exponential moving average' },
  { key: 'vwap', label: 'VWAP', hint: 'Volume-weighted average price, session-anchored' },
];

const OVERLAY_ITEMS: { key: keyof ChartOverlays; label: string; hint: string }[] = [
  { key: 'trails', label: 'Exposure trails', hint: 'LED strike bands — strength & fade' },
  { key: 'levels', label: 'Key levels', hint: 'CW · PW · flip · king axis chips' },
  { key: 'darkpool', label: 'Dark pool', hint: 'Off-exchange print lines' },
  { key: 'volume', label: 'Volume', hint: 'Session bars along the floor' },
  { key: 'flow', label: 'Flow', hint: 'Option premium from the tape — calls up, puts down' },
  { key: 'netDrift', label: 'Net drift', hint: "Running call & put premium totals — the session's lean" },
  { key: 'volDrift', label: 'Vol drift', hint: 'Realised vol off these bars against the implied the feed reports' },
  { key: 'dexStrike', label: 'Exposure by strike', hint: 'Delta, gamma or vega across the chain — docked under the tape' },
];

export type MenuSide = 'bottom' | 'top' | 'left' | 'right';

/** Small anchored dropdown with outside-click dismissal. */
const MENU_SIDE_POS: Record<MenuSide, string> = {
  bottom: 'right-0 top-full mt-1',
  /* UP, for a toolbar sitting on the bottom edge — the phone's Pulse, where
     the strip is in flow beneath the tape. A `bottom` menu there opens past
     the bottom of the window, and because the menu is `absolute` inside a
     page that does not scroll sideways or down, it is not merely awkward to
     reach: it is unreachable. */
  top: 'right-0 bottom-full mb-1',
  right: 'left-full top-0 ml-1',
  left: 'right-full top-0 mr-1',
};

/* The caret points where the menu will pop (Noah, 2026-08-23) — down when it
   drops below, sideways when a side-docked toolbox throws it left or right. */
const MENU_SIDE_CARET = {
  bottom: ChevronDown,
  top: ChevronUp,
  left: ChevronLeft,
  right: ChevronRight,
} as const;

const Dropdown = ({
  label,
  icon,
  open,
  onToggle,
  menuSide = 'bottom',
  title,
  children,
}: {
  label: string;
  icon?: ReactNode;
  open: boolean;
  onToggle: () => void;
  menuSide?: MenuSide;
  /** Hover name — carries the words when a compact trigger drops its label. */
  title?: string;
  children: ReactNode;
}) => {
  const Caret = MENU_SIDE_CARET[menuSide];
  return (
  <div className="relative">
    <button
      onClick={onToggle}
      title={title}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded font-mono text-[10px] uppercase tracking-wider transition-colors ${
        open
          ? 'bg-white/[0.07] text-textPrimary'
          : 'text-textMuted hover:text-textPrimary hover:bg-white/[0.03]'
      }`}
    >
      {icon}
      {label}
      <Caret className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && (
      /*
        A MENU TALLER THAN THE WINDOW SCROLLS RATHER THAN OVERFLOWING IT.

        `70vh` and `overflow-y-auto` are not defensive decoration — they are the
        fix for a measured failure. This panel had no height cap at all, which
        was survivable only while every menu happened to be short enough. Adding
        two overlay rows took the Overlays menu to 419px, and a HANDSET IN
        LANDSCAPE is 390px tall: the menu opens upward off a strip on the bottom
        edge, so the overflow goes past the TOP of a page that does not scroll,
        and the rows that fell off were not merely awkward to reach — they were
        unreachable. `scripts/ui-sweep.mjs` failed exactly as written.

        `overflow-x-hidden` keeps the rounded corners clipping the way the plain
        `overflow-hidden` did; `overscroll-contain` stops a flick that reaches
        the end of the list from scrolling the page underneath it.
      */
      <div
        className={`absolute z-40 max-h-[70vh] min-w-[210px] overflow-y-auto overflow-x-hidden overscroll-contain border border-borderMuted bg-panel rounded-md shadow-2xl shadow-black/60 animate-slide-in ${MENU_SIDE_POS[menuSide]}`}
      >
        {children}
      </div>
    )}
  </div>
  );
};

const ChartToolbar = ({
  timeframe,
  onTimeframe,
  overlays,
  onOverlays,
  minimal = false,
  candles = false,
  overlayKeys,
  spread = false,
  compact = false,
  vertical = false,
  menuSide = 'bottom',
  fullscreen = false,
  onToggleFullscreen,
  drawing = false,
  onToggleDrawing,
  replay = false,
  onToggleReplay,
  chartStyle = 'candles',
  onChartStyle,
  indicators,
  onIndicators,
  alertTicker,
  alertSpot = 0,
  onTotalFullscreen,
  onOpenQuad,
}: ChartToolbarProps) => {
  const themeKey = useCandleThemeKey();
  const [openMenu, setOpenMenu] = useState<
    'overlays' | 'candles' | 'style' | 'indicators' | 'alerts' | 'timeframe' | null
  >(null);
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
    <div
      ref={rootRef}
      className={`flex ${
        vertical
          ? 'flex-col items-stretch gap-1'
          : `items-center gap-2 flex-wrap ${spread && !compact ? 'w-full' : ''}`
      }`}
    >
      {compact ? (
        /* The current interval IS the trigger, the way every mobile charting
           app does it — the label is the answer to "what am I looking at" and
           the menu is the answer to "what else can I look at". */
        <Dropdown
          label={TIMEFRAME_OPTIONS.find(o => o.value === timeframe)?.label ?? String(timeframe)}
          open={openMenu === 'timeframe'}
          onToggle={() => setOpenMenu(m => (m === 'timeframe' ? null : 'timeframe'))}
          menuSide={menuSide}
          title="Timeframe"
        >
          <div role="group" aria-label="Timeframe">
            {TIMEFRAME_OPTIONS.map(opt => {
              const active = opt.value === timeframe;
              return (
                <button
                  key={opt.value}
                  aria-pressed={active}
                  onClick={() => {
                    onTimeframe(opt.value);
                    setOpenMenu(null);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-[11px] transition-colors ${
                    active ? 'bg-white/[0.06] text-textPrimary' : 'text-textSecondary hover:bg-white/[0.03]'
                  }`}
                >
                  <Check className={`w-3 h-3 shrink-0 ${active ? 'opacity-100' : 'opacity-0'}`} aria-hidden />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </Dropdown>
      ) : (
        <TimeframeStrip value={timeframe} onChange={onTimeframe} vertical={vertical} />
      )}

      {/* Spread mode: the divider stops being a line and becomes the spacer
          that shoves every following control to the right edge — the
          timeframes get the whole left side to breathe (Noah, 2026-08-23).
          Vertical turns it back into a line, lying flat. */}
      <span
        className={
          vertical
            ? 'h-px w-4 self-center bg-borderSubtle'
            : spread && !compact
              ? 'ml-auto'
              : 'w-px h-4 shrink-0 bg-borderSubtle'
        }
        aria-hidden
      />

      {/* The TradingView quartet (Noah, 2026-08-23), his order: Replay ·
          Indicators · Alerts · Candles — leading the right cluster, away
          from the timeframes. Candles here is the tape's SHAPE
          (bars/line/area…), not the color theme; Alerts is an empty shell
          he's cooking on. The host only wires these in FULLSCREEN. */}
      {(onToggleReplay || onIndicators || alertTicker || onChartStyle) && (
        <span
          className={`flex gap-1 ${
            vertical ? 'flex-col items-stretch' : 'flex-wrap items-center justify-end'
          }`}
        >
          {onToggleReplay && (
            <button
              onClick={onToggleReplay}
              title={replay ? 'Exit replay' : 'Replay session history'}
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded font-mono text-[10px] uppercase tracking-wider transition-colors ${
                replay ? 'bg-select/10 text-select' : 'text-textMuted hover:text-textPrimary hover:bg-white/[0.03]'
              }`}
            >
              <Play className="w-3 h-3" />
              {!vertical && 'Replay'}
            </button>
          )}
          {onIndicators && indicators && (
            <Dropdown
              label={vertical || compact ? '' : 'Indicators'}
              /* Signature inks on the tool icons (Noah, 2026-08-23) —
                 categorical identity, no house meaning: indicators wear the
                 blue their EMA lines lead with */
              icon={<Activity className="w-3 h-3 text-[#5B9CF6]" />}
              title="Indicators"
              open={openMenu === 'indicators'}
              onToggle={() => setOpenMenu(m => (m === 'indicators' ? null : 'indicators'))}
              menuSide={menuSide}
            >
              <div className="p-1.5 flex flex-col gap-0.5">
                {INDICATOR_ITEMS.map(item => {
                  const on = indicators[item.key];
                  return (
                    <button
                      key={item.key}
                      onClick={() => onIndicators({ ...indicators, [item.key]: !on })}
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
                        <span className="flex items-center gap-1.5">
                          <span
                            className="inline-block w-2 h-[3px] rounded-full"
                            style={{ background: INDICATOR_INKS[item.key] }}
                            aria-hidden
                          />
                          <span className={`font-mono text-[11px] font-semibold ${on ? 'text-textPrimary' : 'text-textSecondary'}`}>
                            {item.label}
                          </span>
                        </span>
                        <span className="block text-[10px] text-textSecondary leading-snug">{item.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Dropdown>
          )}
          {alertTicker && (
            <Dropdown
              label={vertical || compact ? '' : 'Alerts'}
              icon={<Bell className="w-3 h-3 text-[#FF9500]" />}
              title="Alerts"
              open={openMenu === 'alerts'}
              onToggle={() => setOpenMenu(m => (m === 'alerts' ? null : 'alerts'))}
              menuSide={menuSide}
            >
              <AlertsMenu ticker={alertTicker} spot={alertSpot} />
            </Dropdown>
          )}
          {onChartStyle && (
            <Dropdown
              label={vertical || compact ? '' : 'Candles'}
              icon={<CandlestickChart className="w-3 h-3 text-[#30D158]" />}
              title="Chart style"
              open={openMenu === 'style'}
              onToggle={() => setOpenMenu(m => (m === 'style' ? null : 'style'))}
              menuSide={menuSide}
            >
              <div className="p-1.5 flex flex-col gap-0.5">
                {CHART_STYLES.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      onChartStyle(opt.value);
                      setOpenMenu(null);
                    }}
                    className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded font-mono text-[11px] transition-colors ${
                      opt.value === chartStyle
                        ? 'bg-white/[0.06] text-textPrimary font-semibold'
                        : 'text-textSecondary hover:text-textPrimary hover:bg-white/[0.03]'
                    }`}
                  >
                    {/* The glyph stays house white whatever the row state */}
                    <span className="text-textPrimary shrink-0 inline-flex" aria-hidden>
                      {STYLE_GLYPHS[opt.value]}
                    </span>
                    {opt.label}
                    {opt.value === chartStyle && <Check className="w-3 h-3 ml-auto text-select" />}
                  </button>
                ))}
              </div>
            </Dropdown>
          )}
        </span>
      )}

      {/* A hairline between the quartet and the standing controls */}
      {(onToggleReplay || onIndicators || alertTicker || onChartStyle) && (
        <span className={vertical ? 'h-px w-4 self-center bg-borderSubtle' : 'w-px h-4 bg-borderSubtle'} aria-hidden />
      )}

      {/* Vertical compresses the trigger to icon + count — the full word was
          what set the upright toolbox's width (Noah, 2026-08-23: "too wide");
          the hover title keeps the name. */}
      <Dropdown
        label={vertical || compact ? String(activeOverlayCount) : `Overlays ${activeOverlayCount}`}
        icon={<Layers className="w-3 h-3" />}
        title="Overlays"
        open={openMenu === 'overlays'}
        onToggle={() => setOpenMenu(m => (m === 'overlays' ? null : 'overlays'))}
        menuSide={menuSide}
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
        /* "Theme", no longer "Candles" — that name now belongs to the chart
           STYLE picker beside the timeframes (Noah, 2026-08-23) */
        label={vertical || compact ? '' : minimal ? 'Theme' : `Theme · ${activeCandleLabel}`}
        title={`Candle theme · ${activeCandleLabel}`}
        icon={<Palette className="w-3 h-3 text-[#BBB2E8]" />}
        open={openMenu === 'candles'}
        onToggle={() => setOpenMenu(m => (m === 'candles' ? null : 'candles'))}
        menuSide={menuSide}
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
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded font-mono text-[10px] uppercase tracking-wider transition-colors ${
              drawing
                ? 'bg-select/10 text-select'
                : 'text-textMuted hover:text-textPrimary hover:bg-white/[0.03]'
            }`}
          >
            <PencilLine className="w-3.5 h-3.5" />
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
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded font-mono text-[10px] uppercase tracking-wider text-textMuted hover:text-textPrimary hover:bg-white/[0.03] transition-colors"
        >
          <Grid2x2 className="w-3.5 h-3.5" />
        </button>
      )}

      {onToggleFullscreen && (
        <button
          onClick={onToggleFullscreen}
          title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen chart'}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded font-mono text-[10px] uppercase tracking-wider text-textMuted hover:text-textPrimary hover:bg-white/[0.03] transition-colors"
        >
          {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      )}

      {onTotalFullscreen && (
        <button
          onClick={onTotalFullscreen}
          title="Total fullscreen — the taskbar goes too; Esc brings it back"
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded font-mono text-[10px] uppercase tracking-wider text-textMuted hover:text-textPrimary hover:bg-white/[0.03] transition-colors"
        >
          <Fullscreen className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

export default ChartToolbar;
