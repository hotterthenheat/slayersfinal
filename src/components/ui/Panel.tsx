import React from 'react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Maximize2, Minimize2 } from 'lucide-react';
import type { Tone } from './tones';

interface PanelProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Remove body padding (dense tables bleed to the edges) */
  flush?: boolean;
  /** Tint the surface with a directional/status accent */
  tone?: Tone;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;

  /*
    §20 — COLLAPSE AND POP OUT, as capabilities of the panel rather than
    per-page furniture.

    A desk of eight panels on a laptop is a scroll; collapsing the three a
    reader is not using right now is how the other five fit. And a panel
    worth staring at — a chart, a dense table — wants the whole screen for a
    moment without navigating away and losing every other panel's state.

    Both are OPT-IN. A panel that is one stat card does not need a collapse
    control, and giving every panel a header full of chrome would cost more
    than the two that need it gain. `collapsible` and `poppable` are the
    caller saying this one is worth it.
  */
  /** Adds a chevron that folds the body away. Remembered per `id`. */
  collapsible?: boolean;
  /** Adds a control that lifts the panel to full screen. */
  poppable?: boolean;
  /** Stable key for remembering the collapsed state. Required by `collapsible`. */
  id?: string;
  /** Start folded — for panels that are reference rather than the point. */
  defaultCollapsed?: boolean;
}

// Full class strings kept static so Tailwind JIT picks them up
const toneSurface: Record<Tone, string> = {
  bull: 'border-bull/30 bg-bull/[0.04]',
  bear: 'border-bear/30 bg-bear/[0.04]',
  warn: 'border-warn/30 bg-warn/[0.04]',
  select: 'border-select/30 bg-select/[0.04]',
  supreme: 'border-supreme/30 bg-supreme/[0.04]',
  /* `crown` is a BLACK BOX with coloured words at chip scale — as a whole
     panel it would be a filled card, which is the thing the grammar rules
     out, so it takes the neutral surface. `white` is bright ink, not a
     tint. */
  crown: 'border-supreme/30 bg-panel',
  white: 'border-borderSubtle bg-panel',
  // A whole panel never wears the foil — holo is chip-scale hardware. Falls
  // back to the neutral surface so `tone="holo"` on a Panel can't tint it.
  holo: 'border-borderSubtle bg-panel',
  neutral: 'border-borderSubtle bg-panel',
};

const toneDivider: Record<Tone, string> = {
  bull: 'border-bull/20',
  bear: 'border-bear/20',
  warn: 'border-warn/20',
  select: 'border-select/20',
  supreme: 'border-supreme/20',
  crown: 'border-supreme/20',
  white: 'border-borderSubtle',
  holo: 'border-borderSubtle',
  neutral: 'border-borderSubtle',
};

/** The base dark surface every widget sits in. */
const COLLAPSE_KEY = 'slayer_panel_collapsed_v1';

const readCollapsed = (): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
};

const Panel = ({
  title,
  subtitle,
  actions,
  flush = false,
  tone = 'neutral',
  className = '',
  bodyClassName = '',
  children,
  collapsible = false,
  poppable = false,
  id,
  defaultCollapsed = false,
}: PanelProps) => {
  const [collapsed, setCollapsed] = useState(() =>
    collapsible && id ? (readCollapsed()[id] ?? defaultCollapsed) : false
  );
  const [popped, setPopped] = useState(false);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (id) {
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify({ ...readCollapsed(), [id]: next }));
      } catch {
        /* A remembered fold is a convenience, never a reason to fail. */
      }
    }
  };

  /* Escape leaves the popped-out view — a full-screen panel with no key out
     is the same trap as a modal without one. */
  useEffect(() => {
    if (!popped) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPopped(false); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [popped]);

  const body = (
    <section className={`border ${toneSurface[tone]} rounded-lg flex flex-col min-w-0 ${popped ? 'w-full h-full' : className}`}>
      {(title || actions) && (
        <header className={`flex items-center justify-between gap-3 px-4 h-10 border-b ${toneDivider[tone]} shrink-0`}>
          {/*
            THE TITLE DOES NOT SHRINK; THE SUBTITLE ABSORBS ALL OF IT.

            Both of these carried `truncate` inside one flex row, so the
            browser split the shortfall between them and the panel's NAME got
            cut alongside its description. Measured on /pinpoint/exposure-
            profile at 1440, where two panels share a column: "MAP STABILI…"
            and "SPOT SC…" — a reader could not tell what either panel was.
            The subtitle beside them still had most of its sentence.

            A panel's name is the one thing on that row that must survive,
            because it is what the reader is looking for; the subtitle is a
            gloss and reads fine clipped. `shrink-0` on the title says so,
            and `min-w-0` on the subtitle lets it take the whole shortfall.
            110 panels across 46 files pass a subtitle, so this is one line
            for every crowded header on the desk.
          */}
          <div className="flex items-baseline gap-2 min-w-0">
            {title && (
              <h3 className="shrink-0 font-mono text-[11px] font-semibold uppercase tracking-widest text-textPrimary">
                {title}
              </h3>
            )}
            {subtitle && (
              <span className="min-w-0 font-mono text-[10px] text-textSecondary uppercase tracking-wider truncate">{subtitle}</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {actions}
            {poppable && (
              <button
                onClick={() => setPopped(v => !v)}
                aria-label={popped ? `Close ${typeof title === 'string' ? title : 'panel'}` : `Expand ${typeof title === 'string' ? title : 'panel'}`}
                aria-pressed={popped}
                className="p-1 -m-1 rounded text-textMuted hover:text-textPrimary hover:bg-white/[0.05] transition-colors"
              >
                {popped ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            )}
            {collapsible && !popped && (
              <button
                onClick={toggleCollapsed}
                aria-label={collapsed ? `Expand ${typeof title === 'string' ? title : 'panel'}` : `Collapse ${typeof title === 'string' ? title : 'panel'}`}
                aria-expanded={!collapsed}
                className="p-1 -m-1 rounded text-textMuted hover:text-textPrimary hover:bg-white/[0.05] transition-colors"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
              </button>
            )}
          </div>
        </header>
      )}
      {/* A collapsed panel keeps its header — that is the affordance to open
          it again — and drops only its body. */}
      {!collapsed && (
        <div className={`${flush ? '' : 'p-4'} flex-grow min-h-0 ${bodyClassName}`}>{children}</div>
      )}
    </section>
  );

  if (!popped) return body;

  /* Popped out: the same panel, over everything, with the desk still behind
     it — so a reader knows they have not navigated away. */
  return createPortal(
    <div className="fixed inset-0 z-[80] p-4 flex bg-black/70 backdrop-blur-[2px]">
      {body}
    </div>,
    document.body
  );
};

export default Panel;
