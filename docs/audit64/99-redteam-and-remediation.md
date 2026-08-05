# 99 — Red team (Gate 63) and the remediation plan (Gate 64)

The two synthesis outputs the 64-gate brief asks for, written after the fourteen
measurement reports in this directory and the design thesis in `00-design-thesis.md`.

They did not exist when the audit sweep finished: the two agents assigned to them died on a
weekly usage limit while the other fifteen completed. This document is that work done directly,
from the reports the sweep did produce. Where it asserts a number, the number came from a report
that measured it, and the citation is the report and its finding ID.

---

## Part A — What the audit is worth, before its findings are used

An audit that is not itself audited is a list of opinions with line numbers. Four things about
this one need saying out loud, because three of them limit what the findings prove and the
fourth changes the priority order.

**A1. Every "wrong number" finding is a finding about a simulator.** There is no market data in
this repository — 0 `fetch`, 0 `WebSocket` in `src/` (`10-desk-shell-index-guide.md` F-05a).
Nothing here found a mispriced option; what it found was two *internal* engines disagreeing on
one screen. That distinction matters in both directions. It weakens any claim that a fix makes a
number *correct* — it makes two mock engines *agree*, which is a different and smaller thing. It
does not weaken the findings at all, because a self-contradiction is a defect at any data
source: when the chain says `$1.35` and the ladder above it says `$1.59` for the same contract
(`10-desk-compass.md` P0-2), the reader is being shown a broken instrument regardless of where
the quotes came from.

**A2. Fourteen agents working blind to each other inflates the count.** The raw register is 147
titled findings (37 P0 / 54 P1 / 40 P2 / 13 P3, extracted mechanically from the fourteen
reports). It is not 147 problems. The timezone defect is reported four times, by four agents,
about four desks (`05` §7.5, `10-desk-pulse-trace` P0-3, `10-desk-stocks-…` P0-1,
`10-desk-pinpoint-proveit` D-17). The palette violation is reported in five reports and is one
rule broken at ~20 call sites. Deduplicated by root cause, the register is **14 causes**, and
Part C is organised by those rather than by report — because fixing by report means fixing the
same thing four times and still missing the fifth site nobody was assigned.

**A3. Two reports disagree, and only one of the disagreements is real.**
`09-performance-charts-tables.md` opens its findings with "P0: *None*" while the five desk
reports return 37 P0s. That is not a contradiction — 09's gates were 39/40/41 (charts, tables,
render cost), where a defect costs the reader their place, not their data. The real disagreement
is on `MetricGrid`: `06` F-10 rates the shared KPI strip **P2** (a duplication finding), while
all five desk red-teams name it the **single strongest generic tell** in the product. The desk
reports are right and F-10's severity is wrong: this one is not about duplicated code, it is
about identity, which is the thing the brief is actually for. Part C reprioritises it.

**A4. The most serious finding in the audit is not about a number.** It is
`10-desk-shell-index-guide.md` F-05b: **no page in the application states that the market data
is simulated**, and `/guide/faq` answers *"How current is the data?"* with *"Prices, levels and
flow update continuously while the terminal is open"* — true of the animation loop, and read by
any human being as a claim about a market. Verified directly: across `src/pages/legal/*` and
`src/pages/guide/*` the strings "simulat", "synthetic" and "modeled market" appear **once**, in a
sentence about one Prove It feature (`Desks.tsx:189`). The disclaimer covers "delayed or
incomplete" — which is language for a real feed that is behind, not for a feed that does not
exist. Every other finding in this audit is a defect in a research tool. This one is the
difference between a research tool and a thing a person could mistake for a broker. It leads
Wave 1 for that reason and no other.

---

## Part B — Gate 63: the hostile pass

The question the brief asks is: *swap the logo and the strings — what is still recognisably this
product?* Five reports answered it per-desk. This is the cross-cutting answer.

### B1. The single strongest tell: every desk opens the same way

Measured across the five desk reports and confirmed directly: **`MetricGrid min="170px"` appears
at 20 call sites in 20 files**, and 20 files render `<StatCard>`. The opening ~85–130 px of
almost every desk in the product is a row of four to six bordered boxes holding
uppercase-micro-label / big-number / grey-sub.

