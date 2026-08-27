/**
 * The review step, and the only place this extension shows its work.
 *
 * Design rule learned the hard way: EVERY path ends on a visible screen with a
 * sentence explaining what happened. The first version started with every
 * section hidden and unhid one only at the end, so a single thrown error left
 * the operator staring at an empty window with no way to tell whether the
 * extension had even run. show() and the top-level catch exist to make that
 * impossible.
 *
 * Nothing reaches Hobbeast without passing through the form: the content
 * script reports what the page says, the operator corrects it, and the write
 * runs as their own account through admin_create_external_event, which checks
 * their providers.manage capability. The extension holds no privilege of its
 * own.
 */
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { parseSocialPost } from './vendor/socialPostParser.js';

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

const SOURCE_NOTE = {
  jsonld: 'Az esemény saját, gépi olvasásra szánt adataiból.',
  opengraph: 'A megosztási adatokból — a dátumot mindenképp ellenőrizd.',
  dom: 'Csak a látható szövegből. Nézz át mindent.',
  'post-text': 'A bejegyzés szövegéből kiolvasva — nézd át.',
};

async function loadSession() {
  const { session } = await chrome.storage.local.get('session');
  return session?.access_token ? session : null;
}

async function authRequest(grant, body) {
  const response = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=' + grant, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify(body),
  });
  if (!response.ok) return null;
  return response.json();
}

async function callRpc(name, body, session) {
  const send = (token) => fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY,
      authorization: 'Bearer ' + token,
    },
    body: JSON.stringify(body),
  });

  let response = await send(session.access_token);
  if (response.status === 401) {
    const renewed = await authRequest('refresh_token', { refresh_token: session.refresh_token });
    if (!renewed) {
      await chrome.storage.local.remove('session');
      throw new Error('SESSION_EXPIRED');
    }
    await chrome.storage.local.set({ session: renewed });
    response = await send(renewed.access_token);
  }
  if (!response.ok) throw new Error((await response.text()) || ('HTTP ' + response.status));
  return response.json();
}

function splitTimestamp(value) {
  if (!value) return { date: '', time: '' };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { date: '', time: '' };
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: parsed.getFullYear() + '-' + pad(parsed.getMonth() + 1) + '-' + pad(parsed.getDate()),
    time: pad(parsed.getHours()) + ':' + pad(parsed.getMinutes()),
  };
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

/** A post is just text, and the app's own parser already reads that text. */
function draftFromPost(page) {
  if (!page.text) return null;
  const parsed = parseSocialPost(page.text);
  return {
    title: parsed.title || page.publisher || '',
    date: parsed.eventDate || '',
    time: parsed.eventTime || '',
    url: parsed.url || page.url,
    city: parsed.city || '',
    venue: parsed.venue || '',
    description: parsed.description || page.text,
    source: 'post-text',
  };
}

function draftFromEvent(page) {
  const { date, time } = splitTimestamp(page.startsAt);
  return {
    title: page.title || '',
    date,
    time,
    url: page.url,
    city: page.city || '',
    venue: page.venue || '',
    description: page.description || '',
    source: page.source,
  };
}

function fillForm(draft, kindLabel) {
  $('title').value = draft.title;
  $('date').value = draft.date;
  $('time').value = draft.time;
  $('url').value = draft.url;
  $('city').value = draft.city;
  $('venue').value = draft.venue;
  $('description').value = draft.description;

  const notes = [SOURCE_NOTE[draft.source] || ''];
  if (!draft.date) notes.push('Dátumot nem találtam — add meg kézzel.');
  $('reading').textContent = notes.filter(Boolean).join(' ');
  show('form', kindLabel + ' beolvasva — ellenőrizd.');
}

async function start() {
  errorBox.hidden = true;

  if (!(await loadSession())) {
    show('signin', 'Előbb jelentkezz be.');
    return;
  }

  show('boot', 'Oldal beolvasása…');
  const page = await readActiveTab();

  if (page.kind === 'other') {
    $('other-url').textContent = page.url ? 'Jelenlegi oldal: ' + page.url.slice(0, 70) : '';
    show('other', page.notFacebook ? 'Ez nem Facebook-oldal.' : 'Ez nem esemény és nem bejegyzés.');
    return;
  }

  if (page.kind === 'post') {
    const draft = draftFromPost(page);
    if (!draft) {
      $('other-url').textContent = 'Görgess rá a bejegyzésre, hogy betöltsön, és nyomd meg újra.';
      show('other', 'Nem találtam szöveget a bejegyzésben.');
      return;
    }
    fillForm(draft, 'Bejegyzés');
    return;
  }

  fillForm(draftFromEvent(page), 'Esemény');
}

$('sign-in').addEventListener('click', async () => {
  errorBox.hidden = true;
  $('sign-in').disabled = true;
  try {
    const session = await authRequest('password', {
      email: $('email').value.trim(),
      password: $('password').value,
    });
    if (!session?.access_token) {
      fail('A bejelentkezés nem sikerült.');
      return;
    }
    await chrome.storage.local.set({ session });
    // The password is never stored; only the session Supabase handed back.
    $('password').value = '';
    await start();
  } catch (error) {
    fail('A bejelentkezés nem sikerült.', error.message);
  } finally {
    $('sign-in').disabled = false;
  }
});

$('form').addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  $('save').disabled = true;
  statusLine.textContent = 'Mentés…';
  try {
    const session = await loadSession();
    if (!session) {
      show('signin', 'Lejárt a munkamenet — jelentkezz be újra.');
      return;
    }
    await callRpc('admin_create_external_event', {
      p_title: $('title').value.trim(),
      p_event_date: $('date').value,
      p_event_time: $('time').value || null,
      p_external_url: $('url').value.trim(),
      p_city: $('city').value.trim() || null,
      p_venue: $('venue').value.trim() || null,
      p_description: $('description').value.trim() || null,
      p_source_note: 'Facebookról, kézzel ellenőrizve',
    }, session);

    $('done-title').textContent = $('title').value.trim();
    show('done', 'Kész.');
    // A mark on the icon, so the result is still visible after this closes.
    void chrome.action.setBadgeText({ text: 'OK' });
    void chrome.action.setBadgeBackgroundColor({ color: '#183124' });
  } catch (error) {
    const detail = String(error.message || '');
    fail(
      detail.includes('CAPABILITY_REQUIRED') ? 'Ehhez a fiókodnak providers.manage jogosultság kell.'
        : detail.includes('DATE_IN_PAST') ? 'A dátum már elmúlt.'
          : detail.includes('HTTPS_URL_REQUIRED') ? 'https:// kezdetű hivatkozás kell.'
            : detail.includes('SESSION_EXPIRED') ? 'Lejárt a munkamenet — jelentkezz be újra.'
              : 'A mentés nem sikerült.',
      detail.slice(0, 80),
    );
    statusLine.textContent = 'A mentés nem sikerült.';
    $('save').disabled = false;
  }
});

$('again').addEventListener('click', () => {
  void chrome.action.setBadgeText({ text: '' });
  $('save').disabled = false;
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
