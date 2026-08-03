# 05 — State coverage across every data-driven surface

**Gates 6, 26, 28, 29, 30, 31, 32** · Slayer Terminal · audit date 2026-08-03
Target: production build served at `http://127.0.0.1:8123` (SPA fallback on). No rebuild, no restart.
Browser: Playwright 1.61.1 / Chromium 1194, viewport **1440×900**, `slayer_onboarded_v1=1` and
`slayer_booted_v1=1` pre-seeded, `fonts.g*` aborted. Container TZ = UTC unless stated.

Scratch scripts (re-runnable):

```
/tmp/claude-0/-home-user-slayersfinal/61510a72-f878-56b9-9620-dab6cb6adbf2/scratchpad/
  s5-loading.mjs    skeleton-presence trace on 23 routes (MutationObserver + 4 ms poll)
  s5-launchgate.mjs skeleton frames vs launch-overlay opacity, first-visit and returning
  s5-spanav.mjs     skeleton visibility on in-app (SPA) navigation
  s5-closed.mjs     17 desks rendered on a faked Saturday vs a faked open Monday
  s5-clock.mjs      desk timestamps vs the top-bar market clock, 3 timezones
  s5-fresh.mjs      freshness-marker inventory across 26 views
  s5-empty{,2,3,4}.mjs   reachability drive of every EMPTY / UNKNOWN / UNAVAILABLE branch
  s5-stale.mjs      70 s HELD hunt on Compass + freshness claims per desk
  s5-coverage.mjs   coverage-tier badge tally over 24 board configurations
  s5-cov.ts         coverage tiers over the whole 194-name field (npx tsx)
  s5-drawer3.mjs    StockDetailDrawer tab-by-tab empty-state hunt
Raw output: s5-*.json   Screenshots: shots5/*.png
```

---

## 0. Headline

The vocabulary is written. **25 `<EmptyState>` call sites across 18 files, 13 skeleton render sites across
10 files, 2 error boundaries** — and the copy in the best of them (`ContractWeigher`, `StockDetailDrawer`,
the Lotto board) is the best non-populated copy I have read in an app this size: it names the population,
the count, the failing condition and the way back.

Three things are wrong with it, all measured.

1. **LOADING is written eleven times and visible for 0 ms.** On all 6 routes that render a skeleton on a
   cold load, **100 % of the frames in which a skeleton is on screen sit behind the launch-gate overlay at
   opacity 1.0** (`s5-launchgate.json`). On in-app navigation the longest visible skeleton anywhere in the
   app is **143 ms** (`/prove-it`, a lazy-chunk fallback); `/compass`, `/pinpoint/gamma`, `/pinpoint/levels`
   and `/tracker` show **zero** skeleton frames. Eleven skeletons are dead code on the screen they were
   written for.

2. **The terminal cannot tell you the market is shut.** Rendered at 13:00 ET on a faked **Saturday**,
   **16 of 17 desks contain not one word indicating there is no session** (`s5-closed.mjs`). The Dark Pool
   still prints `OFF-EXCHANGE SHARE 50.9% · of today's volume printed away from the lit book`; the Live Tape
   still prints `SESSION PREMIUM $39.5M · 400 prints on tape`. Only `/compass?view=lotto` says
   `WEEKEND, CLOSED · THESE PRICE THE NEXT SESSION`. The market phase exists
   (`core/calendar.ts:269-293`) and is rendered in exactly one place in the whole app: the `title=`
   attribute of the top-bar clock (`TopBar.tsx:236`) — a hover tooltip.

3. **Every desk timestamp is in the viewer's timezone while the market clock beside it is ET.** Measured
   simultaneously with `timezoneId: 'Asia/Tokyo'`: top bar `13:24:08 ET`, newest Live Tape print
   `2:24:07 AM`, Compass sweep badge `02:24:09`, Dark Pool prints `23:50 / 00:18 / 22:31`
   (`s5-clock.mjs`). An 11-hour disagreement on one screen. Staleness is not judgeable, because the age
   reference and the stamp are on different clocks. One `timeZone: 'America/New_York'` exists in `src/`
   (`core/calendar.ts:236`); twelve other formatters do not use it.

Underneath those: of the ten required states, **four (STALE, DEGRADED, ERROR, and a differentiated
UNAVAILABLE) are either unreachable in normal use or collapse to a constant**, and **no staleness threshold
of any kind exists anywhere in the codebase** — quotes, sweeps, OI, news and earnings are all "current" by
construction, with no age at which any of them is called old.

---

## 1. GATE 26 — the surface × state matrix

Legend: **●** implemented and reachable (I got to it in the browser) · **◐** implemented but I could not
reach it · **○** not implemented · **–** not applicable. Every ● and ◐ carries the file:line that renders it.

