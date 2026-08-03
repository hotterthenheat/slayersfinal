# 09 — Performance, Charts, Tables (Gates 39, 40, 41)

Runtime metrics under live ticking · bundle · leaks · chart inventory · table inventory.

**Method.** Production build already served at `http://127.0.0.1:8123` (not rebuilt, not restarted).
Playwright + Chromium 1194 at 1440×900 and 390×844, Google Fonts aborted, `slayer_onboarded_v1`
pre-set. Every number below was measured in the running app. Scratch drivers live in
`/tmp/claude-0/-home-user-slayersfinal/61510a72-f878-56b9-9620-dab6cb6adbf2/scratchpad/g39/`
(`perf.mjs`, `shift-probe.mjs`, `compass-probe.mjs`, `compass2.mjs`, `chart-sweep.mjs`,
`tnum.mjs`, `tnum2.mjs`, `bundle.mjs`, `leak.mjs`, `leak2.mjs`, `leak3.mjs`, `leak4.mjs`,
`raf.mjs`, `misc.mjs`, `mobcharts.mjs`), with raw JSON beside each.

The app's data source is `src/context/MarketDataContext.tsx:39` — one global
`setInterval(processTick, 1500)`. Every "live ticking" measurement below is 15–30 s of that
loop running with **zero user interaction**, so nothing here is `hadRecentInput`-excluded.

---

## Headline

Three of the six measured routes are clean. Two are not, and they fail the same way: **the app
moves content out from under the reader on a market tick.**

`/trace/live-tape` accumulates **CLS 0.536 in 15 s** of ticking and **1.061 in 30 s** — 4× the
"poor" threshold, and it never stops accruing because it is one shift per print, forever. `/compass`
teleports a setup card **393 px horizontally and 238 px vertically** into a different grid cell when
the scan re-ranks. Neither is a paint-time problem: LCP is 616–1096 ms everywhere and the
load-time CLS on both is under 0.09.

The second theme is that **nothing is code-split and nothing is compressed**. `/legal/terms` and
`/guide/faq` each download **1,646 kB** — the same byte-for-byte payload as `/pulse` — because
Vite's default chunking put all 65 route entries plus `lightweight-charts` and `react-grid-layout`
into one `index.js`, and `server.ts` uses bare `express.static` with no `compression()`, so it ships
**uncompressed** (`Content-Encoding` absent; 1,614,393 B on the wire where gzip -9 gives 478,409 B).

Memory is clean: 5 real navigation cycles leave live intervals pinned at 3, ResizeObservers at 29,
DOM at 1775 and rAF callback rate flat.

Charts and tables are, with a short list of exceptions, genuinely well built — the aria coverage,
tabular figures and sticky-header discipline are already there. The exceptions are named below.

---

# GATE 39 — Performance

## 39.1 Core metrics, 6 routes, 1440×900

`perf.mjs` — PerformanceObserver on `largest-contentful-paint`, `layout-shift` and `longtask`.
CLS is split at the 3 s mark: everything after it is pure live-tick shift.

| Route | FCP | **LCP** | LCP element | **CLS load (0–3 s)** | **CLS live (3–18 s)** | CLS total | shift entries load/live | DOM | svg | canvas |
|---|---|---|---|---|---|---|---|---|---|---|
| `/pulse` | 748 | **748** | `SPAN.font-mono text-xl font-bold` | 0.0138 | **0.00001** | 0.0138 | 5 / 1 | 1775 | 55 | 15 |
| `/compass` | 688 | **688** | `P.text-caption text-textSecondary` | 0.0309 | **0.1768** | 0.2078 | 2 / 1 | 1565 | 66 | 0 |
| `/trace/live-tape` | 880 | **880** | `P.text-label …line-clamp-2` (tape read) | 0.0840 | **0.5358** | 0.6199 | 2 / 10 | 1266 | 38 | 0 |
| `/pinpoint/gamma` | 616 | **616** | `SPAN` | 0.0064 | **0.0000** | 0.0064 | 1 / 0 | 432 | 19 | 0 |
| `/prove-it` | 752 | **1096** | `P.text-caption text-textSecondary` | 0.0596 | **0.0000** | 0.0596 | 2 / 0 | 906 | 23 | 1 |
| `/stocks` | 824 | **824** | `P.mt-0.5 text-label` | 0.0000 | **0.0000** | 0.0000 | 0 / 0 | 9279 | 400 | 0 |

Confirmation run at 30 s (`compass2.mjs`): `/trace/live-tape` **CLS 1.0613 over 21 entries**,
`/compass` **0.1314 over 4 entries**, `/prove-it` **0.0596 over 2 entries**.

**LCP is not a problem anywhere** — 616–1096 ms on localhost, all text nodes, no image or font
blocking (fonts were aborted in the harness; see *Not audited*).

## 39.2 Long tasks > 50 ms

Every entry from `PerformanceObserver({type:'longtask'})`, `t` = ms from navigation start:

