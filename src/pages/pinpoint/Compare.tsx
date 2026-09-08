import { useMemo, useState } from 'react';
import Simulator from '../../core/simulator';
import { COMPARE_MODE_WORDS, REACH_PCT, buildExposureCompare, compareWords, dollarTurnover, type CompareMode } from '../../data/exposureCompare';
import { twinFamilyFor } from '../../data/indexTwins';
import { fmtUsd } from '../../data/gex';
import DataState from '../../components/ui/DataState';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import { heatInk, heatRgb } from '../../components/gex/heatmap';
import { Cell, Deck, DeskLoading, Divider, Figure, Legend, Method, Note, Pane, Read, Region, Row, Segmented, Select, Surface, TYPE, Table, Tag, Toolbar } from '../../components/pinpoint/Desk';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { CALL_WALL, FLIP, INK, PUT_WALL, SELECT, SPOT, WARN } from '../../components/pinpoint/ink';

/*
==================================================
  SLAYER TERMINAL - COMPARE (pages/pinpoint/Compare.tsx)
  Two books on one axis — where their positioning diverges.
==================================================

  THE QUESTION: are these two names positioned the same way. THE ACTION:
  pick the partner and the normalisation.

  Two names have two spots and two dollar scales, so the engine puts
  both on ONE axis — percent from each book's own spot, in quarter-
  percent buckets — and normalises each book so a reader compares WHERE
  the exposure sits rather than how big the names are. The mirror is the
  picture: the left book grows left, the right book grows right, and a
  lopsided row is a disagreement.

  WHAT MOVED IN THE REDESIGN. Four prose cards — the axis, each name's
  family, the normalisation — became the Method and one line. The answer
  in words is the desk's one box.
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

  /* The picker leads with the correlated names — a divergence between
     siblings is a signal; everything else stays reachable. */
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
      <DeskLoading>
        <DataState kind="loading" title="Awaiting both books" body="Two chains are needed before there is a comparison." />
      </DeskLoading>
    );
  }

  const maxShare = Math.max(...compare.buckets.map(b => Math.max(Math.abs(b.a), Math.abs(b.b))), 1e-9);
  const rowsDesc = [...compare.buckets].sort((a, b) => b.pct - a.pct);
  const famA = twinFamilyFor(compare.tickerA);
  const famB = twinFamilyFor(compare.tickerB);
  const fell = compare.mode !== compare.modeRequested;
  const pctLabel = (v: number | null) => (v === null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`);
  const CORRELATED_OPTIONS = correlated.map(t => {
    const fam = twinFamilyFor(t);
    return { value: t, label: fam ? `${t} · ${fam.index}` : t, title: fam ? `${fam.etf} · ${fam.index} · ${fam.futures}` : t };
  });
  const REST_OPTIONS = [{ value: '', label: 'any other name…' }, ...rest.map(t => ({ value: t, label: t }))];

  const hero = (
    <Region
      title={`${compare.tickerA} vs ${compare.tickerB}`}
      note={`each book’s share of its own ${compare.mode === 'shape' ? 'total gamma' : 'dollar turnover'} in every quarter-percent from its own spot — a lopsided row is a disagreement`}
    >
      <div className={`grid grid-cols-[1fr_64px_1fr_72px] items-center px-3 pb-1 ${TYPE.label} text-textMuted`}>
        <span className="text-right pr-2" style={{ color: SPOT }}>
          {compare.tickerA}
        </span>
        <span className="text-center">% from spot</span>
        <span className="pl-2" style={{ color: SPOT }}>
          {compare.tickerB}
        </span>
        <span className="text-right">diverge</span>
      </div>
      <Pane className="max-h-[620px] px-3 py-2" data-compare-rows>
        {rowsDesc.map((b, i) => {
          const wa = (Math.abs(b.a) / maxShare) * 100;
          const wb = (Math.abs(b.b) / maxShare) * 100;
          const widest = compare.widest !== null && b.pct === compare.widest.pct;
          const spotRow = i > 0 && rowsDesc[i - 1].pct > 0 && b.pct <= 0;
          return (
            <div key={b.pct} className={`grid grid-cols-[1fr_64px_1fr_72px] items-center py-px ${widest ? 'outline outline-1 -outline-offset-1 outline-select/60 bg-select/[0.04]' : ''}`} style={spotRow ? { borderTop: `2px solid ${SPOT}` } : undefined} data-bucket={b.pct} data-widest={widest || undefined}>
              <div className="flex justify-end pr-2">
                <span className="h-[9px]" style={{ width: `${wa}%`, background: rgb(heatRgb(b.a, maxShare)) }} title={`${compare.tickerA} ${b.pct.toFixed(2)}%: ${(b.a * 100).toFixed(2)}%`} />
              </div>
              <span className={`text-center ${TYPE.label} tracking-normal tnum text-textSecondary`}>{b.pct === 0 ? 'spot' : `${b.pct > 0 ? '+' : ''}${b.pct.toFixed(2)}`}</span>
              <div className="flex justify-start pl-2">
                <span className="h-[9px]" style={{ width: `${wb}%`, background: rgb(heatRgb(b.b, maxShare)) }} title={`${compare.tickerB} ${b.pct.toFixed(2)}%: ${(b.b * 100).toFixed(2)}%`} />
              </div>
              <span className={`text-right ${TYPE.label} tracking-normal tnum ${widest ? 'text-select font-bold' : Math.abs(b.divergence) > 0.5 * Math.abs(compare.widest?.divergence ?? 1) ? 'text-textPrimary' : 'text-textMuted'}`}>{(b.divergence * 100).toFixed(1)}</span>
            </div>
          );
        })}
      </Pane>
      <div className="pt-3">
        <Legend items={[{ ink: heatInk.pos, label: 'amplifies (put-heavy)' }, { ink: heatInk.neg, label: 'absorbs (call-heavy)' }, { ink: SPOT, label: 'each book’s own spot' }, { ink: SELECT, label: 'ring — widest disagreement' }]} />
      </div>
    </Region>
  );

  const rail = (
    <>
      {/* The answer, in words and one figure — the desk's one box. */}
      <Surface title="How differently are they positioned" note="total absolute divergence across the axis — zero is two identical shapes">
        <div className="flex items-end gap-4 flex-wrap">
          <Figure label="Divergence" value={compare.totalDivergence.toFixed(2)} size="lead" />
          {compare.widest && <Figure label="Widest at" value={`${compare.widest.pct > 0 ? '+' : ''}${compare.widest.pct.toFixed(2)}%`} ink={SELECT} sub={`${compare.tickerA} ${(compare.widest.a * 100).toFixed(1)}% vs ${compare.tickerB} ${(compare.widest.b * 100).toFixed(1)}%`} />}
        </div>
        <Read className="pt-3">{compareWords(compare)}</Read>
      </Surface>

      <Region title="The levels, side by side">
        <Table
          data-compare-levels
          cols={[
            { key: 'level', label: 'Level' },
            { key: 'a', label: compare.tickerA, align: 'right' },
            { key: 'b', label: compare.tickerB, align: 'right' },
          ]}
        >
          {(
            [
              { label: 'Call wall', ink: CALL_WALL, k: 'callWall' },
              { label: 'Put wall', ink: PUT_WALL, k: 'putWall' },
              { label: 'Flip', ink: FLIP, k: 'flip' },
            ] as const
          ).map(r => (
            <Row key={r.k}>
              <Cell className={`${TYPE.label} font-bold`} style={{ color: r.ink }}>
                {r.label}
              </Cell>
              <Cell num className="text-textPrimary">
                {pctLabel(compare.levels.a[r.k])}
              </Cell>
              <Cell num className="text-textPrimary">
                {pctLabel(compare.levels.b[r.k])}
              </Cell>
            </Row>
          ))}
        </Table>
      </Region>

      <Region title="Which normalisation" actions={<Tag ink={fell ? WARN : INK.secondary}>{compare.mode}{fell ? ' · fell back' : ''}</Tag>}>
        <p className={`${TYPE.body} text-textSecondary`}>{COMPARE_MODE_WORDS[compare.mode].note}</p>
        {fell && (
          <p className={`${TYPE.body} text-warn pt-2`} data-compare-fallback>
            Impact was asked for, but {turnover.a === null ? compare.tickerA : compare.tickerB} has no measurable dollar turnover yet (the bar history is too thin), so the comparison fell back
            to shape rather than divide by a guess.
          </p>
        )}
      </Region>
    </>
  );

  return (
    <>
      <Toolbar data-compare-controls>
        <span className={`${TYPE.label} text-textMuted`}>Against</span>
        {correlated.length > 0 && <Segmented ariaLabel="Correlated names" options={CORRELATED_OPTIONS} value={partner} onChange={setOther} />}
        <Select ariaLabel="Any other name" options={REST_OPTIONS} value={rest.includes(partner) ? partner : ''} onChange={setOther} />
        <Divider />
        <Segmented ariaLabel="Normalisation" options={MODE_OPTIONS} value={mode} onChange={setMode} />
        <ProvenanceChip sources={['chain', 'exposure']} className="ml-auto" />
        <span className={`${TYPE.label} text-textMuted tnum`}>scan {scanAt} · 10s</span>
      </Toolbar>

      <Deck hero={hero} rail={rail}>
        <Method>
          <Note term="The axis">
            Quarter-percent buckets, {REACH_PCT}% each way from each book’s own spot. A shelf 2% overhead is 2% overhead in both names, whatever their prices — that is what makes a
            $500 ETF and a $150 single name comparable.
          </Note>
          <Note term="Shape">{COMPARE_MODE_WORDS.shape.note}</Note>
          <Note term="Impact">{COMPARE_MODE_WORDS.impact.note}</Note>
          <Note term={famA ? `${compare.tickerA} and its family` : compare.tickerA}>
            {famA
              ? `${famA.etf} tracks ${famA.index} at about ${famA.ratio}× and ${famA.futures} carries roughly ${famA.baseBasis} points over cash. The index and the futures have no simulated chain yet; they join this picker the day their books exist.`
              : 'A single name — no index twin. Compare it with its sector ETF for the structural read, or with any other name for an uncorrelated look.'}
          </Note>
          <Note term={famB ? `${compare.tickerB} and its family` : compare.tickerB}>
            {famB ? `${famB.etf} tracks ${famB.index} at about ${famB.ratio}× and ${famB.futures} carries roughly ${famB.baseBasis} points over cash.` : 'A single name — no index twin.'} Turnover{' '}
            {turnover.b === null ? 'is not measurable yet on this history' : `about ${fmtUsd(turnover.b)} a session`}, which is the divisor the impact mode uses.
          </Note>
        </Method>
      </Deck>
    </>
  );
};

export default Compare;
