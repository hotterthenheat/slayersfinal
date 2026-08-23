import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

/*
==================================================
  SLAYER TERMINAL - THE FONT CAN DRAW WHAT THE UI WRITES
  (core/fontCoverage.test.ts)

  The terminal ships ONE typeface, self-hosted and SUBSET
  (scripts/build-inter-subset.py trims Inter from 2,852
  codepoints to 1,101). Subsetting is how the file stays
  smaller than the SF Pro it replaced while covering more
  of what this UI actually draws.

  THE FAILURE MODE A SUBSET INTRODUCES IS SILENT. Ask a
  font for a glyph it does not have and nothing throws,
  nothing logs, nothing fails to render — the browser
  quietly substitutes the next family in the stack and one
  character on the screen is set in a different typeface
  from the words either side of it. At 11px, in a column of
  numbers, nobody notices for months.

  That is not hypothetical. The outgoing SF Pro file was
  ALREADY doing it, and this guard is what found it: ─ ⇄ ⇔
  ⇒ ↵ ⧉ ␞ were all missing from a 748-codepoint file that
  nothing checked.

  So the guard reads the SHIPPED BINARY. Not a manifest
  emitted beside it, not a list of ranges copied out of the
  build script — the actual woff2 in public/fonts, parsed
  down to its cmap. A manifest can drift from the file it
  describes; a file cannot drift from itself.
==================================================
*/

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const FONT = join(ROOT, 'public/fonts/Inter.var.woff2');

// ---------------------------------------------------------------------------
// WOFF2 → cmap
//
// woff2 is one Brotli stream holding every table back to back, preceded by a
// directory of variable-length entries. Node ships Brotli, so the only work is
// walking that directory to find where `cmap` starts. glyf and loca are
// transformed and their stored size differs from their original size; every
// other table, cmap included, is stored as-is.
// ---------------------------------------------------------------------------

/** WOFF2's fixed 63-entry tag table (spec §5.2). Index 63 means "tag follows". */
const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm',
  'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern',
  'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC',
  'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar',
  'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty',
  'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat',
  'Gloc', 'Feat', 'Sill',
];

class Reader {
  constructor(
    readonly buf: Buffer,
    public at = 0
  ) {}
  u8(): number {
    return this.buf.readUInt8(this.at++);
  }
  u16(): number {
    const v = this.buf.readUInt16BE(this.at);
    this.at += 2;
    return v;
  }
  u32(): number {
    const v = this.buf.readUInt32BE(this.at);
    this.at += 4;
    return v;
  }
  /** UIntBase128: 7 bits per byte, high bit continues. */
  base128(): number {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const b = this.u8();
      v = v * 128 + (b & 0x7f);
      if ((b & 0x80) === 0) return v;
    }
    throw new Error('UIntBase128 overran five bytes');
  }
}

/** The uncompressed bytes of one table out of a woff2 file. */
function tableFromWoff2(file: Buffer, want: string): Buffer {
  const r = new Reader(file);
  if (r.u32() !== 0x774f4632) throw new Error('not a woff2 file (bad signature)');
  r.u32(); // flavor
  r.u32(); // length
  const numTables = r.u16();
  r.u16(); // reserved
  r.u32(); // totalSfntSize
  r.u32(); // totalCompressedSize
  r.u16(); // majorVersion
  r.u16(); // minorVersion
  r.u32(); // metaOffset
  r.u32(); // metaLength
  r.u32(); // metaOrigLength
  r.u32(); // privOffset
  r.u32(); // privLength

  const entries: { tag: string; size: number }[] = [];
  for (let i = 0; i < numTables; i++) {
    const flags = r.u8();
    const idx = flags & 0x3f;
    const xform = (flags >> 6) & 0x03;
    const tag = idx === 0x3f ? file.toString('latin1', r.at, (r.at += 4)) : KNOWN_TAGS[idx];
    const origLength = r.base128();
    // Transform version 0 means "transformed" for glyf/loca and "null transform"
    // for everything else — the one genuinely counter-intuitive line in the spec,
    // and getting it backwards shifts every subsequent table offset.
    const transformed = tag === 'glyf' || tag === 'loca' ? xform === 0 : xform !== 0;
    const size = transformed ? r.base128() : origLength;
    entries.push({ tag, size });
  }

  const stream = brotliDecompressSync(file.subarray(r.at));
  let offset = 0;
  for (const e of entries) {
    if (e.tag === want) return stream.subarray(offset, offset + e.size);
    offset += e.size;
  }
  throw new Error(`no ${want} table in font`);
}

