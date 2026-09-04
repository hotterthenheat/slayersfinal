/*
==================================================
  SLAYER TERMINAL - FLOW SEARCH (trace)

  The ticker/contract search every flow page
  carries (promoted from the Live Tape, 2026-08-30).
  Suggestions grouped TICKERS / CONTRACTS, ranked
  by money, keyboard-walkable; rows shaped
  {ticker, strike, right, premium} — FlowPrint and
  BookContract both fit.

  TWO STEPS, NOT ONE (Noah, 2026-08-30: "when i
  click on the ticker it doesnt navigate me to the
  contracts section it just kicks me out. and the
  user should have the option to skip the specific
  strikes in general and only see all the tapes for
  the ticker"). Picking a ticker SCOPES the menu:
  the filter applies at once (every print on that
  name is already on screen behind the menu), and
  the list turns into that ticker's contracts with
  "everything on <ticker>" at the top and a way
  back. Picking a contract, or "everything", closes.
  Typing anything drops the scope — the reader is
  searching again.
==================================================
*/

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Search, X } from 'lucide-react';
import { fmtUsd } from '../../data/gex';

/** The four facts a row must carry — FlowPrint and BookContract both do. */
export interface FlowSearchRow {
  ticker: string;
  strike: number;
  right: 'C' | 'P';
  premium: number;
}

export const normSymbol = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

type Suggestion =
  | { key: string; kind: 'ticker'; ticker: string; primary: string; sub: string }
  | { key: string; kind: 'contract'; query: string; primary: string; right: 'C' | 'P'; sub: string }
  | { key: string; kind: 'all'; ticker: string; primary: string; sub: string }
  | { key: string; kind: 'back'; primary: string };

