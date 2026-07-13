# Slayer Terminal

Dealer-flow analytics terminal — maps the hedging forces that move price, then grades the trades.
Dark theme, animated holographic-silver accent, simulated data feeds (deterministic per session day)
behind real data contracts, so live feeds can drop in without touching page code.

## Modules

| Module | Route | What it does |
| --- | --- | --- |
| **Pulse** | `/pulse` | Live market terminal — chart, dealer pressure matrix, order flow & key levels |
| **Compass** | `/compass` | Options chooser & contract weigher — graded setups, plus weeklies/swings/LEAPS scored on math, flow, dark pool and news |
| **Trace** | `/trace` | Options flow & dark-pool intelligence — prints classified by intent, liquidity shelves with usage guidance |
| **Pinpoint** | `/pinpoint` | GEX & dealer-positioning system — exposure profiles, ranked targets, vanna/charm, vol lab |
| **Prove It** | `/prove-it` | Quantitative modeling & predictive analytics — Monte Carlo, 3D dealer surface, model scoreboard |
| **Stocks** | `/stocks` | Common-stock board — ranked picks and sector rotation |
| **News** | `/news` | Stock news wire + predicted outcome per headline |
| **Earnings** | `/earnings` | Earnings hub — implied vs realized move, play it or fade it |

## Development

```bash
npm install
npm run dev        # vite dev server
npm run build      # typecheck + production build
npm run preview    # serve the production build
npm run typecheck  # tsc only
```

Stack: React 18 · TypeScript · Vite · Tailwind CSS · framer-motion · lightweight-charts.
