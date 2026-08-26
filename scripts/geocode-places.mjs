// Drains the public.geo_places queue: turns the venue strings that arrive with
// scraped programs ("A38", "Dürer Kert", "Budapest - Átrium") into coordinates,
// so the map can pin a program at its actual door instead of the city centre.
//
// Two providers, in order: Nominatim (authoritative, strict) then Photon
// (fuzzy, good at POI names). Photon's fuzziness is the reason for the name
// gate below — asked for "Dürer Kert" it happily answers "ELTE Fűvészkert",
// and a confidently wrong pin is worse than no pin at all.
//
// Usage:
//   node scripts/geocode-places.mjs --limit 150          # DB mode (service role)
//   node scripts/geocode-places.mjs --file in.json --out out.json   # offline mode
//
// DB mode needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Offline mode reads
// [{place_key, raw_name, city_hint}] and writes the resolutions as JSON, for
// environments that must not hold a service-role key.

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const flag = (name, dflt = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const LIMIT = Number(flag('--limit', '150')) || 150;
const IN_FILE = flag('--file');
const OUT_FILE = flag('--out');
const CONTACT = 'https://expericentre.com';
const UA = `HobbeastGeocoder/1.0 (+${CONTACT})`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- normalisation ---------------------------------------------------------

const ACCENTS = { á: 'a', é: 'e', í: 'i', ó: 'o', ö: 'o', ő: 'o', ú: 'u', ü: 'u', ű: 'u' };

export function fold(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[áéíóöőúüű]/g, (c) => ACCENTS[c] || c)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}

// Words that carry no identifying power on their own. A venue string made up
// only of these ("Koncertterem", "Tetőterasz", "Országos") is not geocodable and
// is marked unresolvable instead of being guessed at.
const GENERIC = new Set([
  // places / admin
  'budapest', 'orszagos', 'magyarorszag', 'hungary', 'online', 'stream',
  'helyszin', 'helyszinen', 'tobb', 'telepulesen', 'multiple', 'locations',
  // room and building words: they describe a KIND of place, never which one
  'terem', 'nagyterem', 'kisterem', 'koncertterem', 'terasz', 'tetoterasz',
  'orrterasz', 'szinpad', 'udvar', 'udvara', 'kert', 'garden', 'park',
  'haz', 'haza', 'kozpont', 'kozponti', 'kozossegi', 'muvelodesi', 'kulturalis',
  'muzeum', 'muzeuma', 'szinhaz', 'mozi', 'konyvtar', 'konyvtara', 'galeria',
  'klub', 'club', 'bar', 'pub', 'cafe', 'kavezo', 'presszo', 'etterem',
  'hotel', 'panzio', 'csarnok', 'arena', 'stadion', 'sportcsarnok', 'uszoda',
  'palota', 'kastely', 'var', 'vara', 'templom', 'iskola', 'egyetem', 'studio',
  'hall', 'center', 'centre', 'rendezvenykozpont', 'muhely', 'amfiteatrum',
  'szabadter', 'szabadteri', 'utca', 'ut', 'ter', 'tere', 'korut', 'krt',
  'sugarut', 'setany', 'rakpart', 'a', 'az', 'the', 'of', 'and', 'es',
]);

export function distinctiveTokens(name) {
  return fold(name).split(' ').filter((t) => t && !GENERIC.has(t) && (t.length >= 3 || /\d/.test(t)));
}

// Accepts a geocoder hit only when its name really is the place we asked for.
//
// Live failures this gate exists for: Photon answered "ELTE Fűvészkert" for
// "Dürer Kert", "Országos Színháztörténeti Múzeum" for "Ferenczy Múzeum" and
// "Vénusz Garden" for "Bridge Garden" — every one of them shares only the
// building-type word. So type words carry no weight, and at least 60% of the
// identifying words have to turn up in the answer.
export function nameMatches(query, candidateName, candidateContext = '') {
  const q = fold(query);
  const name = fold(candidateName);
  if (!q || !name) return false;
  // The very same name, spelled the same way.
  if (q.length >= 4 && name.includes(q)) return true;

  const wanted = distinctiveTokens(query);
  if (!wanted.length) return false;
  // The street and city around the hit count too: "Gyöngyös-Mátra Művelődési
  // Központ" is legitimately answered by "Mátra Művelődési Központ, Gyöngyös".
  const words = new Set(fold(`${candidateName} ${candidateContext}`).split(' '));
  const hits = wanted.filter((token) => words.has(token));
  return hits.length / wanted.length >= 0.6;
}

