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
| Anything implying **holdings, short interest, insider or institutional ownership** | No source. |

---

## What to remove, in one line each

1. **Earnings Hub** — delete the desk, or reduce it to "expected move vs realized move"
   driven purely by options, with the user supplying the date. Do not ship PLAY/FADE
   grading built on estimates you cannot obtain. It is currently sold in a paid tier.
2. **Stocks quality + news sleeves** — remove the two unbacked sleeves. A two-sleeve
   composite (momentum + options flow) that is *true* beats a four-sleeve composite that
   is half invented.
3. **Sector rotation** — remove until you have a classification source.
4. **`catalystPriors`** — remove the news-derived prior from `quant.ts`, or replace it
   with something measurable.
5. **Dark Pool** — hold pending the TRF answer from your vendor. If it is consolidated
   only, either keep it and label it 15-MIN DELAYED everywhere, or cut it.

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
