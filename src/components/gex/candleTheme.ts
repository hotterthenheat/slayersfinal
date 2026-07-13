/*
  Candlestick color themes. The heatmap/nodes carry the page's color, so the
  default keeps price structure neutral (monochrome) to complement the minimal
  dark UI without competing with the analytics. Flip CANDLE_THEME to switch.
*/

export interface CandleTheme {
  up: string;
  down: string;
  wickUp: string;
  wickDown: string;
  volUp: string;
  volDown: string;
}

export const CANDLE_THEMES = {
  // Neutral, premium — near-white up / slate down
  mono: {
    up: '#eef1f5',
    down: '#565c68',
    wickUp: '#eef1f5',
    wickDown: '#565c68',
    volUp: 'rgba(238,241,245,0.22)',
    volDown: 'rgba(86,92,104,0.30)',
  },
  // House chrome — holo silver up / hot red down (matches bull/bear tokens)
  classic: {
    up: '#C7D3E8',
    down: '#FF3B30',
    wickUp: '#C7D3E8',
    wickDown: '#FF3B30',
    volUp: 'rgba(199,211,232,0.28)',
    volDown: 'rgba(255,59,48,0.28)',
  },
  // Desaturated sage / clay
  muted: {
    up: '#6fae94',
    down: '#c47484',
    wickUp: '#6fae94',
    wickDown: '#c47484',
    volUp: 'rgba(111,174,148,0.24)',
    volDown: 'rgba(196,116,132,0.26)',
  },
} as const;

export type CandleThemeKey = keyof typeof CANDLE_THEMES;

export const CANDLE_THEME_KEY: CandleThemeKey = 'mono';

export const candleTheme: CandleTheme = CANDLE_THEMES[CANDLE_THEME_KEY];
