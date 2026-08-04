# 04 — The metric dictionary

**Gates 7 (metric dictionary) and 27 (uncertainty)** · Slayer Terminal · audit date 2026-08-03

Method: static read of `src/core` + `src/data` + every consuming component, plus **executed measurement**.
Every engine in this app is a pure function of `(ticker, spot, day)`, so the numbers below were produced by
importing the real modules under `tsx` and printing what they return — not by reading the arithmetic and
estimating. Scratch scripts (re-runnable):

```
/tmp/claude-0/-home-user-slayersfinal/61510a72-f878-56b9-9620-dab6cb6adbf2/scratchpad/m1.ts … m10.ts
npx tsx <path>          # from /home/user/slayersfinal
```

`m1` bias/net-GEX on the watchlist · `m2` same across all 192 universe names · `m3` two pricers, one contract ·
`m4` pin window + IV-rank + expected-move divergence · `m5` chain health/momentum/action · `m6` sleeve stamp vs
priced DTE, and the two clocks · `m7` score/confidence/health correlation + the landing card · `m8` theta ·
`m9` take-profit ladder · `m10` three IV ranks.

---

## 0. Headline

The engines are individually careful — `optionTime.ts`, `calendar.ts` and `gex.ts:buildLevels` exist
specifically to stop two panels answering one question twice, and the comments show that fight being won
repeatedly. The failure is one layer up: **the same English word is bound to different quantities on
different desks, and nothing in the codebase owns the vocabulary.**

Measured, right now, on this build:

- **"IV Rank"** is three unrelated hashed numbers. MSFT reads **16** on the Compass Weigher, **70** on
  Prove It's Vol Lab, **96** on the Earnings Hub — simultaneously, same session, same glossary tooltip.
- **"Expected move"** (30-day, ±1σ, % of spot) on two sibling views of *one* desk: META **26.97 %**
  (`/prove-it?view=volatility`) vs **3.41 %** (`/prove-it?view=density`). 7.9× apart, one tab click apart.
- **The same option contract carries two mids on one page.** QQQ 443C LEAPS is **$31.87** on the Compass
  setups board and **$66.27** in the Compass Weigher — 2.08×. Two pricers, two IVs, one tab strip.
- **"NET $…"** in the positioning-map header disagrees in *sign* with the BULLISH/BEARISH badge printed
  immediately to its left on **18 of 192** names. META: badge `BEARISH`, number `+$89.8M` in long-gamma blue.
- **"Off-exchange share … of today's volume"** on the Dark Pool desk is `hRange(seed, 34, 52)` — a hash of
  the ticker and the date, with no volume input anywhere in the call graph.

Uncertainty (Gate 27) is the second gap: every probability this terminal publishes from a Monte Carlo is
rendered as a bare integer, and in one case the colour threshold sits inside the sampling error.

---

## 1. How to read the table

| column | meaning |
|---|---|
| **Name as shown** | the literal string the UI renders next to the number |
| **Definition** | what the code actually computes |
| **Unit / horizon** | including the clock (calendar-365 vs session-252) where it matters |
| **Source** | `file:line` of the computation, not the type |
| **Cadence** | `tick` ≈ 1.5 s (`simulator.tick`) · `sweep` = 10 s (`SCAN_EPOCH_MS`) · `day` = re-rolls at local midnight (`dayKey()`) · `static` = fixed seeds, never changes |
| **Kind** | **observed** (counted off a series this app holds) · **modeled** (closed-form from a model) · **inferred** (derived from a modeled quantity by a heuristic) · **simulated** (a hash draw standing in for a feed) |
| **Unavailable?** | can it legitimately be absent / null / zero |
| **Screens** | routes that render it |

Nothing in this terminal is *observed from a market*. "Observed" below means observed off the simulator's own
generated series — which is the strongest provenance any number here has.

---

## 2. Dictionary

### 2.1 `core/simulator.ts` — the book everything else reads

| Name as shown | Definition | Unit / horizon | Source | Cadence | Kind | Unavail. | Screens |
|---|---|---|---|---|---|---|---|
| Spot / price | `TickerConfig.currentPrice`, random-walked per tick, clamped ±2 steps | $ | `simulator.ts:549-556` | tick | simulated | no | all desks |
| Change % | `(current − base)/base` | % vs *reference*, not vs prior close | `simulator.ts:601`, `662` | tick | simulated | no | TopBar, Pulse, ComplexBoard |
| RSI | Wilder-ish 14 over the 100-tick buffer | 0–100 | `simulator.ts:311-323` | tick | observed (of the tick buffer) | no | Compass scoring, Fracture, Greeks |
| EMA 9/21/50 | recursive EMA over the same buffer | $ | `simulator.ts:300-308` | tick | observed | no | trend lean everywhere |
| Squeeze | 20-tick σ < 0.72 × full-buffer σ | bool | `simulator.ts:330-336` | tick | observed | no | Compass IV base, density |
| Call/Put OI | `20000·e^(−(15·dist)²)` × pivot skew × per-strike hash, ×2.2 on 5-step grid | contracts | `simulator.ts:392-406` | static per day | simulated | no | chain, GEX, pin, ranked targets |
| Net GEX (per strike) | `(callOI·0.5 + putOI·−0.6)·100·γ·S²·0.01` | signed $ | `simulator.ts:421-424` | tick | modeled | no | every Pinpoint panel |
| Net DEX (per strike) | `callOI·100·Δc·S + putOI·100·Δp·S` | signed $ | `simulator.ts:429-431` | tick | modeled | no | exposure profile, greeks |
| Net VEX (per strike) | `(callOI·0.5 + putOI·−0.6)·100·vega` | $ per 1 % vol | `simulator.ts:433-435` | tick | modeled | no | exposure, GEX metric switch |
| Δ, Γ, vega, vanna, charm | Black–Scholes at `t = 0.003` (0DTE), `r = 0.05` | per-share | `simulator.ts:41-80`, `408` | tick | modeled | no | chain, greeks matrix |
| Support / resistance wall | argmax \|netGex\| strictly below / above spot | $ strike | `simulator.ts:468-477` | tick | modeled | no | levels rail, chart, exposure, fracture |
| Flip zone | first *upward* zero crossing of the 3-strike-smoothed net-GEX profile | $ strike | `simulator.ts:482-494` | tick | modeled | no | levels rail, fracture, greeks regime |
| Plan **score** | 50 ±20 EMA ±15 RSI ±15 gamma-side +10 squeeze, clamped [10,90] | 10–90 | `simulator.ts:496-512` | tick | inferred | no | (see §3.7 — not currently rendered) |
| Plan **confidence** | `50 + |score − 50| · 1.25` | 50–100 % | `simulator.ts:516` | tick | inferred | no | (see §3.7) |
| Tape order size / side | `rand()`-drawn per tick | contracts | `simulator.ts:582-594` | tick | simulated | no | Trace › Live Tape |

### 2.2 `core/optionTime.ts` + `core/calendar.ts` — the clocks

| Name as shown | Definition | Unit | Source | Cadence | Kind | Screens |
|---|---|---|---|---|---|---|
| DTE | calendar days to the resolved expiry | days | `calendar.ts:211` | day | modeled | everywhere |
| Sessions | trading days in `(today, expiry]`, holiday-aware | sessions | `calendar.ts:119-140`, `212` | day | modeled | pulseflow pricing, Weigher |
| `yearsToExpiry` | `max(dte/365, 0.5/252)` | years | `optionTime.ts:50` | — | modeled | contractScore, compass, structures |
| Expiry label / weekday | `MM/DD/YY` + `Fri` | — | `calendar.ts:209-210` | day | modeled | every contract chip |
| Market clock / phase | Intl ET formatter + holiday + early-close tables | HH:MM:SS | `calendar.ts:269-292` | 1 s | observed (wall clock) | TopBar |

### 2.3 `core/scanUniverse.ts` — the scan field

