import { useMemo, useState } from 'react';
import Simulator from '../../core/simulator';
import { COMPARE_MODE_WORDS, REACH_PCT, buildExposureCompare, compareWords, dollarTurnover, type CompareMode } from '../../data/exposureCompare';
import { twinFamilyFor } from '../../data/indexTwins';
import { fmtUsd } from '../../data/gex';
import DataState from '../../components/ui/DataState';
import { DeskLoading, Divider, Figure, Group, Legend, Read, Segmented, Select, Stat, TYPE, Tag, Toolbar, Workspace } from '../../components/pinpoint/Desk';
import StrikeProfile, { type ProfileLevel, type ProfileRow } from '../../components/pinpoint/StrikeProfile';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { heatInk } from '../../components/gex/heatmap';
import { CALL_WALL, FLIP, INK, PUT_WALL, SELECT, SPOT, WARN } from '../../components/pinpoint/ink';

/*
  COMPARE — two books on one axis. Percent from each book's own spot in
  quarter-percent buckets, each book normalised to itself; the left book
  grows left, the right grows right, and a lopsided row is a disagreement.
*/

const MODE_OPTIONS = [
  { value: 'shape', label: 'Shape' },
  { value: 'impact', label: 'Impact' },
] as const;
type LevelKey = 'callWall' | 'putWall' | 'flip';
const LEVELS: { k: LevelKey; label: string; tag: string; ink: string }[] = [
  { k: 'callWall', label: 'Call wall', tag: 'CW', ink: CALL_WALL },
  { k: 'putWall', label: 'Put wall', tag: 'PW', ink: PUT_WALL },
  { k: 'flip', label: 'Flip', tag: 'FL', ink: FLIP },
];
const pctRow = (v: number) => (v === 0 ? 'spot' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`);
const pctLabel = (v: number | null) => (v === null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`);
const share = (v: number) => `${(Math.abs(v) * 100).toFixed(1)}%`;

