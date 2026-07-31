# Handoff: Slayer Terminal — Design System

## Overview
Slayer Terminal is a dark-only, dense options-analytics terminal: dealer gamma
exposure, order-flow and dark-pool intelligence, resting-liquidity heat, and
contract selection across eight desks. This bundle is the **complete house
design system** for every surface in that product — color tokens with usage
rules, chart inks, the type ramp, all 23 UI primitives, interaction patterns,
and the motion hand.

Use it to build new surfaces that sit inside the existing terminal without
drifting, or to re-implement the terminal's design layer in another
environment.

## About the Design Files
The files in `design-system/` are **design references created in HTML** —
self-contained preview cards showing intended look, values, and behavior. They
are **not production code to copy directly**. Each one is a flat, dependency-free
page that hard-codes the real token values so you can read exact hexes, sizes,
and spacing off the page and compare your build against it side by side.

Your task is to **recreate these designs in the target codebase's existing
environment** using its established patterns and libraries. The source product
is React + TypeScript + Tailwind + framer-motion; if you are implementing into
that codebase, the primitives described in `DESIGN.md` §5 already exist under
`src/components/ui/` — extend them rather than writing new one-off styles. If
you are implementing into a different environment (Vue, SwiftUI, native), or
into a project with no environment yet, choose the framework that fits and port
the tokens and primitives into its idioms.

**`DESIGN.md` is the authority.** It is the spec extracted from the sources of
truth (`tailwind.config.ts`, `src/index.css`, `src/components/gex/palette.ts`,
`src/components/gex/candleTheme.ts`, `src/components/ui/*`, `src/data/terms.ts`).
Where a preview card and `DESIGN.md` disagree, `DESIGN.md` wins. Where
`DESIGN.md` and the live code disagree, **the code wins** — and the doc should
be fixed.

## Fidelity
**High-fidelity (hifi).** Every value in this bundle is a real production
token, not an approximation — final colors, typography, spacing, radii,
shadows, easing curves and durations. Recreate the UI pixel-perfectly using the
codebase's existing libraries and patterns. Do not substitute "close enough"
colors, and do not introduce a token that isn't listed here.

## Non-negotiable constraints
Anything new must hold these five lines. They are what keeps the terminal
readable at density:

1. **Dark only.** One theme. Near-black canvas `#050505`, machined panels
   `#0a0a0a`, hairline borders. `html { color-scheme: dark }` — there is no
   light mode to design for, so don't build affordances for one.
2. **JetBrains Mono for data, Inter for prose.** All labels, values, tables,
   badges and axis text are mono. Sans is the exception, reserved for real
   sentences (guide copy, Term definitions, subtitles).
3. **Holo-silver is selection language only.** The `select` / `#E4E8F4` holo
   family marks what the user chose — selected rows, the FOCUS line, the active
   symbol, focus rings. It never encodes a market quantity.
4. **Green and red are data inks, not decoration.** `bull #30D158` /
   `bear #FF3B30` mark direction, sign, and walls. Never a decorative flourish,
   and never silver for bullishness.
5. **Gold = dealer short gamma, blue = dealer long gamma.**
   `SHORT_GAMMA #E0B84E` / `LONG_GAMMA #5EA0EF`. This pair is the positioning
   language only; it deliberately avoids green/red so a positioning map never
   reads as a P&L map.

And the governing instinct: **density over whitespace.** This is an instrument,
not a marketing site. Whitespace is spent on scanability, not air — 10–13px
mono label tiers, panels that pack. If a layout feels airy, it's wrong.

## Design Tokens

### Surfaces
Elevation is expressed by these steps plus the hairline border — never by heavy
shadows. Reads bottom-up: `canvas` → `inset` (recessed) → `panel` (resting) →
`panelRaised` (floating).

| Token | Hex | Role |
|---|---|---|
| `canvas` | `#050505` | Page background |
| `panel` | `#0a0a0a` | Default widget surface |
| `panelRaised` | `#0c0c0c` | Sticky table headers, tooltips, hover cards |
| `panelHover` | `#101010` | Hovered panel surface |
| `inset` | `#070707` | Recessed wells — chart frames, icon chips, list rows |
| `inputBg` | `#050505` | Form fields |
| `ink` | `#0a0a0a` | Dark text/icons **on** light chrome (holo pills, silver CTAs) |

