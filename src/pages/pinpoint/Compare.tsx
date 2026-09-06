import { useMemo, useState } from 'react';
import Simulator from '../../core/simulator';
import { COMPARE_MODE_WORDS, REACH_PCT, buildExposureCompare, compareWords, dollarTurnover, type CompareMode } from '../../data/exposureCompare';
import { twinFamilyFor } from '../../data/indexTwins';
import { fmtUsd } from '../../data/gex';
import DataState from '../../components/ui/DataState';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { heatInk, heatRgb } from '../../components/gex/heatmap';
import { Bench, Deck, Figure, Legend, Pane, Read, Section, Tag } from '../../components/pinpoint/Desk';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { CALL_WALL, FLIP, INK, PUT_WALL, SELECT, SPOT, WARN } from '../../components/pinpoint/ink';

/*
==================================================
  SLAYER TERMINAL - COMPARE (pages/pinpoint/Compare.tsx)
  Two books on one axis — where their positioning diverges.
  Rebuilt from zero, 2026-09-06.
==================================================

  Two names have two spots and two dollar scales, so their positioning
  cannot be laid side by side as it comes. The engine puts both on ONE
  axis — percent from each book's own spot, in quarter-percent buckets,
  five percent each way — and normalises each book so a reader compares
  WHERE the exposure sits rather than how big the names are.

  The hero is the mirror: each row is a bucket, the left book grows
  leftward from the centre and the right book grows rightward, so two
  books positioned the same way look symmetric and a disagreement is
  visibly lopsided. The widest disagreement wears a ring. The rail says
  in words how different the books are, and under which of the two
  normalisations — shape, or impact — because those answer different
  questions and the label says which is on screen.
*/

const MODE_OPTIONS = [
  { value: 'shape', label: 'Shape' },
  { value: 'impact', label: 'Impact' },
] as const;

