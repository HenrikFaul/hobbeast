import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseRobots, allowsPath } from '../src/fetch.mjs';

/**
 * The worker used to match Disallow lines as literal prefixes, which silently
 * ignored every wildcard pattern. Three of the sources that went live in
 * v1.56.0 publish exactly such patterns, so the worker was free to crawl the
 * URLs those sites had asked it to leave alone. The fixtures below are the real
 * robots.txt bodies, fetched 2026-09-05.
 */

const allows = (text, path) => allowsPath(parseRobots(text).rules, path);

describe('robots wildcard patterns', () => {
  // konzerthaus.at — the reason a "/*?" rule has to be understood.
  const konzerthaus = `User-agent: *

Disallow: /admin/
Disallow: /*/api/
Allow: /*.xml?p=
Disallow: /*?

Sitemap: https://konzerthaus.at/sitemap.xml`;

  it('blocks any query-string URL behind Disallow: /*?', () => {
    assert.equal(allows(konzerthaus, '/de/konzert/123?tab=1'), false);
    assert.equal(allows(konzerthaus, '/de/programm-und-karten?page=2'), false);
  });

  it('still allows the plain listing path', () => {
    assert.equal(allows(konzerthaus, '/de/programm-und-karten'), true);
  });

  it('honours a wildcard in the middle of a pattern', () => {
    assert.equal(allows(konzerthaus, '/de/api/events'), false);
    assert.equal(allows(konzerthaus, '/admin/'), false);
  });

  it('blocks the profile tree goout.net excludes', () => {
    const goout = `User-agent: *
Allow: /i/
Disallow: /i/user/

User-agent: *
Disallow: /*/profile/`;
    assert.equal(allows(goout, '/cs/praha/profile/someone'), false);
    assert.equal(allows(goout, '/cs/praha/akce/'), true);
    // A second "User-agent: *" group still applies to us.
    assert.equal(allows(goout, '/i/user/x'), false);
  });

  it('blocks a trailing-wildcard tree', () => {
    const kinodvor = `User-agent: *
Disallow: /wp-admin/
Disallow: /potrditve/*
Allow: /wp-admin/admin-ajax.php`;
    assert.equal(allows(kinodvor, '/potrditve/abc'), false);
    assert.equal(allows(kinodvor, '/film/gajin-svet-3/'), true);
  });
});

describe('Allow/Disallow precedence', () => {
  it('lets a longer Allow carve an exception out of a Disallow', () => {
    const text = `User-agent: *
Disallow: /wp-admin/
Allow: /wp-admin/admin-ajax.php`;
    assert.equal(allows(text, '/wp-admin/settings'), false);
    assert.equal(allows(text, '/wp-admin/admin-ajax.php'), true);
  });

  it('prefers Allow when the two match at equal length', () => {
    const text = `User-agent: *
Disallow: /x
Allow: /x`;
    assert.equal(allows(text, '/x'), true);
  });

  it('honours a $ anchor as end-of-path', () => {
    const text = `User-agent: *
Disallow: /report$`;
    assert.equal(allows(text, '/report'), false);
    assert.equal(allows(text, '/reports/annual'), true);
  });
});

describe('group selection', () => {
  it('ignores rules written for other user agents', () => {
    // forumkarlin.cz bans ClaudeBot by name while allowing everyone else.
    const text = `User-agent: *
Allow: /

User-agent: ClaudeBot
Disallow: /`;
    assert.equal(allows(text, '/udalost/koncert'), true);
  });

  it('treats an empty Disallow as no restriction at all', () => {
    const text = `User-agent: *
Disallow:
Crawl-delay: 2`;
    assert.equal(allows(text, '/kalender/event/1783924426'), true);
  });

  it('allows everything when robots.txt has no wildcard group', () => {
    assert.equal(allows('User-agent: Googlebot\nDisallow: /', '/anything'), true);
  });

  it('ignores comments', () => {
    assert.equal(allows('User-agent: *\n# Disallow: /\nDisallow: /admin', '/events'), true);
  });
});

