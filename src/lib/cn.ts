import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/*
==================================================
  SLAYER TERMINAL - CLASS COMPOSITION (lib/cn.ts)

  `clsx` flattens conditionals; `tailwind-merge` resolves the collisions clsx
  leaves behind. Both were already in package.json and neither was imported
  anywhere — the terminal composed classes with 417 hand-written template
  literals instead, which is where two bugs live that this makes impossible.

  THE COLLISION BUG. A template literal concatenates; it does not resolve. So

      `px-2 ${wide ? 'px-4' : ''}`

  emits BOTH `px-2` and `px-4`, and which one wins is decided by their order in
  the generated stylesheet — not by the order they were written, and not by
  intent. It works until Tailwind reorders its output, and then a component
  changes size for no reason anyone can find in the diff. `twMerge` keeps the
  last one and drops the rest, which is what every author of that line meant.

  THE FALSY BUG. `${cond && 'x'}` renders the string "false" into the class list
  when `cond` is false. Harmless until a class is genuinely named `false`, and
  noisy in the DOM either way. `clsx` drops falsy values.

  Use it for any className that is not a single static string.
==================================================
*/
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
