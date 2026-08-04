# Desk audit — Pinpoint & Prove It (Gates 53, 54)

Audited against the production build served at `http://127.0.0.1:8123` on 2026‑08‑03.
Viewports 1440×900 and 390×844. Browser TZ = UTC (this matters — see D‑17).
Screenshots: `/home/user/slayersfinal/docs/audit64/shots/` — `pp-*` = Pinpoint, `pi-*` = Prove It,
`-d-` = 1440×900, `-m-` = 390×844, `-fN` = scroll fold N (the app scrolls inside
`main#main-content`, so `fullPage` capture equals one viewport; folds were captured by
scrolling that container).

Scratch scripts: `/tmp/claude-0/-home-user-slayersfinal/61510a72-f878-56b9-9620-dab6cb6adbf2/scratchpad/g5354_*.mjs`

---

## 0. What was measured

| Route | doc height @1440 | @390 | axe violations (main) | folds captured |
|---|---|---|---|---|
| `/pinpoint/gamma` | 997 | 1215 | 0 | 2 / 2 |
| `/pinpoint/gamma?view=complex` | 970 | 1066 | 0 | 2 / 2 |
| `/pinpoint/levels` | 2051 | 2850 | 0 | 3 / 4 |
| `/pinpoint/levels?view=ranked` | 1065 | 1395 | 0 | 2 / 2 |
| `/pinpoint/greeks` | 1793 | 2613 | 0 / `scrollable-region-focusable`×1 @390 | 2 / 4 |
| `/pinpoint/greeks?view=migration` | 1744 | 2566 | 0 | 2 / 4 |
| `/pinpoint/stress` | 1115 | 2079 | 0 | 2 / 3 |
| `/pinpoint/stress?view=fracture` | 2443 | 3556 | 0 | 3 / 5 |
| `/pinpoint/history` | 1421 | 2133 | 0 | 2 / 3 |
| `/prove-it?view=models` | 2640 | 5497 | 0 | 3 / 5 |
| `/prove-it?view=volatility` | 1022 | 1850 | 0 | 2 / 3 |
| `/prove-it?view=density` | 1717 | 3077 | 0 | 2 / 4 |

No route scrolls the document horizontally at either viewport. No uncaught page errors on any route.
axe‑core 4.x run against `#main-content` returned exactly **one** violation across all 24 route×viewport
combinations (`scrollable-region-focusable`, 1 node, `/pinpoint/greeks` @390). Accessibility of the
*static* markup on these desks is genuinely good; the a11y defects that remain are target‑size ones
(D‑19), which axe does not check by default.

### Interaction inventory — every button clicked, DOM diffed before/after

Method: reload the route, click one control, diff (a) `main` innerText with digits stripped
(structural change), (b) first‑8 table row order, (c) computed opacity/filter/background of the first
100 cells. Script `g5354_probe.mjs`.

**Everything that claims to change something does change something.** Full log below; the only
"no‑op" clicks were on an already‑active segment (correct behaviour).

| Desk | Control | Measured effect |
|---|---|---|
| Gamma | `This ticker` / `Complex` | swaps the whole body; rows change |
| Gamma | expiry spotlight `ALL / 0DTE / AUG 4 / 5 / 7 / 10` | **works** — non‑selected expiry columns drop to `opacity: 0.35`, selected stays `1` (measured across 126 cells) |
| Gamma | `Focus this panel` | opens overlay, rebuilds matrix at ±20 strikes instead of ±10 |
| Levels | expiry `0DTE…All`, window `±10 / ±15` | `±15` changes rows `513…506` → `518…511` and Net GEX `$394.8M` → `$415.9M`; scope sub‑label updates to `0DTE · ±15 strikes` |
| Levels | ledger `Calls / Puts / Net`, `$ / % max`, `EXPORT CSV` | all change content except CSV (file download, no DOM change — expected) |
| Ranked | isolators `All / Top 10 / NBR 1.5x+ / Walls / Near spot` | row counts 31 → 10 → 7 → 2 → 10 |
| Ranked | **all 8 column sort headers** | every one reorders (e.g. `DIST` → `519\|518\|517…`, `OI` → `505\|515\|500…`) |
| Ranked | primary‑target / top‑3 cards / any row | navigate to `/pulse` with `focusPrice` |
| Greeks | `By strike` / `By \|exposure\|`, `Advanced greeks` | reorders rows; adds 4 columns |
| Migration | mode `Charm / Vanna`, IV `−2/−1/+1/+2`, focus `All / Above / Below / Movers`, `Per‑strike / Cumulative` | all change the scenario label and the rows |
| Stress | `Hedge impact / Fracture`, `SHOW` assumptions | both work |
| Fracture | — | **only 2 buttons on the entire view** (the sub‑toggle). Zero filters, scenarios or drill‑downs. |
| History | `OPEN / MID / NOW`, step ◀ ▶, `PLAY`, speed `0.5× 1× 2× 4×` | transport works; speed buttons produce no visible change while paused (untested during playback) |
| Prove It | view tabs, window `10d/30d/60d`, `ASSUMPTIONS`, surface `2D / 3D`, vol `Skew/Term/Surface`, expiry `5d…60d`, window `Full/±20/±10/±5`, density `implied / realized` | all work |

---

## 1. P0 — wrong or contradicting numbers

### D‑01 (P0) Four Pinpoint desks give four different answers to "which way are dealers hedged"

Reproduced with **in‑app navigation only** (one mounted session, no reload — `g5354_cross2.mjs`),
SPY, 2026‑08‑03 ~14:50 ET:

| Route | What it prints |
|---|---|
| `/pinpoint/gamma` | `DEALER GAMMA @ SPOT` **+$394.8M**, badge **LONG GAMMA**, "pinning — dealers dampen moves toward the walls" |
| `/pinpoint/greeks` | `NET GAMMA` **−95M**, "short — amplifying" |
| `/pinpoint/levels` | `Dealer Bias` **NEUTRAL** |
| `/pinpoint/stress` | `HEX READ` — "**Dealers are short gamma** — hedging pushes with the move and eats liquidity" |
| `/pinpoint/history` | `NET GEX` **−$104.2M** |

Screenshots: `pp-gamma-d-f1.png`, `pp-greeks-d-f1.png`, `pp-stress-d-f1.png`, `pp-history-d-f1.png`.

Root cause — the Gamma desk uses a number the codebase explicitly forbids for this purpose:

`src/data/exposure.ts:86-90`
```
// Aggregates over the rendered window. These scale the bars and nothing else:
// they are an expiry-filtered, windowed view, so they are NOT the same number
// as the whole-chain net the cockpit prints, and must not be used to decide
// which way dealers lean.
const netGex = strikes.reduce((a, s) => a + s.gex.net, 0);
```
`src/data/exposure.ts:104-108`
```
// The bias reads the whole chain, on the same basis as the cockpit. Deciding
// it from the windowed sum above had the two panels disagreeing on the SIGN
// for two of sixteen tickers...
```

`src/pages/gex/GammaChart.tsx:55` builds `buildExposureProfile(scan, '0DTE', 10)` and
`GammaChart.tsx:72` does `const longGamma = exposure.netGex >= 0;` — then drives the headline
number, the LONG/SHORT badge and the pin‑vs‑trend sentence off it. `ComplexBoard.tsx:52` repeats it
for all four board columns. Meanwhile `ExposureProfile.tsx:129` prints the *same* number as
`Net GEX` with the honest sub‑label `0DTE · ±10 strikes`, and takes its `Dealer Bias` from
`chainNetGex` instead.

The Gamma desk is the one desk in the section named after this quantity, and it is the one desk
that gets the sign wrong.

**Fix:** `GammaChart.tsx:72` and `ComplexBoard.tsx:52` must read the whole‑chain net
(`chain.reduce((a,n)=>a+n.netGex,0)` — the same value `exposure.ts:108` already computes and
exposes via `data.bias`). If the windowed figure is wanted for the headline, label it with its
scope the way `ExposureProfile.tsx:91` does, and derive the regime badge from the chain net.

---

### D‑02 (P0) The Greeks regime panel contradicts itself three lines apart

`pp-greeks-d-f2.png`, `DEALER REGIME PROBABILITY` panel:

> **PINNED / CHOPPY 37%** … "Dealers are **long gamma** near a magnet — hedging dampens moves and price coils around the level."
>
> **WHAT FLIPS IT** — "PINNED / CHOPPY leads UNSTABLE BREAKOUT by 9 pts. Net gamma is **short (amplifying)** — a flip in net gamma sign is what would swing the read."

The `notes` strings are keyed by regime label and asserted unconditionally
(`src/data/greeksmatrix.ts:166-171`), while `regimeSwing` (`GreeksRegime.tsx:218`) reads the actual
`netByGreek.gamma` sign. When `PINNED / CHOPPY` wins on `nearPin` while gamma is short (the raw
score at `greeksmatrix.ts:154` is `(longGamma ? 2.2 : 0.5) + (nearPin ? 1.4 : 0) + noise`, so this is
reachable and is the *live* state today), the note is simply false.

**Fix:** make the note conditional on the same `longGamma`/`nearPin` terms that produced the score,
or drop the "Dealers are long gamma" clause and describe only the pinning behaviour.

---

### D‑03 (P0) "Probability" is not a probability

`GreeksRegime.tsx:225` renders `sub={`${view.topRegime.prob}% probability`}` and a four‑row
"Dealer regime probability" bar list (`GreeksRegime.tsx:319-333`).

`src/data/greeksmatrix.ts:153-172`:
```
const raw: Record<DealerRegime, number> = {
  'PINNED / CHOPPY': (longGamma ? 2.2 : 0.5) + (nearPin ? 1.4 : 0) + hRange(`${ticker}-${day}-pin`, 0, 0.6),
  ...
};
const total = Object.values(raw).reduce((a, x) => a + x, 0);
... prob: Math.round((raw[r] / total) * 100)
```

Each score carries a **seeded random term of up to 0.6–0.7** on a base of 0.3–3.6, and the four are
normalised by their own sum. Nothing is estimated from outcomes, nothing is calibrated, and the
noise term is 17–100% of the signal terms. The word "probability" appears twice on the card and once
in the panel heading. Measured today: 37 / 28 / 25 / 10.

This is the **only** uncertainty object on the Greeks desk, and the brief's Pinpoint requirement
names uncertainty explicitly.

**Fix:** rename to what it is — a "regime score" or "structural fit", printed as a 0–100 index, not
`%` and not "probability" — until something scores it against outcomes the way `core/quant.ts:207
grade()` scores the Prove It engines.

---

### D‑04 (P0) Prove It shows three different 30‑day IVs for the same ticker

All three visible on `/prove-it`, SPY, same minute:

| Where | Value | Screenshot |
|---|---|---|
| `?view=models` → `VOL REGIME` card | **IV 15% annualized** ("COMPRESSED") | `pi-models-d-f1.png` |
| `?view=volatility` → `IV SURFACE · SKEW SLICE · 30DTE`, readout at MONEYNESS 1.00 | **IMPLIED VOL 13.00%** | `pi-volatility-d-f1.png` |
| `?view=volatility` → `VOLATILITY TERM STRUCTURE`, `ATM IV 30D` | **25.88%** | `pi-volatility-d-f1.png` (DOM‑verified, `g5354_final.mjs` step 1) |

Both vol panels sit **side by side on one screen** under one `MODEL SLAYER-VOL v0.2 · CALIBRATED
18:50:34` badge, and they disagree by a factor of 2.

The two are built from the same `baseIv` by two unrelated formulas that never touch:

`src/data/vollab.ts:45-56` (surface) — at `t=30, m=1.00`:
`iv = base·(0.92 + 0)·(1 − 0.12(1 − e^(−30/45))) = 15 × 0.8663 = 12.99`

`src/data/vollab.ts:66-72` (term) — `short = base×2.25`, `long = base×0.95`:
`iv(30) = 14.25 + (33.75 − 14.25)·e^(−30/55) = 25.55`

Worse, the surface's ATM row is essentially **flat** across tenor (12.99% at 30d, 13.63% at 5d)
while the term panel next to it draws a steeply inverted curve from ~34% to ~14%. One panel says the
term structure is flat; the other says it is inverted. `buildRnd` (`vollab.ts:207`) is fed `atm30`,
so the risk‑neutral density on the third tab agrees with the term curve and disagrees with the
surface.

**Fix:** anchor `buildSurface` to the term curve — replace the ad‑hoc
`(1 − 0.12(1 − e^(−t/45)))` tenor factor with `ivAt(current, t) / (base·0.92)` so the surface's ATM
column *is* the term structure by construction. One derivation, as `exposure.ts:94-99` already did
for levels.

---

### D‑05 (P0) The #1 ranked target is labelled "DOWNSIDE CUSHION" on the book's largest short‑gamma strike

`/pinpoint/levels?view=ranked`, measured from the live DOM (`g5354_measure.mjs` step D):

