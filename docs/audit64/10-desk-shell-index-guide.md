# 10 — Terminal Index · Guide · Community · Legal · the global shell

**Gates 10, 43, 59** (+ 13, 17, 63 applied) · Slayer Terminal · audit date 2026-08-03
Target: the production build already served at `http://127.0.0.1:8123` (SPA fallback on). No rebuild, no restart, no file under `src/` touched.
Browser: Playwright 1.61.1 / Chromium 1194. Viewports **1440×900** and **390×844**. `slayer_onboarded_v1=1` pre-seeded, `**fonts.g**` aborted.

Scratch scripts (all re-runnable):
`/tmp/claude-0/-home-user-slayersfinal/61510a72-f878-56b9-9620-dab6cb6adbf2/scratchpad/G10_{shots,shots2,interact,interact2,axe,final,sort,crops,dup,eject,tickerclaim,footer2}.mjs`
Raw logs: `G10_{interact,interact2,axe,final}.txt`, `G10_shots.json`. Screenshots: `/home/user/slayersfinal/docs/audit64/shots/G10_*.png` (24 route captures + 8 evidence crops).

---

## 0. Headline

**Nothing in scope is broken and nothing in scope is inaccessible.** 12 routes × 2 viewports = 24 page loads,
**0 page errors, 0 application console errors** (the single `net::ERR_FAILED` on every load is my own
`**fonts.g**` abort), **0 axe-core violations at either viewport**, lowest measured contrast 4.95:1, no
horizontal overflow anywhere. Every tab, filter, sort, `<details>`, TOC anchor, drawer and overlay I clicked
did what its label said. The Community composer is a genuinely data-driven signature interaction. The
Terminal Index's Resume row works exactly as documented.

The failures are of **truthfulness and of context**, and there are three of them:

1. **The Guide describes a Compass that no longer exists.** `Desks.tsx:88` states the board is "a same-day and
   next-day instrument" whose six presets "are all 0DTE or 1DTE." The shipped desk carries a five-sleeve strip
   ending at **`LEAPS 365DTE · 08/03/27`** — screenshot `G10_claimcheck_compass_1440x900.png`. The Guide also
   documents 2 of the desk's 5 control groups.
2. **Nothing in the product's legal or help surface says the market data is simulated.** `grep` finds **zero**
   `fetch(`, `WebSocket`, `EventSource` or `axios` calls in all of `src/`; every price on every desk comes from
   `src/core/simulator.ts`. Meanwhile `Terms.tsx:76` affirmatively states "The Service may display data or
   content sourced from third parties," and `Faq.tsx:22` answers *"How current is the data?"* with "Prices,
   levels and flow update continuously while the terminal is open."
3. **The "global grammar" the brief asks for is one wall clock.** Measured across 16 shell routes, the top bar
   carries the wordmark, four nav groups, a search button, a settings button, and `HH:MM:SS ET` from
   `new Date()`. The active symbol appears on 6 of 16; it **resets to SPY on every reload** and is not in the
   URL. There is no data timestamp, no freshness state and no session state anywhere in the shell — Compass
   already computes all three (`components/compass/Freshness.tsx`) and they die at the desk boundary.

And the Terminal Index, which the brief asks to be an operational map, contains **zero product data** — 0
numeric tokens measured in `main.innerText` — while **15 of its 26 unique destinations are repeated verbatim**
in the 503px marketing sitemap directly beneath it.

---

## 1. What I opened, and what it measured

`node G10_shots2.mjs` — full-height captures (the shell is `h-screen overflow-hidden` with the scroll on
`#main-content`, so `fullPage` clips; I resized the viewport to the content height instead).

| Route | 1440 content h | 390 content h | axe (both vp) | errors |
|---|---:|---:|---:|---:|
| `/terminal` | 1216 | 2334 | 0 | 0 |
| `/guide/overview` | 1484 | 2646 | 0 | 0 |
| `/guide/desks` | 4328 | 8767 | 0 | 0 |
| `/guide/concepts` | 2359 | 4180 | 0 | 0 |
| `/guide/faq` | 1335 | 1739 | 0 | 0 |
| `/guide/shortcuts` | 1163 | 1699 | 0 | 0 |
| `/community/ideas` | 1701 | 2740 | 0 | 0 |
| `/community/requests` | 1756 | 2654 | 0 | 0 |
| `/community/feedback` | 1442 | 2631 | 0 | 0 |
| `/legal/disclaimer` | 1569 | 2404 | 0 | 0 |
| `/legal/terms` | 1749 | 2625 | 0 | 0 |
| `/legal/privacy` | 1617 | 2409 | 0 | 0 |

---

## 2. Every interaction I exercised (GATE 43)

`G10_interact.mjs`, `G10_interact2.mjs`, `G10_final.mjs`, `G10_sort.mjs`. "Read the DOM before and after" —
where a result is inconclusive I say so rather than implying it passed.

