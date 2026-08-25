import { ArrowUpRight, Layers } from 'lucide-react';
import Panel from '../ui/Panel';
import Term from '../ui/Term';
import { fmtUsd } from '../../data/gex';
import type { DriverRow, OptionRight } from '../../types/compass';

interface SetupDriversProps {
  ticker: string;
  rows: DriverRow[];
  /** Re-point the analysis at another contract on the same book. Absent = rows are facts only. */
  onOpen?: (strike: number, right: OptionRight) => void;
}

const th = 'font-mono text-[9px] uppercase tracking-wider text-textMuted font-medium px-3 py-1.5 whitespace-nowrap';

/** Signed distance; at the money reads 0.0%, never "-0.0%". */
const fmtDist = (v: number) => {
  const d = Math.abs(v) < 0.05 ? 0 : v;
  return `${d > 0 ? '+' : ''}${d.toFixed(1)}%`;
};

/* "Top contracts driving the setup" (Mo, 2026-08-19), placed where the phrase
   is TRUE — one setup, one name (Noah: the board rail said it of a 16-name
   board and meant nothing). The strict-table grammar of the premium ladder:
   whisper headers, right-aligned figures, hairline rows, ink alone carrying
   state. Each row is a contract and the PART it plays; the four facts say
   why it carries weight. A row is the door to that contract's own analysis. */
const SetupDrivers = ({ ticker, rows, onOpen }: SetupDriversProps) => {
  if (!rows.length) return null;
  const expiry = rows[0].expiry;
  return (
    <Panel
      title={
        /* Icon IN the text flow, not a flex box: Panel aligns title and
           subtitle on their baselines, and a flex title hands over its first
           item's baseline — the icon's bottom edge — which dropped the
           subtitle below the words (Noah, 2026-08-19). */
        <>
          <Layers className="inline-block w-3.5 h-3.5 align-[-3px] mr-1.5" aria-hidden="true" />
          Contracts driving this setup
        </>
      }
      subtitle={`${ticker} book · ${expiry} · the hedging this campaign trades through`}
      flush
      className="w-full"
    >
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-borderSubtle">
              <th className={`${th} text-left`}>Role</th>
              <th className={`${th} text-left`}>Contract</th>
              <th className={`${th} text-right`}>
                <Term k="Gamma share">Gamma</Term>
              </th>
              <th className={`${th} text-right`}>
                <Term k="V/OI">Vol/OI</Term>
              </th>
              <th className={`${th} text-right`}>
                <Term k="From spot">From spot</Term>
              </th>
              <th className={`${th} text-right`}>
                <Term k="Exposure">Exposure</Term>
              </th>
              {onOpen && <th className={th} aria-label="Open" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-borderSubtle">
            {rows.map(r => {
              const current = r.role === 'This contract';
              const isCall = r.right === 'C';
              const m = r.contract.match(/^(.*?)([CP])$/);
              const clickable = !!onOpen && !current;
              const open = () => onOpen?.(r.strike, r.right);
              return (
                <tr
                  key={`${r.strike}${r.right}`}
                  role={clickable ? 'button' : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? open : undefined}
                  onKeyDown={
                    clickable
                      ? e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            open();
                          }
                        }
                      : undefined
                  }
                  title={clickable ? `Open ${r.contract} ${r.expiry} — full analysis` : undefined}
                  className={`group transition-colors ${
                    current ? 'bg-white/[0.03]' : clickable ? 'cursor-pointer hover:bg-white/[0.02] focus-visible:bg-white/[0.03] focus-visible:outline-none' : ''
                  }`}
                >
                  {/* The part it plays — the current contract in the selection
                      voice ("you are here"); structural roles explain themselves */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`font-mono text-[10px] uppercase tracking-wider ${current ? 'text-select font-semibold' : 'text-textSecondary'}`}>
                      {r.role === 'This contract' ? r.role : <Term k={r.role}>{r.role}</Term>}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="font-mono text-[12px] font-semibold text-textPrimary">
                      {m ? (
                        <>
                          {m[1]}
                          <span className={isCall ? 'text-bull' : 'text-bear'}>{m[2]}</span>
                        </>
                      ) : (
                        r.contract
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[11px] tnum text-textPrimary">{r.gamma.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right font-mono text-[11px] tnum text-textSecondary">{r.volOi.toFixed(2)}×</td>
                  <td className="px-3 py-2 text-right font-mono text-[11px] tnum text-textSecondary">{fmtDist(r.distPct)}</td>
                  {/* Sim side-coding: negative = dealers absorb (bull), positive = amplify (bear) */}
                  <td className={`px-3 py-2 text-right font-mono text-[11px] font-semibold tnum ${r.exposureUsd < 0 ? 'text-bull' : 'text-bear'}`}>
                    {fmtUsd(r.exposureUsd)}
                  </td>
                  {onOpen && (
                    <td className="px-3 py-2 w-8">
                      {clickable && (
                        <ArrowUpRight
                          aria-hidden="true"
                          className="w-3 h-3 text-textSecondary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                        />
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
};

export default SetupDrivers;
