/*
  Acceptance test for Part 15's settings surface, the `?` sheet, and the
  data-source list that answers Part 14's un-buildable surfaces.

  "Settings surface: carry (r/q override), distance units, theme, motion,
   number format, data-source preferences." · "Global shortcuts sheet (?)"

  Three failures are guarded, and the first is the one that matters:

    A CONTROL THAT CLAIMS MORE THAN IT DOES. The motion setting must not be
    able to turn animation ON over an operating system that asked for it
    off. That is an accessibility guarantee, not a preference, and it is
    the single assertion here I would not trade for any other.

    A SETTING THAT DOES NOT REACH THE DESK. A number-format control that
    changes a sample and nothing else is a decoration; the desk's one money
    formatter has to answer to it.

    A LIST THAT DRIFTS FROM WHAT IT DESCRIBES. The shortcuts sheet must
    only claim bindings the app actually registers, and the feed list must
    count itself rather than assert a total.
*/
import { readFileSync } from 'node:fs';
import {
  MOTION_WORDS,
  NUMBER_FORMAT_WORDS,
  formatMoney,
  getPrefs,
  motionAllowed,
  resetPrefs,
  setPref,
  type MotionPref,
  type NumberFormat,
} from '../src/data/prefs';
import { FEED_SEAMS, FEED_STATE_WORDS, seamSummary, seamsIn, type FeedState } from '../src/data/feeds';
import { GLOBAL_SHORTCUTS, SURFACE_SHORTCUTS } from '../src/components/layout/ShortcutsSheet';
import { fmtUsd } from '../src/data/gex';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

resetPrefs();

// ---- 1 · MOTION CANNOT OVERRIDE THE OPERATING SYSTEM ------------------------
check('with the OS quiet, "follow the system" means motion runs', motionAllowed('full', false));
check('and "reduce motion" turns it off', !motionAllowed('reduced', false));
check('WITH THE OS ASKING FOR REDUCED, motion is off', !motionAllowed('full', true));
check('AND NO SETTING TURNS IT BACK ON', !motionAllowed('reduced', true) && !motionAllowed('full', true));
/* Stated as a table so a future change to `motionAllowed` cannot quietly
   flip the one cell that matters. */
const TRUTH: [MotionPref, boolean, boolean][] = [
  ['full', false, true],
  ['full', true, false],
  ['reduced', false, false],
  ['reduced', true, false],
];
check(
  'the whole truth table holds',
  TRUTH.every(([p, os, want]) => motionAllowed(p, os) === want)
);
check('and the copy says the setting is one-directional', /cannot turn them back on/i.test(MOTION_WORDS.full.note));
{
  const src = readFileSync('src/pages/Settings.tsx', 'utf8');
  check('the page repeats it where a reader will act on it', /cannot turn it back on/i.test(src));
  check('and explains why, not just that', /makes them ill|doing harm/i.test(src));
}

// ---- 2 · the number format reaches the desk's own formatter ------------------
check('compact is the default', getPrefs().numbers === 'compact');
check('and fmtUsd compacts', fmtUsd(1_240_000_000) === '$1.2B', fmtUsd(1_240_000_000));
setPref('numbers', 'full');
check('FLIPPING THE SETTING CHANGES fmtUsd', fmtUsd(1_240_000_000) === '$1,240,000,000', fmtUsd(1_240_000_000));
check('and the negative keeps the minus sign', fmtUsd(-1_240_000).startsWith('−'), fmtUsd(-1_240_000));
check('a hyphen never appears', !fmtUsd(-1_240_000).includes('-'));
setPref('numbers', 'compact');
check('and back', fmtUsd(1_240_000_000) === '$1.2B');

/* The minus must be the SAME character in both shapes, or a column goes
   ragged the moment the reader flips the setting. */
check(
  'both formats use the same minus character',
  formatMoney(-5e6, 'compact')[0] === formatMoney(-5e6, 'full')[0],
  `${formatMoney(-5e6, 'compact')} / ${formatMoney(-5e6, 'full')}`
);
check('neither format prints a hyphen', !formatMoney(-5e6, 'compact').includes('-') && !formatMoney(-5e6, 'full').includes('-'));
check('a non-finite figure is a dash, not NaN', formatMoney(NaN) === '—' && formatMoney(Infinity) === '—');

