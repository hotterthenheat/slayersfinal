# 00 — The one-of-one design thesis

**Gates 9, 10, 11, 14, 15, 16, 17, 18, 24, 25** · Slayer Terminal · written 2026-08-03 against the audit in
`docs/audit64/01`–`10`.

This is a working spec, not a pitch. Every rule below is either (a) a measurement carried forward from the
audit, or (b) a budget expressed as a number that a script can check. Where a rule contradicts something
shipped today, the shipped file:line is named.

Prerequisite reading: `03-visual-dna.md` (the identity that exists), `04-metric-dictionary.md` (what the
terminal actually knows).

---

## 1. What Slayer looks like today, and which of it is load-bearing

`03-visual-dna.md` §10 lists eleven distinctive traits. Not all eleven are structural. Sorted by whether
removing the trait would change what the terminal *is*, or only how it is decorated.

### 1.1 Load-bearing — the redesign may not touch these

| Trait | The measurement | Why it is structural |
|---|---|---|
| **Mono is the interface, not an accent** | 2104 / 2295 rendered text nodes (91.7 %) are JetBrains Mono; `font-mono` 1517 static sites vs `font-sans` 2 | Every column in this app is a number that must align. `tnum` at 629 sites only works because the face is mono everywhere. Moving to a sans base breaks 629 columns. |
| **10–12 px is the body size** | 96.7 % of 2295 rendered text nodes | Density is the product. `/stocks` puts 192 rows × 9 columns on one screen; `/trace/dark-pool` 240 × 13. At a 14 px base neither board fits. |
| **Three greys carry 80 % of the ink** | 14 distinct rendered text colours across six desks | Colour is a scarce resource spent on data. This is what makes a single `text-bull` mean something. |
| **Border-led elevation, zero ambient shadow** | `canvas→panel` 1.029:1, `panel→panelRaised` 1.012:1; `shadow-overlay` never painted at rest across six desks; nothing thicker than 1 px | There is no headroom left in the surface ramp. Hierarchy has to come from border tone, the bevel, type and space. See §9. |
| **The machined bevel** (`.inst-surface`, `index.css:132-138`) | `border-top #333` over `#1c1c1c` sides + `inset 0 1px 0 rgba(255,255,255,.03)` + a 2.5 % top wash; 92 call sites | Light comes from above and a panel is a milled plate. This is the single most recognisable *surface* decision in the app and it costs nothing at rest. |
| **One motion hand** | 281 elements, one recipe: `0.12s cubic-bezier(0.16,1,0.3,1)`; 0 `duration-*` utilities; 0 raw seconds | See §6. A second easing curve would be visible immediately. |
| **Holo-silver is selection, never data** | `.data-bar` = flat `rgba(237,237,237,.45)`, 20 sites, written into `index.css:84-88` precisely to stop score bars wearing the nav-tab treatment | This is the house rule the whole palette hangs off. |
| **`.rail-*` + `aria-current` selection grammar** | one shape (`inset 2px 0 0 0`), five tones, `interactiveRow.ts:44-51` | Selection is a 2 px edge, not a fill. It survives at 10 px type where a fill does not (`.inst-selected` measures 1.085:1 as a fill — the rail is what you actually see). |
| **Gold / blue dealer-gamma axis** | `SHORT_GAMMA #E0B84E` / `LONG_GAMMA #5EA0EF`, `palette.ts:31-43`, 21 sites | A structural dimension deliberately kept out of green/red so a positioning map can never be read as a P&L map. Nothing else in the industry does this. |
| **`Term` in-place jargon explainers** | dotted underline, keyboard-focusable, portaled card | A 10 px dense terminal is unusable without it. It is the reason the density budget in §7 is affordable. |
| **`tnum` at 629 sites + `SpotRule`'s inverted price pill** | 6 identical `rounded-[3px]` sites | Terminal signatures. Cheap, distinctive, already consistent. |

### 1.2 Distinctive but not load-bearing — may change if there is a reason

`cursor-blink` at `steps(1)` (4 sites). The `> slayer_terminal` `.holo-text` lockup. `.glass` nav
(`blur(20px) saturate(180%)`, 4 sites, explicitly "iOS-26 feel" in-file — the most fashion-dependent thing
in the system).

### 1.3 Generic — carries no identity cost

`03-visual-dna.md` §10 G1–G8: the four-map tone shape, `SignalBadge` geometry, `rounded-md` as the panel
radius, the `EmptyState` centred-icon layout, the `SegmentedControl` sliding pill, the Tailwind default
radius scale, `skeleton-sweep`.

### 1.4 The identity currently has one hole in it

The repo ships **two contradictory canonical tone rules**. `setupState.ts:67-72` forbids green/red on any
process state. `docs/DESIGN.md:82` defines `bull` as "Up / support / **success**". Compass obeys the strict
one; Tracker, News, Fracture, Toast, Prove It and Pinpoint obey the loose one. The measured result:
`/tracker` renders a 52 % win rate in bull green (`EdgeLedger.tsx:255`), `/prove-it` draws a 47 %-hit-rate
engine's sparkline green six lines below a comment forbidding it (`ProveIt.tsx:216-224`), and
`/pinpoint/levels` labels the book's largest short-gamma strike a green `DOWNSIDE CUSHION`
(`rankedtargets.ts:101`).

**`setupState.ts:67-72` is the canonical rule. `DESIGN.md:82` is the drift.** Everything in this thesis
assumes the strict rule. Green and red are the market's own language — a call, a put, a price that moved,
money made. Model quality, selection, confidence, freshness, urgency, rank movement, coverage and
lifecycle take silver / amber / grey.

---

## 2. Structurally different from a dashboard — and where it currently is not

### 2.1 Where it genuinely is different

| Property | Evidence it is real |
|---|---|
| **No card around every subsection** | 147 `<Panel>` instances, **0** nested inside another Panel (`06`, F-16). |
| **No equal-width grids at page level** | All 21 `xl:grid-cols-12` blocks are 7/5 or 8/4. **No 12-col block with equal spans exists.** Pulse's default preset is 8/4 (`presets.ts:137-141`). |
| **No glass on data** | `.glass` at exactly 4 sites, all navigation chrome. 8 `backdrop-blur` sites, all scrims or sticky headers. Zero on `<Panel>`, `<StatCard>`, `<Stat>`. |
| **No gradient decoration** | 38 gradient occurrences; 11 are data-encoding colour ramps in `heatmap.ts`, 3 are a SubNav scroll mask, 3 are landing-hero vignettes. Zero blobs. |
| **Two clocks, stated** | 1.5 s tick (`MarketDataContext.tsx:39`) vs 10 s sweep (`SCAN_EPOCH_MS`, `scanUniverse.ts:118`), with a component (`Freshness.tsx`) written to say which one a number is on. |
| **A refusal grammar exists** | `ContractWeigher`'s NOT PRICEABLE, `DataUnavailablePanel` (`pulseRegistry.tsx:110,121,132`) naming the feed it lacks rather than faking it. `quant.ts:130-164` documents *deleting* four fabricated scoreboard rows. |

### 2.2 Where it currently is a dashboard

Stated plainly, because the thesis has to fix these rather than assume them away.

