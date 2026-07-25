# Slayer Terminal — Design System

The house spec for every surface in the terminal. All values below are extracted
from the sources of truth — `tailwind.config.ts`, `src/index.css`,
`src/components/gex/palette.ts`, `src/components/gex/candleTheme.ts`,
`src/components/ui/*`, `src/data/terms.ts` — never invented. When code and this
document disagree, the code wins; fix the doc.

---

## 1. Principles

- **Dense terminal.** This is an instrument, not a brochure. Panels are compact
  (10–13px mono label tiers), whitespace is spent on scanability, not air.
  Metric rows, tables, and chips pack; prose is the exception (14–16px sans).
- **Dark only.** One theme: near-black canvas (`#050505`), machined panels
  (`#0a0a0a`), hairline borders. `html { color-scheme: dark }` — there is no
  light mode to design for.
- **Data first, chrome last.** Color belongs to data. Tone lives in the value,
  never in the ornament (StatCard/Stat house rule). Surfaces stay monochrome;
  the loudest thing on a page should be a number or a level, not a frame.
- **Jargon always explained in place.** Every abbreviation a header or badge
  uses (GEX, VEX, OTM%, Sig…) is a `<Term>` with a one-line definition from the
  `TERMS` dictionary, revealed on hover or keyboard focus — no glossary trips
  required (the long form still lives in Guide → Concepts).
- **Every data surface answers at the cursor.** Charts, heatmaps, and bars all
  carry a read-out: a portaled `HoverReadout` card near the pointer, or a
  corner chip on lightweight-charts. Hovering anything plottable must produce
  the number under the cursor.
- **A tone is never the only signal.** Directional/status color is always
  paired with a label or icon (`tones.ts` rule) — the terminal must survive
  color-blindness and grayscale.

---

## 2. Color tokens

Source: `tailwind.config.ts → theme.extend.colors`.

### Surface stack

| Token | Hex | Role |
|---|---|---|
| `canvas` | `#050505` | The page background. |
| `panel` | `#0a0a0a` | Default widget surface (`inst-surface` base). |
| `panelRaised` | `#0c0c0c` | Raised surface — sticky table headers, tooltips, hover cards. |
| `panelHover` | `#101010` | Hovered panel surface. |
| `inset` | `#070707` | Recessed wells — chart frames, icon chips, list rows. |
| `inputBg` | `#050505` | Form fields. |
| `ink` | `#0a0a0a` | Dark text/icons **on** light chrome (holo pills, silver CTAs, SpotRule tag). |

The stack reads bottom-up: `canvas` → `inset` (recessed) → `panel` (resting) →
`panelRaised` (floating). Elevation is expressed by these steps plus the
hairline border — never by heavy shadows (the single `shadow-overlay` is the
only drop shadow in the system).

### Border pair (+ focus)

| Token | Hex | Role |
|---|---|---|
| `borderSubtle` | `#1c1c1c` | The default hairline — panel edges, row dividers. |
| `borderMuted` | `#2a2a2a` | The louder hairline — hover borders, floating-card edges, emphasis panels. |
| `borderFocus` | `#ededed` | Reserved for focus treatments. |

Rule: `borderSubtle` at rest, `borderMuted` on hover/for floating surfaces.
Keyboard focus is global: `:focus-visible { outline: 1px solid
rgba(228,232,244,0.6); outline-offset: 1px; }` (components echo it as
`ring-select/60`).

### Text tiers

| Token | Hex | Role |
|---|---|---|
| `textPrimary` | `#ededed` | Values, titles. |
| `textSecondary` | `#a3a3a3` | Labels, table headers, subtitles. |
| `textMuted` | `#7d7d7d` | Axis ticks, hints, sub-lines. Lifted from `#6b6b6b` so sub-12px labels clear ~4.5:1 (WCAG AA) on the dark canvas. |

### Directional / status accents