| Control | Where | Result (measured) |
|---|---|---|
| Guide sub-tabs ×5 | `/guide/*` | **Works.** `main.innerText` length 2142→11746→3911→914→979 across Getting started / The desks / Concepts / FAQ / Shortcuts; URL follows each time. |
| FAQ `<details>` ×12 | `/guide/faq` | **Works.** First summary click: 914→1078 chars. 12 items present. |
| Community Direction filter | `/community/ideas` | **Works.** With 2 ideas (1 bull, 1 bear), `Bearish` → 1 card, count line `1 OF YOURS`. |
| Community Sort | `/community/ideas` | **Works.** Seeded AAPL (older) + ZZZZ (newer): `Newest` → `["ZZZZ","AAPL"]`, `By ticker` → `["AAPL","ZZZZ"]`. `aria-checked` tracks. *(My first probe used tickers where both orders agree and was inconclusive; re-ran.)* |
| Community Ticker filter | `/community/ideas` | **Works.** Chip row appears only once ≥1 idea exists: `["All","ZZZZ","AAPL"]`. |
| Ideas composer → book strip | `/community/ideas` | **Works, and is real product data.** Typing `SPY` renders `SPOT 503.84 · FLIP 502.50 · CALL WALL 505.00 · PUT WALL 500.00 · KING 500.00 — SPY key levels from the dealer model, read at 19:58:22`. Shot `G10_community_composer_book_1440x900.png`. |
| Composer field hints | `/community/ideas` | **Works.** `ENTRY 498.00` → hint `below the put wall`; `TARGETS 512` → `+1.61%`. Arithmetic checks: 512/503.99−1 = +1.589% vs printed `+1.59%` on the posted card. |
| Unknown-symbol guard | `/community/ideas` | **Works.** `ZZZZ` renders no book strip (`isKnownSymbol`, `Ideas.tsx:73`) — the desk refuses to draw a wall for a symbol nobody priced. |
| Post thesis → persist | `/community/ideas` | **Works.** `0 OF YOURS` → `1 OF YOURS`; card renders Horizon/Entry/Invalidation/Targets/Position + a placement block; toast "SPY thesis saved to this browser". |
| Roadmap status filter | `/community/requests` | **Works.** Chips read `All 6 · BUILDING 1 · PLANNED 2 · UNDER REVIEW 2 · SHIPPED 1`, matching `data/community.ts` ROADMAP (`seed-r1..r6`) exactly. |
| Roadmap ↔ Feedback cross-panel | both | **Consistent.** Feedback "Roadmap at a glance" prints the same `1/2/2/1`. |
| "Yours" badge | `/community/requests` | **Correct.** 0 on a fresh board (`isShippedId` gates it, `community.ts:163`). |
| Legal TOC anchors ×9 | `/legal/terms` | **Works.** Last link → `#section-9`, `#main-content.scrollTop` 0 → 849. |
| Terminal-index digit keys | `/terminal` | **Works.** `3` → `/trace/live-tape`, `5` → `/pinpoint/gamma`. Correctly inert on `/guide` (handler is index-scoped, `TerminalIndex.tsx:224`). |
| Resume row | `/terminal` | **Works.** Fresh: `START HERE · No desk opened yet · OPEN PULSE`. After visiting `/pinpoint/greeks`: `LAST OPENED · PINPOINT / GREEKS · RESUME`, and `localStorage["slayer.terminal.last"] = "/pinpoint/greeks"`. |
| Command palette | shell | **Works, coverage incomplete** — see F-06. `guide`, `community`, `faq`, `shortcut`, `nvda` all resolve. `legal`, `privacy`, `terms`, `disclaimer`, `index` → **"No matches."** |
| Shortcuts overlay `?` | shell | **Works.** 3 groups, 10 rows. |
| Settings drawer | shell | **Works.** 6 local-data groups, per-group two-step confirm, "8 items stored" tally, Reset-all two-step. |
| Nav dropdowns ×4 | shell | **Work.** SCAN 3 / READ 4 / YOURS 2 / MODELS 1 = the 10 `NAV_ITEMS`. |
| Mobile drawer @390 | shell | **Works.** 440px tall, all 10 desks in 4 groups + "10 desks · ⌘K for quick jump". |
| Toasts | `/community/*` | **Work.** Bottom-right, `role="status"`. |
| Footer "Launch Terminal" @ `/terminal` | shell | **Self-link.** See F-07. |
| Footer "Pricing" / "FAQ" | any shell route | **Eject to the landing page.** `/guide/faq` + Pricing → `/#pricing`; `/community/ideas` + FAQ → `/#faq`. Both anchors exist (`Landing.tsx:400`, `PricingExtras.tsx:203`), so this is intended — but it leaves the terminal. |
| Legal "Back to site" | `/legal/*` | → `/`, the marketing landing page, not the desk you came from. |

---

## 3. GATE 43 — every Guide claim, checked against the code

The rule at `src/pages/guide/parts.tsx:4-35` is the right rule and it was followed for most of the file. Here
is the full audit. **✓ = verified true. ✗ = stale/false.**

### Verified true

