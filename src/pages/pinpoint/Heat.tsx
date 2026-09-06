import { useMemo, useState } from 'react';
import Simulator from '../../core/simulator';
import { CONCENTRATED, LADDER_COLUMNS, buildExpiryLadder, rowWords as ladderWords, wallOwnership } from '../../data/expiryLadder';
import { OI_KIND_WORDS, buildOiHeat, classifyOiRow, rowWords as oiWords, type OiRowKind } from '../../data/oiHeat';
import { buildOiExplorer, oiRead, type OiSort } from '../../data/oiExplorer';
import { STRIKE_WINDOWS, type StrikeWindow } from '../../data/exposure';
import { fmtUsd } from '../../data/gex';
import { fmtContracts as fmtCount } from '../../data/strikeFlow';
import type { ExposureExpiry } from '../../types/gex';
import DataState from '../../components/ui/DataState';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { OiAsOf, lastOiSettlement } from '../../components/ui/AsOf';
import { heatInk } from '../../components/gex/heatmap';
import { Bench, Deck, Figure, Legend, Read, Section, Tag } from '../../components/pinpoint/Desk';
import HeatGrid, { type HeatColumn, type HeatRow } from '../../components/pinpoint/HeatGrid';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { CALL_WALL, FLIP, LONG_GAMMA, PUT_WALL, SHORT_GAMMA, fmtStrike } from '../../components/pinpoint/ink';

/*
==================================================
  SLAYER TERMINAL - HEAT (pages/pinpoint/Heat.tsx)
  The book as a grid: by expiry, and by what changed today.
  Rebuilt from zero, 2026-09-06.
==================================================

  Two questions used to be two desks — "which expiry owns this strike"
  (the Expiry Ladder) and "what was built or unwound here today" (ΔOI
  Heat) — and they are the same picture with a different thing in the
  cells: strikes down, columns across, colour for the number. One grid,
  one lens switch. SpotGamma's TRACE is the reference: the strike × expiry
  heatmap is how a reader sees at a glance whether a wall is a 0DTE
  artifact that evaporates at the bell or structure that carries.

  THE HONESTY AFFORDANCE the checklist calls the most important in the
  section: intraday open interest is an ESTIMATE until the exchange's
  settlement file lands the next morning. Every cell that is still an
  estimate wears a dashed edge and its column header a dashed underline;
  a settled cell is solid. A reader can see which of these facts have
  landed without reading a footnote — though the footnote is here too,
  behind a door.
*/

const LENS_OPTIONS = [
  { value: 'expiry', label: 'By expiry' },
  { value: 'change', label: 'Change today' },
] as const;
const WINDOW_OPTIONS = STRIKE_WINDOWS.map(w => ({ value: String(w), label: `±${w}` }));
const BUCKET_OPTIONS = [
  { value: '6', label: '6 buckets' },
  { value: '8', label: '8' },
  { value: '12', label: '12' },
] as const;
const SORT_OPTIONS: { value: OiSort; label: string }[] = [
  { value: 'absolute', label: 'Largest' },
  { value: 'percent', label: 'Fastest' },
  { value: 'closed', label: 'Closed out' },
];

const EXPIRY_NOTE: Record<ExposureExpiry, string> = {
  '0DTE': 'dies at the bell',
  '1D': 'tomorrow',
  '2D': 'two sessions',
  '5D': 'the week',
  '7D': 'next week',
  OPEX: 'monthly',
  ALL: 'whole book',
};

const KIND_INK: Record<OiRowKind, string> = {
  build: LONG_GAMMA,
  unwind: SHORT_GAMMA,
  churn: '#F2C94C',
  flat: '#7d7d7d',
};