| Token | Hex | Role |
|---|---|---|
| `bull` | `#30D158` | Up / support / success (Apple system green). |
| `bear` | `#FF3B30` | Down / resistance / error (hot red). |
| `warn` | `#FF9500` | Caution (true orange — reads clearly apart from silver and hot red). |
| `select` | `#E4E8F4` | Holographic silver — selection + brand. **Interface only, never data.** ~14:1 on canvas. |

**Usage rules:**

- **`bull`/`bear` are DATA inks, not decoration.** They mark direction, sign,
  and walls. Never use green/red for a decorative flourish, and never use
  silver for bullishness — direction reads *green up / hot red down*, period.
- **`select` is the selection language.** The holo-silver family marks what
  the user chose: selected rows (`.inst-selected`), the FOCUS price line, the
  active symbol in TickerSearch, focus rings. It never encodes a market
  quantity.
- **`warn` is caution only** — degraded feeds, risky toggles, warn toasts and
  the `.rail-warn` spotlight. Not a third direction.
- Accents are applied at low alphas for chrome (`/10` badge tints, `/15`
  dividers, `/[0.05]` header washes) and at full strength only in the value or
  ink itself (`toneBar` keeps element chrome ≥ `/70`).

### GEX structural levels

| Token | Hex | Role |
|---|---|---|
| `flip` | `#7DD3FC` | Gamma flip — baby blue, the cool regime border against silver/red. Doubles as the `info` tone. |
| `king` | `#EA00FF` | Magenta — the engine's-standout family (TOP PICK, NET, king strike). |
| `darkpool` | `#2dd4bf` | Teal — institutional off-exchange reference prints. |

### Legacy aliases (pre-redesign pages only — do not use in new work)

`primary #ededed` · `secondary #a3a3a3` · `silver #a1a1aa` ·
`gammaPos #C7D3E8` · `gammaNeg #FF3B30` · `warning #FF9500`

### Holographic silver (the house accent)

One shared animated gradient (`--holo-gradient`, chrome → ice blue → pale
violet → white; stops `#aeb9cf → #eef1f8 → #a8c4e8 → #d6c6ee → #f7f8fc →
#b2c8e2 → #e2d4ee → #aeb9cf`) panned back and forth (`holo-pan`, 4.5s
alternate) so every accented element carries the same living-foil sheen:

- `.holo-bg` — filled surface (active pills, CTAs). Uses the brighter
  `--holo-gradient-bright` run and pairs with dark `ink` text (≥7:1 at every stop).
- `.holo-text` — gradient ink for brand marks, hero numbers.
- `.holo-bar` — meter fills and thin rails (denser 350% pan).
- `.holo-border` — 1px living border under a `#0a0a0a` pad.
- `.holo-glow` — breathing chrome halo for the highest-emphasis card/CTA.

All degrade to plain silver / no animation under `prefers-reduced-motion`.

---

## 3. Chart palette

Source: `src/components/gex/palette.ts` — the single source for JS-API
consumers (lightweight-charts price lines, canvas primitives). The same values
live in the Tailwind config as `flip`/`king`/`darkpool`; change both together,
never one alone.

| Constant | Hex | Marks |
|---|---|---|
| `CALL_WALL` | `#30D158` | The call wall (bull green — silver is selection-only, never direction). |
| `PUT_WALL` | `#FF3B30` | The put wall (hot red). |
| `FLIP` | `#7DD3FC` | The gamma-flip regime border (dashed line convention). |
| `KING` | `#EA00FF` | The peak-exposure strike (engine-standout magenta). |
| `DARK_POOL` | `#2dd4bf` | Dark-pool shelves / institutional prints (dashed, "DP" pill). |
| `SPOT` | `#ededed` | Where the market is — white. Also VWAP's ink. |
| `FOCUS` | `#E4E8F4` | What the user clicked — holo-silver selection language (dashed, width 2). |
| `BULL` / `BEAR` | `#30D158` / `#FF3B30` | Generic directional ink for chart lines that aren't walls (trend, cumulative delta, sigma tails) — named by direction so nothing imports "CALL_WALL" to color a non-wall. |

### Candle theme

Source: `src/components/gex/candleTheme.ts`. Active theme:
`CANDLE_THEME_KEY = 'slayer'`.

