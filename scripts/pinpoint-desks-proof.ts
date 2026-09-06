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
import { GEX_SUBPAGES } from '../src/pages/pinpoint/subnav';
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
  check('nine desks', GEX_SUBPAGES.length === 9, String(GEX_SUBPAGES.length));
  check('every desk has a distinct path under /pinpoint', new Set(GEX_SUBPAGES.map(p => p.path)).size === 9 && GEX_SUBPAGES.every(p => p.path.startsWith('/pinpoint/')));
  check('every desk is named for a question, in one word', GEX_SUBPAGES.every(p => /^[A-Z][a-z]+$/.test(p.label)));
  check('every desk carries a plain-English subtitle', GEX_SUBPAGES.every(p => p.subtitle.length > 30 && !/\bDEX\b|\bVEX\b/.test(p.subtitle)));
  check('every desk has an icon', GEX_SUBPAGES.every(p => typeof p.icon === 'function' || typeof p.icon === 'object'));
  const sub = read('src/components/ui/SubNav.tsx');
  const limit = Number(/ICON_LIMIT = (\d+)/.exec(sub)?.[1] ?? 0);
  check('the rail shows icons for nine', limit >= 9, `ICON_LIMIT ${limit}`);
}

// ---- every desk on one grammar ------------------------------------------------------
{
  const desks = ['Levels', 'Targets', 'Heat', 'Drift', 'Pain', 'Compare', 'Replay', 'Audit', 'Vol'];
  for (const d of desks) {
    const p = `src/pages/pinpoint/${d}.tsx`;
    check(`${d} exists`, existsSync(p));
    if (!existsSync(p)) continue;
    const src = read(p);
    check(`${d} is a hero + rail + benches desk`, /<Deck hero=\{hero\} rail=\{rail\}>/.test(src));
    check(`${d} reads on the scan tier`, /useScanSnapshot\(/.test(src));
    check(`${d} has a loading state, not a blank`, /DataState kind="loading"/.test(src));
    check(`${d} takes its ink from the doctrine`, /components\/pinpoint\/ink'/.test(src));
    check(`${d} invents no heat ramp`, !/rgb\(2\d\d,\s*\d+,\s*\d+\)|#ff0000|#00ff00/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
    const sections = (src.match(/<Section\b/g) ?? []).length;
    const questions = (src.match(/\bquestion=/g) ?? []).length;
    check(`${d}'s sections mostly say what they answer`, sections > 0 && questions >= Math.floor(sections * 0.6), `${questions} of ${sections}`);
  }
}

// ---- every old path lands ----------------------------------------------------------
{
  const app = read('src/App.tsx');
  const old = ['exposure-profile', 'strike-profile', 'ranked-targets', 'expiry-ladder', 'oi-heat', 'vanna-charm', 'greek-surfaces', 'pain-map', 'history', 'model-error', 'vol-lab', 'vol-regime'];
  for (const o of old) {
    const re = new RegExp(`path="${o}" element=\\{<Navigate to="/pinpoint/(levels|targets|heat|drift|pain|compare|replay|audit|vol)" replace />\\}`);
    check(`/pinpoint/${o} redirects to a desk`, re.test(app));
  }
  for (const p of GEX_SUBPAGES) {
    const leaf = p.path.replace('/pinpoint/', '');
    check(`${p.path} is routed`, new RegExp(`path="${leaf}" element=\\{<[A-Z]`).test(app));
  }
  check('the index lands on Levels', /<Route index element=\{<Navigate to="\/pinpoint\/levels" replace \/>\} \/>/.test(app));
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
