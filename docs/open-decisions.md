# Open decisions

Ten things this pass found, measured, and then stopped at — because
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

## 8. Eighteen of the twenty-two recordings run out in under two minutes

**Where:** `src/data/recorded/` (the recordings), `src/core/feed.ts:141` (`START_SHARE`)
**Scope:** the recordings themselves. Not UI.

Playback is finite and the recordings are two different lengths. Ticked
headless by `scripts/playback-proof.ts`, and confirmed by watching a
browser for twelve minutes:

```
                     bars   starts at   runway    real time
SPY QQQ AAPL NVDA    1950        1561   389 ticks   9m45s
the other eighteen    390         313    77 ticks   1m57s
the tape             1013 prints          255 ticks   6m23s
```

`START_SHARE = 0.8` is what makes the short ones short: a 390-bar
recording starts at bar 313, so it has 77 bars left. Open the terminal,
switch to TSLA or AMD, and its price is frozen **within two minutes** —
and stays frozen for as long as the tab is open, because the playhead
holds rather than loops. Holding is right; the comment in `feed.ts`
argues it well, and looping would restate prices the reader watched move
on. The problem is not the holding, it is how soon it starts.

The terminal now *says* so — the header prints "recording played out" and
the tape says it in its beam subtitle — which is the honest interim and
was the part I could fix. What it cannot do is give you more market.

**Three ways out, in the order I would take them:**

1. **Re-record the eighteen at the same depth as the four.** 1,950 bars
   is five sessions; the four watchlist names already have it. This is
   the only option that removes the difference rather than managing it.
2. **Lower `START_SHARE` for the short names only** — 0.2 would give a
   390-bar recording 311 ticks, about 7m47s, at the cost of two hours of
   chart history behind the playhead. Cheap, and it makes the desks
   inconsistent in a second way instead of the first.
3. **Leave it and let the label carry it.** Defensible for a demo that
   nobody sits in front of for two minutes. Not defensible for a
   recorded session you hand to somebody to explore.

**Recommendation:** (1). The four long names prove the recorder can
already do it, so this is a re-run of a script rather than new work — but
it is a data change, which is why it stopped here.

---

## 9. Two dependency advisories need a major-version upgrade

**Where:** `package.json` — `react-router-dom ^6.24.0`, `vite ^5.3.1`
**Scope:** dependency majors. Migration work, not UI.

`npm audit` reported six advisories. Four are now closed by patches that
fit inside the ranges already declared, applied and re-verified:

```
postcss   8.5.16 -> 8.5.26   two path-traversal advisories, one HIGH
nanoid     3.3.17 -> 3.3.18   two infinite-loop advisories, both HIGH
```

Both are build-time only — they process our own CSS during `vite build`
and never reach a browser.

**Two remain, and each needs a major.** I did not take either.

| package | advisory | fix | reachable here? |
| --- | --- | --- | --- |
| `react-router` | open redirect via backslash in `<Link>`/`useNavigate` | react-router-dom **7** | **no** — every route target in the tree is a literal or is built from recorded ticker data. The command palette navigates to `item.path` from static lists; nothing derives a route from user input or from the URL |
| `react-router` | constructor injection via `deserializeErrors()` in SSR hydration | react-router-dom **7** | **no** — `src/main.tsx` calls `createRoot`, not `hydrateRoot`. There is no server entry and no `ssr` config. The code path does not exist in this build |
| `vite` / `esbuild` | dev-server request forgery, `server.fs.deny` bypass on Windows, `.map` path traversal, NTLM disclosure via UNC paths | vite **8** | **not in production** — all four are `npm run dev` issues, three of them Windows-specific. None touches the built artefact |

Note the one still marked HIGH is in that last row: it is a Windows dev
server, not the deployed site.

The router bump I *did* apply — 6.30.4 → 6.30.6 — does **not** clear its
advisories; the flagged range is `6.0.0 – 7.17.0` and 6.30.6 is inside it.
It was worth taking for the other fixes in the patch, and it is verified
(16 routes re-swept after the bump, element counts identical on every
one), but it should not be read as closing anything.

**Recommendation:** React Router 6 → 7 first, since it is the one that
ships to a browser, even though nothing here can reach it today — the
guarantee "no route target comes from user input" is one refactor away
from being false, and it is not asserted anywhere. Vite 5 → 8 second, on
its own, because a build-tool major moves the output.

---

## 10. The host sends 2.9MB uncompressed, and the landing page takes 15 seconds on a phone

**Where:** `server.ts` (the host), `vite.config.ts` (the bundle)
**Scope:** depends on where this deploys — which is the actual question.

