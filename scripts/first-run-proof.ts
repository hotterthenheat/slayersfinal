/*
  Acceptance test for Part 15's "Onboarding / first-run tour."

  Three failures are guarded, and they are the three that make onboarding
  hated rather than merely ignored:

    IT BLOCKS. A modal or a dimming spotlight tour puts itself between a
    reader and the thing they came for. This has to be a panel in the flow.

    IT COMES BACK. A welcome panel that reappears is a bug the reader
    cannot fix, and they will conclude the app forgets them generally.

    IT CANNOT COME BACK. Dismissed in the first five seconds and gone
    forever is a small loss with an easy fix, so Settings has the hatch.

  Plus the ordinary one: every link it offers has to go somewhere real.
*/
import { readFileSync } from 'node:fs';
import {
  FIRST_MOVES,
  WORKFLOW_GROUPS,
  dismissFirstRun,
  firstRunSeen,
  resetFirstRun,
} from '../src/data/firstRun';
import { NAV_ITEMS } from '../src/components/layout/nav';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

/* Node has no localStorage; the store's guards must survive that, which is
   also the "storage blocked" case a private window produces. */
check('with storage unavailable it shows rather than hides', firstRunSeen() === false);

// ---- 1 · it does not block ----------------------------------------------------
{
  const panel = readFileSync('src/components/layout/FirstRun.tsx', 'utf8');
  check('it is not a modal', !/Modal|createPortal|role="dialog"/.test(panel));
  check('and nothing is dimmed behind it', !/backdrop|inset-0|fixed /.test(panel));
  check('it is a labelled landmark a reader can skip', /role="region"/.test(panel) && /aria-label="Getting started"/.test(panel));
  check('and the dismiss control says what it does', /aria-label="Dismiss the getting started panel"/.test(panel));

  /* Mounted on the desk that a first visit lands on, and only there — in
     the shell it would follow the reader onto every route they try. */
  const pulse = readFileSync('src/pages/workspace/Pulse.tsx', 'utf8');
  check('it is mounted on Pulse', /<FirstRun \/>/.test(pulse));
  const shell = readFileSync('src/components/layout/AppShell.tsx', 'utf8');
  check('and NOT in the shell, where it would follow the reader', !/FirstRun/.test(shell));
}

// ---- 2 · dismissal sticks, 3 · and is reversible ------------------------------
check('PREMISE: it starts visible', firstRunSeen() === false);
dismissFirstRun();
check('dismissing hides it', firstRunSeen() === true);
dismissFirstRun();
check('and dismissing twice is not a bug', firstRunSeen() === true);
resetFirstRun();
check('Settings can bring it back', firstRunSeen() === false);
resetFirstRun();
check('and resetting twice is not a bug either', firstRunSeen() === false);
{
  const settings = readFileSync('src/pages/Settings.tsx', 'utf8');
  check('the hatch is on the settings page', /resetFirstRun/.test(settings));
  check('and it says what dismissal means', /stays gone until you ask/.test(settings));
  const panel = readFileSync('src/components/layout/FirstRun.tsx', 'utf8');
  check('the panel warns before it is closed', /goes away for good/.test(panel));
  check('and points at where it comes back from', /Settings brings it back/.test(panel));
}

// ---- 4 · every offer goes somewhere real --------------------------------------
const app = readFileSync('src/App.tsx', 'utf8');
for (const m of FIRST_MOVES) {
  /* Nested routes are declared by their last segment, so a whole-path match
     would fail on every Pinpoint and Trace child. Checked segment-wise. */
  const leaf = m.path.split('/').filter(Boolean).pop()!;
  check(`"${m.label}" points at a declared route`, new RegExp(`path="/?${leaf}"`).test(app), m.path);
  check(`and says why, not just where`, m.why.length > 50);
}
check('three moves, not a tour', FIRST_MOVES.length === 3);
check('and each ends somewhere different', new Set(FIRST_MOVES.map(m => m.path)).size === 3);

// ---- the group map matches the nav, rather than inventing a second one -------
/*
  A welcome panel that renamed or reordered the workflow groups would be
  teaching a second, wrong map of the same product — and the nav's order is
  itself an argument about the pipeline a trader runs.
*/
const navGroups: string[] = [];
for (const item of NAV_ITEMS) if (!navGroups.includes(item.group)) navGroups.push(item.group);
check('the panel names every group the nav has', WORKFLOW_GROUPS.every(g => navGroups.includes(g.group)));
check('and no group the nav does not', navGroups.length === WORKFLOW_GROUPS.length, `${navGroups.length} vs ${WORKFLOW_GROUPS.length}`);
check(
  'IN THE NAV\'S OWN ORDER, because that order is the argument',
  WORKFLOW_GROUPS.map(g => g.group).join('>') === navGroups.join('>'),
  WORKFLOW_GROUPS.map(g => g.group).join('>')
);
check('each group says what it is for', WORKFLOW_GROUPS.every(g => g.what.length > 40));

// ---- it counts nothing --------------------------------------------------------
/* A "have they been here three times" heuristic is a behavioural model with
   no behavioural data behind it and no account to hang it on. One boolean. */
{
  const raw = readFileSync('src/data/firstRun.ts', 'utf8');
  /*
    COMMENTS AND STRING LITERALS BOTH COME OUT. Stripping only comments
    left the guard reading the panel's own copy, where "with the lock
    times" tripped a search for "times" — a word search finding prose
    instead of code, for the third time on this branch. What is being
    asserted is about the STORE, so only executable text may be searched.
  */
  const code = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
  check('the store keeps no session counter', !/\bcount\b|\bvisits\b|\btimes\b/i.test(code), '');
  check('and what it does keep is a boolean', /let seen = load\(\);/.test(code) && /: boolean/.test(code));
  check('and says why in the header', /One boolean/.test(raw));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
