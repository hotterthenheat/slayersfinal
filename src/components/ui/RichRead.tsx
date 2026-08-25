import type { ReactNode } from 'react';

/*
  RichRead — renders a generated narrative sentence with its meaningful
  tokens lit by the house color code, so the terminal's prose pops the same
  way its panels do. Color = information, never decoration:
    signed %      → bull green-lime / bear red (direction)
    $ amounts, %, ×-counts, tickers → bold white (facts)
    accumulation/support family     → bull   (side)
    distribution/supply family      → bear   (side)
  Data modules keep emitting plain strings — this is presentation only.
*/

// All-caps words that are jargon, not tickers — never emphasized as symbols
const JARGON = new Set([
  'GEX', 'VEX', 'DEX', 'DP', 'RSI', 'EMA', 'VWAP', 'OI', 'IV', 'ATS', 'ETF',
  'DTE', 'ATM', 'OTM', 'ITM', 'NBR', 'TP', 'TP1', 'TP2', 'TP3', 'TP4', 'AI',
]);

// NB the multiplier branch: \b works after ascii "x" but never after "×"
// (non-word char), so the two spellings need different right edges.
const TOKEN_RE =
  /([+]\d+(?:\.\d+)?%|[−-]\d+(?:\.\d+)?%|\d+(?:\.\d+)?%|\$\d[\d,]*(?:\.\d+)?[BMK]?|\d+(?:\.\d+)?(?:×|x\b)|(?:[Aa]ccumulat(?:ion|ing|ive)|[Aa]bsorbed|[Tt]ailwind|[Bb]uy side|[Dd]istribut(?:ion|ing|ive)|[Ss]ell side|[Hh]eadline risk|[Ss]upport|[Rr]esistance|[Ss]upply)\b|\b[A-Z]{2,5}\b)/;

function classFor(token: string): string | null {
  if (/^[+]\d/.test(token) && token.endsWith('%')) return 'text-bull font-semibold tnum';
  if (/^[−-]\d/.test(token) && token.endsWith('%')) return 'text-bear font-semibold tnum';
  if (/^\d/.test(token) && token.endsWith('%')) return 'font-semibold tnum text-textPrimary';
  if (token.startsWith('$')) return 'font-semibold tnum text-textPrimary';
  if (/^\d+(?:\.\d+)?[×x]$/.test(token)) return 'font-semibold tnum text-textPrimary';
  if (/^(accumulat|absorbed|tailwind|buy side|support)/i.test(token)) return 'text-bull font-medium';
  if (/^(distribut|sell side|headline risk|resistance|supply)/i.test(token)) return 'text-bear font-medium';
  if (/^[A-Z]{2,5}$/.test(token)) return JARGON.has(token) ? null : 'font-semibold text-textPrimary';
  return null;
}

const RichRead = ({ text, className }: { text: string; className?: string }) => {
  const parts = text.split(TOKEN_RE);
  const nodes: ReactNode[] = parts.map((part, i) => {
    if (part === undefined || part === '') return null;
    const cls = classFor(part);
    return cls ? (
      <span key={i} className={cls}>
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    );
  });
  return <span className={className}>{nodes}</span>;
};

export default RichRead;
