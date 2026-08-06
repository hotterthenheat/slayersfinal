# Desk audit — Compass (Setups / Weigher / Lotto / Structures)

Gates 46, 47, 48, with 13, 17 and 63 applied.
Audited against the production build served at `http://127.0.0.1:8123`, HEAD `0512eab`.
Viewports 1440x900 and 390x844. Screenshots in `docs/audit64/shots/`.

Everything below is a measurement. Where I could not reproduce something I say so.
Harness scripts: `/tmp/claude-0/-home-user-slayersfinal/61510a72-f878-56b9-9620-dab6cb6adbf2/scratchpad/{01..15}-*.mjs`.

---

## 0. What was actually exercised

| Surface | Opened | Interacted |
| --- | --- | --- |
| 5 sleeves (0DTE, Weekly, Swing, LEAPS, Structures) | ✅ both viewports | ✅ all five clicked, DOM read before/after |
| 6 scanner styles | ✅ both viewports | ✅ all six clicked, top-6 fingerprinted |
| Cards ↔ Table | ✅ | ✅ switch + 5 header sorts |
| Ticker filter popover | ✅ | ✅ opened, 177 options, one applied, reset |
| Card selection → compare pane | ✅ | ✅ 6 contracts, pane text diffed |
| Compare pane peer table | ✅ | ✅ row click re-targets pane |
| Track / Untrack | ✅ | ✅ aria-label flips |
| Analysis → review mode | ✅ both viewports | ✅ + reload test |
| Contract chain | ✅ | ✅ 62 cells, membership test ×5 |
| Impact leaderboard | ✅ | ✅ all 4 metrics |
| `?view=weigher` | ✅ both viewports | ✅ search, 4 slot pickers, expiry popover (15 options), side toggle, rail select, budget input |
| `?view=lotto` | ✅ both viewports | ✅ 10 name chips, 12 ticket rows, counter-auction `<details>` |
| Structures | ✅ both viewports | ✅ card selection (the only control on the board) |

Total shots written this pass: 60 under `docs/audit64/shots/` prefixed `G46_`, `G13_`, `G17_`, `P0*_`.

---

## 1. What is already right, and must survive a refinement pass

This desk is measurably the strongest in the app. Listing the load-bearing wins first, because
several of them are the kind a redesign quietly breaks.

**Accessibility is clean.** axe-core 4.x, `resultTypes: ['violations']`, run on five views ×
two viewports = **10 runs, 0 violations**. Not "few" — zero. That includes the `role="listbox"` /
`role="option"` Weigher rail with the `SpotRule` marker hidden via a Fragment, and the
`role="listitem"` + inner `role="button"` scan card. Both are documented non-obvious fixes
(`SetupScanCard.tsx:60-79`, `ContractWeigher.tsx:~440`). Do not "simplify" either.

**Gate 13 is clean.** My detector looked for laid-out boxes ≥140×110 with no text, canvas, svg,
img, table, input or button descendant. Result across `/compass`, `?view=all`,
`?sleeve=structures`, `?view=weigher`, `?view=lotto` at both viewports: **zero regions**. The one
candidate (`weigher 390x844`, 314×133 at y=1066, `div.mt-2.flex.flex-col.gap-1.5`) is the body of a
**closed `<details>`** (`ContractWeigher.tsx:1192-1205`) — Chromium still reports a rect for it;
`innerText` is empty because it is collapsed. False positive. Trailing void from last ink to the
scroller's bottom edge: **16–19px** on every full-length view at both viewports.

**No horizontal page overflow at 390.** `document.documentElement.scrollWidth === innerWidth === 390`
on all five views. The elements whose right edge exceeds 390 are all inside deliberate
`overflow-x-auto` rails (sleeve strip, style strip, Weigher rail, Lotto name chips) — the design
documented at `Compass.tsx:636-639` and `Compass.tsx:685-687`.

**The six styles are six different boards, and this is measurable.** Top-6 contract sets:

```
Quick Scalp   CL 94.50P  REGN 1012P  GOOGL 183P  ADBE 547P  RTX 116P   COIN 181C
Discounted    CME 190P   META 566C   GE 175C     WMB 44.50C MRNA 71.50C CL 93P
Rebounds      PNC 183P   BA 189P     MU 104C     QCOM 165C  WDAY 238P  CDNS 267C
Whale Sweeps  TXN 200C   DHI 170P    TMUS 205P   KMB 140C   BSX 77.50P DELL 125C
```

Pairwise intersection between those four: **0 contracts**. The `seek`/`reach` model
(`data/compass.ts:162-169`) is doing real work. `All` and `Top Setups` share their head, which is
correct — same profile, different floor.

**The Weigher's factor ledger foots exactly.** Measured on SPY 504C: `27 + 16 + 14 + 17 + 8 + 3 = 85`,
`Σ six rows` prints 85, headline prints 85. `apportion()` (`ContractWeigher.tsx:117-125`,
largest-remainder) is the single best piece of numeracy on this desk and is the model for
everything else on it.

**Sorting, filtering and metric switches all do what they claim.** Five table headers tested
(Mid, Health, 1σ Move, Breaks At, Score) — all five re-ranked the whole 240-row body, not a page.
Ticker filter: 177 options, 24 cards → 3 cards, all one name, counter follows
("Showing 3 of 264 scoring 84+"). Impact leaderboard: four metrics produce **four distinct #1
rows** — the fix documented at `ImpactLeaderboard.tsx:84-92` is real.