`vite build` has been warning about a chunk over 500kB on every build.
Measured what that costs, cold cache, Chrome's own Slow 4G profile
(~1.6 Mbps, 150ms RTT):

```
                            wire      first contentful paint
committed host (no gzip)   2.92MB              15,312 ms
same bundle, gzipped       1.01MB               5,696 ms
```

Nine and a half seconds, for one middleware. The bundle is unchanged —
that is purely the bytes on the wire. `gzip -9` on the main chunk alone
takes it from 2.7MB to 838K.

Warm figures are fine either way and worth stating so this is not
mistaken for a general performance problem: an in-app route change is
**69–91ms** and touches no network at all, and a cached reload is
**61–230ms**. It is *only* the first visit by a stranger.

**Why this is not simply fixed and pushed.** `vercel.json` did not
configure compression — Vercel just does it, as do Netlify, CloudFront
and every other static host. So unlike the security headers, this was
never in a file that got deleted; it is missing only if `server.ts` is
what actually serves production. I do not know that, and the answer
changes whether this is a nine-second win or a no-op.

**Three options:**

1. **If a platform serves it** (Vercel and friends) — do nothing. You
   already have this, and `server.ts` is a local convenience.
2. **If `server.ts` serves it** — `npm i compression` and two lines. It
   is the standard express middleware and there is no cleverness in it.
   Verified in a throwaway host on port 8082: all 16 routes render, 0 CSP
   violations, 0 console errors.
3. **Split the bundle as well.** 2.67MB of JS is a lot even compressed,
   and the composition says why: recharts, framer-motion, lightweight-charts,
   react-grid-layout and lucide all load on the landing page, which uses
   almost none of them. Route-level `React.lazy` would defer them. The
   pattern already exists here — the ticker universe (327KB) and
   ContractFlowChart are both lazy already. This is real work and touches
   how every route mounts.

**Recommendation:** answer the deploy question first, since (1) may make
this moot. If `server.ts` ships, take (2) immediately — it is nine
seconds for two lines. Take (3) only if the first-visit number still
matters after compression, and as its own pass.

---

## What was checked and found clean

Recorded so it is not paid for twice.

Two of these were measured from actual rendered pixels — contrast, and
whether focusing a control changes anything on screen. The rest are
geometry: element rectangles, scroll widths, clip chains. Both are
measurements of the running page; neither is a reading of the source.

Where a detector could be mutation-verified — inject the defect, watch it
get caught — it was, and it says so. The sideways-scroll and popover
sweeps were not mutation-tested against a synthetic defect; they were
verified by the before/after on real ones, which is weaker evidence for
the detector and stronger for the fix.