| Claim | File:line | Verified against |
|---|---|---|
| Pulse Views menu "fourteen" workspaces incl. Scalper/Swing/Macro/Earnings | `Desks.tsx:72`, `Overview.tsx:23`, `Faq.tsx:62` | `presets.ts:119` → **14** names, all four present |
| Pulse Customize / Fill / Fit / Detach / Pop out / Windows / Data connections / DOM / Footprint / Time & Sales | `Desks.tsx:49-74` | all present in `pulse/PulseWorkspace.tsx` + `pulseRegistry.tsx` |
| Compass score "8 to 99" | `Desks.tsx:88` | `data/compass.ts:426` `Math.round(clamp(rank, 8, 99))` |
| "±1.5-point jitter" | `Desks.tsx:98` | `data/compass.ts:288` `JITTER_HALF = 1.5` |
| "QUALIFIED at 88 and above, WATCH from 72, FADED below" | `Desks.tsx:102-104` | `data/compass.ts:575` `score >= 88 ? 'ENTER' : score >= 72 ? 'WATCH' : 'EXIT'` + `verdict.ts:23-25` lexicon map |
| "capped at the top 240 rows" | `Desks.tsx:112` | `data/compass.ts:781` `DISPLAY_CAP = 240`; live board header reads `SHOWING 240 OF 262` |
| six scanners, named | `Desks.tsx:110` | `types/compass.ts:128-135` — exact match incl. `All` |
| Health "in its own column on the board" | `Desks.tsx:104` | `SetupScanBoard.tsx:147-153` `key:'health', header:'Health'` |
| Weigher six-factor composite, named in order | `Desks.tsx:90-91` | `core/contractScore.ts:272-277` — *the math, theta burden, vol pricing, flow & dark pool, news lean, liquidity*. Exact. |
| Trace "Four subtabs" Tape/Dark Pool/Scanner/Reconstruction | `Desks.tsx:126-131` | `flowdesk/subnav.ts` — 4, labels match |
| Trace premium filter "≥$100K / ≥$500K / ≥$1M" | `Desks.tsx:141` | `LiveTape.tsx:62-64` |
| Trace Pause "freezes the rendered rows while the tape keeps collecting" | `Desks.tsx:142` | `LiveTape.tsx:641-643, 896` (`Paused · N new prints buffered`) |
| Pinpoint "Five desks"; "four of them carry a View toggle" | `Desks.tsx:156, 172` | `gex/subnav.ts` = 5; `gex/desks.tsx` = 4 `SubtabDesk`s, History has none |
| "eight-greek exposure matrix" | `Desks.tsx:158` | `data/greeksmatrix.ts:25-34` — 8 entries |
| Vol surface + density moved to Prove It, old links redirect | `Desks.tsx:161-163` | `App.tsx:160-162` |
| Prove It "Three views" + "10d / 30d / 60d" + 2D/3D surface | `Desks.tsx:201-203` | `proveit/ProveIt.tsx:22-24, 31-33` |
| Earnings "QUALIFIED / RICH / NO EDGE" | `Desks.tsx:215` | `data/earnings.ts:45-47` |
| FAQ: "the exposure ledger under Pinpoint → Levels writes its single-leg drill-down out as CSV" | `Faq.tsx:73-77` | `gex/ExposureLedger.tsx:90-96`, mounted at `ExposureProfile.tsx:221` = the `exposure` view of `LevelsDesk`. It is also the **only** CSV writer in `src/`. |
| Community "four theses that ship with the terminal" | `Ideas.tsx:442` | `data/community.ts` `seed-i1..i4` = 4 |
| Concepts: "In Trace, ask-lifts read green" | `Concepts.tsx:30` | `Desks.tsx:135-136`, house convention |

### Stale or false

**F-01 · P0 · The Compass entry describes a desk that was replaced.**

> `src/pages/guide/Desks.tsx:88` — *"Every preset stamps its own expiry, and all six are 0DTE or 1DTE — the
> board is a same-day and next-day instrument."*

`src/types/compass.ts:23` now defines **five sleeves** as the primary axis with the six styles demoted to
lenses. `SLEEVES[].dte` = `0, 7, 45, 365, 45`. The type file's own comment (`types/compass.ts:17-21`) records
the change: *"They used to be one strip of six presets, so every preset was same-session or next-day by
construction… Sleeve is the primary axis now and style the secondary one."* And `SleeveDef.dte` is documented
as *"the ONLY source of a setup's expiry; the styles have no say."*

Measured on the running build (`G10_claimcheck_compass_1440x900.png`), the Compass sleeve strip reads:
`0DTE 0DTE·08/03/26 | WEEKLY 7DTE·08/10/26 | SWING 45DTE·09/17/26 | LEAPS 365DTE·08/03/27 | STRUCTURES defined risk`.

A reader who trusts the Guide will not know the desk can grade a one-year contract, and will read "the board
is a same-day instrument" as a reason not to look for one.
**Fix:** rewrite `Desks.tsx:88` around the sleeve axis, and name `Structures` — the word does not appear
anywhere in `src/pages/guide/` (`grep -rn Structures src/pages/guide` → 0 hits).

**F-02 · P1 · The Guide documents 2 of Compass's 5 control groups.**

`Desks.tsx:108-114` lists "Three modes" and "six scanners". Measured `[role="radiogroup"]` on `/compass`:

```
[{"n":"Compass mode","o":["Setups","Weigher","Lotto"]},
 {"n":"Scan layout","o":["Cards","Table"]},
 {"n":"Rank by","o":["Gamma","Volume","Notional","Open Int"]}]
```
plus the five-sleeve tab strip and the six style tabs. `Cards/Table`, `Rank by`, the sleeve axis and
`Structures` are undocumented; `grep -rn "Table\|Rank by\|Sleeve\|Compare" src/pages/guide/*.tsx` → 0 hits for
all four.

**F-03 · P1 · "Every desk follows the active ticker" is false, measured.**

> `src/pages/guide/Overview.tsx:22` and `src/pages/guide/Faq.tsx:54` — *"Every desk follows the active ticker."*

Repro (`G10_tickerclaim.mjs`): open each route, capture `#main-content.innerText`, press `]` (SPY→QQQ), wait
2.6 s, capture again, compare with all digits stripped so live-price jitter cannot mask the result.

| Route | text changed on ticker switch |
|---|---|
| `/compass` | **yes** — first symbols `[SPY,SPY,SPY]` → `[QQQ,QQQ,QQQ]` |
| `/stocks` | **no** — `[AAPL,AAPL,TSLA]` → `[AAPL,AAPL,TSLA]` |
| `/earnings` | **no** |
| `/news` (default tab) | **no** |
| `/trace/live-tape` | changed, but only tape churn — the print stream is mixed-symbol regardless |

`TopBar.tsx:70-89` already knows this: `TICKER_SCOPED` deliberately excludes Stocks, Earnings, Live tape and
Reconstruction, and the comment at `TopBar.tsx:66-68` says a chip on Live tape *"would say the desk is looking
at something it is not."* The shell got it right; the Guide never got the memo. Worse, the shell **hides** the
ticker control on exactly those pages, so the user cannot even test the claim.
**Fix:** replace with "Compass, Pulse, Pinpoint, Prove It, News, Tracker, Trace → Dark pool and Scanner follow
the active ticker; the symbol chip appears only where it does."

