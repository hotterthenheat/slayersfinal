# 01 — Routes, sub-views, workflows & navigation

**Gates 3, 4, 5, 43** · Slayer Terminal · audit date 2026-08-03
Target: production build served at `http://127.0.0.1:8123` (SPA fallback on). No rebuild, no restart.
Browser: Playwright 1.61.1 / Chromium 1194, viewport **1440×900**, `slayer_onboarded_v1=1` pre-seeded, `fonts.g*` aborted.

Scratch scripts (reproducible):
`/tmp/claude-0/-home-user-slayersfinal/61510a72-f878-56b9-9620-dab6cb6adbf2/scratchpad/{crawl,params,nav,workflows,monitor,trace-h1,isolate,remount,pulselink,pulse2,generic,gen2}.mjs`
Raw output: `crawl.json`, `params.json`. Screenshots: `.../scratchpad/shots/`.

---

## 0. Headline

Every one of the **72 URLs I opened rendered, returned HTTP 200, and produced zero page errors and zero
application console errors.** Every redirect resolves to exactly where the source says it does. Every garbage
`?view=` / `?sleeve=` value falls back safely without a crash. Reload preserves the sub-view on all three
URL-backed desks.

The failure is not in routing. It is in the **handoffs**. `AppShell` wraps the route outlet in
`AnimatePresence mode="wait"` keyed on the top-level path segment (`src/components/layout/AppShell.tsx:108`),
which **mounts the destination desk twice** on every cross-section navigation. Three desks
(`Compass`, `PulseWorkspace`, and by extension everything that deep-links into them) read `location.state` on
mount and immediately destroy it with `window.history.replaceState({}, '')`. Mount #2 therefore finds nothing.
The result, measured: the contract you clicked "Monitor strike" on is displayed for ~190 ms and then replaced
by an unrelated setup, and a Weigher opened with `horizon="SWINGS"` grades a **same-day 0DTE Lotto contract**.

---

## 1. GATE 3 — Route inventory

`src/App.tsx` declares **69 `<Route>` elements** (`grep -c "<Route " src/App.tsx` → 69): 4 layout routes with
children (`/guide`, `/pinpoint`, `/trace`, `/community`), 1 `AppShell` pathless layout route, 26 leaf pages,
33 redirects, 1 catch-all, 4 index routes.

Legend: **render** = route element paints; **redirect** = client-side `<Navigate>` rewrites the URL.
`len` = `main.innerText` length after a 2.6 s settle. `err` = `page.on('pageerror')` count.