| Route | tasks | durations (ms @ t) |
|---|---|---|
| `/pulse` | 8 | 373@129 · 70@504 · **456@664** · 205@1121 · 132@1344 · 61@1487 · 63@11085 · 76@11177 |
| `/compass` | 3 | 395@144 · 135@685 · 79@11142 |
| `/trace/live-tape` | 3 | 417@178 · 72@597 · 123@670 |
| `/pinpoint/gamma` | 1 | 369@139 |
| `/prove-it` | 7 | **498@130** · 147@790 · 68@974 · 53@2205 · 63@3707 · 60@9705 · 56@11205 |
| `/stocks` | 3 | 321@109 · 134@432 · 206@566 |

The 321–498 ms task at t≈110–180 ms on **every** route is the single `index.js` parse + first
React render — it is the same task on `/pinpoint/gamma` (432 DOM nodes) as on `/stocks` (9279),
which is what identifies it as bundle evaluation rather than page work. `/pulse` adds a second
**456 ms** block at t=664 (grid layout + 15 canvases mounting).

Both `/pulse` and `/prove-it` also show 56–76 ms tasks at t≈9.7 s and t≈11.1 s — those are on the
tick loop, not on load.

## 39.3 Bundle

`dist/` contents, measured raw and `gzip -9`:

| Chunk | raw | gzip -9 | pulled by |
|---|---|---|---|
| `index-eO7KLxE9.js` | **1,614,393** | **478,409** | entry — every route |
| `index-qTGYiqDG.css` | 71,457 | 14,209 | entry — every route |
| `ProveIt-CSPR7xEA.js` | **1,022,049** | **271,768** | `App.tsx:45` `lazy(() => import('./pages/proveit/ProveIt'))` |
| `ContractFlowChart-DTjKqTEH.js` | 407,565 | 116,748 | `ScannerRowDrawer.tsx:11` — recharts, drawer-only |
| `tickers-Du-FEgmJ.js` | 310,600 | 71,664 | `TickerSearch.tsx:33` + `ContractWeigher.tsx:455` — `nasdaqTickers.json` (335,799 B) |
| `SlayerTrailer-B3keprSS.js` | 123,147 | 34,222 | `App.tsx:51` — `/trailer` only |

Library-marker probe over the chunks (`grep -c` on the minified output):
`WebGLRenderer` → 5 hits in `ProveIt`, 0 elsewhere. `recharts` → 16 in `ContractFlowChart`, 0
elsewhere. `lightweight-charts`/`createChart` → 1 in `index`, 0 elsewhere.
`react-grid-layout` → 2 in `index`.

**Per-route transfer, measured off `Content-Length` in the browser (`bundle.mjs`):**

| Route | bytes on wire | `Content-Encoding` | chunks | canvases with a live WebGL context |
|---|---|---|---|---|
| `/` | 1,646 kB | **none** | index.css, index.js | 0 / 7 |
| `/terminal` | 1,646 kB | **none** | index.css, index.js | 0 / 0 |
| **`/legal/terms`** | **1,646 kB** | **none** | index.css, index.js | 0 / 0 |
| **`/guide/faq`** | **1,646 kB** | **none** | index.css, index.js | 0 / 0 |
| `/pulse` | 1,646 kB | none | index.css, index.js | 0 / 15 |
| `/compass`, `/stocks`, `/news`, `/tracker`, `/trace/*`, `/pinpoint/*` | 1,646 kB | none | index.css, index.js | 0 / 0 |
| `/prove-it` | **2,644 kB** | none | + ProveIt.js | 0 / 1 |
| **`/prove-it?view=volatility`** | **2,644 kB** | none | + ProveIt.js | **0 / 0** |
| **`/prove-it?view=density`** | **2,644 kB** | none | + ProveIt.js | **0 / 0** |
| `/trailer` | 1,767 kB | none | + SlayerTrailer.js | 0 / 0 |

Three.js sizes for reference: `three/build/three.core.js` = 752,926 raw / **158,784 gzip**;
`three.module.js` = 573,935 / 109,516. The `ProveIt` chunk is 271,768 gzip total, so the 3D stack
is the majority of it.

`vite.config.ts` declares no `build.rollupOptions.output.manualChunks`; `server.ts` calls
`express.static` with no `compression()` middleware. Verified directly:

```
$ curl -sI -H 'Accept-Encoding: gzip, deflate, br' http://127.0.0.1:8123/assets/index-eO7KLxE9.js
HTTP/1.1 200 OK
Content-Type: text/javascript; charset=utf-8
Content-Length: 1614393          ← no Content-Encoding header
Cache-Control: public, max-age=0
```

## 39.4 Memory and leaks

Four runs, escalating in fidelity. `leak.mjs` and `leak2.mjs` used `history.pushState` +
`PopStateEvent` and **did not actually navigate** (`mid=/pulse` every cycle) — discarded.
`leak3.mjs` looked for `<a href="/stocks">` and found none (`/pulse` exposes only
`/terminal` and the three `/legal/*` links as anchors) — discarded. `leak4.mjs` and `raf.mjs`
navigate through the real command palette (⌘K → type → Enter) and were verified to land:
`PATHS VISITED: /stocks -> /pulse -> /stocks -> /pulse -> …` (10 transitions).

**`leak4.mjs` — `/pulse` → `/stocks` → `/pulse` × 5, heap read after forced
`HeapProfiler.collectGarbage`:**

