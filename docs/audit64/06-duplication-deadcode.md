# 06 — Duplication, Dead Code & Template Shapes

**Gates:** 62 (analysis half), 12, 15
**Scope:** `/home/user/slayersfinal/src` — 301 files, 69,690 LOC (280 non-test files / 63,789 non-test LOC; 21 test files / 5,901 LOC).
**Method:** hand-rolled analysis. Knip and jscpd were **not** installed and were not run. Scripts used live in
the scratchpad (`exports.mjs`, `clones.mjs`, `sim.mjs`, `fam.mjs`, `kpi.mjs`, `panels.mjs`, `grids.mjs`, `fmt.mjs`)
and are reproducible; every number below came out of one of them or out of `rg`.

**No file under `src/`, no root `*.ts`/`*.json`, and not `tailwind.config.ts` was modified.**

---

## 0. False-positive guards run before reporting dead code

Reachability that a naive grep would miss was checked first:

| Mechanism | Sites found | Handled how |
|---|---|---|
| `React.lazy(() => import(...))` | 3 — `App.tsx:45` (ProveIt), `App.tsx:51` (SlayerTrailer), `ScannerRowDrawer.tsx:11` (ContractFlowChart) | Resolved as import edges |
| Bare dynamic `import('...')` | 2 — `ContractWeigher.tsx:455`, `TickerSearch.tsx:33` (both `data/tickers`) | Whole module marked live; no export inside it is reported |
| String-keyed component registry | 1 — `TrailerShell.tsx:44` `SCENE_COMPONENTS: Record<string, ComponentType>`, 18 entries | All 18 scene modules treated as reachable |
| Array registries keyed by string | `WIDGETS` (`workspace/registry.tsx:91`) → `PULSE_ADDABLE_PANELS` → `PULSE_PANELS` (`pulseRegistry.tsx:137-140`), looked up by `pulsePanelByKey(key)` at `:143` and enumerated by the Pulse add-panel search at `PulseWorkspace.tsx:1400-1401` | Every widget is enumerable from the search, so none is unreachable |
| Barrel / `index.ts` re-exports | **0** — `find src -name 'index.ts*'` returns nothing | No indirection to unwind |
| `localStorage` key registry | `LOCAL_DATA_GROUPS` (`core/localData.ts:18`) | Cross-checked against every real key (see F-2) |

**Result of the reachability pass: 0 orphan files and 0 test-only-imported files.** Every non-test module in
`src` is reachable from `main.tsx`. That is a genuinely good result and is stated as a measurement, not a
courtesy — the import-graph walk in `exports.mjs` resolved 100% of relative specifiers.

---

## Findings

### F-1 · P0 · Nine different compact-USD formatters that disagree on the same number
**Gate 62 (duplication) / Gate 12**

Nine independent implementations of "abbreviate a dollar amount to K/M/B" exist. They are not stylistic
variants — they round to different precisions, so **the same quantity renders as a different number depending
on which desk you are looking at.**

Sites, verbatim:

| # | Site | B | M | K | sub-1K |
|---|---|---|---|---|---|
| 1 | `src/data/gex.ts:45-48` `fmtUsd` | 1 dp | 1 dp | 1 dp | `$n` |
| 2 | `src/pages/trailer/format.ts:13-16` `usd` | **2 dp** | 1 dp | 0 dp | `$n` |
| 3 | `src/core/fracture.ts:443-445` `fmtUsd` | 1 dp | **0 dp** | 0 dp | **no branch** |
| 4 | `src/data/metaorder.ts:233-236` `usd` | 1 dp | 1 dp | 0 dp | `$n` |
| 5 | `src/components/flowdesk/flowPillsPrimitive.ts:24-25` `fmtPrem` | **no branch** | 1 dp | rounded | **no branch** |
| 6 | `src/pages/gex/HedgeImpact.tsx:16-21` `fmtNum` | no branch | **2 dp** | 0 dp | `n` |
| 7 | `src/pages/gex/GreeksRegime.tsx:29-35` `fmtC` | 1 dp | **0 dp** | 0 dp | `n` |
| 8 | `src/components/flowdesk/MetaorderReconstruction.tsx:24-25` | no branch | **2 dp** | **1 dp** | `n` |
| 9 | `src/components/flowdesk/DarkPoolFeed.tsx:10` `fmtShares` | no branch | **2 dp** | rounded | no branch |

Measured output — all nine implementations transcribed verbatim and run on identical inputs
(`scratchpad/fmt.mjs`):

```
value          #1        #2        #3       #4       #5         #6        #7      #8        #9
1,234,567,890  $1.2B     $1.23B    $1.2B    $1.2B    $1234.6M   1234.57M  1.2B    1234.57M  1234.57M
   24,500,000  $24.5M    $24.5M    $25M     $24.5M   $24.5M     24.50M    25M     24.50M    24.50M
    1,450,000  $1.4M     $1.4M     $1M      $1.4M    $1.4M      1.45M     1M      1.45M     1.45M
       87,400  $87.4K    $87K      $87K     $87K     $87K       87K       87K     87.4K     87K
          940  $940      $940      $1K      $940     $1K        940       940     940       1K
            0  $0        $0        $0K      $0       $0K        0         0       0         0K
```

Five distinct renderings of $1.23bn; four distinct renderings of every other sample.

**The live, user-visible instance is on one route.** `/pinpoint/stress` renders a `SegmentedControl` with two
views on the same route — `{ key: 'hedge', node: <HedgeImpact /> }` and `{ key: 'fracture', node: <Fracture /> }`
(`src/pages/gex/desks.tsx:93-94`). `HedgeImpact` prints dollar notionals through `fmtUsd` from `data/gex.ts`
(1 dp M — `HedgeImpact.tsx:13` import, used at `:84, :105, :183, :201, :214, :262`). `Fracture` prints its
forced-flow notionals through its **own local** `fmtUsd` at `core/fracture.ts:441-446` (0 dp M, used at
`:450, :452, :454`). One toggle click apart, $1,450,000 reads `$1.4M` on one view and `$1M` on the other — a
**31% understatement** with no rounding indicator.

**Latent, verified not-yet-firing** (stated explicitly so this is not overclaimed):
`fracture.ts:443` interpolates `v` (signed) rather than `a`, so a negative renders `$-1M` with the sign inside
the currency; all three call sites currently pass `Math.abs(...)`, so it cannot fire today. `flowPillsPrimitive`'s
missing B-branch and `$0K` floor also cannot fire — sweep premium is generated at `180_000 + roll^2.1 * 4_200_000`
(`src/data/flowSweeps.ts:57`), a range of $180K–$4.4M.

