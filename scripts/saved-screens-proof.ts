/*
  Acceptance test for 6.2's saved screens.

  The store holds an OPAQUE state blob so a new filter on any Trace page
  needs no change there. What it does own is the part that is genuinely easy
  to get wrong — names, collisions, ordering, the cap, and surviving a
  corrupt or foreign value in localStorage without taking the page down.
*/
import {
  upsertScreen, removeScreen, cleanName, savedAgo, loadScreens, saveScreens,
  MAX_SAVED, MAX_NAME, type SavedScreen,
} from '../src/components/trace/savedScreens';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

// A localStorage that behaves, and one that does not.
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

// ── names ────────────────────────────────────────────────────────────────
{
  check('a name is trimmed and its whitespace collapsed', cleanName('  big   calls  ') === 'big calls', String(cleanName('  big   calls  ')));
  check('a whitespace-only name is refused', cleanName('   ') === null && cleanName('') === null);
  check('a long name is bounded', (cleanName('x'.repeat(200)) ?? '').length === MAX_NAME);
  check('saving with no name changes nothing', upsertScreen([], '  ', { a: 1 }).length === 0);
}

// ── collisions ───────────────────────────────────────────────────────────
{
  /*
    SAME NAME MEANS SAME QUESTION. Two entries a reader cannot tell apart is
    the failure — and case is not a distinction a person makes, so "Big
    calls" and "big calls" are one screen.
  */
  let s = upsertScreen<{ v: number }>([], 'Big calls', { v: 1 }, 1000);
  s = upsertScreen(s, 'big calls', { v: 2 }, 2000);
  check('a repeated name replaces rather than duplicates', s.length === 1, `${s.length} entries`);
  check('and it keeps the NEW state', s[0].state.v === 2);
  check('the surviving name is the one just typed', s[0].name === 'big calls', s[0].name);

  const two = upsertScreen(upsertScreen<{ v: number }>([], 'a', { v: 1 }, 1000), 'b', { v: 2 }, 2000);
  check('different names both survive', two.length === 2);
  check('newest first', two[0].name === 'b');
}

// ── the cap and ids ──────────────────────────────────────────────────────
{
  let s: SavedScreen<number>[] = [];
  for (let i = 0; i < MAX_SAVED + 8; i++) s = upsertScreen(s, `s${i}`, i, 1000 + i);
  check(`the shelf stops at ${MAX_SAVED}`, s.length === MAX_SAVED, `${s.length}`);
  check('and it is the OLDEST that fall off', s.every(x => x.name !== 's0'));
  check('ids are unique across the shelf', new Set(s.map(x => x.id)).size === s.length);

  /*
    THE ID IS A REACT KEY, so two saves inside one millisecond must not
    collide — a timestamp alone would, and duplicate keys silently hand one
    row another's state.
  */
  const a = upsertScreen<number>([], 'x', 1, 5000)[0];
  const b = upsertScreen<number>([], 'y', 2, 5000)[0];
  check('two saves in the same millisecond get different ids', a.id !== b.id, `${a.id} / ${b.id}`);

  check('removing takes exactly one', removeScreen(s, s[0].id).length === s.length - 1);
  check('removing an unknown id is a no-op', removeScreen(s, 'nope').length === s.length);
}

// ── the store survives what is actually in localStorage ─────────────────
{
  const K = 'proof_screens';
  check('an empty store reads as empty', loadScreens(K).length === 0);

  mem.set(K, 'not json at all {{{');
  check('unparseable JSON reads as empty rather than throwing', loadScreens(K).length === 0);

  mem.set(K, JSON.stringify({ not: 'an array' }));
  check('a non-array value reads as empty', loadScreens(K).length === 0);

  /*
    THE DANGEROUS CASE is not a value that fails to parse — it is one that
    parses into something ALMOST right, written by a different schema. Each
    entry is validated field by field and anything failing is dropped, never
    repaired into a plausible lie.
  */
  mem.set(K, JSON.stringify([
    { id: 'ok', name: 'good', state: { v: 1 }, savedAt: 2000 },
    { id: 'no-name', state: {}, savedAt: 1000 },
    { name: 'no id', state: {}, savedAt: 1000 },
    { id: 'x', name: 'bad time', state: {}, savedAt: 'yesterday' },
    { id: 'y', name: 'no state', savedAt: 1000 },
    null, 42, 'a string',
  ]));
  const loaded = loadScreens(K);
  check('only the well-formed entry survives a mixed store', loaded.length === 1 && loaded[0].id === 'ok',
    `${loaded.length} survived`);

  const round: SavedScreen<{ q: string }>[] = [{ id: 'r1', name: 'round trip', state: { q: 'NVDA' }, savedAt: 9000 }];
  saveScreens(K, round);
  check('a saved screen comes back with its state intact',
    loadScreens<{ q: string }>(K)[0]?.state.q === 'NVDA');

  // A store that throws on write must not take the page with it.
  const good = globalThis.localStorage;
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    ...good, setItem: () => { throw new Error('QuotaExceededError'); },
  } as Storage;
  let threw = false;
  try { saveScreens(K, round); } catch { threw = true; }
  check('a quota error does not escape the store', !threw);
  (globalThis as unknown as { localStorage: Storage }).localStorage = good;
}

// ── "saved when" ─────────────────────────────────────────────────────────
{
  const now = Date.UTC(2026, 8, 5, 12, 0, 0);
  check('a fresh save reads as just now', savedAgo(now - 5_000, now) === 'just now');
  check('minutes', savedAgo(now - 20 * 60_000, now) === '20m ago', savedAgo(now - 20 * 60_000, now));
  check('hours', savedAgo(now - 5 * 3_600_000, now) === '5h ago', savedAgo(now - 5 * 3_600_000, now));
  check('past a day and a half it gives a date instead of a big number',
    /^\d+ [A-Z][a-z]{2}$/.test(savedAgo(now - 5 * 86_400_000, now)), savedAgo(now - 5 * 86_400_000, now));
  check('a future stamp does not go negative', savedAgo(now + 60_000, now) === 'just now');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