1. **Thirteen of twenty desks open with an interchangeable 4–6 tile KPI strip.** 101 `StatCard`s in 20
   `MetricGrid` rows across 19 files; median 5, range 3–6; only 7 of 20 rows mark any tile `emphasis`
   (`06`, F-10). Four consecutive Trace desks are visually identical for their first ~130 px (`10-desk-pulse-trace`, G45-P3-1).
   Eight of twelve Pinpoint/Prove It views do the same (`10-desk-pinpoint-proveit`, D-30).
2. **The flagship desk has no typographic hierarchy at all.** `/pulse`: 790 text nodes, largest *visible*
   text 13 px, 97.2 % at 10–11 px. Ten panels, no dominant object; the one genuinely distinctive object
   (the Liquidity Map, built from bars + `KeyLevels` + chain OI + GEX nodes + dark-pool shelf notionals,
   `registry.tsx:190-206`) is panel ten of ten at y=2176 on a 2841 px page.
3. **Desks do not hand off.** `AppShell.tsx:108` double-mounts the destination on every cross-section
   navigation; `Compass.tsx:243` and `PulseWorkspace.tsx:778` destroy `location.state` before mount #2, so
   "Monitor SPY 505C" shows the right contract for ~190 ms and then collapses to a generic feed. Pulse has
   **zero** outbound cross-desk affordances; Pinpoint has **zero** paths to Compass.
4. **The same word means different quantities one tab click apart.** "IV Rank" is three independent hashes
   (MSFT: 16 / 70 / 96). "Expected move" differs 7.9× between two `?view=` branches of one desk. One QQQ
   contract carries two mids in one tab strip (2.08×). Four Pinpoint desks give four different answers to
   "which way are dealers hedged".
5. **The terminal cannot say the market is shut.** `marketClock()` computes the phase correctly
   (`calendar.ts:279-291`) and it renders as a `title=` attribute on the clock and nowhere else. On a faked
   Saturday, 16 of 17 desks are byte-identical to a Monday, and Dark Pool still prints
   "OFF-EXCHANGE SHARE 50.9 % — of today's volume".

Items 1–2 are what this thesis fixes with layout (§7, §8). Items 3–5 are what it fixes with the state
model (§3) and the anchors (§8).

---

## 3. How market state travels across desks

Today there are two shared contexts and one broken channel.

```
MarketDataContext.tsx   TickerContext   { activeTicker, changeTicker }   — no cadence, stable identity
                        SnapshotContext { MarketSnapshot }               — republished every 1500 ms
FocusContext.tsx        { focusedId, overlayEl, focus, close }           — one panel focused app-wide
TrackerContext.tsx      { trackedSetups, … }                            — persisted book
react-router location.state                                             — DESTROYED before it is read
```

The split in `MarketDataContext.tsx:12-19` is correct and measured working (`memo(SetupScanBoard)` holds at
2.0 fiber clones/instance against 14.5 for the live tier). The gap is that **there is no shared object for
the things every desk must agree on**, and the one channel that carries a user's intent between desks is
wiped by `window.history.replaceState({}, '')`.

### 3.1 The third context: `RegimeContext`

Add one context beside the two that already live in `MarketDataContext.tsx`. It publishes on the **sweep**
clock (`SCAN_EPOCH_MS = 10_000`, `scanUniverse.ts:118`), not the tick — because everything in it is a
structural read, and republishing it at 1.5 s would put 10 desks back on the live tier for no reason.

```ts
interface Regime {
  phase:      MarketPhase;   // calendar.ts:219 — 'pre'|'open'|'after'|'closed'|'weekend'|'holiday'
  phaseLabel: string;        // calendar.ts:247 PHASE_LABEL — already written, rendered nowhere
  dealerBias: DealerBias;    // ONE function, ONE constant (see 3.2)
  levels:     KeyLevels;     // gex.ts buildLevels — callWall, putWall, flip, king, pin(10)
  spot:       number;
  sweptAt:    number;        // epoch ms of the sweep these values came from
  coverage:   CoverageTier;  // scanUniverse.ts:105 — for the active ticker
}
```

Consumers: `useRegime()`. Every desk header reads `phase`, `phaseLabel` and `sweptAt`. Every desk that
draws a strike axis reads `levels`. Nothing else may recompute these.

**What this fixes, measurably:**

- **Market closed.** 16 of 17 desks currently render identically on a Saturday. With `phase` in the shell,
  the phase word is visible text on every desk, and three session-scoped claims — Dark Pool
  "of today's volume", Live Tape "session premium / prints on tape", Flow Scanner "contracts scanned" —
  gate on `phase === 'open'` and otherwise use the wording `LottoBoard.tsx:660` already ships
  ("WEEKEND, CLOSED · THESE PRICE THE NEXT SESSION").
- **Dealer sign.** `/pinpoint/gamma` says `+$394.8M LONG GAMMA`, `/pinpoint/greeks` says `−95M short`,
  `/pinpoint/levels` says `NEUTRAL`, `/pinpoint/stress` says "dealers are short gamma", `/pinpoint/history`
  says `−$104.2M` — same ticker, same minute, in-app navigation only. All five read `regime.dealerBias` and
  `regime.levels`. `GammaChart.tsx:72` and `ComplexBoard.tsx:52` stop deriving a badge from a windowed sum.
- **Freshness.** `Freshness.tsx` currently has 5 call sites, all in `Compass.tsx`, while four other desks on
  the same 10 s clock render a plain muted `scan hh:mm:ss · 10s` string and twenty views render nothing.
  With `sweptAt` in the context, `Freshness` moves to `components/ui/` and every desk header carries it.

### 3.2 One name, one function

The context is only worth having if the values in it are single-sourced. Three collapses, in this order:

| Quantity | Today | After |
|---|---|---|
| Dealer bias | `exposure.ts:124` cuts at 0.6×max\|netGex\|; `command.ts:241` cuts at 0.8×. 13 of 192 names disagree, both render on `/pulse`. | One `dealerBias(snapshot)` exported from `data/gex.ts` beside `buildLevels`. One constant. |
| Pin | `gex.ts:108` takes `half`; `exposure.ts:72` passes the panel's own toggle (10 \| 15), three other callers hardcode 10. 5 of 192 names land on different strikes. | `regime.levels.pin` is always `half=10`. A panel that widens its window captions its own bar scaling "window Σ", never the PIN marker. |
| Session day / clock | `dayKey()` (`rng.ts:41`) and every panel timestamp use the browser's local clock while the header is labelled ET. Measured: an 11-hour disagreement in Asia/Tokyo; in UTC the Earnings desk declares a print already reporting 31 min before its own target; in Tokyo the whole earnings slate rolls to a different company on a different date. | One `nowET()` / `fmtEt()` exported from `core/calendar.ts` (which already owns the ET `Intl.DateTimeFormat` at `:236`). Twelve call sites route through it. |

### 3.3 Intent travels in the URL, never in `location.state`

The handoff bug is one rule broken in two places. `Compass.tsx:243`, `:251`, `:257` and
`PulseWorkspace.tsx:778` read `location.state` on mount and immediately call
`window.history.replaceState({}, '')`. `AppShell.tsx:108`'s `AnimatePresence mode="wait"` then mounts the
destination a second time (proved by DOM node identity: `main > div` nodeIds `[0]` at 132 ms, `[1]` at
1020 ms, both rendering Compass), and mount #2 finds nothing. The measured cost is two P0s: the wrong
contract, and a 0DTE Lotto grade for a request that said `horizon="SWINGS"`.