const Compare = () => {
  const { snapshot, scanAt } = useScanSnapshot();
  const [other, setOther] = useState<string>('');
  const [mode, setMode] = useState<CompareMode>('shape');
  const [hover, setHover] = useState<number | null>(null);
  const [shown, setShown] = useState<LevelKey | null>('flip');

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const rows: ProfileRow[] = [...compare.buckets]
    .sort((a, b) => b.pct - a.pct)
    .map(b => ({ strike: b.pct, values: { a: b.a, b: b.b }, ink: compare.widest && b.pct === compare.widest.pct ? SELECT : undefined }));
  const famA = twinFamilyFor(compare.tickerA);
  const famB = twinFamilyFor(compare.tickerB);
  const fell = compare.mode !== compare.modeRequested;
  const hovered = hover !== null ? (compare.buckets.find(b => b.pct === hover) ?? null) : null;
  const levels: ProfileLevel[] = [{ kind: 'spot', price: 0, tag: 'SPOT', ink: SPOT }];
  if (compare.widest) levels.push({ kind: 'custom', price: compare.widest.pct, tag: 'WIDE', ink: SELECT, dashed: true });
  if (shown) {
    const L = LEVELS.find(l => l.k === shown)!;
    const a = compare.levels.a[shown];
    const b = compare.levels.b[shown];
    if (a !== null) levels.push({ kind: shown === 'flip' ? 'flip' : shown === 'callWall' ? 'call-wall' : 'put-wall', price: a, tag: `${L.tag} ${compare.tickerA}`, ink: L.ink });
    if (b !== null) levels.push({ kind: 'custom', price: b, tag: `${L.tag} ${compare.tickerB}`, ink: L.ink, dashed: true });
  }
  const CORRELATED_OPTIONS = correlated.map(t => {
    const fam = twinFamilyFor(t);
    return { value: t, label: fam ? `${t} · ${fam.index}` : t, title: fam ? `${fam.etf} · ${fam.index} · ${fam.futures}` : t };
  });
  const REST_OPTIONS = [{ value: '', label: 'any other name…' }, ...rest.map(t => ({ value: t, label: t }))];

  return (
    <Workspace
      toolbar={
        <Toolbar data-compare-controls>
          <span className={`${TYPE.label} text-textMuted`}>{compare.tickerA} against</span>
          {correlated.length > 0 && <Segmented ariaLabel="Correlated names" options={CORRELATED_OPTIONS} value={partner} onChange={setOther} />}
          <Select ariaLabel="Any other name" options={REST_OPTIONS} value={rest.includes(partner) ? partner : ''} onChange={setOther} />
          <Divider />
          <Segmented ariaLabel="Normalisation" options={MODE_OPTIONS} value={mode} onChange={setMode} />
          {fell && (
            <Tag ink={WARN} title={`Impact was asked for, but ${turnover.a === null ? compare.tickerA : compare.tickerB} has no measurable dollar turnover yet, so the comparison fell back to shape rather than divide by a guess.`}>
              fell back to shape
            </Tag>
          )}
          <span className={`${TYPE.label} text-textMuted tnum ml-auto`}>scan {scanAt}</span>
        </Toolbar>
      }
      picture={
        <>
          <div className={`grid grid-cols-[1fr_auto_1fr] items-baseline px-8 ${TYPE.label} text-textSecondary`} data-compare-heads>
            <span className="text-right pr-3 font-bold" style={{ color: INK.primary }}>
              {compare.tickerA}
            </span>
            <span className="text-textMuted">% from own spot</span>
            <span className="pl-3 font-bold" style={{ color: INK.primary }}>
              {compare.tickerB}
            </span>
          </div>
          <StrikeProfile
            mode="mirror"
            rows={rows}
            series={[
              { key: 'a', label: compare.tickerA, side: 'left', ink: 'heat' },
              { key: 'b', label: compare.tickerB, side: 'right', ink: 'heat' },
            ]}
            maxAbs={maxShare}
            levels={levels}
            fmt={share}
            fmtRow={pctRow}
            figures
            hoverStrike={hover}
            onHover={setHover}
            ariaLabel={`${compare.tickerA} on the left and ${compare.tickerB} on the right, each book's share of its own ${compare.mode === 'shape' ? 'gamma' : 'turnover'} in every quarter percent within ${REACH_PCT}% of its own spot. Widest disagreement ${compare.widest ? pctRow(compare.widest.pct) : 'none'}.`}
          />
          <Legend className="pt-1" items={[{ ink: heatInk.pos, label: 'amplifies' }, { ink: heatInk.neg, label: 'absorbs' }, { ink: SPOT, label: 'each book’s own spot' }, { ink: SELECT, label: 'widest disagreement', dashed: true }]} />
        </>
      }
      inspector={
        <>
          <Group title="Divergence" data-group="divergence">
            <Stat label="Total" value={compare.totalDivergence.toFixed(2)} sub="absolute, across the axis — zero is two identical shapes" />
            <Stat label="Widest at" value={compare.widest ? pctLabel(compare.widest.pct) : '—'} ink={SELECT} sub={compare.widest ? `${compare.tickerA} ${share(compare.widest.a)} · ${compare.tickerB} ${share(compare.widest.b)}` : undefined} />
            {hovered && (
              <Stat label={`Bucket ${pctLabel(hovered.pct)}`} value={`${share(hovered.a)} · ${share(hovered.b)}`} sub={`diverge ${(hovered.divergence * 100).toFixed(1)} — ${hovered.divergence > 0 ? compare.tickerA : compare.tickerB} heavier`} data-bucket={hovered.pct} />
            )}
          </Group>
          <Group title="Levels · % from own spot" actions={<span className={`${TYPE.label} text-textMuted tnum`}>{compare.tickerA} · {compare.tickerB}</span>} data-compare-levels>
            {LEVELS.map(l => (
              <Stat
                key={l.k}
                label={<span style={{ color: l.ink }}>{l.label}</span>}
                value={`${pctLabel(compare.levels.a[l.k])} · ${pctLabel(compare.levels.b[l.k])}`}
                onSelect={() => setShown(s => (s === l.k ? null : l.k))}
                selected={shown === l.k}
                sub={shown === l.k ? 'drawn on the picture' : undefined}
                data-level-pair={l.k}
              />
            ))}
          </Group>
          <Group title="Normalisation" actions={<Tag ink={fell ? WARN : INK.secondary}>{compare.mode}</Tag>} data-group="normalisation">
            <Stat label="Asked" value={compare.modeRequested} />
            <Stat label="Applied" value={compare.mode} ink={fell ? WARN : undefined} sub={COMPARE_MODE_WORDS[compare.mode].label} />
            {fell && (
              <Stat label="Why" value="no turnover" ink={WARN} sub={`${turnover.a === null ? compare.tickerA : compare.tickerB} has no measurable dollar turnover on this history`} data-compare-fallback />
            )}
            <Stat label={`${compare.tickerA} turnover`} value={turnover.a === null ? '—' : fmtUsd(turnover.a)} sub="a session, the impact divisor" />
            <Stat label={`${compare.tickerB} turnover`} value={turnover.b === null ? '—' : fmtUsd(turnover.b)} />
          </Group>
          <Group title="Family" data-group="family">
            <Stat label={compare.tickerA} value={famA ? famA.index : 'single name'} sub={famA ? `${famA.etf} ≈ ${famA.index} ÷ ${famA.ratio} · ${famA.futures} +${famA.baseBasis} pts` : 'no index twin'} />
            <Stat label={compare.tickerB} value={famB ? famB.index : 'single name'} sub={famB ? `${famB.etf} ≈ ${famB.index} ÷ ${famB.ratio} · ${famB.futures} +${famB.baseBasis} pts` : 'no index twin'} />
          </Group>
        </>
      }
      strip={
        <>
          <Figure label="Divergence" value={compare.totalDivergence.toFixed(2)} size="lead" sub="0 = the same shape" />
          <Figure label="Widest at" value={compare.widest ? pctLabel(compare.widest.pct) : '—'} ink={SELECT} />
          <Figure label="Axis" value={`±${REACH_PCT}%`} sub="quarter-percent buckets" />
          <Figure label="Books" value={`${compare.tickerA} · ${compare.tickerB}`} sub={compare.mode} />
          <Read>{compareWords(compare)}</Read>
        </>
      }
    />
  );
};

export default Compare;
