import type { Config } from 'tailwindcss';

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Surfaces
        canvas: '#050505',
        panel: '#0a0a0a',
        panelHover: '#101010',
        inset: '#070707',
        inputBg: '#050505',

        // Borders
        borderSubtle: '#1c1c1c',
        borderMuted: '#2a2a2a',
        borderFocus: '#ededed',

        // Text — tiers must clear WCAG on the dark canvas (muted was 2.06:1, illegible)
        textPrimary: '#ededed',
        textSecondary: '#a3a3a3',
        // Lifted #6b6b6b → #7d7d7d (2026-07-25): at the 9-10px label sizes this
        // token actually lives at, 6b6b6b was ~3.98:1 on canvas — below AA, and
        // Noah was squinting. 7d7d7d reads ~5.2:1 and stays clearly quieter
        // than textSecondary, so labels still whisper; they just stop mumbling.
        textMuted: '#7d7d7d',

        // Directional / status accents (always paired with a label or icon).
        // THE SPLIT (2026-07-20): green = the MARKET talking (bullish, calls,
        // beats, up-moves). Neon lime = the TERMINAL talking about itself
        // (selection, navigation, brand, extreme importance). One color, one
        // meaning — and lime stays scarce, which is what makes it loud.
        // Green went mint #CFFFB1 → #30D158 on 2026-07-24: a true green reads
        // as green, and it no longer shares a hue family with the neon lime,
        // so the split is easier to see. The live chart keeps the old mint on
        // purpose — see CHART_MINT in components/gex/palette.ts.
        bull: '#30D158',
        bear: '#FF3B30',
        // True orange — caution reads clearly apart from green and hot red
        warn: '#FF9500',
        // Interface accent — neon lime, ~17:1 on canvas. Interface only, never data.
        select: '#D2FF00',

        // GEX structural levels
        // Flip = baby blue (the cool regime border against lime/red direction)
        flip: '#7DD3FC',
        // King = magenta — the engine's-standout family (TOP PICK, NET, king).
        // Exception: the king LINE on charts is silver (palette.ts KING).
        king: '#EA00FF',
        darkpool: '#2dd4bf',

        // Legacy aliases (pre-redesign pages)
        primary: '#ededed',
        secondary: '#a3a3a3',
        silver: '#a1a1aa',
        gammaPos: '#D2FF00',
        gammaNeg: '#FF3B30',
        warning: '#FF9500',
      },
      fontSize: {
        'xxs': '0.7rem',
        'xxxs': '0.6rem',
      },
      fontFamily: {
        // One family site-wide (2026-08-16). `mono` is kept as a token — it
        // marks the data/instrument voice (tabular figures via index.css),
        // not a different typeface.
        sans: ['SF Pro', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['SF Pro', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      }
    },
  },
  plugins: [],
} satisfies Config;
