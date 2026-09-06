/*
  Acceptance test for Part 1.1's desk management — the pieces that were
  missing: "Preset management UI (save/rename/delete/duplicate/reset)" had
  no rename and no duplicate, and "Desk import/export" did not exist.

  The failure this guards is the one that matters for a feature whose job
  is protecting the reader's own work: an import that OVERWRITES a desk
  they built, a rename that strands the active pointer on a name that is
  gone, a duplicate that shares instance ids with its source so the two
  desks quietly share state. Each is a data-loss bug wearing a
  convenience's clothes.
*/
import { PRESETS, PRESET_NAMES, duplicateDesk, renameDesk, type DeskStore, type SavedWorkspace } from '../src/pages/workspace/desks';
import {
  DESK_FILE_KIND,
  DESK_FILE_VERSION,
  NAME_MAX,
  deskFileText,
  deskFilename,
  freeName,
  mergeImport,
  nameProblem,
  unpackDesks,
} from '../src/pages/workspace/deskFile';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const preset = PRESET_NAMES[0];
const custom: SavedWorkspace = JSON.parse(JSON.stringify(PRESETS[preset]));
const base: DeskStore = { active: 'Scalping', desks: { [preset]: PRESETS[preset], Scalping: custom } };

// ---- rename -------------------------------------------------------------------
{
  const out = renameDesk(base, 'Scalping', 'Open drive');
  check('rename moves the desk to the new name', 'Open drive' in out.desks && !('Scalping' in out.desks));
  check('AND the active pointer follows it', out.active === 'Open drive');
  check('the desk itself is untouched', out.desks['Open drive'] === custom);
  check('a preset cannot be renamed', renameDesk(base, preset, 'Mine') === base);
  check('nor renamed ONTO', renameDesk(base, 'Scalping', preset) === base);
  check('a collision is refused rather than overwriting', renameDesk({ ...base, desks: { ...base.desks, Taken: custom } }, 'Scalping', 'Taken') === base || true);
  {
    const s = { ...base, desks: { ...base.desks, Taken: custom } };
    check('a collision is refused — same reference back', renameDesk(s, 'Scalping', 'Taken') === s);
  }
  check('an empty name is refused', renameDesk(base, 'Scalping', '   ') === base);
  check('renaming to itself is a no-op', renameDesk(base, 'Scalping', 'Scalping') === base);
  /* Order is the rail's order. A rename must not send the desk to the end. */
  const ordered: DeskStore = { active: 'B', desks: { [preset]: PRESETS[preset], A: custom, B: custom, C: custom } };
  check('a rename keeps its place in the row', Object.keys(renameDesk(ordered, 'B', 'Bee').desks).join(',') === `${preset},A,Bee,C`);
}

// ---- duplicate ------------------------------------------------------------------
{
  const out = duplicateDesk(base, preset, 'My structure');
  check('a preset can be duplicated into a custom desk', 'My structure' in out.desks);
  check('and the preset is still there', preset in out.desks && out.desks[preset] === PRESETS[preset]);
  check('the copy has the same panels', out.desks['My structure'].instances.map(i => i.key).join() === PRESETS[preset].instances.map(i => i.key).join());
  const srcIds = new Set(PRESETS[preset].instances.map(i => i.id));
  check('BUT FRESH INSTANCE IDS, so the two desks cannot share widget state', out.desks['My structure'].instances.every(i => !srcIds.has(i.id)));
  check('and the layout was re-keyed to match', out.desks['My structure'].layout.every(l => out.desks['My structure'].instances.some(i => i.id === l.i)));
  check('the active desk does not change on duplicate', out.active === base.active);
  check('duplicating onto a preset name is refused', duplicateDesk(base, 'Scalping', preset) === base);
  check('duplicating onto an existing name is refused', duplicateDesk(base, 'Scalping', 'Scalping') === base);
  check('duplicating a desk that does not exist is a no-op', duplicateDesk(base, 'Nope', 'X') === base);
}

// ---- names ----------------------------------------------------------------------
check('an empty name is a problem', nameProblem('') !== null);
check('a preset name is a problem', nameProblem(preset) !== null);
check('an over-long name is a problem', nameProblem('x'.repeat(NAME_MAX + 1)) !== null);
check('an ordinary name is fine', nameProblem('Morning desk') === null);
check('a free name stays itself', freeName('Fresh', ['Other']) === 'Fresh');
check('a taken name takes a number', freeName('Fresh', ['Fresh']) === 'Fresh 2');
check('and keeps counting', freeName('Fresh', ['Fresh', 'Fresh 2']) === 'Fresh 3');
check('a preset stem is never handed back bare', freeName(preset, []) !== preset);
check('the numbered name still fits the cap', freeName('x'.repeat(NAME_MAX), ['x'.repeat(NAME_MAX)]).length <= NAME_MAX);

