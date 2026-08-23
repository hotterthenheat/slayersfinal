# What Slayer can actually be, given the data

Entitlements assumed (OPRA/Nasdaq/Cboe-shaped, ~$3,200/mo annual, or ~$1,250/mo startup):

| Feed | What it really gives |
| --- | --- |
| **Options** $1,600 | Every US option ticker · **full real-time OPRA trade stream** · **every NBBO quote** · tick/1s/1m/EOD · **Greeks 1st, 2nd, 3rd order** · 14y history |
| **Stocks** $1,200 | **Nasdaq Basic real-time** (Nasdaq-executed) · **CTA & UTP 15-min DELAYED** · tick/1s/1m/EOD · 14y UTP, 9y CTA |
| **Indices** $400 | Cboe CGIF · **SPX, VIX, RUT** · 1-second · back to 2017 |

Two consequences drive almost every verdict below.

1. **You have no fundamentals, no corporate actions, no earnings calendar, no news, no
   analyst estimates, no sector taxonomy, no short interest, no institutional holdings.**
   Three market-data feeds is what you bought. Anything the UI asserts about a *company*
   rather than about its *price and its options* has no source.
2. **Your consolidated equity tape is 15 minutes delayed.** Real-time equities is
   Nasdaq-executed only. Anything that needs all-venue equity prints in real time —
   most obviously off-exchange/TRF activity — is either delayed or partial.

Everything else is unusually strong. A full OPRA trade stream with NBBO and
vendor-computed 3rd-order Greeks is a genuinely institutional options dataset. The
product should be built around that, not around the parts you don't have.

---

## Verdict by desk

Legend: **GREEN** = fully backed · **AMBER** = backed with a material caveat that must be
stated in the UI · **RED** = no data source; remove, or reduce to the part that is backed.

### GREEN — build these out, this is what you are paying for

| Desk / surface | Why it is backed |
| --- | --- |
| **Trace › Live Tape** | Full OPRA trade stream. Every print, every exchange, real time. |
| **Trace › Flow Scanner** | Same stream, aggregated. Volume, premium, repeat activity. It rolls the tape up per contract now rather than hashing beside it. |
| **Trace › Execution** | Effective vs quoted spread, price improvement, spread cost. Needs the trade AND the NBBO at the same instant, which is the one combination this entitlement uniquely has. |
| **Trace › Reconstruction** (metaorder) | Child prints → parent order is exactly a trade-stream problem. Sweep detection needs *all* options exchanges at once, which OPRA gives you. |
| **Trace › Informed Flow** | Aggressor side needs the trade **and** the NBBO at that instant. You have both. This is the single hardest input to obtain and you have it. |
| **Pinpoint › Greeks** | Greeks are **delivered**, including 2nd and 3rd order. You do not compute them. |
| **Pinpoint › Vanna / Charm** | 2nd/3rd-order Greeks delivered. Almost no retail product surfaces these. |
| **Compass › contract chain, Weigher** | Chain, NBBO, IV, Greeks — all first-party. |
| **Volatility: IV, IV rank/percentile, skew, term structure, expected move, realized-vs-implied** | Options IV + 14y history. Fully computable, no third party. |
| **Pulse chart / any price chart** | Tick→EOD bars, 14y. |
| **Indices context (SPX / VIX / RUT)** | 1-second CGIF. |
| **Beta** (`universe.ts`, the Stocks β column and its DEF/CYC lens) | Flagged for removal and it **survives**: beta is `cov(stock, index) / var(index)`, and both series are entitled — 14y UTP equity history against SPX back to 2017. Unlike the quality sleeve it is derived from prices, not sourced from a vendor, so there is a real path to a real number. The values shipping today are hand-typed seed constants exactly like `px` on the same rows, which is a simulator question, not a feed question. |

### AMBER — keep, but the UI must say what the number actually is

