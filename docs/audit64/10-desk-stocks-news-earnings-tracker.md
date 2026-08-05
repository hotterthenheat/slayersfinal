# 10 — Desk audit: Stocks, News, Earnings, Tracker (Gates 55, 56, 57, 58)

Scope: `/stocks` (+ the `StockDetailDrawer` and its five tabs), `/news` (Outcome + Deep read), `/earnings`
(board, slate, plays, dossier), `/tracker` (seven saved views + Edge Ledger).
Build under test: the production bundle already served at `http://127.0.0.1:8123` — not rebuilt, not restarted.
Viewports: 1440×900 and 390×844. Browser: bundled Chromium 1194, headless, `slayer_onboarded_v1=1`.
Session under test: active chain ticker SPY (+0.78%), container TZ = **UTC**, app ET clock ≈ 15:21–15:34.
`/tracker` was seeded with a six-item book via `slayer_tracked_setups` so the real table renders instead of
the empty state; every other desk is untouched.

Everything below is a measurement. Where I could not reproduce something I say so in
[§10 Not audited](#10-what-i-could-not-audit).

Scratch scripts: `…/scratchpad/g55/01_routes.mjs` … `18_perf.mjs`.
Screenshots: `docs/audit64/shots/G55_*`, `docs/audit64/shots/G13_{stocks,news,earnings,tracker}_p*.png`.

---

## 1. Route geometry and a11y (measured)

| Route | scrollHeight @1440 | @390 | DOM nodes | axe violations @1440 | h-overflow @390 |
|---|---:|---:|---:|---:|---:|
| `/stocks` | 2 053 px | 3 180 px | **9 279** | 0 | none |
| `/news` | 1 572 px | 3 010 px | 1 233 | 0 | none |
| `/earnings` | 1 990 px | 2 781 px | 1 061 | 0 | none |
| `/tracker` | 2 455 px | 4 522 px | 1 307 | 0 | none |

**axe-core 4.x, `resultTypes: ['violations']`, full document, all four routes at 1440×900: 0 violations each.**
That is a real result and it is good. `document.documentElement.scrollWidth === clientWidth` at 390 on all
four routes — no page-level horizontal overflow; the wide tables scroll inside their own containers
(1 086 px on `/stocks`, 1 021 px on `/earnings`, 722 px on `/tracker` inside a 390 px viewport).

Small tap targets at 390 (<24 px in either axis): **23 on every one of the four routes**. I enumerated them
on `/stocks`: 22 are footer links in the shared shell (`Pulse` 32×14, `FAQ` 23×14, `Terms` 35×14 …) plus the
1×1 skip link. **None are desk-owned**, so this is a shell finding, not one of these four desks. The one
desk-owned exception is in §4 (F-22).

---

## 2. P0 — wrong or misleading numbers, and one broken workflow

### P0-1 · The session day and the earnings countdown run on the browser's clock while the terminal shows ET

`dayKey()` is `new Date().getFullYear()/getMonth()/getDate()` — **local** calendar (`src/core/rng.ts:41-44`).
`targetTime()` sets the report hour with `d.setHours(e.slot === 'BMO' ? 8 : 16, …)` — **local** hours
(`src/pages/EarningsHub.tsx:212-218`). `TopBar.tsx:236-240` renders New York time and labels it `ET`.

Measured at one instant, four `timezoneId` contexts, same server, same build
(`scratchpad/g55/09_tz.mjs`, shots `G55_TZ_*.png`):

| context TZ | app ET clock | countdown block | first row of the board |
|---|---|---|---|
| `America/New_York` | 15:31:55 | `EA · Mon 08/03 AMC · **00:28:04**` | EA · Mon 08/03 AMC · today |
| `America/Los_Angeles` | 15:32:03 | `EA · Mon 08/03 AMC · **03:27:56**` | EA · Mon 08/03 AMC · today |
| `UTC` | 15:31:52 | `EA · Mon 08/03 AMC · **ON THE TAPE**` | EA · Mon 08/03 AMC · today |
| `Asia/Tokyo` | 15:31:59 | `**GOOGL** · Wed 08/05 AMC · **1d 11:28:00**` | **GOOGL** · Wed 08/05 AMC · 1d out |

Three distinct failures from one root cause:

1. In UTC the desk badges an AMC print **"On the tape"** (amber, pulsing) while its own clock reads
   15:31 ET — thirty-one minutes before the 16:00 ET bell it is counting to.
2. In Los Angeles the same print is 3 h 00 m further away than it is — the countdown is off by exactly the
   PT offset.
3. In Tokyo the *whole slate is a different day*: EA is not on the board at all, the leading reporter is
   GOOGL on 08/05, and the countdown targets a different company. `dayKey()` has rolled the session forward,
   so the news feed, the stock board and the earnings calendar are all a day ahead of the ET clock above
   them.

This is a broken workflow, not just a wrong number: the alert countdown is the one live, ticking, decision-
carrying object on `/earnings`, and it is wrong for every user outside `America/New_York`.

**Fix (smallest coherent):** derive both the session day and the report timestamp in ET rather than local —
one `nowET()` helper wrapping `Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York' })`, used by
`dayKey()` and by `targetTime()`. Everything downstream already trusts these two.

---

### P0-2 · Three of the four Stocks sleeves are uniform random draws wearing the names of measurements — and they contradict the drawer's own engines on the same screen

`src/data/stocks.ts:111-119`:

```ts
momentum: Math.round(hRange(s('mom'), 18, 96)),
quality:  Math.round(hRange(s('qual'), 25, 94)),
flow:     Math.round(hRange(s('flow'), 15, 95)),
news:     Math.round(50 + tickerSentiment(ticker) * 48),   // <- the only derived one
```

`src/data/factorGuide.ts:17-31` labels them, and both the board's Factors popover and the drawer's Factor
breakdown render those labels verbatim:

- Momentum — *"Trend & RSI posture — is price working with the trade or against it."*
- Quality — *"Fundamental screen — margins, growth and balance-sheet health."*
- Flow — *"Positioning — options flow and dark-pool lean, accumulation vs distribution."*

These three sleeves carry **82 % of the composite weight** (0.32 + 0.24 + 0.26, `stocks.ts:109`), and the
composite drives the row ranking, the STRONG/NEUTRAL/WEAK verdict (`stocks.ts:158`), the sector board score
(`stocks.ts:196`) and the drawer's generated thesis sentence (`stocks.ts:130-149`).

The proof that this is a labelling defect and not "it's a simulator, everything is generated" is that the
same drawer computes the real quantities one tab away, from `Simulator.buildSnapshot` and `buildPulseFlow`,
and disagrees with itself. Measured over the top 10 rows of the composite-sorted board
(`scratchpad/g55/04_sleevecheck.mjs`, shots `G55_I_stocks_drawer_*.png`):

| Ticker | Momentum sleeve | drawer's own RSI(14) | drawer's own EMA stack | thesis sentence it generates |
|---|---:|---:|---|---|
| AAPL | **96** | 45.7 | **9 < 21 < 50** | "trend and RSI both constructive" |
| MSFT | **91** | 42.8 | **9 < 21 < 50** | "trend and RSI both constructive" |
| LLY | **94** | 49.7 | **9 < 21 < 50** | "trend and RSI both constructive" |
| ZTS | **94** | 47.2 | crossed | "trend and RSI both constructive" |
| MDLZ | **93** | 50.2 | 9 > 21 > 50 | "trend and RSI both constructive" |
| MO | **83** | 42.3 | **9 < 21 < 50** | — |
| AMZN | 88 | 63.2 | 9 > 21 > 50 | "trend and RSI both constructive" |

**9 of 10 names carry an RSI between 42.3 and 50.2 while their Momentum sleeve reads 83–96**, and four of
them show a fully bearish EMA stack under a sentence that says the trend is constructive. Only AMZN is
coherent, and by chance.

Same for Flow, against the drawer's Flow tab:

| Ticker | Flow sleeve | calls / puts | bull prem / bear prem | off-exch vs own avg |
|---|---:|---:|---|---:|
| SBUX | **89** | 10 / 24 | $3.2M / **$4.2M** | **60 %** |
| AAPL | **88** | 8 / 26 | $4.9M / **$5.1M** | — |
| MSFT | **71** | — | $14.3M / **$34.8M** | — |
| ZTS | **67** | — | $2.7M / **$4.0M** | — |
| MO | **93** ("flow and dark pool lean accumulative") | — | $3.4M / $3.2M, P/C 1.00 | — |

Quality is worse than mislabelled: **there is no fundamentals data anywhere in this repo.** A 0–100 number
captioned "margins, growth and balance-sheet health" asserts an input the terminal does not have, on the
board's second-densest column.

**Fix:** derive the three sleeves from the engines the drawer already calls for the same ticker —
Momentum from `Simulator.buildSnapshot(ticker).indicators` (RSI + EMA stack, both already rendered), Flow
from `buildPulseFlow(ticker)` bull/bear premium split and `buildDarkPoolFeed()` `avgVolPct` (both already
rendered) — and either drop Quality or rename it to what a scale-free draw honestly is. No new data source.

---

### P0-3 · The "30d RS" column's dictionary entry claims a sector benchmark the column never touches

`src/data/terms.ts:49`: `'30d RS': 'Relative strength vs sector over 30 days — above the line is outperforming.'`
It is wired as a `help` tooltip on the column header (`Stocks.tsx:550-553`, `DataTable.tsx:150`), so the
definition is one hover from the sparkline.

The series behind it (`stocks.ts:160-165`):

```ts
let level = 50;
for (let i = 0; i < 30; i++) { level += hGauss(`${u.ticker}-${day}-tr-${i}`) * 3 + (comp - 55) * 0.06; trend.push(level); }
```

A drifted random walk seeded off the composite. No sector, no benchmark, no ratio — nothing the words
"relative strength vs sector" or "outperforming" describe. The up/down colour is
`trend[last] >= trend[0]`, i.e. the sign of the accumulated drift.

### P0-4 · The rotation map's two axes are captioned as relative strength and computed as gaussian noise

`Stocks.tsx:270` prints the axis legend: *"x 1 month relative strength · y 1 week · crosshair is flat on both"*,
and `SectorRow.rs1w` / `rs1m` are documented in `stocks.ts:86-88` as *"1-week relative strength vs the tape,
signed %"*. The computation (`stocks.ts:197-198`):

```ts
const rs1w = hGauss(`${sector}-${day}-rs1w`) * 1.2 + (score - 55) * 0.05;
const rs1m = hGauss(`${sector}-${day}-rs1m`) * 2.2 + (score - 55) * 0.09;
```

No tape, no index, no comparison. The phase (`LEADING`/`IMPROVING`/`WEAKENING`/`LAGGING`) is then the sign
pair of those two draws (`stocks.ts:202-203`), which is why the map and the strip can never disagree — they
are the same noise drawn twice. The hover readout re-quotes them as "1w RS +0.4 % / 1m RS +0.7 %"
(measured, `G55_I_stocks_rotation_hover.png`).

This matters more than the other label defects because the rotation map *is* this desk's signature object
(see §5). Note that `score`, `breadthPct`, `memberCount`, `offExDollars` and `dollarSharePct` on the same
row **are** honestly derived (from the picks and from `buildDarkPoolFeed()`), so the fix is to plot two of
those instead of two draws.

---

### P0-5 · The earnings board's verdict and its structure come from two engines and contradict each other on 5 of 14 rows

`EarningsHub.tsx:102-121` carries a comment stating this exact class of bug was fixed:

> *"They cut richness at different thresholds (0.85/1.3 vs 0.9/1.18) … so the same print could read 'Call
> spread' in the table and 'Put debit spread' in the dossier below it. Now there is one call and the board is
> a projection of it."*

Only the **structure name** was unified. The **verdict badge** still comes from `earnings.ts decide()`
(`earnings.ts:242-304`, cutting richness at 0.85 / 1.3) while the structure comes from
`earningsintel.ts` `recommended` (`earningsintel.ts:341-359`, cutting at 0.9 / 1.18 and choosing its wing
from the skew, not from `directionVote`). The board renders both side by side in one cell (`TradeRead`,
`EarningsHub.tsx:302-322`).

Full slate as rendered (`scratchpad/g55/14_rest.mjs`, shot `G55_D_earnings_p2.png`):

| Ticker | rich | verdict badge | structure named beside it | conviction named beside it |
|---|---:|---|---|---|
| TTWO | 0.94× | **NO EDGE** | **Call debit spread** | split |
| UNP | 0.92× | **NO EDGE** | **Call debit spread** | split |
| DELL | 1.21× | **NO EDGE** | **Call debit spread** | split |
| COST | 1.61× | RICH | **Call debit spread** | **down** moderate |
| PINS | 1.31× | RICH | **Call debit spread** | **down** moderate |

- **3 of 14 rows badge "NO EDGE" next to a named long structure.** `structureOf` only returns
  "Day-2 continuation" when `recommended === 'SKIP'`; on these three the dossier says LONG while the board
  says SKIP.
- **2 of 14 rows name a call structure beside a "down" conviction** — the structure's direction comes from
  `wingDir` (skew edge, `earningsintel.ts:281`), the conviction's from `directionVote` (revisions/flow/setup,
  `earnings.ts:214-226`). Two direction sources, one cell.
