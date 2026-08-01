/*
==================================================
  SLAYER TERMINAL - COMMUNITY STORE (community.ts)
  Two kinds of content, kept apart on purpose:
  EXAMPLE_IDEAS and ROADMAP ship with the app, and
  CommunityState holds only what this browser wrote.
  Nothing here reaches a server; the shapes are the
  future API contract.
==================================================
*/

import type {
  CommunityIdea,
  FeatureRequest,
  FeedbackEntry,
} from '../types/community';

const STORAGE_KEY = 'slayer_community_v1';

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

// ---- shipped examples -------------------------------------------------------
/**
 * Four worked theses that ship with the terminal, shown as templates on the
 * Ideas board and quoted on the landing page (Landing.tsx renders the first
 * three). Their `author` and `votes` are demo fields the landing section leans
 * on; the terminal deliberately renders neither, because a handle and a tally
 * with no account system behind them are decoration, not data.
 *
 * The prices track the simulator's own reference book (SPY 500, QQQ 440, NVDA
 * 138.6 from data/universe.ts) so an example never contradicts the levels the
 * desk is showing next to it.
 */
export const SEED_IDEAS: CommunityIdea[] = [
  {
    id: 'seed-i1',
    author: 'gammahunter',
    ticker: 'SPY',
    direction: 'BULLISH',
    thesis: 'Holding above the flip with the 500 put wall directly below. Dips into 500 should get bought by dealers, so I am looking for a grind toward the 505 call wall.',
    votes: 24,
    createdAt: hoursAgo(3),
  },
  {
    id: 'seed-i2',
    author: 'thetadecay',
    ticker: 'NVDA',
    direction: 'BEARISH',
    thesis: 'Rejected the call wall twice this week and 0DTE flow flipped to put buying after lunch. Fading rips while it stays below 138.',
    votes: 18,
    createdAt: hoursAgo(6),
  },
  {
    id: 'seed-i3',
    author: 'pinrisk',
    ticker: 'QQQ',
    direction: 'BULLISH',
    thesis: 'Pin sitting right at 440 into Friday, so I expect price to get dragged back to it on any morning flush. Long the dip, exit at the pin.',
    votes: 11,
    createdAt: hoursAgo(9),
  },
  {
    id: 'seed-i4',
    author: 'wallwatcher',
    ticker: 'TSLA',
    direction: 'BEARISH',
    thesis: 'Dark pool prints stacking below spot and the biggest strike by volume is a put. Not fighting that combination.',
    votes: 7,
    createdAt: hoursAgo(26),
  },
];

/** Alias that says what these are on the desk. Same array; SEED_IDEAS keeps the
    name the landing page imports. */
export const EXAMPLE_IDEAS = SEED_IDEAS;

/**
 * The published roadmap. This is app-shipped content with real statuses, not
 * seeded user posts: `author` and `votes` survive for the API contract but the
 * board renders neither, since neither can be true without a backend.
 */
export const ROADMAP: FeatureRequest[] = [
  {
    id: 'seed-r3',
    author: 'slayer',
    title: 'Named workspaces',
    detail: 'Save more than one layout: one desk for the open, one for lunch chop, one for the close.',
    kind: 'IMPROVEMENT',
    status: 'BUILDING',
    votes: 28,
    createdAt: hoursAgo(48),
  },
  {
    id: 'seed-r1',
    author: 'slayer',
    title: 'Price alerts when a wall breaks',
    detail: 'Alert the moment spot trades through the call or put wall with force: the exact moment the map says momentum.',
    kind: 'FEATURE',
    status: 'PLANNED',
    votes: 42,
    createdAt: hoursAgo(72),
  },
  {
    id: 'seed-r4',
    author: 'slayer',
    title: 'Dark pool sector filters',
    detail: 'Filter the dark pool board by sector so you can watch just tech or just financials.',
    kind: 'FEATURE',
    status: 'PLANNED',
    votes: 19,
    createdAt: hoursAgo(90),
  },
  {
    id: 'seed-r2',
    author: 'slayer',
    title: 'Mobile companion app',
    detail: 'Read-only levels and alerts on the phone: the walls, the flip and your tracked setups, nothing else.',
    kind: 'PRODUCT',
    status: 'UNDER REVIEW',
    votes: 35,
    createdAt: hoursAgo(120),
  },
  {
    id: 'seed-r5',
    author: 'slayer',
    title: 'Multi-leg strategy builder',
    detail: 'Build spreads against the exposure map and see how the structure sits against the walls.',
    kind: 'PRODUCT',
    status: 'UNDER REVIEW',
    votes: 16,
    createdAt: hoursAgo(200),
  },
  {
    id: 'seed-r6',
    author: 'slayer',
    title: 'Custom workspace layouts',
    detail: 'Arrange your own panels instead of fixed pages. Shipped as the Pulse workspace.',
    kind: 'FEATURE',
    status: 'SHIPPED',
    votes: 51,
    createdAt: hoursAgo(400),
  },
];