| Surface | Caveat |
| --- | --- |
| **Pinpoint › Gamma / Levels / GEX, gamma walls, flip** | GEX needs **open interest**, and OI is published **once a day for the prior close**. `src/core/openInterest.ts` already models this correctly and stamps the session — that is a genuinely good existing decision. Intraday, the honest move is OI(T-1) + signed volume since the open as an estimated ΔOI, labelled as an estimate. Never draw an intraday gamma wall as if it were measured. |
| **Trace › Dark Pool** | Kept and rebuilt around a price profile (the desk leads with where the size crossed, not with a table). The data caveat is unchanged: off-exchange prints reach you through the **consolidated tape, which is 15-min delayed**. Nasdaq Basic covers Nasdaq-executed volume and (subject to your exact contract) the Nasdaq TRF — a large share of off-exchange volume, but not all of it, and not the NYSE TRF. **Verify with the vendor which TRFs are in your real-time entitlement before building this as real-time.** If the answer is "consolidated only", this becomes a *delayed* desk and must be labelled 15-MIN DELAYED, permanently. |
| **Stocks board** | Of the four sleeves — momentum, quality, flow, news — you can back **momentum** (price) and **flow** (options). **Quality needs fundamentals. News needs a news feed.** You have neither. Half this desk has no source. |
| **Stocks › sector rotation** | Requires a sector taxonomy you do not have. SIC codes from a ticker-details endpoint are a poor substitute for GICS. |
| **Prove It (Monte Carlo, model scoreboard, surfaces)** | Computed from your own data, so backed — but it is only as honest as its inputs, and it must never present a simulated path as an observation. |

### RED — no data source exists

| Surface | The problem |
| --- | --- |
| **Earnings Hub** | Needs an **earnings calendar** (report dates), and its PLAY/FADE grading needs **estimates and revisions**. You have none of it. The *only* backed part is the implied move from the straddle, and the realized move after the fact — but you cannot know *when* a company reports. **This desk cannot exist on these three feeds.** |
| **`src/data/news.ts`** (desk already retired; `catalystPriors` still feeds `core/quant.ts`) | No news feed. The retired desk was correct. The surviving import means a news-shaped prior is still influencing quant output with nothing behind it. |
| **Community (ideas / requests / feedback)** | Not a market-data problem at all — needs a database, auth and moderation. Legitimate, but it is a *backend* product, not something these feeds enable. |
| **Closing-auction (MOC) engine** | Unpaired auction interest, the indicative price and paired-book absorption are published by an exchange **order-imbalance feed** (Nasdaq NOII, NYSE Order Imbalances). Its confirmation term also wanted **futures**. Neither feed is on any tier, and no amount of options or index data reconstructs an auction book. |
| Anything implying **holdings, short interest, insider or institutional ownership** | No source. |

---

## What was removed — DONE

Actioned on the owner's instruction. Each line is now a record, not a proposal.

1. **Earnings Hub — DELETED.** The desk needed a report calendar and analyst estimates;
   neither is on any tier. Without knowing *when* a company reports it had no spine, so
   the whole desk went rather than a trimmed version of it: the page, `data/earnings.ts`,
   `data/earningsintel.ts`, `EarningsIntel`, the trailer scene, the route, the nav entry,
   the Pulse preset and widget, the Stocks-drawer tab, and every paid-tier line selling
   it. An options-only "Event Vol" surface (implied move vs realized, user-supplied date)
   remains available as future work — it is a new build, not a survivor.
2. **`data/news.ts` — DELETED,** with `catalystPriors` and the "News outcome model" row it
   fed on Prove It's scoreboard. The scoreboard's other engine (sweep prints, resolved
   against the seeded candle series) survives, and `quant.test.ts` now guards the news
   model as unscoreable so it cannot come back.
3. **Stocks quality sleeve — REMOVED.** It screened "margins, growth, balance sheet" and
   there is no fundamentals feed. Momentum and flow renormalised over 0.707 to 0.552 /
   0.448 so the composite still spans 0-100 and the verdict cuts keep their meaning.
4. **Sector rotation — REMOVED.** Relative-strength phases per group need a real
   taxonomy. The `sector` LABEL survives everywhere it is only a label a human typed onto
   a universe row — the scope filter, the sortable column, the dark-pool grouping.
