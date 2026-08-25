import { Lightbulb, Hammer, MessageSquare, type LucideIcon } from 'lucide-react';

/** Community subpage registry — drives the sub-tab bar and command palette. */
export interface CommunitySubpage {
  path: string;
  label: string;
  subtitle: string;
  icon: LucideIcon;
}

export const COMMUNITY_SUBPAGES: CommunitySubpage[] = [
  {
    path: '/community/ideas',
    label: 'Ideas',
    subtitle: 'Post a thesis and keep it — the room opens when accounts land',
    icon: Lightbulb,
  },
  {
    path: '/community/requests',
    label: 'Requests',
    subtitle: 'Tell us what to build next — kept on this browser for now',
    icon: Hammer,
  },
  {
    path: '/community/feedback',
    label: 'Feedback',
    subtitle: 'What should we improve? Notes stay on this browser until accounts land',
    icon: MessageSquare,
  },
];
