# Backend to-do

A running list of everything Slayer Terminal will need a server for. The whole
app is front-end only right now — every desk runs on the in-browser simulator
and every panel is the real UI. This file tracks what stays stubbed until the
backend lands, and exactly where each piece plugs in, so nothing gets lost.

The guiding design already in place: **`MarketSnapshot` (`src/types/market.ts`)
is the single data contract**, and every view builder is a pure
`(snapshot) => view`. So most of "wire the backend" is really "feed real
`MarketSnapshot`s in place of the simulator" — the desks don't change.

---

## 1. Live market-data feed  ·  _replaces the simulator_

**Now:** `src/core/simulator.ts` walks hardcoded base prices and generates
chains/greeks/tape deterministically. `useMarketData()` /
`MarketDataContext` ticks it.

**Needs:** a real feed producing `MarketSnapshot`s (price, options chain,
greeks, tape, dark-pool prints, indicators) per ticker.

**Wire points:**
- `MarketDataContext` — swap `Simulator.tick` for the live source; keep the
  `{ activeTicker, marketData, changeTicker }` shape and everything downstream
  is unchanged.
- `Simulator.buildSnapshot(sym)` — the per-symbol builder the Complex board and
  Pulse tiles call; back it with real per-symbol data.
- `ensureTicker()` currently invents a hashed price for any unknown symbol (so
  `TickerTag` can switch to anything). Real data means real chains per symbol —
  decide what happens for tickers with no options.

**Known sim limits to close with a real chain feed:**
- **Expiries:** the heatmap uses **5 fixed offsets** (`MATRIX_EXPIRIES` in
  `src/data/gex.ts`) shown as dates, **the same for every ticker**. Real feed →
  the actual per-ticker expiry calendar (SPY dailies vs weeklies/monthlies-only
  names), which also unlocks a true open date picker on the Gamma Heatmap.
- **Strikes:** `strikeRange = 15` in the simulator → a 31-strike window. "Expand
  = full chain" already renders every strike it has; a real chain carries the
  full ladder (hundreds of strikes) and the same view just renders more rows,
  no UI change.

---

## 2. Auth / sign-in

**Now:** none. The landing pricing says "sign in to check out."

**Needs:** accounts + session so access can be gated and data can be per-user.

**Wire points:** landing CTAs and `Prices in USD · sign in to check out`
(`src/pages/landing/Landing.tsx`); a gate in front of the terminal routes.

---

## 3. Payments / subscriptions

**Now:** static pricing (Pinpoint / Compass / Lifetime) with a feature matrix.

**Needs:** checkout (Stripe or similar), "access is granted at payment," month-
to-month + lifetime, "cancel anytime." Gate desk/feature access by tier.

**Wire points:** `TIERS` + `ComparePlans` `ROWS` in
`src/pages/landing/PricingExtras.tsx` / `Landing.tsx` — the `ROWS[].tiers`
array is already the tier→feature map; enforce it server-side + in a route guard.

---

## 4. Persistence / user data

**Now:** local storage only. Settings says "stored in this browser only."
`src/core/localData.ts` (`LOCAL_DATA_GROUPS`) enumerates it.

**Needs:** server storage synced per user, for: watchlists, saved Pulse layouts,
tracked setups + journal notes (`src/pages/Tracker.tsx` local journal), and
community drafts. Keep local storage as the offline/guest fallback.

---

## 5. Alerts

**Now:** copy promises "Discord alerts fire the moment a setup is detected"
(Compass FAQ).

**Needs:** a server-side watcher on the setup engine + Discord (and/or push)
delivery. Ties to Compass scoring.

---

## 6. Community

**Now:** Ideas / Requests / Feedback render from seed data; posting + voting are
local.

**Needs:** real posts, votes, and moderation. `src/data/community.ts` is the
current shape to back.

---

## 7. News & Earnings feeds

**Now:** simulated headlines/outcomes and an earnings slate.

**Needs:** a real news wire + earnings calendar, plus wherever the outcome/
mispricing models should run for real (server-side if they get heavy).

---

### Notes
- Nothing above changes the interface — the FAQ line "Live market data lands
  with launch, and nothing about the interface changes when it does" is the
  design intent, and the `MarketSnapshot` seam is what makes it true.
- No user-facing copy anywhere says "simulated / mock / demo" — keep it that way;
  these are internal engineering notes only.