```
strike 500 | Net GEX −$482.3M | class DOWNSIDE CUSHION | tags KING, WALL | rank #1, score 79
```
It renders green (`CLASS_TEXT['DOWNSIDE CUSHION'] = 'text-bull'`, `RankedTargets.tsx:36-41`) beside a
red −$482.3M in the adjacent cell, and it is repeated on the `PRIMARY TARGET` button and the `#1`
summary card. Screenshot `pp-levels-ranked-d-f1.png`.

`src/data/rankedtargets.ts:101-111`:
```
const strongGex = Math.abs(n.netGex) > maxAll * 0.35;
const hedgingClass = n.strike === pin ? 'MAGNET'
  : strongGex ? (n.strike < spot ? 'DOWNSIDE CUSHION' : 'UPSIDE RESISTANCE') : 'NEUTRAL';
```
The class is decided by **side of spot and magnitude only** — `Math.abs()` discards the sign. A
strike below spot with large *negative* net gamma is where dealer hedging **accelerates** a fall;
the desk calls it a cushion and paints it green.

1 of 31 rows contradicts today; it is the row the desk elects as its primary target.

**Fix:** gate on the sign — `n.netGex > 0 && n.strike < spot → 'DOWNSIDE CUSHION'`;
`n.netGex < 0 && n.strike < spot → 'DOWNSIDE ACCELERANT'` (bear/amber), and symmetrically above spot.

---

### D‑06 (P0) The "Hedge failure boundary" chart cannot show the boundary it is named after

`/pinpoint/stress`, `pp-stress-d-f1.png`. Stat card reads `FAILURE BOUNDARY 9.75% · UP · $553.01`.
The chart beside it is hard‑capped at 3%:

`src/pages/gex/HedgeImpact.tsx:37, 63`
```
const maxMove = 3;
...
{view.failureBoundaryPct <= maxMove && ( ...boundary marker... )}
```

Measured in the live SVG (`g5354_hex.mjs`): the SVG contains **exactly one `<line>`** (the HEX = 1
dashed reference at `y=51.7`); the vertical boundary marker is absent. The x‑axis label `3%` is
placed at `x=560` in a `0 0 560 170` viewBox — i.e. exactly on the right edge, and is clipped
(only `0% 1% 2%` render).

So the desk's headline risk number is 3.25× off the right edge of the chart built to show it, and
the chart's own last axis tick is invisible.

**Fix:** set `maxMove = Math.max(3, Math.ceil(view.failureBoundaryPct * 1.15))` and inset the last
tick (`textAnchor="end"` at `x = W - 2`).

---

### D‑07 (P0/P1) The Stress desk's two views name two boundaries 8× apart with nothing reconciling them

Same desk, one sub‑toggle apart, same ticker, same minute:

- `?view=hedge` — `FAILURE BOUNDARY 9.75% · UP · $553.01`; the chart caption reads
  "Hedging fits inside available liquidity for now — dealers can rebalance without dislocating the
  tape." All four windows badge **OK** (HEX 0.05 / 0.03 / 0.02 / 0.01).
- `?view=fracture` — `FRACTURE LINE $497.85 · DOWN · −1.2% away`, `INSTABILITY 82`,
  `CASCADE IF TESTED 98%`, `CRITICALITY CRITICAL`.

Screenshots `pp-stress-d-f1.png` vs `pp-stress-fracture-d-f1.png`. The desk subtitle promises both
("the HEX failure boundary **and** the fracture line where the tape can break") but no panel on
either view explains that one is an up‑move liquidity boundary and the other a down‑move reflexive
boundary, or why the book is simultaneously comfortable (HEX 0.03, all OK) and 1.2% from a 98%
cascade.

**Fix:** one shared boundary strip at the top of the Stress desk plotting spot with **both**
boundaries on the same price axis (−1.2% fracture, +9.75% hedge failure), so the asymmetry is the
read rather than a discrepancy the reader has to reconstruct across a toggle.

---

### D‑08 (P0) The "CRITICAL" badge means two different severities on one desk

- `?view=hedge`: `INVENTORY STRESS **CRITICAL** 84` — `src/data/hedgeimpact.ts:164`
  `inventoryStress >= 78 ? 'CRITICAL' : >= 58 ? 'STRETCHED' : >= 36 ? 'BUILDING' : 'LIGHT'`.
  CRITICAL is the **worst** rung.
- `?view=fracture`: `CRITICALITY **CRITICAL** · branching 0.87` — `src/core/fracture.ts:398-399`
  `branching >= 0.9 ? 'UNSTABLE' : >= 0.78 ? 'CRITICAL' : >= 0.6 ? 'REACTIVE' : 'STABLE'`.
  CRITICAL is the **second‑worst** rung.

Both badges are visible within one sub‑toggle of each other, both in red. A reader who learns the
word on one view mis‑reads it on the other.

**Fix:** rename the fracture ladder's second rung (`FRAGILE`, say) so `CRITICAL` keeps one meaning
across the desk, or unify both onto the LIGHT/BUILDING/STRETCHED/CRITICAL ladder.

---

## 2. P1 — palette rule violations (model quality rendered as bullish market direction)

The house rule is codified in this repo, twice, in the very file that then gets it right:

`src/pages/proveit/ProveIt.tsx:126-129`
```
/* Hit rate is model QUALITY, not market direction, so a strong composite
   takes the holo select accent and never bull green — the same
   correction the earnings board made for cheap vol. Green on this grid
   is reserved for the two directional cards above it. */
```
`src/pages/proveit/ProveIt.tsx:216-218`
```
{/* Select, not bull: an engine hitting 65% is a statement about the
    engine, and a green number beside a call it got right would
    read as the tape going up. */}
```

Every finding below is that rule being broken, mostly within 200 lines of where it is written.

### D‑09 (P1) The hit‑rate sparkline directly under the "never green" comment is green

`ProveIt.tsx:224`
```
<Sparkline data={m.trend} up={m.trend[m.trend.length - 1] >= m.trend[0]} width={120} height={22} label="hit rate" />
```
`src/components/compass/Sparkline.tsx:26` — `const color = up ? BULL : BEAR;` (BULL = `#30D158`).
Its hover readout (`Sparkline.tsx:53`) prints the delta in `text-bull`/`text-bear`.

Measured on screen (`pi-models-d-f2.png`): **both** engine sparklines render green, including
`Sweep prints` at **47% hit rate with `edge +0 bps/signal`** — a below‑coin‑flip engine with zero
edge, drawn in the colour the product reserves for the tape going up.

