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

**On 86 of 200 route×viewport combinations the largest empty rectangle in the fold begins at exactly y=56**
— immediately under the top bar. At the three desktop widths it is 18, 19 and 18 routes out of 25
respectively. Mean band height 278px, mean 10.2% of the fold. The breadcrumb + `<h1>` + subtitle occupy only
the left ~450px; the rest of a 168–232px band is void, and the sub-nav rail sits *below* it.

Measured (corrected ink rasteriser; `% of fold` = share of the area between y=56 and the viewport bottom):

| route | 1600×1000 | 1440×900 | 1280×800 |
|---|---|---|---|
| `/trace/scanner` | 1144×168 @(456,56) — 12.7% | 992×168 @(448,56) — 13.7% | 832×168 @(448,56) — **14.7%** |
| `/trace/dark-pool` | 1136×168 @(464,56) — 12.6% | 984×168 @(456,56) — 13.6% | 824×168 @(456,56) — **14.5%** |
| `/pinpoint/history` | 1120×168 @(480,56) — 12.5% | 968×168 @(472,56) — 13.4% | 808×168 @(472,56) — 14.3% |
| `/trace/live-tape` | 1112×168 @(488,56) — 12.4% | 960×168 @(480,56) — 13.3% | 800×168 @(480,56) — 14.1% |
| `/terminal` | 1040×168 @(384,56) — 11.6% | 896×168 @(376,56) — 12.4% | 736×168 @(376,56) — 13.0% |
| `/pinpoint/stress` | 888×216 @(712,56) — 12.7% | 736×216 @(704,56) — 13.1% | 576×216 @(704,56) — 13.1% |
| `/pinpoint/gamma` | 776×232 @(824,56) — 11.9% | 624×232 @(816,56) — 11.9% | — |

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

### F-11 · P3 · Gate 17 — `/community/ideas` thesis form: first row uses 36% of the width, the next row uses 100%

The form's first row (`TICKER` / `DIRECTION` / `HORIZON`) stops well short of the container while the row
directly beneath it (`ENTRY / INVALIDATION / TARGETS / RISK`) spans the full content width, so the panel
reads as unfinished.

Measured on the row element directly (right edge of last child vs right edge of the row):

| viewport | row width | content ends at | unused | unused share |
|---|---|---|---|---|
| 1600×1000 | 1492px | x=593 | **948px** | **63.5%** |
| 1440×900 | 1348px | x=585 | 804px | 59.6% |
| 1280×800 | 1188px | x=585 | 644px | 54.2% |

Evidence: `docs/audit64/shots/DEAD2_community_ideas_1600x1000.png` — the `TICKER`/`DIRECTION`/`HORIZON`
controls end at x≈593 while `ENTRY … RISK` below run to x=1541.

**Correction to my own first pass:** I initially reported this as a "1000 × 336px void at (600,56), 22.2%
of the fold." That figure was produced by a rasteriser bug (see §3) — the region it named actually contains
the `LOCAL TO THIS BROWSER` banner and the `WRITE A THESIS` header. The corrected largest empty rect on this
route at 1600×1000 is 552 × 384 @ (928,608) = 14.0%, which is the right-hand side of the legitimate
`NO THESES YET` empty state and is **not** a defect. The row-raggedness above is measured directly and stands.

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

