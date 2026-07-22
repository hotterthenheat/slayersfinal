import { BookOpen, LayoutGrid, GraduationCap, HelpCircle, Keyboard, type LucideIcon } from 'lucide-react';

/** Guide subpage registry — drives the sub-tab bar. */
export interface GuideSubpage {
  path: string;
  label: string;
  subtitle: string;
  icon: LucideIcon;
}

export const GUIDE_SUBPAGES: GuideSubpage[] = [
  {
    path: '/guide/overview',
    label: 'Getting started',
    subtitle: 'What Slayer is, the flow, and your first five minutes',
    icon: BookOpen,
  },
  {
    path: '/guide/desks',
    label: 'The desks',
    subtitle: 'How to read each desk — controls, signals and a worked read',
    icon: LayoutGrid,
  },
  {
    path: '/guide/concepts',
    label: 'Concepts',
    subtitle: 'The vocabulary behind the reads — dealer flow, vol and quant',
    icon: GraduationCap,
  },
  {
    path: '/guide/faq',
    label: 'FAQ',
    subtitle: 'Common questions about the data, accounts and using the terminal',
    icon: HelpCircle,
  },
  {
    path: '/guide/shortcuts',
    label: 'Shortcuts',
    subtitle: 'Keyboard-first — move without touching the mouse',
    icon: Keyboard,
  },
];
