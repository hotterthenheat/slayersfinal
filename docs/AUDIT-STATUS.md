# Visual audit — what is done and what is not

Status of the 59-item audit written while clicking through the product. Written
to be checked, not to be believed: every "done" below names the file or the
measurement behind it, and everything unverified says so.

Last updated at commit `25ce0eb`. Gate there: `tsc --noEmit`, `eslint .`,
**690 tests** (up from 31 at the start of this work), `vite build` — all green,
and green on **121 consecutive dates**, which is a claim this document could not
previously make.

Green has repeatedly not meant correct here. Three adversarial verifiers went
through the largest wave and found 26 problems, 3 of them blockers, in code that
passed every gate.

**The doc itself was the last thing to go stale.** Of the eight items the
previous revision listed as open and verified-not-done, **four were already
fixed** by waves that landed after it was written. They were only found to be
stale because the round that closed this list verified every item against live
source before touching it. That is now the standing rule for this file: it is a
record of measurements, and a measurement has a date on it.

---

## Merged into `main`

### Global
| Item | Where |
|---|---|
| Lime green accents → holo silver | It was the verdict system, not a stray class: `ENTER` mapped onto `bull`, so every QUALIFIED / PLAY / STRONG badge rendered green. `compass/verdict.ts` |
| "sim" / "live" wording | "sim" was a false alarm: nothing ever rendered "simulated" or "simulator". The two rendered hits abbreviated *similarity*. "live" was the real work, ~55 hand-edited sites |
| Landing em dashes → zero | Counted by occurrence, not by line. Everything remaining is in comments |
| Footer on every route | It existed only as furniture inside `Landing.tsx`; now `SiteFooter` with `full` / `compact` |
| Scrollbar you can see | Was `#2a2a2a` on a near-black shell; now visible, 10px, with `scrollbar-gutter: stable` |
| `skyvision` → `compass` | 142 occurrences, 40 files, two directories merged. Collision check ran first: a case-only clash is invisible on Linux and breaks the dev server on macOS, which is how the last two of these reached the user instead of CI |

### Landing
| Item | Where |
|---|---|
| Never presented as real market data | 17 liveness claims removed, including "these panels are running right now" |
| Data never incorrect | Both doctored demos fixed. The FADED card was computing `100 − confidence`, which **inverts** the value, so the strongest cards displayed as the hardest fades |
| Dealer positioning map redesigned | One shared component, so Pinpoint and Pulse got it too |
| "Questions, answered" heading | Now "Before you ask." Copy below untouched |
| Launch terminal → a neutral index | New `/terminal`. Every entry point moved, including a second one in the footer |
| Invented social proof | The handles and tallies were fixed in an earlier wave (seeds now read `author: 'Worked example'`, `votes: 0`). What survived was the **section copy** claiming ideas are "voted on by the people trading with it", and a vote box on every row. A voting affordance nobody can use is a claim about other people whether or not the number beside it reads 0 |

### Compass
| Item | Where |
|---|---|
| Weigher → contract search | `core/contractQuery.ts`. Verified against 46 hostile inputs; none silently returns a contract you did not type |
| Lotto → MOC lotto | `LottoBoard.tsx` |
| Contract chart with entry / TPs / stop | `ContractTrack.tsx`. Derived, not stored, and proven exact: max error **$0.0045**, which is `toFixed(2)` rounding |
| Universe width | 28 → **194 referenced names**. A previous attempt padded to 520 from a NASDAQ listing filtered only by symbol shape; 326 of those were names no other desk could say anything about |
| "Best setups no matter what" | True global top-N now: 100% overlap with an independently recomputed ranking, no per-ticker cap, 174–178 distinct tickers across 240 rows |
| Board ordered by the alphabet | `score` is a rounded integer, so ~16 values spanned thousands of candidates and ties fell to ticker spelling. `Setup.rank` carries the continuous value now |
| Fabricated "Live mid" | `liveMid` was `mid × (0.9 + rng() × 0.2)`, printed beside the real mid. Gone from all three renders; two were orphaned components, now deleted |