| dimension | coverage | result |
| --- | --- | --- |
| WCAG contrast | 3,126 text nodes sampled from rendered pixels — 16 routes × 2 viewports, 121 distinct fg/bg pairs. Mutation-verified | one real failure, fixed: the spot rule's ticker on the gold pressure bar, 1.21:1 → 6.58:1. One reported failure was the sampler's own fault (see below) |
| Tooltip edge positioning | 32 tooltips opened at edge positions | none leaves the viewport |
| Focus rings | 457 tab stops walked across 15 routes, each checked for a rendered focus indicator | zero with no visible focus, zero focused off-view. 451 cleared on the computed ring, 6 needed a pixel test and passed it |
| Reduced motion | every infinite CSS animation and Tailwind loop utility | covered — three were not, and are now |
| Keyboard reachability | 9 non-native clickable elements, plus the 457-stop tab walk above | all reachable; PositioningMap's 21-band roving tabindex verified correct against WCAG 2.5.8 |
| Text overflow | 15 routes × 390 / 768 / 1280 / 1600 — 64 page loads | zero spilling text nodes |
| Under-filled panels | 15 routes, any panel with >60px of dead space at the bottom. Mutation-verified (an injected 219px void was caught) | zero |
| Unreachable content | 15 routes × 7 viewports — 390, 768, 1024, 1280, 1366, 1440, 1920 — 105 page loads. Mutation-verified | zero |
| Popovers and dropdowns | every `aria-haspopup` / `aria-expanded` trigger on 10 routes, opened at 390 and 1440 | 63 opened, none landing outside the viewport |
| Sideways page scroll | 15 routes × 390 / 768 / 1280 / 1440, before and after | five routes made `<main>` wider than a 390px screen — Stocks by 257px, Pinpoint's ranked ladder by 85, the tape's beam by 97, and two by the sub-page tab strip. Nothing at 768 or above. All five fixed; re-measured 60 page loads, **zero** |
| Always-zero readouts | every route sampled 5× over 8s; any value that was zero-shaped in all five, with its label | one real find, fixed: Vanna & Charm's "moved most since last scan". Three false positives worth naming — see below |
| Accessible names | every button, link, input, select, textarea and tab stop on 16 routes — the name computed the way a browser does | **zero nameless controls.** An icon-only button with no label announces as "button" and nothing else; there are none |
| Heading outline | every visible h1–h6 in document order, 16 routes | 12 skips, all the same shape — one h1 then straight to h3, because Panel titled itself h3. Fixed at the one component; re-measured 0. Two duplicate ids remain on /pulse/board, both injected by lightweight-charts' own attribution markup, one per chart |
| Deployed weight | every file under `public/`, checked for a reference anywhere in src, index.html, docs or scripts | `public/assets` held 19 PNGs, 2.1MB, **not one of them referenced** — five pairs byte-identical, and one a screenshot of a feature already deleted. 38% of the build. Removed: 5.5MB → 3.4MB |
| Every internal link | all 17 distinct targets, harvested from the rendered DOM across 16 routes, then followed | **zero dead.** Three "divert" — `/trace`, `/pinpoint`, `/community` land on their default sub-page, which is what a section link should do. The real finding was semantic and the sweep could not see it: a footer *labelled* Launch Terminal that pointed at the marketing page it sits on |
| Console output | every route, errors and warnings, with the page scrolled and settled | one warning, on 15 of 16 routes, and it is safe to ignore — see below |
| Who the app talks to | every network request on every route | **one host: itself.** 94 requests, all to the local origin. No analytics, no CDN, no font host, no third party of any kind. Zero failed requests, zero 4xx/5xx |
| Corrupt saved state | 5 localStorage keys × 8 kinds of bad value — not JSON, wrong type, null, empty, right container with wrong members, deeply nested — across 5 routes, 200 page loads | nothing broke: 0 blank pages, 0 uncaught errors. The read paths all guard. Two **write** paths did not, and now do |
| Free-text robustness | a 400-char unbroken token, a pasted URL and long prose posted through the community composer | the token made `<main>` 2041px wider than a 1440px viewport and the URL 748px — the terminal slid sideways off one post. Prose was fine, which is why nothing caught it. Fixed; re-measured 0 |
| Stateful journeys | tracking a campaign, posting an idea, marking a print, the desk layout — each driven in a browser and reloaded | 11 of 11. Everything the UI promises to keep is kept, except the tape's print marks, which never claimed to and now say so |
| Header fit | 768px, every route | fits at exactly 768 after the labels-only ladder |
| Company-mark licensing | the 17 SVGs in `public/logos` | clean — Simple Icons, CC0. Provenance and the trademark caveat are now recorded in `public/logos/README.md`; unlike the SF Pro problem, nothing here needed replacing |
| End of recording | playback ticked to exhaustion headless, and watched in a browser for twelve minutes on the tape. Mutation-verified — looping the tape, looping the playhead, advancing two bars a tick, or re-cutting the recordings to one length each fail a different assertion | **two real finds, both fixed.** The tape went quiet at 6m23s and the price froze at 9m45s while the pill still read LIVE and every animation kept running. Nothing said so: `feed.ts` had exported `atEnd()` with the comment *"the UI may want to say so"* since it was written, with no caller. The header and the tape now say it. See #8 for the part that is not a UI fix |
| Deployed security headers | the five headers the old `vercel.json` carried, checked against the express host that replaced it; then the policy served to a real browser on all 16 routes | **a real regression, fixed.** `f7be84a` replaced the tracked tree and took `vercel.json` with it — the content-security policy, the clickjacking refusal, the MIME-sniffing refusal, the referrer policy and the permissions policy all went with it, in a commit about something else, and nothing failed for fifty commits. Restored verbatim onto `server.ts`. Swept: **0 CSP violations, 0 console errors, 0 blank pages.** The sweep is not taken on trust — tightening `style-src` made it report 5, so it can see one |
| Dependency advisories | `npm audit`, production and dev trees, each advisory read against the code that would have to reach it | 6 found. **4 closed** by in-range patches — postcss 8.5.16 → 8.5.26 and nanoid 3.3.17 → 3.3.18, both HIGH, both build-time only. 2 remain and need majors; neither is reachable in this build (no route target comes from user input; `createRoot`, not `hydrateRoot`) and the four vite/esbuild ones are dev-server only. See #9 |
| Resize while mounted | 13 routes mounted at 1440, then dragged 1440 → 390 → 768 → 1440 — 39 resizes. Every previous sweep loaded fresh at each width, which proves nothing about a window being dragged | **one real find, fixed.** The Monte Carlo canvas on /prove-it sized its backing store inside an effect keyed on the market data alone, so its pixels were resized by a PRICE TICK and by nothing else — stretched for 950–1507ms, the length of one feed tick. Worse once a recording pins: with AMD played out, it stayed at 771px backing for a 734px box at t+500ms, 1.5s, 3s, 6s and 10s. Permanently. Now observes its own width. Twelve of thirteen routes were clean through all three resizes; the thirteenth is /pulse at 390px, which is #6, already open |
| First load, cold, throttled | the landing page over Chrome's Slow 4G and Fast 4G profiles with an empty cache, wire bytes read from CDP rather than from headers | 2.92MB, **first contentful paint at 15.3s** on Slow 4G. The same bundle gzipped is 1.01MB and paints at **5.7s**. Warm is fine and always was — an in-app route change is 69–91ms with no network, a cached reload 61–230ms. See #10; not fixed here because it depends on where this deploys |
| White-screen resistance | a throw wired to a query parameter and built, fired from three places: the landing page, a desk page, and the shell's own chrome | **two real gaps, fixed.** A desk page throwing was caught — the fault panel rendered with the header intact. The landing page throwing and TopBar throwing each gave **0 characters and 15 elements**: nothing to read, nothing to click. Both sit outside AppShell's boundary — the landing page is routed outside AppShell entirely, and TopBar renders above the `<Outlet />`, not inside it. The whole route tree is now wrapped too; all three re-tested and all three render the panel with a working Reload |
| Keyboard use of the overlays | both overlays opened and driven from the keyboard: where focus lands, whether Tab escapes, whether Escape closes, where focus goes afterwards | **the same defect in both, fixed.** The drilldown moved focus nowhere on open — it stayed on the tape row behind, so the first Tab walked the tape *under* the card. The palette focused its input, then the first Tab landed on a control on the desk behind. The palette also never announced itself as a dialog; Modal had `role="dialog"` all along. Now: focus lands inside, 80 forward tabs and 40 backward never leave, Escape closes, focus returns to the row it came from. The 457-stop ring walk could not have seen any of this — it measures the resting page |
| Chart label collisions | /pulse/board, four charts | two found and fixed: the trails' strength labels drew under the axis badges at the same strike, and their own backing pad was mis-centred |
| Click-gated surfaces | the command palette, the print drilldown, Campaign Analysis — at 390 / 768 / 1440 | two found and fixed: the timeframe strip put `1W` off the screen with nothing to scroll, and the modal header spent 32% of a phone on itself |

