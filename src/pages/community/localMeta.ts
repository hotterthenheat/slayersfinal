/*
==================================================
  COMMUNITY - LOCAL META HELPERS (localMeta.ts)
  The community store shapes (CommunityIdea.thesis,
  FeedbackEntry.message) are single free-text fields.
  These helpers let the community pages attach a small
  bundle of structured fields to that text WITHOUT
  changing the store contract: the structured record
  is serialized behind a rare sentinel and split back
  out for display. Plain prose (the seed content) has
  no sentinel and round-trips untouched.
==================================================
*/

/** Rare marker — U+241E record-separator glyphs bracket the tag. */
const META_SENTINEL = '␞SLAYER_META␞';

/** Attach a structured record to a block of text. Empty values are dropped;
 *  when nothing remains the text is returned verbatim (no sentinel added). */
export function packMeta(text: string, meta: Record<string, string>): string {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(meta)) {
    const t = (v ?? '').trim();
    if (t) clean[k] = t;
  }
  if (Object.keys(clean).length === 0) return text;
  return `${text}${META_SENTINEL}${JSON.stringify(clean)}`;
}

/** Split text back into its narrative and structured record. */
export function unpackMeta(raw: string): { text: string; meta: Record<string, string> } {
  const idx = raw.indexOf(META_SENTINEL);
  if (idx < 0) return { text: raw, meta: {} };
  const text = raw.slice(0, idx);
  try {
    const parsed = JSON.parse(raw.slice(idx + META_SENTINEL.length));
    if (parsed && typeof parsed === 'object') {
      const meta: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'string') meta[k] = v;
      }
      return { text, meta };
    }
  } catch {
    /* fall through to prose-only */
  }
  return { text, meta: {} };
}

/** Best-effort short browser name from a user-agent string. */
export function shortBrowser(ua: string): string {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Browser';
}