The machined `.inst-surface` treatment, exactly as `src/index.css` defines it —
it is paint-only, so radius is **not** part of the class; call sites add
`rounded-md` (or `rounded`, 4px, for the densest chips):
```css
background-color: #0a0a0a;
background-image: linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0) 46%);
border: 1px solid #1c1c1c;
border-top-color: #333333;
box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
```
`.inst-emphasis` is the quiet static lift — same shape, brighter hairline, no
animated chrome: `background-color: #0b0b0b`, gradient top stop `0.04`,
`border: 1px solid #2a2a2a`, `border-top-color: #3a3a3a`, inset highlight `0.04`.

### Borders & focus
`borderSubtle #1c1c1c` at rest (panel edges, row dividers) ·
`borderMuted #2a2a2a` on hover and for floating surfaces ·
`borderFocus #ededed` reserved for focus treatments.

Keyboard focus is global:
`:focus-visible { outline: 1px solid rgba(228,232,244,0.6); outline-offset: 1px; }`
Components echo it as `ring-select/60`.

### Text
`textPrimary #ededed` values and titles · `textSecondary #a3a3a3` labels, table
headers, subtitles · `textMuted #7d7d7d` axis ticks, hints, sub-lines (lifted
from `#6b6b6b` so sub-12px labels clear ~4.5:1 WCAG AA on the dark canvas —
don't push it back down).

### Directional / status
| Token | Hex | Role |
|---|---|---|
| `bull` | `#30D158` | Up / support / success |
| `bear` | `#FF3B30` | Down / resistance / error |
| `warn` | `#FF9500` | Caution only — degraded feeds, risky toggles. Not a third direction |
| `select` | `#E4E8F4` | Holo-silver, selection + brand. Interface only, never data (~14:1 on canvas) |

Accents are applied at low alphas for chrome (`/10` badge tints, `/15`
dividers, `/[0.05]` header washes) and at full strength only in the value or
ink itself (`toneBar` keeps element chrome ≥ `/70`).

**A tone is never the only signal** — directional and status color is always
paired with a label or icon, so the terminal survives color-blindness and
grayscale.

### GEX structural levels
`flip #7DD3FC` gamma flip, the cool regime border, doubles as the `info` tone ·
`king #EA00FF` magenta, the engine's-standout family (TOP PICK, NET, king
strike) · `darkpool #2dd4bf` teal, institutional off-exchange prints.

### Legacy aliases — pre-redesign pages only, do not use in new work
`primary #ededed` · `secondary #a3a3a3` · `silver #a1a1aa` ·
`gammaPos #C7D3E8` · `gammaNeg #FF3B30` · `warning #FF9500`

### Holographic silver — the house accent
One shared animated gradient, panned back and forth (`holo-pan`, `ease-in-out`,
`infinite alternate`) so every accented element carries the same living-foil
sheen. `.holo-bg` / `.holo-text` / `.holo-border` pan at **4.5s**, their gradient
layer sized `250% 250%`; `.holo-bar` runs denser and faster (`350% 350%`,
**3.5s**); `.holo-glow` is not a pan at all — it cycles `holo-glow-shift`, a
**5s** box-shadow breathe.

`--holo-gradient` stops: `#aeb9cf → #eef1f8 → #a8c4e8 → #d6c6ee → #f7f8fc →
#b2c8e2 → #e2d4ee → #aeb9cf` (chrome → ice blue → pale violet → white).

- `.holo-bg` — filled surface (active pills, CTAs). Uses the brighter
  `--holo-gradient-bright` run; pairs with dark `ink` text (≥7:1 at every stop).
- `.holo-text` — gradient ink for brand marks and hero numbers.
- `.holo-bar` — meter fills and thin rails (denser 350% pan, 3.5s).
- `.holo-border` — 1px living border under a `#0a0a0a` pad.
- `.holo-glow` — breathing chrome halo (5s `holo-glow-shift`), highest-emphasis card/CTA only.

All degrade to plain silver / no animation under `prefers-reduced-motion`.

### Chart inks
Source of truth `src/components/gex/palette.ts` — the single source for JS-API
consumers (lightweight-charts price lines, canvas primitives). The same values
live in the Tailwind config as `flip`/`king`/`darkpool`; **change both together,
never one alone.**

| Constant | Hex | Marks |
|---|---|---|
| `CALL_WALL` | `#30D158` | The call wall |
| `PUT_WALL` | `#FF3B30` | The put wall |
| `FLIP` | `#7DD3FC` | Gamma-flip regime border (dashed convention) |
| `KING` | `#EA00FF` | Peak-exposure strike |
| `DARK_POOL` | `#2dd4bf` | Dark-pool shelves (dashed, "DP" pill) |
| `SPOT` | `#ededed` | Where the market is — white. Also VWAP's ink |
| `FOCUS` | `#E4E8F4` | What the user clicked (dashed, width 2) |
| `BULL` / `BEAR` | `#30D158` / `#FF3B30` | Generic directional ink for non-wall lines |