- DELL is the threshold case the comment predicted: richness 1.21 is "Vol fair" to the board (< 1.3) and
  rich to the dossier (≥ 1.18), which is why it prints "Vol fair +1.7pt · split · NO EDGE · Call debit spread".

**Fix:** make the verdict a projection of the dossier too — `VERDICT_LABEL[e.verdict]` should read off
`view.recommended` + `view.mispricing.component`, not off a second threshold table; and `structureOf` should
return the neutral label whenever the rendered verdict is SKIP.

---

### P0-6 · News "Deep read" tiles four numbers about SPY under a panel headed with the selected headline's ticker

Selecting the Morgan Stanley earnings headline and switching the right pane to **Deep read** produces, verbatim
(`scratchpad/g55/07_news3.mjs`, shot `G55_I_news_deep_row0.png`):

> **DEEP READ** · MS
> Morgan Stanley misses revenue estimates; cost inflation weighs
> POSITIONING READ **SPY** — 0 SINGLE-NAME · 2 MACRO
> **PRICED IN 27 %** *of move discounted* · **WIRE VS BOOK NEUTRAL** *−3 lean gap* ·
> **MEDIAN HALF-LIFE 2.3 sess** *catalyst decay* · **EVENT VOL ±0.6 %** *implied event move*
> LOUDEST CATALYST **MACRO** · 2 informational · 0 mechanical · book BALANCED
> "No positioning breakdown for MS yet."