**Fix:** give `Sparkline` a `tone` prop (`'direction' | 'quality'`); pass `'quality'` here so the
line takes `FOCUS`/select silver rising and `textMuted` falling.

### D‑10 (P1) Market‑State Replay paints calibration, out‑of‑sample stability and match quality bull green

`src/components/proveit/MarketStateReplay.tsx`:

| Line | What it colours green | Why that's wrong |
|---|---|---|
| `:35-40` | `matchTone = { TIGHT: 'bull', STRONG: 'select', LOOSE: 'warn', WEAK: 'bear' }` | the *same metric* uses `select` for one grade and `bull` for the better one |
| `:274` | `Recent half` — `Math.abs(oos.degradationPts) <= 5 ? 'bull' : 'warn'` | OOS stability is model quality |
| `:364`, `:369` | calibration panel + badge — `calibrationErrorPct <= 6 ? 'bull' : 'warn'` | calibration error is model quality |
| `:422`, `:439` | OOS panel + the 2xl number | same |

Measured on screen (`pi-models-d-f2.png`): `MATCH QUALITY  TIGHT 85%` renders green.

This is doubly unfortunate because the *prose* on this component is the most honest text on either
desk — `src/data/statereplay.ts:452`: *"that agreement is what a working sampler looks like — it says
the panel above is internally consistent, not that the model has been proven right."* The words say
"not proven right"; the colour says "the market is going up".

**Fix:** replace `'bull'` with `'select'` at `:37, :274, :364, :369, :422` and `text-bull` with
`text-select` at `:439`.

### D‑11 (P1) A positive variance risk premium is painted bull green

`src/components/gex/StatePriceDensity.tsx:194` — `const vrpTone: Tone = view.vrpVolPts >= 0 ? 'bull' : 'warn';`
rendered at `:219` (`VARIANCE RISK PREMIUM +3.1 vol · IV 17.6 vs RV 14.5`) and `:398`.
Screenshot `pi-density-d-f1.png`.

A positive VRP means options are rich versus realised. That is a statement about option pricing, not
about the tape going up. ProveIt.tsx's own comment cites "the same correction the earnings board made
for cheap vol" as the precedent — the correction was never applied here.

**Fix:** `vrpVolPts >= 0 ? 'select' : 'warn'`.

### D‑12 (P1) The Greeks matrix legend is false for six of its eight columns

`GreeksRegime.tsx:239` — panel subtitle: *"net dealer $ by strike — **green supports, red amplifies**"*.
`GreeksRegime.tsx:45-57` `GreekCell` paints every column with the same green/red ramp
(`rgba(48,209,88,…)` / `rgba(255,59,48,…)`).

The columns are `delta, gamma, vanna, charm` by default and `+ vomma, speed, color, ultima` under
`Advanced greeks` (`greeksmatrix.ts:25-33`). "Green supports / red amplifies" is a statement about
**gamma sign only**. Applied to a charm cell of `−1.6B` at strike 510 (`pp-greeks-d-f1.png`) it means
nothing.

The repo already knows this. `src/components/gex/palette.ts:39-41`:
```
// Charm needs its own axis, not a borrowed one. It used to paint blue/gold,
// which is the gamma-sign pair, so a charm panel and a gamma panel side by side
// said opposite things in the same two colours.
export const CHARM_POS = FLIP;  // cyan
export const CHARM_NEG = KING;  // magenta
```
`CHARM_POS`/`CHARM_NEG` are imported by exactly one file (`components/gex/GradientChart.tsx:7`).
Neither Greeks sub‑view uses them: `GreeksRegime.tsx:51` and `VannaCharm.tsx:132` both use the
bull/bear pair for charm.

**Fix:** either narrow the subtitle to the gamma column and give the other columns a neutral
diverging ramp, or route charm/vanna through `CHARM_POS/CHARM_NEG` as `palette.ts` intends.

### D‑13 (P1) Dealer gamma sign is painted green/red everywhere, contradicting the repo's own token pair

`palette.ts:31-36`:
```
// Dealer-gamma sign. The house reads gold = SHORT gamma (dealer hedging
// amplifies the move) and blue = LONG gamma (dips get absorbed).
export const SHORT_GAMMA = '#E0B84E';
export const LONG_GAMMA  = '#5EA0EF';
```
`PositioningMap.tsx` honours it (`:137, :166, :481, :569, :617`). The Pinpoint *pages* do not:

- `GammaChart.tsx:82, 88` — `longGamma ? 'text-bull' : 'text-bear'` on the headline number **and** the badge
- `ComplexBoard.tsx:91, 94` — same, on all four board columns
- `GreeksRegime.tsx:226` — `Net gamma` StatCard `tone={netByGreek.gamma >= 0 ? 'bull' : 'bear'}`
- `Surface3D.tsx:169-174` — legend swatches `bg-bull/90 "dealer support"`, `bg-bear/80 "negative gamma"`

Long gamma is not bullish — a long‑gamma book pins *in either direction*. On `/pinpoint/levels`
the Positioning Map (blue/gold) sits ~500px below the Exposure rail (green/red) describing the same
quantity in two colour languages on one scroll.

**Fix:** move the four page‑level call sites onto `LONG_GAMMA`/`SHORT_GAMMA`, matching PositioningMap.

### D‑14 (P2) Non‑directional quantities painted as direction — the remaining set

| File:line | Quantity | Colour | Why it isn't direction |
|---|---|---|---|
| `RankedTargets.tsx:66-78` | rank movement vs last scan (▲▼) | bull / bear | rank change is *process state* — the house reserves silver/select for that |
| `GreeksRegime.tsx:38-43` | `regimeTone['CONTROLLED TREND'] = 'bull'` | green | a controlled trend can be a controlled *down*trend |
| `GreeksRegime.tsx:398` | `Dist` column (`distPct >= 0 ? 'text-bull' : 'text-bear'`) | green above spot / red below | this is geometry, not direction — measured on `pp-greeks-d-f1.png`: `+1.8%` green, `−0.2%` red on rows of the same book |
| `VannaCharm.tsx:132, 178` + `pp-greeks-migration-d-f2.png` | Δ net GEX under charm decay | green / red | at strike 500, `−482.3M → −339.6M` (short gamma *shrinking*) is green; at 505, `+291.1M → +228.7M` (long gamma shrinking) is red. Same physical process, opposite colours |
| `VolLab` regime ribbon (`pi-volatility-d-f1.png`) | `LOW VOL` band | green | vol regime is not market direction |
| `HedgeImpact.tsx:26-31` | `stressTone['LIGHT'] = 'bull'` | green | defensible as a severity ramp; flagged for completeness only |