`BULL`/`BEAR` exist so nothing imports `CALL_WALL` to color a line that isn't a
wall. Respect that.

**Candle theme** (`candleTheme.ts`, active `CANDLE_THEME_KEY = 'slayer'`) — holo
silver up / luminous violet down, deliberately its own two-tone so price
structure never competes with the green/red analytics:
`up #DCE3F5` / `wickUp #F1F4FF` · `down #A47CF2` / `wickDown #C0A2FF` ·
`volUp rgba(220,227,245,0.22)` / `volDown rgba(164,124,242,0.26)`.
Alternates in the file: `mono`, `classic`, `muted`.

**Chart chrome:** transparent background, axis text `#7d7d7d` in 10px JetBrains
Mono, gridlines `rgba(255,255,255,0.03)`, scale borders `#1c1c1c`, crosshair
`rgba(255,255,255,0.3)` with `#262626` label pads.

**The gold liquidity LUT** (`src/data/liquidityField.ts`) — resting liquidity
owns GOLD, a family nothing else in the terminal uses. Painted from a 256-entry
RGB lookup, gamma-lifted `pow(x, 0.72)` so mid shelves read:
`rgb(16,12,6)` → `rgb(50,34,10)` → `rgb(110,74,16)` → `rgb(176,122,28)` →
`rgb(218,164,46)` → `rgb(242,196,92)` → `rgb(255,226,150)`.
Legend swatch `linear-gradient(to right, rgba(110,74,16,0.5), #F0C45C)`. Cursor
depth read-out tints its label `#F0C45C` (deep ≥65%), `#C89B3C` (moderate ≥30%),
`#7d7d7d` (thin).

**Dealer positioning** (`PositioningMap.tsx`) — `SHORT_GAMMA #E0B84E` gold,
dealer short gamma, moves amplified · `LONG_GAMMA #5EA0EF` blue, dealer long
gamma, dips absorbed.