Every one of those four Stats is computed over `buildNewsIntel(marketData)` — the **active chain ticker**,
SPY (`newsintel.ts:319-341`, `NewsIntel.tsx:186-187, 211-221`) — and SPY has **zero** headlines in today's
feed. So the panel a reader opened to understand a Morgan Stanley earnings miss reports that 27 % of *the
move* is discounted, that the half-life is 2.3 sessions, and that event vol is ±0.6 %, all of it about a
different instrument, none of it scoped in the Stat labels. The only scoping is the small grey word "SPY"
inside the block.

**Coverage measured across the whole feed:** 17 wire units, 18 headlines. **0 of 17 units render a per-headline
breakdown for their own subject.** 15 render "No positioning breakdown for <TICKER> yet."; 2 macro items
render a real breakdown, because `buildNewsIntel` takes `feed.filter(n => n.ticker === null).slice(0, 2)`
(`newsintel.ts:335`) — the third, fourth and fifth macro items get nothing either.

So the desk's deepest surface — the one carrying half-life, priced-in, informational-vs-mechanical, the
narrative-vs-positioning diverging bars, the closest analogs and the **only invalidation statement anywhere
on `/news`** — is empty for **16 of 18 headlines** and misattributed on all of them.

**Fix:** either scope the four aggregate Stats to the selected headline's own subject (they are per-headline
quantities already — `HeadlineIntel` carries `pricedInPct`, `halfLifeHours`, `eventVolPct`, `agreement` per
item), or label them "SPY book" so they stop reading as facts about the story on screen. The second is a
one-line change; the first is the one that makes the tab worth opening.

---

### P0-7 · `/stocks` is the one desk of the four with no provenance disclosure at all