| Surface (route) | LOADING | EMPTY | UNAVAIL | STALE | DEGRADED | SIMULATED | MODELED | INFERRED | ERROR | POPULATED |
|---|---|---|---|---|---|---|---|---|---|---|
| **Global shell** `AppShell` | ● `App.tsx:56-59` (lazy only) | – | ○ | ○ | ○ | ○ | ○ | ○ | ◐ `AppShell.tsx:119` | ● |
| **/pulse** workspace | ◐ `PulseWorkspace.tsx:1410` | ○ | ● `pulseRegistry.tsx:110,121,132` | ○ | ○ | ○ | ○ | ○ | ◐ `PulseWorkspace.tsx:1418` | ● |
| **/compass** setups | ◐ `Compass.tsx:599,602` | ◐ `SetupScanBoard.tsx:208-212` | ○ | ◐ `Compass.tsx:106-114` | ● `SetupScanCard.tsx:109-110` (constant, §6) | ○ | ● `scanUniverse.ts:87` (2/576) | ○ | ○ | ● |
| **/compass?view=weigher** | ◐ `contractQuery.ts:323` | ● ×3 `ContractWeigher.tsx:1237,1246,1258` | ○ | ○ | ● `:1261-1302` NOT PRICEABLE | ○ | ○ | ○ | ○ | ● |
| **/compass?view=lotto** | ◐ `LottoBoard.tsx:603-604` | ◐ ×2 `LottoBoard.tsx:689,693` | ○ | ● market-closed `LottoBoard.tsx:660` | ○ | ● `LottoBoard.tsx` playbook note | ○ | ○ | ○ | ● |
| **/compass** structures | – | ◐ `StructureBoard.tsx:97` | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● |
| **/compass** contract track | – | ◐ `ContractTrack.tsx:150` | ○ | ○ | ○ | ○ | ● `ContractTrack.tsx:353-355` | ○ | ○ | ● |
| **/stocks** | ○ | ● `Stocks.tsx:792` | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● |
| **/stocks** detail drawer | ○ | ● ×2 of 5 `StockDetailDrawer.tsx:402,418`; ◐ `:451,496` | ○ | ○ | ○ | ○ | ● `:134` | ○ | ○ | ● |
| **/news** | ○ | ○ | ○ | ○ | ○ | ○ | ● `news.ts:68` per row | ○ | ○ | ● |
| **/earnings** | ○ | ● `EarningsHub.tsx:910` | ○ | ○ | ○ | ○ | ● `EarningsIntel.tsx:563` | ● `EarningsHub.tsx:55-60` | ○ | ● |
| **/tracker** | ◐ `Tracker.tsx:650,654` | ● `Tracker.tsx:601` (own book) + `:700` | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● |
| **/tracker** edge ledger | ○ | ◐ default `'No data'` `EdgeLedger.tsx:299` | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● |
| **/pinpoint/gamma** | ◐ `GammaChart.tsx:66` | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● |
| **/pinpoint/levels** | ◐ `ExposureProfile.tsx:80` | ◐ `PositioningMap.tsx:432`, `PressureMatrix.tsx:41` | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● |
| **/pinpoint/levels?view=ranked** | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● |
| **/pinpoint/greeks** | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● |
| **/pinpoint/greeks?view=migration** | ◐ `VannaCharm.tsx:232` | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● |
| **/pinpoint/stress** (+fracture) | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● |
| **/pinpoint/history** | ○ | ◐ default `'No data'` `GexHistory.tsx:459` | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● |
| **/trace/live-tape** | ○ | ● `LiveTape.tsx:1055` (filtered) / ◐ (no prints) | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● |
| **/trace/dark-pool** | ○ | ● `DarkPool.tsx:589-592` | ○ | ○ | ○ | ○ | ○ | ● `:430,567` | ○ | ● |
| **/trace/scanner** | ○ | ◐ `FlowScanner.tsx:700` | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● |
| **/trace/scanner** row drawer | ◐ `ScannerRowDrawer.tsx:114` | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● |
| **/trace/reconstruction** | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● `MetaorderReconstruction.tsx:98,241,248,276,441` | ○ | ● |
| **/prove-it** vol lab | ◐ `VolLab.tsx:80` | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● |
| **/prove-it** state replay | ○ | ○ | ○ | ○ | ○ | ● `MarketStateReplay.tsx:299,303` | ○ | ○ | ○ | ● |
| **/community/ideas** | ○ | ● **2-condition** `Ideas.tsx:425-433` | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● |
| **/community/requests** | ○ | ◐ `Requests.tsx:204` | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● |
| **/community/feedback** | ○ | ● `Feedback.tsx:151-155` | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● |
| **Top-bar ticker search** | ● `contractQuery.ts:323` copy exists | ● `TickerSearch.tsx:116` | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● |
| **Compass impact leaderboard** | ○ | ◐ default `'No data'` `ImpactLeaderboard.tsx:115` | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● |
| **Compass setup compare** | ○ | ◐ default `'No data'` `SetupCompare.tsx:320` | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● |
| **Market notes (Pulse panel)** | ○ | ◐ `MarketNotes.tsx:69` | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● |

**Column totals over 33 surfaces:** LOADING 11 (10 unreachable-in-practice) · EMPTY 22 · UNAVAILABLE 1 ·
STALE 2 · DEGRADED 2 · SIMULATED 2 · MODELED 5 · INFERRED 3 · ERROR 2 (both unreachable) · POPULATED 33.

**No surface implements more than six of the ten states. Twenty-one of thirty-three implement two or fewer
non-populated states.** The two states that answer "should I trust this number right now" — STALE and
DEGRADED — appear on two surfaces each, and on `/compass` both of them are the ones I could not reach or
that render as a constant.

---

## 2. GATE 6 / 26 — LOADING: written eleven times, visible for 0 ms

### 2.1 What is written

13 skeleton render sites, 10 files:

```
App.tsx:58                       SkeletonRows rows={8}     (Suspense fallback, lazy routes only)
Compass.tsx:599, :602            SkeletonRows 6 + 4
Tracker.tsx:650, :654            Skeleton ×4 + SkeletonRows 6
LottoBoard.tsx:603, :604         Skeleton ×2
PulseWorkspace.tsx:1410          SkeletonRows 4  (per panel)
GammaChart.tsx:66                SkeletonRows 5
ExposureProfile.tsx:80           SkeletonRows 5
VannaCharm.tsx:232               SkeletonRows 5
VolLab.tsx:80                    SkeletonRows 5
ScannerRowDrawer.tsx:114         SkeletonRows 6
```

### 2.2 What is visible — measured

`MarketDataProvider` calls `Simulator.tick(setMarketData)` **synchronously inside the mount effect**
(`MarketDataContext.tsx:36-40`), and every desk's scan effect is likewise synchronous. There is no async
data layer in this app, so `marketData === null` survives exactly one commit.

Cold load, `.skeleton` node count polled every 4 ms from before any app code runs (`s5-loading.mjs`):

| route | max skeletons | first at | cleared at | on-screen lifetime |
|---|---|---|---|---|
| `/pulse` | 50 | 429 ms | 867 ms | 438 ms |
| `/compass` | 12 | 414 ms | 519 ms | 105 ms |
| `/compass?view=lotto` | 12 | 417 ms | 982 ms | 565 ms |
| `/prove-it` | 9 | 424 ms | 727 ms | 303 ms |
| `/pinpoint/gamma` | 6 | 421 ms | 486 ms | 65 ms |
| `/pinpoint/levels` | 6 | 449 ms | 588 ms | 139 ms |
| 17 other routes | **0** | – | – | 0 ms |

Now the launch gate. `LaunchTransition.tsx:33-37` holds a full-viewport overlay for `HOLD_MS + REVEAL_MS`
= **1350 ms** on a first visit and `RELOAD_HOLD_MS + REVEAL_MS` = **620 ms** afterwards, timed from React
mount (~430 ms after navigation start). Polling skeleton count and full-viewport-fixed-overlay opacity
together (`s5-launchgate.mjs`):

