import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

/**
 * The review step.
 *
 * Nothing reaches Hobbeast without passing through this form: the content
 * script reports what the page says, the operator corrects it, and only then
 * is anything written. The write goes through admin_create_external_event,
 * which checks the signed-in operator's own `providers.manage` capability — so
 * the extension holds no privilege of its own.
 */

const els = {
  sourceNote: document.getElementById('source-note'),
  setup: document.getElementById('setup'),
  setupError: document.getElementById('setup-error'),
  email: document.getElementById('email'),
  password: document.getElementById('password'),
  signIn: document.getElementById('sign-in'),
  form: document.getElementById('form'),
  title: document.getElementById('title'),
  date: document.getElementById('date'),
  time: document.getElementById('time'),
  url: document.getElementById('url'),
  city: document.getElementById('city'),
  venue: document.getElementById('venue'),
  description: document.getElementById('description'),
  warning: document.getElementById('warning'),
  save: document.getElementById('save'),
  error: document.getElementById('error'),
  notAnEvent: document.getElementById('not-an-event'),
};

const CONFIDENCE_NOTE = {
  jsonld: 'Az oldal saját, gépi olvasásra szánt adatai.',
  opengraph: 'A megosztási adatokból — a dátumot mindenképp ellenőrizd.',
  dom: 'Csak a látható szövegből. Nézz át mindent.',
};

async function loadSession() {
  const { session } = await chrome.storage.local.get('session');
  return session || null;
}

async function saveSession(session) {
  await chrome.storage.local.set({ session });
}

async function signIn(email, password) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error('SIGN_IN_FAILED');
  return response.json();
}

async function refresh(session) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!response.ok) return null;
  const next = await response.json();
  await saveSession(next);
  return next;
}

async function callRpc(name, body, session) {
  const send = (token) => fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  let response = await send(session.access_token);
  if (response.status === 401) {
    const renewed = await refresh(session);
    if (!renewed) throw new Error('SESSION_EXPIRED');
    response = await send(renewed.access_token);
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `HTTP ${response.status}`);
  }
  return response.json();
}

/** Splits an ISO timestamp into the two fields the form uses. */
function splitTimestamp(value) {
  if (!value) return { date: '', time: '' };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { date: '', time: '' };
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`,
    time: `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`,
  };
}

async function readActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/facebook\.com\/events\//.test(tab.url || '')) return null;
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content_script.js'],
  });
  return result?.result || null;
}

function fillForm(draft) {
  const { date, time } = splitTimestamp(draft.startsAt);
  els.title.value = draft.title || '';
  els.date.value = date;
  els.time.value = time;
  els.url.value = draft.url || '';
  els.city.value = draft.city || '';
  els.venue.value = draft.venue || '';
  els.description.value = draft.description || '';

  const notes = [CONFIDENCE_NOTE[draft.confidence] || ''];
  if (!date && draft.dateText) notes.push(`A látható dátumsor: „${draft.dateText}" — add meg kézzel.`);
  else if (!date) notes.push('Nem találtam dátumot — add meg kézzel.');
  els.warning.textContent = notes.filter(Boolean).join(' ');
  els.warning.hidden = !els.warning.textContent;
  els.sourceNote.textContent = draft.title ? 'Ellenőrizd, aztán mentheted.' : 'Nem sikerült címet olvasni.';
}

async function start() {
  const session = await loadSession();
  if (!session?.access_token) {
    els.setup.hidden = false;
    els.sourceNote.textContent = 'Előbb jelentkezz be.';
    return;
  }

  const draft = await readActiveTab();
  if (!draft) {
    els.notAnEvent.hidden = false;
    els.sourceNote.textContent = 'Ez nem esemény oldal.';
    return;
  }
  fillForm(draft);
  els.form.hidden = false;
}

els.signIn.addEventListener('click', async () => {
  els.setupError.hidden = true;
  els.signIn.disabled = true;
  try {
    const session = await signIn(els.email.value.trim(), els.password.value);
    await saveSession(session);
    // The password is never stored; only the session Supabase handed back.
    els.password.value = '';
    els.setup.hidden = true;
    await start();
  } catch {
    els.setupError.textContent = 'A bejelentkezés nem sikerült.';
    els.setupError.hidden = false;
  } finally {
    els.signIn.disabled = false;
  }
});

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  els.error.hidden = true;
  els.save.disabled = true;
  try {
    const session = await loadSession();
    await callRpc('admin_create_external_event', {
      p_title: els.title.value.trim(),
      p_event_date: els.date.value,
      p_event_time: els.time.value || null,
      p_external_url: els.url.value.trim(),
      p_city: els.city.value.trim() || null,
      p_venue: els.venue.value.trim() || null,
      p_description: els.description.value.trim() || null,
      p_source_note: 'Facebook esemény, kézzel ellenőrizve',
    }, session);
    els.save.textContent = 'Sikeresen importálva!';
    els.save.classList.add('done');
  } catch (error) {
    const detail = String(error.message || '');
    els.error.textContent = detail.includes('HTTPS_URL_REQUIRED')
      ? 'https:// kezdetű hivatkozás kell.'
      : detail.includes('DATE_IN_PAST')
        ? 'A dátum már elmúlt.'
        : detail.includes('CAPABILITY_REQUIRED')
          ? 'Ehhez a fiókodnak providers.manage jogosultság kell.'
          : 'A mentés nem sikerült.';
    els.error.hidden = false;
    els.save.disabled = false;
  }
});

void start();
