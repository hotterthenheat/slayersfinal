import { useMemo } from 'react';
import Simulator from '../../core/simulator';
import { BIAS_DEADZONE, buildModelError, inferredSeries, modelErrorWords, simulatedReference, type ErrorPoint } from '../../data/modelError';
import { fmtUsd } from '../../data/gex';
import DataState from '../../components/ui/DataState';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import Term from '../../components/ui/Term';
import { Bench, Deck, Figure, Legend, Read, Section, Tag } from '../../components/pinpoint/Desk';
import Spark from '../../components/pinpoint/Spark';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { LONG_GAMMA, SHORT_GAMMA } from '../../components/pinpoint/ink';

/*
==================================================
  SLAYER TERMINAL - AUDIT (pages/pinpoint/Audit.tsx)
  How wrong textbook GEX is right now.
  Rebuilt from zero, 2026-09-06.
==================================================

  THE CHECK ON EVERYTHING ELSE IN THE SECTION. Every gamma vendor — and
  every other desk here — INFERS dealer gamma from open interest and a
  sign assumption. Actualized gamma is the verified attribution, and a
  terminal that holds it can print the number nobody else will: how far
  the textbook is from the truth, right now, and which way.

  The checklist asks for the strongest visual treatment in the section
  because this is the desk that makes the other eight defensible. So: the
  accuracy is the largest figure on the page, the two series are drawn
  over each other in the hero with the gap between them shaded, the error
  series under it carries the ±5% dead zone as a band, and the error ink
  is the desk's ALERT orange — a warning about the measurement, which is
  neither positioning nor direction.

  THE REGIME BREAKDOWN is honest about its reach. Time of day is computed
  from the points themselves. The vol bucket and the DTE mix need each
  point's vol and expiry composition, which this feed does not carry per
  point — those two cuts say so rather than showing a bucket that was
  guessed.
*/

