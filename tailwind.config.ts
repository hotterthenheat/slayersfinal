import type { Config } from 'tailwindcss';

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // One motion hand: every bare `transition-*` inherits the house
      // easeOutExpo curve at DUR.fast (120ms), so CSS transitions read the same
      // as the framer-motion ones instead of Tailwind's generic default.
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        DEFAULT: '120ms',
      },
      colors: {
        // Surfaces
        canvas: '#050505',
        panel: '#0a0a0a',
        panelHover: '#101010',
        // Raised surface — sticky table headers, tooltips, hover cards (was a
        // repeated raw #0c0c0c across 17+ files; single-sourced here).
        panelRaised: '#0c0c0c',
        inset: '#070707',
        inputBg: '#050505',

        // Borders
        borderSubtle: '#1c1c1c',
        borderMuted: '#2a2a2a',
        borderFocus: '#ededed',

        // Text — tiers must clear WCAG on the dark canvas. Muted lifted #6b6b6b→#7d7d7d
        // so sub-12px labels clear ~4.5:1 (were ~3.7:1, below AA — the #1 legibility gripe).
        textPrimary: '#ededed',
        textSecondary: '#a3a3a3',
        textMuted: '#7d7d7d',

        // Directional / status accents (always paired with a label or icon)
        // Direction reads green up / hot red down; silver is reserved for
        // selection + brand only (see `select`), never for bullishness.
        bull: '#30D158',
        bear: '#FF3B30',
        // True orange — caution reads clearly apart from silver and hot red
        warn: '#FF9500',
        // Interface accent — holographic silver, ~14:1 on canvas. Interface only, never data.
        select: '#E4E8F4',

        // GEX structural levels
        // Flip = baby blue (the cool regime border against silver/red direction)
        flip: '#7DD3FC',
        // King = magenta — the engine's-standout family (TOP PICK, NET, king)
        king: '#EA00FF',
        darkpool: '#2dd4bf',

        // Legacy aliases (pre-redesign pages)
        primary: '#ededed',
        secondary: '#a3a3a3',
        silver: '#a1a1aa',
        gammaPos: '#C7D3E8',
        gammaNeg: '#FF3B30',
        warning: '#FF9500',
      },
      fontSize: {
        'xxs': '0.7rem',
        'xxxs': '0.6rem',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      }
    },
  },
  plugins: [],
} satisfies Config;
