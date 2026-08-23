import { useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DeskBarContext } from './deskBar';

/**
 * Render controls onto the desk strip from anywhere below it.
 *
 * Falls back to rendering in place when there is no strip — a desk mounted
 * outside a section layout (a workspace tile, a test) still gets its controls
 * rather than losing them to a portal that has nowhere to go.
 *
 * The context, the provider and the strip's hook live in ./deskBar.ts; this
 * file exports one component so fast refresh can do its job.
 */
const DeskBarSlot = ({ children }: { children: ReactNode }) => {
  const el = useContext(DeskBarContext);
  if (!el) return <>{children}</>;
  return createPortal(children, el);
};

export default DeskBarSlot;