| Section | Views opening on the strip | Evidence |
|---|---|---|
| Pinpoint + Prove It | 8 of 12 (`/prove-it?view=models` renders **two**, 12 cards on one scroll) | `10-desk-pinpoint-proveit.md` §7.1 |
| Trace | 4 of 4 — live-tape 6, scanner 5, reconstruction 5, dark-pool 6 | `10-desk-pulse-trace.md` §9.1 |
| Stocks / News / Earnings | 3 of 4, identical shape, same top 85 px | `10-desk-stocks-…md` §9.1 |
| Compass · Lotto | 5 equal cards, and the equal weighting is what makes it read that way | `10-desk-compass.md` §6.3 |

`06` F-10 measured the consequence: **13 of 20 desks give no tile emphasis at all** — every tile
in the row is the same size, the same weight, the same border. A row of equal boxes states that
its contents are of equal importance, which is never true and is the exact opposite of the
brief's dominant-object rule.

This is worth being precise about, because the fix is not "delete the tiles". What is inside
them is frequently excellent and entirely Slayer's — Lotto's five cards hold an auction read, an
MOC score, an imbalance and a countdown, and nothing generic contains those. **The container is
the defect, not the contents.** The brief's Gate 12 lists "KPI tile walls" among the things a
redesign may not *propose*; the measurement is that it is already the shipped default opening
move on 13 of 20 desks.

### B2. The rest of what survives a logo swap

Named with the report that measured each, so none of this is impression:

1. **The toolbar grammar** — `Filters ▾ / Templates ▾ / Columns ▾` on Scanner, `Views ▾ /
   Columns ▾` on Tape: same trigger class, same popover shell, same "N" badge, same "Save current
   filters…" input. Any B2B table product. (`10-desk-pulse-trace` §9.2)
2. **`DataTable` itself** — sortable header + chevron + row hover + `maxHeight` scroll box, used
   unchanged on Scanner and Dark Pool. (§9.3)
3. **The 503 px five-column footer sitemap** — Products / Company / Access / Legal + an X link,
   identical on 16 routes, **41.4 % of `/terminal` and 50.0 % of `/guide/shortcuts` at 390 px**,
   duplicating 15 of the 26 links on the page above it. (`10-desk-shell-index-guide` §9, F-14)
4. **The screener chrome, duplicated rather than shared** — two `WatchStar`s, two
   `WATCHLIST_KEY`s, two compare toggles, differing by a `title` attribute and 8 px of padding.
   (`10-desk-stocks-…` §9.3, F-22)
5. **The Monte Carlo fan + terminal histogram**, and **the Volatility Lab four-up** — the
   OptionMetrics-era layout, in every retail options tool since 2015. (`10-desk-pinpoint…` §7.2–3)
6. **The Vanna shock panel** — a titled, axis-labelled, hover-enabled ~800×200 px panel
   containing a line with a **measured 0.042 px deviation from straight** (D-15). A chart whose
   only job is to occupy the place where a chart goes is the definitional generic artefact.
7. **The `⌘K` palette chrome and the `MODEL SLAYER-VOL v0.2` chips** — versioning as branding,
   hard-coded, with no model state behind them.
8. **The wall clock.** `TopBar` renders ET time correctly (it goes through `marketClock`, and its
   hover explains the phase). The finding is not that it is wrong; it is that **it is the only
   market element that travels between desks, and it is connected to no number on any desk**
   (`10-desk-shell-index-guide` F-17). Every finance product has a clock in the corner.

### B3. What must not be touched

The identity is real, it is concentrated, and it is almost all in *rows, drawers and ledgers* —
never in frames. Any remediation that damages one of these has failed regardless of what else it
fixed:

- The Weigher's **six-row factor ledger with a footing contribution column** and `Σ six rows`.
  No generic product shows you the arithmetic and lets you add it up.
- The Weigher's **neighbour rail with the spot rule embedded between rungs**.
- Lotto's **auction-reach sentence** ("displacing 1.27σ, worth 1.03% on this strike") and its
  **`Against the auction (6)`** collapse — a deliberately withheld ranking, with the reason given.
- **`QUALIFIED / WATCH / FADED` rendered `select / warn / neutral`, never green** — the palette
  discipline, stated once in `setupState.ts:67-72`.
