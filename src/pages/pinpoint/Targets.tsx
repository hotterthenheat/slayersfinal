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
  lensValue,
  rankBy,
  weightsAreDefault,
  type RankWeights,
} from '../../data/rankedtargets';
import { fmtDistance, impliedDaySigma, sessionAtr, type DistanceScales } from '../../data/atr';
import { useDistanceUnit } from '../../data/distanceUnits';
import { fmtUsd } from '../../data/gex';
import type { HedgingClass, RankFactor, RankLens, RankedTarget } from '../../types/gex';
import DataState from '../../components/ui/DataState';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { OiAsOf } from '../../components/ui/AsOf';
import { Deck, Figure, Pane, Read, Section, TYPE, Tag } from '../../components/pinpoint/Desk';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { CALL_WALL, INK, PUT_WALL, SELECT, fmtStrike } from '../../components/pinpoint/ink';

/*
==================================================
  SLAYER TERMINAL - TARGETS (pages/pinpoint/Targets.tsx)
  Every strike ranked by how much it matters today — and why.
  Rebuilt from zero, 2026-09-06.
==================================================

  MenthorQ sells six ranked levels a month; SpotGamma prints a Key Levels
  table. Both give a reader a short list and neither says why #1 beat #2.
  This desk is the list WITH the reason: every strike carries a bar of
  five segments in a fixed order — gamma, open interest, volume, neighbour
  ratio, distance from spot — so the segment's position alone says which
  reason it is, and its length says how much of the rank it earned. The
  top three get room; the rest are dense rows.

  THE WEIGHTS ARE AN OPINION, and the desk says so where it can be acted
  on: the chip reads "weights: default" until the reader moves one, and
  the five sliders are the only place on the desk where the ranking can be
  argued with. Nothing here has a labelled record of targets reached and
  missed, so there is no fitted set to offer — that is stated, not hidden.
*/

/*
  THE BAR IS GREY, IN FIVE STEPS.

  It used to be gold, teal, violet, pink and orange — five invented hues on a
  desk that also draws the market pair, the level inks and a heat ramp. The
  copy above already claims the segment's POSITION is what names it, which
  makes the hues redundant with the order and, worse, decoding overhead: a
  reader had to learn a five-colour key to read a bar whose meaning was fixed
  before they arrived.

  Five steps down the greyscale do the one job the ink actually has — mark
  where one segment ends and the next begins — and they read in rank order,
  brightest first, so the leading reason is also the brightest band.
*/
const FACTOR_STEP: Record<RankFactor, string> = {
  gex: '#e8e8e8',
  oi: '#bdbdbd',
  volume: '#949494',
  nbr: '#6d6d6d',
  proximity: '#4a4a4a',
};

/*
  The tags are words, not colours. WALL, PIN, SUPREME and SPOT TARGET are
  four identities on one line; giving each a hue put four more colours on a
  desk that already has enough, and the words are unambiguous on their own.
*/

const CLASS_WORDS: Record<HedgingClass, { ink: string; note: string }> = {
  'DOWNSIDE CUSHION': { ink: PUT_WALL, note: 'heavy gamma below spot — dealers buy a dip into it' },
  'UPSIDE RESISTANCE': { ink: CALL_WALL, note: 'heavy gamma above spot — dealers sell a rally into it' },
  /* A magnet is not a direction, so it does not take a direction ink. */
  MAGNET: { ink: INK.primary, note: 'the largest open interest on the book — price is drawn to it into expiry' },
  NEUTRAL: { ink: INK.muted, note: 'not enough gamma to steer a move on its own' },
};

const LENS_OPTIONS = RANK_LENSES.map(l => ({ value: l.value, label: l.label }));