```
FIRSTVISIT /pulse            skelFrames=2  VISIBLE(gate<0.5)=0  behindGate=2
RETURNING  /pulse            skelFrames=2  VISIBLE(gate<0.5)=0  behindGate=2
FIRSTVISIT /compass          skelFrames=2  VISIBLE(gate<0.5)=0  behindGate=2
RETURNING  /compass          skelFrames=2  VISIBLE(gate<0.5)=0  behindGate=2
FIRSTVISIT /compass?view=lotto  skelFrames=7  VISIBLE=0  behindGate=7
RETURNING  /compass?view=lotto  skelFrames=7  VISIBLE=0  behindGate=7
FIRSTVISIT /pinpoint/gamma   skelFrames=2  VISIBLE=0  behindGate=2
RETURNING  /pinpoint/gamma   skelFrames=2  VISIBLE=0  behindGate=2
FIRSTVISIT /pinpoint/levels  skelFrames=2  VISIBLE=0  behindGate=2
RETURNING  /pinpoint/levels  skelFrames=2  VISIBLE=0  behindGate=2
FIRSTVISIT /prove-it         skelFrames=5  VISIBLE=0  behindGate=5
RETURNING  /prove-it         skelFrames=5  VISIBLE=0  behindGate=5
```

Raw trace for `/compass`, returning visitor (`s5-launchgate.json`):

```
{"t":444,"skel":12,"onScreen":12,"coverOpacity":1}
{"t":460,"skel":12,"onScreen":12,"coverOpacity":1}
{"t":582,"skel":0, "onScreen":0, "coverOpacity":1}
...
{"t":1083,"skel":0,"onScreen":0,"coverOpacity":0.88}   ← gate only starts fading here
{"t":1231,"skel":0,"onScreen":0,"coverOpacity":0}
```

The skeletons live 444→582 ms; the overlay is fully opaque until 1083 ms. **Twelve skeletons paint, and are
seen by nobody.**

In-app navigation, after the gate has cleared (`s5-spanav.mjs`, 8 ms poll):

```
SPA -> /compass          skelFrames=0  visibleFrames=0
SPA -> /pulse            skelFrames=1  visibleFrames=1  window=588..588ms (≤16 ms)
SPA -> /pinpoint/gamma   skelFrames=0  visibleFrames=0
SPA -> /pinpoint/levels  skelFrames=0  visibleFrames=0
SPA -> /prove-it         skelFrames=7  visibleFrames=7  window=25..168ms (143 ms)
SPA -> /tracker          skelFrames=0  visibleFrames=0
```

**The longest a loading state is visible anywhere in this application is 143 ms, on the one route where the
skeleton is a lazy-chunk Suspense fallback rather than a data state.**

### 2.3 The a11y half of it

`Skeleton.tsx:12` and `Skeleton.tsx:17,27` set `aria-hidden="true"` on every placeholder, and there is no
`aria-busy`, no `role="status"` and no `aria-live` region anywhere in the app that announces loading
(`grep -rn 'aria-busy|role="status"|aria-live' src` returns 10 hits — all toasts, chart cursors and
sr-only summaries, none of them a loading announcement). A screen-reader user gets silence, then content.
Given §2.2 this is currently harmless; it stops being harmless the moment any real feed is wired in.

---

## 3. GATE 28 — one message for materially different conditions

### 3.1 `DataTable`'s two-word non-explanation

`DataTable.tsx:58` defaults `emptyText = 'No data'` and `:163` renders it through `EmptyState` with a title
and **no body**. Ten `<DataTable>` call sites; five pass `emptyText`, four fall back to the default:

| call site | question the table answers | copy when empty |
|---|---|---|
| `EdgeLedger.tsx:299` | how have my tracked ideas actually resolved | `No data` |
| `ImpactLeaderboard.tsx:115` | which strikes move the dealer book most | `No data` |
| `SetupCompare.tsx:320` | how does this contract compare to its alternatives | `No data` |
| `GexHistory.tsx:459` | what did the gamma profile do over the session | `No data` |

Four different questions, one two-word answer, no remedy, no distinction between "nothing qualified",
"nothing exists yet" and "the filter removed everything".

### 3.2 The Dark Pool tells you to widen a control you did not touch

`DarkPool.tsx:589-592` is one `EmptyState` behind four independent filters — a free-text query
(`:534`, `aria-label="Filter dark pool prints"`), execution kind (`:542`), inferred read (`:548`) and a size
floor (`:554`). Reached by typing `zzzzqqqq` into the **search box** (screenshot `shots5/dp-empty.png`):

> **NO PRINTS MATCH**
> Every block this session sits outside these filters. Widen the kind, the read or the size floor.

The remedy names three controls, **none of which is the one that emptied the table**. A reader who follows
the instruction literally will widen kind, read and size, still see nothing, and conclude the desk is broken.

### 3.3 The Live Tape: two conditions, one component, no body at all

`LiveTape.tsx:1055`:

```tsx
<EmptyState size="lg" title={base.length === 0 ? 'Awaiting first prints…' : 'No prints match the filters'} />
```

Two materially different conditions — *the tape has produced nothing* vs *your filters removed everything* —
share one node, and **neither branch has a `body`**. Measured (`s5-empty2.mjs`): filtering to
`zzzzqqqq` yields the bare line `NO PRINTS MATCH THE FILTERS` with nothing under it (screenshot
`shots5/lt-empty.png`) — no count, no named filter, no reset. Compare the Dark Pool one screen away, which
at least has a sentence. Two sibling tapes on the same desk, two different empty grammars.

`Awaiting first prints…` is unreachable: `base` is seeded from `tapeSeed.ts` (a 600-tick walk-back,
`tapeSeed.ts:40`), so `base.length === 0` never occurs — measured `400 OF 400 PRINTS` on arrival.

### 3.4 The scan board has two sentences for one condition, and one of them is dead code

`SetupScanBoard.tsx:207-212` guards on `setups.length === 0` and renders
*"Nothing clears this floor — No contract met the {scanner} threshold on the last sweep. Try All, or wait for
the next scan."* Nineteen lines later, `:231` passes `emptyText="No setups meet this scanner's threshold
right now"` to the `DataTable` in the table-layout branch. That branch can only be reached when
`setups.length > 0`, so the second sentence **can never render** — but it is the sentence a future edit will
find first.

### 3.5 What good looks like, in this same codebase

Three surfaces already split the conditions properly and should be the template:

- `Ideas.tsx:425-433` — the only surface in the app that branches on *why* it is empty:
  `state.ideas.length ? 'Nothing matches this filter' : 'No theses yet'`, with matching bodies
  (`'Clear the direction or ticker filter to see the rest.'` vs `'Write one above, or start from an example
  below.'`). **Measured reachable** (fresh storage → `NO THESES YET`).
- `StockDetailDrawer.tsx:402-406` — measured on SBUX:
  > **NO SBUX STORY ON THE WIRE**
  > 18 items ran across the screened universe today and none were on this name. Its News sleeve (63) reads
  > the group's tone instead of a headline.

  It names the population (18), the filter (this name), and the fallback the desk used instead. That is the
  house standard.
- `StockDetailDrawer.tsx:418-422` — measured:
  > **… IS NOT IN THE MODELLED REPORTING WINDOW**
  > The earnings desk models 14 reporters in the current window. Nothing is estimated for a name outside it,
  > so nothing is shown for one.

---

## 4. GATE 29 — rejection / NO TRADE states

Five genuine rejection states exist. Verbatim copy, and whether it names the failing condition and the way back:

### 4.1 `NOT PRICEABLE` — Contract Weigher (`ContractWeigher.tsx:1261-1302`) — **the best one**

Reached with `spy 9999c 0dte` (screenshot `shots5/weigher-notpriceable.png`):

> **NOT PRICEABLE**  ·  `$0.02 mid · Δ0.00 · IV 565%`
> SPY 9999C expiring 08/03/26 prices at the model's $0.02 floor with a delta of 0.00.
> It needs a 1884.4% move by the bell. The 1σ move is 25.1%.
> There is no grade here: theta and liquidity at the floor are model output, not a reading.

Plus two one-click exits (`:1286`, `:1294`): *"Nearest priceable call on this expiry: {strike}C, grades
{score}"* and *"Nearest listed strike: {strike}"*. Condition named, threshold named, magnitude of the miss
named, remedy is a button. **Full marks.**

### 4.2 `NO TRADE` — closing-auction engine (`core/fracture.ts:277-279`) — **P1**

```
classification = 'NO TRADE';
note = 'Imbalance and indicative displacement disagree, or the imbalance is being absorbed — no clean
        closing-auction edge. The 3:53–3:57 window is where the imbalance either confirms or decays.';
```

This is the `else` of a three-branch classifier (`:269`, `:272`, `:274`). The three tests that had to fail are
`|score| ≥ 45 && absorption < 55 && growthZ·normalizedZ > 0`, `|normalizedZ| > 0.5 && absorption ≥ 62`, and
`isRebalance && reversalRisk > 60`. The copy **states a disjunction of two of them and never says which
one actually fired**, never prints the values, and never names a threshold. On the Lotto ladder it is worse:
measured on the weekend pass, `AAPL +62 NO TRADE` renders as a ticker, a score and a two-word verdict with
**no note at all** — a name is rejected next to a name with the same-magnitude score that is not
(`SPY ACTIVE −80 DISLOCATION REVERSAL`), and nothing on screen explains the difference. The engine already
computes `absorptionPct`, `growthZ`, `displacementZ`, `reversalRisk` and `confirmation`; naming the one that
failed costs a template literal.

### 4.3 `NO CLEAN AUCTION EDGE` (`LottoBoard.tsx:689-691`)

> **NO CLEAN AUCTION EDGE**  ·  {the `fracture.ts` note above}
> Pick a name with an actionable read from the ladder above.

Inherits 4.2's ambiguity wholesale, and the remedy ("pick a name with an actionable read") is a browse
instruction rather than a condition. `◐` — I could not reach it: it requires `read.side` to be falsy, and the
board opens on a name selected precisely because it has tickets (`LottoBoard.tsx:475-476`).

### 4.4 `NOTHING PRICEABLE` (`LottoBoard.tsx:693-697`) — good

> **NOTHING PRICEABLE**
> Every listed call on this expiry sits at the model's $0.02 floor. There is no grade to give.

Names the condition and the threshold. Missing: what would reopen it (a different expiry, a different name).
`◐` unreached.

### 4.5 `SKIP` / `NO EDGE` — Earnings (`earnings.ts:299-303`, `earningsintel.ts:356-358, 391-395`) — good

> Premium is fair ({rx}×) and the directional sleeves disagree, so there is no mispricing to harvest and no
> directional edge to lean on. The print prices what the record says it should.
> Nothing is mispriced into the print. What is left is the day-two continuation, once the gap is on the tape.

Names the condition (richness ratio, sleeve disagreement), prints the number, and names what *would* be
tradeable instead. Tone is `neutral` grey (`earnings.ts:57`) — correct, not red.

### 4.6 `INVALIDATED` — reachable nowhere on the scan board, and correctly so

`setupState.ts:47-55` derives four lifecycle states. Measured on the default `/compass` board
(`s5-coverage.mjs`): `{"WAITING":0,"ARMED":8,"TRIGGERED":16,"INVALIDATED":0}`. `data/compass.ts:116-125`
documents this as a deliberate invariant — a scanner ranks the head of a distribution, so it cannot emit an
EXIT — and points at the Tracker and the Weigher as the surfaces where a fading read belongs. That reasoning
is right and I am not calling it a defect.

**The defect next to it is:** `STATE_META[state].hint` (`setupState.ts:73-78`) carries a one-line definition
for each of the four states — *"Qualified, price has not reached the strike"* — and `StateBadge.tsx:20-27`
renders the bare word with **no `title`, no `aria-label`, and no glossary entry**. `SignalBadge.tsx:13-21`
adds neither. `data/terms.ts` (56 lines) and the `/guide` pages contain zero occurrences of `ARMED`,
`TRIGGERED`, `WAITING` or `INVALIDATED`. Two feet away on the same card, the coverage badge *is* wrapped in
`<span title={COVERAGE_META[coverage].note}>` (`SetupScanCard.tsx:109`). One badge explains itself, its
neighbour does not.

---

## 5. GATE 30 — reachability: which states you can actually get to

Driven in the real UI. `✔` = I reached it and captured the copy; `✘` = I tried and could not.

