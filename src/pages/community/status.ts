import type { Tone } from '../../components/ui/tones';
import type { RequestStatus } from '../../types/community';

/*
==================================================
  SLAYER TERMINAL - ROADMAP STATUS (community/status.ts)
  One tone per roadmap status, shared by every surface that names one.

  It lived inside Requests.tsx, so the Roadmap tab drew BUILDING in amber and
  the Feedback tab's tally of the same four statuses drew all four in grey — two
  panels describing one thing in two languages, which is the failure this
  codebase treats as the sharpest kind.

  Status is a PROCESS, not a direction: chrome tones only, never bull/bear.
==================================================
*/

export const STATUS_TONE: Record<RequestStatus, Tone> = {
  'UNDER REVIEW': 'neutral',
  PLANNED: 'info',
  BUILDING: 'warn',
  SHIPPED: 'select',
};

/** Left-edge rail per status — the fastest read of where an item sits. */
export const STATUS_RAIL: Record<RequestStatus, string> = {
  'UNDER REVIEW': 'border-l-textMuted/50',
  PLANNED: 'border-l-flip/60',
  BUILDING: 'border-l-warn/70',
  SHIPPED: 'border-l-select/70',
};

export const STATUS_BLURB: Record<RequestStatus, string> = {
  BUILDING: 'In progress right now',
  PLANNED: 'On the roadmap, not started',
  'UNDER REVIEW': 'Being weighed, alongside anything you add',
  SHIPPED: 'Already in the terminal',
};

export const STATUS_ORDER: RequestStatus[] = ['BUILDING', 'PLANNED', 'UNDER REVIEW', 'SHIPPED'];
