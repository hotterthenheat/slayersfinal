# 07 — Responsive sweep & dead-space audit
**Gates 33, 34, 13, 17** · Slayer Terminal · production build served at `http://127.0.0.1:8123`
Measured 2026-08-03 with Playwright/Chromium 1194 at deviceScaleFactor 1, `slayer_onboarded_v1=1` pre-seeded, Google Fonts blocked.

Coverage: **25 routes × 8 viewports = 200 route×viewport measurements**, plus 5 targeted probes.
Screenshots: `docs/audit64/shots/` (50 baseline shots at 1440×900 and 390×844, plus 10 `HOVF_*`, 30+ `DEAD_*`/`DEAD2_*`, 18 `OVL_*`, 2 `ZOOM_*`, 1 `SCROLL_*` evidence shots).

---

## 0. The measurement correction that changes the headline

The brief specifies horizontal overflow as `document.documentElement.scrollWidth > clientWidth`.
**That test is false on all 200 route×viewport combinations — and it is the wrong test for this app.**

`AppShell.tsx:92-103` wraps the whole terminal in `h-screen … overflow-hidden` and scrolls the desk inside
`<main id="main-content" className="h-full overflow-y-auto pt-14">`. Per CSS overflow rules, once `overflow-y`
is not `visible`, `overflow-x: visible` computes to `auto`. So `main` is silently a **horizontal** scroller too.
The document can never overflow, because `main` absorbs it.

Measuring the real scroller (`main.scrollWidth - main.clientWidth`) finds **10 route×viewport combinations that
do overflow horizontally**, on which the entire desk — breadcrumb, page title, sub-nav, stat cards — drags
sideways. See F-01.

Every number in this report that says "h-ovf" is measured on `main#main-content`, not on the document.

---

## 1. Findings

### F-01 · P1 · Gate 33 — The whole desk scrolls sideways on phones; the document-level overflow test cannot see it

`main#main-content` overflows its own client width on 10 of 200 combos. Because `main` also carries the
page header, scrolling right drags the breadcrumb and the `<h1>` off screen — the reader loses their location,
not just a cell.

| viewport | route | `main.scrollWidth − clientWidth` | reachable by scrolling? | first element past the edge |
|---|---|---|---|---|
| 360×800 | `/pinpoint/levels` | **+76px** | yes (maxScrollLeft 66) | `DIV "Calls Puts Net $ % max Export CSV"` |
| 360×800 | `/trace/dark-pool` | **+47px** | yes (37) | `SPAN "2× held"` |
| 360×800 | `/earnings` | **+35px** | yes (25) | `DIV "Window All dates Today This wk Nex…"` |
| 360×800 | `/pinpoint/stress` | **+29px** | yes (19) | `SPAN "CRITICAL"` |
| 360×800 | `/news` | **+11px** | barely (1) | `DIV "All Earnings Guidance Analyst Macr…"` |
| 360×800 | `/pinpoint/gamma` | **+10px** | **no (maxScrollLeft 0)** | — clipped, unreachable |
| 390×844 | `/pinpoint/levels` | **+46px** | yes (36) | `DIV "Calls Puts Net $ % max Export CSV"` |
| 390×844 | `/trace/dark-pool` | **+17px** | yes (7) | `SPAN "2× held"` |
| 390×844 | `/earnings` | **+5px** | **no (0)** | — clipped, unreachable |
| 430×932 | `/pinpoint/levels` | **+6px** | **no (0)** | — clipped, unreachable |

Evidence: `docs/audit64/shots/HOVF_pinpoint_levels_360x800.png` — the same page after
`main.scrollLeft = 66`. The breadcrumb reads `AL / PINPOINT / LEVELS`, the `<h1>` reads `inpoint`, the
StatCards read `GEX / 4.8M` and `VEX / 7.7K`. Nothing about that is a table scrolling inside its panel.

Named root cause for the two worst:

* `DarkPool.tsx:690` — the shelf-ladder button is `grid-cols-[88px_92px_1fr_72px_64px]` with `gap-3`.
  Fixed tracks 88+92+72+64 = 316px, four 12px gaps = 48px, plus the button's `px-4` = 32px → **396px minimum**.
  At 390 the available column is 348px. Grid fixed tracks do not shrink, so the row pushes `main` wide.
  That is the `"2× held"` cell in the table above.
* `ExposureLedger.tsx` panel actions row (leg toggle + normalize + Export CSV) — measured 46px past the
  content column at 390, 76px at 360.

Smallest coherent fix: give the fixed-track grids a narrow-viewport fallback
(`grid-cols-[1fr_auto] sm:grid-cols-[88px_92px_1fr_72px_64px]` or equivalent), and give `main` an explicit
`overflow-x: hidden` so a future regression surfaces as clipped content in review rather than a silently
draggable page. Do **not** just add `overflow-x:hidden` alone — that would hide F-01's symptom while leaving
the `"Export CSV"` control off-canvas.

---

### F-02 · P1 · Gate 34 — Sector-rotation chips on `/stocks` stack; one sector is unreadable at every viewport

`Stocks.tsx:257-258` positions each sector chip absolutely at its raw data coordinate
(`left: xOf(rs1m)%; top: yOf(rs1w)%`) with `-translate-x-1/2 -translate-y-1/2` and **no collision dodging**.
When two sectors share near-identical relative strength, the chips stack and the lower-z one disappears.