| State | Surface | Result | How |
|---|---|---|---|
| EMPTY (filtered) | Dark Pool | ✔ | query `zzzzqqqq` → `NO PRINTS MATCH` |
| EMPTY (filtered) | Live Tape | ✔ | search `zzzzqqqq` → `NO PRINTS MATCH THE FILTERS` |
| EMPTY (filtered) | Stocks | ✔ | `UTIL` + `>$500` + `Cyc β≥1` → `NO NAMES MATCH THESE FILTERS` |
| EMPTY (filtered) | Earnings | ✔ | `No edge` + `Next wk` → `NO REPORTS MATCH THESE FILTERS` |
| EMPTY (no records) | Community · Feedback | ✔ | fresh storage → `NO NOTES YET` |
| EMPTY (no records) | Community · Ideas | ✔ | fresh storage → `NO THESES YET` |
| EMPTY (no records) | Tracker | ✔ | fresh storage → `Nothing on watch yet` (`Tracker.tsx:601`) |
| EMPTY (unknown ticker) | Top-bar search | ✔ | `ZZQQ` → `NO MATCHES · Nothing matches "ZZQQ"` |
| EMPTY (unknown ticker) | Weigher | ✔ | `zzqq 500c 0dte` → `NO LISTING FOR ZZQQ` + suggestion chips |
| EMPTY (missing input) | Weigher | ✔ | `spy 0dte` → `ADD A STRIKE` |
| EMPTY (expired date) | Weigher | ✔ | `spy 500c 2020-01-17` → `THAT DATE HAS PASSED · 01/17/20 was 2390 days ago` |
| EMPTY (no story) | Stock drawer · NEWS | ✔ | SBUX → `NO SBUX STORY ON THE WIRE` |
| EMPTY (out of window) | Stock drawer · EARNINGS | ✔ | → `IS NOT IN THE MODELLED REPORTING WINDOW` |
| REJECTION | Weigher | ✔ | `spy 9999c 0dte` → `NOT PRICEABLE` |
| UNAVAILABLE | Pulse | ✔ | Customize → Add panel → **Data connections** → DOM Ladder → `DATA UNAVAILABLE` |
| MARKET CLOSED | Lotto | ✔ | faked Saturday → `WEEKEND, CLOSED · THESE PRICE THE NEXT SESSION` |
| **EMPTY (nothing qualified)** | **Compass scan board** | **✘** | **28 configurations: 4 sleeves × 7 presets. Smallest board = 160 contracts, largest = 3,492. Never empty.** |
| **EMPTY (filtered)** | **Flow Scanner** | **✘** | the FILTERS tray exposes no numeric/range input I could drive to exclusion; `CONTRACTS SCANNED 44` throughout |
| **EMPTY (filtered)** | **Community · Requests** | **✘** | all four status filters (`BUILDING / PLANNED / UNDER REVIEW / SHIPPED`) populated |
| **EMPTY** | **Structures board** | **✘** | `StructureBoard.tsx:97` — did not fire on any sleeve |
| **EMPTY** | **Positioning map / Pressure matrix** | **✘** | `NO STRIKES IN WINDOW`, `No chain in range` — never fired |
| **EMPTY** | **Stock drawer · FLOW ×2** | **✘** | 10 names × 3 tabs: `NO OFF-EXCHANGE ROW`, `NO SESSION PRINTS` never fired |
| **EMPTY** | **4 × `DataTable` default** | **✘** | `'No data'` never rendered on `/tracker`, `/compass`, `/pinpoint/history` |
| **LOADING** | **every desk** | **✘** | see §2: 0 visible frames cold, ≤143 ms warm |
| **STALE (HELD)** | **Compass** | **✘** | held one selection for **70 s** (7 sweeps) — `HeldFromSweep` never appeared. `Freshness kind="held"` (`Freshness.tsx:38-46`) has **zero call sites** in `src` |
| **DEGRADED (LISTING tier)** | **Compass card** | **✘** | structurally impossible — see §6 |
| **ERROR (route)** | **global** | **✘** | no interaction I found throws; `AppShell.tsx:119` unexercised |
| **ERROR (panel)** | **Pulse** | **✘** | `PulseWorkspace.tsx:1418` unexercised |

**Fourteen implemented states could not be reached by normal interaction.** Each is code that ships, is
maintained, and has never been seen — including both error boundaries and both halves of the freshness
vocabulary that is not `sweep`.

Compass scan-board counts, all 28 configurations (`s5-empty4.mjs`):

```
0DTE   TOP SETUPS 257 · QUICK SCALP 160 · DISCOUNTED 309 · REBOUNDS 576 · WHALE 172 · ALL 3,492 · ALL TICKERS
WEEKLY TOP SETUPS 302 · QUICK SCALP 198 · DISCOUNTED 374 · REBOUNDS 720 · WHALE 194 · ALL 3,492 · ALL TICKERS
SWING  TOP SETUPS 282 · QUICK SCALP 194 · DISCOUNTED 401 · REBOUNDS 750 · WHALE 206 · ALL 3,492 · ALL TICKERS
LEAPS  TOP SETUPS 293 · QUICK SCALP 196 · DISCOUNTED 405 · REBOUNDS 767 · WHALE 222 · ALL 3,492 · ALL TICKERS
```

---

## 6. GATE 31 — DEGRADED: the one badge that carries it is a constant

`SetupScanCard.tsx:57,109-110` stamps every scan card with a coverage tier from
`core/scanUniverse.ts:105-108`. The three tiers and their own copy (`scanUniverse.ts:86-90`):

```
modeled  MODELED  'Simulated session, chart and dealer map, off a reference price someone set'
covered  COVERED  'Reference price and sector on file, no simulated session behind it yet'
listing  LISTING  'Symbol only, every number derived from the symbol itself'
```

Tally over 24 board configurations (4 sleeves × 6 presets, 24 cards each = 576 badges, `s5-coverage.mjs`):

```
{"MODELED":2,"COVERED":574,"LISTING":0}
```

Tally over the entire field the scanner draws from (`s5-cov.ts`, `npx tsx`):

```
REFERENCED universe: 194   {"modeled":4,"covered":190,"listing":0}
WATCHLIST: 4  TICKERS: 4
scanCoverage('ZZQQ'): listing
```

Three consequences, all measured:

1. **`LISTING` is structurally unreachable from this card.** `listing` requires
   `!REFERENCED_SET.has(ticker)` (`scanUniverse.ts:106`), and the scan pool is built *from* `REFERENCED`
   (`:98, :151, :163`). The amber `warn` tone assigned to it (`SetupScanCard.tsx:26`) is dead ink.
