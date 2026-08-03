import { useMemo } from 'react';
import { AlertTriangle, Repeat, Zap, Landmark } from 'lucide-react';
import { buildFlowAlerts, buildPulseFlow, type FlowAlertKind } from '../../data/pulseflow';
import { fmtUsd } from '../../data/gex';

/*
  Flow Alerts rail — typed alert cards distilled from the session's print
  stream: URGENT REPEATER (3+ prints in one contract), REPEATER, GRENADE
  TRADE (sized short-dated OTM strike) and SIZABLE SWEEP. Each card carries
  the contract chip, total premium and peak return when trackable. The top
  card is ringed gold — the read the desk should look at first.
*/

interface FlowAlertsPanelProps {
  ticker: string;
  revision: number;
}

const KIND_META: Record<FlowAlertKind, { icon: typeof Zap; tone: string }> = {
  'URGENT REPEATER': { icon: Zap, tone: 'text-shortGamma' },
  REPEATER: { icon: Repeat, tone: 'text-textSecondary' },
  'GRENADE TRADE': { icon: AlertTriangle, tone: 'text-bear' },
  'SIZABLE SWEEP': { icon: Landmark, tone: 'text-longGamma' },
};

const FlowAlertsPanel = ({ ticker, revision }: FlowAlertsPanelProps) => {
  const alerts = useMemo(() => {
    const view = buildPulseFlow(ticker);
    return view ? buildFlowAlerts(view, ticker) : [];
    // stream extends with the session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, revision]);

  if (!alerts.length) {
    return (
      <div className="h-full flex items-center justify-center font-mono text-label text-textMuted uppercase tracking-widest">
        No qualifying flow yet…
      </div>
    );
  }

  return (
    /* Focusable because it scrolls and nothing inside it is: without a tab
       stop the feed is reachable by mouse wheel only, and a keyboard user
       cannot read past the first two alerts. */
    <div
      tabIndex={0}
      role="group"
      aria-label="Flow alerts"
      className="h-full min-h-0 overflow-y-auto p-2 flex flex-col gap-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60"
    >
      {alerts.map((a, i) => {
        const meta = KIND_META[a.kind];
        const Icon = meta.icon;
        return (
          <div
            key={a.id}
            className={`rounded-md border bg-panel px-2.5 py-2 ${
              i === 0 ? 'border-shortGamma/60' : 'border-borderSubtle'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Icon className={`w-3 h-3 ${meta.tone}`} />
              <span className={`font-mono text-micro font-bold uppercase tracking-wider ${meta.tone}`}>{a.kind}</span>
              <span className="ml-auto font-mono text-micro text-textMuted tnum">{a.time}</span>
            </div>
            <div className="mt-1 font-mono text-micro text-textMuted">
              Peak Return:{' '}
              {a.peakReturnPct != null ? (
                <span className="text-bull font-semibold tnum">{a.peakReturnPct.toFixed(1)}%</span>
              ) : (
                <span className="tnum">N/A</span>
              )}
              {a.prints > 1 && <span className="ml-2 tnum">{a.prints} prints</span>}
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-md border px-2 py-1 font-mono text-label font-semibold tnum ${
                  a.pc === 'C' ? 'border-bull/40 bg-bull/10 text-bull' : 'border-bear/40 bg-bear/10 text-bear'
                }`}
              >
                {a.ticker} {a.strike % 1 === 0 ? a.strike.toFixed(0) : a.strike.toFixed(2)}
                {a.pc}, Exp: {a.exp}
              </span>
              <span className="ml-auto font-mono text-label font-bold text-textPrimary tnum">{fmtUsd(a.premium)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default FlowAlertsPanel;
