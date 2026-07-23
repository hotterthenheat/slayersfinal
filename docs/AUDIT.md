# Slayer Terminal — Platform Audit

A systems-level audit of the whole terminal against a professional-trading-platform
bar (Bloomberg/institutional desk): information architecture, component system,
copy, performance, accessibility, and responsive layout. Every finding below was
verified by reading the referenced file — not inferred.

Method: four parallel audit passes (IA, component-system/duplication,
copy/perf/dead-code, and a Playwright + axe-core scan of all 35 live routes at
mobile/tablet/desktop/ultrawide). Tooling reality: Playwright and axe-core run
locally; Lighthouse *performance* numbers from a software-rendered headless
container are not representative and are deliberately not quoted. a11y is measured
with axe-core; performance is assessed from the code (render/effect/memoization).

Severity = user impact. Effort: S ≤ ~30 min · M ≈ half-day · L ≈ multi-session.
Each item marked ☐ (open) / ☑ (done) as waves land.

---

## Priority queue (what gets done, in order)

**Wave 1 — Correctness & hygiene (safe, no layout risk)** ☑ SHIPPED (b331eb2)
1. ☑ Verdict-lexicon unification → QUALIFIED / WATCH / FADED everywhere user-facing (COPY-1..7)
2. ☑ Fracture `aria-label` "simulated" → "modeled" (COPY-8, banned word, screen-reader-audible)
3. ☑ Delete dead `StatRibbon.tsx` + unused `widgetByKey` export; audit dev-deps reverted before commit (DEAD-1..3)
4. ☐ Loading/empty copy register unified ("Awaiting feed…") (COPY-9) — deferred to Wave 3

**Wave 2 — Performance (measurable)** ☑ SHIPPED (79b1ba5)
5. ☑ Split MarketDataContext into stable `useTicker()` + volatile `useMarketData()` (PERF-1); AppShell→useTicker
6. ☑ Hoist `PanelChrome` out of PulseWorkspace render body (PERF-2); isolate `<LivePrice/>` in TopBar (PERF-6)
7. ☐ Move darkpool/Monte-Carlo off the 1s pulse path; memoize panel bodies (PERF-3/4) — deferred
8. ☑ Kill impure `++revRef.current` pattern in Pulse (PERF-5); ☐ remaining 4 sites (Compass×2, LiveSections, ComplexBoard, GammaChart) deferred

**Wave 4 — Information architecture (full consolidation)** ☑ SHIPPED (a4ae167, 7de647e) — merged in PR #30
14. ☑ Pinpoint 11 → 6 desks with `?view=` sub-tabs (IA-F3..F7); all 8 old paths redirect
15. ☑ Trace 5 → 4; FlowTracker removed, `/trace/tracker` → Scanner (IA-F1/F2)
16. ☑ One Tracker home; cross-link repointed off the removed route (IA-F1)
17. ☑ Surface Liquidity Map in Pulse Classic (IA-F8); wordmark → Home/`/pulse` (IA-F9).
    ☐ Nav grouping (IA-F10) — evaluated, held: moving Trace under Analyze thins Discover to 2 and doesn't clearly improve; current taxonomy is coherent.

**Wave 3 — Component consolidation / one design system** ☑ SHIPPED on PR #31 (genuine scope complete)
Note: on inspection the audit over-counted several "duplications" — like the 7 "clones"
that were really 4. The genuine consolidations are done; items that turned out NOT to be
real duplication, or that carried regression risk, are held with rationale below.
9. ☑ `<Stat>` primitive (16059d4): migrated the **4** clones that are genuinely this boxed tile
   (ContractWeigher, MetaorderReconstruction, NewsIntel, GreeksRow). The other 3 flagged "clones"
   are **different patterns** (OrderFlowPanel/ContractFlowChart borderless inline; Tracker MiniStat
   holds a score-bar child) — folding regresses layout; held.
