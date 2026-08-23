#!/usr/bin/env python3
"""
Build public/fonts/Inter.var.woff2 — the terminal's ONE typeface.

WHY A BUILD STEP AT ALL. The app ships a single self-hosted variable font. The
upstream file (inter-ui's InterVariable.woff2) covers 2,852 codepoints across
Cyrillic, Vietnamese and the rest of Inter's reach; this product is English-only
and pays 352 KB for it. Subsetting to the ranges the UI actually draws from
brings that down without giving up a single glyph the interface renders.

WHY THE SCRIPT IS COMMITTED. The output is a derived binary that matches no
upstream release, so "where did this file come from" has to be answerable
without archaeology. It is NOT wired into `npm run build`: the woff2 is
committed exactly as the font it replaced was, and regenerating it is a
deliberate act.

    pip install fonttools brotli
    npm install --no-save inter-ui@4.1.1
    python3 scripts/build-inter-subset.py

LICENCE. Inter is SIL Open Font License 1.1 (Copyright 2016 The Inter Project
Authors, https://github.com/rsms/inter). The OFL permits embedding, subsetting
and commercial use; it requires the licence to travel with the font, which is
why public/fonts/OFL.txt is committed beside the output. This replaced Apple's
SF Pro, whose licence does NOT permit webfont embedding on a commercial site —
that, not aesthetics, is why the face changed.

RANGES. Deliberately wider than today's UI needs. A subset trimmed to exactly
the glyphs currently on screen breaks the next time somebody types an arrow, and
the failure is silent: the glyph renders in a system fallback face beside Inter.
core/fontCoverage.test.ts is the guard that makes that failure loud; these ranges
are the headroom that keeps it from firing over ordinary work.
"""

import os
import subprocess
import sys

SRC = "node_modules/inter-ui/variable/InterVariable.woff2"
OUT = "public/fonts/Inter.var.woff2"

RANGES = [
    ("U+0000-00FF", "Basic Latin + Latin-1 Supplement"),
    ("U+0100-017F", "Latin Extended-A — accented names"),
    ("U+0180-024F", "Latin Extended-B"),
    ("U+02B0-02FF", "Spacing modifiers — the curly apostrophe family"),
    ("U+0300-036F", "Combining diacriticals"),
    ("U+0370-03FF", "Greek — delta, gamma, sigma, theta, beta, omega"),
    ("U+2000-206F", "General punctuation — em dash, ellipsis, curly quotes, bullet"),
    ("U+2070-209F", "Super/subscripts"),
    ("U+20A0-20BF", "Currency symbols"),
    ("U+2100-214F", "Letterlike — trademark, numero"),
    ("U+2150-218F", "Number forms — vulgar fractions"),
    ("U+2190-21FF", "Arrows — the 146 rightwards arrows in UI copy live here"),
    ("U+2200-22FF", "Mathematical operators — >=, <=, ~=, !=, root"),
    ("U+2300-23FF", "Miscellaneous technical — the command key on the search button"),
    ("U+2500-257F", "Box drawing"),
    ("U+25A0-25FF", "Geometric shapes — the up/down triangles"),
    ("U+2600-26FF", "Miscellaneous symbols"),
    ("U+2700-27BF", "Dingbats — the check mark"),
]

def main() -> int:
    if not os.path.exists(SRC):
        print(f"missing {SRC} — run: npm install --no-save inter-ui@4.1.1", file=sys.stderr)
        return 1

    cmd = [
        sys.executable, "-m", "fontTools.subset", SRC,
        f"--unicodes={','.join(r for r, _ in RANGES)}",
        f"--output-file={OUT}",
        "--flavor=woff2",
        # Every OpenType feature survives. `tnum` in particular is load-bearing:
        # index.css puts font-variant-numeric: tabular-nums on .font-mono, which
        # is how a proportional face keeps 1,331 numeric columns aligned. Drop
        # the feature and the columns go ragged with nothing else changing.
        "--layout-features=*",
        # Both axes survive by default — fontTools.subset keeps fvar/gvar unless
        # told otherwise — and the check at the bottom asserts it rather than
        # trusting it. `wght` resolves every Tailwind weight out of one file;
        # `opsz` is Inter's optical size, and it is the reason this face can
        # stand in for a Text/Display pair the way SF Pro did.
        "--name-IDs=*",
        "--notdef-outline",
        "--recalc-bounds",
    ]
    print(" ".join(cmd))
    subprocess.run(cmd, check=True)

    from fontTools.ttLib import TTFont

    out = TTFont(OUT)
    axes = {a.axisTag: (a.minValue, a.maxValue) for a in out["fvar"].axes}
    if "wght" not in axes or "opsz" not in axes:
        print(f"axes lost in subsetting: {axes}", file=sys.stderr)
        return 1

    cmap = set()
    for t in out["cmap"].tables:
        cmap |= set(t.cmap.keys())

    before, after = os.path.getsize(SRC), os.path.getsize(OUT)
    print(f"\n{SRC}  {before:,} B")
    print(f"{OUT}  {after:,} B  ({after / before:.0%} of upstream)")
    print(f"axes {axes}")
    print(f"codepoints {len(cmap):,}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