The **slayer** signature is the house look — holographic silver up / luminous
violet down. Its OWN two-tone, deliberately distinct from the green/red the
walls and GEX nodes own, so price structure never competes with the analytics:

| Slot | Value |
|---|---|
| `up` / `wickUp` | `#DCE3F5` / `#F1F4FF` |
| `down` / `wickDown` | `#A47CF2` / `#C0A2FF` |
| `volUp` / `volDown` | `rgba(220,227,245,0.22)` / `rgba(164,124,242,0.26)` |

Alternates in the file: `mono` (near-white `#eef1f5` / slate `#565c68`),
`classic` (bull/bear `#30D158`/`#FF3B30`), `muted` (sage `#6fae94` / clay
`#c47484`).

Chart chrome (from the lightweight-charts setups): transparent background,
axis text `#7d7d7d` in 10px JetBrains Mono, gridlines `rgba(255,255,255,0.03)`,
scale borders `#1c1c1c`, crosshair `rgba(255,255,255,0.3)` with `#262626`
label pads.

### The gold liquidity LUT

Source: `src/data/liquidityField.ts`. The resting-liquidity heat field is
painted from a 256-entry RGB lookup (`makeLiquidityLUT()`), gamma-lifted
(`pow(x, 0.72)`) so mid shelves read. The ramp (`LIQ_STOPS`) runs from
near-invisible against the inset background up through amber to bright gold —
liquidity owns GOLD, a family nothing else in the terminal uses:

`rgb(16,12,6)` → `rgb(50,34,10)` deep amber-brown → `rgb(110,74,16)` amber →
`rgb(176,122,28)` gold → `rgb(218,164,46)` bright gold → `rgb(242,196,92)`
pale gold → `rgb(255,226,150)` light gold.

Legend swatch: `linear-gradient(to right, rgba(110,74,16,0.5), #F0C45C)`. The
cursor depth read-out tints its label `#F0C45C` (deep shelf ≥65%), `#C89B3C`
(moderate ≥30%), `#7d7d7d` (thin).

### Dealer-positioning convention

Source: `src/components/gex/PositioningMap.tsx`:

- `SHORT_GAMMA = '#E0B84E'` — gold: dealer **short** gamma (moves amplified).
- `LONG_GAMMA = '#5EA0EF'` — blue: dealer **long** gamma (dips absorbed).

This gold/blue pair is the positioning language only — it does not replace
bull/bear, and it deliberately avoids green/red so a positioning map never
reads as a P&L map.

---

## 4. Type ramp

Source: `tailwind.config.ts → theme.extend.fontSize`. Every size below
`text-lg` was consolidated from ~1,180 scattered `text-[Npx]` utilities into
one named system. The tokens are **font-size only** (string form, no bundled
line-height — unlike Tailwind's built-ins) so the leading each call site sets
via `leading-*` is preserved; common pairings noted below.

| Token | Size | Used for |
|---|---|---|
| `text-micro` | 10px | Axis ticks, densest legends, chart-corner chips, eyebrow labels, Esc hints. |
| `text-label` | 11px | The dominant uppercase mono label — table headers, badges, StatCard labels, breadcrumbs, empty-state titles. |
| `text-caption` | 12px | Table cells, secondary text, SegmentedControl/SubNav tabs (usually `leading-4`). |
| `text-data` | 13px | Readable panel body / data rows, Stat values. |
| `text-body` | 14px | Prose in guide / legal / landing. |
| `text-read` | 15px | Prose emphasis, card titles. |
| `text-lead` | 16px | Largest inline copy. |

Headings above the ramp keep Tailwind's rem-based display scale (`text-lg`
18px for StatCard hero values with `leading-none`, `text-xl` 20px for page
titles).

**Faces** (`fontFamily`): `font-mono` = **JetBrains Mono** for all data —
labels, values, tables, badges, axis text. `font-sans` = **Inter** for prose
(body copy, Term definitions, subtitles). The body sets
`font-feature-settings: 'cv11','ss01'`.

