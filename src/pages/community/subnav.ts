import { Lightbulb, Hammer, MessageSquare, type LucideIcon } from 'lucide-react';

/** Community subpage registry — drives the sub-tab bar and command palette.
    Subtitles describe what the tab holds and stop short of promising a reply:
    the section has no backend, and the copy is not allowed to imply one. */
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
    subtitle: 'Theses written against the book, with the levels they were called on',
    icon: Lightbulb,
  },
  {
    path: '/community/requests',
    label: 'Roadmap',
    subtitle: 'What is being built, what is planned, and what you want next',
    icon: Hammer,
  },
  {
    path: '/community/feedback',
    label: 'Feedback',
    subtitle: 'What slowed you down, captured with the route and build it happened on',
    icon: MessageSquare,
  },
];
