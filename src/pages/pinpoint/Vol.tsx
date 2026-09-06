import { useMemo } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import { buildVolLab } from '../../data/vollab';
import { IV_RANK_UNAVAILABLE, RV_WINDOWS, VERDICT_WORDS, buildVolRegime, regimeGateNote, type RegimeVerdict } from '../../data/volRegime';
import DataState from '../../components/ui/DataState';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import IvSurface from '../../components/gex/vollab/IvSurface';
import TermStructure from '../../components/gex/vollab/TermStructure';
import RiskNeutralDist from '../../components/gex/vollab/RiskNeutralDist';
import RegimePanel from '../../components/gex/vollab/RegimePanel';
import { Bench, Deck, Figure, Read, Section, Tag } from '../../components/pinpoint/Desk';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { LONG_GAMMA, METRICS, SHORT_GAMMA } from '../../components/pinpoint/ink';

/*
==================================================
  SLAYER TERMINAL - VOL (pages/pinpoint/Vol.tsx)
  The surface, the term structure, and the state of vol.
  Rebuilt from zero, 2026-09-06.
==================================================

  Two desks were one question. The Vol Lab drew the SHAPE of implied vol
  — the surface, the term structure, the distribution it implies — and
  the Vol Regime read its STATE against what the tape has actually been
  doing. A reader who wants to know whether options are expensive needs
  both on one screen: the number, and the shape that number is a slice
  of. The verdict — quiet, ordinary, strained — is the headline, because
  it is the one word the Compass gate reads.

  What is not here is said: an IV rank needs a year of this name's own
  implied history and the desk has none, so the rank is absent and its
  substitute (where this name's IV sits among the roster today) is
  labelled as the different thing it is.
*/

const READ_DTE = 30;

const VERDICT_INK: Record<RegimeVerdict, string> = {
  quiet: LONG_GAMMA,
  ordinary: '#a3a3a3',
  strained: SHORT_GAMMA,
  unknown: '#7d7d7d',
};

const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);