| | heap after GC | live `setInterval` | live `ResizeObserver` | DOM nodes | canvases |
|---|---|---|---|---|---|
| baseline `/pulse` | 60.66 MB | **3** | **29** | 1775 | 15 |
| after cycle 1 | 62.58 MB | 3 | 29 | 1775 | 15 |
| after cycle 2 | 63.52 MB | 3 | 29 | 1775 | 15 |
| after cycle 3 | 64.17 MB | 3 | 29 | 1775 | 15 |
| after cycle 4 | 64.84 MB | 3 | 29 | 1775 | 15 |
| after cycle 5 | 64.86 MB | 3 | 29 | 1775 | 15 |

**`raf.mjs` — same cycle, plus rAF callbacks actually fired per second over a 6 s window:**

| | rAF/s | heap after GC | live intervals |
|---|---|---|---|
| baseline | 20.1 | 60.87 MB | 3 |
| after cycle 1 | 11.8 | 62.30 MB | 3 |
| after cycle 2 | 18.5 | 69.22 MB | 3 |
| after cycle 3 | 15.7 | 67.45 MB | 3 |
| after cycle 4 | 18.3 | 65.76 MB | 3 |
| after cycle 5 | 16.8 | 79.24 MB | 3 |

**No leak found.** Timers, observers, DOM nodes and canvases are all pinned across 5 real
navigation cycles. The rAF callback *rate* is flat (11.8–20.1/s, non-monotonic) — an earlier
"outstanding rAF" counter that appeared to grow 5→38 was an instrumentation artefact and is
retracted. Heap after forced GC drifts up 4.2 MB (leak4, decelerating: +1.92, +0.94, +0.65,
+0.67, +0.02) and 18 MB non-monotonically (raf.mjs: it *falls* at cycles 3 and 4). That is GC/JIT
noise plus warm module caches, not retention: nothing structural accumulates.

`performance.memory` is available (Chromium) and used above with
`--enable-precise-memory-info`.

---

# GATE 40 — Charts

## 40.1 Inventory

**26 distinct chart components**, mount sites from `grep -rl "from '.*<Name>'"`, live counts from
`chart-sweep.mjs` at 1440×900. `A` = `role="img"` (or a labelled `role=group`/`application`
wrapper) **and** an `aria-label`. `Ax` = axis tick labels or an explicit axis caption. `U` = units on
the values. `T` = timeframe stated. `M` = current-point / last-value marker. `H` = hover readout.
`E` = empty state. `S` = stale/degraded state. `K` = keyboard access to the readout.

