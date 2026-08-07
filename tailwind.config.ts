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
      // One elevation for every floating surface — menus, drawers, toasts,
      // tooltips, modals. Replaces a scattered `shadow-2xl shadow-black` (a
      // 50px, fully-opaque black shadow) with a tight, restrained lift: the
      // hairline border owns the edge, the shadow just sets it off the canvas.
      boxShadow: {
        overlay: '0 12px 32px -12px rgba(0,0,0,0.75), 0 4px 10px -6px rgba(0,0,0,0.55)',
      },
      colors: {
        // Surfaces
        canvas: '#050505',
        panel: '#0a0a0a',
        // Dark ink for text/icons ON a light chrome surface (holo pills, silver
        // CTAs). Same value as the canvas-dark family, named for its role.
        ink: '#0a0a0a',
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
        // Dealer-gamma sign. Gold = SHORT gamma (hedging amplifies the move),
        // blue = LONG gamma (dips absorbed). Mirrors SHORT_GAMMA / LONG_GAMMA in
        // components/gex/palette.ts, which serves the JS-API chart consumers —
        // these two exist so class call sites stop reaching for text-[#E0B84E].
        shortGamma: '#E0B84E',
        longGamma: '#5EA0EF',
        // One hover tint for every subtle interactive surface. Eight
        // white-alpha spellings had accumulated (0.02 → 0.07) and the
        // most-used, 0.03, measured 1.09:1 on a dark panel — below the
        // perceptual floor, so rows barely answered the pointer. Selection
        // keeps its own select-tinted language.
        rowHover: 'rgba(255,255,255,0.055)',
        // True orange — caution reads clearly apart from silver and hot red
        warn: '#FF9500',
        // Interface accent — holographic silver, ~14:1 on canvas. Interface only, never data.
        select: '#E4E8F4',

        /*
          Desk-group identity — the ONE hue axis that is not about the market.

          The four workflow groups (Scan / Read / Yours / Models) are a real
          taxonomy in nav.ts, and colouring a taxonomy is what hue is for. It
          exists because the pages that describe the product — the terminal
          index, the guide, the nav menus — carry no market data at all, so
          every hue below is unavailable to them and they were rendering as
          walls of grey.

          The rule that keeps this from colliding with everything else: an
          identity hue appears only where the product is being DESCRIBED. Never
          on a desk, where each hue already means something (gamma sign, flip
          level, dark pool, direction), and never on a number anywhere.

          There are only TWO of them, and that is a measured constraint rather
          than a preference. Plot every structural hue this palette already
          spends — bear 3°, warn 35°, shortGamma 44°, bull 135°, darkpool 172°,
          flip 199°, longGamma 213°, king 295° — and the only arcs left with
          25°+ of clearance are ~250° and ~330°. The first pass invented four
          identity hues and two of them landed one degree from a token that was
          already there (scan 199° on flip 199°, models 171° on darkpool 172°):
          two names for one colour, which is the drift this file exists to stop.
          Scan and Models now BORROW flip and darkpool — see NAV_GROUP_ACCENT in
          layout/nav.ts, where the disjointness argument lives.
        */
        groupRead: '#B39DFF',
        groupYours: '#FF8FC7',

        // GEX structural levels
        // Flip = baby blue (the cool regime border against silver/red direction)
        flip: '#7DD3FC',
        // King = magenta — the engine's-standout family (TOP PICK, NET, king)
        king: '#EA00FF',
        darkpool: '#2dd4bf',

      },
      // Terminal type ramp. Every size below `text-lg` came from ~1,180
      // scattered `text-[Npx]` utilities; these name them as one system.
      // Deliberately font-size ONLY (string form, no bundled line-height) —
      // unlike Tailwind's built-in text-xs/sm/base — so the leading each call
      // site already set via `leading-*` is preserved untouched. The dense
      // 10–13px micro-steps are the terminal's label tiers; 14–16px carry
      // prose and inline copy. Headings keep the rem-based display scale.
      fontSize: {
        micro: '10px', // axis ticks, densest legends
        label: '11px', // the dominant uppercase mono label
        caption: '12px', // table cells, secondary text
        data: '13px', // readable panel body / data rows
        body: '14px', // prose in guide / legal / landing
        read: '15px', // prose emphasis, card titles
        lead: '16px', // largest inline copy
      },
      /*
        Real fallback stacks, not a bare generic.
        Both families load from Google Fonts with `display=swap`, so the first
        paint of every session — and the whole session if that host is blocked or
        slow — renders in whatever `sans-serif`/`monospace` resolves to. On Linux
        that is often DejaVu, which is markedly wider than Inter and JetBrains
        Mono: dense uppercase labels and fixed-width table columns reflow when
        the real face lands. These stacks keep the metrics close enough that the
        swap is a refinement rather than a re-layout.
      */
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'Liberation Mono',
          'monospace',
        ],
      }
    },
  },
  plugins: [],
} satisfies Config;