/* Both samples on the settings page are produced by the formatter itself,
   so a change to the arithmetic cannot leave a stale example on screen. */
const FORMATS: NumberFormat[] = ['compact', 'full'];
check(
  'each sample is what the formatter actually produces',
  FORMATS.every(f => NUMBER_FORMAT_WORDS[f].sample === formatMoney(1_240_000_000, f))
);
check('and the two samples differ', NUMBER_FORMAT_WORDS.compact.sample !== NUMBER_FORMAT_WORDS.full.sample);

/* And the shell subscribes, or the setting would not visibly take effect. */
{
  const shell = readFileSync('src/components/layout/AppShell.tsx', 'utf8');
  check('the shell subscribes so a change redraws the desk', /usePrefs\(\)/.test(shell));
}

// ---- 3 · the shortcuts sheet claims only what is bound ----------------------
{
  const shell = readFileSync('src/components/layout/AppShell.tsx', 'utf8');
  check('⌘K is registered', /metaKey \|\| e\.ctrlKey/.test(shell) && /'k'/.test(shell));
  check('? is registered', /e\.key === '\?'/.test(shell));
  /* A bare character key as a global binding is a trap — a reader typing a
     question mark into a composer must get a question mark. */
  check('and it stands down while somebody is typing', /INPUT'/.test(shell) && /TEXTAREA'/.test(shell));
  check('including a contenteditable, which is not an input', /isContentEditable/.test(shell));

  const bound = new Set(['⌘K', 'CtrlK', '?', 'Esc']);
  check(
    'every global row corresponds to a real binding',
    GLOBAL_SHORTCUTS.every(s => bound.has(s.keys.join(''))),
    GLOBAL_SHORTCUTS.map(s => s.keys.join('')).join(' ')
  );
  check('and every global row says it is global', GLOBAL_SHORTCUTS.every(s => s.where === 'Anywhere'));
  /* The point of splitting the two lists: a per-surface key listed as
     global reads to the reader as broken everywhere else. */
  check('no surface-scoped row claims to be global', SURFACE_SHORTCUTS.every(s => s.where !== 'Anywhere'));
  check('and each names its surface', SURFACE_SHORTCUTS.every(s => s.where.length > 2));

  /*
    THE ROWS ARE CHECKED AGAINST THE HANDLER, and this is the assertion that
    earned its place: the sheet's first draft said R reset the price scale.
    R toggles the strike rail. A sheet describing the wrong action is worse
    than a missing one — the reader presses the key, something else happens,
    and concludes the shortcut is broken.

    Checking the KEY alone would not have caught that, so each row carries
    the literal `case` label it claims and the handler is read for it.
  */
  const terrain = readFileSync('src/pages/terrain/Terrain.tsx', 'utf8');
  check(
    'every Terrain row names a case that exists in the handler',
    SURFACE_SHORTCUTS.filter(s => s.where === 'Terrain').every(s => terrain.includes(`case ${s.code}`)),
    SURFACE_SHORTCUTS.map(s => s.code).join(' ')
  );
  check(
    'and the rail keys are described as the rail, not the price scale',
    SURFACE_SHORTCUTS.filter(s => s.code === "'r'" || s.code === "'R'").every(s => /rail/i.test(s.what))
  );
}

// ---- 4 · the data-source list counts itself ---------------------------------
const STATES: FeedState[] = ['live', 'not-on-plan', 'no-endpoint'];
check('every seam carries a known state', FEED_SEAMS.every(s => STATES.includes(s.state)));
check('every state has words', STATES.every(s => FEED_STATE_WORDS[s].label && FEED_STATE_WORDS[s].note.length > 20));
check(
  'and the three states say different things',
  new Set(STATES.map(s => FEED_STATE_WORDS[s].note)).size === 3
);
/* "Not on this plan" and "no source" must not read alike: the first is
   fixed by buying something, the second is not, and a reader acts
   differently on each. */
check(
  'a plan gap is described as buyable',
  /add-on|tier|key/i.test(FEED_STATE_WORDS['not-on-plan'].note)
);
check(
  'and a missing source is described as not',
  /different provider|not a different tier/i.test(FEED_STATE_WORDS['no-endpoint'].note)
);