| # | Component | Surface | Route / host | A | Ax | U | T | M | H | E | S | K |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `compass/ContractTrack` | SVG | Compass, Lotto, Weigher | ✓ `role=application` + `trackSummary()` | ✓ | ✓ `$` | ✓ "over 2h · 45m left" | ✓ | ✓ | ✓ | ✗ | **✓ `onKeyDown`** |
| 2 | `compass/StructureBoard` | SVG | `/compass` | ✓ payoff summary w/ max loss | ✓ | ✓ `$` | ✓ expiry | ✓ | ✗ | ✓ | ✗ | ✗ |
| 3 | **`compass/Sparkline`** | SVG | `/stocks` ×192, StockDetailDrawer, ProveIt | **✗ none** | ✗ | ✗ | ✗ | ✓ hover dot | ✓ | ✓ (`<2` pts → blank svg) | ✗ | **✗** |
| 4 | **`gex/TrendLine`** | SVG | PositioningMap + MigrationMap hover cards | `aria-hidden="true"` (decorative) | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ (`<2` → null) | ✗ | n/a |
| 5 | `gex/StrikeChart` | canvas (lightweight-charts) | `/pulse`, landing | ✓ | ✓ built-in | ✓ `$` | ✓ | ✓ walls/flip/king | ✓ crosshair | ✓ | ✗ | ✗ |
| 6 | `flowdesk/LiquidityHeatmapChart` | canvas (lwc) | `/pulse` | ✓ | ✓ built-in | ✓ `$` | ✓ | ✓ VWAP/shelves | ✓ | ✓ | ✗ | ✗ |
| 7 | `swing/SwingMapChart` | canvas (lwc) | `/pulse` registry | ✓ | ✓ built-in | ✓ `$` | ✓ "daily" | ✓ measured move | ✓ | ✗ | ✗ | ✗ |
| 8 | `gex/GradientChart` | canvas 2D | `/pulse` registry | ✓ | ✓ + gradient legend | ✓ γ/charm | ✓ "session field" | ✓ tape overlay | ✓ | ✗ | ✗ | ✗ |
| 9 | `gex/PositioningMap` | SVG + HTML rails | `/pinpoint/levels`, landing | ✓ wrapper `aria-label`; inner `svg aria-hidden` | ✓ | ✓ `$` | ✓ | ✓ spot rail | ✓ | ✓ | ✗ | partial |
| 10 | `gex/OrderFlowPanel` | SVG | `/pulse` registry | ✓ "Session cumulative delta" | ✗ | ✓ | ✓ session | ✓ | ✓ | ✓ | ✗ | scroll only |
| 11 | `flowdesk/NetPremiumPanel` | SVG | `/pulse` registry | ✓ | ✓ premium bounds | ✓ `$` | ✓ "through the session" | ✓ live keys | ✓ | ✓ | ✗ | ✗ |
| 12 | `gex/StatePriceDensity` (2 charts) | SVG | `/prove-it?view=density` | ✓ ×2 | ✓ | ✓ | ✓ tenor | ✓ σ markers | ✓ | ✗ | ✗ | ✗ |
| 13 | `proveit/MonteCarloPanel` | canvas 2D | `/prove-it`, `/pulse` | ✓ "Monte Carlo price-path fan chart" | ✓ day axis (`padB=13`) | ✓ `$` | ✓ window control | ✓ | ✓ | ✗ | ✗ | ✗ |
| 14 | **`three/DealerSurface3D`** | WebGL (`@react-three/fiber`) | `/prove-it` models | **✗ no aria on `<Canvas>`** | ✓ 3D labels | ✓ | ✓ | ✓ | orbit | ✗ | ✗ | ✗ |
| 15 | `proveit/MarketStateReplay` (2) | SVG | `/prove-it` | ✓ ×2 (calibration, edge decay) | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| 16 | `gex/GreeksRegime` (2) | SVG | `/pinpoint/greeks` | ✓ ×2 (charm clock, vanna shock) | 1–2 `<text>` only | ✓ `$` | ✓ session | ✓ | ✓ | ✗ | ✗ | ✗ |
| 17 | `gex/HedgeImpact` | SVG | `/pinpoint/stress` | ✓ | ✓ 5 `<text>` incl. "HEX = 1" | ✓ `%` | ✓ | ✓ boundary | ✓ | ✗ | ✗ | ✗ |
| 18 | `gex/vannacharm/WallDrift` (2) | SVG | `/pinpoint/greeks?view=migration` | ✓ ×2 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| 19 | `gex/VolSliceChart` | SVG | VolLab | ✓ | ✓ HTML x-axis + title | ✓ IV % | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| 20 | `gex/vollab/RegimePanel` | SVG | VolLab, `/pulse` | ✓ + `ChartLegend` | ✗ | ✓ | ✓ history | ✓ | ✓ | ✗ | ✗ | ✗ |
| 21 | `gex/vollab/RiskNeutralDist` | SVG | VolLab | ✓ | ✗ | ✓ | ✓ | ✓ σ | ✓ | ✗ | ✗ | ✗ |
| 22 | `gex/vollab/TermStructure` | SVG | VolLab | ✓ "ATM IV versus days to expiry" | ✗ | ✓ | ✓ DTE | ✓ | ✓ | ✗ | ✗ | ✗ |
| 23 | **`gex/GexHistory`** main chart | SVG | `/pinpoint/history` | **✗ no `role`/`aria-label`** | **✗ 4 `<text>` = last-value tags only, no time axis** | ✓ `$` | ✓ panel says "Regular 09:30–16:00" | ✓ playhead + tags | ✓ | ✗ | ✗ | **✗ (click-to-scrub, mouse only)** |
| 24 | **`flowdesk/ContractFlowChart`** | recharts SVG | Scanner row drawer | **✗ no `role`/`aria-label`** | ✓ full `XAxis`/`YAxis`/`ZAxis` | ✓ `$` | ✓ "1D" | ✓ | ✓ `<Tooltip>` | ✗ | ✗ | ✗ |
| 25 | `flowdesk/PrintSessionChart` | SVG | Tape row drawer | ✓ + `ChartLegend` | ✓ HTML premium ruler | ✓ `$` | ✓ session-order (documented) | ✓ | ✓ | ✗ | ✗ | **✓ `onKeyDown` + `tabIndex`** |
| 26 | `flowdesk/MetaorderReconstruction` | SVG | `/trace/reconstruction` | ✓ "inferred child-print execution timeline" | ✗ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| 27 | `earnings/EarningsIntel` | SVG | `/earnings` | ✓ "Expected IV-crush path" | ✗ | ✓ IV | ✓ around print | ✓ | ✓ | ✗ | ✗ | ✗ |

**Decorative charts.** Only one: `gex/TrendLine` (`src/components/gex/TrendLine.tsx:14`) — 26-unit
viewBox, `preserveAspectRatio="none"`, no axis, no scale, no readout, `aria-hidden="true"`. It is
correctly marked decorative and sits inside a hover card that already carries the numbers. **Not a
defect.** Nothing else in the app is a shape without a quantity.

**Stale state: zero charts have one.** `grep -rni "stale" src/ --include=*.tsx --include=*.ts`
(excluding tests) returns 19 hits, **all of them prose comments or unrelated identifiers** — no
`isStale`, no `StaleBadge`, no degraded treatment anywhere in `src/components/ui/` or
`src/components/layout/`.

## 40.2 Charts at 390×844 (`mobcharts.mjs`)

| Route | page overflows? | chart surfaces | any wider than viewport | surfaces < 120 px tall |
|---|---|---|---|---|
| `/pulse` | no (`docScrollW=390`) | 18 | 0 | **7** (main pane collapses to 272×172; scale strips 272×26) |
| `/stocks` | no | 192 | 192 *(inside the h-scrolling table, not a chart bug)* | 192 (72×22) |
| `/prove-it` | no | 5 | 0 | 2 |
| `/prove-it?view=volatility` | no | 4 | 0 | 1 (**RegimePanel at 314×93**) |
| `/prove-it?view=density` | no | 2 | 0 | 0 |
| `/pinpoint/greeks` · `/stress` · `/history` · `/levels` | no | 1–2 | 0 | 0 |

