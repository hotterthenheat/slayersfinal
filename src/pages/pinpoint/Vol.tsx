import { useMemo, useState } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import { buildVolLab } from '../../data/vollab';
import { IV_RANK_UNAVAILABLE, RV_WINDOWS, VERDICT_WORDS, buildVolRegime, regimeGateNote, type RegimeVerdict } from '../../data/volRegime';
import DataState from '../../components/ui/DataState';
import { Cell, DeskLoading, Figure, Group, Legend, Pane, Read, Row, Stat, TYPE, Table, Tag, Toolbar, Workspace } from '../../components/pinpoint/Desk';
import HeatField, { type HeatColumn, type HeatRow } from '../../components/pinpoint/HeatField';
import Series from '../../components/pinpoint/Series';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { INK, LONG_GAMMA, SHORT_GAMMA, SPOT } from '../../components/pinpoint/ink';

/*
  VOL — the surface, and the state of vol. Implied by expiry and moneyness
  is the picture; the term structure under it; the verdict — quiet,
  ordinary, strained — is the one word the Compass gate reads. An IV rank
  needs a year of this name's own implied history and the desk has none,
  so the rank is absent and its substitute is labelled as the different
  thing it is.
*/

const READ_DTE = 30;
const VERDICT_INK: Record<RegimeVerdict, string> = { quiet: LONG_GAMMA, ordinary: INK.secondary, strained: SHORT_GAMMA, unknown: INK.muted };
const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);
const pts = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`;
const SLOPE_NOTE = 'Printed and never judged: one vol model sits behind every name, so the slope is the same on all of them — decoration rather than a read, and nothing on this desk votes on it.';

const Vol = () => {
  const { activeTicker } = useMarketData();
  const { snapshot, scanAt } = useScanSnapshot();
  const [cell, setCell] = useState<{ dte: string; money: string; iv: number | null } | null>(null);
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
  const s = lab.surface;
  const columns: HeatColumn[] = s.moneyness.map(m => ({ key: String(m), label: `${Math.round(m * 100)}` }));
  const heatRows: HeatRow[] = s.dte.map((d, i) => ({ key: String(d), label: `${d}d`, cells: s.cells[i], ink: d === READ_DTE ? INK.primary : undefined }));
  const term = lab.term;
  const rnd = lab.rnd;
  const reg = lab.regime;

  return (
    <Workspace
      toolbar={
        <Toolbar data-vol-controls>
          <Tag>SLAYER-VOL v0.2</Tag>
          <Tag ink={ink} title={regimeGateNote(me.verdict)}>
            {words.label}
          </Tag>
          <span className={`${TYPE.label} text-textMuted tnum ml-auto`}>calibrated {scanAt}</span>
        </Toolbar>
      }
      picture={
        <>
          <div className={`flex items-baseline justify-between ${TYPE.label} text-textMuted pb-1`}>
            <span>implied vol · expiry down, moneyness across (% of forward {s.forward.toFixed(2)})</span>
            <span className="tnum">
              {s.min.toFixed(0)}–{s.max.toFixed(0)}%
            </span>
          </div>
          <HeatField
            columns={columns}
            rows={heatRows}
            scale={{ kind: 'sequential', min: s.min, max: s.max }}
            fmt={v => v.toFixed(0)}
            onHover={c => setCell(c ? { dte: c.row.label, money: c.column.label, iv: c.value } : null)}
            ariaLabel={`${snapshot.ticker} implied vol surface, ${s.dte.length} expiries by ${s.moneyness.length} moneyness columns, from ${s.min.toFixed(0)} to ${s.max.toFixed(0)} percent.`}
          />
          <div className="h-[150px] shrink-0 flex flex-col border-t border-borderSubtle pt-1" data-vol-term>
            <Series
              lines={[
                { key: 'now', points: term.current.map(p => ({ x: p.dte, y: p.iv })), ink: INK.primary, width: 1.5 },
                { key: 'dayAgo', points: term.dayAgo.map(p => ({ x: p.dte, y: p.iv })), ink: INK.secondary, width: 1 },
                { key: 'weekAgo', points: term.weekAgo.map(p => ({ x: p.dte, y: p.iv })), ink: INK.muted, width: 1, dashed: true },
                { key: 'monthAgo', points: term.monthAgo.map(p => ({ x: p.dte, y: p.iv })), ink: INK.muted, width: 1 },
              ]}
              rule={{ x: READ_DTE, ink: SPOT, label: `${READ_DTE}d` }}
              fmtX={d => `${d}d`}
              fmtY={v => `${v.toFixed(0)}%`}
              ariaLabel="ATM implied vol by tenor, now against a day, a week and a month ago"
            />
            <Legend className="pt-1" items={[{ ink: INK.primary, label: 'term structure now' }, { ink: INK.secondary, label: 'a day ago' }, { ink: INK.muted, label: 'a week ago', dashed: true }, { ink: INK.muted, label: 'a month ago' }]} />
          </div>
        </>
      }
      drawer={
        <Pane className="max-h-[180px]" data-vol-roster>
          <Table
            sticky
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
                <Cell className={`${TYPE.num} text-textPrimary`}>{r.ticker}</Cell>
                <Cell num className="text-textPrimary">
                  {pct(r.iv)}
                </Cell>
                <Cell num className="text-textSecondary">
                  {pct(r.rv[20])}
                </Cell>
                <Cell num style={{ color: r.premium === null ? INK.muted : r.premium > 0 ? LONG_GAMMA : SHORT_GAMMA }}>
                  {r.premium === null ? '—' : pts(r.premium * 100)}
                </Cell>
                <Cell num className="text-textSecondary">
                  {pts(r.rr)}
                </Cell>
                <Cell>
                  <span className={`${TYPE.label} font-bold`} style={{ color: VERDICT_INK[r.verdict] }}>
                    {VERDICT_WORDS[r.verdict].label}
                  </span>
                </Cell>
              </Row>
            ))}
          </Table>
        </Pane>
      }
      inspector={
        <>
          <Group title="State" actions={<Tag ink={ink}>{words.label}</Tag>} data-group="state">
            <Stat label={`Implied · ${READ_DTE}d`} value={pct(me.iv)} sub="at the money" />
            <Stat label="Premium over realized" value={me.premium === null ? '—' : pts(me.premium * 100)} ink={me.premium === null ? INK.muted : me.premium > 0 ? LONG_GAMMA : SHORT_GAMMA} sub="vol points, implied − 20-session realized" />
            {RV_WINDOWS.map(w => (
              <Stat key={w} label={`Realized · ${w}d`} value={pct(me.rv[w])} sub={me.rv[w] === null ? 'history too short' : w === 5 && rvTrend ? `the tape is ${rvTrend}` : undefined} />
            ))}
            <Stat label="Risk reversal" value={pts(me.rr)} sub="25Δ put − 25Δ call, vol points" />
            <Stat label="Term slope" value={`${me.slope.toFixed(3)}×`} sub="front over back — a read-out only" title={SLOPE_NOTE} data-term-slope />
          </Group>
          <Group title="Cell" data-group="cell">
            {cell ? <Stat label={`${cell.dte} · ${cell.money}% of forward`} value={cell.iv === null ? '—' : `${cell.iv.toFixed(1)}%`} data-cell /> : <Stat label="—" value="point at a cell" />}
          </Group>
          <Group title="Pricing" data-group="pricing">
            <div className="pt-2">
              <Series lines={[{ key: 'density', points: rnd.prices.map((p, i) => ({ x: p, y: rnd.density[i] })), ink: INK.secondary, area: true, width: 1 }]} band={undefined} rule={{ x: rnd.forward, ink: SPOT }} marks={[{ x: rnd.sigma1[0], ink: INK.muted }, { x: rnd.sigma1[1], ink: INK.muted }]} fmtX={v => v.toFixed(0)} fmtY={() => ''} height={72} ariaLabel="The risk-neutral distribution the surface implies, with the forward and one sigma either side" />
            </div>
            <Stat label="Expected move" value={`±${rnd.stats.expMovePct.toFixed(2)}%`} sub={`±$${rnd.stats.expMoveAbs.toFixed(2)} to the read tenor`} />
            {/* The model emits these already in percent, like every other
                stat beside them. Multiplying by a hundred printed "186%"
                for a probability, which is not a small error — it is an
                impossible number on a desk whose whole claim is honesty. */}
            <Stat label="Above +2%" value={`${rnd.stats.pAbove2.toFixed(1)}%`} ink={LONG_GAMMA} sub="of the distribution, to the read tenor" />
            <Stat label="Below −2%" value={`${rnd.stats.pBelow2.toFixed(1)}%`} ink={SHORT_GAMMA} />
            <Stat label="Skew" value={pts(rnd.stats.riskReversal)} ink={rnd.stats.riskReversal > 0 ? SHORT_GAMMA : INK.primary} sub="25Δ risk reversal, vol points" />
            <Stat label="Butterfly" value={rnd.stats.butterfly.toFixed(2)} sub="wings over the body" />
          </Group>
          <Group title="Regime" data-group="regime">
            <Stat label="Now" value={reg.current} sub={`${Math.round(reg.prob)}% · since ${reg.since}`} />
            <Stat label="Typical stay" value={`${reg.avgDurationDays}d`} />
            <Stat label="Next month" value={`${Math.round(reg.nextLow)}% · ${Math.round(reg.nextHigh)}%`} sub="to low vol · to high vol" />
          </Group>
          <Group title="Roster" data-group="roster">
            <Stat label="IV percentile, today" value={String(Math.round(me.crossSectionalIvPct))} sub={`richer than ${Math.round(me.crossSectionalIvPct)}% of the roster today — a place among names, not among this name’s own past`} />
            <div className="pt-2">
              <DataState kind="unavailable" title="No implied history to rank against" body={IV_RANK_UNAVAILABLE} pad="sm" />
            </div>
          </Group>
        </>
      }
      strip={
        <>
          <Figure label="ATM 30d" value={`${term.stats.atm30.toFixed(1)}%`} size="lead" />
          <Figure label="1m · 3m · 6m · 1y" value={`${term.stats.iv1m.toFixed(0)} · ${term.stats.iv3m.toFixed(0)} · ${term.stats.iv6m.toFixed(0)} · ${term.stats.iv1y.toFixed(0)}`} sub="implied by tenor, %" />
          <Figure label="Expected move" value={`±${rnd.stats.expMovePct.toFixed(2)}%`} />
          <Figure label="Premium" value={me.premium === null ? '—' : pts(me.premium * 100)} ink={me.premium === null ? INK.muted : me.premium > 0 ? LONG_GAMMA : SHORT_GAMMA} sub="over realized" />
          <Read>{words.note}</Read>
        </>
      }
    />
  );
};

export default Vol;
