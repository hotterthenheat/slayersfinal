# Open decisions

Seven things this pass found, measured, and then stopped at — because
finishing them is your call, not mine. Each one names the file, the number
that was measured, the options, and what I would do.

Nothing here is a bug report you need to triage. They are already
triaged: everything I could fix under "this is strictly UI for now" is
fixed and pushed. What is left is either (a) outside that line, or (b) a
choice with two defensible answers.

Status as of 2026-08-25.

---

## 1. The tape's bid/ask reconstruction is inverted — 98.7% of fills print outside their own quote

**Where:** `src/data/tape.ts:55`
**Scope:** generator math. Out of bounds under "strictly UI for now."

Every print on the Trace tape carries a fill, a bid and an ask. A fill
should sit inside its own bid/ask band. Measured across the whole
recording:

```
prints 1013   inside 13   below bid 491   above ask 509   outside 1000 (98.7%)
```

Both branches are out by half a spread, in opposite directions:

```ts
const fillPos = order.side === 'ASK' ? 0.72 + h('pos') * 0.28 : h('pos') * 0.28;
const mid = order.side === 'ASK' ? fill - spreadW * fillPos : fill + spreadW * (1 - fillPos);
```

- ASK branch: `ask = fill + spreadW·(0.5 − fillPos)`, and `fillPos ≥ 0.72`, so the ask lands *below* the fill.
- BID branch: `bid = fill + spreadW·(0.5 − fillPos)`, and `fillPos ≤ 0.28`, so the bid lands *above* the fill.

**The fix is one line**, and I verified it takes 1000 → 0 without touching
anything else:

```ts
const mid = fill + spreadW * (0.5 - fillPos);
```

That reads as "the fill sits at `fillPos` through the spread", which is
what the variable is named for and what the comment above it already
says. An aggressive buy still lifts near the ask, an aggressive sell
still hits near the bid.

**Recommendation:** apply it. It is the highest-impact single line in the
tree — a trader who reads one row of that tape and checks the arithmetic
finds it immediately. I did not apply it because you drew the line at
generator math and I am not going to redraw it for you.

---

## 2. Delete the engines · 3. Repoint every data module at the seam

**Where:** `src/core/feed.ts` is the seam. 26 files read through it.
**Scope:** backend. Out of bounds under "strictly UI for now."

The seam is built and the recording plays through it. Four research desks
still build their own numbers from a hash seed and would not change if
the body of `feed.ts` were replaced tomorrow:

| module                  | desk                     | entry point               |
| ----------------------- | ------------------------ | ------------------------- |
| `src/data/stocks.ts`    | Stocks                   | `buildStockBoard()`       |
| `src/data/earnings.ts`  | Earnings hub + dossier   | `buildEarningsCalendar()` |
| `src/data/news.ts`      | News                     | `buildNewsFeed()`         |
| `src/data/contractflow.ts` | Trace's drilldown     | `buildContractFlow()`     |

None of them takes a snapshot argument, which is the tell.

`src/data/moc.ts` seeds from the same hash and has **zero** consumers —
`buildMocRead`, `readSessionClock` and `fmtImbalance` are referenced
nowhere outside their own file. An orphan kept for revival, not a desk.

The landing FAQ now names those four rather than claiming the whole
terminal is on the seam, and `scripts/sales-proof.ts` derives that list
from the imports so it cannot drift quietly in either direction.

**Recommendation:** these are the same job in two halves and want to be
done together, with the real feeds in hand. Not urgent while the copy is
honest about it.

---

## 4. The walls: CW-green / PW-red, or steel / gold?

**Where:** `src/components/gex/palette.ts:20`, `docs/dealer-ink-pass.md`
**Scope:** yours. Two documents in this repo disagree.

```ts
export const CALL_WALL = BULL;   // green, not mint — reversed by Noah 2026-08-18
export const PUT_WALL = '#FF3B30'; // bear (hot red)
```

`docs/dealer-ink-pass.md` recommends migrating the walls to the house
steel/gold dealer inks and calls it the most visible change on the
product. `palette.ts` records you reversing exactly that on 2026-08-18.

Both are defensible:

- **Green/red** reads instantly to anyone who has ever looked at a chart. Call wall = ceiling = green, put wall = floor = red.
- **Steel/gold** is the dealer-ink language the rest of the surface already speaks — gold = put side, amplifies; steel = call side, absorbs. Green/red on the same canvas belongs to the *candles*, so the walls borrowing them makes two different things the same colour.

**Recommendation:** keep green/red. The second argument is the better
design argument and the first is the better product argument, and this is
a product people have to read in a hurry. But it is genuinely close, and
your 2026-08-18 note already picked — so this entry exists mainly to stop
the doc and the palette contradicting each other. Tell me which one is
wrong and I will delete the other.

---

## 5. Re-scope Earnings against what the entitlements can source

**Where:** `src/pages/EarningsHub.tsx:219,226`, `src/data/earnings.ts`
**Scope:** partly UI (drop a column), partly math (the PRICED column).

Two columns have no source in any entitlement you hold:

- **BEAT RATE** — historical EPS surprise. Not in Options Advanced, Stocks Advanced, Futures Advanced, Currencies Starter or API Advanced.
- **REVISIONS** — analyst estimate revisions. Same.

