/*
  The pricing page may not sell what the terminal does not ship.

  WHY THIS EXISTS. Marketing copy and product code drift in one direction only:
  the copy is written when a feature is planned, the feature slips, and nobody
  goes back. This repo had five of those standing at once — a Discord
  integration that appears nowhere in src, a "Chain momentum" desk whose only
  two hits in the whole tree were the two sales rows describing it, a News desk
  the router redirects away from, a "news" screen on Stocks that was deleted
  out of SLEEVE_WEIGHTS, and an FAQ answering "Is the data live?" with "Yes"
  directly above a header that renders a Sim badge on every route.

  None of that is catchable by tsc, and none of it is catchable by a human
  reading a diff of src/core. It is catchable by asserting the copy against the
  code it describes, which is what this does.

  THE ASSERTIONS ARE COUPLED ON PURPOSE. Each one names a fact in the code and
  a claim in the copy and fails if they disagree — so it also fails when the
  feature genuinely ships and the copy is not updated. That is the point: the
  guard should fire in both directions, otherwise it only measures whether
  somebody edited a string.

  Run: npx tsx scripts/sales-proof.ts
*/

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

let pass = 0,
  fail = 0;
const check = (name: string, ok: boolean, detail: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
  ok ? pass++ : fail++;
};

const landing = read('src/pages/landing/Landing.tsx');
const extras = read('src/pages/landing/PricingExtras.tsx');
const sections = read('src/pages/landing/LiveSections.tsx');
const routes = read('src/App.tsx');
const topbar = read('src/components/layout/TopBar.tsx');

// ---- 1. every internal link on the landing page reaches a real page --------

/*
  A footer link to a route that only redirects is not a broken link — it is a
  worse thing, a product listed in the products column that silently deposits
  the reader somewhere else. So redirect targets are read out of App.tsx and
  every `to:` on the landing page is checked against them.
*/
const redirectPaths = new Set<string>();
const livePaths = new Set<string>();
for (const m of routes.matchAll(/path="([^"]+)"\s+element=\{(<[A-Za-z]+)/g)) {
  const p = m[1].startsWith('/') ? m[1] : `/${m[1]}`;
  (m[2] === '<Navigate' ? redirectPaths : livePaths).add(p);
}

const linkTargets = [...landing.matchAll(/to:\s*'([^']+)'/g)].map(m => m[1]);
const deadLinks = linkTargets.filter(t => t.startsWith('/') && redirectPaths.has(t));
check(
  'no landing link points at a route that only redirects',
  deadLinks.length === 0,
  deadLinks.length ? deadLinks.join(', ') : `${linkTargets.length} targets, none redirecting`
);
// Guard the guard: if App.tsx stopped parsing, the check above passes vacuously.
check(
  'the route table actually parsed',
  redirectPaths.size >= 5 && livePaths.size >= 5,
  `${livePaths.size} live routes, ${redirectPaths.size} redirects`
);

// ---- 2. unshipped rows carry the Soon chip, not a checkmark ----------------

/*
  Each entry names a feature, the copy that sells it, and the source fact that
  decides whether it is shipped. A row that is not shipped must carry
  `soon: true` on BOTH surfaces — the tier card on Landing and the ladder in
  PricingExtras — because they render side by side on the same page and a
  checkmark on one is a claim the other contradicts.
*/
interface SalesRow {
  feature: string;
  /** Substring that identifies the row in the tier card / ladder. */
  landingText: string;
  ladderLabel: string;
  /** True when the thing is actually built. */
  shipped: boolean;
  why: string;
}

/** Every .ts/.tsx under src, absolute paths. */
const walkSrc = (dir = path.join(ROOT, 'src'), out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walkSrc(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
};

const discordHits = (() => {
  let n = 0;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry) && !full.includes(path.join('pages', 'landing'))) {
        // A real integration would name it outside the sales copy.
        if (/discord\.(com|gg)|DISCORD_|discordWebhook/i.test(readFileSync(full, 'utf8'))) n++;
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  return n;
})();

const chainMomentumHits = (() => {
  let n = 0;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry) && !full.includes(path.join('pages', 'landing'))) {
        if (/chain\s*momentum/i.test(readFileSync(full, 'utf8'))) n++;
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  return n;
})();

const ROWS: SalesRow[] = [
  {
    feature: 'Discord chat & alerts',
    landingText: 'Discord chat & setup alerts',
    ladderLabel: 'Discord chat & alerts',
    shipped: discordHits > 0,
    why: `${discordHits} file(s) outside the landing copy reference Discord`,
  },
  {
    feature: 'Chain momentum',
    landingText: 'Chain momentum across the whole chain',
    ladderLabel: 'Chain momentum reads',
    shipped: chainMomentumHits > 0,
    why: `${chainMomentumHits} file(s) outside the landing copy implement it`,
  },
  {
    feature: 'Dark pool desk',
    landingText: '',
    ladderLabel: 'Dark pool',
    shipped: livePaths.has('/trace/dark-pool') || livePaths.has('dark-pool'),
    why: redirectPaths.has('dark-pool') ? '/trace/dark-pool redirects' : 'not routed',
  },
];