**Casing convention:** mono labels are uppercase with tracking — `tracking-wider`
(0.05em) for badges/headers, `tracking-widest` (0.1em) for panel titles and
StatCard/breadcrumb labels, `tracking-[0.18em]` for SubNav group eyebrows.

**The `tnum` rule: every numeric column.** `.tnum { font-variant-numeric:
tabular-nums; }` goes on every cell, stat value, price pill, and read-out that
renders a number, so digits align and never shift as values tick
(`AnimatedNumber` renders `tabular-nums` inline-block for the same reason).

**Radii** (no custom scale — Tailwind defaults, used deliberately):
`rounded-[2px]` legend swatches · `rounded-[3px]` SpotRule price pill,
TickerTag · `rounded` (4px) badges, chips, toast action, skeleton ·
`rounded-[5px]` SubNav pill · `rounded-md` (6px) the standard panel/card/table/
toast radius · `rounded-lg` (8px) floating menus (TickerSearch) and the Focus
overlay.

**Shadow:** one elevation for every floating surface — `shadow-overlay:
0 12px 32px -12px rgba(0,0,0,0.75), 0 4px 10px -6px rgba(0,0,0,0.55)`. The
hairline border owns the edge; the shadow just sets it off the canvas.

---

## 5. Primitives (`src/components/ui/`)

**tones.ts** — the shared tone system: `Tone = bull | bear | warn | info |
select | magenta | neutral` with `toneText` / `toneDot` / `toneBadge` /
`toneBar` class maps (static strings so Tailwind JIT sees them). House rule
lives here: a tone is never the only signal — always pair with a label or icon.

**Panel** — the base dark surface every widget sits in (`inst-surface`,
`rounded-md`; 40px header `px-3.5` with mono uppercase title + subtitle +
actions). Props: `flush` (dense tables bleed to the edges), `tone` (a whisper
of header tint `/[0.05]` + divider `/15` — never a full wash), `emphasis`
(quiet static lift via `inst-emphasis`), `focusable` (blooms into Focus Mode).

**StatCard** — compact data-first metric cell: mono `text-label` uppercase
label, 18px mono semibold `tnum` value tinted by `tone`, optional `sub` line
and `children` (meters). `emphasis` swaps to `inst-emphasis`. Tone lives in
the value, not in ornament.

**Stat** — the denser sibling of StatCard for inline grids and stat rows
(`px-2.5 py-2`, `text-micro` label, `text-data` value). Reach for StatCard
when the metric is a hero readout.

**MetricGrid** — responsive metric row using flex-wrap (not auto-fit grid) so a
lone card on the last row grows instead of orphaning at half-width; `min` is
each card's flex-basis (default 150px), `gap-3`.

**SignalBadge** — mono uppercase pill (`text-label` semibold, `rounded` border,
`px-1.5 py-0.5`) tinted by `toneBadge` (bg `/10`, border `/20`); optional
status `dot` and `pulse` (the live-tick pulse animation).

**SegmentedControl** — compact segmented selector on an `inst-surface`; a
single `bg-white/[0.12]` pill glides to the active segment (framer-motion
`layoutId` shared element, one per instance). Buttons: `px-3 py-1.5` mono
`text-caption`.

**DataTable** — the dense sortable table. Generic `columns` with `render`,
`sortValue` (sortable), `help` (a `TermKey` — wraps the header in `<Term>`),
`align`, `width`. Sticky `panelRaised` header row of mono `text-label`
headers; `text-caption tnum` mono cells (`px-3 py-2 leading-4`); row hover
`bg-white/[0.02]`; `selectedKey` row gets `.inst-selected`. Wrap in
`<Panel flush>` for the standard look; empty rows render `EmptyState size="sm"`.

**EmptyState** — the house "nothing here yet" state: centered mono
uppercase-tracked title, optional icon chip (32px, `border-borderSubtle
bg-inset`), body line (max-w 260px) and CTA row. `size` sm/md/lg = `py-4/8/12`;
`fill` centers in a full-height panel body.

