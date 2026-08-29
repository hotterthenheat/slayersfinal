import { avatarFor } from '../../data/communitySocial';

/*
  A handle's face — derived from the handle, never stored.

  Deterministic, so the same author shows the same face on every surface
  without a table or an upload, and the hue is spread by hash rather than by
  index so two adjacent handles do not land on the same colour.
*/
const SIZES = { sm: 'w-6 h-6 text-[9px]', md: 'w-8 h-8 text-[11px]', lg: 'w-12 h-12 text-[15px]' } as const;

const Avatar = ({ handle, size = 'md' }: { handle: string; size?: keyof typeof SIZES }) => {
  const { initials, hue } = avatarFor(handle);
  return (
    <span
      aria-hidden
      className={`${SIZES[size]} shrink-0 rounded-full inline-flex items-center justify-center font-mono font-semibold tracking-tight`}
      style={{
        background: `hsl(${hue} 45% 22%)`,
        color: `hsl(${hue} 70% 78%)`,
        boxShadow: `inset 0 0 0 1px hsl(${hue} 45% 34%)`,
      }}
    >
      {initials}
    </span>
  );
};

export default Avatar;