/** The five-segment bar. Fixed order; a segment's position is its reason. */
const FactorBar = ({ t, max, height = 8 }: { t: RankedTarget; max: number; height?: number }) => (
  <div className="flex w-full overflow-hidden rounded-sm bg-white/[0.05]" style={{ height }} role="img" aria-label={`priority ${t.score}: ${t.factors.map(f => `${FACTOR_LABEL[f.key]} ${Math.round(f.points)}`).join(', ')}`} data-factor-bar>
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
    return {
      atr: sessionAtr(Simulator.getCandles(snapshot.ticker) ?? []),
      sigma: impliedDaySigma(snapshot.spot, Simulator.TICKERS[snapshot.ticker]?.iv ?? 0),
    };
  }, [snapshot]);

  if (!snapshot || !view) {
    return (
      <Section title="Targets">
        <DataState kind="loading" title="Ranking the strikes" body="The first tick has not arrived yet." />
      </Section>
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

  const hero = (
    <Section
      title="Every strike, ranked"
      note={
        lens === 'priority'
          ? 'by how much it matters today — the bar is the reason, in a fixed order: gamma, open interest, volume, neighbour ratio, distance from spot'
          : `by ${RANK_LENSES.find(l => l.value === lens)?.label.toLowerCase()} alone — the bar still shows the full priority, so a strike that leads on one reason and trails on the rest is visible`
      }
      actions={<OiAsOf />}
      className="h-full"
    >
      {/* the podium */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-borderSubtle/60 border-y border-borderSubtle" data-podium>
        {podium.map((t, i) => (
          <button
            key={t.strike}
            onClick={() => setPicked(p => (p === t.strike ? null : t.strike))}
            className={`text-left bg-panel px-4 py-3 flex flex-col gap-2 transition-colors hover:bg-white/[0.03] ${picked === t.strike ? 'bg-select/[0.05]' : ''}`}
            data-rank={i + 1}
          >
            <div className="flex items-baseline gap-2">
              <span className={`${TYPE.label} font-bold text-textMuted`}>#{i + 1}</span>
              {/* #1 gets the lead size. Three strikes at one size is a list;
                  the desk's job is to say which one, so the ranking is in the
                  type as well as in the number beside it. */}
              <span className={i === 0 ? TYPE.lead : TYPE.figure} style={{ color: pressureInk(t) }}>
                {fmtStrike(t.strike)}
              </span>
              <span className={`${TYPE.label} text-textSecondary tnum`}>{dist(t.strike)}</span>
              <span className={`ml-auto ${TYPE.label} font-semibold tnum text-textPrimary`}>{lens === 'priority' ? '' : lensText(t, lens)}</span>
            </div>
            <FactorBar t={t} max={maxScore} height={10} />
            {/* The class word already says which side of spot this is and what
                the dealers do there, so the SUPPORT/RESISTANCE tag that used to
                sit beside it said the same thing twice, in a second colour. */}
            <div className="flex items-center gap-x-2.5 gap-y-1 flex-wrap">
              <Tag ink={CLASS_WORDS[t.hedgingClass].ink} title={CLASS_WORDS[t.hedgingClass].note}>
                {t.hedgingClass}
              </Tag>
              {t.tags.map(tag => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </div>
            <p className={`${TYPE.body} text-textSecondary`}>{t.reason}</p>
          </button>
        ))}
      </div>

      {/* the tail */}
      <Pane className="max-h-[520px] overflow-y-auto" data-ladder>
        <table className="w-full">
          <thead className="sticky top-0 bg-canvas z-10">
            <tr className="font-mono text-[10px] uppercase tracking-widest text-textMuted">
              <th className="text-left font-normal px-3 py-1.5 border-b border-borderSubtle w-8">#</th>
              <th className="text-left font-normal px-2 py-1.5 border-b border-borderSubtle">Strike</th>
              <th className="text-left font-normal px-2 py-1.5 border-b border-borderSubtle w-[38%]">Why</th>
              <th className="text-right font-normal px-2 py-1.5 border-b border-borderSubtle">{lens === 'priority' ? 'Net GEX' : RANK_LENSES.find(l => l.value === lens)?.label}</th>
              <th className="text-left font-normal px-2 py-1.5 border-b border-borderSubtle">Reads as</th>
            </tr>
          </thead>
          <tbody>
            {rest.map((t, i) => (
              <tr key={t.strike} onClick={() => setPicked(p => (p === t.strike ? null : t.strike))} className={`cursor-pointer border-b border-borderSubtle/40 transition-colors hover:bg-white/[0.03] ${picked === t.strike ? 'bg-select/[0.05]' : ''}`} data-rank={i + 4}>
                <td className="px-3 py-1.5 font-mono text-[10px] tnum text-textMuted">{i + 4}</td>
                <td className="px-2 py-1.5">
                  <span className="font-mono text-[13px] font-bold tnum" style={{ color: pressureInk(t) }}>
                    {fmtStrike(t.strike)}
                  </span>
                  <span className="ml-2 font-mono text-[10px] text-textMuted tnum">{dist(t.strike)}</span>
                  {t.tags.map(tag => (
                    <Tag key={tag} className="ml-1.5">
                      {tag}
                    </Tag>
                  ))}
                </td>
                <td className="px-2 py-1.5">
                  <FactorBar t={t} max={maxScore} height={6} />
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-[11px] tnum text-textPrimary">{lens === 'priority' ? fmtUsd(t.netGex) : lensText(t, lens)}</td>
                <td className="px-2 py-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: CLASS_WORDS[t.hedgingClass].ink }}>
                    {t.hedgingClass}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Pane>
    </Section>
  );

  const rail = (
    <>
      <Section title={focus && focusAbove ? `Why #${ranked.indexOf(focusAbove) + 1} beats #${ranked.indexOf(focus) + 1}` : 'Why #1 beats #2'} actions={focus ? <button onClick={() => setPicked(null)} className="font-mono text-[10px] uppercase tracking-wider text-textMuted hover:text-textPrimary">clear</button> : undefined}>
        {edge && edgeA && edgeB ? (
          <>
            <div className="grid grid-cols-2 gap-x-4">
              <Figure label={`#${ranked.indexOf(edgeA) + 1}`} value={fmtStrike(edgeA.strike)} ink={pressureInk(edgeA)} size="figure" sub={`priority ${edgeA.score}`} />
              <Figure label={`#${ranked.indexOf(edgeB) + 1}`} value={fmtStrike(edgeB.strike)} ink={pressureInk(edgeB)} size="figure" sub={`priority ${edgeB.score}`} />
            </div>
            <div className="mt-3 flex flex-col gap-1.5" data-edge>
              {RANK_FACTORS.map(k => {
                const a = edgeA.factors.find(f => f.key === k)!;
                const b = edgeB.factors.find(f => f.key === k)!;
                const leads = edge.leads.includes(k);
                const trails = edge.trails.includes(k);
                return (
                  <div key={k} className="grid grid-cols-[92px_1fr_auto] items-center gap-2">
                    <span className={`${TYPE.label} text-textSecondary`}>
                      {FACTOR_LABEL[k]}
                    </span>
                    <span className="relative h-[6px] rounded-sm bg-white/[0.05] overflow-hidden">
                      <span className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${a.norm * 100}%`, background: FACTOR_STEP[k] }} />
                      <span className="absolute inset-y-0 left-0 rounded-sm border-r-2 border-white/80" style={{ width: `${b.norm * 100}%` }} />
                    </span>
                    {/* Leading on a factor is a rank, not a direction — green
                        and red here would be the third meaning on a desk where
                        they already say above-spot and below-spot. */}
                    <span className={`${TYPE.label} ${leads ? 'text-textPrimary font-bold' : trails ? 'text-textMuted' : 'text-textSecondary'}`}>{leads ? 'leads' : trails ? 'trails' : 'even'}</span>
                  </div>
                );
              })}
            </div>
            <Read className="mt-3">
              {fmtStrike(edgeA.strike)} {edge.leads.length ? `leads on ${edge.leads.map(k => FACTOR_LABEL[k]).join(', ')}` : 'leads nowhere'}
              {edge.trails.length ? `, trails on ${edge.trails.map(k => FACTOR_LABEL[k]).join(', ')}` : ''} — the filled bar is the higher rank, the white edge is the lower.
            </Read>
          </>
        ) : (
          <DataState kind="empty" title="One strike on the board" pad="sm" />
        )}
      </Section>

      <Section
        title="The weights are an opinion"
        note={WEIGHTS_ARE_FITTED ? 'fitted to a record of targets reached and missed' : 'hand-set, not fitted — move them and the ranking re-forms'}
        actions={
          <>
            {/* Silent at rest. "weights: default" beside a subtitle that already
                reads "hand-set, not fitted" was the same sentence twice; the
                chip is worth a line only once the reader has changed something
                and needs to know the ranking is no longer the desk's. */}
            {!isDefault && (
              <Tag ink={SELECT} title={WEIGHTS_NOTE}>
                weights: {WEIGHTS_ARE_FITTED ? 'fitted' : 'yours'}
              </Tag>
            )}
            {!isDefault && (
              <button onClick={() => setWeights({ ...RANK_WEIGHTS })} className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-textMuted hover:text-textPrimary" title="Back to the desk's default weights">
                <RotateCcw className="w-3 h-3" /> reset
              </button>
            )}
          </>
        }
      >
        <button onClick={() => setEditing(e => !e)} className="font-mono text-[10px] uppercase tracking-wider text-textSecondary hover:text-textPrimary transition-colors" aria-expanded={editing}>
          {editing ? 'hide the sliders' : 'adjust the weights'}
        </button>
        {editing && (
          <div className="mt-2 flex flex-col gap-2" data-weights-editor>
            {RANK_FACTORS.map(k => (
              <label key={k} className="grid grid-cols-[92px_1fr_40px] items-center gap-2">
                <span className={`${TYPE.label} text-textSecondary`}>
                  {FACTOR_LABEL[k]}
                </span>
                <input type="range" min={0} max={0.6} step={0.01} value={weights[k]} aria-label={`Weight for ${FACTOR_LABEL[k]}`} onChange={e => setWeights(w => ({ ...w, [k]: Number(e.target.value) }))} className="w-full" style={{ accentColor: INK.secondary }} />
                <span className="font-mono text-[10px] tnum text-textPrimary text-right">{Math.round((weights[k] / (RANK_FACTORS.reduce((a, f) => a + weights[f], 0) || 1)) * 100)}%</span>
              </label>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] text-textMuted leading-relaxed">{WEIGHTS_NOTE}</p>
      </Section>

      <Section title="How to read the bar">
        {/* Not a colour key — the five greys are deliberately close and the
            copy says so: it is the segment's PLACE in the bar that names it.
            So the legend is the order, numbered, which is the actual code. */}
        <ol className={`flex flex-wrap gap-x-3 gap-y-1 ${TYPE.label} text-textMuted`}>
          {RANK_FACTORS.map((k, i) => (
            <li key={k} className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-2" style={{ background: FACTOR_STEP[k] }} />
              <span className="text-textSecondary">
                {i + 1}. {FACTOR_LABEL[k]}
              </span>
            </li>
          ))}
        </ol>
        <ul className="mt-2.5 flex flex-col gap-1.5 text-[11px] text-textSecondary leading-snug">
          <li>
            <span className="font-semibold text-textPrimary">Strike ink</span> — red is a level below spot that supports, green a level above that resists.
          </li>
          <li>
            <span className="font-semibold text-textPrimary">Reads as</span> — what the dealers do there: cushion a dip, resist a rally, or pull price in.
          </li>
          <li>
            <span className="font-semibold text-textPrimary">Tags</span> — WALL is one of the two walls, PIN the largest open interest, SUPREME the heaviest gamma on the book, SPOT TARGET within 20 bp of the market.
          </li>
        </ul>
      </Section>
    </>
  );

  return (
    <>
      <div className="flex items-center gap-2.5 flex-wrap" data-targets-controls>
        <SegmentedControl ariaLabel="Ranking lens" options={LENS_OPTIONS} value={lens} onChange={v => setLens(v)} />
        {podium[0] && (
          <button onClick={() => navigate('/pulse', { state: { focusPrice: podium[0].strike } })} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-borderSubtle bg-white/[0.03] hover:bg-white/[0.06] font-mono text-[10px] font-semibold uppercase tracking-wider text-textPrimary transition-colors" title="See the primary target on the chart">
            #{1} on the chart <ArrowUpRight className="w-3 h-3" />
          </button>
        )}
        <ProvenanceChip sources={['chain', 'exposure']} className="ml-auto" />
        <span className="font-mono text-[10px] text-textMuted uppercase tracking-widest tnum">scan {scanAt} · 10s</span>
      </div>
      <Deck hero={hero} rail={rail}>
        {/* Four counts and four sentences. This was four identical sections in
            a row — the same shape repeated is a table that has not admitted it
            is one, and a table puts the four numbers in a column where they can
            actually be compared. */}
        <Section title="What the board is made of">
          <table className="w-full max-w-[860px]">
            <thead>
              <tr className={`${TYPE.label} text-textMuted`}>
                <th className="text-left font-normal py-1.5 border-b border-borderSubtle">Reads as</th>
                <th className="text-right font-normal py-1.5 pl-4 border-b border-borderSubtle w-16">Strikes</th>
                <th className="text-right font-normal py-1.5 pl-4 border-b border-borderSubtle w-28">Highest ranked</th>
                <th className="text-left font-normal py-1.5 pl-6 border-b border-borderSubtle">Which means</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(CLASS_WORDS) as HedgingClass[]).map(k => {
                const n = ranked.filter(t => t.hedgingClass === k).length;
                const first = ranked.find(t => t.hedgingClass === k);
                return (
                  <tr key={k} className="border-b border-borderSubtle/40">
                    <td className="py-1.5">
                      <span className={`${TYPE.label} font-bold`} style={{ color: CLASS_WORDS[k].ink }}>
                        {k}
                      </span>
                    </td>
                    <td className={`py-1.5 pl-4 text-right ${TYPE.num} text-textPrimary`}>{n}</td>
                    <td className={`py-1.5 pl-4 text-right ${TYPE.num} text-textSecondary`}>
                      {first ? `${fmtStrike(first.strike)} · #${ranked.indexOf(first) + 1}` : '—'}
                    </td>
                    <td className={`py-1.5 pl-6 ${TYPE.body} text-textMuted`}>{CLASS_WORDS[k].note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      </Deck>
    </>
  );
};

export default Targets;
