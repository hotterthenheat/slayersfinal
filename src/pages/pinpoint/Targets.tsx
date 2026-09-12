import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, RotateCcw } from 'lucide-react';
import Simulator from '../../core/simulator';
import { FACTOR_LABEL, RANK_FACTORS, RANK_LENSES, RANK_WEIGHTS, WEIGHTS_ARE_FITTED, WEIGHTS_NOTE, buildRankedTargets, explainEdge, rankBy, weightsAreDefault, type RankWeights } from '../../data/rankedtargets';
import { fmtDistance, impliedDaySigma, sessionAtr, type DistanceScales } from '../../data/atr';
import { useDistanceUnit } from '../../data/distanceUnits';
import { fmtUsd } from '../../data/gex';
import type { HedgingClass, RankFactor, RankLens, RankedTarget } from '../../types/gex';
import DataState from '../../components/ui/DataState';
import { CONTROL, CONTROL_OFF, CONTROL_OUTLINE, DeskLoading, Figure, Group, Read, Segmented, Select, Stat, TYPE, Tag, Toolbar, Workspace, useDeskChoice } from '../../components/pinpoint/Desk';
import { useIsBelowLg, useMediaQuery } from '../../components/ui/useMediaQuery';
import StrikeProfile, { type ProfileRow, type ProfileSeries } from '../../components/pinpoint/StrikeProfile';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { CALL_WALL, INK, PUT_WALL, SELECT, SPOT, fmtStrike } from '../../components/pinpoint/ink';

/*
  TARGETS — every strike ranked by how much it matters today, and why. The
  picture is the priority at every strike, as a bar of five parts in a
  fixed order: gamma, open interest, volume, neighbour ratio, distance.
  A part's place names it; its length is how much of the rank it earned.
*/

const FACTOR_STEP: Record<RankFactor, string> = { gex: '#e8e8e8', oi: '#bdbdbd', volume: '#949494', nbr: '#6d6d6d', proximity: '#4a4a4a' };
const CLASS_WORDS: Record<HedgingClass, { ink: string; note: string }> = {
  'DOWNSIDE CUSHION': { ink: PUT_WALL, note: 'dealers buy a dip into it' },
  'UPSIDE RESISTANCE': { ink: CALL_WALL, note: 'dealers sell a rally into it' },
  MAGNET: { ink: INK.primary, note: 'the largest open interest on the book' },
  NEUTRAL: { ink: INK.muted, note: 'not enough gamma to steer a move' },
};
const LENS_OPTIONS = RANK_LENSES.map(l => ({ value: l.value, label: l.label }));
/* The dense rail of six lenses is 401px wide (measured in the browser);
   with the page's two 16px gutters it needs a 433px viewport. Below that the
   lens is the kit's Select, as the board's expiry is below its own width. */
const W_LENS_RAIL = 434;
const lensText = (t: RankedTarget, lens: RankLens): string => {
  switch (lens) {
    case 'gex':
      return fmtUsd(t.netGex);
    case 'oi':
      return t.openInterest.toLocaleString('en-US');
    case 'volume':
      return t.volume.toLocaleString('en-US');
    case 'nbr':
      return `${t.nbr.toFixed(2)}×`;
    case 'proximity':
      return `${t.bps > 0 ? '+' : ''}${t.bps} bp`;
    default:
      return String(t.score);
  }
};

