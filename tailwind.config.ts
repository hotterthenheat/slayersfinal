import type { Config } from 'tailwindcss';

/**
 * The one family, plus the closest metric match on each platform for the short
 * window before the self-hosted file lands. Declared once so `sans` and `mono`
 * cannot drift apart — the point of the token pair is the tabular-figures
 * switch in index.css, not a second typeface.
 */
const SYSTEM_SANS = [
  'SF Pro',
  '-apple-system',
  'BlinkMacSystemFont',
  'Segoe UI',
  'Roboto',
  'Helvetica Neue',
  'Arial',
  'sans-serif',
];

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

        // GEX structural levels
        // Flip = baby blue (the cool regime border against silver/red direction)
        flip: '#7DD3FC',
        // King = magenta — the engine's-standout family (TOP PICK, NET, king)
        king: '#EA00FF',
        darkpool: '#2dd4bf',

      },
      /*
        Terminal type ramp. Every size below `text-lg` came from ~1,180 scattered
        `text-[Npx]` utilities; these name them as one system.

        THE WHOLE RAMP MOVED UP ONE PIXEL. A census of the app found 661 uses of
        `micro` and 506 of `label` against 1,607 sizes in total — 73% of every
        piece of type on the terminal was set at 10px or 11px. That is not dense,
        it is unreadable-adjacent, and it is the single largest reason the product
        reads as cramped. Each step gains 1px and the seven tiers stay distinct,
        so nothing has to be re-tiered at a call site and no two tokens collide.

        Deliberately font-size ONLY (string form, no bundled line-height) — unlike
        Tailwind's built-in text-xs/sm/base — so the leading each call site already
        set via `leading-*` is preserved untouched.
      */
      fontSize: {
        micro: '11px', // axis ticks, densest legends
        label: '12px', // the dominant uppercase mono label
        caption: '13px', // table cells, secondary text
        data: '14px', // readable panel body / data rows
        body: '15px', // prose in guide / legal / landing
        read: '16px', // prose emphasis, card titles
        lead: '17px', // largest inline copy
      },
      /*
        THE NUMERIC LEADING SCALE, MOVED WITH THE TYPE.

        The type-ramp note above says the leading each call site set is
        "preserved untouched". That was wrong, and it was wrong in the direction
        that matters: `leading-4` is a FIXED 16px, not a multiple, so growing
        `text-caption` from 12px to 13px did not preserve anything — it tightened
        the ratio from 1.33 to 1.23. Across 59 uses of `leading-4` and 24 of
        `leading-5`, a change made to give the terminal air made its prose DENSER.

        Only the numeric steps need this. `leading-none/tight/snug/relaxed/loose`
        are unitless multipliers and already track font-size on their own; it is
        exactly the fixed-pixel ones that fell behind, and they move by the same
        one-to-two pixels the type did.

            caption 13px on leading-4 18px  ->  1.38   (was 12px on 16px = 1.33)
            label   12px on leading-4 18px  ->  1.50
            micro   11px on leading-4 18px  ->  1.64
      */
      lineHeight: {
        3: '14px', // 12 → 14
        4: '18px', // 16 → 18
        5: '22px', // 20 → 22
        6: '26px', // 24 → 26
      },
      /*
        THE SPACING RHYTHM, OPENED UP.

        The same census: `gap-2` 302 times, `gap-1.5` 239, `py-1.5` 131, `py-1` 91.
        The terminal's dominant rhythm was 4-8px, which is what "claustrophobic"
        measures as. Rather than rewrite ~1,600 call sites — every one of which is
        a chance to get a single panel wrong — the STEPS THEMSELVES grow, so every
        gap, pad and inset in the app opens together and the proportions between
        them are preserved exactly.

        Only the crowded end is touched. Steps 5 and up are untouched, because
        they are already section-scale and doubling a page margin was never the
        complaint.
      */
      spacing: {
        0.5: '3px', // 2  → 3
        1: '5px', // 4  → 5
        1.5: '7px', // 6  → 7
        2: '10px', // 8  → 10
        2.5: '12px', // 10 → 12
        3: '14px', // 12 → 14
        3.5: '16px', // 14 → 16
        4: '19px', // 16 → 19
      },
      /*
        ONE family, two tokens.

        `sans` and `mono` both resolve to SF Pro (self-hosted variable, see the
        @font-face block in index.css). Two typefaces over a surface this dense
        read as "all over the place", and the terminal was overwhelmingly one of
        them anyway: 1,331 `font-mono` call sites against 1 `font-sans`.

        `mono` SURVIVES AS A TOKEN ON PURPOSE. It marks the data voice, and
        index.css gives every `.font-mono` element `tabular-nums`, so it still
        does real work — it is the switch that keeps a numeric column aligned in
        a proportional face. Deleting it would mean touching 1,331 call sites to
        remove a class that is still meaningful; keeping it means the intent is
        recorded where the number is written.

        The fallbacks stay real rather than a bare generic. SF Pro is a local
        file now, so the fallback window is short, but the system stack is the
        closest metric match available while it opens — `-apple-system` IS this
        face on Apple platforms, and Segoe UI / Roboto are the nearest
        equivalents elsewhere.
      */
      fontFamily: {
        sans: SYSTEM_SANS,
        mono: SYSTEM_SANS,
      },
    },
  },
  plugins: [],
} satisfies Config;