| Requested URL | Kind | Resolved to | HTTP | `<h1>` | len | err |
|---|---|---|---|---|---|---|
| `/` | render | `/` | 200 | See the forces that move the market. | 20262 | 0 |
| `/welcome` | redirect | `/` | 200 | See the forces that move the market. | 20182 | 0 |
| `/trailer` | render | `/trailer` | 200 | **none** | 359 | 0 |
| `/experience` | redirect | `/prove-it` | 200 | Prove It | 5528 | 0 |
| `/quant-lab` | redirect | `/prove-it` | 200 | Prove It | 5528 | 0 |
| `/immersive` | redirect | `/prove-it` | 200 | Prove It | 5528 | 0 |
| `/terminal` | render | `/terminal` | 200 | Terminal index | 1646 | 0 |
| `/home` | redirect | `/terminal` | 200 | Terminal index | 1646 | 0 |
| `/pulse` | render | `/pulse` | 200 | Pulse workspace: Slayer Classic | 5526 | 0 |
| `/live-terminal` | redirect | `/pulse` | 200 | Pulse workspace: Slayer Classic | 5526 | 0 |
| `/workspace` | redirect | `/pulse` | 200 | Pulse workspace: Slayer Classic | 5526 | 0 |
| `/compass` | render | `/compass` | 200 | Trade Setups | 6600 | 0 |
| `/stocks` | render | `/stocks` | 200 | Stocks | 19113 | 0 |
| `/news` | render | `/news` | 200 | News | 5229 | 0 |
| `/earnings` | render | `/earnings` | 200 | Earnings Hub | 3512 | 0 |
| `/prove-it` | render (lazy) | `/prove-it` | 200 | Prove It | 5528 | 0 |
| `/fracture` | redirect | `/pinpoint/stress?view=fracture` | 200 | Pinpoint | 3466 | 0 |
| `/lotto` | redirect (+state) | `/compass?view=lotto` | 200 | Lotto · 0DTE Desk | 3472 | 0 |
| `/tracker` | render | `/tracker` | 200 | Setup Tracker | 6764 | 0 |
| `/help` | redirect ×2 | `/guide/overview` | 200 | Guide & Help | 2126 | 0 |
| `/guide` | index redirect | `/guide/overview` | 200 | Guide & Help | 2126 | 0 |
| `/guide/overview` | render | `/guide/overview` | 200 | Guide & Help | 2126 | 0 |
| `/guide/desks` | render | `/guide/desks` | 200 | Guide & Help | 11714 | 0 |
| `/guide/concepts` | render | `/guide/concepts` | 200 | Guide & Help | 3907 | 0 |
| `/guide/faq` | render | `/guide/faq` | 200 | Guide & Help | 910 | 0 |
| `/guide/shortcuts` | render | `/guide/shortcuts` | 200 | Guide & Help | 975 | 0 |
| `/pinpoint` | index redirect | `/pinpoint/gamma` | 200 | Pinpoint | 1920 | 0 |
| `/pinpoint/command` | redirect | `/pulse` | 200 | Pulse workspace: Slayer Classic | 5526 | 0 |
| `/pinpoint/flow-map` | redirect | `/pulse` | 200 | Pulse workspace: Slayer Classic | 5526 | 0 |
| `/pinpoint/gamma` | render | `/pinpoint/gamma` | 200 | Pinpoint | 1920 | 0 |
| `/pinpoint/levels` | render | `/pinpoint/levels` | 200 | Pinpoint | 3997 | 0 |
| `/pinpoint/greeks` | render | `/pinpoint/greeks` | 200 | Pinpoint | 2213 | 0 |
| `/pinpoint/stress` | render | `/pinpoint/stress` | 200 | Pinpoint | 2249 | 0 |
| `/pinpoint/history` | render | `/pinpoint/history` | 200 | Pinpoint | 3673 | 0 |
| `/pinpoint/complex` | redirect | `/pinpoint/gamma?view=complex` | 200 | Pinpoint | 4207 | 0 |
| `/pinpoint/exposure-profile` | redirect | `/pinpoint/levels` | 200 | Pinpoint | 3997 | 0 |
| `/pinpoint/strike-profile` | redirect | `/pinpoint/levels` | 200 | Pinpoint | 3997 | 0 |
| `/pinpoint/ranked-targets` | redirect | `/pinpoint/levels?view=ranked` | 200 | Pinpoint | 2280 | 0 |
| `/pinpoint/greeks-regime` | redirect | `/pinpoint/greeks` | 200 | Pinpoint | 2213 | 0 |
| `/pinpoint/vanna-charm` | redirect | `/pinpoint/greeks?view=migration` | 200 | Pinpoint | 2134 | 0 |
| `/pinpoint/volatility` | redirect (param-aware) | `/prove-it?view=volatility` | 200 | Prove It | 1293 | 0 |
| `/pinpoint/volatility?view=density` | redirect (param-aware) | `/prove-it?view=density` | 200 | Prove It | 2834 | 0 |
| `/pinpoint/vol-lab` | redirect | `/prove-it?view=volatility` | 200 | Prove It | 1293 | 0 |
| `/pinpoint/state-density` | redirect | `/prove-it?view=density` | 200 | Prove It | 2834 | 0 |
| `/pinpoint/hedge-impact` | redirect | `/pinpoint/stress` | 200 | Pinpoint | 2249 | 0 |
| `/pinpoint/fracture` | redirect | `/pinpoint/stress?view=fracture` | 200 | Pinpoint | 3466 | 0 |
| `/trace` | index redirect | `/trace/live-tape` | 200 | Trace | 3781 | 0 |
| `/trace/live-tape` | render | `/trace/live-tape` | 200 | Trace | 3781 | 0 |
| `/trace/dark-pool` | render | `/trace/dark-pool` | 200 | Trace | 31322 | 0 |
| `/trace/liquidity` | redirect | `/pulse` | 200 | Pulse workspace: Slayer Classic | 5526 | 0 |
| `/trace/dark-feed` | redirect | `/trace/dark-pool` | 200 | Trace | 31322 | 0 |
| `/trace/scanner` | render | `/trace/scanner` | 200 | Trace | 4335 | 0 |
| `/trace/reconstruction` | render | `/trace/reconstruction` | 200 | Trace | 4592 | 0 |
| `/trace/tracker` | redirect | `/trace/scanner` | 200 | Trace | 4335 | 0 |
| `/liquidity` | redirect | `/pulse` | 200 | Pulse workspace: Slayer Classic | 5526 | 0 |
| `/flow-desk` | splat redirect | `/trace/live-tape` | 200 | Trace | 3790 | 0 |
| `/flow-desk/anything` | splat redirect | `/trace/live-tape` | 200 | Trace | 3790 | 0 |
| `/pinpoint-gex` | splat redirect | `/pinpoint/gamma` | 200 | Pinpoint | 1920 | 0 |
| `/pinpoint-gex/anything` | splat redirect | `/pinpoint/gamma` | 200 | Pinpoint | 1920 | 0 |
| `/community` | index redirect | `/community/ideas` | 200 | Community | 1891 | 0 |
| `/community/ideas` | render | `/community/ideas` | 200 | Community | 1891 | 0 |
| `/community/requests` | render | `/community/requests` | 200 | Community | 2186 | 0 |
| `/community/feedback` | render | `/community/feedback` | 200 | Community | 1528 | 0 |
| `/legal/disclaimer` | render | `/legal/disclaimer` | 200 | Disclaimer | 2923 | 0 |
| `/legal/terms` | render | `/legal/terms` | 200 | Terms of Service | 3118 | 0 |
| `/legal/privacy` | render | `/legal/privacy` | 200 | Privacy Policy | 2714 | 0 |
| `/auditor-log` | redirect | `/tracker` | 200 | Setup Tracker | 6764 | 0 |
| `/this-route-does-not-exist` | catch-all | `/terminal` | 200 | Terminal index | 1645 | 0 |
| `/pinpoint/garbage` | catch-all | `/terminal` | 200 | Terminal index | 1646 | 0 |
| `/guide/garbage` | catch-all | `/terminal` | 200 | Terminal index | 1646 | 0 |
| `/trace/garbage` | catch-all | `/terminal` | 200 | Terminal index | 1643 | 0 |
| `/community/garbage` | catch-all | `/terminal` | 200 | Terminal index | 1647 | 0 |

### 1.1 Route-level observations (measured)

* **No route renders an empty or stuck loading shell.** Skeleton/`animate-pulse`/`aria-busy` element count was
  `0` on all 72 URLs at the 2.6 s mark.
* **`/help` is the only redirect-of-a-redirect.** `/help → /guide → /guide/overview`. Every other legacy alias
  jumps straight to a leaf, exactly as the comments in `App.tsx:180-183` claim.
* **`/pinpoint/volatility` correctly forwards its `?view=`.** `VolatilityMoved` (`App.tsx:66-69`) sanitises the
  incoming value: `?view=density` → `/prove-it?view=density`, anything else → `?view=volatility`. Verified both.
