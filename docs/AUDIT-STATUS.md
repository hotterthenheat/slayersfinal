# Visual audit — what is done and what is not

Status of the 59-item audit written while clicking through the product. Written
to be checked, not to be believed: every "done" below names the file or the
measurement behind it, and everything unverified says so.

Last updated after the layout-mutation sweep. Gate: `tsc --noEmit`, `eslint .`,
**761 tests** (up from 31 at the start of this work), `vite build` — all green,
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

## The layout-mutation sweep

Four review rounds in a row landed a finding in a path *adjacent* to the one
just fixed, never the one under review. So the last round stopped waiting for
the reviewer and swept the class directly: **every path that mutates the Pulse
layout without going through `tile`**. A browser drove each one and read the
saved cells back out of `localStorage` after the click.

Six of seven were leaving the desk broken, and none of them was red anywhere.

| Path | Measured |
|---|---|
| Add panel | **14.7% empty.** The new panel took the width its widget asked for and nothing grew to meet it. Its height was the widget's too, so a panel landing beside a short neighbour reached straight through whatever stood underneath |
| Duplicate | **8.0% empty** — the copy was appended at `y: Infinity` with the source's width |
| Minimize | **9.8% empty.** The ten rows the panel gave up just stood there |
| Re-open | Grew the panel back *through* its downstairs neighbour. An overlapping layout sends `tile` to the band reflow, which rebuilds the arrangement the user made |
| Close | **10.3% empty**, a panel-shaped hole |
| Fit / Arrange with a panel on a second monitor | **16.7% empty.** Both laid out a band for a panel that is not on this screen |
| Detach → dock, nothing in between | Not empty, not overlapping, and **not the desk the user had**: a 6+6 row came home as two stacked full-width rows. Found by the reviewer, not by me — my own probe asserted "gapless and non-overlapping", which this satisfies. The assertion was weaker than the contract |

Every arrival now goes through one function, `place`, which honours the
requested cell when it is genuinely free and otherwise drops the panel below the
desk for the up-pack to lift in. Height changes go through `resizeHeight`, which
pushes the desk down *before* growing a panel so `tile` is never handed an
overlap. 10 new tests in `detach.test.ts`; all seven paths re-measured at 0.0%.

The round after that found the partition was applied at the runtime reflows and
**not at its two edges**. Loading a saved desk that had a legacy one-unit panel
popped out re-tiled the whole array including the absent cell: **50.0% dead,
with the one visible chart at half the desk width**. Undoing the close of a
*detached* panel fed its cell into the same tiling input. Both fixed; both
re-measured at 0.0%.

A third finding in that round was **refuted**. The per-panel ticker is dropped
from a locked two-column panel near 1024px, and the report said Customize was
then the only way to reach it. Measured: Maximize is offered on every panel at
every width while locked, and it opens the ticker editor. Reserving the ticker's
34px instead would have pushed out Detach or Pop out at 151px — reintroducing
the dead end fixed two rounds earlier, and that one has no alternative route,
because maximizing hides the placement controls.

**One thing the sweep found that no review had:** popping a panel out to another
monitor left its cell reserved on the desk it came from — **50.4% of the screen
showing nothing** with one of two panels out. Detaching and popping out look
like the same move and are not. A detached panel floats over the desk in the
cell it left, so reserving it costs nothing and is what makes docking straight
back a no-op; a popped-out panel is on another monitor and that cell is just a
hole. Detach reserves, pop-out packs.

Also closed here: the control that re-opens a collapsed panel was labelled
**"Minimize"**, the same as the one that collapsed it. Same defect class as the
keyboard announcement — a label describing something other than what the code
does.

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
- **Every arrival on the Pulse desk goes through `place`, and every height change through `resizeHeight`.** Both live in `pulse/detach.ts`. Writing a cell straight into `layout` is what broke add, duplicate, close, minimize and re-open, each independently, each silently. If you add a sixth way for a panel to appear, route it through `place` — do not append to the array.
- **Detaching and popping out are not the same move.** A detached panel floats over the desk in the cell it left, so that cell stays reserved and docking straight back is a no-op. A popped-out panel is on another monitor and its cell is a hole, so the desk packs and coming home relocates. Measured: 50.4% of the desk empty when the reserved-cell rule was applied to both.
- **"Gapless and non-overlapping" is weaker than "unchanged".** A probe asserting only the first passed a detach/dock round trip that turned a 6+6 row into two stacked full-width rows. If the contract is that an operation is a no-op, assert the geometry, not its properties.
- **Pulse panel sizes have no floor, deliberately.** The registry's `minW`/`minH` are the size a widget is *born* at and what the one-press arrange modes aim for — they are not a resize limit. Enforcing them meant a row could never be made to sum to 12, so there was always a strip of canvas nothing could reach. If you reintroduce a clamp in `hydrateLayout`, you reintroduce that.
- **Pulse row units are half what the comments assume.** `rowHeight` is 26 and presets are still authored in the old coarse unit; the `L()` helper doubles `y` and `h` on the way out. 12 fine rows and 6 coarse rows are the same 444px — that only works because the row height is 26 and not 32.
- **Case-only filename collisions are invisible to CI.** The container and CI both run Linux. Two of these reached the user's macOS dev server instead of a test. Check before merging directories.
- **Tests here run against the real clock, deliberately.** If you add an assertion over generated data, run `npm run test:dates` before trusting it. Five assertions have already encoded one day's draw as an invariant.
- **The user downloads ZIPs of `main`.** Work on a branch is invisible to them until the PR merges.
