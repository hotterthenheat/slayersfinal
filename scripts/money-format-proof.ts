/*
  Acceptance test for 0.11's number formatting.

    "Large-number formatting consistent across panels (fmtUsd exists in
     data/gex.ts — make it the single source; several panels format
     inline)."
    "Sign display: explicit +/−, never color alone."

  The two are one problem. Four surfaces had each wrapped their own
  hand-rolled formatter in `${v >= 0 ? '+' : '−'}$...` at three different
  precisions, so the same magnitude read $1.2M on one page and $1.24M on
  another — and each did it because the shared formatter could not emit a
  leading plus. Fixing the source fixes the copies.
*/
import { readFileSync, readdirSync } from 'node:fs';
import { fmtUsd, fmtUsdSigned } from '../src/data/gex';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

// ── the minus is a minus ────────────────────────────────────────────────
{
  /*
    U+2212, not a hyphen. In a tabular font a hyphen is narrower than a
    digit and a minus is exactly a digit wide, so a column of negatives set
    with hyphens fails to line up with the positives above it — the one
    thing tabular figures exist to provide. Several callers had already
    worked around this by formatting their own negatives.
  */
  check('a negative uses U+2212, not a hyphen',
    fmtUsd(-1.2e6).startsWith('−') && !fmtUsd(-1.2e6).includes('-'),
    fmtUsd(-1.2e6));
  check('and the signed form agrees', fmtUsdSigned(-1.2e6) === fmtUsd(-1.2e6));
  check('a positive is unsigned in the plain form', fmtUsd(1.2e6) === '$1.2M');
}

// ── the explicit sign ───────────────────────────────────────────────────
{
  /*
    A green +$4.2M and a red $4.2M are the SAME STRING to anyone who cannot
    separate the two colours, on a screen where colour is the only
    difference. That is 0.11's sign rule and 0.13's colour rule at once.
  */
  check('a positive carries an explicit plus', fmtUsdSigned(4.2e6) === '+$4.2M', fmtUsdSigned(4.2e6));
  check('a negative carries a minus', fmtUsdSigned(-4.2e6) === '−$4.2M', fmtUsdSigned(-4.2e6));
  check('the two differ by more than colour would',
    fmtUsdSigned(4.2e6) !== fmtUsdSigned(-4.2e6).replace('−', '+').replace('+', ''));

  /* ZERO HAS NO DIRECTION. +$0 and −$0 are both wrong: printing one invents
     a lean the data does not have. */
  check('zero is neither', fmtUsdSigned(0) === '$0', fmtUsdSigned(0));
  check('and the caller can name what zero should read as',
    fmtUsdSigned(0, 'flat') === 'flat');
  check('a non-finite figure falls back rather than printing NaN',
    fmtUsdSigned(NaN) === '$0' && fmtUsdSigned(Infinity) === '$0');
}

// ── the tiers ───────────────────────────────────────────────────────────
{
  check('thousands', fmtUsd(4_200) === '$4.2K');
  check('millions', fmtUsd(4_200_000) === '$4.2M');
  check('billions', fmtUsd(4.2e9) === '$4.2B');
  check('below a thousand shows whole dollars', fmtUsd(942) === '$942');
  check('the boundaries land on the higher tier',
    fmtUsd(1e3) === '$1.0K' && fmtUsd(1e6) === '$1.0M' && fmtUsd(1e9) === '$1.0B');
}

// ── the inline copies are gone from the money surfaces ─────────────────
{
  /*
    Checked by reading the files rather than by trusting the diff. The
    pattern is a hand-built sign wrapper around a hand-built division —
    exactly what the shared formatter now replaces.
  */
  const MONEY_PAGES = [
    'src/pages/Stocks.tsx',
    'src/pages/EarningsDossier.tsx',
    'src/pages/pinpoint/ExpiryLadder.tsx',
  ];
  for (const p of MONEY_PAGES) {
    const src = readFileSync(p, 'utf8');
    const short = p.split('/').pop();
    check(`${short} no longer hand-signs a hand-divided figure`,
      !/\? '\+' : '−'\}\$\{\(Math\.abs/.test(src));
    check(`${short} uses the shared signed formatter`, /fmtUsdSigned\(/.test(src));
  }

  /* TickerOverview keeps its own, and the file has to say why — an
     undocumented duplicate is the thing 0.11 is complaining about, and a
     documented one with a stated reason is a decision. */
  const to = readFileSync('src/pages/TickerOverview.tsx', 'utf8');
  check('the one surviving local formatter explains itself',
    /MARKET CAPS REACH TRILLIONS/.test(to) && /TWO DECIMALS/.test(to));
  check('and it uses the same minus as the shared one', to.includes("'−'"));
}

// ── nothing new has crept in ────────────────────────────────────────────
{
  /*
    A guard for the next page rather than a report on this one: any NEW
    hand-signed, hand-divided money figure fails here. Share counts and
    volumes are excluded — they are not dollars and must not carry a $.
  */
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${f.name}`;
      if (f.isDirectory()) { walk(p); continue; }
      if (!p.endsWith('.tsx')) continue;
      const src = readFileSync(p, 'utf8');
      for (const line of src.split('\n')) {
        /* A LITERAL DOLLAR SIGN, not a template interpolation. The first
           version of this pattern started `\$\{`, which matches `${...}`
           in any template string — so it flagged Terrain's `fmtVol` and
           EtfExposurePanel's `fmtShares`, both of which format SHARE
           COUNTS and both of which carry a comment saying `fmtUsd` would
           wrongly print a currency symbol in front of a volume. They were
           right and the check was wrong. Money is `$${...}`. */
        if (/\$\$\{\(?(Math\.abs\()?[\w.]+ \/ 1e[69]\)?\.toFixed/.test(line)) {
          if (!p.includes('TickerOverview')) offenders.push(`${p.split('/').pop()}: ${line.trim().slice(0, 60)}`);
        }
      }
    }
  };
  walk('src/pages');
  walk('src/components');
  check('no page divides and formats its own dollars', offenders.length === 0,
    offenders.slice(0, 3).join(' | '));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
