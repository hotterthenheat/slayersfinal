/*
==================================================
  SLAYER TERMINAL - MODERATION (data/moderation.ts)
  Part 12 · the report affordance.
==================================================

  A REPORT IS A CLAIM, NOT A VERDICT, and almost every bad version of this
  button comes from forgetting that. If pressing report removed a post for
  everyone, one determined reader could empty the board; if it removed the
  post for nobody, the button is a placebo and the reader presses it twice,
  then stops believing the page.

  So report does TWO SEPARATE THINGS, and the surface says both out loud:

    IT HIDES THE POST FOR THE READER WHO PRESSED IT. Immediately, locally,
    reversibly. This is the half that can actually be delivered today, and
    it is the half the reader wanted in the moment — "get this away from
    me" is the real request behind most reports.

    IT QUEUES THE CLAIM. Nothing else happens to it yet, because there is
    no moderator on this build to action it. The queue is real state with
    the right shape, so when accounts and a review desk land the POST body
    is already what a reviewer needs; but the copy never implies a human
    has seen it.

  Collapsing those two would mean either lying about the second or failing
  to deliver the first.

  WHY A CLOSED TAXONOMY AND A NOTE. A reason list on its own loses the
  specifics that make a claim checkable; a free-text box on its own gives a
  reviewer nothing to sort a queue by. Both, with one asymmetry that is the
  point of the rule below: `other` REQUIRES the note. A report filed as
  "other" with nothing written is unactionable by construction — it names
  no category and describes no problem — and accepting it fills the queue
  with entries no reviewer can triage.

  WHY THE EXCERPT IS COPIED. The report stores the text as it stood when
  the claim was made. A report that only carries an id is worthless the
  moment the author edits or deletes the post, which is exactly what an
  author does after being reported.

  YOUR OWN POSTS ARE NOT REPORTED, THEY ARE DELETED. Reporting yourself to
  a queue you can see is theatre. Locally-authored posts exist only in this
  browser, so removing one is a true deletion and is offered as that word.
*/

/** Where a claim can be filed against. */
export type ReportTarget = 'idea' | 'request';

export type ReportReason = 'spam' | 'abuse' | 'advice' | 'false' | 'offtopic' | 'other';

export interface ReportReasonSpec {
  /** The word in the menu. */
  label: string;
  /** What this reason actually covers, so two readers pick the same one. */
  note: string;
  /** True when a note is required for the report to be actionable. */
  needsDetail: boolean;
}

/*
  SIX REASONS, ORDERED BY HOW OFTEN THEY ARE THE RIGHT ONE ON A BOARD ABOUT
  TRADES. `advice` sits third rather than last because it is the category
  this product specifically has to police: the terminal never tells anyone
  to enter anything, and a post in the community that does is the one kind
  of content that can misrepresent the whole page.
*/
export const REPORT_REASONS: Record<ReportReason, ReportReasonSpec> = {
  spam: {
    label: 'Spam or promotion',
    note: 'Selling something, a referral link, or the same post over and over.',
    needsDetail: false,
  },
  abuse: {
    label: 'Abuse or harassment',
    note: 'Aimed at a person rather than at a trade.',
    needsDetail: false,
  },
  advice: {
    label: 'Presented as advice',
    note: 'Told other people what to buy or sell, or promised a result. Ideas are theses, not instructions.',
    needsDetail: false,
  },
  false: {
    label: 'Factually wrong',
    note: 'A claim about the market or about this terminal that is not true — not a read you disagree with.',
    needsDetail: true,
  },
  offtopic: {
    label: 'Off topic',
    note: 'Nothing to do with a trade, a level, or this terminal. A narrow board is what makes it worth reading.',
    needsDetail: false,
  },
  other: {
    label: 'Something else',
    note: 'Describe it — a report with no category and no description cannot be reviewed.',
    needsDetail: true,
  },
};

/** Menu order. Declared once so the menu and the proof cannot drift apart. */
export const REPORT_REASON_ORDER: ReportReason[] = ['spam', 'abuse', 'advice', 'false', 'offtopic', 'other'];

export interface Report {
  id: string;
  /** What was reported. */
  targetId: string;
  targetKind: ReportTarget;
  reason: ReportReason;
  /** The reporter's words. Empty is allowed except where `needsDetail`. */
  detail: string;
  /** The content as it stood when the claim was made — see the header. */
  excerpt: string;
  /** ISO timestamp. */
  at: string;
}

/*
  `false` and `other` both demand a description, for the same reason from
  two directions: one is a claim ABOUT A FACT, which is unreviewable
  without knowing which fact; the other names no category at all. Every
  other reason is self-describing, and demanding an essay for "this is
  spam" is how a report button goes unused.
*/
export function reportIsActionable(reason: ReportReason, detail: string): boolean {
  if (!REPORT_REASONS[reason].needsDetail) return true;
  return detail.trim().length >= 4;
}

/** Why the submit button is refusing, in the reader's words. Null when it isn't. */
export function reportBlockedBecause(reason: ReportReason, detail: string): string | null {
  if (reportIsActionable(reason, detail)) return null;
  return reason === 'other'
    ? 'Say what the problem is — "something else" with nothing after it cannot be reviewed.'
    : 'Say which claim is wrong — a reviewer has to be able to check it.';
}

/** Trim a body down to something a queue can show without unfolding. */
export const EXCERPT_MAX = 180;
export function excerptOf(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= EXCERPT_MAX ? flat : `${flat.slice(0, EXCERPT_MAX - 1)}…`;
}

/**
 * File a claim.
 *
 * IDEMPOTENT PER TARGET. A reader who presses report twice on the same post
 * — which they will, because the first press hides it and the second comes
 * from a different session — has one complaint, not two. The later reason
 * replaces the earlier one rather than stacking, because it is the same
 * person describing the same post and their latest description is the one
 * they meant.
 */
export function fileReport(reports: Report[], next: Omit<Report, 'id' | 'at'>): Report[] {
  const rest = reports.filter(r => !(r.targetId === next.targetId && r.targetKind === next.targetKind));
  return [
    ...rest,
    { ...next, id: `rep-${next.targetKind}-${next.targetId}`, at: new Date().toISOString() },
  ];
}

/** Undo a claim — the post comes back into the reader's feed. */
export function withdrawReport(reports: Report[], targetId: string, targetKind: ReportTarget): Report[] {
  return reports.filter(r => !(r.targetId === targetId && r.targetKind === targetKind));
}

/** The ids this reader has hidden, for a kind. */
export function hiddenIds(reports: Report[], kind: ReportTarget): Set<string> {
  const out = new Set<string>();
  for (const r of reports) if (r.targetKind === kind) out.add(r.targetId);
  return out;
}

/*
  ONLY LOCALLY-AUTHORED CONTENT IS DELETABLE, and the test is the id prefix
  rather than the author name. `author === 'you'` is a display string a
  future feed could hand back for anyone; the `you-` prefix is stamped by
  the composers in this build and is the only thing that actually proves a
  row has never left this browser. Deleting anything else would be a hide
  wearing the word "delete".
*/
export const LOCAL_ID_PREFIX = 'you-';
export function isLocallyAuthored(id: string): boolean {
  return id.startsWith(LOCAL_ID_PREFIX);
}
