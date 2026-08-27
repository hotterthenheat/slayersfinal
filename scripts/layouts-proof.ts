/*
  Acceptance test for T-18's named layouts. The module's own logic is
  storage, names and caps — pane validation is INJECTED (the desk's one
  readPane), so the proof stages its own validator and proves the module
  routes every stored pane through it.

  Proves:
  1. Save → persist → load round-trips, with every pane passed through the
     injected validator (a poisoned pane comes back healed, proving the
     validator really ran)
  2. Names: trimmed, length-capped, and a blank name is REFUSED
  3. The cap refuses a NEW thirteenth name but always allows overwriting an
     existing one — a refusal, never a silent eviction
  4. Delete removes exactly one; junk storage loads as empty; an entry with
     an illegal layout number is dropped alone
  5. Persisting an empty map removes the key rather than parking `{}`
*/
import {
  deleteNamedLayout, loadNamedLayouts, persistNamedLayouts, saveNamedLayout,
  LAYOUT_NAME_MAX, MAX_NAMED_LAYOUTS, NAMED_LAYOUTS_KEY,
} from '../src/pages/terrain/layouts';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

interface Pane { ticker: string; tf: string; }
const DEF: Pane = { ticker: 'SPY', tf: '1m' };
/* The staged validator: heals anything that is not a two-string pane. */
const readPane = (raw: unknown, def: Pane): Pane => {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Partial<Pane>;
  return { ticker: typeof c.ticker === 'string' ? c.ticker : def.ticker, tf: typeof c.tf === 'string' ? c.tf : def.tf };
};
const VALID = [1, 2, 3, 4];
const load = () => loadNamedLayouts(readPane, DEF, VALID);

// ── 1. the round trip, through the validator ──────────────────────────────
{
  const saved = saveNamedLayout({}, '  Morning 0DTE  ', 4, [{ ticker: 'QQQ', tf: '15s' }, { ticker: 'SPY', tf: '5m' }], 111);
  check('PREMISE: a save is accepted', saved !== null);
  persistNamedLayouts(saved!);
  const back = load();
  check('the name comes back trimmed', 'Morning 0DTE' in back, Object.keys(back).join(','));
  check('the arrangement round-trips whole', back['Morning 0DTE']?.layout === 4 && back['Morning 0DTE']?.panes[0].ticker === 'QQQ' && back['Morning 0DTE']?.savedAt === 111);

  /* Poison one stored pane and reload — the injected validator must heal
     it, which proves every pane actually goes through it. */
  const raw = JSON.parse(store.get(NAMED_LAYOUTS_KEY)!);
  raw['Morning 0DTE'].panes[1] = { ticker: 42, tf: null };
  store.set(NAMED_LAYOUTS_KEY, JSON.stringify(raw));
  const healed = load();
  check('a poisoned pane comes back healed by the INJECTED validator', healed['Morning 0DTE'].panes[1].ticker === 'SPY' && healed['Morning 0DTE'].panes[1].tf === '1m');
}

// ── 2. names ──────────────────────────────────────────────────────────────
{
  check('a blank name is refused', saveNamedLayout({}, '   ', 1, [], 1) === null);
  const long = saveNamedLayout({}, 'x'.repeat(80), 1, [], 1);
  check(`a long name is cut at ${LAYOUT_NAME_MAX}`, long !== null && Object.keys(long)[0].length === LAYOUT_NAME_MAX);
}

// ── 3. the cap refuses, never evicts ──────────────────────────────────────
{
  let map: NonNullable<ReturnType<typeof saveNamedLayout<Pane>>> = {};
  for (let i = 0; i < MAX_NAMED_LAYOUTS; i++) map = saveNamedLayout(map, `desk ${i}`, 1, [DEF], i)!;
  check(`PREMISE: ${MAX_NAMED_LAYOUTS} names fit`, Object.keys(map).length === MAX_NAMED_LAYOUTS);
  check('a new thirteenth is refused', saveNamedLayout(map, 'one more', 1, [DEF], 99) === null);
  const over = saveNamedLayout(map, 'desk 3', 2, [DEF], 99);
  check('overwriting an existing name is always allowed', over !== null && over['desk 3'].layout === 2);
  check('— and nothing was evicted for it', over !== null && Object.keys(over).length === MAX_NAMED_LAYOUTS);
}

// ── 4. junk and partial damage ────────────────────────────────────────────
{
  store.set(NAMED_LAYOUTS_KEY, 'not json');
  check('unparseable storage loads as empty, not a throw', Object.keys(load()).length === 0);
  store.set(NAMED_LAYOUTS_KEY, JSON.stringify({ good: { layout: 2, panes: [DEF], savedAt: 1 }, bad: { layout: 9, panes: [DEF], savedAt: 1 }, worse: { layout: 1, panes: 'nope', savedAt: 1 } }));
  const part = load();
  check('an illegal layout number is dropped ALONE', 'good' in part && !('bad' in part) && !('worse' in part), Object.keys(part).join(','));
}

// ── 5. delete, and the empty shelf ────────────────────────────────────────
{
  const two = saveNamedLayout(saveNamedLayout({}, 'a', 1, [DEF], 1)!, 'b', 2, [DEF], 2)!;
  const one = deleteNamedLayout(two, 'a');
  check('delete removes exactly one', !('a' in one) && 'b' in one);
  persistNamedLayouts(one);
  check('PREMISE: the key exists with one left', store.has(NAMED_LAYOUTS_KEY));
  persistNamedLayouts(deleteNamedLayout(one, 'b'));
  check('an empty shelf removes the key instead of parking {}', !store.has(NAMED_LAYOUTS_KEY));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