/** Kept for the store's migration step: anything carrying one of these ids was
    written back into localStorage by an older build that copied the shipped
    content into the user's own array. */
const SHIPPED_ID_PREFIX = 'seed-';

export const isShippedId = (id: string): boolean => id.startsWith(SHIPPED_ID_PREFIX);

// ---- persistence ---------------------------------------------------------------
/** Only what this browser wrote. The shipped examples and roadmap above are
    rendered from the constants, never copied in here. */
export interface CommunityState {
  ideas: CommunityIdea[];
  requests: FeatureRequest[];
  feedback: FeedbackEntry[];
  /** Roadmap ids this browser has backed. */
  voted: string[];
}

export const EMPTY_COMMUNITY: CommunityState = { ideas: [], requests: [], feedback: [], voted: [] };

const mine = <T extends { id: string }>(list: unknown): T[] =>
  Array.isArray(list) ? (list as T[]).filter(x => x && typeof x.id === 'string' && !isShippedId(x.id)) : [];

export function loadCommunity(): CommunityState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_COMMUNITY;
    const parsed = JSON.parse(raw) as Partial<CommunityState>;
    return {
      // Older builds seeded state.ideas/requests with the shipped content and
      // wrote the whole array back on the first vote. Dropping those ids on read
      // is the migration: the shipped rows come from the constants now, so an
      // empty board can finally stay empty.
      ideas: mine<CommunityIdea>(parsed.ideas),
      requests: mine<FeatureRequest>(parsed.requests),
      feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [],
      voted: Array.isArray(parsed.voted) ? parsed.voted.filter(v => typeof v === 'string') : [],
    };
  } catch {
    return EMPTY_COMMUNITY;
  }
}

export function saveCommunity(state: CommunityState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode / quota: the desk keeps working, it just will not persist */
  }
}

/** "3h ago" style relative time. */
export function timeAgo(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * Everything this browser holds, as Markdown. The desk cannot send anything, so
 * the honest substitute for a submit button is a record you can paste into a
 * mail or a message yourself.
 */
export function communityMarkdown(state: CommunityState, unpack: (raw: string) => string): string {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const out: string[] = [`# Slayer Terminal desk record`, `Exported ${stamp} (local time)`, ''];

  out.push(`## Theses (${state.ideas.length})`);
  if (!state.ideas.length) out.push('_none_');
  for (const i of state.ideas) {
    out.push(`- **${i.ticker}** ${i.direction} - ${unpack(i.thesis)}`);
  }
  out.push('');

  out.push(`## Requests (${state.requests.length})`);
  if (!state.requests.length) out.push('_none_');
  for (const r of state.requests) {
    out.push(`- **${r.title}** (${r.kind})${r.detail ? ` - ${r.detail}` : ''}`);
  }
  out.push('');

  out.push(`## Notes (${state.feedback.length})`);
  if (!state.feedback.length) out.push('_none_');
  for (const f of state.feedback) {
    out.push(`- **${f.category}** - ${unpack(f.message)}`);
  }
  out.push('');

  const backed = ROADMAP.filter(r => state.voted.includes(r.id));
  out.push(`## Roadmap items backed (${backed.length})`);
  if (!backed.length) out.push('_none_');
  for (const r of backed) out.push(`- ${r.title} (${r.status})`);
  out.push('');

  return out.join('\n');
}