* **There is no 404 page.** `App.tsx:198` sends every unmatched URL to `/terminal`. Measured on
  `/definitely-not-a-route`: final path `/terminal`, `h1 = "Terminal index"`, body contains no "404" / "not
  found" string, and no toast/alert element (`[role=status],[role=alert]` count = 0). See finding **P2-09**.
* **`document.title` is byte-identical on all 72 URLs**: `"Slayer Terminal — Institutional Options GEX
  Analytics"`. See finding **P1-08**.
* **`/trailer` renders no `<h1>` and no `<h2>`** (`h1: 0, h2: 0`, `main` text 359 chars, 0 canvases, 2 SVGs,
  1 button `"PLAY TRAILER"`). It is an intentional pre-roll gate, but it is the only route in the app with no
  heading at all. Screenshot: `shots/trailer.png`. See **P3-13**.
* **Nav coverage.** `NAV_ITEMS` (`src/components/layout/nav.ts:32-118`) lists 10 desks. `/guide`, `/legal/*`
  are in the footer/secondary list (`nav.ts:142-145`). `/trailer` is reachable from exactly one place in the
  app: `src/pages/landing/Landing.tsx:290`. It is unreachable once you are inside the shell.

---

## 2. GATE 4 — Sub-view inventory

### 2.1 Which desks put sub-view state in the URL

`grep -rn "useSearchParams" src` returns **four files**: `App.tsx`, `pages/Compass.tsx:160`,
`pages/proveit/ProveIt.tsx:252`, `pages/gex/desks.tsx:27`.

That is the whole list. **Compass, Prove It and the four Pinpoint consolidated desks are URL-backed. Trace,
Stocks, Pulse, News, Earnings, Tracker and Community are not** — every filter, sort, tab, drawer and compare
mode on those seven desks lives in component state only, so none of it is shareable, bookmarkable or
reload-safe. Confirmed at runtime: `/trace/live-tape?view=garbage` renders identically to `/trace/live-tape`
and the param is never read. See **P2-11**.

### 2.2 Full sub-view map

Sub-view controls were enumerated live by reading `[role="radiogroup"]` / `[role="radio"][aria-checked=true]`
and `[role="tab"]` on each route. `SegmentedControl` (`src/components/ui/SegmentedControl.tsx:48-56`) renders
`role="radiogroup"`; the Compass sleeve strip renders `role="tablist"` (`Compass.tsx:~636`).

| Route | URL-backed sub-views | In-page controls (state only) | Drawers / modes |
|---|---|---|---|
| `/compass` | `?view=` → `setups` \| `weigher` \| `lotto`, **plus** the six scanner presets `top-setups` \| `quick-scalp` \| `discounted` \| `rebounds` \| `whale-sweeps` \| `all` (a preset implies the setups pane). `?sleeve=` → `odte` \| `weekly` \| `swing` \| `leaps` \| `structures` (`odte` omitted from the URL by design, `Compass.tsx:192`) | radiogroups: *Compass mode*, *Scan layout* (Cards\|Table), *Rank by* (Gamma\|Volume\|Notional\|Open Int); tablist *Contract horizon* (5 sleeves); ticker-filter dropdown; scan page | browse ↔ **review mode** (`monitorTarget !== null`, header switches to "Monitoring …", `Compass.tsx:572-590`); contract-chain selection |
| `/compass?view=lotto` | as above | radiogroup *Closing auction reads* (10 ticker cards) | — |
| `/compass?view=weigher` | as above | contract query field, `initialHorizon` prop | — |
| `/pinpoint/gamma` | `?view=` → `this` \| `complex` | radiogroup *Gamma scope* | — |
| `/pinpoint/levels` | `?view=` → `exposure` \| `ranked` | *Levels view*; **exposure** adds *Expiry*, *Strike window*, *Leg*, *Scale*; **ranked** adds *Strategy isolator* | selected-strike row → "View on chart" → `/pulse` |
| `/pinpoint/greeks` | `?view=` → `matrix` \| `migration` | *Greeks view*; **matrix** adds *Sort matrix*; **migration** adds *Migration mode*, *Strike focus*, *Contribution view* | — |
| `/pinpoint/stress` | `?view=` → `hedge` \| `fracture` | *Stress view* | — |
| `/pinpoint/history` | none (`?view=` ignored) | *Replay speed* (1×…) | timeline scrub |
| `/prove-it` | `?view=` → `models` \| `volatility` \| `density` | **models**: *Forecast window* (10d\|30d\|60d), *Surface view* (2D\|3D); **volatility**: *Surface slice* (Skew\|Term\|Surface), *Skew expiry* (5/10/15/20/30/45/60d), *Moneyness window* (Full\|±20%\|±10%\|±5%); **density**: *Density source for the threshold read* | — |
| `/trace/live-tape` | none | *Flow type* (All\|Sweeps\|Blocks), *Sentiment* (All\|Bullish\|Bearish), *Min premium* (All\|≥$100K\|≥$500K\|≥$1M), PAUSE, search, Views menu, Columns menu | **TapeRowDrawer** on row click → `CrossDeskLinks` (Dealer map / Monitor strike / Weigh) |
| `/trace/dark-pool` | none | filters | — |
| `/trace/scanner` | none | filters | **ScannerRowDrawer** → `CrossDeskLinks` |
| `/trace/reconstruction` | none | filters | — |
| `/stocks` | none | *Verdict filter*, *Price band*, *Beta band*, sector scope, compare mode, watchlist | **StockDetailDrawer** → `TickerJump` (`horizon="SWINGS"`, `StockDetailDrawer.tsx:615`) |
| `/news` | none | cluster expand, watch/mute, hide-muted | article select → `TickerJump` (no horizon, `News.tsx:528`) |
| `/earnings` | none | watch-only, compare mode, watchlist | row select → `TickerJump` (`horizon="WEEKLIES"`, `EarningsHub.tsx:828`) |
| `/tracker` | none | status override, notes, untrack + undo toast | row detail → "Review in Compass" (`Tracker.tsx:339`) |
| `/pulse` | none | *Gradient metric* (Gamma…), Views menu (14 presets), panel add/arrange/pop-out, timeframe rail | detached panels, pop-out windows |
| `/guide/*` | route tabs only (5) | — | — |
| `/community/*` | route tabs only (3) | `/community/feedback` adds a 4-way tab (Bug\|Usability\|Data\|Other) | — |

