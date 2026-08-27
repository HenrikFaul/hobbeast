import { describe, expect, it } from 'vitest';
import {
  absoluteUrl,
  shareHref,
  shareMessage,
  supportsMessenger,
  type ShareSubject,
} from '@/features/sharing/shareTargets';

/**
 * A share button that opens a broken page is worse than no button, so the
 * rules for each network are pinned here rather than trusted to a component.
 */

const SUBJECT: ShareSubject = {
  url: 'https://expericentre.com/events/abc-123',
  title: 'Vasárnapi futóklub a Városligetben',
  when: '2026. március 15., vasárnap, 08:00',
  where: 'Budapest',
};

describe('share message', () => {
  it('says when and where, not just the name', () => {
    expect(shareMessage(SUBJECT))
      .toBe('Vasárnapi futóklub a Városligetben — 2026. március 15., vasárnap, 08:00 · Budapest');
  });

  it('falls back to the bare title when nothing else is known', () => {
    expect(shareMessage({ url: 'https://x.hu', title: 'Program' })).toBe('Program');
  });
});

describe('network addresses', () => {
  it('sends Facebook only the address, since it reads the page itself', () => {
    // Facebook discards any text a site supplies and builds the preview from
    // the page's own OpenGraph tags, so passing a message would be a lie.
    expect(shareHref('facebook', SUBJECT))
      .toBe('https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fexpericentre.com%2Fevents%2Fabc-123');
  });

  it('puts the link last for WhatsApp, which previews only a trailing address', () => {
    const href = shareHref('whatsapp', SUBJECT);
    expect(href.startsWith('https://wa.me/?text=')).toBe(true);
    const text = decodeURIComponent(href.slice('https://wa.me/?text='.length));
    expect(text.endsWith(SUBJECT.url)).toBe(true);
    expect(text).toContain('Vasárnapi futóklub');
  });

  it('uses the Messenger deep link, which needs no app registration', () => {
    expect(shareHref('messenger', SUBJECT))
      .toBe('fb-messenger://share/?link=https%3A%2F%2Fexpericentre.com%2Fevents%2Fabc-123');
  });

  it('escapes an address with a query string', () => {
    const tricky = { ...SUBJECT, url: 'https://expericentre.com/events?id=1&ref=a b' };
    expect(shareHref('facebook', tricky)).not.toContain(' ');
    expect(shareHref('facebook', tricky)).toContain('%26ref%3Da%20b');
  });
});

describe('where Messenger is offered', () => {
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Mobile Safari/537.36';
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148';
  const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0';

  it('is offered on phones, where the deep link works', () => {
    expect(supportsMessenger(ANDROID, true)).toBe(true);
    expect(supportsMessenger(IPHONE, true)).toBe(true);
  });

  /**
   * On a desktop the deep link does nothing and the web dialog needs a
   * registered Facebook app id we do not have — so the button is not shown at
   * all rather than shown and broken.
   */
  it('is not offered on a desktop, where it would silently fail', () => {
    expect(supportsMessenger(DESKTOP, false)).toBe(false);
    // A touchscreen laptop is still a desktop browser.
    expect(supportsMessenger(DESKTOP, true)).toBe(false);
  });
});

describe('absolute addresses', () => {
  it('leaves an address that is already absolute alone', () => {
    expect(absoluteUrl('https://other.hu/x', 'https://expericentre.com')).toBe('https://other.hu/x');
  });

  it('makes a path absolute, because a network cannot resolve one', () => {
    expect(absoluteUrl('/events/12', 'https://expericentre.com')).toBe('https://expericentre.com/events/12');
    expect(absoluteUrl('events/12', 'https://expericentre.com/')).toBe('https://expericentre.com/events/12');
  });
});
