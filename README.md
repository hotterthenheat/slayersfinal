# Slayer Terminal

An options terminal built around dealer positioning: where market makers
are hedged, what that structure does to price, and which contracts trade
against it.

The whole product is a React SPA. There is no server-side rendering, no
database and no API — `server.ts` exists only to serve the built `dist/`
with SPA fallback.

---

## Running it

Node **22** (`.nvmrc`; CI reads the same file, so the version that decides
a green build is the one `nvm use` gives you).

```bash
npm ci
npm run dev          # vite dev server
npm run build        # tsc --noEmit && vite build  ->  dist/
npm run preview      # serve dist/ with vite
npm run serve        # serve dist/ with express on PORT (default 8080)
```

The gate, in the order CI runs it:

```bash
npm run typecheck    # tsc over the app AND tsconfig.node.json
npm test             # the proof scripts (below)
npm run build
```

There is **no lint step**, deliberately: this tree ships no ESLint config,
so `npm run lint` would be "Missing script" and fail every push without
saying anything about the code. `.github/workflows/ci.yml` says the same
thing where it would otherwise be a silent omission.

---

## The proof scripts

`npm test` runs seven scripts under `scripts/`. They are not unit tests —
there is no test runner in this tree. Each one asserts a fact about the
codebase that nothing else can catch: `tsc` cannot see that a pricing page
sells a feature which does not exist, and a human reading a diff of
`src/core` cannot either.

| script | what it holds |
| --- | --- |
| `fixture-proof` | the partner spec's worked numbers still come out of the real modules |
| `replay-proof` | the replay seams, run against the actual engine modules |
| `weigher-query-proof` | the Weigher's contract-line parser stays order-free |
| `weights-proof` | the scoring weights sum to one; the News desk stays unwired |
| `sales-proof` | no sentence on the landing page sells something the code does not ship — **and none of it goes stale when a feature lands** |
| `font-proof` | one family name across four spellings; no platform font vendored |
| `layout-proof` | the header fits, panels measure themselves, controls stay reachable |

**The standard these are held to is mutation verification**: put the defect
back, watch the assertion fail, then restore. An assertion that has never
failed has proved nothing, and this repo has caught itself writing several
of those — a guard satisfied by a code comment, a regex that stopped at
the first quote it met, a scan that passed on a `/* ... */` block. If you
add an assertion, break the thing it guards before you trust it. The prose
at the top of each script records what was measured, and where the
measurement was wrong the first time.

---

## Where the market comes from

Everything price-shaped reaches the UI through **one module**:
`src/core/feed.ts`. Today it plays back a recording (`src/data/recorded/`)
— a real session, inspectable, that cannot invent a different number on
refresh. When live feeds land they replace the body of that file and
nothing above it changes.

Four research desks are **not** on that seam yet and build their numbers
from a hash seed: `data/stocks.ts`, `data/earnings.ts`, `data/news.ts`,
`data/contractflow.ts`. The landing FAQ names them rather than claiming
otherwise, and `sales-proof` derives that list from the imports so the copy
cannot drift out of step in either direction.

The header carries a **Sim** badge on every route for as long as that is
true.

---

## Layout of the tree

```
src/
  core/          feed seam, both clocks, calendar, greeks, rng, scoring, journal
  data/          per-desk view builders (gex, compass, tape, exposure, …)
  components/    shared UI, plus per-engine component folders
  pages/         one folder per desk; pages/landing is the marketing site
  types/         the shared shapes every layer agrees on
scripts/         the proof scripts npm test runs
docs/            design decisions and what is still open
public/logos/    company marks (see the README in that folder)
```

`docs/open-decisions.md` is the short list of things that are measured,
understood, and waiting on a human — including what was checked and found
clean, so nobody pays for that twice.