Five notes on method, because a measurement is only worth what its failure
modes are worth — and four of these were my own measurement being wrong
before the product was:

- **An earlier contrast detector reported 47 failures. All 47 were false.** It walked up the DOM for a background colour, which finds nothing on a gradient and finds the wrong thing when the coloured element is a `layoutId` sibling rather than a parent. Sampling the rendered pixels instead is what turned 47 noisy failures into 1 real one.
- **Every sweep before this one ran against pages in their default state.** A drawer, a modal, or a view behind a button was in none of them — and two of the three carried a defect. Anything measured route-by-route is measuring the front door only.
- **A viewport-relative measurement is not a reachability measurement.** Three separate times a control looked unreachable and was not: content below the fold on `/pulse/board` at 390px scrolls fine, because the scroll container is `main`, not the document. Walk the ancestors for an `overflow-y: auto` that actually has somewhere to go; `document.documentElement.scrollHeight` answers a different question.
- **A screenshot of an element does not contain that element's focus ring.** The house ring is `outline: 1px solid rgba(210,255,0,0.6)` at `outline-offset: 1px` — drawn entirely outside the border box, which is exactly what `elementHandle.screenshot()` clips to. The first version of the tab walk pixel-diffed those and reported every ringed control in the app as having no visible focus. The fix is to clip the page with an 8px margin instead; the second version clears 451 of 457 stops on computed style and only reaches for pixels on the remaining 6.
- **The font preload warning is not a bug, and ripping out the preload would make things worse.** Chromium says `Inter.var.woff2 was preloaded using link preload but not used within a few seconds from the window's load event` on 15 of 16 routes. Measured: the font is requested **once**, starts at 11ms, finishes at 18ms, `document.fonts.ready` resolves at 399ms — and first contentful paint is at 488ms. The font is ready *before* anything is painted. There is no double fetch and no flash of fallback text; the warning is Chromium's heuristic not seeing a glyph attached to the preload inside its own window, which is what a React SPA looks like. Leave it. (An earlier reading of `document.fonts.ready` at 6376ms was my own `waitForTimeout(6000)` — the promise had resolved long before I asked what time it was.)
- **A zero is not automatically a lie, and this detector needed three corrections of my own reading.** It flagged 20 always-zero cells on Compass's impact rail; dumping the rail showed ranks 1–8 running 32.6% down to 2.4% with real exposures — those zeros are the *tail* of a 24-deep leaderboard, which is what a tail looks like. It flagged `0d` on the tape, which is a 0DTE contract and exactly right. It flagged `—` in the open-interest-change column, which is the deliberate render for "unchanged". What it did find was `-$0`, printed beside `$0` down one column of the ranked-targets rail — the same quantity in two renderings, because the formatter took its sign from the raw value and its magnitude from a rounded one.
- **`atEnd()` was the obvious caller to add and the wrong one.** It is true only once *every* recording has finished — tick 389. A short name pins at tick 78. Wiring the header to it would have left AMD's price frozen and unremarked for 7m47s because SPY was still playing, which is the same shape of defect as the thing it was fixing. The header reads `priceHistory.length` per name instead, from the snapshot the UI already holds, and `playback-proof.ts` asserts the gap so that re-cutting the recordings to one length fails the check rather than passing it silently. My first pass at this got the arithmetic wrong in the other direction too — I put "48.7 minutes" in a code comment, having forgotten `START_SHARE` moves the playhead 80% in before the first tick. Ticking the real feed is what corrected it.
- **`style-src 'unsafe-inline'` is load-bearing, and not for the reason it looks like.** Serving the real bundle under `style-src 'self'` refused exactly 5 things: 1 on /pulse, 4 on /pulse/board, nothing on the other fourteen routes. One per chart — `lightweight-charts` calls `document.createElement('style')` per instance to style its TradingView attribution logo, the same third-party markup that puts the two duplicate ids on /pulse/board. The violated directive is `style-src-elem`, which governs `<style>` **elements**; it is not `style-src-attr`, because React and framer-motion set styles through the CSSOM, which CSP does not govern at all. So the app's own animation would survive a fully strict style policy untouched, and a dependency's logo is the only thing standing in the way. I had written the opposite into a comment before measuring it.
- **A `truncate` is not a spill, and the first resize detector could not tell.** It reported 18 failures; 14 were Panel titles and subtitles wearing Tailwind's `truncate` — `overflow:hidden`, `nowrap`, `text-overflow:ellipsis`. `Range.getBoundingClientRect()` returns the **unclipped** width of a text node, so a title rendering correctly as `Strike Press…` measures 121px past its box. Skipping any element that has asked to be ellipsised took it to 4, and the one that mattered was not text at all. The general lesson is the one that keeps recurring here: a measurement that cannot distinguish a deliberate design from a defect will hand you a list where most entries are the design.
- **A throttle does not apply to the first document a browser context ever requests, and that made compression look worthless.** Measured with and without gzip and got first contentful paint of 15,300ms **both times**, to the millisecond — which would mean compression buys nothing, against the plain physics of 2.92MB versus 1.01MB on a 1.6 Mbps link. The throttle was set on a fresh page and then the navigation was issued; it did not take. Landing on a trivial document first, so the emulation is provably live, gives 15,312ms against 5,696ms. The tell was that the two numbers were identical rather than merely close: real measurements of two different things are not equal to the millisecond, and that should have been read as an instrument fault immediately rather than as a result.
- **Twice in one sitting I reported a defect in something I had never opened.** The first focus sweep tabbed for a tape row, pressed Enter on the first candidate, and — having opened nothing — ran its checks against the resting page and declared the drilldown had no `role="dialog"`. `Modal.tsx` has carried `role`, `aria-modal` and `aria-label` since it was written. The same run measured "does focus return to the opener" *after* walking focus 30 times, so it was measuring nothing. Both were rewritten to refuse to check anything until the overlay is confirmed up, and to test containment and return as two separate openings. A probe that cannot tell "this is broken" from "I did not reach it" reports the second as the first, every time.
- **The pixel sampler still reported one false failure**, and it is worth naming: `textMuted` on a Pulse expiry tab, 4.18:1. Screenshotting that exact button by element handle put it on `bg-panel` at **4.81:1** — it passes. The full-page sampler had collected the rect and the pixels a fraction apart on a desk that was still settling, so it compared a colour against pixels the active chip had moved into. I filtered for rects that were identical before and after the capture, which was not enough: a rect can hold still while what is painted in it changes. Anything that sampler flags is worth re-shooting by element handle before it is believed.
