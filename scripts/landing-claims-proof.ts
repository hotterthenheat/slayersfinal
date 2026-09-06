/*
  Acceptance test for 13 — "Live sections MUST BE LABELED AS DEMO DATA."

  This is the only outward-facing honesty item on the checklist, and the
  most consequential: a visitor on a pricing page reading "live feed" will
  reasonably believe they are watching the market. They are watching the
  desk's simulator.

  WHAT IS TRUE AND WORTH KEEPING: the panels really are the product's own
  panels, really mounted, really recomputing every second. "Not
  screenshots. The actual panels, printing." is a true and good claim and
  survives untouched. What the page cannot claim is the source of the
  numbers inside them.

  The guard below is a text scan, which is the right shape here: the defect
  is a SENTENCE, it will be reintroduced by someone writing copy rather
  than code, and no runtime assertion can catch a false claim.
*/
import { readFileSync, readdirSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const files = readdirSync('src/pages/landing')
  .filter(f => f.endsWith('.tsx'))
  .map(f => ({ name: f, src: readFileSync(`src/pages/landing/${f}`, 'utf8') }));
check('PREMISE: the landing has copy to audit', files.length >= 5, `${files.length} files`);

// ── nothing claims a market feed ────────────────────────────────────────
{
  /*
    Only prose is scanned — a comment explaining WHY the phrase is banned
    would otherwise trip the check that bans it. Claims live in JSX text
    and in string literals a reader sees.
  */
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

  const BANNED = [
    { re: /live feed/i, why: 'says the numbers come from a market feed' },
    { re: /real[- ]?time (?:market|data|quotes|prices)/i, why: 'claims real-time market data' },
    { re: /live market data/i, why: 'claims live market data' },
  ];
  const hits: string[] = [];
  for (const f of files) {
    const prose = stripComments(f.src);
    for (const b of BANNED) {
      const m = prose.match(b.re);
      if (m) hits.push(`${f.name}: "${m[0]}" — ${b.why}`);
    }
  }
  check('no landing copy claims a market feed', hits.length === 0, hits.join(' | '));
}

// ── and the live section says what it is ────────────────────────────────
{
  const live = files.find(f => f.name === 'LiveSections.tsx')?.src ?? '';
  check('the live section labels itself demo data', /demo data/i.test(live));
  /* Twice: the panel grid and the chart showcase both made the claim, so
     both need the label — a page that is honest in one place and not the
     other is a page a reader can be misled by. */
  check('and does so everywhere it previously claimed otherwise',
    (live.match(/demo data/gi) ?? []).length >= 2,
    `${(live.match(/demo data/gi) ?? []).length} labels`);

  /*
    THE TRUE CLAIM SURVIVES. The panels genuinely are the product's,
    genuinely running — that is the impressive part and removing it would
    be over-correction, not honesty.
  */
  check('the honest claim is still made', /Not screenshots\. The actual panels, printing\./.test(live));
  check('and the panels really are mounted rather than imaged',
    /<GexMatrix/.test(live) && /EngineBox/.test(live) && !/<img/.test(live));
}

// ── the code rain does not impersonate data ─────────────────────────────
{
  /* Already deliberate and worth pinning: the rain is an illustration and
     the file says so. A decorative animation of scrolling figures is one
     misreading away from looking like a tape. */
  const rain = files.find(f => f.name === 'CodeRain.tsx')?.src ?? '';
  check("the code rain states it cannot impersonate live data", /impersonate live data/i.test(rain));
}

// ── the pill said "Live", which is the one word the page cannot use ─────
{
  const live = files.find(f => f.name === 'LiveSections.tsx')?.src ?? '';
  /* The pulse was honest: the panels really are updating. The WORD was a
     claim about a market feed, on a page whose own pricing FAQ says there
     is none — which made the pill the one thing on the landing
     contradicting the page's own answer. */
  const code = live.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  check('no panel is labelled "Live" on a page with no feed', !/>\s*Live\s*</.test(code), (code.match(/>\s*Live\s*</g) ?? []).join(' '));
  check('  · the pill says what is actually true instead', /Running · demo data/.test(live));
  check('  · and every section carrying panels is labelled', (live.match(/demo data/gi) ?? []).length >= 4, `${(live.match(/demo data/gi) ?? []).length} labels`);
}

// ── one demo must not take the whole page ───────────────────────────────
{
  const live = files.find(f => f.name === 'LiveSections.tsx')?.src ?? '';
  /* The route already has a boundary around the WHOLE landing, so a throw
     in any one demo replaced the hero, the pricing and the sign-up with a
     fault card. On the page where a reader is deciding whether to trust the
     product, that is the most expensive failure available. */
  check('every live section is on its own fuse', /const SectionGuard =/.test(live) && (live.match(/<SectionGuard /g) ?? []).length >= 4, `${(live.match(/<SectionGuard /g) ?? []).length} guarded`);
  check('  · and a section that faulted on a bad tick gets the next one', /resetKey=\{ctx \? 'scan' : 'cold'\}/.test(live));
}

// ── seeded community rows are examples, and say so ──────────────────────
{
  const community = readFileSync('src/data/community.ts', 'utf8');
  const landing = readFileSync('src/pages/landing/Landing.tsx', 'utf8');
  const ideas = readFileSync('src/pages/community/Ideas.tsx', 'utf8');
  /* Rows carrying an author handle, a vote count and an age are
     indistinguishable from posts people made. Unlabelled on the LANDING
     page — where a reader is deciding whether anyone is here — that is
     fabricated social proof, and it is the same failure as a quality bar
     drawn from a seed, on the surface where it does the most work. */
  check('the seeded rows are named as examples in one place', /export const SEED_NOTE/.test(community) && /export const isSeed/.test(community));
  check('  · the landing strip carries the label', /\{SEED_CHIP\}/.test(landing) && /\{SEED_NOTE\}/.test(landing));
  check('  · and the board marks an example where the handle is', /isSeed\(idea\.id\)/.test(ideas));
  /* The `seed-` id is the test, the same shape the report affordance uses
     for `you-`: an id is a fact about where a row came from, and a display
     name is something a future feed could hand back for anybody. */
  check('  · told apart by the id rather than the author string', /id\.startsWith\('seed-'\)/.test(community) && !/author === 'gammahunter'/.test(ideas));
  check('the label does not apologise for them', /useful as that|written examples of what a post/i.test(community));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