---

## 3. GATE 5 — History, reload and invalid params

### 3.1 Invalid / hostile query params — **all fall back safely, none crash**

44 URLs tested (`params.mjs`, full log in `params.json`). Zero page errors on any.

| URL | Rendered as | Verdict |
|---|---|---|
| `/compass?view=garbage` | Setups, `Compass mode = Setups` | safe fallback, **URL not cleaned** |
| `/compass?view=` (empty) | Setups | safe |
| `/compass?view=WEIGHER` (case) | Setups — *not* Weigher | safe but case-sensitive (**P3-12**) |
| `/compass?sleeve=garbage` | 0DTE (len 6662 == default) | safe |
| `/compass?view=garbage&sleeve=garbage` | Setups / 0DTE | safe |
| `/compass?sleeve=structures` | Structures sleeve applied (len 3240, *Scan layout* + *Rank by* correctly absent) | works |
| `/compass?view=lotto&sleeve=swing` | Lotto pane; sleeve is inert in Lotto | works |
| `/pinpoint/{gamma,levels,greeks,stress}?view=garbage` | first sub-view, correct `aria-checked` | safe, **URL not cleaned** |
| `/pinpoint/history?view=garbage` | ignored | safe |
| `/prove-it?view=garbage` | Models | safe, **URL not cleaned** |
| `/trace/live-tape?view=garbage`, `/tracker?view=garbage`, `/stocks?view=garbage`, `/pulse?view=garbage` | param ignored entirely | safe |

### 3.2 Back / forward / reload on three multi-view routes

Sub-view switches deliberately use `replace: true` (`Compass.tsx:194`, `gex/desks.tsx:43`,
`ProveIt.tsx`), documented at `Compass.tsx:125-133`. Measured behaviour matches the documented intent.

| Route | Action | Result | OK? |
|---|---|---|---|
| `/compass` | Setups → Weigher → Lotto | URL `?view=weigher` → `?view=lotto`, `history.length` stays 3 | ✅ |
| `/compass?view=lotto` | **reload** | `h1 = "Lotto · 0DTE Desk"`, `Compass mode = Lotto` | ✅ |
| `/compass?view=lotto` | **back** | `/terminal` (leaves the desk, does not walk the panes) | ✅ as designed |
| `/compass` | **forward** | `/terminal` restored | ✅ |
| `/pinpoint/levels` | → `?view=ranked`, then sub-nav → `/pinpoint/greeks` | `history.state.idx` 0 → 1 (a real push) | ✅ |
| `/pinpoint/greeks` | **reload** | Greeks / *Matrix & regime* | ✅ |
| `/pinpoint/greeks` | **back** | `/pinpoint/levels?view=ranked`, *Ranked targets* re-checked | ✅ |
| `/pinpoint/levels?view=ranked` | **back / forward** | `/terminal` ⇄ `/pinpoint/levels?view=ranked` | ✅ |
| `/prove-it` | Models → Volatility lab → Density | `?view=volatility` → `?view=density` | ✅ |
| `/prove-it?view=density` | **reload** | *Risk-neutral density* re-checked | ✅ |
| `/prove-it?view=density` | **back** | `/terminal` | ✅ as designed |

**Reload and back/forward are sound on the URL-backed desks.** The failures are all on the *state*-backed
paths, below.

---

## 4. GATE 43 — Cross-desk workflows

Every handoff was executed by clicking the real affordance and then reading the destination.

| # | Workflow | Affordance | Source | Destination URL | Ticker survives? | Instrument survives? |
|---|---|---|---|---|---|---|
| 1 | **Pulse → Trace** | **none exists** | — | — | n/a | n/a |
| 2 | **Trace → Compass (monitor)** | tape drawer "MONITOR STRIKE" | `SPY 505C` | `/compass?view=top-setups` | ✅ SPY | ❌ **lost** — lands on Top Setups feed showing `COIN 182C` |
| 2b | **Trace → Compass (weigh)** | scanner drawer "WEIGH" | `SPY 495C` | `/compass?view=weigher` | ✅ SPY | ⚠️ weigher opens `SPY 504C 0DTE Lotto`, not the clicked strike |
| 3 | **Compass → Tracker** | setup card → "TRACK" (`aria-label="Track DVN 43.50C"`) → `/tracker` | `DVN 43.50C` | `/tracker` | ✅ | ✅ row present, `TRACKED 1` |
| 4 | **Tracker → Compass** | row detail "Review in Compass" (`Tracker.tsx:339`) | `DVN 43.50C` | `/compass?view=top-setups` | ✅ DVN | ❌ **lost** — `h1 = "Trade Setups"`, no monitor |
| 5 | **Stocks → Compass** | drawer `TickerJump` "Weigh" (`horizon="SWINGS"`) | `SBUX` | `/compass?view=weigher` | ✅ SBUX | ❌ **wrong horizon** — `SBUX 98 Call 08/03/26 · 0d · Lotto sleeve` |
| 6 | **News → Compass** | article `TickerJump` "Weigh" | `MS` | `/compass?view=weigher` | ✅ MS | ⚠️ `MS 101 Call · 0d · Lotto` (News passes no horizon; default `WEEKLIES` also dropped) |
| 7 | **Earnings → Compass** | row `TickerJump` "Weigh" (`horizon="WEEKLIES"`) | `COST` | `/compass?view=weigher` | ✅ COST | ❌ **wrong horizon** — `COST 872 Call 08/03/26 · 0d · Lotto sleeve` |
| 8 | **Pinpoint → Compass** | **none exists** | — | — | n/a | n/a |
| — | *(extra)* **Pinpoint Levels → Pulse** | "VIEW ON CHART" | `SPY 510` strike | `/pulse` | ✅ SPY | ❌ price marker lost (section remount, §4.2) |

