# /trailer — the in-app product trailer

An interactive, 84-second cinematic walk through the terminal that follows **one
simulated market event on one symbol through every desk**. It is a route in the
app, not a video: the instruments are live compositions reading a shared story
layer, and at any point you can pause, step, or open the real desk you are
looking at.

## Running it

```bash
npm run dev          # then open /trailer
```

The route opens on a launch card. Nothing plays until the viewer presses **Play
trailer** — an 84-second timeline that starts running at someone who has not
asked for it is worse than the autoplay policy it would be dodging.

Entry points: the hero on `/` ("Watch terminal trailer") and the URL directly.

**Controls** — play/pause, previous/next scene, replay, skip, mute, chapter
scrub, "Open desk", exit. Keyboard: `Space`/`K` play-pause, `←`/`→` scene,
`R` replay, `M` mute, `Home`/`End` first/last scene.

## The story

One symbol (NVDA), one structural level (the put wall), one session.

Price presses down into the level while dealers are inferred short gamma → an
aggressive call-side sequence prints at one strike → the scanner re-ranks it up
as corroboration accumulates → the prints group into a probable parent order
(58%, with three other explanations that still fit) → off-exchange prints have
left a shelf at the same level → the dealer field shows the flip just above spot
→ the level survives a −0.5% shock but not a −1.2% one → Compass scores four
setups and **rejects the highest-flow one on a data-quality gate** → the Weigher
prices five contracts on the same thesis → Lotto marks the cheapest far-OTM
contract **NO TRADE** → Prove It fails a challenger model on calibration →
Stocks routes the thesis to options → News widens the distribution without
flipping it → Earnings says wait → Tracker freezes the packet, advances the
market, and scores the alternatives against what actually happened.

Every desk refers to the **same timestamp, the same level and the same setup id**.
That continuity is the point, and the **State Thread** along the bottom is how it
is made visible: it carries the packet between scenes, and each field stays dim
until the desk that measures it has been on screen. Pinpoint is the only place a
dealer state can come from, so it cannot light up before Pinpoint has run.

## Architecture

```
src/pages/trailer/
  SlayerTrailer.tsx     route + launch gate (lazy-loaded)
  TrailerShell.tsx      clock owner, layout, camera, keyboard, mounts ONE scene
  TrailerHUD.tsx        symbol, price, session clock, chapter nav
  TrailerControls.tsx   transport + chapter scrub + Open desk
  StateThread.tsx       the persistent packet rail
  useTrailerTimeline.ts scene table + the single rAF clock
  useTrailerState.ts    context, thread derivation, easing helpers
  trailerStory.ts       the whole story, derived once
  trailerTypes.ts       domain types
  parts.tsx             scene vocabulary (components only)
  format.ts             number formatting
  scenes/*.tsx          18 scenes
```

Three rules hold the thing together:

1. **One clock.** A single `requestAnimationFrame` loop in `useTrailerTimeline`
   owns time; scenes derive everything from a `sceneProgress` scalar. No scene
   runs an interval. Pause, scrub, replay, tab-hidden and reduced-motion all work
   without a scene knowing they exist.
2. **One story.** `trailerStory.ts` builds every number once and memoizes it.
   Scenes render what they are handed and never roll their own values — a trailer
   whose desks each invent numbers is a slideshow of unrelated dashboards.
3. **One scene mounted.** Eighteen mounted subtrees re-rendering on a 60fps
   timeline is the cost a viewer notices first.

### Retiming

`SCENE_SPEC` at the top of `useTrailerTimeline.ts` — one array of
`{ storyEnd, id, product, route, durationMs, description }`. Change a duration
and everything downstream (chapter bar, remaining time, thread acquisition)
follows.

`storyEnd` is the other half and it is not the same axis: it says where the
**market** has got to by the end of that scene, as a fraction of the session,
independent of how long the scene runs on screen. `storyUAt()` is the only place
that maps the two together, and everything reads it — the spot on the thread, the
timestamp in the HUD, the reveal on every price chart, the moment the Tracker
packet freezes.

Mapping the two linearly instead is what the first version did, and it put Pulse
at minute 2 of a 40-minute session while its chart drew the session's closing
rebound: the pulsing live edge and the price beside it described different
moments. If you retime a scene, check `storyEnd` still lands on the beat that
scene is about. `storyClock.test.ts` asserts the invariants that can be
asserted — monotonic, ends at the close, Tracker's packet frozen at the instant
its scene opens.

### Where the data comes from

`Simulator.buildSnapshotAt('NVDA', spot, regimeDay)` and `buildLevels()` — the
same chain, plan and level builders every real desk reads, run against a **pinned
session**. Story specifics (which prints arrive, which contracts compete, how the
trade ends) are seeded from a fixed key via `src/core/rng`, so a replay is the
same film.

**Why pinned.** The live simulator is mutable: `buildSnapshot` reads a price that
advances every 1500ms and draws from the symbol's random stream on the way past.
Built off that, the story's geometry depended on how long the app had been open
before `/trailer` mounted. Cold, the strongest level below spot landed three cents
under price, and the premise — price travelling down into a level — had nowhere
to happen. `buildSnapshotAt` is a read-only sibling: same builders, fixed spot,
fixed positioning regime, no RNG draw, no mutation. Mounting the trailer now
leaves the live feed exactly where it was.