**Fix (smallest coherent):** one `compactUsd(v, { dp })` in a shared module; the nine sites become nine calls.
Do **not** silently unify precision — pick the precision each *reader* needs and pass it, because #6/#8/#9's
2 dp is deliberate for share/contract counts. The unification that matters is that `/pinpoint/stress` uses one
of them for both views.

---

### F-2 · P0 · The Settings panel's "N items stored" count is wrong — the key registry has drifted
**Gate 62 (dead/drifted registry)**

`src/core/localData.ts:1-8` states the contract: *"Every browser-stored preference the app writes, in one place,
so the settings panel can list and clear them without hunting through the codebase."*
`SettingsPanel.tsx:64` computes `totalStored` by reducing `groupStoredCount` over `LOCAL_DATA_GROUPS` and
renders it at `SettingsPanel.tsx:117-119` as `{totalStored} items stored`.

Every real `localStorage` key in `src`, resolved from its constant (`rg` over all `getItem/setItem` call sites):

| Key | Declared at | In `LOCAL_DATA_GROUPS`? |
|---|---|---|
| `slayer.stocks.watchlist` | `Stocks.tsx:54` | yes |
| `slayer.earnings.watchlist` | `EarningsHub.tsx:50` | yes |
| `slayer.flowscanner.cols.v1` | `FlowScanner.tsx:17` | yes |
| `slayer.flowscanner.templates.v1` | `FlowScanner.tsx:18` | yes |
| `slayer.livetape.cols.v1` | `LiveTape.tsx:33` | yes |
| `slayer.livetape.views.v1` | `LiveTape.tsx:34` | yes |
| `slayer_pulse_workspace_v1` | `pulse/presets.ts:17` | yes |
| `slayer_tracked_setups` | `TrackerContext.tsx:29` | yes |
| `slayer_tracker_journal` | `Tracker.tsx:150` | yes |
| `slayer_community_v1` | `data/community.ts:18` | yes |
| `slayer.terminal.last` | `terminal/lastDesk.ts:11` | yes |
| **`slayer_booted_v1`** | **`LaunchTransition.tsx:39`** | **NO** |
| **`slayer_onboarded_v1`** | **`OnboardingOverlay.tsx:8`** | **NO** |
| **`slayer_weigher_recent`** | **`ContractWeigher.tsx:79`** | **NO** |

11 of 14 registered. `slayer_booted_v1` is written unconditionally on the first-ever visit
(`LaunchTransition.tsx:52`, inside the non-reload branch), and `slayer_onboarded_v1` on the first dismissal of
the welcome overlay (`OnboardingOverlay.tsx:41`). So on essentially every returning session the panel
**under-reports by at least 1, typically 2–3**, while claiming to be exhaustive.

`clearAllLocalData()` (`localData.ts:88-107`) scans for the `slayer` prefix and does catch all three, so the
nuclear button is correct. Per-group clear and the count are not.

**Fix:** add the three keys to `LOCAL_DATA_GROUPS` (a `terminal`/`compass` group each). The structural fix — a
single `defineKey()` helper that both declares the key and registers it — is the real answer but is a
behaviour-touching refactor; the three-line data fix is the low-risk one.

---

### F-3 · P1 · `/pinpoint/greeks` headline metrics round to the nearest million
**Gate 62 (duplication) / Gate 12**

`src/pages/gex/GreeksRegime.tsx` declares **two** compact formatters, 15 lines apart:

- `fmtDelta` at `:15-21` — M at **1 dp**
- `fmtC` at `:29-35` — M at **0 dp**

`fmtC` is the one wired to the desk's three headline `StatCard`s — Net gamma, Vanna / +1% IV, Charm to close
(`GreeksRegime.tsx:226, :227, :228`) — and to every cell of the greeks matrix (`:54`). `fmtDelta` is used on a
single hover readout (`:102`).

Measured consequence of 0 dp at the M tier:

- `fmtC(1_450_000)` → `+1M` (true value 1.45M — **31% low**)
- `fmtC(1_499_999)` → `+1M`, `fmtC(1_500_000)` → `+2M` — a 1-unit change flips the readout by a whole million
- Any value in `[24_500_000, 25_499_999]` renders identically as `+25M` — a 1M-wide bucket presented as a point estimate

The desk's three primary numbers are shown at the coarsest precision of any of the nine formatters in F-1,
and the file itself contains a finer one it does not use.

**Fix:** point the three headline `StatCard`s at the 1 dp form. This is a one-token change per call site
(`fmtC` → `fmtDelta`, or give `fmtC` a `dp` argument), and does not touch the matrix cells where 0 dp is
defensible for density.

---

### F-4 · P1 · `useDismiss` is copy-pasted four times; the fourth copy silently dropped Escape
**Gate 62 (duplication) / Gate 12**

`function useDismiss<T extends HTMLElement>(open, onClose)` exists **byte-identically** at:

- `src/pages/flowdesk/LiveTape.tsx:370-388` (19 lines)
- `src/pages/flowdesk/FlowScanner.tsx:215-233` (19 lines)

and is re-implemented inline at:

- `src/components/compass/ContractWeigher.tsx:239-252` (`Popover`) — same logic, same Escape handling
- `src/components/ui/TickerSearch.tsx:48-55` — mousedown only, but Escape is handled separately on the input's
  `onKeyDown` at `TickerSearch.tsx:74`
- **`src/pages/Stocks.tsx:114-121` (`ScopeSelect`) — mousedown only, and there is no Escape handler anywhere
  in the file.** `rg -n "Escape" src/pages/Stocks.tsx` returns **zero matches** across all 811 lines.

**Repro:** `/stocks`, any viewport. Click the "Universe" scope dropdown (`Stocks.tsx:766`). Press `Escape`.
Nothing happens — the popup stays open. Every other dropdown in the app (Columns and Views on `/trace/live-tape`,
Columns/Templates/Presets on `/trace/scanner`, every `Popover` in the Compass weigher) closes on Escape.

Scope is one control on one page — not three, and this is stated exactly rather than inflated. It is still a
keyboard-affordance break in a keyboard-first terminal, and it exists *because* the hook was copied instead of
shared: the copy that landed in `Stocks.tsx` predates the Escape branch that the flowdesk copies grew.

**Fix:** the honest minimum is to add the Escape branch to `Stocks.tsx:114-121`. Promoting the identical
`LiveTape`/`FlowScanner` copies into `src/hooks/useDismiss.ts` removes 19 duplicated lines and prevents the
next divergence; that move is behaviour-neutral because the two are character-for-character the same.

---

### F-5 · P1 · Three lightweight-charts wrappers share 241 redundant lines
**Gate 62 (duplication)**

Measured with `scratchpad/fam.mjs` — normalised (whitespace-collapsed, comment-stripped, >15 chars) line-set
intersection:

| Family | Files | Substantive lines | Distinct lines in 2+ files | Redundant copies | % of family |
|---|---|---|---|---|---|
| lightweight-charts wrappers | `LiquidityHeatmapChart.tsx` (595L), `StrikeChart.tsx` (480L), `SwingMapChart.tsx` (277L) | 771 | 173 | **241** | **31%** |
| canvas series primitives | `flowPillsPrimitive.ts` (167L), `liquidityHeatmapPrimitive.ts` (164L), `gexNodesPrimitive.ts` (118L), `swingPrimitive.ts` (242L) | 445 | 55 | **119** | **27%** |
| section layout shells | `GexLayout` (40L), `FlowDeskLayout` (40L), `CommunityLayout` (58L), `GuideLayout` (38L) | 99 | 17 | **47** | **47%** |
| board pages | `Stocks.tsx` (811L), `EarningsHub.tsx` (976L) | 879 | 59 | **59** | 7% |
| flowdesk tables | `LiveTape.tsx` (1127L), `FlowScanner.tsx` (709L) | 892 | 80 | **80** | 9% |

Pairwise verbatim overlap (`scratchpad/sim.mjs`, % of the smaller file's unique lines found verbatim in the other):

```
LiquidityHeatmapChart ↔ StrikeChart      61%  (210 lines)
StrikeChart           ↔ SwingMapChart    56%  (115 lines)
LiquidityHeatmapChart ↔ SwingMapChart    56%  (115 lines)
GexLayout             ↔ FlowDeskLayout   80%  ( 28 lines)
GexLayout             ↔ CommunityLayout  77%  ( 27 lines)
LiveTape              ↔ FlowScanner      30%  (140 lines)
Stocks                ↔ EarningsHub      23%  (118 lines)
```

Cross-file exact clone groups located by `scratchpad/clones.mjs` (≥8 normalised lines, non-overlapping):

- chart bootstrap: `LiquidityHeatmapChart.tsx:184-194` / `StrikeChart.tsx:152-162` / `SwingMapChart.tsx:78-88`
- resize/container: `LiquidityHeatmapChart.tsx:195-203` / `StrikeChart.tsx:163-171` / `SwingMapChart.tsx:89-96`
- price-range padding: `LiquidityHeatmapChart.tsx:279-287` / `StrikeChart.tsx:210-218`
- label-priority loop: `LiquidityHeatmapChart.tsx:70-78` / `StrikeChart.tsx:74-82`
- FOCUS control block: `LiquidityHeatmapChart.tsx:535-543` / `StrikeChart.tsx:411-419` / `SwingMapChart.tsx:228-236`
  and its button `:567-574` / `:452-459` / `:249-256`
- `BitmapScope` interface, verbatim in all four primitives: `flowPillsPrimitive.ts:11-18`,
  `liquidityHeatmapPrimitive.ts:18-25`, `gexNodesPrimitive.ts:14-21`, `swingPrimitive.ts:13-20`
- candle theme application: `StrikeChart.tsx:190-199` / `SwingMapChart.tsx:114-121`

**Fix:** the *safe* extraction is the pure, presentation-free part only — `BitmapScope`/`DrawTarget` into one
`chartPrimitiveTypes.ts` (32 duplicated lines, zero behaviour), and the price-range padding + label-priority
helpers into a shared module (they are pure functions of their inputs). The chart bootstrap and FOCUS control
should **not** be lifted into a shared `<HouseChart>` in this pass: the three charts pass different series
types and their `useEffect` dependency arrays differ, so a shared shell risks changing mount/teardown ordering
on three live desks. Flag as duplication, defer the extraction.

---

### F-6 · P1 · Five copies of the same sentiment→tone map, and a sixth that disagrees
**Gate 62 (duplication) / Gate 12**

`{ BULLISH: 'bull', BEARISH: 'bear', NEUTRAL: 'neutral' }` is declared five times:

- `src/pages/workspace/registry.tsx:89` `biasTone`
- `src/components/gex/ExposureInsight.tsx:12-16` `biasTone` — same `Record<DealerBias, Tone>` type as above
- `src/pages/flowdesk/FlowScanner.tsx:128-132` `sentTone`
- `src/pages/flowdesk/ScannerRowDrawer.tsx:13-17` `SENT_TONE` — same `Record<FlowSentiment, Tone>` as above
- `src/pages/flowdesk/TapeRowDrawer.tsx:12-16` `SENT_TONE`

A sixth copy has **drifted**: `src/pages/flowdesk/LiveTape.tsx:191-195` `SENT_TEXT` maps
`NEUTRAL → 'text-textMuted'`, bypassing the tone system.

**Measured consequence, same workflow, two clicks apart:**
- LiveTape's Sentiment column (`LiveTape.tsx:303`, `dyn: r => SENT_TEXT[sentimentOf(r)]`) renders `NEUTRAL` in
  `text-textMuted` = **#7d7d7d** (`tailwind.config.ts:49`).
- Clicking that row opens `TapeRowDrawer`, which renders the same value at `:76` as
  `<SignalBadge tone={SENT_TONE[sent]}>` → `toneBadge.neutral` (`components/ui/tones.ts:39`) →
  `text-textSecondary` = **#a3a3a3** (`tailwind.config.ts:48`).

Same print, same field, two greys. Neither is wrong against the house palette (grey = neutral) — but the
divergence is invisible to a palette change made in `tones.ts`, because `SENT_TEXT` is not reading from it.

**Fix:** delete `SENT_TEXT` and have the column's `dyn` return `toneText[SENT_TONE[...]]`. One-line change,
and it re-attaches the column to the palette. Collapsing the five identical maps into one shared
`DIRECTION_TONE` is the follow-on; the two `Record<DealerBias, Tone>` copies are exact duplicates of each
other and can merge with no type friction.

---

### F-7 · P1 · Two `Stat` components bypass the tone system and render values 3px smaller
**Gate 62 (duplication) / Gate 12**

Three components named `Stat`, with two incompatible contracts:

| Site | `tone` type | Value type size | Tile |
|---|---|---|---|
| `src/components/ui/Stat.tsx:27` (shared) | `Tone` union → `toneText[tone]` | `text-data` = **13px** | `inst-surface` |
| `src/components/gex/OrderFlowPanel.tsx:137` | `tone?: string` — raw Tailwind class | `text-micro` = **10px** | none |
| `src/pages/flowdesk/ContractFlowChart.tsx:41` | `tone?: string` — raw Tailwind class | `text-label` = 11px | none |

(Token values from `tailwind.config.ts:96-101`.)

`OrderFlowPanel` is a registered Pulse widget (`workspace/registry.tsx:14, :269`), so on a Pulse desk it sits
beside panels built from the shared `Stat`/`StatCard`. Its five metrics — Buy $, Sell $, Delta, VWAP, POC
(`OrderFlowPanel.tsx:158-162`) — render their **values** at 10px, the same size the rest of the app reserves
for axis ticks and legends, and 23% smaller than the identical class of readout one panel over.

The raw-string `tone` prop also means a palette edit in `tones.ts` reaches the shared `Stat` and not these two:
`OrderFlowPanel.tsx:158` passes the literal `"text-bull"`.

**Fix:** switch both local `Stat`s to the shared one. `OrderFlowPanel`'s five call sites need `tone="bull"`
instead of `tone="text-bull"`; `ContractFlowChart`'s `Stat({k, v})` needs its props renamed to `label`/`value`.
Both are mechanical. The size change from 10px → 13px is a deliberate visible change and should be taken
knowingly, not as a side effect.

---

### F-8 · P2 · `SpotRule` is hand-inlined in GreeksRegime, and the copy lost its `aria-label`
**Gate 62 (duplication)**

`src/components/ui/SpotRule.tsx:11-20` is a shared 10-line component used correctly in 7 places
(`ExposureLedger.tsx:105`, `Fracture.tsx:331`, `DarkPool.tsx:719`, `ExposureMatrix.tsx:74`,
`PositioningMap.tsx:716`, `ContractChain.tsx:173`, `ContractWeigher.tsx:338`).

`src/pages/gex/GreeksRegime.tsx:409-415` re-spells it by hand — 7 lines, same gradient rule, same inverted
price pill. The copy has drifted in three measurable ways:

| | Shared `SpotRule.tsx` | Inline copy `GreeksRegime.tsx:408-415` |
|---|---|---|
| flex gap | `gap-1.5` (line 12) | `gap-2` (line 408) |
| ticker span | `whitespace-nowrap` (line 14) | absent (line 410) |
| price pill | `whitespace-nowrap` (line 15) | absent (line 411) |
| a11y | `aria-label={`${ticker} spot ${price.toFixed(2)}`}` (line 12) | **absent** |

So on `/pinpoint/greeks` the spot marker is announced to a screen reader as the bare ticker followed by a bare
number, with no "spot" relation, while the identical marker on the six other desks announces correctly.
The missing `whitespace-nowrap` also means the ticker/price can wrap inside a narrow matrix column, which the
shared component was written to prevent.

**Fix:** replace `GreeksRegime.tsx:408-415` with `<SpotRule ticker={ticker} price={spot} />`. The wrapping
`<td colSpan={colSpan}>` already provides the block context that `PositioningMap.tsx:713-716` documents as the
one thing `SpotRule` needs.

---

### F-9 · P2 · Four section shells are 66–80% the same file
**Gate 62 (duplication) / Gate 15 (template shape)**

`GexLayout.tsx` (40L) and `FlowDeskLayout.tsx` (40L) are identical except for three string literals and one
import name — 80% verbatim overlap, 28 of 35 lines. `CommunityLayout.tsx` (58L) adds one notice paragraph;
`GuideLayout.tsx` (38L) adds a width cap. The shared `<AnimatePresence>` body block is an exact 8-line clone at
`CommunityLayout.tsx:42-49` / `FlowDeskLayout.tsx:24-31` / `GexLayout.tsx:24-31`.

The copies have **already diverged in layout**, which is what makes this worth reporting rather than tolerating:

| | Gex | FlowDesk | Community | Guide |
|---|---|---|---|---|
| width cap | none | none | none | `max-w-5xl mx-auto` (`:18`) |
| body gap | `gap-4` (`:31`) | `gap-4` (`:31`) | `gap-4` (`:49`) | `gap-7` (`:31`) |
| space above SubNav | none | none | none | `mt-4` (`:20`) |
| space above body | none | none | none | `mt-5` (`:31`) |

Four sections of the same terminal, four different vertical rhythms, from what is meant to be one shell.

Alongside this, the four `subnav.ts` modules each redeclare a structurally identical interface —
`CommunitySubpage` (`community/subnav.ts:6-11`), `FlowDeskSubpage` (`flowdesk/subnav.ts:4-9`),
`GexSubpage` (`gex/subnav.ts:13-18`), `GuideSubpage` (`guide/subnav.ts:4-9`) — all `{path, label, subtitle, icon}`,
none of which is imported anywhere (all four appear in the unused-export list, §Dead code). Meanwhile
`SubNavItem` is exported from `components/ui/SubNav.tsx:7` and imported by nobody.

**Fix:** the interfaces are free to merge — `SubNavItem` already exists and adding `subtitle` to it is
additive. The shell itself can become one `<SectionLayout title breadcrumb pages notice? width?>`, which is a
~96-line reduction; do it only after deciding *deliberately* whether Guide's `max-w-5xl`/`gap-7` is the
intended prose treatment or accidental drift, because collapsing the shells silently picks a winner.

---

### F-10 · P2 · Every desk opens with the same 4–6-tile KPI strip, and 13 of 20 give no tile emphasis
**Gate 15 (template shape)**

`scratchpad/kpi.mjs` walked every `<MetricGrid>` block and counted the `<StatCard>`s inside. **101 StatCards in
20 MetricGrid rows across 19 files** — one row per desk, essentially without exception:

```
LottoBoard.tsx:549          5    EarningsHub.tsx:597         5    ExposureProfile.tsx:127     4
EarningsIntel.tsx:440       6    News.tsx:254                3    GexHistory.tsx:263          5
MetaorderReconstruction:396 5    Stocks.tsx:596              5    GreeksRegime.tsx:224        5
StatePriceDensity.tsx:209   5    Tracker.tsx:660             4    HedgeImpact.tsx:241         5
MarketStateReplay.tsx:254   6    DarkPool.tsx:485            6    ProveIt.tsx:96              6
EdgeLedger.tsx:243          5    FlowScanner.tsx:643         5    Fracture.tsx:284            5
                                 LiveTape.tsx:850            6
```

Median 5, range 3–6. This is the *shape* the brief warns about: the reader arrives at nineteen different
analytical questions and is met by the same horizontal strip of five equal boxes each time.

`StatCard` supports `emphasis` (`StatCard.tsx:13`, `:22` → `inst-emphasis`). **Only 7 of the 20 rows use it**
(`HedgeImpact.tsx:247`, `MarketStateReplay.tsx:260`, `LottoBoard.tsx:550`, `EdgeLedger.tsx:249`,
`StatePriceDensity.tsx:215`, `EarningsIntel.tsx:447`, `ContractWeigher.tsx:1398`). The other 13 render every
tile at identical weight. Verified by reading four of them end-to-end:

- `GexHistory.tsx:263-274` — "Wall band now", "Net GEX", "Flip crosses", "Session range", "Showing as of".
  The last is a *timestamp control readout*, not a metric, and gets the same box as Net GEX.
- `GreeksRegime.tsx:224-230` — "Dealer regime", "Net gamma", "Vanna / +1% IV", "Charm to close",
  "Dominant higher-order". The fifth is a restatement of whichever of the middle three is largest.
- `Stocks.tsx:596-602` — "Strong names", "Weak names", "Breadth", "Strongest sector", "Weakest sector".
- `FlowScanner.tsx:643-664` — "Contracts scanned" (a scope counter) sits at the same weight as
  "Net directional" (the desk's actual read).

**This is a hierarchy finding, not a "delete the tiles" finding.** The tiles carry real numbers and the palette
use is correct. What is missing is that in 13 of 20 rows nothing tells the reader which of the five is the
answer and which four are context.

**Fix:** mark the one tile per row that is the desk's answer with `emphasis` — the prop, the surface treatment
and the precedent already exist in the 7 rows that do it. No new component, no layout change.

One palette note in passing, for the palette gate to arbitrate rather than this one:
`FlowScanner.tsx:663` sets `tone="select"` on "Est ΔOI leader". Per the brief, silver/select is selection and
process state; a ΔOI leader is a market observation, not a selection.

---

### F-11 · P2 · `ColumnChooser` / saved-views duplicated across the two flowdesk tables, with two icons for one control
**Gate 62 (duplication)**

| Concern | LiveTape | FlowScanner | Relationship |
|---|---|---|---|
| `useDismiss` | `:370-388` | `:215-233` | byte-identical (F-4) |
| `ColumnChooser` | `:391-456` (66L) | `:429-490` (62L) | same structure, same checkbox markup, same "Show all" reset |
| saved sets | `SavedViews` `:459-556` | `TemplatesMenu` `:318-427` | same open/name/commit state machine, same name-input footer |
| cols persistence | `:578-600`, `:624-631` | `:520-542`, `:545-551` | same try/catch/JSON.parse/Array.isArray/filter shape |
| set persistence | `:589-600`, `:632-638` | `:531-542`, `:552-557` | same shape |
| toolbar trigger class | inline at `:410` and `:490` | hoisted to `triggerCls` `:235-236` | **identical 173-char string, three copies** |
| name-input class | `:540-549` | `:410-419` | exact 10-line clone |

Measured family cost: **80 redundant lines** across the pair (9% of 892 substantive lines).

The codebase already knows they are copies — `LiveTape.tsx:541-542` carries the comment
*"See FlowScanner: commit() early-returns on an empty name, so an always-enabled Save looked clickable and did
nothing."* — a bug that had to be fixed twice.

Visible divergence from the copying:
- **Two different icons for the same control.** The Columns trigger is `<SlidersHorizontal>` on
  `/trace/live-tape` (`LiveTape.tsx:412`) and `<Grid3x3>` on `/trace/scanner` (`FlowScanner.tsx:446`).
  Same label, same behaviour, adjacent tabs in the same section.
- Popover width `w-64` (`LiveTape.tsx:417`) vs `w-56` (`FlowScanner.tsx:451`).
- LiveTape groups columns under `GROUP_ORDER` headings (`:429-431`); FlowScanner renders a flat list (`:462`).

**Fix:** the safe, self-contained wins are (a) pick one icon, and (b) hoist the 173-char `triggerCls` string
that already exists at `FlowScanner.tsx:235` into a shared module and delete the two inline copies in LiveTape.
Merging `ColumnChooser` itself is a larger change — FlowScanner's has a `locked`/pinned concept
(`FlowScanner.tsx:464, :484`) that LiveTape's has no notion of — and should be deferred rather than forced.

---

### F-12 · P2 · `SESSION_BARS = 390` is declared nine times; one copy is exported and imported by nobody
**Gate 62 (duplication)**

```
src/components/compass/contractTrackModel.ts:53   export const SESSION_BARS = 390;   ← exported, zero importers
src/core/simulator.ts:107                          const SESSION_BARS = 390;         (function-local)
src/data/gradientField.ts:41                       const SESSION_BARS = 390;
src/data/compass.ts:696                            const SESSION_BARS = 390;
src/data/liquidityField.ts:73                      const SESSION_BARS = 390;
src/data/command.ts:115                            const SESSION_BARS = 390;
src/data/gexhistory.ts:46                          const SESSION_BARS = 390;
src/data/pulseflow.ts:69                           const SESSION_BARS = 390;
src/data/netpremium.ts:35                          const SESSION_BARS = 390;
```

The duplication is acknowledged in-source: `contractTrackModel.ts:52` reads
`/** Bars in one session — SESSION_BARS in core/simulator.ts. */`. Four of the nine also carry the same
explanatory comment re-written ("one cash session of 1m bars", "mirrors the simulator", "one 6.5h session of
the store's 1-minute bars").

This is the app's most load-bearing shared assumption — the bar count that ties the simulator, the compass
engine, the gradient/liquidity fields, the command view, GEX history, pulse flow and net premium to the same
clock. Nine independent declarations means a change to session length has nine edit sites and no compiler help.
No current divergence was found: all nine are `390`.

Same pattern at smaller scale — the strike-label formatter `v % 1 === 0 ? v.toFixed(0) : v.toFixed(2)` is
written four times: `contractTrackModel.ts:213` (an exported `strikeLabel` nobody imports),
`ExposureLedger.tsx:51`, `MigrationMap.tsx:58`, `data/compass.ts:524`; plus two more near-copies at
`gex/VannaCharm.tsx:56` and `gex/RankedTargets.tsx:55` as `fmtStrike`, and a divergent one at
`proveit/Surface3D.tsx:75` (`toLocaleString`, `maximumFractionDigits: 1`).

**Fix:** one `SESSION_BARS` in `src/core/` imported by the nine, one `strikeLabel` imported by the six.
Both are pure-value moves with no behaviour surface. Note that `Surface3D.tsx:75` genuinely differs (1 dp,
locale-aware) and should be left alone or converted deliberately, not folded in.

---

### F-13 · P2 · Landing page uses a loading grammar the app explicitly retired
**Gate 62 / Gate 15**

`src/App.tsx:53-55` documents the rule:
*"One loading grammar for the whole app — the Skeleton sheen, not a second animation. `animate-pulse` here was
a third language competing with the launch gate and the skeletons."*

Twelve loading sites obey it via `SkeletonRows` (`App.tsx:58`, `Compass.tsx:599, :602`, `Tracker.tsx:654`,
`ExposureProfile.tsx:80`, `VannaCharm.tsx:232`, `VolLab.tsx:80`, `GammaChart.tsx:66`,
`PulseWorkspace.tsx:1410`, `ScannerRowDrawer.tsx:114`) or `Skeleton` (`Tracker.tsx:650`, `LottoBoard.tsx:603-604`).

Three do not — all on the landing page, the first surface a visitor sees:

- `src/pages/landing/LiveSections.tsx:452` — `h-[430px] … animate-pulse`
- `src/pages/landing/LiveSections.tsx:548` — `h-[340px] … animate-pulse`, ×4 via `Array.from({length: 4})`
- `src/pages/landing/LiveSections.tsx:553` — `h-[440px] … animate-pulse`

That is six pulsing rectangles on first paint using a different animation curve, opacity range and idle colour
than every skeleton behind the launch gate. Reduced motion is handled correctly for all of them
(`src/index.css:431-437` neutralises `.animate-pulse` with `!important`), so this is a consistency finding, not
an accessibility one.

**Fix:** three `<Skeleton className="h-[430px] rounded-lg" />` substitutions. `Skeleton` already accepts the
sizing className (`Skeleton.tsx:11-13`) and is `aria-hidden`, which the raw divs are not.

---

### F-14 · P2 · Six genuinely dead exports; 51 value exports and 128 type exports with no non-test importer
**Gate 62 (dead code)**

`scratchpad/exports.mjs` parsed every `export` in `src` and resolved every import edge (including the dynamic
and registry cases in §0). **184 exports have zero non-test importers** — 128 types/interfaces, 51 values,
26 of which are imported by tests.

Cross-checking each value export against a whole-`src` `rg` for its identifier separates three real categories:

**(a) Genuinely dead — zero references anywhere in `src`, including in-file and including tests (6):**

| Symbol | Site | Note |
|---|---|---|
| `tpStatusTone` | `components/compass/contractTrackModel.ts:34` | a tone map, unused |
| `RAMP_CSS` | `components/experience/surfaceRamps.ts:63` | |
| `SkeletonText` | `components/ui/Skeleton.tsx:16-22` | 7 lines; `SkeletonRows` is the one everything uses |
| `buildContractIntraday` | `data/flowscan.ts:139` | an engine entry point with no caller |
| `bySector` | `data/universe.ts:269` | the only other `bySector` hit in `src` is a local `bySectorCount` at `Stocks.tsx:403` — unrelated |
| `resetTrailerStory` | `pages/trailer/trailerStory.ts:1166-1169` | comment claims "Test/HMR escape hatch"; no test calls it |

**(b) Exported but only used inside their own file — public API that nothing consumes (16 value exports).**
Not dead code, but every one of them is surface area a reader has to consider load-bearing:
`breakevenPrice` + `intrinsicOf` (`contractFacts.ts:45, :50`), `CANDLE_THEMES` + `CANDLE_THEME_KEY`
(`candleTheme.ts:16, :59`), `HEAT_MODE` (`heatmap.ts:36`), `HORIZONS` (`contractScore.ts:60`),
`SCAN_EPOCH_MS` (`scanUniverse.ts:118`), `printExpiryDte` (`earnings.ts:436`), `VOL_REGIMES` (`edgeledger.ts:43`),
`SENTIMENT_CUT` (`news.ts:503`), `STATE_FEATURES` (`statereplay.ts:53`), `GENERATED_POOL` (`rainPool.ts:74`),
`LEGAL_EFFECTIVE` (`LegalLayout.tsx:5`), `collides` (`detach.ts:198`), `PULSE_PANELS` (`pulseRegistry.tsx:140`),
`canPlaceWindows` (`useScreens.ts:39`), `sceneIndexAt` (`useTrailerTimeline.ts:123`),
`TrailerProgress` (`TrailerControls.tsx:48`). Plus a redundant default: `hooks/useScrollSpy.ts:149`
`export default useScrollSpy` — the named export at `:28` is the one `Landing.tsx:22` imports.

**(c) Exported solely so a test can reach them.** Most are legitimate testability seams that *are* also used
in-file (`premiumAtT`, `sessionsForExpiry`, `spotForPremium`, `weighContracts`, `strikeLadder`, `swapCells`,
`prescreenScore`) or documented reset hooks (`resetCompassCache` `compass.ts:944`,
`resetScanUniverse` `scanUniverse.ts:341`). Two are not:

- `storyClockIsMonotonic` (`pages/trailer/useTrailerTimeline.ts:119-122`) — a pure assertion helper with
  **zero** production callers, shipped in the bundle. Only `storyClock.test.ts:27` calls it.
- `CONTRACT_SLEEVES` (`types/compass.ts:107`) — declared as *"Sleeves whose board is a single contract.
  Structures builds multi-leg."* but production does not consult it: the single-vs-multi-leg branch is
  `sleeve === 'structures'` at `Compass.tsx:677` (and `sl.key === 'structures'` at `:666`). Only
  `compassCoherence.test.ts:6` imports the constant. Functionally equivalent today — 5 sleeves, 4 in the list,
  1 is `'structures'` — so this is **not a live bug**; it is a second definition of the same rule that can
  silently disagree when a sixth sleeve is added.

The 128 unused type exports are dominated by view-model shapes in `src/data/**` and `src/types/**` that are
structurally consumed (a function returns `X`, callers infer it) rather than imported by name. That is normal
TypeScript and is not reported as dead code; it is reported as the reason a mechanical "unused exports" count
of 184 overstates the problem by roughly 7×.

**Fix:** delete the six in (a) (≈25 lines). Drop `export` from (b) where nothing outside the file needs it —
that is the change that makes a future dead-code sweep trustworthy. Leave (c) alone except for
`storyClockIsMonotonic`, which belongs in the test file.

---

### F-15 · P2 · Watchlist + compare state duplicated verbatim between Stocks and EarningsHub
**Gate 62 (duplication)**

`src/pages/Stocks.tsx:370-399` and `src/pages/EarningsHub.tsx:372-400` are the same ~30 lines — lazy
`useState` initialiser reading `localStorage`, a persisting `useEffect`, `toggleWatch`, `toggleCompare` — with
only the `WATCHLIST_KEY` constant differing (`'slayer.stocks.watchlist'` at `Stocks.tsx:54` vs
`'slayer.earnings.watchlist'` at `EarningsHub.tsx:50`). Exact clone groups at `Stocks.tsx:377-386` /
`EarningsHub.tsx:379-388` and `Stocks.tsx:164-173` / `EarningsHub.tsx:173-182`.

The two keys being distinct is a deliberate product decision (`localData.ts:20-25` groups them together as
"Stocks and Earnings symbols you follow"), so this is **not** a data-loss bug — stated explicitly because it
would be easy to report it as one.

The duplication cost is 59 redundant lines and one behavioural asymmetry it enabled: `EarningsHub.tsx:366`
has a `watchOnly` filter toggle; `Stocks.tsx` has no equivalent, so a watchlist built on one board can be
filtered to and a watchlist built on the other cannot.

**Fix:** one `useWatchlistSet(key)` hook returning `{set, toggle}`. Behaviour-identical, removes ~30 lines
from each page, and makes the `watchOnly` gap visible rather than accidental.

---

### F-16 · P2 · Six equal-width grids, four justified and two not
**Gate 15 (template shape)**

246 `grid-cols-*` occurrences across `src`. The distribution is **healthier than the gate expects**, and that
is worth saying plainly:

```
grid-cols-1  63    xl:grid-cols-12  21    grid-cols-4  12    lg:grid-cols-2  8
grid-cols-2  32    grid-cols-3      16    sm:grid-cols-4 11   sm:grid-cols-3  9
```

The 21 `xl:grid-cols-12` blocks are the app's main desk layout and are **genuinely asymmetric**: the span
distribution is 7/5 (16 each), 8/4 (3 each), 6 (3). Verified at `Compass.tsx:598/:601` (7+5),
`Compass.tsx:820/:863` (7+5), `Tracker.tsx:692/:762` (8+4), `Fracture.tsx:317/:347` (7+5),
`EarningsIntel.tsx:483/:503, :532/:568` (7+5). No case of `grid-cols-12` with equal spans was found.
**No nested `<Panel>` inside a `<Panel>` anywhere in `src`** (`scratchpad/panels.mjs`, 147 Panel instances,
0 nested) — so the "bordered card around every subsection" pattern is not present.

Of the wide equal-width grids, judged against whether the children are peer-level:

**Justified:**
- `components/gex/StatePriceDensity.tsx:370` — 6 cells, a mirrored down/up triplet (probability / insurance
  cost / strike). Genuinely peer-level pairs; equal width *is* the comparison.
- `components/gex/vollab/RegimePanel.tsx:107` — 5 cells rendered from a `stats` array of uniform shape.
- `pages/StockDetailDrawer.tsx:130` — Reports / Sessions out / Implied / Modeled avg: four facts of the same
  earnings event at the same altitude.
- `pages/StockDetailDrawer.tsx:98` — P up / 1d / 5d / Conf: four outputs of one prediction.

**Not justified:**
- `components/flowdesk/MetaorderReconstruction.tsx:275-281` — `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`
  over 6 `<Stat>`s. "Inferred total" (`fmtUsd(m.estTotalUsd)`, line 276) is the metaorder engine's central
  claim — the dollar size of the parent order it believes it has reconstructed. It gets the same cell width
  and the same type size as "Ask-lift" (`${m.askPct.toFixed(0)}%`, line 280), a two-digit diagnostic. Six peers
  where there is one headline and five supports.
- `components/gex/OrderFlowPanel.tsx:157-163` — `grid-cols-5`. Buy $ / Sell $ / Delta are dollar notionals;
  VWAP / POC are **prices in dollars per share**. Two unit systems at identical weight with nothing marking
  the change, and Delta (the derived read) is not distinguished from Buy/Sell (its inputs). Compounded by F-7:
  all five values render at 10px.

**Fix:** in both cases the change is emphasis, not layout — give the headline cell a larger type step or a
`col-span-2` and let the rest stay equal. Neither needs a new component.

---

### F-17 · P3 · Glassmorphism and gradient audit — checked, and the app is clean
**Gate 15**

Reported as a measurement because the gate asks for it and the honest answer is "not a problem here":

**`backdrop-blur`: 8 occurrences, all legitimate scrims or sticky-header washes**, zero on data surfaces:
`StockDetailDrawer.tsx:289` and `SettingsPanel.tsx:89` and `DrilldownDrawer.tsx:81` (sticky drawer headers over
scrolling content), `ShortcutsOverlay.tsx:37`, `CommandPalette.tsx:161`, `OnboardingOverlay.tsx:67`,
`FocusLayer.tsx:31` (modal backdrops over `bg-black/60`–`/80`), `Toast.tsx:122` (floating toast).

**The `.glass` class (`index.css:141-155`) is used 4 times, all navigation chrome** — `Landing.tsx:142`
(landing header), `TopBar.tsx:124` (app top bar), `TopBar.tsx:259` (mobile menu), `SubNav.tsx:101` (sub-tab
bar). The CSS comment declares it *"Reserved for navigation surfaces, never data panels"* and the code obeys
that: zero `<Panel>`, `<StatCard>` or `<Stat>` uses it. It also degrades under
`prefers-reduced-transparency: reduce` (`index.css:150-155`).

**38 gradient occurrences**, of which 11 are in `components/gex/heatmap.ts` (data-encoding colour ramps),
6 in `index.css` (surface sheens and the skeleton sweep), 4 in `surfaceRamps.ts`, 3 in `SubNav.tsx:93-97`
(a `mask-image` scroll-fade, not a fill), and the remainder are chart/SVG defs. The only decorative ones are
the three vignettes on the landing hero (`Landing.tsx:247, :252, :254`). No gradient blobs, no neon, no
particles, no glass on data.

The one gradient worth an entry is the duplicated one covered in F-8:
`h-px flex-grow bg-gradient-to-r from-textPrimary/10 via-textPrimary/40 to-textPrimary/50` appears at
`components/ui/SpotRule.tsx:13` and again, hand-copied, at `pages/gex/GreeksRegime.tsx:410`.

---

### F-18 · P3 · God components — 19 files over 600 lines carry 27.5% of non-test source
**Gate 62**

| LOC | File | Main component starts | Hooks in the top-level component |
|---|---|---|---|
| 1944 | `src/pages/pulse/PulseWorkspace.tsx` | `:720` → **1224-line component** | 22 `useState`, 12 `useEffect`, 8 `useRef` |
| 1572 | `src/components/compass/ContractWeigher.tsx` | `:404` → 1168-line component | 12 / 9 / 6, 22 `useMemo` |
| 1176 | `src/pages/trailer/trailerStory.ts` | data module | — |
| 1132 | `src/data/compass.ts` | data module | — |
| 1127 | `src/pages/flowdesk/LiveTape.tsx` | `:559` → 568-line component | 22 / 11 / 12 |
| 976 | `src/pages/EarningsHub.tsx` | `:362` | 10 / 3 / 0 |
| 921 | `src/pages/Compass.tsx` | `:157` | 14 / 4 / 3 |
| 821 | `src/components/gex/PositioningMap.tsx` | — | 8 / 2 / 4, 15 `useMemo` |
| 820 | `src/components/compass/LottoBoard.tsx` | — | 6 / 3 / 0 |
| 811 | `src/pages/Stocks.tsx` | — | 13 / 3 / 2 |
| 799 | `src/pages/flowdesk/DarkPool.tsx` | — | 7 / 0 / 0 |
| 791 | `src/pages/Tracker.tsx` | — | 5 / 2 / 0 |
| 715 | `src/core/simulator.ts` | engine | — |
| 709 | `src/pages/flowdesk/FlowScanner.tsx` | — | — |
| 682 | `src/pages/landing/LiveSections.tsx` | — | — |
| 641 | `src/components/compass/contractTrackModel.ts` | model | — |
| 639 | `src/components/earnings/EarningsIntel.tsx` | — | 9 `<Panel>`, 8 `<StatCard>` |
| 626 | `src/pages/StockDetailDrawer.tsx` | — | — |
| 621 | `src/pages/News.tsx` | — | — |

19 files > 600L = 17,523 LOC = **27.5%** of non-test source. 29 files > 500L = **36.1%**.

**Extraction seams that already exist, observed rather than invented.** `PulseWorkspace` is internally
sectioned by comment banners at `:744` (out-of-grid panels), `:791` (keyboard shortcuts), `:824` (data
cadence), `:881` (mutations), `:1020` (docked ⇄ detached ⇄ popped out), `:1277` (workspace-level ops),
`:1343` (derived placement), `:1389` (add-panel search). Those eight sections are the file's own account of
its concerns.

**No refactor is proposed here.** The two largest are the two most stateful — `PulseWorkspace` coordinates 22
pieces of state across a react-grid-layout instance, detached windows, and OS pop-outs whose lifecycle is
tracked in a ref that is deliberately not persisted (`:745-748`); `ContractWeigher` runs 22 `useMemo`s whose
recompute ordering is what keeps the ladder stable during a 10s reprice (`:88 REPRICE_MS`). Splitting either
along the comment banners means lifting state through props or context, which changes render timing on
`/pulse` and `/compass`. That is not an audit-phase change. What *is* safely liftable, and is already
duplicated elsewhere, is covered by F-4 (`useDismiss` out of LiveTape/FlowScanner) and F-11 (`triggerCls`) —
those are pure and identical, so they carry no behavioural risk.

---

## Summary table

| ID | Sev | Gate | Finding |
|---|---|---|---|
| F-1 | P0 | 62/12 | 9 compact-USD formatters disagree; `/pinpoint/stress` shows $1.45M as `$1.4M` and `$1M` one toggle apart |
| F-2 | P0 | 62 | Settings "N items stored" under-reports — 3 of 14 localStorage keys missing from `LOCAL_DATA_GROUPS` |
| F-3 | P1 | 62/12 | `/pinpoint/greeks` headline StatCards use 0 dp `fmtC` — 1.45M renders `+1M` |
| F-4 | P1 | 62/12 | `useDismiss` copied 4×; the `Stocks.tsx` copy has no Escape handler |
| F-5 | P1 | 62 | 3 chart wrappers share 241 redundant lines (31% of the family) |
| F-6 | P1 | 62/12 | 5 copies of the direction→tone map + a 6th that renders NEUTRAL a different grey |
| F-7 | P1 | 62/12 | 2 local `Stat` components bypass `tones.ts` and render values at 10px vs 13px |
| F-8 | P2 | 62 | `SpotRule` hand-inlined in GreeksRegime; copy lost its `aria-label` and `whitespace-nowrap` |
| F-9 | P2 | 62/15 | 4 section shells 66–80% identical, already diverged in gap/width |
| F-10 | P2 | 15 | 20 MetricGrid rows of 4–6 tiles; 13 give no tile `emphasis` |
| F-11 | P2 | 62 | ColumnChooser/saved-views duplicated; 2 icons for the same Columns control |
| F-12 | P2 | 62 | `SESSION_BARS = 390` declared 9×; `strikeLabel` written 4× |
| F-13 | P2 | 62/15 | Landing uses `animate-pulse` — the loading grammar `App.tsx:53` says was retired |
| F-14 | P2 | 62 | 6 genuinely dead exports; 51 value exports with no non-test importer |
| F-15 | P2 | 62 | Watchlist/compare state duplicated verbatim across Stocks and EarningsHub |
| F-16 | P2 | 15 | 2 of 6 wide equal-width grids put a headline at footnote weight |
| F-17 | P3 | 15 | Glass/gradient audit — clean; `.glass` is nav-only, backdrop-blur is scrims only |
| F-18 | P3 | 62 | 19 files > 600L = 27.5% of non-test source; seams noted, no refactor proposed |

---

## Not audited / could not verify

1. **Runtime duplication.** Everything here is static analysis. No dev server was started, no route rendered,
   no screenshot taken. F-1's `/pinpoint/stress` divergence and F-4's Escape repro are derived from reading
   `desks.tsx:93-94` and `Stocks.tsx` respectively, and from executing the transcribed formatters in isolation —
   **they were not observed in a browser.**
2. **Knip / jscpd were not run** (not installed, and installing was out of scope). If a machine-checked
   duplication and dead-export baseline is wanted in CI, both are justified: Knip would replace §0's manual
   dynamic-import/registry reasoning with a maintained resolver, and jscpd would catch the token-level clones
   this report's line-level detector misses (renamed variables defeat it — the LiveTape/FlowScanner
   `ColumnChooser` pair scored only 30% because `c.id`/`ALL_COLS` vs `c.key`/`COL_META` differ, when the
   structures are 1:1). **Neither was installed.**
3. **The 128 unused type exports were not individually adjudicated.** They were classified in aggregate as
   structurally-consumed view models. A per-symbol pass would need `tsc`'s symbol table, not `rg`.
4. **My export parser is regex-based.** It handles `export const/function/class/interface/type/enum`,
   `export default`, and `export { a as b }`. It does **not** handle `export * from`, multi-line
   `export {` blocks, or declaration merging. `rg -n "export \*" src` returns nothing, and no barrel files
   exist, so the first gap is empty in this codebase; the other two could hide a small number of exports.
   Every symbol reported as dead in F-14 was re-verified by a whole-`src` `rg` for its identifier.
5. **`_shots.mjs` and `scripts/` were not audited** — outside `src`.
6. **CSS-level duplication in `src/index.css` was only spot-checked** (the surface/glass/skeleton block,
   lines 95–240). A full pass over the stylesheet's 400+ lines for repeated rules was not done.
7. **No claim is made about bundle-size impact** of the dead code in F-14. The six dead exports are small
   (≈25 lines) but tree-shaking behaviour was not measured — no build was run.