const hhmm = (t: number) => {
  const d = new Date(t * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
/** Signed contracts, on the shared column formatter. */
const fmtContracts = (v: number) => (Math.round(v) === 0 ? '0' : `${v > 0 ? '+' : '−'}${fmtCount(Math.abs(v))}`);

const Heat = () => {
  const { snapshot, scanAt } = useScanSnapshot();
  const [lens, setLens] = useState<'expiry' | 'change'>('expiry');
  const [half, setHalf] = useState<StrikeWindow>(15);
  const [buckets, setBuckets] = useState<6 | 8 | 12>(8);
  const [sort, setSort] = useState<OiSort>('absolute');
  const [hover, setHover] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [door, setDoor] = useState(false);

  const ladder = useMemo(() => (snapshot ? buildExpiryLadder(snapshot, half) : null), [snapshot, half]);
  const owners = useMemo(() => (ladder ? wallOwnership(ladder) : null), [ladder]);
  const oi = useMemo(() => {
    if (!snapshot) return null;
    return buildOiHeat(Simulator.getGexHistory(snapshot.ticker) ?? [], Simulator.getCandles(snapshot.ticker) ?? [], buckets);
  }, [snapshot, buckets]);
  const overnight = useMemo(() => (snapshot ? buildOiExplorer(snapshot.ticker, sort, 12) : null), [snapshot, sort]);
  const settledAt = useMemo(() => lastOiSettlement().getTime() / 1000, [scanAt]);

  if (!snapshot || !ladder) {
    return (
      <Section title="Heat">
        <DataState kind="loading" title="Laying out the book" body="The first tick has not arrived yet." />
      </Section>
    );
  }

  const spot = snapshot.spot;
  const wallInk = (strike: number) => (owners?.call?.strike === strike ? CALL_WALL : owners?.put?.strike === strike ? PUT_WALL : undefined);

  /* ---- the two grids ------------------------------------------------------ */
  const expiryColumns: HeatColumn[] = LADDER_COLUMNS.map(c => ({ key: c, label: c === 'ALL' ? 'All' : c, note: EXPIRY_NOTE[c] }));
  const expiryRows: HeatRow[] = ladder.rows.map(r => ({
    strike: r.strike,
    title: `${fmtStrike(r.strike)}: ${ladderWords(r)}`,
    ink: wallInk(r.strike),
    tag: r.dominant && r.dominantShare !== null && r.dominantShare >= CONCENTRATED ? <Tag ink={FLIP} title={`${Math.round(r.dominantShare * 100)}% of this strike's dated gamma sits in one expiry`}>{r.dominant} {Math.round(r.dominantShare * 100)}%</Tag> : undefined,
    cells: r.cells.map(c => ({ col: c.expiry, value: c.netGex, hot: r.dominant === c.expiry && (r.dominantShare ?? 0) >= CONCENTRATED, title: `${fmtStrike(r.strike)} · ${c.expiry}: ${fmtUsd(c.netGex)}` })),
  }));

  const changeColumns: HeatColumn[] = (oi?.columns ?? []).map(t => ({ key: String(t), label: hhmm(t), estimated: t > settledAt, note: t > settledAt ? 'est.' : 'settled' }));
  const kinds = new Map<number, OiRowKind>();
  const changeRows: HeatRow[] = (oi?.rows ?? []).map(r => {
    const kind = classifyOiRow(r);
    kinds.set(r.strike, kind);
    return {
      strike: r.strike,
      title: `${fmtStrike(r.strike)}: ${OI_KIND_WORDS[kind].label.toLowerCase()} — ${oiWords(r)}`,
      ink: kind === 'flat' ? undefined : KIND_INK[kind],
      tag: kind === 'flat' ? undefined : <Tag ink={KIND_INK[kind]}>{OI_KIND_WORDS[kind].label}</Tag>,
      cells: r.cells.map(c => ({ col: String(c.time), value: c.deltaOi, text: fmtContracts(c.deltaOi), estimated: c.time > settledAt, title: `${fmtStrike(r.strike)} · ${hhmm(c.time)}: ${fmtContracts(c.deltaOi)} contracts (calls ${fmtContracts(c.deltaCall)}, puts ${fmtContracts(c.deltaPut)})` })),
    };
  });
  const tally = { build: 0, unwind: 0, churn: 0, flat: 0 } as Record<OiRowKind, number>;
  kinds.forEach(k => (tally[k] += 1));
  const netContracts = (oi?.rows ?? []).reduce((a, r) => a + r.netToday, 0);
  const focusStrike = picked ?? hover;
  const focusLadder = focusStrike !== null ? ladder.rows.find(r => r.strike === focusStrike) : undefined;
  const focusOi = focusStrike !== null ? oi?.rows.find(r => r.strike === focusStrike) : undefined;
  const perExpiry = LADDER_COLUMNS.filter(c => c !== 'ALL').map(c => ({ c, total: ladder.rows.reduce((a, r) => a + Math.abs(r.cells.find(x => x.expiry === c)?.netGex ?? 0), 0) }));
  const datedTotal = perExpiry.reduce((a, x) => a + x.total, 0) || 1;

  const hero = (
    <Section
      title={lens === 'expiry' ? 'The book by expiry' : 'What changed today'}
      question={
        lens === 'expiry'
          ? 'net dealer gamma at each strike, split by the expiry that carries it — a ringed cell holds half or more of that strike’s dated gamma, so its wall is that expiry’s wall'
          : 'open interest added or removed at each strike through the session — dashed cells are still estimates and settle overnight'
      }
      accent={lens === 'expiry' ? FLIP : LONG_GAMMA}
      actions={<OiAsOf />}
      flush
      className="h-full"
      bodyClassName="flex flex-col"
    >
      {lens === 'expiry' ? (
        <HeatGrid columns={expiryColumns} rows={expiryRows} maxAbs={ladder.maxAbs} spot={spot} fmt={fmtUsd} hoverStrike={hover} onHover={setHover} onSelect={s => setPicked(p => (p === s ? null : s))} selectedStrike={picked} className="max-h-[640px]" dense />
      ) : !oi || !oi.hasOi || oi.rows.length === 0 ? (
        <DataState kind="empty" title="No change to draw yet" body="The session needs two snapshots that carry open interest before there is a delta between them." />
      ) : (
        <HeatGrid columns={changeColumns} rows={changeRows} maxAbs={oi.maxAbs} spot={spot} fmt={fmtContracts} hoverStrike={hover} onHover={setHover} onSelect={s => setPicked(p => (p === s ? null : s))} selectedStrike={picked} className="max-h-[640px]" dense />
      )}
      <div className="mt-auto border-t border-borderSubtle px-3.5 py-2 flex items-center gap-4 flex-wrap">
        {lens === 'expiry' ? (
          <Legend items={[{ ink: heatInk.pos, label: 'amplifies (put-heavy)' }, { ink: heatInk.neg, label: 'absorbs (call-heavy)' }, { ink: '#D2FF00', label: 'ring — one expiry owns ≥ 50%' }, { ink: CALL_WALL, label: 'call wall row' }, { ink: PUT_WALL, label: 'put wall row' }]} />
        ) : (
          <Legend items={[{ ink: heatInk.pos, label: 'contracts added' }, { ink: heatInk.neg, label: 'contracts removed' }, { ink: '#ededed', label: 'dashed — estimated until T+1', dashed: true }, { ink: KIND_INK.build, label: 'building' }, { ink: KIND_INK.unwind, label: 'unwinding' }, { ink: KIND_INK.churn, label: 'churn' }]} />
        )}
      </div>
    </Section>
  );

  const rail =
    lens === 'expiry' ? (
      <>
        <Section title="Who owns the walls" question="a wall that lives in today’s expiry is gone at the bell; one in the whole book is structure" accent={FLIP}>
          {owners && (owners.call || owners.put) ? (
            <div className="flex flex-col gap-3" data-wall-owners>
              {owners.call && (
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider" style={{ color: CALL_WALL }}>
                      Call wall
                    </span>
                    <span className="font-mono text-[15px] font-bold tnum text-textPrimary">{fmtStrike(owners.call.strike)}</span>
                  </div>
                  <p className="text-[11px] text-textSecondary leading-snug">{owners.call.words}</p>
                </div>
              )}
              {owners.put && (
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider" style={{ color: PUT_WALL }}>
                      Put wall
                    </span>
                    <span className="font-mono text-[15px] font-bold tnum text-textPrimary">{fmtStrike(owners.put.strike)}</span>
                  </div>
                  <p className="text-[11px] text-textSecondary leading-snug">{owners.put.words}</p>
                </div>
              )}
            </div>
          ) : (
            <DataState kind="empty" title="No walls on this window" pad="sm" />
          )}
        </Section>
        <Section title={focusLadder ? `Strike ${fmtStrike(focusLadder.strike)}` : 'Point at a strike'} question={focusLadder ? 'which expiry carries it, and how much' : 'hover a row for its owner; click to hold it'} accent="#D2FF00">
          {focusLadder ? (
            <>
              <Read ink={focusLadder.dominant && (focusLadder.dominantShare ?? 0) >= CONCENTRATED ? FLIP : '#a3a3a3'}>{ladderWords(focusLadder)}</Read>
              <div className="mt-3 flex flex-col gap-1">
                {focusLadder.cells
                  .filter(c => c.expiry !== 'ALL')
                  .map(c => {
                    const share = Math.abs(c.netGex) / (focusLadder.cells.filter(x => x.expiry !== 'ALL').reduce((a, x) => a + Math.abs(x.netGex), 0) || 1);
                    return (
                      <div key={c.expiry} className="grid grid-cols-[44px_1fr_auto] items-center gap-2 font-mono text-[10px] tnum">
                        <span className="text-textSecondary">{c.expiry}</span>
                        <span className="h-[6px] rounded-sm bg-white/[0.05] overflow-hidden">
                          <span className="block h-full rounded-sm" style={{ width: `${share * 100}%`, background: c.netGex >= 0 ? heatInk.pos : heatInk.neg }} />
                        </span>
                        <span className="text-textPrimary">{fmtUsd(c.netGex)}</span>
                      </div>
                    );
                  })}
              </div>
            </>
          ) : (
            <p className="text-[11px] text-textMuted leading-relaxed">The ring marks a strike whose dated gamma is at least half in one expiry. Those are the walls that vanish at that expiry’s bell; a wall with no ring is spread across the book and carries.</p>
          )}
        </Section>
        <Section title="Where the gamma lives" question="each dated expiry’s share of the window’s gamma" accent={heatInk.pos}>
          <div className="flex flex-col gap-1.5" data-expiry-shares>
            {perExpiry.map(x => (
              <div key={x.c} className="grid grid-cols-[44px_1fr_auto] items-center gap-2 font-mono text-[10px] tnum">
                <span className="text-textSecondary">{x.c}</span>
                <span className="h-[6px] rounded-sm bg-white/[0.05] overflow-hidden">
                  <span className="block h-full rounded-sm" style={{ width: `${(x.total / datedTotal) * 100}%`, background: FLIP }} />
                </span>
                <span className="text-textPrimary">{Math.round((x.total / datedTotal) * 100)}%</span>
              </div>
            ))}
          </div>
        </Section>
      </>
    ) : (
      <>
        <Section title="Today’s tally" question="how many strikes were built, unwound, or traded through" accent={LONG_GAMMA}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Figure label="Building" value={String(tally.build)} ink={KIND_INK.build} size="lg" sub="strikes adding contracts" />
            <Figure label="Unwinding" value={String(tally.unwind)} ink={KIND_INK.unwind} size="lg" sub="strikes shedding contracts" />
            <Figure label="Churn" value={String(tally.churn)} ink={KIND_INK.churn} size="lg" sub="put on and taken off" />
            <Figure label="Net contracts" value={fmtContracts(netContracts)} ink={netContracts >= 0 ? KIND_INK.build : KIND_INK.unwind} size="lg" sub="across the window today" />
          </div>
        </Section>
        <Section title={focusOi ? `Strike ${fmtStrike(focusOi.strike)}` : 'Point at a strike'} question={focusOi ? OI_KIND_WORDS[classifyOiRow(focusOi)].note : 'hover a row for its story; click to hold it'} accent="#D2FF00">
          {focusOi ? <Read ink={KIND_INK[classifyOiRow(focusOi)]} lead={OI_KIND_WORDS[classifyOiRow(focusOi)].label}>{oiWords(focusOi)}</Read> : <p className="text-[11px] text-textMuted leading-relaxed">A row’s colour is its verdict for the day; the cells are the path it took there. A BUILDING row that is green all the way across was put on steadily; one that flickers was fought over.</p>}
        </Section>
        <Section title="Intraday open interest is estimated" question="why some cells are dashed" accent="#a3a3a3" actions={<button onClick={() => setDoor(d => !d)} className="font-mono text-[9px] uppercase tracking-wider text-textSecondary hover:text-textPrimary" aria-expanded={door}>{door ? 'close' : 'explain'}</button>}>
          <p className="text-[11px] text-textSecondary leading-relaxed">
            Open interest is published once, overnight. During the session the desk infers it from the tape, and every inferred cell wears a dashed edge until the settlement file lands and makes it solid.
          </p>
          {door && (
            <div className="mt-2 text-[11px] text-textMuted leading-relaxed flex flex-col gap-1.5" data-oi-door>
              <p>An opening trade and a closing trade print identically on the tape; only the exchange knows, at settlement, which was which. The intraday figure assumes prints at a strike open new interest unless the strike’s own book says otherwise, and is usually close and occasionally very wrong — a large closing block reads as a build until the morning corrects it.</p>
              <p>Solid cells are settled: the bucket ended before {new Date(settledAt * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' })} ET and the file has landed. {oi?.hasFlex ? 'FLEX transfers are separated out.' : 'Transfers between books without a trade (FLEX) cannot be separated on this feed, so the cell is the whole change.'}</p>
            </div>
          )}
        </Section>
      </>
    );

  return (
    <>
      <div className="flex items-center gap-2.5 flex-wrap" data-heat-controls>
        <SegmentedControl ariaLabel="Heat lens" options={LENS_OPTIONS} value={lens} onChange={v => setLens(v)} />
        {lens === 'expiry' ? (
          <SegmentedControl ariaLabel="Strike window" options={WINDOW_OPTIONS} value={String(half)} onChange={v => setHalf(Number(v) as StrikeWindow)} />
        ) : (
          <SegmentedControl ariaLabel="Session buckets" options={BUCKET_OPTIONS} value={String(buckets)} onChange={v => setBuckets(Number(v) as 6 | 8 | 12)} />
        )}
        <ProvenanceChip sources={['chain', 'exposure']} className="ml-auto" />
        <span className="font-mono text-[10px] text-textMuted uppercase tracking-widest tnum">scan {scanAt} · 10s</span>
      </div>
      <Deck hero={hero} rail={rail}>
        {overnight && (
          <Bench cols={2}>
            <Section title="What settled overnight" question="the contracts that grew, shrank, or appeared from nothing in last night’s file" accent={heatInk.neg} actions={<SegmentedControl ariaLabel="Overnight sort" options={SORT_OPTIONS} value={sort} onChange={v => setSort(v)} />}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
                <Figure label="Grew" value={String(overnight.opened)} ink={KIND_INK.build} />
                <Figure label="Shrank" value={String(overnight.closed)} ink={KIND_INK.unwind} />
                <Figure label="Appeared" value={String(overnight.fresh)} sub="had none yesterday" />
                <Figure label="Net" value={fmtContracts(overnight.netChange)} ink={overnight.netChange >= 0 ? KIND_INK.build : KIND_INK.unwind} />
              </div>
              <p className="mt-2 text-[11px] text-textSecondary leading-relaxed">{oiRead(overnight, snapshot.ticker)}</p>
            </Section>
            <Section title="The largest moves" question={`${SORT_OPTIONS.find(s => s.value === sort)?.label.toLowerCase()} first · as of ${overnight.asOf}`} accent={heatInk.neg} flush>
              <div className="max-h-[300px] overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-panel">
                    <tr className="font-mono text-[9px] uppercase tracking-widest text-textMuted">
                      <th className="text-left font-medium px-3 py-1.5 border-b border-borderSubtle">Contract</th>
                      <th className="text-right font-medium px-2 py-1.5 border-b border-borderSubtle">Was</th>
                      <th className="text-right font-medium px-2 py-1.5 border-b border-borderSubtle">Now</th>
                      <th className="text-right font-medium px-3 py-1.5 border-b border-borderSubtle">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overnight.rows.map(r => (
                      <tr key={r.key} className="border-b border-borderSubtle/40 font-mono text-[11px] tnum">
                        <td className="px-3 py-1.5 text-textPrimary">
                          {fmtStrike(r.strike)}
                          <span style={{ color: r.right === 'C' ? CALL_WALL : PUT_WALL }}>{r.right}</span>
                          <span className="ml-2 text-[9px] text-textMuted">{r.expiry} · {r.dte}d</span>
                          {r.wasEmpty && <Tag ink="#ededed" className="ml-2">new</Tag>}
                        </td>
                        <td className="px-2 py-1.5 text-right text-textMuted">{r.prevOi.toLocaleString('en-US')}</td>
                        <td className="px-2 py-1.5 text-right text-textPrimary">{r.oi.toLocaleString('en-US')}</td>
                        <td className="px-3 py-1.5 text-right font-semibold" style={{ color: r.change >= 0 ? KIND_INK.build : KIND_INK.unwind }}>
                          {fmtContracts(r.change)}
                          {r.changePct !== null && <span className="ml-1 text-[9px] font-normal text-textMuted">{r.changePct > 0 ? '+' : ''}{Math.round(r.changePct)}%</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          </Bench>
        )}
      </Deck>
    </>
  );
};

export default Heat;
