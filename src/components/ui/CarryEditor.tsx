import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  getCarry, carrySource, setCarry, resetCarry,
  DEFAULT_R, DEFAULT_Q, CARRY_MIN, CARRY_MAX,
} from '../../core/carry';

/*
  15 · THE CARRY EDITOR — "setCarry exists with a note field; build the UI,
  and show the source and as-of."

  WHAT IS BEING EDITED. r and q are the two numbers EVERY greek on this desk
  is priced against. A change here moves every delta, every charm, every
  exposure figure on every page — which is exactly why it needs a surface
  rather than staying a function only code can call, and exactly why the
  surface has to be honest about who set the value.

  THREE STATES, NOT TWO. `assumed` is the documented default; `feed` is a
  real rates source; `override` is a person typing a number. Collapsing the
  last two would let a guess inherit a feed's authority — the chip would
  say "feed" about something somebody made up. So an override says so, and
  says when.

  THE BOX REFUSES WHAT THE SEAM REFUSES. `setCarry` rejects a rate outside
  ±(CARRY_MIN, CARRY_MAX) because a "rate" of 40% is a units error — percent
  handed over where a fraction was meant — and the input enforces the same
  bound at the keyboard rather than silently doing nothing on submit. A box
  that accepts a value the seam will reject is a box that lies.

  ENTERED IN PERCENT, STORED AS A FRACTION, because 4.2 is what a person
  means and 0.042 is what Black-Scholes wants, and the gap between them is
  the units error the guard exists to catch.
*/

const pct = (v: number) => (v * 100).toFixed(2);

const KIND_INK: Record<'assumed' | 'feed' | 'override', string> = {
  assumed: 'text-textMuted',
  feed: 'text-bull',
  override: 'text-warn',
};

const KIND_WORD: Record<'assumed' | 'feed' | 'override', string> = {
  assumed: 'assumed',
  feed: 'from a feed',
  override: 'set by hand',
};

const CarryEditor = ({ className = '' }: { className?: string }) => {
  const [, bump] = useState(0);
  const carry = getCarry();
  const src = carrySource();
  const [rTxt, setRTxt] = useState(pct(carry.r));
  const [qTxt, setQTxt] = useState(pct(carry.q));
  const [refused, setRefused] = useState<string | null>(null);

  const parse = (t: string): number | null => {
    const v = Number(t) / 100;
    if (!Number.isFinite(v) || v <= CARRY_MIN || v >= CARRY_MAX) return null;
    return v;
  };

  const apply = () => {
    const r = parse(rTxt);
    const q = parse(qTxt);
    if (r === null || q === null) {
      setRefused(
        `Both must be between ${(CARRY_MIN * 100).toFixed(0)}% and ${(CARRY_MAX * 100).toFixed(0)}%. A rate outside that is almost always a percent handed over where a fraction was meant.`
      );
      return;
    }
    setRefused(null);
    setCarry({ r, q }, undefined, 'override');
    bump(n => n + 1);
  };

  const restore = () => {
    resetCarry();
    setRTxt(pct(DEFAULT_R));
    setQTxt(pct(DEFAULT_Q));
    setRefused(null);
    bump(n => n + 1);
  };

  const dirty = parse(rTxt) !== carry.r || parse(qTxt) !== carry.q;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[9px] uppercase tracking-wider text-textMuted">rate r</span>
          <span className="flex items-baseline gap-1">
            <input
              value={rTxt}
              onChange={e => setRTxt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') apply(); }}
              inputMode="decimal"
              aria-label="Risk-free rate, percent"
              className="w-16 rounded border border-borderSubtle bg-inset px-1.5 py-1 font-mono text-[11px] tnum text-textPrimary focus:border-borderMuted focus:outline-none"
            />
            <span className="font-mono text-[10px] text-textMuted">%</span>
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[9px] uppercase tracking-wider text-textMuted">yield q</span>
          <span className="flex items-baseline gap-1">
            <input
              value={qTxt}
              onChange={e => setQTxt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') apply(); }}
              inputMode="decimal"
              aria-label="Dividend yield, percent"
              className="w-16 rounded border border-borderSubtle bg-inset px-1.5 py-1 font-mono text-[11px] tnum text-textPrimary focus:border-borderMuted focus:outline-none"
            />
            <span className="font-mono text-[10px] text-textMuted">%</span>
          </span>
        </label>
        <button
          type="button"
          onClick={apply}
          disabled={!dirty}
          className="rounded border border-borderSubtle px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-textSecondary transition-colors hover:border-borderMuted hover:text-textPrimary disabled:opacity-30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-select"
        >
          apply
        </button>
        {src.kind !== 'assumed' && (
          <button
            type="button"
            onClick={restore}
            title={`Back to the documented assumptions — r ${pct(DEFAULT_R)}% and q ${pct(DEFAULT_Q)}%.`}
            className="inline-flex items-center gap-1 rounded px-1.5 py-1 font-mono text-[9px] uppercase tracking-wider text-textMuted transition-colors hover:text-textPrimary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-select"
          >
            <RotateCcw className="w-3 h-3" /> defaults
          </button>
        )}
      </div>

      {/* SOURCE AND AS-OF, which is the half of this item that matters.
          A reader looking at a delta is entitled to know whether the rate
          behind it came from a feed, from the desk's documented
          assumption, or from somebody typing. */}
      <p className="font-mono text-[10px] leading-snug">
        <span className={KIND_INK[src.kind]}>{KIND_WORD[src.kind]}</span>
        <span className="text-textMuted"> — {src.note}</span>
        {src.asOf && (
          <span className="text-textMuted">
            {' · as of '}
            {src.asOf.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </p>

      {refused && <p className="text-[11px] leading-snug text-warn">{refused}</p>}
    </div>
  );
};

export default CarryEditor;
