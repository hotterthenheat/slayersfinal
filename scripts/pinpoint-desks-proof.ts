/*
  Structural proof for the rebuilt Pinpoint section (2026-09-06).

  Noah: "restart from 0 on that page … some of the things i have i cant
  understand … the placements are super bad." The rebuild's promises are
  structural and this pins them by reading the sources:

    · nine desks, each on the section's one placement grammar
    · every old path still lands somewhere
    · one colour doctrine — the flip is the same ink in the palette and
      in the tailwind token, and no desk invents a heat ramp
    · the deleted desks and the components only they used are gone, and
      nothing imports them
*/
import { existsSync, readFileSync } from 'node:fs';
import { DESK_GROUPS, GEX_SUBPAGES } from '../src/pages/pinpoint/subnav';
import { FLIP } from '../src/components/gex/palette';

let pass = 0,
  fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};
const read = (p: string) => readFileSync(p, 'utf8');

// ---- the rail -------------------------------------------------------------------
{
  /*
    THE COUNT WAS NEVER THE POINT, and pinning it said so out loud the day
    the rail changed: "nine desks" failed when the section grew an Exposure
    page and folded Heat into it, which is a rebuild working rather than a
    promise broken. What the rail actually owes a reader is that every desk
    has a place in a stated reading order, and that no two of them are the
    same page.
  */
  check('every desk has a distinct path under /pinpoint',
    new Set(GEX_SUBPAGES.map(p => p.path)).size === GEX_SUBPAGES.length && GEX_SUBPAGES.every(p => p.path.startsWith('/pinpoint/')),
    `${GEX_SUBPAGES.length} desks`);
  check('every desk belongs to a declared group',
    GEX_SUBPAGES.every(p => DESK_GROUPS.some(g => g.key === p.group)),
    GEX_SUBPAGES.map(p => p.group).join(' · '));
  /* The groups are the product's reading order — surface, then dynamics,
     then positioning, then history, then the model check. A rail that
     interleaved them would be a list of tabs wearing section labels. */
  {
    const order = DESK_GROUPS.map(g => g.key);
    const seen = GEX_SUBPAGES.map(p => p.group).filter((g, i, a) => g !== a[i - 1]);
    check('  · and the groups run in reading order, each contiguous',
      seen.length === new Set(seen).size && seen.every((g, i) => order.indexOf(g) >= (i ? order.indexOf(seen[i - 1]) : 0)),
      seen.join(' → '));
  }
  /* The surface is the front door: every other desk in this section is a
     question asked of it, so it cannot be the fourth tab along. */
  check('  · and the surface is the first of them', GEX_SUBPAGES[0].path === '/pinpoint/board', GEX_SUBPAGES[0].path);
  check('every desk is named for a question, in one word', GEX_SUBPAGES.every(p => /^[A-Z][a-z]+$/.test(p.label)));
  check('every desk carries a plain-English subtitle', GEX_SUBPAGES.every(p => p.subtitle.length > 30 && !/\bDEX\b|\bVEX\b/.test(p.subtitle)));
  check('every desk has an icon', GEX_SUBPAGES.every(p => typeof p.icon === 'function' || typeof p.icon === 'object'));
  /* Nine tabs is past SubNav's measured icon threshold, so the rail is
     typographic — nine glyphs at 14px in a row read as texture, and each of
     these tabs is a single word that does the icon's job better. */
  /* The rail is the section's own strip now (components/pinpoint/Strip.tsx),
     fused with the identity and the conditions on one hairline. It is
     typographic: nine one-word tabs need no glyph, and the group label
     beside each says where in the product a tab sits, which no icon can. */
  const strip = read('src/components/pinpoint/Strip.tsx');
  check('the rail is typographic — no icon beside a tab', !/page\.icon/.test(strip) && /GEX_SUBPAGES\.map/.test(strip), `${GEX_SUBPAGES.length} tabs`);
  check('  · and every desk is reachable below xl through one native select', /data-subnav-select/.test(strip));
}