const Vol = () => {
  const { activeTicker } = useMarketData();
  const { snapshot, scanAt } = useScanSnapshot();
  const lab = useMemo(() => {
    if (!snapshot) return null;
    const iv = Simulator.TICKERS[snapshot.ticker]?.iv ?? 0.2;
    return buildVolLab(snapshot.ticker, snapshot.spot, iv);
  }, [snapshot]);
  const rows = useMemo(() => buildVolRegime(activeTicker, READ_DTE), [activeTicker]);
  const me = rows.find(r => r.ticker === activeTicker) ?? rows[0];

  if (!snapshot || !lab || !me) {
    return (
      <Section title="Vol">
        <DataState kind="loading" title="Calibrating the surface" body="The first tick has not arrived yet." />
      </Section>
    );
  }

  const words = VERDICT_WORDS[me.verdict];
  const ink = VERDICT_INK[me.verdict];
  const ranked = [...rows].sort((a, b) => b.iv - a.iv);
  const rvTrend = me.rv[5] !== null && me.rv[20] !== null ? (me.rv[5] > me.rv[20] * 1.1 ? 'speeding up' : me.rv[5] < me.rv[20] * 0.9 ? 'settling down' : 'steady') : null;

  const hero = (
    <Section title="The surface" question={`${snapshot.ticker} implied vol by expiry and moneyness — the shape every number on this desk is a slice of`} accent={METRICS.vex.ink} className="h-full" bodyClassName="flex flex-col">
      <div className="flex-1 min-h-[280px]">
        <IvSurface data={lab.surface} />
      </div>
      <div className="mt-3 border-t border-borderSubtle pt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
        <Figure label="ATM 30d" value={`${lab.term.stats.atm30.toFixed(1)}%`} ink={METRICS.vex.ink} />
        <Figure label="1m · 3m · 6m · 1y" value={`${lab.term.stats.iv1m.toFixed(0)} · ${lab.term.stats.iv3m.toFixed(0)} · ${lab.term.stats.iv6m.toFixed(0)} · ${lab.term.stats.iv1y.toFixed(0)}`} size="sm" sub="implied by tenor, %" />
        <Figure label="Expected move" value={`±${lab.rnd.stats.expMovePct.toFixed(2)}%`} sub={`±$${lab.rnd.stats.expMoveAbs.toFixed(2)} to the read tenor`} />
        <Figure label="Skew" value={`${lab.rnd.stats.riskReversal >= 0 ? '+' : ''}${lab.rnd.stats.riskReversal.toFixed(2)}`} sub="25Δ risk reversal, vol points" ink={lab.rnd.stats.riskReversal > 0 ? SHORT_GAMMA : '#ededed'} />
      </div>
    </Section>
  );

  const rail = (
    <>
      <Section title="The state of vol" question={`${READ_DTE}-day implied against what the tape has realized`} accent={ink} actions={<Tag ink={ink}>{words.label}</Tag>}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Figure label={`Implied · ${READ_DTE}d`} value={pct(me.iv)} ink={METRICS.vex.ink} size="lg" sub="at the money" />
          <Figure label="Premium over realized" value={me.premium === null ? '—' : `${me.premium >= 0 ? '+' : '−'}${Math.abs(me.premium * 100).toFixed(2)}`} ink={me.premium === null ? '#7d7d7d' : me.premium > 0 ? LONG_GAMMA : SHORT_GAMMA} size="lg" sub="vol points, implied − 20-session realized" />
          {RV_WINDOWS.map(w => (
            <Figure key={w} label={`Realized · ${w}d`} value={pct(me.rv[w])} size="sm" sub={me.rv[w] === null ? 'history too short' : w === 5 && rvTrend ? `the tape is ${rvTrend}` : undefined} />
          ))}
          <Figure label="Risk reversal" value={`${me.rr >= 0 ? '+' : '−'}${Math.abs(me.rr).toFixed(2)}`} size="sm" sub="25Δ put − 25Δ call, vol points" />
          <Figure label="Term slope" value={`${me.slope.toFixed(3)}×`} size="sm" sub="front over back — a read-out only" />
        </div>
        {/* The slope is printed and never judged: one vol model sits behind
            every name, so the slope is the same on all of them — it is
            decoration rather than a read, and nothing on this desk votes on it. */}
        <Read ink={ink} className="mt-3" lead={words.label}>
          {words.note}
        </Read>
        <p className="mt-2 text-[10px] text-textMuted leading-snug">{regimeGateNote(me.verdict)}</p>
      </Section>
      <Section title="Where this name sits today" question="among the roster, not against its own past" accent="#a3a3a3">
        <Figure label="Roster IV percentile" value={`${Math.round(me.crossSectionalIvPct)}`} size="lg" sub={`richer than ${Math.round(me.crossSectionalIvPct)}% of the roster today — a place among names, not among this name’s own past`} />
        <div className="mt-3">
          <DataState kind="unavailable" title="IV rank" body={IV_RANK_UNAVAILABLE} pad="sm" />
        </div>
      </Section>
    </>
  );

  return (
    <>
      <div className="flex items-center gap-2.5 flex-wrap" data-vol-controls>
        <Tag ink={METRICS.vex.ink}>SLAYER-VOL v0.2</Tag>
        <ProvenanceChip sources={['chain']} className="ml-auto" />
        <span className="font-mono text-[10px] text-textMuted uppercase tracking-widest tnum">calibrated {scanAt} · 10s</span>
      </div>
      <Deck hero={hero} rail={rail}>
        <Bench cols={3}>
          <Section title="The term structure" question="implied vol by days to expiry — today against a day, a week and a month ago" accent={METRICS.vex.ink}>
            <TermStructure data={lab.term} />
          </Section>
          <Section title="What the market is pricing" question="the distribution implied by the surface — the odds of being outside ±2%" accent={METRICS.vanna.ink}>
            <RiskNeutralDist data={lab.rnd} />
            <div className="mt-2 grid grid-cols-3 gap-x-3">
              <Figure label="Above +2%" value={`${(lab.rnd.stats.pAbove2 * 100).toFixed(0)}%`} size="sm" ink={LONG_GAMMA} />
              <Figure label="Below −2%" value={`${(lab.rnd.stats.pBelow2 * 100).toFixed(0)}%`} size="sm" ink={SHORT_GAMMA} />
              <Figure label="Butterfly" value={lab.rnd.stats.butterfly.toFixed(2)} size="sm" sub="wings over the body" />
            </div>
          </Section>
          <Section title="The regime, over time" question="how long vol has sat where it sits, and what usually follows" accent={ink}>
            <RegimePanel data={lab.regime} />
          </Section>
        </Bench>
        <Section title="The roster, by implied vol" question="every name the desk watches, most expensive first — the verdict is each name’s own implied against its own realized" accent="#a3a3a3" flush>
          <div className="max-h-[360px] overflow-y-auto">
            <table className="w-full" data-vol-roster>
              <thead className="sticky top-0 bg-panel z-10">
                <tr className="font-mono text-[9px] uppercase tracking-widest text-textMuted">
                  <th className="text-left font-medium px-3 py-1.5 border-b border-borderSubtle">Name</th>
                  <th className="text-right font-medium px-2 py-1.5 border-b border-borderSubtle">Implied 30d</th>
                  <th className="text-right font-medium px-2 py-1.5 border-b border-borderSubtle">Realized 20d</th>
                  <th className="text-right font-medium px-2 py-1.5 border-b border-borderSubtle">Premium</th>
                  <th className="text-right font-medium px-2 py-1.5 border-b border-borderSubtle">Skew</th>
                  <th className="text-left font-medium px-3 py-1.5 border-b border-borderSubtle">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map(r => (
                  <tr key={r.ticker} className={`border-b border-borderSubtle/40 font-mono text-[11px] tnum ${r.ticker === me.ticker ? 'bg-select/[0.05]' : ''}`}>
                    <td className="px-3 py-1.5 font-bold text-textPrimary">{r.ticker}</td>
                    <td className="px-2 py-1.5 text-right text-textPrimary">{pct(r.iv)}</td>
                    <td className="px-2 py-1.5 text-right text-textSecondary">{pct(r.rv[20])}</td>
                    <td className="px-2 py-1.5 text-right" style={{ color: r.premium === null ? '#7d7d7d' : r.premium > 0 ? LONG_GAMMA : SHORT_GAMMA }}>
                      {r.premium === null ? '—' : `${r.premium >= 0 ? '+' : '−'}${Math.abs(r.premium * 100).toFixed(2)}`}
                    </td>
                    <td className="px-2 py-1.5 text-right text-textSecondary">{`${r.rr >= 0 ? '+' : '−'}${Math.abs(r.rr).toFixed(2)}`}</td>
                    <td className="px-3 py-1.5">
                      <span className="font-mono text-[9px] font-bold uppercase tracking-wider" style={{ color: VERDICT_INK[r.verdict] }}>
                        {VERDICT_WORDS[r.verdict].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </Deck>
    </>
  );
};

export default Vol;