- **`HeldFromSweep`** — a panel that tells you its grade is from the previous sweep, and why.
- Fracture's **forced-flow balance sheet** with observed/assumed confidence tiering, ordered
  most-knowable → most-assumed, and its explicit **INVALIDATION** card.
- The **GEX heatmap** with king/wall/spot rules and the expiry spotlight; History's
  **level-migration timeline** with structural-event ticks.
- The **Liquidity Map** field — a decaying, re-stacking time × price book with sweep pills.
- The tape's **per-row micro-meters** (`SpreadCell` / `FlowCell` / `RatioCell`) — three graphs
  per row at 40 px row height — and its **clipped-column counter**, which says out loud what the
  viewport is eating.
- **"What it reads as" / "Competing read"** and `printRead.ts`'s sentence generator; Dark Pool's
  confidence tier that is **deliberately never green**; Reconstruction's **Alternates +
  invalidation disclosure**.
- The earnings **magnitude-vs-direction spine**, the rotation map's **quadrant-equals-phase**
  construction, and the whole **PLAY / FADE / SKIP → QUALIFIED / RICH / NO EDGE** observational
  lexicon.
- The **Community Ideas composer** — no other product places your entry price against a gamma
  flip while you type it — the **Terminal index desk rows**, and **Settings' six named
  local-data groups** with live stored counts.

### B4. The verdict, in one line

**The rows are Slayer's and the frames are stock.** The cheapest available identity win is not a
redesign — it is to stop opening thirteen consecutive desks on the same undifferentiated row of
equal boxes, and to give the one element that travels between desks something to say.

---

## Part C — Gate 64: the remediation plan

Fourteen root causes, ordered by what a reader loses if it is not fixed. Each names the findings
it closes, so the raw register stays traceable.

### Wave 1 — Say what this is · **P0, and it leads**
> **RC-12a.** The product does not disclose that its market data is simulated, and one page
> implies the opposite.

| Closes | Site |
|---|---|
| `shell` F-05b | `src/pages/guide/Faq.tsx` — "How current is the data?" answered as if live |
| `shell` F-05a | `src/pages/legal/Terms.tsx:73-77` — third-party-data clause; there is no third-party data |
| `shell` F-01 | `src/pages/guide/Desks.tsx:88` — "all six are 0DTE or 1DTE"; the desk ships a 365-day LEAPS sleeve |
| `stocks` P0-7 | `/stocks` — the one desk of four with no provenance disclosure |
| `shell` F-03, F-02 | Guide claims every desk follows the active ticker (false on three) and documents 2 of Compass's 5 control groups |
| `shell` F-06, F-19 | Terms names no jurisdiction; Feedback labels `import.meta.env.MODE` as "App version" |

### Wave 2 — One clock · **4 × P0, one mechanism**
> **RC-1.** Every desk timestamps in the viewer's timezone under headers labelled ET, and 16 of
> 17 desks cannot say there is no session.

`core/calendar.ts` already resolves ET correctly and `marketClock()` already returns the phase.
Nothing needs inventing; five sites need routing through it, and the phase needs to reach the
desks. Closes `05` §7.4 and §7.5, `pulse-trace` P0-3, `stocks` P0-1, `pinpoint` D-17, and gives
`shell` F-17 (the disconnected clock) something to carry.

Sites measured: `core/simulator.ts:586,650` (every tape print, both feeds), `data/tapeSeed.ts:93`,
`components/compass/sweepClock.ts:7`, `components/gex/vannacharm/WallDrift.tsx:48`,
`pages/community/book.ts:116`.

### Wave 3 — One number per name · **P0 cluster, the audit's dominant family**
> **RC-3.** Two engines, one screen. **RC-5.** One name, several quantities. **RC-6a.** Nine
> compact-USD formatters that disagree about the same number.