Charts respond correctly — none forces a horizontal page scroll. The `/pulse` price pane at
272×172 and the Vol-Lab regime panel at 314×93 are the two smallest reads.

---

# GATE 41 — Tables

## 41.1 Inventory (16 live tables across 12 routes, `chart-sweep.mjs` + `tnum2.mjs`)

| Route | table | rows | cols | sticky `thead` | sortable cols | row keyboard | box × scroll (px) |
|---|---|---|---|---|---|---|---|
| `/pulse` | expiry matrix (`GexMatrix`) | 30 | 6 | `sticky` @ 0 | 0 / 6 *(strike-ordered)* | – | 391×386 / 460×792 |
| `/pulse` | flow tape (`PulseFlowTape`) | 34 | 11 | `sticky` @ 0 | 0 / 11 *(chronological)* | ✓ | 915×374 / 915×1384 |
| `/compass` | setups | 7 | 5 | `sticky` @ 0 | **5 / 5** | ✓ | 531×240 / 531×270 |
| `/compass` | chain ranks | 8 | 7 | `sticky` @ 0 | 4 / 7 | ✗ | 1380×297 |
| **`/stocks`** | ranked board (`DataTable`) | **192** | 9 | `sticky` @ 0 | 6 / 9 | ✓ | 1380×640 / **1380×18660** |
| `/earnings` | earnings board | 14 | 10 | `sticky` @ 0 | 9 / 10 | ✓ | 1380×560 / 1380×999 |
| `/tracker` | trade ledger | 48 | 7 | `sticky` @ 0 | 6 / 7 | ✓ | 798×522 / 798×2385 |
| **`/trace/live-tape`** | options tape | 23 (virtualized of 400) | 17 | `sticky` @ 0 | 0 / 17 *(chronological)* | ✓ | 1380×640 / **1380×18455** |
| `/trace/scanner` | flow scanner | 44 | 10 | `sticky` @ 0 | 9 / 10 | ✓ | 1380×560 / 1380×2192 |
| **`/trace/dark-pool`** | dark tape | **240** | 13 | `sticky` @ 0 | **13 / 13** | ✓ | 1380×560 / **1380×9424** |
| `/pinpoint/gamma` | `GexMatrix` | 21 | 6 | `sticky` @ 0 | 0 / 6 | – | 1320×452 / 1320×563 |
| `/pinpoint/levels` | `ExposureMatrix` | 22 | 10 | `sticky` @ 0 | 0 / 10 | ✓ | 798×640 / 798×718 |
| `/pinpoint/levels` | `ExposureLedger` | 22 | 4 | **`sticky` @ 36 px** (under its own toolbar — correct) | 0 / 4 | ✓ | 1380×560 / 1380×847 |
| `/pinpoint/greeks` | `GreeksRegime` | 21 | 6 | `static` thead, **`sticky left-0` Strike column** | 0 / 6 | ✗ | 1380×795 / 1380×795 (no v-scroll at this height) |
| `/pinpoint/history` | session ledger | 45 | 7 | `sticky` @ 0 | 6 / 7 | ✓ | 1380×300 / 1380×1518 |
| `/trace/reconstruction` | child prints | small | – | none *(fits, `overflow-x-auto` only)* | 0 | ✗ | – |

**15 of 16 tables have a sticky header** and the one that does not (`GreeksRegime`) has no
vertical scroll at 1440×900 (`boxH == scrollH == 795`) and pins its Strike column horizontally
instead. No table has been turned into oversized cards — every one of them is a real `<table>`.

`src/components/ui/DataTable.tsx` is the shared primitive and it is correct: `sticky top-0 z-10`
thead (:96–98), `aria-sort` on every sortable header (:120–128), `tabIndex={0}` + Enter/Space on
sortable `<th>` (:129–140), `tabIndex={0}` + Enter on clickable rows (:170–184), `aria-current`
rather than `aria-selected` on the selected row (:167–169, with the reasoning in-comment), `tnum` +
`text-right` on numeric columns (:189–194), `EmptyState` on zero rows (:158–163), `colgroup`
band headers (:99–115), and `sr-only` headers for icon columns (`headerHidden`).

## 41.2 Numeric alignment and tabular figures

`tnum2.mjs` walks every *text node* that is ≥ 2 digits and ≥ 40 % numeric inside the first 3 body
rows of every table and reads `font-variant-numeric` on its **parent element** (an earlier pass that
read the `<td>`'s "deepest single child" produced 6 false positives on `/pinpoint/levels` and
`/trace/live-tape` — retracted).

**Result: 14 of 16 tables are 100 % `tabular-nums` on every numeric cell style.** The two misses:

- `src/components/gex/GexMatrix.tsx:97` — the Strike `<td>` is `font-mono text-label` with no `tnum`
  (`/pinpoint/gamma`, `/pulse`).
- `src/pages/flowdesk/LiveTape.tsx` — the strike pill in the `Exp · DTE` column, `font-mono`, no `tnum`.

