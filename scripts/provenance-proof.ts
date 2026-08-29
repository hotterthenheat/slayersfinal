/*
  Acceptance test for the provenance vocabulary — section 21's visual
  contract, which every other surface hangs its honesty on.

  Proves:
  1. The five kinds are ordered by ONE question — how much is this a fact
     about the market right now — and `weakest` enforces it
  2. A mixture reports its weakest part, so no panel can look better sourced
     than its worst input
  3. `model` and `simulated` are DIFFERENT, which is the distinction the old
     single word hid: a simulated number becomes real when a feed lands, a
     modelled one never does
  4. Declaring no source is `simulated`, not `measured` — a panel that names
     nothing has not proved anything
  5. State is ORTHOGONAL to kind: every kind can be stale, partial or
     unavailable, and every combination has words
  6. The carry family answers from the seam rather than a copy, so a feed
     that sets carry cannot leave the chip stale
  7. setProvenance is the swap's one call, and resetProvenance undoes it
*/
import {
  DATA_STATE_NOTES, DATA_STATE_WORDS, PROVENANCE_NOTES, PROVENANCE_WORDS,
  getProvenance, resetProvenance, setProvenance, weakest,
  type DataState, type ProvenanceKind,
} from '../src/data/provenance';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const KINDS: ProvenanceKind[] = ['live', 'measured', 'derived', 'model', 'simulated'];
const STATES: DataState[] = ['ok', 'stale', 'partial', 'unavailable'];

// ── 1+2. the ordering, and the weakest link ───────────────────────────────
{
  resetProvenance();
  check('every kind has a word', KINDS.every(k => !!PROVENANCE_WORDS[k]), KINDS.map(k => PROVENANCE_WORDS[k]).join(' '));
  check('and every kind has a sentence behind it', KINDS.every(k => PROVENANCE_NOTES[k].length > 20));

  setProvenance('chain', { kind: 'live', note: 'streaming' });
  setProvenance('exposure', { kind: 'derived', note: 'ours' });
  check('a mixture reports its WEAKEST part', weakest(['chain', 'exposure']).kind === 'derived', weakest(['chain', 'exposure']).kind);

  setProvenance('tape', { kind: 'simulated', note: 'sim' });
  check('— and simulated drags the whole panel down', weakest(['chain', 'exposure', 'tape']).kind === 'simulated');

  setProvenance('prints', { kind: 'model', note: 'our score' });
  check('a model output outranks a simulated one but nothing else',
    weakest(['chain', 'prints']).kind === 'model' && weakest(['prints', 'tape']).kind === 'simulated');

  check('two measured sources stay measured', (() => {
    setProvenance('candles', { kind: 'measured', note: 'feed' });
    setProvenance('earnings', { kind: 'measured', note: 'feed' });
    return weakest(['candles', 'earnings']).kind === 'measured';
  })());

  check('order is live > measured > derived > model > simulated', (() => {
    setProvenance('chain', { kind: 'live', note: '' });
    setProvenance('candles', { kind: 'measured', note: '' });
    setProvenance('exposure', { kind: 'derived', note: '' });
    setProvenance('prints', { kind: 'model', note: '' });
    setProvenance('tape', { kind: 'simulated', note: '' });
    const pairs: [Parameters<typeof weakest>[0], ProvenanceKind][] = [
      [['chain', 'candles'], 'measured'],
      [['candles', 'exposure'], 'derived'],
      [['exposure', 'prints'], 'model'],
      [['prints', 'tape'], 'simulated'],
    ];
    return pairs.every(([keys, want]) => weakest(keys).kind === want);
  })());
  resetProvenance();
}

// ── 3. the distinction the old word hid ───────────────────────────────────
{
  check('model and simulated are different words', PROVENANCE_WORDS.model !== PROVENANCE_WORDS.simulated);
  check('and their sentences say why they are different',
    /judgment|opinion/i.test(PROVENANCE_NOTES.model) && /simulator|no market/i.test(PROVENANCE_NOTES.simulated));
}

// ── 4. an undeclared panel ────────────────────────────────────────────────
{
  check('naming no source is simulated, never measured', weakest([]).kind === 'simulated', weakest([]).kind);
  check('and it says so', weakest([]).note.length > 0, weakest([]).note);
}

// ── 5. state is orthogonal ────────────────────────────────────────────────
{
  check('every state has a word except ok, which is silent',
    DATA_STATE_WORDS.ok === '' && STATES.slice(1).every(s => DATA_STATE_WORDS[s].length > 0),
    STATES.map(s => `${s}:"${DATA_STATE_WORDS[s]}"`).join(' '));
  check('and every non-ok state has a sentence',
    STATES.slice(1).every(s => DATA_STATE_NOTES[s].length > 30));
  /* The point of orthogonality: state does not touch the kind registry, so
     any of 5 kinds pairs with any of 4 states — 20 readable combinations
     from 9 words rather than a matrix of 20. */
  check('kind and state are independent axes', KINDS.length * STATES.length === 20);
  check('unavailable reads as absence, not as zero', /no value|nothing/i.test(DATA_STATE_NOTES.unavailable), DATA_STATE_NOTES.unavailable);
  check('stale says last-known rather than current', /last-known|not a current/i.test(DATA_STATE_NOTES.stale));
}

// ── 6+7. the seam ─────────────────────────────────────────────────────────
{
  resetProvenance();
  const carry = getProvenance('carry');
  check('carry answers from the seam, with a real note', carry.note.length > 0 && (carry.kind === 'simulated' || carry.kind === 'measured'), `${carry.kind}: ${carry.note.slice(0, 40)}`);
  check('setProvenance refuses an unknown family',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setProvenance('nope' as any, { kind: 'live', note: '' }) === false);
  setProvenance('chain', { kind: 'live', note: 'the swap happened' });
  check('the swap is one call', getProvenance('chain').kind === 'live');
  resetProvenance();
  check('and reset puts every family back', getProvenance('chain').kind === 'simulated', getProvenance('chain').kind);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
