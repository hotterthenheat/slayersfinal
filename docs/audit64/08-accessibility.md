# 08 — Accessibility (Gates 35, 36, 37, 42)

Keyboard · screen-reader semantics · reduced motion · overlays.

**Method.** Production build served at `http://127.0.0.1:8123` (not rebuilt, not restarted).
Playwright + Chromium 1194, axe-core 4.12.1. Every number below was measured in the running app;
scratch drivers live in
`/tmp/claude-0/-home-user-slayersfinal/61510a72-f878-56b9-9620-dab6cb6adbf2/scratchpad/`
(`axe-run.mjs`, `landmarks.mjs`, `kb-drawer.mjs`, `kb-stocks.mjs`, `compass-kbonly.mjs`,
`compass-back.mjs`, `reduced-motion.mjs`, `rm-livetape.mjs`, `live-regions.mjs`,
`sr-semantics.mjs`, `focus-ring.mjs`, `scrollreg.mjs`, `prove-scrollintoview.mjs`).
Screenshots in `docs/audit64/shots/a11y-*.png`.

---

## Headline

The **automated** layer is genuinely clean, and that is a real result, not a skipped check:
axe-core ran its full default ruleset (105 rules enabled, 42–44 rule-groups passing per route) across
26 routes × 2 viewports and returned **0 violations at 1440×900 and 2 at 390×844**. Heading order has
no skips and no missing `h1` on any of the 26 routes. Nothing announces on a market tick. Reduced
motion actually stops motion. A focus-trap hook exists and four overlays use it correctly.

The defects are all in the **manual** layer, and they cluster into one theme: **focus is managed at the
component level but not at the view level.** Where a component owns an overlay it behaves; where a
*view swaps in place* — Compass analysis, the Trace drilldown drawer, a sub-nav mount — focus is
dropped, misdirected, or silently relocated. The single worst instance is `DrilldownDrawer`, which
declares `aria-modal="true"` while leaving focus outside itself: the one combination that is worse
than having no dialog semantics at all.

---

## Gate 35 — Keyboard

### Three required workflows, keyboard only

#### WF1 — Compass: pick a setup → open analysis → back — **FAILS at "back"**

Exact sequence used (`compass-kbonly.mjs`, no mouse at any point):

| Keys | Result |
|---|---|
| `Tab` ×35 | lands on `BUTTON "Open full analysis for ADBE 536P"`, focus ring visible |
| `Enter` | analysis view swaps in — `h2` set changes `["Top Setups","ADBE 536P","Largest Impact Contracts"]` → `["The Setup","Read","Contract Chain","Largest Impact Contracts"]` |
| — | **focus is dumped to `document.body`** |
| `Escape` | **no-op** — `h2`s unchanged, still `["The Setup","Read",…]` |
| `Tab` ×99 | finally reaches `BUTTON "Setups"` (the back control) |

The back control is focusable **#10 of 105** in DOM order, but forward-`Tab` costs **99 presses**
because focus was released next to the removed trigger deep in the list. `Shift+Tab` ×12 also reaches
it — so the workflow is *recoverable*, not *impossible*, and I am rating it P1 rather than P0 on that
basis. Picking the setup itself is fine: I initially recorded `Enter`/`Space` as dead on the
`div[role="button"]` preview cards, but that measurement was **invalid** — I had targeted the card
that was already `aria-current="true"`. Retested against the rank-2 card, `Enter`, `Space` and click
all select it identically. **Not a finding.**

#### WF2 — Trace live-tape: focus row → open drawer → Escape — **FAILS on every focus criterion**

| Keys | Result |
|---|---|
| `Tab` ×17 | lands on first tape `TR`, ring visible (6.13:1, see below) |
| `Enter` | drawer opens — `role="dialog"`, `aria-modal="true"`, `aria-label="SPY 502P print detail"`, 6 focusables |
| — | **focus stays on the row; never enters the dialog** |
| `Tab` ×8 | **8 of 8 stops land outside the dialog** — focus walks the tape *behind* the backdrop |
| `Escape` | closes ✓ — but **focus does not return to the trigger row** (it is left wherever tabbing stranded it) |

#### WF3 — Stocks: open detail drawer → Escape — **PASSES**

| Keys | Result |
|---|---|
| `Tab` ×53 | reaches a stock `TR` (`"T AT&T Communication $21.70 +0.47%…"`) |
| `Enter` | drawer opens, **initial focus moves to `BUTTON "Close detail"`** inside it |
| `Tab` ×12 | **0 of 12 escaped** — trap holds and wraps |
| `Shift+Tab` ×3 | wraps correctly in reverse |
| `Escape` | closes ✓ and **focus returns to the trigger row** ✓ |

