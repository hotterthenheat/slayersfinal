import { useMemo } from 'react';
import Simulator from '../../core/simulator';
import { BIAS_DEADZONE, buildModelError, inferredSeries, modelErrorWords, simulatedReference, type ErrorPoint } from '../../data/modelError';
import { fmtUsd } from '../../data/gex';
import DataState from '../../components/ui/DataState';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import Term from '../../components/ui/Term';
import { Deck, DeskLoading, Figure, Legend, Method, Note, Read, Region, Surface, TYPE, Tag, Toolbar } from '../../components/pinpoint/Desk';
import Spark from '../../components/pinpoint/Spark';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { INK, WARN } from '../../components/pinpoint/ink';

/*
==================================================
  SLAYER TERMINAL - AUDIT (pages/pinpoint/Audit.tsx)
  How wrong textbook GEX is right now.
==================================================

  THE CHECK ON EVERYTHING ELSE IN THE SECTION. Every gamma vendor — and
  every other desk here — INFERS dealer gamma from open interest and a
  sign assumption. Actualized gamma is the verified attribution, and a
  terminal that holds it can print the number nobody else will: how far
  the textbook is from the truth, right now, and which way.

  The accuracy is the desk's lead figure; the two series are drawn over
  each other with the error under them and the ±5% dead zone as a band;
  the error ink is the desk's warning amber — a claim about the
  measurement, which is neither positioning nor direction. The verdict
  in words is the desk's one box.
*/

const ALERT = WARN;

const ET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false });
/** Hours since midnight in New York, fractional. */
const etHour = (t: number): number => {
  const parts = ET.formatToParts(new Date(t * 1000));
  const h = Number(parts.find(p => p.type === 'hour')?.value ?? 0) % 24;
  const m = Number(parts.find(p => p.type === 'minute')?.value ?? 0);
  return h + m / 60;
};