A third is circular. `richness` is drawn from a hash, then
`impliedMovePct = histAvgMovePct × richness`, so the PRICED column —
implied ÷ realized — returns `richness` to itself. It is not a
measurement of anything; it is the input printed back out. (Two doc
comments in that file described it backwards; those are corrected.)

**Recommendation:** drop BEAT RATE and REVISIONS from the table and the
dossier. They are the two columns a customer would check first against a
free source, and they cannot be made real with the data you have. The
PRICED column can stay if the arithmetic stops being circular — that is
generator math, so it waits with #1.

---

## 6. Does the Pulse desk support phones?

**Where:** `src/pages/workspace/Pulse.tsx:583`
**Scope:** yours — it is a product decision with a migration attached.

`react-grid-layout` runs with `cols={12}` at every width. Measured on the
default desk:

```
390px  (phone)    4 widgets at 173 x 488 each
768px  (tablet)   4 widgets at 362 x 488 each
1440px (laptop)   4 widgets at 690 x 488 each
```

A live candle chart in 173px is not a small chart, it is not a chart.

Three ways out:

1. **Responsive breakpoints.** `ResponsiveGridLayout` with per-breakpoint layouts. Correct, and it needs a migration for every saved desk in `slayer_desks_v1` — those hold one layout array, not a map.
2. **Stack below a threshold.** Under `md`, ignore the grid and render the widgets full-width in order. Cheap, no migration, and drag/resize simply do not exist on a phone — which is arguably true anyway.
3. **Say no.** Route `/pulse` to a "this desk wants a bigger screen" panel under `md`, with a link to the pages that do work small.

**Recommendation:** (2). It is a day of work, it needs no migration, and a
phone user gets a readable column instead of four unusable slivers.
Drag-to-arrange was never a phone gesture.

---

## 7. Two take-profit prices on Campaign Analysis

**Where:** `src/components/compass/CampaignAnalysis.tsx:407` (chart) vs `:653` (ladder)
**Scope:** math. Out of bounds under "strictly UI for now."

The chart draws `setup.priceTargets[i]`. The premium ladder inverts a
premium back to a spot with `spotForPremium(...)`. They disagree, and the
gap widens per rung — measured on MSFT 430C:

```
        chart     ladder
TP1     431.18    430.55
```

The obvious repair — point the chart at the ladder's number — reintroduces
the receding-target bug that the freeze at line 486 exists to prevent.
That comment records you catching it: *"same side magnets"*, spot +0.29
toward TP1 while TP1 fled +0.41. A campaign whose milestones move is
unhittable by construction.

**Recommendation:** freeze the ladder against the same entry anchor the
chart already uses, rather than unfreezing the chart. One anchor, one
answer, and the frozen-campaign guarantee survives. But it is the
`trackModel` inversion that changes, so it waits for the same pass as #1.

---

## What was checked and found clean

Recorded so it is not paid for twice. Every one of these was measured
from rendered pixels, and every detector below was mutation-verified —
the defect was put back and the detector caught it.

| dimension | coverage | result |
| --- | --- | --- |
| WCAG contrast | 3,125 text nodes sampled from rendered pixels — 16 routes × 2 viewports, 119 distinct fg/bg pairs | one real failure, fixed: the spot rule's ticker on the gold pressure bar, 1.21:1 → 6.58:1. One reported failure was the sampler's own fault (see below). |
| Tooltip edge positioning | 32 tooltips opened at edge positions | none leaves the viewport |
| Focus rings | every `outline-none` in the tree | zero without a replacement ring |
| Reduced motion | every infinite CSS animation and Tailwind loop utility | covered — three were not, and are now |
| Keyboard reachability | 9 non-native clickable elements | all reachable; PositioningMap's 21-band roving tabindex verified correct against WCAG 2.5.8 |
| Text overflow | 4 viewports × every route | zero spilling text nodes |
| Under-filled panels | 15 routes, any panel with >60px of dead space at the bottom | zero |
| Unreachable content | 15 routes × 3 viewports, text below the fold on a non-scrolling page | zero |
| Header fit | 768px, every route | fits at exactly 768 after the labels-only ladder |
| Chart label collisions | /pulse/board, four charts | two found and fixed: the trails' strength labels drew under the axis badges at the same strike, and their own backing pad was mis-centred |

Two notes on method, because a measurement is only worth what its failure
modes are worth:

- **An earlier contrast detector reported 47 failures. All 47 were false.** It walked up the DOM for a background colour, which finds nothing on a gradient and finds the wrong thing when the coloured element is a `layoutId` sibling rather than a parent. Sampling the rendered pixels instead is what turned 47 noisy failures into 1 real one.
- **The pixel sampler still reported one false failure**, and it is worth naming: `textMuted` on a Pulse expiry tab, 4.18:1. Screenshotting that exact button by element handle put it on `bg-panel` at **4.81:1** — it passes. The full-page sampler had collected the rect and the pixels a fraction apart on a desk that was still settling, so it compared a colour against pixels the active chip had moved into. I filtered for rects that were identical before and after the capture, which was not enough: a rect can hold still while what is painted in it changes. Anything that sampler flags is worth re-shooting by element handle before it is believed.
