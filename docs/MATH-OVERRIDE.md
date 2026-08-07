# Dropping in the real math

The terminal ships on **snapshot math** — placeholder Black-Scholes that exists so
the UI has something to render. It is not the house model and does not claim to
be. This is how you replace it.

## The one-liner

```ts
// src/main.tsx (or anywhere that runs once, before render)
import { setMathProvider } from './core/mathProvider';
import { houseMath } from './myRealMath';

setMathProvider(houseMath);
```

That is the whole integration. Everything below is why it works and what it
reaches.

## What you implement

The contract is `MathProvider` in `src/core/mathProvider.ts`. Implement all of it
or any part — a partial provider **merges** over the snapshot, so you can land
pricing first and leave the rest on placeholders:

```ts
setMathProvider({ id: 'house', optionPrice: myPrice, optionGreeks: myGreeks });
// ivRank, realizedVol, the unit conventions etc. stay on snapshot until you
// name them.
```

| Method | What it owns |
|---|---|
| `optionPrice(spot, strike, ivAnnual, tYears, right)` | Theoretical price |
| `optionGreeks(...)` | The greek vector — 1st order required, 2nd/3rd optional |
| `yearsToExpiry(dte)` | The DTE→years convention (day-count basis + the 0DTE floor) |
| `normCdf` / `normPdf` | Probability primitives |
| `ivRank(series, current)` | Rank + percentile |
| `realizedVol(closes, barsPerYear)` | Annualized realized vol |
| `gammaDollars` / `deltaDollars` | The $-exposure unit conventions |
| `riskFreeRate` | Discounting rate |

**Time is `tYears` everywhere, never a day count.** The DTE→years convention is
its own knob, so you can change the day-count basis without touching the pricer.

### Conventions the UI reads

These are what the panels assume. Match them, or override the consumers too:

- `vega` is per **one vol point** (σ +0.01)
- `theta` is per **calendar day**
- `rho` is per **one percentage point** of rate
- `gammaDollars` is **$ per 1% underlying move**

## What it reaches

Registering a provider restates all of this at once:

- the option chain and therefore **every GEX / DEX / VEX number on Pinpoint**
- the Compass setups board, contract chain, Weigher and Lotto
- the contract track's forward curve
- trade-stamped greeks on the Trace tape → the **Gamma Tape** dealer book
- the structures board (verticals, condors, butterflies, straddles)
- IV rank on the Vol Lab, the Earnings Hub and the Vol Complex
- realized vol and the vol risk premium
- the surface-QC arbitrage checks

`mathProvider.test.ts` proves this: it registers a sentinel model and asserts each
of those surfaces reports the sentinel. **If someone later reintroduces a private
pricer that bypasses the seam, that test fails.** That guard is the reason the
override is trustworthy rather than merely intended.

### Why the consolidation mattered

Before the seam the app carried **seven copies of the normal CDF** and **four
separate Black-Scholes implementations** (`core/contractScore`, `core/simulator`,
`data/flowtape`, `components/compass/contractTrackModel`), and they were not even
the same approximation — two different polynomial families, and the chain priced
at `r = 0.05` while every other pricer used `r = 0.045`.

Replacing one of them would have overridden roughly a quarter of the terminal
while the rest kept quoting the old model — two panels on one screen disagreeing,
which is the exact failure this codebase's coherence suites exist to prevent.
There is now one implementation, behind one seam.

## What it does NOT reach

Honest boundary. These are **product models**, not math primitives — they consume
the primitives (so they inherit your override automatically) but their own shape
lives in `src/data/`:

| Model | File |
|---|---|
| Higher-order greek surface (veta, zomma, speed, color, ultima) | `data/greeksmatrix.ts` |
| Flow information score (informed vs noise) | `data/informedFlow.ts` |
| Gamma roll-off density across expiries | `data/gammaRolloff.ts` |
| Surface-QC tolerances | `data/surfaceIntegrity.ts` |
| Contract scoring weights | `core/contractScore.ts` |

If your files also replace these, say so and they get the same treatment — a
second seam for product models is a small change now that the pattern exists.

## Mechanics worth knowing

- **Late-bound.** Call sites read through the `math` accessor at call time, never
  a captured import, so a provider registered after modules load still reaches
  every consumer. (`mathProvider.test.ts` pins this too.)
- **Pure.** Every method must be a pure function — same inputs, same output, no
  clock, no global state. The desks depend on being reproducible within a tick.
- **`resetMathProvider()`** restores the snapshot; tests use it for isolation.
- **`mathSourceId()` / `isSnapshotMath()`** report which model is answering, so
  the UI can label a screen honestly while it is still on placeholders.

## What stays out of the model

Two things deliberately live at the call site, not in the seam, because they are
market conventions rather than model properties — replacing the math must not
silently remove them:

- the **$0.02 quote floor** (`QUOTE_FLOOR` in `core/contractScore.ts`, `BS_FLOOR`
  in `contractTrackModel.ts`)
- the simulator's **degenerate-input floors** on time and vol