for (const row of ROWS) {
  const ladderRow =
    extras.split('\n').find(l => l.includes(`label: '${row.ladderLabel}'`)) ?? '';
  check(
    `ladder: "${row.feature}" is marked Soon iff it is unshipped`,
    ladderRow !== '' && ladderRow.includes('soon: true') === !row.shipped,
    ladderRow === '' ? 'row not found in PricingExtras' : `${row.why}; row ${ladderRow.includes('soon: true') ? 'is' : 'is not'} marked Soon`
  );

  if (!row.landingText) continue;
  const tierRow = landing.split('\n').find(l => l.includes(row.landingText)) ?? '';
  check(
    `tier card: "${row.feature}" is marked Soon iff it is unshipped`,
    tierRow !== '' && tierRow.includes('soon: true') === !row.shipped,
    tierRow === '' ? 'row not found in Landing' : `row ${tierRow.includes('soon: true') ? 'is' : 'is not'} marked Soon`
  );
}

// ---- 3. the News desk is not sold while it is unrouted ---------------------

const newsSold = /label: 'News'|News & Earnings|News · Earnings|Stocks · News/.test(landing + extras);
const newsRedirects = redirectPaths.has('/news');
check(
  'News is not listed as an included feature while /news redirects',
  !newsRedirects || !newsSold,
  !newsRedirects
    ? '/news is live'
    : newsSold
      ? '/news redirects but the copy still sells it'
      : '/news redirects and nothing sells it'
);

// ---- 4. the copy may not claim live data while the app says Sim -----------

/*
  The strongest coupling in this file. TopBar renders a badge over every route;
  whatever it says is the product's own statement about its feed, and no
  sentence on the pricing page may contradict it. If the badge goes away
  because the feed went live, this check flips and demands the copy be updated
  — which is exactly the direction that gets forgotten.
*/
const simBadge = /<SignalBadge[^>]*>\s*Sim\s*<\/SignalBadge>/.test(topbar);
const claimsLive =
  /Every panel runs on live market data/.test(extras) ||
  /running on the live feed/.test(sections) ||
  /· live feed/.test(sections);

check(
  'the terminal still declares its feed in the header',
  simBadge,
  simBadge ? 'TopBar renders the Sim badge' : 'no Sim badge — is the feed live now?'
);
check(
  'no sales copy claims a live feed while the header says Sim',
  !(simBadge && claimsLive),
  simBadge && claimsLive ? 'copy contradicts the badge' : 'copy and badge agree'
);

// ---- 5. the decision ledger is not sold after being removed ---------------

const ledgerExists = (() => {
  try {
    statSync(path.join(ROOT, 'src/core/ledger.ts'));
    return true;
  } catch {
    return false;
  }
})();
const ledgerSold = /keeps its own record on the page|every state change a setup goes through stays visible/.test(extras);
check(
  'no sales copy promises the decision record while the ledger is gone',
  ledgerExists || !ledgerSold,
  ledgerExists
    ? 'ledger.ts is present'
    : ledgerSold
      ? 'ledger.ts is gone but the copy still promises it'
      : 'ledger.ts is gone and nothing sells it'
);

// ---- 6. the community seeds do not impersonate anybody --------------------

/*
  The seeds used to carry invented handles, vote counts and "3h ago"
  timestamps under a page titled "from the community". A reader has no way to
  tell an invented thesis from a real one, and this is a page where they might
  act on it.

  Three assertions, because the defect has three halves that can each come
  back on their own: an author that reads like a person, a starting vote count
  that reads like agreement, and a row that renders without the chip that says
  what it is.
*/
const community = read('src/data/community.ts');
const seedStart = community.indexOf('export const SEED_IDEAS');
const seedEnd = community.indexOf('export const SHIPPED_FROM_FEEDBACK');
const seedBlock = seedStart >= 0 && seedEnd > seedStart ? community.slice(seedStart, seedEnd) : '';
const seedAuthors = [...seedBlock.matchAll(/author: '([^']*)'/g)].map(m => m[1]);
const seedVotes = [...seedBlock.matchAll(/votes: (\d+)/g)].map(m => Number(m[1]));
const seedFlags = [...seedBlock.matchAll(/example: true/g)].length;

