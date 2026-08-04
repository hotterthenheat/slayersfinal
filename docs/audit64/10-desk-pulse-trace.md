# 10 — Desk audit: Pulse & Trace (Gates 45, 49, 50, 51, 52)

Scope: `/pulse` (`/workspace` → 301 redirect to `/pulse`), `/trace/live-tape`, `/trace/scanner`,
`/trace/reconstruction`, `/trace/dark-pool`.
Build under test: the production bundle already served at `http://127.0.0.1:8123` (not rebuilt, not restarted).
Viewports: 1440×900 and 390×844. Browser: bundled Chromium 1194, headless, `slayer_onboarded_v1=1`.
Session under test: SPY, up day (`changePercent` +0.76…+0.78% throughout), container TZ = UTC.

Everything below is a measurement. Where I could not reproduce something I say so in
[§9 Not audited](#9-what-i-could-not-audit).

Scratch scripts: `…/scratchpad/g45_shot.mjs`, `g45_full.mjs`, `g45_i2.mjs`, `g45_i3.mjs`, `g45_i4.mjs`,
`g45_gaps.mjs`, `g45_y2.mjs`, `g45_y3.mjs`.
Screenshots: `docs/audit64/shots/G45_*`, `docs/audit64/shots/G13b_*`.

---

## 1. Route inventory and page geometry (measured)

| Route | scrollHeight @1440 | @390 | DOM nodes @1440 | axe violations |
|---|---:|---:|---:|---:|
| `/pulse` | 2 841 px | 3 884 px | 1 775 | 0 |
| `/workspace` | — (redirects to `/pulse`) | — | — | — |
| `/trace/live-tape` | 1 171 px | 1 674 px | — | 0 |
| `/trace/scanner` | 1 032 px | 1 422 px | — | 0 |
| `/trace/reconstruction` | 2 385 px | 4 125 px | — | 0 |
| `/trace/dark-pool` | **4 804 px** | **11 476 px** | **12 187** | 0 |

`document.documentElement.scrollHeight` is always exactly the viewport height on every route — the app
scrolls inside `#main-content` (`AppShell.tsx:103`), so `fullPage: true` screenshots capture one viewport
only. All full-length captures in `shots/` are therefore multi-pane (`_p1…_p6`).

**axe-core 4.x, `resultTypes: ['violations']`, run against the full document on all five routes: 0 violations
on each.** That is a real result and it is good. It does not cover the things axe cannot see (colour
semantics, focus order through the react-grid-layout desk, live-region announcements) — see §9.

---

## 2. P0 — wrong or misleading numbers

### P0-1 · The tape's "OTM" column reports in-the-money puts as positive OTM, in bull green

`LiveTape.tsx:249-258` renders the raw signed `otmPct` under the header `OTM`, with the dictionary tooltip
*"Out of the money — how far the strike sits beyond spot, as % of spot"* (`terms.ts:18`) and
`dyn: r => (r.otmPct >= 0 ? 'text-bull' : 'text-bear')`. `otmPct` is `(strike − spot) / spot`
(`flowtape.ts:83`) — a call-only convention.

Measured at 1440×900 on the rendered tape: **8 of 11 put rows showed a positive "OTM" value in
`rgb(48, 209, 88)`** (the app's bull green):

| Row | Spot | Column says | Truth |
|---|---|---|---|
| `SPY 507P` | $503.87 | **+0.6%** green | 0.6% **in** the money |
| `QQQ 443P` | $442.53 | **+0.1%** green | 0.1% **in** the money |
| `AAPL 234P` | $232.79 | **+0.5%** green | 0.5% **in** the money |
| `SPY 502P` | $503.90 | −0.4% red | 0.4% **out** of the money |

The repo already contains the correct helper and already names this exact bug:

```ts
// src/pages/flowdesk/printRead.ts:30-34
/** True moneyness. `otmPct` is signed strike-versus-spot, so its sign only reads
 *  as "out of the money" on a call; on a put it means the exact opposite. The
 *  drawer used to print it as "OTM" and tint a positive value green, which called
 *  an in-the-money put a bullish plus. */
```

The fix was applied to `TapeRowDrawer` only. Click any of those rows and the drawer says
*"…0.2% out of the money…"* correctly while the grid behind it says the opposite. The same uncorrected
pattern is still live in `ScannerRowDrawer.tsx:123-127` (`Field label="OTM"` … `tone={row.otmPct >= 0 ? 'text-bull' : 'text-bear'}`);
measured there on `SPY 495P` @ spot $503.89 → "OTM −1.8%" in red for a contract that is 1.8% **out** of the money.

Evidence: `shots/G45_trace_live-tape_1440x900_p1.png`, `shots/G45_scanner_drawer_1440x900.png`.

**Fix:** call `moneyness(r)` in the column cell and tone by its `otm` boolean, not by the sign of `otmPct`.
Two call sites: `LiveTape.tsx:255-257`, `ScannerRowDrawer.tsx:125-126`.

---

### P0-2 · Pulse Flow Alerts publish a fabricated, always-positive "Peak Return"

`pulseflow.ts:208`:

```ts
peakReturnPct: withReturn ? Math.round(hRange(`${ticker}-${day}-fa-${key}`, 12, 88)) : null,
```

A hash of the contract key, bounded **[12, 88]** — structurally incapable of being negative or zero.
`FlowAlertsPanel.tsx:68-70` renders it as `Peak Return: {n}%` in `text-bull`.

Measured on `/pulse`: three alerts read **52.0%**, **41.0%**, **79.0%**, all in `rgb(48, 209, 88)`,
`allPositive: true`. The interface documents the field as *"peak return % since first print, when trackable"*
(`pulseflow.ts:65`) — nothing in the app tracks a return on these contracts.

This is the single most dangerous number on either desk: a rail of green win percentages next to real-looking
contract chips reads as a track record.
Evidence: `shots/G45_pulse_1440x900_p2.png`.

**Fix:** delete the field, or replace it with a quantity the stream actually carries — e.g. premium added
since the first print of that contract (`group.reduce` over `SessionPrint.value`, already computed at
`pulseflow.ts:198`) — and stop toning it bull.

---

### P0-3 · Every panel timestamp is in the viewer's timezone while the header is labelled ET

`core/calendar.ts:235-245` builds the header clock in `America/New_York` and `calendar.ts:259-266` explains
precisely why an unlabelled local clock beside a quote is wrong. Every panel time was left on the viewer's
clock: `simulator.ts:586,650` (`new Date().toLocaleTimeString()`), `pulseflow.ts:154`, `flowscan.ts:103`,
`darkpool.ts:298`, `tapeSeed.ts:88` (all `.getHours()`).

Measured, same DOM snapshot:

| Surface | Header | Panel |
|---|---|---|
| `/trace/live-tape` | `14:54:46 ET` | top tape row `6:54:31 PM` |
| `/pulse` | `15:01:38 ET` | Options Flow newest print `18:53:50` |
| `/pulse` | `14:50:19 ET` | Gradient Chart x-axis ends `18:50`; Net Premium axis ends `18:50` |

3 h 52 m of divergence, and every panel timestamp is **after the 16:00 close** while the desk's own phase
logic (`calendar.ts:279-289`) reports the session open. `/trace/scanner`'s `LAST` column shows the same
(16:07, 17:57, 18:01, 18:41 …).
Evidence: `shots/G45_trace_live-tape_1440x900_p1.png`, `shots/G45_pulse_1440x900_p2.png`.

**Fix:** one ET formatter for every rendered timestamp. `calendar.ts` already exports the formatter; route the
six generator call sites through it.

---

### P0-4 · Dark Pool's session verdict is a restatement of `changePercent`, not a read of the blocks

`darkpool.ts:256` `const sessionUp = changePercent >= 0;`, then `classify()`:

```
:221  if (sized && below && sessionUp)   → ACCUMULATION
:228  if (sized && above && !sessionUp)  → DISTRIBUTION
```

`sessionUp` is one session-wide boolean, so **exactly one of those two branches is dead for the entire
session**. Worse, shelves and prints are drawn inside `[lo, hi]` of the live price history
(`darkpool.ts:258-260`), so on an up day spot sits at the top of the range and nearly every print is *below*
spot — feeding the surviving branch.

Measured on this up session (+0.78%), from the page's own tally (`DarkPool.tsx:650-655`):

> **Across 240 prints: 75 accumulation, 4 distribution, 61 hedge, 100 rotation**
> posture **ACCUMULATING · +93 skew** (ceiling is ±100)
> Nearest shelves: **`$503.89 / none`** — no shelf exists above spot at all

Filter counters agree exactly: Accumulation 75/240, Distribution 4/240, Hedge 61/240, Rotation 100/240.
A 19:1 accumulation:distribution ratio and a +93/100 skew are not a finding about 240 blocks; they are the
sign of today's price change wearing a confidence interval. The panel copy states the opposite:
*"The skew above weights each block's notional by the classifier's own confidence in it, so one large
low-confidence cross cannot carry the verdict on its own."* (`DarkPool.tsx:656-659`).

Evidence: `shots/G45_trace_dark-pool_1440x900_p2.png`, filter census in `scratchpad/g45_i3.log`.

**Fix:** classify a print against *where the size crossed relative to the session's own volume-weighted
price and the shelf it landed on*, not against a single day-direction boolean. Both inputs already exist:
`priceHistory` (already used by `retestsByShelf`) and `atLevel`/`clusterOf` (already computed at
`darkpool.ts:322-338`).

---

### P0-5 · Dark Pool's "liquidity shelves" have no memory — prices, retest counts and session dollars all move every tick

`darkpool.ts:267-271` derives the six shelf prices from `lo + edgeBiased * range` where `lo`/`hi`/`range`
come from the **live** `priceHistory` and `spot` (`:258-260`), and `buildDarkPoolView` re-runs on every 1.5 s
snapshot (`DarkPool.tsx:184`). Prints are then made to gravitate onto those shelves (`:278-282`) — the
causality is the reverse of what the panel subtitle claims (*"prices the blocks keep crossing at"*).

Measured, same page, **40 seconds apart**, over which spot moved $503.90 → $503.77 (−$0.13, downward):

| | Shelf 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| t=0 | 503.89 | 503.42 | 503.24 | 502.35 | 501.11 | 500.18 |
| t=40s | 503.93 | 503.55 | 503.41 | 502.69 | 501.70 | 500.95 |
| retests t=0 | 2× held | untested | 4× held | 5+ held | 5+ held | 5+ held |
| retests t=40s | **5+ held** | untested | **3× held** | 5+ held | 5+ held | 5+ held |
| notional t=0 | $520.6M | $318.0M | $1.2B | $976.2M | $1.6B | $1.3B |
| notional t=40s | **$395.2M** | **$531.7M** | $1.1B | $1.2B | $1.7B | $1.3B |

All six prices moved **up** while spot moved **down**. Shelf 1's "retests held today" went from 2 to 5+ in
40 seconds; shelf 3's went **down** from 4 to 3. Shelf 1's session dollars fell 24%; shelf 2's rose 67%.
A cumulative session count cannot decrease and session dollars cannot evaporate. These are presented as
facts about today ("5+ retests held", "27% of the session"), and the "How to use it" panel builds trading
instructions on top of them (*"Price has turned up off $501.23 5× today"*).

Evidence: `scratchpad/g45_i4.log` (`shelf-drift-40s`), `shots/G45_trace_dark-pool_1440x900_p2.png`,
`shots/G45_darkpool_shelfselect_1440x900.png`.

---

### P0-6 · Reconstruction's "Premium worked" tile shows the projected total, not what was worked

`metaorder.ts:411` `totalReconstructedUsd = metaorders.reduce((a, m) => a + m.estTotalUsd, 0)` — a sum of
*estimated totals*. `MetaorderReconstruction.tsx:421-426` labels that number **"Premium worked"**.

The same page uses "worked" for the opposite quantity three rows below
(`MetaorderReconstruction.tsx:266`: `{fmtUsd(m.filledUsd)} worked of {fmtUsd(m.estTotalUsd)} est.`).
Measured in one DOM snapshot:

- tile: **PREMIUM WORKED $3.1M**
- rows: `$842.4K worked of $1.2M est.` · `$836.4K worked of $1.0M est.` · `$558.9K worked of $859.8K est.`
- Σ worked = **$2.24M**; Σ est. = **$3.06M**

The tile is off by the entire unworked remainder and contradicts the page's own vocabulary.
Evidence: `shots/G45_trace_reconstruction_1440x900_p1.png`, `scratchpad/g45_i3.log` (`row-numbers`).

**Fix:** either relabel the tile "Premium inferred" or sum `filledUsd`. Same for the TRACE read sentence
(`metaorder.ts:430`, *"$3.1M of premium being worked"*).

---

### P0-7 · Reconstruction calls an inferred fill "confirmed"

`MetaorderReconstruction.tsx:243`:

```tsx
{fmtUsd(m.filledUsd)} <span className="text-textMuted">confirmed →</span> {fmtUsd(m.estTotalUsd)} …
```

Measured: the string `confirmed` appears **4×** on the page at load, three of them as
`$842.4K confirmed → $1.2M inferred`, `$836.4K confirmed → $1.0M inferred`,
`$558.9K confirmed → $859.8K inferred`.

`filledUsd` is the sum of the *inferred* child prints (`metaorder.ts:336`). The page's own caveat says so:
*"Inferred from the session tape — no order-audit trail or ticket IDs confirm these prints belong to one
parent."* (`MetaorderReconstruction.tsx:97-98`) — and that caveat is **not visible at load**: measured
`caveatVisible: false` until the "Alternates · what would invalidate this" disclosure is clicked
(text length 4 611 → 5 374 chars after expanding).

This is the one thing the brief names explicitly for this desk. Nothing on this page is confirmed.
**Fix:** the word is "printed", not "confirmed"; and hoist `PER_OUTPUT_CAVEAT` out of the disclosure.

---

### P0-8 · Dark Pool's first tile is a hash presented as a measurement

`darkpool.ts:394-397`:

```ts
// A modelled session share, not a measured one: nothing in the snapshot
// carries consolidated volume …
dpSharePct: hRange(seed('share'), 34, 52),
```

`DarkPool.tsx:486-490` renders it as the desk's **first** tile:
**`OFF-EXCHANGE SHARE / 45.4% / of today's volume printed away from the lit book`** — a claim about a
quantity that does not exist anywhere in the app. The code comment is honest; the interface is not.
The same value is reprinted on `/pulse` (`registry.tsx:415`, *"45% off-exchange"*).

Evidence: `shots/G45_trace_dark-pool_1440x900_p1.png`, `shots/G45_pulse_1440x900_p3.png`.

**Fix:** either drop the tile or mark it with the same "modelled, not measured" treatment the codebase
already uses for feed-gated modules (`DataUnavailablePanel`, `pulseRegistry.tsx:100-134`).

---

## 3. P1 — significant defects

### P1-1 · Dark tape says "newest first" and renders notional-descending

`DarkPool.tsx:522` subtitle `off-exchange prints, newest first` vs `:600`
`initialSort={{ key: 'notional', dir: 'desc' }}`.
Measured: the active `aria-sort` is on **NOTIONAL = descending**; the first 14 Time cells read
`15:18, 15:32, 12:46, 16:08, 14:35, 14:27, 13:19, 17:40, 17:04, 14:39, 17:16, 17:28, 13:19, 18:51`.
Evidence: `scratchpad/g45_i3.log` (`newest-first-claim`), `shots/G45_trace_dark-pool_1440x900_p1.png`.

### P1-2 · The tape's headline read disagrees with the stat card two inches above it

`LiveTape.tsx:676-686` throttles the read sentence to 8 s; the strip renders the live `summary` (`:862`).
Measured in a single DOM snapshot: **`SWEEPS 134`** in the strip vs **"138 sweeps on the tape"** in the read.
A second capture 4 minutes earlier: `SWEEPS 130` vs "132 sweeps".
Evidence: `scratchpad/g45_i2.log` (`stat-strip`), `shots/G45_trace_live-tape_1440x900_p1.png`.

### P1-3 · PAUSE freezes the table but not the numbers above it

`LiveTape.tsx:649` `summary = summarizeTape(rows)` reads the **live** array; `:652` `base = paused && frozen ? frozen : rows`
gates only the table. Measured: with the top tape row provably identical across a 6 s paused window
(`frozenTopRowIdentical: true`) the strip's **Largest Print moved $549.8K SPY 505P → $598.8K QQQ 444P** and
Session Premium moved **$41.0M → $37.6M**. The panel subtitle says "rendering paused · tape still
collecting"; nothing says the six cards above are still live, and "Largest Print" can name a print that is
not on the frozen tape.

### P1-4 · The Scanner's anomaly axis cannot change, so no row can rise on evidence

`flowscan.ts:76` `volOverOi = hRange(seed('voi'), 0.15, 1.9)` with
`seed = ${ticker}-${dayKey()}-scan-${strike}-${right}-…` — constant for the whole session. `bidPct`
(`:85`) → `bullScore` (`:89`) → `sentiment` (`:90`), `deltaOi` (`:91`), `sweeps` (`:114`), `dte`, `iv` are all
drawn from the same day-keyed seed.

Measured over **45 s**, keyed by contract: **44 of 44 contracts kept exactly the same Vol/OI, the same
Conviction score and the same Read.** The only field that moved was `Est ΔOI/d`, by ≤0.2%:

```
SPY 495P  1.50|+59|+25,175|BULLISH  →  1.50|+59|+25,214|BULLISH
SPY 495C  1.58|-76|-8,897 |BEARISH  →  1.58|-76|-8,911 |BEARISH
SPY 510P  1.74|+15|-10,845|NEUTRAL  →  1.74|+15|-10,834|NEUTRAL
```

And there is no anomaly distribution to rank: across the 44 rendered contracts, Vol/OI measured
**min 0.17, median 1.08, p90 1.68, max 1.87** — a max/median ratio of **1.73**, exactly the flat profile a
uniform `[0.15, 1.9]` draw produces. The `Unusualness (vol/OI pct)` control
(`FlowScanner.tsx:93-98, 562-568`) is a percentile cut over a distribution with no tail.

### P1-5 · Two of five Scanner presets are no-ops; the premium filters are 2 orders of magnitude off

Measured per-contract premium on the live scan: **min $615.6K, max $83.5M**. The Min-premium control tops
out at **≥$1M** (`FlowScanner.tsx:78-83`).

| Preset | Rows kept |
|---|---|
| Whale premium (prem ≥ $1M) | **43 of 44** |
| Liquid names (OI ≥ 1 000) | **44 of 44** |
| Near-money calls | 20 of 44 |
| Unusual sweeps | 4 of 44 |
| OTM lottos | 1 of 44 |

"Whale premium" removes one contract; "Liquid names" removes none. Evidence:
`scratchpad/g45_i3.log` (`preset2`), `shots/G45_scanner_preset_*_1440x900.png`.

### P1-6 · LiveTape's ≥$1M chip and its `rail-king` accent are dead

Measured on a frozen 400-print tape: `≥$100K → 148`, `≥$500K → 1`, **`≥$1M → 0 of 400`**. Largest print in
the session: **$600.3K**. `rowAccent` (`LiveTape.tsx:68-73`) reserves `rail-king` for ≥$1M and the Largest
Print card reserves the magenta/king tone for ≥$1M (`:868`). Direct DOM count: `tr.rail-king` = **0**,
`tr.rail-warn` = 2 of 23 rendered rows. The house palette's "exceptional/king" state is unreachable on this
desk, and a filter chip that always returns an empty table is on the toolbar.

### P1-7 · "Flow half-life" is not what the legend defines

Legend, `MetaorderReconstruction.tsx:457`: *"half-life = time for half the remaining clip at the current pace"*.
Computation, `metaorder.ts:357`: `baseRemain × (HIGH 0.30 | MED 0.45 | LOW 0.62)` — never ×0.5.
Measured on 3/3 rows:

| Time left (shown) | Implied `baseRemain` | Definition ⇒ | Shown |
|---|---|---|---|
| 5–9 m (HIGH) | ≈8.2–9.1 | ≈4.1–4.5 m | **3 m** |
| 12–24 m (MED) | ≈16.7–17.8 | ≈8.4–8.9 m | **7 m** |
| 19–36 m (MED) | ≈26.4–26.7 | ≈13.2 m | **12 m** |

### P1-8 · Reconstruction's "why grouped" evidence is a tautology of the generator

Every strategy template pins its legs' aggressor side (`metaorder.ts:152, 161, 171-172, 183-184, 194, 204-205, 215`),
so `askPct` (`:337-338`) is 0 or 100 by construction for single-leg strategies. Measured: **3 of 3 parents
render `ASK-LIFT 100%`**, and all three "Why grouped" sentences read *"lean on ask-side buy aggression
(100% at the ask)"*. That sentence is offered as the reason the clustering held. There is no clustering:
`buildMetaorderView` synthesises children **from** the chosen strategy (`:288-318`); the page copy claims
*"TRACE clusters those prints by strike geometry, aggressor side and timing"* (`MetaorderReconstruction.tsx:466-468`).

The same construction makes the desk's one bespoke mark uninformative: the child-print Timeline colours by
`p.side === 'ASK' ? BULL : grey` (`:121`), so for the 5 single-leg templates every dot is the same green.
Measured: 7 dots and 6 dots, all `#30D158`. Evidence: `shots/G45_trace_reconstruction_1440x900_p1.png`, `_p2.png`.

### P1-9 · Three independent premium scales describe the same instrument's option flow

Measured on one session, SPY:

| Surface | Largest option print shown |
|---|---|
| `/trace/live-tape` (`flowtape.ts:95`) | **$600.3K** (0 of 400 prints ≥ $1M) |
| `/pulse` Options Flow (`pulseflow.ts:136`) | $1.2M |
| `/pulse` Liquidity Map annotations (`flowSweeps.ts:56-57`, `180_000 + roll^2.1 × 4_200_000`) | **"$2.5M Put Sweep"**, "$2.1M Put Sweep", "$1.1M Put Sweep" |

The Liquidity Map and the Options Flow tape sit on the **same screen** and disagree by 4×; the Trace tape
disagrees with both. Evidence: `shots/G45_pulse_1440x900_p2.png`, `shots/G45_pulse_1440x900_p4.png`.

### P1-10 · Dark Pool's dominant object by area is an appendix about other tickers

Measured section offsets on `/trace/dark-pool`:

| Section | y | height | share of page |
|---|---:|---:|---:|
| Dark tape | 317 | 882 | 18% |
| What the blocks say | 1 215 | 271 | 6% |
| Liquidity shelves / How to use it | 1 502 | 331 | 7% |
| **Dark-Pool Feed · by sector** | 1 905 | **2 831** | **59%** |

At 390×844 it is **7 582 px of 11 476 px = 66%**, nine viewport-heights. Its own intro paragraph says
*"None of it is tied to SPY"* (`DarkPool.tsx:790`). 192 rows × 10 sectors, un-virtualized, are 59% of a desk
whose subject is one ticker's blocks. It is also most of the route's **12 187 DOM nodes** (`DataTable.tsx:97`
has no windowing; the dark tape adds another 240 un-virtualized rows).

### P1-11 · The tape is unusable at 390 px, and the Scanner hides its own conclusion there without saying so

`/trace/live-tape` @390: the app's own counter reads **"15 COLUMNS OFF-SCREEN · SCROLL OR HIDE SOME"** —
15 of 17 data columns clipped, only `PRINT` fully legible. Honest, but the remedy is 15 individual toggles
in a popover.
`/trace/scanner` @390: 4 of 10 columns visible (`CONTRACT, LAST, VOL, OI`); **`CONVICTION` and `READ` — the
two columns the desk exists for — are off-screen, and this table has no clipped-column counter at all.**
`/trace/reconstruction` @390 and `/trace/scanner` @390: the Trace sub-tab bar is horizontally scrolled with
the **first tab ("Tape") completely out of view** and no scroll affordance.
Evidence: `shots/G45_trace_live-tape_390x844_p1.png`, `shots/G45_trace_scanner_390x844_p1.png`,
`shots/G45_trace_reconstruction_390x844_p1.png`.

---

## 4. P2 — hierarchy and comprehension

### P2-1 · 15% of the tape is unreachable by the sentiment filter
Measured on a frozen 400-print base: `All 400 / Bullish 195 / Bearish 143` ⇒ **62 NEUTRAL prints with no
filter option**. `SENT_OPTIONS` (`LiveTape.tsx:54-58`) offers All/Bullish/Bearish only, while the column
renders three states (`SENT_TEXT`, `:191-195`).

### P2-2 · "Call / Put Premium" headlines a count
`LiveTape.tsx:852`: `value={`${summary.callCount} / ${summary.putCount}`}` under the label *Call / Put
Premium*, with the dollars demoted to the sub-line. Measured: **`201 / 199`** rendered as the tile's big
number; `$17.4M vs $23.6M` in 11px muted type below it.

### P2-3 · Two of six tiles carry one fact
`flowtape.ts:152` `blocks: prints.length - sweeps` — complementary by construction. Measured: Sweeps 135 +
Blocks 265 = 400 exactly, every time. "Sweeps · aggressive orders" and "Blocks · negotiated size" are one
number and its complement occupying a third of the strip.

### P2-4 · The Scanner shows a conviction score and hides its only input
`bullScore` derives solely from `bidPct` (`flowscan.ts:85-89`). `bidPct` is on `ScannerRow` (`:35-36`) but is
**not** in `COL_META` (`FlowScanner.tsx:153-164`) — it appears only in the row drawer (measured:
*"BID-SIDE 78%"*, consistent with the +59 shown in the grid). Scanning 44 rows you cannot see why any row
reads BULLISH, and the surprising cases are unexplainable: measured, **`SPY 511P` is the "TOP BULL"** and
`SPY 511C` reads **BEARISH −44** in the same table.

### P2-5 · Adjacent Scanner tiles contradict each other with no bridging fact
Measured simultaneously: `TOTAL PREMIUM $653.2M — $280.2M calls / $373.0M puts` beside
`NET DIRECTIONAL +$103.7M — bullish premium leads`. Puts carry 33% more premium and the verdict is bullish.
Both are correct per `summarizeScanner` (`flowscan.ts:163-176`: call/put split vs sentiment split) but the
page never says they measure different things.

### P2-6 · Palette: a midpoint cross is coloured as positive market direction
`DarkPool.tsx:36` `MIDPOINT: 'bull'` and `:311` the `MID` chip in `text-bull`. The file's own comment
(`:26-30`) says the classification *"is by what the print DOES to the spread, not by whether it is bullish"*.
Measured: green `MID` chips on rows whose `vs Spot` is −0.38%, −0.57%, −0.75%. Same class of issue at
`:344`, where a print's **location relative to spot** is toned bull/bear.

### P2-7 · Palette: urgency is coloured directionally
`MetaorderReconstruction.tsx:33-37` `urgencyTone = { LOW: 'bull', MED: 'warn', HIGH: 'bear' }`.
Measured: `TIME LEFT 5–9m` rendered in bear red because the parent is HIGH urgency. Urgency is process
state; the house palette reserves red/green for market direction and silver for process. (The neighbouring
`INFORMED SHARE` tile gets this right — `tone: 'select'`, `:419`.)

### P2-8 · The Pulse "Dark Pool" panel stretches three facts across 1 382 px
`registry.tsx:419-425` renders each shelf as a 3-item `flex justify-between` row. In the default preset the
panel is **1 382 px wide**; the largest measured empty rectangle on `/pulse` sits inside it at
**(960, 2016) 192 × 240 px**, with a second at **(1152, 1992) 192 × 192 px**. The Dark Pool *desk* renders
the same data with a `grid-cols-[88px_92px_1fr_72px_64px]` and a notional meter (`DarkPool.tsx:690-716`);
the Pulse copy drops the meter and keeps the width.
Evidence: `shots/G13b_pulse_1440_gap.png`, `shots/G45_pulse_1440x900_p3.png`.

### P2-9 · The Dark Pool size meter is a column of identical stubs at its own default sort
`DarkPool.tsx:361` `SizeBar pct={(p.size / maxSize) * 100}` with `maxSize` over the on-screen rows
(`:290`). Because the default sort is notional-descending and notional ≈ size × price, the visible rows are
the largest by size. Measured, top 6 rows: 257 861 / 253 332 / 248 317 / 243 107 / 238 416 / 234 919 →
**100%, 98%, 96%, 94%, 92%, 91%** of max. A 9% spread across the whole visible column.
Evidence: `shots/G45_darkpool_printexpand_1440x900.png`.

---

## 5. What actually works (measured, click-by-click)

Reported because "measure, don't assert" cuts both ways.

| Control | Verified behaviour |
|---|---|
| LiveTape · Flow type | All 400 → Sweeps **135** → Blocks **265**; counter and table both update |
| LiveTape · Sentiment | All 400 → Bullish **195** → Bearish **143** |
| LiveTape · Min premium | 400 → 148 → 1 → 0 |
| LiveTape · Pause | Top row byte-identical across 6 s; badge counts buffered prints ("Paused · 17 new prints buffered") and the count grows |
| LiveTape · Columns popover | Toggling `IV` removed exactly `IV` from `thead` (17 → 16 headers) |
| LiveTape · row → drawer | 520 px drawer, correct moneyness wording, "WHAT IT READS AS" + "COMPETING READ" |
| LiveTape · clipped-column counter | Correctly reported 15 columns off-screen at 390 px |
| Scanner · header sorts | OI / Conviction / IV / Est ΔOI/d each changed the top row; `aria-sort` set correctly |
| Scanner · row → drawer | 520 px drawer with contract flow chart, net-premium chart, bid-side %, sweeps |
| Scanner · Filters popover | Reset restored 44/44 |
| Dark Pool · exec filter | All 240 → Blocks 56 / LIS 23 / Midpoint 68 / Iceberg 28 / Slices 18 / Sweeps 10 / Late 37 (sums to 240) |
| Dark Pool · intent filter | 75 / 4 / 61 / 100 (sums to 240) |
| Dark Pool · notional filter | 240 → 174 → 110 → 55 |
| Dark Pool · row click | Opens "INFERRED AS / CONFIDENCE MODERATE · 57% / SHELF HELD, 5+ RETESTS HELD" + read + **COMPETING READ** |
| Dark Pool · shelf select | `aria-pressed` moves; the "How to use it" panel retargets ($501.23 → $502.43 shelf, share and retest line follow) |
| Reconstruction · Alternates | Expands 4 611 → 5 374 chars; caveat becomes visible |
| Reconstruction · child prints | Mounts a real table (0 → 1 `<table>`) |
| Pulse · layout menu | Lists all 5 presets; switching to Flow Command re-renders the grid |
| axe-core | 0 violations on all five routes |

**Dark Pool passes the brief's "must not label every print bullish or bearish" test, measurably**: only
**79 of 240 prints (33%)** carry a directional intent; 161 are HEDGE FLOW or ROTATION. Every directional
label carries a confidence tier that is deliberately *not* green (`DarkPool.tsx:140-145`) and a
"Competing read". That is the strongest honesty work on either desk and should be protected.

---

## 6. GATE 17 — the five objects, per route

| | dominant analytical object | current-state object | main conclusion | risk / invalidation | next action |
|---|---|---|---|---|---|
| `/pulse` | **ABSENT** — 10 co-equal grid panels; the biggest by area (Liquidity Map, 1382×596) is at y=**2176** of a 2841 px page, 2.4 viewports below the fold | present (top-bar quote + Chart's Call Wall / Flip / Put Wall rails) | **ABSENT** in the first viewport; nearest is the Dark Pool panel's "ACCUMULATING" at y=1872 | **ABSENT** (`fracture-snapshot`, `moc-read`, `insight`, `market-notes` all exist in the registry and are in **no** preset) | **ABSENT** |
| `/trace/live-tape` | present — Options Tape, fixed 640 px, full width | present — 6-tile strip | present — "TAPE READ: Bullish tape…" (but see P1-2) | **ABSENT** | **ABSENT** |
| `/trace/scanner` | present — Contract aggregation table | present — 5 tiles | **partial** — a tile ("bullish premium leads"), no read sentence; the only Trace desk without one | **ABSENT** | **ABSENT** |
| `/trace/reconstruction` | present — Inferred parent orders | present — 5 tiles | present — "TRACE READ …" | present **but hidden** behind a per-row disclosure (measured `caveatVisible: false` at load) | **ABSENT** |
| `/trace/dark-pool` | **contested** — the Dark tape leads, but the un-related universe appendix is 59% of the page (P1-10) | present — 6 tiles | present — "What the blocks say: ACCUMULATING" | **present** — "Competing read" at both print and posture level | **present** — "How to use it" (above/below shelf, next shelf) |

`/trace/dark-pool` is the only one of the five that answers all five questions. `/pulse` answers one.

---

## 7. GATE 13 — unexplained empty regions (measured)

Method: mark every element inside `#main-content` that owns a text node or is an `svg`/`canvas`/`img` as
"inked", rasterise at 24 px, then find maximal empty rectangles. At a **≥200 × 140 px** threshold, across all
five routes at both viewports: **zero regions.** That is a clean result and worth stating plainly.

Dropping the threshold to ≥96 × 72 px, the largest true voids (excluding the 1440×72 top-bar spacer at
y=0, which is the `pt-14` offset and is explained):

| Route | vp | Box | Size | What it is |
|---|---:|---|---|---|
| `/pulse` | 1440 | (960, 2016) | **192 × 240** | Pulse Dark Pool panel, `flex justify-between` shelf rows (P2-8) — `shots/G13b_pulse_1440_gap.png` |
| `/pulse` | 1440 | (1152, 1992) | 192 × 192 | same panel, right of the role badge |
| `/trace/scanner` | 1440 | (1104, 456) | **96 × 576** | dead half of the centred diverging Conviction bar, full table height — `shots/G13b_scanner_1440_gap.png` |
| `/trace/scanner` | 1440 | (336, 456) | 96 × 528 | gutter between `CONTRACT` and `LAST` |
| `/trace/dark-pool` | 1440 | (696, 552) | 96 × 504 | dead strip inside the tape between `vs Spot` and `Size` |
| `/trace/reconstruction` | 1440 | (192, 1728) | 984 × 72 | band under a child-print Timeline |
| `/trace/live-tape` | 1440 | (480, 120) | 960 × 96 | right of the page header / breadcrumb |
| `/pulse` | 390 | (96, 1416) | 264 × 96 | Options Flow panel header row |

None of these are the "half-empty dashboard" failure mode. The two worth fixing are the Pulse Dark Pool
panel (P2-8) and the Scanner's Conviction column, which reserves 150 px for a bar that uses at most half of
it per row.

---

## 8. Signature verdicts (Gate 45 / 49-52)

### 8.1 Pulse — the signature exists but is buried

**It has one.** `LIQUIDITY MAP` (`LiquidityHeatmapChart.tsx` + `data/liquidityField.ts`) is a genuine
time × price resting-liquidity field: shelves are born, persist, get pulled, decay on contact with the
traded range and re-stack after price leaves (`liquidityField.ts:1-26`). **It uses real product data** —
the chart's own bars, `KeyLevels` (call/put wall, flip), the dark-pool shelf notionals, chain OI by strike
and GEX node concentrations (`registry.tsx:190-206`). Some texture is hashed (spoof/pulled levels
`liquidityField.ts:209-231`, amplitude knots `:248, :275`), but the shelf skeleton is product data.
Measured on screen: resting shelves, sweep annotations, DP levels at 503.23 / 501.11 / 500.18, Call Wall
505.00, Put Wall 500.00, Flip 502.50, volume histogram — `shots/G45_pulse_1440x900_p4.png`.

**But it is not the desk's signature, because it is the tenth of ten panels at y = 2 176 of a 2 841 px page.**
What a visitor actually meets in the first viewport is a chart and a table of dollar figures. And the desk's
only literal "pulse" is a 1 s cell-colour transition on the GEX matrix, budgeted to exactly one panel
(`PulseWorkspace.tsx:696, 712`) — a numeric table breathing, not a pressure state.

**Recommendation (no new data, no new component):** make the Liquidity Map the anchor of the
`slayer-classic` preset — swap its layout row with `c-chart` in `presets.ts:135-146` so it opens in the top
band at full width, with the flow tape and alert rail beneath it. Then give it the pressure axis it lacks by
overlaying the cumulative-delta series the desk **already builds for a different panel**:
`WorkspaceCtx.cmd.orderFlow` (rendered today by `OrderFlowPanel`, `registry.tsx:266-271`) shares the
Liquidity Map's time axis exactly. Flow (cum delta) over liquidity (the field) over the level skeleton
(walls/flip) is the flow-volatility-liquidity state object the brief asks for, from three sources already
mounted on this page.

### 8.2 Trace · Tape — prints do not accumulate into clusters

**No signature today.** Measured: 400 structurally identical rows in a virtualized table
(`LiveTape.tsx:1064-1105`). The only row-level differentiation is `rowAccent`, and its top tier is dead
(P1-6: `tr.rail-king` = 0). Repeats are invisible — measured on the rendered window,
`SPY 507P` appears twice, `SPY 502P` twice, `QQQ 444P` three times, with nothing joining them.

**Recommendation (data already on the row):** a **contract accumulation rail** in the Time column that
already exists (`LiveTape.tsx:1075-1089`). Group `rows` by the contract key grammar the codebase already
has (`pulseflow.ts:182` `contractKey`), and render each print's position within its contract's running
session premium: the rail thickens with that contract's share of `summary.totalPremium`, prints of the same
contract are joined by a continuous left rail, and the Nth repeat carries an ordinal notch. A third print in
one strike then physically *stacks* on the tape instead of scrolling past identically. Source: `rows`
(already held) + `summarizeTape` (already computed). No new field.

### 8.3 Trace · Scanner — the distribution cannot change

**No signature today, and the underlying evidence is frozen** (P1-4: 44/44 contracts unchanged over 45 s;
Vol/OI uniform on [0.17, 1.87]).

A rank-delta gutter alone would report nothing, because nothing moves. The mechanism has to make the
evidence real first, and the data for that is already on the route:

**Recommendation:** stop drawing `volume` and start accumulating it. `MarketSnapshot.tape` already emits
~4 prints per 1.5 s tick carrying `ticker / strike / type / size` (`simulator.ts:586, 650`) — that *is*
per-contract volume, and `LiveTape` already accumulates exactly this stream into a 400-row buffer.
Accumulate the same stream into a per-contract running total in `buildScannerRows`, set
`volOverOi = accumulatedVolume / (node.callOI | node.putOI)` (both already in `snapshot.chain`), and the
percentile cut in `unusualCut` (`FlowScanner.tsx:562-568`) becomes a live re-partition. Then add the
signature: keep the previous scan's ranking — `scanRef.current` is **already retained** across scans
(`FlowScanner.tsx:502-512`) — and render a rank-delta gutter (▲7 / ▼3 / NEW) plus a one-word "what moved"
chip naming the input that changed most. A row then rises because measurable evidence changed, and the page
says which evidence.

### 8.4 Trace · Reconstruction — meets the "never confirmed" bar in structure, breaks it in wording

The desk does the hard part: per-parent alternates, a "what would invalidate this" note, a per-output
caveat, and "inferred" 26× on the page. It then prints **"confirmed"** four times (P0-7), hides the caveat
behind a disclosure, and offers a tautology as the grouping evidence (P1-8). Fix those three and the
structure already satisfies the brief. No new mechanism is needed here.

### 8.5 Trace · Dark Pool — has a price-memory object; it just has no memory

The Liquidity Shelves ladder is the right object and the right visual (price, role, notional meter, distance,
retest count, spot rule interleaved). Two things break it: the shelves are drawn *before* the prints and the
prints are then pulled onto them (`darkpool.ts:267-282`), and every shelf price, retest count and dollar
figure is recomputed from the live session range each tick (P0-5: all six prices moved in 40 s while spot
moved the other way; a retest count decreased).

**Recommendation:** invert the causality using data the desk already computes. Bucket `view.prints` by price
into fixed bins and take the six highest-notional bins as the shelves — the clustering pass already exists
(`darkpool.ts:322-338` `clusterOf`), it is simply run *after* the shelves rather than to produce them —
then anchor those prices for the session on `dayKey()` alone, not on live `lo`/`hi`. `retestsByShelf`
(`:72-93`) already reads real `priceHistory` and becomes a monotone session count the moment its anchors
stop moving. Then "prices the blocks keep crossing at" is true, and the ladder is genuine price memory.

---

## 9. GATE 63 red-team — what would survive a logo swap

Named with the evidence for the judgement, not by vibe.

**Would look at home in any generic finance product:**

1. **The four Trace desks all open on the same KPI tile row.** Measured: live-tape 6 tiles, scanner 5,
   reconstruction 5, dark-pool 6 — all rendered by the same `MetricGrid min="170px"` + `StatCard`
   (label-uppercase-micro / big value / muted sub). Four consecutive desks whose first 130 px are
   interchangeable. The strongest single tell.
2. **The toolbar grammar.** `Filters ▾ / Templates ▾ / Columns ▾` on Scanner, `Views ▾ / Columns ▾` on Tape —
   same trigger class string (`triggerCls`, `FlowScanner.tsx:235`), same popover shell, same "N" badge, same
   "Save current filters…" input. Swap the words and this is any B2B table product.
3. **`DataTable` itself** — sortable header + chevron + row hover + `maxHeight` scroll box
   (`DataTable.tsx:97-160`), used unchanged on Scanner and Dark Pool.
4. **The Scanner's Conviction column**: a centred diverging bar with a signed number, red left / green right.
   Generic sentiment-meter idiom, and it leaves a 96 × 576 px dead strip (§7).
5. **`MetaorderReconstruction`'s "inferred readings" row** — six `Stat` label/value pairs in a
   `grid-cols-6`. A stat row inside a card inside a list.

**Would not, and should be defended:**

- The **Liquidity Map** field (`liquidityField.ts`) — nothing generic about a decaying, re-stacking
  time × price book with sweep pills on it.
- The tape's **per-row micro-meters**: `SpreadCell` (bid ● ask with the fill dot at `fillPos`),
  `FlowCell` (side chip + signed score + centre-anchored bar), `RatioCell` — `LiveTape.tsx:123-189`.
  Three graphs per row at 40 px row height is a genuine terminal idea.
- **`TapeRowDrawer`'s "What it reads as" / "Competing read"** and `printRead.ts`'s sentence generator.
- **Dark Pool's "Competing read" + confidence tier that is deliberately never green**
  (`DarkPool.tsx:136-153`), and the execution-archetype legend printed under the tape it belongs to
  (`:604-616`).
- **Reconstruction's Alternates + invalidation disclosure** (`MetaorderReconstruction.tsx:347-372`).
- The **clipped-column counter** on the tape (`LiveTape.tsx:936-940`) — saying out loud what the viewport is
  eating is a house behaviour, not a generic one.

The pattern: the *rows and drawers* are Slayer; the *frames around them* are stock. The cheapest identity
win available is to stop opening four consecutive desks on the same six-tile strip.

---

## 10. What I could not audit

- **`/workspace`** — it is a 301 to `/pulse` (`App.tsx:121`); there is no distinct surface to audit.
- **Pulse panel chrome interactions**: detach, pop-out to a second display, duplicate, minimize, maximize,
  the arrow-key move/resize handle, and the drag-resize grid. Pop-out needs the Window Management API and a
  real second display; drag-resize needs sustained pointer input I did not simulate. I read
  `detach.ts`/`popoutWindow.ts`/`useScreens.ts` and the 40 k-line `detach.test.ts` but ran no browser repro,
  so **I make no claim about whether these work.**
- **Add-panel catalog and the "Data connections" tray** — I confirmed the menu lists 5 presets and that
  switching to Flow Command re-renders the grid; I did not add, close or duplicate a panel.
- **The remaining 4 Pulse presets** (Swing Desk, GEX Wall, GEX + Order Flow, Four-Chart Index Grid) were
  listed but not opened and not screenshotted.
- **LiveTape "Views" save/apply/delete** — the Playwright locator for the popover's `Save` button timed out
  twice (`scratchpad/g45_i2.log`, `lt-views ERROR`). I could not determine whether this is a selector problem
  on my side or a real defect. **Untested, not "working".**
- **Keyboard-only traversal** of the react-grid-layout desk and of the tape's virtualized rows. axe reports
  0 violations, but axe does not test focus order through a windowed list or a drag-grid.
- **Colour-contrast against the real theme tokens** beyond what axe checks, and reduced-motion behaviour.
- **A down session.** Every measurement here was taken on an up day (+0.76…0.78%). P0-4 predicts the Dark
  Pool posture inverts wholesale on a down day; I could not force `changePercent < 0` without modifying
  source, which this phase forbids. The code path is stated instead of demonstrated.
- **Render/interaction performance numbers** — DOM node counts are measured (Pulse 1 775, Dark Pool 12 187)
  but I ran no profiling; that belongs to `09-performance-charts-tables.md`.