### 4.1 Root cause, measured

**Step 1 — the section double-mounts on every cross-section navigation.**
`AppShell.tsx:108-116` renders the outlet inside `<AnimatePresence mode="wait">` with
`key={'/' + location.pathname.split('/')[1]}` and `DUR.fast = 0.12` (`src/lib/motion.ts:23`).

Probe (`gen2.mjs`): from `/terminal`, click the `<a href="/compass">`, sample `main > div` node identity every 30 ms:

```
 132ms path=/compass main>div nodeIds=[0] h1s=["Trade Setups"]
1020ms path=/compass main>div nodeIds=[1] h1s=["Trade Setups"]
```

Two **different DOM nodes**, both rendering Compass. Compass mounted, painted, was torn down, and mounted again.
Same-section navigation does **not** do this — `/pinpoint/gamma → /pinpoint/levels` held `sameSectionNode=true`
for the whole 2.5 s window (`generic.mjs`).

**Step 2 — the deep-link payload is destroyed before mount #2.**
`Compass.tsx:243`, `:251`, `:257` and `PulseWorkspace.tsx:778` all call `window.history.replaceState({}, '')`
inside a `useEffect(..., [])` to "consume so refresh doesn't re-enter". Mount #1 consumes it; mount #2 finds
`location.state === null`.

Instrumented handoff (`isolate.mjs`, patched `history.replaceState`/`pushState` + 100 ms h1 poll):

```
   1ms pushState   state={"usr":{"monitor":{"ticker":"SPY","strike":505,"right":"C","scanner":"top-setups"}},"key":"m0euakdd","idx":1} url=/compass
  16ms replaceState state={}                       url=undefined      <-- Compass.tsx:243 consumes the payload
  19ms replaceState state={"usr":null,"key":"alblvt3m"} url=/compass?view=top-setups
 122ms H1="Monitoring SPY 505C"
 402ms H1="Trade Setups"
```

DOM-identity confirmation of the same event (`remount.mjs`):

```
 121ms h1="Monitoring SPY 505C"  sameH1DomNode=true   sameSectionDomNode=true
 310ms h1="Trade Setups"         sameH1DomNode=false  sameSectionDomNode=false
```

**The correct screen is on the glass for ~190 ms and is then replaced by the generic browse feed.**
Screenshot of the end state: `shots/monitor-strike-landing.png` — the user clicked `SPY 505C`; the desk shows
the Top Setups feed with `COIN 182C` auto-selected in the right-hand panel. `SPY 505C` appears nowhere.

**Why the ticker survives but nothing else does:** `changeTicker()` writes to `MarketDataContext`, which lives
*outside* the remounted subtree (`App.tsx:87`). `mode` survives because the `[params]` effect
(`Compass.tsx:199-206`) re-derives it from `?view=`. `monitorTarget` (`Compass.tsx:171`) and
`weigherHorizon` (`Compass.tsx:166`) are plain `useState` and are not in the URL, so they die with mount #1.

**Why the horizon becomes Lotto:** `ContractWeigher.tsx:422/432` reads
`dteForHorizon[initialHorizon ?? 'LOTTO']`. When `weigherHorizon` is wiped, the prop is `undefined` and the
Weigher grades a same-day contract. Stocks asked for `SWINGS`; the desk answered with a 0DTE.

### 4.2 Collateral: react-router's history index is destroyed

`window.history.replaceState({}, '')` also removes react-router's `idx` and `key`.

| Point measured | `window.history.state` |
|---|---|
| normal navigation | `{"usr":null,"key":"…","idx":1}` |
| after any Compass deep-link landing | `{"usr":null,"key":"alblvt3m"}` — **no `idx`** |
| after a subsequent push to `/terminal` | `idx: NaN` (measured, `monitor.mjs` §B) |
| after Pinpoint → Pulse "View on chart" | `{}` — **`idx`, `key` and `usr` all gone** |

Browser-level Back/Forward still worked in my runs (popstate is handled by the browser), but react-router's
own index — which its scroll restoration and navigation-type detection read — is corrupt from that point on.

### 4.3 The handoff URL is not shareable, and looks like it is

The handoff writes `?view=top-setups` / `?view=weigher` to the address bar, which reads as a bookmarkable
landing. The name is never in the URL. Measured:

```
Stocks → Weigh(SBUX)  → /compass?view=weigher   ticker=SBUX
        F5 (reload)   → /compass?view=weigher   ticker=SPY    (SBUX silently gone)
Tracker → Review(DVN) → /compass?view=top-setups ticker=DVN
        F5 (reload)   → /compass?view=top-setups ticker=SPY   (DVN silently gone)
```

Same URL, different underlying, no notice.

### 4.4 Two of the eight requested workflows have no affordance at all

Enumerated every `a[href]` and every `button` inside `<main>`:

* **`/pulse`** — `main` anchors are `["/legal/disclaimer","/legal/terms","/legal/privacy"]`. The only button
  naming another desk is `"Dark Pool"`, which is a Pulse *panel title*, not a link. Confirmed in source:
  `grep -rn "Link\|navigate\|useTickerNav\|href=" src/pages/pulse/*.tsx` returns only two `ExternalLink`
  *icons* and one comment. **Pulse → Trace requires the top-bar SCAN dropdown.**
* **`/pinpoint/{gamma,levels,greeks,stress}`** — `main` anchors are the five Pinpoint sub-tabs plus the three
  legal links, on every desk. Cross-desk buttons matching `/compass|weigh|monitor|open in/i`: **0**.
  Pinpoint's only outbound links are `navigate('/pulse')` from `RankedTargets.tsx:190` and
  `ExposureProfile.tsx:164`. **Pinpoint → Compass requires the top-bar dropdown.**

---

## 5. Console-error log

`page.on('console')` (error + warning), `page.on('pageerror')` and `page.on('requestfailed')` were captured on
all 72 URLs plus every interaction run.

| Message | Occurrences | Source | App defect? |
|---|---|---|---|
| `[error] Failed to load resource: net::ERR_FAILED` | 72 / 72 URLs | `https://fonts.googleapis.com/css2?family=Inter:…&family=JetBrains+Mono:…&display=swap` — verified by re-running **without** the `**fonts.g**` route abort, which produced `net::ERR_CONNECTION_RESET` on the same URL | **No** — sandbox has no egress. Worth noting only that the app has a hard render-blocking dependency on a third-party font host with no local fallback. |
| `Failed to read the 'localStorage' property from 'Window': Access is denied for this document.` | 1 | fired once on `about:blank` when the Playwright init script ran before the first navigation | **No** — harness artefact |
| **application `pageerror`** | **0** | — | — |
| **application console errors** | **0** | — | — |
| **failed non-font requests** | **0** | — | — |

---

## 6. Findings

| ID | Sev | Gate | Title |
|---|---|---|---|
| P0-01 | P0 | 43 | "Monitor strike" / "Review in Compass" flash the right contract for ~190 ms, then drop to the generic Top Setups feed |
| P0-02 | P0 | 43 | Compass Weigher ignores the requested horizon and grades a **0DTE Lotto** contract when the caller asked for SWINGS / WEEKLIES |
| P1-03 | P1 | 43 | `AnimatePresence mode="wait"` double-mounts every desk on every cross-section navigation |
| P1-04 | P1 | 5 | `window.history.replaceState({}, '')` destroys react-router's history index (`idx: NaN`, `state: {}`) |
| P1-05 | P1 | 43 | Pinpoint "View on chart" → Pulse: the strike marker is lost to the same remount |
| P1-06 | P1 | 43 | Pulse has zero outbound cross-desk affordances — Pulse → Trace has no in-context path |
| P1-07 | P1 | 43 | Pinpoint has zero outbound cross-desk affordances to Compass |
| P1-08 | P1 | 3 | `document.title` is identical on all 72 URLs |
| P2-09 | P2 | 4 | No 404 — unknown URLs are silently rewritten to `/terminal` with no notice |
| P2-10 | P2 | 43 | Handoff URLs (`?view=weigher`) look bookmarkable but drop the name on reload |
| P2-11 | P2 | 4 | Seven of eleven desks keep every sub-view in component state; one app, two contracts for what a URL means |
| P3-12 | P3 | 5 | Invalid `?view=` / `?sleeve=` values are honoured-as-default but left in the address bar |
| P3-13 | P3 | 3 | `/trailer` renders no `<h1>` (and no heading of any level) |

### P0-01 — Trace/Tracker → Compass monitor handoff collapses to the browse feed
**Gate 43** · `src/pages/Compass.tsx:243` + `src/components/layout/AppShell.tsx:108`
**Evidence.** Clicked "MONITOR STRIKE" on `SPY 505C` in the Trace tape drawer. 100 ms h1 poll:
`158ms /compass?view=top-setups :: "Monitoring SPY 505C"` → `450ms /compass?view=top-setups :: "Trade Setups"`.
DOM identity at the same moment: `sameH1DomNode` true → **false**. Final state screenshot
`shots/monitor-strike-landing.png` shows the Top Setups feed with `COIN 182C` selected — `SPY 505C` is absent.
Identical for Tracker "Review in Compass" on `DVN 43.50C` (`h1 = "Trade Setups"`, ticker = DVN).
Control: opening a setup by clicking "ANALYSIS" *inside* Compass gives `h1 = "Monitoring OXY 55.5P"` and holds
— so review mode works; only the deep-link path fails.
**Why it matters.** Both call sites exist specifically to put a trader on one contract. They put them on a
different one instead, after briefly showing the right one — which is worse than not navigating, because the
screen momentarily confirms the action.
**Fix.** Do not consume router state before the second mount. Either drop the `mode="wait"` double-mount
(P1-03) or carry the contract in the URL (`?monitor=SPY-505-C`) so mount #2 can re-derive it — the pattern
Compass already uses successfully for `?view=` and `?sleeve=`.

### P0-02 — Weigher opens a 0DTE Lotto contract when the caller asked for swings
**Gate 43** · `src/pages/Compass.tsx:166,251` + `src/components/compass/ContractWeigher.tsx:422,432`
**Evidence.** `StockDetailDrawer.tsx:615` renders `<TickerJump horizon="SWINGS">`. Clicking "Weigh" on SBUX
lands on `/compass?view=weigher` showing `SBUX 98 Call 08/03/26 Mon · 0d · 0 sessions · Lotto sleeve`.
`EarningsHub.tsx:828` passes `horizon="WEEKLIES"`; COST lands as `COST 872 Call 08/03/26 · 0d · Lotto`.
News (no horizon → `useTickerNav.ts:38` defaults to `WEEKLIES`) lands as `MS 101 Call · 0d · Lotto`.
`ContractWeigher.tsx:422` reads `dteForHorizon[initialHorizon ?? 'LOTTO']` — the fallback is what is rendering.
**Why it matters.** A same-day 0DTE contract and a 45-day swing are different instruments with different
theta, different breakevens and different risk. The desk answers a swing question with a lottery ticket, and
labels it "Lotto sleeve" as though the user chose it. Three of the eight workflows land here.
**Fix.** Same root as P0-01 — the horizon must survive mount #2, or be written to the URL alongside `?view=weigher`.

