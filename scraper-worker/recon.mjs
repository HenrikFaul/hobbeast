// Deep per-site recon: renders each problem site with Playwright while sniffing
// the network for hidden JSON/event APIs (the SearchForge approach), scrolls to
// trigger lazy loading, then records what the rendered DOM actually contains.
// Output: recon-results.jsonl — one line per site with everything needed to
// decide the right extraction method.
// Run: node recon.mjs

import { chromium } from 'playwright';
import { writeFileSync, appendFileSync } from 'node:fs';

const SITES = [
  ['telekomspots', 'https://telekomspots.hu/'],
  ['welovebudapest_en', 'https://welovebudapest.com/en/events/'],
  ['ra_co', 'https://ra.co/events/hu/budapest'],
  ['todayinbudapest', 'https://todayinbudapest.com/hu'],
  ['budapestinfo', 'https://www.budapestinfo.hu/en/events-calendar'],
  ['fluxarcgames', 'https://fluxarcgames.com/'],
  ['budapest_com', 'https://www.budapest.com/en/events/map'],
  ['songkick', 'https://www.songkick.com/metro-areas/29047-hungary-budapest'],
  ['eventim', 'https://www.eventim.hu/en/city/budapest-7684/'],
  ['budapestbylocals', 'https://www.budapestbylocals.com/budapest-events/'],
  ['bandsintown', 'https://www.bandsintown.com/c/budapest-hungary'],
  ['tentimes', 'https://10times.com/budapest-hu'],
  ['eventland', 'https://eventland.eu/budapest/events/'],
  ['amcham', 'https://www.amcham.hu/events/upcoming-events'],
  ['erasmuslife', 'https://erasmuslifebudapest.com/events'],
  ['myguidebudapest', 'https://www.myguidebudapest.com/events'],
  ['futanet', 'https://www.futanet.hu/'],
  ['budappest', 'https://budappest.com/budapest-events/'],
];

const OUT = 'recon-results.jsonl';
const EVENT_HINT = /(event|esemeny|program|koncert|spot|calendar|listing|graphql|api)/i;

function summarizeJson(text) {
  try {
    const v = JSON.parse(text);
    const walk = (x, d = 0) => {
      if (d > 2 || x === null) return typeof x;
      if (Array.isArray(x)) return [`array(${x.length})`, x.length ? walk(x[0], d + 1) : null];
      if (typeof x === 'object') return Object.fromEntries(Object.entries(x).slice(0, 12).map(([k, val]) => [k, walk(val, d + 1)]));
      return typeof x === 'string' ? x.slice(0, 40) : x;
    };
    return walk(v);
  } catch { return null; }
}

async function recon(browser, name, url) {
  const row = { name, url, apis: [] };
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
    ignoreHTTPSErrors: true,
    viewport: { width: 1366, height: 900 },
  });
  const seen = new Set();
  page.on('response', async (res) => {
    try {
      const ct = res.headers()['content-type'] || '';
      const rurl = res.url();
      if (!/json|graphql/i.test(ct) && !/\.json(\?|$)/.test(rurl)) return;
      if (!EVENT_HINT.test(rurl)) return;
      const key = rurl.split('?')[0];
      if (seen.has(key) || row.apis.length >= 12) return;
      seen.add(key);
      const body = await res.text().catch(() => '');
      if (body.length < 50) return;
      row.apis.push({
        url: rurl.slice(0, 220),
        status: res.status(),
        bytes: body.length,
        shape: summarizeJson(body.slice(0, 60000)),
      });
    } catch { /* ignore */ }
  });

  try {
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(async (e) => {
      if (/Timeout/i.test(String(e.message))) return page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      throw e;
    });
    row.status = resp ? resp.status() : null;
    // Dismiss likely cookie banners so lazy content loads.
    for (const sel of ['#onetrust-accept-btn-handler', 'button:has-text("Elfogad")', 'button:has-text("Accept")', '[data-testid="uc-accept-all-button"]', '.cc-allow']) {
      await page.locator(sel).first().click({ timeout: 1500 }).catch(() => {});
    }
    for (let i = 0; i < 3; i += 1) {
      await page.mouse.wheel(0, 2200);
      await page.waitForTimeout(1500);
    }
    const dom = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a[href]')].map((a) => a.href);
      const host = location.host.replace(/^www\./, '');
      const same = links.filter((h) => { try { return new URL(h).host.replace(/^www\./, '') === host; } catch { return false; } });
      const jsonld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => {
        try { const p = JSON.parse(s.textContent); const arr = Array.isArray(p) ? p : (p['@graph'] || [p]); return arr.map((x) => x['@type']).flat(); } catch { return ['parse_error']; }
      }).flat();
      const counts = {};
      for (const h of same) {
        try {
          const seg = new URL(h).pathname.split('/').filter(Boolean)[0] || '(root)';
          counts[seg] = (counts[seg] || 0) + 1;
        } catch { /* ignore */ }
      }
      return {
        totalLinks: links.length,
        sameHost: same.length,
        topPathSegments: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10),
        jsonldTypes: [...new Set(jsonld)].slice(0, 10),
        bodyChars: document.body ? document.body.innerText.length : 0,
        sampleLinks: same.filter((h) => /(event|esemeny|program|koncert|spot)/i.test(h)).slice(0, 6),
      };
    });
    row.dom = dom;
  } catch (e) {
    row.error = String(e.message || e).slice(0, 140);
  } finally {
    await page.close().catch(() => {});
  }
  return row;
}

async function main() {
  writeFileSync(OUT, '');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    for (const [name, url] of SITES) {
      console.log('recon:', name);
      const row = await recon(browser, name, url);
      appendFileSync(OUT, JSON.stringify(row) + '\n');
    }
  } finally {
    await browser.close();
  }
  console.log('DONE');
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