**Board ↔ chain contract coherence holds.** I opened five different setups off the board and asked
whether the contract named in the H1 exists as a cell in the 62-cell chain beside it.
**5/5 present** (TJX 114C, DAL 47C, PCAR 100C, META 537P, REGN 1030P). Board mid and monitor mid
agreed to the cent on every sample (`REGN 1014P` board `$10.66` / monitor `$10.66`).

**The Lotto MOC tone map is house-correct.** `LottoBoard.tsx:28-37`: `CONTINUATION` + `BUY` → bull,
`CONTINUATION` + `SELL` → bear, `ABSORPTION FADE` → warn, `DISLOCATION REVERSAL` → magenta. I
verified both branches live: SPY `CONTINUATION` / `BUY $1.0B` renders green; ADBE
`ABSORPTION FADE` / `SELL $1.2B` renders amber-and-red. Green never means "the model likes this",
only "the imbalance is upward". This is exactly the rule and it is being kept.

**Lotto explains its own substitutions.** Switching to a name with no read prints
*"SPY has no actionable closing-auction read right now, so the board opened on ADBE. Pick any name
above to change it."* plus *"The auction has not published. Grades are flow and liquidity only.
This is the modelled closing-auction read for the session, not an exchange feed."* Two disclosures
most products would omit.

**`preserveGreek` works — and I was wrong about it.** At 1440x900 the Lotto row label reads as
`0/DAY` to the eye. I measured it: `textContent` is `θ/day`, codepoints `[3b8, 2f, 64, 61, 79]`,
`innerHTML` is `<span class="normal-case">θ</span>/day`, parent `text-transform: uppercase`.
The lowercase theta survives. **Not a bug.** (See P3-19 for the legibility consequence.)

**Structures is a real instrument board.** Payoff curve per structure, `Risk` / `Reward` / `R/R` /
`P(profit)` read off the same array the curve draws, legs listed, breakevens spelled out, and a
footer stating that assignment and early exercise are not modelled. Iron butterfly 3.51x @ 30%
against bear call 0.50x @ 70% is a genuine risk/probability trade-off on one screen.

---

## 2. Findings

### P0 — wrong or misleading numbers

---

**P0-1 — The Weigher asserts "nothing beats this" while the rail beside it shows eight contracts that do.**

`src/core/contractScore.ts:319-357` (`betterAlternative`), rendered at `ContractWeigher.tsx:1337`.

Measured on the Weigher's own landing state, one screenshot, two panes:

| On screen | Value |
| --- | --- |
| Headline | `85 QUALIFIED` — SPY 504C |
| Claim under it | *"Nothing in the Lotto sleeve beats this on both grade and reward to risk."* |
| Rail to its right, same expiry, same side, same engine | 496→**91**, 497→**91**, 498→**91**, 499→90, 500→90, 501→89, 502→88, 503→87 |

Evidence: `shots/G46_compass_weigher_1440x900.png` and `shots/P0A_weigher_claim_vs_rail_1440x900.png`.

The claim names two tests. Both fail. Selecting 496C in the rail and reading its own quote card:

| | SPY 504C (the claim's subject) | SPY 496C (the rail's best) |
| --- | --- | --- |
| Grade | 85 | **91** |
| Breakeven | 0.3% | **0.0%** |
| 1σ move | 0.8% | 0.8% |
| `rr = 1σ / max(breakeven, 0.05)` | 0.8/0.3 = **2.67** | 0.8/0.05 = **16.0** |

`betterAlternative` requires `candidate.composite >= target.composite + 5` (91 ≥ 90 ✓) and
`rr(candidate) >= targetRr` (16.0 ≥ 2.67 ✓). Both pass, and the pane still prints "nothing beats this".

Cause: `betterAlternative` searches `weighContracts(snapshot, horizon)`, whose candidate set is
`HORIZON_SHAPE.LOTTO.otm = [0, 0.003, 0.006, 0.011]` (`contractScore.ts:124`) — four
at-or-out-of-the-money offsets, **no in-the-money strike at all**. The rail (`ContractWeigher.tsx`
`rail` memo) grades **17 listed strikes** with the same `weighContract`. The sentence's universe is
4; the visible universe is 17; nine of the invisible thirteen outrank the subject.

**Fix (smallest coherent):** run `betterAlternative` over the rail's own `rows` — the array is
already built, already graded, already on screen. Failing that, the sentence must name its
universe ("nothing in the four sleeve offsets…"), which is an admission that the sentence is not
worth printing.

---

**P0-2 — The Weigher's take-profit ladder is priced off a different mid than the quote directly above it.**

`ContractWeigher.tsx:646-652` (`evidence`) and `:1355-1361` (the TP row).

Measured, SPY 504C:

```
THE QUOTE   MID $1.59
TP1 $1.80 · PENDING     implies mid 1.353
TP2 $2.54 · PENDING     implies mid 1.351
TP3 $3.58 · PENDING     implies mid 1.351
TP4 $5.06 · PENDING     implies mid 1.349
```

