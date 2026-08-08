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

## 7. Not planned — and why

This section used to read "News & Earnings feeds" and ask for a news wire and an
earnings calendar. Both desks have since been **deleted**, along with the Stocks
quality sleeve and the sector-rotation board. The reason is not effort, it is
entitlement: the product is built on three market-data subscriptions — options
(OPRA trades, NBBO and vendor greeks), equities and index quotes — and none of
them carries fundamentals, estimates, revisions, a report calendar, a news wire,
a sector taxonomy, short interest, holdings or securities lending.

Do not re-add these as backend work items. A desk whose primary object cannot be
sourced is not a backend gap, it is a desk that should not exist. `docs/DATA-
FEASIBILITY.md` holds the per-desk analysis and the record of what was removed.

---

### Notes
- Nothing above changes the interface — the FAQ line "Live market data lands
  with launch, and nothing about the interface changes when it does" is the
  design intent, and the `MarketSnapshot` seam is what makes it true.
- The one thing that **does** change is the feed declaration. `core/feedSource.ts`
  holds the active `FeedSource`; the `FeedBadge` in the TopBar renders it at every
  width and reads `SIM` today. Registering a real feed is what turns that badge
  over. This note used to say no user-facing copy anywhere admits the data is
  simulated and to keep it that way — that was the wrong instruction, and the
  badge is the deliberate reversal of it. Do not remove it to make a demo look
  live.