### Type ramp
Tokens are **font-size only** (string form, no bundled line-height, unlike
Tailwind's built-ins) so the leading each call site sets via `leading-*` is
preserved.

| Token | Size | Used for |
|---|---|---|
| `text-micro` | 10px | Axis ticks, densest legends, chart-corner chips, eyebrows, Esc hints |
| `text-label` | 11px | The dominant uppercase mono label — table headers, badges, StatCard labels |
| `text-caption` | 12px | Table cells, secondary text, SegmentedControl/SubNav tabs (usually `leading-4`) |
| `text-data` | 13px | Readable panel body / data rows, Stat values |
| `text-body` | 14px | Prose in guide / legal / landing |
| `text-read` | 15px | Prose emphasis, card titles |
| `text-lead` | 16px | Largest inline copy |

Above the ramp, Tailwind's rem display scale: `text-lg` 18px for StatCard hero
values with `leading-none`, `text-xl` 20px for page titles.

**Faces:** `font-mono` = JetBrains Mono (all data). `font-sans` = Inter (prose).
Body sets `font-feature-settings: 'cv11','ss01'`.

**Casing:** mono labels are uppercase with tracking — `tracking-wider` (0.05em)
badges/headers, `tracking-widest` (0.1em) panel titles and StatCard/breadcrumb
labels, `tracking-[0.18em]` SubNav group eyebrows.

**The `tnum` rule — every numeric column.**
`.tnum { font-variant-numeric: tabular-nums; }` goes on every cell, stat value,
price pill and read-out that renders a number, so digits align and never shift
as values tick.

**Radii** — mostly Tailwind defaults, plus two arbitrary steps (there is no
`borderRadius` extension in the config): `2px` (`rounded-sm`) legend swatches ·
`3px` (`rounded-[3px]`, arbitrary) SpotRule price pill, TickerTag · `4px`
(`rounded`) badges, chips, toast action, skeleton · `5px` (`rounded-[5px]`,
arbitrary) SubNav pill · `6px` (`rounded-md`) the standard panel / card /
table / toast radius · `8px` (`rounded-lg`) floating menus and the Focus overlay.

**Shadow** — one elevation for every floating surface:
`shadow-overlay: 0 12px 32px -12px rgba(0,0,0,0.75), 0 4px 10px -6px rgba(0,0,0,0.55)`.
The hairline border owns the edge; the shadow just sets it off the canvas. It is
the only drop shadow any *component* uses; two exceptions live in
`src/index.css` as house skin rather than tokens — the `.holo-glow` breathing
chrome halo (`holo-glow-shift`, `0 0 18–20px -6px` in holo tints) and the
react-grid-layout drag state (`.react-grid-item.react-draggable-dragging`,
`0 12px 40px rgba(0,0,0,0.6)`). Everything else is an *inset* shadow
(`.inst-surface` / `.inst-emphasis` top-light, `.rail-*` / `.inst-selected`
rails, `.glass` specular edge).

**Spacing** — Tailwind's 4px scale. The values that recur: panel header height
40px with `px-3.5`; DataTable cells `px-3 py-2 leading-4`; Stat `px-2.5 py-2`;
StatCard `px-3.5 py-3`; SignalBadge `px-1.5 py-0.5`; SegmentedControl buttons
`px-3 py-1.5`; MetricGrid `gap-3` with 150px flex-basis; HoverReadout `px-3 py-2`.

## Primitives
All 23 live in `src/components/ui/`. `DESIGN.md` §5 documents each one's props
and house rules in full — read it before building any of them. In brief:

**tones.ts** — the shared tone system. `Tone = bull | bear | warn | info |
select | magenta | neutral` with `toneText` / `toneDot` / `toneBadge` /
`toneBar` class maps (static strings so Tailwind JIT sees them — don't
template-build these names).

**Panel** — the base dark surface every widget sits in. 40px header, mono
uppercase title + subtitle + actions. Props: `flush` (dense tables bleed to the
edges), `tone` (a whisper of header tint `/[0.05]` + divider `/15`, never a full
wash), `emphasis`, `focusable` (blooms into Focus Mode).

**StatCard** — compact data-first metric cell: 11px mono uppercase label, 18px
mono semibold `tnum` value tinted by `tone`, optional `sub` line and `children`
(meters). Tone lives in the value, not the ornament.

**Stat** — the denser sibling for inline grids and stat rows.

**MetricGrid** — responsive metric row using **flex-wrap, not auto-fit grid**, so
a lone card on the last row grows instead of orphaning at half-width.

**SignalBadge** — mono uppercase pill tinted by `toneBadge` (bg `/10`, border
`/20`); optional status `dot` and `pulse`.

**SegmentedControl** — a single `bg-white/[0.12]` pill glides to the active
segment via framer-motion `layoutId` (one per instance).

**DataTable** — the dense sortable table. Generic `columns` with `render`,
`sortValue`, `help` (a `TermKey`), `align`, `width`. Sticky `panelRaised` header
of 11px mono labels; 12px mono `tnum` cells; row hover `bg-white/[0.02]`;
`selectedKey` row gets `.inst-selected`. Wrap in `<Panel flush>`.

**EmptyState** — centered mono uppercase-tracked title, optional 32px icon chip,
body line (max-w 260px), CTA row. `size` sm/md/lg = `py-4/8/12`.

**Skeleton / SkeletonText / SkeletonRows** — sheen-sweep loading blocks in the
shape of the coming content. Static under reduced motion, `aria-hidden`.

**Toast / ToastProvider / useToast** — portaled bottom-right, `z-[80]`, max 4
stacked. Tone as a tinted border ring + icon; body stays neutral
`bg-panel/95 backdrop-blur shadow-overlay`. Auto-dismiss 3.4s; **a toast
carrying an `action` stays up 2×** — it's a decision, not a note.

**HoverReadout** — the floating read-out card, fixed and **portaled to `<body>`**
(transformed containers would clip it), offset +14px from the cursor, clamped to
the viewport, pointer-events pass through.

**Term** — inline jargon explainer. Dotted-underline `cursor-help` anchor (hover
OR keyboard focus) revealing a fixed 224px card **portaled to `<body>`** (like
HoverReadout — inside transformed containers `fixed` would anchor to the tile and
clip): mono uppercase key, "glossary →" link, one-line sans definition from
`TERMS`. The card stays hoverable and closes on a 140ms delay, so the cursor can
bridge the anchor→card gap and reach the link. Opens upward in the lower half of
the viewport; any scroll dismisses it.

**AnimatedNumber** — rolls between values on a spring that lands well under one
1.5s tick. **Jumps instead of rolling when the formatted width changes**, so
neighbors never get shoved. Flashes the green/red tick tint behind the digits as
an overlay, never a text-color override.

**TickerTag** — a clickable symbol that loads terminal-wide; inherits
surrounding type, hover `bg-select/15`, fires a "Now viewing X" toast. Stops
propagation inside clickable rows.

**TickerJump** — cross-module jump chips (Pulse / Weigh / Pinpoint).

**TickerSearch** — searchable ticker menu, lazy-loads the full NASDAQ universe.
288px `rounded-lg shadow-overlay` dropdown, arrow-key highlight, active symbol
in `text-select`.

**SpotRule** — current-price marker: gradient hairline + ticker + an inverted
axis pill (white `bg-textPrimary`, dark `text-ink` price, `tnum`). The
TradingView price-label idiom. White = "where the market is".

**ChartLegend** — two swatch grammars, chosen by `variant`. `square` (default) is
a wrap of 10×8px `rounded-sm` (2px) swatches + 10px mono uppercase `textMuted`
labels — area/band fills. `line` is a 12×2px `rounded-full` rule + 10px mono
sentence-case `textSecondary` label, spaced `gap-x-3.5` — the chart-toolbar look,
used by StrikeChart, SwingMapChart and LiquidityHeatmapChart. Each entry passes
either `color` (a raw CSS chart color, applied inline) or `swatchClass` (a token
bg class such as `bg-bull`).

**PageHeader** — breadcrumb → icon chip (**resolved from the nav registry**, so
page/nav identity can't drift) + 20px title → caption subtitle; optional center
`ribbon` stat strip and right-aligned `actions`.

**SubNav** — route-driven tabs on a `.glass` bar; the active tab wears a
`holo-bg` pill with dark `text-ink`, slid between tabs as a framer-motion shared
element. Auto-scrolls the active tab into view on phones.

**FocusLayer** — the cinematic frame Focus Mode blooms into: `z-[80]` backdrop
blur over black/80, an `inst-emphasis holo-glow rounded-lg` stage (max 1600px,
88vh). A focused Panel **portals its live body in**, so the instrument keeps
streaming.

**svgHover.ts** — `svgHoverIndex(e, count)`: cursor → nearest data index for
full-width SVG charts. Measures the rendered rect, so it works with
`preserveAspectRatio="none"`.

## Interactions & Behavior

**Every data surface answers at the cursor.** Hovering anything plottable must
produce the number under the cursor. Two implementations, one look:
1. SVG/canvas — `svgHoverIndex` picks the index, `HoverReadout` floats the card.
2. lightweight-charts — a **corner chip**, absolutely positioned top-left
   (`bg-panel/85 border-borderSubtle px-2 py-1`, 10px mono), written
   **imperatively** from `subscribeCrosshairMove`. Per-pixel events; React state
   would re-render 60×/s for a three-span chip. Don't "clean this up" into state.

**Jargon is explained in place.** `src/data/terms.ts` is the single dictionary
(`TERMS`, typed by `TermKey`). `<Term k="GEX">` wraps any abbreviation;
`DataTable` columns opt in with `help: 'GEX'`. New jargon = one new dictionary
line, explained everywhere at once. No glossary trips required.

**Toast-with-undo for destructive actions.** Anything that removes user state
fires a toast carrying `action: { label: 'Undo', onClick }`. Prefer undo over
confirmation for reversible destructions.

**Two-step confirm for irreversible ones.** First click arms the button — it
re-labels and turns bear-tinted (`border-bear/50 bg-bear/15 text-bear`) — second
click executes. The armed state resets when the surface closes. **No modal
dialogs.**

**Never a blank panel.** `EmptyState` for "nothing here yet", `Skeleton*` for
loading — sheen blocks in the shape of the coming content.

**Typographic minus.** Negative money formats through `fmtUsd`
(`src/data/gex.ts`), which prefixes U+2212 `−` — a true minus matching digit
width in tabular figures — and compacts to `$…K/M/B`. Never hand-roll `-$1.2M`
with a hyphen.

**Selection language.** A selected/active/spotlit row is the 2px inset silver
rail + faint wash (`.inst-selected`, or `.rail-*` + `bg-select/[0.06]`).
Selection is always silver — never green/red.

## Motion
One motion hand. Sources: `tailwind.config.ts`, `src/lib/motion.ts`,
`src/index.css`.

- **Curve:** house easeOutExpo `cubic-bezier(0.16, 1, 0.3, 1)`, set as
  Tailwind's `transitionTimingFunction.DEFAULT` so every bare `transition-*`
  inherits it. framer-motion uses the same numbers as `EASE`.
- **Durations:** Tailwind `transitionDuration.DEFAULT = 120ms`. framer-motion
  ladder `DUR`: `fast 0.12s` (hover, route crossfades), `base 0.2s` (content
  swaps), `slow 0.3s` (overlays, drawers — the longest we go).
- **Entrances:** `animate-slide-in` 0.25s (list items, menus) ·
  `animate-view-in` 0.28s (section/route swaps) · `animate-soft-in` 0.2s (same
  panel, new data — shell stays put, only the body cross-fades). All ride the
  house curve.
- **Tick pulse:** `animate-tick-up` / `animate-tick-down`, a 0.55s cell tint
  behind a changed number (`rgba(48,209,88,0.26)` up / `rgba(255,59,48,0.26)`
  down) fading to transparent. **Tint only, never a text-color override**, so it
  can't fight a value's own sign color. `custom-pulse` (1.5s breathe) marks live
  status dots; `animate-cursor-blink` is a hard `steps(1)` on/off — real cursors
  don't fade.
- **Shared-element selection:** active pills (SegmentedControl, SubNav) glide
  between options via framer-motion `layoutId` — selection reads as one moving
  object, not a repaint.
- **Numbers settle.** A data terminal wants numbers at rest. AnimatedNumber's
  spring is stiffness 260 / damping 32, landing well under one 1.5s tick; wall
  price-lines tween 650ms easeOutCubic. Glide, never teleport.
- **Reduced motion is honored everywhere.** Holo pans, skeletons, entrances,
  tick flashes, pulses and number rolls all collapse to static under
  `prefers-reduced-motion: reduce`. `.glass` goes near-opaque under
  `prefers-reduced-transparency`.

## State Management
The design layer itself is close to stateless, but these are the state hooks the
primitives assume exist:

- **Global session symbol** — the active ticker, held in `MarketDataContext`
  (`useTicker` for identity, `useMarketData` for the live snapshot) and switched
  via `changeTicker`. Setting it loads that symbol terminal-wide; the setter
  itself is silent. `TickerTag` adds its own "Now viewing X" info toast on click;
  `TickerSearch` (a controlled `value`/`onChange` menu) and `TickerJump` (which
  also routes to the destination desk via `useTickerNav`) switch without one.
- **Toast queue** — `ToastProvider` + `useToast()`; max 4 stacked, 3.4s
  auto-dismiss, 2× for action toasts.
- **Focus Mode** — which Panel (if any) is focused; the focused panel portals
  its live body into `FocusLayer`. Esc exits.
- **Term open state** — one at a time; any scroll dismisses.
- **Per-table sort** — column key + direction, from `DataTable`'s `sortValue`.
- **Armed state** for two-step confirms; resets when the surface closes.
- **Live feed tick** — the ~1.5s cadence every motion decision is tuned against.
  `AnimatedNumber` springs and tick flashes must both finish inside one tick.

## Assets
No image or icon assets ship in this bundle. Icons in the product come from the
existing icon set wired through the nav registry (`PageHeader` resolves a page's
icon chip from it, so nav and page identity can't drift). Fonts are **JetBrains
Mono** and **Inter** — both Google Fonts; the preview cards fall back to
`ui-monospace`/system sans if they aren't loaded locally, so load the real faces
before judging fidelity.

## Files
`DESIGN.md` — the authoritative spec. Read this first; everything above is a
navigational summary of it.

Preview cards in `design-system/` — each a standalone HTML page, open directly
in a browser:

| File | Shows |
|---|---|
| `colors.html` | Every color token as a swatch grid with hex + usage rule |
| `type.html` | The type ramp, faces, casing conventions, `tnum` |
| `chart-inks.html` | Chart palette, candle theme, gold liquidity LUT, positioning pair |
| `stat-card.html` | StatCard + Stat + MetricGrid, incl. `.inst-surface`/`.inst-emphasis` CSS |
| `data-table.html` | The dense sortable table with sticky header and selected row |
| `badge.html` | SignalBadge across tones, with dot and pulse |
| `segmented-control.html` | The gliding active pill |
| `term.html` | The inline jargon explainer and its floating card |
| `toast.html` | All four toast tones and the action/undo variant |
| `hover-readout.html` | The floating cursor read-out card |
| `empty-skeleton.html` | EmptyState and the Skeleton family |

Source repo: `hotterthenheat/slayersfinal` (branch `main`) — `docs/DESIGN.md`
and `design-system/` upstream.