2. **`COVERED` is 99.7 % of the population**, so it carries no information. A badge that reads the same on
   574 of 576 rows is a decoration, not a state.
3. **And what it says is the actual finding.** The #1 card on the default board, captured verbatim
   (`s5-promote2.mjs`, screenshot `shots5/compass-coverage.png`):

   ```
   #1  CME 193P  0DTE · 08/03/26  COVERED  TOP PICK  ARMED
   SCORE 94   HEALTH 45/100   1σ MOVE ±2.4%   MID $1.89
   TREND ALIGNED · AT THE MONEY · 1Σ CLEARS BREAKEVEN · TIGHT BOOK · ALL TIME VALUE
   Breaks above $195.23
   ```

   `COVERED` means, in the terminal's own words, *"no simulated session behind it yet."* A score of 94, a
   health of 45/100, a 1σ move, a mid and a named invalidation price are all printed at full confidence on
   a name the app itself classifies as having no modelled session. **The degraded condition is nearly
   universal on this desk and is styled as unremarkable grey** (`COVERAGE_TONE.covered = 'neutral'`,
   `SetupScanCard.tsx:25`).

Note for whoever fixes this: `scanUniverse.ts:63-72` documents that opening a name calls
`Simulator.ensureTicker` and that *"Registration promotes `covered` to `modeled`"* — i.e. the depth badge is
designed to improve as a side effect of browsing. **I could not reproduce that promotion** in the browser
(clicking a `COVERED` card, navigating away and back left `CME` at `COVERED`, board tally unchanged at
`{"COVERED":24}`), because a full page load resets module state. I am recording it as documented intent I
failed to observe, not as a confirmed defect.

The only other DEGRADED-family signal in the app is `DataUnavailablePanel` (`workspace/DataUnavailablePanel.tsx:12-19`),
reachable on exactly three Pulse panels and worded well:

> **DATA UNAVAILABLE**
> This module needs streaming Level-2 order-book depth for the active symbol. It stays dark until the feed is
> connected — wire it and the module activates behind the same contract.

That is the correct grammar for UNAVAILABLE, used once, on 3 of ~30 Pulse panels.

---

## 7. GATE 32 — freshness: what is claimed vs what the data actually does

### 7.1 The cadences that exist

```
1500 ms   MarketDataContext.tsx:39      price tick — spot, chain, indicators, plan, tape delta
10000 ms  SCAN_EPOCH_MS scanUniverse.ts:118  the scan clock
10000 ms  SCAN_INTERVAL_MS — redeclared as a local constant in NINE files:
          Compass.tsx:48 · PulseWorkspace.tsx:88 · FlowScanner.tsx:493 · GammaChart.tsx:15
          RankedTargets.tsx:19 · ComplexBoard.tsx:12 · VolLab.tsx:16 · VannaCharm.tsx:19
          ExposureProfile.tsx:24 · LiveSections.tsx:33
 8000 ms  LiveTape.tsx:23   READ_INTERVAL_MS — how often the tape re-writes its prose read
10000 ms  ContractWeigher.tsx:88  REPRICE_MS
 1000 ms  TopBar.tsx:100, LottoBoard.tsx:431, EarningsHub.tsx:239, PulseWorkspace.tsx:857
```

### 7.2 The claims that are rendered — inventory over 26 views (`s5-fresh.mjs`)

| view | freshness marker rendered | component |
|---|---|---|
| `/compass` | `SWEEP 17:25:24` (+ `LIVE` on the chain once a contract is selected) | `Freshness` badge, `Compass.tsx:809,878` |
| `/pinpoint/levels` | `SCAN 17:25:56 · 10S` | plain muted text, `ExposureProfile.tsx:110` |
| `/pinpoint/levels?view=ranked` | `SCAN … · 10S` | plain muted text, `RankedTargets.tsx:214` |
| `/pinpoint/greeks?view=migration` | `SCAN … · 10S` | plain muted text, `VannaCharm.tsx:300` |
| `/prove-it?view=volatility` | `CALIBRATED 17:26:39` + `SCAN … · 10S` | plain muted text, `VolLab.tsx:147,150` |
| `/pinpoint/history` | `AS OF` | plain text |
| **20 other views** | **nothing** | — |

Views with no freshness marker of any kind include `/pulse`, `/stocks`, `/news`, `/earnings`, `/tracker`,
`/pinpoint/gamma`, `/pinpoint/greeks`, `/pinpoint/stress`, `/trace/scanner`, `/trace/reconstruction`,
`/trace/dark-pool`, and — measured, with its own text captured — **`/trace/live-tape`**, whose route,
title and product name are all the word *live*:

```
SESSION PREMIUM $39.5M · 400 prints on tape
PAUSE | All Sweeps Blocks | All Bullish Bearish | All ≥$100K ≥$500K ≥$1M | VIEWS COLUMNS
400 OF 400 PRINTS · 0 MARKED
OPTIONS TAPE · NEWEST FIRST · EARLIER SESSION PRINTS BELOW
```

No age, no cadence, no "streaming" indicator, no last-print-received clock. There is a `Paused · N new
prints buffered` line (`LiveTape.tsx:896`) but it only exists in the paused branch.

Two vocabularies for one fact: `/compass` uses the `Freshness` badge component
(`components/compass/Freshness.tsx`) — a silver pill reading `SWEEP hh:mm:ss` with a `title` explaining the
10 s clock — while four other desks on the same 10 s clock print `scan hh:mm:ss · 10s` as unstyled muted
text. `Freshness` has **five call sites, all in `Compass.tsx`**; it is not exported anywhere else.

### 7.3 There is no staleness threshold, for any data type

Searched for any age-vs-threshold comparison in `src` (excluding tests and the trailer):
`grep -rn "Date.now() - |now - |ageMs|ageSec|elapsed"`. Every hit is either an animation easing term
(`LiquidityHeatmapChart.tsx:454`, `StrikeChart.tsx:385`), a scheduling test
(`now - lastScanTimeRef.current >= SCAN_INTERVAL_MS`, 9 files), or a fixture generator
(`darkpool.ts:295`, `news.ts:448`, `flowscan.ts:94`).

**Nothing in this application ever calls any datum old.** There is no threshold at all, so the question of
whether thresholds are differentiated by data type is moot in the strictest sense: quotes (1.5 s), sweeps
(10 s), open interest (per-sweep), news (rows dated up to `1h 22m ago`, measured on `/news`) and earnings
(a 14-name window) are governed by **one implicit threshold: infinity**. The News desk is the only surface
that renders an age at all — `16m ago`, `26m ago`, `1h 5m ago`, `1h 22m ago` — and a 1 h 22 m headline is
styled identically to a 16 m one.