(`buildTakeProfits`, `data/compass.ts:492-500`: rungs are `[0.3,0.8,1.5,2.5] × (0.8 + moveBias×0.3)`;
with `top-setups` `moveBias = 1.0` that is `×1.33 / ×1.76 / ×2.25 / ×3.75`. Solving each target
back gives the mid the ladder was built from.)

**$1.35 vs $1.59 — a 15.1% disagreement between a card's own quote and its own profit targets.**

Cause: `evidence = makeSetup(..., 'top-setups', cfg.iv)` prices with `estimatePremium`
(`data/compass.ts:237-244`, a normal-shaped time-value approximation) while `weighed` comes from
`weighContract` → Black-Scholes (`core/contractScore.ts`). Two pricing models on one card.

Confirmed by the control case: on the deep-ITM 496C the two models agree (mid $7.98, TP1 $10.60 →
implied $7.97) because intrinsic dominates. The gap is exactly the time-value disagreement, so it
is **largest on the at-the-money contract the desk lands on**.

**Fix:** build the ladder from `weighed.mid`, not from a second `Setup`.

---

**P0-3 — One card prints `91 QUALIFIED` and `INVALIDATED` at the same time.**

`ContractWeigher.tsx:651` and `:1348`. Evidence: `shots/P0_weigher_91_QUALIFIED_and_INVALIDATED_1440x900.png`,
DOM read: `grade: "91 QUALIFIED"`, `state: "INVALIDATED"`.

Two independent scoring engines are rendered eight lines apart with neither naming its scale:

- **Headline + verdict badge** ← `weighed.composite` (0–100, six weighted factors,
  `contractScore.ts:280-281`, `BUY` at ≥70) → `QUALIFIED`.
- **StateBadge** ← `setupState(evidence)` where `evidence.verdict` is the **scan** engine's
  (`data/compass.ts:575`, `ENTER` at ≥88, `EXIT` under 72) → `EXIT` → `INVALIDATED`
  (`setupState.ts:49`).

SPY 496C at spot 503.89 on the 0DTE window (`windowPct = 0.03`) sits at `u = -0.52`, so the scan
score lands near 66 → `EXIT`. The composite reads liquidity, flow, decay and the math and lands at
91 → `BUY`. Neither number is wrong in its own frame. Printing them adjacent with no frame is.

**Fix:** the Weigher already owns a grade. The evidence block should contribute chips and the
invalidation sentence and stop there — drop the StateBadge, or label it
("scan lifecycle: INVALIDATED") so a reader knows two scales are speaking.

---

**P0-4 — The Impact leaderboard's `Gamma %` column is a real share multiplied by a made-up constant.**

`data/compass.ts:1079` and `:1082`:

```ts
gamma: Number(((Math.abs(node.netGex) / totalGamma) * 100 * gammaScale).toFixed(1)),
...
return [mk('C', node.callOI, 0.45), mk('P', node.putOI, 0.38)];
```

Both sides of a strike read the **same** `node.netGex`; they differ only by the hardcoded
0.45 / 0.38. Measured on the shipped board, every strike carrying both sides:

| Strike | Call | Put | C/P ratio |
| --- | --- | --- | --- |
| 499 | 2.9% | 2.5% | 1.160 |
| 500 | 10.1% | 8.5% | 1.188 |
| 505 | 6.1% | 5.1% | 1.196 |

`0.45 / 0.38 = 1.1842`. The call/put gamma split at every strike in the product is one constant.

Second problem: the column is formatted as a percentage of the book's gamma, but by construction
the whole chain can only sum to `0.83 × 100 = 83%`. The eight rows on screen sum to **40.7%** with
no statement of what the remainder is.

**Fix:** either compute a per-side gamma (the greeks are already fetched two lines above at
`data/compass.ts:1068`) or rename the column to what it is — a scaled gamma rank index — and drop
the `%`.

---

**P0-5 — The invalidation price and its stated cause are both random draws, and the causes name market structure the engine never computes.**

`data/compass.ts:618-628`:

```ts
const invalidationOffset = spot * (0.008 + rng() * 0.012); // 0.8–2% away
const invalidationPrice = right === 'C' ? spot - invalidationOffset : spot + invalidationOffset;
const invalidationReasons = [
  'Dealer buy-wall support', 'Gamma concentration floor',
  'Dark-pool accumulation level', 'Key open-interest cluster',
];
const invalidationReason = invalidationReasons[Math.floor(rng() * invalidationReasons.length)];
```

This is the desk's **risk / invalidation object** — Gate 17's fourth slot. It is on every scan card
(`SetupScanCard.tsx:150-156`), every table row (`SetupScanBoard.tsx:163-174`), the compare pane's
"What kills it" block (`SetupCompare.tsx:297-314`) and the Weigher's evidence line. Measured live:
*"Breaks below $347.95, 1.7% below the $353.95 spot, at the dealer buy-wall support"*.

All four strings name a specific structural feature. None is read from any structure. The gamma
floor is not read from `node.netGex`; the open-interest cluster is not read from `node.callOI` /
`node.putOI`; both are on the same snapshot the chain beside it is drawn from. A 0.8–2% uniform
draw is being narrated as a dealer level.

This is the single most damaging number on the desk, because it is the one a user would size a
stop against.