check('the summary counts rather than claims', seamSummary().startsWith(`${seamsIn('live').length} of ${FEED_SEAMS.length}`), seamSummary());
check('every seam says what it will show', FEED_SEAMS.every(s => s.shows.length > 40));
check('and names the seam it plugs into', FEED_SEAMS.every(s => s.seam.length > 20));
check('every live seam is reachable', seamsIn('live').every(s => typeof s.path === 'string' && s.path.startsWith('/')));
check('no surface is listed twice', new Set(FEED_SEAMS.map(s => s.surface)).size === FEED_SEAMS.length);

/* The three Part 14 surfaces this list exists to account for are named
   here, so "we built shells for them" is checkable rather than asserted. */
for (const needle of ['TCA', 'borrow', 'Short interest', 'FLEX', 'futures']) {
  check(`the list accounts for ${needle}`, FEED_SEAMS.some(s => s.surface.includes(needle) || s.needs.includes(needle)));
}
/* And the one that is easiest to fake says WHY it is not being faked. */
{
  const borrow = FEED_SEAMS.find(s => s.surface.includes('Implied borrow'))!;
  check('implied borrow explains that parity is zero by construction', /by construction/.test(borrow.seam));
  check('and that a flat zero would look like a measurement', /look like a measurement/.test(borrow.seam));
  check('so it is not listed as merely waiting on a plan', borrow.state === 'no-endpoint');
}

// ---- 5 · the theme non-setting -----------------------------------------------
{
  const src = readFileSync('src/pages/Settings.tsx', 'utf8');
  check('the theme panel exists and explains the absence', /one palette, on purpose/.test(src));
  /*
    STRUCTURE, NOT VOCABULARY. Written first as a search for "disabled" near
    "theme" and it failed on the page's own sentence explaining that the
    control is missing RATHER THAN disabled — the same trap as looking for
    the word "backwardation" in a paragraph about why there is no
    backwardation chip. What actually distinguishes a missing control from a
    dead one is whether the panel contains an interactive element at all.
  */
  const themePanel = src.slice(src.indexOf('one palette, on purpose'));
  const themeBlock = themePanel.slice(0, themePanel.indexOf('</Panel>'));
  check(
    'and the panel ships no control at all, dead or otherwise',
    !/<button|<input|<select|onClick=/.test(themeBlock)
  );
  /* The claim it rests on, verified rather than trusted: if a light theme
     ever lands, this assertion is the thing that says the copy is stale. */
  const tsx = readFileSync('src/pages/Settings.tsx', 'utf8') + readFileSync('src/components/layout/TopBar.tsx', 'utf8');
  check('and the source really has no dark: variants to swap', !/\bdark:[a-z]/.test(tsx));
}

// ---- 6 · the page mounts the real controls, not copies ----------------------
{
  const src = readFileSync('src/pages/Settings.tsx', 'utf8');
  check('the carry editor is mounted, not reimplemented', /<CarryEditor/.test(src) && !/setCarry\(/.test(src));
  check('the distance picker is mounted, not reimplemented', /<DistanceUnitPicker/.test(src) && !/setDistanceUnit\(/.test(src));
  check('the shortcuts come from the sheet, not a second list', /GLOBAL_SHORTCUTS/.test(src));
}

// ---- 7 · settings is findable -------------------------------------------------
{
  const app = readFileSync('src/App.tsx', 'utf8');
  check('the route exists', /path="\/settings"/.test(app));
  const bar = readFileSync('src/components/layout/TopBar.tsx', 'utf8');
  check('the top bar has a way in', /to="\/settings"/.test(bar));
  check('and it is labelled for a screen reader', /aria-label="Settings"/.test(bar));
  const palette = readFileSync('src/components/layout/CommandPalette.tsx', 'utf8');
  check('the palette finds it by name', /navigate\('\/settings'\)/.test(palette));
  const nav = readFileSync('src/components/layout/nav.ts', 'utf8');
  check('and it does NOT take a slot in the workflow nav', !/\/settings/.test(nav));
}

resetPrefs();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
