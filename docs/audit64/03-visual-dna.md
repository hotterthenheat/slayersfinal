# 03 — Visual DNA

**Gates 8, 18, 19, 20, 21, 22, 23, 24** · Slayer Terminal · audit date 2026-08-03

> This document is the **baseline the redesign must respect**. Everything below is extracted from the
> sources of truth or measured in a real browser. Nothing here is a preference.

**Method.**
Static inventory: `rg` census over `src/**/*.{ts,tsx}` (174 `.tsx`, 301 source files).
Runtime measurement: production build already served at `http://127.0.0.1:8123`, Playwright 1.61.1 driving
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome` at **1440×900**, `slayer_onboarded_v1=1` pre-seeded,
`fonts.g*` aborted, 2.2–2.5 s settle. Computed styles harvested off every visible element under `main`
across `/compass`, `/pinpoint/gex`, `/pulse`, `/terminal`, `/pinpoint/flow`, `/tracker`.
Contrast: WCAG 2.x relative-luminance formula, alpha composited against the real backdrop.

Scratch scripts (re-runnable):
`/tmp/claude-0/-home-user-slayersfinal/61510a72-f878-56b9-9620-dab6cb6adbf2/scratchpad/{contrast,dna,hover,pulse}.mjs`
Raw data: `.../scratchpad/dna.json`.
Screenshots: `.../scratchpad/shots2_compass.png`, `shots2_pulse.png`, `shots2_tracker.png`, `dna_compass_table.png`.

---

## 0. Headline

**The token system is in unusually good health.** Across 174 `.tsx` files there are exactly **2** arbitrary
hex colour utilities (`text-[#…]`), **0** arbitrary font sizes (`text-[Npx]`), **0** Tailwind `duration-*`
utilities, and **1517 `font-mono` vs 2 `font-sans`**. Six desks render only **14 distinct text colours** and
**one** transition recipe (`0.12s cubic-bezier(0.16,1,0.3,1)`, 281 elements). That discipline is the asset.

**Three things measured out as real defects, and one of them is systemic.**

1. **The repo carries two contradictory canonical tone rules.** `src/components/compass/setupState.ts:67-72`
   states green/red may never mark a process state. `docs/DESIGN.md:82` defines `bull` as
   "Up / support / **success**". Compass obeys the strict rule; Tracker, News, Fracture and Toast obey the
   loose one. The result is on screen: **`/tracker` renders a 52 % win rate and the string
   `Discounted Puts` in bull green** (`shots2_tracker.png`).
2. **The default candlestick theme paints direction in the selection colour.** `CANDLE_THEME_KEY = 'slayer'`
   → up `#DCE3F5`. Three source files say silver is selection-only and never direction.
3. **Elevation does not exist as a luminance signal.** `canvas → panel` measures **1.029:1**,
   `panel → panelRaised` **1.012:1**. Every surface boundary in the app is carried by a 1 px hairline alone.
   That is a deliberate, distinctive choice — but it means the redesign has *no* headroom to add depth
   without inventing new surface values.

---

## 1. GATE 18 — Surfaces & elevation

Source: `tailwind.config.ts:26-45`, `src/index.css:132-214`.

| Level | Token | Hex | Where | Utility sites |
|---|---|---|---|---|
| Canvas | `canvas` | `#050505` | page background, `<body>` | 12 |
| Recessed | `inset` | `#070707` | chart wells, icon chips, list rows | 101 |
| Resting panel | `panel` | `#0a0a0a` | `.inst-surface` base, every widget | 80 |
| Emphasis panel | *(literal)* | `#0b0b0b` | `.inst-emphasis` only (`index.css:191`) | — |
| Raised | `panelRaised` | `#0c0c0c` | sticky table headers, `HoverReadout`, `Term` card | 18 |
| Form field | `inputBg` | `#050505` | inputs (identical to canvas) | 7 |
| Dark ink | `ink` | `#0a0a0a` | text **on** light chrome (holo pills, `SpotRule` tag) | 20 |
| Hovered panel | `panelHover` | `#101010` | **nowhere — 0 sites** | **0** |

### Measured luminance steps between adjacent surfaces

| Pair | Contrast ratio |
|---|---|
| `canvas #050505` → `panel #0a0a0a` | **1.029** |
| `panel #0a0a0a` → `inset #070707` | **1.017** |
| `panel #0a0a0a` → `panelRaised #0c0c0c` | **1.012** |
| `panel #0a0a0a` → `borderSubtle #1c1c1c` | 1.162 |
| `panel #0a0a0a` → `borderMuted #2a2a2a` | 1.379 |
| `panel #0a0a0a` → `.inst-surface` bevel `#333333` | 1.567 |

**Reading:** the surface ramp is perceptually flat. The hairline is 10–14× the step of the surface it sits
on. Every boundary you can see in a screenshot is a border, not a fill.

### The three surface recipes

**`.inst-surface`** (`index.css:132-138`) — the house box, **92 call sites**:
```
background-color: #0a0a0a;
background-image: linear-gradient(180deg, rgba(255,255,255,.025), rgba(255,255,255,0) 46%);
border: 1px solid #1c1c1c;  border-top-color: #333333;   /* machined bevel */
box-shadow: inset 0 1px 0 rgba(255,255,255,.03);
```
Measured live: **35 elements** across the six desks carry the `#333333 | #1c1c1c` border-top/bottom
signature, against **364** elements carrying flat `#1c1c1c` on all four sides. The bevel is the minority
treatment, not the ambient one.

**`.inst-emphasis`** (`index.css:190-196`) — `#0b0b0b`, `1px #2a2a2a`, top `#3a3a3a`, inset top-light `.04`.
**3 call sites.** Explicitly de-ornamented: `Panel.tsx:87-89` — *"Emphasis is now a quiet static lift … no
animated holo frame, glow, or corner ticks."*

**`.glass`** (`index.css:147-159`) — `rgba(9,9,11,.55)` + `blur(20px) saturate(180%)` + `inset 0 1px 0
rgba(255,255,255,.08)`. **9 call sites, navigation chrome only.** Degrades to `rgba(9,9,11,.94)` under
`prefers-reduced-transparency`. This is the *only* translucent surface in the app.

### Overlay surface

One shadow token exists in the entire system — `tailwind.config.ts:24`:
```
shadow-overlay: 0 12px 32px -12px rgba(0,0,0,0.75), 0 4px 10px -6px rgba(0,0,0,0.55)
```
Floating surfaces are `border-borderMuted bg-panelRaised … shadow-overlay` (`HoverReadout.tsx:51`,
`Term.tsx:94`). **Measured at rest across six desks: `shadow-overlay` never appears** — the only box-shadows
painted are the `.inst-surface` inset top-light (35), the focus ring (3) and the selection rails (5).
The terminal at rest is a completely shadowless surface.

### Dead surface classes

| Class | Defined | Documented | Call sites |
|---|---|---|---|
| `.inst-ticks` (corner registration reticles) | `index.css:163-184` | `index.css:126-131` | **0** |
| `.holo-border` (1 px living gradient border) | `index.css:102-109` | `DESIGN.md:129` | **0** |
| `panelHover` `#101010` | `tailwind.config.ts:33` | `DESIGN.md:47` | **0** |
| `borderFocus` `#ededed` | `tailwind.config.ts:43` | `DESIGN.md:63` | **0** |
| `primary` `secondary` `silver` `gammaPos` `gammaNeg` `warning` | `tailwind.config.ts:79-86` | `DESIGN.md:110-117` | **0 each** |

**8 of 29 colour tokens (27.6 %) have zero call sites.**

---

## 2. GATE 19 — Borders

Only **three** border tokens exist. Measured utility census:

| Token | Hex | Sites | Role in practice |
|---|---|---|---|
| `borderSubtle` | `#1c1c1c` | **427** | the default hairline: panel edges, row dividers, chip outlines |
| `borderMuted` | `#2a2a2a` | **126** | the louder hairline: floating cards, hover borders, `.inst-emphasis` |
| `borderFocus` | `#ededed` | **0** | dead |

Alpha ladder actually in use on `borderSubtle`: `/70` (3), `/60` (21), `/50` (5), `/40` (14), `/30` (16),
`/20` (2) — six fractional steps of one token.

Rendered border-width distribution across six desks:

| Widths (T R B L) | Count | Meaning |
|---|---|---|
| `1px 1px 1px 1px` | 443 | closed boxes |
| `0 0 1px 0` | 145 | row / section dividers |
| `1px 0 0 0` | 64 | top rules |
| `1px 0 1px 0` | 6 | banded rows |
| `0 0 0 1px` | 5 | column separators |

**Nothing in the app is thicker than 1 px.** The only 2 px marks are `box-shadow` selection rails
(`.rail-*`, `index.css:202-206`).

Rendered border colours, top 6:

| Colour | Count | Source |
|---|---|---|
| `rgb(28,28,28)` | 364 | `borderSubtle` |
| `rgba(28,28,28,.6)` | 82 | `borderSubtle/60` (DataTable row rule) |
| `rgb(51,51,51) \| rgb(28,28,28)` | 35 | `.inst-surface` bevel |
| `rgba(28,28,28,.3)` | 34 | `borderSubtle/30` |
| `rgba(48,209,88,.2)` | 30 | `toneBadge.bull` |
| `rgba(228,232,244,.2)` | 26 | `toneBadge.select` |

---

## 3. GATE 20 — Type

### Faces

`tailwind.config.ts:114-140`. Loaded from Google Fonts with real fallback stacks (Inter → DejaVu-safe
metrics; JetBrains Mono → `ui-monospace/SFMono/Menlo/Consolas`).

**Measured usage, static:** `font-mono` **1517** · `font-sans` **2**.
**Measured usage, rendered (2295 text nodes over six desks):** JetBrains Mono **2104 (91.7 %)** ·
Inter **191 (8.3 %)**.

This is not a mono-accented UI. It is a mono UI with a prose escape hatch.

### The ramp

`tailwind.config.ts:95-103`. Deliberately **font-size only** (string form, no bundled line-height) so
call-site `leading-*` survives.

| Token | px | Static sites | Carries numbers (`tnum` co-occurrence) | Carries uppercase labels |
|---|---|---|---|---|
| `text-micro` | 10 | **726** | 193 | 373 |
| `text-label` | 11 | **588** | 129 | 283 |
| `text-caption` | 12 | **287** | 121 | 22 |
| `text-data` | 13 | 77 | 34 | 12 |
| `text-body` | 14 | 41 | 13 | 0 |
| `text-read` | 15 | 17 | 7 | 1 |
| `text-lead` | 16 | 4 | 2 | 1 |
| `text-lg` / `xl` / `2xl` / `3xl` / `4xl` / `6xl` | 18/20/24/30/36/60 | 10/6/13/14/14/1 | 8/3/10/4/2/0 | 1/0/0/0/0/0 |

**Arbitrary `text-[Npx]` utilities: 0.** The ramp has no leaks.

### Rendered size distribution (2295 visible text nodes, six desks)

| px | nodes | share |
|---|---|---|
| **11** | 978 | 42.6 % |
| **12** | 691 | 30.1 % |
| **10** | 551 | 24.0 % |
| 16 | 38 | 1.7 % |
| 13 | 20 | 0.9 % |
| 18 | 6 | · |
| 20 | 5 | · |
| 14 | 4 | · |
| 36 | 1 | · |
| 15 | 1 | · |

**96.7 % of all rendered text is 10–12 px.** One element on `/compass` reaches 36 px — the hero score
(`"94"`). That single number is the whole typographic hierarchy of the desk.

Per-desk, the flatness is uneven and worth recording:

| Route | text nodes | max visible size | share at 10–11 px |
|---|---|---|---|
| `/compass` | 686 | **36 px** (hero score) | 69 % |
| `/tracker` | 504 | 18 px | 33 % |
| `/terminal`, `/pinpoint/*` | 105 | 20 px (page H1) | 38 % |
| **`/pulse`** | 790 | **13 px** (the 16 px node is `sr-only`) | **97.2 %** |

`/pulse` — the flagship workspace — has no text larger than 13 px anywhere on screen.

### Weight, casing, tracking

| Property | Rendered census |
|---|---|
| `font-weight` | 400 (1426) · 600 (714) · 700 (128) · 500 (27) |
| `text-transform` | `none` 1660 · **`uppercase` 635 (27.7 %)** |
| `letter-spacing` | `normal` 1622 · **0.55px** 293 · **1px** 177 · 0.5px 99 · 1.1px 51 · 0.6px 35 · 0.25px 11 · negative 7 |

Static: `tracking-wider` (0.05em) **405** · `tracking-widest` (0.1em) **310** · `tracking-tight` 26 ·
`tracking-wide` 13. `uppercase` appears **759 times in 141 of 174 `.tsx` files (81 %)**.

**The `tnum` rule holds:** `.tnum` is applied at **629 sites**. Every number column is tabular.
`body { font-feature-settings: 'cv11','ss01' }` (`index.css:11`).

### Numbers vs labels — the actual split

- **Labels** are `text-micro`/`text-label` + `uppercase` + `tracking-wider|widest` + `text-textMuted`
  or `text-textSecondary`. 656 of 692 uppercase-with-size sites are 10 or 11 px.
- **Numbers** live one tier up from their label and are `font-semibold` + `tnum`:
  `Stat` = 10 px label → 13 px value (`Stat.tsx:29-33`); `StatCard` = 11 px label → 18 px value
  (`StatCard.tsx:25-30`); `DataTable` = 11 px header → 12 px cell (`DataTable.tsx:141,202`).

**One-tier label→value separation is the house rhythm.** It is consistent across all three primitives.

---

## 4. GATE 21 — Colour tokens, hex, semantic role, and measured contrast

All ratios measured against the two real backdrops.

| Token | Hex | Semantic role (as enforced in code) | vs `canvas` | vs `panel` | Sites |
|---|---|---|---|---|---|
| `textPrimary` | `#ededed` | values, titles | 17.41 | 16.91 | 696 |
| `textSecondary` | `#a3a3a3` | labels, table headers | 8.08 | 7.85 | 557 |
| `textMuted` | `#7d7d7d` | axis ticks, hints, sub-lines | **4.95** | **4.81** | 983 |
| `bull` | `#30D158` | **up / support / call side** | 10.08 | 9.79 | 263 |
| `bear` | `#FF3B30` | **down / resistance / put side** | 5.75 | 5.58 | 304 |
| `warn` | `#FF9500` | caution, degraded, held | 9.27 | 9.00 | 141 |
| `select` | `#E4E8F4` | **selection & process state — interface only** | 16.64 | 16.17 | 291 |
| `flip` | `#7DD3FC` | gamma flip / `info` tone | 12.22 | 11.87 | 46 |
| `king` | `#EA00FF` | **exceptional / TOP PICK / peak strike** | 5.77 | 5.60 | 39 |
| `darkpool` | `#2dd4bf` | institutional off-exchange prints | 10.95 | 10.64 | 11 |
| `shortGamma` | `#E0B84E` | dealer SHORT gamma (amplifying) | 10.81 | 10.50 | 14 |
| `longGamma` | `#5EA0EF` | dealer LONG gamma (absorbing) | 7.52 | 7.31 | 7 |
| `rowHover` | `rgba(255,255,255,.055)` | one hover tint for every subtle surface | — | **1.109** | 86 |

**Every text token clears WCAG AA (4.5:1) on both backdrops.** `textMuted` at 4.81 is the floor and it is
carried by 983 sites at 10–11 px — the `#6b6b6b → #7d7d7d` lift documented in `tailwind.config.ts:46-49` is
real and load-bearing.

### Rendered colour census — the whole app paints 14 text colours

| Rendered | count | token |
|---|---|---|
| `rgb(163,163,163)` | 674 | `textSecondary` |
| `rgb(125,125,125)` | 617 | `textMuted` |
| `rgb(237,237,237)` | 576 | `textPrimary` |
| `rgb(48,209,88)` | 140 | `bull` |
| `rgb(255,59,48)` | 136 | `bear` |
| `rgb(228,232,244)` | 37 | `select` |
| `rgb(42,42,42)` | 36 | `borderMuted` as ink — decorative `·` separators, `aria-hidden` (`TerminalIndex.tsx:65`) |
| `rgb(255,149,0)` | 28 | `warn` |
| `rgb(94,160,239)` | 24 | `longGamma` |
| `rgb(224,184,78)` | 16 | `shortGamma` |
| `rgb(10,10,10)` | 9 | `ink` on light chrome |
| `rgb(234,0,255)` | 1 | `king` |
| `rgb(125,211,252)` | 1 | `flip` |

Three greys carry **80 %** of all rendered text. This restraint is the single most distinctive
measurable property of the terminal.

### The holographic silver system

`index.css:29-120`. One gradient, two runs, five classes.

```
--holo-gradient:        #aeb9cf → #eef1f8 → #a8c4e8 → #d6c6ee → #f7f8fc → #b2c8e2 → #e2d4ee → #aeb9cf  (115deg)
--holo-gradient-bright: #cfd6e4 → #f4f6fb → #c2d6f0 → #e4d8f4 → #ffffff → #c8d8ec → #ecdff6 → #cfd6e4
```

| Class | Recipe | Sites |
|---|---|---|
| `.holo-bg` | bright run, `250% 250%`, `holo-pan 4.5s ease-in-out infinite alternate` | 14 |
| `.holo-text` | base run, background-clip:text | 6 |
| `.holo-bar` | base run, `350% 350%`, 3.5 s | 3 |
| `.holo-glow` | `holo-glow-shift 5s` box-shadow breathe | 3 |
| `.holo-border` | base run on border-box | **0** |
| `.data-bar` | **flat `rgba(237,237,237,.45)` — NOT holo** | 20 |

**Verified claim:** every `--holo-gradient-bright` stop clears 7:1 against `ink #0a0a0a`
(measured 13.36 – 19.80). Dark text on the holo pill is safe at every point of the pan.

**`.data-bar` is the most important design decision in the file.** `index.css:84-88` records why:
holo-silver is selection language, so score and probability bars were converted to a flat 45 % white fill —
*"a strong score wore the same treatment as the active nav tab."* Measured: the `.data-bar` fill reads
**4.01:1** against its `white/[0.06]` track. Magnitude reads from length, tone lives in the number beside it.
**This rule already encodes exactly the house rule this audit is asked to enforce.**

### Selection rails

`index.css:202-214`, five tones, one shape (`inset 2px 0 0 0`):
`rail-select` `rgba(228,232,244,.7)` (2) · `rail-silver` `rgba(199,211,232,.7)` (1) ·
`rail-neutral` `rgba(237,237,237,.6)` (2) · `rail-king` `rgba(234,0,255,.75)` (2) ·
`rail-warn` `rgba(255,149,0,.5)` (1). `.inst-selected` = `rail-select` + `bg select@5 %`, **10 sites**;
measured selected-row background `rgb(20.9,21.1,21.7)`, **1.085:1** over panel.

---

## 5. GATE 22 — Radius

`tailwind.config.ts` declares **no** `borderRadius` extension — the Tailwind default scale is used
deliberately.

Static census: `rounded-md` (6 px) **224** · `rounded-full` **174** · `rounded` (4 px) **136** ·
`rounded-lg` (8 px) **33** · `rounded-sm` (2 px) **29** · `rounded-xl` 1 · directional 3.

Rendered census (six desks): `4px` **284** · `6px` **166** · `9999px` **144** · `2px` **52** ·
`8px` **22** · `3px` **2**.

### Every arbitrary radius in the codebase — 12 sites, 4 values

| Value | Sites |
|---|---|
| `rounded-[3px]` | `ui/SpotRule.tsx:15` · `ui/TickerTag.tsx:35` · `pages/gex/GreeksRegime.tsx:412` · `pages/flowdesk/PrintSessionChart.tsx:213` · `gex/vannacharm/MigrationMap.tsx:112` · `gex/PositioningMap.tsx:699` |
| `rounded-[5px]` | `ui/SubNav.tsx:24`, `:27`, `:36` |
| `rounded-[1px]` | `pages/proveit/MonteCarloPanel.tsx:178`, `:179` |
| `rounded-t-[2px]` | `pages/proveit/MonteCarloPanel.tsx:189` |

`rounded-[3px]` is **not** noise: all six sites are the same idiom — the inverted axis price pill
(TradingView convention: light fill, `text-ink`, `px-1.5 py-px`, 10 px bold mono). It is an unnamed token.
`rounded-[5px]` is the SubNav pill, one component, three lines. `rounded-[1px]` is two legend swatches
in one file that should be `rounded-sm`.

**Note for the redesign:** `DESIGN.md:244` and `:350` claim `rounded-[2px]` legend swatches. **That value does not
exist in the codebase** — `ChartLegend.tsx:26` uses `rounded-sm`. Doc drift.

---

## 6. GATE 23 — Spacing rhythm

The rhythm is a **4 px base with a heavily-used 2 px half-step** (Tailwind `.5` units).

| gap | count | | padding | count | | px | count | | py | count |
|---|---|---|---|---|---|---|---|---|---|---|
| `gap-2` (8) | 353 | | `p-3` (12) | 31 | | `px-3` | 138 | | `py-1.5` (6) | 129 |
| `gap-1.5` (6) | 278 | | `p-2.5` (10) | 26 | | `px-2` | 131 | | `py-2` | 96 |
| `gap-3` (12) | 211 | | `p-4` (16) | 19 | | `px-2.5` | 75 | | `py-1` | 94 |
| `gap-4` (16) | 88 | | `p-2` | 17 | | `px-4` | 66 | | `py-2.5` | 68 |
| `gap-1` (4) | 83 | | `p-1.5` | 11 | | `px-3.5` | 32 | | `py-3` | 41 |
| `gap-2.5` (10) | 54 | | | | | `px-6` | 22 | | `py-0.5` | 32 |
| `gap-0.5` (2) | 33 | | | | | | | | `py-3.5` | 12 |

The dominant chip/row is `px-2.5 py-1.5` or `px-3 py-2`; the dominant panel body is `p-4`
(`Panel.tsx:94`); the dominant inter-element gap is 6–8 px.

**Arbitrary spacing: 26 sites, 8 values** — `py-[5px]` (11), `gap-[3px]` (6), `space-y-[3px]` (2),
`py-[3px]` (2), `py-[2px]` (2), `py-[7px]` (1), `pt-[18vh]` (1), `pl-[3.25rem]` (1). All are sub-4 px
optical corrections in dense rows; none is a layout decision.

Fixed structural dimensions worth preserving: Panel header **`h-10` / 40 px** with `px-3.5`
(`Panel.tsx:102`); `MetricGrid` `gap-3` with `flex: 1 1 min(min, 45%)` (`MetricGrid.tsx:41`);
`EmptyState` `py-4 / py-8 / py-12` (`EmptyState.tsx:20-24`).

---

## 7. GATE 24 — Motion

### The tokens

`src/lib/motion.ts` — **one easing curve, six durations, one spring.**

```
EASE = [0.16, 1, 0.3, 1]                       // easeOutExpo family
DUR  = { fast .12 · quick .16 · base .20 · slow .30 · reflow .35 · data .70 }   // seconds
PILL = { type: 'spring', stiffness: 400, damping: 32 }
```

`tailwind.config.ts:10-15` pushes the same hand into CSS: `transitionTimingFunction.DEFAULT` =
`cubic-bezier(0.16,1,0.3,1)` and `transitionDuration.DEFAULT` = `120ms`, so a bare `transition-colors`
inherits the house curve.

**Measured, live on `/compass`: exactly one transition recipe exists on the page.**
```
281 elements — "color, background-color, border-color, text-decoration-color, fill, stroke"
             | 0.12s | cubic-bezier(0.16, 1, 0.3, 1)
```
**Zero `duration-*` Tailwind utilities and zero raw `duration:` seconds in the codebase.** Every
framer-motion consumer imports `DUR` (40 uses: `base` 11, `slow` 10, `data` 7, `quick` 6, `fast` 4,
`reflow` 2). `EASE` in 25 files, `PILL` at 18 sites. framer-motion imported by 33 files.

Static transition census: `transition-colors` 216 · bare `transition` 53 · `transition-transform` 16 ·
`transition-opacity` 4 · `transition-all` **1**.

### Keyframe animations

| Animation | Duration / timing | Purpose | Sites |
|---|---|---|---|
| `holo-pan` | 4.5 s ease-in-out alternate (3.5 s for `.holo-bar`) | the living-foil sheen | 26 (`.holo-bg`/`-text`/`-bar`) |
| `holo-glow-shift` | 5 s ease-in-out alternate | breathing halo | 3 |
| `pulse-animation` | 1.5 s infinite, `scale(.95→1.05)` + opacity | live-tick dot | `custom-pulse` 3 static + `SignalBadge pulse` |
| `skeleton-sweep` | 1.6 s ease-in-out infinite | loading sheen | 2 |
| `cursor-blink` | 1.1 s `steps(1)` infinite | terminal caret (hard on/off — no easing) | 4 |
| `slide-in` | 0.25 s house curve | list entry | 13 |
| `view-in` | 0.28 s house curve | route/section swap | 5 |
| `soft-in` | 0.20 s house curve | same-panel data swap | 7 |
| `tick-up` / `tick-down` | 0.55 s ease-out, **tint only** | number changed up/down | 1 each (+ `AnimatedNumber`) |
| `marquee` | 46 s linear | landing divider | landing only |
| `rain-up`/`down`/`twinkle` | per-column inline | landing code-rain | landing only |

`AnimatedNumber.tsx` — spring `{stiffness: 260, damping: 32}`, **jumps rather than rolls when the character
count changes** so neighbours never shift, and flashes a background tint (never a colour override) so it
cannot fight the value's own sign colour.

### Reduced motion

`index.css:415-437` disables all 8 house animations **plus** `.animate-pulse` / `.animate-bounce` /
rain classes with `!important`. `<MotionConfig reducedMotion="user">` covers framer-motion.
`.holo-*` degrade to flat silver (`index.css:116-120`). **Coverage is complete.**

### Measured animation load at rest

| Route | infinite animations running |
|---|---|
| `/pulse` | 3 (`holo-pan` ×2, `cursor-blink` ×1) |
| `/tracker` | 4 |
| `/compass` (cards) | 20 (`pulse-animation` ×16, of which 4 in viewport) |
| **`/compass` (Table view)** | **79 — `pulse-animation` ×76** |

See §10, finding **VD-04**.

---

## 8. GATE 8 — Interaction states

### Hover — one tint, one text lift, one border lift

| Treatment | Sites | Value |
|---|---|---|
| `hover:text-textPrimary` | 126 | `#a3a3a3`/`#7d7d7d` → `#ededed` |
| `hover:bg-rowHover` | 86 | `rgba(255,255,255,0.055)` |
| `hover:border-borderMuted` | 52 | `#1c1c1c` → `#2a2a2a` |
| `hover:decoration-white/80` | 19 | links |
| `hover:text-select` | 6 | |
| `hover:scale-[1.02\|1.03]` | 3 | |
| `hover:brightness-125` | 2 | |

Measured live on a `DataTable` row (`/compass` → Table): rest `rgba(0,0,0,0)` → hover
`rgba(255,255,255,0.055)`, i.e. `rgb(10,10,10)` → `rgb(23.5,23.5,23.5)`. **Contrast delta 1.109:1.**

### Focus — one ring, globally and per-component

Global (`index.css:16-19`): `:focus-visible { outline: 1px solid rgba(228,232,244,.6); outline-offset: 1px }`
Component echo: `focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset
focus-visible:ring-select/60` — **60 sites**, stated once in `ui/interactiveRow.ts:12`.

Measured on `/compass`, tabbing 12 stops: every stop (TH, TR, Term span) rendered
`box-shadow: rgba(228,232,244,0.6) 0 0 0 1px inset`. Composited that ring measures **6.14:1** against panel —
comfortably over the 3:1 non-text minimum. Rows are keyboard-reachable and Enter-activatable
(`DataTable.tsx:179-188`).

### Active

`active:scale-[0.98]` (9) · `active:scale-[0.97]` (1) · `active:scale-[0.9]` (1) ·
`active:cursor-grabbing` (2). Nothing else.

### Selected — the strongest state in the system

`.inst-selected` (10 sites) = 2 px silver inset rail + 5 % select wash.
Selection travels as **`aria-current`, never `aria-selected`** — the rule and its rationale are written once
in `ui/interactiveRow.ts:44-51` (*"143 of them across four desks before this changed"*).
The sliding pill (`layoutId` + `PILL` spring) is used for `SegmentedControl`, `SubNav`, top nav and the
Compass scanner tabs — five previously-divergent physics unified in `motion.ts:39-49`.

**The selection language is complete and unambiguous: silver rail + silver wash + silver ring + silver pill.**

---

## 9. Chart styling conventions

### Ink (`src/components/gex/palette.ts` — single source for JS-API consumers)

| Constant | Hex | Marks |
|---|---|---|
| `CALL_WALL` / `BULL` | `#30D158` | call wall / up |
| `PUT_WALL` / `BEAR` | `#FF3B30` | put wall / down |
| `FLIP` | `#7DD3FC` | gamma flip (dashed) |
| `KING` | `#EA00FF` | peak-exposure strike |
| `DARK_POOL` | `#2dd4bf` | institutional prints (dashed) |
| `SPOT` | `#ededed` | where the market is |
| `FOCUS` | `#E4E8F4` | what the user clicked (dashed, width 2) |
| `MUTED_INK` | `#7d7d7d` | axis ticks, reference labels |
| `SHORT_GAMMA` / `LONG_GAMMA` | `#E0B84E` / `#5EA0EF` | dealer gamma sign — gold/blue, deliberately **not** green/red |
| `CHARM_POS` / `CHARM_NEG` | `#7DD3FC` / `#EA00FF` | charm gets its own axis so it can't be read as gamma sign |

### Chrome (identical across all three lightweight-charts mounts)

`StrikeChart.tsx:169-183`, `SwingMapChart.tsx:94-108`, `LiquidityHeatmapChart.tsx:201-217`:
```
background: transparent · textColor: #7d7d7d
gridLines:  rgba(255,255,255,0.03) both axes
crosshair:  rgba(255,255,255,0.3), labelBackgroundColor #262626
```
`#262626` is the one off-token value here, repeated identically at 6 sites — an unnamed token, not drift.

### `ChartLegend` — five swatch kinds, one component

`square` `w-2.5 h-2 rounded-sm` · `line` `w-3 h-0.5 rounded-full` · `dot` `w-1 h-1` ·
`dashed` `border-t border-dashed` · `gradient` `w-4 h-2`. Two label grammars: `line` →
sentence-case `textSecondary`; `square` → uppercase-tracked `textMuted`.

### `HoverReadout` — every plottable surface answers at the cursor

Portaled to `<body>`, `pointer-events-none`, +14 px off the cursor, **measures itself and flips side**
rather than sliding back under the pointer. `border-borderMuted bg-panelRaised px-3 py-2 rounded-md
shadow-overlay max-w-[320px]`.

### `SpotRule` — the price-tag idiom

Gradient hairline → mono ticker → **inverted pill** (`bg-textPrimary`, `text-ink`, `rounded-[3px]`,
10 px bold `tnum`). Repeated at 6 sites as the universal "a value on an axis" mark.

---

## 10. Verdict — what is DISTINCTIVE and must be preserved

Each item below is distinctive because it is **measurably rare**, not because it is liked.

| # | Trait | The measurement that makes it distinctive |
|---|---|---|
| **D1** | **Mono-first, not mono-accented** | 2104 / 2295 rendered text nodes (91.7 %) are JetBrains Mono. A generic dashboard is sans-first with a mono accent. |
| **D2** | **10–12 px is the body size** | 96.7 % of all rendered text. The label tier *is* the interface. Any redesign that "improves readability" by moving the base to 14 px destroys the density this app trades on. |
| **D3** | **Three greys carry 80 % of the ink** | 14 distinct rendered text colours over six desks. Colour is spent on data, not chrome. |
| **D4** | **Border-led elevation, zero ambient shadow** | Surface steps 1.012–1.029:1; `shadow-overlay` never painted at rest; nothing thicker than 1 px. Generic dark UIs stack `shadow-lg` on every card. |
| **D5** | **The machined bevel** (`.inst-surface`) | `border-top #333` + `inset 0 1px 0 rgba(255,255,255,.03)` + a 2.5 % top wash. 92 call sites. Light comes from above; a card is a milled plate, not an outline. |
| **D6** | **One motion hand** | 281 elements, one recipe, `0.12s cubic-bezier(0.16,1,0.3,1)`. Zero `duration-*` utilities. Zero raw seconds. Six-rung named ladder. |
| **D7** | **Holo-silver as *selection*, never as data** | `.data-bar` (`index.css:84-88`) exists specifically to keep gradients out of score bars. The rule is stronger than most design systems manage. |
| **D8** | **`.rail-*` + `aria-current` selection grammar** | 2 px inset rail, five tones, one shape — and the a11y contract stated once in `interactiveRow.ts`. |
| **D9** | **Terminal signatures** | `cursor-blink` at `steps(1)` (real cursors don't fade); the `SpotRule` inverted price pill; `tnum` at 629 sites; the `> slayer_terminal` lockup in `.holo-text`. |
| **D10** | **Gold/blue dealer-gamma axis** | A structural dimension deliberately kept out of green/red so a positioning map can never be misread as a P&L map. `palette.ts:31-43`. |
| **D11** | **`Term` in-place jargon explainers** | Dotted-underline `decoration-textMuted/60`, keyboard-focusable, portaled card. Prevents the glossary trip a dense terminal otherwise forces. |

### What is genuinely generic and carries no identity cost if changed

| # | Trait | Evidence |
|---|---|---|
| G1 | The tone→`toneText`/`toneDot`/`toneBadge`/`toneBar` map shape | `tones.ts` is a standard four-map pattern; only the *values* are Slayer. |
| G2 | `SignalBadge` geometry — `rounded border px-1.5 py-0.5`, bg `/10`, border `/20` | The universal dark-UI pill. |
| G3 | `rounded-md` as the panel radius | 224 sites of Tailwind's default 6 px. Nothing house about it. |
| G4 | `EmptyState` centred-icon-chip-over-title layout | `EmptyState.tsx:32-45` is the shadcn/Linear shape. |
| G5 | `SegmentedControl` `bg-white/[0.12]` sliding pill | Standard iOS/Linear segmented control. Only the `PILL` spring is house. |
| G6 | Tailwind default radius scale generally | `tailwind.config.ts` extends no `borderRadius` at all. |
| G7 | `skeleton-sweep` shimmer | The default loading idiom everywhere. |
| G8 | `.glass` nav (`blur(20px) saturate(180%)`) | Explicitly described in-file as "iOS-26 feel". The most fashion-dependent thing in the system. |

---

## 11. Tone-rule violations — measured

House rule as this audit defines it: **green = positive market direction, red = negative, amber = warning,
silver/select = selection & process, magenta = exceptional, grey = neutral. Model quality, selection and
confidence are never green.**

The codebase already states this rule verbatim in `src/components/compass/setupState.ts:67-72`:

> *"Green & red are the market's own language (call/put, bull/bear, a price that moved), so nothing that is
> merely a PROCESS may borrow them — not this lifecycle, not a verdict (see ./verdict.ts), not a status
> pill. … A verdict that renders green is this rule being broken."*

Compass obeys it perfectly — `VERDICT_TONE` is `{ENTER: select, EXIT: neutral, WATCH: warn}`
(`verdict.ts:16-20`), `STATE_META` is `{WAITING: neutral, ARMED: select, TRIGGERED: select, INVALIDATED:
neutral}` (`setupState.ts:73-78`), `Freshness` is `{live: select, sweep: neutral, held: warn}`
(`Freshness.tsx:33-52`), and the hero score renders `textPrimary` (`dna_compass_table.png` — score 94, white).

**Everything outside Compass follows the opposite rule**, because `docs/DESIGN.md:82` defines
`bull` as "Up / support / **success**".

| ID | Site | What renders green/red | Why it violates |
|---|---|---|---|
| **T1** | `tracker/EdgeLedger.tsx:255` | **Win rate `52%` in bull green** (`profitFactor ≥ 1.3`) — visible in `shots2_tracker.png` | Win rate is model track-record quality. Not a market direction. |
| **T2** | `tracker/EdgeLedger.tsx:261`, `:267` | **Strategy *names*** `Discounted Puts` (green) / `Gamma Squeeze` (red) | A strategy label is a string, not a direction. Green on the word "Puts" is actively contradictory. |
| **T3** | `tracker/EdgeLedger.tsx:273` | `Decay flags` renders **green when the count is 0** | Absence-of-a-warning is a health state. |
| **T4** | `tracker/EdgeLedger.tsx:375` | Empty-state `Target` icon `text-bull` | Decorative green on an empty state. |
| **T5** | `compass/ContractChain.tsx:37` | `healthText: h ≥ 56 → text-bull, h < 45 → text-bear`, applied to **both** the Calls and Puts columns (`:76`) | Health is moneyness (`SetupCompare.tsx:246-249`: *"50 is at the money · higher is deeper in the money"*). A green health on a **put** means the underlying **fell** — the same hue means opposite directions in two adjacent columns whose own headers are green (`:138`) and red (`:139`). |
| **T6** | `compass/ContractChain.tsx:24-28` | `momentumText: STRENGTHENING → text-bull` | Momentum strength is a process/quality read, not a signed price move. |
| **T7** | `ui/Toast.tsx:40` | `success` toast = `border-bull/40 text-bull` | A save-succeeded confirmation is the canonical "process state" the Compass rule forbids. |
| **T8** | `news/NewsIntel.tsx:29` | `agreeTone.CONFIRMS → 'bull'` | Agreement between two models is confidence, not direction. |
| **T9** | `news/NewsIntel.tsx:39` | `pricedInTone: pct < 42 → 'bull'` | "How much is already priced in" is a model estimate. Low ≠ bullish. |
| **T10** | `fracture/Fracture.tsx:22`, `:245` | `ABSORBED → 'bull'`, `criticality STABLE → 'bull'` | System-stability regime. Amber/grey/silver language, not direction. |
| **T11** | `earnings/EarningsIntel.tsx:29` | `richTone: r ≤ 0.85 → 'bull'` | Vol richness is a pricing-quality read. |
| **T12** | `gex/candleTheme.ts:20-27` + `:59` | `CANDLE_THEME_KEY = 'slayer'` → **up `#DCE3F5` / wickUp `#F1F4FF`** — the holo-silver family | Three files state silver is selection-only, never direction (`tailwind.config.ts:69-70`, `palette.ts:8`, `tones.ts:9-11`). The **default price chart on `/pulse` and `/pinpoint/gex` paints direction in the selection colour** (`shots2_pulse.png`). Measured up-vs-down separation is only **2.42:1**. |

**Defensible and NOT counted as violations** (recording them so the redesign does not "fix" them):

- Call = green / Put = red as an **instrument-class** mark (`SetupScanCard.tsx:51`, `ContractChain.tsx:138-139`,
  `TapeRowDrawer.tsx:68`). A call is a long-the-underlying instrument; this is directional.
- Realised P&L in `EdgeLedger` (`rTone`, `exitPct`, `rMultiple`, MFE/MAE) — money made/lost is direction.
- `SetupCompare.tsx:278,284` premium-target bars in green — the file states the reason explicitly
  (*"Green because this is money made, which is the one thing bull ink is for"*). **However**, on a put
  setup the same card carries a red ticker pill (put) two rows above green `+38 %` bars
  (`shots2_compass.png`, SYK 335P) — one card, both hues, two different semantics. That is a comprehension
  cost, logged as **VD-08** below rather than as a tone violation.

---

## 12. Off-token colour — every site

### Arbitrary Tailwind colour utilities: **2 in 174 `.tsx` files**

```
src/components/three/DealerSurface3D.tsx:178   text-[#30d158]   ← duplicates token `bull`
src/components/three/DealerSurface3D.tsx:180   text-[#ff3b30]   ← duplicates token `bear`
```
Zero `bg-[#…]`, `border-[#…]`, `fill-[#…]`, `ring-[#…]`, or `-[rgba(…)]` anywhere.

### Raw hex string literals off the token set — 44 sites, 9 files

| File:line | Value | Assessment |
|---|---|---|
| `gex/candleTheme.ts:21-24` | `#DCE3F5 #A47CF2 #F1F4FF #C0A2FF` | **active default theme** — see T12 |
| `gex/candleTheme.ts:30-33, 48-51` | `#eef1f5 #565c68 #6fae94 #c47484` | inactive alternates; dead unless `CANDLE_THEME_KEY` changes |
| `gex/StrikeChart.tsx:182-183`, `swing/SwingMapChart.tsx:107-108`, `flowdesk/LiquidityHeatmapChart.tsx:216-217` | `#262626` ×6 | crosshair label pad — identical at every site; **an unnamed token, not drift** |
| `flowdesk/PulseFlowTape.tsx:45` | `#E8963C` | **28 elements painted on `/pulse`.** A second amber that is neither `warn #FF9500` nor `shortGamma #E0B84E`. Real drift. |
| `flowdesk/flowPillsPrimitive.ts:111` | `#8ff0b4` / `#ff9a90` | pastel call/put — forks `bull`/`bear` |
| `flowdesk/LiquidityHeatmapChart.tsx:513` | `#9aa0aa` | forks `textSecondary`/`silver` |
| `pages/flowdesk/ContractFlowChart.tsx:32,140,211` | `#8b8f96`, `#555` ×2 | disabled-legend grey; should be `textMuted` |
| `gex/heatmap.ts:344`, `gex/StatePriceDensity.tsx:75` | `#8f8f8f` ×2 | between `textSecondary` and `textMuted` |
| `three/DealerSurface3D.tsx:96,100,110,116,122,147,149,105` | `#0a0e14 #2b3947 #151b22 #cfe0ff #0a0d12 #8ab4ff #ffffff` | 3D scene lighting/grid — outside the 2D token system by nature |
| `pages/landing/CodeRain.tsx:28-31,154`, `landing/HeroScene.tsx:16` | `#6A93B5 #C79350 #6B7177 #454E58 #08090A` | landing hero art — a deliberate separate palette |
| `pages/fracture/Fracture.tsx:78,79,81` | `#7fe7c4 #a1a1aa #3f3f46` | flow-attribution categoricals with no token |
| `pages/gex/GreeksRegime.tsx:86,132,133`, `gex/vannacharm/WallDrift.tsx:303`, `pages/gex/GexHistory.tsx:130` | `#fff` @ 0.12–0.28 | SVG zero/hover rules — consistent idiom, no token exists |
| `compass/ContractTrack.tsx:460` | `#000` | marker stroke |

**Summary:** the class-level token system is effectively airtight. All real drift lives in **SVG/canvas/
JS-API consumers that cannot reach a Tailwind class**. The single clearest offender is
`PulseFlowTape.tsx:45`'s `#E8963C`.

---

## 13. Spec drift — the documents disagree with the shipped code

| Doc claim | Shipped reality |
|---|---|
| `docs/DESIGN.md:294-295` — DataTable "row hover `bg-white/[0.02]`" | `DataTable.tsx:196` → `hover:bg-rowHover` = **`rgba(255,255,255,0.055)`**, measured live |
| `design-system/data-table.html:61` — `tbody tr:hover { background: rgba(255,255,255,0.02) }` | same as above; specimen is from **Jul 25**, `tailwind.config.ts` from **Jul 30** |
| `docs/DESIGN.md:244`, `:350` — "`rounded-[2px]` legend swatches" | no `rounded-[2px]` exists; `ChartLegend.tsx:26` uses `rounded-sm` |
| `docs/DESIGN.md:121`, `:129` — `.holo-border` listed as a live primitive | **0 call sites** |
| `docs/DESIGN.md:47, 60` — `panelHover`, `borderFocus` documented as tokens | **0 call sites each** |
| `design-system/colors.html` | omits `shortGamma #E0B84E` and `longGamma #5EA0EF`, which are live tokens (21 sites) |
| `docs/DESIGN.md:99` — `bull` = "Up / support / **success**" | contradicts `setupState.ts:67-72`, the stricter rule Compass actually enforces |

---

## 14. Findings

| ID | Sev | Gate | Title |
|---|---|---|---|
| VD-01 | P1 | 21 | Two contradictory canonical tone rules; the loose one puts model quality in bull green on `/tracker` |
| VD-02 | P1 | 21 | Default candle theme paints price direction in the selection colour (silver) |
| VD-03 | P1 | 21 | `healthText` renders moneyness green/red on both the call and put columns of one chain |
| VD-04 | P1 | 24 | 76 concurrent infinite pulse animations on the Compass table view |
| VD-05 | P1 | 8 | Row hover is a 1.109:1 change — the primary row affordance is near-imperceptible |
| VD-06 | P2 | 20 | `/pulse` renders no text above 13 px; 97.2 % of it is 10–11 px |
| VD-07 | P2 | 18 | Surface elevation is non-functional as luminance (1.012–1.029:1) |
| VD-08 | P2 | 21 | One Compass card carries green and red with two different semantics |
| VD-09 | P2 | 21 | `#E8963C` — a third amber, painted 28× on `/pulse`, outside the token system |
| VD-10 | P3 | 18 | 8 of 29 colour tokens and 2 documented surface classes are dead |
| VD-11 | P3 | 21 | Two arbitrary hex utilities duplicate existing tokens (`DealerSurface3D`) |
| VD-12 | P3 | 22 | `rounded-[3px]` is an unnamed 6-site token; `rounded-[1px]` should be `rounded-sm` |
| VD-13 | P3 | 19 | Design docs and specimens contradict shipped values (row hover, radii, dead primitives) |

---

## 15. What I could NOT audit

- **`/pinpoint/gex`, `/pinpoint/flow` and `/terminal` returned byte-identical style censuses** (105 text
  nodes, same distribution). Either both `/pinpoint/*` routes fell back to the terminal index in my run, or
  their desks had not mounted inside the 2.5 s settle. **Their visual DNA is therefore unmeasured**; the
  numbers I attribute to them in §3 are the terminal index's. Everything I state about `/compass`,
  `/pulse` and `/tracker` was measured on those desks.
- **Landing, Trailer, Guide, Legal, Community, Prove-It, Fracture, Earnings, Swing, Dark Pool and the
  Vanna/Charm & Vol-Lab sub-desks were not opened.** Their token usage is covered by the static census
  only. `Fracture.tsx` and `CodeRain.tsx` off-token colours (§12) are grep evidence, not screenshots.
- **Mobile and tablet viewports were not measured.** Everything here is 1440×900 desktop. `Panel.tsx:119-126`
  and `SetupCompare.tsx:270-273` both encode phone-specific type/track behaviour that I did not verify.
- **`prefers-reduced-motion` was not exercised in the browser.** The `index.css:415-437` coverage is read
  from source; I did not confirm that all 8 animations actually stop.
- **The gold liquidity LUT (`src/data/liquidityField.ts`)** is documented in `DESIGN.md` §3 "gold liquidity LUT" but I did
  not read or verify the 256-entry ramp, and no heatmap rendered its cursor read-out in my captures.
- **Colour-blind simulation was not run.** The `tones.ts:4` claim that "a tone is never the only signal"
  is stated in source and holds in the badges I inspected, but I did not verify it exhaustively across
  all 263 `bull` / 304 `bear` sites.
- **No hover read-out card was captured.** `HoverReadout` styling is read from source; I did not trigger a
  chart hover to confirm the rendered card.
- **Font swap behaviour is unmeasured** — I aborted `fonts.g*` in every run, so every measurement above
  reflects the **fallback** stack metrics, not Inter/JetBrains Mono as served. Sizes and colours are
  unaffected; measured letter-spacing and any wrapping observation may differ in production.
