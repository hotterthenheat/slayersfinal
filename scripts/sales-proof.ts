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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