This is the important comparison: the correct pattern already exists in the codebase
(`src/hooks/useFocusTrap.ts`). WF2 fails only because `DrilldownDrawer` does not call it.

### Focus visibility — **PASSES, measured**

Every one of the ~200 tab stops I recorded across `/compass`, `/trace/live-tape` and `/stocks`
carried a focus indicator. Composited and measured (`focus-ring.mjs`):

- ring colour `rgba(228, 232, 244, 0.6)` (`select` / silver — correct per the house palette: selection state, not green)
- over surface `rgb(10,10,10)` → composited `rgb(141,143,150)` → **6.13:1**
- over surface `rgb(12,12,12)` → composited `rgb(142,144,151)` → **6.14:1**

Both far exceed the 3:1 required by WCAG 1.4.11. (The `1.00:1` lines my script printed are the
transparent placeholder layers of Tailwind's three-layer ring stack, not rendered ink — not a finding.)

---

## Gate 36 — Screen-reader semantics

### Heading order — **PASSES on all 26 routes**

No skipped levels, no missing `h1`, no route with multiple `h1`. Sequences are `h1 → h2*` almost
everywhere; `/tracker` and `/` correctly nest `h3` under `h2`. `/pulse` uses an `sr-only` `h1`
("Pulse workspace: Slayer Classic") — legitimate.

The one structural issue: on `/trace/*` the `h1` is `"Trace"` and on `/pinpoint/*` it is `"Pinpoint"` —
the *layout* name, not the desk. All 5 Trace routes share one `h1`; all 5 Pinpoint routes share
another. The actual desk is only ever an `h2`.

### Landmarks — `main`/`nav`/`banner` present everywhere; `contentinfo` missing on every in-app route

I first measured this with a naive `header`/`footer` selector and got "banner ×9 unnamed" on
`/prove-it` and similar on 15 other routes. **That was wrong** — a `<header>` scoped inside
`section`/`article` is generic, not `banner`. Recomputing real ARIA roles (`landmarks.mjs`) shows
banner/navigation are clean and correctly singular, and all `nav`s beyond the first are named
("Trace subpages", "Pinpoint subpages", "Guide subpages", "Community subpages", "Contents"). Good.

What the correct computation *did* surface: `<footer>` is rendered **inside** `<main>`
(`AppShell.tsx:103` opens `<main>`, `:128` renders `<SiteFooter>` within it), so it maps to generic.
`/` is the only route in the app with a `contentinfo` landmark.

### Live regions — **PASSES; nothing announces on tick**

9 `aria-live` attributes exist in source. Instrumented every live region with a `MutationObserver`
over a 10-second window on 8 routes including `/pulse` and `/trace/live-tape` while the tape was
streaming (`live-regions.mjs`):

**0 mutations, 0.00/s, on every region, on every route.** The toast container
(`Toast.tsx:110`) is the only live region on most desks and stays empty. The streaming tape does
**not** sit inside a live region. This is the correct design for a firehose and it was worth
verifying rather than assuming.

### `<tr tabindex="0">` with no activatable role — the tape's primary affordance

Computed via axe-core's own name/role engine (`sr-semantics.mjs`).

---

## Gate 37 — Reduced motion — **PASSES, measured**

`App.tsx:85` sets `<MotionConfig reducedMotion="user">`; `index.css:116` and `:415` kill the house and
Tailwind keyframes. I did not take that on trust — I sampled every visible element's box, opacity and
transform over a 2-second window, twice, with and without the preference (`reduced-motion.mjs`):

| Route | moved | faded | transform changed | `document.getAnimations()` still running |
|---|---|---|---|---|
| `/pulse` baseline | 0 | 1 | 0 | `holo-pan`, `cursor-blink` |
| `/pulse` **reduce** | 0 | **0** | 0 | **none** |
| `/compass` baseline | 0 | 5 | 5 | 19× `pulse-animation`, `holo-pan`, `tick-up` |
| `/compass` **reduce** | 0 | **0** | **0** | **none** |
| `/prove-it` baseline | 0 | 0 | 0 | `holo-pan`, `cursor-blink`, `tick-up` |
| `/prove-it` **reduce** | 0 | **0** | 0 | **none** |
| `/trace/live-tape` baseline | 384 | 0 | 10 | `holo-pan`, `cursor-blink` |
| `/trace/live-tape` **reduce** | 355 | 0 | 10 | **none** |

Live-tape still shows 355 "moved" elements under `reduce`. My index-based diff cannot tell "element
moved" from "list grew", so I disambiguated with the app's own Pause control (`rm-livetape.mjs`):

- streaming + reduce: a row tracked *by identity* moved `y 654 → 884` (+230px) as new prints prepended
- **paused + reduce: rows 23 → 23, elements that moved in 2s = 0**

So the residual movement is the data arriving, not decoration. **State changes survive, camera moves
stop** — exactly the required behaviour. `LiveTape.tsx:821` also swaps `behavior: 'smooth'` for
`'auto'` under the preference, so the tape's auto-scroll doesn't glide. Warning/degraded affordances
remain painted under `reduce` (20 amber-class nodes still present).

---

## Gate 42 — Overlays

Four overlays use `useFocusTrap` and **all four behave** (`overlays.mjs`):

| Overlay | Opened by | `aria-modal` | Initial focus | Tab leak | Escape | Focus restored |
|---|---|---|---|---|---|---|
| Command palette | `Ctrl+K` | ✓ | search `INPUT` ✓ | **0/10** | ✓ | ✓ |
| Shortcuts | `?` | ✓ | `Close` ✓ | **0/10** | ✓ | ✓ |
| Settings | click | ✓ | `Close settings` ✓ | **0/10** | ✓ | not conclusively measured¹ |
| Onboarding | fresh `localStorage` | ✓ | `Start exploring` ✓ | **0/6** | — | — |

¹ I opened Settings by mouse, so `previouslyFocused` was the Settings button rather than my tagged
element; the `false` my harness printed is a test artifact, not a defect. Stated rather than glossed.

`StockDetailDrawer` (`:208`) also traps and restores correctly — verified in WF3 above.
The one overlay that does not use the hook is `DrilldownDrawer`. No overlay uses `inert` on the
background; with `aria-modal="true"` plus a working trap that is acceptable — which is precisely why
the trap being absent in `DrilldownDrawer` matters so much.

---

## Findings

### P0-1 — `DrilldownDrawer` claims `aria-modal="true"` but leaves focus outside itself

`src/components/flowdesk/DrilldownDrawer.tsx:72-73`

```
role="dialog"
aria-modal="true"
```

The component's `useEffect` (`:51-58`) handles **only** `Escape`. It never imports `useFocusTrap`,
never moves focus in, never restores focus out.

Measured (`kb-drawer.mjs`, `/trace/live-tape`, 1440×900, `Tab`×17 → `Enter`):
- focus after open: still the trigger `TR`, `inDialog: false`
- `Tab`×8 → **8/8 stops outside the dialog**, walking the tape behind the backdrop
- `Escape` closes, focus **not** returned to trigger

Why this is P0 and not P1: `aria-modal="true"` instructs assistive tech to hide everything *outside*
the dialog. Focus is outside the dialog. A screen-reader user therefore tabs through elements their
SR has been told to suppress — they land in silence, and the drawer content they opened is never
reached. Having no dialog semantics at all would be strictly better. This shell is shared by every
Trace drilldown (tape print detail, scanner contract, …), so it is the drill-down path for 4 desks.

**Fix:** attach the existing hook — `const trapRef = useFocusTrap<HTMLElement>(open)` on the
`motion.aside`, plus `tabIndex={-1}`. Same three lines `StockDetailDrawer.tsx:208` already uses.
No new dependency.

### P1-1 — Compass analysis view drops focus to `<body>`; Escape is a no-op; back is 99 tabs away

`/compass`, 1440×900. Evidence in WF1 table above. Three compounding faults:
1. opening the analysis view releases focus to `document.body`
2. `Escape` does not return to the setup list (the view is an in-place swap, not a dialog)
3. the `Setups` back control is focusable #10/105 but **99 forward tabs** from where focus lands

The URL stays `/compass` and `document.title` never changes, so there is no route-change signal
either — a screen-reader user gets no indication the view changed at all.

**Fix:** on view swap, move focus to the new view's `h2` ("The Setup") with `tabIndex={-1}`, and bind
`Escape` to the same handler as the `Setups` button.

### P1-2 — `SubNav`'s `scrollIntoView` silently relocates the tab origin, stranding the skip link on 21 routes

`src/components/ui/SubNav.tsx:127-129`

```js
useEffect(() => {
  const active = navRef.current?.querySelector('[aria-current="page"]');
  active?.scrollIntoView({ inline: 'center', block: 'nearest' });
}, [pathname]);
```

`scrollIntoView()` moves Chromium's *sequential focus navigation starting point*. I proved the
causation rather than inferring it (`prove-scrollintoview.mjs`):

- control, `/compass` (no `SubNav`): first `Tab` → `"Skip to content"` ✓
- same page, after calling `scrollIntoView()` on the "Top Setups" button: first `Tab` → `"Quick Scalp"` — the element *after* the target
- `/trace/live-tape`, subnav DOM order `Tape <ACTIVE> | Dark Pool | Scanner | Reconstruction`: first `Tab` → `"Dark Pool"` — exact match

Result on first `Tab` from a clean load:

| Route | Tab #1 lands on |
|---|---|
| `/compass`, `/stocks`, `/pulse`, `/tracker`, `/legal/terms` | `Skip to content` ✓ |
| `/trace/live-tape` | `Dark Pool` |
| `/trace/scanner` | `Reconstruction` |
| `/pinpoint/gamma` | `Levels` |
| `/guide/overview` | `The desks` |
| `/community/ideas` | `Roadmap` |

The skip link and the **entire 18-stop top nav** are bypassed on every route rendered by a `SubNav`
layout — **21 routes** (`flowdesk/subnav.ts` 5 + `gex/subnav.ts` 6 + `guide/subnav.ts` 6 +
`community/subnav.ts` 4). `Shift+Tab` does reach them backwards, so it is a severe degradation rather
than a lockout.

**Fix:** guard the call so it only runs when the rail actually overflows, and use
`scrollLeft`/`scrollTo` (which does not touch the focus origin) instead of `scrollIntoView`.

### P1-3 — Horizontally scrollable data tables are unreachable by keyboard at 390px

Both axe violations found across 52 route×viewport runs are this rule, `impact: serious`.

| Route @390 | axe target | scrollWidth | clientWidth | **hidden** | `tabindex` | focusables inside |
|---|---|---|---|---|---|---|
| `/pinpoint/greeks` | `.min-h-0.flex-grow > .overflow-x-auto` | 640 | 346 | **294px (46%)** | none | **0** |
| `/` | `.overflow-x-auto` | 640 | 340 | **300px (47%)** | none | **0** |

On `/pinpoint/greeks` the clipped element is the Greek exposure matrix
(`Strike Dist Gamma Delta Vanna Charm`) — a keyboard or switch user cannot scroll it and cannot
reach Vanna or Charm at all. Screenshot: `shots/a11y-mobile-greeks-scroll.png`.

**Fix:** `tabIndex={0}` + an accessible name on the scroll container (axe's stated remedy), or make
the columns reflow.

### P1-4 — Tape rows are announced as plain rows, named by a 30-token blob that opens with another control's label

`src/pages/flowdesk/LiveTape.tsx:1069` → `src/components/ui/interactiveRow.ts:63`

```js
role: role === 'native' ? undefined : role,
```

LiveTape passes `'native'`, so the `<tr>` gets `tabIndex: 0` and an `onKeyDown` but **no role**.
Computed with axe-core's own engine:

```
row_role:            "row"
row_accessibleName:  "Track print6:02:27 PM SPY 505C 10/14 · 72d +0.2% $503.87 $12.45
                      11.7712.25 123 $153.1K BUY+67 ASK 58% BULLISH 9,968 25,359 — 0.39x 13.1% —"
```

A screen-reader user tabbing the tape hears ~30 unlabelled tokens per row, prefixed by
**"Track print"** — the name of a *different, nested* control — and gets no indication the row is
activatable, because its role is `row`, not `button`. This is the primary drill-down affordance on
the desk.

**Fix:** give the `<tr>` `role="button"` (the helper already supports it — LiveTape is the only
caller passing `'native'`) and an explicit `aria-label` summarising the print, e.g.
`"SPY 502P, 0 DTE, $153.1K premium, bought at ask — open detail"`.

### P2-1 — No `contentinfo` landmark on any in-app route

`AppShell.tsx:103` opens `<main id="main-content">`; `:128` renders `<SiteFooter>` inside it, and
`SiteFooter.tsx:144/166` emits `<footer>`. A `<footer>` descended from `<main>` maps to **generic**.
Measured across 15 routes: `contentinfo` present on `/` only, absent on all 14 others.
Secondary effect: "Skip to content" targets a region that includes the footer.

**Fix:** move `<SiteFooter>` out of `<main>`, as a sibling.

### P2-2 — `document.title` is identical on all 65 routes; SPA navigation is never announced

`index.html:6` sets `"Slayer Terminal — Institutional Options GEX Analytics"` and the only
`document.title` write in `src/` is `pages/pulse/popoutWindow.ts:25`, which titles a *popped-out
window*. Measured: byte-identical title on all 26 audited routes. Combined with P2-3, a screen-reader
user moving `/pinpoint/gamma → /pinpoint/levels` gets no title change, no `h1` change, and no live
region — nothing announces that the desk changed.

**Fix:** set `document.title` per route on navigation.

### P2-3 — `h1` names the layout, not the desk, on 10 routes

`/trace/live-tape`, `/trace/scanner`, `/trace/reconstruction`, `/trace/dark-pool` all report
`h1: "Trace"`; `/pinpoint/{gamma,levels,greeks,stress,history}` all report `h1: "Pinpoint"`. The desk
identity ("Options Tape", "Gamma Heatmap") is demoted to `h2`. Heading-navigation users cannot tell
these routes apart by `h1`.

### P2-4 — Long tabbable tables with no bypass

- `/stocks`: **455 focusables, 192 tabbable `<tr>`**; 53 tabs to reach the first data row
- `/trace/live-tape`: 23 rows, each contributing **2 stops** (row + nested "Track print"), 46 stops with no way past the table

Neither table offers a skip-past-this-region link. Verified separately that this is *not* compounded
by instability: with a row focused, 6 seconds of streaming left focus on the same row
(`watchStillInDom: true`, `isWatch: true`) while the tape prepended new prints. **Focus is stable
under streaming** — good, and worth stating.

### P3-1 — 22 `<th>` in the tape header, 0 with `scope`

`thCount: 22, thWithScope: 0`; no `<caption>`, no `aria-label` on the `<table>`. Browsers infer
column scope for a single header row so this is minor, and axe did not flag it — recording it for
completeness, not as an action item on its own.

### P3-2 — Focus ring is 1px

`box-shadow: … 0 0 0 1px inset`. Contrast is excellent (6.13:1) and WCAG 2.4.7 is satisfied. 2px
would meet the stricter 2.4.13 Focus Appearance bar. Polish only.

### P3-3 — Pause/Resume toggle has no `aria-pressed`

`/trace/live-tape`: label changes `"Pause"` → `"Resume"` on click, `aria-pressed` is `null` both
times. A changing label is a legitimate pattern, so this is defensible as-is; noted for consistency
with the other toggles in the app.

---

## Verified good (checked, not assumed)

- **axe-core, 26 routes × 2 viewports** — 0 violations @1440×900, 2 @390×844 (both P1-3). 105 rules enabled, 42–44 rule-groups passing per route, so the ruleset genuinely executed.
- **Heading order** — 26/26 routes: no skipped levels, no missing `h1`, no duplicate `h1`.
- **Landmarks** — `main`, `navigation`, `banner` present and correctly singular on all routes; every secondary `nav` is named.
- **Reduced motion** — all CSS/Framer animation stops; `document.getAnimations()` returns nothing running; the only residual movement is data arriving, proven with the Pause control.
- **Live regions** — 0.00 mutations/sec on all 8 instrumented routes over 10s of live streaming.
- **Focus indicator** — present at every one of ~200 recorded tab stops; 6.13:1 contrast; uses `select`/silver, correct per the house palette.
- **Overlay focus traps** — 4/4 trap and restore correctly; `StockDetailDrawer` likewise.
- **Focus stability under streaming** — a focused tape row survives 6s of prepending prints.
- **Compass card activation** — `Enter`/`Space`/click all equivalent (my first measurement here was wrong; corrected).

---

## Not audited

- **Colour contrast of body text.** axe returned `incomplete` — not pass — for **up to 253 nodes per route** (71 on `/pulse`, 190 on `/trace/live-tape`, 253 on `/`), because it cannot resolve a background behind `holo-text` gradient text and the glass/blur surfaces. I measured focus-ring contrast only. **Text contrast across this app is effectively unmeasured** and needs a dedicated pass.
- **No real screen reader was run.** Every SR claim here is derived from computed roles and accessible names (axe-core's own engine), not from NVDA/JAWS/VoiceOver speech output. The `aria-modal` reasoning in P0-1 is spec-based, not observed in a live SR.
- **Keyboard walks covered 3 of 65 route entries** — the three workflows requested. The other 62 have axe/heading/landmark coverage only.
- `aria-prohibited-attr` — axe flagged 1 `incomplete` node (`<span aria-label="SPY spot 503.89">` with no role) on `/pulse` and `/`; my follow-up probe errored out and I did not re-run it. Unresolved.
- **Not tested at all:** forced-colors / Windows High Contrast; 200 % and 400 % zoom reflow; touch-target sizing; `/trailer` (excluded from the route list); the 21 vitest files; voice control; browsers other than Chromium.
- **Modal background suppression** — I checked for `inert` (absent everywhere) but my `aria-hidden` probe matched decorative icons too, so whether background content is properly hidden from AT was not conclusively determined for any overlay.