---

## 3. P1/P2 — charts that carry no information, and dimensions that are decoration

### D‑15 (P1) "Vanna shock" is a straight line — measured deviation 0.042 px

`/pinpoint/greeks`, panel `VANNA SHOCK · dealer hedge from an IV move, not a price move`.

`src/data/greeksmatrix.ts:195-198`
```
for (let v = -3; v <= 3; v += 0.5) vannaShock.push({ volShockPct: v, hedgeUsd: vannaTotal * v });
```
It is `y = k·x` by construction. Measured in the live SVG (`g5354_hex.mjs`): 13 points, **maximum
deviation from the straight line through the endpoints = 0.042 px** on a 150 px‑tall plot (0.03% of
plot height). Visible in `pp-greeks-d-f2.png` — a ruler‑straight diagonal.

Its single degree of freedom, `vannaTotal`, is already printed verbatim two panels above as
`VANNA / +1% IV  −22M`. The chart is a ~800×200 px restatement of one number.

The companion `CHARM CLOCK` (`greeksmatrix.ts:181-189`, `deltaShift = charmTotal · frac^2.2`) has
measured deviation 40 px so it is at least curved — but its **shape is invariant**: every ticker,
every session, the identical `frac^2.2` curve, scaled by `charmToClose`, which is also printed on
the rail above.

**Fix:** replace both with one panel that actually varies — e.g. the per‑strike vanna profile the
matrix already holds (`view.rows[].vanna`), so the chart shows *where* the vol‑driven hedge lands,
not just how big it is.

### D‑16 (P1) The Prove It "Dealer surface" expiry axis is near‑redundant, and its dollar readout mixes units

`/prove-it?view=models`, panel `DEALER SURFACE · net exposure · strikes × expiries × GEX`
(`pi-models-d-f1.png`).

`StrikeNode` (`src/types/market.ts:58-74`) has **no expiry dimension** — the chain is single‑expiry.
`Surface3D.tsx:47-57` fabricates 11 expiry rows:
```
const decay = Math.exp(-e * 0.32);
const z = (n.netGex / maxAbs) * decay + (n.vanna / maxAbs) * (1 - decay) * 0.35;
```

Measured from the rendered 11×24 cell grid (`g5354_measure.mjs` step B, reading each cell's computed
`background-color`):

| Metric | Value |
|---|---|
| corr(row 0, row 10) across strikes | **0.873** |
| corr(row 0, row 5) | **0.977** |
| mean within‑column SD (down expiry) | **0.063** |
| mean within‑row SD (across strikes) | **0.144** |
| strike columns where the sign flips down the expiry axis | **0** |

The vertical axis is 2.3× less variable than the horizontal one and never changes sign: it is a
strike profile with a monotone fade applied. The brief's "not a generic rotating 3D mountain" test is
passed on *presentation* (2D is the default, 3D is an explicit toggle — good), but failed on
*content*: the second axis is decoration.

Separately, the hover readout is a **unit error**. `Surface3D.tsx:186-190` prints
`fmtUsd(Math.abs(hover.z * maxAbsUsd))` where `maxAbsUsd = max |netGex|`, and labels it
"dealer support · long γ". For far rows, `z` is dominated by the `vanna` term — a vanna quantity
scaled by a *gamma* maximum and printed as GEX dollars.

**Fix:** drop the synthetic axis and make the panel a strike × **greek** heat grid
(gamma / vanna / charm / delta per strike) — every value already exists in `snapshot.chain`, every
cell then has a true unit, and the surface stops claiming a term structure it does not have.

### D‑17 (P1) The History desk stamps a US session in the browser's timezone

`/pinpoint/history`, `pp-history-d-f1.png`. The desk shows:

- `SESSION  Mon, Aug 3 · **Regular 09:30–16:00**`
- scrubber axis `12:21 … **18:50**`, `SHOWING AS OF 18:50`
- app header clock `14:50 ET`

`src/data/gexhistory.ts:53`
```
return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
```
`getHours()` is browser‑local. In this container (UTC) the desk renders a session it labels
09:30–16:00 as running 12:21→18:50, and disagrees with its own page header by four hours. The same
axis appears on `/pinpoint/greeks?view=migration` → `WALL DRIFT` (`12:21 14:00 15:36 17:15 18:50 now`,
`pp-greeks-migration-d-f2.png`) — a panel whose whole subject is "into the close".

`ExposureProfile.tsx:68` and `RankedTargets.tsx:135` use `toLocaleTimeString('en-GB')`, so the
`scan HH:MM:SS` stamps on Levels and Ranked drift the same way.

**Fix:** one `fmtEt()` helper using `toLocaleTimeString('en-US', { timeZone: 'America/New_York' })`,
used by every session‑relative timestamp in the section — the header clock already does this.

### D‑18 (P2) The scoreboard's `scope` field is computed and never rendered, while the page claims it is

`src/core/quant.ts:169, 207, 223` define and populate `ModelRow.scope`
(`'headline lean vs next-session move'`, `'print side vs the next 30 bars'`).
`src/core/quant.test.ts:215, 227, 234` assert on it as "rendered".
`ProveIt.tsx:212-230` renders `m.model`, `m.hitRatePct`, `m.sample`, `m.trend`, `m.edgeBps`, `m.note`
— **not** `m.scope`.

Meanwhile `ProveIt.tsx:242-244` tells the reader: *"every row names the population it was scored on"*.
It does not; the `note` describes provenance, not the scoring population.

**Fix:** render `m.scope` as the row's sub‑line under the model name (it fits — see D‑21).

---

## 4. GATE 13 — unexplained empty regions (measured)

Method: for each panel, build a 24×24 occupancy grid from every leaf element that carries text, a
non‑transparent background, or is an SVG/canvas primitive; find the largest all‑empty rectangle
(`g5354_empty.mjs`). Reported where the empty rect is ≥140×90 px **and** ≥22% of its panel.

### Desktop, 1440×900

