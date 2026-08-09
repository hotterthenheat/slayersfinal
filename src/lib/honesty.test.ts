import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KNOWABILITY } from '../components/ui/knowability';
import { SIMULATED_FEED, feedSource, isSimulatedFeed } from '../core/feedSource';

/*
==================================================
  SLAYER TERMINAL - HONESTY GUARD (lib/honesty.test.ts)
  A number that cannot be wrong may not be printed as a percentage.

  The app kept inventing certainty. Four separate surfaces did it, each one
  arrived at independently, and three of them were caught and removed by hand
  with a written post-mortex left behind — compass/contractFacts.ts,
  compass/SignalMonitor.tsx and compass/SetupScanCard.tsx all say the same
  thing in their own words: "a Conf column is the Score column wearing a
  percent sign". None of that stopped the fourth, because a comment cannot fail
  a build.

  What was actually shipping, all of it rendered:

    data/compass.ts       confidence = clamp((score - 55) * 2.1, 5, 98)
                          A linear function of the score with no second input,
                          printed as "88%" three tiles under "Score 97" on the
                          public landing page and in the Tracker.
    landing/LiveSections  const FADED_CONFIDENCE = 31
                          A hardcoded integer, printed as "Confidence 31%".
    data/darkpool.ts      conviction = hRange(seed, 48, 68) and four siblings
                          A hash of a seed string, printed as "Confidence
                          MODERATE · 57%", under copy that called it "the
                          classifier's own confidence in it".
    core/simulator.ts     confidence = 50 + |score - 50| * 1.25
                          Spanned [50, 100] over a score clamped to [10, 90]:
                          the strongest read printed 100% certainty, the most
                          bearish read printed 100% too, and its floor of 50
                          meant it could not express doubt at all.

  Zero of the 46 test files asserted on any of it. This file is the net.
==================================================
*/