### P1-03 — Every desk mounts twice on cross-section navigation
**Gate 43** · `src/components/layout/AppShell.tsx:108-116`
**Evidence.** `/terminal --click--> /compass`: `main > div` node id `[0]` at 132 ms (h1 "Trade Setups") and
node id `[1]` at 1020 ms (h1 "Trade Setups"). Two distinct DOM nodes, both Compass. Also measured on
`/trace/live-tape → /compass` (310 ms) and `/pinpoint/levels → /pulse` (`sameSectionNode` true at 576 ms,
false at 660 ms). Same-section navigation (`/pinpoint/gamma → /pinpoint/levels`) holds `sameSectionNode=true`.
**Why it matters.** Beyond the two P0s, every mount effect on every desk runs twice on entry — Pulse rebuilds
its whole workspace, Compass builds its scan twice, and any component whose initial state is derived once is
silently reset. This is also the reason the deep-link `useEffect(..., [])` "consume" pattern is unsafe
everywhere it appears.
**Fix.** Keep the crossfade but stop remounting: give the `motion.div` a stable key and animate on
`location.pathname` via `initial/animate` instead of `AnimatePresence mode="wait"` — or move the state that
must survive out of the animated subtree.

### P1-04 — `history.replaceState({}, '')` corrupts react-router's index
**Gate 5** · `src/pages/Compass.tsx:243,251,257`; `src/pages/pulse/PulseWorkspace.tsx:778`
**Evidence.** After a Compass deep-link landing: `window.history.state = {"usr":null,"key":"alblvt3m"}` — `idx`
absent. Pushing `/terminal` from there yields `history.state.idx === NaN`. After Pinpoint → Pulse "View on
chart": `window.history.state = {}` (idx, key and usr all gone) and it stays that way.
**Why it matters.** `idx` is how react-router knows where it is in the stack. `NaN` is not a recoverable index.
Back/Forward still worked in my runs, but scroll restoration and any future `useNavigationType`/blocker logic
read this value.
**Fix.** Consume the payload with `navigate(pathname + search, { replace: true, state: null })` instead of
touching `window.history` directly, so react-router keeps ownership of its own state object.

### P1-05 — Pinpoint "View on chart" loses the strike marker
**Gate 43** · `src/pages/gex/ExposureProfile.tsx:164`, `src/pages/gex/RankedTargets.tsx:190`,
`src/pages/pulse/PulseWorkspace.tsx:741,776,778`
**Evidence.** Selected the `SPY 510` row on `/pinpoint/levels`, clicked "VIEW ON CHART". Landed on `/pulse`
with `history.state = {}`. The Pulse section subtree was then replaced (`sameSectionNode` true at 576 ms →
false at 660 ms), which resets `const [focus, setFocus] = useState(null)` at `PulseWorkspace.tsx:741`; the
router state that fed it was already wiped at line 778 before that remount.
**Caveat — honest scope.** I measured the remount and the wiped router state directly. I did **not** visually
confirm the absence of the chart marker, because `focus` feeds `buildCtx(snap, revision, fp)`
(`PulseWorkspace.tsx:874`) and is drawn inside the chart rather than emitted as text I could assert on.
**Fix.** Same as P0-01/P1-04.

### P1-06 — Pulse has no outbound cross-desk affordance
**Gate 43** · `src/pages/pulse/PulseWorkspace.tsx`
**Evidence.** `main` anchors on `/pulse`: `["/legal/disclaimer","/legal/terms","/legal/privacy"]`. Buttons in
`main` naming another desk: `["Dark Pool"]` — a panel title, not a link. Source grep for
`Link|navigate|useTickerNav|href=` under `src/pages/pulse/` returns two `ExternalLink` *icons* and one comment.
**Why it matters.** Pulse is described as "the cockpit — start there" (`guide/Faq.tsx:43`). It is a dead end:
every other desk hands off to somewhere, Pulse hands off nowhere. "I see something on the chart, show me the
tape" costs a top-bar dropdown and a re-orientation.
**Fix.** The `TickerJump` chip already exists and already routes to Pulse/Compass/Pinpoint — Pulse needs the
mirror of it (Trace / Pinpoint / Compass on the active ticker), not a new component.

### P1-07 — Pinpoint has no path to Compass
**Gate 43** · `src/pages/gex/*`
**Evidence.** On `/pinpoint/gamma`, `/pinpoint/levels?view=ranked`, `/pinpoint/greeks`, `/pinpoint/stress`:
`main` anchors are the five Pinpoint tabs + three legal links on all four; cross-desk buttons matching
`/compass|weigh|monitor|open in/i` = **0** on all four. `grep -rn -i compass src/pages/gex` returns nothing.
**Why it matters.** The documented flow (`guide/Overview.tsx:24-25`) is "Compass to find a setup, Pinpoint to
read the positioning behind it". The return leg — "the positioning says the 510 wall matters, weigh me
contracts there" — has no button.
**Fix.** Reuse `CrossDeskLinks` (already built for the Trace drawers) on the Levels selected-strike row, which
already knows the ticker and strike.

