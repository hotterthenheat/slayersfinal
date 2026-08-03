# Compass — UI/UX audit

Audited at `4741b23`, clean tree, 837 tests green, typecheck clean.
Nothing in this document has been implemented. It is the plan, not the change.

Every finding below was reproduced against the running app or pinned to a line
of source. Where a claim is a measurement, the measurement is quoted.

---

## 0. Corrections to the brief

Three things the brief assumes are not true of this repo. Flagging them first
because two of them change what "run the checks" can mean.

| Brief says | Reality |
| --- | --- |
| `src/data/skyvision.ts`, `src/types/skyvision.ts`, `src/components/skyvision/*` | Renamed in `80c14fb` ("The last name from the old brand is gone"). The files are `src/data/compass.ts`, `src/types/compass.ts`, `src/components/compass/{ContractChain,SignalMonitor,ImpactLeaderboard,GreeksRow}.tsx`. No `skyvision` identifier survives anywhere in `src/`. |
| Run `npm run deadcode`, `npm run duplication`, `npm run test:e2e`, `npm run test:a11y` | None of these scripts exist. `package.json` has `dev, build, preview, serve, typecheck, lint, test, test:watch, test:dates`. There is no Playwright test runner wired into the project and no axe harness. |
| Playwright MCP, Chrome DevTools MCP, Context7 | None are connected to this session. |

What I used instead, and what that costs:

- **Playwright directly** (`playwright@1.61.1` is already a devDependency) driving
  the pre-installed Chromium. This gives real interaction, real screenshots and
  real DOM measurement — everything the MCP would have, minus the convenience.
- **axe-core** — already present at `node_modules/axe-core/axe.min.js`, injected
  into the page and run per mode. No install needed.
- **Performance** via `PerformanceObserver` (`layout-shift`, `longtask`,
  `largest-contentful-paint`) injected before navigation, rather than a DevTools
  trace. This measures LCP/CLS/long tasks accurately; it does **not** give a
  flame chart or a React profiler render count. Where I could not measure
  something, I say so rather than estimating it.

If you want `test:e2e` / `test:a11y` / `deadcode` / `duplication` to exist as
commands, that is a separate piece of work (a Playwright runner config, an axe
wrapper, `knip` or `ts-prune`, and `jscpd`). I have not added packages, per the
brief's constraint. Say the word and I will wire them.

---

## 1. What is already right, and must survive

Listing these because a refinement pass that breaks them would be a regression,
and several are load-bearing decisions with the reasoning already in the source.

