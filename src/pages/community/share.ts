/*
==================================================
  COMMUNITY - GETTING IT OUT OF THE BROWSER (share.ts)
  Nothing on this desk is transmitted anywhere. A
  "submit" button would be a lie, so the section
  ships the two mechanisms that are true instead:
  copy to the clipboard, or save the record as a
  file you can attach.
==================================================
*/

/** Support address, the same one the footer and the FAQ publish. */
export const CONTACT = 'info@slayerterminal.com';

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Revoking on the next frame rather than immediately: Safari cancels the
  // download if the object URL dies inside the same task as the click.
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

/** mailto: with the note already in the body, subject-tagged so it files. */
export function mailtoLink(subject: string, body: string): string {
  return `mailto:${CONTACT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