| route | viewport | h-ovf (main) | content H | first data Y | clipped | max empty rect | fold ink | label ovl | tap<44 both |
|---|---|---|---|---|---|---|---|---|---|
| `/` | 1600x1000 | 0 | 9262 | 5 | 1 | 480x8 (0.3%) | 99.2% | - | - |
| `/` | 1440x900 | 0 | 9188 | 0 | 1 | 168x8 (0.1%) | 99.2% | 1 | - |
| `/` | 1280x800 | 0 | 9094 | 2 | 1 | 312x8 (0.3%) | 99.1% | - | - |
| `/` | 1024x768 | 0 | 9102 | 0 | 3 | 344x8 (0.4%) | 98.8% | 0 | - |
| `/` | 768x1024 | 0 | 10757 | 4 | 4 | 296x8 (0.3%) | 99.2% | 0 | - |
| `/` | 430x932 | 0 | 12992 | 7 | 0 | 168x8 (0.4%) | 99.3% | - | 14 |
| `/` | 390x844 | 0 | 13157 | 23 | 0 | 72x8 (0.2%) | 99.8% | 18 | 14 |
| `/` | 360x800 | 0 | 13416 | 4 | 1 | 64x8 (0.2%) | 99.8% | 2 | 14 |
| `/terminal` | 1600x1000 | 0 | 1216 | 1181 | 0 | 1040x168 (11.6%) | 24.3% | - | - |
| `/terminal` | 1440x900 | 0 | 1216 | 1181 | 0 | 896x168 (12.4%) | 27.5% | 0 | - |
| `/terminal` | 1280x800 | 0 | 1216 | 1181 | 2 | 736x168 (13%) | 30.8% | - | - |
| `/terminal` | 1024x768 | 0 | 1614 | 1579 | 0 | 456x200 (12.5%) | 31.6% | 0 | - |
| `/terminal` | 768x1024 | 0 | 1734 | 1699 | 0 | 400x104 (5.6%) | 54.1% | 0 | - |
| `/terminal` | 430x932 | 0 | 2268 | 2210 | 0 | 24x880 (5.6%) | 58.4% | - | 25 |
| `/terminal` | 390x844 | 0 | 2334 | 2276 | 0 | 24x792 (6.2%) | 58% | 0 | 25 |
| `/terminal` | 360x800 | 0 | 2419 | 2346 | 0 | 24x744 (6.7%) | 60.6% | 0 | 25 |
| `/pulse` | 1600x1000 | 0 | 2841 | 136 | 0 | 1144x72 (5.5%) | 62.1% | - | - |
| `/pulse` | 1440x900 | 0 | 2841 | 136 | 0 | 1000x72 (5.9%) | 68.6% | 0 | - |
| `/pulse` | 1280x800 | 0 | 2841 | 136 | 0 | 840x72 (6.4%) | 68.9% | - | - |
| `/pulse` | 1024x768 | 0 | 2864 | 136 | 4 | 552x80 (6.1%) | 67.3% | 0 | - |
| `/pulse` | 768x1024 | 0 | 3800 | 136 | 0 | 328x120 (5.3%) | 68.2% | 0 | - |
| `/pulse` | 430x932 | 0 | 3884 | 591 | 0 | 80x280 (5.9%) | 62.5% | - | 68 |
| `/pulse` | 390x844 | 0 | 3884 | 591 | 0 | 80x256 (6.7%) | 59.6% | 0 | 68 |
| `/pulse` | 360x800 | 0 | 3899 | 591 | 0 | 24x720 (6.5%) | 59% | 0 | 68 |
| `/compass` | 1600x1000 | 0 | 2539 | 185 | 0 | 744x168 (8.3%) | 36.6% | - | - |
| `/compass` | 1440x900 | 0 | 2871 | 185 | 0 | 600x168 (8.3%) | 35.9% | 0 | - |
| `/compass` | 1280x800 | 0 | 3163 | 185 | 0 | 440x168 (7.8%) | 39.1% | - | - |
| `/compass` | 1024x768 | 0 | 2505 | 185 | 0 | 424x96 (5.6%) | 39.9% | 0 | - |
| `/compass` | 768x1024 | 0 | 3163 | 185 | 0 | 632x56 (4.8%) | 43.2% | 0 | - |
| `/compass` | 430x932 | 0 | 6154 | 247 | 1 | 48x568 (7.2%) | 44.3% | - | 9 |
| `/compass` | 390x844 | 0 | 6040 | 247 | 2 | 48x496 (7.7%) | 46.6% | 0 | 9 |
| `/compass` | 360x800 | 0 | 6117 | 293 | 1 | 48x448 (8%) | 48.8% | 0 | 9 |
| `/compass?sleeve=weekly` | 1600x1000 | 0 | 2505 | 185 | 0 | 744x168 (8.3%) | 36.8% | - | - |
| `/compass?sleeve=weekly` | 1440x900 | 0 | 2871 | 185 | 0 | 600x168 (8.3%) | 35.8% | 0 | - |
| `/compass?sleeve=weekly` | 1280x800 | 0 | 3136 | 185 | 0 | 440x168 (7.8%) | 39% | - | - |
| `/compass?sleeve=weekly` | 1024x768 | 0 | 2505 | 185 | 0 | 424x96 (5.6%) | 39.9% | 0 | - |
| `/compass?sleeve=weekly` | 768x1024 | 0 | 3057 | 185 | 0 | 632x56 (4.8%) | 43.3% | 0 | - |
| `/compass?sleeve=weekly` | 430x932 | 0 | 6022 | 247 | 1 | 48x568 (7.2%) | 44.3% | - | 9 |
| `/compass?sleeve=weekly` | 390x844 | 0 | 6066 | 247 | 2 | 48x496 (7.7%) | 46.4% | 0 | 9 |
| `/compass?sleeve=weekly` | 360x800 | 0 | 6064 | 293 | 1 | 48x448 (8%) | 48.8% | 0 | 9 |
| `/compass?sleeve=structures` | 1600x1000 | 0 | 1415 | 185 | 0 | 744x216 (10.6%) | 44.8% | - | - |
| `/compass?sleeve=structures` | 1440x900 | 0 | 1443 | 185 | 0 | 600x216 (10.7%) | 42.5% | 0 | - |
| `/compass?sleeve=structures` | 1280x800 | 0 | 1498 | 185 | 0 | 440x216 (10%) | 47.4% | - | - |
| `/compass?sleeve=structures` | 1024x768 | 0 | 1565 | 185 | 0 | 272x184 (6.9%) | 48.9% | 0 | - |
| `/compass?sleeve=structures` | 768x1024 | 0 | 2514 | 185 | 0 | 32x968 (4.2%) | 51.9% | 0 | - |
| `/compass?sleeve=structures` | 430x932 | 0 | 2880 | 247 | 0 | 40x672 (7.1%) | 54.2% | - | 5 |
| `/compass?sleeve=structures` | 390x844 | 0 | 3008 | 247 | 0 | 40x584 (7.6%) | 55.9% | 0 | 5 |
| `/compass?sleeve=structures` | 360x800 | 0 | 3094 | 341 | 0 | 32x536 (6.4%) | 56.8% | 0 | 5 |
| `/compass?view=weigher` | 1600x1000 | 0 | 1931 | 307 | 0 | 232x872 (13.4%) | 34.7% | - | - |
| `/compass?view=weigher` | 1440x900 | 0 | 1931 | 307 | 0 | 152x776 (9.7%) | 39.2% | 17 | - |
| `/compass?view=weigher` | 1280x800 | 0 | 1931 | 307 | 0 | 608x128 (8.2%) | 44.3% | - | - |
| `/compass?view=weigher` | 1024x768 | 0 | 2564 | 307 | 0 | 352x128 (6.2%) | 47.3% | 0 | - |
| `/compass?view=weigher` | 768x1024 | 0 | 2664 | 353 | 0 | 40x968 (5.2%) | 55.8% | 17 | - |
| `/compass?view=weigher` | 430x932 | 0 | 2755 | 396 | 0 | 40x664 (7.1%) | 59.4% | - | 6 |
| `/compass?view=weigher` | 390x844 | 0 | 2845 | 396 | 0 | 40x576 (7.5%) | 58.9% | 0 | 6 |
| `/compass?view=weigher` | 360x800 | 0 | 3042 | 412 | 0 | 40x512 (7.6%) | 59.2% | 0 | 6 |
| `/compass?view=lotto` | 1600x1000 | 0 | 1970 | 196 | 0 | 1200x80 (6.4%) | 38.1% | - | - |
| `/compass?view=lotto` | 1440x900 | 0 | 1989 | 196 | 0 | 1048x80 (6.9%) | 37.8% | 0 | - |
| `/compass?view=lotto` | 1280x800 | 0 | 2039 | 196 | 0 | 888x80 (7.5%) | 40.7% | - | - |
| `/compass?view=lotto` | 1024x768 | 0 | 2080 | 196 | 0 | 632x80 (6.9%) | 45.1% | 0 | - |
| `/compass?view=lotto` | 768x1024 | 0 | 2410 | 242 | 0 | 520x72 (5%) | 42.8% | 0 | - |
| `/compass?view=lotto` | 430x932 | 0 | 3416 | 280 | 0 | 24x768 (4.9%) | 49.1% | - | 5 |
| `/compass?view=lotto` | 390x844 | 0 | 3918 | 280 | 0 | 24x680 (5.3%) | 49% | 0 | 5 |
| `/compass?view=lotto` | 360x800 | 0 | 4579 | 296 | 1 | 40x400 (6%) | 50.6% | 0 | 5 |
| `/trace/live-tape` | 1600x1000 | 0 | 18455 | 250 | 0 | 1112x168 (12.4%) | 53.3% | - | - |
| `/trace/live-tape` | 1440x900 | 0 | 18455 | 250 | 0 | 960x168 (13.3%) | 52.6% | 0 | - |
| `/trace/live-tape` | 1280x800 | 0 | 18455 | 250 | 0 | 800x168 (14.1%) | 49.5% | - | - |
| `/trace/live-tape` | 1024x768 | 0 | 18455 | 250 | 0 | 544x168 (12.5%) | 47.8% | 0 | - |
| `/trace/live-tape` | 768x1024 | 0 | 18455 | 250 | 0 | 296x168 (6.7%) | 55.4% | 0 | - |
| `/trace/live-tape` | 430x932 | 0 | 18455 | 266 | 0 | 40x560 (5.9%) | 47.1% | - | 32 |
| `/trace/live-tape` | 390x844 | 0 | 18455 | 266 | 0 | 40x560 (7.3%) | 46.7% | 0 | 32 |
| `/trace/live-tape` | 360x800 | 0 | 18455 | 266 | 2 | 40x528 (7.9%) | 45.4% | 0 | 32 |
| `/trace/scanner` | 1600x1000 | 0 | 2192 | 250 | 0 | 1144x168 (12.7%) | 26.9% | - | - |
| `/trace/scanner` | 1440x900 | 0 | 2192 | 250 | 0 | 992x168 (13.7%) | 28% | 0 | - |
| `/trace/scanner` | 1280x800 | 0 | 2192 | 250 | 0 | 832x168 (14.7%) | 29.9% | - | - |
| `/trace/scanner` | 1024x768 | 0 | 2192 | 250 | 1 | 576x168 (13.3%) | 31.8% | 0 | - |
| `/trace/scanner` | 768x1024 | 0 | 2192 | 250 | 1 | 328x168 (7.4%) | 40% | 0 | - |
| `/trace/scanner` | 430x932 | 0 | 2192 | 266 | 1 | 40x432 (4.6%) | 47.3% | - | 8 |
| `/trace/scanner` | 390x844 | 0 | 2192 | 266 | 1 | 40x440 (5.7%) | 46.2% | 0 | 8 |
| `/trace/scanner` | 360x800 | 0 | 2192 | 266 | 2 | 40x352 (5.3%) | 47.1% | 0 | 8 |
| `/trace/reconstruction` | 1600x1000 | 0 | 2325 | 250 | 0 | 1088x168 (12.1%) | 31.1% | - | - |
| `/trace/reconstruction` | 1440x900 | 0 | 2385 | 250 | 0 | 936x168 (12.9%) | 37% | 1 | - |
| `/trace/reconstruction` | 1280x800 | 0 | 2363 | 250 | 0 | 776x168 (13.7%) | 40% | - | - |
| `/trace/reconstruction` | 1024x768 | 0 | 2395 | 250 | 1 | 520x168 (12%) | 39.4% | 0 | - |
| `/trace/reconstruction` | 768x1024 | 0 | 2803 | 250 | 2 | 272x168 (6.1%) | 49.2% | 1 | - |
| `/trace/reconstruction` | 430x932 | 0 | 3906 | 362 | 1 | 40x720 (7.6%) | 51.9% | - | 5 |
| `/trace/reconstruction` | 390x844 | 0 | 4125 | 362 | 2 | 40x632 (8.2%) | 50.7% | 1 | 5 |
| `/trace/reconstruction` | 360x800 | 0 | 4437 | 362 | 3 | 40x584 (8.7%) | 51.9% | 1 | 5 |
| `/trace/dark-pool` | 1600x1000 | 0 | 9424 | 250 | 1 | 1136x168 (12.6%) | 32.1% | - | - |
| `/trace/dark-pool` | 1440x900 | 0 | 9424 | 250 | 2 | 984x168 (13.6%) | 33.9% | 0 | - |
| `/trace/dark-pool` | 1280x800 | 0 | 9424 | 250 | 4 | 824x168 (14.5%) | 35.9% | - | - |
| `/trace/dark-pool` | 1024x768 | 0 | 9424 | 250 | 4 | 568x168 (13.1%) | 39.8% | 0 | - |
| `/trace/dark-pool` | 768x1024 | 0 | 9424 | 250 | 5 | 320x168 (7.2%) | 39% | 0 | - |
| `/trace/dark-pool` | 430x932 | 0 | 11358 | 266 | 4 | 328x72 (6.3%) | 48.8% | - | 6 |
| `/trace/dark-pool` | 390x844 | **+17px** | 11521 | 266 | 5 | 288x72 (6.7%) | 45.5% | 0 | 6 |
| `/trace/dark-pool` | 360x800 | **+47px** | 11581 | 266 | 7 | 256x72 (6.9%) | 43.4% | 0 | 6 |
| `/pinpoint/gamma` | 1600x1000 | 0 | 1000 | 289 | 0 | 776x232 (11.9%) | 60.4% | - | - |
| `/pinpoint/gamma` | 1440x900 | 0 | 900 | 289 | 0 | 624x232 (11.9%) | 59.4% | 0 | - |
| `/pinpoint/gamma` | 1280x800 | 0 | 800 | 289 | 0 | 816x136 (11.7%) | 55.9% | - | - |
| `/pinpoint/gamma` | 1024x768 | 0 | 768 | 289 | 0 | 560x136 (10.4%) | 55.5% | 0 | - |
| `/pinpoint/gamma` | 768x1024 | 0 | 1167 | 305 | 2 | 448x152 (9.2%) | 60.1% | 0 | - |
| `/pinpoint/gamma` | 430x932 | 0 | 1283 | 321 | 1 | 112x248 (7.4%) | 60.1% | - | 8 |
| `/pinpoint/gamma` | 390x844 | 0 | 1215 | 321 | 0 | 72x248 (5.8%) | 58.9% | 0 | 8 |
| `/pinpoint/gamma` | 360x800 | **+10px** | 1205 | 321 | 0 | 80x200 (6%) | 59% | 0 | 8 |
| `/pinpoint/levels` | 1600x1000 | 0 | 2111 | 129 | 0 | 840x208 (11.6%) | 53% | - | - |
| `/pinpoint/levels` | 1440x900 | 0 | 2051 | 129 | 0 | 688x208 (11.8%) | 50.9% | 0 | - |
| `/pinpoint/levels` | 1280x800 | 0 | 2051 | 129 | 0 | 528x208 (11.5%) | 48.6% | - | - |
| `/pinpoint/levels` | 1024x768 | 0 | 2529 | 129 | 0 | 560x112 (8.6%) | 47.9% | 0 | - |
| `/pinpoint/levels` | 768x1024 | 0 | 2621 | 129 | 2 | 536x72 (5.2%) | 56.6% | 0 | - |
| `/pinpoint/levels` | 430x932 | **+6px** | 2837 | 129 | 1 | 224x72 (4.3%) | 53.5% | - | 21 |
| `/pinpoint/levels` | 390x844 | **+46px** | 2850 | 129 | 1 | 184x72 (4.3%) | 51.6% | 3 | 21 |
| `/pinpoint/levels` | 360x800 | **+76px** | 2882 | 129 | 1 | 16x744 (4.4%) | 52% | 3 | 21 |
| `/pinpoint/greeks` | 1600x1000 | 0 | 1793 | 274 | 0 | 824x216 (11.8%) | 21.5% | - | - |
| `/pinpoint/greeks` | 1440x900 | 0 | 1793 | 274 | 0 | 672x216 (11.9%) | 24.1% | 0 | - |
| `/pinpoint/greeks` | 1280x800 | 0 | 1793 | 274 | 0 | 512x216 (11.6%) | 25.9% | - | - |
| `/pinpoint/greeks` | 1024x768 | 0 | 2166 | 274 | 2 | 560x120 (9.2%) | 30.1% | 0 | - |
| `/pinpoint/greeks` | 768x1024 | 0 | 2296 | 290 | 3 | 96x464 (6%) | 39.7% | 0 | - |
| `/pinpoint/greeks` | 430x932 | 0 | 2552 | 312 | 0 | 40x512 (5.4%) | 48.8% | - | 6 |
| `/pinpoint/greeks` | 390x844 | 0 | 2613 | 328 | 1 | 40x544 (7.1%) | 47.2% | 0 | 6 |
| `/pinpoint/greeks` | 360x800 | 0 | 2628 | 328 | 1 | 40x512 (7.6%) | 47.7% | 0 | 6 |
| `/pinpoint/stress` | 1600x1000 | 0 | 1095 | 274 | 0 | 888x216 (12.7%) | 36.5% | - | - |
| `/pinpoint/stress` | 1440x900 | 0 | 1115 | 274 | 0 | 736x216 (13.1%) | 37.1% | 0 | - |
| `/pinpoint/stress` | 1280x800 | 0 | 1156 | 274 | 2 | 576x216 (13.1%) | 37.6% | - | - |
| `/pinpoint/stress` | 1024x768 | 0 | 1471 | 274 | 0 | 320x216 (9.5%) | 32.7% | 0 | - |
| `/pinpoint/stress` | 768x1024 | 0 | 1621 | 296 | 0 | 536x72 (5.2%) | 42.6% | 0 | - |
| `/pinpoint/stress` | 430x932 | 0 | 2019 | 312 | 0 | 40x768 (8.2%) | 48.6% | - | 5 |
| `/pinpoint/stress` | 390x844 | 0 | 2079 | 312 | 0 | 40x680 (8.9%) | 51.1% | 0 | 5 |
| `/pinpoint/stress` | 360x800 | **+29px** | 2246 | 328 | 1 | 40x616 (9.2%) | 50.8% | 0 | 5 |
| `/pinpoint/history` | 1600x1000 | 0 | 1518 | 250 | 0 | 1120x168 (12.5%) | 37% | - | - |
| `/pinpoint/history` | 1440x900 | 0 | 1518 | 250 | 0 | 968x168 (13.4%) | 39.1% | 1 | - |
| `/pinpoint/history` | 1280x800 | 0 | 1518 | 250 | 0 | 808x168 (14.3%) | 35.7% | - | - |
| `/pinpoint/history` | 1024x768 | 0 | 1518 | 250 | 1 | 552x168 (12.7%) | 36.8% | 0 | - |
| `/pinpoint/history` | 768x1024 | 0 | 1518 | 250 | 3 | 304x168 (6.9%) | 50.5% | 1 | - |
| `/pinpoint/history` | 430x932 | 0 | 1518 | 250 | 0 | 40x736 (7.8%) | 44.3% | - | 16 |
| `/pinpoint/history` | 390x844 | 0 | 2133 | 250 | 1 | 40x648 (8.4%) | 47.8% | 0 | 16 |
| `/pinpoint/history` | 360x800 | 0 | 2164 | 266 | 3 | 40x584 (8.7%) | 47.9% | 0 | 16 |
| `/prove-it` | 1600x1000 | 0 | 2587 | 220 | 1 | 832x264 (14.5%) | 42.1% | - | - |
| `/prove-it` | 1440x900 | 0 | 2640 | 220 | 2 | 632x192 (10%) | 44.9% | 0 | - |
| `/prove-it` | 1280x800 | 0 | 2671 | 220 | 2 | 520x160 (8.7%) | 48.5% | - | - |
| `/prove-it` | 1024x768 | 0 | 4046 | 220 | 2 | 592x80 (6.5%) | 55.8% | 0 | - |
| `/prove-it` | 768x1024 | 0 | 4253 | 220 | 6 | 608x88 (7.2%) | 49.7% | 0 | - |
| `/prove-it` | 430x932 | 0 | 5376 | 304 | 3 | 40x768 (8.2%) | 54.2% | - | 7 |
| `/prove-it` | 390x844 | 0 | 5497 | 304 | 7 | 40x600 (7.8%) | 54% | 0 | 7 |
| `/prove-it` | 360x800 | 0 | 5770 | 304 | 7 | 40x552 (8.2%) | 51.8% | 0 | 7 |
| `/stocks` | 1600x1000 | 0 | 18660 | 196 | 0 | 816x112 (6.1%) | 25.6% | - | - |
| `/stocks` | 1440x900 | 0 | 18660 | 196 | 0 | 1080x72 (6.4%) | 27.1% | 1 | - |
| `/stocks` | 1280x800 | 0 | 18660 | 196 | 0 | 920x72 (7%) | 29.2% | - | - |
| `/stocks` | 1024x768 | 0 | 18660 | 196 | 1 | 512x136 (9.6%) | 25.9% | 1 | - |
| `/stocks` | 768x1024 | 0 | 18660 | 196 | 3 | 384x136 (7%) | 32.1% | 1 | - |
| `/stocks` | 430x932 | 0 | 18660 | 280 | 1 | 40x768 (8.2%) | 32.6% | - | 208 |
| `/stocks` | 390x844 | 0 | 18660 | 280 | 2 | 40x680 (8.9%) | 33.8% | 4 | 208 |
| `/stocks` | 360x800 | 0 | 18660 | 280 | 4 | 40x632 (9.4%) | 36.2% | 5 | 208 |
| `/news` | 1600x1000 | 0 | 1634 | 196 | 0 | 1032x104 (7.1%) | 43.9% | - | - |
| `/news` | 1440x900 | 0 | 1634 | 196 | 0 | 888x104 (7.6%) | 43.8% | 0 | - |
| `/news` | 1280x800 | 0 | 1634 | 196 | 3 | 728x104 (8%) | 42.6% | - | - |
| `/news` | 1024x768 | 0 | 2011 | 196 | 7 | 472x104 (6.7%) | 44% | 0 | - |
| `/news` | 768x1024 | 0 | 2380 | 242 | 1 | 632x72 (6.1%) | 45.6% | 0 | - |
| `/news` | 430x932 | 0 | 2654 | 357 | 2 | 40x768 (8.2%) | 47.6% | - | 49 |
| `/news` | 390x844 | 0 | 3099 | 357 | 5 | 40x680 (8.9%) | 46.8% | 0 | 49 |
| `/news` | 360x800 | **+11px** | 3310 | 357 | 7 | 40x600 (9%) | 47.7% | 0 | 49 |
| `/earnings` | 1600x1000 | 0 | 2050 | 196 | 0 | 848x152 (8.5%) | 28.3% | - | - |
| `/earnings` | 1440x900 | 0 | 1990 | 196 | 0 | 704x152 (8.8%) | 29.9% | 0 | - |
| `/earnings` | 1280x800 | 0 | 1990 | 196 | 0 | 544x152 (8.7%) | 30.2% | - | - |
| `/earnings` | 1024x768 | 0 | 2069 | 242 | 3 | 464x144 (9.2%) | 29.4% | 0 | - |
| `/earnings` | 768x1024 | 0 | 2256 | 258 | 2 | 456x144 (8.8%) | 37.4% | 0 | - |
| `/earnings` | 430x932 | 0 | 2754 | 370 | 2 | 432x136 (15.6%) | 39.3% | - | 29 |
| `/earnings` | 390x844 | **+5px** | 2781 | 370 | 2 | 336x80 (8.7%) | 43.5% | 0 | 29 |
| `/earnings` | 360x800 | **+35px** | 2830 | 370 | 5 | 304x80 (9.1%) | 43.1% | 0 | 29 |
| `/tracker` | 1600x1000 | 0 | 2385 | 697 | 0 | 848x184 (10.3%) | 36.3% | - | - |
| `/tracker` | 1440x900 | 0 | 2385 | 697 | 0 | 696x184 (10.5%) | 36.8% | 0 | - |
| `/tracker` | 1280x800 | 0 | 2385 | 697 | 0 | 1200x88 (11.1%) | 36.5% | - | - |
| `/tracker` | 1024x768 | 0 | 2875 | 858 | 2 | 944x88 (11.4%) | 36.3% | 0 | - |
| `/tracker` | 768x1024 | 0 | 3204 | 978 | 1 | 488x168 (11%) | 38.4% | 0 | - |
| `/tracker` | 430x932 | 0 | 4376 | 1431 | 1 | 376x104 (10.4%) | 42.9% | - | 17 |
| `/tracker` | 390x844 | 0 | 4528 | 1520 | 2 | 272x120 (10.6%) | 42.7% | 0 | 17 |
| `/tracker` | 360x800 | 0 | 4628 | 1541 | 4 | 304x104 (11.8%) | 46.9% | 0 | 17 |
| `/guide/overview` | 1600x1000 | 0 | 1484 | 1449 | 0 | 288x944 (18%) | 28.4% | - | - |
| `/guide/overview` | 1440x900 | 0 | 1484 | 1449 | 0 | 208x848 (14.5%) | 31.3% | 0 | - |
| `/guide/overview` | 1280x800 | 0 | 1484 | 1449 | 0 | 128x744 (10%) | 36.9% | - | - |
| `/guide/overview` | 1024x768 | 0 | 1620 | 1585 | 0 | 688x104 (9.8%) | 36.3% | 0 | - |
| `/guide/overview` | 768x1024 | 0 | 1682 | 1647 | 0 | 440x104 (6.2%) | 51.4% | 0 | - |
| `/guide/overview` | 430x932 | 0 | 2581 | 2523 | 0 | 328x64 (5.6%) | 49.7% | - | 16 |
| `/guide/overview` | 390x844 | 0 | 2646 | 2588 | 0 | 392x48 (6.1%) | 53.5% | 0 | 16 |
| `/guide/overview` | 360x800 | 0 | 2745 | 2672 | 0 | 256x64 (6.1%) | 57.3% | 0 | 16 |
| `/community/ideas` | 1600x1000 | 0 | 1701 | 998 | 0 | 552x384 (14%) | 28.3% | - | - |
| `/community/ideas` | 1440x900 | 0 | 1701 | 998 | 0 | 1000x160 (13.2%) | 31.1% | 0 | - |
| `/community/ideas` | 1280x800 | 0 | 1734 | 1016 | 0 | 840x160 (14.1%) | 36% | - | - |
| `/community/ideas` | 1024x768 | 0 | 1779 | 1016 | 0 | 584x160 (12.8%) | 39.7% | 0 | - |
| `/community/ideas` | 768x1024 | 0 | 1799 | 1016 | 0 | 256x232 (8%) | 36.6% | 0 | - |
| `/community/ideas` | 430x932 | 0 | 2707 | 1300 | 0 | 40x768 (8.2%) | 52.7% | - | 18 |
| `/community/ideas` | 390x844 | 0 | 2740 | 1314 | 0 | 40x680 (8.9%) | 56.3% | 0 | 18 |
| `/community/ideas` | 360x800 | 0 | 2871 | 1411 | 0 | 176x200 (13.1%) | 52.3% | 0 | 18 |
| `/legal/disclaimer` | 1600x1000 | 0 | 1569 | 1534 | 0 | 368x944 (23%) | 41.3% | - | - |
| `/legal/disclaimer` | 1440x900 | 0 | 1569 | 1534 | 0 | 288x848 (20.1%) | 46% | 0 | - |
| `/legal/disclaimer` | 1280x800 | 0 | 1569 | 1534 | 0 | 208x744 (16.3%) | 51.1% | - | - |
| `/legal/disclaimer` | 1024x768 | 0 | 1590 | 1555 | 0 | 256x488 (17.1%) | 61.9% | 0 | - |
| `/legal/disclaimer` | 768x1024 | 0 | 1590 | 1555 | 0 | 632x56 (4.8%) | 75.6% | 0 | - |
| `/legal/disclaimer` | 430x932 | 0 | 2318 | 2260 | 0 | 24x880 (5.6%) | 75.8% | - | 14 |
| `/legal/disclaimer` | 390x844 | 0 | 2404 | 2346 | 0 | 24x792 (6.2%) | 75.3% | 0 | 14 |
| `/legal/disclaimer` | 360x800 | 0 | 2543 | 2470 | 0 | 24x744 (6.7%) | 75.6% | 0 | 14 |