Measured (clip-aware overlap, fraction = share of the smaller chip's box that is covered):

| viewport | pair | overlap | fraction covered |
|---|---|---|---|
| 1440×900 | `INDU` × `MATL` | 40.8 × 17px | **0.54** |
| 1024×768 | `INDU` × `MATL` | 34.0 × 17px | 0.45 |
| 768×1024 | `INDU` × `MATL` | 39.1 × 17px | 0.51 |
| 390×844 | `INDU` × `MATL` | 47.3 × 17px | **0.62** (plus `TECH`×`UTIL` 34.4×19.9, 0.53) |
| 360×800 | `INDU` × `MATL` | 47.9 × 17px | **0.63** (5 colliding pairs total) |

Evidence: `docs/audit64/shots/OVL_stocks_1440x900.png` — in the LAGGING quadrant only one chip label
is legible ("MATL"); INDU sits behind it. `TECH` sits on top of `UTIL` in the middle. The ranked table to
the right lists both INDU (#9, score 54) and MATL (#10, score 50), so the data exists — the chart just
cannot show it.

Fix: a simple greedy label-dodge pass (offset colliding chips vertically by their own height before paint),
or shrink the chip to a dot and place the code with dodging. Not a redesign of the quadrant.

---

### F-03 · P1 · Gate 34 — `/pinpoint/history` draws two structural level tags on top of each other

`GexHistory.tsx:121-128` draws one end-of-line tag per series at `Y(last[s.key])` in `SERIES` order
(callWall, flip, putWall, king) with a fixed 14px `<rect>`. There is no vertical dodging. In the measured
session Put Wall and King Strike are **both $500.00** (confirmed by the adjacent "How structure moved" panel),
so the `king` tag — drawn last — completely covers the `putWall` tag.

Measured: `"500" × "500"` overlap 16.2 × 11.7px, **fraction 1.00** at 1440×900; 12.5 × 11.6px, fraction 1.00
at 768×1024. Evidence: `docs/audit64/shots/OVL_pinpoint_history_1440x900.png` (magenta box on the
right edge of the Level Migration Timeline; a second tag rect is visible behind the magenta pill).

Consequence: the chart appears to leave one of its four series unlabelled, and the reader cannot tell which
line terminates where.

Secondary observation on the same lines (not counted as a separate finding): the tags print
`.toFixed(0)`, so the Flip tag reads `503` while the panel beside it reads `$502.50`.

---

### F-04 · P1 · Gate 33 — Panel titles collapse to as little as 7% of their text on phones

`Panel.tsx:102-130`: the header is `flex items-center justify-between gap-3`; the title column is
`min-w-0 … truncate` and the actions column is `shrink-0`. Actions therefore win the entire row and the
title absorbs all the loss. The `title=` attribute (`Panel.tsx:111`) is the only fallback, and it is
hover-only — unavailable on the touch viewports where the truncation is worst.

Measured (`clientWidth / scrollWidth` of the `<h2>`):

| route | viewport | title | visible | rendered as |
|---|---|---|---|---|
| `/compass` | 390×844 | "Largest Impact Contracts" | **14px of 191px — 7%** | ~1 character |
| `/compass` | 430×932 | "Largest Impact Contracts" | 54px of 191px — 28% | — |
| `/compass` | 360×800 | "Top Setups" | **32px of 77px — 42%** | `TOP…` |
| `/compass` | 390×844 | "Top Setups" | 62px of 77px — 81% | — |
| `/pinpoint/gamma` | 430×932 | "Gamma Heatmap SPY" | 37px of 165px — 22% | — |

Evidence: `docs/audit64/shots/ZOOM_panel-title_compass_360x800.png` — the panel header reads
**`TOP…  SWEEP 18:26:36  [Cards|Table]`**. The panel's identity is truncated to three characters so that a
clock keeps its full width.

Note on reproducibility: the "Largest Impact Contracts" panel mounts intermittently; I measured it on two
runs (390 and 430) but a later run did not render it, so there is no zoom screenshot for that row — only
the 360×800 "Top Setups" capture above.

Fix: below `sm`, let the actions cluster shrink or wrap (drop `shrink-0`, or move the timestamp chip out
of the header) so the title keeps a readable minimum.

---

### F-05 · P1 · Gate 33 — On `/compass?sleeve=…` the selected sleeve is off-screen at load, so no sleeve looks selected

`Compass.tsx:636-640` renders the sleeve rail as `role="tablist"` with `overflow-x-auto` and `shrink-0` tabs.
The code comment at `Compass.tsx:632-634` states the intent explicitly — *"a horizontal rail keeps the sleeve
you are on visible and the rest one swipe away"* — but nothing scrolls the active tab into view on mount.

Measured on a cold load of `/compass?sleeve=structures`, position of the `aria-selected="true"` tab:

| viewport | active tab box | past right edge by |
|---|---|---|
| 430×932 | L=506, R=602 | **172px** |
| 390×844 | L=506, R=602 | **212px** |
| 360×800 | L=506, R=602 | **242px** |

Evidence: `docs/audit64/shots/compass_sleeve_structures_390x844.png` — the rail shows `0DTE`, `WEEKLY`,
`SWING`, **none of them highlighted**, while the board below shows "DEFINED-RISK STRUCTURES". A reader lands
on a shared link and sees a board that does not match any visible selection.

Same root cause applies to the scanner/style rail at `Compass.tsx:687` for any deep link that selects a
non-first preset.

Fix: `scrollIntoView({inline:'nearest', block:'nearest'})` on the active tab in a mount effect.

---

### F-06 · P2 · Gate 17 — Every desk burns a full-width header band that is ~70% empty

On 20 of 25 routes the **largest empty rectangle in the fold starts at y=56** — immediately under the top
bar — and runs from roughly x=400 to the right edge. The breadcrumb + `<h1>` + subtitle + sub-nav occupy only
the left ~450px of a 168–232px-tall band; the rest is void.

Worst measured (corrected ink rasteriser; `% of fold` = share of the area between y=56 and the viewport bottom):

| route | viewport | empty rect | at | % of fold | fold ink coverage |
|---|---|---|---|---|---|
| `/terminal` | 1600×1000 | 1040 × 168 | (384, 56) | 11.6% | 24.3% |
| `/trace/dark-pool` | 1440×900 | 984 × 168 | (456, 56) | 13.6%* | 33.3% |
| `/trace/scanner` | 1440×900 | 1024 × 168 | (416, 56) | 14.2%* | 23.1% |
| `/pinpoint/history` | 1440×900 | 968 × 168 | (472, 56) | 13.4%* | 37.1% |
| `/pinpoint/stress` | 1440×900 | 736 × 216 | (704, 56) | 13.1%* | 31.6% |
| `/pinpoint/gamma` | 1440×900 | 624 × 232 | (816, 56) | 11.9% | 59.4% |

\* first-pass figure; the corrected pass lowers these by ~1pt but does not change the pattern.

Evidence: `docs/audit64/shots/DEAD_trace_dark-pool_1440x900.png` (magenta box outlines the measured
rectangle: the header band's empty right 984px).

This is the single most repeated dead-space pattern in the app, and it sits on the most valuable pixels
on every desk. It is *not* a request for KPI tiles — the band already has natural tenants that are currently
pushed below it: the sub-nav rail (`Tape · Dark Pool · Scanner · Reconstruction`), the sweep/scan timestamp,
and the "240 OF 240 PRINTS" style scope line. Moving the sub-nav up beside the title reclaims ~168px of
vertical on every desk without adding a single new element.

---

### F-07 · P2 · Gate 17 — `/prove-it` Model scoreboard renders a 5-track grid with 2 engines; 60% of the panel is empty

`ProveIt.tsx:212` hardcodes `grid grid-cols-1 lg:grid-cols-5`, but the scoreboard data is variable-length —
the page's own copy (`ProveIt.tsx:243-245`) says *"an engine whose population is too thin to say anything is
dropped from the board rather than rounded up."* Today it yields 2 engines.

Measured empty area to the right of the last populated track:

| viewport | grid | children | empty width | % of grid | empty area |
|---|---|---|---|---|---|
| 1600×1000 | 1524 × 197 | 2 of 5 | **915px** | **60.0%** | 179,798px² |
| 1440×900 | 1380 × 210 | 2 of 5 | 829px | 60.1% | 174,297px² |
| 1280×800 | 1220 × 210 | 2 of 5 | 733px | 60.1% | 154,113px² |
| 1024×768 | 964 × 238 | 2 of 5 | 579px | 60.1% | 137,657px² |
| 768×1024 | 1 track | 2 of 2 | 0 | 0% | — |
| 390×844 | 1 track | 2 of 2 | 0 | 0% | — |

Evidence: `docs/audit64/shots/SCROLL_prove-it_1600x1000.png` — the panel surface runs the full width
with a `gap-px` divider after "Sweep prints" and then 915px of nothing.

Fix: derive the track count from `scoreboard.length` (or `grid-cols-[repeat(auto-fit,minmax(240px,1fr))]`)
so the board is never wider than its contents.

---

### F-08 · P2 · Gate 33 — `StatCard` truncates its label and sub-line on a single line with a hover-only fallback

`StatCard.tsx:25` and `StatCard.tsx:36` both apply `truncate` with a `title=` attribute as the escape hatch.
On a phone there is no hover, so the clipped half of the sentence is simply gone.

Measured at 390×844 (`clientWidth` 138px for the sub-line on the 2-up mobile grid):

| route | clipped sub-lines | worst |
|---|---|---|
| `/prove-it` | 7 | `"unweighted mean of 2 engine hit rates"` — 138px of 215px, **77px lost** |
| `/trace/dark-pool` | 5 | `"of today's volume printed away from the lit book"` — 138 of 269, **131px lost** |
| `/news` | 5 | `"simulated earnings prints"` — 77 of 128, 51px lost |
| `/stocks` | 2 | `"screens read as supply, not a base"` — 138 of 191, 53px lost |
| `/earnings` | 2 | `"implied 7.4% vs 4.3% modeled"` — 138 of 171, 33px lost |
| `/trace/reconstruction` | 2 | `"outright put buying · 71% done"` — 138 of 172, 34px lost |
| `/tracker` | 2 | `"Expectancy · per trade"` — 138 of 169, 31px lost |
| `/trace/scanner` | 1 | `"$280.2M calls / $373.0M puts"` — 138 of 162, 24px lost |
| `/pinpoint/greeks` | 1 | `"delta dealers shed by 16:00"` — 138 of 154, 16px lost |
| `/pinpoint/history` | 1 | `"spot crossed the gamma flip"` — 138 of 157, 19px lost |

This is not phone-only: at 1440×900, `/trace/dark-pool` still clips
`"of today's volume printed away from the lit book"` by 79px and `"aggressors that finished off-exchange"`
by 18px in a 190px card.

Evidence: `docs/audit64/shots/trace_dark-pool_390x844.png` (six visible `…` truncations) and
`docs/audit64/shots/prove-it_390x844.png` (`P(UP IN 30 SESSIO…`, `distribution mean vs s…`,
`unweighted mean of 2…`).

Fix: allow the sub-line two lines (`line-clamp-2`) below `sm`. The label deserves the same, since
`"P(UP IN 30 SESSIO…"` and `"CALL / PUT PREMIU…"` are unreadable as identifiers.

---

### F-09 · P2 · Gate 33 — `/pinpoint/levels` sticky ledger legend is `overflow-hidden`, so its units marker is unreachable

`ExposureLedger.tsx:139` — `class="sticky top-0 … overflow-hidden whitespace-nowrap"`. The `ml-auto` span at
`ExposureLedger.tsx:150-152` carries the units for the whole ledger (`signed $` or `% of window max`).
Because the legend is a block child of the scroller it stays at the scroller's client width and clips its own
content; horizontal scrolling of the table beneath does not move it.

| viewport | legend clientWidth | scrollWidth | hidden | overflow-x |
|---|---|---|---|---|
| 430×932 | 386 | 470 | 84px | `hidden` |
| 390×844 | 346 | 470 | **124px (26%)** | `hidden` |
| 360×800 | 316 | 470 | **154px (33%)** | `hidden` |

Honest mitigation: the same route prints `UNITS signed $ · GEX per 1% move, DEX delta notional, VEX per 1% vol`
in the SIGN/UNITS explainer higher on the page (visible in `docs/audit64/shots/pinpoint_levels_390x844.png`),
so the information is not lost from the route — only from the panel it labels, and only after the user toggles
`normalize`, at which point the explainer above no longer matches the ledger. Hence P2, not P1.

---

### F-10 · P2 · Gate 33 — Touch targets under 44px on phones

Counting only visible interactive elements that are under 44px in **both** dimensions (a full-width table row
32px tall is listed separately, since horizontal precision is not the problem there). Counts are identical at
430×932, 390×844 and 360×800.

| route | <44px both dims | of total interactive |
|---|---|---|
| `/stocks` | **208** | 451 |
| `/pulse` | **68** | 121 |
| `/news` | 49 | 91 |
| `/trace/live-tape` | 32 | 76 |
| `/earnings` | 29 | 90 |
| `/terminal` | 25 | 53 |
| `/pinpoint/levels` | 21 | 106 |
| `/community/ideas` | 18 | 57 |

The five worst by kind, aggregated across all 25 routes at 390×844:

| # | element | smallest measured | instances | example |
|---|---|---|---|---|
| 1 | `span.cursor-help.underline` — glossary trigger (`Term.tsx:81`) | **6.5 × 11px** | 42 | `"X"` on `/pulse` |
| 2 | `a.text-caption.text-textSecondary` — site-footer links | **23.3 × 14px** | 171 | `"FAQ"` |
| 3 | `a.font-mono.text-micro` — desk sub-links on `/terminal` | 24 × 15px | 60 | `"Tape"` |
| 4 | `button.p-1.5` — panel detach/popout icons | 24 × 24px | 30 | `aria-label="Detach Chart panel…"` |
| 5 | `button.-m-1.5` — row bookmark | 24 × 24px | 22 | `aria-label="Track print"` |

Also 502 instances of `button.inline-flex.items-center` at a 24×24px minimum, and 166 sub-nav tabs
(`button.relative.shrink-0`) at 31.2 × 28px — the primary desk navigation on a phone is a 28px-tall row.

**Verified, not assumed:** I tested whether the glossary tooltip is reachable by tap. It is —
`Term.tsx:55-62` gives the span `tabIndex=0` + `role="button"` and Chromium fires `focus` on tap, so the
explainer opens (`tooltipAfterTap = 1` at 390×844 with `hasTouch: true`). The defect is target size only,
not reachability.

---

### F-11 · P3 · Gate 17 — `/community/ideas` thesis form leaves a 1000 × 336px void at ≥1280px

The form's first row (`TICKER` 250px, `DIRECTION`, `HORIZON`) stops at x≈600 while the next row
(`ENTRY / INVALIDATION / TARGETS / RISK`) spans the full 1536px content width.

| viewport | empty rect | at | % of fold | fold ink |
|---|---|---|---|---|
| 1600×1000 | 1000 × 336 | (600, 56) | **22.2%** | 25.3% |
| 1440×900 | 848 × 336 | (592, 56) | 23.4% | 27.3% |
| 1280×800 | 688 × 352 | (592, 56) | 25.4% | 29.5% |
| 1024×768 | 432 × 352 | (592, 56) | 20.9% | 32.9% |

Evidence: `docs/audit64/shots/DEAD_community_ideas_1600x1000.png`.

---

### F-12 · P3 · Gate 17 — `/compass?view=weigher` caps at 1180px while its sibling `/compass` uses the full shell width

`ContractWeigher.tsx:925` and `ContractWeigher.tsx:1381` both wrap in `mx-auto w-full max-w-[1180px]`.
At 1600×1000 the shell offers 1536px of content width, so 356px is centring slack; the largest single empty
rectangle in the fold is **232 × 872px at (1368, 56) = 13.4% of the fold**, and fold ink coverage drops to
33.1% versus 96.3% on `/compass` at the same viewport.

Evidence: `docs/audit64/shots/DEAD_compass_view_weigher_1600x1000.png`.

Not necessarily wrong — a single-contract drill-down has a legitimate reading width. But it is the only
Compass view that caps, and the Neighbours ladder beside it is starved of the width it would use.

---

## 2. Measured and clean — no finding

These were measured across all 200 combos and produced nothing to report. Stating them so the next pass
does not re-measure.

* **Document-level horizontal overflow: 0 / 200.** `documentElement.scrollWidth === clientWidth` everywhere.
  (Read F-01 before treating this as a pass.)
* **Dead HTML blocks:** 0 across all 200 combos. Searched for visible, non-fixed, unpainted block containers
  taller than 120px and wider than 80px whose subtree contains no text, no `canvas/svg/img/video/input`.
  Every candidate that surfaced was a painted decorative layer (the landing hero's radial vignette,
  1600 × 940px, `background-image: radial-gradient(…)`, `pointer-events: none`) — intentional, not dead.
* **Off-screen control reachability:** across 25 routes × {430, 390, 360, 768, 1024}, **zero** interactive
  elements narrower than the viewport failed to come on screen after `scrollIntoView`. Every clipped chip
  rail, filter row and sub-nav is genuinely swipeable. The only failures were the `sr-only` skip link
  (1×1px, by design) and `<tr>` elements wider than the viewport (whose cells are individually reachable).
* **`/trace/live-tape` narrow-viewport handling is a positive counterexample:** it prints
  `15 COLUMNS OFF-SCREEN · SCROLL OR HIDE SOME` in amber above the table
  (`docs/audit64/shots/trace_live-tape_390x844.png`). No other wide table on the app does this.
* **`Panel` already hides its subtitle below `sm`** (`Panel.tsx:123`, `hidden sm:inline`) with a comment
  explaining why. The remaining title collapse in F-04 is caused by the actions column, not the subtitle.

## 3. Explicitly not reproduced / false positives I retract

Recording these so nobody re-reports them from a naive checker.

* **192 "sibling overlaps" on `/trace/dark-pool` at every viewport.** A bounding-box sibling check flags
  every ticker chip in the dark-pool feed. Measured directly: the `<button>AAPL</button>` box is 24px tall
  (`min-h-6`) with `line-height: 11px`, stacked in a `flex-col` above a 10px `-0.95%` caption whose box
  starts 6px before the button's box ends. **The glyph runs do not collide** (button text occupies
  ~y2034–2045, caption y2046–2056). Pure box overlap from `min-h-6` on an 11px line. No visual defect.
* **17 "label overlaps" on `/compass?view=weigher` at 1440 and 768.** Inspected in
  `docs/audit64/shots/OVL_compass_view_weigher_1440x900.png`: these are adjacent block line-boxes
  overlapping by 7–15px from line-height, not glyph collision. No visual defect.
* **`"Why grouped" × "These 7 child prints were grouped…"` on `/trace/reconstruction`** (fraction 1.00).
  The label sits beside the paragraph; the paragraph's block box merely extends under it. Confirmed visually
  in `docs/audit64/shots/trace_reconstruction_1440x900.png`. Not a defect.
* **`"SPY 505C" × "SPY 502P"` on `/` at 390×844** (fraction 1.00, y≈3547). I could not reproduce it: a
  targeted re-run found only one chip at that position. It was almost certainly a cross-fade frame of an
  animated rotator. **Not a finding.**
* **`/trace/reconstruction` "23–26% of fold empty" at 360/390/430**, and the `/legal/disclaimer` and
  `/guide/overview` entries in my first pass. These came from a rasteriser bug: elements with *mixed*
  content (a text node plus an element child, e.g. `<div><span>TRACE READ</span> 3 parent orders…</div>`)
  were not counted as ink. Corrected pass (`ownText()` on direct child text nodes) removes them.
  `/legal/disclaimer`'s 23% empty column at 1600 is a prose `max-width` — correct, not dead.

## 4. Out-of-gate observations (for the owners of gates 3 / 4)

Not my gates; measured incidentally and passed along rather than dropped.

* `/prove-it` at 1600: `MATCH QUALITY` renders **`TIGHT 85%` in green**
  (`docs/audit64/shots/SCROLL_prove-it_1600x1000.png`). Match quality is a model-confidence measure,
  which the house rule says must never be green. `ProveIt.tsx:217-219` gets this right for the scoreboard
  hit-rate (uses `text-select`, with a comment explaining exactly why) — the stat row does not.
* `/tracker` empty state at 390: the words `one table` (amber), `current` (red) and `saved` (green) are
  tone-coloured although none is directional (`docs/audit64/shots/tracker_390x844.png`).
* `/pulse` chart values are painted into a `<canvas>`: at 390×844 the first *DOM-text* number on the route
  is at **y=591**, though the chart's own price tags are visually readable from ~y=310. Relevant to any
  screen-reader / text-extraction gate.

---

## 5. Route × viewport results table

Columns:
* **h-ovf (main)** — `main#main-content.scrollWidth − clientWidth`. Bold = genuine horizontal overflow.
* **content H** — full scrollable content height (document height, or `main.scrollHeight` inside the shell).
* **first data Y** — Y of the first DOM text node matching a numeric-data pattern, excluding `header`/`nav`
  and anything inside a `position: fixed|sticky` ancestor. Canvas-rendered values are not counted (see §4).
* **clipped** — elements with `overflow-x: hidden|clip` whose `scrollWidth` exceeds `clientWidth` by >1px,
  excluding `sr-only` and the landing marquee.
* **max empty rect** — largest all-empty axis-aligned rectangle in the fold (8px raster, corrected ink pass),
  and its share of the fold area.
* **fold ink** — share of fold raster cells carrying ink.
* **label ovl** — clip-aware overlapping text leaves (≥25% of the smaller box). Measured at 1440, 1024, 768,
  390, 360 only; `-` elsewhere.
* **tap<44 both** — interactive elements under 44px in both dimensions. Measured at 430/390/360 only.

<!--TABLE-->