**F-04 · P2 · Shortcuts registry omits a shortcut the product ships and advertises.**

`src/lib/shortcuts.ts` is the single source for both the `?` overlay and `/guide/shortcuts`. Measured overlay
text contains ⌘K, `[`, `]`, `?`, `Esc`, ↑↓, ↵ — and **no digit keys**. But `TerminalIndex.tsx:224-238` binds
`1`–`0` to the ten desks, and `TerminalIndex.tsx:210` prints "number keys open a desk" on the page. Verified
working: `3` → `/trace/live-tape`, `5` → `/pinpoint/gamma`.
**Fix:** add a `Terminal index` group to `SHORTCUT_GROUPS` with `1–0 · Open a desk (on the index)`.

---

## 4. GATE 43 — Legal accuracy

**F-05 · P0 · The build has no data feed, and no page in scope says so.**

Evidence: `grep -rn "fetch(\|WebSocket\|EventSource\|axios" src --include=*.ts --include=*.tsx` (excluding
tests) returns **zero matches**. `server.ts` serves `dist/` and nothing else. Every quote, print, GEX level and
score on every desk is produced by `src/core/simulator.ts`. The word "simulated" reaches the user in exactly
two places, both about *model analogs*, not the tape: `proveit/MarketStateReplay.tsx:258` and `News.tsx:552`.

Against that:

- `src/pages/legal/Terms.tsx:73-77` ships a whole section headed **"Third-party data & content"** stating *"The
  Service may display data or content sourced from third parties."* There are none.
- `src/pages/guide/Faq.tsx:20-26` answers *"How current is the data?"* with *"Prices, levels and flow update
  continuously while the terminal is open,"* and hedges only about delay/incompleteness. Read plainly, that is
  a claim of a live feed.
- The very next FAQ entry (`Faq.tsx:81`) says *"Some surfaces need feeds the current build does not carry —
  full Level-2 depth or tick-by-aggressor prints, for example,"* which implies the **other** feeds are carried.
- `Disclaimer.tsx:54` gets closest — *"provided for illustrative and informational purposes"* — but never says
  the prices are generated.

This is the single most consequential inaccuracy in the whole scope: a research product that displays dealer
positioning and 0DTE scores against generated prices, without saying so, in the exact document whose job is to
say so.
**Fix:** one sentence in `Disclaimer.tsx` ("This build runs on a simulated market model; no live or delayed
exchange feed is connected") plus the same sentence as the FAQ answer, and delete or re-scope
`Terms.tsx:73-77`.

**F-06 · P2 · The Terms' governing-law clause is a shipped placeholder.**
`src/pages/legal/Terms.tsx:91-96`: *"The specific governing jurisdiction will be identified here prior to any
paid or commercial launch."* A live Terms of Service that names no jurisdiction is not enforceable copy. This
one is a legal-review item, not a design item, but it is visible at `/legal/terms#section-9`.

**Accurate, for the record.** `Privacy.tsx:48-57` discloses the web-font provider — and `index.html:38-40`
does load `fonts.googleapis.com` / `fonts.gstatic.com`, so that disclosure is correct. `Privacy.tsx:16-25`
("saved in your browser's local storage… not transmitted to us") is correct: the only writers are
`localStorage`, and `Settings → Local data` lists all six groups and clears them.

---

## 5. GATE 59 — what the shell actually carries between desks

The brief asks for "a persistent global grammar (active ticker, market timestamp, data freshness, session
state) that travels between desks." Measured top-bar contents on 16 shell routes (`G10_interact.mjs §1`):

```
/terminal          > slayer_terminal | SCAN | READ | YOURS | MODELS | ⌘K | 15:55:17 | ET
/guide/overview    > slayer_terminal | SCAN | READ | YOURS | MODELS | ⌘K | 15:55:19 | ET
/community/ideas   > slayer_terminal | SCAN | READ | YOURS ·COMMUNITY | MODELS | ⌘K | 15:55:24 | ET
/legal/terms       > slayer_terminal | SCAN | READ | YOURS | MODELS | ⌘K | 15:55:34 | ET
/stocks            > slayer_terminal | SCAN ·STOCKS | READ | YOURS | MODELS | ⌘K | 15:55:43 | ET
/earnings          > slayer_terminal | SCAN | READ ·EARNINGS | YOURS | MODELS | ⌘K | 15:55:45 | ET
/trace/live-tape   > slayer_terminal | SCAN ·TRACE | READ | YOURS | MODELS | ⌘K | 15:55:48 | ET
/compass           > slayer_terminal | SCAN ·COMPASS | READ | YOURS | MODELS | ⌘K | SPY | $503.87 | +0.77% | 15:55:38 | ET
```

| Grammar element the brief names | Present? | Evidence |
|---|---|---|
| Active ticker | **6 of 16 routes** | `TopBar.tsx:70-89` `TICKER_SCOPED`; measured above |
| Market timestamp | **No** — a wall clock only | `TopBar.tsx:234-240` renders `marketClock().time`; `core/calendar.ts:269` = `new Date()`. It has no relationship to the data on screen. |
| Data freshness | **No, globally** | Exists, and is well-designed, but only inside Compass: `components/compass/Freshness.tsx` (`Live` / `Sweep HH:MM:SS` / `Held`) |
| Session state | **Deliberately removed** | `TopBar.tsx:223-233` explains why (the desks render a full session, so an "open/closed" badge contradicted them). It survives only as the `title=` tooltip on the clock. |

**F-07 · P1 · The active ticker resets to SPY on every reload and is not in the URL.**

