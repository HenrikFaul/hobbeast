/**
 * A post handed over by the browser extension.
 *
 * The extension reads a Facebook page the operator already has open and opens
 * `/admin?tab=post-import#import=<base64url>` here, rather than writing to the
 * database itself. The operator is already signed in on this site — with
 * Google, in most cases — so the extension needs no account, no key and no
 * second login of its own.
 *
 * The payload travels in the URL FRAGMENT, which browsers never send to the
 * server, so the post text stays out of request logs.
 *
 * It is captured at application start rather than by the panel that consumes
 * it, because an operator whose session has lapsed is bounced to /auth first —
 * and that redirect drops the fragment. Capturing early means the hand-off
 * survives the detour through the login page, Google included.
 */

const STORAGE_KEY = 'hobbeast.postImportHandoff';

export interface PostImportHandoff {
  text: string;
  url: string;
  /** The post's own cover picture, so the entry is not a blank card. */
  imageUrl: string | null;
  /** Who put it on, when the page said so outright. */
  organizer: string | null;
  /** The page that published it, remembered for a future visit. */
  publisher: string | null;
  publisherUrl: string | null;
}

function decode(encoded: string): PostImportHandoff | null {
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    const text = typeof parsed?.text === 'string' ? parsed.text : '';
    if (!text.trim()) return null;
    const str = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
    // Only https pictures: anything else renders as a broken image, which
    // looks worse on a card than no picture at all.
    const image = str(parsed?.imageUrl);
    return {
      text,
      url: typeof parsed?.url === 'string' ? parsed.url : '',
      imageUrl: image && /^https:\/\//i.test(image) ? image : null,
      organizer: str(parsed?.organizer),
      publisher: str(parsed?.publisher),
      publisherUrl: str(parsed?.publisherUrl),
    };
  } catch {
    return null;
  }
}

/**
 * Called once at start-up, before routing can redirect anywhere. Moves the
 * payload out of the address bar and into session storage — so a refresh does
 * not silently re-import something already filed.
 */
export function capturePostImportHandoff(): void {
  if (typeof window === 'undefined') return;
  const match = window.location.hash.match(/[#&]import=([^&]+)/);
  if (!match) return;

  const handoff = decode(match[1]);
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  if (!handoff) return;

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(handoff));
  } catch {
    // A browser with storage disabled simply loses the hand-off; the operator
    // can still paste the text by hand, which is what the panel is for.
  }
}

/** Reads and consumes the captured hand-off, if there is one. */
export function takePostImportHandoff(): PostImportHandoff | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    window.sessionStorage.removeItem(STORAGE_KEY);
    const parsed = JSON.parse(stored);
    return typeof parsed?.text === 'string' && parsed.text.trim() ? parsed : null;
  } catch {
    return null;
  }
}