**Skeleton / SkeletonText / SkeletonRows** — loading placeholders on the
`.skeleton` sheen-sweep block (static under reduced motion, `aria-hidden`).
`SkeletonText` stacks shrinking lines; `SkeletonRows` is a header line over
row blocks for loading tables/feeds.

**Toast / ToastProvider / useToast** — ephemeral action feedback, portaled
bottom-right (`z-[80]`, max 4 stacked). Four tones (success/error/warn/info)
expressed as a tinted border ring (`border-bull/40` etc.) + icon; body stays
neutral `bg-panel/95 backdrop-blur shadow-overlay`. Auto-dismisses at 3.4s; a
toast carrying an `action` (label + onClick) stays up 2× — it's a decision,
not a note.

**HoverReadout** — the house floating read-out card for chart/heatmap/bar
hovers: fixed, portaled to `<body>` (transformed containers would clip it),
offset +14px from the cursor and clamped to the viewport;
`border-borderMuted bg-panelRaised px-3 py-2 rounded-md shadow-overlay`,
pointer-events pass through.

**Term** — inline jargon explainer: dotted-underline `cursor-help` anchor
(hover OR keyboard focus) revealing a fixed 224px card — mono uppercase key,
"glossary →" link, one-line sans definition from `TERMS`. Opens upward in the
lower half of the viewport; any scroll dismisses it.

**AnimatedNumber** — rolls between values on a spring tuned to land well under
one 1.5s tick, `tabular-nums`; JUMPS instead of rolling when the formatted
width changes (so neighbors never get shoved). Flashes the green/red tick tint
behind the digits on change (tint overlay, never a text-color override).
Honors reduced motion.

**TickerTag** — a ticker symbol you can click to load it terminal-wide (global
session state); inherits the surrounding text's type, adds hover
`bg-select/15` + a "Now viewing X" info toast. Stops propagation inside
clickable rows.

**TickerJump** — cross-module jump chips (Pulse / Weigh / Pinpoint): bordered
mono `text-micro` uppercase buttons that send a research name straight into
the terminals.

**TickerSearch** — compact searchable ticker menu (lazy-loads the full NASDAQ
universe): `bg-panel` trigger with the current symbol; 288px `rounded-lg
shadow-overlay` dropdown with search field, arrow-key highlight, active symbol
in `text-select`.

**SpotRule** — current-price marker: gradient hairline rule + ticker + an
inverted axis pill (white `bg-textPrimary` tag, dark `text-ink` price, `tnum`)
— the TradingView price-label idiom. White = "where the market is".

**ChartLegend** — the house legend: wrap of 10×8px `rounded-[2px]` swatches +
mono `text-micro` uppercase labels; pass a raw chart `color` or a token
`swatchClass`.