5. **Closing-auction (MOC) engine — DELETED.** Missed on the first pass through this
   document, which is why it is worth naming plainly: `core/fracture.ts buildMoc`
   published unpaired auction interest in dollars, a normalized imbalance z, indicative
   price displacement, a paired-book absorption percentage, a reversal probability and a
   futures/ETF confirmation term. Every one of those comes from an exchange **order
   imbalance feed** — Nasdaq NOII or NYSE Order Imbalances — except the confirmation
   term, which needs **futures**. Neither is on any of the three tiers, so each value was
   a hash of the ticker printed with a sigma after it.

   The blast radius was the whole **Lotto desk**, because the auction did not decorate
   that board, it *structured* it: which side got listed, how names ranked across the
   strip, a ±18-point grade adjustment, a per-strike "auction covers 1.4x" chip, and an
   evidence panel reporting all six quantities to two decimals.

   The desk was **rebuilt, not deleted**, because its real question is fully backed:
   given the chain, does the one-sigma move to expiry cover this strike's breakeven, and
   what does an hour of standing still cost. It now lists both sides, ranks within each
   side, and says in the panel below the board that it names no direction and why. What
   went with the engine: the `moc` field on `FractureView`, the Pulse "Closing Auction
   (MOC)" panel and its workspace preset, and the MOC glossary entry.

   `components/compass/mocClock.ts` **survives** — it is the ET market clock and the
   last-quarter-hour acceptance gate, both derived from `core/calendar.ts`. What time the
   bell is, is not an auction-feed question.
6. **Dark Pool inference columns — REGROUPED, not removed.** Kind, Venue and Clips are
   the classifier's output, but two of them sat under a column group headed **Print** and
   the third under **Execution**, among arithmetic. The consolidated tape reports an
   off-exchange trade as price, size, time and condition codes; it does not say which kind
   of pool crossed it, what sort of order worked it, or which prints share a parent. The
   three moved into **Read**, beside the column already headed "Inferred". Execution now
   holds only tape fields and arithmetic on them, including the reporting lag, which the
   TRF genuinely publishes. Nothing was deleted, because a classifier over a real trade
   stream is a legitimate product — it just may not wear a fact's heading.
7. **Beta — KEPT.** See the GREEN table. It is derived from two entitled price series,
   not sourced from a vendor.
8. **Dark Pool — KEPT.** Verified against the source before touching it: the desk models
   EQUITY off-exchange prints, not options ones. Share-based sizes with no 100-multiplier,
   an ATS venue taxonomy, no options fields on the type, and `darkpool.ts:217` explicitly
   disclaiming the option chain. It is delayed-data-constrained, not conceptually broken,
   and `core/contractScore.ts` folds its posture into every Compass grade — deleting it
   would have silently re-graded the whole Compass desk. Still pending the TRF answer.

---

## The build list, re-audited

Re-read against the code rather than against the last version of this document.
Status is what a route actually renders today, not what a type declares.