check(
  'the seed block actually parsed',
  seedAuthors.length >= 9,
  `${seedAuthors.length} seeded rows found`
);
check(
  'no seeded row carries an author that reads like a person',
  seedAuthors.every(a => a === 'example'),
  seedAuthors.every(a => a === 'example')
    ? `all ${seedAuthors.length} say "example"`
    : `handles: ${[...new Set(seedAuthors.filter(a => a !== 'example'))].join(', ')}`
);
check(
  'no seeded row ships with votes on it',
  seedVotes.every(v => v === 0),
  seedVotes.every(v => v === 0) ? `all ${seedVotes.length} start at 0` : `counts: ${seedVotes.filter(v => v).join(', ')}`
);
check(
  'every seeded row is flagged as an example',
  seedFlags === seedAuthors.length,
  `${seedFlags} flagged of ${seedAuthors.length} rows`
);

/*
  And both feeds must actually branch on the flag. Without this, the seeds
  could be flagged correctly and still render a byline — the data would be
  honest and the screen would not.
*/
for (const [page, field] of [
  ['src/pages/community/Ideas.tsx', 'idea'],
  ['src/pages/community/Requests.tsx', 'req'],
] as const) {
  const src = read(page);
  check(
    `${page.split('/').pop()} renders the Example chip instead of a byline`,
    new RegExp(`${field}\\.example \\?`).test(src) && /Example\s*\n?\s*<\/span>/.test(src),
    `branches on ${field}.example`
  );
}

/*
  The landing page renders three of the same seeds as a community showcase, so
  it has to obey the same rule the terminal now does: no vote count and no
  byline on a row nobody wrote. It reads them straight off SEED_IDEAS, so a
  future seed with a handle on it would surface here too.
*/
check(
  'the landing showcase renders no vote count on a seeded row',
  !/\{idea\.votes\}/.test(landing),
  /\{idea\.votes\}/.test(landing) ? 'landing prints idea.votes' : 'no vote pill'
);
check(
  'the landing showcase renders no byline on a seeded row',
  !/\{idea\.author\}/.test(landing),
  /\{idea\.author\}/.test(landing) ? 'landing prints idea.author' : 'no byline'
);
const showsSeeds = /SEED_IDEAS/.test(landing);
const hasChip = /Example\s*\n?\s*<\/span>/.test(landing);
check(
  'the landing showcase marks the rows as examples',
  showsSeeds === hasChip,
  !showsSeeds
    ? 'landing does not show seeds'
    : hasChip
      ? 'seeds shown, Example chip present'
      : 'seeds shown with NO Example chip'
);

/*
  The FAQ's answer to "Is the data live?" names every desk that is NOT on the
  feed seam — and the list is measured, not typed.

  WHY. The answer used to read "The panels are the real ones and they read
  through the same feed the live data lands on, so nothing about the layout or
  the math changes when it is switched over." That is true of price, candles,
  dealer levels and the tape — 26 files import core/feed. It is not true of
  Stocks, Earnings, News or Trace's contract-flow drilldown, which seed their
  numbers from a hash and would not change at all if the seam were repointed.
  A buyer reading that answer would have been told the switch is done above
  four desks where it is not even started.

  The set below is derived the same way a reader would check it: a data module
  that imports core/rng, does NOT import core/feed, and is consumed by at least
  one component. That last clause keeps data/moc.ts out — it seeds from the
  same hash but nothing imports it, so it is an orphan, not a desk a customer
  can open.

  COUPLED IN BOTH DIRECTIONS. Repoint Stocks at the seam and forget the copy:
  fails. Add a new hash-seeded desk and forget the copy: fails.
*/
const dataDir = path.join(ROOT, 'src/data');
const offSeam = readdirSync(dataDir)
  .filter(f => f.endsWith('.ts'))
  .map(f => ({ name: f.replace(/\.ts$/, ''), src: readFileSync(path.join(dataDir, f), 'utf8') }))
  .filter(({ src }) => /core\/rng/.test(src) && !/core\/feed/.test(src))
  .filter(({ name }) => {
    const users = walkSrc().filter(
      abs => abs.endsWith('.tsx') && new RegExp(`data/${name}'`).test(readFileSync(abs, 'utf8'))
    );
    return users.length > 0;
  })
  .map(({ name }) => name);