Repro: `/compass` → press `]` → bar reads `QQQ $442.55` → navigate to `/terminal` via the wordmark → back to
`/compass` → bar still reads `QQQ` (**client-side navigation preserves it, correctly**) → `page.reload()` →
bar reads **`SPY $503.87`**.

Cause: `src/context/MarketDataContext.tsx:29` seeds React state from `Simulator.getActiveTicker()`;
`src/core/simulator.ts:615-619` holds `activeTicker` in a module-level variable with **no** `localStorage`
write (`grep -n localStorage src/core/simulator.ts` → 0 hits). `/compass` also takes no `?ticker=` param, so
the desk cannot be bookmarked or shared against a symbol.

This is the concrete answer to "what silently resets": the one element of the global grammar that exists
survives navigation and does not survive a refresh — which is the case a trader hits every morning.

**F-08 · P1 · The command palette cannot reach the legal pages or the terminal index.**

Measured (`G10_interact2.mjs §D`, shot `G10_EVIDENCE_palette_nolegal_1440x900.png`):

| query | result |
|---|---|
| `guide`, `community`, `faq`, `shortcut`, `nvda` | resolve correctly |
| `legal` | **No matches** |
| `privacy` | **No matches** |
| `terms` | **No matches** |
| `disclaimer` | **No matches** |
| `index` | **No matches** |

Cause: `src/components/layout/CommandPalette.tsx:105` composes the action list from `NAV_ITEMS` + the four
subnav registries + tickers, and never reads `REFERENCE_ITEMS` (`nav.ts:141-146`) or `/terminal`. The Guide
itself tells the reader to go read the Disclaimer (`Overview.tsx:83-85`), and the palette — advertised in
`Faq.tsx:86` and `Shortcuts` as the way to reach "pages, tickers and actions" — cannot get there.
**Fix:** append `REFERENCE_ITEMS` and a `Terminal index` entry to the array at `CommandPalette.tsx:105`. Two lines.

**F-09 · P1 · Footer "Launch Terminal" is a self-link on `/terminal` that blanks the screen for 1.35 s.**

`SiteFooter.tsx:55` renders `Launch Terminal → /terminal`; `SmartLink` (`SiteFooter.tsx:83-96`) routes any
`/terminal` target through `launch()`. Clicking it **while already on `/terminal`** plays the full-screen gate
— viewport goes to `bg-canvas` with `> slayer_terminal` and `ENTERING TERMINAL`
(`G10_EVIDENCE_terminal_selflaunch_1440x900.png`) — for `HOLD_MS + REVEAL_MS = 1050 + 300 = 1350 ms`
(`LaunchTransition.tsx:33,35`) and lands on `/terminal`. Measured end state: `/terminal`.
**Fix:** in `SmartLink`, fall through to a no-op (or hide the entry) when `pathname === to`.

**F-10 · P2 · Three separate paths eject the user from the terminal into the marketing site.**
Measured: `/guide/faq` + footer "Pricing" → `/#pricing`; `/community/ideas` + footer "FAQ" → `/#faq`;
`/legal/terms` + "Back to site" (`LegalLayout.tsx:49-54`) → `/`. All three are working links to real anchors —
but a user who opens Terms from the footer of `/pinpoint/greeks` has no way back to `/pinpoint/greeks`, and the
one control offering to take them "back" takes them to the landing page instead.

**F-11 · P2 · Four data desks carry the 503px marketing sitemap.**
`AppShell.tsx:44` `DESK_ROUTES = ['/pulse','/trace','/pinpoint','/compass','/prove-it']`. Everything else gets
`variant="full"`. Measured at 1440:

| Route | footer | share of page | footer links |
|---|---:|---:|---:|
| `/stocks` | 503px | 24.5% | 21 |
| `/news` | 503px | 32.0% | 21 |
| `/earnings` | 503px | 25.3% | 21 |
| `/tracker` | 503px | 23.5% | 21 |
| `/compass` | 53px | 3.3% | 3 |
| `/pulse` | 53px | 1.9% | 3 |

The comment at `AppShell.tsx:23-43` justifies the split as documents-vs-desks. Stocks, News, Earnings and
Tracker are working desks with tables in them, on the wrong side of that line.

---

## 6. GATE 17 — the five objects, per desk

Asked of each page at 1440×900, with a stopwatch on "within a few seconds".

### `/terminal` — Terminal index
| Object | Present? |
|---|---|
| Dominant analytical object | **Absent.** There is no analytical object at all. Measured: `main.innerText` contains **0** tokens matching `\d+\.\d\d`. |
| Current-state object | **Absent.** No price, no clock-relative state, no counts. The file comment states the intent: *"It reads the user, never the market: nothing here is a quote, a count or a score"* (`TerminalIndex.tsx:6-8`). |
| Main conclusion | **Absent.** |
| Risk / invalidation | **Absent.** |
| Next action | **Present and good.** The Resume row is the page's one accent, auto-focused on mount (`TerminalIndex.tsx:86-89`), and it reads `LAST OPENED · PINPOINT / GREEKS · RESUME`. |

### `/guide/*`
Dominant object = the desk card / term list. Conclusion = the tagline. Next action = the "Open <desk> →" link.
Current-state and risk/invalidation objects are **absent and correctly so** — a reference document has no
current state. Not a defect.

### `/community/ideas`
| Object | Present? |
|---|---|
| Dominant analytical object | **Present** — the composer's `BookStrip` (Spot / Flip / Call wall / Put wall / King) |
| Current-state object | **Present** — `read at 19:58:22` + the `Re-read levels` action |
| Main conclusion | **Present** — the zone read per field (`between the flip and the call wall`) |
| Risk / invalidation | **Present, and named** — the `Invalidation` field is toned `warn` (`Ideas.tsx:59`) and a `Spot through invalidation` badge fires when `isThrough()` is true |
| Next action | **Present** — `Post thesis`, and `Open on Pulse` per card |