- **The verdict lexicon is already correct.** `components/compass/verdict.ts`
  maps the internal `ENTER/EXIT/WATCH` to the user-facing
  `QUALIFIED/WATCH/FADED`, and tones them `select/warn/neutral` — never green.
  The rule is stated once in `setupState.ts` ("green & red are the market's own
  language … a verdict that renders green is this rule being broken"). No
  internal `BUY`/`FADE` string reaches a user-facing surface: `LottoBoard.tsx`
  routes `ContractVerdict` through `GRADE_VERDICT` for exactly this reason.
- **The two-tier cadence is real and deliberate.** `Compass.tsx:236-249` gates
  the sweep on `SCAN_INTERVAL_MS = 10_000` with its own snapshot ref; the chain
  reads `marketData` every tick. `buildCompass` hides the feed behind a getter
  so touching `.chain` does not run a 9,000-contract sweep. `SetupScanBoard` is
  `memo`'d and every prop Compass hands it is a stable identity. Do not collapse
  this.
- **The graded row travels with the click.** `MonitorTarget` carries the `Setup`
  and the `sweptAt` that produced it (`Compass.tsx:61-77`), and `openRow()` has a
  documented order of authority. This is what stops the panel disagreeing with
  the board — a defect that previously showed 97/ENTER on the board and 51/EXIT
  in the panel one click later.
- **The take-profit ladder is honest.** `buildTakeProfits` emits every rung
  `PENDING` because nothing has been entered; only `contractTrackModel` — which
  reprices on real bars — is entitled to say `HIT`.
- **`liveMid` is dead on every surface.** Three separate comments record why. It
  still exists on the type and is still computed, but nothing renders it.
- **The Weigher withholds a grade it cannot justify.** `isPriceable()` gates the
  composite behind `mid > 0.02 && |delta| >= 0.01`, and the unpriceable branch
  explains itself instead of printing a number.
- **The factor ledger foots exactly.** `apportion()` uses largest-remainder so
  the six contributions sum to the displayed composite rather than drifting by a
  point. This is the single best thing on the page and the model for what the
  rest of Compass should feel like.

---

## P0 — Incorrect or misleading

### P0-1 · The contract chain prices every strike at a different expiry than the board beside it

**File** `src/data/compass.ts:698-732` (`buildChain`), rendered by
`src/components/compass/ContractChain.tsx`.

**Reproduction**
1. `/compass` — Top Setups, which stamps `0DTE` on every row it emits.
2. Click *Open full analysis* on any card.
3. Compare the monitor header's `Mid` with the same contract's cell in the
   Contract Chain on the right.

**Measured** On `BAC 41.50P` the header reads **$0.16** and the chain cell for
the identical contract reads **$0.47** — a 3× disagreement, both visible in one
screenshot, at the same instant.

**Cause** `buildChain` hardcodes the DTE:

```ts
premium: Number(estimatePremium(spot, node.strike, 'C', iv, 1).toFixed(2)),
//                                                          ^ always 1DTE
```

while the board's expiry comes from `PROFILES[scanner].expiry`, which is `0DTE`
for four of the six presets. `buildImpact` is already passed
`PROFILES[scanner].expiry`; the chain was simply missed.

**Why it matters** The chain is the strike-picking instrument — its entire job is
letting a user compare strikes and click one. Every comparison is against a
premium for the wrong expiry, and clicking a chain strike opens a monitor that
reprices it on the board's expiry, so the number changes on click with no
explanation. This is the "numbers disagree between board and detail panel" case
in its purest form.

**Proposed correction** Thread the active preset's DTE into `buildChain` exactly
as `buildImpact` already receives its expiry, and label the chain header with the
expiry it is pricing (`Contract Chain · 0DTE · 08/03/26`) so the two panels state
their clock rather than implying a shared one.

**Risk** Low. One call site, one added argument. Chain premiums fall for the four
0DTE presets. No test pins chain premium today, which is itself part of the
problem.

**Verification** Unit test: for each preset, the ATM chain cell equals
`makeSetup(...).mid` for the same ticker/strike/right. Playwright: enter review
mode, read the header mid and the chain cell for the monitored contract, assert
equality.

---

### P0-2 · "Confidence" is the score wearing a percent sign, presented as an independent read

**File** `src/data/compass.ts:425`. Rendered at
`src/components/compass/SignalMonitor.tsx:107-121`, `src/pages/Tracker.tsx:250`
and `:400-404`, `src/pages/landing/LiveSections.tsx:242` and `:365`.

```ts
confidence: Math.round(clamp((score - 55) * 2.1, 5, 98)),
```

**Reproduction** Open any setup's full analysis. Score 97 → Confidence 88%.
Score 96 → 86%. It is a bijection with no second input.

**Why it matters** In full analysis the Confidence meter is the **first** thing
in the "Read" panel, above the Greeks, with a progress bar giving it the visual
weight of a model output. A user reading "score 97, confidence 88%" believes two
things agree. They are one thing said twice. The desk already knows this —
`SetupScanCard.tsx:96-98` deliberately omits Confidence from the card with the
comment *"the engine derives it linearly from the score, so a Conf column is the
Score column wearing a percent sign"* — so the same codebase both excludes it and
features it, depending on which pane you are in.

This is also the brief's "a score has no discoverable anatomy". The Weigher has a
six-row ledger that foots to its composite. The Setups score has nothing: no
breakdown, no anatomy, and a fake second opinion sitting where the anatomy should
be.

**Proposed correction** Delete the Confidence meter from the Read panel. Replace
it with facts that are *not* derivable from the score and that a contract reader
actually needs — all of them already computable from fields on hand:

- breakeven price and the move the underlying needs to reach it
- intrinsic vs extrinsic split of the premium (the part decay can take)
- theta in dollars per session, not a normalised percentage
- `|delta|` as the market's own odds of finishing in the money, *labelled as
  delta*, never as "probability" in the app's own voice
- spread round-trip in dollars per contract
- sessions left

Leave `Setup.confidence` on the type for now — Tracker and the landing page also
render it, and removing the field is a wider change than this audit's scope.
Removing the *meter* is not. Track the field's removal separately.

**Risk** Medium if the field goes; low if only the meter goes. Recommend the
latter first.

**Verification** Grep gate asserting no component renders `score` and
`confidence` in the same panel. Visual snapshot of the Read panel.

---

### P0-3 · Two pricers, two time bases, both on the Weigher screen at once

**Files** `src/core/contractScore.ts:98` — `const T = Math.max(dte, 0.5) / 365`
vs `src/data/compass.ts:179` — `const t = Math.max(0.5, dte) / 252`.

**Reproduction** `/compass?view=weigher`, type `SPY 505C 0DTE`. The headline mid
comes from `weighContract` (365 base). The take-profit targets rendered under it
(`ContractWeigher.tsx:1259-1265`) come from `makeSetup` via
`ContractWeigher.tsx:585`, i.e. the 252 base — a different premium for the same
contract at the same instant.

**Measured** For a 0DTE both floor at half a session but express it differently:
`0.5/252 = 0.001984` years against `0.5/365 = 0.001370` years. That is 45% more
time in one model than the other, so `σ√T` — which is what sets the whole
extrinsic — differs by ~20%.

**Why it matters** The TP targets are quoted as dollar prices of a contract whose
price the panel states differently three inches higher. The user cannot reconcile
them and has no signal that two engines are involved.

**Proposed correction** One time base. `core/calendar.ts:192` `expiryFor(dte)`
walks *calendar* days (`target.setDate(target.getDate() + want)`), so the DTE
flowing through both engines is a calendar count and `/365` is the correct
bridge. `estimatePremium` should divide by 365, with the floor expressed as half
a *session* (`0.5/252` years) so that 0DTE — the overwhelming majority of what
Compass renders — is numerically untouched by the change.

Note this is a **confirmed defect**, so it is inside the brief's carve-out on
touching formulas, and it is documented here separately as required.

**Risk** Medium. `estimatePremium` feeds the cards, the chain and the impact
board. Keeping the floor at `0.5/252` makes 0DTE a no-op; 1DTE presets
(Discounted, Rebounds) reprice.

**Verification** A test asserting the two engines agree within tolerance on a
matched ticker/strike/right/DTE, plus a pinned 0DTE mid proving it did not move.

---

### P0-4 · "Largest Impact Contracts" ranks eight rows that were already chosen by gamma

**Files** `src/data/compass.ts:750-753`, `src/components/compass/ImpactLeaderboard.tsx:81-87`.

```ts
return rows
  .sort((a, b) => b.gamma - a.gamma)   // engine picks the top 8 BY GAMMA
  .slice(0, 8)
```

then the component re-sorts *those eight* by whichever metric the user picks.

**Reproduction** `/compass`, bottom panel, switch *Rank by* between Gamma /
Volume / Notional / Open Int. The eight contracts never change — only their
order does.

**Why it matters** The panel is titled "Largest Impact Contracts" and offers four
definitions of impact. Three of them return the largest-by-gamma contracts in a
different order, which is not what the control claims and not a question anyone
asked. A user comparing Volume rankings across tickers is reading a gamma
selection.

**Two further defects in the same eight rows:**

- `deltaNotional = (oi * 100 * spot * 0.5) / 1e9` applies a flat 0.5 delta to
  every strike and both sides. Since `spot` is constant across rows, Delta
  Notional is a strictly monotone transform of Open Interest — the two columns
  *cannot* rank differently, ever. The header says `DEX`, which claims real delta
  exposure.
- `volume = oi * (0.3 + hash % 50 / 100)` is also derived from OI, so a third
  column is near-collinear with the first two.

Four metrics, effectively one and a half.

**Proposed correction** Move `metric` into `buildImpact` so the ranking runs over
the whole chain before the slice (or return the full set and slice in the
component — the chain is 31 strikes × 2, this is not expensive). Then either
compute a real per-strike delta — `Simulator.getGreeks` is already imported in
this file and returns `deltaCall`/`deltaPut` — or rename the column to what it
is and say so in the `help`.

**Risk** Low for the ranking fix. Computing real delta changes a displayed
number, so it is worth doing in the same pass as P0-3 rather than separately.

**Verification** Test: for `metric='volume'`, `rows[0]` is the maximum-volume
contract in the full chain, not merely in the gamma top eight.

---

### P0-5 · The Weigher prices and sizes a contract it has just said does not exist

**File** `src/components/compass/ContractWeigher.tsx:1347` — the "If you take it"
panel is gated on `weighed && priceable`, which is evaluated **outside**
`gradePanelBody()` and therefore independently of the unknown-ticker branch at
`:1145-1157`.

**Reproduction** `/compass?view=weigher`, type `ZZZZ 505C`.

**Measured** The grade panel renders the empty state **`NO LISTING FOR ZZZZ`**,
and directly beneath it the page renders the **`If you take it`** panel — days to
expiry, cost per contract, contracts in budget, expected fill, spread round-trip,
fill probability, theta drag. Both present in the DOM simultaneously
(`states.json` → weigher → `invalid ticker`: `noListing: true`,
`hasIfYouTake: true`).

**Why it matters** This is the brief's "an unavailable value is silently
replaced" — the page states it has no listing for the symbol and then quotes
sizing economics for it anyway, computed against a fallback. A user who scrolls
past the empty state sees a complete, confident cost breakdown for a ticker that
does not exist.

**Proposed correction** Gate the panel on the same condition the grade panel
uses. Cleanest fix: hoist a single `gradeState` discriminant
(`'expired' | 'unknown-ticker' | 'no-strike' | 'unpriceable' | 'graded'`) derived
once, and have both the grade body and the "If you take it" panel switch on it.
That also removes the current duplicated `parsed.expired` / `parsed.ticker.state`
tests, and `showTrack` at `:1279` already hand-rolls a third copy of the same
predicate — which is why the three drifted.

**Risk** Low. Narrowing a render condition; no data change.

**Verification** Playwright: for `ZZZZ 505C`, assert `If you take it` is absent.
Same assertion for the expired-date and no-strike states, which currently pass by
accident (`weighed` is null there) rather than by rule.

---

### Verified as correct — no change needed

Stated explicitly because the brief asks that no state be claimed without being
exercised. All of the following were driven and asserted:

- **Every `?view=` value resolves correctly.** All six presets land on their own
  tab with the right expiry and count (`top-setups` 0DTE·415, `quick-scalp`
  0DTE·480, `discounted` 1DTE·607, `rebounds` 1DTE·674, `whale-sweeps` 0DTE·452,
  `all` 0DTE·3,492). `?view=weigher` and `?view=lotto` land on their panes with
  the correct breadcrumb and H1.
- **An unreadable `?view=` falls back to Setups / Top Setups** rather than
  throwing — `?view=garbage` renders `Trade Setups`.
- **The legacy `/lotto` redirect works** — resolves to `/compass?view=lotto`,
  breadcrumb `LOTTO`, H1 `Lotto · 0DTE Desk`.
- **The Weigher's unpriceable gate holds.** `SPY 9999C` and `SPY 505C 0DTE` both
  reach `NOT PRICEABLE` with no composite. `SPY 505C 01/01/20` reaches
  `THAT DATE HAS PASSED`. `SPY` alone reaches `ADD A STRIKE`.
- **The horizon sleeves grade differently, as designed** — `7d` → 84, `45d` →
  80, `400d` → 74 on the same strike, i.e. the weight sets at 1/10/90 days are
  genuinely in play.
- **Selecting a strike off the chain re-titles the monitor correctly** —
  `Monitoring KO 67P`.
- **Track / untrack round-trips.**
- **Zero console errors and zero page errors** across the entire 30-state matrix.
- **Back/Forward behaves exactly as `Compass.tsx:106-126` documents**: mode
  switches `replace` rather than push, so Back leaves `/compass` for wherever the
  user came from instead of walking the panes. Measured: Setups → Weigher →
  Lotto, then Back, returns to the pre-Compass entry. This is a deliberate
  trade-off, not a defect — see P2-5 for the one place it surprises.

---

## P1 — Workflow failure

### P1-1 · Returning from review silently resets the board to page 1

**Files** `src/components/compass/SetupScanBoard.tsx:69` (`useState(0)`),
`src/pages/Compass.tsx:663-691`.

**Reproduction** `/compass` → Cards → page forward to 49-72 → open any card's
*Analysis* → press *Scanner* to return. The board is on rows 1-24 and the setup
you were just reviewing is three pages away.

**Cause** In review mode the left column renders `SignalMonitor` *instead of*
`SetupScanBoard` inside an `AnimatePresence mode="wait"`, so the board unmounts
and its internal `page` state is destroyed. Every other piece of browse
state — scanner, layout, ticker filter, selection — is held in `Compass.tsx` and
survives correctly, which makes this the one gap rather than a systemic problem.

**Why it matters** The brief's "the user loses the setup they were reviewing",
exactly. It also silently punishes exploration: the further you browse, the more
you lose by inspecting something.

**Proposed correction** Lift `page` into `Compass.tsx` alongside `scanLayout` and
`tickerFilter`, passing it down as a controlled prop. `resetKey` already exists
to zero it when the scan itself changes, so the reset semantics are preserved.

**Risk** Low. Pure state lift; `resetKey` keeps the existing behaviour on scanner
or filter change.

**Verification** Playwright: page to 3, enter review, return, assert the pager
still reads `49-72 of N`.

---

### P1-2 · Opening a setup retargets the entire terminal, and nothing says so

**File** `src/pages/Compass.tsx:411-427` — `handleReviewSetup` calls
`changeTicker(setup.ticker)`.

**Reproduction** Desk is on SPY. `/compass`, open full analysis on a `BAC` setup.
The top bar now reads BAC $41.23. Press *Scanner*. The desk is still on BAC, and
so is Pulse, Trace, Pinpoint and everything else.

**Why it matters** The switch itself is *correct* and documented — the chain
beside the monitor is built from the active ticker's snapshot, so studying a
setup without switching would put SPY's ladder next to a BAC contract. That was
the right fix. What is missing is that a global, cross-desk state change happens
as an invisible side effect of an in-page click, and it does not unwind. A user
who reviews six setups leaves Compass pointed at whichever they opened last.

**Proposed correction** Do not revert the switch. Make it legible: state the
ticker change on the review header ("Desk switched to BAC to price this chain")
and offer a return-to-previous affordance on the way back, or restore the prior
ticker on `handleBackToBrowse` when the user did not interact with the chain.
Prefer the first — the brief warns against casual behaviour changes.

**Risk** Low if annotation only; medium if the desk restores on exit, because
other desks may already be showing the new name.

**Verification** Playwright: assert the top-bar ticker and the review header
agree, and that the header names the switch.

---

### P1-3 · There is no LIVE marker anywhere; freshness is one muted line

**File** `src/pages/Compass.tsx:595-601`.

**Reproduction** `/compass`. The only freshness signal is
`Showing 240 of 419 scoring 84+ · scan 09:09:02 · 10s`, rendered
`text-label text-textMuted` in a metadata row, right-aligned, competing with the
ticker filter for attention.

**Current state against the brief's three-way vocabulary:**

| | Present? |
| --- | --- |
| `SWEEP · Scanner result from HH:MM:SS` | Partially — the time is there, unlabelled and de-emphasised |
| `HELD · Opened from an earlier sweep` | **Yes**, and well done — `HeldFromSweep` is a warn-toned banner that names the sweep it came from and says the grade is not fresh |
| `LIVE · Latest market tick` | **Absent.** The chain, the monitor mid and the contract track all update on the 1.5s tick with nothing marking them as a different tier from the board |

**Why it matters** The page's central honesty claim is that two clocks run at
once. A user cannot see which numbers belong to which. The chain refreshing under
a board that has not moved for eight seconds reads as inconsistency rather than
as design.

**Proposed correction** A single freshness component in the existing neutral
process language (silver/grey — not bull/bear, per the chrome rule): `LIVE` with
a pulse on the live-tier panels, `SWEEP hh:mm:ss` on the board header, and the
existing `HELD` banner unchanged. Put the sweep stamp on the board's own panel
header rather than in the page metadata row, so it sits on the thing it
describes.

**Risk** Low. New chrome, no data change. Must not introduce a new colour.

**Verification** Playwright: assert a `LIVE` marker on the chain panel and a
`SWEEP` marker carrying a timestamp on the board panel; axe for contrast.

---

### P1-4 · Every scan card is an interactive control containing another one, with an ARIA attribute its role forbids

**File** `src/components/compass/SetupScanCard.tsx:60-73` (via
`components/ui/interactiveRow.ts` → `interactiveRowProps`), and the nested
*Analysis* button at `:133-142`.

**Measured — axe-core 4.x, run against the live page:**

| Rule | Impact | Nodes | Mode |
| --- | --- | --- | --- |
| `aria-allowed-attr` | **critical** | 24 | Setups (cards) |
| `nested-interactive` | **serious** | 24 | Setups (cards) |

Sample node:
`<div tabindex="0" role="button" aria-selected="true" aria-label="Preview PEP 169C, rank …">`

Two distinct defects in one element:

1. **`aria-selected` is not permitted on `role="button"`.** It is valid on
   `option`, `row`, `tab`, `gridcell`, `treeitem` — not `button`. Screen readers
   drop it, so the card's selected state is announced to sighted users only,
   which is also the brief's "no color-only distinction".
2. **The card is `role="button"` and contains a real `<button>`** (*Analysis*).
   Nested interactive controls are unreachable or ambiguous for AT: the inner
   button is inside an element whose role promises it is a leaf.

**Why it matters** These are the only axe violations on the entire desk — Review,
Weigher and Lotto all return **0 violations**, and the open ticker dropdown adds
none of its own. So this single component is 100% of Compass's automated
accessibility debt, and it is on the most-used surface at 24 nodes per page.

The card's own comment (`:63-64`) says `role="button"` was chosen to make the
card a leaf "so the badges inside it are not read out on their own" — a sound
goal that the nested button then contradicts.

**Proposed correction** Model the board as what it is: a single-select listbox.
Container `role="listbox"`, each card `role="option"` with
`aria-selected` — which is *valid* on `option`, fixing defect 1 — and move the
*Analysis* action out of the option, either to the compare pane (which already
has an "Open full analysis" button) or to a per-row control outside the option's
bounds. Keyboard: arrow keys move the active option, Enter selects, a separate
key or the pane's own button opens review.

**Risk** Medium — it changes keyboard semantics on the primary surface and
`interactiveRowProps` is shared, so check every other consumer before changing
the helper rather than the card. Manual keyboard verification is required; axe
passing is necessary, not sufficient.

**Verification** axe returns 0 on Setups; manual tab/arrow/Enter walk from the
tab strip through the board to the compare pane and into review, and back.

---

### P1-5 · The Lotto acceptance wall is unconditional — it blocks the board even when the market is shut

**File** `src/components/compass/LottoBoard.tsx` — the *"I accept a total loss,
show the board"* gate.

**Measured** with the page clock faked to five different market states:

| Market state | Gate shown | Board shown |
| --- | --- | --- |
| pre-market 09:00 ET | yes | no |
| mid-session 13:00 ET | yes | no |
| **MOC window 15:50 ET** | yes | no |
| after close 17:30 ET | yes | no |
| weekend | yes | no |

The gate is shown in every state, including the two where there is nothing to
trade at all, and the board is never reachable without dismissing it. Past the
gate the ladder does render (`hasLadder: true`), so the content is fine — the
wall is the problem.

**Why it matters** The brief's Lotto hierarchy puts *market clock and
eligibility* first and the *contract ladder* fifth. Today an interstitial sits
between them and asks for a risk acknowledgement about a session that has
already closed. A gate that fires unconditionally trains users to dismiss it
without reading, which defeats the only thing it exists for.

Note the clock itself is correct and well built — `computeClock` resolves
ET properly and reported `MOC window open` at 15:50 and `weekend, closed` on a
Saturday. It is the gate that ignores it.

**Proposed correction** Keep the risk language — it is good and it is required —
but make it proportional and stop making it a wall. Show the board with the risk
statement pinned above it as a persistent banner (it already exists as the
`LOTTO RISK` strip). Reserve a blocking acknowledgement for the state where it
means something: the MOC window, when a same-session contract can still be
traded. Outside market hours the board should say the session is closed rather
than ask for consent to see it.

**Risk** Low mechanically. This is a compliance-adjacent surface, so the risk
copy must not be weakened — only relocated from a modal wall to a persistent
banner.

**Verification** Playwright with a faked clock at each of the five states,
asserting board visibility and the presence of the risk copy in every one.

---

### P1-6 · The Lotto rejection state could not be reached, and neither could HELD

Two states the brief requires and I could **not** exercise, so I am not claiming
either works:

- **`NO QUALIFIED CONTRACT`** — never rendered in any of the five clock states
  or past the gate (`noQualified: false` throughout). Either it is unreachable
  with the current auction model, or it needs a market condition I did not
  produce. The brief explicitly asks for at least one explicit rejection state to
  be visible; today I cannot demonstrate one.
- **`HELD from the HH:MM:SS sweep`** — the banner is real, correct and well
  written (`Compass.tsx:95-104`), but opening six different setups in sequence
  never triggered it (`heldSeen: false`). The trigger is a name losing its board
  seat after the click registers it, which needs the sweep to drop it; I could
  not force that within the harness.

**Proposed correction** Both need a deterministic way to be entered for
verification — a test seam or a fixture — before either can be signed off. That
is a prerequisite for the brief's visual-snapshot list, which names both.

---

## P2 — Hierarchy and comprehension

### P2-1 · The score column carries four distinct values across a 240-row board

**Measured** Scraped every score rendered on the default board:
`["97", "96"]`. **Two distinct values across the whole board.** The eight cards
above the fold all read 97.

**Cause** `rankOf` scores on proximity to the money alone, so the head of a
~9,000-contract field is one at-the-money contract per name, and every one of
those lands at 96+. The `±1.5` jitter is the only inter-name separator and it is
deliberately too small to reorder a ladder.

**Why it matters** The board's headline metric discriminates nothing at the only
place a user looks at it. "Ranked by trend and dealer-flow conviction" is the
subtitle; the visible evidence is a column of identical numbers.

**Proposed correction** This is a scoring change and therefore outside the "do
not modify formulas" line unless treated as a confirmed defect — I am filing it
as a **hierarchy** finding rather than a P0 because the ranking is internally
consistent; it is the *display* that has nothing to show. Two options, in
preference order:

1. Give the score a per-name term that is constant across that name's own ladder
   (so it cannot reorder a ladder, preserving `scanRanking.test.ts`'s invariant)
   and derived from facts the `ScanName` already carries — trend conviction,
   IV level, coverage depth. This spreads the ATM contracts of ~194 names across
   a readable range. *(I prototyped exactly this; it is in the stash — see §8.)*
2. If the formula must not move: stop leading with the score. Lead the card with
   what actually differs between rows — the contract, the breakeven move, the
   cost — and demote the score to a right-aligned secondary.

**Risk** Option 1 is a formula change and needs its own documented defect note
plus the existing rank tests re-run. Option 2 is presentational and risk-free.

**Verification** Assert `new Set(board.map(r => r.score)).size > 8` for option 1;
visual snapshot for option 2.

---

### P2-2 · Every card on the board wears the same three chips

**Files** `src/data/compass.ts:131-168` (`WHY_LIBRARY` keys on `ScannerKey`),
rendered `src/components/compass/SetupScanCard.tsx:115-123`.

**Reproduction** `/compass`. All 24 cards on the page carry
`TREND ALIGNED · DEALER SUPPORT · RSI CONFIRM`. Switch preset; all 24 carry the
new preset's three.

**Why it matters** Evidence that is identical across every row is not evidence,
it is a restatement of the tab. On mobile it costs two wrapped rows of height per
card (measured at 390×844) for zero discrimination. `SetupScanBoard.tsx:141-145`
already removed the Evidence column from the table for precisely this reason —
*"all 240 rows carried the identical three badges"* — but the card kept them.

**Proposed correction** Derive the chips from the contract: moneyness
(`ITM 1.2%` / `AT THE MONEY` / `OTM 0.8%`), `Δ 0.42`, whether 1σ clears the
breakeven, book width from the modelled spread. Keep one style tag from
`WHY_LIBRARY` so the preset is still legible. All inputs already exist on the
`Setup`.

**Risk** Low — presentational, derived from fields already computed. The chips
also render on the public landing page (`LiveSections.tsx`), so check that
surface too.

**Verification** Test: two setups on one board with different moneyness produce
different `whyChips`.

---

### P2-3 · Mobile spends the first screen on chrome

**Measured** at 390×844 (`audit/vp/setups_390.png`): breadcrumb → H1 →
subtitle → mode switch → **six scanner tabs wrapped across three rows** → blurb →
showing/scan line → ticker filter. First card data begins at roughly **470px** of
an 844px viewport. Above the fold you get one card, partially.

**Why it matters** The brief's "mobile must preserve mode, ticker, identity,
verdict, freshness, primary reason, primary risk, primary action". It preserves
all of them — and buries them under five stacked control rows.

**Proposed correction** At `<768px` collapse the scanner strip to a single
horizontally-scrollable row (the counts stay, the wrap goes), fold the blurb into
the active tab's title attribute, and merge the showing/scan line into the board
panel's subtitle where it already has a home. Target: first card fully visible
above the fold.

**Risk** Low. Must not hide the sweep timestamp — move it, do not drop it.

**Verification** Playwright at 390×844: assert the first card's bounding box
bottom is `< 844`.

---

### P2-4 · The Weigher leads with the composite alone

**File** `src/components/compass/ContractWeigher.tsx:1207-1243`.

The grade panel opens with a 4xl composite and a verdict badge; the economic
summary the brief asks for — executable mid, spread, breakeven, expected move,
theta burden, liquidity, key risk — is in a *separate panel* ("If you take it")
below the fold, rendered as a **12-cell `Stat` grid**, which is the generic
dashboard pattern the brief rules out.

**Why it matters** The composite is the conclusion. The economics are the reason.
The page presents the conclusion first and at 4xl, then the arithmetic, then the
economics last and flattest — the inverse of the brief's Weigher hierarchy
(identity → verdict *and priceability* → economic summary → factor arithmetic).

**Proposed correction** Promote a compact economic summary to sit directly beside
the composite: mid with bid/ask, spread %, breakeven and the move it needs, 1σ,
theta/day, liquidity. Demote "If you take it" to sizing and fills only. Replace
the 12-cell `Stat` grid with a two-column definition list; the grid gives twelve
unrelated numbers identical visual weight.

**Risk** Low, presentational. Do not change any of the values.

**Verification** Visual snapshot desktop + mobile; assert breakeven and spread
are above the fold at 1280×800.

---

### P2-5 · Back from Lotto leaves Compass entirely, by design

**File** `src/pages/Compass.tsx:163-167` — `writeView` uses
`setParams(next, { replace: true })`.

**Measured** Setups → Weigher → Lotto produces **zero** history entries. Back
from Lotto returns to the page the user was on before Compass.

The trade-off is documented at `:106-126` and the reasoning is sound: pushing an
entry per tab click would stack six of them between a user and the page they came
from. I agree with the decision and am **not** proposing it be reversed — the
brief warns against changing URL behaviour casually, and this is a considered
choice, not an oversight.

The residual surprise is narrow: `?view=` *looks* like navigation because it is
in the URL and it is shareable, so Back not undoing it is inconsistent with what
the address bar implies. The cheap mitigation is not a routing change but a
wayfinding one — the mode switch is already a `SegmentedControl`, which reads as
a filter rather than a link, and keeping it visually in the "control" family
(never a tab-strip or breadcrumb idiom) is what keeps the expectation correct.

**Proposed correction** None to the routing. Flagged so the decision is
re-affirmed rather than rediscovered.

**Risk** n/a.

**Verification** The existing measurement, kept as a regression test so a future
change to `replace: true` is caught deliberately.

---

## P3 — Polish

| # | File | Defect | Measured |
| --- | --- | --- | --- |
| P3-1 | `ContractWeigher.tsx` "If you take it" `Stat` | `$10.33` truncated by its container | 7px clipped at **every** viewport 390→1600 |
| P3-2 | `SetupCompare.tsx:168` `Stat sub` | `+38% · Expires this session` truncated | 7px clipped at 390×844 |
| P3-3 | `ContractWeigher.tsx:1411` | `Contracts in budget` label truncated | 2px clipped at 390×844 |
| P3-4 | `ContractChain.tsx:51` chain cells | Interactive cells are 104×30 — under the 32px floor and well under the 44px touch target | measured at 1024–1440 |
| P3-5 | `ContractWeigher.tsx:264-265` | Comment claims `ContractChain` "is currently rendering at zero height in Compass review mode at xl". It was fixed in `Compass.tsx:655-659` (`items-start`); the comment is stale and will mislead the next reader | verified rendering correctly at 1600×1000 |

**No horizontal overflow at any of the seven viewports** — `scrollWidth ===
clientWidth` on all 28 viewport×state combinations. That is worth stating
plainly; the responsive foundation is sound and these are trims, not rework.

---

## 7. Measurements

### Coverage actually exercised

30 states driven end to end: 12 navigation cases, 12 Weigher queries, 5 Lotto
market clocks (faked via `page.clock.install`) plus the past-the-gate state,
setups browse/table/cards/filter/review/chain-select/track, axe across 5 modes,
and performance capture on 3. Plus 28 viewport×state combinations
(7 viewports × 4 states) measured for overflow, clipping and target size.

### Performance

Captured with `PerformanceObserver` over a 9-second window per page, which spans
a full 10s sweep boundary and six 1.5s price ticks.

| Page | CLS | Long tasks (ms) | Total blocking | DOM nodes |
| --- | --- | --- | --- | --- |
| Setups | **0.0148** | 420, 120 | 540ms | 1,471 |
| Weigher | **0.0016** | 342, 176 | 518ms | **153** |
| Lotto | **0.0239** | 331, 178, 73 | 582ms | 330 |

Reading:

- **CLS is excellent everywhere** — all three are an order of magnitude inside
  the 0.1 "good" threshold, and the worst (Lotto, 0.024) is still fine. The
  two-tier cadence is doing its job: the board does not vibrate on price ticks.
  Whatever else changes, do not regress this.
- **The 420ms long task on Setups is the sweep**, and it is the one real
  performance finding. It blocks the main thread on load and again every 10s.
  Six scanner builds run per sweep (the active pane plus five tab counts), each
  over ~9,000 candidates — that is the documented design, and the getter-based
  laziness already stops five of them materialising setups. The remaining cost is
  the prescreen itself. Worth measuring against a `requestIdleCallback` or a
  chunked scheduler before optimising, not before measuring.
- **Weigher's 153 DOM nodes** is the empty-state finding as a number: the page is
  a search box in a void. Setups renders 10× the content.
- **LCP was not captured** on any of the three — the entry list came back empty.
  I am reporting that rather than substituting a proxy. Getting it needs either a
  DevTools trace or an in-page LCP polyfill; say if you want it and I will add
  the observer properly.

### Accessibility (axe-core, live page)

| Mode | Violations |
| --- | --- |
| Setups | 2 — `aria-allowed-attr` (critical, ×24), `nested-interactive` (serious, ×24) |
| Review | **0** |
| Weigher | **0** |
| Lotto | **0** |
| Ticker dropdown open | 2 — the same two, from the board behind it |

All of it is P1-4. Three of the five modes are clean.

**Automated ≠ verified.** I have not yet completed a manual keyboard walk of the
full workflow, so tab order, focus visibility through the review transition,
dropdown dismissal and focus restoration are **unverified**. That is the next
thing I would do before touching the card's semantics.

### Responsive

- **Zero horizontal overflow** at all 28 viewport×state combinations.
- Clipped text: 4 sites, all P3-1 to P3-3.
- Sub-32px interactive targets: 52 on Setups, 34 on Weigher, 26 on Review, 9 on
  Lotto — dominated by the chain cells (104×30) and the dense table controls.
  None is below 24px. The 44px touch guidance is not met on the chain at any
  breakpoint, including mobile.

### Not verified — explicitly

- Deep links from Tracker / Earnings / Stocks / News (router-state paths; the
  harness drives URLs, not cross-page navigation).
- `HELD from sweep` and `NO QUALIFIED CONTRACT` — see P1-6.
- Manual keyboard traversal and screen-reader announcement behaviour.
- LCP.
- Reduced-motion rendering.

---

## 8. Disclosure: work in progress, stashed

Before this audit was commissioned I had begun implementing the earlier
request — 0DTE / Weekly / Swing / LEAPS / Structures as the primary tab axis,
with the six scanners demoted to a style row. The engine half was complete and
green (16 new tests passing).

That work is **stashed, not applied**: `git stash list` →
`compass sleeve axis WIP (0DTE/weekly/swing/leaps/structures) - pre-audit`. The
tree audited here is clean at `4741b23`.

It is relevant to this audit in three places, and I am flagging the overlap
rather than quietly re-landing it:

- it fixes **P0-1** (the chain takes the sleeve's DTE) and **P0-3** (one `/365`
  time base with the session floor)
- it implements **P2-1 option 1** (the per-name score term) and **P2-2** (derived
  chips)
- it changes the URL vocabulary (`?view=` would need to carry two axes), which
  the brief warns against doing casually

Recommend deciding on it explicitly once the audit is reviewed, rather than
treating it as already-agreed.

---

## 9. Proposed sequencing

**Wave 1 — correctness, no formula changes.** P0-1 (chain DTE), P0-4 (impact
ranking), P0-5 (Weigher render gate). All three are contained, all three are
"the screen states two contradictory things", and none touches a number's
definition. Highest honesty-per-risk on the page.

**Wave 2 — the one formula defect.** P0-3, the 252/365 split. Documented as a
confirmed defect per the brief's carve-out, with 0DTE pinned as a no-op by
construction so the blast radius is the two 1DTE presets.

**Wave 3 — the fake second opinion.** P0-2, remove the Confidence meter and put
real contract facts in its place. This is the largest single improvement to
"can a user explain this verdict".

**Wave 4 — workflow.** P1-1 (page state lift), P1-3 (LIVE/SWEEP/HELD
vocabulary), P1-2 (name the ticker switch).

**Wave 5 — accessibility.** P1-4, the listbox/option rework. Needs the manual
keyboard walk first, and I would not batch it with anything else.

**Wave 6 — Lotto.** P1-5 (proportional gate) and P1-6 (make the rejection state
reachable, then verify it).

**Wave 7 — hierarchy and polish.** P2-1 through P2-4, then the P3 trims.

**Separately — §8.** Decide whether the stashed sleeve work rejoins. It resolves
P0-1, P0-3, P2-1 and P2-2 as a side effect of a larger change, which is either
efficient or a scope problem depending on your appetite. Worth an explicit call
rather than folding it in quietly.

---

Nothing above is implemented. The tree is clean at `4741b23`.

Two questions I need answered before the first line of code:

1. **Which waves, in what order** — and specifically whether P0-3 (a formula
   change, however well-justified) is in scope at all.
2. **The stashed sleeve work** — rejoin, park, or drop. It overlaps four findings
   and changes the URL vocabulary, so it should not be decided by default.

---

# 10. Resolution — what shipped, and what it measured after

Written after the fact, against the same harness that produced §7. Every number
below was re-measured on the built app, not inferred from the diff. The findings
above are left as written; this section says what happened to each.

The two questions at the end of §9 were answered by the client as *"do what you
must"*: all seven waves are in, and the stashed sleeve work rejoined rather than
being dropped.

## Findings

| # | Status | Measured after |
| --- | --- | --- |
| P0-1 | Fixed | Sleeve axis landed; the horizon is the tab row and the five scanners are a style row beneath it |
| P0-2 | Fixed | Confidence meter replaced by `contractFacts` — cost, breakeven, time value, decay, delta, spread, each with a sentence |
| P0-3 | Fixed | One time bridge in `core/optionTime.ts`; the two pricers no longer disagree by 45% on 0DTE |
| P1-1 | Fixed | Paging survives a return from review — reset moved to the three sites where a scan actually changes |
| P1-2 | Fixed | The ticker switch names what it does |
| P1-3 | Fixed | LIVE / SWEEP / HELD, and `HELD from the 14:31:48 sweep` observed rendering in review mode |
| P1-4 | Fixed | 189 axe violations across four desks → **0**. See below |
| P1-5 | Fixed | Gate fires in 1 of 5 market states, not 5 of 5. See below |
| P1-6 | Fixed | `NO CLEAN AUCTION EDGE` reachable in two clicks; `HELD from sweep` observed |
| P2-1 | Fixed | Score column carried 2 distinct values across 240 rows; a per-name edge term takes it to 22 |
| P2-2 | Fixed | Chips derive per contract now (`ITM x%`, `1σ CLEARS BREAKEVEN`, `TIGHT BOOK`, `BLOCK STRIKE`, `ALL TIME VALUE`) instead of three per preset |
| P2-3 | Fixed | First card at 390×844 moved from 555px to **453px** |
| P2-4 | Fixed | The 12-cell `Stat` grid is three named readouts; the Weigher lands on a real contract |
| P2-5 | Not changed | Agreed with the original decision; `replace: true` stands |
| P3-1 | Fixed | Gone with the `Stat` grid it lived in |
| P3-2 | Fixed | Gauge track narrows below `sm`; 0px clipped at 390 |
| P3-3 | Fixed | Gone with the `Stat` grid it lived in |
| P3-4 | Fixed | Chain cells `min-h-11` — 44px, up from 30px |
| P3-5 | Fixed | Stale comment rewritten to describe the two components truthfully |

One clipped string is left, deliberately: the scan board's own **"Top Setups"**
panel title, 15px at 390 against the sweep badge and the layout switch beside
it. The same label is fully legible in the active style pill 40px above it, and
the alternatives are hiding the freshness signal or changing `Panel`'s fixed
header height for every panel in the app. Not worth either.

## P1-4 · accessibility, before and after

The cause was one shared helper. `interactiveRowProps` set `role="button"` and
`aria-selected`, and because it came from one place it was wrong 189 times.

`aria-selected` is not allowed on a button — it belongs to a listbox option, a
tab, or a row inside a grid. Selection travels as `aria-current` now, which is a
global attribute, valid on every role involved.

`role="button"` on a `<tr>` is worse than invalid. A row claiming to be a button
is no longer a row, so its table loses it and the numbers inside lose the
columns that name them — and it makes the row's children presentational, which
is why the 46 rows carrying their own buttons reported `nested-interactive`.
Rows keep their own role; the helper takes a third argument naming what the
element already is.

Compass's card boards are `listitem`s in a `list`. A card carries its own
Analysis button, and `listitem` is the one role here whose children stay
exposed. Four shapes were probed against axe before choosing:

| Shape | Result |
| --- | --- |
| `listbox` → `presentation` → `option` + sibling button | `aria-required-children` |
| `listbox` → `option` containing a button | `nested-interactive` |
| `grid` → `row` → `gridcell` + button | clean |
| plain `<tr>`, no role override, `aria-current` | clean |

| Route | Before | After |
| --- | --- | --- |
| `/compass` | 24 critical + 24 serious + 1 contrast | clean |
| `/trace/live-tape` | 22 critical + 22 serious | clean |
| `/pinpoint/levels` | 63 critical + 1 minor | clean |
| `/pulse` | 34 critical + 1 serious | clean |
| `/` (landing) | 57 `region` + 1 `landmark-unique` | clean |

Also swept: the landing page had no `<main>` at all; six scroll containers
declared `role="region"`, which is a landmark, so a panel that scrolls was
announcing itself as a section of the page; two watchlist columns had an empty
`<th>`; the flow-alerts feed scrolled with no tab stop. Every route scanned now
reports clean — landing, terminal, Compass across all five sleeves and all three
modes, Pulse, Stocks, News, Earnings, Tracker, Community, five Pinpoint desks,
four Trace desks, Guide and the legal pages.

## P1-5 · the Lotto gate, before and after

| Market state | Gate before | Board before | Gate after | Board after |
| --- | --- | --- | --- | --- |
| pre-market 09:00 ET | yes | no | no | yes, 9 rows |
| mid-session 13:00 ET | yes | no | no | yes, 9 rows |
| MOC window 15:50 ET | yes | no | **yes** | withheld |
| after close 17:30 ET | yes | no | no | yes, 9 rows |
| weekend | yes | no | no | yes, 5 rows |

The risk paragraph is not conditional and never was — it stays pinned above the
board in every state, unchanged. Ten tests in `mocClock.test.ts` pin the rule,
including a five-minute walk of the session returning exactly
`['15:45', '15:50', '15:55']`. Five-minute steps rather than thirty because a
coarser walk steps over the window, and an empty result would then look
identical to a gate that never fires at all.

## Two defects the audit did not find

Both surfaced from *rendering* a panel rather than reading it, which is the
same lesson §7 already carries.

**The compare pane had no spot, so it fetched one.** Naming the underlying's
price beside the invalidation level produced *"breaks above $445.81, 1.9% below
the $454.50 spot"* — a sentence that contradicts itself in eleven words. The
obvious correction was worse than the bug: `scanNameFor` is described in its own
file as the single derivation, but `Simulator.getCandles` calls `ensureTicker`,
so the first component to ask about a name **materialises** it, and `scanNameFor`
then returns the simulator's price instead of the synthetic walk it returned a
moment earlier. Measured on REGN inside one sweep: 1073.50, then 1041.52.
Reading the price changed the price. The spot travels with the setup now
(`SetupGroup.spot`, the same value `makeSetup` was handed), and two tests in
`compassCoherence` pin it across every sleeve.

**The full chain opened at the wrong end.** Making the chain list every strike —
the original ask — meant it opened on 31 rows of deep in-the-money calls, and
`xl:max-h-none` laid them out as one 2,141px column with no viewport to centre
in. Capped at every width and centred on `atmIndex`: 620px viewport, scrollTop
841, spot rule 187px inside the frame.

## Gate at the time of writing

876 tests, typecheck clean, `eslint .` exit 0 (checked for a real exit code —
piping it to `tail` always exits 0 and masked three real errors earlier in this
work), production build green, no horizontal overflow at 390, 768, 1280 or 1600
on any Compass mode.