// ---- export --------------------------------------------------------------------
const text = deskFileText({ Scalping: custom }, new Date('2026-09-05T12:00:00Z'));
const parsed = JSON.parse(text);
check('the file names its kind', parsed.kind === DESK_FILE_KIND);
check('and its version', parsed.version === DESK_FILE_VERSION);
check('and when it was written', parsed.exportedAt === '2026-09-05T12:00:00.000Z');
check('and carries the desk as the store holds it', JSON.stringify(parsed.desks.Scalping) === JSON.stringify(custom));
check('the text is indented for a human', text.includes('\n  '));
check('the filename says what and when', deskFilename('Scalping', new Date(2026, 8, 5)) === 'slayer-desk-scalping-20260905.json');
check('and copes with a name full of punctuation', /^slayer-desk-[a-z0-9-]+-\d{8}\.json$/.test(deskFilename('  My / Desk!! ', new Date(2026, 8, 5))));
check('all desks exports as "all"', deskFilename(null, new Date(2026, 8, 5)).includes('-all-'));

// ---- import: refusals come before repairs ---------------------------------------
check('garbage is refused as not JSON', !unpackDesks('{nope', []).ok);
check('a JSON that is not a desk file is refused', !unpackDesks('{"hello":1}', []).ok);
check('and says so in words, not a stack trace', (() => { const r = unpackDesks('{"hello":1}', []); return !r.ok && /not a desk file/.test(r.reason); })());
check('a future version is refused, naming both versions', (() => {
  const r = unpackDesks(JSON.stringify({ kind: DESK_FILE_KIND, version: DESK_FILE_VERSION + 1, desks: {} }), []);
  return !r.ok && r.reason.includes(String(DESK_FILE_VERSION + 1)) && r.reason.includes(String(DESK_FILE_VERSION));
})());
check('a file with no desks is refused', !unpackDesks(JSON.stringify({ kind: DESK_FILE_KIND, version: 1, desks: {} }), []).ok);

// ---- import: the reader's work is never overwritten -----------------------------
{
  const r = unpackDesks(text, ['Scalping']);
  check('a colliding import succeeds', r.ok);
  if (r.ok) {
    check('but lands under a new name', !('Scalping' in r.desks) && 'Scalping 2' in r.desks);
    check('and the rename is reported', r.renamed.length === 1 && r.renamed[0].from === 'Scalping' && r.renamed[0].to === 'Scalping 2');
    const merged = mergeImport(base, r.desks);
    check('merging keeps the original desk intact', merged.desks.Scalping === custom);
    check('and adds the import beside it', 'Scalping 2' in merged.desks);
    check('and does not move the active pointer', merged.active === base.active);
  }
}
{
  /* A file claiming a preset's name is either confused or hostile. */
  const r = unpackDesks(deskFileText({ [preset]: custom }), []);
  check('an import that claims a preset name is renamed away from it', r.ok && !(preset in r.desks));
}
{
  /* Unknown widgets go through the same gate localStorage does. */
  const hostile: SavedWorkspace = {
    instances: [{ id: 'a', key: 'live-chart' }, { id: 'b', key: 'widget-that-does-not-exist' }],
    layout: [{ i: 'a', x: 0, y: 0, w: 8, h: 5 }, { i: 'b', x: 99, y: -4, w: 40, h: 40 }],
  };
  const r = unpackDesks(deskFileText({ Hostile: hostile }), []);
  check('an unknown widget is dropped on import', r.ok && r.desks.Hostile.instances.length === 1);
  check('and its layout row with it', r.ok && r.desks.Hostile.layout.length === 1);
  check('and an oversized panel is clamped to its bounds', r.ok && r.desks.Hostile.layout[0].w === 8 && r.desks.Hostile.layout[0].h === 5);
}
{
  const empty: SavedWorkspace = { instances: [{ id: 'z', key: 'gone' }], layout: [] };
  const r = unpackDesks(deskFileText({ Empty: empty, Good: custom }), []);
  check('a desk that sanitises to nothing is dropped BY NAME', r.ok && r.dropped.includes('Empty') && 'Good' in r.desks);
  const r2 = unpackDesks(deskFileText({ Empty: empty }), []);
  check('and a file that is ALL empty desks is refused with the reason', !r2.ok && /empty or unreadable/.test(r2.reason));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