const FlowSearch = ({
  value,
  onChange,
  rows,
  countNoun = 'prints',
}: {
  value: string;
  onChange: (v: string) => void;
  rows: FlowSearchRow[];
  /** What a ticker's tally counts — "prints" on the tape, "contracts" on a book page. */
  countNoun?: string;
}) => {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  /** A picked ticker — the menu is showing that name's contracts. */
  const [scope, setScope] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const nq = normSymbol(value);
  const active = value.length > 0;

  const close = () => {
    setOpen(false);
    setScope(null);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const tallies = useMemo(() => {
    const tick = new Map<string, { count: number; prem: number }>();
    const con = new Map<string, { ticker: string; count: number; prem: number; right: 'C' | 'P' }>();
    for (const r of rows) {
      const t = tick.get(r.ticker) ?? { count: 0, prem: 0 };
      t.count += 1;
      t.prem += r.premium;
      tick.set(r.ticker, t);
      const ck = `${r.ticker} ${r.strike}${r.right}`;
      const c = con.get(ck) ?? { ticker: r.ticker, count: 0, prem: 0, right: r.right };
      c.count += 1;
      c.prem += r.premium;
      con.set(ck, c);
    }
    return { tick, con };
  }, [rows]);

  const contractRow = ([ck, v]: [string, { count: number; prem: number; right: 'C' | 'P' }]): Suggestion => ({
    key: `c-${ck}`,
    kind: 'contract',
    query: ck,
    primary: ck,
    right: v.right,
    // A lone appearance says just its money — "1× ·" was noise.
    sub: `${v.count > 1 ? `${v.count}× · ` : ''}${fmtUsd(v.prem)}`,
  });

  /* Scoped: the picked ticker's own contracts, "everything" on top, a way back. */
  const scoped = useMemo<Suggestion[]>(() => {
    if (!scope) return [];
    const t = tallies.tick.get(scope);
    const contracts = [...tallies.con.entries()]
      .filter(([, v]) => v.ticker === scope)
      .sort((a, b) => b[1].prem - a[1].prem)
      .slice(0, 8)
      .map(contractRow);
    return [
      { key: 'back', kind: 'back', primary: 'All tickers' },
      {
        key: `all-${scope}`,
        kind: 'all',
        ticker: scope,
        primary: `Everything on ${scope}`,
        sub: t ? `${t.count} ${countNoun} · ${fmtUsd(t.prem)}` : '',
      },
      ...contracts,
    ];
  }, [scope, tallies, countNoun]);

  /* Unscoped: the query against every ticker and contract. */
  const { tickers, contracts } = useMemo(() => {
    const tickers: Suggestion[] = [...tallies.tick.entries()]
      .filter(([tk]) => nq === '' || normSymbol(tk).includes(nq))
      .sort((a, b) => b[1].prem - a[1].prem)
      .slice(0, nq === '' ? 5 : 4)
      .map(([tk, v]) => ({ key: `t-${tk}`, kind: 'ticker', ticker: tk, primary: tk, sub: `${v.count} ${countNoun} · ${fmtUsd(v.prem)}` }));
    const contracts: Suggestion[] = [...tallies.con.entries()]
      .filter(([ck]) => nq === '' || normSymbol(ck).includes(nq))
      .sort((a, b) => b[1].prem - a[1].prem)
      .slice(0, nq === '' ? 4 : 6)
      .map(contractRow);
    return { tickers, contracts };
  }, [tallies, nq, countNoun]);

  const flat: Suggestion[] = scope ? scoped : [...tickers, ...contracts];
  const clampedHi = Math.min(hi, Math.max(0, flat.length - 1));

  const pick = (s: Suggestion) => {
    switch (s.kind) {
      case 'ticker':
        // Apply at once — the whole name is now on screen — and stay open
        // showing its contracts, so narrowing further is one more click.
        onChange(s.ticker);
        setScope(s.ticker);
        setHi(1);
        return;
      case 'all':
        onChange(s.ticker);
        close();
        return;
      case 'back':
        onChange('');
        setScope(null);
        setHi(0);
        return;
      case 'contract':
        onChange(s.query);
        close();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      else setHi(h => Math.min(h + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && flat[clampedHi]) {
        e.preventDefault();
        pick(flat[clampedHi]);
      }
    } else if (e.key === 'Escape') {
      close();
    }
  };

  const rowClass = (idx: number) =>
    `w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors ${
      idx === clampedHi ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
    }`;

  const renderRow = (s: Suggestion, idx: number) => (
    <button
      key={s.key}
      onMouseEnter={() => setHi(idx)}
      onMouseDown={e => {
        e.preventDefault(); // keep focus; select before the field blurs
        pick(s);
      }}
      className={rowClass(idx)}
    >
      {s.kind === 'contract' ? (
        <span className={`inline-flex w-3.5 justify-center font-mono text-[9px] font-bold ${s.right === 'C' ? 'text-bull' : 'text-bear'}`}>
          {s.right}
        </span>
      ) : s.kind === 'back' ? (
        <ArrowLeft className="w-3 h-3 text-textMuted" />
      ) : (
        <span className="inline-flex w-3.5 justify-center font-mono text-[9px] text-textMuted">/</span>
      )}
      <span className={`font-mono text-[11px] ${s.kind === 'back' ? 'text-textSecondary' : 'font-semibold text-textPrimary'}`}>
        {s.primary}
      </span>
      {s.kind !== 'back' && <span className="ml-auto font-mono text-[9px] tnum text-textMuted">{s.sub}</span>}
    </button>
  );

  return (
    <div ref={rootRef} className="relative">
      <div
        /* Active = the holographic silver, not lime (Noah, 2026-08-30: "remove
           anything neon in this search thing to holographic silver") — the
           foil is the house's "where you are" ink; lime stays for live/status. */
        className={`inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 rounded-md transition-colors ${
          active ? 'holo-border' : 'border border-borderSubtle bg-white/[0.02] focus-within:border-borderMuted'
        }`}
      >
        <Search className={`w-3 h-3 shrink-0 ${active ? 'text-[#C7D3E8]' : 'text-textMuted'}`} />
        <input
          value={value}
          onChange={e => {
            onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9 .]/g, '').slice(0, 12));
            setScope(null); // typing is searching again
            setOpen(true);
            setHi(0);
          }}
          onFocus={() => setOpen(true)}
          // A click on a field that already has focus fires no focus event —
          // after a pick-then-clear the reader would be tapping a dead box.
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="TICKER / CONTRACT"
          aria-label="Search by ticker or contract"
          className="w-[132px] bg-transparent font-mono text-[11px] font-semibold uppercase tracking-wider text-textPrimary placeholder:text-textMuted placeholder:font-normal focus:outline-none"
        />
        {active && (
          <button
            onMouseDown={e => {
              e.preventDefault();
              onChange('');
              setScope(null);
            }}
            aria-label="Clear search"
            className="text-[#C7D3E8]/70 hover:text-[#C7D3E8] transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      {open && flat.length > 0 && (
        <div className="absolute left-0 top-full mt-1 z-40 w-[236px] border border-borderMuted bg-panel rounded-md shadow-2xl shadow-black/60 overflow-hidden animate-slide-in">
          {scope ? (
            <>
              {renderRow(flat[0], 0)}
              <div className="px-2.5 pt-1.5 pb-1 font-mono text-[9px] font-bold uppercase tracking-widest text-textMuted border-t border-borderSubtle">
                {scope}
              </div>
              {flat.slice(1).map((s, i) => renderRow(s, i + 1))}
            </>
          ) : (
            <>
              {tickers.length > 0 && (
                <>
                  <div className="px-2.5 pt-1.5 pb-1 font-mono text-[9px] font-bold uppercase tracking-widest text-textMuted">Tickers</div>
                  {tickers.map((s, i) => renderRow(s, i))}
                </>
              )}
              {contracts.length > 0 && (
                <>
                  <div className="px-2.5 pt-1.5 pb-1 font-mono text-[9px] font-bold uppercase tracking-widest text-textMuted border-t border-borderSubtle">
                    Contracts
                  </div>
                  {contracts.map((s, i) => renderRow(s, tickers.length + i))}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default FlowSearch;