**Both are cosmetic-only, measured to zero effect.** Direct width probe in the live page:

```
JetBrains Mono, ui-monospace, …    "111.11" = 43.22 px    "888.88" = 43.22 px   (font-variant-numeric: normal)
JetBrains Mono, ui-monospace, …    "111.11" = 43.22 px    "888.88" = 43.22 px   (tabular-nums)
Inter, ui-sans-serif               "111.11" = 31.67 px    "888.88" = 33.00 px   ← 1.33 px jitter
```

The face is already monospaced, so `tnum` changes nothing there. Every place the app renders
numbers in **Inter** it does apply `tnum`. **Not a defect** — noted only so a later pass does not
re-flag it.

## 41.3 Tables at 390×844 (`misc.mjs`)

`cardFallback` = presence of any `sm:hidden`/`md:hidden` alternate rendering.

| Route | page overflows | table width | scroll box | **visible fraction** | cols rendered / total | card fallback |
|---|---|---|---|---|---|---|
| **`/trace/dark-pool`** | no (390) | 1268 | 346 | **27 %** | 13 / 13 | **no** |
| **`/stocks`** | no | 1086 | 346 | **32 %** | 9 / 9 | **no** |
| **`/earnings`** | no | 1021 | 346 | **34 %** | 10 / 10 | **no** |
| `/trace/live-tape` | no | 1309 | 346 | 26 % | 17 / 17 | no — **but** `LiveTape.tsx:751-758` counts clipped columns and surfaces the number |
| `/tracker` | no | 553 | 346 | 63 % | 7 / 7 | no |
| `/compass` | no | 495 / 506 | 312 / 346 | 63 % / 68 % | 5 / 5, 7 / 7 | no |
| `/pinpoint/gamma` | no | 460 | 330 | 72 % | 6 / 6 | no |

The page never scrolls horizontally — the overflow is correctly contained in the table's own box.
But no table drops or reorders columns for a phone, and none has a stacked fallback. The only
mitigation anywhere in the app is `LiveTape`'s clipped-column counter.

---

## Findings

### P0
*None.* No wrong or misleading number, and no broken workflow, was found under gates 39/40/41.
The two most severe defects below cost the reader their place, not their data.

### P1

**39-A · `/trace/live-tape` accumulates CLS 0.536 in 15 s and 1.061 in 30 s of live ticking**
`src/pages/flowdesk/LiveTape.tsx:1065-1066`. `windowRows.map(r => <tr key={r.id} …>)` — new prints
get a new key, so React **inserts a DOM `<tr>` at the top of the virtualization window** and every
row below it physically moves. Measured rects: `prev=[25,516,1380,46] → cur=[25,608,1380,46]`
(+92 px), `→ cur=[25,700,1380,46]` (+184 px, four prints in one tick), once every ~1.5 s, 21 shift
entries in 30 s (`cls_trace_live-tape.json`). Table geometry itself is stable (`tableH` = 18455 px
constant, all rows 46 px, `scrollTop` stays 0 — `livetape-probe.json`), so this is purely rows
sliding under the reader. A print takes longer than 1.5 s to read.
**Fix:** keep the newest print in a fixed slot rather than prepending into the reader's viewport —
e.g. render the window bottom-up with the newest row pinned, or hold the DOM order stable and
translate, so the row a reader has their eye on does not move. The unread-count pill and scroll
anchoring already handle the scrolled-down case; it is the at-top case that shifts.

**39-B · `/compass` teleports a setup card 393 px across the grid on a re-rank**
`src/components/compass/SetupScanCard.tsx:80-90`. Two measured jumps in 30 s
(`cls_compass.json`): `t=11160 v=0.024` — a card goes `[35,843,385,57] → [428,604,385,231]`;
`t=21608 v=0.076` — "#2 ADBE 567C" goes `[35,604,385,231] → [428,366,385,230]`, i.e. **+393 px
horizontally and −238 px vertically**, into a different grid column, with no transition. Card content
also swaps wholesale: over 12 samples at 1.5 s (`compass-cards.json`) positions 3 and 4 went
`HD 356P / BLK 862P` → `SPOT 343P / MDLZ 70.50C` → `BA 187C / SPOT 343P` while the reader is
looking at them. Total `/compass` CLS 0.131–0.208 across runs, essentially all of it live.
**Fix:** the ranked list needs a settle rule — freeze order while a card is hovered/focused, or
re-rank on an explicit beat with the moved cards marked, rather than resorting silently on the
1.5 s tick.

**39-C · Every route ships 1,646 kB uncompressed, including routes with no charts**
`server.ts:10` is `app.use(express.static(...))` with no `compression()`. Verified: the response for
`index-eO7KLxE9.js` carries `Content-Length: 1614393` and **no `Content-Encoding`**, with
`Accept-Encoding: gzip, deflate, br` sent. `gzip -9` of the same file is 478,409 B. `/legal/terms`
and `/guide/faq` each pull the full 1,646 kB (`bundle.json`).
**Fix:** enable response compression in `server.ts` (and confirm the Vercel edge does it in prod —
`vercel.json` only declares SPA rewrites). This is a 3.4× transfer reduction for one line.

