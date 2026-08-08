# Slayer Terminal

Dealer-flow analytics terminal — maps the hedging forces that move price, then grades the trades.
Dark theme, animated holographic-silver accent, simulated data feeds (deterministic per session day)
behind real data contracts, so live feeds can drop in without touching page code.

`/` is the public landing page. `/terminal` is the desk index behind it.

## Desks

Four groups, in the order the work happens. The registry is `src/components/layout/nav.ts` —
the nav, the command palette, the sitemap and the document titles all read it, so a desk is
added in one place.

| Group | Desk | Route | What it does |
| --- | --- | --- | --- |
| Scan | **Compass** | `/compass` | Options chooser: weeklies, swings and LEAPS, weighed and graded |
| Scan | **Stocks** | `/stocks` | Ranked equity picks and sector rotation, across momentum / quality / flow / news |
| Scan | **Trace** | `/trace` | Options flow and dark-pool prints, and what they mean |
| Read | **Pulse** | `/pulse` | The market desk: chart, dealer pressure, order flow and the options tape |
| Read | **Pinpoint** | `/pinpoint` | GEX, dealer positioning, hedge impact and the fracture line |
| Read | **Earnings** | `/earnings` | Implied against realized, play it or fade it |
| Yours | **Tracker** | `/tracker` | Bookmarked setups, contracts and names, watched in one place |
| Yours | **Community** | `/community` | Trade ideas, requests and feedback |
| Models | **Prove It** | `/prove-it` | Quantitative modeling and predictive analytics |

Reference pages sit outside the desk groups: `/guide` (overview, desk how-tos, concepts,
FAQ, shortcuts) and `/legal/{disclaimer,terms,privacy}`. `/trailer` is a standalone film of
the whole terminal working one event.

## Development

Node version is pinned in `.nvmrc` (`nvm use` reads it, and so does CI).

```bash
npm install
npm run dev        # vite dev server
npm run build      # typecheck + production build
npm run preview    # vite's preview server
npm run serve      # serve dist/ the way a static host would (headers, 404s, cache)
```

## The gate

CI runs the first four on every push and pull request (`.github/workflows/ci.yml`).
Run them in this order locally — each is cheap enough that there is no reason not to.

```bash
npm run typecheck  # tsc, app + node configs
npm run lint       # eslint, including the .mjs tooling
npm test           # vitest
npm run build      # tsc + vite build
```

Two more do not run on the gate, because they take minutes rather than seconds:

```bash
npm run test:dates          # the whole suite across N simulated dates
npm run audit:ui            # browser sweep: contrast, focus, overflow, tap targets
npm run audit:ui:self-test  # checks the audit's own colour maths against published anchors
```

`test:dates` exists because the suite reads the real clock on purpose. Freezing it would
make a date-fragile assertion invisible rather than absent, so instead the clock stays real
and this sweeps it — an assertion that encodes one day's expiry ladder goes red here rather
than on a random Tuesday. `.github/workflows/date-sweep.yml` runs it weekly.

## What the tests hold in place

Beyond the usual unit coverage, a few suites exist to stop specific things drifting:

| Guard | Holds |
| --- | --- |
| `src/lib/palette.test.ts` | The colour budget. Holographic silver, white and black, plus eight hues that may only colour the market |
| `src/lib/designSystem.test.ts` | `design-system/*.html` cannot advertise a token `tailwind.config.ts` does not define |
| `src/lib/routes.test.ts` | Every internal link resolves against the route table in `App.tsx` |
| `src/lib/sitemap.test.ts` | `public/sitemap.xml` matches the nav registry exactly |
| `src/components/ui/focusRing.test.ts` | Nothing removes a focus outline without replacing it |
| `src/core/calendar.test.ts` | Market holidays, sessions and expiry resolution — with two years of lead time on the table running out |

`design-system/*.html` are standalone specimens: open one in a browser to see the tokens,
chart inks and surfaces as they actually ship.

Stack: React 18 · TypeScript · Vite · Tailwind CSS · framer-motion · recharts ·
lightweight-charts · three.js · react-grid-layout. Tests on Vitest, lint on ESLint.