**PageHeader** — breadcrumb (mono `text-label` uppercase `tracking-widest`) →
icon chip (resolved from the nav registry, so page/nav identity can't drift) +
`text-xl` title → caption subtitle; optional center `ribbon` stat strip and
right-aligned `actions`.

**SubNav** — route-driven sub-page tabs on a `.glass` bar; the active tab wears
a holographic-silver pill (`holo-bg`) with dark `text-ink`, slid between tabs
as a framer-motion shared element. Items with `group` split into labelled
clusters; the active tab auto-scrolls into view on phones.

**FocusLayer** — the cinematic frame Focus Mode blooms into: `z-[80]` backdrop
blur over black/80, an `inst-emphasis holo-glow rounded-lg` stage (max 1600px,
88vh) with a Focus header + Esc chip. A focused Panel portals its **live**
body in, so the instrument keeps streaming.

**svgHover.ts** — `svgHoverIndex(e, count)`: cursor → nearest data index for
full-width SVG charts (measures the rendered rect, so it works with
`preserveAspectRatio="none"`). Kept apart from HoverReadout so the component
file stays fast-refresh-clean.

---

## 6. Patterns

**Hover read-outs.** Two implementations, one look. (1) SVG/canvas surfaces:
`svgHoverIndex` picks the index, `HoverReadout` floats the card at the cursor.
(2) lightweight-charts: a **corner chip** — an absolutely-positioned top-left
chip (`bg-panel/85 border-borderSubtle px-2 py-1` mono `text-micro`) written
*imperatively* from `subscribeCrosshairMove` (per-pixel events; React state
would re-render 60×/s for a three-span chip). Example: the liquidity chart's
`$price · time · depth% · label` read-out. Either way: hovering a data surface
always answers with the number under the cursor.

**Term jargon system.** `src/data/terms.ts` is the single dictionary
(`TERMS`, typed by `TermKey`); `<Term k="GEX">` wraps any abbreviation with the
dotted underline + floating definition; `DataTable` columns opt in with
`help: 'GEX'`. New jargon = one new dictionary line, explained everywhere at
once.

**Toast-with-undo for destructive actions.** Anything that removes user state
fires a toast carrying an `action: { label: 'Undo', onClick }` that restores
it (see Tracker's untrack flow). Action toasts persist 2× the normal 3.4s.
Prefer undo over confirmation for reversible destructions.

**Two-step confirm.** For *irreversible* destructions (clearing stored data in
SettingsPanel): first click arms the button — it re-labels and turns bear-tinted
(`border-bear/50 bg-bear/15 text-bear`) — second click executes; the armed
state resets when the surface closes. No modal dialogs.

**Empty & loading states.** Never a blank panel: `EmptyState` for "nothing
here yet" (one centered mono line, optional icon/body/CTA), `Skeleton*` for
loading (sheen blocks in the shape of the coming content — `SkeletonRows`
where a table will land).

**Typographic minus.** Negative money formats through the shared
`fmtUsd` (`src/data/gex.ts`), which prefixes U+2212 `'−'` — a true minus that
matches digit width in tabular figures — and compacts to `$…K/M/B`. Don't
hand-roll `-$1.2M` with a hyphen.

**Selection language.** A selected/active/spotlit row = the 2px inset silver
rail + faint wash (`.inst-selected`, or `.rail-*` + `bg-select/[0.06]` at the
call site). Selection is always silver — never green/red.

---

## 7. Motion

One motion hand. Source: `tailwind.config.ts` + `src/lib/motion.ts` +
`src/index.css`.

- **Curve:** every bare `transition-*` inherits the house easeOutExpo
  `cubic-bezier(0.16, 1, 0.3, 1)` (Tailwind `transitionTimingFunction.DEFAULT`);
  framer-motion uses the same numbers as `EASE`.
- **Durations:** Tailwind `transitionDuration.DEFAULT = 120ms`. The
  framer-motion ladder `DUR`: `fast 0.12s` (hover states, route crossfades),
  `base 0.2s` (content swaps), `slow 0.3s` (overlays, drawers — the longest we
  go).
- **Entrances** (`index.css`): `animate-slide-in` 0.25s (list items, menus),
  `animate-view-in` 0.28s (section/route swaps), `animate-soft-in` 0.2s (same
  panel, new data — shell stays put, only the body cross-fades). All ride the
  house curve.
- **Tick pulse:** `animate-tick-up` / `animate-tick-down` — a 0.55s cell tint
  behind a changed number (`rgba(48,209,88,0.26)` up / `rgba(255,59,48,0.26)`
  down), fading to transparent. Tint only, never a text-color override, so it
  can't fight a value's own sign color. `custom-pulse` (1.5s scale/opacity
  breathe) marks live status dots; `animate-cursor-blink` is a hard
  `steps(1)` on/off (real cursors don't fade).
- **Shared-element selection:** active pills (SegmentedControl, SubNav) glide
  between options via framer-motion `layoutId` — selection reads as one moving
  object, not a repaint.
- **Numbers settle.** A data terminal wants numbers at rest: AnimatedNumber's
  spring (stiffness 260, damping 32) lands well under one 1.5s tick, and wall
  price-lines tween 650ms easeOutCubic — glide, never teleport.
- **Reduced motion is honored everywhere:** holo pans, skeletons, entrances,
  tick flashes, pulses, and number rolls all collapse to static under
  `prefers-reduced-motion: reduce`; `.glass` goes near-opaque under
  `prefers-reduced-transparency`.