| Name as shown | Definition | Unit | Source | Cadence | Kind | Unavail. | Screens |
|---|---|---|---|---|---|---|---|
| Coverage pill `MODELED / COVERED / LISTING` | is the symbol in `TICKERS` / in `UNIVERSE` / neither | tier | `scanUniverse.ts:105-107`, meta `:86-90` | sweep | inferred | no | Compass setup card |
| Scan spot | live price if simulator holds it, else `base·(1+walk)` | $ | `scanUniverse.ts:272` | sweep | simulated | no | Compass board |
| Scan change % | live: vs `basePrice`; non-live: the walk itself | % | `scanUniverse.ts:267`, `282` | sweep | simulated | no | Compass group header |
| Trend up | hour momentum + ½ day direction off the closed-form walk | bool | `scanUniverse.ts:285` | sweep | inferred | no | scan lean |
| `nameEdge01` | `0.42·|chg|/2.5 + 0.30·(iv−0.15)/0.45 + 0.28·depth` | 0–1 | `compass.ts:411-416` | sweep | inferred | no | (internal, marks the score down) |
| Sparkline | same walk sampled backwards, 24 points over 6.5 h | $ | `scanUniverse.ts:328-338` | sweep | simulated | no | Compass group, Pulse registry |

### 2.4 `data/compass.ts` — the setups board

| Name as shown | Definition | Unit / horizon | Source | Cadence | Kind | Unavail. | Screens |
|---|---|---|---|---|---|---|---|
| **Score** | `round(clamp(rank, 8, 99))` where `rank = 96·(0.4+0.6·pref)·(aligned?1:0.72) + (edge−1)·8 + jitter±1.5` | 8–99 | `compass.ts:396-401`, `425-427` | sweep | inferred | no | Compass board/card/compare, Tracker |
| `rank` (never rendered) | the continuous ordering quantity | — | `compass.ts:378-401` | sweep | inferred | no | — (ordering only) |
| **Confidence** | `round(clamp((score − 55)·2.1, 5, 98))` — an affine transform of Score | 5–98 % | `compass.ts:660` | sweep | inferred | no | Tracker, landing |
| **Health** | `clamp(50 ∓ 900·moneyness, 22, 78) + fixed hash offset ±6` | 5–99 | `compass.ts:246-251`, `559` | sweep | inferred | no | setup card, contract chain |
| **Momentum** | `health ≥ 56 → STRENGTHENING`, `≥ 45 → NEUTRAL`, else `WEAKENING` | enum | `compass.ts:253-257` | sweep | inferred | no | contract chain |
| **Action** (`HOLD/REDUCE/SELL`) | the same two cuts on the same `health` | enum | `compass.ts:259-263` | tick | inferred | no | contract chain |
| **1σ Move / Exp. move** | `iv·√(yearsToExpiry(dte))·100`, `iv` = the *name's configured* IV, unskewed | % of spot, contract's life | `compass.ts:571` | sweep | modeled | no | setup card, board, compare, landing |
| Mid / Bid / Ask | `intrinsic + S·ivσ√t·0.4·e^(−m²/2)`; spread = `clamp(1.2 + 180·otm + urgency, 0.8, 7)` % | $ | `compass.ts:237-244`, `545-556` | sweep | modeled | no | board, card, compare, Tracker |
| `liveMid` | `mid·(0.9 + hash·0.2)` | $ | `compass.ts:557` | sweep | simulated | no | **deliberately unrendered** (`SignalMonitor.tsx:70`, `SetupCompare.tsx:218`) |
| Greeks Δ, Γ, vega | Black–Scholes via `Simulator.getGreeks` at the resolved DTE | per-share | `compass.ts:573` | sweep | modeled | no | card, landing, monitor |
| Greeks **θ** | `−(mid − intrinsic) / (2·max(0.5, dte))` — **not** Black–Scholes | $/day | `compass.ts:652` | sweep | inferred | no | card, landing, monitor |
| Greeks **IV** | the name's configured IV × 100, no skew | % annual | `compass.ts:654` | sweep | modeled | no | card, landing |
| Verdict `ENTER/WATCH/EXIT` | score ≥ 88 / ≥ 72 / else | enum | `compass.ts:575` | sweep | inferred | no | board, card |
| `topRated` / `topOpportunity` | score ≥ 93 / ≥ 90 | bool | `compass.ts:641-642` | sweep | inferred | no | badges |
| Take-profit ladder TP1–TP4 | `[0.3,0.8,1.5,2.5] · (0.8 + moveBias·0.3)` — **style constant, not per contract** | % of premium | `compass.ts:492-500` | sweep | inferred | no | Weigher evidence, monitor |
| Swing target / Scalp exit | `mid·(1+swingMul)` / `mid·(1+scalpMul)` — style constants | $ and % | `compass.ts:644-645` | sweep | inferred | no | SetupCompare |
| Invalidation price | `spot ∓ spot·(0.008 + hash·0.012)` | $ | `compass.ts:618-621` | sweep | simulated | no | card, landing |
| Invalidation reason | one of four strings picked by hash | text | `compass.ts:622-628` | sweep | simulated | no | landing copy |
| Liquidity `Tight/Normal/Wide` | spread ≤ 2 % / ≤ 5 % / else | enum | `compass.ts:614` | sweep | inferred | no | card |
| Chain premium / bid / ask | same `estimatePremium`; spread `clamp(1.2+180·otm+0.6, 0.8, 12)` % | $ | `compass.ts:986-998` | tick | modeled | no | contract chain |
| Chain **IV %** | `iv · (1 + otmDist·1.6)` — skewed | % | `compass.ts:994`, `1005` | tick | modeled | no | contract chain |
| Chain **Chg %** | `clamp(800·moneyness + (hash−0.35)·30, −60, 130)` | % | `compass.ts:1001-1003` | tick | simulated | no | contract chain |
| Chain volume | `oi · (0.18 + hash·0.5)` | contracts | `compass.ts:1006` | tick | simulated | no | contract chain |
| Impact **DEX** | `|Δ|·oi·100·spot / 1e9` | $B | `compass.ts:1078` | sweep | modeled | no | impact leaderboard |
| Impact **Gamma %** | `|netGex| / Σ|netGex| · 100 · (C:0.45 / P:0.38)` | % of book | `compass.ts:1079` | sweep | inferred | no | impact leaderboard |
| `totalFound` / `shown` | survivors above the scanner floor / rows admitted (cap 240) | count | `compass.ts:849`, `878` | sweep | observed | no | tab counts |

### 2.5 `core/contractScore.ts` — the Weigher (a **second** contract engine)

| Name as shown | Definition | Unit / horizon | Source | Cadence | Kind | Screens |
|---|---|---|---|---|---|---|
| Mid | **Black–Scholes**, `r = 0.045`, floor $0.02 | $ | `contractScore.ts:98-118`, `208` | tick | modeled | Weigher, Lotto |
| Delta | BS `N(d1)` (call) / `N(d1)−1` (put) | — | `contractScore.ts:113`, `117` | tick | modeled | Weigher, Lotto |
| **IV %** | `baseIv·(1+|moneyness|·1.6)`, `baseIv = max(0.12, 0.18 ± squeeze + hash(0…0.25))` | % annual | `contractScore.ts:173`, `206` | day | simulated | Weigher |
| **IV rank** | `round(hRange(ticker-day-ivr, 12, 92))` | 12–92 | `contractScore.ts:172` | day | simulated | Weigher ("IVR") |
| **θ/day** | `|BS theta| / mid · 100` | % of premium/day | `contractScore.ts:209` | tick | modeled | Weigher, Lotto |
| **1σ move** | `iv·√(yearsToExpiry(dte))·100`, `iv` = the *skewed hashed* base | % of spot | `contractScore.ts:218` | tick | modeled | Weigher, Lotto |
| Breakeven move | `(strike ± mid)/spot − 1` | % of spot | `contractScore.ts:219-220` | tick | modeled | Weigher, Lotto |
| Spread % | `clamp((6 − log10(OI)·1.4)·(dte>180?1.5:1), 0.4, 6)` | % | `contractScore.ts:213` | tick | inferred | Weigher |
| OI | chain OI × `e^(−24·|Δstrike|/spot)` | contracts | `contractScore.ts:212` | tick | inferred | Weigher |
| Factor scores ×6 | math / decay / vol / flow / news / liq, each 0–100 | 0–100 | `contractScore.ts:224-277` | tick | inferred | Weigher factor bars |
| **Composite** | Σ factor × horizon weight | 0–100 | `contractScore.ts:280` | tick | inferred | Weigher, Lotto |
| Verdict `BUY/WATCH/FADE` | ≥ 70 / ≥ 52 / else | enum | `contractScore.ts:281` | tick | inferred | Weigher |