The single stale-state component in the app, `HeldFromSweep` (`Compass.tsx:106-114`), is the right idea:

> **HELD** from the 17:21:53 sweep. The 17:22:03 sweep does not rank this contract, so the grade here is the
> one it was opened with rather than a fresh read.

I held one selection on `/compass` for **70 seconds — seven sweep cycles** — and it never fired
(`s5-stale.mjs`). `Freshness`'s own `held` variant (`Freshness.tsx:38-46`) has zero call sites.

### 7.4 Market-closed: 16 of 17 desks cannot tell you there is no session — **P0**

`Date` frozen to 2026-08-08 (**Saturday**) 13:00 ET, compared against 2026-08-03 (Monday) 13:00 ET
(`s5-closed.mjs`). Search for any of `closed|weekend|holiday|after hours|pre-market|next session|shut`
present in the weekend render and absent from the open render:

```
route                    | openLen | shutLen | closed-words present only when shut
/pulse                   |    5611 |    5719 | — none —
/compass                 |    6600 |    6639 | — none —
/compass?view=lotto      |    3486 |    3606 | closed, weekend, next session
/stocks                  |   21047 |   21121 | — none —
/news                    |    5276 |    5544 | — none —
/earnings                |    3662 |    3663 | — none —
/tracker                 |    6884 |    6862 | — none —
/pinpoint/gamma          |    1924 |    1904 | — none —
/pinpoint/levels         |    4509 |    4490 | — none —
/pinpoint/greeks         |    2220 |    2205 | — none —
/pinpoint/stress         |    2261 |    2277 | — none —
/pinpoint/history        |    3684 |    3598 | — none —
/trace/live-tape         |    3966 |    3967 | — none —
/trace/dark-pool         |   33738 |   33922 | — none —
/trace/scanner           |    4522 |    4520 | — none —
/trace/reconstruction    |    4611 |    5662 | — none —
/terminal                |    1672 |    1672 | — none —
```

Captured verbatim from the **Saturday** render:

- `/trace/dark-pool` → `OFF-EXCHANGE SHARE 50.9% — of today's volume printed away from the lit book` ·
  `BLOCK NOTIONAL $7.0B — 240 prints · 179 over $1M` · `LARGEST BLOCK $129.5M — crossed at $499.66 on BANK ATS`
- `/trace/live-tape` → `SESSION PREMIUM $39.5M — 400 prints on tape` · `SWEEPS 133 — aggressive orders`
- `/trace/scanner` → `CONTRACTS SCANNED 44` · `TOTAL PREMIUM $713.8M` · `NET DIRECTIONAL +$82.3M — bullish premium leads`
- `/compass` → a full 0DTE board dated `08/10/26`

The phrase *"of today's volume"* is an explicit claim about a session that does not exist. The market phase
is computed correctly six lines away (`core/calendar.ts:279-291` returns `weekend`) and consumed by exactly
two things: `mocClock.ts:47` (Lotto) and `TopBar.tsx:236`, where it is a **`title` attribute**:

```tsx
title={`New York time — market ${clock.label.toLowerCase()}`}
```

Confirmed in the DOM: the visible top-bar text is `SPY | $503.87 | +0.77% | 13:10:57 | ET` — the phase word
(`Open` / `Weekend` / `Holiday` / `After hours`) never renders as text anywhere in the application.

The one surface that gets it right is the Lotto board, and it is worth quoting as the template
(`LottoBoard.tsx:655-666` + the playbook note):

> `TIME TO CLOSE — closed — weekend, closed`
> `1DTE LOTTO BOARD` / `WEEKEND, CLOSED · THESE PRICE THE NEXT SESSION`
> The auction has not published. Grades are flow and liquidity only. This is the modelled closing-auction
> read for the session, not an exchange feed.

Even there, the header above it still prints `AUCTION READ · DISLOCATION REVERSAL`, `MOC SCORE −80`,
`IMBALANCE SELL $863.2M · −1.12σ normalized` — a closing-auction imbalance read, in full, on a Saturday.

### 7.5 Every desk timestamp is in the viewer's timezone; the market clock is not — **P0**

`s5-clock.mjs`, three `timezoneId` values, same instant:

| viewer TZ | top bar (ET) | Live Tape newest print | Compass sweep badge | Dark Pool print times | Pinpoint history "as of" |
|---|---|---|---|---|---|
| `UTC` | `13:23:54` | `5:23:55 PM` | `17:23:55` | `13:41 · 13:55 · 11:09` | `17:24` |
| `Asia/Tokyo` | `13:24:08` | `2:24:07 AM` | `02:24:09` | `23:50 · 00:18 · 22:31` | `02:24` |
| `America/New_York` | `13:24:21` | `1:24:21 PM` | `13:24:22` | `09:41 · 09:55 · 07:09` | `13:24` |

In Tokyo the tape's newest print is stamped **2:24 AM** and the market clock 12 px away reads **13:24 ET** —
11 hours apart. `/pinpoint/history` draws a session axis labelled `09:30 … 16:00` and stamps itself
`AS OF 02:24`, outside its own axis. Dark Pool blocks are stamped `22:31`–`00:18`, outside any US session.

`core/calendar.ts:236` is the **only** `timeZone: 'America/New_York'` in `src/` outside the trailer, and
`calendar.ts:257-266` documents exactly this bug being fixed for the top bar. Twelve other formatters were
not migrated:

```
components/compass/sweepClock.ts:7       toLocaleTimeString('en-GB')   → Compass SWEEP + HELD banner
data/tapeSeed.ts:93                      toLocaleTimeString()          → every backfilled tape print
core/simulator.ts:586, :650              toLocaleTimeString()          → every live tape print
pages/gex/RankedTargets.tsx:126          toLocaleTimeString('en-GB')   → 'scan hh:mm:ss'
pages/gex/VolLab.tsx:66                  toLocaleTimeString('en-GB')   → 'calibrated hh:mm:ss'
pages/gex/VannaCharm.tsx:215             toLocaleTimeString('en-GB')   → 'scan hh:mm:ss'
pages/gex/ExposureProfile.tsx:68         toLocaleTimeString('en-GB')   → 'scan hh:mm:ss'
components/gex/vannacharm/WallDrift.tsx:48  toLocaleTimeString('en-GB')
pages/gex/GexHistory.tsx:226             toLocaleDateString('en-US')   → session date
pages/community/book.ts:116              toLocaleTimeString('en-US')
pages/Tracker.tsx:243, :451              toLocaleDateString()          → 'Tracked <date>'
```

