/*
  Acceptance test for the drawings persistence layer — the validator that
  decides which stored marks survive a reload. It has been browser-tested
  only since drawings existed; T-2 (then the partner's round to thirteen) multiplying the kinds is what earns it a
  headless proof, because the validator is exactly where a new kind silently
  loses a reader's work (the T-0 pattern — loadDrawings once enumerated its
  kinds inline and would have dropped every stored measure).

  Proves:
  1. Every kind round-trips through save → JSON → load intact
  2. Each kind's REQUIRED fields are enforced — a channel without its width
     anchor, a note without words, a trend without its second point are
     dropped, not kept as shapes that render wrong or divide by nothing
  3. A malformed entry is dropped ALONE — one bad mark must not cost the
     reader the rest of them
  4. Junk shapes, junk kinds and junk containers all yield empty, not throws
  5. Saving none REMOVES the key rather than storing an empty list forever
*/
import { loadDrawings, saveDrawings, type Drawing } from '../src/components/gex/drawingsPrimitive';

/* The module reads the browser's localStorage; headless, it gets a faithful
   stand-in — same API, same string-only values. */
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

const P = (time: number, price: number) => ({ time, price });
const T0 = 1_700_000_000;

// ── 1. every kind round-trips ─────────────────────────────────────────────
{
  const all: Drawing[] = [
    { kind: 'trend', p1: P(T0, 100), p2: P(T0 + 600, 105) },
    { kind: 'hline', p1: P(T0, 102) },
    { kind: 'measure', p1: P(T0, 100), p2: P(T0 + 600, 103) },
    { kind: 'ray', p1: P(T0, 100), p2: P(T0 + 600, 104) },
    { kind: 'rect', p1: P(T0, 99), p2: P(T0 + 900, 106) },
    { kind: 'channel', p1: P(T0, 100), p2: P(T0 + 600, 104), p3: P(T0 + 300, 98) },
    { kind: 'fib', p1: P(T0, 95), p2: P(T0 + 600, 110) },
    { kind: 'note', p1: P(T0, 101), text: 'held here twice pre-market' },
    { kind: 'vline', p1: P(T0 + 300, 100) },
    { kind: 'extend', p1: P(T0, 100), p2: P(T0 + 600, 103) },
    { kind: 'arrow', p1: P(T0, 100), p2: P(T0 + 600, 96) },
    { kind: 'curve', p1: P(T0, 100), p2: P(T0 + 900, 104), p3: P(T0 + 450, 107) },
    { kind: 'ellipse', p1: P(T0, 99), p2: P(T0 + 900, 103) },
  ];
  saveDrawings('AAPL', all);
  const back = loadDrawings('AAPL');
  check('all thirteen kinds survive a save → load', back.length === all.length, `${back.length} of ${all.length}`);
  check('byte-for-byte', JSON.stringify(back) === JSON.stringify(all));
}

// ── 2. required fields, per kind ──────────────────────────────────────────
{
  const bad: unknown[] = [
    { kind: 'trend', p1: P(T0, 100) }, //           no second point
    { kind: 'measure', p1: P(T0, 100) }, //         a measure would divide by this
    { kind: 'ray', p1: P(T0, 100) },
    { kind: 'rect', p1: P(T0, 100) },
    { kind: 'fib', p1: P(T0, 100) },
    { kind: 'channel', p1: P(T0, 100), p2: P(T0 + 600, 104) }, // no width anchor
    { kind: 'note', p1: P(T0, 100) }, //            no words
    { kind: 'note', p1: P(T0, 100), text: '   ' }, // whitespace is not words
    { kind: 'extend', p1: P(T0, 100) },
    { kind: 'arrow', p1: P(T0, 100) },
    { kind: 'ellipse', p1: P(T0, 100) },
    { kind: 'curve', p1: P(T0, 100), p2: P(T0 + 600, 104) }, // no bend anchor
  ];
  saveDrawings('MSFT', bad as Drawing[]);
  const back = loadDrawings('MSFT');
  check('a mark missing what its kind requires is dropped', back.length === 0, `${back.length} kept`);

  /* And the one-anchor kinds really are complete without a p2 — the rule is
     per kind, not a blanket "two points or out". */
  saveDrawings('MSFT', [{ kind: 'hline', p1: P(T0, 100) }, { kind: 'vline', p1: P(T0, 100) }]);
  check('while an hline and a vline are whole with one point', loadDrawings('MSFT').length === 2);
}

// ── 3. one bad mark does not cost the rest ────────────────────────────────
{
  const mixed: unknown[] = [
    { kind: 'trend', p1: P(T0, 100), p2: P(T0 + 600, 105) },
    { kind: 'channel', p1: P(T0, 100), p2: P(T0 + 600, 104) }, // dropped
    { kind: 'note', p1: P(T0, 101), text: 'kept' },
    { kind: 'hologram', p1: P(T0, 100) }, //                      dropped
  ];
  saveDrawings('NVDA', mixed as Drawing[]);
  const back = loadDrawings('NVDA');
  check('the good marks around a bad one survive', back.length === 2, back.map(d => d.kind).join(','));
}

// ── 4. junk in, empty out ─────────────────────────────────────────────────
{
  store.set('slayer_chart_drawings_JUNK1', '{"not":"an array"}');
  store.set('slayer_chart_drawings_JUNK2', 'not json at all');
  store.set('slayer_chart_drawings_JUNK3', '[null, 42, "x", {"kind":"trend","p1":{"time":"t","price":"p"},"p2":{}}]');
  check('a non-array yields nothing', loadDrawings('JUNK1').length === 0);
  check('unparseable storage yields nothing rather than throwing', loadDrawings('JUNK2').length === 0);
  check('typed junk inside the array yields nothing', loadDrawings('JUNK3').length === 0);
  check('a name with nothing stored yields nothing', loadDrawings('NEVER').length === 0);
}

// ── 5. clearing removes the key ───────────────────────────────────────────
{
  saveDrawings('TSLA', [{ kind: 'hline', p1: P(T0, 100) }]);
  check('PREMISE: the key exists after a save', store.has('slayer_chart_drawings_TSLA'));
  saveDrawings('TSLA', []);
  check('saving none removes the key instead of parking an empty list', !store.has('slayer_chart_drawings_TSLA'));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