**Fix (no new data):** derive the level from `snapshot.chain` — nearest strike below spot (calls) /
above (puts) whose `callOI + putOI` is a local maximum, or whose `|netGex|` is. Then the sentence
"Key open-interest cluster" is true and the number is checkable against the chain panel two columns
to the right.

---

**P0-6 — Lotto: the printed grade and the verdict badge beside it are computed from different numbers.**

`LottoBoard.tsx:298` vs `:394`, and `:541`.

```ts
const graded = c.composite + adjust;              // :298 — the big number on the row
<SignalBadge tone={VERDICT_TONE[GRADE_VERDICT[c.verdict]]}>…  // :394 — c.verdict, from composite alone
const qualifies = board.filter(c => c.verdict === 'BUY').length; // :541 — the "N of 6 qualify" stat card
```

`c.verdict` is `composite >= 70 ? BUY : composite >= 52 ? WATCH : FADE` (`contractScore.ts:281`).
`adjust` reaches ±18 (`LottoBoard.tsx:127-132`).

**I could not reproduce this live.** `auctionAdjust` returns 0 unless `clock.mocOpen`
(15:50–16:00 ET); every observation I took was at 15:17–15:39 ET, and all 12 ticket rows measured
`adjust === 0`, so grade and badge agreed on all of them (85/82/78/72 QUALIFIED, 66/60 WATCH — and
`4 of 6 qualify` was correct). Reported on the code, not on a repro.

Inside the MOC window a row can print `68 → 76` with a `WATCH` badge, or `72 → 58` with
`QUALIFIED`, and the header stat card will count the pre-adjust verdicts while the board is sorted
by the post-adjust ones (`:529` sorts on `composite + adjust`). Since the MOC window is the
**only** time this desk's headline mechanism is live, the defect is scheduled to fire exactly when
the page matters.

**Fix:** derive one verdict from `graded` and use it for the badge, the count and the sort.

---

### P1 — significant defects

---

**P1-7 — "What it pays" is a per-preset constant drawn as if it were a per-contract measurement.**

`data/compass.ts:644-645`, rendered `SetupCompare.tsx:260-287`.

```ts
swingTarget: { price: mid * (1 + profile.swingMul), pct: Math.round(profile.swingMul * 100) },
scalpExit:   { price: mid * (1 + profile.scalpMul), pct: Math.round(profile.scalpMul * 100) },
```

Both `pct` values read the scanner profile and nothing about the contract. Measured by clicking six
different contracts and reading the pane's DOM each time:

```
CME 193P      +38% / +18%   bars 100% / 47.3684%
REGN 1013P    +38% / +18%   bars 100% / 47.3684%
META 556C     +38% / +18%   bars 100% / 47.3684%
MDLZ 70.50C   +38% / +18%   bars 100% / 47.3684%
VRTX 471C     +38% / +18%   bars 100% / 47.3684%
TXN 200C      +38% / +18%   bars 100% / 47.3684%
```

Six contracts, six identical bar pairs to four decimal places. Across the other five presets the
ratio is `scalpMul/swingMul` = 10/22, 28/60, 22/45, 20/42, 18/38 — 0.45 to 0.49. So the bar pair is
essentially the same picture in **every contract in the product**.

The comment at `SetupCompare.tsx:253-256` says the bars exist to show "the target is not a little
further than the exit, it is twice as far". That is true of every contract, always, by construction.
A bar whose length cannot vary is not a chart.

**Fix:** keep the dollar rungs (they do vary with mid) and drop the bars, or scale the rungs by
something contract-specific the setup already carries — `expectedMovePct` is right there and would
make the pair say "your target is 15× the 1σ move" on one contract and "1.2×" on another.

---

**P1-8 — The contract chain computes twelve fields per side and renders five, and the seven it drops are the ones a strike choice needs.**

`data/compass.ts:975-1013` (`chainSide`) vs `ContractChain.tsx:48-88` (`ChainCell`).

Computed and rendered: `premium`, `changePct`, `health`, `momentum`, `action`.
Computed and **never rendered anywhere in `src/`** (verified by grep): `bid`, `ask`, `delta`,
`ivPct`, `volume`, `openInterest`, `itm`.

The engine comment at `data/compass.ts:971-974` says the chain "now carries real depth — a book, a
delta and an implied vol per side rather than a premium and a mood." The panel renders exactly a
premium and a mood.

Consequence for the brief's signature requirement: the chain is the **competing contracts →
economic comparison** step. With premium + health + momentum + action you can compare two strikes
on *the model's opinion*. You cannot compare them on cost of crossing, on delta per dollar, on
whether either is in the money, or on whether anyone trades them. `itm` in particular is computed
and thrown away — the chain has no ITM shading, which is the single most universal affordance in
any options chain ever shipped.

**Fix:** render `delta` and `openInterest` in the cell's second row in place of `momentum` (which
is a monotone restatement of `health` — `momentumFromHealth`, `data/compass.ts:253-257`), and use
`itm` for a background tint. No new data; three fields already on the object.

---

**P1-9 — The Weigher says the same theta number is both carryable and disqualifying, on one page.**

Measured on SPY 504C, both strings live simultaneously:

- Factor row, y≈593: *"Theta 72.4%/day is carryable for the holding window."* — score 71, contributes 17 of 85.
- "If you take it" panel, page bottom: *"Spread round-trip plus a day of theta (72.8%) is wider than the 1σ move (0.8%), so you would need a fast, above-expected move just to clear the toll."* — chip `COSTS EAT THE EDGE`.

Cause: `contractScore.ts:230-235`. `decayScore = 100 - (thetaPerDayPct / DECAY_CEILING) × 100`
with `DECAY_CEILING.LOTTO = 250`. The word "carryable" fires at `decayScore >= 55`, i.e. at any
theta up to **112.5%/day**. The threshold is horizon-relative; the sentence quotes an absolute
number and reads as an absolute claim.

**Fix:** the copy has to carry its own frame — "72.4%/day, which is mid-range for a same-session
contract" — or the threshold has to move to something the bottom panel would agree with (theta/day
vs 1σ, which the bottom panel already computes).

---

**P1-10 — `Delta Notional` has a $10M quantum and prints `$0` on contracts with 67,000 open interest.**

`data/compass.ts:1078`: `deltaNotional: Number(((|delta| × oi × 100 × spot) / 1e9).toFixed(2))` —
stored in billions to two decimals, so the resolution floor is $0.01B = **$10M**, and anything
under $5M rounds to zero.

Measured, Impact leaderboard ranked by Volume:

```
#2  SPY 515C  0DTE  OI 67,148  vol 49,018  Delta Notional $0     Gamma 0.2%
#4  SPY 490P  0DTE  OI 60,856  vol 41,382  Delta Notional $0     Gamma 0.0%
#1  SPY 495P  0DTE  OI 65,996  vol 49,497  Delta Notional $10.0M Gamma 0.9%
```

`$10.0M` is the smallest non-zero value the column can express. On the `Notional` ranking the
bottom of the table is a tie block of `$0`s that are not zero.

**Fix:** store the raw dollar figure and format at the render site (`fmtUsd` already handles
magnitude), rather than quantising in the engine.

---

**P1-11 — On a phone the Weigher's balance is gone.**

Measured at 390×844: the `role="listbox"` rail (`aria-label="Listed strikes on SPY, spot $503.89"`)
sits at **y = 1479** inside an 844px viewport — 1.75 screens below the fold — and is **30px tall**,
because `sm:flex-col` turns it into a horizontal strip and the grade bar is `hidden sm:block`
(`ContractWeigher.tsx:~500`).

So on a phone the Weigher is: a search box, a grade, six factor rows, a quote grid, chips, a chart,
a sizing panel — and then, at the very end, a 30px horizontal scroller with strike and price and
no bar. The "analytical balance" the brief asks for is the rail. On mobile it is a footnote.

Evidence: `shots/G17_weigher_rail_below_fold_390x844.png`, `shots/G46_compass_weigher_390x844.png`.
Anatomy: grade at y=444, `Σ six rows` at y=1011, `The quote` at y=1074, rail at y=1479, doc 2845.

**Fix:** move the rail directly under the grade on `< sm` and keep the bar. It is the one object
on the pane that shows the decision instead of asserting it.

---

**P1-12 — Structures is ranked by a key that is never shown and is `Infinity` for its top two rows.**

`StructureBoard.tsx:110-112`: `sort((a,b) => b.rewardRisk * b.probProfit - a.rewardRisk * a.probProfit)`.

Measured order and the numbers on screen:

| # | Structure | R/R shown | P(profit) | key |
| --- | --- | --- | --- | --- |
| 1 | Long straddle | **—** | 42% | `Infinity` |
| 2 | Long strangle | **—** | 37% | `Infinity` |
| 3 | Iron butterfly | 3.51x | 30% | 1.053 |
| 4 | Bear put spread | 1.68x | 44% | 0.739 |
| 5 | Bull call spread | 1.28x | 41% | 0.525 |
| 6 | Iron condor | 1.05x | 40% | 0.420 |
| 7 | Bear call spread | 0.50x | 70% | 0.350 |
| 8 | Bull put spread | 0.60x | 56% | 0.336 |

The ordering is arithmetically correct. But a board whose stated premise is *"the worst case is
known before the trade"* puts its top two slots into the two structures whose reward is by
definition unknown, and prints **`—`** in the column it ranks by, on both of them. Rows 7 and 8
then appear out of R/R order (0.50x above 0.60x) with nothing on screen explaining why — because
the tiebreak, `P(profit)`, is a separate column the reader has to multiply themselves.

**Fix:** show the product. It is one column, it already exists as the sort key, and it is the
number that makes 3.51x@30% and 0.50x@70% comparable — which is the whole reason both are on the
board.

---

### P2 — hierarchy and comprehension

---

**P2-13 — Review mode is the only state on this desk that is not in the URL, and it is the deepest one.**

`Compass.tsx:488-504` (`handleReviewSetup`) never calls `writeView`. Measured: entered review on
`META 555C`, `location.search === ""`; reloaded; H1 returned to `Trade Setups`. Same at 390×844.

The 27-line comment at `Compass.tsx:117-144` explains at length why every pane and every preset
lives in `?view=` — "a URL that survives a reload, a paste, and a Back". Monitoring a specific
contract, reached by two clicks and carrying its own header and breadcrumb, does not. Neither does
the chain selection.

**Fix:** `?view=monitor&c=META-555-C`. `openRow`'s third branch already grades a contract that
never had a board row, so the rehydration path exists.