const Targets = () => {
  const navigate = useNavigate();
  const { snapshot, scanAt } = useScanSnapshot();
  const unit = useDistanceUnit();
  const [lens, setLens] = useDeskChoice<RankLens>('targets', 'lens', 'priority', v => LENS_OPTIONS.some(o => o.value === v));
  const [weights, setWeights] = useDeskChoice<RankWeights>('targets', 'weights', { ...RANK_WEIGHTS }, v => !!v && typeof v === 'object' && Object.keys(RANK_WEIGHTS).every(k => typeof (v as Record<string, unknown>)[k] === 'number'));
  const belowLg = useIsBelowLg();
  const railFits = useMediaQuery(`(min-width: ${W_LENS_RAIL}px)`);
  const [hover, setHover] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  const view = useMemo(() => (snapshot ? buildRankedTargets(snapshot, weights) : null), [snapshot, weights]);
  const ranked = useMemo(() => (view ? rankBy(view.targets, lens) : []), [view, lens]);
  const scales = useMemo<DistanceScales>(() => (snapshot ? { atr: sessionAtr(Simulator.getCandles(snapshot.ticker) ?? []), sigma: impliedDaySigma(snapshot.spot, Simulator.TICKERS[snapshot.ticker]?.iv ?? 0) } : { atr: null, sigma: null }), [snapshot]);

  if (!snapshot || !view) {
    return (
      <DeskLoading>
        <DataState kind="loading" title="Ranking the strikes" body="The first tick has not arrived yet." />
      </DeskLoading>
    );
  }

  const spot = snapshot.spot;
  const dist = (price: number) => fmtDistance(price - spot, spot, unit, scales);
  const rankOf = (t: RankedTarget) => ranked.indexOf(t) + 1;
  const byStrike = [...ranked].sort((a, b) => b.strike - a.strike);
  const maxScore = Math.max(1, ...ranked.map(t => t.score));
  const series: ProfileSeries[] = RANK_FACTORS.map(k => ({ key: k, label: FACTOR_LABEL[k], ink: FACTOR_STEP[k] }));
  const rows: ProfileRow[] = byStrike.map(t => {
    const r = rankOf(t);
    return { strike: t.strike, values: Object.fromEntries(t.factors.map(f => [f.key, f.points])), tag: `#${r}`, ink: r <= 3 ? (t.pressure === 'SUPPORT' ? PUT_WALL : CALL_WALL) : undefined };
  });
  const focusStrike = hover ?? picked;
  const focus = focusStrike !== null ? (ranked.find(t => t.strike === focusStrike) ?? null) : null;
  const above = focus ? (ranked[rankOf(focus) - 2] ?? null) : null;
  const a = focus && above ? above : ranked[0];
  const b = focus && above ? focus : ranked[1];
  const edge = a && b ? explainEdge(a, b) : null;
  const isDefault = weightsAreDefault(weights);
  const totalW = RANK_FACTORS.reduce((s, f) => s + weights[f], 0) || 1;
  const classes = (Object.keys(CLASS_WORDS) as HedgingClass[]).map(k => ({ k, n: ranked.filter(t => t.hedgingClass === k).length, first: ranked.find(t => t.hedgingClass === k) }));
  const lensLabel = RANK_LENSES.find(l => l.value === lens)?.label ?? '';

  return (
    <Workspace
      toolbar={
        <Toolbar data-targets-controls>
          {/* Six options run past a phone at the rail's size: the dense cut
              below lg, and below the rail's own width the kit's Select. */}
          {railFits ? (
            <Segmented ariaLabel="Ranking lens" options={LENS_OPTIONS} value={lens} onChange={setLens} dense={belowLg} />
          ) : (
            <Select dense ariaLabel="Ranking lens" options={LENS_OPTIONS} value={lens} onChange={setLens} attrs={{ 'data-targets-lens': 'select' }} />
          )}
          {ranked[0] && (
            <button onClick={() => navigate('/pulse', { state: { focusPrice: ranked[0].strike } })} className={`${CONTROL} ${CONTROL_OFF} ${CONTROL_OUTLINE}`}>
              #1 on the chart <ArrowUpRight className="w-3 h-3" aria-hidden />
            </button>
          )}
          <span className={`${TYPE.label} text-textMuted tnum ml-auto`}>scan {scanAt}</span>
        </Toolbar>
      }
      picture={
        <StrikeProfile
          rows={rows}
          series={series}
          stack
          maxAbs={maxScore}
          levels={[{ kind: 'spot', price: spot, tag: `SPOT ${fmtStrike(spot)}`, ink: SPOT }]}
          fmt={v => Math.round(v).toString()}
          hoverStrike={hover}
          onHover={setHover}
          selectedStrike={picked}
          onSelect={s => setPicked(p => (p === s ? null : s))}
          ariaLabel={`Priority at every strike, ranked ${lens === 'priority' ? 'by the composite' : `by ${lensLabel}`}. #1 ${ranked[0] ? fmtStrike(ranked[0].strike) : '—'}. Spot ${fmtStrike(spot)}.`}
        />
      }
      inspector={
        <>
          <Group title="Podium" data-group="podium" data-podium>
            {ranked.slice(0, 3).map((t, i) => (
              <Stat key={t.strike} label={<span className={TYPE.num} style={{ color: t.pressure === 'SUPPORT' ? PUT_WALL : CALL_WALL }}>{`#${i + 1} ${fmtStrike(t.strike)}`}</span>} value={lens === 'priority' ? String(t.score) : lensText(t, lens)} sub={`${dist(t.strike)} · ${t.hedgingClass}${t.tags.length ? ' · ' + t.tags.join(' · ') : ''} · ${t.reason}`} onSelect={() => setPicked(p => (p === t.strike ? null : t.strike))} selected={picked === t.strike} data-rank={i + 1} />
            ))}
          </Group>

          {a && b && edge && (
            <Group title={`Why #${rankOf(a)} beats #${rankOf(b)}`} data-group="edge">
              <Stat label={fmtStrike(a.strike)} value={`priority ${a.score}`} ink={a.pressure === 'SUPPORT' ? PUT_WALL : CALL_WALL} />
              <Stat label={fmtStrike(b.strike)} value={`priority ${b.score}`} ink={b.pressure === 'SUPPORT' ? PUT_WALL : CALL_WALL} />
              <div className="flex flex-col pt-1" data-edge>
                {RANK_FACTORS.map(k => {
                  const fa = a.factors.find(f => f.key === k)!;
                  const fb = b.factors.find(f => f.key === k)!;
                  const leads = edge.leads.includes(k);
                  const trails = edge.trails.includes(k);
                  return (
                    <div key={k} className="grid grid-cols-[80px_1fr_44px] items-center gap-2 py-1">
                      <span className={`${TYPE.label} text-textSecondary`}>{FACTOR_LABEL[k]}</span>
                      <span className="relative h-[5px] bg-white/[0.05] overflow-hidden">
                        <span className="absolute inset-y-0 left-0" style={{ width: `${fa.norm * 100}%`, background: FACTOR_STEP[k] }} />
                        <span className="absolute inset-y-0 left-0 border-r-2 border-white/80" style={{ width: `${fb.norm * 100}%` }} />
                      </span>
                      <span className={`${TYPE.label} text-right ${leads ? 'text-textPrimary font-bold' : trails ? 'text-textMuted' : 'text-textSecondary'}`}>{leads ? 'leads' : trails ? 'trails' : 'even'}</span>
                    </div>
                  );
                })}
              </div>
              <p className={`${TYPE.label} tracking-normal normal-case text-textMuted pt-1`}>filled bar the higher rank · white edge the lower</p>
            </Group>
          )}

          <Group title="Weights" actions={!isDefault ? <Tag ink={SELECT} title={WEIGHTS_NOTE}>{`weights: ${WEIGHTS_ARE_FITTED ? 'fitted' : 'yours'}`}</Tag> : <Tag title={WEIGHTS_NOTE}>hand-set</Tag>} data-group="weights">
            <div className="flex flex-col" data-weights-editor>
              {RANK_FACTORS.map(k => (
                <label key={k} className="grid grid-cols-[80px_1fr_36px] items-center gap-2 py-1">
                  <span className={`${TYPE.label} text-textSecondary`}>{FACTOR_LABEL[k]}</span>
                  <input type="range" min={0} max={0.6} step={0.01} value={weights[k]} aria-label={`Weight for ${FACTOR_LABEL[k]}`} onChange={e => setWeights(w => ({ ...w, [k]: Number(e.target.value) }))} className="w-full" style={{ accentColor: INK.secondary }} />
                  <span className={`${TYPE.label} tracking-normal tnum text-textPrimary text-right`}>{Math.round((weights[k] / totalW) * 100)}%</span>
                </label>
              ))}
            </div>
            {!isDefault && (
              <button onClick={() => setWeights({ ...RANK_WEIGHTS })} className={`${CONTROL} ${CONTROL_OFF} -ml-2 self-start`}>
                <RotateCcw className="w-3 h-3" aria-hidden /> reset
              </button>
            )}
            <p className={`${TYPE.label} tracking-normal normal-case text-textMuted pt-1`}>{WEIGHTS_NOTE}</p>
          </Group>

          <Group title="Board" data-group="board">
            {classes.map(c => (
              <Stat key={c.k} label={<span style={{ color: CLASS_WORDS[c.k].ink }}>{c.k}</span>} value={String(c.n)} sub={c.first ? `top #${rankOf(c.first)} ${fmtStrike(c.first.strike)} · ${CLASS_WORDS[c.k].note}` : CLASS_WORDS[c.k].note} />
            ))}
          </Group>
        </>
      }
      strip={
        <>
          {ranked[0] && <Figure label="#1" value={fmtStrike(ranked[0].strike)} ink={ranked[0].pressure === 'SUPPORT' ? PUT_WALL : CALL_WALL} sub={`${dist(ranked[0].strike)} · priority ${ranked[0].score}`} size="lead" />}
          {ranked[1] && <Figure label="#2" value={fmtStrike(ranked[1].strike)} ink={ranked[1].pressure === 'SUPPORT' ? PUT_WALL : CALL_WALL} sub={`priority ${ranked[1].score}`} />}
          {ranked[2] && <Figure label="#3" value={fmtStrike(ranked[2].strike)} ink={ranked[2].pressure === 'SUPPORT' ? PUT_WALL : CALL_WALL} sub={`priority ${ranked[2].score}`} />}
          <Figure label="Ranked by" value={lensLabel} sub={lens === 'priority' ? 'five reasons, weighted' : 'one reason alone'} />
          <Figure label="Order" value="gamma · OI · vol · nbr · dist" sub="a part’s place is its reason" size="sm" />
          {edge && a && b && (
            <Read>
              {fmtStrike(a.strike)} {edge.leads.length ? `leads on ${edge.leads.map(k => FACTOR_LABEL[k]).join(', ')}` : 'leads nowhere'}
              {edge.trails.length ? `, trails on ${edge.trails.map(k => FACTOR_LABEL[k]).join(', ')}` : ''}.
            </Read>
          )}
        </>
      }
    />
  );
};

export default Targets;