| # | Surface | Status | Where it stands |
| --- | --- | --- | --- |
| **P0-1** | **Historical replay** | **NOT BUILT** | The strongest thing the entitlement owns and still the largest single build. `proveit/MarketStateReplay` is *analogue matching* — find historically similar states, show what happened next — which is a different product. A replay needs a session clock every desk reads, a transport, and a date picker; nothing in the app has a clock it does not own. |
| **P0-2** | **Execution quality / NBBO analytics** | **BUILT** | `Trace › Execution`. Effective vs quoted spread, E/Q per print, price improvement against the half-spread, spread cost in dollars and basis points, the distribution of where fills land, cuts by expiry and by aggressor side. Arithmetic on bid/ask/fill/size — no model. `data/executionQuality.ts`. |
| **P0-3** | **Honest per-contract liquidity** | **PARTIAL** | On the same desk, from prints rather than from depth: the quote that stood around each fill, how often the contract traded, and the largest single print that got done — a measured lower bound on what the book absorbed. **Displayed size and quote-update frequency are still missing**: `OptionQuote` carries `bidSize`/`askSize` and nothing produces one. A quote-stream feed adds depth beside what is there; it does not replace it. |
| **P1-4** | **Intraday ΔOI estimation** | **BUILT** | `core/openInterest.ts:estimatedOI`, surfaced on `Trace › Scanner`. Buyer-initiated minus seller-initiated volume, stamped `ESTIMATED` and dated today, painted amber by `OiFreshness`. The assumption — that the tape never says which side was opening — is stated at the function and on the desk. **Nothing that draws a gamma wall reads it**, per the AMBER note above. |
| **P1-5** | **Own term structure** | **BUILT** | `Prove It › Volatility` (`data/vollab.ts`, `vollab/TermStructure.tsx`). The curve is synthesized like everything else pre-feed, but the surface exists and the shape is right. |
| **P1-6** | **3rd-order greek surfaces** | **BUILT** | `Pinpoint › Greeks` — speed, zomma, color and ultima are on the exposure matrix and the regime read (`data/greeksmatrix.ts`). Almost nobody surfaces these. |
| **P1-7** | **Sweep taxonomy across venues** | **NOT BUILT** | `data/flowSweeps.ts` detects sweeps from CANDLES, which is a price pattern, not the multi-venue definition. `FlowPrint.conditions` already carries OPRA code 95 and the tape reads it; what is missing is `exchange` (declared, never populated) and therefore any classification by venue count. |
| **P2-8** | **Cross-expiry positioning migration** | **PARTIAL** | `MarketSnapshot.chainByExpiry` and `data/expiryDependency.ts` make the expiry dimension real and answer "what does this expiry carry, and what happens without it". Day-over-day migration needs a stored prior session, which nothing keeps. |
| **P2-9** | **Quote-stuffing / liquidity withdrawal** | **NOT BUILT** | Needs NBBO update RATES. Nothing in the app reads a quote stream. |
| **P2-10** | **Realized vol cone** | **NOT BUILT** | `volComplex.ts:realizedVolFromCandles` computes one realized vol; a cone is that figure at several tenors against its own history. The simulator seeds 22 sessions, so a cone today would have three or four tenors and no percentile bands worth drawing. Real value arrives with real history. |

### What that leaves, in order

1. **Historical replay** — still the largest and still the most valuable. It is
   the only item on this list that makes every OTHER desk better rather than
   adding one.
2. **A quote stream** — one input unlocks two entries (P0-3's depth half and
   P2-9 entirely) and improves a third: with real NBBO updates, `Trace ›
   Execution` measures against the quote at the instant of the print rather
   than the quote the print carries.
3. **`exchange` on the print** — the smallest of these by an order of magnitude,
   and it completes P1-7.

### What was found while building the above

Worth recording, because each was invisible until something read two fields
together that had never been read together:

- **147 of 147 prints filled outside their own NBBO.** `bid`, `ask` and
  `fillPos` describe one fact and disagreed, because `mid` measured the fill
  position from the midpoint across the full spread while `fillPos` is
  documented as measuring it from the bid. The Live Tape had been drawing a
  marker inside a spread the numbers said the fill was outside of.
- **A print reported as a midpoint cross was priced at the touch.** `side` is
  read off the OPRA condition codes and is MID when no aggressor code is
  present; the fill was placed from the simulator's own ASK/BID, which is never
  "neither".
- **The Scanner was a hash drawn beside the tape.** Volume, the bid/ask split
  behind every BULLISH/BEARISH verdict, the sweep count and the ΔOI column were
  all `hRange`/`h01`, for the same contracts the tape holds real prints for.
- **190 of 194 scanned names printed a different price on the board than on the
  desk the board opened.** Two unrelated price generators for one name;
  `core/priceWalk.ts` is now the single one.

## Where this leaves the redesign

Your brief has 26 parts. This document answers the one that gates the rest: there is no
point redesigning the Earnings Hub or the sector-rotation board, and there is a great deal
of point in redesigning around the tape, the chain, the NBBO and the Greeks — because that
is what you actually own.

Sequence I would run:

1. **This document → your decisions on the RED list.** Deleting a paid tier's contents is
   your call, not mine. (Done — see "What was removed".)
2. **Mock-data architecture** (brief PART 11) — every desk moves behind a typed provider
   interface shaped like the *real* endpoints, so the swap is one adapter per feed.
3. **UI state completeness** (PART 10) — loading / empty / error / stale / delayed /
   market-closed. A 15-min-delayed tape and a T+1 OI field make "stale" and "delayed"
   *first-class product states*, not edge cases. `OiFreshness` is the pattern; it now has
   an `ESTIMATED` state that something actually produces.
4. **The three items at the top of "What that leaves"**, in that order. Historical replay
   is the only one that makes every other desk better rather than adding one.
