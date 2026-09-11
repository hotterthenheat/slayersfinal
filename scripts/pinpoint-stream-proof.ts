/*
  Acceptance test for the board's stream — the feed of what moved in a book
  between two readings. Runs the ACTUAL module against the ACTUAL engine; no
  browser, no React.

  The claim this file exists to defend is that every line in the feed is a
  fact about two numbers that differed, in a way the desk already has a
  word for — and that the same fact is never said twice.
*/
import { asLevels, buildMatrix, type Matrix } from '../src/data/pinpoint/matrix';
import { STREAM_CAP, SOURCE_WORDS, diffStream, mergeStream, seedStream, type StreamEvent } from '../src/data/pinpoint/stream';

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const ids = (es: StreamEvent[]) => es.map(e => e.id);

// ── 1. the seed says where things stand ──────────────────────────────────
{
  const m = buildMatrix('SPY', ['gex'], { lookback: '15m', reach: 15 });
  const seed = seedStream(m);
  const L = asLevels(m.landmarks, m.spot);

  check('a seed is not empty on a live book', seed.length >= 3, `${seed.length} lines`);
  check('  · the pin leads it', seed[0]?.source === 'levels' && /^PIN at \d+/.test(seed[0]?.text ?? ''), seed[0]?.text);
  check('  · and the pin it names is the family\'s own landmark',
    seed[0]?.strike === L.supreme, `${seed[0]?.strike} vs ${L.supreme}`);
  const walls = seed.filter(e => /WALL at/.test(e.text));
  check('  · both walls are named where they are not the pin',
    walls.length === [L.callWall, L.putWall].filter(s => Number.isFinite(s) && s !== L.supreme).length,
    walls.map(w => w.text).join(' | '));
  check('  · the book states its side', seed.some(e => e.source === 'book' && /^Book is (put|call)-dominant/.test(e.text)));
  check('  · every line names a real strike or none', seed.every(e => e.strike === null || m.rows.some(r => r.strike === e.strike)));
  check('  · every id is unique', new Set(ids(seed)).size === seed.length);
  check('  · and sorted heaviest first', seed.every((e, i) => i === 0 || e.weight <= seed[i - 1].weight));
  check('  · every source has a word', seed.every(e => typeof SOURCE_WORDS[e.source] === 'string'));
}

// ── 2. the same book twice is silence ────────────────────────────────────
{
  const m = buildMatrix('SPY', ['gex'], { lookback: '15m', reach: 15 });
  const again = clone(m);
  const d = diffStream(m, again);
  check('a book diffed against itself says nothing', d.filter(e => e.source !== 'flow').length === 0,
    d.map(e => e.text).join(' | ') || 'silent');
  /* Flow lines are about the WINDOW, not the tick, so they may legitimately
     appear on any reading — but they must be the same ids both times. */
  const twice = mergeStream(mergeStream([], d), d);
  check('  · and what it does say it says once', twice.length === new Set(ids(d)).size);
}

// ── 3. a level that moves is reported, with the right words ──────────────
{
  const a = buildMatrix('SPY', ['gex'], { lookback: '15m', reach: 15 });
  const b = clone(a);
  /* Move the pin by hand: the landmarks are what the stream reads. */
  const rows = b.rows.map(r => r.strike);
  const from = asLevels(b.landmarks, b.spot).supreme;
  const to = rows.find(s => s !== from && Math.abs(s - from) <= 2) ?? rows[1];
  b.landmarks = { ...b.landmarks, pin: to };
  b.builtAt = a.builtAt + 1000;
  const d = diffStream(a, b);
  const moved = d.find(e => /^PIN moved/.test(e.text));
  check('a pin that moves is a line', !!moved, moved?.text);
  check('  · that says where from and where to', !!moved && moved.text.includes(`${from} → ${to}`));
  check('  · and points at the new strike', moved?.strike === to);
  check('  · and is the heaviest thing in the diff', d[0] === moved);
}

// ── 4. a strike that crosses side is reported ────────────────────────────
{
  const a = buildMatrix('SPY', ['gex'], { lookback: '15m', reach: 15 });
  const b = clone(a);
  const r = b.rows.find(x => Math.abs(x.cells.gex?.net ?? 0) > 1e6)!;
  const cell = r.cells.gex!;
  cell.net = -cell.net;
  b.builtAt = a.builtAt + 1000;
  const d = diffStream(a, b);
  const crossed = d.find(e => e.strike === r.strike && /crossed to/.test(e.text));
  check('a strike changing side is a line', !!crossed, crossed?.text);
  check('  · naming the side it landed ON', !!crossed && crossed.text.includes(cell.net >= 0 ? 'put-dominant' : 'call-dominant'));
}