const FAQ_NAME: Record<string, RegExp> = {
  stocks: /Stocks/,
  earnings: /Earnings/,
  news: /News/,
  contractflow: /contract-flow/,
};
const faqAnswer = (extras.match(/Is the data live\?',\s*\n\s*a: '([^']*)'/) ?? [])[1] ?? '';
check(
  'the live-data answer was found in the FAQ',
  faqAnswer.length > 0,
  faqAnswer.length ? `${faqAnswer.length} chars` : 'could not read the answer — the shape of FAQS changed'
);
const unnamed = offSeam.filter(m => !(FAQ_NAME[m] && FAQ_NAME[m].test(faqAnswer)));
const unmapped = offSeam.filter(m => !FAQ_NAME[m]);
check(
  'every desk that is off the feed seam is named in the FAQ answer',
  unnamed.length === 0,
  unnamed.length
    ? `off the seam and NOT disclosed: ${unnamed.join(', ')}${unmapped.length ? ` (${unmapped.join(', ')} has no entry in FAQ_NAME either)` : ''}`
    : `${offSeam.length} off the seam, all four named: ${offSeam.join(', ')}`
);
const stale = Object.keys(FAQ_NAME).filter(m => !offSeam.includes(m) && FAQ_NAME[m].test(faqAnswer));
check(
  'the FAQ does not still disclaim a desk that has since moved onto the seam',
  stale.length === 0,
  stale.length ? `${stale.join(', ')} now reads the seam — the copy still calls it a sample` : 'no stale disclaimers'
);
check(
  'the answer still says the switch is one file, not a rewrite',
  /single feed module/.test(faqAnswer) && /no layout and no math above it changes/.test(faqAnswer),
  /single feed module/.test(faqAnswer) ? 'the seam promise survives the disclosure' : 'the seam promise was dropped'
);

/*
  Nothing offers to TRACK a print while tracking prints is not built.

  The live tape's star was `aria-label="Track print"` and the drilldown's
  matching control read "Track this print" / "Tracking this print". Neither
  tracks anything: `marked` is component state in LiveTape — no localStorage,
  no context — so it is gone on reload and gone on leaving the tape. Verified
  by driving it in a browser: the whole reader journey (track a campaign,
  post an idea, rearrange the desk) persists; this one does not, because it
  was never wired to persist.

  The desk that WOULD make it durable is /trace/tracker's TRACKED FLOW module,
  and that page says "Not built" in its own words — "Bookmark a print off the
  live tape and follow it past the moment it crossed". So a star promising to
  track pointed at a screen that says it cannot yet.

  The controls now say "Mark this print", which is what they do. This check
  couples the two: while FlowTracker still renders "Not built", no mark
  control may use the word "track". Build the module and delete that label,
  and this fails until the wording is revisited — which is the direction that
  gets forgotten.
*/
const flowTracker = read('src/pages/trace/FlowTracker.tsx');
const liveTape = read('src/pages/trace/LiveTape.tsx');
const drilldown = read('src/components/trace/PrintDrilldown.tsx');
const trackerUnbuilt = />Not built</.test(flowTracker);
/* The mechanism, not the desk's copy: while the marks are seeded from a bare
   `new Set()` they cannot survive a reload, whatever any page claims. Wire
   them to storage and this relaxes on its own. */
const marksEphemeral = /const \[marked, setMarked\] = useState<Set<number>>\(new Set\(\)\)/.test(liveTape);
const labelSrc = (src: string) =>
  [...src.matchAll(/(?:aria-label|title)=\{?[^}\n]*?(?:'|")([^'"]*)(?:'|")/g)].map(m => m[1]);
const marky = (src: string) =>
  labelSrc(src).filter(t => /\bmark(ed|s)?\b/i.test(t) || /\btrack(ing|s|ed)?\b/i.test(t));
const promises = [...marky(liveTape), ...marky(drilldown)].filter(t => /\btrack(ing|s|ed)?\b/i.test(t));
check(
  'the tape mark control was found',
  marky(liveTape).length > 0 && marky(drilldown).length > 0,
  `${marky(liveTape).length} on the tape, ${marky(drilldown).length} in the drilldown`
);
check(
  'no print control offers to track while the marks cannot survive a reload',
  !marksEphemeral || promises.length === 0,
  !marksEphemeral
    ? 'the marks are seeded from storage now — "track" is honest again'
    : promises.length
      ? `still promising: ${promises.join(' | ')}`
      : 'the controls say mark, and mark is what they do'
);
check(
  'the tracked-flow desk and the tape agree about what exists',
  trackerUnbuilt === marksEphemeral,
  trackerUnbuilt === marksEphemeral
    ? trackerUnbuilt
      ? 'TRACKED FLOW says "Not built" and the tape cannot persist a mark — consistent'
      : 'TRACKED FLOW has shipped and the tape persists its marks — consistent'
    : trackerUnbuilt
      ? 'the tape persists marks now, but /trace/tracker still says the module is not built'
      : 'TRACKED FLOW no longer says "Not built", but the tape still loses every mark on reload'
);
const sessionScoped = /\{marked\.size\} marked this session/.test(liveTape);
check(
  'the tape says its marks are session-scoped',
  sessionScoped,
  sessionScoped ? 'the footer counts "marked this session"' : 'the count no longer says the marks are ephemeral'
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