Thirteen findings are the same shape: a number correct against its own spec and wrong against
the thing rendered beside it. `04` §3.1 (IV Rank ×3), §3.2 (expected move 7.9× apart), §3.3 (one
contract, two prices), §3.6 (dealer bias, two thresholds, both on `/pulse`); `pinpoint` D-01
(four answers to "which way are dealers hedged"), D-02, D-04 (three 30-day IVs for one ticker),
D-07 (two boundaries 8× apart), D-08; `compass` P0-2, P0-3; `stocks` P0-5; `pulse-trace` P1-2.
Plus the naming collisions — "Confidence" is six things, "Score" five, "Conviction" three,
"MODELED" two opposites — and `06` F-1, the nine formatters.

The rule: **one quantity, one function, one name, one formatter.** Where two readings are
genuinely different, they get different names; where they are the same, they get one source.

### Wave 4 — Nothing random wears a measurement's name · **6 × P0**
> **RC-2.** The generator emits a hash or a uniform draw and the interface labels it as measured.

`compass` P0-5 (invalidation price *and* its stated cause, both random, naming structure the
engine never computes), `stocks` P0-2 (three of four sleeves) and P0-4 (rotation axes captioned
as relative strength, computed as gaussian noise), `pulse-trace` P0-8 and P0-2 (an
always-positive "Peak Return"), P0-5 (shelves with no memory), `04` §3.5 and §3.23.

Two acceptable fixes per site, and no third: derive it from data that exists, or label it as an
assumption. `05` §4.1 documents what good looks like — the Weigher's `NOT PRICEABLE` state.

### Wave 5 — The palette rule holds · **the house rule, ~20 sites**
> **RC-4.** Green means positive market direction. It is currently also used for model quality,
> calibration, process state and urgency.

The repo argues against this in its own comments (`Stocks.tsx:82-87`, `stocks.ts:40-42`) and
ships it three files over. `pinpoint` D-09…D-14, `stocks` P1-3, `pulse-trace` P0-1 (in-the-money
puts as positive OTM, in bull green), P2-6, P2-7, `04` §3.9, `shell` F-20. Mechanical, and
verifiable by grep once the rule is a lint-visible convention rather than a comment.

### Wave 6 — Intent survives navigation · **2 × P0 + the a11y cluster**
> **RC-8.** `AppShell` wraps the outlet in `AnimatePresence mode="wait"` keyed on the top-level
> path segment, so a cross-section navigation mounts the destination twice; three desks read
> `location.state` on mount and then destroy it with `replaceState`, so mount two finds nothing.
> **RC-11.** Focus is managed per-component and not per-view.

Measured consequence: a monitored contract renders for ~190 ms and is replaced by an unrelated
setup (`01` P0-01); a Weigher opened with `horizon="SWINGS"` grades a 0DTE lotto contract (`01`
P0-02). Closes `01` P0-01, P0-02, P1-03, P1-04, P1-05, P2-10; `08` P0-1 (`DrilldownDrawer`
declares `aria-modal="true"` while leaving focus outside itself — worse than no dialog
semantics), P1-1 (Compass analysis drops focus to `<body>`, Escape is a no-op, back is 99 tabs
away), P1-2, P1-3, P1-4.

The thesis's answer is already written: **intent travels in the URL, never in `location.state`**
(`00-design-thesis.md` §3.3).

### Wave 7 — Identity · **the brief's actual subject**
> **RC-7.** See Part B. The frames are generic; the rows are not.

Give each desk a dominant object and let the strip earn its place or lose it. Closes `06` F-10,
`07` F-06 (every desk burns a full-width header band ~70 % empty) and F-07, `pulse-trace` P2-8
and P1-10, `compass` P2-15, `shell` F-16. Bounded by `00-design-thesis.md` §7 (density budgets
per desk) and §8.1 (dominant-object ratios: 7/5 or 8/4, nothing else).

### Wave 8 — The app admits what it does not know
> **RC-9.** "LOADING" is written eleven times and visible for 0 ms; `DEGRADED` is a constant; no
> chart or table has a stale state; there is no staleness threshold for any data type.

`05` §2, §3, §6, §7.3; `09` 40-C.

### Wave 9 — Responsive
> **RC-13.** The desk scrolls sideways on phones and the document-level overflow test cannot see
> it; panel titles collapse to as little as **7 %** of their text; on `/compass?sleeve=…` the
> selected sleeve is off-screen at load, so no sleeve looks selected.

`07` F-01…F-12, `09` 41-B, `compass` P1-11.