const ALERT = '#FF9500';

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
      <Section title="Audit">
        <DataState kind="loading" title="Awaiting the book" body="The audit needs a few scans of history before there is an error to measure." />
      </Section>
    );
  }

  const pts = read.points;
  const accuracy = read.accuracy === null ? null : Math.round(read.accuracy * 100);
  const accInk = accuracy === null ? '#a3a3a3' : accuracy >= 85 ? LONG_GAMMA : accuracy >= 65 ? '#F2C94C' : SHORT_GAMMA;
  const errNow = read.now.errorPct;
  const scale = pts.reduce((a, p) => a + Math.abs(p.actualized), 0) / Math.max(pts.length, 1);
  const worstIdx = read.worst ? pts.findIndex(p => p.time === read.worst!.time) : -1;
  const byPhase = PHASES.map(ph => {
    const inPhase = pts.filter(p => {
      const d = new Date(p.time * 1000);
      const h = d.getHours() + d.getMinutes() / 60;
      return h >= ph.from && h < ph.to;
    });
    const mae = inPhase.length ? inPhase.reduce((a, p) => a + Math.abs(p.error), 0) / inPhase.length : null;
    const pct = mae !== null && scale > 0 ? mae / scale : null;
    const bias = inPhase.length ? inPhase.reduce((a, p) => a + p.error, 0) / inPhase.length : null;
    return { ...ph, n: inPhase.length, pct, bias };
  });
  const worstPhase = byPhase.filter(p => p.pct !== null).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0];
  const biasInk = read.bias === 'CENTERED' ? LONG_GAMMA : ALERT;
  const errPct = (p: ErrorPoint) => (p.errorPct === null ? null : p.errorPct * 100);

  const hero = (
    <Section title="Textbook against the truth" question="inferred dealer gamma (what every vendor prints) over actualized gamma (the verified attribution) — the shaded gap is the error" accent={ALERT} className="h-full" bodyClassName="flex flex-col">
      <div className="flex items-end gap-6 flex-wrap">
        <Figure label="Rolling accuracy" value={accuracy === null ? '—' : `${accuracy}%`} ink={accInk} size="xl" sub="1 − mean absolute error over the book’s own scale" />
        <Figure label="Error now" value={errNow === null ? '—' : `${errNow > 0 ? '+' : ''}${(errNow * 100).toFixed(1)}%`} ink={errNow === null ? '#a3a3a3' : Math.abs(errNow) > 0.25 ? ALERT : '#ededed'} size="lg" sub={errNow === null ? 'the truth is zero here' : errNow > 0 ? 'the textbook overstates' : 'the textbook understates'} />
        <Figure label="Bias" value={read.bias} ink={biasInk} size="lg" sub={read.bias === 'CENTERED' ? `mean error inside ±${Math.round(BIAS_DEADZONE * 100)}% of scale` : 'a lean, not noise — one direction persists'} />
        <Figure label="Most wrong at" value={read.worst ? hhmm(read.worst.time) : '—'} sub={read.worst && read.worst.errorPct !== null ? `${read.worst.errorPct > 0 ? '+' : ''}${(read.worst.errorPct * 100).toFixed(0)}% — ${fmtUsd(read.worst.error)}` : ''} size="lg" ink={ALERT} />
      </div>
      <div className="mt-4 flex-1 min-h-[200px]">
        <Spark points={pts.map(p => ({ x: p.time, y: p.inferred }))} second={{ points: pts.map(p => ({ x: p.time, y: p.actualized })), ink: '#ededed' }} ink={ALERT} area={false} zero={0} height={200} width={720} marks={worstIdx >= 0 ? [worstIdx] : []} markInk={ALERT} ariaLabel="Inferred and actualized gamma through the session" />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[9px] tnum text-textMuted">
        <span>{pts.length ? hhmm(pts[0].time) : ''}</span>
        <Legend items={[{ ink: ALERT, label: 'inferred — the textbook' }, { ink: '#ededed', label: 'actualized — the truth' }]} />
        <span>{pts.length ? hhmm(pts[pts.length - 1].time) : ''}</span>
      </div>
      <div className="mt-3 border-t border-borderSubtle pt-3">
        <span className="font-mono text-[9px] uppercase tracking-widest text-textMuted">The error, with the ±{Math.round(BIAS_DEADZONE * 100)}% dead zone</span>
        <div className="mt-1 h-[90px]">
          <Spark points={pts.map(p => ({ x: p.time, y: errPct(p) ?? 0 }))} ink={ALERT} zero={0} area height={90} width={720} band={{ lo: -BIAS_DEADZONE * 100, hi: BIAS_DEADZONE * 100, fill: 'rgba(48,209,88,0.10)' }} marks={worstIdx >= 0 ? [worstIdx] : []} markInk={ALERT} ariaLabel="Error percent through the session with the dead zone" />
        </div>
        <p className="mt-1 text-[10px] text-textMuted leading-snug">Inside the green band the model is as right as the scale of the book allows; outside it the textbook is measurably wrong and the desk’s levels should be read with that margin.</p>
      </div>
    </Section>
  );

  const rail = (
    <>
      <Section title="The verdict" question="the audit in one sentence" accent={accInk}>
        <Read ink={accInk}>
          <Term k="Model error">{modelErrorWords(read)}</Term>
        </Read>
      </Section>
      <Section title="When the textbook fails" question="mean absolute error by time of day — the cut you can trade on" accent={ALERT}>
        <div className="flex flex-col gap-2" data-audit-phases>
          {byPhase.map(ph => (
            <div key={ph.key} className="grid grid-cols-[1fr_auto] items-center gap-2">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[10px] font-semibold text-textPrimary">{ph.label}</span>
                  <span className="font-mono text-[9px] text-textMuted tnum">{ph.n} readings</span>
                  {worstPhase && worstPhase.key === ph.key && ph.pct !== null && <Tag ink={ALERT}>worst</Tag>}
                </div>
                <div className="mt-1 h-[6px] rounded-sm bg-white/[0.05] overflow-hidden">
                  <span className="block h-full rounded-sm" style={{ width: `${Math.min(100, (ph.pct ?? 0) * 200)}%`, background: ALERT }} />
                </div>
              </div>
              <span className="font-mono text-[12px] font-bold tnum text-right" style={{ color: ph.pct === null ? '#7d7d7d' : ALERT }}>
                {ph.pct === null ? 'no data' : `${(ph.pct * 100).toFixed(0)}%`}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-textMuted leading-snug">{worstPhase && worstPhase.pct !== null ? `The textbook is furthest from the truth ${worstPhase.label.split(' · ')[0].toLowerCase()} — ${worstPhase.bias !== null && worstPhase.bias > 0 ? 'overstating' : 'understating'} on average there.` : 'Not enough readings in any phase to rank them.'}</p>
      </Section>
      <Section title="By vol and by expiry" question="two cuts this feed cannot make yet" accent="#a3a3a3">
        <DataState kind="unavailable" title="Needs per-reading vol and expiry mix" body="A breakdown by vol bucket or by DTE mix needs each reading to carry the vol regime and the expiry composition it was taken under. This history carries the totals only. When the exposure feed lands, both cuts fill in here without a code change." pad="sm" />
      </Section>
    </>
  );

  return (
    <>
      <div className="flex items-center gap-2.5 flex-wrap" data-audit-controls>
        <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-textPrimary">How wrong is textbook GEX right now</span>
        <Tag ink={ALERT}>positive error = the textbook overstates</Tag>
        <ProvenanceChip sources={['exposure']} className="ml-auto" />
        <span className="font-mono text-[10px] text-textMuted uppercase tracking-widest tnum">scan {scanAt} · 10s</span>
      </div>
      <Deck hero={hero} rail={rail}>
        <Bench cols={3}>
          <Section title="What is being compared" question="the inferred series — what every vendor sells" accent={ALERT}>
            <p className="text-[11px] text-textSecondary leading-relaxed">
              <span className="text-textPrimary font-semibold">Inferred</span> is the textbook: open interest at each strike, times the contract’s gamma, times a sign that assumes the dealers are short what the public bought. It is what every gamma vendor sells, and what the Levels, Targets and Heat desks draw.
            </p>
          </Section>
          <Section title="What the truth is" question="the actualized series — verified attribution" accent="#ededed">
            <p className="text-[11px] text-textSecondary leading-relaxed">
              <span className="text-textPrimary font-semibold">Actualized</span> is verified attribution — the gamma the dealers actually carry, from who is really on each side. It does not assume a sign. The gap between the two is the error every other desk in this section inherits.
            </p>
          </Section>
          <Section title="Why accuracy cannot flatter" question="the mean is absolute, so being wrong both ways does not cancel" accent={accInk}>
            <p className="text-[11px] text-textSecondary leading-relaxed">
              Accuracy is one minus the mean <span className="text-textPrimary font-semibold">absolute</span> error over the book’s scale. Overstating in the morning and understating in the afternoon do not cancel — a model that is wrong both ways all day scores as wrong all day.
            </p>
          </Section>
        </Bench>
      </Deck>
    </>
  );
};

export default Audit;
