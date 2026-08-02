# Visual audit — what is done and what is not

Status of the 59-item audit written while clicking through the product. Written
to be checked, not to be believed: every "done" below names the file or the
measurement behind it, and everything unverified says so.

Last updated at commit `08405f2`. Gate at that commit: `tsc --noEmit`, `eslint .`,
**384 tests** (up from 31 at the start of this work), `vite build` — all green.

Green has repeatedly not meant correct here. Three adversarial verifiers went
through the largest wave and found 26 problems, 3 of them blockers, in code that
passed every gate. That is why the open list below is as long as it is.

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

### Landing
| Item | Where |
|---|---|
| Never presented as real market data | 17 liveness claims removed, including "these panels are running right now" |
| Data never incorrect | Both doctored demos fixed. The FADED card was computing `100 − confidence`, which **inverts** the value, so the strongest cards displayed as the hardest fades |
| Dealer positioning map redesigned | One shared component, so Pinpoint and Pulse got it too |
| "Questions, answered" heading | Now "Before you ask." Copy below untouched |
| Launch terminal → a neutral index | New `/terminal`. Every entry point moved, including a second one in the footer |

---

## Pushed, awaiting review

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
| Quick Scalp horizon | **Already shipped in `121a40f`** — I reported this as missing and was wrong; I had grepped the wrong file |

### Trace, Pinpoint, Pulse, Stocks, News, Earnings, Community
Shipped in the final wave and checked by a verifier against the original
complaints. See the open list for what did not land.

---

## Open

### Verified not done
1. **Tape cold start** — "you see 5 options tapes then 100 of them load". The last round shipped an honest loading disclosure and reported it addressed. The behaviour is unchanged, and the behaviour was the complaint.
2. **Volatility Lab exists in two places** — the move to Prove It left `VolatilityDesk` in `gex/desks.tsx` still exported and wired.
3. **The guide documents four things that are no longer true** — the Vol Lab in Pinpoint, Key Levels in Pulse, a Trace subtab that no longer exists, and "streaming prints".
4. **Landing shows invented community handles with vote tallies** as social proof. Invented users endorsing a product is a different category from invented market data.
5. **Earnings renders imperative strategy text.** This product observes and never instructs; that row instructs.
6. **Pricing still claims streaming / live** on a shipped surface, while the FAQ on the same page is honest about it.
7. **One user-visible em dash added** in the Prove It subtitle.
8. **`compass` → `compass` rename** — 138 occurrences, 38 files, two directories merging (verified collision-free). Includes deleting the `/skys-vision` redirect, since the site is not live.

### Unverified
Two re-verifiers were queued behind the partial fix round and never ran, so the
news and level fixes in `08405f2` are **self-reported, not independently
checked**. On this project's record that distinction has mattered three times.

---

## Things reported and then disproved

Kept because a refuted finding is worth as much as a confirmed one, and because
each of these was nearly "fixed" into a regression.

- MetricGrid raggedness — my own probe matched any flex-wrap row with three children.
- `/lotto` and `SegmentedControl` "broken" — my probe read `aria-checked` on controls correctly using `aria-pressed`.
- Em dashes app-wide — a brief of mine claimed earlier waves drove these to zero everywhere. They cleared the **landing page**, which is what was actually asked. They are still widespread elsewhere, by design.
- Quick Scalp horizon — reported missing, was already shipped.

---

## Known hazards for whoever works on this next

- **Levels are single-derivation.** `data/gex.ts` `buildLevels` / `pinStrike` own spot, callWall, putWall, flip, pin, king, pinned across 16 tickers in `levels.test.ts`. Four separate modules have re-derived one of these locally at some point. Each time it looked fine: the walls agree most days. The flip disagreed with the rail on **5 of 16 names**, ranked-targets put the pin **$10 off** on AAPL, and the map crowned a different strike on **8 of 32** ticker-expiry combinations.
- **`simulator.ts` must never import `scanUniverse.ts`.** It reads the other way. The cycle surfaces as `undefined` at module init, not as a type error. I created it once.
- **Routing failures here are silent.** The catch-all sends unmatched URLs to a real page and a wrong `?view=` falls back to the first pane, so a broken link renders as a working one. Follow redirects; do not read the route table.
- **Renaming a storage key silently wipes saved layouts and views**, and nothing catches it.