### Wave 10 — Weight
> **RC-10.** Dark Pool renders 12,193 unvirtualized elements and re-reconciles all of them seven
> times every nine seconds; Stocks renders 9,279 in one pass; `/trace/live-tape` accumulates
> **CLS 1.061 in 30 s** of ticking; every route downloads 1,577 kB including the four whose
> module graph is ≤ 7 files.

`02` A1…A4, B4, B6; `09` 39-A…39-G, 41-A; `stocks` P1-4.

### Wave 11 — Dead ends
> **RC-14.** Controls that do nothing, charts that cannot show what they are named after, fields
> computed and never rendered.

`pulse-trace` P1-5 (two of five Scanner presets are no-ops; premium filters two orders of
magnitude off), P1-6; `compass` P2-16; `pinpoint` D-06, D-15, D-18; `06` F-12, F-14; `02` C8.

### Waves 12–14 — Shared primitives, storage, remaining polish
`06` F-4…F-9, F-11, F-15, F-16 (RC-6b: four copies of `useDismiss`, the fourth silently dropped
Escape; five sentiment→tone maps and a sixth that disagrees; three chart wrappers sharing 241
redundant lines). `02` B1, B3, C1…C7 (RC-15: nine storage keys written by merely visiting a
desk; `loadJournal` is the only storage read a hostile value can crash; `localStorage.setItem`
during render). Then the P3 tail.

---

## Part D — The release checklist (Gate 64)

Completion may not be claimed on a green build. These are the conditions, and each is checkable
by someone who did not write the code.

**Per wave, before it is called done:**

1. `npm run build` passes — necessary, never sufficient. `npx tsc --noEmit`, `npx eslint .`
   checked on its **real exit code** (`npx eslint . | tail` exits 0 even when lint fails), and
   `npx vitest run` green. Vitest does not typecheck; a signature error passes it and fails the
   build.
2. Every number the wave touched **rendered and read**, not diffed. Every defect in this audit
   was a number correct against its own spec and wrong against the thing beside it, and not one
   of them was findable by reading either side alone.
3. Both sides of a two-sided defect fixed in the same commit. Fixing one side *moves* the
   contradiction rather than closing it, and it looks fixed — the regression that shipped in
   `7c2aca3` and was corrected in PR #46.
4. A regression test where the failure was silent. `mocClock.test.ts` is the model: fixed
   instants, both directions, and at least one case the original bug would have passed.
5. Nothing on the Part B3 list weakened.

**Before the audit as a whole is called done:**

- [ ] Every P0 in the register closed or explicitly deferred **with the reason recorded** — not
      silently dropped.
- [ ] The provenance statement (Wave 1) reachable from every desk, not only from `/legal`.
- [ ] One quantity → one function → one name → one formatter, verified by grep, not by memory.
- [ ] No screen renders two numbers for one thing.
- [ ] Green appears only for positive market direction; a grep for `text-bull`/`bg-bull` returns
      only market-direction sites.
- [ ] Every desk has a dominant object, and it is not a row of equal boxes.
- [ ] Keyboard: the three workflows in `08` §Gate 35 pass, including WF1's "back".
- [ ] axe-core clean at 1440×900 **and** 390×844 (currently 0 and 2).
- [ ] Density budgets in `00-design-thesis.md` §7 met per desk, measured.
- [ ] This document's Part A re-read, and any finding it weakened re-checked before it is used
      to justify a change.

---

## Part E — What this plan does not settle

- **Wave ordering is a judgement, not a measurement.** Waves 1 and 2 lead because their
  consequences are about trust rather than polish. A reader who thinks Wave 7 (identity) is the
  point of the brief and should lead is not wrong on the brief's own terms; they are wrong only
  if a person can still mistake this for live data while they are looking at the new layout.
- **Wave 3 cannot be finished by agreement alone.** Making two engines return the same number
  requires deciding which one is right, and for several of these — the two dealer-bias
  thresholds, the three 30-day IVs — the reports establish the disagreement without establishing
  the winner. Those need a decision, and the decision is a modelling call, not a bug fix.
- **No estimate is attached to any wave.** The reports measure defects, not effort, and an
  invented number here would be the exact kind of confident fabrication this audit spent
  fourteen reports finding.