---

**P2-14 — The Structures sleeve renders under the Setups title and the Setups subtitle.**

Measured, `/compass?sleeve=structures` at both viewports: `h1` = **"Trade Setups"**, subtitle =
*"Setups ranked by trend + dealer-flow conviction. A read, never an order."*, breadcrumb
`TERMINAL / COMPASS / SETUPS`. The board underneath is eight defined-risk structures which are
ranked by neither trend nor dealer flow.

`Compass.tsx:533-549` keys `modeMeta` off `mode`, and `structures` is a sleeve, not a mode
(`Compass.tsx:677-679` swaps the body only). Evidence: `shots/G46_compass_structures_full_1440x900.png`,
`shots/G46_compass_structures_390x844.png`.

---

**P2-15 — Lotto has no single dominant object, and its board starts two-thirds of the way down the fold.**

Gate 17 measurement, largest type in the first viewport at 1440×900:

```
Lotto · 0DTE Desk                     20px  y=101   (page title)
CONTINUATION / +77 / BUY $1.0B / 0:42:30 / Calls
                                      18px  y=196   (five-way tie)
85 / 82 / 78 / 72 / 66                18px  y=612+  (five-way tie)
```

Ten objects tie for largest. The first ticket row sits at **y = 592 of 900 = 66% of the fold**; at
390×844 it is at **y = 1017 = 120%** — entirely below it. The five stat cards are equal-weight, so
nothing tells you whether `CONTINUATION` or `+77` or `0:42:30` is the thing to read first.

Compare Setups (first data row at 41% of the fold, one 36px score dominating) and Weigher (34%, one
36px grade). Lotto is the outlier.

**Fix:** the auction read is the page's conclusion and the clock is its constraint. Those two
deserve the size; `MOC score`, `Imbalance` and `Board` are its supporting evidence and can drop a
tier. That is a type-scale change, not a restructure.

---

**P2-16 — Structures selection has no consequence.**

`StructureBoard.tsx:90` holds `selectedId`; `:136` applies `ink.wash`. Nothing else reads it — no
compare pane, no track, no chart, no detail. Measured: the board's only interactive elements below
the header are the eight cards themselves (`totalInteractive: 19`, of which 8 are the cards and 3
are footer links). No sort, no filter, no ranking control, no way to carry a structure anywhere.

Every other sleeve ends in "Analysis" or "Track". This one ends.

---

**P2-17 — Amber does two jobs on the desk's landing screen.**

`sleeveInk.ts:38-44` assigns `text-warn` (`#FF9500`) to the **0DTE sleeve** as a horizon identity.
`#FF9500` is also the desk's warning ink. Measured on `/compass` (default sleeve = 0DTE), elements
computing to `rgb(255,149,0)`:

```
"0DTE"                    ← sleeve identity (a horizon)
"Breaks below $64.25"     ← invalidation (a risk)
"Breaks below $69.87"     ← invalidation
"Breaks above $336.65"    ← invalidation
... (one per visible card)
```

The house rule is amber = warning/degraded. Assigning it to a horizon means the landing screen —
which is 0DTE by default — reads the sleeve label and the risk line in one ink. The comment at
`sleeveInk.ts:8-13` gives the rationale ("orange for the session that is burning down"), which is
defensible for 0DTE specifically, but the collision is real and it is on the first screen every time.

---

### P3 — polish

**P3-18 — One number, two labels, two panes.** `(ask − bid) × 100` renders as
*"$4 to cross"* in `SetupCompare.tsx:235` and *"round trip across the book"* in
`contractFacts.ts:135`. Both are correct; a reader moving from the compare pane to the monitor sees
two names for one figure.

**P3-19 — θ at 9–10px is visually ambiguous with 0.** The code is right (see §1) — but at
`text-micro` in the mono face, `θ/day` reads as `0/DAY` on a 1440-wide screenshot, which is the
exact misreading `greek.tsx` was written to prevent. I misread it myself before measuring the DOM.
The comment says "in a monospace face [Θ] is indistinguishable from a zero"; at this size lowercase
θ nearly is too. Consider `Theta/day` at `text-micro` sizes.

**P3-20 — The Weigher rail's top three tie at 91 and draw identical bars.** 496/497/498 all grade 91;
`data-bar` width is `${composite}%` so all three are the same length. The rail is the desk's
comparison instrument and its head is a three-way visual tie. `mid` distinguishes them ($7.98 /
$7.01 / $6.07) and is already in the row.

---

## 3. Gate 17 — the five objects

Applied at 1440×900, first fold, few-seconds test.