// Budapest postal codes are 1XYZ where XY is the district number (01..23).
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII',
  'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII'];

export function districtFromPostcode(postcode) {
  const m = String(postcode ?? '').match(/^1(\d{2})\d$/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 23 ? ROMAN[n] : null;
}

export function districtFromText(text) {
  const t = String(text ?? '');
  const roman = t.match(/\b(I{1,3}|IV|V|VI{1,3}|IX|X|XI{1,3}|XIV|XV|XVI{1,3}|XIX|XX|XXI{1,2}I?)\.?\s*ker/i);
  if (roman) {
    const found = ROMAN.indexOf(roman[1].toUpperCase());
    if (found > 0) return ROMAN[found];
  }
  const arabic = t.match(/\b(\d{1,2})\.?\s*ker/i);
  if (arabic) {
    const n = Number(arabic[1]);
    if (n >= 1 && n <= 23) return ROMAN[n];
  }
  return null;
}

// --- providers -------------------------------------------------------------

async function getJson(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function nominatim(query) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '3');
  const rows = await getJson(url);
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    provider: 'nominatim',
    name: r.name || r.display_name?.split(',')[0] || '',
    display: r.display_name || '',
    lat: Number(r.lat), lon: Number(r.lon),
    city: r.address?.city || r.address?.town || r.address?.village || r.address?.municipality || null,
    county: r.address?.county || null,
    postcode: r.address?.postcode || null,
    districtText: r.address?.borough || r.address?.city_district || r.address?.suburb || null,
  }));
}

async function photon(query) {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '3');
  url.searchParams.set('lat', '47.4979');
  url.searchParams.set('lon', '19.0402');
  const body = await getJson(url);
  return (body?.features ?? []).map((f) => ({
    provider: 'photon',
    name: f.properties?.name || '',
    display: [f.properties?.name, f.properties?.street, f.properties?.city].filter(Boolean).join(', '),
    lat: Number(f.geometry?.coordinates?.[1]), lon: Number(f.geometry?.coordinates?.[0]),
    city: f.properties?.city || null,
    county: f.properties?.county || null,
    postcode: f.properties?.postcode || null,
    districtText: f.properties?.district || null,
    countrycode: f.properties?.countrycode || null,
  }));
}

// --- resolution ------------------------------------------------------------

const HU_BOX = { minLat: 45.5, maxLat: 48.9, minLon: 16.0, maxLon: 23.1 };
const inHungary = (hit) => Number.isFinite(hit.lat) && Number.isFinite(hit.lon)
  && hit.lat >= HU_BOX.minLat && hit.lat <= HU_BOX.maxLat
  && hit.lon >= HU_BOX.minLon && hit.lon <= HU_BOX.maxLon;

export function splitCityPrefix(rawName, knownCities) {
  const parts = decodeEntities(rawName).split(/\s+[-–—]\s+/);
  if (parts.length >= 2 && knownCities.has(fold(parts[0]))) {
    return { city: parts[0].trim(), name: parts.slice(1).join(' - ').trim() };
  }
  return { city: null, name: decodeEntities(rawName) };
}