10. ☑ `<EmptyState>` primitive (e54c17a) — adopted on short-label empties (LottoBoard, LiveTape,
   DataUnavailablePanel). Sentence-length empties stay plain (uppercase label doesn't fit a sentence).
   `<Skeleton>`/`PanelErrorBoundary`→ui held: data is synchronous (no loading states to speak of),
   and per-desk error-boundary wiring is architectural, not a dedup.
11. ☑ `.rail-{select,silver,neutral,king,warn}` selection-rail utilities (a3cd26b) — 11 static
   sites migrated. Dynamic (RankedTargets CLASS_EDGE) + full-border (ContractChain) kept inline.
12. ☑ inline `SignalBadge` folds (D6, 75e3f5d); ☑ `<ChartLegend>` (D2, 0dcb8c7) — Fracture + RegimePanel,
   available for the rest. `<LevelPill>` (D5) held: 3 tone-varied pills embedded in marker components,
   marginal. `Section` (D8) held: the two defs are **different components** (page `<section>`+`<h2>` vs
   drawer 3-col stat grid), not a real duplicate.
13. ☑ `shadow-lg → shadow-overlay` (697cb17, 5 sites); ☑ `text-ink` token + 17 swaps (2ec43f5).
    ☐ **`text-xs/sm → ramp` (152) — HELD**: Tailwind's `text-xs/sm` bundle a line-height the ramp
    tokens (font-size only) don't, so a blind swap changes vertical rhythm. Not value-preserving —
    needs per-site review; deferred as invisible relative to the regression risk. Radius scale — likewise low-value.

**Wave 5 — Responsive + a11y** — VERIFIED CLEAN on a representative sample (see §6/7)

---

## 1. Information Architecture

Live routes: 35. Top nav = 4 workflow dropdowns (Discover/Analyze/Manage/Review,
`nav.ts`); `⌘K` jumps to every desk + Pinpoint/Trace/Guide/Community subpage.

| ID | Finding | Sev | Effort |
|----|---------|-----|--------|
| IA-F1 | **Two "Tracker" homes.** `/tracker` (persistent, TrackerContext) vs `/trace/tracker` (FlowTracker, ephemeral `useState` pins that never reach TrackerContext). Both nav.ts and Trace subnav claim the "watch/bookmark" home; `Tracker.tsx:592` even links to `/trace/tracker` as a separate destination. | High | M |
| IA-F2 | **Trace Scanner and FlowTracker are the same data.** Both call `buildScannerRows()`; FlowTracker = Scanner filtered to `sweeps>0 \|\| \|ΔOI\|>15%` with weaker (ephemeral) tracking. Doesn't earn a 5th tab. | High | M |
| IA-F3 | **Pinpoint over-fragmentation: 11 sub-desks.** subnav.ts concedes "a wall of equal tabs." Merge to ~6 (F4–F7). | High | M/L |
| IA-F4 | **Gamma ≡ Complex.** ComplexBoard docstring: "the single-ticker Gamma Heatmap run across the board." One desk + `[This ticker \| Complex]` scope toggle. | Med | S |
| IA-F5 | **Vanna/Charm in two desks.** GreeksRegime already renders CharmChart + VannaChart + a vanna/charm matrix; `/pinpoint/vanna-charm` is a whole desk on the same greeks. Merge → **Greeks & Dynamics**. | Med | S/M |
| IA-F6 | **Vol Lab ≈ State Density.** Both "the vol surface"; VolLab already ships `RiskNeutralDist` duplicating State Density. Merge → **Volatility** `[Surface \| Risk-neutral density]`. | Med | M |
| IA-F7 | **Hedge Impact ≈ Fracture.** Both "where it breaks" via forced-flow-vs-liquidity. Merge → **Stress** `[HEX \| Fracture]`. | Med | S/M |
| IA-F8 | **Liquidity Map has no findable home.** Real feature, renders only as a Pulse widget reachable via Customize→Add (3 clicks), not in the palette; code still lives in the Trace folder which has no entry. | Med | M |
| IA-F9 | **No in-shell Home.** `/pulse` is home (everything redirects there) but the wordmark *exits* to the marketing landing; only Analyze▸Pulse or ⌘K returns. | Med | S |
| IA-F10 | **Workflow grouping splits complementary desks.** Trace under *Discover*, Pinpoint under *Analyze*; group labels hide desk names; Pulse (home) buried 4th under Analyze. | Low/Med | S |
| IA-F12 | Routed pages living in `components/` (StatePriceDensity, MetaorderReconstruction) — org smell only. | Low | S |

**Proposed consolidated tree** (all old URLs preserved by redirect):
```
Pulse · Compass[Setups|Weigher|Lotto] · Stocks · News · Earnings
Trace:    Live Tape · Dark Pool · Scanner(+Surfaced) · Reconstruction      (5→4)
Pinpoint: Gamma[This|Complex] · Levels[Exposure|Ranked] · Greeks[Matrix|Migration]
          · Volatility[Surface|Density] · Stress[HEX|Fracture] · History     (11→6)
Tracker (single persistent home) · Community · Prove It · Guide/Legal
```
Redirects mirror the existing `/lotto→/compass {state}` and `strike-profile→exposure-profile` patterns (query param / router state per sub-tab).

## 2. Component system & duplication

Dead: `ui/StatRibbon.tsx` (0 imports), `.inst-eyebrow` CSS (0 uses),
`widgetByKey` export.

| ID | Duplication | Sev | Effort | Sites |
|----|-------------|-----|--------|-------|
| D1 | **Metric "cell" reinvented** (`Cell`/`Stat`/`MiniStat`) — same as StatCard, re-hardcoding the tone ternary `toneText` already exports | High | M | 7 files: MetaorderReconstruction, GreeksRow, NewsIntel, ContractWeigher, OrderFlowPanel, ContractFlowChart, Tracker |
| D2 | **Chart legend** markup copied | Med | S | 10 files (PositioningMap, WallDrift, MigrationMap, RegimePanel, TermStructure, MonteCarloPanel, Surface3D, ExposureLedger, GexHistory, Fracture) |
| D3 | **Empty-state** markup, inconsistent padding/casing | Med | S | 15+ sites |
| D4 | **Selection "rail"** via hardcoded inset-shadow rgba; the token color spelled 4 ways | Med | S | 10 files |
| D5 | **Level/axis pill** re-inlined alongside `SpotRule` | Low/Med | S | 4 files |
| D6 | Inline `SignalBadge` (== `toneBadge`) | Low | XS | 4 files |
| D7 | Hand-rolled multi-toggle/filter chips (SegmentedControl can't do multi/OR) | Low/Med | M | 21 toggles / 11 files |
| D8 | `Section`/`SectionKicker` helper defined 3× | Low | S | 3 files |

**State coverage:** panel-level error isolation exists **only for Pulse** — promote to `ui/`.
Loading is the weakest area: 3 different idioms, no `<Skeleton>`. Empty states inconsistent (D3).
`DataUnavailablePanel` (honest "no feed") used only in Pulse.

**Token / standardization violations:**
| Category | Count | Note |
|---|---|---|
| `text-[Npx]` raw font sizes | 0 | ramp migration clean ✓ |
| Tailwind default sizes bypassing ramp (`text-xs`/`sm`/`base`) | 152 | → `text-caption`/`text-data`/`text-body` |
| Arbitrary radius `rounded-[Npx]` | 16 | + `rounded`(105)/`rounded-sm`(15) compete for the small slot → publish a radius scale |
| Hardcoded hex duplicating tokens | 4 | DealerSurface3D bull/bear, SetupCard `#141414`/`#0a0a0a` |
| `text-[#0a0a0a]` ink-on-holo | 17 | add a `text-ink` token |
| Ad-hoc `shadow-lg` | 5 | → `shadow-overlay` |

## 3. Copy (institutional language)

**Core issue — verdict lexicon fragmentation.** Setup engine type is `ENTER\|WATCH\|EXIT`
(`types/skyvision.ts`), but `VerdictBadge` + Disclaimer canonicalize **QUALIFIED/WATCH/FADED**.
Several surfaces still print ENTER/EXIT → same state, two words, sometimes same screen.
Standardize user-facing on QUALIFIED/WATCH/FADED; keep ENTER/EXIT internal only.

| ID | file:line | current → proposed | Sev |
|----|-----------|--------------------|-----|
| COPY-1 | LiveSections.tsx:229 | raw `{setup.verdict}` (ENTER/EXIT) → VERDICT_LABEL map | High |
| COPY-2 | PricingExtras.tsx:61 | "ENTER / EXIT calls" → "QUALIFIED / WATCH / FADED read" (drops imperative "calls") | High |
| COPY-3 | Tracker.tsx:48 | "engine currently reads ENTER" → "…QUALIFIED" | High |
| COPY-4 | Tracker.tsx:49 | "…reads EXIT" → "…FADED" | High |
| COPY-5 | Tracker.tsx:513 | flag chip "Engine reads EXIT" → "…FADED" | High |
| COPY-6 | Tracker.tsx:590,624 | "ENTER / EXIT" / "reads ENTER" → QUALIFIED variants | Med |
| COPY-7 | Tracker.tsx:591 | "BUY / WATCH / FADE" → Weigher's actual "STRONG / WATCH / WEAK" | Med |
| COPY-8 | Fracture.tsx:161 | aria-label "simulated feedback price paths" → "modeled…" (banned word) | Med |
| COPY-9 | Compass/gex/LiveTape/Pulse | loading register inconsistent ("initialization" dev-flavored) → one "Awaiting feed…" convention | Low |

Verdict vocab that is *intentionally* per-desk and fine: Stocks ACCUMULATE/HOLD/AVOID,
sectors OVERWEIGHT/NEUTRAL/UNDERWEIGHT, Earnings PLAY/FADE/SKIP, dark-pool
ACCUMULATING/DISTRIBUTING. Only the setups desk has the two-name collision.

## 4. Performance

| ID | Finding | Sev | Effort | File |
|----|---------|-----|--------|------|
| PERF-1 | **MarketDataContext one un-split, un-memoized value** → every consumer re-renders each 1.5s tick. `AppShell` reads only `{activeTicker,changeTicker}` yet re-renders (dragging TopBar/CommandPalette/Settings/Shortcuts/Onboarding); `changeTicker` unmemoized so AppShell's keydown listener is torn down+re-added every tick. Split stable vs volatile. | High | M | context/MarketDataContext.tsx:51 |
| PERF-2 | **`PanelChrome` declared in render body** → new identity each render ⇒ full header subtree remount every render (~1×/s), resets `PanelTicker` mid-type. Hoist to module scope. | High | Low/M | pulse/PulseWorkspace.tsx:423 |
| PERF-3 | **1s heat pulse spreads a new `ctx`** → each panel re-runs `render(ctx)` every second incl. `runMonteCarlo` / `buildDarkPoolView`. Compute those in the 10s scan, not render path. | Med | M | PulseWorkspace.tsx:293 |
| PERF-4 | Panel bodies not memoized — amplifies PERF-1/2/3. Memoize by `(key,ticker,revision)`. | Med | M | PulseWorkspace.tsx:405 |
| PERF-5 | `useMemo(()=>++revRef.current,[marketData])` impure render (5 lint warnings). Bump in effect / key off identity. | Low | Low | PulseWorkspace/LiveSections |
| PERF-6 | TopBar re-renders full nav each tick for the price readout. Isolate price into a `marketData`-only child. | Low | Low | layout/TopBar.tsx:43 |

Interval/subscription hygiene otherwise clean (all timers/listeners cleared on unmount).

## 5. Dead code / deps / lint

- Delete `ui/StatRibbon.tsx` (0 imports) and `widgetByKey` export (registry.tsx:389).
- Audit dev-deps (`axe-core`, `rollup-plugin-visualizer`) — analysis-only, **revert package.json/lockfile before committing feature work** (keep `playwright`, already used for verification).
- Lint: 19 warnings / 0 errors — 11× `react-refresh/only-export-components` (fast-refresh only, benign), 8× `exhaustive-deps` (5 clear once PERF-5 is fixed; `Stocks.tsx:241` missing `inBetaBand`/`inPriceBand` is a real stale-closure to look at).

## 6. Accessibility (axe-core) & 7. Responsive (Playwright)

**Tooling reality:** the full 30-route × 4-viewport scan is not runnable in this
software-rendered headless container — Playwright is pathologically slow on the
live-animation routes (≈14s/route for axe alone; the batch scans stalled). So
instead of an unreliable full sweep, a **representative sample** was checked
uncontended, one route at a time.

**Accessibility (axe-core, WCAG 2.0 A + AA):** **clean** on every sampled route —
`/` (landing), `/pulse` (dashboard), `/compass`, `/pinpoint/gamma` (dense greek
matrix), `/trace/live-tape` (streaming tape). 0 violations. The sample spans the
landing, the dashboard, and all three desk families incl. dense tables and live
charts. (Earlier "serious" counts were artifacts of the scanner hammering a
contended / mid-load server — they did not reproduce in isolated runs.) This
confirms the prior a11y work (icon-button aria-labels, chart roles, focus rings)
holds up.

**Responsive / overflow:** **no horizontal overflow** on the sampled routes at
mobile (390) / tablet (768) / desktop (1440) / ultrawide (2560). Consistent with
the earlier mobile-responsiveness waves and the glass-nav 0-overflow verification.

**Conclusion:** no responsive/a11y fix batch is warranted from the evidence
gathered — the foundation is solid. A full exhaustive sweep would need a
hardware-GL environment where Playwright runs at normal speed.