---

## 8. Findings

| # | Sev | Gate | Finding | Evidence |
|---|---|---|---|---|
| S1 | **P0** | 32 | 16 of 17 desks render identically with the market shut; Dark Pool claims "of today's volume", Live Tape claims "session premium · 400 prints" on a Saturday | `s5-closed.mjs` table §7.4; phase consumed only at `mocClock.ts:47` and `TopBar.tsx:236` (`title=`) |
| S2 | **P0** | 32 | Desk timestamps are viewer-local, the market clock is ET — 11 h disagreement on one screen in Tokyo | `s5-clock.mjs` §7.5; 12 formatters listed |
| S3 | **P1** | 31 | The only DEGRADED signal on the Compass board reads `COVERED` on 574/576 cards, meaning "no simulated session behind it", under a SCORE 94 | `s5-coverage.mjs`, `s5-cov.ts` §6 |
| S4 | **P1** | 32 | No staleness threshold exists for any data type; `HELD` unreachable in 70 s; `Freshness kind="held"` has 0 call sites | §7.3, `s5-stale.mjs` |
| S5 | **P1** | 29 | `NO TRADE` states a disjunction of 2 of 3 possible failures, names no threshold, prints no value; on the ladder it renders with no note at all | `fracture.ts:277-279`; weekend capture `AAPL +62 NO TRADE` |
| S6 | **P1** | 6/26 | LOADING is written 11× and visible 0 ms cold (100 % of frames behind the launch gate) / ≤143 ms warm | `s5-launchgate.json`, `s5-spanav.mjs` §2 |
| S7 | **P1** | 28 | Dark Pool's empty state instructs the reader to widen three controls, none of which caused the emptiness | `DarkPool.tsx:589-592`, `shots5/dp-empty.png` |
| S8 | **P1** | 30 | 14 implemented states are unreachable by normal interaction, including both error boundaries and `Compass`'s only empty state (28 board configurations, min 160 rows) | §5 table |
| S9 | **P2** | 28 | Live Tape collapses "no prints yet" and "filtered to nothing" into one node with **no body on either branch**; the first branch is unreachable | `LiveTape.tsx:1055`, `tapeSeed.ts:40` |
| S10 | **P2** | 28 | 4 `DataTable` call sites answering 4 different questions all fall back to the literal `'No data'`, with no body | `DataTable.tsx:58,163`; `EdgeLedger:299`, `ImpactLeaderboard:115`, `SetupCompare:320`, `GexHistory:459` |
| S11 | **P2** | 29 | The lifecycle badge (`ARMED`/`TRIGGERED`) has a written definition that is rendered nowhere — no title, no aria-label, no glossary entry — while the badge beside it does have a tooltip | `setupState.ts:73-78` vs `StateBadge.tsx:20-27`, `SignalBadge.tsx:13-21`, `terms.ts` |
| S12 | **P2** | 32 | Two vocabularies for one 10 s clock: the `Freshness` badge (5 call sites, all Compass) vs plain `scan hh:mm:ss · 10s` text on 4 other desks; `/trace/live-tape` has no marker at all | §7.2 |
| S13 | **P2** | 31 | `LISTING` (the amber coverage tier) is structurally unreachable — `listing` requires a ticker outside `REFERENCED`, and the pool is built from `REFERENCED` | `scanUniverse.ts:98,106,151,163`; `s5-cov.ts` → `listing: 0` |
| S14 | **P2** | 6 | `Skeleton` is `aria-hidden` with no `aria-busy` / `role="status"` anywhere — a screen reader is told nothing during loading | `Skeleton.tsx:12,17,27`; 10 `aria-live` hits, none a loading announcement |
| S15 | **P3** | 28 | `SetupScanBoard` carries two different sentences for one condition; the `emptyText` at `:231` is dead behind the guard at `:207` | `SetupScanBoard.tsx:207-212, 231` |
| S16 | **P3** | 32 | The public landing hero prints a static `SLAYER/LIVE 09:41:22 ET` in its code-rain (decorative, but it is a LIVE claim with a frozen ET stamp) | `pages/landing/rainPool.ts:66,99,129,203,267` |

---

## 9. What I could NOT audit

- **The ERROR states.** Neither `RouteErrorBoundary` (`AppShell.tsx:119`) nor `PanelErrorBoundary`
  (`PulseWorkspace.tsx:1418`) could be triggered by any interaction I found on the production build, and
  this is an audit phase so I did not inject a fault. Their copy reads well statically; I have not seen
  either render. Both are marked ◐ in the matrix, not ●.
- **The coverage-tier promotion.** `scanUniverse.ts:63-72` documents that opening a name promotes it from
  `covered` to `modeled`. I could not reproduce it across a page load (module state resets). It may hold
  within a single SPA session on a path I did not exercise. Recorded as unverified intent.
- **Four `StockDetailDrawer` / Pulse-panel empty branches** (`:451`, `:496`, `MarketNotes.tsx:69`,
  `PositioningMap.tsx:432`, `PressureMatrix.tsx:41`, `StructureBoard.tsx:97`, `ContractTrack.tsx:150`) — I
  drove 10 names × 3 tabs and every sleeve, and none fired. They may be reachable on data I did not sample;
  I am reporting them as unreached, not as impossible.
- **The Flow Scanner's FILTERS tray.** Its controls did not expose any `input` element to Playwright
  (`main input` → `[]`), so I could not drive `FlowScanner.tsx:700` to empty. Reported as unreached.
- **Holiday and early-close behaviour.** I faked one weekend and one open Monday. `EARLY_CLOSES` and
  `MARKET_HOLIDAYS` (`core/calendar.ts`) are exercised by `calendar.test.ts` but I did not render the app
  on a half-day or a holiday.
- **Real network degradation.** There is no network data layer, so no genuine `ERROR` / `DEGRADED` /
  timeout path exists to test. Everything in §7 is about a simulator's *claims*, not about a feed failing.
- **Mobile / narrow viewports.** Every measurement in this document is 1440×900. Empty-state copy that
  fits at 1440 may clip at 375; not checked.