This is the strongest Gate-17 page in the whole scope, and by some distance.

### `/community/requests`, `/community/feedback`
Dominant object = the status board / the record tally. Next action = `Add request` / `Save note`. No
analytical current-state or invalidation object, and none is owed.

### `/legal/*`
Dominant object = the section list. Everything else N/A.

---

## 7. GATE 13 — unexplained empty regions

Method: rasterise every visible leaf box inside `#main-content` onto a 24px occupancy grid, then solve for the
largest all-zero rectangle (`G10_axe.mjs`). Reported at 1440×900.

| Route | largest empty box | position | % of page | verdict |
|---|---|---|---:|---|
| `/legal/terms` | **288 × 1296px** | x=1152, y=0 | 14.8% | **Unexplained.** Shot `G10_EVIDENCE_legal_deadcolumn_1440x900.png` |
| `/legal/privacy` | 288 × 1176px | x=1152, y=0 | 14.5% | same cause |
| `/legal/disclaimer` | 288 × 1128px | x=1152, y=0 | 14.4% | same cause |
| `/guide/desks` | 192 × 3912px | x=1248, y=0 | 12.1% | explained — `max-w-5xl mx-auto` reading column (`GuideLayout.tsx:17`), mirrored on the left |
| `/guide/concepts` | 192 × 1944px | x=1248 | 11.0% | same |
| `/guide/overview` | 192 × 1056px | x=1248 | 9.5% | same |
| `/terminal` | 480 × 264px | x=0, y=888 | 7.2% | the gap between the last group block and the footer rule |
| `/community/requests` | 744 × 168px | x=696, y=1512 | 4.9% | ragged end of the last status group |

**F-12 · P2 · The legal pages waste a third of the viewport and put the hole on the wrong side.**
`LegalLayout.tsx:28` is `max-w-6xl mx-auto lg:grid lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-12` with an inner
`max-w-3xl`. Measured at 1440: ~140px dead left margin, 190px TOC rail (whose content ends at y≈320, leaving
~900px of empty rail below it), 48px gap, 768px prose, and then **288px of nothing** to the right edge. The
comment at `LegalLayout.tsx:26-27` says the wide frame exists *"so the section TOC fills the left rail that a
centered prose column otherwise leaves empty"* — it moved the hole from the left to the right rather than
closing it.

**F-13 · P2 · At 390 the legal TOC disappears entirely.**
`LegalLayout.tsx:30` is `hidden lg:block`. Measured `getComputedStyle(nav).display === "none"` at 390. A
9-section, **2625px** Terms of Service on a phone has no navigation and no section index — only a scrollbar.

**F-14 · P2 · The marketing sitemap footer is 30–50% of the page on half the routes in scope.**
Footer height is a constant **503px @1440 / 849px @390** regardless of how much page is above it.

| Route | 1440 share | 390 share |
|---|---:|---:|
| `/guide/shortcuts` | 43.3% | **50.0%** |
| `/guide/faq` | 37.7% | **48.8%** |
| `/terminal` | **41.4%** | 36.4% |
| `/community/feedback` | 34.9% | 32.3% |
| `/legal/disclaimer` | 32.1% | 35.3% |

**F-15 · P2 · Reading measure is 100–115 characters per line on the pages whose only job is to be read.**
Measured (longest paragraph, `height / lineHeight` → chars per line):

| Route | paragraph width | chars/line |
|---|---:|---:|
| `/legal/disclaimer` | 768px | **113** |
| `/legal/privacy` | 768px | **107** |
| `/legal/terms` | 768px | **101** |
| `/community/*` | **1382px** | **115** |
| `/guide/overview` | 624px | 87 |
| `/guide/desks` | 475px | 54 ✓ |

`LegalLayout.tsx:71` sets section bodies to `text-data` = **13px** (`tailwind.config.ts:99`) inside a 768px
`max-w-3xl` — at that size the column holds ~110 characters, roughly 1.5× the 65–75 that prose wants.
`Ideas.tsx:372` sets **no** max-width on the thesis paragraph, so a posted thesis runs the full 1382px card.
`Overview.tsx:32`'s `max-w-[70ch]` measures 87 chars, not 70.

---

## 8. GATE 10 / signature — does each desk have one?

### Terminal Index — **no signature, and the requirement names exactly what is missing**

**Today it is a static table of contents.** Measured: 0 numeric tokens; 26 unique link destinations in the
body; **15 of those 26 repeated verbatim** in the footer 503px below (`G10_dup.mjs`):
`/pulse /compass /stocks /trace /tracker /community /community/feedback /pinpoint /news /earnings /prove-it
/guide /legal/disclaimer /legal/terms /legal/privacy`. Every one of the ten desks appears twice on the page.
The footer's only unique additions are `x.com`, `/#pricing`, `/#faq`, a `mailto:`, and `/terminal` — a link to
the page you are on (F-09).

It is not a marketing card grid — it is a dense, well-typed operational directory with mnemonic codes, group
purposes, sub-tab chips and a keyboard row, and that is a real improvement over a card wall. But it has no
data, so it cannot be an operational *map*: it tells you where the desks are, never what is happening on them.

**Proposed signature — the Resume row becomes a Desk State row. One mechanism, no new data.**

The index already renders one full-width row (`ResumeRow`, `TerminalIndex.tsx:77-122`). Extend that row into a
strip that reports, for each of the four nav groups, **one number the terminal has already computed**:

| Group | Number | Exact existing source |
|---|---|---|
| Scan | the current sweep's qualified count and its clock | `data/compass.ts` `buildCompass()` + `scannerFloor()` — the live board header already prints `SHOWING 240 OF 262 SCORING 84+`; `components/compass/sweepClock.ts` supplies the stamp |
| Read | active symbol, spot, day change | `context/MarketDataContext` `marketData.spot` / `.changePercent` — already rendered by `TopBar.tsx:276-291` |
| Yours | tracked setups + local theses/requests/notes | `TrackerContext` and `data/community.ts:181` `loadCommunity()` — the Feedback tab already prints exactly this tally |
| Models | the freshness state of the last graded run | `components/compass/Freshness.tsx` (`Live` / `Sweep HH:MM:SS` / `Held`) |

Each cell is a link into its group. No new data source, no new endpoint, no new derivation — four values the
app computes today and prints elsewhere. It turns the front door into a status board that tells you which desk
moved, and it makes the index the natural place to land rather than a page you pass through once.

**Palette:** the counts are process/selection state, so silver/`select` and grey — **not** green. Only the
Read cell's day-change may take green/red, because it is market direction.

### Guide — **no signature, and does not need one.** It is reference documentation. The right ambition is
accuracy (§3) and reading measure (F-15), not an interaction.

### Community — **has a real signature, and it uses real product data.**
The Ideas composer reads `data/gex.ts` `buildLevels()` for the symbol you are typing and places every number
you write inside that book, live, with a timestamp (`pages/community/book.ts`, `Ideas.tsx:261-300`). Measured:
typing `SPY` produced `SPOT 503.84 · FLIP 502.50 · CALL WALL 505.00 · PUT WALL 500.00 · KING 500.00 · read at
19:58:22`; entering `498.00` produced `below the put wall`; the posted card carries a `Spot through
invalidation` warn badge when spot crosses. It refuses to draw a book for a symbol the terminal does not price
(`ZZZZ` → no strip). **This is not decoration.** It is the best interaction in the scope and the shell should
be borrowing from it, not the reverse.

### Legal — **no signature, and should not have one.** Accuracy (F-05, F-06), measure (F-15) and mobile
navigation (F-13) are the whole job.

### The shell — **the grammar is one wall clock.** See §5. The mechanism already exists inside Compass
(`Freshness.tsx`) and stops at the desk boundary.

---

## 9. GATE 63 — red team: what would survive a logo swap?

Judged on whether the element carries any Slayer-specific vocabulary, derivation or constraint.

| Element | Verdict | Evidence |
|---|---|---|
| **The 503px five-column footer sitemap** (`SiteFooter.tsx:165-217`) | **Fully generic.** Products / Company / Access / Legal + an X link is the default SaaS footer. It carries no product vocabulary, appears identically on 16 routes, is 41.4% of `/terminal` and 50.0% of `/guide/shortcuts` at 390, and duplicates 15 of the 26 links already on `/terminal`. | §7 F-14, `G10_dup.mjs` |
| **The `⌘K` command palette chrome** (`CommandPalette.tsx:160-207`) | **Generic shell, product-specific contents.** The overlay, the `↑↓ navigate / ⏎ select / esc close` strip and the group headers are the standard palette. What saves it is the *hints* — `"Options chooser: weeklies, swings and LEAPS, weighed and graded"` is not a line any other product writes. Keep the contents, and the chrome is fine. | measured palette text |
| **`/legal/*`** | **Generic by design and correctly so** — boilerplate ToS/Privacy is boilerplate. The one Slayer-specific paragraph (`Disclaimer.tsx:44`, *"Any label such as QUALIFIED, WATCH, or FADED is an analytical reading…"*) is exactly right and there should be more of it. The generic bit that is *wrong* is `Terms.tsx:73-77` — a third-party-data clause imported wholesale from a product that has third-party data. | F-05 |
| **`/guide/overview` "The desks" grid** (`Overview.tsx:41-62`) | **Generic card grid.** Five equal bordered cards, icon + name + one line, plus a dashed "how to read each desk" card. Nothing distinguishes it from a feature grid on any landing page. `/guide/desks` and `/terminal` both do the same job with far more density. | `G10_guide_overview_1440x900.png` |
| **`/guide/desks` "Research desks" strip** (`Desks.tsx:264-283`) | **Generic.** Four more icon+blurb cards, redundant with the same four rows on `/terminal`. | `G10_guide_desks_1440x900.png` |
| **Settings drawer** (`SettingsPanel.tsx`) | **Survives.** The six local-data groups are named in the product's own terms ("Pulse workspace", "Tracker & journal", "Terminal index — the desk you were last on"), each with a live stored count and a two-step confirm. This is specific. | measured drawer text |
| **Terminal index desk rows** | **Survives.** Mnemonic code chips, group purposes written as sentences (`nav.ts:126-131`), sub-tab chip bands, `2xl`-only route paths in the gutter. No generic dashboard has this. | `G10_terminal_1440x900.png` |
| **Community Ideas composer** | **Survives outright.** No other product places your entry price against a gamma flip while you type it. | §8 |
| **The `HH:MM:SS ET` clock** (`TopBar.tsx:234-240`) | **Generic, and worse than generic — it is decorative.** It is `new Date()`. It is the only "market" element that travels between desks, and it has no connection to any number on any desk. Every finance product has a clock in the corner. | `core/calendar.ts:269` |

---

## 10. Findings, ranked