---

## Closed in the final round

### Four systemic classes, swept by pattern rather than by filename
The recurring failure on this project was that each round fixed the *named*
instances and the next round found the *same class* somewhere new. The last
round searched by computation shape and by rendered-string shape across all of
`src/`, which is the only reason the fifth level re-derivation was found — it
imports `data/gex.ts` nowhere at all and is invisible to an import-graph search.

| Class | What was found |
|---|---|
| Fabricated statistics | The similar-event panel invented six quarters and reported a hit rate over them, beside a card averaging eight *different* generated prints. Analogs come off `printHistory` now, so the realized column averages to `histAvgMovePct` exactly. `dayKey()` is out of the analog seed: a quarter that already happened was re-rolling its realized move nightly |
| Fabricated statistics | The market-state replay claimed a **holdout**. `statereplay.ts` says in its own comments that nothing is fitted and `daysAgo` is drawn independently of the outcome — that is a recency split, not a held-out validation |
| Fabricated statistics | The Edge Ledger reports a win rate, profit factor and expectancy over 48 trades the reader never took, under the word "your", mounted directly beneath the reader's real tracker book. Population named at the headline, at the stat cards, and at a divider between the two books |
| Imperative language | Two Pulse widgets rendered raw engine identifiers into badges: ACCUMULATE / AVOID, and PLAY / FADE / SKIP. The observational map existed but was page-local to `EarningsHub`. One definition, three consumers now |
| Level re-derivation | **The fifth.** `hedgeimpact.ts` took the gamma flip off `snapshot.plan`. Now reads `buildLevels`, and `levels.test.ts` covers it |

### The gate was red more than a third of the time
Not in the audit, found while closing it, and the largest single finding of the
round. The suite went 654 green → 1 red overnight with **no commit between**.
Measured across 121 consecutive simulated dates: **45 were red.**

Five assertions had each encoded one day's generated data as an invariant.
Worst was the news blacklist, which matched real firm names against headline
*text*, so on 24 dates in 121 the daily draw put a real company in its own
headline and the test failed for exactly the thing it was written to permit —
borrowed *authority* was the defect, not a company being its own subject.

One was a genuine product bug rather than a test bug: `compass.ts` published
**negative zero**. `Number((-0.0043).toFixed(2))` is `-0`, and `-0 >= 0` is true
while the unrounded slope's is not.

**121 red days → 0.** Kept checkable by `npm run test:dates` rather than by
freezing the clock, which would have made the suite reproducible *and blind*.

### Also closed
- **The terminal had two ideas of what day it is.** The simulator seeded from a UTC day boundary while the twenty research modules seed from the local date. West of Greenwich, reloading after 5pm regenerated every candle while the scanners and news stayed put; reloading at local midnight did the reverse.
- **The holiday table ran out in 2028**, and running out is silent — rungs past it are dropped, so the expiry picker would just get shorter. Extended to 2031, with the one test in the suite that reads the clock on purpose and fails while there are two years left to act.
- **Guide claims that had gone stale.** The four the audit named were already fixed. Three others survived in `Overview.tsx` and `Faq.tsx` because the guide's honesty rule lived in a comment at the top of `Desks.tsx` **only** — which is precisely why two waves corrected that file and left identical false strings in its siblings. The rule now lives in `parts.tsx`, which every guide page imports.
- **Pricing claimed "Real-time Discord chat & alerts"** on the plan card while the FAQ on the same page was honest about it.

---

## Verified stale — reported open, found already fixed

Kept because the previous revision of this file asserted all four as
verified-not-done, and a doc that is wrong about its own open list is worse than
no doc.