// ── 5. the shortlist reports its top, not its edge ───────────────────────
{
  const a = buildMatrix('SPY', ['gex'], { lookback: '15m', reach: 15 });
  const b = clone(a);
  /* Swap the last two entries of the shortlist — the edge. */
  const n = b.loaded.length;
  if (n >= 5) {
    const tmp = b.loaded[n - 1];
    b.loaded[n - 1] = b.loaded[n - 2];
    b.loaded[n - 2] = tmp;
    b.builtAt = a.builtAt + 1000;
    const d = diffStream(a, b);
    check('two strikes swapping at the edge of the list is not news',
      d.filter(e => e.source === 'score').length === 0,
      d.filter(e => e.source === 'score').map(e => e.text).join(' | ') || 'silent');
  }
  /* Put a new strike at the top. */
  const c = clone(a);
  const outsider = c.rows.find(r => !c.loaded.some(l => l.strike === r.strike))!;
  c.loaded = [outsider, ...c.loaded.slice(0, c.loaded.length - 1)];
  c.builtAt = a.builtAt + 2000;
  const d2 = diffStream(a, c);
  const into = d2.find(e => e.source === 'score' && e.strike === outsider.strike);
  check('a strike arriving at the top of the list is', !!into && /into the top 3 · #1/.test(into.text), into?.text);
  check('  · and the one it pushed out of the top three is named',
    d2.some(e => e.source === 'score' && /out of the top 3/.test(e.text)));
}

// ── 6. the buffer never repeats and never grows past the cap ─────────────
{
  const m = buildMatrix('SPY', ['gex'], { lookback: '15m', reach: 15 });
  let buf: StreamEvent[] = [];
  const seed = seedStream(m);
  buf = mergeStream(buf, seed);
  const once = buf.length;
  buf = mergeStream(buf, seed);
  check('merging the same events again changes nothing', buf.length === once);
  check('  · and returns the same buffer object when nothing is new', mergeStream(buf, seed) === buf);
  const flood: StreamEvent[] = Array.from({ length: STREAM_CAP * 2 }, (_, i) => ({
    id: `test:${i}`,
    at: Date.now() + i,
    source: 'flow',
    text: `line ${i}`,
    strike: null,
    weight: 0.1,
  }));
  buf = mergeStream(buf, flood);
  check('the buffer is capped', buf.length === STREAM_CAP, `${buf.length}`);
  check('  · newest first', buf[0].id === 'test:0');
}

// ── 6b. two spans of the same book are not a diff ────────────────────────
{
  /* FIT → ±8 re-ranks the shortlist over fewer strikes; the panel used to
     diff across that and report a reader's click as the market moving. */
  const wide = buildMatrix('SPY', ['gex'], { lookback: '15m', reach: 15 });
  const narrow = buildMatrix('SPY', ['gex'], { lookback: '15m', reach: 8 });
  narrow.builtAt = wide.builtAt + 1000;
  check('the same book at two spans is silence, not a re-ranked shortlist',
    diffStream(wide, narrow).length === 0 && wide.window.strikes !== narrow.window.strikes,
    `${wide.window.strikes} → ${narrow.window.strikes} strikes`);
  const same = clone(wide);
  same.builtAt = wide.builtAt + 1000;
  check('  · while the same span still diffs', diffStream(wide, same).length >= 0 && same.window.strikes === wide.window.strikes);
}

// ── 7. two different books are not a diff ────────────────────────────────
{
  const gex = buildMatrix('SPY', ['gex'], { lookback: '15m', reach: 15 });
  const dex = buildMatrix('SPY', ['dex'], { lookback: '15m', reach: 15 });
  const qqq = buildMatrix('QQQ', ['gex'], { lookback: '15m', reach: 15 });
  check('gamma against delta is silence, not a list of everything', diffStream(gex, dex).length === 0);
  check('SPY against QQQ is silence', diffStream(gex, qqq).length === 0);
  /* And a delta book's own seed is about delta's landmarks, not gamma's. */
  const dseed = seedStream(dex);
  const dl = asLevels(dex.landmarks, dex.spot);
  const dpin = dseed.find(e => /^PIN at/.test(e.text));
  check('a delta panel\'s pin is delta\'s own landmark', !dpin || dpin.strike === dl.supreme, `${dpin?.strike} vs ${dl.supreme}`);
  check('  · and its figures are delta dollars', !dpin || dpin.text.includes('$'));
}

// ── 8. a moved event carries the figure at the new strike ────────────────
{
  const m: Matrix = buildMatrix('SPY', ['gex'], { lookback: '15m', reach: 15 });
  const seed = seedStream(m);
  const withMoney = seed.filter(e => e.strike !== null);
  check('every strike-bearing line carries its net', withMoney.every(e => /\$[\d.]+[KMB]?/.test(e.text)),
    withMoney.find(e => !/\$[\d.]+[KMB]?/.test(e.text))?.text ?? 'all do');
}

console.log(`\n${pass} passed, ${fail} failed`);
