import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, RotateCcw } from 'lucide-react';
import Simulator from '../../core/simulator';
import {
  FACTOR_LABEL,
  RANK_FACTORS,
  RANK_LENSES,
  RANK_WEIGHTS,
  WEIGHTS_ARE_FITTED,
  WEIGHTS_NOTE,
  buildRankedTargets,
  explainEdge,
  rankBy,
  weightsAreDefault,
  type RankWeights,
} from '../../data/rankedtargets';
import { fmtDistance, impliedDaySigma, sessionAtr, type DistanceScales } from '../../data/atr';
import { useDistanceUnit } from '../../data/distanceUnits';
import { fmtUsd } from '../../data/gex';
import type { HedgingClass, RankFactor, RankLens, RankedTarget, TargetTag } from '../../types/gex';
import DataState from '../../components/ui/DataState';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import { OiAsOf } from '../../components/ui/AsOf';
import Term from '../../components/ui/Term';
import type { TermKey } from '../../data/terms';
import { CONTROL, CONTROL_OFF, CONTROL_OUTLINE, Cell, Deck, DeskLoading, Figure, Method, Note, Pane, ROW, Read, Region, Row, Segmented, Surface, TYPE, Table, Tag, Toolbar } from '../../components/pinpoint/Desk';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { CALL_WALL, INK, PUT_WALL, SELECT, fmtStrike } from '../../components/pinpoint/ink';

/*
==================================================
  SLAYER TERMINAL - TARGETS (pages/pinpoint/Targets.tsx)
  Every strike ranked by how much it matters today — and why.
==================================================

  THE QUESTION: which strikes matter most today. THE ACTION: pick one and
  see why it beats the one above it, factor by factor.

  Every strike carries a bar of five segments in a fixed order — gamma,
  open interest, volume, neighbour ratio, distance from spot — so the
  segment's position alone says which reason it is and its length says
  how much of the rank it earned. The weights are an opinion and the
  desk says so where it can be acted on.

  WHAT MOVED IN THE REDESIGN. The podium is three columns under one
  rule, not three cards. The comparison that answers a click is the
  desk's one box. The bar's legend and the tag glossary are the Method.
*/

/* Five steps down the greyscale — the segment's PLACE names it, the fill
   only marks where one ends and the next begins, brightest first. */
const FACTOR_STEP: Record<RankFactor, string> = {
  gex: '#e8e8e8',
  oi: '#bdbdbd',
  volume: '#949494',
  nbr: '#6d6d6d',
  proximity: '#4a4a4a',
};

const tagTerm = (tag: TargetTag, pressure: RankedTarget['pressure']): TermKey | null => {
  switch (tag) {
    case 'WALL':
      return pressure === 'SUPPORT' ? 'Put wall' : 'Call wall';
    case 'PIN':
      return 'Gamma pin';
    case 'SPOT TARGET':
      return 'From spot';
    default:
      return null;
  }
};

/** A tag, with its definition where the glossary has one. */
const TagWord = ({ tag, pressure, className = '' }: { tag: TargetTag; pressure: RankedTarget['pressure']; className?: string }) => {
  const k = tagTerm(tag, pressure);
  return k ? (
    <Term k={k}>
      <Tag className={className}>{tag}</Tag>
    </Term>
  ) : (
    <Tag className={className}>{tag}</Tag>
  );
};

const CLASS_WORDS: Record<HedgingClass, { ink: string; note: string }> = {
  'DOWNSIDE CUSHION': { ink: PUT_WALL, note: 'heavy gamma below spot — dealers buy a dip into it' },
  'UPSIDE RESISTANCE': { ink: CALL_WALL, note: 'heavy gamma above spot — dealers sell a rally into it' },
  MAGNET: { ink: INK.primary, note: 'the largest open interest on the book — price is drawn to it into expiry' },
  NEUTRAL: { ink: INK.muted, note: 'not enough gamma to steer a move on its own' },
};

const LENS_OPTIONS = RANK_LENSES.map(l => ({ value: l.value, label: l.label }));

