/**
 * Where a programme can be shared, and the address that actually works.
 *
 * Each network wants its link built differently, and two of them only work on
 * some devices. Getting that wrong shows the reader a button that opens a
 * broken page — worse than not offering it — so the rules live here, in one
 * tested place, rather than inline in a component.
 */

export type ShareTargetId = 'facebook' | 'messenger' | 'whatsapp' | 'copy';

export interface ShareSubject {
  /** The page being shared. Must be absolute: a network cannot resolve "/events/12". */
  url: string;
  title: string;
  /** When the programme happens, so the message says something useful. */
  when?: string | null;
  where?: string | null;
}

/**
 * The message that travels with the link.
 *
 * Facebook ignores any text a site supplies and reads the page's own OpenGraph
 * tags, so this is only used where it is actually honoured: WhatsApp, and the
 * operating system's own share sheet.
 */
export function shareMessage(subject: ShareSubject): string {
  const detail = [subject.when, subject.where].filter(Boolean).join(' · ');
  return detail ? `${subject.title} — ${detail}` : subject.title;
}

/**
 * Messenger has no working web share dialog without a registered Facebook app
 * id, but its mobile deep link needs nothing at all. Rather than ship a button
 * that fails on the desktop, it is offered only where it works.
 */
export function supportsMessenger(userAgent: string, hasTouch: boolean): boolean {
  if (/\b(Android|iPhone|iPad|iPod)\b/i.test(userAgent)) return true;
  // A touch-only Windows tablet running the app is the rare honest edge case.
  return hasTouch && /\bMobile\b/i.test(userAgent);
}

export function shareHref(target: Exclude<ShareTargetId, 'copy'>, subject: ShareSubject): string {
  const url = encodeURIComponent(subject.url);
  switch (target) {
    case 'facebook':
      // Facebook builds the preview from the page's own OpenGraph tags; any
      // text passed here is discarded, so only the address is sent.
      return `https://www.facebook.com/sharer/sharer.php?u=${url}`;
    case 'messenger':
      return `fb-messenger://share/?link=${url}`;
    case 'whatsapp':
      // wa.me works in the app and on web.whatsapp.com, so one address serves
      // both. The link goes last: WhatsApp only previews a trailing address.
      return `https://wa.me/?text=${encodeURIComponent(`${shareMessage(subject)}\n${subject.url}`)}`;
  }
}

/** The absolute address of a page, for a network that cannot resolve a path. */
export function absoluteUrl(path: string, origin: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${origin.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