| Route | Empty box | % of panel | Panel | Doc position | Screenshot |
|---|---|---|---|---|---|
| `/prove-it?view=models` | **829 × 210 px** | **58%** of 1380×210 | `MODEL SCOREBOARD` | x=576 y=851 | `pi-models-d-f2.png` |
| `/prove-it?view=models` | **567 × 214 px** | **42%** of 567×514 | `MARKET-STATE FINGERPRINT` | x=840 y=1531 | `pi-models-d-f2.png` |
| `/pinpoint/greeks?view=migration` | **567 × 223 px** | **58%** of 567×383 | `MIGRATION READ` | x=840 y=742 | `pp-greeks-migration-d-f1.png` |
| `/pinpoint/levels` | **864 × 122 px** | **34%** of 1382×225 | `POSITIONING INSIGHT` | x=542 y=1242 | `pp-levels-d-f2.png` |
| `/pinpoint/history` | 749 × 104 px | 23% of 1382×250 | `SESSION REPLAY` | x=370 y=356 | `pp-history-d-f1.png` |
| `/pinpoint/history` | 150 × 196 px | 22% of 450×294 | `HOW STRUCTURE MOVED` | x=1050 y=617 | `pp-history-d-f1.png` |

The scoreboard one is the worst and has an exact cause — `ProveIt.tsx:211`:
```
<div className="grid grid-cols-1 lg:grid-cols-5 gap-px bg-borderSubtle">
  {scoreboard.map(m => ( ... ))}
```
`modelScoreboard()` (`quant.ts:317`) returns **2** rows (`gradeCatalystModel`, `gradeSweepPrints`)
and `grade()` can return `null`, so the maximum this grid can ever hold is 2 — against 5 declared
columns. Three of five columns are permanently empty on every desktop load. At 390px the grid
collapses to `grid-cols-1` (measured: `346×380`, `gridTemplateColumns: "346px"`, 2 children) so the
defect is desktop‑only.

`MIGRATION READ` renders three bullet lines in a panel stretched to match the taller
`EXPOSURE MIGRATION MAP` beside it. `LEVEL SHIFTS` directly above it is degenerate in a different way:
all four rows read `holds` with identical NOW → SCENARIO pairs (`505→505`, `502.50→502.50`,
`500→500`, `500→500` — and rows 3 and 4 are the *same strike*, since KING = PUT WALL today), so a
panel titled "where the structure moves" states four times that nothing moves.

### Mobile, 390×844

The mobile hits are all prose panels stretched taller than their text:

| Route | Empty box | % of panel | Panel |
|---|---|---|---|
| `/prove-it?view=models` | 348 × 280 | 88% | `HOW THIS READS` (y=4842) |
| `/prove-it?view=models` | 348 × 185 | 83% | `HOW TO READ THIS` (y=5175) |
| `/prove-it?view=models` | 348 × 175 | 63% | `THE RECEIPTS` (y=2288) |
| `/prove-it?view=density` | 348 × 228 | 83% | `DENSITY READ` (y=633) |
| `/prove-it?view=density` | 348 × 185 | 83% | `BEYOND THE SMILE` (y=2755) |
| `/pinpoint/stress` | 348 × 185 | 83% | `BEYOND GEX` (y=1756) |
| `/pinpoint/stress` | 261 × 136 | 75% | `HEX READ` (y=569) |
| `/pinpoint/stress?view=fracture` | 348 × 169 | 83% | `BEYOND GEX` (y=3250) |
| `/pinpoint/stress?view=fracture` | 261 × 115 | 75% | `THE READ` (y=569) |
| `/pinpoint/greeks?view=migration` | 232 × 128 | 56% | `NET GEX SIGN` legend strip (y=409) |

These are lower‑confidence than the desktop set: the detector measures the largest empty rectangle,
and a left‑aligned paragraph in a wide panel legitimately leaves one. I did **not** confirm each of
these visually. The two I did confirm are `HEX READ` and `THE READ` — a one‑ or two‑line banner in a
panel with `py-3.5` padding at 390px, which is ordinary breathing room, not a defect. Treat the
mobile table as **not actionable without a visual pass**; the desktop table above is confirmed
against screenshots.

**Fix (the one that matters):** `ProveIt.tsx:211` — `lg:grid-cols-5` → `sm:grid-cols-2` and let the
grid grow with `scoreboard.length`, or give the panel a `md:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]`.

---

## 5. GATE 17 — dominant object / current state / conclusion / invalidation / next action

Read as a first‑time user with a stopwatch, at 1440×900, above the fold.

| View | Dominant analytical object | Current‑state object | Main conclusion | Risk / invalidation | Next action |
|---|---|---|---|---|---|
| `gamma` | ✅ Gamma Heatmap (strike × expiry) | ✅ level chips + spot rule + `$503.90` header | ✅ "pinning — dealers dampen moves" — but **wrong** (D‑01) | ❌ absent | ❌ absent |
| `gamma?complex` | ❌ four co‑equal matrices, no dominant | ✅ per‑ticker header row | ❌ **absent** — the view has no read line at all | ❌ absent | ❌ absent |
| `levels` | ⚠️ two co‑equal panels (Exposure Matrix ‖ Positioning Map) | ✅ spot rule in both | ✅ `POSITIONING INSIGHT` | ❌ absent | ⚠️ `View on chart` — only appears *after* a strike is clicked |
| `levels?ranked` | ✅ the ranked table | ✅ `Dist` column + spot | ✅ `PRIMARY TARGET 500 · 79/100` | ❌ absent | ✅ row click → flash on `/pulse` |
| `greeks` | ✅ Greek exposure matrix | ✅ inline SPY spot rule | ✅ `DEALER REGIME` card | ✅ **`WHAT FLIPS IT`** — the only explicit invalidation in Pinpoint besides Fracture | ❌ absent |
| `greeks?migration` | ✅ Exposure Migration Map | ⚠️ `FLIP 502.50` rule only; no spot marker | ✅ `MIGRATION READ` bullets | ❌ absent | ❌ absent |
| `stress` | ⚠️ split between the 4 window rows and the HEX curve | ✅ HEX 15‑min card | ✅ `HEX READ` banner | ⚠️ `FAILURE BOUNDARY 9.75%` exists as a number but is **not drawn** (D‑06) | ❌ absent |
| `stress?fracture` | ✅ Reflexive Cascade fan | ✅ `FRACTURE LINE −1.2% away` | ✅ `THE READ` banner | ✅ **`INVALIDATION $497.85 — thesis voids while price holds above`** — best on either desk | ❌ absent |
| `history` | ✅ Level Migration Timeline | ✅ scrubber + `SHOWING AS OF` | ✅ `HOW STRUCTURE MOVED` narrative | ❌ absent | ❌ absent |
| `prove-it?models` | ✅ Monte Carlo cone | ✅ spot line on the cone | ✅ `THE RECEIPTS` / `HOW TO READ THIS` | ⚠️ the cone *is* an uncertainty object, but nothing states what would invalidate the run | ❌ absent |
| `prove-it?volatility` | ❌ four co‑equal quadrants | ✅ ATM marker / spot line | ❌ **absent** — no read line anywhere on this view | ❌ absent | ❌ absent |
| `prove-it?density` | ✅ State‑Price Density | ✅ `SPOT 503.90` line | ✅ `DENSITY READ` | ❌ absent | ❌ absent |

