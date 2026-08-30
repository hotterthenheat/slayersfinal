/*
  Candlestick color themes — now a live, app-wide store. The picker on Pulse
  writes here; every chart (StrikeChart, MiniPane, CampaignChart) subscribes
  and recolors in place. Persisted so the choice survives reloads.

  Palette rules: lime/red are the bull/bear TOKENS (badges, bars, direction
  text) — candles must read up/down instantly WITHOUT stealing those tokens,
  and without colliding with level colors (lime wall / red wall / baby-blue
  flip / silver supreme / white spot).
*/

import { useSyncExternalStore } from 'react';

export interface CandleTheme {
  up: string;
  down: string;
  wickUp: string;
  wickDown: string;
  volUp: string;
  volDown: string;
  /** Body border overrides. A theme draws HOLLOW bodies by filling with the
      canvas color and bordering with the real ink (see `wire`). */
  borderUp?: string;
  borderDown?: string;
  /** Chart surface tint. Absent = transparent, the house canvas shows through.
      DARK FAMILY ONLY: every overlay (white DP dashes, axis chips, trail
      alphas, #7d7d7d axis ink) assumes a dark surface — a light background
      is a separate project, not a theme entry. */
  canvas?: { bg: string; grid: string };
}

/** One applyOptions payload for a candlestick series — every chart uses this
    so hollow-body themes can't be half-applied. */
export function candleSeriesOptions(t: CandleTheme) {
  return {
    upColor: t.up,
    downColor: t.down,
    borderUpColor: t.borderUp ?? t.up,
    borderDownColor: t.borderDown ?? t.down,
    wickUpColor: t.wickUp,
    wickDownColor: t.wickDown,
  };
}

/** Chart surface colors with the house defaults filled in. */
export function chartSurface(t: CandleTheme): { bg: string; grid: string } {
  return {
    bg: t.canvas?.bg ?? 'transparent',
    grid: t.canvas?.grid ?? 'rgba(255,255,255,0.03)',
  };
}