**Rule.** Anything a second mount must re-derive lives in `searchParams`. `?view=` and `?sleeve=` already
survive; `?ticker=`, `?monitor=SPY-505-C` and `?horizon=SWINGS` must too. `location.state` is for transient
UI only, and is consumed with `navigate(pathname + search, { replace: true, state: null })` so react-router
keeps ownership of its own history object (today `history.state.idx` measures `NaN` after a handoff).

Second-order benefit this pays for immediately: a handoff URL becomes bookmarkable. Today
`/compass?view=weigher` reached from Stocks(SBUX) reloads as SPY, at the same address, with no notice.

### 3.4 The existing components that carry it

No new navigation component is needed. `TickerJump` (`ui/TickerJump.tsx`) already routes
Pulse / Weigh / Pinpoint off `useTickerNav`, and `CrossDeskLinks` already exists for the Trace drawers.
Pulse needs the mirror of `TickerJump` (it has zero outbound links today — measured: `main` anchors are the
three legal links). Pinpoint's Levels selected-strike row already holds ticker and strike, so it can host
`CrossDeskLinks` unchanged.

---

## 4. Evidence, uncertainty, and how the interface says NO

### 4.1 Evidence accumulates along a rail, not into a new card

The audit's clearest structural finding is that this terminal *has* accumulating evidence and does not draw
it. Three measured cases:

- `/trace/live-tape` renders **400 structurally identical rows**. On one rendered window SPY 507P appears
  twice, SPY 502P twice, QQQ 444P three times — with nothing joining them. The grouping key already exists
  (`pulseflow.ts:182` `contractKey`) and the totals already exist (`summarizeTape`).
- Compass's Weigher rail grades **17 listed strikes** with the same `weighContract`, and the desk's headline
  claim ("Nothing in the Lotto sleeve beats this") is computed against **4** %-offset candidates instead,
  which is why it is false against the rail 400 px to its right.
- `/trace/scanner`'s anomaly axis is frozen for the day: **44 of 44 contracts** kept identical Vol/OI,
  Conviction and Read across 45 s.

**Rule.** Repetition is the evidence. When the same object appears twice, the second appearance thickens the
first — it does not spawn a row, a card or a badge. The house already owns the shape: `.rail-*`
(`inset 2px 0 0 0`, five tones) and `.data-bar` (flat 45 % white, magnitude from length). A contract that has
printed five times has a rail whose weight is its share of `summary.totalPremium`; a strike that has been
retested five times has a shelf whose rail is `retestsByShelf` (`darkpool.ts:72-93`, which already reads real
`priceHistory`).

**Rule.** An accumulator must be monotone within a session, or it is not an accumulator. Measured
counter-example: Dark Pool shelf 1 went "2× held" → "5+ held" while shelf 3 went "4× held" → "3× held" in
40 seconds, and all six shelf prices moved *up* while spot moved *down* $0.13. Shelves must be derived from
the prints and anchored on `dayKey()`, not on the live `[lo,hi]`.

### 4.2 Uncertainty is printed where the model has it, and nowhere else

Three tiers, applied by provenance (the vocabulary already exists in `04-metric-dictionary.md` §1: observed
/ modeled / inferred / simulated).

| Tier | Rendering | Example |
|---|---|---|
| **Monte Carlo** — the model holds a sample | value **± half-interval**, and the run count on the same card | Cascade probability is 500 paths (`fracture.ts:40,204`) with binomial SE ≈ 2.2 pp, rendered as a bare integer, and `Fracture.tsx:292` colours it at 30 % and 55 % — **both thresholds sit inside ~1.5 SE**. Print `34 % ± 2` and carry "500 feedback paths" onto the StatCard. `buildCascade` already holds every terminus. Same for `quant.ts` prob-up (1200 paths, SE ≈ 1.4 pp) and VaR 95 (a 5th-percentile order statistic, materially wider, currently shown with no `n` at all). |
| **Counted** — an `n` exists | value **+ `n=`** | `ProveIt.tsx:219-222` already does this. It is the standard. |
| **Analytic / heuristic** — no distribution | value **+ the assumption that produced it**, no ± | `StructureBoard.tsx:187-189` states its lognormal *and* names what it excludes ("assignment and early exercise are not modelled"). It is used once and should be used everywhere. |

**Rule.** A number that is a hash gets a provenance mark or it does not ship. The failure mode is measured
and specific: `darkpool.ts:397` is `hRange(seed, 34, 52)` with a comment saying "a modelled session share,
not a measured one", rendered under the caption "of today's volume printed away from the lit book" — the
only caption on that grid making a measurement claim. `/stocks` is worse: **zero** occurrences of MODELED,
modeled, generated or simulated in its rendered body, beside 192 prices to the cent, a per-name beta, a
"Fundamental screen — margins, growth and balance-sheet health" score that is `hRange(25,94)`, and $32.5B of
off-exchange notional.

**Rule.** A threshold colour may not sit inside its own value's sampling error. If it does, either widen the
band or drop the colour and keep the number.

### 4.3 How the interface says NO

Four refusals, in increasing severity. Each has a template and an existing exemplar.

| Refusal | Means | Template | Exemplar / counter-example |
|---|---|---|---|
| **UNAVAILABLE** | the input does not exist in this product | name the feed, do not draw the panel | `DataUnavailablePanel` (`pulseRegistry.tsx:110,121,132`) — "requires streaming Level-2 order-book depth". Correct today. |
| **NOT PRICEABLE / NO TRADE** | the input exists, the model declines | **name the predicate that failed and its measured value against the threshold** | `ContractWeigher`'s NOT PRICEABLE is the house standard. `fracture.ts:278` is the counter-example: it states a disjunction of two of three possible failures, names no threshold, prints none of `absorptionPct / growthZ / displacementZ / reversalRisk` — all four of which it already returns at `:282-294`. Fix: "absorption 68 % against the 55 % ceiling". |
| **EMPTY** | the query returned nothing | **name the active filters from state, and offer to clear them** | `Ideas.tsx:425-433` splits its two conditions correctly. `DarkPool.tsx:589` names three filters, none of which caused the emptiness (reached by typing in a fourth, the free-text box). `LiveTape.tsx:1055` collapses "no prints yet" and "filtered to nothing" into one node with no body on either branch. `DataTable.tsx:58` defaults four call sites to the literal `No data`. |
| **STALE / HELD** | the number is real but old | the age, against a named max | `Freshness.tsx` `kind="held"` exists, has **zero call sites**, and never fired across a 70 s / 7-sweep hold. **No staleness threshold of any kind exists in the codebase for any data type.** Each data class gets one named max-age beside its cadence: quote 3 s, sweep 12 s, news 30 min, earnings per-session. |

**Rule.** A refusal never renders as an absence. 14 implemented states are currently unreachable by normal
interaction, including both error boundaries and Compass's only empty state (28 board configurations,
smallest board 160 rows). A branch that cannot fire is deleted, not kept for reassurance.

---