| | **Setups** | **Weigher** | **Lotto** | **Structures** |
| --- | --- | --- | --- | --- |
| **Dominant analytical object** | ✅ the 36px score in the compare pane (y=369) | ✅ the 36px grade (y=339) | ❌ ten-way tie at 18px | ❌ **none** — nothing above 17px except the page title |
| **Current-state object** | ✅ sleeve tab + `SWEEP 19:16:41` freshness | ✅ `SPY 504C · 08/03/26 Mon · 0 days · 0 sessions · Lotto sleeve` | ✅ `TIME TO CLOSE 0:42:30` + auction read | ⚠️ `45DTE · 09/17/26` only; no spot, no clock |
| **Main conclusion** | ✅ `QUALIFIED` badge + headline | ✅ `QUALIFIED` + the one-line claim (which is wrong — P0-1) | ✅ `PLAYBOOK — Calls only. …` | ❌ absent — eight peers, no pick, no ranking statement |
| **Risk / invalidation** | ⚠️ present and prominent (`WHAT KILLS IT`) but the number is an RNG draw (P0-5) | ⚠️ same (`Contradicted below $495.81`) plus a `COSTS EAT THE EDGE` panel that contradicts the grade (P1-9) | ✅ `LOTTO RISK` banner — the best risk object on the desk | ✅ `RISK $X` per card, arithmetic, honest |
| **Next action** | ✅ `Analysis ↗` / `Track` | ✅ `Add to tracker` + rail select | ✅ ticket row → chart, `Against the auction (6)` | ❌ **none** |

**Setups and Weigher pass Gate 17** on structure, and fail on the truth of two of the five objects.
**Lotto passes on content and fails on hierarchy.** **Structures fails on three of five** — no
dominant object, no conclusion, no next action.

---

## 4. Gate 46/47/48 — does the desk have a signature interaction?

**Yes. Three of them, and all three use real product data.** Naming them, because a refinement pass
that flattens any of them would be a regression.

**1. The Weigher's neighbour rail** (`ContractWeigher.tsx` `ContractLadder`). Seventeen listed
strikes from `paneSnap.chain`, each independently graded by `weighContract`, drawn as
strike / mid / bar / grade, with the live spot rule embedded **between** the two strikes it sits
between (`SpotRule`, `crossing` index). Clicking a rung re-weighs the whole pane. This is the
analytical balance the brief asks for — the economics (mid, grade, distance from spot) are all on
one axis and no composite hides them. It is real data: `paneSnap` is a live `Simulator.buildSnapshot`,
the grades are the same engine the headline uses. **Not decoration.** Its one failure is that the
claim printed beside it contradicts it (P0-1) and that it disappears on a phone (P1-11).

**2. Lotto's auction-reach chip and the sentence under each ticket.**
*"Auction covers 3.1x — Needs 0.33% by the bell. The auction is displacing 1.27σ, worth 1.03% on
this strike."* That is first-passage physics stated in the units of the constraint: the move
required, the displacement available, the ratio, and the clock (`0.7h to bell`, `θ/day −71%`). Plus
`AT THE PIN` when `c.strike === pin` with *"Dealers are heaviest on 505, so it has to break its own
pin."* Real data — `moc.displacementZ` from `buildMoc` (`core/fracture.ts:232+`), `pin` from the
chain, `breakevenMovePct` from the pricing engine. **This is the strongest signature interaction in
the application** and it is exactly what the brief describes. And there is no gambling imagery:
no dice, no wheels, no scratch-cards, no green "you could win" framing. The one lexical carryover is
`TOP TICKET` / "ticket", which reads as trading-floor language rather than casino language; I would
leave it.

**3. Structures' payoff curve.** Split at the zero line so profit renders bull and loss renders
bear (`StructureBoard.tsx:46-58`) — green and red used for money made and lost, which is the one
thing the house palette says they are for. Real: `payoffCurve(st, spot, 121)`, and the four figures
under it are read off the same array.

**What is missing is the connective tissue the brief's chain names.** The desk has
*market state* (sleeve + spot + sweep clock), *setup* (the board), *competing contracts* (the
chain), *risk* (invalidation), *selection* (Track). It does **not** have **economic comparison** —
the step between "here are the competing strikes" and "here is why this one". The chain renders no
delta, no book, no OI, no ITM (P1-8); the compare pane's only comparative object is a bar pair that
is constant across the product (P1-7); the peer table shows Score / Mid / 1σ and no cost, no
breakeven, no theta.

**Proposal — one mechanism, no new data.** Give the contract chain the Weigher rail's grammar: per
cell, replace `momentum` (a monotone restatement of `health`, `data/compass.ts:253-257`) with
`Δ {side.delta}` and `OI {side.openInterest}`, and tint the cell background where `side.itm` is
true. All three fields are already computed in `chainSide` (`data/compass.ts:995-1012`) and
discarded. Then, on the selected strike, show a one-line delta against the strike the user came
from — *"$1.20 more, 0.14 more delta, 3,400 fewer OI"* — computed from two `ChainSide` objects that
both already exist in `ContractChain.rows`. That is the economic-comparison step, built entirely
from fields the engine emits today and the UI throws away.

---

## 5. Gate 13 — unexplained empty regions

**None found.** Detector: laid-out `div/section/main/aside/li/td` ≥140×110 with no
text/canvas/svg/img/table/input/button descendant, ancestor-deduped, on five views × two viewports.

| View | 1440×900 | 390×844 | Trailing void (last ink → scroller bottom) |
| --- | --- | --- | --- |
| Setups (`top-setups`) | 0 | 0 | −1501 / −4006 px (inner card scroller overflows — by design) |
| Setups (`all`) | 0 | 0 | as above |
| Structures | 0 | 0 | 19 / 16 px |
| Weigher | 0 | 1 → false positive | 18 / 16 px |
| Lotto | 0 | 0 | 18 / −1003 px |

