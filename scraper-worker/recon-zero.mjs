// Deep recon for sources that run but extract 0 events.
// Renders each listing with Playwright and reports what the page ACTUALLY holds:
// event-ish links, structured data, and — crucially — whether the listing itself
// carries date+title pairs (the pattern our detail-page-only pipeline misses).
// Run: node recon-zero.mjs

import { chromium } from 'playwright';

const SITES = [
  ['programturizmus-bp', 'https://www.programturizmus.hu/telepules-budapest-fovaros.html'],
  ['programturizmus-naptar', 'https://www.programturizmus.hu/naptar-2026.html'],
  ['koncert-hu-lista', 'https://www.koncert.hu/lista/koncertek'],
  ['budapest-hu-kultura', 'https://budapest.hu/kultura-es-orokseg/kultura'],
  ['szegedvaros', 'https://www.szegedvaros.hu/esemeny-naptar'],
  ['debrecen', 'https://www.debrecen.hu/hu/turista/rendezvenyek/'],
  ['bekescsaba', 'https://bekescsaba.hu'],
  ['belvaros', 'https://belvaros-lipotvaros.hu'],
  ['bortarsasag', 'https://bortarsasag.hu/hu/esemenyek'],
  ['boardgamecafe', 'https://boardgamecafe.hu/esemenyek'],
];

// Hungarian + numeric date patterns as they appear in listing markup.
const HU_MONTH = '(janu[aá]r|febru[aá]r|m[aá]rcius|[aá]prilis|m[aá]jus|j[uú]nius|j[uú]lius|augusztus|szeptember|okt[oó]ber|november|december|jan|feb|m[aá]rc|[aá]pr|m[aá]j|j[uú]n|j[uú]l|aug|szept|okt|nov|dec)';
const DATE_RES = [
  new RegExp(`20\\d{2}[.\\-/ ]\\s?\\d{1,2}[.\\-/ ]\\s?\\d{1,2}`, 'gi'),
  new RegExp(`20\\d{2}\\.?\\s*${HU_MONTH}\\.?\\s*\\d{1,2}`, 'gi'),
  new RegExp(`${HU_MONTH}\\.?\\s*\\d{1,2}\\.?`, 'gi'),
];

async function recon(browser, name, url) {
  const row = { name, url };
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
    ignoreHTTPSErrors: true,
    viewport: { width: 1366, height: 900 },
  });
  try {
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
      .catch(() => page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }));
    row.status = res ? res.status() : null;
    for (const sel of ['#onetrust-accept-btn-handler', 'button:has-text("Elfogad")', 'button:has-text("Accept")', '.cc-allow', '#cookie-accept']) {
      await page.locator(sel).first().click({ timeout: 1200 }).catch(() => {});
    }
    await page.mouse.wheel(0, 2500);
    await page.waitForTimeout(1500);

    const html = await page.content();
    row.jsonldTypes = [...new Set([...html.matchAll(/"@type"\s*:\s*"([A-Za-z]+)"/g)].map((m) => m[1]))].slice(0, 8);

    // What do repeating list items look like, and do they carry a date + a link?
    row.listing = await page.evaluate(() => {
      const host = location.host.replace(/^www\./, '');
      const sameHost = (href) => { try { return new URL(href, location.href).host.replace(/^www\./, '') === host; } catch { return false; } };
      // Find containers that repeat and contain both a link and a date-looking text.
      const candidates = [...document.querySelectorAll('article, li, .card, [class*="event"], [class*="program"], [class*="item"], [class*="rendezveny"]')];
      const withLinkAndText = candidates.filter((el) => el.querySelector('a[href]') && el.innerText && el.innerText.trim().length > 15);
      const sample = withLinkAndText.slice(0, 6).map((el) => ({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 60),
        text: el.innerText.replace(/\s+/g, ' ').trim().slice(0, 130),
        href: (() => { const a = el.querySelector('a[href]'); return a && sameHost(a.href) ? a.href.slice(0, 110) : null; })(),
      }));
      return { repeatingBlocks: withLinkAndText.length, sample };
    });

    const text = await page.evaluate(() => document.body?.innerText || '');
    row.dateHitsInText = DATE_RES.reduce((n, re) => n + (text.match(re) || []).length, 0);
    row.textChars = text.length;
  } catch (e) {
    row.error = String(e.message || e).slice(0, 110);
  } finally {
    await page.close().catch(() => {});
  }
  return row;
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-http2'] });
  try {
    for (const [name, url] of SITES) {
      const r = await recon(browser, name, url);
      console.log(`\n=== ${r.name}  [HTTP ${r.status ?? '?'}]${r.error ? '  ERROR: ' + r.error : ''}`);
      if (r.error) continue;
      console.log(`    jsonld: ${r.jsonldTypes?.join(',') || 'NINCS'} | datum-talalat a szovegben: ${r.dateHitsInText} | szoveg: ${r.textChars} kar.`);
      console.log(`    ismetlodo blokkok linkkel: ${r.listing?.repeatingBlocks}`);
      for (const s of (r.listing?.sample || []).slice(0, 3)) {
        console.log(`      <${s.tag} class="${s.cls}">`);
        console.log(`         text: ${s.text}`);
        console.log(`         href: ${s.href || '(nem same-host)'}`);
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