**Score: 12 views. Dominant object clear on 8. Conclusion present on 10. Invalidation present on 2.
Next action present on 2.**

The systematic gap is the last two columns. Two views (`gamma?complex`, `prove-it?volatility`) fail
on three of five and are the only views in the section with **no sentence of conclusion at all** —
`ComplexBoard.tsx` renders one micro caption ("4 names · net gex by strike × expiry · scroll for
more →") and nothing else; `VolLab` renders four panels and no read.

---

## 6. Gates 53 / 54 — does each desk have a signature?

### Pinpoint — YES, and it uses real product data

The signature is **cross‑panel strike lock**: hover any strike in the Exposure Matrix and it mirrors
in the Positioning Map and the Exposure Ledger; click and it pins in select‑silver, opens the
per‑strike put/call/net detail bar, and offers `View on chart`. State is
`hoverStrike`/`selectedStrike` in `ExposureProfile.tsx:47-48`, threaded into three components. It
reads `snapshot.chain` — real product data, not decoration.

Two supporting signature mechanics, both measured working:
- **Expiry spotlight** on the Gamma Heatmap — verified in the live DOM: clicking `AUG 5` sets
  non‑selected expiry cells to `opacity: 0.35` and holds the selected column at `1.0` across 126
  cells.
- **Session replay** on History — a scrubber over 45 snapshots with 12 structural‑event ticks
  (net‑GEX sign flips, flip crosses), driving a level‑migration timeline of call wall / flip /
  put wall / king vs spot. This is the most distinctive object in the section.

Where it falls short of the brief: **exposure concentration** is legible (the heatmap and king
strike), **spot/strike** legible, **regime transition** partly (`WHAT FLIPS IT`, Fracture's
invalidation), **dealer‑sign sensitivity** legible on Migration (`?view=migration` scenario toggles).
**Expiration is fabricated** (D‑16) and **uncertainty is either absent or fake** (D‑03) on eight of
nine views — Fracture's observed/assumed confidence tiers
(`Fracture.tsx:397-465`, `ConfidenceChip`) are the only genuine uncertainty representation in
Pinpoint, and they are on the one view a reader is least likely to reach.

### Prove It — PARTIALLY. It shows failure; it has no lifecycle.

It does **not** only show flattering simulations. `Sweep prints` posts **47% hit rate, edge +0
bps/signal, n=840** and stays on the board (`pi-models-d-f2.png`), with a note that says so
explicitly. `grade()` (`quant.ts:207-212`) drops an engine whose population is under `MIN_CALLS`
rather than rounding it up, and `composite` prints `—` on an empty board (`ProveIt.tsx:145-147`).
Calibration is present (`MarketStateReplay` calibration curve, `calibrationErrorPct`), sample size is
present (`n=4536`, `n=840`, `141 closest of 176 synthesized`), and economic value is present
(`edge bps/signal`, `EXPECTANCY +0.05R`, `EDGE DECAY` panel). That is a real validation chamber.

What is missing is exactly the brief's other half — models that **stay shadowed, get promoted or
retire**. There is no such state anywhere. The two `MODEL SLAYER-VOL v0.2` /
`MODEL SLAYER-DENSITY v0.1` chips are hard‑coded strings (`VolLab.tsx:144`,
`StatePriceDensity.tsx:202`), not model state. No engine is ever marked shadow, promoted or retired;
the board is a flat list of two.

**Proposed signature mechanism — the Shadow Book (one mechanism, no new data).**

`grade()` already builds, per engine, a chronologically ordered `resolved: ScoredCall[]` array
(`quant.ts:210`) with `{order, side, movePct}` per call, and already slices it into `TREND_BLOCKS`
hit‑rate blocks (`quant.ts:214-219`). Everything needed is in that array and is thrown away today.

Render one shared chart: **cumulative edge in bps per engine against call index**, with a horizontal
promotion band. An engine's line is drawn in:
- **select silver** while its trailing‑block edge is above the band → `LIVE`,
- **grey** while it is inside the band → `SHADOWED`,
- **amber** on the block where it crosses down, and the line **terminates** there → `RETIRED`.

The band itself is the no‑edge baseline the desk already computes
(`statereplay.ts:346` `edgePts = targetPct − baselineTargetPct`). Clicking an engine's line filters
the `MODEL SCOREBOARD` and the `ASSUMPTIONS` drawer to that engine's population — which also fixes
D‑18 (the unrendered `scope`) and D‑09 (the green sparkline disappears, replaced by a line whose
colour *is* the lifecycle state, in select/grey/amber, never bull green) and fills the 829×210 px
hole measured in §4.

Sources, all existing: `src/core/quant.ts` `grade()` `resolved` array + `trend` blocks;
`src/data/statereplay.ts` `baselineTargetPct`. No new data, no new package.

---

## 7. GATE 63 red‑team — what survives a logo swap

Things on these desks that would look at home in any generic finance product:

1. **The stat rail.** 8 of 12 views open with an identical 4–6 card `MetricGrid min="170px"` row
   (`ExposureProfile.tsx:4`, `GreeksRegime.tsx:5`, `HedgeImpact.tsx:5`, `Fracture.tsx:5`,
   `ProveIt.tsx:6`, `StatePriceDensity.tsx:5`, `MarketStateReplay.tsx:6`, `GexHistory.tsx:5` — grep
   `<StatCard` counts). `/prove-it?view=models` renders **two** such rails, 12 stat cards on one
   scroll (`pi-models-d-f1.png` + `-f2.png`). Label/value/sub in a bordered box is the single most
   portable pattern in fintech; swap the strings and this is any dashboard. It is also directly the
   "KPI tile wall" the brief rules out as a *proposal* — it is already the section's default opening
   move.
2. **The Monte Carlo fan + terminal histogram** (`MonteCarloPanel`, `pi-models-d-f1.png`). A GBM
   cone with 90%/50% bands, a median line and a green/red terminal histogram is in every retail
   options tool shipped since 2015. The `ASSUMPTIONS` disclosure is the one genuinely Slayer thing
   about it.
3. **The Volatility Lab four‑up** (`pi-volatility-d-f1.png`): IV surface / term structure with
   1D‑1W‑1M history / risk‑neutral distribution / vol‑state ribbon. This is the standard
   OptionMetrics-era layout. Nothing on this view is dealer‑positioning‑specific, no panel carries a
   read line, and its two headline panels disagree by 2× (D‑04). It is the weakest view on either
   desk.
4. **The Vanna shock panel** — a titled, axis‑labelled, hover‑enabled ~800×200 px panel containing a
   perfectly straight line (measured 0.042 px deviation, D‑15). A chart whose only job is to occupy
   the space where a chart goes is the definitional generic‑product artefact.
5. **The Ranked Targets table** — an 8‑column sortable table with a 0–100 score and a progress bar.
   Structurally a screener. Compounded by the score being unexplained: `COLUMNS`
   (`RankedTargets.tsx:86-96`) attaches a `TERMS` tooltip to `Dist`, `NBR`, `OI` and `Class` and
   **none** to `Score`, while `rankedtargets.ts:91` weights it
   `0.4·gexN + 0.22·oiN + 0.22·nbrN + 0.16·proxN` — a reader cannot find out why 500 scores 79.
6. **The `MODEL SLAYER-VOL v0.2` chips** — versioning as branding. Hard‑coded strings
   (`VolLab.tsx:144`, `StatePriceDensity.tsx:202`) with no model state behind them.

Things that would **not** survive a logo swap, and should be protected:

- Fracture's **forced‑flow balance sheet** with observed/assumed confidence tiering
  (`Fracture.tsx:397-465`) — "who is forced, and how knowable each one is", with a bar ordered
  most‑knowable → most‑assumed. Nothing generic looks like this.
- History's **level‑migration timeline** with structural‑event ticks (`pp-history-d-f1.png`).
- The **GEX heatmap** with king/wall/spot rules and the expiry spotlight (`pp-gamma-d-f1.png`).
- Fracture's explicit **INVALIDATION** card.

---

## 8. Remaining P2 / P3

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| D‑19 | P1 | **Touch targets below WCAG 2.2 §2.5.8 (24×24) at 390×844.** Ranked Targets sort headers measure `STRIKE 151×15`, `SCORE 58×15`, `DIST 44×15`, `NBR 37×15`; footer links `DISCLAIMER 65×15`, `TERMS 33×15`, `PRIVACY 46×15`. Expiry chips are `47×24` — exactly at the floor. Segmented controls are `×28`. | `g5354_final.mjs` step 4 |
| D‑20 | P2 | **The leading regime is the quietest bar.** `PINNED / CHOPPY 37%` renders `bg-white/40` (`rgba(255,255,255,0.4)`); runner‑up `UNSTABLE BREAKOUT 28%` renders full‑saturation `bg-warn` `rgb(255,149,0)`. The #2 answer is visually louder than the #1. | `GreeksRegime.tsx:325-329`; measured bar styles in `g5354_hex.mjs`; `pp-greeks-d-f2.png` |
| D‑21 | P2 | **StatCard sub‑line truncated.** `unweighted mean of 2 engine hit rates` needs 215 px, gets 190 px, renders `…engine hi…`. | measured `scrollWidth 215 / clientWidth 190`; `pi-models-d-f1.png` |
| D‑22 | P2 | **Density legend describes half its marks with the wrong colour.** Legend is a single `bg-bear/20` swatch labelled `2σ tails` (`StatePriceDensity.tsx:252`) but the chart paints the left tail `rgba(255,59,48,0.06)` and the right tail `rgba(48,209,88,0.06)` (`:68-70`). The green region has no legend entry and the red swatch names it. | `pi-density-d-f1.png` |
| D‑23 | P2 | **`LEVEL SHIFTS` is degenerate and duplicated.** All four rows read `holds` with identical NOW→SCENARIO values, and two of them are the same strike (KING 500 = PUT WALL 500). A panel titled "where the structure moves" reports four times that nothing moves. | `pp-greeks-migration-d-f1.png` |
| D‑24 | P2 | **Ranked `pressure` is side‑of‑spot, not a dealer read.** `rankedtargets.ts:123` `pressure: n.strike >= spot ? 'RESISTANCE' : 'SUPPORT'` — the hover readout paints it bull/bear as though it were derived from positioning. | `RankedTargets.tsx:345` |
| D‑25 | P3 | **Dead computation.** `greeksmatrix.ts:149-150` computes `trendUp` then discards it with `void trendUp;`. | `src/data/greeksmatrix.ts:150` |
| D‑26 | P3 | **Fracture has zero controls.** The section's deepest analytical view exposes only the 2 sub‑toggle buttons — no scenario, no level filter, no path‑count control, on a view built around a 500‑path simulation. | interaction probe, `/pinpoint/stress?view=fracture` |
| D‑27 | P3 | **`scrollable-region-focusable`** — one node on `/pinpoint/greeks` @390 (the matrix `overflow-x-auto` wrapper has no `tabindex`). The only axe violation in 24 route×viewport runs. | axe‑core, `shots2.json` |

---

## 9. What I could not verify

- **Ticker sensitivity.** The top‑bar ticker switcher could not be driven from Playwright (the
  option list did not resolve for QQQ/NVDA; AAPL worked once). Every cross‑desk contradiction above
  (D‑01) is reproduced on **SPY only**. `exposure.ts:105-107` states the sign disagreement affected
  "two of sixteen tickers" historically; I could not measure today's rate across the 4‑name watchlist.
- **History playback.** The `0.5× / 1× / 2× / 4×` speed buttons produced no DOM change while paused,
  which is expected. I did not verify that they change the frame rate **during** playback.
- **3D surface.** The `3D` toggle mounts `DealerSurface3D` (WebGL). It rendered without error, but I
  did not measure its readability, its drag/zoom behaviour, or whether the same
  expiry‑axis redundancy (D‑16) is visible in the 3D view.
- **Mobile empty regions.** The 390×844 rows in §4 were measured but **not** confirmed against
  screenshots; the two I did check were legitimate padding. Do not act on that table without a
  visual pass.
- **CSV export.** `EXPORT CSV` on the Exposure Ledger produced no DOM change (expected for a
  download). I did not capture or inspect the file.
- **Focus‑mode overlay content.** `Focus this panel` was confirmed to open and to widen the Gamma
  matrix from ±10 to ±20 strikes. I did not audit the overlay's own layout, keyboard trap, or
  Escape behaviour.
- **Colour contrast.** Not measured on these desks in this pass — axe's colour‑contrast rule reported
  no violations, but low‑opacity heat fills (`rgba(48,209,88,0.06)` floors) are outside what axe
  evaluates for text.