Two constants at the top of `trailerStory.ts` name the session: `STORY_SPOT` and
`STORY_REGIME_DAY`. The regime day sets the OI pivot and therefore the gamma flip;
left to the calendar it wanders a strike and a half either side of spot across a
week, and on roughly one day in five it lands *below* the level the story is
about, which inverts the whole narrative.

**The level is chosen, not assumed.** `buildLevels().putWall` is argmax |net GEX|
below spot, which on this book is a large *positive* node just under price — a
correct answer to the product's question and the wrong level for this film.
`storyLevel()` picks the heaviest short-gamma strike at least 1% below spot
instead, and that price replaces the put wall on the trailer's board rather than
sitting beside it. A board carrying both would be offering two answers to "where
is support".

**Contracts are priced, not fitted.** The Weigher runs on `bsPriceAtT` — the app's
own Black-Scholes, the one Compass's contract track is pinned against. Mid at the
entry spot, exit at the target, expected shortfall at the stop, theta as the value
of one day. Utility is the probability-weighted return net of execution minus the
liquidity penalty, and the SELECTED / ALTERNATIVE / REJECTED labels are assigned
*after* sorting on it. The scene's argument — the best headline return is not the
best decision — is therefore an output. `storyClock.test.ts` fails if it stops
being true.

**Swapping in live data later:** replace the body of `buildTrailerStory()`. The
scenes depend only on the `TrailerStory` shape in `trailerTypes.ts`, not on the
simulator. The things to preserve are that `path`, `levels` and `level` stay
mutually consistent — the whole narrative is one level being tested — and that
nothing which depends on *where price is now* gets frozen into the story. Role,
distance, touches held and the print list are all derived at draw time from the
story clock, because every one of them was wrong when it was not.

## Performance decisions

- The route is **code-split**: `SlayerTrailer` is a lazy import, ~117KB / 32KB
  gzipped, and stays out of the initial bundle.
- **No Three.js.** The spec allowed it for the gamma scene "only if it materially
  improves" it, and it would not have: a rotating surface makes the strike and
  expiry axes unreadable, which is the one thing that scene has to communicate.
  The dealer field is a sheared SVG lattice — fixed reading angle, labelled axes,
  every cell extruded by the exposure it carries.
- One rAF loop for the whole route; it only exists while playing, so a paused
  trailer costs nothing. `document.hidden` pauses outright.
- Charts measure their slot (`FillBox` + `ResizeObserver`) rather than stretching
  with `preserveAspectRatio`, which would have distorted every axis label.
- Paths render as a single `<path>` with a clipped reveal — a 200-point series is
  one node, not two hundred.
- `contain: paint` on the desktop stage so the camera transform cannot invalidate
  the chrome each frame.

## Accessibility

`prefers-reduced-motion` drops the camera moves and translates and keeps opacity
staging, so the narrative order still reads. Full keyboard transport, 44px
minimum targets, focus-visible rings, semantic headings per scene, one
`aria-live` region announcing scene changes (not every frame), `role="img"` +
`aria-label` on every chart, and no information carried by colour alone — every
verdict has a word next to it.

## Honesty rules

Enforced in the copy of every scene:

- Simulated values say **modelled**; inferred values say **inferred**.
- Dealer positioning is never presented as observed. The gamma scene states how
  much of its read flips if the dealer-sign assumption is wrong (71%).
- The metaorder is a **distribution over four explanations**, not a label. The
  word "institutional" does not appear.
- Dark-pool prints get four weighted readings, not an arrow.
- Every probability names its horizon and its event.
- **NO TRADE appears twice** — Lotto's cheapest contract and one Stocks name —
  and Compass rejects two of four setups, one of which has the best flow score
  on the board. Lotto's verdicts come from a stated probability gate, printed
  next to them, not from an author's opinion of which strike looks silly.
- **The desk's own choice is allowed to lose.** The Tracker re-prices every
  rejected contract on the path the market actually took, and on this path one of
  them pays more than the one that was taken. The scene says so, in a count it
  reads off the results rather than a sentence written under them.
- No profitability promise, no user counts, no testimonials, no live-feed claim.

## Known limitations

- **Audio is not implemented.** The mute control is present and persists for the
  session, but there is no sound; the film is designed to be fully legible
  without it. Wiring tones to data events would go in `TrailerShell`.
- The dealer field is a **projection, not a 3D surface**. Deliberate (above), but
  if a genuinely 3D read is wanted later it should be a separate scene, lazily
  loaded, not a change to this one.
- Scene lengths are tuned for desktop reading speed. On a phone the composition
  scrolls, and a slow reader will want to pause — the transport is always
  reachable.
- The story is a single scripted event on a **named session** — a fixed spot and
  a fixed positioning regime, not today's book. That is deliberate (above), and it
  means the numbers in the film will not match the numbers on the desk you land on
  when you press "Open NVDA desk". The desk is live; the film is a recording.
- A second story would mean a second `buildTrailerStory` and a story picker; the
  scene components would not change.
