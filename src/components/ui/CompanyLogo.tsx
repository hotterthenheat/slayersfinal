import { useState } from 'react';

interface CompanyLogoProps {
  ticker: string;
  /** Square edge in px */
  size?: number;
  className?: string;
  /*
    THE TICKER IS ALREADY WRITTEN NEXT TO IT (2026-09-04). Every flow table
    opens its rows with this mark and then the ticker in bold — and for a name
    we carry no art for, the fallback tile spells the ticker too. The tape
    printed "SPY SPY" down its busiest column, and so, quietly, did Screener,
    Footprints, Flow Alerts and the Dark Pool board.

    `beside` says the letters are redundant here. The tile stays — it is what
    keeps the column's left edge straight whether or not a name has a glyph —
    but it wears a neutral mark instead of repeating the word beside it. Left
    off, the monogram is unchanged, which is what a mark standing ALONE needs.
  */
  beside?: boolean;
}

/*
  Company mark for any ticker. Tries the real brand glyph first
  (public/logos/{TICKER}.svg — simple-icons set with each brand's OFFICIAL
  color baked into the file; near-black brands flip to white so nothing
  vanishes on the dark canvas), and falls back to a house-styled monogram
  tile for names we don't carry art for. Expanding coverage = dropping
  another SVG in the folder; no code changes.
*/
const CompanyLogo = ({ ticker, size = 20, className = '', beside = false }: CompanyLogoProps) => {
  const sym = ticker.toUpperCase();
  const [failedFor, setFailedFor] = useState<string | null>(null);

  if (failedFor === sym) {
    return (
      <span
        aria-hidden
        className={`inline-flex items-center justify-center rounded-[5px] border border-borderMuted bg-white/[0.05] font-mono font-bold text-textPrimary select-none shrink-0 ${className}`}
        style={{
          width: size,
          height: size,
          fontSize: Math.max(7, Math.round(size * (sym.length > 3 ? 0.26 : 0.34))),
          letterSpacing: '-0.02em',
        }}
      >
        {beside ? (
          <span className="rounded-full bg-textMuted/50" style={{ width: Math.max(3, size * 0.22), height: Math.max(3, size * 0.22) }} />
        ) : (
          sym.slice(0, 4)
        )}
      </span>
    );
  }

  return (
    <img
      src={`/logos/${sym}.svg`}
      alt=""
      aria-hidden
      draggable={false}
      onError={() => setFailedFor(sym)}
      className={`select-none shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
};

export default CompanyLogo;