/** The five-segment bar. Fixed order; a segment's position is its reason. */
const FactorBar = ({ t, max, height = 8 }: { t: RankedTarget; max: number; height?: number }) => (
  <div className="flex w-full overflow-hidden bg-white/[0.05]" style={{ height }} role="img" aria-label={`priority ${t.score}: ${t.factors.map(f => `${FACTOR_LABEL[f.key]} ${Math.round(f.points)}`).join(', ')}`} data-factor-bar>
    {t.factors.map(f => (
      <span key={f.key} className="h-full transition-[width] duration-500 ease-out" style={{ width: `${(f.points / Math.max(max, 1)) * 100}%`, background: FACTOR_STEP[f.key] }} title={`${FACTOR_LABEL[f.key]} · ${Math.round(f.norm * 100)}% of the book's best`} />
    ))}
  </div>
);

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
  const [lens, setLens] = useState<RankLens>('priority');
  const [weights, setWeights] = useState<RankWeights>({ ...RANK_WEIGHTS });
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);

  const view = useMemo(() => (snapshot ? buildRankedTargets(snapshot, weights) : null), [snapshot, weights]);
  const ranked = useMemo(() => (view ? rankBy(view.targets, lens) : []), [view, lens]);
  const scales = useMemo<DistanceScales>(() => {
    if (!snapshot) return { atr: null, sigma: null };
    return { atr: sessionAtr(Simulator.getCandles(snapshot.ticker) ?? []), sigma: impliedDaySigma(snapshot.spot, Simulator.TICKERS[snapshot.ticker]?.iv ?? 0) };
  }, [snapshot]);

  if (!snapshot || !view) {
    return (
      <DeskLoading>
        <DataState kind="loading" title="Ranking the strikes" body="The first tick has not arrived yet." />
      </DeskLoading>
    );
  }

  const spot = snapshot.spot;
  const dist = (price: number) => fmtDistance(price - spot, spot, unit, scales);
  const maxScore = Math.max(...ranked.map(t => t.score), 1);
  const podium = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  const isDefault = weightsAreDefault(weights);
  const focus = picked !== null ? ranked.find(t => t.strike === picked) ?? null : null;
  const focusAbove = focus ? ranked[ranked.indexOf(focus) - 1] ?? null : null;
  const edge = focus && focusAbove ? explainEdge(focusAbove, focus) : podium.length > 1 ? explainEdge(podium[0], podium[1]) : null;
  const edgeA = focus && focusAbove ? focusAbove : podium[0];
  const edgeB = focus && focusAbove ? focus : podium[1];
  const pressureInk = (t: RankedTarget) => (t.pressure === 'SUPPORT' ? PUT_WALL : CALL_WALL);
  const lensLabel = RANK_LENSES.find(l => l.value === lens)?.label ?? '';
  const toggle = (s: number) => setPicked(p => (p === s ? null : s));

  const hero = (
    <Region
      title="Every strike, ranked"
      note={
        lens === 'priority'
          ? 'by how much it matters today — the bar is the reason, in a fixed order: gamma, open interest, volume, neighbour ratio, distance from spot'
          : `by ${lensLabel.toLowerCase()} alone — the bar still shows the full priority, so a strike that leads on one reason and trails on the rest is visible`
      }
      actions={<OiAsOf />}
    >
      {/* The podium: three columns under one rule. */}
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-borderSubtle border-b border-borderSubtle" data-podium>
        {podium.map((t, i) => (
          <button
            key={t.strike}
            type="button"
            onClick={() => toggle(t.strike)}
            aria-current={picked === t.strike || undefined}
            className={`${ROW} px-3 py-3 flex flex-col gap-2 ${picked === t.strike ? 'bg-select/[0.05]' : ''}`}
            data-rank={i + 1}
          >
            <span className="flex items-baseline gap-2">
              <span className={`${TYPE.label} font-bold text-textMuted`}>#{i + 1}</span>
              <span className={i === 0 ? TYPE.lead : TYPE.figure} style={{ color: pressureInk(t) }}>
                {fmtStrike(t.strike)}
              </span>
              <span className={`${TYPE.label} tracking-normal text-textSecondary tnum`}>{dist(t.strike)}</span>
              {lens !== 'priority' && <span className={`ml-auto ${TYPE.label} tracking-normal font-semibold tnum text-textPrimary`}>{lensText(t, lens)}</span>}
            </span>
            <FactorBar t={t} max={maxScore} height={10} />
            <span className="flex items-center gap-x-3 gap-y-1 flex-wrap">
              <Tag ink={CLASS_WORDS[t.hedgingClass].ink} title={CLASS_WORDS[t.hedgingClass].note}>
                {t.hedgingClass}
              </Tag>
              {t.tags.map(tag => (
                <TagWord key={tag} tag={tag} pressure={t.pressure} />
              ))}
            </span>
            <span className={`${TYPE.body} text-textSecondary`}>{t.reason}</span>
          </button>
        ))}
      </div>

      {/* The tail. */}
      <Pane className="max-h-[520px] mt-3" data-ladder>
        <Table
          sticky
          cols={[
            { key: 'n', label: '#', width: 32 },
            { key: 'strike', label: 'Strike' },
            { key: 'why', label: 'Why', width: '38%' },
            { key: 'v', label: lens === 'priority' ? 'Net GEX' : lensLabel, align: 'right' },
            { key: 'reads', label: 'Reads as' },
          ]}
        >
          {rest.map((t, i) => (
            <Row key={t.strike} onSelect={() => toggle(t.strike)} selected={picked === t.strike} data-rank={i + 4}>
              <Cell className={`${TYPE.label} tracking-normal tnum text-textMuted`}>{i + 4}</Cell>
              <Cell>
                <span className={`${TYPE.lead}`} style={{ color: pressureInk(t) }}>
                  {fmtStrike(t.strike)}
                </span>
                <span className={`ml-2 ${TYPE.label} tracking-normal text-textMuted tnum`}>{dist(t.strike)}</span>
                {t.tags.map(tag => (
                  <TagWord key={tag} tag={tag} pressure={t.pressure} className="ml-2" />
                ))}
              </Cell>
              <Cell>
                <FactorBar t={t} max={maxScore} height={6} />
              </Cell>
              <Cell num className="text-textPrimary">
                {lens === 'priority' ? fmtUsd(t.netGex) : lensText(t, lens)}
              </Cell>
              <Cell>
                <span className={TYPE.label} style={{ color: CLASS_WORDS[t.hedgingClass].ink }}>
                  {t.hedgingClass}
                </span>
              </Cell>
            </Row>
          ))}
        </Table>
      </Pane>
    </Region>
  );

  const rail = (
    <>
      {/* The comparison that answers a click — the desk's one box. */}
      <Surface
        title={focus && focusAbove ? `Why #${ranked.indexOf(focusAbove) + 1} beats #${ranked.indexOf(focus) + 1}` : 'Why #1 beats #2'}
        actions={
          focus ? (
            <button onClick={() => setPicked(null)} className={`${CONTROL} ${CONTROL_OFF}`}>
              clear
            </button>
          ) : undefined
        }
      >
        {edge && edgeA && edgeB ? (
          <>
            <div className="grid grid-cols-2 gap-x-4">
              <Figure label={`#${ranked.indexOf(edgeA) + 1}`} value={fmtStrike(edgeA.strike)} ink={pressureInk(edgeA)} sub={`priority ${edgeA.score}`} />
              <Figure label={`#${ranked.indexOf(edgeB) + 1}`} value={fmtStrike(edgeB.strike)} ink={pressureInk(edgeB)} sub={`priority ${edgeB.score}`} />
            </div>
            <div className="pt-3 flex flex-col gap-2" data-edge>
              {RANK_FACTORS.map(k => {
                const a = edgeA.factors.find(f => f.key === k)!;
                const b = edgeB.factors.find(f => f.key === k)!;
                const leads = edge.leads.includes(k);
                const trails = edge.trails.includes(k);
                return (
                  <div key={k} className="grid grid-cols-[92px_1fr_auto] items-center gap-2">
                    <span className={`${TYPE.label} text-textSecondary`}>{FACTOR_LABEL[k]}</span>
                    <span className="relative h-[6px] bg-white/[0.05] overflow-hidden">
                      <span className="absolute inset-y-0 left-0" style={{ width: `${a.norm * 100}%`, background: FACTOR_STEP[k] }} />
                      <span className="absolute inset-y-0 left-0 border-r-2 border-white/80" style={{ width: `${b.norm * 100}%` }} />
                    </span>
                    {/* Leading on a factor is a rank, not a direction. */}
                    <span className={`${TYPE.label} ${leads ? 'text-textPrimary font-bold' : trails ? 'text-textMuted' : 'text-textSecondary'}`}>{leads ? 'leads' : trails ? 'trails' : 'even'}</span>
                  </div>
                );
              })}
            </div>
            <Read className="pt-3">
              {fmtStrike(edgeA.strike)} {edge.leads.length ? `leads on ${edge.leads.map(k => FACTOR_LABEL[k]).join(', ')}` : 'leads nowhere'}
              {edge.trails.length ? `, trails on ${edge.trails.map(k => FACTOR_LABEL[k]).join(', ')}` : ''} — the filled bar is the higher rank, the white edge is the lower.
            </Read>
          </>
        ) : (
          <DataState kind="empty" title="One strike on the board" pad="sm" />
        )}
      </Surface>

      <Region
        title="The weights are an opinion"
        note={WEIGHTS_ARE_FITTED ? 'fitted to a record of targets reached and missed' : 'hand-set, not fitted — move them and the ranking re-forms'}
        actions={
          !isDefault ? (
            <>
              <Tag ink={SELECT} title={WEIGHTS_NOTE}>
                weights: {WEIGHTS_ARE_FITTED ? 'fitted' : 'yours'}
              </Tag>
              <button onClick={() => setWeights({ ...RANK_WEIGHTS })} className={`${CONTROL} ${CONTROL_OFF}`} title="Back to the desk's default weights">
                <RotateCcw className="w-3 h-3" aria-hidden /> reset
              </button>
            </>
          ) : undefined
        }
      >
        <button onClick={() => setEditing(e => !e)} className={`${CONTROL} ${CONTROL_OFF} -ml-2`} aria-expanded={editing}>
          {editing ? 'hide the sliders' : 'adjust the weights'}
        </button>
        {editing && (
          <div className="pt-2 flex flex-col gap-2" data-weights-editor>
            {RANK_FACTORS.map(k => (
              <label key={k} className="grid grid-cols-[92px_1fr_40px] items-center gap-2">
                <span className={`${TYPE.label} text-textSecondary`}>{FACTOR_LABEL[k]}</span>
                <input type="range" min={0} max={0.6} step={0.01} value={weights[k]} aria-label={`Weight for ${FACTOR_LABEL[k]}`} onChange={e => setWeights(w => ({ ...w, [k]: Number(e.target.value) }))} className="w-full" style={{ accentColor: INK.secondary }} />
                <span className={`${TYPE.label} tracking-normal tnum text-textPrimary text-right`}>{Math.round((weights[k] / (RANK_FACTORS.reduce((a, f) => a + weights[f], 0) || 1)) * 100)}%</span>
              </label>
            ))}
          </div>
        )}
      </Region>
    </>
  );

  return (
    <>
      <Toolbar data-targets-controls>
        <Segmented ariaLabel="Ranking lens" options={LENS_OPTIONS} value={lens} onChange={setLens} />
        {podium[0] && (
          <button onClick={() => navigate('/pulse', { state: { focusPrice: podium[0].strike } })} className={`${CONTROL} ${CONTROL_OFF} ${CONTROL_OUTLINE}`} title="See the primary target on the chart">
            #1 on the chart <ArrowUpRight className="w-3 h-3" aria-hidden />
          </button>
        )}
        <ProvenanceChip sources={['chain', 'exposure']} className="ml-auto" />
        <span className={`${TYPE.label} text-textMuted tnum`}>scan {scanAt} · 10s</span>
      </Toolbar>

      <Deck hero={hero} rail={rail}>
        {/* Four counts and four sentences — a table, so the four numbers sit
            in a column where they can be compared. */}
        <Region title="What the board is made of">
          <Table
            className="max-w-[860px]"
            cols={[
              { key: 'reads', label: 'Reads as' },
              { key: 'n', label: 'Strikes', align: 'right', width: 64 },
              { key: 'top', label: 'Highest ranked', align: 'right', width: 112 },
              { key: 'means', label: 'Which means' },
            ]}
          >
            {(Object.keys(CLASS_WORDS) as HedgingClass[]).map(k => {
              const n = ranked.filter(t => t.hedgingClass === k).length;
              const first = ranked.find(t => t.hedgingClass === k);
              return (
                <Row key={k}>
                  <Cell>
                    <span className={`${TYPE.label} font-bold`} style={{ color: CLASS_WORDS[k].ink }}>
                      {k}
                    </span>
                  </Cell>
                  <Cell num className="text-textPrimary">
                    {n}
                  </Cell>
                  <Cell num className="text-textSecondary">
                    {first ? `${fmtStrike(first.strike)} · #${ranked.indexOf(first) + 1}` : '—'}
                  </Cell>
                  <Cell className="text-textMuted">{CLASS_WORDS[k].note}</Cell>
                </Row>
              );
            })}
          </Table>
        </Region>

        <Method>
          <Note term="The bar">
            Five segments in a fixed order — {RANK_FACTORS.map((k, i) => `${i + 1}. ${FACTOR_LABEL[k]}`).join(', ')} — so a segment’s place names it and its length is how much of the rank it
            earned. The greys are deliberately close: the order is the code, not the shade.
          </Note>
          <Note term="Strike ink">Red is a level below spot that supports; green a level above that resists.</Note>
          <Note term="Reads as">What the dealers do there: cushion a dip, resist a rally, or pull price in.</Note>
          <Note term="Tags">WALL is one of the two walls, PIN the largest open interest, SUPREME the heaviest gamma on the book, SPOT TARGET within 20 bp of the market.</Note>
          <Note term="The weights">{WEIGHTS_NOTE}</Note>
          <Note term="A lens">{RANK_LENSES.map(l => l.label).join(' · ')} — the board can be re-ranked by any one factor; the bar keeps showing the full priority so the trade-off stays visible, and the figure column prints that factor’s own value.</Note>
        </Method>
      </Deck>
    </>
  );
};

export default Targets;
