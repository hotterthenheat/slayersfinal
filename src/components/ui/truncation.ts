import { isValidElement, type ReactNode } from 'react';

/**
 * Native title for a line that truncates.
 *
 * The metric primitives clip label, value and sub-line, so a narrow cell can
 * swallow text with no way to read the rest. Where the content has readable text
 * it doubles as the `title`, which costs no layout and makes the clip
 * recoverable.
 *
 * WHY THIS WALKS THE TREE. It used to be `typeof v === 'string' ? v : undefined`,
 * on the reasoning that stringifying an element would print `[object Object]`
 * into a tooltip. True, and it meant the panels that most needed the tooltip
 * never got one: a title like `<span><Icon /> Gamma Heatmap <Chip/></span>` is
 * an element, so it returned undefined, and a header clipped to "GEX HEA…" had
 * no way to be read at all. Measured on Pulse at 1180, where four panel titles
 * ellipsise and not one carried a `title` attribute.
 *
 * Walking for the string and number leaves gets the readable text out of the
 * node without ever stringifying an element. Elements with no text still return
 * undefined, which is the original behaviour for the case it was actually
 * protecting against.
 */
export const titleOf = (v: ReactNode): string | undefined => {
  const parts: string[] = [];
  const walk = (node: ReactNode): void => {
    if (node == null || typeof node === 'boolean') return;
    if (typeof node === 'string' || typeof node === 'number') {
      parts.push(String(node));
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    // Only children are read. Props other than `children` are not content, and
    // a component's rendered output is not knowable from here.
    if (isValidElement(node)) walk((node.props as { children?: ReactNode }).children);
  };
  walk(v);
  const text = parts.join(' ').replace(/\s+/g, ' ').trim();
  return text || undefined;
};