const SRC = join(process.cwd(), 'src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/**
 * Source with comments removed.
 *
 * Load-bearing: every removal above left a comment BEHIND explaining what the
 * number was and why it went, and those comments necessarily quote the banned
 * words and the banned formulas. Scanning raw text would fail on the very
 * post-mortems that make the decision survivable, which would teach the next
 * reader to delete the explanation rather than keep the rule.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

const FILES = walk(SRC).map(path => ({ path, code: stripComments(readFileSync(path, 'utf8')) }));
const rel = (p: string) => p.slice(SRC.length + 1);

describe('no fabricated certainty', () => {
  /**
   * The four formulas, as they were actually written. Exact strings rather than
   * a shape-matching regex: the point is to fail a REVERT, and a paraphrase of
   * one of these is a new decision that deserves to be read on its own merits
   * rather than silently blocked by a guard written about a different number.
   */
  const REVERTS: [string, string][] = [
    ['(score - 55) * 2.1', 'data/compass.ts — Setup.confidence, the score with a percent sign'],
    ['Math.abs(score - 50) * 1.25', 'core/simulator.ts — TradePlan.confidence, which printed 100%'],
    ['FADED_CONFIDENCE', 'landing/LiveSections.tsx — a hardcoded 31 rendered as "Confidence 31%"'],
  ];

  it('does not resurrect a formula that was removed for inventing certainty', () => {
    const found: string[] = [];
    for (const [needle, why] of REVERTS) {
      for (const f of FILES) {
        if (f.code.includes(needle)) found.push(`${rel(f.path)} — \`${needle}\` is back. ${why}`);
      }
    }
    expect(found, found.join('\n')).toEqual([]);
  });

  /**
   * The RENDERED label, not the word.
   *
   * "conviction" appears legitimately in prose the desk shows a reader —
   * flowdesk/DarkPool.tsx's competing-read copy says a block "could equally be
   * short-covering ... rather than fresh conviction buying", which is a
   * sentence, not a claim about a number. So this matches only the shapes that
   * put the word in a LABEL position: a bare JSX text node, or a label/header/
   * title prop. Those are the shapes that sit next to a value.
   */
  /** Shapes that put a word on screen next to a value. */
  const DISPLAY_SHAPES = (word: string) => [
    // A bare JSX text node: <span …>Confidence</span>
    new RegExp(`>\\s*${word}\\s*<`, 'i'),
    // The label of a value rendered beside it: >conf {prob(x)}<
    new RegExp(`>\\s*${word}\\s*\\{`, 'i'),
    // A label/header/title prop, and Panel's `title` and DataTable's `header`.
    new RegExp(`\\b(?:label|header|title)\\s*[=:]\\s*["'\`]${word}["'\`]`, 'i'),
  ];

  /*
    The whole word ALSO banned as a complete string literal, wherever it sits.

    Added after a live-render sweep found a tenth site the display shapes all
    missed: flowdesk/LiveTape.tsx declared its column groups as
    `type GroupName = 'Contract' | 'Execution' | 'Conviction' | 'Activity'` and
    rendered them from `GROUP_ORDER`, so the word reached the screen as a union
    member and an array element, never as a prop. A guard that only knows the
    shapes it was written against will keep finding nine sites in ten.

    Whole words ONLY. The same rule on the four-letter abbreviations flagged
    three internal identifiers that no reader ever sees — `seed('conf')` and
    `h('conf')` were RNG seed strings (core/fracture.ts, and data/news.ts before
    it was deleted) and `key: 'conv'` is a DataTable column id whose header reads "Match"
    (flowdesk/DarkPool.tsx). Banning those would train the next person to
    rename a seed string to satisfy a test, which is worse than the defect.
    Prose is untouched either way: "rather than fresh conviction buying" is a
    sentence, not a literal.
  */
  const LITERAL_SHAPE = (word: string) => new RegExp(`["'\`]${word}["'\`]`, 'i');

  it('never labels a value Confidence, Conviction or Certainty', () => {
    const offenders: string[] = [];
    const WHOLE = ['Confidence', 'Conviction', 'Certainty'];
    // The abbreviations are checked in DISPLAY position only. Shortening the
    // claim does not retract it — trailer/LevelsStressScene.tsx rendered
    // `conf {prob(l.confidence)}`, and the first version of this guard, which
    // matched only the whole word, walked straight past it.
    const ABBREV = ['conf', 'conv'];
    for (const word of [...WHOLE, ...ABBREV]) {
      const shapes = WHOLE.includes(word)
        ? [...DISPLAY_SHAPES(word), LITERAL_SHAPE(word)]
        : DISPLAY_SHAPES(word);
      for (const re of shapes) {
        for (const f of FILES) {
          if (re.test(f.code)) offenders.push(`${rel(f.path)} — renders "${word}" as a label`);
        }
      }
    }
    expect(
      [...new Set(offenders)],
      `A label like this sits beside a number and asserts the model knows how likely it is to be right. ` +
        `Nothing in this app measures that. Where the quantity is a MATCH STRENGTH say so (flowdesk/DarkPool.tsx ` +
        `matchTier); where it is a question of PROVENANCE use components/ui/KnowabilityChip.`
    ).toEqual([]);
  });

  it('keeps Setup and TradePlan free of a confidence field', () => {
    const compass = FILES.find(f => rel(f.path) === 'types/compass.ts')!;
    const market = FILES.find(f => rel(f.path) === 'types/market.ts')!;
    expect(compass.code, 'Setup.confidence is back on the type').not.toMatch(/^\s*confidence\s*[?]?:/m);
    expect(market.code, 'TradePlan.confidence is back on the type').not.toMatch(/^\s*confidence\s*[?]?:/m);
  });
});

/*
==================================================
  THE ENTITLEMENT BOUNDARY

  The product is built on three market-data subscriptions: options (OPRA
  trades, NBBO, vendor greeks), equities, and index quotes. Several engines
  were built on quantities that none of the three can produce, and every one of
  them presented a hash of the ticker as a measurement — a report date, an
  analyst revision, a headline, a sector membership, an unpaired auction
  imbalance in dollars.

  Deleting a file does not stop the next one. The names below are the exact
  entry points that were removed, and the module paths are the imports that
  vanished with them. `docs/DATA-FEASIBILITY.md` holds the per-desk reasoning.
==================================================
*/
describe('no engine without a feed', () => {
  /** [identifier, what it needed that no entitlement carries] */
  const NO_SOURCE: [string, string][] = [
    ['buildMoc', 'the closing-auction engine — unpaired auction interest and the indicative price come from an exchange imbalance feed (Nasdaq NOII / NYSE Order Imbalances)'],
    ['MocRead', 'the closing-auction read type — same feed'],
    ['absorptionPct', 'how much of an auction imbalance the paired book soaks up — same feed'],
    ['buildEarningsCalendar', 'report dates — an earnings calendar'],
    ['directionVote', 'analyst revisions and estimate flow'],
    ['buildNewsFeed', 'a news wire'],
    ['catalystPriors', 'a news wire, laundered into a quant prior'],
    ['tickerSentiment', 'a news wire'],
    ['buildSectorBoard', 'a sector taxonomy and constituent membership'],
    ['RotationPhase', 'a sector taxonomy'],
  ];

  it('does not rebuild an engine whose primary input has no feed', () => {
    const found: string[] = [];
    for (const [needle, why] of NO_SOURCE) {
      for (const f of FILES) {
        // Word-boundary, so a longer identifier that merely contains one of
        // these is not swept up with it.
        if (new RegExp(`\\b${needle}\\b`).test(f.code)) {
          found.push(`${rel(f.path)} — \`${needle}\` is back. It needs ${why}, and no entitlement carries it.`);
        }
      }
    }
    expect(found, found.join('\n')).toEqual([]);
  });

  /** Modules deleted outright. An import of one cannot resolve, but it can be written. */
  const GONE = ['data/earnings', 'data/earningsintel', 'data/news', 'pages/EarningsHub', 'components/earnings/'];

  it('imports nothing from a module that was removed for having no feed', () => {
    const found: string[] = [];
    for (const f of FILES) {
      for (const mod of GONE) {
        // Import and re-export specifiers only — a bare mention in a string is
        // not a dependency, and the post-mortem comments are stripped already.
        if (new RegExp(`from\\s+["'][^"']*${mod}["']`).test(f.code)) {
          found.push(`${rel(f.path)} — imports from the removed module "${mod}"`);
        }
      }
    }
    expect(found, found.join('\n')).toEqual([]);
  });

  it('keeps the auction read off the Fracture view', () => {
    const fracture = FILES.find(f => rel(f.path) === 'types/fracture.ts')!;
    // FractureView carried `moc: MocRead` — one field putting an unsourceable
    // engine on a type five surfaces read.
    expect(fracture.code, 'FractureView.moc is back on the type').not.toMatch(/^\s*moc\s*[?]?:/m);
  });
});

describe('knowability', () => {
  it('spends no hue — it is a provenance statement, not a direction', () => {
    // lib/palette.test.ts holds HUE_BUDGET to an exact set, and freshness is
    // already spelled in neutral ink by compass/setupState.ts's chrome rule.
    // A tier that reached for text-bull would read as a market call.
    const inks = Object.values(KNOWABILITY).map(m => m.text);
    for (const ink of inks) {
      expect(ink, `${ink} is not a neutral ink`).toMatch(/^text-text(Primary|Secondary|Muted)$/);
    }
  });

  it('descends: more knowable is never quieter than less knowable', () => {
    // The dot meter is the scale. If `assumed` ever outranked `observed` the
    // chip would rank them backwards while still reading correctly in words.
    expect(KNOWABILITY.observed.dots).toBeGreaterThan(KNOWABILITY.estimated.dots);
    expect(KNOWABILITY.estimated.dots).toBeGreaterThan(KNOWABILITY.assumed.dots);
  });
});

describe('the feed declares itself', () => {
  it('ships as simulated, because it is', () => {
    expect(feedSource()).toEqual(SIMULATED_FEED);
    expect(isSimulatedFeed()).toBe(true);
  });

  it('says so in words a reader would understand', () => {
    // Terms, the Disclaimer and the Guide all say "simulated" and none of them
    // is on screen while someone reads a desk. This string is.
    expect(SIMULATED_FEED.detail).toMatch(/simulated/i);
    expect(SIMULATED_FEED.detail).toMatch(/no exchange connection|no market-data vendor/i);
  });

  it('is mounted in the chrome every desk renders', () => {
    // The declaration is only worth anything if it is UNMISSABLE. TopBar is the
    // one component on every route inside the shell — SiteFooter is not (Pulse
    // has none) and the legal pages are not somewhere a working reader goes.
    const bar = FILES.find(f => rel(f.path) === 'components/layout/TopBar.tsx')!;
    expect(bar.code, 'TopBar no longer mounts FeedBadge — the terminal has stopped saying what its data is').toMatch(
      /<FeedBadge\s*\/>/
    );
  });

  it('is not hidden behind a breakpoint', () => {
    // The clock beside it is `hidden xl:flex`, which is fine for a clock. A
    // reader on a narrow window needs this one more, not less.
    // Scoped to className, not the whole file: `aria-hidden="true"` on the
    // status dot is correct and unrelated, and matching it failed this test on
    // its first run against a badge that was never hidden from anyone.
    const badge = FILES.find(f => rel(f.path) === 'components/layout/FeedBadge.tsx')!;
    const classNames = [...badge.code.matchAll(/className="([^"]*)"/g)].map(m => m[1]);
    for (const cls of classNames) {
      expect(cls, 'FeedBadge has been given a responsive hide').not.toMatch(/(?:^|\s)(?:\w+:)?hidden(?:\s|$)/);
    }
  });
});
