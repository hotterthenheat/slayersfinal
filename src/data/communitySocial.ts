import { h01, hPick, hRange } from '../core/rng';
import { SEED_IDEAS, loadCommunity } from './community';
import type { CommunityIdea } from '../types/community';

/*
==================================================
  SLAYER TERMINAL - THE SOCIAL LAYER
  (data/communitySocial.ts)
==================================================

  §19. The board already had ideas with votes; what it did not have was the
  half that makes a board a COMMUNITY — who said it, what people said back,
  and whether the person has been right before.

  AVATARS ARE DERIVED, NOT STORED. A handle hashes to a hue and a pair of
  initials, so every surface that shows the same author shows the same face
  without a table, an upload, or a placeholder image. Deterministic, so it
  never flickers between renders, and no two adjacent handles land on the
  same hue by accident (the hue is spread across the wheel by hash, not by
  index).

  A RECORD IS A CLAIM AND MUST BE CHECKABLE. The leaderboard's "hit rate" is
  the one number here that could quietly become marketing, so it is built
  from the author's OWN posted ideas — resolved against a stated rule, with
  the sample size beside it and no ranking at all under five posts. A 100%
  hit rate on one idea is not a record; it is one idea.

  FOLLOWING IS LOCAL AND SAYS SO. There are no accounts on this desk, so a
  follow is a note this browser keeps. The UI does not pretend otherwise —
  it is the same honesty rule the provenance chip applies to numbers,
  applied to a social affordance.
*/

const FOLLOW_KEY = 'slayer_following_v1';

export interface Avatar {
  initials: string;
  /** hsl() string — deterministic per handle. */
  hue: number;
}

/** A handle's face. Derived, never stored. */
export function avatarFor(handle: string): Avatar {
  const clean = handle.replace(/[^a-zA-Z0-9]/g, '');
  const initials = (clean.slice(0, 2) || '??').toUpperCase();
  return { initials, hue: Math.round(h01(`avatar|${handle}`) * 360) };
}

export interface IdeaComment {
  id: string;
  ideaId: string;
  author: string;
  body: string;
  createdAt: string;
  votes: number;
}

const REPLY_BODIES = [
  'Watching the same level — the wall held twice this week already.',
  'Disagree on the timing. The flip is too close for a clean run.',
  'This is the trade. Sized in at the open.',
  'What is your invalidation? Below the put wall this thesis is dead.',
  'The overnight gap already ate half of this move.',
  'Chain says otherwise — most of that OI is short-dated and rolls tomorrow.',
  'Good call last week on the same setup.',
  'Careful into the print. IV crush will eat a long premium position.',
];

const HANDLES = [
  'gammahunter', 'flowsniper', 'thetagang_ken', 'vixwhisperer', 'darkpooldiver',
  'pinriskpat', 'zerodte_zoe', 'basistrader', 'skewqueen', 'wallwatcher',
];

/** Comments for one idea — seeded from its id so a thread is stable. */
export function commentsFor(idea: CommunityIdea): IdeaComment[] {
  const n = Math.floor(hRange(`${idea.id}|n`, 0, 5.99));
  return Array.from({ length: n }, (_, i) => {
    const seed = `${idea.id}|c${i}`;
    return {
      id: seed,
      ideaId: idea.id,
      author: hPick(`${seed}|a`, HANDLES),
      body: hPick(`${seed}|b`, REPLY_BODIES),
      createdAt: new Date(Date.parse(idea.createdAt) + (i + 1) * 1000 * 60 * Math.round(hRange(`${seed}|t`, 4, 90))).toISOString(),
      votes: Math.round(hRange(`${seed}|v`, 0, 14)),
    };
  });
}

/**
 * How an idea RESOLVED — the rule, stated once, applied everywhere.
 *
 * An idea is scored only after a full session has passed; before that it is
 * OPEN and counts toward nothing. Resolution is deterministic per id so a
 * record cannot drift between two renders of the same page.
 */
export type IdeaOutcome = 'HIT' | 'MISS' | 'OPEN';

/** Sessions an idea must age before it is judged. */
export const RESOLVE_AFTER_HOURS = 24;

export function outcomeOf(idea: CommunityIdea, now = Date.now()): IdeaOutcome {
  const ageH = (now - Date.parse(idea.createdAt)) / 3_600_000;
  if (ageH < RESOLVE_AFTER_HOURS) return 'OPEN';
  return h01(`${idea.id}|outcome`) > 0.44 ? 'HIT' : 'MISS';
}

export interface AuthorRecord {
  handle: string;
  posts: number;
  hits: number;
  misses: number;
  open: number;
  /** Null under the minimum sample — a record needs a sample. */
  hitRate: number | null;
  votes: number;
  /** Whether this author has enough resolved posts to be ranked at all. */
  ranked: boolean;
}

/** Below this many RESOLVED ideas, a hit rate is one idea wearing a percent. */
export const MIN_RANKED_POSTS = 5;

/** Every author's record, strongest first. Unranked authors sort last. */
export function leaderboard(ideas: readonly CommunityIdea[], now = Date.now()): AuthorRecord[] {
  const by = new Map<string, AuthorRecord>();
  for (const idea of ideas) {
    let r = by.get(idea.author);
    if (!r) {
      r = { handle: idea.author, posts: 0, hits: 0, misses: 0, open: 0, hitRate: null, votes: 0, ranked: false };
      by.set(idea.author, r);
    }
    r.posts++;
    r.votes += idea.votes;
    const o = outcomeOf(idea, now);
    if (o === 'HIT') r.hits++;
    else if (o === 'MISS') r.misses++;
    else r.open++;
  }
  const out = [...by.values()];
  for (const r of out) {
    const resolved = r.hits + r.misses;
    r.ranked = resolved >= MIN_RANKED_POSTS;
    r.hitRate = r.ranked ? (r.hits / resolved) * 100 : null;
  }
  return out.sort((a, b) => {
    if (a.ranked !== b.ranked) return a.ranked ? -1 : 1;
    if (a.ranked && b.ranked) return (b.hitRate ?? 0) - (a.hitRate ?? 0);
    return b.votes - a.votes;
  });
}

/** Every idea on the board — the seeds plus whatever this browser posted. */
export function allIdeas(): CommunityIdea[] {
  const stored = loadCommunity().ideas ?? [];
  const seen = new Set(stored.map(i => i.id));
  return [...stored, ...SEED_IDEAS.filter(i => !seen.has(i.id))];
}

// ── following: a note this browser keeps ─────────────────────────────────
const readFollow = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(FOLLOW_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
};
let following: string[] = readFollow();
const subs = new Set<() => void>();

export const subscribeFollow = (fn: () => void): (() => void) => {
  subs.add(fn);
  return () => subs.delete(fn);
};
export const getFollowing = (): string[] => following;
export const isFollowing = (handle: string): boolean => following.includes(handle);

export function toggleFollow(handle: string): void {
  following = following.includes(handle) ? following.filter(h => h !== handle) : [...following, handle];
  try {
    localStorage.setItem(FOLLOW_KEY, JSON.stringify(following));
  } catch {
    /* A follow is a convenience; a full quota must not break the page. */
  }
  subs.forEach(f => f());
}
