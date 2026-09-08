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
import { Bench, Cell, Deck, DeskLoading, Figure, Method, Note, Pane, Read, Region, Row, Surface, TYPE, Table, Tag, Toolbar } from '../../components/pinpoint/Desk';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { INK, LONG_GAMMA, SHORT_GAMMA } from '../../components/pinpoint/ink';

/*
==================================================
  SLAYER TERMINAL - VOL (pages/pinpoint/Vol.tsx)
  The surface, the term structure, and the state of vol.
==================================================

  THE QUESTION: are options expensive, and what shape is that number a
  slice of. The surface is the picture; the verdict — quiet, ordinary,
  strained — is the desk's one box, because it is the one word the
  Compass gate reads.

  What is not here is said: an IV rank needs a year of this name's own
  implied history and the desk has none, so the rank is absent and its
  substitute (where this name's IV sits among the roster today) is
  labelled as the different thing it is.
*/

const READ_DTE = 30;

const VERDICT_INK: Record<RegimeVerdict, string> = {
  quiet: LONG_GAMMA,
  ordinary: INK.secondary,
  strained: SHORT_GAMMA,
  unknown: INK.muted,
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
      <DeskLoading>
        <DataState kind="loading" title="Calibrating the surface" body="The first tick has not arrived yet." />
      </DeskLoading>
    );
  }

  const words = VERDICT_WORDS[me.verdict];
  const ink = VERDICT_INK[me.verdict];
  const ranked = [...rows].sort((a, b) => b.iv - a.iv);
  const rvTrend = me.rv[5] !== null && me.rv[20] !== null ? (me.rv[5] > me.rv[20] * 1.1 ? 'speeding up' : me.rv[5] < me.rv[20] * 0.9 ? 'settling down' : 'steady') : null;

  const hero = (
    <Region title="The surface" note={`${snapshot.ticker} implied vol by expiry and moneyness — the shape every number on this desk is a slice of`}>
      {/* A real height: IvSurface's rows are `h-full` and collapse against an auto parent. */}
      <div className="h-[340px]">
        <IvSurface data={lab.surface} />
      </div>
      <div className="mt-3 border-t border-borderSubtle pt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
        <Figure label="ATM 30d" value={`${lab.term.stats.atm30.toFixed(1)}%`} />
        <Figure label="1m · 3m · 6m · 1y" value={`${lab.term.stats.iv1m.toFixed(0)} · ${lab.term.stats.iv3m.toFixed(0)} · ${lab.term.stats.iv6m.toFixed(0)} · ${lab.term.stats.iv1y.toFixed(0)}`} size="sm" sub="implied by tenor, %" />
        <Figure label="Expected move" value={`±${lab.rnd.stats.expMovePct.toFixed(2)}%`} sub={`±$${lab.rnd.stats.expMoveAbs.toFixed(2)} to the read tenor`} />
        <Figure label="Skew" value={`${lab.rnd.stats.riskReversal >= 0 ? '+' : ''}${lab.rnd.stats.riskReversal.toFixed(2)}`} sub="25Δ risk reversal, vol points" ink={lab.rnd.stats.riskReversal > 0 ? SHORT_GAMMA : INK.primary} />
      </div>
    </Region>
  );

  const rail = (
    <>
      <Surface title="The state of vol" note={`${READ_DTE}-day implied against what the tape has realized`} actions={<Tag ink={ink}>{words.label}</Tag>}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Figure label={`Implied · ${READ_DTE}d`} value={pct(me.iv)} sub="at the money" />
          <Figure label="Premium over realized" value={me.premium === null ? '—' : `${me.premium >= 0 ? '+' : '−'}${Math.abs(me.premium * 100).toFixed(2)}`} ink={me.premium === null ? INK.muted : me.premium > 0 ? LONG_GAMMA : SHORT_GAMMA} sub="vol points, implied − 20-session realized" />
          {RV_WINDOWS.map(w => (
            <Figure key={w} label={`Realized · ${w}d`} value={pct(me.rv[w])} size="sm" sub={me.rv[w] === null ? 'history too short' : w === 5 && rvTrend ? `the tape is ${rvTrend}` : undefined} />
          ))}
          <Figure label="Risk reversal" value={`${me.rr >= 0 ? '+' : '−'}${Math.abs(me.rr).toFixed(2)}`} size="sm" sub="25Δ put − 25Δ call, vol points" />
          <Figure label="Term slope" value={`${me.slope.toFixed(3)}×`} size="sm" sub="front over back — a read-out only" />
        </div>
        <Read className="pt-3">{words.note}</Read>
      </Surface>

      <Region title="Where this name sits today" note="among the roster, not against its own past">
        <Figure label="Roster IV percentile" value={`${Math.round(me.crossSectionalIvPct)}`} sub={`richer than ${Math.round(me.crossSectionalIvPct)}% of the roster today — a place among names, not among this name’s own past`} />
        <div className="pt-3">
          <DataState kind="unavailable" title="No implied history to rank against" body={IV_RANK_UNAVAILABLE} pad="sm" />
        </div>
      </Region>
    </>
  );

  return (
    <>
      <Toolbar data-vol-controls>
        <Tag>SLAYER-VOL v0.2</Tag>
        <ProvenanceChip sources={['chain', 'carry']} className="ml-auto" note="The surface and the distribution it implies are priced through the desk's own rate and yield." />
        <span className={`${TYPE.label} text-textMuted tnum`}>calibrated {scanAt} · 10s</span>
      </Toolbar>

      <Deck hero={hero} rail={rail}>
        <Bench cols={3}>
          <Region title="The term structure">
            <TermStructure data={lab.term} />
          </Region>
          <Region title="What the market is pricing">
            <RiskNeutralDist data={lab.rnd} />
            <div className="pt-2 grid grid-cols-3 gap-x-3">
              <Figure label="Above +2%" value={`${(lab.rnd.stats.pAbove2 * 100).toFixed(0)}%`} size="sm" ink={LONG_GAMMA} />
              <Figure label="Below −2%" value={`${(lab.rnd.stats.pBelow2 * 100).toFixed(0)}%`} size="sm" ink={SHORT_GAMMA} />
              <Figure label="Butterfly" value={lab.rnd.stats.butterfly.toFixed(2)} size="sm" sub="wings over the body" />
            </div>
          </Region>
          <Region title="The regime, over time">
            <RegimePanel data={lab.regime} />
          </Region>
        </Bench>

        <Region title="The roster, by implied vol">
          <Pane className="max-h-[360px]">
            <Table
              sticky
              data-vol-roster
              cols={[
                { key: 'name', label: 'Name' },
                { key: 'iv', label: 'Implied 30d', align: 'right' },
                { key: 'rv', label: 'Realized 20d', align: 'right' },
                { key: 'prem', label: 'Premium', align: 'right' },
                { key: 'skew', label: 'Skew', align: 'right' },
                { key: 'verdict', label: 'Verdict' },
              ]}
            >
              {ranked.map(r => (
                <Row key={r.ticker} selected={r.ticker === me.ticker}>
                  <Cell className={`${TYPE.lead} text-textPrimary`}>{r.ticker}</Cell>
                  <Cell num className="text-textPrimary">
                    {pct(r.iv)}
                  </Cell>
                  <Cell num className="text-textSecondary">
                    {pct(r.rv[20])}
                  </Cell>
                  <Cell num style={{ color: r.premium === null ? INK.muted : r.premium > 0 ? LONG_GAMMA : SHORT_GAMMA }}>
                    {r.premium === null ? '—' : `${r.premium >= 0 ? '+' : '−'}${Math.abs(r.premium * 100).toFixed(2)}`}
                  </Cell>
                  <Cell num className="text-textSecondary">{`${r.rr >= 0 ? '+' : '−'}${Math.abs(r.rr).toFixed(2)}`}</Cell>
                  <Cell>
                    <span className={`${TYPE.label} font-bold`} style={{ color: VERDICT_INK[r.verdict] }}>
                      {VERDICT_WORDS[r.verdict].label}
                    </span>
                  </Cell>
                </Row>
              ))}
            </Table>
          </Pane>
        </Region>

        <Method>
          <Note term="The verdict">{regimeGateNote(me.verdict)}</Note>
          <Note term="The term slope">Printed and never judged: one vol model sits behind every name, so the slope is the same on all of them — a read-out, not a read.</Note>
          <Note term="IV rank">{IV_RANK_UNAVAILABLE}</Note>
          <Note term="The model">SLAYER-VOL v0.2. The surface and the distribution it implies are priced through the desk’s own rate and yield.</Note>
        </Method>
      </Deck>
    </>
  );
};

export default Vol;
