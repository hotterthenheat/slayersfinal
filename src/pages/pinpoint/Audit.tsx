import { useMemo } from 'react';
import Simulator from '../../core/simulator';
import { BIAS_DEADZONE, buildModelError, inferredSeries, modelErrorWords, simulatedReference, type ErrorPoint } from '../../data/modelError';
import { fmtUsd } from '../../data/gex';
import DataState from '../../components/ui/DataState';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import Term from '../../components/ui/Term';
import { Deck, Figure, Legend, Read, Section, TYPE, Tag } from '../../components/pinpoint/Desk';
import Spark from '../../components/pinpoint/Spark';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { INK, LONG_GAMMA, SHORT_GAMMA, WARN } from '../../components/pinpoint/ink';

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
      <Section title="Audit">
        <DataState kind="loading" title="Awaiting the book" body="The audit needs a few scans of history before there is an error to measure." />
      </Section>
    );
  }

  const pts = read.points;
  const accuracy = read.accuracy === null ? null : Math.round(read.accuracy * 100);
  /* No ink. It was green/gold/red, then briefly a brightness grade — and a
     brightness grade DIMS the headline exactly when the news is worst, which
     is backwards on the one desk whose subject is the model being wrong. The
     figure stands in the reading ink at lead size; the amber marks the three
     things that are actually alarming, and nothing else on the desk competes
     with them. */
  const errNow = read.now.errorPct;
  const scale = pts.reduce((a, p) => a + Math.abs(p.actualized), 0) / Math.max(pts.length, 1);
  const worstIdx = read.worst ? pts.findIndex(p => p.time === read.worst!.time) : -1;
  /* The phases are the MARKET'S clock — New York — whatever machine the
     desk is read on. */
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
  /* CENTERED is not a good outcome the way green means good — it is the
     absence of a lean. Only the lean is worth an ink. */
  const biasInk = read.bias === 'CENTERED' ? INK.primary : ALERT;
  const errPct = (p: ErrorPoint) => (p.errorPct === null ? null : p.errorPct * 100);

  const hero = (
    <Section title="Textbook against the truth" note="the verified attribution solid, the textbook every vendor prints dashed over it — the distance between the two lines is the error" className="h-full" bodyClassName="flex flex-col">
      <div className="flex items-end gap-6 flex-wrap">
        <Figure label="Rolling accuracy" value={accuracy === null ? '—' : `${accuracy}%`} size="lead" sub="1 − mean absolute error over the book’s own scale" />
        <Figure label="Error now" value={errNow === null ? '—' : `${errNow > 0 ? '+' : ''}${(errNow * 100).toFixed(1)}%`} ink={errNow === null ? INK.muted : Math.abs(errNow) > 0.25 ? ALERT : INK.primary} size="figure" sub={errNow === null ? 'the truth is zero here' : errNow > 0 ? 'the textbook overstates' : 'the textbook understates'} />
        <Figure label="Bias" value={read.bias} ink={biasInk} size="figure" sub={read.bias === 'CENTERED' ? `mean error inside ±${Math.round(BIAS_DEADZONE * 100)}% of scale` : 'a lean, not noise — one direction persists'} />
        <Figure label="Most wrong at" value={read.worst ? hhmm(read.worst.time) : '—'} sub={read.worst && read.worst.errorPct !== null ? `${read.worst.errorPct > 0 ? '+' : ''}${(read.worst.errorPct * 100).toFixed(0)}% — ${fmtUsd(read.worst.error)}` : ''} size="figure" ink={ALERT} />
      </div>
      <div className="mt-4 flex-1 min-h-[200px]">
        <Spark points={pts.map(p => ({ x: p.time, y: p.actualized }))} second={{ points: pts.map(p => ({ x: p.time, y: p.inferred })), ink: INK.secondary, dashed: true }} ink={INK.primary} area={false} zero={0} height={200} width={720} marks={worstIdx >= 0 ? [worstIdx] : []} markInk={ALERT} ariaLabel="Inferred and actualized gamma through the session" />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] tnum text-textMuted">
        <span>{pts.length ? hhmm(pts[0].time) : ''}</span>
        <Legend items={[{ ink: INK.primary, label: 'actualized — the truth' }, { ink: INK.secondary, label: 'inferred — the textbook', dashed: true }]} />
        <span>{pts.length ? hhmm(pts[pts.length - 1].time) : ''}</span>
      </div>
      <div className="mt-3 border-t border-borderSubtle pt-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">The error, with the ±{Math.round(BIAS_DEADZONE * 100)}% dead zone</span>
        <div className="mt-1 h-[90px]">
          <Spark points={pts.map(p => ({ x: p.time, y: errPct(p) ?? 0 }))} ink={INK.secondary} zero={0} area height={90} width={720} band={{ lo: -BIAS_DEADZONE * 100, hi: BIAS_DEADZONE * 100, fill: 'rgba(255,255,255,0.055)' }} marks={worstIdx >= 0 ? [worstIdx] : []} markInk={ALERT} ariaLabel="Error percent through the session with the dead zone" />
        </div>
        <p className="mt-1 text-[10px] text-textMuted leading-snug">Inside the band the model is as right as the scale of the book allows; outside it the textbook is measurably wrong and the desk’s levels should be read with that margin.</p>
      </div>
    </Section>
  );

  const rail = (
    <>
      <Section title="The verdict">
        <Read>
          <Term k="Model error">{modelErrorWords(read)}</Term>
        </Read>
      </Section>
      <Section title="When the textbook fails" note="mean absolute error by time of day — the cut you can trade on">
        <div className="flex flex-col gap-2" data-audit-phases>
          {byPhase.map(ph => (
            <div key={ph.key} className="grid grid-cols-[1fr_auto] items-center gap-2">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[10px] font-semibold text-textPrimary">{ph.label}</span>
                  <span className="font-mono text-[10px] text-textMuted tnum">{ph.n} readings</span>
                  {worstPhase && worstPhase.key === ph.key && ph.pct !== null && <Tag ink={ALERT}>worst</Tag>}
                </div>
                <div className="mt-1 h-[6px] rounded-sm bg-white/[0.05] overflow-hidden">
                  <span className="block h-full rounded-sm" style={{ width: `${Math.min(100, (ph.pct ?? 0) * 200)}%`, background: ALERT }} />
                </div>
              </div>
              <span className="font-mono text-[13px] font-semibold tnum text-right" style={{ color: ph.pct === null ? INK.muted : ALERT }}>
                {ph.pct === null ? 'no data' : `${(ph.pct * 100).toFixed(0)}%`}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-textMuted leading-snug">{worstPhase && worstPhase.pct !== null ? `The textbook is furthest from the truth ${worstPhase.label.split(' · ')[0].toLowerCase()} — ${worstPhase.bias !== null && worstPhase.bias > 0 ? 'overstating' : 'understating'} on average there.` : 'Not enough readings in any phase to rank them.'}</p>
      </Section>
      <Section title="By vol and by expiry" note="two cuts this feed cannot make yet">
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
        {/* Three definitions. They were three sections in a row, each with its
            own title and its own subtitle — six headings to introduce three
            paragraphs. A glossary is a glossary: the term in the margin, the
            sentence beside it, on a measure a person can actually read. */}
        <Section title="The three words this desk turns on">
          <dl className="flex flex-col gap-3 max-w-[92ch]">
            {[
              { t: 'Inferred', d: 'The textbook: open interest at each strike, times the contract’s gamma, times a sign that assumes the dealers are short what the public bought. It is what every gamma vendor sells, and what the Levels, Targets and Heat desks draw.' },
              { t: 'Actualized', d: 'Verified attribution — the gamma the dealers actually carry, from who is really on each side. It does not assume a sign. The gap between the two is the error every other desk in this section inherits.' },
              { t: 'Accuracy', d: 'One minus the mean absolute error over the book’s scale. Overstating in the morning and understating in the afternoon do not cancel — a model that is wrong both ways all day scores as wrong all day.' },
            ].map(x => (
              <div key={x.t} className="grid grid-cols-1 sm:grid-cols-[132px_minmax(0,1fr)] gap-x-6 gap-y-1">
                <dt className={`${TYPE.label} font-bold text-textPrimary pt-[3px]`}>{x.t}</dt>
                <dd className={`${TYPE.read} text-textSecondary`}>{x.d}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </Deck>
    </>
  );
};

export default Audit;