### P1-08 — One `<title>` for the whole app
**Gate 3** · `index.html`; no route sets a title
**Evidence.** `document.title === "Slayer Terminal — Institutional Options GEX Analytics"` on **72 / 72** URLs.
**Why it matters.** Browser tabs, the history menu, bookmarks and window-switchers are all unusable for a
terminal a trader keeps five tabs of. Screen readers announce the same title after every route change, so the
only spoken confirmation that navigation happened is absent.
**Fix.** Set `document.title` from the route (`PageHeader` already receives `breadcrumb` + `title`).

### P2-09 — No 404
**Gate 4** · `src/App.tsx:198`
**Evidence.** `/definitely-not-a-route` → final path `/terminal`, `h1 = "Terminal index"`, no "404"/"not found"
string in the body, `[role=status],[role=alert]` count 0. Also swallows `/pinpoint/garbage`,
`/guide/garbage`, `/trace/garbage`, `/community/garbage` — a typo inside a section is indistinguishable from
"go home". Screenshot `shots/unknown-route.png`.
**Why it matters.** The comment at `App.tsx:195-197` argues a stale bookmark should land "somewhere neutral".
It does — but silently, having rewritten the URL, so the user cannot tell a dead link from a working one and
cannot report it.
**Fix.** Keep landing on the index, but say so: a one-line notice on `/terminal` naming the path that did not
resolve. No new route needed.

### P2-10 — Handoff URLs look shareable and are not
**Gate 43** · `src/pages/Compass.tsx:186-195`
**Evidence.** `Stocks → Weigh(SBUX)` → `/compass?view=weigher`, ticker SBUX. Reload the same URL → ticker SPY.
`Tracker → Review(DVN)` → `/compass?view=top-setups`, ticker DVN. Reload → SPY.
**Why it matters.** `writeView()` publishes the pane *precisely so the landing is bookmarkable*
(`Compass.tsx:255-256`). It publishes half the state, so the URL is a confident lie: same address, different
underlying, no warning.
**Fix.** If the ticker is what the handoff carried, put it in the URL (`?ticker=SBUX`) or do not write a URL
that implies the landing is reproducible.

### P2-11 — Two different contracts for what a URL means
**Gate 4** · `grep -rn "useSearchParams" src` → 4 files
**Evidence.** Only `Compass.tsx`, `ProveIt.tsx` and `gex/desks.tsx` read or write search params. Trace's three
filter groups (*Flow type*, *Sentiment*, *Min premium*), Stocks' three (*Verdict*, *Price band*, *Beta band*),
Pulse's *Gradient metric* + 14-preset Views menu, Earnings' compare mode and Community's feedback tabs are all
component state. Confirmed at runtime: `/trace/live-tape?view=garbage` is byte-equivalent to
`/trace/live-tape`.
**Why it matters.** A trader who learns "the Compass URL carries my view" reasonably expects the Trace URL to
carry theirs. It does not, and nothing on screen distinguishes the two.
**Fix.** Not "add params everywhere" — pick the sub-views that are genuinely a *destination* (Trace's flow
type, Stocks' verdict filter) and give those the same `?view=` treatment; leave transient controls alone.

### P3-12 — Invalid params are honoured-as-default but left in the URL
**Gate 5** · `Compass.tsx:151-155`, `gex/desks.tsx:28`, `ProveIt.tsx:252`
**Evidence.** `/compass?view=garbage` renders Setups with `Compass mode = Setups` and the address bar still
reads `?view=garbage`. Same for `?sleeve=garbage`, `/pinpoint/gamma?view=garbage`, `/prove-it?view=garbage`.
`?view=WEIGHER` (uppercase) falls back to Setups rather than matching Weigher.
**Fix.** On first read, if `?view=` is present and unreadable, `setParams(clean, {replace:true})`.

### P3-13 — `/trailer` has no heading
**Gate 3** · `src/pages/trailer/SlayerTrailer.tsx`
**Evidence.** `h1: 0, h2: 0` on `/trailer`; `main` text 359 chars; a single button `"PLAY TRAILER"`. Every
other of the 71 URLs has exactly one `<h1>`. Screenshot `shots/trailer.png`.
**Fix.** The pre-roll already displays "ONE MARKET EVENT · 18 DESKS · 84S" as its largest text — mark it up
as the `<h1>`.

---

## 7. What I could NOT audit

* **Prove It's 3D dealer surface and the trailer's 17-scene timeline.** Both are WebGL/`three.js`; I recorded
  `?view=` routing and the segmented controls, but I did not verify what renders inside the canvas.
* **Whether the Pulse chart's focus marker is actually missing after a Pinpoint handoff.** The remount and the
  wiped router state are measured; the marker itself is drawn inside the chart and I found no text or ARIA
  hook to assert on. P1-05 is stated on mechanism + remount, not on a visual diff.
* **Community Ideas → Pulse.** `Ideas.tsx:366` renders an icon-only `RowAction label="Open on Pulse"`; my
  selector did not find it on the seeded board and I could not execute that handoff. The code path is
  identical to the Pinpoint one (`navigate('/pulse', {state:{focusTicker, focusPrice}})`), so I expect the same
  loss, but I did not reproduce it.
* **Pulse pop-out / detached-panel windows** (`PopoutPanel.tsx`, `popoutWindow.ts`) — these open a second
  browser window; not exercised.
* **Trace `Views` and `Columns` menus, Pulse's 14 view presets, Stocks' sector-scope drill.** Enumerated as
  sub-views, not individually opened.
* **Mobile / narrow viewports.** Everything here is 1440×900 only. The Compass sleeve strip, the Trace filter
  rail and the Pinpoint sub-tab bar all have documented horizontal-scroll behaviour below `sm` that is untested.
* **Any route behind an auth or feature flag,** if such exist — I found none in `App.tsx`.
* **Whether the font-host failure changes layout in production** (it resolves there; here it always fails).
