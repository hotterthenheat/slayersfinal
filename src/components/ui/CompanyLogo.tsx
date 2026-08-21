import { useState } from 'react';

/*
==================================================
  SLAYER TERMINAL - COMPANY MARK (ui/CompanyLogo.tsx)

  A ticker is a code. A mark is recognised before it is read, and on a screen
  where the same four letters appear in a header, a search list and a drawer
  title, that is the difference between finding your place and re-reading it.

  ART FIRST, MONOGRAM ALWAYS. `public/logos/{TICKER}.svg` holds the real brand
  glyph for the names we carry art for; every other name falls back to a
  house-styled monogram tile, so a surface never has a hole in it. Coverage
  grows by dropping another SVG in that folder — deliberately not a manifest in
  code, because a manifest is a second list to keep in step with the first.

  ONE LETTER, NOT FOUR. The monogram started as `sym.slice(0, 4)` scaled to a
  fraction of the tile, which is the obvious design and the wrong one: at the
  16px this renders at in the top bar, four letters work out to 7px type, and
  `npm run audit:ui` reported it 44 times as "below the 10px ramp floor". The
  floor is not a style preference — it is the size below which the terminal's
  own audit says text stops being readable, and it exists because legibility at
  small sizes is the complaint this house has heard most.

  There is no size at which four letters fit these tiles legibly (10px type
  needs roughly a 30px tile, and none of the call sites want one), so the tile
  carries a single initial and the floor is enforced in the size itself. Nothing
  is lost by it: the mark is decorative, the symbol is spelled out in text
  directly beside it at every call site, and what the tile is actually for is
  keeping the leading edge aligned whether or not a name has art.

  WHY THE ONLY COLOUR THE HOUSE DOES NOT CHOOSE. The house palette is silver,
  white and black, plus a fixed set of hues that mean something about the
  MARKET. A brand mark is neither: it is somebody else's identity, and
  recolouring it makes it a worse mark without making the page more coherent —
  the same reason a photograph is not restyled to the palette. What keeps it
  from becoming a rash is WHERE it is used, not what colour it is: single-name
  surfaces, one mark at a time. It does not belong down the side of a
  hundred-row board, where the seventeen names with art would read as a
  highlight the ranking never claimed.

  Marks are decorative here. Every call site renders the symbol itself in text
  directly beside this, so the element is `aria-hidden` with an empty `alt` — a
  screen reader that announced "Apple" and then "AAPL" is reading one thing
  twice.
==================================================
*/

/**
 * The smallest size the terminal's type ramp goes to (`text-micro`), and the
 * size `npm run audit:ui` fails anything below. Hard-coded rather than read
 * from the Tailwind config because this is a canvas-free inline style — but it
 * is the same number, and the audit is what keeps them honest.
 */
const TYPE_FLOOR_PX = 10;

interface CompanyLogoProps {
  ticker: string;
  /** Square edge in px. */
  size?: number;
  className?: string;
}

const CompanyLogo = ({ ticker, size = 20, className = '' }: CompanyLogoProps) => {
  const sym = ticker.toUpperCase();
  /*
    Keyed by SYMBOL, not a bare boolean. The component stays mounted while the
    active name changes underneath it, so a boolean would carry one name's miss
    onto the next name and hide art that exists.
  */
  const [failedFor, setFailedFor] = useState<string | null>(null);

  if (failedFor === sym) {
    return (
      <span
        aria-hidden
        className={`inline-flex items-center justify-center rounded-[5px] border border-borderMuted bg-white/[0.05] font-mono font-bold text-textPrimary select-none shrink-0 ${className}`}
        style={{
          width: size,
          height: size,
          // Scales with the tile, but never under the ramp's floor — a tile too
          // small to hold 10px type is a tile that shows no type.
          fontSize: Math.max(TYPE_FLOOR_PX, Math.round(size * 0.42)),
        }}
      >
        {sym.slice(0, 1)}
      </span>
    );
  }

  return (
    <img
      src={`/logos/${sym}.svg`}
      alt=""
      aria-hidden
      draggable={false}
      decoding="async"
      onError={() => setFailedFor(sym)}
      className={`select-none shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
};

export default CompanyLogo;