**39-D · No route-level code splitting: one 1.61 MB `index.js` for all 65 route entries**
`vite.config.ts` declares no `manualChunks`, and `src/App.tsx:12-40` statically imports 30 page
components. Marker probe confirms `lightweight-charts` (`createChart`) and `react-grid-layout` are
both inside `index.js`, so `/legal/privacy` downloads the charting engine and the dashboard grid.
The 321–498 ms long task at t≈110–180 ms is identical on `/pinpoint/gamma` (432 DOM nodes) and
`/stocks` (9279), which is what identifies it as bundle evaluation.
**Fix:** `lazy()` the desk routes the way `ProveIt` and `SlayerTrailer` already are, and/or a
`manualChunks` split for `lightweight-charts` + `react-grid-layout`. Do not add a bundle-analyzer
dependency for this — the `dist/` sizes above are the measurement.

**39-E · `/prove-it?view=volatility` and `?view=density` download the three.js stack and mount zero canvases**
`src/pages/proveit/ProveIt.tsx:14` imports `Surface3D` statically, so the whole 3D stack lands in
the `ProveIt` chunk (1,022,049 raw / 271,768 gzip; `WebGLRenderer` ×5). Measured: both non-models
views transfer **2,644 kB** and report **0 canvases of any kind** on the page (`bundle.json`).
Reference: `three/build/three.core.js` alone is 158,784 gzip.
**Fix:** `lazy()` `Surface3D` inside `ProveIt.tsx` so the two SVG-only views never fetch it.
This is the only genuinely heavy library loaded on a surface that does not use it — three.js is
otherwise correctly confined (0 `WebGLRenderer` hits in `index.js`), and recharts and the ticker
JSON are already split.

**40-A · 192 unnamed, mouse-only sparklines on `/stocks`**
`src/components/compass/Sparkline.tsx:34-40`. Measured on the live page: 192 instances at 72×22,
`role=null`, `aria-label=null`, `aria-hidden=null`, `tabindex=null`. They carry a real quantity (the
30-day relative-strength series) behind an `onMouseMove` readout with no keyboard path and no
accessible name — 192 unnamed graphics nodes in the tree. `src/pages/Stocks.tsx:553` also omits
the component's own optional `label` prop, so even the hover card renders without a heading.
Contrast `ContractTrack.tsx:361-372`, which does this right: `role="application"`, `tabIndex={0}`,
`aria-label={trackSummary(...)}`, `onKeyDown`.
**Fix:** either mark it `aria-hidden` and let the column header carry the read (it is a trend
glyph beside a sortable numeric column), or give it the `ContractTrack` treatment. Passing `label`
at the call site is a one-line improvement regardless.

**41-A · `/trace/dark-pool` renders 240 rows × 13 columns unvirtualized — 12,187 DOM nodes**
`src/pages/flowdesk/DarkPool.tsx:594-601` passes all 240 rows to `DataTable` with
`maxHeight="max(560px, 62vh)"` — the box shows 560 px of a 9,424 px scroll surface, so ~94 % of
the DOM is never on screen. Measured DOM: **12,187** nodes, the heaviest page in the app.
`/stocks` is the same pattern (`Stocks.tsx:784-791`, 192 rows, 18,660 px scroll, **9,279** nodes,
plus 192 sparkline SVGs = 400 SVGs total). `LiveTape` already solves this — it virtualizes 400
prints down to 23 mounted rows and holds DOM at 1,266 — so the primitive to copy exists in-repo.
**Fix:** lift `LiveTape`'s windowing into `DataTable` (or gate it behind a `virtualize` prop) so
every long board gets it. Both routes measure CLS 0.000 today, so this is throughput and memory,
not stability.

### P2

**39-F · The site footer shifts on first paint on every route**
`src/components/layout/AppShell.tsx:115,127` — `min-h-full` on the scroll body plus `mt-auto` on the
footer wrapper pins the footer to the viewport bottom during the first paint, then desk content
mounts and displaces it. Measured: `prev=[0,848,1430,52] → cur=[0,0,0,0]` at t=694 ms on
`/compass` (v=0.029) and t=729 ms on `/prove-it` (v=0.057) — this is the single largest load-time
shift on both routes, and it reproduces on every route in the app.
**Fix:** reserve the footer's height in the initial layout, or do not paint it until the route body
has a size.

**40-B · `/pinpoint/history` — the session chart has no `role`/`aria-label`, no time axis, and is mouse-only**
`src/pages/gex/GexHistory.tsx:95-135`. The 882×340 SVG carries **4 `<text>` nodes total**
(`chart-table-sweep.json`) and all four are the right-edge last-value tags — there is no x-axis tick
label anywhere, so the reader cannot place any point on the session clock without hovering. The
element has `onClick` scrubbing (:107) but no `tabIndex` and no `onKeyDown`, and no `role="img"`,
no `aria-label`, no `<title>`. The surrounding panel does declare the timeframe
("Regular 09:30–16:00", :294) and the transport buttons are keyboard-reachable, so the *desk*
works — the chart itself does not.
**Fix:** add `role="img"` + a summary label, 3–4 time ticks on the x-axis, and make the SVG
focusable with arrow-key scrubbing (`PrintSessionChart.tsx:136-139` already has this pattern).