| ID | Sev | Gate | Title | File:line |
|---|---|---|---|---|
| F-01 | **P0** | 43 | Guide says the Compass board is 0DTE/1DTE-only; the desk ships a 365DTE LEAPS sleeve | `src/pages/guide/Desks.tsx:88` |
| F-05a | **P0** | 43 | Terms ships a third-party-data clause; there is no third-party data (0 `fetch`/`WebSocket` in `src/`) | `src/pages/legal/Terms.tsx:73-77` |
| F-05b | **P0** | 43 | No page states the market data is simulated; the FAQ answers "how current is the data?" as if it were live | `src/pages/guide/Faq.tsx:20-26` |
| F-03 | **P1** | 43 | "Every desk follows the active ticker" — measured false on `/stocks`, `/earnings`, `/news` (default tab) | `src/pages/guide/Overview.tsx:22`, `Faq.tsx:54` |
| F-07 | **P1** | 59 | Active ticker resets to SPY on reload; not persisted, not in the URL | `src/context/MarketDataContext.tsx:29`, `src/core/simulator.ts:615-619` |
| F-08 | **P1** | 43/59 | Command palette cannot reach the 3 legal pages or `/terminal` | `src/components/layout/CommandPalette.tsx:105` |
| F-09 | **P1** | 43 | Footer "Launch Terminal" on `/terminal` blanks the viewport 1350ms and returns to the same page | `src/components/layout/SiteFooter.tsx:55`, `LaunchTransition.tsx:33,35` |
| F-02 | **P1** | 43 | Guide documents 2 of Compass's 5 control groups; `Structures`, sleeves, Cards/Table, Rank-by absent | `src/pages/guide/Desks.tsx:108-114` |
| F-16 | **P1** | 10/17 | Terminal index carries zero product data; 15 of 26 destinations duplicated in the footer below it | `src/pages/terminal/TerminalIndex.tsx:6-8` |
| F-17 | **P1** | 59 | The only market element that travels between desks is a wall clock unrelated to the data | `src/components/layout/TopBar.tsx:234-240` |
| F-12 | P2 | 13 | Legal pages: 288×1296px dead right column + ~900px empty TOC rail | `src/pages/legal/LegalLayout.tsx:28` |
| F-13 | P2 | 13 | Legal TOC is `hidden lg:block`; no navigation for a 2625px document at 390 | `src/pages/legal/LegalLayout.tsx:30` |
| F-14 | P2 | 13 | Footer is 30–50% of the page on half the in-scope routes (50.0% on `/guide/shortcuts` @390) | `src/components/layout/AppShell.tsx:127-129` |
| F-15 | P2 | 13/17 | 101–115 chars/line on legal and community prose; community thesis has no max-width at all | `LegalLayout.tsx:71`, `Ideas.tsx:372` |
| F-11 | P2 | 59 | Stocks/News/Earnings/Tracker — four working desks — carry the 503px marketing sitemap | `src/components/layout/AppShell.tsx:44` |
| F-10 | P2 | 43 | Three ejection paths out of the shell to the marketing site, incl. "Back to site" → `/` | `SiteFooter.tsx:40-41`, `LegalLayout.tsx:49-54` |
| F-04 | P2 | 43 | Shortcuts registry omits the `1–0` desk keys the index implements and advertises | `src/lib/shortcuts.ts:12-40` vs `TerminalIndex.tsx:210,224` |
| F-18 | P2 | 43 | Community standing notice names "copy or save" but the tab also ships a `mailto:` — the one genuinely external channel is not in the notice | `CommunityLayout.tsx:32-40` vs `Feedback.tsx:207-212` |
| F-06 | P2 | 43 | Terms' governing-law clause names no jurisdiction (shipped placeholder) | `src/pages/legal/Terms.tsx:91-96` |
| F-19 | P2 | 43 | Feedback labels `import.meta.env.MODE` as "App version"; it prints `production` | `src/pages/community/Feedback.tsx:24-25,131` |
| F-20 | P3 | 63 | Settings privacy shield uses `text-bull` (market green) for a non-market meaning | `src/components/layout/SettingsPanel.tsx:103` |
| F-21 | P3 | 8 | Toast container is `aria-live="polite"` wrapping `role="status"` children — nested live regions | `src/components/ui/Toast.tsx:110,123` |
| F-22 | P3 | 13 | `max-w-[70ch]` measures 87 chars/line, not 70 | `src/pages/guide/Overview.tsx:32` |

---

## 11. What I could NOT check

- **Screen-reader behaviour.** I measured axe-core (0 violations) and the nested-live-region markup (F-21). I
  did **not** run NVDA/VoiceOver, so I cannot say whether the nesting actually double-announces.
- **Clipboard actions.** `Copy record` / `Copy thesis` call `navigator.clipboard.writeText`, which the headless
  context does not grant. I confirmed the code path and the error branch (`toast.error('Clipboard unavailable')`)
  but did not verify a successful copy.
- **`Save as .md` download.** `share.ts:24-33` creates an object URL and clicks it; I did not intercept the
  download to verify the file contents.
- **`mailto:` handoff.** Verified the href is constructed (`share.ts:36-38`); no mail client exists in the container.
- **Pop-out windows.** Guide claims about `Pop out` / the `Windows` menu (`Desks.tsx:60-71`) were verified to
  exist in `pulse/PulseWorkspace.tsx` and `popoutWindow.ts` by reading the code only — I did not open a second
  browser window to confirm behaviour, and Pulse is outside my desk scope.
- **`/news` "Deep read" tab ticker scoping.** I measured only the default tab, which did not change on a ticker
  switch. `TopBar.tsx:74-81` claims the Deep-read tab does scope; I did not open that tab, so F-03 makes no
  claim about it.
- **The 390×844 gap solver on `/terminal`** reported a 408×1152px empty box. Inspecting the screenshot
  (`G10_terminal_390x844.png`) shows that region is fully occupied by desk rows — my leaf-box heuristic
  under-counts deeply nested mobile flex columns. **That number is a detector artifact and I have excluded it
  from §7.** The 1440 measurements were spot-checked against the screenshots and hold.
- **Cross-desk state beyond the ticker.** I measured what the shell carries. I did not audit `location.state`
  handoffs into Compass/Pulse — `docs/audit64/01-routes-subviews-workflows.md` already covers that.