### 2.6 `core/structures.ts` — defined-risk board

| Name as shown | Definition | Unit | Source | Kind |
|---|---|---|---|---|
| Net debit / credit | `Σ qty·premium · 100`, sign = you pay / you are paid | $/contract | `structures.ts:139-141`, `189` | modeled |
| Max loss / Max profit | payoff evaluated **at the knots** (strikes + range ends) | $/contract | `structures.ts:209-213` | modeled |
| Breakevens | linear interpolation of zero crossings over a 2001-point scan | $ | `structures.ts:214-226` | modeled |
| **Prob. of profit** | lognormal `probBetween` at the same IV and clock the legs priced on | 0–1 | `structures.ts:119-128`, `243-251` | modeled |
| Reward / risk | `maxProfit / maxLoss`, `Infinity` for the straddle family | ratio | `structures.ts:253` | modeled |
| IV | `Simulator.TICKERS[t].iv` — the name's own | % | `structures.ts:349` | modeled |

This is the cleanest engine in the codebase: it prices, states, and shows the payoff curve the claims come
from, and `StructureBoard.tsx:187-189` names its own limitation ("assignment and early exercise are not
modelled"). It is the model the rest of the terminal should be held to.

### 2.7 `data/gex.ts` + `data/exposure.ts` + `data/command.ts` — Pinpoint

| Name as shown | Definition | Unit | Source | Cadence | Kind | Screens |
|---|---|---|---|---|---|---|
| Call wall / Put wall | `plan.resistanceWall` / `plan.supportWall` | $ strike | `gex.ts:94-95` | tick | modeled | levels rail, chart, exposure, ranked targets |
| Flip | `plan.flipZone` | $ strike | `gex.ts:96` | tick | modeled | same |
| **King** | argmax \|netGex\| over the **whole chain** | $ strike | `gex.ts:83-90` | tick | modeled | same |
| **Pin** | heaviest total-OI strike within `half` strikes of spot — **window-dependent by design** | $ strike | `gex.ts:108-124` | tick | modeled | rail (`half=10`), exposure (`10\|15`), ranked targets (`10`), greeks (`10`) |
| Matrix cell | 0DTE = raw `netGex`; later columns `× decay × (0.55 + hash·0.9) × occasional −1` | signed $ | `gex.ts:194-209` | tick | simulated | GEX matrix |
| Board ladder | `sign · e^(−dist²) · spot · 45000 · (0.3+hash)` — **not** from the chain | signed $ | `gex.ts:246-259` | tick | simulated | flow board |
| Board dark-pool prints | 2–3 hashed crosses, 1–12 days ago | $ / shares | `gex.ts:266-292` | static | simulated | flow board |
| Exposure `netGex/netDex/netVex` | Σ over the **rendered window**, × expiry decay, × per-strike jitter | signed $ | `exposure.ts:76-92` | tick | inferred | positioning map header "NET" |
| **Dealer bias** (exposure) | whole-chain `Σ netGex` vs `±0.6 × max|netGex|` | enum | `exposure.ts:123-133` | tick | inferred | Exposure Profile "Dealer Bias", positioning map badge, Pulse panel |
| **Dealer bias** (command) | whole-chain `Σ netGex` vs `±0.8 × |netGex at king|` | enum | `command.ts:239-250` | tick | inferred | Pulse auto-note |
| Pressure (per strike) | `callGex·(0.7+hash·0.6)` etc. | signed $ | `command.ts:67-77` | tick | simulated | pressure matrix |
| ΔOI (per strike) | `(hash − 0.45)·OI·0.3` | contracts | `command.ts:69`, `74` | tick | simulated | pressure matrix |
| Cumulative delta | `(close − open + noise)·volume·1000` per bar, cumulated | $ | `command.ts:143-153` | tick | inferred | order-flow chart |
| VWAP | `Σ typical·vol / Σ vol` over the trailing 390 bars | $ | `command.ts:184-187` | tick | observed | order flow, GammaChart |
| POC | max-volume price bucket of 12 | $ | `command.ts:175-181` | tick | observed | order flow |
| Buy / Sell $ volume | `(notional ± netDelta)/2` | $ | `command.ts:189-190` | tick | inferred | order flow |
| Ranked target **score** | `100·(0.40·gexN + 0.22·oiN + 0.22·nbrN + 0.16·proxN)` | 0–100 | `rankedtargets.ts:97-101` | tick | inferred | Ranked Targets "Score" |
| NBR | strike volume ÷ mean of ±2 neighbours | ratio | `rankedtargets.ts:83-93` | tick | inferred | Ranked Targets |
| Greeks-matrix `netByGreek` | Σ over the **20 strikes nearest spot** only | $ | `greeksmatrix.ts:130-140` | tick | inferred | Greeks page |
| Dealer regime probabilities | softmax over four hand-weighted raw scores + hash | % | `greeksmatrix.ts:158-176` (pin at `:145`) | day | inferred | Greeks page |
| HEX | required dealer hedge ÷ available liquidity | ratio | `hedgeimpact.ts:41`, `60` | tick | inferred | Stress page |
| ADV (liquidity denominator) | modeled per name | $ | `hedgeimpact.ts:55` | day | simulated | Stress page |

### 2.8 `core/fracture.ts` — the instability model

| Name as shown | Definition | Unit | Source | Cadence | Kind |
|---|---|---|---|---|---|
| Forced flow (5 participants) | closed-form in distance-from-spot × `G` × fragility | signed $ | `fracture.ts:94-124` | tick | modeled |
| Latent liquidity | `baseDepth · U-shape · (1 − 0.5·branching)`, `baseDepth = G·hash(2.6…4.2)` | $ | `fracture.ts:119-120`, `345` | day | simulated |
| Absorption | `|totalForced| / latentLiquidity` | ratio | `fracture.ts:121` | tick | inferred |
| Fracture line | nearest level where absorption ≥ 1 | $ | `fracture.ts:380-394` | tick | inferred |
| **Branching ratio** | `0.3 + 0.22·autocorr + 0.15·shortGamma + 0.2·rvNorm + hash(−0.06…0.44)`, clamped | 0.25–0.97 | `fracture.ts:331-334` | day | inferred |
| **Endogeneity %** | `round(branching·100)` — the same number | % | `fracture.ts:397` | day | inferred |
| **Cascade probability** | share of **500** seeded paths that cascaded > 0.5 % | % | `fracture.ts:149-204` | day | modeled (Monte Carlo) |
| Median terminus / exhaustion band | p50 / p35 / p65 of cascaded termini | $ | `fracture.ts:205-207` | day | modeled |
| **Instability** | `branching·46 + proximity·24 + (cascadeProb−40)·0.35 + (crowding−0.6)·12` | 0–100 | `fracture.ts:431-436` | day | inferred |
| Move decomposition ×7 | hand-weighted raw terms normalised to 100 | % | `fracture.ts:214-230` | day | inferred |
| MOC imbalance $ | `bias · G · hash(0.4…0.9) · hash(0.3…1.7)` | signed $ | `fracture.ts:233-235` | day | simulated |
| MOC normalised / growth / displacement Z | ratios and Gaussian hashes | σ | `fracture.ts:236-238` | day | simulated |
| MOC absorption % | `42 + hash·44 − |Z|·12`, clamped [5,95] | % | `fracture.ts:239` | day | simulated |
| MOC reversal risk | `28 + absorption·0.4 + rebalance·22 − |growthZ|·12` | % | `fracture.ts:242` | day | inferred |
| **MOC score** | weighted sum of the six above, clamped | −100…+100 | `fracture.ts:244-257` | day | inferred |

### 2.9 `core/quant.ts` — Prove It

| Name as shown | Definition | Unit | Source | Cadence | Kind |
|---|---|---|---|---|---|
| Prob. up | share of **1 200** GBM terminal prices above spot | % | `quant.ts:93` | day | modeled (MC) |
| Expected return | mean terminal / spot − 1 | % | `quant.ts:94` | day | modeled (MC) |
| VaR 95 | 5th percentile terminal / spot − 1 | % | `quant.ts:95` | day | modeled (MC) |
| Range low / high | p5 / p95 terminal | $ | `quant.ts:96-97` | day | modeled (MC) |
| Cone p5…p95 | per-step percentiles across the full run | $ | `quant.ts:73-81` | day | modeled (MC) |
| Hit rate | share of graded calls resolving the called way | % | `quant.ts:200-201`, `224` | static | observed (of generated history) |
| n | count of resolved calls | count | `quant.ts:225` | static | observed |
| Edge bps/signal | mean signed realized move × 100 | bps | `quant.ts:227` | static | observed |

`quant.ts:130-164` is the strongest provenance comment in the repo — it documents *removing* four fabricated
scoreboard rows rather than keeping a plausible number. The two surviving rows carry `n` on screen.

### 2.10 `data/news.ts` + `data/newsintel.ts`

| Name as shown | Definition | Unit / horizon | Source | Cadence | Kind |
|---|---|---|---|---|---|
| P up | `50 + 40·tanh(sentiment·magnitude·2.1)` | % next session | `news.ts:381` | day | inferred |
| 1d expected move | `sentiment·magnitude·kick[cat]·beta·(0.85+hash·0.3)` | signed %, 1 session | `news.ts:197-199` | day | modeled |
| 5d expected move | `1d × (1.35 + hash·0.5)` | signed %, 5 sessions | `news.ts:380` | day | inferred |
| **Confidence** | `42 + magnitude·40 + hash·12` | % | `news.ts:382` | day | inferred |
| Priors (n) | 252 sessions × 18 items, split by category | count | `news.ts:295`, `313-335` | static | modeled |
| Hit % | share of priors resolving in their own headline's direction | % | `news.ts:370` | static | observed (of priors) |
| Median % | median \|realized\| across the same priors | % | `news.ts:371` | static | observed |
| Tape mood score | magnitude-weighted mean sentiment | −1…+1 | `news.ts:523` | day | inferred |
| Priced-in % | fraction of expected move already discounted | 0–100 | `newsintel.ts:71-72` | day | inferred |
| Event vol % | implied straddle move the catalyst injects | % | `newsintel.ts:77` | day | modeled |
| Divergence score | positioning lean − headline lean | signed | `newsintel.ts:81` | day | inferred |
| Analog similarity | closeness to today's setup | 0–100 | `newsintel.ts:50` | static | inferred |

The `analog` sentence (`news.ts:396`) is the model for how a modeled base rate should be labelled:
*"Measured over N **simulated** … catalysts from this model's own generator — no market history stands
behind it."* That sentence exists on exactly one surface.

### 2.11 `data/darkpool.ts` + `data/darkpoolfeed.ts`

| Name as shown | Definition | Unit | Source | Cadence | Kind |
|---|---|---|---|---|---|
| **Off-exchange share** | `hRange(ticker-day-share, 34, 52)` — **no volume input** | % | `darkpool.ts:397` | day | simulated |
| Block notional | Σ of the 240 generated prints | $ | `darkpool.ts:311` | day | simulated |
| Print price / size | shelf-gravitated price; `100 + p^6·260 000` shares | $ / shares | `darkpool.ts:280-289` | day | simulated |
| Venue archetype | size-percentile → `WHOLESALER / BANK ATS / …` | enum | `darkpool.ts:57-61` | day | inferred |
| Execution + clips | size/price → `LIS CROSS / VWAP SLICE / ICEBERG / …` | enum + count | `darkpool.ts:126-183` | day | inferred |
| **Conviction** | per-intent hashed range: HEDGE 48–68, ACCUM 70–92, DIST 68–90, ROTATION 35–55 | % | `darkpool.ts:217-247` | day | simulated |
| Net posture % | notional × conviction, accumulation vs distribution | −100…+100 | `darkpool.ts:360-367` | day | inferred |
| Shelf notional / share / prints | the prints that actually cluster on the shelf | $ / % / count | `darkpool.ts:340-357` | day | observed (of the generated tape) |
| Defended (`N×`) | reversals whose nearest shelf is this one, capped at 5 | count | `darkpool.ts:72-93` | tick | observed |
| Sector off-ex $ / avg-vol % | per-name draws rolled up | $ / % | `darkpoolfeed.ts:20-38` | day | simulated |

### 2.12 `data/flowtape.ts` · `data/pulseflow.ts` · `data/flowscan.ts` — three tapes

| Name as shown | flowtape (Trace › Live Tape) | pulseflow (Pulse flow tape) | flowscan (Trace › Scanner) |
|---|---|---|---|
| **OTM %** | `(strike − spot)/spot·100` — signed by *strike position*, `flowtape.ts:83` | oriented to the right: C `(K−S)/S`, P `(S−K)/S`, `pulseflow.ts:137` | `(strike − spot)/spot·100`, `flowscan.ts:79` |
| Premium | `fill · size · 100`, `flowtape.ts:95` | `price · 100 · size`, `pulseflow.ts:136` | `volume · avgFill · 100`, `flowscan.ts:83` |
| Price / fill | intrinsic·0.98 + gaussian TV, `flowtape.ts:47-51` | `intrinsic + S·ivσ√t·0.4·e^(−m²/2)` on **sessions/252**, `pulseflow.ts:75-82` | intrinsic·0.98 + `S·iv·0.05·√((dte+1)/20)`, `flowscan.ts:82` |
| **IV** | `nameIv·100·(0.8 + hash·0.6)`, `flowtape.ts:100` | not published | `(cfgIv + |otm|·0.004 + hash(0…0.18))·100`, `flowscan.ts:81` |
| Directional score | `flowScore` ±48…100 (or ±12 at mid), `flowtape.ts:62-64` | `sigScore` 0.05–1, `pulseflow.ts:142-148` | `bullScore` −100…+100, `flowscan.ts:89` |
| shown as | "Flow" bar | "Sig" | "**Conviction**" bar |
| Volume / OI / ΔOI | all hashed off `order.size`, `flowtape.ts:69-71` | — | hashed off chain OI, `flowscan.ts:74-92` |
| RVOL | `0.55 + hash·0.5` — **a pure hash**, `flowtape.ts:150` | — | — |

### 2.13 `data/vollab.ts` vs `data/statedensity.ts` — two volatility engines on one desk

| Name as shown | Vol Lab (`/prove-it?view=volatility`) | State Density (`/prove-it?view=density`) |
|---|---|---|
| ATM IV | `atm30` = term curve at 30d ≈ **1.703 × the name's configured IV**, `vollab.ts:91` | `atmIvFrac` = realized-based × `(1 + VRP hash)`, `statedensity.ts:254`, `384` |
| **Expected move** | `atm30·√(29/365)`, `vollab.ts:142-143` | `atmIvFrac·√(30/365)·100`, `statedensity.ts:392` |
| **25Δ risk reversal** | `−(1.8 + hash·1.6)` — unrelated to any wing vol, `vollab.ts:148` | `callWingVol − putWingVol`, derived from skew, `statedensity.ts:272` |
| **IV Rank 1Y** | `25 + hash·45` → support **[25, 70]**, `vollab.ts:103` | not published |
| IV %ile | `20 + hash·50` → support **[20, 70]**, `vollab.ts:104` | not published |
| Realized vol | not published | per-step σ × `√(252·26)` over the 100-tick buffer, `statedensity.ts:157` |
| VRP | not published | `impliedVar − realizedVar`, `statedensity.ts:388-389` |
| Regime **Confidence** | `prob` of the dominant softmax regime, `vollab.ts:197`, rendered `RegimePanel.tsx:47` | not published |
| Density | normalised split-normal (peak-scaled), `vollab.ts:124-133` | proper pdf, trapezoid-integrated to 1, `statedensity.ts:162-178` |

### 2.14 `data/stocks.ts` · `data/earnings.ts` · `data/edgeledger.ts` · `data/metaorder.ts` · `data/statereplay.ts`

| Name as shown | Definition | Unit | Source | Cadence | Kind | Screens |
|---|---|---|---|---|---|---|
| Momentum / Quality / Flow sleeve | `hRange(18…96 / 25…94 / 15…95)` | 0–100 | `stocks.ts:114-116` | day | simulated | Stocks |
| News sleeve | `50 + tickerSentiment·48` | 0–100 | `stocks.ts:117` | day | inferred | Stocks |
| **Composite** | weighted sum (0.32/0.24/0.26/0.18) | 0–100 | `stocks.ts:121-127` | day | inferred | Stocks board, drawer |
| Sector **Score** | mean member composite | 0–100 | `stocks.ts:196` | day | inferred | Stocks rotation |
| RS 1w / 1m | `hGauss·1.2 (2.2) + (score−55)·0.05 (0.09)` | signed % | `stocks.ts:197-198` | day | simulated | rotation map |
| Breadth % | members with momentum > 50 | % | `stocks.ts:199-201` | day | observed | rotation |
| Implied move % | `histAvgMovePct × richness` | % | `earnings.ts:326` | day | inferred | Earnings |
| Hist avg move % | mean \|reaction\| across 8 generated prints | % | `earnings.ts:151+` | day | observed (of generated record) | Earnings |
| Beat rate 8q | counted off the same 8 | % | `earnings.ts:76` | day | observed | Earnings |
| **IVR** | `hRange(ticker-day-ivr, 35, 96)` | 35–96 | `earnings.ts:340` | day | simulated | Earnings "IVR" |
| **Setup** (technical score) | `hRange(ticker-day-tech, 22, 92)` | 22–92 | `earnings.ts:341` | day | simulated | Earnings "Setup" |
| Revision trend / Flow lean | `hGauss·0.45 + sentiment·0.4` / `hGauss·0.5` | −1…+1 | `earnings.ts:339`, `342` | day | simulated | Earnings |
| Ledger MFE / MAE / exit % / R | per-trade generated record | % / R | `edgeledger.ts:68-78` | static | simulated | Tracker › Edge Ledger |
| Expectancy / Profit factor / Win rate | counted across those trades | R / ratio / % | `edgeledger.ts:91-98` | static | observed (of generated book) | Edge Ledger |
| Metaorder `pctComplete`, `openingProb`, `infoScore` | reconstruction heuristics over seeded child prints | % / % / −100…+100 | `metaorder.ts:83`, `92`, `98` | day | inferred | Trace › Reconstruction |
| Replay similarity / R / calibration bins | seeded analog pool + realised draws | 0–1 / R / % | `statereplay.ts:82-99` | day | simulated | Prove It › Replay |

`edgeledger` and `statereplay` are the two engines that label themselves correctly on screen
(`EdgeLedger.tsx:239` "A worked demonstration over N **modeled** trades. Not your fills";
`MarketStateReplay.tsx:455-457` "No session here happened"). They are the standard.

---

## 3. Collisions and contradictions

The highest-value section. Each entry: what the collision is, the measurement, and the smallest fix.

### 3.1 P0 — "IV Rank" is three unrelated numbers under one tooltip

`terms.ts:44` defines IVR once: *"where current implied vol sits in its own 1-year range (0–100)"*. Three
engines publish a number under that name, each an independent hash with a different support:

| screen | source | support | MSFT | HAL | PINS | UNP |
|---|---|---|---|---|---|---|
| Compass › Weigher "IVR" | `contractScore.ts:172` `hRange(…-ivr, 12, 92)` | 12–92 | **16** | 49 | 27 | 84 |
| Prove It › Vol Lab "IV Rank 1Y" | `vollab.ts:103` `25 + h01·45` | 25–70 | **70** | 29 | 61 | 63 |
| Earnings Hub "IVR" | `earnings.ts:340` `hRange(…-ivr, 35, 96)` | 35–96 | **96** | 91 | 88 | 39 |

Measured by `m10.ts`. Not one of the three can be reconciled with the others, and none of them reads the
IV that actually prices options in this terminal. Two of the three cannot express the tooltip's own range:
Vol Lab's "IV Rank 1Y" can never report a name in the top 30 % or bottom 25 % of its range.
**Fix:** one `ivRank(ticker)` in `core/`, seeded once, consumed by all three — or drop it from two of the
three surfaces. Do not "reconcile the ranges"; that produces a fourth number.

### 3.2 P0 — "Expected move" differs 7.9× between two views of one desk

`/prove-it` has a `?view=` switch. Both branches publish a 30-day ±1σ move as a percentage of spot:

| name | Vol Lab "Exp Move" (`vollab.ts:143`) | State Density "Expected move" (`statedensity.ts:392`) | ratio |
|---|---|---|---|
| META | 26.97 % | 3.41 % | 7.91× |
| MSFT | 20.18 % | 3.71 % | 5.44× |
| NVDA | 16.71 % | 5.39 % | 3.10× |
| SPY | 7.29 % | 5.06 % | 1.44× |

Measured by `m4.ts`. Cause: Vol Lab's term structure sets 30-day ATM IV to `1.703 ×` the name's configured
IV (short mult 2.25, long 0.95, `exp(−30/55)`), so META prices at **95.68 %** ATM IV while every option in
the Compass chain for META is priced at **56 %**. State Density instead anchors on realized vol.
The same pair also disagrees on **25Δ risk reversal** (Vol Lab's is `−(1.8 + hash·1.6)`, which has no
relationship to any wing vol it displays; State Density's is `callWing − putWing`).
**Fix:** one ATM-IV term function in `core/`; `vollab.buildRnd` and `buildStateDensity` both consume it.

### 3.3 P0 — one contract, two prices, on one page

Compass has three modes in one tab strip (`Compass.tsx:37-43`): Setups, Weigher, Lotto. Setups prices with
`compass.estimatePremium`; Weigher and Lotto price with `contractScore.blackScholes`. Same ticker, same
strike, same expiry:

| contract | Setups board `mid` | Weigher / Lotto `mid` | ratio | Setups "1σ Move" | Weigher "1σ move" |
|---|---|---|---|---|---|
| SPY 504C 0DTE | $1.35 | $1.59 | 0.85× | 0.7 % | 0.81 % |
| QQQ 443C 0DTE | $1.41 | $2.39 | 0.59× | 0.8 % | 1.46 % |
| QQQ 443C 45DTE | $11.19 | $21.24 | 0.53× | 6.3 % | 11.48 % |
| QQQ 443C 365DTE | $31.87 | $66.27 | 0.48× | 18.0 % | 32.69 % |

Measured by `m3.ts`. Two independent causes stack: (a) different pricing form — a normal-shaped time-value
approximation vs Black–Scholes; (b) different IV — `Simulator.TICKERS[t].iv` (18 % for QQQ) vs
`baseIv·(1+|m|·1.6)` where `baseIv` is a per-day hash (32.7 % for QQQ). The Lotto board is a 0DTE board and
the Setups board has a 0DTE sleeve, so **both are reachable without changing ticker or expiry**.
`optionTime.ts:10-24` documents this exact class of defect being fixed for the *clock*; the IV and the
pricing form were left split.
**Fix:** `contractScore.blackScholes` is the better model — have `compass.makeSetup` and `buildChain` call
it, and make both read one `ivFor(ticker, strike, dte)`.

### 3.4 P0 — the positioning-map header contradicts itself on 18 of 192 names

`PositioningMap.tsx:479-484` renders, on one line: a `BULLISH/BEARISH/NEUTRAL` badge, then `NET ±$X` tinted
by its own sign. The badge comes from `exposure.bias` — the **whole chain** net GEX (`exposure.ts:108`).
The number comes from `exposure.netGex` — the **rendered window**, expiry-decayed and per-strike jittered
(`exposure.ts:90`). They are not the same quantity and the header does not say so.

Measured by `m2.ts` across all 192 universe names: **18 names (9.4 %) have opposite signs.**

```
META : badge BEARISH,  NET +$89.8M   (chain −380.5M)
PANW : badge BEARISH,  NET +$85.2M   (chain  −98.9M)
HD   : badge NEUTRAL,  NET +$228.7M  (chain  −42.5M)
CDNS : badge BULLISH,  NET −$10.8M   (chain  +69.6M)
```

Magnitude also diverges: the window/chain ratio ranged **0.23× to 120×** on the watchlist alone (`m1.ts`).
And `ExposureProfile.tsx:136` labels the badge `sub="full chain, all expiries"` — correct for the badge,
directly contradicted by the number two panels away.
**Fix:** print the chain net beside the badge (they are the same quantity), and label the windowed sum
"window Σ" where it is used for bar scaling.

### 3.5 P0 — "Off-exchange share … of today's volume" is a hash

`DarkPool.tsx:485-490` renders `StatCard label="Off-exchange share" value="{x}%" sub="of today's volume
printed away from the lit book"`. The source is `darkpool.ts:397`:

```ts
dpSharePct: hRange(seed('share'), 34, 52),
```

No volume enters the function. The engine's own comment (`darkpool.ts:394-396`) says exactly this — *"A
modelled session share, not a measured one: nothing in the snapshot carries consolidated volume"* — but the
sub-caption on screen asserts the opposite, and it is the only StatCard on that grid whose caption makes a
measurement claim. The same field is re-rendered without any caption in the Pulse workspace
(`registry.tsx:414`).
**Fix:** the caption is the defect, not the number. `sub="modeled session assumption — no consolidated
volume behind it"`.

### 3.6 P0 — "Dealer bias" has two thresholds and both render on `/pulse`

Same name, same type (`DealerBias`), same input (whole-chain `Σ netGex`), two cuts:

- `exposure.ts:124` — `|Σ netGex| > 0.6 × max|netGex|`
- `command.ts:241` — `|Σ netGex| > 0.8 × |netGex at king|`

`max|netGex|` **is** `|netGex at king|` by construction (`gex.ts:83-90`), so these differ only in the
constant. Measured across 192 names (`m2.ts`): **13 disagree (6.8 %)** — every one in the 0.6–0.8 band.

```
AMD  ratio +0.711 → exposure BULLISH, command NEUTRAL
T    ratio −0.691 → exposure BEARISH, command NEUTRAL
JNJ  ratio +0.703 → exposure BULLISH, command NEUTRAL
```

Both surface on `/pulse` at once: `registry.tsx:284` shows `exposure.bias` as a badge, `registry.tsx:149`
feeds `cmd.bias` into `makeAutoNote`. In the disagreement window the badge reads BULLISH while the note
below can print *"dealers short gamma, so expect amplified moves"* (`command.ts:218-219`).
**Fix:** one exported `dealerBias(snapshot)` in `data/gex.ts` beside `buildLevels`, one constant.

### 3.7 P1 — "Confidence" is six different things; one of them is Score in a different font

| screen | quantity | source |
|---|---|---|
| Tracker "Confidence" column | `round(clamp((score−55)·2.1, 5, 98))` | `compass.ts:660` → `Tracker.tsx:412-415` |
| Landing "Confidence" bar | the same field | `LiveSections.tsx:241-247` |
| News "Confidence" | `42 + magnitude·40 + hash·12` | `news.ts:382` → `News.tsx:545` |
| Stocks drawer "Conf" | the same news field | `StockDetailDrawer.tsx:102` |
| Vol Lab "Confidence" | probability of the current vol regime | `vollab.ts:197` → `RegimePanel.tsx:47` |
| Dark Pool "Confidence" chip | the print classifier's `conviction` | `darkpool.ts:217-247` → `DarkPool.tsx:170-174` |
| Reconstruction "Inferred confidence" | a size/finish-window range | `MetaorderReconstruction.tsx:248` |
| Fracture "Confidence" chip | a static tier per amplifier, not numeric | `Fracture.tsx:60` |

The first is the worst: **Tracker prints Score and Confidence as adjacent columns** (`Tracker.tsx:388` and
`:412`) and they are the same number. Measured on the live 240-row board (`m7.ts`):

```
confidence === round(clamp((score − 55)·2.1, 5, 98))  for 240/240 rows
pearson r(score, confidence) = 0.9987
11 distinct scores → 11 distinct confidences
```

`contractFacts.ts:19-24` and `SetupScanCard.tsx:118-120` both document this and removed the column from the
Weigher and the scan card. **The Tracker and the landing page still render it.**
**Fix:** delete `Setup.confidence`; the two remaining call sites show `score`. Rename the other five to what
they measure (`regime probability`, `classifier conviction`, …).

### 3.8 P1 — Health, Momentum and Action in the contract chain are one quantity: signed moneyness

`compass.ts:246-263`: `health = clamp(50 ∓ 900·moneyness, 22, 78)`; `momentum` and `action` are two
thresholdings of `health` at the identical cuts (56 / 45). Measured on SPY (`m5.ts`):

```
strike  moneyness%  health  momentum       action   itm
498     −1.17       61      STRENGTHENING  HOLD     true
503     −0.17       52      NEUTRAL        REDUCE   true
507     +0.62       44      WEAKENING      SELL     false
510     +1.21       39      WEAKENING      SELL     false
```

Across SPY/QQQ/AAPL/NVDA, **0 of 69** distinct moneyness buckets produced more than one health value —
health is a pure function of the strike column already on screen. So the chain says `SELL` on every OTM
call and `HOLD` on every ITM call, on every name, in every session, and `ContractChain.tsx:37` paints
health `text-bull` when ITM. Green here means "the strike is below spot", not "positive market direction".
**Fix:** these three columns carry one bit of information the `strike` column already carries. Cut
`Momentum` and `Action`; if a per-strike read is wanted it needs an input the strike does not already give.

### 3.9 P1 — the public landing page paints a PUT's confidence bar bull-green

`LiveSections.tsx:363-372` animates the confidence meter to `background: entering ?
'rgba(48,209,88,0.92)' : 'rgba(255,59,48,0.85)'`. Measured (`m7.ts`), the card the page currently selects is:

```
NOW 794P — a PUT — verdict ENTER, confidence 82 %, bar rgba(48,209,88,.92)
61 of 149 ENTER-verdict rows on that board are puts
```

Two house rules break at once: confidence is model quality and must never be green; and green on a put
reads as a rally. The file already contains the fix for the *verdict* eleven lines above
(`LiveSections.tsx:344-345`: *"A verdict is a process state, so it takes the chrome tones, not direction:
green here painted a PUT the colour of a rally"*) — the meter directly below it was not converted.
Same block, `LiveSections.tsx:226`: `tone: setup.expectedMovePct >= 0 ? 'text-bull' : 'text-bear'`.
`expectedMovePct = iv·√T·100` is **always ≥ 0** (board minimum measured: 0.7 %), so a symmetric ±1σ range
is unconditionally painted bull-green and printed `+2.1%` where every other surface prints `±2.1%`.
Also in that block: `FADED_CONFIDENCE = 31` (`LiveSections.tsx:270`, used `:292`) — a hardcoded constant rendered in the
same meter, in the same style, as the engine's number.
**Fix:** `data-bar` / `select` tone for the meter (as `LiveSections.tsx:247` already uses on the other
card), `±` sign and neutral tone for the expected move.

### 3.10 P1 — "OTM %" has two sign conventions and one glossary entry

`terms.ts:18` — *"OTM% — Out of the money — how far the strike sits beyond spot, as % of spot."*

- `flowtape.ts:83` and `flowscan.ts:79`: `(strike − spot)/spot·100`. For a **put**, a strike *above* spot
  (deep ITM) returns **positive**.
- `pulseflow.ts:137`: oriented to the right — `C: (K−S)/S`, `P: (S−K)/S`. Correct OTM distance.

Both render a column keyed to the same tooltip: `LiveTape.tsx:250-253` (`help: 'OTM%'`) and
`PulseFlowTape.tsx:23` (`term: 'OTM%'`). `LiveTape.tsx:256` then tints it
`r.otmPct >= 0 ? 'text-bull' : 'text-bear'` — so an **in-the-money put** prints green, and a distance
measure is encoded in the market-direction palette.
**Fix:** one `otmPct(right, strike, spot)` helper; neutral tone (distance is not direction).

### 3.11 P1 — "Theta" is two quantities, 0.40×–1.27× apart

- `compass.ts:652`: `−(mid − intrinsic) / (2·max(0.5, dte))` — an ad-hoc amortisation, rendered as
  **"Theta"** in `$` on the setup card, the landing greeks grid and the monitor, *directly beside* Δ, Γ and
  vega that came from real Black–Scholes (`compass.ts:573`).
- `contractScore.ts:209`: `|BS theta| / mid · 100` — rendered as **"θ/day"** in `%` on the Weigher and Lotto.

Measured (`m8.ts`), converting the Weigher's % back to $/day on the identical contract:

| contract | card "Theta" | Weigher implied $/day | ratio |
|---|---|---|---|
| QQQ ATM LEAPS | −0.04 | −0.099 | 0.40× |
| QQQ ATM swing | −0.12 | −0.251 | 0.48× |
| NVDA ATM 0DTE | −0.86 | −0.677 | 1.27× |

**Fix:** publish BS theta on `Setup.greeks.theta` too; the greek row should be one model end to end.

### 3.12 P1 — the take-profit ladder is a style constant rendered as a per-contract target

`compass.ts:492-500` and `:644-645`. Measured on two full boards (`m9.ts`):

| sleeve | rows | distinct TP ladders | distinct swing / scalp | ±1σ range on those rows |
|---|---|---|---|---|
| 0DTE | 240 | **1** → `+33 / +88 / +165 / +275 %` | 38 % / 18 % | 0.7 % – 2.6 % |
| LEAPS | 240 | **1** → `+33 / +88 / +165 / +275 %` | 38 % / 18 % | 15 % – 59 % |

Every contract on every board shows the same four premium targets, and the 0DTE and LEAPS boards show the
same four despite a 20× difference in the underlying's expected move. A `+275 %` target beside a `±0.7 %`
1σ, with no probability attached, is the strongest unqualified claim on the desk.
**Fix:** derive the ladder from the contract (delta and 1σ), or label it as a style preset ("this style
takes profit at +33/+88/…") rather than as this contract's target.

### 3.13 P1 — "MODELED" means opposite things on one screen

- `scanUniverse.ts:87` — `modeled: { label: 'MODELED', note: 'Simulated session, chart and dealer map…' }`.
  This is the **deepest / most trustworthy** coverage tier, rendered on the setup card with tone `select`
  (`SetupScanCard.tsx:24`, `:110`).
- `ContractTrack.tsx:353-355` — the label `Modeled` means **"this series is derived, not a traded tape"**,
  i.e. *less* trustworthy, in `text-textMuted`.

Both render inside Compass › Setups at the same time: `SetupScanBoard.tsx:239` draws the card,
`SignalMonitor.tsx:162` draws the track.
**Fix:** rename the coverage tier (`DEEP` / `FULL`), and keep `Modeled` for provenance.

### 3.14 P2 — "Score" means at least five things

| screen | range | meaning | source |
|---|---|---|---|
| Compass board / card / compare, Tracker | 8–99 | opportunity rank display | `compass.ts:425` |
| Compass › Lotto "MOC score" | −100…+100 | closing-auction edge | `fracture.ts:244` |
| Stocks "Score" / "Composite" | 0–100 | four-sleeve stock composite | `stocks.ts:121` |
| Pinpoint › Ranked Targets "Score" | 0–100 | structural priority of a strike | `rankedtargets.ts:97` |
| Earnings "Setup" | 22–92 | hashed technical score | `earnings.ts:341` |
| (also) `TradePlan.score` | 10–90 | plan conviction, not currently rendered | `simulator.ts:512` |

Two of them appear in the same Compass tab strip. `Compass.tsx:397` already documents that `score` is a
display value and must not be a React key — the vocabulary problem is the same one, one level up.
**Fix:** qualify every one at the point of render ("Setup score", "MOC score", "Strike priority").

### 3.15 P2 — "Conviction" means three things

`FlowScanner.tsx:162`/`210` labels `bullScore` (−100…+100 ask/bid share) **Conviction**;
`DarkPool.tsx:170` labels the dark-pool classifier's hashed `conviction` (35–92) **Confidence**;
`types/compass.ts:129` uses "dealer-flow conviction" in the Top Setups blurb for a quantity
(`rankOf`) that contains no flow term at all. Three surfaces on two desks.

### 3.16 P2 — `pin` is window-dependent and four callers pass different windows

`gex.ts:108` takes `half` as an argument *by design* (documented at `:100-107`). But
`exposure.ts:72` passes the panel's own strike-range control (`10 | 15`) while `command.ts:227`,
`rankedtargets.ts:25` and `greeksmatrix.ts:145` all hardcode `10`. Measured (`m4.ts`): **5 of 192 names
(2.6 %)** land on a different pin at `half=15`:

```
GS  : pin(10)=495  pin(15)=475   spot 486.86   ($20 / 4.1 % apart)
TMO : pin(10)=585  pin(15)=570   spot 583.11
ELV : pin(10)=505  pin(15)=525   spot 513.51
```

So widening the Exposure Profile's range moves the PIN marker away from the PIN price in the key-levels
rail and the PIN tag in Ranked Targets. `rankedtargets.ts:17-25` documents fixing precisely this class of
bug for its own scan.
**Fix:** either freeze the pin window at 10 everywhere, or caption it "pin (±N strikes)".

### 3.17 P2 — the sleeve stamp is not the day count that priced the row

`compass.ts:636` stamps `expiry: "45DTE"` (the horizon asked for) while `compass.ts:544` prices with
`expiryFor(45).dte` (what the calendar resolved). Measured over the next 261 weekday session starts
(`m6.ts`):

| stamp | sessions where the stamp ≠ the priced calendar DTE |
|---|---|
| 0DTE | 10 / 261 (4 %) |
| 7DTE | 10 / 261 (4 %) |
| **45DTE** | **114 / 261 (44 %)** |
| 365DTE | 56 / 261 (21 %) |

Worst weekly: standing on **Mon 2026-08-31**, the row reads `7DTE` and is priced with **4** calendar days —
57 % of the √T time value the label implies. Mitigated but not fixed: `setupHorizon.ts:77` renders the chip
as `"7DTE · 09/04/26"`, so the real date is on screen next to the wrong day count.
**Fix:** stamp the resolved DTE and keep the sleeve name as the sleeve name.

### 3.18 P2 — a third pricing clock

`optionTime.ts` exists to guarantee one clock (`/365` calendar, floored at half a session). `pulseflow.ts:76`
opts out: `const t = Math.max(0.003, sessions / 252)`. Same time-value formula, two clocks, SPY 500 ATM at
15 % (`m6.ts`):

| nominal | resolved | Compass (cal/365) | Pulse tape (sessions/252) | ratio |
|---|---|---|---|---|
| 0d | 0 cal / 0 sess | $1.34 | $1.64 | **1.23×** |
| 2d | 2 cal / 2 sess | $2.22 | $2.67 | 1.20× |
| 5d | 4 cal / 4 sess | $3.14 | $3.78 | 1.20× |
| 45d | 45 cal / 32 sess | $10.53 | $10.69 | 1.01× |

The comment at `pulseflow.ts:74` states the choice deliberately, and it is defensible in isolation — but
the Pulse flow tape and the Compass chain sit in the same workspace and quote short-dated premium 20 %
apart. `optionTime.ts:10-24` says a two-clock split is "the defect this module exists to prevent".

### 3.19 P2 — windowed sums presented as book totals

Three engines publish a "net" that is a partial sum, under a name that reads as a total:

| field | window | source | rendered as |
|---|---|---|---|
| `exposure.netGex/netDex/netVex` | rendered strikes, expiry-decayed, jittered | `exposure.ts:90-92` | "NET $X" (`PositioningMap.tsx:481`) |
| `greeksmatrix.netByGreek.*` | 20 strikes nearest spot | `greeksmatrix.ts:130-140` | per-greek totals, charm clock, vanna shock |
| `command.netGex` | whole chain | `command.ts:239` | bias only |

`exposure.ts:86-89` documents the hazard in a comment. The comment is right; the label on screen is not.

### 3.20 P2 — realized vol is annualized off a 2.5-minute buffer

`statedensity.ts:157`: `perStep · √(252 · 26)`. The input is `snapshot.priceHistory`, a rolling **100-entry**
buffer written once per 1.5 s tick (`simulator.ts:558-561`) — roughly 2.5 minutes of wall clock, with no
defined bar interval. The `26` is a fudge constant with no derivation, and the result is rendered as
**"RV {x}"** in the variance-risk-premium StatCard (`StatePriceDensity.tsx:219`) and drives the whole VRP
read. The same buffer is the input to `fracture.ts:67-75` `realizedVol` (per-step, unannualized) and to
`fracture.ts:52-64` `autocorrProxy`, which sets the branching ratio.
**Fix:** measure realized vol off the candle series (`Simulator.getCandles`), which has a defined 60 s bar.

### 3.21 P3 — one field, two names and two signs

`Setup.expectedMovePct` renders as **"1σ Move ±2.1 %"** (`SetupScanCard.tsx:125`, `SetupScanBoard.tsx:137`,
`SetupCompare.tsx:175`, `LottoBoard.tsx:361` as "±1σ") and as **"Exp. move +2.1 %"** in green
(`LiveSections.tsx:222-228`). Two labels, two sign conventions, one number.

### 3.22 P3 — three "flow strength" scales that cannot be compared

`flowScore` −100…+100 (`flowtape.ts:62`, Trace › Live Tape, column "Flow"), `sigScore` 0…1
(`pulseflow.ts:146`, Pulse tape, column "Sig"), `bullScore` −100…+100 (`flowscan.ts:89`, Trace › Scanner,
column "Conviction"). Three columns on the same desk family measuring "how strong is this print", on three
scales, with three names, none of which says which scale it is on.

### 3.23 P3 — `rvol` is a hash rendered as a measurement

`flowtape.ts:150`: `rvol: 0.55 + h01('rvol-' + prints.length)·0.5`. Relative volume is the one number on a
tape that is definitionally a *ratio of observed volumes*, and this one is keyed on the row count.

---

## 4. Gate 27 — uncertainty

### 4.1 Values the model produces *with* a distribution, rendered as a point estimate

| value | sample | implied sampling error | rendered | source |
|---|---|---|---|---|
| **Cascade probability** | 500 paths | binomial SE ≈ **2.2 pp** at p=0.5, 2.0 pp at p=0.3 | `"{n}%"`, integer | `fracture.ts:204` → `Fracture.tsx:292` |
| Prob. up | 1 200 paths | SE ≈ **1.4 pp** | `"{n}%"`, integer, `sub` names the run count | `quant.ts:93` → `ProveIt.tsx:99-101` |
| Expected return | 1 200 paths | SE = σ_T/√1200 | `"{x.x}%"` | `quant.ts:94` → `ProveIt.tsx:105` |
| **VaR 95** | 1 200 paths, **5th percentile** | tail-order-statistic error, materially wider than the mean's | `"{x.x}%"`, no n on the card | `quant.ts:95` → `ProveIt.tsx:111` |
| Hit rate | n shown | binomial SE on n | `"{n}%"` + `n={sample}` | `quant.ts:224` → `ProveIt.tsx:219-222` |
| Base hit % (news) | `baseN` shown | binomial SE on baseN | `"{n}%"` + priors count | `news.ts:370` → `News.tsx:552-562` |
| Regime "Confidence" | softmax over 3 hand-tuned sines | not a sampling estimate at all | `"{n}%"` | `vollab.ts:197` → `RegimePanel.tsx:47` |

The sharpest case is **Cascade probability**. `Fracture.tsx:292` colours it `bear ≥ 55`, `warn ≥ 30`,
`bull` otherwise. Both thresholds sit **within ~1.5 standard errors** of the estimate, so the StatCard's
colour can flip on Monte-Carlo noise alone. The panel below it (`Fracture.tsx:346`) does disclose
`"500 feedback paths"` in its subtitle — the StatCard does not.

**Smallest fix:** print the interval where the model has one. `cascadeProbPct` → `"34% ± 2"` or
`"31–37 %"`; `var95Pct` → the p2.5/p7.5 bracket; the two hit rates → `± 1.96·√(p(1−p)/n)`. `quant.ts` and
`fracture.ts` already hold the full sample arrays — nothing needs to be re-simulated.

### 4.2 Values the model produces *without* uncertainty and should say so

`Structure.probProfit` (`structures.ts:243-251`) is analytic under a stated lognormal, and
`StructureBoard.tsx:187-189` says so in prose *and* names what is excluded. That is the correct pattern and
it is used once.

### 4.3 Modeled values with no provenance marker on screen

Present and correct: `ContractTrack.tsx:355` "Modeled" · `EdgeLedger.tsx:239` "N modeled trades. Not your
fills" · `MarketStateReplay.tsx:455-457` "No session here happened" · `LottoBoard.tsx:629` "modelled
closing-auction read, not an exchange feed" · `news.ts:396` "N **simulated** catalysts … no market history
stands behind it" · `EarningsIntel.tsx:563` "Modeled prior prints".

Missing, on values a reader would take as measured:

| value | screen | why it reads as measured | source |
|---|---|---|---|
| Off-exchange share | Trace › Dark Pool | caption says *"of today's volume"* (`DarkPool.tsx:485-490`) | `darkpool.ts:397` |
| Conviction % per print | Trace › Dark Pool | a per-print integer in a table of prices and sizes | `darkpool.ts:217-247` |
| RVOL | Trace › Live Tape | a volume ratio | `flowtape.ts:150` |
| Volume, ΔOI, Vol/OI | Trace › Live Tape + Scanner | the three columns a flow trader treats as ground truth | `flowtape.ts:69-71`, `flowscan.ts:74-92` |
| IVR / Setup score | Earnings Hub | numeric columns beside counted `beatRate8q` | `earnings.ts:340-341` |
| Momentum / Quality / Flow sleeves | Stocks | three of four sleeves are hashes; the fourth (news) is derived | `stocks.ts:114-116` |
| RS 1w / RS 1m | Stocks rotation | signed % returns | `stocks.ts:197-198` |
| IV Rank 1Y, IV %ile, RR 25Δ, skew, kurtosis, tail probs | Prove It › Vol Lab | a panel whose whole subject is measured vol statistics | `vollab.ts:103-104`, `144-149` |
| Board ladder $ | Pinpoint flow board | sits beside real chain-derived ladders | `gex.ts:246-259` |
| Chain Chg %, Volume | Compass contract chain | a change column and a volume column | `compass.ts:1001-1006` |

The pattern that works is already in the codebase (a one-line `sub` or a muted `Modeled` chip). It has been
applied to the surfaces somebody audited and not to the rest.

---

## 5. What I did not audit

- **No browser run.** Every measurement here is from executing the engine modules directly under `tsx`. I
  did not screenshot any of it, did not confirm a served build was running, and did not verify that a given
  StatCard is visible at a given viewport. Where I name a screen I traced the render call site by file:line;
  I did not watch it paint.
- **Trailer (`src/pages/trailer/**`, 30 files).** It carries its own hardcoded story numbers
  (`trailerStory.ts:584-649`, e.g. `modelConfidence: 0.63`) and a fourth "Confidence" surface
  (`ConvergenceScene.tsx:43`). I read enough to confirm they are authored constants, not engine output, and
  excluded them: it is a marketing reel, and holding it to the metric dictionary would be a category error.
  If it ships as product, it needs its own pass.
- **`liquidityField.ts`, `gradientField.ts`.** Heatmap intensity fields, normalised to [0,1] / [−1,1] with
  a percentile anchor. They publish a `scale` for a hover read-out; I did not verify the read-out's dollar
  figure against the field's own normalisation.
- **`community.ts`, `tapeSeed.ts`, `timeframe.ts`, `contractflow.ts`, `netpremium.ts`, `swingModel.ts`,
  `statereplay.ts` internals.** Catalogued at the interface level (§2.14) from their doc comments; I did not
  trace every field to its arithmetic.
- **The 21 vitest files.** I did not run the suite, and several of the collisions above (3.1, 3.2, 3.6,
  3.11) are exactly the kind a cross-engine test would catch — `compassCoherence.test.ts` and
  `levels.test.ts` prove the pattern exists. I did not check whether adding assertions for these would
  break anything currently passing.
- **Whether any of the disagreements above are ever visible in one viewport simultaneously.** I established
  that the contradicting values render on the same route (3.3, 3.4, 3.6, 3.13) by tracing call sites. I did
  not measure scroll position or panel layout, so "on one screen" should be read as "on one route".
- **`Setup.rank`, `TradePlan.score`, `TradePlan.confidence`.** I found no render call site for any of the
  three. `rank` is documented as ordering-only; the two plan fields may be genuinely dead. I did not confirm
  they are unreachable — a negative grep is weaker evidence than a positive one.
