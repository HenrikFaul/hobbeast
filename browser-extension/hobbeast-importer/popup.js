/**
 * Reads the page, shows what it found, and hands it to Hobbeast.
 *
 * It deliberately does NOT write to the database itself. The first version
 * signed in with an email and a password, which fails outright for an operator
 * whose Hobbeast account is a Google account — there is no password to give —
 * and it meant shipping an API key inside the extension folder. Handing the
 * text to the admin page instead solves both: the operator is already signed
 * in there, however they signed in, and the extension holds no key, no
 * account and no privilege of its own.
 *
 * The other rule this file follows: EVERY path ends on a visible screen with a
 * sentence explaining what happened. The version before this one started with
 * every section hidden and unhid one at the end, so a single thrown error left
 * an empty window that could not be told apart from an extension that had not
 * run at all.
 */
import { HOBBEAST_ORIGIN } from './config.js';

const $ = (id) => document.getElementById(id);
const statusLine = $('status');
const errorBox = $('error');

/** Exactly one screen visible — and always one visible. */
function show(name, statusText) {
  for (const section of document.querySelectorAll('[data-screen]')) {
    section.hidden = section.dataset.screen !== name;
  }
  if (statusText) statusLine.textContent = statusText;
}

function fail(message, detail) {
  errorBox.textContent = detail ? message + ' (' + detail + ')' : message;
  errorBox.hidden = false;
}

async function readActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('NO_TAB');
  if (!/^https:\/\/(www\.|m\.|web\.)?facebook\.com\//.test(tab.url || '')) {
    return { kind: 'other', url: tab.url || '', notFacebook: true };
  }
  const [injected] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content_script.js'],
  });
  if (!injected?.result) throw new Error('NO_RESULT');
  return injected.result;
}

/**
 * The hand-off travels in the URL FRAGMENT, which browsers never send to the
 * server — so the post text stays out of request logs on the way over.
 */
function handoffUrl(payload) {
  const json = JSON.stringify(payload);
  const base64 = btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-').replace(/\//g, '_');
  return HOBBEAST_ORIGIN + '/admin?tab=post-import#import=' + base64;
}

/**
 * An event page states its own date and place, so those are written into the
 * text as the labelled lines the parser on the other side already reads. A
 * post is simply its own text.
 */
function payloadFor(page) {
  if (page.kind === 'post') {
    return { text: page.text, url: page.url };
  }
  const lines = [page.title || ''];
  if (page.startsAt) {
    const at = new Date(page.startsAt);
    if (!Number.isNaN(at.getTime())) {
      const pad = (n) => String(n).padStart(2, '0');
      lines.push('Időpont: ' + at.getFullYear() + '.' + pad(at.getMonth() + 1) + '.'
        + pad(at.getDate()) + '. ' + pad(at.getHours()) + ':' + pad(at.getMinutes()));
    }
  }
  if (page.venue || page.city) {
    lines.push('Helyszín: ' + [page.venue, page.city].filter(Boolean).join(', '));
  }
  if (page.description) lines.push('', page.description);
  return { text: lines.filter((line) => line !== null).join('\n'), url: page.url };
}

let pending = null;

function preview(page) {
  pending = payloadFor(page);
  const isPost = page.kind === 'post';
  $('preview-kind').textContent = isPost ? 'Facebook bejegyzés' : 'Facebook esemény';
  $('preview-title').textContent = (page.title || page.publisher || '').trim() || '(cím nélkül)';
  $('preview-url').textContent = page.url;
  $('preview-text').textContent = pending.text.slice(0, 400) + (pending.text.length > 400 ? '…' : '');
  show('ready', isPost ? 'Bejegyzés beolvasva.' : 'Esemény beolvasva.');
}

async function start() {
  errorBox.hidden = true;
  show('boot', 'Oldal beolvasása…');

  const page = await readActiveTab();

  if (page.kind === 'other') {
    $('other-url').textContent = page.url ? 'Jelenlegi oldal: ' + page.url.slice(0, 70) : '';
    show('other', page.notFacebook ? 'Ez nem Facebook-oldal.' : 'Ez nem esemény és nem bejegyzés.');
    return;
  }

  if (page.kind === 'post' && !page.text) {
    $('other-url').textContent = 'Görgess rá a bejegyzésre, hogy betöltsön, és nyomd meg újra.';
    show('other', 'Nem találtam szöveget a bejegyzésben.');
    return;
  }

  preview(page);
}

$('open').addEventListener('click', async () => {
  if (!pending) return;
  try {
    await chrome.tabs.create({ url: handoffUrl(pending) });
    show('sent', 'Átadva a Hobbeastnek.');
  } catch (error) {
    fail('Nem sikerült megnyitni a Hobbeastet.', String(error.message || '').slice(0, 80));
  }
});

$('retry').addEventListener('click', () => {
  void start();
});

// The last line of defence: whatever goes wrong, the operator gets a sentence
// rather than an empty window.
start().catch((error) => {
  $('other-url').textContent = '';
  show('other', 'Nem sikerült beolvasni az oldalt.');
  fail(
    error.message === 'NO_RESULT' ? 'A beolvasás nem adott vissza semmit — töltsd újra az oldalt.'
      : error.message === 'NO_TAB' ? 'Nem találom az aktív lapot.'
        : 'Váratlan hiba.',
    String(error.message || '').slice(0, 80),
  );
});
