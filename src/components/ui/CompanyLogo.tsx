import { useState } from 'react';

interface CompanyLogoProps {
  ticker: string;
  /** Square edge in px */
  size?: number;
  className?: string;
}

/*
  Company mark for any ticker. Tries the real brand glyph first
  (public/logos/{TICKER}.svg — simple-icons set with each brand's OFFICIAL
  color baked into the file; near-black brands flip to white so nothing
  vanishes on the dark canvas), and falls back to a house-styled monogram
  tile for names we don't carry art for. Expanding coverage = dropping
  another SVG in the folder; no code changes.
*/
const CompanyLogo = ({ ticker, size = 20, className = '' }: CompanyLogoProps) => {
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
        {sym.slice(0, 4)}
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
