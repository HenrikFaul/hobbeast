import { decodeHtmlEntities } from './text.ts';

function readAttributes(raw: string) {
  const attributes = new Map<string, string>();
  const pattern = /([:\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    attributes.set(match[1].toLowerCase(), decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? ''));
  }
  return attributes;
}

export function discoverHtmlFeedUrls(html: string, pageUrl: string, maxLinks = 20) {
  const urls: string[] = [];
  const linkPattern = /<link\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while (urls.length < maxLinks && (match = linkPattern.exec(html)) !== null) {
    const attributes = readAttributes(match[1]);
    const rel = (attributes.get('rel') ?? '').toLowerCase().split(/\s+/);
    const type = (attributes.get('type') ?? '').toLowerCase().split(';', 1)[0].trim();
    if (!rel.includes('alternate') || ![
      'application/rss+xml',
      'application/atom+xml',
      'application/feed+json',
    ].includes(type)) continue;
    const href = attributes.get('href');
    if (!href) continue;
    try {
      const url = new URL(href, pageUrl);
      if ((url.protocol === 'https:' || url.protocol === 'http:') && !urls.includes(url.toString())) urls.push(url.toString());
    } catch {
      // Invalid discovery links are ignored and never handed to the fetch layer.
    }
  }
  return urls;
}