/** Every codepoint the font maps to a real glyph. */
function coverage(cmap: Buffer): Set<number> {
  const out = new Set<number>();
  const numTables = cmap.readUInt16BE(2);
  const subtables: number[] = [];
  for (let i = 0; i < numTables; i++) subtables.push(cmap.readUInt32BE(4 + i * 8 + 4));

  for (const off of subtables) {
    const format = cmap.readUInt16BE(off);

    if (format === 4) {
      const segX2 = cmap.readUInt16BE(off + 6);
      const seg = segX2 / 2;
      const endAt = off + 14;
      const startAt = endAt + segX2 + 2;
      const deltaAt = startAt + segX2;
      const rangeAt = deltaAt + segX2;
      for (let s = 0; s < seg; s++) {
        const end = cmap.readUInt16BE(endAt + s * 2);
        const start = cmap.readUInt16BE(startAt + s * 2);
        const delta = cmap.readInt16BE(deltaAt + s * 2);
        const rangeOff = cmap.readUInt16BE(rangeAt + s * 2);
        if (start === 0xffff) continue;
        for (let c = start; c <= end && c !== 0x10000; c++) {
          let gid: number;
          if (rangeOff === 0) gid = (c + delta) & 0xffff;
          else {
            const gi = rangeAt + s * 2 + rangeOff + (c - start) * 2;
            if (gi + 1 >= cmap.length) continue;
            const raw = cmap.readUInt16BE(gi);
            gid = raw === 0 ? 0 : (raw + delta) & 0xffff;
          }
          // A segment can legitimately map a codepoint to .notdef. That is not
          // coverage — it is the font saying "I cannot draw this".
          if (gid !== 0) out.add(c);
        }
      }
    } else if (format === 12) {
      const nGroups = cmap.readUInt32BE(off + 12);
      for (let g = 0; g < nGroups; g++) {
        const at = off + 16 + g * 12;
        const start = cmap.readUInt32BE(at);
        const end = cmap.readUInt32BE(at + 4);
        const startGid = cmap.readUInt32BE(at + 8);
        if (startGid === 0) continue;
        for (let c = start; c <= end; c++) out.add(c);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// What the UI writes
// ---------------------------------------------------------------------------

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/*
  Comments are stripped, and test files are skipped entirely, because neither
  reaches a screen. The house stripper from lib/honesty.test.ts, deliberately
  reused rather than re-invented: it takes block comments whole and only takes a
  line comment when `//` opens the line, so a URL inside a string survives.
*/
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const USED = (() => {
  const seen = new Map<number, string>();
  for (const path of walk(SRC)) {
    const code = stripComments(readFileSync(path, 'utf8'));
    for (const ch of code) {
      const cp = ch.codePointAt(0)!;
      if (cp > 0x7f && !seen.has(cp)) seen.set(cp, path.slice(SRC.length + 1));
    }
  }
  return seen;
})();

/**
 * Codepoints the UI writes that the shipped font deliberately does not draw.
 *
 * This list is the whole point of the guard: a glyph may only fall back if
 * somebody decided it should, in writing, here. Adding a line is cheap; adding
 * one without meaning it is the thing the guard exists to make visible.
 */
const KNOWN_FALLBACKS = new Map<number, string>([
  // Emoji. No text face carries these and none should — the platform's colour
  // emoji font is the correct renderer, and substituting it is expected rather
  // than a defect.
  [0x2728, '✨ — emoji, rendered by the platform emoji face'],
  // A delimiter, not a character. community/localMeta.ts wraps stored metadata
  // in '␞SLAYER_META␞' precisely because U+241E cannot occur in user text; it is
  // written to localStorage and parsed back out, and never reaches a screen.
  [0x241e, '␞ — record-separator sentinel in a stored string, never rendered'],
]);

// ---------------------------------------------------------------------------

describe('the shipped font can draw what the UI writes', () => {
  const font = readFileSync(FONT);
  const cmap = coverage(tableFromWoff2(font, 'cmap'));

  it('parses a real cmap out of the real file', () => {
    /*
      The parser's own sanity, asserted before anything is concluded from it. A
      woff2 reader that silently returns an empty set would make every coverage
      assertion below pass while proving nothing — which is the exact defect
      class this repo keeps finding. So: a plausible size, a glyph that must be
      there, and one that must not.
    */
    expect(cmap.size).toBeGreaterThan(900);
    expect(cmap.size).toBeLessThan(2000);
    for (const ch of 'AZaz0.9,%$—·Δσ→≥⌘▲✓') {
      expect(cmap.has(ch.codePointAt(0)!), `font must draw ${ch}`).toBe(true);
    }
    // Outside every range the build script asks for: CJK, Cyrillic, Hangul.
    for (const ch of '本Дᄀ') {
      expect(cmap.has(ch.codePointAt(0)!), `font must NOT draw ${ch}`).toBe(false);
    }
  });

  it('keeps both variable axes and the tabular-figures feature', () => {
    // wght resolves every Tailwind weight out of one file, opsz stands in for
    // the Text/Display pair, and tnum is what keeps 1,331 numeric columns
    // aligned in a proportional face (index.css puts it on every .font-mono).
    // Read off the binary, not off the build script's flags.
    // fvar header: major/minor u16, axesArrayOffset u16, reserved u16,
    // axisCount u16, axisSize u16, instanceCount u16, instanceSize u16.
    const fvar = tableFromWoff2(font, 'fvar');
    const axisOffset = fvar.readUInt16BE(4);
    const axisCount = fvar.readUInt16BE(8);
    const axisSize = fvar.readUInt16BE(10);
    const tags: string[] = [];
    for (let i = 0; i < axisCount; i++) {
      tags.push(fvar.toString('latin1', axisOffset + i * axisSize, axisOffset + i * axisSize + 4));
    }
    expect(tags.sort()).toEqual(['opsz', 'wght']);
    expect(tableFromWoff2(font, 'GSUB').includes(Buffer.from('tnum', 'latin1'))).toBe(true);
  });

  it('draws every non-ASCII character the source renders', () => {
    const missing: string[] = [];
    for (const [cp, where] of USED) {
      if (cmap.has(cp)) continue;
      if (KNOWN_FALLBACKS.has(cp)) continue;
      missing.push(`U+${cp.toString(16).toUpperCase().padStart(4, '0')} ${String.fromCodePoint(cp)} — first seen in ${where}`);
    }
    expect(
      missing.sort(),
      'These characters are written by the UI and the shipped font cannot draw them, so ' +
        'each renders in whatever face the browser substitutes — a different typeface, ' +
        'mid-sentence, with no error anywhere. Either widen the ranges in ' +
        'scripts/build-inter-subset.py and rebuild, or add the codepoint to ' +
        'KNOWN_FALLBACKS with a reason.'
    ).toEqual([]);
  });

  it('does not carry a fallback exemption for a glyph the font actually draws', () => {
    // The list only ever shrinks. An entry that stops being true is a lie that
    // still passes, so it fails instead.
    const stale = [...KNOWN_FALLBACKS.keys()].filter(cp => cmap.has(cp));
    expect(stale, 'these are on the fallback list but the font can draw them').toEqual([]);
  });

  it('the outgoing licence problem is actually gone', () => {
    /*
      The face changed for a licence reason, not a taste one: Apple grants SF Pro
      for interface design and for apps on Apple platforms, not for @font-face
      embedding on a commercial site. A swap that leaves the file on disk has
      fixed nothing — the binary is what ships.
    */
    const fonts = readdirSync(join(ROOT, 'public/fonts'));
    expect(fonts.filter(f => /sf.?pro/i.test(f))).toEqual([]);
    expect(fonts).toContain('OFL.txt'); // the licence Inter must travel with
  });
});