// ---- every desk on one grammar ------------------------------------------------------
{
  /* The files behind the rail, plus Vol which the context strip links to.
     `Pain.tsx` still serves /pinpoint/holders — the DESK was renamed to the
     question it answers; the file keeps its history. */
  /*
    ══ THE BOARD IS THE SURFACE, NOT A DESK ══════════════════════════════════

    Every rule in this block describes a DESK: one Workspace, one of the three
    pictures, a Read on the scan tier, a loading state, groups of figures. It
    is a good grammar and nine pages obey it.

    The Board is the thing those nine ask questions OF, and it is shaped
    differently on purpose: one to five independent panels, each with its own
    symbol, expiry and window, each holding a strike ladder. Making it a
    Workspace would mean five Workspaces on a page the grammar says holds
    one, or one Workspace pretending a ladder is a StrikeProfile.

    It is checked instead by `scripts/pinpoint-board-proof.ts`, which holds
    the thing that actually matters about it — that every bar length and
    every badge comes out of the scoring pipeline — and by the restraint
    proof, which still applies its type, space, radius and no-box rules.
  */
  check('the Board exists and is the section\'s first page',
    existsSync('src/pages/pinpoint/Board.tsx') && GEX_SUBPAGES[0].path === '/pinpoint/board');
  const desks = ['Levels', 'Targets', 'Flow', 'Drift', 'Pain', 'Compare', 'Replay', 'Audit', 'Vol'];
  for (const d of desks) {
    const p = `src/pages/pinpoint/${d}.tsx`;
    check(`${d} exists`, existsSync(p));
    if (!existsSync(p)) continue;
    const src = read(p);
    /*
      ── THE GRAMMAR CHANGED UNDER THIS ASSERTION (2026-09-08) ─────────────
      It used to require `<Deck>` with a hero and a rail: a big picture up
      top, a column of small regions beside it, benches of more regions
      below. Three redesigns kept that skeleton and re-skinned it, and the
      third was told so: "no completely 100% redesign it."

      A desk is now ONE workspace — a toolbar, one picture that gets the
      window, an inspector of terse groups beside it, and a strip of
      figures under it. That is what this checks: the shape, not the
      spelling.
    */
    check(`${d} is one workspace`, /<Workspace\b/.test(src) && /\bpicture=/.test(src) && /\binspector=/.test(src));
    check(`${d} draws one of the three pictures`, /<StrikeProfile|<Series\b|<HeatField/.test(src));
    check(`${d} reads on the scan tier`, /useScanSnapshot\(/.test(src));
    check(`${d} has a loading state, not a blank`, /DataState kind="loading"/.test(src));
    check(`${d} takes its ink from the doctrine`, /components\/pinpoint\/ink'/.test(src));
    check(`${d} invents no heat ramp`, !/rgb\(2\d\d,\s*\d+,\s*\d+\)|#ff0000|#00ff00/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
    /*
      ── THIS ASSERTION USED TO REQUIRE PROSE, THEN RATION IT ──────────────
      The first version demanded a subtitle under 60% of the sections and
      got a template: every heading grew a second line restating it. The
      second capped the subtitles at half. Both were arguments about how
      much explaining a desk should do — and the answer the redesign
      settled on is ONE SENTENCE, in <Read>, at the foot beside the
      figures. Everything else on a desk is a label, a figure or a
      ten-pixel qualifier, which is the whole reason it fits on a screen.
    */
    const reads = (src.match(/<Read>/g) ?? []).length;
    check(`${d} explains itself in one sentence, or none`, reads <= 1, `${reads} reads`);
    const groups = (src.match(/<Group\b/g) ?? []).length;
    check(`${d} keeps its numbers in named groups`, groups >= 2, `${groups} groups`);
  }
}

// ---- every old path lands ----------------------------------------------------------
{
  const app = read('src/App.tsx');
  const old = ['exposure-profile', 'strike-profile', 'ranked-targets', 'expiry-ladder', 'oi-heat', 'vanna-charm', 'greek-surfaces', 'pain-map', 'history', 'model-error', 'vol-lab', 'vol-regime'];
  for (const o of old) {
    const re = new RegExp(`path="${o}" element=\\{<Navigate to="/pinpoint/(board|exposure|levels|targets|drift|holders|compare|replay|audit|vol)" replace />\\}`);
    check(`/pinpoint/${o} redirects to a desk`, re.test(app));
  }
  for (const p of GEX_SUBPAGES) {
    const leaf = p.path.replace('/pinpoint/', '');
    check(`${p.path} is routed`, new RegExp(`path="${leaf}" element=\\{<[A-Z]`).test(app));
  }
  /*
    THE SECTION OPENS ON THE BOARD, because the board IS the surface now —
    the ladder, what is changing across every window, and why a strike
    matters, on one page. Exposure was the landing while its strike x expiry
    grid was the section's picture; that grid multiplied one 0DTE number by a
    per-column decay, so the columns could not disagree with each other, and
    it has been replaced by a real chain per expiry.
  */
  check('the index lands on the board', /<Route index element=\{<Navigate to="\/pinpoint\/board" replace \/>\} \/>/.test(app));
  /* Every desk folded away still resolves — a saved link from last week
     lands on the page that absorbed it, not on a 404. MATRIX is here too:
     it was a top-level destination and its whole job is inside the board. */
  check('  · and the folded desks still land',
    /path="heat" element=\{<Navigate to="\/pinpoint\/board"/.test(app) &&
      /path="exposure" element=\{<Navigate to="\/pinpoint\/board"/.test(app) &&
      /path="pain" element=\{<Navigate to="\/pinpoint\/holders"/.test(app));
  check('  · including Matrix, which is no longer a place',
    /path="\/matrix" element=\{<Navigate to="\/pinpoint\/board" replace \/>\}/.test(app) &&
      !/label: 'Matrix'/.test(read('src/components/layout/nav.ts')));
  check('nothing outside App links to an old path', !/\/pinpoint\/(exposure-profile|ranked-targets|oi-heat|vanna-charm|expiry-ladder|greek-surfaces|pain-map|history|model-error|vol-lab|vol-regime)/.test(read('src/components/layout/CommandPalette.tsx') + read('src/pages/workspace/registry.tsx')));
}

// ---- one colour doctrine ---------------------------------------------------------------
{
  const tw = read('tailwind.config.ts');
  const token = /flip: '(#[0-9A-Fa-f]{6})'/.exec(tw)?.[1];
  check('the flip is one ink in the palette and the tailwind token', token !== undefined && token.toLowerCase() === FLIP.toLowerCase(), `${token} vs ${FLIP}`);
  check('and it is no longer grey', !/^#9CA3AF$/i.test(FLIP));
  const ink = read('src/components/pinpoint/ink.ts');
  check('the level inks are re-exported from the palette, not redefined', /export \{ CALL_WALL, FLIP, LONG_GAMMA, PUT_WALL, SHORT_GAMMA, SPOT, SUPREME \}/.test(ink));
  check('the heat ramp is left to heatmap.ts', !/heatRgb|heatCellStyle/.test(ink) && /heatmap\.ts/.test(ink));
}

// ---- the old desks are gone, and nothing wants them ------------------------------------
{
  const gone = [
    'src/pages/pinpoint/ExposureProfile.tsx',
    'src/pages/pinpoint/RankedTargets.tsx',
    'src/pages/pinpoint/ExpiryLadder.tsx',
    'src/pages/pinpoint/OiHeatScreen.tsx',
    'src/pages/pinpoint/VannaCharm.tsx',
    'src/pages/pinpoint/GreekSurfaces.tsx',
    'src/pages/pinpoint/PainMap.tsx',
    'src/pages/pinpoint/ExposureCompare.tsx',
    'src/pages/pinpoint/GexHistory.tsx',
    'src/pages/pinpoint/ModelError.tsx',
    'src/pages/pinpoint/VolLab.tsx',
    'src/pages/pinpoint/VolRegime.tsx',
    'src/components/gex/FlipGaugeStrip.tsx',
    'src/components/gex/ExposureInsight.tsx',
    'src/components/gex/OiHeatPanel.tsx',
    'src/components/gex/PressureMatrix.tsx',
  ];
  check('the twelve old desks and their orphans are deleted', gone.every(p => !existsSync(p)), gone.filter(p => existsSync(p)).join(', '));
  const app = read('src/App.tsx');
  check('App imports none of them', !/pages\/pinpoint\/(ExposureProfile|RankedTargets|ExpiryLadder|OiHeatScreen|VannaCharm|GreekSurfaces|PainMap|ExposureCompare|GexHistory|ModelError|VolLab|VolRegime)'/.test(app));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