Measured on the rendered board at 1440 (`scratchpad/g55/16_color.mjs`): the visible body text of `/stocks`
contains **0 occurrences** of `MODELED`, `modeled`, `generated` or `simulated`. For comparison, `/news`
stamps `MODELED` on all 18 rows (`news.ts:68`, and the module comment at `news.ts:1-15` explains why), and
`/earnings` carries 19 provenance mentions ("modeled avg", "8 modeled reports", "no market history stands
behind them").

Meanwhile `/stocks` prints, with no caveat: 192 dollar prices to the cent with signed intraday percentages
(`$232.77 +0.16 %`), a per-name beta, a "Fundamental screen — margins, growth and balance-sheet health"
score, a "30d RS" sparkline, and $32.5B of off-exchange notional. Two of those are asserted inputs the
terminal does not have (§P0-2, §P0-3). The repo has already settled the house rule for this on two other
desks; this desk did not get it.

---

## 3. P1 — significant defects

### P1-1 · `bg-white/12`, `bg-bull/12` and `bg-bear/12` are never emitted, so three Tracker fills render transparent

Tailwind's opacity scale in this build steps by 5. Grepping the shipped stylesheet
(`dist/assets/index-qTGYiqDG.css`): `bg-white/10`, `/15`, `/20`, `/25`, `/30`, `/35`… are present;
**`bg-white/12`, `bg-bull/12` and `bg-bear/12` are absent.** Three source sites use them, all on `/tracker`:

- `Tracker.tsx:461` — the **Closed** lane of the "Book across lanes" bar.
- `Tracker.tsx:88` — the pinned **Triggered** status button.
- `Tracker.tsx:89` — the pinned **Invalidated** status button.

Confirmed at runtime (`scratchpad/g55/17_last.mjs`, shot `G55_I_tracker_statuspins.png`):

```
LANE segments  barBox 882×8
  Active       16.67%  bg-white/35  rgba(255,255,255,0.35)
  Triggered    16.67%  bg-bull/80   rgba(48,209,88,0.8)
  Invalidated  33.33%  bg-bear/70   rgba(255,59,48,0.7)
  Closed       33.33%  bg-white/12  rgba(0,0,0,0)      <-- invisible
PIN Triggered   bg: rgba(0,0,0,0)  border: rgba(48,209,88,0.35)  cls: bg-bull/12
PIN Invalidated bg: rgba(0,0,0,0)  border: rgba(255,59,48,0.35)  cls: bg-bear/12
```

**294 px of an 882 px bar captioned "6 tracked" is blank**, so the bar reads as a partition of two-thirds of
the book. The status pins lose their fill and keep only a 1 px tinted border. The code comment at
`Tracker.tsx:455-456` — *"every tracked item sits in exactly one, so their counts partition the book and
stack cleanly into one bar"* — is true of the data and false of the pixels.

### P1-2 · The Tracker stores a decision packet, then throws most of it away and never shows the rest

`TrackedSetup` (`src/types/tracker.ts:12-33`) persists exactly:
`id, contract, ticker, strike, right, scanner, sleeve, trackedAt, scoreAtTrack, verdictAtTrack`.

Measured against the gate's requirement:

| decision-packet field | stored? | rendered? |
|---|---|---|
| entry timestamp | yes (`trackedAt`) | yes — "Tracked 7/31/2026" |
| contract | yes | yes |
| setup state at entry | yes (`verdictAtTrack`) | **never** |
| forecast at entry | only the score | score only, as a delta |
| risk / invalidation at entry | **no** | shows the *current* one |
| model version | **no** | — |
| alternatives considered | **no** | — |
| outcome | **no** | — |
| counterfactual | **no** | — |

Two hard consequences:

1. **`verdictAtTrack` is written and never read.** `grep -rn "verdictAtTrack" src/` returns two writes in
   `TrackerContext.tsx:86,109` and zero reads. The one piece of entry-time state besides the score is dead.
2. **The invalidation shown is the live one, not the entry one.** `ItemDetail` renders
   `live.invalidationReason` / `live.invalidationPrice` (`Tracker.tsx:271-279`), rebuilt through
   `rebuildLive()` on every open. When the level moves, the tracker silently rewrites what the operator said
   they were risking. That is the opposite of an immutable packet.

`trackSetup(setup, scanner)` receives the whole `Setup` — including `expectedMovePct`, `confidence`,
`invalidationPrice`, `invalidationReason` and `mid` — and discards all of them
(`TrackerContext.tsx:71-91`). Persisting five more numbers at write time costs nothing and no new data source.

### P1-3 · Process states are painted in market-direction colours on the Tracker and Stocks boards

The house rule is stated inside this repo twice, in the exact context of this defect:

- `src/data/stocks.ts:40-42` — *"A verdict is a process state, so it takes the chrome tones … "*
- `src/pages/Stocks.tsx:82-87` — *"A sleeve score is a MAGNITUDE: 74 on quality is not a bullish reading of
  anything, and dressing it in bull green had the densest column on the board arguing a direction the number
  never claimed."*

Measured colours (`scratchpad/g55/16_color.mjs`), house bull green = `rgb(48, 209, 88)`, bear red = `rgb(255, 59, 48)`:

| surface | file:line | rendered colour | what the number is |
|---|---|---|---|
| Stocks **composite Score** column, all 8 top rows (87, 85, 83, 80, 80, 80, 79, 79) | `Stocks.tsx:574` | `rgb(48,209,88)` | the weighted mean of four sleeves — the exact "magnitude" the comment 490 lines above forbids painting green |
| Stocks compare tray composite | `Stocks.tsx:688` | same | same |
| Stock drawer composite Stat | `StockDetailDrawer.tsx:329` | same | same |
| StatCard "Strong names 48" / "Weak names 37" | `Stocks.tsx:597-598` | green / red | counts of a screen verdict |
| Tracker **score delta** `+7` | `Tracker.tsx:253, 395` | `rgb(48,209,88)` | change in model quality since entry |
| Tracker StatCard "Triggered 1" | `Tracker.tsx:662-667` | `rgb(48,209,88)` | count of items whose engine reads QUALIFIED |
| Tracker lane bar Triggered / Invalidated | `Tracker.tsx:459-460` | `rgba(48,209,88,.8)` / `rgba(255,59,48,.7)` | lane membership |

A tracked **put** whose score rises prints `+7` in bull green; a tracked call whose score falls prints red.
Neither statement is about market direction. Earnings and Stocks already moved their verdicts to
select/warn/neutral; the composite and the whole Tracker did not.

### P1-4 · The Stocks board renders all 192 rows, and it costs 168 ms per sort

`DataTable` has no virtualization — it is a plain `sortedRows.map` (`DataTable.tsx:167`). Measured on `/stocks`:

- 9 279 DOM nodes on the page, **8 858 of them inside the one table**; 400 `<svg>` elements (192 sparklines
  + icons). Each row carries four `SleeveBar`s and a sparkline.
- Sort click → two animation frames, five trials: **176, 222, 162, 168, 158 ms** (median 168 ms).
- Same click with the board scoped to Utilities (10 rows): **29, 31, 33, 29, 32 ms** (median 31 ms).

A 5.4× regression, and 168 ms is past the threshold where a header click stops feeling like a direct
manipulation. Drawer tab switches are fine by comparison: Flow 88 ms (the `buildSnapshot` tab), Levels 40 ms,
Read 33 ms.

### P1-5 · The "Closest analogs" evidence rows routinely print 14–16× overshoot ratios that are noise over noise

`describePrior` (`newsintel.ts:193-200`) prints `|realized| / |expMove1dPct|` and guards only at
`call < 0.1` %. Measured on the two macro headlines that actually render a deep read
(`scratchpad/g55/07_news3.mjs`):

```
100  -116 sess  loud bearish print, 0.9× the modeled move    -0.3%  HELD
 99  -111 sess  loud bearish print, 15.9× the modeled move   -6.3%  HELD
 99   -62 sess  loud bearish print, 14.8× the modeled move   -5.8%  HELD
100  -162 sess  mid-size bullish print, 14.0× the modeled move +1.5% HELD
100  -249 sess  mid-size bullish print, 4.7× the modeled move  +0.5% HELD
100   -32 sess  mid-size bullish print, 2.8× the modeled move  -0.3% FADED
```

**4 of 6 analog rows report a multiple ≥ 2.8×, three of them ≥ 14×.** At `call = 0.11 %` and a residual of
1.5 %, the ratio prints 14× and means nothing — the denominator is below the model's own stated residual
scale (`RESIDUAL_1D_PCT = 1.3`, `news.ts:224`). A reader takes "15.9× the modeled move" as evidence that this
catalyst type systematically blows through the model. Raising the floor to the residual scale, or stating the
absolute move instead of a ratio when the call is inside the noise, fixes it.

### P1-6 · Two independent watchlists, two localStorage keys, no shared state

`slayer.stocks.watchlist` (`Stocks.tsx:54`) and `slayer.earnings.watchlist` (`EarningsHub.tsx:50`), with two
separately-declared `WatchStar` components (`Stocks.tsx:168-183`, `EarningsHub.tsx:177-191`) that differ only
in whether they carry a `title`. Starring MSFT on `/stocks` does not star MSFT on `/earnings`; measured by
starring on one desk and re-reading the other's scope dropdown count (0). For a terminal whose Tracker is
meant to be "the single persistent watch home" (`App.tsx:176`), three unconnected watch stores is a
workflow defect, not a tidiness one.

---

## 4. P2 / P3 — hierarchy, comprehension, polish

| # | Sev | Finding | Evidence |
|---|---|---|---|
| F-14 | P2 | **The Earnings "structure" column is 79 % one string.** Histogram over the 14 rows: `Call debit spread` ×11, `Long straddle` ×1, `Iron condor` ×1, `Put-shifted iron condor` ×1. A column that is constant carries no information, and it is constant in the *call* direction on a slate where four rows read "down". Root: `wingDir = downEdgeAdj > upEdgeAdj ? -1 : 1` (`earningsintel.ts:281`) resolves every tie and near-tie to the call side. | `scratchpad/g55/14_rest.mjs`; `G55_D_earnings_p2.png` |
| F-15 | P2 | **The News clustering mechanism fires once in eighteen.** 18 headlines → **17 units, 1 cluster, containing 2 items**. The cluster key is `${ticker}|${category}` over `FEED_SIZE = 18` draws from a 192-name universe (`News.tsx:186`, `news.ts:232`), so collisions are structurally near-impossible. The one cluster that did form groups *two different product launches* ("unveils next-gen AI platform" + "unveils next-gen consumer device") under copy that calls them "near-identical prints" (`News.tsx:100`). | `scratchpad/g55/06_news2.mjs`; `G55_I_news_clusterexpanded.png` |
| F-16 | P2 | **Three of the nine figures on every News row are a per-category constant.** Exactly one distinct `PRIORS/HIT/MEDIAN` triplet per category across all 17 rows: Earnings `539/66/2.3`, Analyst `832/56/1.3`, M&A `275/68/2`, Product `563/53/1.4`, Guidance `774/66/1.8`, Macro `1283/56/1.8`. A third of the row's numeric ink repeats the category badge. | `scratchpad/g55/17_last.mjs` |
| F-17 | P2 | **Rotation-map markers collide and use a third of the plot's height.** In a 614×340 plot: 6 overlapping label pairs of 45 possible — worst `INDU/MATL` 41×17 px (696 px² overlap) and `TECH/UTIL` 16×20 px. Marker centres span 349 px of 614 horizontally (**57 %**) and 108 px of 340 vertically (**32 %**). The y-axis (1-week RS) is drawn on a symmetric domain sized by the *larger* 1-month spread (`Stocks.tsx:223`), so the shorter axis is permanently compressed. | `scratchpad/g55/17_last.mjs`; `G55_D_stocks_p1.png` |
| F-18 | P2 | **GATE 13 — the Earnings dossier placeholder is 1 382×224 px (309 568 px²) at 1.2 % ink**, containing the single line "SELECT A PRINT TO OPEN THE EVENT DOSSIER". Clicking a row already opens an inline read strip inside the table panel, so this is a second, larger placeholder for an affordance that already fired. | `scratchpad/g55/12_panels.mjs`; `G13_earnings_p3.png` |
| F-19 | P2 | **GATE 13 — the Tracker "Tracked setups" panel is 916×595 px at 3.2 % ink** in the default Active view, with a measured empty rectangle of **970×390 px (378 300 px²)** below the single row — the largest empty region on any of the four desks. Cause: `items-stretch` on the 12-col grid (`Tracker.tsx:691`) pins the table panel to the height of the always-tall Item review beside it. | `scratchpad/g55/11_gate13.mjs`; `G13_tracker_p1.png` |
| F-20 | P2 | **GATE 13 — the Stocks rotation scatter is 614×340 at 2.6 % ink.** For a ten-point scatter low density is expected; the finding is that 340 px of height is spent on markers that occupy 108 px of it (see F-17), so two thirds of the box is unused domain rather than unused data. | `scratchpad/g55/12_panels.mjs` |
| F-21 | P2 | **The Levels tab's "measured move" is, by construction, one of the two Stats above it.** `projection.to` is always exactly `support.mid` or `resistance.mid` (`swingModel.ts:143-152`). Measured on 10 names: the projected target equalled the Support figure to the cent in **10 of 10** (e.g. AAPL `SUPPORT $180.73 −22.4 %` / "measured move runs to $180.73 (−22.4 %)"). The sentence does disclose it ("the zone price sits further from"), so this is not a wrong number — it is a sentence that reads as a third model output and carries no third number. | `scratchpad/g55/04_sleevecheck.mjs` |
| F-22 | P2 | **The Stocks compare checkbox is a 20×20 px tap target.** Measured `[20, 20]` (`Stocks.tsx:494`). The identical control on `/earnings` is wrapped `-m-1 p-1` to reach 28×28 with the drawn box unchanged, and `EarningsHub.tsx:473-476` documents exactly why. One desk got the fix. | `scratchpad/g55/15_extras.mjs` |
| F-23 | P2 | **The News metric row surfaces three red catalysts above a MIXED tape.** Top/2nd/3rd catalyst read −2.4 %, −1.8 %, −1.6 %, all in bear red, while Tape mood reads MIXED on 10 bullish vs 8 bearish. Ranking is by `|expMove1dPct|` (`News.tsx:231-233`), which systematically surfaces the loudest, and the loudest templates are the negative earnings/guidance ones (`CATEGORY_KICK` Earnings 3.2, Guidance 2.8). Not wrong; the row argues a direction the tape summary next to it denies. | `G55_D_news_p1.png` |
| F-24 | P3 | **The Tracker's Contract column is the only unsortable one.** Measured across all nine headers: Signal, Status, Score, Premium, Confidence, Exp. Move, Notes and Tracked all reorder the six-row Journal view; Contract does not (no `sortValue`, `Tracker.tsx:359-368`). | `scratchpad/g55/12_panels.mjs` |
| F-25 | P3 | **The cluster "sources" affordance always renders the single word MODELED.** `unit.sources` dedupes `item.source`, and `PROVENANCE = 'MODELED'` is a constant (`news.ts:68`), so the `Link2` chip (`News.tsx:428-430`) can only ever show one value. The corroboration affordance survived the provenance fix that made it meaningless. | `G55_I_news_clusterexpanded.png` |

Two things I expected to find and did **not**, stated so they are not re-litigated:

- **P(up) tone is correct.** Measured all 17 rendered `P up` values: 8 below 50 in `rgb(255,59,48)`, 9 above 50
  in `rgb(48,209,88)`. Zero mismatches, despite the tone being keyed on `sentiment` rather than on `probUpPct`.
- **Every filter, sort, tab, toggle and drawer I could reach does what it claims.** Full pass in §5.

---

## 5. Interaction inventory — what actually changed, measured before and after

Every control below was clicked and the DOM read on both sides. ✅ = the claimed change is real.

**`/stocks`** (`scratchpad/g55/02_stocks.mjs`, `03_stocks2.mjs`, `13_final.mjs`, `15_extras.mjs`)

| control | before → after |
|---|---|
| Verdict filter All/Strong/Weak | 192 → 48 → 37 → 192 rows; count chip tracks ✅ |
| Price band Any/<150/150–500/>500 | 192 → 100 → 75 → 17 ✅ (`aria-checked` flips) |
| Beta band Any/Def/Cyc | 192 → 77 → 115 ✅ (77 + 115 = 192, partition holds) |
| Universe scope listbox | 12 options with live counts; Technology → 37 rows, Energy → 14, Utilities → 10 ✅ (counts match the dropdown) |
| Clear N chip | Utilities 10/192 → 192/192 ✅ |
| Sort Score / Last / β / Name / Sector | all reorder ✅ (Sector verified at full universe: EXC↔T) |
| Factors popover | 288×348 px, four definitions ✅ |
| Compare mode | table headers 9 → 10, adds the `Cmp` column ✅; tray renders 3 names ✅ |
| Rotation-map hover | portal readout: "Technology · LEADING · Composite 61 · 1w RS +0.4 % · 1m RS +0.7 % · Above trend 59 % · Names 37 · Off-exch $32.5B" ✅ |
| Rotation-map click | scopes the board and the caption ✅ |
| Row click → drawer | 560×900 dialog, focus-trapped, Escape closes ✅ |
| Drawer tabs Read/News/Earnings/Flow/Levels | all five render distinct engine output, including honest empty states ("No COP story on the wire — 18 items ran across the screened universe today") ✅ |
| Watch star / compare from drawer | persist to `slayer.stocks.watchlist` ✅ |

**`/news`** (`05_news.mjs`, `06_news2.mjs`, `07_news3.mjs`)

| control | before → after |
|---|---|
| Category All/Earnings/Guidance/Analyst/Macro | 18 → 4 → 2 → 3 → 5 headlines ✅ |
| Cluster / Flat | "17 stories · 18 headlines" ↔ "18 headlines" ✅ (see F-15) |
| Expand cluster | adds the second Roblox headline as a child row ✅ |
| Watch / Mute per story | banner "1 watched" / "1 muted"; watched floats to top, muted sinks and dims to opacity .45 ✅ |
| Hide muted | 17 → 16 units ✅ |
| Clear | resets both sets ✅ |
| Row select | right pane retargets (MS → CAT) ✅ |
| Row hover | portal readout: category + Impact + Conf + playbook ✅ |
| Outcome / Deep read | switches ✅ — but see P0-6 |

**`/earnings`** (`08_earnings.mjs`, `12_panels.mjs`, `14_rest.mjs`)

| control | before → after |
|---|---|
| Verdict All/Qualified/Rich/No edge | 14 → 3 → 8 → 3 ✅ (3 + 8 + 3 = 14) |
| Window All/Today/This wk/Next wk | 14 → 1 → 8 → 6 ✅; `daysOut` sets are disjoint and complete |
| Watchlist filter (empty) | 14 → 0 rows, "No reports match these filters", table collapses to 84 px ✅ |
| Sort Rich / Beat 8q / IVR / Setup / Reports | all reorder ✅ |
| Row click | inline read strip: verdict, implied/modeled/richness, Edge · Conviction · Structure trio, dossier jump, TickerJump ✅ |
| "Why this read" disclosure | reveals `rationale` ✅ |
| Compare mode + tray | adds `Cmp` column, tray renders per-print edge/conviction/structure/MoveCompare ✅ |
| "Full dossier" | smooth-scrolls to `#earnings-dossier` ✅ |
| Arm alert | toggles the watchlist entry and re-labels ✅ |
| Slate strip chips | select the print and highlight ✅ |

**`/tracker`** (`10_tracker.mjs`, `12_panels.mjs`, `17_last.mjs`)

| control | before → after |
|---|---|
| Seven saved views | Active 1, Triggered 1, Invalidated 2, Expiring 0, Closed 2, Alerts 2, Journal 6 ✅ — counts match the tabs and the rows |
| Status pin (Auto/Active/Triggered/Invalidated/Closed) | `QQQ 445P … EXPIRED CLOSED` → `EXPIRED INVALIDATED •` and the row moves lane ✅ (but see P1-1 for the missing fill) |
| Notes textarea | row's Notes cell → "Thesis: gap fill into…" and persists to `slayer_tracker_journal` ✅ |
| Lane-bar buttons | switch the view ✅ |
| Lane-bar hover | portal readout with label / count / % of book ✅ |
| Sorts | 8 of 9 columns reorder ✅ (Contract does not — F-24) |
| Untrack + Undo toast | removes the row and the journal entry, restores both ✅ |
| Review in Compass | navigates with `state.monitor` ✅ |

---

## 6. GATE 55–58 — does each desk have a signature, and is it real?

### GATE 55 · Stocks — "route an expression (stock / option / spread / no trade)"

**Signature present:** yes — the **sector rotation map + strip pair**. It is genuinely distinctive: two
relative-strength windows as a scatter whose four quadrants *are* the four phases the engine assigns, a
synced hover readout carrying six figures, click-to-scope wired to the board below, and a single caption that
follows the cursor. It is a real interaction, not decoration — the click reduced the board from 192 to 37
rows, measured.

**But the axes are decoration.** Both are gaussian draws (P0-4). The map's data-driven parts — composite
score, breadth, member count, off-exchange dollar share — are the ones it *doesn't* plot.

**The brief's actual requirement is unmet.** The desk routes no expression at all. The terminal action at the
end of the drawer is `TickerJump` → three buttons labelled PULSE / WEIGH / PINPOINT (measured), which hands
the name to another desk without ever saying *stock, option, spread or no trade*. And the drawer's only
structural content is an options book (chain OI, session prints, dealer-wall pointer), so the desk implies
the answer is always "option".

**Proposed signature mechanism — an Expression Router row in the drawer header, using only what that drawer
already renders:**

| branch | condition, from data already on the drawer | source |
|---|---|---|
| **no trade** | composite in the HOLD band (47–67) **and** `directionVote`-style disagreement between the two RS windows | `stocks.ts` composite; `sectorRow.rs1w/rs1m` |
| **stock** | both RS windows same sign **and** `Range position` between 20–80 % **and** beta < 1.3 | `swingModel` support/resistance already tiled; `universe.beta` already tiled |
| **option** | `Range position` > 80 % or < 20 % (price against a zone) **and** the chain's put/call OI ratio leaning the same way | `swingModel`; `chainOI` already computed at `StockDetailDrawer.tsx:251-256` |
| **spread** | the name is in `buildEarningsCalendar()` **and** its `richness ≥ 1.3` | already fetched for the Earnings tab, already rendered as "Richness (implied ÷ modeled avg)" |

Every input is on screen in that drawer today; nothing new is fetched. The default branch is **stock**, which
is precisely the correction the brief asks for.

### GATE 56 · News — "headline → cluster → catalyst type → novelty → contradiction → distribution change"

**Signature present: partially, and the chain breaks at step 2.**

| stage | present? | measured |
|---|---|---|
| headline | ✅ | 18, deduped, timestamped, provenance-stamped |
| cluster | ⚠️ **fires once in 18** | 17 units, 1 cluster of 2 (F-15) |
| catalyst type | ✅ | 7 categories, colour-coded, filterable, counted in Tape composition |
| **novelty** | ❌ | nothing on the desk answers "is this new?" |
| **contradiction** | ⚠️ | only inside the deep read, as narrative-vs-positioning — empty for 16/18 headlines (P0-6) |
| **distribution change** | ❌ | the tape mix is a snapshot; nothing shows it *changing* |

**Proposed signature mechanism — a Catalyst Ledger row on each feed item, from data `news.ts` already
computes:**

- **Novelty** = `100 − max(setupSimilarity)` over the same category in `catalystPriors()`. Both halves exist:
  `catalystPriors()` builds 252 × 18 = **4 536** priors (`news.ts:295-335`) and `setupSimilarity()` is already
  written (`newsintel.ts:185-190`) and already used for the analog list. A headline whose nearest prior scores
  100 is a repeat; one whose best match is 61 is genuinely new — and today the desk computes that number and
  throws it away.
- **Contradiction** = sign disagreement between this item's `sentiment` and (a) the other items on the same
  ticker in the same `buildNewsFeed()` result, and (b) `positioningLean` from the chain. Both are already
  computed per render.
- **Distribution change** = `marketMood().mix` recomputed over items older than this one versus the full feed
  — a two-number delta on the same bar the Tape composition panel already draws. `minutesAgo` is on every item.

That turns the tape composition bar from a static snapshot into the thing each headline *moved*, which is the
transformation the gate asks for, with zero new data.

### GATE 57 · Earnings — "separate event MAGNITUDE from DIRECTION"

**Signature present: yes, and it is the strongest of the four desks.** The board's spine is exactly this
separation, and it is enforced in three independent places:

- **Magnitude** — the `MoveCompare` double bar (implied vs modeled, drawn against a shared max), the `Rich`
  ratio column, and `edgePtsLabel` as a signed point gap. All of it is chrome-toned: `edgeRead` returns
  `select` for cheap and `warn` for rich, never `bull` (`EarningsHub.tsx:75-79`, with the reasoning written
  in the comment above it).
- **Direction** — `VoteChips` (rev ▲ / flow · / set ▼) and `convictionRead`, and these are the only things on
  the page allowed green or red.
- The verdict lexicon (`PLAY → QUALIFIED`, `FADE → RICH`, `SKIP → NO EDGE`) refuses to make the magnitude
  read directional; `earnings.ts:26-42` explains why in four sentences.

**This is a distinctive, data-driven, defensible signature. Do not touch it.** The one thing undermining it is
the third element in the same cell — the structure name — which is 79 % constant (F-14), comes from a second
engine, and contradicts both the verdict (3/14) and the direction (2/14) beside it (P0-5). Fixing P0-5 and
F-14 makes the signature legible rather than replacing it.

### GATE 58 · Tracker — "an immutable decision packet that visibly becomes evidence"

**Signature present: no — and this is the sharpest finding in the audit, because the mechanism exists and is
pointed at the wrong data.**

The **Edge Ledger** sitting directly below the tracked book reconstructs, per trade: original thesis, entry
conditions required, planned vs actual fill, market state at entry, MFE / MAE, exit quality, a W/L reason,
and **the better contract that expressed the same idea** — a counterfactual (`edgeledger.ts:1-27`). It then
derives expectancy by setup type and edge-decay warnings by vol regime. That is, field for field, the packet
the gate describes.

It is wired to a generated book of 48 trades that has nothing to do with the user's. The page says so, in the
panel subtitle, measured verbatim:

> **EDGE LEDGER** — *A worked demonstration over 48 modeled trades. Not your fills, and not counted from the
> book above.*

So the desk's memory (the tracked book) and the desk's evidence machinery (the ledger) are two disconnected
objects stacked vertically, and nothing tracked ever becomes evidence. Meanwhile the tracked book itself
stores no outcome, no counterfactual, no entry-time risk, and never renders the one entry-time state it does
store (P1-2).

**Proposed signature mechanism — point the existing reconstruction at the existing book:**

1. At `trackSetup(setup, scanner)` (`TrackerContext.tsx:71-91`), persist five more fields already in hand and
   currently discarded: `expectedMovePctAtTrack`, `confidenceAtTrack`, `midAtTrack`,
   `invalidationPriceAtTrack`, `invalidationReasonAtTrack`. No new data source — they arrive on the `Setup`.
2. Render `verdictAtTrack` beside the live `Signal` column, so the row shows *then → now* instead of only now.
3. For rows whose `expiryInfo()` says expired, feed a `LedgerTrade`-shaped record into the Edge Ledger's
   existing reconstruction: thesis = the stored setup state, planned entry = `midAtTrack`, exit = the live
   `mid`, MFE/MAE = the score/premium excursion the tracker can already replay through `rebuildLive()`, and
   the counterfactual = the best-scoring contract on the same ticker and sleeve from `makeSetup` — which
   Compass already computes for the weigher.

Nothing above requires a datum the app does not have today. It is the difference between a tracker and a
terminal's memory.

---

## 7. GATE 17 — the five objects, per desk, first viewport at 1440×900

| | dominant analytical object | current-state object | main conclusion | risk / invalidation | next action |
|---|---|---|---|---|---|
| **/stocks** | ⚠️ **Sector rotation** (1382×524) — but the page is titled "Stocks" and the ranked board of 192 names begins at y ≈ 800, below the fold. The dominant object is not the page's subject. | ✅ five StatCards | ⚠️ the caption row under the map — a conclusion about a *sector*, not about the board | ❌ **absent**, page and drawer both. Compass and the News deep read each carry an invalidation statement; this desk carries none. | ⚠️ "click a row for the thesis drawer"; the drawer's terminal action is three jump buttons to other desks |
| **/news** | ✅ Catalyst feed (823×602) | ✅ Tape mood + Tape composition | ✅ the mood note sentence | ⚠️ present only inside the deep read → **empty for 16 of 18 headlines** (P0-6) | ❌ absent by design — the Playbook is observational and TickerJump leaves the desk |
| **/earnings** | ⚠️ The board (1382×653) is the object, but the first viewport is five StatCards + countdown + slate; the board starts at y ≈ 700 | ✅ live countdown + slate strip | ✅ per-row Trade read — undermined by P0-5 | ⚠️ partial: `Crush %` names the cost of being wrong, `ReportTimeTag` names date risk; no invalidation object | ✅ "click a row for the strategy" |
| **/tracker** | ✅ Tracked setups table — at 3.2 % ink in the default view (F-19) | ✅ four StatCards + lane bar | ❌ **absent** — nothing states a conclusion about *your* book; the Edge Ledger's conclusions belong to a different book | ✅ per-item Invalidation — but the live one, not the entry one (P1-2) | ✅ "Review in Compass" / "Untrack" |

Two objects are missing across the board: **`/stocks` has no invalidation anywhere**, and **`/tracker` states
no conclusion about the book it exists to hold**.

---

## 8. GATE 13 — unexplained empty regions (measured)

Largest empty axis-aligned rectangle per pane, 10 px grid, ink = text runs + svg/img/canvas/input + small
filled chips (`scratchpad/g55/11_gate13.mjs`):

| region | box | area | screenshot | verdict |
|---|---:|---:|---|---|
| `/tracker` p1 — below the single row in Tracked setups | **970 × 390** | 378 300 px² | `G13_tracker_p1.png` | **real** (F-19) |
| `/earnings` p3 — the dossier placeholder | **1 382 × 224** | 309 568 px² | `G13_earnings_p3.png` | **real** (F-18) |
| `/tracker` p3 — right of the closed-trade ledger | 610 × 280 | 170 800 px² | `G13_tracker_p3.png` | real, EdgeLedger |
| `/stocks` p2 — inside the ranked table, between Name and Sector | 210 × 710 | 149 100 px² | `G13_stocks_p2.png` | real — the Name column reserves ~340 px for a ≤5-char ticker + company line |
| `/stocks` p3 | 200 × 490 | 98 000 px² | `G13_stocks_p3.png` | same column, further down |
| `/tracker` p2 | 540 × 160 | 86 400 px² | `G13_tracker_p2.png` | real, below Item review |
| `/news` p2 · `/earnings` p2 | 610 × 270 / 640 × 130 | — | `G13_news_p2.png` | **shared footer**, not desk-owned |
| all four, p1 top band | ~1 300 × 90 | — | — | **artifact** — the glass header sits `position: absolute` outside `#main-content`; the scan reads its band as empty. Discount these. |

Panel ink density, lowest ten per route (`scratchpad/g55/12_panels.mjs`):

```
/stocks    614x340  ink=2.6%   rotation scatter        (F-20)
           722x384  ink=6.4%   sector strip
           1382x524 ink=6.7%   Sector rotation panel
/news      1382x172 ink=7.9%   Tape composition
           543x594  ink=21.2%  Predicted outcome
/earnings  1382x224 ink=1.2%   dossier placeholder     (F-18)
           1382x227 ink=7.2%   The slate
/tracker   916x595  ink=3.2%   Tracked setups (Active) (F-19)
           914x99   ink=5.5%   Book across lanes
```

---

## 9. GATE 63 red-team — what survives a logo swap

Named with the evidence for the judgement, not as an impression.

1. **The five-across StatCard row is the same object on three of the four desks.** `MetricGrid min="170px"`
   at `Stocks.tsx:596`, `News.tsx:254`, `EarningsHub.tsx:597`, each holding five `StatCard`s in the identical
   label / big-number / grey-sub shape, occupying the top ~85 px of the first viewport on all three. Measured
   at 1440: Stocks "STRONG NAMES 48 / WEAK NAMES 37 / BREADTH 58 % / STRONGEST SECTOR / WEAKEST SECTOR",
   News "TAPE MOOD / HEADLINES TRACKED / TOP · 2ND · 3RD CATALYST", Earnings "REPORTS TRACKED / QUALIFIED /
   PREMIUM RICH / RICHEST / CHEAPEST STRADDLE". This is the KPI tile wall, already built. Swap the logo and
   the strings and it is any screener.
2. **Green-for-good on model scores.** Stocks composite in `rgb(48,209,88)` on all eight top rows; Tracker
   score delta `+7` green; Tracker "Triggered 1" green; Tracker lane bar green/red. That is the generic
   finance-product convention, and it is the one the house palette explicitly forbids — the repo argues
   against it in its own comments at `Stocks.tsx:82-87` and `stocks.ts:40-42` while shipping it three
   files over.
3. **The screener chrome is duplicated rather than shared.** Two `WatchStar` components, two
   `WATCHLIST_KEY`s, two compare-mode toggles, two `Clear N` chips, two "N/M" count chips — one set on
   `/stocks`, one on `/earnings`, differing only in a `title` attribute and 8 px of tap padding (F-22, P1-6).
   Watch-star + compare-checkbox + watchlist-filter + clear-chip is the default vocabulary of every stock
   screener shipped since 2010.
4. **The News feed row is a wire row.** timestamp · age · source · ticker · sector · category badge ·
   headline · right-aligned expected move. Replace the constant string `MODELED` with a wire name (which is
   what the field held before `news.ts:60-68`) and the row is indistinguishable from any news terminal's.
   The one thing that would make it Slayer's — the catalyst *transformation* — is the part that is missing
   (GATE 56).
5. **The Tracker table is a portfolio blotter.** Contract / Signal / Status / Score / Premium / Confidence /
   Exp. Move / Notes / Tracked — nine generic columns, none of which is the decision packet. The distinctive
   object (the Edge Ledger's thesis → conditions → fill-vs-plan → MFE/MAE → counterfactual reconstruction)
   is on the same page and wired to synthetic data (GATE 58).

What would **not** survive a logo swap, and should be protected: the earnings magnitude-vs-direction spine
(`MoveCompare` + `VoteChips` + the chrome-toned richness read), the rotation map's quadrant-equals-phase
construction, the drawer's five-engines-one-ticker structure with honest per-engine empty states, and the
whole PLAY/FADE/SKIP → QUALIFIED/RICH/NO EDGE observational lexicon.

---

## 10. What I could not audit

- **The `Cmp` and `IVR` and `β` header tooltips** — `Term` renders them from `terms.ts`, and I confirmed the
  wiring (`DataTable.tsx:150`) and the strings, but I did not capture the rendered tooltip surface for each.
  The `30d RS` string in P0-3 is quoted from `terms.ts:49`, not from a screenshot of the open tooltip.
- **Keyboard-only traversal of the four desks.** axe reports 0 violations and `SegmentedControl` implements a
  correct roving-tabindex radio group, but I did not walk tab order end to end, and axe cannot see focus
  order, focus-visible contrast, or live-region announcements. The drawer's focus trap I did verify (Escape
  closes, `aria-modal`, `role="dialog"`, `aria-label="COP detail"`).
- **The Tracker under a book of realistic size.** I seeded six items. The empty-state path (0 items) and the
  seeded path are both covered; a 50–100 item book is not, and F-19's stretch defect would resolve itself
  there.
- **Colour-contrast ratios.** axe found no contrast violations, but axe skips text over gradients/images and
  cannot judge the `text-textMuted` micro type at 10 px, which is used heavily on all four desks.
- **`marketData === null`.** `/tracker` and the News deep read both branch on it (skeletons / "Reading
  positioning…"), and I never observed the null state because the simulator resolves before `networkidle`.
- **Reproducing the Tokyo slate difference on `/news` and `/stocks`.** I measured the timezone divergence on
  `/earnings` only (four contexts). `dayKey()` is shared, so the same shift necessarily reaches the news feed
  and the stock board, but I did not capture those two.
- **Whether the seeded tracker book's `scoreAtTrack` values are representative.** I chose them; the
  score-delta colours and magnitudes in F-19/P1-3 are therefore illustrative of the mechanism, not of a real
  user's book. The colour *rule* is read from source and confirmed at runtime.