**40-C · No chart or table in the app has a stale/degraded state**
`grep -rni "stale" src/ --include=*.tsx --include=*.ts` (tests excluded) returns 19 hits, all prose
comments. There is no `isStale`, `StaleBadge`, feed-age badge or degraded treatment anywhere in
`src/components/ui/` or `src/components/layout/`. Every one of the 26 charts and 16 tables renders
identically whether the 1.5 s tick is running or stopped.
**Honest caveat:** the tick is a local simulator (`MarketDataContext.tsx:39` → `core/simulator`)
that has no failure path today, so I could not reproduce a stale condition — this is a missing
affordance, not an observed wrong reading. It becomes P0-adjacent the moment a real feed lands.

**40-D · Two charts render a quantity with no accessible name**
`src/pages/flowdesk/ContractFlowChart.tsx` (recharts, scanner row drawer) — full `XAxis`/`YAxis`
/`ZAxis`/`Tooltip`, correct `$` and time units, "1D" timeframe, but zero `role`/`aria-label` in the
file. `src/components/three/DealerSurface3D.tsx:140` — the `<Canvas>` has no aria attributes at all.
Everything else in the inventory is labelled.
**Fix:** one `role="img"` + `aria-label` on each wrapper. (`ContractFlowChart` is lazily loaded, so
the fix ships in that chunk with no bundle cost.)

**41-B · No table drops columns for a phone; 3 boards show ≤ 34 % of their width at 390 px**
Measured at 390×844: `/trace/dark-pool` renders all 13 columns in a 1,268 px table inside a 346 px
box (**27 % visible**), `/stocks` 9 columns / 1,086 px (**32 %**), `/earnings` 10 columns / 1,021 px
(**34 %**). `cardFallback` is `false` on every route checked. The page itself never overflows —
`document.documentElement.scrollWidth == 390` everywhere — so the horizontal scroll is correctly
contained, and `RankedTargets.tsx:321,324` shows the app already knows the `hidden lg:table-cell`
idiom. `LiveTape` is the only surface that tells the reader columns are cut
(`LiveTape.tsx:751-758` counts headers whose right edge is past the box).
**Fix:** apply `hidden lg:table-cell` to the secondary columns on the three widest boards, and
lift `LiveTape`'s clipped-column counter into `DataTable` so the cut is always announced.

### P3

**39-G · `/pulse` blocks the main thread for 456 ms at t=664 ms**
Second-largest long task in the app, after the 498 ms bundle-eval task on `/prove-it`. It lands
right after first paint on the one desk that mounts `react-grid-layout` plus 15 canvases. Not a
correctness issue and not user-visible after load; listed for completeness.
**Fix:** none proposed without a profile attributing it — see *Not audited*.

---

## Not audited / could not reproduce

- **Long-task attribution.** `PerformanceLongTaskTiming.attribution` returns only
  `{name: "unknown", containerType: "window"}` in this Chromium, so the 321–498 ms tasks are
  identified by *pattern* (identical duration on a 432-node route and a 9,279-node route) rather
  than by a stack. Naming the exact culprit needs a CDP `Profiler` trace, which I did not run.
- **`DealerSurface3D` never rendered.** `/prove-it` reports 1 canvas but **0 with a WebGL context**
  (`bundle.json`), and `page.evaluate(c => c.getContext('webgl2'))` returned null. Headless Chromium
  here has no GPU and I did not launch with `--use-gl=swiftshader`, so I **cannot say whether the 3D
  surface renders, how long it takes, or what it costs**. Its row in the chart matrix is
  source-derived only. The bundle finding (39-E) does not depend on it: the two non-models views
  mount zero canvases of any kind and still transfer the chunk.
- **Fonts.** All measurements abort `**fonts.g**`, so JetBrains Mono and Inter fell back to system
  faces. LCP and CLS with the real webfonts loading (two `preconnect`s + a render-blocking
  stylesheet in `index.html`) will be **worse than reported here** — a font-swap CLS contribution
  was not measured at all.
- **Network shaping.** Everything is localhost with no throttling. The transfer numbers in 39-C/39-D
  are real bytes; the *time* cost of shipping 1.6 MB uncompressed on a real connection was not
  measured.
- **`/trace/reconstruction` and the two drawer-hosted charts** (`ContractFlowChart`,
  `PrintSessionChart`) were audited from source only — I did not drive the scanner/tape row drawers
  open in the browser, so their live geometry, hover and empty-state behaviour are unverified.
- **Long-value behaviour in tables.** Every table cell I sampled carried formatted, bounded values
  (`fmtUsd`, `toFixed`). I did not inject a pathological string (a 40-character ticker, a
  10-digit notional) to see whether `whitespace-nowrap` + `overflow-auto` degrade gracefully, so
  "behaviour with long values" is **untested**, not passed.
- **Compass CLS varies run to run** — 0.208 (15 s window, `perf.mjs`) vs 0.131 (30 s window,
  `compass2.mjs`), and the number of re-ranks in a window is not deterministic. The *mechanism*
  (39-B) reproduced in both runs with rects; the magnitude is a range, not a constant.
- **Sorting correctness.** I measured which columns *are* sortable (`th[aria-sort]` counts) but did
  not verify that any sort produces the right order.