describe('crawl-delay', () => {
  it('reads the wildcard group delay, not another agent-specific one', () => {
    // jegy.hu: bingbot is told 15s, everyone else 20s.
    const text = `User-agent: bingbot
Disallow: /ticket/
Crawl-delay: 15

User-agent: *
Disallow: /ticket/
Crawl-delay: 20`;
    assert.equal(parseRobots(text).crawlDelay, 20);
  });

  it('is null when the site asks for nothing', () => {
    assert.equal(parseRobots('User-agent: *\nDisallow: /admin').crawlDelay, null);
  });
});

/**
 * v1.68.0 — the other half of identifying honestly.
 *
 * Once the render path stops sending a bare browser user-agent and names us,
 * a site can address a robots.txt rule to HobbeastBot. Before this, only the
 * `User-agent: *` group was ever read, so such a rule would have been silently
 * ignored — we would have been asking to be told, then not listening.
 */
describe('a robots.txt group addressed to us', () => {
  it('wins outright over the wildcard group', () => {
    const text = `User-agent: *
Allow: /

User-agent: HobbeastBot
Disallow: /kalender`;
    assert.equal(allows(text, '/kalender/2026'), false, 'a rule naming us must bind');
    assert.equal(allows(text, '/programm'), true, 'and only where it says');
  });

  it('is matched case-insensitively and inside a longer token', () => {
    const text = `User-agent: *
Allow: /

User-agent: hobbeastbot/1.0
Disallow: /`;
    assert.equal(allows(text, '/anything'), false);
  });

  it('takes its Crawl-delay from the group naming us, not the wildcard one', () => {
    const text = `User-agent: *
Crawl-delay: 1

User-agent: HobbeastBot
Crawl-delay: 30`;
    assert.equal(parseRobots(text).crawlDelay, 30);
    assert.equal(parseRobots(text).matchedAgent, 'self');
  });

  it('falls back to the wildcard group when nothing names us', () => {
    const text = `User-agent: *
Disallow: /admin

User-agent: GPTBot
Disallow: /`;
    assert.equal(allows(text, '/admin/x'), false);
    assert.equal(allows(text, '/events'), true);
    assert.equal(parseRobots(text).matchedAgent, '*');
  });

  it('lets a site permit us specifically while banning everyone else', () => {
    const text = `User-agent: *
Disallow: /

User-agent: HobbeastBot
Allow: /`;
    assert.equal(allows(text, '/events'), true);
  });
});

describe('robots group boundaries', () => {
  it('treats consecutive User-agent lines as ONE group', () => {
    // eventfrog.at and orto-bar.com both write groups this way.
    const text = `User-agent: googlebot-image
User-agent: googlebot-mobile
Disallow: /images

User-agent: *
Disallow: /admin`;
    assert.equal(allows(text, '/images/x'), true, 'the image rule is not ours');
    assert.equal(allows(text, '/admin/x'), false, 'the wildcard rule is');
  });

  it('merges several wildcard groups instead of keeping only one', () => {
    // visitkoper.si really does this: one * group carries the Crawl-delay, a
    // later * group carries the Disallow list.
    const text = `User-agent: *
Crawl-delay: 5

User-agent: Bingbot
Disallow: /

User-agent: *
Disallow: /cart/
Disallow: /checkout/`;
    const parsed = parseRobots(text);
    assert.equal(parsed.crawlDelay, 5, 'the delay from the first * group survives');
    assert.equal(allows(text, '/cart/x'), false, 'and so do the later * rules');
    assert.equal(allows(text, '/en/events-list/'), true);
  });

  it('ignores directives written before any User-agent line', () => {
    const text = `Disallow: /
User-agent: *
Allow: /`;
    assert.equal(allows(text, '/events'), true);
  });
});
