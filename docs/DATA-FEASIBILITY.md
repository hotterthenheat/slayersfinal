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
| **Trace › Flow Scanner** | Same stream, aggregated. Volume, premium, repeat activity. |
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
| **Trace › Dark Pool** | Off-exchange prints reach you through the **consolidated tape, which is 15-min delayed**. Nasdaq Basic covers Nasdaq-executed volume and (subject to your exact contract) the Nasdaq TRF — a large share of off-exchange volume, but not all of it, and not the NYSE TRF. **Verify with the vendor which TRFs are in your real-time entitlement before building this as real-time.** If the answer is "consolidated only", this becomes a *delayed* desk and must be labelled 15-MIN DELAYED, permanently. |
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

## What you can build that you are not building

These are all fully backed by the three feeds, and most are rare in retail products.

### P0 — the strongest thing you own

**1. Historical replay.** You have 14 years of tick data. A "pick any date, replay the
session at 1×/10×/max" mode makes every desk usable *today*, with real data, before a
single real-time socket exists. It is also the best options-education product on the
market and almost nobody has one. This should be the next thing built.

**2. Execution-quality / NBBO analytics.** You have every quote. Effective spread, quoted
spread, price improvement vs NBBO, where in the spread each print landed, spread cost by
strike and expiry. Retail platforms never show this because they don't want you to see it.

**3. Honest per-contract liquidity.** The liquidity heatmap was deleted because NBBO
cannot back *resting depth* — that was the right call. But NBBO **can** back displayed
size at the top of book per contract, quote-update frequency, and time-weighted spread.
That is a real, defensible liquidity product: "can I actually get filled on this contract,
and what will it cost me in spread."

### P1 — differentiated, fully backed

**4. Intraday ΔOI estimation.** OI is T+1, so professionals estimate today's position
change from signed volume and print classification. Surfacing "estimated OI change since
the open, by strike" — clearly marked as an estimate — is the honest, professional answer
to a limitation everyone else either ignores or lies about.

**5. Your own VIX term structure.** You cannot get VIX futures, but you have SPX options
and 1-second VIX. Build the term structure from SPX IV directly; it is more precise than
the futures curve for most purposes and it is entirely yours.

**6. 3rd-order Greek surfaces.** You are paying for speed, color, zomma, ultima. Nobody
surfaces them. There is a real product in "what happens to my gamma when vol moves."

**7. Sweep taxonomy across all options exchanges.** A sweep is defined by simultaneous
execution across venues. Only a full OPRA feed can see it. Classify by venue count,
aggression, and NBBO position.

### P2

**8. Cross-expiry positioning migration** — where did OI move, expiry to expiry, day over day.
**9. Quote-stuffing / liquidity-withdrawal detection** — NBBO update rate collapse before a move.
**10. Realized vol cone** — 14y history, by tenor, vs current IV.

---

## Where this leaves the redesign

Your brief has 26 parts. This document answers the one that gates the rest: there is no
point redesigning the Earnings Hub or the sector-rotation board, and there is a great deal
of point in redesigning around the tape, the chain, the NBBO and the Greeks — because that
is what you actually own.

Sequence I would run:

1. **This document → your decisions on the RED list.** Deleting a paid tier's contents is
   your call, not mine.
2. **Mock-data architecture** (brief PART 11) — every desk moves behind a typed provider
   interface shaped like the *real* endpoints, so the swap is one adapter per feed. This is
   the highest-leverage work that needs no decisions from you and I can start immediately.
3. **UI state completeness** (PART 10) — loading / empty / error / stale / delayed /
   market-closed. Right now the app only has the happy path, and a 15-min-delayed tape and
   a T+1 OI field make "stale" and "delayed" *first-class product states*, not edge cases.
4. **The audit proper** (PARTS 3–8, 12–20) and the redesign that follows it.