const hhmm = (t: number) => {
  const d = new Date(t * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** The session in three thirds — the cut a reader can actually trade on. */
const PHASES: { key: string; label: string; from: number; to: number }[] = [
  { key: 'open', label: 'The open · 9:30–11:00', from: 9.5, to: 11 },
  { key: 'midday', label: 'Midday · 11:00–14:00', from: 11, to: 14 },
  { key: 'close', label: 'Into the close · 14:00–16:00', from: 14, to: 16.01 },
];

const Audit = () => {
  const { snapshot, scanAt } = useScanSnapshot();
  const read = useMemo(() => {
    if (!snapshot) return null;
    const snaps = Simulator.getGexHistory(snapshot.ticker) ?? [];
    const inferred = inferredSeries(snaps);
    return buildModelError(inferred, simulatedReference(inferred, snapshot.ticker));
  }, [snapshot]);

  if (!snapshot || !read || read.now === null) {
    return (
      <DeskLoading>
        <DataState kind="loading" title="Awaiting the book" body="The audit needs a few scans of history before there is an error to measure." />
      </DeskLoading>
    );
  }

  const pts = read.points;
  const accuracy = read.accuracy === null ? null : Math.round(read.accuracy * 100);
  const errNow = read.now.errorPct;
  const scale = pts.reduce((a, p) => a + Math.abs(p.actualized), 0) / Math.max(pts.length, 1);
  const worstIdx = read.worst ? pts.findIndex(p => p.time === read.worst!.time) : -1;
  /* The phases are the MARKET'S clock — New York — whatever machine the desk is read on. */
  const byPhase = PHASES.map(ph => {
    const inPhase = pts.filter(p => {
      const h = etHour(p.time);
      return h >= ph.from && h < ph.to;
    });
    const mae = inPhase.length ? inPhase.reduce((a, p) => a + Math.abs(p.error), 0) / inPhase.length : null;
    const pct = mae !== null && scale > 0 ? mae / scale : null;
    const bias = inPhase.length ? inPhase.reduce((a, p) => a + p.error, 0) / inPhase.length : null;
    return { ...ph, n: inPhase.length, pct, bias };
  });
  const worstPhase = byPhase.filter(p => p.pct !== null).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0];
  /* CENTERED is the absence of a lean; only the lean is worth an ink. */
  const biasInk = read.bias === 'CENTERED' ? INK.primary : ALERT;
  const errPct = (p: ErrorPoint) => (p.errorPct === null ? null : p.errorPct * 100);

  const hero = (
    <Region title="Textbook against the truth" note="the verified attribution solid, the textbook every vendor prints dashed over it — the distance between the two lines is the error">
      <div className="flex items-end gap-6 flex-wrap">
        <Figure label="Rolling accuracy" value={accuracy === null ? '—' : `${accuracy}%`} size="lead" sub="1 − mean absolute error over the book’s own scale" />
        <Figure label="Error now" value={errNow === null ? '—' : `${errNow > 0 ? '+' : ''}${(errNow * 100).toFixed(1)}%`} ink={errNow === null ? INK.muted : Math.abs(errNow) > 0.25 ? ALERT : INK.primary} sub={errNow === null ? 'the truth is zero here' : errNow > 0 ? 'the textbook overstates' : 'the textbook understates'} />
        <Figure label="Bias" value={read.bias} ink={biasInk} sub={read.bias === 'CENTERED' ? `mean error inside ±${Math.round(BIAS_DEADZONE * 100)}% of scale` : 'a lean, not noise — one direction persists'} />
        <Figure label="Most wrong at" value={read.worst ? hhmm(read.worst.time) : '—'} sub={read.worst && read.worst.errorPct !== null ? `${read.worst.errorPct > 0 ? '+' : ''}${(read.worst.errorPct * 100).toFixed(0)}% — ${fmtUsd(read.worst.error)}` : ''} ink={ALERT} />
      </div>
      <div className="pt-4">
        <Spark points={pts.map(p => ({ x: p.time, y: p.actualized }))} second={{ points: pts.map(p => ({ x: p.time, y: p.inferred })), ink: INK.secondary, dashed: true }} ink={INK.primary} area={false} zero={0} height={200} width={720} marks={worstIdx >= 0 ? [worstIdx] : []} markInk={ALERT} ariaLabel="Inferred and actualized gamma through the session" />
      </div>
      <div className={`pt-1 flex justify-between items-center ${TYPE.label} tracking-normal tnum text-textMuted`}>
        <span>{pts.length ? hhmm(pts[0].time) : ''}</span>
        <Legend items={[{ ink: INK.primary, label: 'actualized — the truth' }, { ink: INK.secondary, label: 'inferred — the textbook', dashed: true }]} />
        <span>{pts.length ? hhmm(pts[pts.length - 1].time) : ''}</span>
      </div>
      <div className="mt-3 border-t border-borderSubtle pt-3">
        <span className={`${TYPE.label} text-textMuted`}>The error, with the ±{Math.round(BIAS_DEADZONE * 100)}% dead zone</span>
        <div className="pt-1">
          <Spark points={pts.map(p => ({ x: p.time, y: errPct(p) ?? 0 }))} ink={INK.secondary} zero={0} area height={90} width={720} band={{ lo: -BIAS_DEADZONE * 100, hi: BIAS_DEADZONE * 100, fill: 'rgba(255,255,255,0.055)' }} marks={worstIdx >= 0 ? [worstIdx] : []} markInk={ALERT} ariaLabel="Error percent through the session with the dead zone" />
        </div>
        <p className={`${TYPE.body} text-textMuted pt-1`}>Inside the band the model is as right as the scale of the book allows; outside it the textbook is measurably wrong and the desk’s levels should be read with that margin.</p>
      </div>
    </Region>
  );

  const rail = (
    <>
      <Surface title="The verdict">
        <Read>
          <Term k="Model error">{modelErrorWords(read)}</Term>
        </Read>
      </Surface>

      <Region title="When the textbook fails" note="mean absolute error by time of day — the cut you can trade on">
        <div className="flex flex-col gap-2" data-audit-phases>
          {byPhase.map(ph => (
            <div key={ph.key} className="grid grid-cols-[1fr_auto] items-center gap-2">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className={`${TYPE.label} tracking-normal font-semibold text-textPrimary normal-case`}>{ph.label}</span>
                  <span className={`${TYPE.label} tracking-normal text-textMuted tnum`}>{ph.n} readings</span>
                  {worstPhase && worstPhase.key === ph.key && ph.pct !== null && <Tag ink={ALERT}>worst</Tag>}
                </div>
                <div className="mt-1 h-[6px] bg-white/[0.05] overflow-hidden">
                  <span className="block h-full" style={{ width: `${Math.min(100, (ph.pct ?? 0) * 200)}%`, background: ALERT }} />
                </div>
              </div>
              <span className={`${TYPE.num} text-right`} style={{ color: ph.pct === null ? INK.muted : ALERT }}>
                {ph.pct === null ? 'no data' : `${(ph.pct * 100).toFixed(0)}%`}
              </span>
            </div>
          ))}
        </div>
        <p className={`${TYPE.body} text-textMuted pt-2`}>
          {worstPhase && worstPhase.pct !== null ? `The textbook is furthest from the truth ${worstPhase.label.split(' · ')[0].toLowerCase()} — ${worstPhase.bias !== null && worstPhase.bias > 0 ? 'overstating' : 'understating'} on average there.` : 'Not enough readings in any phase to rank them.'}
        </p>
      </Region>

      <Region title="By vol and by expiry">
        <DataState kind="unavailable" title="Needs per-reading vol and expiry mix" body="A breakdown by vol bucket or by DTE mix needs each reading to carry the vol regime and the expiry composition it was taken under. This history carries the totals only. When the exposure feed lands, both cuts fill in here without a code change." pad="sm" />
      </Region>
    </>
  );

  return (
    <>
      <Toolbar data-audit-controls>
        <span className={`${TYPE.title} text-textPrimary`}>How wrong is textbook GEX right now</span>
        <Tag ink={ALERT}>positive error = the textbook overstates</Tag>
        <ProvenanceChip sources={['exposure']} className="ml-auto" />
        <span className={`${TYPE.label} text-textMuted tnum`}>scan {scanAt} · 10s</span>
      </Toolbar>

      <Deck hero={hero} rail={rail}>
        <Method title="The three words this desk turns on">
          <Note term="Inferred">The textbook: open interest at each strike, times the contract’s gamma, times a sign that assumes the dealers are short what the public bought. It is what every gamma vendor sells, and what the Levels and Targets desks draw.</Note>
          <Note term="Actualized">Verified attribution — the gamma the dealers actually carry, from who is really on each side. It does not assume a sign. The gap between the two is the error every other desk in this section inherits.</Note>
          <Note term="Accuracy">One minus the mean absolute error over the book’s scale. Overstating in the morning and understating in the afternoon do not cancel — a model that is wrong both ways all day scores as wrong all day.</Note>
        </Method>
      </Deck>
    </>
  );
};

export default Audit;
