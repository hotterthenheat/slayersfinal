import { useMemo, useState } from 'react';
import Simulator from '../../core/simulator';
import { BIAS_DEADZONE, buildModelError, inferredSeries, modelErrorWords, simulatedReference } from '../../data/modelError';
import { fmtUsd } from '../../data/gex';
import DataState from '../../components/ui/DataState';
import Term from '../../components/ui/Term';
import { DeskLoading, Figure, Group, Legend, Read, Stat, TYPE, Tag, Toolbar, Workspace } from '../../components/pinpoint/Desk';
import Series from '../../components/pinpoint/Series';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { INK, WARN } from '../../components/pinpoint/ink';

/*
  AUDIT — how wrong textbook GEX is right now. Every other desk infers
  dealer gamma from open interest and a sign assumption; the verified
  attribution is the truth, and the distance between the two lines is the
  error every level in this section inherits. Amber is the desk's claim
  about its own reliability — neither positioning nor direction.
*/

const ALERT = WARN;
const ET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false });
/** Hours since midnight in New York, fractional — the market's clock, whatever machine reads the desk. */
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
const PHASES: { key: string; label: string; from: number; to: number }[] = [
  { key: 'open', label: 'Open · 9:30–11:00', from: 9.5, to: 11 },
  { key: 'midday', label: 'Midday · 11:00–14:00', from: 11, to: 14 },
  { key: 'close', label: 'Close · 14:00–16:00', from: 14, to: 16.01 },
];
const signedPct = (v: number | null, digits = 1) => (v === null ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`);

const Audit = () => {
  const { snapshot, scanAt } = useScanSnapshot();
  const [cursor, setCursor] = useState<{ time: number; actualized: number | null; inferred: number | null; error: number | null } | null>(null);
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
  const biasInk = read.bias === 'CENTERED' ? INK.primary : ALERT;
  const worstMark = read.worst ? [{ x: read.worst.time, ink: ALERT, label: 'WORST' }] : [];
  const errPts = pts.map(p => ({ x: p.time, y: p.errorPct === null ? 0 : p.errorPct * 100 }));

  return (
    <Workspace
      toolbar={
        <Toolbar data-audit-controls>
          <span className={`${TYPE.title} text-textPrimary`}>How wrong is textbook GEX right now</span>
          <Tag ink={ALERT}>positive error = the textbook overstates</Tag>
          <span className={`${TYPE.label} text-textMuted tnum ml-auto`}>scan {scanAt}</span>
        </Toolbar>
      }
      picture={
        <>
          <Series
            lines={[
              { key: 'actualized', points: pts.map(p => ({ x: p.time, y: p.actualized })), ink: INK.primary, width: 1.5 },
              { key: 'inferred', points: pts.map(p => ({ x: p.time, y: p.inferred })), ink: INK.secondary, dashed: true, width: 1.25 },
            ]}
            zero
            marks={worstMark}
            fmtX={hhmm}
            fmtY={fmtUsd}
            onHover={(x, v) => {
              if (x === null) return setCursor(null);
              const a = v.actualized ?? null;
              const i = v.inferred ?? null;
              setCursor({ time: x, actualized: a, inferred: i, error: a !== null && i !== null ? i - a : null });
            }}
            ariaLabel={`Actualized dealer gamma, solid, against inferred textbook gamma, dashed, through the session. ${accuracy === null ? '' : `Rolling accuracy ${accuracy}%.`}`}
          />
          <Legend className="py-1" items={[{ ink: INK.primary, label: 'actualized — the truth' }, { ink: INK.secondary, label: 'inferred — the textbook', dashed: true }, { ink: ALERT, label: 'most wrong' }]} />
          <div className="h-[110px] shrink-0 flex flex-col border-t border-borderSubtle pt-1" data-audit-error>
            <Series lines={[{ key: 'error', points: errPts, ink: ALERT, area: true, width: 1 }]} zero band={{ lo: -BIAS_DEADZONE * 100, hi: BIAS_DEADZONE * 100 }} marks={worstMark.map(m => ({ x: m.x, ink: m.ink }))} fmtX={hhmm} fmtY={v => `${v.toFixed(0)}%`} ariaLabel={`Error percent through the session, with the ±${Math.round(BIAS_DEADZONE * 100)}% dead zone`} />
          </div>
        </>
      }
      inspector={
        <>
          <Group title="Now" data-group="now">
            <Stat label={<Term k="Model error">Accuracy</Term>} value={accuracy === null ? '—' : `${accuracy}%`} sub="1 − mean absolute error over the book's scale" data-accuracy />
            <Stat label="Error now" value={signedPct(errNow)} ink={errNow === null ? INK.muted : Math.abs(errNow) > 0.25 ? ALERT : INK.primary} sub={errNow === null ? 'the truth is zero here' : errNow > 0 ? 'the textbook overstates' : 'the textbook understates'} />
            <Stat label="Bias" value={read.bias} ink={biasInk} sub={read.bias === 'CENTERED' ? `mean error inside ±${Math.round(BIAS_DEADZONE * 100)}% of scale` : 'one direction persists'} />
            <Stat label="Most wrong at" value={read.worst ? hhmm(read.worst.time) : '—'} ink={ALERT} sub={read.worst ? `${signedPct(read.worst.errorPct, 0)} · ${fmtUsd(read.worst.error)}` : undefined} />
          </Group>
          <Group title="By time of day" data-audit-phases>
            {byPhase.map(ph => (
              <Stat key={ph.key} label={ph.label} value={ph.pct === null ? 'no data' : `${(ph.pct * 100).toFixed(0)}%`} ink={ph.pct === null ? INK.muted : ALERT} sub={`${ph.n} readings${worstPhase && worstPhase.key === ph.key && ph.pct !== null ? ` · worst, ${ph.bias !== null && ph.bias > 0 ? 'overstating' : 'understating'}` : ''}`} data-phase={ph.key} />
            ))}
          </Group>
          <Group title={cursor ? `At ${hhmm(cursor.time)}` : 'At the pointer'} data-group="cursor">
            {cursor ? (
              <>
                <Stat label="Actualized" value={cursor.actualized === null ? '—' : fmtUsd(cursor.actualized)} />
                <Stat label="Inferred" value={cursor.inferred === null ? '—' : fmtUsd(cursor.inferred)} />
                <Stat label="Error" value={cursor.error === null ? '—' : fmtUsd(cursor.error)} ink={ALERT} sub={cursor.error === null ? undefined : cursor.error > 0 ? 'overstates' : 'understates'} />
              </>
            ) : (
              <Stat label="—" value="point at the line" />
            )}
          </Group>
          <Group title="By vol and by expiry" data-group="cuts">
            <DataState kind="unavailable" title="Needs per-reading vol and expiry mix" body="This history carries the totals only. When the exposure feed lands, both cuts fill in here." pad="sm" />
          </Group>
        </>
      }
      strip={
        <>
          <Figure label="Accuracy" value={accuracy === null ? '—' : `${accuracy}%`} size="lead" sub="rolling, this session" />
          <Figure label="Error now" value={signedPct(errNow)} ink={errNow === null ? INK.muted : Math.abs(errNow) > 0.25 ? ALERT : INK.primary} />
          <Figure label="Bias" value={read.bias} ink={biasInk} />
          <Figure label="Most wrong at" value={read.worst ? hhmm(read.worst.time) : '—'} ink={ALERT} />
          <Read>{modelErrorWords(read)}</Read>
        </>
      }
    />
  );
};

export default Audit;