The single candidate — weigher 390×844, **314 × 133 px at y = 1066**, `div.mt-2.flex.flex-col.gap-1.5`,
screenshot `shots/G13_weigher_390x844_empty.png` — is the body of the closed
`<details>Why these weights</details>` at `ContractWeigher.tsx:1192-1205`. Its `innerHTML` contains
three populated `<p>`s. Chromium reports a rect for collapsed `<details>` children; `innerText`
returns empty. Not a void.

Note on method: this app scrolls in `main.h-full.overflow-y-auto.pt-14`, not on the document, so
`window.scrollY` is always 0 and `fullPage: true` captures only one viewport. All below-fold shots
were taken by scrolling that element (`scratchpad/11-scroll.mjs`).

---

## 6. Gate 63 red-team — what would survive a logo swap?

Judged by asking: could this exact component, with this exact copy, appear in a generic broker
dashboard tomorrow?

**Would survive the swap — i.e. is generic:**

1. **The `Largest Impact Contracts` table.** Rank / Contract / Exp / OI / Volume / Delta Notional /
   Gamma with a four-way "rank by" segmented control. This is the leaderboard every options
   product ships. Its one distinguishing number (`Gamma %`) is the one that is fabricated (P0-4).
   Evidence: `shots/G46_compass_impact_1440x900.png`.

2. **The `Table` density of the scan board.** Contract / Expiry / State / Score / 1σ Move / Mid /
   Health / Breaks At, sticky header, click-to-sort. Nothing in it is Slayer's. The **Cards**
   density is not generic (`#rank` + directional pill + coverage tier + lifecycle badge +
   computed evidence chips + invalidation footer is a specific opinion); the table is the same
   data with the opinion removed. Evidence: `shots/G46_compass_table_1440x900.png`.

3. **The five Lotto stat cards.** `AUCTION READ / MOC SCORE / IMBALANCE / TIME TO CLOSE / BOARD` in
   five equal bordered boxes across the top is the KPI-row idiom, and the equal weighting is what
   makes it read that way (P2-15). What is *inside* them is completely non-generic; the container
   is the most generic object on the desk. Evidence: `shots/G46_compass_lotto_1440x900.png`.

4. **`Showing 240 of 264 scoring 84+` / `All Tickers ▾`.** A count and a dropdown filter. Correct,
   useful, and interchangeable with any product's.

**Would NOT survive — genuinely Slayer's:**

- The Weigher's six-row **factor ledger with a footing contribution column** and `Σ six rows`. No
  generic product shows you the arithmetic and lets you add it up.
- The Weigher's **neighbour rail with the spot rule embedded between rungs**.
- Lotto's **auction-reach sentence** ("displacing 1.27σ, worth 1.03% on this strike").
- Lotto's **`Against the auction (6)`** collapse — *"They are graded, not ranked into the board,
  because the auction read argues the other way."* Deliberately withholding a ranking and saying why.
- The **`QUALIFIED / WATCH / FADED`** lexicon rendered `select / warn / neutral`, never green.
  `verdict.ts` + the rule stated once in `setupState.ts:67-72`. This is the palette discipline the
  brief protects and it is being kept everywhere I looked.
- **`HeldFromSweep`** (`Compass.tsx:106-115`) — a panel that tells you its grade is from the
  previous sweep and why. Nobody ships that.
- Structures' **split-at-zero payoff curve** with the plain-English thesis under it.

The desk's identity is concentrated in the Weigher and Lotto. Setups is where the generic idioms
are, and specifically in the two places where a real number was replaced by a constant
(P1-7 bars) or a random draw (P0-5 invalidation).

---

## 7. What I could not check

- **P0-6 could not be reproduced live.** `auctionAdjust` is gated on `clock.mocOpen` (15:50–16:00 ET)
  and every observation was 15:17–15:39 ET. Reported from source with the exact conditions.
- **`DISLOCATION REVERSAL`** (magenta tone, `boardDte: 1`) never fired on any of the ten names in the
  Lotto strip during the audit window. The 1DTE board and its "next session" copy path are unverified.
- **Empty / degraded states.** `SetupScanBoard`'s `EmptyState` ("Nothing clears this floor") and
  `StructureBoard`'s ("No structures on this expiry") never rendered — every preset returned rows on
  every sleeve. Not reachable without changing engine inputs, which this phase forbids.
- **Deep-link entry paths.** `location.state.monitor` (from Tracker) and `location.state.weigh`
  (from Earnings/Stocks/News) are unexercised — they require navigating from another desk and are
  that desk's audit surface.
- **`?view=lotto` vs the `/lotto` redirect.** I tested `?view=lotto` only.
- **Render-cost profiling.** I measured no React commit counts or flame charts — no profiler build
  is served. The two-tier cadence (`SCAN_INTERVAL_MS = 10_000` vs the 1.5s tick) is asserted from
  source and from observing that the board's rows did not change between sweeps; I did not
  instrument re-renders.
- **Colour-contrast ratios** beyond what axe checks. axe reported no `color-contrast` violations,
  but axe skips text over gradients and over the `holo-bg` active-pill background used on the
  scanner strip (`Compass.tsx:716`).
- **Keyboard traversal end-to-end.** I confirmed roles and accessible names via axe and aria-label
  reads; I did not tab through the full desk and record focus order.