| Claimed open | Actually |
|---|---|
| Tape cold start ("5 tapes then 100 load") | Fixed. `useState(openingTape)` seeds 400 rows as *initial state*, so the tape is full on the first frame. No stagger, no growing slice, no skeleton — the virtualiser's window is fixed and `padBottom` gives the scrollbar full height immediately |
| Volatility Lab exists in two places | One surface. `VolatilityDesk` does not exist; `pages/gex/desks.tsx` carries an explicit tombstone comment, and `/pinpoint/volatility` redirects to Prove It in one hop |
| The news and levels fixes were self-reported | Re-verified independently. They hold |
| An em dash in the Prove It subtitle | Not present. The dashes in that file are in comments and in one empty-value placeholder, neither of which counts |

---

## Things reported and then disproved

A refuted finding is worth as much as a confirmed one, and each of these was
nearly "fixed" into a regression.

- MetricGrid raggedness — my own probe matched any flex-wrap row with three children.
- `/lotto` and `SegmentedControl` "broken" — my probe read `aria-checked` on controls correctly using `aria-pressed`.
- Em dashes app-wide — a brief claimed earlier waves drove these to zero everywhere. They cleared the **landing page**, which is what was asked. They are still widespread elsewhere, by design.
- Quick Scalp horizon — reported missing, was already shipped in `121a40f`.
- "Fixing `-0` also stops the feed rendering `-0.00%`" — it does not. `(-0).toFixed(2)` is `'0.00'`. The bug was real; that consequence was not.
- "Only two expression cards render, so 'best' of two carried no information" — the long-vol side is a genuine three-way selection. The edit was right, the stated reason was wrong.

---

## Known hazards for whoever works on this next

- **Levels are single-derivation.** `data/gex.ts` `buildLevels` / `pinStrike` own spot, callWall, putWall, flip, pin, king, pinned across 16 tickers in `levels.test.ts`. **Five** separate modules have re-derived one of these locally. Each time it looked fine: the walls agree most days. The flip disagreed with the rail on **5 of 16 names**, ranked-targets put the pin **$10 off** on AAPL, and the map crowned a different strike on **8 of 32** ticker-expiry combinations. The fifth imported `gex.ts` nowhere, so search by computation shape, not by import graph.
- **`simulator.ts` must never import `scanUniverse.ts`.** It reads the other way. The cycle surfaces as `undefined` at module init, not as a type error. I created it once.
- **Routing failures here are silent.** The catch-all sends unmatched URLs to a real page and a wrong `?view=` falls back to the first pane, so a broken link renders as a working one. Follow redirects; do not read the route table.
- **Renaming a storage key silently wipes saved layouts and views**, and nothing catches it. The Pulse key is frozen at `slayer_pulse_workspace_v1` on purpose and the schema version rides *inside* the payload. Bump `WORKSPACE_VERSION` and add a step to `migrateWorkspace` in `pulse/detach.ts`; never bump it alone, because `loadState` hands back a fresh workspace on any mismatch and that is a silent delete of every desk the user built.
- **Pulse panel sizes have no floor, deliberately.** The registry's `minW`/`minH` are the size a widget is *born* at and what the one-press arrange modes aim for — they are not a resize limit. Enforcing them meant a row could never be made to sum to 12, so there was always a strip of canvas nothing could reach. If you reintroduce a clamp in `hydrateLayout`, you reintroduce that.
- **Pulse row units are half what the comments assume.** `rowHeight` is 26 and presets are still authored in the old coarse unit; the `L()` helper doubles `y` and `h` on the way out. 12 fine rows and 6 coarse rows are the same 444px — that only works because the row height is 26 and not 32.
- **Case-only filename collisions are invisible to CI.** The container and CI both run Linux. Two of these reached the user's macOS dev server instead of a test. Check before merging directories.
- **Tests here run against the real clock, deliberately.** If you add an assertion over generated data, run `npm run test:dates` before trusting it. Five assertions have already encoded one day's draw as an invariant.
- **The user downloads ZIPs of `main`.** Work on a branch is invisible to them until the PR merges.