## 5. Model quality is never bullish — the palette contract

Restated as a lookup, because six audits found the same class of violation independently.

| Quantity class | Tone | Never |
|---|---|---|
| Price direction, call/put instrument class, realised P&L, money made | `bull` / `bear` | — |
| Dealer gamma sign | `longGamma` #5EA0EF / `shortGamma` #E0B84E | not green/red — `GammaChart.tsx:82,88`, `ComplexBoard.tsx:91,94`, `GreeksRegime.tsx:226`, `Surface3D.tsx:169-174` currently break this while `PositioningMap.tsx` obeys it |
| Selection, lifecycle, verdict, freshness, coverage, rank movement, model quality, hit rate, calibration error, out-of-sample stability, analog match, regime probability, variance risk premium, confidence | `select` / `neutral` | never `bull`. Violations measured at `EdgeLedger.tsx:255,261,267,273,375`, `ProveIt.tsx:224` (via `Sparkline.tsx:26`), `MarketStateReplay.tsx:36,274,364,369,422,439`, `StatePriceDensity.tsx:194`, `RankedTargets.tsx:66`, `Tracker.tsx:253,395`, `Stocks.tsx:574`, `LiveSections.tsx:363-372` |
| Warning, degraded, urgency, absorbed-but-fragile, held | `warn` | urgency is not direction — `MetaorderReconstruction.tsx:33-37` maps LOW→bull, HIGH→bear today |
| Exceptional / king strike / top pick | `king` | 39 sites; keep it rare. `LiveTape.tsx:68-73` reserves `rail-king` for ≥$1M premium on a tape whose largest print measured $600.3K — the accent is dead. Thresholds come from the session's own distribution. |
| Distance, moneyness, geometry, magnitude | `.data-bar` + neutral ink | never green/red. `ContractChain.tsx:37` currently tints moneyness green on **both** the Calls and Puts columns; `LiveTape.tsx:256` tints an ITM put's OTM% green. |

One further correction the visual DNA names: `CANDLE_THEME_KEY = 'slayer'` (`candleTheme.ts:59`) paints
price direction in `#DCE3F5`, the holo-silver family that three source files declare selection-only.
Switch to the `mono` theme already in the file (`#eef1f5` / `#565c68`) so price structure stays neutral and
the GEX analytics own the colour — which is `candleTheme.ts:2-4`'s own stated intent.

---

## 6. Motion as causality, and the quiet/event asymmetry (GATE 24)

### 6.1 The asymmetry, stated

**At rest, a desk is still.** Motion is a signal, and a signal that is always on carries no information.

Measured today, at rest, with no input:

| Route | Infinite animations running |
|---|---|
| `/pulse` | 3 |
| `/tracker` | 4 |
| `/compass` (cards) | 20 |
| `/compass` (table) | **79** — `pulse-animation` ×76, because `STATE_META.TRIGGERED` sets `pulse:true` and 9 of 13 visible rows are TRIGGERED |
| `/` (landing) | **21** — and it drops 96–118 of ~330 frames per 8 s idle; with all CSS animation off, 14–16 of ~455 |

And the top-bar foil costs **7.2× the entire idle main-thread budget of a desk**: disabling animation on
`.holo-*` alone and changing nothing else takes `/terminal` from 540 style recalcs and 0.753 s of task time
per 9 idle seconds to 55 and 0.104 s — on a page producing 9 DOM mutations in that window. `ScriptDuration`
is unchanged, so the whole delta is style and paint.

**Budget.**

| Context | Concurrent infinite animations |
|---|---|
| Any desk, at rest, in the fold | **≤ 2** |
| Any desk, at rest, whole page | **≤ 4** |
| Landing hero | **≤ 6** |
| A single repeating mark (e.g. `custom-pulse`) | **≤ 1 instance per panel** — the state colour (`select`) already distinguishes TRIGGERED without motion, so the pulse belongs to the one monitored contract in the detail rail, not to every row of a table |

The identity survives this. `holo-pan` moves to a `transform` on a pseudo-element behind the
`background-clip:text` element instead of animating `background-position` on it; the foil looks the same and
the per-frame full-document recalc goes away.

### 6.2 Motion is only ever caused

Three permitted causes. Nothing else animates.

1. **The user acted.** `DUR.fast` (0.12 s), house curve. Hover, focus, selection, segment change,
   disclosure. This is the 281-element recipe already measured on `/compass`.