const rgb = (c: [number, number, number], a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

const Compare = () => {
  const { snapshot, scanAt } = useScanSnapshot();
  const [other, setOther] = useState<string>('');
  const [mode, setMode] = useState<CompareMode>('shape');

  /* The picker leads with the correlated names — the desk's twin families
     — because a divergence between siblings is a signal; everything else
     stays reachable for an uncorrelated look. */
  const { correlated, rest } = useMemo(() => {
    const all = Object.keys(Simulator.TICKERS).slice(0, 14);
    const mine = snapshot?.ticker ?? '';
    const corr = ['SPY', 'QQQ', 'IWM'].filter(t => t !== mine && all.includes(t) && twinFamilyFor(t) !== null);
    return { correlated: corr, rest: all.filter(t => t !== mine && !corr.includes(t)) };
  }, [snapshot?.ticker]);
  const partner = other && other !== snapshot?.ticker ? other : correlated[0] || rest[0] || '';
  const partnerSnap = useMemo(() => {
    if (!partner) return null;
    try {
      return Simulator.snapshotFor(partner as Parameters<typeof Simulator.snapshotFor>[0]);
    } catch {
      return null;
    }
  }, [partner, scanAt]);
  const compare = useMemo(() => (snapshot && partnerSnap ? buildExposureCompare(snapshot, partnerSnap, mode) : null), [snapshot, partnerSnap, mode]);
  const turnover = useMemo(() => ({ a: snapshot ? dollarTurnover(snapshot) : null, b: partnerSnap ? dollarTurnover(partnerSnap) : null }), [snapshot, partnerSnap]);

  if (!snapshot || !compare) {
    return (
      <Section title="Compare">
        <DataState kind="loading" title="Awaiting both books" body="Two chains are needed before there is a comparison." />
      </Section>
    );
  }

  const maxShare = Math.max(...compare.buckets.map(b => Math.max(Math.abs(b.a), Math.abs(b.b))), 1e-9);
  const rowsDesc = [...compare.buckets].sort((a, b) => b.pct - a.pct);
  const famA = twinFamilyFor(compare.tickerA);
  const famB = twinFamilyFor(compare.tickerB);
  const fell = compare.mode !== compare.modeRequested;
  /* No ink at all. It was green/gold/red — a traffic light on a number where
     neither book is the good one — and dimming it by size then made the
     section's headline figure the faintest thing in the section. A figure
     that matters is stated at figure size in the reading ink; the NUMBER is
     already the magnitude. */
  const pctLabel = (v: number | null) => (v === null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`);

  const hero = (
    <Section
      title={`${compare.tickerA} vs ${compare.tickerB}`}
      note={`each book’s share of its own ${compare.mode === 'shape' ? 'total gamma' : 'dollar turnover'} in every quarter-percent from its own spot — the left book grows left, the right book grows right, and a lopsided row is a disagreement`}
      className="h-full"
      bodyClassName="flex flex-col"
    >
      <div className="grid grid-cols-[1fr_64px_1fr_72px] items-center px-3 pt-2 pb-1 font-mono text-[10px] uppercase tracking-widest text-textMuted">
        <span className="text-right pr-2" style={{ color: SPOT }}>
          {compare.tickerA}
        </span>
        <span className="text-center">% from spot</span>
        <span className="pl-2" style={{ color: SPOT }}>
          {compare.tickerB}
        </span>
        <span className="text-right">diverge</span>
      </div>
      <Pane className="flex-1 overflow-y-auto max-h-[620px] px-3 pb-2" data-compare-rows>
        {rowsDesc.map((b, i) => {
          const wa = (Math.abs(b.a) / maxShare) * 100;
          const wb = (Math.abs(b.b) / maxShare) * 100;
          const widest = compare.widest !== null && b.pct === compare.widest.pct;
          const spotRow = i > 0 && rowsDesc[i - 1].pct > 0 && b.pct <= 0;
          return (
            <div key={b.pct} className={`grid grid-cols-[1fr_64px_1fr_72px] items-center gap-0 py-[2px] ${widest ? 'outline outline-1 -outline-offset-1 outline-select/60 bg-select/[0.04]' : ''}`} style={spotRow ? { borderTop: `2px solid ${SPOT}` } : undefined} data-bucket={b.pct} data-widest={widest || undefined}>
              <div className="flex justify-end pr-2">
                <span className="h-[9px] rounded-l-sm" style={{ width: `${wa}%`, background: rgb(heatRgb(b.a, maxShare)) }} title={`${compare.tickerA} ${b.pct.toFixed(2)}%: ${(b.a * 100).toFixed(2)}%`} />
              </div>
              <span className="text-center font-mono text-[10px] tnum text-textSecondary">{b.pct === 0 ? 'spot' : `${b.pct > 0 ? '+' : ''}${b.pct.toFixed(2)}`}</span>
              <div className="flex justify-start pl-2">
                <span className="h-[9px] rounded-r-sm" style={{ width: `${wb}%`, background: rgb(heatRgb(b.b, maxShare)) }} title={`${compare.tickerB} ${b.pct.toFixed(2)}%: ${(b.b * 100).toFixed(2)}%`} />
              </div>
              <span className={`text-right font-mono text-[10px] tnum ${widest ? 'text-select font-bold' : Math.abs(b.divergence) > 0.5 * Math.abs(compare.widest?.divergence ?? 1) ? 'text-textPrimary' : 'text-textMuted'}`}>{(b.divergence * 100).toFixed(1)}</span>
            </div>
          );
        })}
      </Pane>
      <div className="mt-auto border-t border-borderSubtle px-3.5 py-2">
        <Legend items={[{ ink: heatInk.pos, label: 'amplifies (put-heavy)' }, { ink: heatInk.neg, label: 'absorbs (call-heavy)' }, { ink: SPOT, label: 'each book’s own spot' }, { ink: SELECT, label: 'ring — widest disagreement' }]} />
      </div>
    </Section>
  );

  const rail = (
    <>
      <Section title="How differently are they positioned" note="total absolute divergence across the axis — zero is two identical shapes">
        <div className="flex items-end gap-4">
          <Figure label="Divergence" value={compare.totalDivergence.toFixed(2)} size="lead" />
          {compare.widest && <Figure label="Widest at" value={`${compare.widest.pct > 0 ? '+' : ''}${compare.widest.pct.toFixed(2)}%`} ink={SELECT} size="figure" sub={`${compare.tickerA} ${(compare.widest.a * 100).toFixed(1)}% vs ${compare.tickerB} ${(compare.widest.b * 100).toFixed(1)}%`} />}
        </div>
        <Read className="mt-3">
          {compareWords(compare)}
        </Read>
      </Section>
      <Section title="The levels, side by side" note="in percent from each book’s own spot">
        <table className="w-full font-mono text-[11px] tnum" data-compare-levels>
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-textMuted">
              <th className="text-left font-normal pb-1">Level</th>
              <th className="text-right font-normal pb-1">{compare.tickerA}</th>
              <th className="text-right font-normal pb-1">{compare.tickerB}</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                { label: 'Call wall', ink: CALL_WALL, k: 'callWall' },
                { label: 'Put wall', ink: PUT_WALL, k: 'putWall' },
                { label: 'Flip', ink: FLIP, k: 'flip' },
              ] as const
            ).map(r => (
              <tr key={r.k} className="border-t border-borderSubtle/50">
                <td className="py-1 font-semibold" style={{ color: r.ink }}>
                  {r.label}
                </td>
                <td className="py-1 text-right text-textPrimary">{pctLabel(compare.levels.a[r.k])}</td>
                <td className="py-1 text-right text-textPrimary">{pctLabel(compare.levels.b[r.k])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Which normalisation" note="two questions, two divisors — the label says which is on screen" actions={<Tag ink={fell ? WARN : INK.secondary}>{compare.mode}{fell ? ' · fell back' : ''}</Tag>}>
        <p className="text-[11px] text-textSecondary leading-relaxed">{COMPARE_MODE_WORDS[compare.mode].note}</p>
        {fell && (
          <p className="mt-2 text-[11px] leading-relaxed text-warn" data-compare-fallback>
            Impact was asked for, but {turnover.a === null ? compare.tickerA : compare.tickerB} has no measurable dollar turnover yet (the bar history is too thin), so the comparison fell back to shape rather than divide by a guess.
          </p>
        )}
      </Section>
    </>
  );

  return (
    <>
      <div className="flex items-center gap-2.5 flex-wrap" data-compare-controls>
        <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Against</span>
        <div className="inline-flex items-center gap-0.5 rounded-md border border-borderSubtle bg-panel p-0.5" role="group" aria-label="Correlated names">
          {correlated.map(t => {
            const fam = twinFamilyFor(t);
            return (
              <button key={t} onClick={() => setOther(t)} className={`px-2.5 py-1 rounded font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors ${partner === t ? 'bg-white/[0.08] text-textPrimary' : 'text-textSecondary hover:text-textPrimary'}`} title={fam ? `${fam.etf} · ${fam.index} · ${fam.futures}` : t}>
                {t}
                {fam && <span className="ml-1 text-[10px] text-textMuted normal-case tracking-normal">{fam.index}</span>}
              </button>
            );
          })}
        </div>
        <select value={rest.includes(partner) ? partner : ''} onChange={e => setOther(e.target.value)} aria-label="Any other name" className="rounded-md border border-borderSubtle bg-inputBg px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-textSecondary">
          <option value="">any other name…</option>
          {rest.map(t => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <SegmentedControl ariaLabel="Normalisation" options={MODE_OPTIONS} value={mode} onChange={v => setMode(v)} />
        <ProvenanceChip sources={['chain', 'exposure']} className="ml-auto" />
        <span className="font-mono text-[10px] text-textMuted uppercase tracking-widest tnum">scan {scanAt} · 10s</span>
      </div>
      <Deck hero={hero} rail={rail}>
        <Bench cols={3}>
          <Section title="The axis">
            <p className="text-[11px] text-textSecondary leading-relaxed">
              Quarter-percent buckets, {REACH_PCT}% each way from each book’s own spot. A shelf 2% overhead is 2% overhead in both names, whatever their prices — that is what makes a $500 ETF and a $150 single name comparable.
            </p>
          </Section>
          <Section title={famA ? `${compare.tickerA} and its family` : compare.tickerA}>
            <p className="text-[11px] text-textSecondary leading-relaxed">
              {famA ? `${famA.etf} tracks ${famA.index} at about ${famA.ratio}× and ${famA.futures} carries roughly ${famA.baseBasis} points over cash. The index and the futures have no simulated chain yet; they join this picker the day their books exist.` : 'A single name — no index twin. Compare it with its sector ETF for the structural read, or with any other name for an uncorrelated look.'}
            </p>
          </Section>
          <Section title={famB ? `${compare.tickerB} and its family` : compare.tickerB}>
            <p className="text-[11px] text-textSecondary leading-relaxed">
              {famB ? `${famB.etf} tracks ${famB.index} at about ${famB.ratio}× and ${famB.futures} carries roughly ${famB.baseBasis} points over cash.` : 'A single name — no index twin.'} Turnover {turnover.b === null ? 'is not measurable yet on this history' : `about ${fmtUsd(turnover.b)} a session`}, which is the divisor the impact mode uses.
            </p>
          </Section>
        </Bench>
      </Deck>
    </>
  );
};

export default Compare;
