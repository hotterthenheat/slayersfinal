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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