2. **A value changed.** `AnimatedNumber` — spring `{260, 32}`, a background **tint** flash (never a colour
   override, so it cannot fight the value's own sign colour), and it **jumps rather than rolls** when the
   character count changes so neighbours never shift. This is already correct and is the model for the rule.
3. **The layout genuinely re-derived.** `DUR.reflow` (0.35 s), once, on an explicit beat.

**Causal ordering.** When one change causes another, the cause moves first and the effect follows within one
`DUR.base` (0.20 s). Nothing that did not participate moves at all. Concretely: selecting a strike on
Pinpoint Levels moves the rail (0.12 s), then the exposure bars re-scale (0.20 s), and the chart's other
series do not move.

### 6.3 Motion that is not causality is a defect

Displacement is the failure mode, and it is measured:

- `/trace/live-tape` accumulates **CLS 0.536 in 15 s** and **1.061 in 30 s** with no interaction, because a
  new print gets a new React key and inserts a row at the top of the virtualization window: every visible row
  slides down 46–184 px every 1.5 s. Table geometry is stable (18455 px, all rows 46 px, `scrollTop` 0) — it
  is rows moving, not resizing. Fix: the newest print occupies a **fixed slot**; DOM order stays put.
- `/compass` teleports a setup card **393 px horizontally into a different grid column** when the scan
  re-ranks (measured `[35,604,385,231] → [428,366,385,230]`, no transition). Fix: a ranked list re-ranks on
  the sweep beat, freezes while a card is hovered or focused, and marks what moved.

**Rule.** A number may change its ink. It may not change its position. If a re-rank must move things, it
happens on the sweep beat, it is announced, and it never happens under a pointer.

### 6.4 Reduced motion

`index.css:415-437` already disables all 8 house animations plus `.animate-pulse` / `.animate-bounce` /
rain with `!important`, and `<MotionConfig reducedMotion="user">` covers framer-motion. Coverage is
complete and must stay complete. One outstanding violation: the landing page uses `animate-pulse` at
`LiveSections.tsx:452,548,553` (six pulsing rectangles on first paint) — the grammar `App.tsx:53-55`
explicitly documents as retired.

---

## 7. Density budgets (GATE 14)

### 7.1 Definitions

Measured at **1440×900**. Top bar 56 px + `py-5` → the fold is **≈824 px tall × 1380 px wide ≈ 1.14 M px²**.

- **Primary density** — share of the fold's area occupied by the desk's dominant object (§8), including its
  own axes and legend.
- **Secondary density** — everything else in the fold: header, scope line, headline metrics, rails.
- **Max simultaneous panels** — `<Panel>` instances mounted before the first disclosure or route change.
- **Max headline metrics** — `<StatCard>`s in the opening `MetricGrid`, of which **exactly one** carries
  `emphasis`.
- **Min instrument area** — the floor below which the dominant object stops being readable at this app's
  10–12 px type.
- **Max prose** — words of continuous sentence text above the fold, excluding data strings (a headline on
  `/news` is data, not prose).

Two global floors, from the responsive sweep:

- No desk header band may leave >40 % of its width empty. Currently the largest empty rectangle in the fold
  starts at exactly `y=56` on **86 of 200** route×viewport combos, mean 278 px tall, mean 10.2 % of the fold;
  worst 832×168 px on `/trace/scanner` at 1280×800.
- No grid may declare more tracks than its data can fill. `ProveIt.tsx:211` declares 5 columns for a board
  `quant.ts:317` can never fill past 2 — 60.0 % of the panel is empty at four viewports.

### 7.2 The budgets

| Desk | Job | Primary / secondary | Max panels | Max headline metrics | Min instrument area | Max prose |
|---|---|---|---|---|---|---|
| **Terminal index** `/terminal` | choose a desk | 0 / 100 | 6 | 0 | — | 80 w |
| **Pulse** `/pulse` | watch one name live | **55 / 45** | **10** (the current preset — do not grow it) | **0** | 1104×420 px (8 of 12 cols × 5 rows) | 25 w (one auto-note line) |
| **Compass › Setups** | rank and choose one contract | 58 / 42 | 2 (board 7 + compare 5) | 0 — the 36 px score is the anchor | board ≥ 12 rows in the fold | 40 w |
| **Compass › Weigher** | defend one contract against its neighbours | 60 / 40 | 3 (grade+ledger, rail, evidence) | 1 (the grade) | rail ≥ 17 rungs, ≥ 400 px tall | 60 w — this is the one desk that argues |
| **Compass › Lotto** | one closing auction | 50 / 50 | 3 | **3** (auction read, clock, board size) — down from 5, and the read and clock take the type size | ticket rows visible in the fold | 30 w |
| **Compass › Structures** | compare defined-risk shapes | 55 / 45 | 2 | 0 | payoff curve ≥ 320 px tall | 40 w |
| **Pinpoint › Gamma / Levels / Greeks** | where dealers are hedged | **62 / 38** | 4 | **4** | strike axis ≥ 560×360 px | 35 w |
| **Pinpoint › Stress** | what breaks, and where | 62 / 38 | 4 | 4 | one shared price axis carrying **both** boundaries (fracture −1.2 %, hedge-failure +9.75 %) ≥ 560×300 px | 45 w |
| **Pinpoint › History** | what structure did today | 65 / 35 | 3 | 4 | session chart ≥ 880×340 px with a real time axis | 25 w |
| **Trace › Live Tape** | watch prints arrive and cluster | **70 / 30** | 3 | **4** — down from 6; Sweeps+Blocks are complements (135+265=400) and merge into one ratio bar | tape ≥ 560 px tall, newest in a fixed slot | 20 w |
| **Trace › Dark Pool** | where size crossed and what it defends | 60 / 40 | 4 | 5 | shelf ladder ≥ 400 px; the 192-row sector feed ("None of it is tied to SPY") goes behind a disclosure — it is currently **59 %** of a 4804 px page | 35 w |
| **Trace › Scanner** | find the unusual contract | 65 / 35 | 3 | **4** | table ≥ 520 px; CONVICTION and READ are never the clipped columns | 25 w |
| **Trace › Reconstruction** | one inferred parent order | 55 / 45 | 4 | **4** | timeline ≥ 560×220 px | 60 w — inference must argue, and the caveat is not behind a disclosure |
| **Stocks** | rank a universe | 68 / 32 | 3 | **4** | board ≥ 640 px tall, windowed | 30 w |
| **News** | what the tape is reacting to | 65 / 35 | 3 | **3** | feed ≥ 560 px | headlines are data; ≤ 40 w of chrome prose |
| **Earnings** | magnitude vs direction on one print | 58 / 42 | 5 | **4** — down from 5–6 | implied-vs-historical plot ≥ 480×300 px | 45 w |
| **Prove It › Models** | does the model earn trust | 55 / 45 | 4 | **4** — down from 6; the scoreboard grid sizes to `scoreboard.length` | cone ≥ 560×340 px | 60 w |
| **Prove It › Volatility / Density** | what vol implies | 60 / 40 | 4 | 4 | surface/density ≥ 480×320 px | 40 w |
| **Tracker** | did the read hold | 60 / 40 | 3 | **4** | book table sized to content — no `items-stretch` pinning a 6-row table to a 595 px neighbour (measured 970×390 px void) | 40 w |
| **Community** | write and read theses | 0 / 100 | 3 | 0 | — | unbounded (this desk *is* prose) |

Every "down from" above is a subtraction the audit measured as unearned:
`GexHistory.tsx:263-274` gives a timestamp control the same box as Net GEX; `GreeksRegime.tsx:224-230`'s
fifth tile restates whichever of the middle three is largest; `FlowScanner.tsx:643-664` gives
"Contracts scanned" (a scope counter) the same weight as "Net directional" (the desk's actual read);
`LiveTape` spends two of six tiles on one fact and its complement.

### 7.3 The emphasis rule

`StatCard` already supports `emphasis` (`StatCard.tsx:13,22` → `.inst-emphasis`) and 7 of 20 rows use it.
**Exactly one tile per strip carries it, and it is the desk's answer.** Not its scope, not its timestamp,
not its input. That is the whole fix for finding F-10 — no new component, no layout change.

---

## 8. Information geometry and purposeful asymmetry (GATES 15, 16)

### 8.1 The shape

The app already has the right instinct: 21 `xl:grid-cols-12` blocks, all 7/5 or 8/4, **none equal**. The
thesis makes it a rule rather than a habit.

**Every desk is one dominant object plus one subordinate rail.** Not a grid of peers. The dominant object is
the instrument the desk's conclusion is read off; the rail is what qualifies it. There is no third column at
1440 px.

Permitted ratios, both already in the codebase:

- **7 / 5** (58 / 42) — the object needs argument beside it. Compass, Fracture, Earnings Intel.
- **8 / 4** (67 / 33) — the object is the point and the rail is a legend or a ladder. Pulse's default preset
  (`presets.ts:137-141`), Tracker.

Equal spans are forbidden at page level. They are permitted **inside** a panel only when equal width *is*
the comparison — the four justified cases measured are `StatePriceDensity.tsx:370` (a mirrored down/up
triplet), `RegimePanel.tsx:107` (a uniform stats array), and `StockDetailDrawer.tsx:98,130` (four facts of
one event at one altitude). `MetaorderReconstruction.tsx:275-281` is the counter-example: the engine's
central claim ("Inferred total") gets the same cell width and type size as "Ask-lift", a two-digit
diagnostic.

### 8.2 Per desk

| Desk | Dominant object | Subordinate rail | Ratio |
|---|---|---|---|
| **Pulse** | The **Liquidity Map** — a time × price resting-liquidity field (`liquidityField.ts`) with the order-flow cumulative delta (`cmd.orderFlow`) over it, on the chart's own time axis. Today it is panel 10 of 10 at y=2176; it moves to the top band at full width. | Chart + GEX heatmap column | 8 / 4 |
| **Compass › Setups** | The ranked board (240 rows, one 36 px score) | Compare pane | 7 / 5 |
| **Compass › Weigher** | The **grade + six-factor ledger** (27+16+14+17+8+3 = 85, which foots exactly — verified) | The 17-rung neighbour ladder | 7 / 5 |
| **Compass › Lotto** | The ticket board | Auction read + MOC clock | 8 / 4 |
| **Compass › Structures** | The payoff curve | The eight-structure list, ranked by a key that must be a visible column | 7 / 5 |
| **Pinpoint › Gamma** | The strike-axis exposure profile | Key-levels rail (`regime.levels`) | 8 / 4 |
| **Pinpoint › Levels** | The exposure ledger / ranked targets table | Key-levels rail | 7 / 5 |
| **Pinpoint › Greeks** | The strike × greek matrix | Regime list + "what flips it" | 7 / 5 |
| **Pinpoint › Stress** | **One shared price axis** carrying spot, the fracture line and the hedge-failure boundary — today these live in two `?view=` branches 8× apart with nothing reconciling them | Balance-sheet of forced flow | 7 / 5 |
| **Pinpoint › History** | The session chart with a real time axis | Level-migration list | 8 / 4 |
| **Trace › Live Tape** | The tape, with the accumulation rail (§4.1) | Filters + summary | 8 / 4 |
| **Trace › Dark Pool** | The **shelf ladder** — price memory, derived from the prints | The block tape | 7 / 5 |
| **Trace › Scanner** | The contract table with CONVICTION and READ pinned | Filters + presets | 8 / 4 |
| **Trace › Reconstruction** | The child-print timeline | Alternates + the caveat, **not** behind a disclosure | 7 / 5 |
| **Stocks** | The 192-row ranked board | Sector rotation + sleeve decomposition | 8 / 4 |
| **News** | The feed | Tape composition + category priors | 7 / 5 |
| **Earnings** | The **magnitude-vs-direction plot** (implied move against 8 historical reactions) — the desk's one genuine signature | The slate | 7 / 5 |
| **Prove It › Models** | The Monte Carlo cone + terminal histogram | The scoreboard, sized to `scoreboard.length` | 7 / 5 |
| **Prove It › Volatility** | The IV surface | Term structure + regime | 7 / 5 |
| **Tracker** | The tracked book (then → now) | Item review | 8 / 4 |
| **Community** | The idea list | Compose form | 7 / 5 |

### 8.3 Below `sm`

The rail goes **under** the object, never beside it and never behind a tab. One measured regression to avoid
repeating: at 390×844 the Weigher's neighbour rail — its entire balance metaphor — becomes a 30 px
horizontal strip at y=1479, 1.75 screens below the fold, because `sm:flex-col` flips it and the grade bar is
`hidden sm:block`. The rail sits directly under the grade on phones, with the bar intact.

---

## 9. The material system (GATE 18)

**Four surface levels, one well, one nav material. No more.** The measured surface ramp spans 1.012–1.029:1,
so luminance is not available as a hierarchy signal. Hierarchy comes from **border tone, the bevel, type
and space** — the three levers that measurably work.

| Level | Value | Recipe | Use | Not for |
|---|---|---|---|---|
| **L0 · Canvas** | `#050505` | flat | the page | anything with a border |
| **L1 · Panel** | `#0a0a0a` | `.inst-surface`: 2.5 % top wash, `1px #1c1c1c`, `border-top #333333`, `inset 0 1px 0 rgba(255,255,255,.03)` | every panel, every card. 92 sites. | — |
| **L2 · Emphasis** | `#0b0b0b` | `.inst-emphasis`: 4 % top wash, `1px #2a2a2a`, `border-top #3a3a3a` | **one** element per page — the desk's answer | a second one on the same page |
| **L3 · Floating** | `#0c0c0c` | `border-borderMuted` + `shadow-overlay` (the app's only shadow token) | `HoverReadout`, `Term`, popovers, the command palette | anything that is in the page flow. `shadow-overlay` is measured as **never painted at rest** — that is the correct state. |
| **Well** (not a level) | `#070707` | `inset` token | chart wells, icon chips, list rows *inside* L1 | as a step "below" L0 |
| **Nav material** | `rgba(9,9,11,.55)` | `.glass`, `blur(20px) saturate(180%)`, degrades to `rgba(9,9,11,.94)` under `prefers-reduced-transparency` | 4 sites: `TopBar` ×2, `SubNav`, `Landing` | data panels — the class's own comment says so and the code obeys |

Contrast steps available (measured, all against `panel #0a0a0a`): `borderSubtle` **1.162**,
`borderMuted` **1.379**, `.inst-surface` bevel **1.567**. That is the whole ladder. It is enough.

**Deleted from the system** — these have zero call sites and appear in the docs as if they were live:
`panelHover #101010`, `borderFocus #ededed`, `.inst-ticks`, `.holo-border`, and the six legacy aliases
`primary` `secondary` `silver` `gammaPos` `gammaNeg` `warning`. That is **8 of 29 colour tokens (27.6 %)**
and 2 documented CSS classes. Either adopt them on purpose or remove them and their `DESIGN.md` entries, so
the documented DNA and the rendered DNA are one set.

**One addition, not a level:** hover needs a structural cue, not more alpha. Row hover currently measures
**1.109:1** — at the perceptual floor — and raising `rowHover` to reach 3:1 would compete with
`.inst-selected` (1.085:1 as a fill, which only reads because of its 2 px silver rail). So hover reuses the
rail shape at lower opacity — `inset 2px 0 0 rgba(237,237,237,0.25)` — alongside the existing tint. The
affordance reads from an edge, which is already how selection works in this app.

**One promotion:** `rounded-[3px]` is an unnamed 6-site token — the inverted axis price pill, always
`bg-textPrimary` / `text-ink` / `px-1.5 py-px` / 10 px bold mono `tnum`. Name it (`borderRadius.pill`) or
give it a component. It is a house idiom, not drift.

---

## 10. The five page-level anchors (GATE 17)

Every desk answers five questions, in this order, in this priority. A desk missing any of them is not
finished.

- **A1 · SCOPE** — what this is, on what, on which clock, at what freshness. Reads `regime.phase`,
  `regime.phaseLabel`, `sweptAt`, `coverage`.
- **A2 · READ** — one sentence. The conclusion. Never a number alone.
- **A3 · INSTRUMENT** — the dominant object the read was derived from (§8).
- **A4 · INVALIDATION** — the price or condition that voids the read, with its uncertainty (§4.2).
- **A5 · NEXT** — the one outbound act, carrying state in the URL (§3.3).

Measured baseline across the 12 Pinpoint/Prove It views: dominant object clear on 8/12, a conclusion
sentence on 10/12, an explicit invalidation object on **2/12**, a next action on **2/12**.

| Desk | A1 Scope | A2 Read | A3 Instrument | A4 Invalidation | A5 Next |
|---|---|---|---|---|---|
| **Terminal index** | phase + last desk | — | desk grid | — | resume / open a desk |
| **Pulse** | ticker · phase · tick age (1.5 s) | auto-note (`makeAutoNote`, one line) | Liquidity Map + flow | flip strike from `regime.levels` — the price at which the note inverts | Trace / Pinpoint / Compass on this ticker (`TickerJump` mirror — **zero today**) |
| **Compass › Setups** | sleeve · scanner · sweep age (10 s) · coverage tier | "N clear this floor; #1 is X because …" | ranked board | the #1 setup's invalidation price, derived from chain OI/netGex — **not** the current `spot·(0.008+rng·0.012)` with a randomly chosen cause string | open the Weigher on #1 |
| **Compass › Weigher** | contract · horizon · repriced 10 s | grade + verdict + the one-line claim | grade + factor ledger | breakeven vs 1σ, and **the best neighbour that beats it** — searched over the rail's 17 graded strikes, not 4 %-offsets | track it, or take the neighbour |
| **Compass › Lotto** | phase · MOC window · countdown | auction read | ticket board | the imbalance/absorption test that fired, with its value | weigh a ticket |
| **Compass › Structures** | expiry · IV · sleeve | which shape and why | payoff curve | breakevens + prob-of-profit + "assignment not modelled" | carry to Tracker |
| **Pinpoint › Gamma** | ticker · phase · sweep age | `regime.dealerBias` in one sentence | strike-axis profile | the flip strike, and the sign change it causes | Levels, or Compass on the king strike |
| **Pinpoint › Levels** | ticker · window (±N strikes, stated) | the primary target and why it ranks #1 | exposure ledger / ranked targets | what would move the #1 rank | view on chart (Pulse), weigh in Compass |
| **Pinpoint › Greeks** | ticker · 20-strike window, stated | leading regime, as a **score**, not a "probability" | strike × greek matrix | "what flips it" (already exists, `GreeksRegime.tsx:218`) | Stress |
| **Pinpoint › Stress** | ticker · phase | which boundary is nearer, and by how much | one shared price axis, both boundaries | the fracture line + cascade prob **± SE** + path count | Levels on that strike |
| **Pinpoint › History** | session date · `Regular 09:30–16:00 ET` | what structure did today | session chart with a time axis | which level is least stable | Levels at the current structure |
| **Trace › Live Tape** | phase · tick age · "N of M prints" | the tape's accumulation state | tape + accumulation rail | what would flip the read (the counter-side premium) | open the contract in Compass |
| **Trace › Dark Pool** | phase · session or next-session | posture, from where size crossed relative to VWAP and shelf — **not** from `changePercent >= 0` | shelf ladder | the shelf that would have to fail | Levels on that price |
| **Trace › Scanner** | scan age · universe size | the rank-change distribution | contract table | the input that moved (the scan already retains `scanRef`) | weigh the top row |
| **Trace › Reconstruction** | inferred, no ticket IDs — **on the row, not behind a disclosure** | "$X printed → $Y inferred" | child-print timeline | the alternates, and what would invalidate the grouping | tape on that contract |
| **Stocks** | universe · sector scope · **MODELED** (missing entirely today) | the composite's leader and why | ranked board | the sleeve that would flip the rank | weigh / open in Pulse |
| **News** | feed age · MODELED (present) | tape mood + the loudest catalyst per side | feed | the priors that contradict it (n shown) | open the ticker |
| **Earnings** | print time **in ET** · countdown · MODELED | magnitude vs direction, separately | implied-vs-historical plot | the richness threshold and where this print sits | weigh the structure |
| **Prove It › Models** | model version · calibration time · `n` | hit rate with `n` and scope (`m.scope` is computed, tested, and never rendered) | cone + histogram | VaR 95 with its interval | replay a state |
| **Prove It › Volatility** | model · calibrated at | is the surface rich or cheap against the term curve | IV surface | the term-structure disagreement | density |
| **Tracker** | book size · lane counts | how the book resolved | book table, then → now | entry-time invalidation vs current | re-open in Compass |
| **Community** | board scope | — | idea list | — | compose / open on Pulse |

---

## 11. One signature interaction per desk (GATE 11)

Each names an existing data source. None requires a new field or a new engine.

| Desk | Signature interaction | Existing source |
|---|---|---|
| **Pulse** | **Liquidity scrub.** Drag a crosshair across the time × price field; the readout names resting liquidity at that (t, price) *and which of the four contributors produced it*. | `data/liquidityField.ts` (`makeLiquidityLUT`, 256-entry) fed by chart bars, `KeyLevels`, chain OI, GEX nodes and dark-pool shelf notionals — all already wired at `registry.tsx:190-206`. |
| **Compass › Weigher** | **Ladder walk.** Arrow up/down the 17 listed strikes; the grade, the six factor bars and the breakeven-vs-1σ balance re-derive in place, and the "nothing beats this" claim recomputes against the rungs you can see. | `core/contractScore.ts` `weighContract` — already grading all 17 rungs (measured `[91,91,91,90,90,89,88,87,85,82,78,72,66,60,59,58,57]`). |
| **Compass › Setups** | **Floor drag.** Drag the scanner floor; the board re-ranks on the sweep beat and the count above the floor updates continuously. | `compass.ts:849,878` (`totalFound` / `shown`) — the counts already exist; the empty state (currently unreachable across 28 configurations) becomes reachable. |
| **Pinpoint › Gamma / Levels** | **Flip scrub.** Drag spot along the strike axis; the whole desk restates which side of the flip you are on and what changes sign. | `simulator.ts:482-494` `flipZone` + per-strike `netGex`. The expiry spotlight (measured working — dims non-selected columns to 0.35) is the same idiom. |
| **Pinpoint › Greeks** | **Greek isolation.** Select a greek column; the matrix keeps it and dims the rest, and the per-strike profile for that greek replaces the straight-line "vanna shock" (measured deviation **0.042 px** on a 150 px plot — it is `y = k·x` by construction). | `greeksmatrix.ts` `view.rows[].vanna` etc. — already computed per strike. |
| **Pinpoint › Stress** | **Boundary slider.** One depth/liquidity assumption, exposed as a slider; both boundaries move on the shared axis. The desk currently has **2 buttons total**, both the sub-toggle. | `fracture.ts` `forcedAt()` / `baseDepth`; `hedgeimpact.ts:55` ADV. |
| **Pinpoint › History** | **Session scrub with keyboard.** Arrow-key the playhead; structure at that minute redraws. | `data/gexhistory.ts` — already holds the series; `PrintSessionChart.tsx:136-139` already has the focusable-SVG pattern to copy. |
| **Trace › Live Tape** | **Accumulation rail.** Rows of the same contract join with a continuous left rail whose weight is that contract's share of session premium; the Nth repeat notches it. | `pulseflow.ts:182` `contractKey` + `summarizeTape` — both already computed, nothing new stored. |
| **Trace › Dark Pool** | **Shelf defence.** Click a shelf; the tape filters to the prints that built it and the retest count shows as a session-monotone ladder. | `darkpool.ts:322-338` `clusterOf` (the clustering pass already exists) + `darkpool.ts:72-93` `retestsByShelf` (already reads real `priceHistory`). |
| **Trace › Scanner** | **Rank-delta gutter.** Each row shows how far it moved since the last scan and which input moved it. | `FlowScanner.tsx:502-512` already retains `scanRef.current` across scans. |
| **Trace › Reconstruction** | **Alternate toggle.** Switch the assumed parent strategy; the timeline, the fill/inferred split and the "why grouped" sentence all re-derive. | `metaorder.ts:152-215` — the strategy templates already exist and already pin their legs' aggressor side. |
| **Stocks** | **Sleeve decomposition.** Click a sleeve header; the composite re-weights to that sleeve and the board re-ranks, with the drawer's own engine (RSI, EMA stack, flow split) shown beside it. | `stocks.ts:121-127` weights; `Simulator.buildSnapshot().indicators` and `buildPulseFlow` are already rendered one tab away — and currently **contradict** the sleeve (9 of 10 top names show RSI 42.3–50.2 under a Momentum sleeve of 83–96). |
| **News** | **Half-life decay.** Scrub a headline forward; the priced-in fraction decays against that headline's own prior pool, with `n`. | `newsintel.ts` `halfLifeHours` + `news.ts:313-335` (252 sessions × 18 items, split by category). |
| **Earnings** | **Move-vs-history drag.** Drag the implied move; the 8 historical reactions re-shade and the surviving structure changes with it. | `earnings.ts:151+` (8 generated prints, `histAvgMovePct`, `beatRate8q`) + `earningsintel.ts` `recommended`. |
| **Prove It › Models** | **Horizon scrub.** Drag the horizon; the cone, the terminal histogram and VaR 95 recompute — and the hit rate + `n` stay pinned, so model quality never moves with the scenario. | `quant.ts:73-97` (1200-path cone, per-step percentiles) + `quant.ts:200-227` (graded calls, `n`). |
| **Tracker** | **Then → now.** Every row shows the verdict and score at entry against the live rebuild. `verdictAtTrack` is already written to storage and has **zero readers**. | `types/tracker.ts:12` `scoreAtTrack` / `verdictAtTrack`, written at `TrackerContext.tsx:86,109`; `rebuildLive()` for the current side. |
| **Terminal index** | **Resume.** One row, the last desk, with the phase at the time you left. | `pages/terminal/lastDesk.ts`. |
| **Community** | **Thesis link-out.** An idea opens on Pulse at its own ticker and price. | `Ideas.tsx:366` `navigate('/pulse', {state:{focusTicker, focusPrice}})` — which must move to the URL per §3.3. |

---

## 12. The falsification test (GATE 25)

The thesis is only worth anything if it makes predictions that can be checked. Each row is a script, not an
opinion.

| Claim | The measurement that would falsify it |
|---|---|
| Desks are not interchangeable | Screenshot the first 200 px of every desk with the logo and title masked. If two desks are indistinguishable, the thesis failed. Baseline: four consecutive Trace desks currently are. |
| One dominant object per desk | Largest rendered type size per route, and largest panel by area. If the largest object is not the instrument in §8.2, the thesis failed. Baseline: `/pulse` max visible type is 13 px; `/compass?view=lotto` has a ten-way 18 px tie. |
| The terminal is still at rest | `document.getAnimations()` filtered to `iterationCount: Infinity` on every desk with no input. Budget §6.1: ≤2 in the fold, ≤4 per page. Baseline: `/compass` table = 79. |
| Nothing moves that was not caused | `PerformanceObserver('layout-shift')` over 30 s of ticking with no interaction. Target CLS < 0.05 per route. Baseline: `/trace/live-tape` 1.061, `/compass` 0.131–0.208. |
| Model quality is never green | Rendered-colour census for `rgb(48,209,88)` and `rgb(255,59,48)`, cross-referenced against the class table in §5. Any hit on a quality/process/geometry quantity is a failure. Baseline: 13 sites named in §5. |
| One word, one quantity | Cross-engine coherence test in the existing vitest suite (`compassCoherence.test.ts` and `levels.test.ts` prove the pattern). Assert one IV rank, one expected move, one mid per contract, one dealer bias, one pin window. Baseline: 3 IV ranks, 7.9× expected-move split, 2.08× mid split, 2 biases, 2 pins. |
| The market's state reaches every desk | Freeze `Date` to a Saturday and diff `main.innerText` across all desks against a Monday. Every desk must differ. Baseline: 16 of 17 are identical. |
| A handoff survives a reload | Open every cross-desk affordance, copy the URL, reload. The landing state must be identical. Baseline: `/compass?view=weigher` from SBUX reloads as SPY. |
| Density budgets hold | Per-route: `<Panel>` count, `<StatCard>` count in the opening `MetricGrid`, `emphasis` count (must be exactly 1), dominant-object bounding box as a share of the fold. |
| Elevation stays border-led | Count `box-shadow` values at rest that are not the `.inst-surface` inset, the focus ring or a `.rail-*`. Must be 0. Baseline: 0 — this one currently passes and must keep passing. |

---

## 13. What this thesis deliberately does not do

- **No new surface levels.** The ramp is flat by design and has no headroom (§9).
- **No KPI tile wall.** The budget in §7 *subtracts* tiles from 8 desks and adds them to none.
- **No card around every subsection.** 147 Panels, 0 nested — that stays true.
- **No glass, gradient, neon or particle on a data surface.** Measured clean today (`06`, F-17); it stays clean.
- **No base font-size increase.** 10–12 px is the product (§1.1, D2).
- **No new packages.** Two would be justified in CI and are named, not installed: **Knip** (to replace manual
  dynamic-import/registry reachability reasoning) and **jscpd** (token-level clones the line-level detector
  misses — the `LiveTape`/`FlowScanner` `ColumnChooser` pair scored only 30 % overlap while being 1:1
  structurally). `jsdom` + `@testing-library/react` would be needed to assert render-count regressions
  against the two-clock cadence, which is a documented invariant with no automated guard.

---

## 14. What this document does not settle

- **The Compass 0DTE sleeve's amber.** `sleeveInk.ts:38-44` gives 0DTE `text-warn #FF9500`, which is also
  every invalidation line on the same screen. §5 forbids a token carrying two meanings, but I have not chosen
  the replacement — a distinct hot token for horizon identity, or desaturating the sleeve tab. Needs a
  decision, not a rule.
- **Whether `Score` should be one number or five qualified ones.** §5 and `04` §3.14 say qualify at the
  point of render ("Setup score", "MOC score", "Strike priority", "Sector composite"). Collapsing them to one
  scale is a product decision I am not making here.
- **Mobile density.** Every budget in §7 is measured at 1440×900. The audit's responsive sweep measured 10
  route×viewport combos where the whole desk scrolls sideways at 360–430 px, and 208 of 451 interactive
  elements on `/stocks` under 44 px in both dimensions. Phone budgets need their own pass; §8.3 states only
  the geometry rule.
- **The trailer and the landing hero.** Both carry authored constants and a deliberately separate palette.
  They are marketing surfaces and are out of scope for the desk thesis, but the landing page currently
  paints a **put's** confidence meter bull-green (`LiveSections.tsx:363-372`) and prints a frozen
  `SLAYER/LIVE 09:41:22 ET` in its code-rain. Those are palette and honesty violations regardless of scope.
- **Prove It's 3D dealer surface.** Its expiry axis is measured near-redundant
  (corr(row0,row10) = 0.873, 0 of 24 strike columns change sign down the axis) and `StrikeNode` has no expiry
  field, so the axis is fabricated. §8.2 does not name it as a dominant object because I think it should be a
  strike × greek grid instead — but that is a proposal in `10-desk-pinpoint-proveit` (D-16), not a settled
  part of this thesis.