export const CANDLE_THEMES = {
  // Neutral, premium — near-white up / slate down (the launch default)
  mono: {
    up: '#eef1f5',
    down: '#565c68',
    wickUp: '#eef1f5',
    wickDown: '#565c68',
    volUp: 'rgba(238,241,245,0.22)',
    volDown: 'rgba(86,92,104,0.30)',
  },
  // Liquid metal — ice-silver up / gunmetal down. Ties into the holo brand.
  chrome: {
    up: '#DCE6F5',
    down: '#414B5C',
    wickUp: '#EAF0F9',
    wickDown: '#5A6577',
    volUp: 'rgba(220,230,245,0.22)',
    volDown: 'rgba(65,75,92,0.34)',
  },
  // Arctic — soft glacier blue up / deep slate-navy down. Calm, readable.
  glacier: {
    up: '#93C9F2',
    down: '#3B4A61',
    wickUp: '#B4DAF8',
    wickDown: '#53647e',
    volUp: 'rgba(147,201,242,0.20)',
    volDown: 'rgba(59,74,97,0.34)',
  },
  // Velvet — warm ivory up / muted violet down. Echoes the pastel heat family.
  velvet: {
    up: '#F2EFE6',
    down: '#8F7BB8',
    wickUp: '#F7F5EE',
    wickDown: '#A490C9',
    volUp: 'rgba(242,239,230,0.20)',
    volDown: 'rgba(143,123,184,0.26)',
  },
  // House neon — lime up / hot red down (loud; doubles the token colors)
  classic: {
    up: '#CFFFB1',
    down: '#FF3B30',
    wickUp: '#CFFFB1',
    wickDown: '#FF3B30',
    volUp: 'rgba(207,255,177,0.28)',
    volDown: 'rgba(255,59,48,0.28)',
  },
  // ---- gallery (2026-08-01, from Noah's TradingView references) ------------
  // The real green/red every retail chart speaks — house bull/bear tokens.
  market: {
    up: '#30D158',
    down: '#FF3B30',
    wickUp: '#4ADE6E',
    wickDown: '#FF5F55',
    volUp: 'rgba(48,209,88,0.24)',
    volDown: 'rgba(255,59,48,0.24)',
    canvas: { bg: '#060907', grid: 'rgba(255,255,255,0.04)' },
  },
  // Two blues on blue-black — pale ice up / saturated steel down.
  tide: {
    up: '#C9E8F7',
    down: '#4A82D9',
    wickUp: '#DDF1FB',
    wickDown: '#6B9AE3',
    volUp: 'rgba(201,232,247,0.20)',
    volDown: 'rgba(74,130,217,0.26)',
    canvas: { bg: '#05080D', grid: 'rgba(151,193,235,0.05)' },
  },
  // Cream up / harbor blue down on navy. Velvet's cousin with blue, not violet.
  harbor: {
    up: '#EDE4CD',
    down: '#4B80D6',
    wickUp: '#F4EEDD',
    wickDown: '#6C99E0',
    volUp: 'rgba(237,228,205,0.18)',
    volDown: 'rgba(75,128,214,0.24)',
    canvas: { bg: '#0A101C', grid: 'rgba(237,228,205,0.05)' },
  },
  // Periwinkle up / royal purple down on deep violet. (Reference had a light
  // lavender surface — adapted to the dark family, see CandleTheme.canvas.)
  whipsaw: {
    up: '#BBB2E8',
    down: '#5E2D92',
    wickUp: '#CFC8F0',
    wickDown: '#7A4BAE',
    volUp: 'rgba(187,178,232,0.20)',
    volDown: 'rgba(94,45,146,0.30)',
    canvas: { bg: '#120D1D', grid: 'rgba(187,178,232,0.06)' },
  },
  // Green up / violet down on pure black — the loud high-contrast pair.
  contrast: {
    up: '#2FD05E',
    down: '#8A55D6',
    wickUp: '#52DB79',
    wickDown: '#A374E4',
    volUp: 'rgba(47,208,94,0.22)',
    volDown: 'rgba(138,85,214,0.26)',
    canvas: { bg: '#050505', grid: 'rgba(255,255,255,0.045)' },
  },
  // Monochrome wireframe — hollow white up (fill = canvas), solid white down.
  wire: {
    up: '#0B0B0F',
    down: '#E8EAF0',
    wickUp: '#E8EAF0',
    wickDown: '#E8EAF0',
    volUp: 'rgba(232,234,240,0.14)',
    volDown: 'rgba(232,234,240,0.28)',
    borderUp: '#E8EAF0',
    borderDown: '#E8EAF0',
    canvas: { bg: '#0B0B0F', grid: 'rgba(255,255,255,0.05)' },
  },
} as const satisfies Record<string, CandleTheme>;

export type CandleThemeKey = keyof typeof CANDLE_THEMES;

// Noah's pick order: Chrome is the locked house default; Velvet then Glacier
// are the sanctioned fallbacks if it wears badly. The gallery block (with
// themed surfaces) follows the originals.
export const CANDLE_THEME_OPTIONS: { value: CandleThemeKey; label: string }[] = [
  { value: 'chrome', label: 'Chrome' },
  { value: 'velvet', label: 'Velvet' },
  { value: 'glacier', label: 'Glacier' },
  { value: 'mono', label: 'Mono' },
  { value: 'classic', label: 'Neon' },
  { value: 'market', label: 'Market' },
  { value: 'tide', label: 'Tide' },
  { value: 'harbor', label: 'Harbor' },
  { value: 'whipsaw', label: 'Whipsaw' },
  { value: 'contrast', label: 'Contrast' },
  { value: 'wire', label: 'Wire' },
];

// ---- store ------------------------------------------------------------------

const STORAGE_KEY = 'slayer_candle_theme';

function loadKey(): CandleThemeKey {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && raw in CANDLE_THEMES) return raw as CandleThemeKey;
  } catch {
    /* storage unavailable — fall through to default */
  }
  return 'chrome';
}

let currentKey: CandleThemeKey = loadKey();
const listeners = new Set<() => void>();

export function getCandleThemeKey(): CandleThemeKey {
  return currentKey;
}

export function getCandleTheme(): CandleTheme {
  return CANDLE_THEMES[currentKey];
}

export function setCandleTheme(key: CandleThemeKey): void {
  if (key === currentKey) return;
  currentKey = key;
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    /* non-fatal */
  }
  listeners.forEach(fn => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Reactive theme key — charts recolor in place when the picker changes it. */
export function useCandleThemeKey(): CandleThemeKey {
  return useSyncExternalStore(subscribe, getCandleThemeKey, getCandleThemeKey);
}