export async function resolvePlace(place, knownCities, deps = {}) {
  const providers = deps.providers ?? [nominatim, photon];
  const wait = deps.sleep ?? sleep;
  const { city: prefixCity, name } = splitCityPrefix(place.raw_name, knownCities);
  const city = prefixCity || place.city_hint || null;

  if (!distinctiveTokens(name).length) {
    return { place_key: place.place_key, geo_precision: 'unresolvable', last_error: 'generic name' };
  }

  const queries = [
    city ? `${name}, ${city}, Magyarország` : `${name}, Magyarország`,
    city && fold(city) !== 'budapest' ? `${name}, ${city}` : null,
    `${name}, Budapest, Magyarország`,
  ].filter(Boolean);

  for (const provider of providers) {
    for (const query of queries) {
      let hits = [];
      try {
        hits = await provider(query);
      } catch (error) {
        await wait(1200);
        continue;
      }
      await wait(1200);
      const hit = hits.find((h) => inHungary(h) && nameMatches(name, h.name || h.display, h.display));
      if (!hit) continue;
      const district = districtFromPostcode(hit.postcode)
        || districtFromText(hit.districtText)
        || districtFromText(hit.display);
      return {
        place_key: place.place_key,
        lat: hit.lat, lon: hit.lon,
        city: hit.city || city || null,
        county: hit.county || null,
        district: district || null,
        postcode: hit.postcode || null,
        geo_precision: 'exact',
        provider: hit.provider,
        matched_name: (hit.name || hit.display || '').slice(0, 160),
      };
    }
  }

  // No verified hit — but the raw text may still name a district, which beats
  // dropping the program onto the city centroid.
  const districtOnly = districtFromText(place.raw_name) || districtFromText(place.city_hint);
  if (districtOnly) {
    return { place_key: place.place_key, district: districtOnly, geo_precision: 'district', provider: 'text' };
  }
  return { place_key: place.place_key, geo_precision: 'unresolvable', last_error: 'no verified match' };
}

// --- runners ---------------------------------------------------------------

async function restGet(base, key, path) {
  const res = await fetch(`${base}/rest/v1/${path}`, {
    headers: { apikey: key, authorization: `Bearer ${key}`, accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`${path} ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

async function restRpc(base, key, fn, body) {
  const res = await fetch(`${base}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${fn} ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

async function main() {
  if (IN_FILE) {
    const input = JSON.parse(readFileSync(IN_FILE, 'utf8'));
    const knownCities = new Set((input.cities ?? []).map(fold));
    const out = [];
    for (const place of (input.places ?? []).slice(0, LIMIT)) {
      const result = await resolvePlace(place, knownCities);
      out.push(result);
      console.log(`${result.geo_precision.padEnd(12)} ${place.raw_name} -> ${result.matched_name ?? result.district ?? '-'}`);
    }
    writeFileSync(OUT_FILE || 'geocode-results.json', JSON.stringify(out, null, 0));
    console.log(`DONE: ${out.length} places, ${out.filter((r) => r.geo_precision === 'exact').length} exact`);
    return;
  }

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required (or use --file)');

  // Newly collected programs bring venue strings nobody has resolved yet.
  const enqueued = await restRpc(base, key, 'enqueue_missing_geo_places', {});
  console.log(`queued ${enqueued} new place(s)`);

  const cities = await restGet(base, key, 'hu_settlements?select=display_name');
  const knownCities = new Set(cities.map((c) => fold(c.display_name)));
  const places = await restGet(
    base, key,
    `geo_places?select=place_key,raw_name,city_hint&lat=is.null&geo_precision=eq.pending&attempts=lt.3&order=created_at.asc&limit=${LIMIT}`,
  );
  console.log(`pending places: ${places.length}`);

  let exact = 0;
  for (const place of places) {
    const result = await resolvePlace(place, knownCities);
    if (result.geo_precision === 'exact') exact += 1;
    await restRpc(base, key, 'resolve_geo_place', {
      p_place_key: result.place_key,
      p_lat: result.lat ?? null,
      p_lon: result.lon ?? null,
      p_city: result.city ?? null,
      p_county: result.county ?? null,
      p_district: result.district ?? null,
      p_postcode: result.postcode ?? null,
      p_precision: result.geo_precision,
      p_provider: result.provider ?? null,
      p_matched_name: result.matched_name ?? null,
      p_error: result.last_error ?? null,
    });
    console.log(`${result.geo_precision.padEnd(12)} ${place.raw_name}`);
  }
  console.log(`DONE: ${places.length} places, ${exact} exact`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  main().catch((error) => { console.error('FATAL', error); process.exit(1); });
}
